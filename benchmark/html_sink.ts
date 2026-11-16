/**
 * Where the timed calls put a character of the HTML they produce.
 *
 * A library that builds its HTML by appending hands back a rope in V8, and the
 * first read of it copies the pieces into one string. Every consumer pays that
 * copy, so a benchmark that discards the result leaves it outside the clock.
 * Reading one character forces it, and is free for a string that is already
 * flat. The character goes into a module variable that `read_html_sink`
 * returns, since V8 drops a read whose value is never used.
 *
 * @module
 */

let html_sink = 0;

/**
 * Reads one character of `html` into the sink, flattening it.
 */
export const sink_html = (html: string): void => {
	html_sink = (html_sink + html.charCodeAt(0)) | 0;
};

/**
 * Returns the sink, which is what keeps the writes to it from being dropped.
 */
export const read_html_sink = (): number => html_sink;
