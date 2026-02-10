<script lang="ts">
	import TomeContent from '@fuzdev/fuz_ui/TomeContent.svelte';
	import DeclarationLink from '@fuzdev/fuz_ui/DeclarationLink.svelte';
	import {get_tome_by_name} from '@fuzdev/fuz_ui/tome.js';
	import {resolve} from '$app/paths';

	const tome = get_tome_by_name('samples');
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
			<a href={resolve('/samples')} class="chip color_g font_size_lg">view samples</a>
		</p>
	</section>
</TomeContent>
