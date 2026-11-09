# Route collections

A collection is a named, ordered group of featured routes. The app reads them from
`public.route_collections`; this folder is where they are written down. The importer
is `scripts/import-route-collections.ts` in the app repo (zyflow-mobile-app).

| Kind | What it is | Example |
|---|---|---|
| `trail` | Stages ridden in order, with an overnight between them | `stkp/` (43 stages) |
| `set` | Routes from one source or place | `kranjska-kolesarska-roza/`, `trzic-kolesarske-poti/` |
| `theme` | Routes we pick by hand | "Gravel in Gorenjska" (none yet) |

A route can be in several collections.

## Layout

```
collections/<slug>/collection.txt          the collection
collections/<slug>/stages/<route-slug>/     routes that belong only to this collection (trails)
    meta.txt                                same keys as ../_template/meta.txt, plus collection + stage
    route.gpx                               the source's GPX, byte for byte
```

A `set` or `theme` lists routes that already exist (`featured/<slug>/`) in `routes:`.
A `trail` brings its own stages in `stages/`; their order is the `stage:` number.

## collection.txt

`key: value` lines. Empty values are fine.

| Key | Example | Notes |
|---|---|---|
| `slug` | `stkp` | Same as the folder name; lowercase words joined by `-` |
| `kind` | `trail` | `trail`, `set` or `theme` |
| `title_<lang>` | `title_sl: Slovenska turnokolesarska pot` | At least one language |
| `summary_<lang>` | one sentence | Shown under the title |
| `aliases` | `STKP; turno kolesarska pot` | `;`-separated. Other names people type; searched, not shown |
| `bike_types` | `mtb` | `,`-separated: `road`, `gravel`, `mtb`, `touring`, `ebike` |
| `season_months` | `5-10` or `5,6,9` | Months the route is usually rideable |
| `source_name`, `source_url` | `Visit Kranj` | Shown as the source |
| `permission` | `granted` | `granted`, `open_licence`, `own` or `unknown`. A collection can't be published with `unknown` |
| `license_notes`, `contact` | | Kept here only, never imported |
| `last_checked` | `2026-11-09` | When someone last checked the source |
| `published` | `no` | `yes` shows it to riders. A trail's stages follow this switch |
| `featured` | `no` | `yes` for the home screen |
| `sort` | `10` | Lower comes first |
| `keep_original_line` | `yes` | Stages keep the source's line exactly (no re-routing, push sections stay) |
| `routes` | `k11-planine-pod-kosuto, k16-trzic-jezersko` | Sets and themes only: route slugs in order |

## What is filled in automatically

Countries, municipalities and regions (Gorenjska, Kärnten …), total distance and climb,
the map frame and the search words are computed in the database from the route lines.
Never type them here.

## Importing

From the app repo, after the `route_collections` migration is live:

```bash
npx tsx scripts/import-route-collections.ts --website=../zyflow-website --dry-run
npx tsx scripts/import-route-collections.ts --website=../zyflow-website \
  --expect=4 --expect-routes=43 --project-ref=vaxfpyxkrusrezpaccpw
```

The dry run prints every collection, every stage and the overnight stop it matched
for the end of each stage. Check those before the write.
