#!/usr/bin/env node
import {run_and_print_benchmark} from './benchmarks.ts';

const filter = process.argv[2];

run_and_print_benchmark(filter)
	.then(() => {
		process.exit(0);
	})
	.catch((error) => {
		console.error('benchmark failed:', error); // eslint-disable-line no-console
		process.exit(1);
	});
