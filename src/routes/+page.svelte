<script lang="ts">
	import LibrarySummary from '@fuzdev/fuz_ui/LibrarySummary.svelte';
	import DocsFooter from '@fuzdev/fuz_ui/DocsFooter.svelte';
	import Card from '@fuzdev/fuz_ui/Card.svelte';
	import {library_context} from '@fuzdev/fuz_ui/library.svelte.js';
	import {resolve} from '$app/paths';
	import DeclarationLink from '@fuzdev/fuz_ui/DeclarationLink.svelte';

	import Code from '$lib/Code.svelte';

	const library = library_context.get();

	const svelte_example = '<h1>hello {name}</h1>';
	const ts_example = 'const x: number = 42;';
	const css_example = '.card { color: var(--color_a); }';
</script>

<main class="box width:100%">
	<div class="width_atmost_md">
		<section class="box" style:padding-top="var(--docs_primary_nav_height, 60px)">
			<LibrarySummary {library} />
		</section>
		<section class="box">
			<Card href={resolve('/docs')}
				>docs{#snippet icon()}{library.package_json.glyph}{/snippet}</Card
			>
		</section>
		<section>
			<p>
				fuz_code is a library for syntax highlighting. It can output strings of HTML and Svelte
				components, and it has a <a href={resolve('/docs/usage#Preprocessor' as any)}
					>preprocessor</a
				>
				for static compilation. It's based on <a href="https://github.com/PrismJS/prism">Prism</a>
				(<a href="https://prismjs.com/">prismjs.com</a>) by
				<a href="https://lea.verou.me/">Lea Verou</a>. More at the
				<a href={resolve('/docs')}>docs</a>.
			</p>
			<p>
				To use fuz_css with Svelte, import the theme CSS file and <DeclarationLink name="Code" /> component:
			</p>
			<Code
				lang="ts"
				content={`import '@fuzdev/fuz_code/theme.css';
import Code from '@fuzdev/fuz_code/Code.svelte';`}
			/>
			<p>Svelte highlights by default:</p>
			<Code content={`<Code content={'${svelte_example}'} />`} />
			<Code content={svelte_example} />
			<p>Set <code>lang</code> for other languages:</p>
			<Code content={`<Code lang="ts" content="${ts_example}" />`} />
			<Code lang="ts" content={ts_example} />
			<Code content={`<Code lang="css" content={"${css_example}"} />`} />
			<Code lang="css" content={css_example} />
			<p>
				See the <a href={resolve('/docs')}>docs</a> for more.
			</p>
		</section>
		<section class="box gap_xl3 font_size_xl2">
			<div class="panel box p_lg gap_sm">
				<!-- TODO large variants of the chip? using `--font_size`? -->
				<a href={resolve('/samples')} class="chip px_xl py_sm">samples</a>
				<a href={resolve('/benchmark')} class="chip px_xl py_sm">benchmark</a>
				<a href={resolve('/about')} class="chip px_xl py_sm">about</a>
			</div>
		</section>
		<section>
			<DocsFooter {library} root_url="https://www.fuz.dev/" />
		</section>
	</div>
</main>

<style>
	main {
		/* TODO hacky */
		margin-bottom: var(--space_xl5);
		padding: var(--space_xl3) 0;
	}
	/* section {
		margin-bottom: var(--space_xl5);
		display: flex;
		flex-direction: column;
		align-items: center;
	} */
</style>
