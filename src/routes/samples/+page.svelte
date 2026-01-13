<script lang="ts">
	import '$lib/theme_highlight.css';

	import Breadcrumb from '@fuzdev/fuz_ui/Breadcrumb.svelte';

	import Code from '$lib/Code.svelte';
	import CodeHighlight from '$lib/CodeHighlight.svelte';
	import {samples} from '../../test/fixtures/samples/all.js';
	import Footer from '$routes/Footer.svelte';
</script>

<main class="width_upto_lg mx_auto py_xl5">
	<header class="box">
		<Breadcrumb>🎨</Breadcrumb>
	</header>

	<section class="mb_xl5">
		<h2 class="text-align:center">HTML rendering (default)</h2>
		<aside
			class="panel p_md mb_xl3 width_upto_md mx_auto
		"
		>
			<p>
				These samples use the normal <code>Code</code> component, which renders using HTML. See
				<a href="#experimental">below</a> for the experimental <code>CodeHighlight</code> that uses the
				Highlight API.
			</p>
		</aside>
		{#each Object.values(samples) as sample (sample.name)}
			<div class="box mb_xl3">
				<h3 class="panel p_md mb_xs width:100% box">{sample.lang}</h3>
				<Code content={sample.content} lang={sample.lang} />
			</div>
		{/each}
	</section>

	<hr class="my_xl5" />

	<section id="experimental">
		<h2 class="text-align:center">CSS Custom Highlight API (experimental)</h2>
		<aside
			class="panel p_md mb_xl3 width_upto_md mx_auto
		"
		>
			<p>
				⚠️ <strong>Experimental:</strong> the comparison below uses
				<code>CodeHighlight.svelte</code> instead of <code>Code.svelte</code>
				with both HTML mode and
				<a href="https://developer.mozilla.org/en-US/docs/Web/API/CSS_Custom_Highlight_API"
					>CSS Custom Highlight API</a
				>.
			</p>
			<p>
				A limitation: layout-affecting styles like font weight do not work, even for monospaced
				fonts:
				<a href="https://github.com/w3c/csswg-drafts/issues/8355"
					>github.com/w3c/csswg-drafts/issues/8355</a
				>
			</p>
			<p>
				The Highlight API has limited browser support as of October 2025 and is not recommended for
				production use yet. Note <code>theme_highlight.css</code> is required instead of
				<code>theme.css</code>.
			</p>
		</aside>
		{#each Object.values(samples) as sample (sample.name)}
			<section>
				<h2 class="panel p_md mb_0 box">{sample.lang}</h2>
				<div class="display:flex justify-content:center flex-wrap:wrap gap_sm py_xl5">
					<div class="constrain_width">
						<h3>{sample.lang} html strings</h3>
						<CodeHighlight content={sample.content} lang={sample.lang} mode="html" />
					</div>
					<div class="constrain_width">
						<h3>{sample.lang} highlighted ranges</h3>
						<CodeHighlight content={sample.content} lang={sample.lang} mode="ranges" />
					</div>
				</div>
			</section>
			<hr />
		{/each}
	</section>

	<Footer />
</main>
