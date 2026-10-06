# Governor-facing frontend audit — 6 October 2026

The browser limitation from this first pass was subsequently resolved. See the [7 October visual follow-up](../2026-10-07/governor-frontend-followup.md) for actual desktop/phone checks and further corrections.

The landing page remains the map-based operation room. This pass repairs the path from a headline to evidence and a next check; it does not substitute a presentation page for the working map.

## Defects corrected

1. Overview evidence buttons previously opened the map with whichever desk topic was already selected. Each metric and priority now selects its own topic, moves keyboard focus to the evidence area, and reaches the phone panel after the map view mounts. Reduced-motion preferences are respected.
2. The selected water, air, fire and aviation desks now explain the metric in Thai, show a next verification step, name the source, and show the observation date/time in Bangkok. Missing evidence stays explicit. These explanations occupy the existing scrollable desk, rather than another full-width header.
3. The compact measurement strip now states its screening status in text. Meaning is no longer confined to hover-only tooltips or colour.
4. The governor's LINE copy previously used the current browser origin, producing a localhost link during demonstrations. It now always links to the public CNX operation room.
5. Historical aviation figures are labelled in Thai as detected flights and seat/load-factor passenger estimates. They are not actual passenger totals or tourist counts. Historical burn area is explicitly separated from today's observations.
6. The brief's rain-age display now uses the same six-hour observation window as its rain evaluation; river and air retain three hours. Source stamps are enlarged in the brief.
7. The news rail identifies media context rather than claiming a representative measure of public opinion. Filter buttons expose selected state and have 44px targets. Primary tools and phone topic labels are in Thai.
8. The official-notice button previously had no action. It now opens the notice text, source and a valid HTTP(S) original-document link when supplied.

## Evidence and limits

- The initial working tree was clean on `0a2ed91`, matching origin/main and production.
- Full regression run: 630 tests in 68 files passed. A subsequently added aviation-wording regression passed with the 14-test governor-brief suite (631 tests total in the resulting suite).
- New interaction regressions exercise all four overview metric callbacks, all four priority callbacks, public-link clipboard output, and visible missing-evidence guidance.
- Local `/cnx` compiled successfully with Next.js. Route type generation, TypeScript and lint checks passed; the local preview returned HTTP 200. A production release build was not run.
- Browser access to the local preview was rejected by the browser security policy. No screenshot, responsive visual sign-off, basemap interaction check or visual contrast measurement is claimed for this pass. Production deployment is not claimed.

## Two-minute demonstration

1. Start on the operation map. Explain that the strip contains screened observations, with gaps shown openly.
2. Open water or the most concerning topic. Read the Thai explanation, its source/time and the next verification step; inspect the underlying station rows. A bank-margin reading is local to its gauge, and a rain total is a 24-hour accumulation.
3. Open air. Explain the measured station/district coverage and the difference between a screening value and a 24-hour health assessment.
4. Open aviation. Distinguish observed aircraft now from historical detected arrivals and estimated passengers.
5. Open the governor brief, inspect its reference times, and copy the plain-text summary for LINE. Copying does not send a message.

Before presenting, manually check desktop and phone wrapping, open each evidence path, switch Street/Terrain/Satellite, open/close the brief, and inspect print preview. These remain visual acceptance checks, not completed evidence from this session. News is media context; camera catalogue reachability is not proof of fresh images; unknown data is never an all-clear.
