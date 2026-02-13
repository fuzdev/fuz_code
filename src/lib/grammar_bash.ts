import type {AddSyntaxGrammar, SyntaxGrammarRaw} from './syntax_styler.js';

/**
 * Bash/shell grammar for syntax highlighting.
 *
 * Standalone grammar (no base extension). Covers core bash syntax:
 * comments, strings, variables, functions, keywords, builtins,
 * operators, and redirections.
 *
 * Based on Prism (https://github.com/PrismJS/prism)
 * by Lea Verou (https://lea.verou.me/)
 *
 * MIT license
 *
 * @see LICENSE
 */
export const add_grammar_bash: AddSyntaxGrammar = (syntax_styler) => {
	const grammar_bash = {
		// Shebang at file start — matched before general comments
		shebang: {
			pattern: /^#!.*/,
			alias: 'comment',
		},

		// Line comments — require whitespace or start-of-string before #
		comment: {
			pattern: /(^|\s)#.*/,
			lookbehind: true,
			greedy: true,
		},

		// Strings — three variants
		string: [
			// Double-quoted: supports escape sequences, variable interpolation
			{
				pattern: /(^|[^\\](?:\\\\)*)"(?:\\[\s\S]|[^"\\])*"/,
				lookbehind: true,
				greedy: true,
				inside: {
					variable: /\$\{[^}]+\}|\$(?:\w+|[!@#$*?\-0-9])/,
				} as SyntaxGrammarRaw,
			},
			// Single-quoted: completely literal
			{
				pattern: /(^|[^\\](?:\\\\)*)'[^']*'/,
				lookbehind: true,
				greedy: true,
			},
			// ANSI-C quoting: $'...' with C-style escapes
			{
				pattern: /\$'(?:[^'\\]|\\[\s\S])*'/,
				greedy: true,
			},
		],

		// Variables and parameter expansion
		variable: /\$\{[^}]+\}|\$(?:\w+|[!@#$*?\-0-9])/,

		// Function definitions — both styles
		function: [
			// function fname style
			{
				pattern: /(\bfunction\s+)\w+/,
				lookbehind: true,
			},
			// fname() style
			{
				pattern: /\b\w+(?=\s*\(\s*\))/,
			},
		],

		// Shell keywords
		keyword:
			/\b(?:if|then|else|elif|fi|for|while|until|do|done|case|esac|in|select|function|return|local|export|declare|typeset|readonly|unset|set|shift|trap|break|continue|coproc|time)\b/,

		// Builtin commands
		builtin:
			/\b(?:echo|printf|cd|pwd|read|test|source|eval|exec|exit|getopts|hash|type|ulimit|umask|wait|kill|jobs|bg|fg|disown|alias|unalias|command|shopt)\b/,

		// Boolean commands
		boolean: /\b(?:true|false)\b/,

		// File descriptors before redirections — must precede number
		file_descriptor: {
			pattern: /\B&\d\b|\b\d(?=>>?|<)/,
			alias: 'important',
		},

		// Numbers: hex, octal, base-N, decimal
		number: /\b(?:0x[\da-fA-F]+|0[0-7]+|\d+#[\da-zA-Z]+|\d+)\b/,

		// Operators — longest first
		operator: /\|\||&&|;;|&>>?|<<<?|>>?|[!=]=|[<>]|[|&!]/,

		// Punctuation
		punctuation: /[{}[\]();,]/,
	} satisfies SyntaxGrammarRaw;

	syntax_styler.add_lang('bash', grammar_bash, ['sh', 'shell']);
};
