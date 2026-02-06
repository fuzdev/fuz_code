# Code Static Compilation

Design document for a Svelte preprocessor that compiles `Code` component syntax highlighting at build time.

## Overview

**Goal**: Eliminate runtime syntax highlighting overhead by pre-rendering highlighted HTML at build time.

**Approach**: A Svelte preprocessor that:

1. Detects static string `content` props on `Code` components (resolved via imports)
2. Runs syntax highlighting at build time via `syntax_styler.stylize()`
3. Replaces `content` with `dangerous_raw_html` containing pre-highlighted HTML

## Current State

Code.svelte currently has a TODO for this:

```typescript
// TODO do syntax styling at compile-time in the normal case, and don't import these at runtime
// TODO @html making me nervous
```

The component already uses `{@html}` for highlighted output, so the security model doesn't change.

## Transformation

**Before**:

```svelte
<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';
</script>

<Code content="const x = 1;" lang="ts" />
<Code content={dynamic_value} lang="ts" />
```

**After**:

```svelte
<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';
</script>

<Code
	dangerous_raw_html={'<span class="token_keyword">const</span> x = <span class="token_number">1</span>;'}
	lang="ts"
/>
<Code content={dynamic_value} lang="ts" />
```

- Static `content` → `dangerous_raw_html` with pre-highlighted HTML (single-quoted JS string expression)
- Dynamic `content` unchanged (runtime highlighting)
- Other props preserved (`lang`, `inline`, `wrap`, etc.)

---

## Component Changes

### New Prop: dangerous_raw_html

```typescript
const {
	content,
	dangerous_raw_html, // NEW: pre-highlighted HTML from preprocessor
	lang = 'svelte',
	grammar,
	inline = false,
	wrap = false,
	nomargin = false,
	syntax_styler = syntax_styler_global,
	children,
	...rest
}: SvelteHTMLElements['code'] & {
	content?: string; // Now optional when dangerous_raw_html provided
	dangerous_raw_html?: string;
	// ... rest unchanged
} = $props();
```

### Short-circuit Derivations

Skip expensive computation when preprocessor already did the work:

```typescript
const language_supported = $derived(lang !== null && !!syntax_styler.langs[lang]);

const highlighting_disabled = $derived(lang === null || (!language_supported && !grammar));

const html_content = $derived.by(() => {
	if (dangerous_raw_html) return '';
	if (!content || highlighting_disabled) return '';
	return syntax_styler.stylize(content, lang!, grammar);
});

// Unified value for template and children snippet
const rendered_html = $derived(dangerous_raw_html || html_content);
```

### Skip DEV Warnings

Don't warn about unsupported language when preprocessor validated it:

```typescript
if (DEV) {
	$effect(() => {
		if (dangerous_raw_html) return;

		if (lang && !language_supported && !grammar) {
			const langs = Object.keys(syntax_styler.langs).join(', ');
			console.error(
				`[Code] Language "${lang}" is not supported and no custom grammar provided. ` +
					`Highlighting disabled. Supported: ${langs}`,
			);
		}
	});
}
```

### Template Changes

Uses `rendered_html` derived to unify `dangerous_raw_html` and `html_content`:

```svelte
<code {...rest} class:inline class:wrap class:nomargin data-lang={lang}
	>{#if highlighting_disabled && !dangerous_raw_html}{content}{:else if children}{@render children(
			rendered_html,
		)}{:else}{@html rendered_html}{/if}</code
>
```

- When `dangerous_raw_html` is set, `rendered_html` is the precompiled HTML
- When not set, `rendered_html` falls through to `html_content`
- `children` snippet always receives `rendered_html`, works for both cases
- `highlighting_disabled` only shows plain `content` when there's no precompiled HTML

---

## Preprocessor Implementation

### File: svelte_preprocess_code_static.ts

Location: `src/lib/svelte_preprocess_code_static.ts`

```typescript
import type {PreprocessorGroup} from 'svelte/compiler';
import {parse} from 'svelte/compiler';
import MagicString from 'magic-string';
import {walk} from 'zimmerframe';
import {syntax_styler_global} from './syntax_styler_global.js';
import type {SyntaxStyler} from './syntax_styler.js';

export interface PreprocessCodeStaticOptions {
	/** File patterns to exclude. */
	exclude?: (string | RegExp)[];

	/** Custom syntax styler. Default: syntax_styler_global */
	syntax_styler?: SyntaxStyler;

	/** Enable in-memory caching. Default: true */
	cache?: boolean;

	/**
	 * Import sources that resolve to the Code component.
	 * Used to verify that `<Code>` in templates actually refers to fuz_code's Code.svelte.
	 *
	 * @default ['@fuzdev/fuz_code/Code.svelte']
	 */
	component_imports?: string[];

	/**
	 * How to handle errors.
	 * @default 'throw' in CI, 'log' otherwise
	 */
	on_error?: 'log' | 'throw';

	/**
	 * How to handle warnings.
	 * @default 'log'
	 */
	on_warning?: 'log' | 'throw' | 'ignore';
}

export const svelte_preprocess_code_static = (
	options: PreprocessCodeStaticOptions = {},
): PreprocessorGroup => {
	const {
		exclude = [],
		syntax_styler = syntax_styler_global,
		cache = true,
		component_imports = ['@fuzdev/fuz_code/Code.svelte'],
		on_error = process.env.CI ? 'throw' : 'log',
		on_warning = 'log',
	} = options;

	// In-memory cache: content+lang hash → highlighted HTML
	const highlight_cache = new Map<string, string>();

	return {
		name: 'code-static',

		markup: ({content, filename}) => {
			// Skip excluded files
			if (should_exclude(filename, exclude)) {
				return {code: content};
			}

			// Quick check: does file contain Code component?
			if (!content.includes('Code')) {
				return {code: content};
			}

			const s = new MagicString(content);
			const ast = parse(content, {filename, modern: true});

			// Resolve which local names map to the Code component
			const code_names = resolve_code_names(ast, component_imports);
			if (code_names.size === 0) {
				return {code: content};
			}

			// Find Code component usages with static content
			const transformations = find_code_usages(ast, content, syntax_styler, code_names, {
				cache: cache ? highlight_cache : null,
				on_error,
				on_warning,
				filename,
			});

			if (transformations.length === 0) {
				return {code: content};
			}

			// Apply transformations
			for (const t of transformations) {
				s.overwrite(t.start, t.end, t.replacement);
			}

			return {
				code: s.toString(),
				map: s.generateMap({hires: true}),
			};
		},
	};
};
```

### Import Resolution

Resolve which local names in the file refer to the Code component:

```typescript
/**
 * Scans import declarations to find local names that import from known Code component sources.
 * Handles default imports, named imports, and aliased imports.
 */
function resolve_code_names(ast: SvelteAST, component_imports: string[]): Set<string> {
	const names = new Set<string>();

	// Walk the script AST (ast.instance) to find import declarations
	if (!ast.instance) return names;

	for (const node of ast.instance.content.body) {
		if (node.type !== 'ImportDeclaration') continue;
		if (!component_imports.includes(node.source.value as string)) continue;

		for (const specifier of node.specifiers) {
			// default import: `import Code from '...'`
			// aliased: `import Highlighter from '...'`
			// named: `import { default as Code } from '...'`
			names.add(specifier.local.name);
		}
	}

	return names;
}
```

### Detection Logic

```typescript
interface Transformation {
  start: number;
  end: number;
  replacement: string;
}

function find_code_usages(
  ast: SvelteAST,
  source: string,
  syntax_styler: SyntaxStyler,
  code_names: Set<string>,
  options: { cache: Map<string, string> | null; ... }
): Transformation[] {
  const transformations: Transformation[] = [];

  // Walk AST to find Component nodes matching resolved Code names
  walk(ast.fragment, null, {
    Component(node, context) {
      // Always recurse into children - without this, Code components
      // nested inside other components (e.g. <Wrapper><Code .../></Wrapper>)
      // would be missed, because zimmerframe does not auto-recurse
      // when a visitor is defined for a node type.
      context.next();

      if (!code_names.has(node.name)) return;

      const content_attr = find_attribute(node, 'content');
      const lang_attr = find_attribute(node, 'lang');

      // Skip if content is dynamic
      if (!content_attr || !is_static_string(content_attr.value)) {
        return;
      }

      // Skip if custom grammar or custom syntax_styler is provided
      if (find_attribute(node, 'grammar') || find_attribute(node, 'syntax_styler')) {
        return;
      }

      const content_value = extract_static_string(content_attr.value);
      const lang_value = lang_attr
        ? extract_static_string(lang_attr.value)
        : 'svelte';

      // Skip if lang is dynamic or null
      if (lang_value === null) return;

      // Skip unsupported language - runtime will handle
      if (!syntax_styler.langs[lang_value]) {
        return;
      }

      // Generate highlighted HTML
      const cache_key = `${lang_value}:${content_value}`;
      let html = options.cache?.get(cache_key);

      if (!html) {
        try {
          html = syntax_styler.stylize(content_value, lang_value);
          options.cache?.set(cache_key, html);
        } catch (error) {
          handle_error(error, options);
          return;
        }
      }

      // Create replacement: swap content attr to dangerous_raw_html expression
      const escaped_html = escape_js_string(html);
      const new_attr = `dangerous_raw_html={'${escaped_html}'}`;

      transformations.push({
        start: content_attr.start,
        end: content_attr.end,
        replacement: new_attr,
      });
    },
  });

  return transformations;
}
```

### JS String Escaping

The preprocessor outputs a Svelte expression `dangerous_raw_html={'...'}` containing a
single-quoted JS string literal. Single quotes are used because `stylize()` output contains
double quotes on every token span (`class="token_keyword"`), so wrapping with single quotes
avoids escaping all of those. Only single quotes in the actual highlighted source code
(e.g., string literals like `'hello'`) need escaping.

```typescript
function escape_js_string(html: string): string {
	return html
		.replace(/\\/g, '\\\\') // backslashes first
		.replace(/'/g, "\\'") // single quotes (rare: only in source code strings)
		.replace(/\n/g, '\\n') // newlines
		.replace(/\r/g, '\\r'); // carriage returns
}
```

The component's `{@html dangerous_raw_html}` receives the unescaped HTML string at runtime
and renders it directly. No double-escaping issues because Svelte evaluates the JS expression
to produce the string value before passing it as a prop.

### Static String Detection

Attribute values in the Svelte 5 modern AST can be static in multiple forms.
Determine the exact shapes during implementation:

- `content="text"` → `value` is `Text[]` with a single `Text` node
- `content={'text'}` → `value` is `ExpressionTag` with `Literal` expression
- ``content={`text`}`` → `value` is `ExpressionTag` with `TemplateLiteral` (no expressions)
- ``content={`${x}`}`` → `TemplateLiteral` with expressions → **dynamic, skip**

```typescript
function is_static_string(value: AttributeValue): boolean {
	// Plain attribute: content="text"
	if (Array.isArray(value) && value.length === 1 && value[0].type === 'Text') {
		return true;
	}
	// Expression with string literal: content={'text'}
	if (value.type === 'ExpressionTag') {
		const expr = value.expression;
		if (expr.type === 'Literal' && typeof expr.value === 'string') return true;
		// Template literal with no interpolations: content={`text`}
		if (expr.type === 'TemplateLiteral' && expr.expressions.length === 0) return true;
	}
	return false;
}
```

---

## Configuration

### svelte.config.js

```javascript
import {svelte_preprocess_code_static} from '@fuzdev/fuz_code/svelte_preprocess_code_static.js';
import {vitePreprocess} from '@sveltejs/vite-plugin-svelte';

export default {
	preprocess: [svelte_preprocess_code_static(), vitePreprocess()],
};
```

### With Options

```javascript
svelte_preprocess_code_static({
	// Skip test files
	exclude: [/\.test\.svelte$/, /fixtures\//],

	// Custom styler with additional grammars
	syntax_styler: my_custom_styler,

	// Additional import sources to recognize as the Code component
	component_imports: [
		'@fuzdev/fuz_code/Code.svelte',
		'$lib/components/MyCode.svelte', // local re-export
	],
});
```

### Conditional Use (dev vs prod)

The preprocessor is environment-agnostic. Users control when it runs via their config:

```javascript
import {svelte_preprocess_code_static} from '@fuzdev/fuz_code/svelte_preprocess_code_static.js';
import {vitePreprocess} from '@sveltejs/vite-plugin-svelte';

const dev = process.env.NODE_ENV !== 'production';

export default {
	preprocess: [...(!dev ? [svelte_preprocess_code_static()] : []), vitePreprocess()],
};
```

---

## Detection Rules

### Static (Transform)

```svelte
<Code content="const x = 1;" lang="ts" />
<Code content={'const x = 1;'} lang="ts" />
<Code content={`const x = 1;`} lang="ts" />
<Code lang="ts" content="const x = 1;" />
<!-- attr order doesn't matter -->
```

### Dynamic (Skip)

```svelte
<Code content={code_variable} lang="ts" />
<Code content={`const x = ${value};`} lang="ts" />
<Code content={show ? 'a' : 'b'} lang="ts" />
<Code content={get_code()} lang="ts" />
```

### Edge Cases

```svelte
<!-- No lang - defaults to 'svelte' -->
<Code content="<button>Click</button>" />

<!-- Explicit null lang - no highlighting, skip transform -->
<Code content="plain text" lang={null} />

<!-- Unknown lang - skip, let runtime handle/warn -->
<Code content="code" lang="unknown_lang" />

<!-- Custom grammar - skip, can't evaluate at build time -->
<Code content="code" lang="custom" grammar={my_grammar} />

<!-- Custom syntax_styler - skip, different config -->
<Code content="code" syntax_styler={custom_styler} />

<!-- Renamed import - resolved via import tracking -->
<script>
  import Highlighter from '@fuzdev/fuz_code/Code.svelte';
</script>
<Highlighter content="const x = 1;" lang="ts" />

<!-- Unrelated Code component - not from fuz_code, skip -->
<script>
  import Code from 'some-other-package/Code.svelte';
</script>
<Code content="const x = 1;" lang="ts" />
```

---

## Caching

### In-Memory Cache

Per-build cache keyed by `lang:content`:

```typescript
const cache = new Map<string, string>();
const key = `ts:const x = 1;`;
```

Same code highlighted once even if used in multiple files.

### Future: Disk Cache

Could extend to disk cache for persistence across builds:

```
.fuz/cache/code/
  abc123.json  # { content_hash, lang, html }
```

**Note**: A disk cache key must include a grammar version or hash, not just `lang:content`.
The in-memory cache is implicitly invalidated per-build, but a persistent cache would serve
stale HTML if grammar definitions change between fuz_code versions.

Deferred - in-memory sufficient for initial implementation.

---

## Error Handling

```typescript
interface CodePreprocessDiagnostic {
	level: 'error' | 'warning';
	message: string;
	suggestion: string | null;
	location: {
		file: string;
		line: number;
		column: number;
	};
}
```

### Error Scenarios

1. **Syntax highlighting fails**: Rare, but malformed content could cause issues
   - Action: Log warning, skip transformation (runtime will also fail, but that's existing behavior)

2. **Unknown language**: `lang="foo"` where foo isn't registered
   - Action: Skip transformation, let runtime handle (it already warns)

3. **Parse error**: Malformed Svelte file
   - Action: Throw (Svelte compiler would fail anyway)

---

## Tree-shaking Analysis

A key benefit beyond performance: if all `Code` usages in a file have static content, the
runtime highlighting imports (`syntax_styler_global`, grammar files) become dead code.

### Current state

The preprocessor replaces `content` attributes with `dangerous_raw_html` but does **not**
modify script imports. The component still imports `syntax_styler_global` internally:

```typescript
// Code.svelte internals
import {syntax_styler_global} from './syntax_styler_global.js';
```

This import exists in the component itself, so it's pulled in regardless of whether the
consumer's file imports it. Tree-shaking of grammar files is not possible through the
preprocessor alone because the component unconditionally imports the global instance.

### Possible approaches

**Option A: Do nothing (recommended for initial implementation)**

- The runtime cost is the module import, not the highlighting computation
- Grammars are registered once globally, this is a fixed cost
- The main win is eliminating per-render `stylize()` calls, which this preprocessor achieves

**Option B: Conditional imports in Code.svelte**

- Code.svelte could lazily import `syntax_styler_global` only when `dangerous_raw_html` is
  not provided
- Requires dynamic `import()` which complicates the component and may not tree-shake well

**Option C: Preprocessor removes the component entirely**

- For fully static cases, the preprocessor could replace `<Code dangerous_raw_html={'...'} />`
  with raw `<code data-lang="ts">{@html '...'}</code>`
- Eliminates the Code.svelte import entirely when all usages are static
- Significantly more complex: must replicate Code.svelte's CSS classes and structure
- Fragile: any change to Code.svelte's template breaks the preprocessor output

**Recommendation**: Start with Option A. The preprocessor's primary value is eliminating
runtime `stylize()` calls. Module import overhead is negligible compared to repeated
tokenization and HTML generation. Revisit if profiling shows import cost matters.

---

## Testing

### Unit Tests

```typescript
describe('svelte_preprocess_code_static', () => {
	test('transforms static content', async () => {
		const input = `<script>import Code from '@fuzdev/fuz_code/Code.svelte';</script>\n<Code content="const x = 1;" lang="ts" />`;
		const result = await preprocess(input, [svelte_preprocess_code_static()]);

		expect(result.code).toContain('dangerous_raw_html=');
		expect(result.code).toContain('token_keyword');
		expect(result.code).not.toContain('content="const');
	});

	test('preserves dynamic content', async () => {
		const input = `<script>import Code from '@fuzdev/fuz_code/Code.svelte';</script>\n<Code content={code} lang="ts" />`;
		const result = await preprocess(input, [svelte_preprocess_code_static()]);

		expect(result.code).toContain('content={code}');
		expect(result.code).not.toContain('dangerous_raw_html');
	});

	test('skips custom grammar', async () => {
		const input = `<script>import Code from '@fuzdev/fuz_code/Code.svelte';</script>\n<Code content="x" grammar={g} />`;
		const result = await preprocess(input, [svelte_preprocess_code_static()]);

		expect(result.code).toContain('content="x"');
	});

	test('skips unrelated Code component', async () => {
		const input = `<script>import Code from 'other-package/Code.svelte';</script>\n<Code content="x" lang="ts" />`;
		const result = await preprocess(input, [svelte_preprocess_code_static()]);

		expect(result.code).toContain('content="x"');
		expect(result.code).not.toContain('dangerous_raw_html');
	});

	test('handles renamed import', async () => {
		const input = `<script>import Highlighter from '@fuzdev/fuz_code/Code.svelte';</script>\n<Highlighter content="const x = 1;" lang="ts" />`;
		const result = await preprocess(input, [svelte_preprocess_code_static()]);

		expect(result.code).toContain('dangerous_raw_html=');
	});
});
```

### Fixture Tests

```
src/test/fixtures/svelte_preprocess_code_static/
├── basic/
│   ├── input.svelte
│   └── expected.svelte
├── multiple_langs/
│   ├── input.svelte
│   └── expected.svelte
├── mixed_static_dynamic/
│   ├── input.svelte
│   └── expected.svelte
└── renamed_import/
    ├── input.svelte
    └── expected.svelte
```

---

## Changesets

### Changeset 1: `add dangerous_raw_html prop to Code.svelte`

Component-only changes. Non-breaking, additive. Independently useful — consumers can pass
pre-highlighted HTML without the preprocessor.

1. Add `dangerous_raw_html` prop
2. Add `rendered_html` derived
3. Update `html_content` to short-circuit when `dangerous_raw_html` is set
4. Update template to use `rendered_html`
5. Update DEV warnings to skip when preprocessor validated

**Files**:

- `src/lib/Code.svelte` (modified)

### Changeset 2: `add svelte_preprocess_code_static`

The preprocessor, its tests, exports, and peer deps. Depends on changeset 1.

1. Create `svelte_preprocess_code_static.ts`
2. Implement import resolution (`resolve_code_names`)
3. Implement AST walking and static detection
4. Implement transformation with JS string escaping
5. Add in-memory caching
6. Unit tests and fixture tests
7. Add package.json export and optional peer deps
8. Integration test with real project

**Files**:

- `src/lib/svelte_preprocess_code_static.ts` (new)
- `src/test/svelte_preprocess_code_static.test.ts` (new)
- `src/test/fixtures/svelte_preprocess_code_static/**` (new)
- `package.json` (modified — export + optional peer deps: `magic-string`, `zimmerframe`)

---

## Open Concerns / Followup

### JS String Escaping Verification

The escaping approach (backslash-escape `\`, `'`, `\n`, `\r` inside a single-quoted JS
string expression) is standard. Single quotes minimize escaping since `stylize()` output
uses double quotes for HTML attributes. Needs testing with:

- Highlighted code containing single-quoted string literals (the main escape case)
- Highlighted code containing regex patterns with backslashes
- Very long highlighted output (ensure Svelte parser handles large string literals)
- Source code containing U+2028/U+2029 line separators (valid in ES2019+ string literals,
  but verify Svelte's parser handles them)

### Source Map Accuracy

Using `s.generateMap({ hires: true })` should produce accurate mappings, but need to verify:

- Debugging works correctly in browser devtools
- Error stack traces point to original source locations
- Source maps chain correctly when multiple preprocessors are used

### Zimmerframe AST Walking (verified)

Zimmerframe does NOT auto-recurse when a visitor is defined for a node type — visitors must
call `context.next()` explicitly. The detection logic accounts for this (calls `context.next()`
in the `Component` visitor). Verified via test: zimmerframe recurses into Svelte-specific
structures like `Fragment.nodes` via its default visitor, and `context.next()` correctly
finds Code components nested inside other components and HTML elements.

### Svelte AST Attribute Value Types (verified)

Confirmed attribute value type is `true | ExpressionTag | Array<Text | ExpressionTag>`:

- `true` for boolean attributes (e.g., `<Code inline />`)
- `ExpressionTag` for expressions (e.g., `content={foo}`)
- `Array<Text | ExpressionTag>` for quoted values (e.g., `content="text"`)

Verified via test:

- `content="text"` → `Array[Text]` with `.data`
- `content={'text'}` → `ExpressionTag` > `Literal` with `.value`
- ``content={`text`}`` → `ExpressionTag` > `TemplateLiteral` with `expressions.length === 0`
- ``content={`${x}`}`` → `TemplateLiteral` with `expressions.length > 0` (dynamic, skip)
- `content={variable}` → `ExpressionTag` > `Identifier` (dynamic, skip)
- `lang={null}` → `ExpressionTag` > `Literal` with `.value === null`

The `is_static_string` helper handles all shapes. `attribute.start`/`attribute.end`
span the full attribute including name and value — correct for our replacement.

### Package Exports

Add to package.json exports:

```json
{
	"exports": {
		"./svelte_preprocess_code_static.js": "./dist/svelte_preprocess_code_static.js"
	}
}
```

Verify TypeScript types are properly exported.

---

## References

- Code.svelte: `./src/lib/Code.svelte`
- SyntaxStyler: `./src/lib/syntax_styler.ts`
- fuz_css plugin (pattern reference): `~/dev/fuz_css/src/lib/vite_plugin_fuz_css.ts`
