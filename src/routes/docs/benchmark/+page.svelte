<script lang="ts">
	import TomeContent from '@fuzdev/fuz_ui/TomeContent.svelte';
	import {tome_get_by_slug} from '@fuzdev/fuz_ui/tome.ts';
	import {resolve} from '$app/paths';

	const tome = tome_get_by_slug('benchmark');
</script>

<TomeContent {tome}>
	<section>
		<p>Performance benchmarking for testing syntax highlighting across all supported languages:</p>
		<p>
			<a href={resolve('/benchmark')} class="chip color_d font_size_lg">run benchmark</a>
		</p>
	</section>
</TomeContent>
