// The data.go.th snapshot as the About document quotes it. The bake lives in
// public/data/cnx/open-data/index.json (~290 KB), too large to ship to the
// client just to print two numbers, so the figures are copied here and
// open-data-snapshot.test.ts fails the build the moment a re-bake changes
// them. That is what stops the About page saying "311" after the catalogue
// has moved on (it said 311 for weeks after the 2 Oct 2026 bake read 316).
//
// The 21 Oct 2026 bake reads 682 because the earlier run had been publishing
// a partial catalogue: the second search failed upstream and the failure was
// swallowed, so 366 datasets were left off the index while the page presented
// what it had as the result. fetch-datagoth-cnx.mjs now fails loudly instead
// of publishing a partial population, and asserts it enumerated all of it.

export const OPEN_DATA_SNAPSHOT = {
  /** `totalDatasets` of the bake: one filtered Thai-language search, not a population count. */
  count: 682,
  /** Day of the bake's `generatedAt`, Asia/Bangkok. */
  bakedOn: "2026-10-22",
  bakedOnTh: "22 ต.ค. 2569",
  bakedOnEn: "22 Oct 2026",
} as const;
