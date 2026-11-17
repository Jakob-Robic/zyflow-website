/**
 * Town pages ("Bled by bike"): one page per municipality, assembled from the
 * route page's parts (hero with map, fact boxes, article with side card,
 * cards, question list). Data comes from content/towns/<slug>/data.json,
 * written by the content-engine export; the site never reads the database.
 *
 * First version: English only, no structured data yet, and off by default
 * (TOWNS_PUBLIC in pages.js).
 */
const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.join(__dirname, "..", "..");
const TOWNS_DIR = process.env.TOWNS_CONTENT || path.join(REPO_ROOT, "content/towns");

const TOWN_BASE = { en: "/cycling", sl: "/sl/kolesarjenje", de: "/de/radfahren" };
/** Display order of the language switch. */
const TOWN_LANGS = ["en", "de", "sl"];
/**
 * A town page is built for a language only when its text file says
 * "status": "published". TOWNS_DRAFTS=true also builds drafts (local preview);
 * a production build (SITE_INDEX=true) refuses drafts.
 */
const SHOW_DRAFTS = process.env.TOWNS_DRAFTS === "true" || process.env.TOWNS_DRAFTS === "1";

const TEXT = {
  en: {
    crumb: "Cycling",
    hubEyebrow: "cycling by town",
    hubTitle: "Slovenian towns by bike",
    hubLede:
      "Pick a town and know where to ride, stay, eat and refill before you set off. Each page lists the signed cycle routes through it and the stops along them.",
    hubSeoTitle: "Cycling in Slovenia by town: routes and stops | Zyflow",
    hubSeoDescription: (n) =>
      `Cycling in Slovenia, town by town: signed cycle routes, places to stay and eat, water, repair and e-bike charging. ${n === 1 ? "1 town" : `${n} towns`} so far.`,
    hubQuals: (towns) => [
      towns.length === 1 ? "1 town so far" : `${towns.length} towns`,
      // A route that runs through several towns is one route.
      `${new Set(towns.flatMap((town) => town.routes.map((r) => r.id || `${r.code}|${r.name}`))).size} signed routes`,
      "Stays, food, water, repair",
      "Free on iOS & Android",
    ],
    hubTownMeta: (c) => [...(c.routes ? [plural(c.routes, "route")] : []), `${c.stays} stays`, `${c.food} places to eat`],
    hubWater: " · water points",
    viewTown: "View town",
    home: "Home",
    title: (t) => `${t.name} <br />by bike`,
    seoTitle: (t) => `Cycling in ${t.name}: routes, places to stay and eat | Zyflow`,
    seoDescription: (t) => {
      const codes = t.routes.filter((r) => r.code && r.level === "National route").map((r) => r.code);
      const named = codes.length ? `, including ${listAnd(codes.slice(0, 2))}` : "";
      const routes = t.counts.routes ? `${plural(t.counts.routes, "signed route")}${named}, ` : "";
      return `Cycling in ${t.name}: ${routes}${t.counts.stays} places to stay, ${t.counts.food} places to eat, water and repair points. Checked ${longDate(t.checked, "en")}.`;
    },
    lede: (t) =>
      `Know where to ride, stay, eat and refill in ${t.name}.`,
    // A town with no signed route leads with its places to stay.
    heroCount: (t) => (t.counts.routes ? plural(t.counts.routes, "route") : `${t.counts.stays} stays`),
    seeStays: "See where to stay",
    heroCountUnit: "",
    checkedLabel: "Last checked",
    checkedShort: (date) => `Checked ${date}`,
    heroEyebrow: (t) => `Cycling in ${t.name} · ${t.region}, ${t.country}`,
    // The numbers card on the photo hero: two short lines.
    heroCard: (t) =>
      t.counts.routes
        ? [`${plural(t.counts.routes, "route")} · ${t.counts.stays} stays`, `${t.counts.food} to eat · ${t.counts.water} water`]
        : [`${t.counts.stays} stays · ${t.counts.food} to eat`, `${t.counts.water} water points`],
    mapTitle: (t) => `${t.name} on the map`,
    mapLead: "Places to stay and eat, water, repair and the sights nearby.",
    getApp: "Get the app",
    seeRoutes: "See the routes",
    facts: {
      region: (t) => `${t.region}, ${t.country}`,
      routes: "Signed cycle routes",
      sights: "Sights",
      stays: "Places to stay",
      food: "Places to eat",
    },
    intro: (t) => {
      const named = t.routes
        .filter((r) => r.code)
        .slice(0, 2)
        .map((r) => `${r.level.toLowerCase()} ${r.code}${r.name && r.name !== r.code ? ` (${r.name})` : ""}`);
      const parts = [
        // With no signed route in the data, say nothing about routes (a gap in the map, not a fact).
        t.counts.routes === 0
          ? `${t.name} lies in ${t.region}, ${t.country}.`
          : t.counts.routes === 1
            ? `One signed cycle route runs through ${t.name}${named.length ? `: ${named[0]}` : ""}.`
            : `${cap(numberWord(t.counts.routes))} signed cycle routes run through ${t.name}${named.length ? `, among them ${named.join(" and ")}` : ""}.`,
        `The town and its villages have ${t.counts.stays} places to stay, ${t.counts.food} places to eat and ${t.counts.water} water points.`,
      ];
      if (!t.counts.chargers && t.nearest_charger) {
        parts.push(
          `The nearest e-bike charger is in ${t.nearest_charger.municipality}, ${km(t.nearest_charger.km)} away.`
        );
      }
      return parts.join(" ");
    },
    routesTitle: "Cycle routes",
    practicalTitle: "Water, repair, charging",
    inTotal: " · in total",
    total: "in total",
    inTown: (t) => ` · in ${t.name}`,
    mapped: (t) => ` · in ${t.name}`,
    routeVia: (stops) => `By way of ${listAnd(stops)}.`,
    routeDirect: (stops) => `Between ${stops[0]} and ${stops[1]}.`,
    routeNamed: "A long-distance route with its own signs.",
    routeLocal: "A local route with its own signs.",
    routeLoop: (r) =>
      `A loop from ${r.start}${{ road: ", for road bikes", trekking: ", for trekking bikes", mtb: ", for mountain bikes" }[r.bike] || ""}.`,
    routesLead: (t) => {
      const letters = [...new Set(t.routes.filter((r) => r.level === "Local route" && /^[A-Z]{1,2}[- ]?\d/.test(r.code || "")).map((r) => r.code[0]))];
      const local = letters.length ? `; codes starting with ${listOr(letters)} are local routes around ${t.name}` : "";
      return `Each route has its own colour on the map above. A letter and a number mark Slovenia's national cycle network${local}.`;
    },
    routeFromTo: (stops) =>
      stops.length > 2
        ? `From ${stops[0]} to ${stops[stops.length - 1]}, by way of ${listAnd(stops.slice(1, -1))}.`
        : `From ${stops[0]} to ${stops[1]}.`,
    ourRouteNote: "A full day, with the climb, the stops and the surface written up.",
    // Fallback lines for a town with no written text: only what holds for every town.
    staysLead: (t) => `${cap(numberWord(t.stays.length))} of ${t.name}'s ${t.counts.stays} places to stay, each with its own website.`,
    foodLead: (t) => `${cap(numberWord(t.food.length))} of ${t.name}'s ${t.counts.food} places to eat, each with its own website.`,
    fromRouteShort: (near) => [
      meters(near.m),
      near.route.length > 8 ? " · from a signed route" : ` · from route ${near.route}`,
    ],
    sightsLead: (t) =>
      `${cap(numberWord(t.sights.length))} of ${t.name}'s ${t.counts.sights} sights, each with the distance from the nearest signed route.`,
    routesNote:
      "Marked routes as mapped in OpenStreetMap. We have not ridden them; the signs on the ground decide.",
    ourRoute: "Described by Zyflow",
    viewRoute: "View route",
    routeMeta: (r, t) => [r.level, `${r.length_km} km in total`, `${r.km_inside} km in ${t.name}`],
    climb: "climb",
    staysTitle: "Where to stay",
    foodTitle: "Where to eat and stop",
    more: (n, what) => `${n} more ${what} in the app`,
    moreStays: "places to stay",
    moreFood: "places to eat",
    fromRoute: (near) => `${meters(near.m)} from route ${shortRoute(near.route)}`,
    website: "Website",
    waterTitle: "Water points",
    water: (t) =>
      `${t.name} has ${t.counts.water} public water points.${
        t.counts.routes ? ` ${cap(String(t.water_near_route))} of them ${t.water_near_route === 1 ? "is" : "are"} within 150 m of a signed cycle route.` : ""
      }`,
    repairTitle: "Bike repair",
    repair: (t) => {
      const out = [];
      if (t.repair.length) {
        out.push(
          `${t.name} has ${t.repair.length === 1 ? "one public bike repair station" : `${t.repair.length} repair points`}.`
        );
      } else {
        out.push(`${t.name} has no public repair point.`);
      }
      if (t.nearest_shop) {
        out.push(
          `The nearest bike shop is ${t.nearest_shop.name} in ${t.nearest_shop.municipality}, ${km(t.nearest_shop.km)} away.`
        );
      }
      return out.join(" ");
    },
    chargeTitle: "E-bike charging",
    charge: (t) =>
      t.counts.chargers
        ? `${t.name} has ${t.counts.chargers} e-bike chargers.`
        : t.nearest_charger
          ? `The nearest e-bike charger is at ${t.nearest_charger.name} in ${t.nearest_charger.municipality}, ${km(t.nearest_charger.km)} from ${t.name}.`
          : `${t.name} has no public e-bike charger.`,
    sightsTitle: "Worth a stop",
    moreSightsTitle: "more to see",
    photo: "Photo",
    asideTitle: (t) => `In ${t.name}:`,
    asideItems: (t) => [
      // No claim about routes where the map has none: that is a gap in the data, not a fact about the town.
      t.counts.routes ? plural(t.counts.routes, "signed cycle route") : plural(t.counts.sights, "sight"),
      `${t.counts.stays} places to stay`,
      `${t.counts.food} places to eat`,
      `${t.counts.water} water points`,
      t.counts.repair === 0 ? "No repair point" : plural(t.counts.repair, "repair point"),
      t.counts.chargers ? `${t.counts.chargers} e-bike chargers` : t.nearest_charger ? `Charger ${km(t.nearest_charger.km)} away` : "No e-bike charger",
    ],
    asideNote: "Full lists, opening hours and the map are in the app.",
    faqTitle: "Common questions",
    faq: (t) => [
      // No routes question for a town without a signed route; long lists name the first eight.
      ...(t.counts.routes
        ? [
            {
              q: `Which cycle routes pass through ${t.name}?`,
              a: `${cap(numberWord(t.counts.routes))} signed ${t.counts.routes === 1 ? "route" : "routes"}: ${listAnd([
                ...t.routes.slice(0, MAX_ROUTES_SHOWN).map((r) => {
                  const stops = r.name.split(STOPS).map((part) => part.trim());
                  if (r.code && stops.length > 1) return `${r.code} from ${stops[0]} to ${stops[stops.length - 1]}`;
                  return r.code && r.name !== r.code && !r.name.startsWith(r.code) ? `${r.code} (${r.name})` : r.name;
                }),
                ...(t.routes.length > MAX_ROUTES_SHOWN ? [`${t.routes.length - MAX_ROUTES_SHOWN} more`] : []),
              ])}.`,
            },
          ]
        : []),
      { q: `Where can I fill my water bottle in ${t.name}?`, a: TEXT.en.water(t) },
      { q: `Is there a bike repair shop in ${t.name}?`, a: TEXT.en.repair(t) },
      { q: `Where can I charge an e-bike in ${t.name}?`, a: TEXT.en.charge(t) },
    ],
    creditsTitle: "sources",
    credits: (t) =>
      `Last checked ${longDate(t.checked, "en")}. Map data © OpenStreetMap contributors.`,
    report: "Something wrong on this page?",
    reportLink: "Tell us",
  },
};

function esc(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function listAnd(items) {
  return items.length > 2 ? `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}` : items.join(" and ");
}

/** "1 route", "6 routes". */
function plural(n, noun) {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

function listOr(items) {
  return items.length > 1 ? `${items.slice(0, -1).join(", ")} or ${items[items.length - 1]}` : items[0];
}

/**
 * A town page shows at most this many signed routes: the data job lists
 * international, national and regional routes first, then local ones, each
 * level by kilometres inside the town. It is the number of route colours, so each line
 * on the map keeps a colour of its own. The rest are counted and left to the app.
 */
const MAX_ROUTES_SHOWN = 8;

/** "Koper–Sečovlje" lists stops; "EuroVelo 8 – Mediterranean Route" (spaced dash) is a title, not stops. */
const STOPS = /(?<! )–(?! )/;

function cap(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function numberWord(n) {
  const words = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
  return n >= 0 && n < words.length ? words[n] : String(n);
}

function km(value) {
  return `${Number(value).toFixed(value < 10 ? 1 : 0).replace(/\.0$/, "")} km`;
}

function meters(m) {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m / 10) * 10 || 10} m`;
}

/** Routes without a code carry long names; the row keeps the first part. */
function shortRoute(name) {
  return name.length > 28 ? name.split("–")[0].trim() : name;
}

function longDate(iso, locale) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString(locale === "en" ? "en-GB" : locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function shortDate(iso, locale) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString(locale === "en" ? "en-GB" : locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function loadTowns(dir = TOWNS_DIR) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("_"))
    .map((entry) => path.join(dir, entry.name, "data.json"))
    .filter((file) => fs.existsSync(file))
    .map((file) => {
      const town = JSON.parse(fs.readFileSync(file, "utf8"));
      // Written section texts per language (text.en.json …), read by a person before publishing.
      town.text = {};
      for (const lang of Object.keys(TEXT)) {
        const textFile = path.join(path.dirname(file), `text.${lang}.json`);
        if (fs.existsSync(textFile)) town.text[lang] = JSON.parse(fs.readFileSync(textFile, "utf8"));
      }
      // Photos chosen by a person (photos.json): the town's large photos, and sight photos
      // the encyclopedia does not have, keyed by the start of the sight's id. The export
      // job writes data.json only, so a data refresh never touches these.
      const photosFile = path.join(path.dirname(file), "photos.json");
      const chosen = fs.existsSync(photosFile) ? JSON.parse(fs.readFileSync(photosFile, "utf8")) : {};
      town.photos = chosen.photos || [];
      // The photo hero (the home page's hero) uses the town's chosen hero photo; a town
      // without one keeps the map hero. The hero photo is not repeated further down.
      town.heroPhoto = chosen.hero ? town.photos.find((p) => p.src === chosen.hero) || null : town.photos[0] || null;
      town.bodyPhotos = town.photos.filter((p) => p !== town.heroPhoto);
      for (const sight of town.sights) {
        const key = Object.keys(chosen.sights || {}).find((id) => String(sight.id || "").startsWith(id));
        if (!sight.image && key) sight.image = chosen.sights[key];
      }
      return town;
    })
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

const TOWNS = loadTowns();

function townBySlug(slug) {
  const town = TOWNS.find((t) => t.slug === slug);
  if (!town) throw new Error(`Unknown town: ${slug}`);
  return town;
}

function townLangs(town) {
  // A preview also builds a town nobody has written for yet, in English, with the generated lines.
  if (SHOW_DRAFTS && !Object.keys(town.text || {}).length) return ["en"];
  return TOWN_LANGS.filter((lang) => {
    const text = TEXT[lang] && town.text && town.text[lang];
    return text && (text.status === "published" || SHOW_DRAFTS);
  });
}

const townPath = (town, lang) => `${TOWN_BASE[lang]}/${(town.slugs && town.slugs[lang]) || town.slug}`;

function townPages() {
  const pages = [];
  // One hub per language that has at least one town: /cycling, /sl/kolesarjenje, /de/radfahren.
  const hubLangs = TOWN_LANGS.filter((lang) => TOWNS.some((town) => townLangs(town).includes(lang)));
  const hubAlternates = Object.fromEntries(hubLangs.map((lang) => [lang, TOWN_BASE[lang]]));
  for (const lang of hubLangs) {
    const listed = TOWNS.filter((town) => townLangs(town).includes(lang));
    const hubSwitch = { en: hubAlternates.en || "/", sl: hubAlternates.sl || "/sl" };
    if (hubAlternates.de) hubSwitch.de = hubAlternates.de;
    pages.push({
      id: `towns-hub-${lang}`,
      file: "towns.html",
      out: `${TOWN_BASE[lang].slice(1)}.html`,
      path: TOWN_BASE[lang],
      locales: [lang],
      localePrefix: false,
      indexable: true,
      townHub: true,
      townLang: lang,
      dateUpdated: listed.map((town) => town.checked).sort().pop(),
      langSwitch: hubSwitch,
      alternates: hubAlternates,
      seo: { title: TEXT[lang].hubSeoTitle, description: TEXT[lang].hubSeoDescription(listed.length) },
    });
  }
  for (const town of TOWNS) {
    const langs = townLangs(town);
    // hreflang lists only the languages this town is written in; build.js adds x-default.
    const alternates = Object.fromEntries(langs.map((lang) => [lang, townPath(town, lang)]));
    // The switch offers EN and SL like the rest of the site (plus DE once written);
    // a language without this town goes to that language's home page until the hubs exist.
    const langSwitch = { en: alternates.en || hubAlternates.en || "/", sl: alternates.sl || hubAlternates.sl || "/sl" };
    if (alternates.de) langSwitch.de = alternates.de;
    for (const lang of langs) {
      const pagePath = townPath(town, lang);
      pages.push({
        id: `town-${town.slug}-${lang}`,
        file: "town.html",
        out: `${pagePath.slice(1)}.html`,
        path: pagePath,
        locales: [lang],
        localePrefix: false,
        indexable: true,
        townSlug: town.slug,
        townLang: lang,
        dateUpdated: town.checked,
        langSwitch,
        alternates,
        seo: {
          title: TEXT[lang].seoTitle(town),
          description: TEXT[lang].seoDescription(town),
          // A 1200×630 crop of the hero photo (or the first sight photo), written by the build.
          ...(townOgSource(town) ? { ogImage: `/assets/images/og/towns/${town.slug}.jpg` } : {}),
        },
      });
    }
  }
  return pages;
}

/** Fail early on a town that must not be built the way it is. */
function assertTownsBuildable({ townsPublic, siteIndex }) {
  if (!townsPublic) return;
  if (!townPages().length) {
    throw new Error("TOWNS_PUBLIC is on but no town text is published. Set \"status\": \"published\" in content/towns/<town>/text.<lang>.json first.");
  }
  if (siteIndex && SHOW_DRAFTS) {
    throw new Error("Production build refuses TOWNS_DRAFTS: draft town texts must not go live.");
  }
}

/** The day the town's data was last checked: its sitemap lastmod. */
/** The picture a shared link shows: the hero photo, else the first sight photo. A path under rebuild/. */
function townOgSource(town) {
  const src = (town.heroPhoto && town.heroPhoto.src) || ((town.sights.find((x) => x.image) || {}).image || {}).src;
  return src ? src.replace(/^\.\//, "") : null;
}

/** Share-image crops for every town page: [{ slug, file }] with file relative to rebuild/. */
function townOgSources() {
  return TOWNS.filter((town) => townLangs(town).length && townOgSource(town)).map((town) => ({ slug: town.slug, file: townOgSource(town) }));
}

function townSitemapDate(page) {
  return page.townSlug || page.townHub ? page.dateUpdated || "" : null;
}

const SCHEMA_STAY = { Hotel: "Hotel", Guesthouse: "BedAndBreakfast", Hostel: "Hostel", Campsite: "Campground" };
const SCHEMA_FOOD = { Restaurant: "Restaurant", "Café": "CafeOrCoffeeShop" };

/** JSON-LD for a town page: breadcrumb, the town, its picks as lists, and the questions. */
function hubStructuredNodes(page, origin) {
  const lang = page.townLang;
  const t = TEXT[lang];
  const url = `${origin}${page.path}`;
  const listed = TOWNS.filter((town) => townLangs(town).includes(lang));
  return [
    {
      "@type": "CollectionPage",
      "@id": `${url}#webpage`,
      url,
      name: page.seo.title.replace(/ \| Zyflow$/, ""),
      description: page.seo.description,
      inLanguage: lang,
      publisher: { "@id": `${origin}/#organization` },
      breadcrumb: { "@id": `${url}#breadcrumb` },
    },
    {
      "@type": "BreadcrumbList",
      "@id": `${url}#breadcrumb`,
      itemListElement: [
        { "@type": "ListItem", position: 1, name: t.home, item: `${origin}/` },
        { "@type": "ListItem", position: 2, name: t.crumb, item: url },
      ],
    },
    {
      "@type": "ItemList",
      "@id": `${url}#towns`,
      numberOfItems: listed.length,
      itemListElement: listed.map((town, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: town.name,
        url: `${origin}${townPath(town, lang)}`,
      })),
    },
  ];
}

function townStructuredNodes(page, origin) {
  if (page.townHub) return hubStructuredNodes(page, origin);
  if (!page.townSlug) return null;
  const town = townBySlug(page.townSlug);
  const lang = page.townLang;
  const t = TEXT[lang];
  const written = (town.text && town.text[lang]) || {};
  const url = `${origin}${page.path}`;
  const abs = (src) => `${origin}${src.replace(/^\.\//, "/")}`;
  const geo = (item) => ({ "@type": "GeoCoordinates", latitude: item.lat, longitude: item.lon });
  const address = { "@type": "PostalAddress", addressLocality: town.name, addressCountry: "SI" };
  const imageNode = (image, id) => ({
    "@type": "ImageObject",
    ...(id ? { "@id": id } : {}),
    contentUrl: abs(image.src),
    ...(image.caption ? { caption: image.caption } : {}),
    creditText: image.author,
    creator: { "@type": "Person", name: image.author },
    ...(image.licence_url ? { license: image.licence_url } : {}),
    acquireLicensePage: image.source,
  });
  const list = (id, name, items) => ({
    "@type": "ItemList",
    "@id": `${url}#${id}`,
    name,
    numberOfItems: items.length,
    itemListElement: items.map((item, i) => ({ "@type": "ListItem", position: i + 1, item })),
  });
  const title = (key, fallback) => cap((written[key] && written[key].title) || fallback);
  const photo = (town.photos || [])[0];

  const nodes = [
    {
      "@type": "WebPage",
      "@id": `${url}#webpage`,
      url,
      name: page.seo.title.replace(/ \| Zyflow$/, ""),
      description: page.seo.description,
      inLanguage: lang,
      dateModified: town.checked,
      publisher: { "@id": `${origin}/#organization` },
      about: { "@id": `${url}#place` },
      breadcrumb: { "@id": `${url}#breadcrumb` },
      ...(photo ? { primaryImageOfPage: { "@id": `${url}#photo-1` } } : {}),
    },
    {
      "@type": "BreadcrumbList",
      "@id": `${url}#breadcrumb`,
      itemListElement: [
        { "@type": "ListItem", position: 1, name: t.home, item: `${origin}/` },
        { "@type": "ListItem", position: 2, name: t.crumb, item: `${origin}${TOWN_BASE[lang]}` },
        { "@type": "ListItem", position: 3, name: town.name, item: url },
      ],
    },
    {
      "@type": "TouristDestination",
      "@id": `${url}#place`,
      name: town.name,
      description: written.intro || t.intro(town),
      url,
      touristType: "Cyclists",
      geo: { "@type": "GeoCoordinates", latitude: town.center[1], longitude: town.center[0] },
      containedInPlace: {
        "@type": "AdministrativeArea",
        name: town.region,
        containedInPlace: { "@type": "Country", name: town.country },
      },
      ...(photo ? { image: { "@id": `${url}#photo-1` } } : {}),
    },
  ];
  if (photo) nodes.push(imageNode(photo, `${url}#photo-1`));

  nodes.push(
    list("routes", title("routes", t.routesTitle), [
      ...town.featured.map((route) => ({
        "@type": "TouristTrip",
        name: route.name,
        description: `${route.km} km, ${route.climb_m} m ${t.climb}`,
        url: `${origin}/tours/${route.slug}`,
      })),
      ...town.routes.map((route) => ({
        "@type": "TouristTrip",
        name: route.code && route.name !== route.code ? `${route.code} ${route.name}` : route.name,
        description: `${route.level}, ${route.length_km} km, ${route.km_inside} km in ${town.name}`,
        ...(route.website ? { url: route.website.url } : {}),
      })),
    ]),
    list("stays", title("stays", t.staysTitle), town.stays.map((place) => ({
      "@type": SCHEMA_STAY[place.kind] || "LodgingBusiness",
      name: place.name,
      ...(place.site ? { url: place.site.url } : {}),
      ...(aboutPlace(place, town, written, "") ? { description: aboutPlace(place, town, written, "") } : {}),
      geo: geo(place),
      address,
    }))),
    list("food", title("food", t.foodTitle), town.food.map((place) => ({
      "@type": SCHEMA_FOOD[place.kind] || "FoodEstablishment",
      name: place.name,
      ...(place.site ? { url: place.site.url } : {}),
      ...(aboutPlace(place, town, written, "") ? { description: aboutPlace(place, town, written, "") } : {}),
      geo: geo(place),
      address,
    }))),
    list("sights", title("sights", t.sightsTitle), town.sights.map((sight) => ({
      "@type": "TouristAttraction",
      name: sight.name,
      ...(sight.local_name && sight.local_name !== sight.name ? { alternateName: sight.local_name } : {}),
      ...(sight.about ? { description: cap(sight.about) } : {}),
      ...(sight.wiki ? { sameAs: sight.wiki } : {}),
      geo: geo(sight),
      ...(sight.image ? { image: imageNode(sight.image) } : {}),
    }))),
    {
      "@type": "FAQPage",
      "@id": `${url}#faq`,
      // Same strings the page shows, so markup and visible text cannot drift apart.
      mainEntity: t.faq(town).map((item) => ({
        "@type": "Question",
        name: item.q,
        acceptedAnswer: { "@type": "Answer", text: item.a },
      })),
    }
  );
  return nodes;
}

/** One line per published town for llms.txt. */
function townLlmsLines(origin) {
  return townPages()
    .filter((page) => page.townSlug && page.townLang === "en")
    .map((page) => {
      const town = townBySlug(page.townSlug);
      const c = town.counts;
      return `- [${town.name} by bike](${origin}${page.path}): ${plural(c.routes, "signed cycle route")}, ${c.stays} places to stay, ${c.food} places to eat, ${c.water} water points. Last checked ${town.checked}.`;
    });
}

/** A place or route row: name, a line of facts, an optional link out. */
function row({ name, facts, link, note, pin, image, color, credit }) {
  const meta = facts
    .filter(Boolean)
    .map(
      (fact, i) =>
        `<span class="town-row__fact">${i ? '<span class="motif" aria-hidden="true"></span>' : ""}<span>${esc(fact)}</span></span>`
    )
    .join("");
  const out = link
    ? `<a class="town-row__link" href="${esc(link.href)}"${link.external ? ' target="_blank" rel="noopener nofollow"' : ""}>${esc(link.label)} <img src="./assets/images/icons/arrow-right-sm.svg" alt="" aria-hidden="true" /></a>`
    : "";
  const lead = image
    ? `<img class="town-row__photo" src="${esc(image.src)}" alt="" loading="lazy" decoding="async" />`
    : pin
      ? `<img class="town-row__pin" src="./assets/design-system/map-pins/poi-${esc(pin)}@2x.png" alt="" aria-hidden="true" width="40" height="40" loading="lazy" />`
      : color
        ? `<span class="town-row__line" style="background:${esc(color)}" aria-hidden="true"></span>`
        : "";
  if (credit) note = note ? `${note} ${credit}` : credit;
  return `        <li class="town-row${lead ? " town-row--lead" : ""}">
          ${lead}
          <div class="town-row__text">
            <h3 class="town-row__name">${esc(name)}</h3>
            <p class="town-row__meta">${meta}</p>${note ? `\n            <p class="town-row__note">${esc(note)}</p>` : ""}
          </div>
          ${out}
        </li>`;
}

const PIN_FILES = new Set(["accommodation", "restaurant", "cafe", "food", "attraction", "historic", "viewpoint", "cave", "gorge", "waterfall", "bicycle_repair"]);

function placeRow(place, t) {
  return row({
    name: place.name,
    facts: [place.kind, place.hours, ...(place.extras || []), place.near ? t.fromRoute(place.near) : ""],
    link: place.site ? { href: place.site.url, label: place.site.label, external: true } : null,
    pin: PIN_FILES.has(place.pin) ? place.pin : "unknown",
    image: place.image,
    credit: place.image ? `${t.photo}: ${place.image.author}, ${place.image.licence}.` : "",
  });
}

/**
 * The route card without its photo: a lead mark (map pin or route colour),
 * name, a line of facts, a short description, and a foot with one figure and a link.
 */
function infoCard({ pin, color, name, facts = [], desc, value = "", unit = "", link }) {
  const meta = facts
    .filter(Boolean)
    .map(
      (fact, i) =>
        `<span class="town-row__fact">${i ? '<span class="motif" aria-hidden="true"></span>' : ""}<span>${esc(fact)}</span></span>`
    )
    .join("");
  const lead = pin
    ? `<svg class="town-place__icon" width="24" height="24" aria-hidden="true" focusable="false"><use href="./assets/design-system/icons/sprite.svg#zy-line-${iconFor(pin)}"/></svg>`
    : color
      ? `<span class="town-place__line" style="background:${esc(color)}" aria-hidden="true"></span>`
      : "";
  const cta = link
    ? `<a class="tour-card__cta" href="${esc(link.href)}"${link.name ? ` aria-label="${esc(link.name)}"` : ""}${link.external ? ' target="_blank" rel="noopener nofollow"' : ""}><span>${esc(link.label)}</span> <img src="./assets/images/icons/arrow-right-sm.svg" alt="" aria-hidden="true" width="18" height="18" /></a>`
    : "";
  return `      <article class="tour-card town-place">
        <div class="tour-card__body">
          <div class="town-place__head">
            ${lead}
            <div>
              <h3 class="tour-card__name">${esc(name)}</h3>
              ${meta ? `<div class="tour-card__meta town-place__meta">${meta}</div>` : ""}
            </div>
          </div>
          ${desc ? `<p class="tour-card__desc town-place__desc">${esc(desc)}</p>` : ""}
          ${value || cta ? `<div class="tour-card__foot"><p class="tour-card__price">${esc(value)}<span>${esc(unit)}</span></p>${cta}</div>` : ""}
        </div>
      </article>`;
}

/**
 * Place type → design-system line icon (Untitled UI line, 24 grid, currentColor).
 * Same pairs as design-system/tokens/poi.json; "route" marks a described route.
 */
const TYPE_ICONS = {
  accommodation: "bed",
  restaurant: "utensils",
  food: "utensils",
  cafe: "coffee",
  historic: "bank",
  attraction: "star",
  viewpoint: "eye",
  cave: "mountain",
  gorge: "mountain",
  waterfall: "drop",
  water_point: "drop",
  bicycle_repair: "tool",
  bicycle_shop: "bicycle",
  charging_station: "zap",
  route: "route",
};
const iconFor = (type) => TYPE_ICONS[type] || "marker-pin";
const pinFor = (type) => type || "unknown";

function placeCard(place, t) {
  const [value, unit] = place.near ? t.fromRouteShort(place.near) : ["", ""];
  return infoCard({
    pin: pinFor(place.pin),
    name: place.name,
    // One fact line only: opening hours where we have them, otherwise the type.
    facts: [place.hours || place.kind],
    desc: place.about || (place.aboutShort ? `${cap(place.aboutShort)}.` : `${place.kind} in the municipality.`),
    value,
    unit,
    link: place.site
      ? {
          href: place.site.url,
          label: /(^|\.)facebook\.com$/.test(place.site.label) ? "Facebook" : t.website,
          name: `${place.name}: ${place.site.label}`,
          external: true,
        }
      : null,
  });
}

/**
 * A titled block of cards. `rail: true` lays the cards out as one swipe row
 * with arrows at every width; otherwise they are a grid on desktop and a
 * swipe row on phones. Every card stays in the page either way.
 */
function cardSection({ id, title, lead, cards, after = "", rail = false, written, before = "" }) {
  if (written) {
    title = written.title || title;
    lead = written.body || lead;
  }
  const arrows = `<div class="town-rail__arrows${rail ? "" : " town-rail__arrows--phone"}">
            <button class="town-rail__arrow town-rail__arrow--prev" type="button" aria-label="Previous" aria-controls="${id}-row" data-rail-prev disabled></button>
            <button class="town-rail__arrow" type="button" aria-label="Next" aria-controls="${id}-row" data-rail-next></button>
          </div>`;
  return `      <div class="town-block" id="${id}" data-section="town.${id}" data-rail>
        <h2 class="town-block__title" id="${id}-title">${esc(title)}</h2>
        ${lead ? `<p class="town-lead${written ? " town-answer" : ""}">${esc(lead)}</p>` : ""}${before}
        <div class="adventures__grid town-block__grid ${rail ? "town-rail" : "town-rail--phone"}" id="${id}-row" data-rail-track tabindex="0" role="group" aria-labelledby="${id}-title">
${cards.join("\n")}
        </div>
        <div class="town-rail__nav${rail ? "" : " town-rail__nav--phone"}">
          <span class="town-rail__count" data-rail-count aria-hidden="true"></span>
          ${arrows}
        </div>${after}
      </div>`;
}

/** A place's one-line description: the written line for its id ("places" in text.<lang>.json), or its type and town. */
function aboutPlace(place, town, written, fallback = `${place.kind} in ${town.name}.`) {
  const lines = (written && written.places) || {};
  const key = Object.keys(lines).find((id) => id !== "_note" && String(place.id || "").startsWith(id));
  return key ? lines[key] : fallback;
}

function renderPlaces(town, t, key, title, lead, total, what, written, lines) {
  const places = town[key].map((place) => ({ ...place, about: aboutPlace(place, town, lines) }));
  if (!places.length) return "";
  const after =
    total > places.length
      ? `\n    <p class="town-more--cards"><a class="link link--arrow" href="{{appStoreUrl}}" data-app-modal-open>${esc(t.more(total - places.length, what))}</a></p>`
      : "";
  return cardSection({ id: key, title, lead, cards: places.map((place) => placeCard(place, t)), after, written });
}

/** "Photo: author, licence", with the photo page and the licence each linked (CC attribution). */
function photoCredit(image, t) {
  const author = `<a href="${esc(image.source)}" target="_blank" rel="noopener nofollow">${esc(image.author)}</a>`;
  const licence = image.licence_url
    ? `<a href="${esc(image.licence_url)}" target="_blank" rel="license noopener nofollow">${esc(image.licence)}</a>`
    : esc(image.licence);
  return `${esc(t.photo)}: ${author}, ${licence}`;
}

function sightCard(sight, town, t) {
  const credit = `${t.photo}: ${sight.image.author}, ${sight.image.licence}`;
  return `      <article class="tour-card town-sight">
        <div class="tour-card__media">
          <img src="${esc(sight.image.src)}" alt="${esc(`${sight.name}, ${town.name}`)}" loading="lazy" decoding="async" />
          <div class="tour-card__loc">
            <div class="tour-card__pin"><img src="./assets/images/icons/location.svg" alt="" aria-hidden="true" /></div>
            <div class="tour-card__loc-text"><span>${esc(town.name)}</span><span>${esc(sight.kind)}</span></div>
          </div>
        </div>
        <div class="tour-card__body">
          <div>
            <h3 class="tour-card__name">${esc(sight.name)}</h3>
            <div class="tour-card__meta"><span>${esc(sight.near ? t.fromRoute(sight.near) : sight.kind)}</span></div>
          </div>
          <p class="tour-card__desc">${esc(sight.about ? cap(sight.about) : "")}</p>
          <p class="town-sight__credit">${photoCredit(sight.image, t)}</p>
        </div>
      </article>`;
}

function mapJson(town) {
  const pins = [];
  for (const group of [town.stays, town.food, town.sights, town.repair]) {
    for (const place of group) {
      pins.push({ type: place.pin || place.type, name: place.name, coordinates: [place.lon, place.lat] });
    }
  }
  const routes = [];
  for (const route of town.routes.slice(0, MAX_ROUTES_SHOWN)) {
    if (!route.line) continue;
    const lines = route.line.type === "LineString" ? [route.line.coordinates] : route.line.coordinates;
    routes.push({ color: route.color, name: route.code || route.name, lines });
  }
  return JSON.stringify({ town: true, routes, pins, bounds: town.bounds });
}

function mapMedia(town) {
  return `<div class="tour-hero__media tour-hero__media--map">
        <div class="tour-hero__map" id="tour-hero-map" data-tour-map data-slug="town-${esc(town.slug)}" role="region" aria-label="${esc(`Map of ${town.name} with signed cycle routes and stops`)}"></div>
        <script type="application/json" data-tour-route-json>${mapJson(town).replace(/</g, "\\u003c")}</script>
      </div>`;
}

/** The home page's hero (sections/home/hero.html, styles in home.css) filled with the town. */
function renderPhotoHero(town, t, lang) {
  const written = (town.text && town.text[lang]) || {};
  const photo = town.heroPhoto;
  const thumb = (town.bodyPhotos || [])[0];
  const sub = [firstSentences(written.intro || t.intro(town), 1), written.lede || t.lede(town)].filter(Boolean).join(" ");
  const [line1, line2] = t.heroCard(town);
  const toRoutes = town.routes.length || town.featured.length;
  return `<section class="hero section town-hero" data-section="town.hero">
  <div class="hero__frame">
    <div class="hero__media">
      <img src="${esc(photo.src)}" alt="${esc(photo.caption)}" fetchpriority="high" />
      <div class="hero__scrim"></div>
    </div>
    <div class="hero__content">
      <div class="hero__head">
        <h1 class="hero__h1">${esc(t.heroEyebrow(town))}</h1>
        <p class="hero__title">${t.title({ ...town, name: esc(town.name) })}</p>
      </div>
      <p class="hero__sub">${esc(sub)}</p>
      <a class="btn btn--primary" href="${toRoutes ? "#routes" : "#map"}">${esc(toRoutes ? t.seeRoutes : t.seeStays)}</a>
    </div>
    <aside class="hero__card">${thumb ? `
      <div class="hero__card-media"><img class="hero__card-thumb" src="${esc(thumb.src)}" alt="" loading="lazy" /></div>` : ""}
      <div class="hero__card-body">
        <div class="hero__card-label"><span class="motif" aria-hidden="true"></span><span>${esc(t.checkedShort(shortDate(town.checked, lang)))}</span></div>
        <div>
          <p class="hero__card-title">${esc(line1)}</p>
          <p class="hero__card-date">${esc(line2)}</p>
        </div>
      </div>
    </aside>
  </div>
  <p class="town-hero__credit">${esc(photo.caption)} ${photoCredit(photo, t)}</p>
</section>`;
}

function renderHero(town, t, lang) {
  if (town.heroPhoto) return renderPhotoHero(town, t, lang);
  const written = (town.text && town.text[lang]) || {};
  return `<section class="tour-hero section" data-section="town.hero">
  <div class="container">
    <div class="tour-hero__panel">
      <div class="tour-hero__copy">
        <nav class="tour-hero__crumb" aria-label="Breadcrumb">
          <a href="./index.html">${esc(t.home)}</a>
          <span class="motif" aria-hidden="true"></span>
          <a href=".${TOWN_BASE[lang]}.html">${esc(t.crumb)}</a>
          <span class="motif" aria-hidden="true"></span>
          <span>${esc(town.country)}</span>
          <span class="motif" aria-hidden="true"></span>
          <span aria-current="page">${esc(town.name)}</span>
        </nav>
        <h1 class="tour-hero__title">${t.title({ ...town, name: esc(town.name) })}</h1>
        <p class="tour-hero__lede">${esc(written.lede || t.lede(town))}</p>
        <div class="tour-hero__foot">
          <p class="tour-hero__price"><span>${esc(t.heroCount(town))}</span><span>${esc(t.heroCountUnit)}</span></p>
          <div class="tour-hero__cta">
            <div class="tour-hero__next">
              <span>${esc(t.checkedLabel)}</span>
              <strong>${esc(shortDate(town.checked, lang))}</strong>
            </div>
            <a class="btn btn--primary" href="{{appStoreUrl}}" data-app-modal-open>${esc(t.getApp)}</a>
            <a class="btn btn--secondary" href="${town.routes.length || town.featured.length ? "#routes" : "#stays"}">${esc(town.routes.length || town.featured.length ? t.seeRoutes : t.seeStays)}</a>
          </div>
        </div>
      </div>
      ${mapMedia(town)}
    </div>

    <div class="tour-meta">
      <div class="tour-meta__box tour-meta__box--accent">
        <p class="tour-meta__value">${esc(town.name)}</p>
        <p class="tour-meta__label"><img src="./assets/images/icons/location.svg" alt="" aria-hidden="true" width="18" height="18" /><span>${esc(t.facts.region(town))}</span></p>
      </div>
      <div class="tour-meta__box">
        <p class="tour-meta__value">${town.counts.routes || town.counts.sights}</p>
        <p class="tour-meta__label"><span class="motif" aria-hidden="true"></span><span>${esc(town.counts.routes ? t.facts.routes : t.facts.sights)}</span></p>
      </div>
      <div class="tour-meta__box">
        <p class="tour-meta__value">${town.counts.stays}</p>
        <p class="tour-meta__label"><span class="motif" aria-hidden="true"></span><span>${esc(t.facts.stays)}</span></p>
      </div>
      <div class="tour-meta__box">
        <p class="tour-meta__value">${town.counts.food}</p>
        <p class="tour-meta__label"><span class="motif" aria-hidden="true"></span><span>${esc(t.facts.food)}</span></p>
      </div>
    </div>
  </div>
</section>`;
}

/** "View route" for a signed route that has its own page (required lazily: that module builds on this one). */
function signedRouteLink(route, t, lang) {
  if (!route.code) return null;
  const href = require("./signed-routes").signedRouteHref(route.code, lang, route.name);
  return href ? { href, label: t.viewRoute, name: `${t.viewRoute}: ${route.code}` } : null;
}

/** A town photo between sections, with its caption and credit (the route page's figure). */
function photoFigure(town, index, t) {
  const photo = (town.bodyPhotos || town.photos || [])[index];
  if (!photo) return "";
  return `      <figure class="tour-article__figure town-figure">
        <img src="${esc(photo.src)}" alt="${esc(photo.caption)}" loading="lazy" decoding="async" />
        <figcaption class="town-figure__caption">${esc(photo.caption)} ${photoCredit(photo, t)}</figcaption>
      </figure>`;
}

function renderBody(town, t, lang) {
  const written = (town.text && town.text[lang]) || {};
  const featured = town.featured.map((route) =>
    infoCard({
      pin: "route",
      name: route.name,
      facts: [t.ourRoute],
      desc: t.ourRouteNote,
      value: `${route.km} km`,
      unit: t.inTotal,
      link: { href: `./tours/${route.slug}.html`, label: t.viewRoute },
    })
  );
  const signed = town.routes.slice(0, MAX_ROUTES_SHOWN).map((route) => {
    const stops = route.name.split(STOPS).map((part) => part.trim());
    const coded = route.code && stops.length > 1;
    return infoCard({
      color: route.color,
      // A route with a code and a one-part name (K13, "Dragonja valley") shows both.
      name: coded
        ? `${route.code} · ${stops[0]} to ${stops[stops.length - 1]}`
        : route.code && route.name !== route.code && !route.name.startsWith(route.code)
          ? `${route.code} · ${route.name}`
          : route.name,
      facts: [`${route.level}, ${route.length_km} km`],
      desc:
        coded && stops.length > 2
          ? t.routeVia(stops.slice(1, -1))
          : coded
            ? t.routeDirect(stops)
            : route.loop && route.start
              ? t.routeLoop(route)
              : route.level === "Local route"
                ? t.routeLocal
                : t.routeNamed,
      value: `${route.km_inside} km`,
      unit: t.inTown(town),
      link: signedRouteLink(route, t, lang)
        || (route.website
          ? { href: route.website.url, label: t.website, name: `${route.name}: ${route.website.label}`, external: true }
          : null),
    });
  });
  const hiddenRoutes = town.routes.length - Math.min(town.routes.length, MAX_ROUTES_SHOWN);
  // No routes section at all for a town with neither a signed nor a described route.
  const routes = featured.length + signed.length
    ? cardSection({
        id: "routes",
        title: t.routesTitle,
        lead: t.routesLead(town),
        cards: [...featured, ...signed],
        rail: true,
        written: written.routes,
        before: town.heroPhoto ? `\n        <div class="town-map">${mapMedia(town)}</div>` : "",
        after: hiddenRoutes
          ? `\n        <p class="town-more--cards"><a class="link link--arrow" href="{{appStoreUrl}}" data-app-modal-open>${esc(t.more(hiddenRoutes, "signed routes"))}</a></p>`
          : "",
      })
    : "";

  // A photo-hero town with no route section still needs its map: a block of its own.
  const mapBlock =
    town.heroPhoto && !routes
      ? `      <div class="town-block" id="map" data-section="town.map">
        <h2 class="town-block__title">${esc(t.mapTitle(town))}</h2>
        <p class="town-lead">${esc(t.mapLead)}</p>
        <div class="town-map">${mapMedia(town)}</div>
      </div>`
      : "";
  const blocks = [
    mapBlock,
    routes,
    photoFigure(town, 1, t),
    renderPlaces(town, t, "stays", t.staysTitle, t.staysLead(town), town.counts.stays, t.moreStays, written.stays, written),
    renderPlaces(town, t, "food", t.foodTitle, t.foodLead(town), town.counts.food, t.moreFood, written.food, written),
    photoFigure(town, 2, t),
    renderPractical(town, t, written.practical),
    renderSights(town, t, written.sights),
  ].filter(Boolean);

  return `<section class="tour-body section town-body" data-section="town.body">
  <div class="container tour-body__layout">
    <div class="town-main">
      <p class="town-intro__text">${esc(written.intro || t.intro(town))}</p>
${photoFigure(town, 0, t)}
    </div>

    <aside class="tour-aside">
      <div class="tour-aside__card">
        <p class="tour-aside__title">${esc(t.asideTitle(town))}</p>
        <ul class="tour-aside__list">
${t
  .asideItems(town)
  .map((item) => `          <li><span class="motif" aria-hidden="true"></span><span>${esc(item)}</span></li>`)
  .join("\n")}
        </ul>
        <div class="tour-aside__actions">
          <a class="btn btn--primary tour-aside__cta" href="{{appStoreUrl}}" data-app-modal-open>${esc(t.getApp)}</a>
        </div>
        <p class="tour-aside__note">${esc(t.asideNote)}</p>
      </div>
    </aside>
  </div>
</section>
<section class="section town-wide" data-section="town.sections">
  <div class="container">
${blocks.join("\n")}
  </div>
</section>`;
}

function renderPractical(town, t, written) {
  return cardSection({
    id: "practical",
    title: t.practicalTitle,
    written,
    cards: [
      // With a written paragraph above, the cards keep only their figure: the sentence would repeat it.
      infoCard({ pin: "water_point", name: t.waterTitle, desc: written ? "" : t.water(town), value: String(town.counts.water), unit: t.mapped(town) }),
      infoCard({ pin: "bicycle_repair", name: t.repairTitle, desc: written ? "" : t.repair(town), value: String(town.counts.repair), unit: t.mapped(town) }),
      infoCard({ pin: "charging_station", name: t.chargeTitle, desc: written ? "" : t.charge(town), value: String(town.counts.chargers), unit: t.mapped(town) }),
    ],
  });
}

function renderSights(town, t, written) {
  if (!town.sights.length) return "";
  const cards = town.sights.map((sight) =>
    sight.image
      ? sightCard(sight, town, t)
      : placeCard({ name: sight.name, kind: sight.kind, pin: sight.pin, near: sight.near, aboutShort: sight.about }, t)
  );
  return cardSection({ id: "sights", title: t.sightsTitle, lead: t.sightsLead(town), cards, rail: true, written });
}

function renderFaq(town, t) {
  const items = t.faq(town);
  return `<section class="faq faq--town section" id="faq" data-section="town.faq">
  <div class="faq__inner">
    <h2 class="faq__title">${esc(t.faqTitle)}</h2>
    <div class="faq__list">
${items
  .map(
    (item, i) => `      <div class="faq__item${i === 0 ? " is-open" : ""}">
        <h3 class="faq__heading"><button class="faq__q" type="button" aria-expanded="${i === 0 ? "true" : "false"}"><span>${esc(item.q)}</span><span class="motif" aria-hidden="true"></span></button></h3>
        <div class="faq__panel">
          <p class="faq__a">${esc(item.a)}</p>
        </div>
      </div>`
  )
  .join("\n")}
    </div>
    <p class="faq__foot">
      <span data-i18n="home.faq.footnote">If you have any further questions, reach out to our team.</span>
      <a class="link" href="./contact.html#message" data-i18n="home.faq.contactLink">Contact us</a>
    </p>
    <p class="town-credits">${esc(t.credits(town))}</p>
  </div>
</section>`;
}

/** The hub: the routes list page's hero and card grid, with one card per town. */
function renderHub(page) {
  const lang = page.townLang;
  const t = TEXT[lang];
  const listed = TOWNS.filter((town) => townLangs(town).includes(lang));
  const cards = listed.map((town) => {
    const written = (town.text && town.text[lang]) || {};
    // A chosen town photo where there is one; otherwise the best-known sight's photo.
    const sight = town.sights.find((item) => item.image);
    const photo = (town.photos || [])[0] || (sight ? { ...sight.image, caption: `${sight.name}, ${town.name}` } : null);
    const meta = t
      .hubTownMeta(town.counts)
      .map((fact, i) => `${i ? '<span class="motif" aria-hidden="true"></span>' : ""}<span>${esc(fact)}</span>`)
      .join("");
    const href = `.${townPath(town, lang)}.html`;
    return `      <article class="tour-card">
        <div class="tour-card__media">
          ${photo ? `<img src="${esc(photo.src)}" alt="${esc(photo.caption)}" loading="lazy" decoding="async" />` : ""}
          <div class="tour-card__loc">
            <div class="tour-card__pin"><img src="./assets/images/icons/location.svg" alt="" aria-hidden="true" width="18" height="18" /></div>
            <div class="tour-card__loc-text"><span>${esc(town.region)}</span><span>${esc(town.country)}</span></div>
          </div>
        </div>
        <div class="tour-card__body">
          <div>
            <h3 class="tour-card__name"><a href="${href}">${esc(town.name)}</a></h3>
            <div class="tour-card__meta">${meta}</div>
          </div>
          <p class="tour-card__desc">${esc(firstSentences(written.intro || t.intro(town), 2))}</p>
          <div class="tour-card__foot">
            <p class="tour-card__price">${town.counts.water}<span>${esc(t.hubWater)}</span></p>
            <a class="tour-card__cta" href="${href}" aria-label="${esc(`${t.viewTown}: ${town.name}`)}"><span>${esc(t.viewTown)}</span> <img src="./assets/images/icons/arrow-right-sm.svg" alt="" aria-hidden="true" width="18" height="18" /></a>
          </div>
        </div>
      </article>`;
  });
  return `<section class="tours-hero section" data-section="towns.hero">
  <div class="tours-hero__glow" aria-hidden="true">
    <img src="./assets/images/home/map-contours-featured.svg" alt="" aria-hidden="true" />
  </div>
  <div class="container">
    <div class="tours-hero__top">
      <div class="tours-hero__copy">
        <p class="tours-hero__eyebrow">${esc(t.hubEyebrow)}</p>
        <h1 class="tours-hero__title">${esc(t.hubTitle)}</h1>
        <p class="tours-hero__lede">${esc(t.hubLede)}</p>
      </div>
      <div class="tours-hero__quals">
${t
  .hubQuals(listed)
  .map(
    (qual) => `        <span class="tours-qual">
          <img src="./assets/images/icons/approved.svg" alt="" width="18" height="18" aria-hidden="true" />
          <span>${esc(qual)}</span>
        </span>`
  )
  .join("\n")}
      </div>
    </div>
  </div>
</section>
<section class="tours-grid section" data-section="towns.grid">
  <div class="container">
    <div class="tours-grid__list">
${cards.join("\n")}
    </div>
  </div>
</section>`;
}

function firstSentences(text, count) {
  const parts = String(text).match(/[^.!?]+[.!?]+/g) || [String(text)];
  return parts.slice(0, count).join("").trim();
}

function injectTown(html, page) {
  if (page.townHub) {
    if (!html.includes("<!-- TOWNS_HUB -->")) throw new Error("towns.html must contain TOWNS_HUB");
    return html.replace("<!-- TOWNS_HUB -->", renderHub(page));
  }
  if (!page.townSlug) return html;
  const town = townBySlug(page.townSlug);
  const t = TEXT[page.townLang];
  for (const marker of ["TOWN_HERO", "TOWN_BODY", "TOWN_SIGHTS", "TOWN_FAQ"]) {
    if (!html.includes(`<!-- ${marker} -->`)) throw new Error(`town.html must contain ${marker}`);
  }
  return html
    .replace("<!-- TOWN_HERO -->", renderHero(town, t, page.townLang))
    .replace("<!-- TOWN_BODY -->", renderBody(town, t, page.townLang))
    .replace("<!-- TOWN_SIGHTS -->", "")
    .replace("<!-- TOWN_FAQ -->", renderFaq(town, t));
}

module.exports = {
  townOgSources,
  // Shared with signed-routes.js, which builds route pages from the same parts.
  parts: { esc, cap, listAnd, numberWord, longDate, shortDate, infoCard, cardSection, sightCard, photoCredit, iconFor, TEXT, TOWN_LANGS },
  showDrafts: () => SHOW_DRAFTS,
  townPath,
  townLangs,
  TOWNS,
  TOWN_BASE,
  townPages,
  injectTown,
  loadTowns,
  assertTownsBuildable,
  townSitemapDate,
  townStructuredNodes,
  townLlmsLines,
};
