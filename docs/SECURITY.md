# CNX security posture

Last reviewed 11 October 2026 (audit + fixes before the governor
demonstration). Each control lists where it lives and how it is checked.

## What an attacker could want, and what stops them

| Threat | Control | Where | Checked by |
|---|---|---|---|
| Run script in an official's browser (XSS) | No HTML sinks in code; per-request **nonce CSP** with `strict-dynamic` — a script without this request's nonce cannot run; `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'` | `src/middleware.ts`, `src/lib/security-policy.ts` | `security-policy.test.ts`; production bundle served locally: 9/9 scripts nonce-stamped, map, satellite+terrain, forecast overlay, Windy iframe, MQTT shuttle all working with zero CSP violations (11 Oct) |
| Frame the board inside a phishing page | `frame-ancestors 'none'` + `X-Frame-Options: DENY` | middleware | test |
| Make the board say something false (forged data) | Every write path (`/api/cnx/*/ingest`) needs the relay secret, compared in constant time; 1 MB cap; per-feed shape validation; rain gauges outside Chiang Mai rejected | `src/lib/cnx/relay-kv.ts`, ingest routes | relay-kv tests; prod probe: unauthenticated POST → 401 |
| Make the official domain print a themed headline | `?scenario=` ignored in production unless `CNX_DEMO_MODE=1`; drill data always labelled "ซ้อมแผน / DRILL" | `story` and `flood` routes | story / flood-provenance tests |
| Pose as a government warning | Board's own CAP export is `scope=Restricted`, "not an official public warning"; official TMD warnings shown verbatim in their own framed row | `cap.xml`, `official-warnings` | CAP tests, watch-board tests |
| Burn upstream quotas / take feeds down (DoS) | Shared **edge cache** (Cache API) keyed on path + only the params a route reads; per-IP **rate limits** (ingest 60/min, heavy 150/min, reads 1,500/min); forecast refresh behind a KV lock with failure backoff; unused amplifying route (`/aircraft`) removed | `src/lib/edge-cache.ts`, `wrangler.cnx.jsonc` `ratelimits`, `wind-field.ts` | `edge-cache.test.ts` |
| Unauthenticated KV writes | Visitor archive written only by the relay's authenticated call | `visitors/route.ts` | — |
| Secret leakage | Secrets only as Worker secrets and a 0600 env file on the relay host; never in git (history checked), bundle or `public/`; relay never follows redirects with the secret attached | `scripts/relay-flights.mjs` | audit: `git log --all -S` |
| Downgrade / sniffing | HSTS 2 years + preload, `upgrade-insecure-requests`, `nosniff`, COOP same-origin, CORP same-site, `poweredByHeader` off | middleware, `public/_headers` | test |
| Side doors | `workers_dev` and preview URLs off; never-deploy marker on the old reserve worker; duplicate `wrangler.jsonc` kept identical to the production config | wrangler configs | — |
| Embedded third parties | Only two frames allowed (Windy player, Tableau), both sandboxed with `no-referrer` | CSP `frame-src`, components | test |

## Privacy (PDPA)

No accounts, cookies or analytics. The browser keeps only the language and
theme choice. IP addresses are used only as rate-limit keys; Cloudflare logs
redact query strings. Camera video is never proxied or stored; haze vision
keeps image statistics, not images; citizen reports keep no author. See the
About page, section "Governance and privacy".

## Known residual risks (accepted for the demo, scheduled after)

1. **One shared relay secret, no replay protection.** A compromised relay
   Mac could write any feed. Next: per-feed secrets + HMAC over timestamp
   and body, monotonic timestamps in KV.
2. **Plausibility gates.** Rain is bounded to 0–500 mm and to the province;
   river levels and flights are shape-checked but not rate-of-change
   checked. Next: reject implausible jumps against the previous payload.
3. **CSP allows `https:` for images, media and connections** (camera hosts
   come from data). Script execution is locked; exfiltration beacons would
   need a script first. Next: run the host-pinned policy as Report-Only.
4. **Development dependencies** carry advisories (vitest/tinypool,
   wrangler/miniflare, eslint chain); none ships in the Worker. Next:
   `npm audit fix` + vitest major upgrade after the demo.
5. **Single relay host.** Six feeds stop if the Mac stops; the board then
   shows them as unavailable, never as calm.

## How to re-check before a release

```bash
npm run type-check && npx eslint src && npx vitest run && npm run test:relay
npm run build:cnx && npx wrangler deploy -c wrangler.cnx.jsonc
node scripts/verify-deploy.mjs
curl -sI https://cnx.nonarkara.org/cnx | grep -i content-security-policy
```
