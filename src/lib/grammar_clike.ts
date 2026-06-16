import type {AddSyntaxGrammar, SyntaxGrammarRaw} from './syntax_styler.ts';

export const class_keywords = 'class|extends|implements|instanceof|interface|new';

/**
 * Based on Prism (https://github.com/PrismJS/prism)
 * by Lea Verou (https://lea.verou.me/)
 *
 * MIT license
 *
 * @see LICENSE
 */
export const add_grammar_clike: AddSyntaxGrammar = (syntax_styler) => {
	const grammar_clike = {
		comment: [
			{
				pattern: /(^|[^\\])\/\*[\s\S]*?(?:\*\/|$)/,
				lookbehind: true,
				greedy: true,
			},
			{
				pattern: /(^|[^\\:])\/\/.*/,
				lookbehind: true,
				greedy: true,
			},
		],
		string: {
			pattern: /(["'])(?:\\(?:\r\n|[\s\S])|(?!\1)[^\\\r\n])*\1/,
			greedy: true,
		},
		class_name: {
			pattern: new RegExp(`(\\b(?:${class_keywords}|trait)\\s+|\\bcatch\\s+\\()[\\w.\\\\]+`, 'i'),
			lookbehind: true,
			inside: {
				punctuation: /[.\\]/,
			},
		},
		keyword:
			/\b(?:break|catch|continue|do|else|finally|for|function|if|in|instanceof|new|null|return|throw|try|while)\b/,
		boolean: /\b(?:false|true)\b/,
		function: /\b\w+(?=\()/,
		number: /\b0x[\da-f]+\b|(?:\b\d+(?:\.\d*)?|\B\.\d+)(?:e[+-]?\d+)?/i,
		operator: /[<>]=?|[!=]=?=?|--?|\+\+?|&&?|\|\|?|[?*/~^%]/,
		punctuation: /[{}[\];(),.:]/,
	} satisfies SyntaxGrammarRaw;

	syntax_styler.add_lang('clike', grammar_clike);
};
