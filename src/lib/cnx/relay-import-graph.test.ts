import { afterEach, beforeEach, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { checkRelayGraph } from "../../../scripts/relay-import-graph.mjs";
let directory: string;
beforeEach(() => { directory = mkdtempSync(join(tmpdir(), "cnx-relay-graph-")); });
afterEach(() => { rmSync(directory, { recursive: true, force: true }); });
function fixture(name: string, source: string) { const path = join(directory, name); writeFileSync(path, source); return path; }
it("rejects main-relay syntax errors without executing its polling loop", () => {
  const entry = fixture("relay.mjs", "export const broken = ;");
  expect(checkRelayGraph(entry).problems).toContain(`Relay module has invalid syntax: ${entry}`);
}, 60_000);
it("rejects extensionless imports even when the .js sibling exists", () => {
  fixture("leaf.js", "export const x = 1;");
  const entry = fixture("relay.mjs", 'import { x } from "./leaf";');
  expect(checkRelayGraph(entry).problems.some((problem: string) => problem.includes('"./leaf" which plain Node cannot resolve'))).toBe(true);
}, 60_000);
it("walks exact paths and reports broken nested imports without executing modules", () => {
  fixture("leaf.mjs", 'throw new Error("must not execute"); import "./missing.mjs";');
  const entry = fixture("relay.mjs", 'import "./leaf.mjs"; throw new Error("must not execute");');
  expect(checkRelayGraph(entry).problems.some((problem: string) => problem.includes('"./missing.mjs"'))).toBe(true);
}, 60_000);
it("rejects nested syntax errors and unresolved literal dynamic imports", () => {
  const leaf = fixture("leaf.mjs", "export const broken = ;");
  const entry = fixture("relay.mjs", 'import "./leaf.mjs";\nimport("./missing.mjs");');
  const result = checkRelayGraph(entry);
  expect(result.problems).toContain(`Relay module has invalid syntax: ${leaf}`);
  expect(result.problems.some((problem: string) => problem.includes('"./missing.mjs"'))).toBe(true);
}, 60_000);
it("accepts a valid graph without running top-level side effects", () => {
  fixture("leaf.mjs", 'export const x = 1; throw new Error("must not execute");');
  const entry = fixture("relay.mjs", 'import { x } from "./leaf.mjs"; throw new Error("must not execute");');
  expect(checkRelayGraph(entry)).toEqual({ problems: [], modules: 2, specifiers: 1 });
}, 60_000);
it.skipIf(Number(process.versions.node.split(".")[0]) < 22)("checks native TypeScript imports at their exact .ts paths", () => {
  fixture("leaf.ts", 'import type { MissingType } from "./type-only"; export const x: number = 1;');
  const entry = fixture("relay.mjs", 'import { x } from "./leaf.ts";');
  expect(checkRelayGraph(entry)).toEqual({ problems: [], modules: 2, specifiers: 1 });
}, 60_000);
