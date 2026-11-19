---
'@fuzdev/fuz_code': minor
---

feat: `SyntaxLang.snippet_prefix` guesses the context a snippet cut from a larger text starts in, so patch-only diffs (`create_diff_patch_source`) lex each run of hunks after it: the Svelte and HTML lexers find a hunk inside a `<script>` or `<style>` (and inside a block comment or a start tag), and the Markdown lexer one inside a fence, carrying what each hunk shows to the next. `create_markup_snippet_prefix` builds a markup language's, `includes_word` is a word-bounded `includes`, and `SyntaxSnippetPrefix` is the hook's result
