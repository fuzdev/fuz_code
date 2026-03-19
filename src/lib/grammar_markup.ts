import type {
	SyntaxStyler,
	AddSyntaxGrammar,
	SyntaxGrammarRaw,
	SyntaxGrammarToken,
	SyntaxGrammar,
} from './syntax_styler.js';

/**
 * Based on Prism (https://github.com/PrismJS/prism)
 * by Lea Verou (https://lea.verou.me/)
 *
 * MIT license
 *
 * @see LICENSE
 */
export const add_grammar_markup: AddSyntaxGrammar = (syntax_styler) => {
	const grammar_markup = {
		comment: {
			pattern: /<!--(?:(?!<!--)[\s\S])*?-->/,
			greedy: true,
		},
		processing_instruction: {
			pattern: /<\?[\s\S]+?\?>/,
			greedy: true,
		},
		// https://www.w3.org/TR/xml/#NT-doctypedecl
		doctype: {
			pattern: /<!DOCTYPE[^>]*>/i,
			greedy: true,
		},
		cdata: {
			pattern: /<!\[CDATA\[[\s\S]*?\]\]>/i,
			greedy: true,
		},
		tag: {
			pattern:
				/<\/?(?!\d)[^\s>/=$<%]+(?:\s(?:\s*[^\s>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s'">=]+(?=[\s>]))|(?=[\s/>])))+)?\s*\/?>/,
			greedy: true,
			inside: {
				tag: {
					pattern: /^<\/?[^\s>/]+/,
					inside: {
						punctuation: {
							pattern: /^<\/?/,
							alias: 'tag_punctuation',
						},
						namespace: /^[^\s>/:]+:/,
					},
				},
				special_attr: [],
				attr_value: {
					pattern: /=\s*(?:"[^"]*"|'[^']*'|[^\s'">=]+)/,
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
						entity: undefined as any, // see below
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
		entity: [
			{
				pattern: /&[\da-z]{1,8};/i,
				alias: 'named_entity',
			},
			/&#x?[\da-f]{1,8};/i,
		],
	} satisfies SyntaxGrammarRaw;

	grammar_markup.tag.inside.attr_value.inside.entity = grammar_markup.entity;

	syntax_styler.add_lang('markup', grammar_markup, ['html', 'mathml', 'svg']);
	syntax_styler.add_extended_lang('markup', 'xml', {}, ['ssml', 'atom', 'rss']);
};

/**
 * Adds an inlined language to markup.
 *
 * An example of an inlined language is CSS with `<style>` tags.
 *
 * @param syntax_styler - the `SyntaxStyler` instance to modify
 * @param tag_name - the name of the tag that contains the inlined language, treated as case insensitive
 * @param lang - the language key
 * @param inside_lang - the language to insert into, defaults to `'markup'`
 */
export const grammar_markup_add_inlined = (
	syntax_styler: SyntaxStyler,
	tag_name: string,
	lang: string,
	inside_lang = 'markup',
): void => {
	const lang_key = 'lang_' + lang;

	syntax_styler.grammar_insert_before(inside_lang, 'cdata', {
		[tag_name]: {
			pattern: RegExp(
				/(<__[^>]*>)(?:<!\[CDATA\[(?:[^\]]|\](?!\]>))*\]\]>|(?!<!\[CDATA\[)[\s\S])*?(?=<\/__>)/.source.replace(
					/__/g,
					() => {
						return tag_name;
					},
				),
				'i',
			),
			lookbehind: true,
			greedy: true,
			inside: {
				included_cdata: {
					pattern: /<!\[CDATA\[[\s\S]*?\]\]>/i,
					inside: {
						cdata: /^<!\[CDATA\[|\]\]>$/i,
						[lang_key]: {
							pattern: /(^<!\[CDATA\[)[\s\S]+?(?=\]\]>$)/i,
							lookbehind: true,
							inside: syntax_styler.get_lang(lang),
						},
					},
				},
				[lang_key]: {
					pattern: /[\s\S]+/,
					inside: syntax_styler.get_lang(lang),
				},
			},
		},
	});
};

/**
 * Adds a pattern to style languages embedded in HTML attributes.
 *
 * An example of an inlined language is CSS with `style` attributes.
 *
 * @param syntax_styler - the `SyntaxStyler` instance to modify
 * @param attr_name - the name of the attribute that contains the inlined language, treated as case insensitive
 * @param lang - the language key
 */
export const grammar_markup_add_attribute = (
	syntax_styler: SyntaxStyler,
	attr_name: string,
	lang: string,
): void => {
	// After normalization, grammar.tag is an array of SyntaxGrammarToken
	const markup_grammar = syntax_styler.get_lang('markup');
	const tag_patterns = markup_grammar.tag;
	const tag_inside = tag_patterns![0]!.inside!;

	tag_inside.special_attr!.push({
		pattern: RegExp(
			/(^|["'\s])/.source +
				'(?:' +
				attr_name +
				')' +
				/\s*=\s*(?:"[^"]*"|'[^']*'|[^\s'">=]+(?=[\s>]))/.source,
			'i',
		),
		lookbehind: true,
		greedy: false,
		alias: [],
		inside: {
			attr_name: [
				{
					pattern: /^[^\s=]+/,
					lookbehind: false,
					greedy: false,
					alias: [],
					inside: null,
				},
			],
			attr_value: [
				{
					pattern: /=[\s\S]+/,
					lookbehind: false,
					greedy: false,
					alias: [],
					inside: {
						value: [
							{
								pattern: /(^=\s*(["']|(?!["'])))\S[\s\S]*(?=\2$)/,
								lookbehind: true,
								greedy: false,
								alias: [lang, 'lang_' + lang], // TODO remove this alias?
								inside: syntax_styler.get_lang(lang),
							},
						],
						punctuation: [
							{
								pattern: /^=/,
								lookbehind: false,
								greedy: false,
								alias: ['attr_equals'],
								inside: null,
							},
							{
								pattern: /"|'/,
								lookbehind: false,
								greedy: false,
								alias: ['attr_quote'],
								inside: null,
							},
						],
					} as SyntaxGrammar,
				},
			],
		} as SyntaxGrammar,
	} satisfies SyntaxGrammarToken);
};
