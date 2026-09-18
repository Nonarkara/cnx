// Extends OpenNext's CloudflareEnv (global, declaration-merged) with
// bindings this app adds beyond OpenNext's own cache/asset bindings —
// see wrangler.cnx.jsonc for the concrete binding IDs.

declare global {
  interface CloudflareEnv {
    /** Latest flight snapshot from scripts/relay-flights.mjs — see
     *  src/app/api/cnx/flights/ingest/route.ts for why a KV relay
     *  exists instead of fetching OpenSky/adsb.lol directly. */
    CNX_FLIGHTS_KV?: KVNamespace;
  }
}

export {};
