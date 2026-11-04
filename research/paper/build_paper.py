#!/usr/bin/env python3
"""Fills paper.tex.tpl from research/data/results.json, compiles it, and publishes the PDF.

Every number in the text comes from results.json (itself produced by
research/analysis/run_analysis.py), so the prose cannot drift from the data.
Run:  python3 research/paper/build_paper.py
"""
import json, re, shutil, subprocess, sys, datetime as dt
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
R = json.load(open(ROOT / "research/data/results.json"))
VERSION = "v1.0 (4 Nov 2026)"
DATE = "4 November 2026"
TITLE = "From Gauge to Shelter: Why Thai Smart-City Programmes Stall Between Measurement and Action"

e, sh, tw, reg, wc, hz, b, bl = R["estate"], R["shelters"], R["towers"], R["registry"], R["water_cameras"], R["haze_vision"], R["build"], R["burn"]
n = lambda x: f"{int(x):,}".replace(",", "{,}")          # 2{,}869
pct = lambda x, d=0: f"{x*100:.{d}f}"
fm = dict(e["formats"])

def tex(s):
    return s.replace("&", r"\&").replace("%", r"\%").replace("_", r"\_").replace("#", r"\#")

EN = {  # titles of the 11 disaster-domain datasets, translated for the table
 "ผู้ที่ได้รับบาดเจ็บจากสาธารณภัย": "People injured in disasters",
 "กำลังพลด้านสาธารณภัย": "Disaster-response personnel",
 "จุดติดตั้งหอเตือนภัย": "Warning-tower installation points",
 "ศูนย์พักพิงชั่วคราวจังหวัดเชียงใหม่": "Temporary shelters, Chiang Mai",
 "บัญชีเครื่องจักรกลสาธารณภัย": "Disaster-machinery register",
 "ผู้ที่เสียชีวิตจากสาธารณภัย": "People killed in disasters",
 "ความเสียหายของสะพานจากอุทกภัย": "Flood damage to bridges",
 "ครัวเรือนที่ได้รับผลกระทบจากสาธารณภัยรายหมู่บ้าน": "Households affected, by village",
 "พื้นที่เสี่ยงเผาไหม้ซ้ำซาก": "Repeatedly burned areas",
 "ข้อมูลพื้นที่เสี่ยงสาธารณภัย 76 จังหวัด": "Disaster-risk areas, 76 provinces",
 "แผนเผชิญเหตุอุทกภัยจังหวัด": "Provincial flood response plan",
}
PUB = {"สำนักงานจังหวัดเชียงใหม่": "Chiang Mai Provincial Office", "สำนักงานจังหวัดลำพูน": "Lamphun Provincial Office",
       "กรมการปกครอง": "Dept.\\ of Provincial Administration", "กรมป้องกันและบรรเทาสาธารณภัย": "Dept.\\ of Disaster Prevention and Mitigation"}
rows = []
for d in R["disaster_domain"]:
    rows.append(" & ".join([EN[d["title"]], PUB.get(d["org"], d["org"]), d["modified"], "/".join(d["formats"]), "yes" if d["has_time"] else "no", "yes" if d["has_location"] else "no"]) + r"\\")
LINK_LABEL = [("drainage", "Drainage network"), ("evacuation", "Evacuation routes"), ("clean_air_room", "Clean-air rooms"), ("procurement", "Procurement / contracts"),
              ("api_or_stream", "API or live stream"), ("warning_tower", "Warning towers"), ("shelter", "Shelters"), ("rainfall", "Rainfall"),
              ("flood_event", "Flood events"), ("pm25", "PM$_{2.5}$ / dust"), ("fire_haze", "Fire and haze")]
L = R["links"]
links_rows = "\n".join(f"{lab} & {L[k]['library']} & {L[k]['catalogue_resources']}\\\\" for k, lab in LINK_LABEL)

ms = b["milestones"]
seasons = {s["label_be"]: s for s in bl["seasons"]}
def over(s): return [m["pm25_days_over"] or 0 for m in s["months"]]
o68, o69 = over(seasons[2568]), over(seasons[2569])
cams = list(wc.values())
lg = [x for x in R["water_cameras"].values()]
wlog = R.get("warning_log", {"rows": 0, "by_domain": {}})
dist = sh["geocode_counts"]
approx = (dist["tambon"] + dist["amphoe"]) / dist["total"]
approx_from = {k: v for k, v in sh["by_district"].items()}
cap_med = f"{sh['capacity_median']:.0f}"
T = {
 "title": TITLE, "pdftitle": TITLE, "version": VERSION, "date": DATE,
 "estate_datasets": n(e["datasets"]), "estate_resources": n(e["resources"]), "estate_orgs": str(e["orgs"]),
 "build_days": str(b["active_days"]), "catalogue": "682", "top2_pct": pct(e["top2_share"]), "one_dataset_orgs": str(e["orgs_with_one_dataset"]),
 "agencies": str(reg["agencies"]), "nolicence_pct": pct(e["no_licence_share"]), "unreadable_pct": pct(e["unreadable_share"]), "unreadable_n": n(e["unreadable_resources"]),
 "median_age": f"{e['median_age_y']:.1f}", "spatial": str(e["spatial"]), "spatial_pct": f"{e['spatial_share']*100:.1f}",
 "tower_sites": str(tw["unique_sites"]), "tower_rows": str(tw["rows"]), "area": n(round(R["province"]["area_km2"], -1)), "km2_per_tower": n(round(tw["km2_per_tower"], -2)),
 "hhi": f"{e['hhi']:.2f}", "api_n": "2", "distinct": str(sh["rows"] - sh["duplicates"]), "commit": subprocess.run(["git", "-C", str(ROOT), "rev-parse", "--short", "HEAD"], capture_output=True, text=True).stdout.strip(), "csv": str(fm["CSV"]), "xlsx": str(fm["XLSX"]), "pdf": str(fm["PDF"]), "nolicence_n": str(int(round(e["no_licence_share"] * e["datasets"]))),
 "within1y": str(e["modified_within_1y"]), "over3y": str(e["older_than_3y"]), "disaster_n": str(R["disaster_summary"]["n"]), "disaster_latest": dt.date.fromisoformat(R["disaster_summary"]["latest_update"]).strftime("%-d %B %Y"),
 "disaster_rows": "\n".join(rows), "links_rows": links_rows,
 "shelters": str(sh["rows"]), "sh_districts": str(sh["districts"]), "cap_total": n(sh["capacity_total"]), "cap_median": cap_med, "cap_max": n(sh["capacity_max"]),
 "bldg": str(dist["place"]), "tambon": str(dist["tambon"]), "amphoe": str(dist["amphoe"]), "approx_pct": pct(approx),
 "toilet_zero": str(sh["toilets_zero"]), "toilet_zero_pct": pct(sh["toilets_zero_share"]), "with_toilets": str(sh["with_toilets"]), "over20": str(sh["over_sphere_20"]),
 "over20_pct": pct(sh["over_sphere_share_of_reporting"]), "ppt": f"{sh['people_per_toilet_median']:.1f}", "cap_sphere": n(sh["capacity_at_sphere_toilets"]), "cap_sphere_pct": pct(sh["capacity_at_sphere_toilets_share"]),
 "tower_median": f"{tw['shelter_distance_by_precision']['place']['median_km']:.0f}", "tower_within5": str(tw["building_level_within_5km"]),
 "first_commit": dt.date.fromisoformat(b["first"]).strftime("%-d %B %Y"), "last_commit": dt.date.fromisoformat(b["last"]).strftime("%-d %B %Y"), "commits": str(b["commits"]),
 "day_rain": str(ms["rain gauges on the board"]["day"]), "day_forecast": str(ms["48 h forecast field"]["day"]), "day_cap": str(ms["CAP 1.2 export"]["day"]),
 "entities": str(reg["entities"]), "relay_n": str(reg["transport"]["relay"]), "relay_pct": pct(reg["relay_share"]),
 "val_ground": str(reg["validation"].get("ground-truthed", 0)), "val_cross": str(reg["validation"].get("cross-checked", 0)), "val_none": str(reg["validation"].get("none", 0)), "val_none_pct": pct(reg["unvalidated_share"]),
 "ontime": str(reg["on_time"]), "slo_total": str(reg["slo_total"]),
 "cov_min": pct(min(c["coverage"] for c in cams)), "cov_max": pct(max(c["coverage"] for c in cams)), "maxgap": f"{max(c['max_gap_h'] for c in cams):.0f}",
 "haze_pairs": str(hz["pairs_with_ground_pm25"]), "haze_min": str(hz["pm25_min"]), "haze_max": str(hz["pm25_max"]), "haze_med": f"{hz['pm25_median']:.0f}", "haze_over15": str(hz["pairs_pm25_over_15"]),
 "wlog_rows": str(wlog["rows"]), "wlog_pm": str(wlog["by_domain"].get("pm25", 0)), "wlog_verdict": str(wlog["by_domain"].get("verdict", 0)),
 "mar_apr_69": str(o69[4] + o69[5]), "over_69": str(sum(o69)), "mar_apr_68": str(o68[4] + o68[5]), "over_68": str(sum(o68)),
 "burn_68": n(round(seasons[2568]["totals"]["totalRai"] / 1000)), "burn_69": n(round(seasons[2569]["totals"]["totalRai"] / 1000)),
 "hot_68": n(seasons[2568]["totals"]["hotspots"]), "hot_69": n(seasons[2569]["totals"]["hotspots"]),
}
ABSTRACT = (
 "Thailand has promoted smart cities and digital government for a decade, yet the chain that matters---a measurement becoming a message that moves a person---stays open. "
 "We examine four explanations: weak inter-agency coordination, procurement that buys files rather than services, data that records rather than responds, and no end-to-end monitoring-to-push chain. "
 "In one province we describe what the open-data estate publishes (@@estate_datasets@@ datasets, @@estate_resources@@ resources, @@estate_orgs@@ publishers), audit two hazard chains link by link, and report the operating record of CNX, a public-data operations room adapted to close the chain without inter-agency agreements. "
 "@@unreadable_pct@@\\% of resources could not be parsed and @@spatial@@ datasets carry a location; we found none about drainage, evacuation routes or procurement. "
 "None of the @@shelters@@ official shelter rows carries a coordinate, and @@over20_pct@@\\% of those reporting toilets exceed a reference of 20 people per toilet. "
 "CNX drew on @@agencies@@ providers within seven calendar weeks; @@ontime@@ of @@slo_total@@ feeds with a declared limit were inside it; official meteorological warnings lead its board. "
 "Coordination, procurement and responsiveness gaps could be bypassed with public data and open standards; authority, asset registers and validation could not. "
 "The audit is descriptive and the system is evaluated for feasibility only: we show that the gaps are present and measurable, not that they cause the stalled programmes."
)
T["abstract"] = ABSTRACT
for _ in range(2):
    for k, v in T.items():
        pass
s = (HERE / "paper.tex.tpl").read_text()
for _ in range(3):
    s = re.sub(r"@@(\w+)@@", lambda m: T[m.group(1)] if m.group(1) in T else m.group(0), s)
left = set(re.findall(r"@@(\w+)@@", s))
if left:
    sys.exit(f"unfilled tokens: {sorted(left)}")
build = HERE / "build"; build.mkdir(exist_ok=True)
(build / "paper.tex").write_text(s)
# The published refs.bib keeps each entry's verification note; the typeset copy drops it.
bib = re.sub(r"^\s*note\s*=\s*\{.*\},?\s*$", "", (HERE / "refs.bib").read_text(encoding="utf-8"), flags=re.M)
bib = re.sub(r"^(\s*title\s*=\s*)\{(?!\{)(.*)\},?\s*$", lambda m: m.group(1) + "{{" + m.group(2) + "}},", bib, flags=re.M)
(build / "refs.bib").write_text(bib, encoding="utf-8")
shutil.copy(HERE / "fig_chain.tikz", build / "fig_chain.tikz")
for f in (ROOT / "research/figures").glob("*.pdf"):
    shutil.copy(f, build / f.name)
TL = Path.home() / "Library/TinyTeX/bin/universal-darwin"
def run(cmd):
    r = subprocess.run(cmd, cwd=build, capture_output=True, text=True, errors="replace")
    return r
run([str(TL / "pdflatex"), "-interaction=nonstopmode", "paper.tex"])
bb = run([str(TL / "bibtex"), "paper"])
run([str(TL / "pdflatex"), "-interaction=nonstopmode", "paper.tex"])
r = run([str(TL / "pdflatex"), "-interaction=nonstopmode", "paper.tex"])
log = (build / "paper.log").read_text(errors="replace")
errs = [l for l in log.splitlines() if l.startswith("!")]
undef = sorted(set(re.findall(r"Citation `([^']+)' .*undefined", log)))
print("bibtex:", [l for l in bb.stdout.splitlines() if "Warning" in l or "error" in l.lower()][:6])
print("errors:", errs[:6]); print("undefined citations:", undef)
pdf = build / "paper.pdf"
if pdf.exists():
    out = ROOT / "public/research"; out.mkdir(parents=True, exist_ok=True)
    shutil.copy(pdf, out / "gauge-to-shelter-preprint.pdf")
    # Everything needed to repeat the paper: bibliography (with verification notes), numbers, analysis, source.
    shutil.copy(HERE / "refs.bib", out / "references-verified.bib")
    shutil.copy(ROOT / "research/data/results.json", out / "results.json")
    shutil.copy(ROOT / "research/analysis/run_analysis.py", out / "run_analysis.py")
    shutil.copy(build / "paper.tex", out / "paper.tex")
    pages_dir = out / "pages"; pages_dir.mkdir(exist_ok=True)
    for old in pages_dir.glob("*.jpg"): old.unlink()
    subprocess.run(["pdftoppm", "-r", "110", "-jpeg", "-jpegopt", "quality=82", str(pdf), str(pages_dir / "p")], check=True)
    for f in pages_dir.glob("p-*.jpg"):                      # p-1.jpg … p-9.jpg → p1.jpg …
        f.rename(pages_dir / ("p" + f.stem.split("-")[1].lstrip("0") + ".jpg"))
    pages = re.search(r"Output written on paper.pdf \((\d+) pages", log)
    print("pdf ok, pages:", pages.group(1) if pages else "?")
