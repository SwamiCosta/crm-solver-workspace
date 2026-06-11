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

`[TO BE FILLED — PHASE 1]`

*Populated by Analyser. Will document code-level causes of data inconsistency.*

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
