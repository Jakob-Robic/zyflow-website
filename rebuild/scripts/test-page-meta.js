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
  TOUR_OG_WIDTH,
  TOUR_OG_HEIGHT,
} = require("./page-meta");

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

test("every tour Open Graph image is a unique 1200×630 JPEG", () => {
  const hashes = new Set();
  assert.equal(ROUTES.length, 20);
  for (const route of ROUTES) {
    const file = path.join(OG_DIR, `${route.slug}.jpg`);
    const buf = fs.readFileSync(file);
    assert.deepEqual(jpegSize(buf), { width: TOUR_OG_WIDTH, height: TOUR_OG_HEIGHT });
    const hash = require("crypto").createHash("sha256").update(buf).digest("hex");
    hashes.add(hash);
  }
  assert.equal(hashes.size, ROUTES.length);
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
  assert.match(title(jezerski), /Jezerski vrh/);

  const virnik = read("tours/spodnji-virnik.html");
  assert.equal(title(virnik), "Zyflow: Spodnji Virnik – tufa quarry");
  assert.match(desc(virnik), /tufa quarry/);
  assert.doesNotMatch(desc(virnik), /Kehnjak/);
  assert.equal(prop(virnik, "og:image:width"), "1200");

  const home = read("index.html");
  assert.equal(image(home), `${SITE_ORIGIN}/assets/images/home/hero.jpg`);
  assert.equal(prop(home, "og:image:width"), "1024");
  assert.equal(prop(home, "og:image:height"), "680");
  assert.equal(prop(home, "og:image:type"), "image/jpeg");
  assert.match(prop(home, "og:image:alt"), /bike-friendly/);

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
    "Naslovna fotografija: Jezerski vrh in Ankova planina"
  );

  const slMali = read("sl/tours/mali-vrh.html");
  assert.match(
    desc(slMali),
    /^Z Zgornjega Jezerskega do razgledišča pod Malim vrhom: 17,3 km in 596 m vzpona\./
  );
  const slVirnik = read("sl/tours/spodnji-virnik.html");
  assert.equal(title(slVirnik), "Zyflow: Spodnji Virnik in kamnolom lehnjaka");
  assert.match(desc(slVirnik), /ekološke kmetije Spodnji Virnik: 9,4 km in 304 m vzpona/);
  assert.doesNotMatch(desc(slVirnik), /Kehnjak/);

  const slBlog = read("sl/blog/planning-your-first-battery-aware-day-ride.html");
  assert.equal(title(slBlog), "Zyflow: Načrtovanje prve dnevne ture glede na baterijo");
  assert.match(desc(slBlog), /boš zares izpeljal/);
});
