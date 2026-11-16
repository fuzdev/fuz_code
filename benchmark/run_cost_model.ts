#!/usr/bin/env node
import { fileURLToPath } from 'node:url';

import { run_and_print_cost_model, time_cost_model_cases } from './cost_model.ts';

// Parse argv: `--save` writes the baseline, `--corpus <dir>` uses a directory
// of source files as the samples; the remaining positional is the language.
// `--child` is how the run starts its timing processes: it times the cases in
// this process and prints each one's time as JSON.
const args = process.argv.slice(2);
const child = args.includes('--child');
const save = args.includes('--save');
const corpus_at = args.indexOf('--corpus');
const corpus = corpus_at === -1 ? undefined : args[corpus_at + 1];
if (corpus_at !== -1 && (corpus === undefined || corpus.startsWith('--'))) {
	console.error('--corpus needs a directory'); // eslint-disable-line no-console
	process.exit(1);
}
const lang = args.find((a, i) => !a.startsWith('--') && (corpus_at === -1 || i !== corpus_at + 1));

const task = child
	? time_cost_model_cases({ lang, corpus }).then((times) => {
			process.stdout.write(JSON.stringify(times));
		})
	: run_and_print_cost_model(
			{ lang, corpus, save },
			fileURLToPath(import.meta.url),
			args.filter((a) => a !== '--save')
		);

task
	.then(() => {
		process.exit(0);
	})
	.catch((error) => {
		console.error('cost model failed:', error); // eslint-disable-line no-console
		process.exit(1);
	});
