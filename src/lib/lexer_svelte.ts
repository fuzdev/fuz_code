import {
	EMBED_UNAVAILABLE,
	is_ident,
	scan_balanced_braces,
	skip_quoted,
	skip_space,
	token_type,
	trim_space_end,
	type Lexer,
	type SyntaxLang
} from './lexer.ts';
import { lex_markup_window, type MarkupLexMode } from './lexer_markup.ts';

/**
 * Svelte lexer — the shared markup scanner (`lexer_markup.ts`)
 * in svelte mode plus the `{…}` expression lexer.
 *
 * Emits markup's tag/attr/comment/entity structure (no `special_attr` —
 * svelte handles `style=`/`on*=` as ordinary attributes; js-style line and
 * block comments between attributes emit `comment` leaves), `script`+`lang_ts`
 * and `style`+`lang_css` regions (svelte scripts are always TypeScript), and
 * `svelte_expression` containers whose forms nest a same-span `block`
 * (`{#if}`/`{:else if}`/`{/each}`/…), `each` (`{#each list as item}`),
 * `at_directive` (`{@render}`/`{@const}`/…), or `declaration_tag`
 * (`{const …}`/`{let …}`) container with `special_keyword`/`at_keyword`/
 * `keyword` leaves and `lang_ts` interiors.
 *
 * Notable behavior: an expression's closing brace is the one the ts lexer
 * reaches as it tokenizes the interior, so braces nest to any depth and those
 * in strings, templates, comments, and regexes don't count (`{'}'}` works).
 * Three forms find the brace before lexing instead, by a scan that knows
 * strings, templates, and comments but not regexes: `{#each}` and `{#await}`,
 * which split at `as`/`then`, and an interior that starts with `/`; expression-valued attributes
 * emit full structure (`attr_name` + `attr_value` with `attr_equals`, not the
 * `=` swallowed into the name); quoted values interleave text and expressions
 * (`class="a {b} c"`); the `{#each}` expression before `as` is lexed as ts; the
 * closing `}` is always expression punctuation; `as`/`then` are keywords only
 * in the each/await forms that define them, not anywhere they appear; directive
 * modifiers (`transition:fade|global`) get punctuation pipes.
 *
 * Resilience: an unterminated expression extends to the end of the window.
 *
 * @module
 */

const T_SVELTE_EXPRESSION = token_type('svelte_expression');
const T_AT_DIRECTIVE = token_type('at_directive');
const T_DECLARATION_TAG = token_type('declaration_tag');
const T_BLOCK = token_type('block');
const T_EACH = token_type('each');
const T_AT_KEYWORD = token_type('at_keyword');
const T_SPECIAL_KEYWORD = token_type('special_keyword');
const T_KEYWORD = token_type('keyword');
const T_LANG_TS = token_type('lang_ts');
const T_PUNCTUATION = token_type('punctuation');

// block keywords after `#`/`:`/`/` sigils (`@` sigils are at-directives)
const BLOCK_WORDS: Set<string> = new Set([
	'if',
	'else',
	'await',
	'then',
	'catch',
	'each',
	'html',
	'debug',
	'snippet'
]);

/**
 * Emits a trimmed `lang_ts` container over `[from, to)` and embeds the ts
 * lexer in it. Empty/whitespace-only spans emit nothing.
 */
const lex_ts_interior = (l: Lexer, from: number, to: number): void => {
	const { text } = l;
	const start = skip_space(text, from, to);
	const content_end = trim_space_end(text, start, to);
	if (content_end <= start) return;
	l.open(T_LANG_TS, start);
	l.embed('ts', start, content_end);
	l.close(content_end);
};

/**
 * Finds `word` at bracket-depth 0 in `[from, to)` with identifier boundaries
 * on both sides, skipping strings/templates. Returns its index or -1 — the
 * `as`/`then` splitter for each/await forms.
 */
const find_top_level_word = (text: string, from: number, to: number, word: string): number => {
	let depth = 0;
	let i = from;
	while (i < to) {
		const c = text.charCodeAt(i);
		if (c === 34 || c === 39 || c === 96) {
			i = skip_quoted(text, i, to, c);
		} else if (c === 40 || c === 91 || c === 123) {
			depth++;
			i++;
		} else if (c === 41 || c === 93 || c === 125) {
			if (depth > 0) depth--;
			i++;
		} else if (
			depth === 0 &&
			text.startsWith(word, i) &&
			!is_ident(text.charCodeAt(i - 1)) &&
			!is_ident(text.charCodeAt(i + word.length))
		) {
			return i;
		} else {
			i++;
		}
	}
	return -1;
};

/**
 * Length of a `const`/`let` declaration-tag keyword at `i` (with an identifier
 * boundary after it), or 0 — the `{const …}`/`{let …}` recognizer. These are
 * sigil-less declaration tags, the modern replacement for `{@const …}`.
 */
const declaration_keyword_len = (text: string, i: number, end: number): number => {
	if (i + 5 <= end && text.startsWith('const', i) && !is_ident(text.charCodeAt(i + 5))) return 5;
	if (i + 3 <= end && text.startsWith('let', i) && !is_ident(text.charCodeAt(i + 3))) return 3;
	return 0;
};

/**
 * Lexes the ts interior that starts at `from` and runs to the `}` closing the
 * expression whose `{` is at `open`: a trimmed `lang_ts` container with the ts
 * lexer embedded, which finds the brace as it tokenizes. Returns the brace's
 * index, or -1 when the expression is unterminated. An empty or
 * whitespace-only interior emits nothing.
 */
const lex_ts_to_brace = (l: Lexer, open: number, from: number, end: number): number => {
	const { text } = l;
	const start = skip_space(text, from, end);
	if (start >= end) return -1;
	const c = text.charCodeAt(start);
	if (c === 125) return start;
	if (c === 47) {
		// a leading `/` is a comment or a malformed closing tag like `{/i}` mid-edit,
		// which ts would read as a regex running past the brace — bound it first
		const close = scan_balanced_braces(text, open, end);
		lex_ts_interior(l, start, close === -1 ? end : close);
		return close;
	}
	l.open(T_LANG_TS, start);
	let close = l.embed_to_brace('ts', start, end);
	if (close === EMBED_UNAVAILABLE) close = scan_balanced_braces(text, open, end);
	// trimmed, but never to before the last token: a comment or an unterminated
	// string can itself end in whitespace
	const content_end = trim_space_end(text, start, close === -1 ? end : close);
	const last_end = l.events[l.events_len - 1]!;
	l.close(last_end > content_end ? last_end : content_end);
	return close;
};

/**
 * Lexes a `{…}` expression at `from`, returning the position after it.
 * `full` enables the block/each and declaration-tag forms (top level); tag and
 * attribute contexts pass false (at-directives like `{@attach …}` work in both).
 */
const lex_svelte_expression = (l: Lexer, from: number, end: number, full: boolean): number => {
	const { text } = l;
	l.open(T_SVELTE_EXPRESSION, from);
	const sigil = from + 1 < end ? text.charCodeAt(from + 1) : 0;
	// the closing brace, -1 when unterminated; each form finds it
	let close: number;
	// whether the form has a container of its own to close
	let nested = true;
	if (sigil === 64 && is_ident(text.charCodeAt(from + 2))) {
		// {@word …}
		let word_end = from + 2;
		while (word_end < end && is_ident(text.charCodeAt(word_end))) word_end++;
		l.open(T_AT_DIRECTIVE, from);
		l.leaf(T_PUNCTUATION, from, from + 1);
		l.leaf(T_AT_KEYWORD, from + 1, word_end);
		close = lex_ts_to_brace(l, from, word_end, end);
	} else if (full && (sigil === 35 || sigil === 58 || sigil === 47)) {
		// {#word …} / {:word …} / {/word}
		let word_end = from + 2;
		while (word_end < end && is_ident(text.charCodeAt(word_end))) word_end++;
		const word = text.slice(from + 2, word_end);
		let keyword_end = word_end;
		if (
			word === 'else' &&
			text.startsWith(' if', word_end) &&
			!is_ident(text.charCodeAt(word_end + 3))
		) {
			keyword_end = word_end + 3; // `:else if` is one special_keyword
		}
		if (!BLOCK_WORDS.has(word)) {
			// unknown sigil word — plain expression, bounded before ts sees it
			// since its interior starts with the sigil
			nested = false;
			close = scan_balanced_braces(text, from, end);
			l.leaf(T_PUNCTUATION, from, from + 1);
			lex_ts_interior(l, from + 1, close === -1 ? end : close);
		} else if (sigil === 35 && (word === 'each' || word === 'await')) {
			// {#each expr as pattern} / {#await expr then value} — `as`/`then`
			// splits two ts interiors, so the brace is found first
			close = scan_balanced_braces(text, from, end);
			const inner_end = close === -1 ? end : close;
			const is_each = word === 'each';
			// a bare `{#each}` is a plain block
			l.open(is_each && keyword_end < inner_end ? T_EACH : T_BLOCK, from);
			l.leaf(T_PUNCTUATION, from, from + 1);
			l.leaf(T_SPECIAL_KEYWORD, from + 1, keyword_end);
			const split_word = is_each ? 'as' : 'then';
			const split = find_top_level_word(text, keyword_end, inner_end, split_word);
			if (split === -1) {
				lex_ts_interior(l, keyword_end, inner_end);
			} else {
				lex_ts_interior(l, keyword_end, split);
				l.leaf(T_KEYWORD, split, split + split_word.length);
				lex_ts_interior(l, split + split_word.length, inner_end);
			}
		} else {
			l.open(T_BLOCK, from);
			l.leaf(T_PUNCTUATION, from, from + 1);
			l.leaf(T_SPECIAL_KEYWORD, from + 1, keyword_end);
			close = lex_ts_to_brace(l, from, keyword_end, end);
		}
	} else {
		// `{const …}`/`{let …}` — only at top level; never collides with the
		// `@`/`#`/`:`/`/` sigil forms since those first chars can't spell a keyword
		const decl_len = full ? declaration_keyword_len(text, from + 1, end) : 0;
		if (decl_len !== 0) {
			// the keyword leads, the rest is a ts interior
			const kw_end = from + 1 + decl_len;
			l.open(T_DECLARATION_TAG, from);
			l.leaf(T_PUNCTUATION, from, from + 1);
			l.leaf(T_KEYWORD, from + 1, kw_end);
			close = lex_ts_to_brace(l, from, kw_end, end);
		} else {
			nested = false;
			l.leaf(T_PUNCTUATION, from, from + 1);
			close = lex_ts_to_brace(l, from, from + 1, end);
		}
	}
	const expr_end = close === -1 ? end : close + 1;
	if (close !== -1) l.leaf(T_PUNCTUATION, close, expr_end);
	if (nested) l.close(expr_end);
	l.close(expr_end);
	return expr_end;
};

const SVELTE_MODE: MarkupLexMode = {
	script_embed: 'ts',
	script_container: T_LANG_TS,
	rcdata: false,
	special_attrs: false,
	attr_comments: true,
	lex_expression: lex_svelte_expression
};

const lex_svelte = (l: Lexer): void => {
	lex_markup_window(l, SVELTE_MODE);
};

/**
 * The Svelte language registration for the lexer engine.
 */
export const lexer_svelte: SyntaxLang = { id: 'svelte', lex: lex_svelte };
