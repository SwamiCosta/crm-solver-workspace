'use strict';

// =============================================================================
// STUB MODE — Anthropic API calls are replaced with hardcoded responses.
// All server logic, routing, auth, and payload handling is identical to
// server.js. Only callInterfacer() is replaced.
// Do not use this file in production.
// =============================================================================

require('dotenv').config();

const express = require('express');
const fs = require('fs');
const path = require('path');
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

// Context is still loaded to verify the startup path works end-to-end
loadFile(path.join(AGENTS_DIR, 'interfacer.md'));
buildStaticContext();

const FEEDBACK_PATH = path.join(CONTEXT_DIR, 'feedback-log.md');
const MODEL = process.env.ANTHROPIC_MODEL || 'stub (no API call)';

// ---------------------------------------------------------------------------
// STUB: callInterfacer
// Returns hardcoded responses that match the exact response format defined in
// agents/interfacer.md. Keyed on the OPERATION tag embedded in userMessage.
// ---------------------------------------------------------------------------

async function callInterfacer(userMessage) {
  if (userMessage.includes('OPERATION: intercept')) {
    if (currentMode === 'auto-correct') {
      return {
        mode: 'auto-correct',
        payload: {
          name: 'Acme Corp',
          phone: '(555) 123-4567',
          industry: 'Staffing & Recruitment',
        },
        applied_corrections: [
          {
            field: 'phone',
            original_value: '5551234567',
            suggested_value: '(555) 123-4567',
            confidence: 0.97,
            anomaly_code: 'FORMAT',
            reason: 'Reformatted to (XXX) XXX-XXXX standard.',
          },
          {
            field: 'industry',
            original_value: 'staffing',
            suggested_value: 'Staffing & Recruitment',
            confidence: 0.95,
            anomaly_code: 'TAG',
            reason: "Value 'staffing' mapped to controlled vocabulary entry 'Staffing & Recruitment'.",
          },
        ],
        pending_suggestions: [],
      };
    }

    // suggest mode (default)
    return {
      mode: 'suggest',
      original: { name: 'Acme Corp', phone: '5551234567', industry: 'staffing' },
      suggested: { name: 'Acme Corp', phone: '(555) 123-4567', industry: 'Staffing & Recruitment' },
      corrections: [
        {
          field: 'phone',
          original_value: '5551234567',
          suggested_value: '(555) 123-4567',
          confidence: 0.97,
          anomaly_code: 'FORMAT',
          reason: 'Reformatted to (XXX) XXX-XXXX standard.',
        },
        {
          field: 'industry',
          original_value: 'staffing',
          suggested_value: 'Staffing & Recruitment',
          confidence: 0.95,
          anomaly_code: 'TAG',
          reason: "Value 'staffing' mapped to controlled vocabulary entry 'Staffing & Recruitment'.",
        },
      ],
    };
  }

  if (userMessage.includes('OPERATION: analyze')) {
    return {
      manual_resolution_available: true,
      manual_instructions: "UPDATE companies SET industry = 'Staffing & Recruitment' WHERE industry = 'staffing';",
      summary: '2 issues found in this record.',
      issues: [
        {
          field: 'phone',
          value: '5551234567',
          anomaly_code: 'FORMAT',
          severity: 'MEDIUM',
          explanation: "Phone number is not in target format (XXX) XXX-XXXX. Strip non-digit characters and reformat.",
          suggested_value: '(555) 123-4567',
          confidence: 0.97,
        },
        {
          field: 'industry',
          value: 'staffing',
          anomaly_code: 'TAG',
          severity: 'HIGH',
          explanation: "Value 'staffing' is not in the controlled vocabulary. Based on context maps to 'Staffing & Recruitment'.",
          suggested_value: 'Staffing & Recruitment',
          confidence: 0.95,
        },
      ],
    };
  }

  if (userMessage.includes('OPERATION: ask')) {
    const hasAuth = userMessage.includes('OPERATOR_AUTH_PRESENT: YES');
    // Extract only the operator's text — avoid false matches on metadata like CURRENT_MODE: suggest
    const msgLine = userMessage.split('\n').find(l => l.startsWith('MESSAGE:')) || '';
    const msg = msgLine.replace('MESSAGE:', '').trim().toLowerCase();

    if (msg.includes('mode') || msg.includes('auto') || msg.includes('suggest')) {
      const targetMode = msg.includes('auto') ? 'auto-correct' : 'suggest';
      if (!hasAuth) {
        return {
          response: 'Operator token required to change the operating mode. Please enter your token in the field at the top of the page.',
          operation: 'mode_change',
          result: { authorized: false },
        };
      }
      return {
        response: `Done. Switched to ${targetMode} mode.${targetMode === 'auto-correct' ? ' High-confidence corrections (> 0.90) will now be applied automatically to intercepted payloads.' : ' Corrections will be surfaced as suggestions for human review.'}`,
        operation: 'mode_change',
        result: { mode: targetMode },
      };
    }

    if (msg.includes('correct') || msg.includes('fix') || msg.includes('clean')) {
      return {
        response: "I found 2 high-confidence corrections. The phone '5551234567' should be '(555) 123-4567' (FORMAT, confidence 0.97). The industry 'staffing' should be 'Staffing & Recruitment' (TAG, confidence 0.95). No DB write has been executed — call /correct with execute: true and your operator token to apply.",
        operation: 'correct',
        result: {
          corrections: [
            { field: 'phone', original_value: '5551234567', suggested_value: '(555) 123-4567', confidence: 0.97, anomaly_code: 'FORMAT' },
            { field: 'industry', original_value: 'staffing', suggested_value: 'Staffing & Recruitment', confidence: 0.95, anomaly_code: 'TAG' },
          ],
          high_confidence_count: 2,
          requires_review_count: 0,
          db_write_executed: false,
          fields_written: [],
        },
      };
    }

    // Default: analyze
    return {
      response: "I found 2 issues with this record. The phone number '5551234567' is not in standard format — it should be '(555) 123-4567' (FORMAT anomaly, confidence 0.97). The industry value 'staffing' is not in the controlled vocabulary — it should be 'Staffing & Recruitment' (TAG anomaly, confidence 0.95).",
      operation: 'analyze',
      result: {
        summary: '2 issues found.',
        issues: [
          { field: 'phone', value: '5551234567', anomaly_code: 'FORMAT', severity: 'MEDIUM', suggested_value: '(555) 123-4567', confidence: 0.97 },
          { field: 'industry', value: 'staffing', anomaly_code: 'TAG', severity: 'HIGH', suggested_value: 'Staffing & Recruitment', confidence: 0.95 },
        ],
      },
    };
  }

  if (userMessage.includes('OPERATION: correct')) {
    return {
      corrections: [
        {
          field: 'phone',
          original_value: '5551234567',
          suggested_value: '(555) 123-4567',
          confidence: 0.97,
          anomaly_code: 'FORMAT',
        },
        {
          field: 'industry',
          original_value: 'staffing',
          suggested_value: 'Staffing & Recruitment',
          confidence: 0.95,
          anomaly_code: 'TAG',
        },
      ],
      high_confidence_count: 2,
      requires_review_count: 0,
    };
  }

  return { stub_error: 'Unknown operation in userMessage' };
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
    stub_mode: true,
    timestamp: new Date().toISOString(),
  });
});

// GET /mode
app.get('/mode', (_req, res) => {
  res.json({ mode: currentMode });
});

// PATCH /mode  (operator only)
app.patch('/mode', requireOperatorAuth, (req, res) => {
  const { mode } = req.body;
  if (!['suggest', 'auto-correct'].includes(mode)) {
    return res.status(400).json({ error: 'Invalid mode. Accepted values: "suggest", "auto-correct".' });
  }
  currentMode = mode;
  console.log(`[mode] Changed to ${mode} by operator.`);
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
        const safeFields = highConfidence.filter(c => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(c.field));

        if (safeFields.length > 0) {
          const setClauses = safeFields.map((c, i) => `"${c.field}" = $${i + 1}`).join(', ');
          const values = safeFields.map(c => c.suggested_value);
          values.push(record_id);

          await db.query(
            `UPDATE "${table}" SET ${setClauses}, updated_at = NOW() WHERE id = $${values.length}`,
            values
          );

          result.db_write_executed = true;
          result.fields_written = safeFields.map(c => c.field);
          console.log(`[correct] Wrote ${safeFields.length} field(s) to ${table} id=${record_id}.`);
        }
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

    res.json(result);
  } catch (err) {
    console.error('[ask]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /feedback  — report false positive; append to feedback-log.md
app.post('/feedback', (req, res) => {
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

  res.json({ message: 'Feedback recorded. Will be applied on next request.', field, original_value });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

const PORT = parseInt(process.env.PORT || '3000', 10);
app.listen(PORT, () => {
  console.log('');
  console.log('  *** STUB MODE ACTIVE — no Anthropic API calls will be made ***');
  console.log('');
  console.log(`  Interfacer server listening on port ${PORT} — mode: ${currentMode} — model: ${MODEL}`);
  console.log('');
});
