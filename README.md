# @fuzdev/fuz_code

[<img src="static/logo.svg" alt="a friendly pink spider facing you" align="right" width="192" height="192">](https://code.fuz.dev/)

> syntax styler for TypeScript, Svelte, Markdown, and more 🎨

**[code.fuz.dev](https://code.fuz.dev/)**

`fuz_code` is a syntax styler: it turns source code into HTML with
token CSS classes, or ranges for the
[CSS Custom Highlight API](https://developer.mozilla.org/en-US/docs/Web/API/CSS_Custom_Highlight_API).
It originated as a fork of [Prism](https://prismjs.com/) by [Lea Verou](https://lea.verou.me/)
and has since been rewritten: each language has a lexer that scans without
regular expressions and emits tokens as a flat stream in a typed array, for high performance.
The flat token stream is an idea borrowed from [pngwn](https://pngwn.at/),
the author of [Twinkleplop](https://twinkleplop.pngwn.at/).

Twinkleplop is the broader project: it compiles declarative grammars, covers more
languages, and ships themes, annotations, and markdown integrations.
fuz_code is narrower, with a lexer written as ordinary code for each of a small
set of languages, and a few Svelte components.

Features:

- a minimal, explicit API to generate stylized HTML — `stylize(code, lang)`
- written in TypeScript; the lexers and styler import nothing outside the package
- built-in languages listed below, extensible by writing a lexer

Two optional integrations:

- [Svelte](https://svelte.dev/) support with a
  [Svelte lexer](src/lib/lexer_svelte.ts) and a
  [Svelte component](src/lib/Code.svelte)
- the [default theme](src/lib/theme.css) integrates with
  [fuz_css](https://github.com/fuzdev/fuz_css) for colors that adapt to the
  user's runtime `color-scheme` preference — without fuz_css, import
  [theme_variables.css](src/lib/theme_variables.css) or otherwise define those
  variables

Compared to [Shiki](https://github.com/shikijs/shiki), fuz_code is
[about two orders of magnitude faster](./benchmark/compare/results.md) for
runtime usage: it runs one single-pass lexer per language rather than the
[Oniguruma regexp engine](https://shiki.matsu.io/guide/regex-engines) that
TextMate grammars require. Shiki targets build-time use and supports far more
languages and themes.

## Usage

```bash
npm i -D @fuzdev/fuz_code
```

```svelte
<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';
</script>

<!-- defaults to Svelte -->
<Code content={svelte_code} />
<!-- select a lang -->
<Code content={ts_code} lang="ts" />
```

```ts
import { syntax_styler_global } from '@fuzdev/fuz_code/syntax_styler_global.ts';

// Generate HTML with syntax styling
const html = syntax_styler_global.stylize(code, 'ts');

// Get the flat event stream for custom processing
const lexed = syntax_styler_global.lex(code, 'ts');
```

Themes are CSS files and work with any framework.

With SvelteKit:

```ts
// +layout.svelte
import '@fuzdev/fuz_code/theme.css';
```

The [default theme](src/lib/theme.css) depends on
[fuz_css](https://github.com/fuzdev/fuz_css)
for [color-scheme](https://css.fuz.dev/docs/themes) awareness.
See the [fuz_css docs](https://css.fuz.dev/) for its usage.

If you're not using fuz_css, import `theme_variables.css` alongside `theme.css`:

```ts
// Without fuz_css:
import '@fuzdev/fuz_code/theme.css';
import '@fuzdev/fuz_code/theme_variables.css';
```

### Modules

- [@fuzdev/fuz_code/syntax_styler_global.ts](src/lib/syntax_styler_global.ts) -
  pre-configured instance with all built-in languages
- [@fuzdev/fuz_code/syntax_styler.ts](src/lib/syntax_styler.ts) -
  the `SyntaxStyler` class (register your own lexers)
- [@fuzdev/fuz_code/theme.css](src/lib/theme.css) -
  default theme that depends on [fuz_css](https://github.com/fuzdev/fuz_css)
- [@fuzdev/fuz_code/theme_variables.css](src/lib/theme_variables.css) -
  CSS variables for non-fuz_css users
- [@fuzdev/fuz_code/Code.svelte](src/lib/Code.svelte) -
  Svelte component for syntax styling with HTML generation
- [@fuzdev/fuz_code/svelte_preprocess_fuz_code.ts](src/lib/svelte_preprocess_fuz_code.ts) -
  build-time preprocessor for static `Code` content

See [`src/lib`](src/lib) for the full set of modules.

### Languages

Registered by default in `syntax_styler_global`:

- [`markup`](src/lib/lexer_markup.ts) (`html`, `mathml`, `svg`)
- [`xml`](src/lib/lexer_markup.ts) (`ssml`, `atom`, `rss`)
- [`svelte`](src/lib/lexer_svelte.ts)
- [`md`](src/lib/lexer_md.ts) (`markdown`)
- [`ts`](src/lib/lexer_ts.ts) (`typescript`, `js`, `javascript` — JS is a syntactic subset)
- [`css`](src/lib/lexer_css.ts)
- [`json`](src/lib/lexer_json.ts) — accepts comments (JSONC)
- [`sh`](src/lib/lexer_bash.ts) (`bash`, `shell` — the POSIX/bash family)
- [`rust`](src/lib/lexer_rust.ts) (`rs`)

Add a language by writing a `SyntaxLang` lexer and registering it with
`add_lang` — see the existing `lexer_*.ts` modules.

### Docs

- [code.fuz.dev/docs](https://code.fuz.dev/docs) -
  [usage](https://code.fuz.dev/docs/usage),
  [samples](https://code.fuz.dev/docs/samples),
  [textarea](https://code.fuz.dev/docs/textarea),
  [benchmark](https://code.fuz.dev/docs/benchmark), and
  [API](https://code.fuz.dev/docs/api)
- [CLAUDE.md](./CLAUDE.md) - architecture and development guidelines
- [sample files](src/test/fixtures/samples/) and [tests](src/test/)

Issues and questions are welcome.

## Experimental highlight support

For browsers that support the
[CSS Custom Highlight API](https://developer.mozilla.org/en-US/docs/Web/API/CSS_Custom_Highlight_API),
fuz_code provides an experimental component that can use native browser highlighting
as an alternative to HTML generation.

Browser support is limited, and the API can't apply layout-affecting styles —
bold, italics, font sizes — so themes that use them render differently.
The standard [Code.svelte](src/lib/Code.svelte) component using HTML generation
is recommended for most use cases.

```svelte
<script lang="ts">
	import CodeHighlight from '@fuzdev/fuz_code/CodeHighlight.svelte';
</script>

<!-- auto-detect and use CSS Highlight API when available -->
<CodeHighlight content={code} mode="auto" />
<!-- force HTML mode -->
<CodeHighlight content={code} mode="html" />
<!-- force ranges mode (requires browser support) -->
<CodeHighlight content={code} mode="ranges" />
```

When using the experimental highlight component, import the corresponding theme:

```ts
// instead of theme.css, import theme_highlight.css in +layout.svelte:
import '@fuzdev/fuz_code/theme_highlight.css';
```

Experimental modules:

- [@fuzdev/fuz_code/CodeHighlight.svelte](src/lib/CodeHighlight.svelte) -
  component supporting both HTML generation and CSS Custom Highlight API
- [@fuzdev/fuz_code/CodeTextarea.svelte](src/lib/CodeTextarea.svelte) -
  editable `<textarea>` with live range highlighting
- [@fuzdev/fuz_code/highlight_manager.ts](src/lib/highlight_manager.ts) -
  manages browser [`Highlight`](https://developer.mozilla.org/en-US/docs/Web/API/Highlight)
  and [`Range`](https://developer.mozilla.org/en-US/docs/Web/API/Range) APIs
- [@fuzdev/fuz_code/theme_highlight.css](src/lib/theme_highlight.css) -
  theme with `::highlight()` pseudo-elements for CSS Custom Highlight API

## Contributing

[fuz.dev/contributing](https://www.fuz.dev/contributing)

## License [🐦](https://wikipedia.org/wiki/Free_and_open-source_software)

Originally forked from [Prism](https://github.com/PrismJS/prism)
([prismjs.com](https://prismjs.com/)) by [Lea Verou](https://lea.verou.me/) —
with the Svelte support originally based on
[`prism-svelte`](https://github.com/pngwn/prism-svelte) by
[@pngwn](https://github.com/pngwn).

[MIT](LICENSE)
