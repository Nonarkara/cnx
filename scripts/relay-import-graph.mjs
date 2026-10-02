// Validate the unattended relay graph without executing its polling loop.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

export function checkRelayGraph(entry) {
  const seen = new Set();
  const queue = [entry];
  const problems = [];
  let specifiers = 0;
  while (queue.length) {
    const file = queue.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    let source;
    try { source = readFileSync(file, "utf8"); }
    catch { problems.push(`Cannot read relay module ${file}`); continue; }
    const args = file.endsWith(".ts") ? ["--experimental-strip-types", "--check", file] : ["--check", file];
    const syntax = spawnSync(process.execPath, args, { encoding: "utf8", timeout: 15_000 });
    if (syntax.error || syntax.signal) {
      problems.push(`Could not syntax-check relay module ${file}: ${syntax.error?.code ?? syntax.signal}`);
      continue;
    }
    if (syntax.status !== 0) {
      problems.push(`Relay module has invalid syntax: ${file}`);
      continue;
    }
    const imports = [
      ...source.matchAll(/(?:^|[;\n])\s*(?:import|export)\s+(?!\s*type\b)(?:[^;]*?\s+from\s+)?["'](\.[^"']+)["']/g),
      ...source.matchAll(/\bimport\s*\(\s*["'](\.[^"']+)["']\s*\)/g),
    ];
    for (const match of imports) {
      specifiers++;
      // Node resolves this exact path. Trying .ts/.js siblings would hide
      // extensionless imports that only the application bundler resolves.
      const target = resolve(dirname(file), match[1]);
      try { readFileSync(target); queue.push(target); }
      catch { problems.push(`${file} imports "${match[1]}" which plain Node cannot resolve`); }
    }
  }
  return { problems, modules: seen.size, specifiers };
}
