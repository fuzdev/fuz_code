<script lang="ts">
	// the Highlight API rules live in theme_highlight.css (not theme.css)
	import '$lib/theme_highlight.css';

	import Breadcrumb from '@fuzdev/fuz_ui/Breadcrumb.svelte';
	import {supports_css_highlight_api} from '$lib/highlight_manager.ts';
	import CodeTextarea from '$lib/CodeTextarea.svelte';
	import {sample_langs, type SampleLang} from '$lib/code_sample.ts';
	import {samples} from '$routes/samples/all.ts';
	import Footer from '$routes/Footer.svelte';

	const supported = supports_css_highlight_api();

	let lang: SampleLang = $state('ts');

	const sample_for = (l: string): string =>
		Object.values(samples).find((s) => s.lang === l)?.content ?? '';

	let value = $state(sample_for('ts'));

	const select_lang = (l: SampleLang): void => {
		lang = l;
		value = sample_for(l);
	};
</script>

<main class="width_atmost_md mx_auto py_xl5">
	<header class="box">
		<Breadcrumb />
	</header>

	<section class="mb_xl3">
		<h2 class="text-align:center">Editable highlighted textarea (experimental)</h2>
		<aside class="panel p_md mb_lg">
			<p>
				<code>CodeTextarea</code> highlights an editable <code>&lt;textarea&gt;</code> live using
				the
				<a href="https://developer.mozilla.org/en-US/docs/Web/API/CSS_Custom_Highlight_API"
					>CSS Custom Highlight API</a
				>. Type below to see it re-highlight. Requires <code>theme_highlight.css</code>.
			</p>
			{#if !supported}
				<p class="color_e_50">
					⚠️ This browser does not support the CSS Custom Highlight API — the textarea still works,
					but text is shown without highlighting.
				</p>
			{/if}
		</aside>

		<div class="row gap_xs mb_md flex-wrap:wrap">
			{#each sample_langs as l (l)}
				<button type="button" class:selected={l === lang} onclick={() => select_lang(l)}>
					{l}
				</button>
			{/each}
		</div>

		<CodeTextarea bind:value {lang} />
	</section>

	<Footer />
</main>

<style>
	/* the editor defaults to fuz_css's 100px textarea height — give the demo room */
	section :global(.code_textarea textarea) {
		height: 600px;
	}
</style>
