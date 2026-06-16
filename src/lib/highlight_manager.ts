import {DEV} from 'esm-env';

import type {SyntaxTokenStream} from './syntax_token.ts';
import {highlight_priorities} from './highlight_priorities.ts';

export type HighlightMode = 'auto' | 'ranges' | 'html';

/**
 * Checks for CSS Highlights API support.
 */
export const supports_css_highlight_api = (): boolean =>
	!!(globalThis.CSS?.highlights && globalThis.Highlight);

/**
 * How a manager builds ranges for the Highlight API.
 *
 * `StaticRange` is preferred: it's an immutable snapshot the browser does *not*
 * track across DOM mutations. Since highlights are rebuilt wholesale whenever
 * content changes, liveness buys nothing and only costs per-mutation boundary
 * bookkeeping and paint work — the main efficiency (and Safari-stability) lever.
 * Falls back to a live `Range` where `StaticRange` is unavailable.
 */
type RangeKind = 'static' | 'live';

const detect_range_kind = (): RangeKind =>
	typeof globalThis.StaticRange === 'function' ? 'static' : 'live';

/**
 * Finds the first text node child of `element`, or `null` if there is none.
 *
 * The text node might not be `firstChild` because frameworks (e.g. Svelte) can
 * insert comment/anchor nodes around it.
 */
const find_text_node = (element: Element): Node | null => {
	for (const node of element.childNodes) {
		if (node.nodeType === Node.TEXT_NODE) return node;
	}
	return null;
};

const has_tokens = (tokens: SyntaxTokenStream): boolean =>
	tokens.some((t) => typeof t !== 'string');

const push_range = (
	ranges_by_name: Map<string, Array<AbstractRange>>,
	name: string,
	range: AbstractRange,
): void => {
	const existing = ranges_by_name.get(name);
	if (existing) {
		existing.push(range);
	} else {
		ranges_by_name.set(name, [range]);
	}
};

/**
 * Manages CSS Custom Highlight API ranges for a single element's text node.
 * Tracks ranges per element and only removes its own ranges when clearing,
 * cooperating with other managers that share the global `CSS.highlights` registry.
 *
 * **Experimental** — limited browser support. Use `Code.svelte` for production
 * block code; this powers the experimental `CodeHighlight` and `CodeTextarea`.
 *
 * @example
 * ```ts
 * const manager = new HighlightManager();
 * manager.highlight_from_syntax_tokens(element, tokens);
 * ```
 */
export class HighlightManager {
	/**
	 * This manager's ranges, keyed by prefixed highlight name (e.g. `token_keyword`).
	 * A single range object may be shared across several names (a token type plus
	 * its aliases), since one range can belong to multiple `Highlight` sets.
	 */
	element_ranges: Map<string, Array<AbstractRange>>;

	#range_kind: RangeKind;

	constructor() {
		if (!supports_css_highlight_api()) {
			throw Error('CSS Highlights API not supported');
		}
		this.element_ranges = new Map();
		this.#range_kind = detect_range_kind();
	}

	/**
	 * Highlights `element`'s text node from a `SyntaxTokenStream` produced by
	 * `tokenize_syntax`. Clears this manager's previous ranges first.
	 *
	 * In production this never throws on a tokenizer/DOM mismatch: out-of-bounds
	 * tokens are clamped and a missing text node is a no-op. In DEV the same
	 * conditions throw loudly to surface grammar bugs.
	 */
	highlight_from_syntax_tokens(element: Element, tokens: SyntaxTokenStream): void {
		this.clear_element_ranges();

		const text_node = find_text_node(element);
		if (!text_node) {
			if (has_tokens(tokens)) {
				if (DEV) {
					throw new Error('no text node to highlight');
				} else {
					// eslint-disable-next-line no-console
					console.error('[HighlightManager] tokens present but no text node to highlight');
				}
			}
			return;
		}

		try {
			this.#apply(text_node, tokens);
		} catch (err) {
			// some engines may reject `StaticRange` in `Highlight.add` -- fall back to
			// live `Range` once rather than letting the throw escape into the effect
			if (this.#range_kind === 'static') {
				this.#range_kind = 'live';
				this.clear_element_ranges(); // undo any partial application
				this.#apply(text_node, tokens);
			} else {
				throw err;
			}
		}
	}

	#apply(text_node: Node, tokens: SyntaxTokenStream): void {
		const ranges_by_name: Map<string, Array<AbstractRange>> = new Map();
		const final_pos = this.#collect_ranges(tokens, text_node, ranges_by_name, 0);

		if (DEV) {
			const text_length = text_node.textContent?.length ?? 0;
			if (final_pos !== text_length) {
				throw new Error(
					`Token stream length mismatch: tokens covered ${final_pos} chars but text node has ${text_length} chars`,
				);
			}
		}

		// TODO: cross-instance coupling -- all managers share one global `Highlight`
		// per token type, so re-highlighting one element (e.g. a textarea on every
		// keystroke) mutates highlights that also hold ranges from every other code
		// block on the page, forcing the browser to re-evaluate the shared set.
		// Isolating per-instance needs unique highlight names + runtime-injected
		// `::highlight()` CSS (≈50 token types × N instances), trading the static
		// theme file for generated CSS. Only worth it with many concurrently-updating
		// instances; revisit if profiling shows it.
		for (const [name, ranges] of ranges_by_name) {
			this.element_ranges.set(name, ranges);

			let highlight = CSS.highlights.get(name);
			if (!highlight) {
				highlight = new Highlight();
				// priority follows CSS cascade order (higher = later in CSS = wins)
				highlight.priority = highlight_priorities[name as keyof typeof highlight_priorities] ?? 0;
				CSS.highlights.set(name, highlight);
			}

			for (const range of ranges) {
				highlight.add(range);
			}
		}
	}

	/**
	 * Clears only this manager's ranges from the shared highlights. Defensive:
	 * a highlight may already be gone (e.g. another manager removed the last
	 * range, or HMR reset the registry), which is a valid state, not an error.
	 */
	clear_element_ranges(): void {
		for (const [name, ranges] of this.element_ranges) {
			const highlight = CSS.highlights.get(name);
			if (!highlight) continue;

			for (const range of ranges) {
				highlight.delete(range);
			}

			if (highlight.size === 0) {
				CSS.highlights.delete(name);
			}
		}

		this.element_ranges.clear();
	}

	destroy(): void {
		this.clear_element_ranges();
	}

	#make_range(text_node: Node, start: number, end: number): AbstractRange {
		if (this.#range_kind === 'static') {
			return new StaticRange({
				startContainer: text_node,
				startOffset: start,
				endContainer: text_node,
				endOffset: end,
			});
		}
		const range = new Range();
		range.setStart(text_node, start);
		range.setEnd(text_node, end);
		return range;
	}

	/**
	 * Walks the token tree, collecting one range per non-empty token (shared
	 * across its type and aliases). Returns the end position covered.
	 */
	#collect_ranges(
		tokens: SyntaxTokenStream,
		text_node: Node,
		ranges_by_name: Map<string, Array<AbstractRange>>,
		offset: number,
	): number {
		const text_length = text_node.textContent?.length ?? 0;
		let pos = offset;

		for (const token of tokens) {
			if (typeof token === 'string') {
				pos += token.length;
				continue;
			}

			const end_pos = pos + token.length;

			if (DEV && end_pos > text_length) {
				throw new Error(
					`Token ${token.type} extends beyond text node: position ${end_pos} > length ${text_length}`,
				);
			}

			// production-safe: clamp rather than throw on a tokenizer edge case
			const safe_end = end_pos > text_length ? text_length : end_pos;
			if (safe_end > pos) {
				// one range shared across the token type and all its aliases --
				// the same range object can belong to multiple `Highlight` sets
				const range = this.#make_range(text_node, pos, safe_end);
				push_range(ranges_by_name, `token_${token.type}`, range);
				for (const alias of token.alias) {
					push_range(ranges_by_name, `token_${alias}`, range);
				}
			}

			if (Array.isArray(token.content)) {
				const nested_end = this.#collect_ranges(token.content, text_node, ranges_by_name, pos);
				if (DEV && nested_end !== end_pos) {
					throw new Error(
						`Token ${token.type} length mismatch: claimed ${token.length} chars (${pos}-${end_pos}) but nested content covered ${nested_end - pos} chars (${pos}-${nested_end})`,
					);
				}
			}

			pos = end_pos;
		}

		return pos;
	}
}
