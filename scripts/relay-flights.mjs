#!/usr/bin/env node
// Polls live flight data from a normal (non-Cloudflare) IP and pushes it
// into the cnx-dashboard Worker's KV cache.
//
// Why this exists: OpenSky and adsb.lol are both unreachable from
// Cloudflare's own network — confirmed with an isolated throwaway
// Worker that only tested raw connectivity. OpenSky returns Cloudflare
// error 522 (edge can't open a TCP connection to OpenSky's origin at
// all, ~19s timeout) for both the states endpoint and the OAuth token
// server; adsb.lol returns 429 from nginx (a shared-egress-IP rate
// limit) regardless of headers. Neither is an auth-tier problem, so no
// amount of OpenSky OAuth credentials fixes it from inside the Worker.
// This machine's own internet connection isn't blocked, so it fetches
// on the Worker's behalf and POSTs the result to /api/cnx/flights/ingest.
//
// Run continuously via launchd — see scripts/org.nonarkara.cnx-flights-relay.plist.
//
// Deliberately duplicates the fetch/parse logic from lib/cnx/opensky.ts
// and lib/cnx/adsb-lol.ts rather than importing them: those files use
// extensionless relative imports (bundler-style resolution), which
// Node's native TS loader/strict ESM resolver rejects outright
// (Cannot find module '.../adsb-lol'). This script has to keep working
// unattended under launchd indefinitely — it shouldn't depend on the
// Next.js/webpack toolchain or break because of an unrelated app change.
//
// Env (read from scripts/relay-flights.env, gitignored):
//   CNX_FLIGHTS_RELAY_SECRET   shared secret, must match the Worker's
//   OPENSKY_CLIENT_ID          optional — falls back to adsb.lol/anonymous OpenSky if unset
//   OPENSKY_CLIENT_SECRET

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL(".", import.meta.url));
loadEnvFile(new URL("relay-flights.env", `file://${HERE}`).pathname);

const INGEST_URL = process.env.CNX_INGEST_URL ?? "https://cnx.nonarkara.org/api/cnx/flights/ingest";
const RELAY_SECRET = process.env.CNX_FLIGHTS_RELAY_SECRET;
const POLL_MS = Number(process.env.CNX_RELAY_POLL_MS ?? 30_000);

if (!RELAY_SECRET) {
  console.error("relay-flights: CNX_FLIGHTS_RELAY_SECRET is not set (see scripts/relay-flights.env.example)");
  process.exit(1);
}

function loadEnvFile(path) {
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return; // fine — env vars may already be set in the environment
  }
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!(key in process.env)) process.env[key] = value;
  }
}

const CNX_BBOX = { lamin: 17.5, lomin: 97.5, lamax: 20.5, lomax: 100.5 };
const UA = "cnx-dashboard-relay/0.1 (https://cnx.nonarkara.org)";

let tokenCache = null;

async function getOpenSkyToken() {
  const clientId = process.env.OPENSKY_CLIENT_ID;
  const clientSecret = process.env.OPENSKY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  if (tokenCache && Date.now() < tokenCache.expiresAt) return tokenCache.token;
  const res = await fetch(
    "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret }),
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!res.ok) throw new Error(`opensky token ${res.status}`);
  const json = await res.json();
  tokenCache = { token: json.access_token, expiresAt: Date.now() + (json.expires_in - 30) * 1000 };
  return tokenCache.token;
}

function toMetres(ft) {
  return typeof ft === "number" ? ft * 0.3048 : null;
}

/** Same shape as src/lib/cnx/opensky.ts's FlightState. */
function stateFromOpenSky(raw) {
  const [
    icao24, callsign, originCountry, timePosition, lastContact,
    longitude, latitude, baroAltitude, onGround, velocity,
    trueTrack, verticalRate, geoAltitude, , , positionSource,
  ] = raw;
  return {
    icao24: icao24 ?? "",
    callsign: (callsign ?? "").trim(),
    originCountry: originCountry ?? "",
    timePosition: typeof timePosition === "number" ? timePosition * 1000 : null,
    lastContact: typeof lastContact === "number" ? lastContact * 1000 : Date.now(),
    longitude: typeof longitude === "number" ? longitude : null,
    latitude: typeof latitude === "number" ? latitude : null,
    baroAltitude: typeof baroAltitude === "number" ? baroAltitude : null,
    geoAltitude: typeof geoAltitude === "number" ? geoAltitude : null,
    onGround: Boolean(onGround),
    velocity: typeof velocity === "number" ? velocity : null,
    trueTrack: typeof trueTrack === "number" ? trueTrack : null,
    verticalRate: typeof verticalRate === "number" ? verticalRate : null,
    positionSource: typeof positionSource === "number" ? positionSource : -1,
  };
}

async function fetchOpenSky() {
  const token = await getOpenSkyToken();
  const url = new URL("https://opensky-network.org/api/states/all");
  url.searchParams.set("lamin", String(CNX_BBOX.lamin));
  url.searchParams.set("lomin", String(CNX_BBOX.lomin));
  url.searchParams.set("lamax", String(CNX_BBOX.lamax));
  url.searchParams.set("lomax", String(CNX_BBOX.lomax));
  const res = await fetch(url, {
    headers: { "User-Agent": UA, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`opensky ${res.status}`);
  const json = await res.json();
  return { observedAt: json.time * 1000, states: (json.states ?? []).map(stateFromOpenSky) };
}

function countryFromRegistration(reg) {
  if (!reg) return "";
  const r = reg.toUpperCase();
  if (/^B-\d{5}$/.test(r)) return "Taiwan";
  const prefixes = {
    HS: "Thailand", "9V": "Singapore", "9M": "Malaysia", PK: "Indonesia", RP: "Philippines",
    VN: "Viet Nam", XU: "Cambodia", RDPL: "Laos", XY: "Myanmar", XZ: "Myanmar",
    B: "China", JA: "Japan", HL: "Republic of Korea", VT: "India", A6: "United Arab Emirates",
    A7: "Qatar", VH: "Australia", ZK: "New Zealand", N: "United States", G: "United Kingdom",
  };
  let best = "";
  for (const p of Object.keys(prefixes)) {
    if (r.startsWith(p) && p.length > best.length) {
      const next = r.charAt(p.length);
      if (p.length === 1 && next !== "-" && !/\d/.test(next)) continue;
      best = p;
    }
  }
  return best ? prefixes[best] : "";
}

async function fetchAdsbLol() {
  const res = await fetch("https://api.adsb.lol/v2/point/19.0/99.0/125", {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`adsb.lol ${res.status}`);
  const json = await res.json();
  const now = json.now ?? Date.now();
  const states = (json.ac ?? [])
    .filter((a) => a.hex && typeof a.lat === "number" && typeof a.lon === "number")
    .map((a) => ({
      icao24: a.hex.replace(/^~/, "").toLowerCase(),
      callsign: (a.flight ?? "").trim(),
      originCountry: countryFromRegistration(a.r),
      timePosition: typeof a.seen_pos === "number" ? now - a.seen_pos * 1000 : null,
      lastContact: now - (a.seen ?? 0) * 1000,
      longitude: a.lon,
      latitude: a.lat,
      baroAltitude: a.alt_baro === "ground" ? 0 : toMetres(a.alt_baro),
      geoAltitude: toMetres(a.alt_geom),
      onGround: a.alt_baro === "ground",
      velocity: typeof a.gs === "number" ? a.gs * 0.514444 : null,
      trueTrack: a.track ?? null,
      verticalRate: typeof (a.baro_rate ?? a.geom_rate) === "number" ? (a.baro_rate ?? a.geom_rate) * 0.00508 : null,
      positionSource: 0,
      typecode: a.t,
      registration: a.r,
    }));
  return { observedAt: now, states };
}

function split(states) {
  const located = states.filter(
    (s) => s.latitude !== null && s.longitude !== null &&
      s.latitude >= CNX_BBOX.lamin && s.latitude <= CNX_BBOX.lamax &&
      s.longitude >= CNX_BBOX.lomin && s.longitude <= CNX_BBOX.lomax,
  );
  return { airborne: located.filter((s) => !s.onGround), ground: located.filter((s) => s.onGround) };
}

async function buildSnapshot() {
  const fetchedAt = Date.now();
  try {
    const { observedAt, states } = await fetchAdsbLol();
    return { fetchedAt, observedAt, ...split(states), degraded: false, source: "adsb.lol" };
  } catch (e) {
    console.warn(`[relay] adsb.lol failed: ${e.message}`);
  }
  try {
    const { observedAt, states } = await fetchOpenSky();
    return { fetchedAt, observedAt, ...split(states), degraded: false, source: "opensky" };
  } catch (e) {
    console.warn(`[relay] opensky failed: ${e.message}`);
  }
  return null;
}

async function tick() {
  const snapshot = await buildSnapshot();
  if (!snapshot) {
    console.warn("[relay] both upstreams failed this tick, not writing (Worker keeps its last-known snapshot)");
    return;
  }
  try {
    const res = await fetch(INGEST_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Relay-Secret": RELAY_SECRET },
      body: JSON.stringify(snapshot),
      signal: AbortSignal.timeout(10_000),
    });
    const body = await res.text();
    if (!res.ok) {
      console.warn(`[relay] ingest rejected: ${res.status} ${body}`);
      return;
    }
    console.log(`[relay] ${snapshot.source}: ${snapshot.airborne.length} airborne, ${snapshot.ground.length} ground`);
  } catch (e) {
    console.warn(`[relay] ingest failed: ${e.message}`);
  }
}

console.log(`[relay] starting, polling every ${POLL_MS}ms -> ${INGEST_URL}`);
await tick();
setInterval(tick, POLL_MS);
