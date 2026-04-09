<script lang="ts">
	import {tick, type Component} from 'svelte';

	import type {BenchmarkComponentProps} from './benchmark_types.js';
	import BenchmarkInstance from './BenchmarkInstance.svelte';
	import {ensure_paint} from './benchmark_dom.js';

	/* eslint-disable no-console */

	const RENDER_TIMEOUT_MS = 10000;

	let current_component: Component<BenchmarkComponentProps> | null = $state.raw(null);
	let current_props: BenchmarkComponentProps | null = $state.raw(null);
	let render_resolver: (() => void) | null = null;
	let iteration_key = $state.raw(0);
	const handle_render_complete = () => {
		if (render_resolver) {
			render_resolver();
			render_resolver = null;
		}
	};

	let active_timeout_id: ReturnType<typeof setTimeout> | undefined;
	export const run_iteration = async (
		component: Component<BenchmarkComponentProps>,
		props: BenchmarkComponentProps,
	): Promise<number> => {
		iteration_key++;

		const render_promise: Promise<void> = new Promise((resolve, reject) => {
			render_resolver = resolve;

			active_timeout_id = setTimeout(() => {
				if (render_resolver) {
					console.error('[Harness] Render timeout after', RENDER_TIMEOUT_MS, 'ms');
					render_resolver = null;
					active_timeout_id = undefined;
					reject(new Error(`Render timeout after ${RENDER_TIMEOUT_MS}ms`));
				}
			}, RENDER_TIMEOUT_MS);
		});

		const start = performance.now();

		try {
			current_component = component;
			current_props = props;

			await render_promise;

			if (active_timeout_id) {
				clearTimeout(active_timeout_id);
				active_timeout_id = undefined;
			}

			const end = performance.now();
			const elapsed = end - start;

			await ensure_paint();

			return elapsed;
		} catch (error) {
			console.error('[Harness] Render failed:', error);
			throw error;
		} finally {
			await cleanup();
		}
	};
	export const cleanup = async (): Promise<void> => {
		current_component = null;
		current_props = null;
		render_resolver = null;

		if (active_timeout_id) {
			clearTimeout(active_timeout_id);
			active_timeout_id = undefined;
		}

		await tick();
	};
</script>

{#if current_component && current_props}
	{#key iteration_key}
		<BenchmarkInstance
			BenchmarkedComponent={current_component}
			props={current_props}
			on_render_complete={handle_render_complete}
		/>
	{/key}
{/if}
