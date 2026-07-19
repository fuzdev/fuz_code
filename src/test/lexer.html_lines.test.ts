import {describe, test, assert} from 'vitest';
import {readFileSync} from 'node:fs';

import {render_syntax_html_lines, type SyntaxHtmlMark} from '$lib/lexer.ts';
import {syntax_styler_global} from '$lib/syntax_styler_global.ts';
import {sample_langs} from '$lib/code_sample.ts';
import {strip_tags, assert_balanced} from './html_test_helpers.ts';

const lex = (text: string, lang: string) => syntax_styler_global.lex(text, lang);

describe('render_syntax_html_lines', () => {
	test('empty text renders one empty fragment', () => {
		assert.deepEqual(render_syntax_html_lines(lex('', 'ts')), ['']);
	});

	test('trailing newline yields a final empty fragment', () => {
		const fragments = render_syntax_html_lines(lex('const a = 1;\n', 'ts'));
		assert.lengthOf(fragments, 2);
		assert.strictEqual(fragments[1], '');
	});

	test('fragment text reassembles the source lines', () => {
		const text = 'const a = 1;\nconst b = "x\\n";\n// done';
		const fragments = render_syntax_html_lines(lex(text, 'ts'));
		assert.deepEqual(fragments.map(strip_tags), text.split('\n'));
	});

	test('multi-line tokens split with spans reopened per line', () => {
		const text = 'a {}\n/* one\ntwo */\nb {}';
		const fragments = render_syntax_html_lines(lex(text, 'css'));
		assert.lengthOf(fragments, 4);
		assert.include(fragments[1], 'token_comment');
		assert.include(fragments[2], 'token_comment');
		for (const fragment of fragments) assert_balanced(fragment);
		assert.deepEqual(fragments.map(strip_tags), text.split('\n'));
	});

	test('template literals across lines stay highlighted per line', () => {
		const text = 'const s = `one\ntwo ${x}\nthree`;';
		const fragments = render_syntax_html_lines(lex(text, 'ts'));
		assert.lengthOf(fragments, 3);
		for (const fragment of fragments) assert_balanced(fragment);
		assert.deepEqual(fragments.map(strip_tags), text.split('\n'));
	});

	test('determinism', () => {
		const text = 'const a = 1;\nconst b = 2;\n';
		assert.deepEqual(
			render_syntax_html_lines(lex(text, 'ts')),
			render_syntax_html_lines(lex(text, 'ts')),
		);
	});

	describe('samples', () => {
		for (const lang of sample_langs) {
			test(`sample_complex.${lang} fragments are balanced and reassemble`, () => {
				const content = readFileSync(`src/test/fixtures/samples/sample_complex.${lang}`, 'utf8');
				const fragments = render_syntax_html_lines(lex(content, lang));
				const expected = content.replaceAll('\xa0', ' ').split('\n');
				assert.lengthOf(fragments, expected.length);
				assert.deepEqual(fragments.map(strip_tags), expected);
				for (const fragment of fragments) assert_balanced(fragment);
			});
		}
	});

	describe('marks', () => {
		test('wraps a range in plain text', () => {
			const fragments = render_syntax_html_lines(lex('abcdef', 'plaintext'), {
				marks: [{start: 2, end: 5}],
			});
			assert.deepEqual(fragments, ['ab<mark>cde</mark>f']);
		});

		test('multiple ranges on one line', () => {
			const fragments = render_syntax_html_lines(lex('abcdef', 'plaintext'), {
				marks: [
					{start: 0, end: 2},
					{start: 4, end: 6},
				],
			});
			assert.deepEqual(fragments, ['<mark>ab</mark>cd<mark>ef</mark>']);
		});

		test('a mark crossing a newline closes and reopens', () => {
			const fragments = render_syntax_html_lines(lex('ab\ncdef', 'plaintext'), {
				marks: [{start: 1, end: 5}],
			});
			assert.deepEqual(fragments, ['a<mark>b</mark>', '<mark>cd</mark>ef']);
		});

		test('a mark crossing token boundaries splits into adjacent marks', () => {
			const text = '{"a": 1}';
			const fragments = render_syntax_html_lines(lex(text, 'json'), {
				marks: [{start: 1, end: 7}],
			});
			assert.lengthOf(fragments, 1);
			assert_balanced(fragments[0]!);
			assert.strictEqual(strip_tags(fragments[0]!), text);
			// the range spans multiple tokens, so the mark is cut into pieces
			assert.isAtLeast(fragments[0]!.split('<mark>').length - 1, 2);
		});

		test('custom mark tags', () => {
			const fragments = render_syntax_html_lines(lex('abc', 'plaintext'), {
				marks: [{start: 1, end: 2}],
				mark_open_tag: '<span class="emph">',
				mark_close_tag: '</span>',
			});
			assert.deepEqual(fragments, ['a<span class="emph">b</span>c']);
		});

		test('marks compose with multi-line tokens', () => {
			const text = '/* one\ntwo */';
			const marks: Array<SyntaxHtmlMark> = [{start: 3, end: 10}];
			const fragments = render_syntax_html_lines(lex(text, 'css'), {marks});
			assert.lengthOf(fragments, 2);
			for (const fragment of fragments) assert_balanced(fragment);
			assert.deepEqual(fragments.map(strip_tags), text.split('\n'));
			assert.include(fragments[0], '<mark>');
			assert.include(fragments[1], '<mark>');
		});

		test('marks at text boundaries', () => {
			const fragments = render_syntax_html_lines(lex('abc', 'plaintext'), {
				marks: [{start: 0, end: 3}],
			});
			assert.deepEqual(fragments, ['<mark>abc</mark>']);
		});
	});
});
