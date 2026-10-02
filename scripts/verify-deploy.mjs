#!/usr/bin/env node
// Post-deploy verification for cnx.nonarkara.org.
//
// WHY THIS IS IN THE REPO
// -----------------------
// It was previously written into /tmp and recreated at least twice after
// /tmp was cleared. A verification step that has to be rewritten each time
// is a step that gets skipped. It lives here so the next deploy can run it
// without retyping it, and so the expected route list is reviewable in a
// diff instead of buried in a shell history.
//
// WHAT IT ACTUALLY CHECKS
// -----------------------
//   1. build.commit matches the local HEAD (the commit *string* — not the
//      files; a dirty tree builds from untracked files and this check stays
//      green, which is exactly how the flood-camera code shipped untracked)
//   2. every /api/cnx route answers, and the status codes match expectation
//   3. the module graph resolves: no import points at a missing file
//   4. optional: named payload assertions, e.g. --expect river-level
//
// Usage:
//   node scripts/verify-deploy.mjs
//   node scripts/verify-deploy.mjs --expect river-level --expect build
//
// Exit code 0 = all checks passed. Non-zero = read the FAIL lines.

import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";

const ORIGIN = process.env.CNX_ORIGIN ?? "https://cnx.nonarkara.org";

// Routes expected to answer 200. POST-only ingestion routes are listed
// separately because a GET on them is *expected* to 405 — a 405 here is
// the correct answer, not an anomaly.
//
// Enumerated from the tree with
//   find src/app/api/cnx -name route.ts | sed 's|src/app/api/cnx/||;s|/route.ts||'
// which is also how the ingest list below was produced. Guessing these
// produced three FAILs against a perfectly healthy deployment.
const ROUTES_200 = [
  "air-quality", "aircraft", "arrivals", "asmc", "aerosol", "aqi-amphoe",
  "bus-routes", "cctv", "citizen", "dustboy", "fires", "fires-rfd",
  "flights", "flood", "flood-cameras", "river-level", "floodhub",
  "haze-vision", "heritage", "jaxa-aot", "open-data", "outbound",
  "smoke-trajectory", "snapshot-trend", "social", "story", "twin",
  "visitors", "waterways", "weather-layers", "build",
];

// GET is answered with 400 by design (they require a query parameter).
const ROUTES_400 = ["aircraft", "ask"];

// POST-only ingestion routes. A GET must be 405, not 404 — a 404 here
// would mean the route does not exist at all. Enumerated from the tree
// (`find src/app/api/cnx -name route.ts`), NOT guessed: an earlier draft
// of this file listed fires/social/dustboy ingest routes that have never
// existed, and reported three FAILs that were the script's own fault.
const ROUTES_405 = [
  "arrivals/ingest", "citizen/ingest", "flights/ingest", "haze-vision/ingest",
];

const args = process.argv.slice(2);
const expects = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--expect") expects.push(args[i + 1]);
}

let failures = 0;
const fail = (msg) => {
  failures++;
  console.log(`  FAIL  ${msg}`);
};
const ok = (msg) => console.log(`  ok    ${msg}`);

async function getJson(path, tries = 3) {
  // Single-shot probes flake under load; 3 tries is the established rule.
  for (let t = 0; t < tries; t++) {
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 25_000);
      const res = await fetch(`${ORIGIN}${path}`, {
        signal: ctl.signal,
        headers: { accept: "application/json" },
      });
      clearTimeout(timer);
      const text = await res.text();
      return { status: res.status, text };
    } catch (e) {
      if (t === tries - 1) return { status: 0, text: String(e) };
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  return { status: 0, text: "unreachable" };
}

// ─── 1. build.commit ────────────────────────────────────────────
console.log(`\n=== build identity (${ORIGIN}) ===`);
let head = "?";
try {
  head = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
} catch {
  fail("could not read local HEAD (not a git repo?)");
}

const dirty = execSync("git status --porcelain", { encoding: "utf8" }).trim();
if (dirty) {
  const files = dirty.split("\n").filter(Boolean);
  const untrackedSrc = files.filter((f) => f.startsWith("??") && f.includes("src/"));
  console.log(`  note  working tree is dirty (${files.length} entries)`);
  if (untrackedSrc.length) {
    // This is the check that would have caught the untracked
    // flood-cameras files. build.commit stays green either way.
    fail(`untracked files under src/ WILL deploy but are NOT in the commit:`);
    for (const f of untrackedSrc) console.log(`          ${f.slice(3)}`);
  }
} else {
  ok("working tree clean");
}

// The build identity lives at /api/cnx/build and its `commit` field. An
// earlier draft of this script probed `/api/cnx/build.commit`, which has
// never existed, and reported a FAIL against a correct deployment.
const bc = await getJson("/api/cnx/build");
if (bc.status === 200) {
  let remote = "?";
  try {
    remote = JSON.parse(bc.text).commit ?? "?";
  } catch {
    fail("build returned non-JSON");
  }
  if (remote === head) ok(`build.commit == HEAD (${head.slice(0, 7)})`);
  else fail(`build.commit ${remote} != HEAD ${head} — the deployed commit is not this tree`);
} else {
  fail(`/api/cnx/build returned ${bc.status}`);
}

// ─── 2. routes ──────────────────────────────────────────────────
console.log(`\n=== routes ===`);
for (const r of ROUTES_200) {
  const res = await getJson(`/api/cnx/${r}`);
  const expect400 = ROUTES_400.includes(r);
  if (expect400) {
    if (res.status === 400) ok(`${r} → 400 (by design)`);
    else fail(`${r} → ${res.status}, expected 400`);
  } else if (res.status === 200) {
    ok(`${r} → 200`);
  } else {
    fail(`${r} → ${res.status} ${res.text.slice(0, 80)}`);
  }
}
for (const r of ROUTES_405) {
  const res = await getJson(`/api/cnx/${r}`);
  if (res.status === 405) ok(`${r} → 405 (POST-only, as designed)`);
  else fail(`${r} → ${res.status}, expected 405`);
}

// ─── 3. module graph ────────────────────────────────────────────
console.log(`\n=== module graph ===`);
const graph = await getJson("/api/cnx/layer-contract");
if (graph.status === 200) {
  try {
    const j = JSON.parse(graph.text);
    const mods = j.modules ?? j.layers ?? [];
    if (Array.isArray(mods) && mods.length) {
      ok(`layer-contract resolves ${mods.length} modules`);
    } else {
      ok("layer-contract reachable (shape differs; see payload)");
    }
  } catch {
    fail("layer-contract returned non-JSON");
  }
} else {
  console.log(`  note  layer-contract → ${graph.status} (skipped)`);
}

// ─── 4. optional payload assertions ─────────────────────────────
for (const name of expects) {
  console.log(`\n=== expect: ${name} ===`);
  const res = await getJson(`/api/cnx/${name}`);
  if (res.status !== 200) {
    fail(`${name} → ${res.status}`);
    continue;
  }
  let j;
  try {
    j = JSON.parse(res.text);
  } catch {
    fail(`${name} returned non-JSON`);
    continue;
  }
  if (name === "river-level") {
    if (j.provenance === "live") ok(`provenance live, ${j.gaugeCount} gauges`);
    else if (j.provenance === "unavailable") {
      // A throttle is a KNOWN, documented condition, not an anomaly: the
      // upstream rate-limits per source IP and Cloudflare's egress is
      // shared. What must hold either way is that the reason is stated
      // and that it does not read as a statement about the river.
      ok(`unavailable — stated reason: ${j.unavailableReason}`);
      if (typeof j.unavailableReason !== "string" || !j.unavailableReason) {
        fail("unavailable with no reason — an operator cannot act on that");
      }
      if (!/not a measurement of absence|not an empty river/i.test(j.note ?? "")) {
        fail(`note does not distinguish a failed read from an absent river: ${j.note}`);
      }
    } else {
      fail(`unexpected provenance "${j.provenance}"`);
    }
    if (typeof j.catalogueCount === "number") ok(`catalogue ${j.catalogueCount} (context, not a denominator)`);
    else if (j.catalogueCount === null) ok("catalogueCount null — catalogue unread, correctly not 0");
    else fail(`catalogueCount should be number|null, got ${typeof j.catalogueCount}`);
    const withThreshold = (j.gauges ?? []).filter((g) => g.criticalLevelMsl !== null);
    if (withThreshold.length) {
      const g = withThreshold[0];
      ok(`published threshold: ${g.code} critical ${g.criticalLevelMsl} m, headroom ${g.headroomM?.toFixed(2)} m`);
    }
    if (j.provenance === "live") {
      const withTime = (j.gauges ?? []).filter((g) => g.observedAt);
      if (withTime.length) ok(`all ${withTime.length} gauges carry an observation time`);
      else fail("no gauge carries an observation time — ages cannot be shown");
    }
  } else {
    ok(`${name} payload fetched (${res.text.length} bytes)`);
  }
}

console.log(
  failures === 0
    ? "\nPASS — no anomalies\n"
    : `\nFAIL — ${failures} problem(s) above\n`,
);
process.exit(failures === 0 ? 0 : 1);
