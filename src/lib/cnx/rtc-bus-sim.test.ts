import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { simulateRtcBuses, pointAtKm, SIM_SPEED_KMH, LAYOVER_MIN, type RtcLinesFile } from "./rtc-bus-sim";

const file = JSON.parse(
  readFileSync(resolve(process.cwd(), "public/data/cnx/rtc-bus-lines.json"), "utf8"),
) as RtcLinesFile;

/** Build a Date for a Bangkok wall-clock time on a fixed day. */
function bkk(hhmm: string): Date {
  return new Date(`2026-09-17T${hhmm}:00+07:00`);
}

describe("rtc-bus-lines.json", () => {
  it("has both directions for 24A, 24B and 24C with continuous paths", () => {
    for (const ref of ["24A", "24B", "24C"]) {
      const lines = file.lines.filter((l) => l.ref === ref);
      expect(lines).toHaveLength(2);
      for (const l of lines) {
        expect(l.path.length).toBe(l.cumKm.length);
        expect(l.lengthKm).toBeGreaterThan(3);
        expect(l.lengthKm).toBeLessThan(25);
      }
    }
  });
});

describe("simulateRtcBuses", () => {
  it("has no buses before the first departure", () => {
    expect(simulateRtcBuses(file.lines, bkk("05:00"))).toHaveLength(0);
  });

  it("puts a just-departed 24C bus at the airport", () => {
    const bus = simulateRtcBuses(file.lines, bkk("06:45")).find((b) => b.id === "24C-06:45");
    expect(bus?.status).toBe("outbound");
    const start = file.lines.find((l) => l.ref === "24C" && /airport/i.test(l.from))!.path[0];
    expect(bus!.lon).toBeCloseTo(start[0], 4);
    expect(bus!.lat).toBeCloseTo(start[1], 4);
  });

  it("advances at the configured speed", () => {
    const bus = simulateRtcBuses(file.lines, bkk("06:57")).find((b) => b.id === "24C-06:45");
    expect(bus!.kmDone).toBeCloseTo((12 / 60) * SIM_SPEED_KMH, 5);
  });

  it("lays over at the far terminus, then returns, then leaves the map", () => {
    const out = file.lines.find((l) => l.ref === "24A" && /airport/i.test(l.from))!;
    const back = file.lines.find((l) => l.ref === "24A" && !/airport/i.test(l.from))!;
    const outMin = (out.lengthKm / SIM_SPEED_KMH) * 60;
    const inMin = (back.lengthKm / SIM_SPEED_KMH) * 60;
    const at = (min: number) => new Date(bkk("08:00").getTime() + min * 60_000);
    const find = (min: number) => simulateRtcBuses(file.lines, at(min)).find((b) => b.id === "24A-08:00");

    expect(find(outMin + 1)?.status).toBe("layover");
    expect(find(outMin + LAYOVER_MIN + 1)?.status).toBe("inbound");
    expect(find(outMin + LAYOVER_MIN + inMin + 1)).toBeUndefined();
  });
});

describe("pointAtKm", () => {
  it("clamps past the end of the line", () => {
    const line = file.lines[0];
    const end = line.path[line.path.length - 1];
    const p = pointAtKm(line, line.lengthKm + 100);
    expect(p.lon).toBeCloseTo(end[0], 6);
    expect(p.lat).toBeCloseTo(end[1], 6);
  });
});
