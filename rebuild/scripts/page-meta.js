/**
 * Meta description checks and Open Graph image URLs for the static rebuild.
 *
 * Tour and page blurbs live in locales meta.pages.*.description, with a
 * parallel copy on routes.*.metaDescription. This module flags a hard cut,
 * an ellipsis standing in for a finished sentence, and copy in the wrong
 * language. The language score ignores the shared "open in Zyflow" CTA and
 * uses a ratio, so one borrowed word cannot hide a sentence in another language.
 */

const DEFAULT_OG_PATH = "/assets/images/home/hero.jpg";
const DEFAULT_OG_WIDTH = 1024;
const DEFAULT_OG_HEIGHT = 680;
const DEFAULT_OG_TYPE = "image/jpeg";
const TOUR_OG_WIDTH = 1200;
const TOUR_OG_HEIGHT = 630;
const TOUR_OG_TYPE = "image/jpeg";
const MAX_DESCRIPTION = 160;

/** Trailing store CTA. Scored text must not inherit its language. */
const CTA_RE =
  /\s*(?:Open(?: the route)? in Zyflow|Odpri pot v(?: aplikaciji)? Zyflow)[.!?]?\s*$/iu;

/** English function and content words used in our page blurbs. */
const EN_WORDS = [
  "the",
  "and",
  "for",
  "with",
  "from",
  "your",
  "how",
  "this",
  "these",
  "open",
  "toward",
  "through",
  "under",
  "along",
  "into",
  "without",
  "among",
  "where",
  "when",
  "what",
  "here",
  "only",
  "across",
  "privacy",
  "cookie",
  "terms",
  "service",
  "policy",
  "both",
  "stores",
  "live",
  "find",
  "meet",
  "explore",
  "follow",
  "loop",
  "ride",
  "rides",
  "route",
  "routes",
  "cycling",
  "climb",
  "climbs",
  "climbing",
  "pass",
  "bridge",
  "forest",
  "forests",
  "views",
  "flat",
  "ideal",
  "families",
  "easy",
  "shorter",
  "classic",
  "demanding",
  "quiet",
  "steep",
  "closed",
  "cars",
  "hairpins",
  "villages",
  "roads",
  "popular",
  "sinkholes",
  "tracks",
  "nature",
  "reserve",
  "calm",
  "varied",
  "linking",
  "terrain",
  "alpine",
  "gravel",
  "foothill",
  "hut",
  "corridor",
  "pilgrimage",
  "balcony",
  "motorway",
  "landmark",
  "century",
  "urban",
  "global",
  "important",
  "scenic",
  "pastures",
  "ridge",
  "solitude",
  "mountain",
  "approach",
  "places",
  "place",
  "rewarded",
  "link",
  "oldest",
  "road",
  "culture",
  "stops",
  "day",
  "first",
  "crosses",
  "charger",
  "chargers",
  "here's",
  "free",
  "range",
  "plan",
  "planning",
  "bike",
  "parking",
  "storage",
  "pump",
  "filter",
  "app",
  "countries",
  "try",
  "next",
  "reading",
  "elevation",
  "before",
  "like",
  "why",
  "charging",
  "matters",
  "hospitality",
  "makes",
  "friendly",
  "battery",
  "aware",
  "border",
];

/** Slovenian words that do not appear as English function words in our copy. */
const SL_WORDS = [
  "odpri",
  "poti",
  "pot",
  "kolesar\\p{L}*",
  "kako",
  "čez",
  "proti",
  "mimo",
  "najdi",
  "spoznaj",
  "razišči",
  "pokaži",
  "pogoji",
  "politik\\p{L}*",
  "pravn\\p{L}*",
  "vodniki",
  "zapelje",
  "najprej",
  "edini",
  "svetovni",
  "fenomen",
  "brezplačn\\p{L}*",
  "nastanitv\\p{L}*",
  "polnilnic\\p{L}*",
  "restavracij\\p{L}*",
  "kavarn\\p{L}*",
  "vlagatelj\\p{L}*",
  "kamnolom\\p{L}*",
  "lehnjak\\p{L}*",
  "cerkev",
  "planin\\p{L}*",
  "jezer\\p{L}*",
  "domačij\\p{L}*",
  "razgledišč\\p{L}*",
  "zanka",
  "tur[aeio]\\p{L}*",
  "alpsk\\p{L}*",
  "kulturn\\p{L}*",
  "predalpsk\\p{L}*",
  "družinsk\\p{L}*",
  "kolesarjenj\\p{L}*",
  "shrambo",
  "shramba",
  "parkirišč\\p{L}*",
  "zemljevid\\p{L}*",
  "obstaja",
  "pojdi",
  "dodaj",
  "vprašaj",
  "ekip\\p{L}*",
  "dejstva",
  "uporablj\\p{L}*",
  "piškotk\\p{L}*",
  "zasebnost\\p{L}*",
  "obvestilo",
  "izbris\\p{L}*",
  "račun\\p{L}*",
  "naročnin\\p{L}*",
  "odgovornost",
  "pravila",
  "držav\\p{L}*",
  "trgovin\\p{L}*",
  "penzion\\p{L}*",
  "odloči",
  "načrtuj\\p{L}*",
  "preizkus\\p{L}*",
  "vzpon\\p{L}*",
  "doseg",
  "tlačilka",
  "varna",
  "filtriraš",
  "pripelješ",
  "izpeljal",
  "daleč",
  "seže",
  "zakaj",
  "brati",
  "branje",
  "postank\\p{L}*",
  "turi",
  "ture",
  "turo",
  "tura",
  "ravninska",
  "uvršča",
  "najpomembnejše",
  "stoletja",
  "umetnine",
  "ki",
  "je",
  "se",
  "pri",
  "ob",
  "ali",
  "ter",
  "že",
  "še",
  "lahko",
  "tudi",
  "vaše",
  "vaš\\p{L}*",
  "svoj\\p{L}*",
  "zbira",
  "hrani",
  "varuje",
  "osebne",
  "podatke",
  "kraji",
  "kraj",
  "prijazn\\p{L}*",
  "aplikacij\\p{L}*",
  "sporočilo",
  "partnerstv\\p{L}*",
  "naložb\\p{L}*",
  "dosegljiv\\p{L}*",
  "mediji",
  "novosti",
  "nasveti",
  "varnejše",
  "vožnje",
  "dnevnik",
  "stran",
  "domov",
  "podjetja",
  "začneš",
  "iščeš",
  "najdeš",
  "zares",
  "konca",
  "način",
  "preprost",
  "dnevno",
  "dnevne",
  "obeh",
  "voljo",
  "naslednji",
  "kje",
  "kot",
  "makadamsk\\p{L}*",
  "krožn\\p{L}*",
  "kmetij\\p{L}*",
  "polnjenj\\p{L}*",
  "gostinsk\\p{L}*",
  "pomembno",
  "profil\\p{L}*",
  "višinsk\\p{L}*",
  "čezmejn\\p{L}*",
  "označi",
  "lokal",
];

/** German function words. "to"/"in"/"a" are omitted; "to" is Slovenian. */
const DE_WORDS = [
  "eine",
  "einer",
  "einem",
  "einen",
  "kurze",
  "kurzer",
  "kurzen",
  "von",
  "nach",
  "durch",
  "den",
  "dem",
  "der",
  "die",
  "das",
  "radtour",
  "wald",
  "und",
  "mit",
  "für",
  "aus",
  "über",
  "fahrt",
];

const LOCALE_NAME = { en: "English", sl: "Slovenian" };

function countWords(patterns, text) {
  let n = 0;
  for (const pattern of patterns) {
    const re = new RegExp(`(?:^|[^\\p{L}])(?:${pattern})(?=$|[^\\p{L}])`, "giu");
    const matches = text.match(re);
    if (matches) n += matches.length;
  }
  return n;
}

function stripCta(text) {
  return text.replace(CTA_RE, "").trim();
}

function languageIssues(locale, text) {
  const scores = {
    English: countWords(EN_WORDS, text),
    Slovenian: countWords(SL_WORDS, text),
    German: countWords(DE_WORDS, text),
  };
  const total = scores.English + scores.Slovenian + scores.German;
  if (!total) return [];
  const own = LOCALE_NAME[locale];
  const issues = [];
  for (const [name, count] of Object.entries(scores)) {
    if (name === own) continue;
    if (count >= 2 && count / total >= 0.55) {
      issues.push(`looks ${name} on a ${own} page`);
    }
  }
  return issues;
}

function descriptionIssues(locale, description) {
  const text = String(description || "").normalize("NFC").trim();
  const issues = [];
  if (!text) {
    issues.push("missing description");
    return issues;
  }

  const length = [...text].length;
  if (length > MAX_DESCRIPTION) {
    issues.push(`longer than ${MAX_DESCRIPTION} characters (${length})`);
  }

  if (text.includes("...") || text.includes("…")) {
    issues.push("truncated with an ellipsis");
  } else if (!/[.!?](?:["'”’»«)\]]+)?$/.test(text)) {
    const midWord = /[\p{L}]$/u.test(text) && length >= 140;
    issues.push(midWord ? "truncated mid-word" : "does not end at a sentence boundary");
  }

  issues.push(...languageIssues(locale, stripCta(text)));
  return issues;
}

/** Titles are language-checked only: no length cap and no sentence ending. */
function titleIssues(locale, title) {
  const text = String(title || "").normalize("NFC").trim();
  if (!text) return ["missing title"];
  return languageIssues(locale, text);
}

/**
 * @param {Record<string, { meta?: { pages?: Record<string, { title?: string, description?: string }> }, routes?: Record<string, { metaDescription?: string }> }>} messagesByLocale
 * @param {{ id: string }[]} pages
 * @param {(page: { id: string }) => string[]} pageLocales
 * @returns {string[]}
 */
function collectMetaIssues(messagesByLocale, pages, pageLocales) {
  const issues = [];
  for (const page of pages) {
    for (const locale of pageLocales(page)) {
      const meta = messagesByLocale[locale]?.meta?.pages?.[page.id] || {};
      for (const problem of descriptionIssues(locale, meta.description)) {
        issues.push(`${locale} ${page.id}: ${problem}`);
      }
      if (locale === "sl") {
        for (const problem of titleIssues(locale, meta.title)) {
          issues.push(`${locale} ${page.id} title: ${problem}`);
        }
      }
    }
  }

  for (const locale of ["en", "sl"]) {
    const routes = messagesByLocale[locale]?.routes;
    if (!routes) continue;
    for (const [slug, route] of Object.entries(routes)) {
      if (!route || typeof route !== "object" || Array.isArray(route)) continue;
      if (!Object.prototype.hasOwnProperty.call(route, "metaDescription")) continue;
      for (const problem of descriptionIssues(locale, route.metaDescription)) {
        issues.push(`${locale} routes.${slug}.metaDescription: ${problem}`);
      }
    }
  }
  return issues;
}

function absoluteOgImage(origin, cover, fallbackPath = DEFAULT_OG_PATH) {
  const raw = String(cover || "").trim();
  const rel = raw ? raw.replace(/^\.\//, "") : fallbackPath.replace(/^\//, "");
  const path = rel.startsWith("/") ? rel : `/${rel}`;
  return `${origin}${path}`;
}

function tourOgPath(slug) {
  return `/assets/images/og/tours/${slug}.jpg`;
}

function ogImageAlt(locale, title) {
  const name = String(title || "")
    .replace(/^Zyflow:\s*/i, "")
    .replace(/^Zyflow,\s*/i, "")
    .trim();
  if (!name) {
    return locale === "sl"
      ? "Zyflow, kolesarjem prijazni kraji in poti"
      : "Zyflow, bike-friendly places and cycling routes";
  }
  return locale === "sl" ? `Naslovna fotografija: ${name}` : `Cover photo: ${name}`;
}

module.exports = {
  DEFAULT_OG_PATH,
  DEFAULT_OG_WIDTH,
  DEFAULT_OG_HEIGHT,
  DEFAULT_OG_TYPE,
  TOUR_OG_WIDTH,
  TOUR_OG_HEIGHT,
  TOUR_OG_TYPE,
  MAX_DESCRIPTION,
  descriptionIssues,
  titleIssues,
  collectMetaIssues,
  absoluteOgImage,
  tourOgPath,
  ogImageAlt,
};
