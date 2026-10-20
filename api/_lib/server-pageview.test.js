'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  POSTHOG_API_HOST,
  POSTHOG_CAPTURE_URL,
  POSTHOG_PROJECT_KEY,
  EVENT_NAME,
  DISTINCT_ID,
  ALLOWED_PAYLOAD_KEYS,
  ALLOWED_PROPERTY_KEYS,
  middlewareConfig,
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
} = require('./server-pageview');

function clientAnalyticsSource() {
  return fs.readFileSync(path.join(__dirname, '..', '..', 'rebuild', 'js', 'analytics-config.js'), 'utf8');
}

function request(url, { method = 'GET', headers = {} } = {}) {
  const headerMap = new Map(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), String(value)])
  );
  return {
    method,
    url,
    headers: {
      get(name) {
        return headerMap.get(String(name).toLowerCase()) || null;
      },
    },
  };
}

function page(url, headers) {
  return request(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/129.0.0.0 Safari/537.36',
      'sec-fetch-dest': 'document',
      'sec-fetch-mode': 'navigate',
      ...headers,
    },
  });
}

test('uses the same public PostHog EU key as analytics-config.js', () => {
  const source = clientAnalyticsSource();
  const key = source.match(/posthogProjectKey:\s*"([^"]+)"/)[1];
  const host = source.match(/posthogApiHost:\s*"([^"]+)"/)[1];
  assert.equal(key, POSTHOG_PROJECT_KEY);
  assert.equal(host, POSTHOG_API_HOST);
  assert.equal(POSTHOG_API_HOST, 'https://eu.i.posthog.com');
  assert.equal(POSTHOG_CAPTURE_URL, 'https://eu.i.posthog.com/i/v0/e/');
  assert.match(POSTHOG_PROJECT_KEY, /^phc_/);
});

test('Legal: fetch does not forward visitor IP or X-Forwarded-For', async () => {
  const calls = [];
  await sendCapture(
    page('https://www.zyflow.eu/about', {
      'x-forwarded-for': '203.0.113.88, 198.51.100.10',
      'x-real-ip': '203.0.113.88',
      'x-vercel-forwarded-for': '203.0.113.88',
      forwarded: 'for=203.0.113.88',
    }),
    {
      fetchFn: async (url, init) => {
        calls.push({ url, init });
        return { ok: true, status: 200 };
      },
    }
  );

  assert.equal(calls.length, 1);
  assert.deepEqual(Object.keys(calls[0].init.headers), ['Content-Type']);
  assert.equal(calls[0].init.headers['X-Forwarded-For'], undefined);
  assert.equal(calls[0].init.headers['x-forwarded-for'], undefined);
  const serialized = JSON.stringify(calls[0].init);
  assert.equal(serialized.includes('203.0.113.88'), false);
  assert.equal(serialized.includes('198.51.100.10'), false);
  assert.equal(serialized.includes('x-forwarded-for'), false);
  assert.equal(serialized.includes('X-Forwarded-For'), false);
  assert.equal(JSON.parse(calls[0].init.body).properties.$ip, null);
});

test('Legal: event sets $geoip_disable true and $process_person_profile false', () => {
  const payload = buildCapturePayload(page('https://www.zyflow.eu/'));
  assert.equal(payload.properties.$geoip_disable, true);
  assert.equal(payload.properties.$process_person_profile, false);
  assert.equal(payload.properties.$ip, null);
});

test('Legal: referrer is host only, with no path or query', () => {
  const payload = buildCapturePayload(
    page('https://www.zyflow.eu/tours', {
      referer: 'https://news.example:8443/path/to/article?id=99&q=zyflow#comments',
    })
  );
  assert.equal(payload.properties.referrer_host, 'news.example');
  assert.equal(payload.properties.referrer_host.includes('/'), false);
  assert.equal(payload.properties.referrer_host.includes('?'), false);
  assert.equal(payload.properties.referrer_host.includes('#'), false);
  assert.equal(payload.properties.referrer_host.includes('id=99'), false);
  assert.equal(payload.properties.referrer_host.includes('8443'), false);
  const serialized = JSON.stringify(payload);
  assert.equal(serialized.includes('/path/to/article'), false);
  assert.equal(serialized.includes('q=zyflow'), false);
});

test('Legal: path strips query strings and fragments', () => {
  assert.equal(pathnameOf(page('https://www.zyflow.eu/about?utm_source=news&email=a@b.c#faq')), '/about');
  assert.equal(pathnameOf(page('https://www.zyflow.eu/sl/contact/?ref=1#top')), '/sl/contact');
  assert.equal(pathnameOf(page('/press?foo=1#bar')), '/press');

  const payload = buildCapturePayload(
    page('https://www.zyflow.eu/about?utm_source=news&email=rider@example.com#faq')
  );
  assert.equal(payload.properties.path, '/about');
  assert.equal(payload.properties.path.includes('?'), false);
  assert.equal(payload.properties.path.includes('#'), false);
  const serialized = JSON.stringify(payload);
  assert.equal(serialized.includes('utm_source'), false);
  assert.equal(serialized.includes('rider@example.com'), false);
  assert.equal(serialized.includes('#faq'), false);
});

test('Legal: payload has no user agent or device data, only path locale referrer_host plus required flags', () => {
  const payload = buildCapturePayload(
    page('https://www.zyflow.eu/sl/about?device=iphone', {
      'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
      'sec-ch-ua': '"Chromium";v="129"',
      'sec-ch-ua-mobile': '?1',
      'sec-ch-ua-platform': '"iOS"',
    })
  );
  assert.deepEqual(Object.keys(payload), ALLOWED_PAYLOAD_KEYS);
  assert.deepEqual(Object.keys(payload.properties), ALLOWED_PROPERTY_KEYS);
  assert.deepEqual(Object.keys(payload.properties).filter((key) => !key.startsWith('$')).sort(), [
    'locale',
    'path',
    'referrer_host',
  ]);
  const serialized = JSON.stringify(payload);
  assert.equal(/user-agent|User-Agent|iPhone|Chromium|sec-ch-ua|Mac OS X/i.test(serialized), false);
  assert.equal(serialized.includes('device=iphone'), false);
});

test('payload is allowlisted: constant anonymous id, no IP, geoip off', () => {
  const payload = buildCapturePayload(
    page('https://www.zyflow.eu/about?utm_source=newsletter&email=rider@example.com', {
      referer: 'https://www.google.com/search?q=zyflow&hl=en',
      'user-agent': 'Mozilla/5.0 (secret-browser-build)',
      'x-forwarded-for': '203.0.113.50',
      'x-real-ip': '203.0.113.50',
      cookie: 'ph_phc_test=secret; cc_cookie=1',
    })
  );

  assert.deepEqual(Object.keys(payload), ALLOWED_PAYLOAD_KEYS);
  assert.deepEqual(Object.keys(payload.properties), ALLOWED_PROPERTY_KEYS);
  assert.equal(payload.event, EVENT_NAME);
  assert.equal(payload.event, 'server_pageview');
  assert.equal(payload.distinct_id, DISTINCT_ID);
  assert.equal(payload.distinct_id, 'anonymous');
  assert.equal(payload.api_key, POSTHOG_PROJECT_KEY);
  assert.equal(payload.properties.$process_person_profile, false);
  assert.equal(payload.properties.$ip, null);
  assert.equal(payload.properties.$geoip_disable, true);
  assert.equal(payload.properties.path, '/about');
  assert.equal(payload.properties.locale, 'en');
  assert.equal(payload.properties.referrer_host, 'www.google.com');

  const serialized = JSON.stringify(payload);
  assert.equal(serialized.includes('203.0.113.50'), false);
  assert.equal(serialized.includes('secret-browser-build'), false);
  assert.equal(serialized.includes('utm_source'), false);
  assert.equal(serialized.includes('rider@example.com'), false);
  assert.equal(serialized.includes('ph_phc_test'), false);
  assert.equal(serialized.includes('cc_cookie'), false);
  assert.equal(serialized.includes('x-forwarded-for'), false);
  assert.equal(serialized.includes('User-Agent') || serialized.includes('user-agent'), false);
});

test('locale is en/sl from the path only', () => {
  assert.equal(localeFromPath('/'), 'en');
  assert.equal(localeFromPath('/tours'), 'en');
  assert.equal(localeFromPath('/sl'), 'sl');
  assert.equal(localeFromPath('/sl/'), 'sl');
  assert.equal(localeFromPath('/sl/about'), 'sl');
  assert.equal(localeFromPath('/legal-pages/izbris-racuna'), 'sl');
  assert.equal(buildCapturePayload(page('https://www.zyflow.eu/sl/contact')).properties.locale, 'sl');
});

test('referrer is hostname only; missing or invalid referrer is empty', () => {
  assert.equal(
    referrerHostOf(page('https://www.zyflow.eu/', { referer: 'https://maps.google.com/maps?q=ljubljana' })),
    'maps.google.com'
  );
  assert.equal(referrerHostOf(page('https://www.zyflow.eu/', { referer: 'not a url' })), '');
  assert.equal(referrerHostOf(page('https://www.zyflow.eu/')), '');
});

test('HTML page paths are counted; assets, api, and metadata files are not', () => {
  assert.equal(isHtmlPagePath('/'), true);
  assert.equal(isHtmlPagePath('/about'), true);
  assert.equal(isHtmlPagePath('/sl/blog/e-bike-charging-at-hospitality-stops'), true);
  assert.equal(isHtmlPagePath('/about.html'), true);
  assert.equal(isHtmlPagePath('/api/contact'), false);
  assert.equal(isHtmlPagePath('/api'), false);
  assert.equal(isHtmlPagePath('/assets/images/home/hero.jpg'), false);
  assert.equal(isHtmlPagePath('/css/app.css'), false);
  assert.equal(isHtmlPagePath('/js/home.js'), false);
  assert.equal(isHtmlPagePath('/favicon.ico'), false);
  assert.equal(isHtmlPagePath('/sitemap.xml'), false);
  assert.equal(isHtmlPagePath('/robots.txt'), false);
  assert.equal(isHtmlPagePath('/manifest.json'), false);
});

test('shouldCapture skips non-GET, bots, prefetch, and static paths', () => {
  assert.equal(shouldCapture(page('https://www.zyflow.eu/')), true);
  assert.equal(shouldCapture(page('https://www.zyflow.eu/sl')), true);
  assert.equal(shouldCapture(request('https://www.zyflow.eu/', { method: 'HEAD' })), false);
  assert.equal(shouldCapture(request('https://www.zyflow.eu/', { method: 'POST' })), false);
  assert.equal(shouldCapture(page('https://www.zyflow.eu/api/contact')), false);
  assert.equal(shouldCapture(page('https://www.zyflow.eu/css/home.css')), false);
  assert.equal(
    shouldCapture(page('https://www.zyflow.eu/', { 'user-agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)' })),
    false
  );
  assert.equal(
    shouldCapture(page('https://www.zyflow.eu/', { 'user-agent': 'Mozilla/5.0 HeadlessChrome/129.0.0.0' })),
    false
  );
  assert.equal(
    shouldCapture(page('https://www.zyflow.eu/', { purpose: 'prefetch' })),
    false
  );
  assert.equal(
    shouldCapture(page('https://www.zyflow.eu/', { 'sec-purpose': 'prefetch' })),
    false
  );
  assert.equal(
    shouldCapture(page('https://www.zyflow.eu/', { 'sec-fetch-dest': 'empty' })),
    false
  );
  assert.equal(isBotUserAgent('Slackbot-LinkExpanding 1.0'), true);
  assert.equal(isPrefetchRequest(page('https://www.zyflow.eu/', { 'x-moz': 'prefetch' })), true);
});

test('capture fetch sends only Content-Type and the allowlisted JSON body', async () => {
  const calls = [];
  await sendCapture(page('https://www.zyflow.eu/tours', { referer: 'https://example.net/path?q=1' }), {
    fetchFn: async (url, init) => {
      calls.push({ url, init });
      return { ok: true, status: 200 };
    },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, POSTHOG_CAPTURE_URL);
  assert.equal(calls[0].init.method, 'POST');
  assert.deepEqual(Object.keys(calls[0].init.headers), ['Content-Type']);
  assert.equal(calls[0].init.headers['Content-Type'], 'application/json');

  const body = JSON.parse(calls[0].init.body);
  assert.deepEqual(Object.keys(body), ALLOWED_PAYLOAD_KEYS);
  assert.deepEqual(Object.keys(body.properties), ALLOWED_PROPERTY_KEYS);
  assert.equal(body.properties.path, '/tours');
  assert.equal(body.properties.referrer_host, 'example.net');
  assert.equal(body.properties.$ip, null);
});

test('handleMiddleware is fire-and-forget: returns undefined and uses waitUntil', () => {
  const jobs = [];
  let fetchStarted = false;
  let resolveFetch;
  const fetchFn = () => {
    fetchStarted = true;
    return new Promise((resolve) => {
      resolveFetch = resolve;
    });
  };

  const result = handleMiddleware(page('https://www.zyflow.eu/press'), { waitUntil: (job) => jobs.push(job) }, { fetchFn });
  assert.equal(result, undefined);
  assert.equal(jobs.length, 1);
  assert.equal(fetchStarted, true);
  if (resolveFetch) resolveFetch({ ok: true });
});

test('handleMiddleware never throws when capture or waitUntil fails', () => {
  const fetchFn = async () => {
    throw new Error('network down');
  };
  assert.equal(
    handleMiddleware(
      page('https://www.zyflow.eu/'),
      {
        waitUntil() {
          throw new Error('waitUntil boom');
        },
      },
      { fetchFn }
    ),
    undefined
  );
  assert.equal(handleMiddleware(null, { waitUntil() {} }, { fetchFn }), undefined);
  assert.doesNotThrow(() => handleMiddleware(page('https://www.zyflow.eu/'), null, { fetchFn }));
});

test('handleMiddleware does not schedule captures for skipped requests', () => {
  const jobs = [];
  const context = { waitUntil: (job) => jobs.push(job) };
  handleMiddleware(page('https://www.zyflow.eu/assets/images/home/hero.jpg'), context);
  handleMiddleware(page('https://www.zyflow.eu/', { purpose: 'prefetch' }), context);
  handleMiddleware(request('https://www.zyflow.eu/', { method: 'HEAD' }), context);
  assert.equal(jobs.length, 0);
});

test('middleware matcher skips api and hashed static prefixes', () => {
  assert.equal(middlewareConfig.runtime, 'nodejs');
  assert.ok(Array.isArray(middlewareConfig.matcher));
  const matcher = middlewareConfig.matcher.join(' ');
  assert.match(matcher, /api/);
  assert.match(matcher, /assets/);
  assert.match(matcher, /css/);
  assert.match(matcher, /js/);
});

test('proxy entrypoint is CommonJS and does not return a body', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'server-pageview-middleware.js'), 'utf8');
  assert.match(source, /handleMiddleware/);
  assert.match(source, /module\.exports/);
  assert.equal(/export default/.test(source), false);
  assert.equal(/new Response\(/.test(source), false);
  assert.equal(/set-cookie/i.test(source), false);
  assert.equal(/x-forwarded-for/i.test(source), false);
  const vercel = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'vercel.json'), 'utf8'));
  assert.equal(vercel.proxy.entrypoint, 'server-pageview-middleware.js');
  assert.ok(Array.isArray(vercel.proxy.matcher));
  assert.match(vercel.proxy.matcher.join(' '), /api/);
});

const LEGAL_EN =
  "Without using cookies or running any code on your device, our hosting server counts page views anonymously: for each page request it sends only the page address, language and the referring website's domain to our analytics provider PostHog (EU cloud, acting as our processor), with no IP address, device information or identifier, to measure website reach (legitimate interest, Art. 6(1)(f) GDPR).";
const LEGAL_SL =
  'Brez piškotkov in brez izvajanja kakršne koli kode na vaši napravi naš strežnik anonimno šteje oglede strani: za vsako zahtevo strani našemu ponudniku analitike PostHog (oblak v EU, ki deluje kot naš obdelovalec) pošlje le naslov strani, jezik in domeno spletnega mesta, s katerega ste prišli, brez naslova IP, podatkov o napravi ali identifikatorja, za merjenje dosega spletnega mesta (zakoniti interes, točka (f) prvega odstavka 6. člena Splošne uredbe o varstvu podatkov).';
const PORTAL_EN =
  'On our partner portal (app.zyflow.eu) we use PostHog (EU cloud) only if you agree after signing in, with separate choices for usage statistics and for session recordings. Session recordings show your clicks and page views with all text and form inputs hidden, and are kept for 30 days. You can change your choices at any time in the portal settings.';
const PORTAL_SL =
  'Na partnerskem portalu (app.zyflow.eu) PostHog (oblak v EU) uporabljamo le, če po prijavi privolite, pri čemer ločeno izberete statistiko uporabe in snemanje sej. Posnetki sej prikazujejo vaše klike in oglede strani, pri čemer so vsa besedila in vnosi v obrazce skriti, hranimo pa jih 30 dni. Izbiro lahko kadar koli spremenite v nastavitvah portala.';

function readLegal(name) {
  return fs.readFileSync(path.join(__dirname, '..', '..', 'rebuild', 'legal-src', name), 'utf8');
}

function markdownSection(md, heading) {
  const startToken = `## ${heading}\n`;
  const start = md.indexOf(startToken);
  assert.ok(start >= 0, `missing section ${heading}`);
  const from = start + startToken.length;
  const next = md.indexOf('\n## ', from);
  return md.slice(from, next === -1 ? md.length : next).trim();
}

test('Legal sentence is the final paragraph of Privacy Policy section 12 (EN + SL)', () => {
  const en = markdownSection(readLegal('privacy-policy.en.md'), '12. Website and cookies');
  const sl = markdownSection(readLegal('privacy-policy.sl.md'), '12. Spletno mesto in piškotki');
  assert.equal(en.includes(LEGAL_EN), true);
  assert.equal(sl.includes(LEGAL_SL), true);
  assert.equal(en.includes(PORTAL_EN), true);
  assert.equal(sl.includes(PORTAL_SL), true);
  assert.ok(en.trimEnd().endsWith(PORTAL_EN) || en.trimEnd().endsWith(`> ${PORTAL_EN}`));
  assert.ok(sl.trimEnd().endsWith(PORTAL_SL) || sl.trimEnd().endsWith(`> ${PORTAL_SL}`));
  assert.ok(en.indexOf('The mobile app does not use browser cookies') < en.indexOf(LEGAL_EN));
  assert.ok(sl.indexOf('Mobilna aplikacija ne uporablja brskalniških piškotkov') < sl.indexOf(LEGAL_SL));
  assert.ok(en.indexOf(LEGAL_EN) < en.indexOf(PORTAL_EN));
  assert.ok(sl.indexOf(LEGAL_SL) < sl.indexOf(PORTAL_SL));
});

test('Legal sentence follows the no-analytics-cookies statement in Cookie Policy section 2 (EN + SL)', () => {
  const en = markdownSection(readLegal('cookie-policy.en.md'), '2. Our current use of cookies');
  const sl = markdownSection(readLegal('cookie-policy.sl.md'), '2. Trenutna uporaba piškotkov');
  assert.equal(en.includes('use no analytics, advertising or other non-essential cookies'), true);
  assert.equal(sl.includes('ne uporabljajo analitičnih, oglaševalskih ali drugih nenujnih piškotkov'), true);
  assert.ok(en.indexOf(LEGAL_EN) > en.indexOf('use no analytics, advertising or other non-essential cookies'));
  assert.ok(
    sl.indexOf(LEGAL_SL) > sl.indexOf('ne uporabljajo analitičnih, oglaševalskih ali drugih nenujnih piškotkov')
  );
  assert.equal(en.includes(LEGAL_EN), true);
  assert.equal(sl.includes(LEGAL_SL), true);
});
