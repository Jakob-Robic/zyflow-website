# Guide fixture (preview only)

`fixture-kamnicanka` is a test guide for previewing the guide page layout in
English, German and Slovenian. It is never published:

- it lives here, not in `content/guides`, so a normal build never reads it
- `fixture: true` makes a production build (`SITE_INDEX=true`) fail if it is
  ever copied into `content/guides`
- the page shows a "test guide" note at the top

Its numbers are real (the Kamničanka featured route: 70 km, 254 m), so the
layout is judged with realistic content.

Preview: `npm run guides:preview`, then `npm run serve:rebuild` and open
`/guides`, `/de/ratgeber` or `/sl/vodniki`.
