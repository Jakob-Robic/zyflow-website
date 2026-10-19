const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { PAGES, pageLocales, SITE_ORIGIN } = require("./pages");
const {
  descriptionIssues,
  collectMetaIssues,
  absoluteOgImage,
} = require("./page-meta");

const LOCALES = path.join(__dirname, "..", "locales");

function loadLocales() {
  return {
    en: JSON.parse(fs.readFileSync(path.join(LOCALES, "en.json"), "utf8")),
    sl: JSON.parse(fs.readFileSync(path.join(LOCALES, "sl.json"), "utf8")),
  };
}

test("every built page has a short, in-language meta description", () => {
  const issues = collectMetaIssues(loadLocales(), PAGES, pageLocales);
  assert.deepEqual(issues, []);
});

test("flags a description cut off mid-word", () => {
  const cut =
    "Probably one of the most beautiful links in the Kranjska roža network. From central Kranj head toward Jamnik; after a few kilometres of climbing, the Karav";
  assert.ok(descriptionIssues("en", cut).includes("truncated mid-word"));
});

test("flags a Slovenian place list on an English page", () => {
  const places =
    "Zgornje Jezersko–Spodnji Kraj–kamnolom lehnjaka–Sp. Virnik–Zgornje Jezersko";
  const issues = descriptionIssues("en", places);
  assert.ok(issues.some((issue) => issue.includes("sentence boundary")));
  assert.ok(issues.some((issue) => issue.includes("Slovenian")));
});

test("flags an English description on a Slovenian page", () => {
  const english =
    "Privacy Policy, Cookie Policy, and Terms of Service for Zyflow and HERKO d.o.o.";
  assert.ok(
    descriptionIssues("sl", english).some((issue) => issue.includes("English"))
  );
});

test("flags a description longer than 160 characters", () => {
  const long = `${"Word ".repeat(40).trim()}.`;
  assert.ok(long.length > 160);
  assert.ok(descriptionIssues("en", long).some((issue) => issue.includes("160")));
});

test("tour og:image uses the route cover; other pages keep the default", () => {
  assert.equal(
    absoluteOgImage(SITE_ORIGIN, "./assets/images/tours/jezerski-vrh/cover.jpg"),
    `${SITE_ORIGIN}/assets/images/tours/jezerski-vrh/cover.jpg`
  );
  assert.equal(
    absoluteOgImage(SITE_ORIGIN, ""),
    `${SITE_ORIGIN}/assets/images/home/hero.jpg`
  );
});

test("built tour pages ship their own description and cover image", () => {
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), "zyflow-meta-"));
  execFileSync(process.execPath, [path.join(__dirname, "build.js")], {
    env: { ...process.env, REBUILD_DIST: dist },
    stdio: "pipe",
  });

  const read = (rel) => fs.readFileSync(path.join(dist, rel), "utf8");
  const desc = (html) => html.match(/<meta name="description" content="([^"]*)"/)[1];
  const image = (html) => html.match(/<meta property="og:image" content="([^"]*)"/)[1];
  const title = (html) => html.match(/<title>([^<]*)<\/title>/)[1];

  const jezerski = read("tours/jezerski-vrh.html");
  assert.equal(
    desc(jezerski),
    "Jezerski vrh cycling route: 18.2 km, 457 m to Ankova planina. Open in Zyflow."
  );
  assert.equal(
    image(jezerski),
    `${SITE_ORIGIN}/assets/images/tours/jezerski-vrh/cover.jpg`
  );
  assert.match(title(jezerski), /Jezerski vrh/);

  const virnik = read("tours/spodnji-virnik.html");
  assert.equal(title(virnik), "Zyflow: Spodnji Virnik – Kehnjak tufa quarry");
  assert.match(desc(virnik), /Kehnjak tufa/);
  assert.equal(
    image(virnik),
    `${SITE_ORIGIN}/assets/images/tours/spodnji-virnik/cover.jpg`
  );

  const home = read("index.html");
  assert.equal(image(home), `${SITE_ORIGIN}/assets/images/home/hero.jpg`);

  const legal = read("sl/legal.html");
  assert.equal(
    desc(legal),
    "Politika zasebnosti, politika piškotkov in pogoji uporabe za Zyflow in HERKO d.o.o."
  );
  assert.equal(image(legal), `${SITE_ORIGIN}/assets/images/home/hero.jpg`);

  const slJezerski = read("sl/tours/jezerski-vrh.html");
  assert.match(desc(slJezerski), /Odpri pot v Zyflow/);
  assert.equal(image(slJezerski), image(jezerski));
});
