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

	import {onDestroy} from 'svelte';
	import {DEV} from 'esm-env';
	import type {SvelteHTMLElements} from 'svelte/elements';

	import {syntax_styler_global} from './syntax_styler_global.js';
	import type {SyntaxStyler, SyntaxGrammar} from './syntax_styler.js';
	import {tokenize_syntax} from './tokenize_syntax.js';
	import {HighlightManager, supports_css_highlight_api} from './highlight_manager.js';

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

	const highlight_manager = supports_css_highlight_api() ? new HighlightManager() : null;

	const language_supported = $derived(lang !== null && !!syntax_styler.langs[lang]);
	const highlighting_disabled = $derived(lang === null || (!language_supported && !grammar));

	// A trailing newline keeps the backdrop's last line aligned with the textarea:
	// a textarea shows an empty final line after a trailing "\n", which a <pre>
	// would otherwise collapse. Rendered as a single expression -> one text node,
	// and tokenized as-is so range positions match the text node exactly.
	const display_text = $derived(value + '\n');

	// Tokenize once per (display_text, grammar, lang) change. Memoized in a
	// `$derived` so unrelated reactivity doesn't re-tokenize the whole document.
	const range_tokens = $derived.by(() => {
		if (!highlight_manager || highlighting_disabled) return null;
		return tokenize_syntax(display_text, grammar || syntax_styler.get_lang(lang!)); // ! safe bc of `highlighting_disabled`
	});

	if (highlight_manager) {
		$effect(() => {
			if (!backdrop || !range_tokens) {
				highlight_manager.clear_element_ranges();
				return;
			}
			highlight_manager.highlight_from_syntax_tokens(backdrop, range_tokens);
		});
	}

	// keep the (overflow-hidden) backdrop aligned with the textarea's scroll position
	const sync_scroll = () => {
		if (!backdrop || !textarea) return;
		backdrop.scrollTop = textarea.scrollTop;
		backdrop.scrollLeft = textarea.scrollLeft;
	};

	if (DEV) {
		$effect(() => {
			if (lang && !language_supported && !grammar) {
				const langs = Object.keys(syntax_styler.langs).join(', ');
				// eslint-disable-next-line no-console
				console.error(
					`[CodeTextarea] Language "${lang}" is not supported and no custom grammar provided. ` +
						`Highlighting disabled. Supported: ${langs}`,
				);
			}
		});
	}

	onDestroy(() => highlight_manager?.destroy());
</script>

<div class="code_textarea" data-lang={lang}>
	<pre class="code_textarea_backdrop" aria-hidden="true" bind:this={backdrop}>{display_text}</pre>
	<textarea bind:this={textarea} spellcheck="false" {...rest} bind:value onscroll={sync_scroll}
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
