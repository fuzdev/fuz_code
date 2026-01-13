# @fuzdev/fuz_code

[<img src="static/logo.svg" alt="a friendly pink spider facing you" align="right" width="192" height="192">](https://code.fuz.dev/)

> syntax styling utilities and components for TypeScript, Svelte, and Markdown 🎨

**[code.fuz.dev](https://code.fuz.dev/)**

fuz_code is a rework of [Prism](https://github.com/PrismJS/prism)
([prismjs.com](https://prismjs.com/)).
The main changes:

- has a minimal and explicit API to generate stylized HTML, and knows nothing about the DOM
- uses stateless ES modules, instead of globals with side effects and pseudo-module behaviors
- has various incompatible changes, so using Prism grammars requires some tweaks
- smaller (by 7kB minified and 3kB gzipped, ~1/3 less)
- written in TypeScript
- is a fork, see the [MIT license](https://github.com/fuzdev/fuz_code/blob/main/LICENSE)

Like Prism, there are zero dependencies (unless you count Prism's `@types/prismjs`),
but there are two optional dependencies:

- fuz_code provides optional builtin [Svelte](https://svelte.dev/) support
  with a [Svelte grammar](src/lib/grammar_svelte.ts)
  based on [`prism-svelte`](https://github.com/pngwn/prism-svelte)
  and a [Svelte component](src/lib/Code.svelte) for convenient usage.
- The [default theme](src/lib/theme.css) integrates
  with my CSS library [fuz_css](https://github.com/fuzdev/fuz_css) for colors that adapt to the user's runtime `color-scheme` preference.
  Non-fuz_css users should import [theme_variables.css](src/lib/theme_variables.css)
  or otherwise define those variables.

Compared to [Shiki](https://github.com/shikijs/shiki),
this library is much lighter
(with its faster `shiki/engine/javascript`, 503kB minified to 16kB, 63kb gzipped to 5.6kB),
and [vastly faster](./benchmark/compare/results.md)
for runtime usage because it uses JS regexps instead of
the [Onigurama regexp engine](https://shiki.matsu.io/guide/regex-engines)
used by TextMate grammars.
Shiki also has 38 dependencies instead of 0.
However this is not a fair comparison because
Prism grammars are much simpler and less powerful than TextMate's,
and Shiki is designed mainly for buildtime usage.

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
import {syntax_styler_global} from '@fuzdev/fuz_code/syntax_styler_global.js';

// Generate HTML with syntax highlighting
const html = syntax_styler_global.stylize(code, 'ts');

// Get raw tokens for custom processing
import {tokenize_syntax} from '@fuzdev/fuz_code/tokenize_syntax.js';
const tokens = tokenize_syntax(code, syntax_styler_global.get_lang('ts'));
```

Themes are just CSS files, so they work with any JS framework.

With SvelteKit:

```ts
// +layout.svelte
import '@fuzdev/fuz_code/theme.css';
```

The primary themes (currently just [one](src/lib/theme.css)) have a dependency
on my CSS library [fuz_css](https://github.com/fuzdev/fuz_css)
for [color-scheme](https://css.fuz.dev/docs/themes) awareness.
See the [fuz_css docs](https://css.fuz.dev/) for its usage.

If you're not using fuz_css, import `theme_variables.css` alongside `theme.css`:

```ts
// Without fuz_css:
import '@fuzdev/fuz_code/theme.css';
import '@fuzdev/fuz_code/theme_variables.css';
```

### Modules

- [@fuzdev/fuz_code/syntax_styler_global.js](src/lib/syntax_styler_global.ts) - pre-configured instance with all grammars
- [@fuzdev/fuz_code/syntax_styler.js](src/lib/syntax_styler.ts) - base class for custom grammars
- [@fuzdev/fuz_code/theme.css](src/lib/theme.css) -
  default theme that depends on [fuz_css](https://github.com/fuzdev/fuz_css)
- [@fuzdev/fuz_code/theme_variables.css](src/lib/theme_variables.css) -
  CSS variables for non-fuz_css users
- [@fuzdev/fuz_code/Code.svelte](src/lib/Code.svelte) -
  Svelte component for syntax highlighting with HTML generation

I encourage you to poke around [`src/lib`](src/lib) if you're interested in using fuz_code.

### Grammars

Enabled by default in `syntax_styler_global`:

- [`markup`](src/lib/grammar_markup.ts) (html, xml, etc)
- [`svelte`](src/lib/grammar_svelte.ts)
- [`markdown`](src/lib/grammar_markdown.ts)
- [`ts`](src/lib/grammar_ts.ts)
- [`css`](src/lib/grammar_css.ts)
- [`js`](src/lib/grammar_js.ts)
- [`json`](src/lib/grammar_json.ts)
- [`clike`](src/lib/grammar_clike.ts)

### More

Docs are a work in progress:

- this readme has basic usage instructions
- [CLAUDE.md](./CLAUDE.md) has more high-level docs including benchmarks
- [code.fuz.dev](https://code.fuz.dev/) has usage examples with the Svelte component
- [samples](https://code.fuz.dev/samples) on the website
  (also see the [sample files](src/lib/samples/))
- [tests](src/lib/syntax_styler.test.ts)

Please open issues if you need any help.

## Experimental highlight support

For browsers that support the
[CSS Custom Highlight API](https://developer.mozilla.org/en-US/docs/Web/API/CSS_Custom_Highlight_API),
fuz_code provides an experimental component that can use native browser highlighting
as an alternative to HTML generation.

This feature is experimental, browser support is limited,
and there can be subtle differences because some CSS like bold/italics are not supported.
(nor are font sizes and other layout-affecting styles, in case your theme uses those)
The standard `Code.svelte` component
using HTML generation is recommended for most use cases.

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

based on [Prism](https://github.com/PrismJS/prism)
by [Lea Verou](https://lea.verou.me/)

the [Svelte grammar](src/lib/grammar_svelte.ts)
is based on [`prism-svelte`](https://github.com/pngwn/prism-svelte)
by [@pngwn](https://github.com/pngwn)

[MIT](LICENSE)
