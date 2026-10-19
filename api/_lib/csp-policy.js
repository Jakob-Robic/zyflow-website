'use strict';

/**
 * Report-only CSP for the marketing site.
 *
 * Inventory (rebuild/gtm/*, analytics-boot, analytics-*.js, cookieconsent, fonts):
 * - script-src: self + inline (theme boot, GTM, consent restore); GTM; GA4;
 *   Google Ads (gtag/conversion); Meta Pixel; ChatGPT Ads pixel; PostHog array.js;
 *   Cloudflare Turnstile (required in production).
 * - style-src: self + inline (cookie banner, a few style= attrs). Banner CSS is self-hosted.
 * - img-src: self + data; GTM/GA/Ads/Meta pixels.
 * - font-src: self (DM Sans, Tanker, Courier Prime in /assets/design-system/fonts).
 * - connect-src: self (/api/* including csp-report); GA4; GTM; Google Ads;
 *   PostHog EU ingest + assets; Meta; ChatGPT pixel; Turnstile.
 * - frame-src: GTM noscript; Meta; Ads; Turnstile.
 * - worker-src: PostHog may use blob workers.
 * - maps: MapLibre (self-hosted /assets/vendor) + OpenFreeMap tiles on tour
 *   detail heroes; Overpass enriches stop pins in the background (cached).
 *   Do not add unpkg.com — MapLibre is not loaded from a CDN.
 *
 * upgrade-insecure-requests is omitted: it is not meaningful on a report-only policy.
 */

const CSP_REPORT_ONLY =
  "default-src 'self'; " +
  "base-uri 'self'; " +
  "object-src 'none'; " +
  "frame-ancestors 'none'; " +
  "form-action 'self'; " +
  "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://www.google-analytics.com https://www.google.com https://www.googleadservices.com https://googleads.g.doubleclick.net https://connect.facebook.net https://bzrcdn.openai.com https://eu-assets.i.posthog.com https://challenges.cloudflare.com; " +
  "style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data: blob: https://www.googletagmanager.com https://www.google-analytics.com https://www.google.com https://www.googleadservices.com https://*.google.com https://*.g.doubleclick.net https://www.facebook.com https://*.facebook.com https://*.openfreemap.org https://tiles.openfreemap.org https://api.maptiler.com; " +
  "font-src 'self' data:; " +
  "connect-src 'self' https://www.google-analytics.com https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com https://www.google.com https://www.googleadservices.com https://*.googleadservices.com https://*.doubleclick.net https://eu.i.posthog.com https://eu.posthog.com https://eu-assets.i.posthog.com https://www.facebook.com https://connect.facebook.net https://graph.facebook.com https://bzrcdn.openai.com https://bzr.openai.com https://challenges.cloudflare.com https://tiles.openfreemap.org https://*.openfreemap.org https://api.maptiler.com https://overpass-api.de https://overpass.kumi.systems; " +
  "frame-src https://www.googletagmanager.com https://www.facebook.com https://td.doubleclick.net https://challenges.cloudflare.com; " +
  "worker-src 'self' blob:; " +
  "report-uri /api/csp-report; " +
  "report-to csp-endpoint";

const REPORTING_ENDPOINTS = 'csp-endpoint="/api/csp-report"';

/** Override Vercel’s static default `*`. Cannot be deleted; only replaced. */
const STATIC_ACAO = "https://www.zyflow.eu";

module.exports = {
  CSP_REPORT_ONLY,
  REPORTING_ENDPOINTS,
  STATIC_ACAO,
};
