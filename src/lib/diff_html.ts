/**
 * Diff-viewer HTML generation: syntax-highlighted diffs with CSS classes, as
 * unified rows or side-by-side cells, composed from `@fuzdev/fuz_util`'s diff
 * data and the lexer substrate's per-line renderer. The returned HTML is the
 * rows only — the caller owns the wrapper element (`CodeDiff.svelte` renders
 * `<div class="code_diff">`, with `split` added for the side-by-side view,
 * styled by `theme_diff.css`).
 *
 * @module
 */

import {
	diff_lines,
	diff_hunks,
	diff_segments,
	type DiffLine,
	type DiffSegments
} from '@fuzdev/fuz_util/diff.ts';

import { render_syntax_html_lines, type SyntaxHtmlMark } from './lexer.ts';
import { syntax_styler_global } from './syntax_styler_global.ts';
import type { SyntaxStyler } from './syntax_styler.ts';

/**
 * Options for `render_diff_unified_html` and `render_diff_split_html`.
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
	 * Unchanged lines of context around changes. Floored to an integer; a
	 * negative or `NaN` value counts as `0`, and `Infinity` shows every line.
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
	 * (`<mark>` spans via `diff_segments`). Within a change, a removed line
	 * pairs with the added line most similar to it, keeping both sides'
	 * order; lines too different from every candidate stay unpaired.
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
 * The least similar two lines can be and still pair, as the share of both
 * lines' chars that match — `diff_segments`'s `min_similarity`.
 */
const PAIR_MIN_SIMILARITY = 0.3;

/**
 * A change whose estimated pairing work exceeds this pairs its lines by
 * position instead of by similarity. The estimate is the worst case of
 * diffing every removed line against every added one, the sum of their
 * squared combined lengths, so it bounds what one change can cost: a few
 * dozen ordinary lines a side pair by similarity, and a large rewrite or a
 * block of very long lines does not.
 */
const PAIR_MAX_COST = 8_000_000;

/**
 * `diff_segments` at the pairing threshold: the changed ranges of a removed
 * and an added line, or `null` when the two are too different to pair.
 * `joined` merges ranges a few matched chars apart, the form to display;
 * unjoined ranges count the changed chars exactly.
 */
const pair_segments = (removed: string, added: string, joined: boolean): DiffSegments | null =>
	diff_segments(removed, added, {
		min_similarity: PAIR_MIN_SIMILARITY,
		join_gap: joined ? undefined : 0,
		// lines similar enough to pair are at most this many edits apart, so
		// the diff can stop there without changing the answer
		max_cost: Math.floor((1 - PAIR_MIN_SIMILARITY) * (removed.length + added.length)) + 1
	});

/**
 * Which removed line pairs with which added line, and the emphasis ranges
 * of the pairs.
 */
interface DiffPairing {
	/**
	 * Each paired removed line's added line. Pairs keep the order of both
	 * sides: a later removed line never pairs with an earlier added line.
	 */
	partners: Map<DiffLine, DiffLine>;
	/**
	 * Absolute emphasis ranges into `a`, sorted; empty unless requested.
	 */
	a_marks: Array<SyntaxHtmlMark>;
	b_marks: Array<SyntaxHtmlMark>;
}

/**
 * Pairs the removed and added lines of each change (a run of removes and
 * the run of adds after it) and collects the pairs' emphasis ranges.
 *
 * A pair is two lines `diff_segments` finds similar enough to emphasize.
 * Among the ways to pair a change's lines without crossing, this takes the
 * one with the highest total similarity, so a removed line pairs with the
 * added line it became wherever that line sits in the run, not with the
 * line at the same position. A change past `PAIR_MAX_COST` pairs the k-th
 * removed line with the k-th added line.
 */
const pair_lines = (lines: Array<DiffLine>, a: string, b: string, marks: boolean): DiffPairing => {
	const partners: Map<DiffLine, DiffLine> = new Map();
	const a_marks: Array<SyntaxHtmlMark> = [];
	const b_marks: Array<SyntaxHtmlMark> = [];
	const a_starts = marks ? line_starts(a) : null;
	const b_starts = marks ? line_starts(b) : null;

	const add_pair = (removed: DiffLine, added: DiffLine, segments: DiffSegments): void => {
		partners.set(removed, added);
		if (a_starts === null || b_starts === null) return;
		const a_offset = a_starts[removed.a_line! - 1]!;
		for (const [start, end] of segments.a_ranges) {
			a_marks.push({ start: a_offset + start, end: a_offset + end });
		}
		const b_offset = b_starts[added.b_line! - 1]!;
		for (const [start, end] of segments.b_ranges) {
			b_marks.push({ start: b_offset + start, end: b_offset + end });
		}
	};

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
		const n = adds_start - removes_start;
		const m = i - adds_start;
		if (m === 0) continue;

		// sum over every combination of (removed length + added length) squared
		let removed_sum = 0;
		let removed_squares = 0;
		for (let r = removes_start; r < adds_start; r++) {
			const length = lines[r]!.text.length;
			removed_sum += length;
			removed_squares += length * length;
		}
		let added_sum = 0;
		let added_squares = 0;
		for (let c = adds_start; c < i; c++) {
			const length = lines[c]!.text.length;
			added_sum += length;
			added_squares += length * length;
		}
		const cost = m * removed_squares + n * added_squares + 2 * removed_sum * added_sum;

		if (n * m === 1 || cost > PAIR_MAX_COST) {
			for (let k = 0; k < n && k < m; k++) {
				const removed = lines[removes_start + k]!;
				const added = lines[adds_start + k]!;
				const segments = pair_segments(removed.text, added.text, true);
				if (segments) add_pair(removed, added, segments);
			}
			continue;
		}

		// similarity of every combination: the share of both lines' chars
		// that match, or -1 when the lines are too different to pair
		const sims = new Float64Array(n * m);
		for (let r = 0; r < n; r++) {
			const removed = lines[removes_start + r]!.text;
			for (let c = 0; c < m; c++) {
				const added = lines[adds_start + c]!.text;
				const total = removed.length + added.length;
				const segments = pair_segments(removed, added, false);
				let sim = -1;
				if (segments) {
					let changed = 0;
					for (const [start, end] of segments.a_ranges) changed += end - start;
					for (const [start, end] of segments.b_ranges) changed += end - start;
					sim = total === 0 ? 1 : 1 - changed / total;
				}
				sims[r * m + c] = sim;
			}
		}
		// best[r][c] is the highest total similarity pairing removes r.. with adds c..
		const stride = m + 1;
		const best = new Float64Array((n + 1) * stride);
		for (let r = n - 1; r >= 0; r--) {
			for (let c = m - 1; c >= 0; c--) {
				let value = Math.max(best[(r + 1) * stride + c]!, best[r * stride + c + 1]!);
				const sim = sims[r * m + c]!;
				if (sim >= 0) value = Math.max(value, sim + best[(r + 1) * stride + c + 1]!);
				best[r * stride + c] = value;
			}
		}
		let r = 0;
		let c = 0;
		while (r < n && c < m) {
			const sim = sims[r * m + c]!;
			// pairing here is on a best path when it reaches this cell's total
			const paired_total = sim + best[(r + 1) * stride + c + 1]!;
			if (sim >= 0 && paired_total === best[r * stride + c]) {
				const removed = lines[removes_start + r]!;
				const added = lines[adds_start + c]!;
				// non-null: the unjoined call above passed the same similarity gate
				const segments = pair_segments(removed.text, added.text, true);
				if (segments) add_pair(removed, added, segments);
				r++;
				c++;
			} else if (best[(r + 1) * stride + c]! >= best[r * stride + c + 1]!) {
				r++;
			} else {
				c++;
			}
		}
	}
	return { partners, a_marks, b_marks };
};

// shared per-render state for the unified and split emitters
interface DiffRenderData {
	lines: Array<DiffLine>;
	hunks: ReturnType<typeof diff_hunks>;
	/**
	 * Each paired removed line's added line, `null` when the view didn't ask.
	 */
	partners: Map<DiffLine, DiffLine> | null;
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

const prepare_diff = (
	a: string,
	b: string,
	options: RenderDiffOptions,
	pair_rows: boolean
): DiffRenderData => {
	const {
		lang = null,
		syntax_styler = syntax_styler_global,
		context_lines = 3,
		elide = 'details',
		intraline = true,
		line_numbers = true,
		max_cost
	} = options;

	const lines = diff_lines(a, b, { max_cost });
	// `diff_hunks` windows by index arithmetic, so a negative, fractional, or
	// `NaN` count would yield hunks that don't cover the changed lines
	const hunks = diff_hunks(lines, context_lines >= 0 ? Math.floor(context_lines) : 0);

	// the split view lays its rows out by the pairing even without emphasis
	const pairing = intraline || pair_rows ? pair_lines(lines, a, b, intraline) : null;

	const effective_lang = lang !== null && syntax_styler.has_lang(lang) ? lang : 'plaintext';
	const a_fragments = render_syntax_html_lines(syntax_styler.lex(a, effective_lang), {
		marks: pairing?.a_marks
	});
	const b_fragments = render_syntax_html_lines(syntax_styler.lex(b, effective_lang), {
		marks: pairing?.b_marks
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
		partners: pairing ? pairing.partners : null,
		a_fragments,
		b_fragments,
		line_numbers,
		elide,
		width,
		pad: ''.padStart(width)
	};
};

/**
 * Walks the full line list hunk-by-hunk, calling `on_lines` for each hunk's
 * rows and `on_elided` for the unchanged regions between them.
 */
const walk_hunks = (
	data: DiffRenderData,
	on_elided: (elided: Array<DiffLine>) => void,
	on_lines: (lines: Array<DiffLine>) => void
): void => {
	const { lines, hunks } = data;
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
 * Renders a row's text span from its line's highlighted `fragment`. An empty
 * line gets a `<br>`: a row with no text contributes nothing to a copied
 * selection, which would drop the source's blank lines.
 */
const render_text = (line: DiffLine, fragment: string): string =>
	[
		'<span class="diff_text">',
		fragment,
		line.text === '' ? '<br>' : '',
		line.no_newline ? '<span class="diff_no_newline"></span>' : '',
		'</span>'
	].join('');

/**
 * Generates syntax-highlighted unified-diff rows for two versions of a
 * source text. Each row is one element — `<ins>`/`<del>` for added/removed
 * lines (semantics survive copy/paste and screen readers), `<span>` for
 * context — carrying `diff_line` plus `diff_add`/`diff_remove`/`diff_same`.
 * Gutters are `aria-hidden` and unselectable, and the `+`/`-` markers are
 * CSS generated content, so selecting and copying yields clean code (an
 * empty line carries a `<br>` so the copy keeps it). Both
 * sides are lexed as whole documents, so multi-line constructs highlight
 * correctly; removed rows render from `a`'s highlight, added and context
 * rows from `b`'s. Returns rows only — the caller owns the
 * `<div class="code_diff">` wrapper (`CodeDiff.svelte` does this).
 */
export const render_diff_unified_html = (
	a: string,
	b: string,
	options: RenderDiffOptions = {}
): string => {
	const data = prepare_diff(a, b, options, false);
	const { a_fragments, b_fragments, line_numbers, elide, width, pad } = data;

	const render_row = (line: DiffLine): string => {
		let gutter = '';
		if (line_numbers) {
			const a_num = line.a_line === null ? pad : String(line.a_line).padStart(width);
			const b_num = line.b_line === null ? pad : String(line.b_line).padStart(width);
			gutter = `<span class="diff_gutter" aria-hidden="true">${a_num} ${b_num}</span>`;
		}
		const text = render_text(
			line,
			line.type === 'remove' ? a_fragments[line.a_line! - 1]! : b_fragments[line.b_line! - 1]!
		);
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
		}
	);
	return out.join('');
};

/**
 * Generates syntax-highlighted side-by-side diff cells for two versions of a
 * source text — the split-view sibling of `render_diff_unified_html`, same
 * options and row semantics. Output is a flat sequence of half-row cells for
 * a two-column grid: each visual row is one `a`-side cell then one `b`-side
 * cell (`<del>`/`<ins>`/`<span>` with `diff_cell` classes). Within a change,
 * a removed line sits beside the added line it pairs with (see
 * `RenderDiffOptions.intraline`), the unpaired lines between two pairs are
 * top-aligned, and a side with no line in a row gets an empty
 * `.diff_spacer` cell. Elided regions span both columns, with
 * their rows in a nested `.diff_split_rows` grid. The caller owns the
 * `<div class="code_diff split">` grid wrapper (`CodeDiff.svelte` with
 * `split`).
 */
export const render_diff_split_html = (
	a: string,
	b: string,
	options: RenderDiffOptions = {}
): string => {
	const data = prepare_diff(a, b, options, true);
	const { a_fragments, b_fragments, line_numbers, elide, width, pad } = data;
	const partners = data.partners!;

	const render_cell = (line: DiffLine | null, side: 'a' | 'b'): string => {
		if (line === null) return '<span class="diff_cell diff_spacer"></span>';
		const num = side === 'a' ? line.a_line : line.b_line;
		const gutter = line_numbers
			? `<span class="diff_gutter" aria-hidden="true">${num === null ? pad : String(num).padStart(width)}</span>`
			: '';
		const text = render_text(
			line,
			side === 'a' ? a_fragments[line.a_line! - 1]! : b_fragments[line.b_line! - 1]!
		);
		if (line.type === 'same') {
			return `<span class="diff_cell diff_same">${gutter}${text}</span>`;
		}
		return side === 'a'
			? `<del class="diff_cell diff_remove">${gutter}${text}</del>`
			: `<ins class="diff_cell diff_add">${gutter}${text}</ins>`;
	};

	// lays out the visual rows: context beside itself, and within a change
	// each paired remove beside its add, with the unpaired lines between two
	// pairs zipped top-aligned and the shorter side padded
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
			let r = removes_start;
			let c = adds_start;
			while (r < adds_start || c < i) {
				// the next pair, or both runs' ends when none is left
				let pair_r = r;
				while (pair_r < adds_start && !partners.has(row_lines[pair_r]!)) pair_r++;
				let pair_c = i;
				if (pair_r < adds_start) {
					const partner = partners.get(row_lines[pair_r]!);
					pair_c = c;
					while (row_lines[pair_c] !== partner) pair_c++;
				}
				const remove_count = pair_r - r;
				const add_count = pair_c - c;
				for (let k = 0; k < Math.max(remove_count, add_count); k++) {
					out.push(
						render_cell(k < remove_count ? row_lines[r + k]! : null, 'a'),
						render_cell(k < add_count ? row_lines[c + k]! : null, 'b')
					);
				}
				if (pair_r === adds_start) break;
				out.push(render_cell(row_lines[pair_r]!, 'a'), render_cell(row_lines[pair_c]!, 'b'));
				r = pair_r + 1;
				c = pair_c + 1;
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
		}
	);
	return out.join('');
};
