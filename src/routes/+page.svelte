<script lang="ts">
	import LibrarySummary from '@fuzdev/fuz_ui/LibrarySummary.svelte';
	import DocsFooter from '@fuzdev/fuz_ui/DocsFooter.svelte';
	import Card from '@fuzdev/fuz_ui/Card.svelte';
	import TomeContent from '@fuzdev/fuz_ui/TomeContent.svelte';
	import {DocsLinks, docs_links_context} from '@fuzdev/fuz_ui/docs_helpers.svelte.js';
	import {library_context} from '@fuzdev/fuz_ui/library.svelte.js';
	import {resolve} from '$app/paths';

	import CodeTome from '$routes/CodeTome.svelte';
	import {tomes} from '$routes/docs/tomes.js';

	const library = library_context.get();
	const tome = tomes.find((t) => t.name === 'usage')!;

	docs_links_context.set(new DocsLinks());
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
		<section class="box gap_xl3 font_size_xl2">
			<div class="panel box p_lg gap_sm">
				<!-- TODO large variants of the chip? using `--font_size`? -->
				<a href={resolve('/samples')} class="chip px_xl py_sm">samples</a>
				<a href={resolve('/benchmark')} class="chip px_xl py_sm">benchmark</a>
				<a href={resolve('/about')} class="chip px_xl py_sm">about</a>
			</div>
		</section>
		<section class="panel">
			<div class="shade_00 shadow_sm border_radius_xs p_xl2">
				<TomeContent {tome}>
					{#snippet header()}<h1 class="mt_0">Using fuz_code</h1>{/snippet}
					<CodeTome />
				</TomeContent>
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
