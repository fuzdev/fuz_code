import type {Tome} from '@fuzdev/fuz_ui/tome.ts';
import UsagePage from './usage/+page.svelte';
import ApiPage from './api/+page.svelte';
import LibraryPage from './library/+page.svelte';
import SamplesPage from './samples/+page.svelte';
import BenchmarkPage from './benchmark/+page.svelte';

export const tomes: Array<Tome> = [
	{
		slug: 'usage',
		category: 'guide',
		Component: UsagePage,
		related_tomes: ['api', 'samples'],
		related_modules: [
			'syntax_styler.ts',
			'syntax_styler_global.ts',
			'svelte_preprocess_fuz_code.ts',
		],
		related_declarations: ['Code', 'SyntaxStyler', 'syntax_styler_global'],
	},
	{
		slug: 'api',
		category: 'reference',
		Component: ApiPage,
		related_tomes: ['usage'],
		related_modules: [],
		related_declarations: [],
	},
	{
		slug: 'library',
		category: 'reference',
		Component: LibraryPage,
		related_tomes: [],
		related_modules: [],
		related_declarations: [],
	},
	{
		slug: 'samples',
		category: 'explore',
		Component: SamplesPage,
		related_tomes: ['usage', 'benchmark'],
		related_modules: [],
		related_declarations: ['Code', 'CodeHighlight'],
	},
	{
		slug: 'benchmark',
		category: 'explore',
		Component: BenchmarkPage,
		related_tomes: ['samples'],
		related_modules: [],
		related_declarations: [],
	},
];
