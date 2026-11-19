/**
 * @vitest-environment jsdom
 */
import { describe, test, assert, afterEach, beforeEach } from 'vitest';
import { flushSync, hydrate, mount, tick, unmount } from 'svelte';
import { readFileSync } from 'node:fs';

import CodeDiff from '#lib/CodeDiff.svelte';
import {
	create_diff_model,
	create_diff_side,
	type DiffExpandedRange,
	type DiffLineRange,
	type DiffModel
} from '#lib/diff_html.ts';

const numbered = (count: number): string =>
	Array.from({ length: count }, (_, i) => `line ${i + 1}`).join('\n') + '\n';

// sixty lines, line 30 changed: at context 3 the leading region is lines
// 1-26 and the trailing one lines 34-60
const A = numbered(60);
const B = A.replace('line 30\n', 'line thirty\n');

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

/**
 * Props whose `expanded` is bound: the component's writes land in `state`.
 */
const bound_props = (
	state: { expanded?: Array<DiffExpandedRange> },
	props: Record<string, unknown>
): Record<string, unknown> => {
	const out = { ...props };
	Object.defineProperty(out, 'expanded', {
		get: () => state.expanded,
		set: (value: Array<DiffExpandedRange>) => {
			state.expanded = value;
		},
		enumerable: true
	});
	return out;
};

/**
 * The `b` numbers of the unified rows, `null` for a removed row.
 */
const b_rows = (container: HTMLElement): Array<number | null> =>
	[...container.querySelectorAll('.diff_line')].map((row) => {
		const b = row.getAttribute('data-b');
		return b === null ? null : Number(b);
	});

const count_row = (container: HTMLElement, b_start: number): HTMLElement =>
	container.querySelector<HTMLElement>(`.diff_expand[data-b-start="${b_start}"]`)!;

const click = (container: HTMLElement, b_start: number, direction: string): void => {
	count_row(container, b_start).querySelector<HTMLElement>(`[data-expand="${direction}"]`)!.click();
	flushSync();
};

const range = (start: number, end: number): Array<number> =>
	Array.from({ length: end - start + 1 }, (_, i) => start + i);

const HUNK = [27, 28, 29, null, 30, 31, 32, 33];

/**
 * A root's markup without Svelte's hydration comments.
 */
const markup = (container: Element): string => container.innerHTML.replace(/<!--[^]*?-->/g, '');

/**
 * Mounts a second, fresh `CodeDiff` with `props`, returning its markup.
 */
const fresh_markup = (props: Record<string, unknown>): string => {
	const container = document.createElement('div');
	const instance = mount(CodeDiff as any, { target: container, props });
	flushSync();
	const html = markup(container);
	void unmount(instance);
	return html;
};

describe("CodeDiff with elide: 'expand'", () => {
	test('expand down, up, and all reveal the right rows, keeping the others', () => {
		const state: { expanded?: Array<DiffExpandedRange> } = $state({});
		const { container } = mount_diff(
			bound_props(state, { a: A, b: B, lang: null, elide: 'expand' })
		);
		assert.deepEqual(b_rows(container), HUNK);
		const hunk_rows = [...container.querySelectorAll('[data-hunk]')];

		// the leading region: up reveals the 20 lines above the hunk
		click(container, 1, 'up');
		assert.deepEqual(b_rows(container), [...range(7, 26), ...HUNK]);
		assert.deepEqual(state.expanded, [{ start: 7, end: 26 }]);
		const revealed = [...container.querySelectorAll('[data-b="7"], [data-b="26"]')];
		assert.strictEqual(revealed[0]!.getAttribute('data-a'), '7');
		assert.isNull(revealed[0]!.getAttribute('data-hunk'));

		// the trailing region: down reveals the 20 lines below the hunk
		click(container, 34, 'down');
		assert.deepEqual(b_rows(container), [...range(7, 26), ...HUNK, ...range(34, 53)]);
		assert.deepEqual(state.expanded, [
			{ start: 7, end: 26 },
			{ start: 34, end: 53 }
		]);

		// what's left of each is small: all only
		assert.deepEqual(
			[...count_row(container, 1).querySelectorAll('[data-expand]')].map((b) =>
				b.getAttribute('data-expand')
			),
			['all']
		);
		click(container, 54, 'all');
		click(container, 1, 'all');
		assert.deepEqual(b_rows(container), [...range(1, 29), null, ...range(30, 60)]);
		assert.deepEqual(state.expanded, [
			{ start: 1, end: 26 },
			{ start: 34, end: 60 }
		]);
		assert.isNull(container.querySelector('.diff_expand'));

		// the hunk's rows were never re-rendered
		const hunk_after = [...container.querySelectorAll('[data-hunk]')];
		assert.strictEqual(hunk_after.length, hunk_rows.length);
		for (let i = 0; i < hunk_rows.length; i++) assert.strictEqual(hunk_after[i], hunk_rows[i]);
	});

	test('revealing more next to revealed rows keeps their nodes', () => {
		const { container } = mount_diff({ a: A, b: B, lang: null, elide: 'expand', expand_step: 5 });
		click(container, 34, 'down');
		const first = [...container.querySelectorAll('[data-b]')];
		click(container, 39, 'down');
		const after = [...container.querySelectorAll('[data-b]')];
		assert.strictEqual(after.length, first.length + 5);
		// every row from before is the same node, in the same order
		const kept = after.filter((row) => first.includes(row));
		assert.deepEqual(kept, first);
	});

	test('an expanded value set from outside renders, and binds back', () => {
		const state: { expanded?: Array<DiffExpandedRange> } = $state({
			expanded: [{ start: 2, end: 3 }]
		});
		const { container } = mount_diff(
			bound_props(state, { a: A, b: B, lang: null, elide: 'expand' })
		);
		assert.deepEqual(b_rows(container), [2, 3, ...HUNK]);
		const hunk_row = container.querySelector('[data-hunk]');

		// a hunk's lines and lines past the end are ignored, and the value stays as set
		state.expanded = [
			{ start: 58, end: 99 },
			{ start: 28, end: 29 }
		];
		flushSync();
		assert.deepEqual(b_rows(container), [...HUNK, 58, 59, 60]);
		assert.deepEqual(state.expanded, [
			{ start: 58, end: 99 },
			{ start: 28, end: 29 }
		]);
		assert.strictEqual(container.querySelector('[data-hunk]'), hunk_row);

		// an expansion writes the value back normalized and clamped
		click(container, 1, 'up');
		assert.deepEqual(state.expanded, [
			{ start: 7, end: 26 },
			{ start: 58, end: 60 }
		]);
	});

	test('a new model keeps expanded and applies it to its own regions', () => {
		const b_side = create_diff_side(B);
		const props: { source: DiffModel; elide: 'expand'; expanded: Array<DiffExpandedRange> } =
			$state({
				source: create_diff_model(create_diff_side(A), b_side),
				elide: 'expand',
				expanded: [
					{ start: 5, end: 6 },
					{ start: 40, end: 41 }
				]
			});
		const { container } = mount_diff(props);
		assert.deepEqual(b_rows(container), [5, 6, ...HUNK, 40, 41]);

		// line 40 changes too: its lines join a hunk, the rest stay revealed
		props.source = create_diff_model(
			create_diff_side(A.replace('line 40\n', 'line 40!\n')),
			b_side
		);
		flushSync();
		assert.deepEqual(b_rows(container), [5, 6, ...HUNK, 37, 38, 39, null, 40, 41, 42, 43]);
		assert.deepEqual(props.expanded, [
			{ start: 5, end: 6 },
			{ start: 40, end: 41 }
		]);
	});

	test('highlight applies to revealed rows', () => {
		const props: {
			a: string;
			b: string;
			lang: null;
			elide: 'expand';
			highlight: Array<DiffLineRange>;
		} = $state({ a: A, b: B, lang: null, elide: 'expand', highlight: [{ side: 'b', start: 10 }] });
		const { container } = mount_diff(props);
		assert.isNull(container.querySelector('.diff_highlight'));
		click(container, 1, 'all');
		const row = container.querySelector('[data-b="10"]')!;
		assert.isTrue(row.classList.contains('diff_highlight'));

		props.highlight = [{ side: 'a', start: 11 }];
		flushSync();
		assert.isFalse(row.classList.contains('diff_highlight'));
		assert.isTrue(container.querySelector('[data-b="11"]')!.classList.contains('diff_highlight'));
	});

	test('scroll_to_line reveals a window around a hidden line, then scrolls to it', async () => {
		const state: { expanded?: Array<DiffExpandedRange> } = $state({});
		const { instance, container } = mount_diff(
			bound_props(state, { a: A, b: B, lang: null, elide: 'expand' })
		);
		assert.isTrue(await instance.scroll_to_line('a', 45));
		assert.deepEqual(state.expanded, [{ start: 35, end: 54 }]);
		assert.lengthOf(scrolled, 1);
		assert.strictEqual(scrolled[0]!.getAttribute('data-a'), '45');
		assert.isTrue(container.contains(scrolled[0]!));

		// a revealed line scrolls without revealing more
		assert.isTrue(await instance.scroll_to_line('b', 50));
		assert.deepEqual(state.expanded, [{ start: 35, end: 54 }]);
		assert.isFalse(await instance.scroll_to_line('b', 99));
		assert.lengthOf(scrolled, 2);
	});

	test('the split view reveals cells in its flat grid', () => {
		const { container } = mount_diff({ a: A, b: B, lang: null, elide: 'expand', split: true });
		const root = container.querySelector('.code_diff')!;
		click(container, 1, 'up');
		const cells = [...container.querySelectorAll('[data-b="7"]')];
		assert.lengthOf(cells, 2);
		// cells and count rows are the grid's own children
		for (const cell of cells) assert.strictEqual(cell.parentElement, root);
		assert.strictEqual(count_row(container, 1).parentElement, root);
		assert.isNull(container.querySelector('.diff_split_rows'));
	});

	test('a focused control hands focus to the same control of what stays hidden', async () => {
		const { container } = mount_diff({ a: A, b: B, lang: null, elide: 'expand', expand_step: 5 });
		const up = count_row(container, 1).querySelector<HTMLElement>('[data-expand="up"]')!;
		up.focus();
		up.click();
		await tick();
		const focused = document.activeElement!;
		assert.strictEqual(focused.getAttribute('data-expand'), 'up');
		assert.strictEqual(focused.closest('.diff_expand')!.getAttribute('data-b-end'), '21');
	});

	test('other elide modes ignore expanded', () => {
		const { container } = mount_diff({
			a: A,
			b: B,
			lang: null,
			elide: 'details',
			expanded: [{ start: 1, end: 60 }]
		});
		assert.isNull(container.querySelector('.diff_expand'));
		assert.lengthOf(container.querySelectorAll('details'), 2);
	});
});

describe("CodeDiff with elide: 'expand': changes, focus, and edge inputs", () => {
	test('a model or option change mid-expansion renders as a fresh mount', () => {
		const store: Record<string, unknown> = $state({
			a: A,
			b: B,
			lang: null,
			elide: 'expand',
			expanded: undefined,
			split: undefined,
			context_lines: undefined,
			line_numbers: undefined,
			intraline: undefined,
			expand_step: undefined
		});
		// every prop reads the store, and `expanded` binds back to it
		const props = {};
		for (const key of Object.keys(store)) {
			Object.defineProperty(props, key, {
				get: () => store[key],
				set: (value: unknown) => (store[key] = value),
				enumerable: true
			});
		}
		const { container } = mount_diff(props);
		click(container, 1, 'up');
		click(container, 34, 'down');
		const changes: Array<Record<string, unknown>> = [
			{ split: true },
			{ context_lines: 1 },
			{ line_numbers: false },
			{ intraline: false },
			{ expand_step: 4 },
			{ b: B.replace('line 45\n', 'line 45!\n') },
			{ context_lines: 3, split: false }
		];
		for (const change of changes) {
			Object.assign(store, change);
			flushSync();
			const label = JSON.stringify(change);
			assert.strictEqual(markup(container), fresh_markup($state.snapshot(store)), label);
			container.querySelector<HTMLElement>('.diff_expand [data-expand]')?.click();
			flushSync();
			assert.strictEqual(markup(container), fresh_markup($state.snapshot(store)), label);
		}
	});

	test('after a click reveals the rest of a region, focus moves to the nearest control', async () => {
		const b = A.replace('line 30\n', 'line thirty\n').replace('line 50\n', 'line fifty\n');
		const { container } = mount_diff({ a: A, b, lang: null, elide: 'expand' });
		const regions = () =>
			[...container.querySelectorAll('.diff_expand')].map((row) =>
				row.getAttribute('data-b-start')
			);
		assert.deepEqual(regions(), ['1', '34', '54']);

		const activate = async (b_start: number, direction: string): Promise<Element> => {
			const button = count_row(container, b_start).querySelector<HTMLElement>(
				`[data-expand="${direction}"]`
			)!;
			button.focus();
			button.click();
			await tick();
			return document.activeElement!;
		};
		// the next region's first control
		let focused = await activate(34, 'all');
		assert.strictEqual(focused.closest('.diff_expand')!.getAttribute('data-b-start'), '54');
		assert.strictEqual(focused.getAttribute('data-expand'), 'all');
		// with none after, the previous region's last control
		focused = await activate(54, 'all');
		assert.strictEqual(focused.closest('.diff_expand')!.getAttribute('data-b-start'), '1');
		assert.strictEqual(focused.getAttribute('data-expand'), 'all');
		// with none left, the root, focusable by script only
		focused = await activate(1, 'all');
		const root = container.querySelector('.code_diff')!;
		assert.strictEqual(focused, root);
		assert.strictEqual(root.getAttribute('tabindex'), '-1');
	});

	test('scroll_to_line on a hunk line or a non-integer line reveals nothing', async () => {
		const state: { expanded?: Array<DiffExpandedRange> } = $state({});
		const { instance } = mount_diff(
			bound_props(state, { a: A, b: B, lang: null, elide: 'expand' })
		);
		assert.isTrue(await instance.scroll_to_line('b', 30));
		assert.isUndefined(state.expanded);
		assert.isFalse(await instance.scroll_to_line('b', 10.5));
		assert.isFalse(await instance.scroll_to_line('a', NaN));
		assert.isUndefined(state.expanded);
		assert.lengthOf(scrolled, 1);
	});

	test("an element of the consumer's with its own data-expand is no control", () => {
		const state: { expanded?: Array<DiffExpandedRange> } = $state({});
		const { container } = mount_diff(
			bound_props(state, { a: A, b: B, lang: null, elide: 'expand' })
		);
		const foreign = document.createElement('button');
		foreign.dataset.expand = 'sideways';
		count_row(container, 1).appendChild(foreign);
		foreign.click();
		flushSync();
		assert.isUndefined(state.expanded);
	});

	test('a cleared highlight stays cleared through later expansions', () => {
		const props: Record<string, unknown> = $state({
			a: A,
			b: B,
			lang: null,
			elide: 'expand',
			highlight: [{ side: 'b', start: 1, end: 60 }]
		});
		const { container } = mount_diff(props);
		click(container, 1, 'up');
		assert.isAbove(container.querySelectorAll('.diff_highlight').length, 20);
		props.highlight = [];
		flushSync();
		assert.lengthOf(container.querySelectorAll('.diff_highlight'), 0);
		click(container, 34, 'down');
		click(container, 1, 'all');
		assert.lengthOf(container.querySelectorAll('.diff_highlight'), 0);
		props.highlight = [{ side: 'b', start: 40 }];
		flushSync();
		assert.deepEqual(
			[...container.querySelectorAll('.diff_highlight')].map((row) => row.getAttribute('data-b')),
			['40']
		);
	});
});

describe('CodeDiff hydrated', () => {
	// the server render is a fixture `CodeDiff.test.ts` checks against the
	// server build, since this environment compiles only the client one
	for (const split of [false, true]) {
		test(`server-rendered rows hydrate in place, and their controls work (split ${split})`, () => {
			const props = { a: A, b: B, lang: null, elide: 'expand' as const, split };
			const body = readFileSync(
				`src/test/fixtures/generated/code_diff/expand${split ? '.split' : ''}.ssr.html`,
				'utf8'
			);
			const container = document.createElement('div');
			container.innerHTML = body;
			document.body.appendChild(container);
			const hunk_row = container.querySelector('[data-hunk]');
			const warnings: Array<unknown> = [];
			const original_warn = console.warn; // eslint-disable-line no-console
			console.warn = (...args: Array<unknown>) => warnings.push(args); // eslint-disable-line no-console
			const instance = hydrate(CodeDiff as any, { target: container, props: { ...props } });
			flushSync();
			console.warn = original_warn; // eslint-disable-line no-console
			mounted = { instance, container };
			assert.deepEqual(warnings, []);
			assert.strictEqual(container.querySelector('[data-hunk]'), hunk_row);

			click(container, 1, 'up');
			click(container, 34, 'all');
			assert.strictEqual(container.querySelector('[data-hunk]'), hunk_row);
			assert.strictEqual(
				markup(container),
				fresh_markup({
					...props,
					expanded: [
						{ start: 7, end: 26 },
						{ start: 34, end: 60 }
					]
				})
			);
		});
	}
});
