import {describe, test, assert} from 'vitest';
import {readFileSync} from 'node:fs';

import {syntax_styler_global} from '$lib/syntax_styler_global.ts';
import {syntax_events_to_tokens, validate_syntax_events} from '$lib/lexer.ts';

/**
 * Lexes `text` as ts and returns `[type, text]` pairs.
 * Containers appear before their children with their full span text.
 */
const tokens_of = (text: string): Array<[string, string]> =>
	syntax_events_to_tokens(syntax_styler_global.lex(text, 'ts')).map((t) => [
		t.type,
		text.slice(t.start, t.end),
	]);

/**
 * Like `tokens_of` but only `[type, text]` of the named types — for targeted
 * assertions that ignore surrounding punctuation/operators.
 */
const picked = (text: string, types: Array<string>): Array<[string, string]> =>
	tokens_of(text).filter(([type]) => types.includes(type));

describe('lexer_ts keywords', () => {
	test('main and special keywords', () => {
		assert.deepEqual(picked('if (x) return new Foo();', ['keyword', 'special_keyword']), [
			['special_keyword', 'if'],
			['special_keyword', 'return'],
			['keyword', 'new'],
		]);
	});

	test('keywords after member access are properties, not keywords', () => {
		assert.deepEqual(picked('a.delete(); b?.new;', ['keyword', 'special_keyword']), []);
		// and `a.delete()` is a function call
		assert.deepEqual(picked('a.delete();', ['function']), [['function', 'delete']]);
	});

	test('contextual keywords', () => {
		assert.deepEqual(picked('async () => x; const get = 1; get x() {}', ['keyword']), [
			['keyword', 'async'],
			['keyword', 'const'],
			['keyword', 'get'],
		]);
	});

	test('null and undefined are keywords, true/false booleans, NaN a number', () => {
		assert.deepEqual(tokens_of('null undefined true NaN'), [
			['keyword', 'null'],
			['keyword', 'undefined'],
			['boolean', 'true'],
			['number', 'NaN'],
		]);
	});
});

describe('lexer_ts strings and templates', () => {
	test('string properties in object literals', () => {
		assert.deepEqual(picked('{"a": 1, \'b\': 2}', ['string_property', 'string']), [
			['string_property', '"a"'],
			['string_property', "'b'"],
		]);
	});

	test('ternary strings are not properties', () => {
		assert.deepEqual(picked('x ? "a" : "b"', ['string_property', 'string']), [
			['string', '"a"'],
			['string', '"b"'],
		]);
	});

	test('strings containing // are not comments', () => {
		assert.deepEqual(picked('const a = "x // y";', ['string', 'comment']), [
			['string', '"x // y"'],
		]);
	});

	test('template strings with interpolation', () => {
		const tokens = tokens_of('`a${b}c`');
		assert.deepEqual(tokens, [
			['template_string', '`a${b}c`'],
			['template_punctuation', '`'],
			['string', 'a'],
			['interpolation', '${b}'],
			['interpolation_punctuation', '${'],
			['interpolation_punctuation', '}'],
			['string', 'c'],
			['template_punctuation', '`'],
		]);
	});

	test('nested templates in interpolations', () => {
		const text = '`a${`b${c}`}d`';
		const lexed = syntax_styler_global.lex(text, 'ts');
		assert.deepEqual(validate_syntax_events(lexed), []);
		const types = syntax_events_to_tokens(lexed).map((t) => t.type);
		assert.strictEqual(types.filter((t) => t === 'template_string').length, 2);
	});

	test('unterminated template extends to end', () => {
		const lexed = syntax_styler_global.lex('`abc', 'ts');
		assert.deepEqual(validate_syntax_events(lexed), []);
		const tokens = syntax_events_to_tokens(lexed);
		assert.strictEqual(tokens[0]!.type, 'template_string');
		assert.strictEqual(tokens[0]!.end, 4);
	});
});

describe('lexer_ts regex vs division', () => {
	test('regex literal in expression position', () => {
		assert.deepEqual(picked('const re = /ab+c/gi;', ['regex', 'regex_source', 'regex_flags']), [
			['regex', '/ab+c/gi'],
			['regex_source', 'ab+c'],
			['regex_flags', 'gi'],
		]);
	});

	test('division is not a regex', () => {
		assert.deepEqual(picked('const x = a / b / c;', ['regex']), []);
	});

	test('regex after return keyword', () => {
		assert.deepEqual(picked('return /x/;', ['regex']), [['regex', '/x/']]);
	});

	test('regex with slash in character class', () => {
		assert.deepEqual(picked('x = /[/]/;', ['regex']), [['regex', '/[/]/']]);
	});
});

describe('lexer_ts identifiers', () => {
	test('class contexts', () => {
		assert.deepEqual(picked('class Foo extends Bar {}', ['class_name']), [
			['class_name', 'Foo'],
			['class_name', 'Bar'],
		]);
		assert.deepEqual(picked('new a.b.Thing()', ['class_name']), [
			['class_name', 'a'],
			['class_name', 'b'],
			['class_name', 'Thing'],
		]);
	});

	test('constants and capitalized identifiers', () => {
		assert.deepEqual(tokens_of('MAX_VALUE Foo'), [
			['constant', 'MAX_VALUE'],
			['capitalized_identifier', 'Foo'],
		]);
	});

	test('function calls and function-valued variables', () => {
		assert.deepEqual(picked('foo(); const f = (a) => a;', ['function', 'function_variable']), [
			['function', 'foo'],
			['function_variable', 'f'],
		]);
	});

	test('generic function calls', () => {
		const tokens = tokens_of('foo<Bar>(x)');
		assert.deepEqual(tokens[0], ['generic_function', 'foo<Bar>']);
		assert.deepEqual(picked('foo<Bar>(x)', ['function', 'type_name']), [
			['function', 'foo'],
			['type_name', 'Bar'],
		]);
	});

	test('comparisons are not generics', () => {
		assert.deepEqual(picked('a < b; c > d;', ['generic_function']), []);
		assert.deepEqual(picked('a < b; c > d;', ['operator']), [
			['operator', '<'],
			['operator', '>'],
		]);
	});

	test('lowercase builtins', () => {
		assert.deepEqual(picked('console.log(x); const s: unknown = 1;', ['builtin']), [
			['builtin', 'console'],
			['builtin', 'unknown'], // inside the type annotation region
		]);
	});
});

describe('lexer_ts type syntax', () => {
	test('type alias declarations', () => {
		assert.deepEqual(picked('type Foo = Bar;', ['keyword', 'class_name']), [
			['keyword', 'type'],
			['class_name', 'Foo'],
		]);
	});

	test('import type', () => {
		assert.deepEqual(picked("import type {A} from 'b';", ['import_type_keyword']), [
			['import_type_keyword', 'type'],
		]);
	});

	test('type assertions with as and satisfies', () => {
		assert.deepEqual(picked('x as Foo; y satisfies Baz;', ['type_assertion']), [
			['type_assertion', 'Foo'],
			['type_assertion', 'Baz'],
		]);
	});

	test('type annotations with initializers', () => {
		const tokens = tokens_of('const x: Map<string, Foo> = y;');
		const annotation = tokens.find(([type]) => type === 'type_annotation');
		assert.ok(annotation);
		assert.deepEqual(picked('const x: Map<string, Foo> = y;', ['type_name']), [
			['type_name', 'Map'],
			['type_name', 'Foo'],
		]);
	});

	test('object literal colons are not annotations', () => {
		assert.deepEqual(picked('const o = {a: b};', ['type_annotation']), []);
	});
});

describe('lexer_ts decorators and misc', () => {
	test('decorators', () => {
		assert.deepEqual(tokens_of('@component'), [
			['decorator', '@component'],
			['at', '@'],
			['function', 'component'],
		]);
	});

	test('hashbang', () => {
		assert.deepEqual(tokens_of('#!/usr/bin/env node\nx')[0], ['hashbang', '#!/usr/bin/env node']);
	});

	test('numeric formats', () => {
		assert.deepEqual(picked('0xff 0b10 1_000n 1.5e-3 .5', ['number']), [
			['number', '0xff'],
			['number', '0b10'],
			['number', '1_000n'],
			['number', '1.5e-3'],
			['number', '.5'],
		]);
	});

	test('spread and optional chaining operators', () => {
		assert.deepEqual(picked('f(...a); b?.c ?? d;', ['operator']), [
			['operator', '...'],
			['operator', '?.'],
			['operator', '??'],
		]);
	});
});

describe('lexer_ts sample', () => {
	const content = readFileSync('src/test/fixtures/samples/sample_complex.ts', 'utf8');

	test('sample lexes with valid invariants', () => {
		const lexed = syntax_styler_global.lex(content, 'ts');
		assert.deepEqual(validate_syntax_events(lexed), []);
	});

	test('every prefix lexes without throwing, with valid invariants', () => {
		for (let len = 0; len <= content.length; len += 13) {
			const prefix = content.slice(0, len);
			const lexed = syntax_styler_global.lex(prefix, 'ts');
			const issues = validate_syntax_events(lexed);
			assert.deepEqual(issues, [], `prefix of length ${len}`);
		}
	});

	test('lexing is deterministic', () => {
		const a = syntax_events_to_tokens(syntax_styler_global.lex(content, 'ts'));
		const b = syntax_events_to_tokens(syntax_styler_global.lex(content, 'ts'));
		assert.deepEqual(a, b);
	});
});
