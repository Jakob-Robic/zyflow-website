const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { PAGES, pageLocales, SITE_ORIGIN } = require("./pages");
const { ROUTES } = require("./routes");
const {
  descriptionIssues,
  collectMetaIssues,
  absoluteOgImage,
  tourOgPath,
  tourHasOwnOg,
  TOUR_OG_WIDTH,
  TOUR_OG_HEIGHT,
} = require("./page-meta");
const {
  repositoryIsShallow,
  resolveSitemapLastmod,
  pageContentPaths,
} = require("./build");

const LOCALES = path.join(__dirname, "..", "locales");
const OG_DIR = path.join(__dirname, "..", "assets", "images", "og", "tours");

function loadLocales() {
  return {
    en: JSON.parse(fs.readFileSync(path.join(LOCALES, "en.json"), "utf8")),
    sl: JSON.parse(fs.readFileSync(path.join(LOCALES, "sl.json"), "utf8")),
  };
}

function jpegSize(buf) {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) throw new Error("not a jpeg");
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) break;
    const marker = buf[i + 1];
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    const len = buf.readUInt16BE(i + 2);
    i += 2 + len;
  }
  throw new Error("no SOF marker");
}

test("every built page has a short, in-language meta description", () => {
  const issues = collectMetaIssues(loadLocales(), PAGES, pageLocales);
  assert.deepEqual(issues, []);
});

test("flags a description cut off mid-word", () => {
  const cut =
    "Probably one of the most beautiful links in the Kranjska roža network. From central Kranj head toward Jamnik; after a few kilometres of climbing, the Karav";
  assert.ok(descriptionIssues("en", cut).includes("truncated mid-word"));
});

test("flags a trailing ellipsis, including a 155-character cut plus three dots", () => {
  const base =
    "Probably one of the most beautiful links in the Kranjska roža network. From central Kranj head toward Jamnik; after a few kilometres of climbing, the Karav";
  const cut = `${[...base].slice(0, 155).join("")}...`;
  assert.equal([...cut].length, 158);
  assert.ok(descriptionIssues("en", cut).includes("truncated with an ellipsis"));
  assert.ok(
    descriptionIssues("en", "A shorter climb into the valley...").includes(
      "truncated with an ellipsis"
    )
  );
  assert.ok(
    descriptionIssues("en", "A shorter climb into the valley…").includes(
      "truncated with an ellipsis"
    )
  );
});

test("flags a Slovenian place list on an English page", () => {
  const places =
    "Zgornje Jezersko–Spodnji Kraj–kamnolom lehnjaka–Sp. Virnik–Zgornje Jezersko";
  const issues = descriptionIssues("en", places);
  assert.ok(issues.some((issue) => issue.includes("sentence boundary")));
  assert.ok(issues.some((issue) => issue.includes("Slovenian")));
});

test("flags an English description on a Slovenian page", () => {
  const english =
    "Privacy Policy, Cookie Policy, and Terms of Service for Zyflow and HERKO d.o.o.";
  assert.ok(
    descriptionIssues("sl", english).some((issue) => issue.includes("English"))
  );
});

test("strips the CTA before scoring, so an English sentence plus the Slovenian CTA fails", () => {
  const mixed =
    "Ride from Kranj to Bled through the forest. Odpri pot v Zyflow.";
  const issues = descriptionIssues("sl", mixed);
  assert.ok(issues.some((issue) => issue.includes("English")));
  assert.ok(
    descriptionIssues(
      "sl",
      "Ride through the forest. Odpri pot v aplikaciji Zyflow."
    ).some((issue) => issue.includes("English"))
  );
});

test("flags Slovenian copy that merely contains the word open on an English page", () => {
  const issues = descriptionIssues(
    "en",
    "Kratka krožna tura mimo kamnoloma lehnjaka, open."
  );
  assert.ok(issues.some((issue) => issue.includes("Slovenian")));
});

test("flags German copy on an English page", () => {
  const issues = descriptionIssues(
    "en",
    "Eine kurze Radtour von Kranj nach Bled durch den Wald."
  );
  assert.ok(issues.some((issue) => issue.includes("German")));
});

test("accepts a sentence that ends with a closing curly quote", () => {
  assert.deepEqual(
    descriptionIssues("en", "A shorter climb into the valley.”"),
    []
  );
});

test("normalises NFD č before measuring length or language", () => {
  const nfc = `${"č".repeat(150)} tura.`;
  const nfd = nfc.normalize("NFD");
  assert.ok([...nfc].length <= 160);
  assert.ok([...nfd].length > 160);
  assert.notEqual(nfd, nfc);
  assert.deepEqual(descriptionIssues("sl", nfd), []);
  assert.ok(
    descriptionIssues("en", "Izbris računa.".normalize("NFD")).some((issue) =>
      issue.includes("Slovenian")
    )
  );
});

test("flags a description longer than 160 characters", () => {
  const long = `${"Word ".repeat(40).trim()}.`;
  assert.ok(long.length > 160);
  assert.ok(descriptionIssues("en", long).some((issue) => issue.includes("160")));
});

test("checks route meta descriptions and Slovenian titles", () => {
  const messages = {
    en: {
      meta: { pages: { home: { title: "Home", description: "Find routes and rides." } } },
      routes: {
        blejcanka: {
          metaDescription: "Ride from Kranj to Bled through the forest. Open in Zyflow.",
        },
      },
    },
    sl: {
      meta: {
        pages: {
          home: { title: "Zyflow, Privacy Policy", description: "Najdi poti in ture." },
        },
      },
      routes: {
        blejcanka: {
          metaDescription:
            "Ride from Kranj to Bled through the forest. Odpri pot v Zyflow.",
        },
      },
    },
  };
  const issues = collectMetaIssues(messages, [{ id: "home" }], () => ["en", "sl"]);
  assert.ok(issues.some((issue) => issue.includes("sl home title") && issue.includes("English")));
  assert.ok(
    issues.some(
      (issue) =>
        issue.includes("sl routes.blejcanka.metaDescription") && issue.includes("English")
    )
  );
  assert.ok(
    !issues.some((issue) => issue.includes("en routes.blejcanka.metaDescription"))
  );
});

test("keeps an English sentence that names several Slovenian places", () => {
  assert.deepEqual(
    descriptionIssues(
      "en",
      "Tržič, Dobča, Šenkova domačija, Planšarsko jezero and Ankova planina in one day."
    ),
    []
  );
  assert.deepEqual(
    descriptionIssues("en", "Kamnolom lehnjaka and Spodnji Virnik."),
    []
  );
});

test("flags English mixed into a Slovenian description", () => {
  const cases = [
    "Odpri pot v aplikaciji Zyflow. Ride from Kranj to Bled through the forest.",
    "Ride from Kranj to Bled through the forest, mimo jezera in čez Jamnik.",
    "Ride … and past the lake, mimo jezera ki je lep.",
  ];
  for (const text of cases) {
    const issues = descriptionIssues("sl", text);
    assert.ok(
      issues.some((issue) => issue.includes("English")),
      `${text} → ${issues.join("; ")}`
    );
  }
});

test("flags an ellipsis hidden by a closing quote", () => {
  assert.ok(
    descriptionIssues("en", '…a great ride..."').includes(
      "truncated with an ellipsis"
    )
  );
});

test("keeps Slovenian copy that uses bike park, pump track, or Gravel ride", () => {
  assert.deepEqual(
    descriptionIssues("sl", "Makadamska tura z bike park, pump track in Gravel ride."),
    []
  );
});

test("rejects only a trailing ellipsis, and accepts a distance or duration ending", () => {
  assert.deepEqual(
    descriptionIssues("en", "From Kranj ... through the forest to Bled, 79 km."),
    []
  );
  assert.deepEqual(descriptionIssues("en", "Blejčanka, Kranj to Lake Bled, 79 km"), []);
  assert.deepEqual(descriptionIssues("en", "A forest link from Tržič, 2:30 h"), []);
  assert.ok(
    descriptionIssues("en", "A shorter climb into the valley...").includes(
      "truncated with an ellipsis"
    )
  );
});

test("flags stem-less Slovenian by its diacritics on an English page", () => {
  const issues = descriptionIssues("en", "vožnja do koče in nazaj.");
  assert.ok(issues.some((issue) => issue === "looks Slovenian on an English page"));
  assert.ok(issues.every((issue) => !issue.includes("a English")));
});

test("flags a Slovenian title on an English page", () => {
  const messages = {
    en: {
      meta: {
        pages: {
          home: {
            title: "vožnja do koče in nazaj",
            description: "Find routes and rides.",
          },
        },
      },
    },
    sl: {
      meta: {
        pages: {
          home: { title: "Domov", description: "Najdi poti in ture." },
        },
      },
    },
  };
  const issues = collectMetaIssues(messages, [{ id: "home" }], () => ["en", "sl"]);
  assert.ok(
    issues.some(
      (issue) =>
        issue.includes("en home title") && issue.includes("an English page")
    )
  );
  assert.ok(issues.every((issue) => !issue.includes("a English")));
});

test("K-tour descriptions publish no climb or distance figures", () => {
  const locales = loadLocales();
  const figure = /\d+\s*km|\d+\s*m\b/i;
  for (const locale of ["en", "sl"]) {
    for (const [id, meta] of Object.entries(locales[locale].meta.pages)) {
      if (!/^tour-k\d+-/.test(id)) continue;
      assert.doesNotMatch(meta.description, figure, `${locale} ${id}`);
    }
    for (const [slug, route] of Object.entries(locales[locale].routes)) {
      if (!/^k\d+-/.test(slug) || !route.metaDescription) continue;
      assert.doesNotMatch(route.metaDescription, figure, `${locale} routes.${slug}`);
    }
  }
});

test("tour og:image uses the generated JPG; other pages keep the default", () => {
  assert.equal(
    absoluteOgImage(SITE_ORIGIN, tourOgPath("jezerski-vrh")),
    `${SITE_ORIGIN}/assets/images/og/tours/jezerski-vrh.jpg`
  );
  assert.equal(
    absoluteOgImage(SITE_ORIGIN, ""),
    `${SITE_ORIGIN}/assets/images/home/hero.jpg`
  );
});

test("every tour with its own photo has a unique 1200×630 JPEG", () => {
  const hashes = new Set();
  assert.equal(ROUTES.length, 20);
  const own = ROUTES.filter((route) => tourHasOwnOg(route.slug));
  assert.equal(own.length, 19);
  assert.equal(fs.existsSync(path.join(OG_DIR, "k53-kriva-jelka.jpg")), false);
  for (const route of own) {
    const file = path.join(OG_DIR, `${route.slug}.jpg`);
    const buf = fs.readFileSync(file);
    assert.deepEqual(jpegSize(buf), { width: TOUR_OG_WIDTH, height: TOUR_OG_HEIGHT });
    const hash = require("crypto").createHash("sha256").update(buf).digest("hex");
    hashes.add(hash);
  }
  assert.equal(hashes.size, own.length);
});

test("sitemap sources include locales, routes.js, and legal-src", () => {
  const tour = pageContentPaths(PAGES.find((page) => page.routeSlug === "k43-dobrca"));
  assert.ok(tour.includes("content/featured-routes/featured/k43-dobrca"));
  assert.ok(tour.includes("rebuild/scripts/routes.js"));
  assert.ok(tour.includes("rebuild/locales/en.json"));
  assert.ok(tour.includes("rebuild/locales/sl.json"));

  const legal = pageContentPaths(PAGES.find((page) => page.legalDoc === "privacy-policy"));
  assert.ok(legal.includes("rebuild/legal-src/privacy-policy.en.md"));
  assert.ok(legal.includes("rebuild/legal-src/privacy-policy.sl.md"));
  assert.ok(legal.includes("rebuild/locales/en.json"));

  const hub = pageContentPaths(PAGES.find((page) => page.id === "legal"));
  assert.ok(hub.includes("rebuild/legal-src"));
});

test("a shallow clone does not use the boundary commit as lastmod", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "zyflow-shallow-"));
  const repo = path.join(root, "src");
  const shallow = path.join(root, "shallow");
  fs.mkdirSync(repo);
  const git = (cwd, args, env = {}) =>
    execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      env: { ...process.env, ...env },
    });
  git(repo, ["init", "-b", "main"]);
  git(repo, ["config", "user.email", "qa@example.com"]);
  git(repo, ["config", "user.name", "QA"]);
  fs.writeFileSync(path.join(repo, "a.txt"), "one\n");
  git(repo, ["add", "a.txt"]);
  git(repo, ["commit", "-m", "old"], {
    GIT_AUTHOR_DATE: "2020-01-15T12:00:00",
    GIT_COMMITTER_DATE: "2020-01-15T12:00:00",
  });
  fs.writeFileSync(path.join(repo, "a.txt"), "two\n");
  git(repo, ["commit", "-am", "new"], {
    GIT_AUTHOR_DATE: "2024-06-01T12:00:00",
    GIT_COMMITTER_DATE: "2024-06-01T12:00:00",
  });
  git(root, ["clone", "--depth", "1", "--no-local", repo, shallow]);
  try {
    assert.equal(repositoryIsShallow(repo), false);
    assert.equal(repositoryIsShallow(shallow), true);
    const boundary = git(shallow, ["log", "-1", "--format=%cs"]).trim();
    assert.equal(boundary, "2024-06-01");
    const resolved = resolveSitemapLastmod({
      shallow: true,
      gitDate: boundary,
      buildDate: "2026-10-20",
    });
    assert.notEqual(resolved, boundary);
    assert.equal(resolved, "");
    assert.equal(
      resolveSitemapLastmod({ shallow: false, gitDate: boundary, buildDate: "2026-10-20" }),
      boundary
    );
    assert.equal(
      resolveSitemapLastmod({ shallow: false, gitDate: "", buildDate: "2026-10-20" }),
      "2026-10-20"
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("built tour pages ship their own description, alt text, and 1200×630 image", () => {
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), "zyflow-meta-"));
  execFileSync(process.execPath, [path.join(__dirname, "build.js")], {
    env: { ...process.env, REBUILD_DIST: dist },
    stdio: "pipe",
  });

  const read = (rel) => fs.readFileSync(path.join(dist, rel), "utf8");
  const desc = (html) => html.match(/<meta name="description" content="([^"]*)"/)[1];
  const image = (html) => html.match(/<meta property="og:image" content="([^"]*)"/)[1];
  const title = (html) => html.match(/<title>([^<]*)<\/title>/)[1];
  const prop = (html, name) =>
    html.match(new RegExp(`<meta property="${name}" content="([^"]*)"`))[1];
  const named = (html, name) =>
    html.match(new RegExp(`<meta name="${name}" content="([^"]*)"`))[1];

  const jezerski = read("tours/jezerski-vrh.html");
  assert.equal(
    desc(jezerski),
    "Jezerski vrh to Ankova planina, a panorama above Ravenska Kočna: 18.2 km and 457 m of climbing. Open in Zyflow."
  );
  assert.equal(
    image(jezerski),
    `${SITE_ORIGIN}/assets/images/og/tours/jezerski-vrh.jpg`
  );
  assert.equal(prop(jezerski, "og:image:width"), "1200");
  assert.equal(prop(jezerski, "og:image:height"), "630");
  assert.equal(prop(jezerski, "og:image:type"), "image/jpeg");
  assert.equal(
    prop(jezerski, "og:image:alt"),
    "Cover photo: Jezerski vrh – Ankova planina"
  );
  assert.equal(named(jezerski, "twitter:image:alt"), prop(jezerski, "og:image:alt"));
  assert.match(title(jezerski), /Jezerski vrh/);

  const virnik = read("tours/spodnji-virnik.html");
  assert.equal(title(virnik), "Spodnji Virnik – tufa quarry | Zyflow");
  assert.match(desc(virnik), /tufa quarry/);
  assert.doesNotMatch(desc(virnik), /Kehnjak/);
  assert.equal(prop(virnik, "og:image:width"), "1200");

  const home = read("index.html");
  assert.equal(image(home), `${SITE_ORIGIN}/assets/images/home/hero.jpg`);
  assert.equal(prop(home, "og:image:width"), "1024");
  assert.equal(prop(home, "og:image:height"), "680");
  assert.equal(prop(home, "og:image:type"), "image/jpeg");
  assert.match(prop(home, "og:image:alt"), /bike-friendly/);
  assert.equal(named(home, "twitter:image:alt"), prop(home, "og:image:alt"));

  const k53 = read("tours/k53-kriva-jelka.html");
  assert.equal(image(k53), `${SITE_ORIGIN}/assets/images/home/hero.jpg`);
  assert.equal(prop(k53, "og:image:width"), "1024");
  assert.equal(prop(k53, "og:image:height"), "680");
  assert.equal(prop(k53, "og:image:type"), "image/jpeg");
  assert.equal(prop(k53, "og:image:alt"), prop(home, "og:image:alt"));
  assert.equal(named(k53, "twitter:image:alt"), prop(k53, "og:image:alt"));

  const legal = read("sl/legal.html");
  assert.equal(
    desc(legal),
    "Politika zasebnosti, politika piškotkov in pogoji uporabe za Zyflow in HERKO d.o.o."
  );
  assert.equal(image(legal), `${SITE_ORIGIN}/assets/images/home/hero.jpg`);

  const slPrivacy = read("sl/legal-privacy.html");
  assert.equal(title(slPrivacy), "Zyflow, Politika zasebnosti");
  const slCookies = read("sl/legal-cookies.html");
  assert.equal(title(slCookies), "Zyflow, Politika piškotkov");

  const slJezerski = read("sl/tours/jezerski-vrh.html");
  assert.match(desc(slJezerski), /Odpri pot v aplikaciji Zyflow/);
  assert.match(desc(slJezerski), /vzpona/);
  assert.equal(image(slJezerski), image(jezerski));
  assert.equal(
    prop(slJezerski, "og:image:alt"),
    "Naslovna fotografija: Jezerski vrh – Ankova planina"
  );
  assert.equal(named(slJezerski, "twitter:image:alt"), prop(slJezerski, "og:image:alt"));

  const slK53 = read("sl/tours/k53-kriva-jelka.html");
  assert.equal(image(slK53), `${SITE_ORIGIN}/assets/images/home/hero.jpg`);
  assert.match(prop(slK53, "og:image:alt"), /kolesarjem prijazni/);
  assert.equal(named(slK53, "twitter:image:alt"), prop(slK53, "og:image:alt"));

  const slMali = read("sl/tours/mali-vrh.html");
  assert.match(
    desc(slMali),
    /^Z Zgornjega Jezerskega do razgledišča pod Malim vrhom: 17,3 km in 596 m vzpona\./
  );
  const slVirnik = read("sl/tours/spodnji-virnik.html");
  assert.equal(title(slVirnik), "Spodnji Virnik – kamnolom lehnjaka | Zyflow");
  assert.match(desc(slVirnik), /ekološke kmetije Spodnji Virnik: 9,4 km in 304 m vzpona/);
  assert.doesNotMatch(desc(slVirnik), /Kehnjak/);

  const slBlog = read("sl/blog/planning-your-first-battery-aware-day-ride.html");
  assert.equal(title(slBlog), "Zyflow: Načrtovanje prve dnevne ture glede na baterijo");
  assert.match(desc(slBlog), /boš zares izpeljal/);

  function jsonLd(html) {
    const blocks = [...html.matchAll(/<script type="application\/ld\+json">([^<]*)<\/script>/g)];
    assert.equal(blocks.length, 1);
    return JSON.parse(blocks[0][1]);
  }

  const homeLd = jsonLd(home);
  assert.equal(homeLd["@graph"].length, 1);
  assert.equal(homeLd["@graph"][0]["@type"], "Organization");
  assert.equal(homeLd["@graph"][0].legalName, "HERKO d.o.o.");

  const tripLd = jsonLd(jezerski);
  const types = tripLd["@graph"].map((node) => node["@type"]);
  assert.deepEqual(types, ["Organization", "BreadcrumbList", "TouristTrip"]);
  const crumbs = tripLd["@graph"][1].itemListElement;
  assert.equal(crumbs.length, 3);
  assert.equal(crumbs[2].name, "Jezerski vrh");
  assert.equal(crumbs[2].item, `${SITE_ORIGIN}/tours/jezerski-vrh`);
  const trip = tripLd["@graph"][2];
  assert.equal(trip.name, "Jezerski vrh");
  assert.match(trip.description, /Ankova planina/);
  assert.equal(trip.distance, undefined);
  assert.equal(trip.additionalProperty, undefined);
  assert.equal(trip.itinerary.name, "Jezersko");
  assert.equal(trip.touristType, "Alpine");
  const imageRel = trip.image.slice(SITE_ORIGIN.length);
  assert.match(imageRel, /^\/assets\/images\/opt\/[a-f0-9]{12}\/fallback\.(?:jpe?g|webp|png)$/);
  assert.doesNotMatch(imageRel, /\/tours\/[^/]+\/cover\./);
  const imageFile = path.join(dist, imageRel.slice(1));
  assert.equal(fs.existsSync(imageFile), true);
  assert.ok(fs.statSync(imageFile).size < 500 * 1024);
  assert.match(jezerski, new RegExp(`src="${imageRel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
  assert.equal(
    fs.existsSync(path.join(dist, "assets/images/tours/jezerski-vrh/cover.jpg")),
    false
  );
  const slTrip = jsonLd(slJezerski)["@graph"][2];
  assert.equal(slTrip.touristType, "Alpska");
  assert.equal(slTrip.distance, undefined);
  assert.equal(slTrip.additionalProperty, undefined);
  assert.equal(slTrip.image, trip.image);
  assert.match(jezerski, /alt="Jezerski vrh, cycling route, Jezersko"/);
  assert.match(slJezerski, /alt="Jezerski vrh, kolesarska pot, Jezersko"/);
  const k35 = read("tours/k35-prelaz-ljubelj.html");
  const k51 = read("tours/k51-udin-borst.html");
  assert.match(k35, /alt="Prelaz Ljubelj, cycling route, Tržič, Ljubelj"/);
  assert.match(k51, /alt="Udin boršt, cycling route, Tržič, Udin boršt"/);
  for (const alt of [...k35.matchAll(/\balt="([^"]*)"/g), ...k51.matchAll(/\balt="([^"]*)"/g)]) {
    assert.doesNotMatch(alt[1], /[→·]/);
  }
  const k43 = read("tours/k43-dobrca.html");
  const slK43 = read("sl/tours/k43-dobrca.html");
  assert.match(k43, /26\.9/);
  assert.doesNotMatch(k43, /35\.1/);
  assert.match(slK43, /26,9/);
  assert.doesNotMatch(slK43, /35,1/);
  const slK43Trip = jsonLd(slK43)["@graph"][2];
  assert.equal(slK43Trip.distance, undefined);
  assert.match(jezerski, /href="\/tours\/ravenska-kocna"/);
  assert.match(jezerski, /href="\/tours\/spodnji-virnik"/);

  const sitemap = read("sitemap.xml");
  assert.doesNotMatch(sitemap, /<lastmod><\/lastmod>/);
  if (repositoryIsShallow()) {
    const boundary = execFileSync("git", ["log", "-1", "--format=%cs"], { encoding: "utf8" }).trim();
    assert.doesNotMatch(sitemap, /<lastmod>/);
    assert.doesNotMatch(sitemap, new RegExp(`<lastmod>${boundary}</lastmod>`));
  } else {
    const jezerskiPage = PAGES.find((page) => page.routeSlug === "jezerski-vrh");
    const expectedMod = execFileSync(
      "git",
      ["log", "-1", "--format=%cs", "--", ...pageContentPaths(jezerskiPage)],
      { encoding: "utf8" }
    ).trim();
    const jezerskiMod = sitemap.match(
      /<loc>https:\/\/www\.zyflow\.eu\/tours\/jezerski-vrh<\/loc>\s*<lastmod>(\d{4}-\d{2}-\d{2})<\/lastmod>/
    );
    assert.ok(jezerskiMod, "tour lastmod missing");
    assert.equal(jezerskiMod[1], expectedMod);
    const legalPage = PAGES.find((page) => page.legalDoc === "privacy-policy");
    const legalExpected = execFileSync(
      "git",
      ["log", "-1", "--format=%cs", "--", ...pageContentPaths(legalPage)],
      { encoding: "utf8" }
    ).trim();
    const legalMod = sitemap.match(
      /<loc>https:\/\/www\.zyflow\.eu\/legal-pages\/privacy-policy<\/loc>\s*<lastmod>(\d{4}-\d{2}-\d{2})<\/lastmod>/
    );
    assert.ok(legalMod, "legal lastmod missing");
    assert.equal(legalMod[1], legalExpected);
  }
});
