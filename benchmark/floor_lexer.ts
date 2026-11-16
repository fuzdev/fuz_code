/**
 * Floor lexers for the cost model: the least a lexer over the shared substrate
 * can do with a text.
 *
 * A floor lexer knows no grammar. It skips whitespace and identifiers, and
 * emits a leaf for each number, quoted string, comment, and run of
 * punctuation, using the same `Lexer` emitters and scanning helpers as the
 * real lexers. A real lexer's time over it says how much the grammar costs,
 * which is the part that can be tuned. It is a reference and not a bound: a
 * real lexer beats it where it scans a construct natively that the floor walks
 * word by word (prose, a compound selector).
 *
 * @module
 */

import {
	is_digit,
	is_ident,
	is_ident_start,
	is_space,
	scan_ident,
	scan_to_line_end,
	skip_quoted,
	token_type,
	type Lexer,
	type SyntaxLang
} from '../src/lib/lexer.ts';

const T_PUNCTUATION = token_type('punctuation');
const T_NUMBER = token_type('number');
const T_STRING = token_type('string');
const T_COMMENT = token_type('comment');

/**
 * What little a floor lexer knows about a language.
 */
export interface FloorLexerOptions {
	/**
	 * What starts a comment that runs to the end of its line, e.g. `'//'`.
	 */
	line_comment?: string;
	/**
	 * What opens and closes a comment that can span lines, e.g. `['/*', '*\/']`.
	 */
	block_comment?: [open: string, close: string];
	/**
	 * The characters that quote a string, e.g. `` '"\'`' ``.
	 */
	quotes?: string;
}

// char classes, looked up by code; anything past ASCII is an identifier char
const C_PUNCTUATION = 0;
const C_SPACE = 1;
const C_IDENT = 2;
const C_DIGIT = 3;
const C_QUOTE = 4;
// the first char of a comment opener, which may turn out to be punctuation
const C_COMMENT = 5;

/**
 * Creates a floor lexer, registered under no id of its own: time it with
 * `lex_syntax`.
 */
export const create_floor_lexer = (options: FloorLexerOptions): SyntaxLang => {
	const { line_comment = '', block_comment = ['', ''], quotes = '' } = options;
	const [block_open, block_close] = block_comment;
	const classes = new Uint8Array(128);
	for (let c = 0; c < 128; c++) {
		classes[c] = is_space(c)
			? C_SPACE
			: is_digit(c)
				? C_DIGIT
				: is_ident_start(c)
					? C_IDENT
					: C_PUNCTUATION;
	}
	for (const quote of quotes) classes[quote.charCodeAt(0)] = C_QUOTE;
	if (line_comment !== '') classes[line_comment.charCodeAt(0)] = C_COMMENT;
	if (block_open !== '') classes[block_open.charCodeAt(0)] = C_COMMENT;
	return {
		id: 'floor',
		lex: (l: Lexer): void => {
			const { text, end } = l;
			let i = l.pos;
			while (i < end) {
				const c = text.charCodeAt(i);
				switch (c < 128 ? classes[c]! : C_IDENT) {
					case C_SPACE:
						i++;
						break;
					case C_IDENT:
						i = scan_ident(text, i, end);
						break;
					case C_DIGIT: {
						const start = i++;
						while (i < end && is_ident(text.charCodeAt(i))) i++;
						l.leaf(T_NUMBER, start, i);
						break;
					}
					case C_QUOTE: {
						const str_end = skip_quoted(text, i, end, c);
						l.leaf(T_STRING, i, str_end);
						i = str_end;
						break;
					}
					case C_COMMENT: {
						let comment_end = -1;
						if (line_comment !== '' && text.startsWith(line_comment, i)) {
							comment_end = scan_to_line_end(text, i, end);
						} else if (block_open !== '' && text.startsWith(block_open, i)) {
							const close = text.indexOf(block_close, i + block_open.length);
							comment_end =
								close === -1 || close + block_close.length > end ? end : close + block_close.length;
						}
						if (comment_end === -1) {
							// not a comment after all
							l.leaf(T_PUNCTUATION, i, i + 1);
							i++;
						} else {
							l.leaf(T_COMMENT, i, comment_end);
							i = comment_end;
						}
						break;
					}
					default:
						l.leaf(T_PUNCTUATION, i, i + 1);
						i++;
				}
			}
			l.pos = end;
		}
	};
};

const C_LIKE: FloorLexerOptions = {
	line_comment: '//',
	block_comment: ['/*', '*/'],
	quotes: '"\'`'
};

const MARKUP: FloorLexerOptions = { block_comment: ['<!--', '-->'], quotes: '"' };

/**
 * The floor lexer for each language id `syntax_styler_global` registers,
 * `plaintext` aside.
 */
export const floor_lexers: Record<string, SyntaxLang> = {
	ts: create_floor_lexer(C_LIKE),
	json: create_floor_lexer({ ...C_LIKE, quotes: '"' }),
	css: create_floor_lexer({ block_comment: ['/*', '*/'], quotes: '"\'' }),
	// a `'` is a lifetime as often as a char literal
	rust: create_floor_lexer({ ...C_LIKE, quotes: '"' }),
	sh: create_floor_lexer({ line_comment: '#', quotes: '"\'' }),
	markup: create_floor_lexer(MARKUP),
	xml: create_floor_lexer(MARKUP),
	svelte: create_floor_lexer(MARKUP),
	md: create_floor_lexer({})
};
