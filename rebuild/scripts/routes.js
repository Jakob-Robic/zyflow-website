/**
 * Featured Gorenjska routes — generated from content/featured-routes.
 * Deep link contract: https://navigate.zyflow.eu/login?next=/route/{slug}
 *
 * distanceKm is the figure already published on the page, or, when that
 * figure was missing, the GPX length of the main loop (sum of haversine
 * segments, rounded to 0.1 km). K43 is that main loop only (26.9 km),
 * not the optional K43a descent. Climb is never filled from GPX here.
 * related is the next routes in the same municipality so each tour is
 * linked from another tour page.
 */
/** @typedef {{ id: string, slug: string, municipality: string, category: string, difficulty: string, region: string, cover: string, gallery: string[], gpx: string, deepLink: string, featuredHome: boolean, related: string[], distanceKm: string, elevationM: string }} RouteDef */

/** @type {RouteDef[]} */
const ROUTES = [
  {
    "id": "tour-blejcanka",
    "slug": "blejcanka",
    "municipality": "kranj",
    "category": "tour",
    "difficulty": "intermediate",
    "region": "slovenia",
    "cover": "./assets/images/tours/blejcanka/cover.webp",
    "gallery": [
      "./assets/images/tours/blejcanka/gallery/01.jpg",
      "./assets/images/tours/blejcanka/gallery/02.jpg",
      "./assets/images/tours/blejcanka/gallery/03.jpg"
    ],
    "gpx": "./assets/gpx/blejcanka.gpx",
    "deepLink": "https://navigate.zyflow.eu/login?next=/route/blejcanka",
    "featuredHome": false,
    "related": [
      "jezerjanka",
      "kamnicanka",
      "ljubljancanka"
    ],
    "distanceKm": "79",
    "elevationM": "944"
  },
  {
    "id": "tour-jezerjanka",
    "slug": "jezerjanka",
    "municipality": "kranj",
    "category": "tour",
    "difficulty": "intermediate",
    "region": "slovenia",
    "cover": "./assets/images/tours/jezerjanka/cover.jpg",
    "gallery": [
      "./assets/images/tours/jezerjanka/gallery/01.jpg",
      "./assets/images/tours/jezerjanka/gallery/02.jpg",
      "./assets/images/tours/jezerjanka/gallery/03.jpg"
    ],
    "gpx": "./assets/gpx/jezerjanka.gpx",
    "deepLink": "https://navigate.zyflow.eu/login?next=/route/jezerjanka",
    "featuredHome": false,
    "related": [
      "kamnicanka",
      "ljubljancanka",
      "locanka"
    ],
    "distanceKm": "76",
    "elevationM": "603"
  },
  {
    "id": "tour-jezerski-vrh",
    "slug": "jezerski-vrh",
    "municipality": "jezersko",
    "category": "alpine",
    "difficulty": "intermediate",
    "region": "slovenia",
    "cover": "./assets/images/tours/jezerski-vrh/cover.jpg",
    "gallery": [
      "./assets/images/tours/jezerski-vrh/gallery/01.jpg",
      "./assets/images/tours/jezerski-vrh/gallery/02.jpg"
    ],
    "gpx": "./assets/gpx/jezerski-vrh.gpx",
    "deepLink": "https://navigate.zyflow.eu/login?next=/route/jezerski-vrh",
    "featuredHome": false,
    "related": [
      "mali-vrh",
      "ravenska-kocna",
      "spodnji-virnik"
    ],
    "distanceKm": "18.2",
    "elevationM": "457"
  },
  {
    "id": "tour-k11-planine-pod-kosuto",
    "slug": "k11-planine-pod-kosuto",
    "municipality": "trzic",
    "category": "alpine",
    "difficulty": "hard",
    "region": "slovenia",
    "cover": "./assets/images/tours/k11-planine-pod-kosuto/cover.jpg",
    "gallery": [],
    "gpx": "./assets/gpx/k11-planine-pod-kosuto.gpx",
    "deepLink": "https://navigate.zyflow.eu/login?next=/route/k11-planine-pod-kosuto",
    "featuredHome": false,
    "related": [
      "k16-trzic-jezersko",
      "k21-dom-pod-storzicem",
      "k35-prelaz-ljubelj"
    ],
    "distanceKm": "39.7",
    "elevationM": "1740"
  },
  {
    "id": "tour-k16-trzic-jezersko",
    "slug": "k16-trzic-jezersko",
    "municipality": "trzic",
    "category": "alpine",
    "difficulty": "hard",
    "region": "slovenia",
    "cover": "./assets/images/tours/k16-trzic-jezersko/cover.jpg",
    "gallery": [],
    "gpx": "./assets/gpx/k16-trzic-jezersko.gpx",
    "deepLink": "https://navigate.zyflow.eu/login?next=/route/k16-trzic-jezersko",
    "featuredHome": false,
    "related": [
      "k21-dom-pod-storzicem",
      "k35-prelaz-ljubelj",
      "k42-roznovenska"
    ],
    "distanceKm": "28.1",
    "elevationM": "1299"
  },
  {
    "id": "tour-k21-dom-pod-storzicem",
    "slug": "k21-dom-pod-storzicem",
    "municipality": "trzic",
    "category": "alpine",
    "difficulty": "intermediate",
    "region": "slovenia",
    "cover": "./assets/images/tours/k21-dom-pod-storzicem/cover.jpg",
    "gallery": [],
    "gpx": "./assets/gpx/k21-dom-pod-storzicem.gpx",
    "deepLink": "https://navigate.zyflow.eu/login?next=/route/k21-dom-pod-storzicem",
    "featuredHome": false,
    "related": [
      "k35-prelaz-ljubelj",
      "k42-roznovenska",
      "k43-dobrca"
    ],
    "distanceKm": "18.1",
    "elevationM": "280"
  },
  {
    "id": "tour-k35-prelaz-ljubelj",
    "slug": "k35-prelaz-ljubelj",
    "municipality": "trzic",
    "category": "alpine",
    "difficulty": "intermediate",
    "region": "slovenia",
    "cover": "./assets/images/tours/k35-prelaz-ljubelj/cover.jpg",
    "gallery": [],
    "gpx": "./assets/gpx/k35-prelaz-ljubelj.gpx",
    "deepLink": "https://navigate.zyflow.eu/login?next=/route/k35-prelaz-ljubelj",
    "featuredHome": true,
    "related": [
      "k42-roznovenska",
      "k43-dobrca",
      "k51-udin-borst"
    ],
    "distanceKm": "",
    "elevationM": "803"
  },
  {
    "id": "tour-k42-roznovenska",
    "slug": "k42-roznovenska",
    "municipality": "trzic",
    "category": "tour",
    "difficulty": "intermediate",
    "region": "slovenia",
    "cover": "./assets/images/tours/k42-roznovenska/cover.jpg",
    "gallery": [],
    "gpx": "./assets/gpx/k42-roznovenska.gpx",
    "deepLink": "https://navigate.zyflow.eu/login?next=/route/k42-roznovenska",
    "featuredHome": false,
    "related": [
      "k43-dobrca",
      "k51-udin-borst",
      "k52-pot-treh-zvonov"
    ],
    "distanceKm": "20.1",
    "elevationM": "369"
  },
  {
    "id": "tour-k43-dobrca",
    "slug": "k43-dobrca",
    "municipality": "trzic",
    "category": "alpine",
    "difficulty": "intermediate",
    "region": "slovenia",
    "cover": "./assets/images/tours/k43-dobrca/cover.jpg",
    "gallery": [],
    "gpx": "./assets/gpx/k43-dobrca.gpx",
    "deepLink": "https://navigate.zyflow.eu/login?next=/route/k43-dobrca",
    "featuredHome": false,
    "related": [
      "k51-udin-borst",
      "k52-pot-treh-zvonov",
      "k53-kriva-jelka"
    ],
    "distanceKm": "26.9",
    "elevationM": "2067"
  },
  {
    "id": "tour-k51-udin-borst",
    "slug": "k51-udin-borst",
    "municipality": "trzic",
    "category": "gravel",
    "difficulty": "easy",
    "region": "slovenia",
    "cover": "./assets/images/tours/k51-udin-borst/cover.jpg",
    "gallery": [],
    "gpx": "./assets/gpx/k51-udin-borst.gpx",
    "deepLink": "https://navigate.zyflow.eu/login?next=/route/k51-udin-borst",
    "featuredHome": false,
    "related": [
      "k52-pot-treh-zvonov",
      "k53-kriva-jelka",
      "k55-gozd-udin-borst"
    ],
    "distanceKm": "25.3",
    "elevationM": "286"
  },
  {
    "id": "tour-k52-pot-treh-zvonov",
    "slug": "k52-pot-treh-zvonov",
    "municipality": "trzic",
    "category": "tour",
    "difficulty": "easy",
    "region": "slovenia",
    "cover": "./assets/images/tours/k52-pot-treh-zvonov/cover.jpg",
    "gallery": [],
    "gpx": "./assets/gpx/k52-pot-treh-zvonov.gpx",
    "deepLink": "https://navigate.zyflow.eu/login?next=/route/k52-pot-treh-zvonov",
    "featuredHome": false,
    "related": [
      "k53-kriva-jelka",
      "k55-gozd-udin-borst",
      "k11-planine-pod-kosuto"
    ],
    "distanceKm": "10",
    "elevationM": "144"
  },
  {
    "id": "tour-k53-kriva-jelka",
    "slug": "k53-kriva-jelka",
    "municipality": "trzic",
    "category": "gravel",
    "difficulty": "easy",
    "region": "slovenia",
    "cover": "./assets/images/tours/k53-kriva-jelka/cover.jpg",
    "gallery": [],
    "gpx": "./assets/gpx/k53-kriva-jelka.gpx",
    "deepLink": "https://navigate.zyflow.eu/login?next=/route/k53-kriva-jelka",
    "featuredHome": false,
    "related": [
      "k55-gozd-udin-borst",
      "k11-planine-pod-kosuto",
      "k16-trzic-jezersko"
    ],
    "distanceKm": "24",
    "elevationM": "386"
  },
  {
    "id": "tour-k55-gozd-udin-borst",
    "slug": "k55-gozd-udin-borst",
    "municipality": "trzic",
    "category": "gravel",
    "difficulty": "easy",
    "region": "slovenia",
    "cover": "./assets/images/tours/k55-gozd-udin-borst/cover.jpg",
    "gallery": [],
    "gpx": "./assets/gpx/k55-gozd-udin-borst.gpx",
    "deepLink": "https://navigate.zyflow.eu/login?next=/route/k55-gozd-udin-borst",
    "featuredHome": false,
    "related": [
      "k11-planine-pod-kosuto",
      "k16-trzic-jezersko",
      "k21-dom-pod-storzicem"
    ],
    "distanceKm": "26.9",
    "elevationM": "763"
  },
  {
    "id": "tour-kamnicanka",
    "slug": "kamnicanka",
    "municipality": "kranj",
    "category": "tour",
    "difficulty": "easy",
    "region": "slovenia",
    "cover": "./assets/images/tours/kamnicanka/cover.webp",
    "gallery": [
      "./assets/images/tours/kamnicanka/gallery/01.jpg",
      "./assets/images/tours/kamnicanka/gallery/02.jpg",
      "./assets/images/tours/kamnicanka/gallery/03.jpg"
    ],
    "gpx": "./assets/gpx/kamnicanka.gpx",
    "deepLink": "https://navigate.zyflow.eu/login?next=/route/kamnicanka",
    "featuredHome": true,
    "related": [
      "ljubljancanka",
      "locanka",
      "trzicanka"
    ],
    "distanceKm": "70",
    "elevationM": "254"
  },
  {
    "id": "tour-ljubljancanka",
    "slug": "ljubljancanka",
    "municipality": "kranj",
    "category": "tour",
    "difficulty": "intermediate",
    "region": "slovenia",
    "cover": "./assets/images/tours/ljubljancanka/cover.jpg",
    "gallery": [
      "./assets/images/tours/ljubljancanka/gallery/01.jpg",
      "./assets/images/tours/ljubljancanka/gallery/02.jpg"
    ],
    "gpx": "./assets/gpx/ljubljancanka.gpx",
    "deepLink": "https://navigate.zyflow.eu/login?next=/route/ljubljancanka",
    "featuredHome": false,
    "related": [
      "locanka",
      "trzicanka",
      "blejcanka"
    ],
    "distanceKm": "70",
    "elevationM": "460"
  },
  {
    "id": "tour-locanka",
    "slug": "locanka",
    "municipality": "kranj",
    "category": "tour",
    "difficulty": "intermediate",
    "region": "slovenia",
    "cover": "./assets/images/tours/locanka/cover.webp",
    "gallery": [
      "./assets/images/tours/locanka/gallery/01.jpg",
      "./assets/images/tours/locanka/gallery/02.jpg",
      "./assets/images/tours/locanka/gallery/03.jpg"
    ],
    "gpx": "./assets/gpx/locanka.gpx",
    "deepLink": "https://navigate.zyflow.eu/login?next=/route/locanka",
    "featuredHome": false,
    "related": [
      "trzicanka",
      "blejcanka",
      "jezerjanka"
    ],
    "distanceKm": "64",
    "elevationM": "930"
  },
  {
    "id": "tour-mali-vrh",
    "slug": "mali-vrh",
    "municipality": "jezersko",
    "category": "tour",
    "difficulty": "easy",
    "region": "slovenia",
    "cover": "./assets/images/tours/mali-vrh/cover.jpg",
    "gallery": [
      "./assets/images/tours/mali-vrh/gallery/01.jpg",
      "./assets/images/tours/mali-vrh/gallery/02.jpg"
    ],
    "gpx": "./assets/gpx/mali-vrh.gpx",
    "deepLink": "https://navigate.zyflow.eu/login?next=/route/mali-vrh",
    "featuredHome": true,
    "related": [
      "ravenska-kocna",
      "spodnji-virnik",
      "jezerski-vrh"
    ],
    "distanceKm": "17.3",
    "elevationM": "596"
  },
  {
    "id": "tour-ravenska-kocna",
    "slug": "ravenska-kocna",
    "municipality": "jezersko",
    "category": "alpine",
    "difficulty": "intermediate",
    "region": "slovenia",
    "cover": "./assets/images/tours/ravenska-kocna/cover.jpg",
    "gallery": [
      "./assets/images/tours/ravenska-kocna/gallery/01.jpg",
      "./assets/images/tours/ravenska-kocna/gallery/02.jpg"
    ],
    "gpx": "./assets/gpx/ravenska-kocna.gpx",
    "deepLink": "https://navigate.zyflow.eu/login?next=/route/ravenska-kocna",
    "featuredHome": false,
    "related": [
      "spodnji-virnik",
      "jezerski-vrh",
      "mali-vrh"
    ],
    "distanceKm": "16.6",
    "elevationM": "408"
  },
  {
    "id": "tour-spodnji-virnik",
    "slug": "spodnji-virnik",
    "municipality": "jezersko",
    "category": "tour",
    "difficulty": "easy",
    "region": "slovenia",
    "cover": "./assets/images/tours/spodnji-virnik/cover.jpg",
    "gallery": [
      "./assets/images/tours/spodnji-virnik/gallery/01.jpg",
      "./assets/images/tours/spodnji-virnik/gallery/02.jpg"
    ],
    "gpx": "./assets/gpx/spodnji-virnik.gpx",
    "deepLink": "https://navigate.zyflow.eu/login?next=/route/spodnji-virnik",
    "featuredHome": false,
    "related": [
      "jezerski-vrh",
      "mali-vrh",
      "ravenska-kocna"
    ],
    "distanceKm": "9.4",
    "elevationM": "304"
  },
  {
    "id": "tour-trzicanka",
    "slug": "trzicanka",
    "municipality": "kranj",
    "category": "tour",
    "difficulty": "intermediate",
    "region": "slovenia",
    "cover": "./assets/images/tours/trzicanka/cover.jpg",
    "gallery": [
      "./assets/images/tours/trzicanka/gallery/00_old_square.jpg",
      "./assets/images/tours/trzicanka/gallery/02.jpg",
      "./assets/images/tours/trzicanka/gallery/03.jpg"
    ],
    "gpx": "./assets/gpx/trzicanka.gpx",
    "deepLink": "https://navigate.zyflow.eu/login?next=/route/trzicanka",
    "featuredHome": false,
    "related": [
      "blejcanka",
      "jezerjanka",
      "kamnicanka"
    ],
    "distanceKm": "68",
    "elevationM": ""
  }
];

function routeBySlug(slug) {
  const found = ROUTES.find((r) => r.slug === slug);
  if (!found) throw new Error(`Unknown route slug: ${slug}`);
  return found;
}

const ROUTE_PAGES = ROUTES.map((route) => ({
  id: route.id,
  file: "tour.html",
  out: `tours/${route.slug}.html`,
  path: `/tours/${route.slug}`,
  indexable: true,
  routeSlug: route.slug,
}));

const FEATURED_HOME_SLUGS = ROUTES.filter((r) => r.featuredHome).map((r) => r.slug);

module.exports = {
  ROUTES,
  ROUTE_PAGES,
  FEATURED_HOME_SLUGS,
  routeBySlug,
};
