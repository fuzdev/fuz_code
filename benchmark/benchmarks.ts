import {readFile, writeFile} from 'node:fs/promises';
import {Benchmark} from '@fuzdev/fuz_util/benchmark.js';
import {benchmark_format_markdown_grouped} from '@fuzdev/fuz_util/benchmark_format.js';
import {
	benchmark_baseline_save,
	benchmark_baseline_compare,
	benchmark_baseline_format,
} from '@fuzdev/fuz_util/benchmark_baseline.js';
import type {BenchmarkGroup, BenchmarkResult} from '@fuzdev/fuz_util/benchmark_types.js';
import {format_file} from '@fuzdev/gro/format_file.js';

import {samples as all_samples} from '../src/routes/samples/all.ts';
import {syntax_styler_global} from '../src/lib/syntax_styler_global.ts';

/* eslint-disable no-console */

const BENCHMARK_TIME = 10000;
const WARMUP_ITERATIONS = 50;
const LARGE_CONTENT_MULTIPLIER = 100;

const BASELINE_PATH = 'benchmark';
const BASELINE_FILE = `${BASELINE_PATH}/baseline.json`;
// 10% threshold matches fuz_ui — system-level variance (thermal, scheduler)
// easily causes 5-8% swings in hot tokenizer loops.
const REGRESSION_THRESHOLD = 1.1;
const STALENESS_WARNING_DAYS = 30;

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

/**
 * Compare results against the stored baseline and print the report plus any
 * regression / methodology / noise banners. A missing baseline is not an
 * error — the run still succeeds, the comparison just prints a "no baseline"
 * notice and skips the banners (typical on first run or after `benchmark:clean`).
 */
const print_baseline_comparison = async (results: Array<BenchmarkResult>): Promise<void> => {
	const comparison = await benchmark_baseline_compare(results, {
		path: BASELINE_PATH,
		regression_threshold: REGRESSION_THRESHOLD,
		staleness_warning_days: STALENESS_WARNING_DAYS,
	});

	console.log('\n Baseline Comparison\n');
	console.log(benchmark_baseline_format(comparison));

	if (!comparison.baseline_found) return;

	if (comparison.regressions.length > 0) {
		console.log('\n⚠️  Regressions detected. Run with --save to update baseline if intentional.');
	}
	if (comparison.methodology_changed.length > 0) {
		console.log(
			'\n⚠️  Methodology changed on some tasks. Re-run with --save to update the baseline and surface any drift masked by the budget change.',
		);
	}
	// Tally noise warnings across the three Welch-eligible buckets — a
	// methodology_changed row gets its own banner above, so don't double-count.
	const noise_count =
		comparison.regressions.filter((r) => r.noise_warning).length +
		comparison.improvements.filter((r) => r.noise_warning).length +
		comparison.unchanged.filter((r) => r.noise_warning).length;
	if (noise_count > 0) {
		console.log(
			`\n⚠️  ${noise_count} task(s) flagged with high measurement noise. Treat their significance calls with skepticism; consider rerunning on quieter hardware.`,
		);
	}
};

/** Save the baseline to disk, then reformat with prettier so `gro check` stays clean. */
const save_baseline = async (results: Array<BenchmarkResult>): Promise<void> => {
	await benchmark_baseline_save(results, {path: BASELINE_PATH});
	const content = await readFile(BASELINE_FILE, 'utf-8');
	const formatted = await format_file(content, {filepath: BASELINE_FILE});
	await writeFile(BASELINE_FILE, formatted);
	console.log(`\n✓ Baseline saved to ${BASELINE_FILE}`);
};

export const run_and_print_benchmark = async (filter?: string): Promise<void> => {
	console.log('Starting benchmark...\n');

	const results = await run_benchmark(filter);

	console.log(format_section(results));

	await print_baseline_comparison(results);

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
				`Node-bench section before re-running with --save.`,
		);
	}

	const before = existing.slice(0, start_idx + BENCH_MARKER_START.length);
	const after = existing.slice(end_idx);
	const next = `${before}\n\n${formatted}\n\n${after}`;
	await writeFile(file_path, next, 'utf-8');
};

/**
 * Run the benchmark, print to stdout, write the Node-bench region of
 * `benchmark/results.md`, and persist `benchmark/baseline.json`. The
 * hand-pasted browser section in `results.md` is preserved untouched.
 *
 * A single `--save` updates both artifacts so accepting a perf change is one
 * step. The baseline comparison still runs first against the *prior* baseline
 * so the run reports what just changed before overwriting.
 */
export const run_and_save_benchmark = async (
	filter: string | undefined,
	results_path: string,
): Promise<void> => {
	console.log('Starting benchmark...\n');

	const results = await run_benchmark(filter);
	const formatted = format_section(results);

	console.log(formatted);

	await print_baseline_comparison(results);

	await write_benchmark_results(formatted, results_path);
	console.log(`\n✓ Node-bench region written to ${results_path}`);
	console.log('  (browser-bench section preserved — paste updates manually if needed)');

	await save_baseline(results);

	console.log('\n✅ All samples validated successfully');
};
