import { test, assert, describe } from 'vitest';
import { assert_rejects } from '@fuzdev/fuz_util/testing.ts';
import { preprocess, parse, type AST } from 'svelte/compiler';

import {
	svelte_preprocess_fuz_code,
	type PreprocessFuzCodeOptions
} from '#lib/svelte_preprocess_fuz_code.ts';
import { render_diff_unified_html, render_diff_split_html } from '#lib/diff_html.ts';
import { syntax_styler_global } from '#lib/syntax_styler_global.ts';

const A = 'const a = 1;\nconst b = 2;\n';
const B = 'const a = 1;\nconst b = 20;\n';

const IMPORT = `<script lang="ts">
	import CodeDiff from '@fuzdev/fuz_code/CodeDiff.svelte';
	const a = ${JSON.stringify(A)};
	const b = ${JSON.stringify(B)};
</script>

`;

const run = async (input: string, options?: PreprocessFuzCodeOptions): Promise<string> => {
	const result = await preprocess(input, [svelte_preprocess_fuz_code(options)], {
		filename: 'Test.svelte'
	});
	return result.code;
};

/**
 * The first component of the given name in preprocessed output, with its
 * attributes by name. Parsing the output is also the check that it is valid
 * Svelte.
 */
const parse_component = (
	code: string,
	name = 'CodeDiff'
): { names: Array<string>; attrs: Map<string, AST.Attribute> } => {
	const ast = parse(code, { filename: 'Test.svelte', modern: true });
	const node = ast.fragment.nodes.find(
		(n): n is AST.Component => n.type === 'Component' && n.name === name
	);
	assert.isDefined(node, `no <${name}> in: ${code}`);
	const attrs: Map<string, AST.Attribute> = new Map();
	for (const attr of node.attributes) {
		if (attr.type === 'Attribute') attrs.set(attr.name, attr);
	}
	return { names: [...attrs.keys()], attrs };
};

// the expression of a `name={…}` attribute, as an estree node
const attr_expression = (attrs: Map<string, AST.Attribute>, name: string): any => {
	const attr = attrs.get(name);
	assert.isDefined(attr, `no ${name} attribute`);
	assert.ok(attr.value !== true && !Array.isArray(attr.value), `${name} is not an expression`);
	return attr.value.expression;
};

/**
 * The string a statically pre-rendered usage passes as `dangerous_raw_html`,
 * decoded by the parser the way the compiler will read it.
 */
const raw_html_of = (code: string): string => {
	const expr = attr_expression(parse_component(code).attrs, 'dangerous_raw_html');
	assert.strictEqual(expr.type, 'Literal');
	return expr.value;
};

describe('svelte_preprocess_fuz_code with CodeDiff', () => {
	describe('static a and b', () => {
		test('replaces a with dangerous_raw_html and removes b', async () => {
			const result = await run(`${IMPORT}<CodeDiff {a} {b} lang="ts" />`);
			const { names } = parse_component(result);
			assert.deepEqual(names, ['dangerous_raw_html', 'lang']);
			assert.strictEqual(raw_html_of(result), render_diff_unified_html(A, B, { lang: 'ts' }));
		});

		test('transforms quoted attributes', async () => {
			const result = await run(`<script lang="ts">
	import CodeDiff from '@fuzdev/fuz_code/CodeDiff.svelte';
</script>

<CodeDiff a="const x = 1;" b="const x = 2;" lang="ts" />`);
			assert.strictEqual(
				raw_html_of(result),
				render_diff_unified_html('const x = 1;', 'const x = 2;', { lang: 'ts' })
			);
		});

		test('transforms string expressions', async () => {
			const result = await run(`<script lang="ts">
	import CodeDiff from '@fuzdev/fuz_code/CodeDiff.svelte';
</script>

<CodeDiff a={'x\\n' + 'y\\n'} b={\`x\\nz\\n\`} lang="ts" />`);
			assert.strictEqual(
				raw_html_of(result),
				render_diff_unified_html('x\ny\n', 'x\nz\n', { lang: 'ts' })
			);
		});

		test('lang defaults to svelte', async () => {
			const result = await run(`${IMPORT}<CodeDiff {a} {b} />`);
			assert.strictEqual(raw_html_of(result), render_diff_unified_html(A, B, { lang: 'svelte' }));
		});

		test('b before a, on separate lines', async () => {
			const result = await run(`${IMPORT}<CodeDiff
	{b}
	lang="ts"
	{a}
	nomargin
/>`);
			const { names } = parse_component(result);
			assert.deepEqual(names, ['lang', 'dangerous_raw_html', 'nomargin']);
			assert.strictEqual(raw_html_of(result), render_diff_unified_html(A, B, { lang: 'ts' }));
		});

		test('b directly after a', async () => {
			const result = await run(`${IMPORT}<CodeDiff lang="ts" {a} {b}/>`);
			assert.deepEqual(parse_component(result).names, ['lang', 'dangerous_raw_html']);
		});

		test('source with quotes, backslashes, braces, and markup survives the round trip', async () => {
			const a = `const s = 'it\\'s';\nif (x < 1 && y) { return "\\\\"; }\n`;
			const b = `const s = \`it's \${x}\`;\nif (x < 1 && y) { return '</script>'; }\n`;
			const result = await run(`<script lang="ts">
	import CodeDiff from '@fuzdev/fuz_code/CodeDiff.svelte';
	const a = ${JSON.stringify(a)};
	const b = ${JSON.stringify(b).replace('</script>', '<\\/script>')};
</script>

<CodeDiff {a} {b} lang="ts" />`);
			assert.strictEqual(raw_html_of(result), render_diff_unified_html(a, b, { lang: 'ts' }));
		});

		test('identical and empty sources still pre-render', async () => {
			const same = await run(`${IMPORT}<CodeDiff {a} b={a} lang="ts" />`);
			assert.strictEqual(raw_html_of(same), render_diff_unified_html(A, A, { lang: 'ts' }));
			const empty = await run(`${IMPORT}<CodeDiff a={''} b={''} lang="ts" />`);
			assert.strictEqual(raw_html_of(empty), '');
		});

		test('generates a source map', async () => {
			const result = await preprocess(
				`${IMPORT}<CodeDiff {a} {b} lang="ts" />`,
				[svelte_preprocess_fuz_code()],
				{ filename: 'Test.svelte' }
			);
			assert.include((result.map as { sources: Array<string> }).sources, 'Test.svelte');
		});
	});

	describe('split', () => {
		test('a bare split renders the split view and stays on the component', async () => {
			const result = await run(`${IMPORT}<CodeDiff {a} {b} lang="ts" split />`);
			assert.deepEqual(parse_component(result).names, ['dangerous_raw_html', 'lang', 'split']);
			assert.strictEqual(raw_html_of(result), render_diff_split_html(A, B, { lang: 'ts' }));
		});

		test('a boolean literal picks the view', async () => {
			const on = await run(`${IMPORT}<CodeDiff {a} {b} lang="ts" split={true} />`);
			assert.strictEqual(raw_html_of(on), render_diff_split_html(A, B, { lang: 'ts' }));
			const off = await run(`${IMPORT}<CodeDiff {a} {b} lang="ts" split={false} />`);
			assert.strictEqual(raw_html_of(off), render_diff_unified_html(A, B, { lang: 'ts' }));
		});

		for (const [label, attr, test_source] of [
			['a shorthand', '{split}', 'split'],
			['an identifier', 'split={wide}', 'wide'],
			['a compound expression', 'split={wide || width > 800}', 'wide || width > 800'],
			['a ternary', "split={mode === 'split' ? true : false}", "mode === 'split' ? true : false"]
		] as const) {
			test(`${label} pre-renders both views behind the expression`, async () => {
				const input = `${IMPORT}<CodeDiff {a} {b} lang="ts" ${attr} />`;
				const result = await run(input);
				const { attrs, names } = parse_component(result);
				assert.deepEqual(names, ['dangerous_raw_html', 'lang', 'split']);
				const expr = attr_expression(attrs, 'dangerous_raw_html');
				assert.strictEqual(expr.type, 'ConditionalExpression');
				assert.strictEqual(result.slice(expr.test.start, expr.test.end), test_source);
				assert.strictEqual(expr.consequent.value, render_diff_split_html(A, B, { lang: 'ts' }));
				assert.strictEqual(expr.alternate.value, render_diff_unified_html(A, B, { lang: 'ts' }));
			});
		}

		test('a quoted split is left to runtime', async () => {
			const input = `${IMPORT}<CodeDiff {a} {b} lang="ts" split="true" />`;
			assert.strictEqual(await run(input), input);
		});
	});

	describe('row options', () => {
		test('literal options shape the pre-rendered rows and stay on the component', async () => {
			const result = await run(
				`${IMPORT}<CodeDiff {a} {b} lang="ts" context_lines={0} elide="omit" line_numbers={false} intraline={false} max_cost={500} />`
			);
			assert.deepEqual(parse_component(result).names, [
				'dangerous_raw_html',
				'lang',
				'context_lines',
				'elide',
				'line_numbers',
				'intraline',
				'max_cost'
			]);
			assert.strictEqual(
				raw_html_of(result),
				render_diff_unified_html(A, B, {
					lang: 'ts',
					context_lines: 0,
					elide: 'omit',
					line_numbers: false,
					intraline: false,
					max_cost: 500
				})
			);
		});

		test('bare boolean options are true', async () => {
			const result = await run(`${IMPORT}<CodeDiff {a} {b} lang="ts" intraline line_numbers />`);
			assert.strictEqual(raw_html_of(result), render_diff_unified_html(A, B, { lang: 'ts' }));
		});

		test('elide resolves through a const binding', async () => {
			const result = await run(`<script lang="ts">
	import CodeDiff from '@fuzdev/fuz_code/CodeDiff.svelte';
	const elide = 'none';
</script>

<CodeDiff a="x" b="y" lang="ts" {elide} />`);
			assert.strictEqual(
				raw_html_of(result),
				render_diff_unified_html('x', 'y', { lang: 'ts', elide: 'none' })
			);
		});

		test('Infinity and negative numbers are literals', async () => {
			const all = await run(`${IMPORT}<CodeDiff {a} {b} lang="ts" context_lines={Infinity} />`);
			assert.strictEqual(
				raw_html_of(all),
				render_diff_unified_html(A, B, { lang: 'ts', context_lines: Infinity })
			);
			const negative = await run(`${IMPORT}<CodeDiff {a} {b} lang="ts" context_lines={-1} />`);
			assert.strictEqual(
				raw_html_of(negative),
				render_diff_unified_html(A, B, { lang: 'ts', context_lines: -1 })
			);
		});

		for (const attr of [
			'context_lines={n}',
			'context_lines="5"',
			'max_cost={limit}',
			'line_numbers={show}',
			'line_numbers="false"',
			'intraline={!plain}',
			'elide={mode}',
			'elide="bogus"',
			"elide={compact ? 'omit' : 'details'}"
		]) {
			test(`${attr} is left to runtime`, async () => {
				const input = `${IMPORT}<CodeDiff {a} {b} lang="ts" ${attr} />`;
				assert.strictEqual(await run(input), input);
			});
		}
	});

	describe('skip conditions', () => {
		for (const [label, usage] of [
			['a dynamic a', '<CodeDiff a={before} {b} lang="ts" />'],
			['a dynamic b', '<CodeDiff {a} b={after} lang="ts" />'],
			['a ternary a', "<CodeDiff a={flag ? 'x' : 'y'} {b} lang=\"ts\" />"],
			['a missing b', '<CodeDiff {a} lang="ts" />'],
			['a missing a', '<CodeDiff {b} lang="ts" />'],
			['a dynamic lang', '<CodeDiff {a} {b} lang={language} />'],
			['a null lang', '<CodeDiff {a} {b} lang={null} />'],
			['an unregistered lang', '<CodeDiff {a} {b} lang="nope" />'],
			['a spread', '<CodeDiff {a} {b} lang="ts" {...rest} />'],
			['a custom syntax_styler', '<CodeDiff {a} {b} lang="ts" syntax_styler={styler} />'],
			['a highlight', '<CodeDiff {a} {b} lang="ts" highlight={lines} />'],
			['a model', '<CodeDiff {model} lang="ts" />'],
			['hunks', '<CodeDiff {hunks} lang="ts" />'],
			['hunks with a line count', '<CodeDiff hunks={[]} b_line_count={3} lang="ts" />'],
			['an existing dangerous_raw_html', '<CodeDiff dangerous_raw_html={html} lang="ts" />']
		] as const) {
			test(`${label} is left to runtime`, async () => {
				const input = IMPORT + usage;
				assert.strictEqual(await run(input), input);
			});
		}

		test('a let binding is not static', async () => {
			const input = `<script lang="ts">
	import CodeDiff from '@fuzdev/fuz_code/CodeDiff.svelte';
	let a = $state('x');
	const b = 'y';
</script>

<CodeDiff {a} {b} lang="ts" />`;
			assert.strictEqual(await run(input), input);
		});

		test('a component of the same name from another source is left alone', async () => {
			const input = `<script lang="ts">
	import CodeDiff from './CodeDiff.svelte';
</script>

<CodeDiff a="x" b="y" lang="ts" />`;
			assert.strictEqual(await run(input), input);
		});
	});

	describe('import resolution', () => {
		test('respects custom code_diff_imports', async () => {
			const input = `<script lang="ts">
	import Diff from '#lib/CodeDiff.svelte';
</script>

<Diff a="x" b="y" lang="ts" />`;
			assert.strictEqual(await run(input), input);
			const result = await run(input, { code_diff_imports: ['#lib/CodeDiff.svelte'] });
			const expr = attr_expression(parse_component(result, 'Diff').attrs, 'dangerous_raw_html');
			assert.strictEqual(expr.value, render_diff_unified_html('x', 'y', { lang: 'ts' }));
		});

		test('a file importing only CodeDiff is processed', async () => {
			const result = await run(`${IMPORT}<CodeDiff {a} {b} lang="ts" />`, {
				code_imports: []
			});
			assert.include(result, 'dangerous_raw_html=');
		});

		test('Code and CodeDiff transform side by side, nested in other markup', async () => {
			const result = await run(`<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';
	import CodeDiff from '@fuzdev/fuz_code/CodeDiff.svelte';
</script>

<section>
	<Code content="const x = 1;" lang="ts" />
	{#if true}
		<div><CodeDiff a="const x = 1;" b="const x = 2;" lang="ts" split /></div>
	{/if}
</section>`);
			assert.notInclude(result, 'content=');
			assert.notInclude(result, ' a=');
			assert.notInclude(result, ' b=');
			assert.lengthOf(result.split('dangerous_raw_html='), 3);
			assert.include(result, 'diff_cell');
			parse(result, { filename: 'Test.svelte', modern: true });
		});

		test('Code content named like a diff prop is untouched by the diff path', async () => {
			const input = `<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';
</script>

<Code a="x" b="y" lang="ts" />`;
			assert.strictEqual(await run(input), input);
		});
	});

	describe('options', () => {
		test('exclude skips the file', async () => {
			const input = `${IMPORT}<CodeDiff {a} {b} lang="ts" />`;
			assert.strictEqual(await run(input, { exclude: [/Test\.svelte$/] }), input);
		});

		test('the cache returns the same rows, and distinguishes views and options', async () => {
			const preprocessor = svelte_preprocess_fuz_code();
			const render = async (usage: string): Promise<string> =>
				(await preprocess(IMPORT + usage, [preprocessor], { filename: 'Test.svelte' })).code;
			const unified = await render('<CodeDiff {a} {b} lang="ts" />');
			assert.strictEqual(await render('<CodeDiff {a} {b} lang="ts" />'), unified);
			assert.strictEqual(
				raw_html_of(await render('<CodeDiff {a} {b} lang="ts" split />')),
				render_diff_split_html(A, B, { lang: 'ts' })
			);
			assert.strictEqual(
				raw_html_of(await render('<CodeDiff {a} {b} lang="ts" line_numbers={false} />')),
				render_diff_unified_html(A, B, { lang: 'ts', line_numbers: false })
			);
			assert.strictEqual(
				raw_html_of(await render('<CodeDiff {a} {b} lang="json" />')),
				render_diff_unified_html(A, B, { lang: 'json' })
			);
			// swapping the sides is a different diff even though the texts are the same
			assert.strictEqual(
				raw_html_of(await render('<CodeDiff a={b} b={a} lang="ts" />')),
				render_diff_unified_html(B, A, { lang: 'ts' })
			);
		});

		test('cache: false still transforms', async () => {
			const result = await run(`${IMPORT}<CodeDiff {a} {b} lang="ts" />`, { cache: false });
			assert.strictEqual(raw_html_of(result), render_diff_unified_html(A, B, { lang: 'ts' }));
		});

		const bad_styler = {
			has_lang: () => true,
			lex() {
				throw new Error('test error');
			}
		} as any;

		test('on_error throw mode throws on a render failure', async () => {
			const error = await assert_rejects(() =>
				run(`${IMPORT}<CodeDiff {a} {b} lang="ts" />`, {
					syntax_styler: bad_styler,
					on_error: 'throw'
				})
			);
			assert.ok(error.message.includes('test error'));
		});

		test('on_error log mode leaves the usage unchanged', async () => {
			const input = `${IMPORT}<CodeDiff {a} {b} lang="ts" split={wide} />`;
			const result = await run(input, { syntax_styler: bad_styler, on_error: 'log' });
			assert.strictEqual(result, input);
		});

		test('a custom syntax_styler option renders with it', async () => {
			const result = await run(`${IMPORT}<CodeDiff {a} {b} lang="ts" />`, {
				syntax_styler: syntax_styler_global
			});
			assert.include(raw_html_of(result), 'token_keyword');
		});
	});
});
