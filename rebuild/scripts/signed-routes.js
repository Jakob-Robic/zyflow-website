/**
 * Signed route pages ("G2: Radovljica to Sorica"): one page per signed cycle
 * route that passes the bar, built from the town page's parts (hero with map,
 * fact boxes, cards, swipe rows, questions). Data comes from
 * content/signed-routes/<slug>/data.json, written text from text.<lang>.json.
 * These pages live beside the described routes under /tours.
 *
 * Published with the town pages (TOWNS_PUBLIC); each route also needs
 * "status": "published" in its text file, as towns do.
 */
const fs = require("fs");
const path = require("path");
const towns = require("./towns");

const { esc, cap, listAnd, numberWord, longDate, shortDate, infoCard, cardSection, sightCard, TOWN_LANGS } = towns.parts;

const REPO_ROOT = path.join(__dirname, "..", "..");
const ROUTES_DIR = process.env.SIGNED_ROUTES_CONTENT || path.join(REPO_ROOT, "content/signed-routes");
const ROUTE_BASE = { en: "/tours", sl: "/sl/tours" };
const ROUTE_BLUE = "#2F6FD6"; // the map kit's route colour: one route, so the brand's own blue

const km = (n) => `${n} km`;
const metres = (n) => `${Number(n).toLocaleString("en-GB")} m`;
const dist = (m) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.max(10, Math.round(m / 10) * 10)} m`);

const TEXT = {
  en: {
    home: "Home",
    crumb: "Routes",
    crumbHref: "./tours.html",
    seoTitle: (r) => `${r.code ? `${r.code} ` : ""}cycle route: ${r.from} to ${r.to}, ${r.km} km | Zyflow`,
    seoDescription: (r) =>
      `${r.code || r.official_name}, ${r.from} to ${r.to} by bike: ${r.km} km, about ${metres(r.climb_m)} of climbing, with places to stay and eat, water, repair and charging along the way.`,
    title: (r) => `${r.code ? `${r.code} ` : ""}<br />${r.from} to ${r.to}`,
    lede: (r) => `${r.km} km from ${r.from} to ${r.to}, with about ${metres(r.climb_m)} of climbing.`,
    intro: (r) =>
      `${r.code || r.official_name} is a ${r.level.toLowerCase()} of ${r.km} km from ${r.from} to ${r.to}. It climbs about ${metres(r.climb_m)} and tops out at ${metres(r.high_m)} near kilometre ${r.high_at_km}.`,
    heroUnit: (r) => ` · ${metres(r.climb_m)} up`,
    checkedLabel: "Last checked",
    getApp: "Get the app",
    seeTowns: "See the towns",
    facts: { length: "Length", climb: "Climb", high: "Highest point" },
    asideTitle: (r) => `On ${r.code || "this route"}:`,
    asideItems: (r) => [
      `${r.counts.towns} towns`,
      `${r.counts.stays} places to stay`,
      `${r.counts.food} places to eat`,
      `${r.counts.water} water points`,
      r.counts.repair === 1 ? "1 repair point" : `${r.counts.repair} repair points`,
      r.counts.chargers === 1 ? "1 e-bike charger" : r.counts.chargers ? `${r.counts.chargers} e-bike chargers` : "No e-bike charger",
    ],
    asideNote: "Ride it with the stops on your map in the app.",
    townsTitle: "Towns along the route",
    townFacts: (t) => [`Kilometre ${t.at_km}`, `${t.km_inside} km of the route`],
    townDesc: (t, r) => `${t.km_inside} km of ${r.code || "the route"} run through ${t.name}.`,
    viewTown: "View town",
    staysTitle: "Where to stay",
    foodTitle: "Where to stop and eat",
    practicalTitle: "Water, repair and charging",
    sightsTitle: "What to see on the way",
    placeFacts: (p) => [p.town ? `${p.town}, kilometre ${p.km}` : `Kilometre ${p.km}`, p.hours],
    fromRoute: " · from the route",
    website: "Website",
    more: (n, what) => `${n} more ${what} in the app`,
    moreStays: "places to stay",
    moreFood: "places to eat",
    waterTitle: "Water points",
    repairTitle: "Bike repair",
    chargeTitle: "E-bike charging",
    onRoute: " · along the route",
    water: (r) =>
      `${r.counts.water} public water points lie within 150 m of the route: ${listAnd(
        Object.entries(r.water_by_town)
          .filter(([, n]) => n)
          .map(([town, n]) => `${n} in ${town}`)
      )}.`,
    repair: (r) => {
      const items = r.service.filter((s) => s.type !== "charging_station");
      if (!items.length) return "There is no public repair point near the route.";
      return `${listAnd(
        items.map((s) => `${s.type === "bicycle_shop" ? `${s.name} (bike shop)` : "a public repair stand"} in ${s.town} at kilometre ${s.km}`)
      )}.`.replace(/^./, (c) => c.toUpperCase());
    },
    charge: (r) => {
      const items = r.service.filter((s) => s.type === "charging_station");
      if (!items.length) return "There is no public e-bike charger near the route, so leave with a full battery.";
      return `${listAnd(items.map((s) => `${s.name} in ${s.town} at kilometre ${s.km}, ${dist(s.m)} off the route`))}.`;
    },
    faqTitle: "Common questions",
    faq: (r) => [
      {
        q: `How long is ${r.code || "the route"} and how much climbing is there?`,
        a: `${r.km} km from ${r.from} to ${r.to}, with about ${metres(r.climb_m)} of climbing and ${metres(r.descent_m)} of descent.`,
      },
      {
        q: `Where is the highest point of ${r.code || "the route"}?`,
        a: `${metres(r.high_m)} above sea level, near kilometre ${r.high_at_km}${r.high_place ? ` by ${r.high_place}` : ""}.`,
      },
      {
        q: `Which towns does ${r.code || "the route"} pass through?`,
        a: `${listAnd(r.towns.map((t) => `${t.name} (${t.km_inside} km)`))}.`,
      },
      { q: `Where can I refill water on ${r.code || "the route"}?`, a: TEXT.en.water(r) },
      { q: `Is there bike repair or e-bike charging on ${r.code || "the route"}?`, a: `Repair: ${TEXT.en.repair(r)} Charging: ${TEXT.en.charge(r)}` },
    ],
    credits: (r) => `Last checked ${longDate(r.checked, "en")}. Map data © OpenStreetMap contributors.`,
    photo: "Photo",
  },
};

function loadRoutes(dir = ROUTES_DIR) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("_"))
    .map((entry) => path.join(dir, entry.name, "data.json"))
    .filter((file) => fs.existsSync(file))
    .map((file) => {
      const route = JSON.parse(fs.readFileSync(file, "utf8"));
      route.text = {};
      for (const lang of Object.keys(TEXT)) {
        const textFile = path.join(path.dirname(file), `text.${lang}.json`);
        if (fs.existsSync(textFile)) route.text[lang] = JSON.parse(fs.readFileSync(textFile, "utf8"));
      }
      return route;
    })
    .map((route) => {
      // data.json holds the ends as found on the mapped line (village names); a
      // written "from" / "to" in the English text gives the names a rider knows.
      const names = route.text.en || {};
      return { ...route, from: names.from || route.from, to: names.to || route.to };
    })
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

const ROUTES = loadRoutes();

function routeBySlug(slug) {
  const route = ROUTES.find((r) => r.slug === slug);
  if (!route) throw new Error(`Unknown signed route: ${slug}`);
  return route;
}

function routeLangs(route) {
  return TOWN_LANGS.filter((lang) => {
    const text = TEXT[lang] && ROUTE_BASE[lang] && route.text[lang];
    return text && (text.status === "published" || towns.showDrafts());
  });
}

const routePath = (route, lang) => `${ROUTE_BASE[lang]}/${route.slug}`;

function signedRoutePages() {
  const pages = [];
  for (const route of ROUTES) {
    const langs = routeLangs(route);
    const alternates = Object.fromEntries(langs.map((lang) => [lang, routePath(route, lang)]));
    const langSwitch = { en: alternates.en || "/tours", sl: alternates.sl || "/sl/tours" };
    for (const lang of langs) {
      const pagePath = routePath(route, lang);
      pages.push({
        id: `signed-route-${route.slug}-${lang}`,
        file: "town.html",
        out: `${pagePath.slice(1)}.html`,
        path: pagePath,
        locales: [lang],
        localePrefix: false,
        indexable: true,
        signedRouteSlug: route.slug,
        townLang: lang,
        dateUpdated: route.checked,
        langSwitch,
        alternates,
        seo: { title: TEXT[lang].seoTitle(route), description: TEXT[lang].seoDescription(route) },
      });
    }
  }
  return pages;
}

/** A town on the route: links to its town page where one is published in this language. */
function townCard(town, route, t, lang) {
  const page = towns.TOWNS.find((entry) => entry.slug === town.area_code && towns.townLangs(entry).includes(lang));
  const written = page && page.text[lang];
  const intro = written && written.intro ? (written.intro.match(/[^.!?]+[.!?]+/g) || [written.intro])[0].trim() : "";
  return infoCard({
    pin: "marker-pin",
    name: town.name,
    facts: t.townFacts(town),
    desc: intro || t.townDesc(town, route),
    value: km(town.km_inside),
    unit: ` · of ${route.code || "the route"}`,
    link: page ? { href: `.${towns.townPath(page, lang)}.html`, label: t.viewTown, name: `${t.viewTown}: ${town.name}` } : null,
  });
}

/** The written line for a place (text.<lang>.json "places", keyed by the start of its id), or a plain fallback. */
function aboutPlace(place, written, fallback) {
  const lines = (written && written.places) || {};
  const key = Object.keys(lines).find((id) => id !== "_note" && String(place.id || "").startsWith(id));
  return key ? lines[key] : fallback;
}

function placeCard(place, t, written) {
  return infoCard({
    pin: place.pin,
    name: place.name.split(" - ")[0],
    facts: t.placeFacts(place),
    desc: aboutPlace(place, written, `${place.kind} in ${place.town}.`),
    value: dist(place.m),
    unit: t.fromRoute,
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

function mapJson(route) {
  const pins = [];
  for (const group of [route.stays, route.food, route.sights, route.service]) {
    for (const place of group) pins.push({ type: place.pin || place.type, name: place.name, coordinates: [place.lon, place.lat] });
  }
  return JSON.stringify({
    town: true,
    routes: [{ color: ROUTE_BLUE, name: route.code || route.official_name, lines: [route.line] }],
    pins,
    bounds: route.bounds,
  });
}

function renderHero(route, t, lang, written) {
  return `<section class="tour-hero section" data-section="signed-route.hero">
  <div class="container">
    <div class="tour-hero__panel">
      <div class="tour-hero__copy">
        <nav class="tour-hero__crumb" aria-label="Breadcrumb">
          <a href="./index.html">${esc(t.home)}</a>
          <span class="motif" aria-hidden="true"></span>
          <a href="${t.crumbHref}">${esc(t.crumb)}</a>
          <span class="motif" aria-hidden="true"></span>
          <span aria-current="page">${esc(route.code || route.official_name)}</span>
        </nav>
        <h1 class="tour-hero__title">${written.title ? esc(written.title).replace(": ", ": <br />") : t.title({ ...route, code: esc(route.code || ""), from: esc(route.from), to: esc(route.to) })}</h1>
        <p class="tour-hero__lede">${esc(written.lede || t.lede(route))}</p>
        <div class="tour-hero__foot">
          <p class="tour-hero__price"><span>${esc(km(route.km))}</span><span>${esc(t.heroUnit(route))}</span></p>
          <div class="tour-hero__cta">
            <div class="tour-hero__next">
              <span>${esc(t.checkedLabel)}</span>
              <strong>${esc(shortDate(route.checked, lang))}</strong>
            </div>
            <a class="btn btn--primary" href="{{appStoreUrl}}" data-app-modal-open>${esc(t.getApp)}</a>
            <a class="btn btn--secondary" href="#towns">${esc(t.seeTowns)}</a>
          </div>
        </div>
      </div>
      <div class="tour-hero__media tour-hero__media--map">
        <div class="tour-hero__map" id="tour-hero-map" data-tour-map data-slug="signed-${esc(route.slug)}" role="region" aria-label="${esc(`Map of ${route.code || route.official_name} from ${route.from} to ${route.to}, with stops`)}"></div>
        <script type="application/json" data-tour-route-json>${mapJson(route).replace(/</g, "\\u003c")}</script>
      </div>
    </div>

    <div class="tour-meta">
      <div class="tour-meta__box tour-meta__box--accent">
        <p class="tour-meta__value">${esc(route.code || route.from)}</p>
        <p class="tour-meta__label"><img src="./assets/images/icons/location.svg" alt="" aria-hidden="true" width="18" height="18" /><span>${esc(`${route.level}, ${route.country}`)}</span></p>
      </div>
      <div class="tour-meta__box">
        <p class="tour-meta__value">${esc(km(route.km))}</p>
        <p class="tour-meta__label"><span class="motif" aria-hidden="true"></span><span>${esc(t.facts.length)}</span></p>
      </div>
      <div class="tour-meta__box">
        <p class="tour-meta__value">${esc(metres(route.climb_m))}</p>
        <p class="tour-meta__label"><span class="motif" aria-hidden="true"></span><span>${esc(t.facts.climb)}</span></p>
      </div>
      <div class="tour-meta__box">
        <p class="tour-meta__value">${esc(metres(route.high_m))}</p>
        <p class="tour-meta__label"><span class="motif" aria-hidden="true"></span><span>${esc(t.facts.high)}</span></p>
      </div>
    </div>
  </div>
</section>`;
}

function renderBody(route, t, lang, written) {
  const moreLink = (shown, total, what) =>
    total > shown
      ? `\n        <p class="town-more--cards"><a class="link link--arrow" href="{{appStoreUrl}}" data-app-modal-open>${esc(t.more(total - shown, what))}</a></p>`
      : "";
  const sights = route.sights.map((sight) =>
    sight.image
      ? sightCard(
          { ...sight, about: aboutPlace(sight, written, sight.about ? cap(sight.about) : ""), near: null, kind: `${sight.town}, kilometre ${sight.km}` },
          { name: sight.town },
          t
        )
      : infoCard({
          pin: sight.pin,
          name: sight.name,
          facts: [`${sight.town}, kilometre ${sight.km}`],
          desc: aboutPlace(sight, written, sight.about ? `${cap(sight.about)}.` : `${sight.kind} in ${sight.town}.`),
          value: dist(sight.m),
          unit: t.fromRoute,
        })
  );
  const blocks = [
    cardSection({ id: "towns", title: t.townsTitle, cards: route.towns.map((town) => townCard(town, route, t, lang)), written: written.towns }),
    cardSection({ id: "stays", title: t.staysTitle, cards: route.stays.map((p) => placeCard(p, t, written)), after: moreLink(route.stays.length, route.counts.stays, t.moreStays), written: written.stays }),
    cardSection({ id: "food", title: t.foodTitle, cards: route.food.map((p) => placeCard(p, t, written)), after: moreLink(route.food.length, route.counts.food, t.moreFood), written: written.food }),
    cardSection({
      id: "practical",
      title: t.practicalTitle,
      written: written.practical,
      cards: [
        infoCard({ pin: "water_point", name: t.waterTitle, desc: t.water(route), value: String(route.counts.water), unit: t.onRoute }),
        infoCard({ pin: "bicycle_repair", name: t.repairTitle, desc: t.repair(route), value: String(route.counts.repair), unit: t.onRoute }),
        infoCard({ pin: "charging_station", name: t.chargeTitle, desc: t.charge(route), value: String(route.counts.chargers), unit: t.onRoute }),
      ],
    }),
    sights.length ? cardSection({ id: "sights", title: t.sightsTitle, cards: sights, rail: sights.length > 3, written: written.sights }) : "",
  ].filter(Boolean);

  return `<section class="tour-body section town-body" data-section="signed-route.body">
  <div class="container tour-body__layout">
    <div class="town-main">
      <p class="town-intro__text">${esc(written.intro || t.intro(route))}</p>
    </div>

    <aside class="tour-aside">
      <div class="tour-aside__card">
        <p class="tour-aside__title">${esc(t.asideTitle(route))}</p>
        <ul class="tour-aside__list">
${t
  .asideItems(route)
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
<section class="section town-wide" data-section="signed-route.sections">
  <div class="container">
${blocks.join("\n")}
  </div>
</section>`;
}

function renderFaq(route, t) {
  return `<section class="faq faq--town section" id="faq" data-section="signed-route.faq">
  <div class="faq__inner">
    <h2 class="faq__title">${esc(t.faqTitle)}</h2>
    <div class="faq__list">
${t
  .faq(route)
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
    <p class="town-credits">${esc(t.credits(route))}</p>
  </div>
</section>`;
}

function injectSignedRoute(html, page) {
  if (!page.signedRouteSlug) return html;
  const route = routeBySlug(page.signedRouteSlug);
  const lang = page.townLang;
  const t = TEXT[lang];
  const written = route.text[lang] || {};
  return html
    .replace("<!-- TOWN_HERO -->", renderHero(route, t, lang, written))
    .replace("<!-- TOWN_BODY -->", renderBody(route, t, lang, written))
    .replace("<!-- TOWN_SIGHTS -->", "")
    .replace("<!-- TOWN_FAQ -->", renderFaq(route, t));
}

function signedRouteSitemapDate(page) {
  return page.signedRouteSlug ? page.dateUpdated || "" : null;
}

function signedRouteStructuredNodes(page, origin) {
  if (!page.signedRouteSlug) return null;
  const route = routeBySlug(page.signedRouteSlug);
  const lang = page.townLang;
  const t = TEXT[lang];
  const written = route.text[lang] || {};
  const url = `${origin}${page.path}`;
  const geo = (item) => ({ "@type": "GeoCoordinates", latitude: item.lat, longitude: item.lon });
  const stop = (type) => (place) => ({
    "@type": type(place),
    name: place.name,
    ...(place.site ? { url: place.site.url } : {}),
    ...(aboutPlace(place, written, "") ? { description: aboutPlace(place, written, "") } : {}),
    geo: geo(place),
    address: { "@type": "PostalAddress", addressLocality: place.town, addressCountry: "SI" },
  });
  const list = (id, name, items) => ({
    "@type": "ItemList",
    "@id": `${url}#${id}`,
    name,
    numberOfItems: items.length,
    itemListElement: items.map((item, i) => ({ "@type": "ListItem", position: i + 1, item })),
  });
  return [
    {
      "@type": "WebPage",
      "@id": `${url}#webpage`,
      url,
      name: page.seo.title.replace(/ \| Zyflow$/, ""),
      description: page.seo.description,
      inLanguage: lang,
      dateModified: route.checked,
      publisher: { "@id": `${origin}/#organization` },
      about: { "@id": `${url}#route` },
      breadcrumb: { "@id": `${url}#breadcrumb` },
    },
    {
      "@type": "BreadcrumbList",
      "@id": `${url}#breadcrumb`,
      itemListElement: [
        { "@type": "ListItem", position: 1, name: t.home, item: `${origin}/` },
        { "@type": "ListItem", position: 2, name: t.crumb, item: `${origin}${ROUTE_BASE[lang]}` },
        { "@type": "ListItem", position: 3, name: route.code || route.official_name, item: url },
      ],
    },
    {
      "@type": "TouristTrip",
      "@id": `${url}#route`,
      name: `${route.code ? `${route.code} ` : ""}${route.official_name}`,
      description: written.intro || t.intro(route),
      url,
      touristType: "Cyclists",
      itinerary: {
        "@type": "ItemList",
        itemListElement: route.towns.map((town, i) => ({ "@type": "ListItem", position: i + 1, item: { "@type": "City", name: town.name } })),
      },
    },
    list("stays", (written.stays && written.stays.title) || t.staysTitle, route.stays.map(stop((p) => ({ Hotel: "Hotel", Guesthouse: "BedAndBreakfast", Hostel: "Hostel", Campsite: "Campground" })[p.kind] || "LodgingBusiness"))),
    list("food", (written.food && written.food.title) || t.foodTitle, route.food.map(stop((p) => (p.kind === "Café" ? "CafeOrCoffeeShop" : "Restaurant")))),
    list("sights", (written.sights && written.sights.title) || t.sightsTitle, route.sights.map((sight) => ({
      "@type": "TouristAttraction",
      name: sight.name,
      ...(sight.local_name && sight.local_name !== sight.name ? { alternateName: sight.local_name } : {}),
      ...(aboutPlace(sight, written, sight.about || "") ? { description: aboutPlace(sight, written, sight.about || "") } : {}),
      ...(sight.wiki ? { sameAs: sight.wiki } : {}),
      geo: geo(sight),
    }))),
    {
      "@type": "FAQPage",
      "@id": `${url}#faq`,
      mainEntity: t.faq(route).map((item) => ({ "@type": "Question", name: item.q, acceptedAnswer: { "@type": "Answer", text: item.a } })),
    },
  ];
}

/** Published page path for a signed route by its code, for links from town pages. */
function signedRouteHref(code, lang, name) {
  // Two different routes can share a code (D2), so the official name must match too.
  const route = ROUTES.find((r) => r.code && r.code === code && (!name || r.official_name === name) && routeLangs(r).includes(lang));
  return route ? `.${routePath(route, lang)}.html` : "";
}

function signedRouteLlmsLines(origin) {
  return signedRoutePages()
    .filter((page) => page.townLang === "en")
    .map((page) => {
      const r = routeBySlug(page.signedRouteSlug);
      return `- [${r.code ? `${r.code}: ` : ""}${r.from} to ${r.to}](${origin}${page.path}): signed cycle route, ${r.km} km, about ${r.climb_m} m of climbing, through ${listAnd(r.towns.map((t) => t.name))}. Last checked ${r.checked}.`;
    });
}

module.exports = {
  ROUTES,
  signedRoutePages,
  injectSignedRoute,
  signedRouteSitemapDate,
  signedRouteStructuredNodes,
  signedRouteHref,
  signedRouteLlmsLines,
};
