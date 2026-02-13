# fuz_code

> Syntax highlighting - a modernized PrismJS fork

fuz_code (`@fuzdev/fuz_code`) is a runtime syntax highlighting library optimized
for HTML generation with CSS classes. It's a PrismJS fork with TypeScript types
and modern module support.

For coding conventions, see Skill(fuz-stack).

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
- fuz_util (@fuzdev/fuz_util) - utility library (dev only)
- fuz_ui (@fuzdev/fuz_ui) - docs system (dev only)

## Scope

fuz_code is a **syntax highlighting library**:

- Runtime HTML generation with CSS classes
- PrismJS-compatible grammar definitions
- 8 built-in languages (TS, JS, CSS, HTML, JSON, Svelte, Markdown, Bash)
- Extensible grammar system with hooks
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
│   ├── syntax_styler.ts        # SyntaxStyler class, hook system
│   ├── syntax_styler_global.ts # pre-configured global instance
│   ├── tokenize_syntax.ts      # tokenize_syntax() function
│   ├── syntax_token.ts         # SyntaxToken class, type definitions
│   ├── grammar_*.ts            # language definitions (8 files)
│   ├── Code.svelte             # main Svelte component
│   ├── CodeHighlight.svelte    # experimental CSS Highlight API
│   ├── highlight_manager.ts    # CSS Highlight API manager
│   ├── highlight_priorities.ts # generated token priorities
│   ├── theme.css               # token CSS classes
│   ├── theme_variables.css     # CSS variable fallbacks
│   └── theme_highlight.css     # CSS Highlight API theme
├── test/                       # test files and fixtures
│   ├── syntax_styler.test.ts
│   ├── highlight_manager.test.ts
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

**SyntaxStyler** - The main class for tokenization and HTML generation. Uses
regex-based tokenization inherited from PrismJS, maintaining compatibility with
existing language definitions.

**syntax_styler_global** - Pre-configured instance with all built-in grammars
registered. Import this for typical usage.

**tokenize_syntax()** - Core tokenization function that processes text through
grammar patterns and returns a token stream.

### Token structure

Tokens form a hierarchical tree where tokens can contain nested tokens:

- `type` - token type (e.g., 'keyword', 'string')
- `content` - text or nested `SyntaxTokenStream`
- `alias` - CSS class aliases
- `length` - token text length

Generated HTML uses classes like `.token_keyword`, `.token_string`, styled by
`theme.css`.

### Language definitions

- `grammar_clike.ts` - base for C-like languages
- `grammar_js.ts` - JavaScript
- `grammar_ts.ts` - TypeScript (extends JS)
- `grammar_css.ts` - CSS stylesheets
- `grammar_markup.ts` - HTML/XML
- `grammar_json.ts` - JSON
- `grammar_svelte.ts` - Svelte components (extends markup)
- `grammar_bash.ts` - Bash/shell
- `grammar_markdown.ts` - Markdown

### Hook system

SyntaxStyler provides hooks for customizing tokenization and rendering:

- **before_tokenize** - modify code/grammar before tokenization
- **after_tokenize** - modify token stream after tokenization
- **wrap** - customize HTML output per token (add attributes, custom wrapping)

Register with `add_hook_before_tokenize()`, `add_hook_after_tokenize()`,
`add_hook_wrap()`.

### Generated files

- `highlight_priorities.gen.ts` → `highlight_priorities.ts` - extracts token
  type names from theme CSS and generates TypeScript types

### API

**SyntaxStyler class:**

- `stylize(text, lang)` - generate HTML with syntax highlighting
- `get_lang(id)` - get language grammar
- `add_lang(id, grammar, aliases?)` - register new language
- `add_extended_lang(base_id, ext_id, extension, aliases?)` - register extended
  language
- `extend_grammar(base_id, extension)` - create extended grammar without
  registration
- `grammar_insert_before(inside, before, insert, root?)` - insert tokens before
  existing

**Code.svelte props:**

- `content` (required) - source code to highlight
- `lang` - language identifier (default: 'svelte')
- `grammar` - optional custom grammar
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
npm run benchmark           # internal performance benchmark
npm run benchmark:compare   # compare with Prism and Shiki
```

Internal benchmark tests all sample files at normal and 100x sizes. Comparison
benchmark tests against Prism and Shiki (JS and Oniguruma engines).

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

1. **Maintain PrismJS compatibility** - grammars should work with upstream
2. **Test with fixtures** - all changes must pass fixture tests
3. **Focus on HTML mode** - primary development focus
4. **Follow patterns** - use existing grammars as templates

### Adding a new language

1. Create `src/lib/grammar_{lang}.ts`
2. Define grammar patterns (see existing languages)
3. Register in `syntax_styler_global.ts`
4. Add samples in `src/test/fixtures/samples/sample_{variant}.{lang}`
5. Generate fixtures and test

## Known limitations

- **Regex-based** - not TextMate grammar compatible, some edge cases may differ
  from IDE highlighting
- **CSS Custom Highlight API** - experimental, limited browser support
- **No line numbers** - not built-in, handle separately
- **Web-focused languages** - TypeScript/JS ecosystem only
- **Position tracking** - range mode position calculation can have issues with
  nested tokens

## Demo pages

- `/samples` - code samples in all supported languages
- `/benchmark` - interactive performance testing

## Project standards

- TypeScript strict mode
- Svelte 5 with runes API (for demo site)
- Prettier with tabs, 100 char width
- Node >= 22.15
- Tests in `src/test/` (not co-located)
- Fixture-based testing for language grammars

## Related projects

- [`fuz_css`](../fuz_css/CLAUDE.md) - CSS framework (provides color variables)
- [`fuz_ui`](../fuz_ui/CLAUDE.md) - UI components
- [`fuz_template`](../fuz_template/CLAUDE.md) - starter template using fuz_code
