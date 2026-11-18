import { describe, test, assert } from 'vitest';
import { readFileSync } from 'node:fs';

import { render_syntax_html, render_syntax_html_lines, type SyntaxHtmlMark } from '#lib/lexer.ts';
import { syntax_styler_global } from '#lib/syntax_styler_global.ts';
import { sample_langs } from '#lib/code_sample.ts';
import {
	strip_tags,
	assert_balanced,
	assert_marks_wrap_text,
	marked_text,
	create_random
} from './html_test_helpers.ts';

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
			render_syntax_html_lines(lex(text, 'ts'))
		);
	});

	test('a token ending at a newline leaves no span on the next line', () => {
		assert.deepEqual(render_syntax_html_lines(lex('// a\nb\n', 'ts')), [
			'<span class="token_comment">// a</span>',
			'b',
			''
		]);
	});

	test('an empty line inside a multi-line token is an empty span', () => {
		assert.deepEqual(render_syntax_html_lines(lex('/* a\n\nb */', 'css')), [
			'<span class="token_comment">/* a</span>',
			'<span class="token_comment"></span>',
			'<span class="token_comment">b */</span>'
		]);
	});

	test('nested containers reopen outermost first', () => {
		const fragments = render_syntax_html_lines(lex('`a${\nx}b`', 'ts'));
		assert.lengthOf(fragments, 2);
		assert.isTrue(
			fragments[0]!.endsWith('${</span></span></span>'),
			'the punctuation leaf, the interpolation, and the template string close'
		);
		assert.isTrue(
			fragments[1]!.startsWith(
				'<span class="token_template_string"><span class="token_interpolation">x'
			)
		);
	});

	test('only newlines yield only empty fragments', () => {
		assert.deepEqual(render_syntax_html_lines(lex('\n\n', 'ts')), ['', '', '']);
	});

	test('carriage returns stay in the fragment', () => {
		assert.deepEqual(render_syntax_html_lines(lex('a\r\nb', 'plaintext')), ['a\r', 'b']);
	});

	test('escapes ampersands and angle brackets', () => {
		assert.deepEqual(render_syntax_html_lines(lex('a < b\n&c', 'plaintext')), [
			'a &lt; b',
			'&amp;c'
		]);
	});

	test('a single-line text renders the same as render_syntax_html', () => {
		for (const lang of sample_langs) {
			const content = readFileSync(`src/test/fixtures/samples/sample_complex.${lang}`, 'utf8');
			for (const line of content.split('\n')) {
				const fragments = render_syntax_html_lines(lex(line, lang));
				assert.deepEqual(fragments, [render_syntax_html(lex(line, lang))]);
			}
		}
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
				marks: [{ start: 2, end: 5 }]
			});
			assert.deepEqual(fragments, ['ab<mark>cde</mark>f']);
		});

		test('multiple ranges on one line', () => {
			const fragments = render_syntax_html_lines(lex('abcdef', 'plaintext'), {
				marks: [
					{ start: 0, end: 2 },
					{ start: 4, end: 6 }
				]
			});
			assert.deepEqual(fragments, ['<mark>ab</mark>cd<mark>ef</mark>']);
		});

		test('a mark crossing a newline closes and reopens', () => {
			const fragments = render_syntax_html_lines(lex('ab\ncdef', 'plaintext'), {
				marks: [{ start: 1, end: 5 }]
			});
			assert.deepEqual(fragments, ['a<mark>b</mark>', '<mark>cd</mark>ef']);
		});

		test('a mark crossing token boundaries splits into adjacent marks', () => {
			const text = '{"a": 1}';
			const fragments = render_syntax_html_lines(lex(text, 'json'), {
				marks: [{ start: 1, end: 7 }]
			});
			assert.lengthOf(fragments, 1);
			assert_balanced(fragments[0]!);
			assert.strictEqual(strip_tags(fragments[0]!), text);
			// the range spans multiple tokens, so the mark is cut into pieces
			assert.isAtLeast(fragments[0]!.split('<mark>').length - 1, 2);
		});

		test('custom mark tags', () => {
			const fragments = render_syntax_html_lines(lex('abc', 'plaintext'), {
				marks: [{ start: 1, end: 2 }],
				mark_open_tag: '<span class="emph">',
				mark_close_tag: '</span>'
			});
			assert.deepEqual(fragments, ['a<span class="emph">b</span>c']);
		});

		test('marks compose with multi-line tokens', () => {
			const text = '/* one\ntwo */';
			const marks: Array<SyntaxHtmlMark> = [{ start: 3, end: 10 }];
			const fragments = render_syntax_html_lines(lex(text, 'css'), { marks });
			assert.lengthOf(fragments, 2);
			for (const fragment of fragments) assert_balanced(fragment);
			assert.deepEqual(fragments.map(strip_tags), text.split('\n'));
			assert.include(fragments[0], '<mark>');
			assert.include(fragments[1], '<mark>');
		});

		test('marks at text boundaries', () => {
			const fragments = render_syntax_html_lines(lex('abc', 'plaintext'), {
				marks: [{ start: 0, end: 3 }]
			});
			assert.deepEqual(fragments, ['<mark>abc</mark>']);
		});

		test('an empty marks array marks nothing', () => {
			const text = 'const a = 1;\n';
			assert.deepEqual(
				render_syntax_html_lines(lex(text, 'ts'), { marks: [] }),
				render_syntax_html_lines(lex(text, 'ts'))
			);
		});

		test('a mark over only a newline emits nothing', () => {
			const fragments = render_syntax_html_lines(lex('ab\ncd', 'plaintext'), {
				marks: [{ start: 2, end: 3 }]
			});
			assert.deepEqual(fragments, ['ab', 'cd']);
		});

		test('a mark running past the text ends with it', () => {
			const fragments = render_syntax_html_lines(lex('abc', 'plaintext'), {
				marks: [{ start: 1, end: 100 }]
			});
			assert.deepEqual(fragments, ['a<mark>bc</mark>']);
		});

		test('touching marks stay separate', () => {
			const fragments = render_syntax_html_lines(lex('abcd', 'plaintext'), {
				marks: [
					{ start: 0, end: 2 },
					{ start: 2, end: 4 }
				]
			});
			assert.deepEqual(fragments, ['<mark>ab</mark><mark>cd</mark>']);
		});

		test('a mark matching a token sits inside its span', () => {
			const fragments = render_syntax_html_lines(lex('const a = 1;', 'ts'), {
				marks: [{ start: 0, end: 5 }]
			});
			assert.isTrue(
				fragments[0]!.startsWith('<span class="token_keyword"><mark>const</mark></span> a')
			);
		});

		test('a mark leaving a token is cut at the token edge', () => {
			const fragments = render_syntax_html_lines(lex('const a = 1;', 'ts'), {
				marks: [{ start: 3, end: 7 }]
			});
			assert.isTrue(
				fragments[0]!.startsWith(
					'<span class="token_keyword">con<mark>st</mark></span><mark> a</mark> '
				)
			);
		});

		test('marked text escapes like the rest', () => {
			const fragments = render_syntax_html_lines(lex('a<&>b', 'plaintext'), {
				marks: [{ start: 1, end: 4 }]
			});
			assert.deepEqual(fragments, ['a<mark>&lt;&amp;></mark>b']);
		});

		describe('random marks over samples', () => {
			for (const lang of sample_langs) {
				test(`sample_complex.${lang} stays balanced and marks exactly the ranges`, () => {
					const content = readFileSync(`src/test/fixtures/samples/sample_complex.${lang}`, 'utf8');
					const random = create_random(7);
					for (let round = 0; round < 5; round++) {
						// sorted, non-empty, non-overlapping ranges of mixed sizes
						const marks: Array<SyntaxHtmlMark> = [];
						let at = 0;
						while (at < content.length) {
							const start = at + Math.floor(random() * 40);
							const end = start + 1 + Math.floor(random() * (random() < 0.2 ? 200 : 12));
							if (end > content.length) break;
							marks.push({ start, end });
							at = end + Math.floor(random() * 3);
						}
						const fragments = render_syntax_html_lines(lex(content, lang), { marks });
						const expected_lines = content.replaceAll('\xa0', ' ').split('\n');
						assert.deepEqual(fragments.map(strip_tags), expected_lines);
						let expected_marked = '';
						for (const mark of marks) expected_marked += content.slice(mark.start, mark.end);
						expected_marked = expected_marked.replaceAll('\n', '').replaceAll('\xa0', ' ');
						let marked = '';
						for (const fragment of fragments) {
							assert_balanced(fragment);
							assert_marks_wrap_text(fragment);
							marked += marked_text(fragment);
						}
						assert.strictEqual(marked, expected_marked);
					}
				});
			}
		});
	});
});
