---
'@fuzdev/fuz_code': minor
---

feat: require fuz_css 0.65 and read its OKLCH palette

Breaking:

- The optional `@fuzdev/fuz_css` peer is `>=0.65.0` (was `>=0.62.0`).
- `theme.css` and `theme_highlight.css` read `--palette_a_50` through
  `--palette_j_50` (was `--color_a_50` through `--color_j_50`), fuz_css's
  renamed palette variables. A consumer that sets the token colors itself
  sets the `--palette_X_50` names.
- `theme_variables.css`, the fallback for consumers not using fuz_css,
  declares `--text_50` and `--palette_a_50` through `--palette_j_50` as sRGB
  snapshots of fuz_css's derived OKLCH palette, so the default token colors
  shift.
