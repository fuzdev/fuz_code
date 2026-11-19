import { describe, test, assert, expect } from 'vitest';
import { render } from 'svelte/server';

import CodeDiff from '#lib/CodeDiff.svelte';
import {
	create_diff_model,
	create_diff_side,
	render_diff_model_split_html,
	render_diff_segments,
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

	test("elide 'expand' renders each segment, controls included, with expanded revealed", () => {
		const a = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`).join('\n') + '\n';
		const b = a.replace('line 15\n', 'line fifteen\n');
		const expanded = [{ start: 2, end: 3 }];
		const { body } = render(CodeDiff, {
			props: { a, b, lang: null, elide: 'expand', expanded }
		});
		const model = create_diff_model(create_diff_side(a), create_diff_side(b));
		const segments = render_diff_segments(model, { elide: 'expand', expanded });
		assert.lengthOf(segments, 5);
		for (const segment of segments) assert.include(body, segment.html);
		// the regions are small enough to offer only all
		assert.include(body, 'data-expand="all"');
		assert.include(body, 'data-a="2" data-b="2"');
	});

	// the fixture `CodeDiff.expand.dom.svelte.test.ts` hydrates, which can't
	// server-render in its client-only environment; `vitest -u` rewrites it
	test.each([false, true])("elide 'expand' server render fixture (split %s)", async (split) => {
		const a = Array.from({ length: 60 }, (_, i) => `line ${i + 1}`).join('\n') + '\n';
		const b = a.replace('line 30\n', 'line thirty\n');
		const { body } = render(CodeDiff, { props: { a, b, lang: null, elide: 'expand', split } });
		await expect(body).toMatchFileSnapshot(
			`fixtures/generated/code_diff/expand${split ? '.split' : ''}.ssr.html`
		);
	});
});
