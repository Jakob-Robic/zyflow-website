/**
 * Inline the @import chain of dist/css/main.css into one stylesheet.
 *
 * The source file imports the design system and every page stylesheet.
 * Browsers treat that chain as render-blocking and discover each file only
 * after the previous one arrives, which is the bulk of the home page's
 * render-blocking time. Inlining keeps the same rules and order; url()
 * paths are rewritten so they stay correct from /css/main.css.
 *
 * version-assets.js still hashes the bundled file, so the ?v= cache buster
 * changes whenever any inlined stylesheet changes.
 */

const fs = require("fs");
const path = require("path");

function importRe() {
  return /@import\s+(?:url\(\s*(['"]?)([^'")]+)\1\s*\)|(['"])([^'"]+)\3)\s*[^;]*;/g;
}
function urlRe() {
  return /url\(\s*(['"]?)([^'")]+)\1\s*\)/g;
}

function stripQueryAndHash(ref) {
  const hashAt = ref.indexOf("#");
  const beforeHash = hashAt === -1 ? ref : ref.slice(0, hashAt);
  const queryAt = beforeHash.indexOf("?");
  return {
    pathname: queryAt === -1 ? beforeHash : beforeHash.slice(0, queryAt),
    suffix: ref.slice((queryAt === -1 ? beforeHash : beforeHash.slice(0, queryAt)).length),
  };
}

function rebaseUrls(css, fromFile, toFile) {
  const fromDir = path.dirname(fromFile);
  const toDir = path.dirname(toFile);
  return css.replace(urlRe(), (whole, quote, ref) => {
    const trimmed = ref.trim();
    if (/^(?:data:|https?:|\/\/|#)/i.test(trimmed)) return whole;
    const { pathname, suffix } = stripQueryAndHash(trimmed);
    if (!pathname || pathname.startsWith("/")) return whole;
    const abs = path.resolve(fromDir, pathname);
    let rel = path.relative(toDir, abs).split(path.sep).join("/");
    if (!rel.startsWith(".")) rel = `./${rel}`;
    return `url(${quote}${rel}${suffix}${quote})`;
  });
}

function inlineFile(file, entry, seen) {
  const abs = path.resolve(file);
  if (seen.has(abs)) return "\n";
  seen.add(abs);
  if (!fs.existsSync(abs)) {
    throw new Error(`CSS import not found: ${abs}`);
  }
  const css = fs.readFileSync(abs, "utf8");
  const re = importRe();
  let out = "";
  let last = 0;
  let match;
  while ((match = re.exec(css))) {
    out += rebaseUrls(css.slice(last, match.index), abs, entry);
    const raw = (match[2] || match[4] || "").trim();
    if (/^(?:https?:|\/\/)/i.test(raw)) {
      out += match[0];
    } else {
      const { pathname } = stripQueryAndHash(raw);
      const resolved = path.resolve(path.dirname(abs), pathname);
      out += inlineFile(resolved, entry, seen);
    }
    last = match.index + match[0].length;
  }
  out += rebaseUrls(css.slice(last), abs, entry);
  return `${out}\n`;
}

function bundleCss(dist) {
  const entry = path.join(dist, "css", "main.css");
  if (!fs.existsSync(entry)) return null;
  const bundled = inlineFile(entry, entry, new Set());
  const leftover = bundled.match(/(^|[;{}])\s*@import\b[^\n]*/m);
  if (leftover) {
    throw new Error(`bundleCss left an @import in main.css: ${leftover[0].slice(0, 180)}`);
  }
  fs.writeFileSync(entry, bundled, "utf8");
  return entry;
}

module.exports = { bundleCss, rebaseUrls };
