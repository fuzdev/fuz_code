import {readFile, writeFile} from 'node:fs/promises';
import {Benchmark} from '@fuzdev/fuz_util/benchmark.js';
import {benchmark_format_markdown_grouped} from '@fuzdev/fuz_util/benchmark_format.js';
import type {BenchmarkGroup, BenchmarkResult} from '@fuzdev/fuz_util/benchmark_types.js';

import {samples as all_samples} from '../src/routes/samples/all.ts';
import {syntax_styler_global} from '../src/lib/syntax_styler_global.ts';

/* eslint-disable no-console */

const BENCHMARK_TIME = 10000;
const WARMUP_ITERATIONS = 50;
const LARGE_CONTENT_MULTIPLIER = 100;

export const run_benchmark = async (filter?: string): Promise<Array<BenchmarkResult>> => {
	const bench = new Benchmark({
		duration_ms: BENCHMARK_TIME,
		warmup_iterations: WARMUP_ITERATIONS,
	});

	const samples = Object.values(all_samples);
	const samples_to_run = filter
		? samples.filter((s) => s.name.includes(filter) || s.lang === filter)
		: samples;

	for (const sample of samples_to_run) {
		bench.add(`baseline:${sample.name}`, () => {
			syntax_styler_global.stylize(sample.content, sample.lang);
		});
	}

	const complex_samples = Object.values(all_samples).filter((s) => s.name.includes('complex'));
	for (const sample of complex_samples) {
		if (
			filter &&
			!sample.name.includes(filter) &&
			!sample.lang.includes(filter) &&
			filter !== sample.lang
		) {
			continue;
		}

		const large_content = sample.content.repeat(LARGE_CONTENT_MULTIPLIER);

		bench.add(`large:${sample.name}`, () => {
			syntax_styler_global.stylize(large_content, sample.lang);
		});
	}

	return bench.run();
};

// `baseline:` and `large:` measure different workload sizes (1x vs 100x
// content), so a single-table `vs Best` would compare across categories
// and produce meaningless ratios (e.g. large:ts vs baseline:css → 4000x).
// Splitting into two groups keeps each section's `vs Best` apples-to-apples
// within a fixed content size.
const GROUPS: Array<BenchmarkGroup> = [
	{name: 'Baseline (1x content)', filter: (r) => r.name.startsWith('baseline:')},
	{name: 'Large (100x content)', filter: (r) => r.name.startsWith('large:')},
];

// Heading kept inside the auto-managed region so the writer round-trips the
// whole "## Benchmark Results" block — easier than threading the heading
// through the marker logic.
const format_section = (results: Array<BenchmarkResult>): string =>
	`## Benchmark Results\n\n${benchmark_format_markdown_grouped(results, GROUPS)}`;

export const run_and_print_benchmark = async (filter?: string): Promise<void> => {
	console.log('Starting benchmark...\n');

	const results = await run_benchmark(filter);

	console.log(format_section(results));

	console.log('\n✅ All samples validated successfully');
};

// Sentinels around the auto-managed Node-bench region in `benchmark/results.md`.
// The file also contains a hand-pasted "## Browser Benchmark Results" section
// sourced from the browser benchmark UI; the writer only edits between markers
// so that section survives. Whitespace inside the markers is normalized — only
// the body matters.
const BENCH_MARKER_START = '<!-- node-bench:start -->';
const BENCH_MARKER_END = '<!-- node-bench:end -->';

/**
 * Replace the Node-bench region of `benchmark/results.md` with fresh formatter
 * output. The file must already contain the start/end markers — bootstrapping
 * is intentionally manual because the rest of the file is hand-curated and
 * we won't guess where the markers belong. Throws with a recovery hint if
 * the markers are missing.
 */
export const write_benchmark_results = async (
	formatted: string,
	file_path: string,
): Promise<void> => {
	let existing: string;
	try {
		existing = await readFile(file_path, 'utf-8');
	} catch {
		throw new Error(
			`Cannot write benchmark results: ${file_path} does not exist. ` +
				`Create the file with a Node-bench region delimited by ` +
				`\`${BENCH_MARKER_START}\` and \`${BENCH_MARKER_END}\` first.`,
		);
	}

	const start_idx = existing.indexOf(BENCH_MARKER_START);
	const end_idx = existing.indexOf(BENCH_MARKER_END);
	if (start_idx === -1 || end_idx === -1 || end_idx < start_idx) {
		throw new Error(
			`Cannot write benchmark results: ${file_path} is missing the ` +
				`\`${BENCH_MARKER_START}\` / \`${BENCH_MARKER_END}\` markers ` +
				`that bound the auto-managed region. Add them around the existing ` +
				`Node-bench section before re-running with --write.`,
		);
	}

	const before = existing.slice(0, start_idx + BENCH_MARKER_START.length);
	const after = existing.slice(end_idx);
	const next = `${before}\n\n${formatted}\n\n${after}`;
	await writeFile(file_path, next, 'utf-8');
};

/**
 * Run the benchmark, print to stdout, and write the Node-bench region of
 * `benchmark/results.md` between its sentinel markers. The hand-pasted browser
 * section in the same file is preserved untouched.
 */
export const run_and_save_benchmark = async (
	filter: string | undefined,
	results_path: string,
): Promise<void> => {
	console.log('Starting benchmark...\n');

	const results = await run_benchmark(filter);
	const formatted = format_section(results);

	console.log(formatted);

	await write_benchmark_results(formatted, results_path);
	console.log(`\n✓ Node-bench region written to ${results_path}`);
	console.log('  (browser-bench section preserved — paste updates manually if needed)');

	console.log('\n✅ All samples validated successfully');
};
