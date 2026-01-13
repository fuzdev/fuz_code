<script lang="ts">
	import {resolve} from '$app/paths';

	// import Tome from '@fuzdev/fuz_ui/Tome.svelte';
	// import DocsItem from '@fuzdev/fuz_ui/DocsItem.svelte';
	// import TomeLink from '@fuzdev/fuz_ui/TomeLink.svelte';
	import TomeLink from '$routes/TomeLink.svelte';
	import Code from '$lib/Code.svelte';

	// TODO what convention? `DocsTome`? Maybe just `Tome`? `/tomes`? both? what other options?

	// const LIBRARY_ITEM_NAME = 'Code';
</script>

<!-- eslint-disable svelte/no-useless-mustaches -->

<!-- <DocsItem name={LIBRARY_ITEM_NAME}> -->
<section>
	<h2 class="mt_0">Usage</h2>
	<p>
		The
		<TomeLink name="Code" />
		Svelte component supports syntax styling originally based on
		<a href="https://github.com/PrismJS/prism">Prism</a> by
		<a href="https://lea.verou.me/">Lea Verou</a>.
	</p>
	<p>To use it, import the default theme or your own:</p>
	<Code
		lang="ts"
		content="// +layout.svelte
import '@fuzdev/fuz_code/theme.css'; // add this"
	/>
	<p>then use <TomeLink name="Code" />:</p>
	<Code
		content={'<' +
			`script>\n\t// Something.svelte\n\timport Code from '@fuzdev/fuz_code/Code.svelte';\n</script>\n\n<Code content="<header>hello world</header>" />`}
	/>
	<p>outputs:</p>
	<Code content="<header>hello world</header>" />
</section>
<section>
	<h3>Dependencies</h3>
	<p>
		By default fuz_code depends on <a href="https://css.fuz.dev">fuz_css</a> to provide
		color-schema-aware color variables. If you're not using it, import
		<code>theme_variables.css</code> or bring your own:
	</p>
	<Code
		lang="ts"
		content="// +layout.svelte
import '@fuzdev/fuz_code/theme.css';
import '@fuzdev/fuz_code/theme_variables.css'; // also this if not using fuz_css"
	/>
</section>
<section>
	<h3>Caveats</h3>
	<p>
		The <code>Code</code> component generates HTML with CSS classes for text highlighting. It also
		includes experimental support for the CSS Custom Highlight API with <code>CodeHighlight</code>,
		see the
		<a href={resolve('/samples')}>samples</a>
		for more.
	</p>
	<p>
		Performing syntax styling at runtime like this is often wasteful. The plan is to provide a Vite
		plugin to optimize static cases. For now you can use <code>lang={'{'}null}</code> with pre-highligted
		HTML.
	</p>
</section>
<section>
	<h3>Svelte support</h3>
	<p>
		<TomeLink name="Code" /> styles
		<a href="https://svelte.dev/">Svelte</a>
		by default, originally based on
		<a href="https://github.com/pngwn/prism-svelte"><code>prism-svelte</code></a>
		by <a href="https://github.com/pngwn">@pngwn</a>:
	</p>
	<Code content={'<Code content="<scr..." />'} />
	<p>styled:</p>
	<div>
		<Code
			content={'<' +
				`script lang="ts">
	import Card from '@fuz.dev/fuz-library/Card.svelte';
	console.log('hello Card', Card);
</script>

<Card>
	<div class="greeting">hi {friend}</div>
</Card>`}
		/>
	</div>
</section>
<section>
	<h3>TypeScript support</h3>
	<p>
		<TomeLink name="Code" /> supports TypeScript with <code>lang="ts"</code>:
	</p>
	<Code content={`<Code lang="ts" content="export type A<T> = ('b' | 3) & T;" />`} />
	<div>
		<Code lang="ts" content={`export type A<T> = ('b' | 3) & T;`} />
	</div>
</section>
<section>
	<h3>Markdown support</h3>
	<p>
		<TomeLink name="Code" /> supports Markdown with <code>lang="md"</code>, and fenced blocks for
		all languages:
	</p>
	<Code content={`<Code lang="md" content="# hello \`world\` ..." />`} />
	<div>
		<Code lang="md" content={`# hello \`world\`\n\n\`\`\`ts\n\tconst a = 1;\n\`\`\``} />
	</div>
</section>
<section>
	<h3>Fallback to no styling</h3>
	<p>
		Passing <code>lang={'{'}null}</code> disables syntax styling:
	</p>
	<Code content={'<Code lang={null} content="<aside>all is gray</aside>" />'} />
	<Code lang={null} content={`<aside>all is gray</aside>`} />
</section>
<section>
	<h3>Layout</h3>
	<p>
		<TomeLink name="Code" /> is a block by default:
	</p>
	<div>ab<Code content="c" /></div>
	<Code content={'<div>ab<Code content="c" /></div>'} />
	<p>
		It can be inlined with <Code inline content={`<Code inline content="..." />`} />
	</p>
</section>

<!-- </DocsItem> -->
