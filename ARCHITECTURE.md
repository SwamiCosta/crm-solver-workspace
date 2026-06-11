# ARCHITECTURE.md — System Architecture

> **Status:** Pre-Phase 1 baseline. Sections marked `[TO BE FILLED — PHASE 1]` will be populated by the Diagnoser and Analyser agents during the Establish phase and updated via PR.

---

## System Overview

CRM-SOLVER is a layered multi-agent system. The internal agents (Overseer, Diagnoser, Analyser, Solver, Fixer) operate within the engineering team's environment via Claude Code. The Interfacer is the only agent deployed to client infrastructure, exposed as a lightweight API wrapper.

---

## Static Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    ENGINEERING ENVIRONMENT                       │
│                    (Claude Code / Local)                         │
│                                                                  │
│   ┌─────────────┐                                                │
│   │   OVERSEER  │◄──── Human Operator (final authority)         │
│   │  (architect)│                                                │
│   └──────┬──────┘                                                │
│          │ coordinates                                            │
│    ┌─────┼──────────────────────────┐                            │
│    ▼     ▼                          ▼                            │
│ ┌──────────┐  ┌──────────┐  ┌───────────┐  ┌───────┐           │
│ │DIAGNOSER │  │ANALYSER  │  │  SOLVER   │  │ FIXER │           │
│ │(DB read) │  │(code read│  │(code write│  │(data  │           │
│ │Phase 1   │  │Phase 1)  │  │Phase 3)   │  │Phase4)│           │
│ └────┬─────┘  └────┬─────┘  └─────┬─────┘  └───┬───┘           │
└──────┼─────────────┼──────────────┼─────────────┼───────────────┘
       │             │              │             │
       │ read-only   │ read-only    │ PRs only    │ PRs + batch
       │             │              │             │   reports
       ▼             ▼              ▼             ▼
┌─────────────────────────────────────────────────────────────────┐
│                     CLIENT INFRASTRUCTURE                        │
│                                                                  │
│  ┌──────────────┐    ┌─────────────┐    ┌────────────────────┐  │
│  │  CLIENT CRM  │    │  CLIENT DB  │    │  CLIENT BACKEND    │  │
│  │  (frontend / │◄──►│ (Postgres / │◄──►│  (REST API /       │  │
│  │   interface) │    │  MySQL /    │    │   business logic)  │  │
│  └──────────────┘    │  custom)    │    └─────────┬──────────┘  │
│                      └─────────────┘              │             │
│                                                   │ HTTP        │
│                                          ┌────────▼──────────┐  │
│                                          │    INTERFACER     │  │
│                                          │  (Docker container│  │
│                                          │   deployed to     │  │
│                                          │   client cloud)   │  │
│                                          │                   │  │
│                                          │  system prompt:   │  │
│                                          │  interfacer.md    │  │
│                                          │  + findings docs  │  │
│                                          └────────┬──────────┘  │
│                                                   │             │
│                                                   ▼             │
│                                          ┌────────────────────┐ │
│                                          │  ANTHROPIC API     │ │
│                                          │  (external call)   │ │
│                                          └────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘

GITHUB (shared)
├── crm-solver/          ← this repo (agent definitions, docs)
└── client-project/      ← client codebase (Solver and Fixer work here via PRs)
```

---

## Data Flow Narrative

### Phase 1 — Establish (read-only)

1. Operator invokes **Diagnoser** via Claude Code, providing DB credentials (read-only)
2. Diagnoser executes structured queries against the client DB in batches, classifying anomalies using SK-04
3. Diagnoser generates a report saved to `/docs/findings/`
4. Operator invokes **Analyser** via Claude Code, pointing it at the client codebase
5. Analyser reads source files, identifies code paths that produce inconsistent data
6. Analyser generates a report saved to `/docs/findings/`
7. **Overseer** synthesises both reports, populates `ARCHITECTURE.md` sections marked `[TO BE FILLED]`, and opens a documentation PR for human approval
8. Human and client review findings — this document becomes the source of truth for all subsequent phases

### Phase 2 — Continuous Interceptor

1. Interfacer container is built and deployed to client infrastructure
2. Client backend is configured to route relevant requests through the Interfacer endpoint
3. On each request, Interfacer receives the payload, calls the Anthropic API with the system prompt + findings context, and returns a sanitised version
4. Interfacer operates in **suggest mode** initially (returns both original and suggested value) before graduating to **auto-correct mode** (see HITL Ramp)

### Phase 3 — Stop the Bleeding

1. Operator invokes **Solver** with a specific fix task derived from Analyser findings
2. Solver proposes solution to human for confirmation (rule 4.4)
3. Solver implements fix on a feature branch, opens PR, requests Overseer review
4. Overseer reviews, may request changes, passes to human for final approval
5. New versioned endpoints coexist with legacy — no breaking changes

### Phase 4 — Historical Fix

1. Operator invokes **Fixer** with a migration task
2. Fixer generates a batch report of records to be modified — human approves before any write
3. Fixer executes migration, marks migrated records with a flag in the legacy table
4. New queries integrate both `_new` and legacy tables until Phase 5

### Phase 5 — Purge

1. Diagnoser runs a final scan — zero anomalies must be returned before proceeding
2. Human confirms readiness for purge
3. Solver removes legacy table references from code (via PR)
4. Legacy tables are archived or dropped (requires explicit client sign-off)

---

## Client CRM & Database

`[TO BE FILLED — PHASE 1]`

- CRM platform (custom / Bullhorn / Salesforce / HubSpot / other)
- Database engine and version
- Schema overview (key tables relevant to hygiene)
- API rate limits and bulk operation constraints
- Data volume estimates (record counts per key entity)

---

## Root Cause Findings

> **[SIMULATION]** The findings below were produced by a simulated Analyser run against a fictional
> CRM backend. No real client codebase was analysed. This section exists to validate the Analyser's
> output format and reasoning before live engagement. Full simulation report: `docs/findings/2026-06-11_analyser_root-cause-report.md`

### Simulated System Under Analysis

- **Backend:** Node.js 16 (EOL) / Express 4.18 / Sequelize 6 / PostgreSQL 13
- **Frontend:** React 17 / Redux / Yup (partial)
- **Architecture:** Hybrid — partial MVC; several route files bypass controllers and query the DB directly
- **Codebase health indicators:** ~18% test coverage, no structured logging, no API documentation, inconsistent Sequelize migration history

---

### CRITICAL Findings

| ID | File (simulated) | Finding |
|---|---|---|
| C-01 | `routes/legacy.js:88` | `POST /api/legacy/contacts` was never decommissioned. It bypasses all validation and writes directly via raw `bulkCreate`. Primary source of email-less and format-inconsistent contact records. |
| C-02 | `routes/companies.js`, `routes/sync.js`, `controllers/placements.js:67` | Three independent company creation paths with divergent validation and normalisation. Exact case-sensitive string match in placement flow silently creates phantom companies. |
| C-03 | `controllers/contacts.js:31` vs `routes/legacy.js:88` | `email` (the deduplication key) is validated as required on the main path only. Records entering via the legacy path are permanently invisible to the deduplication cron job. |
| C-04 | `controllers/placements.js:67` | Inline company `findOne`/`create` inside placement logic creates a new company whenever the submitted name does not exactly match an existing record — no normalisation, no branch attribution, no linked data. |
| C-05 | `models/Contact.js:67` + no re-attribution script | `branch_id` is copied from the creating recruiter at insert time. Recruiter transfers retroactively corrupt branch attribution on all historical records. Branch-level pipeline reporting is structurally incorrect for any branch with staff movement. |

---

### HIGH Findings

| ID | File (simulated) | Finding |
|---|---|---|
| H-01 | `routes/contacts.js:58,91` | `PUT` and `PATCH` on contacts coexist with inconsistent semantics. Older frontend components using `PUT` silently blank fields not included in the payload. |
| H-02 | `models/Contact.js:44` | Phone stored as a raw string with no backend normalisation. At least four distinct formats coexist in the DB. Frontend-only Yup mask is bypassed by any non-UI write path. |
| H-03 | `models/Company.js:19` + `routes/sync.js:130` | `industry` field is a free-text `STRING` at the database level; the sync path writes arbitrary strings from the external job board without mapping to the frontend's controlled vocabulary. |
| H-04 | `migrations/20210814_create_companies.js` | No DB-level unique constraint on `companies.name`. Concurrent writes (two users, or UI + sync job) can both pass the application-level `findOne` check and create duplicate companies. |
| H-05 | `models/Company.js`, `models/Contact.js`, `models/Job.js` | Three different deletion patterns: `paranoid` (soft-delete via `deleted_at`), boolean `is_active`, and `status: 'closed'`. Cross-entity queries inconsistently filter deleted records. |
| H-06 | `cron/deduplication.js` | Duplicate detection runs nightly at 02:00 only. Up to a 24-hour window where duplicates are live and recruiter activity can attach to records that will later be flagged. Activity is not migrated on flagging — it is orphaned. |
| H-07 | `scripts/bulk_import.js:203` | Bulk import uses raw SQL (`pg` client directly), bypassing Sequelize ORM. `beforeUpdate` hook never fires — `updated_at` is not maintained for bulk-imported records, corrupting change-detection logic. |
| H-08 | `controllers/placements.js:55–120` | Four sequential writes on placement creation (placement, job status, contact status, branch counter) with no database transaction. Partial placements persist on any step failure — observed in existing DB state. |
| H-09 | Runtime | Node.js 16 reached EOL September 2023. No security patches. Prerequisite upgrade required before Phase 3 work begins. |

---

### MEDIUM Findings

| ID | File (simulated) | Finding |
|---|---|---|
| M-01 | `routes/contacts.js` | No contact merge endpoint. Manual deduplication by recruiters uses ad-hoc SQL, bypassing ORM hooks and leaving orphaned records. |
| M-02 | `cron/deduplication.js:78` | `is_duplicate` flag is set by cron but has no downstream enforcement — flagged records remain fully active indefinitely with no required action. |
| M-03 | — | No structured logging. `console.log` only. No correlation IDs, no severity levels, no machine-readable format. Prerequisite for Phase 2 Interfacer deployment. |
| M-04 | `migrations/` | 4 of 23 migration files contain comments indicating they were applied manually and skipped in the migration runner. Schema state cannot be reliably inferred from migration history alone. |

---

### LOW Findings

| ID | File (simulated) | Finding |
|---|---|---|
| L-01 | `models/Contact.js:51` | `job_title` is free text with no controlled vocabulary or normalisation. Degrades filtering and reporting accuracy. High-value normalisation target for the Interfacer (Phase 2). |

---

### Severity Totals

**5 CRITICAL · 9 HIGH · 4 MEDIUM · 1 LOW**

---

### Recommended Fix Priorities (pending human approval)

1. Decommission `POST /api/legacy/contacts` — route all writes through the validated main path
2. Centralise company upsert — single service function with normalisation + DB unique constraint
3. Add backend-layer normalisation for `phone`, `industry`, `company_name`
4. Wrap placement creation in a DB transaction
5. Standardise deletion pattern across all models
6. Implement branch attribution history table (replace scalar `branch_id` copy)
7. Replace raw-SQL bulk import with ORM-compliant batch path
8. Upgrade Node.js to current LTS (prerequisite for Phase 3)

---

## Data Anomaly Profile

`[TO BE FILLED — PHASE 1]`

*Populated by Diagnoser. Will document anomaly types, volumes, and severity distribution.*

---

## Interfacer Deployment Spec

`[TO BE FILLED — PHASE 2]`

- Client cloud provider
- Container registry
- Environment variables required
- Endpoint mapping (which CRM API calls are routed through Interfacer)
- Estimated token consumption per day at current traffic volume
