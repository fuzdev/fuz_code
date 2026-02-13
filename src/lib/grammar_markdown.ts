import type {
	AddSyntaxGrammar,
	SyntaxGrammarTokenRaw,
	SyntaxGrammarValueRaw,
	SyntaxStyler,
} from './syntax_styler.js';

interface LangDefinition {
	aliases: Array<string>;
	id: string;
}

interface FenceType {
	backticks: string;
	suffix: string;
}

/**
 * Helper to create fenced code block pattern for a language
 */
const create_fence_pattern = (
	backticks: string,
	aliases: Array<string>,
	lang_id: string,
	syntax_styler: SyntaxStyler,
): SyntaxGrammarTokenRaw => {
	const aliases_pattern = aliases.join('|');
	const pattern = new RegExp(
		`^${backticks}(?:${aliases_pattern})[^\\n\\r]*(?:\\r?\\n|\\r)[\\s\\S]*?^${backticks}$`,
		'm',
	);
	const code_fence_pattern = new RegExp(`^${backticks}[^\\n\\r]*|^${backticks}$`, 'm');

	return {
		pattern,
		greedy: true,
		inside: {
			code_fence: {
				pattern: code_fence_pattern,
				alias: 'punctuation',
			},
			[`lang_${lang_id}`]: {
				pattern: /[\s\S]+/,
				inside: syntax_styler.get_lang(lang_id),
			},
		},
	};
};

/**
 * Helper to create catch-all fence pattern (unknown languages)
 */
const create_catchall_fence = (backticks: string): SyntaxGrammarTokenRaw => {
	const pattern = new RegExp(`^${backticks}[^\\n\\r]*(?:\\r?\\n|\\r)[\\s\\S]*?^${backticks}$`, 'm');
	const code_fence_pattern = new RegExp(`^${backticks}[^\\n\\r]*|^${backticks}$`, 'm');

	return {
		pattern,
		greedy: true,
		inside: {
			code_fence: {
				pattern: code_fence_pattern,
				alias: 'punctuation',
			},
		},
	};
};

/**
 * Helper to create md self-reference placeholder pattern
 */
const create_md_placeholder = (backticks: string): SyntaxGrammarTokenRaw => {
	const pattern = new RegExp(
		`^${backticks}(?:md|markdown)[^\\n\\r]*(?:\\r?\\n|\\r)[\\s\\S]*?^${backticks}$`,
		'm',
	);
	const code_fence_pattern = new RegExp(`^${backticks}[^\\n\\r]*|^${backticks}$`, 'm');

	return {
		pattern,
		greedy: true,
		inside: {
			code_fence: {
				pattern: code_fence_pattern,
				alias: 'punctuation',
			},
			// lang_md will be added after registration
		},
	};
};

/**
 * Markdown grammar extending markup.
 * Supports: headings, fenced code blocks (3/4/5 backticks with nesting), lists, blockquotes,
 * bold, italic, strikethrough, inline code, and links.
 */
export const add_grammar_markdown: AddSyntaxGrammar = (syntax_styler) => {
	// Language definitions with aliases
	const langs: Array<LangDefinition> = [
		{aliases: ['ts', 'typescript'], id: 'ts'},
		{aliases: ['js', 'javascript'], id: 'js'},
		{aliases: ['css'], id: 'css'},
		{aliases: ['html', 'markup'], id: 'markup'},
		{aliases: ['json'], id: 'json'},
		{aliases: ['svelte'], id: 'svelte'},
		{aliases: ['bash', 'sh', 'shell'], id: 'bash'},
	];

	// Fence types: higher counts first (for proper precedence in tokenization)
	const fence_types: Array<FenceType> = [
		{backticks: '`````', suffix: '5tick'},
		{backticks: '````', suffix: '4tick'},
		{backticks: '```', suffix: ''},
	];

	// Build grammar dynamically
	const grammar: Record<string, SyntaxGrammarValueRaw> = {};
	const md_self_refs: Array<string> = []; // Track md patterns for later self-reference

	// Generate fence patterns for each type
	for (const {backticks, suffix} of fence_types) {
		const token_suffix = suffix ? `_${suffix}` : '';

		// md pattern (self-reference added after registration)
		const md_key = `fenced_code${token_suffix}_md`;
		grammar[md_key] = create_md_placeholder(backticks);
		md_self_refs.push(md_key);

		// Other language patterns (use first alias as token name for backward compatibility)
		for (const {aliases, id} of langs) {
			const token_name = aliases[0]; // Use first alias for token name
			grammar[`fenced_code${token_suffix}_${token_name}`] = create_fence_pattern(
				backticks,
				aliases,
				id,
				syntax_styler,
			);
		}

		// Catch-all fence
		grammar[`fenced_code${token_suffix}`] = create_catchall_fence(backticks);
	}

	// Register markdown grammar first, then add self-references for md fences
	const grammar_md = syntax_styler.add_extended_lang(
		'markup',
		'md',
		{
			...grammar,

			// Headings (# through ######)
			heading: {
				pattern: /^#{1,6}\s+.+$/m,
				inside: {
					punctuation: {
						pattern: /^#{1,6}/,
						alias: 'heading_punctuation',
					},
				},
			},

			// Blockquotes (> at line start)
			blockquote: {
				pattern: /^>\s*.+$/m,
				inside: {
					punctuation: {
						pattern: /^>/,
						alias: 'blockquote_punctuation',
					},
				},
			},

			// Lists (* or - with any preceding whitespace)
			list: {
				pattern: /^\s*[-*]\s+.+$/m,
				inside: {
					punctuation: /^\s*[-*]/,
				},
			},

			// Inline elements

			// Links [text](url)
			link: {
				pattern: /\[[^[\]\n\r]+\]\([^)\n\r]+\)/,
				inside: {
					link_text_wrapper: {
						pattern: /^\[[^\]]+\]/,
						inside: {
							punctuation: {
								pattern: /^\[|\]$/,
								alias: 'link_punctuation',
							},
							link_text: /[^[\]]+/,
						},
					},
					url_wrapper: {
						pattern: /\([^)]+\)$/,
						inside: {
							punctuation: {
								pattern: /^\(|\)$/,
								alias: 'link_punctuation',
							},
							url: /[^()]+/,
						},
					},
				},
			},

			// Inline code `text`
			inline_code: {
				pattern: /`[^`\n\r]+`/,
				alias: 'code',
				inside: {
					punctuation: {
						pattern: /^`|`$/,
						alias: 'code_punctuation',
					},
					content: /[^`]+/,
				},
			},

			// Bold **text** or __text__
			bold: [
				{
					// **text** - no asterisks inside
					pattern: /\*\*[^\s*][^*]*[^\s*]\*\*|\*\*[^\s*]\*\*/,
					inside: {
						punctuation: /^\*\*|\*\*$/,
					},
				},
				{
					// __text__ - at word boundaries, no underscores inside
					pattern: /\b__[^\s_][^_]*[^\s_]__\b|\b__[^\s_]__\b/,
					inside: {
						punctuation: /^__|__$/,
					},
				},
			],

			// Italic *text* or _text_
			italic: [
				{
					// *text* - no asterisks inside
					pattern: /\*[^\s*][^*]*[^\s*]\*|\*[^\s*]\*/,
					inside: {
						punctuation: /^\*|\*$/,
					},
				},
				{
					// _text_ - at word boundaries, no underscores inside
					pattern: /\b_[^\s_][^_]*[^\s_]_\b|\b_[^\s_]_\b/,
					inside: {
						punctuation: /^_|_$/,
					},
				},
			],

			// Strikethrough ~~text~~
			strikethrough: {
				pattern: /~~[^\s~][^~]*[^\s~]~~|~~[^\s~]~~/,
				inside: {
					punctuation: /^~~|~~$/,
				},
			},
		},
		['markdown'],
	);

	// Add self-reference for markdown-in-markdown (all fence types)
	// This must be done after registration to avoid circular dependency
	const lang_md_inside = {
		pattern: /[\s\S]+/,
		inside: syntax_styler.get_lang('md'),
	};
	for (const key of md_self_refs) {
		// After normalization, grammar values are arrays of SyntaxGrammarToken
		// We need to add lang_md as a normalized array
		const patterns = grammar_md[key]!;
		// Manually normalize the lang_md pattern we're adding
		const lang_md_token = {
			pattern: lang_md_inside.pattern,
			lookbehind: false,
			greedy: false,
			alias: [],
			inside: lang_md_inside.inside,
		};
		patterns[0]!.inside!.lang_md = [lang_md_token];
	}
};
