<script lang="ts">
	import {onMount, type Component} from 'svelte';

	import type {BenchmarkComponentProps} from './benchmark_types.js';
	import {ensure_paint} from './benchmark_dom.js';

	const {
		BenchmarkedComponent = null,
		props = null,
		on_render_complete = () => {}, // eslint-disable-line @typescript-eslint/no-empty-function
	}: {
		BenchmarkedComponent: Component<BenchmarkComponentProps> | null;
		props: BenchmarkComponentProps | null;
		on_render_complete?: () => void;
	} = $props();

	let container_el: HTMLDivElement;

	// Signal completion after mount+paint
	onMount(async () => {
		// TODO any tweaks to this, including order?
		// Force layout recalculation for all modes to ensure consistent timing,
		// and use them to ensure they can't be optimized.
		const code_el = container_el.querySelector('code');
		const rect = code_el!.getBoundingClientRect();
		const height = code_el!.offsetHeight;
		if (rect.width <= 0 || height <= 0) {
			console.error('Unexpected negative dimensions'); // eslint-disable-line no-console
		}

		await ensure_paint();

		on_render_complete();
	});
</script>

<div bind:this={container_el}>
	{#if BenchmarkedComponent && props}
		<BenchmarkedComponent {...props} />
	{/if}
</div>
