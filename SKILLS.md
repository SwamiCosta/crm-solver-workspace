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

## SK-07 — Client Communication Format

**Applies to:** Overseer  
**Trigger:** When preparing updates or decisions for client-facing communication

Client-facing documents must:
- Avoid technical jargon unless the audience is confirmed technical
- Lead with business impact before technical detail
- Always present options with trade-offs rather than a single recommendation (unless one option is clearly dominant)
- Flag assumptions explicitly
- End with a clear question or decision required from the client
