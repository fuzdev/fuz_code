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
}

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

			const content_value = extract_static_string(content_attr.value);
			if (content_value === null) return;

			// Skip if custom grammar or custom syntax_styler is provided
			if (find_attribute(node, 'grammar') || find_attribute(node, 'syntax_styler')) {
				return;
			}

			const lang_attr = find_attribute(node, 'lang');
			const lang_value = lang_attr ? extract_static_string(lang_attr.value) : 'svelte';

			// Skip if lang is dynamic or null
			if (lang_value === null) return;

			// Skip unsupported language - runtime will handle
			if (!syntax_styler.langs[lang_value]) {
				return;
			}

			// Generate highlighted HTML
			const cache_key = `${lang_value}:${content_value}`;
			let html = options.cache?.get(cache_key);

			if (!html) {
				try {
					html = syntax_styler.stylize(content_value, lang_value);
					options.cache?.set(cache_key, html);
				} catch (error) {
					handle_error(error, options);
					return;
				}
			}

			// Create replacement: swap content attr to dangerous_raw_html expression
			const escaped_html = escape_js_string(html);
			const new_attr = `dangerous_raw_html={'${escaped_html}'}`;

			transformations.push({
				start: content_attr.start,
				end: content_attr.end,
				replacement: new_attr,
			});
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
 * Extract the string value from a static attribute value.
 * Returns `null` for dynamic or non-string values.
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
	if (expr.type === 'Literal' && typeof expr.value === 'string') return expr.value;
	if (expr.type === 'TemplateLiteral' && expr.expressions.length === 0) {
		// Template literal quasis contain the string parts
		return expr.quasis.map((q) => q.value.cooked ?? q.value.raw).join('');
	}
	// Literal null
	if (expr.type === 'Literal' && expr.value === null) return null;

	return null;
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
