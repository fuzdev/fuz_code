import { describe, test, assert } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';

import {
	create_syntax_line_index,
	render_syntax_html_line_range,
	render_syntax_html_lines,
	type LexedSyntax,
	type SyntaxHtmlMark
} from '#lib/lexer.ts';
import { syntax_styler_global } from '#lib/syntax_styler_global.ts';
import { create_random } from './html_test_helpers.ts';

const lex = (text: string, lang: string): LexedSyntax => syntax_styler_global.lex(text, lang);

// every line, then random ranges, each equal to the whole render's slice
const assert_ranges_match = (
	lexed: LexedSyntax,
	random: () => number,
	marks?: Array<SyntaxHtmlMark>
): void => {
	const whole = render_syntax_html_lines(lexed, { marks });
	const index = create_syntax_line_index(lexed);
	assert.lengthOf(index.line_starts, whole.length);
	for (let i = 0; i < whole.length; i++) {
		assert.deepEqual(
			render_syntax_html_line_range(lexed, index, i, i + 1, { marks }),
			[whole[i]!],
			`line ${i + 1}`
		);
	}
	for (let round = 0; round < 20; round++) {
		const start = Math.floor(random() * whole.length);
		const end = start + Math.floor(random() * (whole.length - start + 1));
		assert.deepEqual(
			render_syntax_html_line_range(lexed, index, start, end, { marks }),
			whole.slice(start, end),
			`lines [${start}, ${end})`
		);
	}
};

const random_marks = (text: string, random: () => number): Array<SyntaxHtmlMark> => {
	const marks: Array<SyntaxHtmlMark> = [];
	let at = 0;
	while (at < text.length) {
		const start = at + Math.floor(random() * 40);
		const end = start + 1 + Math.floor(random() * (random() < 0.2 ? 200 : 12));
		if (end > text.length) break;
		marks.push({ start, end });
		at = end + Math.floor(random() * 3);
	}
	return marks;
};

describe('create_syntax_line_index', () => {
	test('line starts follow the newlines', () => {
		const index = create_syntax_line_index(lex('a\nbc\n\nd', 'plaintext'));
		assert.deepEqual([...index.line_starts], [0, 2, 5, 6]);
	});

	test('records the containers open at each line start', () => {
		const lexed = lex('const s = `one\ntwo ${\nx}`;\n', 'ts');
		const index = create_syntax_line_index(lexed);
		const depth = (line: number): number => {
			let d = 0;
			for (let n = index.line_containers[line]!; n !== -1; n = index.container_parents[n]!) d++;
			return d;
		};
		assert.strictEqual(depth(0), 0);
		assert.isAbove(depth(1), 0);
		assert.isAbove(depth(2), depth(1));
		assert.strictEqual(depth(3), 0);
	});

	test('stays linear in the events for containers nested a line at a time', () => {
		const nested = (depth: number): string => '`${\n'.repeat(depth) + '}`\n'.repeat(depth);
		// one node per open event, against the depth times lines a stack per line costs
		const deep = lex(nested(3000), 'ts');
		const deep_index = create_syntax_line_index(deep);
		assert.isBelow(deep_index.container_types.length, deep.events_len);
		assert.strictEqual(deep_index.container_parents.length, deep_index.container_types.length);
		// the deepest lines still render as the whole render does, checked shallower:
		// the whole render reopens every container on every line, quadratic in the depth
		const depth = 300;
		const lexed = lex(nested(depth), 'ts');
		const index = create_syntax_line_index(lexed);
		const whole = render_syntax_html_lines(lexed);
		for (const line of [0, 1, depth - 1, depth, depth + 1, 2 * depth]) {
			assert.deepEqual(render_syntax_html_line_range(lexed, index, line, line + 1), [whole[line]!]);
		}
	});
});

describe('render_syntax_html_line_range', () => {
	test('empty text has one empty line', () => {
		const lexed = lex('', 'ts');
		assert.deepEqual(render_syntax_html_line_range(lexed, create_syntax_line_index(lexed), 0, 1), [
			''
		]);
	});

	test('clamps the range to the lines', () => {
		const lexed = lex('a\nb\n', 'ts');
		const index = create_syntax_line_index(lexed);
		assert.deepEqual(render_syntax_html_line_range(lexed, index, -5, 99), ['a', 'b', '']);
		assert.deepEqual(render_syntax_html_line_range(lexed, index, 2, 1), []);
		assert.deepEqual(render_syntax_html_line_range(lexed, index, 7, 9), []);
	});

	test('a line inside a multi-line leaf opens inside it', () => {
		const lexed = lex('a {}\n/* one\ntwo\nthree */\nb {}', 'css');
		const index = create_syntax_line_index(lexed);
		assert.deepEqual(render_syntax_html_line_range(lexed, index, 2, 3), [
			'<span class="token_comment">two</span>'
		]);
	});

	test('a leaf ending at a line start, and a container closing there', () => {
		for (const [text, lang] of [
			['/* a\n*/\nx', 'css'],
			['/* a\n\n*/', 'css'],
			['`a${\n}`\nb', 'ts'],
			['<div\n>\n</div>\n', 'html'],
			['# a\n\n```ts\nconst a = `\n`;\n```\n', 'md']
		] as const) {
			assert_ranges_match(lex(text, lang), create_random(1));
		}
	});

	describe('matches the whole render on every sample', () => {
		const dir = 'src/test/fixtures/samples';
		for (const file of readdirSync(dir)) {
			const lang = file.slice(file.lastIndexOf('.') + 1);
			test(file, () => {
				const content = readFileSync(`${dir}/${file}`, 'utf8');
				const random = create_random(3);
				assert_ranges_match(lex(content, lang), random);
				assert_ranges_match(lex(content, lang), random, random_marks(content, random));
			});
		}
	});
});
