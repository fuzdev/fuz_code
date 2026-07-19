import {describe, test, assert} from 'vitest';

import {render_diff_unified_html, render_diff_split_html} from '$lib/diff_html.ts';
import {strip_tags, assert_balanced} from './html_test_helpers.ts';

const A = 'const a = 1;\nconst b = 2;\nconst c = 3;\n';
const B = 'const a = 1;\nconst b = 20;\nconst c = 3;\n';

describe('render_diff_unified_html', () => {
	test('renders semantic rows with diff classes', () => {
		const html = render_diff_unified_html(A, B, {lang: 'ts'});
		assert_balanced(html);
		assert.include(html, '<del class="diff_line diff_remove">');
		assert.include(html, '<ins class="diff_line diff_add">');
		assert.include(html, '<span class="diff_line diff_same">');
	});

	test('highlights rows with token spans', () => {
		const html = render_diff_unified_html(A, B, {lang: 'ts'});
		assert.include(html, 'token_keyword');
		assert.include(html, 'token_number');
	});

	test('lang null renders plain rows with diff chrome only', () => {
		const html = render_diff_unified_html(A, B, {lang: null});
		assert.notInclude(html, 'token_');
		assert.include(html, 'diff_remove');
	});

	test('unregistered lang falls back to plain rows', () => {
		const html = render_diff_unified_html(A, B, {lang: 'nope'});
		assert.notInclude(html, 'token_');
	});

	test('markers are generated content, not text — copied text stays clean', () => {
		const html = render_diff_unified_html(A, B, {lang: 'ts'});
		assert.notInclude(html, '+const');
		assert.notInclude(html, '-const');
		const text = strip_tags(html);
		assert.include(text, 'const b = 2;');
		assert.include(text, 'const b = 20;');
	});

	test('gutters carry both line numbers and are aria-hidden', () => {
		const html = render_diff_unified_html(A, B, {lang: 'ts'});
		assert.include(html, '<span class="diff_gutter" aria-hidden="true">1 1</span>');
		assert.include(html, '<span class="diff_gutter" aria-hidden="true">2  </span>');
		assert.include(html, '<span class="diff_gutter" aria-hidden="true">  2</span>');
	});

	test('line_numbers false omits gutters', () => {
		const html = render_diff_unified_html(A, B, {lang: 'ts', line_numbers: false});
		assert.notInclude(html, 'diff_gutter');
	});

	test('intra-line emphasis marks the changed range', () => {
		const html = render_diff_unified_html(A, B, {lang: 'ts'});
		assert.include(html, '<mark>');
		// the changed chars sit inside the token span, marked
		assert.include(html, '<mark>0</mark>');
	});

	test('intraline false disables marks', () => {
		const html = render_diff_unified_html(A, B, {lang: 'ts', intraline: false});
		assert.notInclude(html, '<mark>');
	});

	describe('elision', () => {
		const make_pair = (): {a: string; b: string} => {
			const a_lines = Array.from({length: 20}, (_, i) => `line ${i + 1}`);
			const b_lines = [...a_lines];
			b_lines[10] = 'modified';
			return {a: a_lines.join('\n') + '\n', b: b_lines.join('\n') + '\n'};
		};

		test('details by default, with expandable rows inside', () => {
			const {a, b} = make_pair();
			const html = render_diff_unified_html(a, b);
			assert_balanced(html);
			assert.include(html, '<details class="diff_skip"><summary>7 unchanged lines</summary>');
			assert.include(html, '<summary>6 unchanged lines</summary>');
			// the collapsed rows are present in the DOM
			assert.include(strip_tags(html), 'line 1');
			assert.include(strip_tags(html), 'line 20');
		});

		test('omit renders an inert count row', () => {
			const {a, b} = make_pair();
			const html = render_diff_unified_html(a, b, {elide: 'omit'});
			assert.include(html, '<div class="diff_skip">7 unchanged lines</div>');
			assert.notInclude(html, '<details');
			assert.notInclude(strip_tags(html), 'line 20');
		});

		test('none renders everything expanded', () => {
			const {a, b} = make_pair();
			const html = render_diff_unified_html(a, b, {elide: 'none'});
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
		const html = render_diff_unified_html('x', 'y', {intraline: false});
		assert.include(html, '<span class="diff_no_newline"></span>');
	});

	test('multi-line constructs highlight correctly across rows', () => {
		const a = 'const s = `one\ntwo`;\n';
		const b = 'const s = `one\nthree`;\n';
		const html = render_diff_unified_html(a, b, {lang: 'ts'});
		assert_balanced(html);
		const text = strip_tags(html);
		assert.include(text, 'two`;');
		assert.include(text, 'three`;');
	});

	test('escapes html in content', () => {
		const html = render_diff_unified_html('<script>\n', '<div>\n', {lang: null, intraline: false});
		assert.include(html, '&lt;script>');
		assert.include(html, '&lt;div>');
		assert_balanced(html);
	});

	test('determinism', () => {
		assert.strictEqual(
			render_diff_unified_html(A, B, {lang: 'ts'}),
			render_diff_unified_html(A, B, {lang: 'ts'}),
		);
	});

	test('empty to content', () => {
		const html = render_diff_unified_html('', 'a\nb\n', {lang: null});
		assert_balanced(html);
		assert.include(html, 'diff_add');
		assert.notInclude(html, 'diff_remove');
	});
});

describe('render_diff_split_html', () => {
	test('pairs a modification as del cell then ins cell', () => {
		const html = render_diff_split_html(A, B, {lang: 'ts'});
		assert_balanced(html);
		const del_at = html.indexOf('<del class="diff_cell diff_remove">');
		const ins_at = html.indexOf('<ins class="diff_cell diff_add">');
		assert.isAbove(del_at, -1);
		assert.isAbove(ins_at, del_at);
	});

	test('context renders as two same cells per row', () => {
		const html = render_diff_split_html('a\nb\n', 'a\nx\n', {lang: null, intraline: false});
		// the context row 'a' appears once per side
		assert.lengthOf(html.split('<span class="diff_cell diff_same">'), 3);
	});

	test('pure addition pads the a side with a spacer cell', () => {
		const html = render_diff_split_html('a\nb\n', 'a\nx\nb\n', {lang: null});
		assert.include(
			html,
			'<span class="diff_cell diff_spacer"></span><ins class="diff_cell diff_add">',
		);
	});

	test('unbalanced replace pads the shorter side', () => {
		const html = render_diff_split_html('one\ntwo\nz\n', 'uno\nz\n', {
			lang: null,
			intraline: false,
		});
		// 2 removes vs 1 add: row 1 = del+ins, row 2 = del+spacer
		assert.include(html, '</del><span class="diff_cell diff_spacer"></span>');
	});

	test('gutter cells carry one number per side', () => {
		const html = render_diff_split_html(A, B, {lang: 'ts'});
		assert.include(html, '<span class="diff_gutter" aria-hidden="true">1</span>');
	});

	test('elided regions nest rows in a split grid', () => {
		const a_lines = Array.from({length: 20}, (_, i) => `line ${i + 1}`);
		const b_lines = [...a_lines];
		b_lines[10] = 'modified';
		const html = render_diff_split_html(a_lines.join('\n') + '\n', b_lines.join('\n') + '\n');
		assert_balanced(html);
		assert.include(html, '<details class="diff_skip"><summary>7 unchanged lines</summary>');
		assert.include(html, '<div class="diff_split_rows">');
	});

	test('intra-line emphasis appears on both sides', () => {
		const html = render_diff_split_html('const x = 15;\n', 'const x = 25;\n', {lang: 'ts'});
		assert.include(html, '<mark>1</mark>');
		assert.include(html, '<mark>2</mark>');
	});

	test('copied text stays clean', () => {
		const html = render_diff_split_html(A, B, {lang: 'ts'});
		assert.notInclude(html, '+const');
		assert.notInclude(html, '-const');
	});

	test('determinism', () => {
		assert.strictEqual(
			render_diff_split_html(A, B, {lang: 'ts'}),
			render_diff_split_html(A, B, {lang: 'ts'}),
		);
	});
});
