import { assert } from 'vitest';

/**
 * Strips tags and unescapes the entities `escape_html_slice` produces,
 * recovering rendered HTML's raw text.
 */
export const strip_tags = (html: string): string => {
	let out = '';
	let i = 0;
	while (i < html.length) {
		const c = html[i]!;
		if (c === '<') {
			const close = html.indexOf('>', i);
			i = close === -1 ? html.length : close + 1;
		} else if (c === '&' && html.startsWith('&amp;', i)) {
			out += '&';
			i += 5;
		} else if (c === '&' && html.startsWith('&lt;', i)) {
			out += '<';
			i += 4;
		} else {
			out += c;
			i++;
		}
	}
	return out;
};

/**
 * Asserts an HTML string's tags are balanced and properly nested.
 */
export const assert_balanced = (html: string): void => {
	const stack: Array<string> = [];
	let i = 0;
	while (i < html.length) {
		if (html[i] === '<') {
			const close = html.indexOf('>', i);
			assert.notStrictEqual(close, -1, `unterminated tag in: ${html}`);
			const tag = html.slice(i + 1, close);
			if (tag.startsWith('/')) {
				const opened = stack.pop();
				assert.isDefined(opened, `close without open in: ${html}`);
				assert.strictEqual(tag.slice(1), opened, `mismatched close in: ${html}`);
			} else {
				const space = tag.indexOf(' ');
				const name = space === -1 ? tag : tag.slice(0, space);
				// `<br>` is the one void element the renderers emit
				if (name !== 'br') stack.push(name);
			}
			i = close + 1;
		} else {
			i++;
		}
	}
	assert.deepEqual(stack, [], `unclosed tags in: ${html}`);
};

/**
 * Asserts every `<mark>` wraps text only — no tag opens or closes inside one,
 * which is what keeps marks from breaking the token spans' nesting — and is
 * non-empty.
 */
export const assert_marks_wrap_text = (html: string): void => {
	let i = html.indexOf('<mark>');
	while (i !== -1) {
		const next_tag = html.indexOf('<', i + 6);
		assert.ok(html.startsWith('</mark>', next_tag), `a tag inside a mark in: ${html}`);
		assert.isAbove(next_tag, i + 6, `empty mark in: ${html}`);
		i = html.indexOf('<mark>', next_tag);
	}
};

/**
 * Returns the unescaped text inside every `<mark>`, concatenated.
 */
export const marked_text = (html: string): string => {
	let out = '';
	let i = html.indexOf('<mark>');
	while (i !== -1) {
		const close = html.indexOf('</mark>', i);
		out += strip_tags(html.slice(i + 6, close));
		i = html.indexOf('<mark>', close);
	}
	return out;
};

/**
 * One row of a unified diff or one cell of a split diff, parsed back out of
 * the rendered HTML.
 */
export interface ParsedDiffRow {
	type: 'add' | 'remove' | 'same' | 'spacer';
	/**
	 * The row's tag name: `ins`, `del`, or `span`.
	 */
	tag: string;
	/**
	 * The gutter's text, `null` when the row has no gutter.
	 */
	gutter: string | null;
	/**
	 * The row's source text, unescaped.
	 */
	text: string;
	no_newline: boolean;
}

const ROW_OPEN = /^<(ins|del|span) class="diff_(?:line|cell) diff_(add|remove|same|spacer)">/;
const GUTTER = /<span class="diff_gutter" aria-hidden="true">([^<]*)<\/span>/;

/**
 * Parses the rows of `render_diff_unified_html` output, or the cells of
 * `render_diff_split_html` output, in document order. Elision chrome (the
 * `<details>` wrappers and their summaries, the `'omit'` count rows) is
 * dropped, so rows inside a `<details>` are returned like any other.
 */
export const parse_diff_rows = (html: string): Array<ParsedDiffRow> => {
	const rows: Array<ParsedDiffRow> = [];
	const chunks = html
		.replace(/<summary>[^<]*<\/summary>/g, '')
		.replace(/<div class="diff_skip">[^<]*<\/div>/g, '')
		.split(/(?=<(?:ins|del|span) class="diff_(?:line|cell) )/);
	for (const chunk of chunks) {
		const open = ROW_OPEN.exec(chunk);
		if (!open) continue; // the elision markup before the first row
		const gutter = GUTTER.exec(chunk);
		rows.push({
			type: open[2] as ParsedDiffRow['type'],
			tag: open[1]!,
			gutter: gutter ? gutter[1]! : null,
			text: strip_tags(gutter ? chunk.replace(gutter[0], '') : chunk),
			no_newline: chunk.includes('<span class="diff_no_newline"></span>')
		});
	}
	return rows;
};

/**
 * Splits a source text into the lines a diff shows: no phantom empty line
 * after a trailing newline, no lines at all for `''`, and nbsp normalized to
 * a space as the renderer does.
 */
export const source_lines = (text: string): Array<string> => {
	if (text === '') return [];
	const lines = text.replaceAll('\xa0', ' ').split('\n');
	if (lines[lines.length - 1] === '') lines.pop();
	return lines;
};

// checks each present gutter against the line numbers counted up to its row
const assert_gutters = (
	rows: Array<ParsedDiffRow>,
	expected: (row: ParsedDiffRow, a_line: number, b_line: number) => string
): void => {
	let a_line = 0;
	let b_line = 0;
	for (const row of rows) {
		if (row.type === 'spacer') continue;
		if (row.type !== 'add') a_line++;
		if (row.type !== 'remove') b_line++;
		if (row.gutter === null) continue;
		assert.strictEqual(row.gutter, expected(row, a_line, b_line));
	}
};

/**
 * Asserts a fully rendered unified diff (`elide` `'details'` or `'none'`)
 * is balanced HTML whose rows reassemble both sources — removed and context
 * rows give `a`, added and context rows give `b` — with semantic row tags
 * and, where gutters are present, the right line numbers.
 */
export const assert_unified_diff_valid = (html: string, a: string, b: string): void => {
	assert_balanced(html);
	assert_marks_wrap_text(html);
	const rows = parse_diff_rows(html);
	const a_lines = source_lines(a);
	const b_lines = source_lines(b);
	assert.deepEqual(
		rows.filter((r) => r.type !== 'add').map((r) => r.text),
		a_lines
	);
	assert.deepEqual(
		rows.filter((r) => r.type !== 'remove').map((r) => r.text),
		b_lines
	);
	for (const row of rows) {
		assert.strictEqual(
			row.tag,
			row.type === 'add' ? 'ins' : row.type === 'remove' ? 'del' : 'span'
		);
	}
	const width = String(Math.max(a_lines.length, b_lines.length, 1)).length;
	const pad = ' '.repeat(width);
	assert_gutters(rows, (row, a_line, b_line) => {
		const a_num = row.type === 'add' ? pad : String(a_line).padStart(width);
		const b_num = row.type === 'remove' ? pad : String(b_line).padStart(width);
		return `${a_num} ${b_num}`;
	});
};

/**
 * Asserts a fully rendered split diff (`elide` `'details'` or `'none'`) is
 * balanced HTML whose cells alternate `a` side then `b` side and reassemble
 * both sources, with the right line number in each gutter.
 */
export const assert_split_diff_valid = (html: string, a: string, b: string): void => {
	assert_balanced(html);
	assert_marks_wrap_text(html);
	const cells = parse_diff_rows(html);
	assert.strictEqual(cells.length % 2, 0, 'cells come in a/b pairs');
	const a_cells = cells.filter((_, i) => i % 2 === 0);
	const b_cells = cells.filter((_, i) => i % 2 === 1);
	for (let i = 0; i < a_cells.length; i++) {
		const a_cell = a_cells[i]!;
		const b_cell = b_cells[i]!;
		assert.notStrictEqual(a_cell.type, 'add', 'an added line on the a side');
		assert.notStrictEqual(b_cell.type, 'remove', 'a removed line on the b side');
		// a context row is context on both sides, and no row is all spacer
		assert.strictEqual(a_cell.type === 'same', b_cell.type === 'same');
		assert.ok(a_cell.type !== 'spacer' || b_cell.type !== 'spacer');
	}
	const a_lines = source_lines(a);
	const b_lines = source_lines(b);
	assert.deepEqual(
		a_cells.filter((c) => c.type !== 'spacer').map((c) => c.text),
		a_lines
	);
	assert.deepEqual(
		b_cells.filter((c) => c.type !== 'spacer').map((c) => c.text),
		b_lines
	);
	const width = String(Math.max(a_lines.length, b_lines.length, 1)).length;
	assert_gutters(a_cells, (_, a_line) => String(a_line).padStart(width));
	assert_gutters(b_cells, (_, __, b_line) => String(b_line).padStart(width));
};

/**
 * A small deterministic PRNG (mulberry32) for property-style tests.
 */
export const create_random = (seed: number): (() => number) => {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
};

/**
 * Derives an edited version of `text` — lines deleted, changed in place, and
 * inserted at random — for diffing against the original.
 */
export const mutate_lines = (text: string, random: () => number): string => {
	const out: Array<string> = [];
	const lines = text.split('\n');
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i]!;
		const r = random();
		if (r < 0.08) continue;
		if (r < 0.18) {
			const at = Math.floor(random() * line.length);
			out.push(line.slice(0, at) + 'edit' + line.slice(at + 2));
		} else {
			if (r < 0.24) out.push(`inserted ${i}`);
			out.push(line);
		}
	}
	return out.join('\n');
};
