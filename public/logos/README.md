# CNX brand assets

Transparent PNG variants extracted from the supplied Logo Option 2 board:

- `cnx-mark.png`: colour emblem for the compact dashboard and About headers.
- `cnx-lockup.png`: emblem and full English wordmark for About / Research.
- `cnx-monochrome.png`: neutral emblem in the About footer; CSS inverts it in dark mode.
- `cnx-app-mark.png`: brighter app emblem for the mobile availability card.
- `cnx-icon-{180,192,512}.png`: square home-screen / browser icons derived from the app emblem.

White areas are alpha holes, including internal lines and chart gaps. Never
flatten these files, use blend modes, or stretch them. Use `object-contain`
with bounded dimensions. The navy colour assets use `.cnx-brand-plate` for
a pale CSS backing that remains legible in either theme. The PNG itself
has no opaque plate. Monochrome uses `.cnx-brand-mono` on the theme surface.

These are product branding, not the official provincial seal. The existing
`cnx-wordmark.svg` remains available as a legacy asset. RCAD, depa,
Smart City Thailand and Axiom / ReTL remain in the partner row. The manifest provides standalone web-app entry;
there is no offline cache or guarantee of offline live data.
