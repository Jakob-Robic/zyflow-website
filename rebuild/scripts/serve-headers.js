#!/usr/bin/env node
/**
 * Serve rebuild/dist with vercel.json headers applied, plus local /api handlers.
 * Used to verify CSP / ACAO / form POSTs without deploying.
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const VERCEL = JSON.parse(fs.readFileSync(path.join(ROOT, '..', 'vercel.json'), 'utf8'));
const PORT = Number(process.env.PORT) || 4173;

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'local-test-key';
process.env.BREVO_API_KEY = process.env.BREVO_API_KEY || 'local-test-key';
process.env.NOTIFICATION_EMAIL = process.env.NOTIFICATION_EMAIL || 'owner@example.com';

const Module = require('module');
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === '@supabase/supabase-js') {
    return {
      createClient() {
        return {
          from() {
            return {
              async insert() {
                return { error: null };
              },
            };
          },
        };
      },
    };
  }
  if (request === './brevo' || (typeof request === 'string' && request.endsWith('/brevo'))) {
    return {
      async sendBrevoEmail() {
        return;
      },
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const contact = require('../../api/contact');
const waitlist = require('../../api/waitlist');
const cspReport = require('../../api/csp-report');

function matchesSource(source, pathname) {
  if (source === '/(.*)') return true;
  if (source === '/((?!api/).*)') return !pathname.startsWith('/api/');
  if (source === '/assets/(.*)') return pathname.startsWith('/assets/');
  if (source === '/css/(.*)') return pathname.startsWith('/css/');
  if (source === '/js/(.*)') return pathname.startsWith('/js/');
  return false;
}

function headersFor(pathname) {
  const out = {};
  for (const block of VERCEL.headers || []) {
    if (!matchesSource(block.source, pathname)) continue;
    for (const h of block.headers) out[h.key] = h.value;
  }
  return out;
}

/**
 * vercel.json rewrites with a plain `/a/:b` source and a same-site destination
 * (e.g. /o/:kind/:id -> /open), so links like /o/route/<id> work locally too.
 */
function rewritePath(pathname) {
  for (const rule of VERCEL.rewrites || []) {
    const { source, destination } = rule;
    if (typeof source !== 'string' || typeof destination !== 'string') continue;
    if (!destination.startsWith('/') || /[()*+?]/.test(source)) continue;
    const pattern = source
      .split('/')
      .map((part) => (part.startsWith(':') ? '[^/]+' : part.replace(/[.\\^$|{}[\]]/g, '\\$&')))
      .join('/');
    if (new RegExp(`^${pattern}$`).test(pathname) && !/:\w/.test(destination)) return destination;
  }
  return pathname;
}

function resolveFile(urlPath) {
  let clean = decodeURIComponent(urlPath.split('?')[0]);
  if (clean.length > 1 && clean.endsWith('/')) clean = clean.slice(0, -1);
  const candidates = [];
  if (clean === '/') candidates.push(path.join(DIST, 'index.html'));
  else {
    candidates.push(path.join(DIST, clean));
    if (!path.extname(clean)) candidates.push(path.join(DIST, `${clean}.html`));
    candidates.push(path.join(DIST, clean, 'index.html'));
  }
  for (const file of candidates) {
    if (file.startsWith(DIST) && fs.existsSync(file) && fs.statSync(file).isFile()) {
      return file;
    }
  }
  return null;
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8',
};

function wrapRes(res, pathname) {
  const applied = headersFor(pathname);
  const api = {
    headers: {},
    statusCode: 200,
    body: undefined,
    ended: false,
    setHeader(key, value) {
      this.headers[key] = value;
      res.setHeader(key, value);
    },
    status(code) {
      this.statusCode = code;
      res.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(payload));
      this.ended = true;
      return this;
    },
    end(data) {
      if (data !== undefined) res.end(data);
      else res.end();
      this.ended = true;
      return this;
    },
  };
  for (const [key, value] of Object.entries(applied)) {
    res.setHeader(key, value);
  }
  return api;
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve(raw);
      }
    });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const pathname = url.pathname;
  const wrapped = wrapRes(res, pathname);

  if (pathname.startsWith('/api/')) {
    req.body = await readBody(req);
    if (pathname === '/api/contact') return contact(req, wrapped);
    if (pathname === '/api/waitlist') return waitlist(req, wrapped);
    if (pathname === '/api/csp-report') return cspReport(req, wrapped);
    wrapped.status(404).json({ error: 'Not found' });
    return;
  }

  const file = resolveFile(rewritePath(pathname));
  if (!file) {
    res.statusCode = 404;
    res.end('Not found');
    return;
  }
  const ext = path.extname(file).toLowerCase();
  res.setHeader('Content-Type', TYPES[ext] || 'application/octet-stream');
  res.end(fs.readFileSync(file));
});

if (require.main === module) {
  server.listen(PORT, '127.0.0.1', () => {
    console.log(`serving ${path.relative(process.cwd(), DIST)} with vercel.json headers on http://127.0.0.1:${PORT}`);
    const sample = headersFor('/contact');
    console.log('sample /contact headers:', JSON.stringify(sample, null, 2));
  });
}

module.exports = { headersFor, matchesSource, rewritePath, server };
