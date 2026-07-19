<script lang="ts">
	import '$lib/theme_diff.css';

	import {page} from '$app/state';
	import {DOCS_PATH} from '@fuzdev/fuz_ui/docs_helpers.svelte.ts';
	import {tome_get_by_slug} from '@fuzdev/fuz_ui/tome.ts';
	import TomeContent from '@fuzdev/fuz_ui/TomeContent.svelte';
	import TomeLink from '@fuzdev/fuz_ui/TomeLink.svelte';
	import DeclarationLink from '@fuzdev/fuz_ui/DeclarationLink.svelte';

	import Code from '$lib/Code.svelte';
	import CodeDiff from '$lib/CodeDiff.svelte';
	import CodeDiffSplit from '$lib/CodeDiffSplit.svelte';

	const TOME_SLUG = 'diff';
	const tome = tome_get_by_slug(TOME_SLUG);

	// `DocsContent` mounts every tome inline on the `/docs` index; render a stub
	// there so the live demo only mounts on this route.
	const at_root = $derived(page.url.pathname === DOCS_PATH);

	const DEMO_A = `export const greet = (name: string): string =>
	'Hello, ' + name + '!';

export const VERSION = 1;
`;
	const DEMO_B = `export const greet = (name: string, formal: boolean): string =>
	formal ? 'Dear ' + name : 'Hello, ' + name + '!';

export const shout = (name: string): string =>
	greet(name, false).toUpperCase();

export const VERSION = 2;
`;

	let a = $state(DEMO_A);
	let b = $state(DEMO_B);
	let split = $state(false);
</script>

<TomeContent {tome}>
	{#if at_root}
		<section>
			<p>
				A syntax-highlighted <TomeLink slug="diff" /> viewer backed by
				<DeclarationLink name="CodeDiff" /> and <DeclarationLink name="CodeDiffSplit" />.
			</p>
		</section>
	{:else}
		<section>
			<p>
				<DeclarationLink name="CodeDiff" /> renders a unified diff of two versions of a source text, and
				<DeclarationLink name="CodeDiffSplit" /> renders the same diff side-by-side. Both sides are lexed
				as whole documents, so the normal syntax highlighting is preserved and the diff information —
				row tints, line-number gutters, intra-line <code>&lt;mark&gt;</code> emphasis — is overlaid
				on top. Added and removed rows are semantic <code>&lt;ins&gt;</code>/<code>&lt;del&gt;</code
				>
				elements, the markers and gutters stay out of copied text, and unchanged regions collapse into
				expandable <code>&lt;details&gt;</code> blocks with no JavaScript. Requires
				<code>theme_diff.css</code>.
			</p>

			<Code
				lang="svelte"
				content={'<' +
					`script>\n\timport '@fuzdev/fuz_code/theme_diff.css';\n\timport CodeDiff from '@fuzdev/fuz_code/CodeDiff.svelte';\n</script>\n\n<CodeDiff {a} {b} lang="ts" />`}
			/>

			<div class="row gap_xs mb_md">
				<button type="button" class="sm" class:selected={!split} onclick={() => (split = false)}>
					unified
				</button>
				<button type="button" class="sm" class:selected={split} onclick={() => (split = true)}>
					split
				</button>
			</div>

			{#if split}
				<CodeDiffSplit {a} {b} lang="ts" />
			{:else}
				<CodeDiff {a} {b} lang="ts" />
			{/if}

			<p>Edit either version and the diff re-renders:</p>

			<div class="row gap_md demo-editors">
				<label class="column flex_1">
					<span>a (original)</span>
					<textarea bind:value={a}></textarea>
				</label>
				<label class="column flex_1">
					<span>b (updated)</span>
					<textarea bind:value={b}></textarea>
				</label>
			</div>
		</section>
	{/if}
</TomeContent>

<style>
	.demo-editors textarea {
		height: 240px;
		font-family: var(--font_family_mono);
	}
</style>
