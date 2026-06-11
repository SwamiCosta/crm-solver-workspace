# Interfacer Server

CRM-SOLVER Phase 2 — Continuous Interceptor.

The Interfacer is a self-contained HTTP server that wraps an Anthropic LLM agent. It intercepts CRM data, detects quality issues, explains anomalies, and can apply corrections. It is deployed as a Docker container on client infrastructure.

---

## Directory Structure

```
server/
├── Dockerfile
├── package.json
├── .env.example
├── server.js                     ← Express entry point
├── ARCHITECTURE.md               ← System architecture reference (synced from root)
├── agents/
│   └── interfacer.md             ← Agent system prompt (self-contained)
├── context/
│   ├── assumptions.md            ← Engagement assumptions (synced from root)
│   ├── hitl-ramp.md              ← HITL ramp stages (synced from root)
│   ├── feedback-log.md           ← False positive log (persisted, updated at runtime)
│   └── findings/                 ← Phase 1 reports (synced from root)
│       ├── 2026-06-11_diagnoser_anomaly-report.md
│       ├── 2026-06-11_diagnoser_data-issues.md
│       └── 2026-06-11_analyser_root-cause-report.md
└── scripts/
    └── sync-docs.sh              ← Pre-build doc sync tool (engineering env only)
```

---

## Environment Variables

Copy `.env.example` to `.env` and fill in all values before building.

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | ✅ | Anthropic API key (client-owned in production) |
| `ANTHROPIC_MODEL` | No | Model ID. Default: `claude-sonnet-4-6` |
| `INTERFACER_MODE` | No | `suggest` (default) or `auto-correct` |
| `OPERATOR_AUTH_TOKEN` | ✅ | Token for protected endpoints. Use a strong random value. |
| `PORT` | No | Server port. Default: `3000` |
| `DB_HOST` | Conditional | Required for `/correct` with `execute: true` |
| `DB_PORT` | Conditional | Default: `5432` |
| `DB_NAME` | Conditional | |
| `DB_USER` | Conditional | Dedicated user — read+write, minimal permissions |
| `DB_PASSWORD` | Conditional | |
| `DB_SSL` | No | Set `true` for cloud databases |

---

## Syncing Documentation Before Build

Context files in `server/context/` are copies of root-level docs. Before rebuilding the image, sync them with:

```bash
# From repo root
bash server/scripts/sync-docs.sh

# Or from server/
npm run sync
```

This script requires the full repository to be present locally. It is a pre-build step — not part of the Docker image.

---

## Building and Running

```bash
# Sync docs first (requires full repo)
bash server/scripts/sync-docs.sh

# Build image (context = server/ only — portable)
docker build -t crm-solver-interfacer ./server

# Run with environment file
docker run --env-file .env -p 3000:3000 crm-solver-interfacer

# Or with explicit variables
docker run \
  -e ANTHROPIC_API_KEY=... \
  -e OPERATOR_AUTH_TOKEN=... \
  -e INTERFACER_MODE=suggest \
  -p 3000:3000 \
  crm-solver-interfacer
```

---

## API Reference

### `GET /health`
Returns server status, current mode, and model.

### `GET /mode`
Returns the current operating mode.

### `PATCH /mode` — operator only
Changes the operating mode. Requires `x-operator-auth` header.
```json
{ "mode": "suggest" }
```

### `POST /intercept`
BE integration endpoint. Receives a CRM payload and returns a cleaned version.
```json
{
  "endpoint": "POST /api/contacts",
  "payload": { "name": "John Doe", "phone": "5551234567" }
}
```

### `POST /analyze`
Interactive analysis. Explains why a record is dirty.
```json
{
  "data": { "industry": "staffing", "phone": "5551234567" },
  "question": "What is wrong with this record?"
}
```

### `POST /correct`
Proposes corrections. With `execute: true` and `x-operator-auth`, applies high-confidence corrections to the DB.
```json
{
  "data": { "phone": "5551234567" },
  "table": "contacts",
  "record_id": 1234,
  "execute": false
}
```

### `POST /feedback`
Reports a false positive. Recorded in `context/feedback-log.md` and applied immediately.
```json
{
  "field": "job_title",
  "original_value": "Lead Developer",
  "correction_rejected": "Senior Developer",
  "reason": "Lead and Senior are distinct roles at this company."
}
```

---

## HITL Ramp

The server starts in `suggest` mode. Graduation to `auto-correct` requires meeting Stage 1 criteria defined in `context/hitl-ramp.md`:
- Suggestion acceptance rate ≥ 85% over 2 weeks
- Zero confirmed false positives

Mode changes are applied at runtime via `PATCH /mode` — no restart required.

---

## Updating Context After Phase 1 Findings Change

1. Update the source document in the repo root (`docs/findings/`, `ARCHITECTURE.md`, etc.)
2. Run `bash server/scripts/sync-docs.sh` to copy the updated files into `server/context/`
3. Commit the synced copies in the same PR as the source document update
4. Rebuild and redeploy the Docker image
