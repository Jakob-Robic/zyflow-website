const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const YAML = require("yaml");
const sharp = require("sharp");
const { loadBlog, getCatalog } = require("./blog");

const ROOT = path.join(__dirname, "..", "..");
const HERO = path.join(ROOT, "content/blog/e-bike-charging-at-hospitality-stops/images/hero.jpg");
const BUILD = path.join(__dirname, "build.js");

function basePost(overrides = {}) {
  return {
    status: "published",
    translationKey: "sample-ride",
    slug: "sample-ride",
    title: "Café charging before a Gorenjska climb",
    description: "Find the café socket before the climb, then ride home with battery to spare.",
    datePublished: "2026-09-01",
    dateUpdated: "2026-10-01",
    author: "jakob-robic",
    type: "practical",
    hubLevel: "guide",
    parentHub: "blog",
    region: "gorenjska",
    activities: ["e-bike"],
    tags: ["charging"],
    hero: {
      src: "images/hero.jpg",
      alt: "Café socket",
      credit: "Zyflow",
      licence: "own",
    },
    facts: { bestSeason: "Apr–Oct", charge: "Cafés in Tržič" },
    sources: [{ kind: "notes", note: "Rider notes from the day." }],
    aiAssisted: false,
    ...overrides,
  };
}

function writeTree(dir, files) {
  fs.cpSync(path.join(ROOT, "content/blog/_authors"), path.join(dir, "_authors"), { recursive: true });
  fs.copyFileSync(path.join(ROOT, "content/blog/_taxonomy.yml"), path.join(dir, "_taxonomy.yml"));
  for (const [rel, contents] of Object.entries(files)) {
    const abs = path.join(dir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, contents);
    const images = path.join(path.dirname(abs), "images");
    fs.mkdirSync(images, { recursive: true });
    const hero = path.join(images, "hero.jpg");
    if (!fs.existsSync(hero)) fs.copyFileSync(HERO, hero);
  }
}

function catalogFrom(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "zyflow-blog-"));
  writeTree(dir, files);
  return loadBlog(dir, { today: "2026-10-21" });
}

function errorsOf(files) {
  return catalogFrom(files).errors.join("\n");
}

function md(folder, lang, data, body) {
  const copy = { ...data, translationKey: data.translationKey || folder };
  return [`${folder}/${lang}.md`, `---\n${YAML.stringify(copy)}---\n\n${body}`];
}

function one(data, body = "Find the café socket before the climb.\n", folder = "sample-ride") {
  const [rel, text] = md(folder, "en", data, body);
  return { [rel]: text };
}

test("the journal stays unpublished in source", () => {
  const pages = fs.readFileSync(path.join(__dirname, "pages.js"), "utf8");
  assert.match(pages, /const JOURNAL_PUBLIC = false/);
  assert.equal(getCatalog().posts.every((post) => post.status === "draft" && post.lang === "en"), true);
  assert.equal(getCatalog().posts.some((post) => post.slug === "zyflow-is-live-on-ios-and-android"), false);
  assert.equal(getCatalog().pages.length, 0);
  assert.ok(getCatalog().warnings.some((warning) => /placeholder/.test(warning)));
  const areas = getCatalog().taxonomy.regions.find((region) => region.id === "gorenjska").areas.map((area) => area.id);
  assert.deepEqual(areas, ["bled", "trzic", "jezersko"]);
});

test("a valid published post produces a single-language page", () => {
  const catalog = catalogFrom(one(basePost()));
  assert.deepEqual(catalog.errors, []);
  assert.equal(catalog.pages.length, 2);
  const post = catalog.pages.find((page) => page.blogKind === "post");
  assert.equal(post.hreflang, false);
  assert.deepEqual(post.locales, ["en"]);
  assert.equal(catalog.pages.some((page) => page.blogKind === "author"), true);
});

test("validation reports each §1.4 failure", () => {
  const cases = [
    [basePost({ status: "live" }), "status must be draft or published"],
    [basePost({ translationKey: "Other" }), "translationKey must be kebab-case"],
    [basePost({ slug: "Author" }), "slug must match"],
    [basePost({ slug: "rss" }), "slug \"rss\" is reserved"],
    [basePost({ title: "" }), "title is required"],
    [basePost({ description: "Find the café" }), "description does not end at a sentence boundary"],
    [basePost({ datePublished: "2026-13-01" }), "datePublished must be YYYY-MM-DD"],
    [basePost({ datePublished: "2026-10-22" }), "datePublished is in the future"],
    [basePost({ dateUpdated: "2026-08-01" }), "dateUpdated is before datePublished"],
    [basePost({ dateUpdated: "2026-10-22" }), "dateUpdated is in the future"],
    [basePost({ author: "missing" }), "author missing does not exist"],
    [basePost({ type: "news" }), "type must be one of"],
    [basePost({ hubLevel: "note" }), "hubLevel must be one of"],
    [basePost({ region: "kras" }), "region kras is not in the taxonomy"],
    [basePost({ area: "ljubljana" }), "area ljubljana is not in region"],
    [basePost({ activities: [] }), "activities needs at least one value"],
    [basePost({ activities: ["ski"] }), "unknown activity ski"],
    [basePost({ tags: ["nope"] }), "unknown tag nope"],
    [basePost({ tags: ["charging", "climbs", "borders", "stays", "cafes", "charging"] }), "tags cannot have more than 5"],
    [basePost({ hero: { src: "../secret.jpg", alt: "x", credit: "Zyflow", licence: "own" } }), "src must be a file under images/"],
    [basePost({ hero: { src: "images/hero.jpg", alt: "", credit: "Zyflow", licence: "own" } }), "alt is required"],
    [basePost({ hero: { src: "images/hero.jpg", alt: "Café", credit: "", licence: "own" } }), "credit is required"],
    [basePost({ hero: { src: "images/hero.jpg", alt: "Café", credit: "Zyflow", licence: "cc" } }), "licence must be one of"],
    [basePost({ hero: { src: "images/hero.jpg", alt: "Café", credit: "Photo: A, CC BY 4.0", licence: "cc-by-4.0" } }), "sourceUrl is required"],
    [basePost({ hero: { src: "images/hero.jpg", alt: "Café", credit: "Photo: A", licence: "cc0", sourceUrl: "https://commons.wikimedia.org/wiki/File:A.jpg" } }), "via Wikimedia Commons"],
    [basePost({ hero: { src: "images/hero.jpg", alt: "Café", credit: "Photo: Cafe / Partner", licence: "partner-permission" } }), "permissionRef is required"],
    [basePost({ hero: { src: "images/hero.jpg", alt: "Café", credit: "Photo: Cafe / Partner", licence: "partner-permission", permissionRef: "N1" } }), "(used with permission)"],
    [basePost({ hero: { src: "images/hero.jpg", alt: "Café", credit: "Photo: Rider", licence: "guest-rider" } }), "rightsConfirmed: true"],
    [basePost({ relatedTours: ["not-a-route"] }), "Unknown route"],
    [basePost({ relatedPosts: ["missing-post"] }), "related post missing-post"],
    [basePost({ facts: null }), "facts is required"],
    [basePost({ type: "route-guide", facts: { bestSeason: "Apr–Oct" } }), "facts.distanceKm is required"],
    [basePost({ sources: [] }), "sources needs at least one entry"],
    [basePost({ aiAssisted: true, howWeMade: "" }), "howWeMade is required"],
    [basePost({ status: "draft", datePublished: "2026-10-22", facts: null, sources: [] }), "datePublished is in the future", false],
  ];

  for (const [data, needle, shouldFail = true] of cases) {
    const found = errorsOf(one(data));
    if (shouldFail) assert.match(found, new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), needle);
    else assert.doesNotMatch(found, new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), found);
  }

  const html = errorsOf(one(basePost(), "Find the ride.\n\n<div>nope</div>\n"));
  assert.match(html, /raw HTML is not allowed/);
  const image = errorsOf(one(basePost(), "Find the ride.\n\n![](images/hero.jpg)\n"));
  assert.match(image, /bare images are not allowed/);
  const figure = errorsOf(
    one(
      basePost(),
      'Find the ride.\n\n:::figure src="images/hero.jpg" alt="Café" credit="Photo: Cafe / Partner" licence="partner-permission"\nA socket.\n:::\n'
    )
  );
  assert.match(figure, /permissionRef is required/);
  const rawMap = errorsOf(one(basePost(), "Find the ride.\n\n:::route-map tour=\"blejcanka\"\n:::\n"));
  assert.match(rawMap, /status is raw/);
  const unknownCard = errorsOf(one(basePost(), "Find the ride.\n\n:::tour-cards missing-route\n:::\n"));
  assert.match(unknownCard, /Unknown route/);
  const unbuilt = errorsOf(one(basePost(), 'Find the ride.\n\n:::route-map tour="not-a-route"\n:::\n'));
  assert.match(unbuilt, /Unknown route/);
});

test("drafts skip published-only rules and a placeholder author warns", () => {
  const catalog = catalogFrom(
    one(basePost({ status: "draft", facts: undefined, sources: undefined }))
  );
  assert.deepEqual(catalog.errors, []);
  assert.equal(catalog.pages.length, 0);
  assert.ok(catalog.warnings.some((warning) => /placeholder/.test(warning)));
});

test("Slovenian copies must differ, and hreflang pairs only when both exist", () => {
  const en = basePost({ dateUpdated: "2026-10-02" });
  const sl = basePost({
    slug: "polnilnice-ob-kavarnah",
    title: "Polnilnice ob kavarnah na Gorenjskem",
    description: "Najdi polnilnice ob kavarnah, preden se odpraviš na pot.",
  });
  const slBody = "Najdi polnilnice ob kavarnah, preden se odpraviš na kolesarsko pot.\n\nKolesarji načrtujejo postanke in vzpon.\n";
  const [enRel, enText] = md("sample-ride", "en", en, "Find the café socket before the climb.\n");
  const [slRel, slText] = md("sample-ride", "sl", sl, slBody);
  const paired = catalogFrom({ [enRel]: enText, [slRel]: slText });
  assert.deepEqual(paired.errors, [], paired.errors);
  const postPages = paired.pages.filter((page) => page.blogKind === "post");
  assert.equal(postPages.length, 2);
  assert.equal(postPages.every((page) => page.langSwitch && page.hreflang !== false), true);
  assert.equal(postPages[0].langSwitch.sl, "/sl/blog/polnilnice-ob-kavarnah");

  const sameSlug = catalogFrom({
    [enRel]: enText,
    [slRel]: `---\n${YAML.stringify({ ...sl, slug: "sample-ride" })}---\n\n${slBody}`,
  });
  assert.match(sameSlug.errors.join("\n"), /Slovenian slug must differ/);

  const sameBody = catalogFrom({
    [enRel]: enText,
    [slRel]: `---\n${YAML.stringify(sl)}---\n\nFind the café socket before the climb.\n`,
  });
  assert.match(sameBody.errors.join("\n"), /Slovenian body matches/);

  const sameTitle = catalogFrom({
    [enRel]: enText,
    [slRel]: `---\n${YAML.stringify({ ...sl, title: en.title })}---\n\n${slBody}`,
  });
  assert.match(sameTitle.errors.join("\n"), /Slovenian title matches|looks English/);
});

test("a published parent must be higher in the chain, and cycles fail", () => {
  const guide = basePost({ translationKey: "area-guide", parentHub: "region-hub" });
  const region = basePost({
    translationKey: "region-hub",
    slug: "region-hub",
    hubLevel: "region",
    parentHub: "area-guide",
    title: "Gorenjska charging hubs for a longer ride",
  });
  const files = {
    ...one(guide, "Find the café socket before the climb.\n", "area-guide"),
    ...one(region, "Find the region hub before the climb.\n", "region-hub"),
  };
  const found = errorsOf(files);
  assert.match(found, /parentHub cycle/);
  assert.match(found, /parentHub must sit higher/);
});

test("published fixture renders posts, JSON-LD, RSS, filters, and sitemap dates", async () => {
  const content = fs.mkdtempSync(path.join(os.tmpdir(), "zyflow-blog-content-"));
  const en = basePost({
    translationKey: "sample-ride",
    dateUpdated: "2026-10-02",
    relatedTours: ["blejcanka"],
  });
  const sl = basePost({
    translationKey: "sample-ride",
    slug: "polnilnice-ob-kavarnah",
    title: "Polnilnice ob kavarnah na Gorenjskem",
    description: "Najdi polnilnice ob kavarnah, preden se odpraviš na pot.",
    dateUpdated: "2026-10-02",
  });
  const solo = basePost({
    translationKey: "solo-day-ride",
    slug: "solo-day-ride",
    title: "A solo charging plan for the way home",
    description: "Find one café socket, then ride home with battery to spare.",
    datePublished: "2026-09-15",
    dateUpdated: "2026-09-15",
  });
  const draft = basePost({
    status: "draft",
    translationKey: "still-a-draft",
    slug: "still-a-draft",
    title: "A draft that stays off the site",
    facts: undefined,
    sources: undefined,
  });
  const enBody = `Find the café socket before the climb.\n\n:::figure src="images/hero.jpg" alt="Café socket" credit="Zyflow" licence="own"\nA socket by the door.\n:::\n\n:::faq\n### Where is the socket?\nAt the café before the climb.\n:::\n\n:::tour-cards blejcanka\n:::\n\nUNIQUEBODYMARKER\n`;
  const slBody = "Najdi polnilnice ob kavarnah, preden se odpraviš na kolesarsko pot.\n\nKolesarji načrtujejo postanke in vzpon.\n";
  const files = {
    ...Object.fromEntries([
      md("sample-ride", "en", en, enBody),
      md("sample-ride", "sl", sl, slBody),
      md("solo-day-ride", "en", solo, "Find the café socket before the climb.\n"),
      md("still-a-draft", "en", draft, "Find the café socket before the climb.\n"),
    ]),
  };
  writeTree(content, files);
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), "zyflow-blog-dist-"));
  try {
    try {
      execFileSync(process.execPath, [BUILD], {
        env: {
          ...process.env,
          BLOG_CONTENT: content,
          JOURNAL_PUBLIC: "true",
          SITE_INDEX: "true",
          REBUILD_DIST: dist,
          MAPTILER_KEY: "",
        },
        stdio: "pipe",
      });
    } catch (error) {
      const stderr = error.stderr ? error.stderr.toString() : "";
      throw new Error(stderr || error.message);
    }
    const post = fs.readFileSync(path.join(dist, "blog/sample-ride.html"), "utf8");
    const jsonBlocks = [...post.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
    assert.ok(jsonBlocks.length >= 1);
    const graph = JSON.parse(jsonBlocks[0][1])["@graph"].map((node) => node["@type"]);
    assert.ok(graph.includes("Article"));
    assert.ok(graph.includes("FAQPage"));
    assert.ok(graph.includes("BreadcrumbList"));
    assert.match(post, /property="og:image:width" content="1200"/);
    assert.match(post, /property="og:image:height" content="630"/);
    assert.match(post, /\/tours\/blejcanka/);
    assert.match(post, /post-figure__credit/);
    assert.match(post, /hreflang="sl" href="https:\/\/www\.zyflow\.eu\/sl\/blog\/polnilnice-ob-kavarnah"/);
    const soloHtml = fs.readFileSync(path.join(dist, "blog/solo-day-ride.html"), "utf8");
    assert.doesNotMatch(soloHtml, /rel="alternate" hreflang=/);

    const hub = fs.readFileSync(path.join(dist, "blog.html"), "utf8");
    assert.match(hub.split("</head>")[0], /application\/rss\+xml/);
    assert.match(
      fs.readFileSync(path.join(dist, "sl/blog.html"), "utf8").split("</head>")[0],
      /application\/rss\+xml/
    );
    const hubGraph = JSON.parse(hub.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1])["@graph"].map(
      (node) => node["@type"]
    );
    assert.ok(hubGraph.includes("Blog"));
    assert.ok(hubGraph.includes("ItemList"));
    assert.match(hub, /data-blog-card/);
    assert.match(hub, /data-region="gorenjska"/);
    assert.match(hub, /data-type="practical"/);
    assert.match(hub, /data-activities="e-bike"/);
    assert.match(hub, /data-blog-filter="region"/);

    const author = fs.readFileSync(path.join(dist, "blog/author/jakob-robic.html"), "utf8");
    const authorTypes = JSON.parse(author.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1])[
      "@graph"
    ].map((node) => node["@type"]);
    assert.ok(authorTypes.includes("Person"));

    const home = fs.readFileSync(path.join(dist, "index.html"), "utf8");
    assert.match(home, /data-section="home\.journal"/);
    assert.match(home, /\/blog\/sample-ride/);

    const rss = fs.readFileSync(path.join(dist, "blog/rss.xml"), "utf8");
    assert.match(rss, /<rss version="2.0">/);
    assert.match(rss, /<title>Café charging before a Gorenjska climb<\/title>/);
    assert.doesNotMatch(rss, /UNIQUEBODYMARKER/);
    assert.doesNotMatch(rss, /still-a-draft/);
    assert.match(fs.readFileSync(path.join(dist, "sl/blog/rss.xml"), "utf8"), /<rss version="2.0">/);

    const sitemap = fs.readFileSync(path.join(dist, "sitemap.xml"), "utf8");
    const blocks = sitemap.split("<url>").slice(1);
    const block = (needle) => blocks.find((item) => item.includes(needle));
    const paired = block("/blog/sample-ride<");
    assert.match(paired, /<lastmod>2026-10-02<\/lastmod>/);
    assert.match(paired, /hreflang="sl" href="https:\/\/www\.zyflow\.eu\/sl\/blog\/polnilnice-ob-kavarnah"/);
    const soloBlock = block("/blog/solo-day-ride<");
    assert.match(soloBlock, /<lastmod>2026-09-15<\/lastmod>/);
    assert.doesNotMatch(soloBlock, /xhtml:link/);
    const hubBlock = block("/blog<");
    assert.match(hubBlock, /<lastmod>2026-10-02<\/lastmod>/);
    assert.doesNotMatch(sitemap, /still-a-draft/);
    assert.equal(fs.existsSync(path.join(dist, "blog/still-a-draft.html")), false);

    const info = await sharp(path.join(dist, "assets/images/og/blog/sample-ride.jpg")).metadata();
    assert.equal(info.width, 1200);
    assert.equal(info.height, 630);

    execFileSync(
      process.execPath,
      [
        "-e",
        `const { PAGES } = require(${JSON.stringify(path.join(__dirname, "pages.js"))});
         const { renderFeed } = require(${JSON.stringify(path.join(__dirname, "blog.js"))});
         if (PAGES.some((page) => page.blogKind)) process.exit(2);
         const hidden = renderFeed("en", "https://www.zyflow.eu", (post) => "/blog/" + post.slug, { includeItems: false });
         if (hidden.includes("<item>")) process.exit(3);
         const listed = renderFeed("en", "https://www.zyflow.eu", (post) => "/blog/" + post.slug);
         if (!listed.includes("sample-ride")) process.exit(4);`,
      ],
      {
        env: { ...process.env, BLOG_CONTENT: content, JOURNAL_PUBLIC: "false" },
        stdio: "pipe",
      }
    );
    assert.match(fs.readFileSync(BUILD, "utf8"), /includeItems: JOURNAL_IS_PUBLIC/);
  } finally {
    fs.rmSync(content, { recursive: true, force: true });
    fs.rmSync(dist, { recursive: true, force: true });
  }
});

test("safe link schemes stay, and attack payloads name the file", () => {
  const draft = basePost({ status: "draft", facts: undefined, sources: undefined });
  const safe = catalogFrom(
    one(
      draft,
      "See [the site](https://www.zyflow.eu/blog), [mail](mailto:hello@zyflow.eu), [root](/blog), [dot](./notes) and [jump](#top).\n"
    )
  );
  assert.deepEqual(safe.errors, []);

  const attacks = [
    ["| a |\n|---|\n| <img src=x onerror=alert(1)> |\n", /raw HTML is not allowed/],
    ["| <script>alert(1)</script> | b |\n|---|---|\n| x | y |\n", /raw HTML is not allowed/],
    [
      ":::faq\n### Where?\n| a |\n|---|\n| <img src=x onerror=alert(1)> |\n:::\n",
      /raw HTML is not allowed/,
    ],
    ["[click](javascript:alert(1))\n", /URL scheme "javascript:" is not allowed/],
    ["[click](JaVaScRiPt:alert(1))\n", /URL scheme "javascript:" is not allowed/],
    ["[click](&#106;avascript&#58;alert(1))\n", /URL scheme "javascript:" is not allowed/],
    ["[click](&#x6A;avascript&#x3A;alert(1))\n", /URL scheme "javascript:" is not allowed/],
    ["[click](java&nbsp;script:alert(1))\n", /URL scheme "javascript:" is not allowed/],
    ["[click](java\u200bscript:alert(1))\n", /URL scheme "javascript:" is not allowed/],
    ["<javascript:alert(1)>\n", /URL scheme "javascript:" is not allowed/],
    ["[click][x]\n\n[x]: javascript:alert(1)\n", /URL scheme "javascript:" is not allowed/],
    ["| a |\n|---|\n| [x](javascript:alert(1)) |\n", /URL scheme "javascript:" is not allowed/],
    [":::faq\n### Where?\n[a](javascript:alert(1))\n:::\n", /URL scheme "javascript:" is not allowed/],
    [
      ':::figure src="images/hero.jpg" alt="Cafe" credit="Zyflow" licence="own"\nA [bad](javascript:alert(1)) caption.\n:::\n',
      /URL scheme "javascript:" is not allowed/,
    ],
    ["[click](data:text/html;base64,PHNjcmlwdD4=)\n", /URL scheme "data:" is not allowed/],
    ["[click](vbscript:msgbox(1))\n", /URL scheme "vbscript:" is not allowed/],
    ["See {{appStoreUrl}} for the store.\n", /template tokens \{\{\.\.\.\}\} are not allowed/],
  ];
  for (const [body, needle] of attacks) {
    const found = errorsOf(one(draft, `Intro paragraph for the test post.\n\n${body}`));
    assert.match(found, /sample-ride\/en\.md/, body);
    assert.match(found, needle, found);
  }
});

test("author photo src uses the images/ path rule", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "zyflow-blog-author-"));
  writeTree(dir, one(basePost({ status: "draft", facts: undefined, sources: undefined })));
  const file = path.join(dir, "_authors", "jakob-robic.yml");
  const author = YAML.parse(fs.readFileSync(file, "utf8"));
  author.photo.src = "../secret.jpg";
  fs.writeFileSync(file, YAML.stringify(author));
  const found = loadBlog(dir, { today: "2026-10-21" }).errors.join("\n");
  assert.match(found, /_authors\/jakob-robic\.yml: photo src must be a file under images\//);
});
