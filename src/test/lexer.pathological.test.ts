import { describe, test, assert } from 'vitest';

import { syntax_styler_global } from '#lib/syntax_styler_global.ts';
import { validate_syntax_events } from '#lib/lexer.ts';
import { PATHOLOGICAL_CASES } from './pathological.ts';

// Pathological workloads (see `pathological.ts`) — enforces the lexer design's
// linearity rule: no rescans, work O(n) per language layer. Realistic samples
// can't catch a quadratic boundary scan; these inputs are built to.

const SMALL_SIZE = 16384;
const SCALE = 32;
// linear scaling gives a time ratio near SCALE; quadratic gives near SCALE² —
// the bound sits well above linear-with-noise and well below quadratic. The
// sizes matter as much as the bound: a quadratic backed by native `indexOf`
// (memchr-class speed) hides inside its constant factor at small sizes. At
// 16KB→256KB such a rescan measured 37–80x, passing a 64x bound; at
// 16KB→512KB it measured 264–320x, and 136–194x under 16 busy cores with
// suites running in parallel, while linear cases measured 33–38x, at most
// 74x under that load.
const MAX_RATIO = SCALE * 3;

/**
 * Returns a function timing one batch of lexes of `text`, per lex, with
 * enough repetitions that timer resolution doesn't dominate.
 */
const create_lex_timer = (text: string, lang: string): (() => number) => {
	syntax_styler_global.lex(text, lang); // warm
	const t0 = performance.now();
	syntax_styler_global.lex(text, lang);
	const once = performance.now() - t0;
	// target ≥5ms per batch, capped so fast cases don't spin needlessly
	const reps = Math.min(100, Math.max(1, Math.ceil(5 / Math.max(once, 0.05))));
	return () => {
		const start = performance.now();
		for (let r = 0; r < reps; r++) {
			syntax_styler_global.lex(text, lang);
		}
		return (performance.now() - start) / reps;
	};
};

/**
 * Times both sizes, taking each one's best batch, with the batches
 * interleaved so a burst of load from other processes (`gro check` runs
 * suites in parallel) lands on both sizes rather than inflating one.
 */
const measure_ratio = (time_small: () => number, time_large: () => number) => {
	let small = Infinity;
	let large = Infinity;
	for (let batch = 0; batch < 5; batch++) {
		small = Math.min(small, time_small());
		large = Math.min(large, time_large());
	}
	return { small, large, ratio: large / small };
};

for (const { name, lang, generate } of PATHOLOGICAL_CASES) {
	describe(`pathological: ${name}`, () => {
		test('produces a valid event stream at both sizes', () => {
			for (const size of [SMALL_SIZE, SMALL_SIZE * SCALE]) {
				const lexed = syntax_styler_global.lex(generate(size), lang);
				assert.deepEqual(validate_syntax_events(lexed), []);
			}
		});

		test('scales linearly', () => {
			const time_small = create_lex_timer(generate(SMALL_SIZE), lang);
			const time_large = create_lex_timer(generate(SMALL_SIZE * SCALE), lang);
			// noise only slows a measurement, so the best of a few keeps a real
			// quadratic's signal, which measures well over the bound every time
			let m = measure_ratio(time_small, time_large);
			for (let retry = 0; retry < 2 && m.ratio >= MAX_RATIO; retry++) {
				// the best time of each size so far, not the best ratio, which a
				// slowed small measurement would lower
				const next = measure_ratio(time_small, time_large);
				const small = Math.min(m.small, next.small);
				const large = Math.min(m.large, next.large);
				m = { small, large, ratio: large / small };
			}
			assert.isBelow(
				m.ratio,
				MAX_RATIO,
				`${name}: ${SCALE}x input took ${m.ratio.toFixed(1)}x time ` +
					`(${(m.small * 1000).toFixed(0)}μs → ${(m.large * 1000).toFixed(0)}μs) — superlinear scaling`
			);
		});
	});
}
