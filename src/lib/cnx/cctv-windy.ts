// CNX CCTV — Windy.com public webcams in and around Chiang Mai.
//
// Windy publishes a keyless public webcam network; nine cameras cover
// the Chiang Mai basin and the Lamphun approach corridors (verified
// 2026-09-19: every snapshot URL below returned a live JPEG, and every
// coordinate was read off Windy's own map redirect for that camera).
// Snapshots refresh every ~2.5 min upstream (cache-control max-age=150);
// the wall auto-refreshes on that cadence. The day-player iframe gives
// the 24 h timelapse + live day view with full attribution to Windy.
//
// If Windy removes a camera the snapshot probe marks it unreachable and
// it drops out of the wall — no fake-green tiles, per the About-page
// honesty doctrine.

export interface WindyCamera {
  id: string;
  name: string;
  nameTh: string;
  longitude: number;
  latitude: number;
  category: "traffic" | "tourism";
  /** Refreshing JPEG snapshot (verified live 2026-09-19). */
  snapshot: string;
  /** Day-player iframe (24 h timelapse + live view). */
  player: string;
  /** Windy detail page (attribution link-out). */
  detail: string;
}

const IMG = (id: number) => `https://imgproxy.windy.com/_/preview/plain/current/${id}/original.jpg`;
const PLAYER = (id: number) => `https://webcams.windy.com/webcams/public/embed/player/${id}/day`;
const DETAIL = (id: number) => `https://windy.com/webcams/${id}`;

export const WINDY_CAMERAS: WindyCamera[] = [
  { id: "windy-1623054222", name: "Chiang Mai viewpoint", nameTh: "จุดชมวิวเมืองเชียงใหม่", longitude: 98.954, latitude: 18.812, category: "tourism", snapshot: IMG(1623054222), player: PLAYER(1623054222), detail: DETAIL(1623054222) },
  { id: "windy-1718364353", name: "Fa Ham", nameTh: "ฟ้าฮ่าม", longitude: 98.995, latitude: 18.811, category: "tourism", snapshot: IMG(1718364353), player: PLAYER(1718364353), detail: DETAIL(1718364353) },
  { id: "windy-1694169692", name: "Mae Hia", nameTh: "แม่เหียะ", longitude: 98.963, latitude: 18.748, category: "tourism", snapshot: IMG(1694169692), player: PLAYER(1694169692), detail: DETAIL(1694169692) },
  { id: "windy-1691551186", name: "Mueang Nga, Lamphun", nameTh: "เหมืองง่า ลำพูน", longitude: 99.049, latitude: 18.626, category: "traffic", snapshot: IMG(1691551186), player: PLAYER(1691551186), detail: DETAIL(1691551186) },
  { id: "windy-1718365382", name: "Wiang Yong, Rte 114", nameTh: "เวียงยอง ทางหลวง 114", longitude: 99.02, latitude: 18.571, category: "traffic", snapshot: IMG(1718365382), player: PLAYER(1718365382), detail: DETAIL(1718365382) },
  { id: "windy-1718364836", name: "Makhuea Chae, Rte 1147", nameTh: "มะเขือแจ้ ทางหลวง 1147", longitude: 99.08, latitude: 18.586, category: "traffic", snapshot: IMG(1718364836), player: PLAYER(1718364836), detail: DETAIL(1718364836) },
  { id: "windy-1718365214", name: "Si Bua Ban, Superhighway", nameTh: "ศรีบัวบาน ซูเปอร์ไฮเวย์", longitude: 99.067, latitude: 18.541, category: "traffic", snapshot: IMG(1718365214), player: PLAYER(1718365214), detail: DETAIL(1718365214) },
  { id: "windy-1718365739", name: "Song Khwae, Rte 108", nameTh: "สองแคว ทางหลวง 108", longitude: 98.806, latitude: 18.487, category: "traffic", snapshot: IMG(1718365739), player: PLAYER(1718365739), detail: DETAIL(1718365739) },
  { id: "windy-1747916729", name: "San Maha Phon junction", nameTh: "แยกสันมหาพน", longitude: 98.949, latitude: 19.129, category: "traffic", snapshot: IMG(1747916729), player: PLAYER(1747916729), detail: DETAIL(1747916729) },
];

// Snapshot TTL mirrors Windy's own cache-control (max-age=150).
export const WINDY_TTL_MS = 150_000;

export interface WindyProbe {
  id: string;
  reachable: boolean;
}

async function probeOne(cam: WindyCamera, timeoutMs: number): Promise<WindyProbe> {
  try {
    const res = await fetch(cam.snapshot, { signal: AbortSignal.timeout(timeoutMs) });
    // A live camera returns a JPEG; a removed one 404s. Drain nothing —
    // res.ok is decided from headers, but some CDNs only commit the
    // status once the body starts; cancel immediately to avoid
    // downloading nine images per poll on the server.
    if (res.body) {
      try { await res.body.cancel(); } catch { /* already consumed */ }
    }
    return { id: cam.id, reachable: res.ok };
  } catch {
    return { id: cam.id, reachable: false };
  }
}

/** Probe every snapshot with bounded concurrency. Unreachable cameras
 *  are reported, not hidden silently — the caller decides display. */
export async function probeWindySnapshots(timeoutMs = 8_000): Promise<WindyProbe[]> {
  const out: WindyProbe[] = [];
  const queue = [...WINDY_CAMERAS];
  const workers = Array.from({ length: 3 }, async () => {
    while (queue.length > 0) {
      const cam = queue.shift();
      if (!cam) break;
      out.push(await probeOne(cam, timeoutMs));
    }
  });
  await Promise.all(workers);
  return out;
}
