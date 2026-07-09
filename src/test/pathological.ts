/**
 * Pathological input generators for the lexer engine — workload classes that
 * realistic samples don't cover: deep nesting, huge single lines, very long
 * and escape-heavy strings, many tiny tokens, and colon/angle/paren-dense
 * text that stresses the ts lexer's bounded heuristic scans
 * (`scan_type_annotation`, `scan_balanced_angle`, `is_function_variable`).
 *
 * Shared by the linearity suite (`lexer.pathological.test.ts`) and the
 * benchmark runner (`benchmark/benchmarks.ts`) so the same workloads are both
 * CI-enforced and perf-tracked.
 *
 * @module
 */

export interface PathologicalCase {
	name: string;
	lang: string;
	/**
	 * Generates an input of approximately `size` chars (at least one repetition
	 * of the case's building block, so tiny sizes still produce valid input).
	 */
	generate: (size: number) => string;
}

const repeat_to_size = (unit: string, size: number): string =>
	unit.repeat(Math.max(1, Math.round(size / unit.length)));

// fixed nesting depth for the deep-nesting cases — depth scaling with size
// would measure recursion/rescan depth instead of input length, and the ts
// template scan recurses on the JS call stack (design: depth bounded by input
// nesting), so blocks of constant depth are repeated to reach the target size
const NESTING_DEPTH = 32;

export const PATHOLOGICAL_CASES: Array<PathologicalCase> = [
	{
		// every `:` triggers a type-annotation lookahead that finds no `=` —
		// the measured trigger from the design sheet (§10)
		name: 'ts_colon_dense',
		lang: 'ts',
		generate: (size) => repeat_to_size('a:', size),
	},
	{
		// every ident is followed by `<` that never balances, so each one pays
		// the bounded generic-call angle scan
		name: 'ts_angle_dense',
		lang: 'ts',
		generate: (size) => repeat_to_size('a<', size),
	},
	{
		// every ident is followed by `= (` with no closing paren in reach, so
		// `is_function_variable` pays the bounded balanced-paren scan
		name: 'ts_paren_dense',
		lang: 'ts',
		generate: (size) => repeat_to_size('a=(', size),
	},
	{
		// template literals with interpolations nested NESTING_DEPTH deep
		name: 'ts_deep_template',
		lang: 'ts',
		generate: (size) =>
			repeat_to_size('`${'.repeat(NESTING_DEPTH) + '1' + '}`'.repeat(NESTING_DEPTH) + ';\n', size),
	},
	{
		// one enormous line of ordinary code — no newlines anywhere
		name: 'ts_huge_line',
		lang: 'ts',
		generate: (size) => repeat_to_size("const x1 = fn(a, 'str') + 42; ", size),
	},
	{
		// a single giant string literal
		name: 'ts_long_string',
		lang: 'ts',
		generate: (size) => `const s = "${'x'.repeat(Math.max(1, size - 14))}";`,
	},
	{
		// a single string that is nothing but escapes
		name: 'ts_escape_heavy',
		lang: 'ts',
		generate: (size) => `const s = "${'\\x'.repeat(Math.max(1, Math.floor(size / 2) - 7))}";`,
	},
	{
		// maximum token density — operator/number/punctuation every few chars
		name: 'ts_many_tiny',
		lang: 'ts',
		generate: (size) => repeat_to_size('a=1;', size),
	},
	{
		// one giant punctuation run — stresses emit-time span coalescing
		name: 'json_deep_array',
		lang: 'json',
		generate: (size: number): string => {
			const half = Math.max(1, Math.floor((size - 1) / 2));
			return '['.repeat(half) + '1' + ']'.repeat(half);
		},
	},
	{
		// every `<` opens a tag that never closes — one giant unterminated tag
		// churning through attribute names
		name: 'html_angle_flood',
		lang: 'html',
		generate: (size) => repeat_to_size('<a ', size),
	},
	{
		// attribute-dense tags in every value form
		name: 'html_attr_dense',
		lang: 'html',
		generate: (size) => repeat_to_size('<a b="c" d=e f>', size),
	},
	{
		// entity-dense text
		name: 'html_entity_dense',
		lang: 'html',
		generate: (size) => repeat_to_size('&amp;x', size),
	},
	{
		// expression-dense template text — balancer + ts embed per `{…}`
		name: 'svelte_expression_dense',
		lang: 'svelte',
		generate: (size) => repeat_to_size('{x}', size),
	},
	{
		// expression-valued attributes — tag scanner + expression interplay
		name: 'svelte_attr_expr_dense',
		lang: 'svelte',
		generate: (size) => repeat_to_size('<a b={c} {d} />', size),
	},
	{
		// nested rules NESTING_DEPTH deep — the native-nesting state stack
		name: 'css_deep_nesting',
		lang: 'css',
		generate: (size) =>
			repeat_to_size('a{'.repeat(NESTING_DEPTH) + 'color:red;' + '}'.repeat(NESTING_DEPTH), size),
	},
	{
		// command substitutions NESTING_DEPTH deep
		name: 'bash_deep_command_sub',
		lang: 'bash',
		generate: (size) =>
			repeat_to_size(
				'echo $('.repeat(NESTING_DEPTH) + 'ls' + ')'.repeat(NESTING_DEPTH) + '\n',
				size,
			),
	},
];
