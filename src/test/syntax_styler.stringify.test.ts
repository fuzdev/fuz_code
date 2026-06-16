import {test, assert, describe} from 'vitest';

import {SyntaxStyler} from '$lib/syntax_styler.ts';
import {syntax_styler_global} from '$lib/syntax_styler_global.ts';
import {SyntaxToken} from '$lib/syntax_token.ts';

/**
 * Tests for `SyntaxStyler.stringify_token` — HTML escaping of leaf text, span
 * wrapping (the no-hook fast path), and the `wrap` hook (the slow path).
 *
 * `stringify_token` needs no grammar, so token streams are built by hand. The
 * non-breaking space is built with `String.fromCharCode` so the intent can't be
 * silently mangled into a regular space by an editor or formatter.
 */

const nbsp = String.fromCharCode(0xa0);

describe('stringify_token text escaping', () => {
	test('escapes & and < in leaf text', () => {
		assert.equal(syntax_styler_global.stringify_token('a & b < c', 'js'), 'a &amp; b &lt; c');
	});

	test('does not escape > or " in text content', () => {
		// only `&` and `<` are required to be escaped in HTML text nodes
		assert.equal(syntax_styler_global.stringify_token('a > b " c', 'js'), 'a > b " c');
	});

	test('normalizes a non-breaking space to a regular space', () => {
		assert.equal(syntax_styler_global.stringify_token('a' + nbsp + 'b', 'js'), 'a b');
	});

	test('does not double-escape the & introduced by escaping <', () => {
		// `<` -> `&lt;`, and the produced `&` must NOT become `&amp;lt;`
		assert.equal(syntax_styler_global.stringify_token('<', 'js'), '&lt;');
	});

	test('escapes a literal ampersand once', () => {
		assert.equal(syntax_styler_global.stringify_token('&lt;', 'js'), '&amp;lt;');
	});

	test('handles all three escapes together in one pass', () => {
		// & -> &amp;, < -> &lt;, nbsp -> space, > untouched
		assert.equal(syntax_styler_global.stringify_token('&<' + nbsp + '>', 'js'), '&amp;&lt; >');
	});
});

describe('stringify_token span wrapping (no-hook fast path)', () => {
	test('wraps a token in a span with its token_ class', () => {
		const token = new SyntaxToken('keyword', 'const', undefined, 'const');
		assert.equal(
			syntax_styler_global.stringify_token(token, 'js'),
			'<span class="token_keyword">const</span>',
		);
	});

	test('appends a token_ class for each alias', () => {
		const token = new SyntaxToken('keyword', 'fn', ['special_keyword', 'reserved'], 'fn');
		assert.equal(
			syntax_styler_global.stringify_token(token, 'js'),
			'<span class="token_keyword token_special_keyword token_reserved">fn</span>',
		);
	});

	test('escapes string content inside the span', () => {
		const token = new SyntaxToken('string', 'a & b', undefined, 'a & b');
		assert.equal(
			syntax_styler_global.stringify_token(token, 'js'),
			'<span class="token_string">a &amp; b</span>',
		);
	});

	test('recurses into nested token content, escaping leaves', () => {
		const token = new SyntaxToken(
			'tag',
			[new SyntaxToken('punctuation', '<', undefined, '<'), 'a & b'],
			undefined,
			'<a & b',
		);
		assert.equal(
			syntax_styler_global.stringify_token(token, 'js'),
			'<span class="token_tag"><span class="token_punctuation">&lt;</span>a &amp; b</span>',
		);
	});

	test('concatenates a token stream array', () => {
		const stream = [new SyntaxToken('keyword', 'const', undefined, 'const'), ' x'];
		assert.equal(
			syntax_styler_global.stringify_token(stream, 'js'),
			'<span class="token_keyword">const</span> x',
		);
	});
});

describe('stringify_token wrap hook (slow path)', () => {
	test('a registered wrap hook can add attributes', () => {
		const styler = new SyntaxStyler();
		styler.add_hook_wrap((ctx) => {
			ctx.attributes['data-type'] = ctx.type;
		});
		const token = new SyntaxToken('keyword', 'const', undefined, 'const');
		assert.equal(
			styler.stringify_token(token, 'js'),
			'<span class="token_keyword" data-type="keyword">const</span>',
		);
	});

	test('a wrap hook can change the tag and push classes', () => {
		const styler = new SyntaxStyler();
		styler.add_hook_wrap((ctx) => {
			ctx.tag = 'mark';
			ctx.classes.push('extra');
		});
		const token = new SyntaxToken('keyword', 'const', undefined, 'const');
		assert.equal(
			styler.stringify_token(token, 'js'),
			'<mark class="token_keyword extra">const</mark>',
		);
	});

	test('attribute values have their double quotes escaped', () => {
		const styler = new SyntaxStyler();
		styler.add_hook_wrap((ctx) => {
			ctx.attributes['data-x'] = 'a"b';
		});
		const token = new SyntaxToken('keyword', 'const', undefined, 'const');
		assert.equal(
			styler.stringify_token(token, 'js'),
			'<span class="token_keyword" data-x="a&quot;b">const</span>',
		);
	});

	test('the hook receives the resolved token type, content, and classes', () => {
		const styler = new SyntaxStyler();
		let seen_type: string | undefined;
		let seen_content: string | undefined;
		let seen_classes: Array<string> | undefined;
		styler.add_hook_wrap((ctx) => {
			seen_type = ctx.type;
			seen_content = ctx.content;
			seen_classes = [...ctx.classes];
		});
		const token = new SyntaxToken('string', 'a & b', ['quoted'], 'a & b');
		styler.stringify_token(token, 'ts');
		assert.equal(seen_type, 'string');
		assert.equal(seen_content, 'a &amp; b'); // content is already escaped when the hook runs
		assert.deepEqual(seen_classes, ['token_string', 'token_quoted']);
	});
});
