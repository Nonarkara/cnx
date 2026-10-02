/**
 * Public camera catalogue — the contracts that keep an absent camera from
 * reading as a clear road.
 *
 * Every test here is a regression guard for a specific way this could
 * lie: a dead camera shown as live, a camera with no owner, an empty
 * province reported as an outage, or a note that says "all fine" when it
 * should say "no coverage".
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  selectCnxCameras,
  camerasNote,
  cameraCredit,
  fetchCnxFloodCameras,
  resetFloodCameraCache,
  CATALOGUE_TTL_MS,
} from "./flood-cameras";

const CNX: Record<string, unknown> = {
  id: "tfc-doh-344",
  name: "108 - อ.เมืองเชียงใหม่",
  region: "เชียงใหม่",
  source: "กรมทางหลวง (DOH)",
  sourceUrl: "https://live.iticfoundation.org/",
  lat: 18.78,
  lng: 98.98,
  type: "hls",
  live: true,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("selectCnxCameras — only the province we are drawing", () => {
  it("keeps cameras inside the bbox and drops the other ~2,300", () => {
    const out = selectCnxCameras([
      CNX,
      { ...CNX, id: "bkk", lat: 13.75, lng: 100.5 },
      { ...CNX, id: "lpg", lat: 15.87, lng: 100.99 },
      { ...CNX, id: "lamp", lat: 18.31, lng: 98.35 }, // just south of the bbox
    ]);
    expect(out.map((c) => c.id)).toEqual(["tfc-doh-344"]);
  });

  it("keeps a camera whose owner is blank but labels it honestly", () => {
    // The position is the operational value; an empty owner line must not
    // silently make a real camera disappear. But it must never render as
    // though it were creditable either.
    const out = selectCnxCameras([{ ...CNX, source: "   " }]);
    expect(out).toHaveLength(1);
    expect(out[0].source).toMatch(/not stated/);
  });

  it("labels a genuinely unstated owner rather than inventing one", () => {
    const out = selectCnxCameras([{ ...CNX, source: undefined }]);
    expect(out).toHaveLength(1);
    expect(out[0].source).toMatch(/not stated/);
  });

  it("drops entries with no id or no coordinates instead of placing them at 0,0", () => {
    const out = selectCnxCameras([
      { ...CNX, id: "" },
      { ...CNX, id: "nolat", lat: undefined },
      { ...CNX, id: "nolong", lng: null as unknown as number },
    ]);
    expect(out).toHaveLength(0);
  });

  it("orders live cameras first, so an offline one cannot lead the list", () => {
    const out = selectCnxCameras([
      { ...CNX, id: "aaa-offline", live: false },
      { ...CNX, id: "zzz-live", live: true },
    ]);
    expect(out[0].id).toBe("zzz-live");
  });
});

describe("the live flag is the upstream's, never ours", () => {
  it("passes live:false through rather than dropping or inferring it", () => {
    const out = selectCnxCameras([{ ...CNX, live: false }]);
    expect(out).toHaveLength(1);
    expect(out[0].live).toBe(false);
  });

  it("treats any non-true live value as false, never as truthy", () => {
    for (const v of [undefined, null, "true", 1, "yes"]) {
      const out = selectCnxCameras([{ ...CNX, live: v }]);
      expect(out[0]?.live, `live=${String(v)}`).toBe(false);
    }
  });
});

describe("camerasNote — computed from what is actually shown", () => {
  it("names the offline cameras instead of quietly omitting them", () => {
    const cams = selectCnxCameras([
      { ...CNX, id: "a", live: true },
      { ...CNX, id: "b", live: false },
      { ...CNX, id: "c", live: false },
    ]);
    const note = camerasNote(cams);
    expect(note).toContain("1 of 3");
    expect(note).toContain("2 are known offline");
  });

  it("calls an empty province absent coverage, never a clear road", () => {
    const note = camerasNote([]);
    expect(note).toMatch(/not a report that the roads are clear/i);
    expect(note).not.toMatch(/\ball clear\b|\bsafe\b/i);
  });

  it("says a dead camera cannot confirm the road, so silence is not safety", () => {
    const note = camerasNote(selectCnxCameras([{ ...CNX, live: false }]));
    expect(note).toMatch(/says nothing about the water on that road/i);
  });
});

describe("cameraCredit", () => {
  it("lists the agencies actually on screen, deduped", () => {
    const cams = selectCnxCameras([
      { ...CNX, id: "a", source: "กรมทางหลวง (DOH)" },
      { ...CNX, id: "b", source: "กรมทางหลวง (DOH)" },
      { ...CNX, id: "c", source: "ThaiWater/EGAT/DWR" },
    ]);
    expect(cameraCredit(cams).agencies).toEqual(["ThaiWater/EGAT/DWR", "กรมทางหลวง (DOH)"]);
  });

  it("always names the aggregator, even with nothing on screen", () => {
    expect(cameraCredit([]).aggregatorUrl).toMatch(/^https:\/\//);
    expect(cameraCredit([]).agencies).toEqual([]);
  });
});

describe("fetchCnxFloodCameras — three states, not two", () => {
  beforeEach(() => resetFloodCameraCache());
  it("a source that answers with nothing is LIVE with zero cameras", async () => {
    const res = await fetchCnxFloodCameras(async () => jsonResponse({ cameras: [] }));
    expect(res.provenance).toBe("live");
    expect(res.cameras).toHaveLength(0);
    expect(res.note).toMatch(/absence of coverage/i);
    // and it must not look fresh-forever
    expect(res.cataloguedAt).not.toBe("");
  });

  it("a transport failure is unavailable, and says why", async () => {
    const res = await fetchCnxFloodCameras(async () => {
      throw new Error("network down");
    });
    expect(res.provenance).toBe("unavailable");
    expect(res.note).toMatch(/network down/);
    expect(res.cataloguedAt).toBe("");
  });

  it("a non-OK status is unavailable, never an empty catalogue", async () => {
    const res = await fetchCnxFloodCameras(async () => jsonResponse({ cameras: [] }, 503));
    expect(res.provenance).toBe("unavailable");
    expect(res.note).toMatch(/HTTP 503/);
  });

  it("accepts a bare array as well as the {cameras} envelope", async () => {
    const res = await fetchCnxFloodCameras(async () => jsonResponse([CNX]));
    expect(res.cameras).toHaveLength(1);
    expect(res.liveCount).toBe(1);
  });

  it("always ships credit and the legal line, even on failure", async () => {
    const res = await fetchCnxFloodCameras(async () => {
      throw new Error("down");
    });
    expect(res.credit.aggregatorUrl).toMatch(/^https:\/\//);
    expect(res.legal.intendedUse).toMatch(/public-goods/i);
    expect(res.legal.terms).toMatch(/no formal API terms/i);
    // The legal block must not assert a licence the source never granted.
    expect(res.legal.intendedUse).not.toMatch(/licen[cs]ed|permission granted|we have the right/i);
  });

  it("polls no faster than the upstream TTL — it is volunteer infrastructure", () => {
    expect(CATALOGUE_TTL_MS).toBeGreaterThanOrEqual(10 * 60_000);
  });
});
