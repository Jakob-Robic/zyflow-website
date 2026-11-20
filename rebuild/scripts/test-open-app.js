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

function run({ url, ua, touchPoints = 0, fine = true, lang = 'en-GB' }) {
  const u = new URL(url);
  const replaced = [];
  const media = {
    '(pointer: fine)': fine,
    '(hover: hover)': fine,
    '(pointer: coarse)': !fine,
  };
  const documentElement = { style: {}, lang: 'en' };
  const sandbox = {
    URL,
    URLSearchParams,
    location: {
      pathname: u.pathname,
      search: u.search,
      origin: u.origin,
      replace: (to) => replaced.push(to),
    },
    navigator: { userAgent: ua, maxTouchPoints: touchPoints, language: lang },
    document: {
      documentElement,
      readyState: 'complete',
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener() {},
    },
    window: {
      matchMedia: (q) => ({ matches: Boolean(media[q]) }),
      addEventListener() {},
    },
  };
  vm.runInNewContext(SOURCE, sandbox);
  return { replaced, hidden: documentElement.style.visibility === 'hidden' };
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
