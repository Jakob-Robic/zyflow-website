/**
 * Journal articles: slugs, routes, card mapping, related posts.
 */
const ARTICLE_REDIRECT_FROM = "/blog/e-bike-charging-at-hospitality-stops";

/** @typedef {"featured"|0|1|2|3} BlogCardRef */

/** @typedef {{ id: string, slug: string, card: BlogCardRef, featuredImage: string, related: string[] }} ArticleDef */

/** @type {ArticleDef[]} */
const ARTICLES = [
  {
    id: "blog-e-bike-charging-at-hospitality-stops",
    slug: "e-bike-charging-at-hospitality-stops",
    card: "featured",
    featuredImage: "./assets/images/journal/featured.jpg",
    related: ["what-makes-a-place-bike-friendly", "planning-your-first-battery-aware-day-ride"],
  },
  {
    id: "blog-planning-your-first-battery-aware-day-ride",
    slug: "planning-your-first-battery-aware-day-ride",
    card: 0,
    featuredImage: "./assets/images/journal/story-1.jpg",
    related: ["e-bike-charging-at-hospitality-stops", "reading-elevation-before-a-cross-border-ride"],
  },
  {
    id: "blog-what-makes-a-place-bike-friendly",
    slug: "what-makes-a-place-bike-friendly",
    card: 1,
    featuredImage: "./assets/images/journal/story-2.jpg",
    related: ["e-bike-charging-at-hospitality-stops", "zyflow-is-live-on-ios-and-android"],
  },
  {
    id: "blog-zyflow-is-live-on-ios-and-android",
    slug: "zyflow-is-live-on-ios-and-android",
    card: 2,
    featuredImage: "./assets/images/journal/story-3.jpg",
    related: ["what-makes-a-place-bike-friendly", "planning-your-first-battery-aware-day-ride"],
  },
  {
    id: "blog-reading-elevation-before-a-cross-border-ride",
    slug: "reading-elevation-before-a-cross-border-ride",
    card: 3,
    featuredImage: "./assets/images/journal/story-4.jpg",
    related: ["planning-your-first-battery-aware-day-ride", "e-bike-charging-at-hospitality-stops"],
  },
];

function articleBySlug(slug) {
  const found = ARTICLES.find((a) => a.slug === slug);
  if (!found) throw new Error(`Unknown article slug: ${slug}`);
  return found;
}

/** @returns {{ prefix: string, image: string }} */
function blogCardI18n(article) {
  if (article.card === "featured") {
    return { prefix: "blog.featured", image: "./assets/images/journal/featured.jpg" };
  }
  const idx = article.card;
  return {
    prefix: `blog.posts.${idx}`,
    image: `./assets/images/journal/story-${idx + 1}.jpg`,
  };
}

const ARTICLE_PAGES = ARTICLES.map((article) => ({
  id: article.id,
  file: "blog-article.html",
  out: `blog/${article.slug}.html`,
  path: `/blog/${article.slug}`,
  articleSlug: article.slug,
}));

module.exports = {
  ARTICLES,
  ARTICLE_PAGES,
  ARTICLE_REDIRECT_FROM,
  articleBySlug,
  blogCardI18n,
};
