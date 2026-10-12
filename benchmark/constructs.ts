/**
 * The cost model's constructs: for each language, short units of source that
 * each exercise one path of its lexer.
 *
 * A unit is repeated into one input and timed, which gives the cost of the
 * path it takes. Repeating makes every branch predictable, so the numbers are
 * the cheap end of what the path costs in real source; they are for comparing
 * paths with each other and a change with the code before it.
 *
 * @module
 */

/**
 * One unit of source and what the cost model does with its time.
 */
export interface Construct {
	name: string;
	/**
	 * The source to repeat. It ends where the next unit can start, and so that
	 * its last token and the next unit's first don't coalesce into one leaf, so
	 * most end in a space or a newline.
	 */
	unit: string;
	/**
	 * What the unit stands for in the budget: a token type's name, or `'ident'`
	 * for an identifier the lexer emits nothing for. A construct without one is
	 * timed and shown, and left out of the budget.
	 */
	kind?: string;
	/**
	 * The names of constructs whose time is taken off this one's before it is
	 * used as its kind's cost, for a unit that needs other tokens around its own.
	 */
	minus?: Array<string>;
	/**
	 * Whether the kind's cost scales with its length, as a comment's does, and
	 * not with its count.
	 */
	per_char?: boolean;
}

const LINE_OF_PROSE = 'the quick brown fox jumps over the lazy dog';

/**
 * The constructs of each language, keyed by the id `syntax_styler_global`
 * registers it under.
 */
export const constructs: Record<string, Array<Construct>> = {
	ts: [
		{ name: 'identifier', unit: 'abc ', kind: 'ident' },
		{ name: 'identifier, long', unit: 'abcdefghijkl ' },
		{ name: 'punctuation', unit: '; ', kind: 'punctuation' },
		{ name: 'operator', unit: '+ ', kind: 'operator' },
		{ name: 'keyword', unit: 'const ', kind: 'keyword' },
		{ name: 'special keyword', unit: 'return ', kind: 'special_keyword' },
		{ name: 'builtin', unit: 'string ', kind: 'builtin' },
		{ name: 'boolean', unit: 'true ', kind: 'boolean' },
		{ name: 'number', unit: '12 ', kind: 'number' },
		{ name: 'string', unit: "'abcdefgh' ", kind: 'string' },
		{ name: 'template', unit: '`abcdefgh` ', kind: 'template_string' },
		{ name: 'template, interpolated', unit: '`ab${c}de` ' },
		{ name: 'capitalized', unit: 'Abc ', kind: 'capitalized_identifier' },
		{ name: 'line comment', unit: `// ${LINE_OF_PROSE}\n`, kind: 'comment', per_char: true },
		{ name: 'block comment', unit: `/* ${LINE_OF_PROSE} */\n` },
		{ name: 'regex', unit: '/ab+c/g; ', kind: 'regex', minus: ['punctuation'] },
		{ name: 'class', unit: 'class Abc ', kind: 'class_name', minus: ['keyword'] },
		{ name: 'constant', unit: 'ABC ', kind: 'constant' },
		{ name: 'member', unit: 'a.b ' },
		{ name: 'call', unit: 'f() ', kind: 'function', minus: ['punctuation'] },
		{ name: 'call, argument', unit: 'f(x) ' },
		{ name: 'assignment', unit: 'a = b; ' },
		{ name: 'typed assignment', unit: 'a: T = b; ' },
		{ name: 'arrow function', unit: '(a) => b; ' },
		{ name: 'function variable', unit: 'f = (a) => b; ' },
		{ name: 'generic call', unit: 'f<T>(x); ' },
		{ name: 'braces', unit: '{ } ' }
	],
	json: [
		{ name: 'brackets', unit: '[] ' },
		{ name: 'comma', unit: ', ', kind: 'punctuation' },
		{ name: 'colon', unit: ': ', kind: 'operator' },
		{ name: 'number', unit: '12 ', kind: 'number' },
		{ name: 'string', unit: '"abcdefgh" ', kind: 'string' },
		{ name: 'literal', unit: 'true ', kind: 'boolean' },
		{ name: 'null', unit: 'null ', kind: 'null' },
		{ name: 'key', unit: '"abc": ', kind: 'property', minus: ['colon'] },
		{ name: 'key and value', unit: '"abc": 1,\n' },
		{ name: 'indent', unit: '\t\t\t\t1,\n' }
	],
	css: [
		{ name: 'declaration', unit: 'color: red;\n', kind: 'property' },
		{ name: 'declaration, function', unit: 'width: calc(1px + 2em);\n' },
		{ name: 'rule', unit: '.abc {}\n', kind: 'selector' },
		{ name: 'rule, compound selector', unit: 'a.b > c:hover, d[e] {}\n' },
		{ name: 'comment', unit: `/* ${LINE_OF_PROSE} */\n`, kind: 'comment', per_char: true },
		{ name: 'at-rule', unit: '@media (min-width: 1px) {}\n' }
	],
	rust: [
		{ name: 'identifier', unit: 'abc ', kind: 'ident' },
		{ name: 'punctuation', unit: '; ', kind: 'punctuation' },
		{ name: 'operator', unit: '+ ', kind: 'operator' },
		{ name: 'keyword', unit: 'let ', kind: 'keyword' },
		{ name: 'builtin', unit: 'u32 ', kind: 'builtin' },
		{ name: 'number', unit: '12 ', kind: 'number' },
		{ name: 'string', unit: '"abcdefgh" ', kind: 'string' },
		{ name: 'capitalized', unit: 'Abc ', kind: 'capitalized_identifier' },
		{ name: 'lifetime', unit: "'a ", kind: 'lifetime' },
		{ name: 'doc comment', unit: `/// ${LINE_OF_PROSE}\n`, kind: 'doc_comment', per_char: true },
		{ name: 'call', unit: 'f() ', kind: 'function', minus: ['punctuation'] },
		{ name: 'macro', unit: 'f!() ', kind: 'macro', minus: ['punctuation'] },
		{ name: 'path', unit: 'a::b ' },
		{ name: 'attribute', unit: '#[abc]\n', kind: 'attribute' },
		{ name: 'char', unit: "'a' ", kind: 'char' },
		{ name: 'special keyword', unit: 'return ', kind: 'special_keyword' },
		{ name: 'block comment', unit: `/* ${LINE_OF_PROSE} */\n`, kind: 'comment', per_char: true }
	],
	sh: [
		{ name: 'word', unit: 'abc ', kind: 'ident' },
		{ name: 'builtin', unit: 'echo ', kind: 'builtin' },
		{ name: 'keyword', unit: 'then ', kind: 'keyword' },
		{ name: 'punctuation', unit: '; ', kind: 'punctuation' },
		{ name: 'operator', unit: '| ', kind: 'operator' },
		{ name: 'number', unit: '12 ', kind: 'number' },
		{ name: 'variable', unit: '$abc ', kind: 'variable' },
		{ name: 'string, single', unit: "'abcdefgh' ", kind: 'string' },
		{ name: 'string, double', unit: '"abcdefgh" ' },
		{ name: 'string, variable', unit: '"ab $c de" ' },
		{ name: 'command substitution', unit: '$(a) ', kind: 'command_substitution' },
		{ name: 'comment', unit: `# ${LINE_OF_PROSE}\n`, kind: 'comment', per_char: true }
	],
	markup: [
		{ name: 'element', unit: '<a></a>', kind: 'tag' },
		{ name: 'element, text', unit: `<p>${LINE_OF_PROSE}</p>\n` },
		{ name: 'attribute', unit: '<a b="c"></a>', kind: 'attr_name', minus: ['element'] },
		{ name: 'attribute, bare', unit: '<a b></a>' },
		{ name: 'entity', unit: 'a&amp;b ' },
		{ name: 'comment', unit: `<!-- ${LINE_OF_PROSE} -->\n`, kind: 'comment', per_char: true },
		{ name: 'inline style', unit: '<a style="color: red"></a>' }
	],
	xml: [
		{ name: 'element', unit: '<a></a>', kind: 'tag' },
		{ name: 'element, text', unit: `<p>${LINE_OF_PROSE}</p>\n` },
		{ name: 'attribute', unit: '<a b="c"></a>', kind: 'attr_name', minus: ['element'] },
		{ name: 'comment', unit: `<!-- ${LINE_OF_PROSE} -->\n`, kind: 'comment', per_char: true }
	],
	svelte: [
		{ name: 'element', unit: '<a></a>', kind: 'tag' },
		{ name: 'element, text', unit: `<p>${LINE_OF_PROSE}</p>\n` },
		{ name: 'expression', unit: '{a} ', kind: 'svelte_expression' },
		{ name: 'expression, call', unit: '{f(a)} ' },
		{ name: 'attribute', unit: '<a b="c"></a>', kind: 'attr_name', minus: ['element'] },
		{ name: 'attribute, expression', unit: '<a b={c}></a>' },
		{ name: 'attribute, shorthand', unit: '<a {b}></a>' },
		{ name: 'directive', unit: '<a on:b={c}></a>' },
		{ name: 'block', unit: '{#if a}b{/if}\n', kind: 'block' },
		{ name: 'component', unit: '<Abc />' }
	],
	md: [
		{ name: 'paragraph', unit: `${LINE_OF_PROSE}\n\n` },
		{ name: 'heading', unit: '# abc\n\n', kind: 'heading' },
		{ name: 'emphasis', unit: 'a *b* c\n\n', kind: 'italic' },
		{ name: 'strong', unit: 'a **b** c\n\n', kind: 'bold' },
		{ name: 'blockquote', unit: '> abc\n\n', kind: 'blockquote' },
		{ name: 'inline code', unit: 'a `b` c\n\n', kind: 'inline_code' },
		{ name: 'link', unit: 'a [b](c) d\n\n', kind: 'link' },
		{ name: 'list item', unit: '- abc\n', kind: 'list' },
		{ name: 'fence', unit: '```ts\na;\n```\n\n', kind: 'fenced_code' }
	]
};
