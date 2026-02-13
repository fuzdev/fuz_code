import {readFileSync} from 'node:fs';
import {fs_search} from '@fuzdev/fuz_util/fs.js';
import {basename, join, relative} from 'node:path';
import {syntax_styler_global} from '$lib/syntax_styler_global.js';
import {tokenize_syntax} from '$lib/tokenize_syntax.js';
import {type SyntaxTokenStream, SyntaxToken} from '$lib/syntax_token.js';

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
		file_filter: (path) => /sample_[^/]+\.(ts|css|html|json|svelte|md|bash)$/.test(path),
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
 * Extract all tokens with positions for fixture generation
 */
const extract_all_tokens = (
	tokens: SyntaxTokenStream,
	offset: number = 0,
): Array<{type: string; start: number; end: number}> => {
	const result: Array<{type: string; start: number; end: number}> = [];
	let pos = offset;

	for (const token of tokens) {
		if (typeof token === 'string') {
			// Plain text, advance position
			pos += token.length;
		} else if (token instanceof SyntaxToken) {
			const start = pos;
			const length = get_token_length(token);
			const end = start + length;

			// Add this token
			result.push({
				type: token.type,
				start,
				end,
			});

			// Process nested tokens
			if (Array.isArray(token.content)) {
				const nested = extract_all_tokens(token.content, start);
				result.push(...nested);
			}

			pos = end;
		}
	}

	return result;
};

/**
 * Calculate the total text length of a token
 */
const get_token_length = (token: SyntaxToken): number => {
	if (typeof token.content === 'string') {
		return token.content.length;
	}

	let length = 0;
	for (const item of token.content) {
		if (typeof item === 'string') {
			length += item.length;
		} else {
			length += get_token_length(item);
		}
	}
	return length;
};

/**
 * Generate token data from syntax styler
 */
export const generate_token_data = (sample: SampleSpec): Array<any> => {
	// Get tokens from syntax styler and extract all with positions
	const grammar = syntax_styler_global.get_lang(sample.lang);
	const tokens = tokenize_syntax(sample.content, grammar);
	const flat_tokens = extract_all_tokens(tokens);

	return flat_tokens;
};

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
