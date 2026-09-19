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

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

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

// OpenSky /states/all over the 3°×3° CNX box costs 1 credit (<25 sq°), so a
// 60 s cadence is ~1,440 of the free account's 4,000 daily credits —
// leaving room for the hourly arrivals pull below.
const OPENSKY_STATES_EVERY_MS = 60_000;
let lastOpenSky = { at: 0, states: [], observedAt: 0 };

/** adsb.lol and OpenSky each see planes the other misses (adsb.lol is a
 *  thin community network; OpenSky has far more receivers but no aircraft
 *  type). Union by icao24, preferring adsb.lol's record because it carries
 *  the aircraft type and registration. */
function mergeStates(adsb, opensky) {
  const byId = new Map(opensky.map((s) => [s.icao24, s]));
  for (const s of adsb) byId.set(s.icao24, { ...byId.get(s.icao24), ...s });
  return [...byId.values()];
}

async function buildSnapshot() {
  const fetchedAt = Date.now();
  const [adsbRes, openRes] = await Promise.allSettled([
    fetchAdsbLol(),
    Date.now() - lastOpenSky.at >= OPENSKY_STATES_EVERY_MS ? fetchOpenSky() : Promise.resolve(null),
  ]);
  if (adsbRes.status === "rejected") console.warn(`[relay] adsb.lol failed: ${adsbRes.reason.message}`);
  if (openRes.status === "rejected") console.warn(`[relay] opensky failed: ${openRes.reason.message}`);
  if (openRes.status === "fulfilled" && openRes.value) lastOpenSky = { at: Date.now(), ...openRes.value };

  const adsb = adsbRes.status === "fulfilled" ? adsbRes.value : null;
  // Reuse the last OpenSky poll between its slower ticks, but never one
  // older than 3 minutes — a frozen position is worse than no position.
  const openFresh = Date.now() - lastOpenSky.at < 3 * 60_000;
  const open = openFresh ? lastOpenSky : null;
  if (!adsb && !open) return null;

  for (const s of adsb?.states ?? []) rememberTypecode(s.icao24, s.typecode);
  const states = mergeStates(adsb?.states ?? [], open?.states ?? []);
  const source = adsb && open ? "merged" : adsb ? "adsb.lol" : "opensky";
  return { fetchedAt, observedAt: adsb?.observedAt ?? open.observedAt, ...split(states), degraded: false, source };
}

// ─── arrivals (tourism stats) ───────────────────────────────────────
// OpenSky's /flights/arrival endpoint lists real observed landings at
// VTCC. The Worker can't reach OpenSky, so this pulls the last three
// Asia/Bangkok days plus each aircraft's type and POSTs the raw records
// to /api/cnx/arrivals/ingest; the Worker does the visitor-estimate maths.

const ARRIVALS_URL = process.env.CNX_ARRIVALS_INGEST_URL ?? INGEST_URL.replace(/flights\/ingest$/, "arrivals/ingest");
const ARRIVALS_EVERY_MS = 60 * 60_000;
const CACHE_DIR = process.env.CNX_RELAY_CACHE_DIR ?? "/Volumes/Data/CNX/relay-cache";
const TYPECODE_FILE = join(CACHE_DIR, "typecodes.json");
const MAX_METADATA_LOOKUPS_PER_RUN = 80;
let lastArrivalsAt = 0;

/** icao24 → aircraft type. undefined = never looked up, "" = looked up, unknown. */
const typecodes = (() => {
  try {
    return new Map(Object.entries(JSON.parse(readFileSync(TYPECODE_FILE, "utf8"))));
  } catch {
    return new Map();
  }
})();

function rememberTypecode(icao24, typecode) {
  if (!icao24 || !typecode || typecodes.get(icao24) === typecode) return;
  typecodes.set(icao24, typecode);
}

function saveTypecodes() {
  try {
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(TYPECODE_FILE, JSON.stringify(Object.fromEntries(typecodes)));
  } catch (e) {
    console.warn(`[relay] could not persist typecode cache: ${e.message}`);
  }
}

async function lookupTypecode(icao24, token) {
  const res = await fetch(`https://opensky-network.org/api/metadata/aircraft/icao/${icao24}`, {
    headers: { "User-Agent": UA, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    signal: AbortSignal.timeout(10_000),
  });
  if (res.status === 404) return ""; // OpenSky doesn't know this airframe — don't ask again
  if (!res.ok) throw new Error(`metadata ${res.status}`);
  const json = await res.json();
  return typeof json.typecode === "string" ? json.typecode : "";
}

const BANGKOK_OFFSET_MS = 7 * 60 * 60_000;
function bangkokDay(daysAgo) {
  const nowB = new Date(Date.now() + BANGKOK_OFFSET_MS);
  const startUtcMs = Date.UTC(nowB.getUTCFullYear(), nowB.getUTCMonth(), nowB.getUTCDate() - daysAgo) - BANGKOK_OFFSET_MS;
  return {
    date: new Date(startUtcMs + BANGKOK_OFFSET_MS).toISOString().slice(0, 10),
    begin: Math.floor(startUtcMs / 1000),
    end: Math.floor((startUtcMs + 24 * 3_600_000) / 1000),
  };
}

async function fetchArrivalsDay({ begin, end }, token) {
  const url = new URL("https://opensky-network.org/api/flights/arrival");
  url.searchParams.set("airport", "VTCC");
  url.searchParams.set("begin", String(begin));
  url.searchParams.set("end", String(end));
  const res = await fetch(url, {
    headers: { "User-Agent": UA, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    signal: AbortSignal.timeout(30_000),
  });
  if (res.status === 404) return []; // "no flights in range"
  if (!res.ok) throw new Error(`arrival ${res.status}`);
  return ((await res.json()) ?? []).map((a) => ({
    icao24: a.icao24,
    firstSeen: a.firstSeen,
    lastSeen: a.lastSeen,
    estDepartureAirport: a.estDepartureAirport ?? null,
    estArrivalAirport: a.estArrivalAirport ?? null,
    callsign: a.callsign ?? null,
  }));
}

async function pushArrivals() {
  if (Date.now() - lastArrivalsAt < ARRIVALS_EVERY_MS) return;
  lastArrivalsAt = Date.now(); // set first: a failure retries next hour, not every 30 s
  try {
    const token = await getOpenSkyToken();
    const windows = [];
    for (const d of [0, 1, 2]) {
      const day = bangkokDay(d);
      windows.push({ date: day.date, arrivals: await fetchArrivalsDay(day, token) });
    }
    const ids = [...new Set(windows.flatMap((w) => w.arrivals.map((a) => a.icao24)))];
    let lookups = 0;
    for (const id of ids) {
      if (typecodes.has(id) || lookups >= MAX_METADATA_LOOKUPS_PER_RUN) continue;
      lookups++;
      try {
        typecodes.set(id, await lookupTypecode(id, token));
      } catch (e) {
        console.warn(`[relay] typecode lookup ${id}: ${e.message}`);
      }
    }
    saveTypecodes();
    const typeMap = Object.fromEntries(ids.filter((id) => typecodes.get(id)).map((id) => [id, typecodes.get(id)]));
    const res = await fetch(ARRIVALS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Relay-Secret": RELAY_SECRET },
      body: JSON.stringify({ windows, typecodes: typeMap }),
      signal: AbortSignal.timeout(20_000),
    });
    const body = await res.text();
    if (!res.ok) throw new Error(`ingest ${res.status} ${body}`);
    console.log(`[relay] arrivals pushed: ${windows.map((w) => `${w.date}=${w.arrivals.length}`).join(" ")}, ${Object.keys(typeMap).length}/${ids.length} typed`);
  } catch (e) {
    console.warn(`[relay] arrivals push failed: ${e.message}`);
  }
}

async function tick() {
  void pushArrivals();
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
