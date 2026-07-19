# @fuzdev/fuz_code

[<img src="static/logo.svg" alt="a friendly pink spider facing you" align="right" width="192" height="192">](https://code.fuz.dev/)

> syntax styling utilities and components for TypeScript, Svelte, Markdown, and more 🎨

**[code.fuz.dev](https://code.fuz.dev/)**

`fuz_code` is a runtime syntax highlighter: it turns source code into HTML with
token CSS classes, and knows nothing about the DOM.
It originated as a fork and by-hand rewrite
of [Prism](https://github.com/PrismJS/prism) ([prismjs.com](https://prismjs.com/)),
with a redesigned tokenizer that replaces regular expressions with lexers per
language emitting a flat token event stream.

Highlights:

- a minimal, explicit API to generate stylized HTML — `stylize(code, lang)`
- stateless ES modules, instead of globals with side effects
- written in TypeScript, with no runtime dependencies
- nine built-in languages (see below), extensible by writing a lexer

Two optional integrations:

- builtin [Svelte](https://svelte.dev/) support with a
  [Svelte lexer](src/lib/lexer_svelte.ts) and a
  [Svelte component](src/lib/Code.svelte)
- the [default theme](src/lib/theme.css) integrates with
  [fuz_css](https://github.com/fuzdev/fuz_css) for colors that adapt to the
  user's runtime `color-scheme` preference — without fuz_css, import
  [theme_variables.css](src/lib/theme_variables.css) or otherwise define those
  variables

Compared to [Shiki](https://github.com/shikijs/shiki), fuz_code is smaller and
[about two orders of magnitude faster](./benchmark/compare/results.md) for
runtime usage: it runs hand-written single-pass lexers rather than the
[Oniguruma regexp engine](https://shiki.matsu.io/guide/regex-engines) that
TextMate grammars require, and has no runtime dependencies instead of 38. Shiki
targets build-time use and supports far more languages and themes — pick the
tool that fits; fuz_code is optimized for small, fast runtime highlighting.

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
import {syntax_styler_global} from '@fuzdev/fuz_code/syntax_styler_global.ts';

// Generate HTML with syntax highlighting
const html = syntax_styler_global.stylize(code, 'ts');

// Get the raw flat token event stream for custom processing
const lexed = syntax_styler_global.lex(code, 'ts');
```

Themes are just CSS files, so they work with any JS framework.

With SvelteKit:

```ts
// +layout.svelte
import '@fuzdev/fuz_code/theme.css';
```

The primary themes (currently just [one](src/lib/theme.css)) depend on
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

- [@fuzdev/fuz_code/syntax_styler_global.js](src/lib/syntax_styler_global.ts) - pre-configured instance with all built-in languages
- [@fuzdev/fuz_code/syntax_styler.js](src/lib/syntax_styler.ts) - the `SyntaxStyler` class (register your own lexers)
- [@fuzdev/fuz_code/theme.css](src/lib/theme.css) -
  default theme that depends on [fuz_css](https://github.com/fuzdev/fuz_css)
- [@fuzdev/fuz_code/theme_variables.css](src/lib/theme_variables.css) -
  CSS variables for non-fuz_css users
- [@fuzdev/fuz_code/Code.svelte](src/lib/Code.svelte) -
  Svelte component for syntax highlighting with HTML generation

See [`src/lib`](src/lib) for the full set of modules.

### Languages

Registered by default in `syntax_styler_global` — one hand-written lexer each:

- [`markup`](src/lib/lexer_markup.ts) (`html`, `mathml`, `svg`)
- [`xml`](src/lib/lexer_markup.ts) (`ssml`, `atom`, `rss`)
- [`svelte`](src/lib/lexer_svelte.ts)
- [`md`](src/lib/lexer_md.ts) (markdown)
- [`ts`](src/lib/lexer_ts.ts) (TypeScript — also serves `js`/`javascript`, a syntactic subset)
- [`css`](src/lib/lexer_css.ts)
- [`json`](src/lib/lexer_json.ts) (with comments — jsonc)
- [`sh`](src/lib/lexer_bash.ts) (POSIX/bash family — also serves `bash`/`shell`)
- [`rust`](src/lib/lexer_rust.ts) (also serves `rs`)

Add a language by writing a `SyntaxLang` lexer and registering it with
`add_lang` — see the existing `lexer_*.ts` modules.

### More

Docs are a work in progress:

- this readme has basic usage instructions
- [CLAUDE.md](./CLAUDE.md) has more high-level docs including benchmarks
- [code.fuz.dev](https://code.fuz.dev/) has usage examples with the Svelte component
- [samples](https://code.fuz.dev/docs/samples) on the website
  (also see the [sample files](src/test/fixtures/samples/))
- [tests](src/test/)

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
- [@fuzdev/fuz_code/highlight_manager.js](src/lib/highlight_manager.ts) -
  manages browser [`Highlight`](https://developer.mozilla.org/en-US/docs/Web/API/Highlight)
  and [`Range`](https://developer.mozilla.org/en-US/docs/Web/API/Range) APIs
- [@fuzdev/fuz_code/theme_highlight.css](src/lib/theme_highlight.css) -
  theme with `::highlight()` pseudo-elements for CSS Custom Highlight API

## License [🐦](https://wikipedia.org/wiki/Free_and_open-source_software)

originally forked from [Prism](https://github.com/PrismJS/prism)
([prismjs.com](https://prismjs.com/)) by [Lea Verou](https://lea.verou.me/) —
with the Svelte support originally based on
[`prism-svelte`](https://github.com/pngwn/prism-svelte) by
[@pngwn](https://github.com/pngwn). The tokenizer has since been rewritten as
lexers, but the fork's lineage remains.

[MIT](LICENSE)
