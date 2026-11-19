import { describe, test, assert } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { diff_hunks, diff_lines, type DiffHunk, type DiffLine } from '@fuzdev/fuz_util/diff.ts';

import {
	create_diff_model,
	create_diff_patch_source,
	create_diff_side,
	render_diff_segments,
	render_diff_split_rows_html,
	render_diff_unified_rows_html,
	clamp_diff_expanded,
	diff_expand_line_range,
	type DiffModel,
	type DiffPatchSource,
	type DiffRowSource,
	type RenderDiffSegmentsOptions
} from '#lib/diff_html.ts';
import {
	assert_balanced,
	create_random,
	marked_text,
	mutate_lines,
	parse_diff_rows,
	source_lines,
	strip_tags,
	type ParsedDiffRow
} from './html_test_helpers.ts';
import { discover_diff_cases, discover_samples } from './fixtures/helpers.ts';

const numbered = (count: number): string =>
	Array.from({ length: count }, (_, i) => `line ${i + 1}`).join('\n') + '\n';

/**
 * Changes a few lines far apart — the shape of most real patches, whose
 * hunks stay separate — where `mutate_lines` edits densely.
 */
const mutate_sparse = (text: string, random: () => number): string => {
	const out: Array<string> = [];
	const lines = text.split('\n');
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i]!;
		const r = random();
		if (r < 0.01) continue;
		if (r < 0.03) out.push(line.slice(0, Math.floor(line.length / 2)) + 'edit');
		else if (r < 0.04) out.push(`inserted ${i}`, line);
		else out.push(line);
	}
	return out.join('\n');
};

interface PatchPair {
	model: DiffModel;
	hunks: Array<DiffHunk>;
}

/**
 * The full model of `a` → `b`, and its hunks at `patch_context` as a patch
 * would hold them.
 */
const create_pair = (a: string, b: string, lang: string | null, patch_context = 3): PatchPair => {
	const lines = diff_lines(a, b);
	const model = create_diff_model(create_diff_side(a, { lang }), create_diff_side(b, { lang }), {
		lines
	});
	return { model, hunks: diff_hunks(lines, patch_context) };
};

const patch_of = (pair: PatchPair, known_length: boolean, lang: string | null): DiffPatchSource =>
	create_diff_patch_source(pair.hunks, {
		lang,
		b_line_count: known_length ? pair.model.b.diff_line_count : null
	});

/**
 * The cases every equivalence test runs: the diff fixtures, and fuzzed edits
 * of them and of the samples, dense and sparse.
 */
const load_cases = async (): Promise<
	Array<{ name: string; a: string; b: string; lang: string }>
> => {
	const cases: Array<{ name: string; a: string; b: string; lang: string }> = [];
	for (const c of await discover_diff_cases()) {
		cases.push(c);
		cases.push({ ...c, name: `${c.name} b→a`, a: c.b, b: c.a });
	}
	const random = create_random(3);
	for (const sample of await discover_samples()) {
		const a = sample.content;
		cases.push({
			name: `${sample.variant} sparse`,
			a,
			b: mutate_sparse(a, random),
			lang: sample.lang
		});
		cases.push({
			name: `${sample.variant} dense`,
			a,
			b: mutate_lines(a, random),
			lang: sample.lang
		});
	}
	return cases;
};

/**
 * Each row or cell of rendered diff HTML with the text of its emphasis,
 * spacers dropped.
 */
const parse_rows = (html: string): Array<ParsedDiffRow & { marks: string }> =>
	html
		.split(/(?=<(?:ins|del|span) class="diff_(?:line|cell) )/)
		.flatMap((chunk) =>
			parse_diff_rows(chunk).map((row) => ({ ...row, marks: marked_text(chunk) }))
		)
		.filter((row) => row.type !== 'spacer');

/**
 * A row's identity, plain content, and emphasis, without its highlighting.
 */
const row_key = (row: ParsedDiffRow & { marks: string }, hunk = true): string =>
	JSON.stringify([
		row.type,
		row.data_a,
		row.data_b,
		hunk ? row.data_hunk : null,
		row.text,
		row.no_newline,
		row.marks
	]);

/**
 * A source's whole unified render with the default options.
 */
const render_whole = (source: DiffRowSource): string =>
	render_diff_segments(source)
		.map((s) => s.html)
		.join('');

// the rows of every elided region, all revealed, so a whole render shows
// every row a source holds
const ALL = [{ start: 1, end: Number.MAX_SAFE_INTEGER }];

const render_joined = (source: DiffRowSource, options: RenderDiffSegmentsOptions): string =>
	render_diff_segments(source, options)
		.map((s) => s.html)
		.join('');

/**
 * Asserts the source made from `hunks`, a patch made with `patch_context`
 * lines of context, draws the rows it holds as `model` does: their numbers,
 * hunk indices up to the patch's context, text, and emphasis, in every
 * `elide` mode and both views; with the length known, the same counts; with
 * it unknown, a proven end only where the file ends; and the same clamped
 * expansions.
 */
const assert_patch_matches_model = (
	name: string,
	model: DiffModel,
	hunks: Array<DiffHunk>,
	lang: string | null,
	patch_context: number
): void => {
	const key_of = (a_line: number | null, b_line: number | null) => `${a_line}:${b_line}`;
	const known = create_diff_patch_source(hunks, { lang, b_line_count: model.b.diff_line_count });
	const unknown = create_diff_patch_source(hunks, { lang, patch_context });
	// a proven end is the real one
	if (unknown.b_line_count !== null) {
		assert.strictEqual(unknown.b_line_count, model.b.diff_line_count, name);
		assert.strictEqual(unknown.a_line_count, model.a.diff_line_count, name);
	}
	// the rows the patch holds, by their numbers
	const held = new Set(known.lines.map((l) => key_of(l.a_line, l.b_line)));
	for (const context_lines of [0, 1, 2, 3, 5]) {
		const label = `${name} context ${context_lines}`;
		const within = context_lines <= patch_context;
		if (within) {
			// within the patch's context, the same hunks over the same lines
			const numbers = (source: DiffRowSource) =>
				source
					.hunk_ranges(context_lines)
					.map((r) => source.lines.slice(r.start, r.end).map((l) => key_of(l.a_line, l.b_line)));
			assert.deepEqual(numbers(known), numbers(model), label);
			// the same elided lines, by `b` number
			assert.deepEqual(
				clamp_diff_expanded(known, ALL, context_lines),
				clamp_diff_expanded(model, ALL, context_lines),
				label
			);
		}
		for (const split of [false, true]) {
			for (const elide of ['details', 'omit', 'expand', 'none'] as const) {
				const options = { context_lines, elide, split, expanded: ALL };
				const model_html = render_joined(model, options);
				const model_rows = parse_rows(model_html).filter((r) =>
					held.has(key_of(r.data_a, r.data_b))
				);
				for (const patch of elide === 'expand' ? [known, unknown] : [known]) {
					const patch_html = render_joined(patch, options);
					const sublabel = `${label} ${elide} split ${split} known ${patch === known}`;
					// the snippets' fragments make valid markup: checked on one render
					// holding every row, since the check is slow on whole renders
					if (context_lines === 2 && elide === 'none' && !split) assert_balanced(patch_html);
					// `omit` draws the hunks alone, and past the patch's context its
					// hunks are smaller than the model's: the model shows rows it
					// lacks, and the hunk indices differ
					if (elide !== 'omit' || within) {
						assert.deepEqual(
							parse_rows(patch_html).map((r) => row_key(r, within)),
							model_rows.map((r) => row_key(r, within)),
							sublabel
						);
					}
					if (elide === 'omit' && within) {
						// the same rows and counts, highlighting aside
						assert.strictEqual(strip_tags(patch_html), strip_tags(model_html), sublabel);
					}
				}
			}
		}
	}
};

describe('create_diff_patch_source', () => {
	test('renders the rows it holds as the full model does', async () => {
		const cases = await load_cases();
		assert.isAbove(cases.length, 20);
		for (const { name, a, b, lang } of cases) {
			const pair = create_pair(a, b, lang);
			assert_patch_matches_model(name, pair.model, pair.hunks, lang, 3);
		}
	}, 60_000);

	test('pairs the rows it holds as the full model does', async () => {
		for (const { a, b, lang } of await load_cases()) {
			const pair = create_pair(a, b, lang);
			const patch = patch_of(pair, false, lang);
			const index_in_model = new Map(pair.model.lines.map((line, i) => [line, i]));
			for (let i = 0; i < patch.lines.length; i++) {
				const p = patch.partner(i);
				const m = pair.model.partner(index_in_model.get(patch.lines[i]!)!);
				assert.strictEqual(p === -1 ? null : patch.lines[p], m === -1 ? null : pair.model.lines[m]);
			}
		}
	});

	test('counts the unchanged lines between and around hunks from their headers', () => {
		const a = numbered(60);
		const b = a.replace('line 20\n', 'line twenty\n').replace('line 40\n', 'line forty\n');
		const pair = create_pair(a, b, null);
		const counts = (patch: DiffRowSource): Array<string> =>
			[...render_whole(patch).matchAll(/<div class="diff_skip">([^<]*)</g)].map((m) => m[1]!);
		assert.deepEqual(counts(patch_of(pair, true, null)), [
			'16 unchanged lines',
			'13 unchanged lines',
			'17 unchanged lines'
		]);
		assert.deepEqual(counts(patch_of(pair, false, null)), [
			'16 unchanged lines',
			'13 unchanged lines',
			'unchanged lines'
		]);
		// either side's count says how many lines follow
		const by_a = create_diff_patch_source(pair.hunks, { a_line_count: 60 });
		assert.strictEqual(by_a.b_line_count, 60);
		assert.deepEqual(counts(by_a), counts(patch_of(pair, true, null)));
	});

	test('a final line without a newline ends both sides', () => {
		const pair = create_pair('a\nb\nc', 'a\nb\nC', null);
		const patch = create_diff_patch_source(pair.hunks);
		assert.strictEqual(patch.a_line_count, 3);
		assert.strictEqual(patch.b_line_count, 3);
		assert.strictEqual(patch.elided_count(patch.lines.length, patch.lines.length), 0);
		assert.throws(
			() => create_diff_patch_source(pair.hunks, { b_line_count: 5 }),
			/b_line_count 5: it leaves 2 lines after the last hunk, not 0/
		);
	});

	test('no hunks: an unchanged file of known or unknown length', () => {
		const known = create_diff_patch_source([], { b_line_count: 12 });
		assert.strictEqual(render_whole(known), '<div class="diff_skip">12 unchanged lines</div>');
		const unknown = create_diff_patch_source([]);
		assert.strictEqual(render_whole(unknown), '<div class="diff_skip">unchanged lines</div>');
		assert.strictEqual(create_diff_patch_source([], { b_line_count: 0 }).width, 1);
		assert.strictEqual(render_whole(create_diff_patch_source([], { b_line_count: 0 })), '');
	});

	test('the gutter fits the final line number when the length is known', () => {
		const a = numbered(120);
		const pair = create_pair(a, a.replace('line 5\n', 'line five\n'), null);
		assert.strictEqual(patch_of(pair, false, null).width, 1);
		assert.strictEqual(patch_of(pair, true, null).width, 3);
		assert.strictEqual(patch_of(pair, true, null).width, pair.model.width);
	});

	test('a smaller context trims and splits hunks, rendering the trimmed rows as runs', () => {
		const a = numbered(40);
		const b = a.replace('line 10\n', 'line ten\n').replace('line 16\n', 'line sixteen\n');
		const pair = create_pair(a, b, null);
		const patch = patch_of(pair, true, null);
		assert.strictEqual(patch.hunk_ranges(3).length, 1);
		assert.deepEqual(
			patch.hunk_ranges(1).map((r) => patch.lines.slice(r.start, r.end)),
			pair.model.hunk_ranges(1).map((r) => pair.model.lines.slice(r.start, r.end))
		);
		assert.strictEqual(patch.hunk_ranges(1).length, 2);
		// a held run between the trimmed hunks can be expanded, and its rows revealed
		const segments = render_diff_segments(patch, { context_lines: 1, elide: 'expand' });
		const html = segments.map((s) => s.html).join('');
		assert.include(html, 'data-b-start="12" data-b-end="14"');
		assert.deepEqual(diff_expand_line_range(patch, 'b', 13, { context_lines: 1 }), {
			start: 12,
			end: 14
		});
		// the lines before the patch's first held line can't be
		assert.isNull(diff_expand_line_range(patch, 'b', 3, { context_lines: 1 }));
		// the lines it lacks stay in the value, as a full model's clamp keeps them
		assert.deepEqual(
			clamp_diff_expanded(patch, [{ start: 1, end: 99 }], 1),
			clamp_diff_expanded(pair.model, [{ start: 1, end: 99 }], 1)
		);
	});

	test('a larger context than the patch holds keeps its hunks', () => {
		const a = numbered(40);
		const pair = create_pair(a, a.replace('line 20\n', 'line twenty\n'), null);
		const patch = patch_of(pair, true, null);
		assert.deepEqual(patch.hunk_ranges(10), [{ start: 0, end: patch.lines.length }]);
		assert.deepEqual(patch.hunk_ranges(Infinity), patch.hunk_ranges(10));
		assert.deepEqual(patch.hunk_ranges(-1), patch.hunk_ranges(0));
		assert.strictEqual(patch.hunk_ranges(2), patch.hunk_ranges(2.5));
	});

	test('hunks whose lines touch are one hunk', () => {
		const a = numbered(20);
		const pair = create_pair(a, a.replace('line 10\n', 'line ten\n'), null);
		const [hunk] = pair.hunks;
		// split the hunk at its context line before the change
		const cut = 2;
		const first: DiffHunk = {
			a_start: 7,
			a_count: cut,
			b_start: 7,
			b_count: cut,
			lines: hunk!.lines.slice(0, cut)
		};
		const second: DiffHunk = {
			a_start: 7 + cut,
			a_count: hunk!.a_count - cut,
			b_start: 7 + cut,
			b_count: hunk!.b_count - cut,
			lines: hunk!.lines.slice(cut)
		};
		const patch = create_diff_patch_source([first, second], { b_line_count: 20 });
		assert.deepEqual(patch.hunk_ranges(3), [{ start: 0, end: hunk!.lines.length }]);
	});

	test('each run of hunks lexes on its own, so a construct left open stays in its hunk', () => {
		// a template literal opened in the first hunk and closed in the lines
		// between the hunks: whole-text lexing knows it closes, a snippet doesn't
		const a =
			[
				'const x = `open',
				...Array.from({ length: 10 }, (_, i) => `text ${i}`),
				'`;',
				...Array.from({ length: 10 }, (_, i) => `const v${i} = ${i};`)
			].join('\n') + '\n';
		const b = a
			.replace('const x = `open', 'const y = `open')
			.replace('const v9 = 9;', 'const v9 = 90;');
		const pair = create_pair(a, b, 'ts');
		const patch = patch_of(pair, true, 'ts');
		const last = patch.lines.length - 1;
		const index_in_model = pair.model.lines.indexOf(patch.lines[last]!);
		// the second hunk highlights as the whole text does, untouched by the first
		assert.strictEqual(patch.fragment(last, 'b'), pair.model.fragment(index_in_model, 'b'));
	});

	test('rows render by range as the model renders them', () => {
		const a = numbered(30);
		const pair = create_pair(a, a.replace('line 3\n', 'line three\n'), 'ts');
		const patch = patch_of(pair, true, 'ts');
		const [range] = pair.model.hunk_ranges(3);
		for (const render of [render_diff_unified_rows_html, render_diff_split_rows_html]) {
			assert.strictEqual(
				render(patch, 0, patch.lines.length),
				render(pair.model, range!.start, range!.end)
			);
		}
	});

	test('partner and fragment check their index and side', () => {
		const a = numbered(10);
		const pair = create_pair(a, a.replace('line 3\n', 'line three\n'), null);
		const patch = patch_of(pair, true, null);
		assert.throws(() => patch.partner(-1), RangeError);
		assert.throws(() => patch.partner(patch.lines.length), RangeError);
		assert.throws(() => patch.fragment(1.5, 'a'), RangeError);
		const add = patch.lines.findIndex((l) => l.type === 'add');
		assert.throws(() => patch.fragment(add, 'a'), /has no a line/);
	});

	describe('throws on malformed hunks', () => {
		const a = numbered(30);
		const pair = create_pair(
			a,
			a.replace('line 5\n', 'line five\n').replace('line 25\n', 'line 25!\n'),
			null
		);
		const [h0, h1] = pair.hunks as [DiffHunk, DiffHunk];
		const line = (
			type: DiffLine['type'],
			a_line: number | null,
			b_line: number | null,
			text = 'x'
		): DiffLine => ({
			type,
			text,
			a_line,
			b_line
		});
		const malformed: Array<[string, Array<DiffHunk>, RegExp]> = [
			['out of order', [h1, h0], /out of order/],
			['overlapping', [h0, { ...h0 }], /out of order/],
			['no lines', [{ a_start: 1, a_count: 0, b_start: 1, b_count: 0, lines: [] }], /no lines/],
			['a fractional start', [{ ...h0, a_start: 1.5 }], /whole number/],
			['counts short of the lines', [{ ...h0, a_count: h0.a_count - 1 }], /match its counts/],
			[
				'a header off from its lines',
				[{ ...h0, a_start: h0.a_start + 1, b_start: h0.b_start + 1 }],
				/expected a line/
			],
			[
				'unequal gaps between hunks',
				[
					h0,
					{
						...h1,
						a_start: h1.a_start + 1,
						lines: h1.lines.map((l) => ({ ...l, a_line: l.a_line === null ? null : l.a_line + 1 }))
					}
				],
				/differ in number/
			],
			[
				'an unknown type',
				[
					{
						a_start: 1,
						a_count: 1,
						b_start: 1,
						b_count: 1,
						lines: [{ ...line('same', 1, 1), type: 'moved' as any }]
					}
				],
				/unknown type/
			],
			[
				'an added line with an a number',
				[{ a_start: 1, a_count: 1, b_start: 1, b_count: 1, lines: [line('add', 1, 1)] }],
				/a line disagrees/
			],
			[
				'a removed line with a b number',
				[{ a_start: 1, a_count: 1, b_start: 1, b_count: 1, lines: [line('remove', 1, 1)] }],
				/b line disagrees/
			],
			[
				'text with a newline',
				[{ a_start: 1, a_count: 1, b_start: 1, b_count: 1, lines: [line('same', 1, 1, 'x\ny')] }],
				/not one line/
			],
			[
				'an empty line without a newline',
				[
					{
						a_start: 1,
						a_count: 1,
						b_start: 1,
						b_count: 1,
						lines: [{ ...line('same', 1, 1, ''), no_newline: true }]
					}
				],
				/empty line/
			],
			[
				'a line after the final one',
				[
					{
						a_start: 1,
						a_count: 2,
						b_start: 1,
						b_count: 2,
						lines: [{ ...line('same', 1, 1), no_newline: true }, line('same', 2, 2)]
					}
				],
				/final line/
			],
			[
				'a hunk after the final line',
				[
					{
						a_start: 1,
						a_count: 1,
						b_start: 1,
						b_count: 1,
						lines: [{ ...line('same', 1, 1), no_newline: true }]
					},
					{ a_start: 3, a_count: 1, b_start: 3, b_count: 1, lines: [line('same', 3, 3)] }
				],
				/final line/
			]
		];
		for (const [label, hunks, pattern] of malformed) {
			test(label, () => {
				assert.throws(() => create_diff_patch_source(hunks), pattern);
			});
		}
		test('a line count short of the hunks, or disagreeing with the other side', () => {
			assert.throws(
				() => create_diff_patch_source(pair.hunks, { b_line_count: 20 }),
				/reach b line/
			);
			assert.throws(
				() => create_diff_patch_source(pair.hunks, { a_line_count: 1.5 }),
				/a_line_count/
			);
			assert.throws(
				() => create_diff_patch_source(pair.hunks, { a_line_count: 30, b_line_count: 31 }),
				/b_line_count 31: it leaves 3 lines after the last hunk, not 2/
			);
			assert.strictEqual(
				create_diff_patch_source(pair.hunks, { a_line_count: 30, b_line_count: 30 }).b_line_count,
				30
			);
		});
	});
});

/**
 * Real `git diff` patches of the texts in `src/test/fixtures/patch/{case}/`,
 * written in each case's directory by
 *
 * ```sh
 * git diff --no-index --no-color --no-ext-diff --no-textconv --diff-algorithm=histogram \
 *   --indent-heuristic -U<n> a.<ext> b.<ext> > U<n>.diff
 * ```
 *
 * for `n` of 3 (git's default) and 0. The `-U0` patch gives the edits, which
 * fill out to git's whole diff for the full model.
 */
const PATCH_FIXTURES = 'src/test/fixtures/patch';

/**
 * Reads one file's hunks from `git diff` output — the subset of fuz_util's
 * patch parser these fixtures need, kept here so the tests don't depend on
 * it.
 */
const read_patch = (text: string): Array<DiffHunk> => {
	const hunks: Array<DiffHunk> = [];
	let hunk: DiffHunk | null = null;
	let a_next = 0;
	let b_next = 0;
	for (const row of text.split('\n')) {
		const header = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(row);
		if (header) {
			const [a_start, a_count, b_start, b_count] = [1, 2, 3, 4].map((i) =>
				header[i] === undefined ? 1 : Number(header[i])
			) as [number, number, number, number];
			hunk = { a_start, a_count, b_start, b_count, lines: [] };
			hunks.push(hunk);
			a_next = a_count > 0 ? a_start : a_start + 1;
			b_next = b_count > 0 ? b_start : b_start + 1;
		} else if (hunk && row !== '') {
			const text = row.slice(1);
			if (row[0] === ' ') {
				hunk.lines.push({ type: 'same', text, a_line: a_next++, b_line: b_next++ });
			} else if (row[0] === '-') {
				hunk.lines.push({ type: 'remove', text, a_line: a_next++, b_line: null });
			} else if (row[0] === '+') {
				hunk.lines.push({ type: 'add', text, a_line: null, b_line: b_next++ });
			} else if (row[0] === '\\') {
				hunk.lines[hunk.lines.length - 1]!.no_newline = true;
			}
		}
	}
	return hunks;
};

/**
 * The whole diff of `a` and `b` that the edits of a `-U0` patch make: its
 * hunks with the unchanged lines between them.
 */
const fill_lines = (a: string, b: string, edits: Array<DiffHunk>): Array<DiffLine> => {
	const a_lines = source_lines(a);
	const b_lines = source_lines(b);
	const lines: Array<DiffLine> = [];
	let a_next = 1;
	let b_next = 1;
	const same_until = (a_end: number): void => {
		while (a_next < a_end) {
			lines.push({ type: 'same', text: b_lines[b_next - 1]!, a_line: a_next++, b_line: b_next++ });
		}
	};
	for (const hunk of edits) {
		same_until(hunk.a_count > 0 ? hunk.a_start : hunk.a_start + 1);
		lines.push(...hunk.lines);
		a_next += hunk.a_count;
		b_next += hunk.b_count;
	}
	same_until(a_lines.length + 1);
	// a final unchanged line both texts end without a newline
	const last = lines[lines.length - 1];
	if (last?.type === 'same' && !a.endsWith('\n') && a !== '') last.no_newline = true;
	return lines;
};

describe('real git patches', () => {
	for (const name of readdirSync(PATCH_FIXTURES)) {
		const dir = join(PATCH_FIXTURES, name);
		const files = readdirSync(dir);
		const a_file = files.find((f) => f.startsWith('a.'))!;
		const ext = a_file.slice(2);
		const a = readFileSync(join(dir, a_file), 'utf8');
		const b = readFileSync(join(dir, `b.${ext}`), 'utf8');
		const lines = fill_lines(a, b, read_patch(readFileSync(join(dir, 'U0.diff'), 'utf8')));
		const model = create_diff_model(
			create_diff_side(a, { lang: ext }),
			create_diff_side(b, { lang: ext }),
			{ lines }
		);
		for (const patch_context of [3, 0]) {
			test(`${name} -U${patch_context}`, () => {
				const hunks = read_patch(readFileSync(join(dir, `U${patch_context}.diff`), 'utf8'));
				assert.isAbove(hunks.length, 0);
				assert_patch_matches_model(name, model, hunks, ext, patch_context);
			});
		}
	}

	test('-U3 proves the end of a file whose last change is near it', () => {
		const ends = (name: string, patch_context: number): number | null => {
			const dir = join(PATCH_FIXTURES, name);
			const hunks = read_patch(readFileSync(join(dir, `U${patch_context}.diff`), 'utf8'));
			return create_diff_patch_source(hunks, { patch_context }).b_line_count;
		};
		// the last change two lines from the end
		assert.strictEqual(
			ends('ts_edits', 3),
			source_lines(readFileSync(join(PATCH_FIXTURES, 'ts_edits/b.ts'), 'utf8')).length
		);
		assert.isNotNull(ends('md_edits', 3));
		// far from the end, and with no context nothing is proven
		assert.isNull(ends('ts_removals', 3));
		assert.isNull(ends('ts_edits', 0));
	});

	test('-U0 removals past the first line keep their elided lines in place', () => {
		const dir = join(PATCH_FIXTURES, 'ts_removals');
		const hunks = read_patch(readFileSync(join(dir, 'U0.diff'), 'utf8'));
		// both hunks remove lines and add none: no row holds a `b` line
		assert.ok(hunks.every((h) => h.b_count === 0));
		const patch = create_diff_patch_source(hunks, { b_line_count: 37 });
		assert.deepEqual(clamp_diff_expanded(patch, [{ start: 10, end: 17 }], 0), [
			{ start: 10, end: 17 }
		]);
		assert.strictEqual(patch.b_through(1), 10);
		assert.strictEqual(patch.b_through(2), 17);
		const counts = [
			...render_joined(patch, { context_lines: 0, elide: 'expand' }).matchAll(
				/diff_skip">([^<]*)</g
			)
		].map((m) => m[1]);
		assert.deepEqual(counts, ['10 unchanged lines', '7 unchanged lines', '20 unchanged lines']);
	});
});
