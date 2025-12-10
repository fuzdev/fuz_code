#!/usr/bin/env node
import {run_and_print_comparison} from './compare.ts';

const filter = process.argv[2];

run_and_print_comparison(filter)
	.then(() => {
		process.exit(0);
	})
	.catch((error) => {
		console.error('comparison benchmark failed:', error); // eslint-disable-line no-console
		process.exit(1);
	});
