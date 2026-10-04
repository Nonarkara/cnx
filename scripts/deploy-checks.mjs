import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REQUIRED_QUERY = new Set(["aircraft", "ask", "burnscar"]);

/** A release must be recoverable from the published branch, not only local Git. */
export function checkPublishedHead(head, publishedHead) {
  if (!publishedHead) return "origin/main is missing — release is not recoverable from the published branch";
  if (publishedHead !== head) return `origin/main ${publishedHead} differs from HEAD ${head}`;
  return null;
}

/** Route expectations come from the tree, so a new route cannot evade the gate. */
export function discoverRoutes(root = PROJECT_ROOT) {
  const base = resolve(root, "src/app/api/cnx");
  return readdirSync(base, { recursive: true })
    .filter((name) => name.endsWith("/route.ts"))
    .map((name) => {
      const route = name.slice(0, -"/route.ts".length);
      const source = readFileSync(resolve(base, name), "utf8");
      const get = /export\s+(?:async\s+)?function\s+GET\b/.test(source);
      const post = /export\s+(?:async\s+)?function\s+POST\b/.test(source);
      if (!get && !post) throw new Error(`No recognized HTTP handler: ${route}`);
      return { route, status: get ? (REQUIRED_QUERY.has(route) ? 400 : 200) : 405, post };
    }).sort((a, b) => a.route.localeCompare(b.route));
}

export function checkRiverPayload(j) {
  const failures = [];
  if (j.provenance !== "live") failures.push(`river-level is ${j.provenance}, expected live measured gauges`);
  if (!Array.isArray(j.gauges) || !j.gauges.length) failures.push("river-level has no gauges");
  else {
    if (j.gaugeCount !== j.gauges.length) failures.push("gaugeCount differs from the gauges array");
    if (j.gauges.some((g) => !g.observedAt || !Number.isFinite(Date.parse(g.observedAt)))) failures.push("a gauge has no valid observation time");
    if (j.gauges.some((g) => Date.parse(g.observedAt) > Date.now() + 5 * 60_000)) failures.push("a gauge observation time is in the future");
  }
  if (!(j.catalogueCount === null || (Number.isFinite(j.catalogueCount) && j.catalogueCount >= 0))) failures.push("catalogueCount must be a nonnegative number or null");
  return failures;
}
