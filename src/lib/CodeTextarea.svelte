<script lang="ts">
	/**
	 * A `<textarea>` with live syntax highlighting via the CSS Custom Highlight API.
	 *
	 * The text is rendered twice: an editable, visually-transparent `<textarea>`
	 * on top, and a backdrop `<pre>` mirror underneath whose text node receives
	 * the highlight ranges. The two share identical box metrics so characters line
	 * up exactly, and the backdrop is scroll-synced to the textarea.
	 *
	 * **Minimal by design**: this is a highlighted input, not a full editor. It
	 * does not provide line numbers, tab-to-indent, auto-resize, or undo handling
	 * — compose those on top via the spread `...rest` props and `bind:value`.
	 *
	 * **Experimental** — the Highlight API has limited browser support and cannot
	 * render font-weight/font-style. Requires importing `theme_highlight.css`.
	 */

	import type {SvelteHTMLElements} from 'svelte/elements';

	import {syntax_styler_global} from './syntax_styler_global.js';
	import type {SyntaxStyler, SyntaxGrammar} from './syntax_styler.js';
	import {create_range_highlighting} from './range_highlighting.svelte.js';

	let {
		value = $bindable(''),
		lang = 'svelte',
		grammar,
		syntax_styler = syntax_styler_global,
		wrapper_attrs,
		...rest
	}: SvelteHTMLElements['textarea'] & {
		/** The editable source code. Bindable. */
		value?: string;
		/**
		 * Language identifier (e.g. 'ts', 'css', 'svelte'). `null` disables
		 * highlighting; `undefined` falls back to the default ('svelte').
		 */
		lang?: string | null;
		/** Optional custom grammar; takes precedence over `lang` for tokenization. */
		grammar?: SyntaxGrammar | undefined;
		/** Custom `SyntaxStyler` instance (defaults to the global one). */
		syntax_styler?: SyntaxStyler;
		/**
		 * Attributes for the wrapper `<div>` — the layout box that the textarea
		 * fills and `resize` grows. Use it for sizing/layout classes, `style`,
		 * `id`, or container-level handlers. Its `class` is merged with the
		 * internal `code_textarea` class; `data-lang` stays component-controlled.
		 * (`...rest` spreads onto the `<textarea>`; the backdrop `<pre>` is
		 * internal and intentionally not exposed.)
		 */
		wrapper_attrs?: SvelteHTMLElements['div'];
	} = $props();

	// the backdrop <pre> holds the text node that gets highlighted *and* is the
	// scroll container kept in sync with the textarea
	let backdrop: HTMLElement | undefined = $state.raw();
	let textarea: HTMLTextAreaElement | undefined = $state.raw();

	// A trailing newline keeps the backdrop's last line aligned with the textarea:
	// a textarea shows an empty final line after a trailing "\n", which a <pre>
	// would otherwise collapse. Rendered as a single expression -> one text node,
	// and tokenized as-is so range positions match the text node exactly.
	const display_text = $derived(value + '\n');

	create_range_highlighting({
		element: () => backdrop,
		text: () => display_text,
		lang: () => lang,
		grammar: () => grammar,
		syntax_styler: () => syntax_styler,
		dev_label: 'CodeTextarea',
	});

	// keep the (overflow-hidden) backdrop aligned with the textarea's scroll position
	const sync_scroll = () => {
		if (!backdrop || !textarea) return;
		backdrop.scrollTop = textarea.scrollTop;
		backdrop.scrollLeft = textarea.scrollLeft;
	};
</script>

<div {...wrapper_attrs} class={['code_textarea', wrapper_attrs?.class]} data-lang={lang}>
	<pre class="code_textarea_backdrop" aria-hidden="true" bind:this={backdrop}>{display_text}</pre>
	<textarea
		bind:this={textarea}
		spellcheck="false"
		{...rest}
		bind:value
		onscroll={(e) => {
			sync_scroll();
			rest.onscroll?.(e); // preserve a consumer-supplied handler
		}}
	></textarea>
</div>

<style>
	.code_textarea {
		position: relative;
		width: 100%;
	}

	/* Metrics shared by both layers so characters align exactly. fuz_css styles
	   `pre` and `textarea` differently, so each declaration here equalizes them;
	   anything fuz_css already applies identically (box-sizing, the reset margin,
	   colors) is left to it. */
	.code_textarea_backdrop,
	.code_textarea textarea {
		/* the backdrop `pre` isn't the last child, so fuz_css's flow rule would give
		   it a bottom margin that shrinks its absolute box and drifts the last line */
		margin: 0;
		width: 100%;
		/* fuz_css pads the textarea but not `pre` — pin both the same */
		padding: var(--space_xs3) var(--space_xs);
		/* fuz_css borders the textarea but not `pre`; a transparent border on both
		   keeps the box metrics identical (the textarea's is colored below) */
		border: 1px solid transparent;
		border-radius: var(--radius_xs, 2px);
		/* the textarea would otherwise inherit the page's proportional font and
		   `line-height: normal`; the backdrop `pre` is already mono */
		font-family: var(--font_family_mono);
		font-size: var(--font_size_sm);
		line-height: var(--line_height_md);
		tab-size: 2;
		/* fuz_css sets `pre` to `white-space: pre`; both must wrap to stay aligned */
		white-space: pre-wrap;
		overflow-wrap: break-word;
		overflow: auto;
		/* reserve gutter on both layers so the textarea's scrollbar doesn't shrink
		   its wrap width relative to the backdrop, which would drift highlights */
		scrollbar-gutter: stable;
	}

	/* the backdrop is taken out of flow so the in-flow textarea (its `rows`/resize)
	   defines the box; `inset: 0` makes the backdrop fill and clip to that box,
	   scrolled programmatically to match the textarea */
	.code_textarea_backdrop {
		position: absolute;
		inset: 0;
		pointer-events: none;
		user-select: none;
		overflow: hidden;
	}

	.code_textarea textarea {
		/* sits above the backdrop so the caret and selection are visible; the
		   textarea is the only in-flow layer, so it sizes the container */
		position: relative;
		z-index: 1;
		/* the textarea's own text is invisible; the backdrop (a styled `pre`) shows
		   through, so restore a visible caret and border over the transparent ones */
		background-color: transparent;
		color: transparent;
		caret-color: var(--text_color);
		border-color: var(--border_color);
	}
</style>
