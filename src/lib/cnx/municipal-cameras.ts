// CNX CCTV — municipal camera registry (Chiang Mai City / PAO network).
//
// STATUS TODAY: no municipal camera is publicly reachable. The PAO's own
// "CCTV control center" page (chiangmaipao.go.th/all_cctv.php) shows four
// STANDBY placeholders, and the municipality publishes no stream or
// snapshot endpoint. So this registry ships EMPTY — and the dashboard
// says so honestly ("0 municipal cameras onboarded") instead of rendering
// fake-green tiles.
//
// ONBOARDING (no expertise needed on the municipal side — see
// docs/CCTV-PIPELINE.md for the full runbook): the municipality's
// technician only has to make each camera's HLS playlist or JPEG
// snapshot reachable over plain HTTPS (directly, or via the MediaMTX
// relay in the runbook). Then add one entry per camera below, redeploy,
// and it appears on the wall + map automatically. No code changes.

export interface MunicipalCamera {
  id: string;
  /** Thai-first label shown on the tile, e.g. "ประตูท่าแพ". */
  label: string;
  longitude: number;
  latitude: number;
  /** HLS playlist preferred (plays in the modal on all browsers). */
  hlsUrl?: string;
  /** Refreshing JPEG snapshot (wall tile + fallback). */
  snapshotUrl?: string;
  category: "traffic" | "highway" | "heritage" | "flood" | "tourism";
}

export const MUNICIPAL_CAMERAS: MunicipalCamera[] = [
  // Example (leave commented until a real feed exists):
  // {
  //   id: "cmu-tha-phae",
  //   label: "ประตูท่าแพ",
  //   longitude: 98.9933,
  //   latitude: 18.7909,
  //   hlsUrl: "https://cams.chiangmaicity.go.th/live/tha-phae/index.m3u8",
  //   snapshotUrl: "https://cams.chiangmaicity.go.th/snap/tha-phae.jpg",
  //   category: "heritage",
  // },
];
