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
 * A diff known only by a patch's hunks renders through
 * `create_diff_patch_source`, highlighted approximately — each run of hunks
 * lexed on its own — with the lines between hunks counted, until the texts
 * arrive and a `DiffModel` replaces it.
 *
 * `elide: 'expand'` bounds the DOM of a big diff with a way back: elided
 * regions render as count rows with expand controls, and the lines in
 * `expanded` (`b` line numbers) as rows. `render_diff_segments` renders the
 * document in keyed pieces, so a component re-renders only the pieces an
 * expansion changes.
 *
 * @module
 */

import {
	diff_lines,
	diff_hunks,
	diff_segments,
	type DiffHunk,
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
	 * Returns the last `b` line number at or before row `index` in the file,
	 * `0` before the first — for a removed row, the `b` line it follows. A
	 * source lacking rows counts the lines it lacks: a run of removals that
	 * starts past the file's first line follows a `b` line no row holds, so
	 * the renderers can't find it by looking at earlier rows. `-1` is `0`.
	 */
	b_through(index: number): number;
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
/**
 * Plain lines render in runs of lines at most this many apart. An
 * emphasized line between two plain ones splits the run: rendering it plain
 * too, only for the emphasized pass to render it again, measured slower on
 * edit-heavy diffs than the extra call.
 */
const PLAIN_GAP = 1;

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

	b_through(index: number): number {
		const { lines } = this;
		// every line is held, so the nearest `b` line before is the one
		for (let i = Math.min(index, lines.length - 1); i >= 0; i--) {
			const b_line = lines[i]!.b_line;
			if (b_line !== null) return b_line;
		}
		return 0;
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
		if (intraline) {
			this.#prepare_marked(from, to, 'remove');
			this.#prepare_marked(from, to, 'add');
		}
		// plain fragments only for the lines drawn without emphasis
		const marked = this.#marked_fragments;
		let a_first = 0;
		let a_last = 0;
		let b_first = 0;
		let b_last = 0;
		for (let i = from; i < to; i++) {
			const line = lines[i]!;
			const emphasized = intraline && marked.has(i);
			if (emphasized) continue;
			// the unified view draws removed lines from `a`, the rest from `b`
			const a_line = line.a_line;
			if (a_line !== null && (split || line.type === 'remove')) {
				if (a_first !== 0 && a_line - a_last > PLAIN_GAP) {
					this.a.prepare_fragments(a_first, a_last);
					a_first = 0;
				}
				if (a_first === 0) a_first = a_line;
				a_last = a_line;
			}
			const b_line = line.b_line;
			if (b_line !== null) {
				if (b_first !== 0 && b_line - b_last > PLAIN_GAP) {
					this.b.prepare_fragments(b_first, b_last);
					b_first = 0;
				}
				if (b_first === 0) b_first = b_line;
				b_last = b_line;
			}
		}
		if (a_first !== 0) this.a.prepare_fragments(a_first, a_last);
		if (b_first !== 0) this.b.prepare_fragments(b_first, b_last);
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
 * Options for `create_diff_patch_source`.
 */
export interface DiffPatchSourceOptions extends DiffSideOptions {
	/**
	 * How many lines the original text has, when known, counted as
	 * `DiffSide.diff_line_count` counts them (a trailing newline adds no
	 * line). It counts the unchanged lines after the last hunk, which a
	 * patch doesn't say, and widens the gutter to fit the final line number.
	 * A `null` or absent count is unknown, unless `patch_context` or a final
	 * line's `no_newline` proves where the file ends.
	 */
	a_line_count?: number | null;
	/**
	 * How many lines the updated text has, when known — see `a_line_count`.
	 */
	b_line_count?: number | null;
	/**
	 * The context the patch was made with, the `<n>` of `git diff -U<n>`.
	 * A patch gives each change that many unchanged lines after it where the
	 * file has them, so a last hunk ending in fewer proves the file ends
	 * there, and the count after it is `0`. Unrelated to the renderers'
	 * `context_lines`, which says how much of the held context to show. A
	 * value larger than the patch's real context wrongly proves the end of
	 * any file whose last change is near it; `null`, absent, or `0` proves
	 * nothing.
	 */
	patch_context?: number | null;
}

/**
 * A diff known only by its hunks — a patch's, as from `git diff`, without
 * either text — that the row renderers draw like a `DiffModel` of the same
 * two texts: the same rows with the same numbers, pairing, and emphasis
 * wherever it holds the rows, and a count row for each stretch of unchanged
 * lines it doesn't. Up to the patch's own context, `context_lines` makes the
 * same hunks with the same `data-hunk` indices; past it the patch has no
 * more lines to show, so its hunks are smaller than the model's and may
 * index differently. Until the line counts are known, the gutter fits the
 * largest line number the hunks hold, so it can be a char narrower than the
 * model's.
 *
 * Its highlighting is approximate. With no whole text to lex, each run of
 * contiguous hunks lexes as a snippet, one per side (its context and
 * removed lines for `a`, its context and added lines for `b`), so a hunk
 * that starts inside a construct opened in the lines before it — a block
 * comment, a template literal, a markdown fence — highlights as if the
 * construct weren't open. A snippet's damage stays in its own hunk. The
 * cure is to fetch both texts and render a `DiffModel` instead, which
 * `CodeDiff` swaps in without losing its place (see `CodeDiff`'s `hunks`).
 */
export interface DiffPatchSource extends DiffRowSource {
	/**
	 * The hunks the source was created from. Don't mutate.
	 */
	readonly hunks: ReadonlyArray<DiffHunk>;
	/**
	 * The language id the source was created with, `null` for plain text —
	 * as given, like `DiffSide.lang`: an unregistered id is reported as is,
	 * and its snippets lex as plain text.
	 */
	readonly lang: string | null;
	/**
	 * How many lines the original text has: given, or proven by
	 * `patch_context` or a final line's `no_newline`, else `null`.
	 */
	readonly a_line_count: number | null;
	/**
	 * How many lines the updated text has — see `a_line_count`.
	 */
	readonly b_line_count: number | null;
	/**
	 * Cached per count. A count above the patch's own context can't show
	 * more lines than the patch holds, so the hunks are as big as the
	 * patch's (merged where the patch's lines touch); a smaller count trims
	 * them, and splits a hunk whose changes are far enough apart, the rows
	 * it trims rendering as elided runs.
	 */
	hunk_ranges(context_lines?: number): ReadonlyArray<Readonly<DiffRowRange>>;
}

/**
 * A run of hunks whose lines are contiguous on both sides: rows `[start,
 * end)` of the source, lexed together as one snippet per side, with `a_base`
 * and `b_base` lines on each side before it. Its model, numbered from 1
 * within the snippets, is built on first use.
 */
interface DiffPatchBlock {
	start: number;
	end: number;
	a_base: number;
	b_base: number;
	model: DiffModel | null;
}

class DiffPatchSourceState implements DiffPatchSource {
	readonly hunks: ReadonlyArray<DiffHunk>;
	readonly lang: string | null;
	readonly lines: Array<DiffLine> = [];
	readonly width: number;
	readonly a_line_count: number | null;
	readonly b_line_count: number | null;

	readonly #syntax_styler: SyntaxStyler;
	readonly #blocks: Array<DiffPatchBlock> = [];
	readonly #hunk_ranges: Map<number, ReadonlyArray<Readonly<DiffRowRange>>> = new Map();
	/**
	 * Per row, how many `b` lines come before it in the file, and how many
	 * through it — what `elided_count` subtracts, across the lines no row
	 * holds.
	 */
	readonly #b_before: Int32Array;
	readonly #b_through: Int32Array;
	/**
	 * How many lines of each side follow the last hunk, `null` when unknown.
	 */
	readonly #trailing: number | null;
	readonly #b_last: number;

	constructor(hunks: ReadonlyArray<DiffHunk>, options: DiffPatchSourceOptions) {
		const { lang = null, syntax_styler = syntax_styler_global } = options;
		this.hunks = hunks;
		this.lang = lang;
		this.#syntax_styler = syntax_styler;
		const { lines } = this;
		const blocks = this.#blocks;

		// each side's last line so far, through the previous hunk
		let a_after = 0;
		let b_after = 0;
		// the final line of each side, once a line without a newline says so
		let a_final = 0;
		let b_final = 0;
		for (let k = 0; k < hunks.length; k++) {
			const hunk = hunks[k]!;
			const fail = (problem: string): never => {
				throw Error(
					`Invalid diff hunk ${k} (@@ -${hunk.a_start},${hunk.a_count} +${hunk.b_start},${hunk.b_count} @@): ${problem}`
				);
			};
			const { a_start, a_count, b_start, b_count } = hunk;
			for (const n of [a_start, a_count, b_start, b_count]) {
				if (!(Number.isInteger(n) && n >= 0)) fail('a start or count is not a whole number');
			}
			if (hunk.lines.length === 0) fail('no lines');
			// a side with no lines starts at the line before the hunk
			const a_before = a_count > 0 ? a_start - 1 : a_start;
			const b_before = b_count > 0 ? b_start - 1 : b_start;
			if (a_before < a_after || b_before < b_after) fail('out of order or overlapping');
			if (a_before - a_after !== b_before - b_after) {
				fail('the unchanged lines before it differ in number between the sides');
			}
			if ((a_final !== 0 && a_count > 0) || (b_final !== 0 && b_count > 0)) {
				fail("lines after a side's final line");
			}
			if (k === 0 || a_before !== a_after) {
				if (blocks.length > 0) blocks[blocks.length - 1]!.end = lines.length;
				blocks.push({
					start: lines.length,
					end: 0,
					a_base: a_before,
					b_base: b_before,
					model: null
				});
			}
			let a_next = a_before + 1;
			let b_next = b_before + 1;
			for (const line of hunk.lines) {
				const { type, text, a_line, b_line } = line;
				const fail_line = (problem: string): never =>
					fail(`line ${lines.length} (${type} ${String(a_line)} ${String(b_line)}): ${problem}`);
				if (type !== 'same' && type !== 'add' && type !== 'remove') fail_line('unknown type');
				if ((type === 'add') !== (a_line === null)) fail_line('its a line disagrees with its type');
				if ((type === 'remove') !== (b_line === null)) {
					fail_line('its b line disagrees with its type');
				}
				if (typeof text !== 'string' || text.includes('\n')) fail_line('its text is not one line');
				if (a_final !== 0 && a_line !== null) fail_line("it follows the a side's final line");
				if (b_final !== 0 && b_line !== null) fail_line("it follows the b side's final line");
				if (a_line !== null) {
					if (a_line !== a_next) fail_line(`expected a line ${a_next}`);
					a_next++;
				}
				if (b_line !== null) {
					if (b_line !== b_next) fail_line(`expected b line ${b_next}`);
					b_next++;
				}
				if (line.no_newline) {
					// a final line without a newline has text, or it would be no line
					if (text === '') fail_line('an empty line marked no_newline');
					if (a_line !== null) a_final = a_line;
					if (b_line !== null) b_final = b_line;
				}
				lines.push(line);
			}
			if (a_next - 1 - a_before !== a_count || b_next - 1 - b_before !== b_count) {
				fail("its lines don't match its counts");
			}
			a_after = a_before + a_count;
			b_after = b_before + b_count;
		}
		if (blocks.length > 0) blocks[blocks.length - 1]!.end = lines.length;

		// the lines after the last hunk: unchanged, so as many on each side
		let trailing: number | null = null;
		const known = (count: number | null | undefined, after: number, side: string): void => {
			if (count == null) return;
			if (!(Number.isInteger(count) && count >= after)) {
				throw Error(`Invalid ${side}_line_count ${count}: the hunks reach ${side} line ${after}`);
			}
			if (trailing !== null && trailing !== count - after) {
				throw Error(
					`Invalid ${side}_line_count ${count}: it leaves ${count - after} lines after the last hunk, not ${trailing}`
				);
			}
			trailing = count - after;
		};
		if (a_final !== 0 || b_final !== 0) trailing = 0;
		const { patch_context } = options;
		if (patch_context != null && patch_context > 0 && lines.length > 0) {
			// the unchanged lines ending the last hunk: fewer than the patch's
			// context means the file has no more
			let tail = 0;
			while (tail < lines.length && lines[lines.length - 1 - tail]!.type === 'same') tail++;
			if (tail < patch_context) trailing = 0;
		}
		known(options.a_line_count, a_after, 'a');
		known(options.b_line_count, b_after, 'b');
		this.#trailing = trailing;
		this.#b_last = b_after;
		this.a_line_count = trailing === null ? null : a_after + trailing;
		this.b_line_count = trailing === null ? null : b_after + trailing;
		this.width = String(
			Math.max(a_after, b_after, this.a_line_count ?? 0, this.b_line_count ?? 0, 1)
		).length;

		const b_before = new Int32Array(lines.length);
		const b_through = new Int32Array(lines.length);
		for (const block of blocks) {
			let count = block.b_base;
			for (let i = block.start; i < block.end; i++) {
				b_before[i] = count;
				const b_line = lines[i]!.b_line;
				if (b_line !== null) count = b_line;
				b_through[i] = count;
			}
		}
		this.#b_before = b_before;
		this.#b_through = b_through;
	}

	/**
	 * Returns the index of the block holding row `index`.
	 */
	#find_block(index: number): number {
		const blocks = this.#blocks;
		let low = 0;
		let high = blocks.length - 1;
		while (low < high) {
			const mid = (low + high + 1) >>> 1;
			if (blocks[mid]!.start <= index) low = mid;
			else high = mid - 1;
		}
		return low;
	}

	/**
	 * Returns the model of `block`, lexing its snippets on first use: its
	 * lines renumbered from 1 within them, so the model pairs and emphasizes
	 * as a whole text's model does.
	 */
	#block_model(block: DiffPatchBlock): DiffModel {
		if (block.model) return block.model;
		const { a_base, b_base } = block;
		const local: Array<DiffLine> = [];
		const a_texts: Array<string> = [];
		const b_texts: Array<string> = [];
		let a_newline = true;
		let b_newline = true;
		for (let i = block.start; i < block.end; i++) {
			const line = this.lines[i]!;
			const copy: DiffLine = {
				type: line.type,
				text: line.text,
				a_line: line.a_line === null ? null : line.a_line - a_base,
				b_line: line.b_line === null ? null : line.b_line - b_base
			};
			if (line.no_newline) copy.no_newline = true;
			local.push(copy);
			if (line.a_line !== null) {
				a_texts.push(line.text);
				a_newline = !line.no_newline;
			}
			if (line.b_line !== null) {
				b_texts.push(line.text);
				b_newline = !line.no_newline;
			}
		}
		const side_options = { lang: this.lang, syntax_styler: this.#syntax_styler };
		const snippet = (texts: Array<string>, newline: boolean): string =>
			texts.length === 0 ? '' : texts.join('\n') + (newline ? '\n' : '');
		block.model = create_diff_model(
			create_diff_side(snippet(a_texts, a_newline), side_options),
			create_diff_side(snippet(b_texts, b_newline), side_options),
			{ lines: local }
		);
		return block.model;
	}

	hunk_ranges(context_lines = 3): ReadonlyArray<Readonly<DiffRowRange>> {
		const count = context_lines >= 0 ? Math.floor(context_lines) : 0;
		const cached = this.#hunk_ranges.get(count);
		if (cached) return cached;
		const ranges: Array<Readonly<DiffRowRange>> = [];
		for (const block of this.#blocks) {
			// windowed within the block, since the lines either side of it are
			// missing; hunk lines are shared with `block_lines`, so identity
			// finds each hunk
			const block_lines = this.lines.slice(block.start, block.end);
			let cursor = 0;
			for (const hunk of diff_hunks(block_lines, count)) {
				const start = block_lines.indexOf(hunk.lines[0]!, cursor);
				cursor = start + hunk.lines.length;
				ranges.push(Object.freeze({ start: block.start + start, end: block.start + cursor }));
			}
		}
		const frozen = Object.freeze(ranges);
		this.#hunk_ranges.set(count, frozen);
		return frozen;
	}

	elided_count(start: number, end: number): number | null {
		const { length } = this.lines;
		const before = start <= 0 ? 0 : this.#b_through[Math.min(start, length) - 1]!;
		let after: number;
		if (end >= length) {
			if (this.#trailing === null) return null;
			after = this.#b_last + this.#trailing;
		} else {
			after = this.#b_before[end]!;
		}
		return Math.max(0, after - before);
	}

	b_through(index: number): number {
		return index < 0 ? 0 : (this.#b_through[Math.min(index, this.lines.length - 1)] ?? 0);
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
		const block = this.#blocks[this.#find_block(index)]!;
		const partner = this.#block_model(block).partner(index - block.start);
		return partner === -1 ? -1 : block.start + partner;
	}

	fragment(index: number, side: 'a' | 'b', intraline = false): string {
		const line = this.#check_index(index);
		if ((side === 'a' ? line.a_line : line.b_line) === null) {
			throw RangeError(`The diff line at index ${index} has no ${side} line`);
		}
		const block = this.#blocks[this.#find_block(index)]!;
		return this.#block_model(block).fragment(index - block.start, side, intraline);
	}

	prepare(start: number, end: number, options?: DiffPrepareOptions): void {
		const from = Math.max(0, start);
		const to = Math.min(end, this.lines.length);
		if (from >= to) return;
		const blocks = this.#blocks;
		for (let k = this.#find_block(from); k < blocks.length; k++) {
			const block = blocks[k]!;
			if (block.start >= to) break;
			this.#block_model(block).prepare(
				Math.max(from, block.start) - block.start,
				Math.min(to, block.end) - block.start,
				options
			);
		}
	}
}

/**
 * Creates a `DiffPatchSource` from a patch's `hunks` — one file's, in order,
 * as fuz_util's `diff_hunks` returns them or its patch parser reads them
 * from `git diff` output. Each hunk's lines must number its header's lines
 * consecutively (a side with no lines starts at the line before the hunk,
 * as in `@@` headers), hunks must be in order without overlapping, and the
 * unchanged lines between two hunks must be as many on both sides. Throws
 * otherwise — a bug in whatever produced the hunks, since a patch from
 * outside is validated where it's parsed. Nothing is lexed until rows are
 * drawn.
 *
 * The line counts and `patch_context` are claims about the texts that the
 * hunks can contradict — a count short of the hunks' last line, two counts
 * leaving different numbers of lines after the last hunk, or a count past a
 * proven end — and a contradiction throws too. `CodeDiff`, which may get a
 * count meant for other hunks while new ones arrive, treats a contradicted
 * count as unknown instead.
 *
 * @throws Error when a hunk has no lines, a start or count that isn't a
 *   whole number, lines that don't number its header's, a line after a
 *   side's `no_newline` line, or comes out of order; or when a line count
 *   is short of the hunks' lines or disagrees with the other side's or with
 *   a proven end
 */
export const create_diff_patch_source = (
	hunks: ReadonlyArray<DiffHunk>,
	options: DiffPatchSourceOptions = {}
): DiffPatchSource => new DiffPatchSourceState(hunks, options);

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
	 * `'expand'` as count rows with expand controls, showing the lines in
	 * `expanded` as rows (bounded output with a way back — the controls are
	 * `<button>`s that do nothing until a script wires them, as `CodeDiff`
	 * does; see `render_diff_segments`), `'none'` fully expanded.
	 *
	 * @default 'details'
	 */
	elide?: 'details' | 'omit' | 'expand' | 'none';
	/**
	 * With `elide: 'expand'`, the unchanged lines to show as rows rather than
	 * count — `b` line numbers, normalized as `normalize_diff_expanded` does.
	 * Lines outside the elided regions are ignored, and so is a region whose
	 * rows the source doesn't hold.
	 */
	expanded?: ReadonlyArray<DiffExpandedRange>;
	/**
	 * With `elide: 'expand'`, how many lines an expand-up or expand-down
	 * control reveals; a region of at most this many offers only expand-all.
	 * Floored, and a value under 1 or `NaN` is the default.
	 *
	 * @default DIFF_EXPAND_STEP
	 */
	expand_step?: number;
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
 * Pushes a row's text span, from its line's highlighted `fragment`, onto
 * `out` — pieces rather than one joined string, which edit-heavy diffs
 * measured as garbage. An empty line gets a `<br>`: a row with no text
 * contributes nothing to a copied selection, which would drop the source's
 * blank lines.
 *
 * @mutates out - pushes the span's pieces
 */
const push_text = (out: Array<string>, line: DiffLine, fragment: string): void => {
	out.push(
		'<span class="diff_text">',
		fragment,
		line.text === '' ? '<br>' : '',
		line.no_newline ? '<span class="diff_no_newline"></span></span>' : '</span>'
	);
};

const render_unified_rows = (ctx: RowsContext, start: number, end: number, out: Array<string>) => {
	const { model, intraline, line_numbers, hunks, pad } = ctx;
	const { lines, width } = model;
	model.prepare(start, end, { intraline });
	let h = find_hunk(hunks, start);
	for (let i = start; i < end; i++) {
		const line = lines[i]!;
		while (h < hunks.length && hunks[h]!.end <= i) h++;
		const hunk = h < hunks.length && hunks[h]!.start <= i ? h : -1;
		const close = line.type === 'add' ? '</ins>' : line.type === 'remove' ? '</del>' : '</span>';
		out.push(
			line.type === 'add'
				? '<ins class="diff_line diff_add'
				: line.type === 'remove'
					? '<del class="diff_line diff_remove'
					: '<span class="diff_line diff_same',
			render_row_attrs(ctx, line, hunk),
			'>'
		);
		if (line_numbers) {
			out.push(
				'<span class="diff_gutter" aria-hidden="true">',
				line.a_line === null ? pad : String(line.a_line).padStart(width),
				' ',
				line.b_line === null ? pad : String(line.b_line).padStart(width),
				'</span>'
			);
		}
		push_text(out, line, model.fragment(i, line.type === 'remove' ? 'a' : 'b', intraline));
		out.push(close);
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

	const render_cell = (index: number, side: 'a' | 'b'): void => {
		if (index === -1) {
			out.push(
				hunk === -1
					? '<span class="diff_cell diff_spacer"></span>'
					: `<span class="diff_cell diff_spacer" data-hunk="${hunk}"></span>`
			);
			return;
		}
		const line = lines[index]!;
		const type = line.type;
		const close = type === 'same' ? '</span>' : side === 'a' ? '</del>' : '</ins>';
		out.push(
			type === 'same'
				? '<span class="diff_cell diff_same'
				: side === 'a'
					? '<del class="diff_cell diff_remove'
					: '<ins class="diff_cell diff_add',
			render_row_attrs(ctx, line, hunk),
			'>'
		);
		if (line_numbers) {
			const num = side === 'a' ? line.a_line : line.b_line;
			out.push(
				'<span class="diff_gutter" aria-hidden="true">',
				num === null ? pad : String(num).padStart(width),
				'</span>'
			);
		}
		push_text(out, line, model.fragment(index, side, intraline));
		out.push(close);
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
			render_cell(i, 'a');
			render_cell(i, 'b');
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
				render_cell(k < remove_count ? r + k : -1, 'a');
				render_cell(k < add_count ? c + k : -1, 'b');
			}
			if (pair_r === adds_start) break;
			render_cell(pair_r, 'a');
			render_cell(pair_c, 'b');
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
 * How many lines an expand-up or expand-down control of an `elide: 'expand'`
 * render reveals unless `expand_step` says otherwise, as GitHub's controls
 * do.
 */
export const DIFF_EXPAND_STEP = 20;

/**
 * A run of unchanged lines an `elide: 'expand'` render shows as rows: `b`
 * line numbers, 1-based and inclusive. An unchanged line has a number on
 * both sides; `b` is the key because it's the version a reader links into
 * and edits, and because line numbers, unlike row indices, mean the same
 * thing in every model of the same two texts — a range survives a new model
 * of the same diff, such as a source holding only hunks upgraded to one
 * holding every line.
 *
 * `normalize_diff_expanded` caps `end` at `Number.MAX_SAFE_INTEGER`, which
 * reads as "to the end of the file", so a normalized value is finite and
 * survives `JSON.stringify`; clamping to a diff whose length is known
 * brings it down to the last line.
 */
export interface DiffExpandedRange {
	start: number;
	end: number;
}

/**
 * Which way an expand control reveals lines: `'down'` from the top of a
 * hidden region (continuing the rows above it), `'up'` from its bottom
 * (continuing the rows below it), or `'all'` of it.
 */
export type DiffExpandDirection = 'up' | 'down' | 'all';

/**
 * Returns `ranges` sorted, with overlapping and adjacent ranges merged, the
 * bounds rounded inward to whole lines, a start below 1 raised to 1 and an
 * end past `Number.MAX_SAFE_INTEGER` (an `Infinity`, say) lowered to it, and
 * empty or `NaN` ranges dropped. Doesn't mutate `ranges`.
 */
export const normalize_diff_expanded = (
	ranges: ReadonlyArray<DiffExpandedRange>
): Array<DiffExpandedRange> => {
	const valid: Array<DiffExpandedRange> = [];
	for (const range of ranges) {
		const start = Math.max(1, Math.ceil(range.start));
		const end = Math.min(Number.MAX_SAFE_INTEGER, Math.floor(range.end));
		// `NaN` fails the comparison
		if (start <= end) valid.push({ start, end });
	}
	valid.sort((x, y) => x.start - y.start);
	const merged: Array<DiffExpandedRange> = [];
	for (const range of valid) {
		const last = merged[merged.length - 1];
		if (last !== undefined && range.start <= last.end + 1) {
			if (range.end > last.end) last.end = range.end;
		} else {
			merged.push(range);
		}
	}
	return merged;
};

/**
 * A piece of an elided region: rows `[start, end)` whose `a` and `b` numbers
 * both count up by one — a run the region can show — or, with `start`
 * equal to `end`, lines the source holds no rows for, which render as a
 * count. `b_start` through `b_end` are the piece's `b` lines; `b_end` is
 * `Infinity` for lines of unknown count.
 */
interface DiffGapPiece {
	start: number;
	end: number;
	b_start: number;
	b_end: number;
	count: number | null;
}

/**
 * An elided region: rows `[start, end)` of the source, possibly none, the
 * `b` lines `[b_start, b_end]` it stands for (`b_end` is `Infinity` when the
 * count is unknown), and its pieces in order. A full model's region with
 * rows is one run; a source holding only some of a region's rows has a
 * piece per run and per stretch of lines it lacks.
 */
interface DiffGap {
	start: number;
	end: number;
	b_start: number;
	b_end: number;
	count: number | null;
	pieces: Array<DiffGapPiece>;
}

/**
 * Returns the elided regions between `hunks` (and before the first and after
 * the last), skipping those with no lines.
 */
const find_gaps = (
	model: DiffRowSource,
	hunks: ReadonlyArray<Readonly<DiffRowRange>>
): Array<DiffGap> => {
	const { lines } = model;
	const gaps: Array<DiffGap> = [];
	const add = (start: number, end: number): void => {
		const count = model.elided_count(start, end);
		if (count === 0) return;
		const before = start > 0 ? model.b_through(start - 1) : 0;
		const b_start = before + 1;
		const b_end = count === null ? Infinity : before + count;
		const pieces: Array<DiffGapPiece> = [];
		const missing = (at: number, from: number, to: number): void => {
			if (from > to) return;
			pieces.push({
				start: at,
				end: at,
				b_start: from,
				b_end: to,
				count: to === Infinity ? null : to - from + 1
			});
		};
		// a region holding all of its lines is one run - every region of a full model - known
		// from its ends alone, since line numbers strictly increase: no walk over its rows
		if (count === end - start) {
			const first = lines[start]!;
			const last = lines[end - 1]!;
			if (
				first.b_line === b_start &&
				(last.b_line ?? 0) - b_start === count - 1 &&
				(last.a_line ?? 0) - (first.a_line ?? 0) === count - 1
			) {
				pieces.push({ start, end, b_start, b_end, count });
				gaps.push({ start, end, b_start, b_end, count, pieces });
				return;
			}
		}
		// the rows of an elided region are unchanged lines, numbered on both sides
		let next_b = b_start;
		let i = start;
		while (i < end) {
			const first = lines[i]!;
			let j = i + 1;
			while (
				j < end &&
				lines[j]!.b_line === lines[j - 1]!.b_line! + 1 &&
				lines[j]!.a_line === lines[j - 1]!.a_line! + 1
			) {
				j++;
			}
			missing(i, next_b, first.b_line! - 1);
			const run_b_end = lines[j - 1]!.b_line!;
			pieces.push({ start: i, end: j, b_start: first.b_line!, b_end: run_b_end, count: j - i });
			next_b = run_b_end + 1;
			i = j;
		}
		missing(end, next_b, b_end);
		gaps.push({ start, end, b_start, b_end, count, pieces });
	};
	let cursor = 0;
	for (const hunk of hunks) {
		add(cursor, hunk.start);
		cursor = hunk.end;
	}
	add(cursor, lines.length);
	return gaps;
};

/**
 * Returns `expanded` normalized (see `normalize_diff_expanded`) and clamped
 * to the elided regions of `model` for `context_lines` — the lines an
 * `elide: 'expand'` render of it would show as rows from `expanded`, plus
 * any it counts because the source holds no rows for them. A region of
 * unknown length (after a patch's last hunk) keeps every line past its
 * start.
 */
export const clamp_diff_expanded = (
	model: DiffRowSource,
	expanded: ReadonlyArray<DiffExpandedRange>,
	context_lines = 3
): Array<DiffExpandedRange> => {
	const ranges = normalize_diff_expanded(expanded);
	const out: Array<DiffExpandedRange> = [];
	let j = 0;
	for (const gap of find_gaps(model, model.hunk_ranges(context_lines))) {
		while (j < ranges.length && ranges[j]!.end < gap.b_start) j++;
		// a range can span several regions, so `j` stays for the next one
		for (let k = j; k < ranges.length && ranges[k]!.start <= gap.b_end; k++) {
			const start = Math.max(ranges[k]!.start, gap.b_start);
			const end = Math.min(ranges[k]!.end, gap.b_end);
			const last = out[out.length - 1];
			// regions either side of a hunk with no `b` lines are adjacent
			if (last !== undefined && start <= last.end + 1) last.end = end;
			else out.push({ start, end });
		}
	}
	return out;
};

const to_expand_step = (step: number | undefined): number =>
	step !== undefined && step >= 1 ? Math.floor(step) : DIFF_EXPAND_STEP;

/**
 * Returns the lines an expand control reveals in a hidden region of `b`
 * lines `start` through `end` — what `CodeDiff` adds to its `expanded` on a
 * click, from the count row's `data-b-start` and `data-b-end`.
 *
 * @param start - the region's first `b` line
 * @param end - the region's last `b` line
 * @param direction - the control's `data-expand`
 * @param step - lines revealed up or down, as `expand_step`
 */
export const diff_expand_range = (
	start: number,
	end: number,
	direction: DiffExpandDirection,
	step?: number
): DiffExpandedRange => {
	const n = to_expand_step(step);
	if (direction === 'down') return { start, end: Math.min(end, start + n - 1) };
	if (direction === 'up') return { start: Math.max(start, end - n + 1), end };
	return { start, end };
};

/**
 * Options for `diff_expand_line_range`.
 */
export interface DiffExpandLineOptions {
	/**
	 * @default 3
	 */
	context_lines?: number;
	/**
	 * The window's size — see `RenderDiffModelOptions.expand_step`.
	 *
	 * @default DIFF_EXPAND_STEP
	 */
	expand_step?: number;
}

/**
 * Returns the lines to reveal so an `elide: 'expand'` render shows `line`
 * of `side` with context: a window of `expand_step` lines centered on it,
 * kept inside the run of rows holding it. `null` when no elided row has the
 * line — it's in a hunk, out of range, not an integer, or among lines the
 * source holds no rows for. `CodeDiff`'s `scroll_to_line` reveals this
 * window before scrolling.
 */
export const diff_expand_line_range = (
	model: DiffRowSource,
	side: 'a' | 'b',
	line: number,
	options: DiffExpandLineOptions = {}
): DiffExpandedRange | null => {
	if (!Number.isInteger(line)) return null;
	const { context_lines = 3, expand_step } = options;
	const n = to_expand_step(expand_step);
	const { lines } = model;
	for (const gap of find_gaps(model, model.hunk_ranges(context_lines))) {
		for (const run of gap.pieces) {
			if (run.start === run.end) continue;
			// a run numbers each side consecutively
			const first = side === 'a' ? lines[run.start]!.a_line! : run.b_start;
			if (line < first || line > first + (run.end - run.start) - 1) continue;
			const b_line = run.b_start + (line - first);
			const end = Math.min(run.b_end, Math.max(run.b_start, b_line - Math.floor(n / 2)) + n - 1);
			return { start: Math.max(run.b_start, end - n + 1), end };
		}
	}
	return null;
};

/**
 * A piece of a whole-document render, as `render_diff_segments` returns it.
 * Rendering each with its own `{@html}`, keyed by `key`, lets an expansion
 * replace only the segments it changes.
 */
export interface DiffSegment {
	/**
	 * Names the segment's rows: from renders of one source with the same
	 * options apart from `expanded`, equal keys are equal segments.
	 */
	readonly key: string;
	/**
	 * A `'hunk'`, a run of `'rows'` an elided region shows (all of it with
	 * `elide: 'none'`, or what `expanded` reveals with `'expand'`), or an
	 * `'elided'` region or the hidden part of one, rendered as `elide` says.
	 */
	readonly kind: 'hunk' | 'rows' | 'elided';
	/**
	 * The first row, an index into `DiffRowSource.lines`.
	 */
	readonly start: number;
	/**
	 * The row after the last; equal to `start` for lines with no rows.
	 */
	readonly end: number;
	readonly html: string;
}

/**
 * Options for `render_diff_segments`.
 */
export interface RenderDiffSegmentsOptions extends RenderDiffModelOptions {
	/**
	 * Side-by-side cells, as `render_diff_model_split_html` draws them, rather
	 * than unified rows.
	 *
	 * @default false
	 */
	split?: boolean;
}

const lines_label = (count: number): string => `${count} line${count === 1 ? '' : 's'}`;

const elided_summary = (count: number | null): string =>
	count === null ? 'unchanged lines' : `${count} unchanged line${count === 1 ? '' : 's'}`;

const render_count_row = (count: number | null): string =>
	`<div class="diff_skip">${elided_summary(count)}</div>`;

const render_expand_button = (direction: DiffExpandDirection, count: number): string => {
	const label = `Expand ${direction}: ${lines_label(count)}`;
	const glyph = direction === 'down' ? '↓' : direction === 'up' ? '↑' : '↕';
	return `<button type="button" class="diff_expand_${direction}" data-expand="${direction}" aria-label="${label}" title="${label}">${glyph}</button>`;
};

/**
 * Renders the count row of the hidden rows `[start, end)` of an elided run,
 * with its expand controls: down from the rows above and up from the rows
 * below — both when the hidden rows are the whole file, as in an unchanged
 * one — and all, alone for hidden rows no more than a step.
 */
const render_expand_row = (
	lines: ReadonlyArray<DiffLine>,
	start: number,
	end: number,
	step: number
): string => {
	const count = end - start;
	let controls = '';
	if (count > step) {
		const whole = start === 0 && end === lines.length;
		if (start > 0 || whole) controls += render_expand_button('down', step);
		if (end < lines.length || whole) controls += render_expand_button('up', step);
	}
	controls += render_expand_button('all', count);
	return `<div class="diff_skip diff_expand" data-b-start="${lines[start]!.b_line}" data-b-end="${lines[end - 1]!.b_line}">${controls}<span class="diff_expand_count">${elided_summary(count)}</span></div>`;
};

/**
 * Renders a `DiffModel` (or any `DiffRowSource`) whole, as
 * `render_diff_model_unified_html` or, with `split`,
 * `render_diff_model_split_html` does, but in pieces whose HTML joins to
 * that render: each hunk, each elided region, and with `elide: 'expand'`
 * each run of revealed rows and each count row between them.
 *
 * A component renders each segment with its own keyed `{@html}`, so an
 * expansion replaces the segments it changes and leaves the rest of the DOM
 * alone; the split view's segments are cells of one flat grid, its count
 * rows spanning both columns. Pass the last render's segments as `previous`
 * — of the same source with the same options apart from `expanded` — and
 * segments with the same key are reused rather than rendered, and runs of
 * revealed rows keep their old bounds as cuts, so revealing lines next to a
 * run renders only those lines as a new segment.
 *
 * A count row with expand controls is
 * `<div class="diff_skip diff_expand" data-b-start data-b-end>` naming the
 * hidden `b` lines, holding a `<button data-expand>` per `DiffExpandDirection`
 * it offers, labeled for assistive tech; `diff_expand_range` says what a
 * control reveals. Lines of an elided region the source holds no rows for
 * render as a count row with no controls in every mode but `'omit'`, which
 * counts the whole region in one row.
 */
export const render_diff_segments = (
	model: DiffRowSource,
	options: RenderDiffSegmentsOptions = {},
	previous?: ReadonlyArray<DiffSegment>
): Array<DiffSegment> => {
	const { elide = 'details', split = false, expanded } = options;
	const step = to_expand_step(options.expand_step);
	const ctx = to_rows_context(model, options);
	const render_rows = split ? render_split_rows : render_unified_rows;
	const segments: Array<DiffSegment> = [];

	// the previous render's segments are reused by key, and its runs of
	// revealed rows keep their bounds as cuts, so revealing more lines next to
	// a run renders only the new ones
	const reuse: Map<string, DiffSegment> = new Map();
	const cuts: Array<number> = [];
	if (previous) {
		for (const segment of previous) {
			reuse.set(segment.key, segment);
			if (segment.kind === 'rows') cuts.push(segment.start, segment.end);
		}
		cuts.sort((x, y) => x - y);
	}
	const push = (
		kind: DiffSegment['kind'],
		start: number,
		end: number,
		render: (out: Array<string>) => void
	): void => {
		const key = `${kind}:${start}-${end}`;
		const reused = reuse.get(key);
		if (reused) {
			segments.push(reused);
			return;
		}
		const out: Array<string> = [];
		render(out);
		segments.push(Object.freeze({ key, kind, start, end, html: out.join('') }));
	};
	const push_rows = (start: number, end: number): void => {
		push('rows', start, end, (out) => render_rows(ctx, start, end, out));
	};
	const push_revealed = (start: number, end: number): void => {
		let from = start;
		for (const cut of cuts) {
			if (cut <= from) continue;
			if (cut >= end) break;
			push_rows(from, cut);
			from = cut;
		}
		push_rows(from, end);
	};
	const push_details = (start: number, end: number, count: number | null): void => {
		push('elided', start, end, (out) => {
			out.push(`<details class="diff_skip"><summary>${elided_summary(count)}</summary>`);
			if (split) out.push('<div class="diff_split_rows">');
			render_rows(ctx, start, end, out);
			out.push(split ? '</div></details>' : '</details>');
		});
	};
	// lines with no rows still show how many they are, as a count row, since
	// there are no rows to expand or show
	const push_count = (at: number, count: number | null): void => {
		push('elided', at, at, (out) => out.push(render_count_row(count)));
	};

	const ranges = elide === 'expand' && expanded ? normalize_diff_expanded(expanded) : [];
	let j = 0;
	const render_run = (run: DiffGapPiece): void => {
		const { start, end } = run;
		let pos = start;
		while (j < ranges.length && ranges[j]!.end < run.b_start) j++;
		for (let k = j; k < ranges.length && ranges[k]!.start <= run.b_end; k++) {
			const revealed_start = start + Math.max(ranges[k]!.start, run.b_start) - run.b_start;
			const revealed_end = start + Math.min(ranges[k]!.end, run.b_end) - run.b_start + 1;
			if (pos < revealed_start) {
				const hidden_start = pos;
				push('elided', hidden_start, revealed_start, (out) =>
					out.push(render_expand_row(model.lines, hidden_start, revealed_start, step))
				);
			}
			push_revealed(revealed_start, revealed_end);
			pos = revealed_end;
		}
		if (pos < end) {
			const hidden_start = pos;
			push('elided', hidden_start, end, (out) =>
				out.push(render_expand_row(model.lines, hidden_start, end, step))
			);
		}
	};
	const render_gap = (gap: DiffGap): void => {
		if (elide === 'omit' || gap.start === gap.end) {
			push_count(gap.start, gap.count);
			return;
		}
		const { pieces } = gap;
		// a full model's region is one run, counted as the source counts it
		if (elide === 'details' && pieces.length === 1) {
			push_details(gap.start, gap.end, gap.count);
			return;
		}
		for (const piece of pieces) {
			if (piece.start === piece.end) push_count(piece.start, piece.count);
			else if (elide === 'none') push_rows(piece.start, piece.end);
			else if (elide === 'details') push_details(piece.start, piece.end, piece.count);
			else render_run(piece);
		}
	};

	const gaps = find_gaps(model, ctx.hunks);
	let g = 0;
	for (const hunk of ctx.hunks) {
		while (g < gaps.length && gaps[g]!.start <= hunk.start) render_gap(gaps[g++]!);
		push('hunk', hunk.start, hunk.end, (out) => render_rows(ctx, hunk.start, hunk.end, out));
	}
	while (g < gaps.length) render_gap(gaps[g++]!);
	return segments;
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
	let html = '';
	for (const segment of render_diff_segments(model, { ...options, split })) html += segment.html;
	return html;
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
