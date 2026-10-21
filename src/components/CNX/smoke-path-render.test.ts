import { expect, it } from "vitest";
import type { TrajectorySegment } from "../../lib/cnx/smoke-trajectory";
import { smokeDirectionMarks } from "./smoke-path-render";
const segment = (coordinates: [number, number][]): TrajectorySegment => ({ hotspotId: "real-fire", origin: { longitude: coordinates[0][0], latitude: coordinates[0][1] }, points: coordinates.slice(1).map(([longitude, latitude], index) => ({ longitude, latitude, hoursAhead: index + 1 })), nearCnx: true, hitsCnxBbox: true, weight: 1, travelKm6h: 20 });
it.each([[[99, 19], [99.5, 19]], [[99.5, 19], [99, 19]], [[99, 19], [99, 19.5]], [[99, 19.5], [99, 19]]] as [number, number][][])("heads follow the supplied downwind leg %j", (...coordinates) => {
  const source = segment(coordinates);
  const marks = smokeDirectionMarks([source], 9);
  expect(marks).toHaveLength(1);
  const [left, tip, right] = marks[0].path;
  const dx = tip[0] - (left[0] + right[0]) / 2, dy = tip[1] - (left[1] + right[1]) / 2;
  expect(dx * (coordinates[1][0] - coordinates[0][0]) + dy * (coordinates[1][1] - coordinates[0][1])).toBeGreaterThan(0);
  expect(marks[0].segment).toBe(source);
});
it("turns with model legs while preserving the original picking evidence", () => {
  const source = segment([[99, 19], [99.5, 19], [99.5, 19.5]]), original = structuredClone(source);
  const marks = smokeDirectionMarks([source], 9);
  expect(marks.map(mark => mark.legIndex)).toEqual([0, 1]);
  for (const { path: [left, tip, right], legIndex } of marks) expect(legIndex === 0 ? tip[0] - (left[0] + right[0]) / 2 : tip[1] - (left[1] + right[1]) / 2).toBeGreaterThan(0);
  expect(source).toEqual(original);
});
it("does not invent direction for stationary, invalid or backwards-time legs", () => {
  const backwards = segment([[99, 19], [100, 20]]); backwards.points[0].hoursAhead = -1;
  expect(smokeDirectionMarks([segment([[99, 19], [99, 19]]), segment([[99, 19], [NaN, 19]]), backwards], 9)).toEqual([]);
});
