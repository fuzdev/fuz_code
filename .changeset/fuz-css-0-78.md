---
'@fuzdev/fuz_code': minor
---

break: upgrade to fuz_css 0.78 - the `@fuzdev/fuz_css` peer is `>=0.78.0`

fuz_css 0.77 and 0.78 hold raised surfaces like `shade_10` nearer the ground, derive the default control border by mixing `shade_30` toward `shade_50` (a quarter of the way at no contrast, all the way at high contrast), and move the neutral `.selected` fill to `shade_70`. Nothing fuz_code imports or styles changed; the optional peer moves with the stack.
