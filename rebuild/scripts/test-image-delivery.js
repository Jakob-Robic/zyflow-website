const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const sharp = require("sharp");
const { simplifyContourSvg, pickWidths, optimizeImages } = require("./optimize-images");
const { bundleCss } = require("./bundle-css");

test("contour simplification keeps the drawing and drops stair-step points", () => {
  const d = "M0 0V1V2V3V4L10 4H20V0Z";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 4"><path id="elev-01" d="${d}" stroke="white" stroke-width="0.75"/></svg>`;
  const next = simplifyContourSvg(svg, 0.5);
  assert.match(next, /stroke="white"/);
  assert.match(next, /id="elev-01"/);
  assert.match(next, /viewBox="0 0 20 4"/);
  const simplified = next.match(/\sd="([^"]+)"/)[1];
  assert.ok(simplified.length < d.length);
  assert.match(simplified, /^M0 0/);
  assert.match(simplified, /Z$/);
});

test("responsive widths stay within the layout and the intrinsic size", () => {
  const hero = pickWidths(1024, 1280);
  assert.equal(hero[hero.length - 1], 1024);
  assert.ok(hero.length <= 4);
  assert.ok(hero.every((w) => w <= 1024));
  const small = pickWidths(4000, 220);
  assert.ok(small[small.length - 1] <= 440);
  assert.ok(small.length <= 4);
});

test("turnstile script is armed on focus and input, not on page load", () => {
  const src = fs.readFileSync(path.join(__dirname, "../js/analytics-events.js"), "utf8");
  assert.match(src, /addEventListener\("focusin", start\)/);
  assert.match(src, /addEventListener\("input", start\)/);
  assert.match(src, /challenges\.cloudflare\.com\/turnstile\/v0\/api\.js\?render=explicit/);
  assert.match(src, /turnstileToken: token/);
  assert.match(src, /honeypotValue\(form\)/);
  assert.doesNotMatch(src, /initTurnstileWidgets/);
  const boot = src.slice(src.indexOf("function bootForms"));
  assert.match(boot, /armTurnstileOnInteraction/);
  assert.doesNotMatch(boot, /loadTurnstileScript\(\)/);
});

test("bundleCss inlines imports and rebases font urls", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "zyflow-css-"));
  try {
    fs.mkdirSync(path.join(dir, "css"), { recursive: true });
    fs.mkdirSync(path.join(dir, "assets", "fonts"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, "assets", "fonts.css"),
      '@font-face{src:url("./fonts/DMSans.woff2") format("woff2");}\n'
    );
    fs.writeFileSync(
      path.join(dir, "css", "main.css"),
      '@import url("../assets/fonts.css");\nbody{color:red}\n'
    );
    bundleCss(dir);
    const css = fs.readFileSync(path.join(dir, "css", "main.css"), "utf8");
    assert.doesNotMatch(css, /@import/);
    assert.match(css, /url\("\.\.\/assets\/fonts\/DMSans\.woff2"\)/);
    assert.match(css, /body\{color:red\}/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("optimizeImages emits an AVIF picture and a smaller contour svg", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "zyflow-img-"));
  try {
    const imgDir = path.join(dir, "assets", "images", "home");
    fs.mkdirSync(imgDir, { recursive: true });
    const raw = Buffer.alloc(800 * 400 * 3);
    for (let i = 0; i < raw.length; i++) raw[i] = (i * 17) & 255;
    await sharp(raw, { raw: { width: 800, height: 400, channels: 3 } })
      .jpeg({ quality: 95 })
      .toFile(path.join(imgDir, "hero.jpg"));
    const svgPath = path.join(imgDir, "map-contours-featured.svg");
    const pad = "V1".repeat(50 * 1024);
    fs.writeFileSync(
      svgPath,
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 40"><path d="M0 0${pad}Z" stroke="white" stroke-width="0.75"/></svg>`
    );
    fs.writeFileSync(
      path.join(dir, "index.html"),
      `<head><link rel="preload" href="/assets/images/home/hero.jpg" as="image" fetchpriority="high" /></head>
<section><img src="/assets/images/home/hero.jpg" alt="Cyclist riding a scenic road" /></section>
<section><img src="/assets/images/home/map-contours-featured.svg" alt="" /></section>`
    );
    const before = fs.statSync(svgPath).size;
    await optimizeImages(dir);
    const html = fs.readFileSync(path.join(dir, "index.html"), "utf8");
    assert.match(html, /<picture><source type="image\/avif"/);
    assert.match(html, /type="image\/webp"/);
    assert.match(html, /rel="preload"[^>]*type="image\/avif"/);
    assert.match(html, /alt="Cyclist riding a scenic road"/);
    assert.doesNotMatch(html, /map-contours-featured\.svg/);
    const contour = html.match(/\/assets\/images\/opt\/[0-9a-f]{12}\/map-contours\.svg/);
    assert.ok(contour);
    const after = fs.statSync(path.join(dir, contour[0].slice(1))).size;
    assert.ok(after < before / 5, `contour ${after} should be much smaller than ${before}`);
    assert.match(html, /loading="lazy"/);
    const hero = html.match(/<img\b[^>]*Cyclist riding a scenic road[^>]*>/)[0];
    assert.doesNotMatch(hero, /loading="lazy"/);
    assert.match(hero, /fetchpriority="high"/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
