import { defineConfig } from "vitest/config";

// CNX tests — pure data-module smoke tests. No DOM, no Next.js, no
// network. We mock `fetch` per test rather than spinning up the worker.
//
// Two test suites:
//   1. The fixtures under `public/data/cnx/*.geojson` load and parse
//      correctly (regression catch: Overpass `{lat,lon}` → GeoJSON
//      `[lon,lat]` swap broke the 3D layer once already).
//   2. Each data module's loader returns the expected shape and
//      tolerates the same failure modes the live worker hits.

export default defineConfig({
  // JSX transform.
  //
  // This was `esbuild: { jsx: "automatic" }` under vitest 3, which used the
  // esbuild pipeline. vitest 5 runs on Vite 8 + Rolldown, whose transform
  // pipeline is Oxc, and Oxc does NOT read the `esbuild` key — so that line
  // became silently inert and every `.tsx` test failed to collect with
  // "Unexpected JSX expression". tsconfig.json sets `jsx: "preserve"`,
  // correctly for Next/SWC but wrong here, which is why the transform has to
  // be asserted in this file rather than inherited.
  //
  // "runtime: automatic" is Oxc's equivalent of esbuild's "automatic" —
  // the transform the suite has always run on. Note it is an OBJECT, not
  // the string "react-jsx": rolldown's TransformOptions accepts that string,
  // but Vite narrows OxcOptions.jsx to "preserve" | JsxOptions, and tsc
  // rejects the string form even though the runtime honours it.
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    environment: "node",
    globals: false,
    // Disable the disk-load fallback in data modules so mocked
    // network fetches in tests are the only path exercised. Tests
    // that want to assert against the baked JSON explicitly can
    // opt in by re-importing with this env unset.
    env: {
      CNX_SKIP_DISK_LOAD: "1",
    },
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    testTimeout: 15_000,
    // `poolOptions` was REMOVED in vitest 4 — every former poolOption is now
    // a top-level option. Left un-migrated, `forks.singleFork` is silently
    // ignored (vitest prints only a DEPRECATED line, then spawns one worker
    // per file). On this shared 16 GB laptop that is 99 concurrent workers:
    // exactly the memory pressure the setting existed to prevent.
    pool: "forks",
    maxWorkers: 1,
  },
});
