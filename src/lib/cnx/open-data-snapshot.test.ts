import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { OPEN_DATA_SNAPSHOT } from "./open-data-snapshot";

const BAKE = join(process.cwd(), "public/data/cnx/open-data/index.json");
const BKK_OFFSET_MS = 7 * 3_600_000;

describe("open-data snapshot quoted on the About page", () => {
  it("matches the count and day of the baked catalogue", () => {
    const bake = JSON.parse(readFileSync(BAKE, "utf8")) as { totalDatasets: number; generatedAt: string };
    const bakedOnBkk = new Date(Date.parse(bake.generatedAt) + BKK_OFFSET_MS).toISOString().slice(0, 10);
    expect(OPEN_DATA_SNAPSHOT.count).toBe(bake.totalDatasets);
    expect(OPEN_DATA_SNAPSHOT.bakedOn).toBe(bakedOnBkk);
  });
});
