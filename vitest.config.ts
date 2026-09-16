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
    include: ["src/**/*.test.ts"],
    testTimeout: 15_000,
    pool: "forks",
    poolOptions: {
      forks: { singleFork: true },
    },
  },
});
