---
'@fuzdev/fuz_code': minor
---

feat: add a diff viewer - `CodeDiff.svelte` renders a syntax-styled diff of two versions of a text, unified or side by side with `split`, over `render_diff_unified_html` and `render_diff_split_html` in `diff_html.ts`. `render_syntax_html_lines` in `lexer.ts` renders one balanced HTML fragment per source line, with optional `<mark>` ranges. Import `theme_diff.css` alongside `theme.css` to style it; `theme_variables.css` now also declares the `--positive_*` and `--negative_*` stops the diff theme reads. `svelte_preprocess_fuz_code` pre-renders `CodeDiff` usages whose `a` and `b` are static

break: `svelte_preprocess_fuz_code`'s `component_imports` option is renamed to `code_imports`, beside the new `code_diff_imports` for `CodeDiff`
