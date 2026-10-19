const test = require("node:test");
const assert = require("node:assert/strict");
const attr = require("../js/attribution.js");

const { APP_STORE_URL: APP_STORE } = require("./store-links");

const PLAY = "https://play.google.com/store/apps/details?id=com.jakob_robic.zyflowmobileapp";

test("reads utm_* from the current URL", () => {
  assert.deepEqual(
    attr.readUtmsFromSearch("?utm_source=google&utm_medium=cpc&utm_campaign=spring"),
    { utm_source: "google", utm_medium: "cpc", utm_campaign: "spring" }
  );
});

test("falls back to the referrer host as source", () => {
  const resolved = attr.resolveAttribution({
    search: "",
    referrer: "https://www.google.com/search?q=zyflow",
    pageHost: "www.zyflow.eu",
    stored: null,
  });
  assert.equal(resolved.utm_source, "google.com");
});

test("falls back to direct when there is no UTM or external referrer", () => {
  const resolved = attr.resolveAttribution({
    search: "",
    referrer: "",
    pageHost: "www.zyflow.eu",
    stored: null,
  });
  assert.equal(resolved.utm_source, "direct");
});

test("ignores zyflow.eu as an external referrer", () => {
  const resolved = attr.resolveAttribution({
    search: "",
    referrer: "https://www.zyflow.eu/about",
    pageHost: "www.zyflow.eu",
    stored: null,
  });
  assert.equal(resolved.utm_source, "direct");
});

test("prefers current URL UTMs over stored first-touch", () => {
  const resolved = attr.resolveAttribution({
    search: "?utm_source=newsletter&utm_medium=email&utm_campaign=may",
    referrer: "https://facebook.com/",
    pageHost: "www.zyflow.eu",
    stored: { utm_source: "google", utm_medium: "cpc", utm_campaign: "spring" },
  });
  assert.deepEqual(resolved, {
    utm_source: "newsletter",
    utm_medium: "email",
    utm_campaign: "may",
  });
});

test("uses stored first-touch after the landing query is gone", () => {
  const resolved = attr.resolveAttribution({
    search: "",
    referrer: "https://www.zyflow.eu/",
    pageHost: "www.zyflow.eu",
    stored: { utm_source: "google", utm_medium: "cpc", utm_campaign: "spring" },
  });
  assert.deepEqual(resolved, {
    utm_source: "google",
    utm_medium: "cpc",
    utm_campaign: "spring",
  });
});

test("first-touch does not overwrite an existing stored campaign", () => {
  const stored = { utm_source: "google", utm_medium: "cpc", utm_campaign: "spring" };
  const next = attr.firstTouchFromVisit({
    search: "?utm_source=later&utm_medium=email&utm_campaign=june",
    referrer: "",
    pageHost: "www.zyflow.eu",
    stored,
  });
  assert.deepEqual(next, stored);
});

test("Play referrer encodes UTMs and omits ph_id without consent", () => {
  const href = attr.decorateStoreUrl(PLAY, {
    utms: { utm_source: "google", utm_medium: "cpc", utm_campaign: "spring" },
    analyticsConsent: false,
    distinctId: "abc123",
  });
  const url = new URL(href);
  const referrer = url.searchParams.get("referrer");
  assert.equal(
    referrer,
    "utm_source=google&utm_medium=cpc&utm_campaign=spring"
  );
  assert.equal(referrer.includes("ph_id"), false);
  assert.equal(url.searchParams.get("id"), "com.jakob_robic.zyflowmobileapp");
});

test("Play referrer adds ph_id only when analytics consent is granted", () => {
  const href = attr.decorateStoreUrl(PLAY, {
    utms: { utm_source: "direct", utm_medium: "", utm_campaign: "" },
    analyticsConsent: true,
    distinctId: "ph_user_1",
  });
  const referrer = new URL(href).searchParams.get("referrer");
  assert.equal(
    referrer,
    "utm_source=direct&utm_medium=&utm_campaign=&ph_id=ph_user_1"
  );
});

test("App Store listing is the Slovenia storefront", () => {
  const url = new URL(APP_STORE);
  assert.equal(url.hostname, "apps.apple.com");
  assert.equal(url.pathname, "/si/app/zyflow/id6763228086");
});

test("App Store gets ct from utm_campaign and keeps other params", () => {
  const href = attr.decorateStoreUrl(APP_STORE + "?oppref=chatgpt-1", {
    utms: { utm_source: "ads", utm_medium: "cpc", utm_campaign: "Spring Ride 2026" },
    analyticsConsent: true,
    distinctId: "abc",
  });
  const url = new URL(href);
  assert.equal(url.pathname, "/si/app/zyflow/id6763228086");
  assert.equal(url.searchParams.get("ct"), "Spring_Ride_2026");
  assert.equal(url.searchParams.get("oppref"), "chatgpt-1");
  assert.equal(url.searchParams.has("ph_id"), false);
});

test("App Store omits ct when there is no campaign", () => {
  const href = attr.decorateStoreUrl(APP_STORE, {
    utms: { utm_source: "direct", utm_medium: "", utm_campaign: "" },
    analyticsConsent: false,
  });
  assert.equal(new URL(href).searchParams.has("ct"), false);
});

test("decorating twice does not stack Play referrer values", () => {
  const first = attr.decorateStoreUrl(PLAY, {
    utms: { utm_source: "google", utm_medium: "cpc", utm_campaign: "a" },
    analyticsConsent: false,
  });
  const second = attr.decorateStoreUrl(first, {
    utms: { utm_source: "google", utm_medium: "cpc", utm_campaign: "b" },
    analyticsConsent: false,
  });
  const referrer = new URL(second).searchParams.get("referrer");
  assert.equal(referrer, "utm_source=google&utm_medium=cpc&utm_campaign=b");
  assert.equal(referrer.match(/utm_source=/g).length, 1);
});
