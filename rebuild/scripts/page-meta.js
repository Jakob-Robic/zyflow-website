/**
 * Meta description checks and Open Graph image URLs for the static rebuild.
 *
 * Tour and page blurbs live in locales meta.pages.*.description. This module
 * flags the failures seen on the live site: a hard cut mid-word, a place-list
 * pasted in place of a sentence, and a description in the other locale's language.
 */

const DEFAULT_OG_PATH = "/assets/images/home/hero.jpg";
const MAX_DESCRIPTION = 160;

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
  "daleč",
  "seže",
  "zakaj",
  "brati",
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
  "zbira",
  "hrani",
  "varuje",
  "osebne",
  "podatke",
  "kraji",
  "prijazn\\p{L}*",
  "aplikacij\\p{L}*",
  "naročnin\\p{L}*",
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
  "obeh",
  "voljo",
  "naslednji",
  "kje",
  "kot",
];

function countWords(patterns, text) {
  let n = 0;
  for (const pattern of patterns) {
    const re = new RegExp(`(?:^|[^\\p{L}])(?:${pattern})(?=$|[^\\p{L}])`, "giu");
    const matches = text.match(re);
    if (matches) n += matches.length;
  }
  return n;
}

function descriptionIssues(locale, description) {
  const text = String(description || "").trim();
  const issues = [];
  if (!text) {
    issues.push("missing description");
    return issues;
  }

  const length = [...text].length;
  if (length > MAX_DESCRIPTION) {
    issues.push(`longer than ${MAX_DESCRIPTION} characters (${length})`);
  }

  const endsSentence = /[.!?]["')\]]*$/.test(text);
  if (!endsSentence) {
    const midWord = /[\p{L}]$/u.test(text) && length >= 140;
    issues.push(midWord ? "truncated mid-word" : "does not end at a sentence boundary");
  }

  const english = countWords(EN_WORDS, text);
  const slovenian = countWords(SL_WORDS, text);
  if (locale === "en" && slovenian >= 2 && english === 0) {
    issues.push("looks Slovenian on an English page");
  }
  if (locale === "sl" && english >= 2 && slovenian === 0) {
    issues.push("looks English on a Slovenian page");
  }

  return issues;
}

/**
 * @param {Record<string, { meta?: { pages?: Record<string, { description?: string }> } }>} messagesByLocale
 * @param {{ id: string }[]} pages
 * @param {(page: { id: string }) => string[]} pageLocales
 * @returns {string[]}
 */
function collectMetaIssues(messagesByLocale, pages, pageLocales) {
  const issues = [];
  for (const page of pages) {
    for (const locale of pageLocales(page)) {
      const description = messagesByLocale[locale]?.meta?.pages?.[page.id]?.description;
      for (const problem of descriptionIssues(locale, description)) {
        issues.push(`${locale} ${page.id}: ${problem}`);
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

module.exports = {
  DEFAULT_OG_PATH,
  MAX_DESCRIPTION,
  descriptionIssues,
  collectMetaIssues,
  absoluteOgImage,
};
