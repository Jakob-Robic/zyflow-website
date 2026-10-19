'use strict';

/**
 * Shared form rate limiter (Supabase / Postgres).
 *
 * Fixed windows, per endpoint (`contact` | `waitlist`):
 *   - IP:    5 requests / 10 minutes
 *   - email: 3 requests / 1 hour  (normalized: trim + lowercase)
 *
 * Identifiers are stored as SHA-256(salt || kind || value), never raw IP
 * or email. Salt comes from RATE_LIMIT_IP_SALT.
 *
 * Keys are `<endpoint>:<kind>:<hash>`, i.e. they start with `contact:` or
 * `waitlist:`, so they never collide with zyflow-admin's `partner-signup:`
 * / `partner-confirm-resend:` keys in the same table.
 *
 * Backend: the existing `public.take_rate_limit_token(p_key, p_max_attempts,
 * p_window_seconds)` RPC and `public.rate_limits` table (created by
 * zyflow-admin's 20261011120000_rate_limits.sql; EXECUTE is service_role
 * only). It returns `{ allowed, remaining, reset_at }`, and the window
 * starts at a key's first hit. It deletes the key's expired row itself.
 *
 * Fails closed: any error (missing salt, missing Supabase env, RPC
 * failure) is treated as unavailable — callers must return 503, not 200.
 */

const crypto = require('crypto');
const { getSupabase } = require('./supabase');

const RATE_LIMIT_WINDOWS = {
  ip: { max: 5, windowSeconds: 10 * 60 },
  email: { max: 3, windowSeconds: 60 * 60 },
};

function rateLimitSalt() {
  return (process.env.RATE_LIMIT_IP_SALT || '').trim();
}

function hashIdentifier(kind, identifier) {
  const salt = rateLimitSalt();
  if (!salt) return null;
  return crypto
    .createHash('sha256')
    .update(salt)
    .update('\0')
    .update(String(kind))
    .update('\0')
    .update(String(identifier))
    .digest('hex');
}

function normalizeEmail(email) {
  if (typeof email !== 'string') return '';
  const value = email.trim().toLowerCase();
  if (!value || !value.includes('@')) return '';
  return value;
}

function retryAfterSeconds(resetAt, fallbackSeconds) {
  const resetMs = Date.parse(resetAt);
  if (!Number.isFinite(resetMs)) return fallbackSeconds;
  const seconds = Math.ceil((resetMs - Date.now()) / 1000);
  return seconds > 0 ? seconds : 1;
}

function parseRpcPayload(data) {
  let payload = data;
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload);
    } catch {
      return null;
    }
  }
  if (!payload || typeof payload !== 'object') return null;
  if (typeof payload.allowed !== 'boolean') return null;
  return payload;
}

async function consumeRateLimit({ kind, bucket, identifier }) {
  const window = RATE_LIMIT_WINDOWS[kind];
  if (!window || !bucket || identifier == null || identifier === '') {
    console.error('Rate limit: invalid arguments');
    return { ok: false };
  }
  if (!rateLimitSalt()) {
    console.error('Rate limit: RATE_LIMIT_IP_SALT is not set');
    return { ok: false };
  }
  const digest = hashIdentifier(kind, identifier);
  if (!digest) {
    console.error('Rate limit: RATE_LIMIT_IP_SALT is not set');
    return { ok: false };
  }
  const key = `${bucket}:${kind}:${digest}`;
  try {
    const { data, error } = await getSupabase().rpc('take_rate_limit_token', {
      p_key: key,
      p_max_attempts: window.max,
      p_window_seconds: window.windowSeconds,
    });
    if (error) {
      console.error('Rate limit: check failed');
      return { ok: false };
    }
    const payload = parseRpcPayload(data);
    if (!payload) {
      console.error('Rate limit: check failed');
      return { ok: false };
    }
    if (!payload.allowed) {
      return {
        ok: false,
        limited: true,
        retryAfterSec: retryAfterSeconds(payload.reset_at, window.windowSeconds),
      };
    }
    return { ok: true };
  } catch {
    console.error('Rate limit: check failed');
    return { ok: false };
  }
}

function sendRateLimitResult(res, result) {
  if (result.ok) return true;
  if (result.limited) {
    res.setHeader('Retry-After', String(result.retryAfterSec || 1));
    res.status(429).json({ error: 'Too many requests' });
    return false;
  }
  res.status(503).json({ error: 'Service unavailable' });
  return false;
}

async function enforceIpRateLimit(res, bucket, ip) {
  const result = await consumeRateLimit({
    kind: 'ip',
    bucket,
    identifier: ip,
  });
  return sendRateLimitResult(res, result);
}

async function enforceEmailRateLimit(res, bucket, email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return true;
  const result = await consumeRateLimit({
    kind: 'email',
    bucket,
    identifier: normalized,
  });
  return sendRateLimitResult(res, result);
}

module.exports = {
  RATE_LIMIT_WINDOWS,
  retryAfterSeconds,
  hashIdentifier,
  normalizeEmail,
  consumeRateLimit,
  enforceIpRateLimit,
  enforceEmailRateLimit,
};
