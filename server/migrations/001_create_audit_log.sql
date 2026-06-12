-- Migration: 001_create_audit_log
-- Phase: 2 — Continuous Interceptor
-- Run this script against the client database before deploying the Interfacer container.
-- Safe to run multiple times (uses IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS audit_log (
  id            SERIAL PRIMARY KEY,
  timestamp     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  action        VARCHAR(100) NOT NULL,
  entity        VARCHAR(100),
  entity_id     INTEGER,
  initiated_by  VARCHAR(255) NOT NULL,
  authorized_by VARCHAR(255),
  details       JSONB
);

-- Append-only guarantee: no UPDATE or DELETE is ever issued against this table.
-- Index for time-range queries (most common audit access pattern).
CREATE INDEX IF NOT EXISTS audit_log_timestamp_idx ON audit_log (timestamp DESC);

-- Index for per-entity lookups (e.g. "all actions on contacts record 1234").
CREATE INDEX IF NOT EXISTS audit_log_entity_idx ON audit_log (entity, entity_id);
