#!/usr/bin/env node
// Read-only release verification. A matching commit string alone is not
// proof of a release: every working-tree change fails the identity gate.
// Usage: node scripts/verify-deploy.mjs --expect river-level
import { execFileSync } from "node:child_process";
import { discoverRoutes, checkRiverPayload, checkPublishedHead, PROJECT_ROOT } from "./deploy-checks.mjs";

const ORIGIN = process.env.CNX_ORIGIN ?? "https://cnx.nonarkara.org";
const args = process.argv.slice(2);
const expects = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] !== "--expect" || !args[i + 1] || args[i + 1].startsWith("--")) {
    console.error("Usage: node scripts/verify-deploy.mjs [--expect route]");
    process.exit(1);
  }
  const route = args[++i];
  if (!/^[a-z0-9-]+$/.test(route)) { console.error("Invalid expected route"); process.exit(1); }
  expects.push(route);
}
let failures = 0;
const fail = (message) => { failures++; console.log(`  FAIL  ${message}`); };
const ok = (message) => console.log(`  ok    ${message}`);

async function get(path, options) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${ORIGIN}${path}`, { ...options, signal: AbortSignal.timeout(25_000), headers: { accept: "application/json", ...options?.headers } });
      const text = await res.text();
      if (res.status >= 500 && attempt < 2) continue;
      return { status: res.status, text };
    } catch (error) {
      if (attempt === 2) return { status: 0, text: error.message };
    }
  }
}

console.log(`\n=== release identity (${ORIGIN}) ===`);
const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: PROJECT_ROOT, encoding: "utf8" }).trim();
const dirty = execFileSync("git", ["status", "--porcelain"], { cwd: PROJECT_ROOT, encoding: "utf8" }).trim();
if (dirty) fail(`working tree has ${dirty.split("\n").length} changes — cannot verify a release from HEAD`);
else ok("working tree clean");
try {
  const published = execFileSync("git", ["ls-remote", "origin", "refs/heads/main"], { cwd: PROJECT_ROOT, encoding: "utf8", timeout: 15_000 }).trim().split(/\s+/)[0];
  const problem = checkPublishedHead(head, published);
  if (problem) fail(problem);
  else ok(`origin/main == HEAD (${head.slice(0, 7)})`);
} catch {
  fail("cannot verify the published origin/main commit");
}
const build = await get("/api/cnx/build");
if (build.status !== 200) fail(`build → ${build.status}`);
else {
  try {
    const remote = JSON.parse(build.text).commit;
    if (remote === head) ok(`build.commit == HEAD (${head.slice(0, 7)})`);
    else fail(`deployed commit ${remote} differs from HEAD ${head}`);
  } catch { fail("build returned non-JSON"); }
}

console.log("\n=== complete route inventory ===");
const routes = discoverRoutes();
// Four concurrent probes keep the audit bounded and avoid a serialized
// multi-minute gate. No authenticated production writes are performed.
for (let i = 0; i < routes.length; i += 4) {
  const batch = await Promise.all(routes.slice(i, i + 4).map(async (entry) => ({ ...entry, res: await get(`/api/cnx/${entry.route}`) })));
  for (const { route, status, res, post } of batch) {
    if (res.status !== status) fail(`${route} → ${res.status}, expected ${status}`);
    else if (status === 200) {
      try { JSON.parse(res.text); ok(`${route} → 200 JSON`); }
      catch { fail(`${route} returned non-JSON`); }
    } else ok(`${route} → ${status}`);
    if (post) {
      const denied = await get(`/api/cnx/${route}`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      if (denied.status === 401 || denied.status === 503) ok(`${route} denies unauthenticated ingest (${denied.status})`);
      else fail(`${route} unauthenticated POST → ${denied.status}, expected 401 or unconfigured 503`);
    }
  }
}

for (const route of expects) {
  const res = await get(`/api/cnx/${route}`);
  if (res.status !== 200) { fail(`expected ${route} → ${res.status}`); continue; }
  try {
    const j = JSON.parse(res.text);
    if (route === "river-level") {
      const problems = checkRiverPayload(j);
      problems.forEach(fail);
      if (!problems.length) ok(`river-level: live, ${j.gaugeCount} gauges, all with observation times`);
    } else ok(`${route} returned JSON`);
  } catch { fail(`${route} returned non-JSON`); }
}
console.log(`\n${failures ? `FAIL — ${failures} problem(s)` : `PASS — ${routes.length} routes and release identity verified`}\n`);
process.exit(failures ? 1 : 0);
