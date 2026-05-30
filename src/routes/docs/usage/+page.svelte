<script lang="ts">
	import TomeContent from '@fuzdev/fuz_ui/TomeContent.svelte';
	import {tome_get_by_slug} from '@fuzdev/fuz_ui/tome.js';

	import CodeTome from '$routes/CodeTome.svelte';

	const LIBRARY_ITEM_NAME = 'usage';

	const tome = tome_get_by_slug(LIBRARY_ITEM_NAME);
</script>

<TomeContent {tome}>
	<CodeTome />
</TomeContent>
