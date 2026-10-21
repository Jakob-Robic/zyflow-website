const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const {
  applyToggleBlocks,
  stripUnpublishedCategories,
  stampCardCategories,
  collectCardCategories,
} = require("./build");

const BUILD = path.join(__dirname, "build.js");

function buildDist(env) {
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), "zyflow-pub-"));
  execFileSync(process.execPath, [BUILD], {
    env: { ...process.env, REBUILD_DIST: dist, MAPTILER_KEY: "", ...env },
    stdio: "pipe",
  });
  return dist;
}

function readDist(dist, rel) {
  return fs.readFileSync(path.join(dist, rel), "utf8");
}

function anchorsWith(html, needle) {
  return [...html.matchAll(/<a\b[^>]*>/g)]
    .map((match) => match[0])
    .filter((tag) => tag.includes(needle));
}

function markerFailure(html, file) {
  try {
    applyToggleBlocks(html, "journal", false, file);
  } catch (error) {
    return error;
  }
  assert.fail(`expected ${file} to reject a journal marker`);
}

test("journal markers must be balanced and must not nest", () => {
  const swapped = applyToggleBlocks(
    `<!-- journal:public -->
<a href="./blog.html">Read Journal</a>
<!-- /journal:public -->
<!-- journal:hidden -->
<a href="./tours.html">See routes</a>
<!-- /journal:hidden -->`,
    "journal",
    true,
    "sections/home/features.html"
  );
  assert.match(swapped, /blog\.html/);
  assert.doesNotMatch(swapped, /tours\.html/);
  assert.doesNotMatch(swapped, /journal:/);

  const hidden = applyToggleBlocks(
    `<!-- journal:public --><a href="./blog.html">Journal</a><!-- /journal:public -->`,
    "journal",
    false,
    "components/nav.html"
  );
  assert.equal(hidden.trim(), "");

  const nested = markerFailure(
    "<!-- journal:public --><main><!-- journal:public --><a></a><!-- /journal:public --></main>",
    "pages/home.html"
  );
  assert.match(nested.message, /pages\/home\.html/);
  assert.match(nested.message, /Nested <!-- journal:public -->/);

  const crossed = markerFailure(
    "<!-- journal:public --><main><!-- journal:hidden -->x<!-- /journal:hidden -->",
    "pages/home.html"
  );
  assert.match(crossed.message, /pages\/home\.html/);
  assert.match(crossed.message, /Nested <!-- journal:hidden -->/);

  const unclosed = markerFailure(
    "<!-- journal:public --><main>still open",
    "pages/home.html"
  );
  assert.match(unclosed.message, /^pages\/home\.html: Unclosed <!-- journal:public -->/);

  const stray = markerFailure("<!-- /journal:public -->", "components/footer.html");
  assert.match(stray.message, /^components\/footer\.html: Unbalanced <!-- \/journal:public -->/);
});

test("unknown and malformed journal markers fail and name the file", () => {
  const unknown = markerFailure("<!-- journal:draft -->", "components/nav.html");
  assert.match(unknown.message, /^components\/nav\.html: Unknown journal marker <!-- journal:draft -->$/);

  const malformed = markerFailure(
    "<!-- journal:public extra -->",
    "sections/home/features.html"
  );
  assert.match(
    malformed.message,
    /^sections\/home\/features\.html: Malformed journal marker <!-- journal:public extra -->$/
  );

  const emptyKind = markerFailure("<!-- journal: -->", "pages/home.html");
  assert.match(emptyKind.message, /^pages\/home\.html: Malformed journal marker <!-- journal: -->$/);
});

test("data-requires-category counts nested tags of the same name", () => {
  const html = [
    "<p>before</p>",
    '<a class="footer__cat" href="./tours.html?type=commute" data-requires-category="commute">',
    "<span>Commute</span>",
    '<a href="/inside">in</a>',
    "</a>",
    '<a href="/tours">stay</a>',
  ].join("");

  const hidden = stripUnpublishedCategories(html, new Set());
  assert.match(hidden, /before/);
  assert.match(hidden, /href="\/tours"/);
  assert.doesNotMatch(hidden, /commute/);
  assert.doesNotMatch(hidden, /inside/);

  const shown = stripUnpublishedCategories(html, new Set(["commute"]));
  assert.match(shown, /type=commute/);
  assert.match(shown, /href="\/inside"/);
  assert.match(shown, /href="\/tours"/);
});

test("a route category is stamped onto the matching tour card", () => {
  const html = `<article class="tour-card" data-category="tour" data-region="slovenia">
    <a class="tour-card__cta" href="./tours/blejcanka.html">View</a>
    <article class="not-a-card"><a href="./tours/other.html">no</a></article>
  </article>`;
  const stamped = stampCardCategories(html, new Map([["blejcanka", "commute"]]));
  assert.match(stamped, /data-category="commute"/);
  assert.equal(collectCardCategories(stamped).has("commute"), true);
  assert.equal(collectCardCategories(stamped).has("tour"), false);
  assert.match(stamped, /other\.html/);
});

test("JOURNAL_PUBLIC=true restores journal links, sitemap, and robots", () => {
  const dist = buildDist({ JOURNAL_PUBLIC: "true", SITE_INDEX: "true" });
  try {
    const home = readDist(dist, "index.html");
    const sl = readDist(dist, "sl/index.html");
    const robots = readDist(dist, "robots.txt");
    const sitemap = readDist(dist, "sitemap.xml");
    const blogHead = readDist(dist, "blog.html").split("</head>")[0];

    const readJournal = anchorsWith(home, "home.features.items.2.link");
    assert.equal(readJournal.length, 1);
    assert.match(readJournal[0], /href="\/blog"/);
    assert.equal(anchorsWith(home, "home.categories.cta").length, 0);
    assert.match(home, /href="\/blog"/);
    assert.match(home, /data-nav-link="journal"/);

    const appStore = "https://apps.apple.com/si/app/zyflow/id6763228086";
    assert.match(home, /property="og:image" content="https:\/\/www\.zyflow\.eu\/assets\/images\/home\/hero\.jpg"/);
    assert.match(home, /property="og:image:width" content="1024"/);
    assert.match(home, /property="og:image:height" content="680"/);
    assert.match(home, /property="og:image:type" content="image\/jpeg"/);
    assert.match(home, /property="og:image:alt" content="Zyflow, bike-friendly places and cycling routes"/);
    assert.match(home, new RegExp(appStore.replace(/[.]/g, "\\.")));
    assert.doesNotMatch(home, /\{\{appStoreUrl\}\}/);
    assert.doesNotMatch(home, /\{\{ogImage/);

    const tour = readDist(dist, "tours/jezerski-vrh.html");
    assert.match(tour, /property="og:image" content="https:\/\/www\.zyflow\.eu\/assets\/images\/og\/tours\/jezerski-vrh\.jpg"/);
    assert.match(tour, /property="og:image:width" content="1200"/);
    assert.match(tour, /property="og:image:height" content="630"/);
    assert.match(tour, new RegExp(appStore.replace(/[.]/g, "\\.")));

    const featured = anchorsWith(home, "home.featuredTour.cta");
    assert.equal(featured.length, 1);
    assert.match(featured[0], /href="\/tours"/);

    const explore = anchorsWith(home, "home.features.items.1.link");
    assert.equal(explore.length, 1);
    assert.match(explore[0], /href="\/tours"/);

    assert.match(sl, /href="\/sl\/blog"/);
    assert.doesNotMatch(home, /data-section="home\.journal"/);
    assert.doesNotMatch(sl, /data-section="home\.journal"/);
    assert.match(sitemap, /<loc>https:\/\/www\.zyflow\.eu\/blog<\/loc>/);
    assert.match(sitemap, /<loc>https:\/\/www\.zyflow\.eu\/sl\/blog<\/loc>/);
    assert.doesNotMatch(sitemap, /e-bike-charging-at-hospitality-stops/);
    assert.doesNotMatch(sitemap, /zyflow-is-live-on-ios-and-android/);
    assert.match(robots, /Disallow:\s*\/styleguide/);
    assert.doesNotMatch(robots, /Disallow:\s*\/blog\b/);
    assert.doesNotMatch(robots, /Disallow:\s*\/sl\/blog\b/);
    assert.match(blogHead, /name="robots" content="index, follow"/);
    assert.match(blogHead, /application\/rss\+xml/);
    const blog = readDist(dist, "blog.html");
    const slBlog = readDist(dist, "sl/blog.html");
    assert.match(blog, /Stories are on the way/);
    assert.match(slBlog, /Članki v slovenščini še prihajajo/);
    assert.match(slBlog, /href="\/blog"/);
  } finally {
    fs.rmSync(dist, { recursive: true, force: true });
  }
});

test("a commute route in ROUTES builds a card, the filter, and the footer tile", () => {
  const dist = buildDist({ ROUTE_CATEGORY_OVERRIDES: "blejcanka=commute" });
  try {
    const tours = readDist(dist, "tours.html");
    const home = readDist(dist, "index.html");
    const card = tours.match(
      /<article class="tour-card" data-category="commute"[\s\S]*?<\/article>/
    );
    assert.ok(card, "expected a commute tour card");
    assert.match(card[0], /\/tours\/blejcanka/);
    assert.match(tours, /data-filter="commute"/);
    assert.match(home, /href="\/tours\?type=commute"/);
    assert.equal(
      [...tours.matchAll(/data-category="commute"/g)].length,
      1
    );
  } finally {
    fs.rmSync(dist, { recursive: true, force: true });
  }
});

test("without a commute card the filter and footer tile stay off", () => {
  const dist = buildDist({});
  try {
    const tours = readDist(dist, "tours.html");
    const home = readDist(dist, "index.html");
    assert.doesNotMatch(tours, /data-category="commute"/);
    assert.doesNotMatch(tours, /data-filter="commute"/);
    assert.doesNotMatch(home, /type=commute/);
    assert.doesNotMatch(home, /href="\/blog"/);
    assert.doesNotMatch(home, /data-section="home\.journal"/);
    const robots = readDist(dist, "robots.txt");
    assert.match(robots, /Disallow:\s*\/blog\b/);
    assert.match(robots, /Disallow:\s*\/sl\/blog\b/);
    assert.doesNotMatch(readDist(dist, "sitemap.xml"), /\/blog/);
    const blogHead = readDist(dist, "blog.html").split("</head>")[0];
    const slHead = readDist(dist, "sl/blog.html").split("</head>")[0];
    assert.match(blogHead, /name="robots" content="noindex, nofollow"/);
    assert.match(slHead, /name="robots" content="noindex, nofollow"/);
    assert.doesNotMatch(blogHead, /application\/rss\+xml/);
    assert.doesNotMatch(slHead, /application\/rss\+xml/);
    assert.doesNotMatch(readDist(dist, "blog/rss.xml"), /<item>/);
    assert.match(readDist(dist, "styleguide.html"), /id="sg-blog"/);
  } finally {
    fs.rmSync(dist, { recursive: true, force: true });
  }
});
