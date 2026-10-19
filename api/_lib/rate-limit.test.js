'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

process.env.RATE_LIMIT_IP_SALT = process.env.RATE_LIMIT_IP_SALT || 'test-rate-limit-salt';

const {
  RATE_LIMIT_WINDOWS,
  hashIdentifier,
  normalizeEmail,
  retryAfterSeconds,
} = require('./rate-limit');

test('windows are 5 per 10 minutes per IP and 3 per hour per email', () => {
  assert.equal(RATE_LIMIT_WINDOWS.ip.max, 5);
  assert.equal(RATE_LIMIT_WINDOWS.ip.windowSeconds, 600);
  assert.equal(RATE_LIMIT_WINDOWS.email.max, 3);
  assert.equal(RATE_LIMIT_WINDOWS.email.windowSeconds, 3600);
});

test('hashIdentifier never embeds the raw IP or email', () => {
  const ip = '203.0.113.10';
  const email = 'rider@zyflow.eu';
  const ipHash = hashIdentifier('ip', ip);
  const emailHash = hashIdentifier('email', email);
  assert.equal(ipHash.length, 64);
  assert.equal(emailHash.length, 64);
  assert.equal(ipHash.includes(ip), false);
  assert.equal(emailHash.includes(email), false);
  assert.equal(emailHash.includes('rider'), false);
  assert.notEqual(ipHash, emailHash);
  assert.equal(hashIdentifier('ip', ip), ipHash);
});

test('normalizeEmail trims and lowercases, and ignores non-emails', () => {
  assert.equal(normalizeEmail(' Ada@Zyflow.EU '), 'ada@zyflow.eu');
  assert.equal(normalizeEmail('nope'), '');
  assert.equal(normalizeEmail(''), '');
  assert.equal(normalizeEmail(null), '');
});

test('retryAfterSeconds derives Retry-After from reset_at', () => {
  const in90s = new Date(Date.now() + 90 * 1000).toISOString();
  const value = retryAfterSeconds(in90s, 600);
  assert.ok(value >= 89 && value <= 90);
  assert.equal(retryAfterSeconds(new Date(Date.now() - 1000).toISOString(), 600), 1);
  assert.equal(retryAfterSeconds(undefined, 600), 600);
  assert.equal(retryAfterSeconds('not a date', 600), 600);
});
