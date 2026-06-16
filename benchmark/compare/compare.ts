// TODO this is a workaround for eslint failing without `"benchmark/**/*.ts"` in tsconfig.json
// This allows CI to pass without running `npm install` for the benchmarks.
// @ts-nocheck

import {writeFile} from 'node:fs/promises';
import {Benchmark} from '@fuzdev/fuz_util/benchmark.ts';
import {benchmark_format_markdown_grouped} from '@fuzdev/fuz_util/benchmark_format.ts';
import type {BenchmarkGroup, BenchmarkResult} from '@fuzdev/fuz_util/benchmark_types.ts';

// Prism imports
import Prism from 'prismjs';
import 'prismjs/components/prism-typescript.js';
import 'prismjs/components/prism-css.js';
import 'prismjs/components/prism-markup.js';
import 'prismjs/components/prism-json.js';
import 'prism-svelte';

// Shiki imports
import {createHighlighterCoreSync} from 'shiki/core';
import {createJavaScriptRegexEngine} from 'shiki/engine/javascript';
import {createOnigurumaEngine} from 'shiki/engine/oniguruma';
import typescript from 'shiki/langs/typescript.mjs';
import javascript from 'shiki/langs/javascript.mjs';
import css from 'shiki/langs/css.mjs';
import html from 'shiki/langs/html.mjs';
import json from 'shiki/langs/json.mjs';
import svelte from 'shiki/langs/svelte.mjs';
import nord from 'shiki/themes/nord.mjs';

// Fuz Code imports
import {samples as all_samples} from '../../src/routes/samples/all.ts';
import {syntax_styler_global} from '../../src/lib/syntax_styler_global.ts';
import {tokenize_syntax} from '../../src/lib/tokenize_syntax.ts';

/* eslint-disable no-console */

const BENCHMARK_TIME = 10000;
const WARMUP_ITERATIONS = 20;
const LARGE_CONTENT_MULTIPLIER = 100;
const MIN_ITERATIONS = 3; // Tiny minimum samples because of Shiki's pathological cases with TS

const LANGUAGE_MAP = {
	ts: {prism: 'typescript', shiki: 'typescript', fuz: 'ts'},
	js: {prism: 'javascript', shiki: 'javascript', fuz: 'js'},
	css: {prism: 'css', shiki: 'css', fuz: 'css'},
	html: {prism: 'markup', shiki: 'html', fuz: 'html'},
	json: {prism: 'json', shiki: 'json', fuz: 'json'},
	svelte: {prism: 'svelte', shiki: 'svelte', fuz: 'svelte'},
} as const;

type SupportedLanguage = keyof typeof LANGUAGE_MAP;

// Operation + size combinations enumerated explicitly so group iteration order
// matches the README's expected reading flow (tokenize before stylize, small
// before large) regardless of how `bench.add()` insertion happened to interleave.
const OPERATIONS = ['tokenize', 'stylize'] as const;
const SIZES = ['small', 'large'] as const;

const setupShiki = async () => {
	const langs = [typescript, javascript, css, html, json, svelte];

	const shiki_js = createHighlighterCoreSync({
		themes: [nord],
		langs,
		engine: createJavaScriptRegexEngine(),
	});

	const shiki_oniguruma = createHighlighterCoreSync({
		themes: [nord],
		langs,
		engine: await createOnigurumaEngine(import('shiki/wasm')),
	});

	return {shiki_js, shiki_oniguruma};
};

const getSampleContent = (lang: SupportedLanguage, large = false) => {
	const sample = Object.values(all_samples).find((s) => s.lang === LANGUAGE_MAP[lang].fuz);
	if (!sample) {
		throw new Error(`No sample found for language: ${lang}`);
	}
	return large ? sample.content.repeat(LARGE_CONTENT_MULTIPLIER) : sample.content;
};

export const run_comparison_benchmark = async (
	filter?: string,
): Promise<Array<BenchmarkResult>> => {
	const bench = new Benchmark({
		duration_ms: BENCHMARK_TIME,
		warmup_iterations: WARMUP_ITERATIONS,
		min_iterations: MIN_ITERATIONS,
	});

	// Setup Shiki
	console.log('Setting up Shiki highlighters...');
	const {shiki_js, shiki_oniguruma} = await setupShiki();
	console.log('Shiki setup complete');

	// Determine languages to test
	const supported_languages: Array<SupportedLanguage> = ['ts', 'css', 'html', 'json', 'svelte'];
	const languages_to_test = filter
		? supported_languages.filter((lang) => lang === filter || lang.includes(filter))
		: supported_languages;

	console.log(`Testing languages: ${languages_to_test.join(', ')}`);

	for (const lang of languages_to_test) {
		const prism_lang = LANGUAGE_MAP[lang].prism;
		const shiki_lang = LANGUAGE_MAP[lang].shiki;
		const fuz_lang = LANGUAGE_MAP[lang].fuz;

		for (const large of [false, true]) {
			const content = getSampleContent(lang, large);
			const size_label = large ? 'large' : 'small';

			// Tokenization benchmarks (fuz_code and Prism only)
			bench.add(`fuz_code_tokenize_${lang}_${size_label}`, () => {
				tokenize_syntax(content, syntax_styler_global.get_lang(fuz_lang));
			});

			if (Prism.languages[prism_lang]) {
				bench.add(`prism_tokenize_${lang}_${size_label}`, () => {
					Prism.tokenize(content, Prism.languages[prism_lang]);
				});
			}

			// Stylization benchmarks (all implementations)
			bench.add(`fuz_code_stylize_${lang}_${size_label}`, () => {
				syntax_styler_global.stylize(content, fuz_lang);
			});

			if (Prism.languages[prism_lang]) {
				bench.add(`prism_stylize_${lang}_${size_label}`, () => {
					Prism.highlight(content, Prism.languages[prism_lang], prism_lang);
				});
			} else {
				throw new Error(`Prism language not available: ${prism_lang}`);
			}

			bench.add(`shiki_js_stylize_${lang}_${size_label}`, () => {
				shiki_js.codeToHtml(content, {lang: shiki_lang, theme: 'nord'});
			});

			bench.add(`shiki_oniguruma_stylize_${lang}_${size_label}`, () => {
				shiki_oniguruma.codeToHtml(content, {lang: shiki_lang, theme: 'nord'});
			});
		}
	}

	console.log('Running benchmarks...');
	return bench.run();
};

/**
 * Build one group per (language, operation, size) so each section's "vs Best"
 * column compares apples to apples within a fixed workload. fuz_code is the
 * implicit baseline because it's the fastest in nearly every group — the ratio
 * column reads as "how much slower competitors are than fuz_code" without
 * needing to pin the baseline name explicitly (which would produce ugly long
 * column headers like `vs fuz_code_stylize_ts_large`).
 *
 * Each filter narrows by name suffix (`_${lang}_${size}$`) plus an operation
 * substring so e.g. the "ts tokenize small" group catches only
 * `fuz_code_tokenize_ts_small` and `prism_tokenize_ts_small`, not the stylize
 * variants. The trailing `$` matters — without it, "ts_small" would also match
 * "ts_small_*" if such a name ever existed.
 */
const build_groups = (languages: ReadonlyArray<SupportedLanguage>): Array<BenchmarkGroup> => {
	const groups: Array<BenchmarkGroup> = [];
	for (const lang of languages) {
		for (const op of OPERATIONS) {
			for (const size of SIZES) {
				const suffix = `_${op}_${lang}_${size}`;
				groups.push({
					name: `${lang} ${op} (${size})`,
					filter: (r) => r.name.endsWith(suffix),
				});
			}
		}
	}
	return groups;
};

export const format_comparison_results = (results: Array<BenchmarkResult>): string => {
	const languages_in_results: Array<SupportedLanguage> = (
		Object.keys(LANGUAGE_MAP) as Array<SupportedLanguage>
	).filter((lang) => results.some((r) => r.name.includes(`_${lang}_`)));

	const groups = build_groups(languages_in_results);

	const lines: Array<string> = [
		'# Syntax Highlighting Performance Comparison',
		'',
		'Comparing fuz_code vs Prism vs Shiki across multiple languages and content sizes.',
		'',
		'## Results',
		'',
		benchmark_format_markdown_grouped(results, groups),
	];

	return lines.join('\n');
};

export const run_and_print_comparison = async (filter?: string): Promise<void> => {
	console.log('Starting comparison benchmark...\n');

	try {
		const results = await run_comparison_benchmark(filter);
		const report = format_comparison_results(results);

		console.log(report);
		console.log('\n✅ Comparison benchmark complete');
	} catch (error) {
		console.error('Comparison benchmark failed:', error);
		throw error;
	}
};

/**
 * Run the comparison, print to stdout, and overwrite the entire results file.
 * Unlike the Node-bench writer, this one fully replaces the target file because
 * `format_comparison_results` produces the complete markdown shape (H1 + tables)
 * and the file has no other hand-curated sections to preserve.
 *
 * The README.md `vastly faster` link points to this file (`./benchmark/compare/results.md`),
 * so keeping it current is load-bearing for the published narrative.
 */
export const run_and_save_comparison = async (
	filter: string | undefined,
	results_path: string,
): Promise<void> => {
	console.log('Starting comparison benchmark...\n');

	try {
		const results = await run_comparison_benchmark(filter);
		const report = format_comparison_results(results);

		console.log(report);

		// Trailing newline matches the existing file convention (Prettier-style).
		await writeFile(results_path, report + '\n', 'utf-8');
		console.log(`\n✓ Comparison results written to ${results_path}`);
		console.log('\n✅ Comparison benchmark complete');
	} catch (error) {
		console.error('Comparison benchmark failed:', error);
		throw error;
	}
};
