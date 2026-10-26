/**
 * Content-hash cache busting for the built site.
 *
 * vercel.json serves /js/*, /css/* and /assets/* with
 * `Cache-Control: public, max-age=31536000, immutable`. That is only safe when
 * every URL changes whenever the file behind it changes, so after the dist is
 * written we rewrite each reference to a JS/CSS file under those prefixes to
 * `<path>?v=<hash>`, where <hash> is a short hash of the file's final bytes.
 *
 * - Runs after build-time injection (MAPTILER_KEY, TURNSTILE_SITE_KEY), so the
 *   hash covers the bytes actually served.
 * - JS/CSS files are processed depth-first: a file's own references are
 *   rewritten before it is hashed, so changing tour.css also changes the
 *   `?v=` of main.css (which @imports it) and therefore the HTML.
 * - Any hand-written `?v=N` on a matched reference is replaced.
 * - Fonts are versioned too (hash of their bytes, file left as is), both in
 *   CSS url() and in HTML preloads: the design-system sync replaces font files
 *   under the same names, so an unversioned URL would stay cached for a year.
 * - Images are left alone (optimize-images.js gives them hashed paths).
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const VERSIONED_PREFIXES = ["js", "css", "assets"];
const VERSIONED_EXT = /\.(?:js|css|woff2?)$/;
/** Files whose own references are rewritten before hashing. */
const REWRITTEN_EXT = /\.(?:js|css)$/;
const HASH_LENGTH = 10;

/** Absolute site paths in quotes: "/js/x.js", '/assets/a/b.css?v=3' */
const ABSOLUTE_REF = /(["'])(\/(?:js|css|assets)\/[^"'?#\s]+\.(?:js|css|woff2?))(?:\?[^"'#\s]*)?(#[^"'\s]*)?\1/g;
/** CSS @import "x.css" (bare string form). */
const CSS_IMPORT_STRING = /(@import\s+)(["'])([^"']+)\2/g;
/** CSS url(...) in any quoting style. */
const CSS_URL = /url\(\s*(["']?)([^"')\s]+)\1\s*\)/g;

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function toSitePath(dist, file) {
  return "/" + path.relative(dist, file).split(path.sep).join("/");
}

function shortHash(content) {
  return crypto.createHash("sha256").update(content).digest("hex").slice(0, HASH_LENGTH);
}

function splitQuery(ref) {
  const m = /^([^?#]*)(\?[^#]*)?(#.*)?$/.exec(ref);
  return { pathname: m[1], hash: m[3] || "" };
}

/**
 * @param {string} dist  Built site root (rebuild/dist).
 * @returns {Map<string,string>} site path → version hash
 */
function versionAssets(dist) {
  const files = VERSIONED_PREFIXES.flatMap((p) => walk(path.join(dist, p))).filter((f) =>
    VERSIONED_EXT.test(f)
  );
  const bySitePath = new Map(files.map((f) => [toSitePath(dist, f), f]));
  const versions = new Map();
  const inProgress = new Set();

  function versionOf(sitePath) {
    if (versions.has(sitePath)) return versions.get(sitePath);
    if (!bySitePath.has(sitePath) || inProgress.has(sitePath)) return null;
    inProgress.add(sitePath);
    const file = bySitePath.get(sitePath);
    if (!REWRITTEN_EXT.test(file)) {
      const v = shortHash(fs.readFileSync(file));
      inProgress.delete(sitePath);
      versions.set(sitePath, v);
      return v;
    }
    const src = fs.readFileSync(file, "utf8");
    const next = rewriteRefs(src, {
      css: file.endsWith(".css"),
      baseSitePath: sitePath,
    });
    if (next !== src) fs.writeFileSync(file, next, "utf8");
    const v = shortHash(next);
    inProgress.delete(sitePath);
    versions.set(sitePath, v);
    return v;
  }

  function versioned(sitePath, fragment = "") {
    const v = versionOf(sitePath);
    return v ? `${sitePath}?v=${v}${fragment}` : null;
  }

  function rewriteRefs(text, { css = false, baseSitePath = null } = {}) {
    let out = text.replace(ABSOLUTE_REF, (whole, q, sitePath, fragment = "") => {
      const url = versioned(sitePath, fragment);
      return url ? `${q}${url}${q}` : whole;
    });
    if (css && baseSitePath) {
      const resolveRelative = (ref) => {
        if (/^(?:[a-z]+:|\/\/|#|data:)/i.test(ref)) return null;
        const { pathname, hash } = splitQuery(ref);
        if (!VERSIONED_EXT.test(pathname)) return null;
        const abs = pathname.startsWith("/")
          ? pathname
          : path.posix.join(path.posix.dirname(baseSitePath), pathname);
        if (!bySitePath.has(abs) || !versionOf(abs)) return null;
        return `${pathname}?v=${versionOf(abs)}${hash}`;
      };
      out = out.replace(CSS_URL, (whole, q, ref) => {
        const next = resolveRelative(ref);
        return next ? `url(${q}${next}${q})` : whole;
      });
      out = out.replace(CSS_IMPORT_STRING, (whole, pre, q, ref) => {
        const next = resolveRelative(ref);
        return next ? `${pre}${q}${next}${q}` : whole;
      });
    }
    return out;
  }

  for (const sitePath of bySitePath.keys()) versionOf(sitePath);

  const htmlFiles = walk(dist).filter((f) => f.endsWith(".html"));
  for (const file of htmlFiles) {
    const src = fs.readFileSync(file, "utf8");
    const next = rewriteRefs(src);
    if (next !== src) fs.writeFileSync(file, next, "utf8");
  }

  return versions;
}

module.exports = { versionAssets, ABSOLUTE_REF };
