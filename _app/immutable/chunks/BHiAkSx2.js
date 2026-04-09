import"./DsnmJJEf.js";import{o as M,s as j}from"./ChCaQ_XJ.js";import{p as N,ar as O,Q as r,d as D,r as q,ap as P,a as f,b as z,aq as F,aj as y,B as x,f as v,D as B,t as I,c as Q}from"./CwECmZ5F.js";import{p as k,i as R,r as U}from"./Ckwz7Ts2.js";import{h as J}from"./RBIoaflx.js";import{s as S}from"./CIHwKPuf.js";import{a as X,C as G}from"./DWqxD6Y7.js";import{b as Y}from"./Brbsj0oi.js";import{s as V,t as K}from"./D1mF2BaG.js";const de={json_complex:{name:"json_complex",lang:"json",content:`{
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

	let c: boolean = $state.raw(true);

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

### Bash

\`\`\`bash
if [[ $name =~ ^[a-z]+$ ]]; then
	echo "hello $(whoami)"
fi
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
`},bash_complex:{name:"bash_complex",lang:"bash",content:`#!/bin/bash

# This is a comment
name="world"
readonly PI=3.14
local_var='single quoted'
ansi_string=$'tab\\there\\nnewline'

# Special variables
echo $0 $1 $@ $# $? $$ $!

# Parameter expansion
echo \${name}
echo \${name:-default}
echo \${#name}

# Arrays
arr=(one two three)
echo \${arr[0]}
echo \${arr[@]}
echo \${#arr[@]}
arr+=(four)

# Associative arrays
declare -A map
map[key]="value"
echo \${map[key]}
echo \${!map[@]}

# Control flow
if [ -f "$name" ]; then
	echo "file exists"
elif [[ $name == "world" ]]; then
	echo "hello world"
else
	echo "something else"
fi

# Regex match in [[
if [[ $name =~ ^[a-z]+$ ]]; then
	echo "lowercase"
fi

# Loops
for i in 1 2 3; do
	echo $i
done

for ((i = 0; i < 10; i++)); do
	echo $i
done

while read -r line; do
	echo "$line"
done < input.txt

until false; do
	break
done

# Select menu
select opt in "Option 1" "Option 2" "Quit"; do
	case $opt in
		Quit) break ;;
		*) echo "You chose $opt" ;;
	esac
done

# Case statement
case "$name" in
	hello)
		echo "hi"
		;;
	world|earth)
		echo "globe"
		;;
	*)
		echo "unknown"
		;;
esac

# Functions
greet() {
	local greeting="Hello"
	echo "$greeting, $1!"
	return 0
}

function cleanup {
	echo "cleaning up"
}

# Command substitution
today=$(date +%Y-%m-%d)
files=$(ls -la | grep "\\.txt$")

# Arithmetic expansion
result=$(( 2 + 3 * 4 ))
(( count++ ))
(( x = y > 0 ? y : -y ))

# Here-document
cat <<EOF
Hello, \${name}!
Today is $(date).
single
word
lines
EOF

cat <<-'NOEXPAND'
	No $variable expansion here.
	Tabs are stripped with <<-
NOEXPAND

cat <<"QUOTED"
Also no $expansion here.
QUOTED

# Here-string
read -r first_word <<< "hello world"

# Process substitution
diff <(sort file1.txt) <(sort file2.txt)
tee >(grep error > errors.log) >(grep warn > warns.log)

# Operators and redirections
echo "output" > file.txt
echo "append" >> file.txt
cat < input.txt
cmd 2>&1
cmd &>/dev/null
cmd 2>/dev/null

# Pipeline
ls -la | sort | head -5

# Logical operators
true && echo "success" || echo "failure"
! false && echo "negated"

# Inline comment
echo "hello" # after code

# Subshells and grouping
(cd /tmp && ls -la)
{ echo "grouped"; echo "commands"; }

# Nested quotes and escaping
echo "it's a \\"test\\""
echo "path is: $HOME/dir"
echo 'no $expansion here'
echo "nested $(echo "inner $(echo deep)")"

# Multiline with backslash
command --flag1 \\
	--flag2 \\
	--flag3

# Builtins
export PATH="/usr/local/bin:$PATH"
cd /tmp
pwd
source ~/.bashrc
eval "echo hello"
exec bash
test -d /tmp
set -euo pipefail
trap 'cleanup' EXIT INT TERM
declare -a array
declare -A assoc_array
shift 2
command ls
hash -r
type ls
ulimit -n 1024
umask 022
wait $!
jobs -l
bg %1
fg %1
disown %1
shopt -s globstar

# Numbers
hex=0xFF
octal=077
binary=2#1010
decimal=42
`}},W={token_processing_instruction:1,token_doctype:1,token_cdata:1,token_punctuation:1,token_tag:2,token_constant:2,token_symbol:2,token_deleted:2,token_keyword:2,token_null:2,token_boolean:2,token_interpolation_punctuation:2,token_heading:2,token_heading_punctuation:2,token_tag_punctuation:2,token_comment:3,token_char:3,token_inserted:3,token_blockquote:3,token_blockquote_punctuation:3,token_builtin:4,token_class_name:4,token_number:4,token_attr_value:5,token_attr_quote:5,token_string:5,token_template_punctuation:5,token_inline_code:5,token_code_punctuation:5,token_attr_equals:6,token_selector:7,token_function:7,token_regex:7,token_important:7,token_variable:7,token_atrule:8,token_attr_name:9,token_property:9,token_decorator:9,token_decorator_name:9,token_link_text_wrapper:9,token_link_text:9,token_link_punctuation:9,token_special_keyword:10,token_namespace:10,token_rule:10,token_at_keyword:11,token_url:11,token_strikethrough:13,token_bold:14,token_italic:15},$=()=>!!(globalThis.CSS?.highlights&&globalThis.Highlight);class Z{element_ranges;constructor(){if(!$())throw Error("CSS Highlights API not supported");this.element_ranges=new Map}highlight_from_syntax_tokens(e,a){let n=null;for(const s of e.childNodes)if(s.nodeType===Node.TEXT_NODE){n=s;break}if(!n)throw new Error("no text node to highlight");this.clear_element_ranges();const h=new Map,p=this.#e(a,n,h,0),o=n.textContent?.length??0;if(p!==o)throw new Error(`Token stream length mismatch: tokens covered ${p} chars but text node has ${o} chars`);for(const[s,d]of h){const l=`token_${s}`;this.element_ranges.set(l,d);let t=CSS.highlights.get(l);t||(t=new Highlight,t.priority=W[l]??0,CSS.highlights.set(l,t));for(const m of d)t.add(m)}}clear_element_ranges(){for(const[e,a]of this.element_ranges){const n=CSS.highlights.get(e);if(!n)throw new Error("Expected to find CSS highlight: "+e);for(const h of a)n.delete(h);n.size===0&&CSS.highlights.delete(e)}this.element_ranges.clear()}destroy(){this.clear_element_ranges()}#e(e,a,n,h){const p=a.textContent?.length??0;let o=h;for(const s of e){if(typeof s=="string"){o+=s.length;continue}const d=s.length,l=o+d;if(l>p)throw new Error(`Token ${s.type} extends beyond text node: position ${l} > length ${p}`);try{const t=new Range;t.setStart(a,o),t.setEnd(a,l);const m=s.type;n.has(m)||n.set(m,[]),n.get(m).push(t);for(const u of s.alias){n.has(u)||n.set(u,[]);const g=new Range;g.setStart(a,o),g.setEnd(a,l),n.get(u).push(g)}}catch(t){throw new Error(`Failed to create range for ${s.type}: ${t}`)}if(Array.isArray(s.content)){const t=this.#e(s.content,a,n,o);if(t!==l)throw new Error(`Token ${s.type} length mismatch: claimed ${d} chars (${o}-${l}) but nested content covered ${t-o} chars (${o}-${t})`);o=t}else o=l}return o}}var ee=Q("<code><!></code>");function me(w,e){N(e,!0);const a=k(e,"lang",3,"svelte"),n=k(e,"mode",3,"auto"),h=k(e,"inline",3,!1),p=k(e,"wrap",3,!1),o=k(e,"syntax_styler",3,V),s=U(e,["$$slots","$$events","$$legacy","content","lang","mode","grammar","inline","wrap","syntax_styler","children"]);let d=F(void 0);const l=$(),t=l?new Z:null,m=y(()=>l&&(n()==="ranges"||n()==="auto")),u=y(()=>a()!==null&&!!o().langs[a()]),g=y(()=>a()===null||!r(u)&&!e.grammar),T=y(()=>r(m)||!e.content||r(g)?"":o().stylize(e.content,a(),e.grammar));t&&O(()=>{if(!r(d)||!e.content||!r(m)||r(g)){t.clear_element_ranges();return}const i=K(e.content,e.grammar||o().get_lang(a()));t.highlight_from_syntax_tokens(r(d),i)}),M(()=>{t?.destroy()});var _=ee();X(_,()=>({...s,"data-lang":a(),[G]:{inline:h(),wrap:p()}}),void 0,void 0,void 0,"svelte-mit54u");var H=D(_);{var E=i=>{var c=x(),b=v(c);S(b,()=>e.children,()=>e.content),f(i,c)},A=i=>{var c=B();I(()=>j(c,e.content)),f(i,c)},C=i=>{var c=x(),b=v(c);S(b,()=>e.children,()=>r(T)),f(i,c)},L=i=>{var c=x(),b=v(c);J(b,()=>r(T)),f(i,c)};R(H,i=>{r(m)&&e.children?i(E):r(m)||r(g)?i(A,1):e.children?i(C,2):i(L,-1)})}q(_),Y(_,i=>P(d,i),()=>r(d)),f(w,_),z()}export{me as C,de as s};
