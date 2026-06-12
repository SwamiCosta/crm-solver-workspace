# SKILLS.md — Shared Agent Skills

This file defines reusable skills available to all agents in the CRM-SOLVER workspace.  
Agents should reference these skills rather than re-deriving behaviour from scratch.  
Specialised skills for individual agents are defined in their respective `.md` files under `/agents/`.

---

## SK-01 — Git Hygiene

**Applies to:** All agents  
**Trigger:** Before any analysis or development task

Steps:
1. Navigate to the target sub-project directory
2. Run `git status` to verify there are no unexpected local changes
3. Run `git pull` to fetch the latest state from remote
4. Confirm the branch you are on before proceeding
5. Never work on `main` or `master` directly — always on a feature branch

---

## SK-02 — Pull Request Creation

**Applies to:** Overseer, Solver, Fixer  
**Trigger:** When submitting any code or documentation change

A valid PR must include:
- **Title:** `[PHASE-X] Short description of change` (e.g. `[PHASE-3] Add normalisation endpoint for company names`)
- **Description:** What changed, why it changed, and what task/ticket it addresses
- **Test evidence:** For code changes, a description of how the change was tested or verified
- **Review request:** Always tag Overseer for first-pass review
- **Labels:** Phase label + one of: `code`, `documentation`, `migration`, `config`

---

## SK-03 — Report Generation

**Applies to:** Diagnoser, Analyser, Overseer  
**Trigger:** When producing findings for human review

A valid report must include:
- **Date and agent name** in the header
- **Scope:** What was analysed (tables, code modules, date range, sample size)
- **Methodology:** How the analysis was performed
- **Findings:** Structured list of anomalies or issues, each with:
  - Severity: `CRITICAL` / `HIGH` / `MEDIUM` / `LOW`
  - Description
  - Volume estimate (how many records/occurrences affected)
  - Evidence (example records or code snippets — anonymised if needed)
- **Recommendations:** Proposed next steps, clearly labelled as suggestions pending human approval
- **Open questions:** Anything the agent could not determine and needs human input on

Reports are saved to `/docs/findings/` with filename format: `YYYY-MM-DD_agent-name_report-title.md`

---

## SK-04 — Anomaly Classification

**Applies to:** Diagnoser, Interfacer  
**Trigger:** When evaluating a data record for quality

Classify each anomaly by type:

| Code | Type | Example |
|---|---|---|
| `DUP` | Duplicate record | Two company entries for "Acme Corp" and "Acme Corporation" |
| `BLANK` | Missing critical field | Contact record with no company attribution |
| `FORMAT` | Format inconsistency | Phone stored as `5551234567` vs `(555) 123-4567` |
| `TAG` | Incorrect or missing tag | Account tagged as "Retail" when industry is "Logistics" |
| `CONFLICT` | Conflicting values across records | Same company with two different HQ addresses |
| `ORPHAN` | Record referencing a deleted parent | Contact linked to a company ID that no longer exists |

---

## SK-05 — Confidence Scoring

**Applies to:** Interfacer, Fixer  
**Trigger:** When proposing a data correction

Every proposed correction must carry a confidence score before being submitted for human review:

| Score | Meaning | Action |
|---|---|---|
| `HIGH (>90%)` | Near-certain correction | Can be batched for expedited human review |
| `MEDIUM (60–90%)` | Probable correction | Requires individual human review |
| `LOW (<60%)` | Uncertain — do not auto-suggest | Flag for manual investigation |

Low-confidence records are never included in correction batches. They are reported separately as requiring human investigation.

---

## SK-06 — Batch Processing

**Applies to:** Fixer, Diagnoser  
**Trigger:** When processing large volumes of records

Rules for batch operations:
1. Default batch size: 500 records per run (adjustable based on client DB performance)
2. Always run a `SELECT` preview of the batch before any write operation
3. Generate a batch report for human approval before executing writes
4. Schedule heavy jobs during off-peak hours (to be confirmed with client)
5. Maintain a batch log with: batch ID, timestamp, record count, operation type, status

---

## SK-08 — Query Safety

**Applies to:** Diagnoser, Fixer  
**Trigger:** Before executing any database query

Rules:
1. **Never execute an unbounded query.** Every SELECT must include at least one of: a WHERE clause, or an explicit row-count constraint (LIMIT, TOP, ROWNUM, FETCH FIRST N ROWS ONLY). Full table scans without a predicate or row limit are prohibited.
2. If a full scan is genuinely required for a specific analysis step, stop and obtain Overseer approval before running it.
3. When in doubt about query cost, run EXPLAIN / EXPLAIN ANALYZE first and review the estimated row count before executing.

---

## SK-07 — Client Communication Format

**Applies to:** Overseer  
**Trigger:** When preparing updates or decisions for client-facing communication

Client-facing documents must:
- Avoid technical jargon unless the audience is confirmed technical
- Lead with business impact before technical detail
- Always present options with trade-offs rather than a single recommendation (unless one option is clearly dominant)
- Flag assumptions explicitly
- End with a clear question or decision required from the client

---

## SK-09 — Inter-Agent Communication Closure

**Applies to:** All agents
**Trigger:** When an agent completes a task that was assigned by another agent or the human operator

Rules:
1. Every task has exactly one originating caller (human operator or another agent)
2. When a task is complete, the completing agent must notify the originating caller — not just the next agent in the chain
3. If a completing agent delegates a sub-task (e.g. Analyser delegates PR creation to Overseer), it must await confirmation from the delegate before notifying its own caller
4. Notifications must include: what was completed, any output artefacts (file paths, PR URLs), and whether any open questions require the caller's attention
5. An agent must never consider a task "done" until the communication loop back to the original caller is closed

---

## SK-10 — Incremental Versioning and Legacy Preservation

**Applies to:** Solver, Fixer
**Trigger:** When implementing or migrating to the V2 data model

This skill defines the shared contract between the Solver (which creates V2 code) and the Fixer (which migrates data into V2 tables). Both agents must follow it precisely to ensure the two phases remain compatible.

### Table naming
- New tables are named `<entity>_new` (e.g. `contacts_new`, `companies_new`, `jobs_new`, `placements_new`)
- Original tables are never renamed, altered (structurally), or dropped until Phase 5

### Migration flag columns (added by Solver migration, read/updated by Fixer)
Each legacy table receives two additive columns via Sequelize migration:
- `migrated BOOLEAN DEFAULT FALSE` — set to `TRUE` by Fixer when the record is copied to `_new`
- `migrated_at TIMESTAMPTZ` — set to `NOW()` by Fixer at migration time

These columns must never be written by any V2 endpoint or any agent other than the Fixer.

### Endpoint versioning
- New API endpoints are versioned: `/api/v2/<entity>`
- Legacy endpoints (`/api/<entity>`, `/api/legacy/<entity>`) remain active and untouched until Phase 5
- V2 endpoints write exclusively to `_new` tables
- Legacy endpoints continue to write to legacy tables until the V2 cutover milestone is confirmed

### Unified service layer
- A dedicated service module (e.g. `services/contactsService.js`) is the only component that queries both `_new` and legacy tables
- Read queries in this service filter out legacy rows where `migrated = TRUE` to avoid duplicates
- Route handlers (both legacy and V2) call this service — they never query tables directly
- This dual-read pattern remains active until Phase 4 is complete and all records are migrated

### V2 cutover milestone
The cutover milestone is reached when:
1. All legacy write flows have been replaced by V2 equivalents (verified by Solver)
2. No application path writes new records to legacy tables

When this milestone is reached, the Solver documents it in `docs/findings/YYYY-MM-DD_solver_v2-cutover.md`. This file is the Fixer's prerequisite to begin data migration.

### Deprecation documentation
Every legacy file that a new V2 file supersedes must be referenced in the PR description as deprecated. The legacy file itself is never modified — deprecation is documented in the PR, not in the code.

---

## SK-11 — Audit Logging

**Applies to:** Interfacer, Solver, Fixer
**Trigger:** On every Interfacer operation (Phase 2), every V2 endpoint response (Solver, Phase 3), and every DB write operation (Fixer, Phase 4)

### `audit_log` table schema
Created in Phase 2 as part of the Interfacer deployment — see `server/migrations/001_create_audit_log.sql`. Lives in the same database as the CRM data (see assumption A-11). The table already exists by the time Phase 3 (Solver) and Phase 4 (Fixer) begin their work.

```sql
CREATE TABLE audit_log (
  id            SERIAL PRIMARY KEY,
  timestamp     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  action        VARCHAR(100) NOT NULL,
  entity        VARCHAR(100),
  entity_id     INTEGER,
  initiated_by  VARCHAR(255) NOT NULL,
  authorized_by VARCHAR(255),
  details       JSONB
);
```

| Column | Purpose |
|---|---|
| `action` | Short description of the operation (e.g. `create_contact_v2`, `migrate_batch`, `correct_phone`) |
| `entity` | Table or resource involved (e.g. `contacts`, `companies`) |
| `entity_id` | Primary key of the affected record, if applicable |
| `initiated_by` | Who triggered the operation — recruiter ID, agent name, or system process name |
| `authorized_by` | Who authorised the operation — operator name for write actions, `null` for reads |
| `details` | Arbitrary JSON for operation-specific context (old value, new value, batch ID, finding ID, etc.) |

### AuditService contract
The Interfacer delivers the first implementation of `auditLog()` as a server-side helper in `server/server.js` (Phase 2). The Solver delivers a reusable `services/auditService.js` in the first V2 PR (Phase 3) — using the same `audit_log` table. All Solver endpoints and Fixer scripts call this service:

```javascript
// Pseudocode — follow client's existing service conventions
await AuditService.log({
  action: 'create_contact_v2',
  entity: 'contacts',
  entity_id: newRecord.id,
  initiated_by: req.user?.id ?? 'system',
  authorized_by: req.headers['x-operator-auth'] ? 'operator' : null,
  details: { source: 'POST /api/v2/contacts', payload_keys: Object.keys(body) }
});
```

### Failure behaviour
- If the `AuditService.log()` call fails, the enclosing operation must be aborted or rolled back
- An audit failure is never silently swallowed — it must propagate as an error
- This rule applies equally to Solver endpoint handlers and Fixer migration transactions

### Append-only guarantee
- No `UPDATE` or `DELETE` is ever issued against `audit_log`
- No agent, endpoint, or migration script may modify an existing audit row
- Any attempt to do so must be treated as a constraint violation and escalated to the Overseer
