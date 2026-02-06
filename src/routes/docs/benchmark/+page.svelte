<script lang="ts">
	import TomeContent from '@fuzdev/fuz_ui/TomeContent.svelte';
	import {get_tome_by_name} from '@fuzdev/fuz_ui/tome.js';
	import {resolve} from '$app/paths';

	const tome = get_tome_by_name('benchmark');
</script>

<TomeContent {tome}>
	<section>
		<p>
			Performance benchmark for testing syntax highlighting across all supported languages at
			configurable sizes.
		</p>
		<p>
			<a href={resolve('/benchmark')} class="chip color_d">run benchmark</a>
		</p>
	</section>
</TomeContent>
