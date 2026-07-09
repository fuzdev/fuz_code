<script lang="ts">
	/**
	 * Uses the CSS Custom Highlight API when available --
	 * https://developer.mozilla.org/en-US/docs/Web/API/CSS_Custom_Highlight_API
	 *
	 * Requires importing `theme_highlight.css` instead of `theme.css`.
	 */

	import type {Snippet} from 'svelte';
	import type {SvelteHTMLElements} from 'svelte/elements';

	import {syntax_styler_global} from './syntax_styler_global.ts';
	import type {SyntaxStyler} from './syntax_styler.ts';
	import {supports_css_highlight_api, type HighlightMode} from './highlight_manager.ts';
	import {create_range_highlighting} from './range_highlighting.svelte.ts';

	const {
		content,
		lang = 'svelte',
		mode = 'auto',
		inline = false,
		wrap = false,
		syntax_styler = syntax_styler_global,
		children,
		...rest
	}: SvelteHTMLElements['code'] & {
		/** The source code to syntax highlight. */
		content: string;
		/**
		 * Language identifier (e.g., 'ts', 'css', 'html', 'json', 'svelte', 'md').
		 *
		 * **Purpose:**
		 * - Selects the registered lexer used to highlight `content`
		 * - Sets the `data-lang` attribute and determines `language_supported`
		 *
		 * **Special values:**
		 * - `null` - Explicitly disables syntax highlighting (content rendered as plain text)
		 * - `undefined` - Falls back to default ('svelte')
		 *
		 * @default 'svelte'
		 */
		lang?: string | null;
		/**
		 * Highlighting mode for this component.
		 *
		 * **Options:**
		 * - `'auto'` - Uses CSS Custom Highlight API if supported, falls back to HTML mode
		 * - `'ranges'` - Forces CSS Custom Highlight API (requires browser support)
		 * - `'html'` - Forces HTML generation with CSS classes
		 *
		 * **Note:** CSS Custom Highlight API has limitations and limited browser support.
		 * Requires importing `theme_highlight.css` instead of `theme.css`.
		 *
		 * @default 'auto'
		 */
		mode?: HighlightMode;
		/**
		 * Whether to render as inline code or block code.
		 * Controls display via CSS classes.
		 *
		 * @default false
		 */
		inline?: boolean;
		/**
		 * Whether to wrap long lines in block code.
		 * Sets `white-space: pre-wrap` instead of `white-space: pre`.
		 *
		 * **Behavior:**
		 * - Wraps at whitespace (spaces, newlines)
		 * - Long tokens without spaces (URLs, hashes) will still scroll horizontally
		 * - Default `false` provides traditional code block behavior
		 *
		 * Only affects block code (ignored for inline mode).
		 *
		 * @default false
		 */
		wrap?: boolean;
		/**
		 * Custom `SyntaxStyler` instance to use for highlighting.
		 * Allows using a different styler with custom grammars or configuration.
		 *
		 * @default syntax_styler_global
		 */
		syntax_styler?: SyntaxStyler;
		/**
		 * Optional snippet to customize how the highlighted markup is rendered.
		 * - In HTML mode: receives the generated HTML string
		 * - In range mode: receives the plain text content
		 */
		children?: Snippet<[markup: string]>;
	} = $props();

	let code_element: HTMLElement | undefined = $state.raw();

	const supports_ranges = supports_css_highlight_api();

	const use_ranges = $derived(supports_ranges && (mode === 'ranges' || mode === 'auto'));

	const rh = create_range_highlighting({
		element: () => code_element,
		text: () => content,
		enabled: () => use_ranges,
		lang: () => lang,
		syntax_styler: () => syntax_styler,
		dev_label: 'CodeHighlight',
	});

	// Generate HTML markup for syntax highlighting in non-range mode
	const html_content = $derived.by(() => {
		if (use_ranges || !content || rh.highlighting_disabled) {
			return '';
		}

		return syntax_styler.stylize(content, lang!); // ! is safe bc of the `highlighting_disabled` calculation
	});

	// TODO do syntax styling at compile-time in the normal case, and don't import these at runtime
	// TODO @html making me nervous
</script>

<!-- eslint-disable svelte/no-at-html-tags -->

<code {...rest} class:inline class:wrap data-lang={lang} bind:this={code_element}
	>{#if use_ranges && children}{@render children(
			content,
		)}{:else if use_ranges || rh.highlighting_disabled}{content}{:else if children}{@render children(
			html_content,
		)}{:else}{@html html_content}{/if}</code
>

<style>
	/* inline code inherits fuz_css defaults: pre-wrap, inline-block, baseline alignment */

	code:not(.inline) {
		/* block code: traditional no-wrap, horizontal scroll */
		white-space: pre;
		padding: var(--space_xs3) var(--space_xs);
		display: block;
		overflow: auto;
		max-width: 100%;
	}

	code.wrap:not(.inline) {
		/* unset what we set above, otherwise rely on fuz_css base styles */
		white-space: pre-wrap;
	}
</style>
