"use client";

// Responsive operations board: measurements lead the desktop desk.
// Phones and tablets use a map plus selectable hazard/data panels; the
// measurement shortcut lets readers reach those panels without traversing
// the map. The social rail appears at 1024 px; the full desk at 1280 px.

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

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
import CnxTopBar, { VerdictStrip } from "./CNXTopBar";
import CnxFloodCamerasPanel from "./CNXFloodCamerasPanel";
import CnxRiverLevelPanel from "./CNXRiverLevelPanel";
import type { FloodCamera } from "../../lib/cnx/flood-cameras";
import type { RiverLevelResponse, RiverGauge } from "../../lib/cnx/river-level";
import CnxTicker from "./CNXTicker";
import CNXMap, { type WallFeature } from "./CNXMap";
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
  const [isHazeOpen, setIsHazeOpen] = useState(false);
  const [isBriefOpen, setIsBriefOpen] = useState(false);
  const [story, setStory] = useState<CnxStoryResponse | null>(null);
  const [flights, setFlights] = useState<FetchResult | null>(null);
  const [walls, setWalls] = useState<WallFeature[]>([]);
  const [waterways, setWaterways] = useState<Waterway[]>([]);
  const [heritage, setHeritage] = useState<CnxHeritageSite[]>([]);
  const [floodCameras, setFloodCameras] = useState<FloodCamera[]>([]);
  const [riverGauges, setRiverGauges] = useState<RiverGauge[]>([]);
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
    let cancelled = false;
    void fetchJsonOrNull<{ features?: WallFeature[] }>("/data/cnx/walls.geojson").then((d) => {
      if (!cancelled && d?.features) setWalls(d.features);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Waterways — one-time fetch from a baked GeoJSON, same as walls.
  // Baked (scripts/fetch-cnx-waterways.mjs) rather than fetched live
  // per-request: Overpass is too flaky for a cold-Worker-isolate fetch
  // to depend on, and rivers/streams don't change week to week.
  useEffect(() => {
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
  }, []);

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
    let cancelled = false;
    void fetchJsonOrNull<{ routes?: BusRoute[] }>("/data/cnx/bus-routes.geojson").then((d) => {
      if (!cancelled && d?.routes) setBusRoutes(d.routes);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // CMU internal shuttle — station + route-polyline geometry, one-time
  // fetch from baked JSON (see public/data/cnx/cmu-transit-*.json).
  // Live bus positions come separately via MQTT in CNXMap itself, only
  // while the operator has that layer toggled on.
  useEffect(() => {
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
  }, []);

  // 1-min core feed polling
  useEffect(() => {
    const load = async () => {
      const id = ++requestIdRef.current;
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      try {
        const [nextFlood, nextCctv, nextAir, nextFires, nextFiresRfd, nextAerosol, nextRiver] = await Promise.all([
          fetchJsonOrNull<CnxFloodResponse>(buildScenarioUrl("/api/cnx/flood", scenarioId), { signal: controller.signal }),
          fetchJsonOrNull<CctvFeedResponse>("/api/cnx/cctv", { signal: controller.signal }),
          fetchJsonOrNull<AirQualityResponse>("/api/cnx/air-quality", { signal: controller.signal }),
          fetchJsonOrNull<CnxFiresResponse>("/api/cnx/fires", { signal: controller.signal }),
          fetchJsonOrNull<RfdFiresResponse>("/api/cnx/fires-rfd", { signal: controller.signal }),
          fetchJsonOrNull<AerosolResponse>("/api/cnx/aerosol", { signal: controller.signal }),
          fetchJsonOrNull<RiverLevelResponse>("/api/cnx/river-level", { signal: controller.signal }),
        ]);
        if (controller.signal.aborted || id !== requestIdRef.current) return;
        if (nextFlood) setFlood(nextFlood);
        if (nextCctv) setCctv(nextCctv);
        if (nextAir) setAir(nextAir);
        if (nextFires) setFires(nextFires);
        if (nextFiresRfd) setFiresRfd(nextFiresRfd);
        if (nextAerosol) setAerosol(nextAerosol);
        if (nextRiver) setRiverGauges(nextRiver.gauges);
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

  // 3-min secondary
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [nextSocial, nextStory, nextWeatherLayers] = await Promise.all([
        fetchJsonOrNull<SocialListeningResponse>(buildScenarioUrl("/api/cnx/social", scenarioId)),
        fetchJsonOrNull<CnxStoryResponse>(buildScenarioUrl("/api/cnx/story", scenarioId)),
        fetchJsonOrNull<WeatherLayerUrls>("/api/cnx/weather-layers"),
      ]);
      if (!cancelled) {
        if (nextSocial) setSocial(nextSocial);
        if (nextStory) setStory(nextStory);
        if (nextWeatherLayers) setWeatherLayers(nextWeatherLayers);
      }
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
      const [nextDust, nextSmoke] = await Promise.all([
        fetchJsonOrNull<import("../../lib/cnx/dustboy").DustboyResponse>("/api/cnx/dustboy"),
        fetchJsonOrNull<import("../../lib/cnx/smoke-trajectory").SmokeTrajectoryResponse>("/api/cnx/smoke-trajectory"),
      ]);
      if (cancelled) return;
      if (nextDust) setDustboy(nextDust);
      if (nextSmoke) setSmoke(nextSmoke);
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
    "fire" | "air" | "flood" | "visitors" | "social" | "data" | "ask"
  >("air");

  return (
    <main
      id="main-content"
      tabIndex={-1}
      data-surface="cnx-dashboard"
      className="relative flex min-h-[100dvh] w-screen flex-col overflow-x-hidden bg-[var(--bg)] text-[var(--ink)] xl:h-[100dvh] xl:overflow-hidden"
    >
      <CnxTopBar
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

      <CnxCctvStrip feed={cctv} />

      {twin && <div className="border-t border-[var(--line)] p-2 lg:hidden">
        <VerdictStrip twin={twin} onOpenEmergency={() => setIsEmergencyOpen(true)} />
      </div>}

      <a href="#hazard-panels" className="flex min-h-[44px] items-center justify-center border-y border-[var(--line)] px-3 text-sm font-semibold text-[var(--cool)] xl:hidden">
        ดูค่าที่วัดได้ · View air, river &amp; fire readings ↓
      </a>

      <section className="relative flex min-h-0 flex-none overflow-hidden border-t border-[var(--line)] xl:flex-1">
        {/* Left rail — social sidebar. Visible from lg onwards on tablets,
            from xl onwards on desktop with full width. */}
        {layout.socialRail && <aside
          aria-label="Social listening stream"
          className="hidden min-h-0 w-[260px] shrink-0 overflow-y-auto border-r border-[var(--line)] lg:flex lg:flex-col xl:w-[280px] 2xl:w-[300px]"
        >
          {twin && <div className="shrink-0 border-b border-[var(--line)] p-2">
            <VerdictStrip twin={twin} onOpenEmergency={() => setIsEmergencyOpen(true)} />
          </div>}
          <div className="min-h-0 flex-1">
            <div className="h-full min-h-[240px]">
              <CnxSocialSidebar scenarioId={scenarioId} multilingualCountries={multilingualCountries} initialData={social} />
            </div>
          </div>
        </aside>}

        {/* Centre — map. Always visible; height is dynamic on mobile,
            fills the section on desktop. */}
        <section
          aria-label="Operational map"
          className="relative h-[55dvh] min-h-[340px] min-w-0 flex-none overflow-hidden border-r-0 sm:h-[60dvh] w-full lg:w-auto xl:h-auto xl:min-h-0 lg:flex-1"
        >
          <CNXMap
            flights={flightStates}
            heritage={heritage}
            floodCameras={floodCameras}
            riverGauges={riverGauges}
            airStations={air?.stations ?? []}
            fireHotspots={allFireHotspots}
            floodGauges={flood?.gauges ?? []}
            cctv={cctv?.slots ?? []}
            busRoutes={busRoutes}
            walls={walls}
            waterways={waterways}
            cmuStations={cmuStations}
            cmuRoutes={cmuRoutes}
            rtcLines={rtcLines}
            weatherLayers={weatherLayers}
            cameraHaze={hazeVision?.cameras ?? []}
            citizenReports={citizen?.reports ?? []}
            dustboyStations={dustboy?.provenance === "live" ? dustboy.stations.filter((s) => s.pm25 !== null) : []}
            smokeSegments={smoke?.provenance === "live" ? smoke.segments : []}
          />
        </section>

        {/* Right rail — operations desk. Visible from xl onwards. */}
        {layout.desktop && <aside
          aria-label="Operations desk"
          className="hidden w-[330px] shrink-0 border-l border-[var(--line)] xl:flex xl:flex-col xl:overflow-y-auto 2xl:w-[380px]"
        >
          {/* Measurements lead the desk; scenario context and tourism follow. */}
          <div className="h-[42%] min-h-[480px] shrink-0 overflow-hidden border-b border-[var(--line)]">
            <CnxRiverLevelPanel />
          </div>
          <div className="min-h-[260px] shrink-0 border-b border-[var(--line)]">
            <CnxAirQualityPanel />
          </div>
          <div className="h-[28%] min-h-[230px] shrink-0 overflow-hidden border-b border-[var(--line)]">
            <CnxFirePanel firms={fires} rfd={firesRfd} aerosol={aerosol} />
          </div>
          <div className="min-h-[260px] shrink-0 overflow-hidden border-b border-[var(--line)]">
            <CnxFloodPanel flood={flood} air={air} fires={fires} />
          </div>
          <div className="min-h-[260px] shrink-0 overflow-hidden border-b border-[var(--line)]">
            <CnxVisitorPanel onData={setVisitorAnalytics} />
          </div>
          <div className="shrink-0 border-b border-[var(--line)]"><CnxArrivalsPanel /></div>
          {outbound && <div className="shrink-0 border-b border-[var(--line)]"><CnxOutboundPanel snapshot={outbound} /></div>}
          <div className="min-h-[210px] shrink-0 overflow-hidden border-b border-[var(--line)]">
            <CnxFloodCamerasPanel />
          </div>
          <div className="min-h-[160px] shrink-0 overflow-hidden border-b border-[var(--line)]">
            <CnxOpenData onOpenWorkbench={() => setIsDataOpen(true)} />
          </div>
          <div className="min-h-[180px] flex-1 overflow-hidden border-t border-[var(--line)]">
            <CnxAskChat />
          </div>
        </aside>}
      </section>

      {/* Mobile / tablet panels stay available until the desktop desk appears. */}
      <section
        id="hazard-panels"
        tabIndex={-1}
        aria-label="Mobile panels"
        className="flex h-[64dvh] min-h-[440px] flex-col overflow-hidden border-t border-[var(--line)] bg-[var(--bg-raised)] xl:hidden"
      >
        <div
          role="group"
          aria-label="Switch panel"
          className="flex shrink-0 border-b border-[var(--line)] bg-[var(--bg-raised)] overflow-x-auto"
        >
          {(
            [
              { id: "air", label: "Air", icon: "🌫" },
              { id: "flood", label: "Flood", icon: "🌊" },
              { id: "fire", label: "Fire", icon: "🔥" },
              { id: "visitors", label: "Visitors", icon: "✈" },
              { id: "social", label: "Social", icon: "📰" },
              { id: "data", label: "Open Data", icon: "🗂" },
              { id: "ask", label: "Ask", icon: "🔍" },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              aria-label={t.label}
              aria-pressed={mobileTab === t.id}
              onClick={() => setMobileTab(t.id)}
              className={`flex min-h-[44px] min-w-[64px] flex-1 items-center justify-center gap-1 border-r border-[var(--line)] px-2 text-[11px] font-bold uppercase tracking-[0.14em] last:border-r-0 ${
                mobileTab === t.id ? "bg-[var(--bg)] text-[var(--ink)]" : "text-[var(--dim)]"
              }`}
            >
              <span aria-hidden="true">{t.icon}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto bg-[var(--bg-raised)]">
          {mobileTab === "fire" && <CnxFirePanel firms={fires} rfd={firesRfd} aerosol={aerosol} />}
          {mobileTab === "air" && <CnxAirQualityPanel />}
          {mobileTab === "flood" && <>
            <div className="h-[400px]"><CnxRiverLevelPanel /></div>
            <div className="h-[300px]"><CnxFloodPanel flood={flood} air={air} fires={fires} /></div>
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
          flood={flood}
          air={air}
          fires={fires}
          cctv={cctv}
          social={social}
          story={story}
          flights={flights}
        />
      </div>

      <CnxStoryModal story={story} isOpen={isStoryOpen} onClose={() => setIsStoryOpen(false)} />
      <CnxManualModal isOpen={isManualOpen} onClose={() => setIsManualOpen(false)} />
      <CnxAboutModal isOpen={isResearchOpen} onClose={() => setIsResearchOpen(false)} />
      <CnxDataLibraryModal isOpen={isDataOpen} onClose={() => setIsDataOpen(false)} />
      <CnxGovernorBrief isOpen={isBriefOpen} onClose={() => setIsBriefOpen(false)} air={air} dustboy={dustboy} fires={fires} twin={twin} />
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