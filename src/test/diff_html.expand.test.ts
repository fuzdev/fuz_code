import { describe, test, assert } from 'vitest';

import {
	DIFF_EXPAND_STEP,
	clamp_diff_expanded,
	create_diff_model,
	create_diff_side,
	diff_expand_line_range,
	diff_expand_range,
	normalize_diff_expanded,
	render_diff_model_split_html,
	render_diff_model_unified_html,
	render_diff_segments,
	render_diff_split_rows_html,
	render_diff_unified_rows_html,
	type DiffModel,
	type DiffRowSource
} from '#lib/diff_html.ts';
import {
	assert_balanced,
	assert_split_diff_valid,
	assert_unified_diff_valid,
	walk_b_through
} from './html_test_helpers.ts';
import { discover_diff_cases } from './fixtures/helpers.ts';

const numbered = (count: number): string =>
	Array.from({ length: count }, (_, i) => `line ${i + 1}`).join('\n') + '\n';

// sixty lines, line 30 changed: at context 3 the leading region is lines
// 1-26 (rows 0-25) and the trailing one lines 34-60 (rows 34-60)
const SIXTY = numbered(60);
const SIXTY_B = SIXTY.replace('line 30\n', 'line thirty\n');

const create_model = (a: string, b: string): DiffModel =>
	create_diff_model(create_diff_side(a), create_diff_side(b));

interface CountRow {
	b_start: number;
	b_end: number;
	controls: Array<string>;
	labels: Array<string>;
	text: string;
}

/**
 * Parses the expand count rows of a render, in order.
 */
const count_rows = (html: string): Array<CountRow> =>
	[
		...html.matchAll(
			/<div class="diff_skip diff_expand" data-b-start="(\d+)" data-b-end="(\d+)">(.*?)<\/div>/g
		)
	].map((match) => ({
		b_start: Number(match[1]),
		b_end: Number(match[2]),
		controls: [...match[3]!.matchAll(/data-expand="(\w+)"/g)].map((m) => m[1]!),
		labels: [...match[3]!.matchAll(/aria-label="([^"]*)"/g)].map((m) => m[1]!),
		text: /<span class="diff_expand_count">([^<]*)<\/span>/.exec(match[3]!)![1]!
	}));

/**
 * The `b` numbers of a unified render's rows, in order.
 */
const b_numbers = (html: string): Array<number | null> =>
	[...html.matchAll(/class="diff_line [^"]*"(?: data-a="\d+")?(?: data-b="(\d+)")?/g)].map(
		(match) => (match[1] === undefined ? null : Number(match[1]))
	);

describe("elide: 'expand'", () => {
	const model = create_model(SIXTY, SIXTY_B);

	test('each region is a count row with its controls, and no rows', () => {
		const html = render_diff_model_unified_html(model, { elide: 'expand' });
		assert_balanced(html);
		assert.deepEqual(count_rows(html), [
			{
				b_start: 1,
				b_end: 26,
				// the file's start: nothing above to continue down from
				controls: ['up', 'all'],
				labels: ['Expand up: 20 lines', 'Expand all: 26 lines'],
				text: '26 unchanged lines'
			},
			{
				b_start: 34,
				b_end: 60,
				// the file's end: nothing below to continue up from
				controls: ['down', 'all'],
				labels: ['Expand down: 20 lines', 'Expand all: 27 lines'],
				text: '27 unchanged lines'
			}
		]);
		assert.deepEqual(b_numbers(html), [27, 28, 29, null, 30, 31, 32, 33]);
		assert.include(html, '<button type="button" class="diff_expand_up" data-expand="up"');
		assert.include(html, 'title="Expand up: 20 lines"');
	});

	test('a region between hunks offers both directions, and a small one only all', () => {
		const b = SIXTY.replace('line 10\n', 'line ten\n').replace('line 50\n', 'line fifty\n');
		const html = render_diff_model_unified_html(create_model(SIXTY, b), { elide: 'expand' });
		assert.deepEqual(
			count_rows(html).map((row) => [row.b_start, row.b_end, row.controls]),
			[
				[1, 6, ['all']],
				[14, 46, ['down', 'up', 'all']],
				[54, 60, ['all']]
			]
		);
	});

	test('expand_step sets how far a direction reveals and what counts as small', () => {
		const html = render_diff_model_unified_html(model, { elide: 'expand', expand_step: 5 });
		assert.deepEqual(count_rows(html)[0]!.labels, ['Expand up: 5 lines', 'Expand all: 26 lines']);
		const big = render_diff_model_unified_html(model, { elide: 'expand', expand_step: 30 });
		assert.deepEqual(
			count_rows(big).map((row) => row.controls),
			[['all'], ['all']]
		);
		// under 1 and NaN are the default
		for (const expand_step of [0, -3, NaN]) {
			const html_default = render_diff_model_unified_html(model, { elide: 'expand', expand_step });
			assert.deepEqual(count_rows(html_default)[0]!.labels[0], 'Expand up: 20 lines');
		}
	});

	test('expanded lines render as rows, splitting the count row around them', () => {
		const html = render_diff_model_unified_html(model, {
			elide: 'expand',
			expanded: [
				{ start: 5, end: 7 },
				{ start: 24, end: 30 },
				{ start: 58, end: 99 }
			]
		});
		assert_balanced(html);
		assert.deepEqual(
			count_rows(html).map((row) => [row.b_start, row.b_end, row.controls]),
			[
				[1, 4, ['all']],
				[8, 23, ['all']],
				[34, 57, ['down', 'up', 'all']]
			]
		);
		assert.deepEqual(b_numbers(html), [
			5,
			6,
			7,
			24,
			25,
			26,
			27,
			28,
			29,
			null,
			30,
			31,
			32,
			33,
			58,
			59,
			60
		]);
		// revealed rows carry their numbers on both sides and no hunk index
		assert.include(html, '<span class="diff_line diff_same" data-a="5" data-b="5">');
		assert.include(html, '<span class="diff_line diff_same" data-a="60" data-b="60">');
		assert.notInclude(html, 'data-b="5" data-hunk');
	});

	test('everything expanded renders as elide none does, in both views', () => {
		const everything = [{ start: 1, end: Infinity }];
		for (const context_lines of [0, 3]) {
			assert.strictEqual(
				render_diff_model_unified_html(model, {
					elide: 'expand',
					expanded: everything,
					context_lines
				}),
				render_diff_model_unified_html(model, { elide: 'none', context_lines })
			);
			assert.strictEqual(
				render_diff_model_split_html(model, {
					elide: 'expand',
					expanded: everything,
					context_lines
				}),
				render_diff_model_split_html(model, { elide: 'none', context_lines })
			);
		}
	});

	test('the split view puts revealed cells in the flat grid and count rows between them', () => {
		const html = render_diff_model_split_html(model, {
			elide: 'expand',
			expanded: [{ start: 25, end: 26 }]
		});
		assert_balanced(html);
		assert.notInclude(html, 'diff_split_rows');
		assert.isTrue(
			html.startsWith(
				'<div class="diff_skip diff_expand" data-b-start="1" data-b-end="24">' +
					'<button type="button" class="diff_expand_up"'
			)
		);
		assert.include(
			html,
			'</div><span class="diff_cell diff_same" data-a="25" data-b="25">' +
				'<span class="diff_gutter" aria-hidden="true">25</span>'
		);
		assert.include(
			html,
			render_diff_split_rows_html(model, 24, 26) + render_diff_split_rows_html(model, 26, 34)
		);
	});

	test('fixtures: every region expanded is elide none, with valid rows', async () => {
		for (const spec of await discover_diff_cases()) {
			const fixture_model = create_diff_model(
				create_diff_side(spec.a, { lang: spec.lang }),
				create_diff_side(spec.b, { lang: spec.lang })
			);
			const expanded = [{ start: 1, end: Infinity }];
			const unified = render_diff_model_unified_html(fixture_model, { elide: 'expand', expanded });
			assert.strictEqual(
				unified,
				render_diff_model_unified_html(fixture_model, { elide: 'none' }),
				spec.name
			);
			assert_unified_diff_valid(unified, spec.a, spec.b);
			const split = render_diff_model_split_html(fixture_model, { elide: 'expand', expanded });
			assert_split_diff_valid(split, spec.a, spec.b);
		}
	});
});

describe('render_diff_segments', () => {
	const model = create_model(SIXTY, SIXTY_B);
	const join = (segments: Array<{ html: string }>): string => segments.map((s) => s.html).join('');

	test('joins to the whole render in every elide mode and both views', async () => {
		const models = [model];
		for (const spec of await discover_diff_cases()) {
			models.push(
				create_diff_model(
					create_diff_side(spec.a, { lang: spec.lang }),
					create_diff_side(spec.b, { lang: spec.lang })
				)
			);
		}
		for (const m of models) {
			for (const elide of ['details', 'omit', 'expand', 'none'] as const) {
				for (const split of [false, true]) {
					const render = split ? render_diff_model_split_html : render_diff_model_unified_html;
					const options = { elide, expanded: [{ start: 2, end: 4 }] };
					assert.strictEqual(
						join(render_diff_segments(m, { ...options, split })),
						render(m, options)
					);
				}
			}
		}
	});

	test("'none' rows are the row renderer's, and 'omit' is hunks between count rows", () => {
		const len = model.lines.length;
		assert.strictEqual(
			render_diff_model_unified_html(model, { elide: 'none' }),
			render_diff_unified_rows_html(model, 0, len)
		);
		assert.strictEqual(
			render_diff_model_unified_html(model, { elide: 'omit' }),
			'<div class="diff_skip">26 unchanged lines</div>' +
				render_diff_unified_rows_html(model, 26, 34) +
				'<div class="diff_skip">27 unchanged lines</div>'
		);
	});

	test('segments are hunks, revealed rows, and hidden regions, keyed by rows', () => {
		const segments = render_diff_segments(model, {
			elide: 'expand',
			expanded: [{ start: 1, end: 3 }]
		});
		assert.deepEqual(
			segments.map((s) => [s.key, s.kind, s.start, s.end]),
			[
				['rows:0-3', 'rows', 0, 3],
				['elided:3-26', 'elided', 3, 26],
				['hunk:26-34', 'hunk', 26, 34],
				['elided:34-61', 'elided', 34, 61]
			]
		);
		assert.strictEqual(segments[0]!.html, render_diff_unified_rows_html(model, 0, 3));
	});

	test('a later render reuses unchanged segments and renders only the newly revealed rows', () => {
		const first = render_diff_segments(model, {
			elide: 'expand',
			expanded: [{ start: 34, end: 38 }]
		});
		const second = render_diff_segments(
			model,
			{ elide: 'expand', expanded: [{ start: 34, end: 45 }] },
			first
		);
		assert.deepEqual(
			second.map((s) => s.key),
			['elided:0-26', 'hunk:26-34', 'rows:34-39', 'rows:39-46', 'elided:46-61']
		);
		// the same objects, not re-rendered
		assert.strictEqual(second[0], first[0]);
		assert.strictEqual(second[1], first[1]);
		assert.strictEqual(second[2], first[2]);
		// and the cut keeps the join equal to a fresh render
		assert.strictEqual(
			join(second),
			render_diff_model_unified_html(model, { elide: 'expand', expanded: [{ start: 34, end: 45 }] })
		);
	});

	test('a source holding only hunks renders count rows with no controls', () => {
		const { source } = create_hunks_source(true);
		const html = render_diff_model_unified_html(source, {
			elide: 'expand',
			expanded: [{ start: 1, end: 99 }]
		});
		assert.deepEqual(count_rows(html), []);
		assert.include(html, '<div class="diff_skip">26 unchanged lines</div>');
	});
});

/**
 * A source holding only the hunks of `SIXTY` → `SIXTY_B` at context 3, as a
 * patch gives them; without `known_length` the trailing region's count is
 * unknown.
 */
const create_hunks_source = (known_length: boolean): { source: DiffRowSource } => {
	const model = create_model(SIXTY, SIXTY_B);
	const [hunk] = model.hunk_ranges(3);
	const lines = model.lines.slice(hunk!.start, hunk!.end);
	const source: DiffRowSource = {
		lines,
		width: model.width,
		hunk_ranges: () => [{ start: 0, end: lines.length }],
		elided_count: (start) => (start === 0 ? 26 : known_length ? 27 : null),
		partner: () => -1,
		fragment: (index, side) => {
			const line = lines[index]!;
			return (side === 'a' ? model.a : model.b).fragment(
				(side === 'a' ? line.a_line : line.b_line)!
			);
		},
		b_through: (index) => walk_b_through(lines, index),
		prepare: () => {}
	};
	return { source };
};

describe('normalize_diff_expanded', () => {
	test('sorts, merges overlapping and adjacent ranges, and drops empty ones', () => {
		assert.deepEqual(
			normalize_diff_expanded([
				{ start: 20, end: 25 },
				{ start: 1, end: 3 },
				{ start: 4, end: 6 },
				{ start: 22, end: 30 },
				{ start: 9, end: 8 },
				{ start: NaN, end: 5 },
				{ start: 40, end: 40 }
			]),
			[
				{ start: 1, end: 6 },
				{ start: 20, end: 30 },
				{ start: 40, end: 40 }
			]
		);
	});

	test('rounds inward, raises starts below 1, and leaves its input alone', () => {
		const input = [
			{ start: -5, end: 2.5 },
			{ start: 7.2, end: 7.9 }
		];
		assert.deepEqual(normalize_diff_expanded(input), [{ start: 1, end: 2 }]);
		assert.deepEqual(input[0], { start: -5, end: 2.5 });
		assert.deepEqual(normalize_diff_expanded([{ start: Infinity, end: Infinity }]), []);
	});

	test('caps an end past the largest safe integer, so the value survives JSON', () => {
		const normalized = normalize_diff_expanded([{ start: 3, end: Infinity }]);
		assert.deepEqual(normalized, [{ start: 3, end: Number.MAX_SAFE_INTEGER }]);
		assert.deepEqual(JSON.parse(JSON.stringify(normalized)), normalized);
	});
});

describe('clamp_diff_expanded', () => {
	const model = create_model(SIXTY, SIXTY_B);

	test('keeps the elided regions only, dropping hunk lines and lines past the end', () => {
		assert.deepEqual(
			clamp_diff_expanded(model, [
				{ start: 20, end: 40 },
				{ start: 55, end: 100 }
			]),
			[
				{ start: 20, end: 26 },
				{ start: 34, end: 40 },
				{ start: 55, end: 60 }
			]
		);
		assert.deepEqual(clamp_diff_expanded(model, [{ start: 27, end: 33 }]), []);
	});

	test('follows context_lines', () => {
		assert.deepEqual(clamp_diff_expanded(model, [{ start: 20, end: 40 }], 0), [
			{ start: 20, end: 29 },
			{ start: 31, end: 40 }
		]);
	});

	test('regions either side of a hunk with no b lines merge', () => {
		const removed = create_model(SIXTY, SIXTY.replace('line 30\n', ''));
		assert.deepEqual(clamp_diff_expanded(removed, [{ start: 1, end: 99 }], 0), [
			{ start: 1, end: 59 }
		]);
	});

	test('keeps regions a hunks-only source counts but lacks the rows of', () => {
		assert.deepEqual(
			clamp_diff_expanded(create_hunks_source(true).source, [
				{ start: 1, end: 3 },
				{ start: 30, end: 99 }
			]),
			[
				{ start: 1, end: 3 },
				{ start: 34, end: 60 }
			]
		);
		// past the last hunk with an unknown count, every line is kept
		assert.deepEqual(
			clamp_diff_expanded(create_hunks_source(false).source, [{ start: 30, end: 99 }]),
			[{ start: 34, end: 99 }]
		);
	});
});

describe('diff_expand_range', () => {
	test('down from the top, up from the bottom, or all, inside the region', () => {
		assert.deepEqual(diff_expand_range(10, 50, 'down'), { start: 10, end: 29 });
		assert.deepEqual(diff_expand_range(10, 50, 'up'), { start: 31, end: 50 });
		assert.deepEqual(diff_expand_range(10, 50, 'all'), { start: 10, end: 50 });
		assert.deepEqual(diff_expand_range(10, 15, 'down'), { start: 10, end: 15 });
		assert.deepEqual(diff_expand_range(10, 50, 'up', 5), { start: 46, end: 50 });
		assert.strictEqual(DIFF_EXPAND_STEP, 20);
	});
});

describe('diff_expand_line_range', () => {
	// three lines inserted at the top: b numbers are a numbers plus three
	const b = 'new 1\nnew 2\nnew 3\n' + SIXTY;
	const model = create_model(SIXTY, b);

	test('a window of expand_step lines centered on the line', () => {
		assert.deepEqual(diff_expand_line_range(model, 'b', 33), { start: 23, end: 42 });
		// side a maps through the region's rows
		assert.deepEqual(diff_expand_line_range(model, 'a', 30), { start: 23, end: 42 });
		assert.deepEqual(diff_expand_line_range(model, 'b', 33, { expand_step: 5 }), {
			start: 31,
			end: 35
		});
	});

	test('kept inside the region at its edges', () => {
		// the region is b lines 7-63
		assert.deepEqual(diff_expand_line_range(model, 'b', 8), { start: 7, end: 26 });
		assert.deepEqual(diff_expand_line_range(model, 'b', 63), { start: 44, end: 63 });
		const small = diff_expand_line_range(model, 'b', 10, { context_lines: 50 });
		assert.isNull(small);
	});

	test('null for a line that is not an integer', () => {
		assert.isNull(diff_expand_line_range(model, 'b', 33.5));
		assert.isNull(diff_expand_line_range(model, 'b', NaN));
		assert.isNull(diff_expand_line_range(model, 'b', Infinity));
	});

	test('null for a line in a hunk, out of range, or with no row', () => {
		assert.isNull(diff_expand_line_range(model, 'b', 2));
		assert.isNull(diff_expand_line_range(model, 'b', 99));
		assert.isNull(diff_expand_line_range(model, 'a', 0));
		assert.isNull(diff_expand_line_range(create_hunks_source(true).source, 'b', 5));
	});
});

describe('an unchanged file', () => {
	test('offers down from the top and up from the bottom, not only all', () => {
		const html = render_diff_model_unified_html(create_model(SIXTY, SIXTY), { elide: 'expand' });
		assert.deepEqual(count_rows(html), [
			{
				b_start: 1,
				b_end: 60,
				controls: ['down', 'up', 'all'],
				labels: ['Expand down: 20 lines', 'Expand up: 20 lines', 'Expand all: 60 lines'],
				text: '60 unchanged lines'
			}
		]);
		const down = render_diff_model_unified_html(create_model(SIXTY, SIXTY), {
			elide: 'expand',
			expanded: [diff_expand_range(1, 60, 'down')]
		});
		assert.deepEqual(b_numbers(down), range(1, 20));
		assert.deepEqual(
			count_rows(down).map((row) => [row.b_start, row.b_end, row.controls]),
			[[21, 60, ['down', 'all']]]
		);
	});
});

const range = (start: number, end: number): Array<number> =>
	Array.from({ length: end - start + 1 }, (_, i) => start + i);

/**
 * A source holding the rows of `SIXTY` → `SIXTY_B` except `b` lines 10-20,
 * inside the leading region: a region with rows that lacks some of its
 * lines.
 */
const create_partial_source = (): DiffRowSource => {
	const model = create_model(SIXTY, SIXTY_B);
	const keep = model.lines
		.map((_, i) => i)
		.filter((i) => {
			const b = model.lines[i]!.b_line;
			return b === null || b < 10 || b > 20;
		});
	const index_of = new Map(keep.map((original, i) => [original, i]));
	const lines = keep.map((i) => model.lines[i]!);
	return {
		lines,
		width: model.width,
		hunk_ranges: (context_lines) =>
			model.hunk_ranges(context_lines).map((hunk) => ({
				start: index_of.get(hunk.start)!,
				end: index_of.get(hunk.end - 1)! + 1
			})),
		elided_count: (start, end) => {
			let before = 0;
			for (let i = start - 1; i >= 0; i--) {
				if (lines[i]!.b_line !== null) {
					before = lines[i]!.b_line!;
					break;
				}
			}
			const after = end < lines.length ? lines[end]!.b_line! : 61;
			return after - before - 1;
		},
		partner: (i) => {
			const partner = model.partner(keep[i]!);
			return partner === -1 ? -1 : index_of.get(partner)!;
		},
		fragment: (i, side, intraline) => model.fragment(keep[i]!, side, intraline),
		b_through: (index) => walk_b_through(lines, index),
		prepare: () => {}
	};
};

describe('a source lacking some lines of a region with rows', () => {
	const source = create_partial_source();
	const plain_count = (count: number): string =>
		`<div class="diff_skip">${count} unchanged lines</div>`;

	test("'expand' splits the region into its runs, counting the lines between", () => {
		const segments = render_diff_segments(source, {
			elide: 'expand',
			expanded: [{ start: 15, end: 26 }]
		});
		assert.deepEqual(
			segments.map((s) => s.key),
			['elided:0-9', 'elided:9-9', 'rows:9-15', 'hunk:15-23', 'elided:23-50']
		);
		const html = segments.map((s) => s.html).join('');
		assert_balanced(html);
		assert.deepEqual(b_numbers(html), [...range(21, 29), null, ...range(30, 33)]);
		assert.include(segments[1]!.html, plain_count(11));
		assert.deepEqual(
			count_rows(html).map((row) => [row.b_start, row.b_end, row.controls]),
			[
				[1, 9, ['all']],
				[34, 60, ['down', 'all']]
			]
		);
		// the lacking lines stay in the value, for a source that has them
		assert.deepEqual(clamp_diff_expanded(source, [{ start: 15, end: 26 }]), [
			{ start: 15, end: 26 }
		]);
		assert.deepEqual(diff_expand_line_range(source, 'a', 22), { start: 21, end: 26 });
		assert.isNull(diff_expand_line_range(source, 'b', 15));
	});

	test("'details' and 'none' render each run, and 'omit' counts the region", () => {
		const details = render_diff_model_unified_html(source, { elide: 'details' });
		assert_balanced(details);
		assert.include(details, '<details class="diff_skip"><summary>9 unchanged lines</summary>');
		assert.include(details, '</details>' + plain_count(11) + '<details class="diff_skip">');
		assert.include(details, '<summary>6 unchanged lines</summary>');
		const none = render_diff_model_unified_html(source, { elide: 'none' });
		assert.deepEqual(b_numbers(none), [...range(1, 9), ...range(21, 29), null, ...range(30, 60)]);
		assert.include(none, `data-b="9">`);
		assert.include(none, plain_count(11));
		const omit = render_diff_model_unified_html(source, { elide: 'omit' });
		assert.isTrue(omit.startsWith(plain_count(26)));
		for (const split of [false, true]) {
			for (const elide of ['details', 'omit', 'expand', 'none'] as const) {
				const html = render_diff_segments(source, {
					elide,
					split,
					expanded: [{ start: 1, end: 99 }]
				})
					.map((s) => s.html)
					.join('');
				assert_balanced(html);
				// every row once, in order (a split context line's two cells share one)
				const numbers = [
					...html.matchAll(/class="diff_(?:line|cell) [^"]*"(?: data-a="\d+")? data-b="(\d+)"/g)
				]
					.map((match) => Number(match[1]))
					.filter((n, i, all) => !split || n !== all[i - 1]);
				assert.strictEqual(numbers.length, elide === 'omit' ? 7 : 49);
				assert.deepEqual(
					numbers,
					[...numbers].sort((x, y) => x - y)
				);
				assert.strictEqual(new Set(numbers).size, numbers.length);
			}
		}
	});
});
