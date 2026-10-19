# Operational text contrast repair — 19 October 2026

User report: important text shared nearly the same color as its background.

Confirmed defects in the deployed interface and source:

- Dark action fill with white ticker/building labels: 2.32:1.
- White emergency label on its dark-theme hover fill: 2.78:1.
- Selected map gold/cyan/red controls: 3.25–4.23:1 at 13px.
- Offline camera labels and inherited quiet source text faded to 70% opacity: light-theme contrast 3.48:1.
- Empty camera message inherited quiet light-theme text on fixed black: 2.91:1.
- Verdict prose compounded severity text, tint and opacity.

Repair: paired adaptive foregrounds, darker fixed selected fills, full-opacity operational metadata, a matching empty-camera surface, untinted verdict surfaces, and native color schemes aligned with the selected theme. Layout dimensions remain unchanged.

Source ages remain based on observation time. Valid stamps additionally expose the exact Bangkok time, UTC+7, through semantic `time`, an accessible label and a tooltip; invalid/missing stamps do not manufacture a date.

Regression coverage measures the real filled-control pairs in both themes, alongside existing palette checks. Clock tests verify absolute timestamp semantics and invalid/future behavior. This does not substitute for browser checks of inheritance and compositing.

Initial checks: 57 focused tests passed; typecheck and lint passed. Independent source review found no blockers. Release and visual results are recorded below after verification.

## Release candidate 04a870b

- CI run 39202094365: all jobs green. Node 22: 1,120 tests in 113 files; Node 20: 1,119 passed and one expected native-TypeScript import skip. Typecheck, lint, plain Node relay imports and Worker build passed.
- Timestamp precision is retained from the upstream string; numeric epochs use ISO. Existing camera regression and the new clock test both pass.
- Local production Worker build and Wrangler deployment dry run passed.
- Built-browser checks: map rendered, layer menu and unavailable CCTV strip checked in light/dark; no detected sub-4.5:1 visible text in these targeted states. Native selectors follow the selected theme. No browser errors observed in these checks.
- Local KV is separate from production: unavailable local feeds were not represented as live production coverage.

CI: https://github.com/Nonarkara/cnx/actions/runs/39202094365
