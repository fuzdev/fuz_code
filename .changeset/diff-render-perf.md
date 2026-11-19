---
'@fuzdev/fuz_code': patch
---

perf: the diff renderers draw each changed line once, emphasized or plain, and push a row's pieces straight onto the output, speeding up edit-heavy diffs
