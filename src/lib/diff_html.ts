/**
 * Diff-viewer HTML generation: syntax-highlighted unified diffs with CSS
 * classes, composed from `@fuzdev/fuz_util`'s diff data and the lexer
 * substrate's per-line renderer. The returned HTML is the rows only — the
 * caller owns the wrapper element (`CodeDiff.svelte` renders
 * `<div class="code_diff">`, styled by `theme_diff.css`).
 *
 * @module
 */

import {diff_lines, diff_hunks, diff_segments, type DiffLine} from '@fuzdev/fuz_util/diff.ts';

import {render_syntax_html_lines, type SyntaxHtmlMark} from './lexer.ts';
import {syntax_styler_global} from './syntax_styler_global.ts';
import type {SyntaxStyler} from './syntax_styler.ts';

/**
 * Options for `render_diff_unified_html`.
 */
export interface RenderDiffOptions {
	/**
	 * Language id for syntax highlighting. `null` (or an unregistered id)
	 * renders plain escaped text with diff chrome only.
	 *
	 * @default null
	 */
	lang?: string | null;
	/**
	 * @default syntax_styler_global
	 */
	syntax_styler?: SyntaxStyler;
	/**
	 * Unchanged lines of context around changes.
	 *
	 * @default 3
	 */
	context_lines?: number;
	/**
	 * How elided unchanged regions render: `'details'` as collapsed native
	 * `<details>` blocks (expandable with zero JS, full content in the DOM),
	 * `'omit'` as an inert count row (bounded output for huge inputs),
	 * `'none'` fully expanded.
	 *
	 * @default 'details'
	 */
	elide?: 'details' | 'omit' | 'none';
	/**
	 * Whether paired remove/add lines get intra-line changed-range emphasis
	 * (`<mark>` spans via `diff_segments`).
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
	 * See `DiffOptions.max_cost` in `@fuzdev/fuz_util/diff.ts`.
	 */
	max_cost?: number;
}

/**
 * Returns the start offset of each 0-based line in `text`.
 */
const line_starts = (text: string): Array<number> => {
	const starts: Array<number> = [0];
	let i = text.indexOf('\n');
	while (i !== -1) {
		starts.push(i + 1);
		i = text.indexOf('\n', i + 1);
	}
	return starts;
};

/**
 * Collects absolute intra-line emphasis ranges for both sides by pairing
 * each contiguous remove-run with the add-run that follows it (k-th with
 * k-th) and diffing the pairs char-level.
 */
const collect_marks = (
	lines: Array<DiffLine>,
	a_starts: Array<number>,
	b_starts: Array<number>,
): {a_marks: Array<SyntaxHtmlMark>; b_marks: Array<SyntaxHtmlMark>} => {
	const a_marks: Array<SyntaxHtmlMark> = [];
	const b_marks: Array<SyntaxHtmlMark> = [];
	let i = 0;
	while (i < lines.length) {
		if (lines[i]!.type !== 'remove') {
			i++;
			continue;
		}
		const removes_start = i;
		while (i < lines.length && lines[i]!.type === 'remove') i++;
		const adds_start = i;
		while (i < lines.length && lines[i]!.type === 'add') i++;
		const pairs = Math.min(adds_start - removes_start, i - adds_start);
		for (let k = 0; k < pairs; k++) {
			const removed = lines[removes_start + k]!;
			const added = lines[adds_start + k]!;
			const segments = diff_segments(removed.text, added.text);
			if (!segments) continue;
			const a_offset = a_starts[removed.a_line! - 1]!;
			for (const [start, end] of segments.a_ranges) {
				a_marks.push({start: a_offset + start, end: a_offset + end});
			}
			const b_offset = b_starts[added.b_line! - 1]!;
			for (const [start, end] of segments.b_ranges) {
				b_marks.push({start: b_offset + start, end: b_offset + end});
			}
		}
	}
	return {a_marks, b_marks};
};

// shared per-render state for the unified and split emitters
interface DiffRenderData {
	lines: Array<DiffLine>;
	hunks: ReturnType<typeof diff_hunks>;
	a_fragments: Array<string>;
	b_fragments: Array<string>;
	line_numbers: boolean;
	elide: 'details' | 'omit' | 'none';
	/**
	 * Gutter number width in chars, fitting the larger side's final line number.
	 */
	width: number;
	pad: string;
}

const prepare_diff = (a: string, b: string, options: RenderDiffOptions): DiffRenderData => {
	const {
		lang = null,
		syntax_styler = syntax_styler_global,
		context_lines = 3,
		elide = 'details',
		intraline = true,
		line_numbers = true,
		max_cost,
	} = options;

	const lines = diff_lines(a, b, {max_cost});
	const hunks = diff_hunks(lines, context_lines);

	const marks = intraline ? collect_marks(lines, line_starts(a), line_starts(b)) : null;

	const effective_lang = lang !== null && syntax_styler.has_lang(lang) ? lang : 'plaintext';
	const a_fragments = render_syntax_html_lines(syntax_styler.lex(a, effective_lang), {
		marks: marks?.a_marks,
	});
	const b_fragments = render_syntax_html_lines(syntax_styler.lex(b, effective_lang), {
		marks: marks?.b_marks,
	});

	let a_total = 0;
	let b_total = 0;
	for (const line of lines) {
		if (line.a_line !== null) a_total = line.a_line;
		if (line.b_line !== null) b_total = line.b_line;
	}
	const width = String(Math.max(a_total, b_total, 1)).length;

	return {
		lines,
		hunks,
		a_fragments,
		b_fragments,
		line_numbers,
		elide,
		width,
		pad: ''.padStart(width),
	};
};

/**
 * Walks the full line list hunk-by-hunk, calling `on_lines` for each hunk's
 * rows and `on_elided` for the unchanged regions between them.
 */
const walk_hunks = (
	data: DiffRenderData,
	on_elided: (elided: Array<DiffLine>) => void,
	on_lines: (lines: Array<DiffLine>) => void,
): void => {
	const {lines, hunks} = data;
	let cursor = 0;
	for (const hunk of hunks) {
		const start = lines.indexOf(hunk.lines[0]!, cursor);
		if (start > cursor) on_elided(lines.slice(cursor, start));
		on_lines(hunk.lines);
		cursor = start + hunk.lines.length;
	}
	if (cursor < lines.length) on_elided(lines.slice(cursor));
};

const elided_count = (elided: Array<DiffLine>): string =>
	`${elided.length} unchanged line${elided.length === 1 ? '' : 's'}`;

/**
 * Generates syntax-highlighted unified-diff rows for two versions of a
 * source text. Each row is one element — `<ins>`/`<del>` for added/removed
 * lines (semantics survive copy/paste and screen readers), `<span>` for
 * context — carrying `diff_line` plus `diff_add`/`diff_remove`/`diff_same`.
 * Gutters are `aria-hidden` and unselectable, and the `+`/`-` markers are
 * CSS generated content, so selecting and copying yields clean code. Both
 * sides are lexed as whole documents, so multi-line constructs highlight
 * correctly; removed rows render from `a`'s highlight, added and context
 * rows from `b`'s. Returns rows only — the caller owns the
 * `<div class="code_diff">` wrapper (`CodeDiff.svelte` does this).
 */
export const render_diff_unified_html = (
	a: string,
	b: string,
	options: RenderDiffOptions = {},
): string => {
	const data = prepare_diff(a, b, options);
	const {a_fragments, b_fragments, line_numbers, elide, width, pad} = data;

	const render_row = (line: DiffLine): string => {
		let gutter = '';
		if (line_numbers) {
			const a_num = line.a_line === null ? pad : String(line.a_line).padStart(width);
			const b_num = line.b_line === null ? pad : String(line.b_line).padStart(width);
			gutter = `<span class="diff_gutter" aria-hidden="true">${a_num} ${b_num}</span>`;
		}
		const fragment =
			line.type === 'remove' ? a_fragments[line.a_line! - 1]! : b_fragments[line.b_line! - 1]!;
		const no_newline = line.no_newline ? '<span class="diff_no_newline"></span>' : '';
		const text = `<span class="diff_text">${fragment}${no_newline}</span>`;
		if (line.type === 'add') {
			return `<ins class="diff_line diff_add">${gutter}${text}</ins>`;
		}
		if (line.type === 'remove') {
			return `<del class="diff_line diff_remove">${gutter}${text}</del>`;
		}
		return `<span class="diff_line diff_same">${gutter}${text}</span>`;
	};

	const out: Array<string> = [];
	walk_hunks(
		data,
		(elided) => {
			if (elide === 'omit') {
				out.push(`<div class="diff_skip">${elided_count(elided)}</div>`);
			} else if (elide === 'none') {
				for (const line of elided) out.push(render_row(line));
			} else {
				out.push(`<details class="diff_skip"><summary>${elided_count(elided)}</summary>`);
				for (const line of elided) out.push(render_row(line));
				out.push('</details>');
			}
		},
		(hunk_lines) => {
			for (const line of hunk_lines) out.push(render_row(line));
		},
	);
	return out.join('');
};

/**
 * Generates syntax-highlighted side-by-side diff cells for two versions of a
 * source text — the split-view sibling of `render_diff_unified_html`, same
 * options and row semantics. Output is a flat sequence of half-row cells for
 * a two-column grid: each visual row is one `a`-side cell then one `b`-side
 * cell (`<del>`/`<ins>`/`<span>` with `diff_cell` classes; unpaired sides
 * get an empty `.diff_spacer` cell). Elided regions span both columns, with
 * their rows in a nested `.diff_split_rows` grid. The caller owns the
 * `<div class="code_diff_split">` grid wrapper (`CodeDiffSplit.svelte`).
 */
export const render_diff_split_html = (
	a: string,
	b: string,
	options: RenderDiffOptions = {},
): string => {
	const data = prepare_diff(a, b, options);
	const {a_fragments, b_fragments, line_numbers, elide, width, pad} = data;

	const render_cell = (line: DiffLine | null, side: 'a' | 'b'): string => {
		if (line === null) return '<span class="diff_cell diff_spacer"></span>';
		const num = side === 'a' ? line.a_line : line.b_line;
		const gutter = line_numbers
			? `<span class="diff_gutter" aria-hidden="true">${num === null ? pad : String(num).padStart(width)}</span>`
			: '';
		const fragment = side === 'a' ? a_fragments[line.a_line! - 1]! : b_fragments[line.b_line! - 1]!;
		const no_newline = line.no_newline ? '<span class="diff_no_newline"></span>' : '';
		const text = `<span class="diff_text">${fragment}${no_newline}</span>`;
		if (line.type === 'same') {
			return `<span class="diff_cell diff_same">${gutter}${text}</span>`;
		}
		return side === 'a'
			? `<del class="diff_cell diff_remove">${gutter}${text}</del>`
			: `<ins class="diff_cell diff_add">${gutter}${text}</ins>`;
	};

	// pairs each visual row: context with itself, k-th remove with k-th add
	const render_rows = (row_lines: Array<DiffLine>, out: Array<string>): void => {
		let i = 0;
		while (i < row_lines.length) {
			const line = row_lines[i]!;
			if (line.type === 'same') {
				out.push(render_cell(line, 'a'), render_cell(line, 'b'));
				i++;
				continue;
			}
			const removes_start = i;
			while (i < row_lines.length && row_lines[i]!.type === 'remove') i++;
			const adds_start = i;
			while (i < row_lines.length && row_lines[i]!.type === 'add') i++;
			const remove_count = adds_start - removes_start;
			const add_count = i - adds_start;
			for (let k = 0; k < Math.max(remove_count, add_count); k++) {
				out.push(
					render_cell(k < remove_count ? row_lines[removes_start + k]! : null, 'a'),
					render_cell(k < add_count ? row_lines[adds_start + k]! : null, 'b'),
				);
			}
		}
	};

	const out: Array<string> = [];
	walk_hunks(
		data,
		(elided) => {
			if (elide === 'omit') {
				out.push(`<div class="diff_skip">${elided_count(elided)}</div>`);
			} else if (elide === 'none') {
				render_rows(elided, out);
			} else {
				out.push(`<details class="diff_skip"><summary>${elided_count(elided)}</summary>`);
				out.push('<div class="diff_split_rows">');
				render_rows(elided, out);
				out.push('</div></details>');
			}
		},
		(hunk_lines) => {
			render_rows(hunk_lines, out);
		},
	);
	return out.join('');
};
