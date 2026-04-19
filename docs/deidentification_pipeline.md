# Real-Data De-Identification Pipeline

**TL;DR:** To enable quantitative research, we built a reproducible de-identification pipeline. It extracts 2,000 real (not synthetic) Enron emails, masks their metadata with a deterministic mapping table (`Employee_1`, `Employee_2`), and scrubs plain text. This anonymizes the data for the AI without breaking the graph's network topology. Run `make data-pipeline-deidentified` to use it.

## 1. Mapping Tables vs. Network Topology

To anonymize data without breaking the graph topology, this pipeline uses a true **Metadata Mapping Table**.

- It assigns a deterministic pseudo-ID (e.g., `jeff.skilling@enron.com` -> `Employee_1`).
- It replaces the email addresses in the graph relation CSVs with these IDs.
- Because the IDs remain consistent, the network topology (communication volumes between nodes) is perfectly preserved, but the nodes' true identities are hidden from the AI.
- The script exports a master `identity_mapping_table.csv` so researchers can map the AI's findings back to ground truth.

## 2. Why Exactly 2,000 Emails?

The dashboard uses `react-force-graph-3d` which runs on WebGL in the browser. While WebGL is powerful, rendering every node and calculating physics in real-time has a limit.
If we loaded the full 500,000 Enron dataset, the browser tab would instantly hit an "Out of Memory" crash. Capping the extraction at 2,000 ensures a visually dense graph that still runs at a smooth frame rate.

## 3. How to Run the Pipeline

Whenever you are ready to generate your real data graph, run one command in your terminal from the project root:

```bash
make data-pipeline-deidentified
```

**What this command does behind the scenes:**

1. `download`: Fetches the ~423MB Enron archive.
2. `parse`: Extracts the massive directory into CSVs.
3. `deidentify`: Selects 2,000 emails, scrubs their PII using regular expressions (`[EMAIL]`, `[PHONE]`, `[PERSON]`), and maps their metadata to `Employee_X` IDs dynamically.
4. `import-deidentified`: Loads only the scrubbed CSVs into your Neo4j database.

## 4. Design Decisions & Trade-offs

To reach this final pipeline architecture, we evaluated several approaches. The design decisions were driven by the need to balance quantitative research validity with the technical constraints of our multi-agent architecture and frontend.

### Approach 1: Scrubbing the Synthetic Demo Data

Our initial approach was to apply string-matching redaction to the `seed_curated.py` file, which generates ~1,200 synthetic emails.

- **Why it was rejected**: Synthetic data is artificially clean. If the agents perform well on this data, it doesn't prove they can handle the jargon-heavy, unstructured messiness of real corporate communication. This approach would have invalidated any quantitative research on the AI's efficacy.

### Approach 2: Processing the Full 500k Enron Corpus

The next logical step was to ingest the entire 500,000+ Enron email dataset and anonymize it on the fly.

- **Why it was rejected**: Our dashboard uses `react-force-graph-3d` (WebGL) to render the network topology. Loading 500k nodes and millions of edges instantly triggers an "Out of Memory" browser crash. Additionally, running LLM inference across half a million emails is computationally and financially unscalable for this project.

### Final Approach: True Metadata Mapping on a Dense Subset (The Trade-off)

We landed on a hybrid approach: extracting a fixed, reproducible subset of 2,000 *real* emails centered around key executives, and applying a true Metadata Mapping Table.

- **Why we chose this**:
  1. **Research Validity**: The agents analyze real, messy 2001 Enron emails, allowing for scientifically rigorous Precision/Recall calculations against ground-truth data.
  2. **System Performance**: 2,000 edges is the "sweet spot" where the WebGL frontend remains butter-smooth while still looking visually dense and complex.
  3. **Topology Preservation:** We chose a persistent mapping table (`Employee_1`) over simple regex redaction because inconsistent redactions would shatter the graph's edges. The AI must be blinded to identity without losing its ability to calculate anomalous communication volumes based on network centrality.
