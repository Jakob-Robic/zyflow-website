/**
 * "Open in Zyflow" landing (/o/place/:id, /o/route/:id), shown when the app did not
 * catch the link. Points "Open the app" at the same place or route through the zyflow://
 * scheme, and tags both store links with the business (?b=) so the install is credited:
 * Play Install Referrer carries b and s; the App Store gets a campaign token.
 * A store tap is recorded anonymously as store_redirect via /api/business-event.
 *
 * On a computer (clearly desktop: fine pointer with hover, no phone/tablet user agent)
 * the link forwards to the web planner instead: /o/route/<id> -> ?route=place:<id>,
 * /o/place/<id> -> ?poi=<id>, keeping b and s. ?app=1 keeps this page on a computer.
 * Loaded in <head> without defer so the forward happens before the page paints.
 *
 * iPhone: Safari draws Apple's Smart App Banner from <meta name="apple-itunes-app">.
 * This script adds app-argument (the canonical https /o/ link) to it while <head> is
 * still being parsed, so the banner's OPEN button opens this same place or route.
 * The zyflow:// button stays for a manual tap; iOS never auto-launches the scheme
 * (Safari shows an error alert when the app is missing).
 *
 * Android Chrome / Samsung Internet: one automatic hand-off per page load through an
 * intent:// URL ("Opening Zyflow …"). Without the app, Chrome follows
 * S.browser_fallback_url, which is this page with ?app=0: that shows Google Play only
 * and never redirects again. Reloads, back/forward and a second load within a minute
 * do not auto-open either.
 */
(function () {
  "use strict";

  // The web planner. Build overrides it from PLANNER_ORIGIN (rebuild/scripts/build.js).
  var PLANNER_ORIGIN = "https://navigate.zyflow.eu";

  // Same id as the App Store links (rebuild/scripts/store-links.js) and the Android package.
  var APP_STORE_ID = "6763228086";
  var ANDROID_PACKAGE = "com.jakob_robic.zyflowmobileapp";
  // A second automatic hand-off for the same link within this window is skipped.
  var RETRY_GUARD_MS = 60 * 1000;
  // With no sign the app opened, the "Opening Zyflow …" lines turn back after this.
  var OPENING_STATE_MS = 3500;

  var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  var SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
  var SURFACES = { embed: true, hosted: true, qr: true };

  function parseLink() {
    var parts = location.pathname.split("/").filter(Boolean);
    if (parts[0] === "sl") parts.shift();
    if (parts[0] !== "o") return null;
    var kind = parts[1];
    var id = (parts[2] || "").toLowerCase();
    if ((kind !== "place" && kind !== "route") || !UUID_RE.test(id)) return null;

    var params = new URLSearchParams(location.search);
    var slug = (params.get("b") || "").toLowerCase();
    var surface = params.get("s") || "";
    return {
      kind: kind,
      id: id,
      slug: slug.length <= 64 && SLUG_RE.test(slug) ? slug : "",
      surface: SURFACES[surface] ? surface : "",
    };
  }

  function query(link) {
    var params = new URLSearchParams();
    if (link.slug) params.set("b", link.slug);
    if (link.surface) params.set("s", link.surface);
    var s = params.toString();
    return s ? "?" + s : "";
  }

  function matches(media) {
    try {
      return !!(window.matchMedia && window.matchMedia(media).matches);
    } catch (_e) {
      return false;
    }
  }

  /**
   * Only a clear computer: a phone, tablet or anything unsure keeps the app page.
   * iPadOS reports a Mac user agent, so a Mac with a touch screen counts as a tablet.
   */
  function isDesktop() {
    var ua = navigator.userAgent || "";
    if (/Android|iPhone|iPad|iPod|Mobi|Tablet|Silk|Kindle|KFAPWI|PlayBook|BlackBerry|BB10|IEMobile|Opera Mini|webOS|CrOS.*Touch/i.test(ua)) {
      return false;
    }
    if (/Macintosh/i.test(ua) && (navigator.maxTouchPoints || 0) > 1) return false;
    if (navigator.userAgentData && navigator.userAgentData.mobile === true) return false;
    if (!/Windows NT|Macintosh|Mac OS X|Linux|CrOS/i.test(ua)) return false;
    return matches("(pointer: fine)") && matches("(hover: hover)") && !matches("(pointer: coarse)");
  }

  function plannerUrl(link) {
    var params = new URLSearchParams();
    if (link.kind === "route") params.set("route", "place:" + link.id);
    else params.set("poi", link.id);
    if (link.slug) params.set("b", link.slug);
    if (link.surface) params.set("s", link.surface);
    return PLANNER_ORIGIN + "/?" + params.toString();
  }

  /** The link the app understands: https://<this host>/o/<kind>/<id>?b=&s= (no /sl, no markers). */
  function appLink(link) {
    return location.origin + "/o/" + link.kind + "/" + link.id + query(link);
  }

  /** iPhone: point the Smart App Banner's OPEN at this place or route. */
  function setBanner(link) {
    var meta = document.querySelector('meta[name="apple-itunes-app"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "apple-itunes-app");
      (document.head || document.documentElement).appendChild(meta);
    }
    meta.setAttribute("content", "app-id=" + APP_STORE_ID + ", app-argument=" + appLink(link));
  }

  /**
   * Android browsers that open intent:// URLs and honour S.browser_fallback_url:
   * Chrome and the Chromium-based ones (Samsung Internet, Edge, Opera, Brave).
   * Not in-app WebViews ("; wv)"), where intent:// would end on an error page.
   */
  function isAndroidIntentBrowser() {
    var ua = navigator.userAgent || "";
    if (!/Android/i.test(ua)) return false;
    if (/;\s*wv\)/.test(ua) || /Firefox\//i.test(ua)) return false;
    return /Chrome\/\d|SamsungBrowser\/\d/.test(ua);
  }

  /** intent://o/<kind>/<id>?b=&s= for the app, falling back to this page with ?app=0. */
  function intentUrl(link) {
    var fallback = new URL(location.pathname + location.search, location.origin);
    fallback.searchParams.set("app", "0");
    return (
      "intent://o/" + link.kind + "/" + link.id + query(link) +
      "#Intent;scheme=zyflow;package=" + ANDROID_PACKAGE +
      ";S.browser_fallback_url=" + encodeURIComponent(fallback.toString()) +
      ";end"
    );
  }

  /** "navigate", "reload" or "back_forward". */
  function navigationType() {
    try {
      var entries = performance.getEntriesByType && performance.getEntriesByType("navigation");
      if (entries && entries[0] && entries[0].type) return entries[0].type;
      if (performance.navigation) {
        return ["navigate", "reload", "back_forward"][performance.navigation.type] || "navigate";
      }
    } catch (_e) {
      // Unknown: treat as a fresh load.
    }
    return "navigate";
  }

  /** True once per link per minute in this tab; a fresh load when storage is unavailable. */
  function claimAttempt(link) {
    var key = "zyflow.openApp.tried";
    var id = link.kind + ":" + link.id;
    try {
      var last = JSON.parse(sessionStorage.getItem(key) || "null");
      if (last && last.id === id && Date.now() - last.at < RETRY_GUARD_MS) return false;
      sessionStorage.setItem(key, JSON.stringify({ id: id, at: Date.now() }));
    } catch (_e) {
      // Private mode or blocked storage: the per-load rule still holds.
    }
    return true;
  }

  var link = parseLink();
  var appParam = new URLSearchParams(location.search).get("app");
  var forceApp = appParam === "1";

  if (link && !forceApp && isDesktop()) {
    // Hide the page while the planner loads; the forward replaces this history entry.
    document.documentElement.style.visibility = "hidden";
    window.addEventListener("pageshow", function (event) {
      if (event.persisted) document.documentElement.style.visibility = "";
    });
    location.replace(plannerUrl(link));
    return;
  }

  // Slovenian browsers get the Slovenian page (same path under /sl).
  var lang = (navigator.language || "").toLowerCase();
  if (lang.indexOf("sl") === 0 && location.pathname.indexOf("/sl/") !== 0 && location.pathname.indexOf("/o/") === 0) {
    location.replace("/sl" + location.pathname + location.search);
    return;
  }

  if (!link) return;

  setBanner(link);

  var android = isAndroidIntentBrowser();
  // ?app=0 is the intent's fallback: the app is not installed, so never try again.
  var notInstalled = android && appParam === "0";
  var autoOpen = android && !notInstalled && navigationType() === "navigate" && claimAttempt(link);
  var opts = {
    intent: android ? intentUrl(link) : null,
    notInstalled: notInstalled,
    autoOpen: autoOpen,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      wirePage(link, opts);
    });
  } else {
    wirePage(link, opts);
  }

  function reducedMotion() {
    return matches("(prefers-reduced-motion: reduce)");
  }

  /** Swap an element's text with a soft cross-fade (CSS: [data-open-text].is-swapping). */
  function swapText(el, text) {
    if (!el || el.textContent === text) return;
    if (reducedMotion() || !el.classList) {
      el.textContent = text;
      return;
    }
    el.classList.add("is-swapping");
    setTimeout(function () {
      el.textContent = text;
      el.classList.remove("is-swapping");
    }, 320);
  }

  /** Android without the app: Google Play only, with the Play wording. */
  function showNotInstalled() {
    var get = document.querySelector("[data-open-get]");
    var play = get && get.getAttribute("data-play");
    if (play) get.textContent = play;
    document.querySelectorAll('[data-business-store="ios"]').forEach(function (a) {
      a.hidden = true;
    });
  }

  /** "Opening Zyflow …" until the app opens or a few seconds pass, then the normal lines. */
  function showOpening(link) {
    var title = document.querySelector("[data-open-title]");
    var body = document.querySelector("[data-open-body]");
    var normal = [];
    var opening = [
      [title, title && title.getAttribute("data-opening")],
      [body, body && body.getAttribute(link.kind === "place" ? "data-opening-place" : "data-opening-route")],
    ];
    opening.forEach(function (pair) {
      if (!pair[0] || !pair[1]) return;
      normal.push([pair[0], pair[0].textContent]);
      pair[0].textContent = pair[1];
    });
    if (!normal.length) return;

    var done = false;
    function restore() {
      if (done) return;
      done = true;
      normal.forEach(function (pair) {
        swapText(pair[0], pair[1]);
      });
    }
    // Back from the app, or still here with no sign of it: the normal page again.
    setTimeout(function () {
      if (!document.hidden) restore();
    }, OPENING_STATE_MS);
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) restore();
    });
    window.addEventListener("pageshow", function (event) {
      if (event.persisted) restore();
    });
  }

  function wirePage(link, opts) {
    var openApp = document.querySelector("[data-open-app]");
    if (openApp) {
      openApp.setAttribute("href", opts.intent || "zyflow://o/" + link.kind + "/" + link.id + query(link));
    }

    document.querySelectorAll("[data-business-store]").forEach(function (a) {
      var url;
      try {
        url = new URL(a.getAttribute("href"), location.origin);
      } catch (_e) {
        return;
      }
      if (a.getAttribute("data-business-store") === "android") {
        var referrer = ["utm_source=zyflow_business", "utm_medium=" + (link.surface || "link")];
        if (link.slug) referrer.push("utm_campaign=" + link.slug, "b=" + link.slug);
        if (link.surface) referrer.push("s=" + link.surface);
        url.searchParams.set("referrer", referrer.join("&"));
      } else if (link.slug) {
        url.searchParams.set("ct", ("b_" + link.slug).slice(0, 100));
      }
      a.setAttribute("href", url.toString());

      if (!link.slug) return;
      a.addEventListener("click", function () {
        try {
          fetch("/api/business-event", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            keepalive: true,
            body: JSON.stringify({
              slug: link.slug,
              event: "store_redirect",
              surface: link.surface || null,
              routeId: link.kind === "route" ? link.id : null,
              lang: document.documentElement.lang || null,
            }),
          }).catch(function () {});
        } catch (_e) {
          // Attribution must never block the store link.
        }
      });
    });

    if (opts.notInstalled) showNotInstalled();
    if (opts.autoOpen) {
      showOpening(link);
      // The one automatic attempt for this load; the button stays for a manual retry.
      location.href = opts.intent;
    }
  }
})();
