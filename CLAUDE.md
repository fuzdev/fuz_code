# fuz_code

> Syntax highlighting - hand-written single-pass lexers

fuz_code (`@fuzdev/fuz_code`) is a runtime syntax highlighting library optimized
for HTML generation with CSS classes. It originated as a PrismJS fork and keeps
its `.token_*` class vocabulary, but the tokenizer is a full rewrite — one
hand-written single-pass lexer per language emitting a flat token event stream,
with zero regular expressions.

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
- 8 built-in languages (TS, JS, CSS, HTML, JSON, Svelte, Markdown, Bash)
- Extensible by writing a lexer (`SyntaxLang`)
- Optional Svelte component (`Code.svelte`)

### What fuz_code does NOT include

- Build-time/SSR-only highlighting (use Shiki)
- TextMate grammar compatibility
- VS Code theme support
- Line numbers or code editing
- Syntax validation or error detection

## Architecture

### Directory structure

```
benchmark/                          # performance testing
├── benchmarks.ts               # main benchmark runner
└── compare/                    # Prism/Shiki comparison
src/
├── lib/                        # exportable library code
│   ├── syntax_styler.ts        # SyntaxStyler class: registry + lex/stylize facade
│   ├── syntax_styler_global.ts # pre-configured global instance
│   ├── lexer.ts                # lexer substrate: Lexer, TokenTypeRegistry, flat events, HTML render
│   ├── lexer_*.ts              # hand-written lexers (json, ts, css, bash, markup, svelte, md)
│   ├── Code.svelte             # main Svelte component
│   ├── CodeHighlight.svelte    # experimental CSS Highlight API
│   ├── highlight_manager.ts    # CSS Highlight API manager
│   ├── highlight_priorities.ts # generated token priorities
│   ├── theme.css               # token CSS classes
│   ├── theme_variables.css     # CSS variable fallbacks
│   └── theme_highlight.css     # CSS Highlight API theme
├── test/                       # test files and fixtures
│   ├── highlight_manager.test.ts
│   ├── lexer*.test.ts          # lexer-engine suites (substrate + per language)
│   ├── lexer.pathological.test.ts # linearity + validity on adversarial inputs
│   ├── pathological.ts         # pathological input generators (tests + benchmark)
│   └── fixtures/
│       ├── samples/            # source of truth sample files
│       ├── generated/          # generated fixture outputs
│       ├── check.test.ts       # fixture validation
│       └── update.task.ts      # fixture regeneration task
└── routes/                     # demo/docs site
    ├── samples/                # language samples showcase
    ├── benchmark/              # interactive benchmark UI
    └── docs/                   # API documentation
```

### Core system

**Lexer engine** (`lexer.ts` + `lexer_*.ts`) - hand-written single-pass
lexers emitting flat token events (`Int32Array`) rendered to HTML in one
forward pass. Token types intern into a `TokenTypeRegistry`
(`token_types_global` by default, injectable via `SyntaxStylerOptions`).

**SyntaxStyler** - The main class: a language registry and a `lex`/`stylize`
facade over the lexer engine. `lex(text, lang)` returns the flat event stream
(`LexedSyntax`); `stylize(text, lang)` renders it to HTML.

**syntax_styler_global** - Pre-configured instance with all built-in
languages registered. Import this for typical usage.

### Token structure

The lexer emits a flat event stream (`LexedSyntax`) — leaf/open/close records
in one `Int32Array` with interned type ids; plain text is implicit between
events (recovered from offsets). `render_syntax_html` streams HTML from it in
one forward pass, wrapping spans with classes like `.token_keyword`,
`.token_string` (styled by `theme.css`); `syntax_events_to_tokens` flattens it
to `{type, start, end}` for tests and fixtures.

### Language definitions

One `SyntaxLang` lexer per language, registered via `add_lang`:

- `lexer_json.ts` - JSON (with comments)
- `lexer_ts.ts` - TypeScript; also registers the `js`/`javascript` aliases
  (TS is a syntactic superset — there is no separate JS lexer)
- `lexer_css.ts` - CSS (including native nesting)
- `lexer_bash.ts` - Bash; also registers the `sh`/`shell` aliases (POSIX sh
  is a syntactic subset for highlighting — bash-family only, no fish etc.)
- `lexer_markup.ts` - HTML (`markup`/`html`/`mathml`/`svg`: rawtext
  script/style/textarea/title, `style=`/`on*=` attribute embedding) and XML
  (`xml`/`ssml`/`atom`/`rss`: plain tag scanning), one shared scanner
  parameterized by `MarkupLexMode`
- `lexer_svelte.ts` - Svelte: the markup scanner in svelte mode (script→ts,
  no special attrs) plus the `{…}` expression lexer (blocks, each/await
  splits, at-directives, directive modifiers)
- `lexer_md.ts` - Markdown: line-oriented block scan (fences with exact-word
  info matching and any-length closers, headings, blockquotes, lists, hr)
  with a per-block inline scan (emphasis, inline code, links, entities, raw
  markup via the markup scanner); fences embed their languages

Embedded languages resolve lazily by name through the registry (markdown
fences → any language, markup `<script>`/`<style>`/`style=`/`on*=`, svelte
`{…}` → ts) via `Lexer.embed`, which bounds nesting (`MAX_EMBED_DEPTH`) so
the one cycle in the embed graph — markdown fences embedding markdown —
can't overflow the call stack; past the cap a region stays plain text.

### Generated files

- `highlight_priorities.gen.ts` → `highlight_priorities.ts` - extracts token
  type names from theme CSS and generates TypeScript types

### API

**SyntaxStyler class:**

- `stylize(text, lang)` - generate HTML with syntax highlighting
- `lex(text, lang)` - lex to the flat token event stream (`LexedSyntax`)
- `add_lang(lang)` - register a `SyntaxLang` lexer (and its aliases)
- `has_lang(id)` - whether a language is registered under `id`

**Code.svelte props:**

- `content` (required) - source code to highlight
- `lang` - language identifier (default: 'svelte')
- `inline` - boolean for inline vs block
- `wrap` - boolean for text wrapping
- `nomargin` - boolean for margin control

## Supported languages

`ts`, `js`, `css`, `html`, `json`, `svelte`, `md`, `bash`

## Testing

### Fixture workflow

1. Edit samples in `src/test/fixtures/samples/sample_*.{lang}`
2. Run `gro src/test/fixtures/update` to regenerate
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

The `:vs` suffix (not `:compare`) marks this as a cross-implementation
shootout against external libs (Prism, Shiki) — distinct from the
in-tree baseline comparison the internal benchmark performs via
`@fuzdev/fuz_util`'s `benchmark_baseline_compare`. The internal benchmark
runs the baseline compare on every invocation (free; just reads
`benchmark/baseline.json`); only `--save` mutates it.

Internal benchmark tests all sample files at normal and 100x sizes, plus a
`pathological:` group of generated adversarial inputs (`src/test/pathological.ts`,
32KB each, shorter per-case budget) that tracks the lexer engine's worst-case
constants; the same generators back the CI linearity suite
(`src/test/lexer.pathological.test.ts`). The vs comparison tests against
Prism and Shiki (JS and Oniguruma engines).

### Updating committed result snapshots

`benchmark/compare/results.md` is linked from `README.md` as evidence for
the "vastly faster than Shiki" claim — it's load-bearing for the public
narrative, not just incidental output. `benchmark/results.md` is referenced
locally as a perf baseline. `benchmark/baseline.json` is the machine-readable
counterpart used by `benchmark_baseline_compare` for regression detection.
It's **gitignored** (per the fuz_util/fuz_ui convention) — perf numbers
vary across machines, so the baseline is a per-developer local tracker,
re-seeded on each machine that runs benchmarks. PR review still relies on
the committed `results.md`.

Workflow:

```bash
npm run benchmark             # check current perf against your local baseline
npm run benchmark:save        # accept the change: rewrites results.md + baseline.json
npm run benchmark:clean       # nuke the local baseline (re-seed on next --save)
npm run benchmark:vs:write    # full overwrite of benchmark/compare/results.md
```

`--save` is a single switch by design — accepting a perf change should
update both the doc artifact and the local regression baseline atomically,
so they can't drift apart.

How the writers differ:

- **`benchmark:vs:write`** fully overwrites `benchmark/compare/results.md`
  because the file is single-source — every byte comes from
  `format_comparison_results`. No baseline involved.
- **`benchmark:save`** rewrites two files:
  1. The region between `<!-- node-bench:start -->` and
     `<!-- node-bench:end -->` in `benchmark/results.md`. The file's
     `## Browser Benchmark Results` section is hand-pasted from the
     browser benchmark UI (`src/routes/benchmark/`) and is preserved
     untouched. If you ever remove the sentinel markers, `--save` will
     error with a recovery hint rather than guess where to put the content.
  2. `benchmark/baseline.json` — a JSON snapshot of the same run, used by
     `benchmark_baseline_compare` (10% regression threshold, 30-day
     staleness warning). The baseline compare runs *before* the save, so
     the run still reports what changed against the prior baseline.

Update the browser section manually after running the browser benchmark
in dev — there's no auto-write path for it because the inputs only exist
client-side.

If the baseline schema version in `@fuzdev/fuz_util` advances, a stale
`baseline.json` is auto-deleted with a warning on next run — re-seed with
`npm run benchmark:save`. Same fallback applies if the JSON is corrupt.

## Experimental features

### CSS Custom Highlight API

`CodeHighlight.svelte` supports the CSS Custom Highlight API for native browser
highlighting. Limited browser support - use `Code.svelte` for production.

- `mode` prop: 'auto', 'ranges', or 'html'
- `HighlightManager` class manages highlights per element
- `theme_highlight.css` provides both `.token_*` classes and `::highlight()`
  pseudo-elements

Limitations: no font-weight/font-style support in range mode.

## Color variables

Theme uses CSS variables from fuz_css:

- `--color_a` - keywords, tags
- `--color_b` - strings, selectors
- `--color_c` - types (TypeScript)
- `--color_d` - functions, classes
- `--color_e` - numbers, regex
- `--color_f` - operators
- `--color_g` - attributes
- `--color_h` - properties
- `--color_i` - booleans, comments

## Development guidelines

1. **Zero regex in lexers** - char-code scanning, native `indexOf`, keyword
   `Map` lookups; no `RegExp` anywhere (speed + Rust-twin discipline)
2. **Never throw, always cover** - any input (mid-keystroke, malformed) yields a
   valid event stream; unterminated constructs extend to their natural boundary
3. **Progress discipline** - every scan loop advances position or emits+advances
4. **Test with fixtures** - all changes must pass fixture tests
5. **Follow patterns** - use existing `lexer_*.ts` modules as templates

### Adding a new language

New languages are written as lexers:

1. Create `src/lib/lexer_{lang}.ts` exporting a `SyntaxLang` (see existing
   lexers; zero regex, flat token events)
2. Register via `add_lang` in `syntax_styler_global.ts`
3. Add samples in `src/test/fixtures/samples/sample_{variant}.{lang}`
4. Add a `src/test/lexer_{lang}.test.ts` suite (targeted cases +
   prefix-resilience + determinism, mirroring the existing suites)
5. Generate fixtures and test

## Known limitations

- **Not TextMate-compatible** - some edge cases may differ from IDE highlighting
- **CSS Custom Highlight API** - experimental, limited browser support
- **No line numbers** - not built-in, handle separately
- **Web-focused languages** - TypeScript/JS ecosystem only

## Demo pages

- `/samples` - code samples in all supported languages
- `/benchmark` - interactive performance testing

## Project standards

- TypeScript strict mode
- Svelte 5 with runes API (for demo site)
- Prettier with tabs, 100 char width
- Node >= 22.15
- Tests in `src/test/` (not co-located)
- Fixture-based testing for language lexers

## Related projects

- [`fuz_css`](../fuz_css/CLAUDE.md) - CSS framework (provides color variables)
- [`fuz_ui`](../fuz_ui/CLAUDE.md) - UI components
- [`fuz_template`](../fuz_template/CLAUDE.md) - starter template using fuz_code
