import {parse, type PreprocessorGroup, type AST} from 'svelte/compiler';
import MagicString from 'magic-string';
import {walk} from 'zimmerframe';

import {syntax_styler_global} from './syntax_styler_global.js';
import type {SyntaxStyler} from './syntax_styler.js';

export interface Preprocess_Code_Static_Options {
	/** File patterns to exclude. */
	exclude?: Array<string | RegExp>;

	/** Custom syntax styler. @default syntax_styler_global */
	syntax_styler?: SyntaxStyler;

	/** Enable in-memory caching. @default true */
	cache?: boolean;

	/**
	 * Import sources that resolve to the Code component.
	 * Used to verify that `<Code>` in templates actually refers to fuz_code's Code.svelte.
	 *
	 * @default ['@fuzdev/fuz_code/Code.svelte']
	 */
	component_imports?: Array<string>;

	/**
	 * How to handle errors.
	 * @default 'throw' in CI, 'log' otherwise
	 */
	on_error?: 'log' | 'throw';
}

export const svelte_preprocess_code_static = (
	options: Preprocess_Code_Static_Options = {},
): PreprocessorGroup => {
	const {
		exclude = [],
		syntax_styler = syntax_styler_global,
		cache = true,
		component_imports = ['@fuzdev/fuz_code/Code.svelte'],
		on_error = process.env.CI ? 'throw' : 'log',
	} = options;

	// In-memory cache: content+lang hash → highlighted HTML
	const highlight_cache: Map<string, string> = new Map();

	return {
		name: 'code-static',

		markup: ({content, filename}) => {
			// Skip excluded files
			if (should_exclude(filename, exclude)) {
				return {code: content};
			}

			// Quick check: does file contain Code component?
			if (!content.includes('Code')) {
				return {code: content};
			}

			const s = new MagicString(content);
			const ast = parse(content, {filename, modern: true});

			// Resolve which local names map to the Code component
			const code_names = resolve_code_names(ast, component_imports);
			if (code_names.size === 0) {
				return {code: content};
			}

			// Find Code component usages with static content
			const transformations = find_code_usages(ast, syntax_styler, code_names, {
				cache: cache ? highlight_cache : null,
				on_error,
				filename,
				source: content,
			});

			if (transformations.length === 0) {
				return {code: content};
			}

			// Apply transformations
			for (const t of transformations) {
				s.overwrite(t.start, t.end, t.replacement);
			}

			return {
				code: s.toString(),
				map: s.generateMap({hires: true}),
			};
		},
	};
};

/**
 * Check if a filename matches any exclusion pattern.
 */
const should_exclude = (filename: string | undefined, exclude: Array<string | RegExp>): boolean => {
	if (!filename || exclude.length === 0) return false;
	return exclude.some((pattern) =>
		typeof pattern === 'string' ? filename.includes(pattern) : pattern.test(filename),
	);
};

/**
 * Scans import declarations to find local names that import from known Code component sources.
 * Handles default imports, named imports, and aliased imports.
 * Checks both instance (`<script>`) and module (`<script module>`) scripts.
 */
const resolve_code_names = (ast: AST.Root, component_imports: Array<string>): Set<string> => {
	const names: Set<string> = new Set();

	for (const script of [ast.instance, ast.module]) {
		if (!script) continue;

		for (const node of script.content.body) {
			if (node.type !== 'ImportDeclaration') continue;
			if (!component_imports.includes(node.source.value as string)) continue;

			for (const specifier of node.specifiers) {
				// default import: `import Code from '...'`
				// aliased: `import Highlighter from '...'`
				// named: `import { default as Code } from '...'`
				names.add(specifier.local.name);
			}
		}
	}

	return names;
};

interface Transformation {
	start: number;
	end: number;
	replacement: string;
}

interface Find_Code_Usages_Options {
	cache: Map<string, string> | null;
	on_error: 'log' | 'throw';
	filename: string | undefined;
	source: string;
}

/**
 * Attempt to highlight content, using cache if available.
 * Returns the highlighted HTML, or `null` on error.
 */
const try_highlight = (
	text: string,
	lang: string,
	syntax_styler: SyntaxStyler,
	options: Find_Code_Usages_Options,
): string | null => {
	const cache_key = `${lang}:${text}`;
	let html = options.cache?.get(cache_key);
	if (!html) {
		try {
			html = syntax_styler.stylize(text, lang);
			options.cache?.set(cache_key, html);
		} catch (error) {
			handle_error(error, options);
			return null;
		}
	}
	return html;
};

/**
 * Walks the AST to find Code component usages with static `content` props
 * and generates transformations to replace them with `dangerous_raw_html`.
 */
const find_code_usages = (
	ast: AST.Root,
	syntax_styler: SyntaxStyler,
	code_names: Set<string>,
	options: Find_Code_Usages_Options,
): Array<Transformation> => {
	const transformations: Array<Transformation> = [];

	walk(ast.fragment as any, null, {
		Component(node: AST.Component, context: {next: () => void}) {
			// Always recurse into children - without this, Code components
			// nested inside other components would be missed, because zimmerframe
			// does not auto-recurse when a visitor is defined for a node type.
			context.next();

			if (!code_names.has(node.name)) return;

			const content_attr = find_attribute(node, 'content');
			if (!content_attr) return;

			// Skip if custom grammar or custom syntax_styler is provided
			if (find_attribute(node, 'grammar') || find_attribute(node, 'syntax_styler')) {
				return;
			}

			// Resolve language - must be static and supported
			const lang_attr = find_attribute(node, 'lang');
			const lang_value = lang_attr ? extract_static_string(lang_attr.value) : 'svelte';
			if (lang_value === null) return;
			if (!syntax_styler.langs[lang_value]) return;

			// Try simple static string
			const content_value = extract_static_string(content_attr.value);
			if (content_value !== null) {
				const html = try_highlight(content_value, lang_value, syntax_styler, options);
				if (html === null) return;
				transformations.push({
					start: content_attr.start,
					end: content_attr.end,
					replacement: `dangerous_raw_html={'${escape_js_string(html)}'}`,
				});
				return;
			}

			// Try conditional expression with static string branches
			const conditional = try_extract_conditional(content_attr.value, options.source);
			if (conditional) {
				const html_a = try_highlight(
					conditional.consequent,
					lang_value,
					syntax_styler,
					options,
				);
				const html_b = try_highlight(
					conditional.alternate,
					lang_value,
					syntax_styler,
					options,
				);
				if (html_a === null || html_b === null) return;
				transformations.push({
					start: content_attr.start,
					end: content_attr.end,
					replacement: `dangerous_raw_html={${conditional.test_source} ? '${escape_js_string(html_a)}' : '${escape_js_string(html_b)}'}`,
				});
			}
		},
	});

	return transformations;
};

/**
 * Find an attribute by name on a component node.
 */
const find_attribute = (node: AST.Component, name: string): AST.Attribute | undefined => {
	for (const attr of node.attributes) {
		if (attr.type === 'Attribute' && attr.name === name) {
			return attr;
		}
	}
	return undefined;
};

type Attribute_Value = AST.Attribute['value'];

/**
 * Recursively evaluate an expression AST node to a static string value.
 * Handles string literals, template literals (no interpolation), and string concatenation.
 * Returns `null` for dynamic or non-string expressions.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const evaluate_static_expr = (expr: any): string | null => {
	if (expr.type === 'Literal' && typeof expr.value === 'string') return expr.value;
	if (expr.type === 'TemplateLiteral' && expr.expressions.length === 0) {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		return expr.quasis.map((q: any) => q.value.cooked ?? q.value.raw).join('');
	}
	if (expr.type === 'BinaryExpression' && expr.operator === '+') {
		const left = evaluate_static_expr(expr.left);
		if (left === null) return null;
		const right = evaluate_static_expr(expr.right);
		if (right === null) return null;
		return left + right;
	}
	return null;
};

/**
 * Extract the string value from a static attribute value.
 * Returns `null` for dynamic, non-string, or null literal values.
 */
const extract_static_string = (value: Attribute_Value): string | null => {
	// Boolean attribute
	if (value === true) return null;

	// Plain attribute: content="text"
	if (Array.isArray(value)) {
		const first = value[0];
		if (value.length === 1 && first?.type === 'Text') {
			return first.data;
		}
		return null;
	}

	// ExpressionTag
	const expr = value.expression;
	// Null literal
	if (expr.type === 'Literal' && expr.value === null) return null;
	return evaluate_static_expr(expr);
};

interface Conditional_Static_Strings {
	test_source: string;
	consequent: string;
	alternate: string;
}

/**
 * Try to extract a conditional expression where both branches are static strings.
 * Returns the condition source text and both branch values, or `null` if not applicable.
 */
const try_extract_conditional = (
	value: Attribute_Value,
	source: string,
): Conditional_Static_Strings | null => {
	if (value === true || Array.isArray(value)) return null;
	const expr = value.expression;
	if (expr.type !== 'ConditionalExpression') return null;

	const consequent = evaluate_static_expr(expr.consequent);
	if (consequent === null) return null;
	const alternate = evaluate_static_expr(expr.alternate);
	if (alternate === null) return null;

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const test = expr.test as any;
	const test_source = source.slice(test.start, test.end);
	return {test_source, consequent, alternate};
};

/**
 * Escapes a string for use inside a single-quoted JS string literal.
 * Single quotes are used because `stylize()` output contains double quotes
 * on every token span, so wrapping with single quotes avoids escaping those.
 */
const escape_js_string = (html: string): string => {
	return html
		.replace(/\\/g, '\\\\') // backslashes first
		.replace(/'/g, "\\'") // single quotes
		.replace(/\n/g, '\\n') // newlines
		.replace(/\r/g, '\\r'); // carriage returns
};

/**
 * Handle errors during highlighting.
 */
const handle_error = (error: unknown, options: Find_Code_Usages_Options): void => {
	const message = `[code-static] Highlighting failed${options.filename ? ` in ${options.filename}` : ''}: ${error instanceof Error ? error.message : String(error)}`;

	if (options.on_error === 'throw') {
		throw new Error(message);
	}
	// eslint-disable-next-line no-console
	console.error(message);
};
