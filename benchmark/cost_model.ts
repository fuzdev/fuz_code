/**
 * The cost model: where a lexer's time goes, in seconds of running.
 *
 * It answers three questions the timing benchmark can't, each per language:
 *
 * - what each path of the lexer costs (`constructs.ts`: one unit of source
 *   repeated and timed), beside what the floor lexer takes for the same text;
 * - how far the lexer is from that floor on real source, per token and per
 *   char, and how much of a `stylize` is the renderer;
 * - where the time on real source goes: a census of the samples' tokens times
 *   each kind's measured cost, as shares of the measured lex time.
 *
 * It is for iterating on a change, so a whole run takes seconds and one
 * language a few. It keeps a per-machine baseline to read a change against.
 * `benchmarks.ts` remains the regression gate.
 *
 * @module
 */

import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join, relative, resolve } from 'node:path';
import { loadavg } from 'node:os';

import { samples as fixture_samples } from '../src/routes/samples/all.ts';
import { syntax_styler_global } from '../src/lib/syntax_styler_global.ts';
import {
	is_ident_start,
	lex_syntax,
	render_syntax_html,
	scan_ident,
	type LexedSyntax
} from '../src/lib/lexer.ts';
import { constructs, type Construct } from './constructs.ts';
import { floor_lexers } from './floor_lexer.ts';
import { read_html_sink, sink_html } from './html_sink.ts';
import { time_cases, to_case_ns, to_timing, type TimedCase, type Timing } from './timing.ts';

/* eslint-disable no-console */

const ROUNDS = 3;
// how many processes time the cases, side by side; see `time_cases`
const PROCESSES = 3;
// how much text one batch lexes, which sets how many calls it makes: about a
// millisecond of work
const BATCH_CHARS = 100_000;
// the renderer costs a few times the lexer per char
const HTML_BATCH_CHARS = 30_000;
const CONSTRUCT_REPEAT = 2000;

/**
 * Where `--save` writes the baselines, one for each set of cases a run can
 * cover. It holds this machine's times, so it is ignored by git.
 */
const BASELINE_FILE = join(import.meta.dirname, 'cost_model.local.json');

// a change smaller than this, against the baseline, is not called out
const CHANGE_THRESHOLD = 0.05;
// past this many samples, a language lists only their total
const MAX_SAMPLE_ROWS = 12;
// a case whose processes disagree by more than this is flagged as noisy
const SPREAD_THRESHOLD = 1.1;

/**
 * What a run covers.
 */
export interface CostModelOptions {
	/**
	 * Only this language, by id or alias.
	 */
	lang?: string;
	/**
	 * A directory of source files to use as the samples in place of the
	 * fixtures, each file's extension naming its language.
	 */
	corpus?: string;
	/**
	 * Whether to write the baseline after the run.
	 */
	save?: boolean;
}

interface Sample {
	name: string;
	lang: string;
	content: string;
}

/**
 * What a lexed stream holds: its tokens by type, and the identifiers it left
 * as plain text, under the type `ident`. Words inside a string or a heredoc
 * are content and not counted.
 */
interface Census {
	chars: number;
	tokens: number;
	/** Count and chars of the tokens of each type, by the type's name. */
	types: Map<string, { count: number; chars: number }>;
}

const create_census = (): Census => ({ chars: 0, tokens: 0, types: new Map() });

const census_add = (census: Census, type: string, chars: number): void => {
	let entry = census.types.get(type);
	if (entry === undefined) census.types.set(type, (entry = { count: 0, chars: 0 }));
	entry.count++;
	entry.chars += chars;
};

// containers whose plain text is content, not code: a word in one is no identifier
const TEXT_CONTAINERS: ReadonlySet<string> = new Set(['string', 'heredoc']);

// counts the identifiers in text no token covers, as the `ident` type
const census_gap = (census: Census, text: string, from: number, to: number): void => {
	let i = from;
	while (i < to) {
		if (is_ident_start(text.charCodeAt(i))) {
			const end = scan_ident(text, i, to);
			census_add(census, 'ident', end - i);
			i = end;
		} else {
			i++;
		}
	}
};

/**
 * Adds a lexed stream to `census`. A token is a leaf or a container's open,
 * and a container counts the chars up to its close.
 */
const census_lexed = (census: Census, lexed: LexedSyntax): void => {
	const { text, events, events_len } = lexed;
	const { infos } = lexed.types;
	const open_types: Array<string> = [];
	const open_starts: Array<number> = [];
	census.chars += text.length;
	let pos = 0;
	let i = 0;
	while (i < events_len) {
		const tag = events[i]!;
		const at = events[i + 1]!;
		if (open_types.length === 0 || !TEXT_CONTAINERS.has(open_types[open_types.length - 1]!)) {
			census_gap(census, text, pos, at);
		}
		if (tag > 0) {
			const end = events[i + 2]!;
			census.tokens++;
			census_add(census, infos[tag]!.name, end - at);
			pos = end;
			i += 3;
		} else {
			if (tag < 0) {
				census.tokens++;
				open_types.push(infos[-tag]!.name);
				open_starts.push(at);
			} else {
				census_add(census, open_types.pop()!, at - open_starts.pop()!);
			}
			pos = at;
			i += 2;
		}
	}
	census_gap(census, text, pos, text.length);
};

const to_lang_id = (lang: string): string | undefined => syntax_styler_global.langs.get(lang)?.id;

const load_fixture_samples = (): Array<Sample> =>
	Object.values(fixture_samples).flatMap((s) => {
		const lang = to_lang_id(s.lang);
		return lang === undefined ? [] : [{ name: s.name, lang, content: s.content }];
	});

const load_corpus_samples = async (dir: string): Promise<Array<Sample>> => {
	const loaded: Array<Sample> = [];
	const entries = await readdir(dir, { recursive: true, withFileTypes: true });
	for (const entry of entries) {
		if (!entry.isFile()) continue;
		const lang = to_lang_id(extname(entry.name).slice(1));
		if (lang === undefined || lang === 'plaintext') continue;
		const path = join(entry.parentPath, entry.name);
		const content = await readFile(path, 'utf8');
		if (content.length !== 0) loaded.push({ name: relative(dir, path), lang, content });
	}
	return loaded.sort((a, b) => (a.name < b.name ? -1 : 1));
};

interface ConstructResult {
	construct: Construct;
	/** What one unit lexes to: each token type and how many, e.g. `keyword punctuation×2`. */
	emits: string;
	tokens: number;
	/** Time for one unit. */
	lex: Timing;
	floor: Timing | null;
	census: Census;
}

interface SampleResult {
	sample: Sample;
	tokens: number;
	lex: Timing;
	floor: Timing | null;
	/** `stylize` and one read of its result. */
	html: Timing;
}

interface BudgetRow {
	kind: string;
	construct: string;
	count: number;
	/** Every type the pricing unit emits, the kind included: its cost pays for them all. */
	covers: Array<string>;
	/** The kind's cost: for one token, or for one char when `per_char`. */
	cost_ns: number;
	per_char: boolean;
	predicted_ns: number;
}

interface LangResult {
	lang: string;
	constructs: Array<ConstructResult>;
	samples: Array<SampleResult>;
	census: Census;
	budget: Array<BudgetRow>;
	/** The samples' measured lex time, summed. */
	lex_ns: number;
}

const format_emits = (census: Census, repeat: number): string =>
	[...census.types]
		.filter(([type]) => type !== 'ident')
		.map(([type, { count }]) => {
			const per_unit = count / repeat;
			return per_unit === 1 ? type : `${type}×${Number(per_unit.toFixed(2))}`;
		})
		.join(' ') || '—';

// set by the timed calls and checked after them, so none can be dropped. Kept a
// small integer: a sum left to grow turns into a double partway through a run,
// and the code adding to it is then compiled differently in a long run than in
// a short one
let lex_sink = 0;

// each case's timing, set once the processes have reported
const timings: Map<TimedCase, Timing> = new Map();

const timing_of = (c: TimedCase): Timing => {
	const timing = timings.get(c);
	if (timing === undefined) throw Error('unreachable: a case was read before it was timed');
	return timing;
};

const add_case = (
	cases: Array<TimedCase>,
	batch_chars: number,
	text: string,
	fn: () => void
): TimedCase => {
	const calls = Math.max(1, Math.round(batch_chars / Math.max(1, text.length)));
	const c: TimedCase = { fn, calls, rounds: [] };
	cases.push(c);
	return c;
};

const add_floor_case = (cases: Array<TimedCase>, lang: string, text: string): TimedCase | null => {
	const floor_lexer = floor_lexers[lang];
	if (floor_lexer === undefined) return null;
	return add_case(cases, BATCH_CHARS, text, () => {
		lex_sink = (lex_sink + lex_syntax(text, floor_lexer).events_len) | 0;
	});
};

/**
 * Queues a construct's cases on `cases` and returns what makes its result once
 * they have run.
 */
const prepare_construct = (
	cases: Array<TimedCase>,
	lang: string,
	construct: Construct
): (() => ConstructResult) => {
	const text = construct.unit.repeat(CONSTRUCT_REPEAT);
	const census = create_census();
	census_lexed(census, syntax_styler_global.lex(text, lang));
	const lex = add_case(cases, BATCH_CHARS, text, () => {
		lex_sink = (lex_sink + syntax_styler_global.lex(text, lang).events_len) | 0;
	});
	const floor = add_floor_case(cases, lang, text);
	const per_unit = (c: TimedCase): Timing => {
		const t = timing_of(c);
		return { ns: t.ns / CONSTRUCT_REPEAT, spread: t.spread };
	};
	return () => ({
		construct,
		emits: format_emits(census, CONSTRUCT_REPEAT),
		tokens: census.tokens / CONSTRUCT_REPEAT,
		lex: per_unit(lex),
		floor: floor === null ? null : per_unit(floor),
		census
	});
};

/**
 * Queues a sample's cases on `cases`, adds it to `census`, and returns what
 * makes its result once they have run.
 */
const prepare_sample = (
	cases: Array<TimedCase>,
	sample: Sample,
	census: Census
): (() => SampleResult) => {
	const { lang, content } = sample;
	const before = census.tokens;
	census_lexed(census, syntax_styler_global.lex(content, lang));
	const tokens = census.tokens - before;
	const lex = add_case(cases, BATCH_CHARS, content, () => {
		lex_sink = (lex_sink + syntax_styler_global.lex(content, lang).events_len) | 0;
	});
	const floor = add_floor_case(cases, lang, content);
	const html = add_case(cases, HTML_BATCH_CHARS, content, () => {
		sink_html(render_syntax_html(syntax_styler_global.lex(content, lang)));
	});
	return () => ({
		sample,
		tokens,
		lex: timing_of(lex),
		floor: floor === null ? null : timing_of(floor),
		html: timing_of(html)
	});
};

/**
 * Prices each kind that has a construct: the construct's time, less the
 * constructs it names in `minus`, per token or per char of the kind in the
 * unit, times what the samples hold of the kind.
 *
 * A unit that needs other tokens around its kind's (an element's punctuation,
 * a template's inner string) charges them to the kind, so those types count as
 * covered. Where such a type also has a construct of its own, the samples'
 * tokens of it are priced there too, and the two rows overlap.
 */
const to_budget = (
	lang: string,
	results: Array<ConstructResult>,
	census: Census
): Array<BudgetRow> => {
	const by_name = new Map(results.map((r) => [r.construct.name, r]));
	if (by_name.size !== results.length) throw Error(`${lang} has two constructs of one name`);
	const kinds = results.flatMap((r) => (r.construct.kind === undefined ? [] : [r.construct.kind]));
	if (new Set(kinds).size !== kinds.length) throw Error(`${lang} prices one kind with two constructs`);
	const rows: Array<BudgetRow> = [];
	for (const r of results) {
		const { kind, minus, per_char = false, name } = r.construct;
		if (kind === undefined) continue;
		let ns = r.lex.ns;
		for (const other of minus ?? []) {
			const o = by_name.get(other);
			if (o === undefined) throw Error(`${lang} construct "${name}" subtracts unknown "${other}"`);
			ns -= o.lex.ns;
		}
		const in_unit = r.census.types.get(kind);
		if (in_unit === undefined) {
			throw Error(`${lang} construct "${name}" emits no "${kind}", it emits: ${r.emits}`);
		}
		const cost_ns = Math.max(0, ns) / ((per_char ? in_unit.chars : in_unit.count) / CONSTRUCT_REPEAT);
		const held = census.types.get(kind);
		const count = held === undefined ? 0 : per_char ? held.chars : held.count;
		rows.push({
			kind,
			construct: name,
			covers: [...r.census.types.keys()],
			count,
			cost_ns,
			per_char,
			predicted_ns: count * cost_ns
		});
	}
	return rows.sort((a, b) => b.predicted_ns - a.predicted_ns);
};

interface PreparedCostModel {
	/** Every case of the run, in the order it is timed. */
	cases: Array<TimedCase>;
	/** Makes the results, once `timings` holds every case. */
	finish: () => Array<LangResult>;
}

/**
 * Builds a run's cases without timing them. The same options give the same
 * cases in the same order in every process, which is what lets the parent
 * match up what its children report.
 */
const prepare_cost_model = async (options: CostModelOptions): Promise<PreparedCostModel> => {
	const only = options.lang === undefined ? undefined : to_lang_id(options.lang);
	if (options.lang !== undefined && only === undefined) {
		throw Error(`The language "${options.lang}" is not registered.`);
	}
	if (only !== undefined && constructs[only] === undefined) {
		throw Error(`The language "${only}" has no constructs in benchmark/constructs.ts.`);
	}
	const all_samples =
		options.corpus === undefined
			? load_fixture_samples()
			: await load_corpus_samples(options.corpus);
	const cases: Array<TimedCase> = [];
	const prepared = Object.keys(constructs)
		.filter((lang) => only === undefined || lang === only)
		.map((lang) => {
			const census = create_census();
			return {
				lang,
				census,
				constructs: constructs[lang]!.map((c) => prepare_construct(cases, lang, c)),
				samples: all_samples
					.filter((s) => s.lang === lang)
					.map((s) => prepare_sample(cases, s, census))
			};
		});
	const finish = (): Array<LangResult> =>
		prepared.map((p) => {
			const lang_constructs = p.constructs.map((c) => c());
			const lang_samples = p.samples.map((s) => s());
			return {
				lang: p.lang,
				constructs: lang_constructs,
				samples: lang_samples,
				census: p.census,
				budget: to_budget(p.lang, lang_constructs, p.census),
				lex_ns: lang_samples.reduce((sum, s) => sum + s.lex.ns, 0)
			};
		});
	return { cases, finish };
};

/**
 * The V8 flags a timing process runs with, which make a run compile the same
 * code at the same points every time: no background compiler or collector
 * threads, and a fixed seed for string hashes, which otherwise move the
 * buckets of the lexers' keyword `Map`s and `Set`s from run to run.
 */
const V8_FLAGS = ['--single-threaded', '--hash-seed=1', '--random-seed=1'];

/**
 * Times a run's cases in this process and returns each case's time, in the
 * order `prepare_cost_model` makes them. What a child process runs.
 */
export const time_cost_model_cases = async (options: CostModelOptions): Promise<Array<number>> => {
	const { cases } = await prepare_cost_model(options);
	time_cases(cases, ROUNDS);
	if (lex_sink + read_html_sink() === 0 && cases.length !== 0) {
		throw Error('unreachable: the timed calls were dropped');
	}
	return cases.map(to_case_ns);
};

// the CPUs this process may run on, from a list like `0-3,8`
const read_allowed_cpus = (): Array<number> => {
	const status = readFileSync('/proc/self/status', 'utf8');
	const list = /^Cpus_allowed_list:\s*(.+)$/m.exec(status)?.[1] ?? '';
	const cpus: Array<number> = [];
	for (const part of list.split(',')) {
		const [from, to = from] = part.split('-').map(Number);
		if (from === undefined || Number.isNaN(from) || Number.isNaN(to)) continue;
		for (let cpu = from; cpu <= to!; cpu++) cpus.push(cpu);
	}
	return cpus;
};

/**
 * Picks a CPU on each of `count` physical cores for the timing processes, from
 * the ones this process may use, so that no two share a core's two threads.
 * Skips the first core, which the OS favors for its own work. Linux only;
 * empty when the topology can't be read, `taskset` can't pin to them, or
 * there aren't enough cores, and then the processes are not pinned.
 */
const pick_cpus = (count: number): Array<number> => {
	if (process.platform !== 'linux') return [];
	const cores: Set<string> = new Set();
	const cpus: Array<number> = [];
	try {
		for (const cpu of read_allowed_cpus()) {
			const siblings = readFileSync(
				`/sys/devices/system/cpu/cpu${cpu}/topology/thread_siblings_list`,
				'utf8'
			).trim();
			if (cores.has(siblings)) continue;
			cores.add(siblings);
			if (cores.size > 1) cpus.push(cpu);
		}
	} catch {
		return [];
	}
	if (cpus.length < count) return [];
	const picked = cpus.slice(0, count);
	const pinned = spawnSync('taskset', ['-c', picked.join(','), 'true']);
	return pinned.status === 0 ? picked : [];
};

interface TimingProcess {
	child: ChildProcess;
	times: Promise<Array<number>>;
}

const start_timing_process = (
	script: string,
	args: Array<string>,
	cpu: number | undefined
): TimingProcess => {
	const node_args = [...V8_FLAGS, script, '--child', ...args];
	const child =
		cpu === undefined
			? spawn(process.execPath, node_args, { stdio: ['ignore', 'pipe', 'inherit'] })
			: spawn('taskset', ['-c', String(cpu), process.execPath, ...node_args], {
					stdio: ['ignore', 'pipe', 'inherit']
				});
	const times = new Promise<Array<number>>((resolve, reject) => {
		let out = '';
		child.stdout.on('data', (chunk: Buffer) => {
			out += chunk.toString();
		});
		child.on('error', reject);
		child.on('close', (code) => {
			if (code !== 0) {
				reject(Error(`a timing process exited with code ${code}`));
				return;
			}
			try {
				resolve(JSON.parse(out) as Array<number>);
			} catch {
				reject(Error('a timing process printed something other than its times'));
			}
		});
	});
	return { child, times };
};

/**
 * Runs the cost model for each language that has constructs: the cases are
 * timed by `PROCESSES` child processes at once, each running
 * `script` with `args` and `--child`, and each case takes the median.
 *
 * @param script - the entry point to run in each child, which must call
 *   `time_cost_model_cases` when given `--child` and print the result as JSON
 * @param args - the arguments that give the children the same `options`
 */
const run_cost_model = async (
	options: CostModelOptions,
	script: string,
	args: Array<string>
): Promise<Array<LangResult>> => {
	const { cases, finish } = await prepare_cost_model(options);
	const cpus = pick_cpus(PROCESSES);
	const processes = Array.from({ length: PROCESSES }, (_, i) =>
		start_timing_process(script, args, cpus[i])
	);
	let reports: Array<Array<number>>;
	try {
		reports = await Promise.all(processes.map((p) => p.times));
	} catch (error) {
		// one failed: the others' times are no use
		for (const p of processes) p.child.kill();
		throw error;
	}
	for (const report of reports) {
		if (report.length !== cases.length) {
			throw Error(`a timing process reported ${report.length} cases, expected ${cases.length}`);
		}
	}
	cases.forEach((c, i) => {
		timings.set(c, to_timing(reports.map((report) => report[i]!)));
	});
	return finish();
};

/**
 * The times a baseline keeps, by a key naming the case.
 */
type Baseline = Record<string, number>;

const to_baseline = (results: Array<LangResult>): Baseline => {
	const baseline: Baseline = {};
	for (const r of results) {
		for (const c of r.constructs) {
			baseline[`${r.lang}:construct:${c.construct.name}`] = c.lex.ns;
			if (c.floor !== null) baseline[`${r.lang}:floor:construct:${c.construct.name}`] = c.floor.ns;
		}
		for (const s of r.samples) {
			baseline[`${r.lang}:lex:${s.sample.name}`] = s.lex.ns;
			baseline[`${r.lang}:html:${s.sample.name}`] = s.html.ns;
			if (s.floor !== null) baseline[`${r.lang}:floor:sample:${s.sample.name}`] = s.floor.ns;
		}
	}
	return baseline;
};

/**
 * Names what a run covered, which is what its baseline is kept under. A run
 * is only compared with a run of the same cases: what a case costs depends on
 * what ran before it in the process, since the cases share lexer functions and
 * each leaves the compiler knowing something different about them. The same
 * construct can time tens of percent apart between a run of one language, a
 * full run, and a run over a corpus, so its cost is read within a run and
 * against that run's own baseline.
 */
const to_scope = (options: CostModelOptions): string =>
	(options.lang === undefined ? 'all' : (to_lang_id(options.lang) ?? options.lang)) +
	(options.corpus === undefined ? '' : ` ${resolve(options.corpus)}`);

interface BaselineFile {
	/** The baseline of each scope, by `to_scope`. */
	scopes: Record<string, { saved_at: string; node: string; times: Baseline }>;
}

const load_baseline_file = async (): Promise<BaselineFile> => {
	try {
		const { scopes } = JSON.parse(await readFile(BASELINE_FILE, 'utf8'));
		return typeof scopes === 'object' && scopes !== null ? { scopes } : { scopes: {} };
	} catch {
		// missing or unreadable: the same as none saved
		return { scopes: {} };
	}
};

/**
 * How the machine's speed has moved since the baseline, as the median change
 * of the floor lexers' times: 1.03 is 3% slower. The floor lexers are many
 * cases of the same kind of work as the real ones and none of the lexers'
 * code, so their median moves with the machine (a laptop running the timing
 * processes back to back slows a few percent as it warms) and not with a
 * change to a lexer. A change to what they share with the lexers, the
 * emitters and scanning helpers in `lexer.ts`, does move it, and the run's
 * last line says how far it moved, to be read with that in mind.
 */
const to_drift = (baseline: Baseline | null, now: Baseline): number => {
	if (baseline === null) return 1;
	const ratios: Array<number> = [];
	for (const key in now) {
		const before = baseline[key];
		if (before !== undefined && key.includes(':floor:')) ratios.push(now[key]! / before);
	}
	if (ratios.length === 0) return 1;
	ratios.sort((a, b) => a - b);
	return ratios[ratios.length >> 1]!;
};

/**
 * What a time is compared with: the baseline's times scaled by the drift, so
 * the machine running a few percent slower or faster than it did then is not
 * read as a change in the code.
 */
type Reference = Record<string, number>;

const to_reference = (baseline: Baseline | null, drift: number): Reference | null =>
	baseline === null
		? null
		: Object.fromEntries(Object.entries(baseline).map(([key, ns]) => [key, ns * drift]));

const format_ns = (ns: number): string =>
	ns >= 1e6
		? `${(ns / 1e6).toFixed(2)}ms`
		: ns >= 1e4
			? `${(ns / 1e3).toFixed(1)}µs`
			: ns >= 100
				? ns.toFixed(0)
				: ns.toFixed(1);

const format_ratio = (n: number): string => `${n.toFixed(n >= 10 ? 0 : 1)}×`;

const format_percent = (n: number): string => `${(n * 100).toFixed(0)}%`;

// the change against the reference, blank when there is none or it is small
const format_change = (reference: Reference | null, key: string, ns: number): string => {
	const before = reference?.[key];
	if (before === undefined) return '';
	const change = ns / before - 1;
	if (Math.abs(change) < CHANGE_THRESHOLD) return '·';
	return `${change > 0 ? '+' : ''}${(change * 100).toFixed(0)}%`;
};

const format_noise = (...timings: Array<Timing | null>): string =>
	timings.some((t) => t !== null && t.spread > SPREAD_THRESHOLD) ? '~' : '';

// pads each column to its widest cell: the first left-aligned, the rest right
const format_table = (head: Array<string>, rows: Array<Array<string>>): string => {
	const widths = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i]!.length)));
	const line = (cells: Array<string>): string =>
		cells
			.map((c, i) => (i === 0 ? c.padEnd(widths[i]!) : c.padStart(widths[i]!)))
			.join('  ')
			.trimEnd();
	return [line(head), line(widths.map((w) => '-'.repeat(w))), ...rows.map(line)].join('\n');
};

const format_constructs = (r: LangResult, reference: Reference | null): string =>
	format_table(
		['construct', 'unit', 'emits', 'ns/unit', 'ns/token', 'floor', '× floor', 'Δ', ''],
		r.constructs.map((c) => [
			c.construct.name,
			JSON.stringify(c.construct.unit.length > 24 ? c.construct.unit.slice(0, 21) + '…' : c.construct.unit),
			c.emits.length > 44 ? c.emits.slice(0, 43) + '…' : c.emits,
			format_ns(c.lex.ns),
			c.tokens === 0 ? '—' : format_ns(c.lex.ns / c.tokens),
			c.floor === null ? '—' : format_ns(c.floor.ns),
			c.floor === null ? '—' : format_ratio(c.lex.ns / c.floor.ns),
			format_change(reference, `${r.lang}:construct:${c.construct.name}`, c.lex.ns),
			format_noise(c.lex, c.floor)
		])
	);

const format_samples = (r: LangResult, reference: Reference | null): string => {
	const row = (
		name: string,
		chars: number,
		tokens: number,
		lex_ns: number,
		floor_ns: number | null,
		html_ns: number,
		changes: [lex: string, html: string],
		noise: string
	): Array<string> => [
		name,
		String(chars),
		String(tokens),
		(lex_ns / chars).toFixed(2),
		tokens === 0 ? '—' : format_ns(lex_ns / tokens),
		((chars / lex_ns) * 1e3).toFixed(0),
		floor_ns === null ? '—' : format_ratio(lex_ns / floor_ns),
		changes[0],
		format_ns(html_ns),
		format_percent(1 - lex_ns / html_ns),
		changes[1],
		noise
	];
	const rows = r.samples.map((s) =>
		row(
			s.sample.name,
			s.sample.content.length,
			s.tokens,
			s.lex.ns,
			s.floor?.ns ?? null,
			s.html.ns,
			[
				format_change(reference, `${r.lang}:lex:${s.sample.name}`, s.lex.ns),
				format_change(reference, `${r.lang}:html:${s.sample.name}`, s.html.ns)
			],
			format_noise(s.lex, s.floor, s.html)
		)
	);
	if (r.samples.length > 1) {
		const sum = (f: (s: SampleResult) => number): number => r.samples.reduce((n, s) => n + f(s), 0);
		const before = (kind: string): number | undefined => {
			let total = 0;
			for (const s of r.samples) {
				const ns = reference?.[`${r.lang}:${kind}:${s.sample.name}`];
				if (ns === undefined) return undefined;
				total += ns;
			}
			return total;
		};
		const change = (kind: string, ns: number): string => {
			const b = before(kind);
			return b === undefined ? '' : format_change({ total: b }, 'total', ns);
		};
		const lex_ns = sum((s) => s.lex.ns);
		const html_ns = sum((s) => s.html.ns);
		rows.push(
			row(
				'total',
				sum((s) => s.sample.content.length),
				sum((s) => s.tokens),
				lex_ns,
				r.samples.every((s) => s.floor !== null) ? sum((s) => s.floor!.ns) : null,
				html_ns,
				[change('lex', lex_ns), change('html', html_ns)],
				''
			)
		);
	}
	return format_table(
		[
			'sample',
			'chars',
			'tokens',
			'ns/char',
			'ns/token',
			'MB/s',
			'× floor',
			'Δ',
			'html',
			'render',
			'Δ',
			''
		],
		// too many to read: only their total
		rows.length > MAX_SAMPLE_ROWS ? rows.slice(-1) : rows
	);
};

const format_budget = (r: LangResult): string => {
	const predicted = r.budget.reduce((sum, b) => sum + b.predicted_ns, 0);
	const covered = new Set(r.budget.flatMap((b) => b.covers));
	const uncovered = [...r.census.types]
		.filter(([type]) => !covered.has(type) && type !== 'ident')
		.sort((a, b) => b[1].count - a[1].count);
	const uncovered_count = uncovered.reduce((sum, [, { count }]) => sum + count, 0);
	const table = format_table(
		['kind', 'priced by', 'count', 'cost', 'of lex time'],
		r.budget
			.filter((b) => b.count !== 0)
			.map((b) => [
				b.kind,
				b.construct,
				b.per_char ? `${b.count} chars` : String(b.count),
				`${format_ns(b.cost_ns)}${b.per_char ? '/char' : ''}`,
				format_percent(b.predicted_ns / r.lex_ns)
			])
	);
	const lines = [
		table,
		`priced: ${format_percent(predicted / r.lex_ns)} of the measured lex time`,
		uncovered_count === 0
			? ''
			: `no construct for: ${uncovered_count} of ${r.census.tokens} tokens (${uncovered
					.slice(0, 6)
					.map(([type, { count }]) => `${type} ${count}`)
					.join(', ')}${uncovered.length > 6 ? ', …' : ''})`
	];
	return lines.filter((l) => l !== '').join('\n');
};

/**
 * Formats a run as text: for each language its constructs, its samples, and
 * its budget, each with the change against `reference` where there is one.
 */
const format_cost_model = (results: Array<LangResult>, reference: Reference | null): string => {
	const parts: Array<string> = [];
	for (const r of results) {
		parts.push(`## ${r.lang}\n`, format_constructs(r, reference), '');
		if (r.samples.length !== 0) {
			parts.push(format_samples(r, reference), '', format_budget(r), '');
		}
	}
	parts.push(
		'ns/unit: one unit of the construct. floor: the floor lexer on the same text. Δ: against the',
		`baseline, · within ${format_percent(CHANGE_THRESHOLD)}. ~: the processes disagreed by more than ${format_percent(SPREAD_THRESHOLD - 1)}. html: stylize and one read of`,
		'the result. render: the share of html that is not the lexer.'
	);
	return parts.join('\n');
};

/**
 * Runs the cost model, prints it against the baseline, and with
 * `options.save` writes the new baseline.
 *
 * @param script - see `run_cost_model`
 * @param args - see `run_cost_model`
 */
export const run_and_print_cost_model = async (
	options: CostModelOptions,
	script: string,
	args: Array<string>
): Promise<void> => {
	const load = loadavg()[0]!;
	if (load > 1) {
		console.log(`⚠️  load average ${load.toFixed(2)}: the machine is busy, expect noise\n`);
	}
	const started = performance.now();
	const scope = to_scope(options);
	const file = await load_baseline_file();
	const saved = file.scopes[scope];
	// another Node is another V8: its times say nothing about this one's
	const stale = saved !== undefined && saved.node !== process.version;
	const baseline = saved === undefined || stale ? null : saved.times;
	const results = await run_cost_model(options, script, args);
	const now = to_baseline(results);
	const drift = to_drift(baseline, now);
	console.log(format_cost_model(results, to_reference(baseline, drift)));
	const seconds = ((performance.now() - started) / 1e3).toFixed(1);
	const baseline_path = relative(process.cwd(), BASELINE_FILE);
	console.log(
		baseline !== null
			? `\n${seconds}s, the floor lexers run at ${format_percent(drift)} of their baseline time`
			: stale
				? `\n${seconds}s, the baseline for this run is from Node ${saved.node} and was not used (--save replaces it)`
				: `\n${seconds}s, no baseline for this run (--save writes one to ${baseline_path})`
	);
	if (options.save) {
		file.scopes[scope] = { saved_at: new Date().toISOString(), node: process.version, times: now };
		await writeFile(BASELINE_FILE, JSON.stringify(file, null, '\t') + '\n');
		console.log(`✓ baseline saved to ${baseline_path}`);
	}
};
