# Diagnoser Data Issues Log

> **[SIMULATION]** All record identifiers, names, and field values in this file are entirely
> fictional. No real client data was accessed. This log is a simulated exercise to validate the
> Diagnoser's output format before live engagement.

---

**Date:** 2026-06-11
**Agent:** Diagnoser
**Phase:** 1 — Establish (read-only)

This file is a flat log of specific problematic records and patterns identified during the
anomaly scan. One entry per finding. No corrections are made or suggested here — flagging only.

---

## DUP — Duplicate Records

---

**DUP-001**
- **Table:** `companies`
- **Records:** `id = 114`, `id = 892`, `id = 3041`
- **Description:** Three company records for the same entity at different case normalisation:
  `"ACME Corp"` (id=114, created 2021-03-08), `"Acme Corp"` (id=892, created 2022-11-14),
  `"acme corp"` (id=3041, created 2024-06-02). All three have active contacts attached.
  `id=3041` appears to be a phantom created via the placement flow — no industry, no address.
- **Severity:** CRITICAL

---

**DUP-002**
- **Table:** `companies`
- **Records:** `id = 237`, `id = 1508`
- **Description:** `"Allied Staffing "` (id=237, trailing space) vs `"Allied Staffing"` (id=1508).
  The application-level `findOne({ where: { name: req.body.company_name } })` treats these as
  distinct. 14 contacts are attributed to id=237, 31 contacts to id=1508.
- **Severity:** CRITICAL

---

**DUP-003**
- **Table:** `companies`
- **Records:** `id = 445`, `id = 2890`, `id = 4102`
- **Description:** `"Tech Solutions Inc"` / `"Tech Solutions"` / `"Tech Solutions LLC"` —
  three suffix variants. 2 placements reference id=445, 1 references id=4102. id=2890 has no
  placements and no contacts — phantom from placement flow.
- **Severity:** CRITICAL

---

**DUP-004**
- **Table:** `contacts`
- **Records:** `id = 1042`, `id = 7830`
- **Description:** Both records share email `"j.harris@techsolutions.com"`. id=1042 created
  2022-05-17 via main path, id=7830 created 2023-09-04 via legacy endpoint (`POST /api/legacy/contacts`).
  id=7830 has `is_duplicate = true` set by cron job but remains `is_active = true`. 23 activity
  records are attached to id=7830 — these will be orphaned if id=7830 is deactivated without migration.
- **Severity:** CRITICAL

---

**DUP-005**
- **Table:** `contacts`
- **Records:** `id = 3312`, `id = 3313`, `id = 3314`
- **Description:** Three records created within 4 seconds of each other (2024-01-15 14:32:07,
  14:32:09, 14:32:11) with the same name `"Maria Ferreira"` and same phone. Emails are blank on
  all three. Likely a triple-submission from a slow UI or a retry on timeout. Cannot be
  deduplicated by cron (no email). Requires manual review.
- **Severity:** CRITICAL

---

**DUP-006**
- **Table:** `contacts`
- **Records:** `id = 5501`, `id = 12487`
- **Description:** Same email `"r.santos@globallogistics.com"`, different phone formats:
  id=5501 has `"(416) 555-9012"`, id=12487 has `"4165559012"`. id=12487 is flagged
  `is_duplicate = true` but has 8 associated activities not present on id=5501.
- **Severity:** HIGH

---

## BLANK — Missing Critical Fields

---

**BLANK-001**
- **Table:** `contacts`
- **Records:** `id` range 18200–18450 (251 consecutive records)
- **Description:** Consecutive batch of 251 contacts with `email = NULL`. All share
  `created_at` of `2024-03-22`, consistent with a single bulk import via the legacy endpoint.
  All have `phone` populated but in raw format (`5551234567` pattern). No branch attribution
  on 38 of these records.
- **Severity:** CRITICAL

---

**BLANK-002**
- **Table:** `contacts`
- **Records:** `id = 4483`, `id = 4490`, `id = 4512` (sample from 1,380 total)
- **Description:** Contacts with `company_id = NULL`. id=4483 has 5 placement records
  referencing it — a placed candidate with no company attribution. Pipeline reporting excludes
  this candidate from all account-level views.
- **Severity:** HIGH

---

**BLANK-003**
- **Table:** `companies`
- **Records:** `id` range 6700–6830 (130 records, tail of table)
- **Description:** 130 most recently created company records all have `industry = NULL`,
  `address = NULL`, and `branch_id = NULL`. Created within the last 90 days. Consistent
  with phantom company creation inside the placement flow for recently submitted placements.
- **Severity:** HIGH

---

**BLANK-004**
- **Table:** `jobs`
- **Records:** `id = 308`, `id = 512`, `id = 917` (sample from 127 total)
- **Description:** Jobs with `branch_id = NULL`. These jobs appear in global search results
  and can attract recruiter attention but produce NULL in all branch-level pipeline reports.
- **Severity:** MEDIUM

---

## FORMAT — Format Inconsistencies

---

**FORMAT-001**
- **Table:** `contacts`
- **Records:** `id = 2201`, `id = 2202`, `id = 2203` (three records, same batch)
- **Description:** Phone values: `"14165551234"` (E.164 without `+`), `"(416) 555-1234"`,
  `"416-555-1234"`. All three contacts are in the same branch and share the same company,
  suggesting they were entered by different recruiters with no format guidance.
- **Severity:** HIGH

---

**FORMAT-002**
- **Table:** `contacts`
- **Records:** `id = 7821`, `id = 7822` (from legacy batch import)
- **Description:** id=7821 has `email = "@globaltransport.com"` (missing local part).
  id=7822 has `email = "mark.chen "` (trailing space, no domain). Both values passed the legacy
  endpoint's absent validation. Both records have `is_duplicate = false` despite being
  effectively uncontactable.
- **Severity:** HIGH

---

**FORMAT-003**
- **Table:** `activities`
- **Records:** `id = 44021`, `id = 44890`, `id = 62301` (sample from 7,840 total)
- **Description:** `due_date` values: `"ASAP"`, `"end of month"`, `"23/06/2025"` (DD/MM
  instead of MM/DD). A `CAST(due_date AS DATE)` operation would fail on all three.
  Any calendar feature, filter, or scheduled report relying on this column produces
  incorrect results for 8.3% of activities.
- **Severity:** MEDIUM

---

## TAG — Incorrect or Missing Tags

---

**TAG-001**
- **Table:** `companies`
- **Records:** `id = 501`, `id = 883`, `id = 1204`, `id = 2771`
- **Description:** Four company records for what should be the same industry classification,
  with industry values respectively: `"LOGISTICS"`, `"logistics"`, `"Transport & Logistics"`,
  `"transportation logistics"`. The UI displays them in four separate filter buckets,
  fragmenting segment reporting.
- **Severity:** HIGH

---

**TAG-002**
- **Table:** `companies`
- **Records:** `id = 3318`, `id = 3490`
- **Description:** `"temp-agency"` and `"Temp Agency"` — neither matches any value in the
  frontend controlled vocabulary. Both were written by `POST /api/sync/companies`. The
  correct vocabulary value is `"Staffing & Recruiting"`.
- **Severity:** HIGH

---

**TAG-003**
- **Table:** `contacts`
- **Records:** (sample — 1,247 distinct `job_title` values across table)
- **Description:** Sample of canonical role fragmented across distinct strings:
  `"Sr. Developer"`, `"Senior Developer"`, `"Senior Dev"`, `"Snr. Developer"`,
  `"Lead Developer"`, `"Sr Developer"` — at least 6 variants for one role.
  Recruiter search for `"Senior Developer"` misses records with the other 5 spellings.
- **Severity:** LOW

---

## CONFLICT — Conflicting Values Across Records

---

**CONFLICT-001**
- **Table:** `contacts`
- **Records:** `id = 1104`, `id = 2340`, `id = 5017` (sample from 3,120 total)
- **Description:** Branch attribution conflict due to recruiter transfer.
  - id=1104: `branch_id = 3` (Downtown). Created by recruiter `user_id = 12`,
    who is currently on `branch_id = 7` (Midtown). Contact was created at the recruiter's
    previous branch and now appears in the wrong branch's pipeline.
  - This pattern repeats across 3,120 contacts attributed to recruiters who have since moved.
- **Severity:** CRITICAL

---

**CONFLICT-002**
- **Table:** `contacts`, `companies`
- **Records:** Contact `id = 9812` → Company `id = 330` (deleted_at = `2024-08-14`)
- **Description:** Contact is `is_active = true`, linked to a company the system considers
  deleted. Contact appears in recruiter search results. Clicking through to the company record
  returns nothing — the company is invisible to the application's default queries.
- **Severity:** HIGH

---

**CONFLICT-003**
- **Table:** `placements`, `jobs`
- **Records:** Placement `id = 1882` → Job `id = 740` (status = `'open'`)
- **Description:** Placement record exists with `status = 'placed'` but linked job is
  still `status = 'open'`. Step 2 of the placement creation transaction (update job status)
  failed and was not rolled back. The placement record is live; the job appears unfilled.
  This placement is being counted in fill-rate metrics but the job is simultaneously counted
  as open. Double-counting confirmed.
- **Severity:** HIGH

---

## ORPHAN — Records Referencing Deleted Parents

---

**ORPHAN-001**
- **Tables:** `contacts`, `companies`
- **Records:** Contact `id = 6601` → Company `id = 88` (deleted_at = `2023-11-02`)
- **Description:** Contact is active and has 14 associated activities. Company was soft-deleted
  18 months ago. Any query joining contacts to companies (Sequelize default: `WHERE deleted_at IS NULL`)
  will silently exclude this contact's company context. The contact is visible in isolation but
  appears to have no company affiliation in any JOIN-based report.
- **Severity:** HIGH

---

**ORPHAN-002**
- **Tables:** `activities`, `contacts`
- **Records:** Activities `id = 81042`, `id = 81043`, `id = 81044` → Contact `id = 14870`
  (is_active = false, is_duplicate = true)
- **Description:** 3 of 6,890 orphaned activity records. Contact id=14870 was flagged as a
  duplicate by the cron job on 2025-08-19. All 3 activities were logged *after* the flag was
  set — recruiters continued working the record for 4 weeks after it was marked duplicate.
  These activities are permanently disconnected from the surviving record.
- **Severity:** HIGH

---

**ORPHAN-003**
- **Tables:** `placements`, `contacts`
- **Records:** Placement `id = 2914` — `contact_id = NULL`
- **Description:** Placement record with no associated contact. Step 1 of placement creation
  (create placement) succeeded; the contact it referenced was subsequently deactivated/merged.
  No FK constraint exists to prevent this state. This placement cannot be attributed to any
  active candidate.
- **Severity:** HIGH

---

**ORPHAN-004**
- **Tables:** `placements`, `jobs`
- **Records:** Placements `id = 3001`, `id = 3048`, `id = 3099` — `job_id` values do not
  exist in `jobs` table
- **Description:** Three placements referencing job IDs that have been hard-deleted from the
  system. No FK constraint on `placements.job_id` allowed this state. These placements are
  unattributable to any job — they inflate global placement counts but cannot be filtered by
  job, branch, or recruiter via job-based queries.
- **Severity:** HIGH

---

## OTHER — Findings Outside Standard Classification

---

**OTHER-001**
- **Table:** `contacts`
- **Records:** `id = 102`, `id = 103` ... (8,730 records total where updated_at = created_at
  AND created_at < 2024-01-01)
- **Description:** Records that have never had their `updated_at` updated despite being
  imported before 2024. Sequelize's `beforeUpdate` hook never fired because these records
  were written via raw SQL (`scripts/bulk_import.js`). Any incremental sync using
  `updated_at > last_sync_watermark` will permanently skip these records.
- **Severity:** HIGH

---

**OTHER-002**
- **Table:** `contacts`
- **Records:** `id = 19044`, `id = 22198`, `id = 23001` (sample from 14 total)
- **Description:** Logically impossible timestamps: `updated_at` is 2–72 hours *before*
  `created_at`. These records indicate a data corruption event (likely a manual SQL
  intervention or a broken import script that set incorrect timestamps). Cannot be
  self-healed — require manual review to determine correct dates.
- **Severity:** CRITICAL

---

**OTHER-003**
- **Table:** `contacts`
- **Records:** `id = 7240`, `id = 9812`, `id = 11502` (sample from 820 total)
- **Description:** Contacts with `is_duplicate = true` AND `is_active = true`. These records
  are flagged by the cron job but remain fully accessible to recruiters. id=9812 has had
  7 new activities logged against it in the last 30 days *after* being flagged. The `is_duplicate`
  flag has no enforcement mechanism.
- **Severity:** MEDIUM
