/**
 * Guides page type: content rules, routes, meta, hreflang, sitemap and the
 * GUIDES_PUBLIC flag. Unit tests use loadGuides on temp folders; the build
 * tests run build.js into a temp dist like test-publication.js.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync, spawnSync } = require("child_process");
const YAML = require("yaml");
const { loadGuides, countWords, FIXTURE_DIR } = require("./guides");
const { missingI18nKeys } = require("./build");

const BUILD = path.join(__dirname, "build.js");
const TODAY = "2026-11-07";
const ORIGIN = "https://www.zyflow.eu";

function tempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeGuide(dir, key, lang, front, body = "") {
  const folder = path.join(dir, key);
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, `${lang}.md`), `---\n${YAML.stringify(front)}---\n${body}\n`);
}

function validFront(overrides = {}) {
  return {
    status: "published",
    slug: "how-steep-is-mali-vrh",
    question: "How steep is Mali vrh?",
    description:
      "Mali vrh is a 17.3 km loop with 596 m of climbing. Here is how steep that ride feels for most riders.",
    answer:
      "Steeper than it looks. The loop is only 17.3 km, but it climbs 596 m, so expect long sections in a low gear.",
    checked: TODAY,
    data: {
      rows: [
        { label: "Climbing", value: "596 m", source: "Zyflow route page", asOf: TODAY },
      ],
    },
    sources: [{ title: "Mali vrh route page", url: "https://www.zyflow.eu/tours/mali-vrh" }],
    ...overrides,
  };
}

function errorsFor(front, body = "## Pace\n\nTake the first climb slowly.", lang = "en") {
  const dir = tempDir("zyflow-guide-unit-");
  writeGuide(dir, "mali-vrh", lang, front, body);
  return loadGuides(dir, { today: TODAY }).errors;
}

function assertError(errors, pattern) {
  assert.ok(
    errors.some((error) => pattern.test(error)),
    `expected an error matching ${pattern}, got:\n${errors.join("\n") || "(none)"}`
  );
}

/** Two real guides: the fixture loop in three languages (fixture flag removed) and Mali vrh in EN + SL. */
function realContent() {
  const dir = tempDir("zyflow-guides-content-");
  const loop = path.join(dir, "kamnicanka-loop");
  fs.mkdirSync(loop);
  for (const lang of ["en", "de", "sl"]) {
    const raw = fs.readFileSync(path.join(FIXTURE_DIR, "fixture-kamnicanka", `${lang}.md`), "utf8");
    fs.writeFileSync(path.join(loop, `${lang}.md`), raw.replace(/^fixture: true\n/m, ""));
  }
  writeGuide(dir, "mali-vrh", "en", validFront({ related: ["kamnicanka-loop"] }), "## Pace\n\nTake the first climb slowly.");
  writeGuide(
    dir,
    "mali-vrh",
    "sl",
    validFront({
      slug: "kako-strm-je-mali-vrh",
      question: "Kako strm je Mali vrh?",
      description:
        "Mali vrh je 17,3 km dolga krožna pot z 596 m vzpona. Tako strma je pot za večino kolesarjev.",
      answer:
        "Bolj, kot je videti. Pot je dolga le 17,3 km, a ima 596 m vzpona, zato boš pogosto v najlažji prestavi.",
      related: ["kamnicanka-loop"],
    }),
    "## Tempo\n\nPrvi vzpon vozi počasi."
  );
  return dir;
}

function buildDist(env) {
  const dist = tempDir("zyflow-guides-dist-");
  execFileSync(process.execPath, [BUILD], {
    env: { ...process.env, REBUILD_DIST: dist, MAPTILER_KEY: "", ...env },
    stdio: "pipe",
  });
  return dist;
}

function buildFails(env) {
  const dist = tempDir("zyflow-guides-fail-");
  const result = spawnSync(process.execPath, [BUILD], {
    env: { ...process.env, REBUILD_DIST: dist, MAPTILER_KEY: "", ...env },
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0, "build was expected to fail");
  return `${result.stdout}\n${result.stderr}`;
}

function read(dist, rel) {
  return fs.readFileSync(path.join(dist, rel), "utf8");
}

function hreflangs(html) {
  return Object.fromEntries(
    [...html.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)" \/>/g)].map((m) => [m[1], m[2]])
  );
}

function langSwitch(html) {
  const block = html.match(/<div class="lang-switch"[\s\S]*?<\/div>/)[0];
  return Object.fromEntries(
    [...block.matchAll(/href="([^"]+)" hreflang="([^"]+)"/g)].map((m) => [m[2], m[1]])
  );
}

// —— Content rules ——

test("word counting treats numbers with units and hyphenated words like a reader", () => {
  assert.equal(countWords("Is the Kamničanka loop hard?"), 5);
  assert.equal(countWords("70 km on an e-bike"), 5);
  assert.equal(countWords("3,6 m pro Kilometer"), 4);
});

test("the preview fixture is valid in all three languages", () => {
  const catalog = loadGuides(FIXTURE_DIR, { today: TODAY });
  assert.deepEqual(catalog.errors, []);
  assert.deepEqual(
    catalog.guides.map((guide) => [guide.lang, guide.fixture]),
    [["en", true], ["de", true], ["sl", true]]
  );
});

test("a valid guide has no errors", () => {
  assert.deepEqual(errorsFor(validFront()), []);
});

test("the question is a headline of 7 words at most", () => {
  assertError(
    errorsFor(validFront({ question: "How steep is the Mali vrh loop near Kranj really?" })),
    /question has 10 words; headlines are 7 words at most/
  );
});

test("the answer lands within the first 100 words", () => {
  const answer = `${"Steep climbs on the way up. ".repeat(20)}Plan for it.`;
  assertError(errorsFor(validFront({ answer })), /question and answer have \d+ words; the answer must land within the first 100/);
});

test("a guide stays under 600 words", () => {
  const body = `## Detail\n\n${"Ride the first climb slowly and keep a steady pace. ".repeat(60)}`;
  assertError(errorsFor(validFront(), body), /\d+ words; guides are 600 words at most/);
});

test("published guides need a data block, a source and a checked date", () => {
  const errors = errorsFor(validFront({ data: undefined, sources: undefined, checked: undefined }));
  assertError(errors, /published guides need a data block/);
  assertError(errors, /published guides need at least one source/);
  assertError(errors, /checked is required/);
});

test("drafts may be incomplete", () => {
  assert.deepEqual(
    errorsFor(validFront({ status: "draft", data: undefined, sources: undefined, checked: undefined })),
    []
  );
});

test("data rows carry a value, a source and an as-of date, never in the future", () => {
  const errors = errorsFor(
    validFront({ data: { rows: [{ label: "Climbing", value: "", source: "", asOf: "2999-01-01" }] } })
  );
  assertError(errors, /data\.rows\[0\]\.value is required/);
  assertError(errors, /data\.rows\[0\]\.source is required/);
  assertError(errors, /data\.rows\[0\]\.asOf 2999-01-01 is in the future/);
  assertError(errorsFor(validFront({ checked: "2999-01-01" })), /checked 2999-01-01 is in the future/);
});

test("a map data block needs an image under images/, alt text and a credit", () => {
  const dir = tempDir("zyflow-guide-map-");
  writeGuide(dir, "mali-vrh", "en", validFront({
    data: { map: { src: "../outside.jpg", alt: "", credit: "", asOf: TODAY } },
  }));
  const errors = loadGuides(dir, { today: TODAY }).errors;
  assertError(errors, /data\.map\.src must be a file under images\//);
  assertError(errors, /data\.map\.alt is required/);
  assertError(errors, /data\.map\.credit is required/);

  const ok = tempDir("zyflow-guide-map-ok-");
  writeGuide(ok, "mali-vrh", "en", validFront({
    data: {
      map: { src: "images/map.jpg", alt: "Mali vrh loop on a map", credit: "© OpenStreetMap contributors", asOf: TODAY },
    },
  }));
  fs.mkdirSync(path.join(ok, "mali-vrh", "images"));
  fs.copyFileSync(path.join(__dirname, "fixtures", "hero.jpg"), path.join(ok, "mali-vrh", "images", "map.jpg"));
  const loaded = loadGuides(ok, { today: TODAY });
  assert.deepEqual(loaded.errors, []);
  assert.equal(loaded.guides[0].map.src, "/assets/images/guides/mali-vrh/map.jpg");
});

test("sources are http(s) links", () => {
  assertError(
    errorsFor(validFront({ sources: [{ title: "Notes", url: "javascript:alert(1)" }] })),
    /sources\[0\]\.url must be an http\(s\) link/
  );
});

test("brand rules: no emoji, never a Komoot alternative or a navigation app", () => {
  assertError(errorsFor(validFront({ answer: "Steeper than it looks 🚴. Plan a low gear." })), /no emoji/);
  assertError(
    errorsFor(validFront(), "## Why\n\nZyflow is the best Komoot alternative for this climb."),
    /Komoot alternative/
  );
  assertError(
    errorsFor(validFront(), "## Why\n\nZyflow is a navigation app for cyclists."),
    /navigation app/
  );
  // © in a map credit is not an emoji.
  assert.deepEqual(
    errorsFor(validFront({ data: { rows: [{ label: "Map", value: "17.3 km", source: "© OpenStreetMap", asOf: TODAY }] } })),
    []
  );
});

test("meta and answer are checked for the page language", () => {
  const errors = errorsFor(
    validFront({ slug: "wie-steil-ist-der-mali-vrh", question: "Wie steil ist der Mali vrh?" }),
    "## Tempo\n\nFahre langsam.",
    "de"
  );
  assertError(errors, /description looks English on a German page/);
  assertError(errors, /answer looks English on a German page/);
});

test("the body uses ## sections, no raw HTML and no images", () => {
  const errors = errorsFor(validFront(), "# Big title\n\n<div>hi</div>\n\n![x](images/x.jpg)");
  assertError(errors, /the question is the only H1/);
  assertError(errors, /raw HTML is not allowed/);
  assertError(errors, /images are not allowed in the guide body/);
});

test("unknown fields, languages and related guides are rejected", () => {
  const dir = tempDir("zyflow-guide-keys-");
  writeGuide(dir, "mali-vrh", "en", validFront({ titel: "x", related: ["does-not-exist"] }));
  writeGuide(dir, "mali-vrh", "fr", validFront());
  const errors = loadGuides(dir, { today: TODAY }).errors;
  assertError(errors, /unknown field "titel"/);
  assertError(errors, /related guide "does-not-exist" does not exist/);
  assertError(errors, /mali-vrh\/fr\.md: guides are written in en, de, sl only/);
});

test("slugs are unique per language", () => {
  const dir = tempDir("zyflow-guide-slugs-");
  writeGuide(dir, "mali-vrh", "en", validFront());
  writeGuide(dir, "mali-vrh-again", "en", validFront());
  assertError(loadGuides(dir, { today: TODAY }).errors, /slug "how-steep-is-mali-vrh" is also used by/);
});

test("routes: per-language paths, hreflang only for written languages, switch falls back to the index", () => {
  const catalog = loadGuides(realContent(), { today: TODAY });
  assert.deepEqual(catalog.errors, []);
  const byPath = Object.fromEntries(catalog.pages.map((page) => [page.path, page]));
  assert.deepEqual(Object.keys(byPath).sort(), [
    "/de/ratgeber",
    "/de/ratgeber/ist-die-kamnicanka-schwer",
    "/guides",
    "/guides/how-steep-is-mali-vrh",
    "/guides/is-the-kamnicanka-loop-hard",
    "/sl/vodniki",
    "/sl/vodniki/je-kamnicanka-zahtevna",
    "/sl/vodniki/kako-strm-je-mali-vrh",
  ]);
  const mali = byPath["/guides/how-steep-is-mali-vrh"];
  assert.equal(mali.out, "guides/how-steep-is-mali-vrh.html");
  assert.equal(mali.localePrefix, false);
  assert.deepEqual(mali.locales, ["en"]);
  assert.deepEqual(mali.alternates, {
    en: "/guides/how-steep-is-mali-vrh",
    sl: "/sl/vodniki/kako-strm-je-mali-vrh",
  });
  assert.deepEqual(mali.langSwitch, {
    en: "/guides/how-steep-is-mali-vrh",
    de: "/de/ratgeber",
    sl: "/sl/vodniki/kako-strm-je-mali-vrh",
  });
  assert.equal(mali.campaign, "guide-mali-vrh");
  assert.equal(byPath["/de/ratgeber/ist-die-kamnicanka-schwer"].out, "de/ratgeber/ist-die-kamnicanka-schwer.html");
});

test("an index with no guides in its language is built but not indexed", () => {
  const dir = tempDir("zyflow-guide-index-");
  writeGuide(dir, "mali-vrh", "en", validFront());
  const pages = loadGuides(dir, { today: TODAY }).pages;
  const de = pages.find((page) => page.path === "/de/ratgeber");
  assert.equal(de.indexable, false);
  assert.equal(de.hreflang, false);
  assert.equal(pages.find((page) => page.path === "/guides").indexable, true);
});

test("missingI18nKeys finds strings a partial locale does not define", () => {
  const html = '<a data-i18n="chrome.nav.links.home">Home</a><input data-i18n-placeholder="chrome.x" /><b data-i18n-attr="title:chrome.y;alt:chrome.nav.cta"></b>';
  assert.deepEqual(
    missingI18nKeys(html, { chrome: { nav: { cta: "Download", links: { home: "Start" } } } }),
    ["chrome.x", "chrome.y"]
  );
});

// —— Builds ——

test("hidden: nothing built, linked, listed or crawlable", () => {
  const dist = buildDist({ GUIDES_PUBLIC: "false", GUIDES_CONTENT: realContent() });
  for (const rel of ["guides.html", "de/ratgeber.html", "sl/vodniki.html", "guides", "de", "sl/vodniki"]) {
    assert.equal(fs.existsSync(path.join(dist, rel)), false, `${rel} was built while hidden`);
  }
  const robots = read(dist, "robots.txt");
  for (const base of ["/guides", "/de/ratgeber", "/sl/vodniki"]) {
    assert.match(robots, new RegExp(`^Disallow: ${base}$`, "m"));
  }
  assert.doesNotMatch(read(dist, "sitemap.xml"), /guides|ratgeber|vodniki/);
  for (const rel of ["index.html", "sl/index.html", "tours.html"]) {
    const html = read(dist, rel);
    assert.doesNotMatch(html, /href="\/(?:guides|de\/ratgeber|sl\/vodniki)/, `${rel} links to guides`);
    assert.doesNotMatch(html, /guides:|\{\{guidesIndex\}\}|data-page-campaign/, rel);
  }
});

test("public: pages, meta, hreflang, sitemap, German chrome and attribution", () => {
  const dist = buildDist({ GUIDES_PUBLIC: "true", GUIDES_CONTENT: realContent(), SITE_INDEX: "true" });

  // Routes.
  for (const rel of [
    "guides.html",
    "de/ratgeber.html",
    "sl/vodniki.html",
    "guides/is-the-kamnicanka-loop-hard.html",
    "guides/how-steep-is-mali-vrh.html",
    "de/ratgeber/ist-die-kamnicanka-schwer.html",
    "sl/vodniki/je-kamnicanka-zahtevna.html",
    "sl/vodniki/kako-strm-je-mali-vrh.html",
  ]) {
    assert.ok(fs.existsSync(path.join(dist, rel)), `missing ${rel}`);
  }
  assert.equal(fs.existsSync(path.join(dist, "de/ratgeber/how-steep-is-mali-vrh.html")), false);

  // Meta on an EN guide written in EN + SL only.
  const mali = read(dist, "guides/how-steep-is-mali-vrh.html");
  assert.match(mali, /<html lang="en"/);
  assert.match(mali, /<meta name="robots" content="index, follow" \/>/);
  assert.match(mali, new RegExp(`<link rel="canonical" href="${ORIGIN}/guides/how-steep-is-mali-vrh" />`));
  assert.match(mali, /<title>How steep is Mali vrh\?<\/title>/);
  assert.deepEqual(hreflangs(mali), {
    en: `${ORIGIN}/guides/how-steep-is-mali-vrh`,
    sl: `${ORIGIN}/sl/vodniki/kako-strm-je-mali-vrh`,
    "x-default": `${ORIGIN}/guides/how-steep-is-mali-vrh`,
  });
  assert.deepEqual(langSwitch(mali), {
    en: "/guides/how-steep-is-mali-vrh",
    de: "/de/ratgeber",
    sl: "/sl/vodniki/kako-strm-je-mali-vrh",
  });
  // Page order: question, answer, data, body, CTA, checked, sources, related.
  const order = [
    '<h1 class="article__title">How steep is Mali vrh?</h1>',
    'class="guide__answer"',
    'class="guide-data"',
    'class="article__body"',
    'class="post-app guide-cta"',
    'class="guide__checked"',
    'class="guide-sources"',
    'class="guide-related"',
  ].map((needle) => mali.indexOf(needle));
  assert.ok(order.every((at) => at > 0), `missing a section: ${order}`);
  assert.deepEqual([...order].sort((a, b) => a - b), order);
  assert.match(mali, /href="\/guides\/is-the-kamnicanka-loop-hard">Is the Kamničanka loop hard\?<\/a>/);
  assert.match(mali, /<time datetime="2026-11-07">7 Nov 2026<\/time>/);
  // One main CTA (both stores) plus the planner link with this page's UTMs.
  assert.match(mali, /<body[^>]*data-page-campaign="guide-mali-vrh" data-page-medium="guide"/);
  const main = mali.match(/<main>([\s\S]*?)<\/main>/)[1];
  assert.equal((main.match(/\bbtn--primary\b/g) || []).length, 1, "one main CTA in the page body");
  assert.match(
    mali,
    /href="https:\/\/navigate\.zyflow\.eu\/\?utm_source=zyflow\.eu&amp;utm_medium=guide&amp;utm_campaign=guide-mali-vrh" data-planner-link/
  );
  assert.match(mali, /href="https:\/\/apps\.apple\.com\/si\/app\/zyflow\/id6763228086(?:\?v=[^"]*)?">App Store<\/a>/);
  assert.doesNotMatch(mali, /\{\{/);

  // German page: German chrome, links to the English site, x-default to EN.
  const de = read(dist, "de/ratgeber/ist-die-kamnicanka-schwer.html");
  assert.match(de, /<html lang="de"/);
  assert.match(de, /<meta property="og:locale" content="de_DE" \/>/);
  assert.deepEqual(hreflangs(de), {
    en: `${ORIGIN}/guides/is-the-kamnicanka-loop-hard`,
    de: `${ORIGIN}/de/ratgeber/ist-die-kamnicanka-schwer`,
    sl: `${ORIGIN}/sl/vodniki/je-kamnicanka-zahtevna`,
    "x-default": `${ORIGIN}/guides/is-the-kamnicanka-loop-hard`,
  });
  assert.match(de, /data-i18n="chrome\.nav\.links\.tours">Routen<\/a>/);
  assert.match(de, /<a class="nav__link" href="\/tours"/);
  assert.match(de, /<a href="\/de\/ratgeber" data-i18n="chrome\.footer\.links\.guides">Ratgeber<\/a>/);
  assert.match(de, /Geprüft am <time datetime="2026-11-07">7\. November 2026<\/time>/);
  assert.doesNotMatch(de, /href="\/de"(?!\/)/, "no link to a German home page");
  assert.doesNotMatch(de, /class="guide-related"/, "Mali vrh has no German version");
  const enMessages = JSON.parse(fs.readFileSync(path.join(__dirname, "../locales/de.json"), "utf8"));
  assert.deepEqual(missingI18nKeys(de, enMessages), []);

  // Slovenian page links to the Slovenian site and index.
  const sl = read(dist, "sl/vodniki/kako-strm-je-mali-vrh.html");
  assert.match(sl, /<a href="\/sl\/vodniki" data-i18n="chrome\.footer\.links\.guides">Vodniki<\/a>/);
  assert.match(sl, /<li><a href="\/sl">/);
  assert.match(sl, /<time datetime="2026-11-07">7\. 11\. 2026<\/time>/);

  // Other pages keep EN · SL and link to their own guides index.
  const home = read(dist, "index.html");
  assert.deepEqual(Object.keys(langSwitch(home)), ["en", "sl"]);
  assert.match(home, /<a href="\/guides" data-i18n="chrome\.footer\.links\.guides">Guides<\/a>/);
  assert.match(read(dist, "sl/index.html"), /<a href="\/sl\/vodniki" data-i18n="chrome\.footer\.links\.guides">Vodniki<\/a>/);
  assert.doesNotMatch(home, /data-page-campaign/);

  // Index pages.
  const index = read(dist, "guides.html");
  assert.match(index, /<meta name="robots" content="index, follow" \/>/);
  assert.match(index, /href="\/guides\/how-steep-is-mali-vrh"/);
  assert.match(index, /href="\/guides\/is-the-kamnicanka-loop-hard"/);
  assert.deepEqual(langSwitch(index), { en: "/guides", de: "/de/ratgeber", sl: "/sl/vodniki" });
  assert.doesNotMatch(read(dist, "de/ratgeber.html"), /how-steep-is-mali-vrh/);

  // Sitemap and robots.
  const sitemap = read(dist, "sitemap.xml");
  for (const loc of [
    "/guides",
    "/de/ratgeber",
    "/sl/vodniki",
    "/guides/how-steep-is-mali-vrh",
    "/de/ratgeber/ist-die-kamnicanka-schwer",
    "/sl/vodniki/kako-strm-je-mali-vrh",
  ]) {
    assert.match(sitemap, new RegExp(`<loc>${ORIGIN}${loc}</loc>`));
  }
  const maliEntry = sitemap.split("<url>").find((entry) => entry.includes(`<loc>${ORIGIN}/guides/how-steep-is-mali-vrh</loc>`));
  assert.match(maliEntry, /hreflang="sl" href="https:\/\/www\.zyflow\.eu\/sl\/vodniki\/kako-strm-je-mali-vrh"/);
  assert.doesNotMatch(maliEntry, /hreflang="de"/);
  assert.match(maliEntry, /<lastmod>2026-11-07<\/lastmod>/);
  assert.doesNotMatch(read(dist, "robots.txt"), /guides|ratgeber|vodniki/);
});

test("turning guides on with no published guide fails", () => {
  const empty = tempDir("zyflow-guides-empty-");
  writeGuide(empty, "mali-vrh", "en", validFront({ status: "draft" }));
  assert.match(buildFails({ GUIDES_PUBLIC: "true", GUIDES_CONTENT: empty }), /GUIDES_PUBLIC is on but there is no published guide/);
});

test("a production build refuses the preview fixture", () => {
  assert.match(
    buildFails({ GUIDES_PUBLIC: "true", GUIDES_CONTENT: FIXTURE_DIR, SITE_INDEX: "true" }),
    /Production build refuses fixture guides/
  );
});

test("a broken guide fails the build even while guides are hidden", () => {
  const dir = tempDir("zyflow-guides-broken-");
  writeGuide(dir, "mali-vrh", "en", validFront({ question: "How steep is the Mali vrh loop near Kranj really?" }));
  assert.match(buildFails({ GUIDES_PUBLIC: "false", GUIDES_CONTENT: dir }), /Guides validation failed/);
});
