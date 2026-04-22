# Comparison across 4 runs

## Per-run summary

| Run | F1 | CI (95%) | Precision | Recall | TP | FP | FN | TN |
|---|---|---|---|---|---|---|---|---|
| `E0-repro-2026-04-22T07-59-36Z` | 2.65% | 0.00–6.78% | 2.38% | 2.99% | 2 | 82 | 65 | 1851 |
| `E3-raw-heur-2026-04-22T07-59-59Z` | 2.94% | 0.00–7.50% | 2.90% | 2.99% | 2 | 67 | 65 | 1866 |
| `E1-LLMcls-2026-04-22T15-43-51Z` | 39.67% | 28.12–50.32% | 44.44% | 35.82% | 24 | 30 | 43 | 1903 |
| `E3-raw-llm-2026-04-22T16-04-26Z` | 40.94% | 28.83–50.75% | 43.33% | 38.81% | 26 | 34 | 41 | 1899 |

## Pairwise McNemar (two-sided exact)

Cell shows `odds_ratio (p-value, n_discordant)`. Null = two classifiers misclassify at equal rates.

| base \ comparison | `E0-repro-2026-04-22T07-59-36Z` | `E3-raw-heur-2026-04-22T07-59-59Z` | `E1-LLMcls-2026-04-22T15-43-51Z` | `E3-raw-llm-2026-04-22T16-04-26Z` |
|---|---|---|---|---|
| `E0-repro-2026-04-22T07-59-36Z` | — | OR=0.00 (p=0.0001, n_disc=15) | OR=0.28 (p=0.0000, n_disc=132) | OR=0.31 (p=0.0000, n_disc=136) |
| `E3-raw-heur-2026-04-22T07-59-59Z` | OR=inf (p=0.0001, n_disc=15) | — | OR=0.33 (p=0.0000, n_disc=117) | OR=0.36 (p=0.0000, n_disc=121) |
| `E1-LLMcls-2026-04-22T15-43-51Z` | OR=3.55 (p=0.0000, n_disc=132) | OR=3.03 (p=0.0000, n_disc=117) | — | OR=1.18 (p=0.8388, n_disc=24) |
| `E3-raw-llm-2026-04-22T16-04-26Z` | OR=3.25 (p=0.0000, n_disc=136) | OR=2.78 (p=0.0000, n_disc=121) | OR=0.85 (p=0.8388, n_disc=24) | — |

