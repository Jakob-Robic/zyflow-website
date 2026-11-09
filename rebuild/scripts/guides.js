/**
 * Guides: one rider question per page, answered at the top.
 *
 * Content lives in content/guides/<key>/{en,de,sl}.md. Any language may be
 * missing. URLs (slugs are per language):
 *   EN /guides/<slug>        index /guides
 *   DE /de/ratgeber/<slug>   index /de/ratgeber
 *   SL /sl/vodniki/<slug>    index /sl/vodniki
 * Guide pages and their indexes are the only German pages on the site. The
 * chrome on them is German, but links to other pages go to the English site.
 *
 * Built only while GUIDES_PUBLIC (pages.js) is true. Content is validated on
 * every build either way, so a broken guide fails CI before launch.
 * GUIDES_CONTENT points the build at another folder (preview and tests).
 *
 * Page shape, enforced here:
 *   question (H1, 7 words at most) → short answer (question + answer under
 *   100 words) → data block (dated rows with sources, or a map image with a
 *   credit) → body → App Store / Google Play + "Open in the planner" →
 *   "Checked on" date → sources → related guides. 600 words at most.
 */
const fs = require("fs");
const path = require("path");
const { Marked } = require("marked");
const {
  splitFrontmatter,
  isIsoDate,
  formatDate,
  hrefProblem,
  hasTemplateToken,
  walkTokens,
} = require("./blog");
const { descriptionIssues, titleIssues, languageIssues } = require("./page-meta");
const { PLAY_STORE_URL } = require("./store-links");

const REPO = path.join(__dirname, "..", "..");
const FIXTURE_DIR = path.join(__dirname, "fixtures", "guides");

/** Order is the language switch order: EN · DE · SL. */
const GUIDE_LANGS = ["en", "de", "sl"];
const GUIDE_BASE = { en: "/guides", de: "/de/ratgeber", sl: "/sl/vodniki" };
const STATUSES = new Set(["draft", "published"]);
const MAX_HEADLINE_WORDS = 7;
const MAX_ANSWER_WORDS = 100;
const MAX_PAGE_WORDS = 600;
const MAX_SEO_TITLE = 60;
const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PLANNER_ORIGIN = "https://navigate.zyflow.eu";
const UTM_SOURCE = "zyflow.eu";
const UTM_MEDIUM = "guide";
const ALLOWED_KEYS = new Set([
  "status",
  "slug",
  "question",
  "seoTitle",
  "description",
  "answer",
  "checked",
  "data",
  "sources",
  "related",
  "planner",
  "fixture",
]);

/**
 * Positioning rules from the brand book. Zyflow is where you stop, not how
 * you get there, so guides never pitch it as a Komoot alternative or a
 * navigation app.
 */
const BANNED_PHRASES = [
  {
    re: /komoot[\s-]*alternativ\p{L}*|alternativ\p{L}*\s+(?:to|zu|za|von)\s+komoot/iu,
    why: 'do not call Zyflow a "Komoot alternative"',
  },
  {
    re: /navigation(?:s)?[\s-]*apps?\b|navi[\s-]*apps?\b|navigacijsk\p{L}*\s+aplikacij\p{L}*/iu,
    why: 'do not call Zyflow a "navigation app"; say what it finds (stops, places, chargers)',
  },
];

/** Pictographs, but not © ® ™ (map credits use ©). */
const EMOJI_RE = /(?![©®™])\p{Extended_Pictographic}/u;

function guidesContentDir() {
  return process.env.GUIDES_CONTENT || path.join(REPO, "content/guides");
}

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function textAt(messages, key) {
  const value = String(key)
    .split(".")
    .reduce((obj, part) => (obj == null ? undefined : obj[part]), messages);
  return typeof value === "string" ? value : "";
}

function t(messages, key) {
  const value = textAt(messages, key);
  if (!value) throw new Error(`Missing guides string: ${key}`);
  return value;
}

function fill(messages, key, vars) {
  return t(messages, key).replace(/\{(\w+)\}/g, (_, name) =>
    vars[name] == null ? "" : String(vars[name])
  );
}

function todayIso(override) {
  return override || new Date().toISOString().slice(0, 10);
}

/** Words as a reader counts them: "70 km" is two, "e-bike" is one. */
function countWords(text) {
  return (String(text || "").match(/[\p{L}\p{N}][\p{L}\p{N}'’.,:/-]*/gu) || []).length;
}

/** Markdown to the words a reader sees. Link targets and syntax do not count. */
function markdownWords(markdown) {
  const plain = String(markdown || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, " $1 ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, " $1 ")
    .replace(/<[^>]+>/g, " ")
    .replace(/^[ \t]*(?:#{1,6}|[-*+]|\d+[.)]|>)[ \t]+/gm, " ")
    .replace(/[*_`~|]/g, " ");
  return countWords(plain);
}

function guidePath(lang, slug) {
  return `${GUIDE_BASE[lang]}/${slug}`;
}

function outFor(pagePath) {
  return `${pagePath.replace(/^\//, "")}.html`;
}

function campaignFor(key) {
  return `guide-${key}`;
}

/**
 * Same deep-link contract as the tour pages (login?next=/route/<slug>), plus
 * this guide's UTMs. attribution.js swaps in the visitor's own campaign.
 */
function plannerUrl(guide) {
  const utms = `utm_source=${UTM_SOURCE}&utm_medium=${UTM_MEDIUM}&utm_campaign=${campaignFor(guide.key)}`;
  return guide.planner
    ? `${PLANNER_ORIGIN}/login?next=${guide.planner}&${utms}`
    : `${PLANNER_ORIGIN}/?${utms}`;
}

function push(list, message) {
  if (!list.includes(message)) list.push(message);
}

function isHttpUrl(value) {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function resolveInside(dir, rel) {
  if (typeof rel !== "string" || !rel || rel.includes("..") || path.isAbsolute(rel)) return null;
  const root = path.resolve(dir);
  const abs = path.resolve(dir, rel);
  if (abs !== root && !abs.startsWith(root + path.sep)) return null;
  return abs;
}

function dateProblem(value, label, today, { required }) {
  if (value == null || value === "") return required ? `${label} is required` : null;
  // YAML reads 2026-11-07 as a Date. Accept it and keep the ISO string.
  const iso = value instanceof Date ? value.toISOString().slice(0, 10) : value;
  if (!isIsoDate(iso)) return `${label} must be a date like 2026-11-07`;
  if (iso > today) return `${label} ${iso} is in the future`;
  return null;
}

function isoOf(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value == null ? "" : String(value);
}

function brandProblems(text, label) {
  const problems = [];
  const value = String(text || "");
  if (EMOJI_RE.test(value)) problems.push(`${label}: no emoji (brand rule)`);
  for (const rule of BANNED_PHRASES) {
    if (rule.re.test(value)) problems.push(`${label}: ${rule.why}`);
  }
  return problems;
}

function readGuides(dir, errors) {
  if (!fs.existsSync(dir)) return [];
  const entries = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith("_") || entry.name.startsWith(".")) continue;
    const key = entry.name;
    const guideDir = path.join(dir, key);
    if (!KEBAB.test(key)) {
      errors.push(`${key}: folder name must be lowercase kebab-case`);
      continue;
    }
    for (const file of fs.readdirSync(guideDir)) {
      if (!file.endsWith(".md")) continue;
      const lang = file.slice(0, -3);
      if (!GUIDE_LANGS.includes(lang)) {
        errors.push(`${key}/${file}: guides are written in ${GUIDE_LANGS.join(", ")} only`);
        continue;
      }
      const full = path.join(guideDir, file);
      entries.push({ key, lang, dir: guideDir, file: path.relative(REPO, full), raw: fs.readFileSync(full, "utf8") });
    }
  }
  return entries.sort((a, b) =>
    a.key === b.key ? GUIDE_LANGS.indexOf(a.lang) - GUIDE_LANGS.indexOf(b.lang) : a.key < b.key ? -1 : 1
  );
}

function normalizeRows(rows, where, today, problems) {
  if (!Array.isArray(rows)) {
    problems.push(`${where}: data.rows must be a list`);
    return [];
  }
  return rows.map((row, index) => {
    const label = `data.rows[${index}]`;
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      problems.push(`${where}: ${label} must be an object`);
      return null;
    }
    for (const field of ["label", "value", "source"]) {
      if (row[field] == null || String(row[field]).trim() === "") {
        problems.push(`${where}: ${label}.${field} is required`);
      }
    }
    const date = dateProblem(row.asOf, `${label}.asOf`, today, { required: true });
    if (date) problems.push(`${where}: ${date}`);
    if (row.url != null && !isHttpUrl(row.url)) {
      problems.push(`${where}: ${label}.url must be an http(s) link`);
    }
    return {
      label: String(row.label ?? "").trim(),
      value: String(row.value ?? "").trim(),
      source: String(row.source ?? "").trim(),
      url: row.url ? String(row.url) : "",
      asOf: isoOf(row.asOf),
    };
  }).filter(Boolean);
}

function normalizeMap(map, entry, where, today, problems) {
  if (!map || typeof map !== "object" || Array.isArray(map)) {
    problems.push(`${where}: data.map must be an object`);
    return null;
  }
  for (const field of ["src", "alt", "credit"]) {
    if (!map[field] || !String(map[field]).trim()) {
      problems.push(`${where}: data.map.${field} is required`);
    }
  }
  const date = dateProblem(map.asOf, "data.map.asOf", today, { required: true });
  if (date) problems.push(`${where}: ${date}`);
  let file = null;
  if (map.src) {
    file = resolveInside(entry.dir, map.src);
    if (!file || !String(map.src).startsWith("images/")) {
      problems.push(`${where}: data.map.src must be a file under images/ in the guide folder`);
      file = null;
    } else if (!fs.existsSync(file)) {
      problems.push(`${where}: data.map.src ${map.src} does not exist`);
      file = null;
    }
  }
  return {
    src: map.src ? `/assets/images/guides/${entry.key}/${String(map.src).replace(/^images\//, "")}` : "",
    alt: String(map.alt || "").trim(),
    credit: String(map.credit || "").trim(),
    asOf: isoOf(map.asOf),
    file,
  };
}

function normalizeSources(sources, where, today, problems) {
  if (sources == null) return [];
  if (!Array.isArray(sources)) {
    problems.push(`${where}: sources must be a list`);
    return [];
  }
  return sources.map((source, index) => {
    const label = `sources[${index}]`;
    if (!source || typeof source !== "object" || Array.isArray(source)) {
      problems.push(`${where}: ${label} must have a title and a url`);
      return null;
    }
    if (!source.title || !String(source.title).trim()) {
      problems.push(`${where}: ${label}.title is required`);
    }
    if (!isHttpUrl(source.url)) problems.push(`${where}: ${label}.url must be an http(s) link`);
    const date = dateProblem(source.accessed, `${label}.accessed`, today, { required: false });
    if (date) problems.push(`${where}: ${date}`);
    return {
      title: String(source.title || "").trim(),
      url: String(source.url || ""),
      accessed: isoOf(source.accessed),
    };
  }).filter(Boolean);
}

/** Renders the body once to collect problems; the real render happens per page. */
function renderMarkdown(markdown, problems) {
  const marked = new Marked();
  marked.use({
    gfm: true,
    renderer: {
      html({ text }) {
        push(problems, "raw HTML is not allowed in the guide body");
        return esc(text);
      },
      heading({ tokens, depth }) {
        if (depth === 1) {
          push(problems, "the question is the only H1; use ## for sections");
        }
        const level = Math.min(Math.max(depth, 2), 4);
        return `<h${level}>${this.parser.parseInline(tokens)}</h${level}>\n`;
      },
      link(token) {
        const problem = hrefProblem(token.href);
        if (problem) {
          push(problems, problem);
          return esc(token.text || "");
        }
        const inner = token.tokens ? this.parser.parseInline(token.tokens) : esc(token.text || "");
        const external = /^https?:/i.test(token.href);
        const rel = external ? ' rel="noopener"' : "";
        return `<a href="${esc(token.href)}"${rel}>${inner}</a>`;
      },
      image() {
        push(problems, "images are not allowed in the guide body; use data.map");
        return "";
      },
    },
  });
  const tokens = marked.lexer(String(markdown || ""));
  walkTokens(tokens, (token) => {
    if (token.type === "html") push(problems, "raw HTML is not allowed in the guide body");
    if (token.type === "image") push(problems, "images are not allowed in the guide body; use data.map");
  });
  return marked.parser(tokens);
}

function normalizeGuide(entry, errors, today) {
  const where = entry.file;
  const parsed = splitFrontmatter(entry.raw);
  if (parsed.error) {
    errors.push(`${where}: ${parsed.error}`);
    return null;
  }
  const data = parsed.data;
  const problems = [];
  for (const key of Object.keys(data)) {
    if (!ALLOWED_KEYS.has(key)) problems.push(`${where}: unknown field "${key}"`);
  }
  if (!STATUSES.has(data.status)) problems.push(`${where}: status must be draft or published`);
  const published = data.status === "published";
  if (typeof data.slug !== "string" || !KEBAB.test(data.slug)) {
    problems.push(`${where}: slug must be lowercase kebab-case`);
  }

  const question = String(data.question || "").trim();
  const answer = String(data.answer || "").replace(/\s+/g, " ").trim();
  const description = String(data.description || "").trim();
  const seoTitle = data.seoTitle == null ? "" : String(data.seoTitle).trim();
  if (!question) problems.push(`${where}: question is required`);
  if (countWords(question) > MAX_HEADLINE_WORDS) {
    problems.push(
      `${where}: question has ${countWords(question)} words; headlines are ${MAX_HEADLINE_WORDS} words at most (put longer search wording in seoTitle)`
    );
  }
  if (!answer) problems.push(`${where}: answer is required`);
  const answerWords = countWords(question) + countWords(answer);
  if (answerWords > MAX_ANSWER_WORDS) {
    problems.push(
      `${where}: question and answer have ${answerWords} words; the answer must land within the first ${MAX_ANSWER_WORDS}`
    );
  }
  if ([...seoTitle].length > MAX_SEO_TITLE) {
    problems.push(`${where}: seoTitle is ${[...seoTitle].length} characters; keep it to ${MAX_SEO_TITLE}`);
  }
  for (const issue of titleIssues(entry.lang, seoTitle || question)) {
    problems.push(`${where}: title ${issue}`);
  }
  for (const issue of descriptionIssues(entry.lang, description)) {
    problems.push(`${where}: description ${issue}`);
  }
  for (const issue of languageIssues(entry.lang, answer)) {
    problems.push(`${where}: answer ${issue}`);
  }

  const checkedProblem = dateProblem(data.checked, "checked", today, { required: published });
  if (checkedProblem) problems.push(`${where}: ${checkedProblem}`);

  let rows = [];
  let map = null;
  if (data.data != null) {
    if (typeof data.data !== "object" || Array.isArray(data.data)) {
      problems.push(`${where}: data must have rows or a map`);
    } else {
      for (const key of Object.keys(data.data)) {
        if (key !== "rows" && key !== "map") problems.push(`${where}: unknown data field "${key}"`);
      }
      if (data.data.rows != null) rows = normalizeRows(data.data.rows, where, today, problems);
      if (data.data.map != null) map = normalizeMap(data.data.map, entry, where, today, problems);
    }
  }
  if (published && !rows.length && !map) {
    problems.push(`${where}: published guides need a data block (data.rows or data.map)`);
  }

  const sources = normalizeSources(data.sources, where, today, problems);
  if (published && !sources.length) problems.push(`${where}: published guides need at least one source`);

  let related = [];
  if (data.related != null) {
    if (!Array.isArray(data.related) || data.related.some((key) => typeof key !== "string" || !KEBAB.test(key))) {
      problems.push(`${where}: related must be a list of guide folder names`);
    } else {
      related = [...new Set(data.related)];
    }
  }

  let planner = "";
  if (data.planner != null) {
    if (typeof data.planner !== "string" || !/^\/[a-z0-9/_-]*$/.test(data.planner)) {
      problems.push(`${where}: planner must be a planner path like /route/kamnicanka`);
    } else {
      planner = data.planner;
    }
  }
  if (data.fixture != null && typeof data.fixture !== "boolean") {
    problems.push(`${where}: fixture must be true or false`);
  }

  const body = String(parsed.body || "");
  const textFields = { question, answer, description, seoTitle, body };
  for (const [label, value] of Object.entries(textFields)) {
    for (const problem of brandProblems(value, label)) problems.push(`${where}: ${problem}`);
  }
  for (const row of rows) {
    for (const problem of brandProblems(`${row.label} ${row.value} ${row.source}`, "data.rows")) {
      problems.push(`${where}: ${problem}`);
    }
  }
  const tokenFields = [question, answer, description, seoTitle, body, JSON.stringify(data.data || {}), JSON.stringify(data.sources || [])];
  if (tokenFields.some((value) => hasTemplateToken(value))) {
    problems.push(`${where}: template tokens {{...}} are not allowed in guides`);
  }

  const bodyProblems = [];
  renderMarkdown(body, bodyProblems);
  for (const problem of bodyProblems) problems.push(`${where}: ${problem}`);

  const dataWords = rows.reduce((sum, row) => sum + countWords(`${row.label} ${row.value}`), 0);
  const words = countWords(question) + countWords(answer) + dataWords + markdownWords(body);
  if (words > MAX_PAGE_WORDS) {
    problems.push(`${where}: ${words} words; guides are ${MAX_PAGE_WORDS} words at most`);
  }

  errors.push(...problems);
  return {
    key: entry.key,
    lang: entry.lang,
    dir: entry.dir,
    file: entry.file,
    status: data.status,
    slug: data.slug,
    question,
    answer,
    description,
    seoTitle,
    checked: isoOf(data.checked),
    rows,
    map,
    sources,
    related,
    planner,
    fixture: data.fixture === true,
    body,
    words,
  };
}

function validateRelations(guides, errors) {
  const keys = new Set(guides.map((guide) => guide.key));
  const slugs = new Map();
  for (const guide of guides) {
    const slugKey = `${guide.lang}:${guide.slug}`;
    if (slugs.has(slugKey)) {
      errors.push(`${guide.file}: slug "${guide.slug}" is also used by ${slugs.get(slugKey)}`);
    } else {
      slugs.set(slugKey, guide.file);
    }
    for (const key of guide.related) {
      if (key === guide.key) errors.push(`${guide.file}: a guide cannot be related to itself`);
      else if (!keys.has(key)) errors.push(`${guide.file}: related guide "${key}" does not exist`);
    }
  }
}

function sortGuides(list) {
  return [...list].sort((a, b) =>
    a.checked === b.checked ? a.question.localeCompare(b.question, a.lang) : a.checked < b.checked ? 1 : -1
  );
}

function indexPages(published) {
  const withGuides = new Set(published.map((guide) => guide.lang));
  const alternates = Object.fromEntries(
    GUIDE_LANGS.filter((lang) => withGuides.has(lang)).map((lang) => [lang, GUIDE_BASE[lang]])
  );
  return GUIDE_LANGS.map((lang) => {
    const page = {
      id: "guides",
      file: "guides.html",
      out: outFor(GUIDE_BASE[lang]),
      path: GUIDE_BASE[lang],
      locales: [lang],
      localePrefix: false,
      // An index with no guides yet is built so the language switch has a
      // target, but it stays out of search and the sitemap.
      indexable: withGuides.has(lang),
      guideKind: "index",
      guideLang: lang,
      campaign: "guides",
      langSwitch: { ...GUIDE_BASE },
    };
    if (withGuides.has(lang)) page.alternates = alternates;
    else page.hreflang = false;
    return page;
  });
}

function buildPages(guides) {
  const published = guides.filter((guide) => guide.status === "published");
  const pages = indexPages(published);
  const byKey = new Map();
  for (const guide of published) {
    if (!byKey.has(guide.key)) byKey.set(guide.key, {});
    byKey.get(guide.key)[guide.lang] = guide;
  }
  for (const guide of published) {
    const set = byKey.get(guide.key);
    const pagePath = guidePath(guide.lang, guide.slug);
    pages.push({
      id: `guide-${guide.key}-${guide.lang}`,
      file: "guide.html",
      out: outFor(pagePath),
      path: pagePath,
      locales: [guide.lang],
      localePrefix: false,
      indexable: true,
      guideKind: "guide",
      guideKey: guide.key,
      guideLang: guide.lang,
      campaign: campaignFor(guide.key),
      dateUpdated: guide.checked,
      // The switch always offers EN · DE · SL. A language this guide is not
      // written in goes to that language's guides index.
      langSwitch: Object.fromEntries(
        GUIDE_LANGS.map((lang) => [lang, set[lang] ? guidePath(lang, set[lang].slug) : GUIDE_BASE[lang]])
      ),
      // hreflang lists only the languages the guide exists in.
      alternates: Object.fromEntries(
        GUIDE_LANGS.filter((lang) => set[lang]).map((lang) => [lang, guidePath(lang, set[lang].slug)])
      ),
      seo: {
        title: guide.seoTitle || guide.question,
        description: guide.description,
        ogType: "article",
      },
    });
  }
  return pages;
}

function loadGuides(dir = guidesContentDir(), options = {}) {
  const errors = [];
  const today = todayIso(options.today);
  const entries = readGuides(dir, errors);
  const guides = entries.map((entry) => normalizeGuide(entry, errors, today)).filter(Boolean);
  validateRelations(guides, errors);
  const pages = errors.length ? [] : buildPages(guides);
  return { dir, guides, errors, pages, today };
}

function validationError(catalog) {
  return new Error(
    `Guides validation failed (${catalog.errors.length}):\n- ${catalog.errors.join("\n- ")}`
  );
}

let catalog = loadGuides();
if (catalog.errors.length) throw validationError(catalog);

function getGuideCatalog() {
  return catalog;
}

function publishedGuides(lang) {
  return sortGuides(
    catalog.guides.filter((guide) => guide.status === "published" && (!lang || guide.lang === lang))
  );
}

function guideFor(page) {
  return catalog.guides.find(
    (guide) => guide.key === page.guideKey && guide.lang === page.guideLang && guide.status === "published"
  );
}

/**
 * Refuse states that must never reach the live site: a public flag with no
 * published guide, and the preview fixture in a production build.
 */
function assertGuidesBuildable({ guidesPublic, siteIndex }) {
  if (guidesPublic && !publishedGuides().length) {
    throw new Error(
      "GUIDES_PUBLIC is on but there is no published guide. Publish one in content/guides first."
    );
  }
  if (siteIndex) {
    const fixtures = catalog.guides.filter((guide) => guide.fixture);
    if (fixtures.length) {
      throw new Error(
        `Production build refuses fixture guides: ${fixtures.map((guide) => guide.file).join(", ")}`
      );
    }
  }
}

function renderCrumbs(lang, messages, current) {
  const home = textAt(messages, "chrome.nav.links.home") || "Home";
  const items = [
    `<li><a href="./index.html">${esc(home)}</a></li>`,
    current
      ? `<li><a href="${GUIDE_BASE[lang]}">${esc(t(messages, "guides.name"))}</a></li>`
      : `<li aria-current="page">${esc(t(messages, "guides.name"))}</li>`,
  ];
  if (current) items.push(`<li aria-current="page">${esc(current)}</li>`);
  return `<nav class="post-crumbs" aria-label="Breadcrumb"><ol>${items.join("")}</ol></nav>`;
}

function renderDataBlock(guide, lang, messages) {
  const parts = [];
  if (guide.rows.length) {
    const items = guide.rows
      .map((row) => {
        const source = row.url
          ? `<a href="${esc(row.url)}" rel="noopener">${esc(row.source)}</a>`
          : esc(row.source);
        const note = fill(messages, "guides.dataSource", {
          source: "\u0000",
          date: formatDate(row.asOf, lang),
        })
          .split("\u0000")
          .map(esc)
          .join(source);
        return `<div class="post-facts__item"><dt>${esc(row.label)}</dt><dd>${esc(row.value)}</dd><dd class="guide-data__source">${note}</dd></div>`;
      })
      .join("");
    parts.push(`<div class="post-facts guide-data__rows"><dl>${items}</dl></div>`);
  }
  if (guide.map) {
    const credit = fill(messages, "guides.mapCredit", {
      credit: guide.map.credit,
      date: formatDate(guide.map.asOf, lang),
    });
    parts.push(`<figure class="post-figure guide-data__map">
  <img src="${esc(guide.map.src)}" alt="${esc(guide.map.alt)}" />
  <figcaption><span class="post-figure__credit">${esc(credit)}</span></figcaption>
</figure>`);
  }
  if (!parts.length) return "";
  return `<section class="guide-data" aria-label="${esc(t(messages, "guides.dataLabel"))}">${parts.join("\n")}</section>`;
}

/** One main CTA: the app, on both stores. The planner is the quieter second path. */
function renderCta(guide, messages) {
  return `<aside class="post-app guide-cta">
  <p class="post-app__title">${esc(t(messages, "guides.cta.title"))}</p>
  <div class="app-stage__ctas">
    <a class="btn btn--primary" href="{{appStoreUrl}}">${esc(t(messages, "guides.cta.ios"))}</a>
    <a class="btn btn--secondary" href="${esc(PLAY_STORE_URL)}">${esc(t(messages, "guides.cta.android"))}</a>
  </div>
  <p class="guide-cta__planner"><a class="link link--arrow" href="${esc(plannerUrl(guide))}" data-planner-link>${esc(t(messages, "guides.cta.planner"))}</a></p>
</aside>`;
}

function renderSources(guide, lang, messages) {
  if (!guide.sources.length) return "";
  const items = guide.sources
    .map((source) => {
      const accessed = source.accessed
        ? `, ${esc(fill(messages, "guides.accessed", { date: formatDate(source.accessed, lang) }))}`
        : "";
      return `<li><a href="${esc(source.url)}" rel="noopener">${esc(source.title)}</a>${accessed}</li>`;
    })
    .join("");
  return `<section class="guide-sources"><h2>${esc(t(messages, "guides.sources"))}</h2><ol>${items}</ol></section>`;
}

/** Related guides in the same language. A related guide missing in this language is skipped. */
function relatedGuides(guide) {
  return guide.related
    .map((key) =>
      catalog.guides.find(
        (item) => item.key === key && item.lang === guide.lang && item.status === "published"
      )
    )
    .filter(Boolean);
}

function renderRelated(guide, messages) {
  const related = relatedGuides(guide);
  if (!related.length) return "";
  const items = related
    .map((item) => `<li><a class="link link--arrow" href="${guidePath(item.lang, item.slug)}">${esc(item.question)}</a></li>`)
    .join("");
  return `<section class="guide-related"><h2>${esc(t(messages, "guides.related"))}</h2><ul>${items}</ul></section>`;
}

function renderFixtureNote(guide, messages) {
  if (!guide.fixture) return "";
  return `<p class="guide-fixture" role="note">${esc(t(messages, "guides.fixtureNote"))}</p>`;
}

function renderGuide(page, messages) {
  const guide = guideFor(page);
  if (!guide) throw new Error(`Missing published guide for ${page.id}`);
  const lang = guide.lang;
  const problems = [];
  const bodyHtml = renderMarkdown(guide.body, problems);
  if (problems.length) throw new Error(`${guide.file}:\n- ${problems.join("\n- ")}`);
  return `<article class="article post guide">
  <div class="container article__content">
    ${renderFixtureNote(guide, messages)}
    ${renderCrumbs(lang, messages, guide.question)}
    <header class="article__header guide__header">
      <h1 class="article__title">${esc(guide.question)}</h1>
      <p class="guide__answer">${esc(guide.answer)}</p>
    </header>
    ${renderDataBlock(guide, lang, messages)}
    <div class="article__body">${bodyHtml}</div>
    ${renderCta(guide, messages)}
    <p class="guide__checked">${esc(t(messages, "guides.checked"))} <time datetime="${esc(guide.checked)}">${esc(formatDate(guide.checked, lang))}</time></p>
    ${renderSources(guide, lang, messages)}
    ${renderRelated(guide, messages)}
  </div>
</article>`;
}

function renderGuidesIndex(page, messages) {
  const lang = page.guideLang;
  const guides = publishedGuides(lang);
  const list = guides.length
    ? `<ul class="guides-list">${guides
        .map(
          (guide) => `<li class="guides-list__item"><a class="guides-list__link" href="${guidePath(lang, guide.slug)}"><span class="guides-list__q">${esc(guide.question)}</span><span class="guides-list__a">${esc(guide.answer)}</span></a></li>`
        )
        .join("")}</ul>`
    : `<p class="guides-index__empty">${esc(t(messages, "guides.index.empty"))} <a class="link link--arrow" href="${GUIDE_BASE.en}">${esc(t(messages, "guides.index.emptyLink"))}</a></p>`;
  return `<section class="article guides-index">
  <div class="container article__content">
    ${renderCrumbs(lang, messages, "")}
    <header class="article__header">
      <h1 class="article__title">${esc(t(messages, "guides.index.title"))}</h1>
      <p class="article__lede">${esc(t(messages, "guides.index.lede"))}</p>
    </header>
    ${list}
  </div>
</section>`;
}

function breadcrumbNode(items) {
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

function guideStructuredNodes(page, messages, origin, ogImage) {
  if (!page.guideKind) return null;
  const lang = page.guideLang;
  const home = { name: textAt(messages, "chrome.nav.links.home") || "Home", item: `${origin}/` };
  const index = { name: textAt(messages, "guides.name") || "Guides", item: `${origin}${GUIDE_BASE[lang]}` };
  if (page.guideKind === "index") {
    return [
      {
        "@type": "CollectionPage",
        name: textAt(messages, "meta.pages.guides.title") || "Zyflow Guides",
        description: textAt(messages, "meta.pages.guides.description") || "",
        url: index.item,
        inLanguage: lang,
        publisher: { "@id": `${origin}/#organization` },
        mainEntity: {
          "@type": "ItemList",
          itemListElement: publishedGuides(lang).map((guide, position) => ({
            "@type": "ListItem",
            position: position + 1,
            name: guide.question,
            url: `${origin}${guidePath(lang, guide.slug)}`,
          })),
        },
      },
      breadcrumbNode([home, index]),
    ];
  }
  const guide = guideFor(page);
  if (!guide) return [];
  const url = `${origin}${page.path}`;
  return [
    {
      "@type": "Article",
      headline: guide.question,
      description: guide.description,
      image: ogImage,
      dateModified: guide.checked,
      inLanguage: lang,
      mainEntityOfPage: url,
      author: { "@id": `${origin}/#organization` },
      publisher: { "@id": `${origin}/#organization` },
    },
    breadcrumbNode([home, index, { name: guide.question, item: url }]),
  ];
}

/** Newest checked date in this index, or the guide's own checked date. */
function guideSitemapDate(page) {
  if (page.guideKind === "guide") return page.dateUpdated || "";
  if (page.guideKind === "index") {
    return publishedGuides(page.guideLang).reduce(
      (newest, guide) => (guide.checked > newest ? guide.checked : newest),
      ""
    );
  }
  return null;
}

function guideImageSources() {
  const seen = new Set();
  const sources = [];
  for (const guide of catalog.guides) {
    if (seen.has(guide.key)) continue;
    seen.add(guide.key);
    sources.push({ key: guide.key, dir: path.join(guide.dir, "images") });
  }
  return sources;
}

module.exports = {
  FIXTURE_DIR,
  GUIDE_BASE,
  GUIDE_LANGS,
  GUIDE_PAGES: catalog.pages,
  GUIDE_INDEX_PAGES: indexPages([]),
  MAX_ANSWER_WORDS,
  MAX_HEADLINE_WORDS,
  MAX_PAGE_WORDS,
  UTM_MEDIUM,
  assertGuidesBuildable,
  campaignFor,
  countWords,
  getGuideCatalog,
  guideImageSources,
  guideSitemapDate,
  guideStructuredNodes,
  guidesContentDir,
  loadGuides,
  plannerUrl,
  publishedGuides,
  renderGuide,
  renderGuidesIndex,
};
