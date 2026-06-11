# Build vs. Buy Justification

This document records technology decisions for the CRM-SOLVER system, defended on the axes of cost, latency, control, and vendor lock-in avoidance.

---

## Decision Framework

For each component, we ask four questions:
1. **Cost** — Does building cost more in engineering time than buying saves in licence fees?
2. **Latency** — Does an off-the-shelf solution meet our response time requirements?
3. **Control** — Do we need custom logic that a SaaS product cannot accommodate?
4. **Lock-in** — Does adopting this solution make it prohibitively expensive to switch later?

---

## Decisions

### LLM Provider — **Buy (Anthropic API)**

| Axis | Verdict |
|---|---|
| Cost | Training or fine-tuning a model is orders of magnitude more expensive than API calls for this use case |
| Latency | API latency is acceptable for all agent operations (none are real-time user-facing at sub-100ms) |
| Control | Prompt engineering + system prompt context gives sufficient control for hygiene tasks |
| Lock-in | Moderate risk. Mitigated by keeping all agent logic in `.md` files that are model-agnostic — switching providers requires updating API calls only, not redesigning agent behaviour |

**Verdict: Buy.** The Anthropic API is the correct choice. Agent intelligence is in the prompts, not the model weights.

---

### Agent Orchestration — **Build (Claude Code + `.md` files)**

| Axis | Verdict |
|---|---|
| Cost | Zero infrastructure cost for internal agents. No SaaS orchestration licence needed |
| Latency | Not applicable — internal agents are not latency-sensitive |
| Control | Full control over agent behaviour, permissions, and escalation logic |
| Lock-in | None. `.md` files are plain text. The system can be ported to any Claude-compatible interface |

**Verdict: Build.** Agent orchestration via Claude Code and markdown files is the right approach. It is portable, version-controlled, and requires no additional tooling.

---

### Interfacer API Wrapper — **Build (lightweight server, Docker)**

| Axis | Verdict |
|---|---|
| Cost | A minimal HTTP server is trivial to build and costs nothing to run beyond hosting |
| Latency | A custom server adds negligible latency vs. a SaaS middleware layer |
| Control | We need precise control over how payloads are structured, how the system prompt is assembled, and how responses are returned to the client's existing API |
| Lock-in | SaaS middleware (e.g. MuleSoft, Zapier) would create dependency and cost without adding value |

**Verdict: Build.** The Interfacer wrapper is a thin layer. Its value is in the agent logic (the `.md` file and findings context), not the server itself.

---

### Duplicate Detection — **Build (LLM-powered via Interfacer/Diagnoser)**

| Axis | Verdict |
|---|---|
| Cost | Dedicated deduplication SaaS (e.g. Dedupely, RingLead) costs per-record and per-merge. LLM-based detection via existing API contract costs less at Trailhead's likely data volume |
| Latency | Batch deduplication (Diagnoser) is not latency-sensitive. Real-time deduplication (Interfacer) needs to be fast enough for data entry flows — acceptable with streaming |
| Control | Off-the-shelf deduplication tools use fixed matching algorithms. Our use case requires contextual judgement (e.g. "Acme Corp" vs "Acme Corporation" are duplicates; "Acme Logistics" vs "Acme Staffing" are not). LLM handles this better |
| Lock-in | SaaS deduplication tools lock data processing into their platform. Our approach keeps logic in-house |

**Verdict: Build.** LLM-powered deduplication gives better contextual accuracy than rule-based SaaS tools for a staffing CRM context.

---

### Database Access — **Buy (existing client DB driver)**

No custom database layer is needed. The Diagnoser and Fixer connect directly to the client's existing database using standard drivers (JDBC for Java environments, or equivalent). No additional tooling is purchased.

---

### Version Control & PR Workflow — **Buy (GitHub / GitLab — client's existing platform)**

The PR-based governance workflow uses whatever version control platform the client already operates. No new tooling is introduced. If the client has no existing platform, GitHub is the default recommendation (free tier sufficient for this use case).

---

### Hosting (Interfacer container) — **Buy (client's existing cloud provider)**

The Interfacer is containerised and deployed to the client's existing cloud infrastructure. We do not introduce a new cloud provider. This minimises cost (no additional account), maintains data residency compliance, and avoids a new vendor relationship.

---

## Summary Table

| Component | Decision | Rationale |
|---|---|---|
| LLM | Buy (Anthropic API) | Cost, speed to market, sufficient control via prompting |
| Agent orchestration | Build (Claude Code + `.md`) | Zero cost, full control, zero lock-in |
| Interfacer server | Build (Docker) | Thin layer, custom payload handling needed |
| Duplicate detection | Build (LLM-powered) | Contextual accuracy over rule-based SaaS |
| DB access | Buy (existing driver) | No new tooling needed |
| Version control | Buy (existing platform) | Use what client already has |
| Container hosting | Buy (existing cloud) | Data residency, cost, simplicity |
