# Benchmark Baseline Results

## Benchmark Results

| Sample | Ops/sec | Mean Time (ms) | Samples |
|--------|---------|----------------|---------|
| json_complex | 29102.94 | 0.0344 | 97284 |
| css_complex | 27087.28 | 0.0369 | 93104 |
| ts_complex | 1857.77 | 0.5383 | 13182 |
| html_complex | 7668.00 | 0.1304 | 72407 |
| svelte_complex | 2122.21 | 0.4712 | 18851 |
| md_complex | 1922.18 | 0.5202 | 18668 |
| large:json_complex | 255.52 | 3.9135 | 2098 |
| large:css_complex | 251.29 | 3.9794 | 2183 |
| large:ts_complex | 7.39 | 135.2742 | 75 |
| large:html_complex | 56.35 | 17.7476 | 501 |
| large:svelte_complex | 11.04 | 90.6188 | 111 |
| large:md_complex | 7.23 | 138.3028 | 73 |

**Total samples benchmarked:** 12
**Average ops/sec:** 5862.43

## Browser Benchmark Results

| Language | Implementation | Mean (ms) | Median (ms) | Std Dev | CV    | P95 (ms) | Ops/sec | Outliers | Failed | Stability |
| -------- | -------------- | --------- | ----------- | ------- | ----- | -------- | ------- | -------- | ------ | --------- |
| ts       | html           | 82.39     | 80.95       | 3.98    | 4.8%  | 87.60    | 12      | 0/10     | 0      | 100%      |
| ts       | ranges         | 38.74     | 38.60       | 3.02    | 7.8%  | 43.80    | 26      | 0/10     | 0      | 100%      |
| css      | html           | 840.65    | 840.20      | 9.26    | 1.1%  | 854.80   | 1       | 0/10     | 0      | 90%       |
| css      | ranges         | 14.01     | 14.30       | 0.78    | 5.6%  | 14.90    | 71      | 1/10     | 0      | 90%       |
| html     | html           | 62.01     | 64.90       | 9.28    | 15.0% | 71.30    | 16      | 0/10     | 0      | 100%      |
| html     | ranges         | 20.65     | 21.45       | 2.26    | 10.9% | 23.60    | 48      | 0/10     | 0      | 100%      |
| json     | html           | 402.64    | 401.80      | 3.07    | 0.8%  | 407.80   | 2       | 3/10     | 0      | 90%       |
| json     | ranges         | 13.29     | 13.40       | 0.74    | 5.6%  | 14.20    | 75      | 1/10     | 0      | 90%       |
| svelte   | html           | 175.48    | 166.10      | 21.47   | 12.2% | 218.10   | 6       | 0/10     | 0      | 100%      |
| svelte   | ranges         | 100.58    | 101.70      | 7.36    | 7.3%  | 113.70   | 10      | 1/10     | 0      | 100%      |
