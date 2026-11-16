import { defineConfig } from 'vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import adapter from '@sveltejs/adapter-static';
import type { PreprocessorGroup } from 'svelte/compiler';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { svelte_preprocess_mdz } from '@fuzdev/mdz/svelte_preprocess_mdz.ts';
import { create_csp_directives } from '@fuzdev/fuz_ui/csp.ts';
import { csp_directives_of_fuzdev } from '@fuzdev/fuz_ui/csp_of_fuzdev.ts';
import { vite_plugin_fuz_css } from '@fuzdev/fuz_css/vite_plugin_fuz_css.ts';
import svelte_docinfo from 'svelte-docinfo/vite.js';
import { vite_plugin_pkg_json } from '@fuzdev/fuz_ui/vite_plugin_pkg_json.ts';

// Self-referencing import from dist — unavailable on first build after clean checkout,
// but subsequent builds use the preprocessor for static Code compilation.
let fuz_code_preprocessors: Array<PreprocessorGroup> = [];
try {
	const { svelte_preprocess_fuz_code } =
		await import('@fuzdev/fuz_code/svelte_preprocess_fuz_code.ts');
	fuz_code_preprocessors = [
		svelte_preprocess_fuz_code({ component_imports: ['#lib/Code.svelte'] })
	];
} catch {}

export default defineConfig({
	server: {
		// Vite watches the whole root, an inotify watch per file, and gro's `.gro/` output
		// needn't come out of the user's `max_user_watches` budget
		watch: { ignored: ['**/.gro/**'] }
	},
	plugins: [
		sveltekit({
			preprocess: [svelte_preprocess_mdz(), ...fuz_code_preprocessors, vitePreprocess()],
			compilerOptions: { runes: true },
			inspector: true,
			adapter: adapter(),
			paths: { relative: false }, // use root-absolute paths for SSR path comparison: https://svelte.dev/docs/kit/configuration#paths
			csp: { directives: create_csp_directives({ extend: [csp_directives_of_fuzdev] }) },
			version: { name: execSync('git rev-parse HEAD').toString().trim() }
		}),
		svelte_docinfo({ onDuplicates: 'throw' }),
		vite_plugin_fuz_css(),
		vite_plugin_pkg_json()
	],
	resolve: {
		// fuz_ui imports `@fuzdev/fuz_code/Code.svelte`, an optional peer that isn't installed
		// here, so point it at the source to share one `Code` with the site's `#lib` imports
		alias: [
			{
				find: /^@fuzdev\/fuz_code\//,
				replacement: fileURLToPath(new URL('./src/lib/', import.meta.url))
			}
		]
	},
	optimizeDeps: { exclude: ['@fuzdev/blake3-wasm'] }
});
