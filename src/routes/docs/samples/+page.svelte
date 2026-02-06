<script lang="ts">
	import TomeContent from '@fuzdev/fuz_ui/TomeContent.svelte';
	import {get_tome_by_name} from '@fuzdev/fuz_ui/tome.js';
	import {resolve} from '$app/paths';

	const tome = get_tome_by_name('samples');
</script>

<TomeContent {tome}>
	<section>
		<p>
			Code samples in all supported languages, rendered with both the standard HTML mode and the
			experimental CSS Custom Highlight API.
		</p>
		<p>
			<a href={resolve('/samples')} class="chip color_g">view samples</a>
		</p>
	</section>
</TomeContent>
