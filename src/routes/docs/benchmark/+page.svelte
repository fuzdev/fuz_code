<script lang="ts">
	import TomeContent from '@fuzdev/fuz_ui/TomeContent.svelte';
	import {get_tome_by_name} from '@fuzdev/fuz_ui/tome.js';
	import {resolve} from '$app/paths';

	const tome = get_tome_by_name('benchmark');
</script>

<TomeContent {tome}>
	<section>
		<p>Performance benchmarking for testing syntax highlighting across all supported languages:</p>
		<p>
			<a href={resolve('/benchmark')} class="chip color_d font_size_lg">run benchmark</a>
		</p>
	</section>
</TomeContent>
