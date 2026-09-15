# Logos

The CNX logo slot ships with a wordmark SVG (`cnx-wordmark.svg`). When
the operator drops the official provincial seal in, rename it to
`cnx-seal.png` and `scripts/logo-manifest.mjs` will pick it up
automatically.

Until then, the wordmark stands in. Same design language as Lopburi:
no internal frame, accent bar in Lanna blue (#1d2951), Thai on top,
English tracked subtitle below.

If you add partner logos later (CAAT, AOT, Chiang Mai University, …),
list them here and they go in `public/logos/`. The build manifest
decides which ones exist; missing files never produce 404s on the
wall.
