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
 * Emits: `shebang`, `comment`, `string` (double-quoted strings are containers
 * whose `$`-expansions nest as `variable`/`command_substitution`), `keyword`,
 * `builtin`, `boolean`, `number`, `variable`, `command_substitution` (a
 * container), `function`, `file_descriptor`, `operator`, `punctuation`, plus
 * heredocs (`heredoc` container + `heredoc_delimiter`).
 *
 * Notable behavior:
 * - command substitution is recognized in both `$(…)` and legacy backtick
 *   form; both are `command_substitution` containers with an ordinary-bash
 *   interior.
 * - arithmetic expansion `$((…))` is recognized as distinct from command
 *   substitution `$(…)`; its `$((`/`))` are punctuation and the interior lexes
 *   as ordinary bash (numbers, `$vars`, and general operators fall out
 *   naturally — no dedicated arithmetic token types).
 * - heredocs match any delimiter, honor `<<-`, and support quoted (no
 *   expansion) vs unquoted (expanded) bodies; multiple heredocs redirected on
 *   one line are queued and their bodies consumed in order.
 *
 * Word classification (keyword/builtin/boolean) is a context-free `Map`
 * lookup.
 *
 * Nesting (`$(…)`/`$((…))`/backtick interiors, double-quoted string bodies,
 * unquoted heredoc bodies) runs on an explicit pooled frame stack, so
 * arbitrarily deep input tokenizes fully without touching the JS call stack.
 *
 * Scope: the bash family — `sh`/`shell` alias this lexer. POSIX sh is a
 * syntactic subset of bash for highlighting purposes (everything sh scripts
 * use — `$(…)`, `$((…))`, backticks, heredocs, `${…}` — is shared syntax),
 * and bash-only forms simply don't occur in sh input. Shells with their own
 * syntax (fish, PowerShell) are out of scope.
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

// Explicit-stack driver for nested constructs (`$(…)`/`$((…))`/backtick
// substitution interiors, double-quoted string bodies, and unquoted heredoc
// bodies). Every frame is a window scan — a substitution pushes a frame rather
// than recursing on the JS call stack, so arbitrarily deep input tokenizes
// fully without overflowing; the deep-nesting tests exercise this to thousands
// of levels. String and heredoc bodies are cheaper than a frame: they scan
// inline, and when one is interrupted by a substitution the window frame
// records a *submode* so the resume finishes the body before returning to the
// main scan. Frames are pooled across a single `lex_bash` run (`stack` only
// grows, never shrinks) to keep deep nesting allocation-free after warmup.

// a window frame's suspended mid-construct scan
const S_NONE = 0;
const S_DQUOTE = 1; // mid-`"…"` body, suspended at a substitution
const S_HEREDOC = 2; // mid-heredoc body, suspended at a substitution

// how a completed frame finalizes into the frame beneath it
const R_ROOT = 0; // top-level window — nothing beneath it
const R_CMDSUB = 1; // `$(…)` interior → emit `)`, close the container, advance
const R_ARITH = 2; // `$((…))` interior → emit `))`, advance
const R_BACKTICK = 3; // backtick interior → emit the closing backtick, close, advance

/**
 * One suspended window scan on the explicit stack, carrying the per-window
 * scan state (cursor, `function` keyword tracking, the pending-heredoc queue)
 * plus the submode of an interrupted string/heredoc body. `ret`/`ret_a`
 * describe how the frame finalizes into the one beneath it when it completes.
 */
interface BashFrame {
	/** Scan cursor. */
	i: number;
	/** Exclusive window end. */
	to: number;
	/** Mid-construct submode — an interrupted body scan resumed before the main scan. */
	sub: number;
	/** `S_HEREDOC`: exclusive body end. */
	sub_to: number;
	/** `S_HEREDOC`: closing delimiter start, or -1 when unterminated. */
	hd_delim_start: number;
	/** `S_HEREDOC`: closing delimiter end. */
	hd_delim_end: number;
	/** `S_HEREDOC`: where the main scan resumes after the body. */
	hd_resume: number;
	/** A `function` keyword awaits its name. */
	prev_function_kw: boolean;
	/** Heredocs redirected on the current line, bodies pending. Pooled with the frame. */
	pending: Array<PendingHeredoc>;
	/** Drain progress into `pending`. */
	pending_idx: number;
	/** Whether a drain of `pending` is in progress at a line boundary. */
	draining: boolean;
	ret: number;
	/** The enclosing construct's close-scan result (-1 when unterminated). */
	ret_a: number;
}

interface BashMachine {
	l: Lexer;
	/** Frame pool doubling as the stack; frames above `sp` are dormant. */
	stack: Array<BashFrame>;
	sp: number;
}

const create_bash_frame = (): BashFrame => ({
	i: 0,
	to: 0,
	sub: S_NONE,
	sub_to: 0,
	hd_delim_start: -1,
	hd_delim_end: 0,
	hd_resume: 0,
	prev_function_kw: false,
	pending: [],
	pending_idx: 0,
	draining: false,
	ret: R_ROOT,
	ret_a: 0,
});

/**
 * Pushes a window frame scanning `[from, to)`, reusing the pooled slot at the
 * stack top. `ret`/`ret_a` are applied when it completes.
 *
 * @mutates `mac`
 */
const mac_push_window = (
	mac: BashMachine,
	from: number,
	to: number,
	ret: number,
	ret_a: number,
): void => {
	const {stack, sp} = mac;
	let f = stack[sp];
	if (f === undefined) {
		f = create_bash_frame();
		stack[sp] = f;
	}
	f.i = from;
	f.to = to;
	f.sub = S_NONE;
	f.prev_function_kw = false;
	if (f.pending.length > 0) f.pending.length = 0;
	f.pending_idx = 0;
	f.draining = false;
	f.ret = ret;
	f.ret_a = ret_a;
	mac.sp = sp + 1;
};

/**
 * Starts a `$(…)` command substitution or `$((…))` arithmetic expansion at
 * `i`: emits the opening events and pushes the interior window frame. The
 * caller must suspend (write back its state and return `false`); the driver's
 * finalize emits the trailing punctuation and advances the caller past it.
 * The `i + 2 < to` guard keeps the arithmetic lookahead inside the window.
 *
 * @mutates `mac`
 */
const mac_push_dollar_paren = (mac: BashMachine, i: number, to: number): void => {
	const l = mac.l;
	const {text} = l;
	if (i + 2 < to && text.charCodeAt(i + 2) === 40) {
		// arithmetic expansion — find the `)` closing the outer `(`; `$((`/`))`
		// are punctuation and the interior lexes as ordinary bash
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
		const closed = depth === 0;
		mac_push_window(mac, i + 3, closed ? j - 1 : to, R_ARITH, closed ? j : -1);
		return;
	}
	// command substitution — a container with an ordinary-bash interior
	l.open(T_COMMAND_SUBSTITUTION, i);
	l.leaf(T_PUNCTUATION, i, i + 2); // `$(`
	const close = scan_cmdsub_end(text, i + 2, to);
	mac_push_window(mac, i + 2, close === -1 ? to : close, R_CMDSUB, close);
};

/**
 * Starts a legacy backtick command substitution at `i`: emits the container
 * open and opening backtick, and pushes the interior window frame. A backslash
 * escapes the next char (e.g. an inner backtick); unterminated extends to `to`.
 *
 * @mutates `mac`
 */
const mac_push_backtick = (mac: BashMachine, i: number, to: number): void => {
	const l = mac.l;
	const {text} = l;
	let j = i + 1;
	while (j < to) {
		const c = text.charCodeAt(j);
		if (c === 92) {
			j += 2;
		} else if (c === 96) {
			break;
		} else {
			j++;
		}
	}
	const closed = j < to && text.charCodeAt(j) === 96;
	l.open(T_COMMAND_SUBSTITUTION, i);
	l.leaf(T_PUNCTUATION, i, i + 1); // opening backtick
	mac_push_window(mac, i + 1, closed ? j : to, R_BACKTICK, closed ? j : -1);
};

/**
 * Scans a `"…"` body from `j` (past the opening quote), emitting `$`-variable
 * leaves as it goes. Returns the exclusive end (past the closing quote, or the
 * window end when unterminated), or the bitwise complement of the position of
 * a `$(`/backtick nesting construct — the fast path lets bodies without
 * substitutions complete without a frame.
 *
 * @mutates `l`
 */
const scan_dquote_body = (l: Lexer, j: number, to: number): number => {
	const {text} = l;
	let i = j;
	while (i < to) {
		const c = text.charCodeAt(i);
		if (c === 92) {
			i += 2;
		} else if (c === 34) {
			return i + 1;
		} else if (c === 36) {
			if (text.charCodeAt(i + 1) === 40) return ~i;
			i = scan_dollar_var(l, i, to);
		} else if (c === 96) {
			return ~i;
		} else {
			i++;
		}
	}
	return i > to ? to : i;
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

interface PendingHeredoc {
	delim: string;
	quoted: boolean;
}

/**
 * Scans an unquoted heredoc body `[j, to)`, emitting `$`-variable leaves;
 * other text stays plain. Returns `to` when complete, or the bitwise
 * complement of the position of a `$(` substitution — the fast path lets
 * bodies without substitutions complete without a frame. Hops between `$`s
 * with native `indexOf`.
 *
 * @mutates `l`
 */
const scan_heredoc_body = (l: Lexer, j: number, to: number): number => {
	const {text} = l;
	let i = j;
	while (i < to) {
		const d = text.indexOf('$', i);
		if (d === -1 || d >= to) return to;
		if (text.charCodeAt(d + 1) === 40) return ~d;
		i = scan_dollar_var(l, d, to);
	}
	return to;
};

/**
 * Drains queued heredoc bodies from `frame.i` (just past a newline), consuming
 * each in order. A body interrupted by a substitution suspends the window
 * mid-body (`S_HEREDOC`) — this returns `false`, and the submode resume
 * finishes the body and re-enters here for the rest of the queue. Returns
 * `true` once the queue is empty.
 *
 * @mutates `mac`
 */
const drain_pending = (mac: BashMachine, frame: BashFrame): boolean => {
	const l = mac.l;
	const {text} = l;
	const to = frame.to;
	const {pending} = frame;
	while (frame.pending_idx < pending.length) {
		if (frame.i >= to) break;
		const hd = pending[frame.pending_idx]!;
		frame.pending_idx++;
		const body_start = frame.i;
		const close = find_heredoc_close(text, body_start, to, hd.delim);
		l.open(T_HEREDOC, body_start);
		const body_end = close ? close.line_start : to;
		// the parent resumes past the closing delimiter's line, at the next body
		let resume = to;
		if (close) {
			const nl = line_end_of(text, close.delim_end, to);
			resume = nl >= to ? to : nl + 1;
		}
		if (!hd.quoted) {
			const r = scan_heredoc_body(l, body_start, body_end);
			if (r < 0) {
				// the body contains a substitution — suspend mid-body; the
				// submode resume finishes it (and this drain) afterward
				frame.sub = S_HEREDOC;
				frame.sub_to = body_end;
				frame.hd_delim_start = close ? close.delim_start : -1;
				frame.hd_delim_end = close ? close.delim_end : 0;
				frame.hd_resume = resume;
				mac_push_dollar_paren(mac, ~r, body_end);
				return false;
			}
		}
		if (close) {
			l.leaf(T_HEREDOC_DELIMITER, close.delim_start, close.delim_end);
			l.close(close.delim_end);
		} else {
			l.close(to);
		}
		frame.i = resume;
	}
	pending.length = 0;
	frame.pending_idx = 0;
	frame.draining = false;
	return true;
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
 * Resumes a window frame's interrupted string/heredoc body scan (`frame.sub`).
 * Returns `false` when the body hit another substitution and the frame
 * suspended again; on completion clears the submode and returns `true`, with
 * `frame.i` at the main scan's resume position.
 *
 * @mutates `mac`
 */
const run_bash_sub = (mac: BashMachine, frame: BashFrame): boolean => {
	const l = mac.l;
	if (frame.sub === S_HEREDOC) {
		const r = scan_heredoc_body(l, frame.i, frame.sub_to);
		if (r < 0) {
			frame.i = ~r;
			mac_push_dollar_paren(mac, ~r, frame.sub_to);
			return false;
		}
		if (frame.hd_delim_start === -1) {
			l.close(frame.sub_to);
		} else {
			l.leaf(T_HEREDOC_DELIMITER, frame.hd_delim_start, frame.hd_delim_end);
			l.close(frame.hd_delim_end);
		}
		frame.i = frame.hd_resume;
	} else {
		// S_DQUOTE
		const r = scan_dquote_body(l, frame.i, frame.to);
		if (r < 0) {
			const j = ~r;
			frame.i = j;
			if (l.text.charCodeAt(j) === 96) mac_push_backtick(mac, j, frame.to);
			else mac_push_dollar_paren(mac, j, frame.to);
			return false;
		}
		l.close(r);
		frame.i = r;
	}
	frame.sub = S_NONE;
	return true;
};

/**
 * Runs (or resumes) a window frame — the core per-token scan. Maintains the
 * per-window queue of pending heredocs (redirected on the current line, bodies
 * consumed at the next newline). String and heredoc bodies scan inline; one
 * interrupted by a substitution records its submode, suspends, and is finished
 * by the `run_bash_sub` resume. Returns `true` when the window is fully
 * consumed, or `false` after pushing a substitution-interior frame, which the
 * driver runs before resuming this frame.
 *
 * @mutates `mac`
 */
const run_bash_window = (mac: BashMachine, frame: BashFrame): boolean => {
	const l = mac.l;
	const {text} = l;
	const to = frame.to;

	// resume an interrupted string/heredoc body scan before the main scan
	if (frame.sub !== S_NONE && !run_bash_sub(mac, frame)) return false;

	// resume mid-drain: finish the pending heredoc bodies before scanning
	if (frame.draining && !drain_pending(mac, frame)) return false;

	let i = frame.i;
	let prev_function_kw = frame.prev_function_kw;

	while (i < to) {
		const c = text.charCodeAt(i);

		if (c === 10) {
			i++;
			if (frame.pending.length > 0) {
				frame.i = i;
				frame.prev_function_kw = prev_function_kw;
				frame.draining = true;
				if (!drain_pending(mac, frame)) return false;
				i = frame.i;
			}
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
				frame.i = i;
				frame.prev_function_kw = prev_function_kw;
				mac_push_dollar_paren(mac, i, to);
				return false;
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
			l.open(T_STRING, i);
			const r = scan_dquote_body(l, i + 1, to);
			if (r >= 0) {
				// no substitutions — the whole string completed inline
				l.close(r);
				i = r;
				continue;
			}
			// suspend mid-string: the submode resume finishes the body
			const j = ~r;
			frame.i = j;
			frame.sub = S_DQUOTE;
			frame.prev_function_kw = prev_function_kw;
			if (text.charCodeAt(j) === 96) mac_push_backtick(mac, j, to);
			else mac_push_dollar_paren(mac, j, to);
			return false;
		}
		if (c === 39) {
			const close = text.indexOf("'", i + 1);
			const e = close === -1 || close >= to ? to : close + 1;
			l.leaf(T_STRING, i, e);
			i = e;
			continue;
		}

		// legacy backtick command substitution
		if (c === 96) {
			frame.i = i;
			frame.prev_function_kw = prev_function_kw;
			mac_push_backtick(mac, i, to);
			return false;
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
				const consumed = lex_bash_heredoc_start(mac, frame, i, to);
				if (consumed === -2) {
					// suspended mid-body at a substitution — the submode resume
					// finishes the heredoc
					frame.prev_function_kw = prev_function_kw;
					return false;
				}
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

	frame.i = i;
	frame.prev_function_kw = prev_function_kw;
	return true;
};

/**
 * Handles a `<<`/`<<-` heredoc redirect at `i`. Emits the opening delimiter and
 * either consumes the heredoc inline (when it is the sole redirect at the end
 * of the line) or queues it on `frame.pending` for draining at the next
 * newline. Returns the new position, -1 when no delimiter follows (the caller
 * emits `<<` as an operator), or -2 when the inline body hit a substitution
 * and the window suspended mid-body (the caller returns `false`).
 *
 * @mutates `mac`
 */
const lex_bash_heredoc_start = (
	mac: BashMachine,
	frame: BashFrame,
	i: number,
	to: number,
): number => {
	const l = mac.l;
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
	if (!contiguous || frame.pending.length > 0) {
		l.leaf(T_HEREDOC_DELIMITER, i, delim_token_end);
		frame.pending.push({delim, quoted});
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
	// the window resumes at the closing delimiter's end; the rest of its line
	// (the newline) scans normally
	const resume = close ? close.delim_end : to;
	if (!quoted) {
		const r = scan_heredoc_body(l, body_start, body_end);
		if (r < 0) {
			// the body contains a substitution — suspend mid-body; the submode
			// resume finishes it
			frame.sub = S_HEREDOC;
			frame.sub_to = body_end;
			frame.hd_delim_start = close ? close.delim_start : -1;
			frame.hd_delim_end = close ? close.delim_end : 0;
			frame.hd_resume = resume;
			mac_push_dollar_paren(mac, ~r, body_end);
			return -2;
		}
	}
	if (close) {
		l.leaf(T_HEREDOC_DELIMITER, close.delim_start, close.delim_end);
		l.close(close.delim_end);
	} else {
		l.close(to);
	}
	return resume;
};

/**
 * Drives the explicit frame stack to completion: runs the top frame, and when
 * it finishes, pops it and finalizes it into the frame beneath — emitting the
 * construct's trailing events and advancing that frame past the consumed
 * region. A frame that pushes a child returns `false`, so the child runs next
 * and this frame resumes only once the child (and its own descendants) have
 * completed.
 *
 * @mutates `mac`
 */
const run_bash = (mac: BashMachine): void => {
	const l = mac.l;
	while (mac.sp > 0) {
		const frame = mac.stack[mac.sp - 1]!;
		if (!run_bash_window(mac, frame)) continue; // a child was pushed — run it first
		mac.sp -= 1;
		const ret = frame.ret;
		if (ret === R_ROOT) continue;
		const parent = mac.stack[mac.sp - 1]!;
		const close = frame.ret_a;
		if (ret === R_ARITH) {
			if (close === -1) {
				parent.i = frame.to; // unterminated
			} else {
				l.leaf(T_PUNCTUATION, close - 1, close + 1); // `))`
				parent.i = close + 1;
			}
		} else if (close === -1) {
			// unterminated `$(…)`/backtick — the container extends to the window end
			l.close(frame.to);
			parent.i = frame.to;
		} else {
			l.leaf(T_PUNCTUATION, close, close + 1); // `)` or the closing backtick
			l.close(close + 1);
			parent.i = close + 1;
		}
	}
};

const lex_bash = (l: Lexer): void => {
	const mac: BashMachine = {l, stack: [], sp: 0};
	mac_push_window(mac, l.pos, l.end, R_ROOT, 0);
	run_bash(mac);
	l.pos = l.end;
};

/**
 * The Bash language registration for the lexer engine.
 *
 * `sh` and `shell` alias this lexer: POSIX sh is a syntactic subset of bash
 * for highlighting purposes, and the bash-only constructs this lexer
 * additionally recognizes don't occur in sh input, so running it on sh
 * scripts is exact. There is no separate sh lexer.
 */
export const lexer_bash: SyntaxLang = {id: 'bash', aliases: ['sh', 'shell'], lex: lex_bash};
