// ─── Chiang Mai Province Configuration ──────────────────────────
// Mirrors the Lopburi governor-config format: corridors with map fly-to
// views, aliases, and default operational actions — adapted to the
// upper Chao Phraya / Ping basin: mountains, old city, and air traffic
// funnel.

export interface CnxCorridorDefinition {
  id: string;
  label: string;
  aliases: string[];
  view: {
    longitude: number;
    latitude: number;
    zoom: number;
    pitch: number;
    bearing: number;
  };
  defaultAction: string;
}

export const CNX_PROVINCE = {
  code: 50, // ThaiWater / HII province code for Chiang Mai
  nameEn: "Chiang Mai",
  nameTh: "เชียงใหม่",
  center: { longitude: 98.985, latitude: 18.788 },
  defaultView: {
    longitude: 98.985,
    latitude: 18.788,
    zoom: 9.4,
    pitch: 38,
    bearing: -8,
  },
  // Province bounding box — used to filter national feeds (DOH CCTV,
  // ThaiWater gauges, FIRMS hotspots) to the CNX operational area.
  bbox: { west: 97.5, south: 17.5, east: 100.5, north: 20.5 },
  // Airspace bbox — same as the OpenSky query bbox, kept here as the
  // single source of truth so the flight panel and the flood/air panel
  // don't drift.
  airspaceBbox: {
    west: 97.5,
    south: 17.5,
    east: 100.5,
    north: 20.5,
  },
} as const;

export const CNX_CORRIDORS: CnxCorridorDefinition[] = [
  {
    id: "old-city",
    label: "Old City / Moat",
    aliases: ["old city", "moat", "wat phra singh", "wat chedi luang", "sunday walking street"],
    view: { longitude: 98.9853, latitude: 18.7903, zoom: 13.6, pitch: 46, bearing: -6 },
    defaultAction:
      "Keep the heritage moat open; watch pedestrian flow on the walking-street nights; mind temple etiquette near dress-code zones.",
  },
  {
    id: "doi-suthep",
    label: "Doi Suthep",
    aliases: ["doi suthep", "wat phra that doi suthep", "mountain", "monk trail"],
    view: { longitude: 98.9215, latitude: 18.8048, zoom: 12.2, pitch: 48, bearing: 4 },
    defaultAction:
      "Watch haze and PM2.5 from slash-and-burn on the watershed; brief pilgrims on the 309-step climb during festivals.",
  },
  {
    id: "doi-inthanon",
    label: "Doi Inthanon",
    aliases: ["doi inthanon", "roof of thailand", "national park", "summit", "mae klang"],
    view: { longitude: 98.4867, latitude: 18.5883, zoom: 10.6, pitch: 42, bearing: 12 },
    defaultAction:
      "Track cool-season fog and visibility on Highway 108; brief visitors on the 2,565 m summit chill.",
  },
  {
    id: "ping-river",
    label: "Ping River",
    aliases: ["ping river", "mae ping", "river", "flood", "lowland"],
    view: { longitude: 99.04, latitude: 18.79, zoom: 11.4, pitch: 38, bearing: -10 },
    defaultAction:
      "Watch Ping River bank capacity during monsoon; stage sandbags at known overflow points in the lowland districts.",
  },
  {
    id: "cnx-airport",
    label: "CNX Airport",
    aliases: ["cnx", "airport", "maehongson arrival", "terminal", "fbo"],
    view: { longitude: 98.9622, latitude: 18.7715, zoom: 13.0, pitch: 42, bearing: 6 },
    defaultAction:
      "Track inbound flight counts; brief the immigration hall on seasonal surges (Songkran, Loy Krathong, Yi Peng).",
  },
  {
    id: "nimman",
    label: "Nimmanhaemin",
    aliases: ["nimman", "one nimman", "maya mall", "cafe district"],
    view: { longitude: 98.967, latitude: 18.8014, zoom: 13.8, pitch: 44, bearing: -4 },
    defaultAction:
      "Keep Nimman walkable; brief coffee-shop owners on tourist-tipping trends and the long-stay digital-nomad crowd.",
  },
  {
    id: "night-bazaar",
    label: "Night Bazaar / Chang Khlan",
    aliases: ["night bazaar", "chang khlan", "saturday walking street", "wualai"],
    view: { longitude: 99.0003, latitude: 18.7843, zoom: 13.8, pitch: 42, bearing: 8 },
    defaultAction:
      "Hold the bazaar safe on Walking-Street nights; brief stallholders on counterfeit-goods raids and counterfeit alcohol seizures.",
  },
  {
    id: "highway-11",
    label: "Highway 11 / Lampang Approach",
    aliases: ["highway 11", "lampang", "south approach"],
    view: { longitude: 99.06, latitude: 18.62, zoom: 10.0, pitch: 40, bearing: -6 },
    defaultAction:
      "Keep the Highway 11 spine moving; coordinate detours early if rain closes low sections south of the city.",
  },
  {
    id: "hmong-village",
    label: "Doi Pui Hmong Village",
    aliases: ["doi pui", "hmong", "village", "tribal", "kuala mae yom"],
    view: { longitude: 98.894, latitude: 18.832, zoom: 13.2, pitch: 44, bearing: 14 },
    defaultAction:
      "Mind cultural-respect briefing at the Hmong craft village; watch water-table quality and forest-edge pressure.",
  },
];

export function findCnxCorridor(id: string) {
  return CNX_CORRIDORS.find((c) => c.id === id);
}

// ─── Satellite layer catalog ────────────────────────────────────
// Free, no-token raster layers (NASA GIBS + Esri) rendered above the
// basemap. Dated layers use yesterday's scan so tiles are guaranteed
// to exist.

export interface SatelliteLayerDefinition {
  id: string;
  label: string;
  shortLabel: string;
  source: string;
  opacity: number;
  maxZoom: number;
  tileTemplate: string;
}

function gibsDate(daysAgo = 1): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

export function buildSatelliteLayerCatalog(): SatelliteLayerDefinition[] {
  const date = gibsDate(1);
  return [
    {
      id: "viirs-true-color",
      label: "VIIRS True Color (daily)",
      shortLabel: "TRUE",
      source: "NASA GIBS / VIIRS SNPP",
      opacity: 0.78,
      maxZoom: 9,
      tileTemplate: `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_SNPP_CorrectedReflectance_TrueColor/default/${date}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`,
    },
    {
      id: "modis-flood-contrast",
      label: "MODIS 7-2-1 Flood Contrast",
      shortLabel: "FLOOD",
      source: "NASA GIBS / MODIS Terra",
      opacity: 0.8,
      maxZoom: 9,
      tileTemplate: `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_Bands721/default/${date}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`,
    },
    {
      id: "imerg-rain",
      label: "IMERG Precipitation Rate",
      shortLabel: "RAIN",
      source: "NASA GIBS / IMERG",
      opacity: 0.6,
      maxZoom: 6,
      tileTemplate: `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/IMERG_Precipitation_Rate/default/${date}/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png`,
    },
    {
      id: "modis-aerosol",
      label: "MODIS Aerosol Optical Depth (haze / PM2.5)",
      shortLabel: "HAZE",
      source: "NASA GIBS / MODIS Terra",
      opacity: 0.55,
      maxZoom: 7,
      tileTemplate: `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_Aerosol_Optical_Depth/default/${date}/GoogleMapsCompatible_Level7/{z}/{y}/{x}.png`,
    },
    {
      id: "night-lights",
      label: "VIIRS Night Lights",
      shortLabel: "LIGHTS",
      source: "NASA GIBS / VIIRS DNB",
      opacity: 0.55,
      maxZoom: 8,
      tileTemplate:
        "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_SNPP_DayNightBand_AtSensor_M15/default/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png",
    },
    {
      id: "esri-imagery",
      label: "Esri World Imagery (hi-res)",
      shortLabel: "HIRES",
      source: "Esri World Imagery",
      opacity: 0.95,
      maxZoom: 19,
      tileTemplate: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    },
  ];
}

export const CNX_SCENARIO_IDS = [
  "burning-season-peak",
  "monsoon-flood-watch",
  "songkran-surge-week",
  "stable-winter-day",
] as const;

export function normalizeCnxScenario(raw: string | null | undefined) {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  return (CNX_SCENARIO_IDS as readonly string[]).includes(v)
    ? (v as (typeof CNX_SCENARIO_IDS)[number])
    : null;
}