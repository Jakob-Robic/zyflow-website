'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { CSP_REPORT_ONLY, REPORTING_ENDPOINTS, STATIC_ACAO } = require('./csp-policy');

function loadVercel() {
  return JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'vercel.json'), 'utf8'));
}

function loadRebuildVercel() {
  return JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'rebuild', 'vercel.rebuild.json'), 'utf8'));
}

function headersFor(source) {
  const cfg = loadVercel();
  const block = cfg.headers.find((h) => h.source === source);
  assert.ok(block, `missing headers source ${source}`);
  return Object.fromEntries(block.headers.map((h) => [h.key, h.value]));
}

const STATIC_SOURCE = '/((?!api/|assets/design-system/fonts/).*)';
const FONTS_SOURCE = '/assets/design-system/fonts/(.*)';

test('static routes override Vercel ACAO *; only the design-system fonts use a wildcard', () => {
  const staticHeaders = headersFor(STATIC_SOURCE);
  assert.equal(staticHeaders['Access-Control-Allow-Origin'], STATIC_ACAO);
  assert.equal(STATIC_ACAO, 'https://www.zyflow.eu');

  // Auth emails load Tanker from here, so mail clients need any origin.
  assert.equal(headersFor(FONTS_SOURCE)['Access-Control-Allow-Origin'], '*');

  const wildcards = loadVercel().headers.filter((block) =>
    block.headers.some((h) => h.key === 'Access-Control-Allow-Origin' && h.value === '*')
  );
  assert.deepEqual(wildcards.map((block) => block.source), [FONTS_SOURCE]);
});

test('report-only CSP is inventoried, has reporting, and omits upgrade-insecure-requests', () => {
  const globalHeaders = headersFor('/(.*)');
  assert.equal(globalHeaders['Content-Security-Policy-Report-Only'], CSP_REPORT_ONLY);
  assert.equal(globalHeaders['Reporting-Endpoints'], REPORTING_ENDPOINTS);
  assert.equal(CSP_REPORT_ONLY.includes('upgrade-insecure-requests'), false);
  assert.equal(CSP_REPORT_ONLY.includes('report-uri /api/csp-report'), true);
  assert.equal(CSP_REPORT_ONLY.includes('report-to csp-endpoint'), true);
  assert.match(CSP_REPORT_ONLY, /googletagmanager\.com/);
  assert.match(CSP_REPORT_ONLY, /google-analytics\.com/);
  assert.match(CSP_REPORT_ONLY, /googleadservices\.com/);
  assert.match(CSP_REPORT_ONLY, /doubleclick\.net/);
  assert.match(CSP_REPORT_ONLY, /connect\.facebook\.net/);
  assert.match(CSP_REPORT_ONLY, /eu\.i\.posthog\.com/);
  assert.match(CSP_REPORT_ONLY, /eu-assets\.i\.posthog\.com/);
  assert.match(CSP_REPORT_ONLY, /challenges\.cloudflare\.com/);
  assert.match(CSP_REPORT_ONLY, /bzr\.openai\.com/);
  assert.equal(CSP_REPORT_ONLY.includes('unpkg.com'), false);
  assert.equal(CSP_REPORT_ONLY.includes('unpkg'), false);

  const rebuild = loadRebuildVercel();
  const rebuildGlobal = rebuild.headers.find((h) => h.source === '/(.*)');
  const rebuildCsp = rebuildGlobal.headers.find((h) => h.key === 'Content-Security-Policy-Report-Only');
  assert.equal(rebuildCsp.value, CSP_REPORT_ONLY);
  const rebuildAcao = rebuild.headers
    .find((h) => h.source === STATIC_SOURCE)
    .headers.find((h) => h.key === 'Access-Control-Allow-Origin');
  assert.equal(rebuildAcao.value, STATIC_ACAO);
});

test('legal redirects and existing security headers remain', () => {
  const cfg = loadVercel();
  const globalHeaders = headersFor('/(.*)');
  assert.equal(globalHeaders['X-Content-Type-Options'], 'nosniff');
  assert.equal(globalHeaders['X-Frame-Options'], 'DENY');
  assert.ok(cfg.redirects.some((r) => r.source === '/legal-pages/terms-conditions'));
  assert.ok(cfg.redirects.some((r) => r.source === '/sl/legal-privacy'));
});

test('the brand book at /brand is unlisted: rewritten to the synced kit and served noindex', () => {
  const cfg = loadVercel();
  const rewrite = cfg.rewrites.find((r) => r.source === '/brand');
  assert.equal(rewrite.destination, '/assets/design-system/brand/index.html');
  assert.ok(cfg.rewrites.some((r) => r.source === '/brand/downloads/:path*'));
  assert.equal(headersFor('/brand(/.*)?')['X-Robots-Tag'], 'noindex, nofollow');
  assert.equal(headersFor('/assets/design-system/brand/(.*)')['X-Robots-Tag'], 'noindex, nofollow');
  assert.ok(cfg.redirects.some((r) => r.source === '/styleguide' && r.destination === '/brand'));
  assert.ok(fs.existsSync(path.join(__dirname, '..', '..', 'rebuild', 'assets', 'design-system', 'brand', 'index.html')));
});
