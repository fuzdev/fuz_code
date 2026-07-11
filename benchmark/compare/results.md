# Syntax Highlighting Performance Comparison

Comparing fuz_code vs Prism vs Shiki across multiple languages and content sizes.

`tokenize` rows compare raw tokenizers with no HTML rendering — the
shape-neutral, apples-to-apples view. `stylize` rows compare the HTML each
library actually ships: fuz_code and Prism emit CSS-class spans
(`<span class="token_x">`) styled by a static stylesheet, while Shiki has no
native class output and inlines resolved theme colors on every span plus a
`<pre>` wrapper — so its `stylize` cost includes per-token color work the
class-based libraries offload to CSS.

## Results

### ts tokenize (small)

| Task Name                         | ops/sec   | p50 (ms) | p75 (ms) | p90 (ms) | p95 (ms) | p99 (ms) | min (ms) | max (ms) | vs Best  |
| --------------------------------- | --------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- |
| fuz_code_tokenize_ts_small        | 32,466.07 |     0.03 |     0.03 |     0.03 |     0.04 |     0.05 |     0.03 |     3.86 | baseline |
| prism_tokenize_ts_small           |  2,921.07 |     0.34 |     0.35 |     0.36 |     0.38 |     0.51 |     0.33 |     2.09 |   11.11x |
| shiki_js_tokenize_ts_small        |    123.47 |     8.06 |     8.27 |     8.70 |     9.01 |    10.25 |     7.67 |    12.25 |  262.94x |
| shiki_oniguruma_tokenize_ts_small |    168.09 |     5.92 |     6.18 |     6.67 |     7.32 |     8.57 |     5.55 |    13.10 |  193.14x |

### ts tokenize (large)

| Task Name                         | ops/sec | p50 (ms) | p75 (ms) | p90 (ms) | p95 (ms) | p99 (ms) | min (ms) | max (ms) | vs Best  |
| --------------------------------- | ------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- |
| fuz_code_tokenize_ts_large        |  290.93 |     3.44 |     3.49 |     3.66 |     3.79 |     4.83 |     3.26 |     7.03 | baseline |
| prism_tokenize_ts_large           |   19.70 |    50.75 |    52.40 |    58.21 |    59.73 |    60.64 |    48.51 |    62.28 |   14.77x |
| shiki_js_tokenize_ts_large        |    0.94 |  1059.10 |  1063.36 |  1065.29 |  1065.78 |  1066.18 |  1051.07 |  1066.27 |  307.95x |
| shiki_oniguruma_tokenize_ts_large |    1.69 |   592.71 |   594.61 |   601.29 |   603.11 |   604.31 |   582.09 |   604.61 |  172.62x |

### ts stylize (small)

| Task Name                        | ops/sec   | p50 (ms) | p75 (ms) | p90 (ms) | p95 (ms) | p99 (ms) | min (ms) | max (ms) | vs Best  |
| -------------------------------- | --------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- |
| fuz_code_stylize_ts_small        | 19,441.89 |     0.05 |     0.05 |     0.05 |     0.06 |     0.09 |     0.05 |     0.54 | baseline |
| prism_stylize_ts_small           |  1,762.95 |     0.57 |     0.58 |     0.60 |     0.63 |     0.91 |     0.54 |     1.44 |   11.03x |
| shiki_js_stylize_ts_small        |     75.83 |    13.20 |    13.57 |    14.71 |    15.43 |    16.05 |    12.09 |    17.68 |  256.40x |
| shiki_oniguruma_stylize_ts_small |    122.00 |     8.17 |     8.59 |     9.26 |    10.57 |    11.86 |     7.37 |    14.75 |  159.36x |

### ts stylize (large)

| Task Name                        | ops/sec | p50 (ms) | p75 (ms) | p90 (ms) | p95 (ms) | p99 (ms) | min (ms) | max (ms) | vs Best  |
| -------------------------------- | ------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- |
| fuz_code_stylize_ts_large        |  174.63 |     5.70 |     5.85 |     6.08 |     6.60 |     9.88 |     5.45 |    10.83 | baseline |
| prism_stylize_ts_large           |    9.42 |   112.30 |   119.85 |   124.74 |   126.66 |   136.80 |    83.51 |   141.61 |   18.54x |
| shiki_js_stylize_ts_large        |    0.81 |  1225.51 |  1238.92 |  1242.92 |  1244.87 |  1246.44 |  1214.31 |  1246.83 |  214.61x |
| shiki_oniguruma_stylize_ts_large |    1.25 |   798.18 |   818.45 |   855.70 |   879.02 |   897.62 |   741.31 |   902.27 |  139.34x |

### css tokenize (small)

| Task Name                          | ops/sec    | p50 (μs) | p75 (μs) | p90 (μs) | p95 (μs) | p99 (μs) | min (μs) | max (μs) | vs Best  |
| ---------------------------------- | ---------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- |
| fuz_code_tokenize_css_small        | 306,302.85 |     3.28 |     3.56 |     5.13 |     6.14 |     9.53 |     2.98 |  4396.76 | baseline |
| prism_tokenize_css_small           |  51,543.28 |    19.36 |    20.09 |    23.82 |    30.90 |    41.81 |    18.32 |   562.69 |    5.94x |
| shiki_js_tokenize_css_small        |   3,856.66 |   257.84 |   272.54 |   305.12 |   369.73 |   551.93 |   227.98 |  5243.98 |   79.42x |
| shiki_oniguruma_tokenize_css_small |   1,297.18 |   768.32 |   810.38 |   926.11 |  1063.95 |  1469.76 |   696.57 |  4792.35 |  236.13x |

### css tokenize (large)

| Task Name                          | ops/sec  | p50 (ms) | p75 (ms) | p90 (ms) | p95 (ms) | p99 (ms) | min (ms) | max (ms) | vs Best  |
| ---------------------------------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- |
| fuz_code_tokenize_css_large        | 3,248.46 |     0.31 |     0.31 |     0.32 |     0.34 |     0.54 |     0.29 |     3.28 | baseline |
| prism_tokenize_css_large           |   525.80 |     1.89 |     1.99 |     2.22 |     2.82 |     3.50 |     1.72 |     5.61 |    6.18x |
| shiki_js_tokenize_css_large        |    37.98 |    26.30 |    27.22 |    28.38 |    29.54 |    32.18 |    23.65 |    36.55 |   85.53x |
| shiki_oniguruma_tokenize_css_large |    12.80 |    77.77 |    79.26 |    81.36 |    81.83 |    85.84 |    75.05 |    89.18 |  253.77x |

### css stylize (small)

| Task Name                         | ops/sec    | p50 (μs) | p75 (μs) | p90 (μs) | p95 (μs) | p99 (μs) | min (μs) | max (μs) | vs Best  |
| --------------------------------- | ---------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- |
| fuz_code_stylize_css_small        | 163,634.94 |     6.09 |     6.36 |     7.15 |     9.07 |    14.05 |     5.45 |   400.93 | baseline |
| prism_stylize_css_small           |  21,083.33 |    47.51 |    48.40 |    50.92 |    61.85 |    91.72 |    43.35 |  3252.97 |    7.76x |
| shiki_js_stylize_css_small        |   1,891.12 |   526.62 |   562.66 |   661.94 |   753.08 |  3497.01 |   465.60 |  7216.99 |   86.53x |
| shiki_oniguruma_stylize_css_small |     996.59 |  1003.30 |  1038.25 |  1135.82 |  1401.73 |  4107.00 |   925.07 |  7005.72 |  164.19x |

### css stylize (large)

| Task Name                         | ops/sec  | p50 (ms) | p75 (ms) | p90 (ms) | p95 (ms) | p99 (ms) | min (ms) | max (ms) | vs Best  |
| --------------------------------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- |
| fuz_code_stylize_css_large        | 1,563.61 |     0.64 |     0.65 |     0.66 |     0.69 |     1.25 |     0.60 |     1.86 | baseline |
| prism_stylize_css_large           |   190.23 |     5.20 |     5.57 |     6.03 |     7.83 |     9.64 |     4.60 |    11.92 |    8.22x |
| shiki_js_stylize_css_large        |    17.08 |    58.54 |    60.59 |    63.74 |    67.18 |    69.51 |    51.75 |    73.02 |   91.54x |
| shiki_oniguruma_stylize_css_large |     9.20 |   108.30 |   110.64 |   114.65 |   116.91 |   119.58 |   101.16 |   120.22 |  169.92x |

### html tokenize (small)

| Task Name                           | ops/sec    | p50 (μs) | p75 (μs) | p90 (μs) | p95 (μs) | p99 (μs) | min (μs) | max (μs) | vs Best  |
| ----------------------------------- | ---------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- |
| fuz_code_tokenize_html_small        | 109,228.45 |     9.14 |     9.65 |    12.18 |    14.54 |    22.39 |     8.03 |  3783.31 | baseline |
| prism_tokenize_html_small           |  17,330.90 |    57.93 |    58.83 |    59.58 |    61.80 |    88.10 |    53.66 |   567.89 |    6.30x |
| shiki_js_tokenize_html_small        |   1,193.09 |   837.34 |   870.58 |   916.51 |  1026.24 |  1848.22 |   765.53 |  4752.86 |   91.55x |
| shiki_oniguruma_tokenize_html_small |   1,150.60 |   864.19 |   897.42 |   947.73 |  1018.70 |  1840.75 |   814.92 |  3136.35 |   94.93x |

### html tokenize (large)

| Task Name                           | ops/sec  | p50 (ms) | p75 (ms) | p90 (ms) | p95 (ms) | p99 (ms) | min (ms) | max (ms) | vs Best  |
| ----------------------------------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- |
| fuz_code_tokenize_html_large        | 1,219.01 |     0.82 |     0.84 |     0.86 |     0.92 |     1.89 |     0.77 |     4.69 | baseline |
| prism_tokenize_html_large           |   167.84 |     5.90 |     6.38 |     7.69 |     9.03 |    10.38 |     5.63 |    12.25 |    7.26x |
| shiki_js_tokenize_html_large        |    12.11 |    82.24 |    83.65 |    86.93 |    87.79 |    89.53 |    78.54 |    92.32 |  100.67x |
| shiki_oniguruma_tokenize_html_large |    10.65 |    89.80 |   122.17 |   136.51 |   151.98 |   158.48 |    83.59 |   183.76 |  114.42x |

### html stylize (small)

| Task Name                          | ops/sec   | p50 (ms) | p75 (ms) | p90 (ms) | p95 (ms) | p99 (ms) | min (ms) | max (ms) | vs Best  |
| ---------------------------------- | --------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- |
| fuz_code_stylize_html_small        | 63,517.77 |     0.02 |     0.02 |     0.02 |     0.02 |     0.03 |     0.01 |     0.87 | baseline |
| prism_stylize_html_small           |  8,030.70 |     0.13 |     0.13 |     0.13 |     0.14 |     0.21 |     0.12 |     2.90 |    7.91x |
| shiki_js_stylize_html_small        |    852.32 |     1.17 |     1.21 |     1.29 |     1.42 |     2.99 |     1.11 |     5.26 |   74.52x |
| shiki_oniguruma_stylize_html_small |    826.15 |     1.20 |     1.25 |     1.35 |     1.46 |     3.53 |     1.14 |     5.83 |   76.88x |

### html stylize (large)

| Task Name                          | ops/sec | p50 (ms) | p75 (ms) | p90 (ms) | p95 (ms) | p99 (ms) | min (ms) | max (ms) | vs Best  |
| ---------------------------------- | ------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- |
| fuz_code_stylize_html_large        |  640.42 |     1.57 |     1.60 |     1.66 |     2.19 |     2.54 |     1.47 |     4.91 | baseline |
| prism_stylize_html_large           |   57.59 |    17.30 |    18.69 |    21.48 |    27.99 |    32.02 |    15.17 |    38.23 |   11.12x |
| shiki_js_stylize_html_large        |    7.97 |   125.11 |   128.80 |   132.79 |   133.86 |   138.73 |   116.45 |   141.55 |   80.31x |
| shiki_oniguruma_stylize_html_large |    7.96 |   125.78 |   128.28 |   134.29 |   140.28 |   150.75 |   120.94 |   158.57 |   80.43x |

### json tokenize (small)

| Task Name                           | ops/sec    | p50 (μs) | p75 (μs) | p90 (μs) | p95 (μs) | p99 (μs) | min (μs) | max (μs) | vs Best  |
| ----------------------------------- | ---------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- |
| fuz_code_tokenize_json_small        | 487,937.86 |     2.00 |     2.48 |     2.85 |     3.65 |     5.17 |     1.74 |  3578.19 | baseline |
| prism_tokenize_json_small           |  66,838.82 |    14.93 |    15.30 |    15.93 |    16.85 |    22.53 |    13.90 |   406.38 |    7.30x |
| shiki_js_tokenize_json_small        |   5,961.86 |   167.31 |   171.58 |   178.21 |   186.98 |   288.62 |   158.69 |  4755.00 |   81.84x |
| shiki_oniguruma_tokenize_json_small |   5,244.91 |   191.19 |   195.14 |   209.88 |   234.05 |   365.63 |   176.74 |  5591.47 |   93.03x |

### json tokenize (large)

| Task Name                           | ops/sec  | p50 (ms) | p75 (ms) | p90 (ms) | p95 (ms) | p99 (ms) | min (ms) | max (ms) | vs Best  |
| ----------------------------------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- |
| fuz_code_tokenize_json_large        | 5,585.66 |     0.18 |     0.18 |     0.18 |     0.20 |     0.35 |     0.17 |     6.94 | baseline |
| prism_tokenize_json_large           |   651.45 |     1.53 |     1.60 |     1.85 |     2.20 |     2.75 |     1.44 |     6.21 |    8.57x |
| shiki_js_tokenize_json_large        |    37.79 |    25.79 |    30.48 |    36.83 |    42.19 |    60.50 |    17.70 |    91.11 |  147.80x |
| shiki_oniguruma_tokenize_json_large |    44.26 |    21.80 |    25.85 |    30.99 |    34.94 |    40.08 |    19.01 |    46.37 |  126.21x |

### json stylize (small)

| Task Name                          | ops/sec    | p50 (μs) | p75 (μs) | p90 (μs) | p95 (μs) | p99 (μs) | min (μs) | max (μs) | vs Best  |
| ---------------------------------- | ---------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- |
| fuz_code_stylize_json_small        | 230,589.21 |     4.34 |     4.51 |     5.46 |     7.06 |     8.60 |     3.89 |   903.46 | baseline |
| prism_stylize_json_small           |  23,604.76 |    42.35 |    43.42 |    44.63 |    46.62 |    70.38 |    39.71 |   572.63 |    9.77x |
| shiki_js_stylize_json_small        |   2,546.67 |   391.11 |   405.00 |   429.26 |   477.65 |  2923.93 |   368.25 |  6914.97 |   90.55x |
| shiki_oniguruma_stylize_json_small |   2,439.59 |   407.91 |   423.31 |   451.42 |   497.07 |   962.54 |   384.99 |  5192.08 |   94.52x |

### json stylize (large)

| Task Name                          | ops/sec  | p50 (ms) | p75 (ms) | p90 (ms) | p95 (ms) | p99 (ms) | min (ms) | max (ms) | vs Best  |
| ---------------------------------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- |
| fuz_code_stylize_json_large        | 2,047.03 |     0.49 |     0.55 |     0.93 |     1.03 |     1.09 |     0.44 |     4.18 | baseline |
| prism_stylize_json_large           |   119.31 |     8.00 |     9.84 |    12.12 |    13.23 |    15.77 |     4.57 |    20.07 |   17.16x |
| shiki_js_stylize_json_large        |    21.35 |    46.31 |    48.91 |    51.50 |    53.22 |    57.96 |    41.99 |    59.51 |   95.89x |
| shiki_oniguruma_stylize_json_large |    20.27 |    49.54 |    50.67 |    52.00 |    53.47 |    58.27 |    44.68 |    58.73 |  100.97x |

### svelte tokenize (small)

| Task Name                             | ops/sec   | p50 (ms) | p75 (ms) | p90 (ms) | p95 (ms) | p99 (ms) | min (ms) | max (ms) | vs Best  |
| ------------------------------------- | --------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- |
| fuz_code_tokenize_svelte_small        | 27,383.82 |     0.04 |     0.04 |     0.04 |     0.04 |     0.05 |     0.03 |     0.42 | baseline |
| prism_tokenize_svelte_small           |  2,748.87 |     0.37 |     0.37 |     0.39 |     0.41 |     0.63 |     0.34 |     1.20 |    9.96x |
| shiki_js_tokenize_svelte_small        |    113.60 |     8.73 |     9.07 |     9.39 |     9.64 |    10.13 |     8.20 |    14.78 |  241.04x |
| shiki_oniguruma_tokenize_svelte_small |     98.19 |    10.19 |    10.59 |    11.10 |    11.44 |    12.19 |     8.41 |    14.27 |  278.88x |

### svelte tokenize (large)

| Task Name                             | ops/sec | p50 (ms) | p75 (ms) | p90 (ms) | p95 (ms) | p99 (ms) | min (ms) | max (ms) | vs Best  |
| ------------------------------------- | ------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- |
| fuz_code_tokenize_svelte_large        |  246.86 |     4.04 |     4.15 |     4.36 |     4.61 |     6.08 |     3.82 |     9.71 | baseline |
| prism_tokenize_svelte_large           |   27.17 |    36.00 |    39.75 |    42.47 |    43.38 |    46.62 |    30.93 |    52.31 |    9.09x |
| shiki_js_tokenize_svelte_large        |    1.14 |   873.91 |   912.67 |   934.80 |   970.08 |  1003.06 |   854.82 |  1011.31 |  216.60x |
| shiki_oniguruma_tokenize_svelte_large |    1.08 |   920.54 |   934.92 |   958.07 |   967.11 |   974.34 |   885.00 |   976.15 |  228.22x |

### svelte stylize (small)

| Task Name                            | ops/sec   | p50 (ms) | p75 (ms) | p90 (ms) | p95 (ms) | p99 (ms) | min (ms) | max (ms) | vs Best  |
| ------------------------------------ | --------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- |
| fuz_code_stylize_svelte_small        | 17,591.42 |     0.06 |     0.06 |     0.06 |     0.06 |     0.09 |     0.05 |     0.49 | baseline |
| prism_stylize_svelte_small           |  1,712.97 |     0.58 |     0.60 |     0.63 |     0.67 |     0.95 |     0.55 |     1.55 |   10.27x |
| shiki_js_stylize_svelte_small        |     99.67 |     9.89 |    10.43 |    10.88 |    11.09 |    11.64 |     9.35 |    17.97 |  176.50x |
| shiki_oniguruma_stylize_svelte_small |     90.95 |    10.89 |    11.50 |    12.12 |    12.49 |    13.56 |     9.68 |    17.16 |  193.42x |

### svelte stylize (large)

| Task Name                            | ops/sec | p50 (s) | p75 (s) | p90 (s) | p95 (s) | p99 (s) | min (s) | max (s) | vs Best  |
| ------------------------------------ | ------- | ------- | ------- | ------- | ------- | ------- | ------- | ------- | -------- |
| fuz_code_stylize_svelte_large        |  156.96 |    0.01 |    0.01 |    0.01 |    0.01 |    0.01 |    0.01 |    0.01 | baseline |
| prism_stylize_svelte_large           |   11.03 |    0.10 |    0.10 |    0.11 |    0.11 |    0.12 |    0.06 |    0.12 |   14.23x |
| shiki_js_stylize_svelte_large        |    0.40 |    2.49 |    2.65 |    2.81 |    2.86 |    2.90 |    2.19 |    2.91 |  395.70x |
| shiki_oniguruma_stylize_svelte_large |    0.95 |    1.06 |    1.06 |    1.07 |    1.07 |    1.07 |    1.04 |    1.07 |  165.19x |
