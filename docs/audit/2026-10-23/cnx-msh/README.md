# CNX spatial repair — evidence, 22–23 October 2026

Measured with headless Chrome over CDP. Every screenshot and every number in
`docs/SHIP-AUDIT.md` comes from these files: the rig takes one screenshot
and one box measurement per viewport, so the picture and the numbers cannot
disagree.

| file | what it shows |
|---|---|
| `before-<viewport>-dark-th.jpg` | the board before the repair: the news list reduced to a 30 px window at 1024×900 and 7 px at 1366×640, while the footer counted 24 items |
| `after-<viewport>-<theme>-<lang>.jpg` | the board after the repair, with the evidence panel open |
| `measure-<viewport>-<theme>-<lang>.json` | the measured boxes for that viewport — the resting board (`closed`) and the board with the disclosure expanded (`open`) |
| `measure-<theme>-<lang>-summary.json` | every check the spatial gate ran, with its result |
| `fault-d1-390x844-dark-th.jpg` / `.json` | the gate firing: the panel re-anchored to the disclosure, opening at x = −180 exactly as it did before the repair |

Reproduce any of it with:

    node scripts/cnx-spatial-check.mjs --theme dark --lang th
    node scripts/cnx-spatial-check.mjs --theme dark --lang th --inject-fault d1
