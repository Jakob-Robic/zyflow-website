'use strict';

/**
 * js/open-app.js: computers forward /o/... links to the web planner, phones and
 * tablets keep the "Open this in Zyflow" page. Runs the script in a sandbox.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'js', 'open-app.js'), 'utf8');
const ROUTE_ID = '2e85eaa2-4c0f-4406-aaf4-fbb622a2545e';

const DESKTOP_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const DESKTOP_WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';

const STORE_LINKS = require('./store-links');
const OPEN_HTML = fs.readFileSync(path.join(__dirname, '..', 'pages', 'open.html'), 'utf8');
const PACKAGE = 'com.jakob_robic.zyflowmobileapp';

const SAMSUNG = 'Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36';
const ANDROID_WEBVIEW = 'Mozilla/5.0 (Linux; Android 15; Pixel 9; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0 Mobile Safari/537.36 Instagram 350.0';
const ANDROID_FIREFOX = 'Mozilla/5.0 (Android 15; Mobile; rv:132.0) Gecko/132.0 Firefox/132.0';

/** A tiny stand-in for the open page's elements (rebuild/pages/open.html). */
function fakeElement(attrs = {}, text = '') {
  const classes = new Set();
  return {
    attrs: { ...attrs },
    textContent: text,
    hidden: false,
    listeners: {},
    classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), has: (c) => classes.has(c) },
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null;
    },
    setAttribute(name, value) {
      this.attrs[name] = String(value);
    },
    addEventListener(type, fn) {
      this.listeners[type] = fn;
    },
  };
}

function fakePage({ meta = true } = {}) {
  return {
    meta: meta ? fakeElement({ name: 'apple-itunes-app', content: 'app-id=6763228086' }) : null,
    title: fakeElement({ 'data-opening': 'Opening Zyflow …' }, 'Open this in Zyflow'),
    body: fakeElement(
      {
        'data-opening-route': 'The ride is opening in the Zyflow app. If it does not open by itself, tap the button.',
        'data-opening-place': 'The place is opening in the Zyflow app. If it does not open by itself, tap the button.',
      },
      'A place or ride was shared with you from a Zyflow bike map.'
    ),
    get: fakeElement({ 'data-play': 'No app yet? Get it on Google Play, then tap the link again.' }, 'No app yet? Get it here, then tap the link again.'),
    openApp: fakeElement({ href: 'zyflow://' }, 'Open the app'),
    ios: fakeElement({ href: STORE_LINKS.appStoreUrlForLocale('en'), 'data-business-store': 'ios' }),
    android: fakeElement({ href: `https://play.google.com/store/apps/details?id=${PACKAGE}`, 'data-business-store': 'android' }),
  };
}

function run({
  url,
  ua,
  touchPoints = 0,
  fine = true,
  lang = 'en-GB',
  navType = 'navigate',
  storage = new Map(),
  page = fakePage(),
}) {
  const u = new URL(url);
  const replaced = [];
  const assigned = [];
  const timers = [];
  const fetched = [];
  const appended = [];
  const media = {
    '(pointer: fine)': fine,
    '(hover: hover)': fine,
    '(pointer: coarse)': !fine,
  };
  const documentElement = { style: {}, lang: 'en' };
  const selectors = {
    'meta[name="apple-itunes-app"]': () => page.meta,
    '[data-open-app]': () => page.openApp,
    '[data-open-title]': () => page.title,
    '[data-open-body]': () => page.body,
    '[data-open-get]': () => page.get,
  };
  const all = {
    '[data-business-store]': () => [page.ios, page.android],
    '[data-business-store="ios"]': () => [page.ios],
  };
  const location = {
    pathname: u.pathname,
    search: u.search,
    origin: u.origin,
    replace: (to) => replaced.push(to),
  };
  Object.defineProperty(location, 'href', {
    get: () => u.href,
    set: (to) => assigned.push(to),
  });
  const document = {
    documentElement,
    head: { appendChild: (node) => appended.push(node) },
    hidden: false,
    readyState: 'complete',
    createElement: () => fakeElement(),
    querySelector: (sel) => (selectors[sel] ? selectors[sel]() : null),
    querySelectorAll: (sel) => (all[sel] ? all[sel]() : []),
    addEventListener() {},
  };
  const sandbox = {
    URL,
    URLSearchParams,
    JSON,
    Date,
    location,
    navigator: { userAgent: ua, maxTouchPoints: touchPoints, language: lang },
    document,
    performance: { getEntriesByType: () => [{ type: navType }] },
    sessionStorage: {
      getItem: (k) => (storage.has(k) ? storage.get(k) : null),
      setItem: (k, v) => storage.set(k, String(v)),
    },
    setTimeout: (fn, ms) => timers.push({ fn, ms }),
    fetch: (to, init) => {
      fetched.push({ to, body: JSON.parse(init.body) });
      return Promise.resolve();
    },
    window: {
      matchMedia: (q) => ({ matches: Boolean(media[q]) }),
      addEventListener() {},
    },
  };
  vm.runInNewContext(SOURCE, sandbox);
  return {
    replaced,
    assigned,
    timers,
    fetched,
    appended,
    page,
    document,
    hidden: documentElement.style.visibility === 'hidden',
  };
}

test('a computer forwards a route link to the planner, keeping b and s', () => {
  const out = run({ url: `https://www.zyflow.eu/o/route/${ROUTE_ID}?b=kps&s=embed`, ua: DESKTOP_MAC });
  assert.deepEqual(out.replaced, [`https://navigate.zyflow.eu/?route=place%3A${ROUTE_ID}&b=kps&s=embed`]);
  assert.equal(out.hidden, true);
  const planner = new URL(out.replaced[0]);
  assert.equal(planner.searchParams.get('route'), `place:${ROUTE_ID}`);
});

test('a computer forwards a place link to ?poi=, also from the Slovenian page', () => {
  const out = run({ url: `https://www.zyflow.eu/sl/o/place/${ROUTE_ID}`, ua: DESKTOP_WIN, lang: 'sl-SI' });
  assert.deepEqual(out.replaced, [`https://navigate.zyflow.eu/?poi=${ROUTE_ID}`]);
});

test('phones and tablets keep the app page', () => {
  const url = `https://www.zyflow.eu/o/route/${ROUTE_ID}?b=kps&s=embed`;
  assert.deepEqual(run({ url, ua: IPHONE, fine: false }).replaced, []);
  assert.deepEqual(run({ url, ua: ANDROID, fine: false }).replaced, []);
  // iPadOS asks for the desktop site with a Mac user agent; touch points give it away.
  assert.deepEqual(run({ url, ua: DESKTOP_MAC, touchPoints: 5 }).replaced, []);
  // A desktop user agent on a touch-first screen stays too.
  assert.deepEqual(run({ url, ua: DESKTOP_WIN, fine: false }).replaced, []);
});

test('?app=1 keeps the app page on a computer', () => {
  const out = run({ url: `https://www.zyflow.eu/o/route/${ROUTE_ID}?b=kps&app=1`, ua: DESKTOP_MAC });
  assert.deepEqual(out.replaced, []);
  assert.equal(out.hidden, false);
});

test('a broken link does not forward', () => {
  assert.deepEqual(run({ url: 'https://www.zyflow.eu/o/route/not-a-uuid', ua: DESKTOP_MAC }).replaced, []);
  assert.deepEqual(run({ url: `https://www.zyflow.eu/o/stay/${ROUTE_ID}`, ua: DESKTOP_MAC }).replaced, []);
});

test('Slovenian phones still move to the Slovenian page', () => {
  const out = run({ url: `https://www.zyflow.eu/o/route/${ROUTE_ID}?b=kps`, ua: IPHONE, fine: false, lang: 'sl' });
  assert.deepEqual(out.replaced, [`/sl/o/route/${ROUTE_ID}?b=kps`]);
});

// —— Phones: Smart App Banner (iPhone) and the automatic hand-off (Android) ——

function expectedIntent(kind, query, fallback) {
  return `intent://o/${kind}/${ROUTE_ID}${query}#Intent;scheme=zyflow;package=${PACKAGE};S.browser_fallback_url=${encodeURIComponent(fallback)};end`;
}

function fallbackOf(intent) {
  const m = intent.match(/;S\.browser_fallback_url=([^;]+);end$/);
  assert.ok(m, `no fallback in ${intent}`);
  return new URL(decodeURIComponent(m[1]));
}

test('Android Chrome hands off once to the app through an intent:// URL', () => {
  const url = `https://www.zyflow.eu/o/route/${ROUTE_ID}?b=kps&s=embed`;
  const out = run({ url, ua: ANDROID, fine: false });
  const intent = expectedIntent('route', '?b=kps&s=embed', `${url}&app=0`);
  assert.deepEqual(out.assigned, [intent]);
  assert.deepEqual(out.replaced, []);
  assert.equal(out.hidden, false);
  assert.match(intent, /^intent:\/\/o\/route\/[0-9a-f-]{36}\?b=kps&s=embed#Intent;scheme=zyflow;package=com\.jakob_robic\.zyflowmobileapp;S\.browser_fallback_url=https%3A%2F%2Fwww\.zyflow\.eu%2Fo%2Froute%2F[0-9a-f-]{36}%3Fb%3Dkps%26s%3Dembed%26app%3D0;end$/);
  // Fallback: the same page with the "not installed" marker, b and s kept.
  const fallback = fallbackOf(intent);
  assert.equal(fallback.pathname, `/o/route/${ROUTE_ID}`);
  assert.equal(fallback.searchParams.get('app'), '0');
  assert.equal(fallback.searchParams.get('b'), 'kps');
  assert.equal(fallback.searchParams.get('s'), 'embed');
  // "Opening Zyflow …" while it hands off; the button retries with the same intent.
  assert.equal(out.page.title.textContent, 'Opening Zyflow …');
  assert.equal(out.page.body.textContent, out.page.body.getAttribute('data-opening-route'));
  assert.equal(out.page.openApp.getAttribute('href'), intent);
  assert.equal(out.page.ios.hidden, false);
});

test('Samsung Internet on the Slovenian place page: place wording, /sl fallback, no query', () => {
  const url = `https://www.zyflow.eu/sl/o/place/${ROUTE_ID}`;
  const out = run({ url, ua: SAMSUNG, fine: false, lang: 'sl-SI' });
  assert.deepEqual(out.assigned, [expectedIntent('place', '', `${url}?app=0`)]);
  assert.equal(fallbackOf(out.assigned[0]).pathname, `/sl/o/place/${ROUTE_ID}`);
  assert.equal(out.page.body.textContent, out.page.body.getAttribute('data-opening-place'));
});

test('a junk b/s is not carried into the intent, the fallback keeps the page URL', () => {
  const url = `https://www.zyflow.eu/o/route/${ROUTE_ID}?b=Bad%20Slug!&s=email&utm_x=1`;
  const out = run({ url, ua: ANDROID, fine: false });
  assert.equal(out.assigned.length, 1);
  assert.ok(out.assigned[0].startsWith(`intent://o/route/${ROUTE_ID}#Intent;`));
  const fallback = fallbackOf(out.assigned[0]);
  assert.equal(fallback.searchParams.get('utm_x'), '1');
  assert.equal(fallback.searchParams.get('app'), '0');
});

test('the fallback (?app=0) shows Google Play only and never redirects again', () => {
  const url = `https://www.zyflow.eu/o/route/${ROUTE_ID}?b=kps&s=embed&app=0`;
  const out = run({ url, ua: ANDROID, fine: false });
  assert.deepEqual(out.assigned, []);
  assert.deepEqual(out.replaced, []);
  assert.equal(out.timers.length, 0);
  assert.equal(out.page.get.textContent, 'No app yet? Get it on Google Play, then tap the link again.');
  assert.equal(out.page.ios.hidden, true);
  assert.equal(out.page.android.hidden, false);
  // Normal title and line; the button can still retry by hand.
  assert.equal(out.page.title.textContent, 'Open this in Zyflow');
  assert.match(out.page.openApp.getAttribute('href'), /^intent:\/\/o\/route\//);
  // The intent's own fallback would again be ?app=0 (set, not appended twice).
  assert.deepEqual(fallbackOf(out.page.openApp.getAttribute('href')).searchParams.getAll('app'), ['0']);
});

test('reload, back/forward and a second load within a minute do not hand off again', () => {
  const url = `https://www.zyflow.eu/o/route/${ROUTE_ID}?b=kps`;
  assert.deepEqual(run({ url, ua: ANDROID, fine: false, navType: 'reload' }).assigned, []);
  assert.deepEqual(run({ url, ua: ANDROID, fine: false, navType: 'back_forward' }).assigned, []);
  const storage = new Map();
  assert.equal(run({ url, ua: ANDROID, fine: false, storage }).assigned.length, 1);
  const again = run({ url, ua: ANDROID, fine: false, storage });
  assert.deepEqual(again.assigned, []);
  assert.equal(again.page.title.textContent, 'Open this in Zyflow');
  // Another place or route is a new link.
  const other = `https://www.zyflow.eu/o/place/${ROUTE_ID.replace('2e85', '3f96')}`;
  assert.equal(run({ url: other, ua: ANDROID, fine: false, storage }).assigned.length, 1);
});

test('"Opening Zyflow …" turns back to the normal lines when the app does not open', () => {
  const out = run({ url: `https://www.zyflow.eu/o/route/${ROUTE_ID}`, ua: ANDROID, fine: false });
  const restore = out.timers.find((t) => t.ms > 1000);
  assert.ok(restore, 'a restore timer');
  restore.fn();
  // Cross-fade: the swap itself runs on a second, short timer.
  out.timers.filter((t) => t.ms < 1000).forEach((t) => t.fn());
  assert.equal(out.page.title.textContent, 'Open this in Zyflow');
  assert.equal(out.page.body.textContent, 'A place or ride was shared with you from a Zyflow bike map.');
});

test('in-app WebViews and Firefox on Android do not auto-open; the button keeps zyflow://', () => {
  const url = `https://www.zyflow.eu/o/route/${ROUTE_ID}?b=kps`;
  for (const ua of [ANDROID_WEBVIEW, ANDROID_FIREFOX]) {
    const out = run({ url, ua, fine: false });
    assert.deepEqual(out.assigned, [], ua);
    assert.equal(out.page.openApp.getAttribute('href'), `zyflow://o/route/${ROUTE_ID}?b=kps`);
  }
});

test('iPhone: no auto-launch, Smart App Banner points at this link', () => {
  const url = `https://www.zyflow.eu/o/route/${ROUTE_ID}?b=kps&s=qr`;
  const out = run({ url, ua: IPHONE, fine: false });
  assert.deepEqual(out.assigned, []);
  assert.deepEqual(out.replaced, []);
  assert.equal(out.timers.length, 0);
  assert.equal(out.page.meta.getAttribute('content'), `app-id=6763228086, app-argument=${url}`);
  assert.equal(out.page.openApp.getAttribute('href'), `zyflow://o/route/${ROUTE_ID}?b=kps&s=qr`);
  assert.equal(out.page.title.textContent, 'Open this in Zyflow');
  assert.equal(out.page.ios.hidden, false);
  // ?app=0 means nothing on an iPhone: both stores stay.
  const marked = run({ url: `${url}&app=0`, ua: IPHONE, fine: false });
  assert.equal(marked.page.ios.hidden, false);
  assert.equal(marked.page.get.textContent, 'No app yet? Get it here, then tap the link again.');
});

test('iPhone on the Slovenian page: app-argument is the /o/ link the app parses (no /sl, no markers)', () => {
  const out = run({ url: `https://www.zyflow.eu/sl/o/place/${ROUTE_ID}?s=hosted&b=kps&app=1`, ua: IPHONE, fine: false, lang: 'sl' });
  assert.equal(out.page.meta.getAttribute('content'), `app-id=6763228086, app-argument=https://www.zyflow.eu/o/place/${ROUTE_ID}?b=kps&s=hosted`);
});

test('the banner meta is added when the page has none; a broken link keeps the bare app id', () => {
  const page = fakePage({ meta: false });
  const out = run({ url: `https://www.zyflow.eu/o/route/${ROUTE_ID}`, ua: IPHONE, fine: false, page });
  assert.equal(out.appended.length, 1);
  assert.equal(out.appended[0].getAttribute('name'), 'apple-itunes-app');
  assert.equal(out.appended[0].getAttribute('content'), `app-id=6763228086, app-argument=https://www.zyflow.eu/o/route/${ROUTE_ID}`);

  const broken = run({ url: 'https://www.zyflow.eu/o/route/not-a-uuid', ua: IPHONE, fine: false });
  assert.equal(broken.page.meta.getAttribute('content'), 'app-id=6763228086');
  assert.deepEqual(run({ url: 'https://www.zyflow.eu/o/route/not-a-uuid', ua: ANDROID, fine: false }).assigned, []);
});

test('the banner app id matches the App Store links and the page meta', () => {
  const id = STORE_LINKS.appStoreUrlForLocale('en').match(/\/id(\d+)/)[1];
  assert.match(SOURCE, new RegExp(`var APP_STORE_ID = "${id}";`));
  assert.match(OPEN_HTML, new RegExp(`<meta name="apple-itunes-app" content="app-id=${id}" />`));
  assert.match(SOURCE, new RegExp(`var ANDROID_PACKAGE = "${PACKAGE.replace(/\./g, '\\.')}";`));
  assert.ok(OPEN_HTML.includes(`play.google.com/store/apps/details?id=${PACKAGE}`));
});

test('computers still forward without touching the banner or handing off', () => {
  const out = run({ url: `https://www.zyflow.eu/o/route/${ROUTE_ID}?b=kps&s=embed`, ua: DESKTOP_MAC });
  assert.deepEqual(out.replaced, [`https://navigate.zyflow.eu/?route=place%3A${ROUTE_ID}&b=kps&s=embed`]);
  assert.deepEqual(out.assigned, []);
  assert.equal(out.page.meta.getAttribute('content'), 'app-id=6763228086');
  // ?app=1 on a computer: the page, the zyflow:// button, no hand-off.
  const kept = run({ url: `https://www.zyflow.eu/o/route/${ROUTE_ID}?b=kps&app=1`, ua: DESKTOP_MAC });
  assert.deepEqual(kept.replaced, []);
  assert.deepEqual(kept.assigned, []);
  assert.equal(kept.page.openApp.getAttribute('href'), `zyflow://o/route/${ROUTE_ID}?b=kps`);
});

test('store taps still record store_redirect with the business and a Play referrer', () => {
  const out = run({ url: `https://www.zyflow.eu/o/route/${ROUTE_ID}?b=kps&s=embed&app=0`, ua: ANDROID, fine: false });
  const play = new URL(out.page.android.getAttribute('href'));
  assert.equal(play.searchParams.get('referrer'), 'utm_source=zyflow_business&utm_medium=embed&utm_campaign=kps&b=kps&s=embed');
  out.page.android.listeners.click();
  assert.deepEqual(out.fetched, [
    {
      to: '/api/business-event',
      body: { slug: 'kps', event: 'store_redirect', surface: 'embed', routeId: ROUTE_ID, lang: 'en' },
    },
  ]);
  const ios = new URL(out.page.ios.getAttribute('href'));
  assert.equal(ios.searchParams.get('ct'), 'b_kps');
});
