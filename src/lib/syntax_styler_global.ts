import {SyntaxStyler} from './syntax_styler.ts';
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
