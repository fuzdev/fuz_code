<script lang="ts">
	import '#lib/theme_diff.css';

	import { page } from '$app/state';
	import { DOCS_PATH } from '@fuzdev/fuz_ui/docs_helpers.svelte.ts';
	import { tome_get_by_slug } from '@fuzdev/fuz_ui/tome.ts';
	import TomeContent from '@fuzdev/fuz_ui/TomeContent.svelte';
	import TomeLink from '@fuzdev/fuz_ui/TomeLink.svelte';
	import TomeSection from '@fuzdev/fuz_ui/TomeSection.svelte';
	import TomeSectionHeader from '@fuzdev/fuz_ui/TomeSectionHeader.svelte';
	import DeclarationLink from '@fuzdev/fuz_ui/DeclarationLink.svelte';

	import { diff_hunks, diff_lines } from '@fuzdev/fuz_util/diff.ts';

	import Code from '#lib/Code.svelte';
	import CodeDiff from '#lib/CodeDiff.svelte';
	import {
		create_diff_model,
		create_diff_side,
		type DiffExpandedRange,
		type DiffLineRange
	} from '#lib/diff_html.ts';

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

	// one side per version, each lexed once: picking another pair builds a new
	// model over the same sides, so nothing is lexed again
	const VERSIONS = [
		DEMO_A,
		DEMO_B,
		DEMO_B.replace('VERSION = 2', 'VERSION = 3').replace('toUpperCase', 'toLocaleUpperCase')
	];
	const version_sides = VERSIONS.map((text) => create_diff_side(text, { lang: 'ts' }));
	let from_version = $state(0);
	let to_version = $state(1);
	const model = $derived(
		create_diff_model(version_sides[from_version]!, version_sides[to_version]!)
	);

	let highlight_side: 'a' | 'b' = $state('b');
	let highlight_start = $state(4);
	let highlight_end = $state(5);
	const highlight: Array<DiffLineRange> = $derived([
		{ side: highlight_side, start: highlight_start, end: highlight_end }
	]);
	let model_diff: CodeDiff | undefined = $state();

	// a long file with two small edits far apart, so most of it elides
	const EXPAND_A = Array.from(
		{ length: 160 },
		(_, i) => `export const value_${i + 1} = ${i + 1};`
	).join('\n');
	const EXPAND_B = EXPAND_A.replace('value_40 = 40;', 'value_40 = 40_000;').replace(
		'value_120 = 120;',
		'value_120 = 120 * 2;'
	);
	let expanded: Array<DiffExpandedRange> = $state([]);
	let expand_split = $state(false);
	let expand_line = $state(80);
	let expand_diff: CodeDiff | undefined = $state();

	// the same edits as a patch: the hunks alone, as `git diff` gives them, and
	// the full model once "loaded"
	const PATCH_HUNKS = diff_hunks(diff_lines(EXPAND_A, EXPAND_B), 3);
	let patch_loaded = $state(false);
	let patch_expanded: Array<DiffExpandedRange> = $state([]);
	const patch_input = $derived(
		patch_loaded
			? {
					source: create_diff_model(
						create_diff_side(EXPAND_A, { lang: 'ts' }),
						create_diff_side(EXPAND_B, { lang: 'ts' })
					)
				}
			: { hunks: PATCH_HUNKS }
	);
</script>

<TomeContent {tome}>
	{#if at_root}
		<section>
			<p>
				A syntax-highlighted <TomeLink slug="diff" /> viewer backed by
				<DeclarationLink name="CodeDiff" />.
			</p>
		</section>
	{:else}
		<section>
			<p>
				<DeclarationLink name="CodeDiff" /> renders a unified diff of two versions of a source text,
				or the same diff side by side with <code>split</code>. Both sides are lexed as whole
				documents, so the normal syntax highlighting is preserved and the diff information — row
				tints, line-number gutters, intra-line <code>&lt;mark&gt;</code> emphasis — is overlaid on
				top. Added and removed rows are semantic <code>&lt;ins&gt;</code>/<code>&lt;del&gt;</code>
				elements, the markers and gutters stay out of copied text, and unchanged regions collapse
				into expandable <code>&lt;details&gt;</code> blocks with no JS. Requires
				<code>theme_diff.css</code>.
			</p>
			<p>
				Within a change, a removed line pairs with the added line most similar to it. The pair gets
				the emphasis and shares a row in the split view. A diff of two static strings is rendered at
				build time by the preprocessor, described in <TomeLink slug="usage" />.
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

			<CodeDiff {a} {b} lang="ts" {split} />

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
		<TomeSection>
			<TomeSectionHeader text="Prepared models" />
			<p>
				For sides that outlive one diff, or a diff computed elsewhere, prepare the pieces:
				<DeclarationLink name="create_diff_side" /> lexes one text once, and
				<DeclarationLink name="create_diff_model" /> pairs two sides with their lines — from
				<code>diff_lines</code> by default, or supplied, like git's own diff converted to
				<code>DiffLine</code>s. A side serves any number of models, so a consumer caches it by
				content and moving the compared range lexes nothing twice. Pass the model as
				<code>source</code>, which takes any <code>DiffRowSource</code>.
			</p>
			<p>
				Every row carries <code>data-a</code> and <code>data-b</code> line numbers, absent on the
				side it lacks, and <code>data-hunk</code> inside a hunk, for event delegation. The
				<code>highlight</code> prop puts the <code>diff_highlight</code> class on lines of either
				side, and the component's <code>scroll_to_line</code> method brings one into view.
			</p>

			<Code
				lang="ts"
				content={`const sides = new Map(); // by blob hash, say
const side = (hash: string, text: string) => {
	let s = sides.get(hash);
	if (!s) sides.set(hash, (s = create_diff_side(text, {lang: 'ts'})));
	return s;
};
const model = create_diff_model(side(a_hash, a), side(b_hash, b));`}
			/>
			<Code
				lang="svelte"
				content={`<CodeDiff bind:this={diff} source={model} highlight={[{side: 'b', start: 4, end: 5}]} />`}
			/>

			<div class="row gap_md mb_md demo-controls">
				<div class="row gap_xs">
					<span>a</span>
					{#each VERSIONS as _, i (i)}
						<button
							type="button"
							class="sm"
							class:selected={from_version === i}
							onclick={() => (from_version = i)}
						>
							v{i + 1}
						</button>
					{/each}
				</div>
				<div class="row gap_xs">
					<span>b</span>
					{#each VERSIONS as _, i (i)}
						<button
							type="button"
							class="sm"
							class:selected={to_version === i}
							onclick={() => (to_version = i)}
						>
							v{i + 1}
						</button>
					{/each}
				</div>
			</div>
			<div class="row gap_md mb_md demo-controls">
				<label class="row gap_xs">
					<span>highlight</span>
					<select bind:value={highlight_side}>
						<option value="a">a</option>
						<option value="b">b</option>
					</select>
				</label>
				<label class="row gap_xs">
					<span>lines</span>
					<input type="number" min="1" bind:value={highlight_start} />
					<input type="number" min="1" bind:value={highlight_end} />
				</label>
				<button
					type="button"
					class="sm"
					onclick={() => model_diff?.scroll_to_line(highlight_side, highlight_start)}
				>
					scroll to line
				</button>
			</div>

			<CodeDiff bind:this={model_diff} source={model} {highlight} {split} />
		</TomeSection>
		<TomeSection>
			<TomeSectionHeader text="Expanding elided lines" />
			<p>
				<code>elide="expand"</code> keeps the DOM bounded on big files and gives the hidden lines
				back on demand: each elided region is a count row whose buttons reveal 20 lines down from
				the hunk above, 20 up from the hunk below, or all of them (<code>expand_step</code> sets the
				20). Only the revealed rows render; the rest of the diff's DOM stays as it was. What's
				revealed is <code>expanded</code>, ranges of <code>b</code> line numbers — internal by
				default, or bound to persist and restore it. Line numbers rather than rows keep it
				meaningful across models of the same diff. <code>scroll_to_line</code> on a hidden line
				reveals the lines around it first.
			</p>
			<p>
				The default <code>'details'</code> needs no JS but puts every elided line in the DOM, and
				<code>'omit'</code> renders only the count. For a static render,
				<DeclarationLink name="render_diff_segments" /> draws the same rows in keyed pieces.
			</p>

			<Code
				lang="svelte"
				content={`<CodeDiff bind:this={diff} {a} {b} lang="ts" elide="expand" bind:expanded />`}
			/>

			<div class="row gap_md mb_md demo-controls">
				<div class="row gap_xs">
					<button
						type="button"
						class="sm"
						class:selected={!expand_split}
						onclick={() => (expand_split = false)}
					>
						unified
					</button>
					<button
						type="button"
						class="sm"
						class:selected={expand_split}
						onclick={() => (expand_split = true)}
					>
						split
					</button>
				</div>
				<label class="row gap_xs">
					<span>b line</span>
					<input type="number" min="1" bind:value={expand_line} />
				</label>
				<button
					type="button"
					class="sm"
					onclick={() => expand_diff?.scroll_to_line('b', expand_line)}
				>
					scroll to line
				</button>
				<button type="button" class="sm" onclick={() => (expanded = [])}>collapse all</button>
			</div>
			<p>
				<code>expanded</code>: <code>{JSON.stringify(expanded)}</code>
			</p>

			<div class="demo-expand">
				<CodeDiff
					bind:this={expand_diff}
					a={EXPAND_A}
					b={EXPAND_B}
					lang="ts"
					elide="expand"
					split={expand_split}
					bind:expanded
				/>
			</div>
		</TomeSection>
		<TomeSection>
			<TomeSectionHeader text="Patches" />
			<p>
				A file too big to fetch whole can render from its patch alone: pass the hunks — one file's
				<code>DiffHunk</code>s, which fuz_util parses from <code>git diff</code> output — as
				<code>hunks</code>, through <DeclarationLink name="create_diff_patch_source" />. Each run of
				hunks is lexed on its own, so highlighting is approximate where a hunk starts inside a
				comment or string opened above it, and the lines between hunks show as counts with nothing
				to expand. The lines after the last hunk count when <code>b_line_count</code> is known, or
				when <code>patch_context</code>, the patch's <code>-U</code>, proves the last hunk reaches
				the end of the file. To cache the patch source, or to handle malformed hunks rather than
				have <code>hunks</code> throw, build it yourself and pass it as <code>source</code>.
			</p>
			<p>
				When both texts arrive, swap <code>hunks</code> for a model as <code>source</code> (or
				<code>a</code> and <code>b</code>) on the same component: the view upgrades in place,
				keeping <code>expanded</code> and <code>highlight</code>, and the first row in view stays
				where it was.
			</p>

			<Code
				lang="svelte"
				content={`<CodeDiff {...(model ? {source: model} : {hunks})} patch_context={3} lang="ts" elide="expand" bind:expanded />`}
			/>

			<div class="row gap_md mb_md demo-controls">
				<button type="button" class="sm" onclick={() => (patch_loaded = !patch_loaded)}>
					{patch_loaded ? 'back to the patch' : 'load full file'}
				</button>
				<span>{patch_loaded ? 'full model' : 'patch only'}</span>
			</div>

			<div class="demo-expand">
				<CodeDiff
					{...patch_input}
					patch_context={3}
					lang="ts"
					elide="expand"
					bind:expanded={patch_expanded}
				/>
			</div>
		</TomeSection>
	{/if}
</TomeContent>

<style>
	.demo-editors textarea {
		height: 240px;
		font-family: var(--font_family_mono);
	}
	.demo-controls {
		flex-wrap: wrap;
	}
	.demo-controls input {
		width: 6ch;
	}
	.demo-expand {
		max-height: var(--distance_sm);
		overflow: auto;
	}
</style>
