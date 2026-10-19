/**
 * App Store listing injected into every rebuild template as {{appStoreUrl}}.
 *
 * A country-less apps.apple.com URL falls back to the US storefront. Zyflow
 * is not listed there, so desktop browsers get a 404. The Slovenia storefront
 * (/si/) returns the live listing. Google Play has no country segment and
 * stays a literal in the templates.
 */
const APP_STORE_URL = "https://apps.apple.com/si/app/zyflow/id6763228086";

module.exports = { APP_STORE_URL };
