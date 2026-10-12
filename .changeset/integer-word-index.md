---
'@fuzdev/fuz_code': minor
---

perf: the TypeScript, Rust and bash lexers classify a word from one integer instead of string-keyed `Map` and `Set` lookups, so lexing takes about 8% less time for TypeScript, 12% less for bash and 5% less for Rust; breaking: `WordIndex` takes `[word, value]` entries (a `words_map` result as it is) in place of words, and `find` returns the word's value, or `0` for a miss, in place of the word or `undefined`
