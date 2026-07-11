import type {Tome} from '@fuzdev/fuz_ui/tome.ts';
import UsagePage from './usage/+page.svelte';
import SamplesPage from './samples/+page.svelte';
import TextareaPage from './textarea/+page.svelte';
import ApiPage from './api/+page.svelte';

export const tomes: Array<Tome> = [
	{
		slug: 'usage',
		category: 'guide',
		Component: UsagePage,
		related_tomes: ['samples', 'textarea'],
		related_modules: [
			'syntax_styler.ts',
			'syntax_styler_global.ts',
			'svelte_preprocess_fuz_code.ts',
		],
		related_declarations: ['Code', 'SyntaxStyler', 'syntax_styler_global'],
	},
	{
		slug: 'samples',
		category: 'explore',
		Component: SamplesPage,
		related_tomes: ['usage', 'textarea'],
		related_modules: [],
		related_declarations: ['Code', 'CodeHighlight'],
	},
	{
		slug: 'textarea',
		category: 'explore',
		Component: TextareaPage,
		related_tomes: ['usage', 'samples'],
		related_modules: [],
		related_declarations: ['CodeTextarea', 'CodeHighlight'],
	},
	{
		slug: 'api',
		category: 'reference',
		Component: ApiPage,
		related_tomes: ['usage'],
		related_modules: [],
		related_declarations: [],
	},
];
