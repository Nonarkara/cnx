import type { Metadata } from "next";
import CNXResearch, { type ResearchStats } from "../../../components/CNX/CNXResearch";
import { AboutPageHeader } from "../../../components/CNX/CNXPageChrome";
import results from "../../../../research/data/results.json";

export const metadata: Metadata = {
  title: "งานวิจัย — From Gauge to Shelter (preprint)",
  description:
    "Preprint: why Thailand's smart-city and digital-government promotion stalls between measurement and action, and a public-data system built around the gaps. Open data, code and references.",
};

const pct = (x: number) => Math.round(x * 100);

// Every figure shown on the page is read from the same results file the paper is built from,
// so the page and the PDF cannot disagree.
const stats: ResearchStats = {
  datasets: results.estate.datasets,
  resources: results.estate.resources,
  orgs: results.estate.orgs,
  unreadablePct: pct(results.estate.unreadable_share),
  spatial: results.estate.spatial,
  medianAge: Math.round(results.estate.median_age_y * 10) / 10,
  shelters: results.shelters.rows,
  shelterBuilding: results.shelters.geocode_counts.place,
  over20Pct: pct(results.shelters.over_sphere_share_of_reporting),
  towerSites: results.towers.unique_sites,
  towerMedianKm: Math.round(results.towers.shelter_distance_by_precision.place.median_km),
  entities: results.registry.entities,
  agencies: results.registry.agencies,
  buildDays: results.build.active_days,
  onTime: results.registry.on_time,
  sloTotal: results.registry.slo_total,
  pages: 9,
};

export default function CNXResearchPage() {
  return (
    <main data-surface="cnx-dashboard" className="min-h-[100dvh] bg-[var(--bg)] text-[var(--ink)]">
      <AboutPageHeader />
      <CNXResearch stats={stats} />
    </main>
  );
}
