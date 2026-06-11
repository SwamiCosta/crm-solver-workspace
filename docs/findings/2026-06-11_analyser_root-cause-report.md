# Analyser Root Cause Report

> **[SIMULATION]** This report is a simulated exercise. No real client codebase was analysed.
> The system described below is a fictional CRM backend constructed to represent a plausible
> failure profile for a multi-branch commercial staffing firm. All file paths, line numbers,
> and code snippets are fabricated for training and validation purposes.

---

**Date:** 2026-06-11
**Agent:** Analyser
**Repos analysed (simulated):**
- `crm-be-project/` — Backend (Node.js / Express / Sequelize / PostgreSQL)
- `crm-fe-project/` — Frontend (React 17)

**Commit SHAs at time of analysis (simulated):**
- BE: `a3f91c2d`
- FE: `b84e07fa`

**Phase:** 1 — Establish (read-only)

---

## Methodology

The Analyser conducted a full static read of both repositories following the operating procedure
defined in `agents/analyser.md`. The sequence was:

1. Entry points and routing files reviewed to build an application map
2. Endpoint Audit — all routes catalogued and cross-referenced for overlapping logic
3. Constraint and Validation Audit — per-field validation compared across all write paths
4. Business Logic Audit — logic paths traced for silent failures, fallback patterns, and side-effects
5. Codebase Profile — technology landscape and conventions documented
6. Open-Ended Scan — any additional structural concerns not captured by prior categories

---

## Codebase Profile

### Backend (`crm-be-project/`)

| Attribute | Value |
|---|---|
| Runtime | Node.js 16.x (EOL since September 2023) |
| Framework | Express 4.18 |
| ORM | Sequelize 6 |
| Database | PostgreSQL 13 |
| Architecture pattern | Hybrid — partial MVC with route files that bypass controllers and query the DB directly |
| Testing framework | Mocha + Chai |
| Test coverage | ~18% (estimated from test file count vs module count) |
| Logging | `console.log` / `console.error` scattered — no structured logging library |
| API documentation | None. No OpenAPI / Swagger spec present. |
| Build tooling | No build pipeline — server started via `node server.js` |
| Migration tooling | Sequelize Migrations (`/migrations/`) — several contain inline comments: `"run manually after deploy"` |
| Key entry point | `server.js` → `routes/index.js` → individual route files |

### Frontend (`crm-fe-project/`)

| Attribute | Value |
|---|---|
| Framework | React 17 |
| State management | Redux (legacy patterns, no RTK) |
| Build tooling | Create React App (ejected) |
| Validation library | Yup (used inconsistently — not present in all form modules) |
| API communication | Axios — base URL configured via `.env`, no request interceptor for error normalisation |

---

## 1. Endpoint Audit

### 1.1 — Dual Contact Creation Paths [CRITICAL]

**Files:**
- `routes/contacts.js:14` — `POST /api/contacts`
- `routes/legacy.js:88` — `POST /api/legacy/contacts`

Two independent endpoints create contact records. `POST /api/contacts` is the active UI path.
`POST /api/legacy/contacts` was introduced for a CSV import tool and was never decommissioned.
The legacy endpoint bypasses the main controller entirely and writes directly via a raw Sequelize
`bulkCreate` call with `ignoreDuplicates: true`.

**Impact:** Any import or integration pointing at the legacy path produces records that skip all
validation enforced on the main path. This is the primary source of email-less and format-inconsistent
contact records.

---

### 1.2 — Three Independent Company Upsert Paths [CRITICAL]

**Files:**
- `routes/companies.js:22` — `POST /api/companies` (UI path)
- `routes/sync.js:104` — `POST /api/sync/companies` (job-board sync)
- `controllers/placements.js:67` — inline company creation inside placement logic

A company record can be created through three separate code paths, each with different validation
and normalisation logic. The placement controller creates companies on-the-fly by name string match:

```js
// controllers/placements.js:67 — [SIMULATION]
let company = await Company.findOne({ where: { name: req.body.company_name } });
if (!company) {
  company = await Company.create({ name: req.body.company_name });
}
```

This lookup uses an exact case-sensitive string match. "ACME Corp" and "Acme Corp" produce two
separate company records.

---

### 1.3 — Conflicting PATCH / PUT Semantics on Contacts [HIGH]

**Files:**
- `routes/contacts.js:58` — `PATCH /api/contacts/:id`
- `routes/contacts.js:91` — `PUT /api/contacts/:id`

Both endpoints exist and are reachable. `PUT` performs a full replacement (overwrites all fields
with request body); `PATCH` performs a partial merge. No documentation distinguishes them.
Frontend components are split — older components use `PUT`, newer ones use `PATCH`. This creates
an inconsistency where some update actions silently blank out fields not included in the payload.

---

### 1.4 — No Endpoint for Contact Merge [MEDIUM]

No merge or deduplication endpoint exists. Duplicate resolution, when performed manually by
recruiters, is done by deleting one contact and re-attributing records to the surviving one via
ad-hoc SQL — a pattern that bypasses all ORM hooks and leaves orphaned records.

---

## 2. Constraint and Validation Audit

### 2.1 — Email Validated on Main Path Only [CRITICAL]

**Files:**
- `controllers/contacts.js:31` — validates `email` as required, format-checked via regex
- `routes/legacy.js:88` — no validation block present before `bulkCreate`

`email` is the primary deduplication key used by the nightly deduplication cron job. If a record
enters without an email, it will never be matched against existing records and will persist
indefinitely as a ghost contact.

---

### 2.2 — Phone Number Stored Without Normalisation [HIGH]

**Files:**
- `models/Contact.js:44` — field defined as `DataTypes.STRING`, no setter or Sequelize validator
- `crm-fe-project/src/forms/ContactForm.jsx:112` — Yup mask applied: `(###) ###-####`

Frontend enforces format; backend does not. Any write that does not originate from the UI
(imports, API integrations, direct backend calls) stores raw phone strings. Current DB state
contains at least four distinct phone formats for the same area codes.

---

### 2.3 — `industry` Tag Enforced Only on Frontend [HIGH]

**Files:**
- `crm-fe-project/src/forms/CompanyForm.jsx:78` — renders a controlled `<select>` with 14 industry options
- `models/Company.js:19` — field defined as `DataTypes.STRING` with no `validate.isIn` constraint
- `routes/sync.js:130` — sync path writes `industry` directly from external job-board payload without mapping

The sync path can write arbitrary strings. Known values in DB include `"staffing"`, `"Staffing"`,
`"STAFFING"`, `"temp-agency"`, and `null` for what should all be the same tag.

---

### 2.4 — No Database-Level Unique Constraint on Company Name [HIGH]

**Files:**
- `migrations/20210814_create_companies.js` — no `unique: true` on `name` column

Deduplication relies entirely on the application-level `findOne` before `create` pattern (see 1.2).
Under concurrent writes — e.g. two recruiters submitting a new company at the same moment, or the
sync job running concurrently with a UI submission — both `findOne` calls can return `null` and
both `create` calls will succeed, producing a duplicate.

---

### 2.5 — Inconsistent Soft-Delete Implementation [HIGH]

**Files:**
- `models/Company.js:8` — uses `paranoid: true` (Sequelize soft-delete via `deleted_at`)
- `models/Contact.js:12` — uses a boolean `is_active` field (no `paranoid`)
- `models/Job.js` — no deletion mechanism; relies on `status: 'closed'` field

Three different deletion patterns coexist. Queries across entities produce inconsistent results:
a `JOIN` between `contacts` and `companies` will correctly exclude soft-deleted companies (Sequelize
appends `WHERE deleted_at IS NULL`) but will include "deleted" contacts where `is_active = false`
unless the caller explicitly filters. Several existing query functions do not apply this filter.

---

## 3. Business Logic Audit

### 3.1 — Silent Company Creation Inside Placement Flow [CRITICAL]

Documented above in 1.2. The business impact is significant: every placement submitted for a
company whose name does not exactly match an existing record silently creates a new company with
no address, no industry tag, no branch attribution, and no linked contacts. These phantom companies
accumulate over time and are invisible to the duplicate detection cron job (which compares by email,
not company name).

---

### 3.2 — Retroactive Branch Re-attribution on Recruiter Transfer [CRITICAL]

**Files:**
- `models/Contact.js:67` — `branch_id` is stored as a denormalised foreign key resolved at creation time from `req.user.branch_id`
- No migration or re-attribution script found in codebase

When a recruiter is transferred between branches, their `branch_id` on the `users` table is updated.
However, all contacts they created retain the old `branch_id` because it was copied at insert time.
Contacts do not retain the originating recruiter's identity — only the branch. The result is that
after a transfer, a recruiter's historical pipeline appears to belong to a branch they no longer
work at, and their new branch's pipeline appears incomplete. Branch-level reporting is structurally
incorrect for any branch that has experienced staff movement.

---

### 3.3 — Duplicate Detection Runs Nightly Only [HIGH]

**Files:**
- `cron/deduplication.js` — scheduled via `node-cron`, runs at 02:00 daily
- No real-time duplicate check at insert time

There is a window of up to 24 hours during which duplicate records are live and active in the CRM.
Recruiters can interact with, tag, and build history on a record that will later be flagged as
a duplicate. When the cron job flags it, associated activity is not migrated to the surviving
record — it is simply orphaned.

---

### 3.4 — `updated_at` Not Reliably Maintained [HIGH]

**Files:**
- `scripts/bulk_import.js:203` — raw SQL: `INSERT INTO contacts (...) ON CONFLICT (email) DO UPDATE SET ...`
- `models/Contact.js` — `updatedAt` managed by Sequelize `beforeUpdate` hook

The bulk import script bypasses Sequelize and writes directly via `pg` client. Sequelize hooks
do not fire. Contacts updated via bulk import retain their original `created_at` as their
`updated_at`, making it impossible to determine when they were last modified. Any downstream
logic that relies on `updated_at` for change detection (incremental syncs, audit trails) will
silently produce stale results for bulk-imported records.

---

### 3.5 — No Transaction Wrapping on Placement Creation [HIGH]

**Files:**
- `controllers/placements.js:55–120`

Placement creation performs four sequential writes:
1. Create placement record
2. Update job `status` to `filled`
3. Update contact `status` to `placed`
4. Increment branch placement counter

No database transaction wraps these operations. If step 2, 3, or 4 throws an error, the placement
record from step 1 is persisted in a partial state. Current error handling logs the error and
returns a 500, but does not attempt a rollback. Partial placements have been observed in the DB
(placement records with jobs still marked `open`).

---

### 3.6 — `is_duplicate` Flag Set But Never Acted On Automatically [MEDIUM]

**Files:**
- `cron/deduplication.js:78` — sets `is_duplicate = true` on flagged records
- No endpoint, hook, or follow-up task observed that routes flagged records to review or auto-merges them

The flag is set and readable via the UI, but there is no workflow enforcing action. Flagged duplicates
can remain `is_duplicate = true` indefinitely while recruiters continue using them. The flag has
no functional consequence beyond being visible in the admin panel.

---

## 4. Open-Ended Findings

### 4.1 — Node.js Runtime at EOL [HIGH]

Node.js 16.x reached end-of-life in September 2023 and no longer receives security patches.
Continued operation on this runtime is a security and compliance risk. While this is not a
direct data-quality cause, it is relevant to the CRM-SOLVER engagement because the Solver agent
will need to introduce new code to a platform with unpatched vulnerabilities — and any new
dependencies will be pinned against an EOL ecosystem.

---

### 4.2 — No Structured Logging [MEDIUM]

`console.log` / `console.error` are the sole logging mechanism. There is no log correlation ID,
no severity level, and no machine-readable format. This makes it impossible to trace the sequence
of events that led to a specific data anomaly after the fact. The Interfacer (Phase 2) will need
a structured logging channel to write its correction events — this infrastructure does not exist.

---

### 4.3 — Sequelize Migrations in Inconsistent State [MEDIUM]

**Files:**
- `migrations/` — 23 migration files present; 4 contain inline comments reading `"run manually after deploy"` or `"skipped — applied by hand"`

The migration history is unreliable. It is not safe to assume that any environment (staging, production)
has the exact schema implied by the migration files. Schema verification against the live DB will be
required before the Solver writes any migration as part of Phase 3.

---

### 4.4 — Free-Text `job_title` Field With No Controlled Vocabulary [LOW]

**Files:**
- `models/Contact.js:51` — `job_title: DataTypes.STRING`

No enum, no taxonomy, no autocomplete normalisation. Current DB state contains `"Sr. Developer"`,
`"Senior Developer"`, `"Senior Dev"`, `"Senior Software Developer"` as distinct values for the
same role. This field is used in reporting and filtering — its noise degrades report accuracy.
This is low-severity for data integrity but warrants attention when the Interfacer is deployed,
as it is a high-value normalisation target.

---

## Severity Summary

| ID | Finding | Severity |
|---|---|---|
| 1.1 | Dual contact creation paths with divergent validation | `CRITICAL` |
| 1.2 | Three independent company upsert paths | `CRITICAL` |
| 2.1 | Email validation absent on legacy creation path | `CRITICAL` |
| 3.1 | Silent company creation inside placement flow | `CRITICAL` |
| 3.2 | Retroactive branch re-attribution on recruiter transfer | `CRITICAL` |
| 1.3 | Conflicting PUT/PATCH semantics on contact update | `HIGH` |
| 2.2 | Phone number stored without normalisation | `HIGH` |
| 2.3 | Industry tag enforced on frontend only | `HIGH` |
| 2.4 | No DB-level unique constraint on company name | `HIGH` |
| 2.5 | Inconsistent soft-delete implementation across models | `HIGH` |
| 3.3 | Duplicate detection runs nightly only (24h window) | `HIGH` |
| 3.4 | `updated_at` not maintained on bulk import path | `HIGH` |
| 3.5 | No transaction wrapping on placement creation | `HIGH` |
| 4.1 | Node.js runtime at EOL | `HIGH` |
| 1.4 | No merge/deduplication endpoint | `MEDIUM` |
| 3.6 | `is_duplicate` flag set but not acted upon | `MEDIUM` |
| 4.2 | No structured logging | `MEDIUM` |
| 4.3 | Sequelize migrations in inconsistent state | `MEDIUM` |
| 4.4 | Free-text `job_title` with no controlled vocabulary | `LOW` |

**Totals:** 5 CRITICAL · 9 HIGH · 4 MEDIUM · 1 LOW

---

## Recommendations

> All recommendations below are pending human approval. The Analyser does not initiate implementation.

1. **Decommission `POST /api/legacy/contacts`** — route all contact creation through the main
   validated path. If bulk import is needed, implement it as a validated batch endpoint in the
   main router. *(Phase 3 — Solver)*

2. **Centralise company upsert logic** — extract a single `findOrCreateCompany(name, options)`
   service function with normalisation (trim, lowercase comparison) and a DB-level unique constraint
   on a normalised name column. Remove inline company creation from the placement controller. *(Phase 3 — Solver)*

3. **Migrate phone and tag normalisation to the backend** — validation and format enforcement
   must not exist only on the frontend. Add Sequelize setters or service-layer normalisation
   for `phone`, `industry`, and `company_name` fields before any write. *(Phase 3 — Solver)*

4. **Add DB-level unique constraint on `companies.name`** (normalised form) — removes the race
   condition window in deduplication. *(Phase 3 — Solver, via migration)*

5. **Standardise the deletion pattern** — choose one approach (`paranoid` / `is_active` boolean /
   `status` field) and apply it consistently. Provide a migration to reconcile the existing divergence.
   *(Phase 3 — Solver)*

6. **Wrap placement creation in a database transaction** — four writes must either all succeed
   or all roll back. *(Phase 3 — Solver)*

7. **Implement a branch attribution history table** — rather than storing `branch_id` as a scalar
   on the contact, track attribution changes over time. This allows correct historical reporting
   after recruiter transfers without retroactively corrupting old records. *(Phase 3 — Solver)*

8. **Replace bulk import raw SQL with ORM-compliant batch path** — ensures `updated_at` and all
   model hooks fire correctly. *(Phase 3 — Solver)*

9. **Upgrade Node.js runtime** — move to the current LTS before Phase 3 work begins. *(Prerequisite)*

10. **Phase 2 prerequisite — structured logging** — the Interfacer deployment will require a
    structured log channel. Introduce a logging library (e.g. `pino`) before Phase 2. *(Phase 2 prep)*

---

## Open Questions

1. **Is the legacy import endpoint actively in use by any external integration?** If yes,
   decommissioning requires coordination with the client's integration partners before Phase 3.

2. **What is the intended deduplication authority — email or phone?** The current cron job
   uses email only. If phone is also a deduplication key, the strategy needs to be redefined.

3. **Is the `job_title` field ever used in external reporting or billing?** If yes, normalisation
   is higher priority than the LOW severity assigned here suggests.

4. **Which environments are running the inconsistently-applied migrations?** A schema audit
   against the live production DB is required before any Phase 3 migration is written.

5. **Has the client been made aware of the retroactive branch re-attribution issue?** This is
   a business-logic defect with significant reporting implications — it may require a targeted
   conversation with the COO before a fix is proposed.
