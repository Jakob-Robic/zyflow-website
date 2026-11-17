"""Read-only pull of one town's page data from the production database."""
import json, subprocess, sys, urllib.request, urllib.parse
AREA = sys.argv[1]; OUT = sys.argv[2]

def q(sql):
    r = subprocess.run(["supabase", "db", "query", "--linked", sql], cwd="/Users/jakobrobic/Zyflow", capture_output=True, text=True)
    s = r.stdout
    try:
        return json.loads(s[s.find("{"): s.rfind("}") + 1])["rows"]
    except Exception:
        print(r.stdout[:800], r.stderr[:800]); raise

BASE = f"""from pois p join poi_municipalities m on m.poi_id=p.id
 left join poi_public_confidence c on c.poi_id=p.id
 where m.area_code='{AREA}' and m.country_code='SI' and p.is_published and not p.is_deleted and p.superseded_by is null"""
ROUTES = f"(select r.id, r.code, r.display_name, r.geom from signed_routes r join signed_route_municipalities sm on sm.route_id=r.id where sm.area_code='{AREA}' and sm.country_code='SI' and not r.is_proposed group by r.id)"
NEAR = f"""(select coalesce(rr.code, rr.display_name) || '|' || round(st_distance(p.location::geography, rr.geom::geography))::text
   from {ROUTES} rr order by p.location::geometry <-> rr.geom limit 1)"""

town = q(f"select name, region, st_x(st_centroid(geom)) lon, st_y(st_centroid(geom)) lat, st_xmin(geom) w, st_ymin(geom) s, st_xmax(geom) e, st_ymax(geom) n, st_asgeojson(st_simplify(geom,0.0003),5) boundary from municipalities where area_code='{AREA}' and country_code='SI'")[0]
town["boundary"] = json.loads(town["boundary"])
counts = {r["type"]: r for r in q(f"select p.type, count(*) n, count(*) filter (where c.high_confidence) high {BASE} group by 1")}

COLS = """p.id, p.name, p.type, p.longitude lon, p.latitude lat, c.website, c.website_usable, c.overture_confidence conf,
 p.metadata->>'accommodation_type' stay_type, p.metadata->>'food_type' food_type, p.metadata->>'cuisine' cuisine,
 p.metadata->>'opening_hours' hours, p.metadata->>'outdoor_seating' outdoor, p.metadata->>'stars' stars"""
stays = q(f"select {COLS}, {NEAR} near {BASE} and p.type='accommodation' and c.high_confidence and c.website_usable and c.overture_confidence >= 0.7 order by c.overture_confidence desc limit 60")
food = q(f"select {COLS}, {NEAR} near {BASE} and p.type in ('restaurant','cafe') and c.high_confidence order by (p.metadata->>'opening_hours' is not null) desc, c.website_usable desc nulls last, c.overture_confidence desc nulls last limit 40")
sights = q(f"""select p.id, p.name, p.type, p.longitude lon, p.latitude lat, p.prominence_score ps,
 p.metadata->'osm_tags'->>'wikidata' wikidata, p.metadata->'osm_tags'->>'wikipedia' wikipedia, p.metadata->'osm_tags'->>'historic' historic, {NEAR} near
 {BASE} and p.type in ('historic','attraction','viewpoint','waterfall','gorge','cave')
 order by (p.metadata->'osm_tags'->>'wikipedia' is not null) desc, (p.metadata->'osm_tags'->>'wikidata' is not null) desc, p.prominence_score desc nulls last limit 30""")
water = q(f"select p.name, p.longitude lon, p.latitude lat, {NEAR} near {BASE} and p.type='water_point'")
repair = q(f"select p.name, p.type, p.longitude lon, p.latitude lat, p.metadata->>'website' website, p.metadata->>'opening_hours' hours {BASE} and p.type in ('bicycle_repair','bicycle_shop','bike_shop','repair_station')")
types = q("select type, count(*) n from pois where country_code='SI' and is_published and not is_deleted and (type ilike '%charg%' or type ilike '%bic%' or type ilike '%repair%' or type ilike '%bike%') group by 1")
charger_types = [t["type"] for t in types if "charg" in t["type"]]
ct = ",".join("'" + t + "'" for t in charger_types) or "''"
chargers_in = q(f"select p.name, p.longitude lon, p.latitude lat {BASE} and p.type in ({ct})")
nearest_charger = q(f"""select p.name, p.type, p.longitude lon, p.latitude lat, mu.name municipality,
 round(st_distance(p.location::geography, (select st_centroid(geom)::geography from municipalities where area_code='{AREA}' and country_code='SI'))/100)/10 km
 from pois p left join poi_municipalities pm on pm.poi_id=p.id left join municipalities mu on mu.area_code=pm.area_code and mu.country_code=pm.country_code
 where p.type in ({ct}) and p.is_published and not p.is_deleted and p.superseded_by is null
 order by p.location::geometry <-> (select st_centroid(geom) from municipalities where area_code='{AREA}' and country_code='SI') limit 1""")
routes = q(f"""select r.code, r.display_name, r.kind, r.network_level, r.length_km, r.website, round(sum(sm.km_inside)::numeric,1) km_inside,
 st_asgeojson(st_simplify(st_intersection(r.geom, (select st_buffer(geom, 0.025) from municipalities where area_code='{AREA}' and country_code='SI')), 0.00015), 5) line
 from signed_routes r join signed_route_municipalities sm on sm.route_id=r.id
 where sm.area_code='{AREA}' and sm.country_code='SI' and not r.is_proposed group by r.id order by sum(sm.km_inside) desc""")
for r in routes: r["line"] = json.loads(r["line"]) if r["line"] else None
featured = q(f"""select f.slug, f.name, f.distance_meters, f.ascent_m, f.difficulty from featured_routes f
 where f.is_published and st_intersects(f.geom, (select geom from municipalities where area_code='{AREA}' and country_code='SI'))""")
neighbours = q(f"""select b.area_code, b.name, b.region from municipalities a join municipalities b on st_touches(a.geom,b.geom) or st_intersects(a.geom,b.geom)
 where a.area_code='{AREA}' and a.country_code='SI' and b.country_code='SI' and b.area_code<>a.area_code order by b.name""")

def wikidata(ids):
    if not ids: return {}
    url = "https://www.wikidata.org/w/api.php?" + urllib.parse.urlencode({"action": "wbgetentities", "ids": "|".join(ids), "props": "labels|descriptions|claims|sitelinks", "languages": "en|de|sl", "format": "json"})
    req = urllib.request.Request(url, headers={"User-Agent": "town-page-preview/0.1 (local build script)"})
    ents = json.load(urllib.request.urlopen(req, timeout=30))["entities"]
    out = {}
    for k, e in ents.items():
        img = None
        for cl in e.get("claims", {}).get("P18", []):
            img = cl["mainsnak"].get("datavalue", {}).get("value"); break
        out[k] = {"labels": {l: v["value"] for l, v in e.get("labels", {}).items()},
                  "descriptions": {l: v["value"] for l, v in e.get("descriptions", {}).items()},
                  "image": img, "enwiki": e.get("sitelinks", {}).get("enwiki", {}).get("title")}
    return out

def commons(files):
    out = {}
    for f in files:
        url = "https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode({"action": "query", "titles": "File:" + f, "prop": "imageinfo", "iiprop": "url|extmetadata", "iiurlwidth": 640, "format": "json"})
        req = urllib.request.Request(url, headers={"User-Agent": "town-page-preview/0.1 (local build script)"})
        pages = json.load(urllib.request.urlopen(req, timeout=30))["query"]["pages"]
        for p in pages.values():
            ii = (p.get("imageinfo") or [None])[0]
            if not ii: continue
            em = ii.get("extmetadata", {})
            g = lambda k: em.get(k, {}).get("value")
            out[f] = {"thumb": ii.get("thumburl"), "page": ii.get("descriptionurl"), "licence": g("LicenseShortName"), "licence_url": g("LicenseUrl"), "artist_html": g("Artist"), "credit_html": g("Credit")}
    return out

wd = wikidata(sorted({s["wikidata"] for s in sights if s["wikidata"]}))
cm = commons(sorted({v["image"] for v in wd.values() if v["image"]}))
for s in sights:
    s["wd"] = wd.get(s["wikidata"]) if s["wikidata"] else None
    if s["wd"] and s["wd"]["image"]: s["image"] = cm.get(s["wd"]["image"])

json.dump({"area_code": AREA, "town": town, "counts": counts, "stays": stays, "food": food, "sights": sights, "water": water, "repair": repair,
           "chargers_in": chargers_in, "nearest_charger": nearest_charger, "charger_types": types, "routes": routes, "featured": featured, "neighbours": neighbours},
          open(OUT, "w"), ensure_ascii=False, indent=1)
print("ok")
