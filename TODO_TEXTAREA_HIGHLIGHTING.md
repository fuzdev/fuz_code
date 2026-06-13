# TODO: textarea range highlighting

Adding live syntax highlighting to a `<textarea>` via the CSS Custom Highlight
API, plus a perf/robustness restructure of the existing ranges path.

## Decisions (from review)

- **Render strategy**: CSS Custom Highlight API ranges over a transparent
  textarea with a backdrop mirror element (not HTML-span overlay).
- **Refactor depth**: deep — prioritize fast/efficient code over minimal churn.
- **Textarea scope**: minimal, value-driven highlighted input. No line numbers,
  no tab-to-indent, no auto-resize, no undo machinery. Scroll-sync is included
  (essential + trivial); richer editor behavior is the consumer's job.
- **Safari**: author will verify in Safari after the fact. Design defensively
  around the crash hypotheses; can't run WebKit in the build env.

## Review findings (the "why")

Crash hypotheses (unverified — need Safari):

1. Leading: volume of **live** `Range` objects accumulating in shared global
   `CSS.highlights` sets; WebKit Highlight painting/bookkeeping is fragile at
   scale (the 100x benchmark + multi-instance `/samples` are the stressors).
2. Secondary: `clear_element_ranges()` **threw** on a missing shared highlight
   — an uncaught throw inside `$effect`/`onDestroy` can wedge the page.

Perf waste:

- A separate live `Range` was created **per alias** with identical bounds. A
  single range object can be a member of multiple `Highlight` sets, so this was
  ~2x the necessary range count. (The old "ranges can't be reused" comment was
  wrong.)
- Full re-tokenize + full range rebuild ran inside an `$effect` keyed on
  unrelated reactive deps. Catastrophic for a textarea (every keystroke).

## Plan / status

- [x] Restructure `highlight_manager.ts`:
  - [x] Prefer `StaticRange` (immutable, not tracked across DOM mutations) with
        a live-`Range` fallback. We rebuild wholesale, so liveness only costs.
  - [x] Reuse one range object across a token's type + all aliases.
  - [x] Defensive `clear_element_ranges()` (skip missing highlights, never throw).
  - [x] DEV-gate the strict length/bounds assertions; production clamps/skips
        instead of throwing.
- [x] Memoize tokenization in a `$derived` (CodeHighlight + CodeTextarea) so
      unrelated reactivity doesn't re-tokenize.
- [x] `CodeTextarea.svelte` — minimal value-driven highlighted textarea.
- [x] Update `highlight_test_helpers.ts` (mock `StaticRange`) + tests for the
      new defensive contract.
- [x] Demo route for the textarea (`/textarea`).
- [x] `gro check` green.
- [ ] Author verifies in Safari (crash gone, ranges paint, StaticRange accepted
      by `Highlight.add`, backdrop/textarea alignment holds).

## Not done (future levers)

- True incremental tokenization (re-tokenize only changed lines). The tokenizer
  is whole-string regex/linked-list; line-level incrementality is a large,
  separate effort. Current efficiency comes from StaticRange + memoized
  tokenization + halved range count, not from incremental parsing.
- Per-instance highlight isolation: not feasible without dynamic CSS, because
  `::highlight(name)` selectors are static. Highlights stay global-by-type by
  API design; correctness comes from the defensive clear, perf from StaticRange.
