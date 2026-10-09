---
'@fuzdev/fuz_code': minor
---

perf: keep the lexers' optimized code across major GCs: `advance_probe` returns the new `PROBE_NOT_FOUND` instead of `Infinity` when there is no further occurrence, and `Lexer.shape_anchor` keeps one lexer alive so its hidden class survives between `lex` calls
