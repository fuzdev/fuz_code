import { describe, test, assert } from 'vitest';

import { lexer_markup } from '#lib/lexer_markup.ts';
import { lexer_svelte } from '#lib/lexer_svelte.ts';
import { lexer_md } from '#lib/lexer_md.ts';
import type { SyntaxLang } from '#lib/lexer.ts';

/**
 * Calls `lang.snippet_prefix` over `snippets` in order, as one text's
 * consecutive snippets, returning each prefix.
 */
const prefixes = (lang: SyntaxLang, snippets: Array<string>): Array<string> => {
	let state: unknown = null;
	return snippets.map((snippet) => {
		const result = lang.snippet_prefix!(snippet.split('\n'), state);
		state = result.state;
		return result.prefix;
	});
};

const prefix = (lang: SyntaxLang, snippet: string): string => prefixes(lang, [snippet])[0]!;

const SCRIPT = '<script lang="ts">\n';
const STYLE = '<style>\n';

describe('svelte snippet_prefix', () => {
	test('a closing tag means its region was open', () => {
		assert.strictEqual(prefix(lexer_svelte, 'const a = 1;\n</script>\n\n<div></div>'), SCRIPT);
		assert.strictEqual(prefix(lexer_svelte, '\tcolor: red;\n</style>'), STYLE);
		assert.strictEqual(prefix(lexer_svelte, '}\n</SCRIPT>'), SCRIPT);
	});

	test('an opening tag means no region was open', () => {
		assert.strictEqual(prefix(lexer_svelte, 'x = 1;\n<script lang="ts">\n\tconst a = 1;'), '');
	});

	test('a tag name has to end there', () => {
		// `<scripts` is no script tag, and the line starts like markup
		assert.strictEqual(prefix(lexer_svelte, '<scripts>\n</scripts>'), '');
	});

	test('a line starting like markup means the template', () => {
		assert.strictEqual(prefix(lexer_svelte, '\tconst a = 1;\n<div>{a}</div>'), '');
		assert.strictEqual(prefix(lexer_svelte, '{#if a}\n\tb\n{/if}'), '');
		assert.strictEqual(prefix(lexer_svelte, 'text\n{@html a}'), '');
	});

	test('script-like lines with no tag are in the script', () => {
		assert.strictEqual(prefix(lexer_svelte, '\tconst a = 1;\n\tlet b = a + 1;'), SCRIPT);
	});

	test('CSS-like lines are in the style', () => {
		assert.strictEqual(prefix(lexer_svelte, '\t.a {\n\t\tcolor: red;\n\t\tmargin: 0;\n\t}'), STYLE);
		assert.strictEqual(prefix(lexer_svelte, '\tgap: var(--space_md);'), STYLE);
	});

	test('a region carries from the tags earlier snippets showed', () => {
		assert.deepEqual(
			prefixes(lexer_svelte, ['<script lang="ts">\n\tconst a = 1;', '\tlet b = 2;\n\tb++;']),
			['', SCRIPT]
		);
		// a closed region carries as none, and the template line keeps it there
		assert.deepEqual(prefixes(lexer_svelte, ['\tconst a = 1;\n</script>', 'x\n<p>a</p>']), [
			SCRIPT,
			''
		]);
	});

	test('a guess never carries', () => {
		// the first snippet's script is a guess, so the second guesses afresh
		assert.deepEqual(prefixes(lexer_svelte, ['\tconst a = 1;', '\tcolor: red;']), [SCRIPT, STYLE]);
	});

	test('past the template, a snippet with no script-like line is in the style', () => {
		assert.deepEqual(prefixes(lexer_svelte, ['<p>a</p>', '\tdisplay: flex;\n\tb {']), ['', STYLE]);
		// a script-like line still says script
		assert.deepEqual(prefixes(lexer_svelte, ['<p>a</p>', '\tconst a = () => 1;']), ['', SCRIPT]);
	});

	test('a snippet inside a block comment gets its opener', () => {
		assert.strictEqual(
			prefix(lexer_svelte, '\t * a comment\n\t */\n\tconst a = 1;'),
			SCRIPT + '/*\n'
		);
		// in the template, a comment is markup's, so no `/*`
		assert.strictEqual(prefix(lexer_svelte, '<p>a</p>\n * b */'), '');
	});

	test('a template snippet inside a start tag gets an opening tag', () => {
		assert.strictEqual(
			prefix(lexer_svelte, '\tclass="a"\n\t{onclick}\n>\n\t<span>text</span>'),
			'<x\n'
		);
		assert.strictEqual(prefix(lexer_svelte, '\tdisabled\n/>\n<p></p>'), '<x\n');
		// an arrow isn't a tag's end
		assert.strictEqual(prefix(lexer_svelte, '\ta\n\tb =>\n<p></p>'), '');
		// nor is a line starting a tag
		assert.strictEqual(prefix(lexer_svelte, '\ta\n<p>\n'), '');
		// a long run is more likely text than one tag's attributes
		const attributes = (count: number) =>
			Array.from({ length: count }, (_, i) => `\ta${i}`).join('\n') + '\n>\n<p></p>';
		assert.strictEqual(prefix(lexer_svelte, attributes(11)), '<x\n');
		assert.strictEqual(prefix(lexer_svelte, attributes(12)), '');
	});
});

describe('markup snippet_prefix', () => {
	test("opens HTML's own tags", () => {
		assert.strictEqual(prefix(lexer_markup, '\tconst a = 1;\n</script>'), '<script>\n');
		assert.strictEqual(prefix(lexer_markup, '\tcolor: red;\n</style>'), STYLE);
	});

	test('has no file-order cue', () => {
		assert.deepEqual(prefixes(lexer_markup, ['<p>a</p>', '\tdisplay(flex)']), ['', '<script>\n']);
	});
});

describe('md snippet_prefix', () => {
	test('a fence with an info string opens, so nothing was open', () => {
		assert.strictEqual(prefix(lexer_md, 'text\n\n```ts\nconst a = 1;'), '');
	});

	test('a bare fence ending a run of lines closes one, its language guessed', () => {
		assert.strictEqual(prefix(lexer_md, 'const a = 1;\n```\n\nmore'), '```ts\n');
		assert.strictEqual(prefix(lexer_md, 'gro check\n```'), '```sh\n');
		assert.strictEqual(prefix(lexer_md, '\t$ ls\n```'), '```sh\n');
		assert.strictEqual(prefix(lexer_md, 'export FOO=1\n```'), '```sh\n');
		assert.strictEqual(prefix(lexer_md, 'pub fn a() {}\n```'), '```rust\n');
		assert.strictEqual(prefix(lexer_md, 'use std::fs;\n```'), '```rust\n');
		assert.strictEqual(prefix(lexer_md, '{#if a}{/if}\n~~~~'), '~~~~svelte\n');
	});

	test('a bare fence not ending a run of lines is taken as an opener', () => {
		assert.strictEqual(prefix(lexer_md, 'text\n\n```\nplain'), '');
		assert.strictEqual(prefix(lexer_md, '```\nplain'), '');
	});

	test('an open fence carries until a fence closes it', () => {
		assert.deepEqual(prefixes(lexer_md, ['text\n```ts\nconst a = 1;', 'let b = 2;', 'b++;\n```']), [
			'',
			'```ts\n',
			'```ts\n'
		]);
		// a shorter fence or another char doesn't close it
		assert.deepEqual(prefixes(lexer_md, ['````md\na', '```\nb', '~~~~\nc', '````\n', 'd']), [
			'',
			'````md\n',
			'````md\n',
			'````md\n',
			''
		]);
	});

	test('no fence and nothing open means no prefix', () => {
		assert.strictEqual(prefix(lexer_md, '# heading\n\ntext'), '');
	});
});
