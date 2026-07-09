import {
	is_digit,
	is_space,
	scan_to_line_end,
	skip_space,
	token_type,
	type Lexer,
	type SyntaxLang,
} from './lexer.ts';

/**
 * Hand-written Bash/shell lexer.
 *
 * Token vocabulary matches the retired regex grammar: `shebang`, `comment`,
 * `string` (double-quoted strings are containers whose `$`-expansions nest as
 * `variable`/`command_substitution`), `keyword`, `builtin`, `boolean`,
 * `number`, `variable`, `command_substitution` (a container), `function`,
 * `file_descriptor`, `operator`, `punctuation`, plus heredocs (`heredoc`
 * container + `heredoc_delimiter`).
 *
 * Fidelity fixes over the regex model:
 * - arithmetic expansion `$((…))` is recognized as distinct from command
 *   substitution `$(…)`; its `$((`/`))` are punctuation and the interior lexes
 *   as ordinary bash (numbers, `$vars`, and general operators fall out
 *   naturally — no dedicated arithmetic token types).
 * - heredocs match any delimiter, honor `<<-`, and support quoted (no
 *   expansion) vs unquoted (expanded) bodies; multiple heredocs redirected on
 *   one line are queued and their bodies consumed in order.
 *
 * Word classification (keyword/builtin/boolean) is a context-free `Map`
 * lookup, matching the old grammar's type-major behavior.
 *
 * Resilience: unterminated single-line constructs stop at the line boundary;
 * unterminated strings, command substitutions, and heredocs extend to the
 * window end.
 */

const T_SHEBANG = token_type('shebang', 'comment');
const T_COMMENT = token_type('comment');
const T_STRING = token_type('string');
const T_KEYWORD = token_type('keyword');
const T_BUILTIN = token_type('builtin');
const T_BOOLEAN = token_type('boolean');
const T_NUMBER = token_type('number');
const T_VARIABLE = token_type('variable');
const T_COMMAND_SUBSTITUTION = token_type('command_substitution');
const T_FUNCTION = token_type('function');
const T_FILE_DESCRIPTOR = token_type('file_descriptor', 'important');
const T_OPERATOR = token_type('operator');
const T_PUNCTUATION = token_type('punctuation');
const T_HEREDOC = token_type('heredoc', 'string');
const T_HEREDOC_DELIMITER = token_type('heredoc_delimiter', 'punctuation');

const K_KEYWORD = 1;
const K_BUILTIN = 2;
const K_BOOLEAN = 3;

const WORDS: Map<string, number> = new Map();
const add_words = (kind: number, words: string): void => {
	for (const word of words.split(' ')) WORDS.set(word, kind);
};
add_words(
	K_KEYWORD,
	'if then else elif fi for while until do done case esac in select function return local ' +
		'export declare typeset readonly unset set shift trap break continue coproc time',
);
add_words(
	K_BUILTIN,
	'echo printf cd pwd read test source eval exec exit getopts hash type ulimit umask wait kill ' +
		'jobs bg fg disown alias unalias command shopt',
);
add_words(K_BOOLEAN, 'true false');

// `$`-followed single-char special variables (`$@ $# $? $$ $! $* $-`); digits
// are handled by the `$word` scan
const SPECIAL_VAR: Set<number> = new Set([33, 64, 35, 36, 42, 63, 45]);

const is_word_char = (c: number): boolean =>
	(c >= 97 && c <= 122) || (c >= 65 && c <= 90) || (c >= 48 && c <= 57) || c === 95;

const is_alnum = (c: number): boolean =>
	(c >= 97 && c <= 122) || (c >= 65 && c <= 90) || (c >= 48 && c <= 57);

const is_hex = (c: number): boolean =>
	(c >= 48 && c <= 57) || (c >= 97 && c <= 102) || (c >= 65 && c <= 70);

const skip_blank = (text: string, from: number, end: number): number => {
	let i = from;
	while (i < end && (text.charCodeAt(i) === 32 || text.charCodeAt(i) === 9)) i++;
	return i;
};

// index of the next `\n` at or after `i` (or `end`) — for stepping between
// heredoc lines. Distinct from `scan_to_line_end`, which stops *before* a
// trailing `\r` and is used for single-line token boundaries.
const line_end_of = (text: string, i: number, end: number): number => {
	const nl = text.indexOf('\n', i);
	return nl === -1 || nl >= end ? end : nl;
};

/**
 * Scans a bash numeric literal from the digit at `i`: hex (`0x…`), base-N
 * (`\d+#[alnum]+`), or plain decimal (`\d+`, covering octal). Returns the
 * exclusive end.
 */
const scan_bash_number = (text: string, i: number, end: number): number => {
	if (text.charCodeAt(i) === 48 && (text.charCodeAt(i + 1) | 0x20) === 120) {
		let j = i + 2;
		while (j < end && is_hex(text.charCodeAt(j))) j++;
		return j;
	}
	let j = i;
	while (j < end && is_digit(text.charCodeAt(j))) j++;
	if (j < end && text.charCodeAt(j) === 35 && j + 1 < end && is_alnum(text.charCodeAt(j + 1))) {
		j++;
		while (j < end && is_alnum(text.charCodeAt(j))) j++;
	}
	return j;
};

/**
 * Skips a `'` or `"` quoted span (for balance scans), returning the index after
 * the closing quote or the window end. Single quotes are literal; double quotes
 * honor `\` escapes.
 */
const skip_bash_quote = (text: string, from: number, end: number, quote: number): number => {
	let i = from + 1;
	while (i < end) {
		const c = text.charCodeAt(i);
		if (c === 92 && quote === 34) i += 2;
		else if (c === quote) return i + 1;
		else i++;
	}
	return end;
};

/**
 * Scans a `$'…'` ANSI-C string from the `$` at `i`, returning the exclusive
 * end (with `\` escapes; unterminated extends to the window end).
 */
const scan_ansi_c = (text: string, i: number, end: number): number => {
	let j = i + 2;
	while (j < end) {
		const c = text.charCodeAt(j);
		if (c === 92) j += 2;
		else if (c === 39) return j + 1;
		else j++;
	}
	return end;
};

/**
 * Finds the `)` closing a `$(` command substitution whose `(` sits before
 * `from`, skipping strings and nested parens. Returns its index, or -1 when
 * unbalanced within the window.
 */
const scan_cmdsub_end = (text: string, from: number, end: number): number => {
	let depth = 0;
	let j = from;
	while (j < end) {
		const c = text.charCodeAt(j);
		if (c === 34 || c === 39) {
			j = skip_bash_quote(text, j, end, c);
		} else if (c === 40) {
			depth++;
			j++;
		} else if (c === 41) {
			if (depth === 0) return j;
			depth--;
			j++;
		} else {
			j++;
		}
	}
	return -1;
};

/**
 * Emits a `$`-variable at `i` (`${…}`, `$word`, or `$special`), returning the
 * new position. A `$` with no valid expansion after it is plain text (returns
 * `i + 1` with no token).
 *
 * @mutates `l`
 */
const scan_dollar_var = (l: Lexer, i: number, to: number): number => {
	const {text} = l;
	const c1 = text.charCodeAt(i + 1);
	if (c1 === 123) {
		// `${…}` — to the first `}`
		const close = text.indexOf('}', i + 2);
		const end = close === -1 || close >= to ? to : close + 1;
		l.leaf(T_VARIABLE, i, end);
		return end;
	}
	if (is_word_char(c1)) {
		let j = i + 1;
		while (j < to && is_word_char(text.charCodeAt(j))) j++;
		l.leaf(T_VARIABLE, i, j);
		return j;
	}
	if (SPECIAL_VAR.has(c1)) {
		l.leaf(T_VARIABLE, i, i + 2);
		return i + 2;
	}
	return i + 1; // bare `$`
};

/**
 * Lexes a `$(…)` command substitution at `i` as a container, returning the new
 * position. Interior lexes as ordinary bash; unterminated extends to `to`.
 *
 * @mutates `l`
 */
const lex_bash_cmdsub = (l: Lexer, i: number, to: number): number => {
	const {text} = l;
	l.open(T_COMMAND_SUBSTITUTION, i);
	l.leaf(T_PUNCTUATION, i, i + 2); // `$(`
	const close = scan_cmdsub_end(text, i + 2, to);
	if (close === -1) {
		lex_bash_window(l, i + 2, to);
		l.close(to);
		return to;
	}
	lex_bash_window(l, i + 2, close);
	l.leaf(T_PUNCTUATION, close, close + 1); // `)`
	l.close(close + 1);
	return close + 1;
};

/**
 * Lexes a `$((…))` arithmetic expansion at `i`, returning the new position.
 * Distinct from command substitution: `$((`/`))` are punctuation and the
 * interior lexes as ordinary bash. Unterminated extends to `to`.
 *
 * @mutates `l`
 */
const lex_bash_arith = (l: Lexer, i: number, to: number): number => {
	const {text} = l;
	let depth = 2; // the `((`
	let j = i + 3;
	while (j < to) {
		const c = text.charCodeAt(j);
		if (c === 34 || c === 39) {
			j = skip_bash_quote(text, j, to, c);
		} else if (c === 40) {
			depth++;
			j++;
		} else if (c === 41) {
			depth--;
			if (depth === 0) break;
			j++;
		} else {
			j++;
		}
	}
	l.leaf(T_PUNCTUATION, i, i + 3); // `$((`
	if (depth === 0) {
		lex_bash_window(l, i + 3, j - 1);
		l.leaf(T_PUNCTUATION, j - 1, j + 1); // `))`
		return j + 1;
	}
	lex_bash_window(l, i + 3, to); // unterminated
	return to;
};

/**
 * Lexes a `"…"` double-quoted string at `i` as a container, returning the new
 * position. `$`-expansions nest; unterminated extends to `to`.
 *
 * @mutates `l`
 */
const lex_bash_dquote = (l: Lexer, i: number, to: number): number => {
	const {text} = l;
	l.open(T_STRING, i);
	let j = i + 1;
	while (j < to) {
		const c = text.charCodeAt(j);
		if (c === 92) {
			j += 2;
		} else if (c === 34) {
			j++;
			break;
		} else if (c === 36) {
			const c1 = text.charCodeAt(j + 1);
			if (c1 === 40) {
				j = text.charCodeAt(j + 2) === 40 ? lex_bash_arith(l, j, to) : lex_bash_cmdsub(l, j, to);
			} else {
				j = scan_dollar_var(l, j, to);
			}
		} else {
			j++;
		}
	}
	if (j > to) j = to;
	l.close(j);
	return j;
};

interface HeredocClose {
	// start of the delimiter word on its line (after leading blanks)
	delim_start: number;
	// exclusive end of the delimiter word
	delim_end: number;
	// start of the closing delimiter's line (end of the body region)
	line_start: number;
}

/**
 * Finds the closing line of a heredoc with delimiter `delim`, scanning from
 * `from`. A closing line is (optional leading blanks) + `delim` + (only blanks)
 * before its newline. Returns the match, or `null` when unterminated.
 */
const find_heredoc_close = (
	text: string,
	from: number,
	end: number,
	delim: string,
): HeredocClose | null => {
	let j = from;
	while (j < end) {
		const line_start = j;
		const le = line_end_of(text, j, end);
		// the line's content excludes a trailing `\r` (CRLF)
		const content_end = le > line_start && text.charCodeAt(le - 1) === 13 ? le - 1 : le;
		const k = skip_blank(text, line_start, content_end);
		if (text.startsWith(delim, k) && k + delim.length <= content_end) {
			const rest = skip_blank(text, k + delim.length, content_end);
			if (rest === content_end) {
				return {delim_start: k, delim_end: k + delim.length, line_start};
			}
		}
		if (le >= end) break;
		j = le + 1;
	}
	return null;
};

/**
 * Emits `$`-expansions (`variable`/`command_substitution`) in an unquoted
 * heredoc body `[from, to)`; other text stays plain.
 *
 * @mutates `l`
 */
const expand_heredoc_body = (l: Lexer, from: number, to: number): void => {
	const {text} = l;
	let j = from;
	while (j < to) {
		if (text.charCodeAt(j) === 36) {
			const c1 = text.charCodeAt(j + 1);
			if (c1 === 40) {
				j = text.charCodeAt(j + 2) === 40 ? lex_bash_arith(l, j, to) : lex_bash_cmdsub(l, j, to);
			} else {
				j = scan_dollar_var(l, j, to);
			}
		} else {
			j++;
		}
	}
};

interface PendingHeredoc {
	delim: string;
	quoted: boolean;
}

/**
 * Emits one heredoc body as a container (the opening delimiter was already
 * emitted inline for the queued case), returning the position after it.
 *
 * @mutates `l`
 */
const emit_heredoc_body = (
	l: Lexer,
	body_start: number,
	to: number,
	hd: PendingHeredoc,
): number => {
	const {text} = l;
	const close = find_heredoc_close(text, body_start, to, hd.delim);
	l.open(T_HEREDOC, body_start);
	const body_end = close ? close.line_start : to;
	if (!hd.quoted) expand_heredoc_body(l, body_start, body_end);
	if (close) {
		l.leaf(T_HEREDOC_DELIMITER, close.delim_start, close.delim_end);
		l.close(close.delim_end);
		const nl = line_end_of(text, close.delim_end, to);
		return nl >= to ? to : nl + 1;
	}
	l.close(to);
	return to;
};

/**
 * Drains queued heredocs whose bodies begin at `start` (just past a newline),
 * consuming each body in order. Returns the position after the last one.
 *
 * @mutates `l`
 */
const drain_heredocs = (
	l: Lexer,
	start: number,
	to: number,
	pending: Array<PendingHeredoc>,
): number => {
	let j = start;
	for (const hd of pending) {
		if (j >= to) break;
		j = emit_heredoc_body(l, j, to, hd);
	}
	pending.length = 0;
	return j;
};

/**
 * Scans a multi-char operator starting at `i` for the leading char `c`
 * (one of `| & > !`); heredoc, `<<<`, `;;`, and `=` cases are handled by the
 * caller. Returns its length.
 */
const bash_operator_len = (text: string, i: number, to: number, c: number): number => {
	const c1 = i + 1 < to ? text.charCodeAt(i + 1) : 0;
	switch (c) {
		case 124: // |
			return c1 === 124 ? 2 : 1; // || |
		case 38: // &
			if (c1 === 38) return 2; // &&
			if (c1 === 62) return text.charCodeAt(i + 2) === 62 ? 3 : 2; // &>> &>
			return 1; // &
		case 62: // >
			return c1 === 62 ? 2 : 1; // >> >
		default: // 33 `!`
			return c1 === 61 ? 2 : 1; // != !
	}
};

/**
 * The core window lexer. Maintains a per-window queue of pending heredocs
 * (redirected on the current line, bodies consumed at the next newline).
 */
const lex_bash_window = (l: Lexer, from: number, to: number): void => {
	const {text} = l;
	const pending: Array<PendingHeredoc> = [];
	let i = from;
	let prev_function_kw = false;

	while (i < to) {
		const c = text.charCodeAt(i);

		if (c === 10) {
			i = pending.length > 0 ? drain_heredocs(l, i + 1, to, pending) : i + 1;
			continue;
		}
		if (is_space(c)) {
			i++;
			continue;
		}

		const fn = prev_function_kw;
		prev_function_kw = false;

		// shebang / comments
		if (c === 35) {
			if (i === 0 && text.charCodeAt(1) === 33) {
				const le = scan_to_line_end(text, i, to);
				l.leaf(T_SHEBANG, i, le);
				i = le;
				continue;
			}
			if (i === 0 || is_space(text.charCodeAt(i - 1))) {
				const le = scan_to_line_end(text, i, to);
				l.leaf(T_COMMENT, i, le);
				i = le;
				continue;
			}
			i++;
			continue;
		}

		// `$` expansions
		if (c === 36) {
			const c1 = text.charCodeAt(i + 1);
			if (c1 === 40) {
				i = text.charCodeAt(i + 2) === 40 ? lex_bash_arith(l, i, to) : lex_bash_cmdsub(l, i, to);
				continue;
			}
			if (c1 === 39) {
				const e = scan_ansi_c(text, i, to);
				l.leaf(T_STRING, i, e);
				i = e;
				continue;
			}
			i = scan_dollar_var(l, i, to);
			continue;
		}

		// strings
		if (c === 34) {
			i = lex_bash_dquote(l, i, to);
			continue;
		}
		if (c === 39) {
			const close = text.indexOf("'", i + 1);
			const e = close === -1 || close >= to ? to : close + 1;
			l.leaf(T_STRING, i, e);
			i = e;
			continue;
		}

		// numbers and file descriptors
		if (is_digit(c)) {
			const next = text.charCodeAt(i + 1);
			if (next === 62 || next === 60) {
				// `\b\d(?=>>?|<)` — a single-digit file descriptor
				l.leaf(T_FILE_DESCRIPTOR, i, i + 1);
				i++;
				continue;
			}
			const num_end = scan_bash_number(text, i, to);
			if (!is_word_char(text.charCodeAt(num_end))) {
				l.leaf(T_NUMBER, i, num_end);
				i = num_end;
				continue;
			}
			// digit-led but part of a larger word — fall through to word handling
		}

		// words: function defs, keywords, builtins, booleans, else plain
		if (is_word_char(c)) {
			let wend = i + 1;
			while (wend < to && is_word_char(text.charCodeAt(wend))) wend++;
			if (fn) {
				l.leaf(T_FUNCTION, i, wend);
				i = wend;
				continue;
			}
			const a = skip_space(text, wend, to);
			if (text.charCodeAt(a) === 40 && text.charCodeAt(skip_space(text, a + 1, to)) === 41) {
				l.leaf(T_FUNCTION, i, wend); // `name()` definition
				i = wend;
				continue;
			}
			const word = text.slice(i, wend);
			const kind = WORDS.get(word);
			if (kind === K_KEYWORD) {
				l.leaf(T_KEYWORD, i, wend);
				if (word === 'function') prev_function_kw = true;
			} else if (kind === K_BUILTIN) {
				l.leaf(T_BUILTIN, i, wend);
			} else if (kind === K_BOOLEAN) {
				l.leaf(T_BOOLEAN, i, wend);
			}
			i = wend;
			continue;
		}

		// `<` — here-string, heredoc, or `<`/`<<` operator
		if (c === 60) {
			if (text.charCodeAt(i + 1) === 60) {
				if (text.charCodeAt(i + 2) === 60) {
					l.leaf(T_OPERATOR, i, i + 3); // `<<<`
					i += 3;
					continue;
				}
				const consumed = lex_bash_heredoc_start(l, i, to, pending);
				if (consumed !== -1) {
					i = consumed;
					continue;
				}
				l.leaf(T_OPERATOR, i, i + 2); // `<<` with no delimiter
				i += 2;
				continue;
			}
			l.leaf(T_OPERATOR, i, i + 1); // `<`
			i++;
			continue;
		}

		// `&d` file descriptor before the `&` operator forms
		if (
			c === 38 &&
			is_digit(text.charCodeAt(i + 1)) &&
			!is_word_char(text.charCodeAt(i + 2)) &&
			(i === 0 || !is_word_char(text.charCodeAt(i - 1)))
		) {
			l.leaf(T_FILE_DESCRIPTOR, i, i + 2);
			i += 2;
			continue;
		}

		// `;;` operator vs `;` punctuation
		if (c === 59) {
			if (text.charCodeAt(i + 1) === 59) {
				l.leaf(T_OPERATOR, i, i + 2);
				i += 2;
			} else {
				l.leaf(T_PUNCTUATION, i, i + 1);
				i++;
			}
			continue;
		}

		// `=` — plain, except `==` / `=~`
		if (c === 61) {
			const c1 = text.charCodeAt(i + 1);
			if (c1 === 126 || c1 === 61) {
				l.leaf(T_OPERATOR, i, i + 2);
				i += 2;
			} else {
				i++;
			}
			continue;
		}

		// operators
		if (c === 124 || c === 38 || c === 62 || c === 33) {
			const len = bash_operator_len(text, i, to, c);
			l.leaf(T_OPERATOR, i, i + len);
			i += len;
			continue;
		}

		// punctuation
		if (c === 123 || c === 125 || c === 91 || c === 93 || c === 40 || c === 41 || c === 44) {
			l.leaf(T_PUNCTUATION, i, i + 1);
			i++;
			continue;
		}

		i++; // anything else is plain text
	}

	// unterminated trailing heredocs (opener consumed, body ran to window end)
	if (pending.length > 0) drain_heredocs(l, i, to, pending);
	l.pos = to;
};

/**
 * Handles a `<<`/`<<-` heredoc redirect at `i`. Emits the opening delimiter and
 * either consumes the whole heredoc inline (when it is the sole redirect at the
 * end of the line) or queues it for draining at the next newline. Returns the
 * new position, or -1 when no delimiter follows (the caller emits `<<` as an
 * operator).
 *
 * @mutates `l`
 */
const lex_bash_heredoc_start = (
	l: Lexer,
	i: number,
	to: number,
	pending: Array<PendingHeredoc>,
): number => {
	const {text} = l;
	let k = i + 2;
	if (text.charCodeAt(k) === 45) k++; // `<<-`
	k = skip_blank(text, k, to);
	let quote = 0;
	if (text.charCodeAt(k) === 39 || text.charCodeAt(k) === 34) {
		quote = text.charCodeAt(k);
		k++;
	}
	const dstart = k;
	while (k < to && is_word_char(text.charCodeAt(k))) k++;
	if (k === dstart) return -1; // no delimiter word
	const delim = text.slice(dstart, k);
	let delim_token_end = k;
	if (quote !== 0 && text.charCodeAt(k) === quote) delim_token_end = k + 1;

	const after = skip_blank(text, delim_token_end, to);
	const contiguous = after >= to || text.charCodeAt(after) === 10;
	const quoted = quote !== 0;

	// non-contiguous, or another heredoc already queued: defer the body so the
	// queued order (first redirect → first body) is preserved
	if (!contiguous || pending.length > 0) {
		l.leaf(T_HEREDOC_DELIMITER, i, delim_token_end);
		pending.push({delim, quoted});
		return delim_token_end;
	}

	// contiguous single heredoc — one container from opener to closing delimiter
	if (after >= to) {
		l.leaf(T_HEREDOC_DELIMITER, i, delim_token_end);
		return delim_token_end;
	}
	const body_start = after + 1; // past the newline
	const close = find_heredoc_close(text, body_start, to, delim);
	l.open(T_HEREDOC, i);
	l.leaf(T_HEREDOC_DELIMITER, i, delim_token_end);
	const body_end = close ? close.line_start : to;
	if (!quoted) expand_heredoc_body(l, body_start, body_end);
	if (close) {
		l.leaf(T_HEREDOC_DELIMITER, close.delim_start, close.delim_end);
		l.close(close.delim_end);
		return close.delim_end;
	}
	l.close(to);
	return to;
};

const lex_bash = (l: Lexer): void => {
	lex_bash_window(l, l.pos, l.end);
};

/**
 * The Bash language registration for the lexer engine.
 */
export const lexer_bash: SyntaxLang = {id: 'bash', aliases: ['sh', 'shell'], lex: lex_bash};
