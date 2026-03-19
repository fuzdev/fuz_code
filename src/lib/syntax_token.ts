export class SyntaxToken {
	/**
	 * The type of the token.
	 *
	 * This is usually the key of a pattern in a `SyntaxGrammar`.
	 */
	type: string;

	/**
	 * The strings or tokens contained by this token.
	 *
	 * This will be a `SyntaxTokenStream` if the pattern matched also defined an `inside` grammar.
	 */
	content: string | SyntaxTokenStream;

	/**
	 * The alias(es) of the token.
	 * Always an array, even if empty or single value.
	 */
	alias: Array<string>;

	length: number;

	constructor(
		type: string,
		content: string | SyntaxTokenStream,
		alias: string | Array<string> | undefined,
		matched_str: string = '',
	) {
		this.type = type;
		this.content = content;
		// Normalize alias to always be an array
		this.alias = alias ? (Array.isArray(alias) ? alias : [alias]) : [];
		this.length = matched_str.length;
	}
}

/**
 * A token stream is an array of strings and `SyntaxToken` objects.
 *
 * `SyntaxTokenStream` values have to fulfill a few properties that are assumed by most functions
 * (mostly internal ones) that process them.
 *
 * 1. No adjacent strings.
 * 2. No empty strings.
 *
 *    The only exception here is the token stream that only contains the empty string and nothing else.
 */
export type SyntaxTokenStream = Array<string | SyntaxToken>;
