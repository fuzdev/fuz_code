import type {SvelteHTMLElements} from 'svelte/elements';
import type {Component} from 'svelte';
import type {BenchmarkStats as FuzBenchmarkStats} from '@fuzdev/fuz_util/benchmark_stats.js';

import type {ImplementationName} from './benchmark_fixtures.js';

export type BenchmarkComponentProps = SvelteHTMLElements['code'] & {
	content: string;
	lang: string;
	mode?: 'html' | 'ranges' | 'auto';
};

export interface BenchmarkConfig {
	iterations: number;
	warmup_count: number;
	cooldown_ms: number;
	content_multiplier: number;
}

export interface BenchmarkedImplementation {
	name: string;
	component: Component<BenchmarkComponentProps>;
	mode: 'html' | 'ranges' | 'auto' | null;
}

export interface StabilityCheck {
	is_stable: boolean;
	lag: number;
	memory_pressure?: number;
	jitter: number;
}

export interface MeasurementData {
	times_ms: Array<number>;
	stability_checks: Array<StabilityCheck>;
	timestamps: Array<number>;
}

/**
 * Browser benchmark stats extending fuz_util's BenchmarkStats with stability tracking.
 * Uses milliseconds for display (mean_ms, median_ms, etc.) while storing nanoseconds internally.
 */
export interface BrowserBenchmarkStats {
	/** Core stats from fuz_util (in nanoseconds) */
	core: FuzBenchmarkStats;
	/** Browser-specific: ratio of stable iterations (0-1) */
	stability_ratio: number;
	/** Browser-specific: count of unstable iterations */
	unstable_iterations: number;
}

/**
 * Benchmark result combining stats with test metadata.
 */
export interface BenchmarkResult {
	implementation: string;
	language: string;
	stats: BrowserBenchmarkStats;
}

export interface SummaryStats {
	avg_mean: number;
	avg_ops: number;
	avg_cv: number;
	languages: number;
	relative_speed?: number;
	improvement?: number;
}

// Benchmark harness controller interface
export interface BenchmarkHarnessController {
	run_iteration: (
		component: Component<BenchmarkComponentProps>,
		props: BenchmarkComponentProps,
	) => Promise<number>;
	cleanup: () => Promise<void>;
}

// Progress tracking callbacks
export interface ProgressCallbacks {
	on_progress?: (current: number, total: number) => void;
	on_test_start?: (test: string) => void;
	on_test_complete?: () => void;
	should_stop?: () => boolean;
}

// Benchmark runner state
export interface BenchmarkState {
	results: Array<BenchmarkResult>;
	warnings: Array<string>;
	summary: Record<ImplementationName, SummaryStats> | null;
}
