#!/usr/bin/env node
import {run_and_print_benchmark, run_and_save_benchmark} from './benchmarks.ts';

// Parse argv: --write triggers persistence to ./benchmark/results.md; any
// remaining positional is the filter. Order-independent.
const args = process.argv.slice(2);
const write = args.includes('--write');
const filter = args.find((a) => !a.startsWith('--'));

const task = write
	? run_and_save_benchmark(filter, 'benchmark/results.md')
	: run_and_print_benchmark(filter);

task
	.then(() => {
		process.exit(0);
	})
	.catch((error) => {
		console.error('benchmark failed:', error); // eslint-disable-line no-console
		process.exit(1);
	});
