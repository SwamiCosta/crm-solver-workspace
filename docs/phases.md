# Project Phases

This document details the five phases of the CRM-SOLVER engagement. Each phase is designed to deliver standalone value and can serve as a stopping point if the client chooses not to proceed further.

---

## Phase 1 — Establish

**Goal:** Understand the problem before touching anything.

**What happens:**
- The **Diagnoser** agent connects to the client database with read-only credentials and runs structured queries in batches, classifying anomalies by type (duplicates, blank fields, format inconsistencies, orphaned records, conflicting values)
- The **Analyser** agent reads the client backend codebase, mapping code paths that produce or allow inconsistent data (missing constraints, duplicate endpoints, inconsistent validation logic)
- Both agents generate structured reports saved to `/docs/findings/`
- The **Overseer** synthesises both reports into a prioritised problem dossier and populates `ARCHITECTURE.md`
- Findings are reviewed and validated with the client before any further phase begins

**What is deliberately ignored:**
- No data is modified
- No code is changed
- No fixes are proposed until findings are client-confirmed

**Duration:** Days to weeks depending on codebase and DB size, and client feedback availability

**Exit criteria:**
- Client confirms findings reflect real operational experience
- Problem dossier is approved by human stakeholder
- `ARCHITECTURE.md` sections marked `[TO BE FILLED — PHASE 1]` are populated and reviewed

---

## Phase 2 — Continuous Interceptor

**Goal:** Stop new dirty data from entering the system from this point forward.

**What happens:**
- The **Interfacer** agent is deployed to client infrastructure as a Docker container
- The client backend is configured to route relevant CRM write operations through the Interfacer endpoint
- Interfacer applies hygiene logic (informed by Phase 1 findings) to incoming data in real time
- Initially runs in **suggest mode** — returns both original and suggested values; recruiter accepts or ignores
- Graduates to **auto-correct mode** for high-confidence corrections after meeting HITL Stage 1 criteria (see `/docs/hitl-ramp.md`)

**Important cost consideration:**
Deploying the Interfacer in production introduces a recurring token cost tied to recruiter activity volume. This cost is unbounded and scales with usage. Clients who stop at Phase 2 are trading a one-time engineering investment for an indefinite operational API bill. The recommendation is to proceed to Phases 3–5 to eliminate this dependency. See `README.md` — Cost Considerations.

**Duration:** Setup in days; suggest-mode validation period minimum 2 weeks before graduation

**Exit criteria:**
- Interfacer running stably in production
- Suggestion acceptance rate ≥ 85% over 2 weeks
- Zero confirmed false positives

---

## Phase 3 — Stop the Bleeding

**Goal:** Fix the code so the problem cannot recur.

**What happens:**
- The **Solver** agent implements code-level fixes identified by the Analyser
- All fixes are additive and non-breaking: new versioned endpoints are created alongside legacy ones; no existing flows are modified or removed
- New database tables (`_new` suffix) are created for clean data; legacy tables remain untouched
- New flows write exclusively to `_new` tables; read queries integrate both until Phase 4 completes
- All changes go through the PR workflow with Overseer review and human approval

**What is deliberately ignored:**
- Legacy dirty data — that is Phase 4's job
- Legacy code paths — they remain active until Phase 5

**Duration:** Days to a few weeks depending on the number and complexity of fixes

**Exit criteria:**
- All new endpoints pass the existing test suite
- At least one full recruiter workflow validated on the new flow in UAT
- No new dirty records being created in `_new` tables after go-live

---

## Phase 4 — Historical Fix

**Goal:** Migrate and clean the legacy dirty data.

**What happens:**
- The **Fixer** agent generates batch migration reports: structured lists of legacy records proposed for migration to `_new` tables, with confidence scores per record
- Each batch is presented to a human reviewer for approval before any write operation is executed
- The Overseer annotates large batches with `[HIGH IMPORTANCE]` / `[LOW IMPORTANCE]` markers to guide reviewer attention
- Approved batches are executed; migrated records are flagged in the legacy table to prevent duplicate reads
- High-cost migration jobs are scheduled during off-peak hours to avoid impacting system performance
- Clean legacy records (those that required no correction) are migrated last, also with human sign-off

**Duration:** Weeks to months depending on data volume, anomaly density, and human reviewer availability. Pace accelerates as patterns become clearer and reviewer confidence grows.

**Exit criteria:**
- All legacy records either migrated (with flag) or explicitly reviewed and deferred
- Diagnoser run on legacy tables returns zero unflagged anomalies
- Human stakeholder sign-off on migration completeness

---

## Phase 5 — Purge

**Goal:** Remove all legacy scaffolding and deliver a clean system.

**Trigger condition:** Diagnoser returns zero anomalies on a full database scan. This is a hard prerequisite — Phase 5 does not begin until this condition is met.

**What happens:**
- The **Solver** agent removes all references to legacy tables from the codebase (via PR)
- Legacy tables are archived or dropped — this requires explicit written client sign-off as it is irreversible
- The Interfacer remains in production as a hygiene assistant and data recovery tool, but is no longer the primary defence (that is now the corrected code)
- Final documentation update: `ARCHITECTURE.md` is updated to reflect the clean steady-state system

**What is deliberately ignored:**
- The Interfacer is not removed — it continues to add value for edge cases and complex data queries

**Duration:** Days

**Exit criteria:**
- Full regression test suite passes after legacy table removal
- Diagnoser returns zero anomalies on the final clean database
- Client formally signs off on purge completion
- All `[TO BE FILLED]` sections in `ARCHITECTURE.md` are resolved

---

## Phase Summary

| Phase | Agent(s) | Writes Data? | Writes Code? | Client Sign-off Required |
|---|---|---|---|---|
| 1 — Establish | Diagnoser, Analyser | ❌ | ❌ | ✅ Findings validation |
| 2 — Interceptor | Interfacer | ✅ (suggestions only → auto-correct) | ❌ | ✅ UAT + HITL graduation |
| 3 — Stop the Bleeding | Solver | ❌ | ✅ (additive only) | ✅ Each PR |
| 4 — Historical Fix | Fixer | ✅ (flagging + migration) | ❌ | ✅ Each batch |
| 5 — Purge | Solver, Diagnoser | ✅ (archive/drop legacy) | ✅ (remove legacy refs) | ✅ Written sign-off |
