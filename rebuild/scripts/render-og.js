#!/usr/bin/env node
/**
 * Render the Open Graph share images (1200×630) from the brand book templates.
 *
 * - Tours: assets/images/og/tours/<slug>.jpg — the route's cover photo, hero
 *   scrim, wordmark, Tanker route name and a mono data strip (km · climb).
 *   Numbers only, so one image serves both locales.
 * - Default: assets/images/og/zyflow-<locale>.jpg — the home hero photo with
 *   the localised hero eyebrow and "Every stop. One map." headline.
 *
 * Needs Google Chrome and macOS `sips` (PNG → JPEG). Re-run after a cover
 * photo, a route name or the headline copy changes, then commit the JPEGs.
 *
 * Usage:
 *   node rebuild/scripts/render-og.js            # everything
 *   node rebuild/scripts/render-og.js kamnicanka # one tour
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { pathToFileURL } = require("url");
const { tourHasOwnOg, defaultOgPath } = require("./page-meta");

const ROOT = path.join(__dirname, "..");
const CHROME =
  process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const WIDTH = 1200;
const HEIGHT = 630;
const JPEG_QUALITY = "82";

const asset = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const stripTags = (html) => String(html || "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
const escapeHtml = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

function page({ photo, eyebrow, title, strip, titleSize }) {
  const stripHtml = strip.length
    ? `<div class="strip">${strip.map((s) => `<span>${escapeHtml(s)}</span>`).join("")}</div>`
    : "";
  // Courier Prime from Google Fonts: the synced woff2 lacks Č, Š and Ž capitals.
  return `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Courier+Prime&display=block&subset=latin-ext">
<style>
@font-face{font-family:Tanker;src:url(${asset("assets/design-system/fonts/Tanker-Regular.woff2")}) format("woff2")}
*{margin:0;box-sizing:border-box}
html,body{width:${WIDTH}px;height:${HEIGHT}px;overflow:hidden;background:#000}
.photo{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.scrim{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,0) 0%,rgba(0,0,0,.38) 40%,rgba(0,0,0,.7) 100%)}
.wm{position:absolute;left:64px;top:60px;width:156px}
.copy{position:absolute;left:64px;right:64px;bottom:60px;display:flex;flex-direction:column;gap:18px;color:#fff}
.eyebrow{font:400 22px/1.2 "Courier Prime",monospace;letter-spacing:.04em;text-transform:uppercase;color:rgba(255,255,255,.84)}
.title{font:400 ${titleSize}px/1.02 Tanker,Impact,sans-serif;letter-spacing:-.01em;text-transform:uppercase;max-width:960px;text-wrap:balance}
.strip{display:flex;gap:28px;border-top:2px solid #fff;padding-top:14px;font:400 24px/1 "Courier Prime",monospace;letter-spacing:.04em;text-transform:uppercase}
</style></head><body>
<img class="photo" src="${photo}">
<div class="scrim"></div>
<img class="wm" src="${asset("assets/design-system/logos/png/zyflow-wordmark-on-dark-1200.png")}">
<div class="copy">
  <div class="eyebrow">${escapeHtml(eyebrow)}</div>
  <div class="title">${escapeHtml(title)}</div>
  ${stripHtml}
</div>
</body></html>`;
}

function render(html, outRel) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "zy-og-"));
  const htmlFile = path.join(tmp, "og.html");
  const pngFile = path.join(tmp, "og.png");
  fs.writeFileSync(htmlFile, html);
  execFileSync(CHROME, [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--allow-file-access-from-files",
    "--force-device-scale-factor=1",
    "--virtual-time-budget=3000",
    `--window-size=${WIDTH},${HEIGHT}`,
    `--screenshot=${pngFile}`,
    pathToFileURL(htmlFile).href,
  ], { stdio: "ignore" });
  const out = path.join(ROOT, outRel);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  execFileSync("sips", ["-s", "format", "jpeg", "-s", "formatOptions", JPEG_QUALITY, pngFile, "--out", out], {
    stdio: "ignore",
  });
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`  ${outRel}`);
}

function tourCover(slug) {
  const dir = path.join(ROOT, "assets/images/tours", slug);
  const file = fs.existsSync(dir) && fs.readdirSync(dir).find((f) => /^cover\.(jpe?g|webp|png)$/i.test(f));
  return file ? path.join(dir, file) : null;
}

function main() {
  const only = process.argv[2];
  const en = JSON.parse(fs.readFileSync(path.join(ROOT, "locales/en.json"), "utf8"));

  for (const [slug, route] of Object.entries(en.routes)) {
    if (only && only !== slug) continue;
    if (!tourHasOwnOg(slug)) continue;
    const cover = tourCover(slug);
    if (!cover) {
      console.warn(`  skip ${slug}: no cover photo`);
      continue;
    }
    render(
      page({
        photo: pathToFileURL(cover).href,
        eyebrow: stripTags(route.place),
        title: stripTags(route.titleHtml),
        strip: [stripTags(route.distanceHtml), `+${stripTags(route.climb)}`],
        titleSize: 96,
      }),
      `assets/images/og/tours/${slug}.jpg`
    );
  }

  if (!only) {
    for (const locale of ["en", "sl"]) {
      const messages = JSON.parse(fs.readFileSync(path.join(ROOT, `locales/${locale}.json`), "utf8"));
      render(
        page({
          photo: asset("assets/images/home/hero.jpg"),
          eyebrow: stripTags(messages.home.hero.titleHtml),
          title: stripTags(messages.home.appBanner.titleHtml.replace(/<br\s*\/?>/g, " ")),
          strip: [],
          titleSize: 104,
        }),
        defaultOgPath(locale).replace(/^\//, "")
      );
    }
  }
}

main();
