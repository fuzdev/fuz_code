<script lang="ts">
	import type {Snippet} from 'svelte';
	import {DEV} from 'esm-env';
	import type {SvelteHTMLElements} from 'svelte/elements';

	import {syntax_styler_global} from './syntax_styler_global.js';
	import type {SyntaxStyler, SyntaxGrammar} from './syntax_styler.js';

	const {
		content,
		dangerous_raw_html,
		lang = 'svelte',
		grammar,
		inline = false,
		wrap = false,
		nomargin = false,
		syntax_styler = syntax_styler_global,
		children,
		...rest
	}: SvelteHTMLElements['code'] & {
		/** The source code to syntax highlight. */
		content?: string;
		/**
		 * Pre-highlighted HTML from the `svelte_preprocess_code_static` preprocessor.
		 * When provided, skips runtime syntax highlighting entirely.
		 *
		 * Named `dangerous_raw_html` to signal that it bypasses sanitization,
		 * matching the `{@html}` pattern already used by this component.
		 */
		dangerous_raw_html?: string;
		/**
		 * Language identifier (e.g., 'ts', 'css', 'html', 'json', 'svelte', 'md').
		 *
		 * **Purpose:**
		 * - When `grammar` is not provided, used to look up the grammar via `syntax_styler.get_lang(lang)`
		 * - Used for metadata: sets the `data-lang` attribute and determines `language_supported`
		 *
		 * **Special values:**
		 * - `null` - Explicitly disables syntax highlighting (content rendered as plain text)
		 * - `undefined` - Falls back to default ('svelte')
		 *
		 * **Relationship with `grammar`:**
		 * - If both `lang` and `grammar` are provided, `grammar` takes precedence for tokenization
		 * - However, `lang` is still used for the `data-lang` attribute and language detection
		 *
		 * @default 'svelte'
		 */
		lang?: string | null;
		/**
		 * Optional custom grammar object for syntax tokenization.
		 *
		 * **When to use:**
		 * - To provide a custom language definition not registered in `syntax_styler.langs`
		 * - To use a modified/extended version of an existing grammar
		 * - For one-off grammar variations without registering globally
		 *
		 * **Behavior:**
		 * - When provided, this grammar is used for tokenization instead of looking up via `lang`
		 * - Enables highlighting even if `lang` is not in the registry (useful for custom languages)
		 * - The `lang` parameter is still used for metadata (data-lang attribute)
		 * - When undefined, the grammar is automatically looked up via `syntax_styler.get_lang(lang)`
		 *
		 * @default undefined (uses grammar from `syntax_styler.langs[lang]`)
		 */
		grammar?: SyntaxGrammar | undefined;
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
		 * Whether to disable the default margin-bottom on block code.
		 * Block code has `margin-bottom: var(--space_lg)` by default when not `:last-child`.
		 *
		 * @default false
		 */
		nomargin?: boolean;
		/**
		 * Custom SyntaxStyler instance to use for highlighting.
		 * Allows using a different styler with custom grammars or configuration.
		 *
		 * @default syntax_styler_global
		 */
		syntax_styler?: SyntaxStyler;
		/**
		 * Optional snippet to customize how the highlighted markup is rendered.
		 * Receives the generated HTML string as a parameter.
		 */
		children?: Snippet<[markup: string]>;
	} = $props();

	const language_supported = $derived(lang !== null && !!syntax_styler.langs[lang]);

	const highlighting_disabled = $derived(lang === null || (!language_supported && !grammar));

	// DEV-only validation warnings
	if (DEV) {
		$effect(() => {
			if (dangerous_raw_html) return;

			if (lang && !language_supported && !grammar) {
				const langs = Object.keys(syntax_styler.langs).join(', ');
				// eslint-disable-next-line no-console
				console.error(
					`[Code] Language "${lang}" is not supported and no custom grammar provided. ` +
						`Highlighting disabled. Supported: ${langs}`,
				);
			}
		});
	}

	// Generate HTML markup for syntax highlighting
	const html_content = $derived.by(() => {
		if (dangerous_raw_html) return '';
		if (!content || highlighting_disabled) return '';
		return syntax_styler.stylize(content, lang!, grammar); // ! is safe bc of the `highlighting_disabled` calculation
	});

	// Unified value for template and children snippet
	const rendered_html = $derived(dangerous_raw_html || html_content);
</script>

<!-- eslint-disable svelte/no-at-html-tags -->

<code {...rest} class:inline class:wrap class:nomargin data-lang={lang}
	>{#if highlighting_disabled && !dangerous_raw_html}{content}{:else if children}{@render children(
			rendered_html,
		)}{:else}{@html rendered_html}{/if}</code
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

	code:not(.inline):not(.nomargin):not(:last-child) {
		margin-bottom: var(--space_lg);
	}
</style>
