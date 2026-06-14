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

<div class="code_textarea" data-lang={lang}>
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
		display: grid;
		position: relative;
		width: 100%;
	}

	/* stack the backdrop and textarea in the same grid cell so they coincide */
	.code_textarea > :global(*) {
		grid-area: 1 / 1;
	}

	/* metrics shared by both layers so characters align exactly */
	.code_textarea_backdrop,
	.code_textarea textarea {
		margin: 0;
		box-sizing: border-box;
		width: 100%;
		padding: var(--space_xs3) var(--space_xs);
		border: 1px solid transparent;
		border-radius: var(--radius_xs, 2px);
		font-family: var(--font_family_mono, monospace);
		font-size: var(--font_size_sm, 0.9rem);
		line-height: var(--line_height_md, 1.5);
		letter-spacing: inherit;
		tab-size: 2;
		white-space: pre-wrap;
		overflow-wrap: break-word;
		overflow: auto;
		/* reserve gutter on both layers so the textarea's scrollbar doesn't shrink
		   its wrap width relative to the backdrop, which would drift highlights */
		scrollbar-gutter: stable;
	}

	.code_textarea_backdrop {
		pointer-events: none;
		user-select: none;
		overflow: hidden; /* scrolled programmatically to match the textarea */
		color: var(--text_color, currentColor);
	}

	.code_textarea textarea {
		background-color: transparent;
		/* the textarea's own text is invisible; the backdrop shows through */
		color: transparent;
		caret-color: var(--text_color, currentColor);
		border-color: var(--border_color, currentColor);
		resize: vertical;
	}
</style>
