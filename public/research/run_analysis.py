#!/usr/bin/env python3
"""Reproduces every number and figure in the preprint from files collected by the CNX system.

Inputs (all committed under research/data or public/data/cnx, except the two relay
caches, whose derived series are frozen in research/data/ by `freeze`):
  public/data/cnx/data-library/index.json        311-dataset provincial open-data estate (baked 2026-09-19)
  public/data/cnx/open-data/index.json           682 catalogue resources (baked 2026-10-02)
  public/data/cnx/open-data/4a375627-…csv        official temporary shelter list (no coordinates)
  public/data/cnx/shelters.json                  the list geocoded by scripts/build-cnx-shelters.mjs
  public/data/cnx/burn-season.json               HII burned-area seasons
  research/data/manifest-2026-11-04.json         the board's own feed registry + live state
  research/data/water-frames.json, haze-pairs.json   frozen derived series from the relay caches
  src/lib/cnx/province-boundary.ts               OSM relation 1908771 outline

Run:  python3 research/analysis/run_analysis.py        (writes research/data/results.json and research/figures/*.pdf)
"""
import csv, datetime as dt, glob, json, math, re, statistics as st, subprocess, sys
from collections import Counter, defaultdict
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon

ROOT = Path(__file__).resolve().parents[2]
D = ROOT / "public/data/cnx"
R = ROOT / "research"
OUT = {}

# ── house style: serif, thin rules, single ink, one signal colour ───────────
plt.rcParams.update({
    "font.family": "serif", "font.serif": ["STIX Two Text", "STIXGeneral", "Times New Roman"],
    "mathtext.fontset": "stix", "font.size": 7.5, "axes.titlesize": 8, "axes.labelsize": 7.5,
    "xtick.labelsize": 7, "ytick.labelsize": 7, "legend.fontsize": 6.8, "axes.linewidth": 0.5,
    "xtick.major.width": 0.5, "ytick.major.width": 0.5, "axes.spines.top": False, "axes.spines.right": False,
    "pdf.fonttype": 42, "figure.dpi": 150,
})
INK, SIG, MID, LIGHT, COOL = "#1b1f23", "#b4231a", "#6b7280", "#d4d7dc", "#1e4e79"


def save(fig, name):
    fig.savefig(R / "figures" / f"{name}.pdf", bbox_inches="tight", pad_inches=0.02)
    plt.close(fig)


# ═══ 1 · the provincial open-data estate ═════════════════════════════════════
lib = json.load(open(D / "data-library/index.json"))
ds = lib["datasets"]
REF = dt.datetime(2026, 9, 19)  # the bake date

def age_years(s):
    return (REF - dt.datetime.fromisoformat(s[:19])).days / 365.25

ages = [age_years(d["modified"]) for d in ds]
orgs = Counter(d["org"] for d in ds)
tot = sum(orgs.values())
hhi = sum((v / tot) ** 2 for v in orgs.values())
top5 = orgs.most_common(5)
lic = Counter(d["license"] for d in ds)
fmts = Counter(f for d in ds for f in d["formats"])
dom = {x["key"]: x for x in lib["domains"]}
st_ = lib["stats"]
OUT["estate"] = {
    "datasets": len(ds), "resources": st_["resources"], "unreadable_resources": st_["unreadableResources"],
    "unreadable_share": st_["unreadableResources"] / st_["resources"],
    "ready": st_["readyDatasets"], "files_only": st_["filesOnly"], "link_only": st_["linkOnly"],
    "tables": st_["tables"], "rows": st_["rows"], "spatial": st_["spatial"], "spatial_share": st_["spatial"] / len(ds),
    "time_indexed": st_["timeIndexed"], "orgs": len(orgs), "hhi": hhi,
    "top1_org": top5[0][0], "top1_share": top5[0][1] / tot, "top2_share": (top5[0][1] + top5[1][1]) / tot,
    "orgs_with_one_dataset": sum(1 for v in orgs.values() if v == 1),
    "median_age_y": st.median(ages), "mean_age_y": st.mean(ages),
    "modified_within_1y": sum(a < 1 for a in ages), "older_than_3y": sum(a > 3 for a in ages),
    "licences": lic.most_common(), "formats": fmts.most_common(),
    "no_licence_share": lic["License not specified"] / len(ds),
    "domains": [{"key": k, "th": v["th"], "en": v["en"], "datasets": v["datasets"], "spatial": v["spatial"]} for k, v in dom.items()],
}
OUT["estate"]["realtime_formats"] = sum(v for f, v in fmts.items() if f in ("API", "WMS", "WFS"))

# chain-link search (titles + names + tags, both catalogues)
od = json.load(open(D / "open-data/index.json"))["datasets"]
TERMS = {
    "drainage": ["ท่อระบายน้ำ", "ระบบระบายน้ำ", "ท่อระบาย", "ทางระบายน้ำ", "drain"],
    "evacuation": ["อพยพ", "เส้นทางอพยพ", "evacuat"],
    "shelter": ["ศูนย์พักพิง"],
    "warning_tower": ["หอเตือนภัย"],
    "rainfall": ["ปริมาณน้ำฝน", "ปริมาณฝน", "น้ำฝน", "rainfall"],
    "flood_event": ["น้ำท่วม", "อุทกภัย", "flood"],
    "pm25": ["pm2.5", "pm 2.5", "ฝุ่น"],
    "fire_haze": ["จุดความร้อน", "hotspot", "ไฟป่า", "หมอกควัน"],
    "clean_air_room": ["ห้องปลอดฝุ่น", "ห้องสะอาด"],
    "procurement": ["จัดซื้อ", "จัดจ้าง", "e-gp", "procure"],
    "api_or_stream": ["api", "realtime", "real-time", "เรียลไทม์"],
}
def hit(d, terms, text):
    t = text.lower()
    return any(x.lower() in t for x in terms)
links = {}
for k, terms in TERMS.items():
    a = [d["title"] for d in ds if hit(d, terms, d["title"] + " " + d.get("name", ""))]
    b = [d["nameTh"] for d in od if hit(d, terms, d["nameTh"] + " " + " ".join(d.get("tags", [])))]
    links[k] = {"library": len(a), "catalogue_resources": len(b), "examples": a[:3]}
OUT["links"] = links

# the disaster domain, row by row
dis = [d for d in ds if d["domain"] == "disaster"]
OUT["disaster_domain"] = [
    {"title": d["title"], "org": d["org"], "modified": d["modified"][:10], "formats": d["formats"],
     "has_location": d["hasLocation"], "has_time": d["hasTime"], "status": d["status"], "rows": d["rows"]}
    for d in sorted(dis, key=lambda x: x["modified"], reverse=True)
]
OUT["disaster_summary"] = {
    "n": len(dis), "with_location": sum(d["hasLocation"] for d in dis),
    "provincial_office": sum(1 for d in dis if "สำนักงานจังหวัดเชียงใหม่" in d["org"]),
    "file_or_pdf_only": sum(1 for d in dis if d["status"] != "ready"),
    "latest_update": max(d["modified"][:10] for d in dis),
}

# ── fig: estate ─────────────────────────────────────────────────────────────
fig, ax = plt.subplots(1, 3, figsize=(7.1, 2.0), gridspec_kw={"width_ratios": [1.05, 1.1, 0.95]})
ax[0].hist([min(a, 6.99) for a in ages], bins=[i * 0.5 for i in range(0, 15)], color=MID, edgecolor="white", linewidth=0.4)
ax[0].axvline(OUT["estate"]["median_age_y"], color=SIG, lw=0.9)
ax[0].text(OUT["estate"]["median_age_y"] + 0.2, ax[0].get_ylim()[1] * 0.92, f"median {OUT['estate']['median_age_y']:.1f} y", color=SIG, fontsize=6.6)
ax[0].set_xlabel("Years since last update (7+ pooled)"); ax[0].set_ylabel("Datasets"); ax[0].set_title("(a) Age of the estate", loc="left")
top = orgs.most_common(8)
names = ["Provincial Office", "Provincial Treasury", "Pingkhonakhon PO", "Dept. of Provincial Admin.", "National Housing Auth.", "Dept. of Health", "Dept. of Public Relations", "Sericulture Dept."]
ax[1].barh(range(len(top))[::-1], [v for _, v in top], color=[SIG] + [MID] * 7)
ax[1].set_yticks(range(len(top))[::-1]); ax[1].set_yticklabels(names, fontsize=6.4)
ax[1].set_xlabel("Datasets"); ax[1].set_title(f"(b) {len(orgs)} publishers; top two hold {OUT['estate']['top2_share']*100:.0f}%", loc="left")
labels = ["Readable\nresources", "Unreadable\nresources"]
rd = st_["resources"] - st_["unreadableResources"]
ax[2].bar([0, 1], [rd, st_["unreadableResources"]], color=[MID, SIG], width=0.6)
ax[2].set_xticks([0, 1]); ax[2].set_xticklabels(labels, fontsize=6.6); ax[2].set_ylabel("Resources")
for x, v in zip([0, 1], [rd, st_["unreadableResources"]]):
    ax[2].text(x, v + 40, f"{v:,}", ha="center", fontsize=6.8)
ax[2].set_title(f"(c) {OUT['estate']['unreadable_share']*100:.0f}% unreadable", loc="left")
fig.tight_layout(w_pad=1.0); save(fig, "fig_estate")

# ═══ 2 · shelters: the list, its coordinates, its sanitation ═════════════════
rows = list(csv.reader(open(D / "open-data/4a375627-d76f-44d7-ac3f-d95651f0baee.csv", encoding="utf-8-sig")))[1:]
rows = [r for r in rows if len(r) >= 8 and r[1] != "อำเภอ"]
cap = [int(r[4]) for r in rows if r[4].strip().isdigit()]
toil = [int(r[7]) if r[7].strip().isdigit() else None for r in rows]
ratio = [c / t for c, t in zip([int(r[4]) for r in rows], toil) if t]
sj = json.load(open(D / "shelters.json"))
OUT["shelters"] = {
    "rows": len(rows), "capacity_total": sum(cap), "capacity_median": st.median(cap), "capacity_max": max(cap),
    "coordinates_in_source": 0, "geocode_counts": sj["counts"],
    "toilets_zero": sum(1 for t in toil if t == 0), "toilets_zero_share": sum(1 for t in toil if t == 0) / len(rows),
    "with_toilets": len(ratio), "people_per_toilet_median": st.median(ratio),
    "over_sphere_20": sum(1 for r in ratio if r > 20), "over_sphere_share_of_reporting": sum(1 for r in ratio if r > 20) / len(ratio),
    "districts": len(set(r[1] for r in rows)),
    "duplicates": sum(1 for s in sj["shelters"] if s.get("duplicateOf")),
}
cap_zero = sum(int(r[4]) for r, t in zip(rows, toil) if t == 0 and r[4].strip().isdigit())
OUT["shelters"]["capacity_without_toilet_reported"] = cap_zero
OUT["shelters"]["capacity_without_toilet_share"] = cap_zero / sum(cap)
# Sphere 2018: at most 20 people per toilet. Capacity a shelter can host to that standard:
cap_ok = sum(min(int(r[4]), 20 * t) for r, t in zip(rows, toil) if t is not None and r[4].strip().isdigit())
OUT["shelters"]["capacity_at_sphere_toilets"] = cap_ok
OUT["shelters"]["capacity_at_sphere_toilets_share"] = cap_ok / sum(cap)
dist_cap = defaultdict(lambda: [0, 0])
for r in rows:
    dist_cap[r[1]][0] += 1; dist_cap[r[1]][1] += int(r[4]) if r[4].strip().isdigit() else 0
OUT["shelters"]["by_district"] = {k: v for k, v in sorted(dist_cap.items(), key=lambda kv: -kv[1][0])}

# ── warning towers ──────────────────────────────────────────────────────────
tw = json.load(open(D / "data-library/datasets/69_021.json"))
trow = tw["tables"][0]["rows"]
towers = sorted({(r[3], r[4], r[5], r[6]) for r in trow})
OUT["towers"] = {"rows": len(trow), "unique_sites": len(towers), "years": sorted({r[1] for r in trow}), "sites": [{"tambon": a, "place": b, "lat": c, "lon": d_} for a, b, c, d_ in towers]}

def hav(a, b):
    p = math.pi / 180
    x = math.sin((b[0] - a[0]) * p / 2) ** 2 + math.cos(a[0] * p) * math.cos(b[0] * p) * math.sin((b[1] - a[1]) * p / 2) ** 2
    return 12742 * math.asin(math.sqrt(x))

ring_src = (ROOT / "src/lib/cnx/province-boundary.ts").read_text()
nums = re.findall(r"\[(-?\d+\.\d+),\s*(-?\d+\.\d+)\]", ring_src)
ring = [(float(a), float(b)) for a, b in nums]  # [lon, lat]
# spherical polygon area (Chamberlain–Duquette), R = mean Earth radius
lat0 = st.mean(p[1] for p in ring) * math.pi / 180
R_E = 6371.0088
tot = sum(math.radians(ring[(i + 1) % len(ring)][0] - ring[i][0]) * (2 + math.sin(math.radians(ring[i][1])) + math.sin(math.radians(ring[(i + 1) % len(ring)][1]))) for i in range(len(ring)))
area = abs(tot) * R_E * R_E / 2
OUT["province"] = {"ring_points": len(ring), "area_km2": area}
OUT["towers"]["km2_per_tower"] = area / len(towers)

placed = [s for s in sj["shelters"] if s["lat"] is not None and not s.get("duplicateOf")]
def nearest_tower(s):
    return min(hav((s["lat"], s["lon"]), (t[2], t[3])) for t in towers)
byprec = defaultdict(list)
for s in placed:
    byprec[s["precision"]].append(nearest_tower(s))
cov = {}
for p, v in byprec.items():
    cov[p] = {"n": len(v), "median_km": st.median(v), "within_2km": sum(x <= 2 for x in v), "within_5km": sum(x <= 5 for x in v)}
OUT["towers"]["shelter_distance_by_precision"] = cov
b = byprec.get("place", [])
OUT["towers"]["building_level_shelters"] = len(b)
OUT["towers"]["building_level_within_2km"] = sum(x <= 2 for x in b)
OUT["towers"]["building_level_within_5km"] = sum(x <= 5 for x in b)

# ── fig: map of towers & shelters ───────────────────────────────────────────
fig = plt.figure(figsize=(3.45, 4.2))
ax = fig.add_axes([0.0, 0.12, 1.0, 0.80])
ax.add_patch(Polygon([(lo, la) for lo, la in ring], closed=True, fill=False, ec=INK, lw=0.7))
colors = {"place": INK, "tambon": MID, "amphoe": LIGHT, "official": COOL}
for p in ("amphoe", "tambon", "place"):
    pts = [(s["lon"], s["lat"]) for s in placed if s["precision"] == p]
    ax.scatter(*zip(*pts), s={"amphoe": 6, "tambon": 6, "place": 9}[p], c=colors[p], ec="white" if p != "amphoe" else MID, lw=0.25, zorder=3 if p == "place" else 2, label={"amphoe": f"district point ({len(pts)})", "tambon": f"subdistrict point ({len(pts)})", "place": f"building ({len(pts)})"}[p])
ax.scatter([t[3] for t in towers], [t[2] for t in towers], marker="^", s=34, c=SIG, ec="white", lw=0.4, zorder=5, label=f"warning tower ({len(towers)})")
ax.set_aspect(1 / math.cos(lat0)); ax.axis("off")
ax.legend(loc="upper center", bbox_to_anchor=(0.5, -0.0), ncol=2, frameon=False, handletextpad=0.2, columnspacing=0.8, fontsize=6.2)
fig.text(0.0, 0.955, "Official shelters and warning towers", fontsize=7.8, fontweight="bold", ha="left")
fig.text(0.0, 0.925, f"Chiang Mai, {OUT['province']['area_km2']:,.0f} km² (OSM outline)", fontsize=6.6, color=MID, ha="left")
save(fig, "fig_map")

# ── fig: shelter capacity & sanitation ──────────────────────────────────────
fig, ax = plt.subplots(1, 2, figsize=(3.45, 1.85), gridspec_kw={"width_ratios": [1.2, 1]})
rr = [min(r, 120) for r in ratio]
ax[0].hist(rr, bins=range(0, 125, 10), color=MID, edgecolor="white", linewidth=0.4)
ax[0].axvline(20, color=SIG, lw=0.9); ax[0].text(22, ax[0].get_ylim()[1] * 0.86, "Sphere: 20", color=SIG, fontsize=6.4)
ax[0].set_xlabel("People per toilet (capped at 120)"); ax[0].set_ylabel("Shelters"); ax[0].set_title("(a) Reported sanitation", loc="left")
c = sj["counts"]
labs = ["building", "subdistrict", "district"]; vals = [c["place"], c["tambon"], c["amphoe"]]
ax[1].bar(range(3), vals, color=[INK, MID, LIGHT], edgecolor=MID, linewidth=0.4)
ax[1].set_xticks(range(3)); ax[1].set_xticklabels(labs, fontsize=6.4, rotation=18, ha="right"); ax[1].set_ylabel("Shelters")
for i, v in enumerate(vals): ax[1].text(i, v + 2, str(v), ha="center", fontsize=6.8)
ax[1].set_title("(b) Best location we can state", loc="left")
fig.tight_layout(w_pad=0.8); save(fig, "fig_shelters")

# ═══ 3 · the board's own registry and its observed reliability ═══════════════
man = json.load(open(R / "data/manifest-2026-11-04.json"))
E = man["entities"]
agencies = Counter(e["upstream"]["agency"] for e in E)
OUT["registry"] = {
    "entities": len(E), "with_slo": sum(1 for e in E if e["staleAfterSec"]), "on_time": man["slo"]["onTime"], "slo_total": man["slo"]["total"],
    "transport": dict(Counter(e["transport"] for e in E)), "kind": dict(Counter(e["kind"] for e in E)),
    "validation": dict(Counter(e["validation"] for e in E)),
    "agencies": len(agencies), "agency_names": sorted(agencies),
    "relay_share": sum(1 for e in E if e["transport"] == "relay") / len(E),
    "unvalidated_share": sum(1 for e in E if e["validation"] == "none") / len(E),
    "cadence_median_s": st.median(e["cadenceSec"] for e in E if e["cadenceSec"]),
    "named_failure_modes": sum(1 for e in E if e.get("failureMode")),
}

fig, ax = plt.subplots(figsize=(3.45, 2.5))
mk = {"direct": "o", "relay": "s", "baked": "D"}
col = {"measured": COOL, "satellite": INK, "model": MID, "vision": SIG, "derived": "#9ca3af", "static": "#cbd5e1"}
for e in E:
    if not (e["cadenceSec"] and e["staleAfterSec"]):
        continue
    ax.scatter(e["cadenceSec"] / 60, e["staleAfterSec"] / 60, marker=mk[e["transport"]], c=col[e["kind"]], s=22, ec="white", lw=0.3, alpha=0.95)
ax.set_xscale("log"); ax.set_yscale("log")
lim = [0.4, 3e4]; ax.plot(lim, lim, color=LIGHT, lw=0.7, ls="--"); ax.set_xlim(lim); ax.set_ylim(lim)
ax.set_xlabel("Refresh cadence (min)"); ax.set_ylabel("Declared staleness limit (min)")
from matplotlib.lines import Line2D
h = [Line2D([], [], marker=m, ls="", color=MID, ms=4, label=k) for k, m in mk.items()] + [Line2D([], [], marker="o", ls="", color=c, ms=4, label=k) for k, c in col.items() if k in {e["kind"] for e in E}]
ax.legend(handles=h, ncol=2, frameon=False, loc="lower right", handletextpad=0.2, columnspacing=0.8)
ax.set_title("Feed cadence and declared limit", loc="left")
save(fig, "fig_registry")

# ── frozen relay series: water cameras and haze pairs ───────────────────────
wf = json.load(open(R / "data/water-frames.json"))
cams = {}
for cam, frames in wf.items():
    obs = sorted(dt.datetime.fromisoformat(f["observedAt"].replace("Z", "+00:00")).timestamp() for f in frames)
    span = obs[-1] - obs[0]
    expected = int(span // 900) + 1
    gaps = [b - a for a, b in zip(obs, obs[1:])]
    lag = [f["firstSeenAt"] / 1000 - dt.datetime.fromisoformat(f["observedAt"].replace("Z", "+00:00")).timestamp() for f in frames]
    cams[cam] = {"frames": len(obs), "span_days": span / 86400, "expected_15min_slots": expected, "coverage": len(obs) / expected,
                 "max_gap_h": max(gaps) / 3600, "gaps_over_1h": sum(g > 3600 for g in gaps), "gaps_over_6h": sum(g > 6 * 3600 for g in gaps),
                 "median_lag_min": st.median(lag) / 60, "p90_lag_min": sorted(lag)[int(0.9 * len(lag))] / 60,
                 "first": dt.datetime.fromtimestamp(obs[0], dt.timezone.utc).strftime("%Y-%m-%d"), "last": dt.datetime.fromtimestamp(obs[-1], dt.timezone.utc).strftime("%Y-%m-%d")}
OUT["water_cameras"] = cams
fig, ax = plt.subplots(figsize=(3.45, 1.5))
for i, (cam, f) in enumerate(wf.items()):
    obs = sorted(dt.datetime.fromisoformat(x["observedAt"].replace("Z", "+00:00")) for x in f)
    ax.scatter(obs, [i] * len(obs), s=1.4, marker="|", c=INK, linewidths=0.35)
ax.set_yticks(range(len(wf))); ax.set_yticklabels([k.replace("dwr-", "") for k in wf], fontsize=6.2)
ax.set_title("Three flood cameras: every 15-min frame received", loc="left")
import matplotlib.dates as mdates
ax.xaxis.set_major_formatter(mdates.DateFormatter("%d %b")); ax.xaxis.set_major_locator(mdates.DayLocator(interval=3))
ax.tick_params(axis="x", labelsize=6.2)
save(fig, "fig_cameras")

hz = json.load(open(R / "data/haze-pairs.json"))
pm = [r["pm25"] for r in hz if r["pm25"] is not None]
OUT["haze_vision"] = {
    "frames": len(hz), "pairs_with_ground_pm25": len(pm), "pm25_min": min(pm), "pm25_median": st.median(pm), "pm25_max": max(pm),
    "pairs_pm25_over_37_5": sum(1 for x in pm if x > 37.5), "pairs_pm25_over_15": sum(1 for x in pm if x > 15),
    "span": [min(r["t"] for r in hz), max(r["t"] for r in hz)], "cameras": len({r["cam"] for r in hz}),
}

# ═══ 4 · burn seasons ═══════════════════════════════════════════════════════
bs = json.load(open(D / "burn-season.json"))
seasons = []
for s in bs["seasons"]:
    months = []
    for m in s["months"]:
        farm = sum((m["farmRai"] or {}).values()) if m["farmRai"] else None
        months.append({"month": m["month"], "farm_rai": farm, "forest_rai": m["forestRai"], "hotspots": m["hotspots"], "pm25_avg": m["pm25Avg"], "pm25_days_over": m["pm25DaysOver"]})
    seasons.append({"label_be": s["labelBE"], "months": months, "totals": s["totals"]})
OUT["burn"] = {"seasons": seasons, "top_districts_latest": bs["districtsLatest"][:6], "caveat": bs["caveat"]}
fig, ax = plt.subplots(figsize=(3.45, 1.9))
width = 0.38
for si, (s, off) in enumerate(zip(seasons[::-1], (-width / 2, width / 2))):
    xs = list(range(len(s["months"])))
    vals = [((m["farm_rai"] or 0) + (m["forest_rai"] or 0)) / 1000 for m in s["months"]]
    ax.bar([x + off for x in xs], vals, width=width, color=[MID, SIG][si], label=f"BE {s['label_be']} ({s['months'][0]['month'][:4]}–{s['months'][-1]['month'][:4]})")
ax.set_xticks(range(6)); ax.set_xticklabels(["Nov", "Dec", "Jan", "Feb", "Mar", "Apr"])
ax.set_ylabel("Burned area (10³ rai)"); ax.legend(frameon=False, loc="upper left"); ax.set_title("Monthly burned area, farm + forest", loc="left")
save(fig, "fig_burn")

# ═══ 5 · build history ═══════════════════════════════════════════════════════
log = subprocess.run(["git", "-C", str(ROOT), "log", "--reverse", "--format=%ad|%s", "--date=short"], capture_output=True, text=True).stdout.strip().splitlines()
days = Counter(l.split("|")[0] for l in log)
first, last = min(days), max(days)
def first_commit(pattern):
    for l in log:
        if re.search(pattern, l.split("|", 1)[1], re.I):
            return l.split("|")[0]
    return None
mile = {"first commit": first, "rain gauges on the board": first_commit(r"rain"), "official TMD warnings": first_commit(r"TMD|official warning"), "shelters geocoded": first_commit(r"shelter"), "48 h forecast field": first_commit(r"forecast"), "CAP 1.2 export": first_commit(r"CAP 1\.2")}
d0 = dt.date.fromisoformat(first)
OUT["build"] = {"commits": len(log), "first": first, "last": last, "active_days": len(days), "milestones": {k: {"date": v, "day": (dt.date.fromisoformat(v) - d0).days if v else None} for k, v in mile.items()}}
fig, ax = plt.subplots(figsize=(3.45, 1.7))
dd = sorted(days); cum = []; t = 0
for d_ in dd: t += days[d_]; cum.append(t)
xs = [dt.date.fromisoformat(d_) for d_ in dd]
ax.step(xs, cum, where="post", color=INK, lw=1)
def at(v):
    x = dt.date.fromisoformat(v); return x, cum[min(range(len(xs)), key=lambda i: abs((xs[i] - x).days))]
for label, v, dx, dy in [("rain gauges", mile["rain gauges on the board"], 4, 8), ("48 h forecast", mile["48 h forecast field"], -4, 12), ("TMD warnings, shelters,\nCAP export", mile["official TMD warnings"], -4, 12)]:
    x, y = at(v); ax.plot([x], [y], "o", color=SIG, ms=3)
    ax.annotate(label, (x, y), xytext=(dx, dy), textcoords="offset points", fontsize=5.8, ha="right" if dx < 0 else "left", va="bottom" if dy > 0 else "top")
ax.set_ylabel("Cumulative commits"); ax.xaxis.set_major_formatter(mdates.DateFormatter("%d %b")); ax.tick_params(axis="x", labelsize=6.2)
ax.set_title("Seven weeks of build history", loc="left")
save(fig, "fig_build")

# ═══ 6 · warning log (live, since 11 Oct) ═══════════════════════════════════
wl_path = R / "data/warning-log.json"
if wl_path.exists():
    wl = json.load(open(wl_path))
    OUT["warning_log"] = {"rows": len(wl), "by_domain": dict(Counter(r["domain"] for r in wl)), "first": min(r["at"] for r in wl)[:10], "last": max(r["at"] for r in wl)[:10]}

json.dump(OUT, open(R / "data/results.json", "w"), indent=2, ensure_ascii=False, default=float)
print("ok", {k: (len(v) if hasattr(v, "__len__") else v) for k, v in OUT.items()})
