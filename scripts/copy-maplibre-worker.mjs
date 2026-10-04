// maplibre-gl v6 is ESM-only and loads its worker from a real URL.
// Next's bundler emits `maplibre-gl-worker.mjs` without its sibling
// `maplibre-gl-shared.mjs`, so the worker dies on its first import and
// no tiles load. Serve both from public/ instead (MapLibre's documented
// Next.js setup); CNXMap points setWorkerUrl at MAPLIBRE_WORKER_URL.
// Runs before dev/build so the copy always matches the installed version.
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const dist = path.join(path.dirname(createRequire(import.meta.url).resolve("maplibre-gl/package.json")), "dist");
const dest = path.join(process.cwd(), "public", "maplibre");

mkdirSync(dest, { recursive: true });
for (const file of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  copyFileSync(path.join(dist, file), path.join(dest, file));
}
