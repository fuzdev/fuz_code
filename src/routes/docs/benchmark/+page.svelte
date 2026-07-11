<script lang="ts">
	import {resolve} from '$app/paths';
	import TomeContent from '@fuzdev/fuz_ui/TomeContent.svelte';
	import TomeSection from '@fuzdev/fuz_ui/TomeSection.svelte';
	import TomeSectionHeader from '@fuzdev/fuz_ui/TomeSectionHeader.svelte';
	import TomeLink from '@fuzdev/fuz_ui/TomeLink.svelte';
	import DeclarationLink from '@fuzdev/fuz_ui/DeclarationLink.svelte';
	import ModuleLink from '@fuzdev/fuz_ui/ModuleLink.svelte';
	import {tome_get_by_slug} from '@fuzdev/fuz_ui/tome.ts';

	const TOME_SLUG = 'benchmark';
	const tome = tome_get_by_slug(TOME_SLUG);

	const RESULTS_URL = 'https://github.com/fuzdev/fuz_code/blob/main/benchmark/compare/results.md';

	// representative end-to-end `stylize` speedups vs Shiki on larger inputs,
	// rounded from the committed comparison results — see `RESULTS_URL` for the
	// full per-engine, per-size matrix
	const shiki_speedups: Array<{lang: string; factor: string}> = [
		{lang: 'ts', factor: '~10× faster'},
		{lang: 'css', factor: '~13× faster'},
		{lang: 'html', factor: '~7× faster'},
		{lang: 'json', factor: '~11× faster'},
		{lang: 'svelte', factor: '~10× faster'},
	];

	// work time (stylize + DOM commit) per language for each renderer, rounded from
	// one interactive-benchmark run on a single machine — illustrative, not a spec;
	// run the tool for numbers on your own hardware
	const browser_results: Array<{lang: string; html: string; ranges: string}> = [
		{lang: 'ts', html: '56 ms', ranges: '16 ms'},
		{lang: 'css', html: '8 ms', ranges: '3 ms'},
		{lang: 'html', html: '18 ms', ranges: '5 ms'},
		{lang: 'json', html: '8 ms', ranges: '2 ms'},
		{lang: 'svelte', html: '63 ms', ranges: '16 ms'},
		{lang: 'md', html: '43 ms', ranges: '14 ms'},
		{lang: 'sh', html: '35 ms', ranges: '12 ms'},
	];
</script>

<TomeContent {tome}>
	<section>
		<p>
			fuz_code runs one hand-written single-pass lexer per language with zero regular expressions,
			emitting a flat token event stream that renders to HTML in one forward pass. There is no
			grammar interpreter and no backtracking, so highlighting cost stays linear in the length of
			the input, including partial or malformed source.
		</p>
		<p>
			It is optimized for <em>runtime</em> highlighting.
			<a href="https://github.com/shikijs/shiki">Shiki</a>
			targets build-time use and runs the
			<a href="https://shiki.matsu.io/guide/regex-engines">Oniguruma regexp engine</a> that TextMate grammars
			require, trading runtime speed for grammar and theme coverage. fuz_code trades that coverage for
			a small, fast runtime path — so the two aren't substitutes; pick the one that fits the job.
		</p>
	</section>
	<TomeSection>
		<TomeSectionHeader text="Compared to Shiki and Prism" />
		<p>
			The cross-implementation benchmark measures fuz_code against
			<a href="https://github.com/PrismJS/prism">Prism</a> and Shiki (both the JavaScript and
			Oniguruma engines). For end-to-end <code>stylize</code> — lexing plus HTML generation, the realistic
			runtime path — fuz_code lands roughly on par with Prism and vastly faster than Shiki:
		</p>
		<div class="overflow-x:auto">
			<table>
				<thead>
					<tr>
						<th>language</th>
						<th>fuz_code vs Shiki</th>
					</tr>
				</thead>
				<tbody>
					{#each shiki_speedups as { lang, factor } (lang)}
						<tr>
							<td><code>{lang}</code></td>
							<td>{factor}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		<p>
			<small
				>Representative <code>stylize</code> results on larger inputs from one machine; absolute
				numbers vary by hardware. See the
				<a href={RESULTS_URL}>committed comparison results</a> for the full matrix across engines and
				sizes.</small
			>
		</p>
	</TomeSection>
	<TomeSection>
		<TomeSectionHeader text="In the browser" />
		<p>
			The <a href={resolve('/benchmark')}>interactive benchmark ⚡</a> runs live in your browser to
			get messy real-life results. It times fuz_code's two renderers - the standard HTML path (<DeclarationLink
				name="Code"
			/>) and the experimental CSS Custom Highlight API path (<DeclarationLink
				name="CodeHighlight"
			/>, ranges) - across every supported language, reporting mean, median, percentiles,
			coefficient of variation, and throughput per run, with system-stability gating between
			samples.
		</p>
		<p>
			Set the iteration count, warmup runs, cooldown, and content multiplier, then run it on your
			own hardware. For the steadiest numbers, launch Chromium with garbage collection exposed (<code
				>chromium --js-flags="--expose-gc"</code
			>) so the harness can settle the heap between samples.
		</p>
		<p>
			A sample run, per language, of the work time — stylize plus DOM commit — for each renderer.
			The default <DeclarationLink name="Code" /> path builds a <code>.token_*</code> span per
			token; the experimental <DeclarationLink name="CodeHighlight" /> path skips that DOM, so it commits
			less:
		</p>
		<div class="overflow-x:auto">
			<table>
				<thead>
					<tr>
						<th>language</th>
						<th><code>Code</code> (html)</th>
						<th><code>CodeHighlight</code> (ranges)</th>
					</tr>
				</thead>
				<tbody>
					{#each browser_results as { lang, html, ranges } (lang)}
						<tr>
							<td><code>{lang}</code></td>
							<td>{html}</td>
							<td>{ranges}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		<p>
			<small
				>One run on a single machine, complex samples at the tool's default size — illustrative, not
				a spec. The live tool also reports paint-settle time, percentiles, and throughput.</small
			>
		</p>
	</TomeSection>
	<TomeSection>
		<TomeSectionHeader text="On your machine" />
		<p>The command-line benchmarks run from a checkout of the repo:</p>
		<ul>
			<li>
				<code>npm run benchmark</code> — the internal suite, timing every sample at normal and 100× sizes
				against a local baseline for regression detection.
			</li>
			<li>
				<code>npm run benchmark:vs</code> — the cross-implementation shootout against Prism and Shiki
				that produces the comparison results above.
			</li>
		</ul>
		<p>
			Both suites include a <code>pathological</code> group of adversarial inputs (deeply nested and degenerate
			source) that pins the lexer's worst-case behavior to linear time; the same generators back the linearity
			tests. The engine keeps no resumable state, so it re-lexes the whole document on every change rather
			than tokenizing incrementally — whole-document lexing is already sub-frame at these speeds.
		</p>
	</TomeSection>
	<TomeSection>
		<TomeSectionHeader text="Why it's fast" />
		<ul>
			<li>
				Zero regular expressions — char-code scanning, native <code>indexOf</code>, keyword maps.
			</li>
			<li>
				One single-pass lexer per language emitting a flat <code>Int32Array</code> event stream, rendered
				to HTML in a single forward pass.
			</li>
			<li>
				Linear-time by construction — every scan loop advances, so there is no catastrophic
				backtracking on adversarial input.
			</li>
			<li>Zero runtime dependencies, so nothing heavier than the lexers ships to the browser.</li>
		</ul>
		<p>
			The same entry points power all of it: <DeclarationLink name="syntax_styler_global" /> and the
			<ModuleLink module_path="syntax_styler.ts">SyntaxStyler</ModuleLink> class expose
			<code>lex</code>
			(the flat event stream) and <code>stylize</code> (HTML). See the
			<TomeLink slug="usage" /> for the API and the <TomeLink slug="samples" /> for output in every language.
		</p>
	</TomeSection>
</TomeContent>
