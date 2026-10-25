'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('module');

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'test-service-key';
process.env.RATE_LIMIT_IP_SALT = process.env.RATE_LIMIT_IP_SALT || 'test-rate-limit-salt';
process.env.VERCEL_ENV = 'preview';

const recorded = [];
let nextRecordError = null;

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === '@supabase/supabase-js') {
    return {
      createClient() {
        return {
          async rpc(name, args) {
            if (name === 'take_rate_limit_token') {
              return { data: { allowed: true, remaining: 4, reset_at: new Date().toISOString() }, error: null };
            }
            if (name === 'record_business_event') {
              recorded.push(args);
              const error = nextRecordError;
              nextRecordError = null;
              return { data: null, error };
            }
            return { data: null, error: { message: 'unknown rpc' } };
          },
        };
      },
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const businessEvent = require('../business-event');
const { resetRateLimits } = require('./security');
const { resetSupabaseClient } = require('./supabase');

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

async function call(body, { ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile' } = {}) {
  const req = {
    method: 'POST',
    headers: { origin: 'https://www.zyflow.eu', 'x-forwarded-for': '203.0.113.20', 'user-agent': ua },
    body,
    socket: { remoteAddress: '203.0.113.20' },
  };
  const res = mockRes();
  await businessEvent(req, res);
  return res;
}

test.beforeEach(() => {
  recorded.length = 0;
  nextRecordError = null;
  resetRateLimits();
  resetSupabaseClient();
});

test('business-event: records a store redirect with cleaned fields', async () => {
  const res = await call({
    slug: 'Glamping-Forest-Edge',
    event: 'store_redirect',
    surface: 'qr',
    routeId: '550e8400-e29b-41d4-a716-446655440000',
    lang: 'sl',
  });
  assert.equal(res.statusCode, 204);
  assert.deepEqual(recorded, [
    {
      p_slug: 'glamping-forest-edge',
      p_event: 'store_redirect',
      p_surface: 'qr',
      p_route_id: '550e8400-e29b-41d4-a716-446655440000',
      p_stop_poi_id: null,
      p_lang: 'sl',
      p_device: 'mobile',
    },
  ]);
});

test('business-event: drops unknown surface, bad route id and bad language', async () => {
  const res = await call(
    { slug: 'hotel-x', event: 'store_redirect', surface: 'email', routeId: 'nope', lang: '<script>' },
    { ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)' }
  );
  assert.equal(res.statusCode, 204);
  assert.equal(recorded[0].p_surface, null);
  assert.equal(recorded[0].p_route_id, null);
  assert.equal(recorded[0].p_lang, null);
  assert.equal(recorded[0].p_device, 'desktop');
});

test('business-event: rejects other events and invalid slugs', async () => {
  for (const body of [
    { slug: 'hotel-x', event: 'install_attributed' },
    { slug: 'hotel x', event: 'store_redirect' },
    { slug: 'a'.repeat(65), event: 'store_redirect' },
    {},
  ]) {
    const res = await call(body);
    assert.equal(res.statusCode, 400);
  }
  assert.equal(recorded.length, 0);
});

test('business-event: database error returns 500', async () => {
  nextRecordError = { code: 'XX000' };
  const res = await call({ slug: 'hotel-x', event: 'store_redirect' });
  assert.equal(res.statusCode, 500);
});
