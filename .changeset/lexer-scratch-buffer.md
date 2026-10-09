---
'@fuzdev/fuz_code': minor
---

perf: lex into one reused buffer instead of allocating an input-sized `Int32Array` per call: `lex_syntax` copies out an exact-size `events`, and the new `stylize_syntax` (which `SyntaxStyler#stylize` now calls) renders without copying; breaking: `new Lexer(events?)` takes the buffer to emit into, not a capacity
