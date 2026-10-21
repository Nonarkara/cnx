import type { TrajectorySegment } from "../../lib/cnx/smoke-trajectory";

export interface SmokeDirectionMark {
  path: [number, number][];
  segment: TrajectorySegment;
  legIndex: number;
}

const project = ([lon, lat]: [number, number], size: number): [number, number] => [
  lon / 360 * size,
  -Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) / (2 * Math.PI) * size,
];
const unproject = ([x, y]: [number, number], size: number): [number, number] => [
  x / size * 360,
  (2 * Math.atan(Math.exp(-y / size * 2 * Math.PI)) - Math.PI / 2) * 180 / Math.PI,
];

/** One fixed-size open chevron per model leg. No filled plume or FRP-based width. */
export function smokeDirectionMarks(segments: TrajectorySegment[], zoom: number): SmokeDirectionMark[] {
  const marks: SmokeDirectionMark[] = [];
  const size = 512 * 2 ** zoom;
  for (const segment of segments) {
    let previous = segment.origin;
    let hours = 0;
    for (const [legIndex, point] of segment.points.entries()) {
      if (!Number.isFinite(point.hoursAhead) || point.hoursAhead <= hours) break;
      const coordinates = [previous.longitude, previous.latitude, point.longitude, point.latitude];
      if (!coordinates.every(Number.isFinite) || Math.abs(previous.latitude) >= 85 || Math.abs(point.latitude) >= 85) break;
      const start = project([previous.longitude, previous.latitude], size);
      const end = project([point.longitude, point.latitude], size);
      const length = Math.hypot(end[0] - start[0], end[1] - start[1]);
      if (length >= 8) {
        const ux = (end[0] - start[0]) / length;
        const uy = (end[1] - start[1]) / length;
        const tip: [number, number] = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2];
        const back: [number, number] = [tip[0] - ux * 6, tip[1] - uy * 6];
        const head: [number, number][] = [
          [back[0] - uy * 4, back[1] + ux * 4],
          tip,
          [back[0] + uy * 4, back[1] - ux * 4],
        ];
        marks.push({ segment, legIndex, path: head.map(vertex => unproject(vertex, size)) });
      }
      previous = point;
      hours = point.hoursAhead;
    }
  }
  return marks;
}
