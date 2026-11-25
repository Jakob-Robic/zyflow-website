/**
 * Error monitoring for www.zyflow.eu (Sentry, EU region).
 *
 * Runs only when the build injected a DSN into analytics-config.js (SENTRY_DSN in Vercel), so
 * local builds and previews without the variable load nothing. Errors only: no performance
 * tracing, no session replay, no cookies, no user data (privacy policy 3.10). Only errors from
 * our own scripts are sent, not from GTM tags or browser extensions.
 */
(function () {
  var cfg = window.ZYFLOW_ANALYTICS || {};
  if (!cfg.sentryDsn) return;

  var s = document.createElement("script");
  s.src = "https://browser.sentry-cdn.com/11.17.0/bundle.min.js";
  s.integrity = "sha384-hDIKvXIZjqlgYU4Xw3A4xx3aRaGTz2YtgxtGBBLxy+FJ5H1+w4+X/3NfA9+jsgwx";
  s.crossOrigin = "anonymous";
  s.async = true;
  s.onload = function () {
    if (!window.Sentry) return;
    window.Sentry.init({
      dsn: cfg.sentryDsn,
      environment: cfg.sentryEnvironment || "production",
      release: cfg.sentryRelease || undefined,
      // SDK v11 collects user info, cookies, headers and query strings by default: all off.
      dataCollection: { userInfo: false, cookies: false, httpHeaders: false, urlQueryParams: false, httpBodies: [] },
      tracesSampleRate: 0,
      allowUrls: [/^https:\/\/(www\.)?zyflow\.eu\//, /^https:\/\/[a-z0-9-]+\.vercel\.app\//],
      ignoreErrors: [/^ResizeObserver loop/, "AbortError"],
      initialScope: { tags: { site: "www" } },
      beforeSend: function (event) {
        // Keep the page path, drop query strings (campaign and click ids).
        if (event.request && event.request.url) event.request.url = event.request.url.split("?")[0];
        if (event.request) delete event.request.cookies;
        return event;
      },
    });
  };
  document.head.appendChild(s);
})();
