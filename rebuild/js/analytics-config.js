/**
 * Zyflow analytics IDs — single source for the rebuild site.
 * Pixels for ChatGPT Ads / Meta are configured in GTM; IDs below are
 * documented so tags can be created without hunting through chat history.
 */
window.ZYFLOW_ANALYTICS = {
  gtmId: "GTM-W8XX2TWZ",
  ga4MeasurementId: "G-6YK1EKLMGS",
  /** ChatGPT Ads Measurement Pixel — configured in GTM Custom HTML tags. */
  chatgptPixelId: "3mKjmHDKXRuimF1RUa4VWm",
  /** Meta (Facebook) Pixel — configured in GTM Custom HTML tags. */
  metaPixelId: "1112893301493263",
  /**
   * PostHog project (EU Cloud). Public ingestion key — safe in frontend code.
   * posthog-js loads only after the visitor grants the analytics category.
   */
  posthogProjectKey: "phc_Bidx6J3fgqBuQ92kHq68hJQcVkwXybr3MGvAEnvMGAme",
  posthogApiHost: "https://eu.i.posthog.com",
  /**
   * Cloudflare Turnstile site key (public). Injected at build time when
   * TURNSTILE_SITE_KEY is set. When non-empty, forms render the widget
   * and send the token. Production requires the matching server secret.
   */
  turnstileSiteKey: "",
};
