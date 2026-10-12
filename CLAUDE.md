# fuz_code

> Syntax styling - single-pass lexers, one per language

fuz_code (`@fuzdev/fuz_code`) is a runtime syntax styling library that
generates HTML with CSS classes. It originated as a fork of Prism and has since
been rewritten: each language has a lexer that scans without regular
expressions and emits tokens as a flat stream in a typed array, an idea
borrowed from pngwn's Twinkleplop.

For coding conventions, see Skill(fuz-stack).

## Gro commands

```bash
gro check                       # typecheck, test, gen check, format check, lint (run before committing)
gro typecheck                   # typecheck only (faster iteration)
gro test                        # run tests with vitest
gro gen                         # regenerate .gen files
gro build                       # build the package for production
gro src/test/fixtures/update    # regenerate test fixtures
```

## Dependencies

- `esm-env` (required peer) - the `DEV` flag
- `@fuzdev/fuz_util` (required peer) - preprocessor helpers
- `svelte` (optional peer) - `Code.svelte` and the other components
- `@fuzdev/fuz_css` (optional peer) - color variables for the theme
- `magic-string`, `zimmerframe` (`dependencies`) - used only by
  `svelte_preprocess_fuz_code`
- `@fuzdev/fuz_ui` (dev) - docs site

## Scope

A runtime syntax styler: lexers (built-in, or your own `SyntaxLang`) produce
HTML with `.token_*` classes, plus an optional `Code.svelte` component and a
build-time preprocessor that pre-renders static `Code` content.

Out of scope:

- a build-time/SSR-only architecture (use Shiki) — the preprocessor
  pre-renders static content, but the model is runtime lexing
- TextMate grammar compatibility (some edge cases differ from IDE
  highlighting) and VS Code themes
- line numbers or a code editor (the experimental `CodeTextarea` is a styled
  input only)
- syntax validation or error reporting

## Architecture

```
benchmark/                      # performance testing (see Performance)
├── run_benchmarks.ts           # internal benchmark CLI
├── benchmarks.ts               # cases, output metrics, markdown writers
├── results.md                  # committed internal results
├── html_sink.ts                # reads timed HTML so its flatten is on the clock
├── run_cost_model.ts           # cost model CLI
├── cost_model.ts               # per-construct costs, floor ratios, time budget
├── constructs.ts               # the constructs: units of source per language
├── floor_lexer.ts              # grammar-free lexers, the reference to beat
├── timing.ts                   # the cost model's deterministic timer
└── compare/                    # Prism/Shiki comparison
src/
├── lib/
│   ├── syntax_styler.ts        # SyntaxStyler: registry + lex/stylize facade
│   ├── syntax_styler_global.ts # instance with every built-in language
│   ├── lexer.ts                # lexer substrate: Lexer, TokenTypeRegistry, events, HTML render
│   ├── lexer_*.ts              # per-language lexers
│   ├── Code.svelte             # main component
│   ├── svelte_preprocess_fuz_code.ts # build-time preprocessor
│   ├── code_sample.ts          # `CodeSample` + `sample_langs` for the docs site
│   ├── CodeHighlight.svelte    # experimental CSS Highlight API
│   ├── CodeTextarea.svelte     # experimental live-highlighted textarea
│   ├── highlight_manager.ts    # CSS Highlight API manager
│   ├── range_highlighting.svelte.ts # shared range-highlighting helper
│   ├── highlight_priorities.ts # generated token priorities
│   ├── theme.css               # token classes
│   ├── theme_variables.css     # color variable fallbacks
│   └── theme_highlight.css     # CSS Highlight API theme
├── test/
│   ├── syntax_styler.test.ts   # registry/facade
│   ├── lexer*.test.ts          # substrate + per-language suites
│   ├── lexer.pathological.test.ts # linearity + validity on adversarial inputs
│   ├── pathological.ts         # adversarial input generators (tests + benchmark)
│   ├── svelte_preprocess_fuz_code.test.ts
│   ├── highlight_manager.test.ts
│   └── fixtures/               # samples/, generated/, helpers.ts, check.test.ts, update.task.ts
└── routes/                     # docs site
    ├── docs/                   # tomes: usage, samples, textarea, benchmark, api
    ├── benchmark/              # interactive browser benchmark
    ├── samples/                # all.gen.ts → all.ts
    ├── lang_color.ts           # per-language tint for the docs language buttons
    └── library.ts              # svelte-docinfo library metadata
```

### Lexer engine

`lexer.ts` plus one `lexer_*.ts` per language. A lex is a single pass emitting
leaf/open/close events into one `Int32Array` with interned type ids; plain text
is implicit between events (recovered from offsets). `render_syntax_html`
streams HTML from it in one forward pass, wrapping spans in classes like
`.token_keyword` (styled by `theme.css`); a one-char leaf appends its whole
span from a per-type cache, and text is sliced unscanned up to the next
character that needs an escape. Token types intern into a
`TokenTypeRegistry` (`token_types_global` by default).

Lexers:

- `lexer_json.ts` - JSON (with comments)
- `lexer_ts.ts` - TypeScript, also serving `js` — TS is a syntactic superset,
  so there's no separate JS lexer
- `lexer_css.ts` - CSS, including native nesting
- `lexer_bash.ts` - bash-family shells (POSIX sh is a subset for styling; no
  fish etc.)
- `lexer_markup.ts` - HTML (rawtext script/style/textarea/title,
  `style=`/`on*=` embedding) and XML (plain tag scanning), one scanner
  parameterized by `MarkupLexMode`
- `lexer_svelte.ts` - the markup scanner in svelte mode (script→ts, no special
  attrs, js-style comments between attributes) plus the `{…}` expression lexer
  (blocks, each/await splits, at-directives, directive modifiers,
  `{const …}`/`{let …}` declaration tags)
- `lexer_md.ts` - line-oriented block scan (fences with exact-word info
  matching and any-length closers, headings, blockquotes, lists, hr) with a
  per-block inline scan (emphasis, inline code, links, entities, raw markup via
  the markup scanner)
- `lexer_rust.ts` - one flat scan loop: nested block comments and raw strings
  resolve with counters, attribute interiors lex inline under an `[`/`]` depth
  counter, lifetime-vs-char `'` disambiguation, `name!` macros, doc-vs-plain
  comments, r/b/c string prefixes

Embedded languages resolve lazily by name through the registry (markdown
fences → any language; markup `<script>`/`<style>`/`style=`/`on*=`; svelte
`{…}` → ts) via `Lexer.embed`, which caps nesting at `MAX_EMBED_DEPTH` so the
one cycle in the embed graph — markdown fences embedding markdown — can't
overflow the stack; past the cap a region stays plain text.

### Generated files

- `highlight_priorities.gen.ts` → `highlight_priorities.ts` - the
  `HighlightTokenName` type and per-token priorities, from the
  `::highlight(…)` rules in `theme_highlight.css` (rule order = priority)
- `src/routes/samples/all.gen.ts` → `all.ts` - the fixture samples as
  `CodeSample` records for the docs site and internal benchmark

### API

**`SyntaxStyler`:**

- `stylize(text, lang)` - HTML string
- `lex(text, lang)` - the event stream (`LexedSyntax`), valid until the next lex
- `add_lang(lang)` / `has_lang(id)` / `langs` (id→lexer `Map`, keyed by
  primary id and every alias)
- `SyntaxStylerOptions.token_types` - a separate `TokenTypeRegistry`, valid
  only when every registered lexer interned into it

`lex` and `stylize` throw on an unregistered language — guard with
`has_lang`, or use `plaintext`, the no-op lexer every instance registers
(escaped, unstyled text).

**Lexer substrate (`lexer.ts`):**

- `lex_syntax(text, lang, langs?, types?)` / `render_syntax_html(lexed)` - the
  two halves `SyntaxStyler` composes. Lexing writes into one reused module
  buffer; `copy_lexed_syntax(lexed)` keeps a result past the next lex (as
  `RangeHighlighting` does)
- `syntax_events_to_tokens(lexed)` - flatten to `{type, start, end}`
- `validate_syntax_events(lexed)` - structural invariant issues, empty when
  valid
- `token_type(name, alias?)`, `TokenTypeRegistry`, `token_types_global`;
  `words_map(...entries)` for keyword tables; `WordIndex` matches a text span
  against a word set without slicing
- `Lexer` - `text`/`pos`/`end`, the `leaf`/`open`/`close` emitters,
  `embed(lang_id, start, end)`
- scanning helpers - `is_space`, `is_digit`, `is_upper`, `is_ascii_alnum`,
  `is_ascii_word`, `is_hex_digit`, `is_ident_start`, `is_ident`, `scan_ident`,
  `skip_space`, `trim_space_end`, `scan_to_line_end`, `skip_quoted`,
  `matches_ci`, `advance_probe` (with `PROBE_NOT_FOUND`), `scan_balanced_braces`

**`Code.svelte` props:**

- `content` - source to style, or `dangerous_raw_html` - pre-styled HTML (what
  the preprocessor emits; skips runtime styling) — mutually exclusive
- `lang` - default `'svelte'`; `null` or an unregistered id renders plain text
  (the latter logs an error in DEV)
- `inline`, `wrap`, `nomargin` - layout booleans
- `syntax_styler` - default `syntax_styler_global`
- `children` - snippet receiving the generated HTML, to customize rendering;
  remaining props spread onto `<code>`

**`svelte_preprocess_fuz_code`** finds `Code` usages whose `content` is
statically known (strings and ternary chains, resolved through module-level
bindings) and rewrites them to `dangerous_raw_html`. It skips usages with
spreads, a custom `syntax_styler`, or a non-static `lang`, leaving them to
runtime styling.

## Supported languages

As registered in `syntax_styler_global`:

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

## Development guidelines

1. **No regular expressions in lexers** - char-code scanning, native
   `indexOf`, keyword `Map` lookups; no `RegExp` anywhere (speed + Rust-twin
   discipline)
2. **Never throw, always cover** - any input (mid-keystroke, malformed) yields
   a valid event stream; unterminated constructs extend to their natural
   boundary (damage propagates editor-style rather than being contained — a
   malformed interior may consume its construct's closing delimiter)
3. **Progress discipline** - every scan loop advances position or
   emits+advances
4. **Nesting discipline** - no JS-call-stack recursion that scales with input
   nesting. Flat single-pass loops wherever the grammar allows (css, markup,
   svelte, json, md, and rust need no stacks); an explicit pooled frame machine
   only where a construct's interior re-enters the same grammar (`lexer_ts.ts`
   templates/generics/annotations, `lexer_bash.ts` substitutions — use these as
   the template, including their inline fast paths for bodies without
   nesting). An interior frame discovers its own closing delimiter during the
   real scan (a terminator char + depth counter on the frame) — never prescan
   for it: a prescan is a second, dumber tokenizer that can disagree with the
   real one, and it makes full-depth nesting quadratic. Cross-language
   interiors go through `Lexer.embed`, which is depth-capped rather than
   framed.
5. **Keep hidden classes alive and stable** - V8 embeds the hidden classes of
   objects in optimized code and drops that code when a major GC clears one.
   An object made per `lex` call (`Lexer`, the probe caches) holds a class
   nothing else does, so: never store a double (`Infinity`, `NaN`, a fraction)
   into a field that holds integers — use an integer sentinel like
   `PROBE_NOT_FOUND`, since the store changes the field's representation and
   with it the class — and give a new per-call class a static instance like
   `Lexer.shape_anchor` (a module variable doesn't work: V8 frees one no
   function reads, and bundlers drop an unused export)
6. **Append few pieces, and flat ones** - `render_syntax_html` builds its
   result with `+=`, which in V8 makes a rope that the first read copies into
   one string, at a cost per piece. A piece that is itself a rope costs
   several: a string precomputed with `+` and at least 13 chars long stays a
   tree, and every use carries the tree into the output. Build precomputed
   pieces with `[…].join('')` (the open tags, `TokenTypeInfo.char_spans`), and
   slice clean text rather than scanning it. A benchmark that discards the
   result never pays for the copy, so read a character of it inside the clock
7. **Follow patterns and fixtures** - use existing `lexer_*.ts` modules as
   templates; all changes must pass the fixture tests

### Adding a new language

1. Create `src/lib/lexer_{lang}.ts` exporting a `SyntaxLang`, per the
   guidelines above, and register it via `add_lang` in
   `syntax_styler_global.ts`
2. Style new token types in `theme.css` and `theme_highlight.css`, or alias
   them onto existing types (`token_type('macro', 'function')`), as the rust
   lexer does
3. Add `src/test/fixtures/samples/sample_{variant}.{ext}` — the extension
   becomes the sample's `lang`, so it must be a registered id or alias
4. Add the extension to the `file_filter` regexes in both
   `src/routes/samples/all.gen.ts` and `src/test/fixtures/helpers.ts`
   (separate copies; a sample the filter misses is silently skipped)
5. Add it to `sample_langs` in `code_sample.ts` (order drives the docs), to
   `src/routes/lang_color.ts` (a `Record<SampleLang, string>`, so typecheck
   catches a miss), and to `languages` in
   `src/routes/benchmark/benchmark_fixtures.ts` (the browser benchmark's
   fixed list)
6. Add `src/test/lexer_{lang}.test.ts` (targeted cases, prefix resilience,
   determinism — mirror the existing suites), then generate fixtures and test

## Testing

Fixture workflow:

1. Edit `src/test/fixtures/samples/sample_{variant}.{ext}`
2. `gro src/test/fixtures/update` — runs `gen` first, so it also refreshes
   `src/routes/samples/all.ts`
3. `gro test src/test/fixtures/check`
4. Review with `git diff src/test/fixtures/`

Generated fixtures in `generated/{ext}/` are named `{ext}_{variant}`, as
`.html` (rendered output) and `.txt` (token debug output).

## Performance

```bash
npm run benchmark            # internal benchmark, compared against benchmark/baseline.json
npm run benchmark:save       # …and write benchmark/results.md + baseline.json
npm run benchmark:clean      # delete baseline.json (re-seeded on next --save)
npm run benchmark:cost       # cost model, compared against its own baseline (seconds)
npm run benchmark:cost:save  # …and save that baseline
npm run benchmark:vs         # compare against Prism and Shiki (stdout only)
npm run benchmark:vs:write   # …and overwrite benchmark/compare/results.md
```

The internal benchmark covers every sample at normal and 100x sizes, plus a
`pathological:` group (32KB adversarial inputs from `src/test/pathological.ts`,
the same generators behind the linearity suite) that tracks worst-case
constants. Each run also prints deterministic output metrics (spans and utf8
HTML bytes per case — DOM-cost proxies, not timed). Every timed `stylize` call,
here and in `:vs`, passes its result to `sink_html` (`benchmark/html_sink.ts`),
which reads one character so the copy that flattens the string is inside the
clock.

### Cost model

`npm run benchmark:cost -- [<lang>] [--corpus <dir>]` is the tool for
iterating on a lexer: a full run takes seconds, one language a second or two.
The internal benchmark above is the regression gate, and cross-library numbers
come from the separate syntax-highlighter-bench repo. For each language it
prints:

- **constructs** - `benchmark/constructs.ts` lists short units of source that
  each take one path through the lexer (`'const '`, `'a: T = b; '`). Each is
  repeated into one input and timed: ns per unit and per token, and the ratio
  to the floor lexer on the same text. Repetition makes every branch
  predictable, so these are the cheap end of a path's cost; they compare paths
  with each other and a change with the code before it
- **samples** - the fixture samples (or every file under `--corpus <dir>`, by
  extension; a language with many lists only their total): ns per char and per
  token, the ratio to the floor, and how much of a `stylize` is the renderer
- **budget** - a census of the samples' tokens times the cost of the construct
  that prices each kind, as shares of the measured lex time. The remainder is
  token kinds no construct covers (listed under the table), whitespace and
  plain text, and what a repeated unit can't show: context and lookahead

A **floor lexer** (`benchmark/floor_lexer.ts`) knows no grammar: one table
lookup per char, then skip whitespace and identifiers and emit a leaf for
each number, string, comment, and punctuation run, through the same `Lexer`.
A real lexer's time over it is what the grammar costs, the part that tuning
can reach. It is a reference, not a strict bound (a specialized scan can beat
it on one construct).

`--save` writes `benchmark/cost_model.local.json` (gitignored), one baseline
per set of cases, and later runs print each case's change against the one for
the same cases: save and compare with the same arguments. What makes the
numbers repeat to a few percent, all in `benchmark/timing.ts` and
`cost_model.ts`:

- batches make a fixed number of calls and nothing is sized by the clock, and
  the timing processes run V8 with `--single-threaded` and fixed `--hash-seed`
  and `--random-seed`, so a run compiles the same code at the same points
  every time. Sized by elapsed time, short repetitive inputs land on one of
  several levels 20–40% apart
- a few processes time the cases side by side, pinned to separate cores where
  the OS allows, and each case takes the median: an occasional process puts a
  case 10–20% off
- changes are read relative to the floor lexers' median change, which tracks
  the machine (a laptop slows a few percent as back-to-back runs warm it).
  A change to the emitters or helpers in `lexer.ts` moves the floor too, and
  the last line of a run says how far it moved
- a case's cost depends on what ran before it in the process: the same
  construct can time tens of percent apart between a one-language run, a full
  run, and a corpus run. So a cost is read within a run and against that
  run's own baseline, and a baseline from another Node version is not used

The scripts run `node` directly, not `gro run`: the entry point starts its
own timing processes with those V8 flags.

`:vs` is the cross-implementation shootout against Prism and Shiki (JS and
Oniguruma engines); its languages are fixed at `ts`, `css`, `html`, `json`,
`svelte` by `supported_languages` in `benchmark/compare/compare.ts`.

Result files:

- `benchmark/compare/results.md` - backs the README's "about two orders of
  magnitude faster" claim vs Shiki, so it's load-bearing; `:vs:write`
  regenerates it entirely
- `benchmark/results.md` - `--save` rewrites only the region between
  `<!-- node-bench:start -->` and `<!-- node-bench:end -->` (it errors if the
  sentinels are missing). The `## Browser Benchmark Results` section is
  hand-pasted from the browser benchmark UI and left untouched
- `benchmark/baseline.json` - gitignored, per machine. The compare runs before
  the save, so a `--save` run still reports changes against the prior baseline
  (10% regression threshold, 30-day staleness warning); a corrupt or
  schema-outdated baseline is deleted with a warning

## Experimental: CSS Custom Highlight API

`CodeHighlight.svelte` renders via the CSS Custom Highlight API (`mode`:
`'auto'`, `'ranges'`, or `'html'`); `CodeTextarea.svelte` is an editable
`<textarea>` with live range highlighting; `HighlightManager` manages
highlights per element. `theme_highlight.css` provides both `.token_*` classes
and `::highlight()` rules. Limited browser support, and ranges can't apply
font-weight/font-style — use `Code.svelte` for production.

## Color variables

The themes reference fuz_css's palette at the `50` stop (`--palette_c_50` is
unused):

- `--text_50` - punctuation, doctype, cdata, processing instructions,
  attribute `=`
- `--palette_a_50` - keywords, tags, constants, symbols, booleans, null,
  headings
- `--palette_b_50` - comments, char literals, blockquotes, inserted
- `--palette_d_50` - at-keywords, urls
- `--palette_e_50` - selectors, functions, regex, variables, important
- `--palette_f_50` - atrules
- `--palette_g_50` - special keywords, namespaces, rules
- `--palette_h_50` - strings, attribute values, inline code
- `--palette_i_50` - attribute names, properties, decorators, link text
- `--palette_j_50` - builtins, class names, numbers

Rust's extra token types alias onto existing ones (`lifetime`→`symbol`,
`macro`→`function`, `attribute`→`attr_name`, `doc_comment`→`comment`), so
they need no theme rules. `theme_variables.css`, the fallback for consumers
without fuz_css, declares these variables as sRGB snapshots of fuz_css's OKLCH
palette, with `light-dark()` values.

## Project standards

Skill(fuz-stack) covers shared conventions. Repo-specific: tsv formatting
(`gro format`) with tabs and 100 char width; Node >= 24.14.

## Related projects

- [`fuz_css`](../fuz_css/CLAUDE.md) - CSS framework (provides the color variables)
- [`fuz_ui`](../fuz_ui/CLAUDE.md) - UI components
- [`fuz_template`](../fuz_template/CLAUDE.md) - starter template using fuz_code
