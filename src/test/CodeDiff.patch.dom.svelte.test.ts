/**
 * @vitest-environment jsdom
 */
import { describe, test, assert, afterEach, beforeEach, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { diff_hunks, diff_lines, type DiffHunk } from '@fuzdev/fuz_util/diff.ts';

import CodeDiff from '#lib/CodeDiff.svelte';
import {
	create_diff_model,
	create_diff_patch_source,
	create_diff_side,
	type DiffExpandedRange,
	type DiffLineRange,
	type DiffModel,
	type DiffRowSource
} from '#lib/diff_html.ts';

const numbered = (count: number): string =>
	Array.from({ length: count }, (_, i) => `line ${i + 1}`).join('\n') + '\n';

// sixty lines, lines 10 and 50 changed: the patch holds `b` lines 7-13 and
// 47-53, and lacks 1-6, 14-46, and 54-60
const A = numbered(60);
const B = A.replace('line 10\n', 'line ten\n').replace('line 50\n', 'line fifty\n');
const LINES = diff_lines(A, B);
const HUNKS: Array<DiffHunk> = diff_hunks(LINES, 3);
const create_model = (): DiffModel =>
	create_diff_model(create_diff_side(A, { lang: 'ts' }), create_diff_side(B, { lang: 'ts' }));

const ROW_HEIGHT = 20;
const VIEW_HEIGHT = 200;

// jsdom lays nothing out: rows stack `ROW_HEIGHT` apart, a split view's two
// cells sharing a row, scrolled by `scroll_top`. The scroller is whichever
// element `scroller` names: one in `overflowing`, which shows `VIEW_HEIGHT`
// of the rows from its top at 0, or the document's, which shows the window's
let scroll_top = 0;
let scroller: Element | null = null;
const overflowing: Set<Element> = new Set();
let scrolls: Array<ScrollToOptions> = [];
let scrolled: Array<Element> = [];
const STUBBED = ['getBoundingClientRect', 'scrollIntoView', 'scrollBy'] as const;
const originals = STUBBED.map((name) => Object.getOwnPropertyDescriptor(Element.prototype, name));
const SIZES = ['scrollHeight', 'clientHeight'] as const;
const original_sizes = SIZES.map((name) =>
	Object.getOwnPropertyDescriptor(Element.prototype, name)
);

const rect = (top: number, height: number): DOMRect =>
	({ top, bottom: top + height, height, width: 100, left: 0, right: 100, x: 0, y: top }) as DOMRect;

const layout_top = (el: Element): number | null => {
	const root = el.closest('.code_diff');
	if (!root) return null;
	let row = 0;
	for (const item of root.querySelectorAll('.diff_line, .diff_cell, .diff_skip')) {
		if (item === el) return Math.floor(row) * ROW_HEIGHT - scroll_top;
		row += item.classList.contains('diff_cell') ? 0.5 : 1;
	}
	return null;
};

beforeEach(() => {
	scroll_top = 0;
	scrolls = [];
	scrolled = [];
	Element.prototype.getBoundingClientRect = function (this: Element) {
		if (overflowing.has(this)) return rect(0, VIEW_HEIGHT);
		const top = layout_top(this);
		return top === null ? rect(0, 0) : rect(top, ROW_HEIGHT);
	};
	Element.prototype.scrollIntoView = function (this: Element) {
		scrolled.push(this);
	};
	Element.prototype.scrollBy = function (this: Element, options?: ScrollToOptions | number) {
		assert.strictEqual(this, scroller, 'scrolled the wrong element');
		assert.ok(typeof options === 'object');
		scrolls.push(options);
		scroll_top += options.top ?? 0;
	};
	for (const name of SIZES) {
		Object.defineProperty(Element.prototype, name, {
			configurable: true,
			get(this: Element) {
				return overflowing.has(this) ? (name === 'scrollHeight' ? 10_000 : VIEW_HEIGHT) : 0;
			}
		});
	}
});

let mounted: { instance: any; container: HTMLElement } | null = null;

afterEach(() => {
	STUBBED.forEach((name, i) => {
		const original = originals[i];
		if (original) Object.defineProperty(Element.prototype, name, original);
		else delete (Element.prototype as any)[name];
	});
	SIZES.forEach((name, i) => {
		const original = original_sizes[i];
		if (original) Object.defineProperty(Element.prototype, name, original);
		else delete (Element.prototype as any)[name];
	});
	if (mounted) {
		void unmount(mounted.instance);
		mounted.container.remove();
		mounted = null;
	}
	overflowing.clear();
	scroller = null;
});

/**
 * Mounts `CodeDiff` in a container that scrolls it, or with `'root'` one the
 * component's own root scrolls, or with `'window'` one that only
 * `overflow-y: auto` claims scrolls (as a sideways-scrolling wrapper does)
 * and the document does.
 */
const mount_diff = (
	props: Record<string, unknown>,
	scrolls_with: 'container' | 'root' | 'window' = 'container'
) => {
	const container = document.createElement('div');
	container.style.overflowY = 'auto';
	document.body.appendChild(container);
	const instance = mount(CodeDiff as any, {
		target: container,
		props: scrolls_with === 'root' ? Object.assign(props, { style: 'overflow-y: auto' }) : props
	});
	flushSync();
	const root = container.querySelector('.code_diff')!;
	scroller =
		scrolls_with === 'container'
			? container
			: scrolls_with === 'root'
				? root
				: (document.scrollingElement ?? document.documentElement);
	if (scrolls_with !== 'window') overflowing.add(scroller);
	mounted = { instance, container };
	return { instance, container };
};

/**
 * Props reading each of `keys` from `state`, writable so `bind:expanded` lands
 * there, and changing as `state` does.
 */
const state_props = <T extends Record<string, unknown>>(
	state: T,
	fixed: Record<string, unknown>,
	keys: Array<keyof T & string>
): Record<string, unknown> => {
	const out: Record<string, unknown> = { ...fixed };
	for (const key of keys) {
		Object.defineProperty(out, key, {
			get: () => state[key],
			set: (value: T[typeof key]) => {
				state[key] = value;
			},
			enumerable: true
		});
	}
	return out;
};

const b_rows = (container: HTMLElement): Array<number | null> =>
	[...container.querySelectorAll('.diff_line')].map((row) => {
		const b = row.getAttribute('data-b');
		return b === null ? null : Number(b);
	});

const range = (start: number, end: number): Array<number> =>
	Array.from({ length: end - start + 1 }, (_, i) => start + i);

const top_of = (container: HTMLElement, b: number): number =>
	container.querySelector(`[data-b="${b}"]`)!.getBoundingClientRect().top;

describe('CodeDiff with hunks', () => {
	test("renders the patch's rows, counting the lines it lacks without controls", () => {
		const { container } = mount_diff({ hunks: HUNKS, lang: 'ts', elide: 'expand' });
		assert.deepEqual(b_rows(container), [
			7,
			8,
			9,
			null,
			10,
			11,
			12,
			13,
			47,
			48,
			49,
			null,
			50,
			51,
			52,
			53
		]);
		const counts = [...container.querySelectorAll('.diff_skip')].map((row) => row.textContent);
		assert.deepEqual(counts, ['6 unchanged lines', '33 unchanged lines', 'unchanged lines']);
		assert.isNull(container.querySelector('[data-expand]'));
		assert.strictEqual(container.querySelector('.code_diff')!.getAttribute('data-lang'), 'ts');
	});

	test('b_line_count counts the lines after the last hunk', () => {
		const { container } = mount_diff({ hunks: HUNKS, b_line_count: 60, lang: 'ts' });
		assert.include(container.querySelector('.code_diff')!.textContent, '7 unchanged lines');
	});

	test('scroll_to_line finds a held line, and resolves false for one the patch lacks', async () => {
		const { instance } = mount_diff({ hunks: HUNKS, lang: 'ts', elide: 'expand' });
		assert.isTrue(await instance.scroll_to_line('b', 48));
		assert.strictEqual(scrolled.at(-1)!.getAttribute('data-b'), '48');
		assert.isFalse(await instance.scroll_to_line('b', 30));
		assert.isFalse(await instance.scroll_to_line('a', 2));
	});

	for (const [split, scrolls_with] of [
		[false, 'container'],
		[true, 'container'],
		[false, 'root'],
		[true, 'window']
	] as const) {
		test(`upgrading to the full model keeps expanded, highlight, and the row in view, ${split ? 'split' : 'unified'}, scrolled by the ${scrolls_with}`, () => {
			const state: {
				hunks?: Array<DiffHunk>;
				source?: DiffModel;
				highlight: Array<DiffLineRange>;
				expanded?: Array<DiffExpandedRange>;
			} = $state({
				hunks: HUNKS,
				highlight: [{ side: 'b', start: 48 }],
				expanded: [{ start: 1, end: Number.MAX_SAFE_INTEGER }]
			});
			const { container } = mount_diff(
				state_props(state, { lang: 'ts', elide: 'expand', split }, [
					'hunks',
					'source',
					'highlight',
					'expanded'
				]),
				scrolls_with
			);
			assert.isNull(container.querySelector('[data-b="30"]'));
			// scroll `b` line 48 to the top of the view
			scroll_top = top_of(container, 48);
			assert.strictEqual(top_of(container, 48), 0);
			const initial = scroll_top;

			state.hunks = undefined;
			state.source = create_model();
			flushSync();

			// every line now has a row, and line 48 is where it was
			assert.isNotNull(container.querySelector('[data-b="30"]'));
			if (!split)
				assert.deepEqual(b_rows(container), [
					...range(1, 9),
					null,
					...range(10, 49),
					null,
					...range(50, 60)
				]);
			assert.isAbove(scroll_top, 0);
			assert.strictEqual(top_of(container, 48), 0);
			// one correction, never animated
			assert.deepEqual(scrolls, [{ top: scroll_top - initial, behavior: 'instant' }]);
			assert.deepEqual(state.expanded, [{ start: 1, end: Number.MAX_SAFE_INTEGER }]);
			const highlighted = [...container.querySelectorAll('.diff_highlight')].map((row) =>
				row.getAttribute('data-b')
			);
			assert.isAbove(highlighted.length, 0);
			assert.ok(highlighted.every((b) => b === '48'));
			assert.isNull(container.querySelector('[data-expand]'));
		});
	}

	test('an upgrade with the anchor row out of view, or a first render, leaves the scroll alone', () => {
		const state: { hunks?: Array<DiffHunk>; source?: DiffModel } = $state({ hunks: HUNKS });
		const { container } = mount_diff(
			state_props(state, { lang: 'ts', elide: 'expand' }, ['hunks', 'source'])
		);
		assert.strictEqual(scroll_top, 0);
		// past the last row: nothing is in view
		scroll_top = 10_000;
		state.hunks = undefined;
		state.source = create_model();
		flushSync();
		assert.strictEqual(scroll_top, 10_000);
		assert.isNotNull(container.querySelector('[data-b="48"]'));
	});

	test('a patch source passed as source upgrades to a model in place', () => {
		const state: { source: DiffRowSource; expanded: Array<DiffExpandedRange> } = $state({
			source: create_diff_patch_source(HUNKS, { lang: 'ts' }),
			// every elided line as a row once the model holds it, so the upgrade
			// adds rows above line 48 that the anchor must make up for
			expanded: [{ start: 1, end: Number.MAX_SAFE_INTEGER }]
		});
		const { container } = mount_diff(
			state_props(state, { elide: 'expand', lang: 'svelte' }, ['source', 'expanded'])
		);
		const root = container.querySelector<HTMLElement>('.code_diff')!;
		// the source's language, not the ignored `lang`
		assert.strictEqual(root.dataset.lang, 'ts');
		assert.isNull(container.querySelector('[data-b="30"]'));
		scroll_top = top_of(container, 48);
		const initial = scroll_top;

		state.source = create_model();
		flushSync();

		// the lines the patch lacked now have rows above line 48, which stays put
		assert.isNotNull(container.querySelector('[data-b="30"]'));
		assert.isAbove(scroll_top, initial);
		assert.strictEqual(top_of(container, 48), 0);
		assert.deepEqual(scrolls, [{ top: scroll_top - initial, behavior: 'instant' }]);
		assert.strictEqual(root.dataset.lang, 'ts');
	});

	test("a patch source swapped for another's doesn't anchor", () => {
		const state: { source: DiffRowSource } = $state({
			source: create_diff_patch_source(HUNKS, { lang: 'ts' })
		});
		const { container } = mount_diff(state_props(state, { elide: 'none' }, ['source']));
		scroll_top = top_of(container, 48);
		const initial = scroll_top;
		// another file's hunks, with a change above line 48
		const other = diff_lines(A, B.replace('line 30\n', 'line thirty\n'));
		state.source = create_diff_patch_source(diff_hunks(other, 3), { lang: 'ts' });
		flushSync();
		assert.strictEqual(scroll_top, initial);
		assert.deepEqual(scrolls, []);
	});

	test('a source with no language renders no data-lang', () => {
		const model = create_model();
		// a hand-written source over a model's rows, with neither sides nor a lang
		const source: DiffRowSource = {
			lines: model.lines,
			width: model.width,
			hunk_ranges: (context_lines) => model.hunk_ranges(context_lines),
			elided_count: (start, end) => model.elided_count(start, end),
			b_through: (index) => model.b_through(index),
			partner: (index) => model.partner(index),
			fragment: (index, side, intraline) => model.fragment(index, side, intraline),
			prepare: (start, end, options) => model.prepare(start, end, options)
		};
		const { container } = mount_diff({ source, lang: 'svelte' });
		const root = container.querySelector<HTMLElement>('.code_diff')!;
		assert.isUndefined(root.dataset.lang);
		assert.isNotNull(container.querySelector('[data-b="50"]'));
	});

	test('revealing lines after the upgrade expands the lines the patch lacked', () => {
		const state: {
			hunks?: Array<DiffHunk>;
			source?: DiffModel;
			expanded?: Array<DiffExpandedRange>;
		} = $state({ hunks: HUNKS });
		const { container } = mount_diff(
			state_props(state, { lang: 'ts', elide: 'expand' }, ['hunks', 'source', 'expanded'])
		);
		state.hunks = undefined;
		state.source = create_model();
		flushSync();
		const row = container.querySelector<HTMLElement>('.diff_expand[data-b-start="14"]')!;
		row.querySelector<HTMLElement>('[data-expand="all"]')!.click();
		flushSync();
		assert.deepEqual(state.expanded, [{ start: 14, end: 46 }]);
		assert.isNotNull(container.querySelector('[data-b="30"]'));
	});

	test('an upgrade that makes the root overflow scrolls the root, not the page', () => {
		const state: { hunks?: Array<DiffHunk>; source?: DiffModel } = $state({ hunks: HUNKS });
		const { container } = mount_diff(
			state_props(state, { lang: 'ts', elide: 'none' }, ['hunks', 'source']),
			'root'
		);
		// a height-bounded root the patch's rows fit in, so the page scrolls them,
		// and the full model's rows overflow
		const root = container.querySelector('.code_diff')!;
		overflowing.delete(root);
		const bound = 30 * ROW_HEIGHT;
		Object.defineProperty(root, 'clientHeight', { get: () => bound });
		Object.defineProperty(root, 'scrollHeight', {
			get: () => root.querySelectorAll('.diff_line, .diff_skip').length * ROW_HEIGHT
		});
		assert.isAtMost(root.scrollHeight, bound);
		// the page scrolled so `b` line 48 is at the top of the window
		scroll_top = top_of(container, 48);

		state.hunks = undefined;
		state.source = create_model();
		flushSync();

		assert.isAbove(root.scrollHeight, bound);
		// one correction, of the root (the `scrollBy` stub checks `scroller`)
		assert.strictEqual(scrolls.length, 1);
		assert.strictEqual(scroller, root);
		assert.strictEqual(top_of(container, 48), 0);
	});

	test('a new source rendering the same rows leaves no anchor for a later render', () => {
		// plain text with known counts: the patch renders exactly the model's HTML
		const state: { hunks?: Array<DiffHunk>; source?: DiffModel; context_lines: number } = $state({
			hunks: HUNKS,
			context_lines: 3
		});
		const { container } = mount_diff(
			state_props(state, { lang: null, b_line_count: 60, elide: 'omit' }, [
				'hunks',
				'source',
				'context_lines'
			])
		);
		const before = container.querySelector('.code_diff')!.innerHTML;
		scroll_top = 100;
		state.hunks = undefined;
		state.source = create_diff_model(
			create_diff_side(A, { lang: null }),
			create_diff_side(B, { lang: null })
		);
		flushSync();
		assert.strictEqual(container.querySelector('.code_diff')!.innerHTML, before);
		assert.strictEqual(scroll_top, 100);
		// the reader scrolls on, and an unrelated change re-renders the rows
		scroll_top = 300;
		state.context_lines = 1;
		flushSync();
		assert.strictEqual(scroll_top, 300);
		assert.deepEqual(scrolls, []);
	});

	test('editing a or b, or new hunks, re-render without anchoring', () => {
		const state: { a: string; b: string } = $state({ a: A, b: B });
		const { container } = mount_diff(state_props(state, { lang: null, elide: 'none' }, ['a', 'b']));
		scroll_top = 400;
		const top = top_of(container, 30);
		// lines inserted above the rows in view move them down, as any edit would
		state.b = 'new 1\nnew 2\nnew 3\n' + B;
		flushSync();
		assert.strictEqual(scroll_top, 400);
		assert.strictEqual(top_of(container, 33), top + 3 * ROW_HEIGHT);

		const hunks_state: { hunks: ReadonlyArray<DiffHunk> } = $state({ hunks: HUNKS });
		void unmount(mounted!.instance);
		mounted!.container.remove();
		mounted = null;
		mount_diff(state_props(hunks_state, { lang: null, elide: 'none' }, ['hunks']));
		scroll_top = 200;
		hunks_state.hunks = diff_hunks(diff_lines(A, B.replace('line 30\n', 'line thirty\n')), 3);
		flushSync();
		assert.strictEqual(scroll_top, 200);
		assert.deepEqual(scrolls, []);
	});

	test('a line count the hunks contradict counts as unknown, logging in DEV', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			const { container } = mount_diff({ hunks: HUNKS, b_line_count: 20, lang: null });
			const counts = [...container.querySelectorAll('.diff_skip')].map((row) => row.textContent);
			assert.strictEqual(counts.at(-1), 'unchanged lines');
			assert.strictEqual(error.mock.calls.length, 1);
			assert.include(String(error.mock.calls[0]), 'b_line_count');
		} finally {
			error.mockRestore();
		}
		// malformed hunks still throw
		assert.throws(() =>
			mount_diff({ hunks: [{ ...HUNKS[0]!, a_count: 1 }], b_line_count: 60, lang: null })
		);
	});

	test('patch_context proves a last hunk reaches the end of the file', () => {
		const near_end = diff_hunks(diff_lines(A, A.replace('line 59\n', 'line 59!\n')), 3);
		const counts = (props: Record<string, unknown>): Array<string | null> =>
			[...mount_diff(props).container.querySelectorAll('.diff_skip')].map((row) => row.textContent);
		assert.deepEqual(counts({ hunks: near_end, lang: null }), [
			'55 unchanged lines',
			'unchanged lines'
		]);
		void unmount(mounted!.instance);
		mounted!.container.remove();
		mounted = null;
		assert.deepEqual(counts({ hunks: near_end, patch_context: 3, lang: null }), [
			'55 unchanged lines'
		]);
	});
});
