# Content engine exports

Jobs that write the data files the town and route pages are built from. They only
read the production database (SELECT statements, see `db.py`); nothing here writes to it.

## Route pages

```bash
python3 scripts/content-engine/export_route.py g2-lesce-most-na-soci
```

```bash
python3 scripts/content-engine/export_route.py --tier 1
```

Writes `content/signed-routes/<slug>/data.json` and the sight photos under
`rebuild/assets/images/signed-routes/<slug>/`. Lines starting with `!` in the output
are things a person should look at (the name promises more than is mapped, branches,
too few picks, an open question in the registry).

**What is whose**

| File | Written by | Holds |
|---|---|---|
| `content/signed-routes/_registry.json` | a person | which database records make one page, the tier, open questions |
| `<slug>/data.json` | the job | line, length, climb, towns, counts, picks, sights. Never edit by hand |
| `<slug>/text.<lang>.json` | a person or a writing agent | page texts, `places` (one line per place, by id), `from` / `to` names, `status` |
| `<slug>/curation.json` | a person, optional | `{"exclude": ["<place id>"]}` to drop a pick |

A page is built only when its text file has `"status": "published"` (or in a preview
with `TOWNS_DRAFTS=true`).

**How the job decides**

- The route's line is the longest end-to-end path through its mapped pieces.
- The ends come from that line, not from the route's name.
- Picks: confirmed places with a working website, spread along the line (the best
  of each sixth first), one per website.
- Climb: open elevation data sampled every 250 m. An estimate; replace with the
  routing engine's figure before publishing.

**After a refresh**, re-read the page texts: they name places and kilometres, and
the picks can change.

## Town pages

```bash
python3 scripts/content-engine/export_town.py bled
```

```bash
python3 scripts/content-engine/export_town.py --batch 1
```

```bash
python3 scripts/content-engine/export_town.py --bar
```

A town is a municipality. Names on the command line can be page slugs (`sezana`) or
database codes (`senana`). `--batch 1` runs the towns listed in `content/towns/_batches.json`
and warns when one of them no longer passes the bar, or another one now does. `--bar`
lists every town that passes the bar today and writes nothing. 25 towns take about 6 minutes.

Writes `content/towns/<slug>/data.json` and the sight photos `sight-<id>.jpg` under
`rebuild/assets/images/towns/<slug>/` (it removes `sight-*` photos no pick uses any more).
Lines starting with `!` are things a person should look at.

**The page address.** The slug comes from the municipality's short name (Sežana → `sezana`,
Kranjska Gora → `kranjska-gora`, Koper / Capodistria → `koper`). `area_code` is damaged
for some towns (`senana`, `bretice`, `ajdovtcina`) and doubled for the bilingual ones
(`koper_capodistria`), so it is used only for joins. It is kept in data.json because the
route pages match towns on it.

**What is whose**

| File | Written by | Holds |
|---|---|---|
| `content/towns/_batches.json` | a person | which towns make each batch, the bar they passed and when |
| `<slug>/data.json` | the job | boundary, counts, routes and their lines, picks, sights, services. Never edit by hand |
| `<slug>/text.<lang>.json` | a person or a writing agent | page texts, `places` (one line per place, keyed by the start of its id), `status` |
| `<slug>/photos.json` | a person | `photos`: the town's large photos with captions and credits; `sights`: a photo for a sight whose encyclopedia entry has none, keyed by the start of its id |
| `<slug>/curation.json` | a person, optional | `{"exclude": ["<place id>"]}` to drop a pick |
| `rebuild/assets/images/towns/<slug>/photo-*`, `chosen-*` | a person | the photos named in photos.json |

A town without a text file still builds in a preview (`TOWNS_DRAFTS=true`), with a
one-line fallback per section; it is never built for a live site.

**The bar** for a page: 8 confirmed places to stay, 8 confirmed places to eat, 2 water
points and 3 sights in the municipality (decided 2026-11-16).

**How the job decides**

- Confirmed place: `poi_public_confidence.high_confidence`. The counts of places to stay
  and eat count confirmed places only.
- Routes: signed routes with at least 1 km in the town, not proposed, most kilometres
  first; each gets the next colour of the fixed list. The map line is the stretch within
  about 2 km of the town's border.
- Nearest route for each place: worked out here from route lines simplified to about 15 m.
  Where two routes share a road (within 15 m), the place is named after the coded route.
- Stay picks, up to six: confirmed, working website, sources agree 0.7 or more. One per
  website; at most two of one kind (hotel, guesthouse …); then the best agreement, then
  the closest to a route.
- Food picks, up to six: confirmed, working website. One per website; places with
  opening hours first, then the best agreement, then the closest to a route.
- Sights, up to six: only those with an encyclopedia entry (Wikidata), one per entry,
  no stamp markers ("žig"). Best known first: the number of Wikipedia languages, plus
  5 when the entry has a photo. A photo only when Commons states its licence.
- Water: count in town, and how many lie within 150 m of a signed route.
- Repair and charging: what is in town; when there is no bike shop or no charger, the
  nearest one from the town's centre, with its distance.

**After a refresh**, re-read the page texts: they name places and numbers, and the picks
can change. Then rewrite the review sheet:

```bash
python3 scripts/content-engine/review_towns.py --batch 1 ~/Zyflow/_notes/<date>-town-review-sheet.md
```

It also opens each pick's website once and compares the page title with the place's name
(see the script for what that catches and what it misses).

**Route page candidates** for a batch (the page rule: through a town of the batch, 3 or
more confirmed places within 400 m, 10 km or longer, a real name):

```bash
python3 scripts/content-engine/route_candidates.py --batch 1
```

## Preview

```bash
TOWNS_PUBLIC=true TOWNS_DRAFTS=true node rebuild/scripts/build.js
```

Outside services used: open-meteo (elevation), Nominatim (end point names), Wikidata
and Wikimedia Commons (sight names and photos). They receive coordinates, place names
and Wikidata ids only. The review sheet's website check opens the picks' own websites.
