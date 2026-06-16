import type {AddSyntaxGrammar, SyntaxGrammarRaw} from './syntax_styler.ts';
import {grammar_markup_add_attribute, grammar_markup_add_inlined} from './grammar_markup.ts';

var string = /(?:"(?:\\(?:\r\n|[\s\S])|[^"\\\r\n])*"|'(?:\\(?:\r\n|[\s\S])|[^'\\\r\n])*')/;

/**
 * Based on Prism (https://github.com/PrismJS/prism)
 * by Lea Verou (https://lea.verou.me/)
 *
 * MIT license
 *
 * @see LICENSE
 */
export const add_grammar_css: AddSyntaxGrammar = (syntax_styler) => {
	const grammar_css = {
		comment: /\/\*[\s\S]*?\*\//,
		atrule: {
			pattern: RegExp(
				'@[\\w-](?:' +
					/[^;{\s"']|\s+(?!\s)/.source +
					'|' +
					string.source +
					')*?' +
					/(?:;|(?=\s*\{))/.source,
			),
			inside: {
				rule: /^@[\w-]+/,
				selector_function_argument: {
					pattern:
						/(\bselector\s*\(\s*(?![\s)]))(?:[^()\s]|\s+(?![\s)])|\((?:[^()]|\([^()]*\))*\))+(?=\s*\))/,
					lookbehind: true,
					alias: 'selector',
				},
				keyword: {
					pattern: /(^|[^\w-])(?:and|not|only|or)(?![\w-])/,
					lookbehind: true,
				},
			} as SyntaxGrammarRaw, // see `rest` below
		},
		url: {
			// https://drafts.csswg.org/css-values-3/#urls
			pattern: RegExp(
				'\\burl\\((?:' + string.source + '|' + /(?:[^\\\r\n()"']|\\[\s\S])*/.source + ')\\)',
				'i',
			),
			greedy: true,
			inside: {
				function: /^url/i,
				punctuation: /^\(|\)$/,
				string: {
					pattern: RegExp('^' + string.source + '$'),
					alias: 'url',
				},
			},
		},
		selector: {
			pattern: RegExp(
				'(^|[{}\\s])[^{}\\s](?:[^{};"\'\\s]|\\s+(?![\\s{])|' + string.source + ')*(?=\\s*\\{)',
			),
			lookbehind: true,
		},
		string: {
			pattern: string,
			greedy: true,
		},
		property: {
			pattern: /(^|[^-\w\xA0-\uFFFF])(?!\s)[-_a-z\xA0-\uFFFF](?:(?!\s)[-\w\xA0-\uFFFF])*(?=\s*:)/i,
			lookbehind: true,
		},
		important: /!important\b/i,
		function: {
			pattern: /(^|[^-a-z0-9])[-a-z0-9]+(?=\()/i,
			lookbehind: true,
		},
		punctuation: /[(){};:,]/,
	} satisfies SyntaxGrammarRaw;

	grammar_css.atrule.inside.rest = grammar_css;

	syntax_styler.add_lang('css', grammar_css);

	grammar_markup_add_inlined(syntax_styler, 'style', 'css');
	grammar_markup_add_attribute(syntax_styler, 'style', 'css');
};
