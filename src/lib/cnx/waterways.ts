// CNX waterways — OSM rivers + streams for the flood overlay.
//
// The dashboard's flood desk already shows river gauges and dam
// storage; this module adds the **stream network itself** as
// PathLayers on the map so the operator can see which channels are
// draining into the Ping basin.
//
// Pulled from Overpass:
//   way["waterway"="river"](17.5,97.5,20.5,100.5)
//   way["waterway"="stream"](17.5,97.5,20.5,100.5)
//
// Refresh: weekly. OSM doesn't change often.

export interface Waterway {
  id: string;
  name: string;
  category: "river" | "stream";
  /** GeoJSON LineString's coordinates array as [lon, lat] tuples. */
  geometry: [number, number][];
  /** Natural width class (river > stream > drain). */
  width: "major" | "minor" | "drain";
}

const OVERPASS = "https://overpass-api.de/api/interpreter";

const QUERY = `
[out:json][timeout:60];
(
  way["waterway"="river"](17.5,97.5,20.5,100.5);
  way["waterway"="stream"](17.5,97.5,20.5,100.5);
);
out geom;
`;

let cache: { at: number; data: Waterway[] } | null = null;
const TTL_MS = 7 * 24 * 60 * 60_000;

export async function fetchCnxWaterways(): Promise<{ waterways: Waterway[]; generatedAt: string }> {
  if (cache && Date.now() - cache.at < TTL_MS) {
    return { waterways: cache.data, generatedAt: new Date(cache.at).toISOString() };
  }
  try {
    const res = await fetch(OVERPASS, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "data=" + encodeURIComponent(QUERY),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`overpass ${res.status}`);
    const json = (await res.json()) as {
      elements: {
        type: "way";
        id: number;
        geometry?: { lat: number; lon: number }[];
        tags?: Record<string, string>;
      }[];
    };
    const waterways: Waterway[] = [];
    for (const el of json.elements) {
      if (el.type !== "way" || !el.geometry || el.geometry.length < 2) continue;
      const category = el.tags?.waterway === "river" ? "river" : "stream";
      const width: Waterway["width"] =
        el.tags?.waterway === "river" ? "major" : category === "stream" ? "minor" : "drain";
      waterways.push({
        id: `w-${el.id}`,
        name: el.tags?.name ?? el.tags?.["name:en"] ?? "",
        category,
        width,
        geometry: el.geometry.map((p) => [p.lon, p.lat]),
      });
    }
    cache = { at: Date.now(), data: waterways };
    return { waterways, generatedAt: new Date().toISOString() };
  } catch {
    return { waterways: [], generatedAt: new Date().toISOString() };
  }
}