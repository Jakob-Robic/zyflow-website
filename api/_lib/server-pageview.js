'use strict';

/**
 * Server-side page-view counter for the static marketing site.
 *
 * Called from Vercel Routing Middleware on HTML GET requests. The capture
 * is fire-and-forget: middleware must not await it, rewrite the body, set
 * cookies, or forward visitor IP / User-Agent / other headers to PostHog.
 *
 * Payload is intentionally tiny and non-identifying so the Legal sentences in
 * privacy-policy and cookie-policy (EN + SL) stay true.
 */

const POSTHOG_API_HOST = 'https://eu.i.posthog.com';
const POSTHOG_CAPTURE_PATH = '/i/v0/e/';
const POSTHOG_CAPTURE_URL = `${POSTHOG_API_HOST}${POSTHOG_CAPTURE_PATH}`;
const EVENT_NAME = 'server_pageview';
const DISTINCT_ID = 'anonymous';
const CAPTURE_TIMEOUT_MS = 2500;
const MAX_PATH_LENGTH = 512;
const MAX_HOST_LENGTH = 253;

/**
 * Same public ingestion key as rebuild/js/analytics-config.js (project 168051).
 * Kept as a literal so middleware never reads the client bundle at runtime.
 */
const POSTHOG_PROJECT_KEY = 'phc_Bidx6J3fgqBuQ92kHq68hJQcVkwXybr3MGvAEnvMGAme';

// /basemap/ and /media/ are proxied to embed.zyflow.eu (map assets, image proxy), not pages.
const STATIC_PREFIXES = ['/api/', '/assets/', '/css/', '/js/', '/fonts/', '/gtm/', '/basemap/', '/media/'];
const STATIC_FILES = new Set([
  '/api',
  '/favicon.ico',
  '/robots.txt',
  '/sitemap.xml',
  '/manifest.json',
  '/site.webmanifest',
]);

/** Used only to skip capture. Never copied into the PostHog payload or fetch. */
const BOT_UA_RE =
  /(?:^|[^a-z])(?:bot|crawler|spider|crawling|slurp|preview|prerender|lighthouse|pagespeed|pingdom|gtmetrix|headless|phantom|facebookexternalhit|facebot|twitterbot|slackbot|linkedinbot|whatsapp|telegram|applebot|bingbot|googlebot|duckduck|yandex|baidu|semrush|ahrefs|dotbot|petal|bytespider|gptbot|chatgpt|claudebot|ccbot|amazonbot|ia_archiver|uptime|monitor|wget|curl|httpclient|python-requests|axios\/|go-http-client|libwww)/i;

const middlewareConfig = {
  runtime: 'nodejs',
  matcher: [
    '/((?!api(?:/|$)|assets/|css/|js/|fonts/|favicon\\.ico$|robots\\.txt$|sitemap\\.xml$|manifest\\.json$|blog/rss\\.xml(?:$|\\?)|sl/blog/rss\\.xml(?:$|\\?)).*)',
  ],
};

const ALLOWED_PAYLOAD_KEYS = ['api_key', 'event', 'distinct_id', 'properties'];
const ALLOWED_PROPERTY_KEYS = [
  '$process_person_profile',
  '$ip',
  '$geoip_disable',
  'path',
  'locale',
  'referrer_host',
];

function clip(value, max) {
  const text = String(value == null ? '' : value);
  return text.length > max ? text.slice(0, max) : text;
}

function headerValue(request, name) {
  if (!request || !name) return '';
  const headers = request.headers;
  if (!headers) return '';
  const lower = name.toLowerCase();
  if (typeof headers.get === 'function') {
    return String(headers.get(name) || headers.get(lower) || '');
  }
  const raw = headers[name] || headers[lower] || headers[name.toUpperCase()];
  if (Array.isArray(raw)) return String(raw[0] || '');
  return raw == null ? '' : String(raw);
}

function requestUrl(request) {
  if (!request || request.url == null || request.url === '') return null;
  try {
    return new URL(String(request.url), 'https://www.zyflow.eu');
  } catch {
    return null;
  }
}

function normalizePathname(pathname) {
  if (!pathname || pathname === '') return '/';
  let next = String(pathname).split('?')[0].split('#')[0];
  if (!next.startsWith('/')) next = `/${next}`;
  if (next.length > 1 && next.endsWith('/')) next = next.slice(0, -1);
  return clip(next, MAX_PATH_LENGTH) || '/';
}

function pathnameOf(request) {
  const url = requestUrl(request);
  return normalizePathname(url ? url.pathname : '/');
}

function localeFromPath(pathname) {
  const pathName = normalizePathname(pathname);
  if (pathName === '/sl' || pathName.startsWith('/sl/')) return 'sl';
  // SL account-deletion URL is unprefixed (see rebuild/scripts/pages.js).
  if (pathName === '/legal-pages/izbris-racuna') return 'sl';
  return 'en';
}

function referrerHostOf(request) {
  const referer = headerValue(request, 'referer') || headerValue(request, 'referrer');
  if (!referer) {
    const fallback = request && typeof request.referrer === 'string' ? request.referrer : '';
    if (!fallback || fallback === 'about:client' || fallback === 'about:blank') return '';
    return hostOnly(fallback);
  }
  return hostOnly(referer);
}

function hostOnly(value) {
  if (!value || typeof value !== 'string') return '';
  try {
    const url = new URL(value);
    return clip(url.hostname || '', MAX_HOST_LENGTH);
  } catch {
    return '';
  }
}

function isHtmlPagePath(pathname) {
  const pathName = normalizePathname(pathname);
  if (STATIC_FILES.has(pathName)) return false;
  for (const prefix of STATIC_PREFIXES) {
    if (pathName === prefix.slice(0, -1) || pathName.startsWith(prefix)) return false;
  }
  const base = pathName.split('/').pop() || '';
  if (base.includes('.')) {
    const ext = base.slice(base.lastIndexOf('.') + 1).toLowerCase();
    if (ext === 'html' || ext === 'htm') return true;
    return false;
  }
  return true;
}

function isBotUserAgent(userAgent) {
  if (!userAgent || typeof userAgent !== 'string') return false;
  return BOT_UA_RE.test(userAgent);
}

function isPrefetchRequest(request) {
  const purpose = `${headerValue(request, 'purpose')} ${headerValue(request, 'sec-purpose')} ${headerValue(request, 'x-purpose')}`.toLowerCase();
  if (purpose.includes('prefetch') || purpose.includes('prerender') || purpose.includes('preview')) {
    return true;
  }
  if (headerValue(request, 'next-router-prefetch') === '1') return true;
  if (headerValue(request, 'x-moz') === 'prefetch') return true;
  const dest = headerValue(request, 'sec-fetch-dest').toLowerCase();
  if (dest && dest !== 'document') return true;
  const mode = headerValue(request, 'sec-fetch-mode').toLowerCase();
  if (mode === 'prefetch') return true;
  return false;
}

function shouldCapture(request) {
  if (!request) return false;
  const method = String(request.method || 'GET').toUpperCase();
  if (method !== 'GET') return false;
  if (!isHtmlPagePath(pathnameOf(request))) return false;
  if (isBotUserAgent(headerValue(request, 'user-agent'))) return false;
  if (isPrefetchRequest(request)) return false;
  return true;
}

function buildCapturePayload(request) {
  const pathName = pathnameOf(request);
  return {
    api_key: POSTHOG_PROJECT_KEY,
    event: EVENT_NAME,
    distinct_id: DISTINCT_ID,
    properties: {
      $process_person_profile: false,
      $ip: null,
      $geoip_disable: true,
      path: pathName,
      locale: localeFromPath(pathName),
      referrer_host: referrerHostOf(request),
    },
  };
}

function captureHeaders() {
  return { 'Content-Type': 'application/json' };
}

function payloadPropertyKeys(payload) {
  return payload && payload.properties ? Object.keys(payload.properties) : [];
}

function assertAllowlistedPayload(payload) {
  const keys = Object.keys(payload);
  if (keys.length !== ALLOWED_PAYLOAD_KEYS.length || keys.some((key) => !ALLOWED_PAYLOAD_KEYS.includes(key))) {
    throw new Error('server_pageview payload keys are not allowlisted');
  }
  const propKeys = payloadPropertyKeys(payload);
  if (
    propKeys.length !== ALLOWED_PROPERTY_KEYS.length ||
    propKeys.some((key) => !ALLOWED_PROPERTY_KEYS.includes(key))
  ) {
    throw new Error('server_pageview property keys are not allowlisted');
  }
}

function abortSignal(timeoutMs) {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(timeoutMs);
  }
  if (typeof AbortController === 'undefined') return undefined;
  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeoutMs);
  return controller.signal;
}

async function sendCapture(request, options) {
  const fetchFn = (options && options.fetchFn) || globalThis.fetch;
  if (typeof fetchFn !== 'function') return;
  const payload = buildCapturePayload(request);
  assertAllowlistedPayload(payload);
  try {
    await fetchFn(POSTHOG_CAPTURE_URL, {
      method: 'POST',
      headers: captureHeaders(),
      body: JSON.stringify(payload),
      signal: abortSignal(CAPTURE_TIMEOUT_MS),
    });
  } catch {
    // Capture is best-effort. Failures must never surface to the page.
  }
}

function handleMiddleware(request, context, options) {
  try {
    if (!shouldCapture(request)) return undefined;
    const job = sendCapture(request, options);
    if (context && typeof context.waitUntil === 'function') {
      context.waitUntil(job);
    } else if (job && typeof job.catch === 'function') {
      job.catch(() => {});
    }
  } catch {
    // Routing middleware must never throw or replace the static HTML response.
  }
  return undefined;
}

module.exports = {
  POSTHOG_API_HOST,
  POSTHOG_CAPTURE_URL,
  POSTHOG_PROJECT_KEY,
  EVENT_NAME,
  DISTINCT_ID,
  ALLOWED_PAYLOAD_KEYS,
  ALLOWED_PROPERTY_KEYS,
  middlewareConfig,
  headerValue,
  requestUrl,
  pathnameOf,
  localeFromPath,
  referrerHostOf,
  isHtmlPagePath,
  isBotUserAgent,
  isPrefetchRequest,
  shouldCapture,
  buildCapturePayload,
  captureHeaders,
  sendCapture,
  handleMiddleware,
};
