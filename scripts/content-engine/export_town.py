#!/usr/bin/env python3
"""Write content/towns/<slug>/data.json for one or more towns (municipalities).

    python3 scripts/content-engine/export_town.py bled
    python3 scripts/content-engine/export_town.py bled sezana koper     (page slugs or area codes)
    python3 scripts/content-engine/export_town.py --batch 1
    python3 scripts/content-engine/export_town.py --bar                 (list towns that pass the bar; writes nothing)

Everything in data.json comes from this job; nothing in it is edited by hand.
Hand-written material lives next to it and is never written or deleted here:
  text.<lang>.json   page texts and "places" (one line per place, keyed by the start of its id)
  photos.json        the town's large photos, chosen by a person, with captions and credits
  curation.json      optional. {"exclude": [place ids]} drops places a person rejected;
                     {"picks": {"stays": [ids], "food": [ids]}} keeps hand-chosen picks,
                     in that order, ahead of the rule (ids may be shortened to their start)

The page address comes from the municipality's short name (Sežana -> sezana), never
from area_code, which is damaged for some towns (senana, bretice) and doubled for the
bilingual ones (koper_capodistria). area_code stays in data.json for joins and for
the route pages, which match towns on it.

Reads the production database (SELECT only, see db.py) with small pulls; distances
between places and routes are worked out here, not in the database. Outside services
get place names and Wikidata ids only: Wikidata and Wikimedia Commons (sight names
and photos).
"""
import json
import os
import re
import sys
import time
import unicodedata
import urllib.parse
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from db import query  # noqa: E402
from export_route import FOOD_KIND, LEVELS, SIGHT_KIND, STAY_KIND, commons_photo, get, hours, site  # noqa: E402
from geo import NearIndex  # noqa: E402
from names import name_routes  # noqa: E402
import urllib.error  # noqa: E402

WIKI_PAUSE = 1.5  # seconds between calls to Wikidata and Commons


def patiently(call, *args, **kwargs):
    """Run a call to Wikidata or Commons, waiting and trying again when they ask us to slow down (429)."""
    for attempt in range(5):
        try:
            return call(*args, **kwargs)
        except urllib.error.HTTPError as exc:
            if exc.code not in (429, 503) or attempt == 4:
                raise
            wait = int(exc.headers.get("Retry-After") or 0) or 30 * (attempt + 1)
            print(f"   (Wikimedia asks us to slow down; waiting {wait} s)")
            time.sleep(min(wait, 180))

REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
TOWNS_DIR = os.path.join(REPO, "content", "towns")
IMAGES_DIR = os.path.join(REPO, "rebuild", "assets", "images", "towns")
BATCHES = os.path.join(TOWNS_DIR, "_batches.json")

# The bar a town must pass to get a page (decided 2026-11-16).
BAR = {"stays": 8, "food": 8, "water": 2, "sights": 3}
PICKS = 6
SAME_KIND_MAX = 2  # stays: no more than two picks of one kind
WATER_NEAR_ROUTE_M = 150
ROUTE_MIN_KM = 1.0
LEVEL_ORDER = {"international": 0, "national": 1, "regional": 2, "local": 3}
NEAR_TIE_M = 15  # routes this close to each other count as the same road for "nearest route"
MAP_CLIP_DEG = 0.025  # route lines are drawn within this distance of the town's border (about 2 km)
ROUTE_COLORS = ["#2563EB", "#E8590C", "#7C3AED", "#0F9D58", "#D6336C", "#0891B2", "#A16207", "#1F2937"]
SIGHT_TYPES = tuple(SIGHT_KIND)
STAY_KINDS = {**STAY_KIND, "glamping": "Glamping", "resthouse": "Guesthouse"}
LIVE = "p.is_published and not p.is_deleted and p.superseded_by is null"


def slugify(name):
    plain = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", plain.lower()).strip("-")


def sql_list(values):
    return ",".join("'" + str(v).replace("'", "''") + "'" for v in values)


def bar_table():
    """Every municipality with the counts the bar looks at."""
    sights = sql_list(SIGHT_TYPES)
    return query(f"""with c as (
        select pm.area_code,
          count(*) filter (where p.type = 'accommodation' and c.high_confidence) stays,
          count(*) filter (where p.type in ('restaurant','cafe') and c.high_confidence) food,
          count(*) filter (where p.type = 'water_point') water,
          count(*) filter (where p.type in ({sights})) sights
        from pois p join poi_municipalities pm on pm.poi_id = p.id and pm.country_code = 'SI'
        left join poi_public_confidence c on c.poi_id = p.id
        where {LIVE} group by 1)
      select m.area_code, m.short_name, c.stays, c.food, c.water, c.sights
      from c join municipalities m on m.area_code = c.area_code and m.country_code = 'SI' order by m.short_name""")


def passes(row):
    return all(int(row[k]) >= v for k, v in BAR.items())


# --- route lines, pulled once per run and shared between towns -------------------------

_LINES = {}


def route_lines(ids):
    missing = [i for i in ids if i not in _LINES]
    for i in range(0, len(missing), 20):
        chunk = missing[i : i + 20]
        for row in query(f"select id, st_asgeojson(st_simplify(geom, 0.00015), 5) g from signed_routes where id in ({sql_list(chunk)})"):
            geom = json.loads(row["g"])
            _LINES[row["id"]] = [geom["coordinates"]] if geom["type"] == "LineString" else geom["coordinates"]
    return {i: _LINES.get(i, []) for i in ids}


def _rings(boundary):
    polys = boundary["coordinates"] if boundary["type"] == "MultiPolygon" else [boundary["coordinates"]]
    return [ring for poly in polys for ring in poly]


def _inside(x, y, rings):
    hit = False
    for ring in rings:
        for (x1, y1), (x2, y2) in zip(ring, ring[1:]):
            if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
                hit = not hit
    return hit


def _edge_dist(x, y, rings):
    best = float("inf")
    for ring in rings:
        for (x1, y1), (x2, y2) in zip(ring, ring[1:]):
            dx, dy = x2 - x1, y2 - y1
            t = 0.0 if dx == dy == 0 else max(0.0, min(1.0, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)))
            best = min(best, (x - x1 - t * dx) ** 2 + (y - y1 - t * dy) ** 2)
    return best ** 0.5


def clip_line(parts, boundary, bounds):
    """The stretch of a route that lies within MAP_CLIP_DEG of the town (the map only shows that).

    Same reach as buffering the town's border by 0.025 degrees, done here so the
    database never buffers or intersects a long route. A segment is kept when either
    end lies in reach, so lines run on slightly past the edge instead of stopping short.
    """
    rings = _rings(boundary)
    w, s, e, n = bounds
    d = MAP_CLIP_DEG

    def near(c):
        if not (w - d <= c[0] <= e + d and s - d <= c[1] <= n + d):
            return False
        return _inside(c[0], c[1], rings) or _edge_dist(c[0], c[1], rings) <= d

    out = []
    for part in parts:
        flags = [near(c) for c in part]
        run = []
        for i, c in enumerate(part):
            keep = flags[i] or (i > 0 and flags[i - 1]) or (i + 1 < len(part) and flags[i + 1])
            if keep:
                run.append(c)
            elif run:
                if len(run) > 1:
                    out.append(run)
                run = []
        if len(run) > 1:
            out.append(run)
    if not out:
        return None
    return {"type": "LineString", "coordinates": out[0]} if len(out) == 1 else {"type": "MultiLineString", "coordinates": out}


# --- one town ----------------------------------------------------------------------------


def cuisine(raw):
    if not raw:
        return []
    try:
        items = json.loads(raw)
        items = items if isinstance(items, list) else [items]
    except (ValueError, TypeError):
        items = re.split(r"[;,]", raw)
    return [str(i).strip().replace("_", " ") for i in items if str(i).strip()]


def pick(rows, rank, count=PICKS, kind_max=None, chosen_first=()):
    """Up to `count` places in rank order: one per website, at most `kind_max` of one kind.

    `chosen_first` are id prefixes a person picked by hand: those places come first, in
    the order given, and are not held to the kind limit. The rule fills what is left.
    """
    chosen, sites, kinds = [], set(), {}
    for prefix in chosen_first:
        row = next((r for r in rows if r["id"].startswith(prefix)), None)
        if row is None or row in chosen or len(chosen) == count:
            continue
        chosen.append(row)
        label = (site(row.get("website")) or {}).get("label")
        if label:
            sites.add(label)
        kinds[row["kind"]] = kinds.get(row["kind"], 0) + 1
    for row in sorted(rows, key=rank):
        if len(chosen) == count:
            break
        if row in chosen:
            continue
        label = (site(row.get("website")) or {}).get("label")
        if label and label in sites:
            continue
        if kind_max and kinds.get(row["kind"], 0) >= kind_max:
            continue
        chosen.append(row)
        if label:
            sites.add(label)
        kinds[row["kind"]] = kinds.get(row["kind"], 0) + 1
        if len(chosen) == count:
            break
    return chosen


def export(area_code, today=None):
    muni = query(f"""select name, short_name, region, st_x(st_centroid(geom)) lon, st_y(st_centroid(geom)) lat,
        st_xmin(geom) w, st_ymin(geom) s, st_xmax(geom) e, st_ymax(geom) n, st_asgeojson(st_simplify(geom, 0.0003), 5) boundary
      from municipalities where area_code = '{area_code}' and country_code = 'SI'""")
    if not muni:
        raise ValueError(f"no municipality with area_code {area_code}")
    muni = muni[0]
    name = muni["short_name"] or muni["name"]
    slug = slugify(name)
    folder = os.path.join(TOWNS_DIR, slug)
    boundary = json.loads(muni["boundary"])
    bounds = [muni["w"], muni["s"], muni["e"], muni["n"]]
    excluded, hand = set(), {}
    if os.path.exists(os.path.join(folder, "curation.json")):
        curation = json.load(open(os.path.join(folder, "curation.json")))
        excluded = set(curation.get("exclude", []))
        hand = curation.get("picks", {})

    in_town = f"join poi_municipalities pm on pm.poi_id = p.id and pm.area_code = '{area_code}' and pm.country_code = 'SI'"
    counts_raw = {r["type"]: r for r in query(f"""select p.type, count(*) n, count(*) filter (where c.high_confidence) high
        from pois p {in_town} left join poi_public_confidence c on c.poi_id = p.id where {LIVE} group by 1""")}
    n = lambda *types: sum(int(counts_raw.get(t, {}).get("n", 0)) for t in types)
    high = lambda *types: sum(int(counts_raw.get(t, {}).get("high", 0)) for t in types)

    rows = query(f"""select p.id, p.name, p.type, p.longitude lon, p.latitude lat,
        c.high_confidence high, c.website, c.website_usable usable, c.overture_confidence conf,
        p.metadata->>'accommodation_type' stay_type, p.metadata->>'opening_hours' hours,
        p.metadata->>'cuisine' cuisine, p.metadata->>'outdoor_seating' outdoor,
        p.metadata->'osm_tags'->>'wikidata' wikidata
      from pois p {in_town} left join poi_public_confidence c on c.poi_id = p.id
      where {LIVE} and (
        (p.type in ('accommodation','restaurant','cafe') and c.high_confidence)
        or p.type in ('water_point','bicycle_repair','bicycle_shop','charging_station',{sql_list(SIGHT_TYPES)}))""")
    rows = [r for r in rows if not any(r["id"].startswith(x) for x in excluded)]
    for r in rows:
        r["conf"] = float(r["conf"]) if r["conf"] is not None else 0.0

    routes = query(f"""select r.id, r.code, r.display_name, r.kind, r.network_level, r.length_km, r.website, r.member_names,
        round(sum(sm.km_inside)::numeric, 1) km_inside
      from signed_routes r join signed_route_municipalities sm on sm.route_id = r.id
      where sm.area_code = '{area_code}' and sm.country_code = 'SI' and not r.is_proposed
      group by r.id having sum(sm.km_inside) >= {ROUTE_MIN_KM} order by sum(sm.km_inside) desc, r.id""")
    # Routes the import left nameless take a looked-up name or their label in the map data (names.py).
    # One that still has neither cannot be shown or told apart; leave it out and count it.
    name_routes(routes)
    unnamed = [r for r in routes if not (r["code"] or r["display_name"])]
    routes = [r for r in routes if r["code"] or r["display_name"]]
    # Known long routes first (international, national, regional), then local ones; within a
    # level, the route with more kilometres in town. A page shows the first eight (Jakob, 2026-11-16).
    routes.sort(key=lambda r: (LEVEL_ORDER.get(r["network_level"], 3), -float(r["km_inside"]), r["id"]))
    lines = route_lines([r["id"] for r in routes])
    # Where two routes share a road, a place is named after the coded route (D2 rather than
    # the long-distance route on the same road), then the one with more kilometres in town.
    by_code = sorted(routes, key=lambda r: r["code"] is None)
    index = NearIndex([(r["code"] or r["display_name"], part) for r in by_code for part in lines[r["id"]]])

    def near(row):
        hit = index.nearest(row["lon"], row["lat"], tie_m=NEAR_TIE_M)
        return {"route": hit[0], "m": hit[1]} if hit else None

    for r in rows:
        r["near"] = near(r)
        r["near_m"] = r["near"]["m"] if r["near"] else 10**9

    # Stays: confirmed, working website, sources agree (0.7+); variety of kind, then agreement.
    stays_all = [r for r in rows if r["type"] == "accommodation"]
    for r in stays_all:
        r["kind"] = STAY_KINDS.get(r["stay_type"], "Stay")
    stays = pick([r for r in stays_all if r["usable"] and r["conf"] >= 0.7], lambda r: (-r["conf"], r["near_m"], r["id"]), kind_max=SAME_KIND_MAX, chosen_first=hand.get("stays", ()))
    # Food: confirmed, working website; places with opening hours first, then agreement.
    food_all = [r for r in rows if r["type"] in ("restaurant", "cafe")]
    for r in food_all:
        r["kind"] = FOOD_KIND.get(r["type"], "Food")
    food = pick([r for r in food_all if r["usable"]], lambda r: (r["hours"] is None, -r["conf"], r["near_m"], r["id"]), chosen_first=hand.get("food", ()))

    def place(row, pin):
        item = {
            "id": row["id"], "name": row["name"], "kind": row["kind"], "pin": pin or row["type"],
            "lon": row["lon"], "lat": row["lat"], "site": site(row["website"]), "near": row["near"],
        }
        if row["type"] in ("restaurant", "cafe"):
            extras = cuisine(row["cuisine"])
            item["hours"] = hours(row["hours"])
            item["extras"] = ([", ".join(extras).capitalize()] if extras else []) + (["Outdoor seating"] if row["outdoor"] == "true" else [])
        return item

    # Sights: only those with an encyclopedia entry, best known first; a photo only with a stated licence.
    seen, sights_raw = set(), []
    for row in sorted((r for r in rows if r["type"] in SIGHT_TYPES and r["wikidata"]), key=lambda r: (r["near_m"], r["id"])):
        if "žig" in row["name"].lower() or row["wikidata"] in seen:
            continue
        seen.add(row["wikidata"])
        sights_raw.append(row)
    entities = {}
    for i in range(0, len(sights_raw), 40):
        chunk = [r["wikidata"] for r in sights_raw[i : i + 40]]
        entities.update(patiently(get, "https://www.wikidata.org/w/api.php?" + urllib.parse.urlencode({"action": "wbgetentities", "ids": "|".join(chunk), "props": "labels|descriptions|claims|sitelinks", "languages": "en|sl", "format": "json"}))["entities"])
        time.sleep(WIKI_PAUSE)
    # A map point tagged with a person's entry (a statue of Rutar, a house named after Alma Karlin),
    # with an empty entry, or with a place whose own location is elsewhere (more than ~2 km away)
    # is not this sight. Entries without a location of their own are kept (many waterfalls).
    def same_place(row):
        claims = entities.get(row["wikidata"], {}).get("claims", {})
        kinds = {c.get("mainsnak", {}).get("datavalue", {}).get("value", {}).get("id") for c in claims.get("P31", [])}
        if "Q5" in kinds:
            return False
        spots = [c.get("mainsnak", {}).get("datavalue", {}).get("value") or {} for c in claims.get("P625", [])]
        spots = [v for v in spots if "latitude" in v]
        if not spots:
            return bool(kinds)
        return any(abs(v["latitude"] - row["lat"]) < 0.018 and abs(v["longitude"] - row["lon"]) < 0.026 for v in spots)

    dropped = [r["name"] for r in sights_raw if not same_place(r)]
    sights_raw = [r for r in sights_raw if same_place(r)]
    if dropped:
        print(f"   sights whose encyclopedia entry is a person, an object or another place: {', '.join(dropped[:8])}")
    for row in sights_raw:
        ent = entities.get(row["wikidata"], {})
        row["fame"] = len(ent.get("sitelinks", {})) + (5 if ent.get("claims", {}).get("P18") else 0)
    image_dir = os.path.join(IMAGES_DIR, slug)
    # Photos from the last run are kept when the sight's encyclopedia photo is unchanged,
    # so a refresh does not download them again.
    previous = {}
    if os.path.exists(os.path.join(folder, "data.json")):
        for old in json.load(open(os.path.join(folder, "data.json"))).get("sights", []):
            if old.get("image") and old.get("image_file"):
                previous[old["id"]] = old
    sights = []
    for row in sorted(sights_raw, key=lambda r: (-r["fame"], r["near_m"], r["id"]))[:PICKS]:
        ent = entities.get(row["wikidata"], {})
        en_title = ent.get("sitelinks", {}).get("enwiki", {}).get("title")
        item = {
            "id": row["id"], "name": ent.get("labels", {}).get("en", {}).get("value") or row["name"], "local_name": row["name"],
            "kind": SIGHT_KIND.get(row["type"], "Sight"), "pin": row["type"], "lon": row["lon"], "lat": row["lat"],
            "about": ent.get("descriptions", {}).get("en", {}).get("value"), "near": row["near"],
            "wiki": "https://en.wikipedia.org/wiki/" + en_title.replace(" ", "_") if en_title else None,
            "wikidata": row["wikidata"],
        }
        files = [c["mainsnak"].get("datavalue", {}).get("value") for c in ent.get("claims", {}).get("P18", [])]
        if files and files[0]:
            file_name = f"sight-{row['id'][:8]}.jpg"
            old = previous.get(row["id"])
            if old and old["image_file"] == files[0] and os.path.exists(os.path.join(image_dir, file_name)):
                item["image"], item["image_file"] = old["image"], files[0]
            else:
                try:
                    photo = patiently(commons_photo, files[0], image_dir, file_name, width=960)
                except Exception as exc:  # noqa: BLE001
                    print(f"   ! {slug}: photo for {item['name']} failed: {exc}")
                    photo = None
                time.sleep(WIKI_PAUSE)
                if photo:
                    photo["src"] = f"./assets/images/towns/{slug}/{file_name}"
                    item["image"], item["image_file"] = photo, files[0]
        sights.append(item)
    # The job owns the sight photos in the folder (sight-*.jpg); the town photos (photo-*) are a person's.
    if os.path.isdir(image_dir):
        used = {os.path.basename(s["image"]["src"]) for s in sights if s.get("image")}
        for file_name in os.listdir(image_dir):
            if file_name.startswith("sight-") and file_name not in used:
                os.remove(os.path.join(image_dir, file_name))

    water = [r for r in rows if r["type"] == "water_point"]
    repair = [r for r in rows if r["type"] in ("bicycle_repair", "bicycle_shop")]
    chargers = [r for r in rows if r["type"] == "charging_station"]

    centre = f"(select st_centroid(geom) from municipalities where area_code = '{area_code}' and country_code = 'SI')"

    def nearest(types, cols):
        found = query(f"""select p.name, {cols} mu.short_name municipality,
            round(st_distance(p.location::geography, {centre}::geography) / 100) / 10 km
          from pois p left join poi_municipalities pm on pm.poi_id = p.id
          left join municipalities mu on mu.area_code = pm.area_code and mu.country_code = pm.country_code
          where p.type in ({sql_list(types)}) and {LIVE}
          order by p.location::geometry <-> {centre} limit 1""")
        return found[0] if found else None

    featured = query(f"""select f.slug, f.name, f.distance_meters, f.ascent_m, f.difficulty from featured_routes f
      where f.is_published and st_intersects(f.geom, (select geom from municipalities where area_code = '{area_code}' and country_code = 'SI'))
      order by f.slug""")
    neighbours = query(f"""select b.short_name from municipalities a join municipalities b on st_intersects(a.geom, b.geom)
      where a.area_code = '{area_code}' and a.country_code = 'SI' and b.country_code = 'SI' and b.area_code <> a.area_code order by b.short_name""")

    data = {
        "slug": slug, "area_code": area_code, "name": name, "official_name": muni["name"], "region": muni["region"], "country": "Slovenia",
        "checked": today or date.today().isoformat(),
        "center": [round(muni["lon"], 5), round(muni["lat"], 5)], "bounds": bounds, "boundary": boundary,
        "counts": {
            "routes": len(routes), "stays": high("accommodation"), "food": high("restaurant", "cafe"), "water": n("water_point"),
            "repair": n("bicycle_repair", "bicycle_shop"), "chargers": n("charging_station"), "sights": n(*SIGHT_TYPES),
        },
        "unnamed_routes": [{"id": r["id"], "km_inside": round(float(r["km_inside"]), 1), "length_km": round(float(r["length_km"]), 1)} for r in unnamed],
        "water_near_route": sum(1 for w in water if w["near_m"] <= WATER_NEAR_ROUTE_M),
        "routes": [
            {
                "id": r["id"], "color": ROUTE_COLORS[i % len(ROUTE_COLORS)], "code": r["code"], "name": r["display_name"] or r["code"],
                "level": LEVELS.get(r["network_level"], "Marked route"), "kind": r["kind"], "length_km": round(float(r["length_km"])),
                "km_inside": round(float(r["km_inside"])), "website": site(r["website"]), "line": clip_line(lines[r["id"]], boundary, bounds), **r.get("hand", {}),
            }
            for i, r in enumerate(routes)
        ],
        "featured": [{"slug": f["slug"], "name": f["name"], "km": round(f["distance_meters"] / 1000), "climb_m": f["ascent_m"], "difficulty": f["difficulty"]} for f in featured],
        "stays": [place(r, "accommodation") for r in stays],
        "food": [place(r, None) for r in food],
        "sights": sights,
        "repair": [{"id": r["id"], "name": r["name"], "type": r["type"], "lon": r["lon"], "lat": r["lat"]} for r in sorted(repair, key=lambda r: (r["type"], r["name"] or ""))],
        "nearest_shop": None if any(r["type"] == "bicycle_shop" for r in repair) else nearest(["bicycle_shop"], ""),
        "nearest_charger": None if chargers else nearest(["charging_station"], "p.type, p.longitude lon, p.latitude lat,"),
        "neighbours": [x["short_name"] for x in neighbours],
    }
    os.makedirs(folder, exist_ok=True)
    with open(os.path.join(folder, "data.json"), "w") as out:
        json.dump(data, out, ensure_ascii=False, indent=1)

    flags = []
    if len(stays) < PICKS or len(food) < PICKS:
        flags.append(f"fewer than {PICKS} picks: {len(stays)} stays, {len(food)} food")
    if len(sights) < 3:
        flags.append(f"only {len(sights)} sights with an encyclopedia entry")
    if not chargers:
        flags.append("no charger in town")
    if not repair:
        flags.append("no repair point in town")
    print(f"{slug} ({area_code}): {len(routes)} routes, picks {len(stays)}/{len(food)}/{len(sights)} ({sum(1 for s in sights if s.get('image'))} photos), counts {data['counts']}")
    for flag in flags:
        print("   !", flag)
    return data


def resolve(args):
    """Page slugs or area codes -> area codes."""
    table = {r["area_code"]: r for r in query("select area_code, short_name from municipalities where country_code = 'SI'")}
    by_slug = {slugify(r["short_name"]): code for code, r in table.items()}
    out, unknown = [], []
    for arg in args:
        code = arg if arg in table else by_slug.get(arg)
        (out if code else unknown).append(code or arg)
    if unknown:
        sys.exit(f"unknown town: {', '.join(unknown)}")
    return out


def main():
    sys.stdout.reconfigure(line_buffering=True)
    args = sys.argv[1:]
    if not args:
        sys.exit(__doc__)
    if args[0] == "--bar":
        rows = bar_table()
        good = [r for r in rows if passes(r)]
        for r in good:
            print(f"{r['area_code']:<24} {slugify(r['short_name']):<24} stays {r['stays']:>4}  food {r['food']:>4}  water {r['water']:>4}  sights {r['sights']:>4}")
        print(f"{len(good)} towns pass the bar {BAR}")
        return
    if args[0] == "--batch":
        batch = json.load(open(BATCHES))[args[1]]
        codes = batch["towns"]
        rows = {r["area_code"]: r for r in bar_table()}
        now = {c for c, r in rows.items() if passes(r)}
        for code in sorted(set(codes) - now):
            print(f"   ! {code} is in batch {args[1]} but no longer passes the bar")
        for code in sorted(now - set(codes)):
            print(f"   ! {code} passes the bar but is not in batch {args[1]}")
    else:
        codes = resolve(args)
    started = time.time()
    failed = []
    for code in codes:
        for attempt in (1, 2):
            try:
                export(code)
                break
            except Exception as exc:  # noqa: BLE001
                if attempt == 2:
                    failed.append(code)
                    print(f"{code}: FAILED: {str(exc)[:300]}")
                else:
                    print(f"{code}: failed once ({str(exc)[:120]}); trying again")
                    time.sleep(10)
    print(f"{len(codes) - len(failed)} of {len(codes)} towns written in {round(time.time() - started)} s" + (f"; failed: {', '.join(failed)}" if failed else ""))


if __name__ == "__main__":
    main()
