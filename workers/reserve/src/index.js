// CNX dashboard — placeholder reserved worker.
//
// Deployed as `cnx-dashboard-reserve` so the `cnx.nonarkara.org`
// hostname is held by Cloudflare. The real OpenNext build of the
// full CNX dashboard will replace this once `npm run deploy:cnx`
// succeeds in a Node 20 environment.
//
// What this stub does:
//   1. Replies 200 on every path with a minimal "reserved" HTML page
//      so curl / browser health-checks confirm the name is alive.
//   2. Sets a few headers so the deploy registers CNAME + Worker
//      cleanly with nonarkara.org's zone.

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>CNX Dashboard — Reserved</title>
<style>
  body { font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
         background: #f4f1ea; color: #1a1a1a; margin: 0; padding: 48px;
         line-height: 1.5; }
  h1 { font-size: 18px; margin: 0 0 12px 0; color: #1d2951; }
  pre { font-size: 12px; background: #fff; border: 1px solid #d8d2c4; padding: 16px; }
  .pill { display: inline-block; padding: 2px 6px; border: 1px solid #b8860b; color: #b8860b; font-size: 10px; }
</style>
</head>
<body>
  <h1>CNX · Chiang Mai Operations War Room</h1>
  <p><span class="pill">RESERVED</span> Hostname is registered. Full dashboard deploy pending Node 20 build env.</p>
  <pre>path:    ${url.pathname}
query:   ${url.search}
method:  ${request.method}
ua:     ${request.headers.get("user-agent") ?? "—"}
date:   ${new Date().toISOString()}
note:   ${env.PROVINCE ?? "cnx"} · reserve stub at cnx-dashboard-reserve
        The production OpenNext worker (cnx-dashboard) will replace this.</pre>
</body>
</html>`;
    return new Response(html, {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "x-cnx-dashboard": "reserved",
        "x-cnx-replaced-by": "cnx-dashboard",
      },
    });
  },
};