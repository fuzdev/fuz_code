<script lang="ts">
	import 'virtual:fuz.css';
	import '$lib/theme.css';
	import '$routes/style.css';

	import ThemeRoot from '@fuzdev/fuz_ui/ThemeRoot.svelte';
	import {SiteState, site_context} from '@fuzdev/fuz_ui/site.svelte.js';
	import {logo_fuz_code} from '@fuzdev/fuz_ui/logos.js';
	import pkg_json from 'virtual:pkg.json';
	import type {Snippet} from 'svelte';

	const {
		children,
	}: {
		children: Snippet;
	} = $props();

	site_context.set(new SiteState({icon: logo_fuz_code, pkg_json}));
</script>

<svelte:head>
	<title>@fuzdev/fuz_code</title>
</svelte:head>

<ThemeRoot>
	{@render children()}
</ThemeRoot>
