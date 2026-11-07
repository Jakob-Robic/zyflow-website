# Guides

One rider question per page, answered at the top. Hidden until
`GUIDES_PUBLIC` in `rebuild/scripts/pages.js` is turned on. Every build still
checks the files here, so a broken guide fails CI before launch.

| Language | Index          | Guide                    |
| -------- | -------------- | ------------------------ |
| EN       | `/guides`      | `/guides/<slug>`         |
| DE       | `/de/ratgeber` | `/de/ratgeber/<slug>`    |
| SL       | `/sl/vodniki`  | `/sl/vodniki/<slug>`     |

## Files

`content/guides/<key>/en.md`, `de.md`, `sl.md`. Any language can be missing.
`<key>` is lowercase kebab-case and never changes; it is also the campaign
(`guide-<key>`) on store and planner links. Images for a map go in
`content/guides/<key>/images/`.

```yaml
---
status: draft                 # draft | published
slug: is-the-kamnicanka-loop-hard   # per language
question: Is the Kamničanka loop hard?   # the H1, 7 words at most
seoTitle: Is the Kamničanka bike loop hard? Distance and climbing   # optional, 60 characters
description: One or two sentences, 160 characters at most, in the page language.
answer: >-
  The short answer. Question + answer stay under 100 words.
checked: 2026-11-07           # shown as "Checked on"; required to publish
data:                         # required to publish: rows, a map, or both
  rows:
    - label: Distance
      value: 70 km
      source: Zyflow route page
      url: https://www.zyflow.eu/tours/kamnicanka   # optional
      asOf: 2026-11-07
  map:
    src: images/map.jpg
    alt: The loop on a map
    credit: © OpenStreetMap contributors
    asOf: 2026-11-07
sources:                      # at least one to publish
  - title: Kamničanka, route page on zyflow.eu
    url: https://www.zyflow.eu/tours/kamnicanka
    accessed: 2026-11-07      # optional
related: [other-guide-key]    # same-language versions are linked; missing ones are skipped
planner: /route/kamnicanka    # optional "Open in the planner" target
---
## Section heading

Body in Markdown. `##` sections, paragraphs, lists and links. No images or HTML.
```

## Rules the build enforces

- The whole page (question, answer, data rows, body) is 600 words at most.
- Real numbers only: every data row has a source and an "as of" date, and no date is in the future.
- No emoji. Never call Zyflow a "Komoot alternative" or a "navigation app".
  Positioning: "Komoot gets you there. Zyflow is where you stop."
- Description, title and answer must read as the page language (EN, DE or SL).
- One main call to action: the App Store and Google Play buttons. The planner link sits under them.

## Preview

```bash
npm run guides:preview
npm run serve:rebuild
```

Then open `/guides`, `/de/ratgeber` or `/sl/vodniki`. The preview shows drafts
as published and adds the test guide from `rebuild/scripts/fixtures/guides`.
Never deploy a preview build.
