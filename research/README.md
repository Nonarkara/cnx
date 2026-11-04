# Research: "From Gauge to Shelter" (preprint)

Why Thailand's smart-city promotion stalls between measurement and action, and a public-data
system built around the gaps. Shown at `/cnx/research`; the PDF is `public/research/gauge-to-shelter-preprint.pdf`.

| Path | What it is |
|---|---|
| `analysis/run_analysis.py` | Recomputes every number and figure from the data files. Writes `data/results.json` and `figures/*.pdf`. |
| `data/results.json` | Every number the paper and the research page quote. |
| `data/manifest-2026-11-04.json` | The board's own feed registry and live state on the analysis date. |
| `data/water-frames.json`, `data/haze-pairs.json` | Series frozen from the relay caches (no images, no fingerprints). |
| `data/warning-log.json` | The board's warning log, 11 Oct – 3 Nov 2026. |
| `paper/paper.tex.tpl`, `paper/build_paper.py` | The paper template and the build that fills it from `results.json`, compiles it (pdflatex + bibtex) and publishes the PDF, the bibliography, the data and the source to `public/research/`. |
| `paper/refs.bib` | The bibliography; each entry's `note` says how it was verified (read in full, or record-level only). |

Reproduce:

```bash
python3 research/analysis/run_analysis.py      # numbers + figures
python3 research/paper/build_paper.py          # paper + public/research/*
```

Needs Python 3 with matplotlib, and TeX Live (pdflatex, bibtex; packages newtx, microtype, natbib, caption, titlesec, fancyhdr, lastpage, enumitem, pgf, xstring).
The paper is a preprint: not peer reviewed. Author contributions are to be confirmed by the authors.
