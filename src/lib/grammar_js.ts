import type {AddSyntaxGrammar} from './syntax_styler.ts';
import {grammar_markup_add_attribute, grammar_markup_add_inlined} from './grammar_markup.ts';
import {class_keywords} from './grammar_clike.ts';

/**
 * Based on Prism (https://github.com/PrismJS/prism)
 * by Lea Verou (https://lea.verou.me/)
 *
 * MIT license
 *
 * @see LICENSE
 */
export const add_grammar_js: AddSyntaxGrammar = (syntax_styler) => {
	const grammar_clike = syntax_styler.get_lang('clike');

	// Main JS keywords (from keyword pattern, excluding those with special lookaheads)
	const main_keywords =
		'class|const|debugger|delete|enum|extends|function|implements|in|instanceof|interface|let|new|null|of|package|private|protected|public|static|super|this|typeof|undefined|var|void|with';

	// Keywords that are treated specially (inserted before 'function')
	const special_keywords =
		'as|await|break|case|catch|continue|default|do|else|export|finally|for|from|if|import|return|switch|throw|try|while|yield';

	// All JS keywords (for negative lookahead in parameter pattern)
	// Note: 'assert', 'async', 'get', 'set' have special lookahead requirements in the main keyword pattern
	const all_js_keywords = `assert|async|${main_keywords}|get|set|${special_keywords}`;

	const grammar_js = syntax_styler.add_extended_lang(
		'clike',
		'js',
		{
			class_name: [
				...grammar_clike.class_name!,
				{
					pattern:
						/(^|[^$\w\xA0-\uFFFF])(?!\s)[_$A-Z\xA0-\uFFFF](?:(?!\s)[$\w\xA0-\uFFFF])*(?=\.(?:constructor|prototype))/,
					lookbehind: true,
				},
			],
			keyword: [
				{
					pattern: new RegExp(
						`(^|[^.]|\\.\\.\\.\\s*)\\b(?:assert(?=\\s*\\{)|async(?=\\s*(?:function\\b|\\*|\\(|[$\\w\\xA0-\\uFFFF]|$))|${main_keywords}|(?:get|set)(?=\\s*(?:[#[$\\w\\xA0-\\uFFFF]|$)))\\b`,
					),
					lookbehind: true,
				},
			],
			// Allow for all non-ASCII characters (See http://stackoverflow.com/a/2008444)
			function:
				/#?(?!\s)[_$a-zA-Z\xA0-\uFFFF](?:(?!\s)[$\w\xA0-\uFFFF])*(?=\s*(?:\.\s*(?:apply|bind|call)\s*)?\()/,
			number: {
				pattern: RegExp(
					/(^|[^\w$])/.source +
						'(?:' +
						// constant
						(/NaN|Infinity/.source +
							'|' +
							// binary integer
							/0[bB][01]+(?:_[01]+)*n?/.source +
							'|' +
							// octal integer
							/0[oO][0-7]+(?:_[0-7]+)*n?/.source +
							'|' +
							// hexadecimal integer
							/0[xX][\dA-Fa-f]+(?:_[\dA-Fa-f]+)*n?/.source +
							'|' +
							// decimal bigint
							/\d+(?:_\d+)*n/.source +
							'|' +
							// decimal number (integer or float) but no bigint
							/(?:\d+(?:_\d+)*(?:\.(?:\d+(?:_\d+)*)?)?|\.\d+(?:_\d+)*)(?:[Ee][+-]?\d+(?:_\d+)*)?/
								.source) +
						')' +
						/(?![\w$])/.source,
				),
				lookbehind: true,
			},
			operator:
				/--|\+\+|\*\*=?|=>|&&=?|\|\|=?|[!=]==|<<=?|>>>?=?|[-+*/%&|^!=<>]=?|\.{3}|\?\?=?|\?\.?|[~:]/,
		},
		['javascript'],
	);

	(grammar_js as any).class_name[0].pattern = new RegExp(
		`(\\b(?:${class_keywords})\\s+)[\\w.\\\\]+`,
	);

	syntax_styler.grammar_insert_before('js', 'function', {
		special_keyword: new RegExp(`\\b(?:${special_keywords})\\b`),
	});

	syntax_styler.grammar_insert_before('js', 'keyword', {
		regex: {
			pattern: RegExp(
				// lookbehind
				/((?:^|[^$\w\xA0-\uFFFF."'\])\s]|\b(?:return|yield))\s*)/.source +
					// Regex pattern:
					// There are 2 regex patterns here. The RegExp set notation proposal added support for nested character
					// classes if the `v` flag is present. Unfortunately, nested CCs are both context-free and incompatible
					// with the only syntax, so we have to define 2 different regex patterns.
					/\//.source +
					'(?:' +
					/(?:\[(?:[^\]\\\r\n]|\\.)*\]|\\.|[^/\\[\r\n])+\/[dgimyus]{0,7}/.source +
					'|' +
					// `v` flag syntax. This supports 3 levels of nested character classes.
					/(?:\[(?:[^[\]\\\r\n]|\\.|\[(?:[^[\]\\\r\n]|\\.|\[(?:[^[\]\\\r\n]|\\.)*\])*\])*\]|\\.|[^/\\[\r\n])+\/[dgimyus]{0,7}v[dgimyus]{0,7}/
						.source +
					')' +
					// lookahead
					/(?=(?:\s|\/\*(?:[^*]|\*(?!\/))*\*\/)*(?:$|[\r\n,.;:})\]]|\/\/))/.source,
			),
			lookbehind: true,
			greedy: true,
			inside: {
				regex_source: {
					pattern: /^(\/)[\s\S]+(?=\/[a-z]*$)/,
					lookbehind: true,
					alias: 'lang_regex',
					inside: syntax_styler.langs.regex, // TODO use `get_lang` after adding `regex` support
				},
				regex_delimiter: /^\/|\/$/,
				regex_flags: /^[a-z]+$/,
			},
		},
		// Arrow function and function expression variable names
		// This must be declared before keyword because we use "function" inside the look-forward
		function_variable: {
			pattern:
				/#?(?!\s)[_$a-zA-Z\xA0-\uFFFF](?:(?!\s)[$\w\xA0-\uFFFF])*(?=\s*[=:]\s*(?:async\s*)?(?:\bfunction\b|(?:\((?:[^()]|\([^()]*\))*\)|(?!\s)[_$a-zA-Z\xA0-\uFFFF](?:(?!\s)[$\w\xA0-\uFFFF])*)\s*=>))/,
			alias: 'function',
		},
		parameter: [
			{
				pattern:
					/(function(?:\s+(?!\s)[_$a-zA-Z\xA0-\uFFFF](?:(?!\s)[$\w\xA0-\uFFFF])*)?\s*\(\s*)(?!\s)(?:[^()\s]|\s+(?![\s)])|\([^()]*\))+(?=\s*\))/,
				lookbehind: true,
				inside: grammar_js,
			},
			{
				pattern:
					/(^|[^$\w\xA0-\uFFFF])(?!\s)[_$a-z\xA0-\uFFFF](?:(?!\s)[$\w\xA0-\uFFFF])*(?=\s*=>)/i,
				lookbehind: true,
				inside: grammar_js,
			},
			{
				pattern: /(\(\s*)(?!\s)(?:[^()\s]|\s+(?![\s)])|\([^()]*\))+(?=\s*\)\s*=>)/,
				lookbehind: true,
				inside: grammar_js,
			},
			{
				pattern: new RegExp(
					`((?:\\b|\\s|^)(?!(?:${all_js_keywords})(?![$\\w\\xA0-\\uFFFF]))(?:(?!\\s)[_$a-zA-Z\\xA0-\\uFFFF](?:(?!\\s)[$\\w\\xA0-\\uFFFF])*\\s*)\\(\\s*|\\]\\s*\\(\\s*)(?!\\s)(?:[^()\\s]|\\s+(?![\\s)])|\\([^()]*\\))+(?=\\s*\\)\\s*\\{)`,
				),
				lookbehind: true,
				inside: grammar_js,
			},
		],
		constant: /\b[A-Z](?:[A-Z_]|\dx?)*\b/,
		// Heuristic: treat capitalized identifiers as class names when not already matched
		capitalized_identifier: {
			pattern: /\b[A-Z][\w]*\b/,
			alias: 'class_name',
		},
	});

	syntax_styler.grammar_insert_before('js', 'string', {
		hashbang: {
			pattern: /^#!.*/,
			greedy: true,
			alias: 'comment',
		},
		template_string: {
			pattern: /`(?:\\[\s\S]|\$\{(?:[^{}]|\{(?:[^{}]|\{[^}]*\})*\})+\}|(?!\$\{)[^\\`])*`/,
			greedy: true,
			inside: {
				template_punctuation: {
					pattern: /^`|`$/,
					alias: 'string',
				},
				interpolation: {
					pattern: /((?:^|[^\\])(?:\\{2})*)\$\{(?:[^{}]|\{(?:[^{}]|\{[^}]*\})*\})+\}/,
					lookbehind: true,
					inside: {
						interpolation_punctuation: {
							pattern: /^\$\{|\}$/,
							alias: 'punctuation',
						},
						rest: grammar_js as any, // TODO try to fix this type
					},
				},
				string: /[\s\S]+/,
			},
		},
		string_property: {
			pattern: /((?:^|[,{])[ \t]*)(["'])(?:\\(?:\r\n|[\s\S])|(?!\2)[^\\\r\n])*\2(?=\s*:)/m,
			lookbehind: true,
			greedy: true,
			alias: 'property',
		},
	});

	syntax_styler.grammar_insert_before('js', 'operator', {
		literal_property: {
			pattern: /((?:^|[,{])[ \t]*)(?!\s)[_$a-zA-Z\xA0-\uFFFF](?:(?!\s)[$\w\xA0-\uFFFF])*(?=\s*:)/m,
			lookbehind: true,
			alias: 'property',
		},
	});

	grammar_markup_add_inlined(syntax_styler, 'script', 'js');

	// add attribute support for all DOM events (on* attributes)
	// https://developer.mozilla.org/en-US/docs/Web/Events#Standard_events
	grammar_markup_add_attribute(syntax_styler, 'on\\w+', 'js');
};
