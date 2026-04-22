# Pre-registration — Multi-Agent Forensic System Ablation Study

**Frozen as of:** 2026-04-22 (pre-run)
**Branch:** `experiment`
**Rule:** This file must not be edited after the first experimental run completes. Any change after that point must be logged as a deviation in `EXPERIMENT_JOURNAL.md` §11 (Decisions log), with justification.

The point of pre-registration is to prevent post-hoc rationalization: we write down the hypotheses and the exact test conditions *before* seeing the numbers, so that "we found what we expected" is a meaningful statement rather than hindsight.

---

## 1. Research question

**RQ (re-framed):** In a multi-agent insider-threat detection system, what portion of the published F1 collapse (2.65% on the de-identified Enron benchmark) is attributable to each of the following decomposable factors, evaluated at a single-email evaluation granularity?

- **Factor F1 (privacy policy):** the de-identification scheme applied to the email body
- **Factor F2 (classifier architecture):** whether the Sentiment Agent's binary decision comes from a hand-rolled heuristic or from a structured LLM output
- **Factor F3 (taxonomy asymmetry):** whether the Student agent has access to the same expert taxonomy the Grader used
- **Factor F4 (model tier):** Sonnet vs. Opus for the Student

Each factor corresponds to a different class of regulatory lever (F1 = data minimization, F2 = model oversight and accountability, F3 = prompt governance, F4 = cost/capability tradeoff). Therefore the decomposition itself is the AI-governance contribution.

---

## 2. Hypotheses

### H1 — The published F1 collapse is dominated by classifier architecture, not by de-identification.

**Operationalization:** Holding taxonomy and model fixed, measure ΔF1 between `(de-ID=full_scrub, classifier=heuristic)` and `(de-ID=none, classifier=heuristic)` — call this ΔF1(privacy-only). Measure ΔF1 between `(de-ID=full_scrub, classifier=heuristic)` and `(de-ID=full_scrub, classifier=llm_json)` — call this ΔF1(classifier-only).

**Prediction (pre-registered):** `ΔF1(classifier-only) > ΔF1(privacy-only)` by at least a factor of 3.

**Rationale:** 30-minute probe showed that de-ID removes ~1% of keyword signal, and only 50% of true threats contain any keyword at all even on raw text. The classifier has a ~50% structural recall ceiling regardless of privacy.

**If falsified:** we revert to the published framing ("privacy-utility tradeoff is the dominant story") and the report retains its current §5/§6 framing.

### H2 — Under a modern LLM-based classifier, residual privacy cost is real but sub-dominant.

**Operationalization:** ΔF1 between `(de-ID=none, classifier=llm_json)` and `(de-ID=full_scrub, classifier=llm_json)`.

**Prediction:** non-zero and positive, but < 10 F1 percentage points.

**If confirmed:** the report's governance contribution is re-centered on "classifier accountability" with privacy as a secondary finding.

### H3 — Pseudonym-preserving de-identification (VP_Finance_1) is closer to raw performance than full-scrub, when combined with LLM classifier.

**Operationalization:** `F1(pseudonym, llm_json) > F1(full_scrub, llm_json)` by at least 3 F1 percentage points.

**Rationale:** Pseudonym preserves role/department tokens that carry threat-relevance (e.g., "VP_Finance" + "off-balance-sheet" is more suspicious than "[PERSON]" + "off-balance-sheet"), and preserves network topology for any downstream relational reasoning.

**If confirmed:** this maps directly to an actionable policy recommendation — "data minimization" can be formalized as *semantic-preserving pseudonymization* without capability collapse.

### H4 — Taxonomy asymmetry contributes measurable but modest F1.

**Operationalization:** `F1(de-ID=full_scrub, classifier=llm_json, taxonomy=acfe_enron) > F1(de-ID=full_scrub, classifier=llm_json, taxonomy=generic)` by at least 5 F1 percentage points.

**Rationale:** Grader used ACFE+Enron-specific taxonomy on raw text; Student used generic corporate policy. Equalizing the taxonomy should reduce the prompt-asymmetry component.

### H5 — Chain-of-thought (CoT) structured output improves F1 beyond plain JSON output.

**Operationalization:** `F1(..., classifier=llm_json_cot) > F1(..., classifier=llm_json)` by at least 2 F1 percentage points.

**Rationale:** Direct follow-up to Prof. Sadeh's post-presentation feedback #1. Also standard finding from the CoT literature (Wei et al. 2022, Kojima et al. 2022) though Anthropic-specific effect sizes are less studied.

---

## 3. Statistical analysis plan

### 3.1 Primary analysis

For each pairwise hypothesis above:

- **Effect size:** point estimate of ΔF1 between the two conditions.
- **Uncertainty:** bootstrap 95% CI on ΔF1 with 1,000 paired resamples. Pairing is by `message_id` — the same email appears in both conditions.
- **Null-hypothesis test:** McNemar's exact test on the 2×2 contingency table of paired predictions. Report p-value and odds ratio.
- **Agreement with Grader:** Cohen's κ per condition.

### 3.2 Multiple-comparisons correction

Five pre-registered hypotheses × one primary test each = 5 tests. Apply **Bonferroni** correction: reject at α = 0.01 (0.05 / 5). Any post-hoc tests will be reported as exploratory and not counted toward the confirmatory findings.

### 3.3 Power consideration

With n = 2,000 emails at 3.4% prevalence (67 positives), McNemar's test has ~80% power to detect an odds ratio of ~1.5 at α = 0.01. For the E6 confirmatory scaled run (n = 10,000), power rises to ~95% for odds ratio 1.3.

F1 bootstrap CI width at n = 2,000 with ~80 flagged predictions is approximately ±2 percentage points; at n = 10,000 it is approximately ±0.9 percentage points. Effect sizes in our hypotheses (≥3 pp) are detectable at n = 2,000.

### 3.4 Subgroup / sensitivity analyses (declared ahead of time)

- **Per-category recall** for the four ground-truth primary_category values ("Financial Fraud", "Data Deletion", "Inappropriate Relations", "Corruption"). Reported for each condition.
- **Deliberation-rate breakdown.** Fraction of emails where Investigator-Sentiment divergence exceeds 0.3.
- **False-positive explanation audit** (qualitative, on LLM-classifier conditions only): read a random sample of 20 FPs and tabulate the LLM's stated reason.

---

## 4. Stopping rules and sequencing

### 4.1 Run order (priority)

Runs are executed in this order because the early ones answer the most informative questions per dollar:

1. **E0-pilot (n=50, Sonnet):** validates infrastructure end-to-end. If it fails, stop and debug.
2. **E0-repro (n=2000, heuristic, Opus):** sanity-check that we reproduce the published F1≈2.65%. If |ΔF1 from published| > 1 pp, stop and investigate before continuing.
3. **E1-LLMcls (n=2000, llm_json, Sonnet):** the single most informative ablation.
4. **E3-raw-heur (n=2000, heuristic on raw text, Opus):** controls whether privacy is the cause under the heuristic.
5. **E3-raw-llm (n=2000, llm_json on raw, Sonnet):** upper bound.
6. **E2-taxon / E4-pseudo / E5-CoT** if budget remains.
7. **E6-best-10K** only if the best-condition F1 from the ablations is > 20% (i.e., the scaled confirmatory run is scientifically worth running).

### 4.2 Hard stopping rules

- **Cost:** abort if cumulative spend exceeds $2,000.
- **Single-run overrun:** abort any single run whose cost exceeds 2× its ex-ante estimate (log as deviation).
- **Instrumentation failure:** if the cost tracker or provenance registry fails to write for any reason, halt and log; do not continue running blind.
- **Contradiction with E0-repro:** if E0-repro F1 deviates from the published 2.65% by more than 1 pp, halt and diagnose — this means the code base or model behavior has silently changed since the published result.

### 4.3 What counts as "ran"

A run is considered complete and included in the ledger only if:

- All 5 provenance artifacts exist (see `EXPERIMENT_JOURNAL.md` §0)
- `predictions.jsonl` has exactly `n_emails` rows (or a documented checkpoint/resume)
- Metrics JSON parses and contains all primary endpoints
- Cost ledger entry is written

Partial runs are marked as `STATUS=interrupted` and excluded from the confirmatory analyses; they may be referenced as supplementary.

---

## 5. Deviations (empty at pre-registration time)

Any departure from this plan — whether a new hypothesis, a changed threshold, a changed stopping rule, a new analysis — must be logged here with ISO timestamp and justification. Deviations detected during analysis (not during design) are flagged as **post-hoc** and reported as exploratory only.

| Timestamp | Change | Justification |
|---|---|---|
| *(none yet)* | | |

---

## 6. Author and contact

- Design author: Cursor agent (overnight autonomous run), 2026-04-22
- Principal investigator (human): Nicole Lyu
- Teammates: Raghav Trivedi, Rin Kuriakose
- Course: CMU 94-847 Responsible AI & AI Governance, Spring 2026
- Report submission deadline: 2026-04-29 23:59 ET
