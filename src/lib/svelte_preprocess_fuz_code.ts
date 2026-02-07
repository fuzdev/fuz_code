import {parse, type PreprocessorGroup, type AST} from 'svelte/compiler';
import MagicString from 'magic-string';
import {walk} from 'zimmerframe';
import {should_exclude_path} from '@fuzdev/fuz_util/path.js';
import {escape_js_string} from '@fuzdev/fuz_util/string.js';
import {
	find_attribute,
	evaluate_static_expr,
	extract_static_string,
	build_static_bindings,
	resolve_component_names,
	type ResolvedComponentImport,
} from '@fuzdev/fuz_util/svelte_preprocess_helpers.js';

import {syntax_styler_global} from './syntax_styler_global.js';
import type {SyntaxStyler} from './syntax_styler.js';

export interface PreprocessFuzCodeOptions {
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

export const svelte_preprocess_fuz_code = (
	options: PreprocessFuzCodeOptions = {},
): PreprocessorGroup => {
	const {
		exclude = [],
		syntax_styler = syntax_styler_global,
		cache = true,
		component_imports = ['@fuzdev/fuz_code/Code.svelte'],
		on_error = process.env.CI === 'true' ? 'throw' : 'log',
	} = options;

	// In-memory cache: content+lang hash → highlighted HTML
	const highlight_cache: Map<string, string> = new Map();

	return {
		name: 'fuz-code',

		markup: ({content, filename}) => {
			// Skip excluded files
			if (should_exclude_path(filename, exclude)) {
				return {code: content};
			}

			// Quick check: does file import from a known Code component source?
			if (!component_imports.some((source) => content.includes(source))) {
				return {code: content};
			}

			const s = new MagicString(content);
			const ast = parse(content, {filename, modern: true});

			// Resolve which local names map to the Code component
			const code_names = resolve_component_names(ast, component_imports);
			if (code_names.size === 0) {
				return {code: content};
			}

			const bindings = build_static_bindings(ast);

			// Find Code component usages with static content
			const transformations = find_code_usages(ast, syntax_styler, code_names, {
				cache: cache ? highlight_cache : null,
				on_error,
				filename,
				source: content,
				bindings,
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

interface Transformation {
	start: number;
	end: number;
	replacement: string;
}

interface FindCodeUsagesOptions {
	cache: Map<string, string> | null;
	on_error: 'log' | 'throw';
	filename: string | undefined;
	source: string;
	bindings: ReadonlyMap<string, string>;
}

/**
 * Attempt to highlight content, using cache if available.
 * Returns the highlighted HTML, or `null` on error.
 */
const try_highlight = (
	text: string,
	lang: string,
	syntax_styler: SyntaxStyler,
	options: FindCodeUsagesOptions,
): string | null => {
	const cache_key = `${lang}:${text}`;
	let html = options.cache?.get(cache_key);
	if (html == null) {
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
	code_names: Map<string, ResolvedComponentImport>,
	options: FindCodeUsagesOptions,
): Array<Transformation> => {
	const transformations: Array<Transformation> = [];

	walk(ast.fragment as any, null, {
		Component(node: AST.Component, context: {next: () => void}) {
			// Always recurse into children - without this, Code components
			// nested inside other components would be missed, because zimmerframe
			// does not auto-recurse when a visitor is defined for a node type.
			context.next();

			if (!code_names.has(node.name)) return;

			// Skip if spread attributes present — can't determine content statically
			if (node.attributes.some((attr) => attr.type === 'SpreadAttribute')) return;

			const content_attr = find_attribute(node, 'content');
			if (!content_attr) return;

			// Skip if already preprocessed or custom grammar/syntax_styler is provided
			if (
				find_attribute(node, 'dangerous_raw_html') ||
				find_attribute(node, 'grammar') ||
				find_attribute(node, 'syntax_styler')
			) {
				return;
			}

			// Resolve language - must be static and supported
			const lang_attr = find_attribute(node, 'lang');
			const lang_value = lang_attr
				? extract_static_string(lang_attr.value, options.bindings)
				: 'svelte';
			if (lang_value === null) return;
			if (!syntax_styler.langs[lang_value]) return;

			// Try simple static string
			const content_value = extract_static_string(content_attr.value, options.bindings);
			if (content_value !== null) {
				const html = try_highlight(content_value, lang_value, syntax_styler, options);
				if (html === null || html === content_value) return;
				transformations.push({
					start: content_attr.start,
					end: content_attr.end,
					replacement: `dangerous_raw_html={'${escape_js_string(html)}'}`,
				});
				return;
			}

			// Try conditional expression with static string branches
			const conditional = try_extract_conditional(
				content_attr.value,
				options.source,
				options.bindings,
			);
			if (conditional) {
				const html_a = try_highlight(conditional.consequent, lang_value, syntax_styler, options);
				const html_b = try_highlight(conditional.alternate, lang_value, syntax_styler, options);
				if (html_a === null || html_b === null) return;
				if (html_a === conditional.consequent && html_b === conditional.alternate) return;
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

type AttributeValue = AST.Attribute['value'];

interface ConditionalStaticStrings {
	test_source: string;
	consequent: string;
	alternate: string;
}

/**
 * Try to extract a conditional expression where both branches are static strings.
 * Returns the condition source text and both branch values, or `null` if not applicable.
 */
const try_extract_conditional = (
	value: AttributeValue,
	source: string,
	bindings: ReadonlyMap<string, string>,
): ConditionalStaticStrings | null => {
	if (value === true || Array.isArray(value)) return null;
	const expr = value.expression;
	if (expr.type !== 'ConditionalExpression') return null;

	const consequent = evaluate_static_expr(expr.consequent, bindings);
	if (consequent === null) return null;
	const alternate = evaluate_static_expr(expr.alternate, bindings);
	if (alternate === null) return null;

	const test = expr.test as any;
	const test_source = source.slice(test.start, test.end);
	return {test_source, consequent, alternate};
};

/**
 * Handle errors during highlighting.
 */
const handle_error = (error: unknown, options: FindCodeUsagesOptions): void => {
	const message = `[fuz-code] Highlighting failed${options.filename ? ` in ${options.filename}` : ''}: ${error instanceof Error ? error.message : String(error)}`;

	if (options.on_error === 'throw') {
		throw new Error(message);
	}
	// eslint-disable-next-line no-console
	console.error(message);
};
