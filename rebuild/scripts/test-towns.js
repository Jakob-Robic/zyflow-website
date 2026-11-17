/**
 * Town pages (/cycling/<town>) and their hub: the TOWNS_PUBLIC switch, the draft
 * gate, and what every built town page must contain. The build tests run build.js
 * into a temp dist like test-guides.js, on the real content in content/towns.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync, spawnSync } = require("child_process");

const BUILD = path.join(__dirname, "build.js");
const TOWNS_DIR = path.join(__dirname, "..", "..", "content", "towns");

function tempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function buildDist(env) {
  const dist = tempDir("zyflow-towns-dist-");
  execFileSync(process.execPath, [BUILD], {
    env: { ...process.env, REBUILD_DIST: dist, MAPTILER_KEY: "", TOWNS_PUBLIC: "false", TOWNS_DRAFTS: "", SITE_INDEX: "", ...env },
    stdio: "pipe",
  });
  return dist;
}

function buildFails(env) {
  const dist = tempDir("zyflow-towns-fail-");
  const result = spawnSync(process.execPath, [BUILD], {
    env: { ...process.env, REBUILD_DIST: dist, MAPTILER_KEY: "", TOWNS_PUBLIC: "false", TOWNS_DRAFTS: "", SITE_INDEX: "", ...env },
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0, "build was expected to fail");
  return `${result.stdout}\n${result.stderr}`;
}

function read(dist, rel) {
  return fs.readFileSync(path.join(dist, rel), "utf8");
}

/** Visible text of a page: no scripts, styles or tags. */
function visibleText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");
}

const towns = fs
  .readdirSync(TOWNS_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && !entry.name.startsWith("_") && fs.existsSync(path.join(TOWNS_DIR, entry.name, "data.json")))
  .map((entry) => ({ slug: entry.name, data: JSON.parse(fs.readFileSync(path.join(TOWNS_DIR, entry.name, "data.json"), "utf8")) }));

test("switch off: no town pages, no footer link, crawlers kept out", () => {
  const dist = buildDist({});
  assert.equal(fs.existsSync(path.join(dist, "cycling")), false, "no /cycling pages while TOWNS_PUBLIC is off");
  assert.equal(fs.existsSync(path.join(dist, "cycling.html")), false, "no hub while TOWNS_PUBLIC is off");
  assert.doesNotMatch(read(dist, "index.html"), /href="[^"]*\/cycling"/, "footer must not link the hub");
  assert.match(read(dist, "robots.txt"), /Disallow: \/cycling/);
  assert.doesNotMatch(read(dist, "sitemap.xml"), /\/cycling/);
});

test("switch on without drafts fails while no town is published", () => {
  const published = towns.some(({ slug }) => {
    const file = path.join(TOWNS_DIR, slug, "text.en.json");
    return fs.existsSync(file) && JSON.parse(fs.readFileSync(file, "utf8")).status === "published";
  });
  if (published) return; // once a town is published this case no longer applies
  buildFails({ TOWNS_PUBLIC: "true" });
});

test("production build: published towns indexed, in the sitemap, hub linked", () => {
  const dist = buildDist({ TOWNS_PUBLIC: "true", SITE_INDEX: "true" });
  const published = towns.filter(({ slug }) => {
    const file = path.join(TOWNS_DIR, slug, "text.en.json");
    return fs.existsSync(file) && JSON.parse(fs.readFileSync(file, "utf8")).status === "published";
  });
  for (const { slug } of published) {
    const html = read(dist, `cycling/${slug}.html`);
    assert.match(html, /<meta name="robots" content="index, follow"/, `${slug} indexable`);
    assert.match(read(dist, "sitemap.xml"), new RegExp(`/cycling/${slug}<`), `${slug} in sitemap`);
  }
  if (published.length) {
    assert.doesNotMatch(read(dist, "robots.txt"), /Disallow: \/cycling/);
    assert.match(read(dist, "index.html"), /href="[^"]*\/cycling"/, "footer links the hub");
  }
});

test("drafts are never indexed", () => {
  const out = buildFails({ TOWNS_PUBLIC: "true", TOWNS_DRAFTS: "true", SITE_INDEX: "true" });
  assert.match(out, /draft/i);
});

test("every town page builds whole (preview with drafts)", async (t) => {
  const dist = buildDist({ TOWNS_PUBLIC: "true", TOWNS_DRAFTS: "true" });
  const hub = read(dist, "cycling.html");

  await t.test("hub lists every town and never says 0 or 1 routes", () => {
    for (const { slug } of towns) assert.match(hub, new RegExp(`/cycling/${slug}"`), `hub misses ${slug}`);
    assert.doesNotMatch(visibleText(hub), /\b0 routes\b|\b1 routes\b/);
  });

  for (const { slug, data } of towns) {
    await t.test(slug, () => {
      const html = read(dist, `cycling/${slug}.html`);
      const text = visibleText(html);
      assert.equal((html.match(/<h1[\s>]/g) || []).length, 1, "exactly one h1");
      assert.doesNotMatch(html, /<!-- TOWN_[A-Z]+ -->/, "every template marker replaced");
      assert.doesNotMatch(text, /\bundefined\b|\bNaN\b|\[object Object\]/, "no broken values in the text");
      assert.match(html, /<link rel="canonical" href="https:\/\/www\.zyflow\.eu\/cycling\//);
      assert.match(html, /<meta name="robots" content="noindex, nofollow"/, "previews are not indexed");

      // Structured data parses.
      for (const [, json] of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
        assert.doesNotThrow(() => JSON.parse(json), "JSON-LD must parse");
      }

      // A town without signed routes says nothing about them.
      if (!data.routes.length) assert.doesNotMatch(text, /signed (cycle )?routes?/i, "no route claims without routes");
      else assert.match(html, /id="routes"/, "a routes section when the town has routes");

      // The map is on the page exactly once.
      assert.equal((html.match(/data-tour-map/g) || []).length, 1, "one map");

      // Share image: the town's own crop, and the file exists.
      const og = (html.match(/<meta property="og:image" content="([^"]+)"/) || [])[1] || "";
      if (og.includes("/og/towns/")) {
        assert.ok(fs.existsSync(path.join(dist, new URL(og).pathname)), `missing share image ${og}`);
      }

      // A Slovenian page, where the town has a Slovenian text: whole, and no English left.
      if (fs.existsSync(path.join(TOWNS_DIR, slug, "text.sl.json"))) {
        const sl = read(dist, `sl/kolesarjenje/${slug}.html`);
        const main = visibleText(sl.slice(sl.indexOf("<main"), sl.indexOf("</main>")));
        assert.equal((sl.match(/<h1[\s>]/g) || []).length, 1, "sl: exactly one h1");
        assert.match(sl, /<html[^>]* lang="sl"/, "sl: page language");
        assert.doesNotMatch(main, /\bundefined\b|\bNaN\b/, "sl: no broken values");
        for (const english of ["Places to stay", "Website", "from route", "Every day", "Common questions", "Get the app", "View route", "National route", "Local route", "in total", "Photo:"]) {
          assert.ok(!main.includes(english), `sl: English left on the page: "${english}"`);
        }
        assert.match(html, /hreflang="sl"/, "en page links its Slovenian version");
      }

      // The hero photo is not shown a second time further down.
      const hero = (html.match(/<section class="hero section town-hero"[\s\S]*?<\/section>/) || [])[0];
      if (hero) {
        const heroImg = (hero.match(/\/assets\/images\/opt\/([0-9a-f]+)\//) || [])[1];
        if (heroImg) {
          const rest = html.slice(html.indexOf(hero) + hero.length);
          assert.doesNotMatch(rest, new RegExp(`/opt/${heroImg}/`), "hero photo repeated below");
        }
      }
    });
  }
});
