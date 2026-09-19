import { describe, expect, it } from "vitest";
import {
  compactCount,
  filterDatasets,
  formatBytes,
  pickChartSeries,
  tableToCsv,
  type LibraryDatasetSummary,
  type LibraryFilter,
} from "./data-library";

function ds(over: Partial<LibraryDatasetSummary>): LibraryDatasetSummary {
  return {
    id: "1",
    name: "n1",
    title: "Dataset",
    org: "Org",
    domain: "other",
    formats: ["CSV"],
    resourceCount: 1,
    tableCount: 1,
    rows: 10,
    fields: 3,
    hasLocation: false,
    hasTime: false,
    numericCount: 0,
    status: "ready",
    modified: null,
    license: "",
    unreadableCount: 0,
    ...over,
  };
}

const all: LibraryFilter = { tab: "all", chip: "all", domain: null, query: "" };

describe("filterDatasets", () => {
  const list = [
    ds({ id: "a", title: "จำนวนนักท่องเที่ยว", domain: "tourism", hasTime: true, numericCount: 2 }),
    ds({ id: "b", title: "ศูนย์พักพิง", domain: "disaster", hasLocation: true }),
    ds({ id: "c", title: "รายงาน PDF", domain: "other", status: "files", tableCount: 0, formats: ["PDF"] }),
  ];

  it("keeps only parsed tables on the prepared tab", () => {
    expect(filterDatasets(list, { ...all, tab: "ready" }).map((d) => d.id)).toEqual(["a", "b"]);
  });

  it("filters by domain and by capability chip", () => {
    expect(filterDatasets(list, { ...all, domain: "tourism" }).map((d) => d.id)).toEqual(["a"]);
    expect(filterDatasets(list, { ...all, chip: "location" }).map((d) => d.id)).toEqual(["b"]);
    expect(filterDatasets(list, { ...all, chip: "time" }).map((d) => d.id)).toEqual(["a"]);
    expect(filterDatasets(list, { ...all, chip: "numeric" }).map((d) => d.id)).toEqual(["a"]);
  });

  it("searches title, organisation, format and the domain label", () => {
    expect(filterDatasets(list, { ...all, query: "นักท่องเที่ยว" }).map((d) => d.id)).toEqual(["a"]);
    expect(filterDatasets(list, { ...all, query: "pdf" }).map((d) => d.id)).toEqual(["c"]);
    expect(filterDatasets(list, { ...all, query: "Disaster" }, { disaster: "Disaster & water" }).map((d) => d.id)).toEqual(["b"]);
  });
});

describe("formatting", () => {
  it("compacts counts and byte sizes", () => {
    expect(compactCount(640)).toBe("640");
    expect(compactCount(54_400)).toBe("54.4K");
    expect(compactCount(2_000_000)).toBe("2M");
    expect(formatBytes(null)).toBe("—");
    expect(formatBytes(2_572)).toBe("3 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
  });
});

describe("tableToCsv", () => {
  it("quotes commas, quotes and newlines, and prefixes a BOM for Excel", () => {
    const csv = tableToCsv({
      columns: [
        { name: "ชื่อ", kind: "text" },
        { name: "note", kind: "text" },
      ],
      rows: [["a,b", 'say "hi"'], ["x\ny", 3]],
    });
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain('"a,b","say ""hi"""');
    expect(csv).toContain('"x\ny",3');
  });
});

describe("pickChartSeries", () => {
  const cols = [
    { name: "ปี", kind: "time" as const },
    { name: "จำนวน", kind: "number" as const },
  ];

  it("charts a true series with distinct time labels", () => {
    const s = pickChartSeries({ columns: cols, rows: [[2564, "1,000"], [2565, 1_500], [2566, 2_000]] });
    expect(s?.labels).toEqual(["2564", "2565", "2566"]);
    expect(s?.values).toEqual([1000, 1500, 2000]);
  });

  it("refuses a grouped long table where the same year repeats", () => {
    expect(pickChartSeries({ columns: cols, rows: [[2564, 1], [2564, 2], [2565, 3]] })).toBeNull();
  });

  it("refuses too few points, blanks, and non-numeric values", () => {
    expect(pickChartSeries({ columns: cols, rows: [[2564, 1], [2565, 2]] })).toBeNull();
    expect(pickChartSeries({ columns: cols, rows: [[2564, 1], [2565, "n/a"], [2566, 3]] })).toBeNull();
    expect(pickChartSeries({ columns: cols, rows: [["", 1], [2565, 2], [2566, 3]] })).toBeNull();
  });
});
