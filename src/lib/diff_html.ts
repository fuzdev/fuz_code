/**
 * Diff-viewer HTML generation: syntax-highlighted diffs with CSS classes, as
 * unified rows or side-by-side cells, composed from `@fuzdev/fuz_util`'s diff
 * data and the lexer substrate's per-line renderer. The returned HTML is the
 * rows only — the caller owns the wrapper element (`CodeDiff.svelte` renders
 * `<div class="code_diff">`, with `split` added for the side-by-side view,
 * styled by `theme_diff.css`).
 *
 * The pipeline is three cacheable stages. A `DiffSide` is one lexed text,
 * reusable across any number of diffs (a consumer caches it by content). A
 * `DiffModel` is two sides plus their `DiffLine`s, computed by `diff_lines`
 * or supplied by the caller, with the pairing of changed lines and their
 * emphasis worked out lazily, one change at a time. The renderers draw any
 * `DiffRowSource` — the narrower surface a model implements — as a range
 * of rows (`render_diff_unified_rows_html`, `render_diff_split_rows_html`)
 * or the whole document with its unchanged regions elided
 * (`render_diff_model_unified_html`, `render_diff_model_split_html`);
 * `render_diff_unified_html` and `render_diff_split_html` do all three
 * stages from two strings.
 *
 * Every row carries its line numbers as `data-a` / `data-b` (absent on the
 * side it lacks) and, inside a hunk, the hunk's index as `data-hunk`, so a
 * consumer maps an element to its line by event delegation;
 * `apply_diff_highlight` restyles highlighted rows in place.
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

import {
	copy_lexed_syntax,
	create_syntax_line_index,
	render_syntax_html_line_range,
	type LexedSyntax,
	type SyntaxHtmlMark,
	type SyntaxLineIndex
} from './lexer.ts';
import { syntax_styler_global } from './syntax_styler_global.ts';
import type { SyntaxStyler } from './syntax_styler.ts';

/**
 * Options for `create_diff_side`.
 */
export interface DiffSideOptions {
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
}

/**
 * One side of a diff: a text lexed once as a whole document, so multi-line
 * constructs highlight correctly on every line, with its per-line HTML
 * fragments rendered on demand and cached. A side doesn't know what it's
 * diffed against, so one side serves any number of `DiffModel`s — cache it
 * by content (a blob hash, say) and a moving diff range lexes each text
 * once. Line numbers are 1-based, as in `DiffLine`.
 */
export interface DiffSide {
	readonly text: string;
	/**
	 * The language id the side was created with, `null` for plain text.
	 */
	readonly lang: string | null;
	/**
	 * The side's own copy of its whole-document lex, kept past later lexes.
	 */
	readonly lexed: LexedSyntax;
	/**
	 * The number of lines `render_syntax_html_lines` gives the text, counting
	 * the empty line after a trailing newline.
	 */
	readonly line_count: number;
	/**
	 * The number of lines a diff numbers, as `diff_lines` splits the text: no
	 * line after a trailing newline, and none at all for `''`.
	 */
	readonly diff_line_count: number;
	/**
	 * Returns the offset in `text` where `line` starts.
	 *
	 * @throws RangeError when `line` isn't one of the side's lines
	 */
	line_start(line: number): number;
	/**
	 * Returns the highlighted HTML of `line`, without emphasis — rendered on
	 * first use and cached.
	 *
	 * @throws RangeError when `line` isn't one of the side's lines
	 */
	fragment(line: number): string;
	/**
	 * Renders and caches the fragments of lines `first` through `last` not
	 * yet rendered, a contiguous run per render call, so drawing a range of
	 * rows renders its lines together rather than one at a time. The range is
	 * clamped to the side's lines.
	 */
	prepare_fragments(first: number, last: number): void;
	/**
	 * Renders lines `first` through `last` with `marks`, absolute `[start,
	 * end)` ranges into `text` wrapped in `<mark>` — emphasis, which depends
	 * on the line's partner and so isn't cached here. The range is clamped to
	 * the side's lines.
	 */
	render_fragments(first: number, last: number, marks?: Array<SyntaxHtmlMark>): Array<string>;
}

class DiffSideState implements DiffSide {
	readonly text: string;
	readonly lang: string | null;
	readonly lexed: LexedSyntax;
	readonly line_count: number;
	readonly diff_line_count: number;

	readonly #index: SyntaxLineIndex;
	readonly #fragments: Array<string | undefined>;

	constructor(text: string, options: DiffSideOptions) {
		const { lang = null, syntax_styler = syntax_styler_global } = options;
		const effective_lang = lang !== null && syntax_styler.has_lang(lang) ? lang : 'plaintext';
		this.text = text;
		this.lang = lang;
		// `lex` writes into a buffer the next lex reuses, so the side keeps a copy
		this.lexed = copy_lexed_syntax(syntax_styler.lex(text, effective_lang));
		this.#index = create_syntax_line_index(this.lexed);
		this.line_count = this.#index.line_starts.length;
		this.diff_line_count =
			text === '' ? 0 : text.endsWith('\n') ? this.line_count - 1 : this.line_count;
		this.#fragments = Array.from({ length: this.line_count });
	}

	#check_line(line: number): void {
		if (!(Number.isInteger(line) && line >= 1 && line <= this.line_count)) {
			throw RangeError(`Line ${line} is not in the side's ${this.line_count} lines`);
		}
	}

	line_start(line: number): number {
		this.#check_line(line);
		return this.#index.line_starts[line - 1]!;
	}

	fragment(line: number): string {
		this.#check_line(line);
		const cached = this.#fragments[line - 1];
		if (cached !== undefined) return cached;
		this.prepare_fragments(line, line);
		return this.#fragments[line - 1]!;
	}

	prepare_fragments(first: number, last: number): void {
		const fragments = this.#fragments;
		const end = Math.min(last, this.line_count);
		let i = Math.max(first, 1) - 1;
		while (i < end) {
			if (fragments[i] !== undefined) {
				i++;
				continue;
			}
			let j = i + 1;
			while (j < end && fragments[j] === undefined) j++;
			const rendered = render_syntax_html_line_range(this.lexed, this.#index, i, j);
			for (let k = 0; k < rendered.length; k++) fragments[i + k] = rendered[k];
			i = j;
		}
	}

	render_fragments(first: number, last: number, marks?: Array<SyntaxHtmlMark>): Array<string> {
		return render_syntax_html_line_range(this.lexed, this.#index, first - 1, last, { marks });
	}
}

/**
 * Lexes `text` into a `DiffSide`. An unregistered `lang` renders as plain
 * text, like `null`.
 */
export const create_diff_side = (text: string, options: DiffSideOptions = {}): DiffSide =>
	new DiffSideState(text, options);

/**
 * A half-open `[start, end)` range of indices into `DiffRowSource.lines`.
 */
export interface DiffRowRange {
	start: number;
	end: number;
}

/**
 * What the row renderers read: a diff's lines and, per line, its partner and
 * its highlighted HTML. `DiffModel` is the one built from two whole texts; a
 * source holding only some of a diff's lines (its hunks, say) implements the
 * same surface, with `elided_count` counting the lines it doesn't hold.
 */
export interface DiffRowSource {
	/**
	 * The rows, in order. Don't mutate.
	 */
	readonly lines: ReadonlyArray<DiffLine>;
	/**
	 * The gutter's width in chars, fitting the larger side's final line
	 * number, so every range of rows pads its numbers alike.
	 */
	readonly width: number;
	/**
	 * Returns the hunks for `context_lines` as ranges of `lines`, in order —
	 * the rows a whole-document render shows, the gaps around them being the
	 * elided regions. The count is floored, and a negative or `NaN` count is
	 * `0`.
	 */
	hunk_ranges(context_lines?: number): ReadonlyArray<Readonly<DiffRowRange>>;
	/**
	 * Returns how many unchanged lines the elided region at rows `[start,
	 * end)` stands for — a gap between hunks, or before the first or after
	 * the last — counted from line numbers, so a source that doesn't hold a
	 * gap's rows still counts them. `null` when the count is unknown, as the
	 * gap after a patch's last hunk is: a patch never says how long the file
	 * is. A gap with no rows renders as a count row whatever `elide` says.
	 */
	elided_count(start: number, end: number): number | null;
	/**
	 * Returns the index of the line that the line at `index` pairs with, or
	 * `-1` for an unpaired or unchanged line.
	 *
	 * @throws RangeError when `index` isn't a row
	 */
	partner(index: number): number;
	/**
	 * Returns the highlighted HTML of the line at `index` on `side`, with its
	 * pair's emphasis when `intraline` is set. Unlike the renderers'
	 * `intraline` option, which defaults to `true`, this defaults to plain.
	 *
	 * @throws RangeError when `index` isn't a row, or the line has no number
	 *   on `side`
	 */
	fragment(index: number, side: 'a' | 'b', intraline?: boolean): string;
	/**
	 * Renders ahead the fragments that drawing rows `[start, end)` reads, a
	 * few passes over each side rather than one per line — see
	 * `DiffPrepareOptions`. May be a no-op: `fragment` renders whatever
	 * wasn't prepared.
	 */
	prepare(start: number, end: number, options?: DiffPrepareOptions): void;
}

/**
 * Options for `DiffRowSource.prepare`, saying which fragments the rows will
 * be drawn with.
 */
export interface DiffPrepareOptions {
	/**
	 * Both sides of every row, as the split view draws them, rather than the
	 * unified view's removed lines from `a` and the rest from `b`.
	 *
	 * @default false
	 */
	split?: boolean;
	/**
	 * The paired lines' emphasized fragments too.
	 *
	 * @default false
	 */
	intraline?: boolean;
}

/**
 * Options for `create_diff_model`.
 */
export interface DiffModelOptions {
	/**
	 * The diff's lines — git's own diff converted to `DiffLine`s, say. When
	 * absent, `diff_lines` computes them from the sides' texts. Supplied lines
	 * must number every line of both sides: each side's numbers are integers
	 * counting up from 1 with no gaps to the side's `diff_line_count`, present
	 * exactly on the sides a line's `type` has. The texts aren't compared with
	 * the sides'. The model keeps the array, so don't mutate it after.
	 */
	lines?: Array<DiffLine>;
	/**
	 * See `DiffOptions.max_cost` in `@fuzdev/fuz_util/diff.ts`; unused when
	 * `lines` is supplied.
	 */
	max_cost?: number;
}

/**
 * A diff of two whole `DiffSide`s, what the renderers draw. The model owns
 * what depends on both sides — the hunks for a context size, which removed
 * line pairs with which added line, and the pairs' emphasis — and computes
 * each lazily, so rendering a few rows of a large diff pairs only the changes
 * those rows are in.
 *
 * Within a change (a run of removes and the adds after it), lines pair by
 * similarity: among the ways to pair the change's lines without crossing, the
 * one with the highest total similarity, so a removed line pairs with the
 * added line it became wherever that sits. A change whose estimated pairing
 * work is past a fixed budget pairs by position instead.
 */
export interface DiffModel extends DiffRowSource {
	readonly a: DiffSide;
	readonly b: DiffSide;
	readonly lines: Array<DiffLine>;
	/**
	 * Cached per count.
	 */
	hunk_ranges(context_lines?: number): ReadonlyArray<Readonly<DiffRowRange>>;
}

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
 * Pairs the removed lines `[removes_start, adds_start)` of one change with
 * its added lines `[adds_start, end)`, calling `on_pair` with each pair's
 * indices and display segments.
 *
 * A pair is two lines `diff_segments` finds similar enough to emphasize.
 * Among the ways to pair the lines without crossing, this takes the one with
 * the highest total similarity. A change past `PAIR_MAX_COST` pairs the k-th
 * removed line with the k-th added line.
 */
const pair_change = (
	lines: Array<DiffLine>,
	removes_start: number,
	adds_start: number,
	end: number,
	on_pair: (removed: number, added: number, segments: DiffSegments) => void
): void => {
	const n = adds_start - removes_start;
	const m = end - adds_start;
	if (n === 0 || m === 0) return;

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
	for (let c = adds_start; c < end; c++) {
		const length = lines[c]!.text.length;
		added_sum += length;
		added_squares += length * length;
	}
	const cost = m * removed_squares + n * added_squares + 2 * removed_sum * added_sum;

	if (n * m === 1 || cost > PAIR_MAX_COST) {
		for (let k = 0; k < n && k < m; k++) {
			const segments = pair_segments(
				lines[removes_start + k]!.text,
				lines[adds_start + k]!.text,
				true
			);
			if (segments) on_pair(removes_start + k, adds_start + k, segments);
		}
		return;
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
			// non-null: the unjoined call above passed the same similarity gate
			const segments = pair_segments(
				lines[removes_start + r]!.text,
				lines[adds_start + c]!.text,
				true
			);
			if (segments) on_pair(removes_start + r, adds_start + c, segments);
			r++;
			c++;
		} else if (best[(r + 1) * stride + c]! >= best[r * stride + c + 1]!) {
			r++;
		} else {
			c++;
		}
	}
};

/**
 * Throws unless `lines` number every line of both sides: on each side,
 * integers counting up from 1 with no gaps to the side's `diff_line_count`,
 * present exactly on the sides a line's type has. Returns the larger side's
 * final line number.
 */
const validate_diff_lines = (lines: Array<DiffLine>, a: DiffSide, b: DiffSide): number => {
	let a_last = 0;
	let b_last = 0;
	for (let i = 0; i < lines.length; i++) {
		const { type, a_line, b_line } = lines[i]!;
		const fail = (problem: string): never => {
			throw Error(
				`Invalid diff line at index ${i} (${type} ${String(a_line)} ${String(b_line)}): ${problem}`
			);
		};
		if (type !== 'same' && type !== 'add' && type !== 'remove') fail('unknown type');
		if (type === 'add' ? a_line !== null : a_line === null) {
			fail(type === 'add' ? "an added line's a_line isn't null" : 'missing its a line');
		}
		if (type === 'remove' ? b_line !== null : b_line === null) {
			fail(type === 'remove' ? "a removed line's b_line isn't null" : 'missing its b line');
		}
		if (a_line !== null) {
			if (a_line !== a_last + 1) fail(`expected a line ${a_last + 1}`);
			a_last = a_line;
		}
		if (b_line !== null) {
			if (b_line !== b_last + 1) fail(`expected b line ${b_last + 1}`);
			b_last = b_line;
		}
	}
	if (a_last !== a.diff_line_count) {
		throw Error(
			`Invalid diff lines: they number ${a_last} of the a side's ${a.diff_line_count} lines`
		);
	}
	if (b_last !== b.diff_line_count) {
		throw Error(
			`Invalid diff lines: they number ${b_last} of the b side's ${b.diff_line_count} lines`
		);
	}
	return Math.max(a_last, b_last);
};

/**
 * Emphasized lines at most this many lines apart render in one pass.
 */
const MARKED_CLUSTER_GAP = 16;

const line_number = (line: DiffLine, a: boolean): number => (a ? line.a_line! : line.b_line!);

class DiffModelState implements DiffModel {
	readonly a: DiffSide;
	readonly b: DiffSide;
	readonly lines: Array<DiffLine>;
	readonly width: number;

	readonly #hunk_ranges: Map<number, ReadonlyArray<Readonly<DiffRowRange>>> = new Map();
	/**
	 * Each line's partner index, `-1` when unpaired; valid where `#paired`.
	 */
	readonly #partners: Int32Array;
	/**
	 * Whether each line's change has been paired.
	 */
	readonly #paired: Uint8Array;
	/**
	 * Each paired line's emphasis, absolute into its side's text.
	 */
	readonly #marks: Map<number, Array<SyntaxHtmlMark>> = new Map();
	readonly #marked_fragments: Map<number, string> = new Map();

	constructor(a: DiffSide, b: DiffSide, options: DiffModelOptions) {
		this.a = a;
		this.b = b;
		let last: number;
		if (options.lines) {
			this.lines = options.lines;
			last = validate_diff_lines(this.lines, a, b);
		} else {
			this.lines = diff_lines(a.text, b.text, { max_cost: options.max_cost });
			last = Math.max(a.diff_line_count, b.diff_line_count);
		}
		this.width = String(Math.max(last, 1)).length;
		this.#partners = new Int32Array(this.lines.length).fill(-1);
		this.#paired = new Uint8Array(this.lines.length);
	}

	hunk_ranges(context_lines = 3): ReadonlyArray<Readonly<DiffRowRange>> {
		// `diff_hunks` windows by index arithmetic, so a negative, fractional,
		// or `NaN` count would yield hunks that don't cover the changed lines
		const count = context_lines >= 0 ? Math.floor(context_lines) : 0;
		const cached = this.#hunk_ranges.get(count);
		if (cached) return cached;
		const { lines } = this;
		const ranges: Array<Readonly<DiffRowRange>> = [];
		let cursor = 0;
		// hunk lines are shared with `lines`, so identity finds each hunk
		for (const hunk of diff_hunks(lines, count)) {
			const start = lines.indexOf(hunk.lines[0]!, cursor);
			cursor = start + hunk.lines.length;
			ranges.push(Object.freeze({ start, end: cursor }));
		}
		const frozen = Object.freeze(ranges);
		this.#hunk_ranges.set(count, frozen);
		return frozen;
	}

	elided_count(start: number, end: number): number {
		const { lines } = this;
		// the `a` lines just before the gap and just after it; every line
		// numbers both sides here, so a gap holds exactly what lies between
		let before = 0;
		for (let i = start - 1; i >= 0; i--) {
			const a_line = lines[i]!.a_line;
			if (a_line !== null) {
				before = a_line;
				break;
			}
		}
		let after = this.a.diff_line_count + 1;
		for (let i = end; i < lines.length; i++) {
			const a_line = lines[i]!.a_line;
			if (a_line !== null) {
				after = a_line;
				break;
			}
		}
		return Math.max(0, after - before - 1);
	}

	#check_index(index: number): DiffLine {
		const line = Number.isInteger(index) ? this.lines[index] : undefined;
		if (line === undefined) {
			throw RangeError(`Row ${index} is not in the diff's ${this.lines.length} rows`);
		}
		return line;
	}

	partner(index: number): number {
		this.#check_index(index);
		this.#pair(index);
		return this.#partners[index]!;
	}

	fragment(index: number, side: 'a' | 'b', intraline = false): string {
		const line = this.#check_index(index);
		const number = side === 'a' ? line.a_line : line.b_line;
		if (number === null) {
			throw RangeError(`The diff line at index ${index} has no ${side} line`);
		}
		const diff_side = side === 'a' ? this.a : this.b;
		if (intraline && line.type !== 'same') {
			this.#pair(index);
			if (this.#marks.has(index)) {
				let marked = this.#marked_fragments.get(index);
				if (marked === undefined) {
					this.#render_marked(index);
					marked = this.#marked_fragments.get(index)!;
				}
				return marked;
			}
		}
		return diff_side.fragment(number);
	}

	prepare(start: number, end: number, options: DiffPrepareOptions = {}): void {
		const { split = false, intraline = false } = options;
		const { lines } = this;
		const from = Math.max(0, start);
		const to = Math.min(end, lines.length);
		let a_first = 0;
		let a_last = 0;
		let b_first = 0;
		let b_last = 0;
		for (let i = from; i < to; i++) {
			const line = lines[i]!;
			// the unified view draws removed lines from `a`, the rest from `b`
			if (line.a_line !== null && (split || line.type === 'remove')) {
				if (a_first === 0) a_first = line.a_line;
				a_last = line.a_line;
			}
			if (line.b_line !== null) {
				if (b_first === 0) b_first = line.b_line;
				b_last = line.b_line;
			}
		}
		if (a_first !== 0) this.a.prepare_fragments(a_first, a_last);
		if (b_first !== 0) this.b.prepare_fragments(b_first, b_last);
		if (intraline) {
			this.#prepare_marked(from, to, 'remove');
			this.#prepare_marked(from, to, 'add');
		}
	}

	/**
	 * Renders the emphasized fragments of the `type` rows in `[from, to)` not
	 * yet rendered, with one pass per cluster of nearby lines: a pass costs a
	 * resume, so lines a few apart share one, rendering the few between.
	 */
	#prepare_marked(from: number, to: number, type: 'remove' | 'add'): void {
		const { lines } = this;
		const is_a = type === 'remove';
		const side = is_a ? this.a : this.b;
		let cluster: Array<number> = [];
		const flush = (): void => {
			if (cluster.length === 0) return;
			const marks: Array<SyntaxHtmlMark> = [];
			for (const i of cluster) for (const mark of this.#marks.get(i)!) marks.push(mark);
			const first = line_number(lines[cluster[0]!]!, is_a);
			const fragments = side.render_fragments(
				first,
				line_number(lines[cluster[cluster.length - 1]!]!, is_a),
				marks
			);
			for (const i of cluster) {
				this.#marked_fragments.set(i, fragments[line_number(lines[i]!, is_a) - first]!);
			}
			cluster = [];
		};
		for (let i = from; i < to; i++) {
			const line = lines[i]!;
			if (line.type !== type) continue;
			this.#pair(i);
			if (!this.#marks.has(i) || this.#marked_fragments.has(i)) continue;
			if (
				cluster.length > 0 &&
				line_number(line, is_a) - line_number(lines[cluster[cluster.length - 1]!]!, is_a) >
					MARKED_CLUSTER_GAP
			) {
				flush();
			}
			cluster.push(i);
		}
		flush();
	}

	/**
	 * Returns the bounds of the change holding the line at `index`, a run of
	 * removes then the run of adds after it: `[removes_start, adds_start,
	 * end]`.
	 */
	#change_bounds(index: number): [number, number, number] {
		const { lines } = this;
		const type = lines[index]!.type;
		let removes_start = index;
		if (type === 'add') {
			while (removes_start > 0 && lines[removes_start - 1]!.type === 'add') removes_start--;
		}
		let adds_start = removes_start;
		while (removes_start > 0 && lines[removes_start - 1]!.type === 'remove') removes_start--;
		if (type === 'remove') {
			while (adds_start < lines.length && lines[adds_start]!.type === 'remove') adds_start++;
		}
		let end = adds_start;
		while (end < lines.length && lines[end]!.type === 'add') end++;
		return [removes_start, adds_start, end];
	}

	/**
	 * Renders the emphasized lines of the side of the change holding the line
	 * at `index` in one pass — a side's lines in a change are consecutive.
	 */
	#render_marked(index: number): void {
		const { lines } = this;
		const [removes_start, adds_start, end] = this.#change_bounds(index);
		const is_a = lines[index]!.type === 'remove';
		const from = is_a ? removes_start : adds_start;
		const to = is_a ? adds_start : end;
		const marks: Array<SyntaxHtmlMark> = [];
		for (let i = from; i < to; i++) {
			const line_marks = this.#marks.get(i);
			if (line_marks) for (const mark of line_marks) marks.push(mark);
		}
		const first = is_a ? lines[from]!.a_line! : lines[from]!.b_line!;
		const fragments = (is_a ? this.a : this.b).render_fragments(
			first,
			first + (to - from) - 1,
			marks
		);
		for (let i = from; i < to; i++) {
			if (this.#marks.has(i)) this.#marked_fragments.set(i, fragments[i - from]!);
		}
	}

	/**
	 * Pairs the change holding the line at `index`, once.
	 */
	#pair(index: number): void {
		const paired = this.#paired;
		if (paired[index]) return;
		const { lines } = this;
		if (lines[index]!.type === 'same') {
			paired[index] = 1;
			return;
		}
		const [removes_start, adds_start, end] = this.#change_bounds(index);
		for (let i = removes_start; i < end; i++) paired[i] = 1;

		const { a, b } = this;
		pair_change(lines, removes_start, adds_start, end, (r, c, segments) => {
			this.#partners[r] = c;
			this.#partners[c] = r;
			if (segments.a_ranges.length > 0) {
				const offset = a.line_start(lines[r]!.a_line!);
				this.#marks.set(
					r,
					segments.a_ranges.map(([start, end]) => ({ start: offset + start, end: offset + end }))
				);
			}
			if (segments.b_ranges.length > 0) {
				const offset = b.line_start(lines[c]!.b_line!);
				this.#marks.set(
					c,
					segments.b_ranges.map(([start, end]) => ({ start: offset + start, end: offset + end }))
				);
			}
		});
	}
}

/**
 * Creates the `DiffModel` of sides `a` and `b`. Throws when supplied `lines`
 * don't number the sides' lines — a bug in whatever produced them, since
 * lines from outside (a git diff, say) are validated where they're parsed,
 * and a diff of only some lines (a `-U0` patch's hunks) is a different input.
 *
 * @throws Error when `options.lines` has an unknown type, a line number that
 *   isn't the next integer on its side, a number on a side its type lacks,
 *   or stops short of a side's last line
 */
export const create_diff_model = (
	a: DiffSide,
	b: DiffSide,
	options: DiffModelOptions = {}
): DiffModel => new DiffModelState(a, b, options);

/**
 * A range of lines on one side of a diff, 1-based and inclusive, as in a
 * line link like `#L10-L20`.
 */
export interface DiffLineRange {
	side: 'a' | 'b';
	start: number;
	/**
	 * The last line, inclusive.
	 *
	 * @default start
	 */
	end?: number;
}

/**
 * Options for the row-range renderers `render_diff_unified_rows_html` and
 * `render_diff_split_rows_html`.
 */
export interface RenderDiffRowsOptions {
	/**
	 * Unchanged lines of context around changes, which decides the hunks rows
	 * belong to. The row renderers draw exactly the rows asked for, so here it
	 * only sets `data-hunk`; the whole-document renderers also elide by it.
	 * Floored to an integer; a negative or `NaN` value counts as `0`, and
	 * `Infinity` shows every line.
	 *
	 * @default 3
	 */
	context_lines?: number;
	/**
	 * Whether paired remove/add lines get intra-line changed-range emphasis
	 * (`<mark>` spans via `diff_segments`) — see `DiffModel` for how lines
	 * pair; lines too different from every candidate stay unpaired.
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
	 * Lines whose rows get the `diff_highlight` class: a row matches when its
	 * `a` line is in an `a` range or its `b` line in a `b` range, so a
	 * context line matches through either side.
	 */
	highlight?: Array<DiffLineRange>;
}

/**
 * Options for the whole-document renderers `render_diff_model_unified_html`
 * and `render_diff_model_split_html`.
 */
export interface RenderDiffModelOptions extends RenderDiffRowsOptions {
	/**
	 * How elided unchanged regions render: `'details'` as collapsed native
	 * `<details>` blocks (expandable with zero JS, full content in the DOM),
	 * `'omit'` as an inert count row (bounded output for huge inputs),
	 * `'none'` fully expanded.
	 *
	 * @default 'details'
	 */
	elide?: 'details' | 'omit' | 'none';
}

/**
 * Options for `render_diff_unified_html` and `render_diff_split_html`.
 */
export interface RenderDiffOptions extends RenderDiffModelOptions, DiffSideOptions {
	/**
	 * See `DiffOptions.max_cost` in `@fuzdev/fuz_util/diff.ts`.
	 */
	max_cost?: number;
}

/**
 * What one row-range render needs, resolved once from its options.
 */
interface RowsContext {
	model: DiffRowSource;
	intraline: boolean;
	line_numbers: boolean;
	highlight: Array<DiffLineRange> | null;
	hunks: ReadonlyArray<Readonly<DiffRowRange>>;
	pad: string;
}

const to_rows_context = (model: DiffRowSource, options: RenderDiffRowsOptions): RowsContext => {
	const { context_lines = 3, intraline = true, line_numbers = true, highlight } = options;
	return {
		model,
		intraline,
		line_numbers,
		highlight: highlight && highlight.length > 0 ? highlight : null,
		hunks: model.hunk_ranges(context_lines),
		pad: ''.padStart(model.width)
	};
};

/**
 * Returns the index of the first hunk ending after row `index`.
 */
const find_hunk = (hunks: ReadonlyArray<Readonly<DiffRowRange>>, index: number): number => {
	let low = 0;
	let high = hunks.length;
	while (low < high) {
		const mid = (low + high) >>> 1;
		if (hunks[mid]!.end <= index) low = mid + 1;
		else high = mid;
	}
	return low;
};

const is_highlighted = (
	a_line: number | null,
	b_line: number | null,
	highlight: Array<DiffLineRange>
): boolean => {
	for (const range of highlight) {
		const number = range.side === 'a' ? a_line : b_line;
		if (number !== null && number >= range.start && number <= (range.end ?? range.start)) {
			return true;
		}
	}
	return false;
};

/**
 * Renders the rest of a row's opening tag after its type class: the
 * highlight class and the quote closing `class`, then the line numbers and
 * hunk index. The caller supplies the `>`.
 */
const render_row_attrs = (ctx: RowsContext, line: DiffLine, hunk: number): string => {
	let attrs =
		ctx.highlight !== null && is_highlighted(line.a_line, line.b_line, ctx.highlight)
			? ' diff_highlight"'
			: '"';
	if (line.a_line !== null) attrs += ` data-a="${line.a_line}"`;
	if (line.b_line !== null) attrs += ` data-b="${line.b_line}"`;
	if (hunk !== -1) attrs += ` data-hunk="${hunk}"`;
	return attrs;
};

/**
 * Clamps a row range to `lines`.
 */
const clamp_range = (model: DiffRowSource, start: number, end: number): [number, number] => {
	const from = Math.max(0, Math.min(start, model.lines.length));
	return [from, Math.max(from, Math.min(end, model.lines.length))];
};

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

const elided_summary = (count: number | null): string =>
	count === null ? 'unchanged lines' : `${count} unchanged line${count === 1 ? '' : 's'}`;

const render_unified_rows = (ctx: RowsContext, start: number, end: number, out: Array<string>) => {
	const { model, intraline, line_numbers, hunks, pad } = ctx;
	const { lines, width } = model;
	model.prepare(start, end, { intraline });
	let h = find_hunk(hunks, start);
	for (let i = start; i < end; i++) {
		const line = lines[i]!;
		while (h < hunks.length && hunks[h]!.end <= i) h++;
		const hunk = h < hunks.length && hunks[h]!.start <= i ? h : -1;
		let gutter = '';
		if (line_numbers) {
			const a_num = line.a_line === null ? pad : String(line.a_line).padStart(width);
			const b_num = line.b_line === null ? pad : String(line.b_line).padStart(width);
			gutter = `<span class="diff_gutter" aria-hidden="true">${a_num} ${b_num}</span>`;
		}
		const text = render_text(
			line,
			model.fragment(i, line.type === 'remove' ? 'a' : 'b', intraline)
		);
		const attrs = render_row_attrs(ctx, line, hunk);
		if (line.type === 'add') {
			out.push(`<ins class="diff_line diff_add${attrs}>${gutter}${text}</ins>`);
		} else if (line.type === 'remove') {
			out.push(`<del class="diff_line diff_remove${attrs}>${gutter}${text}</del>`);
		} else {
			out.push(`<span class="diff_line diff_same${attrs}>${gutter}${text}</span>`);
		}
	}
};

/**
 * Renders rows `start` up to `end` (indices into `model.lines`) as
 * unified-diff rows: one element per line — `<ins>`/`<del>` for added/removed
 * lines (semantics survive copy/paste and screen readers), `<span>` for
 * context — carrying `diff_line` plus `diff_add`/`diff_remove`/`diff_same`,
 * `diff_highlight` when `highlight` matches, `data-a`/`data-b` line numbers,
 * and `data-hunk` inside a hunk. Gutters are `aria-hidden` and unselectable,
 * and the `+`/`-` markers are CSS generated content, so selecting and copying
 * yields clean code (an empty line carries a `<br>` so the copy keeps it).
 * Removed rows render from `a`'s highlight, added and context rows from
 * `b`'s. No elision: the caller decides which ranges to show, and how to show
 * the rest. The range is clamped to `model.lines`.
 */
export const render_diff_unified_rows_html = (
	model: DiffRowSource,
	start: number,
	end: number,
	options: RenderDiffRowsOptions = {}
): string => {
	const [from, to] = clamp_range(model, start, end);
	const out: Array<string> = [];
	render_unified_rows(to_rows_context(model, options), from, to, out);
	return out.join('');
};

const render_split_rows = (ctx: RowsContext, start: number, end: number, out: Array<string>) => {
	const { model, intraline, line_numbers, hunks, pad } = ctx;
	const { lines, width } = model;
	model.prepare(start, end, { split: true, intraline });
	let h = find_hunk(hunks, start);
	let hunk = -1;

	const render_cell = (index: number, side: 'a' | 'b'): string => {
		if (index === -1) {
			return hunk === -1
				? '<span class="diff_cell diff_spacer"></span>'
				: `<span class="diff_cell diff_spacer" data-hunk="${hunk}"></span>`;
		}
		const line = lines[index]!;
		const num = side === 'a' ? line.a_line : line.b_line;
		const gutter = line_numbers
			? `<span class="diff_gutter" aria-hidden="true">${num === null ? pad : String(num).padStart(width)}</span>`
			: '';
		const text = render_text(line, model.fragment(index, side, intraline));
		const attrs = render_row_attrs(ctx, line, hunk);
		if (line.type === 'same') {
			return `<span class="diff_cell diff_same${attrs}>${gutter}${text}</span>`;
		}
		return side === 'a'
			? `<del class="diff_cell diff_remove${attrs}>${gutter}${text}</del>`
			: `<ins class="diff_cell diff_add${attrs}>${gutter}${text}</ins>`;
	};

	// lays out the visual rows: context beside itself, and within a change
	// each paired remove beside its add, with the unpaired lines between two
	// pairs zipped top-aligned and the shorter side padded; a pair split by
	// the range's edge lays out as unpaired lines
	let i = start;
	while (i < end) {
		while (h < hunks.length && hunks[h]!.end <= i) h++;
		hunk = h < hunks.length && hunks[h]!.start <= i ? h : -1;
		const line = lines[i]!;
		if (line.type === 'same') {
			out.push(render_cell(i, 'a'), render_cell(i, 'b'));
			i++;
			continue;
		}
		const removes_start = i;
		while (i < end && lines[i]!.type === 'remove') i++;
		const adds_start = i;
		while (i < end && lines[i]!.type === 'add') i++;
		let r = removes_start;
		let c = adds_start;
		while (r < adds_start || c < i) {
			// the next pair, or both runs' ends when none is left
			let pair_r = r;
			let pair_c = i;
			for (; pair_r < adds_start; pair_r++) {
				const partner = model.partner(pair_r);
				if (partner !== -1 && partner < i) {
					pair_c = partner;
					break;
				}
			}
			const remove_count = pair_r - r;
			const add_count = pair_c - c;
			for (let k = 0; k < Math.max(remove_count, add_count); k++) {
				out.push(
					render_cell(k < remove_count ? r + k : -1, 'a'),
					render_cell(k < add_count ? c + k : -1, 'b')
				);
			}
			if (pair_r === adds_start) break;
			out.push(render_cell(pair_r, 'a'), render_cell(pair_c, 'b'));
			r = pair_r + 1;
			c = pair_c + 1;
		}
	}
};

/**
 * Renders rows `start` up to `end` (indices into `model.lines`) as
 * side-by-side diff cells — the split-view sibling of
 * `render_diff_unified_rows_html`, same options and row semantics. Output is
 * a flat sequence of half-row cells for a two-column grid: each visual row is
 * one `a`-side cell then one `b`-side cell (`<del>`/`<ins>`/`<span>` with
 * `diff_cell` classes). A context line's two cells both carry its `data-a`
 * and `data-b`. Within a change, a removed line sits beside the added line
 * it pairs with, the unpaired lines between two pairs are top-aligned, and a
 * side with no line in a row gets an empty `.diff_spacer` cell, which
 * carries only `data-hunk`. A range that cuts a change lays out the part
 * inside it as its own change. The range is clamped to `model.lines`.
 */
export const render_diff_split_rows_html = (
	model: DiffRowSource,
	start: number,
	end: number,
	options: RenderDiffRowsOptions = {}
): string => {
	const [from, to] = clamp_range(model, start, end);
	const out: Array<string> = [];
	render_split_rows(to_rows_context(model, options), from, to, out);
	return out.join('');
};

/**
 * Renders the whole document: each hunk's rows, and between them the elided
 * unchanged regions as `elide` says.
 */
const render_model = (
	model: DiffRowSource,
	options: RenderDiffModelOptions,
	split: boolean
): string => {
	const { elide = 'details' } = options;
	const ctx = to_rows_context(model, options);
	const render_rows = split ? render_split_rows : render_unified_rows;
	const out: Array<string> = [];
	// the gap's count comes from line numbers, so a source that doesn't hold
	// the gap's rows still shows how many lines it stands for — as a count
	// row, since there are no rows to expand or show
	const render_elided = (start: number, end: number): void => {
		const count = model.elided_count(start, end);
		if (count === 0) return;
		if (elide === 'omit' || start === end) {
			out.push(`<div class="diff_skip">${elided_summary(count)}</div>`);
		} else if (elide === 'none') {
			render_rows(ctx, start, end, out);
		} else {
			out.push(`<details class="diff_skip"><summary>${elided_summary(count)}</summary>`);
			if (split) out.push('<div class="diff_split_rows">');
			render_rows(ctx, start, end, out);
			out.push(split ? '</div></details>' : '</details>');
		}
	};
	let cursor = 0;
	for (const hunk of ctx.hunks) {
		render_elided(cursor, hunk.start);
		render_rows(ctx, hunk.start, hunk.end, out);
		cursor = hunk.end;
	}
	render_elided(cursor, model.lines.length);
	return out.join('');
};

/**
 * Renders a `DiffModel` (or any `DiffRowSource`) as unified-diff rows,
 * whole: the hunks' rows (see `render_diff_unified_rows_html`) with the
 * unchanged regions between them elided as `elide` says. Returns rows only —
 * the caller owns the `<div class="code_diff">` wrapper (`CodeDiff.svelte`
 * does this).
 */
export const render_diff_model_unified_html = (
	model: DiffRowSource,
	options: RenderDiffModelOptions = {}
): string => render_model(model, options, false);

/**
 * Renders a `DiffModel` (or any `DiffRowSource`) as side-by-side cells,
 * whole — the split-view sibling of `render_diff_model_unified_html`. Elided
 * regions span both columns, with their rows in a nested `.diff_split_rows`
 * grid. The caller owns the `<div class="code_diff split">` grid wrapper
 * (`CodeDiff.svelte` with `split`).
 */
export const render_diff_model_split_html = (
	model: DiffRowSource,
	options: RenderDiffModelOptions = {}
): string => render_model(model, options, true);

const create_model_from_texts = (a: string, b: string, options: RenderDiffOptions): DiffModel => {
	const { lang, syntax_styler, max_cost } = options;
	return create_diff_model(
		create_diff_side(a, { lang, syntax_styler }),
		create_diff_side(b, { lang, syntax_styler }),
		{ max_cost }
	);
};

/**
 * Generates syntax-highlighted unified-diff rows for two versions of a
 * source text — `create_diff_side` for each, `create_diff_model`, then
 * `render_diff_model_unified_html`. Both sides are lexed as whole documents,
 * so multi-line constructs highlight correctly. To reuse a side across
 * diffs, or to supply the diff's lines, build the model directly.
 */
export const render_diff_unified_html = (
	a: string,
	b: string,
	options: RenderDiffOptions = {}
): string => render_diff_model_unified_html(create_model_from_texts(a, b, options), options);

/**
 * Generates syntax-highlighted side-by-side diff cells for two versions of a
 * source text — the split-view sibling of `render_diff_unified_html`, through
 * `render_diff_model_split_html`.
 */
export const render_diff_split_html = (
	a: string,
	b: string,
	options: RenderDiffOptions = {}
): string => render_diff_model_split_html(create_model_from_texts(a, b, options), options);

/**
 * The part of an element `apply_diff_highlight` reads and writes, so it runs
 * on any DOM-like tree.
 */
export interface DiffHighlightRow {
	getAttribute(name: string): string | null;
	classList: { toggle(token: string, force?: boolean): boolean };
}

/**
 * Sets the `diff_highlight` class on every rendered row under `root` to match
 * `highlight`, as the renderers' `highlight` option would have — so a
 * highlight change touches only classes, not the rows, keeping opened
 * elisions open and the rows' identity stable. Rows are found by their
 * `data-a` / `data-b` attributes.
 *
 * @mutates root - toggles the `diff_highlight` class on its rows
 */
export const apply_diff_highlight = (
	root: { querySelectorAll(selector: string): Iterable<DiffHighlightRow> },
	highlight: Array<DiffLineRange> | null | undefined
): void => {
	const ranges = highlight && highlight.length > 0 ? highlight : null;
	for (const row of root.querySelectorAll('[data-a], [data-b]')) {
		let on = false;
		if (ranges !== null) {
			const a = row.getAttribute('data-a');
			const b = row.getAttribute('data-b');
			on = is_highlighted(a === null ? null : Number(a), b === null ? null : Number(b), ranges);
		}
		row.classList.toggle('diff_highlight', on);
	}
};
