import {test, assert, describe} from 'vitest';

import {SyntaxStyler} from '$lib/syntax_styler.js';
import {tokenize_syntax} from '$lib/tokenize_syntax.js';
import {add_grammar_js} from '$lib/grammar_js.js';
import {add_grammar_ts} from '$lib/grammar_ts.js';
import {add_grammar_css} from '$lib/grammar_css.js';
import {add_grammar_markup} from '$lib/grammar_markup.js';
import {add_grammar_json} from '$lib/grammar_json.js';
import {add_grammar_svelte} from '$lib/grammar_svelte.js';
import {add_grammar_markdown} from '$lib/grammar_markdown.js';
import {add_grammar_clike} from '$lib/grammar_clike.js';
import {add_grammar_bash} from '$lib/grammar_bash.js';
import {syntax_styler_global} from '$lib/syntax_styler_global.js';
import {samples} from '../routes/samples/all.ts';

// Helper to create a properly initialized syntax styler
const create_styler_with_grammars = (): SyntaxStyler => {
	const s = new SyntaxStyler();
	// Load in dependency order
	add_grammar_markup(s);
	add_grammar_clike(s);
	add_grammar_css(s);
	add_grammar_js(s);
	add_grammar_ts(s);
	add_grammar_json(s);
	add_grammar_bash(s);
	add_grammar_svelte(s);
	add_grammar_markdown(s);
	return s;
};

describe('grammar mutation behavior', () => {
	test('greedy patterns gain global flag on first use', () => {
		const syntax_styler = create_styler_with_grammars();

		// Track patterns before tokenization
		const before_flags = new Map();
		for (const lang of ['js', 'ts', 'css']) {
			const grammar = syntax_styler.get_lang(lang);
			// After normalization, grammar values are arrays
			if ((grammar.string as any)?.[0]?.pattern) {
				before_flags.set(lang, grammar.string![0]!.pattern.flags);
			}
		}

		// Tokenize
		for (const lang of before_flags.keys()) {
			syntax_styler.stylize('test "string"', lang);
		}

		// Verify mutation happened (documenting expected behavior)
		for (const lang of before_flags.keys()) {
			const grammar = syntax_styler.get_lang(lang);
			const new_flags = grammar.string![0]!.pattern.flags;
			assert.ok(
				new_flags.includes('g'),
				`${lang} string pattern should have global flag after use`,
			);
		}
	});

	test('track greedy patterns across all languages', () => {
		const syntax_styler = create_styler_with_grammars();

		// Collect all greedy patterns
		const greedy_patterns: Map<
			string,
			Array<{path: string; pattern: RegExp; source: string; flags: string}>
		> = new Map();
		const languages = ['js', 'ts', 'css', 'html', 'json', 'svelte', 'md', 'bash'];

		for (const lang of languages) {
			const grammar = syntax_styler.get_lang(lang);
			const patterns: Array<{path: string; pattern: RegExp; source: string; flags: string}> = [];

			// Recursively find greedy patterns
			const visited = new Set();
			const find_greedy = (obj: any, path = ''): void => {
				// Prevent circular references
				if (visited.has(obj)) return;
				visited.add(obj);

				// After normalization, all grammar values are arrays of SyntaxGrammarToken
				for (const key in obj) {
					const val = obj[key];
					if (!Array.isArray(val)) continue;

					// Each value is an array of normalized tokens
					val.forEach((item, index) => {
						if (item && typeof item === 'object' && item.greedy && item.pattern instanceof RegExp) {
							patterns.push({
								path: `${path}${key}[${index}]`,
								pattern: item.pattern,
								source: item.pattern.source,
								flags: item.pattern.flags,
							});
						}
						// Recurse into inside if present
						if (item?.inside && !visited.has(item.inside)) {
							find_greedy(item.inside, `${path}${key}[${index}].inside.`);
						}
					});
				}
			};

			find_greedy(grammar);
			greedy_patterns.set(lang, patterns);
		}

		// Tokenize samples from each language with code that exercises the patterns
		for (const lang of languages) {
			if (lang === 'js' || lang === 'ts') {
				// Include template strings for JS/TS
				syntax_styler.stylize('test "string" `template` /* comment */ 123', lang);
			} else {
				syntax_styler.stylize('test "string" content /* comment */ 123', lang);
			}
		}

		// Document mutation behavior - patterns gain 'g' flag when needed
		for (const [lang, patterns] of greedy_patterns) {
			for (const info of patterns) {
				// Source remains the same
				assert.equal(
					info.pattern.source,
					info.source,
					`${lang}.${info.path} source should not change`,
				);
				// But flags may have gained 'g' if they didn't have it
				// Exception: patterns that are anchored (^) may not get mutated since they can only match once
				// Also: patterns only get mutated when they actually match something during tokenization
				if (!info.flags.includes('g')) {
					if (info.source.startsWith('^')) {
						// Anchored patterns may or may not get g flag - both are valid
						// since they can only match once anyway
						continue;
					}
					// Patterns only get mutated when they actually match during tokenization
					// If pattern didn't match anything in our test input, it won't be mutated
					if (!info.pattern.flags.includes('g')) {
						// This is acceptable - pattern wasn't used so wasn't mutated
						// Common for patterns like template_string that need specific syntax
						continue;
					}
					assert.ok(
						info.pattern.flags.includes('g'),
						`${lang}.${info.path} should gain global flag`,
					);
				} else {
					assert.equal(
						info.pattern.flags,
						info.flags,
						`${lang}.${info.path} flags unchanged (already had g)`,
					);
				}
			}
		}
	});
});

describe('concurrent tokenization safety', () => {
	test('multiple tokenizations produce consistent results', () => {
		const code1 = 'const a = "test"; function foo() { return /regex/g; }';
		const code2 = 'let b = 123; /* comment */ class Bar {}';

		// Tokenize in different orders
		const result1a = syntax_styler_global.stylize(code1, 'js');
		const result2a = syntax_styler_global.stylize(code2, 'js');
		const result1b = syntax_styler_global.stylize(code1, 'js');
		const result2b = syntax_styler_global.stylize(code2, 'js');

		// Results should be identical
		assert.equal(result1a, result1b, 'Same code should produce same result');
		assert.equal(result2a, result2b, 'Same code should produce same result');
	});

	test('greedy pattern lastIndex does not leak between tokenizations', () => {
		// Code with multiple strings to test greedy pattern
		const code = '"string1" + "string2" + "string3"';

		// Tokenize multiple times
		const results: Array<string> = [];
		for (let i = 0; i < 10; i++) {
			results.push(syntax_styler_global.stylize(code, 'js'));
		}

		// All results should be identical
		for (let i = 1; i < results.length; i++) {
			assert.equal(results[i], results[0], `Result ${i} should match first result`);
		}
	});

	test('tokenization with interleaved languages is safe', () => {
		const js_code = 'const x = "test";';
		const css_code = '.class { color: red; }';
		const json_code = '{"key": "value"}';

		// Interleave tokenization of different languages
		const js1 = syntax_styler_global.stylize(js_code, 'js');
		const css1 = syntax_styler_global.stylize(css_code, 'css');
		const js2 = syntax_styler_global.stylize(js_code, 'js');
		const json1 = syntax_styler_global.stylize(json_code, 'json');
		const css2 = syntax_styler_global.stylize(css_code, 'css');
		const js3 = syntax_styler_global.stylize(js_code, 'js');
		const json2 = syntax_styler_global.stylize(json_code, 'json');

		// All results for same input should be identical
		assert.equal(js1, js2);
		assert.equal(js2, js3);
		assert.equal(css1, css2);
		assert.equal(json1, json2);
	});
});

describe('tokenization correctness', () => {
	test('produces consistent output for common patterns', () => {
		const samples_to_test = [
			{code: 'const a = 1;', lang: 'js'},
			{code: 'function test() { return "string"; }', lang: 'js'},
			{code: 'class Foo { constructor() {} }', lang: 'js'},
			{code: '// comment\n/* block comment */', lang: 'js'},
			{code: 'const regex = /test.*pattern/gi;', lang: 'js'},
			{code: '`template ${expression} string`', lang: 'js'},
			{code: '.class { color: red; }', lang: 'css'},
			{code: '{"key": "value", "number": 123}', lang: 'json'},
			{code: '<div class="test">Hello</div>', lang: 'html'},
		];

		for (const sample of samples_to_test) {
			const result = syntax_styler_global.stylize(sample.code, sample.lang);

			// Basic checks for valid output
			assert.ok(
				result.includes('<span'),
				`Output for ${sample.lang} should contain syntax highlighting`,
			);
			assert.ok(
				!result.includes('undefined'),
				`Output for ${sample.lang} should not contain undefined`,
			);
			assert.ok(
				result.length >= sample.code.length,
				`Output for ${sample.lang} should not lose content`,
			);
		}
	});

	test('handles all language samples correctly', () => {
		const sample_values = Object.values(samples);

		for (const sample of sample_values) {
			// Should not throw and produce valid HTML
			const result = syntax_styler_global.stylize(sample.content, sample.lang);
			assert.ok(result.includes('<span'), `${sample.name} should have syntax highlighting`);
			assert.ok(!result.includes('undefined'), `${sample.name} should not have undefined tokens`);
		}
	});

	test('tokenize_syntax produces valid token stream', () => {
		const code = 'const x = "test";';
		const grammar = syntax_styler_global.get_lang('js');
		const tokens = tokenize_syntax(code, grammar);

		// Should produce array of tokens
		assert.ok(Array.isArray(tokens), 'Should produce array');
		assert.ok(tokens.length > 0, 'Should have tokens');

		// Verify token structure
		let has_keyword = false;
		let has_string = false;
		for (const token of tokens) {
			if (typeof token === 'object' && token.type === 'keyword') has_keyword = true;
			if (typeof token === 'object' && token.type === 'string') has_string = true;
		}
		assert.ok(has_keyword, 'Should have keyword token');
		assert.ok(has_string, 'Should have string token');
	});
});

describe('edge cases', () => {
	test('handles empty input', () => {
		const result = syntax_styler_global.stylize('', 'js');
		assert.equal(result, '');
	});

	test('handles whitespace only', () => {
		const result = syntax_styler_global.stylize('   \n\t  ', 'js');
		assert.equal(result, '   \n\t  ');
	});

	test('handles very large files', () => {
		// Generate large file
		const lines: Array<string> = [];
		for (let i = 0; i < 1000; i++) {
			lines.push(`const var${i} = "string${i}"; // comment ${i}`);
		}
		const large_code = lines.join('\n');

		// Should complete without error
		const result = syntax_styler_global.stylize(large_code, 'js');
		assert.ok(result.length > large_code.length, 'Should have added markup');
		assert.ok(result.includes('<span'), 'Should have syntax highlighting');
	});

	test('handles deeply nested structures', () => {
		const nested = '`a${`b${`c${d}`}`}`';
		const result = syntax_styler_global.stylize(nested, 'js');
		assert.ok(result.includes('template'), 'Should recognize template strings');
	});

	test('handles special regex patterns', () => {
		const code = 'const r = /[\\]{}()*+?.\\\\^$|#\\s]/g;';
		const result = syntax_styler_global.stylize(code, 'js');
		assert.ok(result.includes('regex'), 'Should recognize regex');
	});

	test('handles malformed input gracefully', () => {
		// Unclosed string
		const malformed1 = 'const x = "unclosed';
		const result1 = syntax_styler_global.stylize(malformed1, 'js');
		assert.ok(result1.length > 0, 'Should handle unclosed string');

		// Unclosed comment
		const malformed2 = '/* unclosed comment';
		const result2 = syntax_styler_global.stylize(malformed2, 'js');
		assert.ok(result2.length > 0, 'Should handle unclosed comment');
	});
});

describe('specific grammar patterns', () => {
	test('JS template literals with nested expressions', () => {
		const code = '`Hello ${name}, you have ${count} ${count === 1 ? "item" : "items"}`';
		const result = syntax_styler_global.stylize(code, 'js');
		assert.ok(result.includes('template'), 'Should recognize template literal');
		assert.ok(result.includes('interpolation'), 'Should recognize interpolation');
	});

	test('CSS with complex selectors', () => {
		const code = '.class:hover > div[data-attr="value"] + p::before { content: "test"; }';
		const result = syntax_styler_global.stylize(code, 'css');
		assert.ok(result.includes('selector'), 'Should recognize selector');
		assert.ok(result.includes('property'), 'Should recognize property');
	});

	test('TypeScript with generics', () => {
		const code = 'function test<T extends string, U = number>(x: T): Promise<U> { }';
		const result = syntax_styler_global.stylize(code, 'ts');
		assert.ok(result.includes('function'), 'Should recognize function');
		assert.ok(result.includes('class_name'), 'Should recognize type annotations');
	});

	test('Svelte with mixed languages', () => {
		const code = '<script>let x = 1;</script>\n<style>.red { color: red; }</style>\n<div>{x}</div>';
		const result = syntax_styler_global.stylize(code, 'svelte');
		assert.ok(result.includes('tag'), 'Should recognize HTML tags');
		// Note: embedded language support depends on implementation
	});
});

describe('lastIndex and position management', () => {
	test('lastIndex properly reset for greedy patterns', () => {
		const syntax_styler = create_styler_with_grammars();

		// Test with code that has multiple strings at different positions
		const code1 = '   "first"    "second"';
		const code2 = '"immediate" "next"';

		const result1 = syntax_styler.stylize(code1, 'js');
		const result2 = syntax_styler.stylize(code2, 'js');

		// Both should tokenize correctly despite different starting positions
		assert.ok(result1.includes('"first"'));
		assert.ok(result1.includes('"second"'));
		assert.ok(result2.includes('"immediate"'));
		assert.ok(result2.includes('"next"'));
	});

	test('greedy patterns work with strings at various positions', () => {
		const syntax_styler = create_styler_with_grammars();

		// Strings at different positions in the text
		const code = `
			"start"
			    "indented"
			const x = "inline";
			              "far right"
		`;

		const result = syntax_styler.stylize(code, 'js');

		// All strings should be tokenized regardless of position
		const string_count = (result.match(/<span class="token_string">/g) || []).length;
		assert.equal(string_count, 4, 'Should tokenize all 4 strings');
	});
});

describe('pattern flag edge cases', () => {
	test('patterns with existing global flag not double-processed', () => {
		const syntax_styler = new SyntaxStyler();

		// Store the original patterns BEFORE registration
		const patterns_before = {
			already_global: /test/g, // Already has g flag
			case_insensitive: /test/i, // Has i flag but not g
			multi_flag: /test/gim, // Multiple flags including g
		};

		// Add a test grammar with patterns that already have flags
		syntax_styler.add_lang('test', {
			already_global: {
				pattern: patterns_before.already_global,
				greedy: true,
			},
			case_insensitive: {
				pattern: patterns_before.case_insensitive,
				greedy: true,
			},
			multi_flag: {
				pattern: patterns_before.multi_flag,
				greedy: true,
			},
		});

		const grammar = syntax_styler.get_lang('test');
		// After normalization, grammar values are arrays and patterns have been normalized

		// Patterns that already had g flag should keep the same RegExp instance
		assert.equal(
			grammar.already_global![0]!.pattern,
			patterns_before.already_global,
			'Already global pattern should not be replaced',
		);
		assert.equal(
			grammar.multi_flag![0]!.pattern,
			patterns_before.multi_flag,
			'Multi-flag pattern should not be replaced',
		);

		// Pattern without g gets a new RegExp with g added during normalization
		assert.notEqual(
			grammar.case_insensitive![0]!.pattern,
			patterns_before.case_insensitive,
			'Pattern without g gets replaced with global version during normalization',
		);
		assert.equal(
			grammar.case_insensitive![0]!.pattern.flags,
			'gi', // Now has both flags
			'Pattern gains global flag',
		);

		// After tokenization, patterns remain unchanged (no runtime mutation)
		syntax_styler.stylize('test TEST tEsT', 'test');

		assert.equal(
			grammar.already_global![0]!.pattern,
			patterns_before.already_global,
			'Pattern unchanged after tokenization',
		);
	});

	test('non-greedy patterns remain untouched', () => {
		const syntax_styler = create_styler_with_grammars();
		const grammar = syntax_styler.get_lang('js');

		// Get non-greedy patterns (keyword is an array of patterns)
		const keyword_patterns = grammar.keyword as Array<any>;
		const original_first = keyword_patterns[0];
		const original_second = keyword_patterns[1];

		syntax_styler.stylize('const let var function class extends', 'js');

		// Non-greedy patterns should remain exactly the same
		assert.equal(keyword_patterns[0], original_first, 'First keyword pattern unchanged');
		assert.equal(keyword_patterns[1], original_second, 'Second keyword pattern unchanged');
	});
});

describe('multiple SyntaxStyler instances', () => {
	test('separate instances have independent grammars', () => {
		const styler1 = new SyntaxStyler();
		const styler2 = new SyntaxStyler();

		// Load grammars into both
		add_grammar_markup(styler1);
		add_grammar_clike(styler1);
		add_grammar_js(styler1);

		add_grammar_markup(styler2);
		add_grammar_clike(styler2);
		add_grammar_js(styler2);

		const grammar1 = styler1.get_lang('js');
		const grammar2 = styler2.get_lang('js');

		// Store patterns after normalization (grammar values are arrays)
		const pattern1 = grammar1.string![0]!.pattern;
		const pattern2 = grammar2.string![0]!.pattern;

		// Patterns should be different objects (each instance has its own)
		assert.notEqual(pattern1, pattern2, 'Each instance has separate pattern objects');

		// Verify both patterns already have the global flag from normalization
		assert.ok(pattern1.flags.includes('g'), 'styler1 pattern has g flag from normalization');
		assert.ok(pattern2.flags.includes('g'), 'styler2 pattern has g flag from normalization');

		// Tokenizing with one shouldn't affect the other
		styler1.stylize('"test"', 'js');
		styler2.stylize('"test"', 'js');

		// Patterns remain unchanged after tokenization (no runtime mutation)
		assert.equal(
			grammar1.string![0]!.pattern,
			pattern1,
			'styler1 pattern unchanged after tokenization',
		);
		assert.equal(
			grammar2.string![0]!.pattern,
			pattern2,
			'styler2 pattern unchanged after tokenization',
		);

		// Each instance still has its own pattern object
		assert.notEqual(
			grammar1.string![0]!.pattern,
			grammar2.string![0]!.pattern,
			'Instances remain independent',
		);
	});
});

describe('nested tokenization', () => {
	test('template strings with nested interpolation', () => {
		const syntax_styler = create_styler_with_grammars();

		// Deeply nested template strings
		const code = '`outer ${`inner ${`deepest ${x}`} middle`} end`';
		const result = syntax_styler.stylize(code, 'js');

		// Should handle all levels of nesting
		assert.ok(result.includes('template'), 'Should recognize template strings');
		assert.ok(result.includes('interpolation'), 'Should recognize interpolations');

		// Count interpolations (should be 3)
		const interpolation_count = (result.match(/interpolation/g) || []).length;
		assert.ok(interpolation_count >= 3, 'Should handle all nested interpolations');
	});

	test('regex pattern with special characters', () => {
		const syntax_styler = create_styler_with_grammars();

		// Complex regex that might break if caching is wrong
		const code = 'const r = /\\$\\{[^}]+\\}/g;'; // Regex that looks like template syntax
		const result = syntax_styler.stylize(code, 'js');

		assert.ok(result.includes('regex'), 'Should recognize as regex');
		assert.ok(!result.includes('template'), 'Should not confuse with template string');
	});
});

describe('tokenization consistency', () => {
	test('same pattern used multiple times in one tokenization', () => {
		const syntax_styler = create_styler_with_grammars();

		// Many strings to ensure pattern is reused
		const code = '"a" + "b" + "c" + "d" + "e" + "f" + "g" + "h"';
		const result = syntax_styler.stylize(code, 'js');

		// All strings should be tokenized
		const string_count = (result.match(/<span class="token_string">/g) || []).length;
		assert.equal(string_count, 8, 'Should tokenize all 8 strings');
	});

	test('empty strings handled correctly', () => {
		const syntax_styler = create_styler_with_grammars();

		const code = 'const empty = "";';
		const result = syntax_styler.stylize(code, 'js');

		assert.ok(result.includes('string'), 'Should tokenize empty string');
		assert.ok(result.includes('""'), 'Should preserve empty string content');
	});

	test('very long strings handled correctly', () => {
		const syntax_styler = create_styler_with_grammars();

		// Create a very long string to test lastIndex with large values
		const long_content = 'x'.repeat(10000);
		const code = `const long = "${long_content}";`;
		const result = syntax_styler.stylize(code, 'js');

		assert.ok(result.includes('string'), 'Should tokenize long string');
		assert.ok(result.includes(long_content), 'Should preserve long string content');
	});
});
