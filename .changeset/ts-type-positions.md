---
'@fuzdev/fuz_code': minor
---

feat: TypeScript type annotations are recognized without an initializer (`(x: T)`, `let x: T;`, `): T {`, class and interface members), along with a type alias's body and the tail of an `as` assertion, so names in type positions are `type_name` and each annotation has its `type_annotation` and `type` containers; fix: a `case` clause, a destructuring rename with a default, and a template literal containing `=` are no longer read as annotations. TypeScript lexing takes about 9% longer and JavaScript 5%
