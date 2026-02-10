import {SyntaxStyler} from './syntax_styler.js';
import {add_grammar_markup} from './grammar_markup.js';
import {add_grammar_css} from './grammar_css.js';
import {add_grammar_clike} from './grammar_clike.js';
import {add_grammar_js} from './grammar_js.js';
import {add_grammar_ts} from './grammar_ts.js';
import {add_grammar_svelte} from './grammar_svelte.js';
import {add_grammar_json} from './grammar_json.js';
import {add_grammar_markdown} from './grammar_markdown.js';

/**
 * Pre-configured `SyntaxStyler` instance with all built-in grammars registered.
 *
 * @example
 * ```ts
 * import {syntax_styler_global} from '@fuzdev/fuz_code/syntax_styler_global.js';
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
add_grammar_markdown(syntax_styler_global);
