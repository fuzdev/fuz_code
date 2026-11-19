import { describe, test, assert, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { diff_lines, type DiffLine } from '@fuzdev/fuz_util/diff.ts';

import {
	create_diff_model,
	create_diff_side,
	render_diff_model_split_html,
	render_diff_model_unified_html,
	render_diff_split_html,
	render_diff_split_rows_html,
	render_diff_unified_html,
	render_diff_unified_rows_html,
	apply_diff_highlight,
	type DiffHighlightRow,
	type DiffModel,
	type DiffRowSource
} from '#lib/diff_html.ts';
import { render_syntax_html_lines } from '#lib/lexer.ts';
import { SyntaxStyler } from '#lib/syntax_styler.ts';
import { syntax_styler_global } from '#lib/syntax_styler_global.ts';
import {
	create_random,
	assert_balanced,
	assert_split_diff_valid,
	assert_unified_diff_valid,
	parse_diff_rows,
	walk_b_through
} from './html_test_helpers.ts';
import { discover_diff_cases, get_diff_fixture_path } from './fixtures/helpers.ts';

const A = 'const a = 1;\nconst b = 2;\nconst c = 3;\n';
const B = 'const a = 1;\nconst b = 20;\nconst c = 3;\n';

// lines 1-8 and 13-20 elide around changes at lines 10 and 11 at context 0
const LONG_A = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join('\n') + '\n';
const LONG_B = LONG_A.replace('line 10\n', 'line ten\n').replace('line 11\n', '');

const create_model = (a: string, b: string, lang: string | null = 'ts'): DiffModel =>
	create_diff_model(create_diff_side(a, { lang }), create_diff_side(b, { lang }));

describe('create_diff_side', () => {
	test('fragments equal the whole-document render, line by line', () => {
		const text = 'const s = `one\ntwo ${x}\nthree`;\n/* a\nb */\n';
		const side = create_diff_side(text, { lang: 'ts' });
		const expected = render_syntax_html_lines(syntax_styler_global.lex(text, 'ts'));
		assert.strictEqual(side.line_count, expected.length);
		for (let line = side.line_count; line >= 1; line--) {
			assert.strictEqual(side.fragment(line), expected[line - 1]);
		}
	});

	test('owns its lex, unaffected by later lexes', () => {
		const side = create_diff_side('const a = `x\ny`;\n', { lang: 'ts' });
		syntax_styler_global.lex('# heading\n\n- item\n'.repeat(50), 'md');
		assert.include(side.fragment(2), 'token_string');
		assert.strictEqual(side.lexed.events.length, side.lexed.events_len);
	});

	test('render_fragments wraps marks on the lines asked for', () => {
		const side = create_diff_side('ab\ncd\n', { lang: null });
		assert.deepEqual(side.render_fragments(2, 2, [{ start: 4, end: 5 }]), ['c<mark>d</mark>']);
		assert.strictEqual(side.fragment(2), 'cd');
	});

	test('line_start is 1-based', () => {
		const side = create_diff_side('ab\ncd\n');
		assert.strictEqual(side.line_start(1), 0);
		assert.strictEqual(side.line_start(2), 3);
		assert.strictEqual(side.line_start(3), 6);
	});

	test('an unregistered lang renders plain, keeping the id', () => {
		const side = create_diff_side('const a = 1;', { lang: 'nope' });
		assert.strictEqual(side.lang, 'nope');
		assert.strictEqual(side.fragment(1), 'const a = 1;');
	});
});

describe('create_diff_model', () => {
	test('a side reused across models lexes once', () => {
		const syntax_styler = new SyntaxStyler();
		for (const lang of syntax_styler_global.langs.values()) syntax_styler.add_lang(lang);
		const lex = vi.spyOn(syntax_styler, 'lex');
		const base = create_diff_side(A, { lang: 'ts', syntax_styler });
		const versions = [B, A.replace('3', '30'), A + 'const d = 4;\n'].map((text) =>
			create_diff_side(text, { lang: 'ts', syntax_styler })
		);
		assert.strictEqual(lex.mock.calls.length, 4);
		for (const version of versions) {
			const model = create_diff_model(base, version);
			render_diff_model_unified_html(model);
			render_diff_model_split_html(model);
			render_diff_model_unified_html(create_diff_model(version, base));
		}
		assert.strictEqual(lex.mock.calls.length, 4);
	});

	test('sides warmed by another model render the generated fixtures', async () => {
		const syntax_styler = new SyntaxStyler();
		for (const lang of syntax_styler_global.langs.values()) syntax_styler.add_lang(lang);
		const lex = vi.spyOn(syntax_styler, 'lex');
		for (const spec of await discover_diff_cases()) {
			const a = create_diff_side(spec.a, { lang: spec.lang, syntax_styler });
			const b = create_diff_side(spec.b, { lang: spec.lang, syntax_styler });
			// the reverse diff fills both sides' fragment caches first
			const reverse = create_diff_model(b, a);
			render_diff_model_unified_html(reverse, { elide: 'none' });
			render_diff_model_split_html(reverse, { elide: 'none' });
			const model = create_diff_model(a, b);
			assert.strictEqual(
				render_diff_model_unified_html(model),
				readFileSync(get_diff_fixture_path(spec.name, 'html'), 'utf8'),
				spec.name
			);
			assert.strictEqual(
				render_diff_model_split_html(model),
				readFileSync(get_diff_fixture_path(spec.name, 'split.html'), 'utf8'),
				spec.name
			);
		}
		assert.strictEqual(lex.mock.calls.length, 2 * (await discover_diff_cases()).length);
	});

	test('computes lines with diff_lines when none are supplied', () => {
		const model = create_model(A, B);
		assert.deepEqual(model.lines, diff_lines(A, B));
	});

	test('max_cost reaches diff_lines', () => {
		const a = create_diff_side(LONG_A);
		const b = create_diff_side(LONG_B);
		assert.deepEqual(
			create_diff_model(a, b, { max_cost: 1 }).lines,
			diff_lines(LONG_A, LONG_B, { max_cost: 1 })
		);
	});

	test('gutter width fits the larger side', () => {
		assert.strictEqual(create_model(A, B).width, 1);
		assert.strictEqual(create_model(LONG_A, LONG_B).width, 2);
	});

	describe('supplied lines', () => {
		test('render the same as computed lines when equal', async () => {
			for (const spec of await discover_diff_cases()) {
				const a = create_diff_side(spec.a, { lang: spec.lang });
				const b = create_diff_side(spec.b, { lang: spec.lang });
				const computed = create_diff_model(a, b);
				const supplied = create_diff_model(a, b, {
					lines: diff_lines(spec.a, spec.b).map((line) => ({ ...line }))
				});
				for (const options of [{}, { elide: 'none' as const, context_lines: 0 }]) {
					assert.strictEqual(
						render_diff_model_unified_html(supplied, options),
						render_diff_model_unified_html(computed, options),
						spec.name
					);
					assert.strictEqual(
						render_diff_model_split_html(supplied, options),
						render_diff_model_split_html(computed, options),
						spec.name
					);
				}
			}
		});

		test('lines that differ from what diff_lines finds render as given', () => {
			// a replace shown as remove-all then add-all, as a coarser diff would
			const a = 'x\nsame\ny\n';
			const b = 'x2\nsame\ny\n';
			const lines: Array<DiffLine> = [
				{ type: 'remove', text: 'x', a_line: 1, b_line: null },
				{ type: 'remove', text: 'same', a_line: 2, b_line: null },
				{ type: 'add', text: 'x2', a_line: null, b_line: 1 },
				{ type: 'add', text: 'same', a_line: null, b_line: 2 },
				{ type: 'same', text: 'y', a_line: 3, b_line: 3 }
			];
			const model = create_diff_model(create_diff_side(a), create_diff_side(b), { lines });
			const html = render_diff_model_unified_html(model, { elide: 'none' });
			assert_unified_diff_valid(html, a, b);
			assert.deepEqual(
				parse_diff_rows(html).map((r) => r.type),
				['remove', 'remove', 'add', 'add', 'same']
			);
			// `same` pairs with `same`, `x` with `x2`
			assert.strictEqual(model.partner(0), 2);
			assert.strictEqual(model.partner(1), 3);
			assert.strictEqual(model.partner(3), 1);
			assert.strictEqual(model.partner(4), -1);
		});

		const throws = (lines: Array<DiffLine>, pattern: RegExp): void => {
			assert.throws(
				() => create_diff_model(create_diff_side('a\nb\n'), create_diff_side('a\nc\n'), { lines }),
				pattern
			);
		};

		const same = (a_line: any, b_line: any): DiffLine => ({
			type: 'same',
			text: 'a',
			a_line,
			b_line
		});
		const remove = (a_line: any): DiffLine => ({ type: 'remove', text: 'b', a_line, b_line: null });
		const add = (b_line: any): DiffLine => ({ type: 'add', text: 'c', a_line: null, b_line });

		test('a valid numbering is accepted', () => {
			create_diff_model(create_diff_side('a\nb\n'), create_diff_side('a\nc\n'), {
				lines: [same(1, 1), remove(2), add(2)]
			});
		});

		test('a line number past its side throws', () => {
			throws([same(1, 1), remove(2), remove(3), add(2)], /number 3 of the a side's 2 lines/);
			throws([same(1, 1), remove(2), add(2), add(3)], /number 3 of the b side's 2 lines/);
		});

		test('numbers out of order, repeated, or skipped throw', () => {
			throws([same(2, 2), same(1, 1)], /index 0.*expected a line 1/);
			throws([same(1, 1), same(1, 2)], /index 1.*expected a line 2/);
			// a `-U0` patch's hunks leave gaps: that input isn't a model's
			throws([remove(2), add(2)], /index 0.*expected a line 1/);
		});

		test('lines stopping short of a side throw', () => {
			throws([same(1, 1)], /number 1 of the a side's 2 lines/);
			throws([same(1, 1), remove(2)], /number 1 of the b side's 2 lines/);
			throws([], /number 0 of the a side's 2 lines/);
		});

		test('no line counts after a trailing newline, and none for an empty text', () => {
			assert.strictEqual(create_diff_side('a\nb\n').diff_line_count, 2);
			assert.strictEqual(create_diff_side('a\nb').diff_line_count, 2);
			assert.strictEqual(create_diff_side('\n').diff_line_count, 1);
			assert.strictEqual(create_diff_side('').diff_line_count, 0);
			create_diff_model(create_diff_side(''), create_diff_side(''), { lines: [] });
		});

		test('non-integer numbers throw', () => {
			throws([same(1, 1), remove(1.5), add(2)], /index 1/);
			throws([same('1', 1), remove(2), add(2)], /index 0/);
			throws([same(1, 1), remove(2), add(NaN)], /index 2/);
		});

		test('a number on a side its type lacks, or an unknown type, throws', () => {
			throws([{ type: 'add', text: 'a', a_line: 1, b_line: 1 }], /added line's a_line isn't null/);
			throws(
				[{ type: 'remove', text: 'a', a_line: 1, b_line: 1 }],
				/removed line's b_line isn't null/
			);
			throws(
				[{ type: 'remove', text: 'a', a_line: 1, b_line: undefined as any }],
				/removed line's b_line isn't null/
			);
			throws([{ type: 'same', text: 'a', a_line: null, b_line: 1 }], /missing its a line/);
			throws([{ type: 'same', text: 'a', a_line: 1, b_line: null }], /missing its b line/);
			throws([{ type: 'moved' as any, text: 'a', a_line: 1, b_line: 1 }], /unknown type/);
		});
	});

	test('hunk_ranges index the lines, cached per count and frozen', () => {
		const model = create_model(LONG_A, LONG_B, null);
		const ranges = model.hunk_ranges(0);
		assert.deepEqual(ranges, [{ start: 9, end: 12 }]);
		assert.isTrue(Object.isFrozen(ranges));
		assert.isTrue(Object.isFrozen(ranges[0]));
		assert.strictEqual(model.hunk_ranges(0), ranges);
		assert.strictEqual(model.hunk_ranges(-1), ranges);
		assert.deepEqual(model.hunk_ranges(Infinity), [{ start: 0, end: model.lines.length }]);
		assert.deepEqual(create_model(A, A).hunk_ranges(), []);
	});

	test('out-of-range rows and lines throw RangeErrors', () => {
		const model = create_model(A, B);
		const removed = model.lines.findIndex((line) => line.type === 'remove');
		assert.throws(() => model.fragment(removed, 'b'), RangeError);
		assert.throws(() => model.fragment(-1, 'a'), RangeError);
		assert.throws(() => model.fragment(model.lines.length, 'b'), RangeError);
		assert.throws(() => model.partner(model.lines.length), RangeError);
		assert.throws(() => model.partner(0.5), RangeError);
		const side = create_diff_side('ab\ncd\n');
		assert.throws(() => side.fragment(0), RangeError);
		assert.throws(() => side.fragment(4), RangeError);
		assert.throws(() => side.line_start(4), RangeError);
		assert.throws(() => side.line_start(1.5), RangeError);
	});

	test('elided_count counts from line numbers', () => {
		const model = create_model(LONG_A, LONG_B, null);
		assert.strictEqual(model.elided_count(0, 9), 9);
		assert.strictEqual(model.elided_count(12, model.lines.length), 9);
		assert.strictEqual(model.elided_count(12, 12), 0);
	});
});

describe('row identity', () => {
	test('unified rows carry their line numbers and hunk', () => {
		const model = create_model(LONG_A, LONG_B, null);
		const html = render_diff_model_unified_html(model, { context_lines: 1, elide: 'none' });
		assert_unified_diff_valid(html, LONG_A, LONG_B);
		const rows = parse_diff_rows(html);
		assert.deepEqual(
			rows.slice(7, 14).map((r) => [r.type, r.data_a, r.data_b, r.data_hunk]),
			[
				['same', 8, 8, null],
				['same', 9, 9, 0],
				['remove', 10, null, 0],
				['remove', 11, null, 0],
				['add', null, 10, 0],
				['same', 12, 11, 0],
				['same', 13, 12, null]
			]
		);
	});

	test('each hunk has its own index', () => {
		const b = LONG_A.replace('line 2\n', 'line two\n').replace('line 19\n', 'line nineteen\n');
		const html = render_diff_unified_html(LONG_A, b, { context_lines: 0, elide: 'omit' });
		assert.deepEqual(
			parse_diff_rows(html).map((r) => r.data_hunk),
			[0, 0, 1, 1]
		);
	});

	test('elided rows have line numbers and no hunk', () => {
		const html = render_diff_unified_html(LONG_A, LONG_B, { context_lines: 0 });
		const rows = parse_diff_rows(html);
		assert.strictEqual(rows[0]!.data_a, 1);
		assert.strictEqual(rows[0]!.data_b, 1);
		assert.isNull(rows[0]!.data_hunk);
		assert.include(html, '<details class="diff_skip"><summary>9 unchanged lines</summary><span');
	});

	test('split cells carry their line numbers, a context line its two numbers on both cells', () => {
		const model = create_model(LONG_A, LONG_B, null);
		const html = render_diff_model_split_html(model, { context_lines: 1, elide: 'none' });
		assert_split_diff_valid(html, LONG_A, LONG_B);
		const cells = parse_diff_rows(html);
		assert.deepEqual(
			cells.slice(16, 24).map((c) => [c.type, c.data_a, c.data_b, c.data_hunk]),
			[
				['same', 9, 9, 0],
				['same', 9, 9, 0],
				['remove', 10, null, 0],
				['add', null, 10, 0],
				['remove', 11, null, 0],
				['spacer', null, null, 0],
				['same', 12, 11, 0],
				['same', 12, 11, 0]
			]
		);
	});

	test('no-newline rows keep their numbers and marker', () => {
		for (const render of [render_diff_unified_html, render_diff_split_html]) {
			const rows = parse_diff_rows(render('a\nx', 'a\ny', { lang: null }));
			const last_remove = rows.findLast((r) => r.type === 'remove')!;
			const last_add = rows.findLast((r) => r.type === 'add')!;
			assert.isTrue(last_remove.no_newline);
			assert.strictEqual(last_remove.data_a, 2);
			assert.isTrue(last_add.no_newline);
			assert.strictEqual(last_add.data_b, 2);
		}
	});
});

describe('row ranges', () => {
	test('unified rows compose: any cut renders the same rows', () => {
		const model = create_model(LONG_A, LONG_B, null);
		const n = model.lines.length;
		const whole = render_diff_unified_rows_html(model, 0, n);
		assert.strictEqual(whole, render_diff_model_unified_html(model, { elide: 'none' }));
		for (let cut = 0; cut <= n; cut++) {
			assert.strictEqual(
				render_diff_unified_rows_html(model, 0, cut) + render_diff_unified_rows_html(model, cut, n),
				whole
			);
		}
	});

	test('the whole-document render is hunk ranges plus elided ranges', async () => {
		for (const spec of await discover_diff_cases()) {
			const model = create_model(spec.a, spec.b, spec.lang);
			for (const [split, render_rows] of [
				[false, render_diff_unified_rows_html],
				[true, render_diff_split_rows_html]
			] as const) {
				let out = '';
				let cursor = 0;
				for (const { start, end } of model.hunk_ranges(1)) {
					out += render_rows(model, cursor, start, { context_lines: 1 });
					out += render_rows(model, start, end, { context_lines: 1 });
					cursor = end;
				}
				out += render_rows(model, cursor, model.lines.length, { context_lines: 1 });
				const render = split ? render_diff_model_split_html : render_diff_model_unified_html;
				assert.strictEqual(out, render(model, { context_lines: 1, elide: 'none' }), spec.name);
			}
		}
	});

	test('a range is clamped to the lines', () => {
		const model = create_model(A, B);
		const n = model.lines.length;
		assert.strictEqual(
			render_diff_unified_rows_html(model, -3, n + 5),
			render_diff_unified_rows_html(model, 0, n)
		);
		assert.strictEqual(render_diff_split_rows_html(model, 2, 1), '');
	});

	test('a split range cutting a change lays out its part as a change', () => {
		const a = 'keep\nalpha one\nbeta two\n';
		const b = 'keep\nalpha uno\nbeta two!\n';
		const model = create_model(a, b, null);
		// removes at 1-2, adds at 3-4, each pairing with the line it became
		assert.strictEqual(model.partner(1), 3);
		assert.strictEqual(model.partner(2), 4);
		const html = render_diff_split_rows_html(model, 0, 4);
		assert_balanced(html);
		assert.deepEqual(
			parse_diff_rows(html).map((c) => `${c.type}:${c.text}`),
			['same:keep', 'same:keep', 'remove:alpha one', 'add:alpha uno', 'remove:beta two', 'spacer:']
		);
	});

	test('rendering a range renders only its lines', () => {
		const a = create_diff_side(LONG_A);
		const b = create_diff_side(LONG_B);
		const model = create_diff_model(a, b);
		const fragment_a = vi.spyOn(a, 'prepare_fragments');
		const fragment_b = vi.spyOn(b, 'prepare_fragments');
		const [hunk] = model.hunk_ranges(0);
		render_diff_unified_rows_html(model, hunk!.start, hunk!.end, { context_lines: 0 });
		assert.deepEqual(fragment_a.mock.calls, [[10, 11]]);
		assert.deepEqual(fragment_b.mock.calls, [[10, 10]]);
	});
});

describe('highlight', () => {
	test('marks the rows of each side range, context through either side', () => {
		const html = render_diff_unified_html(LONG_A, LONG_B, {
			lang: null,
			elide: 'none',
			highlight: [
				{ side: 'a', start: 10, end: 11 },
				{ side: 'b', start: 12 }
			]
		});
		assert_unified_diff_valid(html, LONG_A, LONG_B);
		assert.deepEqual(
			parse_diff_rows(html)
				.filter((r) => r.highlighted)
				.map((r) => [r.type, r.data_a, r.data_b]),
			[
				['remove', 10, null],
				['remove', 11, null],
				['same', 13, 12]
			]
		);
		assert.include(html, '<del class="diff_line diff_remove diff_highlight" data-a="10"');
	});

	test('split cells of a highlighted line all get the class', () => {
		const html = render_diff_split_html(LONG_A, LONG_B, {
			lang: null,
			elide: 'none',
			highlight: [
				{ side: 'b', start: 10 },
				{ side: 'a', start: 1 }
			]
		});
		assert_split_diff_valid(html, LONG_A, LONG_B);
		assert.deepEqual(
			parse_diff_rows(html)
				.filter((c) => c.highlighted)
				.map((c) => [c.type, c.data_a, c.data_b]),
			[
				['same', 1, 1],
				['same', 1, 1],
				['add', null, 10]
			]
		);
	});

	test('no highlight, or an empty one, adds nothing', () => {
		const plain = render_diff_unified_html(A, B);
		assert.strictEqual(render_diff_unified_html(A, B, { highlight: [] }), plain);
		assert.notInclude(plain, 'diff_highlight');
		assert.notInclude(
			render_diff_unified_html(A, B, { highlight: [{ side: 'a', start: 99 }] }),
			'diff_highlight'
		);
	});
});

describe('lazy pairing', () => {
	const LINES = Array.from(
		{ length: 40 },
		(_, i) => `const value_${i} = compute(${i}, 'item ${i}');`
	);

	test('pairs and emphasizes the same in any order of first use', () => {
		const random = create_random(5);
		const a = LINES.join('\n') + '\n';
		const b =
			LINES.map((line, i) => (i % 3 === 0 ? line.replace('compute', 'calc') : line))
				.filter((_, i) => i % 7 !== 3)
				.join('\n') + '\n';
		const sequential = create_model(a, b);
		const shuffled = create_model(a, b);
		const order = sequential.lines.map((_, i) => i).sort(() => random() - 0.5);
		const partners: Array<number> = [];
		for (const i of order) partners[i] = shuffled.partner(i);
		assert.deepEqual(
			partners,
			sequential.lines.map((_, i) => sequential.partner(i))
		);
		for (const i of order) {
			const side = sequential.lines[i]!.type === 'remove' ? 'a' : 'b';
			assert.strictEqual(shuffled.fragment(i, side, true), sequential.fragment(i, side, true));
		}
	});

	test('split data-hunk agrees with hunk_ranges', () => {
		const a = LINES.join('\n') + '\n';
		const b = a.replace('value_5 ', 'value_five ').replace('value_30 ', 'value_thirty ');
		const model = create_model(a, b);
		const ranges = model.hunk_ranges(2);
		const cells = parse_diff_rows(
			render_diff_split_rows_html(model, 0, model.lines.length, { context_lines: 2 })
		);
		for (const cell of cells) {
			if (cell.type === 'spacer') continue;
			const index = model.lines.findIndex((line) =>
				cell.data_a === null ? line.b_line === cell.data_b : line.a_line === cell.data_a
			);
			const hunk = ranges.findIndex((range) => range.start <= index && index < range.end);
			assert.strictEqual(cell.data_hunk ?? -1, hunk, `line index ${index}`);
		}
	});
});

describe('DiffRowSource', () => {
	// a source holding only the rows of a full model's hunks, as a patch-only
	// source would: no rows for the unchanged lines between hunks
	const THIRTY = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`).join('\n') + '\n';
	const create_hunks_source = (
		b: string,
		known_length: boolean
	): { source: DiffRowSource; model: DiffModel } => {
		const model = create_model(THIRTY, b, null);
		const full = model.hunk_ranges(1);
		const lines = full.flatMap((range) => model.lines.slice(range.start, range.end));
		let at = 0;
		const ranges = full.map((range) => {
			const start = at;
			at += range.end - range.start;
			return { start, end: at };
		});
		// counted from the `a` numbers around the gap, as a patch's `@@` headers
		// give them; after the last hunk only a known length can say
		const source: DiffRowSource = {
			lines,
			width: model.width,
			hunk_ranges: () => ranges,
			elided_count: (start, end) => {
				let before = 0;
				for (let i = start - 1; i >= 0; i--) {
					if (lines[i]!.a_line !== null) {
						before = lines[i]!.a_line!;
						break;
					}
				}
				if (end === lines.length && !known_length) return null;
				const after = end < lines.length ? lines[end]!.a_line! : model.a.diff_line_count + 1;
				return Math.max(0, after - before - 1);
			},
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
		return { source, model };
	};
	const B30 = THIRTY.replace('line 3\n', 'line three\n').replace('line 25\n', 'line 25!\n');

	test('a gap without rows renders as a count row in every elide mode', () => {
		const { source } = create_hunks_source(B30, true);
		for (const render of [render_diff_model_unified_html, render_diff_model_split_html]) {
			for (const elide of ['details', 'omit', 'none'] as const) {
				const html = render(source, { elide, context_lines: 1 });
				assert_balanced(html);
				assert.notInclude(html, '<details', elide);
				assert.include(html, '<div class="diff_skip">19 unchanged lines</div>', elide);
				assert.include(html, '<div class="diff_skip">4 unchanged lines</div>', elide);
				// the first hunk starts at line 2, so one line before it
				assert.isTrue(html.startsWith('<div class="diff_skip">1 unchanged line</div>'), elide);
			}
		}
	});

	test('the rows it holds keep their numbers', () => {
		const { source } = create_hunks_source(B30, true);
		const rows = parse_diff_rows(render_diff_model_unified_html(source, { context_lines: 1 }));
		assert.deepEqual(
			rows.map((r) => r.data_a),
			[2, 3, null, 4, 24, 25, null, 26]
		);
		assert.deepEqual(
			rows.map((r) => r.data_hunk),
			[0, 0, 0, 0, 1, 1, 1, 1]
		);
	});

	test('an unknown count after the last hunk renders without a number', () => {
		const { source } = create_hunks_source(B30, false);
		for (const elide of ['details', 'omit', 'none'] as const) {
			const html = render_diff_model_unified_html(source, { elide, context_lines: 1 });
			assert.isTrue(html.endsWith('<div class="diff_skip">unchanged lines</div>'), elide);
		}
	});

	test('a full model renders the same rows as the hunks-only source where it holds them', () => {
		const { source, model } = create_hunks_source(B30, true);
		const [first] = model.hunk_ranges(1);
		// the source pairs nothing, so compare without emphasis
		const options = { context_lines: 1, intraline: false };
		assert.strictEqual(
			render_diff_unified_rows_html(source, 0, first!.end - first!.start, options),
			render_diff_unified_rows_html(model, first!.start, first!.end, options)
		);
	});
});

describe('apply_diff_highlight', () => {
	// a minimal stand-in for rendered rows: attributes plus a class set
	const parse_rows = (html: string) => {
		const rows: Array<DiffHighlightRow & { classes: Set<string> }> = [];
		for (const match of html.matchAll(
			/<(?:ins|del|span) class="([^"]*)"((?: data-[a-z]+="\d+")*)>/g
		)) {
			const attrs = new Map(
				[...match[2]!.matchAll(/ data-([a-z]+)="(\d+)"/g)].map((m) => [`data-${m[1]}`, m[2]!])
			);
			if (!attrs.has('data-a') && !attrs.has('data-b')) continue;
			const classes = new Set(match[1]!.split(' '));
			rows.push({
				classes,
				getAttribute: (name) => attrs.get(name) ?? null,
				classList: {
					toggle: (token, force) => {
						const on = force ?? !classes.has(token);
						if (on) classes.add(token);
						else classes.delete(token);
						return on;
					}
				}
			});
		}
		return rows;
	};

	test('matches what the highlight option renders, both ways', () => {
		for (const render of [render_diff_unified_html, render_diff_split_html]) {
			const highlight = [
				{ side: 'a' as const, start: 10, end: 11 },
				{ side: 'b' as const, start: 1, end: 2 }
			];
			const plain = parse_rows(render(LONG_A, LONG_B, { lang: null, elide: 'none' }));
			const expected = parse_rows(render(LONG_A, LONG_B, { lang: null, elide: 'none', highlight }));
			apply_diff_highlight({ querySelectorAll: () => plain }, highlight);
			assert.deepEqual(
				plain.map((r) => r.classes.has('diff_highlight')),
				expected.map((r) => r.classes.has('diff_highlight'))
			);
			assert.include(
				plain.map((r) => r.classes.has('diff_highlight')),
				true
			);
			apply_diff_highlight({ querySelectorAll: () => plain }, []);
			assert.notInclude(
				plain.map((r) => r.classes.has('diff_highlight')),
				true
			);
		}
	});
});
