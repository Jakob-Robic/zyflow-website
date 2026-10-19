# Rebuild cutover checklist

Production hosting is pointed at the rebuild tree via root [`vercel.json`](../vercel.json): `buildCommand` → `npm run build:rebuild:prod` (`SITE_INDEX=true`), `outputDirectory` → `rebuild/dist`.

## Before go-live

1. **Content & icons** — finish marketing copy, SL translations (replace EN scaffold in `rebuild/locales/sl.json`), and icon set.
2. **Indexable build** — done for deploy: `npm run build:rebuild:prod` (or `SITE_INDEX=true npm run build:rebuild`). Styleguide / 404 / Journal (`/blog`) stay `noindex`.
3. **Point hosting at rebuild dist** — done in root `vercel.json` (`build:rebuild:prod` → `rebuild/dist`).
4. **Apply vercel settings** — done (clean URLs, security headers, cache for `/assets`, `/css`, `/js`, legacy legal redirects).
5. **Legacy redirects** — done in root `vercel.json` (EN + `/sl`):
   - `/legal-pages/*` and short `/privacy-policy`, `/cookie-policy` → legal pages
   - `/faqs` → `/#faq` (home FAQ)
   - `/changelog`, `/waitlist` → `/` (app is live; download CTA on home)
   - `/blog-article` → first journal article URL
6. **Verify** after deploy
   - EN `/` and SL `/sl` render
   - Language switcher swaps correctly
   - Canonical + hreflang on a sample of pages
   - `/sitemap.xml` and `/robots.txt` (blog disallowed; Journal noindex until reopened)
   - Unknown path returns branded `404.html` (and `/sl/...` → `sl/404.html`)
   - Favicon + OG image resolve
7. **Analytics** — site bootstrap is live (GTM `GTM-W8XX2TWZ`, CookieConsent, Consent Mode, consent-gated PostHog). A separate server-side `server_pageview` counter runs in Vercel middleware (no client script, no cookies). Event names, properties, and consent behaviour: [`docs/analytics.md`](docs/analytics.md). Finish GTM workspace setup:
   - Enable **Consent Overview** on the container.
   - **GA4 Configuration** tag → Measurement ID `G-6YK1EKLMGS`, trigger All Pages, require consent `analytics_storage`.
   - **GA4 Event** tag for `contact_submit` (Custom Event trigger `contact_submit`) → event name `contact_submit`; pass `event_id`, `form_topic`.
   - Optional: GA4 Event for `newsletter_subscribe`.
   - **ChatGPT Ads** — Custom HTML from [`gtm/chatgpt-pixel.html`](gtm/chatgpt-pixel.html); consent `ad_storage` (advertisement). Set pixel ID in that file / tag when ready.
   - **Meta Pixel** — Custom HTML from [`gtm/meta-pixel.html`](gtm/meta-pixel.html); consent `ad_storage`. Set Pixel ID when ready.
   - Publish container; verify with Tag Assistant + GA4 DebugView on preview / production.

## Notes

- `scripts/prepare-public.js` excludes `rebuild/` so source/stubs never leak into the legacy Framer `public/` build.
- Local preview (noindex): `npm run build:rebuild && npm run serve:rebuild` → http://localhost:8090
- Local indexable preview: `npm run build:rebuild:prod && npm run serve:rebuild`
- Journal links stay off the public site while `JOURNAL_PUBLIC` is `false` in `rebuild/scripts/pages.js`. Set it to `true` to index `/blog`, allow it in `robots.txt`, and restore the nav, footer, home journal, and “Read Journal” links.
