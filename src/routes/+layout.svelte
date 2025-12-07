<script lang="ts">
	import '@fuzdev/fuz_css/style.css';
	import '@fuzdev/fuz_css/theme.css';
	import '$lib/theme.css';
	import '$routes/moss.css';
	import '$routes/style.css';

	import Themed from '@ryanatkn/fuz/Themed.svelte';
	import {Library, library_context} from '@ryanatkn/fuz/library.svelte.js';
	import type {Snippet} from 'svelte';

	import {library_json} from '$routes/library.js';

	const {
		children,
	}: {
		children: Snippet;
	} = $props();

	library_context.set(new Library(library_json));
</script>

<svelte:head>
	<title>@ryanatkn/fuz_code</title>
</svelte:head>

<Themed>
	{@render children()}
</Themed>
