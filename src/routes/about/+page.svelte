<script lang="ts">
	import LibraryDetail from '@fuzdev/fuz_ui/LibraryDetail.svelte';
	import {library_context} from '@fuzdev/fuz_ui/library.svelte.js';
	import DocsFooter from '@fuzdev/fuz_ui/DocsFooter.svelte';
	import EcosystemLinksPanel from '@fuzdev/fuz_ui/EcosystemLinksPanel.svelte';
	import Breadcrumb from '@fuzdev/fuz_ui/Breadcrumb.svelte';

	const library = library_context.get();
</script>

<main class="box mx_auto width_atmost_md pb_xl9">
	<section class="box">
		<header>
			<h1 class="mt_xl5 text-align:center">{library.repo_name}</h1>
		</header>
		<Breadcrumb>{library.package_json.glyph}</Breadcrumb>
	</section>
	<section class="box width:100% mb_lg">
		<div class="panel p_md width_atmost_md">
			<LibraryDetail {library} />
		</div>
	</section>
	<EcosystemLinksPanel />
	<section class="box">
		<DocsFooter {library} root_url="https://www.fuz.dev/">
			<div class="mb_lg">
				<Breadcrumb>{library.package_json.glyph}</Breadcrumb>
			</div>
		</DocsFooter>
	</section>
</main>
