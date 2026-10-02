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

import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { checkRelayGraph } from "./relay-import-graph.mjs";

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

// Check syntax and exact relative paths throughout the graph, without
// executing the relay's interval or sending an upstream request.
const graph = checkRelayGraph(resolve(HERE, parseOnly));
for (const problem of graph.problems) {
  failed = true;
  console.error(`FAIL  ${problem}`);
}
if (!graph.problems.length) console.log(`ok    ${parseOnly} (syntax checked; ${graph.modules} modules, ${graph.specifiers} relative specifiers)`);

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
