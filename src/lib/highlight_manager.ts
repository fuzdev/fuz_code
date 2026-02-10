import type {SyntaxTokenStream} from './syntax_token.js';
import {highlight_priorities} from './highlight_priorities.js';

export type HighlightMode = 'auto' | 'ranges' | 'html';

/**
 * Check for CSS Highlights API support.
 */
export const supports_css_highlight_api = (): boolean =>
	!!(globalThis.CSS?.highlights && globalThis.Highlight); // eslint-disable-line @typescript-eslint/no-unnecessary-condition

/**
 * Manages CSS Custom Highlight API ranges for a single element.
 * Tracks ranges per element and only removes its own ranges when clearing.
 *
 * **Experimental** — limited browser support. Use `Code` for production.
 *
 * @example
 * ```ts
 * const manager = new HighlightManager();
 * manager.highlight_from_syntax_tokens(element, tokens);
 * ```
 */
export class HighlightManager {
	element_ranges: Map<string, Array<Range>>;

	constructor() {
		if (!supports_css_highlight_api()) {
			throw Error('CSS Highlights API not supported');
		}
		this.element_ranges = new Map();
	}

	/**
	 * Highlight from syntax styler token stream.
	 */
	highlight_from_syntax_tokens(element: Element, tokens: SyntaxTokenStream): void {
		// Find the text node (it might not be firstChild due to Svelte comment nodes)
		let text_node: Node | null = null;
		for (const node of element.childNodes) {
			if (node.nodeType === Node.TEXT_NODE) {
				text_node = node;
				break;
			}
		}

		if (!text_node) {
			throw new Error('no text node to highlight');
		}

		this.clear_element_ranges();

		const ranges_by_type: Map<string, Array<Range>> = new Map();
		const final_pos = this.#create_all_ranges(tokens, text_node, ranges_by_type, 0);

		// Validate that token positions matched text node length
		const text_length = text_node.textContent?.length ?? 0;
		if (final_pos !== text_length) {
			throw new Error(
				`Token stream length mismatch: tokens covered ${final_pos} chars but text node has ${text_length} chars`,
			);
		}

		// Apply highlights
		for (const [type, ranges] of ranges_by_type) {
			const prefixed_type = `token_${type}`;
			// Track ranges for this element
			this.element_ranges.set(prefixed_type, ranges);

			// Get or create the shared highlight
			let highlight = CSS.highlights.get(prefixed_type);
			if (!highlight) {
				highlight = new Highlight();
				// Set priority based on CSS cascade order (higher = later in CSS = wins)
				highlight.priority =
					highlight_priorities[prefixed_type as keyof typeof highlight_priorities] ?? 0;
				CSS.highlights.set(prefixed_type, highlight);
			}

			// Add all ranges to the highlight
			for (const range of ranges) {
				highlight.add(range);
			}
		}
	}

	/**
	 * Clear only this element's ranges from highlights.
	 */
	clear_element_ranges(): void {
		for (const [name, ranges] of this.element_ranges) {
			const highlight = CSS.highlights.get(name);
			if (!highlight) {
				throw new Error('Expected to find CSS highlight: ' + name);
			}

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

	/**
	 * Create ranges for all tokens in the tree.
	 */
	#create_all_ranges(
		tokens: SyntaxTokenStream,
		text_node: Node,
		ranges_by_type: Map<string, Array<Range>>,
		offset: number,
	): number {
		const text_length = text_node.textContent?.length ?? 0;
		let pos = offset;

		for (const token of tokens) {
			if (typeof token === 'string') {
				pos += token.length;
				continue;
			}

			const length = token.length;
			const end_pos = pos + length;

			// Validate positions are within text node bounds before creating ranges
			if (end_pos > text_length) {
				throw new Error(
					`Token ${token.type} extends beyond text node: position ${end_pos} > length ${text_length}`,
				);
			}

			try {
				const range = new Range();
				range.setStart(text_node, pos);
				range.setEnd(text_node, end_pos);

				// Add range for the token type
				const type = token.type;
				if (!ranges_by_type.has(type)) {
					ranges_by_type.set(type, []);
				}
				ranges_by_type.get(type)!.push(range);

				// Also add range for any aliases (alias is always an array)
				for (const alias of token.alias) {
					if (!ranges_by_type.has(alias)) {
						ranges_by_type.set(alias, []);
					}
					// Create a new range for each alias (ranges can't be reused)
					const alias_range = new Range();
					alias_range.setStart(text_node, pos);
					alias_range.setEnd(text_node, end_pos);
					ranges_by_type.get(alias)!.push(alias_range);
				}
			} catch (e) {
				throw new Error(`Failed to create range for ${token.type}: ${e}`);
			}

			// Process nested tokens
			if (Array.isArray(token.content)) {
				const actual_end_pos = this.#create_all_ranges(
					token.content,
					text_node,
					ranges_by_type,
					pos,
				);
				// Validate that nested tokens match the parent token's claimed length
				if (actual_end_pos !== end_pos) {
					throw new Error(
						`Token ${token.type} length mismatch: claimed ${length} chars (${pos}-${end_pos}) but nested content covered ${actual_end_pos - pos} chars (${pos}-${actual_end_pos})`,
					);
				}
				pos = actual_end_pos;
			} else {
				pos = end_pos;
			}
		}

		return pos;
	}
}
