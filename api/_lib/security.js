'use strict';

/**
 * Shared hardening for public form endpoints.
 *
 * Rate limiting for /api/contact and /api/waitlist is a shared Postgres
 * fixed window (see api/_lib/rate-limit.js; uses the existing
 * take_rate_limit_token RPC in the shared Supabase project).
 * CSP report collection still uses a best-effort in-memory limiter.
 *
 * Cloudflare Turnstile is required in production (VERCEL_ENV=production,
 * or NODE_ENV=production when VERCEL_ENV is unset). Preview/dev may skip
 * when TURNSTILE_SECRET_KEY is not set.
 */

const { enforceIpRateLimit, enforceEmailRateLimit } = require('./rate-limit');

const PRODUCTION_ORIGINS = ['https://www.zyflow.eu', 'https://zyflow.eu'];

// Vercel team slug for this project (from the Vercel GitHub integration /
// preview host zyflow-landing-*-jakobs-projects-48c1181f.vercel.app).
// GitHub owner Jakob-Robic is not the hostname suffix.
const PROJECT_PREVIEW_TEAM = 'jakobs-projects-48c1181f';

const LIMITS = {
  // first(100) + space + last(100) from the contact form
  name: 201,
  email: 254,
  subject: 200,
  message: 5000,
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const hits = new Map();

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function stripCrlf(value) {
  return String(value).replace(/[\r\n\u0000\u0085\u2028\u2029]+/g, ' ').trim();
}

function isValidEmail(email) {
  if (typeof email !== 'string') return false;
  if (/[\r\n\0]/.test(email)) return false;
  const value = email.trim();
  if (value.length < 3 || value.length > LIMITS.email) return false;
  if (/\s/.test(value)) return false;
  if (value.includes('..')) return false;
  const at = value.indexOf('@');
  if (at < 1 || at !== value.lastIndexOf('@')) return false;
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  if (!local || !domain || local.length > 64) return false;
  if (!domain.includes('.')) return false;
  return EMAIL_RE.test(value);
}

function extraAllowedOrigins() {
  return String(process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function vercelDeploymentOrigins() {
  return [process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL]
    .filter(Boolean)
    .map((host) => {
      const clean = String(host).replace(/^https?:\/\//, '');
      return `https://${clean}`;
    });
}

function isPreviewEnv() {
  const env = process.env.VERCEL_ENV;
  return env === 'preview' || env === 'development';
}

function isProductionEnv() {
  if (process.env.VERCEL_ENV) {
    return process.env.VERCEL_ENV === 'production';
  }
  return process.env.NODE_ENV === 'production';
}

function previewTeamSlug() {
  const explicit = String(process.env.VERCEL_PREVIEW_TEAM || '').trim().toLowerCase();
  return explicit || PROJECT_PREVIEW_TEAM;
}

function isProjectPreviewOrigin(origin) {
  const team = previewTeamSlug();
  if (!team) return false;
  const escaped = team.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // This project's hosts: zyflow-landing-<hash>-<team>.vercel.app
  // and zyflow-landing-git-<branch>-<team>.vercel.app
  const re = new RegExp(`^https://zyflow-landing(?:-git)?-[a-z0-9-]+-${escaped}\\.vercel\\.app$`);
  return re.test(origin);
}

function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (PRODUCTION_ORIGINS.includes(origin)) return true;
  if (extraAllowedOrigins().includes(origin)) return true;
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;
  if (vercelDeploymentOrigins().includes(origin)) return true;
  if (isPreviewEnv() && isProjectPreviewOrigin(origin)) return true;
  return false;
}

function applyCors(req, res) {
  const origin = req.headers && req.headers.origin;
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
  if (origin && isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
}

function clientIp(req) {
  const headers = (req && req.headers) || {};
  const forwarded = headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  if (typeof headers['x-real-ip'] === 'string' && headers['x-real-ip'].trim()) {
    return headers['x-real-ip'].trim();
  }
  return (req.socket && req.socket.remoteAddress) || 'unknown';
}

function rateLimitConfig() {
  const max = Number(process.env.FORM_RATE_LIMIT_MAX);
  const windowMs = Number(process.env.FORM_RATE_LIMIT_WINDOW_MS);
  return {
    max: Number.isFinite(max) && max > 0 ? max : 8,
    windowMs: Number.isFinite(windowMs) && windowMs > 0 ? windowMs : 10 * 60 * 1000,
  };
}

function pruneHits(now, windowMs) {
  for (const [key, stamps] of hits) {
    const next = stamps.filter((t) => now - t < windowMs);
    if (next.length) hits.set(key, next);
    else hits.delete(key);
  }
}

/** In-memory limiter for /api/csp-report only (always 204; not a form). */
function rateLimit(bucket, req) {
  const { max, windowMs } = rateLimitConfig();
  const key = `${bucket}:${clientIp(req)}`;
  const now = Date.now();
  let stamps = hits.get(key) || [];
  stamps = stamps.filter((t) => now - t < windowMs);
  if (stamps.length >= max) {
    hits.set(key, stamps);
    const retryAfterSec = Math.max(1, Math.ceil((stamps[0] + windowMs - now) / 1000));
    return { ok: false, retryAfterSec };
  }
  stamps.push(now);
  hits.set(key, stamps);
  if (hits.size > 4000) pruneHits(now, windowMs);
  return { ok: true };
}

function resetRateLimits() {
  hits.clear();
}

function honeypotFilled(body) {
  if (!body || typeof body !== 'object') return false;
  const value = body.website != null ? body.website : body.company_website;
  return typeof value === 'string' && value.trim() !== '';
}

function turnstileToken(body) {
  if (!body || typeof body !== 'object') return '';
  const token = body.turnstileToken || body['cf-turnstile-response'];
  return typeof token === 'string' ? token.trim() : '';
}

async function verifyTurnstile(body, req) {
  const secret = (process.env.TURNSTILE_SECRET_KEY || '').trim();
  if (!secret) {
    if (isProductionEnv()) {
      console.error('Turnstile: TURNSTILE_SECRET_KEY is not set');
      return { ok: false, unavailable: true };
    }
    return { ok: true, skipped: true };
  }
  const token = turnstileToken(body);
  if (!token) return { ok: false };
  try {
    const params = {
      secret,
      response: token,
    };
    const ip = clientIp(req);
    if (ip && ip !== 'unknown') params.remoteip = ip;
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params).toString(),
    });
    if (!res.ok) {
      console.error('Turnstile: siteverify request failed');
      return { ok: false, unavailable: true };
    }
    const data = await res.json();
    return { ok: data && data.success === true };
  } catch {
    console.error('Turnstile: siteverify request failed');
    return { ok: false, unavailable: true };
  }
}

function jsonBody(req) {
  const body = req && req.body;
  if (!body) return {};
  if (typeof body === 'object' && !Buffer.isBuffer(body)) return body;
  if (typeof body === 'string') {
    try {
      const parsed = JSON.parse(body);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

function readTrimmed(value, max, { optional = false } = {}) {
  if (value == null || value === '') {
    return optional || value === '' ? { ok: true, value: '' } : { ok: false, error: 'required' };
  }
  if (typeof value !== 'string') return { ok: false, error: 'Invalid input' };
  if (value.length > max) return { ok: false, error: 'Input too long' };
  const trimmed = value.trim();
  if (trimmed.length > max) return { ok: false, error: 'Input too long' };
  return { ok: true, value: trimmed };
}

function readContactFields(body) {
  if (!body || typeof body !== 'object') {
    return { error: 'Name, email and message are required' };
  }
  const name = readTrimmed(body.name, LIMITS.name);
  const email = readTrimmed(body.email, LIMITS.email);
  const subject = readTrimmed(body.subject, LIMITS.subject, { optional: true });
  const message = readTrimmed(body.message, LIMITS.message);
  if (
    name.error === 'Invalid input' ||
    email.error === 'Invalid input' ||
    subject.error === 'Invalid input' ||
    message.error === 'Invalid input'
  ) {
    return { error: 'Invalid input' };
  }
  if (
    name.error === 'Input too long' ||
    email.error === 'Input too long' ||
    subject.error === 'Input too long' ||
    message.error === 'Input too long'
  ) {
    return { error: 'Input too long' };
  }
  if (!name.value || !email.value || !message.value) {
    return { error: 'Name, email and message are required' };
  }
  if (!isValidEmail(email.value)) {
    return { error: 'Valid email required' };
  }
  return {
    name: name.value,
    email: email.value,
    subject: subject.value,
    message: message.value,
  };
}

function readWaitlistFields(body) {
  if (!body || typeof body !== 'object') {
    return { error: 'Valid email required' };
  }
  const email = readTrimmed(body.email, LIMITS.email);
  if (email.error === 'Invalid input') return { error: 'Invalid input' };
  if (email.error === 'Input too long') return { error: 'Input too long' };
  if (!email.value || !isValidEmail(email.value)) {
    return { error: 'Valid email required' };
  }
  return { email: email.value };
}

/**
 * CORS + method + origin + shared IP rate limit.
 * Returns true when the handler should continue.
 */
async function guardRequest(req, res, bucket) {
  applyCors(req, res);

  if (req.method === 'OPTIONS') {
    const origin = req.headers && req.headers.origin;
    if (origin && !isAllowedOrigin(origin)) {
      res.status(403).json({ error: 'Origin not allowed' });
      return false;
    }
    res.status(204).end();
    return false;
  }

  if (req.method !== 'POST') {
    console.error(`${bucket} API: method not allowed:`, req.method);
    res.status(405).json({ error: 'Method not allowed' });
    return false;
  }

  const origin = req.headers && req.headers.origin;
  if (origin && !isAllowedOrigin(origin)) {
    res.status(403).json({ error: 'Origin not allowed' });
    return false;
  }

  // Count every POST that passed method/origin checks, including later
  // validation / honeypot / Turnstile failures. Invalid bodies are not free.
  if (!(await enforceIpRateLimit(res, bucket, clientIp(req)))) return false;

  return true;
}

async function rejectIfBot(req, res, body) {
  if (honeypotFilled(body)) {
    res.status(200).json({ success: true });
    return true;
  }
  const turnstile = await verifyTurnstile(body, req);
  if (turnstile.unavailable) {
    res.status(503).json({ error: 'Service unavailable' });
    return true;
  }
  if (!turnstile.ok) {
    res.status(400).json({ error: 'Verification failed' });
    return true;
  }
  return false;
}

module.exports = {
  LIMITS,
  escapeHtml,
  stripCrlf,
  isValidEmail,
  isAllowedOrigin,
  isProductionEnv,
  applyCors,
  clientIp,
  rateLimit,
  resetRateLimits,
  honeypotFilled,
  verifyTurnstile,
  jsonBody,
  readContactFields,
  readWaitlistFields,
  guardRequest,
  rejectIfBot,
  enforceEmailRateLimit,
};
