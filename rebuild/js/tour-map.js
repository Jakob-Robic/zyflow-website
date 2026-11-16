/**
 * Tour detail hero map — embedded GPX route + stop pins.
 * Drawn with the design-system map kit (/assets/design-system/map/), so the
 * base map, route line, start/end markers and POI pins match the mobile app.
 * MapLibre is self-hosted; Overpass enriches pins in the background (cached).
 */
(function () {
  const MAPLIBRE_CSS = "/assets/vendor/maplibre-gl/maplibre-gl.css";
  const MAPLIBRE_JS = "/assets/vendor/maplibre-gl/maplibre-gl.js";
  const MAP_KIT_CSS = "/assets/design-system/map/map-kit.css";
  const MAP_KIT_JS = "/assets/design-system/map/map-kit.js";
  const MAP_PINS_PATH = "/assets/design-system/map-pins/";
  /** Base map when no MapTiler key is configured or MapTiler is unreachable. */
  const OPENFREEMAP_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";
  /**
   * Client-side MapTiler key (restricted to Zyflow domains in MapTiler).
   * rebuild/scripts/build.js fills this from the MAPTILER_KEY env var at build
   * time. Never commit a real key here.
   */
  const MAPTILER_KEY = "";
  const STOP_COUNT = 12;
  const STOPS_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
  const STOPS_CACHE_PREFIX = "zyflow-tour-stops:v1:";

  /**
   * Website stop kinds (OSM amenity / tourism / shop values) → design-system
   * place types. Kinds not listed get a numbered stop marker.
   */
  const KIND_TO_PLACE_TYPE = {
    cafe: "cafe",
    restaurant: "restaurant",
    biergarten: "food",
    fast_food: "food",
    hotel: "accommodation",
    guest_house: "accommodation",
    apartment: "accommodation",
    hostel: "accommodation",
    camp_site: "accommodation",
    charging_station: "charging_station",
    bicycle: "bicycle_shop",
  };

  let maplibrePromise = null;
  let kitPromise = null;
  let stylePromise = null;
  let warnedNoKey = false;

  /** Last-resort style if no base map is reachable. */
  const FALLBACK_STYLE = {
    version: 8,
    sources: {},
    layers: [
      {
        id: "background",
        type: "background",
        paint: { "background-color": "#f0eee6" },
      },
    ],
  };

  function loadCss(href) {
    // Match only stylesheets: build.js also emits <link rel="preload"> for
    // these files, and a preload alone never applies the CSS.
    if (document.querySelector(`link[rel="stylesheet"][href="${href}"]`)) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    document.head.appendChild(link);
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (window.maplibregl) {
        resolve();
        return;
      }
      const existing = document.querySelector(`script[src="${src}"]`);
      if (existing) {
        existing.addEventListener("load", () => resolve());
        existing.addEventListener("error", reject);
        return;
      }
      const s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  function ensureMapLibre() {
    if (!maplibrePromise) {
      loadCss(MAPLIBRE_CSS);
      maplibrePromise = loadScript(MAPLIBRE_JS);
    }
    return maplibrePromise;
  }

  function ensureMapKit() {
    if (!kitPromise) {
      loadCss(MAP_KIT_CSS);
      kitPromise = import(MAP_KIT_JS);
    }
    return kitPromise;
  }

  /**
   * The app's base map: MapTiler streets-v2 with the app's hidden layers
   * (calm, like the route hero). Without a key, or if MapTiler can't be
   * reached, fall back to OpenFreeMap so the map is never blank.
   */
  function resolveBaseStyle(zyMap) {
    if (!stylePromise) {
      stylePromise = (async () => {
        const key = (MAPTILER_KEY || "").trim();
        if (!key) {
          if (!warnedNoKey) {
            warnedNoKey = true;
            console.warn(
              "[tour-map] MAPTILER_KEY not set at build time; using the OpenFreeMap fallback base map."
            );
          }
          return OPENFREEMAP_STYLE_URL;
        }
        const style = await zyMap.loadStyle(zyMap.styleUrl({ key }), {
          calm: true,
        });
        if (typeof style === "string") {
          console.warn(
            "[tour-map] MapTiler style unavailable; using the OpenFreeMap fallback base map."
          );
          return OPENFREEMAP_STYLE_URL;
        }
        return style;
      })();
    }
    return stylePromise;
  }

  function parseGpx(xmlText) {
    const doc = new DOMParser().parseFromString(xmlText, "application/xml");
    if (doc.querySelector("parsererror")) throw new Error("Invalid GPX");
    const pts = [...doc.querySelectorAll("trkpt, rtept")].map((el) => [
      parseFloat(el.getAttribute("lon")),
      parseFloat(el.getAttribute("lat")),
    ]);
    return pts.filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
  }

  function haversine(a, b) {
    const toRad = (d) => (d * Math.PI) / 180;
    const R = 6371000;
    const dLat = toRad(b[1] - a[1]);
    const dLon = toRad(b[0] - a[0]);
    const lat1 = toRad(a[1]);
    const lat2 = toRad(b[1]);
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  function sampleAlong(coords, count) {
    if (coords.length <= count) return coords.slice();
    const seg = [];
    let total = 0;
    for (let i = 1; i < coords.length; i++) {
      const d = haversine(coords[i - 1], coords[i]);
      seg.push(d);
      total += d;
    }
    if (total <= 0) return coords.slice(0, count);
    const out = [];
    for (let i = 0; i < count; i++) {
      const target = (total * i) / (count - 1 || 1);
      let acc = 0;
      let picked = coords[coords.length - 1];
      for (let j = 0; j < seg.length; j++) {
        if (acc + seg[j] >= target) {
          const t = seg[j] === 0 ? 0 : (target - acc) / seg[j];
          const a = coords[j];
          const b = coords[j + 1];
          picked = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
          break;
        }
        acc += seg[j];
      }
      out.push(picked);
    }
    return out;
  }

  function bboxOf(coords, pad = 0.02) {
    let minLon = Infinity;
    let minLat = Infinity;
    let maxLon = -Infinity;
    let maxLat = -Infinity;
    for (const [lon, lat] of coords) {
      if (lon < minLon) minLon = lon;
      if (lat < minLat) minLat = lat;
      if (lon > maxLon) maxLon = lon;
      if (lat > maxLat) maxLat = lat;
    }
    const lonPad = Math.max((maxLon - minLon) * 0.12, pad);
    const latPad = Math.max((maxLat - minLat) * 0.12, pad);
    return [minLon - lonPad, minLat - latPad, maxLon + lonPad, maxLat + latPad];
  }

  function distToPolyline(point, line) {
    let best = Infinity;
    for (const c of line) {
      const d = haversine(point, c);
      if (d < best) best = d;
    }
    return best;
  }

  function readEmbeddedRoute(el) {
    const host = el.parentElement || el;
    const jsonEl = host.querySelector("[data-tour-route-json]");
    if (!jsonEl) return null;
    try {
      const data = JSON.parse(jsonEl.textContent || "null");
      if (data && data.town && Array.isArray(data.routes)) return data;
      if (!data || !Array.isArray(data.coords) || data.coords.length < 2) {
        return null;
      }
      return data;
    } catch (_) {
      return null;
    }
  }

  function readStopsCache(slug) {
    if (!slug) return null;
    try {
      const raw = localStorage.getItem(STOPS_CACHE_PREFIX + slug);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !parsed.at || !Array.isArray(parsed.stops)) return null;
      if (Date.now() - parsed.at > STOPS_CACHE_TTL_MS) return null;
      return parsed.stops;
    } catch (_) {
      return null;
    }
  }

  function writeStopsCache(slug, stops) {
    if (!slug || !stops || !stops.length) return;
    try {
      localStorage.setItem(
        STOPS_CACHE_PREFIX + slug,
        JSON.stringify({ at: Date.now(), stops })
      );
    } catch (_) {
      /* quota / private mode */
    }
  }

  async function fetchNearbyStops(coords) {
    const [west, south, east, north] = bboxOf(coords, 0.015);
    const query = `
      [out:json][timeout:8];
      (
        node["amenity"~"cafe|restaurant|biergarten|fast_food|charging_station"](${south},${west},${north},${east});
        node["tourism"~"hotel|guest_house|apartment|camp_site|hostel"](${south},${west},${north},${east});
        node["shop"="bicycle"](${south},${west},${north},${east});
      );
      out body ${STOP_COUNT * 8};
    `;
    const endpoints = [
      "https://overpass-api.de/api/interpreter",
      "https://overpass.kumi.systems/api/interpreter",
    ];
    for (const url of endpoints) {
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 9000);
        const res = await fetch(url, {
          method: "POST",
          body: `data=${encodeURIComponent(query)}`,
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          signal: ctrl.signal,
        });
        clearTimeout(timer);
        if (!res.ok) continue;
        const data = await res.json();
        const els = (data.elements || [])
          .filter((el) => el.type === "node" && el.lat != null && el.lon != null)
          .map((el) => {
            const pt = [el.lon, el.lat];
            return {
              id: el.id,
              coordinates: pt,
              name: (el.tags && (el.tags.name || el.tags["name:en"])) || "",
              kind:
                (el.tags &&
                  (el.tags.amenity || el.tags.tourism || el.tags.shop)) ||
                "stop",
              dist: distToPolyline(pt, coords),
            };
          })
          .filter((s) => s.dist < 3500)
          .sort((a, b) => a.dist - b.dist);

        const picked = [];
        for (const s of els) {
          if (picked.length >= STOP_COUNT) break;
          const tooClose = picked.some(
            (p) => haversine(p.coordinates, s.coordinates) < 400
          );
          if (!tooClose) picked.push(s);
        }
        if (picked.length >= 4) return picked.slice(0, STOP_COUNT);
      } catch (_) {
        /* try next */
      }
    }
    return null;
  }

  function fallbackStops(coords) {
    return sampleAlong(coords, STOP_COUNT).map((coordinates, i) => ({
      id: `sample-${i}`,
      coordinates,
      name: "",
      kind: i === 0 ? "start" : i === STOP_COUNT - 1 ? "end" : "stop",
      dist: 0,
    }));
  }

  function stopLabel(stop) {
    return stop.name || "Stop on route";
  }

  /**
   * Typed stops get the app's POI pin, untyped stops a numbered stop marker.
   * "start" / "end" entries are skipped: the route's own endpoints carry the
   * start / end markers.
   */
  function addStopMarkers(zyMap, map, stops, markerBag) {
    for (const m of markerBag.splice(0, markerBag.length)) {
      m.remove();
    }
    let n = 0;
    for (const stop of stops) {
      if (stop.kind === "start" || stop.kind === "end") continue;
      const type = KIND_TO_PLACE_TYPE[stop.kind];
      let el;
      if (type) {
        el = zyMap.poiMarker(type, {
          basePath: MAP_PINS_PATH,
          title: stopLabel(stop),
        });
        el.alt = stopLabel(stop);
      } else {
        n += 1;
        el = zyMap.stopMarker(n, { title: stopLabel(stop) });
      }
      el.setAttribute("aria-label", stopLabel(stop));
      markerBag.push(zyMap.addMarker(maplibregl, map, stop.coordinates, el));
    }
  }

  function addEndpointMarkers(zyMap, map, coords, markerBag) {
    if (markerBag.length) return;
    markerBag.push(
      zyMap.addMarker(
        maplibregl,
        map,
        coords[0],
        zyMap.endpointMarker("start", { title: "Start" })
      ),
      zyMap.addMarker(
        maplibregl,
        map,
        coords[coords.length - 1],
        zyMap.endpointMarker("end", { title: "Finish" })
      )
    );
  }

  function mountMap(zyMap, baseStyle, el, coords, stops) {
    const map = new maplibregl.Map({
      container: el,
      style: baseStyle,
      attributionControl: { compact: true },
      interactive: true,
      cooperativeGestures: true,
      fadeDuration: 0,
    });

    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      "top-right"
    );

    const markers = [];
    const endpoints = [];
    let routeReady = false;
    let usedFallback = false;

    function paintRoute() {
      try {
        if (!map.isStyleLoaded()) return;
        // App route-hero line: white casing + route-blue core.
        zyMap.addRoute(map, "route", coords, { variant: "hero" });
        const bounds = zyMap.routeBounds(coords);
        if (bounds) {
          map.fitBounds(bounds, {
            padding: zyMap.tokens.route.fitPadding.hero,
            maxZoom: 13,
            duration: 0,
          });
        }
        addStopMarkers(zyMap, map, stops, markers);
        // Endpoints last so they sit above the stop pins.
        addEndpointMarkers(zyMap, map, coords, endpoints);
        routeReady = true;
      } catch (err) {
        console.warn("[tour-map] paintRoute", err);
      }
    }

    map.on("load", paintRoute);
    map.on("style.load", paintRoute);

    // If the base map never becomes ready, show the route on a plain background.
    setTimeout(() => {
      if (routeReady || usedFallback) return;
      usedFallback = true;
      map.once("style.load", paintRoute);
      map.setStyle(FALLBACK_STYLE);
    }, 6000);

    // Resize only when the box actually changes — avoids infinite height loops.
    let lastW = 0;
    let lastH = 0;
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0] && entries[0].contentRect;
      if (!cr) return;
      const w = Math.round(cr.width);
      const h = Math.round(cr.height);
      if (w === lastW && h === lastH) return;
      if (w < 2 || h < 2) return;
      lastW = w;
      lastH = h;
      map.resize();
    });
    ro.observe(el);

    return {
      map,
      setStops(next) {
        const apply = () => addStopMarkers(zyMap, map, next, markers);
        if (routeReady || map.isStyleLoaded()) apply();
        else map.once("load", apply);
      },
    };
  }

  /**
   * Town page map: every marked route through the town as a line, the page's
   * picks as the app's POI pins, fitted to the municipality. No Overpass call.
   */
  function mountTownMap(zyMap, baseStyle, el, town) {
    const map = new maplibregl.Map({
      container: el,
      style: baseStyle,
      attributionControl: { compact: true },
      interactive: true,
      cooperativeGestures: true,
      fadeDuration: 0,
    });
    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      "top-right"
    );

    let painted = false;
    // Until the rider moves the map themselves, keep the town in view: the
    // box can still be tiny or change size while the page lays out, and a fit
    // into a box smaller than its padding is silently dropped.
    let riderMoved = false;
    function fit() {
      if (riderMoved || el.clientWidth < 120 || el.clientHeight < 120) return;
      const [w, s, e, n] = town.bounds;
      map.fitBounds(
        [
          [w, s],
          [e, n],
        ],
        { padding: 24, maxZoom: 14, duration: 0 }
      );
    }
    for (const type of ["dragstart", "zoomstart"]) {
      map.on(type, (ev) => {
        if (ev && ev.originalEvent) riderMoved = true;
      });
    }
    function paint() {
      try {
        if (!map.isStyleLoaded()) return;
        // One white-cased line per route, each in its own colour (the same
        // colour marks the route's row in the list below the map).
        town.routes.forEach((route, i) => {
          const id = `town-route-${i}`;
          zyMap.addRoute(
            map,
            id,
            {
              type: "Feature",
              properties: {},
              geometry: { type: "MultiLineString", coordinates: route.lines },
            },
            { variant: "hero" }
          );
          if (map.getLayer(id)) map.setPaintProperty(id, "line-color", route.color);
        });
        if (painted) return;
        painted = true;
        fit();
        for (const pin of town.pins) {
          const node = zyMap.poiMarker(zyMap.poiPinType(pin.type), {
            basePath: MAP_PINS_PATH,
            title: pin.name,
          });
          zyMap.addMarker(maplibregl, map, pin.coordinates, node);
        }
      } catch (err) {
        console.warn("[tour-map] town paint", err);
      }
    }
    map.on("load", paint);
    map.on("style.load", paint);

    let lastW = 0;
    let lastH = 0;
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0] && entries[0].contentRect;
      if (!cr) return;
      const w = Math.round(cr.width);
      const h = Math.round(cr.height);
      if ((w === lastW && h === lastH) || w < 2 || h < 2) return;
      lastW = w;
      lastH = h;
      map.resize();
      fit();
    });
    ro.observe(el);
  }

  async function resolveCoords(el) {
    const embedded = readEmbeddedRoute(el);
    if (embedded) {
      const stops =
        Array.isArray(embedded.stops) && embedded.stops.length
          ? embedded.stops
          : fallbackStops(embedded.coords);
      return { coords: embedded.coords, stops };
    }

    const gpxUrl = el.getAttribute("data-gpx");
    if (!gpxUrl) throw new Error("No route data");
    const gpxRes = await fetch(gpxUrl);
    if (!gpxRes.ok) throw new Error(`GPX ${gpxRes.status}`);
    const coords = parseGpx(await gpxRes.text());
    if (coords.length < 2) throw new Error("Route too short");
    return { coords, stops: fallbackStops(coords) };
  }

  async function upgradeStops(slug, coords, mapApi) {
    const cached = readStopsCache(slug);
    if (cached && cached.length >= 4) {
      mapApi.setStops(cached);
      return;
    }
    const nearby = await fetchNearbyStops(coords);
    if (nearby && nearby.length) {
      writeStopsCache(slug, nearby);
      mapApi.setStops(nearby);
    }
  }

  async function initOne(el) {
    const slug = el.getAttribute("data-slug") || "";
    el.classList.add("is-loading");

    const maplibreReady = ensureMapLibre();
    const kitReady = ensureMapKit();

    try {
      const town = readEmbeddedRoute(el);
      if (town && town.town) {
        const [, zyMap] = await Promise.all([maplibreReady, kitReady]);
        const townStyle = await resolveBaseStyle(zyMap);
        el.innerHTML = "";
        el.classList.remove("is-loading");
        el.classList.add("is-ready");
        mountTownMap(zyMap, townStyle, el, town);
        return;
      }
      const [{ coords, stops }, , zyMap] = await Promise.all([
        resolveCoords(el),
        maplibreReady,
        kitReady,
      ]);
      const baseStyle = await resolveBaseStyle(zyMap);

      el.innerHTML = "";
      el.classList.remove("is-loading");
      el.classList.add("is-ready");
      const mapApi = mountMap(zyMap, baseStyle, el, coords, stops);
      upgradeStops(slug, coords, mapApi);
    } catch (err) {
      console.warn("[tour-map]", err);
      el.classList.remove("is-loading");
      el.classList.add("is-error");
      el.innerHTML =
        '<p class="tour-hero__map-fallback">Map unavailable. Open the route in Zyflow to explore.</p>';
    }
  }

  function boot() {
    ensureMapLibre();
    ensureMapKit();
    document.querySelectorAll("[data-tour-map]").forEach((el) => {
      void initOne(el);
    });
  }

  if (document.readyState === "loading") {
    ensureMapLibre();
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
