# Syntax Highlighting Performance Comparison

Comparing fuz_code vs Prism vs Shiki across multiple languages and content sizes.

## Results

### ts tokenize (small)

| Task Name                  | ops/sec  | p50 (μs) | p75 (μs) | p90 (μs) | p95 (μs) | p99 (μs) | min (μs) | max (μs) | vs Best  |
| -------------------------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- |
| fuz_code_tokenize_ts_small | 1,800.91 |   422.27 |   785.68 |   808.71 |   824.34 |   856.34 |   379.51 |   880.66 |    1.60x |
| prism_tokenize_ts_small    | 2,876.79 |   346.81 |   350.92 |   357.42 |   362.12 |   370.37 |   336.36 |   374.03 | baseline |
### ts tokenize (large)

| Task Name                  | ops/sec | p50 (ms) | p75 (ms) | p90 (ms) | p95 (ms) | p99 (ms) | min (ms) | max (ms) | vs Best  |
| -------------------------- | ------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- |
| fuz_code_tokenize_ts_large |   11.39 |    87.15 |    88.17 |    89.02 |    93.38 |    93.66 |    86.07 |    93.78 |    1.76x |
| prism_tokenize_ts_large    |   20.00 |    49.87 |    50.82 |    51.72 |    52.29 |    53.56 |    48.14 |    54.53 | baseline |
### ts stylize (small)

| Task Name                        | ops/sec  | p50 (ms) | p75 (ms) | p90 (ms) | p95 (ms) | p99 (ms) | min (ms) | max (ms) | vs Best  |
| -------------------------------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- |
| fuz_code_stylize_ts_small        | 1,760.58 |     0.57 |     0.57 |     0.58 |     0.59 |     0.61 |     0.55 |     0.61 | baseline |
| prism_stylize_ts_small           | 1,757.10 |     0.57 |     0.58 |     0.59 |     0.60 |     0.61 |     0.55 |     0.62 |    1.00x |
| shiki_js_stylize_ts_small        |   106.61 |     9.35 |     9.50 |     9.65 |     9.74 |     9.90 |     9.02 |    10.15 |   16.51x |
| shiki_oniguruma_stylize_ts_small |   139.30 |     7.10 |     7.33 |     7.53 |     7.74 |     8.04 |     6.83 |     8.14 |   12.64x |
### ts stylize (large)

| Task Name                        | ops/sec | p50 (ms) | p75 (ms) | p90 (ms) | p95 (ms) | p99 (ms) | min (ms) | max (ms) | vs Best  |
| -------------------------------- | ------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- |
| fuz_code_stylize_ts_large        |    7.39 |   122.29 |   153.39 |   155.09 |   156.25 |   159.12 |   112.96 |   159.32 |    1.39x |
| prism_stylize_ts_large           |   10.30 |   101.82 |   107.15 |   113.31 |   120.89 |   122.71 |    81.86 |   123.42 | baseline |
| shiki_js_stylize_ts_large        |    0.77 |  1295.46 |  1310.87 |  1311.54 |  1311.59 |  1311.64 |  1278.61 |  1311.65 |   13.37x |
| shiki_oniguruma_stylize_ts_large |    1.29 |   775.47 |   786.70 |   789.07 |   792.63 |   796.28 |   751.15 |   797.20 |    7.96x |
### css tokenize (small)

| Task Name                   | ops/sec   | p50 (μs) | p75 (μs) | p90 (μs) | p95 (μs) | p99 (μs) | min (μs) | max (μs) | vs Best  |
| --------------------------- | --------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- |
| fuz_code_tokenize_css_small | 57,067.36 |    17.49 |    17.76 |    18.25 |    18.63 |    19.13 |    16.39 |    19.45 | baseline |
| prism_tokenize_css_small    | 54,564.70 |    18.27 |    18.59 |    19.09 |    19.47 |    20.01 |    17.18 |    20.34 |    1.05x |
### css tokenize (large)

| Task Name                   | ops/sec | p50 (ms) | p75 (ms) | p90 (ms) | p95 (ms) | p99 (ms) | min (ms) | max (ms) | vs Best  |
| --------------------------- | ------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- |
| fuz_code_tokenize_css_large |  577.24 |     1.71 |     1.78 |     1.88 |     1.94 |     2.00 |     1.60 |     2.02 | baseline |
| prism_tokenize_css_large    |  570.23 |     1.73 |     1.79 |     1.87 |     1.92 |     1.98 |     1.63 |     2.00 |    1.01x |
### css stylize (small)

| Task Name                         | ops/sec   | p50 (μs) | p75 (μs) | p90 (μs) | p95 (μs) | p99 (μs) | min (μs) | max (μs) | vs Best  |
| --------------------------------- | --------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- |
| fuz_code_stylize_css_small        | 25,753.39 |    38.77 |    39.40 |    40.13 |    40.55 |    42.00 |    36.22 |    42.78 | baseline |
| prism_stylize_css_small           | 21,603.52 |    46.18 |    47.04 |    47.76 |    48.43 |    50.15 |    43.27 |    50.80 |    1.19x |
| shiki_js_stylize_css_small        |  1,967.37 |   502.83 |   520.16 |   545.22 |   561.10 |   584.30 |   462.31 |   593.79 |   13.09x |
| shiki_oniguruma_stylize_css_small |    904.88 |  1108.22 |  1153.73 |  1204.62 |  1255.66 |  1353.74 |   963.55 |  1426.17 |   28.46x |
### css stylize (large)

| Task Name                         | ops/sec | p50 (ms) | p75 (ms) | p90 (ms) | p95 (ms) | p99 (ms) | min (ms) | max (ms) | vs Best  |
| --------------------------------- | ------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- |
| fuz_code_stylize_css_large        |  254.05 |     3.89 |     3.98 |     4.18 |     4.26 |     4.32 |     3.73 |     4.35 | baseline |
| prism_stylize_css_large           |  215.62 |     4.60 |     4.68 |     4.85 |     4.93 |     5.01 |     4.44 |     5.03 |    1.18x |
| shiki_js_stylize_css_large        |   19.07 |    52.26 |    52.86 |    53.74 |    55.09 |    55.59 |    50.63 |    55.93 |   13.32x |
| shiki_oniguruma_stylize_css_large |    8.70 |   114.91 |   115.63 |   116.48 |   116.78 |   117.41 |   111.79 |   118.20 |   29.21x |
### html tokenize (small)

| Task Name                    | ops/sec   | p50 (μs) | p75 (μs) | p90 (μs) | p95 (μs) | p99 (μs) | min (μs) | max (μs) | vs Best  |
| ---------------------------- | --------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- |
| fuz_code_tokenize_html_small | 14,695.38 |    67.86 |    68.81 |    69.79 |    70.27 |    72.15 |    64.72 |    72.93 |    1.25x |
| prism_tokenize_html_small    | 18,301.56 |    54.64 |    55.38 |    56.00 |    56.64 |    58.60 |    51.18 |    59.26 | baseline |
### html tokenize (large)

| Task Name                    | ops/sec | p50 (ms) | p75 (ms) | p90 (ms) | p95 (ms) | p99 (ms) | min (ms) | max (ms) | vs Best  |
| ---------------------------- | ------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- |
| fuz_code_tokenize_html_large |  119.02 |     8.31 |     8.58 |     9.02 |     9.28 |     9.69 |     7.84 |     9.82 |    1.44x |
| prism_tokenize_html_large    |  170.96 |     5.71 |     5.97 |     6.40 |     6.56 |     6.62 |     5.51 |     6.64 | baseline |
### html stylize (small)

| Task Name                          | ops/sec  | p50 (ms) | p75 (ms) | p90 (ms) | p95 (ms) | p99 (ms) | min (ms) | max (ms) | vs Best  |
| ---------------------------------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- |
| fuz_code_stylize_html_small        | 7,505.98 |     0.13 |     0.14 |     0.14 |     0.14 |     0.15 |     0.12 |     0.15 |    1.07x |
| prism_stylize_html_small           | 8,011.02 |     0.12 |     0.13 |     0.13 |     0.13 |     0.13 |     0.12 |     0.13 | baseline |
| shiki_js_stylize_html_small        |   868.67 |     1.14 |     1.17 |     1.22 |     1.24 |     1.28 |     1.09 |     1.29 |    9.22x |
| shiki_oniguruma_stylize_html_small |   819.75 |     1.21 |     1.25 |     1.31 |     1.35 |     1.40 |     1.13 |     1.42 |    9.77x |
### html stylize (large)

| Task Name                          | ops/sec | p50 (ms) | p75 (ms) | p90 (ms) | p95 (ms) | p99 (ms) | min (ms) | max (ms) | vs Best  |
| ---------------------------------- | ------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- |
| fuz_code_stylize_html_large        |   52.77 |    18.69 |    19.63 |    20.93 |    21.78 |    22.66 |    17.15 |    22.92 |    1.08x |
| prism_stylize_html_large           |   57.13 |    17.36 |    18.48 |    19.50 |    20.07 |    21.65 |    15.05 |    22.61 | baseline |
| shiki_js_stylize_html_large        |    8.07 |   123.75 |   125.68 |   128.04 |   129.15 |   132.25 |   117.52 |   132.52 |    7.08x |
| shiki_oniguruma_stylize_html_large |    7.56 |   131.65 |   134.84 |   137.91 |   139.19 |   144.76 |   124.59 |   146.06 |    7.56x |
### json tokenize (small)

| Task Name                    | ops/sec   | p50 (μs) | p75 (μs) | p90 (μs) | p95 (μs) | p99 (μs) | min (μs) | max (μs) | vs Best  |
| ---------------------------- | --------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- |
| fuz_code_tokenize_json_small | 62,236.30 |    15.97 |    16.27 |    16.73 |    16.98 |    17.28 |    14.62 |    17.40 |    1.06x |
| prism_tokenize_json_small    | 65,992.13 |    15.05 |    15.34 |    15.83 |    16.11 |    16.41 |    13.72 |    16.51 | baseline |
### json tokenize (large)

| Task Name                    | ops/sec | p50 (ms) | p75 (ms) | p90 (ms) | p95 (ms) | p99 (ms) | min (ms) | max (ms) | vs Best  |
| ---------------------------- | ------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- |
| fuz_code_tokenize_json_large |  584.89 |     1.69 |     1.74 |     1.83 |     1.89 |     1.94 |     1.54 |     1.96 |    1.12x |
| prism_tokenize_json_large    |  653.66 |     1.51 |     1.55 |     1.64 |     1.68 |     1.73 |     1.41 |     1.74 | baseline |
### json stylize (small)

| Task Name                          | ops/sec   | p50 (μs) | p75 (μs) | p90 (μs) | p95 (μs) | p99 (μs) | min (μs) | max (μs) | vs Best  |
| ---------------------------------- | --------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- |
| fuz_code_stylize_json_small        | 25,427.38 |    39.19 |    39.83 |    40.34 |    40.69 |    41.67 |    36.32 |    42.23 | baseline |
| prism_stylize_json_small           | 22,397.68 |    44.63 |    45.37 |    46.11 |    46.95 |    48.47 |    40.66 |    48.97 |    1.14x |
| shiki_js_stylize_json_small        |  2,415.36 |   404.54 |   427.11 |   459.26 |   478.50 |   499.56 |   372.65 |   504.77 |   10.53x |
| shiki_oniguruma_stylize_json_small |  2,336.40 |   423.00 |   437.55 |   460.71 |   475.04 |   492.08 |   386.43 |   497.01 |   10.88x |
### json stylize (large)

| Task Name                          | ops/sec | p50 (ms) | p75 (ms) | p90 (ms) | p95 (ms) | p99 (ms) | min (ms) | max (ms) | vs Best  |
| ---------------------------------- | ------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- |
| fuz_code_stylize_json_large        |  241.16 |     4.09 |     4.25 |     4.48 |     4.64 |     4.86 |     3.73 |     4.93 | baseline |
| prism_stylize_json_large           |  197.89 |     4.91 |     5.31 |     5.82 |     6.11 |     6.41 |     4.38 |     6.57 |    1.22x |
| shiki_js_stylize_json_large        |   21.05 |    47.21 |    48.41 |    49.80 |    50.67 |    51.91 |    44.06 |    52.64 |   11.46x |
| shiki_oniguruma_stylize_json_large |   20.32 |    49.32 |    50.23 |    51.34 |    52.11 |    54.72 |    43.71 |    54.87 |   11.87x |
### svelte tokenize (small)

| Task Name                      | ops/sec  | p50 (μs) | p75 (μs) | p90 (μs) | p95 (μs) | p99 (μs) | min (μs) | max (μs) | vs Best  |
| ------------------------------ | -------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- |
| fuz_code_tokenize_svelte_small | 3,016.75 |   329.90 |   336.78 |   347.46 |   353.03 |   360.04 |   299.81 |   362.25 | baseline |
| prism_tokenize_svelte_small    | 2,829.52 |   350.85 |   359.48 |   370.41 |   377.07 |   386.25 |   320.35 |   389.56 |    1.07x |
### svelte tokenize (large)

| Task Name                      | ops/sec | p50 (ms) | p75 (ms) | p90 (ms) | p95 (ms) | p99 (ms) | min (ms) | max (ms) | vs Best  |
| ------------------------------ | ------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- |
| fuz_code_tokenize_svelte_large |   24.98 |    38.32 |    41.83 |    47.66 |    48.54 |    48.84 |    34.78 |    48.95 |    1.09x |
| prism_tokenize_svelte_large    |   27.28 |    36.31 |    39.72 |    42.41 |    43.90 |    45.67 |    30.60 |    50.20 | baseline |
### svelte stylize (small)

| Task Name                            | ops/sec  | p50 (ms) | p75 (ms) | p90 (ms) | p95 (ms) | p99 (ms) | min (ms) | max (ms) | vs Best  |
| ------------------------------------ | -------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- |
| fuz_code_stylize_svelte_small        | 1,860.47 |     0.53 |     0.55 |     0.57 |     0.58 |     0.60 |     0.49 |     0.61 | baseline |
| prism_stylize_svelte_small           | 1,691.30 |     0.59 |     0.60 |     0.63 |     0.64 |     0.66 |     0.54 |     0.67 |    1.10x |
| shiki_js_stylize_svelte_small        |    95.79 |    10.31 |    10.87 |    11.41 |    11.71 |    12.22 |     9.28 |    12.54 |   19.42x |
| shiki_oniguruma_stylize_svelte_small |    88.07 |    11.27 |    11.74 |    12.29 |    12.58 |    12.94 |     9.87 |    13.46 |   21.12x |
### svelte stylize (large)

| Task Name                            | ops/sec | p50 (s) | p75 (s) | p90 (s) | p95 (s) | p99 (s) | min (s) | max (s) | vs Best  |
| ------------------------------------ | ------- | ------- | ------- | ------- | ------- | ------- | ------- | ------- | -------- |
| fuz_code_stylize_svelte_large        |    9.81 |    0.10 |    0.12 |    0.13 |    0.13 |    0.14 |    0.06 |    0.14 |    1.06x |
| prism_stylize_svelte_large           |   10.39 |    0.10 |    0.11 |    0.11 |    0.12 |    0.12 |    0.07 |    0.14 | baseline |
| shiki_js_stylize_svelte_large        |    0.94 |    1.05 |    1.07 |    1.08 |    1.08 |    1.08 |    1.04 |    1.08 |   11.00x |
| shiki_oniguruma_stylize_svelte_large |    0.87 |    1.16 |    1.17 |    1.17 |    1.17 |    1.17 |    1.13 |    1.17 |   12.01x |
