# Interfacer Server

CRM-SOLVER Phase 2 — Continuous Interceptor.

The Interfacer is a self-contained HTTP server that wraps an Anthropic LLM agent. It intercepts CRM data, detects quality issues, explains anomalies, and can apply corrections. It is deployed as a Docker container on client infrastructure.

Two interaction modes are available:
- **Chat UI** — browser-based interface for operators. Accepts free-text in any language. No API knowledge required.
- **HTTP API** — for direct integration with the client's backend or for testing via tools such as Postman.

---

## Directory Structure

```
server/
├── Dockerfile
├── Dockerfile.stub               ← Stub image for testing without an API key
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
├── public/
│   └── index.html                ← Operator chat UI (served at GET /)
├── scripts/
│   └── sync-docs.sh              ← Pre-build doc sync tool (engineering env only)
└── crm-solver-interfacer.postman_collection.json   ← Postman test collection
```

---

## Environment Variables

Copy `.env.example` to `.env` and fill in all values before building.

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | ✅ | Anthropic API key (client-owned in production) |
| `ANTHROPIC_MODEL` | No | Model ID. Default: `claude-sonnet-4-6` |
| `INTERFACER_MODE` | No | `suggest` (default) or `auto-correct` |
| `OPERATOR_AUTH_TOKEN` | ✅ | Token for protected operations. Use a strong random value in production. |
| `PORT` | No | Server port. Default: `3000` |
| `DB_HOST` | Conditional | Required for `/correct` with `execute: true` |
| `DB_PORT` | Conditional | Default: `5432` |
| `DB_NAME` | Conditional | |
| `DB_USER` | Conditional | Dedicated user — read+write, minimal permissions |
| `DB_PASSWORD` | Conditional | |
| `DB_SSL` | No | Set `true` for cloud databases |

---

## Building and Running

### Production image (requires Anthropic API key)

```bash
# Sync docs first (requires full repo)
bash server/scripts/sync-docs.sh

# Build image (context = server/ only — portable)
docker build -t crm-solver-interfacer ./server

# Run with environment file
docker run --env-file server/.env -p 3000:3000 crm-solver-interfacer
```

### Stub image (for testing — no API key required)

The stub replaces Anthropic API calls with hardcoded responses that match the exact response format. All server logic, routing, authentication, and payload handling is identical to the production image.

```bash
# Build stub image
docker build -f server/Dockerfile.stub -t crm-solver-interfacer-stub ./server

# Run stub
docker run --env-file server/.env -p 3000:3000 crm-solver-interfacer-stub
```

The stub `.env` requires only:
```
ANTHROPIC_API_KEY=stub-not-used
OPERATOR_AUTH_TOKEN=test-token-local
PORT=3000
INTERFACER_MODE=suggest
```

Once running, open `http://localhost:3000` in a browser.

---

## Using the Chat UI

The chat UI is the primary interface for client operators. It is served at `GET /` and requires no installation — open a browser and navigate to the server address.

### Layout

| Element | Description |
|---|---|
| **CS badge** (top left) | CRM-SOLVER logo |
| **Mode badge** (top left) | Current operating mode — `suggest` (blue) or `auto-correct` (green). Updates automatically. |
| **Operator token** (top right) | Password field for protected operations. Fill in once — sent automatically with every message. |
| **Chat area** | Conversation history. Bot messages show an operation badge and a collapsible raw result. |
| **Input field** | Free-text input. Press Enter to send, Shift+Enter for a new line. |

### What you can type

The Interfacer accepts free-text in any language and responds in English. Examples:

| Intent | Example input |
|---|---|
| Analyse a record | `What is wrong with this record? phone: 5551234567, industry: staffing` |
| Request corrections | `Fix the phone 5551234567 and industry staffing for contact 1234` |
| Register a false positive | `That correction for job_title was wrong — Lead Developer is a distinct role here` |
| Change mode to auto-correct | `Switch to auto-correct mode` *(operator token required)* |
| Switch back to suggest | `Go back to suggest mode` *(operator token required)* |
| Input in Portuguese | `O que está errado com esse registro? telefone: 5551234567` |

### Operator token

The token is only required for operations that change system behaviour or write to the database:
- Changing the operating mode
- Executing DB corrections (`/correct` with `execute: true`)

For read-only operations (analysis, proposed corrections, feedback) the token field can be left empty.

In the stub environment, the token is `test-token-local`.

### Operation badges

Each bot response shows a badge indicating which operation was executed:

| Badge | Colour | Meaning |
|---|---|---|
| `analyze` | Blue | Record was analysed for quality issues |
| `correct` | Amber | Corrections were proposed or applied |
| `intercept` | Purple | A payload was intercepted and cleaned |
| `mode_change` | Green | Operating mode was changed |
| `feedback` | Grey | False positive was registered |
| `clarify` | Yellow | More information is needed to proceed |
| `error` | Red | Server or connection error |

Click **Show raw result** below any bot message to see the full structured JSON returned by the operation.

---

## Testing with Postman

A ready-to-import collection is included at `server/crm-solver-interfacer.postman_collection.json`.

### Import

1. Open Postman → **Import**
2. Select `server/crm-solver-interfacer.postman_collection.json`
3. The collection **"CRM-SOLVER Interfacer"** appears with 6 folders

The variables `base_url` (`http://localhost:3000`) and `operator_token` (`test-token-local`) are embedded in the collection. No environment setup required.

### Folders and what to test

| Folder | What to verify |
|---|---|
| **1 — Health & Mode** | Server up, mode read, mode change with and without auth |
| **2 — Intercept** | Suggest mode response vs auto-correct mode response — structure differs |
| **3 — Analyze** | `manual_resolution_available` flag, issue list with severity and confidence |
| **4 — Correct** | Propose-only (no auth), execute without auth → 401, execute with auth + no DB → 503 |
| **5 — Ask** | Conversational dispatch: analyze, correct, mode change, Portuguese input, auth boundary |
| **6 — Feedback** | False positive recorded, missing fields → 400 |

### Suggested run order for a full smoke test

1. `GET /health` — confirm server is up
2. `POST /ask — analyse a record` — verify conversational routing
3. `POST /ask — input in Portuguese` — verify language handling
4. `POST /ask — switch to auto-correct (with token)` — verify mode change
5. `GET /mode` — confirm mode switched
6. `POST /intercept — auto-correct mode` — verify auto-correct response structure
7. `POST /correct — execute: true, NO auth → 401` — verify auth guard
8. `POST /correct — execute: true, WITH auth, no DB → 503` — verify DB guard
9. `POST /feedback` — register a false positive
10. `PATCH /mode → suggest` — restore default mode

---

## API Reference

### `GET /`
Serves the operator chat UI. Open in a browser after starting the server.

### `GET /health`
Returns server status, current mode, model, and DB connection state.

### `GET /mode`
Returns the current operating mode.

### `PATCH /mode` — operator only
Changes the operating mode. Requires `x-operator-auth` header.
```json
{ "mode": "suggest" }
```

### `POST /ask` — primary operator interface
Conversational dispatcher. Accepts free-text in any language, identifies the intent, and routes to the correct operation internally. This is the recommended interface for client operators.
```json
{
  "message": "What is wrong with this phone number: 5551234567",
  "operator_token": "optional — required for mode changes and DB writes"
}
```
Response:
```json
{
  "response": "Natural language explanation in English.",
  "operation": "analyze",
  "result": {}
}
```

### `POST /intercept` — BE integration
Receives a CRM write payload and returns a cleaned version. Intended for backend integration — called automatically before the payload is persisted.
```json
{
  "endpoint": "POST /api/contacts",
  "payload": { "name": "John Doe", "phone": "5551234567" }
}
```

### `POST /analyze`
Analyses a record and explains quality issues. Returns `manual_resolution_available` when a simple SQL fix applies.
```json
{
  "data": { "industry": "staffing", "phone": "5551234567" },
  "question": "What is wrong with this record?"
}
```

### `POST /correct`
Proposes corrections. With `execute: true` and `x-operator-auth`, applies high-confidence corrections (> 0.90) directly to the database.
```json
{
  "data": { "phone": "5551234567" },
  "table": "contacts",
  "record_id": 1234,
  "execute": false
}
```

### `POST /feedback`
Records a false positive in `context/feedback-log.md`. Applied to the Interfacer context on the next request.
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

Mode changes are applied at runtime — no restart required. Via UI: type a mode change request with the operator token filled in. Via API: `PATCH /mode` with `x-operator-auth` header.

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

## Updating Context After Phase 1 Findings Change

1. Update the source document in the repo root (`docs/findings/`, `ARCHITECTURE.md`, etc.)
2. Run `bash server/scripts/sync-docs.sh` to copy the updated files into `server/context/`
3. Commit the synced copies in the same PR as the source document update
4. Rebuild and redeploy the Docker image
