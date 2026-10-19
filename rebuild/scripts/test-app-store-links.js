const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  APP_STORE_URL,
  appStoreUrlForLocale,
  assertAppStoreLinks,
} = require("./store-links");

function withTree(files, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "zyflow-store-links-"));
  try {
    for (const [rel, body] of Object.entries(files)) {
      const full = path.join(dir, rel);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, body);
    }
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function rejects(files, pattern) {
  withTree(files, (dir) => {
    assert.throws(() => assertAppStoreLinks(dir), pattern);
  });
}

test("Slovenian pages add ?l=sl and English pages keep the plain listing", () => {
  assert.equal(appStoreUrlForLocale("en"), APP_STORE_URL);
  assert.equal(appStoreUrlForLocale("sl"), `${APP_STORE_URL}?l=sl`);
  const sl = new URL(appStoreUrlForLocale("sl"));
  assert.equal(sl.origin + sl.pathname, APP_STORE_URL);
  assert.equal(sl.searchParams.get("l"), "sl");
});

test("accepts the plain listing, ?l=sl, and host mentions that are not URLs", () => {
  withTree(
    {
      "index.html": `<a href="${APP_STORE_URL}">Download</a>`,
      "sl/index.html": `<a href="${appStoreUrlForLocale("sl")}">Prenesi</a>`,
      "js/attribution.js":
        'a[href*="apps.apple.com"] if (host.indexOf("apps.apple.com") !== -1)',
      "js/cookieconsent.esm.js": "x.replace('{{revisionMessage}}', message)",
      "notes.txt": "https://play.google.com/store/apps/details?id=com.example",
      "data.json": JSON.stringify({ store: APP_STORE_URL + "?ct=spring" }),
      "feed.xml": `<loc>${APP_STORE_URL}?l=sl&amp;ct=spring</loc>`,
      "pixel.png": "https://itunes.apple.com/app/zyflow/id6763228086 {{ appStoreUrl }}",
    },
    (dir) => {
      assert.doesNotThrow(() => assertAppStoreLinks(dir));
    }
  );
});

test("rejects App Store URLs that are not the Slovenia listing", () => {
  const cases = [
    ["footer.html", "https://itunes.apple.com/app/zyflow/id6763228086", /itunes\.apple\.com/],
    ["footer.html", "itunes.apple.com/us/app/zyflow/id6763228086", /not an absolute http\(s\) URL/],
    ["footer.html", "http://apps.apple.com/us/app/zyflow/id6763228086", /scheme is http:/],
    ["footer.html", "http://apps.apple.com/si/app/zyflow/id6763228086", /scheme is http:/],
    ["footer.html", "https://apps.apple.com/si/app/zyflow/id0000000", /id0000000/],
    ["footer.html", "https://apps.apple.com/de/app/zyflow/id6763228086", /\/de\/app\//],
    ["js/home.js", "https://apps.apple.com/us/app/zyflow/id6763228086", /\/us\/app\//],
    ["listing.json", "https://apps.apple.com/si/app/zyflow/id0000000", /id0000000/],
    ["page.xml", "https://itunes.apple.com/si/app/zyflow/id6763228086", /itunes\.apple\.com/],
    ["readme.txt", "https://apps.apple.com/app/zyflow/id6763228086", /\/app\/zyflow/],
  ];
  for (const [file, body, pattern] of cases) {
    rejects({ [file]: body }, pattern);
  }
});

test("rejects leftover template tokens and the __APP_STORE_URL__ placeholder", () => {
  rejects({ "footer.html": '<a href="{{ appStoreUrl }}">' }, /\{\{ appStoreUrl \}\}/);
  rejects({ "footer.html": '<a href="{{appStoreUrl}}">' }, /\{\{appStoreUrl\}\}/);
  rejects({ "footer.html": "__APP_STORE_URL__" }, /__APP_STORE_URL__/);
  rejects({ "js/config.js": "const url = '{{ appStoreUrl }}';" }, /\{\{ appStoreUrl \}\}/);
  rejects({ "copy.txt": "see {{redirectTo}} for details" }, /\{\{redirectTo\}\}/);
  rejects(
    { "footer.html": "x.replace('{{revisionMessage}}', message)" },
    /\{\{revisionMessage\}\}/
  );
});
