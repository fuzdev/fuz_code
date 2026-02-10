import type {Task} from '@fuzdev/gro';
import {writeFileSync, mkdirSync, rmSync, existsSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {
	discover_samples,
	process_sample,
	generate_debug_text,
	get_fixture_path,
} from './helpers.js';

export const task: Task = {
	summary: 'update all test fixtures from sample files',
	run: async ({invoke_task}) => {
		await invoke_task('gen');

		// Discover all sample files
		const samples = await discover_samples();

		// Get unique languages to clean directories
		const languages = new Set(samples.map((s) => s.lang));

		const generated_fixtures_dir = resolve('src/test/fixtures/generated');

		// Remove existing language directories
		for (const lang of languages) {
			const dir = join(generated_fixtures_dir, lang);
			if (existsSync(dir)) {
				rmSync(dir, {recursive: true, force: true});
				console.log(`Removed existing directory: ${dir}`); // eslint-disable-line no-console
			}
		}

		// Process each sample
		for (const sample of samples) {
			console.log(`Processing ${sample.lang}_${sample.variant}...`); // eslint-disable-line no-console

			// Process sample using helper
			const output = process_sample(sample);

			// Ensure directory exists
			const dir = join(generated_fixtures_dir, sample.lang);
			mkdirSync(dir, {recursive: true});

			// Write HTML file (no formatting needed, already formatted)
			const html_path = get_fixture_path(sample.lang, sample.variant, 'html');
			writeFileSync(html_path, output.html);
			console.log(`  → ${html_path}`); // eslint-disable-line no-console

			// Generate and write debug text file
			const debug_text = generate_debug_text(output);
			const txt_path = get_fixture_path(sample.lang, sample.variant, 'txt');
			writeFileSync(txt_path, debug_text);
			console.log(`  → ${txt_path}`); // eslint-disable-line no-console
		}

		console.log(`\n✓ Updated ${samples.length} samples`); // eslint-disable-line no-console
	},
};
