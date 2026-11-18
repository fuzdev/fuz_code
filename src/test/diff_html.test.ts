import { describe, test, assert } from 'vitest';
import { readFileSync } from 'node:fs';

import { render_diff_unified_html, render_diff_split_html } from '#lib/diff_html.ts';
import { sample_langs } from '#lib/code_sample.ts';
import {
	strip_tags,
	assert_balanced,
	assert_unified_diff_valid,
	assert_split_diff_valid,
	parse_diff_rows,
	marked_text,
	create_random,
	mutate_lines
} from './html_test_helpers.ts';
import { discover_diff_cases } from './fixtures/helpers.ts';

const A = 'const a = 1;\nconst b = 2;\nconst c = 3;\n';
const B = 'const a = 1;\nconst b = 20;\nconst c = 3;\n';

describe('render_diff_unified_html', () => {
	test('renders semantic rows with diff classes', () => {
		const html = render_diff_unified_html(A, B, { lang: 'ts' });
		assert_balanced(html);
		assert.include(html, '<del class="diff_line diff_remove" data-a="2" data-hunk="0">');
		assert.include(html, '<ins class="diff_line diff_add" data-b="2" data-hunk="0">');
		assert.include(html, '<span class="diff_line diff_same" data-a="1" data-b="1" data-hunk="0">');
	});

	test('highlights rows with token spans', () => {
		const html = render_diff_unified_html(A, B, { lang: 'ts' });
		assert.include(html, 'token_keyword');
		assert.include(html, 'token_number');
	});

	test('lang null renders plain rows with diff chrome only', () => {
		const html = render_diff_unified_html(A, B, { lang: null });
		assert.notInclude(html, 'token_');
		assert.include(html, 'diff_remove');
	});

	test('unregistered lang falls back to plain rows', () => {
		const html = render_diff_unified_html(A, B, { lang: 'nope' });
		assert.notInclude(html, 'token_');
	});

	test('markers are generated content, not text — copied text stays clean', () => {
		const html = render_diff_unified_html(A, B, { lang: 'ts' });
		assert.notInclude(html, '+const');
		assert.notInclude(html, '-const');
		const text = strip_tags(html);
		assert.include(text, 'const b = 2;');
		assert.include(text, 'const b = 20;');
	});

	test('gutters carry both line numbers and are aria-hidden', () => {
		const html = render_diff_unified_html(A, B, { lang: 'ts' });
		assert.include(html, '<span class="diff_gutter" aria-hidden="true">1 1</span>');
		assert.include(html, '<span class="diff_gutter" aria-hidden="true">2  </span>');
		assert.include(html, '<span class="diff_gutter" aria-hidden="true">  2</span>');
	});

	test('line_numbers false omits gutters', () => {
		const html = render_diff_unified_html(A, B, { lang: 'ts', line_numbers: false });
		assert.notInclude(html, 'diff_gutter');
	});

	test('intra-line emphasis marks the changed range', () => {
		const html = render_diff_unified_html(A, B, { lang: 'ts' });
		assert.include(html, '<mark>');
		// the changed chars sit inside the token span, marked
		assert.include(html, '<mark>0</mark>');
	});

	test('intraline false disables marks', () => {
		const html = render_diff_unified_html(A, B, { lang: 'ts', intraline: false });
		assert.notInclude(html, '<mark>');
	});

	describe('elision', () => {
		const make_pair = (): { a: string; b: string } => {
			const a_lines = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`);
			const b_lines = [...a_lines];
			b_lines[10] = 'modified';
			return { a: a_lines.join('\n') + '\n', b: b_lines.join('\n') + '\n' };
		};

		test('details by default, with expandable rows inside', () => {
			const { a, b } = make_pair();
			const html = render_diff_unified_html(a, b);
			assert_balanced(html);
			assert.include(html, '<details class="diff_skip"><summary>7 unchanged lines</summary>');
			assert.include(html, '<summary>6 unchanged lines</summary>');
			// the collapsed rows are present in the DOM
			assert.include(strip_tags(html), 'line 1');
			assert.include(strip_tags(html), 'line 20');
		});

		test('omit renders an inert count row', () => {
			const { a, b } = make_pair();
			const html = render_diff_unified_html(a, b, { elide: 'omit' });
			assert.include(html, '<div class="diff_skip">7 unchanged lines</div>');
			assert.notInclude(html, '<details');
			assert.notInclude(strip_tags(html), 'line 20');
		});

		test('none renders everything expanded', () => {
			const { a, b } = make_pair();
			const html = render_diff_unified_html(a, b, { elide: 'none' });
			assert.notInclude(html, 'diff_skip');
			assert.include(strip_tags(html), 'line 1');
		});

		test('identical inputs elide everything', () => {
			const html = render_diff_unified_html('a\nb\nc\n', 'a\nb\nc\n');
			assert.include(html, '<summary>3 unchanged lines</summary>');
			assert.notInclude(html, 'diff_add');
		});

		test('singular count', () => {
			const html = render_diff_unified_html('a\n', 'a\n');
			assert.include(html, '<summary>1 unchanged line</summary>');
		});
	});

	test('no_newline marker span on unterminated final lines', () => {
		const html = render_diff_unified_html('x', 'y', { intraline: false });
		assert.include(html, '<span class="diff_no_newline"></span>');
	});

	test('multi-line constructs highlight correctly across rows', () => {
		const a = 'const s = `one\ntwo`;\n';
		const b = 'const s = `one\nthree`;\n';
		const html = render_diff_unified_html(a, b, { lang: 'ts' });
		assert_balanced(html);
		const text = strip_tags(html);
		assert.include(text, 'two`;');
		assert.include(text, 'three`;');
	});

	test('escapes html in content', () => {
		const html = render_diff_unified_html('<script>\n', '<div>\n', {
			lang: null,
			intraline: false
		});
		assert.include(html, '&lt;script>');
		assert.include(html, '&lt;div>');
		assert_balanced(html);
	});

	test('determinism', () => {
		assert.strictEqual(
			render_diff_unified_html(A, B, { lang: 'ts' }),
			render_diff_unified_html(A, B, { lang: 'ts' })
		);
	});

	test('empty to content', () => {
		const html = render_diff_unified_html('', 'a\nb\n', { lang: null });
		assert_balanced(html);
		assert.include(html, 'diff_add');
		assert.notInclude(html, 'diff_remove');
	});

	test('content to empty', () => {
		const html = render_diff_unified_html('a\nb\n', '', { lang: null });
		assert_unified_diff_valid(html, 'a\nb\n', '');
		assert.notInclude(html, 'diff_add');
	});

	test('two empty texts render nothing', () => {
		assert.strictEqual(render_diff_unified_html('', ''), '');
	});

	test('an empty line carries a br, so a copied selection keeps it', () => {
		const html = render_diff_unified_html('a\n\nb\n', 'a\n\nc\n', {
			lang: null,
			line_numbers: false
		});
		assert.include(
			html,
			'<span class="diff_line diff_same" data-a="2" data-b="2" data-hunk="0"><span class="diff_text"><br></span>'
		);
		assert.lengthOf(html.split('<br>'), 2);
	});

	test('an empty line inside a multi-line token carries a br after its spans', () => {
		const html = render_diff_unified_html('/* a\n\nb */\n', '/* a\n\nc */\n', {
			lang: 'css',
			line_numbers: false
		});
		assert.include(html, '<span class="diff_text"><span class="token_comment"></span><br></span>');
	});

	test('rows keep source order: removes before adds within a change', () => {
		const html = render_diff_unified_html('a\nb\nc\n', 'a\nx\ny\nc\n', { lang: null });
		assert.deepEqual(
			parse_diff_rows(html).map((r) => `${r.type}:${r.text}`),
			['same:a', 'remove:b', 'add:x', 'add:y', 'same:c']
		);
	});

	test('gutter numbers pad to the widest line number', () => {
		const a = 'l\n'.repeat(9) + 'a\n';
		const b = 'l\n'.repeat(9) + 'b\n';
		const html = render_diff_unified_html(a, b, { lang: null });
		assert.include(html, '<span class="diff_gutter" aria-hidden="true"> 9  9</span>');
		assert.include(html, '<span class="diff_gutter" aria-hidden="true">10   </span>');
		assert.include(html, '<span class="diff_gutter" aria-hidden="true">   10</span>');
		assert_unified_diff_valid(html, a, b);
	});

	test('context rows render from the b side highlight', () => {
		// `foo` is inside a block comment in `a` and bare code in `b`
		const html = render_diff_unified_html('/*\nfoo\n*/\n', '//\nfoo\n//\n', {
			lang: 'ts',
			line_numbers: false
		});
		assert.include(
			html,
			'<span class="diff_line diff_same" data-a="2" data-b="2" data-hunk="0"><span class="diff_text">foo</span>'
		);
	});

	test('a newline-only change shows the unterminated line removed and re-added', () => {
		const html = render_diff_unified_html('x', 'x\n', { lang: null });
		const rows = parse_diff_rows(html);
		assert.deepEqual(
			rows.map((r) => [r.type, r.text, r.no_newline]),
			[
				['remove', 'x', true],
				['add', 'x', false]
			]
		);
		assert.notInclude(html, '<mark>');
	});

	test('an unterminated context line keeps its no_newline marker', () => {
		const html = render_diff_unified_html('a\nx', 'b\nx', { lang: null });
		const rows = parse_diff_rows(html);
		assert.deepEqual(rows.at(-1), {
			type: 'same',
			tag: 'span',
			gutter: '2 2',
			text: 'x',
			no_newline: true,
			highlighted: false,
			data_a: 2,
			data_b: 2,
			data_hunk: 0
		});
		assert.isFalse(rows[0]!.no_newline);
	});

	test('carriage returns stay in the row text', () => {
		const a = 'a\r\nb\r\n';
		const b = 'a\r\nc\r\n';
		const html = render_diff_unified_html(a, b, { lang: 'ts' });
		assert_unified_diff_valid(html, a, b);
		assert.strictEqual(marked_text(html), 'bc');
	});

	test('a line ending change marks the carriage return', () => {
		const html = render_diff_unified_html('a\r\n', 'a\n', { lang: null });
		assert.strictEqual(marked_text(html), '\r');
	});

	test('escapes ampersands and angle brackets inside marks', () => {
		const a = 'a && b < c\n';
		const b = 'a && b <<< c\n';
		const html = render_diff_unified_html(a, b, { lang: null });
		assert.include(html, '&amp;&amp;');
		assert.include(html, '<mark>&lt;&lt;</mark>');
		assert_unified_diff_valid(html, a, b);
	});

	describe('intra-line pairing', () => {
		test('lines that changed in place pair in order', () => {
			const html = render_diff_unified_html('x1\ny1\n', 'x2\ny2\nz\n', { lang: null });
			const rows = parse_diff_rows(html);
			assert.deepEqual(
				rows.map((r) => r.type),
				['remove', 'remove', 'add', 'add', 'add']
			);
			assert.strictEqual(marked_text(html), '1122');
			// the unpaired third add has no emphasis
			assert.notInclude(html.slice(html.lastIndexOf('<ins')), '<mark>');
		});

		test('a removed line pairs with the added line it became, not the one at its position', () => {
			const a = 'foo(bar);\n';
			const b = 'const a = 1;\nconst b = 2;\nfoo(bar, baz);\n';
			const html = render_diff_unified_html(a, b, { lang: null });
			assert.strictEqual(marked_text(html), ', baz');
			// the unified rows keep their order: removes, then adds
			assert.deepEqual(
				parse_diff_rows(html).map((r) => `${r.type}:${r.text}`),
				['remove:foo(bar);', 'add:const a = 1;', 'add:const b = 2;', 'add:foo(bar, baz);']
			);
		});

		test('a line inserted among edited lines leaves the lines around it paired', () => {
			const a = 'alpha one\nbeta two\ngamma three\n';
			const b = 'alpha 1\nnew line here\nbeta 2\ngamma 3\n';
			const html = render_diff_unified_html(a, b, { lang: null });
			assert.strictEqual(marked_text(html), 'onetwothree123');
			assert_unified_diff_valid(html, a, b);
		});

		test('pairs never cross', () => {
			// each line is closest to the one that moved past it, and pairing
			// both would cross, so the lines pair in order
			const a = 'first thing\nsecond thing\n';
			const b = 'second thing!\nfirst thing!\n';
			const html = render_diff_unified_html(a, b, { lang: 'ts' });
			assert_unified_diff_valid(html, a, b);
			assert_split_diff_valid(render_diff_split_html(a, b, { lang: 'ts' }), a, b);
		});

		// every line is a distinct word repeated, so a line is similar only to
		// its own edited version, which sits one position later on the b side
		const make_shifted = (count: number): { a: string; b: string } => {
			const letter = (i: number): string => String.fromCharCode(97 + (i % 26));
			const line = (i: number): string =>
				(letter(i).repeat(5) + letter(Math.floor(i / 26))).repeat(8);
			const lines = Array.from({ length: count }, (_, i) => line(i));
			return {
				a: lines.join('\n') + '\n',
				b: ['0123456789', ...lines.map((l) => l + '!')].join('\n') + '\n'
			};
		};

		test('a small change pairs by similarity', () => {
			const { a, b } = make_shifted(5);
			const html = render_diff_unified_html(a, b, { lang: null });
			assert.strictEqual(marked_text(html), '!'.repeat(5));
		});

		test('a change past the pairing budget pairs by position', () => {
			const { a, b } = make_shifted(60);
			const html = render_diff_unified_html(a, b, { lang: null });
			// by position each line meets its unrelated neighbor, so nothing pairs
			assert.notInclude(html, '<mark>');
			assert_unified_diff_valid(html, a, b);
			assert_split_diff_valid(render_diff_split_html(a, b, { lang: null }), a, b);
		});

		test('a pair that reads as a rewrite gets no emphasis', () => {
			const html = render_diff_unified_html('alpha\n', '0123456789\n', { lang: null });
			assert.notInclude(html, '<mark>');
		});

		test('pure additions and pure removals get no emphasis', () => {
			assert.notInclude(render_diff_unified_html('a\n', 'a\nb\n', { lang: null }), '<mark>');
			assert.notInclude(render_diff_unified_html('a\nb\n', 'a\n', { lang: null }), '<mark>');
		});

		test('emphasis lands inside the token spans it crosses', () => {
			const a = 'const total = count + 1;\n';
			const b = 'const total = amount * 10;\n';
			const html = render_diff_unified_html(a, b, { lang: 'ts' });
			assert_unified_diff_valid(html, a, b);
			assert.include(html, '<mark>');
		});
	});

	describe('context_lines', () => {
		const a = 'a\nb\nc\nd\ne\nf\ng\n';
		const b = 'a\nb\nc\nx\ne\nf\ng\n';
		const shown = (html: string): Array<string> =>
			parse_diff_rows(html)
				.filter((r) => r.type === 'same')
				.map((r) => r.text);

		test('limits the context around a change', () => {
			const html = render_diff_unified_html(a, b, { lang: null, elide: 'omit', context_lines: 1 });
			assert.deepEqual(shown(html), ['c', 'e']);
			assert.lengthOf(html.split('2 unchanged lines'), 3);
		});

		test('zero shows changes only', () => {
			const html = render_diff_unified_html(a, b, { lang: null, elide: 'omit', context_lines: 0 });
			assert.deepEqual(shown(html), []);
			assert.lengthOf(html.split('3 unchanged lines'), 3);
		});

		test('a count past both ends shows everything with no elision', () => {
			for (const context_lines of [100, Infinity]) {
				const html = render_diff_unified_html(a, b, { lang: null, context_lines });
				assert.notInclude(html, 'diff_skip');
				assert_unified_diff_valid(html, a, b);
			}
		});

		test('negative and NaN counts are treated as zero', () => {
			const zero = render_diff_unified_html(a, b, { lang: null, context_lines: 0 });
			assert_unified_diff_valid(zero, a, b);
			for (const context_lines of [-1, -Infinity, NaN]) {
				assert.strictEqual(render_diff_unified_html(a, b, { lang: null, context_lines }), zero);
				assert.strictEqual(
					render_diff_split_html(a, b, { lang: null, context_lines }),
					render_diff_split_html(a, b, { lang: null, context_lines: 0 })
				);
			}
		});

		test('a fractional count is floored', () => {
			assert.strictEqual(
				render_diff_unified_html(a, b, { lang: null, context_lines: 1.9 }),
				render_diff_unified_html(a, b, { lang: null, context_lines: 1 })
			);
		});

		test('changes within reach of each other share one hunk', () => {
			const near_a = 'a\n1\n2\n3\n4\n5\n6\nb\n';
			const near_b = 'A\n1\n2\n3\n4\n5\n6\nB\n';
			assert.notInclude(render_diff_unified_html(near_a, near_b, { lang: null }), 'diff_skip');
			// one more line between them leaves a gap to elide
			const far_a = 'a\n1\n2\n3\n4\n5\n6\n7\nb\n';
			const far_b = 'A\n1\n2\n3\n4\n5\n6\n7\nB\n';
			const html = render_diff_unified_html(far_a, far_b, { lang: null });
			assert.include(html, '<summary>1 unchanged line</summary>');
			assert_unified_diff_valid(html, far_a, far_b);
		});

		test('a change on the first or last line has no elision beside it', () => {
			const first = render_diff_unified_html('a\n' + 'l\n'.repeat(10), 'b\n' + 'l\n'.repeat(10), {
				lang: null,
				elide: 'omit'
			});
			assert.isTrue(first.startsWith('<del'));
			assert.isTrue(first.endsWith('<div class="diff_skip">7 unchanged lines</div>'));
			const last = render_diff_unified_html('l\n'.repeat(10) + 'a\n', 'l\n'.repeat(10) + 'b\n', {
				lang: null,
				elide: 'omit'
			});
			assert.isTrue(last.startsWith('<div class="diff_skip">7 unchanged lines</div>'));
			assert.isTrue(last.endsWith('</ins>'));
		});

		test('repeated identical lines elide by position, not by content', () => {
			const dup_a = 'x\n'.repeat(12) + 'a\n' + 'x\n'.repeat(12);
			const dup_b = 'x\n'.repeat(12) + 'b\n' + 'x\n'.repeat(12);
			const html = render_diff_unified_html(dup_a, dup_b, { lang: null });
			assert_unified_diff_valid(html, dup_a, dup_b);
			assert.lengthOf(html.split('<summary>9 unchanged lines</summary>'), 3);
		});
	});

	test('max_cost degrades to a replace block that is still a valid diff', () => {
		const a = 'a\nb\nc\nd\n';
		const b = 'a\nx\nc\ny\n';
		const html = render_diff_unified_html(a, b, { lang: null, max_cost: 1 });
		assert_unified_diff_valid(html, a, b);
		// the matching `c` is no longer found, so it is removed and re-added
		assert.deepEqual(
			parse_diff_rows(html).map((r) => r.type),
			['same', 'remove', 'remove', 'remove', 'add', 'add', 'add']
		);
	});

	test('every prefix of an edit renders a valid diff', () => {
		const a = 'const s = `one\n${two}`;\n/* note */\nexport const x = {a: 1};\n';
		const b = 'const s = `one\n${three}\nmore`;\n/* a\n\nnote */\nexport const x = {a: [1]};\n';
		for (let i = 0; i <= b.length; i++) {
			const prefix = b.slice(0, i);
			assert_unified_diff_valid(render_diff_unified_html(a, prefix, { lang: 'ts' }), a, prefix);
			assert_split_diff_valid(render_diff_split_html(a, prefix, { lang: 'ts' }), a, prefix);
		}
	});
});

describe('render_diff_split_html', () => {
	test('pairs a modification as del cell then ins cell', () => {
		const html = render_diff_split_html(A, B, { lang: 'ts' });
		assert_balanced(html);
		const del_at = html.indexOf('<del class="diff_cell diff_remove" data-a="2" data-hunk="0">');
		const ins_at = html.indexOf('<ins class="diff_cell diff_add" data-b="2" data-hunk="0">');
		assert.isAbove(del_at, -1);
		assert.isAbove(ins_at, del_at);
	});

	test('context renders as two same cells per row', () => {
		const html = render_diff_split_html('a\nb\n', 'a\nx\n', { lang: null, intraline: false });
		// the context row 'a' appears once per side
		assert.lengthOf(html.split('<span class="diff_cell diff_same" data-a="1" data-b="1"'), 3);
	});

	test('pure addition pads the a side with a spacer cell', () => {
		const html = render_diff_split_html('a\nb\n', 'a\nx\nb\n', { lang: null });
		assert.include(
			html,
			'<span class="diff_cell diff_spacer" data-hunk="0"></span><ins class="diff_cell diff_add" data-b="2" data-hunk="0">'
		);
	});

	test('unbalanced replace pads the shorter side', () => {
		const html = render_diff_split_html('one\ntwo\nz\n', 'uno\nz\n', {
			lang: null,
			intraline: false
		});
		// 2 removes vs 1 add: row 1 = del+ins, row 2 = del+spacer
		assert.include(html, '</del><span class="diff_cell diff_spacer" data-hunk="0"></span>');
	});

	test('gutter cells carry one number per side', () => {
		const html = render_diff_split_html(A, B, { lang: 'ts' });
		assert.include(html, '<span class="diff_gutter" aria-hidden="true">1</span>');
	});

	test('elided regions nest rows in a split grid', () => {
		const a_lines = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`);
		const b_lines = [...a_lines];
		b_lines[10] = 'modified';
		const html = render_diff_split_html(a_lines.join('\n') + '\n', b_lines.join('\n') + '\n');
		assert_balanced(html);
		assert.include(html, '<details class="diff_skip"><summary>7 unchanged lines</summary>');
		assert.include(html, '<div class="diff_split_rows">');
	});

	test('intra-line emphasis appears on both sides', () => {
		const html = render_diff_split_html('const x = 15;\n', 'const x = 25;\n', { lang: 'ts' });
		assert.include(html, '<mark>1</mark>');
		assert.include(html, '<mark>2</mark>');
	});

	test('copied text stays clean', () => {
		const html = render_diff_split_html(A, B, { lang: 'ts' });
		assert.notInclude(html, '+const');
		assert.notInclude(html, '-const');
	});

	test('determinism', () => {
		assert.strictEqual(
			render_diff_split_html(A, B, { lang: 'ts' }),
			render_diff_split_html(A, B, { lang: 'ts' })
		);
	});

	test('pure removal pads the b side with a spacer cell', () => {
		const html = render_diff_split_html('a\nx\nb\n', 'a\nb\n', { lang: null });
		assert.include(html, '</del><span class="diff_cell diff_spacer" data-hunk="0"></span>');
		assert_split_diff_valid(html, 'a\nx\nb\n', 'a\nb\n');
	});

	test('more adds than removes pads the a side', () => {
		const a = 'one\nz\n';
		const b = 'uno\ndos\ntres\nz\n';
		const html = render_diff_split_html(a, b, { lang: null, intraline: false });
		assert.deepEqual(
			parse_diff_rows(html).map((c) => `${c.type}:${c.text}`),
			['remove:one', 'add:uno', 'spacer:', 'add:dos', 'spacer:', 'add:tres', 'same:z', 'same:z']
		);
	});

	describe('row pairing', () => {
		const rows = (a: string, b: string, intraline = true): Array<string> => {
			const html = render_diff_split_html(a, b, { lang: null, intraline });
			assert_split_diff_valid(html, a, b);
			const cells = parse_diff_rows(html);
			const out: Array<string> = [];
			for (let i = 0; i < cells.length; i += 2) {
				out.push(`${cells[i]!.text} | ${cells[i + 1]!.text}`);
			}
			return out;
		};

		test('a removed line sits beside the added line it became', () => {
			assert.deepEqual(rows('foo(bar);\n', 'const a = 1;\nconst b = 2;\nfoo(bar, baz);\n'), [
				' | const a = 1;',
				' | const b = 2;',
				'foo(bar); | foo(bar, baz);'
			]);
			assert.deepEqual(rows('const a = 1;\nfoo(bar);\nconst b = 2;\n', 'foo(bar, baz);\n'), [
				'const a = 1; | ',
				'foo(bar); | foo(bar, baz);',
				'const b = 2; | '
			]);
		});

		test('an inserted line gets its own row between pairs', () => {
			assert.deepEqual(
				rows('alpha one\nbeta two\ngamma three\n', 'alpha 1\nnew line here\nbeta 2\ngamma 3\n'),
				['alpha one | alpha 1', ' | new line here', 'beta two | beta 2', 'gamma three | gamma 3']
			);
		});

		test('unpaired lines between two pairs are top-aligned', () => {
			assert.deepEqual(rows('x = 1\nqqq\nwww\ny = 2\n', 'x = 10\nzzzzzz\ny = 20\n'), [
				'x = 1 | x = 10',
				'qqq | zzzzzz',
				'www | ',
				'y = 2 | y = 20'
			]);
		});

		test('unrelated blocks are top-aligned with the shorter side padded', () => {
			assert.deepEqual(rows('aaa\nbbb\nccc\n', '111\n222\n'), ['aaa | 111', 'bbb | 222', 'ccc | ']);
		});

		test('rows pair the same with emphasis off', () => {
			const a = 'foo(bar);\n';
			const b = 'const a = 1;\nconst b = 2;\nfoo(bar, baz);\n';
			assert.deepEqual(rows(a, b, false), rows(a, b));
		});
	});

	test('each context cell renders from its own side highlight', () => {
		// `foo` is inside a block comment in `a` and bare code in `b`
		const html = render_diff_split_html('/*\nfoo\n*/\n', '//\nfoo\n//\n', {
			lang: 'ts',
			line_numbers: false
		});
		assert.include(
			html,
			'<span class="diff_cell diff_same" data-a="2" data-b="2" data-hunk="0"><span class="diff_text"><span class="token_comment">foo</span></span></span>' +
				'<span class="diff_cell diff_same" data-a="2" data-b="2" data-hunk="0"><span class="diff_text">foo</span></span>'
		);
	});

	test('line_numbers false omits gutters', () => {
		const html = render_diff_split_html(A, B, { lang: 'ts', line_numbers: false });
		assert.notInclude(html, 'diff_gutter');
		assert_split_diff_valid(html, A, B);
	});

	test('lang null renders plain cells', () => {
		const html = render_diff_split_html(A, B, { lang: null });
		assert.notInclude(html, 'token_');
		assert_split_diff_valid(html, A, B);
	});

	test('intraline false disables marks', () => {
		assert.notInclude(render_diff_split_html(A, B, { lang: 'ts', intraline: false }), '<mark>');
	});

	test('omit renders an inert count row spanning the grid', () => {
		const a = 'l\n'.repeat(10) + 'a\n';
		const b = 'l\n'.repeat(10) + 'b\n';
		const html = render_diff_split_html(a, b, { lang: null, elide: 'omit' });
		assert.isTrue(html.startsWith('<div class="diff_skip">7 unchanged lines</div>'));
		assert.notInclude(html, '<details');
		assert.notInclude(html, 'diff_split_rows');
		assert_balanced(html);
	});

	test('none renders every cell with no nested grid', () => {
		const a = 'l\n'.repeat(10) + 'a\n';
		const b = 'l\n'.repeat(10) + 'b\n';
		const html = render_diff_split_html(a, b, { lang: null, elide: 'none' });
		assert.notInclude(html, 'diff_skip');
		assert.notInclude(html, 'diff_split_rows');
		assert_split_diff_valid(html, a, b);
	});

	test('an empty line carries a br on both sides', () => {
		const html = render_diff_split_html('a\n\nb\n', 'a\n\nc\n', { lang: null });
		assert.lengthOf(html.split('<br>'), 3);
	});

	test('no_newline marker on the side that lacks the newline', () => {
		const cells = parse_diff_rows(render_diff_split_html('x', 'x\n', { lang: null }));
		assert.deepEqual(
			cells.map((c) => [c.type, c.no_newline]),
			[
				['remove', true],
				['add', false]
			]
		);
	});

	test('two empty texts render nothing', () => {
		assert.strictEqual(render_diff_split_html('', ''), '');
	});

	test('renders the same lines as the unified view', () => {
		const unified = parse_diff_rows(render_diff_unified_html(A, B, { lang: 'ts' }));
		const split = parse_diff_rows(render_diff_split_html(A, B, { lang: 'ts' }));
		const texts = (rows: typeof unified, type: string): Array<string> =>
			rows.filter((r) => r.type === type).map((r) => r.text);
		assert.deepEqual(texts(split, 'remove'), texts(unified, 'remove'));
		assert.deepEqual(texts(split, 'add'), texts(unified, 'add'));
	});
});

describe('diff views over real sources', async () => {
	const diff_cases = await discover_diff_cases();

	for (const diff_case of diff_cases) {
		test(`fixture ${diff_case.name} reassembles in both views`, () => {
			const { a, b, lang } = diff_case;
			for (const elide of ['details', 'none'] as const) {
				assert_unified_diff_valid(render_diff_unified_html(a, b, { lang, elide }), a, b);
				assert_split_diff_valid(render_diff_split_html(a, b, { lang, elide }), a, b);
			}
		});
	}

	for (const lang of sample_langs) {
		test(`sample_complex.${lang} against random edits`, () => {
			const a = readFileSync(`src/test/fixtures/samples/sample_complex.${lang}`, 'utf8');
			const random = create_random(1);
			for (let round = 0; round < 5; round++) {
				const b = mutate_lines(a, random);
				assert_unified_diff_valid(render_diff_unified_html(a, b, { lang }), a, b);
				assert_split_diff_valid(render_diff_split_html(a, b, { lang }), a, b);
				// and with the sides swapped, so inserts become deletes
				assert_unified_diff_valid(render_diff_unified_html(b, a, { lang, elide: 'none' }), b, a);
				assert_split_diff_valid(render_diff_split_html(b, a, { lang, elide: 'none' }), b, a);
				assert_balanced(render_diff_unified_html(a, b, { lang, elide: 'omit' }));
				assert_balanced(render_diff_split_html(a, b, { lang, elide: 'omit' }));
			}
		});
	}
});
