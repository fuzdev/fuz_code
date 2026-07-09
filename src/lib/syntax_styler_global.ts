import {SyntaxStyler} from './syntax_styler.ts';
import {lexer_json} from './lexer_json.ts';
import {lexer_ts} from './lexer_ts.ts';
import {lexer_css} from './lexer_css.ts';
import {lexer_bash} from './lexer_bash.ts';
import {lexer_markup, lexer_xml} from './lexer_markup.ts';
import {lexer_svelte} from './lexer_svelte.ts';
import {add_grammar_markup} from './grammar_markup.ts';
import {add_grammar_css} from './grammar_css.ts';
import {add_grammar_clike} from './grammar_clike.ts';
import {add_grammar_js} from './grammar_js.ts';
import {add_grammar_ts} from './grammar_ts.ts';
import {add_grammar_svelte} from './grammar_svelte.ts';
import {add_grammar_json} from './grammar_json.ts';
import {add_grammar_bash} from './grammar_bash.ts';
import {add_grammar_markdown} from './grammar_markdown.ts';

/**
 * Pre-configured `SyntaxStyler` instance with all built-in grammars registered.
 *
 * @example
 * ```ts
 * import {syntax_styler_global} from '@fuzdev/fuz_code/syntax_styler_global.ts';
 *
 * const html = syntax_styler_global.stylize('const x = 1;', 'ts');
 * ```
 */
export const syntax_styler_global = new SyntaxStyler();

add_grammar_markup(syntax_styler_global);
add_grammar_css(syntax_styler_global);
add_grammar_clike(syntax_styler_global);
add_grammar_js(syntax_styler_global);
add_grammar_ts(syntax_styler_global);
add_grammar_svelte(syntax_styler_global);
add_grammar_json(syntax_styler_global);
add_grammar_bash(syntax_styler_global); // before markdown — markdown references bash for fenced code blocks
add_grammar_markdown(syntax_styler_global);

// Languages ported to the lexer engine — these take priority over the grammar
// registrations above in `stylize`; the grammars remain for the unported
// paths (`tokenize`, embedded regions in unported grammars like md fences).
syntax_styler_global.add_lexer_lang(lexer_json);
syntax_styler_global.add_lexer_lang(lexer_ts);
syntax_styler_global.add_lexer_lang(lexer_css);
syntax_styler_global.add_lexer_lang(lexer_bash);
syntax_styler_global.add_lexer_lang(lexer_markup);
syntax_styler_global.add_lexer_lang(lexer_xml);
syntax_styler_global.add_lexer_lang(lexer_svelte);
