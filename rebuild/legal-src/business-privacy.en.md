# Privacy text for your website

<!-- DRAFT for Jakob's approval. -->
<!-- DEPENDENCY (2026-10-26): this text describes the TARGET state of the embed (zyflow-embed). Today the widget still loads map tiles, fonts and styles from tiles.openfreemap.org, logos and photos from Supabase storage (*.supabase.co), and some stop photos from third-party hosts (e.g. Wikimedia, PZS). Another builder is moving tiles and images to Zyflow domains. Do NOT publish before that ships, or add those hosts back to the "Where the data goes" list. -->
<!-- DEPENDENCY: the "random identifier for each page load" is described as specified, but on embed main (fedd93c) /api/collect events carry NO visitor or page-load id at all. If the stats work does not add one, delete that sentence (both languages); the rest stays accurate. -->

<!-- LEGAL CHECK: "independent controller" is our position. Under CJEU C-40/17 (Fashion ID) a site that embeds a third-party element can be a joint controller for the collection and transmission step. We avoid cookies and identifiers, which lowers this risk, but have a lawyer confirm the role wording before publishing. -->
**Last updated:** 26 October 2026

If you show a Zyflow bike map on your website (the widget, a hosted map page or a room QR page), your privacy information should mention it. Below is a paragraph you can copy into your privacy policy. Replace the text in square brackets. It describes what the widget does today; we will update this page if that changes.

This text is provided for your convenience and is not legal advice. Your website, and what you tell its visitors, remains your responsibility (section 15.12 of our [Terms](https://www.zyflow.eu/legal-pages/terms)).

## Paragraph to copy

> **Cycling map by Zyflow**
>
> Our website shows a cycling map provided by Zyflow, a service of HERKO d.o.o., Pševska cesta 10, 4000 Kranj, Slovenia ([legal@zyflow.eu](mailto:legal@zyflow.eu)). When you open a page with the map, your browser loads it from Zyflow's servers (embed.zyflow.eu). To deliver the map, these servers necessarily receive your IP address and technical information about the request, such as your browser type and the address of our page.
>
> The map does not set cookies and does not store or read any information on your device (no local storage or similar technologies). To count how the map is used, Zyflow records anonymous events, for example that the map was shown, a route or stop was opened or a route was downloaded. Each event contains only the page it happened on, the language, the device type (mobile, tablet or desktop), the country derived from your IP address and a random identifier created for each page load. Your IP address is not stored with these events and the identifier is not kept on your device, so visits cannot be linked to each other or to you. We, [name of your business], only receive totals from these statistics.
>
> Zyflow processes this data as an independent controller, on the basis of its legitimate interest in delivering, securing and measuring the map (Art. 6(1)(f) GDPR). Zyflow uses hosting and database providers as processors, with data stored in the EU. If you select "Open in Zyflow" or download a route, you go to Zyflow's website or app, where Zyflow's own privacy policy applies: [https://www.zyflow.eu/legal-pages/privacy-policy](https://www.zyflow.eu/legal-pages/privacy-policy).

## What the widget collects, in detail

| | |
|---|---|
| Cookies | None. The widget sets no cookies, first-party or third-party. |
| Local storage, session storage, IndexedDB | Not used. Nothing is stored on or read from the visitor's device. |
| Usage events | Map shown, stop opened, route opened, route downloaded (GPX), contact button clicked, "Open in Zyflow" clicked. Events in your Zyflow preview are not counted. |
| Data in each event | Your place, the widget, the type of page (website widget, hosted page or room QR code), the room name if the page was opened from a room QR code you printed, the route or stop involved, the language, the device type (mobile, tablet or desktop) and the country. |
| Country | Derived from the IP address by our hosting provider at the network edge. Our code does not read or store the IP address. |
| Page-load identifier | A random value created when the page loads, kept only in the page's memory and sent with that page's events. It is not stored on the device and is gone when the page is closed. |
| Not collected | Names, email addresses, IP addresses in statistics, precise location, cross-site or cross-visit identifiers, fingerprints, advertising data. |
| What you see | Totals per place, page type, room, route, stop, language, device type and country in the partner portal. |

## Where the data goes

- **Vercel, Inc.** delivers the widget (embed.zyflow.eu). Like any web host, it processes IP addresses and request data to serve pages and keep them secure; server logs are kept for up to 30 days.
- **Supabase, Inc.** stores the anonymous events and your map content in the EU (Ireland).
- Map tiles, your logo and photos are served from Zyflow's own domains.

Transfers outside the EU and retention are described in the [Zyflow Privacy Policy](https://www.zyflow.eu/legal-pages/privacy-policy) (sections 5 to 7).

## Do I need a cookie banner for the widget?

The widget does not store or access information on your visitors' devices, so it does not need cookie consent of its own and you do not need to list it in a cookie banner. Other tools on your website may still need consent.

## Do I need a data processing agreement?

For the widget, no: Zyflow does not process personal data on your behalf. See [Data processing for business customers](https://www.zyflow.eu/legal-pages/business-dpa).
