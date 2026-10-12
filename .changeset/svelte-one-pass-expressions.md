---
'@fuzdev/fuz_code': minor
---

perf: a Svelte `{expression}` is lexed in one pass, about 3% less lex time on Svelte files and 9–18% on an expression: the TypeScript lexer finds the closing brace as it tokenizes through the new optional `SyntaxLang.lex_to_brace` and `Lexer.embed_to_brace` (with `EMBED_UNAVAILABLE`), in place of a scan for the brace followed by the lex; a brace inside a regex no longer closes the expression (`{x.replace(/}/g, '')}`)
