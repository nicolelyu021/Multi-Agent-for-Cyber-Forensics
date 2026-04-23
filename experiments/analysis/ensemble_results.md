ensemble: 1887 paired message_ids across 5 runs
ground-truth positives in intersection: 62

## Individual run F1 (on intersection set)

Run                     F1 Precision   Recall   TP   FP   FN
E1-LLMcls           40.35%    44.23%   37.10%   23   29   39
E3-raw-llm          41.32%    42.37%   40.32%   25   34   37
E4-pseudo           39.67%    40.68%   38.71%   24   35   38
E2-taxon            46.55%    50.00%   43.55%   27   27   35
E6-best-scaled      42.37%    44.64%   40.32%   25   31   37

## Pairwise Cohen kappa (on predictions, not against GT)

                   E1-LLMcls      E3-raw-llm     E4-pseudo      E2-taxon       E6-best-scaled
E1-LLMcls          --             0.787          0.712          0.728          0.733         
E3-raw-llm         0.787          --             0.755          0.754          0.758         
E4-pseudo          0.712          0.755          --             0.644          0.632         
E2-taxon           0.728          0.754          0.644          --             0.944         
E6-best-scaled     0.733          0.758          0.632          0.944          --            

## Ensemble: majority vote (K of 5)

K-threshold         F1   CI_lo   CI_hi Precision   Recall   TP   FP   FN
K>=1             46.36%  36.24%  55.26%    39.33%   56.45%   35   54   27
K>=2             45.67%  35.29%  54.78%    44.62%   46.77%   29   36   33
K>=3             41.74%  30.51%  51.38%    45.28%   38.71%   24   29   38
K>=4             38.46%  25.58%  49.52%    47.62%   32.26%   20   22   42
K>=5             34.41%  21.33%  46.46%    51.61%   25.81%   16   15   46

## Ensemble: mean probability across 5 runs (threshold sweep)

threshold         F1   CI_lo   CI_hi Precision   Recall   TP   FP   FN
0.20          46.63%  36.11%  55.68%    37.62%   61.29%   38   63   24
0.30          45.93%  35.56%  54.69%    42.47%   50.00%   31   42   31
0.40          40.68%  29.75%  50.39%    42.86%   38.71%   24   32   38
0.50          37.50%  25.45%  47.46%    42.00%   33.87%   21   29   41
0.60          37.62%  24.39%  48.94%    48.72%   30.65%   19   20   43
0.70          33.68%  20.90%  45.54%    48.48%   25.81%   16   17   46
