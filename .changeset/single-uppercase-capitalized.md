---
'@fuzdev/fuz_code': patch
---

fix: in TypeScript a single uppercase letter (`T`, `K`, `V`) is a `capitalized_identifier` instead of a `constant`, so a type parameter is styled as a type at its uses
