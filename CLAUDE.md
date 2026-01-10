# fuz_code - Syntax Highlighter

A modernized fork of PrismJS optimized for runtime syntax highlighting.

## Usage

See [README.md](./README.md).

## Gro commands

```bash
gro check     # typecheck, test, lint, format check (run before committing)
gro typecheck # typecheck only (faster iteration)
gro test      # run tests with vitest
gro gen       # regenerate .gen files
gro build     # build the package for production
```

## Commands

```bash
gro test                            # run all tests
gro test src/test/fixtures/check    # verify fixture generation
gro src/test/fixtures/update        # regenerate fixtures
npm run benchmark                   # run performance benchmarks
npm run benchmark:compare           # compare performance with Prism and Shiki
```

## Architecture

### Core System

**Syntax Styler** - A PrismJS fork focused on HTML generation with CSS classes.

The system uses regex-based tokenization inherited from PrismJS, maintaining compatibility with existing language definitions. The primary use case is generating HTML with syntax highlighting at runtime.

### Key Components

#### Tokenization Engine

- `src/lib/syntax_styler.ts` - Core tokenization engine with linked list processing
- `src/lib/syntax_styler_global.ts` - Pre-configured global instance
- `tokenize_syntax()` from `src/lib/tokenize_syntax.ts` - Main tokenization function

#### Language Definitions

- `src/lib/grammar_ts.ts` - TypeScript/JS
- `src/lib/grammar_css.ts` - CSS stylesheets
- `src/lib/grammar_markup.ts` - HTML/XML markup
- `src/lib/grammar_json.ts` - JSON data
- `src/lib/grammar_svelte.ts` - Svelte components
- `src/lib/grammar_markdown.ts` - Markdown
- `src/lib/grammar_clike.ts` - Base for C-like languages

#### Components

- `src/lib/Code.svelte` - Main component for syntax highlighting with HTML generation

#### Themes

- `src/lib/theme.css` - CSS classes for HTML mode (requires Fuz CSS or theme_variables.css)
- `src/lib/theme_variables.css` - CSS variable definitions for non-Fuz CSS users

## How It Works

### Token Tree Structure

Syntax styler creates a hierarchical token tree where tokens can contain nested tokens:

```typescript
interface SyntaxToken {
	type: string; // token type (e.g., 'keyword', 'string')
	content: string | SyntaxTokenStream; // text or nested tokens
	alias: string | Array<string>; // CSS class aliases
	length: number; // token text length
}
```

### HTML Generation

The syntax styler processes the token tree and generates HTML with CSS classes:

```typescript
import {syntax_styler_global} from '$lib/syntax_styler_global.js';

// Generate HTML with syntax highlighting
const html = syntax_styler_global.stylize(code, 'ts');
```

The generated HTML uses CSS classes like `.token_keyword`, `.token_string`, etc., which are styled by `theme.css`.

## Supported Languages

- `ts` - TypeScript
- `js` - JS
- `css` - CSS
- `html` - HTML/XML
- `json` - JSON
- `svelte` - Svelte components
- `md` - Markdown

## API Reference

### SyntaxStyler

```typescript
class SyntaxStyler {
	// Generate HTML with syntax highlighting
	stylize(text: string, lang: string): string;

	// Get language grammar
	get_lang(id: string): Grammar;

	// Add new language
	add_lang(id: string, grammar: Grammar, aliases?: Array<string>): void;
}
```

### Pre-configured instance

```typescript
import {syntax_styler_global} from '$lib/syntax_styler_global.js';

const html = syntax_styler_global.stylize(code, 'ts');
```

## Testing

### Sample Files

Test samples in `src/test/fixtures/samples/sample_*.{lang}` are the source of truth.

### Fixtures

Generated fixtures in `src/test/fixtures/{lang}/`:

- `{lang}_{variant}.json` - Token data and HTML output
- `{lang}_{variant}.txt` - Human-readable debug output

### Workflow

1. Edit samples in `src/test/fixtures/samples/`
2. Run `gro src/test/fixtures/update` to regenerate
3. Run `gro test src/test/fixtures/check` to verify
4. Review changes with `git diff src/test/fixtures/`

## Experimental Features

### CSS Custom Highlight API Support

An experimental alternative component (`CodeHighlight.svelte`) is available that supports the CSS Custom Highlight API
for browsers that implement it. This is not recommended for general use due to limited browser support.

**Components:**
- `src/lib/CodeHighlight.svelte` - Hybrid component supporting both HTML and range modes with auto-detection
- `src/lib/highlight_manager.ts` - Manages CSS Custom Highlights per element

**Theme:**
- `src/lib/theme_highlight.css` - CSS with both `.token_*` classes and `::highlight()` pseudo-elements

#### Range Highlighting Implementation

For CSS Custom Highlights, ranges are created directly from the token tree:

```typescript
// Generate tokens from syntax styler
const tokens = tokenize_syntax(code, grammar);
// Highlight manager creates ranges directly from the token tree
highlight_manager.highlight_from_syntax_tokens(element, tokens);
```

#### HighlightManager API

```typescript
const manager = new HighlightManager();

// Apply highlights from tokens
manager.highlight_from_syntax_tokens(element, tokens);

// Clear highlights
manager.clear_element_ranges();

// Clean up
manager.destroy();
```

**Note:** The CSS Custom Highlight API has limitations (e.g., no font-weight or font-style support)
and is not widely supported across browsers. Use the standard `Code.svelte` component for production use.

## Performance

### Benchmarking

```bash
npm run benchmark           # internal performance benchmark
npm run benchmark:compare   # compare with Prism and Shiki
```

**Internal benchmark** tests fuz_code performance across all sample files with small and large (100x) content.

**Comparison benchmark** (`./benchmark/compare/`) tests fuz_code against:

- Prism - Similar regex-based approach
- Shiki JS - JS regex engine
- Shiki Oniguruma - Full TextMate grammar engine

Results show relative performance (% of fastest) for each language and content size.

### Optimization Notes

- **HTML Mode** (standard): Proven PrismJS approach, works everywhere, good for SSR
- **Range Mode** (experimental): Native browser highlighting available in `CodeHighlight.svelte`, limited browser support

## Color Variables

Theme uses CSS variables from Fuz CSS:

- `--color_a` - Keywords, tags
- `--color_b` - Strings, selectors
- `--color_c` - Types (TypeScript)
- `--color_d` - Functions, classes
- `--color_e` - Numbers, regex
- `--color_f` - Operators, keywords
- `--color_g` - Attributes
- `--color_h` - Properties
- `--color_i` - Booleans, comments

## Development Guidelines

1. **Maintain PrismJS compatibility** - Language definitions should work with upstream
2. **Test with fixtures** - All changes must pass fixture tests
3. **No automated commits** - Manual review required
4. **Focus on HTML mode** - Primary development focus is HTML generation
5. **Follow patterns** - Use existing language definitions as templates

## Demo Pages

- `/samples` - Code samples in all supported languages
- `/benchmark` - Performance testing

## Troubleshooting

### Positions Don't Match

The position calculation happens during range creation. If positions are wrong:

1. Check `highlight_manager.ts` range creation logic
2. Verify token tree structure with debug output
3. Look for nested tokens that might be miscounted

### Adding a New Language

1. Create `src/lib/grammar_{lang}.ts`
2. Define grammar patterns (see existing languages)
3. Register in `syntax_styler_global.ts`
4. Add samples in `src/test/fixtures/samples/sample_{variant}.{lang}`
5. Generate fixtures and test
