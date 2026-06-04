---
'@fuzdev/fuz_code': minor
---

fix: reclassify preprocessor deps — `magic-string` and `zimmerframe` from optional peers to `dependencies` (no singleton hazard); `@fuzdev/fuz_util` from an optional to a **required** peer. `svelte_preprocess_fuz_code` is the only importer of all three
