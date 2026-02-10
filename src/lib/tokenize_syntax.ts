import type {SyntaxGrammar} from './syntax_styler.js';
import {SyntaxToken, type SyntaxTokenStream} from './syntax_token.js';

/**
 * Accepts a string of text as input and the language definitions to use,
 * and returns an array with the tokenized code.
 *
 * When the language definition includes nested tokens, the function is called recursively on each of these tokens.
 *
 * This method could be useful in other contexts as well, as a very crude parser.
 *
 * @param text - a string with the code to be styled
 * @param grammar - an object containing the tokens to use
 *
 * Usually a language definition like `syntax_styler.get_lang('markup')`.
 *
 * @returns an array of strings and tokens, a token stream
 *
 * @example
 * ```ts
 * var code = `var foo = 0;`;
 * var tokens = tokenize_syntax(code, SyntaxStyler.langs.js);
 * for (var token of tokens) {
 *     if (token instanceof SyntaxToken && token.type === 'number') {
 *         console.log(`Found numeric literal: ${token.content}`);
 *     }
 * }
 * ```
 */
export const tokenize_syntax = (text: string, grammar: SyntaxGrammar): SyntaxTokenStream => {
	// Grammar is already normalized (rest merged, patterns in arrays, etc.)
	var token_list = new LinkedList();
	add_after(token_list, token_list.head, text);

	match_grammar(text, token_list, grammar, token_list.head, 0);

	return to_array(token_list);
};

interface RematchOptions {
	cause: string;
	reach: number;
}

const match_grammar = (
	text: string,
	token_list: LinkedList,
	grammar: SyntaxGrammar,
	start_node: LinkedListNode,
	start_pos: number,
	rematch?: RematchOptions,
): void => {
	for (var token in grammar) {
		// Grammar is normalized: patterns is always an array of normalized objects
		var patterns = grammar[token];

		if (!patterns) {
			continue;
		}

		for (var j = 0; j < patterns.length; ++j) {
			if (rematch?.cause === token + ',' + j) {
				return;
			}

			var pattern_obj = patterns[j]!;
			// All properties are guaranteed to be present after normalization
			var inside = pattern_obj.inside;
			var lookbehind = pattern_obj.lookbehind;
			var greedy = pattern_obj.greedy;
			var alias = pattern_obj.alias;

			// Pattern already has global flag if greedy (added during normalization)
			var pattern: RegExp = pattern_obj.pattern;

			for (
				// iterate the token list and keep track of the current token/string position
				var current_node = start_node.next, pos = start_pos;
				current_node !== token_list.tail;
				pos += current_node!.value!.length, current_node = current_node!.next
			) {
				if (rematch && pos >= rematch.reach) {
					break;
				}

				var str = current_node!.value;

				if (token_list.length > text.length) {
					// Something went terribly wrong, ABORT, ABORT!
					return;
				}

				if (str instanceof SyntaxToken) {
					continue;
				}

				var remove_count = 1;
				var match;

				if (greedy) {
					match = match_pattern(pattern, pos, text, lookbehind);
					if (!match || match.index >= text.length) {
						break;
					}

					var from = match.index;
					var to = match.index + match[0].length;
					var p = pos;

					// find the node that contains the match
					p += current_node!.value!.length;
					while (from >= p) {
						current_node = current_node!.next;
						p += current_node!.value!.length;
					}
					// adjust pos (and p)
					p -= current_node!.value!.length;
					pos = p;

					// the current node is a Token, then the match starts inside another Token, which is invalid
					if (current_node!.value instanceof SyntaxToken) {
						continue;
					}

					// find the last node which is affected by this match
					for (
						var k = current_node;
						k !== token_list.tail && (p < to || typeof k!.value === 'string');
						k = k!.next
					) {
						remove_count++;
						p += k!.value!.length;
					}
					remove_count--;

					// replace with the new match
					str = text.substring(pos, p);
					match.index -= pos;
				} else {
					match = match_pattern(pattern, 0, str!, lookbehind);
					if (!match) {
						continue;
					}
				}

				var from = match.index;
				var match_str = match[0];
				var before = str!.substring(0, from);
				var after = str!.substring(from + match_str.length);

				var reach = pos + str!.length;
				if (rematch && reach > rematch.reach) {
					rematch.reach = reach;
				}

				var remove_from = current_node!.prev;

				if (before) {
					remove_from = add_after(token_list, remove_from!, before);
					pos += before.length;
				}

				remove_range(token_list, remove_from!, remove_count);

				var wrapped = new SyntaxToken(
					token,
					inside ? tokenize_syntax(match_str, inside) : match_str,
					alias,
					match_str,
				);
				current_node = add_after(token_list, remove_from!, wrapped);

				if (after) {
					add_after(token_list, current_node, after);
				}

				if (remove_count > 1) {
					// at least one Token object was removed, so we have to do some rematching
					// this can only happen if the current pattern is greedy

					var nested_rematch: RematchOptions = {
						cause: token + ',' + j,
						reach,
					};
					match_grammar(text, token_list, grammar, current_node.prev!, pos, nested_rematch);

					// the reach might have been extended because of the rematching
					if (rematch && nested_rematch.reach > rematch.reach) {
						rematch.reach = nested_rematch.reach;
					}
				}
			}
		}
	}
};

class LinkedList<T = string | SyntaxToken> {
	head: LinkedListNode<T>;
	tail: LinkedListNode<T>;
	length: number = 0;

	constructor() {
		this.head = {value: null, prev: null, next: null};
		this.tail = {value: null, prev: this.head, next: null};
		this.head.next = this.tail;
	}
}

interface LinkedListNode<T = string | SyntaxToken> {
	value: T | null;
	prev: LinkedListNode<T> | null;
	next: LinkedListNode<T> | null;
}

/**
 * Adds a new node with the given value to the list.
 */
const add_after = <T>(
	list: LinkedList<T>,
	node: LinkedListNode<T>,
	value: T,
): LinkedListNode<T> => {
	// assumes that node != list.tail && values.length >= 0
	var next = node.next!;

	var new_node = {value, prev: node, next};
	node.next = new_node;
	next.prev = new_node;
	list.length++;

	return new_node;
};

/**
 * Removes `count` nodes after the given node. The given node will not be removed.
 */
const remove_range = <T>(list: LinkedList<T>, node: LinkedListNode<T>, count: number) => {
	var next = node.next;
	for (var i = 0; i < count && next !== list.tail; i++) {
		next = next!.next;
	}
	node.next = next;
	next!.prev = node;
	list.length -= i;
};

const to_array = <T>(list: LinkedList<T>): Array<T> => {
	var array = [];
	var node = list.head.next;
	while (node !== list.tail) {
		array.push(node!.value!);
		node = node!.next;
	}
	return array;
};

const match_pattern = (
	pattern: RegExp,
	pos: number,
	text: string,
	lookbehind: boolean,
): RegExpExecArray | null => {
	pattern.lastIndex = pos;
	var match = pattern.exec(text);
	if (match && lookbehind && match[1]) {
		// change the match to remove the text matched by the lookbehind group
		var lookbehind_length = match[1].length;
		match.index += lookbehind_length;
		match[0] = match[0].substring(lookbehind_length);
	}
	return match;
};
