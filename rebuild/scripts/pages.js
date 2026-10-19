/**
 * Single source of truth for rebuild routes, SEO, and locale output.
 */
const { ARTICLE_PAGES } = require("./articles");
const { ROUTE_PAGES } = require("./routes");

const SITE_ORIGIN = process.env.SITE_ORIGIN || "https://www.zyflow.eu";
const LOCALES = ["en", "sl"];
const DEFAULT_LOCALE = "en";

/**
 * Journal (/blog and article pages) is built for preview but kept out of the
 * public site until launch. Set this to true to:
 *   - mark /blog and articles indexable
 *   - drop the robots.txt Disallow for /blog
 *   - restore nav, footer, home journal, and "Read Journal" links
 *     (HTML marked <!-- journal:public --> / <!-- journal:hidden -->)
 * A process env JOURNAL_PUBLIC=true|false overrides this line for one build
 * (used by tests). The line itself stays the switch for a real launch.
 */
const JOURNAL_PUBLIC = false;

function journalIsPublic() {
  const override = process.env.JOURNAL_PUBLIC;
  if (override === "true" || override === "1") return true;
  if (override === "false" || override === "0") return false;
  return JOURNAL_PUBLIC;
}

const JOURNAL_IS_PUBLIC = journalIsPublic();

/** @typedef {{ id: string, file: string, out: string, path: string, indexable: boolean, locales?: string[], preloadHero?: boolean }} PageDef */

/** @type {PageDef[]} */
const PAGES = [
  {
    id: "home",
    file: "home.html",
    out: "index.html",
    path: "/",
    indexable: true,
    preloadHero: true,
  },
  {
    id: "about",
    file: "about.html",
    out: "about.html",
    path: "/about",
    indexable: true,
  },
  {
    id: "tours",
    file: "tours.html",
    out: "tours.html",
    path: "/tours",
    indexable: true,
  },
  {
    id: "tour",
    file: "tour.html",
    out: "tour.html",
    path: "/tour",
    // Legacy single-tour URL — redirect to /tours in vercel.json
    indexable: false,
  },
  ...ROUTE_PAGES,
  {
    id: "blog",
    file: "blog.html",
    out: "blog.html",
    path: "/blog",
    indexable: JOURNAL_IS_PUBLIC,
  },
  ...ARTICLE_PAGES.map((page) => ({ ...page, indexable: JOURNAL_IS_PUBLIC })),
  {
    id: "contact",
    file: "contact.html",
    out: "contact.html",
    path: "/contact",
    indexable: true,
  },
  {
    id: "business",
    file: "business.html",
    out: "business.html",
    path: "/business",
    indexable: true,
  },
  {
    id: "press",
    file: "press.html",
    out: "press.html",
    path: "/press",
    indexable: true,
  },
  {
    id: "legal",
    file: "legal.html",
    out: "legal.html",
    path: "/legal",
    indexable: true,
  },
  {
    id: "legal-pages-privacy-policy",
    file: "legal-doc.html",
    out: "legal-pages/privacy-policy.html",
    path: "/legal-pages/privacy-policy",
    indexable: true,
    legalDoc: "privacy-policy",
    legalKey: "privacy",
  },
  {
    id: "legal-pages-terms",
    file: "legal-doc.html",
    out: "legal-pages/terms.html",
    path: "/legal-pages/terms",
    indexable: true,
    legalDoc: "terms",
    legalKey: "terms",
  },
  {
    id: "legal-pages-cookie-policy",
    file: "legal-doc.html",
    out: "legal-pages/cookie-policy.html",
    path: "/legal-pages/cookie-policy",
    indexable: true,
    legalDoc: "cookie-policy",
    legalKey: "cookies",
  },
  {
    id: "legal-pages-impressum",
    file: "legal-doc.html",
    out: "legal-pages/impressum.html",
    path: "/legal-pages/impressum",
    indexable: true,
    legalDoc: "impressum",
    legalKey: "impressum",
  },
  {
    id: "legal-pages-delete-account",
    file: "legal-doc.html",
    out: "legal-pages/delete-account.html",
    path: "/legal-pages/delete-account",
    indexable: true,
    locales: ["en"],
    legalDoc: "account-deletion",
    legalKey: "deletion",
    dropUnpublishedDeletion: true,
    langSwitch: {
      en: "/legal-pages/delete-account",
      sl: "/legal-pages/izbris-racuna",
    },
  },
  {
    id: "legal-pages-izbris-racuna",
    file: "legal-doc.html",
    out: "legal-pages/izbris-racuna.html",
    path: "/legal-pages/izbris-racuna",
    indexable: true,
    locales: ["sl"],
    localePrefix: false,
    legalDoc: "account-deletion",
    legalKey: "deletion",
    dropUnpublishedDeletion: true,
    langSwitch: {
      en: "/legal-pages/delete-account",
      sl: "/legal-pages/izbris-racuna",
    },
  },
  {
    id: "legal-privacy",
    file: "legal-redirect.html",
    out: "legal-privacy.html",
    path: "/legal-privacy",
    indexable: false,
    redirectTo: "/legal-pages/privacy-policy",
  },
  {
    id: "legal-cookies",
    file: "legal-redirect.html",
    out: "legal-cookies.html",
    path: "/legal-cookies",
    indexable: false,
    redirectTo: "/legal-pages/cookie-policy",
  },
  {
    id: "legal-terms",
    file: "legal-redirect.html",
    out: "legal-terms.html",
    path: "/legal-terms",
    indexable: false,
    redirectTo: "/legal-pages/terms",
  },
  {
    id: "404",
    file: "404.html",
    out: "404.html",
    path: "/404",
    indexable: false,
  },
  {
    id: "styleguide",
    file: "styleguide.html",
    out: "styleguide.html",
    path: "/styleguide",
    indexable: false,
    locales: ["en"],
  },
];

function pageLocales(page) {
  return page.locales || LOCALES;
}

function localizedPath(pagePath, locale, page) {
  if (page && page.localePrefix === false) return pagePath;
  if (locale === DEFAULT_LOCALE) return pagePath;
  if (pagePath === "/") return `/${locale}`;
  return `/${locale}${pagePath}`;
}

function pageForPath(pagePath) {
  return PAGES.find((p) => p.path === pagePath);
}

function absoluteUrl(pagePath, locale) {
  const page = pageForPath(pagePath);
  const p = localizedPath(pagePath, locale, page);
  return p === "/" ? `${SITE_ORIGIN}/` : `${SITE_ORIGIN}${p}`;
}

function hrefForPage(pagePath, locale) {
  // Clean URLs for production / serve.py; keep trailing-slash-free.
  const page = pageForPath(pagePath);
  return localizedPath(pagePath, locale, page);
}

module.exports = {
  SITE_ORIGIN,
  LOCALES,
  DEFAULT_LOCALE,
  JOURNAL_PUBLIC,
  JOURNAL_IS_PUBLIC,
  journalIsPublic,
  PAGES,
  pageLocales,
  localizedPath,
  absoluteUrl,
  hrefForPage,
};
