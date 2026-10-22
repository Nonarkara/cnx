# CNX design rules

- The landing page is a map operations room. The map is the hero; keep header chrome compact and in a single row. Collapse labels and secondary actions before allowing another header row.
- Fit word boxes to their words. Oversized boxes around short labels are unacceptable. Use content width, restrained padding and tight gaps; never inflate controls to fill space.
- Do not reserve full-height badge gutters or a full-width band for a collapsed secondary control. Let warning prose use the rail width. Measure map and overlay bounds before and after changes; include 768px alongside desktop and phone checks to catch isolated wrapped controls.
- Keep necessary touch targets and keyboard focus visibility. Put secondary controls in a menu instead of growing the header into multiple oversized rows.
- Verify the result in Thai and English at narrow and desktop widths before shipping.

- Operational text, including source, age and unavailable states, must clear 4.5:1 on its actual composited surface in both themes. Do not fade a whole card or essential text. Pair adaptive fills with an adaptive contrasting foreground; white is not a universal foreground. Check hover and selected states too.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
