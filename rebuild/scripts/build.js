#!/usr/bin/env node
/**
 * Stitch HTML partials + inject locale strings → rebuild/dist/
 * Builds EN at dist/ and SL at dist/sl/, plus sitemap.xml / robots.txt.
 *
 * Include syntax: <!-- include:components/nav.html -->
 * Locale: data-i18n / data-i18n-html / data-i18n-attr="attr:key"
 *
 * Usage:
 *   node rebuild/scripts/build.js
 *   SITE_INDEX=true node rebuild/scripts/build.js
 */

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const {
  SITE_ORIGIN,
  LOCALES,
  DEFAULT_LOCALE,
  JOURNAL_IS_PUBLIC,
  PAGES,
  pageLocales,
  absoluteUrl,
  hrefForPage,
  localizedPath,
} = require("./pages");
const {
  renderAuthorPage,
  renderBlogHub,
  renderBlogPost,
  renderFeed,
  renderHomeJournal,
  renderStyleguide,
  rssHref,
  imageSources,
  ogSources,
  sitemapDate,
  structuredNodes,
  getCatalog,
} = require("./blog");
const { renderLegalMarkdown } = require("./legal-markdown");
const { routeBySlug, ROUTES } = require("./routes");
const { versionAssets } = require("./version-assets");
const { appStoreUrlForLocale, assertAppStoreLinks } = require("./store-links");
// Separate require from store-links (PR #28). Keep both lines if that branch lands first.
const {
  absoluteOgImage,
  collectMetaIssues,
  DEFAULT_OG_PATH,
  DEFAULT_OG_WIDTH,
  DEFAULT_OG_HEIGHT,
  DEFAULT_OG_TYPE,
  TOUR_OG_WIDTH,
  TOUR_OG_HEIGHT,
  TOUR_OG_TYPE,
  tourHasOwnOg,
  tourOgPath,
  ogImageAlt,
} = require("./page-meta");
const { bundleCss } = require("./bundle-css");
const { optimizeImages } = require("./optimize-images");

const ROOT = path.join(__dirname, "..");
// REBUILD_DIST lets tests build into a temp dir; Vercel uses the default.
const DIST = process.env.REBUILD_DIST
  ? path.resolve(process.env.REBUILD_DIST)
  : path.join(ROOT, "dist");
const PAGES_DIR = path.join(ROOT, "pages");
const LOCALES_DIR = path.join(ROOT, "locales");
const SITE_INDEX = process.env.SITE_INDEX === "true";
/**
 * Client MapTiler key for the tour maps (app base map, streets-v2). Set in
 * Vercel (Production + Preview). Unset → tour maps use the OpenFreeMap
 * fallback style. Restricted to Zyflow domains in MapTiler, never committed.
 */
const MAPTILER_KEY = readMapTilerKey();

function readMapTilerKey() {
  const key = (process.env.MAPTILER_KEY || "").trim();
  if (!key) return "";
  if (!/^[A-Za-z0-9_-]{10,200}$/.test(key)) {
    console.warn("MAPTILER_KEY ignored — unexpected format");
    return "";
  }
  return key;
}

const OG_IMAGE_PATH = DEFAULT_OG_PATH;
const OG_LOCALES = { en: "en_US", sl: "sl_SI" };

function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function rimrafContents(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    fs.rmSync(full, { recursive: true, force: true });
  }
}

function getByPath(obj, dotted) {
  return dotted.split(".").reduce((acc, key) => {
    if (acc == null) return undefined;
    const index = Number(key);
    if (Array.isArray(acc) && Number.isInteger(index) && String(index) === key) {
      return acc[index];
    }
    return acc[key];
  }, obj);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(str) {
  return escapeHtml(str).replace(/'/g, "&#39;");
}

function flattenKeys(obj, prefix = "", out = []) {
  if (obj == null || typeof obj !== "object" || Array.isArray(obj)) {
    if (prefix) out.push(prefix);
    return out;
  }
  for (const [key, value] of Object.entries(obj)) {
    const next = prefix ? `${prefix}.${key}` : key;
    if (value != null && typeof value === "object" && !Array.isArray(value)) {
      flattenKeys(value, next, out);
    } else if (Array.isArray(value)) {
      value.forEach((item, i) => {
        if (item != null && typeof item === "object") {
          flattenKeys(item, `${next}.${i}`, out);
        } else {
          out.push(`${next}.${i}`);
        }
      });
    } else {
      out.push(next);
    }
  }
  return out;
}

function assertLocaleParity(messagesByLocale) {
  const base = messagesByLocale[DEFAULT_LOCALE];
  const baseKeys = new Set(flattenKeys(base));
  for (const locale of LOCALES) {
    if (locale === DEFAULT_LOCALE) continue;
    const keys = new Set(flattenKeys(messagesByLocale[locale]));
    const missing = [...baseKeys].filter((k) => !keys.has(k));
    const extra = [...keys].filter((k) => !baseKeys.has(k));
    if (missing.length || extra.length) {
      const parts = [];
      if (missing.length) {
        parts.push(
          `missing in ${locale} (${missing.length}): ${missing.slice(0, 12).join(", ")}${
            missing.length > 12 ? "…" : ""
          }`
        );
      }
      if (extra.length) {
        parts.push(
          `extra in ${locale} (${extra.length}): ${extra.slice(0, 12).join(", ")}${
            extra.length > 12 ? "…" : ""
          }`
        );
      }
      throw new Error(`Locale key parity failed — ${parts.join("; ")}`);
    }
  }
}

/**
 * Drop <!-- name:public --> or <!-- name:hidden --> blocks.
 * The kept side is unwrapped so flipping the flag restores the markup.
 * Markers must be balanced pairs and must not nest: an unclosed opener
 * would otherwise swallow every later block, including a whole <main>.
 * Any other journal:* comment is an unknown or malformed marker.
 * `source` is the template path included in the thrown error.
 */
function markerError(source, detail) {
  return new Error(source ? `${source}: ${detail}` : detail);
}

function applyToggleBlocks(html, name, enabled, source = "") {
  const commentRe = /<!--[\s\S]*?-->/g;
  const knownRe = new RegExp(`^<!--\\s*(/)?${name}:(public|hidden)\\s*-->$`);
  const unknownKindRe = new RegExp(`^<!--\\s*/?${name}:([^\\s]*)\\s*-->$`);
  const mentions = new RegExp(`${name}\\s*:`);
  const markers = [];
  let match;
  while ((match = commentRe.exec(html))) {
    const raw = match[0];
    if (!mentions.test(raw)) continue;
    const known = knownRe.exec(raw);
    if (!known) {
      const kind = unknownKindRe.exec(raw);
      const label =
        kind && kind[1] && kind[1] !== "public" && kind[1] !== "hidden"
          ? `Unknown ${name} marker ${raw}`
          : `Malformed ${name} marker ${raw}`;
      throw markerError(source, label);
    }
    markers.push({
      closing: Boolean(known[1]),
      kind: known[2],
      raw,
      start: match.index,
      end: match.index + raw.length,
    });
  }

  const stack = [];
  const pairs = [];
  for (const marker of markers) {
    if (!marker.closing) {
      if (stack.length) {
        const open = stack[stack.length - 1];
        throw markerError(
          source,
          `Nested ${marker.raw} inside ${open.raw}. Journal markers must not nest.`
        );
      }
      stack.push(marker);
      continue;
    }
    const open = stack.pop();
    if (!open || open.kind !== marker.kind) {
      throw markerError(source, `Unbalanced ${marker.raw} with no matching opener.`);
    }
    pairs.push({ open, close: marker });
  }
  if (stack.length) {
    const open = stack[stack.length - 1];
    throw markerError(source, `Unclosed ${open.raw} marker.`);
  }

  const keep = enabled ? "public" : "hidden";
  let out = html;
  for (const pair of pairs.sort((a, b) => b.open.start - a.open.start)) {
    const middle = pair.open.kind === keep ? out.slice(pair.open.end, pair.close.start) : "";
    out = out.slice(0, pair.open.start) + middle + out.slice(pair.close.end);
  }
  return out;
}

/**
 * End index (exclusive) of the element that opened at `from`, counting nested
 * tags of the same name. Comments are skipped. Returns -1 if unclosed.
 */
function matchingCloseEnd(html, from, tagName) {
  const lower = tagName.toLowerCase();
  let depth = 1;
  let i = from;
  while (i < html.length && depth > 0) {
    const lt = html.indexOf("<", i);
    if (lt === -1) return -1;
    if (html.startsWith("<!--", lt)) {
      const end = html.indexOf("-->", lt + 4);
      i = end === -1 ? html.length : end + 3;
      continue;
    }
    if (html.startsWith("</", lt)) {
      const end = html.indexOf(">", lt);
      if (end === -1) return -1;
      const name = html.slice(lt + 2, end).trim().split(/\s+/)[0].toLowerCase();
      i = end + 1;
      if (name === lower) {
        depth -= 1;
        if (depth === 0) return i;
      }
      continue;
    }
    if (html.startsWith("<!", lt) || html.startsWith("<?", lt)) {
      const end = html.indexOf(">", lt);
      i = end === -1 ? html.length : end + 1;
      continue;
    }
    const end = findOpenTagEnd(html, lt);
    if (end === -1) return -1;
    const open = html.slice(lt, end + 1);
    const name = /^<([A-Za-z][\w:-]*)/.exec(open);
    const selfClosing = /\/\s*>$/.test(open);
    if (name && name[1].toLowerCase() === lower && !selfClosing) depth += 1;
    i = end + 1;
  }
  return depth === 0 ? i : -1;
}

function categoryOverrides() {
  const raw = process.env.ROUTE_CATEGORY_OVERRIDES || "";
  const overrides = new Map();
  if (!raw.trim()) return overrides;
  for (const part of raw.split(",")) {
    const [slug, category] = part.split("=").map((piece) => piece.trim());
    if (!slug || !category) {
      throw new Error(`Bad ROUTE_CATEGORY_OVERRIDES entry: ${part}`);
    }
    overrides.set(slug, category);
  }
  return overrides;
}

/** slug → category, with ROUTE_CATEGORY_OVERRIDES applied (test hook). */
function categoriesBySlug() {
  const overrides = categoryOverrides();
  const known = new Set(ROUTES.map((route) => route.slug));
  for (const slug of overrides.keys()) {
    if (!known.has(slug)) {
      throw new Error(`ROUTE_CATEGORY_OVERRIDES unknown slug: ${slug}`);
    }
  }
  return new Map(
    ROUTES.map((route) => [route.slug, overrides.get(route.slug) || route.category])
  );
}

function isTourCardOpenTag(openTag) {
  return /\bclass="[^"]*\btour-card\b/.test(openTag);
}

/**
 * Copy each tour card's data-category from ROUTES (matched by the card's
 * /tours/{slug} href). The card markup stays hand-authored; only the
 * category the filter reads is kept in step with the route record.
 */
function stampCardCategories(html, bySlug = categoriesBySlug()) {
  let out = "";
  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf("<article", i);
    if (lt === -1) {
      out += html.slice(i);
      break;
    }
    out += html.slice(i, lt);
    const openEnd = findOpenTagEnd(html, lt);
    if (openEnd === -1) {
      out += html.slice(lt);
      break;
    }
    const open = html.slice(lt, openEnd + 1);
    if (!isTourCardOpenTag(open)) {
      out += open;
      i = openEnd + 1;
      continue;
    }
    const closeAt = matchingCloseEnd(html, openEnd + 1, "article");
    if (closeAt === -1) throw new Error("Unclosed tour-card <article>");
    let article = html.slice(lt, closeAt);
    const slug = article.match(
      /href="(?:\.\/|\/)?(?:sl\/)?tours\/([a-z0-9-]+)(?:\.html)?"/
    );
    if (slug && bySlug.has(slug[1])) {
      const category = bySlug.get(slug[1]);
      const tagEnd = article.indexOf(">");
      let tag = article.slice(0, tagEnd);
      if (/\bdata-category="/.test(tag)) {
        tag = tag.replace(/\bdata-category="[^"]*"/, `data-category="${category}"`);
      } else {
        tag += ` data-category="${category}"`;
      }
      article = tag + article.slice(tagEnd);
    }
    out += article;
    i = closeAt;
  }
  return out;
}

function collectCardCategories(html) {
  const categories = new Set();
  const re = /<article\b[^>]*>/gi;
  let match;
  while ((match = re.exec(html))) {
    const open = match[0];
    if (!isTourCardOpenTag(open)) continue;
    const category = /\bdata-category="([^"]+)"/.exec(open);
    if (category) categories.add(category[1]);
  }
  return categories;
}

/** Categories that have a tour card in the grid after stamping from ROUTES. */
function publishedCardCategories() {
  const grid = read(path.join(ROOT, "sections/tours/grid.html"));
  return collectCardCategories(stampCardCategories(grid));
}

/**
 * Drop elements marked data-requires-category="…" unless the tours grid
 * renders a card in that category. Nested tags of the same name are counted
 * so an inner </a> cannot truncate the element.
 */
function stripUnpublishedCategories(html, published = publishedCardCategories()) {
  let out = "";
  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf("<", i);
    if (lt === -1) {
      out += html.slice(i);
      break;
    }
    out += html.slice(i, lt);
    if (html.startsWith("<!--", lt)) {
      const end = html.indexOf("-->", lt + 4);
      const to = end === -1 ? html.length : end + 3;
      out += html.slice(lt, to);
      i = to;
      continue;
    }
    if (html.startsWith("</", lt) || html.startsWith("<!", lt) || html.startsWith("<?", lt)) {
      const end = html.indexOf(">", lt);
      const to = end === -1 ? html.length : end + 1;
      out += html.slice(lt, to);
      i = to;
      continue;
    }
    const openEnd = findOpenTagEnd(html, lt);
    if (openEnd === -1) {
      out += html.slice(lt);
      break;
    }
    const open = html.slice(lt, openEnd + 1);
    const name = /^<([A-Za-z][\w:-]*)/.exec(open);
    const category = /\sdata-requires-category="([^"]*)"/.exec(open);
    const selfClosing = /\/\s*>$/.test(open);
    if (!name || !category || published.has(category[1])) {
      out += open;
      i = openEnd + 1;
      continue;
    }
    if (selfClosing) {
      i = openEnd + 1;
      continue;
    }
    const closeAt = matchingCloseEnd(html, openEnd + 1, name[1]);
    if (closeAt === -1) {
      throw new Error(
        `Unclosed <${name[1]} data-requires-category="${category[1]}">`
      );
    }
    i = closeAt;
  }
  return out;
}

function applyPublicationFlags(html, source = "") {
  html = applyToggleBlocks(html, "journal", JOURNAL_IS_PUBLIC, source);
  html = stampCardCategories(html);
  html = stripUnpublishedCategories(html);
  return html;
}

function resolveIncludes(html, stack = []) {
  const pattern = /<!--\s*include:([^\s]+)\s*-->/g;
  return html.replace(pattern, (_, rel) => {
    const clean = rel.trim();
    if (stack.includes(clean)) {
      throw new Error(`Circular include: ${[...stack, clean].join(" → ")}`);
    }
    const filePath = path.join(ROOT, clean);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Missing include: ${clean}`);
    }
    const partial = read(filePath);
    // Reject a bad marker in this partial before it is inlined, so the
    // error names this file rather than the page that included it.
    applyToggleBlocks(partial, "journal", JOURNAL_IS_PUBLIC, clean);
    return resolveIncludes(partial, [...stack, clean]);
  });
}

function findOpenTagEnd(html, start) {
  let i = start + 1;
  let quote = null;
  while (i < html.length) {
    const c = html[i];
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === ">") {
      return i;
    }
    i += 1;
  }
  return -1;
}

function mapOpenTags(html, fn) {
  let out = "";
  let i = 0;
  const n = html.length;
  while (i < n) {
    const lt = html.indexOf("<", i);
    if (lt === -1) {
      out += html.slice(i);
      break;
    }
    if (lt > i) out += html.slice(i, lt);
    if (html.startsWith("<!--", lt)) {
      const end = html.indexOf("-->", lt + 4);
      const to = end === -1 ? n : end + 3;
      out += html.slice(lt, to);
      i = to;
      continue;
    }
    const next = html[lt + 1];
    if (next === "/" || next === "!" || next === "?") {
      const gt = html.indexOf(">", lt + 2);
      const to = gt === -1 ? n : gt + 1;
      out += html.slice(lt, to);
      i = to;
      continue;
    }
    const gt = findOpenTagEnd(html, lt);
    if (gt === -1) {
      out += html.slice(lt);
      break;
    }
    out += fn(html.slice(lt, gt + 1));
    i = gt + 1;
  }
  return out;
}

function stripQuotedAttr(rest, name) {
  return rest.replace(new RegExp(`\\s${name}="[^"]*"`, "g"), "");
}

function rewriteI18nOpenTag(tagHtml, messages) {
  if (
    !tagHtml.includes("data-i18n-attr=") &&
    !tagHtml.includes("data-i18n-aria-label=")
  ) {
    return tagHtml;
  }
  const selfClose = /\/\s*>$/.test(tagHtml);
  const innerEnd = selfClose ? tagHtml.search(/\/\s*>$/) : tagHtml.length - 1;
  if (innerEnd < 1) return tagHtml;
  const inner = tagHtml.slice(1, innerEnd);
  const m = inner.match(/^([a-zA-Z][\w:-]*)([\s\S]*)$/);
  if (!m) return tagHtml;
  const tag = m[1];
  let rest = m[2];
  const assigned = [];

  const specMatch = rest.match(/\sdata-i18n-attr="([^"]+)"/);
  if (specMatch) {
    const spec = specMatch[1];
    const names = [];
    for (const part of spec.split(";")) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      const colon = trimmed.indexOf(":");
      if (colon < 1) continue;
      const attr = trimmed.slice(0, colon).trim();
      const key = trimmed.slice(colon + 1).trim();
      if (!/^[a-zA-Z_][\w:-]*$/.test(attr)) continue;
      const value = getByPath(messages, key);
      if (typeof value !== "string") continue;
      names.push(attr);
      assigned.push(`${attr}="${escapeHtml(value)}"`);
    }
    rest = rest.replace(/\sdata-i18n-attr="[^"]*"/, "");
    for (const name of names) {
      rest = stripQuotedAttr(rest, name);
    }
    if (names.length) assigned.push(`data-i18n-attr="${spec}"`);
  }

  const ariaMatch = rest.match(/\sdata-i18n-aria-label="([^"]+)"/);
  if (ariaMatch) {
    const key = ariaMatch[1];
    const value = getByPath(messages, key);
    if (typeof value === "string") {
      rest = rest.replace(/\sdata-i18n-aria-label="[^"]*"/, "");
      rest = stripQuotedAttr(rest, "aria-label");
      assigned.unshift(
        `aria-label="${escapeHtml(value)}"`,
        `data-i18n-aria-label="${key}"`
      );
    }
  }

  if (!assigned.length) return tagHtml;
  rest = rest.replace(/\s+/g, " ").trim();
  const restBit = rest ? ` ${rest}` : "";
  const close = selfClose ? " /" : "";
  return `<${tag} ${assigned.join(" ")}${restBit}${close}>`;
}

function applyI18n(html, messages) {
  html = html.replace(
    /(<([a-zA-Z0-9-]+)([^>]*?)\sdata-i18n="([^"]+)"([^>]*)>)([\s\S]*?)(<\/\2>)/g,
    (match, open, _tag, _pre, key, _post, _inner, close) => {
      const value = getByPath(messages, key);
      if (value === undefined || value === null) return match;
      if (typeof value !== "string") return match;
      return `${open}${escapeHtml(value)}${close}`;
    }
  );

  html = html.replace(
    /(<([a-zA-Z0-9-]+)([^>]*?)\sdata-i18n-html="([^"]+)"([^>]*)>)([\s\S]*?)(<\/\2>)/g,
    (match, open, _tag, _pre, key, _post, _inner, close) => {
      const value = getByPath(messages, key);
      if (typeof value !== "string") return match;
      return `${open}${value}${close}`;
    }
  );

  html = mapOpenTags(html, (tagHtml) => rewriteI18nOpenTag(tagHtml, messages));

  html = html.replace(
    /\sdata-i18n-placeholder="([^"]+)"/g,
    (match, key) => {
      const value = getByPath(messages, key);
      if (typeof value !== "string") return match;
      return ` placeholder="${escapeHtml(value)}" data-i18n-placeholder="${key}"`;
    }
  );
  html = html.replace(
    /\sdata-i18n-label-close="([^"]+)"/g,
    (match, key) => {
      const value = getByPath(messages, key);
      if (typeof value !== "string") return match;
      return ` data-label-close="${escapeHtml(value)}"`;
    }
  );

  return html;
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  ensureDir(dest);
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

function pageById(id) {
  return PAGES.find((p) => p.id === id);
}

function rewriteAssetPaths(html) {
  return html
    .replace(/(href|src)="\.\/(assets|css|js)\//g, '$1="/$2/')
    .replace(/(href|src)="(assets|css|js)\//g, '$1="/$2/');
}

function rewriteInternalLinks(html, locale) {
  // ./index.html or index.html → localized home
  html = html.replace(
    /\b(href)="(?:\.\/)?index\.html"/g,
    (_, attr) => `${attr}="${hrefForPage("/", locale)}"`
  );

  // ./about.html or ./blog/slug.html → clean URLs (preserve ?query and #hash)
  html = html.replace(
    /\b(href)="(?:\.\/)?((?:[a-z0-9-]+\/)*[a-z0-9-]+)\.html(\?[^"#]*)?(#[^"]*)?"/g,
    (match, attr, slugPath, query = "", hash = "") => {
      const outFile = `${slugPath}.html`;
      const page = PAGES.find(
        (p) => p.out === outFile || p.file === outFile || p.path === `/${slugPath}`
      );
      if (!page) return match;
      const localeForPage = pageLocales(page).includes(locale) ? locale : DEFAULT_LOCALE;
      return `${attr}="${hrefForPage(page.path, localeForPage)}${query || ""}${hash || ""}"`;
    }
  );

  return html;
}

function renderTourCard(slug) {
  const rel = routeBySlug(slug);
  const idx = ROUTES.findIndex((r) => r.slug === slug);
  const href = `./tours/${rel.slug}.html`;
  return `      <article class="tour-card">
        <div class="tour-card__media">
          <img src="${rel.cover}" alt="" />
          <div class="tour-card__loc">
            <div class="tour-card__pin"><img src="./assets/images/icons/location.svg" alt="" /></div>
            <div class="tour-card__loc-text"><span data-i18n="tours.cards.${idx}.place"></span><span data-i18n="tours.cards.${idx}.region"></span></div>
          </div>
        </div>
        <div class="tour-card__body">
          <div>
            <h3 class="tour-card__name" data-i18n="tours.cards.${idx}.title"></h3>
            <div class="tour-card__meta"><span data-i18n="tours.cards.${idx}.meta0"></span><span class="motif" aria-hidden="true"></span><span data-i18n="tours.cards.${idx}.meta1"></span><span class="motif" aria-hidden="true"></span><span data-i18n="tours.cards.${idx}.meta2"></span></div>
          </div>
          <p class="tour-card__desc" data-i18n="tours.cards.${idx}.body"></p>
          <div class="tour-card__foot">
            <p class="tour-card__price"><span data-i18n="tours.cards.${idx}.price"></span><span data-i18n="tours.cards.${idx}.unit"></span></p>
            <a class="tour-card__cta" href="${href}"><span data-i18n="tours.viewCta">View route</span> <img src="./assets/images/icons/arrow-right-sm.svg" alt="" /></a>
          </div>
        </div>
      </article>`;
}

function injectBlog(html, page, locale, messages) {
  const options = { journalPublic: JOURNAL_IS_PUBLIC, renderTourCard };
  if (html.includes("<!-- BLOG_HUB -->")) {
    html = html.replace("<!-- BLOG_HUB -->", renderBlogHub(locale, messages, options));
  }
  if (html.includes("<!-- BLOG_POST -->")) {
    html = html.replace("<!-- BLOG_POST -->", renderBlogPost(page, locale, messages, options));
  }
  if (html.includes("<!-- BLOG_AUTHOR -->")) {
    html = html.replace("<!-- BLOG_AUTHOR -->", renderAuthorPage(page, locale, messages));
  }
  if (html.includes("<!-- HOME_JOURNAL -->")) {
    html = html.replace("<!-- HOME_JOURNAL -->", renderHomeJournal(locale, messages));
  }
  if (html.includes("<!-- BLOG_STYLEGUIDE -->")) {
    html = html.replace("<!-- BLOG_STYLEGUIDE -->", renderStyleguide(messages, options));
  }
  return html;
}

function galleryFigure(src) {
  if (!src) return "";
  return `<figure class="tour-article__figure">
        <img src="${src}" alt="" />
      </figure>`;
}

function renderTourMore(slug) {
  const route = routeBySlug(slug);
  const cards = route.related.map((relSlug) => renderTourCard(relSlug));

  return `<section class="tour-more section" data-section="tour.more">
  <div class="container">
    <div class="tour-more__head">
      <h2 class="tour-more__title" data-i18n="tour.more.title">more routes</h2>
      <a class="link link--arrow" href="./tours.html" data-i18n="tour.more.allLink">View all</a>
    </div>
    <div class="adventures__grid">
${cards.join("\n")}
    </div>
  </div>
</section>`;
}

/** Cache of simplified route geometry embedded in tour heroes (avoids runtime GPX fetch). */
const routeGeomCache = new Map();

function parseGpxCoords(xml) {
  const coords = [];
  const re = /<(?:trkpt|rtept)\s+([^>/]+)/g;
  let m;
  while ((m = re.exec(xml))) {
    const attrs = m[1];
    const lat = /lat="([^"]+)"/.exec(attrs);
    const lon = /lon="([^"]+)"/.exec(attrs);
    if (!lat || !lon) continue;
    const la = parseFloat(lat[1]);
    const lo = parseFloat(lon[1]);
    if (Number.isFinite(la) && Number.isFinite(lo)) {
      coords.push([
        Math.round(lo * 1e5) / 1e5,
        Math.round(la * 1e5) / 1e5,
      ]);
    }
  }
  return coords;
}

function haversineM(a, b) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function simplifyCoords(coords, maxPoints = 360) {
  if (coords.length <= maxPoints) return coords;
  const out = [];
  const step = (coords.length - 1) / (maxPoints - 1);
  for (let i = 0; i < maxPoints; i++) {
    out.push(coords[Math.round(i * step)]);
  }
  return out;
}

function sampleStopsAlong(coords, count = 12) {
  if (coords.length <= count) {
    return coords.map((coordinates, i) => ({
      coordinates,
      kind: i === 0 ? "start" : i === coords.length - 1 ? "end" : "stop",
      name: "",
    }));
  }
  const seg = [];
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    const d = haversineM(coords[i - 1], coords[i]);
    seg.push(d);
    total += d;
  }
  const out = [];
  for (let i = 0; i < count; i++) {
    const target = (total * i) / (count - 1 || 1);
    let acc = 0;
    let picked = coords[coords.length - 1];
    for (let j = 0; j < seg.length; j++) {
      if (acc + seg[j] >= target) {
        const t = seg[j] === 0 ? 0 : (target - acc) / seg[j];
        const a = coords[j];
        const b = coords[j + 1];
        picked = [
          Math.round((a[0] + (b[0] - a[0]) * t) * 1e5) / 1e5,
          Math.round((a[1] + (b[1] - a[1]) * t) * 1e5) / 1e5,
        ];
        break;
      }
      acc += seg[j];
    }
    out.push({
      coordinates: picked,
      kind: i === 0 ? "start" : i === count - 1 ? "end" : "stop",
      name: "",
    });
  }
  return out;
}

function getRouteGeometry(route) {
  if (routeGeomCache.has(route.slug)) return routeGeomCache.get(route.slug);
  const empty = { coords: [], stops: [] };
  if (!route.gpx) {
    routeGeomCache.set(route.slug, empty);
    return empty;
  }
  const gpxPath = path.join(ROOT, route.gpx.replace(/^\.\//, ""));
  if (!fs.existsSync(gpxPath)) {
    console.warn(`[build] missing GPX for ${route.slug}: ${gpxPath}`);
    routeGeomCache.set(route.slug, empty);
    return empty;
  }
  const raw = parseGpxCoords(read(gpxPath));
  const coords = simplifyCoords(raw, 360);
  const geom = { coords, stops: sampleStopsAlong(coords, 12) };
  routeGeomCache.set(route.slug, geom);
  return geom;
}

function injectTourContent(html, routeSlug) {
  const route = routeBySlug(routeSlug);
  let hero = read(path.join(ROOT, "sections/tour/hero.html"));
  let body = read(path.join(ROOT, "sections/tour/body.html"));

  const gpxHref = route.gpx ? route.gpx.replace(/^\.\//, "/") : "";
  const geom = getRouteGeometry(route);
  const routeJson =
    geom.coords.length >= 2
      ? JSON.stringify({ coords: geom.coords, stops: geom.stops })
      : "null";

  const replaceTokens = (tpl) =>
    tpl
      .replaceAll("__SLUG__", routeSlug)
      .replaceAll("__DEEP_LINK__", route.deepLink)
      .replaceAll("__COVER__", route.cover.replace(/^\.\//, "/"))
      .replaceAll("__GPX__", gpxHref)
      .replaceAll("__ROUTE_JSON__", routeJson)
      .replaceAll("__GALLERY_0__", galleryFigure(route.gallery[0]))
      .replaceAll("__GALLERY_1__", galleryFigure(route.gallery[1]))
      .replaceAll("__GALLERY_2__", galleryFigure(route.gallery[2]));

  hero = replaceTokens(hero);
  body = replaceTokens(body);
  const more = renderTourMore(routeSlug);

  if (
    !html.includes("<!-- TOUR_HERO -->") ||
    !html.includes("<!-- TOUR_BODY -->") ||
    !html.includes("<!-- TOUR_MORE -->")
  ) {
    throw new Error("tour.html must contain TOUR_HERO, TOUR_BODY, and TOUR_MORE placeholders");
  }

  return html
    .replace("<!-- TOUR_HERO -->", hero)
    .replace("<!-- TOUR_BODY -->", body)
    .replace("<!-- TOUR_MORE -->", more);
}

function pageLangHrefs(page) {
  if (page.langSwitch) {
    return {
      en: page.langSwitch.en,
      sl: page.langSwitch.sl,
    };
  }
  if (page.hreflang === false) {
    const locales = pageLocales(page);
    return {
      en: locales.includes("en") ? hrefForPage(page.path, "en") : hrefForPage("/blog", "en"),
      sl: locales.includes("sl") ? hrefForPage(page.path, "sl") : hrefForPage("/blog", "sl"),
    };
  }
  return {
    en: hrefForPage(page.path, "en"),
    sl: pageLocales(page).includes("sl")
      ? hrefForPage(page.path, "sl")
      : hrefForPage("/", "sl"),
  };
}

function injectLangSwitcher(html, page, locale) {
  const { en: enHref, sl: slHref } = pageLangHrefs(page);

  const switcher = `
      <div class="lang-switch" role="group" aria-label="Language">
        <a class="lang-switch__btn${locale === "en" ? " is-active" : ""}" href="${enHref}" hreflang="en" lang="en" data-lang="en"${locale === "en" ? ' aria-current="true"' : ""}>EN</a>
        <a class="lang-switch__btn${locale === "sl" ? " is-active" : ""}" href="${slHref}" hreflang="sl" lang="sl" data-lang="sl"${locale === "sl" ? ' aria-current="true"' : ""}>SL</a>
      </div>`;

  if (html.includes("<!-- lang-switch -->")) {
    return html.replaceAll("<!-- lang-switch -->", switcher);
  }
  // Insert before first theme toggle if marker missing
  return html.replace(
    /(<div class="theme-toggle")/,
    `${switcher}\n      $1`
  );
}

function plainPlace(place) {
  return String(place || "")
    .replace(/[→·]/g, ",")
    .replace(/\s*,\s*/g, ", ")
    .replace(/\s{2,}/g, " ")
    .replace(/,\s*$/g, "")
    .trim();
}

function tourCoverAlt(locale, title, place) {
  const name = String(title || "").trim();
  const where = plainPlace(place);
  if (!name) return "";
  if (locale === "sl") {
    return where ? `${name}, kolesarska pot, ${where}` : `${name}, kolesarska pot`;
  }
  return where ? `${name}, cycling route, ${where}` : `${name}, cycling route`;
}

/** Descriptive alt on tour cover photos (hero fallback and cards), from the card name and place. */
function stampTourCoverAlts(html, locale, messages) {
  const cards = messages?.tours?.cards || [];
  const altBySlug = new Map();
  ROUTES.forEach((route, index) => {
    const card = cards[index];
    if (!card) return;
    const alt = tourCoverAlt(locale, card.title, card.place);
    if (alt) altBySlug.set(route.slug, alt);
  });
  return html.replace(/<img\b[^>]*>/gi, (tag) => {
    const src = /\bsrc="([^"]+)"/.exec(tag);
    if (!src) return tag;
    const slug = src[1].match(/\/tours\/([a-z0-9-]+)\/cover\./);
    if (!slug) return tag;
    const alt = altBySlug.get(slug[1]);
    if (!alt) return tag;
    const current = /\balt="([^"]*)"/.exec(tag);
    if (current && current[1]) return tag;
    const escaped = escapeAttr(alt);
    if (current) return tag.replace(/\balt="[^"]*"/, `alt="${escaped}"`);
    return tag.replace(/<img\b/i, `<img alt="${escaped}"`);
  });
}

function jsonForScript(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function organizationLd() {
  return {
    "@type": "Organization",
    "@id": `${SITE_ORIGIN}/#organization`,
    name: "Zyflow",
    legalName: "HERKO d.o.o.",
    url: SITE_ORIGIN,
    email: "support@zyflow.eu",
    logo: `${SITE_ORIGIN}/assets/design-system/logos/png/zyflow-mark-512-transparent.png`,
    sameAs: [
      "https://www.linkedin.com/company/zy-flow/",
      "https://www.instagram.com/zyflow_app/",
    ],
  };
}

function structuredData(page, locale, messages) {
  const graph = [organizationLd()];
  const blogNodes = structuredNodes(page, locale, messages, absoluteUrl, SITE_ORIGIN);
  if (blogNodes) {
    graph.push(...blogNodes);
    return { "@context": "https://schema.org", "@graph": graph };
  }
  if (!page.routeSlug) {
    return { "@context": "https://schema.org", "@graph": graph };
  }
  const route = routeBySlug(page.routeSlug);
  const index = ROUTES.findIndex((item) => item.slug === page.routeSlug);
  const card = messages?.tours?.cards?.[index] || {};
  const description = getByPath(messages, `meta.pages.${page.id}.description`) || "";
  const canonical = absoluteUrl(page.path, locale);
  const name = card.title || page.routeSlug;
  const homeName = getByPath(messages, "chrome.nav.links.home") || "Home";
  const toursName = getByPath(messages, "chrome.nav.links.tours") || "Routes";
  graph.push({
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: homeName,
        item: absoluteUrl("/", locale),
      },
      {
        "@type": "ListItem",
        position: 2,
        name: toursName,
        item: absoluteUrl("/tours", locale),
      },
      {
        "@type": "ListItem",
        position: 3,
        name,
        item: canonical,
      },
    ],
  });
  const trip = {
    "@type": "TouristTrip",
    name,
    description,
    url: canonical,
    image: absoluteOgImage(SITE_ORIGIN, route.cover),
    provider: { "@id": `${SITE_ORIGIN}/#organization` },
  };
  const touristType = getByPath(messages, `routes.${page.routeSlug}.crumbType`);
  if (touristType) trip.touristType = touristType;
  if (card.place) {
    trip.itinerary = { "@type": "Place", name: card.place };
    if (card.region) {
      trip.itinerary.containedInPlace = { "@type": "Place", name: card.region };
    }
  }
  graph.push(trip);
  return { "@context": "https://schema.org", "@graph": graph };
}

function buildHead(page, locale, messages) {
  const meta = getByPath(messages, `meta.pages.${page.id}`) || {};
  const routeTitle = page.routeSlug
    ? getByPath(messages, `routes.${page.routeSlug}.metaTitle`)
    : "";
  let title =
    (page.seo && page.seo.title) ||
    routeTitle ||
    meta.title ||
    getByPath(messages, "meta.brand") ||
    "Zyflow";
  let description =
    (page.seo && page.seo.description) ||
    meta.description ||
    "Smart navigation for cyclists and e-bike riders.";
  if (page.blogKind === "author") {
    const author = getCatalog().authors.get(page.authorId);
    if (author) {
      title = author.name;
      const template = getByPath(messages, "blog.authorDescription") || "";
      description = template
        ? template.replace("{name}", author.name)
        : description;
    }
  }
  const alwaysNoIndex = !page.indexable;
  const robots = alwaysNoIndex || !SITE_INDEX ? "noindex, nofollow" : "index, follow";
  const canonical = absoluteUrl(page.path, locale);
  const usePostOg = Boolean(page.seo && page.seo.ogImage);
  const useTourOg = Boolean(page.routeSlug && tourHasOwnOg(page.routeSlug));
  const ogImage = absoluteOgImage(
    SITE_ORIGIN,
    usePostOg ? page.seo.ogImage : useTourOg ? tourOgPath(page.routeSlug) : "",
    OG_IMAGE_PATH
  );
  const ogImageWidth = usePostOg || useTourOg ? TOUR_OG_WIDTH : DEFAULT_OG_WIDTH;
  const ogImageHeight = usePostOg || useTourOg ? TOUR_OG_HEIGHT : DEFAULT_OG_HEIGHT;
  const ogImageType = usePostOg || useTourOg ? TOUR_OG_TYPE : DEFAULT_OG_TYPE;
  const ogAlt = ogImageAlt(locale, usePostOg || useTourOg ? title : "");
  const ogType = (page.seo && page.seo.ogType) || "website";
  const articleMeta =
    page.seo && page.seo.published
      ? `<meta property="article:published_time" content="${escapeAttr(page.seo.published)}" />\n<meta property="article:modified_time" content="${escapeAttr(page.seo.modified || page.seo.published)}" />`
      : "";
  const extraHead = page.id === "blog" ? rssHref(locale, JOURNAL_IS_PUBLIC) : "";
  const ogLocale = OG_LOCALES[locale] || "en_US";

  const localesForPage = pageLocales(page);
  let hreflang = "";
  let ogLocaleAlts = "";
  if (page.hreflang !== false) {
    const hrefs = page.langSwitch
      ? {
          en: `${SITE_ORIGIN}${page.langSwitch.en}`,
          sl: `${SITE_ORIGIN}${page.langSwitch.sl}`,
        }
      : Object.fromEntries(
          localesForPage.map((lang) => [lang, absoluteUrl(page.path, lang)])
        );
    const hreflangLangs = page.langSwitch ? LOCALES : localesForPage;
    const defaultHref = hrefs[DEFAULT_LOCALE] || hrefs[hreflangLangs[0]];
    hreflang = hreflangLangs
      .map((lang) => `<link rel="alternate" hreflang="${lang}" href="${hrefs[lang]}" />`)
      .concat([`<link rel="alternate" hreflang="x-default" href="${defaultHref}" />`])
      .join("\n");

    ogLocaleAlts = localesForPage
      .filter((lang) => lang !== locale)
      .map(
        (lang) =>
          `<meta property="og:locale:alternate" content="${OG_LOCALES[lang] || lang}" />`
      )
      .join("\n");
  }

  const preloads = [
    `<link rel="preload" href="/assets/design-system/fonts/DMSans.woff2" as="font" type="font/woff2" crossorigin />`,
    `<link rel="preload" href="/assets/design-system/fonts/Tanker-Regular.woff2" as="font" type="font/woff2" crossorigin />`,
  ];
  if (page.preloadHero) {
    preloads.push(
      `<link rel="preload" href="/assets/images/home/hero.jpg" as="image" fetchpriority="high" />`
    );
  }
  if (page.routeSlug) {
    const tileOrigin = MAPTILER_KEY
      ? "https://api.maptiler.com"
      : "https://tiles.openfreemap.org";
    preloads.push(
      `<link rel="preconnect" href="${tileOrigin}" crossorigin />`,
      `<link rel="dns-prefetch" href="${tileOrigin}" />`,
      `<link rel="preload" href="/assets/vendor/maplibre-gl/maplibre-gl.js" as="script" />`,
      `<link rel="preload" href="/assets/vendor/maplibre-gl/maplibre-gl.css" as="style" />`,
      `<link rel="modulepreload" href="/assets/design-system/map/map-kit.js" />`,
      `<link rel="preload" href="/assets/design-system/map/map-kit.css" as="style" />`
    );
    if (!MAPTILER_KEY) {
      preloads.push(
        `<link rel="preload" href="https://tiles.openfreemap.org/styles/liberty" as="fetch" crossorigin />`
      );
    }
  }

  let head = read(path.join(ROOT, "components/head.html"));
  // Resolve theme-boot include inside head
  head = resolveIncludes(head);

  const themeColor = "#f9f8f4";
  const replacements = {
    title: escapeHtml(title),
    description: escapeAttr(description),
    robots,
    canonical: escapeAttr(canonical),
    hreflang,
    ogImage: escapeAttr(ogImage),
    ogImageWidth: String(ogImageWidth),
    ogImageHeight: String(ogImageHeight),
    ogImageType: escapeAttr(ogImageType),
    ogImageAlt: escapeAttr(ogAlt),
    ogType: escapeAttr(ogType),
    ogLocale,
    ogLocaleAlts,
    articleMeta,
    extraHead,
    themeColor,
    preloads: preloads.join("\n"),
  };

  return head.replace(/\{\{(\w+)\}\}/g, (_, key) =>
    replacements[key] != null ? replacements[key] : ""
  );
}

function injectDocumentHead(html, page, locale, messages) {
  const headInner = `${buildHead(page, locale, messages)}
<script type="application/ld+json">${jsonForScript(structuredData(page, locale, messages))}</script>`;
  html = html.replace(/<html([^>]*)lang="[^"]*"([^>]*)>/i, `<html$1lang="${locale}"$2>`);
  html = html.replace(/<html(?![^>]*lang=)/i, `<html lang="${locale}"`);

  if (/<!--\s*include:components\/head\.html\s*-->/.test(html)) {
    // Already resolved by resolveIncludes — look for head markers
  }

  // Replace entire <head>...</head> content when page uses head include stub,
  // or replace placeholder block.
  if (html.includes("<!-- rebuild-head -->")) {
    return html.replace("<!-- rebuild-head -->", headInner);
  }

  return html.replace(/<head[^>]*>[\s\S]*?<\/head>/i, `<head>\n${headInner}\n  </head>`);
}

function pageAlternateHrefs(page) {
  if (page.langSwitch) {
    return {
      en: `${SITE_ORIGIN}${page.langSwitch.en}`,
      sl: `${SITE_ORIGIN}${page.langSwitch.sl}`,
    };
  }
  return Object.fromEntries(
    pageLocales(page).map((lang) => [lang, absoluteUrl(page.path, lang)])
  );
}

const REPO_ROOT = path.join(ROOT, "..");
const gitDateCache = new Map();

/**
 * True when this checkout cannot see history behind HEAD.
 * `git log` still succeeds on a shallow clone and returns the boundary
 * commit's date, which is not the content date. A failed git command is
 * treated the same way so we do not invent a date.
 */
function repositoryIsShallow(cwd = REPO_ROOT) {
  try {
    const out = execFileSync("git", ["rev-parse", "--is-shallow-repository"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 8000,
    }).trim();
    return out !== "false";
  } catch {
    return true;
  }
}

/**
 * Sitemap lastmod. Empty on a shallow clone (omit the element): the
 * boundary commit date is wrong, and a single build date is not a content
 * date either. A full clone uses the latest source commit, or the build
 * date when git has no matching history.
 */
function resolveSitemapLastmod({ shallow, gitDate, buildDate }) {
  if (shallow) return "";
  return gitDate || buildDate || "";
}

/** Last commit date of the page's source files. Empty when git has no matching history. */
function gitContentDate(relPaths) {
  const key = relPaths.join("\0");
  if (gitDateCache.has(key)) return gitDateCache.get(key);
  let date = "";
  try {
    const out = execFileSync(
      "git",
      ["log", "-1", "--format=%cs", "--", ...relPaths],
      {
        cwd: REPO_ROOT,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 8000,
      }
    ).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(out)) date = out;
  } catch {
    date = "";
  }
  gitDateCache.set(key, date);
  return date;
}

function pageContentPaths(page) {
  const locales = ["rebuild/locales/en.json", "rebuild/locales/sl.json"];
  if (page.routeSlug) {
    return [
      `content/featured-routes/featured/${page.routeSlug}`,
      "rebuild/scripts/routes.js",
      ...locales,
    ];
  }
  const rels = [`rebuild/pages/${page.file}`, ...locales];
  if (page.blogKind === "post" && page.translationKey) {
    return [`content/blog/${page.translationKey}`, ...locales];
  }
  if (page.legalDoc) {
    rels.push(
      `rebuild/legal-src/${page.legalDoc}.en.md`,
      `rebuild/legal-src/${page.legalDoc}.sl.md`
    );
  } else if (page.id === "legal") {
    rels.push("rebuild/legal-src");
  }
  const section = {
    home: "home",
    about: "about",
    tours: "tours",
    tour: "tour",
    business: "business",
    contact: "contact",
    press: "press",
    blog: "journal",
  }[page.id];
  if (section) rels.push(`rebuild/sections/${section}`);
  else if (String(page.id).startsWith("legal")) rels.push("rebuild/sections/legal");
  return rels;
}

function writeSeoFiles() {
  const indexable = PAGES.filter((p) => p.indexable);
  const today = new Date().toISOString().slice(0, 10);
  const shallow = repositoryIsShallow();

  const urls = [];
  for (const page of indexable) {
    for (const locale of pageLocales(page)) {
      const blogLastmod = sitemapDate(page, locale);
      const lastmod =
        blogLastmod !== null
          ? blogLastmod
          : resolveSitemapLastmod({
              shallow,
              gitDate: shallow ? "" : gitContentDate(pageContentPaths(page)),
              buildDate: today,
            });
      const lastmodTag = lastmod ? `    <lastmod>${lastmod}</lastmod>\n` : "";
      const loc = absoluteUrl(page.path, locale);
      let alternates = "";
      if (page.hreflang !== false) {
        const hrefs = pageAlternateHrefs(page);
        const langs = Object.keys(hrefs);
        const defaultHref = hrefs[DEFAULT_LOCALE] || hrefs[langs[0]];
        alternates = langs
          .map(
            (lang) =>
              `    <xhtml:link rel="alternate" hreflang="${lang}" href="${hrefs[lang]}" />`
          )
          .concat([
            `    <xhtml:link rel="alternate" hreflang="x-default" href="${defaultHref}" />`,
          ])
          .join("\n");
      }
      urls.push(`  <url>
    <loc>${loc}</loc>
${lastmodTag}${alternates}
  </url>`);
    }
  }

  for (const locale of LOCALES) {
    const feed = renderFeed(locale, SITE_ORIGIN, (post) =>
      hrefForPage(`/blog/${post.slug}`, post.lang)
    );
    const feedDir = locale === DEFAULT_LOCALE ? path.join(DIST, "blog") : path.join(DIST, locale, "blog");
    ensureDir(feedDir);
    fs.writeFileSync(path.join(feedDir, "rss.xml"), feed, "utf8");
  }

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.join("\n")}
</urlset>
`;

  const disallow = ["Disallow: /styleguide", "Disallow: /sl/styleguide"];
  if (!JOURNAL_IS_PUBLIC) {
    disallow.push("Disallow: /blog", "Disallow: /sl/blog");
  }

  const robots = `User-agent: *
Allow: /
${disallow.join("\n")}

Sitemap: ${SITE_ORIGIN}/sitemap.xml
`;

  fs.writeFileSync(path.join(DIST, "sitemap.xml"), sitemap, "utf8");
  fs.writeFileSync(path.join(DIST, "robots.txt"), robots, "utf8");
  console.log("built sitemap.xml");
  console.log("built robots.txt");
}

function injectAnalyticsBoot(html) {
  const noscript = resolveIncludes(
    "<!-- include:components/gtm-noscript.html -->"
  );
  const boot = resolveIncludes(
    "<!-- include:components/analytics-boot.html -->"
  );

  if (!html.includes("googletagmanager.com/ns.html")) {
    html = html.replace(/<body([^>]*)>/i, `<body$1>\n${noscript}`);
  }
  if (!html.includes("cookieconsent-config.js")) {
    html = html.replace(/<\/body>/i, `${boot}\n  </body>`);
  }
  return html;
}

function injectTurnstileSiteKey() {
  const key = (process.env.TURNSTILE_SITE_KEY || "").trim();
  if (!key) return;
  if (!/^[A-Za-z0-9_-]{10,200}$/.test(key)) {
    console.warn("TURNSTILE_SITE_KEY ignored — unexpected format");
    return;
  }
  const file = path.join(DIST, "js", "analytics-config.js");
  if (!fs.existsSync(file)) return;
  const src = read(file);
  const next = src.replace(
    /turnstileSiteKey:\s*""/,
    `turnstileSiteKey: ${JSON.stringify(key)}`
  );
  if (next === src) {
    console.warn("TURNSTILE_SITE_KEY set but analytics-config.js was not updated");
    return;
  }
  fs.writeFileSync(file, next, "utf8");
  console.log("injected TURNSTILE_SITE_KEY into analytics-config.js");
}

function injectMapTilerKey() {
  const file = path.join(DIST, "js", "tour-map.js");
  if (!fs.existsSync(file)) return;
  if (!MAPTILER_KEY) {
    console.warn(
      "MAPTILER_KEY not set — tour maps use the OpenFreeMap fallback base map"
    );
    return;
  }
  const src = read(file);
  const next = src.replace(
    /const MAPTILER_KEY = "";/,
    `const MAPTILER_KEY = ${JSON.stringify(MAPTILER_KEY)};`
  );
  if (next === src) {
    console.warn("MAPTILER_KEY set but tour-map.js was not updated");
    return;
  }
  fs.writeFileSync(file, next, "utf8");
  console.log("injected MAPTILER_KEY into js/tour-map.js");
}

function copyCookieConsentAssets() {
  const pkgDist = path.join(
    ROOT,
    "..",
    "node_modules",
    "vanilla-cookieconsent",
    "dist"
  );
  const cssSrc = path.join(pkgDist, "cookieconsent.css");
  const esmSrc = path.join(pkgDist, "cookieconsent.esm.js");
  if (!fs.existsSync(cssSrc) || !fs.existsSync(esmSrc)) {
    throw new Error(
      "vanilla-cookieconsent not found — run npm install in the repo root"
    );
  }
  fs.copyFileSync(cssSrc, path.join(DIST, "css", "cookieconsent.css"));
  fs.copyFileSync(esmSrc, path.join(DIST, "js", "cookieconsent.esm.js"));
}

function injectLegalDocument(html, page, locale) {
  if (!page.legalDoc) return html;
  const sourcePath = path.join(ROOT, "legal-src", `${page.legalDoc}.${locale}.md`);
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Missing legal source: legal-src/${page.legalDoc}.${locale}.md`);
  }
  const rendered = renderLegalMarkdown(read(sourcePath), {
    locale,
    dropUnpublishedDeletion: Boolean(page.dropUnpublishedDeletion),
  });
  const title = rendered.meta.title || "";
  const lede = rendered.meta.lede || "";
  const date = rendered.meta.date || "";

  html = html.replace(/\sdata-legal=""/g, ` data-legal="${page.legalKey || page.legalDoc}"`);
  html = html.replace(
    /<span data-legal-date><\/span>/,
    date ? `<span>${escapeHtml(date)}</span>` : ""
  );
  html = html.replace(
    /<h1 class="legal-doc__title" data-legal-title><\/h1>/,
    title ? `<h1 class="legal-doc__title">${escapeHtml(title)}</h1>` : ""
  );
  html = html.replace(
    /<p class="legal-doc__lede" data-legal-lede hidden><\/p>/,
    lede ? `<p class="legal-doc__lede">${escapeHtml(lede)}</p>` : ""
  );
  html = html.replace("<!-- LEGAL_TOC -->", rendered.toc);
  html = html.replace("<!-- LEGAL_BODY -->", rendered.html);
  return html;
}

function injectAppStoreUrl(html, locale) {
  return html.replaceAll("{{appStoreUrl}}", appStoreUrlForLocale(locale));
}

function injectRedirectTarget(html, page, locale) {
  if (!page.redirectTo) return html;
  const dest = page.redirectTo.startsWith("/")
    ? hrefForPage(page.redirectTo, locale)
    : page.redirectTo;
  return html.replaceAll("{{redirectTo}}", dest);
}

function buildPage(page, locale, messages) {
  const sourcePath = path.join(PAGES_DIR, page.file);
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Missing page file: ${page.file}`);
  }
  const pageRel = path.relative(ROOT, sourcePath);
  let html = read(sourcePath);
  applyToggleBlocks(html, "journal", JOURNAL_IS_PUBLIC, pageRel);
  if (page.routeSlug) {
    html = injectTourContent(html, page.routeSlug);
  }
  html = resolveIncludes(html);
  html = applyPublicationFlags(html, pageRel);
  html = injectBlog(html, page, locale, messages);
  html = injectLegalDocument(html, page, locale);
  html = injectRedirectTarget(html, page, locale);
  html = applyI18n(html, messages);
  html = stampTourCoverAlts(html, locale, messages);
  html = rewriteAssetPaths(html);
  html = rewriteInternalLinks(html, locale);
  html = injectLangSwitcher(html, page, locale);
  html = injectDocumentHead(html, page, locale, messages);
  html = injectAnalyticsBoot(html);
  html = injectAppStoreUrl(html, locale);

  // Ensure body knows locale for CSS/JS if needed
  if (!/\sdata-locale=/.test(html)) {
    html = html.replace(/<body([^>]*)>/i, `<body$1 data-locale="${locale}">`);
  } else {
    html = html.replace(/\sdata-locale="[^"]*"/, ` data-locale="${locale}"`);
  }

  const outDir =
    locale === DEFAULT_LOCALE || page.localePrefix === false
      ? DIST
      : path.join(DIST, locale);
  ensureDir(outDir);
  const outFile = path.join(outDir, page.out);
  ensureDir(path.dirname(outFile));
  fs.writeFileSync(outFile, html, "utf8");
  const label = path.relative(DIST, outFile);
  console.log(`built ${label}`);
}

function assertIndexablePages() {
  const hrefRe = /\shref="([^"]*)"/g;
  const problems = [];
  const commuteLive = publishedCardCategories().has("commute");

  function hrefProblems(rel, html) {
    const visible = html.replace(/<!--[\s\S]*?-->/g, "");
    const found = [];
    hrefRe.lastIndex = 0;
    let match;
    while ((match = hrefRe.exec(visible))) {
      const href = match[1];
      const pathOnly = href.split(/[?#]/)[0];
      if (
        !JOURNAL_IS_PUBLIC &&
        (/(^|\/)blog$/.test(pathOnly) || /(^|\/)blog\//.test(pathOnly))
      ) {
        found.push(`${rel} links to hidden journal ${href}`);
      }
      if (/(^|\/)tour$/.test(pathOnly)) {
        found.push(`${rel} links to legacy /tour ${href}`);
      }
      if (!commuteLive && /(?:^|[?&])type=commute(?:&|$)/.test(href)) {
        found.push(`${rel} links to empty commute filter ${href}`);
      }
    }
    return found;
  }

  for (const page of PAGES) {
    if (!page.indexable) continue;
    for (const locale of pageLocales(page)) {
      const outDir =
        locale === DEFAULT_LOCALE || page.localePrefix === false
          ? DIST
          : path.join(DIST, locale);
      const file = path.join(outDir, page.out);
      problems.push(...hrefProblems(path.relative(DIST, file), read(file)));
    }
  }

  const robots = read(path.join(DIST, "robots.txt"));
  const sitemap = read(path.join(DIST, "sitemap.xml"));
  if (!JOURNAL_IS_PUBLIC) {
    if (!robots.includes("Disallow: /blog")) {
      problems.push("robots.txt does not disallow /blog while journal is hidden");
    }
    if (sitemap.includes("/blog")) {
      problems.push("sitemap.xml lists /blog while journal is hidden");
    }
  } else {
    const home = read(path.join(DIST, "index.html"));
    if (!home.includes('href="/blog"')) {
      problems.push("index.html is missing /blog links while journal is public");
    }
    if (!home.includes('data-i18n="home.features.items.2.link"')) {
      problems.push("home feature card did not restore the Read Journal link");
    }
    if (!sitemap.includes("/blog")) {
      problems.push("sitemap.xml is missing /blog while journal is public");
    }
    if (/Disallow:\s*\/blog\b/.test(robots)) {
      problems.push("robots.txt still disallows /blog while journal is public");
    }
  }
  if (commuteLive) {
    const tours = read(path.join(DIST, "tours.html"));
    if (!/class="tour-card"[^>]*data-category="commute"/.test(tours) &&
        !/data-category="commute"[^>]*class="tour-card"/.test(tours)) {
      problems.push("commute is published but tours.html has no commute card");
    }
  }

  if (problems.length) {
    throw new Error(
      `Public pages still point at hidden or empty targets:\n${problems.join("\n")}`
    );
  }

  // Journal stays buildable so flipping JOURNAL_PUBLIC does not require new templates.
  const blog = path.join(DIST, "blog.html");
  if (!fs.existsSync(blog)) {
    throw new Error("Journal page was not built (expected dist/blog.html)");
  }
}

function copyBlogImages() {
  for (const source of imageSources()) {
    if (!fs.existsSync(source.dir)) continue;
    copyDir(source.dir, path.join(DIST, "assets/images/blog", source.key));
  }
}

async function writeBlogOgImages() {
  const jobs = ogSources();
  if (!jobs.length) return;
  const sharp = require("sharp");
  for (const source of jobs) {
    if (!source.file || !fs.existsSync(source.file)) {
      throw new Error(`Missing image for blog OG crop ${source.key}`);
    }
    const dest = path.join(DIST, "assets/images/og/blog", `${source.key}.jpg`);
    ensureDir(path.dirname(dest));
    await sharp(source.file)
      .resize(TOUR_OG_WIDTH, TOUR_OG_HEIGHT, { fit: "cover", position: "centre" })
      .jpeg({ quality: 82 })
      .toFile(dest);
  }
}

async function build() {
  const messagesByLocale = {};
  for (const locale of LOCALES) {
    const localePath = path.join(LOCALES_DIR, `${locale}.json`);
    if (!fs.existsSync(localePath)) {
      console.error(`Locale not found: ${localePath}`);
      process.exit(1);
    }
    messagesByLocale[locale] = JSON.parse(read(localePath));
  }

  assertLocaleParity(messagesByLocale);

  const metaIssues = collectMetaIssues(messagesByLocale, PAGES, pageLocales);
  if (metaIssues.length) {
    for (const line of metaIssues) console.warn(`meta: ${line}`);
    throw new Error(`Meta descriptions failed checks (${metaIssues.length})`);
  }

  ensureDir(DIST);
  rimrafContents(DIST);

  copyDir(path.join(ROOT, "assets"), path.join(DIST, "assets"));
  copyBlogImages();
  copyDir(path.join(ROOT, "css"), path.join(DIST, "css"));
  copyDir(path.join(ROOT, "js"), path.join(DIST, "js"));
  copyCookieConsentAssets();
  injectTurnstileSiteKey();
  injectMapTilerKey();

  for (const locale of LOCALES) {
    const messages = messagesByLocale[locale];
    for (const page of PAGES) {
      if (!pageLocales(page).includes(locale)) continue;
      buildPage(page, locale, messages);
    }
  }

  writeSeoFiles();
  assertIndexablePages();

  // One stylesheet instead of the @import chain (render-blocking).
  bundleCss(DIST);
  await writeBlogOgImages();
  // AVIF/WebP srcsets + simplified contour SVGs. Runs before versioning so
  // the JS/CSS ?v= pass still sees the final HTML.
  await optimizeImages(DIST);

  // Must run last: hashes the final bytes (after key injection) and rewrites
  // every /js, /css and /assets JS/CSS reference to ?v=<hash> so the immutable
  // Cache-Control in vercel.json can never pin a stale file.
  const versions = versionAssets(DIST);
  console.log(`versioned ${versions.size} JS/CSS assets`);
  assertAppStoreLinks(DIST);

  console.log(
    `\nRebuild complete → ${path.relative(process.cwd(), DIST)} (locales=${LOCALES.join(
      ","
    )}, index=${SITE_INDEX ? "on" : "off"})`
  );
}

if (require.main === module) {
  build().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = {
  applyToggleBlocks,
  stripUnpublishedCategories,
  stampCardCategories,
  collectCardCategories,
  publishedCardCategories,
  categoriesBySlug,
  repositoryIsShallow,
  resolveSitemapLastmod,
  pageContentPaths,
};
