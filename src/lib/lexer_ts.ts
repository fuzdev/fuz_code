import {
	is_digit,
	is_ident,
	is_ident_start,
	is_space,
	scan_ident,
	scan_to_line_end,
	skip_space,
	token_type,
	type Lexer,
	type SyntaxLang,
} from './lexer.ts';

/**
 * Hand-written TypeScript/JavaScript lexer.
 *
 * Token vocabulary matches the retired regex grammars (`grammar_js.ts` +
 * `grammar_ts.ts`) with the agreed fidelity fixes: previous-token tracking for
 * regex-literal vs division, unlimited template/interpolation nesting, and
 * position-major matching (strings win over comments that start inside them).
 *
 * Resilience: unterminated strings extend to end of line; unterminated
 * templates, block comments, and interpolations extend to end of window.
 */

const T_COMMENT = token_type('comment');
const T_HASHBANG = token_type('hashbang', 'comment');
const T_STRING = token_type('string');
const T_STRING_PROPERTY = token_type('string_property', 'property');
const T_TEMPLATE_STRING = token_type('template_string');
const T_TEMPLATE_PUNCTUATION = token_type('template_punctuation', 'string');
const T_INTERPOLATION = token_type('interpolation');
const T_INTERPOLATION_PUNCTUATION = token_type('interpolation_punctuation', 'punctuation');
const T_REGEX = token_type('regex');
const T_REGEX_DELIMITER = token_type('regex_delimiter');
const T_REGEX_SOURCE = token_type('regex_source', 'lang_regex');
const T_REGEX_FLAGS = token_type('regex_flags');
const T_KEYWORD = token_type('keyword');
const T_SPECIAL_KEYWORD = token_type('special_keyword');
const T_IMPORT_TYPE_KEYWORD = token_type('import_type_keyword', 'special_keyword');
const T_CLASS_NAME = token_type('class_name');
const T_TYPE_NAME = token_type('type_name', 'class_name');
const T_TYPE_ASSERTION = token_type('type_assertion', 'class_name');
const T_FUNCTION = token_type('function');
const T_FUNCTION_VARIABLE = token_type('function_variable', 'function');
const T_GENERIC_FUNCTION = token_type('generic_function');
const T_GENERIC = token_type('generic', 'class_name');
const T_BUILTIN = token_type('builtin');
const T_BOOLEAN = token_type('boolean');
const T_NUMBER = token_type('number');
const T_OPERATOR = token_type('operator');
const T_PUNCTUATION = token_type('punctuation');
const T_CONSTANT = token_type('constant');
const T_CAPITALIZED = token_type('capitalized_identifier', 'class_name');
const T_DECORATOR = token_type('decorator');
const T_AT = token_type('at', 'operator');
const T_DECORATOR_NAME = token_type('function', 'decorator_name');
const T_TYPE_ANNOTATION = token_type('type_annotation');
const T_COLON = token_type(':');
const T_TYPE = token_type('type');

// word classification kinds
const K_KEYWORD = 1; // unconditional keyword
const K_SPECIAL = 2; // unconditional special_keyword
const K_TS = 3; // ts-only unconditional keyword
const K_ASYNC = 4; // keyword before `function`/`*`/`(`/ident
const K_GET_SET = 5; // keyword before ident/`#`/`[`
const K_ASSERT = 6; // keyword before `{`
const K_TYPE_WORD = 7; // `type` — import_type_keyword or keyword before ident/`{`/`*`
const K_TS_COND = 8; // ts keyword before ident/`{`
const K_BOOLEAN = 9;
const K_NUMBER_WORD = 10; // NaN/Infinity

const WORDS: Map<string, number> = new Map();
const add_words = (kind: number, words: string): void => {
	for (const word of words.split(' ')) WORDS.set(word, kind);
};
add_words(
	K_KEYWORD,
	'class const debugger delete enum extends function implements in instanceof interface let ' +
		'new null of package private protected public static super this typeof undefined var void with',
);
add_words(
	K_SPECIAL,
	'as await break case catch continue default do else export finally for from if import ' +
		'return switch throw try while yield',
);
add_words(K_TS, 'abstract declare is keyof readonly require satisfies');
add_words(K_TS_COND, 'asserts infer module namespace');
add_words(K_ASYNC, 'async');
add_words(K_GET_SET, 'get set');
add_words(K_ASSERT, 'assert');
add_words(K_TYPE_WORD, 'type');
add_words(K_BOOLEAN, 'true false');
add_words(K_NUMBER_WORD, 'NaN Infinity');

// keywords that put the lexer in a class-name context for the next identifier
const CLASS_CTX_WORDS: Set<string> = new Set([
	'class',
	'extends',
	'implements',
	'instanceof',
	'interface',
	'new',
	'type',
]);
// keywords after which the next identifier is a type assertion
const AS_WORDS: Set<string> = new Set(['as', 'satisfies']);
const IMPORT_WORDS: Set<string> = new Set(['import', 'export']);
// value-like keywords — division follows, not a regex literal
const VALUE_WORDS: Set<string> = new Set(['this', 'super', 'null', 'undefined']);

// lowercase-only builtins are reachable — capitalized ones are claimed by
// `capitalized_identifier` first, matching the old grammar's priority order
const BUILTIN_WORDS: Set<string> = new Set([
	'Array',
	'Function',
	'Promise',
	'any',
	'boolean',
	'console',
	'never',
	'number',
	'string',
	'symbol',
	'unknown',
]);

// previous-significant-token categories, for regex-vs-division and contexts
const P_NONE = 0; // start / after operator, `{`, `(`, `[`, `,`, `;` — regex allowed
const P_VALUE = 1; // after a value — `/` is division
const P_DOT = 2; // after `.` member access — next word is a property, not a keyword

// bounded lookahead for heuristic scans (generics, annotations, arrow params)
const MAX_SCAN = 600;

const is_upper = (c: number): boolean => c >= 65 && c <= 90;

/**
 * Scans a `'` or `"` string from `i`, returning the exclusive end.
 * Handles escapes and line continuations; unterminated stops at the newline.
 */
const scan_ts_string = (text: string, from: number, end: number, quote: number): number => {
	let i = from + 1;
	while (i < end) {
		const c = text.charCodeAt(i);
		if (c === 92) {
			// escape; a `\` before a newline continues the string
			i += text.charCodeAt(i + 1) === 13 && text.charCodeAt(i + 2) === 10 ? 3 : 2;
		} else if (c === quote) {
			return i + 1;
		} else if (c === 10 || c === 13) {
			return i;
		} else {
			i++;
		}
	}
	return end;
};

/**
 * Scans a numeric literal from `i` (at a digit, or `.` before a digit),
 * returning the exclusive end. Handles hex/binary/octal, `_` separators,
 * exponents, and bigint `n` suffixes.
 */
const scan_ts_number = (text: string, i: number, end: number): number => {
	const scan_digits = (from: number, is_wanted: (c: number) => boolean): number => {
		let j = from;
		while (j < end) {
			const c = text.charCodeAt(j);
			if (is_wanted(c) || (c === 95 && is_wanted(text.charCodeAt(j + 1)))) j++;
			else break;
		}
		return j;
	};
	const is_hex = (c: number): boolean =>
		(c >= 48 && c <= 57) || (c >= 97 && c <= 102) || (c >= 65 && c <= 70);
	const is_binary = (c: number): boolean => c === 48 || c === 49;
	const is_octal = (c: number): boolean => c >= 48 && c <= 55;

	if (text.charCodeAt(i) === 48) {
		const c2 = text.charCodeAt(i + 1);
		if (c2 === 120 || c2 === 88) {
			let j = scan_digits(i + 2, is_hex);
			if (text.charCodeAt(j) === 110) j++; // n
			return j;
		}
		if (c2 === 98 || c2 === 66) {
			let j = scan_digits(i + 2, is_binary);
			if (text.charCodeAt(j) === 110) j++;
			return j;
		}
		if (c2 === 111 || c2 === 79) {
			let j = scan_digits(i + 2, is_octal);
			if (text.charCodeAt(j) === 110) j++;
			return j;
		}
	}
	let j = scan_digits(i, is_digit);
	let is_integer = true;
	if (text.charCodeAt(j) === 46 && is_digit(text.charCodeAt(j + 1))) {
		is_integer = false;
		j = scan_digits(j + 1, is_digit);
	}
	const e = text.charCodeAt(j);
	if (e === 101 || e === 69) {
		let k = j + 1;
		const sign = text.charCodeAt(k);
		if (sign === 43 || sign === 45) k++;
		if (is_digit(text.charCodeAt(k))) {
			j = scan_digits(k, is_digit);
			is_integer = false;
		}
	}
	if (is_integer && text.charCodeAt(j) === 110) j++; // bigint
	return j;
};

/**
 * Skips a quoted span (used inside balanced scans), returning the index after
 * the closing quote, or after the span's line for unterminated strings.
 */
const skip_quoted = (text: string, from: number, end: number, quote: number): number => {
	let i = from + 1;
	while (i < end) {
		const c = text.charCodeAt(i);
		if (c === 92) i += 2;
		else if (c === quote) return i + 1;
		else if ((c === 10 || c === 13) && quote !== 96) return i;
		else i++;
	}
	return end;
};

/**
 * Finds the matching `}` for the `{` at `i`, skipping strings, templates, and
 * comments. Returns -1 when unbalanced within the window.
 */
const scan_balanced_braces = (text: string, i: number, end: number): number => {
	let depth = 0;
	let j = i;
	while (j < end) {
		const c = text.charCodeAt(j);
		if (c === 123) {
			depth++;
			j++;
		} else if (c === 125) {
			depth--;
			if (depth === 0) return j;
			j++;
		} else if (c === 34 || c === 39 || c === 96) {
			j = skip_quoted(text, j, end, c);
		} else if (c === 47) {
			const c2 = text.charCodeAt(j + 1);
			if (c2 === 47) {
				j = scan_to_line_end(text, j, end);
			} else if (c2 === 42) {
				const close = text.indexOf('*/', j + 2);
				j = close === -1 || close + 2 > end ? end : close + 2;
			} else {
				j++;
			}
		} else {
			j++;
		}
	}
	return -1;
};

/**
 * Finds the matching `>` for the `<` at `i` (generic argument lists), skipping
 * strings. Bounded by `MAX_SCAN`; returns -1 when unbalanced.
 */
const scan_balanced_angle = (text: string, i: number, end: number): number => {
	const limit = i + MAX_SCAN < end ? i + MAX_SCAN : end;
	let depth = 0;
	let j = i;
	while (j < limit) {
		const c = text.charCodeAt(j);
		if (c === 60) {
			depth++;
			j++;
		} else if (c === 62) {
			depth--;
			if (depth === 0) return j;
			j++;
		} else if (c === 34 || c === 39 || c === 96) {
			j = skip_quoted(text, j, end, c);
		} else if (c === 59) {
			return -1; // `;` never appears in a generic argument list
		} else {
			j++;
		}
	}
	return -1;
};

/**
 * Finds the matching `)` for the `(` at `i`, skipping strings and nested
 * parens. Bounded by `MAX_SCAN`; returns -1 when unbalanced.
 */
const scan_balanced_parens = (text: string, i: number, end: number): number => {
	const limit = i + MAX_SCAN < end ? i + MAX_SCAN : end;
	let depth = 0;
	let j = i;
	while (j < limit) {
		const c = text.charCodeAt(j);
		if (c === 40) {
			depth++;
			j++;
		} else if (c === 41) {
			depth--;
			if (depth === 0) return j;
			j++;
		} else if (c === 34 || c === 39 || c === 96) {
			j = skip_quoted(text, j, end, c);
		} else {
			j++;
		}
	}
	return -1;
};

/**
 * Detects whether the identifier ending at `ident_end` is a function-valued
 * variable: `ident` followed by `=` or `:`, then optional `async`, then a
 * `function` keyword, `(params) =>`, or `param =>`.
 */
const is_function_variable = (text: string, ident_end: number, end: number): boolean => {
	let j = skip_space(text, ident_end, end);
	const c = text.charCodeAt(j);
	if (c === 61) {
		// `=` — but not `==`/`=>`/`===`
		const c2 = text.charCodeAt(j + 1);
		if (c2 === 61 || c2 === 62) return false;
	} else if (c !== 58) {
		return false;
	}
	j = skip_space(text, j + 1, end);
	// optional `async`
	if (text.startsWith('async', j)) {
		const after = j + 5;
		if (!is_ident(text.charCodeAt(after))) j = skip_space(text, after, end);
	}
	if (text.startsWith('function', j) && !is_ident(text.charCodeAt(j + 8))) return true;
	const c3 = text.charCodeAt(j);
	if (c3 === 40) {
		// `(params)` then optional `: type` then `=>`
		const close = scan_balanced_parens(text, j, end);
		if (close === -1) return false;
		let k = skip_space(text, close + 1, end);
		if (text.charCodeAt(k) === 58) {
			// return type annotation — scan to `=>` before a terminator
			const limit = k + MAX_SCAN < end ? k + MAX_SCAN : end;
			k++;
			while (k < limit) {
				const c4 = text.charCodeAt(k);
				if (c4 === 61 && text.charCodeAt(k + 1) === 62) break;
				if (c4 === 59 || c4 === 61) return false;
				k++;
			}
		}
		return text.charCodeAt(k) === 61 && text.charCodeAt(k + 1) === 62;
	}
	if (is_ident_start(c3)) {
		// `param =>`
		const param_end = scan_ident(text, j, end);
		const k = skip_space(text, param_end, end);
		return text.charCodeAt(k) === 61 && text.charCodeAt(k + 1) === 62;
	}
	return false;
};

/**
 * Heuristic for `: type =` annotations (mirrors the old `type_annotation`
 * pattern): from the `:` at `i`, scans over a type expression with balanced
 * `<>`/`[]`/`{}`/`()`, succeeding at a top-level `=` (not `==`/`=>`).
 * Returns the exclusive end of the type text, or -1.
 */
const scan_type_annotation = (text: string, i: number, end: number): number => {
	const limit = i + MAX_SCAN < end ? i + MAX_SCAN : end;
	let angle = 0;
	let square = 0;
	let j = i + 1;
	while (j < limit) {
		const c = text.charCodeAt(j);
		if (c === 61) {
			// `=`
			if (angle === 0 && square === 0) {
				const c2 = text.charCodeAt(j + 1);
				if (c2 === 61 || c2 === 62) return -1;
				const c0 = text.charCodeAt(j - 1);
				if (c0 === 33 || c0 === 60 || c0 === 62) return -1; // != <= >=
				return j;
			}
			j++;
		} else if (c === 60) {
			angle++;
			j++;
		} else if (c === 62) {
			if (angle === 0) return -1;
			angle--;
			j++;
		} else if (c === 91) {
			square++;
			j++;
		} else if (c === 93) {
			if (square === 0) return -1;
			square--;
			j++;
		} else if (
			angle === 0 &&
			square === 0 &&
			(c === 59 || c === 44 || c === 123 || c === 125 || c === 40 || c === 41)
		) {
			// top-level statement/grouping chars end the candidate type text —
			// object/function types are not annotation targets here (parity
			// with the old pattern, which also rejected them; prevents the
			// scan from running away across statement boundaries)
			return -1;
		} else if (c === 34 || c === 39) {
			j = skip_quoted(text, j, end, c);
		} else {
			j++;
		}
	}
	return -1;
};

/**
 * Scans a multi-char operator at `i`, returning its length.
 */
const scan_operator = (text: string, i: number, end: number): number => {
	const c = text.charCodeAt(i);
	const c2 = i + 1 < end ? text.charCodeAt(i + 1) : 0;
	const c3 = i + 2 < end ? text.charCodeAt(i + 2) : 0;
	const c4 = i + 3 < end ? text.charCodeAt(i + 3) : 0;
	switch (c) {
		case 43: // +
			return c2 === 43 || c2 === 61 ? 2 : 1;
		case 45: // -
			return c2 === 45 || c2 === 61 ? 2 : 1;
		case 42: // *
			if (c2 === 42) return c3 === 61 ? 3 : 2;
			return c2 === 61 ? 2 : 1;
		case 37: // %
			return c2 === 61 ? 2 : 1;
		case 38: // &
			if (c2 === 38) return c3 === 61 ? 3 : 2;
			return c2 === 61 ? 2 : 1;
		case 124: // |
			if (c2 === 124) return c3 === 61 ? 3 : 2;
			return c2 === 61 ? 2 : 1;
		case 94: // ^
			return c2 === 61 ? 2 : 1;
		case 61: // =
			if (c2 === 61) return c3 === 61 ? 3 : 2;
			return c2 === 62 ? 2 : 1; // =>
		case 33: // !
			if (c2 === 61) return c3 === 61 ? 3 : 2;
			return 1;
		case 60: // <
			if (c2 === 60) return c3 === 61 ? 3 : 2;
			return c2 === 61 ? 2 : 1;
		case 62: // >
			if (c2 === 62) {
				if (c3 === 62) return c4 === 61 ? 4 : 3;
				return c3 === 61 ? 3 : 2;
			}
			return c2 === 61 ? 2 : 1;
		case 63: // ?
			if (c2 === 63) return c3 === 61 ? 3 : 2;
			return c2 === 46 ? 2 : 1; // ?.
		case 47: // /
			return c2 === 61 ? 2 : 1;
		default:
			return 1; // ~ :
	}
};

/**
 * Lexes a template literal starting at the backtick at `i`, returning the new
 * position. Interpolations recurse through the full lexer.
 */
const lex_ts_template = (l: Lexer, i: number, to: number, js: boolean): number => {
	const {text} = l;
	l.open(T_TEMPLATE_STRING, i);
	l.leaf(T_TEMPLATE_PUNCTUATION, i, i + 1);
	let j = i + 1;
	let chunk_start = j;
	let closed = false;
	while (j < to) {
		const c = text.charCodeAt(j);
		if (c === 92) {
			j += 2;
		} else if (c === 96) {
			l.leaf(T_STRING, chunk_start, j);
			l.leaf(T_TEMPLATE_PUNCTUATION, j, j + 1);
			j++;
			closed = true;
			break;
		} else if (c === 36 && text.charCodeAt(j + 1) === 123) {
			l.leaf(T_STRING, chunk_start, j);
			const close = scan_balanced_braces(text, j + 1, to);
			const inner_end = close === -1 ? to : close;
			l.open(T_INTERPOLATION, j);
			l.leaf(T_INTERPOLATION_PUNCTUATION, j, j + 2);
			lex_ts_window(l, j + 2, inner_end, false, js);
			if (close === -1) {
				l.close(to);
				j = to;
			} else {
				l.leaf(T_INTERPOLATION_PUNCTUATION, close, close + 1);
				l.close(close + 1);
				j = close + 1;
			}
			chunk_start = j;
		} else {
			j++;
		}
	}
	if (!closed) {
		if (j > to) j = to;
		l.leaf(T_STRING, chunk_start, j);
	}
	l.close(j);
	return j;
};

/**
 * The core window lexer. `type_mode` switches capitalized identifiers to
 * `type_name` (used for generics and type annotations).
 */
const lex_ts_window = (
	l: Lexer,
	from: number,
	to: number,
	type_mode: boolean,
	js: boolean,
): void => {
	const {text} = l;
	let i = from;
	let prev = P_NONE;
	let prev_code = 0; // last significant punctuation char, for string-property detection
	let class_ctx = false;
	let as_ctx = false;
	let import_ctx = false;

	while (i < to) {
		const c = text.charCodeAt(i);
		if (is_space(c)) {
			i++;
			continue;
		}

		// identifiers (including `#private`)
		if (is_ident_start(c) || (c === 35 && is_ident_start(text.charCodeAt(i + 1)))) {
			const start = i;
			const ident_end = scan_ident(text, c === 35 ? i + 1 : i, to);
			const was_class_ctx = class_ctx;
			const was_as_ctx = as_ctx;
			const was_import_ctx = import_ctx;
			const was_dot = prev === P_DOT;
			class_ctx = as_ctx = import_ctx = false;
			prev = P_VALUE;
			prev_code = 0;
			i = ident_end;

			const word = text.slice(start, ident_end);
			const kind = c === 35 || was_dot ? undefined : WORDS.get(word);

			if (was_class_ctx && kind === undefined && c !== 35) {
				// class-name chain: `Foo`, `a.b.Foo`, optionally with generics
				l.leaf(T_CLASS_NAME, start, ident_end);
				while (text.charCodeAt(i) === 46 && is_ident_start(text.charCodeAt(i + 1)) && i + 1 < to) {
					l.leaf(T_PUNCTUATION, i, i + 1);
					const seg_end = scan_ident(text, i + 1, to);
					l.leaf(T_CLASS_NAME, i + 1, seg_end);
					i = seg_end;
				}
				if (!js) {
					const angle_start = skip_space(text, i, to);
					if (text.charCodeAt(angle_start) === 60) {
						const angle_end = scan_balanced_angle(text, angle_start, to);
						if (angle_end !== -1) {
							lex_ts_window(l, angle_start, angle_end + 1, true, js);
							i = angle_end + 1;
						}
					}
				}
				continue;
			}

			if (was_as_ctx && kind === undefined && c !== 35 && !js && !BUILTIN_WORDS.has(word)) {
				// `x as Foo` — but `as unknown`/`as string` keep their builtin type
				l.leaf(T_TYPE_ASSERTION, start, ident_end);
				continue;
			}

			// keyword classification (with contextual lookaheads)
			if (kind !== undefined) {
				let keyword_id = 0;
				switch (kind) {
					case K_KEYWORD:
						keyword_id = T_KEYWORD;
						break;
					case K_SPECIAL:
						keyword_id = T_SPECIAL_KEYWORD;
						break;
					case K_TS:
						if (!js) keyword_id = T_KEYWORD;
						break;
					case K_ASYNC: {
						const n = text.charCodeAt(skip_space(text, ident_end, to));
						if (n === 40 || n === 42 || is_ident_start(n) || Number.isNaN(n)) {
							keyword_id = T_KEYWORD;
						}
						break;
					}
					case K_GET_SET: {
						const n = text.charCodeAt(skip_space(text, ident_end, to));
						if (n === 35 || n === 91 || is_ident_start(n) || Number.isNaN(n)) {
							keyword_id = T_KEYWORD;
						}
						break;
					}
					case K_ASSERT: {
						if (text.charCodeAt(skip_space(text, ident_end, to)) === 123) {
							keyword_id = T_KEYWORD;
						}
						break;
					}
					case K_TYPE_WORD: {
						if (js) break;
						const n = text.charCodeAt(skip_space(text, ident_end, to));
						// `import type {…}` / `export type * from …` — a type-only
						// import/export modifier, not a type-alias declaration
						if (was_import_ctx && (n === 123 || n === 42)) {
							l.leaf(T_IMPORT_TYPE_KEYWORD, start, ident_end);
							continue;
						}
						if (n === 123 || n === 42 || is_ident_start(n)) {
							keyword_id = T_KEYWORD;
						}
						break;
					}
					case K_TS_COND: {
						if (js) break;
						const n = text.charCodeAt(skip_space(text, ident_end, to));
						if (n === 123 || is_ident_start(n) || Number.isNaN(n)) {
							keyword_id = T_KEYWORD;
						}
						break;
					}
					case K_BOOLEAN:
						l.leaf(T_BOOLEAN, start, ident_end);
						continue;
					case K_NUMBER_WORD:
						l.leaf(T_NUMBER, start, ident_end);
						continue;
				}
				if (keyword_id !== 0) {
					l.leaf(keyword_id, start, ident_end);
					if (CLASS_CTX_WORDS.has(word) && (word !== 'type' || !js)) class_ctx = true;
					if (AS_WORDS.has(word) && !js) as_ctx = true;
					if (IMPORT_WORDS.has(word)) import_ctx = true;
					if (!VALUE_WORDS.has(word)) prev = P_NONE;
					continue;
				}
			}

			// function-valued variables: `f = () => …`, `f: async x => …`
			if (!type_mode && c !== 35 && is_function_variable(text, ident_end, to)) {
				l.leaf(T_FUNCTION_VARIABLE, start, ident_end);
				continue;
			}

			// SCREAMING_CASE constants, then capitalized identifiers — both
			// before the call lookahead, matching the old grammar's priority
			if (is_upper(c)) {
				let all_caps = true;
				for (let k = start + 1; k < ident_end; k++) {
					const cc = text.charCodeAt(k);
					// `x` only after a digit (hex-ish constants like `A0x`), per the old pattern
					if (
						!is_upper(cc) &&
						cc !== 95 &&
						!is_digit(cc) &&
						!(cc === 120 && is_digit(text.charCodeAt(k - 1)))
					) {
						all_caps = false;
						break;
					}
				}
				if (type_mode) {
					l.leaf(T_TYPE_NAME, start, ident_end);
				} else if (all_caps) {
					l.leaf(T_CONSTANT, start, ident_end);
				} else {
					l.leaf(T_CAPITALIZED, start, ident_end);
				}
				continue;
			}

			// generic call: `foo<T>(…)`
			if (!js) {
				const angle_start = skip_space(text, ident_end, to);
				if (text.charCodeAt(angle_start) === 60) {
					const angle_end = scan_balanced_angle(text, angle_start, to);
					if (angle_end !== -1 && text.charCodeAt(skip_space(text, angle_end + 1, to)) === 40) {
						l.open(T_GENERIC_FUNCTION, start);
						l.leaf(T_FUNCTION, start, ident_end);
						l.open(T_GENERIC, angle_start);
						lex_ts_window(l, angle_start, angle_end + 1, true, js);
						l.close(angle_end + 1);
						l.close(angle_end + 1);
						i = angle_end + 1;
						continue;
					}
				}
			}

			// call: `foo(…)` (also `#private(…)`)
			if (text.charCodeAt(skip_space(text, ident_end, to)) === 40) {
				l.leaf(T_FUNCTION, start, ident_end);
				continue;
			}

			if (kind === undefined && !was_dot && c !== 35 && BUILTIN_WORDS.has(word)) {
				l.leaf(T_BUILTIN, start, ident_end);
				continue;
			}

			// plain identifier — no token
			continue;
		}

		// `/` — comment, regex literal, or division
		if (c === 47) {
			const c2 = i + 1 < to ? text.charCodeAt(i + 1) : 0;
			if (c2 === 47) {
				const line_end = scan_to_line_end(text, i, to);
				l.leaf(T_COMMENT, i, line_end);
				i = line_end;
				continue; // comments are transparent — contexts survive
			}
			if (c2 === 42) {
				const close = text.indexOf('*/', i + 2);
				const comment_end = close === -1 || close + 2 > to ? to : close + 2;
				l.leaf(T_COMMENT, i, comment_end);
				i = comment_end;
				continue;
			}
			class_ctx = as_ctx = import_ctx = false;
			if (prev !== P_VALUE && prev !== P_DOT) {
				// regex literal position
				const body_end = scan_regex_body(text, i, to);
				if (body_end !== -1) {
					let flags_end = body_end + 1;
					while (flags_end < to) {
						const f = text.charCodeAt(flags_end);
						if (f >= 97 && f <= 122) flags_end++;
						else break;
					}
					l.open(T_REGEX, i);
					l.leaf(T_REGEX_DELIMITER, i, i + 1);
					l.leaf(T_REGEX_SOURCE, i + 1, body_end);
					l.leaf(T_REGEX_DELIMITER, body_end, body_end + 1);
					if (flags_end > body_end + 1) l.leaf(T_REGEX_FLAGS, body_end + 1, flags_end);
					l.close(flags_end);
					i = flags_end;
					prev = P_VALUE;
					prev_code = 0;
					continue;
				}
			}
			const op_len = scan_operator(text, i, to);
			l.leaf(T_OPERATOR, i, i + op_len);
			i += op_len;
			prev = P_NONE;
			prev_code = 0;
			continue;
		}

		// strings
		if (c === 34 || c === 39) {
			const str_end = scan_ts_string(text, i, to, c);
			// `{"key": …}` / `, "key": …` — a string property key
			let is_property = false;
			if (!type_mode && (prev_code === 123 || prev_code === 44)) {
				const after = skip_space(text, str_end, to);
				is_property = text.charCodeAt(after) === 58;
			}
			l.leaf(is_property ? T_STRING_PROPERTY : T_STRING, i, str_end);
			i = str_end;
			prev = P_VALUE;
			prev_code = 0;
			class_ctx = as_ctx = import_ctx = false;
			continue;
		}

		// template literals
		if (c === 96) {
			i = lex_ts_template(l, i, to, js);
			prev = P_VALUE;
			prev_code = 0;
			class_ctx = as_ctx = import_ctx = false;
			continue;
		}

		// numbers (also `.5` — the scan handles a leading `.` before digits)
		if (is_digit(c) || (c === 46 && is_digit(text.charCodeAt(i + 1)))) {
			const num_end = scan_ts_number(text, i, to);
			l.leaf(T_NUMBER, i, num_end);
			i = num_end;
			prev = P_VALUE;
			prev_code = 0;
			class_ctx = as_ctx = import_ctx = false;
			continue;
		}

		// `.` — member access or spread
		if (c === 46) {
			class_ctx = as_ctx = import_ctx = false;
			if (text.charCodeAt(i + 1) === 46 && text.charCodeAt(i + 2) === 46) {
				l.leaf(T_OPERATOR, i, i + 3);
				i += 3;
				prev = P_NONE;
				prev_code = 0;
			} else {
				l.leaf(T_PUNCTUATION, i, i + 1);
				i++;
				prev = P_DOT;
				prev_code = 46;
			}
			continue;
		}

		// `@decorator`
		if (c === 64 && is_ident_start(text.charCodeAt(i + 1))) {
			const name_end = scan_ident(text, i + 1, to);
			l.open(T_DECORATOR, i);
			l.leaf(T_AT, i, i + 1);
			l.leaf(T_DECORATOR_NAME, i + 1, name_end);
			l.close(name_end);
			i = name_end;
			prev = P_NONE;
			prev_code = 0;
			class_ctx = as_ctx = import_ctx = false;
			continue;
		}

		// `:` — type annotation (with initializer) or plain operator
		if (c === 58) {
			class_ctx = as_ctx = import_ctx = false;
			if (!type_mode && !js) {
				const type_end = scan_type_annotation(text, i, to);
				if (type_end !== -1) {
					const type_start = skip_space(text, i + 1, to);
					let content_end = type_end;
					while (content_end > type_start && is_space(text.charCodeAt(content_end - 1))) {
						content_end--;
					}
					if (content_end > type_start) {
						l.open(T_TYPE_ANNOTATION, i);
						l.leaf(T_COLON, i, i + 1);
						l.open(T_TYPE, type_start);
						lex_ts_window(l, type_start, content_end, true, js);
						l.close(content_end);
						l.close(content_end);
						i = type_end;
						prev = P_NONE;
						prev_code = 0;
						continue;
					}
				}
			}
			l.leaf(T_OPERATOR, i, i + 1);
			i++;
			prev = P_NONE;
			prev_code = 0;
			continue;
		}

		// punctuation
		if (
			c === 123 ||
			c === 125 ||
			c === 91 ||
			c === 93 ||
			c === 40 ||
			c === 41 ||
			c === 59 ||
			c === 44
		) {
			l.leaf(T_PUNCTUATION, i, i + 1);
			prev = c === 41 || c === 93 ? P_VALUE : P_NONE;
			prev_code = c;
			i++;
			class_ctx = as_ctx = import_ctx = false;
			continue;
		}

		// operators
		if (
			c === 43 ||
			c === 45 ||
			c === 42 ||
			c === 37 ||
			c === 38 ||
			c === 124 ||
			c === 94 ||
			c === 61 ||
			c === 33 ||
			c === 60 ||
			c === 62 ||
			c === 63 ||
			c === 126
		) {
			const op_len = scan_operator(text, i, to);
			l.leaf(T_OPERATOR, i, i + op_len);
			// `?.` is member access — the next word is a property, not a keyword
			prev = c === 63 && op_len === 2 && text.charCodeAt(i + 1) === 46 ? P_DOT : P_NONE;
			i += op_len;
			prev_code = 0;
			class_ctx = as_ctx = import_ctx = false;
			continue;
		}

		// anything else is plain text
		i++;
		prev = P_NONE;
		prev_code = 0;
		class_ctx = as_ctx = import_ctx = false;
	}
};

/**
 * Scans a regex literal body from the `/` at `i`, returning the index of the
 * closing `/`, or -1 when this isn't a regex literal. Handles character
 * classes and escapes; regex literals never span lines.
 */
const scan_regex_body = (text: string, i: number, to: number): number => {
	let j = i + 1;
	let in_class = false;
	let any = false;
	while (j < to) {
		const c = text.charCodeAt(j);
		if (c === 92) {
			j += 2;
			any = true;
		} else if (c === 10 || c === 13) {
			return -1;
		} else if (in_class) {
			if (c === 93) in_class = false;
			j++;
		} else if (c === 91) {
			in_class = true;
			any = true;
			j++;
		} else if (c === 47) {
			return any ? j : -1; // empty body means `//` (handled as comment anyway)
		} else {
			any = true;
			j++;
		}
	}
	return -1;
};

const create_lex_ts =
	(js: boolean) =>
	(l: Lexer): void => {
		let i = l.pos;
		// hashbang at the very start of the document
		if (i === 0 && l.text.charCodeAt(0) === 35 && l.text.charCodeAt(1) === 33) {
			const line_end = scan_to_line_end(l.text, 0, l.end);
			l.leaf(T_HASHBANG, 0, line_end);
			i = line_end;
		}
		lex_ts_window(l, i, l.end, false, js);
		l.pos = l.end;
	};

/**
 * The TypeScript language registration for the lexer engine.
 */
export const lexer_ts: SyntaxLang = {id: 'ts', aliases: ['typescript'], lex: create_lex_ts(false)};
