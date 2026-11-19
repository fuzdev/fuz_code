/**
 * @vitest-environment jsdom
 */
import { describe, test, assert, afterEach, beforeEach } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

import CodeDiff from '#lib/CodeDiff.svelte';
import { create_diff_model, create_diff_side, type DiffLineRange } from '#lib/diff_html.ts';

const A = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join('\n') + '\n';
const B = A.replace('line 15\n', 'line fifteen\n');
const C = A.replace('line 4\n', 'line four\n');

// the elements each `scrollIntoView` was called on — jsdom lays nothing out
let scrolled: Array<Element> = [];
const original_scroll = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollIntoView');

let mounted: { instance: any; container: HTMLElement } | null = null;

beforeEach(() => {
	scrolled = [];
	Element.prototype.scrollIntoView = function (this: Element) {
		scrolled.push(this);
	};
});

afterEach(() => {
	if (original_scroll) {
		Object.defineProperty(Element.prototype, 'scrollIntoView', original_scroll);
	} else {
		delete (Element.prototype as Partial<Element>).scrollIntoView;
	}
	if (mounted) {
		void unmount(mounted.instance);
		mounted.container.remove();
		mounted = null;
	}
});

const mount_diff = (props: Record<string, unknown>) => {
	const container = document.createElement('div');
	document.body.appendChild(container);
	const instance = mount(CodeDiff as any, { target: container, props });
	flushSync();
	mounted = { instance, container };
	return { instance, container };
};

const rows = (container: HTMLElement): Array<Element> => [
	...container.querySelectorAll('[data-a], [data-b]')
];

const highlighted = (container: HTMLElement): Array<string> =>
	[...container.querySelectorAll('.diff_highlight')].map(
		(row) => `${row.getAttribute('data-a')}:${row.getAttribute('data-b')}`
	);

describe('CodeDiff in the DOM', () => {
	test('a highlight change toggles classes and keeps the rows', () => {
		const props: { a: string; b: string; lang: null; highlight: Array<DiffLineRange> } = $state({
			a: A,
			b: B,
			lang: null,
			highlight: [{ side: 'b', start: 15 }]
		});
		const { container } = mount_diff(props);
		const details = container.querySelector('details')!;
		details.open = true;
		const before = rows(container);
		assert.deepEqual(highlighted(container), ['null:15']);

		props.highlight = [{ side: 'a', start: 2, end: 3 }];
		flushSync();

		assert.isTrue(details.isConnected);
		assert.isTrue(details.open);
		const after = rows(container);
		assert.strictEqual(after.length, before.length);
		for (let i = 0; i < after.length; i++) assert.strictEqual(after[i], before[i]);
		assert.deepEqual(highlighted(container), ['2:2', '3:3']);

		props.highlight = [];
		flushSync();
		assert.deepEqual(highlighted(container), []);
	});

	test('scroll_to_line acts on the rows a just-set highlight or model produced', async () => {
		const b_side = create_diff_side(B);
		const props: { source: ReturnType<typeof create_diff_model>; highlight: Array<DiffLineRange> } =
			$state({
				source: create_diff_model(create_diff_side(A), b_side),
				highlight: []
			});
		const { instance, container } = mount_diff(props);

		props.highlight = [{ side: 'a', start: 2 }];
		const details = container.querySelector('details')!;
		assert.isFalse(details.open);
		assert.isTrue(await instance.scroll_to_line('a', 2));
		assert.lengthOf(scrolled, 1);
		assert.strictEqual(scrolled[0]!.getAttribute('data-a'), '2');
		assert.isTrue(scrolled[0]!.classList.contains('diff_highlight'));
		assert.isTrue(details.open);

		// a new model replaces the rows: the scroll finds the new one
		props.source = create_diff_model(create_diff_side(C), b_side);
		assert.isTrue(await instance.scroll_to_line('a', 4));
		const row = scrolled[1]!;
		assert.isTrue(row.isConnected);
		assert.isTrue(container.contains(row));
		assert.strictEqual(row.tagName, 'DEL');

		assert.isFalse(await instance.scroll_to_line('a', 99));
		assert.lengthOf(scrolled, 2);
	});

	test('scroll_to_line resolves false for a line the omit elision dropped', async () => {
		const { instance } = mount_diff({ a: A, b: B, lang: null, elide: 'omit' });
		assert.isFalse(await instance.scroll_to_line('a', 2));
		assert.isTrue(await instance.scroll_to_line('b', 15));
		assert.lengthOf(scrolled, 1);
	});

	test('a model swap keeps the highlight on the new rows', () => {
		const a_side = create_diff_side(A);
		const props: { source: ReturnType<typeof create_diff_model>; highlight: Array<DiffLineRange> } =
			$state({
				source: create_diff_model(a_side, create_diff_side(B)),
				highlight: [{ side: 'b', start: 4 }]
			});
		const { container } = mount_diff(props);
		assert.deepEqual(highlighted(container), ['4:4']);

		props.highlight = [{ side: 'a', start: 4 }];
		props.source = create_diff_model(a_side, create_diff_side(C));
		flushSync();
		assert.deepEqual(highlighted(container), ['4:null']);
	});
});
