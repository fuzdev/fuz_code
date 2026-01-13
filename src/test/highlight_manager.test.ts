import {test, assert, describe, beforeEach, afterEach} from 'vitest';
import {HighlightManager, supports_css_highlight_api} from '$lib/highlight_manager.js';
import {SyntaxToken, type SyntaxTokenStream} from '$lib/syntax_token.js';
import {
	setup_mock_highlight_api,
	restore_globals,
	create_code_element,
	create_code_element_with_comment,
	type SavedGlobals,
} from './highlight_test_helpers.js';

/**
 * Test suite for HighlightManager
 *
 * Tests organized by domain:
 * - Initialization and API detection
 * - DOM element handling
 * - Range creation and positioning
 * - Lifecycle management (clear/destroy)
 * - Edge cases and error conditions
 */

let saved_globals: SavedGlobals;

beforeEach(() => {
	saved_globals = setup_mock_highlight_api();
});

afterEach(() => {
	restore_globals(saved_globals);
});

describe('API detection', () => {
	test('supports_css_highlight_api returns true when API is available', () => {
		assert.ok(supports_css_highlight_api());
	});

	test('supports_css_highlight_api returns false when CSS is undefined', () => {
		const saved_css = (globalThis as any).CSS;
		delete (globalThis as any).CSS;

		assert.equal(supports_css_highlight_api(), false);

		(globalThis as any).CSS = saved_css;
	});

	test('supports_css_highlight_api returns false when CSS.highlights is undefined', () => {
		const saved_highlights = (globalThis as any).CSS.highlights;
		delete (globalThis as any).CSS.highlights;

		assert.equal(supports_css_highlight_api(), false);

		(globalThis as any).CSS.highlights = saved_highlights;
	});

	test('supports_css_highlight_api returns false when Highlight constructor is undefined', () => {
		const saved_highlight = (globalThis as any).Highlight;
		delete (globalThis as any).Highlight;

		assert.equal(supports_css_highlight_api(), false);

		(globalThis as any).Highlight = saved_highlight;
	});
});

describe('initialization', () => {
	test('constructor throws if CSS Highlight API is not supported', () => {
		const saved_css = (globalThis as any).CSS;
		delete (globalThis as any).CSS;

		assert.throws(() => new HighlightManager(), /CSS Highlights API not supported/);

		(globalThis as any).CSS = saved_css;
	});

	test('constructor initializes with empty element_ranges map', () => {
		const manager = new HighlightManager();
		assert.equal(manager.element_ranges.size, 0);
	});
});

describe('DOM element handling', () => {
	test('throws if element has no text node', () => {
		const manager = new HighlightManager();
		const element = {
			childNodes: [], // No children
		} as unknown as Element;
		const tokens: SyntaxTokenStream = [];

		assert.throws(
			() => manager.highlight_from_syntax_tokens(element, tokens),
			/no text node to highlight/,
		);
	});

	test('finds text node as first child', () => {
		const manager = new HighlightManager();
		const element = create_code_element('const x = 1;');

		const tokens: SyntaxTokenStream = [
			new SyntaxToken('keyword', 'const', undefined, 'const'),
			' x = 1;',
		];

		// Should not throw
		assert.doesNotThrow(() => manager.highlight_from_syntax_tokens(element, tokens));
	});

	test('finds text node after comment nodes', () => {
		const manager = new HighlightManager();
		const element = create_code_element_with_comment('const x = 1;');

		const tokens: SyntaxTokenStream = [
			new SyntaxToken('keyword', 'const', undefined, 'const'),
			' x = 1;',
		];

		// Should not throw
		assert.doesNotThrow(() => manager.highlight_from_syntax_tokens(element, tokens));
	});

	test('handles empty text node', () => {
		const manager = new HighlightManager();
		const element = create_code_element('');

		const tokens: SyntaxTokenStream = [];

		manager.highlight_from_syntax_tokens(element, tokens);
		assert.equal(manager.element_ranges.size, 0);
	});
});

describe('range creation', () => {
	test('creates ranges for simple token stream', () => {
		const manager = new HighlightManager();
		const element = create_code_element('const x = 1;');

		const tokens: SyntaxTokenStream = [
			new SyntaxToken('keyword', 'const', undefined, 'const'),
			' ',
			new SyntaxToken('variable', 'x', undefined, 'x'),
			' = ',
			new SyntaxToken('number', '1', undefined, '1'),
			';',
		];

		manager.highlight_from_syntax_tokens(element, tokens);

		// Should have created ranges for keyword, variable, number
		assert.equal(manager.element_ranges.size, 3);
		assert.ok(manager.element_ranges.has('token_keyword'));
		assert.ok(manager.element_ranges.has('token_variable'));
		assert.ok(manager.element_ranges.has('token_number'));
	});

	test('creates ranges for token with string content', () => {
		const manager = new HighlightManager();
		const element = create_code_element('keyword');

		// Token where content is a string (not nested array)
		const tokens: SyntaxTokenStream = [new SyntaxToken('keyword', 'keyword', undefined, 'keyword')];

		manager.highlight_from_syntax_tokens(element, tokens);

		assert.ok(manager.element_ranges.has('token_keyword'));
		const ranges = manager.element_ranges.get('token_keyword')!;
		assert.equal(ranges.length, 1);
		assert.equal(ranges[0]!.startOffset, 0);
		assert.equal(ranges[0]!.endOffset, 7);
	});

	test('creates ranges for nested tokens', () => {
		const manager = new HighlightManager();
		const element = create_code_element('`hello ${name}`');

		const tokens: SyntaxTokenStream = [
			new SyntaxToken(
				'template_string',
				[
					new SyntaxToken('punctuation', '`', undefined, '`'),
					'hello ',
					new SyntaxToken(
						'interpolation',
						[
							new SyntaxToken('punctuation', '${', undefined, '${'),
							new SyntaxToken('variable', 'name', undefined, 'name'),
							new SyntaxToken('punctuation', '}', undefined, '}'),
						],
						undefined,
						'${name}',
					),
					new SyntaxToken('punctuation', '`', undefined, '`'),
				],
				undefined,
				'`hello ${name}`',
			),
		];

		manager.highlight_from_syntax_tokens(element, tokens);

		// Should have ranges for all token types
		assert.ok(manager.element_ranges.has('token_template_string'));
		assert.ok(manager.element_ranges.has('token_punctuation'));
		assert.ok(manager.element_ranges.has('token_interpolation'));
		assert.ok(manager.element_ranges.has('token_variable'));
	});

	test('creates ranges for deeply nested tokens (4 levels)', () => {
		const manager = new HighlightManager();
		const element = create_code_element('abcd');

		const tokens: SyntaxTokenStream = [
			new SyntaxToken(
				'level1',
				[
					new SyntaxToken(
						'level2',
						[
							new SyntaxToken(
								'level3',
								[new SyntaxToken('level4', 'a', undefined, 'a'), 'bcd'],
								undefined,
								'abcd',
							),
						],
						undefined,
						'abcd',
					),
				],
				undefined,
				'abcd',
			),
		];

		manager.highlight_from_syntax_tokens(element, tokens);

		// All levels should have ranges
		assert.ok(manager.element_ranges.has('token_level1'));
		assert.ok(manager.element_ranges.has('token_level2'));
		assert.ok(manager.element_ranges.has('token_level3'));
		assert.ok(manager.element_ranges.has('token_level4'));

		// Verify positions
		const level4_ranges = manager.element_ranges.get('token_level4')!;
		assert.equal(level4_ranges[0]!.startOffset, 0);
		assert.equal(level4_ranges[0]!.endOffset, 1);
	});

	test('creates ranges for mixed nested content (strings and tokens)', () => {
		const manager = new HighlightManager();
		const element = create_code_element('a-b-c');

		const tokens: SyntaxTokenStream = [
			new SyntaxToken(
				'outer',
				[
					new SyntaxToken('part1', 'a', undefined, 'a'),
					'-',
					new SyntaxToken('part2', 'b', undefined, 'b'),
					'-',
					new SyntaxToken('part3', 'c', undefined, 'c'),
				],
				undefined,
				'a-b-c',
			),
		];

		manager.highlight_from_syntax_tokens(element, tokens);

		// All parts should have ranges with correct positions
		const part1_ranges = manager.element_ranges.get('token_part1')!;
		const part2_ranges = manager.element_ranges.get('token_part2')!;
		const part3_ranges = manager.element_ranges.get('token_part3')!;

		assert.equal(part1_ranges[0]!.startOffset, 0);
		assert.equal(part1_ranges[0]!.endOffset, 1);
		assert.equal(part2_ranges[0]!.startOffset, 2);
		assert.equal(part2_ranges[0]!.endOffset, 3);
		assert.equal(part3_ranges[0]!.startOffset, 4);
		assert.equal(part3_ranges[0]!.endOffset, 5);
	});

	test('creates separate ranges for aliases', () => {
		const manager = new HighlightManager();
		const element = create_code_element('function');

		const tokens: SyntaxTokenStream = [
			new SyntaxToken('keyword', 'function', ['reserved', 'special_keyword'], 'function'),
		];

		manager.highlight_from_syntax_tokens(element, tokens);

		// Should have ranges for type + all aliases
		assert.ok(manager.element_ranges.has('token_keyword'));
		assert.ok(manager.element_ranges.has('token_reserved'));
		assert.ok(manager.element_ranges.has('token_special_keyword'));

		// Each should have one range
		assert.equal(manager.element_ranges.get('token_keyword')!.length, 1);
		assert.equal(manager.element_ranges.get('token_reserved')!.length, 1);
		assert.equal(manager.element_ranges.get('token_special_keyword')!.length, 1);
	});

	test('handles token stream with only strings', () => {
		const manager = new HighlightManager();
		const element = create_code_element('plain text');

		const tokens: SyntaxTokenStream = ['plain text'];

		manager.highlight_from_syntax_tokens(element, tokens);

		// No token ranges should be created
		assert.equal(manager.element_ranges.size, 0);
	});

	test('adds ranges to global CSS.highlights registry', () => {
		const manager = new HighlightManager();
		const element = create_code_element('const');

		const tokens: SyntaxTokenStream = [new SyntaxToken('keyword', 'const', undefined, 'const')];

		assert.equal(CSS.highlights.size, 0);

		manager.highlight_from_syntax_tokens(element, tokens);

		assert.ok(CSS.highlights.has('token_keyword'));
		const highlight = CSS.highlights.get('token_keyword')!;
		assert.equal(highlight.size, 1);
	});

	test('prefixes token types with "token_"', () => {
		const manager = new HighlightManager();
		const element = create_code_element('test');

		const tokens: SyntaxTokenStream = [new SyntaxToken('mytype', 'test', undefined, 'test')];

		manager.highlight_from_syntax_tokens(element, tokens);

		// Should create 'token_mytype', not 'mytype'
		assert.equal(CSS.highlights.has('mytype'), false);
		assert.ok(CSS.highlights.has('token_mytype'));
	});

	test('sets highlight priority from highlight_priorities', () => {
		const manager = new HighlightManager();
		const element = create_code_element('const');

		const tokens: SyntaxTokenStream = [new SyntaxToken('keyword', 'const', undefined, 'const')];

		manager.highlight_from_syntax_tokens(element, tokens);

		const highlight = CSS.highlights.get('token_keyword')!;
		// keyword should have priority 2 according to highlight_priorities
		assert.equal(highlight.priority, 2);
	});
});

describe('position tracking', () => {
	test('correctly tracks positions through simple tokens', () => {
		const manager = new HighlightManager();
		const element = create_code_element('a b c');

		const tokens: SyntaxTokenStream = [
			new SyntaxToken('a', 'a', undefined, 'a'), // pos 0-1
			' ', // pos 1-2
			new SyntaxToken('b', 'b', undefined, 'b'), // pos 2-3
			' ', // pos 3-4
			new SyntaxToken('c', 'c', undefined, 'c'), // pos 4-5
		];

		manager.highlight_from_syntax_tokens(element, tokens);

		// Get the created ranges
		const ranges_a = manager.element_ranges.get('token_a')!;
		const ranges_b = manager.element_ranges.get('token_b')!;
		const ranges_c = manager.element_ranges.get('token_c')!;

		assert.equal(ranges_a[0]!.startOffset, 0);
		assert.equal(ranges_a[0]!.endOffset, 1);
		assert.equal(ranges_b[0]!.startOffset, 2);
		assert.equal(ranges_b[0]!.endOffset, 3);
		assert.equal(ranges_c[0]!.startOffset, 4);
		assert.equal(ranges_c[0]!.endOffset, 5);
	});

	test('correctly tracks positions through nested tokens', () => {
		const manager = new HighlightManager();
		const element = create_code_element('abc');

		const tokens: SyntaxTokenStream = [
			new SyntaxToken(
				'outer',
				[
					new SyntaxToken('inner1', 'a', undefined, 'a'), // pos 0-1
					new SyntaxToken('inner2', 'bc', undefined, 'bc'), // pos 1-3
				],
				undefined,
				'abc',
			),
		];

		manager.highlight_from_syntax_tokens(element, tokens);

		const outer_ranges = manager.element_ranges.get('token_outer')!;
		const inner1_ranges = manager.element_ranges.get('token_inner1')!;
		const inner2_ranges = manager.element_ranges.get('token_inner2')!;

		assert.equal(outer_ranges[0]!.startOffset, 0);
		assert.equal(outer_ranges[0]!.endOffset, 3);
		assert.equal(inner1_ranges[0]!.startOffset, 0);
		assert.equal(inner1_ranges[0]!.endOffset, 1);
		assert.equal(inner2_ranges[0]!.startOffset, 1);
		assert.equal(inner2_ranges[0]!.endOffset, 3);
	});

	test('handles token at position 0 (start boundary)', () => {
		const manager = new HighlightManager();
		const element = create_code_element('abc');

		const tokens: SyntaxTokenStream = [new SyntaxToken('start', 'a', undefined, 'a'), 'bc'];

		manager.highlight_from_syntax_tokens(element, tokens);

		const ranges = manager.element_ranges.get('token_start')!;
		assert.equal(ranges[0]!.startOffset, 0);
		assert.equal(ranges[0]!.endOffset, 1);
	});

	test('handles token at end of text (end boundary)', () => {
		const manager = new HighlightManager();
		const element = create_code_element('abc');

		const tokens: SyntaxTokenStream = ['ab', new SyntaxToken('end', 'c', undefined, 'c')];

		manager.highlight_from_syntax_tokens(element, tokens);

		const ranges = manager.element_ranges.get('token_end')!;
		assert.equal(ranges[0]!.startOffset, 2);
		assert.equal(ranges[0]!.endOffset, 3);
	});

	test('validates nested content length matches parent token', () => {
		const manager = new HighlightManager();
		const element = create_code_element('abc');

		// Token with mismatched lengths: outer claims 3 chars but nested content only has 2
		const tokens: SyntaxTokenStream = [
			new SyntaxToken(
				'outer',
				[
					new SyntaxToken('inner1', 'a', undefined, 'a'), // 1 char
					new SyntaxToken('inner2', 'b', undefined, 'b'), // 1 char
					// Nested tokens total: 2 chars
				],
				undefined,
				'abc', // Claims 3 chars
			),
			// 'c' is unaccounted for
		];

		// Now validates that nested tokens match parent token's claimed length
		assert.throws(
			() => manager.highlight_from_syntax_tokens(element, tokens),
			/Token outer length mismatch: claimed 3 chars.*but nested content covered 2 chars/,
		);
	});
});

describe('error handling', () => {
	test('validates token position does not exceed text node length', () => {
		const manager = new HighlightManager();
		const element = create_code_element('abc'); // 3 characters

		// Token claims to be longer than the text
		const bad_token = new SyntaxToken('bad', 'abcd', undefined, 'abcd'); // 4 chars
		const tokens: SyntaxTokenStream = [bad_token];

		// Validates bounds before creating range
		assert.throws(
			() => manager.highlight_from_syntax_tokens(element, tokens),
			/Token bad extends beyond text node: position 4 > length 3/,
		);
	});

	test('validates token stream matches text content length', () => {
		const manager = new HighlightManager();
		const element = create_code_element('abc'); // 3 characters

		// Tokens only cover 2 characters
		const tokens: SyntaxTokenStream = [
			new SyntaxToken('keyword', 'ab', undefined, 'ab'),
			// Missing 'c'
		];

		// Validates that sum of token lengths equals text node length
		assert.throws(
			() => manager.highlight_from_syntax_tokens(element, tokens),
			/Token stream length mismatch: tokens covered 2 chars but text node has 3 chars/,
		);
	});

	test('handles emoji and multi-byte characters', () => {
		const manager = new HighlightManager();
		const emoji = '🎨';
		const element = create_code_element(`${emoji} = 1;`);

		// JS string length vs DOM position
		assert.equal(emoji.length, 2); // UTF-16 code units

		const tokens: SyntaxTokenStream = [
			new SyntaxToken('variable', emoji, undefined, emoji),
			' = ',
			new SyntaxToken('number', '1', undefined, '1'),
			';',
		];

		// Should handle emoji correctly
		manager.highlight_from_syntax_tokens(element, tokens);

		assert.ok(manager.element_ranges.has('token_variable'));
		assert.ok(manager.element_ranges.has('token_number'));

		// Verify positions are correct
		const variable_ranges = manager.element_ranges.get('token_variable')!;
		const number_ranges = manager.element_ranges.get('token_number')!;

		// Emoji takes 2 code units, so number starts at position 5 (2 + 3)
		assert.equal(variable_ranges[0]!.startOffset, 0);
		assert.equal(variable_ranges[0]!.endOffset, 2);
		assert.equal(number_ranges[0]!.startOffset, 5);
		assert.equal(number_ranges[0]!.endOffset, 6);
	});

	test('wraps range creation errors with context', () => {
		const manager = new HighlightManager();
		const element = create_code_element('x');

		// Create token with invalid position
		const tokens: SyntaxTokenStream = [
			new SyntaxToken('bad', 'xy', undefined, 'xy'), // Extends beyond text
		];

		try {
			manager.highlight_from_syntax_tokens(element, tokens);
			assert.fail('Should have thrown');
		} catch (e: any) {
			// Now throws earlier with bounds check before range creation
			assert.ok(e.message.includes('bad')); // Includes token type
			assert.ok(e.message.includes('extends beyond text node'));
		}
	});
});

describe('lifecycle management', () => {
	test('clear_element_ranges removes ranges from CSS.highlights', () => {
		const manager = new HighlightManager();
		const element = create_code_element('const x;');

		const tokens: SyntaxTokenStream = [
			new SyntaxToken('keyword', 'const', undefined, 'const'),
			' x;',
		];

		manager.highlight_from_syntax_tokens(element, tokens);
		assert.ok(CSS.highlights.has('token_keyword'));

		manager.clear_element_ranges();
		assert.equal(CSS.highlights.has('token_keyword'), false);
	});

	test('clear_element_ranges only removes own ranges from shared highlights', () => {
		const manager1 = new HighlightManager();
		const manager2 = new HighlightManager();

		const element1 = create_code_element('const');
		const element2 = create_code_element('const');

		const tokens: SyntaxTokenStream = [new SyntaxToken('keyword', 'const', undefined, 'const')];

		manager1.highlight_from_syntax_tokens(element1, tokens);
		manager2.highlight_from_syntax_tokens(element2, tokens);

		const highlight = CSS.highlights.get('token_keyword')!;
		assert.equal(highlight.size, 2); // Two ranges from two managers

		manager1.clear_element_ranges();
		assert.equal(highlight.size, 1); // Only manager1's range removed
		assert.ok(CSS.highlights.has('token_keyword')); // Highlight still exists
	});

	test('clear_element_ranges throws if highlight unexpectedly missing', () => {
		const manager = new HighlightManager();
		const element = create_code_element('const');

		const tokens: SyntaxTokenStream = [new SyntaxToken('keyword', 'const', undefined, 'const')];

		manager.highlight_from_syntax_tokens(element, tokens);

		// Manually delete the highlight to simulate unexpected state
		CSS.highlights.delete('token_keyword');

		assert.throws(
			() => manager.clear_element_ranges(),
			/Expected to find CSS highlight: token_keyword/,
		);
	});

	test('clear_element_ranges deletes highlight when last range removed', () => {
		const manager = new HighlightManager();
		const element = create_code_element('const');

		const tokens: SyntaxTokenStream = [new SyntaxToken('keyword', 'const', undefined, 'const')];

		manager.highlight_from_syntax_tokens(element, tokens);
		assert.ok(CSS.highlights.has('token_keyword'));

		manager.clear_element_ranges();
		assert.equal(CSS.highlights.has('token_keyword'), false);
		assert.equal(CSS.highlights.size, 0);
	});

	test('clear_element_ranges can be called multiple times safely', () => {
		const manager = new HighlightManager();

		manager.clear_element_ranges();
		manager.clear_element_ranges();

		assert.equal(manager.element_ranges.size, 0);
	});

	test('destroy calls clear_element_ranges', () => {
		const manager = new HighlightManager();
		const element = create_code_element('const');

		const tokens: SyntaxTokenStream = [new SyntaxToken('keyword', 'const', undefined, 'const')];

		manager.highlight_from_syntax_tokens(element, tokens);
		assert.equal(manager.element_ranges.size, 1);

		manager.destroy();
		assert.equal(manager.element_ranges.size, 0);
		assert.equal(CSS.highlights.size, 0);
	});

	test('highlight_from_syntax_tokens clears previous highlights', () => {
		const manager = new HighlightManager();
		const element = create_code_element('const');

		const tokens1: SyntaxTokenStream = [new SyntaxToken('keyword', 'const', undefined, 'const')];
		const tokens2: SyntaxTokenStream = [new SyntaxToken('variable', 'const', undefined, 'const')];

		manager.highlight_from_syntax_tokens(element, tokens1);
		assert.ok(manager.element_ranges.has('token_keyword'));
		assert.equal(manager.element_ranges.size, 1);

		// Re-highlight with different tokens
		manager.highlight_from_syntax_tokens(element, tokens2);
		assert.equal(manager.element_ranges.has('token_keyword'), false);
		assert.ok(manager.element_ranges.has('token_variable'));
		assert.equal(manager.element_ranges.size, 1);
	});
});

describe('multiple managers', () => {
	test('multiple managers share global CSS.highlights registry', () => {
		const manager1 = new HighlightManager();
		const manager2 = new HighlightManager();

		const element1 = create_code_element('const');
		const element2 = create_code_element('let');

		manager1.highlight_from_syntax_tokens(element1, [
			new SyntaxToken('keyword', 'const', undefined, 'const'),
		]);
		manager2.highlight_from_syntax_tokens(element2, [
			new SyntaxToken('keyword', 'let', undefined, 'let'),
		]);

		// Both contribute to same global highlight
		const highlight = CSS.highlights.get('token_keyword')!;
		assert.equal(highlight.size, 2);
	});

	test('managers maintain independent element_ranges', () => {
		const manager1 = new HighlightManager();
		const manager2 = new HighlightManager();

		const element1 = create_code_element('const');
		const element2 = create_code_element('let');

		manager1.highlight_from_syntax_tokens(element1, [
			new SyntaxToken('keyword', 'const', undefined, 'const'),
		]);
		manager2.highlight_from_syntax_tokens(element2, [
			new SyntaxToken('keyword', 'let', undefined, 'let'),
		]);

		// Each has their own range
		assert.equal(manager1.element_ranges.get('token_keyword')!.length, 1);
		assert.equal(manager2.element_ranges.get('token_keyword')!.length, 1);

		// Different range objects
		assert.notEqual(
			manager1.element_ranges.get('token_keyword')![0],
			manager2.element_ranges.get('token_keyword')![0],
		);
	});
});
