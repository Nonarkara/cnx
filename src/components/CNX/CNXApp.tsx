"use client";

// CNX war room shell — TopBar, CctvStrip, SocialSidebar, CNXMap,
// FloodPanel, OpenData, Ticker, StoryModal, ManualModal.
//
// Mirror of LopburiApp but tuned for Chiang Mai: PM2.5 + FIRMS on
// the same desk as flood, heritage overlay on the map, manual that
// leads with the architecture diagram (per user preference for
// diagrams over text in About/Research panels).

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import { buildScenarioUrl, fetchJsonOrNull } from "../../lib/client-requests";
import type {
  AirQualityResponse,
  CctvFeedResponse,
  CnxFiresResponse,
  CnxFloodResponse,
  CnxStoryResponse,
  SocialListeningResponse,
} from "../../types/cnx";
import type { FetchResult } from "../../lib/cnx/opensky";
import type { RfdFiresResponse } from "../../lib/cnx/fire-rfd";
import type { AerosolResponse } from "../../lib/cnx/aerosol";
import type { OutboundAnalysis } from "../../lib/cnx/outbound";
import type { BusRoute } from "../../types/cnx";

import CnxSocialSidebar from "./CNXSocialSidebar";
import CnxFloodPanel from "./CNXFloodPanel";
import CnxFirePanel from "./CNXFirePanel";
import CnxOutboundPanel from "./CNXOutboundPanel";
import CnxAskChat from "./CNXAskChat";
import { rfdToFireHotspot } from "../../lib/cnx/fire-rfd";
import CnxCctvStrip from "./CNXCctvStrip";
import CnxTopBar from "./CNXTopBar";
import CnxTicker from "./CNXTicker";
import CNXMap from "./CNXMap";
import CnxOpenData from "./CNXOpenData";
import CnxStoryModal from "./CNXStoryModal";
import CnxManualModal from "./CNXManualModal";
import FlightPanel from "./FlightPanel";

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
  const [story, setStory] = useState<CnxStoryResponse | null>(null);
  const [flights, setFlights] = useState<FetchResult | null>(null);
  const [isStoryOpen, setIsStoryOpen] = useState(false);
  const [isManualOpen, setIsManualOpen] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);

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
      // Outbound is computed from flights; pull it after a short delay so
      // the snapshot store gets the write.
      void fetchJsonOrNull<OutboundAnalysis>("/api/cnx/outbound").then((o) => {
        if (o && id === requestIdRef.current) setOutbound(o);
      });
      void fetchJsonOrNull<{ routes: BusRoute[] }>("/api/cnx/bus-routes").then((b) => {
        if (b?.routes) setBusRoutes(b.routes);
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
      const [nextSocial, nextStory] = await Promise.all([
        fetchJsonOrNull<SocialListeningResponse>(buildScenarioUrl("/api/cnx/social", scenarioId)),
        fetchJsonOrNull<CnxStoryResponse>(buildScenarioUrl("/api/cnx/story", scenarioId)),
      ]);
      if (!cancelled) {
        if (nextSocial) setSocial(nextSocial);
        if (nextStory) setStory(nextStory);
      }
    };
    void load();
    const interval = window.setInterval(() => void load(), 3 * 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [scenarioId]);

  // 30-s flight polling — keep the existing API path
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

  // Merge FIRMS + RFD hotspots so RFD's official Thai forest-tenure
  // detection sits alongside NASA's global FIRMS on the map.
  const allFireHotspots = [
    ...(fires?.hotspots ?? []),
    ...(firesRfd?.hotspots ?? []).map(rfdToFireHotspot),
  ];

  // Top origin countries from the outbound analysis feed the social
  // listening subscription list — the panel then pulls news in those
  // languages. This is the "follow the flight" pattern.
  const topOriginCountries = outbound
    ? outbound.byQuadrant
        .flatMap((q) => q.topOrigins.map((o) => o.country))
        .reduce<string[]>((acc, c) => (acc.includes(c) ? acc : [...acc, c]), [])
        .slice(0, 5)
    : [];

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
        onOpenStory={() => setIsStoryOpen(true)}
        onOpenManual={() => setIsManualOpen(true)}
      />

      <CnxCctvStrip feed={cctv} />

      <section className="relative flex min-h-0 flex-none overflow-hidden border-t border-[var(--line)] xl:flex-1">
        {/* Left: Social listening */}
        <aside
          aria-label="Social listening stream"
          className="hidden w-[260px] shrink-0 xl:block 2xl:w-[300px]"
        >
          <CnxSocialSidebar scenarioId={scenarioId} multilingualCountries={topOriginCountries} />
        </aside>

        {/* Center: Map */}
        <section
          aria-label="Operational map"
          className="relative h-[44dvh] min-h-[330px] min-w-0 flex-none overflow-hidden sm:h-[48dvh] sm:min-h-[380px] xl:h-auto xl:min-h-0 xl:flex-1"
        >
          <CNXMap
            flights={flightStates}
            heritage={[]} // heritage list is large — pass via /api/cnx/heritage if you want it on map
            airStations={air?.stations ?? []}
            fireHotspots={allFireHotspots}
            floodGauges={flood?.gauges ?? []}
            busRoutes={busRoutes}
          />
          {flights && <FlightPanel snapshot={flights} />}
          {outbound && <CnxOutboundPanel snapshot={outbound} />}
        </section>

        {/* Right: Fire / Flood / Air / Open Data — Fire on top per governor's priority */}
        <aside
          aria-label="Operations desk"
          className="hidden w-[360px] shrink-0 xl:flex xl:flex-col xl:overflow-hidden 2xl:w-[420px]"
        >
          <div className="h-[34%] min-h-[230px] shrink-0 overflow-hidden border-b border-[var(--line)]">
            <CnxFirePanel firms={fires} rfd={firesRfd} aerosol={aerosol} />
          </div>
          <div className="min-h-0 flex-1 overflow-hidden border-b border-[var(--line)]">
            <CnxFloodPanel flood={flood} air={air} fires={fires} />
          </div>
          <div className="min-h-[180px] shrink-0 overflow-hidden border-b border-[var(--line)]">
            <CnxOpenData />
          </div>
          <div className="min-h-[220px] flex-1 overflow-hidden border-t border-[var(--line)]">
            <CnxAskChat />
          </div>
        </aside>
      </section>

      {/* Mobile stack */}
      <section
        aria-label="Mobile stack"
        className="flex h-[68dvh] min-h-[560px] max-h-[760px] flex-col overflow-hidden border-t border-[var(--line)] bg-[var(--bg-raised)] xl:hidden"
      >
        <MobileTabContent flood={flood} air={air} fires={fires} firesRfd={firesRfd} aerosol={aerosol} topOriginCountries={topOriginCountries} />
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
    </main>
  );
}

import type { JSX } from "react";
function MobileTabContent({ flood, air, fires, firesRfd, aerosol, topOriginCountries }: {
  flood: CnxFloodResponse | null;
  air: AirQualityResponse | null;
  fires: CnxFiresResponse | null;
  firesRfd: RfdFiresResponse | null;
  aerosol: AerosolResponse | null;
  topOriginCountries: string[];
}): JSX.Element {
  const [tab, setTab] = useState<"fire" | "flood" | "social" | "opendata">("fire");
  return (
    <>
      <div role="tablist" className="flex shrink-0 border-b border-[var(--line)] bg-[var(--bg-raised)]">
        {(
          [
            { id: "fire", label: "Fire" },
            { id: "flood", label: "Flood/Air" },
            { id: "social", label: "Social" },
            { id: "opendata", label: "Open" },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex min-h-[44px] flex-1 items-center justify-center gap-2 border-r border-[var(--line)] px-3 text-[10px] font-bold uppercase tracking-[0.18em] last:border-r-0 ${
              tab === t.id ? "bg-[var(--bg-raised)] text-[var(--ink)]" : "text-[var(--dim)]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden bg-[var(--bg-raised)]">
        {tab === "fire" && <CnxFirePanel firms={fires} rfd={firesRfd} aerosol={aerosol} />}
        {tab === "flood" && <CnxFloodPanel flood={flood} air={air} fires={fires} />}
        {tab === "social" && <CnxSocialSidebar scenarioId={null} multilingualCountries={topOriginCountries} />}
        {tab === "opendata" && <CnxOpenData />}
      </div>
    </>
  );
}