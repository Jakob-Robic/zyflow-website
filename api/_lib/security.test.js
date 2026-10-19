'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  escapeHtml,
  stripCrlf,
  isValidEmail,
  isAllowedOrigin,
  isProductionEnv,
  honeypotFilled,
  readContactFields,
  readWaitlistFields,
} = require('./security');

test('escapeHtml encodes markup and quotes', () => {
  assert.equal(
    escapeHtml(`<img src=x onerror=alert(1) foo="bar" baz='q'>`),
    '&lt;img src=x onerror=alert(1) foo=&quot;bar&quot; baz=&#39;q&#39;&gt;'
  );
});

test('stripCrlf removes header-breaking characters', () => {
  assert.equal(stripCrlf('Hello\r\nBcc: evil@example.com'), 'Hello Bcc: evil@example.com');
});

test('isValidEmail accepts a normal address and rejects junk', () => {
  assert.equal(isValidEmail('rider@zyflow.eu'), true);
  assert.equal(isValidEmail('not-an-email'), false);
  assert.equal(isValidEmail('a@b'), false);
  assert.equal(isValidEmail('a@b.c\nextra'), false);
});

test('isAllowedOrigin allows production and localhost, not look-alike previews', () => {
  const prev = {
    VERCEL_ENV: process.env.VERCEL_ENV,
    VERCEL_URL: process.env.VERCEL_URL,
    VERCEL_BRANCH_URL: process.env.VERCEL_BRANCH_URL,
    VERCEL_PREVIEW_TEAM: process.env.VERCEL_PREVIEW_TEAM,
    ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS,
  };
  try {
    delete process.env.VERCEL_ENV;
    delete process.env.VERCEL_URL;
    delete process.env.VERCEL_BRANCH_URL;
    delete process.env.VERCEL_PREVIEW_TEAM;
    delete process.env.ALLOWED_ORIGINS;

    assert.equal(isAllowedOrigin('https://www.zyflow.eu'), true);
    assert.equal(isAllowedOrigin('https://zyflow.eu'), true);
    assert.equal(isAllowedOrigin('http://localhost:4173'), true);
    assert.equal(isAllowedOrigin('https://evil.example'), false);
    assert.equal(isAllowedOrigin('https://evil.vercel.app'), false);
    assert.equal(isAllowedOrigin('https://zyflow-landing-evil.vercel.app'), false);
    assert.equal(isAllowedOrigin('https://zyflow-landing-git-main.vercel.app'), false);

    process.env.VERCEL_ENV = 'production';
    process.env.VERCEL_URL = 'zyflow-landing-abc123-jakobs-projects-48c1181f.vercel.app';
    assert.equal(isAllowedOrigin('https://zyflow-landing-abc123-jakobs-projects-48c1181f.vercel.app'), true);
    assert.equal(isAllowedOrigin('https://zyflow-landing-evil.vercel.app'), false);
    assert.equal(isAllowedOrigin('https://zyflow-landing-otherhash-jakobs-projects-48c1181f.vercel.app'), false);
    assert.equal(isAllowedOrigin('https://zyflow-landing-git-feat-jakobs-projects-48c1181f.vercel.app'), false);

    process.env.VERCEL_ENV = 'preview';
    process.env.VERCEL_URL = 'zyflow-landing-xyz789-jakobs-projects-48c1181f.vercel.app';
    assert.equal(isAllowedOrigin('https://zyflow-landing-xyz789-jakobs-projects-48c1181f.vercel.app'), true);
    assert.equal(isAllowedOrigin('https://zyflow-landing-git-cursor-secur-dd2cd4-jakobs-projects-48c1181f.vercel.app'), true);
    assert.equal(isAllowedOrigin('https://zyflow-landing-evil.vercel.app'), false);
    assert.equal(isAllowedOrigin('https://zyflow-landing-abc-evil.vercel.app'), false);
    assert.equal(isAllowedOrigin('https://zyflow-landing-xyz789-jakob-robic.vercel.app'), false);

    delete process.env.VERCEL_URL;
    assert.equal(isAllowedOrigin('https://zyflow-landing-abc123-jakobs-projects-48c1181f.vercel.app'), true);
    assert.equal(isAllowedOrigin('https://zyflow-landing-evil.vercel.app'), false);

    process.env.VERCEL_ENV = 'production';
    process.env.ALLOWED_ORIGINS = 'https://extra.example';
    assert.equal(isAllowedOrigin('https://extra.example'), true);
    assert.equal(isAllowedOrigin('https://zyflow-landing-git-feat-jakobs-projects-48c1181f.vercel.app'), false);
  } finally {
    for (const [key, value] of Object.entries(prev)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('isProductionEnv prefers VERCEL_ENV over NODE_ENV', () => {
  const prev = {
    VERCEL_ENV: process.env.VERCEL_ENV,
    NODE_ENV: process.env.NODE_ENV,
  };
  try {
    process.env.VERCEL_ENV = 'preview';
    process.env.NODE_ENV = 'production';
    assert.equal(isProductionEnv(), false);

    process.env.VERCEL_ENV = 'production';
    process.env.NODE_ENV = 'development';
    assert.equal(isProductionEnv(), true);

    delete process.env.VERCEL_ENV;
    process.env.NODE_ENV = 'production';
    assert.equal(isProductionEnv(), true);

    process.env.NODE_ENV = 'test';
    assert.equal(isProductionEnv(), false);
  } finally {
    for (const [key, value] of Object.entries(prev)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('honeypotFilled is true only when the hidden field has a value', () => {
  assert.equal(honeypotFilled({ website: '' }), false);
  assert.equal(honeypotFilled({ website: 'http://spam.test' }), true);
});

test('readContactFields enforces type, length, and email format', () => {
  assert.equal(readContactFields({ name: 'Ada', email: 'ada@zyflow.eu', message: 'Hi' }).name, 'Ada');
  assert.equal(readContactFields({ name: 'Ada', email: 'nope', message: 'Hi' }).error, 'Valid email required');
  assert.equal(
    readContactFields({ name: 'Ada', email: 'ada@zyflow.eu', message: 'x'.repeat(5001) }).error,
    'Input too long'
  );
  assert.equal(
    readContactFields({ name: 1, email: 'ada@zyflow.eu', message: 'Hi' }).error,
    'Invalid input'
  );
  const combined = `${'A'.repeat(100)} ${'B'.repeat(100)}`;
  assert.equal(combined.length, 201);
  assert.equal(
    readContactFields({ name: combined, email: 'ada@zyflow.eu', message: 'Hi' }).name,
    combined
  );
  assert.equal(
    readContactFields({ name: `${combined}X`, email: 'ada@zyflow.eu', message: 'Hi' }).error,
    'Input too long'
  );
});

test('readWaitlistFields keeps the existing invalid-email message', () => {
  assert.equal(readWaitlistFields({ email: 'bad' }).error, 'Valid email required');
  assert.equal(readWaitlistFields({ email: 'rider@zyflow.eu' }).email, 'rider@zyflow.eu');
});
