import {assert} from 'vitest';

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
				stack.push(space === -1 ? tag : tag.slice(0, space));
			}
			i = close + 1;
		} else {
			i++;
		}
	}
	assert.deepEqual(stack, [], `unclosed tags in: ${html}`);
};
