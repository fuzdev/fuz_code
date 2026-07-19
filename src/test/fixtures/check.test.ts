import {test, assert, describe} from 'vitest';
import {readFileSync, existsSync} from 'node:fs';
import {
	discover_samples,
	process_sample,
	get_fixture_path,
	discover_diff_cases,
	process_diff_case,
	get_diff_fixture_path,
} from './helpers.ts';
import {sample_langs} from '$lib/code_sample.ts';

/**
 * Verifies runtime lexer output against the generated fixtures: HTML
 * rendering matches, token ranges nest without invalid overlaps, and all
 * expected tokens are present.
 */

describe('generated fixtures match runtime', async () => {
	// Discover all sample files using helper
	const samples = await discover_samples();

	// Generate test for each sample
	for (const sample of samples) {
		describe(`${sample.lang}_${sample.variant}`, () => {
			const html_fixture_path = get_fixture_path(sample.lang, sample.variant, 'html');

			test('fixture file exists', () => {
				// Basic sanity check - fixtures must be generated before tests can run
				assert.ok(
					existsSync(html_fixture_path),
					`Fixture file missing: ${html_fixture_path}. Run 'npm run task src/test/fixtures/update' to generate.`,
				);
			});

			test('syntax styler output matches fixture', () => {
				/**
				 * Current: Tests exact HTML string match
				 *
				 * Ideal: Should test:
				 * - All code is highlighted (no plain text except whitespace)
				 * - Token boundaries are correct
				 * - Token types are semantically correct
				 * - No overlapping spans
				 * - Performance metrics (time, memory)
				 */
				if (!existsSync(html_fixture_path)) {
					console.warn(`Skipping test - fixture missing: ${html_fixture_path}`); // eslint-disable-line no-console
					return;
				}

				const fixture_html = readFileSync(html_fixture_path, 'utf-8');
				const runtime_output = process_sample(sample);

				assert.strictEqual(
					runtime_output.html,
					fixture_html,
					`HTML output mismatch for ${sample.lang}_${sample.variant}`,
				);

				// TODO: Additional assertions
				// assert(calculate_coverage(sample.content, runtime_output.html) > 0.95);
				// assert(validate_no_overlaps(extract_tokens(runtime_output.html)));
			});

			test('token positions are valid', () => {
				/**
				 * Validates that token positions are correctly calculated
				 * from the DOM styler token tree
				 *
				 * Should verify:
				 * - No overlapping tokens
				 * - All positions within bounds
				 * - Tokens match expected patterns
				 */
				const runtime_output = process_sample(sample);

				// Verify tokens are properly nested (overlapping is ok if fully contained)
				const tokensByStart = [...runtime_output.tokens].sort((a, b) =>
					a.start !== b.start ? a.start - b.start : b.end - a.end,
				);

				for (let i = 0; i < tokensByStart.length; i++) {
					const token = tokensByStart[i];

					// Check bounds
					assert.ok(
						token.start >= 0 && token.end <= sample.content.length,
						`Token ${token.type} extends beyond content at position ${token.end} (content length: ${sample.content.length})`,
					);

					// Check that any overlapping tokens are properly nested
					for (let j = i + 1; j < tokensByStart.length; j++) {
						const other = tokensByStart[j];
						if (other.start >= token.end) break; // No more overlaps possible

						// If tokens overlap, one must fully contain the other
						if (other.start < token.end) {
							const properlyNested =
								(token.start <= other.start && token.end >= other.end) || // token contains other
								(other.start <= token.start && other.end >= token.end); // other contains token

							assert.ok(
								properlyNested,
								`Invalid overlap: token ${token.type} [${token.start}-${token.end}] partially overlaps with ${other.type} [${other.start}-${other.end}]`,
							);
						}
					}
				}
			});

			test('token data is deterministic', () => {
				/**
				 * Ensures token positions are consistent between runs
				 *
				 * Should verify:
				 * - Token positions match expected values
				 * - Token types are correctly identified
				 * - Tokenization is deterministic
				 */
				// Generate tokens twice and ensure they match
				const runtime_output1 = process_sample(sample);
				const runtime_output2 = process_sample(sample);

				assert.deepEqual(
					runtime_output1.tokens,
					runtime_output2.tokens,
					`Token data not deterministic for ${sample.lang}_${sample.variant}`,
				);
			});
		});
	}
});

describe('generated diff fixtures match runtime', async () => {
	const diff_cases = await discover_diff_cases();

	test('diff cases were discovered', () => {
		assert.isAbove(diff_cases.length, 0);
	});

	for (const diff_case of diff_cases) {
		describe(diff_case.name, () => {
			const html_path = get_diff_fixture_path(diff_case.name, 'html');
			const split_path = get_diff_fixture_path(diff_case.name, 'split.html');

			test('fixture files exist', () => {
				for (const path of [html_path, split_path]) {
					assert.ok(
						existsSync(path),
						`Fixture file missing: ${path}. Run 'gro src/test/fixtures/update' to generate.`,
					);
				}
			});

			test('diff renderer output matches fixtures', () => {
				const output = process_diff_case(diff_case);
				assert.strictEqual(
					output.unified_html,
					readFileSync(html_path, 'utf-8'),
					`Unified diff HTML mismatch for ${diff_case.name}`,
				);
				assert.strictEqual(
					output.split_html,
					readFileSync(split_path, 'utf-8'),
					`Split diff HTML mismatch for ${diff_case.name}`,
				);
			});

			test('diff output is deterministic', () => {
				const output1 = process_diff_case(diff_case);
				const output2 = process_diff_case(diff_case);
				assert.strictEqual(output1.unified_html, output2.unified_html);
				assert.strictEqual(output1.split_html, output2.split_html);
			});
		});
	}
});

describe('all expected languages are tested', () => {
	test('sample files exist for all supported languages', async () => {
		const found_languages: Set<string> = new Set();

		const samples = await discover_samples();
		for (const sample of samples) {
			found_languages.add(sample.lang);
		}

		for (const lang of sample_langs) {
			assert.ok(found_languages.has(lang), `Missing sample files for language: ${lang}`);
		}
	});
});

/**
 * Future Test Improvements
 * =======================
 *
 * describe('semantic equivalence', () => {
 *   test('all tokens have proper ranges', () => {
 *     // Compare token positions are valid
 *   });
 *
 *   test('no code is left unhighlighted', () => {
 *     // Verify 95%+ coverage (allowing for whitespace)
 *   });
 * });
 *
 * describe('performance benchmarks', () => {
 *   test('highlighting completes within time budget', () => {
 *     // Track time per KB of code
 *   });
 *
 *   test('memory usage is reasonable', () => {
 *     // Track memory per KB of code
 *   });
 * });
 *
 * describe('edge cases', () => {
 *   test('handles malformed code gracefully', () => {
 *     // Should not crash, should highlight what it can
 *   });
 *
 *   test('handles extremely long lines', () => {
 *     // Performance should degrade gracefully
 *   });
 *
 *   test('handles nested language boundaries', () => {
 *     // JS in HTML in Svelte, etc.
 *   });
 * });
 *
 * describe('visual regression', () => {
 *   test('highlighted code screenshots match', () => {
 *     // Render to canvas, compare pixels
 *   });
 * });
 */
