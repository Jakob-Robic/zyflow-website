/**
 * "Open in Zyflow" landing (/o/place/:id, /o/route/:id), shown when the app did not
 * catch the link. Points "Open the app" at the same place or route through the zyflow://
 * scheme, and tags both store links with the business (?b=) so the install is credited:
 * Play Install Referrer carries b and s; the App Store gets a campaign token.
 * A store tap is recorded anonymously as store_redirect via /api/business-event.
 */
(function () {
  "use strict";

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

  // Slovenian browsers get the Slovenian page (same path under /sl).
  var lang = (navigator.language || "").toLowerCase();
  if (lang.indexOf("sl") === 0 && location.pathname.indexOf("/sl/") !== 0 && location.pathname.indexOf("/o/") === 0) {
    location.replace("/sl" + location.pathname + location.search);
    return;
  }

  var link = parseLink();
  if (!link) return;

  var openApp = document.querySelector("[data-open-app]");
  if (openApp) openApp.setAttribute("href", "zyflow://o/" + link.kind + "/" + link.id + query(link));

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
})();
