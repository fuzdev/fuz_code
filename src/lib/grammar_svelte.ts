import type {AddSyntaxGrammar, SyntaxStyler} from './syntax_styler.ts';
import {grammar_markup_add_inlined} from './grammar_markup.ts';

const blocks = '(if|else if|else|await|then|catch|each|html|debug|snippet)';

/**
 * Based on `prism-svelte` (https://github.com/pngwn/prism-svelte)
 * by pngwn (https://github.com/pngwn)
 *
 * MIT license
 *
 * @see LICENSE
 */
export const add_grammar_svelte: AddSyntaxGrammar = (syntax_styler) => {
	const grammar_ts = syntax_styler.get_lang('ts');

	// Define the at_directive pattern once for reuse (matches any @word)
	const at_directive_pattern = {
		pattern: /^{(@\w+)(\s+[\s\S]*)?}$/,
		inside: {
			lang_ts: {
				pattern: /(@\w+\s+)([\s\S]+)/, // Fixed: removed incorrect (?=}$)
				lookbehind: true,
				inside: grammar_ts,
			},
			at_keyword: /@\w+/,
			punctuation: /[{}]/,
		},
	};

	// Full expression patterns for top-level contexts
	const svelte_expression_inside_full = {
		// Generic @ directive - matches any @word
		at_directive: at_directive_pattern,
		// {#each items as item} with special syntax
		each: {
			pattern: /^{([#/]each)\s+([\s\S]*)}$/,
			inside: {
				special_keyword: /[#/]each/,
				lang_ts: [
					{
						pattern: /(#each\s+)[\s\S]+(?=\s+as)/, // Expression before 'as'
						lookbehind: true,
						inside: grammar_ts,
					},
					{
						pattern: /(as\s+)[\s\S]+/, // Everything after 'as' (including key)
						lookbehind: true,
						inside: grammar_ts,
					},
				],
				keyword: /as/,
				punctuation: /[{}]/,
			},
		},
		// {#block ...} and {/block}
		block: {
			pattern: new RegExp('^\\{([#:/@]\\s*' + blocks + ')\\s*([\\s\\S]*)\\}$'),
			inside: {
				special_keyword: new RegExp('[#:/@]' + blocks),
				keyword: [/as/, /then/],
				lang_ts: {
					pattern: /[\s\S]+(?=}$)/,
					inside: grammar_ts,
				},
				punctuation: /[{}]/,
			},
		},
		// Default: plain TS expression
		punctuation: /[{}]/,
		lang_ts: {
			pattern: /[\s\S]+/,
			inside: grammar_ts,
		},
	};

	// Simplified patterns for tag contexts (no block directives)
	const svelte_expression_inside_simple = {
		// Generic @ directive
		at_directive: at_directive_pattern,
		// Default: plain TS expression
		punctuation: /[{}]/,
		lang_ts: {
			pattern: /[\s\S]+/,
			inside: grammar_ts,
		},
	};

	const grammar_svelte = syntax_styler.add_extended_lang('markup', 'svelte', {
		svelte_expression: {
			pattern: /\{(?:[^{}]|\{[^}]*\})*\}/,
			greedy: true,
			inside: svelte_expression_inside_full,
		},
		tag: {
			pattern:
				/<\/?(?!\d)[^\s>/=$<%]+(?:\s(?:\s*(?:\{(?:[^{}]|\{[^}]*\})*\}|[^\s>/=]+)(?:\s*=\s*(?:(?:"[^"]*"|'[^']*'|[^\s'">=]+(?=[\s>]))|(?:"[^"]*"|'[^']*'|{[\s\S]+?}(?=[\s/>])))|(?=[\s/>])))+)?\s*\/?>/i,
			greedy: true,
			inside: {
				tag: {
					pattern: /^<\/?[^\s>/]+/i,
					inside: {
						punctuation: {
							pattern: /^<\/?/,
							alias: 'tag_punctuation',
						},
						namespace: /^[^\s>/:]+:/,
					},
				},
				svelte_expression: {
					pattern: /\{(?:[^{}]|\{[^}]*\})*\}/,
					inside: svelte_expression_inside_simple,
				},
				attr_value: {
					pattern: /=\s*(?:"[^"]*"|'[^']*'|[^\s'">=]+)/i,
					inside: {
						punctuation: [
							{
								pattern: /^=/,
								alias: 'attr_equals',
							},
							{
								pattern: /^(\s*)["']|["']$/,
								lookbehind: true,
								alias: 'attr_quote',
							},
						],
						svelte_expression: {
							pattern: /\{(?:[^{}]|\{[^}]*\})*\}/,
							inside: svelte_expression_inside_simple,
						},
					},
				},
				punctuation: {
					pattern: /\/?>/,
					alias: 'tag_punctuation',
				},
				attr_name: {
					pattern: /[^\s>/]+/,
					inside: {
						namespace: /^[^\s>/:]+:/,
					},
				},
			},
		},
	});

	// oof lol
	// After normalization, grammar.tag is an array of SyntaxGrammarToken
	const tag_patterns = grammar_svelte.tag as any;
	const tag_inside = tag_patterns[0].inside;
	tag_inside.attr_value[0].inside.entity = grammar_svelte.entity;

	grammar_svelte_add_inlined(syntax_styler, 'style', 'css');
	// Assume TypeScript for all Svelte script tags (no plain JS)
	grammar_svelte_add_inlined(syntax_styler, 'script', 'ts');
};

export const grammar_svelte_add_inlined = (
	syntax_styler: SyntaxStyler,
	tag_name: string,
	lang: string,
): void => {
	grammar_markup_add_inlined(syntax_styler, tag_name, lang, 'svelte');
};
