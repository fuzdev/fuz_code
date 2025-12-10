# Benchmark Baseline Results

## Benchmark Results

| Sample               | Ops/sec  | Mean Time (ms) | Samples |
| -------------------- | -------- | -------------- | ------- |
| json_complex         | 28765.42 | 0.0348         | 95760   |
| css_complex          | 27819.60 | 0.0359         | 95893   |
| ts_complex           | 1765.08  | 0.5665         | 16594   |
| html_complex         | 8213.21  | 0.1218         | 66817   |
| svelte_complex       | 2078.65  | 0.4811         | 19675   |
| md_complex           | 2074.80  | 0.4820         | 14174   |
| large:json_complex   | 254.08   | 3.9358         | 2149    |
| large:css_complex    | 242.57   | 4.1225         | 1688    |
| large:ts_complex     | 7.34     | 136.2749       | 74      |
| large:html_complex   | 56.08    | 17.8315        | 460     |
| large:svelte_complex | 11.51    | 86.8893        | 116     |
| large:md_complex     | 7.59     | 131.8069       | 76      |

**Total samples benchmarked:** 12 **Average ops/sec:** 5941.33

**Total samples benchmarked:** 12 **Average ops/sec:** 5862.43

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
