/**
 * Routes ↔ Places (2026-11-18): slug rules, /tours filter parameters, route ↔ town
 * matching, breadcrumbs, and the built /tours list (paging, canonical, filter rows).
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const places = require("./routes-places");
const filter = require("../js/tours-filter.js");

const BUILD = path.join(__dirname, "build.js");

/* ---------- slug rules ---------- */

const index = places.placeIndex({
  countries: [
    { id: "slovenia", label: { en: "Slovenia" }, regions: [{ id: "gorenjska", label: { en: "Gorenjska" }, areas: [{ id: "bled" }] }] },
    { id: "croatia", label: { en: "Croatia" }, regions: [{ id: "zagreb-county", label: { en: "Zagreb County" }, areas: [{ id: "zelina" }] }] },
    { id: "italy", label: { en: "Italy" }, regions: [{ id: "friuli", label: { en: "Friuli Venezia Giulia" }, areas: [] }] },
  ],
});
const town = (slug, name, country, extra = {}) => ({ slug, name, country, region: "", ...extra });

test("slug check: unique towns and routes pass", () => {
  const problems = places.placeSlugProblems({
    index,
    townList: [town("bled", "Bled", "Slovenia"), town("zelina", "Sveti Ivan Zelina", "Croatia")],
    routeList: [{ slug: "blejcanka", source: "featured" }, { slug: "parenzana", source: "signed" }],
  });
  assert.deepEqual(problems, []);
});

test("slug check: the same town slug in two countries fails with a region-suffix hint", () => {
  const problems = places.placeSlugProblems({
    index,
    townList: [town("sveti-ivan", "Sveti Ivan", "Slovenia"), town("sveti-ivan", "Sveti Ivan", "Croatia")],
    routeList: [],
  });
  assert.equal(problems.length, 3, "once per language (en, sl, de)");
  assert.match(problems[0], /Town slug "sveti-ivan" \(en\) is used by Sveti Ivan \(slovenia\) and Sveti Ivan \(croatia\)/);
  assert.match(problems[0], /suffix the other with its region/);
});

test("slug check: a town slug that is a taxonomy place in another country fails", () => {
  const problems = places.placeSlugProblems({ index, townList: [town("zelina", "Zelina", "Slovenia")], routeList: [], langs: ["en"] });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /also a taxonomy place in croatia/);
});

test("slug check: per-language slugs are checked per language (trieste / trst / triest)", () => {
  const trieste = town("trieste", "Trieste", "Italy", { slugs: { en: "trieste", sl: "trst", de: "triest" } });
  assert.deepEqual(places.placeSlugProblems({ index, townList: [trieste], routeList: [] }), []);
  const clash = town("trst", "Trst", "Slovenia");
  const problems = places.placeSlugProblems({ index, townList: [trieste, clash], routeList: [] });
  assert.equal(problems.length, 1, "only the Slovenian path /sl/kolesarjenje/trst collides");
  assert.match(problems[0], /"trst" \(sl\)/);
});

test("slug check: a described loop and a signed route never share /tours/<slug>", () => {
  const problems = places.placeSlugProblems({ index, townList: [], routeList: [{ slug: "g2", source: "featured" }, { slug: "g2", source: "signed" }] });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /Route slug "g2" is used by two routes/);
});

test("slug check: the real content passes", () => {
  assert.deepEqual(places.placeSlugProblems(), []);
});

test("slugify keeps plain place names", () => {
  assert.equal(places.slugify("Kranjska Gora"), "kranjska-gora");
  assert.equal(places.slugify("Sežana"), "sezana");
  assert.equal(places.slugify("Sveti Ivan Zelina"), "sveti-ivan-zelina");
});

/* ---------- filter parameters ---------- */

const valid = {
  type: ["tour", "alpine", "gravel"],
  country: ["slovenia"],
  region: ["gorenjska", "primorska"],
  kind: ["signed", "loop"],
  length: ["under-30", "30-60", "60-100", "100-plus"],
};

test("filter params: known values are read, case and spaces ignored", () => {
  const { state, dropped } = filter.parseFilterParams("?region=Gorenjska&length=30-60&type=alpine&kind=loop", valid);
  assert.deepEqual(state, { type: "alpine", country: "", region: "gorenjska", kind: "loop", length: "30-60" });
  assert.deepEqual(dropped, []);
});

test("filter params: unknown values are dropped and reported", () => {
  const { state, dropped } = filter.parseFilterParams("?region=istria&length=5-10&type=commute", valid);
  assert.deepEqual(state, { type: "", country: "", region: "", kind: "", length: "" });
  assert.deepEqual(dropped.sort(), ["length", "region", "type"]);
});

test("filter params: the old ?region=<country> link reads as the country", () => {
  const { state, dropped } = filter.parseFilterParams("?region=slovenia", valid);
  assert.equal(state.country, "slovenia");
  assert.equal(state.region, "");
  assert.deepEqual(dropped, ["region"], "the address is cleaned to ?country=slovenia");
});

test("filter params: type=all means no style filter", () => {
  assert.equal(filter.parseFilterParams("?type=all", valid).state.type, "");
});

test("filter params round-trip in a fixed order", () => {
  const state = { type: "tour", country: "", region: "gorenjska", kind: "", length: "60-100" };
  const qs = filter.serializeFilterParams(state);
  assert.equal(qs, "type=tour&region=gorenjska&length=60-100");
  assert.deepEqual(filter.parseFilterParams(`?${qs}`, valid).state, state);
  assert.equal(filter.serializeFilterParams({ type: "", country: "", region: "", kind: "", length: "" }), "");
});

test("filter matching: every set group must match; a route can be in several regions", () => {
  const card = { category: "tour", country: "slovenia", region: "gorenjska primorska", kind: "signed", length: "100-plus" };
  const none = { type: "", country: "", region: "", kind: "", length: "" };
  assert.equal(filter.cardMatches(card, none), true);
  assert.equal(filter.cardMatches(card, { ...none, region: "primorska" }), true);
  assert.equal(filter.cardMatches(card, { ...none, region: "primorska", length: "30-60" }), false);
  assert.equal(filter.cardMatches(card, { ...none, kind: "loop" }), false);
  assert.equal(filter.hasFilters(none), false);
});

test("length buckets", () => {
  assert.equal(places.lengthBucket(9.4), "under-30");
  assert.equal(places.lengthBucket(30), "30-60");
  assert.equal(places.lengthBucket(59.9), "30-60");
  assert.equal(places.lengthBucket(79), "60-100");
  assert.equal(places.lengthBucket(100), "100-plus");
  assert.equal(places.lengthBucket(""), "");
});

/* ---------- route ↔ town matching ---------- */

// A square "municipality" from 14.0 to 14.1 east, 46.0 to 46.1 north (about 7.7 × 11 km).
const square = { type: "MultiPolygon", coordinates: [[[[14, 46], [14.1, 46], [14.1, 46.1], [14, 46.1], [14, 46]]]] };
const testTown = { slug: "testtown", area_code: "testtown", name: "Testtown", boundary: square, featured: [] };
const line = (points) => points.map(([lon, lat]) => [lon, lat]);

test("matching: a route that starts inside the boundary starts in the town", () => {
  const hit = places.matchRouteToTown({ coords: line([[14.05, 46.05], [14.2, 46.05]]), slug: "a" }, testTown);
  assert.equal(hit.starts, true);
  assert.equal(hit.passes, false);
});

test("matching: a route that crosses the town for more than 1 km rides through it", () => {
  const coords = line([[13.9, 46.05], [14.02, 46.05], [14.05, 46.05], [14.08, 46.05], [14.2, 46.05]]);
  const hit = places.matchRouteToTown({ coords, slug: "b" }, testTown);
  assert.equal(hit.starts, false);
  assert.equal(hit.passes, true);
  assert.ok(hit.kmInside > 4 && hit.kmInside < 5, `about 4.6 km inside, got ${hit.kmInside}`);
});

test("matching: grazing the boundary with one point is not riding through", () => {
  const coords = line([[13.9, 46.05], [14.001, 46.05], [13.9, 46.06]]);
  assert.equal(places.matchRouteToTown({ coords, slug: "c" }, testTown), null);
});

test("matching: a route nowhere near is not matched", () => {
  assert.equal(places.matchRouteToTown({ coords: line([[15, 45], [15.1, 45.1]]), slug: "d" }, testTown), null);
});

test("matching: the start place name counts when the GPX does not say so", () => {
  const hit = places.matchRouteToTown({ coords: [], startPlace: "Testtown", slug: "e" }, testTown);
  assert.equal(hit.starts, true);
});

test("matching: a route the town data already lists stays on the town", () => {
  const listed = { ...testTown, featured: [{ slug: "f" }] };
  const hit = places.matchRouteToTown({ coords: line([[15, 45], [15.1, 45.1]]), slug: "f" }, listed);
  assert.equal(hit.passes, true);
});

test("matching: holes in a boundary are outside", () => {
  const holed = { type: "Polygon", coordinates: [[[14, 46], [14.1, 46], [14.1, 46.1], [14, 46.1], [14, 46]], [[14.04, 46.04], [14.06, 46.04], [14.06, 46.06], [14.04, 46.06], [14.04, 46.04]]] };
  assert.equal(places.inArea([14.05, 46.05], holed), false);
  assert.equal(places.inArea([14.02, 46.02], holed), true);
});

test("matching on the real data agrees with the town data job", () => {
  const towns = require("./towns");
  for (const t of towns.TOWNS) {
    if (!towns.townLangs(t).includes("en")) continue;
    const fromBuild = places
      .routesForTown(t.slug, "en", { townsPublic: true })
      .filter((hit) => hit.entry.source === "featured")
      .map((hit) => hit.entry.slug)
      .sort();
    assert.deepEqual(fromBuild, t.featured.map((r) => r.slug).sort(), t.slug);
  }
  const blejcanka = places.entryBySlug("blejcanka", { townsPublic: true });
  assert.deepEqual(places.townsForRoute(blejcanka, "en", { townsPublic: true }).map((m) => m.town.slug), ["radovljica", "bled"], "in riding order");
});

/* ---------- breadcrumbs ---------- */

test("breadcrumbs: country and region are plain text until their pages exist; JSON-LD keeps linked levels only", () => {
  const entry = places.entryBySlug("blejcanka", { townsPublic: true });
  const items = places.routeCrumbs(entry, "sl", "Blejčanka");
  const html = places.renderCrumbs(items, "sl", "crumbs--hero");
  assert.match(html, /^<nav class="crumbs crumbs--hero" aria-label="Drobtinice"><ol class="crumbs__list">/);
  assert.match(html, /<a href="\.\/index\.html">Domov<\/a>/);
  assert.match(html, /<a href="\.\/tours\.html">Poti<\/a>/, "the build turns ./tours.html into /sl/tours");
  assert.match(html, /<span>Slovenija<\/span>/);
  assert.match(html, /<span>Gorenjska<\/span>/);
  assert.match(html, /<span aria-current="page">Blejčanka<\/span><\/li><\/ol><\/nav>$/);
  const ld = places.crumbsLd(items, "https://www.zyflow.eu");
  assert.deepEqual(
    ld.itemListElement.map((i) => [i.position, i.name, i.item]),
    [
      [1, "Domov", "https://www.zyflow.eu/sl"],
      [2, "Poti", "https://www.zyflow.eu/sl/tours"],
      [3, "Blejčanka", "https://www.zyflow.eu/sl/tours/blejcanka"],
    ]
  );
});

test("town region is the taxonomy's tourist region", () => {
  assert.deepEqual(places.townPlace({ slug: "bled", country: "Slovenia", region: "Gorenjska" }), { country: "slovenia", region: "gorenjska" });
  // Not an area in the taxonomy: falls back from the statistical region.
  assert.deepEqual(places.townPlace({ slug: "koper", country: "Slovenia", region: "Obalno-kraška" }), { country: "slovenia", region: "primorska" });
  // Posavska has no tourist region yet: no region level rather than a guess.
  assert.equal(places.townPlace({ slug: "brezice", country: "Slovenia", region: "Posavska" }).region, "");
});

/* ---------- the built /tours list ---------- */

test("/tours: every route in the HTML, paging after the page size, canonical stays /tours", () => {
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), "zyflow-routes-places-"));
  execFileSync(process.execPath, [BUILD], {
    env: { ...process.env, REBUILD_DIST: dist, MAPTILER_KEY: "", TOURS_PAGE_SIZE: "8", SITE_INDEX: "true", TOWNS_DRAFTS: "" },
    stdio: "pipe",
  });
  for (const [rel, canonical] of [["tours.html", "https://www.zyflow.eu/tours"], ["sl/tours.html", "https://www.zyflow.eu/sl/tours"]]) {
    const html = fs.readFileSync(path.join(dist, rel), "utf8");
    const cards = [...html.matchAll(/<article class="tour-card[^"]*"[^>]*>/g)].map((m) => m[0]);
    const entries = places.routeEntriesFor(rel.startsWith("sl") ? "sl" : "en");
    assert.equal(cards.length, entries.length, "one card per public route");
    for (const entry of entries) assert.match(html, new RegExp(`href="${entry.path(rel.startsWith("sl") ? "sl" : "en")}"`), `${entry.slug} linked`);
    assert.equal(cards.filter((c) => c.includes("is-paged-out")).length, entries.length - 8, "cards after the first page wait");
    assert.match(html, /data-page-size="8"/);
    assert.match(html, /<button[^>]*data-tours-more[^>]*>/, "Show more is there");
    assert.doesNotMatch(html.match(/<button[^>]*data-tours-more[^>]*>/)[0], /\shidden/, "and visible");
    assert.match(html, new RegExp(`<link rel="canonical" href="${canonical}"`));
    assert.doesNotMatch(html, /<meta name="robots" content="noindex/);
    assert.match(html, /data-tours-filter="length" data-value="60-100"/);
    assert.match(html, /aria-labelledby="tours-filter-country" hidden/, "one country: its row stays hidden");
    assert.equal((html.match(/loading="lazy"/g) || []).length >= entries.length - 3, true, "only the first row loads at once");
  }
  const tour = fs.readFileSync(path.join(dist, "tours/blejcanka.html"), "utf8");
  assert.match(tour, /<nav class="crumbs crumbs--hero"/);
  assert.match(tour, /route-towns__link" href="\/cycling\/radovljica"/);
  const bled = fs.readFileSync(path.join(dist, "sl/kolesarjenje/bled.html"), "utf8");
  assert.match(bled, /id="routes-here"[\s\S]*href="\/sl\/tours\/blejcanka"/);
});
