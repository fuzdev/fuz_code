<script lang="ts">
	import TomeContent from '@fuzdev/fuz_ui/TomeContent.svelte';
	import {get_tome_by_name} from '@fuzdev/fuz_ui/tome.js';

	import CodeTome from '$routes/CodeTome.svelte';

	const LIBRARY_ITEM_NAME = 'usage';

	const tome = get_tome_by_name(LIBRARY_ITEM_NAME);
</script>

<TomeContent {tome}>
	<CodeTome />
</TomeContent>
