---
'@fuzdev/fuz_code': minor
---

perf: lexers allocate almost nothing per call: keywords are looked up with the new `WordIndex` instead of slicing every identifier, the TS and Rust number scanners make no closures, and the TS and shell lexers reuse their machines across embedded regions
