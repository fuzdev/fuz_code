import {
	is_digit,
	is_space,
	matches_ci,
	skip_space,
	token_type,
	type Lexer,
	type SyntaxLang,
} from './lexer.ts';

/**
 * Hand-written HTML/XML lexer.
 *
 * Token vocabulary matches the retired regex grammar: flat `comment`,
 * `processing_instruction`, `doctype`, `cdata`, and `entity`
 * (alias `named_entity` for the `&amp;`-style form); a `tag` container holding
 * a nested `tag` (the `<name` opener with `punctuation`/`namespace` children —
 * the name itself stays plain text), `attr_name` (with `namespace`),
 * `attr_value` (spanning the `=` and quotes, which are `punctuation` with
 * `attr_equals`/`attr_quote` aliases, plus entities), and a final
 * `punctuation` closer; `special_attr` containers for `style=`/`on*=`
 * attributes whose `value` embeds css/js; and `script`/`style` region
 * containers wrapping `lang_js`/`lang_css` around embedded language windows.
 *
 * Two registrations share this scanner: `lexer_markup` (`markup`/`html`/
 * `mathml`/`svg`) uses HTML semantics — rawtext elements (`script`, `style`,
 * and, as a fidelity upgrade over the old grammar, RCDATA `textarea`/`title`)
 * plus the `style=`/`on*=` attribute embedding; `lexer_xml` (`xml`/`ssml`/
 * `atom`/`rss`) scans plain XML with neither, matching the old engine's
 * separate `xml` grammar clone.
 *
 * Deliberate divergences from the regex grammar (all toward HTML semantics):
 * a comment ends at the first `-->` (the old pattern refused comments
 * containing a second `<!--`); doctypes skip a `[…]` internal subset; CDATA
 * sections inside `<script>`/`<style>` are handed to the embedded language
 * as-is (no `included_cdata` structure — HTML treats them as source text);
 * rawtext close tags accept whitespace before `>` (`</script >`).
 *
 * Resilience: unterminated comments, processing instructions, doctypes,
 * CDATA sections, tags, quoted attribute values, and rawtext regions all
 * extend to the end of the window (the old engine degraded them to plain
 * text).
 */

const T_COMMENT = token_type('comment');
const T_PROCESSING_INSTRUCTION = token_type('processing_instruction');
const T_DOCTYPE = token_type('doctype');
const T_CDATA = token_type('cdata');
const T_TAG = token_type('tag');
const T_TAG_PUNCTUATION = token_type('punctuation', 'tag_punctuation');
const T_NAMESPACE = token_type('namespace');
const T_ATTR_NAME = token_type('attr_name');
const T_ATTR_VALUE = token_type('attr_value');
const T_ATTR_EQUALS = token_type('punctuation', 'attr_equals');
const T_ATTR_QUOTE = token_type('punctuation', 'attr_quote');
const T_NAMED_ENTITY = token_type('entity', 'named_entity');
const T_ENTITY = token_type('entity');
const T_SPECIAL_ATTR = token_type('special_attr');
const T_SCRIPT = token_type('script');
const T_STYLE = token_type('style');
const T_LANG_JS = token_type('lang_js');
const T_LANG_CSS = token_type('lang_css');
const T_VALUE_JS = token_type('value', ['js', 'lang_js']);
const T_VALUE_CSS = token_type('value', ['css', 'lang_css']);

// a tag-name char — anything except whitespace, `>`, `/`, `=`, `$`, `<`, `%`
// (the old pattern's negated class; `$` and `%` keep template syntax inert)
const is_tag_name_char = (c: number): boolean =>
	!is_space(c) && c !== 62 && c !== 47 && c !== 61 && c !== 36 && c !== 60 && c !== 37;

// ends an attribute name — whitespace, `>`, `/`, `=`
const is_attr_name_end = (c: number): boolean => is_space(c) || c === 62 || c === 47 || c === 61;

// ends an unquoted attribute value — whitespace, `>`, quotes, `=`
const is_unquoted_value_end = (c: number): boolean =>
	is_space(c) || c === 62 || c === 34 || c === 39 || c === 61;

const is_ascii_alnum = (c: number): boolean =>
	(c >= 48 && c <= 57) || ((c | 0x20) >= 97 && (c | 0x20) <= 122);

const is_entity_hex = (c: number): boolean =>
	(c >= 48 && c <= 57) || ((c | 0x20) >= 97 && (c | 0x20) <= 102);

/**
 * Scans an entity reference at the `&` at `i`, returning its exclusive end or
 * -1. Mirrors the old patterns: named `&[\da-z]{1,8};` (case-insensitive) and
 * numeric `&#x?[\da-f]{1,8};` (hex digits allowed in both numeric forms).
 */
const scan_entity_end = (text: string, i: number, end: number): number => {
	let j = i + 1;
	const numeric = j < end && text.charCodeAt(j) === 35; // #
	if (numeric) {
		j++;
		if (j < end && (text.charCodeAt(j) | 0x20) === 120) j++; // x
	}
	const digits_start = j;
	const is_wanted = numeric ? is_entity_hex : is_ascii_alnum;
	while (j < end && j - digits_start < 8 && is_wanted(text.charCodeAt(j))) j++;
	if (j === digits_start) return -1;
	if (j < end && text.charCodeAt(j) === 59) return j + 1; // ;
	return -1;
};

/**
 * Emits entity leaves found in `[from, to)`. `<` is not special here — this
 * runs over plain text runs, RCDATA regions, and attribute-value contents.
 */
const lex_markup_entities = (l: Lexer, from: number, to: number): void => {
	const {text} = l;
	let i = from;
	while (i < to) {
		const amp = text.indexOf('&', i);
		if (amp === -1 || amp >= to) return;
		const entity_end = scan_entity_end(text, amp, to);
		if (entity_end === -1) {
			i = amp + 1;
			continue;
		}
		l.leaf(text.charCodeAt(amp + 1) === 35 ? T_ENTITY : T_NAMED_ENTITY, amp, entity_end);
		i = entity_end;
	}
};

/**
 * Detects a `style` or `on*` attribute name (case-insensitive) in html mode,
 * returning the embed language id or `null`.
 */
const special_attr_lang = (text: string, from: number, to: number): string | null => {
	const len = to - from;
	if (len === 5 && matches_ci(text, from, 'style')) return 'css';
	if (len >= 3 && matches_ci(text, from, 'on')) {
		for (let k = from + 2; k < to; k++) {
			const c = text.charCodeAt(k);
			// \w — letters, digits, `_`
			if (!is_ascii_alnum(c) && c !== 95) return null;
		}
		return 'js';
	}
	return null;
};

/**
 * Emits an attribute value container `[eq, value_end)` — `attr_equals`, the
 * quotes, and the content: entities for plain values, or (for `style=`/
 * `on*=` special attrs) a `value` container embedding `embed_lang`. Matching
 * the old pattern, the `value` container appears only when the content is
 * non-empty and starts immediately after the opening quote with a non-space
 * char.
 */
const lex_markup_attr_value = (
	l: Lexer,
	eq: number,
	content_start: number,
	content_end: number,
	value_end: number,
	quoted: boolean,
	closed: boolean,
	embed_lang: string | null,
): void => {
	l.open(T_ATTR_VALUE, eq);
	l.leaf(T_ATTR_EQUALS, eq, eq + 1);
	if (quoted) l.leaf(T_ATTR_QUOTE, content_start - 1, content_start);
	if (embed_lang === null) {
		lex_markup_entities(l, content_start, content_end);
	} else if (content_end > content_start && !is_space(l.text.charCodeAt(content_start))) {
		l.open(embed_lang === 'css' ? T_VALUE_CSS : T_VALUE_JS, content_start);
		l.embed(embed_lang, content_start, content_end);
		l.close(content_end);
	}
	if (quoted && closed) l.leaf(T_ATTR_QUOTE, content_end, content_end + 1);
	l.close(value_end);
};

/**
 * Emits an `attr_name` — a container with a `namespace` prefix leaf when the
 * name has one, else a plain leaf.
 */
const lex_markup_attr_name = (l: Lexer, from: number, to: number): void => {
	const ns_end = scan_namespace_end(l.text, from, to);
	if (ns_end === -1) {
		l.leaf(T_ATTR_NAME, from, to);
	} else {
		l.open(T_ATTR_NAME, from);
		l.leaf(T_NAMESPACE, from, ns_end);
		l.close(to);
	}
};

/**
 * Finds a name span's `ns:` prefix, per the old `^[^\s>/:]+:` pattern.
 * Returns the namespace end (the index after `:`), or -1.
 */
const scan_namespace_end = (text: string, from: number, to: number): number => {
	for (let k = from; k < to; k++) {
		if (text.charCodeAt(k) === 58) return k > from ? k + 1 : -1;
	}
	return -1;
};

/**
 * Lexes a tag from the `<` at `i`, returning the position after the closing
 * `>` (or the window end when unterminated). Returns `i + 1` — leaving the
 * `<` as plain text — when no tag name follows.
 */
const lex_markup_tag = (l: Lexer, i: number, end: number, html_mode: boolean): number => {
	const {text} = l;
	const closing = text.charCodeAt(i + 1) === 47;
	const name_start = i + (closing ? 2 : 1);
	if (name_start >= end) return i + 1;
	const c0 = text.charCodeAt(name_start);
	if (!is_tag_name_char(c0) || is_digit(c0)) return i + 1;
	let name_end = name_start + 1;
	while (name_end < end && is_tag_name_char(text.charCodeAt(name_end))) name_end++;

	l.open(T_TAG, i); // the whole tag
	l.open(T_TAG, i); // the `<name` opener
	l.leaf(T_TAG_PUNCTUATION, i, name_start);
	const ns_end = scan_namespace_end(text, name_start, name_end);
	if (ns_end !== -1) l.leaf(T_NAMESPACE, name_start, ns_end);
	l.close(name_end);

	let j = name_end;
	let tag_end = end; // unterminated tags extend to the window end
	while (j < end) {
		const c = text.charCodeAt(j);
		if (is_space(c)) {
			j++;
			continue;
		}
		if (c === 62) {
			// >
			l.leaf(T_TAG_PUNCTUATION, j, j + 1);
			tag_end = j + 1;
			break;
		}
		if (c === 47 && text.charCodeAt(j + 1) === 62) {
			// />
			l.leaf(T_TAG_PUNCTUATION, j, j + 2);
			tag_end = j + 2;
			break;
		}
		if (c === 47 || c === 61) {
			// stray `/` or `=` — plain text inside the tag
			j++;
			continue;
		}

		// attribute name
		const an_start = j;
		let an_end = j + 1;
		while (an_end < end && !is_attr_name_end(text.charCodeAt(an_end))) an_end++;

		// `= value`?
		const eq = skip_space(text, an_end, end);
		if (eq >= end || text.charCodeAt(eq) !== 61) {
			// bare attribute
			lex_markup_attr_name(l, an_start, an_end);
			j = an_end;
			continue;
		}

		const v = skip_space(text, eq + 1, end);
		const vc = v < end ? text.charCodeAt(v) : 0;
		let content_start;
		let content_end;
		let value_end;
		let quoted = false;
		let closed = true;
		if (vc === 34 || vc === 39) {
			quoted = true;
			content_start = v + 1;
			const close_quote = text.indexOf(vc === 34 ? '"' : "'", v + 1);
			if (close_quote === -1 || close_quote >= end) {
				content_end = end;
				value_end = end;
				closed = false;
			} else {
				content_end = close_quote;
				value_end = close_quote + 1;
			}
		} else {
			content_start = v;
			let ve = v;
			while (ve < end && !is_unquoted_value_end(text.charCodeAt(ve))) ve++;
			content_end = ve;
			value_end = ve;
		}

		// a special attr needs a quoted or non-empty value, per the old pattern
		const special_lang = html_mode ? special_attr_lang(text, an_start, an_end) : null;
		if (special_lang !== null && (quoted || content_end > content_start)) {
			l.open(T_SPECIAL_ATTR, an_start);
			l.leaf(T_ATTR_NAME, an_start, an_end);
			lex_markup_attr_value(
				l,
				eq,
				content_start,
				content_end,
				value_end,
				quoted,
				closed,
				special_lang,
			);
			l.close(value_end);
		} else {
			lex_markup_attr_name(l, an_start, an_end);
			lex_markup_attr_value(l, eq, content_start, content_end, value_end, quoted, closed, null);
		}
		j = value_end;
	}
	l.close(tag_end);
	return tag_end;
};

// a rawtext close-tag name boundary — whitespace, `/`, `>`, or the window end
const is_rawtext_close_boundary = (text: string, i: number, end: number): boolean => {
	if (i >= end) return true;
	const c = text.charCodeAt(i);
	return is_space(c) || c === 47 || c === 62;
};

// a tag-name end boundary — the window end or any non-name char
const at_name_boundary = (text: string, i: number, end: number): boolean =>
	i >= end || !is_tag_name_char(text.charCodeAt(i));

/**
 * Returns the rawtext element name when the tag name at `name_start` is one
 * of html's rawtext/RCDATA elements, else null.
 */
const rawtext_name_at = (text: string, name_start: number, end: number): string | null => {
	const c = text.charCodeAt(name_start) | 0x20;
	if (c === 115) {
		// s
		if (matches_ci(text, name_start, 'script') && at_name_boundary(text, name_start + 6, end)) {
			return 'script';
		}
		if (matches_ci(text, name_start, 'style') && at_name_boundary(text, name_start + 5, end)) {
			return 'style';
		}
	} else if (c === 116) {
		// t
		if (matches_ci(text, name_start, 'textarea') && at_name_boundary(text, name_start + 8, end)) {
			return 'textarea';
		}
		if (matches_ci(text, name_start, 'title') && at_name_boundary(text, name_start + 5, end)) {
			return 'title';
		}
	}
	return null;
};

/**
 * Lexes a rawtext region from `from` to the matching case-insensitive close
 * tag (`</script` etc. followed by whitespace, `/`, `>`, or the window end),
 * returning the content end — the `<` of the closer, which the main loop then
 * lexes as an ordinary tag. Script/style content embeds js/css inside
 * `script`+`lang_js` / `style`+`lang_css` containers; RCDATA (`textarea`/
 * `title`) content emits entities only.
 */
const lex_markup_rawtext = (l: Lexer, name: string, from: number, end: number): number => {
	const {text} = l;
	let content_end = end;
	let search = from;
	while (true) {
		const lt = text.indexOf('</', search);
		if (lt === -1 || lt >= end) break;
		if (
			matches_ci(text, lt + 2, name) &&
			is_rawtext_close_boundary(text, lt + 2 + name.length, end)
		) {
			content_end = lt;
			break;
		}
		search = lt + 2;
	}
	if (content_end > from) {
		if (name === 'script') {
			l.open(T_SCRIPT, from);
			l.open(T_LANG_JS, from);
			l.embed('js', from, content_end);
			l.close(content_end);
			l.close(content_end);
		} else if (name === 'style') {
			l.open(T_STYLE, from);
			l.open(T_LANG_CSS, from);
			l.embed('css', from, content_end);
			l.close(content_end);
			l.close(content_end);
		} else {
			lex_markup_entities(l, from, content_end);
		}
	}
	return content_end;
};

/**
 * Lexes one `<…` construct at `i`, returning the next scan position.
 */
const lex_markup_construct = (l: Lexer, i: number, end: number, html_mode: boolean): number => {
	const {text} = l;
	const c1 = i + 1 < end ? text.charCodeAt(i + 1) : 0;
	if (c1 === 33) {
		// <!
		if (i + 4 <= end && text.startsWith('<!--', i)) {
			const close = text.indexOf('-->', i + 4);
			const comment_end = close === -1 || close + 3 > end ? end : close + 3;
			l.leaf(T_COMMENT, i, comment_end);
			return comment_end;
		}
		if (i + 9 <= end && matches_ci(text, i + 2, 'doctype')) {
			let j = i + 9;
			while (j < end) {
				const c = text.charCodeAt(j);
				if (c === 62) break; // >
				if (c === 91) {
					// [ internal subset — skip to the matching ]
					const close_bracket = text.indexOf(']', j + 1);
					j = close_bracket === -1 || close_bracket >= end ? end : close_bracket + 1;
					continue;
				}
				j++;
			}
			const doctype_end = j < end ? j + 1 : end;
			l.leaf(T_DOCTYPE, i, doctype_end);
			return doctype_end;
		}
		if (
			i + 9 <= end &&
			text.charCodeAt(i + 2) === 91 &&
			matches_ci(text, i + 3, 'cdata') &&
			text.charCodeAt(i + 8) === 91
		) {
			const close = text.indexOf(']]>', i + 9);
			const cdata_end = close === -1 || close + 3 > end ? end : close + 3;
			l.leaf(T_CDATA, i, cdata_end);
			return cdata_end;
		}
	} else if (c1 === 63) {
		// <? processing instruction
		const close = text.indexOf('?>', i + 2);
		const pi_end = close === -1 || close + 2 > end ? end : close + 2;
		l.leaf(T_PROCESSING_INSTRUCTION, i, pi_end);
		return pi_end;
	}
	const after_tag = lex_markup_tag(l, i, end, html_mode);
	// rawtext elements — html mode, opening tags only; a self-closing slash is
	// ignored (per HTML parsing, `<script/>` still opens script data)
	if (html_mode && after_tag > i + 1 && text.charCodeAt(i + 1) !== 47) {
		const raw_name = rawtext_name_at(text, i + 1, end);
		if (raw_name !== null) {
			return lex_markup_rawtext(l, raw_name, after_tag, end);
		}
	}
	return after_tag;
};

const lex_markup_window = (l: Lexer, html_mode: boolean): void => {
	const {text, end} = l;
	let i = l.pos;
	while (i < end) {
		let lt = text.indexOf('<', i);
		if (lt === -1 || lt >= end) lt = end;
		if (lt > i) lex_markup_entities(l, i, lt);
		if (lt >= end) break;
		i = lex_markup_construct(l, lt, end, html_mode);
	}
	l.pos = end;
};

const lex_markup_html = (l: Lexer): void => {
	lex_markup_window(l, true);
};

const lex_markup_xml = (l: Lexer): void => {
	lex_markup_window(l, false);
};

/**
 * The HTML markup language registration for the lexer engine.
 */
export const lexer_markup: SyntaxLang = {
	id: 'markup',
	aliases: ['html', 'mathml', 'svg'],
	lex: lex_markup_html,
};

/**
 * The XML language registration — the same scanner without HTML's rawtext
 * elements or `style=`/`on*=` attribute embedding.
 */
export const lexer_xml: SyntaxLang = {
	id: 'xml',
	aliases: ['ssml', 'atom', 'rss'],
	lex: lex_markup_xml,
};
