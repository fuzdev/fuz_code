import {readFileSync} from 'node:fs';
import {fs_search} from '@fuzdev/fuz_util/fs.ts';
import {diff_lines, diff_hunks, format_diff} from '@fuzdev/fuz_util/diff.ts';
import {basename, dirname, join, relative} from 'node:path';
import {syntax_styler_global} from '$lib/syntax_styler_global.ts';
import {syntax_events_to_tokens} from '$lib/lexer.ts';
import {render_diff_unified_html, render_diff_split_html} from '$lib/diff_html.ts';

export interface SampleSpec {
	lang: string;
	variant: string;
	content: string;
	filepath: string;
}

export interface GeneratedOutput {
	sample: SampleSpec;
	tokens: Array<any>;
	html: string;
}

/**
 * Discover all sample files in src/test/fixtures/samples
 */
export const discover_samples = async (): Promise<Array<SampleSpec>> => {
	const sample_files = await fs_search('src/test/fixtures/samples', {
		file_filter: (path) => /sample_[^/]+\.(ts|rs|css|html|json|svelte|md|sh)$/.test(path),
	});

	const samples: Array<SampleSpec> = [];

	for (const file of sample_files) {
		const filename = basename(file.id);
		const match = /sample_([^.]+)\.(.+)$/.exec(filename);
		if (!match) continue;

		const variant = match[1]!;
		const lang = match[2]!;
		const content = readFileSync(file.id, 'utf-8');

		samples.push({
			lang,
			variant,
			content,
			filepath: relative(process.cwd(), file.id),
		});
	}

	return samples;
};

/**
 * Get the fixture path for a given language and variant
 */
export const get_fixture_path = (
	lang: string,
	variant: string,
	ext: 'json' | 'txt' | 'html',
): string => {
	return join('src/test/fixtures/generated', lang, `${lang}_${variant}.${ext}`);
};

/**
 * Generate syntax HTML output for a sample
 */
export const generate_syntax_output = (sample: SampleSpec): string => {
	return syntax_styler_global.stylize(sample.content, sample.lang);
};

/**
 * Generate token data from the syntax styler's flat event stream.
 */
export const generate_token_data = (sample: SampleSpec): Array<any> =>
	syntax_events_to_tokens(syntax_styler_global.lex(sample.content, sample.lang));

/**
 * Process a sample to generate all outputs
 */
export const process_sample = (sample: SampleSpec): GeneratedOutput => {
	const html = generate_syntax_output(sample);
	const tokens = generate_token_data(sample);

	return {
		sample,
		tokens,
		html,
	};
};

/**
 * A discovered diff fixture case: an `a`/`b` source pair sharing one
 * language, from `src/test/fixtures/diff/{name}/`.
 */
export interface DiffCaseSpec {
	name: string;
	lang: string;
	a: string;
	b: string;
}

/**
 * Discovers diff fixture cases in `src/test/fixtures/diff` — each case dir
 * holds an `a.{ext}` + `b.{ext}` pair whose extension is the language.
 * Throws on unpaired or extension-mismatched cases.
 */
export const discover_diff_cases = async (): Promise<Array<DiffCaseSpec>> => {
	const files = await fs_search('src/test/fixtures/diff', {
		file_filter: (path) => /\/[ab]\.[^./]+$/.test(path),
	});

	const by_case: Map<string, {a?: string; b?: string; a_ext?: string; b_ext?: string}> = new Map();
	for (const file of files) {
		const name = basename(dirname(file.id));
		const filename = basename(file.id);
		const side = filename[0] as 'a' | 'b';
		const ext = filename.slice(2);
		let entry = by_case.get(name);
		if (!entry) {
			entry = {};
			by_case.set(name, entry);
		}
		entry[side] = readFileSync(file.id, 'utf-8');
		entry[side === 'a' ? 'a_ext' : 'b_ext'] = ext;
	}

	const cases: Array<DiffCaseSpec> = [];
	for (const [name, entry] of [...by_case].sort(([x], [y]) => (x < y ? -1 : 1))) {
		if (entry.a === undefined || entry.b === undefined) {
			throw Error(`Diff case "${name}" is missing its ${entry.a === undefined ? 'a' : 'b'} file`);
		}
		if (entry.a_ext !== entry.b_ext) {
			throw Error(
				`Diff case "${name}" has mismatched extensions: ${entry.a_ext} vs ${entry.b_ext}`,
			);
		}
		cases.push({name, lang: entry.a_ext!, a: entry.a, b: entry.b});
	}
	return cases;
};

/**
 * Get the generated fixture path for a diff case.
 */
export const get_diff_fixture_path = (name: string, ext: 'html' | 'split.html' | 'txt'): string =>
	join('src/test/fixtures/generated/diff', `${name}.${ext}`);

export interface DiffGeneratedOutput {
	spec: DiffCaseSpec;
	unified_html: string;
	split_html: string;
}

/**
 * Process a diff case to generate both views' HTML.
 */
export const process_diff_case = (spec: DiffCaseSpec): DiffGeneratedOutput => ({
	spec,
	unified_html: render_diff_unified_html(spec.a, spec.b, {lang: spec.lang}),
	split_html: render_diff_split_html(spec.a, spec.b, {lang: spec.lang}),
});

/**
 * Generate debug text output for a diff case — stats plus the plain
 * unified-diff text (the `st` seam is unconfigured here, so no ANSI).
 */
export const generate_diff_debug_text = (spec: DiffCaseSpec): string => {
	const lines = diff_lines(spec.a, spec.b);
	const hunks = diff_hunks(lines);
	let changed = 0;
	for (const line of lines) {
		if (line.type !== 'same') changed++;
	}
	let debug = '=== STATS ===\n';
	debug += `a: ${spec.a.length} chars, b: ${spec.b.length} chars\n`;
	debug += `lines: ${lines.length} (${changed} changed), hunks: ${hunks.length}\n`;
	debug += '\n=== DIFF ===\n';
	debug += format_diff(hunks, `a.${spec.lang}`, `b.${spec.lang}`, {max_lines: 0});
	debug += '\n';
	return debug;
};

/**
 * Generate debug text output for a sample
 */
export const generate_debug_text = (output: GeneratedOutput): string => {
	const {sample, tokens} = output;

	let debug = '=== STATS ===\n';
	debug += `Sample length: ${sample.content.length} characters\n`;
	debug += `Total tokens: ${tokens.length}\n`;

	// Count token types
	const tokenTypes: Record<string, number> = {};
	for (const token of tokens) {
		const {type} = token;
		tokenTypes[type] = (tokenTypes[type] || 0) + 1;
	}
	debug += `\nToken types (${Object.keys(tokenTypes).length} unique):\n`;
	for (const [type, count] of Object.entries(tokenTypes).sort((a, b) => b[1] - a[1])) {
		debug += `  ${type}: ${count}\n`;
	}

	debug += '\n=== TOKENS ===\n';
	// Show all tokens, no elision
	for (const t of tokens) {
		const text = sample.content
			.substring(t.start, t.end)
			.replace(/\n/g, '\\n')
			.replace(/\t/g, '\\t');
		// Format: start-end type text
		const start = String(t.start).padStart(4);
		const end = String(t.end).padEnd(4);
		const position = `${start}-${end}`;
		debug += `${position.padEnd(10)} ${t.type.padEnd(25)} ${text}\n`;
	}

	return debug;
};
