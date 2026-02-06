import {test, expect, describe} from 'vitest';
import {preprocess, parse} from 'svelte/compiler';

import {svelte_preprocess_code_static} from '$lib/svelte_preprocess_code_static.js';
import {syntax_styler_global} from '$lib/syntax_styler_global.js';

const run = async (input: string): Promise<string> => {
	const result = await preprocess(input, [svelte_preprocess_code_static()], {
		filename: 'Test.svelte',
	});
	return result.code;
};

/** Helper: extract the dangerous_raw_html value from preprocessor output. */
const extract_raw_html = (result: string): string | null => {
	// Match dangerous_raw_html={'...'} - the value is a single-quoted JS string
	const match = /dangerous_raw_html=\{'((?:[^'\\]|\\.)*)'\}/.exec(result);
	if (!match) return null;
	// Unescape the JS string to get the actual HTML
	return match[1]!
		.replace(/\\'/g, "'")
		.replace(/\\n/g, '\n')
		.replace(/\\r/g, '\r')
		.replace(/\\\\/g, '\\');
};

describe('svelte_preprocess_code_static', () => {
	describe('static content transformation', () => {
		test('transforms double-quoted attribute', async () => {
			const input = `<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';
</script>

<Code content="const x = 1;" lang="ts" />`;
			const result = await run(input);

			// Verify content attr is replaced with dangerous_raw_html
			expect(result).not.toContain('content="const');
			expect(result).toContain('dangerous_raw_html=');

			// Verify the HTML matches direct stylize() output
			const raw_html = extract_raw_html(result);
			expect(raw_html).toBe(syntax_styler_global.stylize('const x = 1;', 'ts'));
		});

		test('transforms single-quoted JS expression', async () => {
			const input = `<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';
</script>

<Code content={'const x = 1;'} lang="ts" />`;
			const result = await run(input);

			const raw_html = extract_raw_html(result);
			expect(raw_html).toBe(syntax_styler_global.stylize('const x = 1;', 'ts'));
		});

		test('transforms template literal (no interpolation)', async () => {
			const input =
				'<script lang="ts">\n\timport Code from \'@fuzdev/fuz_code/Code.svelte\';\n</script>\n\n<Code content={`const x = 1;`} lang="ts" />';
			const result = await run(input);

			const raw_html = extract_raw_html(result);
			expect(raw_html).toBe(syntax_styler_global.stylize('const x = 1;', 'ts'));
		});

		test('produces specific token classes for TypeScript', async () => {
			const input = `<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';
</script>

<Code content="const x = 1;" lang="ts" />`;
			const result = await run(input);

			// Verify specific token types are present in the output
			expect(result).toContain('token_keyword');
			expect(result).toContain('token_number');
			expect(result).toContain('token_punctuation');
			expect(result).toContain('token_operator');
		});

		test('defaults to svelte lang when lang not specified', async () => {
			const input = `<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';
</script>

<Code content="<button>Click</button>" />`;
			const result = await run(input);

			const raw_html = extract_raw_html(result);
			expect(raw_html).toBe(syntax_styler_global.stylize('<button>Click</button>', 'svelte'));
		});

		test('handles empty string content', async () => {
			const input = `<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';
</script>

<Code content="" lang="ts" />`;
			const result = await run(input);

			const raw_html = extract_raw_html(result);
			expect(raw_html).toBe(syntax_styler_global.stylize('', 'ts'));
		});

		test('handles multiline content with escaped newlines', async () => {
			const input = `<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';
</script>

<Code content="const x = 1;
const y = 2;" lang="ts" />`;
			const result = await run(input);

			expect(result).toContain('dangerous_raw_html=');
			// Newlines should be escaped in the JS string
			expect(result).toContain('\\n');
			// Verify roundtrip: extracted HTML matches direct stylize
			const raw_html = extract_raw_html(result);
			expect(raw_html).toBe(syntax_styler_global.stylize('const x = 1;\nconst y = 2;', 'ts'));
		});

		test('transforms string concatenation', async () => {
			const input = `<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';
</script>

<Code content={'hello' + ' world'} lang="ts" />`;
			const result = await run(input);

			const raw_html = extract_raw_html(result);
			expect(raw_html).toBe(syntax_styler_global.stylize('hello world', 'ts'));
		});

		test('transforms chained concatenation', async () => {
			const input = `<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';
</script>

<Code content={'a' + 'b' + 'c'} lang="ts" />`;
			const result = await run(input);

			const raw_html = extract_raw_html(result);
			expect(raw_html).toBe(syntax_styler_global.stylize('abc', 'ts'));
		});

		test('transforms concatenation with template literal', async () => {
			const input =
				'<script lang="ts">\n\timport Code from \'@fuzdev/fuz_code/Code.svelte\';\n</script>\n\n<Code content={\'<\' + `script>`} />';
			const result = await run(input);

			const raw_html = extract_raw_html(result);
			expect(raw_html).toBe(syntax_styler_global.stylize('<script>', 'svelte'));
		});
	});

	describe('escaping', () => {
		test('escapes single quotes in highlighted source', async () => {
			const input = `<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';
</script>

<Code content="const x = 'hello';" lang="ts" />`;
			const result = await run(input);

			// The single-quoted JS string must have escaped quotes
			expect(result).toContain("\\'hello\\'");
			// But the extracted HTML should have unescaped quotes
			const raw_html = extract_raw_html(result);
			expect(raw_html).toContain("'hello'");
			expect(raw_html).toBe(syntax_styler_global.stylize("const x = 'hello';", 'ts'));
		});

		test('escapes backslashes in highlighted source', async () => {
			const input = String.raw`<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';
</script>

<Code content="const re = /\\d+/;" lang="ts" />`;
			const result = await run(input);

			expect(result).toContain('dangerous_raw_html=');
			const raw_html = extract_raw_html(result);
			expect(raw_html).toBeTruthy();
		});
	});

	describe('conditional expressions', () => {
		test('transforms ternary with static string branches', async () => {
			const input = `<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';
	let show = true;
</script>

<Code content={show ? 'const x = 1;' : 'let y = 2;'} lang="ts" />`;
			const result = await run(input);

			expect(result).toContain('dangerous_raw_html=');
			expect(result).toContain('show ?');
			expect(result).toContain('token_keyword');
		});

		test('ternary produces correct HTML for both branches', async () => {
			const input = `<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';
	let show = true;
</script>

<Code content={show ? 'const x = 1;' : 'let y = 2;'} lang="ts" />`;
			const result = await run(input);

			// Extract both branches from: dangerous_raw_html={show ? '...' : '...'}
			const match =
				/dangerous_raw_html=\{(\w+) \? '((?:[^'\\]|\\.)*)' : '((?:[^'\\]|\\.)*)'\}/.exec(result);
			expect(match).toBeTruthy();
			expect(match![1]).toBe('show');

			const unescape = (s: string) =>
				s
					.replace(/\\'/g, "'")
					.replace(/\\n/g, '\n')
					.replace(/\\r/g, '\r')
					.replace(/\\\\/g, '\\');

			expect(unescape(match![2]!)).toBe(syntax_styler_global.stylize('const x = 1;', 'ts'));
			expect(unescape(match![3]!)).toBe(syntax_styler_global.stylize('let y = 2;', 'ts'));
		});

		test('ternary with concatenation in branches', async () => {
			const input = `<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';
	let show = true;
</script>

<Code content={show ? 'const ' + 'x = 1;' : 'let y = 2;'} lang="ts" />`;
			const result = await run(input);

			expect(result).toContain('dangerous_raw_html=');
			expect(result).toContain('show ?');
		});

		test('skips ternary with dynamic branch', async () => {
			const input = `<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';
	let show = true;
	const code = 'x';
</script>

<Code content={show ? code : 'let y = 2;'} lang="ts" />`;
			const result = await run(input);

			expect(result).not.toContain('dangerous_raw_html');
		});

		test('ternary output is parseable by Svelte compiler', async () => {
			const input = `<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';
	let show = true;
</script>

<Code content={show ? 'const x = 1;' : 'let y = 2;'} lang="ts" />`;
			const result = await run(input);

			const ast = parse(result, {filename: 'Test.svelte', modern: true});
			expect(ast.fragment.nodes.length).toBeGreaterThan(0);
		});
	});

	describe('dynamic content preservation', () => {
		test('preserves variable reference', async () => {
			const input = `<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';
	const code = 'const x = 1;';
</script>

<Code content={code} lang="ts" />`;
			const result = await run(input);

			expect(result).toContain('content={code}');
			expect(result).not.toContain('dangerous_raw_html');
		});

		test('preserves template literal with interpolation', async () => {
			const input =
				'<script lang="ts">\n\timport Code from \'@fuzdev/fuz_code/Code.svelte\';\n\tconst value = 1;\n</script>\n\n<Code content={`const x = ${value};`} lang="ts" />';
			const result = await run(input);

			expect(result).not.toContain('dangerous_raw_html');
		});

		test('preserves ternary with dynamic branch', async () => {
			const input = `<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';
	let show = true;
	const code = 'a';
</script>

<Code content={show ? code : 'b'} lang="ts" />`;
			const result = await run(input);

			expect(result).not.toContain('dangerous_raw_html');
		});

		test('preserves function call expression', async () => {
			const input = `<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';
	const get_code = () => 'x';
</script>

<Code content={get_code()} lang="ts" />`;
			const result = await run(input);

			expect(result).not.toContain('dangerous_raw_html');
		});

		test('skips when dynamic lang with static content', async () => {
			const input = `<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';
	let lang = 'ts';
</script>

<Code content="const x = 1;" lang={lang} />`;
			const result = await run(input);

			expect(result).not.toContain('dangerous_raw_html');
			expect(result).toContain('content="const x = 1;"');
		});
	});

	describe('skip conditions', () => {
		test('skips custom grammar', async () => {
			const input = `<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';
	const g = {};
</script>

<Code content="x" grammar={g} />`;
			const result = await run(input);

			expect(result).toContain('content="x"');
			expect(result).not.toContain('dangerous_raw_html');
		});

		test('skips custom syntax_styler', async () => {
			const input = `<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';
	const custom_styler = {};
</script>

<Code content="const x = 1;" lang="ts" syntax_styler={custom_styler} />`;
			const result = await run(input);

			expect(result).toContain('content="const x = 1;"');
			expect(result).not.toContain('dangerous_raw_html');
		});

		test('skips unrelated Code component', async () => {
			const input = `<script lang="ts">
	import Code from 'other-package/Code.svelte';
</script>

<Code content="const x = 1;" lang="ts" />`;
			const result = await run(input);

			expect(result).toContain('content="const x = 1;"');
			expect(result).not.toContain('dangerous_raw_html');
		});

		test('skips when lang is null', async () => {
			const input = `<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';
</script>

<Code content="plain text" lang={null} />`;
			const result = await run(input);

			expect(result).toContain('content="plain text"');
			expect(result).not.toContain('dangerous_raw_html');
		});

		test('skips unknown language', async () => {
			const input = `<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';
</script>

<Code content="code" lang="unknown_lang" />`;
			const result = await run(input);

			expect(result).toContain('content="code"');
			expect(result).not.toContain('dangerous_raw_html');
		});

		test('skips files without Code in content', async () => {
			const input = `<script lang="ts">
	const x = 1;
</script>

<p>Hello world</p>`;
			const result = await run(input);

			expect(result).toBe(input);
		});

		test('skips files without matching import', async () => {
			const input = `<script lang="ts">
	// No import of Code component
	const Code = 'just a string';
</script>

<p>Hello world</p>`;
			const result = await run(input);

			expect(result).toBe(input);
		});

		test('skips Code without content attribute', async () => {
			const input = `<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';
</script>

<Code lang="ts" />`;
			const result = await run(input);

			expect(result).not.toContain('dangerous_raw_html');
		});

		test('skips spread attributes (no content to detect)', async () => {
			const input = `<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';
	const props = { content: 'x', lang: 'ts' };
</script>

<Code {...props} />`;
			const result = await run(input);

			expect(result).not.toContain('dangerous_raw_html');
		});
	});

	describe('import resolution', () => {
		test('handles renamed import', async () => {
			const input = `<script lang="ts">
	import Highlighter from '@fuzdev/fuz_code/Code.svelte';
</script>

<Highlighter content="const x = 1;" lang="ts" />`;
			const result = await run(input);

			const raw_html = extract_raw_html(result);
			expect(raw_html).toBe(syntax_styler_global.stylize('const x = 1;', 'ts'));
		});

		test('respects custom component_imports', async () => {
			const input = `<script lang="ts">
	import Code from '$lib/MyCode.svelte';
</script>

<Code content="const x = 1;" lang="ts" />`;
			const result = await preprocess(
				input,
				[
					svelte_preprocess_code_static({
						component_imports: ['$lib/MyCode.svelte'],
					}),
				],
				{filename: 'Test.svelte'},
			);

			expect(result.code).toContain('dangerous_raw_html=');
		});
	});

	describe('prop preservation', () => {
		test('preserves all other props alongside transformation', async () => {
			const input = `<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';
</script>

<Code content="const x = 1;" lang="ts" inline wrap nomargin />`;
			const result = await run(input);

			expect(result).toContain('dangerous_raw_html=');
			expect(result).toContain('lang="ts"');
			expect(result).toContain('inline');
			expect(result).toContain('wrap');
			expect(result).toContain('nomargin');
			// Script block should be unchanged
			expect(result).toContain("import Code from '@fuzdev/fuz_code/Code.svelte'");
		});

		test('attribute order does not matter', async () => {
			const input = `<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';
</script>

<Code lang="ts" content="const x = 1;" />`;
			const result = await run(input);

			const raw_html = extract_raw_html(result);
			expect(raw_html).toBe(syntax_styler_global.stylize('const x = 1;', 'ts'));
			// lang should still be present
			expect(result).toContain('lang="ts"');
		});
	});

	describe('multiple components', () => {
		test('handles mixed static/dynamic', async () => {
			const input = `<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';
	const dynamic_code = 'x';
</script>

<Code content="const x = 1;" lang="ts" />
<Code content={dynamic_code} lang="ts" />
<Code content="let y = 2;" lang="js" />`;
			const result = await run(input);

			// First and third should be transformed
			const matches = result.match(/dangerous_raw_html/g);
			expect(matches).toHaveLength(2);
			// Second should remain dynamic
			expect(result).toContain('content={dynamic_code}');
		});

		test('handles multiple languages with correct output', async () => {
			const input = `<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';
</script>

<Code content="const x = 1;" lang="ts" />
<Code content={'.foo { color: red; }'} lang="css" />
<Code content={'{"key": "value"}'} lang="json" />`;
			const result = await run(input);

			const matches = result.match(/dangerous_raw_html/g);
			expect(matches).toHaveLength(3);
			// Verify CSS-specific tokens
			expect(result).toContain('token_selector');
			// Verify JSON-specific tokens
			expect(result).toContain('token_property');
		});

		test('caches repeated content (identical output)', async () => {
			const input = `<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';
</script>

<Code content="const x = 1;" lang="ts" />
<Code content="const x = 1;" lang="ts" />`;
			const result = await run(input);

			// Extract all dangerous_raw_html values
			const all_matches = [...result.matchAll(/dangerous_raw_html=\{'((?:[^'\\]|\\.)*)'\}/g)];
			expect(all_matches).toHaveLength(2);
			expect(all_matches[0]![1]).toBe(all_matches[1]![1]);
		});
	});

	describe('nesting', () => {
		test('handles Code nested inside other components', async () => {
			const input = `<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';
	import Wrapper from './Wrapper.svelte';
</script>

<Wrapper>
	<Code content="const x = 1;" lang="ts" />
</Wrapper>`;
			const result = await run(input);

			const raw_html = extract_raw_html(result);
			expect(raw_html).toBe(syntax_styler_global.stylize('const x = 1;', 'ts'));
		});

		test('handles Code nested inside HTML elements', async () => {
			const input = `<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';
</script>

<div>
	<Code content="const x = 1;" lang="ts" />
</div>`;
			const result = await run(input);

			const raw_html = extract_raw_html(result);
			expect(raw_html).toBe(syntax_styler_global.stylize('const x = 1;', 'ts'));
		});

		test('handles non-self-closing Code with children snippet', async () => {
			const input = `<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';
</script>

<Code content="const x = 1;" lang="ts">
	{#snippet children(html)}
		<pre>{@html html}</pre>
	{/snippet}
</Code>`;
			const result = await run(input);

			// content should be transformed
			const raw_html = extract_raw_html(result);
			expect(raw_html).toBe(syntax_styler_global.stylize('const x = 1;', 'ts'));
			// children snippet should be preserved
			expect(result).toContain('{#snippet children(html)}');
		});
	});

	describe('output validity', () => {
		test('output is parseable by Svelte compiler', async () => {
			const input = `<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';
</script>

<Code content="const x = 1;" lang="ts" />`;
			const result = await run(input);

			// Should not throw
			const ast = parse(result, {filename: 'Test.svelte', modern: true});
			expect(ast.fragment.nodes.length).toBeGreaterThan(0);
		});

		test('output contains valid single-quoted JS string expression', async () => {
			const input = `<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';
</script>

<Code content="const x = 1;" lang="ts" />`;
			const result = await run(input);

			// The attribute should be wrapped as dangerous_raw_html={'...'}
			expect(result).toMatch(/dangerous_raw_html=\{'[^]*?'\}/);
			// No unescaped single quotes inside the string (except the wrapping ones)
			const inner = /dangerous_raw_html=\{'((?:[^'\\]|\\.)*)'\}/.exec(result)![1];
			// Verify no raw single quotes (they should all be escaped)
			expect(inner).not.toMatch(/(?<!\\)'/);
		});

		test('generates source map', async () => {
			const input = `<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';
</script>

<Code content="const x = 1;" lang="ts" />`;
			const result = await preprocess(input, [svelte_preprocess_code_static()], {
				filename: 'Test.svelte',
			});

			expect(result.map).toBeDefined();
			const map = result.map as {sources: Array<string>};
			expect(map.sources).toContain('Test.svelte');
		});
	});

	describe('options', () => {
		test('respects exclude with regex', async () => {
			const input = `<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';
</script>

<Code content="const x = 1;" lang="ts" />`;
			const result = await preprocess(
				input,
				[svelte_preprocess_code_static({exclude: [/Test\.svelte$/]})],
				{filename: 'Test.svelte'},
			);

			expect(result.code).toContain('content="const x = 1;"');
			expect(result.code).not.toContain('dangerous_raw_html');
		});

		test('respects exclude with string', async () => {
			const input = `<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';
</script>

<Code content="const x = 1;" lang="ts" />`;
			const result = await preprocess(
				input,
				[svelte_preprocess_code_static({exclude: ['fixtures/']})],
				{filename: 'src/test/fixtures/Test.svelte'},
			);

			expect(result.code).not.toContain('dangerous_raw_html');
		});

		test('cache: false disables caching', async () => {
			const input = `<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';
</script>

<Code content="const x = 1;" lang="ts" />`;
			const result = await preprocess(input, [svelte_preprocess_code_static({cache: false})], {
				filename: 'Test.svelte',
			});

			// Should still transform correctly without caching
			expect(result.code).toContain('dangerous_raw_html=');
			const raw_html = extract_raw_html(result.code);
			expect(raw_html).toBe(syntax_styler_global.stylize('const x = 1;', 'ts'));
		});

		test('on_error throw mode throws on stylize failure', async () => {
			const bad_styler = {
				langs: {ts: {}},
				stylize() {
					throw new Error('test error');
				},
			} as any;

			const input = `<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';
</script>

<Code content="const x = 1;" lang="ts" />`;

			await expect(
				preprocess(
					input,
					[svelte_preprocess_code_static({syntax_styler: bad_styler, on_error: 'throw'})],
					{filename: 'Test.svelte'},
				),
			).rejects.toThrow('test error');
		});

		test('on_error log mode skips failed transformation', async () => {
			const bad_styler = {
				langs: {ts: {}},
				stylize() {
					throw new Error('test error');
				},
			} as any;

			const input = `<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';
</script>

<Code content="const x = 1;" lang="ts" />`;
			const result = await preprocess(
				input,
				[svelte_preprocess_code_static({syntax_styler: bad_styler, on_error: 'log'})],
				{filename: 'Test.svelte'},
			);

			// Should remain unchanged when error is logged
			expect(result.code).toContain('content="const x = 1;"');
			expect(result.code).not.toContain('dangerous_raw_html');
		});
	});

	describe('HTML entity handling', () => {
		test('Svelte decodes HTML entities in double-quoted attributes', async () => {
			// When Svelte parses content="&lt;div&gt;", the Text node's .data is "<div>"
			const input = `<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';
</script>

<Code content="a &amp; b" lang="ts" />`;
			const result = await run(input);

			// Svelte decodes &amp; to & in the Text node, so stylize receives "a & b"
			const raw_html = extract_raw_html(result);
			expect(raw_html).toBe(syntax_styler_global.stylize('a & b', 'ts'));
		});
	});
});
