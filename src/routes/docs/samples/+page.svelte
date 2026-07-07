<script lang="ts">
	import TomeContent from '@fuzdev/fuz_ui/TomeContent.svelte';
	import DeclarationLink from '@fuzdev/fuz_ui/DeclarationLink.svelte';
	import {tome_get_by_slug} from '@fuzdev/fuz_ui/tome.ts';
	import {resolve} from '$app/paths';

	const tome = tome_get_by_slug('samples');
</script>

<TomeContent {tome}>
	<section>
		<p>
			Here's some code samples in all supported languages, rendered with both <DeclarationLink
				name="Code"
			/>
			(standard HTML mode) and <DeclarationLink name="CodeHighlight" /> (experimental CSS Custom Highlight
			API):
		</p>
		<p>
			<a href={resolve('/samples')} class="chip palette_g font_size_lg">view samples</a>
		</p>
	</section>
</TomeContent>
