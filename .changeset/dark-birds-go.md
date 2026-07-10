---
'@fuzdev/fuz_code': minor
---

perf: rewrite to lexer architecture dropping regexp grammars

- the regex-grammar engine is removed: `tokenize_syntax.ts`, the
  `grammar_*.ts` modules, `SyntaxToken`, `tokenize()`, and the hooks system
- `SyntaxStyler` is now a lexer registry plus `lex`/`stylize` facade; `lex()`
  returns the flat event stream (`LexedSyntax`); languages are `SyntaxLang`
  lexers registered with `add_lang`
- `Code.svelte` no longer has a `grammar` prop
