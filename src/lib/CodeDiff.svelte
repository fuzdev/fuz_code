<script lang="ts">
	import type {Snippet} from 'svelte';
	import {DEV} from 'esm-env';
	import type {SvelteHTMLElements} from 'svelte/elements';

	import {syntax_styler_global} from './syntax_styler_global.ts';
	import type {SyntaxStyler} from './syntax_styler.ts';
	import {render_diff_unified_html, type RenderDiffOptions} from './diff_html.ts';

	const {
		a,
		b,
		dangerous_raw_html,
		lang = 'svelte',
		context_lines = 3,
		elide = 'details',
		intraline = true,
		line_numbers = true,
		wrap = false,
		nomargin = false,
		syntax_styler = syntax_styler_global,
		children,
		...rest
	}: SvelteHTMLElements['div'] &
		(
			| {
					/** The original version of the source. */
					a: string;
					/** The updated version of the source. */
					b: string;
					dangerous_raw_html?: undefined;
			  }
			| {
					a?: undefined;
					b?: undefined;
					/**
					 * Pre-rendered diff rows, bypassing runtime diffing and highlighting.
					 * Named `dangerous_raw_html` to signal that it bypasses sanitization,
					 * matching the `{@html}` pattern used by `Code.svelte`.
					 */
					dangerous_raw_html: string;
			  }
		) & {
			/**
			 * Language identifier for syntax highlighting. `null` disables
			 * highlighting (rows render as plain text with diff chrome);
			 * `undefined` falls back to the default ('svelte').
			 *
			 * @default 'svelte'
			 */
			lang?: string | null;
			/**
			 * Unchanged lines of context around changes.
			 *
			 * @default 3
			 */
			context_lines?: number;
			/**
			 * How elided unchanged regions render — see `RenderDiffOptions.elide`.
			 *
			 * @default 'details'
			 */
			elide?: RenderDiffOptions['elide'];
			/**
			 * Whether paired remove/add lines get intra-line emphasis.
			 *
			 * @default true
			 */
			intraline?: boolean;
			/**
			 * Whether to render line-number gutters.
			 *
			 * @default true
			 */
			line_numbers?: boolean;
			/**
			 * Whether to wrap long lines (`pre-wrap` instead of `pre`).
			 *
			 * @default false
			 */
			wrap?: boolean;
			/**
			 * Whether to disable the default margin-bottom.
			 *
			 * @default false
			 */
			nomargin?: boolean;
			/**
			 * Custom `SyntaxStyler` instance.
			 *
			 * @default syntax_styler_global
			 */
			syntax_styler?: SyntaxStyler;
			/**
			 * Optional snippet to customize how the diff rows are rendered.
			 * Receives the generated HTML string as a parameter.
			 */
			children?: Snippet<[markup: string]>;
		} = $props();

	// DEV-only validation warnings
	if (DEV) {
		$effect(() => {
			if (dangerous_raw_html != null) return;

			if (lang && !syntax_styler.has_lang(lang)) {
				const langs = [...syntax_styler.langs.keys()].join(', ');
				// eslint-disable-next-line no-console
				console.error(
					`[CodeDiff] Language "${lang}" is not supported. ` +
						`Rows render as plain text. Supported: ${langs}`,
				);
			}
		});
	}

	const html_content = $derived.by(() => {
		if (dangerous_raw_html != null) return dangerous_raw_html;
		return render_diff_unified_html(a, b, {
			lang,
			syntax_styler,
			context_lines,
			elide,
			intraline,
			line_numbers,
		});
	});
</script>

<!-- eslint-disable svelte/no-at-html-tags -->

<div {...rest} class={['code_diff', rest.class]} class:wrap class:nomargin data-lang={lang}>
	{#if children}{@render children(html_content)}{:else}{@html html_content}{/if}
</div>
