"use client";

// Responsive operations board: measurements lead the desktop desk.
// Phones and tablets use a map plus selectable hazard/data panels; the
// measurement shortcut lets readers reach those panels without traversing
// the map. The social rail appears at 1024 px; the full desk at 1280 px.

import type { RainResponse } from "../../lib/cnx/rain";
import { buildHazeWatchState } from "../../lib/cnx/haze-watch-state";
import { currentRainSummary } from "../../lib/cnx/rain-core";
import CnxRainPanel from "./CNXRainPanel";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";

import { buildScenarioUrl, fetchJsonOrNull } from "../../lib/client-requests";
import type {
  AirQualityResponse,
  CctvFeedResponse,
  CnxFiresResponse,
  CnxFloodResponse,
  CnxHeritageSite,
  CnxStoryResponse,
  SocialListeningResponse,
} from "../../types/cnx";
import type { FetchResult } from "../../lib/cnx/opensky";
import type { RfdFiresResponse } from "../../lib/cnx/fire-rfd";
import type { AerosolResponse } from "../../lib/cnx/aerosol";
import type { OutboundAnalysis } from "../../lib/cnx/outbound";
import type { Waterway } from "../../lib/cnx/waterways";
import type { CmuStation, CmuRoute } from "../../lib/cnx/cmu-transit";
import type { RtcLine, RtcLinesFile } from "../../lib/cnx/rtc-bus-sim";
import type { WeatherLayerUrls } from "../../lib/cnx/weather-layers";
import type { BusRoute } from "../../types/cnx";

import CnxSocialSidebar from "./CNXSocialSidebar";
import CnxFloodPanel from "./CNXFloodPanel";
import CnxFirePanel from "./CNXFirePanel";
import CnxAirQualityPanel from "./CNXAirQualityPanel";
import CnxOutboundPanel from "./CNXOutboundPanel";
import CnxArrivalsPanel from "./CNXArrivalsPanel";
import CnxVisitorPanel, { type VisitorAnalytics } from "./CNXVisitorPanel";
import CnxAskChat from "./CNXAskChat";
import CnxOpenData from "./CNXOpenData";
import CnxCctvStrip from "./CNXCctvStrip";
import CnxTopBar, { VerdictBand } from "./CNXTopBar";
import CnxFloodCamerasPanel from "./CNXFloodCamerasPanel";
import CnxRiverLevelPanel from "./CNXRiverLevelPanel";
import type { FloodCamera } from "../../lib/cnx/flood-cameras";
import type { RiverLevelResponse, RiverGauge } from "../../lib/cnx/river-level";
import CnxTicker from "./CNXTicker";
import type { WallFeature } from "./CNXMap";
import CnxExecutiveOverview from "./CNXExecutiveOverview";
import CnxOperationalPulse from "./CNXOperationalPulse";
import CnxMetricEvidence from "./CNXMetricEvidence";
import CnxWatchBoard from "./CNXWatchBoard";
import CnxOutlookPanel from "./CNXOutlookPanel";
import CnxOperationalHandoff from "./CNXOperationalHandoff";
import CnxWaterVisionPanel from "./CNXWaterVisionPanel";
import type { WaterVisionResponse } from "../../lib/cnx/water-vision";
import { buildOperationalHandoff } from "../../lib/cnx/operational-handoff";
import { buildOutlook, currentForecast } from "../../lib/cnx/outlook";
import { isSheltersFile, type SheltersFile } from "../../lib/cnx/shelters";
import { buildExecutiveBrief, type ExecutiveMetric } from "../../lib/cnx/executive-brief";
import { useLang } from "../../hooks/useLang";

function MapLoading() {
  const { t } = useLang();
  return <div role="status" className="flex h-full items-center justify-center text-sm text-[var(--dim)]">{t("กำลังเปิดแผนที่…", "Opening operational map…")}</div>;
}
const CNXMap = dynamic(() => import("./CNXMap"), { ssr: false, loading: () => <MapLoading /> });
const CnxGlyphLegend = dynamic(() => import("./CNXGlyphLegend"), { ssr: false });

function CameraAccess({ feed, className = "", floating = false }: { feed: CctvFeedResponse | null; className?: string; floating?: boolean }) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  return <details className={`${floating ? "static" : "relative"} ${className}`} onToggle={event => setOpen(event.currentTarget.open)}>
    <summary className="flex min-h-11 w-fit cursor-pointer items-center gap-1.5 text-[12px] text-[var(--dim)]">
      <span className="font-semibold text-[var(--ink)]">CCTV</span>
      <span>{feed ? `${feed.reachableCount}/${feed.totalCount}` : "—"}</span><span aria-hidden="true">⌄</span>
      <span className="sr-only">{t("แหล่งภาพตอบสนอง · เปิดภาพและเวลาถ่าย", "image sources responding · open images and capture times")}</span>
    </summary>
    {open && <div className={floating ? "absolute right-2 top-full z-50 w-[min(36rem,calc(100vw-1rem))] border border-[var(--line)] bg-[var(--bg-raised)]" : "border border-[var(--line)]"}><CnxCctvStrip feed={feed} /></div>}
  </details>;
}
import CnxStoryModal from "./CNXStoryModal";
import CnxManualModal from "./CNXManualModal";
import CnxAboutModal from "./CNXAboutModal";
import CnxDataLibraryModal from "./CNXDataLibraryModal";
import CnxHazeModal from "./CNXHazeModal";
import CnxGovernorBrief from "./CNXGovernorBrief";
import CnxEmergencyModal from "./CNXEmergencyModal";
import { rfdToFireHotspot } from "../../lib/cnx/fire-rfd";

export default function CnxApp() {
  const [scenarioId, setScenarioId] = useState<string | null>(null);

  return (
    <>
      <Suspense fallback={null}>
        <ScenarioParamBridge onScenarioChange={setScenarioId} />
      </Suspense>
      <CnxShell scenarioId={scenarioId} />
    </>
  );
}

function ScenarioParamBridge({ onScenarioChange }: { onScenarioChange: (id: string | null) => void }) {
  const params = useSearchParams();
  const id = params.get("scenario");
  useEffect(() => {
    onScenarioChange(id);
  }, [onScenarioChange, id]);
  return null;
}

function CnxShell({ scenarioId }: { scenarioId: string | null }) {
  const { lang, t } = useLang();
  const [deskTab, setDeskTab] = useState<"watch" | "water" | "air" | "fire" | "model" | "visitors" | "cameras" | "data" | "ask">("watch");
  const [view, setView] = useState<"overview" | "map">("map");
  const [layout, setLayout] = useState({ desktop: false, socialRail: false });
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1280px)");
    const socialRail = window.matchMedia("(min-width: 1024px)");
    const update = () => setLayout({ desktop: desktop.matches, socialRail: socialRail.matches });
    update();
    desktop.addEventListener("change", update);
    socialRail.addEventListener("change", update);
    return () => {
      desktop.removeEventListener("change", update);
      socialRail.removeEventListener("change", update);
    };
  }, []);
  const [flood, setFlood] = useState<CnxFloodResponse | null>(null);
  const [social, setSocial] = useState<SocialListeningResponse | null>(null);
  const [cctv, setCctv] = useState<CctvFeedResponse | null>(null);
  const [air, setAir] = useState<AirQualityResponse | null>(null);
  const [fires, setFires] = useState<CnxFiresResponse | null>(null);
  const [firesRfd, setFiresRfd] = useState<RfdFiresResponse | null>(null);
  const [aerosol, setAerosol] = useState<AerosolResponse | null>(null);
  const [outbound, setOutbound] = useState<OutboundAnalysis | null>(null);
  const [busRoutes, setBusRoutes] = useState<BusRoute[]>([]);
  const [cmuStations, setCmuStations] = useState<CmuStation[]>([]);
  const [cmuRoutes, setCmuRoutes] = useState<Record<string, CmuRoute>>({});
  const [rtcLines, setRtcLines] = useState<RtcLine[]>([]);
  const [weatherLayers, setWeatherLayers] = useState<WeatherLayerUrls | null>(null);
  const [twin, setTwin] = useState<import("../../lib/cnx/twin").CnxTwinResponse | null>(null);
  const [dustboy, setDustboy] = useState<import("../../lib/cnx/dustboy").DustboyResponse | null>(null);
  const [smoke, setSmoke] = useState<import("../../lib/cnx/smoke-trajectory").SmokeTrajectoryResponse | null>(null);
  const [asmc, setAsmc] = useState<import("../../lib/cnx/asmc").AsmcResponse | null>(null);
  const [hazeVision, setHazeVision] = useState<import("../../lib/cnx/haze-vision").HazeVisionResponse | null>(null);
  const [citizen, setCitizen] = useState<import("../../lib/cnx/citizen-reports").CitizenResponse | null>(null);
  const [waterVision, setWaterVision] = useState<WaterVisionResponse | null>(null);
  const [isHazeOpen, setIsHazeOpen] = useState(false);
  const [isBriefOpen, setIsBriefOpen] = useState(false);
  const [story, setStory] = useState<CnxStoryResponse | null>(null);
  const [flights, setFlights] = useState<FetchResult | null>(null);
  const [walls, setWalls] = useState<WallFeature[]>([]);
  const [waterways, setWaterways] = useState<Waterway[]>([]);
  const [heritage, setHeritage] = useState<CnxHeritageSite[]>([]);
  const [floodCameras, setFloodCameras] = useState<FloodCamera[]>([]);
  const [riverGauges, setRiverGauges] = useState<RiverGauge[]>([]);
  const [rain, setRain] = useState<RainResponse | null>(null);
  const [forecast, setForecast] = useState<import("../../lib/cnx/wind-field").ForecastFieldResponse | null>(null);
  const [mapFocus, setMapFocus] = useState<{ longitude: number; latitude: number; zoom: number; key: number } | null>(null);
  const [shelters, setShelters] = useState<SheltersFile | null>(null);
  const [shelterFocus, setShelterFocus] = useState<{ amphoeTh: string | null; key: number } | null>(null);
  useEffect(() => {
    let cancelled = false;
    void fetch("/data/cnx/shelters.json")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: unknown) => { if (!cancelled && isSheltersFile(j)) setShelters(j); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);
  // The model field changes every few hours; 15 minutes keeps "now" current.
  // A cold refresh fans out to three model requests, so it gets a longer
  // timeout, and a miss retries in a minute rather than waiting 15.
  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    const load = async () => {
      const next = await fetchJsonOrNull<import("../../lib/cnx/wind-field").ForecastFieldResponse>("/api/cnx/forecast-field", { timeoutMs: 45_000 });
      if (cancelled) return;
      if (next) setForecast(next);
      timer = window.setTimeout(() => void load(), next?.field ? 15 * 60_000 : 60_000);
    };
    void load();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);
  const [rainClock, setRainClock] = useState(() => Date.now());
  useEffect(() => { const timer = window.setInterval(() => setRainClock(Date.now()), 60_000); return () => window.clearInterval(timer); }, []);
  const currentHaze = useMemo(() => buildHazeWatchState({ air, dustboy, hazeVision, citizen, smoke, now: rainClock }), [air, dustboy, hazeVision, citizen, smoke, rainClock]);
  const currentRain = useMemo(() => currentRainSummary(rain, rainClock), [rain, rainClock]);
  const operationalHandoff = useMemo(() => buildOperationalHandoff({ now: rainClock, rain: currentRain, gauges: riverGauges, smoke }), [rainClock, currentRain, riverGauges, smoke]);
  const operationalNotes = useMemo(() => operationalHandoff.map(row => ({ th: `${row.titleTh}: ${row.th} ${row.actionTh} · ${row.sourceUrl}`, en: `${row.titleEn}: ${row.en} ${row.actionEn} · ${row.sourceUrl}` })).concat([{ th: "ตรวจพยากรณ์ TMD ประจำวันและ 7 วันควบคู่ประกาศ CAP: https://www.tmd.go.th/forecast/daily · https://tmd.go.th/en/forecast/sevenday", en: "Check TMD daily and seven-day forecasts alongside CAP notices: https://www.tmd.go.th/forecast/daily · https://tmd.go.th/en/forecast/sevenday" }]), [operationalHandoff]);
  const activeForecast = useMemo(() => currentForecast(forecast, rainClock), [forecast, rainClock]);
  const outlook = useMemo(() => buildOutlook(activeForecast, shelters?.shelters ?? [], currentRain), [activeForecast, shelters, currentRain]);
  const showOnMap = (target: { lat: number; lon: number; amphoeTh: string | null }) => {
    const key = Date.now();
    setMapFocus({ longitude: target.lon, latitude: target.lat, zoom: target.amphoeTh ? 10.6 : 9.4, key });
    setShelterFocus({ amphoeTh: target.amphoeTh, key });
    setView("map");
  };
  const [visitorAnalytics, setVisitorAnalytics] = useState<VisitorAnalytics | null>(null);
  const [isStoryOpen, setIsStoryOpen] = useState(false);
  const [isManualOpen, setIsManualOpen] = useState(false);
  const [isResearchOpen, setIsResearchOpen] = useState(false);
  const [isDataOpen, setIsDataOpen] = useState(false);
  const [isEmergencyOpen, setIsEmergencyOpen] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);

  // Walls — one-time fetch from a baked GeoJSON. Walls don't change,
  // they only re-render when an OSM contributor updates the historic
  // city_wall tag. ~7.8 KB so the parse cost is negligible.
  useEffect(() => {
    if (view !== "map") return;
    let cancelled = false;
    void fetchJsonOrNull<{ features?: WallFeature[] }>("/data/cnx/walls.geojson").then((d) => {
      if (!cancelled && d?.features) setWalls(d.features);
    });
    return () => {
      cancelled = true;
    };
  }, [view]);

  // Waterways — one-time fetch from a baked GeoJSON, same as walls.
  // Baked (scripts/fetch-cnx-waterways.mjs) rather than fetched live
  // per-request: Overpass is too flaky for a cold-Worker-isolate fetch
  // to depend on, and rivers/streams don't change week to week.
  useEffect(() => {
    if (view !== "map") return;
    let cancelled = false;
    void fetchJsonOrNull<{
      features?: { properties: { id: number; name: string | null; category: Waterway["category"]; width: Waterway["width"] }; geometry: { coordinates: [number, number][] } }[];
    }>("/data/cnx/waterways.geojson").then((d) => {
      if (cancelled || !d?.features) return;
      setWaterways(
        d.features.map((f) => ({
          id: `w-${f.properties.id}`,
          name: f.properties.name ?? "",
          category: f.properties.category,
          width: f.properties.width,
          geometry: f.geometry.coordinates,
        })),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [view]);

  // Heritage — one-time fetch from the curated static API (12 sites,
  // 24 h server cache). Previously hardcoded to [] so the map's
  // heritage layer never had data.
  useEffect(() => {
    let cancelled = false;
    // Public flood/road cameras for the CNX area. The upstream catalogue
    // is ~906 KB and is already filtered and cached server-side, so this
    // is a small edge-cached read; 15 min matches the upstream TTL.
    void fetchJsonOrNull<{ cameras?: FloodCamera[] }>("/api/cnx/flood-cameras").then((d) => {
      if (!cancelled && d?.cameras) setFloodCameras(d.cameras);
    });
    void fetchJsonOrNull<{ sites?: CnxHeritageSite[] }>("/api/cnx/heritage").then((d) => {
      if (!cancelled && d?.sites) setHeritage(d.sites);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Bus routes — one-time fetch from a baked GeoJSON, same reasoning
  // as waterways (scripts/fetch-cnx-bus-routes.mjs): OSM route data
  // doesn't change week to week and a live Overpass call per request
  // was too flaky to be worth it.
  useEffect(() => {
    if (view !== "map") return;
    let cancelled = false;
    void fetchJsonOrNull<{ routes?: BusRoute[] }>("/data/cnx/bus-routes.geojson").then((d) => {
      if (!cancelled && d?.routes) setBusRoutes(d.routes);
    });
    return () => {
      cancelled = true;
    };
  }, [view]);

  // CMU internal shuttle — station + route-polyline geometry, one-time
  // fetch from baked JSON (see public/data/cnx/cmu-transit-*.json).
  // Live bus positions come separately via MQTT in CNXMap itself, only
  // while the operator has that layer toggled on.
  useEffect(() => {
    if (view !== "map") return;
    let cancelled = false;
    void fetchJsonOrNull<{ stations?: CmuStation[] }>("/data/cnx/cmu-transit-stations.json").then((d) => {
      if (!cancelled && d?.stations) setCmuStations(d.stations);
    });
    void fetchJsonOrNull<{ routes?: Record<string, CmuRoute> }>("/data/cnx/cmu-transit-routes.json").then((d) => {
      if (!cancelled && d?.routes) setCmuRoutes(d.routes);
    });
    void fetchJsonOrNull<RtcLinesFile>("/data/cnx/rtc-bus-lines.json").then((d) => {
      if (!cancelled && d?.lines) setRtcLines(d.lines);
    });
    return () => {
      cancelled = true;
    };
  }, [view]);

  // 1-min core feed polling
  useEffect(() => {
    const load = async () => {
      const id = ++requestIdRef.current;
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      try {
        // Each feed becomes visible as soon as it answers; a slow source
        // must not hold back the river, air, or satellite evidence.
        const apply = (commit: () => void) => {
          if (!controller.signal.aborted && id === requestIdRef.current) commit();
        };
        await Promise.all([
          fetchJsonOrNull<CnxFloodResponse>(buildScenarioUrl("/api/cnx/flood", scenarioId), { signal: controller.signal }).then((d) => d && apply(() => setFlood(d))),
          fetchJsonOrNull<CctvFeedResponse>("/api/cnx/cctv", { signal: controller.signal }).then((d) => d && apply(() => setCctv(d))),
          fetchJsonOrNull<AirQualityResponse>("/api/cnx/air-quality", { signal: controller.signal }).then((d) => d && apply(() => setAir(d))),
          fetchJsonOrNull<CnxFiresResponse>("/api/cnx/fires", { signal: controller.signal }).then((d) => d && apply(() => setFires(d))),
          fetchJsonOrNull<RfdFiresResponse>("/api/cnx/fires-rfd", { signal: controller.signal }).then((d) => d && apply(() => setFiresRfd(d))),
          fetchJsonOrNull<AerosolResponse>("/api/cnx/aerosol", { signal: controller.signal }).then((d) => d && apply(() => setAerosol(d))),
          fetchJsonOrNull<RiverLevelResponse>("/api/cnx/river-level", { signal: controller.signal }).then((d) => d && apply(() => setRiverGauges(d.gauges))),
          fetchJsonOrNull<RainResponse>("/api/cnx/rain", { signal: controller.signal }).then((d) => d && apply(() => setRain(d))),
        ]);
      } catch { /* abort-safe */ }
      void fetchJsonOrNull<OutboundAnalysis>("/api/cnx/outbound").then((o) => {
        if (o && id === requestIdRef.current) setOutbound(o);
      });
    };
    void load();
    const interval = window.setInterval(() => void load(), 60_000);
    return () => {
      requestIdRef.current += 1;
      controllerRef.current?.abort();
      window.clearInterval(interval);
    };
  }, [scenarioId]);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      const data = await fetchJsonOrNull<WaterVisionResponse>("/api/cnx/water-vision", { signal: controller.signal });
      if (!controller.signal.aborted) setWaterVision(data);
    };
    void load();
    const timer = window.setInterval(() => void load(), 5 * 60_000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, []);

  // 3-min secondary
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      await Promise.all([
        fetchJsonOrNull<SocialListeningResponse>(buildScenarioUrl("/api/cnx/social", scenarioId)).then((d) => { if (!cancelled && d) setSocial(d); }),
        fetchJsonOrNull<CnxStoryResponse>(buildScenarioUrl("/api/cnx/story", scenarioId)).then((d) => { if (!cancelled && d) setStory(d); }),
        fetchJsonOrNull<WeatherLayerUrls>("/api/cnx/weather-layers").then((d) => { if (!cancelled && d) setWeatherLayers(d); }),
      ]);
    };
    void load();
    const interval = window.setInterval(() => void load(), 3 * 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [scenarioId]);

  // 30-s flight polling
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const next = await fetchJsonOrNull<FetchResult>("/api/cnx/flights");
      if (!cancelled && next) setFlights(next);
    };
    void load();
    const interval = window.setInterval(() => void load(), 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  // 60-s province-level verdict poll. The verdict moves slowly enough that
  // faster polling just hammers the upstream feeds — and the topbar chip is
  // the operator's first glance, so it has to reflect the live state without
  // thrashing. Cache-Control s-maxage=60 keeps wall-of-12-viewers honest.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const next = await fetchJsonOrNull<import("../../lib/cnx/twin").CnxTwinResponse>(
        "/api/cnx/twin",
      );
      if (!cancelled && next) setTwin(next);
    };
    void load();
    const interval = window.setInterval(() => void load(), 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  // Haze season feeds. DustBoy is the public CMU ground network.
  // Smoke trajectory advects a live VIIRS pass across the 350 km window
  // (Shan State + northern Laos + Chiang Mai). ASMC stays empty until a
  // real API host exists. None of these fabricate readings.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      await Promise.all([
        fetchJsonOrNull<import("../../lib/cnx/dustboy").DustboyResponse>("/api/cnx/dustboy").then((d) => { if (!cancelled && d) setDustboy(d); }),
        fetchJsonOrNull<import("../../lib/cnx/smoke-trajectory").SmokeTrajectoryResponse>("/api/cnx/smoke-trajectory").then((d) => { if (!cancelled && d) setSmoke(d); }),
      ]);
    };
    void load();
    const interval = window.setInterval(() => void load(), 5 * 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const next = await fetchJsonOrNull<import("../../lib/cnx/asmc").AsmcResponse>(
        "/api/cnx/asmc",
      );
      if (!cancelled && next) setAsmc(next);
    };
    void load();
    const interval = window.setInterval(() => void load(), 5 * 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  // Webcam haze verdicts + citizen/news haze reports, both built by the
  // off-Cloudflare relay. Polled every 5 min (relay cadence is 10–15 min).
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [hv, cr] = await Promise.all([
        fetchJsonOrNull<import("../../lib/cnx/haze-vision").HazeVisionResponse>("/api/cnx/haze-vision"),
        fetchJsonOrNull<import("../../lib/cnx/citizen-reports").CitizenResponse>("/api/cnx/citizen"),
      ]);
      if (cancelled) return;
      if (hv) setHazeVision(hv);
      if (cr) setCitizen(cr);
    };
    void load();
    const interval = window.setInterval(() => void load(), 5 * 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable || t.closest('[role="dialog"]'))) return;
      if (e.key.toLowerCase() === "s" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setIsStoryOpen(true);
      }
      if (e.key.toLowerCase() === "m" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setIsManualOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const flightStates = flights ? [...flights.airborne, ...flights.ground] : [];

  const allFireHotspots = [
    ...(fires?.provenance === "live" ? fires.hotspots : []),
    ...(firesRfd?.hotspots ?? []).map(rfdToFireHotspot),
  ];

  const topOriginCountries = outbound
    ? outbound.byQuadrant
        .flatMap((q) => q.topOrigins.map((o) => o.country))
        .reduce<string[]>((acc, c) => (acc.includes(c) ? acc : [...acc, c]), [])
        .slice(0, 5)
    : [];

  // Merge outbound-heading + visitor-callsign country signals. Visitor
  // data is more accurate (callsign → ICAO airline → country), so we
  // surface those first and back-fill with the heading-derived list.
  const visitorSocialCountries = visitorAnalytics?.socialCountries ?? [];
  const multilingualCountries = [
    ...visitorSocialCountries,
    ...topOriginCountries.filter((c) => !visitorSocialCountries.includes(c)),
  ].slice(0, 5);

  // Mobile + tablet panel tab state
  const [mobileTab, setMobileTab] = useState<
    "watch" | "fire" | "air" | "flood" | "visitors" | "social" | "data" | "ask"
  >("watch");

  const [pendingEvidence, setPendingEvidence] = useState(false);
  const openMetric = (id: ExecutiveMetric["id"] | "model" | "watch" | "haze") => {
    if (id === "haze") {
      setIsHazeOpen(true);
      return;
    }
    setDeskTab(id === "mobility" ? "visitors" : id);
    setMobileTab(id === "water" || id === "model" ? "flood" : id === "mobility" ? "visitors" : id);
    setView("map");
    setPendingEvidence(true);
  };
  useEffect(() => {
    if (!pendingEvidence || view !== "map") return;
    const panel = document.getElementById(layout.desktop ? "operation-evidence" : "hazard-panels");
    panel?.focus({ preventScroll: true });
    if (!layout.desktop) panel?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    setPendingEvidence(false);
  }, [pendingEvidence, view, layout.desktop]);
  const metrics = buildExecutiveBrief({ air, dustboy, fires, twin, riverGauges, flights, rain, now: new Date(rainClock) }).metrics;
  const deskMetric = metrics.find(m => m.id === (deskTab === "visitors" ? "mobility" : deskTab));
  const mobileMetric = metrics.find(m => m.id === (mobileTab === "flood" ? "water" : mobileTab === "visitors" ? "mobility" : mobileTab));

  return (
    <main
      id="main-content"
      tabIndex={-1}
      data-surface="cnx-dashboard"
      lang={lang}
      className={`relative flex min-h-[100dvh] w-full flex-col overflow-x-hidden bg-[var(--bg)] text-[var(--ink)] ${view === "map" ? "xl:h-[100dvh] xl:overflow-hidden" : ""}`}
    >
      <CnxTopBar
        compact={view === "overview"}
        view={view}
        onChangeView={setView}
        flood={flood}
        air={air}
        fires={fires}
        firesRfd={firesRfd}
        aerosol={aerosol}
        social={social}
        cctv={cctv}
        story={story}
        flights={flights}
        scenarioId={scenarioId}
        topOrigins={visitorAnalytics?.topOrigins ?? []}
        twin={twin}
        dustboy={dustboy}
        asmc={asmc}
        smoke={smoke}
        onOpenStory={() => setIsStoryOpen(true)}
        onOpenManual={() => setIsManualOpen(true)}
        onOpenResearch={() => setIsResearchOpen(true)}
        onOpenData={() => setIsDataOpen(true)}
        onOpenHaze={() => setIsHazeOpen(true)}
        onOpenBrief={() => setIsBriefOpen(true)}
        onOpenEmergency={() => setIsEmergencyOpen(true)}
      />

      {scenarioId && <p className="border-b border-[var(--line)] px-5 py-2 text-sm text-[var(--dim)]">{t("มีบริบทสถานการณ์จำลอง ภาพรวมผู้บริหารไม่นับค่าจำลอง", "Scenario context is active; the executive overview excludes simulated readings.")}</p>}
      {view === "overview" ? (
        <CnxExecutiveOverview air={air} dustboy={dustboy} fires={fires} twin={twin} riverGauges={riverGauges} flights={flights} rain={rain} social={social} onOpenMap={() => setView("map")} onOpenBrief={() => setIsBriefOpen(true)} onOpenEmergency={() => setIsEmergencyOpen(true)} onOpenData={() => setIsDataOpen(true)} onOpenMetric={openMetric} />
      ) : <>
      <CnxOperationalPulse air={air} dustboy={dustboy} fires={fires} twin={twin} riverGauges={riverGauges} flights={flights} rain={rain} onOpenMetric={openMetric}><CameraAccess feed={cctv} floating className="hidden lg:block" /></CnxOperationalPulse>



      {/* The province verdict, as a band above the board.
          It used to sit in the 220 px news rail, where it took 273 px of a
          539 px column — the headline wraps to seven lines at that width —
          and left the news list a 30 px window onto 2 152 px of headlines
          while the footer still claimed 24 items. A band is wide enough for
          the headline in one or two lines, and it is not on the map: a
          verdict overlay covers the map's own layer control, a defect this
          board already paid for once (docs/SHIP-AUDIT.md). */}
      {twin && <VerdictBand twin={twin} now={rainClock} onOpenEmergency={() => setIsEmergencyOpen(true)} />}

      <section className="relative flex min-h-0 flex-none overflow-hidden border-t border-[var(--line)] lg:h-[60dvh] xl:h-auto xl:flex-1">
        {/* Left rail — social sidebar. Visible from lg onwards on tablets,
            from xl onwards on desktop with full width. */}
        {layout.socialRail && <aside
          aria-label={t("ข่าวและสื่อสังคม", "Social listening stream")}
          className="hidden min-h-0 w-[220px] shrink-0 overflow-y-auto border-r border-[var(--line)] lg:flex lg:flex-col"
        >
          {/* The verdict used to sit here, above the news, in this 220 px
              column. Measured on the live board it took 273 px of a 539 px
              rail (the headline wraps to seven lines at this width), which
              left the news list 30 px of window onto 2 152 px of headlines
              while the footer still claimed "24 items" — and at a 640 px
              tall window, 7 px. The verdict now rides the map, so this
              column carries only the news it is named for. */}
          <div className="min-h-0 flex-1">
            <div className="h-full min-h-[240px]">
              <CnxSocialSidebar scenarioId={scenarioId} multilingualCountries={multilingualCountries} initialData={social} />
            </div>
          </div>
        </aside>}

        {/* Centre — map. Always visible; height is dynamic on mobile,
            fills the section on desktop. */}
        <section
          aria-label={t("แผนที่ปฏิบัติการ", "Operational map")}
          className="relative h-[55dvh] min-h-[340px] min-w-0 flex-none overflow-hidden border-r-0 sm:h-[60dvh] w-full lg:w-auto xl:h-auto xl:min-h-0 lg:flex-1"
        >
          <CNXMap
            flights={flightStates}
            heritage={heritage}
            floodCameras={floodCameras}
            riverGauges={riverGauges}
            airStations={[...currentHaze.freshPcd, ...currentHaze.freshModel]}
            fireHotspots={allFireHotspots}
            floodGauges={flood?.provenance === "live" ? flood.gauges : []}
            cctv={cctv?.slots ?? []}
            busRoutes={busRoutes}
            walls={walls}
            waterways={waterways}
            cmuStations={cmuStations}
            cmuRoutes={cmuRoutes}
            rtcLines={rtcLines}
            weatherLayers={weatherLayers}
            cameraHaze={currentHaze.currentCameras}
            citizenReports={currentHaze.reports}
            rainStations={currentRain?.stations ?? []}
            rainAvailable={currentRain !== null}
            dustboyStations={currentHaze.freshDustboy}
            smokeSegments={currentHaze.currentSmoke ? smoke!.segments : []}
            smokeMethod={smoke?.method}
            forecast={activeForecast}
            focus={mapFocus}
            shelters={shelters?.shelters ?? []}
            shelterFocus={shelterFocus}
          />
          <CnxGlyphLegend />
        </section>

        {/* The desk changes topic without burying other hazards below long gauge lists. */}
        {layout.desktop && <aside aria-label={t("โต๊ะปฏิบัติการ", "Operations desk")} className="hidden min-h-0 w-[300px] shrink-0 flex-col border-l border-[var(--line)] bg-[var(--bg-raised)] xl:flex">
          <div role="group" aria-label={t("หัวข้อโต๊ะปฏิบัติการ", "Operations desk topics")} className="flex shrink-0 flex-wrap items-center gap-x-1 border-b border-[var(--line)] px-2">
          <button
            type="button"
            aria-pressed={deskTab === "watch"}
            onClick={() => setDeskTab("watch")}
            className={`min-h-11 shrink-0 border-b-2 px-1 text-[13px] ${deskTab === "watch" ? "border-[var(--cool)] text-[var(--ink)]" : "border-transparent text-[var(--dim)] hover:text-[var(--ink)]"}`}
          >
            <span className="text-[13px] font-semibold">{t("เฝ้าระวังทั้งจังหวัด", "Province watch")}</span>
          </button>
            {([
              { id: "water", label: "น้ำ", en: "Water" }, { id: "air", label: "อากาศ", en: "Air" },
              { id: "fire", label: "ไฟ", en: "Fire" }, { id: "model", label: "แบบจำลอง", en: "Models" },
              { id: "visitors", label: "การบิน", en: "Aviation" }, { id: "cameras", label: "กล้อง", en: "Cameras" },
              { id: "data", label: "ข้อมูล", en: "Data" }, { id: "ask", label: "ค้นหา", en: "Search" },
            ] as const).map((topic) => <button key={topic.id} type="button" aria-pressed={deskTab === topic.id} onClick={() => setDeskTab(topic.id)} className={`min-h-11 shrink-0 border-b-2 px-1 text-[13px] font-semibold ${deskTab === topic.id ? "border-[var(--cool)] text-[var(--ink)]" : "border-transparent text-[var(--dim)] hover:text-[var(--ink)]"}`}>{t(topic.label, topic.en)}</button>)}
          </div>
          <div id="operation-evidence" tabIndex={-1} className="min-h-0 flex-1 overflow-y-auto">
            {deskTab === "watch" && <>
              <CnxWatchBoard metrics={metrics} firesRfd={firesRfd} aerosol={aerosol} smoke={smoke} hazeVision={hazeVision} dustboy={dustboy} weatherLayers={weatherLayers} riverGauges={riverGauges} rain={rain} outlook={outlook} onOpenMetric={openMetric}
                afterWatch={<><CnxOutlookPanel outlook={outlook} shelters={shelters} onShowOnMap={showOnMap} /><CnxOperationalHandoff rows={operationalHandoff} onOpenMetric={openMetric} /></>} />
            </>}
            {deskMetric && <CnxMetricEvidence metric={deskMetric} />}
            {deskTab === "water" && <><CnxRainPanel rain={rain} /><div className="min-h-[350px]"><CnxRiverLevelPanel /></div><CnxWaterVisionPanel feed={waterVision} onShowOnMap={point => showOnMap({ ...point, amphoeTh: null })} /></>}
            {deskTab === "air" && <div className="h-full min-h-[300px]"><CnxAirQualityPanel /></div>}
            {deskTab === "fire" && <div className="h-full min-h-[230px]"><CnxFirePanel firms={fires} rfd={firesRfd} aerosol={aerosol} /></div>}
            {deskTab === "model" && <div className="h-full min-h-[300px]"><CnxFloodPanel flood={flood} air={air} fires={fires} outlook={outlook} /></div>}
            {deskTab === "visitors" && <><div className="h-[320px]"><CnxVisitorPanel onData={setVisitorAnalytics} /></div><CnxArrivalsPanel />{outbound && <CnxOutboundPanel snapshot={outbound} />}</>}
            {deskTab === "cameras" && <><div className="px-3"><CameraAccess feed={cctv} /></div><CnxWaterVisionPanel feed={waterVision} onShowOnMap={point => showOnMap({ ...point, amphoeTh: null })} /><CnxFloodCamerasPanel /></>}
            {deskTab === "data" && <CnxOpenData onOpenWorkbench={() => setIsDataOpen(true)} />}
            {deskTab === "ask" && <div className="h-full min-h-[240px]"><CnxAskChat /></div>}
          </div>
        </aside>}

      </section>

      {/* Mobile / tablet panels stay available until the desktop desk appears. */}
      <section
        id="hazard-panels"
        tabIndex={-1}
        aria-label={t("แผงข้อมูล", "Mobile panels")}
        className="flex h-[64dvh] min-h-[440px] flex-col overflow-hidden border-t border-[var(--line)] bg-[var(--bg-raised)] xl:hidden"
      >
        <div
          role="group"
          aria-label={t("เลือกแผงข้อมูล", "Switch panel")}
          className="flex shrink-0 border-b border-[var(--line)] bg-[var(--bg-raised)] overflow-x-auto"
        >
          {(
            [
              { id: "watch", label: t("เฝ้าระวัง", "Watch") },
              { id: "air", label: t("อากาศ", "Air") },
              { id: "flood", label: t("น้ำและฝน", "Water & rain") },
              { id: "fire", label: t("ไฟป่า", "Fire") },
              { id: "visitors", label: t("การบิน", "Aviation") },
              { id: "social", label: t("ข่าว", "News") },
              { id: "data", label: t("ข้อมูล", "Data") },
              { id: "ask", label: t("ค้นหา", "Search") },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              aria-label={t.label}
              aria-pressed={mobileTab === t.id}
              onClick={() => setMobileTab(t.id)}
              className={`flex min-h-[44px] min-w-max flex-none items-center justify-center gap-1 border-r border-[var(--line)] px-2 text-[11px] font-bold uppercase tracking-[0.14em] last:border-r-0 ${
                mobileTab === t.id ? "bg-[var(--bg)] text-[var(--ink)]" : "text-[var(--dim)]"
              }`}
            >
              <span>{t.label}</span>
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto bg-[var(--bg-raised)]">
          {mobileTab === "watch" && <>
              <CnxWatchBoard metrics={metrics} firesRfd={firesRfd} aerosol={aerosol} smoke={smoke} hazeVision={hazeVision} dustboy={dustboy} weatherLayers={weatherLayers} riverGauges={riverGauges} rain={rain} outlook={outlook} onOpenMetric={openMetric}
                afterWatch={<><CnxOutlookPanel outlook={outlook} shelters={shelters} onShowOnMap={showOnMap} /><CnxOperationalHandoff rows={operationalHandoff} onOpenMetric={openMetric} /></>} />
            </>}
          {mobileMetric && <CnxMetricEvidence metric={mobileMetric} />}
          {mobileTab === "fire" && <CnxFirePanel firms={fires} rfd={firesRfd} aerosol={aerosol} />}
          {mobileTab === "air" && <CnxAirQualityPanel />}
          {mobileTab === "flood" && <>
            <div className="px-3"><CameraAccess feed={cctv} /></div>
            <CnxRainPanel rain={rain} />
            <div className="h-[400px]"><CnxRiverLevelPanel /></div>
            <CnxWaterVisionPanel feed={waterVision} onShowOnMap={point => showOnMap({ ...point, amphoeTh: null })} />
            <div className="h-[300px]"><CnxFloodCamerasPanel /></div>
          </>}
          {mobileTab === "visitors" && <>
            <div className="h-[320px]"><CnxVisitorPanel onData={setVisitorAnalytics} /></div>
            <CnxArrivalsPanel />
            {outbound && <CnxOutboundPanel snapshot={outbound} />}
          </>}
          {mobileTab === "social" && (
            <CnxSocialSidebar scenarioId={scenarioId} multilingualCountries={multilingualCountries} initialData={social} />
          )}
          {mobileTab === "data" && <CnxOpenData onOpenWorkbench={() => setIsDataOpen(true)} />}
          {mobileTab === "ask" && <CnxAskChat />}
        </div>
      </section>

      <div className="sticky bottom-0 z-50 shrink-0 border-t border-[var(--line)] xl:static">
        <CnxTicker
          metrics={metrics}
          fires={fires}
          cctv={cctv}
          social={social}
          story={story}
          flights={flights}
        />
      </div>

      </>}

      <CnxStoryModal story={story} isOpen={isStoryOpen} onClose={() => setIsStoryOpen(false)} />
      <CnxManualModal isOpen={isManualOpen} onClose={() => setIsManualOpen(false)} />
      <CnxAboutModal isOpen={isResearchOpen} onClose={() => setIsResearchOpen(false)} />
      <CnxDataLibraryModal isOpen={isDataOpen} onClose={() => setIsDataOpen(false)} />
      <CnxGovernorBrief isOpen={isBriefOpen} onClose={() => setIsBriefOpen(false)} onOpenMetric={openMetric} air={air} dustboy={dustboy} fires={fires} twin={twin} riverGauges={riverGauges} flights={flights} rain={rain} outlook={outlook} operationalNotes={operationalNotes} />
      <CnxHazeModal
        isOpen={isHazeOpen}
        onClose={() => setIsHazeOpen(false)}
        air={air}
        aerosol={aerosol}
        dustboy={dustboy}
        hazeVision={hazeVision}
        citizen={citizen}
        smoke={smoke}
      />
      <CnxEmergencyModal isOpen={isEmergencyOpen} onClose={() => setIsEmergencyOpen(false)} />
    </main>
  );
}
