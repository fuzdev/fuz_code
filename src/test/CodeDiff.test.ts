import { describe, test, assert } from 'vitest';
import { render } from 'svelte/server';

import CodeDiff from '#lib/CodeDiff.svelte';
import {
	create_diff_model,
	create_diff_side,
	render_diff_model_split_html,
	render_diff_unified_html
} from '#lib/diff_html.ts';

// server rendering only: the repo has no DOM test environment, so the
// highlight effect is covered through `apply_diff_highlight`'s own tests
describe('CodeDiff server render', () => {
	const A = 'const a = 1;\nconst b = 2;\n';
	const B = 'const a = 1;\nconst b = 20;\n';

	test('a and b render the renderer rows, with the first highlight in them', () => {
		const highlight = [{ side: 'b' as const, start: 2 }];
		const { body } = render(CodeDiff, { props: { a: A, b: B, lang: 'ts', highlight } });
		assert.include(body, render_diff_unified_html(A, B, { lang: 'ts', highlight }));
		assert.include(body, 'diff_highlight');
		assert.include(body, 'data-lang="ts"');
	});

	test('a model renders its rows, its b side naming the language', () => {
		const model = create_diff_model(
			create_diff_side(A, { lang: 'ts' }),
			create_diff_side(B, { lang: 'ts' })
		);
		const { body } = render(CodeDiff, { props: { model, split: true, lang: 'svelte' } });
		assert.include(body, render_diff_model_split_html(model));
		assert.include(body, 'data-lang="ts"');
		assert.include(body, 'class="code_diff split');
	});
});
