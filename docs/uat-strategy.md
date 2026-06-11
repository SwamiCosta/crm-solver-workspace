# UAT Strategy

This document outlines the options for User Acceptance Testing and the questions that must be resolved with the client before Phase 2 begins.

---

## Why UAT Matters Here

CRM-SOLVER's most sensitive operations — the Interfacer's auto-correct mode and the Fixer's migration scripts — must be validated before they touch production data. A false positive in UAT is a learning moment. A false positive in production erodes recruiter trust and may be irreversible.

UAT is also the client's opportunity to confirm that the system's behaviour matches their operational reality, not just our interpretation of their data.

---

## Open Questions for Client

The following must be resolved before UAT begins:

### Q1 — UAT Environment Preference
**Does the client prefer to run UAT in a dedicated staging environment, or locally on an engineer's machine?**

- A staging environment mirrors production infrastructure and gives higher confidence in results, but requires setup time and hosting cost.
- A local environment is faster to spin up but may not reflect production performance characteristics.

### Q2 — Production Data Clone
**Can the client provide a clone of real production data (anonymised if necessary) for the UAT database?**

- A real data clone gives the highest-fidelity test results — the agent encounters the actual patterns of dirty data it will face in production.
- If data privacy or compliance prevents this, we move to Option 3 below.

### Q3 — Simulated Dataset
**If a production clone is not available, can the client provide examples of known dirty data records and problematic entry flows?**

- These examples can seed a synthetic UAT dataset that faithfully reproduces the most common error patterns.
- This option is slower to prepare but fully compliant with any data privacy requirements.
- This synthetic dataset becomes a permanent regression test asset — it can be re-run after any system change to confirm no regressions.

---

## Recommended UAT Approach

Based on typical constraints in commercial staffing environments, the recommended path is:

1. **Staging environment** on the client's existing cloud infrastructure (mirrors production config)
2. **Anonymised production clone** for the database (PII fields masked, structural and pattern fidelity preserved)
3. If anonymisation is not feasible: **synthetic dataset** built from client-provided examples of known problem cases

The synthetic dataset option is not a fallback of last resort — for Phase 3 and 4 testing, a controlled dataset with known ground truth is actually preferable, as it allows precise measurement of agent accuracy.

---

## UAT Sign-off Criteria

UAT for each phase is considered passed when:

| Phase | Pass Criteria |
|---|---|
| Phase 2 (Interfacer) | 50 consecutive records processed with zero false positives; suggest mode accepted by at least 3 recruiters in test sessions |
| Phase 3 (Solver) | All new endpoints pass existing test suite; at least one recruiter completes a full data-entry workflow on the new flow without errors |
| Phase 4 (Fixer) | 3 migration batches executed in UAT environment with zero data loss; migrated records are queryable from both old and new tables |
| Phase 5 (Purge) | Full regression test suite passes after legacy table removal; Diagnoser returns zero anomalies on the UAT dataset |
