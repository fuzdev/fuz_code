import {vitePreprocess} from '@sveltejs/vite-plugin-svelte';
import adapter from '@sveltejs/adapter-static';
import {create_csp_directives} from '@fuzdev/fuz_ui/csp.js';
import {csp_trusted_sources_of_ryanatkn} from '@fuzdev/fuz_ui/csp_of_ryanatkn.js';

// Self-referencing import from dist — unavailable on first build after clean checkout,
// but subsequent builds use the preprocessor for static Code compilation.
/** @type {Array<import('svelte/compiler').PreprocessorGroup>} */
let fuz_code_preprocessors = [];
try {
	const {svelte_preprocess_fuz_code} =
		await import('@fuzdev/fuz_code/svelte_preprocess_fuz_code.js');
	fuz_code_preprocessors = [svelte_preprocess_fuz_code({component_imports: ['$lib/Code.svelte']})];
} catch {}

/** @type {import('@sveltejs/kit').Config} */
export default {
	preprocess: [...fuz_code_preprocessors, vitePreprocess()],
	compilerOptions: {runes: true},
	vitePlugin: {inspector: true},
	kit: {
		adapter: adapter(),
		paths: {relative: false}, // use root-absolute paths for SSR path comparison: https://kit.svelte.dev/docs/configuration#paths
		alias: {
			$routes: 'src/routes',
			'@fuzdev/fuz_code': 'src/lib',
		},
		csp: {
			directives: create_csp_directives({
				trusted_sources: csp_trusted_sources_of_ryanatkn,
			}),
		},
	},
};
