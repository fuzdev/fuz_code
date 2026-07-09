import {describe, test, assert} from 'vitest';
import {readFileSync} from 'node:fs';

import {syntax_styler_global} from '$lib/syntax_styler_global.ts';
import {syntax_events_to_tokens, validate_syntax_events} from '$lib/lexer.ts';

const tokens_of = (text: string): Array<[string, string]> =>
	syntax_events_to_tokens(syntax_styler_global.lex(text, 'bash')).map((t) => [
		t.type,
		text.slice(t.start, t.end),
	]);

const picked = (text: string, types: Array<string>): Array<[string, string]> =>
	tokens_of(text).filter(([type]) => types.includes(type));

describe('lexer_bash words', () => {
	test('keywords, builtins, booleans by lookup', () => {
		assert.deepEqual(picked('if true; then echo hi; fi', ['keyword', 'builtin', 'boolean']), [
			['keyword', 'if'],
			['boolean', 'true'],
			['keyword', 'then'],
			['builtin', 'echo'],
			['keyword', 'fi'],
		]);
	});

	test('word boundaries — local_var is not the local keyword', () => {
		assert.deepEqual(picked('local_var=1', ['keyword']), []);
		assert.deepEqual(picked('local x=1', ['keyword']), [['keyword', 'local']]);
	});

	test('function definitions, both styles', () => {
		assert.deepEqual(picked('greet() { :; }', ['function']), [['function', 'greet']]);
		assert.deepEqual(picked('function cleanup { :; }', ['keyword', 'function']), [
			['keyword', 'function'],
			['function', 'cleanup'],
		]);
	});
});

describe('lexer_bash variables and expansions', () => {
	test('special, braced, and named variables', () => {
		assert.deepEqual(picked('echo $0 $@ ${name} ${arr[0]} $HOME', ['variable']), [
			['variable', '$0'],
			['variable', '$@'],
			['variable', '${name}'],
			['variable', '${arr[0]}'],
			['variable', '$HOME'],
		]);
	});

	test('command substitution is a container with nested bash', () => {
		assert.deepEqual(tokens_of('$(echo hi)'), [
			['command_substitution', '$(echo hi)'],
			['punctuation', '$('],
			['builtin', 'echo'],
			['punctuation', ')'],
		]);
	});

	test('nested command substitution inside a double-quoted string', () => {
		const lexed = syntax_styler_global.lex('"a $(echo "b $(echo c)")"', 'bash');
		assert.deepEqual(validate_syntax_events(lexed), []);
		const types = syntax_events_to_tokens(lexed).map((t) => t.type);
		assert.strictEqual(types.filter((t) => t === 'command_substitution').length, 2);
		assert.strictEqual(types.filter((t) => t === 'string').length, 2);
	});

	test('double-quoted strings expand, single-quoted do not', () => {
		assert.deepEqual(picked('"$a" \'$a\'', ['string', 'variable']), [
			['string', '"$a"'],
			['variable', '$a'],
			['string', "'$a'"],
		]);
	});

	test('a bare $ before a non-name char is plain', () => {
		assert.deepEqual(picked('"x$"', ['variable']), []);
	});
});

describe('lexer_bash arithmetic', () => {
	test('$((…)) is distinct from command substitution', () => {
		const tokens = tokens_of('$(( 2 + 3 ))');
		assert.deepEqual(picked('$(( 2 + 3 ))', ['command_substitution']), []);
		assert.deepEqual(tokens, [
			['punctuation', '$(('],
			['number', '2'],
			['number', '3'],
			['punctuation', '))'],
		]);
	});

	test('$(…) command substitution still parses', () => {
		assert.deepEqual(picked('$(date)', ['command_substitution']), [
			['command_substitution', '$(date)'],
		]);
	});
});

describe('lexer_bash numbers, operators, descriptors', () => {
	test('number formats', () => {
		assert.deepEqual(picked('x=0xFF y=077 z=2#1010 w=42', ['number']), [
			['number', '0xFF'],
			['number', '077'],
			['number', '2#1010'],
			['number', '42'],
		]);
	});

	test('operators and here-string vs heredoc', () => {
		assert.deepEqual(picked('a || b && c | d <<< e', ['operator']), [
			['operator', '||'],
			['operator', '&&'],
			['operator', '|'],
			['operator', '<<<'],
		]);
	});

	test('file descriptors around redirections', () => {
		assert.deepEqual(picked('cmd 2>&1', ['file_descriptor', 'operator']), [
			['file_descriptor', '2'],
			['operator', '>'],
			['file_descriptor', '&1'],
		]);
	});

	test('bare = is plain, but == and =~ are operators', () => {
		assert.deepEqual(picked('x=1; [[ $x == 1 ]]; [[ $x =~ a ]]', ['operator']), [
			['operator', '=='],
			['operator', '=~'],
		]);
	});
});

describe('lexer_bash heredocs', () => {
	test('unquoted heredoc is a container that expands variables', () => {
		const text = 'cat <<EOF\nhi ${name}\nEOF\n';
		// `cat` is plain — it is an external command, not a bash builtin
		assert.deepEqual(tokens_of(text), [
			['heredoc', '<<EOF\nhi ${name}\nEOF'],
			['heredoc_delimiter', '<<EOF'],
			['variable', '${name}'],
			['heredoc_delimiter', 'EOF'],
		]);
	});

	test('quoted heredoc does not expand', () => {
		const text = "cat <<'END'\nno $expansion\nEND\n";
		assert.deepEqual(picked(text, ['variable', 'heredoc_delimiter']), [
			['heredoc_delimiter', "<<'END'"],
			['heredoc_delimiter', 'END'],
		]);
	});

	test('<<- allows an indented closing delimiter', () => {
		const text = 'cat <<-EOF\n\tbody\n\tEOF\n';
		const tokens = tokens_of(text);
		assert.ok(tokens.some(([type, t]) => type === 'heredoc_delimiter' && t === 'EOF'));
		assert.deepEqual(validate_syntax_events(syntax_styler_global.lex(text, 'bash')), []);
	});

	test('unterminated heredoc extends to the window end without throwing', () => {
		const lexed = syntax_styler_global.lex('cat <<EOF\nbody with no close\n', 'bash');
		assert.deepEqual(validate_syntax_events(lexed), []);
	});

	test('CRLF line endings still close the heredoc', () => {
		const text = 'cat <<EOF\r\nbody ${x}\r\nEOF\r\n';
		const lexed = syntax_styler_global.lex(text, 'bash');
		assert.deepEqual(validate_syntax_events(lexed), []);
		const tokens = syntax_events_to_tokens(lexed);
		// the closing delimiter is found (not swallowed into a runaway body)
		assert.ok(
			tokens.some((t) => t.type === 'heredoc_delimiter' && text.slice(t.start, t.end) === 'EOF'),
		);
		assert.ok(tokens.some((t) => t.type === 'variable'));
	});
});

describe('lexer_bash comments', () => {
	test('comments require a preceding boundary; $# is a variable', () => {
		assert.deepEqual(picked('echo $# # trailing', ['comment', 'variable']), [
			['variable', '$#'],
			['comment', '# trailing'],
		]);
	});

	test('shebang at file start', () => {
		assert.deepEqual(tokens_of('#!/bin/bash\nx')[0], ['shebang', '#!/bin/bash']);
	});
});

describe('lexer_bash sample', () => {
	const content = readFileSync('src/test/fixtures/samples/sample_complex.bash', 'utf8');

	test('sample lexes with valid invariants', () => {
		const lexed = syntax_styler_global.lex(content, 'bash');
		assert.deepEqual(validate_syntax_events(lexed), []);
	});

	test('every prefix lexes without throwing, with valid invariants', () => {
		for (let len = 0; len <= content.length; len += 11) {
			const prefix = content.slice(0, len);
			const lexed = syntax_styler_global.lex(prefix, 'bash');
			assert.deepEqual(validate_syntax_events(lexed), [], `prefix of length ${len}`);
		}
	});

	test('lexing is deterministic', () => {
		const a = syntax_events_to_tokens(syntax_styler_global.lex(content, 'bash'));
		const b = syntax_events_to_tokens(syntax_styler_global.lex(content, 'bash'));
		assert.deepEqual(a, b);
	});
});
