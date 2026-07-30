# Benchmark Baseline Results

<!-- node-bench:start -->

## Benchmark Results

### Baseline (1x content)

| Task Name               | ops/sec    | p50 (μs) | p75 (μs) | p90 (μs) | p95 (μs) | p99 (μs) | min (μs) | max (μs) | vs Best  |
| ----------------------- | ---------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- |
| baseline:json_complex   | 260,069.90 | 3.85     | 4.56     | 7.40     | 8.46     | 14.65    | 3.45     | 1563.51  | baseline |
| baseline:css_complex    | 167,012.07 | 5.99     | 6.32     | 9.97     | 13.07    | 19.59    | 5.50     | 11815.94 | 1.56x    |
| baseline:ts_complex     | 19,432.01  | 51.52    | 52.43    | 55.23    | 64.98    | 94.46    | 48.46    | 4094.13  | 13.38x   |
| baseline:html_complex   | 65,731.39  | 15.19    | 15.67    | 17.33    | 21.50    | 31.21    | 13.96    | 1749.55  | 3.96x    |
| baseline:svelte_complex | 17,331.59  | 57.70    | 58.83    | 62.36    | 71.82    | 110.52   | 54.46    | 602.01   | 15.01x   |
| baseline:md_complex     | 19,371.82  | 51.64    | 52.63    | 56.05    | 63.93    | 95.81    | 48.53    | 2740.51  | 13.43x   |
| baseline:sh_complex     | 23,532.17  | 42.47    | 43.24    | 44.49    | 48.70    | 75.43    | 40.15    | 1410.32  | 11.05x   |

### Large (100x content)

| Task Name            | ops/sec  | p50 (ms) | p75 (ms) | p90 (ms) | p95 (ms) | p99 (ms) | min (ms) | max (ms) | vs Best  |
| -------------------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- |
| large:json_complex   | 2,153.19 | 0.46     | 0.47     | 0.50     | 0.55     | 0.76     | 0.44     | 1.27     | baseline |
| large:css_complex    | 1,422.42 | 0.70     | 0.72     | 0.74     | 0.83     | 1.29     | 0.67     | 1.76     | 1.51x    |
| large:ts_complex     | 156.82   | 6.37     | 6.48     | 6.68     | 7.25     | 10.36    | 6.15     | 11.25    | 13.73x   |
| large:html_complex   | 634.84   | 1.57     | 1.61     | 1.77     | 2.24     | 2.51     | 1.49     | 5.02     | 3.39x    |
| large:svelte_complex | 153.08   | 6.52     | 6.73     | 7.43     | 10.55    | 11.06    | 6.18     | 12.00    | 14.07x   |
| large:md_complex     | 155.49   | 6.42     | 6.66     | 7.51     | 7.78     | 8.25     | 6.11     | 10.59    | 13.85x   |
| large:sh_complex     | 210.39   | 4.75     | 4.85     | 5.45     | 6.53     | 7.01     | 4.58     | 8.57     | 10.23x   |

### Pathological (generated, 32KB)

| Task Name                                | ops/sec  | p50 (ms) | p75 (ms) | p90 (ms) | p95 (ms) | p99 (ms) | min (ms) | max (ms) | vs Best  |
| ---------------------------------------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- |
| pathological:ts_colon_dense              | 595.01   | 1.68     | 1.71     | 1.79     | 1.95     | 2.94     | 1.60     | 3.74     | 11.06x   |
| pathological:ts_angle_dense              | 624.93   | 1.60     | 1.63     | 1.76     | 1.91     | 2.94     | 1.53     | 4.47     | 10.53x   |
| pathological:ts_paren_dense              | 579.86   | 1.73     | 1.75     | 1.81     | 1.98     | 2.44     | 1.65     | 5.74     | 11.34x   |
| pathological:ts_deep_template            | 666.61   | 1.50     | 1.54     | 1.69     | 1.77     | 2.04     | 1.42     | 2.68     | 9.87x    |
| pathological:ts_huge_line                | 1,017.25 | 0.98     | 1.01     | 1.11     | 1.56     | 1.86     | 0.91     | 4.74     | 6.47x    |
| pathological:ts_long_string              | 5,299.46 | 0.19     | 0.19     | 0.20     | 0.23     | 0.32     | 0.17     | 2.56     | 1.24x    |
| pathological:ts_escape_heavy             | 6,578.47 | 0.15     | 0.15     | 0.16     | 0.17     | 0.22     | 0.14     | 1.58     | baseline |
| pathological:ts_many_tiny                | 560.31   | 1.79     | 1.81     | 1.91     | 2.40     | 2.54     | 1.72     | 3.26     | 11.74x   |
| pathological:json_deep_array             | 3,137.71 | 0.32     | 0.32     | 0.34     | 0.37     | 0.58     | 0.30     | 1.80     | 2.10x    |
| pathological:html_angle_flood            | 1,171.54 | 0.86     | 0.87     | 0.90     | 0.99     | 1.37     | 0.82     | 1.75     | 5.62x    |
| pathological:html_attr_dense             | 733.30   | 1.36     | 1.39     | 1.49     | 1.92     | 2.18     | 1.29     | 2.84     | 8.97x    |
| pathological:html_entity_dense           | 1,959.96 | 0.51     | 0.52     | 0.53     | 0.56     | 1.02     | 0.48     | 1.53     | 3.36x    |
| pathological:svelte_expression_dense     | 306.70   | 3.24     | 3.34     | 3.55     | 3.66     | 3.86     | 3.07     | 4.89     | 21.45x   |
| pathological:md_emphasis_dense           | 2,267.50 | 0.44     | 0.45     | 0.48     | 0.51     | 0.72     | 0.42     | 2.17     | 2.90x    |
| pathological:md_fence_dense              | 733.96   | 1.36     | 1.38     | 1.42     | 1.60     | 1.94     | 1.32     | 2.12     | 8.96x    |
| pathological:md_bracket_dense            | 2,549.72 | 0.39     | 0.40     | 0.42     | 0.44     | 0.68     | 0.38     | 2.19     | 2.58x    |
| pathological:md_link_paren_dense         | 2,196.22 | 0.46     | 0.46     | 0.49     | 0.51     | 0.83     | 0.44     | 2.45     | 3.00x    |
| pathological:svelte_attr_expr_dense      | 464.01   | 2.15     | 2.20     | 2.38     | 2.44     | 2.77     | 2.06     | 4.17     | 14.18x   |
| pathological:svelte_tag_only_dense       | 673.00   | 1.49     | 1.52     | 1.65     | 2.35     | 2.58     | 1.39     | 3.78     | 9.77x    |
| pathological:html_no_entity_dense        | 664.61   | 1.51     | 1.54     | 1.63     | 1.93     | 2.53     | 1.42     | 2.76     | 9.90x    |
| pathological:md_tag_per_line             | 669.58   | 1.49     | 1.52     | 1.65     | 1.98     | 2.50     | 1.41     | 3.77     | 9.82x    |
| pathological:md_link_paren_per_line      | 1,676.69 | 0.60     | 0.60     | 0.63     | 0.64     | 0.80     | 0.57     | 2.21     | 3.92x    |
| pathological:css_deep_nesting            | 1,168.69 | 0.86     | 0.87     | 0.92     | 1.04     | 1.29     | 0.81     | 1.69     | 5.63x    |
| pathological:bash_deep_command_sub       | 1,077.93 | 0.93     | 0.95     | 1.03     | 1.19     | 1.78     | 0.88     | 2.32     | 6.10x    |
| pathological:ts_template_full_depth      | 580.57   | 1.72     | 1.78     | 2.91     | 3.30     | 3.54     | 1.63     | 4.74     | 11.33x   |
| pathological:bash_cmdsub_full_depth      | 686.52   | 1.45     | 1.52     | 2.01     | 2.70     | 3.09     | 1.35     | 4.28     | 9.58x    |
| pathological:bash_heredoc_sub_full_depth | 404.31   | 2.48     | 2.51     | 2.65     | 2.93     | 3.20     | 2.39     | 3.72     | 16.27x   |
| pathological:bash_heredoc_dense          | 1,064.06 | 0.94     | 0.96     | 0.99     | 1.12     | 1.45     | 0.90     | 1.90     | 6.18x    |
| pathological:md_deep_self_embed          | 89.08    | 11.21    | 11.46    | 11.66    | 12.21    | 15.35    | 10.75    | 16.87    | 73.85x   |

### Output metrics

Deterministic DOM-cost proxies (not timed): spans rendered and utf8 HTML bytes per case.

| task                                     | input chars | spans | html bytes | bytes/char |
| :--------------------------------------- | ----------: | ----: | ---------: | ---------: |
| baseline:json_complex                    |         327 |    77 |       3175 |       9.71 |
| baseline:css_complex                     |         502 |    73 |       3263 |       6.50 |
| baseline:ts_complex                      |        2883 |   577 |      25443 |       8.83 |
| baseline:html_complex                    |         733 |   230 |      11416 |      15.57 |
| baseline:svelte_complex                  |        2517 |   680 |      30931 |      12.29 |
| baseline:md_complex                      |        2799 |   525 |      25681 |       9.18 |
| baseline:sh_complex                      |        2749 |   344 |      15497 |       5.64 |
| pathological:ts_colon_dense              |       32768 | 16384 |     622592 |      19.00 |
| pathological:ts_angle_dense              |       32768 | 16384 |     671744 |      20.50 |
| pathological:ts_paren_dense              |       32769 | 21846 |     851994 |      26.00 |
| pathological:ts_deep_template            |       32763 | 38994 |    2285772 |      69.77 |
| pathological:ts_huge_line                |       32760 | 10920 |     433524 |      13.23 |
| pathological:ts_long_string              |       32767 |     4 |      32911 |       1.00 |
| pathological:ts_escape_heavy             |       32767 |     4 |      32911 |       1.00 |
| pathological:ts_many_tiny                |       32768 | 24576 |     925696 |      28.25 |
| pathological:json_deep_array             |       32767 |     3 |      32879 |       1.00 |
| pathological:html_angle_flood            |       32769 | 10925 |     469775 |      14.34 |
| pathological:html_attr_dense             |       32775 | 28405 |    1343775 |      41.00 |
| pathological:html_entity_dense           |       32766 |  5461 |     344043 |      10.50 |
| pathological:svelte_expression_dense     |       32769 | 43692 |    1758603 |      53.67 |
| pathological:md_emphasis_dense           |       32766 |     0 |      32766 |       1.00 |
| pathological:md_fence_dense              |       32760 | 12480 |     547560 |      16.71 |
| pathological:md_bracket_dense            |       32768 |     0 |      32768 |       1.00 |
| pathological:md_link_paren_dense         |       32768 |     0 |      32768 |       1.00 |
| pathological:svelte_attr_expr_dense      |       32775 | 32775 |    1420250 |      43.33 |
| pathological:svelte_tag_only_dense       |       32768 | 32768 |    1564672 |      47.75 |
| pathological:html_no_entity_dense        |       32768 | 32768 |    1564672 |      47.75 |
| pathological:md_tag_per_line             |       32775 | 28405 |    1383105 |      42.20 |
| pathological:md_link_paren_per_line      |       32766 |     0 |      32766 |       1.00 |
| pathological:css_deep_nesting            |       32754 | 20703 |     809580 |      24.72 |
| pathological:bash_deep_command_sub       |       32893 | 16256 |     687197 |      20.89 |
| pathological:ts_template_full_depth      |       32766 | 39319 |    2313244 |      70.60 |
| pathological:bash_cmdsub_full_depth      |       32767 | 32766 |    1408939 |      43.00 |
| pathological:bash_heredoc_sub_full_depth |       32761 | 10920 |     589681 |      18.00 |
| pathological:bash_heredoc_dense          |       32760 |  9555 |     499590 |      15.25 |
| pathological:md_deep_self_embed          |       32766 |   195 |      41216 |       1.26 |

<!-- node-bench:end -->

## Browser Benchmark Results

- html: 50.01ms avg, 40 ops/sec, 2.6% CV
- ranges: 7.25ms avg, 222 ops/sec, 7.2% CV (+590.2% vs baseline)

| Language | Implementation | Mean (ms) | Paint (ms) | Median (ms) | Std Dev | CV    | P75 (ms) | P90 (ms) | P95 (ms) | P99 (ms) | Ops/sec | Outliers | Failed | Stability |
| -------- | -------------- | --------- | ---------- | ----------- | ------- | ----- | -------- | -------- | -------- | -------- | ------- | -------- | ------ | --------- |
| ts       | html           | 91.23     | 108.45     | 93.80       | 6.66    | 7.3%  | 94.30    | 95.02    | 95.26    | 95.45    | 11      | 1/5      | 0      | 100%      |
| ts       | ranges         | 11.80     | 55.15      | 11.20       | 1.44    | 12.2% | 12.80    | 13.40    | 13.60    | 13.76    | 85      | 0/5      | 0      | 100%      |
| css      | html           | 10.52     | 32.62      | 10.50       | 0.26    | 2.5%  | 10.60    | 10.78    | 10.84    | 10.89    | 95      | 0/5      | 0      | 100%      |
| css      | ranges         | 2.58      | 32.42      | 2.60        | 0.11    | 4.2%  | 2.60     | 2.66     | 2.68     | 2.70     | 388     | 0/5      | 0      | 100%      |
| html     | html           | 28.24     | 32.22      | 28.50       | 0.58    | 2.0%  | 28.60    | 28.72    | 28.76    | 28.79    | 35      | 0/5      | 0      | 100%      |
| html     | ranges         | 3.96      | 32.54      | 3.90        | 0.42    | 10.5% | 4.10     | 4.40     | 4.50     | 4.58     | 253     | 0/5      | 0      | 100%      |
| json     | html           | 10.60     | 33.10      | 10.60       | 0.39    | 3.7%  | 10.70    | 11.00    | 11.10    | 11.18    | 94      | 0/5      | 0      | 100%      |
| json     | ranges         | 1.92      | 32.82      | 1.90        | 0.27    | 14.0% | 2.10     | 2.16     | 2.18     | 2.20     | 521     | 0/5      | 0      | 100%      |
| svelte   | html           | 91.38     | 107.83     | 92.00       | 1.06    | 1.2%  | 92.50    | 108.40   | 113.70   | 117.94   | 11      | 1/5      | 0      | 100%      |
| svelte   | ranges         | 12.52     | 78.36      | 12.80       | 0.88    | 7.0%  | 13.20    | 13.32    | 13.36    | 13.39    | 80      | 0/5      | 0      | 100%      |
| md       | html           | 69.38     | 74.98      | 69.50       | 0.70    | 1.0%  | 70.30    | 75.94    | 77.82    | 79.32    | 14      | 1/5      | 0      | 100%      |
| md       | ranges         | 9.78      | 32.20      | 9.70        | 0.20    | 2.1%  | 10.00    | 10.00    | 10.00    | 10.00    | 102     | 0/5      | 0      | 100%      |
| sh       | html           | 48.70     | 53.70      | 48.70       | 0.37    | 0.8%  | 48.90    | 49.08    | 49.14    | 49.19    | 21      | 0/5      | 0      | 100%      |
| sh       | ranges         | 8.16      | 32.54      | 8.20        | 0.05    | 0.7%  | 8.20     | 8.20     | 8.20     | 8.20     | 123     | 0/5      | 0      | 100%      |

Legend:

- Mean/Median/percentiles: work time — stylize + DOM commit + layout
- Paint (ms): paint-settle time after commit, tracked separately from work time
- CV: Coefficient of Variation (std_dev/mean) — lower is better, <15% is good
- P75/P90/P95/P99: percentiles — X% of measurements were faster than this
- Ops/sec: operations per second (throughput)
- Stability: percentage of iterations with stable system metrics
