# CNX design rules

- The landing page is a map operations room. The map is the hero; keep header chrome compact and in a single row. Collapse labels and secondary actions before allowing another header row.
- Fit word boxes to their words. Oversized boxes around short labels are unacceptable. Use content width, restrained padding and tight gaps; never inflate controls to fill space.
- Keep necessary touch targets and keyboard focus visibility. Put secondary controls in a menu instead of growing the header into multiple oversized rows.
- Verify the result in Thai and English at narrow and desktop widths before shipping.

- Operational text, including source, age and unavailable states, must clear 4.5:1 on its actual composited surface in both themes. Do not fade a whole card or essential text. Pair adaptive fills with an adaptive contrasting foreground; white is not a universal foreground. Check hover and selected states too.
