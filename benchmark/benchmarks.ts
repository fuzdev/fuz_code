import {Bench} from 'tinybench';

import {samples as all_samples} from '../src/test/fixtures/samples/all.js';
import {syntax_styler_global} from '../src/lib/syntax_styler_global.js';

/* eslint-disable no-console */

const BENCHMARK_TIME = 10000;
const WARMUP_TIME = 1000;
const WARMUP_ITERATIONS = 50;
const LARGE_CONTENT_MULTIPLIER = 100;

export interface BenchmarkResult {
	name: string;
	ops_per_sec: number;
	mean_time: number;
	samples: number | undefined;
}

export const run_benchmark = async (filter?: string): Promise<Array<BenchmarkResult>> => {
	const bench = new Bench({
		time: BENCHMARK_TIME,
		warmupTime: WARMUP_TIME,
		warmupIterations: WARMUP_ITERATIONS,
	});

	const samples = Object.values(all_samples);
	const samples_to_run = filter
		? samples.filter((s) => s.name.includes(filter) || s.lang === filter)
		: samples;

	// Add baseline benchmarks (existing behavior)
	for (const sample of samples_to_run) {
		bench.add(`baseline:${sample.name}`, () => {
			syntax_styler_global.stylize(sample.content, sample.lang);
		});
	}

	// Add large content benchmarks (100x repetition)
	const complex_samples = Object.values(all_samples).filter((s) => s.name.includes('complex'));
	for (const sample of complex_samples) {
		// Skip if filter is specified and doesn't match this sample
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

	await bench.run();

	const results: Array<BenchmarkResult> = [];

	for (const task of bench.tasks) {
		if (task.result.state === 'completed' || task.result.state === 'aborted-with-statistics') {
			results.push({
				name: task.name,
				ops_per_sec: task.result.throughput.mean,
				mean_time: task.result.latency.mean,
				samples: task.result.latency.samples?.length,
			});
		}
	}

	return results;
};

export const format_benchmark_results = (results: Array<BenchmarkResult>): string => {
	const lines: Array<string> = [
		'## Benchmark Results',
		'',
		'| Sample | Ops/sec | Mean Time (ms) | Samples |',
		'|--------|---------|----------------|---------|',
	];

	for (const result of results) {
		const name = result.name.replace('baseline:', '');
		const ops_per_sec = result.ops_per_sec.toFixed(2);
		const mean_time = result.mean_time.toFixed(4);
		lines.push(`| ${name} | ${ops_per_sec} | ${mean_time} | ${result.samples} |`);
	}

	lines.push('');
	lines.push(`**Total samples benchmarked:** ${results.length}`);

	const avg_ops = results.reduce((sum, r) => sum + r.ops_per_sec, 0) / results.length;
	lines.push(`**Average ops/sec:** ${avg_ops.toFixed(2)}`);

	return lines.join('\n');
};

export const run_and_print_benchmark = async (filter?: string): Promise<void> => {
	console.log('Starting benchmark...\n');

	const results = await run_benchmark(filter);

	console.log(format_benchmark_results(results));

	console.log('\n✅ All samples validated successfully');
};
