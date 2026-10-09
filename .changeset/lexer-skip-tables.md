---
'@fuzdev/fuz_code': patch
---

fix: the shell lexer treats a backslash outside quotes as an escape, so `\``, `\'`, and `\"` no longer open a substitution or string that runs on through later lines; perf: the markdown inline scan and the CSS statement scan skip plain chars through a lookup table
