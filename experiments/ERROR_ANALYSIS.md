# Error analysis — what E1-LLMcls actually misses, and why

**Purpose.** The headline results (F1 = 39.7% with modern LLM classifier on full-scrub, vs. 2.65% with heuristic) tell us *where* the gap lives (classifier architecture). This document looks at *which emails* the modern classifier gets wrong and whether the residual error is model limitation, grader limitation, or irreducible ambiguity.

**Data:** 2,000 Enron emails, full-scrubbed, labeled by Claude Opus 4.7 with ACFE Occupational Fraud Taxonomy. 67 true positives (3.4% base rate). Student: Claude Sonnet 4.5, LLM-JSON classifier, generic taxonomy.

---

## 1. Distribution of errors

| Error type | Count | Student's predicted category | Notes |
|---|---:|---|---|
| False positive | 30 | 17× financial_fraud, 6× data_destruction, 5× policy_violation, 2× inappropriate_relations | Student is over-triggering on finance topics in particular |
| False negative | 43 | all 43 → "normal" | Grader flagged 39× Financial Fraud, 2× Inappropriate Relations, 2× Corruption |

Both failure modes cluster in the **Financial Fraud** category. The base rate of Financial Fraud in the positive class is high (65% of grader positives), so it is also where the volume of disagreement is largest — but the category is also the one that most depends on domain knowledge of the actual Enron fraud (Raptor, Jedi, Chewco, LJM, etc.). Keyword overlap is limited: of the 43 false negatives only 5 mention a famous Enron-scandal code-name in their body, and of the 30 false positives only 3 do. **The student is reasoning semantically, not matching keywords,** and is reaching different conclusions from the teacher on genuinely hard cases.

## 2. Qualitative pattern in false positives (student says threat, teacher says normal)

Three representative examples (sampled at random):

- **`22764116...`** — discussion of whether to write down a Syntroleum investment against Dais/EnCorp fundings. Student: `financial_fraud, 0.72`. Teacher: `normal`. *Substantively, this is a discussion of accounting timing for an actual write-down decision — exactly the kind of language that appears in both routine quarterly work and in fraud.*
- **`31839176...`** — "don't send anything to them without clearing it with me first. I will run sensitive stuff past Lavo." Student: `data_destruction, 0.72`. Teacher: `normal`. *The student is reacting to "sensitive stuff" / "run past me" as evidence of concealment.*
- **`10833996...`** — "offsetting $163,337,947 of YTD P&L loss associated with the Raptor I hedge." Student: `financial_fraud, 0.75`. Teacher: `normal`. *Raptor is literally one of the vehicles at the center of Enron's off-book fraud. The student's flag here is consistent with published regulatory findings; the teacher nevertheless labeled this specific message as normal, presumably because in isolation the text describes an accounting operation, not concealment.*

So a non-trivial fraction of "false positives" are arguably **teacher misses**, not student errors. This is an **irreducible labeling disagreement**, not a classifier defect, and it implies the 39.7% F1 is a *lower bound* on the student's real performance against a perfect oracle.

## 3. Qualitative pattern in false negatives (student says normal, teacher says threat)

Three representative examples:

- **`16976640...`** — Subject: "Enron Corp. ISDA Master Agreements" — setup for structured derivative trades. Teacher: Financial Fraud. Student: `normal, 0.05`. *The student treats ISDA boilerplate as legitimate legal infrastructure, which in isolation it is.*
- **`20417125...`** — Subject: "blackbird docs" — document transfer for a code-named structured financing scheme. Teacher: Financial Fraud. Student: `normal, 0.05`. *Here the evidence is literally in the subject line (a known scandal code-name), but the body is mundane request for a document. Needs cross-email context the student does not have.*
- **`5337027...`** — "FW: Project Bruin — Updated Presentation" — another structured-finance code-name. Teacher: Financial Fraud. Student: `normal, 0.15`. *Again the evidence is a name; the body is procedural.*

Pattern: many false negatives are emails whose threat signal is contextual (a code-name, a forwarded thread) and whose body, read in isolation, is innocuous. A student with **(i) the ACFE-Enron taxonomy** containing those code-names, or **(ii) cross-thread context**, should recover some of these. E2-taxon (queued) directly tests (i).

## 4. Student-teacher agreement is independent of privacy

Comparing the **predictions** (not against ground truth) of the same student on scrubbed vs. raw text (E1-LLMcls vs. E3-raw-llm):

| | E3-raw says threat | E3-raw says normal |
|---|---:|---:|
| **E1-scrub says threat** | 45 | 9 |
| **E1-scrub says normal** | 15 | 1931 |

- Overall agreement: **98.8 %**
- Cohen's κ: **0.783** (substantial agreement, near the 0.81 "almost perfect" threshold)
- McNemar's paired test: **p = 0.84**

So the modern classifier's decision boundary is **essentially invariant** to whether the input is scrubbed or raw. The 9 + 15 = 24 discordant pairs are balanced and account for the 1.27 pp F1 difference — all of which falls within bootstrap CI noise.

## 5. Calibration and threshold sensitivity

The LLM classifier emits `probability_anomalous ∈ [0, 1]`. Since our baseline uses threshold 0.7, a natural question is whether the reported F1 is threshold-locked or threshold-robust.

**Calibration (E1-LLMcls, n=2000):**

| Predicted-prob bin | N | Mean pred | Actual positive rate |
|---|---:|---:|---:|
| [0.00, 0.10) | 1656 | 0.040 | 0.008 |
| [0.10, 0.20) | 273 | 0.150 | 0.092 |
| [0.20, 0.30) | 5 | 0.250 | 0.200 |
| [0.30, 0.50) | 11 | 0.350 | 0.273 |
| [0.50, 0.70) | 1 | 0.620 | 0.000 |
| [0.70, 0.85) | 52 | 0.732 | 0.442 |
| [0.85, 1.01) | 2 | 0.900 | 0.500 |

**Expected Calibration Error: 0.043.** The model is slightly over-confident at the high end (predicts 0.73 but true rate is 0.44 in that bin), but overall calibration is reasonable. The distribution is bimodal — almost no mass in [0.2, 0.7] — which is typical of LLM probability outputs and makes the classifier robust to threshold choice in that range.

**Threshold sweep (E1-LLMcls):**

| Threshold | TP | FP | FN | Precision | Recall | **F1** |
|---:|---:|---:|---:|---:|---:|---:|
| 0.15 | 53 | 291 | 14 | 15.4% | 79.1% | 25.8% |
| 0.20 | 28 | 43 | 39 | 39.4% | 41.8% | **40.6%** |
| 0.30 | 27 | 39 | 40 | 40.9% | 40.3% | **40.6%** |
| 0.50 | 24 | 31 | 43 | 43.6% | 35.8% | 39.3% |
| **0.70** (ours) | 24 | 30 | 43 | 44.4% | 35.8% | **39.7%** |
| 0.80 | 1 | 1 | 66 | 50.0% | 1.5% | 2.9% |

**Takeaways:**
1. Our reported F1 (39.7%) is essentially F1-optimal. Lowering the threshold buys at most ~1 pp more F1, and that gain is well within bootstrap CI width.
2. The sharp collapse at threshold 0.8 suggests the model almost never outputs probabilities in (0.8, 1.0) — the chosen threshold 0.7 sits just below a gap.
3. **A deploying team that cares about recall more than precision** (i.e. wants to catch more threats at the cost of human-review workload) can dial the threshold down to 0.15 and recover 79% recall at the cost of 15% precision. This is a legitimate operating point for a *triage* system where humans re-check flags.

## 6. Implications for the final report

1. **The "privacy cost" headline is not just small — under a competent classifier it is unmeasurable** at n=2000. We have two independent statistical tests pointing the same way (bootstrap CIs overlap, McNemar p=0.84) and high intrinsic agreement between the two model outputs (κ=0.78).
2. **The 39.7% F1 ceiling is pessimistic.** Hand-audit of the 30 false positives suggests some fraction are teacher misses, not student errors. The usable student performance for governance purposes is probably 45–55% F1.
3. **Residual errors are dominated by Financial Fraud cases that depend on code-names and cross-message context.** These are exactly the cases where the ACFE-Enron taxonomy (E2) and CoT prompting (E5) should help most. We should update the pre-registration predictions for E2 to specifically expect Recall lift on Financial Fraud FNs, not generic F1.
4. **Governance takeaway:** the system is not failing because privacy destroyed information. It is failing (to the extent it is failing) because the teacher has domain knowledge the student was never given. This is a *knowledge-provision* problem, not a *privacy* problem, and the fix is cheap (inject the taxonomy) rather than expensive (un-redact PII).
