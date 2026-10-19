const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");
const { versionAssets } = require("./version-assets");

const VERSION = /\?v=[0-9a-f]{10}\b/;

function sha(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex").slice(0, 10);
}

function walkHtml(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walkHtml(full, out);
    else if (e.name.endsWith(".html")) out.push(full);
  }
  return out;
}

test("built HTML references /js and /css with a content version", () => {
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), "zyflow-dist-"));
  try {
    execFileSync(process.execPath, [path.join(__dirname, "build.js")], {
      env: { ...process.env, REBUILD_DIST: dist, MAPTILER_KEY: "testKey_0123456789" },
      stdio: "pipe",
    });

    const refs = [];
    for (const file of walkHtml(dist)) {
      const html = fs.readFileSync(file, "utf8");
      for (const m of html.matchAll(/(?:src|href)="(\/(?:js|css|assets)\/[^"]+\.(?:js|css)[^"]*)"/g)) {
        refs.push([path.relative(dist, file), m[1]]);
      }
    }
    assert.ok(refs.some(([, u]) => u.startsWith("/js/")), "expected /js references");
    assert.ok(refs.some(([, u]) => u.startsWith("/css/")), "expected /css references");
    for (const [file, url] of refs) {
      assert.match(url, VERSION, `${file}: unversioned ${url}`);
    }

    // tour-map.js is versioned by the hash of its bytes AFTER key injection.
    const tourMap = path.join(dist, "js", "tour-map.js");
    assert.match(fs.readFileSync(tourMap, "utf8"), /testKey_0123456789/);
    const tourHtml = fs.readFileSync(path.join(dist, "tours", "blejcanka.html"), "utf8");
    assert.ok(
      tourHtml.includes(`/js/tour-map.js?v=${sha(tourMap)}`),
      "blejcanka should reference tour-map.js by its post-injection hash"
    );

    const home = fs.readFileSync(path.join(dist, "index.html"), "utf8");
    const mainCss = fs.readFileSync(path.join(dist, "css", "main.css"), "utf8");
    assert.doesNotMatch(mainCss, /(^|[;{}])\s*@import\b/m);
    assert.match(mainCss, /url\("\.\.\/assets\/design-system\/fonts\/DMSans\.woff2"\)/);
    assert.match(home, /type="image\/avif"/);
    assert.match(home, /imagesrcset="[^"]+\.avif \d+w/);
    assert.match(home, /fetchpriority="high"/);
    assert.doesNotMatch(home, /map-contours-featured\.svg/);
    assert.match(home, /\/assets\/images\/opt\/[0-9a-f]{12}\/map-contours\.svg/);
    const heroImg = home.match(/<img\b[^>]*Cyclist riding a scenic road[^>]*>/);
    assert.ok(heroImg, "hero image should remain");
    assert.doesNotMatch(heroImg[0], /loading="lazy"/);
    assert.match(heroImg[0], /fetchpriority="high"/);
    const shot = home.indexOf("phone-ui__shot");
    const appMap = home.slice(home.lastIndexOf("<picture>", shot), home.indexOf("</picture>", shot));
    assert.match(appMap, /loading="lazy"/);
    assert.match(appMap, /type="image\/avif"/);
    const events = fs.readFileSync(path.join(dist, "js", "analytics-events.js"), "utf8");
    assert.match(events, /armTurnstileOnInteraction/);
    assert.doesNotMatch(events, /initTurnstileWidgets/);
    assert.match(home, /#cc-main\s*\{[^}]*position:\s*fixed/);
    assert.match(home, /cookieconsent\.css\?v=[0-9a-f]{10}" media="print"/);
    const contour = home.match(/\/assets\/images\/opt\/[0-9a-f]{12}\/map-contours\.svg/);
    const contourFile = path.join(dist, contour[0].slice(1));
    assert.ok(fs.statSync(contourFile).size < 120 * 1024, "simplified contour should be well under the 1.5MB source");
    assert.ok(!fs.existsSync(path.join(dist, "assets/images/home/map-contours-featured.svg")));
  } finally {
    fs.rmSync(dist, { recursive: true, force: true });
  }
});

test("a change in an @imported stylesheet changes the importer's version", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "zyflow-ver-"));
  const setup = (child) => {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(path.join(dir, "css"), { recursive: true });
    fs.writeFileSync(path.join(dir, "css", "main.css"), '@import url("./child.css?v=3");\n');
    fs.writeFileSync(path.join(dir, "css", "child.css"), child);
    fs.writeFileSync(path.join(dir, "index.html"), '<link rel="stylesheet" href="/css/main.css?v=8" />');
    versionAssets(dir);
    return fs.readFileSync(path.join(dir, "index.html"), "utf8");
  };
  try {
    const a = setup("body{color:red}");
    assert.match(fs.readFileSync(path.join(dir, "css", "main.css"), "utf8"), /child\.css\?v=[0-9a-f]{10}"/);
    const b = setup("body{color:blue}");
    assert.match(a, VERSION);
    assert.notEqual(a, b);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
