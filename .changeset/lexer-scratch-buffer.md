---
'@fuzdev/fuz_code': minor
---

perf: lex into one reused buffer instead of allocating an input-sized `Int32Array` per call; breaking: a `lex_syntax` / `SyntaxStyler#lex` result is valid until the next lex (keep one with the new `copy_lexed_syntax`), and `new Lexer(events?)` takes the buffer to emit into, not a capacity
