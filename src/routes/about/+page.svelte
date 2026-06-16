<script lang="ts">
	import LibraryDetail from '@fuzdev/fuz_ui/LibraryDetail.svelte';
	import {Library, library_context} from '@fuzdev/fuz_ui/library.svelte.ts';
	import DocsFooter from '@fuzdev/fuz_ui/DocsFooter.svelte';
	import {site_context} from '@fuzdev/fuz_ui/site.svelte.ts';
	import {FUZ_DEV_URL} from '@fuzdev/fuz_ui/constants.ts';
	import EcosystemLinksPanel from '@fuzdev/fuz_ui/EcosystemLinksPanel.svelte';
	import Breadcrumb from '@fuzdev/fuz_ui/Breadcrumb.svelte';

	import {library_json} from '$routes/library.ts';

	const library = new Library(library_json);
	library_context.set(() => library);
	const site = site_context.get();
</script>

<main class="box mx_auto width_atmost_md pb_xl9">
	<section class="box">
		<header>
			<h1 class="mt_xl5 text-align:center">{library.repo_name}</h1>
		</header>
		<Breadcrumb />
	</section>
	<section class="box width:100% mb_lg">
		<div class="panel p_md width_atmost_md">
			<LibraryDetail {library} />
		</div>
	</section>
	<EcosystemLinksPanel />
	<section class="box">
		<DocsFooter repo_url={site.repo_url} root_url={FUZ_DEV_URL}>
			<div class="mb_lg">
				<Breadcrumb />
			</div>
		</DocsFooter>
	</section>
</main>
