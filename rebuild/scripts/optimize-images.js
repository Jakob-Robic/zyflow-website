/**
 * Responsive images and contour-SVG slimming for the built site.
 *
 * Raster photos referenced from HTML are emitted as AVIF + WebP srcsets
 * (JPEG/WebP fallback on the <img>) sized to the layout, with a content
 * hash in the URL so the immutable /assets/* cache stays correct.
 * version-assets.js only versions JS and CSS; these hashed filenames are
 * the image equivalent and are left alone by that pass.
 *
 * The decorative map-contour SVGs are ~1.5 MB of stair-stepped polylines.
 * Points that sit on the same line are dropped (Douglas–Peucker) and the
 * result replaces the <img src>. Strokes, viewBox, and blend mode stay.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const sharp = require("sharp");

const RASTER_EXT = /\.(?:jpe?g|png|webp)$/i;
const CONTOUR_EXT = /\/map-contours[^/]*\.svg$/i;
const SKIP_BYTES = 24 * 1024;
const CONTOUR_EPSILON = 1.2;
const AVIF_QUALITY = 48;
const WEBP_QUALITY = 68;
const JPEG_QUALITY = 74;

/** CSS display width (px) and the sizes attribute for known photos. */
const LAYOUT = {
  "hero.jpg": {
    maxCss: 1280,
    sizes: "(min-width: 1320px) 1280px, 100vw",
    priority: "high",
  },
  "hero-thumb.jpg": {
    maxCss: 280,
    sizes: "(max-width: 720px) 46vw, 280px",
  },
  "app-map.jpg": { maxCss: 280, sizes: "(max-width: 900px) 70vw, 240px" },
  "app-place.jpg": { maxCss: 240, sizes: "240px" },
  "polaroid-1.jpg": { maxCss: 220, sizes: "220px" },
  "polaroid-3.jpg": { maxCss: 220, sizes: "220px" },
  "forest-boardwalk.jpg": { maxCss: 160, sizes: "160px" },
  "coffee-sign.jpg": { maxCss: 220, sizes: "220px" },
  "mountain-overlook.jpg": { maxCss: 220, sizes: "220px" },
  "ljubljana-bridge.jpg": { maxCss: 240, sizes: "240px" },
  "intro-bikepack.jpg": { maxCss: 160, sizes: "160px" },
  "intro-cyclist.jpg": { maxCss: 200, sizes: "200px" },
  "about-polaroid-cyclist.jpg": { maxCss: 220, sizes: "220px" },
  "bikepack-sunset.jpg": { maxCss: 220, sizes: "220px" },
  "feature-1.jpg": {
    maxCss: 480,
    sizes: "(max-width: 720px) 100vw, (max-width: 1100px) 50vw, 420px",
  },
  "feature-2.jpg": {
    maxCss: 480,
    sizes: "(max-width: 720px) 100vw, (max-width: 1100px) 50vw, 420px",
  },
  "feature-3.jpg": {
    maxCss: 480,
    sizes: "(max-width: 720px) 100vw, (max-width: 1100px) 50vw, 420px",
  },
  "cat-slovenia.jpg": {
    maxCss: 400,
    sizes: "(max-width: 720px) 100vw, (max-width: 1100px) 50vw, 320px",
  },
  "cat-croatia.jpg": {
    maxCss: 400,
    sizes: "(max-width: 720px) 100vw, (max-width: 1100px) 50vw, 320px",
  },
  "cat-austria.jpg": {
    maxCss: 400,
    sizes: "(max-width: 720px) 100vw, (max-width: 1100px) 50vw, 320px",
  },
  "cat-italy.jpg": {
    maxCss: 400,
    sizes: "(max-width: 720px) 100vw, (max-width: 1100px) 50vw, 320px",
  },
  "journal-1.jpg": { maxCss: 400, sizes: "(max-width: 720px) 100vw, 200px" },
  "journal-2.jpg": { maxCss: 400, sizes: "(max-width: 720px) 100vw, 200px" },
  "social-1.jpg": { maxCss: 480, sizes: "(max-width: 720px) 100vw, 33vw" },
  "social-2.jpg": { maxCss: 480, sizes: "(max-width: 720px) 100vw, 33vw" },
  "social-3.jpg": { maxCss: 480, sizes: "(max-width: 720px) 100vw, 33vw" },
  "team-jakob.jpg": { maxCss: 480, sizes: "(max-width: 720px) 100vw, 420px" },
  "team-tanja.jpg": { maxCss: 480, sizes: "(max-width: 720px) 100vw, 420px" },
  "gravel-cyclist.jpg": { maxCss: 640, sizes: "(max-width: 720px) 100vw, 560px" },
  "cafe-break.jpg": { maxCss: 640, sizes: "(max-width: 900px) 100vw, 560px" },
  "cafe-bar-cyclists.jpg": { maxCss: 480, sizes: "(max-width: 720px) 100vw, 400px" },
  "alpine-ebike-overlook.jpg": { maxCss: 480, sizes: "(max-width: 720px) 100vw, 400px" },
  "bike-workshop.jpg": { maxCss: 480, sizes: "(max-width: 720px) 100vw, 400px" },
  "tour-4wd.jpg": { maxCss: 480, sizes: "(max-width: 720px) 100vw, 400px" },
  "tour-hike.jpg": { maxCss: 480, sizes: "(max-width: 720px) 100vw, 400px" },
  "tour-kayak.jpg": { maxCss: 480, sizes: "(max-width: 720px) 100vw, 400px" },
};

function layoutFor(sitePath) {
  const base = path.posix.basename(sitePath);
  if (LAYOUT[base]) return LAYOUT[base];
  if (sitePath.includes("/gallery/")) {
    return { maxCss: 800, sizes: "(max-width: 720px) 100vw, 720px" };
  }
  if (sitePath.includes("/tours/") || base.startsWith("cover.")) {
    return {
      maxCss: 480,
      sizes: "(max-width: 720px) 100vw, (max-width: 1100px) 50vw, 420px",
    };
  }
  if (sitePath.includes("/journal/")) {
    return { maxCss: 800, sizes: "(max-width: 800px) 100vw, 720px" };
  }
  return { maxCss: 640, sizes: "(max-width: 720px) 100vw, 640px" };
}

function pickWidths(intrinsic, maxCss) {
  const target = Math.min(intrinsic, Math.max(320, Math.round(maxCss * 2)));
  const ladder = [320, 480, 640, 800, 960, 1280, 1600, 1920, 2400];
  let widths = ladder.filter((w) => w < target - 16);
  widths.push(target);
  if (widths.length > 4) {
    const last = widths[widths.length - 1];
    const step = (widths.length - 1) / 3;
    const picked = [0, 1, 2].map((i) => widths[Math.round(i * step)]);
    widths = [...new Set([...picked, last])].sort((a, b) => a - b);
  }
  return widths;
}

function shortHash(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex").slice(0, 12);
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function parseAttrs(tag) {
  const attrs = {};
  const inner = tag.replace(/^<img\b\s*/i, "").replace(/\/?\s*>$/, "");
  const re = /([:@\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match;
  while ((match = re.exec(inner))) {
    attrs[match[1]] = match[2] ?? match[3] ?? match[4] ?? "";
  }
  return attrs;
}

function attrEscape(value) {
  return String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

function belowFold(html, index) {
  return html.lastIndexOf("</section>", index) !== -1;
}

/* —— contour simplification —— */

function parseSubpaths(d) {
  const tokens = d.match(/[MVLHZ]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi);
  if (!tokens) return [];
  const subs = [];
  let cur = null;
  let x = 0;
  let y = 0;
  let i = 0;
  const num = () => parseFloat(tokens[i++]);
  while (i < tokens.length) {
    const t = tokens[i++];
    if (t === "M") {
      x = num();
      y = num();
      cur = [[x, y]];
      subs.push(cur);
    } else if (t === "L") {
      x = num();
      y = num();
      cur.push([x, y]);
    } else if (t === "H") {
      x = num();
      cur.push([x, y]);
    } else if (t === "V") {
      y = num();
      cur.push([x, y]);
    } else if (t === "Z" || t === "z") {
      if (cur && cur.length) {
        const a = cur[0];
        const b = cur[cur.length - 1];
        if (a[0] !== b[0] || a[1] !== b[1]) cur.push([a[0], a[1]]);
        cur.closed = true;
      }
    } else {
      throw new Error(`Unexpected SVG path command: ${t}`);
    }
  }
  return subs;
}

function distPointSeg(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

function rdp(points, eps) {
  if (points.length < 3) return points.slice();
  let max = 0;
  let idx = 0;
  const end = points.length - 1;
  for (let i = 1; i < end; i++) {
    const d = distPointSeg(points[i], points[0], points[end]);
    if (d > max) {
      max = d;
      idx = i;
    }
  }
  if (max > eps) {
    const left = rdp(points.slice(0, idx + 1), eps);
    const right = rdp(points.slice(idx), eps);
    return left.slice(0, -1).concat(right);
  }
  return [points[0], points[end]];
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

function encodeSubpaths(subs) {
  let out = "";
  for (const sub of subs) {
    const pts = [];
    for (const [x, y] of sub) {
      const p = [round1(x), round1(y)];
      const q = pts[pts.length - 1];
      if (!q || p[0] !== q[0] || p[1] !== q[1]) pts.push(p);
    }
    if (pts.length < 2) continue;
    out += `M${pts[0][0]} ${pts[0][1]}`;
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i];
      const q = pts[i - 1];
      if (p[0] === q[0]) out += `V${p[1]}`;
      else if (p[1] === q[1]) out += `H${p[0]}`;
      else out += `L${p[0]} ${p[1]}`;
    }
    if (sub.closed) out += "Z";
  }
  return out;
}

function simplifyContourSvg(svgText, epsilon = CONTOUR_EPSILON) {
  return svgText.replace(/<path\b([^>]*?)\sd="([^"]+)"([^>]*)>/g, (_whole, pre, d, post) => {
    const subs = parseSubpaths(d).map((sub) => {
      const simplified = rdp(sub, epsilon);
      simplified.closed = sub.closed;
      return simplified;
    });
    return `<path${pre} d="${encodeSubpaths(subs)}"${post}>`;
  });
}

/* —— raster variants —— */

async function encodeVariant(input, width, format) {
  let pipeline = sharp(input, { limitInputPixels: false }).rotate();
  if (width) pipeline = pipeline.resize({ width, withoutEnlargement: true, fit: "inside" });
  if (format === "avif") {
    pipeline = pipeline.avif({ quality: AVIF_QUALITY, effort: 4, chromaSubsampling: "4:2:0" });
  } else if (format === "webp") {
    pipeline = pipeline.webp({ quality: WEBP_QUALITY, effort: 4, alphaQuality: 80 });
  } else if (format === "jpeg") {
    pipeline = pipeline.jpeg({ quality: JPEG_QUALITY, mozjpeg: true });
  } else if (format === "png") {
    pipeline = pipeline.png({ compressionLevel: 9 });
  } else {
    throw new Error(`Unknown format ${format}`);
  }
  const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

async function mapPool(items, limit, fn) {
  const ret = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      ret[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return ret;
}

async function buildRaster(dist, absFile, sitePath) {
  const source = fs.readFileSync(absFile);
  const hash = shortHash(source);
  const meta = await sharp(source, { limitInputPixels: false }).rotate().metadata();
  const intrinsic = meta.width || 1;
  const layout = layoutFor(sitePath);
  const widths = pickWidths(intrinsic, layout.maxCss);
  const hasAlpha = Boolean(meta.hasAlpha);
  const formats = ["avif", "webp"];
  const jobs = [];
  for (const format of formats) {
    for (const width of widths) jobs.push({ format, width });
  }
  const fallbackFormat = hasAlpha ? "png" : meta.format === "webp" ? "webp" : "jpeg";
  const fallbackExt = fallbackFormat === "jpeg" ? "jpg" : fallbackFormat;
  jobs.push({ format: fallbackFormat, width: widths[widths.length - 1], fallback: true });

  const dir = path.join(dist, "assets", "images", "opt", hash);
  fs.mkdirSync(dir, { recursive: true });

  const encoded = await mapPool(jobs, 3, async (job) => {
    const result = await encodeVariant(source, job.width, job.format);
    const name = job.fallback
      ? `fallback.${fallbackExt}`
      : `${result.width}.${job.format === "jpeg" ? "jpg" : job.format}`;
    fs.writeFileSync(path.join(dir, name), result.data);
    return { ...job, outWidth: result.width, bytes: result.data.length, name };
  });

  const byFormat = {};
  let fallback = null;
  for (const item of encoded) {
    if (item.fallback) {
      fallback = item;
      continue;
    }
    (byFormat[item.format] ||= []).push(item);
  }
  for (const list of Object.values(byFormat)) {
    list.sort((a, b) => a.outWidth - b.outWidth);
  }

  const srcset = (format) =>
    (byFormat[format] || [])
      .map((item) => `/assets/images/opt/${hash}/${item.name} ${item.outWidth}w`)
      .join(", ");

  return {
    sitePath,
    before: source.length,
    hash,
    sizes: layout.sizes,
    priority: layout.priority || null,
    width: meta.width,
    height: meta.height,
    avif: srcset("avif"),
    webp: srcset("webp"),
    fallbackSrc: `/assets/images/opt/${hash}/${fallback.name}`,
    generated: encoded.reduce((sum, item) => sum + item.bytes, 0),
    largestAvif: (byFormat.avif || []).reduce((sum, item) => Math.max(sum, item.bytes), 0),
  };
}

function renderPicture(attrs, variant, { lazy }) {
  const sizes = variant.sizes;
  const sources = [
    ["image/avif", variant.avif],
    ["image/webp", variant.webp],
  ]
    .filter(([, set]) => set)
    .map(
      ([type, set]) =>
        `<source type="${type}" srcset="${attrEscape(set)}" sizes="${attrEscape(sizes)}" />`
    )
    .join("");

  const imgAttrs = [];
  const consumed = new Set(["src", "srcset", "sizes", "loading", "fetchpriority", "decoding"]);
  imgAttrs.push(`src="${attrEscape(variant.fallbackSrc)}"`);
  imgAttrs.push(`sizes="${attrEscape(sizes)}"`);
  if (!attrs.width && variant.width) imgAttrs.push(`width="${variant.width}"`);
  if (!attrs.height && variant.height) imgAttrs.push(`height="${variant.height}"`);
  for (const [key, value] of Object.entries(attrs)) {
    if (consumed.has(key)) continue;
    imgAttrs.push(`${key}="${attrEscape(value)}"`);
  }
  imgAttrs.push(`decoding="async"`);
  if (variant.priority === "high" && !lazy) {
    imgAttrs.push(`fetchpriority="high"`);
  } else if (lazy) {
    imgAttrs.push(`loading="lazy"`);
    imgAttrs.push(`fetchpriority="low"`);
  }
  return `<picture>${sources}<img ${imgAttrs.join(" ")} /></picture>`;
}

function rewriteImgTag(tag, { lazy, rasters, contours }) {
  const attrs = parseAttrs(tag);
  const src = attrs.src || "";
  if (!src.startsWith("/assets/")) return tag;

  if (CONTOUR_EXT.test(src) && contours.has(src)) {
    const next = { ...attrs, src: contours.get(src).url };
    const parts = [];
    const consumed = new Set(["loading", "decoding", "fetchpriority"]);
    for (const [key, value] of Object.entries(next)) {
      if (consumed.has(key)) continue;
      parts.push(`${key}="${attrEscape(value)}"`);
    }
    parts.push(`decoding="async"`);
    if (lazy) {
      parts.push(`loading="lazy"`);
      parts.push(`fetchpriority="low"`);
    }
    return `<img ${parts.join(" ")} />`;
  }

  const variant = rasters.get(src);
  if (!variant) {
    if (!lazy || attrs.loading) return tag;
    if (/\sloading=/.test(tag)) return tag;
    return tag.replace(/<img\b/i, '<img loading="lazy" decoding="async"');
  }
  return renderPicture(attrs, variant, { lazy });
}

function rewritePreload(html, rasters) {
  return html.replace(/<link\b[^>]*rel="preload"[^>]*>/gi, (tag) => {
    const href = (tag.match(/\bhref="([^"]+)"/) || [])[1] || "";
    if (!href.endsWith("/assets/images/home/hero.jpg")) return tag;
    const variant = rasters.get("/assets/images/home/hero.jpg");
    if (!variant || !variant.avif) return tag;
    const hrefCandidate = variant.avif.split(", ").pop().split(" ")[0];
    return `<link rel="preload" as="image" href="${attrEscape(hrefCandidate)}" type="image/avif" imagesrcset="${attrEscape(variant.avif)}" imagesizes="${attrEscape(variant.sizes)}" fetchpriority="high" />`;
  });
}

/** Point JSON-LD images at the hashed variant the page <img> serves, so originals can be pruned. */
function rewriteJsonLdImages(html, rasters) {
  if (!html.includes("application/ld+json")) return html;
  return html.replace(
    /<script type="application\/ld\+json">([^<]*)<\/script>/g,
    (full, json) => {
      let next = json;
      for (const [src, variant] of rasters) {
        if (!variant || !variant.fallbackSrc || !next.includes(src)) continue;
        next = next.split(src).join(variant.fallbackSrc);
      }
      return next === json ? full : `<script type="application/ld+json">${next}</script>`;
    }
  );
}

function rewriteHtml(html, rasters, contours) {
  const tagRe = /<img\b[^>]*>/gi;
  let out = "";
  let last = 0;
  let match;
  while ((match = tagRe.exec(html))) {
    const lazy = belowFold(html, match.index);
    out += html.slice(last, match.index);
    out += rewriteImgTag(match[0], { lazy, rasters, contours });
    last = match.index + match[0].length;
  }
  out += html.slice(last);
  return rewritePreload(out, rasters);
}

async function optimizeImages(dist) {
  const htmlFiles = walk(dist).filter((file) => file.endsWith(".html"));
  const htmlByFile = new Map(htmlFiles.map((file) => [file, fs.readFileSync(file, "utf8")]));
  const rasterSrcs = new Set();
  const contourSrcs = new Set();
  for (const html of htmlByFile.values()) {
    for (const match of html.matchAll(/<img\b[^>]*\bsrc="([^"]+)"[^>]*>/gi)) {
      const src = match[1];
      if (!src.startsWith("/assets/")) continue;
      if (RASTER_EXT.test(src)) rasterSrcs.add(src);
      else if (CONTOUR_EXT.test(src)) contourSrcs.add(src);
    }
    if (html.includes("/assets/images/home/hero.jpg")) {
      rasterSrcs.add("/assets/images/home/hero.jpg");
    }
  }

  const rasters = new Map();
  const rasterJobs = [];
  for (const src of rasterSrcs) {
    const abs = path.join(dist, src.replace(/^\//, ""));
    if (!fs.existsSync(abs)) continue;
    if (fs.statSync(abs).size < SKIP_BYTES) continue;
    rasterJobs.push({ src, abs });
  }
  await mapPool(rasterJobs, 2, async (job) => {
    rasters.set(job.src, await buildRaster(dist, job.abs, job.src));
  });

  const contours = new Map();
  let contourBefore = 0;
  let contourAfter = 0;
  for (const src of contourSrcs) {
    const abs = path.join(dist, src.replace(/^\//, ""));
    if (!fs.existsSync(abs)) continue;
    const source = fs.readFileSync(abs);
    if (source.length < 80 * 1024) continue;
    const simplified = Buffer.from(simplifyContourSvg(source.toString("utf8")));
    const hash = shortHash(simplified);
    const url = `/assets/images/opt/${hash}/map-contours.svg`;
    const outFile = path.join(dist, url.replace(/^\//, ""));
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    if (!fs.existsSync(outFile)) fs.writeFileSync(outFile, simplified);
    contours.set(src, { url, before: source.length, after: simplified.length });
    contourBefore += source.length;
    contourAfter += simplified.length;
  }

  for (const [file, html] of htmlByFile) {
    const next = rewriteJsonLdImages(rewriteHtml(html, rasters, contours), rasters);
    if (next !== html) fs.writeFileSync(file, next, "utf8");
  }

  // Originals are no longer requested once HTML points at hashed variants.
  // Drop the unreferenced copies so the deploy does not ship both. OG tags
  // and anything else that still names a file keep that file.
  const texts = [];
  for (const file of walk(dist)) {
    if (/\.(?:html|css|js|svg|json|xml|txt)$/.test(file)) texts.push(fs.readFileSync(file, "utf8"));
  }
  const corpus = texts.join("\n");
  let droppedBytes = 0;
  for (const file of walk(path.join(dist, "assets", "images"))) {
    if (file.split(path.sep).includes("opt")) continue;
    const base = path.basename(file);
    const isContour = /map-contours.*\.svg$/i.test(base);
    const isRaster = RASTER_EXT.test(file);
    if (!isContour && !isRaster) continue;
    const size = fs.statSync(file).size;
    if (isRaster && size < SKIP_BYTES) continue;
    if (isContour && size < 80 * 1024) continue;
    const sitePath = `/${path.relative(dist, file).split(path.sep).join("/")}`;
    if (corpus.includes(sitePath)) continue;
    fs.rmSync(file);
    droppedBytes += size;
  }

  const rasterBefore = [...rasters.values()].reduce((sum, item) => sum + item.before, 0);
  const rasterGenerated = [...rasters.values()].reduce((sum, item) => sum + item.generated, 0);
  const largestAvif = [...rasters.values()].reduce((sum, item) => sum + item.largestAvif, 0);
  console.log(
    `optimized ${rasters.size} rasters (sources ${rasterBefore} bytes, largest AVIF each ${largestAvif} bytes, all variants ${rasterGenerated} bytes) and ${contours.size} contour SVGs (${contourBefore} → ${contourAfter} bytes); removed ${droppedBytes} bytes of unreferenced originals`
  );
  return { rasters, contours, rasterBefore, rasterGenerated, contourBefore, contourAfter };
}

module.exports = {
  optimizeImages,
  simplifyContourSvg,
  pickWidths,
  layoutFor,
  CONTOUR_EPSILON,
};
