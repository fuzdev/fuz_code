import {readFile, writeFile} from 'node:fs/promises';
import {Benchmark} from '@fuzdev/fuz_util/benchmark.ts';
import {benchmark_format_markdown_grouped} from '@fuzdev/fuz_util/benchmark_format.ts';
import {
	benchmark_baseline_save,
	benchmark_baseline_compare,
	benchmark_baseline_format,
} from '@fuzdev/fuz_util/benchmark_baseline.ts';
import type {BenchmarkGroup, BenchmarkResult} from '@fuzdev/fuz_util/benchmark_types.ts';
import {format_file} from '@fuzdev/gro/format_file.ts';

import {samples as all_samples} from '../src/routes/samples/all.ts';
import {syntax_styler_global} from '../src/lib/syntax_styler_global.ts';
import {render_syntax_html, type LexedSyntax} from '../src/lib/lexer.ts';
import {PATHOLOGICAL_CASES} from '../src/test/pathological.ts';

/* eslint-disable no-console */

const BENCHMARK_TIME = 10000;
const WARMUP_ITERATIONS = 50;
const LARGE_CONTENT_MULTIPLIER = 100;
// pathological cases are regression tripwires, not headline numbers — a
// shorter budget keeps the full run's added cost modest while still giving
// the baseline compare thousands of iterations per case
const PATHOLOGICAL_BENCHMARK_TIME = 3000;
const PATHOLOGICAL_SIZE = 32768;

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

	const results = await bench.run();

	// pathological workloads run on a separate instance with a shorter budget
	const pathological_bench = new Benchmark({
		duration_ms: PATHOLOGICAL_BENCHMARK_TIME,
		warmup_iterations: WARMUP_ITERATIONS,
	});
	let pathological_count = 0;
	for (const c of PATHOLOGICAL_CASES) {
		if (filter && !c.name.includes(filter) && filter !== c.lang) continue;
		const content = c.generate(PATHOLOGICAL_SIZE);
		pathological_bench.add(`pathological:${c.name}`, () => {
			syntax_styler_global.stylize(content, c.lang);
		});
		pathological_count++;
	}
	if (pathological_count > 0) {
		return results.concat(await pathological_bench.run());
	}

	return results;
};

// Output metrics — deterministic DOM-cost proxies tracked alongside time
// (span count and HTML bytes are what the browser has to parse and
// instantiate, the dominant cost of stylize-into-DOM). Computed once per
// case, not timed; regression gating against the baseline needs fuz_util
// schema support and is deferred — for now the table makes output changes
// reviewable in `results.md` diffs.

interface OutputMetrics {
	name: string;
	input_chars: number;
	spans: number;
	html_bytes: number;
}

/**
 * Counts the `<span>`s a lexed stream renders to — one per leaf and one per
 * container open.
 */
const count_spans = (lexed: LexedSyntax): number => {
	const {events, events_len} = lexed;
	let spans = 0;
	let i = 0;
	while (i < events_len) {
		const tag = events[i]!;
		if (tag > 0) {
			spans++;
			i += 3;
		} else {
			if (tag < 0) spans++;
			i += 2;
		}
	}
	return spans;
};

const measure_output = (name: string, content: string, lang: string): OutputMetrics => {
	const lexed = syntax_styler_global.lex(content, lang);
	return {
		name,
		input_chars: content.length,
		spans: count_spans(lexed),
		html_bytes: Buffer.byteLength(render_syntax_html(lexed), 'utf8'),
	};
};

export const collect_output_metrics = (filter?: string): Array<OutputMetrics> => {
	const metrics: Array<OutputMetrics> = [];
	const samples = Object.values(all_samples);
	const samples_to_run = filter
		? samples.filter((s) => s.name.includes(filter) || s.lang === filter)
		: samples;
	for (const sample of samples_to_run) {
		metrics.push(measure_output(`baseline:${sample.name}`, sample.content, sample.lang));
	}
	for (const c of PATHOLOGICAL_CASES) {
		if (filter && !c.name.includes(filter) && filter !== c.lang) continue;
		metrics.push(measure_output(`pathological:${c.name}`, c.generate(PATHOLOGICAL_SIZE), c.lang));
	}
	return metrics;
};

const format_output_metrics = (metrics: Array<OutputMetrics>): string => {
	let out = '### Output metrics\n\n';
	out +=
		'Deterministic DOM-cost proxies (not timed): spans rendered and utf8 HTML bytes per case.\n\n';
	out += '| task | input chars | spans | html bytes | bytes/char |\n';
	out += '| :-- | --: | --: | --: | --: |\n';
	for (const m of metrics) {
		out += `| ${m.name} | ${m.input_chars} | ${m.spans} | ${m.html_bytes} | ${(
			m.html_bytes / m.input_chars
		).toFixed(2)} |\n`;
	}
	return out;
};

// `baseline:` and `large:` measure different workload sizes (1x vs 100x
// content), so a single-table `vs Best` would compare across categories
// and produce meaningless ratios (e.g. large:ts vs baseline:css → 4000x).
// Splitting into two groups keeps each section's `vs Best` apples-to-apples
// within a fixed content size.
const GROUPS: Array<BenchmarkGroup> = [
	{name: 'Baseline (1x content)', filter: (r) => r.name.startsWith('baseline:')},
	{name: 'Large (100x content)', filter: (r) => r.name.startsWith('large:')},
	{name: 'Pathological (generated, 32KB)', filter: (r) => r.name.startsWith('pathological:')},
];

// Heading kept inside the auto-managed region so the writer round-trips the
// whole "## Benchmark Results" block — easier than threading the heading
// through the marker logic.
const format_section = (results: Array<BenchmarkResult>, metrics: Array<OutputMetrics>): string =>
	`## Benchmark Results\n\n${benchmark_format_markdown_grouped(results, GROUPS)}\n\n${format_output_metrics(metrics)}`;

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

	console.log(format_section(results, collect_output_metrics(filter)));

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
	const formatted = format_section(results, collect_output_metrics(filter));

	console.log(formatted);

	await print_baseline_comparison(results);

	await write_benchmark_results(formatted, results_path);
	console.log(`\n✓ Node-bench region written to ${results_path}`);
	console.log('  (browser-bench section preserved — paste updates manually if needed)');

	await save_baseline(results);

	console.log('\n✅ All samples validated successfully');
};
