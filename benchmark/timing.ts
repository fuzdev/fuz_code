/**
 * A small timer for the cost model: quick enough to run a few hundred cases in
 * seconds, steady enough to read a few percent. See `time_cases` for what
 * makes it steady.
 *
 * @module
 */

/**
 * One timed case.
 */
export interface Timing {
	/**
	 * Time of one call, in nanoseconds: the median across the processes of each
	 * one's fastest round.
	 */
	ns: number;
	/**
	 * How far the processes behind `ns` disagree: the slowest over the fastest.
	 */
	spread: number;
}

/**
 * A case timed over several rounds, in batches of a fixed number of calls.
 */
export interface TimedCase {
	fn: () => void;
	/** How many calls make a batch. */
	calls: number;
	/** The median batch of each round so far, in nanoseconds per call. */
	rounds: Array<number>;
}

// batches run before a case's first round: the optimizing compiler replaces a
// function some time after it turns hot, and a batch from before that
// measures the slower tier
const WARMUP_BATCHES = 12;
// later rounds only need the caches and the predictors back
const REWARM_BATCHES = 2;
const ROUND_BATCHES = 9;

const time_round = (c: TimedCase, warmup_batches: number): number => {
	const { fn, calls } = c;
	for (let b = 0; b < warmup_batches; b++) {
		for (let i = 0; i < calls; i++) fn();
	}
	const batches: Array<number> = [];
	for (let b = 0; b < ROUND_BATCHES; b++) {
		const started = performance.now();
		for (let i = 0; i < calls; i++) fn();
		batches.push(performance.now() - started);
	}
	batches.sort((a, b) => a - b);
	// the median drops the batches a collection or an interrupt landed in
	return (batches[batches.length >> 1]! / calls) * 1e6;
};

/**
 * Times every case in `cases` once per round, in order.
 *
 * Nothing here depends on the clock: a case makes the same calls in the same
 * order on every run. V8 decides when to optimize a function from how much it
 * has run, so with its background threads off (`--single-threaded`) a run
 * compiles the same code at the same points each time, and its numbers repeat
 * to a few percent. A harness that sizes its batches or its warmup by elapsed
 * time gets a different compile history per run, and short repetitive inputs
 * then land on one of several levels 20–40% apart.
 *
 * One pass over the cases is not enough either: the cases run the same lexer
 * functions on different text, so each one changes what the compiler knows
 * about them. By the later rounds every case has been seen, and `to_case_ns`
 * takes the fastest round.
 *
 * What is left is a case landing some 10–20% off in an occasional process,
 * from where its code and data happened to be placed. So the cost model runs
 * a few processes and takes each case's median (`to_timing`).
 */
export const time_cases = (cases: Array<TimedCase>, rounds: number): void => {
	for (let round = 0; round < rounds; round++) {
		for (const c of cases) {
			c.rounds.push(time_round(c, round === 0 ? WARMUP_BATCHES : REWARM_BATCHES));
		}
	}
};

/**
 * A case's time in this process: its fastest round.
 */
export const to_case_ns = (c: TimedCase): number => Math.min(...c.rounds);

/**
 * A case's timing from the time each process got for it: the median, and the
 * slowest process over the fastest.
 */
export const to_timing = (process_ns: Array<number>): Timing => {
	const sorted = [...process_ns].sort((a, b) => a - b);
	return { ns: sorted[sorted.length >> 1]!, spread: sorted[sorted.length - 1]! / sorted[0]! };
};
