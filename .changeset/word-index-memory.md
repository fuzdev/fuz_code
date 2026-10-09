---
'@fuzdev/fuz_code': patch
---

perf: `WordIndex` keeps a 256-slot table with exact-size buckets, cutting each lexer's retained memory by about 15KB
