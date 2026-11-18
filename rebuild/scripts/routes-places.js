/**
 * Routes ↔ Places (decided 2026-11-18).
 *
 * Two sections, one per question, tied together by links, not nesting:
 *   - "What do I ride?"  Routes: /tours list + flat /tours/<route> pages. Our described
 *     loops (content/featured-routes) and signed routes (content/signed-routes) both live here.
 *   - "Where do I go?"   Places: the /cycling tree (country › region › town), flat URLs,
 *     the hierarchy shown only in breadcrumbs and structured data.
 *
 * This module holds what both sides share:
 *   - one list of public routes with country, region, kind, length bucket and style
 *   - the route ↔ town matching (GPX against the town's municipality boundary)
 *   - breadcrumbs (visible markup + BreadcrumbList) for route and town pages
 *   - the /tours cards, filter groups and paging
 *   - the scaling checks the build runs (slug rules), see assertPlaceSlugs()
 *
 * Region level = the tourist region from content/blog/_taxonomy.yml. Country and region
 * landing pages do not exist yet; breadcrumbs show those levels as plain text until a
 * public page exists (PLACE_PAGES below stays empty until then).
 */
const fs = require("fs");
const path = require("path");
const YAML = require("yaml");
const { ROUTES } = require("./routes");
const towns = require("./towns");
const signed = require("./signed-routes");

const REBUILD_ROOT = path.join(__dirname, "..");
const REPO_ROOT = path.join(REBUILD_ROOT, "..");
const TAXONOMY_FILE = process.env.PLACES_TAXONOMY || path.join(REPO_ROOT, "content/blog/_taxonomy.yml");
const FEATURED_DIR = process.env.FEATURED_ROUTES_CONTENT || path.join(REPO_ROOT, "content/featured-routes/featured");
const LOCALES_DIR = path.join(REBUILD_ROOT, "locales");

/** /tours shows this many cards before "Show more". TOURS_PAGE_SIZE overrides it for one build (tests, preview). */
const TOURS_PAGE_SIZE = Number(process.env.TOURS_PAGE_SIZE) > 0 ? Number(process.env.TOURS_PAGE_SIZE) : 24;
/** Cards in the first row load their photo at once; the rest load lazily. */
const EAGER_CARDS = 3;

/** Length buckets for the /tours filter: [min, max) in km. Keys are the ?length= values. */
const LENGTH_BUCKETS = [
  { key: "under-30", min: 0, max: 30 },
  { key: "30-60", min: 30, max: 60 },
  { key: "60-100", min: 60, max: 100 },
  { key: "100-plus", min: 100, max: Infinity },
];

function lengthBucket(km) {
  const n = Number(km);
  if (!Number.isFinite(n) || n <= 0) return "";
  return (LENGTH_BUCKETS.find((b) => n >= b.min && n < b.max) || {}).key || "";
}

/**
 * Country and region landing pages that are public, by taxonomy id → path per language.
 * Empty on purpose: those pages need written content and a quality review first
 * (Jakob, 2026-11-18). Add an entry here when one ships and every breadcrumb links it.
 */
const PLACE_PAGES = {};

/** A route with no `kind` in the data: our described loops vs signed long-distance routes. */
const KINDS = ["signed", "loop"];

const esc = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** "Kranjska Gora" → "kranjska-gora"; "Sežana" → "sezana". */
function slugify(name) {
  return String(name || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/* ---------- strings ---------- */

function readLocale(lang) {
  const file = path.join(LOCALES_DIR, `${lang}.json`);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
}

const NAV = Object.fromEntries(
  ["en", "sl", "de"].map((lang) => {
    const links = ((readLocale(lang).chrome || {}).nav || {}).links || {};
    const en = ((readLocale("en").chrome || {}).nav || {}).links || {};
    return [lang, { home: links.home || en.home, routes: links.tours || en.tours, places: links.places || en.places }];
  })
);

const TEXT = {
  en: {
    crumbLabel: "Breadcrumb",
    routesHereTitle: "Routes from here",
    routesHereLead: (town) => `Routes with their own page on Zyflow that start in ${town.name} or ride through it.`,
    starts: "Starts here",
    passes: "Rides through",
    townsTitle: "Towns on this route",
    townsLead: "Where the route starts, and the towns it rides through that have their own page.",
    viewTown: "View town",
    signedPrice: (r) => `${r.km} km`,
    signedUnit: (r) => (r.climb ? ` · ${Number(r.climb).toLocaleString("en-GB")} m` : ""),
    signedKindLabel: "Signed route",
    viewRoute: "View route",
  },
  sl: {
    crumbLabel: "Drobtinice",
    routesHereTitle: "Poti od tod",
    routesHereLead: (town, where) => `Poti z lastno stranjo na Zyflowu, ki se začnejo ${where || `v kraju ${town.name}`} ali peljejo skozi.`,
    starts: "Začetek tukaj",
    passes: "Pelje skozi",
    townsTitle: "Kraji na tej poti",
    townsLead: "Kje se pot začne in skozi katere kraje z lastno stranjo pelje.",
    viewTown: "Poglej kraj",
    signedPrice: (r) => `${r.km} km`,
    signedUnit: (r) => (r.climb ? ` · ${Number(r.climb).toLocaleString("sl-SI")} m` : ""),
    signedKindLabel: "Označena pot",
    viewRoute: "Poglej pot",
  },
};
const text = (lang) => TEXT[lang] || TEXT.en;

/* ---------- taxonomy: country › region ---------- */

function loadTaxonomy(file = TAXONOMY_FILE) {
  if (!fs.existsSync(file)) return { countries: [] };
  const data = YAML.parse(fs.readFileSync(file, "utf8")) || {};
  return { countries: Array.isArray(data.countries) ? data.countries : [] };
}

function placeIndex(taxonomy) {
  const countries = new Map();
  const regions = new Map();
  const areas = new Map();
  for (const country of taxonomy.countries) {
    countries.set(country.id, country);
    for (const region of country.regions || []) {
      regions.set(region.id, { ...region, country: country.id });
      for (const area of region.areas || []) areas.set(area.id, { ...area, region: region.id, country: country.id });
    }
  }
  return { countries, regions, areas };
}

const PLACES = placeIndex(loadTaxonomy());

/**
 * Town data names Slovenia's statistical regions; the site's region level is the tourist
 * region from the taxonomy. Used only when the town is not an area in the taxonomy.
 * Posavska and Zasavska have no tourist region in the taxonomy yet: those towns
 * (Brežice) show no region level until one is added there.
 */
const STATISTICAL_TO_TOURIST = {
  Gorenjska: "gorenjska",
  Osrednjeslovenska: "osrednjeslovenska",
  "Goriška": "primorska",
  "Obalno-kraška": "primorska",
  "Primorsko-notranjska": "notranjska",
  Podravska: "stajerska",
  Savinjska: "stajerska",
  "Koroška": "koroska",
  "Jugovzhodna Slovenija": "dolenjska",
  Pomurska: "pomurje",
};

function countryIdOf(name, index = PLACES) {
  const id = slugify(name);
  if (index.countries.has(id)) return id;
  for (const country of index.countries.values()) {
    if (Object.values(country.label || {}).some((label) => slugify(label) === id)) return country.id;
  }
  return id;
}

/** { country, region } taxonomy ids for a town: the taxonomy area first, then the statistical region. */
function townPlace(town, index = PLACES) {
  const country = countryIdOf(town.country, index);
  const area = index.areas.get(town.slug);
  if (area && area.country === country) return { country, region: area.region };
  const region = STATISTICAL_TO_TOURIST[town.region] || "";
  return { country, region: index.regions.has(region) ? region : "" };
}

function placeLabel(kind, id, lang, index = PLACES) {
  const item = (kind === "country" ? index.countries : index.regions).get(id);
  if (!item) return id ? id.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase()) : "";
  return (item.label && (item.label[lang] || item.label.en)) || id;
}

/* ---------- geometry ---------- */

function parseGpx(xml) {
  const coords = [];
  const re = /<(?:trkpt|rtept)\s+([^>/]+)/g;
  let m;
  while ((m = re.exec(xml))) {
    const lat = /lat="([^"]+)"/.exec(m[1]);
    const lon = /lon="([^"]+)"/.exec(m[1]);
    if (!lat || !lon) continue;
    const la = parseFloat(lat[1]);
    const lo = parseFloat(lon[1]);
    if (Number.isFinite(la) && Number.isFinite(lo)) coords.push([lo, la]);
  }
  return coords;
}

function haversineKm(a, b) {
  const r = Math.PI / 180;
  const dLat = (b[1] - a[1]) * r;
  const dLon = (b[0] - a[0]) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

function inRing(pt, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Point in a GeoJSON Polygon or MultiPolygon (holes respected). */
function inArea(pt, geometry) {
  if (!geometry) return false;
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.type === "MultiPolygon" ? geometry.coordinates : [];
  return polygons.some((rings) => rings.length && inRing(pt, rings[0]) && !rings.slice(1).some((hole) => inRing(pt, hole)));
}

function bboxOf(geometry) {
  const box = [Infinity, Infinity, -Infinity, -Infinity];
  const walk = (c) => {
    if (typeof c[0] === "number") {
      box[0] = Math.min(box[0], c[0]);
      box[1] = Math.min(box[1], c[1]);
      box[2] = Math.max(box[2], c[0]);
      box[3] = Math.max(box[3], c[1]);
    } else c.forEach(walk);
  };
  if (geometry) walk(geometry.coordinates);
  return box;
}

/** A route counts as riding through a town when at least this much of it lies inside the boundary. */
const MIN_KM_INSIDE = 1;

/**
 * Where a line meets a town: does it start or end inside the town's boundary, and how many
 * km of it run inside (a segment counts when both its points are inside).
 */
function lineInTown(coords, town) {
  if (!coords.length || !town.boundary) return { starts: false, ends: false, kmInside: 0 };
  const box = town._bbox || (town._bbox = bboxOf(town.boundary));
  const inside = coords.map((pt) => pt[0] >= box[0] && pt[0] <= box[2] && pt[1] >= box[1] && pt[1] <= box[3] && inArea(pt, town.boundary));
  let km = 0;
  for (let i = 1; i < coords.length; i++) if (inside[i] && inside[i - 1]) km += haversineKm(coords[i - 1], coords[i]);
  return { starts: inside[0], ends: inside[inside.length - 1], kmInside: Math.round(km * 10) / 10 };
}

/**
 * Route ↔ town match from the data alone (testable): the GPX against the boundary, plus the
 * route's municipality and start/end place names. `featured` is the town data's own list
 * (the export job's answer), kept so a route never drops off a town it was on.
 */
function matchRouteToTown({ coords = [], municipality = "", startPlace = "", endPlace = "", slug = "" }, town) {
  const geo = lineInTown(coords, town);
  const names = [town.slug, town.area_code, slugify(town.name)].filter(Boolean);
  const startsByName = names.includes(slugify(startPlace)) || (!coords.length && names.includes(slugify(municipality)));
  const endsByName = names.includes(slugify(endPlace));
  const listed = (town.featured || []).some((r) => r.slug === slug);
  const starts = geo.starts || startsByName;
  const passes = geo.kmInside >= MIN_KM_INSIDE || listed || endsByName || geo.ends;
  if (!starts && !passes) return null;
  return { starts, passes: !starts && passes, kmInside: geo.kmInside };
}

/* ---------- routes ---------- */

function readMeta(slug) {
  const file = path.join(FEATURED_DIR, slug, "meta.txt");
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = /^([a-z_]+):\s*(.*)$/.exec(line.trim());
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

function gpxKm(coords) {
  let km = 0;
  for (let i = 1; i < coords.length; i++) km += haversineKm(coords[i - 1], coords[i]);
  return Math.round(km * 10) / 10;
}

const gpxCache = new Map();
function featuredCoords(route) {
  if (gpxCache.has(route.slug)) return gpxCache.get(route.slug);
  const file = route.gpx ? path.join(REBUILD_ROOT, route.gpx.replace(/^\.\//, "")) : "";
  const coords = file && fs.existsSync(file) ? parseGpx(fs.readFileSync(file, "utf8")) : [];
  gpxCache.set(route.slug, coords);
  return coords;
}

function townsArePublicDefault() {
  return require("./pages").TOWNS_ARE_PUBLIC;
}

/** Signed route lines are MultiLineStrings: one coordinate list per piece, start of the first piece first. */
function signedCoords(route) {
  const line = route.line || {};
  if (line.type === "LineString") return line.coordinates;
  if (line.type === "MultiLineString") return line.coordinates.flat();
  return [];
}

/**
 * Every public route as one list (featured loops first, then signed routes), with what
 * the /tours filters and the breadcrumbs need. langs = the languages its page exists in.
 */
function routeEntries({ townsPublic = townsArePublicDefault() } = {}) {
  const out = [];
  ROUTES.forEach((route, index) => {
    const meta = readMeta(route.slug);
    const country = countryIdOf(meta.country || "slovenia");
    const region = PLACES.regions.has(meta.region) ? meta.region : "";
    // The published figure; a route without one (k35) falls back to its GPX length for the filter.
    const km = parseFloat(route.distanceKm) || gpxKm(featuredCoords(route));
    out.push({
      slug: route.slug,
      source: "featured",
      index,
      kind: "loop",
      category: route.category,
      country,
      regions: region ? [region] : [],
      region,
      km,
      length: lengthBucket(km),
      municipality: meta.municipality || route.municipality,
      startPlace: meta.start_place || "",
      endPlace: meta.end_place || "",
      langs: ["en", "sl"],
      path: (lang) => (lang === "en" ? `/tours/${route.slug}` : `/${lang}/tours/${route.slug}`),
      // Described routes are one page per language under the locale prefix: link the English
      // file and let the build's link rewrite pick the page's language.
      href: () => `./tours/${route.slug}.html`,
      cover: route.cover,
      coords: () => featuredCoords(route),
    });
  });
  if (townsPublic) {
    for (const route of signed.ROUTES) {
      const langs = signed.routeLangs(route);
      if (!langs.length) continue;
      const routeTowns = (route.towns || []).map((t) => towns.TOWNS.find((x) => (x.area_code || x.slug) === t.area_code) || { slug: t.area_code, name: t.name, region: t.region, country: route.country });
      const regions = [...new Set(routeTowns.map((t) => townPlace(t).region).filter(Boolean))];
      out.push({
        slug: route.slug,
        source: "signed",
        kind: "signed",
        category: "",
        code: route.code || "",
        name: route.official_name,
        from: route.from,
        to: route.to,
        climb: route.climb_m,
        country: countryIdOf(route.country || "slovenia"),
        regions,
        region: regions[0] || "",
        km: Number(route.km),
        length: lengthBucket(route.km),
        signedTowns: route.towns || [],
        langs,
        path: (lang) => signed.routePath(route, lang),
        href: (lang) => fileHref(signed.routePath(route, lang)),
        cover: "",
        coords: () => signedCoords(route),
      });
    }
  }
  return out;
}

/** Towns with a public page in this language. */
function publicTowns(lang, { townsPublic = townsArePublicDefault() } = {}) {
  if (!townsPublic) return [];
  return towns.TOWNS.filter((town) => towns.townLangs(town).includes(lang));
}

const matchCache = new Map();

/** The towns a route starts in or rides through, that have a public page in this language. Start first, then along the route. */
function townsForRoute(entry, lang, opts = {}) {
  const key = `${entry.source}:${entry.slug}:${lang}:${opts.townsPublic}`;
  if (!matchCache.has(key)) matchCache.set(key, computeTownsForRoute(entry, lang, opts));
  return matchCache.get(key);
}

function computeTownsForRoute(entry, lang, opts) {
  const list = publicTowns(lang, opts);
  if (entry.source === "signed") {
    // Signed routes carry their towns from the data job (municipality boundary, in route order).
    return entry.signedTowns
      .map((t, i) => {
        const town = list.find((x) => (x.area_code || x.slug) === t.area_code);
        return town ? { town, starts: i === 0, passes: i !== 0, kmInside: t.km_inside, order: t.at_km } : null;
      })
      .filter(Boolean);
  }
  const coords = entry.coords();
  return list
    .map((town) => {
      const hit = matchRouteToTown({ coords, municipality: entry.municipality, startPlace: entry.startPlace, endPlace: entry.endPlace, slug: entry.slug }, town);
      if (!hit) return null;
      return { town, ...hit, order: hit.starts ? -1 : firstIndexInside(coords, town) };
    })
    .filter(Boolean)
    .sort((a, b) => a.order - b.order);
}

function firstIndexInside(coords, town) {
  const i = coords.findIndex((pt) => inArea(pt, town.boundary));
  return i === -1 ? Infinity : i;
}

/** Every public route (in this language) that starts in or rides through the town. */
function routesForTown(townSlug, lang, opts = {}) {
  return routeEntries(opts)
    .filter((entry) => entry.langs.includes(lang))
    .map((entry) => {
      const hit = townsForRoute(entry, lang, opts).find((m) => m.town.slug === townSlug);
      return hit ? { entry, starts: hit.starts } : null;
    })
    .filter(Boolean)
    .sort((a, b) => Number(b.starts) - Number(a.starts));
}

/* ---------- breadcrumbs ---------- */

/** href in the build's "./page.html" form so rewriteInternalLinks maps it to the clean URL. */
const fileHref = (p) => `.${p}.html`;

function placeCrumb(kind, id, lang) {
  if (!id) return null;
  const pagePath = PLACE_PAGES[id] && PLACE_PAGES[id][lang];
  return { name: placeLabel(kind, id, lang), path: pagePath || "" };
}

/** Home › Routes › Country › Region › Route. Levels without a public page are plain text. */
function routeCrumbs(entry, lang, name) {
  const nav = NAV[lang] || NAV.en;
  return [
    { name: nav.home, path: lang === "en" ? "/" : `/${lang}`, home: true },
    { name: nav.routes, path: lang === "en" ? "/tours" : `/${lang}/tours`, href: "./tours.html" },
    placeCrumb("country", entry.country, lang),
    placeCrumb("region", entry.region, lang),
    { name, path: entry.path(lang), href: entry.href(lang), current: true },
  ].filter(Boolean);
}

/** Home › Places › Country › Region › Town. */
function townCrumbs(town, lang) {
  const nav = NAV[lang] || NAV.en;
  const where = townPlace(town);
  return [
    { name: nav.home, path: lang === "en" ? "/" : `/${lang}`, home: true },
    { name: nav.places, path: towns.TOWN_BASE[lang] },
    placeCrumb("country", where.country, lang),
    placeCrumb("region", where.region, lang),
    { name: town.name, path: towns.townPath(town, lang), current: true },
  ].filter(Boolean);
}

/** The visible breadcrumb: an ordered list, every level with a page is a link, the page itself is aria-current. */
function renderCrumbs(items, lang, modifier = "") {
  const li = items
    .map((item, i) => {
      const sep = i ? '<span class="motif" aria-hidden="true"></span>' : "";
      if (item.current) return `<li class="crumbs__item">${sep}<span aria-current="page">${esc(item.name)}</span></li>`;
      if (!item.path) return `<li class="crumbs__item">${sep}<span>${esc(item.name)}</span></li>`;
      // Home is "./index.html" in every language: the build turns it into that language's home.
      const href = item.home ? "./index.html" : item.href || fileHref(item.path);
      return `<li class="crumbs__item">${sep}<a href="${esc(href)}">${esc(item.name)}</a></li>`;
    })
    .join("");
  return `<nav class="crumbs${modifier ? ` ${modifier}` : ""}" aria-label="${esc(text(lang).crumbLabel)}"><ol class="crumbs__list">${li}</ol></nav>`;
}

/**
 * BreadcrumbList for the same items. Google needs a URL on every level but the last, so a
 * level without a page (country, region today) is left out here; it joins the list the
 * day its page is public, together with the visible link.
 */
function crumbsLd(items, origin, id) {
  const linked = items.filter((item) => item.path);
  return {
    "@type": "BreadcrumbList",
    ...(id ? { "@id": id } : {}),
    itemListElement: linked.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: item.path === "/" ? `${origin}/` : `${origin}${item.path}`,
    })),
  };
}

/* ---------- cards ---------- */

const CARD_TEXT = { en: (readLocale("en").tours || {}).cards || [], sl: (readLocale("sl").tours || {}).cards || [] };

/**
 * The card's meta line: distance · climb · type, from tours.cards.<n>.meta0-2. A figure the
 * data does not have (Tržičanka's climb) is left out with its separator, never repeated.
 */
function cardMeta(idx, lang) {
  const card = (CARD_TEXT[lang] || CARD_TEXT.en)[idx] || {};
  return ["meta0", "meta1", "meta2"]
    .filter((key) => String(card[key] || "").trim())
    .map((key, i) => `${i ? '<span class="motif" aria-hidden="true"></span>' : ""}<span data-i18n="tours.cards.${idx}.${key}"></span>`)
    .join("");
}

/** Card for one route. Featured loops read their words from the locale (tours.cards.<n>); signed routes from their data. */
function renderRouteCard(entry, lang, { lazy = false, attrs = true, classes = "" } = {}) {
  const href = entry.href(lang);
  const loading = lazy ? ' loading="lazy" decoding="async"' : "";
  const data = attrs
    ? ` data-category="${esc(entry.category)}" data-country="${esc(entry.country)}" data-region="${esc(entry.regions.join(" "))}" data-kind="${esc(entry.kind)}" data-length="${esc(entry.length)}" data-km="${esc(entry.km)}"`
    : entry.category
      ? ` data-category="${esc(entry.category)}"`
      : "";
  const cls = `tour-card${classes ? ` ${classes}` : ""}`;
  if (entry.source === "featured") {
    const idx = entry.index;
    return `      <article class="${cls}"${data}>
        <div class="tour-card__media">
          <img src="${entry.cover}" alt=""${loading} />
          <div class="tour-card__loc">
            <div class="tour-card__pin"><img src="./assets/images/icons/location.svg" alt="" aria-hidden="true" /></div>
            <div class="tour-card__loc-text"><span data-i18n="tours.cards.${idx}.place"></span><span data-i18n="tours.cards.${idx}.region"></span></div>
          </div>
        </div>
        <div class="tour-card__body">
          <div>
            <h3 class="tour-card__name" data-i18n="tours.cards.${idx}.title"></h3>
            <div class="tour-card__meta">${cardMeta(idx, lang)}</div>
          </div>
          <p class="tour-card__desc" data-i18n="tours.cards.${idx}.body"></p>
          <div class="tour-card__foot">
            <p class="tour-card__price"><span data-i18n="tours.cards.${idx}.price"></span><span data-i18n="tours.cards.${idx}.unit"></span></p>
            <a class="tour-card__cta" href="${href}"><span data-i18n="tours.viewCta">View route</span> <img src="./assets/images/icons/arrow-right-sm.svg" alt="" aria-hidden="true" /></a>
          </div>
        </div>
      </article>`;
  }
  const t = text(lang);
  const title = entry.code ? `${entry.code}: ${entry.from} – ${entry.to}` : entry.name;
  const where = [placeLabel("region", entry.region, lang), placeLabel("country", entry.country, lang)].filter(Boolean).join(", ");
  return `      <article class="${cls}"${data}>
        <div class="tour-card__media tour-card__media--plain">
          <div class="tour-card__loc">
            <div class="tour-card__pin"><img src="./assets/images/icons/location.svg" alt="" aria-hidden="true" /></div>
            <div class="tour-card__loc-text"><span>${esc(`${entry.from} → ${entry.to}`)}</span><span>${esc(where)}</span></div>
          </div>
        </div>
        <div class="tour-card__body">
          <div>
            <h3 class="tour-card__name">${esc(title)}</h3>
            <div class="tour-card__meta"><span>${esc(`${entry.km} km`)}</span><span class="motif" aria-hidden="true"></span><span>${esc(t.signedKindLabel)}</span></div>
          </div>
          <p class="tour-card__desc">${esc(entry.name)}</p>
          <div class="tour-card__foot">
            <p class="tour-card__price"><span>${esc(t.signedPrice(entry))}</span><span>${esc(t.signedUnit(entry))}</span></p>
            <a class="tour-card__cta" href="${href}"><span>${esc(t.viewRoute)}</span> <img src="./assets/images/icons/arrow-right-sm.svg" alt="" aria-hidden="true" /></a>
          </div>
        </div>
      </article>`;
}

/* ---------- /tours: filter groups and the grid ---------- */

/** Options per filter group from the public routes in this language. A group shows only with 2+ options. */
function filterOptions(entries) {
  const count = (values) => [...new Set(values.filter(Boolean))];
  return {
    country: count(entries.map((e) => e.country)),
    region: count(entries.flatMap((e) => e.regions)),
    kind: KINDS.filter((k) => entries.some((e) => e.kind === k)),
    length: LENGTH_BUCKETS.map((b) => b.key).filter((k) => entries.some((e) => e.length === k)),
  };
}

const GROUP_LABEL_KEYS = { country: "tours.filters.country", region: "tours.filters.region", kind: "tours.filters.kind", length: "tours.filters.length" };

function optionLabel(group, value, lang) {
  if (group === "country") return { text: placeLabel("country", value, lang) };
  if (group === "region") return { text: placeLabel("region", value, lang) };
  return { key: `tours.filters.${group}Options.${value}` };
}

/**
 * The extra filter rows under the style buttons. Every group is rendered for the script to
 * read its valid values, but a group with fewer than two options stays hidden (one country
 * today): it appears by itself once routes in a second country are public.
 */
function renderFilterGroups(entries, lang) {
  const options = filterOptions(entries);
  const groups = ["country", "region", "kind", "length"].map((group) => {
    const values = options[group];
    const buttons = values
      .map((value) => {
        const label = optionLabel(group, value, lang);
        const inner = label.key ? ` data-i18n="${label.key}">${esc(value)}` : `>${esc(label.text)}`;
        return `<button type="button" class="blog-filters__btn tours-chip" data-tours-filter="${group}" data-value="${esc(value)}" aria-pressed="false"${inner}</button>`;
      })
      .join("");
    const all = `<button type="button" class="blog-filters__btn tours-chip is-active" data-tours-filter="${group}" data-value="" aria-pressed="true"><span data-i18n="tours.filter.all">All</span></button>`;
    return `<div class="blog-filters__group tours-filters__group" role="group" aria-labelledby="tours-filter-${group}"${values.length < 2 ? " hidden" : ""}>
        <p class="blog-filters__label" id="tours-filter-${group}" data-i18n="${GROUP_LABEL_KEYS[group]}">${group}</p>
        <div class="blog-filters__links tours-filters__links">${all}${buttons}</div>
      </div>`;
  });
  // The rows sit inside the hero's filter bar, after the type row.
  return groups.join("\n      ");
}

/** Every public route card, in HTML (all links crawlable). Cards after the first page are hidden until "Show more". */
function renderToursGridCards(entries, lang) {
  return entries
    .map((entry, i) => renderRouteCard(entry, lang, { lazy: i >= EAGER_CARDS, classes: i >= TOURS_PAGE_SIZE ? "is-paged-out" : "" }))
    .join("\n");
}

function routeEntriesFor(lang, opts) {
  return routeEntries(opts).filter((entry) => entry.langs.includes(lang));
}

function injectToursList(html, lang, opts = {}) {
  if (!html.includes("<!-- TOURS_GRID_CARDS -->")) return html;
  const entries = routeEntriesFor(lang, opts);
  return html
    .replace("<!-- TOURS_FILTER_GROUPS -->", renderFilterGroups(entries, lang))
    .replace("<!-- TOURS_GRID_CARDS -->", renderToursGridCards(entries, lang))
    .replaceAll("{{toursPageSize}}", String(TOURS_PAGE_SIZE))
    .replace("{{toursMoreHidden}}", entries.length > TOURS_PAGE_SIZE ? "" : " hidden");
}

/* ---------- cross-link blocks ---------- */

/** "Routes from here" on a town page: our routes that start in or ride through the town, as route cards. */
function renderRoutesFromHere(town, lang, cardSection, where = "") {
  const hits = routesForTown(town.slug, lang);
  if (!hits.length) return "";
  const t = text(lang);
  const cards = hits.map(({ entry }) => renderRouteCard(entry, lang, { lazy: true, attrs: false }));
  return cardSection({ id: "routes-here", title: t.routesHereTitle, lead: t.routesHereLead(town, where), cards, rail: cards.length > 3 });
}

/** "Towns on this route" on a described route page: the start town and the towns it rides through, linked. */
function renderTownsOnRoute(entry, lang) {
  const hits = townsForRoute(entry, lang);
  if (!hits.length) return "";
  const t = text(lang);
  const items = hits
    .map(({ town, starts }) => {
      const href = fileHref(towns.townPath(town, lang));
      return `          <li class="route-towns__item"><a class="route-towns__link" href="${esc(href)}"><span class="route-towns__name">${esc(town.name)}</span><span class="route-towns__role">${esc(starts ? t.starts : t.passes)}</span></a></li>`;
    })
    .join("\n");
  return `<section class="route-towns section" data-section="tour.towns" aria-labelledby="route-towns-title">
  <div class="container">
    <h2 class="route-towns__title" id="route-towns-title">${esc(t.townsTitle)}</h2>
    <p class="route-towns__lead">${esc(t.townsLead)}</p>
    <ul class="route-towns__list">
${items}
    </ul>
  </div>
</section>`;
}

function entryBySlug(slug, opts) {
  return routeEntries(opts).find((entry) => entry.slug === slug) || null;
}

/* ---------- scaling checks ---------- */

/**
 * Slug rules for going beyond Slovenia (checked on every build):
 *  (a) a place slug is its plain name; only on a collision does it get its region as a
 *      suffix (sveti-ivan-zelina). Two towns, two routes, or a town and a taxonomy place in
 *      another country with one slug fail the build, per language (a town may have its
 *      own slug per language: trieste / trst / triest in data.json "slugs").
 *  (b) route slugs share /tours: a described loop and a signed route never share one.
 *  (c) every town's tourist region must exist in the taxonomy when it is resolvable.
 * Returns a list of problems; the build throws on any.
 */
function placeSlugProblems({ townList = towns.TOWNS, routeList = null, index = PLACES, langs = ["en", "sl", "de"] } = {}) {
  const problems = [];
  const routesAll = routeList || [
    ...ROUTES.map((r) => ({ slug: r.slug, source: "featured" })),
    ...signed.ROUTES.map((r) => ({ slug: r.slug, source: "signed" })),
  ];
  const seenRoute = new Map();
  for (const route of routesAll) {
    if (seenRoute.has(route.slug)) {
      problems.push(`Route slug "${route.slug}" is used by two routes (${seenRoute.get(route.slug)} and ${route.source}); /tours/${route.slug} can only be one page.`);
    }
    seenRoute.set(route.slug, route.source);
  }
  for (const lang of langs) {
    const seen = new Map();
    for (const town of townList) {
      const slug = (town.slugs && town.slugs[lang]) || town.slug;
      const where = townPlace(town, index);
      if (seen.has(slug)) {
        const other = seen.get(slug);
        problems.push(
          `Town slug "${slug}" (${lang}) is used by ${other.name} (${other.country}) and ${town.name} (${where.country}). Keep the plain name for one and suffix the other with its region, e.g. "${slug}-${where.region || "region"}".`
        );
      }
      seen.set(slug, { name: town.name, country: where.country });
      const area = index.areas.get(slug);
      if (area && area.country !== where.country) {
        problems.push(`Town slug "${slug}" (${town.name}, ${where.country}) is also a taxonomy place in ${area.country}; suffix one with its region.`);
      }
    }
  }
  return problems;
}

function assertPlaceSlugs(opts) {
  const problems = placeSlugProblems(opts);
  if (problems.length) throw new Error(`Place and route slugs:\n  - ${problems.join("\n  - ")}`);
}

module.exports = {
  LENGTH_BUCKETS,
  TOURS_PAGE_SIZE,
  PLACE_PAGES,
  slugify,
  lengthBucket,
  loadTaxonomy,
  placeIndex,
  townPlace,
  placeLabel,
  parseGpx,
  inArea,
  lineInTown,
  matchRouteToTown,
  routeEntries,
  routeEntriesFor,
  entryBySlug,
  townsForRoute,
  routesForTown,
  routeCrumbs,
  townCrumbs,
  renderCrumbs,
  crumbsLd,
  renderRouteCard,
  cardMeta,
  renderFilterGroups,
  filterOptions,
  injectToursList,
  renderRoutesFromHere,
  renderTownsOnRoute,
  placeSlugProblems,
  assertPlaceSlugs,
};
