#!/usr/bin/env python3
"""Write content/signed-routes/<slug>/data.json for one route in the registry.

    python3 scripts/content-engine/export_route.py g2-lesce-most-na-soci
    python3 scripts/content-engine/export_route.py --tier 1

Everything in data.json comes from this job; nothing in it is edited by hand.
Hand-written material lives next to it and is never overwritten:
  text.<lang>.json   page texts, per-place descriptions ("places": {id: text}),
                     and optional "from" / "to" names for the title
  curation.json      optional {"exclude": [place ids]} for picks a person rejected

Reads the production database (SELECT only, see db.py). Outside services get
coordinates and place names only: open-meteo (elevation), Nominatim (end points),
Wikidata and Wikimedia Commons (sight names and photos).
"""
import html
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from datetime import date
from urllib.parse import urlparse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from db import query  # noqa: E402
from geo import Line, main_line  # noqa: E402
from names import name_routes  # noqa: E402

REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
ROUTES_DIR = os.path.join(REPO, "content", "signed-routes")
IMAGES_DIR = os.path.join(REPO, "rebuild", "assets", "images", "signed-routes")
UA = {"User-Agent": "zyflow-content-engine/0.1 (route page export)"}

# How far from the line a place may be to count as "on the route" (metres).
REACH = {"stays": 400, "food": 300, "water": 150, "service": 1000, "sights": 1500}
PICKS = 6
LEVELS = {"international": "International route", "national": "National route", "regional": "Regional route", "local": "Local route"}
STAY_KIND = {"guesthouse": "Guesthouse", "guest_house": "Guesthouse", "bnb": "Guesthouse", "hotel": "Hotel", "apartment": "Apartment", "hostel": "Hostel", "campsite": "Campsite", "camp_site": "Campsite"}
FOOD_KIND = {"restaurant": "Restaurant", "cafe": "Café"}
SIGHT_KIND = {"historic": "Historic site", "attraction": "Attraction", "viewpoint": "Viewpoint", "waterfall": "Waterfall", "gorge": "Gorge", "cave": "Cave", "museum": "Museum"}


def get(url):
    return json.load(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=45))


def strip_tags(text):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", text or ""))).strip()


def site(url):
    if not url:
        return None
    if not re.match(r"https?://", url):
        url = "https://" + url
    url = re.split(r"[?&](?:_gl|utm_[a-z]+|fbclid)=", url)[0]
    return {"url": url, "label": urlparse(url).netloc.replace("www.", "")}


def hours(text):
    if not text:
        return None
    text = re.sub(r"\b((?:Mo|Tu|We|Th|Fr|Sa|Su|PH)(?:[-,](?:Mo|Tu|We|Th|Fr|Sa|Su|PH))*):", r"\1", text)
    return text.replace("-", "–").replace(",PH", " and holidays")


def reverse(lon, lat):
    data = get("https://nominatim.openstreetmap.org/reverse?" + urllib.parse.urlencode({"lat": lat, "lon": lon, "format": "jsonv2", "zoom": 14, "accept-language": "sl"}))
    time.sleep(1.1)
    addr = data.get("address", {})
    return addr.get("village") or addr.get("town") or addr.get("city") or addr.get("hamlet") or addr.get("suburb") or data.get("name")


def pick_spread(rows, line_km, count=PICKS):
    """Choose places spread along the route: the best of each stretch first, then the best of the rest.

    "Best" is the highest agreement between our sources, then the closest to the line.
    One pick per website, so a hotel listed twice does not take two cards.
    """
    rank = lambda r: (-(r.get("conf") or 0), r["m"])
    chosen, sites = [], set()

    def take(row):
        label = (site(row.get("website")) or {}).get("label")
        if row in chosen or (label and label in sites):
            return False
        chosen.append(row)
        if label:
            sites.add(label)
        return True

    stretch = line_km / count if line_km else 1
    for i in range(count):
        here = sorted((r for r in rows if i * stretch <= r["km"] < (i + 1) * stretch or (i == count - 1 and r["km"] >= line_km)), key=rank)
        for row in here:
            if take(row):
                break
    for row in sorted(rows, key=rank):
        if len(chosen) >= count:
            break
        take(row)
    return sorted(chosen, key=lambda r: r["km"])


def commons_photo(file_name, dest_dir, dest_name, width=1280):
    data = get("https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode({"action": "query", "titles": "File:" + file_name, "prop": "imageinfo", "iiprop": "url|extmetadata", "iiurlwidth": width, "format": "json"}))
    info = (list(data["query"]["pages"].values())[0].get("imageinfo") or [None])[0]
    if not info:
        return None
    meta = info.get("extmetadata", {})
    value = lambda key: meta.get(key, {}).get("value")
    if not value("LicenseShortName"):
        return None  # no usable licence: no photo
    os.makedirs(dest_dir, exist_ok=True)
    with open(os.path.join(dest_dir, dest_name), "wb") as out:
        out.write(urllib.request.urlopen(urllib.request.Request(info["thumburl"], headers=UA), timeout=90).read())
    author = strip_tags(value("Artist"))
    assumed = re.search(r"provided\. (.+?) assumed", author)
    return {
        "src": f"./assets/images/signed-routes/{os.path.basename(dest_dir)}/{dest_name}",
        "author": (assumed.group(1) if assumed else author)[:60] or "Wikimedia Commons",
        "licence": value("LicenseShortName"),
        "licence_url": value("LicenseUrl"),
        "source": info.get("descriptionurl"),
    }


def export(entry):
    slug = entry["slug"]
    ids = ",".join(f"'{r}'" for r in entry["records"])
    geom = f"(select st_collect(geom) from signed_routes where id in ({ids}))"
    folder = os.path.join(ROUTES_DIR, slug)
    curation = {}
    if os.path.exists(os.path.join(folder, "curation.json")):
        curation = json.load(open(os.path.join(folder, "curation.json")))
    excluded = set(curation.get("exclude", []))

    records = name_routes(query(f"select id, code, display_name, kind, network_level, length_km, website, member_names from signed_routes where id in ({ids}) order by length_km desc"))
    head = records[0]
    title = head["display_name"] or ""  # a route known only by its code has no name to read ends from
    box = query(f"select st_xmin(g) w, st_ymin(g) s, st_xmax(g) e, st_ymax(g) n from (select {geom} g) x")[0]
    pieces = [json.loads(r["g"])["coordinates"] for r in query(f"select st_asgeojson(g, 6) g from (select (st_dump(st_linemerge({geom}))).geom g) x")]
    path, share = main_line(pieces)

    # Start at the end the route's own name starts with.
    first = title.split("–")[0].strip()
    try:
        hit = first and get("https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode({"q": f"{first}, Slovenia", "format": "jsonv2", "limit": 1}))
        time.sleep(1.1)
        if hit:
            start = (float(hit[0]["lon"]), float(hit[0]["lat"]))
            if (path[-1][0] - start[0]) ** 2 + (path[-1][1] - start[1]) ** 2 < (path[0][0] - start[0]) ** 2 + (path[0][1] - start[1]) ** 2:
                path.reverse()
    except Exception:  # noqa: BLE001
        pass
    line = Line(path)

    near = f"st_dwithin(p.location::geography, {geom}::geography, {max(REACH.values())})"
    rows = query(f"""select p.id, p.name, p.type, p.longitude lon, p.latitude lat, mu.name town,
        c.high_confidence high, c.website, c.website_usable usable, c.overture_confidence conf,
        p.metadata->>'accommodation_type' stay_type, p.metadata->>'opening_hours' hours,
        p.metadata->'osm_tags'->>'wikidata' wikidata
      from pois p
      left join poi_public_confidence c on c.poi_id = p.id
      left join poi_municipalities pm on pm.poi_id = p.id
      left join municipalities mu on mu.area_code = pm.area_code and mu.country_code = pm.country_code
      where p.is_published and not p.is_deleted and p.superseded_by is null
        and p.type in ('accommodation','restaurant','cafe','water_point','bicycle_repair','bicycle_shop','charging_station','historic','attraction','viewpoint','waterfall','gorge','cave','museum')
        and {near}""")
    for row in rows:
        row["km"], row["m"] = line.locate(row["lon"], row["lat"])
    rows = [r for r in rows if r["id"] not in excluded]
    within = lambda group, types: [r for r in rows if r["type"] in types and r["m"] <= REACH[group]]

    stays_all = [r for r in within("stays", {"accommodation"}) if r["high"]]
    food_all = [r for r in within("food", {"restaurant", "cafe"}) if r["high"]]
    stays = pick_spread([r for r in stays_all if r["usable"] and (r["conf"] or 0) >= 0.7], line.km)
    food = pick_spread([r for r in food_all if r["usable"]], line.km)
    water = within("water", {"water_point"})
    service = sorted(within("service", {"bicycle_repair", "bicycle_shop", "charging_station"}), key=lambda r: r["km"])

    def place(row, kinds, kind_key, fallback, pin):
        return {
            "id": row["id"], "name": row["name"], "kind": kinds.get(row.get(kind_key) or row["type"], fallback), "pin": pin or row["type"],
            "lon": row["lon"], "lat": row["lat"], "town": row["town"], "km": round(row["km"]), "m": row["m"],
            "site": site(row["website"]), "hours": hours(row["hours"]),
        }

    # Sights: only those with an encyclopedia entry; a photo only with a stated licence.
    candidates = [r for r in within("sights", set(SIGHT_KIND)) if r["wikidata"]]
    seen, unique = set(), []
    for row in sorted(candidates, key=lambda r: r["m"]):
        if row["wikidata"] not in seen:
            seen.add(row["wikidata"])
            unique.append(row)
    entities = {}
    for i in range(0, len(unique), 40):
        chunk = [r["wikidata"] for r in unique[i : i + 40]]
        entities.update(get("https://www.wikidata.org/w/api.php?" + urllib.parse.urlencode({"action": "wbgetentities", "ids": "|".join(chunk), "props": "labels|descriptions|claims|sitelinks", "languages": "en|sl", "format": "json"}))["entities"])
    for row in unique:
        ent = entities.get(row["wikidata"], {})
        row["conf"] = len(ent.get("sitelinks", {})) + (5 if ent.get("claims", {}).get("P18") else 0)  # better known first
        row["website"] = row["wikidata"]
    sights = []
    for row in pick_spread(unique, line.km):
        ent = entities.get(row["wikidata"], {})
        photo_files = [c["mainsnak"].get("datavalue", {}).get("value") for c in ent.get("claims", {}).get("P18", [])]
        en_title = ent.get("sitelinks", {}).get("enwiki", {}).get("title")
        item = {
            "id": row["id"], "name": ent.get("labels", {}).get("en", {}).get("value") or row["name"], "local_name": row["name"],
            "kind": SIGHT_KIND.get(row["type"], "Sight"), "pin": row["type"], "lon": row["lon"], "lat": row["lat"], "town": row["town"],
            "km": round(row["km"]), "m": row["m"], "about": ent.get("descriptions", {}).get("en", {}).get("value"),
            "wiki": "https://en.wikipedia.org/wiki/" + en_title.replace(" ", "_") if en_title else None,
        }
        if photo_files and photo_files[0]:
            photo = commons_photo(photo_files[0], os.path.join(IMAGES_DIR, slug), f"sight-{row['id'][:8]}.jpg")
            if photo:
                item["image"] = photo
        sights.append(item)

    towns = query(f"""select m.name, m.area_code, m.region, round(sum(sm.km_inside)::numeric, 1) km,
        st_x(st_pointonsurface(st_intersection(m.geom, {geom}))) lon, st_y(st_pointonsurface(st_intersection(m.geom, {geom}))) lat
      from signed_route_municipalities sm
      join municipalities m on m.area_code = sm.area_code and m.country_code = sm.country_code
      where sm.route_id in ({ids}) group by m.name, m.area_code, m.region, m.geom""")
    for town in towns:
        town["at_km"], off = line.locate(town["lon"], town["lat"])
        town["on_line"] = off < 1500
    towns = sorted((t for t in towns if t["on_line"]), key=lambda t: t["at_km"])

    # Climb: elevation every ~250 m along the line, lightly smoothed, counting rises of 5 m or more.
    steps = max(2, int(line.km / 0.25))
    samples = [line.at_km(line.km * i / steps) for i in range(steps + 1)]
    elevation = []
    for i in range(0, len(samples), 100):
        chunk = samples[i : i + 100]
        elevation += get("https://api.open-meteo.com/v1/elevation?" + urllib.parse.urlencode({"latitude": ",".join(f"{c[1]:.5f}" for c in chunk), "longitude": ",".join(f"{c[0]:.5f}" for c in chunk)}))["elevation"]
        time.sleep(0.6)
    smooth = [sum(elevation[max(0, i - 2) : i + 3]) / len(elevation[max(0, i - 2) : i + 3]) for i in range(len(elevation))]
    up = down = 0.0
    ref = smooth[0]
    for value in smooth[1:]:
        if value - ref > 5:
            up, ref = up + value - ref, value
        elif ref - value > 5:
            down, ref = down + ref - value, value
    top = max(range(len(elevation)), key=lambda i: elevation[i])

    ends = {"start": reverse(*path[0]), "end": reverse(*path[-1]), "high": reverse(*line.at_km(line.km * top / steps))}
    codes = sorted({r["code"] for r in records if r["code"]})
    data = {
        "slug": slug, "tier": entry.get("tier"), "records": entry["records"],
        "code": codes[0] if len(codes) == 1 else None, "official_name": head["display_name"],
        "level": LEVELS.get(head["network_level"], "Signed route"), "kind": head["kind"], "country": "Slovenia",
        "checked": date.today().isoformat(),
        "km": round(line.km), "km_exact": round(line.km, 1), "mapped_km": round(sum(float(r["length_km"]) for r in records), 1), "line_share": round(share, 2),
        "from": ends["start"], "to": ends["end"], "ends": ends,
        "climb_m": int(round(up, -1)), "descent_m": int(round(down, -1)), "climb_source": "open-meteo elevation, sampled every 250 m",
        "high_m": round(max(elevation)), "high_at_km": round(line.km * top / steps), "high_place": ends["high"], "low_m": round(min(elevation)),
        "start_m": round(elevation[0]), "end_m": round(elevation[-1]),
        "bounds": [box["w"], box["s"], box["e"], box["n"]], "line": line.thinned(),
        "towns": [{"name": t["name"], "area_code": t["area_code"], "region": t["region"], "km_inside": round(float(t["km"])), "at_km": round(t["at_km"])} for t in towns],
        "counts": {
            "towns": len(towns), "stays": len(stays_all), "food": len(food_all), "water": len(water),
            "repair": sum(1 for s in service if s["type"] != "charging_station"), "chargers": sum(1 for s in service if s["type"] == "charging_station"),
        },
        "stays": [place(r, STAY_KIND, "stay_type", "Stay", "accommodation") for r in stays],
        "food": [place(r, FOOD_KIND, "type", "Food", None) for r in food],
        "sights": sights,
        "service": [{"id": s["id"], "name": s["name"], "type": s["type"], "town": s["town"], "km": round(s["km"]), "m": s["m"], "lon": s["lon"], "lat": s["lat"]} for s in service],
        "water_by_town": {t["name"]: sum(1 for w in water if w["town"] == t["name"]) for t in towns},
    }
    os.makedirs(folder, exist_ok=True)
    with open(os.path.join(folder, "data.json"), "w") as out:
        json.dump(data, out, ensure_ascii=False, indent=1)
    flags = []
    if share < 0.85:
        flags.append(f"only {round(share * 100)}% of the mapped length lies on one line: branches, a loop or gaps")
    if "–" in title and first.lower() not in (ends["start"] or "").lower() and first.lower() not in (ends["end"] or "").lower():
        flags.append(f"name starts with '{first}' but the mapped line runs {ends['start']} → {ends['end']}")
    last = title.split("–")[-1].strip()
    if "–" in title and last.lower() not in (ends["end"] or "").lower() and last.lower() not in (ends["start"] or "").lower():
        flags.append(f"name ends with '{last}' but the mapped line ends at {ends['end']}")
    if len(stays) < 3 or len(food) < 3:
        flags.append(f"thin: {len(stays)} stay picks, {len(food)} food picks")
    abroad = sum(1 for r in stays + food if not r["town"])
    if abroad:
        flags.append(f"{abroad} of {len(stays) + len(food)} picks lie outside Slovenia, where we have no town boundaries")
    if entry.get("review"):
        flags.append("registry: " + entry["review"])
    print(f"{slug}: {data['km']} km, {data['from']} → {data['to']}, +{data['climb_m']} m, {len(towns)} towns, picks {len(stays)}/{len(food)}/{len(sights)}, counts {data['counts']}")
    for flag in flags:
        print("   !", flag)
    return data


def main():
    registry = json.load(open(os.path.join(ROUTES_DIR, "_registry.json")))["routes"]
    args = sys.argv[1:]
    if not args:
        sys.exit(__doc__)
    if args[0] == "--tier":
        chosen = [e for e in registry if str(e.get("tier")) == args[1]]
    else:
        chosen = [e for e in registry if e["slug"] in args]
        missing = set(args) - {e["slug"] for e in chosen}
        if missing:
            sys.exit(f"not in the registry: {', '.join(sorted(missing))}")
    for entry in chosen:
        try:
            export(entry)
        except Exception as exc:  # noqa: BLE001
            print(f"{entry['slug']}: FAILED: {exc}")


if __name__ == "__main__":
    main()
