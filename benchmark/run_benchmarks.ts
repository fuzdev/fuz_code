#!/usr/bin/env node
import { run_and_print_benchmark, run_and_save_benchmark } from './benchmarks.ts';

// Parse argv: --save persists results.md + baseline.json; any remaining
// positional is the filter. Order-independent.
const args = process.argv.slice(2);
const save = args.includes('--save');
const filter = args.find((a) => !a.startsWith('--'));

const task = save
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
