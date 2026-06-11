# Diagnoser Anomaly Report

> **[SIMULATION]** This report is a simulated exercise. No real client database was accessed.
> The dataset described below is a fictional CRM database constructed to represent a plausible
> failure profile for a multi-branch commercial staffing firm. All record counts, identifiers,
> and field values are fabricated for training and validation purposes.
> This simulation is designed to be consistent with the Analyser's root cause report dated 2026-06-11.

---

**Date:** 2026-06-11
**Agent:** Diagnoser
**DB scope (simulated):** PostgreSQL 13 — `crm_production` schema
**Tables analysed:** `contacts`, `companies`, `jobs`, `placements`, `activities`, `branches`, `users`
**Phase:** 1 — Establish (read-only)

---

## Methodology

The Diagnoser applied the operating procedure defined in `agents/diagnoser.md`.

1. **Volume Analysis** — record counts and growth patterns per entity table
2. **Schema Analysis** — column definitions, constraints, index coverage, and structural gaps
3. **Batch Data Analysis** — records scanned in batches of 500 per SK-06; anomalies classified using SK-04
4. **Open-Ended Scan** — additional patterns not covered by the standard classification set

All queries executed as SELECT-only. No writes were performed. Full table scans were pre-approved for this simulation exercise; in a live engagement, Overseer approval would be obtained per SK-08 rule 2 before any unbounded scan.

**Batch log summary:**

| Table | Records | Batches run | Anomalies flagged |
|---|---|---|---|
| contacts | 28,450 | 57 | 14,892 |
| companies | 6,830 | 14 | 3,087 |
| jobs | 4,210 | 9 | 214 |
| placements | 3,756 | 8 | 111 |
| activities | 94,320 | 189 | 6,890 |
| branches | 8 | 1 | 0 |
| users | 47 | 1 | 0 |

**Total records scanned:** 137,621
**Total anomalies flagged:** 25,194

---

## 1. Volume Analysis

### 1.1 — Record Counts per Entity

| Entity | Table | Record Count |
|---|---|---|
| Contacts | `contacts` | 28,450 |
| Companies | `companies` | 6,830 |
| Jobs | `jobs` | 4,210 |
| Placements | `placements` | 3,756 |
| Activities | `activities` | 94,320 |
| Branches | `branches` | 8 |
| Users | `recruiters` | 47 |

### 1.2 — Volume Anomalies

**Finding V-01 — Company volume disproportionate to contact volume [HIGH]**
The ratio of contacts to companies is 4.2:1. For a staffing CRM where each company would typically
have multiple active contacts, this ratio is unusually low and consistent with a large number of
phantom or duplicate company records inflating the company count.

**Finding V-02 — High inactive company rate [MEDIUM]**
Of 6,830 company records, 1,650 (24.2%) have zero associated contacts. 136 of these were created
within the last 6 months and have no industry tag, no address, and no branch attribution — a
signature consistent with silent company creation inside the placement flow (Analyser finding 1.2
and 3.1).

**Finding V-03 — Placement count lower than expected relative to job volume [MEDIUM]**
4,210 jobs versus 3,756 placements gives a 0.89 fill ratio. However, 73 placement records exist
in a partial state (see CONFLICT section). Actual successful placement data may be undercounting
due to transaction failures.

---

## 2. Schema and Structure Analysis

### 2.1 — Missing Database Constraints

**Finding S-01 — No unique constraint on `companies.name` [CRITICAL]**
```sql
-- Simulated: \d companies
Table "public.companies"
 Column     | Type                   | Nullable | Default
------------+------------------------+----------+---------
 id         | integer                | not null | nextval(...)
 name       | character varying(255) | yes      |
 industry   | character varying(255) | yes      |
 address    | text                   | yes      |
 branch_id  | integer                | yes      |
 deleted_at | timestamp              | yes      |
 created_at | timestamp              | not null |
 updated_at | timestamp              | not null |

Indexes:
 "companies_pkey" PRIMARY KEY, btree (id)
 -- No unique index on name
```
Race-condition duplicate creation is structurally permitted. Consistent with Analyser finding 2.4.

**Finding S-02 — `contacts.email` is nullable with no unique constraint [CRITICAL]**
```sql
-- Simulated: \d contacts (excerpt)
 email  | character varying(255) | yes  |
```
The primary deduplication key accepts NULL and allows duplicate values at the DB level. Application
deduplication logic is the only guard — and it is bypassed by the legacy endpoint.

**Finding S-03 — `contacts.phone` stored as unconstrained VARCHAR [HIGH]**
No check constraint, no format enforcer, no normaliser. Any string is accepted.

**Finding S-04 — `companies.industry` stored as unconstrained VARCHAR [HIGH]**
Frontend controlled vocabulary (14 values) has no backing constraint at the database level.

**Finding S-05 — `contacts.branch_id` is a scalar foreign key with no history table [HIGH]**
There is no `contact_branch_history` table or equivalent. Branch attribution is a single mutable
value with no audit trail. Recruiter transfers retroactively corrupt historical attribution silently.
Consistent with Analyser finding 3.2.

**Finding S-06 — Inconsistent soft-delete implementation across tables [HIGH]**

| Table | Deletion mechanism |
|---|---|
| `companies` | `paranoid: true` — `deleted_at` timestamp |
| `contacts` | Boolean `is_active` column |
| `jobs` | `status` field (`'open'`, `'filled'`, `'closed'`) — no deletion column |

Cross-entity JOIN queries produce inconsistent results depending on which deletion pattern applies
to the joined table. Consistent with Analyser finding 2.5.

**Finding S-07 — No index on `contacts.company_id` [MEDIUM]**
`contacts.company_id` is the primary join key between contacts and companies. No index exists.
On a table of 28,450 records, any query joining contacts to companies performs a sequential scan.
Not a data integrity issue, but a performance risk for Phase 1 analysis queries and future
Interfacer lookups.

**Finding S-08 — No index on `activities.contact_id` [MEDIUM]**
Same pattern as S-07. 94,320 activity records joined to contacts without an index.

**Finding S-09 — `placements` has no transaction guard at the schema level [HIGH]**
No deferred constraint, no trigger, and no application-level transaction observed (Analyser 3.5).
The DB permits the partial state that results from a mid-write failure.

---

## 3. Data Analysis — Findings by SK-04 Anomaly Code

---

### 3.1 — DUP: Duplicate Records

**Finding D-01 — Duplicate company records: case and whitespace variants [CRITICAL]**

Pattern | Example | Count
---|---|---
Case variation | `"ACME Corp"` / `"Acme Corp"` / `"acme corp"` | 305 company pairs
Trailing whitespace | `"Allied Staffing "` / `"Allied Staffing"` | 127 company pairs
Suffix variant | `"Tech Solutions Inc"` / `"Tech Solutions"` / `"Tech Solutions LLC"` | 212 company pairs
Phantom (no metadata) | Created via placement flow, no contacts/industry/address | 136 company records

**Total estimated duplicate company records: ~780 (11.4% of company table)**

The phantom company pattern is the most damaging operationally: these records are invisible to
the nightly deduplication cron (which deduplicates contacts by email, not companies by name) and
accumulate indefinitely.

**Finding D-02 — Duplicate contact records: same email, multiple IDs [CRITICAL]**

| Duplicate pattern | Count |
|---|---|
| Exact email match, distinct IDs | 1,320 contact pairs (2,640 records) |
| `is_duplicate = true`, unmerged, still active | 820 records |

**Total estimated duplicate contact records: ~2,140 (7.5% of contact table)**

The 820 records flagged by the cron job with `is_duplicate = true` are still fully active in the
system. There is no downstream enforcement. Consistent with Analyser finding 3.6.

---

### 3.2 — BLANK: Missing Critical Fields

**Finding B-01 — Contacts without email [CRITICAL]**

```
contacts with email IS NULL: 2,274 records (8.0%)
```
These records are permanently invisible to the deduplication cron job. They entered via the
legacy endpoint (`POST /api/legacy/contacts`) which skips email validation. Consistent with
Analyser findings 1.1 and 2.1.

**Finding B-02 — Contacts without company association [HIGH]**

```
contacts with company_id IS NULL: 1,380 records (4.9%)
```
A contact with no company is effectively a dead record in a B2B staffing CRM. It cannot be
attributed to an account, it breaks pipeline reporting, and it will be skipped by any
account-level analytics query.

**Finding B-03 — Contacts without phone [MEDIUM]**

```
contacts with phone IS NULL or phone = '': 4,890 records (17.2%)
```
High-value for the Interfacer's normalisation pass in Phase 2, but lower severity than B-01/B-02
as phone is not a deduplication key.

**Finding B-04 — Jobs without branch attribution [MEDIUM]**

```
jobs with branch_id IS NULL: 127 records (3.0%)
```
Branch-level job pipeline reporting is incorrect for these records.

**Finding B-05 — Companies with no industry tag [HIGH]**

```
companies with industry IS NULL: 1,020 records (14.9%)
```
Includes the 136 phantom companies (V-02) plus legitimate records where the industry was never
populated. Industry is used in reporting and is a target field for the Interfacer.

---

### 3.3 — FORMAT: Format Inconsistencies

**Finding F-01 — Phone number format distribution [HIGH]**

```
-- Simulated query: GROUP BY phone_format_pattern
Format                   | Count  | % of records with phone
-------------------------|--------|--------------------------
(555) 123-4567           | 9,600  | 41.0%
5551234567               | 6,560  | 28.0%
555-123-4567             | 4,450  | 19.0%
+1 555 123 4567          | 1,870  |  8.0%
Other / unrecognised     |   940  |  4.0%
```
Of the 23,560 contacts with a non-null phone value, 13,820 (58.7%) do not use the frontend's
enforced format `(555) 123-4567`. These records entered via non-UI paths (imports, API, legacy
endpoint). Consistent with Analyser finding 2.2.

**Finding F-02 — Email format irregularities on legacy-path records [HIGH]**

Among the 2,274 BLANK contacts flagged in B-01, 318 have an email value but in a format that
would fail the main path's regex validator (e.g. `"john.doe"`, `"@company.com"`, `" user@test.com"`
with a leading space). The legacy `bulkCreate` with `ignoreDuplicates: true` accepted these values.
Some of these records will collide with legitimate records on a future dedup pass.

**Finding F-03 — Date field stored as VARCHAR in `activities.due_date` [MEDIUM]**

```
activities with due_date NOT matching ISO-8601 pattern: 7,840 records (8.3%)
```
Values observed include: `"ASAP"`, `"TBD"`, `"end of month"`, `"23/06/2025"` (DD/MM format
vs the application's expected MM/DD). This column was likely free-text at some point in the
application's history. It cannot be reliably cast to a date type without a migration.

---

### 3.4 — TAG: Incorrect or Missing Tags

**Finding T-01 — Industry field out-of-vocabulary values [HIGH]**

The frontend `<select>` enforces 14 controlled industry values. The database contains 97 distinct
values.

```
-- Simulated sample of out-of-vocabulary values (companies table)
"staffing"  /  "Staffing"  /  "STAFFING"  /  "temp-agency"  /  "Temp Agency"
"logistics" /  "Logistics" /  "LOGISTICS" /  "Transport & Logistics"
"IT"  /  "it"  /  "information technology"  /  "Information Technology Services"
"Healthcare / Pharma"  /  "health"  /  "medical"
```

**Total companies with out-of-vocabulary industry tag: 1,840 records (26.9%)**

These values entered via `POST /api/sync/companies` (Analyser finding 2.3), which writes the
external job board's raw `industry` string without mapping it to the controlled vocabulary.

**Finding T-02 — `job_title` free-text fragmentation on contacts [LOW]**

Sample of values observed for the same canonical role:

```
"Sr. Developer" / "Senior Developer" / "Senior Dev" / "Senior Software Developer"
"Snr. Developer" / "Sr Developer" / "Lead Developer" / "Sr. Software Dev"
```

**Distinct `job_title` values: 1,247 across 28,450 contacts.**
This field is used in recruiter search and filtering. Its noise degrades matching quality.
Consistent with Analyser finding 4.4.

---

### 3.5 — CONFLICT: Conflicting Values Across Records

**Finding C-01 — Contact branch attribution mismatch [CRITICAL]**

For each contact, the current `branch_id` was compared against the branch of the recruiter
who created the record (via `contacts.created_by` → `users.branch_id`). When a recruiter has
since transferred branches, the contact's branch attribution no longer reflects any meaningful
ownership.

```
contacts where contacts.branch_id != original_recruiter_current_branch_id: 3,120 records (11.0%)
```

This is the data-layer manifestation of Analyser finding 3.2. Branch-level pipeline reporting
is structurally incorrect for all 8 branches that have experienced recruiter movement.

**Finding C-02 — Contacts active against soft-deleted companies [HIGH]**

```
contacts with is_active = true AND company_id references a company
where deleted_at IS NOT NULL: 480 records (1.7%)
```

A contact marked active is linked to a company the system considers deleted. These contacts
appear in recruiter search results but their company record is invisible — creating a confusing
experience and potentially silently excluding them from account-level queries.

**Finding C-03 — Partial placement records (transaction failure artifacts) [HIGH]**

```
placements where status = 'placed' AND
linked job status != 'filled': 73 records
```

Placement records exist, but the corresponding job was never updated to `filled`. This is
consistent with multi-step write failures described in Analyser finding 3.5. These 73 records
represent placements that were logged but whose context is corrupted — the job appears still open,
the contact's status may not have been updated, and the branch counter may be incorrect.

---

### 3.6 — ORPHAN: Records Referencing Deleted Parents

**Finding O-01 — Contacts referencing soft-deleted companies [HIGH]**

```
contacts with company_id referencing companies where deleted_at IS NOT NULL: 1,240 records (4.4%)
```

Distinct from C-02 (which flags *active* contacts only). This includes both active and inactive
contacts. These records will break or produce unexpected results in any query that JOINs contacts
to companies without explicitly including soft-deleted companies.

**Finding O-02 — Activities referencing inactive contacts [HIGH]**

```
activities with contact_id referencing contacts where is_active = false: 6,890 records (7.3%)
```

6,890 activity records — nearly 8% of the activity table — are attached to contacts the system
considers inactive. This is the direct consequence of the deduplication cron flagging a contact
without migrating its associated activity (Analyser finding 3.3). This activity data is
functionally lost from the recruiter's perspective.

**Finding O-03 — Partial placements with no linked contact [HIGH]**

```
placements with contact_id referencing contacts where is_active = false
OR contact_id = NULL: 38 records
```

These placements have no live contact. They cannot be attributed to a recruiter's active pipeline
and represent incomplete transaction artifacts (Analyser finding 3.5).

---

## 4. Open-Ended Findings

**Finding X-01 — `updated_at` identical to `created_at` on suspected bulk-import records [HIGH]**

```
contacts where updated_at = created_at AND created_at < '2024-01-01': 8,730 records (30.7%)
```

Records last modified before 2024 where `updated_at` has never changed suggest the Sequelize
`beforeUpdate` hook never fired on these records — consistent with the raw SQL bulk import
path described in Analyser finding 3.4. These records are invisible to any incremental sync or
change-detection logic that uses `updated_at` as a watermark.

**Finding X-02 — `updated_at` predates `created_at` on 14 contact records [CRITICAL]**

```
contacts where updated_at < created_at: 14 records
```

Timestamps are logically impossible. These records are evidence of data corruption, likely from
a manual intervention or a poorly-written import script at some point in the database's history.
The root cause is not determinable without further investigation, but these records should be
flagged for manual review.

**Finding X-03 — `is_duplicate = true` records remain fully active [MEDIUM]**

```
contacts with is_duplicate = true AND is_active = true: 820 records
```

Previously noted in D-02 in the context of duplicate counting. Flagged separately here because
it is an operational risk: 820 contacts that the system's own cron job has identified as
duplicates are still reachable by recruiters, still receiving activity, and will grow stale
relative to their surviving counterparts. Consistent with Analyser finding 3.6.

**Finding X-04 — No referential integrity constraint between `placements` and `jobs` [HIGH]**

```
-- Simulated: \d placements (excerpt)
 job_id | integer | yes |
-- No FOREIGN KEY constraint declared
```

`placements.job_id` is a bare integer with no FK constraint. 12 placement records reference
`job_id` values that do not exist in the `jobs` table. This likely results from jobs being
deleted directly without cleaning up linked placements.

---

## 5. Severity Summary

| ID | Finding | Anomaly Code | Severity | Volume Estimate |
|---|---|---|---|---|
| S-01 | No unique constraint on `companies.name` | — (schema) | `CRITICAL` | Structural |
| S-02 | `contacts.email` nullable, no unique constraint | — (schema) | `CRITICAL` | Structural |
| D-01 | Duplicate company records | `DUP` | `CRITICAL` | ~780 records (11.4%) |
| D-02 | Duplicate contact records | `DUP` | `CRITICAL` | ~2,140 records (7.5%) |
| B-01 | Contacts without email | `BLANK` | `CRITICAL` | 2,274 records (8.0%) |
| C-01 | Contact branch attribution mismatch | `CONFLICT` | `CRITICAL` | 3,120 records (11.0%) |
| X-02 | `updated_at` predates `created_at` | `OTHER` | `CRITICAL` | 14 records |
| S-03 | Phone stored as unconstrained VARCHAR | — (schema) | `HIGH` | Structural |
| S-04 | Industry stored as unconstrained VARCHAR | — (schema) | `HIGH` | Structural |
| S-05 | No branch attribution history table | — (schema) | `HIGH` | Structural |
| S-06 | Inconsistent soft-delete across tables | — (schema) | `HIGH` | Structural |
| S-09 | No transaction guard on placements | — (schema) | `HIGH` | Structural |
| V-01 | Company volume disproportionate | — (volume) | `HIGH` | 6,830 companies |
| B-02 | Contacts without company association | `BLANK` | `HIGH` | 1,380 records (4.9%) |
| B-05 | Companies without industry tag | `BLANK` | `HIGH` | 1,020 records (14.9%) |
| F-01 | Phone format inconsistencies | `FORMAT` | `HIGH` | 13,820 records (58.7% of phone-bearing) |
| F-02 | Invalid email format on legacy-path records | `FORMAT` | `HIGH` | 318 records |
| T-01 | Industry out-of-vocabulary values | `TAG` | `HIGH` | 1,840 records (26.9%) |
| C-02 | Active contacts against soft-deleted companies | `CONFLICT` | `HIGH` | 480 records (1.7%) |
| C-03 | Partial placement records | `CONFLICT` | `HIGH` | 73 records |
| O-01 | Contacts referencing soft-deleted companies | `ORPHAN` | `HIGH` | 1,240 records (4.4%) |
| O-02 | Activities referencing inactive contacts | `ORPHAN` | `HIGH` | 6,890 records (7.3%) |
| O-03 | Partial placements with no linked contact | `ORPHAN` | `HIGH` | 38 records |
| X-01 | `updated_at` = `created_at` (bulk import) | `OTHER` | `HIGH` | 8,730 records (30.7%) |
| X-04 | No FK constraint on `placements.job_id` | `OTHER` | `HIGH` | 12 records |
| S-07 | No index on `contacts.company_id` | — (schema) | `MEDIUM` | Structural |
| S-08 | No index on `activities.contact_id` | — (schema) | `MEDIUM` | Structural |
| V-02 | High inactive company rate | — (volume) | `MEDIUM` | 1,650 records (24.2%) |
| V-03 | Partial placement count anomaly | — (volume) | `MEDIUM` | 73 records |
| B-03 | Contacts without phone | `BLANK` | `MEDIUM` | 4,890 records (17.2%) |
| B-04 | Jobs without branch attribution | `BLANK` | `MEDIUM` | 127 records (3.0%) |
| F-03 | Date stored as VARCHAR in `activities.due_date` | `FORMAT` | `MEDIUM` | 7,840 records (8.3%) |
| X-03 | `is_duplicate = true` records still active | `OTHER` | `MEDIUM` | 820 records |
| T-02 | `job_title` free-text fragmentation | `TAG` | `LOW` | 1,247 distinct values |

**Totals:** 7 CRITICAL · 18 HIGH · 7 MEDIUM · 1 LOW

---

## 6. Recommendations

> All recommendations below are pending human approval. The Diagnoser does not initiate implementation.

1. **Add DB-level unique constraint on `companies.name`** (normalised form) — removes the
   structural precondition for race-condition duplicate creation. Required before Phase 3 code fixes.

2. **Add NOT NULL + UNIQUE constraint on `contacts.email`** — requires first resolving 2,274
   null-email records (B-01). Until then, constraint cannot be applied without data cleanup.

3. **Investigate and resolve 14 timestamp-corrupted records (X-02)** — these are evidence of
   historical data corruption and must be manually reviewed before any bulk migration (Phase 4).

4. **Merge or archive 780 duplicate company records (D-01)** — prioritise phantom companies
   first (136 records), as these have no attached data and can be safely removed after
   confirming no active placements reference them.

5. **Deactivate or merge 820 `is_duplicate = true` contacts (X-03)** — these are already
   flagged by the system's own cron job. Leaving them active grows the orphaned activity count daily.

6. **Add indexes on `contacts.company_id` and `activities.contact_id` (S-07, S-08)** — low-risk,
   high-impact. Can be applied as concurrent index builds with zero downtime.

7. **Migrate `activities.due_date` from VARCHAR to proper date column (F-03)** — requires
   agreeing on a handling strategy for the 7,840 non-parseable values before migration.

8. **Add FK constraint on `placements.job_id` (X-04)** — 12 orphaned records must be resolved
   before the constraint can be applied.

---

## 7. Open Questions

1. **Is the legacy import endpoint (`POST /api/legacy/contacts`) actively in use?** 2,274
   null-email contacts exist, but the rate of new arrivals is unknown without a date-range
   query. Knowing whether this endpoint is still being called is critical to assessing ongoing
   risk vs. historical artifact.

2. **What is the intended merge strategy for duplicate contacts?** 820 records are flagged
   `is_duplicate = true` but no merge workflow exists. Before Phase 4, the client must confirm:
   which record is the "survivor" when merging, and what happens to the orphaned activity?

3. **Which branches have experienced recruiter transfers?** The 3,120 branch-mismatch contacts
   (C-01) span all 8 branches, but the severity is not uniform. Knowing which branches are most
   affected helps prioritise the Phase 4 re-attribution work.

4. **Can the `activities.due_date` VARCHAR values be parsed deterministically?** If 7,840
   records contain arbitrary strings like `"ASAP"`, a migration strategy must be agreed with
   the client before any Phase 4 data work touches this column.

5. **Are the 73 partial placement records (C-03) recoverable?** The placement record exists but
   the job/contact state is incorrect. A human review is needed to determine which of these
   represent real placements that can be reconstructed vs. ones that should be voided.

6. **What is the client's tolerance for downtime during index creation?** Findings S-07 and S-08
   recommend adding indexes. `CREATE INDEX CONCURRENTLY` on PostgreSQL 13 is non-blocking but
   carries some I/O overhead — client confirmation of acceptable maintenance windows is needed.
