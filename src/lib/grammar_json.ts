import type {AddSyntaxGrammar, SyntaxGrammarRaw} from './syntax_styler.ts';

/**
 * Based on Prism (https://github.com/PrismJS/prism)
 * by Lea Verou (https://lea.verou.me/)
 *
 * MIT license
 *
 * @see LICENSE
 */
export const add_grammar_json: AddSyntaxGrammar = (syntax_styler) => {
	const grammar_json = {
		property: {
			pattern: /(^|[^\\])"(?:\\.|[^\\"\r\n])*"(?=\s*:)/,
			lookbehind: true,
			greedy: true,
		},
		string: {
			pattern: /(^|[^\\])"(?:\\.|[^\\"\r\n])*"(?!\s*:)/,
			lookbehind: true,
			greedy: true,
		},
		comment: {
			pattern: /\/\/.*|\/\*[\s\S]*?(?:\*\/|$)/,
			greedy: true,
		},
		number: /-?\b\d+(?:\.\d+)?(?:e[+-]?\d+)?\b/i,
		punctuation: /[{}[\],]/,
		operator: /:/,
		boolean: /\b(?:false|true)\b/,
		null: {
			pattern: /\bnull\b/,
			alias: 'keyword',
		},
	} satisfies SyntaxGrammarRaw;

	syntax_styler.add_lang('json', grammar_json);
};
