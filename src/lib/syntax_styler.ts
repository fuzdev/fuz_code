import {SyntaxToken, type SyntaxTokenStream} from './syntax_token.js';
import {tokenize_syntax} from './tokenize_syntax.js';

export type AddSyntaxGrammar = (syntax_styler: SyntaxStyler) => void;

/**
 * Based on Prism (https://github.com/PrismJS/prism)
 * by Lea Verou (https://lea.verou.me/)
 *
 * MIT license
 *
 * @see LICENSE
 */
export class SyntaxStyler {
	langs: Record<string, SyntaxGrammar | undefined> = {
		plaintext: {},
	};

	// constructor() {
	// TODO this API? problem is the grammars rely on mutating existing grammars in the `syntax_styler`,
	// so for now adding grammars will remain inherently stateful
	// export interface SyntaxStylerOptions {
	// 	grammars?: AddGrammar[];
	// }
	// options: SyntaxStylerOptions = {}
	// const {grammars} = options;
	// if (grammars) {
	// 	for (const add_grammar of grammars) {
	// this.langs[id] =
	// 		add_grammar(this);
	// 	}
	// }
	// }

	add_lang(id: string, grammar: SyntaxGrammarRaw, aliases?: Array<string>): void {
		// Normalize grammar once at registration for optimal runtime performance
		// Use a visited set to handle circular references
		this.#normalize_grammar(grammar, new Set());
		// After normalization, grammar has the shape of SyntaxGrammar
		const normalized = grammar as unknown as SyntaxGrammar;
		this.langs[id] = normalized;
		if (aliases !== undefined) {
			for (var alias of aliases) {
				this.langs[alias] = normalized;
			}
		}
	}

	add_extended_lang(
		base_id: string,
		extension_id: string,
		extension: SyntaxGrammarRaw,
		aliases?: Array<string>,
	): SyntaxGrammar {
		// extend_grammar returns already normalized grammar
		var grammar = this.extend_grammar(base_id, extension);
		// Store the normalized grammar directly
		this.langs[extension_id] = grammar;
		if (aliases !== undefined) {
			for (var alias of aliases) {
				this.langs[alias] = grammar;
			}
		}
		return grammar;
	}

	get_lang(id: string): SyntaxGrammar {
		var lang = this.langs[id];
		if (lang === undefined) {
			throw Error(`The language "${id}" has no grammar.`);
		}
		return lang;
	}

	/**
	 * Generates HTML with syntax highlighting from source code.
	 *
	 * **Process:**
	 * 1. Runs `before_tokenize` hook
	 * 2. Tokenizes code using the provided or looked-up grammar
	 * 3. Runs `after_tokenize` hook
	 * 4. Runs `wrap` hook on each token
	 * 5. Converts tokens to HTML with CSS classes
	 *
	 * **Parameter Relationship:**
	 * - `lang` is ALWAYS required for hook context and identification
	 * - `grammar` is optional; when undefined, automatically looks up via `this.get_lang(lang)`
	 * - When both are provided, `grammar` is used for tokenization, `lang` for metadata
	 *
	 * **Use cases:**
	 * - Standard usage: `stylize(code, 'ts')` - uses registered TypeScript grammar
	 * - Custom grammar: `stylize(code, 'ts', customGrammar)` - uses custom grammar but keeps 'ts' label
	 * - Extended grammar: `stylize(code, 'custom', this.extend_grammar('ts', extension))` - new language variant
	 *
	 * @param text - The source code to syntax highlight.
	 * @param lang - Language identifier (e.g., 'ts', 'css', 'html'). Used for:
	 *   - Grammar lookup when `grammar` is undefined
	 *   - Hook context (`lang` field passed to hooks)
	 *   - Language identification in output
	 * @param grammar - Optional custom grammar object. When undefined, automatically
	 *   looks up the grammar via `this.get_lang(lang)`. Provide this to use a custom
	 *   or modified grammar instead of the registered one.
	 *
	 * @returns HTML string with syntax highlighting using CSS classes (`.token_*`)
	 *
	 * @example
	 * // Standard usage - uses registered grammar
	 * stylize('var foo = true;', 'ts');
	 *
	 * @example
	 * // Custom grammar - overrides registered grammar
	 * const customGrammar = { keyword: [...], string: [...] };
	 * stylize('var foo = false;', 'ts', customGrammar);
	 *
	 * @example
	 * // Extended grammar - builds on existing grammar
	 * const extended = this.extend_grammar('ts', { customToken: [...] });
	 * stylize('var foo = 42;', 'ts-extended', extended);
	 */
	stylize(
		text: string,
		lang: string,
		grammar: SyntaxGrammar | undefined = this.get_lang(lang),
	): string {
		var ctx: HookBeforeTokenizeCallbackContext = {
			code: text,
			grammar,
			lang,
			tokens: undefined,
		};
		this.run_hook_before_tokenize(ctx);
		const c = ctx as any as HookAfterTokenizeCallbackContext;
		c.tokens = tokenize_syntax(c.code, c.grammar);
		this.run_hook_after_tokenize(c);
		return this.stringify_token(c.tokens, c.lang);
	}

	/**
	 * Inserts tokens _before_ another token in a language definition or any other grammar.
	 *
	 * ## Usage
	 *
	 * This helper method makes it easy to modify existing languages. For example, the CSS language definition
	 * not only defines CSS styling for CSS documents, but also needs to define styling for CSS embedded
	 * in HTML through `<style>` elements. To do this, it needs to modify `syntax_styler.get_lang('markup')` and add the
	 * appropriate tokens. However, `syntax_styler.get_lang('markup')` is a regular JS object literal, so if you do
	 * this:
	 *
	 * ```js
	 * syntax_styler.get_lang('markup').style = {
	 *     // token
	 * };
	 * ```
	 *
	 * then the `style` token will be added (and processed) at the end. `insert_before` allows you to insert tokens
	 * before existing tokens. For the CSS example above, you would use it like this:
	 *
	 * ```js
	 * grammar_insert_before('markup', 'cdata', {
	 *     'style': {
	 *         // token
	 *     }
	 * });
	 * ```
	 *
	 * ## Special cases
	 *
	 * If the grammars of `inside` and `insert` have tokens with the same name, the tokens in `inside`'s grammar
	 * will be ignored.
	 *
	 * This behavior can be used to insert tokens after `before`:
	 *
	 * ```js
	 * grammar_insert_before('markup', 'comment', {
	 *     'comment': syntax_styler.get_lang('markup').comment,
	 *     // tokens after 'comment'
	 * });
	 * ```
	 *
	 * ## Limitations
	 *
	 * The main problem `insert_before` has to solve is iteration order. Since ES2015, the iteration order for object
	 * properties is guaranteed to be the insertion order (except for integer keys) but some browsers behave
	 * differently when keys are deleted and re-inserted. So `insert_before` can't be implemented by temporarily
	 * deleting properties which is necessary to insert at arbitrary positions.
	 *
	 * To solve this problem, `insert_before` doesn't actually insert the given tokens into the target object.
	 * Instead, it will create a new object and replace all references to the target object with the new one. This
	 * can be done without temporarily deleting properties, so the iteration order is well-defined.
	 *
	 * However, only references that can be reached from `syntax_styler.langs` or `insert` will be replaced. I.e. if
	 * you hold the target object in a variable, then the value of the variable will not change.
	 *
	 * ```js
	 * var oldMarkup = syntax_styler.get_lang('markup');
	 * var newMarkup = grammar_insert_before('markup', 'comment', { ... });
	 *
	 * assert(oldMarkup !== syntax_styler.get_lang('markup'));
	 * assert(newMarkup === syntax_styler.get_lang('markup'));
	 * ```
	 *
	 * @param inside - The property of `root` (e.g. a language id in `syntax_styler.langs`) that contains the
	 * object to be modified.
	 * @param before - The key to insert before.
	 * @param insert - An object containing the key-value pairs to be inserted.
	 * @param root - The object containing `inside`, i.e. the object that contains the
	 * object to be modified.
	 *
	 * Defaults to `syntax_styler.langs`.
	 *
	 * @returns the new grammar object
	 */
	grammar_insert_before(
		inside: string,
		before: string,
		insert: SyntaxGrammarRaw,
		root: Record<string, any> = this.langs,
	): SyntaxGrammar {
		var grammar = root[inside];
		var updated: SyntaxGrammarRaw = {};

		for (var token in grammar) {
			if (token === before) {
				for (var new_token in insert) {
					updated[new_token] = insert[new_token];
				}
			}

			// Do not insert tokens which also occur in insert.
			if (!Object.hasOwn(insert, token)) {
				updated[token] = grammar[token];
			}
		}

		// Normalize the updated grammar to ensure inserted patterns have consistent shape
		this.#normalize_grammar(updated, new Set());

		// After normalization, cast to SyntaxGrammar
		const normalized = updated as unknown as SyntaxGrammar;
		var old = root[inside];
		root[inside] = normalized;

		// Update references in other language definitions
		depth_first_search(this.langs, (o, key, value) => {
			if (value === old && key !== inside) {
				o[key] = normalized;
			}
		});

		return normalized;
	}

	/**
	 * Converts the given token or token stream to an HTML representation.
	 *
	 * Runs the `wrap` hook on each `SyntaxToken`.
	 *
	 * @param o - The token or token stream to be converted.
	 * @param lang - The name of current language.
	 * @returns The HTML representation of the token or token stream.
	 */
	stringify_token(o: string | SyntaxToken | SyntaxTokenStream, lang: string): string {
		if (typeof o === 'string') {
			return o
				.replace(/&/g, '&amp;')
				.replace(/</g, '&lt;')
				.replace(/\u00a0/g, ' ');
		}
		if (Array.isArray(o)) {
			var s = '';
			for (var e of o) {
				s += this.stringify_token(e, lang);
			}
			return s;
		}

		var ctx: HookWrapCallbackContext = {
			type: o.type,
			content: this.stringify_token(o.content, lang),
			tag: 'span',
			classes: [`token_${o.type}`],
			attributes: {},
			lang,
		};

		var aliases = o.alias;
		// alias is always an array after normalization
		for (const a of aliases) {
			ctx.classes.push(`token_${a}`);
		}

		this.run_hook_wrap(ctx);

		var attributes = '';
		for (var name in ctx.attributes) {
			attributes += ' ' + name + '="' + (ctx.attributes[name] || '').replace(/"/g, '&quot;') + '"';
		}

		return (
			'<' +
			ctx.tag +
			' class="' +
			ctx.classes.join(' ') +
			'"' +
			attributes +
			'>' +
			ctx.content +
			'</' +
			ctx.tag +
			'>'
		);
	}

	/**
	 * Creates a deep copy of the language with the given id and appends the given tokens.
	 *
	 * If a token in `extension` also appears in the copied language, then the existing token in the copied language
	 * will be overwritten at its original position.
	 *
	 * ## Best practices
	 *
	 * Since the position of overwriting tokens (token in `extension` that overwrite tokens in the copied language)
	 * doesn't matter, they can technically be in any order. However, this can be confusing to others that trying to
	 * understand the language definition because, normally, the order of tokens matters in the grammars.
	 *
	 * Therefore, it is encouraged to order overwriting tokens according to the positions of the overwritten tokens.
	 * Furthermore, all non-overwriting tokens should be placed after the overwriting ones.
	 *
	 * @param base_id - The id of the language to extend. This has to be a key in `syntax_styler.langs`.
	 * @param extension - The new tokens to append.
	 * @returns the new grammar
	 */
	extend_grammar(base_id: string, extension: SyntaxGrammarRaw): SyntaxGrammar {
		// Merge normalized base with un-normalized extension
		const extended = {...structuredClone(this.get_lang(base_id)), ...extension};
		// Normalize the extension parts
		this.#normalize_grammar(extended as SyntaxGrammarRaw, new Set());
		// Return as SyntaxGrammar
		return extended as unknown as SyntaxGrammar;
	}

	/**
	 * Normalize a single pattern to have consistent shape.
	 * This ensures all patterns have the same object shape for V8 optimization.
	 */
	#normalize_pattern(
		pattern: RegExp | SyntaxGrammarTokenRaw,
		visited: Set<number>,
	): SyntaxGrammarToken {
		const p = pattern instanceof RegExp ? {pattern} : pattern;

		let regex = p.pattern;

		// Add global flag if greedy and not already present
		if ((p.greedy ?? false) && !regex.global) {
			const flags = regex.flags;
			regex = new RegExp(regex.source, flags.includes('g') ? flags : flags + 'g');
		}

		// Normalize alias to always be an array
		let normalized_alias: Array<string> = [];
		if (p.alias) {
			normalized_alias = Array.isArray(p.alias) ? p.alias : [p.alias];
		}

		// Recursively normalize the inside grammar if present
		let normalized_inside: SyntaxGrammar | null = null;
		if (p.inside) {
			this.#normalize_grammar(p.inside, visited);
			// After normalization, cast to SyntaxGrammar
			normalized_inside = p.inside as unknown as SyntaxGrammar;
		}

		return {
			pattern: regex,
			lookbehind: p.lookbehind ?? false,
			greedy: p.greedy ?? false,
			alias: normalized_alias,
			inside: normalized_inside,
		};
	}

	/**
	 * Normalize a grammar to have consistent object shapes.
	 * This performs several optimizations:
	 * 1. Merges `rest` property into main grammar
	 * 2. Ensures all pattern values are arrays
	 * 3. Normalizes all pattern objects to have consistent shapes
	 * 4. Adds global flag to greedy patterns
	 *
	 * This is called once at registration time to avoid runtime overhead.
	 * @param visited - Set of grammar object IDs already normalized (for circular references)
	 */
	#normalize_grammar(grammar: SyntaxGrammarRaw, visited: Set<number>): void {
		// Check if we've already normalized this grammar (circular reference)
		const grammar_id = id_of(grammar);
		if (visited.has(grammar_id)) {
			return;
		}
		visited.add(grammar_id);

		// Step 1: Merge rest into grammar first
		if (grammar.rest) {
			for (const token in grammar.rest) {
				if (!grammar[token]) {
					// Don't overwrite existing tokens
					grammar[token] = grammar.rest[token];
				}
			}
			delete grammar.rest;
		}

		// Step 2: Normalize all patterns
		for (const key in grammar) {
			if (key === 'rest') continue;

			const value = grammar[key];
			if (!value) {
				grammar[key] = [];
				continue;
			}

			// Always store as array of normalized patterns
			const patterns = Array.isArray(value) ? value : [value];
			grammar[key] = patterns.map((p) => this.#normalize_pattern(p, visited));
		}
	}

	// TODO add some builtins
	plugins: Record<string, any> = {};

	// TODO maybe extend/compose an event listener?
	hooks_before_tokenize: Array<HookBeforeTokenizeCallback> = [];
	hooks_after_tokenize: Array<HookAfterTokenizeCallback> = [];
	hooks_wrap: Array<HookWrapCallback> = [];

	add_hook_before_tokenize(cb: HookBeforeTokenizeCallback): void {
		this.hooks_before_tokenize.push(cb);
	}
	add_hook_after_tokenize(cb: HookAfterTokenizeCallback): void {
		this.hooks_after_tokenize.push(cb);
	}
	add_hook_wrap(cb: HookWrapCallback): void {
		this.hooks_wrap.push(cb);
	}

	run_hook_before_tokenize(ctx: HookBeforeTokenizeCallbackContext): void {
		for (var cb of this.hooks_before_tokenize) {
			cb(ctx);
		}
	}
	run_hook_after_tokenize(ctx: HookAfterTokenizeCallbackContext): void {
		for (var cb of this.hooks_after_tokenize) {
			cb(ctx);
		}
	}
	run_hook_wrap(ctx: HookWrapCallbackContext): void {
		for (var cb of this.hooks_wrap) {
			cb(ctx);
		}
	}
}

export type SyntaxGrammarValueRaw =
	| RegExp
	| SyntaxGrammarTokenRaw
	| Array<RegExp | SyntaxGrammarTokenRaw>;

export type SyntaxGrammarRaw = Record<string, SyntaxGrammarValueRaw | undefined> & {
	rest?: SyntaxGrammarRaw | undefined;
};

/**
 * The expansion of a simple `RegExp` literal to support additional properties.
 *
 * The `inside` grammar will be used to tokenize the text value of each token of this kind.
 *
 * This can be used to make nested and even recursive language definitions.
 *
 * Note: This can cause infinite recursion. Be careful when you embed different languages or even the same language into
 * each another.
 *
 * Note: Grammar authors can use optional properties, but they will be normalized
 * to required properties at registration time for optimal performance.
 */
export interface SyntaxGrammarTokenRaw {
	/**
	 * The regular expression of the token.
	 */
	pattern: RegExp;
	/**
	 * If `true`, then the first capturing group of `pattern` will (effectively)
	 * behave as a lookbehind group meaning that the captured text will not be part of the matched text of the new token.
	 * @default false
	 */
	lookbehind?: boolean;
	/**
	 * Whether the token is greedy.
	 * @default false
	 */
	greedy?: boolean;
	/**
	 * An optional alias or list of aliases.
	 */
	alias?: string | Array<string>;
	/**
	 * The nested grammar of this token.
	 */
	inside?: SyntaxGrammarRaw | null;
}

/**
 * Grammar token with all properties required.
 * This is the normalized representation used at runtime.
 */
export interface SyntaxGrammarToken {
	pattern: RegExp;
	lookbehind: boolean;
	greedy: boolean;
	alias: Array<string>;
	inside: SyntaxGrammar | null;
}

/**
 * A grammar after normalization.
 * All values are arrays of normalized tokens with consistent shapes.
 */
export type SyntaxGrammar = Record<string, Array<SyntaxGrammarToken>>;

const depth_first_search = (
	o: any,
	cb: (obj: any, key: string, value: any) => void,
	visited: Set<number> = new Set(),
): void => {
	for (var key in o) {
		cb(o, key, o[key]);

		var property = o[key];

		if (
			property &&
			typeof property === 'object' &&
			!(property instanceof RegExp) &&
			!visited.has(id_of(property))
		) {
			visited.add(id_of(property));
			depth_first_search(property, cb, visited);
		}
	}
};

export type HookBeforeTokenizeCallback = (ctx: HookBeforeTokenizeCallbackContext) => void;
export type HookAfterTokenizeCallback = (ctx: HookAfterTokenizeCallbackContext) => void;
export type HookWrapCallback = (ctx: HookWrapCallbackContext) => void;

export interface HookBeforeTokenizeCallbackContext {
	code: string;
	grammar: SyntaxGrammar;
	lang: string;
	tokens: undefined;
}
export interface HookAfterTokenizeCallbackContext {
	code: string;
	grammar: SyntaxGrammar;
	lang: string;
	tokens: SyntaxTokenStream;
}
export interface HookWrapCallbackContext {
	type: string;
	content: string;
	tag: string;
	classes: Array<string>;
	attributes: Record<string, string>;
	lang: string;
}

var unique_id = 0;

/**
 * Returns a unique number for the given object. Later calls will still return the same number.
 */
const ID = Symbol('id');
const id_of = (obj: any): number => (obj[ID] ??= ++unique_id);
