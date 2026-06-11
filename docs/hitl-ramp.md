# Human-in-the-Loop Ramp

This document defines how CRM-SOLVER transitions from full human oversight to selective automation — and what evidence is required before each graduation.

The guiding principle: **trust is earned through a track record, not assumed at deployment.**

---

## The Risk Asymmetry

A false positive (the agent "corrects" good data) is significantly more damaging than a false negative (the agent misses dirty data). A missed duplicate can be caught later. An overwritten client record may be unrecoverable and will immediately destroy recruiter trust in the system.

This asymmetry dictates that the ramp moves slowly and conservatively.

---

## Stage 0 — Observe Only (Phase 1)

**What the system does:** Reads data and code. Produces reports. Takes no action.  
**Human role:** Reviews all findings. Validates that the system's observations match real operational experience.  
**Automation level:** 0%

**Graduation criteria:**
- Client confirms that Diagnoser and Analyser findings reflect known problems
- At least one finding is validated end-to-end (the agent identified it, a human confirmed it is real)
- No false positives in the anomaly report (the agent flagged something that is actually correct data)

---

## Stage 1 — Suggest Mode (Phase 2, initial)

**What the system does:** Intercepts CRM inputs/outputs and returns a suggested cleaned version alongside the original. No data is modified. The recruiter sees both and can accept or ignore the suggestion.  
**Human role:** Every suggestion is visible to the recruiter. Acceptance is a conscious click, not a default.  
**Automation level:** 0% writes, 100% suggestions surfaced

**Graduation criteria (measured over minimum 2 weeks of live traffic):**
- Suggestion acceptance rate ≥ 85% (recruiters are accepting most suggestions as correct)
- Zero confirmed false positives (no case where accepting a suggestion would have corrupted good data)
- Recruiter feedback is neutral or positive (suggestions are not perceived as annoying or wrong)

---

## Stage 2 — Auto-correct with Notification (Phase 2, graduated)

**What the system does:** High-confidence corrections (SK-05 score > 90%) are applied automatically on write. The recruiter receives a brief inline notification: *"1 field standardised automatically."* They can undo within 60 seconds.  
Medium and low-confidence cases remain in suggest mode.  
**Human role:** Passive oversight. Notifications are visible. Undo is always available.  
**Automation level:** ~40–60% of corrections (high-confidence only)

**Graduation criteria (measured over minimum 4 weeks):**
- Undo rate for auto-corrections < 2% (recruiters are not reversing the system's decisions)
- No escalations from recruiters about incorrect auto-corrections
- High-confidence classification is reviewed and confirmed to be well-calibrated

---

## Stage 3 — Batch Migration with Human Sign-off (Phase 4)

**What the system does:** Fixer generates batch migration reports for legacy data. Reports are presented to a human reviewer before any write operation. Reviewer approves the batch (or rejects/modifies it) and the Fixer executes.  
**Human role:** Approves every batch before execution. Reviews Overseer triage annotations (HIGH / LOW importance) to focus attention.  
**Automation level:** Execution is automated post-approval; approval remains human

**Graduation criteria:**
- Batch rejection rate (human rejects a proposed batch) falls below 5% over 3 consecutive batches
- No data loss or corruption incidents in any executed batch
- Fixer's confidence scoring is demonstrably well-calibrated against actuals

---

## Stage 4 — Steady State (Post-Phase 5)

**What the system does:** Interfacer continues to run in auto-correct mode for new data. Diagnoser can be invoked on-demand for periodic health checks. No active migration work remains.  
**Human role:** Periodic review of Diagnoser health check reports. Intervention only when new anomaly patterns emerge.  
**Automation level:** High for routine hygiene; human-triggered for diagnostic cycles

---

## What Never Gets Automated

Regardless of track record, the following actions always require explicit human approval:

- Merging or deleting records
- Dropping or archiving database tables
- Deploying any agent to production
- Any action flagged as irreversible (per CLAUDE.md rule 4.1)
- The final Purge (Phase 5)

---

## Rollback Protocol

At any stage, if recruiter trust degrades or a significant false positive occurs:

1. Interfacer is immediately switched back to suggest-only mode (no auto-corrections)
2. Overseer documents the incident and root cause
3. Human operator reviews and approves any return to higher automation levels
4. Stage graduation criteria are reset and must be re-earned from the current stage

The system is designed to degrade gracefully — moving to a lower automation stage never requires emergency intervention or downtime.
