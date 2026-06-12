'use strict';

require('dotenv').config();

const express = require('express');
const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');
const { Pool } = require('pg');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---------------------------------------------------------------------------
// Context loading
// ---------------------------------------------------------------------------

const AGENTS_DIR = path.join(__dirname, 'agents');
const CONTEXT_DIR = path.join(__dirname, 'context');
const FINDINGS_DIR = path.join(CONTEXT_DIR, 'findings');

function loadFile(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : '';
}

function buildStaticContext() {
  let ctx = '';

  ctx += '\n\n---\n# ARCHITECTURE.md\n\n' + loadFile(path.join(__dirname, 'ARCHITECTURE.md'));
  ctx += '\n\n---\n# context/assumptions.md\n\n' + loadFile(path.join(CONTEXT_DIR, 'assumptions.md'));
  ctx += '\n\n---\n# context/hitl-ramp.md\n\n' + loadFile(path.join(CONTEXT_DIR, 'hitl-ramp.md'));

  if (fs.existsSync(FINDINGS_DIR)) {
    for (const file of fs.readdirSync(FINDINGS_DIR).sort()) {
      ctx += `\n\n---\n# context/findings/${file}\n\n` + loadFile(path.join(FINDINGS_DIR, file));
    }
  }

  return ctx;
}

const SYSTEM_PROMPT = loadFile(path.join(AGENTS_DIR, 'interfacer.md'));
const STATIC_CONTEXT = buildStaticContext();
const FEEDBACK_PATH = path.join(CONTEXT_DIR, 'feedback-log.md');

function assembleSystemMessage() {
  const feedback = loadFile(FEEDBACK_PATH);
  const feedbackSection = feedback.includes('## Entry')
    ? '\n\n---\n# context/feedback-log.md\n\n' + feedback
    : '';
  return SYSTEM_PROMPT + STATIC_CONTEXT + feedbackSection;
}

// ---------------------------------------------------------------------------
// Anthropic client
// ---------------------------------------------------------------------------

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';

async function callInterfacer(userMessage) {
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: assembleSystemMessage(),
    messages: [{ role: 'user', content: userMessage }],
  });

  const text = response.content[0].text.trim();

  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) return JSON.parse(match[1].trim());
    throw new Error('Interfacer returned non-JSON response: ' + text.slice(0, 200));
  }
}

// ---------------------------------------------------------------------------
// Database pool (optional — only required for /correct with execute: true)
// ---------------------------------------------------------------------------

let db = null;
if (process.env.DB_HOST) {
  db = new Pool({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });
}

// ---------------------------------------------------------------------------
// Audit logging
// ---------------------------------------------------------------------------

async function auditLog({ action, entity = null, entity_id = null, initiated_by, authorized_by = null, details = {} }) {
  const entry = { action, entity, entity_id, initiated_by, authorized_by, details };
  if (db) {
    await db.query(
      `INSERT INTO audit_log (timestamp, action, entity, entity_id, initiated_by, authorized_by, details)
       VALUES (NOW(), $1, $2, $3, $4, $5, $6)`,
      [action, entity, entity_id, initiated_by, authorized_by, JSON.stringify(details)]
    );
  } else {
    console.log(`[AUDIT] ${new Date().toISOString()} | action=${action} | entity=${entity ?? 'null'} | initiated_by=${initiated_by} | details=${JSON.stringify(details)}`);
  }
}

// ---------------------------------------------------------------------------
// Auth middleware
// ---------------------------------------------------------------------------

function requireOperatorAuth(req, res, next) {
  const token = req.headers['x-operator-auth'];
  if (!token || token !== process.env.OPERATOR_AUTH_TOKEN) {
    return res.status(401).json({ error: 'x-operator-auth header required for this operation.' });
  }
  next();
}

// ---------------------------------------------------------------------------
// Operating mode
// ---------------------------------------------------------------------------

let currentMode = ['suggest', 'auto-correct'].includes(process.env.INTERFACER_MODE)
  ? process.env.INTERFACER_MODE
  : 'suggest';

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// GET /health
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    mode: currentMode,
    model: MODEL,
    db_connected: db !== null,
    timestamp: new Date().toISOString(),
  });
});

// GET /mode
app.get('/mode', (_req, res) => {
  res.json({ mode: currentMode });
});

// PATCH /mode  (operator only)
app.patch('/mode', requireOperatorAuth, async (req, res) => {
  const { mode } = req.body;
  if (!['suggest', 'auto-correct'].includes(mode)) {
    return res.status(400).json({ error: 'Invalid mode. Accepted values: "suggest", "auto-correct".' });
  }
  const previousMode = currentMode;
  currentMode = mode;
  console.log(`[mode] Changed to ${mode} by operator.`);
  try {
    await auditLog({ action: 'mode_change', entity: 'system', initiated_by: 'operator', authorized_by: 'operator', details: { old_mode: previousMode, new_mode: mode } });
  } catch (err) {
    console.warn('[AUDIT WARN] mode_change audit failed:', err.message);
  }
  res.json({ mode: currentMode });
});

// POST /intercept  — BE payload interception
app.post('/intercept', async (req, res) => {
  const { endpoint, payload } = req.body;
  if (!endpoint || !payload) {
    return res.status(400).json({ error: '"endpoint" and "payload" are required.' });
  }

  try {
    const userMessage = [
      'OPERATION: intercept',
      `MODE: ${currentMode}`,
      `ENDPOINT: ${endpoint}`,
      `PAYLOAD:\n${JSON.stringify(payload, null, 2)}`,
      'Analyse this payload for data quality issues and respond in the intercept response format.',
    ].join('\n');

    const result = await callInterfacer(userMessage);
    try {
      await auditLog({ action: 'intercept', entity: endpoint, initiated_by: 'api', details: { mode: currentMode, corrections_count: Array.isArray(result.corrections) ? result.corrections.length : (Array.isArray(result.applied_corrections) ? result.applied_corrections.length : 0) } });
    } catch (err) {
      console.warn('[AUDIT WARN] intercept audit failed:', err.message);
    }
    res.json(result);
  } catch (err) {
    console.error('[intercept]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /analyze  — interactive data quality analysis
app.post('/analyze', async (req, res) => {
  const { data, question } = req.body;
  if (!data) {
    return res.status(400).json({ error: '"data" is required.' });
  }

  try {
    const userMessage = [
      'OPERATION: analyze',
      `DATA:\n${JSON.stringify(data, null, 2)}`,
      question ? `QUESTION: ${question}` : '',
      'Analyse this data for quality issues. Apply the token economy directive first. Respond in the analyze response format.',
    ].filter(Boolean).join('\n');

    const result = await callInterfacer(userMessage);
    try {
      await auditLog({ action: 'analyze', initiated_by: 'api', details: { issues_count: Array.isArray(result.issues) ? result.issues.length : 0, manual_resolution_available: result.manual_resolution_available ?? false } });
    } catch (err) {
      console.warn('[AUDIT WARN] analyze audit failed:', err.message);
    }
    res.json(result);
  } catch (err) {
    console.error('[analyze]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /correct  — propose corrections; execute in DB if operator authorised
app.post('/correct', async (req, res) => {
  const { data, table, record_id, execute } = req.body;
  if (!data) {
    return res.status(400).json({ error: '"data" is required.' });
  }

  const hasAuth = req.headers['x-operator-auth'] === process.env.OPERATOR_AUTH_TOKEN;

  if (execute && !hasAuth) {
    return res.status(401).json({ error: 'x-operator-auth header required to execute DB writes.' });
  }
  if (execute && !db) {
    return res.status(503).json({ error: 'DB not configured. Set DB_* environment variables to enable write operations.' });
  }
  if (execute && (!table || !record_id)) {
    return res.status(400).json({ error: '"table" and "record_id" are required when execute is true.' });
  }

  try {
    const userMessage = [
      'OPERATION: correct',
      `DATA:\n${JSON.stringify(data, null, 2)}`,
      `TABLE: ${table || 'unknown'}`,
      `RECORD_ID: ${record_id || 'unknown'}`,
      `EXECUTE_DB_WRITE: ${execute && hasAuth ? 'YES — operator authorised' : 'NO — propose only'}`,
      'Propose corrections. Respond in the correct response format.',
    ].join('\n');

    const result = await callInterfacer(userMessage);
    result.db_write_executed = false;
    result.fields_written = [];

    if (execute && hasAuth && Array.isArray(result.corrections)) {
      const highConfidence = result.corrections.filter(c => c.confidence > 0.90);

      if (highConfidence.length > 0) {
        // Build parameterised UPDATE — field names validated as alphanumeric/underscore only
        const safeFields = highConfidence.filter(c => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(c.field));

        if (safeFields.length > 0) {
          const client = await db.connect();
          try {
            await client.query('BEGIN');

            const setClauses = safeFields.map((c, i) => `"${c.field}" = $${i + 1}`).join(', ');
            const values = safeFields.map(c => c.suggested_value);
            values.push(record_id);
            await client.query(
              `UPDATE "${table}" SET ${setClauses}, updated_at = NOW() WHERE id = $${values.length}`,
              values
            );

            await client.query(
              `INSERT INTO audit_log (timestamp, action, entity, entity_id, initiated_by, authorized_by, details)
               VALUES (NOW(), $1, $2, $3, $4, $5, $6)`,
              ['correct_execute', table, record_id, 'api', 'operator', JSON.stringify({ corrections_count: safeFields.length, fields_written: safeFields.map(c => c.field) })]
            );

            await client.query('COMMIT');
            result.db_write_executed = true;
            result.fields_written = safeFields.map(c => c.field);
            console.log(`[correct] Wrote ${safeFields.length} field(s) to ${table} id=${record_id}.`);
          } catch (err) {
            await client.query('ROLLBACK');
            throw err;
          } finally {
            client.release();
          }
        }
      }
    }

    if (!result.db_write_executed) {
      try {
        await auditLog({ action: 'correct_propose', entity: table || null, entity_id: record_id || null, initiated_by: 'api', details: { corrections_count: Array.isArray(result.corrections) ? result.corrections.length : 0 } });
      } catch (err) {
        console.warn('[AUDIT WARN] correct_propose audit failed:', err.message);
      }
    }

    res.json(result);
  } catch (err) {
    console.error('[correct]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /ask  — conversational dispatcher
app.post('/ask', async (req, res) => {
  const { message, operator_token } = req.body;
  if (!message) {
    return res.status(400).json({ error: '"message" is required.' });
  }

  const hasAuth = operator_token === process.env.OPERATOR_AUTH_TOKEN;

  try {
    const userMessage = [
      'OPERATION: ask',
      `OPERATOR_AUTH_PRESENT: ${hasAuth ? 'YES' : 'NO'}`,
      `CURRENT_MODE: ${currentMode}`,
      `MESSAGE: ${message}`,
    ].join('\n');

    const result = await callInterfacer(userMessage);

    // Apply mode change server-side if the LLM resolved the intent as mode_change
    if (result.operation === 'mode_change' && result.result?.mode) {
      if (!hasAuth) {
        return res.json({
          response: 'Operator token required to change the operating mode. Please enter your token in the field at the top of the page.',
          operation: 'mode_change',
          result: { authorized: false },
        });
      }
      if (['suggest', 'auto-correct'].includes(result.result.mode)) {
        currentMode = result.result.mode;
        console.log(`[ask] Mode changed to ${currentMode} via conversational dispatch.`);
      }
    }

    try {
      await auditLog({ action: 'ask', initiated_by: 'operator-ui', authorized_by: hasAuth ? 'operator' : null, details: { resolved_operation: result.operation, mode: currentMode } });
    } catch (err) {
      console.warn('[AUDIT WARN] ask audit failed:', err.message);
    }
    res.json(result);
  } catch (err) {
    console.error('[ask]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /feedback  — report false positive; append to feedback-log.md
app.post('/feedback', async (req, res) => {
  const { field, original_value, correction_rejected, reason } = req.body;
  if (!field || original_value === undefined) {
    return res.status(400).json({ error: '"field" and "original_value" are required.' });
  }

  const entry = [
    `\n## Entry ${new Date().toISOString()}`,
    `- **Field:** ${field}`,
    `- **Value flagged as false positive:** ${JSON.stringify(original_value)}`,
    `- **Correction rejected:** ${correction_rejected !== undefined ? JSON.stringify(correction_rejected) : 'N/A'}`,
    `- **Reason:** ${reason || 'No reason provided'}`,
    '',
  ].join('\n');

  fs.appendFileSync(FEEDBACK_PATH, entry);
  console.log(`[feedback] False positive recorded for field "${field}".`);

  try {
    await auditLog({ action: 'feedback', entity: field, initiated_by: 'api', details: { correction_rejected: correction_rejected ?? null, reason: reason || null } });
  } catch (err) {
    console.warn('[AUDIT WARN] feedback audit failed:', err.message);
  }

  res.json({ message: 'Feedback recorded. Will be applied on next request.', field, original_value });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

const PORT = parseInt(process.env.PORT || '3000', 10);
app.listen(PORT, () => {
  console.log(`Interfacer server listening on port ${PORT} — mode: ${currentMode} — model: ${MODEL}`);
});
