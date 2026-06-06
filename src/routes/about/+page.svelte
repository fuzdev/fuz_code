<script lang="ts">
	import LibraryDetail from '@fuzdev/fuz_ui/LibraryDetail.svelte';
	import {Library, library_context} from '@fuzdev/fuz_ui/library.svelte.js';
	import DocsFooter from '@fuzdev/fuz_ui/DocsFooter.svelte';
	import {site_context} from '@fuzdev/fuz_ui/site.svelte.js';
	import {FUZ_DEV_URL} from '@fuzdev/fuz_ui/constants.js';
	import EcosystemLinksPanel from '@fuzdev/fuz_ui/EcosystemLinksPanel.svelte';
	import Breadcrumb from '@fuzdev/fuz_ui/Breadcrumb.svelte';

	import {library_json} from '$routes/library.js';

	const library = library_context.set(new Library(library_json));
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
