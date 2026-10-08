<script lang="ts">
	import { resolve } from '$app/paths';
	import TomeContent from '@fuzdev/fuz_ui/TomeContent.svelte';
	import TomeSection from '@fuzdev/fuz_ui/TomeSection.svelte';
	import TomeSectionHeader from '@fuzdev/fuz_ui/TomeSectionHeader.svelte';
	import TomeLink from '@fuzdev/fuz_ui/TomeLink.svelte';
	import DeclarationLink from '@fuzdev/fuz_ui/DeclarationLink.svelte';
	import ModuleLink from '@fuzdev/fuz_ui/ModuleLink.svelte';
	import { tome_get_by_slug } from '@fuzdev/fuz_ui/tome.ts';

	const TOME_SLUG = 'benchmark';
	const tome = tome_get_by_slug(TOME_SLUG);

	const RESULTS_URL = 'https://github.com/fuzdev/fuz_code/blob/main/benchmark/compare/results.md';

	// representative end-to-end `stylize` speedups on larger (100×) inputs, rounded
	// from the committed comparison results and measured against the faster of
	// Shiki's two engines (the conservative choice) — see `RESULTS_URL` for the
	// full per-engine, per-size matrix
	const speedups: Array<{ lang: string; vs_prism: string; vs_shiki: string }> = [
		{ lang: 'ts', vs_prism: '~18×', vs_shiki: '~140×' },
		{ lang: 'css', vs_prism: '~8×', vs_shiki: '~90×' },
		{ lang: 'html', vs_prism: '~11×', vs_shiki: '~80×' },
		{ lang: 'json', vs_prism: '~17×', vs_shiki: '~95×' },
		{ lang: 'svelte', vs_prism: '~14×', vs_shiki: '~165×' }
	];

	// work time in ms (stylize + DOM commit) per language for each renderer, rounded
	// from one interactive-benchmark run on a single machine — illustrative, not a
	// spec; run the tool for numbers on your own hardware
	const browser_results: Array<{ lang: string; html: number; ranges: number }> = [
		{ lang: 'ts', html: 91, ranges: 12 },
		{ lang: 'css', html: 11, ranges: 3 },
		{ lang: 'html', html: 28, ranges: 4 },
		{ lang: 'json', html: 11, ranges: 2 },
		{ lang: 'svelte', html: 91, ranges: 13 },
		{ lang: 'md', html: 69, ranges: 10 },
		{ lang: 'sh', html: 49, ranges: 8 }
	];
	// bars scale to the slowest single result so lengths compare across languages
	const browser_max = Math.max(...browser_results.flatMap((r) => [r.html, r.ranges]));

	type Renderer = 'html' | 'ranges';
	const renderers: Array<{ key: Renderer; label: string; color: string }> = [
		{ key: 'html', label: 'Code', color: 'var(--palette_j_50)' },
		{ key: 'ranges', label: 'CodeHighlight', color: 'var(--palette_g_50)' }
	];

	// each language's ratios are taken against its `Code` row by default, or against
	// whichever row the pointer is over, so either renderer can be the baseline
	let hovered: { lang: string; renderer: Renderer } | undefined = $state();
	const to_hovered = (event: Event): typeof hovered => {
		const row = (event.target as Element | null)?.closest<HTMLElement>('[data-renderer]');
		const lang = row?.dataset.lang;
		const renderer = row?.dataset.renderer as Renderer | undefined;
		return lang && renderer ? { lang, renderer } : undefined;
	};
	const to_anchor = (lang: string): Renderer =>
		hovered?.lang === lang ? hovered.renderer : 'html';

	// how many times faster a row is than its anchor (`7.58x`), or the reciprocal
	// negated when slower (`−7.58x`), two decimals under 10 and one from there
	const format_speedup = (ratio: number): string => {
		const magnitude = ratio >= 1 ? ratio : 1 / ratio;
		const digits = Number(magnitude.toFixed(2)) >= 10 ? 1 : 2;
		const text = magnitude.toFixed(digits);
		return `${ratio < 1 && text !== '1.00' ? '−' : ''}${text}x`;
	};
	const ratio_color = (ratio: number): string => {
		if (ratio < 0.5) return 'var(--palette_c_50)';
		if (ratio < 1) return 'var(--palette_h_50)';
		if (ratio < 2) return 'var(--palette_e_50)';
		if (ratio < 5) return 'var(--palette_b_50)';
		return 'var(--palette_j_50)';
	};
</script>

<TomeContent {tome}>
	<section>
		<p>
			fuz_code is optimized for <em>runtime</em> syntax styling. This page compares it with Prism
			and Shiki, measures its two renderers in the browser, and lists the benchmarks that run from a
			checkout.
		</p>
		<p>
			<a href="https://github.com/shikijs/shiki">Shiki</a> targets build-time use and runs the
			<a href="https://shiki.matsu.io/guide/regex-engines">Oniguruma regexp engine</a> that TextMate
			grammars require, trading runtime speed for grammar and theme coverage. fuz_code trades that
			coverage for a small, fast runtime path. For static content, the
			<ModuleLink module_path="svelte_preprocess_fuz_code.ts">
				svelte_preprocess_fuz_code
			</ModuleLink> preprocessor renders at build time. Languages it lacks can be added by writing a
			lexer.
		</p>
	</section>
	<TomeSection>
		<TomeSectionHeader text="Compared to Shiki and Prism" />
		<p>
			The cross-implementation benchmark measures fuz_code against
			<a href="https://prismjs.com/">Prism</a> and Shiki (both the JavaScript and Oniguruma
			engines). For end-to-end <code>stylize</code> (lexing plus HTML generation), fuz_code runs
			roughly an order of magnitude faster than Prism and about two orders of magnitude faster than
			Shiki:
		</p>
		<div class="overflow-x:auto">
			<table>
				<thead>
					<tr>
						<th>language</th>
						<th>fuz_code vs Prism</th>
						<th>fuz_code vs Shiki</th>
					</tr>
				</thead>
				<tbody>
					{#each speedups as { lang, vs_prism, vs_shiki } (lang)}
						<tr>
							<td><code>{lang}</code></td>
							<td>{vs_prism}</td>
							<td>{vs_shiki}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		<p>
			<small>
				Representative <code>stylize</code> results on larger inputs from one machine; absolute
				numbers vary by hardware. See the <a href={RESULTS_URL}>committed comparison results</a> for
				the full matrix across engines and sizes, plus tokenize-only rows that compare the raw
				lexers without HTML generation.
			</small>
		</p>
	</TomeSection>
	<TomeSection>
		<TomeSectionHeader text="In the browser" />
		<p>
			The <a href={resolve('/benchmark')}>in-browser benchmark</a> measures real DOM rendering
			rather than pure compute. It times fuz_code's two renderers — the standard HTML path
			(<DeclarationLink name="Code" />) and the experimental CSS Custom Highlight API path
			(<DeclarationLink name="CodeHighlight" />, ranges) — across the sample languages, reporting
			mean, median, percentiles, coefficient of variation, and throughput, with system-stability
			gating between samples.
		</p>
		<p>
			Set the iteration count, warmup runs, cooldown, and content multiplier, then run it on your
			own hardware. For the steadiest numbers, launch Chromium with garbage collection exposed
			(<code>chromium --js-flags="--expose-gc"</code>) so the harness can settle the heap between
			samples.
		</p>
		<p>
			A sample run of work time — stylize plus DOM commit — per language for each renderer. The
			default <DeclarationLink name="Code" /> path builds a <code>.token_*</code> span per token;
			the experimental <DeclarationLink name="CodeHighlight" /> path skips that DOM, so it commits
			less:
		</p>
		<div class="perf-legend">
			{#each renderers as { key, label, color } (key)}
				<span>
					<span class="perf-swatch" style:background={color}></span>
					<DeclarationLink name={label} /> ({key})
				</span>
			{/each}
		</div>
		<!-- A table to assistive tech, one row per renderer per language. Hover is delegated
			to the chart, which reads the row under the pointer off its data attributes, and
			`pointerleave` restores every language's default anchor. Re-baselining is a
			pointer-only affordance over numbers that are all visible regardless. -->
		<div
			class="perf-chart"
			role="table"
			aria-label="Work time per language for each renderer"
			onpointerover={(event) => (hovered = to_hovered(event))}
			onpointerleave={() => (hovered = undefined)}
		>
			{#each browser_results as result (result.lang)}
				{@const anchor = to_anchor(result.lang)}
				<div class="perf-group" role="rowgroup">
					<div class="perf-lang" aria-hidden="true"><code>{result.lang}</code></div>
					{#each renderers as { key, label, color } (key)}
						{@const ms = result[key]}
						{@const ratio = result[anchor] / ms}
						<div
							class="perf-row"
							class:anchor={key === anchor}
							role="row"
							aria-label="{result.lang} {label}"
							data-lang={result.lang}
							data-renderer={key}
						>
							<div class="perf-track" aria-hidden="true">
								<div
									class="perf-fill"
									style:width="{(ms / browser_max) * 100}%"
									style:background={color}
								></div>
							</div>
							<span class="perf-num" role="cell">{ms} <span class="unit">ms</span></span>
							<span
								class="perf-ratio"
								role="cell"
								style:color={key === anchor ? 'var(--text_40)' : ratio_color(ratio)}
							>
								{format_speedup(ratio)}
							</span>
						</div>
					{/each}
				</div>
			{/each}
		</div>
		<p>
			<small>
				Lower is better. Each language's ratios are relative to its highlighted row, and a negative
				ratio means that many times slower; hover the other row to compare against it. Ratios come
				from the rounded times shown, and this run does not include Rust. The benchmark uses complex
				samples at the tool's default size, so this is illustrative, not representative of most
				inputs. The live tool also reports paint-settle time, percentiles, and throughput.
			</small>
		</p>
	</TomeSection>
	<TomeSection>
		<TomeSectionHeader text="On your machine" />
		<p>The command-line benchmarks run from a checkout of the repo:</p>
		<ul>
			<li>
				<code>npm run benchmark</code> — the internal suite, timing every sample at normal and 100×
				sizes against a local baseline for regression detection.
			</li>
			<li>
				<code>npm run benchmark:vs</code> — compares against Prism and Shiki and produces the
				results above.
			</li>
		</ul>
		<p>
			The internal suite includes a <code>pathological</code> group of adversarial inputs (deeply
			nested and degenerate source) that tracks the lexer's worst-case cost; the same generators
			back the linearity tests.
		</p>
	</TomeSection>
	<TomeSection>
		<TomeSectionHeader text="Design" />
		<ul>
			<li>
				No regular expressions — char-code scanning, native <code>indexOf</code>, keyword maps.
			</li>
			<li>
				One single-pass lexer per language emitting a flat <code>Int32Array</code> event stream,
				rendered to HTML in a single forward pass.
			</li>
			<li>
				No grammar interpreter and no regex backtracking; delimiter scans are amortized linear. A
				test suite checks that lexing time stays near-linear on adversarial inputs.
			</li>
			<li>No dependencies in the lexers or styler — they import nothing outside the package.</li>
		</ul>
		<p>
			The engine keeps no resumable state, so it re-lexes the whole document on every change rather
			than tokenizing incrementally. In the committed results the largest inputs, up to a few
			hundred kilobytes of source, take under about ten milliseconds.
		</p>
		<p>
			See <TomeLink slug="usage" /> for the API and <TomeLink slug="samples" /> for output in every
			language.
		</p>
	</TomeSection>
</TomeContent>

<style>
	.perf-legend {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space_md);
		margin-bottom: var(--space_md);
		font-size: var(--font_size_sm);
		color: var(--text_50);
	}
	.perf-swatch {
		display: inline-block;
		width: 0.8rem;
		height: 0.8rem;
		border-radius: var(--border_radius_xs);
		vertical-align: middle;
	}
	/* the chart is the grid and its groups and rows are subgrids, so every column
	 * sizes to its content across all languages; the ratio column is held at the
	 * widest ratio `format_speedup` prints here, so re-baselining shifts nothing */
	.perf-chart {
		display: grid;
		grid-template-columns:
			[lang] max-content [track] minmax(0, 1fr) [value] max-content [ratio] 7ch;
		column-gap: var(--space_sm);
		row-gap: var(--space_sm);
		margin-bottom: var(--space_lg);
	}
	.perf-group {
		display: grid;
		grid-template-columns: subgrid;
		grid-column: 1 / -1;
		align-items: center;
	}
	.perf-lang {
		grid-column: lang;
		grid-row: 1 / span 2;
		text-align: right;
	}
	/* rows within a language sit flush, so the anchor band reads as one row */
	.perf-row {
		display: grid;
		grid-template-columns: subgrid;
		grid-column: track / -1;
		align-items: center;
		padding: var(--space_xs);
	}
	.perf-row.anchor {
		background-color: var(--fg_05);
		box-shadow: inset var(--border_width_3) 0 0 var(--fg_50);
	}
	.perf-track {
		height: 1.2rem;
		border-radius: var(--border_radius_xs);
		background: var(--fg_05);
	}
	.perf-fill {
		height: 100%;
		min-width: 2px;
		border-radius: var(--border_radius_xs);
	}
	.perf-num,
	.perf-ratio {
		text-align: right;
		white-space: nowrap;
		font-variant-numeric: tabular-nums;
	}
	.perf-ratio {
		font-weight: 700;
	}
	.unit {
		color: var(--text_50);
	}
</style>
