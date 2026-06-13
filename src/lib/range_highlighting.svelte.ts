import {onDestroy} from 'svelte';
import {DEV} from 'esm-env';

import {tokenize_syntax} from './tokenize_syntax.js';
import type {SyntaxStyler, SyntaxGrammar} from './syntax_styler.js';
import {HighlightManager, supports_css_highlight_api} from './highlight_manager.js';

/**
 * Reactive inputs for `create_range_highlighting`. All values are getters so the
 * helper can track the consuming component's reactive state across the call
 * boundary (the Svelte 5 getter-injection pattern).
 */
export interface RangeHighlightingOptions {
	/** The element whose first text node receives the highlight ranges. */
	element: () => Element | undefined;
	/**
	 * The text to tokenize. Must match the element's text node exactly (e.g. a
	 * textarea backdrop includes its trailing newline here too).
	 */
	text: () => string;
	/** Language id; `null` disables highlighting. */
	lang: () => string | null;
	/** Optional custom grammar; takes precedence over `lang` for tokenization. */
	grammar: () => SyntaxGrammar | undefined;
	/** The syntax styler whose registered grammars back `lang` lookups. */
	syntax_styler: () => SyntaxStyler;
	/** Extra gate — ranges are only applied when this returns true. Defaults to always-on. */
	enabled?: () => boolean;
	/** Component name used in DEV warnings. */
	dev_label: string;
}

/** Reactive outputs from `create_range_highlighting`. */
export interface RangeHighlighting {
	readonly language_supported: boolean;
	readonly highlighting_disabled: boolean;
}

/**
 * Wires up CSS Custom Highlight API range highlighting for a single element's
 * text node, shared by `CodeHighlight` and `CodeTextarea`. Creates a
 * `HighlightManager`, memoizes tokenization, applies/clears ranges in an effect,
 * emits DEV warnings for unsupported languages, and tears down on destroy.
 *
 * Must be called during component initialization (it uses `$effect`/`onDestroy`).
 */
export const create_range_highlighting = (options: RangeHighlightingOptions): RangeHighlighting => {
	const manager = supports_css_highlight_api() ? new HighlightManager() : null;
	const is_enabled = options.enabled ?? (() => true);

	const language_supported = $derived(
		options.lang() !== null && !!options.syntax_styler().langs[options.lang()!],
	);
	const highlighting_disabled = $derived(
		options.lang() === null || (!language_supported && !options.grammar()),
	);

	// tokenize once per (text, grammar, lang) change -- memoized so unrelated
	// reactivity doesn't trigger a full re-tokenization
	const range_tokens = $derived.by(() => {
		if (!manager || !is_enabled() || highlighting_disabled) return null;
		const text = options.text();
		if (!text) return null;
		return tokenize_syntax(
			text,
			options.grammar() || options.syntax_styler().get_lang(options.lang()!),
		); // ! safe bc of `highlighting_disabled`
	});

	if (manager) {
		$effect(() => {
			const element = options.element();
			if (!element || !range_tokens) {
				manager.clear_element_ranges();
				return;
			}
			manager.highlight_from_syntax_tokens(element, range_tokens);
		});
	}

	if (DEV) {
		$effect(() => {
			if (options.lang() && !language_supported && !options.grammar()) {
				const langs = Object.keys(options.syntax_styler().langs).join(', ');
				// eslint-disable-next-line no-console
				console.error(
					`[${options.dev_label}] Language "${options.lang()}" is not supported and no custom grammar provided. ` +
						`Highlighting disabled. Supported: ${langs}`,
				);
			}
		});
	}

	onDestroy(() => manager?.destroy());

	return {
		get language_supported() {
			return language_supported;
		},
		get highlighting_disabled() {
			return highlighting_disabled;
		},
	};
};
