/**
 * First-touch UTM / referrer persistence and App Store / Play attribution.
 * Works in the browser and under node:test (UMD).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.ZyflowAttribution = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  var STORAGE_KEY = "zyflow_ft";
  var COOKIE_MAX_AGE = 90 * 24 * 60 * 60;
  var STORE_SELECTOR =
    'a[href*="apps.apple.com"]:not([data-app-modal-open]):not([data-business-store]), a[href*="play.google.com"]:not([data-app-modal-open]):not([data-business-store])';
  var PLANNER_SELECTOR = "a[data-planner-link]";

  function emptyUtms() {
    return { utm_source: "", utm_medium: "", utm_campaign: "" };
  }

  function readUtmsFromSearch(search) {
    var params = new URLSearchParams(search || "");
    return {
      utm_source: (params.get("utm_source") || "").trim(),
      utm_medium: (params.get("utm_medium") || "").trim(),
      utm_campaign: (params.get("utm_campaign") || "").trim(),
    };
  }

  function hasAnyUtm(utms) {
    return !!(utms && (utms.utm_source || utms.utm_medium || utms.utm_campaign));
  }

  function isInternalHost(host, pageHost) {
    if (!host) return true;
    var h = String(host).replace(/^www\./i, "").toLowerCase();
    var page = String(pageHost || "")
      .replace(/^www\./i, "")
      .toLowerCase();
    if (h === page) return true;
    if (/(^|\.)zyflow\.eu$/.test(h) && /(^|\.)zyflow\.eu$/.test(page)) return true;
    return false;
  }

  function referrerSource(referrer, pageHost) {
    if (!referrer) return "";
    try {
      var url = new URL(referrer);
      if (isInternalHost(url.hostname, pageHost)) return "";
      return url.hostname.replace(/^www\./i, "");
    } catch (_e) {
      return "";
    }
  }

  function resolveAttribution(input) {
    var search = (input && input.search) || "";
    var referrer = (input && input.referrer) || "";
    var pageHost = (input && input.pageHost) || "";
    var stored = (input && input.stored) || null;
    var current = readUtmsFromSearch(search);
    var base = hasAnyUtm(current)
      ? current
      : stored && hasAnyUtm(stored)
        ? {
            utm_source: stored.utm_source || "",
            utm_medium: stored.utm_medium || "",
            utm_campaign: stored.utm_campaign || "",
          }
        : emptyUtms();
    if (!base.utm_source) {
      base.utm_source = referrerSource(referrer, pageHost) || "direct";
    }
    return base;
  }

  /**
   * Guide pages carry a campaign of their own (<body data-page-campaign>).
   * It fills in only when the visitor brought no medium or campaign, so a
   * visitor from an ad or a newsletter keeps that attribution. The source
   * stays the visitor's (a search engine, "direct"), so store and planner
   * reports show both where they came from and which guide sent them.
   */
  function withPageCampaign(utms, page) {
    var base = utms || emptyUtms();
    if (!page || !page.utm_campaign) return base;
    if (base.utm_campaign || base.utm_medium) return base;
    return {
      utm_source: base.utm_source || "direct",
      utm_medium: page.utm_medium || "",
      utm_campaign: page.utm_campaign,
    };
  }

  function pageCampaign() {
    if (typeof document === "undefined" || !document.body) return null;
    var campaign = document.body.getAttribute("data-page-campaign") || "";
    if (!campaign) return null;
    return {
      utm_campaign: campaign,
      utm_medium: document.body.getAttribute("data-page-medium") || "",
    };
  }

  function firstTouchFromVisit(input) {
    var stored = (input && input.stored) || null;
    if (stored && hasAnyUtm(stored)) {
      return {
        utm_source: stored.utm_source || "",
        utm_medium: stored.utm_medium || "",
        utm_campaign: stored.utm_campaign || "",
      };
    }
    return resolveAttribution(input);
  }

  function campaignToken(campaign) {
    if (!campaign) return "";
    return String(campaign)
      .trim()
      .replace(/\s+/g, "_")
      .replace(/[^A-Za-z0-9._-]/g, "")
      .slice(0, 100);
  }

  function playReferrerValue(utms, distinctId) {
    var parts = [
      "utm_source=" + (utms.utm_source || "direct"),
      "utm_medium=" + (utms.utm_medium || ""),
      "utm_campaign=" + (utms.utm_campaign || ""),
    ];
    if (distinctId) parts.push("ph_id=" + distinctId);
    return parts.join("&");
  }

  function decorateStoreUrl(href, options) {
    var opts = options || {};
    var utms = opts.utms || emptyUtms();
    var distinctId = opts.analyticsConsent ? opts.distinctId || "" : "";
    var url;
    try {
      url = new URL(href, "https://www.zyflow.eu");
    } catch (_e) {
      return href;
    }

    var host = url.hostname;
    if (host.indexOf("play.google.com") !== -1) {
      url.searchParams.set("referrer", playReferrerValue(utms, distinctId));
      return url.toString();
    }
    if (host.indexOf("apps.apple.com") !== -1) {
      var ct = campaignToken(utms.utm_campaign);
      if (ct) url.searchParams.set("ct", ct);
      else url.searchParams.delete("ct");
      return url.toString();
    }
    return href;
  }

  function parseJson(raw) {
    if (!raw) return null;
    try {
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return null;
      return {
        utm_source: parsed.utm_source || "",
        utm_medium: parsed.utm_medium || "",
        utm_campaign: parsed.utm_campaign || "",
      };
    } catch (_e) {
      return null;
    }
  }

  function readCookie(name) {
    try {
      var match = document.cookie.match(
        new RegExp("(?:^|; )" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "=([^;]*)")
      );
      return match ? decodeURIComponent(match[1]) : "";
    } catch (_e) {
      return "";
    }
  }

  function cookieDomain() {
    try {
      var host = location.hostname;
      if (host === "zyflow.eu" || host.slice(-10) === ".zyflow.eu") return ".zyflow.eu";
    } catch (_e) {
      /* ignore */
    }
    return "";
  }

  function writeCookie(name, value) {
    try {
      var parts = [
        name + "=" + encodeURIComponent(value),
        "Path=/",
        "Max-Age=" + COOKIE_MAX_AGE,
        "SameSite=Lax",
      ];
      var domain = cookieDomain();
      if (domain) parts.push("Domain=" + domain);
      document.cookie = parts.join("; ");
    } catch (_e) {
      /* ignore */
    }
  }

  function readStored() {
    try {
      var fromSession = parseJson(sessionStorage.getItem(STORAGE_KEY));
      if (fromSession && hasAnyUtm(fromSession)) return fromSession;
    } catch (_e) {
      /* ignore */
    }
    return parseJson(readCookie(STORAGE_KEY));
  }

  function writeStored(utms) {
    var payload = JSON.stringify({
      utm_source: utms.utm_source || "",
      utm_medium: utms.utm_medium || "",
      utm_campaign: utms.utm_campaign || "",
    });
    try {
      sessionStorage.setItem(STORAGE_KEY, payload);
    } catch (_e) {
      /* ignore */
    }
    writeCookie(STORAGE_KEY, payload);
  }

  function persistFirstTouch(input) {
    var next = firstTouchFromVisit({
      search: (input && input.search) || (typeof location !== "undefined" ? location.search : ""),
      referrer:
        (input && input.referrer) ||
        (typeof document !== "undefined" ? document.referrer : ""),
      pageHost:
        (input && input.pageHost) ||
        (typeof location !== "undefined" ? location.hostname : ""),
      stored: (input && input.stored) || readStored(),
    });
    var existing = (input && input.stored) || readStored();
    if (!existing || !hasAnyUtm(existing)) writeStored(next);
    return readStored() || next;
  }

  function getAttribution(input) {
    var page = input && input.page !== undefined ? input.page : pageCampaign();
    return withPageCampaign(resolveAttribution({
      search: (input && input.search) || (typeof location !== "undefined" ? location.search : ""),
      referrer:
        (input && input.referrer) ||
        (typeof document !== "undefined" ? document.referrer : ""),
      pageHost:
        (input && input.pageHost) ||
        (typeof location !== "undefined" ? location.hostname : ""),
      stored: (input && input.stored) || readStored(),
    }), page);
  }

  /**
   * "Open in the planner" links ship with the page's own UTMs so they work
   * without JS. When the visitor has a campaign (theirs or the page's), it
   * replaces them.
   */
  function decoratePlannerUrl(href, utms) {
    if (!utms || !utms.utm_campaign) return href;
    var url;
    try {
      url = new URL(href, "https://www.zyflow.eu");
    } catch (_e) {
      return href;
    }
    url.searchParams.set("utm_source", utms.utm_source || "direct");
    if (utms.utm_medium) url.searchParams.set("utm_medium", utms.utm_medium);
    else url.searchParams.delete("utm_medium");
    url.searchParams.set("utm_campaign", utms.utm_campaign);
    return url.toString();
  }

  function applyPlannerLinks(utms) {
    if (typeof document === "undefined") return;
    var current = utms || getAttribution();
    var nodes = document.querySelectorAll(PLANNER_SELECTOR);
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (!el.getAttribute("data-planner-href")) {
        el.setAttribute("data-planner-href", el.getAttribute("href") || "");
      }
      el.setAttribute("href", decoratePlannerUrl(el.getAttribute("data-planner-href"), current));
    }
  }

  function analyticsConsentGranted() {
    return !!(
      typeof window !== "undefined" &&
      window.ZyflowPosthog &&
      typeof window.ZyflowPosthog.hasAnalyticsConsent === "function" &&
      window.ZyflowPosthog.hasAnalyticsConsent()
    );
  }

  function currentDistinctId() {
    if (
      typeof window !== "undefined" &&
      window.ZyflowPosthog &&
      typeof window.ZyflowPosthog.getDistinctId === "function"
    ) {
      return window.ZyflowPosthog.getDistinctId() || "";
    }
    return "";
  }

  function decorateAnchor(el, options) {
    if (!el || !el.getAttribute) return "";
    if (!el.getAttribute("data-store-href")) {
      el.setAttribute("data-store-href", el.getAttribute("href") || "");
    }
    var original = el.getAttribute("data-store-href") || el.getAttribute("href") || "";
    var opts = options || {};
    var href = decorateStoreUrl(original, {
      utms: withPageCampaign(opts.utms || getAttribution(), pageCampaign()),
      analyticsConsent: !!opts.analyticsConsent,
      distinctId: opts.distinctId || "",
    });
    el.setAttribute("href", href);
    return href;
  }

  function applyStoreLinks(options) {
    if (typeof document === "undefined") return;
    var opts = options || {};
    var consent =
      typeof opts.analyticsConsent === "boolean"
        ? opts.analyticsConsent
        : analyticsConsentGranted();
    var distinctId = consent ? opts.distinctId || currentDistinctId() : "";
    var utms = opts.utms || getAttribution();
    var nodes = document.querySelectorAll(STORE_SELECTOR);
    for (var i = 0; i < nodes.length; i++) {
      decorateAnchor(nodes[i], {
        utms: utms,
        analyticsConsent: consent,
        distinctId: distinctId,
      });
    }
  }

  function boot() {
    persistFirstTouch();
    applyStoreLinks({ analyticsConsent: analyticsConsentGranted() });
    applyPlannerLinks();
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", boot);
    } else {
      boot();
    }
  }

  return {
    STORAGE_KEY: STORAGE_KEY,
    readUtmsFromSearch: readUtmsFromSearch,
    referrerSource: referrerSource,
    resolveAttribution: resolveAttribution,
    firstTouchFromVisit: firstTouchFromVisit,
    campaignToken: campaignToken,
    playReferrerValue: playReferrerValue,
    decorateStoreUrl: decorateStoreUrl,
    withPageCampaign: withPageCampaign,
    decoratePlannerUrl: decoratePlannerUrl,
    applyPlannerLinks: applyPlannerLinks,
    persistFirstTouch: persistFirstTouch,
    getAttribution: getAttribution,
    decorateAnchor: decorateAnchor,
    applyStoreLinks: applyStoreLinks,
  };
});
