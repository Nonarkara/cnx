# Temple compounds — visual evidence, 23 October 2026

What is here, and how to reproduce it.

## `compounds-plan-and-isometric.png` / `.svg`

Four compounds drawn twice each:

- **PLAN** — north up, true mapped geometry. This is the aerial read: the
  walled boundary, the courtyard, the buildings OSM actually maps inside it,
  the gate.
- **ISOMETRIC** — the same parts extruded, viewed from the south-east. This
  is the read the map's fill-extrusion approximates.

| panel | compound | what it shows |
|---|---|---|
| 1 | Wat Chedi Luang | 41 mapped buildings inside a 49,525 m² boundary, with the stupa as a stepped tower on its measured footprint |
| 2 | Wat Phra Singh | 39 mapped buildings; the chedi ("Phra That Wat Phra Sing") recognised by name and given a tower profile |
| 3 | Wat Phra That Doi Suthep | an irregular 34,739 m² compound on the ridge, the tower in the court |
| 4 | Wat Suan Dok | `osm-boundary-only` — no mapped interior, so the whole compound is the grammar's |

**Faded = modelled. Saturated = measured.** Panel 4 is the honest extreme:
its boundary is mapped, and everything inside it is the grammar.

## Reproducing

```bash
node scripts/build-cnx-temple-compounds.mjs

node scripts/preview-temple-compounds.mjs \
  "Chedi Luang" "Phra Singh" "Doi Suthep" "Suan Dok"

"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless --disable-gpu --no-sandbox --no-first-run \
  --user-data-dir=/tmp/cnx-temple/prof \
  --screenshot=preview.png --window-size=1840,620 --hide-scrollbars \
  file:///tmp/cnx-temple/preview.svg
```

The renderer takes any number of name fragments; each is matched against the
compound's English and Thai name.

## Why this file exists

Four defects in the compound grammar passed the unit tests and were caught
only by drawing the thing:

1. the mean latitude was read off an `{x, y}` object as `p[1]`, so it was
   `NaN`, so the area was `NaN`, and `NaN < threshold` is **false** — all
   474 temples became compounds, including 182 single shrines;
2. `closeRing` was handed lon/lat tuples instead of `{x, y}` vectors, so
   4,198 of 4,380 rings ended with a point of `{}`;
3. the wall was a solid slab, filling the courtyard it was meant to enclose;
4. the mapped interior buildings were dropped — Wat Chedi Luang's 41
   buildings became three gold boxes on a cream rectangle.

None of those show up in an assertion about a count. They show up the moment
the geometry is drawn. That is why the renderer is a repo tool and not a
scratch script.
