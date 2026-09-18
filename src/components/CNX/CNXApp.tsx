"use client";

// CNX war room shell — TopBar, CctvStrip, SocialSidebar, CNXMap,
// FloodPanel, AirQualityPanel, OpenData, AskChat, Ticker, StoryModal,
// ManualModal, MobileDrawers.
//
// Layout breakpoints:
//
//   <  md (smartphone)         Stack: bar / cctv / map / panels / ticker.
//                                 Side rails collapse into a bottom "Panels" drawer.
//   md–lg (tablet portrait,    Same as mobile BUT side rails also visible
//           iPad)               (narrow). Map sizes up to fill the centre.
//   xl+    (desktop,           Full war-room: social sidebar left, map centre,
//           ≥1280px)            ops desk right (fire / flood / air / open / ask).
//
// All rail widths are clamped so iPad portrait (≈ 768 px) gets a clean
// 3-column layout. Mobile uses the same `MobileDrawers` component,
// which renders one tab at a time for the panels.

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
import CnxTopBar from "./CNXTopBar";
import CnxTicker from "./CNXTicker";
import CNXMap, { type WallFeature } from "./CNXMap";
import CnxStoryModal from "./CNXStoryModal";
import CnxManualModal from "./CNXManualModal";
import CnxAboutModal from "./CNXAboutModal";
import CnxEmergencyModal from "./CNXEmergencyModal";
import FlightPanel from "./FlightPanel";
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
  const [story, setStory] = useState<CnxStoryResponse | null>(null);
  const [flights, setFlights] = useState<FetchResult | null>(null);
  const [walls, setWalls] = useState<WallFeature[]>([]);
  const [waterways, setWaterways] = useState<Waterway[]>([]);
  const [heritage, setHeritage] = useState<CnxHeritageSite[]>([]);
  const [visitorAnalytics, setVisitorAnalytics] = useState<VisitorAnalytics | null>(null);
  const [isStoryOpen, setIsStoryOpen] = useState(false);
  const [isManualOpen, setIsManualOpen] = useState(false);
  const [isResearchOpen, setIsResearchOpen] = useState(false);
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
        const [nextFlood, nextCctv, nextAir, nextFires, nextFiresRfd, nextAerosol] = await Promise.all([
          fetchJsonOrNull<CnxFloodResponse>(buildScenarioUrl("/api/cnx/flood", scenarioId), { signal: controller.signal }),
          fetchJsonOrNull<CctvFeedResponse>("/api/cnx/cctv", { signal: controller.signal }),
          fetchJsonOrNull<AirQualityResponse>("/api/cnx/air-quality", { signal: controller.signal }),
          fetchJsonOrNull<CnxFiresResponse>("/api/cnx/fires", { signal: controller.signal }),
          fetchJsonOrNull<RfdFiresResponse>("/api/cnx/fires-rfd", { signal: controller.signal }),
          fetchJsonOrNull<AerosolResponse>("/api/cnx/aerosol", { signal: controller.signal }),
        ]);
        if (controller.signal.aborted || id !== requestIdRef.current) return;
        if (nextFlood) setFlood(nextFlood);
        if (nextCctv) setCctv(nextCctv);
        if (nextAir) setAir(nextAir);
        if (nextFires) setFires(nextFires);
        if (nextFiresRfd) setFiresRfd(nextFiresRfd);
        if (nextAerosol) setAerosol(nextAerosol);
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

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
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
    ...(fires?.hotspots ?? []),
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
  >("fire");

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
        onOpenStory={() => setIsStoryOpen(true)}
        onOpenManual={() => setIsManualOpen(true)}
        onOpenResearch={() => setIsResearchOpen(true)}
        onOpenEmergency={() => setIsEmergencyOpen(true)}
      />

      <CnxCctvStrip feed={cctv} />

      <section className="relative flex min-h-0 flex-none overflow-hidden border-t border-[var(--line)] xl:flex-1">
        {/* Left rail — social sidebar. Visible from lg onwards on tablets,
            from xl onwards on desktop with full width. */}
        <aside
          aria-label="Social listening stream"
          className="hidden w-[260px] shrink-0 border-r border-[var(--line)] lg:flex lg:flex-col xl:w-[280px] 2xl:w-[300px]"
        >
          <CnxSocialSidebar scenarioId={scenarioId} multilingualCountries={multilingualCountries} initialData={social} />
        </aside>

        {/* Centre — map. Always visible; height is dynamic on mobile,
            fills the section on desktop. */}
        <section
          aria-label="Operational map"
          className="relative h-[55dvh] min-h-[340px] min-w-0 flex-none overflow-hidden border-r-0 sm:h-[60dvh] lg:h-auto lg:min-h-0 lg:flex-1"
        >
          <CNXMap
            flights={flightStates}
            heritage={heritage}
            airStations={air?.stations ?? []}
            fireHotspots={allFireHotspots}
            floodGauges={flood?.gauges ?? []}
            busRoutes={busRoutes}
            walls={walls}
            waterways={waterways}
            cmuStations={cmuStations}
            cmuRoutes={cmuRoutes}
            rtcLines={rtcLines}
            weatherLayers={weatherLayers}
          />
          {flights && <FlightPanel snapshot={flights} />}
          {outbound && <CnxOutboundPanel snapshot={outbound} />}
          <CnxArrivalsPanel />
        </section>

        {/* Right rail — operations desk. Visible from xl onwards. */}
        <aside
          aria-label="Operations desk"
          className="hidden w-[330px] shrink-0 border-l border-[var(--line)] xl:flex xl:flex-col xl:overflow-hidden 2xl:w-[380px]"
        >
          <div className="min-h-[260px] shrink-0 overflow-hidden border-b border-[var(--line)]">
            <CnxVisitorPanel onData={setVisitorAnalytics} />
          </div>
          <div className="h-[28%] min-h-[230px] shrink-0 overflow-hidden border-b border-[var(--line)]">
            <CnxFirePanel firms={fires} rfd={firesRfd} aerosol={aerosol} />
          </div>
          <div className="min-h-0 flex-1 overflow-hidden border-b border-[var(--line)]">
            <CnxFloodPanel flood={flood} air={air} fires={fires} />
          </div>
          <div className="h-[36%] min-h-[260px] shrink-0 overflow-hidden border-b border-[var(--line)]">
            <CnxAirQualityPanel />
          </div>
          <div className="min-h-[160px] shrink-0 overflow-hidden border-b border-[var(--line)]">
            <CnxOpenData />
          </div>
          <div className="min-h-[180px] flex-1 overflow-hidden border-t border-[var(--line)]">
            <CnxAskChat />
          </div>
        </aside>
      </section>

      {/* Mobile / tablet collapsed panels — visible below lg. */}
      <section
        aria-label="Mobile panels"
        className="flex h-[64dvh] min-h-[440px] flex-col overflow-hidden border-t border-[var(--line)] bg-[var(--bg-raised)] lg:hidden xl:hidden"
      >
        <div
          role="tablist"
          aria-label="Switch panel"
          className="flex shrink-0 border-b border-[var(--line)] bg-[var(--bg-raised)] overflow-x-auto"
        >
          {(
            [
              { id: "fire", label: "Fire", icon: "🔥" },
              { id: "air", label: "Air", icon: "🌫" },
              { id: "flood", label: "Flood", icon: "🌊" },
              { id: "visitors", label: "Visitors", icon: "✈" },
              { id: "social", label: "Social", icon: "📰" },
              { id: "data", label: "Open Data", icon: "🗂" },
              { id: "ask", label: "Ask", icon: "🔍" },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              onClick={() => setMobileTab(t.id)}
              className={`flex min-h-[44px] min-w-[64px] flex-1 items-center justify-center gap-1 border-r border-[var(--line)] px-2 text-[11px] font-bold uppercase tracking-[0.14em] last:border-r-0 ${
                mobileTab === t.id ? "bg-[var(--bg)] text-[var(--ink)]" : "text-[var(--dim)]"
              }`}
            >
              <span aria-hidden="true">{t.icon}</span>
              <span className="hidden xs:inline sm:inline">{t.label}</span>
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto bg-[var(--bg-raised)]">
          {mobileTab === "fire" && <CnxFirePanel firms={fires} rfd={firesRfd} aerosol={aerosol} />}
          {mobileTab === "air" && <CnxAirQualityPanel />}
          {mobileTab === "flood" && <CnxFloodPanel flood={flood} air={air} fires={fires} />}
          {mobileTab === "visitors" && <CnxVisitorPanel onData={setVisitorAnalytics} />}
          {mobileTab === "social" && (
            <CnxSocialSidebar scenarioId={null} multilingualCountries={multilingualCountries} initialData={social} />
          )}
          {mobileTab === "data" && <CnxOpenData />}
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
      <CnxEmergencyModal isOpen={isEmergencyOpen} onClose={() => setIsEmergencyOpen(false)} />
    </main>
  );
}