/**
 * Canonical App Store listing.
 *
 * Zyflow is live in eight storefronts (SI, DE, AT, IT, HR, CH, HU, CZ).
 * A country-less apps.apple.com URL falls back to the US storefront, where
 * the app is not listed, so desktop browsers get a 404. Every rebuild
 * template uses {{appStoreUrl}}. English pages get this URL; Slovenian
 * pages get the same listing with ?l=sl so the store UI is in Slovenian.
 * Google Play has no country segment and stays a literal in the templates.
 */
const fs = require("fs");
const path = require("path");

const APP_STORE_URL = "https://apps.apple.com/si/app/zyflow/id6763228086";

/**
 * vanilla-cookieconsent replaces this at runtime. It is not a rebuild token.
 * Any other {{...}} left in the output is an unsubstituted template.
 */
const VENDOR_TEMPLATE_TOKENS = new Set(["{{revisionMessage}}"]);

const BINARY_EXT = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".avif",
  ".ico",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
  ".eot",
  ".mp4",
  ".webm",
  ".mp3",
  ".wav",
  ".pdf",
  ".zip",
  ".gz",
  ".br",
  ".wasm",
]);

/** http(s) or scheme-less URL on apps.apple.com / itunes.apple.com with a path. */
const APPLE_URL_RE = /(?:https?:\/\/)?(?:apps|itunes)\.apple\.com\/[^\s"'<>\\`)]+/gi;
const TEMPLATE_TOKEN_RE = /\{\{[^}]*\}\}/g;

function appStoreUrlForLocale(locale) {
  if (locale === "sl") return `${APP_STORE_URL}?l=sl`;
  return APP_STORE_URL;
}

function appStoreUrlMismatch(raw) {
  if (!/^https?:\/\//i.test(raw)) return "not an absolute http(s) URL";
  let parsed;
  try {
    parsed = new URL(raw);
  } catch (_e) {
    return "not an absolute http(s) URL";
  }
  if (parsed.protocol !== "https:") return `scheme is ${parsed.protocol}`;
  if (parsed.username || parsed.password) return "unexpected credentials";
  if (parsed.hash) return "unexpected hash";
  const expected = new URL(APP_STORE_URL);
  if (parsed.hostname !== expected.hostname) return `host is ${parsed.hostname}`;
  if (parsed.pathname !== expected.pathname) return `path is ${parsed.pathname}`;
  return null;
}

function collectTextProblems(rel, text) {
  const problems = [];
  const allowVendorToken = path.basename(rel).startsWith("cookieconsent");
  if (text.includes("__APP_STORE_URL__")) {
    problems.push(`${rel}: leftover placeholder __APP_STORE_URL__`);
  }
  for (const token of text.match(TEMPLATE_TOKEN_RE) || []) {
    if (allowVendorToken && VENDOR_TEMPLATE_TOKENS.has(token)) continue;
    problems.push(`${rel}: leftover template token ${token}`);
  }
  for (const raw of text.match(APPLE_URL_RE) || []) {
    const reason = appStoreUrlMismatch(raw);
    if (reason) problems.push(`${rel}: ${raw} (${reason})`);
  }
  return problems;
}

function assertAppStoreLinks(rootDir) {
  const problems = [];

  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (BINARY_EXT.has(path.extname(entry.name).toLowerCase())) continue;
      const rel = path.relative(rootDir, full);
      const text = fs.readFileSync(full, "utf8");
      problems.push(...collectTextProblems(rel, text));
    }
  }

  walk(rootDir);
  if (problems.length) {
    throw new Error(
      `App Store links must use ${APP_STORE_URL} (query string may differ, including ?l=sl)\n${problems
        .slice(0, 20)
        .join("\n")}`
    );
  }
}

module.exports = {
  APP_STORE_URL,
  appStoreUrlForLocale,
  assertAppStoreLinks,
};
