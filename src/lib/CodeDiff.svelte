<script lang="ts" module>
	/**
	 * Where the first diff row in view sat before a new source re-rendered
	 * the rows, so the same line can go back there: by its `b` number, or
	 * its `a` number for a removed row — line numbers, which mean the same
	 * in any source of the same diff, unlike the rows.
	 */
	interface DiffScrollAnchor {
		side: 'a' | 'b';
		line: number;
		/**
		 * The row's top in viewport coordinates when captured.
		 */
		top: number;
	}

	interface Box {
		top: number;
		bottom: number;
	}

	/**
	 * Returns the element scrolling `root` vertically: `root` itself or its
	 * nearest ancestor whose `overflow-y` scrolls and whose content overflows
	 * it (a wrapper that only scrolls sideways computes `overflow-y: auto`
	 * too), else the document's.
	 */
	const find_scroll_container = (root: Element): Element => {
		for (let node: Element | null = root; node; node = node.parentElement) {
			if (node === document.scrollingElement) break;
			const overflow = getComputedStyle(node).overflowY;
			if (
				(overflow === 'auto' || overflow === 'scroll' || overflow === 'overlay') &&
				node.scrollHeight > node.clientHeight
			) {
				return node;
			}
		}
		return document.scrollingElement ?? document.documentElement;
	};

	/**
	 * The part of the viewport `container` shows, in viewport coordinates.
	 */
	const view_of = (container: Element): Box => {
		const viewport = { top: 0, bottom: window.innerHeight };
		if (container === document.scrollingElement || container === document.documentElement) {
			return viewport;
		}
		const rect = container.getBoundingClientRect();
		return {
			top: Math.max(rect.top, viewport.top),
			bottom: Math.min(rect.bottom, viewport.bottom)
		};
	};

	const is_row = (el: Element): boolean => el.hasAttribute('data-a') || el.hasAttribute('data-b');

	/**
	 * Returns the first row among `items` and their descendants in view,
	 * with its rect: a binary search for the first item reaching into the
	 * view, then a walk from it, descending into an item that holds rows —
	 * an open `<details>`, a split view's nested grid — but not a closed
	 * `<details>`, whose rows have no box. A handful of layout reads, however
	 * many rows a closed elision hides.
	 */
	const find_row_in_view = (
		items: HTMLCollection,
		view: Box
	): { row: Element; rect: DOMRect } | null => {
		let low = 0;
		let high = items.length;
		while (low < high) {
			const mid = (low + high) >>> 1;
			if (items[mid]!.getBoundingClientRect().bottom > view.top) high = mid;
			else low = mid + 1;
		}
		for (let i = low; i < items.length; i++) {
			const item = items[i]!;
			const rect = item.getBoundingClientRect();
			if (rect.top >= view.bottom) return null;
			if (rect.height === 0 && rect.width === 0) continue;
			if (is_row(item)) return { row: item, rect };
			if (item instanceof HTMLDetailsElement && !item.open) continue;
			const found = find_row_in_view(item.children, view);
			if (found) return found;
		}
		return null;
	};

	/**
	 * Captures the first diff row in view under `root`, `null` when none is.
	 */
	const capture_diff_scroll_anchor = (root: Element): DiffScrollAnchor | null => {
		const container = find_scroll_container(root);
		const found = find_row_in_view(root.children, view_of(container));
		if (!found) return null;
		const b = found.row.getAttribute('data-b');
		return {
			side: b === null ? 'a' : 'b',
			line: Number(b ?? found.row.getAttribute('data-a')),
			top: found.rect.top
		};
	};

	/**
	 * Scrolls the element scrolling `root` so the row of `anchor`'s line
	 * under it sits where it sat when captured — instantly, whatever the
	 * page's `scroll-behavior`, since it corrects a jump rather than moving
	 * the reader. The scroller is found again here, not kept from the
	 * capture: the new rows can make `root` overflow where the old ones
	 * didn't. Does nothing when no rendered row with a box has the line.
	 *
	 * @mutates root - scrolls it or an ancestor, or the document
	 */
	const restore_diff_scroll_anchor = (root: Element, anchor: DiffScrollAnchor): void => {
		for (const row of root.querySelectorAll(`[data-${anchor.side}="${anchor.line}"]`)) {
			const rect = row.getBoundingClientRect();
			if (rect.height === 0 && rect.width === 0) continue;
			const delta = rect.top - anchor.top;
			if (delta !== 0) find_scroll_container(root).scrollBy({ top: delta, behavior: 'instant' });
			return;
		}
	};
</script>

<script lang="ts">
	import { tick, untrack, type Snippet } from 'svelte';
	import { DEV } from 'esm-env';
	import type { SvelteHTMLElements } from 'svelte/elements';
	import type { DiffHunk } from '@fuzdev/fuz_util/diff.ts';

	import { syntax_styler_global } from './syntax_styler_global.ts';
	import type { SyntaxStyler } from './syntax_styler.ts';
	import {
		create_diff_model,
		create_diff_patch_source,
		create_diff_side,
		render_diff_model_unified_html,
		render_diff_model_split_html,
		render_diff_segments,
		clamp_diff_expanded,
		diff_expand_range,
		diff_expand_line_range,
		apply_diff_highlight,
		type DiffExpandDirection,
		type DiffExpandedRange,
		type DiffLineRange,
		type DiffModel,
		type DiffPatchSource,
		type DiffRowSource,
		type DiffSegment,
		type RenderDiffOptions
	} from './diff_html.ts';

	let {
		a,
		b,
		model,
		hunks,
		a_line_count,
		b_line_count,
		patch_context,
		dangerous_raw_html,
		lang = 'svelte',
		split = false,
		context_lines = 3,
		elide = 'details',
		intraline = true,
		line_numbers = true,
		max_cost,
		highlight,
		expanded = $bindable(),
		expand_step,
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
					hunks?: undefined;
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
					hunks?: undefined;
					dangerous_raw_html?: undefined;
			  }
			| {
					a?: undefined;
					b?: undefined;
					model?: undefined;
					/**
					 * A patch's hunks, without either text — one file's, as
					 * `@fuzdev/fuz_util/diff.ts` parses them from `git diff` output —
					 * rendered through `create_diff_patch_source`: highlighted
					 * approximately, each run of hunks lexed on its own, with a count
					 * row for the unchanged lines the patch lacks, which has no expand
					 * controls since there are no rows to reveal (context the patch
					 * holds past `context_lines` still expands). Swapping it for
					 * `model`, or `a` and `b`, of the same diff upgrades the view in
					 * place: the same `expanded` and `highlight`, and the first row in
					 * view stays where it was. Only that swap anchors the scroll: other
					 * changes of source (an edit to `b`, another file's hunks) render
					 * as a new diff would.
					 */
					hunks: ReadonlyArray<DiffHunk>;
					dangerous_raw_html?: undefined;
			  }
			| {
					a?: undefined;
					b?: undefined;
					model?: undefined;
					hunks?: undefined;
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
			 * the model's `b` side's language instead. With `hunks`, it lexes the
			 * snippets.
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
			 * With `'expand'`, each region is a count row whose controls reveal
			 * its lines (`expand_step` at a time, or all), rendering only the
			 * rows they reveal; what's revealed is `expanded`.
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
			 * With `hunks`, how many lines the original text has, when known —
			 * see `DiffPatchSourceOptions.a_line_count`. Ignored otherwise, so it
			 * can stay set when the full diff replaces the hunks. A count the
			 * hunks contradict (one meant for the previous hunks, say, while new
			 * ones arrive) is treated as unknown, with an error logged in DEV.
			 */
			a_line_count?: number | null;
			/**
			 * With `hunks`, how many lines the updated text has, when known — it
			 * counts the unchanged lines after the last hunk, rendered as
			 * `unchanged lines` without a number otherwise. As `a_line_count`.
			 */
			b_line_count?: number | null;
			/**
			 * With `hunks`, the context the patch was made with (`git diff -U3`
			 * is `3`), which proves where a file ends when its last change is
			 * near the end — see `DiffPatchSourceOptions.patch_context`.
			 * Ignored without `hunks`.
			 */
			patch_context?: number | null;
			/**
			 * Lines whose rows get the `diff_highlight` class — see
			 * `RenderDiffRowsOptions.highlight`. A change toggles classes on the
			 * rendered rows rather than re-rendering them.
			 */
			highlight?: Array<DiffLineRange>;
			/**
			 * With `elide: 'expand'`, the unchanged lines shown as rows: `b` line
			 * ranges (see `DiffExpandedRange`). Internal state unless bound —
			 * `bind:expanded` lets a consumer persist and restore it. An expansion
			 * writes it normalized and clamped to the current diff's elided
			 * regions; a value set from outside renders clamped and stays as set,
			 * so a new model of the same diff (or one holding more of its lines)
			 * shows the same lines.
			 */
			expanded?: Array<DiffExpandedRange>;
			/**
			 * With `elide: 'expand'`, how many lines an expand-up or expand-down
			 * control reveals — see `RenderDiffModelOptions.expand_step`.
			 *
			 * @default DIFF_EXPAND_STEP
			 */
			expand_step?: number;
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

	// the sides re-lex only when their own text or language changes, so a
	// change of view options re-renders rows from the same lexes
	const texts = $derived(dangerous_raw_html == null && !model && !hunks);
	const side_a = $derived(texts ? create_diff_side(a ?? '', { lang, syntax_styler }) : null);
	const side_b = $derived(texts ? create_diff_side(b ?? '', { lang, syntax_styler }) : null);
	const patch_source: DiffPatchSource | null = $derived.by(() => {
		if (dangerous_raw_html != null || model || !hunks) return null;
		const options = { lang, syntax_styler };
		try {
			return create_diff_patch_source(hunks, {
				...options,
				a_line_count,
				b_line_count,
				patch_context
			});
		} catch (error) {
			// malformed hunks throw again without the hints; a hint the hunks
			// contradict, as one left over from other hunks may, counts as unknown
			if (a_line_count == null && b_line_count == null && patch_context == null) throw error;
			const source = create_diff_patch_source(hunks, options);
			if (DEV) {
				// eslint-disable-next-line no-console
				console.error(
					'[CodeDiff] The hunks contradict a_line_count, b_line_count, or ' +
						`patch_context, so the lines after the last hunk count as unknown: ${String(error)}`
				);
			}
			return source;
		}
	});
	const source: DiffRowSource | null = $derived(
		model ??
			patch_source ??
			(side_a && side_b ? create_diff_model(side_a, side_b, { max_cost }) : null)
	);

	/**
	 * Adds `range` to `expanded`, normalized and clamped to the current diff.
	 */
	const reveal = (range: DiffExpandedRange): void => {
		if (!source) return;
		expanded = clamp_diff_expanded(source, [...(expanded ?? []), range], context_lines);
	};

	/**
	 * Scrolls the row of `line` on `side` into view once pending updates have
	 * rendered, opening the collapsed `<details>` elision holding it, or with
	 * `elide: 'expand'` first revealing a window of `expand_step` lines
	 * centered on it (see `diff_expand_line_range`) and adding it to
	 * `expanded`. Resolves to `false` when no row has the line — out of range,
	 * in a region `elide: 'omit'` dropped, or in one whose rows the diff
	 * doesn't hold, as the lines between `hunks` are: nothing can reveal
	 * those until the full diff replaces the hunks.
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
		const selector = `[data-${side}="${line}"]`;
		let row = el?.querySelector<HTMLElement>(selector);
		if (!row && elide === 'expand' && source) {
			const range = diff_expand_line_range(source, side, line, { context_lines, expand_step });
			if (range) {
				reveal(range);
				await tick();
				row = el?.querySelector<HTMLElement>(selector);
			}
		}
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

	// the last expand render, whose segments the next one reuses when only
	// `expanded` (or `highlight`, which never re-renders) changed — plain
	// state, written by the derived that reads it
	let previous: { inputs: Array<unknown>; segments: Array<DiffSegment> } | null = null;
	// segments rendered while a highlight was set, whose HTML may carry
	// `diff_highlight` classes the current highlight doesn't
	const highlighted_segments: WeakSet<DiffSegment> = new WeakSet();

	// `highlight` is read untracked: the first render includes it, and later
	// changes only toggle classes (the effect below), so changing it keeps the
	// rows — opened elisions stay open, and nothing is re-rendered
	const segments: Array<DiffSegment> | null = $derived.by(() => {
		if (elide !== 'expand' || !source) return null;
		const inputs = [source, split, context_lines, intraline, line_numbers, expand_step];
		const reusable =
			previous !== null && previous.inputs.every((input, i) => input === inputs[i])
				? previous.segments
				: undefined;
		const highlight_now = untrack(() => highlight);
		const next = render_diff_segments(
			source,
			{
				split,
				context_lines,
				elide,
				intraline,
				line_numbers,
				expanded,
				expand_step,
				highlight: highlight_now
			},
			reusable
		);
		// conservative: a reused segment marked here only costs a pass
		if (highlight_now && highlight_now.length > 0) {
			for (const segment of next) highlighted_segments.add(segment);
		}
		previous = { inputs, segments: next };
		return next;
	});

	const html_content = $derived.by(() => {
		if (dangerous_raw_html != null) return dangerous_raw_html;
		if (segments) {
			let html = '';
			for (const segment of segments) html += segment.html;
			return html;
		}
		if (!source) return '';
		const render = split ? render_diff_model_split_html : render_diff_model_unified_html;
		return render(source, {
			context_lines,
			elide,
			intraline,
			line_numbers,
			highlight: untrack(() => highlight)
		});
	});

	// upgrading `hunks` to the full diff renders new rows: the first row in
	// view is captured before they replace the old ones and put back where it
	// was after, found again by its line number. A browser's own scroll
	// anchoring can't do it, since its anchor node is removed. Only that swap
	// anchors: line numbers of an edited text or another file would land
	// elsewhere than the line they named
	let rendered_patch = false;
	let anchor: DiffScrollAnchor | null = null;
	$effect.pre(() => {
		const next = source;
		const root = el;
		untrack(() => {
			const is_patch = next !== null && next === patch_source;
			if (root && rendered_patch && next !== null && !is_patch) {
				anchor = capture_diff_scroll_anchor(root);
			}
			rendered_patch = is_patch;
		});
	});
	$effect(() => {
		// after the rows render, whichever way the DOM renders them; tracks the
		// source too, so a new source rendering the same HTML still clears the
		// anchor rather than leaving it for some later render
		const rendered = children || !segments ? html_content : segments;
		const current = source;
		const captured = anchor;
		anchor = null;
		const root = el;
		if (!rendered || !current || !root || !captured) return;
		untrack(() => restore_diff_scroll_anchor(root, captured));
	});

	// whether a pass may have left `diff_highlight` on a row
	let dom_highlighted = false;

	$effect(() => {
		// re-applies after the rows re-render too, which also covers rows from
		// `dangerous_raw_html` or a `children` snippet that rendered them
		// (tracks whichever the DOM renders from)
		const rendered = children || !segments ? html_content : segments;
		if (!el || !rendered) return;
		const on = !!highlight && highlight.length > 0;
		// the pass is the safety net for classes no render put there now: ones
		// an earlier pass set, and ones in a reused segment's HTML from an
		// earlier highlight. An expansion with nothing highlighted, and neither
		// possible, skips the walk over every row
		if (!on && !dom_highlighted && segments?.every((s) => !highlighted_segments.has(s))) return;
		apply_diff_highlight(el, highlight);
		dom_highlighted = on;
	});

	/**
	 * Reveals what an expand control names, then, when the control had focus,
	 * moves focus to the same control of what's still hidden, which replaced
	 * it, or its expand-all control when that's the only one left. When
	 * nothing of the region stays hidden, focus goes to the nearest other
	 * count row's control (the next, else the previous), else the root.
	 */
	const expand_from = async (
		button: HTMLElement,
		direction: DiffExpandDirection
	): Promise<void> => {
		const root = el;
		const row = button.closest<HTMLElement>('.diff_expand[data-b-start]');
		if (!root || !row || elide !== 'expand' || !source) return;
		const start = Number(row.dataset.bStart);
		const end = Number(row.dataset.bEnd);
		const range = diff_expand_range(start, end, direction, expand_step);
		const focused = button === document.activeElement;
		const rows = focused ? [...root.querySelectorAll<HTMLElement>('.diff_expand')] : [];
		reveal(range);
		if (!focused) return;
		await tick();
		const hidden_start = direction === 'down' ? range.end + 1 : start;
		const hidden_end = direction === 'up' ? range.start - 1 : end;
		const hidden =
			hidden_start <= hidden_end
				? root.querySelector(`[data-b-start="${hidden_start}"][data-b-end="${hidden_end}"]`)
				: null;
		let next =
			hidden?.querySelector<HTMLElement>(`[data-expand="${direction}"]`) ??
			hidden?.querySelector<HTMLElement>('[data-expand="all"]');
		if (!next) {
			// the other count rows are untouched, so still in the DOM
			const index = rows.indexOf(row);
			const after = rows.slice(index + 1).find((r) => r.isConnected);
			const before = rows
				.slice(0, index)
				.reverse()
				.find((r) => r.isConnected);
			next =
				after?.querySelector<HTMLElement>('[data-expand]') ??
				[...(before?.querySelectorAll<HTMLElement>('[data-expand]') ?? [])].at(-1);
		}
		if (next) {
			next.focus();
		} else {
			// focusable by script only, so it never joins the tab order
			if (!root.hasAttribute('tabindex')) root.tabIndex = -1;
			root.focus({ preventScroll: true });
		}
	};

	// one listener for every expand control, which are HTML, not components
	$effect(() => {
		const root = el;
		if (!root) return;
		const onclick = (event: MouseEvent): void => {
			const button = (event.target as Element | null)?.closest?.<HTMLElement>('[data-expand]');
			if (!button || !root.contains(button)) return;
			// a consumer's own `data-expand` elements aren't controls
			const direction = button.dataset.expand;
			if (direction === 'up' || direction === 'down' || direction === 'all') {
				void expand_from(button, direction);
			}
		};
		root.addEventListener('click', onclick);
		return () => root.removeEventListener('click', onclick);
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
	{#if children}
		{@render children(html_content)}
	{:else if segments}
		{#each segments as segment (segment.key)}{@html segment.html}{/each}
	{:else}
		{@html html_content}
	{/if}
</div>
