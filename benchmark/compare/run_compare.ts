#!/usr/bin/env node
import {run_and_print_comparison, run_and_save_comparison} from './compare.ts';

// Parse argv: --write persists to ./benchmark/compare/results.md (full
// overwrite). Any non-flag positional is the filter. Order-independent.
const args = process.argv.slice(2);
const write = args.includes('--write');
const filter = args.find((a) => !a.startsWith('--'));

const task = write
	? run_and_save_comparison(filter, 'benchmark/compare/results.md')
	: run_and_print_comparison(filter);

task
	.then(() => {
		process.exit(0);
	})
	.catch((error) => {
		console.error('comparison benchmark failed:', error); // eslint-disable-line no-console
		process.exit(1);
	});
