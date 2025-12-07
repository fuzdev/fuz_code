<script lang="ts">
	import CopyToClipboard from '@fuzdev/fuz_ui/CopyToClipboard.svelte';

	import {fmt} from './benchmark_stats.js';
	import {RESULT_COLUMNS, results_to_markdown} from './benchmark_results.js';
	import type {BenchmarkResult, SummaryStats} from './benchmark_types.js';

	const {
		results = [],
		summary = null,
		warnings = [],
	}: {
		results: Array<BenchmarkResult>;
		summary: Record<string, SummaryStats> | null;
		warnings: Array<string>;
	} = $props();
</script>

{#if warnings.length > 0}
	<section class="panel p_md warning">
		<h3 class="mt_0">⚠️ Warnings</h3>
		<ul>
			{#each warnings as warning (warning)}
				<li>{warning}</li>
			{/each}
		</ul>
	</section>
{/if}

{#if summary}
	<section>
		<h2>Summary</h2>
		<div>
			{#each Object.entries(summary) as entry (entry)}
				{@const [impl, stats] = entry}
				<div>
					<h3>{impl}</h3>
					<div>
						<strong>{fmt(stats.avg_mean)}ms</strong>
						<span>avg time</span>
					</div>
					<div>
						<strong>{fmt(stats.avg_ops, 0)}</strong>
						<span>ops/sec</span>
					</div>
					<div>
						<strong>{fmt(stats.avg_cv * 100, 1)}%</strong>
						<span>CV</span>
					</div>
					{#if impl !== 'html' && stats.improvement !== undefined}
						<div>
							<strong class:positive={stats.improvement > 0} class:negative={stats.improvement < 0}>
								{stats.improvement > 0 ? '+' : ''}{fmt(stats.improvement, 1)}%
							</strong>
							<span>vs baseline</span>
						</div>
					{/if}
				</div>
			{/each}
		</div>
	</section>
{/if}

{#if results.length > 0}
	<section>
		<h2>Results</h2>
		<table>
			<thead>
				<tr>
					{#each RESULT_COLUMNS as column (column)}
						<th>{column.header}</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each results as result (result)}
					<tr>
						{#each RESULT_COLUMNS as column (column)}
							<td class={column.class?.(result[column.key], result) || ''}>
								{column.format(result[column.key], result)}
							</td>
						{/each}
					</tr>
				{/each}
			</tbody>
		</table>

		<div class="mt_md">
			<CopyToClipboard text={results_to_markdown(results)}>
				copy results as markdown
			</CopyToClipboard>
		</div>

		<div>
			<h3>Legend</h3>
			<ul>
				<li>
					<strong>CV</strong>: Coefficient of Variation (std_dev/mean) - lower is better, &lt;15% is
					good
				</li>
				<li><strong>P95</strong>: 95th percentile - 95% of measurements were faster than this</li>
				<li><strong>Ops/sec</strong>: Operations per second (throughput)</li>
				<li><strong>Per Item</strong>: Time per individual component in batch</li>
				<li><strong>Stability</strong>: Percentage of iterations with stable system metrics</li>
			</ul>
		</div>
	</section>
{/if}
