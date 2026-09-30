// Guard: the off-Cloudflare relay must be importable by plain Node.
//
// WHY THIS EXISTS
//
// scripts/haze-vision.mjs runs on the M3 Air under Node's native TypeScript
// stripping, launched by launchd with stdout/stderr going to
// /tmp/cnx-flights-relay.log. It is NOT bundled. So the moment one of its
// imports needs a bundler to resolve — an extensionless path like
// "./haze-vision-core", which TypeScript happily allows but Node does not —
// the whole relay dies at import time, before any log line is written, and
// the dashboard silently stops updating with no error anywhere on screen.
//
// That happened for real on 2026-09-30: importing HAZE_TESTABLE_SPREAD from
// src/lib/cnx/haze-vision.ts dragged in its extensionless sibling import and
// killed the process. The only symptom was /api/cnx/haze-vision quietly
// reporting provenance="unavailable". Nothing in `npm test` covers this
// because vitest resolves extensionless imports happily.
//
// So: import every relay module the way Node will, and fail loudly if any
// of them cannot load. Run via `npm run test:relay`.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));

// Imported for real: these export functions and start no timers.
const importable = ["./haze-vision.mjs", "./citizen-reports.mjs"];

// relay-flights.mjs ends in `await tick(); setInterval(tick, POLL_MS)`, so
// importing it would start the poll loop and hang this check. Its module
// graph is still worth validating — parse it, then walk its relative
// imports by hand and make sure each one exists on disk and loads.
const parseOnly = "./relay-flights.mjs";

let failed = false;

for (const m of importable) {
  try {
    await import(m);
    console.log(`ok    ${m} (imported)`);
  } catch (e) {
    failed = true;
    console.error(`FAIL  ${m}\n      ${e.message}`);
  }
}

// Walk relay-flights.mjs's relative imports without executing it.
const seen = new Set();
const queue = [resolve(HERE, parseOnly)];
const fromSpecifiers = [];

while (queue.length) {
  const file = queue.pop();
  if (seen.has(file)) continue;
  seen.add(file);
  let source;
  try {
    source = readFileSync(file, "utf8");
  } catch (e) {
    failed = true;
    console.error(`FAIL  cannot read ${file}\n      ${e.message}`);
    continue;
  }
  // Extensionless relative specifiers are the exact hazard: bundlers
  // resolve them, plain Node does not.
  for (const m of source.matchAll(/(?:^|\n)\s*(?:import|export)[\s\S]*?from\s+["'](\.[^"']+)["']/g)) {
    fromSpecifiers.push(m[1]);
    const base = resolve(file, "..", m[1]);
    const candidates = [`${base}.ts`, `${base}.mjs`, `${base}.js`, base];
    if (candidates.some((c) => { try { readFileSync(c); return true; } catch { return false; } })) {
      if (m[1].endsWith(".ts")) queue.push(candidates[0]);
    } else {
      failed = true;
      console.error(`FAIL  ${file.replace(HERE + "/", "")} imports "${m[1]}" which Node cannot resolve`);
    }
  }
}
console.log(`ok    ${parseOnly} (parsed; ${seen.size - 1} relative imports resolved, ${fromSpecifiers.length} specifiers)`);

if (failed) {
  console.error(
    "\nA relay module will not load under plain Node. It is launched by\n" +
      "launchd unbundled, so an import that only a bundler can resolve kills\n" +
      "the process at startup with no log output. Import the leaf module\n" +
      "directly (haze-vision-core.ts and dustboy.ts are import-free) instead\n" +
      "of a sibling that re-exports through an extensionless path.",
  );
  process.exit(1);
}
console.log("\nall relay modules import cleanly under plain Node");
