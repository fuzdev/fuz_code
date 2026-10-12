---
'@fuzdev/fuz_code': minor
---

perf: `render_syntax_html` appends flat strings and fewer of them, so `stylize` plus the first read of its result takes about a third less time: open tags are single strings instead of concatenation trees, a one-char leaf appends its whole span from the new `TokenTypeInfo.char_spans` cache, and text is sliced without a scan up to the next character that needs an escape; breaking: `TokenTypeInfo` has the new required `char_spans` field
