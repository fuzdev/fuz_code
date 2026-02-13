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
	// Shared inside grammar for command substitution — `rest` wired after construction
	const command_sub_inside: SyntaxGrammarRaw = {
		punctuation: /^\$\(|\)$/,
	};

	// Reusable balanced-paren pattern for $(...) — handles 2 levels of inner () nesting,
	// which supports up to 3 levels of $() command substitution (4+ is vanishingly rare)
	const command_sub_pattern = /\$\((?:[^()]*|\((?:[^()]*|\([^()]*\))*\))*\)/;

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

		// Here-documents — must precede string to avoid delimiter consumption
		heredoc: [
			// Quoted delimiter (<<'DELIM' or <<"DELIM") — no expansion
			{
				pattern: /(^|[^<])<<-?\s*(?:['"])(\w+)(?:['"])[\t ]*\n[\s\S]*?\n[\t ]*\2(?=\s*$)/m,
				lookbehind: true,
				greedy: true,
				alias: 'string',
				inside: {
					// No `m` flag — `^` matches start-of-string (opening) and `$` matches
					// end-of-string (closing), so single-word content lines can't false-positive
					heredoc_delimiter: [
						{
							pattern: /^<<-?\s*(?:['"])\w+(?:['"])/,
							alias: 'punctuation',
						},
						{
							pattern: /\w+$/,
							alias: 'punctuation',
						},
					],
				} as SyntaxGrammarRaw,
			},
			// Unquoted delimiter (<<DELIM) — with variable/command expansion
			{
				pattern: /(^|[^<])<<-?\s*(\w+)[\t ]*\n[\s\S]*?\n[\t ]*\2(?=\s*$)/m,
				lookbehind: true,
				greedy: true,
				alias: 'string',
				inside: {
					heredoc_delimiter: [
						{
							pattern: /^<<-?\s*\w+/,
							alias: 'punctuation',
						},
						{
							pattern: /\w+$/,
							alias: 'punctuation',
						},
					],
					command_substitution: {
						pattern: command_sub_pattern,
						greedy: true,
						inside: command_sub_inside,
					},
					variable: /\$\{[^}]+\}|\$(?:\w+|[!@#$*?\-0-9])/,
				} as SyntaxGrammarRaw,
			},
		],

		// Strings — three variants
		string: [
			// Double-quoted: supports escape sequences, variable interpolation, command substitution
			{
				pattern:
					/(^|[^\\](?:\\\\)*)"(?:\\[\s\S]|\$\((?:[^()]*|\((?:[^()]*|\([^()]*\))*\))*\)|\$(?!\()|[^"\\$])*"/,
				lookbehind: true,
				greedy: true,
				inside: {
					command_substitution: {
						pattern: command_sub_pattern,
						greedy: true,
						inside: command_sub_inside,
					},
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

		// Command substitution $(...) — before variable since both start with $
		command_substitution: {
			pattern: command_sub_pattern,
			greedy: true,
			inside: command_sub_inside,
		},

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
		operator: /\|\||&&|;;|&>>?|<<<?|>>?|=~|[!=]=|[<>]|[|&!]/,

		// Punctuation
		punctuation: /[{}[\]();,]/,
	} satisfies SyntaxGrammarRaw;

	// Wire circular reference so command substitutions get full bash highlighting
	command_sub_inside.rest = grammar_bash;

	syntax_styler.add_lang('bash', grammar_bash, ['sh', 'shell']);
};
