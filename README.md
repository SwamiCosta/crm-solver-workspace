# CRM-SOLVER
### AI-Powered CRM Data Hygiene System
**Client:** Trailhead Staffing — Multi-branch commercial staffing  
**Engagement type:** Embedded build (parachute)  
**Primary function:** Operations / Data Quality

---

## The Problem

Trailhead Staffing's central CRM is the operational spine of the business — and it's compromised. Duplicate company records, missing contact information, mis-tagged accounts, and blank critical fields have stalled several downstream AI and analytics initiatives. The root cause is not a single bug but a systemic lack of data governance: inconsistent recruiter input, no enforced field standards, and no continuous correction mechanism.

> *"Half our problems come back to dirty data. Clean it up and keep it clean — automatically — so everything else we want to build can actually work."*  
> — Chief Operating Officer, Trailhead Staffing

---

## The Solution

CRM-SOLVER is a multi-agent AI system designed to diagnose, intercept, correct, and permanently resolve CRM data quality issues — without disrupting existing workflows or requiring heavy manual intervention from recruiters.

The system operates in five sequential phases, each building on the last:

| Phase | Name | Goal |
|---|---|---|
| 1 | **Establish** | Diagnose root causes in code and data |
| 2 | **Continuous Interceptor** | Stop new dirty data at the entry point |
| 3 | **Stop the Bleeding** | Fix the code that causes the problem |
| 4 | **Historical Fix** | Migrate and clean legacy dirty data |
| 5 | **Purge** | Remove legacy references and finalize |

The system is designed so that **each phase delivers standalone value**. The client may choose to stop at any phase. However, stopping at Phase 2 carries significant ongoing token cost implications — see [Cost Considerations](#cost-considerations) below.

---

## MVP Definition

The **Minimum Viable Product** is the successful completion of **Phase 1: Establish** plus the deployment of the **Interfacer in suggest mode** with at least one active integration (Phase 2, Stage 0–1).

Phase 1 alone — producing findings and a problem dossier — does not deliver sufficient standalone value to qualify as an MVP. The MVP requires that the system also intervenes in the live recruiter workflow, even if only in a non-destructive, advisory capacity.

Concretely, the MVP delivers:

**Phase 1 — Establish:**
- The **Diagnoser** agent has run against a representative sample of the CRM database and produced a structured anomaly report
- The **Analyser** agent has read the CRM backend codebase and produced a root-cause report identifying code-level sources of inconsistency
- Both reports have been reviewed and validated with the client
- The `ARCHITECTURE.md` document has been populated with findings
- A prioritised dossier of problems and recommended treatments has been approved by a human stakeholder

**Phase 2 — Continuous Interceptor (suggest mode):**
- The **Interfacer** is deployed to client infrastructure and is processing live CRM write operations
- At least one data correction type (e.g. phone normalisation, duplicate contact suggestion) is active in **suggest mode** — returning suggested values alongside original values without blocking recruiter workflow
- At least one recruiter has received and acted on (accepted or ignored) a suggestion in production
- Suggestion acceptance rate is being tracked

**Success criteria:**
- Diagnoser identifies at least the top 3 categories of data anomaly with volume estimates
- Analyser maps at least one code path that produces inconsistent data
- Client confirms the findings reflect their real operational experience
- Interfacer is running stably in production in suggest mode with zero confirmed false positives in the first week

The Phase 1 component of the MVP is deliberately read-only and non-destructive. The Phase 2 component writes no data — it returns suggestions only. No records are modified until the HITL Stage 1 graduation criteria are met (see `docs/hitl-ramp.md`).

---

## Agent Hierarchy

```
Overseer  (architect, reviewer, coordinator)
├── Diagnoser     (read-only DB analysis)
├── Analyser      (read-only code analysis)
├── Interfacer    (data hygiene interceptor — deployed to client infra)
├── Solver        (code fix agent — Phase 3)
└── Fixer         (data migration agent — Phase 4)
```

Each agent is defined by a `.md` file in the `/agents` directory. Agents are invoked via Claude Code or, in the case of the Interfacer, via the deployed API wrapper on client infrastructure.

Full agent specifications: [`/agents/`](./agents/)  
Governance rules: [`CLAUDE.md`](./CLAUDE.md)  
Shared skill definitions: [`SKILLS.md`](./SKILLS.md)

---

## Repository Structure

```
crm-solver/
├── README.md               ← This file. Executive overview.
├── CLAUDE.md               ← Agent governance rules (mandatory reading for all agents)
├── SKILLS.md               ← Shared skill definitions across agents
├── ARCHITECTURE.md         ← System architecture (populated during Phase 1)
│
├── agents/
│   ├── overseer.md
│   ├── diagnoser.md
│   ├── analyser.md
│   ├── interfacer.md
│   ├── solver.md
│   └── fixer.md
│
├── server/                 ← API wrapper for Interfacer deployment
│   ├── README.md
│   └── Dockerfile
│
└── docs/
    ├── phases.md           ← Detailed phase plan
    ├── build-vs-buy.md     ← Technology decision log
    ├── hitl-ramp.md        ← Human-in-the-loop escalation plan
    ├── uat-strategy.md     ← UAT options for client
    └── findings/           ← Reports generated by Diagnoser and Analyser
```

---

## Cost Considerations

The system is designed with token cost in mind. The cost/quality/time triangle for this client indicates a **quality problem being solved with budget** — meaning cost efficiency is a constraint, not an afterthought.

- **Phases 1, 3, 4, 5** involve agents running in controlled, infrequent sessions. Token cost is bounded and predictable.
- **Phase 2 (Interfacer in production)** intercepts every CRM input and output in real time. This is the only phase with unbounded, recurring token cost tied directly to recruiter activity volume.

**Recommendation:** Present the full five-phase plan to the client. Phase 2 is a powerful safety net, but Phases 3–5 are the permanent fix. A client who stops at Phase 2 trades a one-time engineering cost for an indefinite operational token bill. The recommendation is always to complete the full cycle.

---

## Deployment

Internal agents (Overseer, Diagnoser, Analyser, Solver, Fixer) run locally via Claude Code and require no deployment infrastructure.

The Interfacer is the only agent that requires deployment to client infrastructure. It is packaged as a Docker container and deployed to the client's existing cloud environment (AWS, Azure, GCP, or on-premise). The Anthropic API key and database credentials are injected as environment variables — never stored in this repository.

Full deployment guide: [`/server/README.md`](./server/README.md)

---

## Assumptions

The authoritative assumptions log is maintained in [`/docs/assumptions.md`](./docs/assumptions.md).  
It tracks all 12 engagement assumptions with statuses (`OPEN` / `CONFIRMED` / `REFUTED` / `SUPERSEDED`), impact descriptions, and validation owners. The Overseer is responsible for keeping that document current.
