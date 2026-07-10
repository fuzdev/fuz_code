# Benchmark Baseline Results

<!-- node-bench:start -->

## Benchmark Results

### Baseline (1x content)

| Task Name               | ops/sec    | p50 (μs) | p75 (μs) | p90 (μs) | p95 (μs) | p99 (μs) | min (μs) | max (μs) | vs Best  |
| ----------------------- | ---------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- |
| baseline:json_complex   | 243,220.27 |     4.12 |     4.46 |     7.23 |     8.25 |    11.85 |     3.71 |  1899.81 | baseline |
| baseline:css_complex    | 161,243.83 |     6.21 |     6.48 |     9.99 |    11.54 |    17.02 |     5.77 |  5623.44 |    1.51x |
| baseline:ts_complex     |  17,591.93 |    56.87 |    57.82 |    62.92 |    76.14 |   108.89 |    53.03 |  5454.17 |   13.83x |
| baseline:html_complex   |  64,995.01 |    15.35 |    15.97 |    19.97 |    25.49 |    32.18 |    14.03 |  3856.62 |    3.74x |
| baseline:svelte_complex |  18,577.11 |    53.85 |    54.90 |    60.82 |    80.54 |   105.30 |    50.23 |  3536.41 |   13.09x |
| baseline:md_complex     |  21,204.77 |    47.17 |    48.08 |    51.35 |    61.06 |    92.99 |    44.06 |  2994.40 |   11.47x |
| baseline:bash_complex   |  25,712.77 |    38.89 |    39.62 |    41.19 |    53.38 |    74.29 |    36.28 |   503.38 |    9.46x |

### Large (100x content)

| Task Name            | ops/sec  | p50 (ms) | p75 (ms) | p90 (ms) | p95 (ms) | p99 (ms) | min (ms) | max (ms) | vs Best  |
| -------------------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- |
| large:json_complex   | 2,223.38 |     0.45 |     0.46 |     0.49 |     0.60 |     0.80 |     0.42 |     2.14 | baseline |
| large:css_complex    | 1,464.53 |     0.68 |     0.71 |     0.85 |     1.08 |     1.29 |     0.63 |     3.06 |    1.52x |
| large:ts_complex     |   137.71 |     7.21 |     7.55 |     8.11 |     9.19 |    12.21 |     6.64 |    14.09 |   16.15x |
| large:html_complex   |   597.91 |     1.67 |     1.77 |     2.06 |     2.20 |     2.70 |     1.56 |     3.32 |    3.72x |
| large:svelte_complex |   149.85 |     6.58 |     7.09 |     7.98 |     8.31 |     9.13 |     5.97 |    12.76 |   14.84x |
| large:md_complex     |   107.60 |     9.27 |     9.72 |    11.72 |    12.13 |    12.79 |     8.67 |    14.58 |   20.66x |
| large:bash_complex   |   209.69 |     4.74 |     5.03 |     6.15 |     6.88 |     7.72 |     4.43 |    10.20 |   10.60x |

### Pathological (generated, 32KB)

| Task Name                            | ops/sec  | p50 (ms) | p75 (ms) | p90 (ms) | p95 (ms) | p99 (ms) | min (ms) | max (ms) | vs Best  |
| ------------------------------------ | -------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- |
| pathological:ts_colon_dense          |   485.87 |     2.05 |     2.18 |     2.38 |     2.71 |     3.26 |     1.96 |     3.83 |   14.01x |
| pathological:ts_angle_dense          |   529.38 |     1.88 |     2.01 |     2.26 |     2.54 |     3.26 |     1.74 |     4.36 |   12.86x |
| pathological:ts_paren_dense          |   539.91 |     1.85 |     1.94 |     2.34 |     2.58 |     3.21 |     1.77 |     3.67 |   12.61x |
| pathological:ts_deep_template        |   309.85 |     3.21 |     3.37 |     3.59 |     3.75 |     4.22 |     3.07 |     4.83 |   21.97x |
| pathological:ts_huge_line            |   893.42 |     1.12 |     1.15 |     1.32 |     1.57 |     1.88 |     1.05 |     2.74 |    7.62x |
| pathological:ts_long_string          | 6,258.79 |     0.16 |     0.17 |     0.22 |     0.29 |     0.34 |     0.15 |     3.82 |    1.09x |
| pathological:ts_escape_heavy         | 6,806.33 |     0.15 |     0.15 |     0.18 |     0.23 |     0.29 |     0.14 |     3.99 | baseline |
| pathological:ts_many_tiny            |   484.70 |     2.05 |     2.19 |     2.53 |     2.77 |     3.25 |     1.92 |     4.85 |   14.04x |
| pathological:json_deep_array         | 3,027.37 |     0.33 |     0.34 |     0.38 |     0.44 |     0.59 |     0.31 |     2.38 |    2.25x |
| pathological:html_angle_flood        | 1,108.13 |     0.90 |     0.93 |     1.07 |     1.30 |     1.58 |     0.82 |     2.31 |    6.14x |
| pathological:html_attr_dense         |   542.58 |     1.84 |     1.90 |     2.14 |     2.57 |     2.89 |     1.70 |     4.12 |   12.54x |
| pathological:html_entity_dense       | 2,179.84 |     0.46 |     0.47 |     0.50 |     0.65 |     1.04 |     0.42 |     1.77 |    3.12x |
| pathological:svelte_expression_dense |   271.40 |     3.66 |     3.83 |     4.21 |     4.56 |     4.87 |     3.42 |     5.56 |   25.08x |
| pathological:md_emphasis_dense       | 2,236.90 |     0.45 |     0.46 |     0.50 |     0.59 |     0.82 |     0.43 |     2.47 |    3.04x |
| pathological:md_fence_dense          |   778.02 |     1.29 |     1.33 |     1.50 |     1.69 |     2.09 |     1.20 |    11.81 |    8.75x |
| pathological:md_bracket_dense        | 2,725.11 |     0.37 |     0.37 |     0.41 |     0.45 |     0.63 |     0.34 |     2.25 |    2.50x |
| pathological:md_link_paren_dense     | 2,390.37 |     0.42 |     0.42 |     0.44 |     0.51 |     0.77 |     0.39 |     2.25 |    2.85x |
| pathological:svelte_attr_expr_dense  |   520.96 |     1.92 |     2.00 |     2.26 |     2.37 |     2.93 |     1.81 |     3.45 |   13.07x |
| pathological:css_deep_nesting        | 1,123.53 |     0.89 |     0.92 |     1.07 |     1.27 |     1.55 |     0.82 |     3.52 |    6.06x |
| pathological:bash_deep_command_sub   |   468.33 |     2.14 |     2.20 |     2.43 |     2.83 |     3.14 |     2.00 |     3.93 |   14.53x |

<!-- node-bench:end -->

## Browser Benchmark Results

html 90.09ms avg time 22 ops/sec 1.4% CV

ranges 26.17ms avg time 48 ops/sec 4.8% CV +244.3% vs baseline

| Language | Implementation | Mean (ms) | Median (ms) | Std Dev | CV   | P75 (ms) | P90 (ms) | P95 (ms) | P99 (ms) | Ops/sec | Outliers | Failed | Stability |
| -------- | -------------- | --------- | ----------- | ------- | ---- | -------- | -------- | -------- | -------- | ------- | -------- | ------ | --------- |
| ts       | html           | 72.54     | 72.50       | 3.66    | 5.1% | 74.00    | 76.76    | 77.68    | 78.42    | 14      | 0/5      | 0      | 100%      |
| ts       | ranges         | 37.82     | 37.70       | 2.15    | 5.7% | 39.70    | 40.24    | 40.42    | 40.56    | 26      | 0/5      | 0      | 100%      |
| css      | html           | 13.73     | 13.70       | 0.05    | 0.3% | 13.75    | 13.78    | 13.79    | 13.80    | 73      | 2/5      | 0      | 100%      |
| css      | ranges         | 13.80     | 13.80       | 0.00    | 0.0% | 13.80    | 13.80    | 13.80    | 13.80    | 72      | 2/5      | 0      | 100%      |
| html     | html           | 112.80    | 112.60      | 0.53    | 0.5% | 112.88   | 113.37   | 113.54   | 113.67   | 9       | 1/5      | 0      | 100%      |
| html     | ranges         | 15.48     | 15.00       | 1.43    | 9.2% | 15.90    | 17.16    | 17.58    | 17.92    | 65      | 0/5      | 0      | 100%      |
| json     | html           | 188.20    | 188.20      | 0.49    | 0.3% | 188.50   | 188.68   | 188.74   | 188.79   | 5       | 2/5      | 0      | 100%      |
| json     | ranges         | 13.72     | 13.75       | 0.08    | 0.6% | 13.80    | 13.80    | 13.80    | 13.80    | 73      | 1/5      | 0      | 100%      |
| svelte   | html           | 98.42     | 97.80       | 1.66    | 1.7% | 98.87    | 100.27   | 100.73   | 101.11   | 10      | 1/5      | 0      | 100%      |
| svelte   | ranges         | 38.94     | 39.80       | 2.28    | 5.9% | 40.80    | 41.10    | 41.20    | 41.28    | 26      | 0/5      | 0      | 100%      |
| md       | html           | 54.86     | 55.00       | 0.45    | 0.8% | 55.10    | 55.34    | 55.42    | 55.48    | 18      | 0/5      | 0      | 100%      |
| md       | ranges         | 37.24     | 35.90       | 2.79    | 7.5% | 39.30    | 40.68    | 41.14    | 41.51    | 27      | 0/5      | 0      | 100%      |

Legend CV: Coefficient of Variation (std_dev/mean) - lower is better, <15% is
good P75/P90/P95/P99: Percentiles - X% of measurements were faster than this
Ops/sec: Operations per second (throughput) Stability: Percentage of iterations
with stable system metrics
