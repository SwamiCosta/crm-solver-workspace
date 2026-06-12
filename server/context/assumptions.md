# Assumptions

This document is a living log of assumptions made during the CRM-SOLVER engagement.

It serves two purposes:
- **For agents (especially Overseer):** source of truth about what is assumed vs. confirmed. Decisions made under an assumption must be revisited if that assumption is refuted.
- **For stakeholders:** demonstrates that ambiguity was handled deliberately and transparently, not ignored.

**Overseer responsibility:** When an assumption is validated or refuted by new information (client feedback, Phase 1 findings, UAT results), open a PR updating its status and noting the impact on any prior decisions.

---

## Status Legend

| Status | Meaning |
|---|---|
| `OPEN` | Not yet validated. Decisions made under this assumption may need revisiting. |
| `CONFIRMED` | Validated by client or findings. Decisions stand. |
| `REFUTED` | Proven incorrect. Decisions made under this assumption must be reviewed. |
| `SUPERSEDED` | Replaced by a more specific assumption or confirmed fact. |

---

## Assumptions Log

---

### A-01 — CRM Platform
**Status:** `OPEN`  
**Assumption:** The client CRM may be a custom-built system or a standard platform (Bullhorn, Salesforce, HubSpot, or other). The agent architecture and governance layer are platform-agnostic by design.  
**Impact if refuted:** Tool implementations in the Interfacer server layer will need to be adapted to the confirmed platform's API constraints and authentication model. Rate-limit strategies may also need revision.  
**Validated by:** Phase 1 — Analyser findings / client confirmation  

---

### A-02 — Database Access
**Status:** `OPEN`  
**Assumption:** The client can provide read-only database credentials for the Diagnoser with minimal permissions (SELECT only, scoped to relevant tables). No write access is required for Phase 1.  
**Impact if refuted:** If read-only access cannot be granted, the Diagnoser's analysis will be limited to what can be inferred from the CRM API alone, reducing diagnostic fidelity. Phase 1 timeline would be affected.  
**Validated by:** Pre-Phase 1 client onboarding  

---

### A-03 — Existing Cloud Infrastructure
**Status:** `OPEN`  
**Assumption:** The client has an existing cloud infrastructure provider (AWS, Azure, GCP, or equivalent) where the Interfacer container can be hosted. Alternatively, an on-premise server environment is available.  
**Impact if refuted:** If no hosting environment exists, we would need to provision one — adding cost, setup time, and a new vendor relationship to the engagement scope.  
**Validated by:** Pre-Phase 2 infrastructure review  

---

### A-04 — Backend Codebase Access
**Status:** `OPEN`  
**Assumption:** The Analyser can be granted read access to the client's backend codebase (via Git repository or direct file access). The codebase is primarily server-side logic interfacing with the CRM.  
**Impact if refuted:** If codebase access is restricted, the Analyser cannot perform root-cause analysis at the code level. Phase 1 findings would be limited to data patterns only, and Phase 3 (Stop the Bleeding) would require more extensive client collaboration to identify fix locations.  
**Validated by:** Phase 1 — Analyser setup  

---

### A-05 — Recruiter Friction Tolerance
**Status:** `OPEN`  
**Assumption:** Recruiters will tolerate a brief inline suggestion (a single notification or accept/ignore prompt) without significant resistance, provided it does not block their workflow or require more than one click.  
**Impact if refuted:** If even minimal UI changes cause recruiter pushback, the HITL ramp would need to stay in Stage 0 (observe only) longer, and the Interfacer's suggest mode would need to be redesigned to be even less visible.  
**Validated by:** Phase 2 — Stage 1 acceptance rate metrics  

---

### A-06 — Data Volume
**Status:** `OPEN`  
**Assumption:** The CRM database contains tens to hundreds of thousands of records (not millions). Batch processing at 500 records per run is assumed to be performant without impacting system availability.  
**Impact if refuted:** If data volume is significantly higher, batch sizes and scheduling strategy will need to be revised. Phase 4 timeline estimates would increase proportionally.  
**Validated by:** Phase 1 — Diagnoser volume analysis  

---

### A-07 — Version Control Platform
**Status:** `OPEN`  
**Assumption:** The client has an existing GitHub or GitLab instance that can be used for the PR-based governance workflow. No new version control platform needs to be introduced.  
**Impact if refuted:** If no VCS exists, we recommend GitHub (free tier sufficient). This adds a minor onboarding step but does not affect architecture.  
**Validated by:** Pre-Phase 1 client onboarding  

---

### A-08 — UAT Environment
**Status:** `OPEN`  
**Assumption:** The client can support a UAT environment (staging or local) with either an anonymised production data clone or a synthetic dataset built from known problem examples. Full details in `/docs/uat-strategy.md`.  
**Impact if refuted:** If no UAT environment is feasible, validation before production deployment becomes significantly riskier. This would require a more conservative HITL ramp and extended suggest-only period in Phase 2.  
**Validated by:** Pre-Phase 2 UAT strategy agreement  

---

### A-09 — Anthropic API Key Ownership
**Status:** `OPEN`  
**Assumption:** The client will provision and own the Anthropic API key used by the Interfacer in production. Token costs are the client's operational expense, not ours.  
**Impact if refuted:** If the client expects us to absorb API costs, this significantly changes the commercial model of the engagement and must be renegotiated before Phase 2 deployment.  
**Validated by:** Pre-Phase 2 commercial agreement  

---

### A-10 — English as Working Language
**Status:** `OPEN`  
**Assumption:** All system outputs (code, documentation, reports, PR descriptions) are in English, regardless of the operator's input language. The client operates in an environment where English is acceptable as the technical working language.  
**Impact if refuted:** Agent `.md` files and CLAUDE.md would need to be updated to specify the correct output language. No architectural changes required.  
**Validated by:** Pre-engagement confirmation  

---

### A-12 — Pre-Purge Backup Storage
**Status:** `OPEN`  
**Assumption:** Pre-purge DB backups (generated by the Fixer at V2 cutover and by the Purger before Phase 5 begins) are stored as SQL dump files on a local or network file system accessible to the operator running the dump. No cloud backup service (S3, Azure Blob, GCS, etc.) is provisioned or required for this engagement. The storage location, retention policy, and access controls are the client's responsibility.  
**Impact if refuted:** If the client requires backups to be stored in a specific location (cloud bucket, dedicated backup server, encrypted vault), the `pg_dump` command in the Fixer and Purger agents must be amended with the appropriate storage target and any required credentials or tooling. The backup content and timing are unaffected.  
**Validated by:** Pre-Phase 5 infrastructure review with client

---

### A-11 — Audit Log Co-located in CRM Database
**Status:** `OPEN`  
**Assumption:** The `audit_log` table (created in Phase 2, see `server/migrations/001_create_audit_log.sql`) resides in the same PostgreSQL database as the CRM data (`crm_production`). No separate audit database or schema is provisioned. The table is shared across all phases: Interfacer (Phase 2), Solver V2 endpoints (Phase 3), and Fixer migrations (Phase 4).  
**Impact if refuted:** If the client requires audit data isolation (e.g. for compliance reasons), the `audit_log` table would need to move to a dedicated schema or a separate database. This would require changes to the Interfacer's `auditLog()` helper and the Solver's `AuditService` (connection pool). The `audit_log` schema itself (columns, constraints) would not change.  
**Validated by:** Phase 2 — infrastructure review with client  
