<script lang="ts">
	import { tick, untrack, type Snippet } from 'svelte';
	import { DEV } from 'esm-env';
	import type { SvelteHTMLElements } from 'svelte/elements';

	import { syntax_styler_global } from './syntax_styler_global.ts';
	import type { SyntaxStyler } from './syntax_styler.ts';
	import {
		render_diff_unified_html,
		render_diff_split_html,
		render_diff_model_unified_html,
		render_diff_model_split_html,
		apply_diff_highlight,
		type DiffLineRange,
		type DiffModel,
		type RenderDiffOptions
	} from './diff_html.ts';

	const {
		a,
		b,
		model,
		dangerous_raw_html,
		lang = 'svelte',
		split = false,
		context_lines = 3,
		elide = 'details',
		intraline = true,
		line_numbers = true,
		max_cost,
		highlight,
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
					model?: undefined;
					dangerous_raw_html?: undefined;
			  }
			| {
					a?: undefined;
					b?: undefined;
					/**
					 * A prepared diff — two `DiffSide`s and their lines, from
					 * `create_diff_model` — for sides reused across diffs or lines
					 * supplied by the caller. Its sides were lexed when created, so
					 * `lang`, `syntax_styler`, and `max_cost` don't apply.
					 */
					model: DiffModel;
					dangerous_raw_html?: undefined;
			  }
			| {
					a?: undefined;
					b?: undefined;
					model?: undefined;
					/**
					 * Pre-rendered diff rows from the `svelte_preprocess_fuz_code`
					 * preprocessor, in the form `split` selects. When provided, skips
					 * runtime diffing and syntax styling entirely.
					 *
					 * Named `dangerous_raw_html` to signal that it bypasses sanitization,
					 * matching the `{@html}` pattern used by `Code.svelte`.
					 */
					dangerous_raw_html: string;
			  }
		) & {
			/**
			 * Language identifier for syntax styling. `null` or an unregistered id
			 * disables styling (rows render as plain text with the diff chrome, and
			 * an unregistered id logs an error in DEV); `undefined` falls back to
			 * the default ('svelte'). With `model`, the `data-lang` attribute takes
			 * the model's `b` side's language instead.
			 *
			 * @default 'svelte'
			 */
			lang?: string | null;
			/**
			 * Whether to render the two versions side by side instead of as one
			 * unified column. The split view always wraps long lines.
			 *
			 * @default false
			 */
			split?: boolean;
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
			 * Cost cap for the line diff — see `RenderDiffOptions.max_cost`.
			 */
			max_cost?: number;
			/**
			 * Lines whose rows get the `diff_highlight` class — see
			 * `RenderDiffRowsOptions.highlight`. A change toggles classes on the
			 * rendered rows rather than re-rendering them.
			 */
			highlight?: Array<DiffLineRange>;
			/**
			 * Whether to wrap long lines in the unified view (`pre-wrap` instead
			 * of `pre`, breaking a long unbroken token where it would overflow).
			 * The split view wraps regardless.
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

	let el: HTMLDivElement | undefined = $state();

	/**
	 * Scrolls the row of `line` on `side` into view, opening the collapsed
	 * elided region holding it, once pending updates have rendered. Resolves
	 * to `false` when no row has the line — out of range, or in a region
	 * `elide: 'omit'` dropped.
	 *
	 * @param side - which version `line` numbers, `'a'` the original
	 * @param line - 1-based line number
	 * @param options - passed to `scrollIntoView`
	 */
	export const scroll_to_line = async (
		side: 'a' | 'b',
		line: number,
		options: ScrollIntoViewOptions = { block: 'center' }
	): Promise<boolean> => {
		// let pending updates land first, so a call right after changing props
		// (a new `highlight`, a new `model`) acts on the rows they produce
		await tick();
		const row = el?.querySelector<HTMLElement>(`[data-${side}="${line}"]`);
		if (!row) return false;
		const details = row.closest('details');
		if (details && !details.open) details.open = true;
		row.scrollIntoView(options);
		return true;
	};

	// DEV-only validation warnings
	if (DEV) {
		$effect(() => {
			if (dangerous_raw_html != null || model) return;

			if (lang && !syntax_styler.has_lang(lang)) {
				const langs = [...syntax_styler.langs.keys()].join(', ');
				// eslint-disable-next-line no-console
				console.error(
					`[CodeDiff] Language "${lang}" is not supported. ` +
						`Rows render as plain text. Supported: ${langs}`
				);
			}
		});
	}

	// `highlight` is read untracked: the first render includes it, and later
	// changes only toggle classes (the effect below), so changing it keeps the
	// rows — opened elisions stay open, and nothing is re-rendered
	const html_content = $derived.by(() => {
		if (dangerous_raw_html != null) return dangerous_raw_html;
		const highlight_now = untrack(() => highlight);
		if (model) {
			const render = split ? render_diff_model_split_html : render_diff_model_unified_html;
			return render(model, {
				context_lines,
				elide,
				intraline,
				line_numbers,
				highlight: highlight_now
			});
		}
		const render = split ? render_diff_split_html : render_diff_unified_html;
		return render(a, b, {
			lang,
			syntax_styler,
			context_lines,
			elide,
			intraline,
			line_numbers,
			max_cost,
			highlight: highlight_now
		});
	});

	$effect(() => {
		// re-applies after the rows re-render too, which also covers rows from
		// `dangerous_raw_html` or a `children` snippet that rendered them
		if (el && html_content) apply_diff_highlight(el, highlight);
	});
</script>

<!-- eslint-disable svelte/no-at-html-tags -->

<div
	{...rest}
	bind:this={el}
	class={['code_diff', rest.class]}
	class:split
	class:wrap
	class:nomargin
	data-lang={model ? model.b.lang : lang}
>
	{#if children}{@render children(html_content)}{:else}{@html html_content}{/if}
</div>
