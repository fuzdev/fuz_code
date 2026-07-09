---
'@fuzdev/fuz_code': minor
---

perf: rewrite to lexer architecture dropping regexp grammars

The tokenizer is a full rewrite — one hand-written single-pass lexer per
language emitting a flat token event stream, with zero regular expressions —
measuring ~9–30x faster than the old engine. The emitted `.token_*` classes
and theme CSS are unchanged.

Breaking:

- the regex-grammar engine is removed: `tokenize_syntax.ts`, the
  `grammar_*.ts` modules, `SyntaxToken`, `tokenize()`, and the hooks system
- `SyntaxStyler` is now a lexer registry plus `lex`/`stylize` facade; `lex()`
  returns the flat event stream (`LexedSyntax`); languages are `SyntaxLang`
  lexers registered with `add_lang`
- `Code.svelte` no longer has a `grammar` prop

Also:

- arbitrarily deep nesting (template interpolations, bash substitutions)
  tokenizes fully on explicit frame stacks, and adversarial markdown fence
  cascades no longer overflow the call stack (cross-language embedding is
  depth-capped, degrading to plain text past the cap)
- bash `${…}` parameter expansion spans balanced braces (`${a:-${b}}`)
- a ts `${…}` interpolation is no longer closed early by a `}` inside a
  regex literal, string, or comment (`` `${/}/.test(x)}` ``)
- a bash `$(…)` substitution is no longer closed early by a `)` inside a
  `#` comment or heredoc body; substitution and interpolation interiors
  discover their own closing delimiter during tokenization, so malformed
  interiors extend editor-style instead of being cut short
- a comparison chain is no longer misread as a generic call when the match
  would cross a statement or interpolation boundary (`if (a < b) { } x > (c)`)
  — the generic/parameter lookahead scans reject unbalanced `)`/`}`/`]`
