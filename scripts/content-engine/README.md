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

## Preview

```bash
TOWNS_PUBLIC=true TOWNS_DRAFTS=true node rebuild/scripts/build.js
```

Outside services used: open-meteo (elevation), Nominatim (end point names), Wikidata
and Wikimedia Commons (sight names and photos). They receive coordinates and place
names only.
