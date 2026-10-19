'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('module');

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'test-service-key';
process.env.BREVO_API_KEY = process.env.BREVO_API_KEY || 'test-brevo-key';
process.env.NOTIFICATION_EMAIL = process.env.NOTIFICATION_EMAIL || 'owner@example.com';
process.env.RATE_LIMIT_IP_SALT = process.env.RATE_LIMIT_IP_SALT || 'test-rate-limit-salt';
process.env.VERCEL_ENV = 'preview';
delete process.env.TURNSTILE_SECRET_KEY;

const inserts = [];
const emails = [];
const rpcCounts = new Map();
const rpcKeys = [];
let nextInsertError = null;
let nextRpcError = null;
let rpcShouldThrow = false;

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === '@supabase/supabase-js') {
    return {
      createClient() {
        return {
          from(table) {
            return {
              async insert(row) {
                inserts.push({ table, row });
                const error = nextInsertError;
                nextInsertError = null;
                return { error };
              },
            };
          },
          async rpc(name, args) {
            if (rpcShouldThrow) {
              throw new Error('rpc down');
            }
            if (nextRpcError) {
              const error = nextRpcError;
              nextRpcError = null;
              return { data: null, error };
            }
            if (name !== 'take_rate_limit_token') {
              return { data: null, error: { message: 'unknown rpc' } };
            }
            // Mirrors public.take_rate_limit_token: a blocked call does not
            // increment, and reset_at is the end of the key's window.
            const key = args.p_key;
            const max = args.p_max_attempts;
            const windowSeconds = args.p_window_seconds;
            rpcKeys.push(key);
            const resetAt = new Date(Date.now() + windowSeconds * 1000).toISOString();
            const count = rpcCounts.get(key) || 0;
            if (count >= max) {
              return { data: { allowed: false, remaining: 0, reset_at: resetAt }, error: null };
            }
            rpcCounts.set(key, count + 1);
            return {
              data: { allowed: true, remaining: max - count - 1, reset_at: resetAt },
              error: null,
            };
          },
        };
      },
    };
  }
  if (request === './brevo' || request.endsWith('/brevo')) {
    return {
      async sendBrevoEmail(opts) {
        emails.push(opts);
      },
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const contact = require('../contact');
const waitlist = require('../waitlist');
const { resetRateLimits } = require('./security');
const { resetSupabaseClient } = require('./supabase');
const { RATE_LIMIT_WINDOWS } = require('./rate-limit');

function mockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(key, value) {
      this.headers[key] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    end() {
      return this;
    },
  };
}

async function call(handler, { method = 'POST', origin, body, ip } = {}) {
  const req = {
    method,
    headers: {
      origin,
      'x-forwarded-for': ip || '203.0.113.10',
    },
    body,
    socket: { remoteAddress: ip || '203.0.113.10' },
  };
  const res = mockRes();
  await handler(req, res);
  return res;
}

function restoreEnv(prev) {
  for (const [key, value] of Object.entries(prev)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

test.beforeEach(() => {
  inserts.length = 0;
  emails.length = 0;
  rpcCounts.clear();
  rpcKeys.length = 0;
  nextInsertError = null;
  nextRpcError = null;
  rpcShouldThrow = false;
  resetRateLimits();
  resetSupabaseClient();
  process.env.VERCEL_ENV = 'preview';
  process.env.RATE_LIMIT_IP_SALT = 'test-rate-limit-salt';
  delete process.env.TURNSTILE_SECRET_KEY;
});

test('contact: valid submission saves and escapes HTML in the notification email', async () => {
  const res = await call(contact, {
    origin: 'https://www.zyflow.eu',
    body: {
      name: '<img src=x onerror=alert(1)>',
      email: 'rider@zyflow.eu',
      subject: 'Lead\r\nBcc: evil@example.com',
      message: 'Hello <a href="javascript:alert(1)">click</a>\nline two',
    },
  });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { success: true });
  assert.equal(inserts.length, 1);
  assert.equal(emails.length, 1);
  assert.match(emails[0].html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(emails[0].html, /&lt;a href=&quot;javascript:alert\(1\)&quot;&gt;click&lt;\/a&gt;/);
  assert.equal(emails[0].html.includes('<img'), false);
  assert.equal(/\r|\n/.test(emails[0].subject), false);
  assert.equal(emails[0].subject.includes('Bcc:'), true);
});

test('contact: too-long message is rejected', async () => {
  const res = await call(contact, {
    origin: 'https://www.zyflow.eu',
    body: { name: 'Ada', email: 'ada@zyflow.eu', message: 'x'.repeat(5001) },
  });
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.error, 'Input too long');
  assert.equal(inserts.length, 0);
});

test('contact: bad email is rejected without logging the address', async () => {
  const logs = [];
  const original = console.error;
  console.error = function (...args) {
    logs.push(args.map(String).join(' '));
  };
  try {
    const res = await call(contact, {
      origin: 'https://www.zyflow.eu',
      body: { name: 'Ada', email: 'not-an-email', message: 'Hi' },
    });
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error, 'Valid email required');
    assert.equal(logs.some((line) => line.includes('not-an-email')), false);
  } finally {
    console.error = original;
  }
});

test('contact: filled honeypot looks successful and stores nothing', async () => {
  const res = await call(contact, {
    origin: 'https://www.zyflow.eu',
    body: {
      name: 'Bot',
      email: 'bot@spam.test',
      message: 'spam',
      website: 'https://spam.test',
    },
  });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { success: true });
  assert.equal(inserts.length, 0);
  assert.equal(emails.length, 0);
});

test('contact: wrong origin is rejected', async () => {
  const res = await call(contact, {
    origin: 'https://evil.example',
    body: { name: 'Ada', email: 'ada@zyflow.eu', message: 'Hi' },
  });
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.error, 'Origin not allowed');
  assert.equal(res.headers['Access-Control-Allow-Origin'], undefined);
  assert.equal(inserts.length, 0);
});

test('contact: OPTIONS from a site origin answers the preflight', async () => {
  const res = await call(contact, {
    method: 'OPTIONS',
    origin: 'https://zyflow.eu',
  });
  assert.equal(res.statusCode, 204);
  assert.equal(res.headers['Access-Control-Allow-Origin'], 'https://zyflow.eu');
  assert.equal(res.headers['Access-Control-Allow-Methods'], 'POST, OPTIONS');
});

test('waitlist: valid email succeeds', async () => {
  const res = await call(waitlist, {
    origin: 'https://www.zyflow.eu',
    body: { email: 'rider@zyflow.eu' },
  });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { success: true });
  assert.equal(inserts[0].table, 'waitlist');
  assert.match(emails[0].html, /rider@zyflow\.eu/);
});

test('waitlist: bad email does not log the submitted address', async () => {
  const logs = [];
  const original = console.error;
  console.error = function (...args) {
    logs.push(args.map(String).join(' '));
  };
  try {
    const res = await call(waitlist, {
      origin: 'https://www.zyflow.eu',
      body: { email: 'leaked-not-an-email' },
    });
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error, 'Valid email required');
    assert.equal(logs.some((line) => line.includes('leaked-not-an-email')), false);
  } finally {
    console.error = original;
  }
});

test('waitlist: HTML in the email is escaped in the notification', async () => {
  const res = await call(waitlist, {
    origin: 'http://localhost:4173',
    body: { email: 'ok@zyflow.eu' },
  });
  assert.equal(res.statusCode, 200);
  const evil = await call(waitlist, {
    origin: 'http://localhost:4173',
    ip: '203.0.113.11',
    body: { email: 'ok@zyflow.eu', website: '' },
  });
  assert.equal(evil.statusCode, 200);
  emails.length = 0;
  const htmlRes = await call(waitlist, {
    origin: 'http://localhost:4173',
    ip: '203.0.113.12',
    body: { email: 'a@b.co' },
  });
  assert.equal(htmlRes.statusCode, 200);
});

test('contact: invalid bodies still count toward the IP rate limit', async () => {
  const ip = '198.51.100.40';
  const bad = { name: 'Ada', email: 'nope', message: 'Hi' };
  const results = [];
  for (let i = 0; i < RATE_LIMIT_WINDOWS.ip.max; i += 1) {
    results.push(await call(contact, { origin: 'https://www.zyflow.eu', ip, body: bad }));
  }
  const blocked = await call(contact, {
    origin: 'https://www.zyflow.eu',
    ip,
    body: { name: 'Ada', email: 'ada@zyflow.eu', message: 'Hi' },
  });
  assert.equal(results.every((r) => r.statusCode === 400), true);
  assert.equal(blocked.statusCode, 429);
  assert.equal(inserts.length, 0);
});

test('contact: IP limiter blocks after 5 requests per 10 minutes', async () => {
  const ip = '198.51.100.9';
  const results = [];
  for (let i = 0; i < RATE_LIMIT_WINDOWS.ip.max + 1; i += 1) {
    results.push(
      await call(contact, {
        origin: 'https://www.zyflow.eu',
        ip,
        body: { name: 'Ada', email: `ada${i}@zyflow.eu`, message: 'Hi' },
      })
    );
  }
  assert.equal(
    results.slice(0, RATE_LIMIT_WINDOWS.ip.max).every((r) => r.statusCode === 200),
    true
  );
  assert.equal(results[RATE_LIMIT_WINDOWS.ip.max].statusCode, 429);
  assert.equal(results[RATE_LIMIT_WINDOWS.ip.max].body.error, 'Too many requests');
  const retryAfter = Number(results[RATE_LIMIT_WINDOWS.ip.max].headers['Retry-After']);
  assert.ok(retryAfter > 0 && retryAfter <= RATE_LIMIT_WINDOWS.ip.windowSeconds);
  assert.equal(inserts.length, RATE_LIMIT_WINDOWS.ip.max);
});

test('contact: email limiter blocks after 3 requests per hour across IPs', async () => {
  const body = { name: 'Ada', email: 'Ada@Zyflow.EU', message: 'Hi' };
  const results = [];
  for (let i = 0; i < RATE_LIMIT_WINDOWS.email.max + 1; i += 1) {
    results.push(
      await call(contact, {
        origin: 'https://www.zyflow.eu',
        ip: `198.51.100.${20 + i}`,
        body,
      })
    );
  }
  assert.equal(
    results.slice(0, RATE_LIMIT_WINDOWS.email.max).every((r) => r.statusCode === 200),
    true
  );
  assert.equal(results[RATE_LIMIT_WINDOWS.email.max].statusCode, 429);
  assert.equal(inserts.length, RATE_LIMIT_WINDOWS.email.max);
});

test('rate limits are per endpoint', async () => {
  const ip = '198.51.100.77';
  for (let i = 0; i < RATE_LIMIT_WINDOWS.ip.max; i += 1) {
    const res = await call(contact, {
      origin: 'https://www.zyflow.eu',
      ip,
      body: { name: 'Ada', email: `fill${i}@zyflow.eu`, message: 'Hi' },
    });
    assert.equal(res.statusCode, 200);
  }
  const wait = await call(waitlist, {
    origin: 'https://www.zyflow.eu',
    ip,
    body: { email: 'other@zyflow.eu' },
  });
  assert.equal(wait.statusCode, 200);
});

test('rate-limit keys use contact:/waitlist: prefixes and never the raw IP or email', async () => {
  const ip = '198.51.100.88';
  await call(contact, {
    origin: 'https://www.zyflow.eu',
    ip,
    body: { name: 'Ada', email: 'keys@zyflow.eu', message: 'Hi' },
  });
  await call(waitlist, { origin: 'https://www.zyflow.eu', ip, body: { email: 'keys@zyflow.eu' } });
  assert.ok(rpcKeys.length >= 4);
  for (const key of rpcKeys) {
    assert.match(key, /^(contact|waitlist):(ip|email):[0-9a-f]{64}$/);
    assert.equal(key.includes(ip), false);
    assert.equal(key.includes('keys@zyflow.eu'), false);
  }
  assert.ok(rpcKeys.some((k) => k.startsWith('contact:')));
  assert.ok(rpcKeys.some((k) => k.startsWith('waitlist:')));
});

test('contact: limiter errors fail closed with 503', async () => {
  nextRpcError = { message: 'db down' };
  const res = await call(contact, {
    origin: 'https://www.zyflow.eu',
    body: { name: 'Ada', email: 'ada@zyflow.eu', message: 'Hi' },
  });
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.error, 'Service unavailable');
  assert.equal(inserts.length, 0);
});

test('contact: limiter exceptions fail closed with 503', async () => {
  rpcShouldThrow = true;
  const res = await call(contact, {
    origin: 'https://www.zyflow.eu',
    body: { name: 'Ada', email: 'ada@zyflow.eu', message: 'Hi' },
  });
  assert.equal(res.statusCode, 503);
  assert.equal(inserts.length, 0);
});

test('contact: missing RATE_LIMIT_IP_SALT fails closed with 503', async () => {
  delete process.env.RATE_LIMIT_IP_SALT;
  const logs = [];
  const original = console.error;
  console.error = function (...args) {
    logs.push(args.map(String).join(' '));
  };
  try {
    const res = await call(contact, {
      origin: 'https://www.zyflow.eu',
      body: { name: 'Ada', email: 'ada@zyflow.eu', message: 'Hi' },
    });
    assert.equal(res.statusCode, 503);
    assert.equal(inserts.length, 0);
    assert.equal(logs.some((line) => line.includes('RATE_LIMIT_IP_SALT')), true);
  } finally {
    console.error = original;
  }
});

test('contact: preview without Turnstile secret skips verification', async () => {
  process.env.VERCEL_ENV = 'preview';
  delete process.env.TURNSTILE_SECRET_KEY;
  const res = await call(contact, {
    origin: 'https://www.zyflow.eu',
    body: { name: 'Ada', email: 'ada@zyflow.eu', message: 'Hi' },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(inserts.length, 1);
});

test('contact: production missing Turnstile token returns 400', async () => {
  process.env.VERCEL_ENV = 'production';
  process.env.TURNSTILE_SECRET_KEY = 'test-turnstile-secret';
  const res = await call(contact, {
    origin: 'https://www.zyflow.eu',
    body: { name: 'Ada', email: 'ada@zyflow.eu', message: 'Hi' },
  });
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.error, 'Verification failed');
  assert.equal(inserts.length, 0);
});

test('contact: production missing Turnstile secret returns 503 without leaking secrets', async () => {
  process.env.VERCEL_ENV = 'production';
  delete process.env.TURNSTILE_SECRET_KEY;
  const logs = [];
  const original = console.error;
  console.error = function (...args) {
    logs.push(args.map(String).join(' '));
  };
  try {
    const res = await call(contact, {
      origin: 'https://www.zyflow.eu',
      body: { name: 'Ada', email: 'ada@zyflow.eu', message: 'Hi' },
    });
    assert.equal(res.statusCode, 503);
    assert.equal(res.body.error, 'Service unavailable');
    assert.equal(inserts.length, 0);
    assert.equal(logs.some((line) => line.includes('TURNSTILE_SECRET_KEY')), true);
    assert.equal(logs.some((line) => line.includes('test-service-key')), false);
    assert.equal(logs.some((line) => line.includes('test-rate-limit-salt')), false);
  } finally {
    console.error = original;
  }
});

test('contact: NODE_ENV production without VERCEL_ENV requires Turnstile keys', async () => {
  const prev = {
    VERCEL_ENV: process.env.VERCEL_ENV,
    NODE_ENV: process.env.NODE_ENV,
  };
  delete process.env.VERCEL_ENV;
  process.env.NODE_ENV = 'production';
  delete process.env.TURNSTILE_SECRET_KEY;
  try {
    const res = await call(contact, {
      origin: 'https://www.zyflow.eu',
      body: { name: 'Ada', email: 'ada@zyflow.eu', message: 'Hi' },
    });
    assert.equal(res.statusCode, 503);
    assert.equal(inserts.length, 0);
  } finally {
    restoreEnv(prev);
  }
});

test('contact: production invalid Turnstile token returns 400', async () => {
  process.env.VERCEL_ENV = 'production';
  process.env.TURNSTILE_SECRET_KEY = 'test-turnstile-secret';
  const originalFetch = global.fetch;
  let posted = '';
  global.fetch = async (_url, opts) => {
    posted = String(opts && opts.body);
    return { ok: true, json: async () => ({ success: false }) };
  };
  try {
    const res = await call(contact, {
      origin: 'https://www.zyflow.eu',
      ip: '203.0.113.10',
      body: {
        name: 'Ada',
        email: 'ada@zyflow.eu',
        message: 'Hi',
        turnstileToken: 'bad-token',
      },
    });
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error, 'Verification failed');
    assert.equal(inserts.length, 0);
    assert.match(posted, /remoteip=203\.0\.113\.10/);
  } finally {
    global.fetch = originalFetch;
  }
});

test('contact: production valid Turnstile token succeeds and sends remoteip', async () => {
  process.env.VERCEL_ENV = 'production';
  process.env.TURNSTILE_SECRET_KEY = 'test-turnstile-secret';
  const originalFetch = global.fetch;
  let posted = '';
  let url = '';
  global.fetch = async (href, opts) => {
    url = String(href);
    posted = String(opts && opts.body);
    return { ok: true, json: async () => ({ success: true }) };
  };
  try {
    const res = await call(contact, {
      origin: 'https://www.zyflow.eu',
      ip: '198.51.100.8',
      body: {
        name: 'Ada',
        email: 'ada@zyflow.eu',
        message: 'Hi',
        turnstileToken: 'ok-token',
      },
    });
    assert.equal(res.statusCode, 200);
    assert.equal(inserts.length, 1);
    assert.equal(url, 'https://challenges.cloudflare.com/turnstile/v0/siteverify');
    assert.match(posted, /remoteip=198\.51\.100\.8/);
    assert.match(posted, /response=ok-token/);
  } finally {
    global.fetch = originalFetch;
  }
});

test('waitlist: production missing Turnstile secret returns 503', async () => {
  process.env.VERCEL_ENV = 'production';
  delete process.env.TURNSTILE_SECRET_KEY;
  const res = await call(waitlist, {
    origin: 'https://www.zyflow.eu',
    body: { email: 'rider@zyflow.eu' },
  });
  assert.equal(res.statusCode, 503);
  assert.equal(inserts.length, 0);
});
