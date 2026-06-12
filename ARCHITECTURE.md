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
│    ▼     ▼                                  ▼                            │
│ ┌──────────┐  ┌──────────┐  ┌───────────┐  ┌───────┐  ┌──────────┐  │
│ │DIAGNOSER │  │ANALYSER  │  │  SOLVER   │  │ FIXER │  │  PURGER  │  │
│ │(DB read) │  │(code read│  │(code write│  │(data  │  │(code +   │  │
│ │Phase 1   │  │Phase 1)  │  │Phase 3)   │  │migrate│  │data del. │  │
│ │          │  │          │  │           │  │Ph. 4) │  │Phase 5)  │  │
│ └────┬─────┘  └────┬─────┘  └─────┬─────┘  └───┬───┘  └────┬─────┘  │
└──────┼─────────────┼──────────────┼─────────────┼───────────┼─────────┘
       │             │              │             │           │
       │ read-only   │ read-only    │ PRs only    │ batch     │ purge
       │             │              │             │ reports   │ batches
       ▼             ▼              ▼             ▼           ▼
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

1. `server/migrations/001_create_audit_log.sql` is run against the client database — creates the `audit_log` table that will be shared by all subsequent phases
2. Interfacer container is built and deployed to client infrastructure
3. Client backend is configured to route relevant requests through the Interfacer endpoint
4. On each request, Interfacer receives the payload, calls the Anthropic API with the system prompt + findings context, returns a sanitised version, and writes an entry to `audit_log` (SK-11)
5. If the database is not yet connected, audit entries fall back to structured console logs — no request is aborted
6. Interfacer operates in **suggest mode** initially (returns both original and suggested value) before graduating to **auto-correct mode** (see HITL Ramp)

### Phase 3 — Stop the Bleeding

1. Operator invokes **Solver** with a specific Analyser finding ID (e.g. C-01)
2. Solver reads the finding, designs the fix, and presents the full proposal to the human for confirmation (rule 4.4)
3. Solver creates a feature branch on the client repo: `fix/<finding-id>-<slug>`
4. Solver implements **additive code only** — new files, new Sequelize migrations, no modifications to existing files:
   - New versioned endpoints at `/api/v2/<entity>` (legacy endpoints remain active)
   - New tables `<entity>_new` created via migration (see SK-10)
   - Unified service layer that reads from both `_new` and legacy tables (legacy rows with `migrated = TRUE` are excluded from reads)
   - `AuditService` (`services/auditService.js`) delivered in the first PR — writes to the `audit_log` table already created in Phase 2 (see SK-11)
   - Unit tests alongside every new file
5. Solver opens a PR to the client repo per SK-02, requests Overseer review
6. Overseer reviews, may request changes, passes to human for final approval
7. When the last legacy write flow is eliminated, Solver documents the **V2 cutover milestone** in `docs/findings/` — this is the Fixer's prerequisite to begin Phase 4
8. **Legacy backup trigger:** Fixer generates a `pg_dump` of all legacy tables immediately after V2 cutover is confirmed, before any data migration begins (human approval required, rule 4.1)

### Phase 4 — Historical Fix

**Prerequisite:** Solver V2 cutover milestone confirmed (`docs/findings/YYYY-MM-DD_solver_v2-cutover.md` present) and legacy backup stored.

1. Operator invokes **Fixer** with a migration task (table + anomaly type)
2. Fixer runs a bounded SELECT preview of the target batch (SK-08)
3. Fixer generates a batch report (`docs/migration-reports/`) — human approves before any write (rule 4.1)
4. Fixer executes migration in a single DB transaction:
   - INSERT cleaned record into `<entity>_new`
   - SET `migrated = TRUE`, `migrated_at = NOW()` on the legacy row
   - Write to `audit_log` via `AuditService` — if audit fails, transaction rolls back
5. Batches exceeding 2,000 records or high-cost transformations are wrapped as off-peak scheduled jobs (timing confirmed with client)
6. After all dirty records are migrated, legacy clean records are also migrated (with human approval per batch)
7. Unified service layer continues to serve reads from both tables until Phase 5

### Phase 5 — Purge

**Prerequisites — all four must be confirmed before Phase 5 begins:**
1. `docs/findings/*_solver_v2-cutover.md` present — no application path writes new records to legacy tables
2. Fixer completion report present in `docs/migration-reports/` — all legacy records migrated
3. Diagnoser zero-anomaly scan on `_new` tables completed — human sign-off received
4. Human operator has provided explicit written approval to begin Phase 5

**Track 1 — Code Purge (runs first):**

1. **Purger** generates a fresh DB backup of all affected tables (legacy + `_new` + `audit_log`) before any action (SK-12 Gate G-3)
2. Human confirms backup is accessible and verified — Phase 5 does not proceed without this confirmation (rule 4.1)
3. Purger identifies all legacy files to remove: route handlers, controllers, services, model configs, and cron jobs superseded by V2 equivalents
4. Purger presents the complete removal list to the human for approval before opening any PRs (rule 4.4)
5. Purger opens one PR per entity group to the client repo removing legacy files; full test suite must pass after each removal
6. Each code purge PR goes through Overseer review and human final approval (rules 4.5, 4.6)

**Track 2 — Data Purge (begins only after all code purge PRs are merged):**

7. Purger runs a pre-purge verification `SELECT` on each legacy table confirming all records have `migrated = TRUE` (SK-08)
8. If any unmigrated records are found: stop, generate a discrepancy report, escalate to the Overseer
9. Purger generates a pre-purge data summary for each table and presents for human approval (rule 4.1)
10. Purger executes batch DELETEs per SK-06 and SK-12: 500 records per batch, transaction-wrapped, human approval per batch
11. After all records are deleted from a table, Purger presents a separate `DROP TABLE` request — requires explicit written client sign-off including the word "drop" and the table name (rule 4.1)
12. `DROP TABLE <entity> CASCADE` executes only after that sign-off is received

**Final verification:**

13. Diagnoser runs a final zero-anomaly scan on the clean database
14. Purger generates `docs/findings/YYYY-MM-DD_purger_phase5-completion.md`: prerequisites confirmed, backup reference, files removed, tables dropped, final record counts, sign-off audit trail
15. Overseer updates `ARCHITECTURE.md` to reflect the clean steady-state system

**What is never touched:**
- `audit_log` — preserved permanently, never dropped
- `_new` tables — these are now the production tables; rename to canonical names is out of scope for Phase 5 unless explicitly authorised
- The Interfacer — remains deployed as an ongoing hygiene and recovery tool

---

## Client CRM & Database

> **[SIMULATION]** The values below were produced by a simulated Diagnoser run against a
> fictional CRM database. No real client database was accessed. Full simulation report:
> `docs/findings/2026-06-11_diagnoser_anomaly-report.md`

### Platform

| Attribute | Value |
|---|---|
| CRM type | Custom-built (no third-party CRM platform) |
| Backend | Node.js 16 / Express 4.18 / Sequelize 6 |
| Database engine | PostgreSQL 13 |
| Database name | `crm_production` |
| Frontend | React 17 |

### Schema Overview — Key Tables

| Table | Purpose | Records |
|---|---|---|
| `contacts` | Candidates and client contacts | 28,450 |
| `companies` | Client company accounts | 6,830 |
| `jobs` | Open and historical job postings | 4,210 |
| `placements` | Confirmed candidate placements | 3,756 |
| `activities` | Notes, calls, tasks linked to contacts | 94,320 |
| `branches` | Physical office branches | 8 |
| `recruiters` (users) | Recruiter accounts | 47 |

### V2 Tables and Audit Infrastructure (added in Phase 3)

The following tables are created by Solver-delivered Sequelize migrations. They do not exist in the client's original schema.

| Table | Purpose | Created by |
|---|---|---|
| `contacts_new` | Cleaned contacts records with enforced validation | Solver — first migration for contacts |
| `companies_new` | Cleaned company records with unique name constraint | Solver — first migration for companies |
| `jobs_new` | Jobs records with standardised status and FK enforcement | Solver — first migration for jobs |
| `placements_new` | Placement records created via transactional write path | Solver — first migration for placements |
| `audit_log` | Append-only log of all Interfacer operations, V2 endpoint traffic, and migration writes | Phase 2 — `server/migrations/001_create_audit_log.sql` |

**`audit_log` schema:**

| Column | Type | Notes |
|---|---|---|
| `id` | `SERIAL PRIMARY KEY` | |
| `timestamp` | `TIMESTAMPTZ NOT NULL DEFAULT NOW()` | |
| `action` | `VARCHAR(100) NOT NULL` | e.g. `create_contact_v2`, `migrate_batch`, `correct_phone` |
| `entity` | `VARCHAR(100)` | Table or resource name |
| `entity_id` | `INTEGER` | PK of the affected record |
| `initiated_by` | `VARCHAR(255) NOT NULL` | Recruiter ID, agent name, or system process |
| `authorized_by` | `VARCHAR(255)` | Operator name for write actions; `null` for reads |
| `details` | `JSONB` | Operation-specific context (old/new values, batch ID, finding ID) |

**Constraint:** `audit_log` is append-only. No `UPDATE` or `DELETE` may ever be issued against it.

**Delivered:** Phase 2 (Interfacer deployment). Used by Phase 3 (Solver V2 endpoints) and Phase 4 (Fixer migrations).

**Assumption:** `audit_log` resides in the same database as the CRM data (`crm_production`). See A-11.

---

### Notable Schema Gaps

- No unique constraint on `companies.name` — duplicate creation is structurally permitted
- `contacts.email` is nullable and non-unique — the primary deduplication key offers no DB-level guarantee
- No FK constraint on `placements.job_id` — orphaned placements can and do exist
- No branch attribution history table — recruiter transfers silently corrupt historical data
- No indexes on `contacts.company_id` or `activities.contact_id` — performance risk on joins
- Three distinct soft-delete patterns coexist: `deleted_at` (companies), `is_active` boolean (contacts), `status` field (jobs)

### API Rate Limits and Bulk Operation Constraints

Not yet determined. The client backend has no API documentation. Rate limits are not enforced
at the application level. Bulk operation constraints will be confirmed in Phase 2 when the
Interfacer is sized for deployment.

### Data Volume Estimates

| Entity | Count |
|---|---|
| Total records scanned | 137,621 |
| Records with at least one anomaly | 25,194 (18.3% of total) |

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

> **[SIMULATION]** Populated by a simulated Diagnoser run. Full report and data issues log:
> `docs/findings/2026-06-11_diagnoser_anomaly-report.md`
> `docs/findings/2026-06-11_diagnoser_data-issues.md`

### Anomaly Type Distribution

| Anomaly Code | Type | Affected Records | % of Total |
|---|---|---|---|
| `DUP` | Duplicate records | ~2,920 (contacts + companies) | 2.1% |
| `BLANK` | Missing critical fields | ~9,691 | 7.0% |
| `FORMAT` | Format inconsistencies | ~22,028 | 16.0% |
| `TAG` | Incorrect / out-of-vocabulary tags | ~1,840 | 1.3% |
| `CONFLICT` | Conflicting values across records | ~3,673 | 2.7% |
| `ORPHAN` | Records referencing deleted parents | ~8,180 | 5.9% |
| `OTHER` | Timestamp corruption, unclassified | ~9,564 | 6.9% |

### Severity Distribution

| Severity | Finding Count |
|---|---|
| `CRITICAL` | 7 |
| `HIGH` | 18 |
| `MEDIUM` | 7 |
| `LOW` | 1 |

### Top 3 Anomaly Categories by Business Impact

1. **Branch attribution corruption (CONFLICT / CRITICAL):** 3,120 contacts have incorrect
   branch attribution due to recruiter transfers. Branch-level pipeline reporting is structurally
   wrong for all 8 branches. This affects the primary operational metric used by branch managers.

2. **Null-email contacts (BLANK / CRITICAL):** 2,274 contacts have no email and are permanently
   invisible to the deduplication system. This population grows with every use of the legacy
   import endpoint.

3. **Orphaned activity records (ORPHAN / HIGH):** 6,890 activity records are attached to
   inactive or flagged-duplicate contacts. Recruiter history is functionally lost for these
   records and cannot be recovered without a migration strategy.

### Structural Risk Summary

The anomaly volume is large but the root causes are concentrated. The Analyser's code analysis
(see Root Cause Findings section above) identifies 5 CRITICAL code-level causes that collectively
account for the majority of data anomalies found here. Fixing those 5 causes in Phase 3 will
stop new anomalies from being created; Phase 4 addresses the existing backlog.

---

## Interfacer Deployment Spec

`[TO BE FILLED — PHASE 2]`

- Client cloud provider
- Container registry
- Environment variables required
- Endpoint mapping (which CRM API calls are routed through Interfacer)
- Estimated token consumption per day at current traffic volume
