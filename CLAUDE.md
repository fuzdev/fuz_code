# fuz_code

> Syntax highlighting - hand-written single-pass lexers

fuz_code (`@fuzdev/fuz_code`) is a runtime syntax highlighting library optimized
for HTML generation with CSS classes. It originated as a fork and by-hand rewrite of PrismJS,
with a redesigned tokenizer that replaces regular expressions with lexers per
language emitting a flat token event stream.

For coding conventions, see Skill(fuz-stack).

## Committing

`git add` and `git commit` are denied by `.claude/settings.local.json` in
this repo — make the edits and stop, the user commits.

## Gro commands

```bash
gro check                       # typecheck, test, lint, format check (run before committing)
gro typecheck                   # typecheck only (faster iteration)
gro test                        # run tests with vitest
gro gen                         # regenerate .gen files
gro build                       # build the package for production
gro src/test/fixtures/update    # regenerate test fixtures
```

IMPORTANT for AI agents: Do NOT run `gro dev` - the developer will manage the
dev server.

## Key dependencies

- Svelte 5 - component framework (optional peer dep, for Code.svelte)
- fuz_css (@fuzdev/fuz_css) - CSS variables for theming (optional peer dep)
- esm-env - `DEV` flag (required peer)
- magic-string, zimmerframe - build-time preprocessor helpers (`dependencies`;
  `svelte_preprocess_fuz_code` only)
- fuz_util (@fuzdev/fuz_util) - preprocessor helper (required peer)
- fuz_ui (@fuzdev/fuz_ui) - docs system (dev only)

## Scope

fuz_code is a **syntax highlighting library**:

- Runtime HTML generation with CSS classes
- Hand-written single-pass lexers (zero regex), one per language
- 9 built-in lexers (`markup`, `xml`, `svelte`, `md`, `ts`, `css`, `json`,
  `sh`, `rust`) plus the no-op `plaintext` every styler registers
- Extensible by writing a lexer (`SyntaxLang`)
- Optional Svelte component (`Code.svelte`) and a build-time Svelte
  preprocessor (`svelte_preprocess_fuz_code`) that pre-renders static `Code`
  content

### What fuz_code does NOT include

- A build-time/SSR-only highlighting architecture (use Shiki) — the optional
  preprocessor pre-renders static `<Code content="…">` at build time, but the
  library's model is runtime lexing
- TextMate grammar compatibility — some edge cases differ from IDE highlighting
- VS Code theme support
- Line numbers or code editing
- Syntax validation or error detection

## Architecture

### Directory structure

```
benchmark/                          # performance testing
├── run_benchmarks.ts           # CLI entry (--save writes results.md + baseline.json)
├── benchmarks.ts               # benchmark cases, output metrics, markdown writers
└── compare/                    # Prism/Shiki comparison
src/
├── lib/                        # exportable library code
│   ├── syntax_styler.ts        # SyntaxStyler class: registry + lex/stylize facade
│   ├── syntax_styler_global.ts # pre-configured global instance
│   ├── lexer.ts                # lexer substrate: Lexer, TokenTypeRegistry, flat events, HTML render
│   ├── lexer_*.ts              # hand-written lexers (json, ts, css, bash, markup, svelte, md, rust)
│   ├── Code.svelte             # main Svelte component
│   ├── svelte_preprocess_fuz_code.ts # build-time preprocessor for static `Code` content
│   ├── code_sample.ts          # `CodeSample` shape + `sample_langs` for the demo site
│   ├── CodeHighlight.svelte    # experimental CSS Highlight API
│   ├── CodeTextarea.svelte     # experimental live-highlighted textarea
│   ├── highlight_manager.ts    # CSS Highlight API manager
│   ├── range_highlighting.svelte.ts # shared range-highlighting helper
│   ├── highlight_priorities.ts # generated token priorities
│   ├── theme.css               # token CSS classes
│   ├── theme_variables.css     # CSS variable fallbacks
│   └── theme_highlight.css     # CSS Highlight API theme
├── test/                       # test files and fixtures
│   ├── highlight_manager.test.ts
│   ├── highlight_test_helpers.ts
│   ├── syntax_styler.test.ts   # registry/facade behavior
│   ├── svelte_preprocess_fuz_code.test.ts
│   ├── lexer*.test.ts          # lexer-engine suites (substrate + per language)
│   ├── lexer.pathological.test.ts # linearity + validity on adversarial inputs
│   ├── pathological.ts         # pathological input generators (tests + benchmark)
│   └── fixtures/
│       ├── samples/            # source of truth sample files
│       ├── generated/          # generated fixture outputs
│       ├── helpers.ts          # sample discovery + html/debug-text generation
│       ├── check.test.ts       # fixture validation
│       └── update.task.ts      # fixture regeneration task
└── routes/                     # demo/docs site
    ├── samples/                # shared sample data (all.gen.ts)
    ├── benchmark/              # interactive benchmark UI
    ├── lang_color.ts           # per-language tint for the docs language buttons
    ├── library.ts              # svelte-docinfo library metadata for the API docs
    └── docs/                   # tomes: usage, samples, textarea, benchmark, api
```

### Core system

**Lexer engine** (`lexer.ts` + `lexer_*.ts`) - hand-written single-pass
lexers emitting flat token events (`Int32Array`) rendered to HTML in one
forward pass. Token types intern into a `TokenTypeRegistry`
(`token_types_global` by default, injectable via `SyntaxStylerOptions`).

**SyntaxStyler** - The main class: a language registry and a `lex`/`stylize`
facade over the lexer engine. `lex(text, lang)` returns the flat event stream
(`LexedSyntax`); `stylize(text, lang)` renders it to HTML. Every instance
registers `plaintext`, a no-op lexer whose text renders escaped but unstyled —
the explicit "highlight nothing" language, distinct from an unregistered one
(which throws).

**syntax_styler_global** - Pre-configured instance with all built-in
languages registered. Import this for typical usage.

**svelte_preprocess_fuz_code** - Build-time Svelte preprocessor that walks the
component AST for `Code` usages with a statically known `content` (plain
strings and ternary chains, resolved through module-level bindings) and
rewrites them to `dangerous_raw_html` with the HTML already generated. Skips
usages with spreads, a custom `syntax_styler`, or a non-static `lang`, so it
degrades to runtime highlighting rather than failing.

### Token structure

The lexer emits a flat event stream (`LexedSyntax`) — leaf/open/close records
in one `Int32Array` with interned type ids; plain text is implicit between
events (recovered from offsets). `render_syntax_html` streams HTML from it in
one forward pass, wrapping spans with classes like `.token_keyword`,
`.token_string` (styled by `theme.css`); `syntax_events_to_tokens` flattens it
to `{type, start, end}` for tests and fixtures.

### Language definitions

One `SyntaxLang` lexer per language, registered via `add_lang` (ids and
aliases in the Supported languages table below):

- `lexer_json.ts` - JSON (with comments)
- `lexer_ts.ts` - TypeScript, also serving `js`/`javascript` — TS is a
  syntactic superset, so there is no separate JS lexer
- `lexer_css.ts` - CSS (including native nesting)
- `lexer_bash.ts` - the bash-family shell lexer (POSIX sh is a syntactic
  subset for highlighting — bash-family only, no fish etc.)
- `lexer_markup.ts` - HTML (rawtext script/style/textarea/title, `style=`/`on*=`
  attribute embedding) and XML (plain tag scanning), one shared scanner
  parameterized by `MarkupLexMode`
- `lexer_svelte.ts` - Svelte: the markup scanner in svelte mode (script→ts,
  no special attrs, js-style comments between attributes) plus the `{…}`
  expression lexer (blocks, each/await splits, at-directives, directive
  modifiers, `{const …}`/`{let …}` declaration tags)
- `lexer_md.ts` - Markdown: line-oriented block scan (fences with exact-word
  info matching and any-length closers, headings, blockquotes, lists, hr)
  with a per-block inline scan (emphasis, inline code, links, entities, raw
  markup via the markup scanner); fences embed their languages
- `lexer_rust.ts` - Rust: one
  flat scan loop (nested block comments and raw strings resolve with counters;
  attribute interiors lex inline under an `[`/`]` depth counter — no frame
  machine), lifetime-vs-char `'` disambiguation, `name!` macros, doc-vs-plain
  comment split, the r/b/c string prefixes

Embedded languages resolve lazily by name through the registry (markdown
fences → any language, markup `<script>`/`<style>`/`style=`/`on*=`, svelte
`{…}` → ts) via `Lexer.embed`, which bounds nesting (`MAX_EMBED_DEPTH`) so
the one cycle in the embed graph — markdown fences embedding markdown —
can't overflow the call stack; past the cap a region stays plain text.

### Generated files

- `highlight_priorities.gen.ts` → `highlight_priorities.ts` - extracts
  `::highlight(token_name)` rules from `theme_highlight.css` and generates the
  `HighlightTokenName` type plus per-token priorities (rule order = priority)
- `src/routes/samples/all.gen.ts` → `all.ts` - inlines the fixture samples as
  `CodeSample` records for the demo site and the internal benchmark

### API

**SyntaxStyler class:**

- `stylize(text, lang)` - generate HTML with syntax highlighting
- `lex(text, lang)` - lex to the flat token event stream (`LexedSyntax`)
- `add_lang(lang)` - register a `SyntaxLang` lexer (and its aliases)
- `has_lang(id)` - whether a language is registered under `id`
- `langs` - the id→lexer `Map`, keyed by primary id and every alias
- `SyntaxStylerOptions.token_types` - inject a separate `TokenTypeRegistry`
  (only valid when every registered lexer interned into that same registry)

Both `lex` and `stylize` throw on an unregistered language — guard with
`has_lang`, or use `plaintext` to render unstyled.

**Lexer substrate (`lexer.ts`)** - the authoring and consumer surface beneath
the styler:

- `lex_syntax(text, lang, langs?, types?)` / `render_syntax_html(lexed)` - the
  two halves `SyntaxStyler` composes
- `syntax_events_to_tokens(lexed)` - flatten events to `{type, start, end}`
  (fixtures, tests, range building)
- `validate_syntax_events(lexed)` - structural invariants as a list of issues,
  empty when valid (used by the pathological suite)
- `token_type(name, alias?)` / `TokenTypeRegistry` / `token_types_global` -
  interning; `words_map(...entries)` - keyword tables
- `Lexer` - the lex context: `text`/`pos`/`end`, the `leaf`/`open`/`close`
  emitters, and `embed(lang_id, start, end)`
- scanning helpers - `is_space`, `is_digit`, `is_upper`, `is_ascii_alnum`,
  `is_ascii_word`, `is_hex_digit`, `is_ident_start`, `is_ident`, `scan_ident`,
  `skip_space`, `trim_space_end`, `scan_to_line_end`, `skip_quoted`,
  `matches_ci`, `advance_probe`, `scan_balanced_braces`

**Code.svelte props:**

- `content` - source code to highlight
- `dangerous_raw_html` - pre-highlighted HTML (what the preprocessor emits);
  mutually exclusive with `content` and skips runtime highlighting
- `lang` - language identifier (default: 'svelte'; `null` or an unregistered
  id disables highlighting and renders plain text, warning in DEV)
- `inline` - boolean for inline vs block
- `wrap` - boolean for text wrapping
- `nomargin` - boolean for margin control
- `syntax_styler` - custom `SyntaxStyler` (default: `syntax_styler_global`)
- `children` - optional snippet receiving the generated HTML string, to
  customize rendering; remaining props spread onto the `<code>` element

## Supported languages

Primary ids and their aliases, as registered in `syntax_styler_global`:

| id          | aliases                          | lexer              |
| ----------- | -------------------------------- | ------------------ |
| `markup`    | `html`, `mathml`, `svg`          | `lexer_markup.ts`  |
| `xml`       | `ssml`, `atom`, `rss`            | `lexer_markup.ts`  |
| `svelte`    | —                                | `lexer_svelte.ts`  |
| `md`        | `markdown`                       | `lexer_md.ts`      |
| `ts`        | `typescript`, `js`, `javascript` | `lexer_ts.ts`      |
| `css`       | —                                | `lexer_css.ts`     |
| `json`      | —                                | `lexer_json.ts`    |
| `sh`        | `bash`, `shell`                  | `lexer_bash.ts`    |
| `rust`      | `rs`                             | `lexer_rust.ts`    |
| `plaintext` | —                                | `syntax_styler.ts` |

## Testing

### Fixture workflow

1. Edit samples in `src/test/fixtures/samples/sample_*.{lang}`
2. Run `gro src/test/fixtures/update` (or `npm run fixtures:update`) to
   regenerate — it invokes `gen` first, so the samples also refresh
   `src/routes/samples/all.ts` for the docs site and benchmark
3. Run `gro test src/test/fixtures/check` to verify
4. Review changes with `git diff src/test/fixtures/`

Generated fixtures in `generated/{lang}/` include `.html` (tokenized output) and
`.txt` (debug output with token names).

## Performance

```bash
npm run benchmark            # internal benchmark: stdout + baseline comparison
npm run benchmark:save       # …and update benchmark/results.md + benchmark/baseline.json
npm run benchmark:clean      # delete benchmark/baseline.json (re-seed on next --save)
npm run benchmark:vs         # compare against Prism and Shiki (stdout only)
npm run benchmark:vs:write   # …and update benchmark/compare/results.md
```

The internal benchmark covers all sample files at normal and 100x sizes plus a
`pathological:` group of generated adversarial inputs
(`src/test/pathological.ts`, 32KB each, shorter per-case budget) that tracks
the engine's worst-case constants — the same generators back the CI linearity
suite (`src/test/lexer.pathological.test.ts`). Each run also reports a
deterministic "Output metrics" table (spans rendered and utf8 HTML bytes per
case — DOM-cost proxies, not timed). Every run compares against
`benchmark/baseline.json` via `@fuzdev/fuz_util`'s
`benchmark_baseline_compare`; only `--save` mutates it.

`:vs` (not `:compare`) marks the cross-implementation shootout against Prism
and Shiki (JS and Oniguruma engines), as opposed to the in-tree baseline
compare. Its language coverage is fixed at `ts`, `css`, `html`, `json`,
`svelte` by `supported_languages` in `benchmark/compare/compare.ts` — `md`,
`sh`, and `rust` are not in it.

### Updating committed result snapshots

`benchmark/compare/results.md` is linked from `README.md` as evidence for the
"about two orders of magnitude faster" claim vs Shiki — load-bearing for the
public narrative, not incidental output. `benchmark/results.md` is the local
perf baseline. `benchmark/baseline.json` is its machine-readable counterpart
and is **gitignored** (per the fuz_util/fuz_ui convention) — perf numbers vary
across machines, so it's a per-developer tracker, re-seeded per machine; PR
review relies on the committed `results.md`. `--save` writes the doc artifact
and the baseline together so they can't drift apart.

- **`benchmark:vs:write`** fully overwrites `benchmark/compare/results.md` —
  single-source, every byte from `format_comparison_results`, no baseline.
- **`benchmark:save`** rewrites the region between `<!-- node-bench:start -->`
  and `<!-- node-bench:end -->` in `benchmark/results.md` (removing the
  sentinels makes `--save` error with a recovery hint rather than guess), plus
  `benchmark/baseline.json` (10% regression threshold, 30-day staleness
  warning). The baseline compare runs _before_ the save, so the run still
  reports what changed against the prior baseline.

The `## Browser Benchmark Results` section of `benchmark/results.md` is
hand-pasted from the browser benchmark UI (`src/routes/benchmark/`) and
preserved untouched — its inputs only exist client-side, so there's no
auto-write path.

A stale `baseline.json` is auto-deleted with a warning when fuz_util's
baseline schema version advances or the JSON is corrupt — re-seed with
`npm run benchmark:save`.

## Experimental features

### CSS Custom Highlight API

`CodeHighlight.svelte` supports the CSS Custom Highlight API for native browser
highlighting. Limited browser support - use `Code.svelte` for production.

- `mode` prop: 'auto', 'ranges', or 'html'
- `CodeTextarea.svelte` - editable `<textarea>` with live range highlighting
- `HighlightManager` class manages highlights per element
- `theme_highlight.css` provides both `.token_*` classes and `::highlight()`
  pseudo-elements

Limitations: no font-weight/font-style support in range mode.

## Color variables

`theme.css` and `theme_highlight.css` reference the fuz_css palette at the `50`
stop — `--text_50` and `--color_a_50` through `--color_j_50` (`--color_c_50` is
currently unused):

- `--text_50` - punctuation, doctype, cdata, processing instructions, `=` in attributes
- `--color_a_50` - keywords, tags, constants, symbols, booleans, null, headings
- `--color_b_50` - comments, char literals, blockquotes, inserted
- `--color_d_50` - at-keywords, urls
- `--color_e_50` - selectors, functions, regex, variables, important
- `--color_f_50` - atrules
- `--color_g_50` - special keywords, namespaces, rules
- `--color_h_50` - strings, attribute values, inline code
- `--color_i_50` - attribute names, properties, decorators, link text
- `--color_j_50` - builtins, class names, numbers

Rust's added token types ride existing colors via aliases — `lifetime`→`symbol`,
`macro`→`function`, `attribute`→`attr_name`, `doc_comment`→`comment` — so no
theme rules were added for them.

`theme_variables.css` (the fallback for consumers not using fuz_css) declares
the older `--color_a_5` / `--text_color_5` spelling and so does not currently
satisfy either theme.

## Development guidelines

1. **Zero regex in lexers** - char-code scanning, native `indexOf`, keyword
   `Map` lookups; no `RegExp` anywhere (speed + Rust-twin discipline)
2. **Never throw, always cover** - any input (mid-keystroke, malformed) yields a
   valid event stream; unterminated constructs extend to their natural boundary
   (damage propagates editor-style rather than being contained — a malformed
   interior may consume its construct's closing delimiter)
3. **Progress discipline** - every scan loop advances position or emits+advances
4. **Nesting discipline** - no JS-call-stack recursion that scales with input
   nesting. Flat single-pass loops wherever the grammar allows (css, markup,
   svelte, json, md, and rust need no stacks at all); an explicit pooled frame
   machine only where a construct's interior re-enters the same grammar
   (`lexer_ts.ts` templates/generics/annotations, `lexer_bash.ts`
   substitutions — use these as the template, including their inline fast
   paths for bodies without nesting). An interior frame discovers its own
   closing delimiter during the real scan (a terminator char + depth counter
   on the frame) — never prescan for it: a prescan is a second, dumber
   tokenizer that can disagree with the real one, and it makes full-depth
   nesting quadratic. Cross-language interiors go through `Lexer.embed`,
   which is depth-capped rather than framed.
5. **Test with fixtures** - all changes must pass fixture tests
6. **Follow patterns** - use existing `lexer_*.ts` modules as templates

### Adding a new language

New languages are written as lexers:

1. Create `src/lib/lexer_{lang}.ts` exporting a `SyntaxLang`, per the
   development guidelines above
2. Register via `add_lang` in `syntax_styler_global.ts`
3. Style any new token types in `theme.css` and `theme_highlight.css`, or give
   them an alias onto an existing type (`token_type('macro', 'function')`) —
   the rust lexer aliases all four of its additions rather than adding rules
4. Add samples in `src/test/fixtures/samples/sample_{variant}.{lang}`
5. Wire the new file extension into both sample-discovery filters — the
   `file_filter` regexes in `src/routes/samples/all.gen.ts` and
   `src/test/fixtures/helpers.ts` are separate hardcoded copies, and a sample
   the filter misses is silently skipped rather than failing
6. Add the lang to `sample_langs` in `code_sample.ts` (its order drives the
   docs) and a tint in `src/routes/lang_color.ts` — that's a
   `Record<SampleLang, string>`, so a missing entry fails typecheck
7. Add it to `languages` in `src/routes/benchmark/benchmark_fixtures.ts` — the
   browser benchmark uses a fixed list, unlike the internal benchmark which
   auto-discovers samples
8. Add a `src/test/lexer_{lang}.test.ts` suite (targeted cases +
   prefix-resilience + determinism, mirroring the existing suites)
9. Generate fixtures and test

## Demo pages

- `/docs` - tomes: usage, samples, textarea, benchmark, api
- `/benchmark` - interactive browser benchmark (work vs paint timing)

## Project standards

Skill(fuz-stack) covers the shared conventions. Repo-specific:

- Prettier with tabs, 100 char width (not tsv)
- Node >= 24.14

## Related projects

- [`fuz_css`](../fuz_css/CLAUDE.md) - semantic-first CSS framework (provides color variables)
- [`fuz_ui`](../fuz_ui/CLAUDE.md) - UI components
- [`fuz_template`](../fuz_template/CLAUDE.md) - starter template using fuz_code
