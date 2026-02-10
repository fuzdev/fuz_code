var X=Object.defineProperty;var D=n=>{throw TypeError(n)};var K=(n,e,t)=>e in n?X(n,e,{enumerable:!0,configurable:!0,writable:!0,value:t}):n[e]=t;var N=(n,e,t)=>K(n,typeof e!="symbol"?e+"":e,t),Q=(n,e,t)=>e.has(n)||D("Cannot "+t);var z=(n,e,t)=>e.has(n)?D("Cannot add the same private member more than once"):e instanceof WeakSet?e.add(n):e.set(n,t);var j=(n,e,t)=>(Q(n,e,"access private method"),t);import"./Bzak7iHL.js";import{o as W,s as Y}from"./Bp9kQEQi.js";import{p as Z,aG as $,D as r,au as ee,aa as C,f as te,d as ne,r as oe,al as ae,b as _,c as se,a8 as S,a as T,a9 as O,ac as ie,t as le}from"./BoFqiF_g.js";import{p as H,r as re,i as A}from"./CmgneXan.js";import{h as ce}from"./DsXt31GT.js";import{a as de,C as me}from"./DX0fpRmg.js";import{b as he}from"./C8Bq1EaC.js";import{s as pe,t as ge}from"./DU8bY4_f.js";const Ee={json_complex:{name:"json_complex",lang:"json",content:`{
	"string": "a string",
	"number": 12345,
	"boolean": true,
	"null": null,
	"empty": "",
	"escaped": "quote: \\"test\\" and backslash: \\\\",
	"object": {
		"array": [1, "b", false],
		"strings": ["1", "2", "3"],
		"mixed": ["start", 123, true, "middle", null, "end"],
		"nested": [["a", "str", ""], {"key": "nested value"}]
	}
}
`},css_complex:{name:"css_complex",lang:"css",content:`.some_class {
	color: red;
}

.hypen-class {
	font-size: 16px;
}

p {
	box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
}

/* comment */

/*
multi
.line {
	i: 100px

</style>

@media*/

#id {
	background-color: blue;
}

div > p {
	margin: 10px;
}

@media (max-width: 600px) {
	body {
		background-color: light-dark(lightblue, darkblue);
	}
}

.content::before {
	/* prettier-ignore */
	content: "</style> /* not a comment */";
}

.attr[title='Click: here'] {
	background-image: url('data:image/svg+xml...');
}
`},ts_complex:{name:"ts_complex",lang:"ts",content:`const a = 1;

const b: string = 'b';

const c = true;

export type SomeType = 1 | 'b' | true;

declare const some_decorator: any;

abstract class Base {
	abstract abstract_method(): void;
}

/* eslint-disable no-console */

@some_decorator
class D extends Base {
	readonly d1: string = 'd';
	d2: number;
	d3 = $state(null);

	@some_decorator
	decorated = true;

	constructor(d2: number) {
		super();
		this.d2 = d2;
	}

	abstract_method(): void {
		// implementation
	}

	@some_decorator('example', {option: true})
	class_method(): string {
		return \`Hello, \${this.d1}\`;
	}

	instance_method = (): void => {
		/* ... */
		let i = 0;
		do {
			i++;
		} while (i < 3);

		for (const c2 of this.d1) {
			if (c2 === 'd') continue;
			if (!c2) break;
			this.#private_method(a, c2);
		}

		switch (this.d1) {
			case 'a':
				console.log('case a');
				break;
			case 'b':
			case 'c':
				console.log('case b or c');
				break;
			default:
				console.log('default');
		}

		const obj: {has_d1?: boolean; is_d: boolean} = {
			has_d1: 'd1' in this,
			is_d: this instanceof D,
		};
		delete obj.has_d1;
		// foo
	};

	#private_method(a2: number, c2: any): void {
		throw new Error(\`\${this.d1}
			multiline
			etc \${a2 + c2}
		\`);
	}

	*generator(): Generator<number | Array<number>> {
		yield 1;
		yield* [2, 3];
	}

	async *async_generator(): AsyncGenerator<number> {
		yield await Promise.resolve(4);
	}

	protected async protected_method(): Promise<void> {
		try {
			await new Promise((resolve) => setTimeout(resolve, 100));
			if (Math.random() > 0.5) {
				console.log(new Date());
			} else if (Math.random() > 0.2) {
				console.log('else if branch');
			} else {
				console.log('else branch');
			}
		} catch (error: unknown) {
			console.error(error);
		} finally {
			console.log('finally block');
		}
	}
}

// comment

/*
other comment

const comment = false;
*/

/**
 * JSDoc comment
 */

import {sample_langs, type SampleLang} from '../../../lib/code_sample.js';
import * as A from '../../../lib/code_sample.js';

export {a, A, b, c, D};

sample_langs as unknown as SampleLang satisfies SampleLang;

export interface SomeE<T = null> {
	name: string;
	age: number;
	t?: T;
}

const e: {name: string; age: number} = {name: 'A. H.', age: 100};
const v = [['', e]] as const;
export const some_e: Map<string, SomeE> = new Map(v);

export function add(x: number, y: number): number {
	return x + y;
}

export const plus = (a: any, b: any): any => a + b;

// boundary test cases
export const str_with_keywords = 'const class function string';
export const str_with_comment = '// this is not a comment';
export const template_with_expr = \`Value: \${1 + 2}\`;

// regex that looks like comment
export const regex = /\\/\\/.*/g;
export const complex_regex = /^(?:\\/\\*.*?\\*\\/|\\/\\/.*|[^/])+$/;

// string in comment should not be highlighted as string
// const commented = "this string is in a comment";
`},html_complex:{name:"html_complex",lang:"html",content:`<!doctype html>

<div class="test">
	<p>hello world!</p>
</div>

<p class="some_class hypen-class">a <b>b</b></p>

<button type="button" disabled>click me</button>

<!-- comment <div>a<br /> b</div> <script> -->

<br />

<hr onclick="console.log('hi')" />

<img src="image.jpg" alt="access" />

<ul>
	<li>list item 1</li>
	<li>list item 2</li>
</ul>

<form action="/submit" method="post">
	<input type="text" name="username" />
	<select name="option" data-role="dropdown">
		<option value="1">First</option>
		<option value="2">Second</option>
	</select>
</form>

<script>
	const ok = '<style>';
<\/script>

<style type="text/css">
	.special::before {
		content: '< & >';
	}
</style>

<![CDATA[ if (a < 0) alert("b"); <not-a-tag> ]]>
`},svelte_complex:{name:"svelte_complex",lang:"svelte",content:`<script lang="ts" module>
	export const HELLO = 'world';
<\/script>

<script lang="ts">
	// @ts-expect-error
	import Thing from './Thing.svelte';
	import type {Snippet} from 'svelte';

	const {
		thing,
		bound = $bindable(true),
		children,
		onclick,
	}: {
		thing: Record<string, any>;
		bound?: boolean;
		children: Snippet;
		onclick?: () => void;
	} = $props();

	const thing_keys = $derived(Object.entries(thing));

	const a = 1 as number;

	const b = 'b';

	let c: boolean = $state(true);

	const f = (p: any): any => p;

	const attachment = (_p1: string, _p2: number) => {
		return (el: HTMLElement) => {
			element_ref !== el;
		};
	};

	let value = $derived(thing['']);
	let element_ref: HTMLElement;
<\/script>

<h1 bind:this={element_ref}>hello {HELLO}!</h1>

{#each thing_keys as [k, { t, u }] (f(k))}
	{@const v = Math.round(t[k + f(u)])}
	{f(v)}
{/each}

{#if f(c)}
	<Thing string_prop="a {f('s')} b" number_prop={f(1)} />
{:else if f(a > 0)}
	bigger
{:else}
	<Thing string_prop="b" onthing={() => (c = f(!c))}>
		{@render children()}
	</Thing>
{/if}

<!-- eslint-disable-next-line svelte/no-at-html-tags -->
{@html '<strong>raw html</strong>'}

<input bind:value type="text" class:active={c} />

<span {@attach attachment('param', f(42))}>...</span>

<div {@attach f(() => {
	// function attachment arg
})}>
	complex
</div>

{@render my_snippet('p')}

{#snippet my_snippet(p: string)}
	<button type="button" {onclick}>{p}</button>
{/snippet}

<p class="some_class hypen-class" id="unique_id">
	some <span class="a b c">text</span>
</p>

<button type="button" disabled> click me </button>

<!-- comment <div>a<br /> {b}</div> -->
{b.repeat(2)}
{bound}

<br />

<hr />

<img src="image.jpg" alt="access" />

<ul>
	<li>list item 1</li>
	<li>list item 2</li>
</ul>

<!-- embedded tags for boundary testing -->
<div>
	<script>
		const inline_js = 'no lang attr';
	<\/script>
	<style>
		.inline {
			color: blue;
		}
	</style>
</div>

<style>
	.some_class {
		color: red;
	}

	.hypen-class {
		font-size: 16px;
	}

	p {
		box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
	}

	/* comment */

	/*
	multi
	line

	<comment>

	*/

	#unique_id {
		background-color: blue;
	}

	@media (max-width: 600px) {
		:global(body) {
			background-color: light-dark(lightblue, darkblue);
		}
	}

	:global(.escapehatch)::before {
		content: '< & >';
	}
</style>
`},md_complex:{name:"md_complex",lang:"md",content:`# Heading 1

## Heading 2

### Heading 3

#### Heading 4

##### Heading 5

###### Heading 6

## Inline formatting

This is **bold text** and this is also __bold text__.

This is _italic text_ and this is also *italic text*.

This is ~~strikethrough text~~.

This is \`inline code\` with backticks.

This is a [link to example](https://example.com) in text.

## Lists

- list item 1
- list item 2
- list item 3

* alternative list item 1
* alternative list item 2
  - indented list item 1
  - indented list item 2
    - Deeply nested item

  - after a newline

## Blockquotes

> This is a blockquote.
> It can span multiple lines.

> Another blockquote with **bold** and _italic_.

## Fenced Code Blocks

### TypeScript

\`\`\`ts
function add(a: number, b: number): number {
	return a + b;
}
\`\`\`

#### TypeScript with alias 'typescript'

\`\`\`typescript
interface User {
	name: string;
	age: number;
}

const user: User = {name: 'Alice', age: 30};
\`\`\`

### JS

\`\`\`js
function add(a, b) {
	return a + b;
}
\`\`\`

#### JS with alias 'javascript'

\`\`\`javascript
const fifteen = multiply(5, 3);
\`\`\`

### CSS

\`\`\`css
.container {
	display: flex;
	font-size: 14px;
}
\`\`\`

### HTML

\`\`\`html
<!doctype html>
<div class="test">
	<p>hello world!</p>
</div>

<button type="button" disabled>click me</button>

<!-- comment -->
\`\`\`

#### HTML with alias 'markup'

\`\`\`markup
<ul>
	<li>a</li>
	<li>b</li>
</ul>
\`\`\`

### JSON

\`\`\`json
{
	"key": "value",
	"array": [1, 2, 3, true, false, null]
}
\`\`\`

### Svelte

\`\`\`svelte
<script lang="ts">
	let count: number = $state(0);
	const increment = () => count++;
<\/script>

<button type="button" onclick={increment}>
	Count: {count}
</button>

<style>
	button {
		padding: 8px 16px;
	}
</style>
\`\`\`

### Unknown Language

\`\`\`python
def hello(name):
    print(f"Hello, {name}!")

hello("world")
\`\`\`

## Edge Cases

**bold** and **bold** in the same line.

_italic_ and _italic_ in the same line.

**bold** with _italic_ and ~~strikethrough~~ all mixed.

\`code\`, **bold**, _italic_ + [a link](https://example.com).

Not bold: ** spaces around **, ** spaces around **.

Not italic: _ spaces around _, _ spaces around _.

Not code: \`
multiline\`.

\`\`\`

Empty fence above.

\`\`\`unknownlang
Plain text for unknown language.
const variable = 2;
\`\`\`

Nested fences (3 to 5):

\`\`\`\`\`md
with \`five\` fences
\`\`\`\`md
with \`four\` fences
\`\`\`html
<style>
	body { color: red; }
</style>
\`\`\`
ending \`four\`
\`\`\`\`
another \`four\`
\`\`\`\`ts
const a = '5';
\`\`\`\`
ending \`five\`
\`\`\`\`\`

## HTML Support

Since Markdown extends HTML, raw HTML is also styled:

<div class="container">
	<p>This HTML is <strong>styled</strong> correctly!</p>
</div>

HTML can wrap code blocks:

<div>

\`\`\`ts
const example = 'embedded code';
\`\`\`

</div>
`}},ue={token_processing_instruction:1,token_doctype:1,token_cdata:1,token_punctuation:1,token_tag:2,token_constant:2,token_symbol:2,token_deleted:2,token_keyword:2,token_null:2,token_boolean:2,token_interpolation_punctuation:2,token_heading:2,token_heading_punctuation:2,token_tag_punctuation:2,token_comment:3,token_char:3,token_inserted:3,token_blockquote:3,token_blockquote_punctuation:3,token_builtin:4,token_class_name:4,token_number:4,token_attr_value:5,token_attr_quote:5,token_string:5,token_template_punctuation:5,token_inline_code:5,token_code_punctuation:5,token_attr_equals:6,token_selector:7,token_function:7,token_regex:7,token_important:7,token_variable:7,token_atrule:8,token_attr_name:9,token_property:9,token_decorator:9,token_decorator_name:9,token_link_text_wrapper:9,token_link_text:9,token_link_punctuation:9,token_special_keyword:10,token_namespace:10,token_rule:10,token_at_keyword:11,token_url:11,token_strikethrough:13,token_bold:14,token_italic:15},P=()=>{var n;return!!((n=globalThis.CSS)!=null&&n.highlights&&globalThis.Highlight)};var E,q;class _e{constructor(){z(this,E);N(this,"element_ranges");if(!P())throw Error("CSS Highlights API not supported");this.element_ranges=new Map}highlight_from_syntax_tokens(e,t){var p;let s=null;for(const a of e.childNodes)if(a.nodeType===Node.TEXT_NODE){s=a;break}if(!s)throw new Error("no text node to highlight");this.clear_element_ranges();const d=new Map,h=j(this,E,q).call(this,t,s,d,0),l=((p=s.textContent)==null?void 0:p.length)??0;if(h!==l)throw new Error(`Token stream length mismatch: tokens covered ${h} chars but text node has ${l} chars`);for(const[a,m]of d){const i=`token_${a}`;this.element_ranges.set(i,m);let o=CSS.highlights.get(i);o||(o=new Highlight,o.priority=ue[i]??0,CSS.highlights.set(i,o));for(const g of m)o.add(g)}}clear_element_ranges(){for(const[e,t]of this.element_ranges){const s=CSS.highlights.get(e);if(!s)throw new Error("Expected to find CSS highlight: "+e);for(const d of t)s.delete(d);s.size===0&&CSS.highlights.delete(e)}this.element_ranges.clear()}destroy(){this.clear_element_ranges()}}E=new WeakSet,q=function(e,t,s,d){var p;const h=((p=t.textContent)==null?void 0:p.length)??0;let l=d;for(const a of e){if(typeof a=="string"){l+=a.length;continue}const m=a.length,i=l+m;if(i>h)throw new Error(`Token ${a.type} extends beyond text node: position ${i} > length ${h}`);try{const o=new Range;o.setStart(t,l),o.setEnd(t,i);const g=a.type;s.has(g)||s.set(g,[]),s.get(g).push(o);for(const u of a.alias){s.has(u)||s.set(u,[]);const b=new Range;b.setStart(t,l),b.setEnd(t,i),s.get(u).push(b)}}catch(o){throw new Error(`Failed to create range for ${a.type}: ${o}`)}if(Array.isArray(a.content)){const o=j(this,E,q).call(this,a.content,t,s,l);if(o!==i)throw new Error(`Token ${a.type} length mismatch: claimed ${m} chars (${l}-${i}) but nested content covered ${o-l} chars (${l}-${o})`);l=o}else l=i}return l};var be=te("<code><!></code>");function Ce(n,e){Z(e,!0);const t=H(e,"lang",3,"svelte"),s=H(e,"mode",3,"auto"),d=H(e,"inline",3,!1),h=H(e,"wrap",3,!1),l=H(e,"syntax_styler",3,pe),p=re(e,["$$slots","$$events","$$legacy","content","lang","mode","grammar","inline","wrap","syntax_styler","children"]);let a=ee(void 0);const m=P(),i=m?new _e:null,o=C(()=>m&&(s()==="ranges"||s()==="auto")),g=C(()=>t()!==null&&!!l().langs[t()]),u=C(()=>t()===null||!r(g)&&!e.grammar),b=C(()=>r(o)||!e.content||r(u)?"":l().stylize(e.content,t(),e.grammar));i&&$(()=>{if(!r(a)||!e.content||!r(o)||r(u)){i.clear_element_ranges();return}const c=ge(e.content,e.grammar||l().get_lang(t()));i.highlight_from_syntax_tokens(r(a),c)}),W(()=>{i==null||i.destroy()});var y=be();de(y,()=>({...p,"data-lang":t(),[me]:{inline:d(),wrap:h()}}),void 0,void 0,void 0,"svelte-mit54u");var B=ne(y);{var J=c=>{var x=S(),L=T(x);O(L,()=>e.children,()=>e.content),_(c,x)},F=c=>{var x=S(),L=T(x);{var G=f=>{var v=ie();le(()=>Y(v,e.content)),_(f,v)},I=f=>{var v=S(),R=T(v);{var U=k=>{var w=S(),M=T(w);O(M,()=>e.children,()=>r(b)),_(k,w)},V=k=>{var w=S(),M=T(w);ce(M,()=>r(b)),_(k,w)};A(R,k=>{e.children?k(U):k(V,!1)},!0)}_(f,v)};A(L,f=>{r(o)||r(u)?f(G):f(I,!1)},!0)}_(c,x)};A(B,c=>{r(o)&&e.children?c(J):c(F,!1)})}oe(y),he(y,c=>ae(a,c),()=>r(a)),_(n,y),se()}export{Ce as C,Ee as s};
