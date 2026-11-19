import { parse, type PreprocessorGroup, type AST } from 'svelte/compiler';
import MagicString from 'magic-string';
import { walk } from 'zimmerframe';
import { should_exclude_path } from '@fuzdev/fuz_util/path.ts';
import { escape_js_string } from '@fuzdev/fuz_util/string.ts';
import {
	find_attribute,
	extract_static_string,
	try_extract_conditional_chain,
	build_static_bindings,
	resolve_component_names,
	handle_preprocess_error,
	type ResolvedComponentImport
} from '@fuzdev/fuz_util/svelte_preprocess_helpers.ts';

import { syntax_styler_global } from './syntax_styler_global.ts';
import type { SyntaxStyler } from './syntax_styler.ts';
import {
	render_diff_unified_html,
	render_diff_split_html,
	type RenderDiffOptions
} from './diff_html.ts';

/**
 * Options for `svelte_preprocess_fuz_code`.
 */
export interface PreprocessFuzCodeOptions {
	/** File patterns to exclude. */
	exclude?: Array<string | RegExp>;

	/** Custom `SyntaxStyler` instance. @default syntax_styler_global */
	syntax_styler?: SyntaxStyler;

	/** Enable in-memory caching. @default true */
	cache?: boolean;

	/**
	 * Import sources that resolve to the `Code` component.
	 * Used to verify that `<Code>` in templates actually refers to `Code.svelte`.
	 *
	 * @default ['@fuzdev/fuz_code/Code.svelte']
	 */
	code_imports?: Array<string>;

	/**
	 * Import sources that resolve to the `CodeDiff` component, verified the
	 * same way.
	 *
	 * @default ['@fuzdev/fuz_code/CodeDiff.svelte']
	 */
	code_diff_imports?: Array<string>;

	/**
	 * How to handle errors.
	 * @default 'throw' in CI, 'log' otherwise
	 */
	on_error?: 'log' | 'throw';
}

/**
 * Svelte preprocessor that compiles static `Code` and `CodeDiff` component
 * content at build time, replacing runtime syntax styling and diffing with
 * pre-rendered HTML.
 *
 * A `Code` usage is static when its `content` is a string known at build
 * time, or a ternary chain of them. A `CodeDiff` usage is static when `a`
 * and `b` are such strings and every prop that shapes the rows
 * (`context_lines`, `elide`, `intraline`, `line_numbers`, `max_cost`) is
 * absent or a literal. Its `split` may be any expression: a dynamic one
 * gets both views pre-rendered behind the expression, so toggling views
 * stays static. Usages with spreads, a custom `syntax_styler`, or a
 * non-static or unregistered `lang` are left to runtime, as are `CodeDiff`
 * usages with a `highlight` or `elide="expand"`, whose expand controls
 * render rows from the component's diff.
 *
 * @param options - `PreprocessFuzCodeOptions` configuration
 * @returns a Svelte preprocessor group
 *
 * @example
 * ```ts
 * // vite.config.ts
 * import {defineConfig} from 'vite';
 * import {sveltekit} from '@sveltejs/kit/vite';
 * import {vitePreprocess} from '@sveltejs/vite-plugin-svelte';
 * import {svelte_preprocess_fuz_code} from '@fuzdev/fuz_code/svelte_preprocess_fuz_code.ts';
 *
 * export default defineConfig({
 *   plugins: [
 *     sveltekit({
 *       preprocess: [svelte_preprocess_fuz_code(), vitePreprocess()],
 *     }),
 *   ],
 * });
 * ```
 */
export const svelte_preprocess_fuz_code = (
	options: PreprocessFuzCodeOptions = {}
): PreprocessorGroup => {
	const {
		exclude = [],
		syntax_styler = syntax_styler_global,
		cache = true,
		code_imports = ['@fuzdev/fuz_code/Code.svelte'],
		code_diff_imports = ['@fuzdev/fuz_code/CodeDiff.svelte'],
		on_error = process.env.CI === 'true' ? 'throw' : 'log'
	} = options;

	// In-memory caches: content+lang → styled HTML, and the diff inputs → diff HTML
	const stylize_cache: Map<string, string> = new Map();
	const diff_cache: Map<string, string> = new Map();

	return {
		name: 'fuz-code',

		markup: ({ content, filename }) => {
			// Skip excluded files
			if (should_exclude_path(filename, exclude)) {
				return { code: content };
			}

			// Quick check: does file import from a known component source?
			if (
				!code_imports.some((source) => content.includes(source)) &&
				!code_diff_imports.some((source) => content.includes(source))
			) {
				return { code: content };
			}

			const s = new MagicString(content);
			const ast = parse(content, { filename, modern: true });

			// Resolve which local names map to each component
			const code_names = resolve_component_names(ast, code_imports);
			const code_diff_names = resolve_component_names(ast, code_diff_imports);
			if (code_names.size === 0 && code_diff_names.size === 0) {
				return { code: content };
			}

			const bindings = build_static_bindings(ast);

			// Find component usages with static content
			const transformations = find_usages(ast, syntax_styler, code_names, code_diff_names, {
				cache: cache ? stylize_cache : null,
				diff_cache: cache ? diff_cache : null,
				on_error,
				filename,
				source: content,
				bindings
			});

			if (transformations.length === 0) {
				return { code: content };
			}

			// Apply transformations
			for (const t of transformations) {
				if (t.replacement === '') s.remove(t.start, t.end);
				else s.overwrite(t.start, t.end, t.replacement);
			}

			return {
				code: s.toString(),
				map: s.generateMap({ hires: true })
			};
		}
	};
};

interface Transformation {
	start: number;
	end: number;
	replacement: string;
}

interface FindUsagesOptions {
	cache: Map<string, string> | null;
	diff_cache: Map<string, string> | null;
	on_error: 'log' | 'throw';
	filename: string | undefined;
	source: string;
	bindings: ReadonlyMap<string, string>;
}

/**
 * Attempts to style content, using the cache if available.
 * Returns the styled HTML, or `null` on error.
 */
const try_stylize = (
	text: string,
	lang: string,
	syntax_styler: SyntaxStyler,
	options: FindUsagesOptions
): string | null => {
	const cache_key = `${lang}:${text}`;
	let html = options.cache?.get(cache_key);
	if (html == null) {
		try {
			html = syntax_styler.stylize(text, lang);
			options.cache?.set(cache_key, html);
		} catch (error) {
			handle_preprocess_error(error, '[fuz-code]', options.filename, options.on_error);
			return null;
		}
	}
	return html;
};

/**
 * Attempts to render a diff view, using the cache if available.
 * Returns the rows' HTML, or `null` on error.
 */
const try_render_diff = (
	a: string,
	b: string,
	split: boolean,
	render_options: RenderDiffOptions,
	options: FindUsagesOptions
): string | null => {
	// `a`'s length delimits it from `b`; the styler is one per preprocessor
	const { syntax_styler: _, ...keyed } = render_options;
	const cache_key = `${split}:${JSON.stringify(keyed)}:${a.length}:${a}${b}`;
	let html = options.diff_cache?.get(cache_key);
	if (html == null) {
		try {
			html = (split ? render_diff_split_html : render_diff_unified_html)(a, b, render_options);
			options.diff_cache?.set(cache_key, html);
		} catch (error) {
			handle_preprocess_error(error, '[fuz-code]', options.filename, options.on_error);
			return null;
		}
	}
	return html;
};

/**
 * Extracts a boolean a prop is statically known to receive: `true` for a
 * bare attribute, or the value of a boolean literal. Returns `null` for
 * anything else, including a quoted value, which reaches the component as a
 * string.
 */
const extract_static_boolean = (value: AST.Attribute['value']): boolean | null => {
	if (value === true) return true;
	if (Array.isArray(value)) return null;
	const expr = value.expression;
	return expr.type === 'Literal' && typeof expr.value === 'boolean' ? expr.value : null;
};

/**
 * Extracts a number a prop is statically known to receive: a number literal,
 * optionally negated, or `Infinity`. Returns `null` for anything else.
 */
const extract_static_number = (value: AST.Attribute['value']): number | null => {
	if (value === true || Array.isArray(value)) return null;
	let expr = value.expression;
	let sign = 1;
	if (expr.type === 'UnaryExpression' && expr.operator === '-') {
		sign = -1;
		expr = expr.argument;
	}
	if (expr.type === 'Literal' && typeof expr.value === 'number') return sign * expr.value;
	if (expr.type === 'Identifier' && expr.name === 'Infinity') return sign * Infinity;
	return null;
};

/**
 * Builds the transformation for one `Code` usage with a static `content`
 * prop, replacing it with `dangerous_raw_html`. Pushes nothing when the
 * usage has to stay runtime.
 */
const transform_code_usage = (
	node: AST.Component,
	syntax_styler: SyntaxStyler,
	options: FindUsagesOptions,
	transformations: Array<Transformation>
): void => {
	const content_attr = find_attribute(node, 'content');
	if (!content_attr) return;

	// Resolve language - must be static and supported
	const lang_attr = find_attribute(node, 'lang');
	const lang_value = lang_attr
		? extract_static_string(lang_attr.value, options.bindings)
		: 'svelte';
	if (lang_value === null) return;
	if (!syntax_styler.has_lang(lang_value)) return;

	// Try simple static string
	const content_value = extract_static_string(content_attr.value, options.bindings);
	if (content_value !== null) {
		const html = try_stylize(content_value, lang_value, syntax_styler, options);
		if (html === null || html === content_value) return;
		transformations.push({
			start: content_attr.start,
			end: content_attr.end,
			replacement: `dangerous_raw_html={'${escape_js_string(html)}'}`
		});
		return;
	}

	// Try conditional chain (handles both simple and nested ternaries)
	const chain = try_extract_conditional_chain(content_attr.value, options.source, options.bindings);
	if (chain) {
		// Style all branches
		const styled: Array<{ html: string; original: string }> = [];
		let any_changed = false;
		for (const branch of chain) {
			const html = try_stylize(branch.value, lang_value, syntax_styler, options);
			if (html === null) return;
			if (html !== branch.value) any_changed = true;
			styled.push({ html, original: branch.value });
		}
		if (!any_changed) return;

		// Build nested ternary expression for dangerous_raw_html
		// chain: [{test_source: 'a', value: ...}, {test_source: 'b', value: ...}, {test_source: null, value: ...}]
		// → a ? 'html_a' : b ? 'html_b' : 'html_c'
		let expr = '';
		for (let i = 0; i < chain.length; i++) {
			const branch = chain[i]!;
			const html = styled[i]!.html;
			if (branch.test_source !== null) {
				expr += `${branch.test_source} ? '${escape_js_string(html)}' : `;
			} else {
				expr += `'${escape_js_string(html)}'`;
			}
		}

		transformations.push({
			start: content_attr.start,
			end: content_attr.end,
			replacement: `dangerous_raw_html={${expr}}`
		});
	}
};

/**
 * Builds the transformations for one `CodeDiff` usage with static `a` and
 * `b` props: `a` becomes `dangerous_raw_html` and `b` is removed. Every prop
 * that shapes the rows has to be statically known, since the rows are
 * rendered here; the props left in place are ones the component ignores
 * once it has `dangerous_raw_html`. Pushes nothing when the usage has to
 * stay runtime.
 */
const transform_code_diff_usage = (
	node: AST.Component,
	syntax_styler: SyntaxStyler,
	options: FindUsagesOptions,
	transformations: Array<Transformation>
): void => {
	const a_attr = find_attribute(node, 'a');
	const b_attr = find_attribute(node, 'b');
	if (!a_attr || !b_attr) return;
	// highlighted lines are almost always runtime state (a line link, a
	// selection), and though the component's effect could highlight
	// pre-rendered rows, it runs only once mounted: the page would first show
	// them unhighlighted until hydration. Rendered at runtime, the rows carry
	// the highlight from the start
	if (find_attribute(node, 'highlight')) return;
	const a = extract_static_string(a_attr.value, options.bindings);
	if (a === null) return;
	const b = extract_static_string(b_attr.value, options.bindings);
	if (b === null) return;

	// Resolve language - must be static and supported
	const lang_attr = find_attribute(node, 'lang');
	const lang = lang_attr ? extract_static_string(lang_attr.value, options.bindings) : 'svelte';
	if (lang === null) return;
	if (!syntax_styler.has_lang(lang)) return;

	const render_options: RenderDiffOptions = { lang, syntax_styler };

	const elide_attr = find_attribute(node, 'elide');
	if (elide_attr) {
		const elide = extract_static_string(elide_attr.value, options.bindings);
		// `'expand'` stays at runtime: its controls render rows on demand
		if (elide !== 'details' && elide !== 'omit' && elide !== 'none') return;
		render_options.elide = elide;
	}
	for (const name of ['intraline', 'line_numbers'] as const) {
		const attr = find_attribute(node, name);
		if (!attr) continue;
		const value = extract_static_boolean(attr.value);
		if (value === null) return;
		render_options[name] = value;
	}
	for (const name of ['context_lines', 'max_cost'] as const) {
		const attr = find_attribute(node, name);
		if (!attr) continue;
		const value = extract_static_number(attr.value);
		if (value === null) return;
		render_options[name] = value;
	}

	// `split` picks the view: statically known, or any expression, which gets
	// both views behind it
	const split_attr = find_attribute(node, 'split');
	let split: boolean | null = false;
	let split_source = '';
	if (split_attr) {
		split = extract_static_boolean(split_attr.value);
		if (split === null) {
			// a quoted value reaches the component as a string, never a boolean
			if (split_attr.value === true || Array.isArray(split_attr.value)) return;
			const expr = split_attr.value.expression as unknown as AST.BaseNode;
			split_source = options.source.slice(expr.start, expr.end);
		}
	}

	let replacement;
	if (split === null) {
		const split_html = try_render_diff(a, b, true, render_options, options);
		if (split_html === null) return;
		const unified_html = try_render_diff(a, b, false, render_options, options);
		if (unified_html === null) return;
		replacement = `dangerous_raw_html={(${split_source}) ? '${escape_js_string(split_html)}' : '${escape_js_string(unified_html)}'}`;
	} else {
		const html = try_render_diff(a, b, split, render_options, options);
		if (html === null) return;
		replacement = `dangerous_raw_html={'${escape_js_string(html)}'}`;
	}

	// remove `b` along with the whitespace before it
	let b_start = b_attr.start;
	while (b_start > 0 && ' \t\n\r'.includes(options.source[b_start - 1]!)) b_start--;
	transformations.push(
		{ start: a_attr.start, end: a_attr.end, replacement },
		{ start: b_start, end: b_attr.end, replacement: '' }
	);
};

/**
 * Walks the AST to find `Code` and `CodeDiff` component usages with static
 * props and generates transformations to replace them with
 * `dangerous_raw_html`.
 */
const find_usages = (
	ast: AST.Root,
	syntax_styler: SyntaxStyler,
	code_names: Map<string, ResolvedComponentImport>,
	code_diff_names: Map<string, ResolvedComponentImport>,
	options: FindUsagesOptions
): Array<Transformation> => {
	const transformations: Array<Transformation> = [];

	walk(ast.fragment as any, null, {
		Component(node: AST.Component, context: { next: () => void }) {
			// Always recurse into children - without this, components nested
			// inside other components would be missed, because zimmerframe
			// does not auto-recurse when a visitor is defined for a node type.
			context.next();

			const is_code = code_names.has(node.name);
			if (!is_code && !code_diff_names.has(node.name)) return;

			// Skip if spread attributes present — can't determine the props statically
			if (node.attributes.some((attr) => attr.type === 'SpreadAttribute')) return;

			// Skip if already preprocessed or a custom syntax_styler is provided
			if (find_attribute(node, 'dangerous_raw_html') || find_attribute(node, 'syntax_styler')) {
				return;
			}

			if (is_code) {
				transform_code_usage(node, syntax_styler, options, transformations);
			} else {
				transform_code_diff_usage(node, syntax_styler, options, transformations);
			}
		}
	});

	return transformations;
};
