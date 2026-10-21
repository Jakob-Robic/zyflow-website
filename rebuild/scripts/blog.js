/**
 * Journal posts: YAML frontmatter, validation, Markdown ::: blocks, pages.
 * Drafts are checked and then left out of the build. Published posts become pages.
 * Route maps and elevation profiles are a later change; a :::route-map block fails
 * the build so a post cannot ship without it.
 */
const fs = require("fs");
const path = require("path");
const YAML = require("yaml");
const { Marked } = require("marked");
const { routeBySlug } = require("./routes");
const { descriptionIssues, titleIssues, languageIssues } = require("./page-meta");

const REPO = path.join(__dirname, "..", "..");
const ROUTES_ROOT = path.join(REPO, "content/featured-routes/featured");

const STATUSES = new Set(["draft", "published"]);
const TYPES = ["route-guide", "spot-list", "itinerary", "practical", "story"];
const HUB_LEVELS = ["pillar", "region", "area", "guide"];
const HUB_RANK = { pillar: 0, region: 1, area: 2, guide: 3 };
const ACTIVITIES = ["road", "gravel", "mtb", "e-bike", "ev"];
const LICENCES = ["own", "partner-permission", "guest-rider", "cc-by-4.0", "cc-by-sa-4.0", "cc0"];
const SOURCE_KINDS = ["ridden", "own-gpx", "own-photos", "notes", "partner", "municipality", "app-data"];
const RESERVED_SLUGS = new Set(["author", "rss"]);
const KEBAB = /^[a-z0-9-]+$/;
const PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=com.jakob_robic.zyflowmobileapp";

const LICENCE_LABEL = {
  own: "blog.licence.own",
  "partner-permission": "blog.licence.partner",
  "guest-rider": "blog.licence.guest",
  "cc-by-4.0": "blog.licence.ccBy",
  "cc-by-sa-4.0": "blog.licence.ccBySa",
  cc0: "blog.licence.cc0",
};

function blogContentDir() {
  return process.env.BLOG_CONTENT || path.join(REPO, "content/blog");
}

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function xml(value) {
  return esc(value);
}

function textAt(messages, key) {
  const value = String(key)
    .split(".")
    .reduce((obj, part) => (obj == null ? undefined : obj[part]), messages);
  return typeof value === "string" ? value : "";
}

function t(messages, key) {
  const value = textAt(messages, key);
  if (!value) throw new Error(`Missing blog string: ${key}`);
  return value;
}

function fill(messages, key, vars) {
  return t(messages, key).replace(/\{(\w+)\}/g, (_, name) =>
    vars[name] == null ? "" : String(vars[name])
  );
}

function isIsoDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function todayIso(override) {
  if (override) return override;
  return new Date().toISOString().slice(0, 10);
}

function readingMinutes(body) {
  const words = String(body || "").trim();
  const count = words ? words.split(/\s+/).length : 0;
  return Math.max(1, Math.ceil(count / 200));
}

function formatDate(iso, locale) {
  const [year, month, day] = iso.split("-").map(Number);
  if (locale === "sl") return `${day}. ${month}. ${year}`;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${day} ${months[month - 1]} ${year}`;
}

function listOf(taxonomy, group) {
  const value = taxonomy[group];
  return Array.isArray(value) ? value : [];
}

function labelOf(items, id, locale) {
  const found = items.find((item) => item && item.id === id);
  if (!found || !found.label) return id;
  return found.label[locale] || found.label.en || id;
}

function regionOf(taxonomy, id) {
  return listOf(taxonomy, "regions").find((region) => region && region.id === id) || null;
}

function resolveInside(dir, rel) {
  if (typeof rel !== "string" || !rel || rel.includes("..") || path.isAbsolute(rel)) return null;
  const root = path.resolve(dir);
  const abs = path.resolve(dir, rel);
  if (abs !== root && !abs.startsWith(root + path.sep)) return null;
  return abs;
}

function splitFrontmatter(raw) {
  const text = String(raw).replace(/^\uFEFF/, "");
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { error: "missing YAML frontmatter" };
  try {
    const data = YAML.parse(match[1]);
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return { error: "frontmatter must be a YAML object" };
    }
    return { data, body: match[2] };
  } catch (error) {
    return { error: `frontmatter YAML: ${error.message}` };
  }
}

function push(list, message) {
  if (!list.includes(message)) list.push(message);
}

function imageProblems(image, label, { dir, published }) {
  const problems = [];
  const src = image && image.src;
  if (!src) problems.push(`${label}: image src is required`);
  else if (!/^images\/[A-Za-z0-9._-]+$/.test(src)) {
    problems.push(`${label}: src must be a file under images/`);
  } else {
    const abs = resolveInside(dir, src);
    if (!abs || !fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
      problems.push(`${label}: image file does not exist (${src})`);
    }
  }
  if (!image || !String(image.alt || "").trim()) problems.push(`${label}: alt is required`);
  const credit = image ? String(image.credit || "").trim() : "";
  if (!credit) problems.push(`${label}: credit is required`);
  const licence = image && image.licence;
  if (!LICENCES.includes(licence)) {
    problems.push(`${label}: licence must be one of ${LICENCES.join(", ")}`);
  } else if (licence.startsWith("cc-") || licence === "cc0") {
    if (!String(image.sourceUrl || "").trim()) {
      problems.push(`${label}: sourceUrl is required for ${licence}`);
    }
    if (!/via Wikimedia Commons/i.test(credit)) {
      problems.push(`${label}: Wikimedia credit must include "via Wikimedia Commons"`);
    }
  } else if (licence === "partner-permission") {
    if (!String(image.permissionRef || "").trim()) {
      problems.push(`${label}: permissionRef is required for partner-permission`);
    }
    if (!/\(used with permission\)/i.test(credit)) {
      problems.push(`${label}: partner credit must include "(used with permission)"`);
    }
  } else if (licence === "guest-rider" && image.rightsConfirmed !== true) {
    problems.push(`${label}: guest-rider image needs rightsConfirmed: true`);
  }
  return problems;
}

function parseAttrs(input) {
  const attrs = {};
  const re = /([A-Za-z][\w-]*)\s*=\s*"([^"]*)"/g;
  let match;
  while ((match = re.exec(input))) attrs[match[1]] = match[2];
  return attrs;
}

function matchContainer(src) {
  if (!src.startsWith(":::")) return null;
  const newline = src.indexOf("\n");
  if (newline === -1) return null;
  const header = src.slice(3, newline);
  const nameMatch = /^([a-z0-9-]+)(.*)$/.exec(header);
  if (!nameMatch) return null;
  const rest = src.slice(newline + 1);
  const closeAt = rest.search(/\n:::[ \t]*(?:\n|$)/);
  const tight = /^:::[ \t]*(?:\n|$)/.exec(rest);
  let body = "";
  let raw;
  if (tight && (closeAt === -1 || tight.index === 0)) {
    raw = src.slice(0, newline + 1 + tight[0].length);
    body = "";
  } else if (closeAt !== -1) {
    body = rest.slice(0, closeAt);
    const close = /\n:::[ \t]*(?:\n|$)/.exec(rest.slice(closeAt));
    raw = src.slice(0, newline + 1 + closeAt + close[0].length);
  } else return null;
  const name = nameMatch[1];
  const headerRest = nameMatch[2].trim();
  return {
    raw,
    name,
    attrs: name === "tour-cards" ? {} : parseAttrs(headerRest),
    slugs: name === "tour-cards" ? headerRest.split(/\s+/).filter(Boolean) : [],
    body,
  };
}

function unclosedBlocks(markdown) {
  const problems = [];
  let open = null;
  const lines = String(markdown || "").split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const openMatch = /^:::([a-z0-9-]+)\b/.exec(lines[i]);
    if (openMatch) {
      if (open) push(problems, `unclosed :::${open} before line ${i + 1}`);
      open = openMatch[1];
      continue;
    }
    if (/^:::[ \t]*$/.test(lines[i])) {
      if (!open) push(problems, `closing ::: without an opening block at line ${i + 1}`);
      open = null;
    }
  }
  if (open) push(problems, `unclosed :::${open}`);
  return problems;
}

function routeStatus(slug) {
  const file = path.join(ROUTES_ROOT, slug, "meta.txt");
  if (!fs.existsSync(file)) return "";
  const match = /^status:\s*(\S+)/m.exec(fs.readFileSync(file, "utf8"));
  return match ? match[1] : "";
}

function knownRoute(slug, label, problems) {
  try {
    routeBySlug(slug);
    return true;
  } catch (error) {
    push(problems, `${label}: ${error.message}`);
    return false;
  }
}

function walkTokens(tokens, visit, seen = new Set()) {
  for (const token of tokens || []) {
    if (!token || typeof token !== "object" || seen.has(token)) continue;
    seen.add(token);
    visit(token);
    for (const value of Object.values(token)) {
      if (!Array.isArray(value) || !value.length) continue;
      const objects = value.every((item) => item && typeof item === "object" && !Array.isArray(item));
      if (objects) walkTokens(value, visit, seen);
      else {
        for (const item of value) {
          if (Array.isArray(item)) walkTokens(item, visit, seen);
        }
      }
    }
  }
}

const NAMED_ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  colon: ":",
  tab: "\t",
  newline: "\n",
  num: "#",
  semi: ";",
  nbsp: "\u00a0",
  ensp: "\u2002",
  emsp: "\u2003",
  emsp13: "\u2004",
  emsp14: "\u2005",
  numsp: "\u2007",
  puncsp: "\u2008",
  thinsp: "\u2009",
  hairsp: "\u200a",
  zwnj: "\u200c",
  zwj: "\u200d",
  lrm: "\u200e",
  rlm: "\u200f",
};

function decodeEntities(value) {
  return String(value).replace(
    /&(?:#x([0-9a-f]+)|#(\d+)|([a-zA-Z][a-zA-Z0-9]*));?/gi,
    (all, hex, dec, name) => {
      if (hex || dec) {
        const code = Number.parseInt(hex || dec, hex ? 16 : 10);
        if (!Number.isInteger(code) || code < 0 || code > 0x10ffff) return "";
        try {
          return String.fromCodePoint(code);
        } catch {
          return "";
        }
      }
      if (!all.endsWith(";")) return all;
      if (name === "Tab") return "\t";
      if (name === "NewLine") return "\n";
      const ch = NAMED_ENTITIES[name.toLowerCase()];
      return ch == null ? all : ch;
    }
  );
}

function normalizeHref(raw) {
  let value = String(raw ?? "");
  for (let i = 0; i < 5; i++) {
    const next = decodeEntities(value);
    if (next === value) break;
    value = next;
  }
  return value.replace(/[\u0000-\u0020\u007f\u00a0\u1680\u2000-\u200d\u2028\u2029\u202f\u205f\u2060\ufeff\u3000]+/g, "");
}

function hrefProblem(raw) {
  const href = normalizeHref(raw);
  if (!href) return "empty URL is not allowed";
  if (href.startsWith("#")) return null;
  if (href.startsWith("/") && !href.startsWith("//") && !href.startsWith("/\\")) return null;
  if (href.startsWith("./") || href.startsWith("../")) return null;
  const match = /^([a-z][a-z0-9+.-]*):/i.exec(href);
  if (!match) {
    if (/^[a-z0-9._~-][a-z0-9._~/-]*$/i.test(href)) return null;
    return "URL is not allowed";
  }
  const scheme = `${match[1].toLowerCase()}:`;
  if (scheme === "https:" || scheme === "http:" || scheme === "mailto:") return null;
  return `URL scheme "${scheme}" is not allowed`;
}

function renderFacts(post, messages) {
  const facts = post.facts || {};
  const rows = [];
  const add = (key, value) => {
    if (value == null || value === "") return;
    rows.push(
      `<div class="post-facts__item"><dt>${esc(t(messages, `blog.facts.${key}`))}</dt><dd>${esc(value)}</dd></div>`
    );
  };
  if (facts.distanceKm != null && facts.distanceKm !== "") add("distance", `${facts.distanceKm} km`);
  if (facts.climbM != null && facts.climbM !== "") add("climb", `${facts.climbM} m`);
  add("difficulty", facts.difficulty);
  add("season", facts.bestSeason);
  add("eat", facts.eat);
  add("sleep", facts.sleep);
  add("charge", facts.charge);
  if (!rows.length) return "";
  return `<aside class="post-facts"><dl>${rows.join("")}</dl></aside>`;
}

function renderFigure({ src, alt, captionHtml, credit, licence, messages }) {
  const licenceLabel = t(messages, LICENCE_LABEL[licence] || "blog.licence.own");
  const caption = captionHtml ? `<span class="post-figure__caption">${captionHtml}</span>` : "";
  return `<figure class="post-figure">
  <img src="${esc(src)}" alt="${esc(alt)}" />
  <figcaption>${caption}<span class="post-figure__credit">${esc(credit)} · ${esc(licenceLabel)}</span></figcaption>
</figure>`;
}

function renderFaq(faqs) {
  if (!faqs.length) return "";
  const items = faqs
    .map((faq, index) => {
      const open = index === 0;
      return `<div class="faq__item${open ? " is-open" : ""}">
  <button class="faq__q" type="button" aria-expanded="${open ? "true" : "false"}"><span>${esc(faq.q)}</span><span class="motif" aria-hidden="true"></span></button>
  <div class="faq__panel">${faq.aHtml}</div>
</div>`;
    })
    .join("\n");
  return `<section class="faq post-faq"><div class="faq__list">${items}</div></section>`;
}

function renderAppCta(messages) {
  return `<aside class="post-app">
  <p class="post-app__title">${esc(t(messages, "blog.appCta.title"))}</p>
  <div class="app-stage__ctas">
    <a class="btn btn--primary" href="{{appStoreUrl}}">${esc(t(messages, "blog.appCta.ios"))}</a>
    <a class="btn btn--secondary" href="${esc(PLAY_STORE_URL)}">${esc(t(messages, "blog.appCta.android"))}</a>
  </div>
</aside>`;
}

function renderHowWeMade(post, messages) {
  if (!post.howWeMade) return "";
  return `<aside class="post-note"><p class="post-note__label">${esc(t(messages, "blog.howWeMade"))}</p><p>${esc(post.howWeMade)}</p></aside>`;
}

function authorVisible(author, locale) {
  const bioMarked = author.placeholder === true || (author.bio && author.bio.placeholder === true);
  const photoMarked = author.placeholder === true || (author.photo && author.photo.placeholder === true);
  const bio = !bioMarked && author.bio && author.bio[locale] ? author.bio[locale] : "";
  const photo = !photoMarked && author.photo && author.photo.src ? author.photo.src : "";
  return { bio, photo };
}

function renderAuthorBox(author, locale, messages, href) {
  const { bio, photo } = authorVisible(author, locale);
  const role = (author.role && (author.role[locale] || author.role.en)) || "";
  const photoHtml = photo
    ? `<img class="post-author__photo" src="${esc(photo)}" alt="" />`
    : "";
  const name = href
    ? `<a href="${esc(href)}">${esc(author.name)}</a>`
    : esc(author.name);
  const bioHtml = bio ? `<p class="post-author__bio">${esc(bio)}</p>` : "";
  return `<aside class="post-author">${photoHtml}<div><p class="post-author__name">${name}</p><p class="post-author__role">${esc(role)}</p>${bioHtml}</div></aside>`;
}

function publicImage(translationKey, src) {
  return `./assets/images/blog/${translationKey}/${path.basename(src)}`;
}

function parseFaqBody(body, ctx) {
  const faqs = [];
  const chunks = String(body || "").split(/\n(?=### )/);
  for (const chunk of chunks) {
    const text = chunk.trim();
    if (!text) continue;
    if (!text.startsWith("### ")) {
      push(ctx.problems, ":::faq content must be ### questions");
      continue;
    }
    const newline = text.indexOf("\n");
    const question = (newline === -1 ? text.slice(4) : text.slice(4, newline)).trim();
    const answerMd = newline === -1 ? "" : text.slice(newline + 1).trim();
    if (!question || !answerMd) {
      push(ctx.problems, ":::faq question needs an answer");
      continue;
    }
    const answer = parseMarkdown(answerMd, ctx);
    faqs.push({
      q: question,
      aHtml: answer.html,
      aText: answerMd.replace(/[#>*_`[\]]/g, " ").replace(/\s+/g, " ").trim(),
    });
  }
  return faqs;
}

function renderContainer(block, ctx) {
  const { name } = block;
  if (name === "figure") {
    const image = {
      src: block.attrs.src || "",
      alt: block.attrs.alt || "",
      credit: block.attrs.credit || "",
      licence: block.attrs.licence || "",
      sourceUrl: block.attrs.source || "",
      permissionRef: block.attrs["permission-ref"] || "",
      rightsConfirmed: block.attrs["rights-confirmed"] === "true",
    };
    for (const problem of imageProblems(image, ":::figure", ctx)) push(ctx.problems, problem);
    const caption = block.body.trim() ? parseMarkdown(block.body.trim(), ctx).html : "";
    if (!ctx.messages) return "";
    return renderFigure({
      src: publicImage(ctx.translationKey, image.src || "image"),
      alt: image.alt,
      captionHtml: caption,
      credit: image.credit,
      licence: LICENCES.includes(image.licence) ? image.licence : "own",
      messages: ctx.messages,
    });
  }
  if (name === "facts") {
    ctx.factsMoved = true;
    return ctx.messages ? renderFacts(ctx.post, ctx.messages) : "";
  }
  if (name === "faq") {
    const faqs = parseFaqBody(block.body, ctx);
    ctx.faqs.push(...faqs);
    return ctx.messages ? renderFaq(faqs) : "";
  }
  if (name === "tour-cards") {
    if (!block.slugs.length) push(ctx.problems, ":::tour-cards needs at least one route slug");
    const cards = [];
    for (const slug of block.slugs) {
      if (!knownRoute(slug, ":::tour-cards", ctx.problems)) continue;
      if (ctx.renderTourCard) cards.push(ctx.renderTourCard(slug));
    }
    return cards.length ? `<div class="post-tours">${cards.join("\n")}</div>` : "";
  }
  if (name === "app-cta") {
    ctx.appInBody = true;
    return ctx.messages ? renderAppCta(ctx.messages) : "";
  }
  if (name === "route-map") {
    const slug = block.attrs.tour || "";
    if (!slug) {
      push(ctx.problems, ":::route-map needs a tour");
      return "";
    }
    if (!knownRoute(slug, ":::route-map", ctx.problems)) return "";
    if (routeStatus(slug) === "raw") {
      push(ctx.problems, `:::route-map ${slug}: route file status is raw`);
      return "";
    }
    push(ctx.problems, `:::route-map ${slug}: the route map block is not built yet`);
    return "";
  }
  push(ctx.problems, `unknown block :::${name}`);
  return "";
}

function parseMarkdown(markdown, ctx) {
  const marked = new Marked();
  marked.use({
    gfm: true,
    renderer: {
      html({ text }) {
        push(ctx.problems, "raw HTML is not allowed in the post body");
        return esc(text);
      },
      link(token) {
        const problem = hrefProblem(token.href);
        if (problem) {
          push(ctx.problems, problem);
          return esc(token.text || "");
        }
        const title = token.title ? ` title="${esc(token.title)}"` : "";
        const inner = token.tokens ? this.parser.parseInline(token.tokens) : esc(token.text || "");
        return `<a href="${esc(token.href)}"${title}>${inner}</a>`;
      },
      image(token) {
        push(ctx.problems, "bare images are not allowed; use a :::figure block");
        const problem = hrefProblem(token.href || "");
        if (problem) push(ctx.problems, problem);
        return "";
      },
    },
    extensions: [
      {
        name: "zyContainer",
        level: "block",
        start(src) {
          const index = src.indexOf(":::");
          return index >= 0 ? index : undefined;
        },
        tokenizer(src) {
          const block = matchContainer(src);
          if (!block) return undefined;
          return {
            type: "zyContainer",
            raw: block.raw,
            name: block.name,
            attrs: block.attrs,
            slugs: block.slugs,
            body: block.body,
          };
        },
        renderer(token) {
          return renderContainer(token, ctx);
        },
      },
    ],
  });
  const tokens = marked.lexer(String(markdown || ""));
  walkTokens(tokens, (token) => {
    if (token.type === "html") push(ctx.problems, "raw HTML is not allowed in the post body");
    if (token.type === "image") {
      push(ctx.problems, "bare images are not allowed; use a :::figure block");
    }
    if (token.type === "link" || token.type === "image" || token.href) {
      const problem = token.href ? hrefProblem(token.href) : null;
      if (problem) push(ctx.problems, problem);
    }
  });
  return { html: marked.parser(tokens) };
}

function lintBody(post, problems) {
  // The app CTA helper inserts {{appStoreUrl}}. Markdown must not: any {{...}}
  // token, including {{appStoreUrl}}, is rejected so the store-link pass cannot
  // rewrite a post body.
  if (/\{\{/.test(post.body)) {
    push(problems, "template tokens {{...}} are not allowed in the post body");
  }
  const ctx = {
    problems,
    dir: post.dir,
    translationKey: post.translationKey,
    post,
    faqs: [],
    messages: null,
    renderTourCard: null,
  };
  for (const problem of unclosedBlocks(post.body)) push(problems, problem);
  parseMarkdown(post.body, ctx);
}

function loadAuthors(dir, errors) {
  const authors = new Map();
  const folder = path.join(dir, "_authors");
  if (!fs.existsSync(folder)) {
    push(errors, "content/blog/_authors is missing");
    return authors;
  }
  for (const name of fs.readdirSync(folder)) {
    if (!name.endsWith(".yml") && !name.endsWith(".yaml")) continue;
    const id = name.replace(/\.ya?ml$/, "");
    let data;
    try {
      data = YAML.parse(fs.readFileSync(path.join(folder, name), "utf8"));
    } catch (error) {
      push(errors, `_authors/${name}: ${error.message}`);
      continue;
    }
    if (!data || typeof data !== "object") {
      push(errors, `_authors/${name}: must be a YAML object`);
      continue;
    }
    data.id = data.id || id;
    if (data.id !== id) push(errors, `_authors/${name}: id must match the file name`);
    const photoSrc = data.photo && data.photo.src;
    if (photoSrc) {
      if (!/^images\/[A-Za-z0-9._-]+$/.test(photoSrc)) {
        push(errors, `_authors/${name}: photo src must be a file under images/`);
      } else {
        const abs = resolveInside(folder, photoSrc);
        if (!abs || !fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
          push(errors, `_authors/${name}: photo file does not exist (${photoSrc})`);
        }
      }
    }
    authors.set(data.id, data);
  }
  return authors;
}

function loadTaxonomy(dir, errors) {
  const file = path.join(dir, "_taxonomy.yml");
  if (!fs.existsSync(file)) {
    push(errors, "content/blog/_taxonomy.yml is missing");
    return { regions: [], types: [], activities: [], tags: [] };
  }
  let data;
  try {
    data = YAML.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    push(errors, `_taxonomy.yml: ${error.message}`);
    return { regions: [], types: [], activities: [], tags: [] };
  }
  const taxonomy = data && typeof data === "object" ? data : {};
  taxonomy.regions = listOf(taxonomy, "regions");
  taxonomy.types = listOf(taxonomy, "types");
  taxonomy.activities = listOf(taxonomy, "activities");
  taxonomy.tags = listOf(taxonomy, "tags");
  for (const type of TYPES) {
    if (!taxonomy.types.some((item) => item && item.id === type)) {
      push(errors, `_taxonomy.yml: missing type ${type}`);
    }
  }
  for (const activity of ACTIVITIES) {
    if (!taxonomy.activities.some((item) => item && item.id === activity)) {
      push(errors, `_taxonomy.yml: missing activity ${activity}`);
    }
  }
  return taxonomy;
}

function readPosts(dir, errors) {
  const posts = [];
  if (!fs.existsSync(dir)) {
    push(errors, "content/blog is missing");
    return posts;
  }
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith("_")) continue;
    for (const lang of ["en", "sl"]) {
      const file = path.join(dir, entry.name, `${lang}.md`);
      if (!fs.existsSync(file)) continue;
      const raw = fs.readFileSync(file, "utf8");
      const parsed = splitFrontmatter(raw);
      const where = `${entry.name}/${lang}.md`;
      if (parsed.error) {
        push(errors, `${where}: ${parsed.error}`);
        continue;
      }
      posts.push({
        folder: entry.name,
        lang,
        file: where,
        dir: path.join(dir, entry.name),
        raw,
        body: parsed.body,
        data: parsed.data,
      });
    }
  }
  return posts;
}

function normalizePost(entry, errors) {
  const data = entry.data;
  const where = entry.file;
  const fail = (message) => push(errors, `${where}: ${message}`);
  const post = {
    folder: entry.folder,
    lang: entry.lang,
    file: where,
    dir: entry.dir,
    raw: entry.raw,
    body: entry.body,
    status: data.status,
    translationKey: data.translationKey,
    slug: data.slug,
    title: typeof data.title === "string" ? data.title.trim() : "",
    description: typeof data.description === "string" ? data.description.trim() : "",
    datePublished: data.datePublished,
    dateUpdated: data.dateUpdated,
    author: data.author,
    type: data.type,
    hubLevel: data.hubLevel,
    parentHub: data.parentHub,
    region: data.region,
    area: data.area || "",
    activities: data.activities,
    tags: data.tags || [],
    hero: data.hero || {},
    relatedTours: data.relatedTours || [],
    relatedPosts: data.relatedPosts || [],
    facts: data.facts,
    sources: data.sources,
    aiAssisted: data.aiAssisted,
    howWeMade: typeof data.howWeMade === "string" ? data.howWeMade.trim() : "",
    ogImage: data.ogImage || "",
  };
  if (!STATUSES.has(post.status)) fail("status must be draft or published");
  if (typeof post.translationKey !== "string" || !KEBAB.test(post.translationKey)) {
    fail("translationKey must be kebab-case");
  } else if (post.translationKey !== entry.folder) {
    fail("translationKey must equal the folder name");
  }
  if (typeof post.slug !== "string" || !KEBAB.test(post.slug)) fail("slug must match ^[a-z0-9-]+$");
  else if (RESERVED_SLUGS.has(post.slug)) fail(`slug "${post.slug}" is reserved`);
  if (!post.title) fail("title is required");
  else for (const issue of titleIssues(entry.lang, post.title)) fail(`title ${issue}`);
  if (!post.description) fail("description is required");
  else for (const issue of descriptionIssues(entry.lang, post.description)) fail(`description ${issue}`);
  if (!isIsoDate(post.datePublished)) fail("datePublished must be YYYY-MM-DD");
  if (!isIsoDate(post.dateUpdated)) fail("dateUpdated must be YYYY-MM-DD");
  if (isIsoDate(post.datePublished) && isIsoDate(post.dateUpdated) && post.dateUpdated < post.datePublished) {
    fail("dateUpdated is before datePublished");
  }
  if (!TYPES.includes(post.type)) fail(`type must be one of ${TYPES.join(", ")}`);
  if (!HUB_LEVELS.includes(post.hubLevel)) fail(`hubLevel must be one of ${HUB_LEVELS.join(", ")}`);
  if (post.parentHub !== "blog" && (typeof post.parentHub !== "string" || !KEBAB.test(post.parentHub))) {
    fail("parentHub must be a translationKey or blog");
  }
  if (typeof post.author !== "string" || !post.author) fail("author is required");
  if (!Array.isArray(post.activities) || post.activities.length < 1) {
    fail("activities needs at least one value");
  } else {
    for (const activity of post.activities) {
      if (!ACTIVITIES.includes(activity)) fail(`unknown activity ${activity}`);
    }
  }
  if (!Array.isArray(post.tags)) fail("tags must be a list");
  else if (post.tags.length > 5) fail("tags cannot have more than 5 items");
  if (post.aiAssisted !== true && post.aiAssisted !== false) fail("aiAssisted must be true or false");
  if (post.aiAssisted === true && !post.howWeMade) fail("howWeMade is required when aiAssisted is true");
  if (!Array.isArray(post.relatedTours)) fail("relatedTours must be a list");
  if (!Array.isArray(post.relatedPosts)) fail("relatedPosts must be a list");
  post.readingMinutes = readingMinutes(post.body);
  post.heroFile = post.hero && post.hero.src ? resolveInside(post.dir, post.hero.src) : "";
  return post;
}

function validateRelations(posts, authors, taxonomy, errors, warnings, today) {
  const slugs = new Map();
  for (const post of posts) {
    const fail = (message) => push(errors, `${post.file}: ${message}`);
    const published = post.status === "published";
    const key = `${post.lang}:${post.slug}`;
    if (post.slug && slugs.has(key)) fail(`slug is already used by ${slugs.get(key)}`);
    else if (post.slug) slugs.set(key, post.file);
    if (published && isIsoDate(post.datePublished) && post.datePublished > today) {
      fail("datePublished is in the future");
    }
    if (isIsoDate(post.dateUpdated) && post.dateUpdated > today) fail("dateUpdated is in the future");
    const author = authors.get(post.author);
    if (!author) fail(`author ${post.author} does not exist`);
    else if (published) {
      const id = String(author.id || "").toLowerCase();
      const name = String(author.name || "").toLowerCase();
      if (id === "ai" || name === "ai" || /\bbot\b/.test(id) || /\bbot\b/.test(name)) {
        fail("author cannot be AI or a bot");
      }
      const bioMarked = author.placeholder === true || (author.bio && author.bio.placeholder === true);
      const photoMarked = author.placeholder === true || (author.photo && author.photo.placeholder === true);
      if (bioMarked || !(author.bio && author.bio[post.lang])) {
        push(warnings, `author ${author.id} (${post.lang}): bio is a placeholder or missing`);
      }
      if (photoMarked || !(author.photo && author.photo.src)) {
        push(warnings, `author ${author.id}: photo is a placeholder or missing`);
      }
    } else if (author) {
      const bioMarked = author.placeholder === true || (author.bio && author.bio.placeholder === true);
      const photoMarked = author.placeholder === true || (author.photo && author.photo.placeholder === true);
      if (bioMarked || photoMarked || !(author.bio && author.bio[post.lang]) || !(author.photo && author.photo.src)) {
        push(warnings, `author ${author.id}: bio or photo is a placeholder`);
      }
    }
    if (!regionOf(taxonomy, post.region)) fail(`region ${post.region} is not in the taxonomy`);
    if (post.area) {
      const region = regionOf(taxonomy, post.region);
      const areas = region && Array.isArray(region.areas) ? region.areas : [];
      if (!areas.some((area) => area && area.id === post.area)) {
        fail(`area ${post.area} is not in region ${post.region}`);
      }
    }
    for (const tag of post.tags || []) {
      if (!listOf(taxonomy, "tags").some((item) => item && item.id === tag)) {
        fail(`unknown tag ${tag}`);
      }
    }
    if (post.parentHub !== "blog") {
      const parent = posts.find((item) => item.translationKey === post.parentHub && item.lang === post.lang);
      if (!parent) fail(`parentHub ${post.parentHub} does not exist in ${post.lang}`);
      else {
        if (published && parent.status !== "published") {
          fail(`parentHub ${post.parentHub} is not published in ${post.lang}`);
        }
        if (HUB_RANK[parent.hubLevel] >= HUB_RANK[post.hubLevel]) {
          fail("parentHub must sit higher in the chain pillar > region > area > guide");
        }
      }
    }
    const seen = new Set();
    let cursor = post.translationKey;
    while (cursor && cursor !== "blog") {
      if (seen.has(cursor)) {
        fail("parentHub cycle");
        break;
      }
      seen.add(cursor);
      const node = posts.find((item) => item.translationKey === cursor && item.lang === post.lang);
      if (!node) break;
      cursor = node.parentHub;
    }
    for (const slug of post.relatedTours) {
      try {
        routeBySlug(slug);
      } catch (error) {
        fail(error.message);
      }
    }
    for (const key of post.relatedPosts) {
      if (!posts.some((item) => item.translationKey === key && item.lang === post.lang)) {
        fail(`related post ${key} does not exist in ${post.lang}`);
      }
    }
    for (const problem of imageProblems(
      {
        src: post.hero.src,
        alt: post.hero.alt,
        credit: post.hero.credit,
        licence: post.hero.licence,
        sourceUrl: post.hero.sourceUrl,
        permissionRef: post.hero.permissionRef,
        rightsConfirmed: post.hero.rightsConfirmed,
      },
      "hero",
      { dir: post.dir }
    )) {
      fail(problem);
    }
    if (post.ogImage) {
      const abs = resolveInside(post.dir, post.ogImage);
      if (!abs || !fs.existsSync(abs)) fail("ogImage file does not exist");
    }
    if (published) {
      const facts = post.facts;
      if (!facts || typeof facts !== "object" || Array.isArray(facts)) fail("facts is required");
      else if (post.type === "route-guide" || post.type === "itinerary") {
        for (const field of ["distanceKm", "climbM", "difficulty", "bestSeason"]) {
          if (facts[field] == null || facts[field] === "") fail(`facts.${field} is required`);
        }
      } else if (!facts.bestSeason && !facts.charge) {
        fail("facts needs bestSeason or charge");
      }
      if (!Array.isArray(post.sources) || post.sources.length < 1) fail("sources needs at least one entry");
      else {
        for (const source of post.sources) {
          if (!source || !SOURCE_KINDS.includes(source.kind)) {
            fail(`source kind must be one of ${SOURCE_KINDS.join(", ")}`);
          } else if (!String(source.note || "").trim()) fail("source note is required");
        }
      }
    }
    const bodyProblems = [];
    lintBody(post, bodyProblems);
    for (const problem of bodyProblems) fail(problem);
  }

  const keys = new Map();
  for (const post of posts) {
    const pair = keys.get(post.translationKey) || {};
    pair[post.lang] = post;
    keys.set(post.translationKey, pair);
  }
  for (const [key, pair] of keys) {
    if (!pair.en || !pair.sl) continue;
    if (pair.en.slug === pair.sl.slug) {
      push(errors, `${key}: Slovenian slug must differ from the English slug`);
    }
    if (pair.en.raw === pair.sl.raw) push(errors, `${key}: sl.md is identical to en.md`);
    const norm = (body) => body.replace(/\s+/g, " ").trim();
    if (norm(pair.en.body) === norm(pair.sl.body)) {
      push(errors, `${key}: Slovenian body matches the English body`);
    }
    if (pair.en.title === pair.sl.title) push(errors, `${key}: Slovenian title matches the English title`);
    if (pair.en.description === pair.sl.description) {
      push(errors, `${key}: Slovenian description matches the English description`);
    }
    const paragraphs = pair.sl.body
      .split(/\n\s*\n/)
      .map((part) => part.replace(/^#+\s+/gm, "").trim())
      .filter(Boolean)
      .slice(0, 3);
    const issues = languageIssues("sl", paragraphs.join("\n"));
    if (issues.length) push(warnings, `${key}: Slovenian body ${issues.join("; ")}`);
  }
}

function chainOf(post, posts) {
  const chain = [];
  const seen = new Set();
  let parentKey = post.parentHub;
  while (parentKey && parentKey !== "blog" && !seen.has(parentKey)) {
    seen.add(parentKey);
    const parent = posts.find(
      (item) =>
        item.translationKey === parentKey &&
        item.lang === post.lang &&
        item.status === "published"
    );
    if (!parent) break;
    chain.push(parent);
    parentKey = parent.parentHub;
  }
  chain.reverse();
  return chain;
}

function publishedIn(posts, lang) {
  return posts.filter((post) => post.lang === lang && post.status === "published");
}

function relatedFor(post, posts) {
  const same = publishedIn(posts, post.lang).filter((item) => item.translationKey !== post.translationKey);
  if (Array.isArray(post.relatedPosts) && post.relatedPosts.length) {
    return post.relatedPosts
      .map((key) => same.find((item) => item.translationKey === key))
      .filter(Boolean);
  }
  const ranked = same
    .map((item) => {
      let score = 0;
      if (item.parentHub && item.parentHub === post.parentHub) score += 100;
      if (item.region && item.region === post.region) score += 10;
      const shared = (item.activities || []).filter((activity) =>
        (post.activities || []).includes(activity)
      ).length;
      return { item, score };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.item.datePublished !== b.item.datePublished) {
        return a.item.datePublished < b.item.datePublished ? 1 : -1;
      }
      return a.item.translationKey < b.item.translationKey ? -1 : 1;
    });
  return ranked.slice(0, 3).map((entry) => entry.item);
}

function childrenOf(post, posts) {
  return publishedIn(posts, post.lang)
    .filter((item) => item.parentHub === post.translationKey)
    .sort((a, b) => (a.datePublished < b.datePublished ? 1 : -1));
}

function buildPages(posts) {
  const pages = [];
  const published = posts.filter((post) => post.status === "published");
  const byKey = new Map();
  for (const post of published) {
    if (!byKey.has(post.translationKey)) byKey.set(post.translationKey, {});
    byKey.get(post.translationKey)[post.lang] = post;
  }
  for (const post of published) {
    const pair = byKey.get(post.translationKey);
    const paired = Boolean(pair.en && pair.sl);
    const page = {
      id: `blog-post-${post.translationKey}-${post.lang}`,
      file: "blog-post.html",
      out: `blog/${post.slug}.html`,
      path: `/blog/${post.slug}`,
      locales: [post.lang],
      blogKind: "post",
      translationKey: post.translationKey,
      postLang: post.lang,
      dateUpdated: post.dateUpdated,
      seo: {
        title: post.title,
        description: post.description,
        ogImage: `/assets/images/og/blog/${post.translationKey}.jpg`,
        ogType: "article",
        published: post.datePublished,
        modified: post.dateUpdated,
      },
    };
    if (paired) {
      page.langSwitch = {
        en: `/blog/${pair.en.slug}`,
        sl: `/sl/blog/${pair.sl.slug}`,
      };
    } else {
      page.hreflang = false;
    }
    pages.push(page);
  }
  const authorLangs = new Map();
  for (const post of published) {
    if (!authorLangs.has(post.author)) authorLangs.set(post.author, new Set());
    authorLangs.get(post.author).add(post.lang);
  }
  for (const [authorId, langs] of authorLangs) {
    const list = [...langs];
    const page = {
      id: `blog-author-${authorId}`,
      file: "blog-author.html",
      out: `blog/author/${authorId}.html`,
      path: `/blog/author/${authorId}`,
      locales: list.includes("en") && list.includes("sl") ? ["en", "sl"] : list,
      blogKind: "author",
      authorId,
    };
    if (page.locales.length < 2) page.hreflang = false;
    pages.push(page);
  }
  return pages;
}

function loadBlog(dir = blogContentDir(), options = {}) {
  const errors = [];
  const warnings = [];
  const today = todayIso(options.today);
  const authors = loadAuthors(dir, errors);
  const taxonomy = loadTaxonomy(dir, errors);
  const entries = readPosts(dir, errors);
  const posts = entries.map((entry) => normalizePost(entry, errors));
  validateRelations(posts, authors, taxonomy, errors, warnings, today);
  const pages = errors.length ? [] : buildPages(posts);
  return { dir, posts, authors, taxonomy, errors, warnings, pages, today };
}

function validateBlog(dir, options = {}) {
  const catalog = loadBlog(dir, options);
  if (catalog.errors.length) {
    throw new Error(
      `Blog validation failed (${catalog.errors.length}):\n- ${catalog.errors.join("\n- ")}`
    );
  }
  return catalog;
}

const faqStore = new Map();

function rememberFaqs(post, faqs) {
  faqStore.set(`${post.lang}:${post.translationKey}`, faqs || []);
}

function faqsFor(post) {
  return faqStore.get(`${post.lang}:${post.translationKey}`) || [];
}

let catalog = loadBlog();
if (catalog.errors.length) {
  throw new Error(
    `Blog validation failed (${catalog.errors.length}):\n- ${catalog.errors.join("\n- ")}`
  );
}
for (const warning of catalog.warnings) console.warn(`blog: ${warning}`);

function getCatalog() {
  return catalog;
}

function reloadBlog() {
  catalog = loadBlog();
  if (catalog.errors.length) {
    throw new Error(
      `Blog validation failed (${catalog.errors.length}):\n- ${catalog.errors.join("\n- ")}`
    );
  }
  return catalog;
}

function postFor(page, locale) {
  const lang = page.postLang || locale;
  return catalog.posts.find(
    (post) => post.translationKey === page.translationKey && post.lang === lang && post.status === "published"
  );
}

function postsFor(locale, authorId) {
  return publishedIn(catalog.posts, locale)
    .filter((post) => !authorId || post.author === authorId)
    .sort((a, b) => (a.datePublished < b.datePublished ? 1 : a.datePublished > b.datePublished ? -1 : 0));
}

function storyCard(post, messages) {
  const typeLabel = labelOf(catalog.taxonomy.types, post.type, post.lang);
  const regionLabel = labelOf(catalog.taxonomy.regions, post.region, post.lang);
  const activities = (post.activities || []).join(" ");
  return `<article class="blog-story" data-blog-card data-region="${esc(post.region)}" data-type="${esc(post.type)}" data-activities="${esc(activities)}">
  <a class="blog-story__media" href="./blog/${esc(post.slug)}.html"><img src="${esc(publicImage(post.translationKey, post.hero.src))}" alt="${esc(post.hero.alt)}" /></a>
  <div class="blog-story__body">
    <p class="blog-story__tag"><span class="motif" aria-hidden="true"></span><span>${esc(typeLabel)}</span></p>
    <h3 class="blog-story__title">${esc(post.title)}</h3>
    <p class="blog-story__excerpt">${esc(post.description)}</p>
    <p class="blog-story__meta"><time datetime="${esc(post.datePublished)}">${esc(formatDate(post.datePublished, post.lang))}</time> · ${esc(fill(messages, "blog.readingTime", { n: post.readingMinutes }))} · ${esc(regionLabel)}</p>
    <a class="link link--arrow link--small" href="./blog/${esc(post.slug)}.html">${esc(t(messages, "blog.readStory"))}</a>
  </div>
</article>`;
}

function renderFilterBar(messages) {
  const groups = [
    ["region", catalog.taxonomy.regions, "blog.filters.region"],
    ["type", catalog.taxonomy.types, "blog.filters.type"],
    ["act", catalog.taxonomy.activities, "blog.filters.activity"],
  ];
  const html = groups
    .map(([name, items, labelKey]) => {
      const buttons = [
        `<button type="button" class="blog-filters__btn is-active" data-blog-filter="${name}" data-value="all" aria-pressed="true">${esc(t(messages, "blog.filters.all"))}</button>`,
        ...items.map(
          (item) =>
            `<button type="button" class="blog-filters__btn" data-blog-filter="${name}" data-value="${esc(item.id)}" aria-pressed="false">${esc(labelOf(items, item.id, messages.meta && messages.meta.locale === "sl" ? "sl" : "en"))}</button>`
        ),
      ];
      return `<div class="blog-filters__group"><p class="blog-filters__label">${esc(t(messages, labelKey))}</p><div class="blog-filters__links">${buttons.join("")}</div></div>`;
    })
    .join("");
  return `<div class="blog-filters" data-blog-filters>${html}</div>`;
}

function filterLocale(messages) {
  return messages && messages.meta && messages.meta.locale === "sl" ? "sl" : "en";
}

function renderExplore(locale, messages) {
  const posts = publishedIn(catalog.posts, locale);
  const parts = catalog.taxonomy.regions.map((region) => {
    const hub = posts.find((post) => post.hubLevel === "region" && post.region === region.id);
    const regionHtml = hub
      ? `<a href="./blog/${esc(hub.slug)}.html">${esc(labelOf([region], region.id, locale))}</a>`
      : esc(labelOf([region], region.id, locale));
    const areas = (region.areas || []).map((area) => {
      const areaHub = posts.find((post) => post.hubLevel === "area" && post.area === area.id);
      return areaHub
        ? `<a href="./blog/${esc(areaHub.slug)}.html">${esc(labelOf([area], area.id, locale))}</a>`
        : esc(labelOf([area], area.id, locale));
    });
    const areaHtml = areas.length ? ` <span aria-hidden="true">›</span> ${areas.join(" · ")}` : "";
    return `<span class="blog-explore__item">${regionHtml}${areaHtml}</span>`;
  });
  if (!parts.length) return "";
  return `<nav class="blog-explore" aria-label="${esc(t(messages, "blog.explore"))}"><span class="blog-explore__label">${esc(t(messages, "blog.explore"))}</span>${parts.join("")}</nav>`;
}

function renderBlogHub(locale, messages, options = {}) {
  const posts = postsFor(locale);
  const featurePool = posts.filter((post) => post.hubLevel === "pillar" || post.hubLevel === "region");
  const feature = featurePool[0] || null;
  const cards = posts.filter((post) => !feature || post.translationKey !== feature.translationKey);
  const featureHtml = feature
    ? `<article class="blog-feature" data-blog-card data-region="${esc(feature.region)}" data-type="${esc(feature.type)}" data-activities="${esc((feature.activities || []).join(" "))}">
        <a class="blog-feature__media" href="./blog/${esc(feature.slug)}.html"><img src="${esc(publicImage(feature.translationKey, feature.hero.src))}" alt="${esc(feature.hero.alt)}" /></a>
        <div class="blog-feature__body">
          <p class="blog-feature__tag"><span class="motif" aria-hidden="true"></span><span>${esc(labelOf(catalog.taxonomy.types, feature.type, locale))}</span></p>
          <h2 class="blog-feature__title">${esc(feature.title)}</h2>
          <p class="blog-feature__excerpt">${esc(feature.description)}</p>
          <a class="link link--arrow" href="./blog/${esc(feature.slug)}.html">${esc(t(messages, "blog.readStory"))}</a>
        </div>
      </article>`
    : "";
  const empty = posts.length
    ? `<p class="blog-empty" data-blog-empty hidden>${esc(t(messages, "blog.empty"))}</p>`
    : `<p class="blog-empty">${esc(t(messages, "blog.comingSoon"))}${
        locale === "sl"
          ? ` <a class="link" href="/blog">${esc(t(messages, "blog.comingSoonLink"))}</a>`
          : ""
      }</p>`;
  const rss =
    options.journalPublic && posts.length
      ? `<a class="link" href="${locale === "sl" ? "/sl/blog/rss.xml" : "/blog/rss.xml"}">${esc(t(messages, "blog.rss"))}</a>`
      : "";
  return `<section class="blog-hero section" data-section="blog.hero">
  <div class="blog-hero__glow" aria-hidden="true"><img src="./assets/images/home/map-contours-featured.svg" alt="" /></div>
  <div class="container">
    <div class="blog-hero__top">
      <div class="blog-hero__intro">
        <h1 class="blog-hero__title">${t(messages, "blog.hero.titleHtml")}</h1>
        <p class="blog-hero__lede">${esc(t(messages, "blog.hero.lede"))}</p>
      </div>
      ${featureHtml}
    </div>
    ${posts.length ? renderFilterBar({ ...messages, meta: { ...(messages.meta || {}), locale } }) : ""}
    <div class="blog-grid" data-blog-grid>
      ${cards.map((post) => storyCard(post, messages)).join("\n")}
    </div>
    ${empty}
    ${renderExplore(locale, messages)}
    <div class="blog-hub__foot">${rss}${renderAppCta(messages)}</div>
  </div>
</section>`;
}

function renderCrumbs(post, messages) {
  const home = textAt(messages, "chrome.nav.links.home") || "Home";
  const journal = textAt(messages, "chrome.nav.links.journal") || t(messages, "blog.journalName");
  const chain = chainOf(post, catalog.posts);
  const items = [
    `<li><a href="./index.html">${esc(home)}</a></li>`,
    `<li><a href="./blog.html">${esc(journal)}</a></li>`,
    ...chain.map(
      (item) => `<li><a href="./blog/${esc(item.slug)}.html">${esc(item.title)}</a></li>`
    ),
    `<li aria-current="page">${esc(post.title)}</li>`,
  ];
  return `<nav class="post-crumbs" aria-label="Breadcrumb"><ol>${items.join("")}</ol></nav>`;
}

function renderPostList(posts, messages, title) {
  if (!posts.length) return "";
  return `<section class="post-related"><h2>${esc(title)}</h2><div class="blog-grid">${posts
    .map((post) => storyCard(post, messages))
    .join("\n")}</div></section>`;
}

function renderBlogPost(page, locale, messages, options = {}) {
  const post = postFor(page, locale);
  if (!post) throw new Error(`Missing published post for ${page.id}`);
  const ctx = {
    problems: [],
    dir: post.dir,
    translationKey: post.translationKey,
    post,
    faqs: [],
    messages,
    renderTourCard: options.renderTourCard,
    factsMoved: false,
  };
  const parsed = parseMarkdown(post.body, ctx);
  if (ctx.problems.length) {
    throw new Error(`${post.file}:\n- ${ctx.problems.join("\n- ")}`);
  }
  rememberFaqs(post, ctx.faqs);
  const author = catalog.authors.get(post.author);
  const typeLabel = labelOf(catalog.taxonomy.types, post.type, locale);
  const regionLabel = labelOf(catalog.taxonomy.regions, post.region, locale);
  const updated =
    post.dateUpdated > post.datePublished
      ? `<span>${esc(t(messages, "blog.updated"))} <time datetime="${esc(post.dateUpdated)}">${esc(formatDate(post.dateUpdated, locale))}</time></span>`
      : "";
  const facts = ctx.factsMoved ? "" : renderFacts(post, messages);
  const tours = (post.relatedTours || [])
    .map((slug) => (options.renderTourCard ? options.renderTourCard(slug) : ""))
    .filter(Boolean);
  const tourBlock = tours.length
    ? `<section class="post-related"><h2>${esc(t(messages, "blog.relatedTours"))}</h2><div class="adventures__grid">${tours.join("\n")}</div></section>`
    : "";
  const parent = chainOf(post, catalog.posts).slice(-1)[0];
  const upName = parent ? parent.title : textAt(messages, "chrome.nav.links.journal") || "Journal";
  const upHref = parent ? `./blog/${parent.slug}.html` : "./blog.html";
  const heroLicence = t(messages, LICENCE_LABEL[post.hero.licence] || "blog.licence.own");
  return `<article class="article post">
  <figure class="post-hero">
    <img src="${esc(publicImage(post.translationKey, post.hero.src))}" alt="${esc(post.hero.alt)}" />
    <figcaption class="post-figure__credit">${esc(post.hero.credit)} · ${esc(heroLicence)}</figcaption>
  </figure>
  <div class="container article__content">
    ${renderCrumbs(post, messages)}
    <header class="article__header">
      <p class="article__meta">
        <span class="article__tag"><span class="motif" aria-hidden="true"></span>${esc(typeLabel)}</span>
        <span>${esc(regionLabel)}</span>
        <time datetime="${esc(post.datePublished)}">${esc(formatDate(post.datePublished, locale))}</time>
        ${updated}
        <span>${esc(fill(messages, "blog.readingTime", { n: post.readingMinutes }))}</span>
      </p>
      <h1 class="article__title">${esc(post.title)}</h1>
      <p class="article__lede">${esc(post.description)}</p>
    </header>
    ${facts}
    <div class="article__body">${parsed.html}</div>
    <div class="post-end">${renderHowWeMade(post, messages)}${author ? renderAuthorBox(author, locale, messages, `./blog/author/${author.id}.html`) : ""}</div>
    ${tourBlock}
    ${renderPostList(relatedFor(post, catalog.posts), messages, t(messages, "blog.relatedPosts"))}
    ${renderPostList(childrenOf(post, catalog.posts), messages, t(messages, "blog.inThisGuide"))}
    <p class="post-up"><a class="link link--arrow" href="${esc(upHref)}">${esc(fill(messages, "blog.moreIn", { name: upName }))}</a></p>
    ${renderAppCta(messages)}
  </div>
</article>`;
}

function renderAuthorPage(page, locale, messages) {
  const author = catalog.authors.get(page.authorId);
  if (!author) throw new Error(`Missing author ${page.authorId}`);
  const posts = postsFor(locale, page.authorId);
  const { bio, photo } = authorVisible(author, locale);
  const role = (author.role && (author.role[locale] || author.role.en)) || "";
  const photoHtml = photo ? `<img class="post-author__photo" src="${esc(photo)}" alt="" />` : "";
  const bioHtml = bio ? `<p class="post-author__bio">${esc(bio)}</p>` : "";
  return `<article class="article post">
  <div class="container article__content">
    <header class="post-author post-author--page">${photoHtml}<div><h1 class="article__title">${esc(author.name)}</h1><p class="post-author__role">${esc(role)}</p>${bioHtml}</div></header>
    ${renderPostList(posts, messages, t(messages, "blog.authorStories"))}
  </div>
</article>`;
}

function renderHomeJournal(locale, messages) {
  const posts = postsFor(locale).slice(0, 2);
  if (!posts.length) return "";
  const cards = posts
    .map((post, index) => {
      const divider = index ? `<div class="journal__divider" aria-hidden="true"></div>` : "";
      const typeLabel = labelOf(catalog.taxonomy.types, post.type, locale);
      return `${divider}<article class="journal__story">
        <img src="${esc(publicImage(post.translationKey, post.hero.src))}" alt="${esc(post.hero.alt)}" />
        <div class="journal__story-body">
          <div class="journal__tag"><span class="motif" aria-hidden="true"></span><span>${esc(typeLabel)}</span></div>
          <h3>${esc(post.title)}</h3>
          <p>${esc(post.description)}</p>
          <a class="link link--small" href="./blog/${esc(post.slug)}.html">${esc(t(messages, "blog.readStory"))}</a>
        </div>
      </article>`;
    })
    .join("\n");
  return `<section class="journal section" data-section="home.journal">
  <div class="container">
    <div class="journal__inner">
      <div class="journal__cta-col">
        <h2>${t(messages, "home.journal.titleHtml")}</h2>
        <a class="btn btn--primary" href="./blog.html">${esc(t(messages, "home.journal.cta"))}</a>
      </div>
      <div class="journal__list">${cards}</div>
    </div>
  </div>
</section>`;
}

function renderStyleguide(messages, options = {}) {
  const sample = {
    lang: "en",
    facts: {
      distanceKm: 26,
      climbM: 900,
      difficulty: "intermediate",
      bestSeason: "Apr–Oct",
      eat: "Dom pod Storžičem",
      charge: "Cafés in Tržič",
    },
    howWeMade: "Ridden, then drafted with AI help from the rider's notes, then checked by the author.",
    hero: { licence: "own" },
  };
  const author = {
    id: "jakob-robic",
    name: "Jakob Robič",
    role: { en: "Founder" },
    bio: { en: "Writes the Zyflow journal from the rides." },
    photo: { src: "./assets/images/home/journal-1.jpg" },
  };
  const card = options.renderTourCard ? options.renderTourCard("blejcanka") : "";
  return `<section class="sg__section" aria-labelledby="sg-blog">
  <h2 class="sg__section-title" id="sg-blog">Blog</h2>
  <p class="sg__section-desc">Journal components, rendered by the same helpers as the posts.</p>
  ${renderCrumbs({ title: "Prelaz Ljubelj by bike", lang: "en", parentHub: "blog", translationKey: "sample" }, messages)}
  ${renderFacts(sample, messages)}
  ${renderFigure({
    src: "./assets/images/home/journal-1.jpg",
    alt: "E-bike charging at a café",
    captionHtml: "<p>A stop with a socket.</p>",
    credit: "Zyflow",
    licence: "own",
    messages,
  })}
  <div class="adventures__grid">${card}</div>
  ${renderFaq([{ q: "Where do I charge?", aHtml: "<p>Look for a café socket before the climb.</p>", aText: "" }])}
  <div class="post-end">${renderHowWeMade(sample, messages)}${renderAuthorBox(author, "en", messages, "/blog/author/jakob-robic")}</div>
  ${renderAppCta(messages)}
</section>`;
}

function breadcrumbNodes(post, locale, messages, absolute) {
  const home = textAt(messages, "chrome.nav.links.home") || "Home";
  const journal = textAt(messages, "chrome.nav.links.journal") || "Journal";
  const items = [
    { name: home, item: absolute("/", locale) },
    { name: journal, item: absolute("/blog", locale) },
  ];
  for (const crumb of chainOf(post, catalog.posts)) {
    items.push({ name: crumb.title, item: absolute(`/blog/${crumb.slug}`, locale) });
  }
  items.push({ name: post.title, item: absolute(`/blog/${post.slug}`, locale) });
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.item,
    })),
  };
}

function structuredNodes(page, locale, messages, absolute, origin) {
  if (page.blogKind === "post") {
    const post = postFor(page, locale);
    if (!post) return [];
    const author = catalog.authors.get(post.author);
    const authorUrl = author ? absolute(`/blog/author/${author.id}`, locale) : undefined;
    const nodes = [
      {
        "@type": "Article",
        headline: post.title,
        description: post.description,
        image: `${origin}${page.seo.ogImage}`,
        datePublished: post.datePublished,
        dateModified: post.dateUpdated,
        inLanguage: locale,
        mainEntityOfPage: absolute(page.path, locale),
        author: {
          "@type": "Person",
          name: author ? author.name : post.author,
          ...(authorUrl ? { url: authorUrl } : {}),
        },
        publisher: { "@id": `${origin}/#organization` },
      },
      breadcrumbNodes(post, locale, messages, absolute),
    ];
    const faqs = faqsFor(post);
    if (faqs.length) {
      nodes.push({
        "@type": "FAQPage",
        mainEntity: faqs.map((faq) => ({
          "@type": "Question",
          name: faq.q,
          acceptedAnswer: { "@type": "Answer", text: faq.aText },
        })),
      });
    }
    return nodes;
  }
  if (page.id === "blog") {
    const posts = postsFor(locale);
    return [
      {
        "@type": "Blog",
        name: textAt(messages, "meta.pages.blog.title") || "Zyflow Journal",
        description: textAt(messages, "meta.pages.blog.description") || "",
        url: absolute("/blog", locale),
        inLanguage: locale,
        publisher: { "@id": `${origin}/#organization` },
      },
      {
        "@type": "ItemList",
        itemListElement: posts.map((post, index) => ({
          "@type": "ListItem",
          position: index + 1,
          name: post.title,
          url: absolute(`/blog/${post.slug}`, locale),
        })),
      },
    ];
  }
  if (page.blogKind === "author") {
    const author = catalog.authors.get(page.authorId);
    if (!author) return [];
    const { bio, photo } = authorVisible(author, locale);
    const role = (author.role && (author.role[locale] || author.role.en)) || "";
    const node = {
      "@type": "Person",
      name: author.name,
      url: absolute(page.path, locale),
      jobTitle: role,
    };
    if (bio) node.description = bio;
    if (photo) node.image = photo;
    return [node];
  }
  return null;
}

function sitemapDate(page, locale) {
  if (page.blogKind === "post") return page.dateUpdated || "";
  if (page.id === "blog" || page.blogKind === "author") {
    const posts = postsFor(locale, page.authorId);
    let newest = "";
    for (const post of posts) {
      if (post.dateUpdated > newest) newest = post.dateUpdated;
    }
    return newest;
  }
  return null;
}

function renderFeed(locale, origin, hrefFor, options = {}) {
  const posts = options.includeItems === false ? [] : postsFor(locale).slice(0, 20);
  const title = locale === "sl" ? "Zyflow Dnevnik" : "Zyflow Journal";
  const link = `${origin}${locale === "sl" ? "/sl/blog" : "/blog"}`;
  const items = posts
    .map((post) => {
      const url = `${origin}${hrefFor(post)}`;
      const pub = new Date(`${post.datePublished}T00:00:00Z`).toUTCString();
      return `<item>
  <title>${xml(post.title)}</title>
  <link>${xml(url)}</link>
  <guid isPermaLink="true">${xml(url)}</guid>
  <pubDate>${xml(pub)}</pubDate>
  <description>${xml(post.description)}</description>
</item>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>${xml(title)}</title>
  <link>${xml(link)}</link>
  <description>${xml(title)}</description>
  <language>${locale}</language>
${items}
</channel>
</rss>
`;
}

function imageSources() {
  const seen = new Set();
  const sources = [];
  for (const post of catalog.posts) {
    if (seen.has(post.translationKey)) continue;
    seen.add(post.translationKey);
    sources.push({
      key: post.translationKey,
      dir: path.join(post.dir, "images"),
    });
  }
  return sources;
}

function ogSources() {
  const keys = new Set();
  const sources = [];
  for (const post of catalog.posts) {
    if (post.status !== "published" || keys.has(post.translationKey)) continue;
    keys.add(post.translationKey);
    const pair = catalog.posts.filter(
      (item) => item.translationKey === post.translationKey && item.status === "published"
    );
    const chosen = pair.find((item) => item.lang === "en") || pair[0];
    const file = chosen.ogImage
      ? resolveInside(chosen.dir, chosen.ogImage)
      : chosen.heroFile;
    sources.push({ key: post.translationKey, file });
  }
  return sources;
}

function rssHref(locale, journalPublic) {
  if (!journalPublic || !postsFor(locale).length) return "";
  const href = locale === "sl" ? "/sl/blog/rss.xml" : "/blog/rss.xml";
  const title = locale === "sl" ? "Zyflow Dnevnik" : "Zyflow Journal";
  return `<link rel="alternate" type="application/rss+xml" title="${esc(title)}" href="${href}" />`;
}

module.exports = {
  ACTIVITIES,
  HUB_LEVELS,
  LICENCES,
  SOURCE_KINDS,
  TYPES,
  BLOG_PAGES: catalog.pages,
  blogContentDir,
  childrenOf,
  faqsFor,
  formatDate,
  getCatalog,
  imageSources,
  loadBlog,
  ogSources,
  postsFor,
  readingMinutes,
  relatedFor,
  reloadBlog,
  renderAuthorPage,
  renderBlogHub,
  renderBlogPost,
  renderFeed,
  renderHomeJournal,
  renderStyleguide,
  rssHref,
  sitemapDate,
  structuredNodes,
  validateBlog,
};
