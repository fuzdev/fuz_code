import type {Tome} from '@fuzdev/fuz_ui/tome.js';
import UsagePage from '$routes/docs/usage/+page.svelte';
import ApiPage from '$routes/docs/api/+page.svelte';
import LibraryPage from '$routes/docs/library/+page.svelte';
import SamplesPage from '$routes/docs/samples/+page.svelte';
import BenchmarkPage from '$routes/docs/benchmark/+page.svelte';

export const tomes: Array<Tome> = [
	{
		name: 'usage',
		category: 'guide',
		Component: UsagePage,
		related_tomes: ['api', 'samples'],
		related_modules: [],
		related_declarations: [],
	},
	{
		name: 'api',
		category: 'reference',
		Component: ApiPage,
		related_tomes: ['usage'],
		related_modules: [],
		related_declarations: [],
	},
	{
		name: 'library',
		category: 'reference',
		Component: LibraryPage,
		related_tomes: [],
		related_modules: [],
		related_declarations: [],
	},
	{
		name: 'samples',
		category: 'explore',
		Component: SamplesPage,
		related_tomes: ['usage', 'benchmark'],
		related_modules: [],
		related_declarations: [],
	},
	{
		name: 'benchmark',
		category: 'explore',
		Component: BenchmarkPage,
		related_tomes: ['samples'],
		related_modules: [],
		related_declarations: [],
	},
];
