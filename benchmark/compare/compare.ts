// TODO this is a workaround for eslint failing without `"benchmark/**/*.ts"` in tsconfig.json
// This allows CI to pass without running `npm install` for the benchmarks.
// @ts-nocheck

import {Benchmark} from '@fuzdev/fuz_util/benchmark.js';

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
import {samples as all_samples} from '../../src/test/fixtures/samples/all.ts';
import {syntax_styler_global} from '../../src/lib/syntax_styler_global.ts';
import {tokenize_syntax} from '../../src/lib/tokenize_syntax.ts';

/* eslint-disable no-console */

const BENCHMARK_TIME = 10000;
const WARMUP_ITERATIONS = 20;
const LARGE_CONTENT_MULTIPLIER = 100;
const MIN_ITERATIONS = 3; // Tiny minimum samples because of Shiki's pathological cases with TS

export interface ComparisonResult {
	implementation: string;
	language: string;
	ops_per_sec: number;
	mean_time: number;
	samples: number;
	content_size: 'small' | 'large';
	total_time: number;
	operation: 'tokenize' | 'stylize';
}

const LANGUAGE_MAP = {
	ts: {
		prism: 'typescript',
		shiki: 'typescript',
		fuz: 'ts',
	},
	js: {
		prism: 'javascript',
		shiki: 'javascript',
		fuz: 'js',
	},
	css: {
		prism: 'css',
		shiki: 'css',
		fuz: 'css',
	},
	html: {
		prism: 'markup',
		shiki: 'html',
		fuz: 'html',
	},
	json: {
		prism: 'json',
		shiki: 'json',
		fuz: 'json',
	},
	svelte: {
		prism: 'svelte',
		shiki: 'svelte',
		fuz: 'svelte',
	},
} as const;

type SupportedLanguage = keyof typeof LANGUAGE_MAP;

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
): Promise<Array<ComparisonResult>> => {
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

	// Add benchmarks for each language and content size
	for (const lang of languages_to_test) {
		const prism_lang = LANGUAGE_MAP[lang].prism;
		const shiki_lang = LANGUAGE_MAP[lang].shiki;
		const fuz_lang = LANGUAGE_MAP[lang].fuz;

		// Test both small and large content
		for (const large of [false, true]) {
			const content = getSampleContent(lang, large);
			const size_label = large ? 'large' : 'small';

			// Tokenization benchmarks (fuz_code and Prism only)
			// Fuz Code tokenize benchmark
			bench.add(`fuz_code_tokenize_${lang}_${size_label}`, () => {
				tokenize_syntax(content, syntax_styler_global.get_lang(fuz_lang));
			});

			// Prism tokenize benchmark
			if (Prism.languages[prism_lang]) {
				bench.add(`prism_tokenize_${lang}_${size_label}`, () => {
					Prism.tokenize(content, Prism.languages[prism_lang]);
				});
			}

			// Stylization benchmarks (all implementations)
			// Fuz Code stylize benchmark
			bench.add(`fuz_code_stylize_${lang}_${size_label}`, () => {
				syntax_styler_global.stylize(content, fuz_lang);
			});

			// Prism stylize benchmark
			if (Prism.languages[prism_lang]) {
				bench.add(`prism_stylize_${lang}_${size_label}`, () => {
					Prism.highlight(content, Prism.languages[prism_lang], prism_lang);
				});
			} else {
				throw new Error(`Prism language not available: ${prism_lang}`);
			}

			// Shiki JS engine benchmark
			bench.add(`shiki_js_stylize_${lang}_${size_label}`, () => {
				shiki_js.codeToHtml(content, {lang: shiki_lang, theme: 'nord'});
			});

			// Shiki Oniguruma engine benchmark
			bench.add(`shiki_oniguruma_stylize_${lang}_${size_label}`, () => {
				shiki_oniguruma.codeToHtml(content, {lang: shiki_lang, theme: 'nord'});
			});
		}
	}

	console.log('Running benchmarks...');
	await bench.run();

	// Process results
	const results: Array<ComparisonResult> = [];
	const bench_results = bench.results();

	for (const result of bench_results) {
		// Parse benchmark name: implementation_operation_language_size
		// Handle multi-word implementations like 'fuz_code' and 'shiki_js'
		const parts = result.name.split('_');
		let implementation: string;
		let operation: 'tokenize' | 'stylize';
		let language: string;
		let content_size: 'small' | 'large';

		if (result.name.startsWith('fuz_code_tokenize_')) {
			implementation = 'fuz_code';
			operation = 'tokenize';
			language = parts[3];
			content_size = parts[4] as 'small' | 'large';
		} else if (result.name.startsWith('fuz_code_stylize_')) {
			implementation = 'fuz_code';
			operation = 'stylize';
			language = parts[3];
			content_size = parts[4] as 'small' | 'large';
		} else if (result.name.startsWith('prism_tokenize_')) {
			implementation = 'prism';
			operation = 'tokenize';
			language = parts[2];
			content_size = parts[3] as 'small' | 'large';
		} else if (result.name.startsWith('prism_stylize_')) {
			implementation = 'prism';
			operation = 'stylize';
			language = parts[2];
			content_size = parts[3] as 'small' | 'large';
		} else if (result.name.startsWith('shiki_js_stylize_')) {
			implementation = 'shiki_js';
			operation = 'stylize';
			language = parts[3];
			content_size = parts[4] as 'small' | 'large';
		} else if (result.name.startsWith('shiki_oniguruma_stylize_')) {
			implementation = 'shiki_oniguruma';
			operation = 'stylize';
			language = parts[3];
			content_size = parts[4] as 'small' | 'large';
		} else {
			console.warn(`Unknown benchmark name format: ${result.name}`);
			continue;
		}

		results.push({
			implementation,
			language,
			ops_per_sec: result.stats.ops_per_second,
			mean_time: result.stats.mean_ns / 1_000_000, // Convert ns to ms
			samples: result.stats.sample_size,
			content_size,
			total_time: result.total_time_ms,
			operation,
		});
	}

	return results;
};

export const format_comparison_results = (results: Array<ComparisonResult>): string => {
	const lines: Array<string> = [
		'# Syntax Highlighting Performance Comparison',
		'',
		'Comparing fuz_code vs Prism vs Shiki across multiple languages and content sizes.',
		'',
		'## Results',
		'',
		'| Language+Operation+Size | Implementation | % | Ops/sec | Mean Time (ms) |',
		'|-------------------------|----------------|---|---------|----------------|',
	];

	// Group results by language+operation+size to find fastest in each group
	const grouped: Map<string, Array<ComparisonResult>> = new Map();
	for (const result of results) {
		const key = `${result.language}_${result.operation}_${result.content_size}`;
		const group = grouped.get(key) || [];
		group.push(result);
		grouped.set(key, group);
	}

	// Calculate fastest ops/sec for each group
	const fastest_by_group: Map<string, number> = new Map();
	for (const [key, group] of grouped) {
		const fastest = Math.max(...group.map((r) => r.ops_per_sec));
		fastest_by_group.set(key, fastest);
	}

	// Sort by: language -> operation (tokenize first) -> content_size (small first) -> ops/sec (fastest first)
	const sorted_results = results.sort((a, b) => {
		if (a.language !== b.language) return a.language.localeCompare(b.language);
		if (a.operation !== b.operation) return a.operation === 'tokenize' ? -1 : 1;
		if (a.content_size !== b.content_size) return a.content_size === 'small' ? -1 : 1;
		return b.ops_per_sec - a.ops_per_sec; // Fastest first
	});

	for (const result of sorted_results) {
		const group_key = `${result.language}_${result.operation}_${result.content_size}`;
		const fastest = fastest_by_group.get(group_key) || 1;
		const percent = ((result.ops_per_sec / fastest) * 100).toFixed(0);

		const ops = result.ops_per_sec.toFixed(2);
		const time = result.mean_time.toFixed(4);
		// Use this to diagnose pathological cases to tweak `MIN_ITERATIONS`
		// const total_time = result.total_time.toFixed(1);

		lines.push(
			`| ${result.language} ${result.operation} ${result.content_size} | ${result.implementation} | ${percent}% | ${ops} | ${time} |`,
		);
	}

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
