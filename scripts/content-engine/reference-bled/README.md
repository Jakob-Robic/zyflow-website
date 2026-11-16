# One-off scripts from 2026-11-16 (reference only)

These produced the Bled town page data and the first G2 route data by hand. They are
kept as the starting point for the repeatable town job; they are **not** the job and
are not run by anything.

| File | What it did |
|---|---|
| `export_town.py` | Pulled one municipality's raw data from the database (read-only) plus Wikidata and Commons lookups for sights |
| `make_page_data.py` | Turned that raw pull into `content/towns/bled/data.json`: first-version picks, kinds, opening hours, sight photos, route colours |
| `bled_about.json` | Hand-written one-line descriptions for Bled's picks (now part of the page via `data.json`; they belong in `text.en.json` under `places`) |
| `commons_search.py` | Search of Wikimedia Commons for quality-rated photos of a place |
| `make_route_data.py`, `g2_curation.json` | The first, hand-made version of the G2 route data. Replaced by `../export_route.py` |

The paths inside them point at a temporary folder and at `/Users/jakobrobic/Zyflow`; adjust before reuse.
