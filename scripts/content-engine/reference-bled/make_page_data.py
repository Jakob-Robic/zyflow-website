"""Turn the raw pull into the page data file. First-version pick rule; the real one is build step 1.6."""
import json, re, subprocess, sys, urllib.request, os, html
from urllib.parse import urlparse
raw = json.load(open(sys.argv[1])); WT = sys.argv[2]; slug = raw["area_code"]

def near(v):
    if not v: return None
    name, m = v.rsplit("|", 1)
    return {"route": name, "m": int(m)}
def domain(u):
    if not u: return None
    if not re.match(r"https?://", u): u = "https://" + u
    return {"url": u, "label": urlparse(u).netloc.replace("www.", "")}
def hours(h):
    if not h: return None
    h = re.sub(r"\b((?:Mo|Tu|We|Th|Fr|Sa|Su|PH)(?:[-,](?:Mo|Tu|We|Th|Fr|Sa|Su|PH))*):", r"\1", h)
    return h.replace("-", "–").replace(",PH", " and holidays")
STAY = {"guesthouse": "Guesthouse", "guest_house": "Guesthouse", "hotel": "Hotel", "apartment": "Apartment", "hostel": "Hostel", "camp_site": "Campsite", "camping": "Campsite"}
FOOD = {"restaurant": "Restaurant", "cafe": "Café"}
SIGHT = {"historic": "Historic site", "attraction": "Attraction", "viewpoint": "Viewpoint", "waterfall": "Waterfall", "gorge": "Gorge", "cave": "Cave"}

ABOUT = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), f"{slug}_about.json")))
def curated(rows, group):
    """Picks a person has read: only places with a written line, in the written order."""
    by = {r["name"]: r for r in rows}
    return [dict(by[name], about=text) for name, text in ABOUT[group].items() if name in by]

def pick(rows, key, cap, n=6):
    out, seen, per = [], set(), {}
    for r in rows:
        d = (domain(r.get("website")) or {}).get("label")
        k = r.get(key) or "other"
        if d in seen or per.get(k, 0) >= cap: continue
        if d: seen.add(d)
        per[k] = per.get(k, 0) + 1
        out.append(r)
        if len(out) == n: break
    return out

def q(sql):
    r = subprocess.run(["supabase", "db", "query", "--linked", sql], cwd="/Users/jakobrobic/Zyflow", capture_output=True, text=True); s = r.stdout
    return json.loads(s[s.find("{"): s.rfind("}") + 1])["rows"]
UA = {"User-Agent": "town-page-preview/0.1 (local build script)"}
strip = lambda s: re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", s or ""))).strip()
os.makedirs(f"{WT}/rebuild/assets/images/towns/{slug}", exist_ok=True)
def commons_photo(file, fn):
    from urllib.parse import urlencode, unquote
    url = "https://commons.wikimedia.org/w/api.php?" + urlencode({"action": "query", "titles": "File:" + unquote(file), "prop": "imageinfo", "iiprop": "url|extmetadata", "iiurlwidth": 480, "format": "json"})
    pages = json.load(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30))["query"]["pages"]
    ii = (list(pages.values())[0].get("imageinfo") or [None])[0]
    if not ii: return None
    em = ii.get("extmetadata", {}); g = lambda k: em.get(k, {}).get("value")
    if not g("LicenseShortName"): return None
    open(f"{WT}/rebuild/assets/images/towns/{slug}/{fn}", "wb").write(urllib.request.urlopen(urllib.request.Request(ii["thumburl"], headers=UA), timeout=60).read())
    return {"src": f"./assets/images/towns/{slug}/{fn}", "author": strip(g("Artist")), "licence": g("LicenseShortName"), "licence_url": g("LicenseUrl"), "source": ii.get("descriptionurl")}
wm = {r["id"]: r["image_url"] for r in q(f"select p.id, p.image_url from pois p join poi_municipalities m on m.poi_id=p.id where m.area_code='{slug}' and m.country_code='SI' and p.type in ('accommodation','restaurant','cafe') and p.image_url ilike '%commons.wikimedia.org%'")}
def photo(r):
    u = wm.get(r["id"])
    if not u: return None
    m = re.search(r"File(?:%3A|:)([^?]+)", u)
    return commons_photo(m.group(1), f"place-{r['id'][:8]}.jpg") if m else None
def extras(r):
    out = []
    try: cz = json.loads(r["cuisine"]) if r.get("cuisine") else []
    except Exception: cz = [r["cuisine"]]
    if cz: out.append(", ".join(c.replace("_", " ") for c in cz).capitalize())
    if r.get("outdoor") == "true": out.append("Outdoor seating")
    return out
for group in (raw["stays"], raw["food"]):
    group.sort(key=lambda r: r["id"] not in wm)          # places with a usable photo first (stable)
stays = [{"name": r["name"], "kind": STAY.get(r["stay_type"], "Stay"), "pin": "accommodation", "lon": r["lon"], "lat": r["lat"], "site": domain(r["website"]), "near": near(r["near"]), "about": r["about"]} for r in curated(raw["stays"], "stays")]
food = [{"name": r["name"], "kind": FOOD.get(r["type"], "Food"), "pin": r["type"], "lon": r["lon"], "lat": r["lat"], "site": domain(r["website"]) if r["website_usable"] else None, "hours": hours(r["hours"]), "extras": extras(r), "near": near(r["near"]), "about": r["about"]} for r in curated(raw["food"], "food")]

sights, seen = [], set()
for s in raw["sights"]:
    if "žig" in s["name"]: continue            # stamp markers, not sights
    key = s["wikidata"] or s["name"]
    if key in seen: continue
    seen.add(key)
    wd = s.get("wd") or {}
    item = {"name": (wd.get("labels") or {}).get("en") or s["name"], "local_name": s["name"], "kind": SIGHT.get(s["type"], "Sight"), "pin": s["type"], "lon": s["lon"], "lat": s["lat"],
            "about": (wd.get("descriptions") or {}).get("en"), "near": near(s["near"]),
            "wiki": ("https://en.wikipedia.org/wiki/" + wd["enwiki"].replace(" ", "_")) if wd.get("enwiki") else None}
    img = s.get("image")
    if img and img.get("thumb") and img.get("licence"):
        fn = f"sight-{len(sights)+1}.jpg"
        req = urllib.request.Request(img["thumb"], headers={"User-Agent": "town-page-preview/0.1 (local build script)"})
        open(f"{WT}/rebuild/assets/images/towns/{slug}/{fn}", "wb").write(urllib.request.urlopen(req, timeout=60).read())
        item["image"] = {"src": f"./assets/images/towns/{slug}/{fn}", "author": strip(img.get("artist_html")), "licence": img["licence"], "licence_url": img.get("licence_url"), "source": img.get("page")}
    sights.append(item)
    if len(sights) == 6: break

shop = q(f"""select p.name, mu.name municipality, round(st_distance(p.location::geography, (select st_centroid(geom)::geography from municipalities where area_code='{slug}' and country_code='SI'))/100)/10 km
 from pois p left join poi_municipalities pm on pm.poi_id=p.id left join municipalities mu on mu.area_code=pm.area_code and mu.country_code=pm.country_code
 where p.type='bicycle_shop' and p.is_published and not p.is_deleted and p.superseded_by is null
 order by p.location::geometry <-> (select st_centroid(geom) from municipalities where area_code='{slug}' and country_code='SI') limit 1""")

LEVEL = {"national": "National route", "regional": "Regional route", "local": "Local route", "international": "International route"}
RIDE_COLORS = ["#2563EB", "#E8590C", "#7C3AED", "#0F9D58", "#D6336C", "#0891B2", "#A16207", "#1F2937"]
routes = [{"color": RIDE_COLORS[i % len(RIDE_COLORS)], "code": r["code"], "name": r["display_name"], "level": LEVEL.get(r["network_level"], "Marked route"), "kind": r["kind"], "length_km": round(float(r["length_km"])), "km_inside": round(float(r["km_inside"])), "website": domain(r["website"]), "line": r["line"]} for i, r in enumerate(raw["routes"])]
c = raw["counts"]; n = lambda *t: sum(c.get(x, {}).get("n", 0) for x in t); hi = lambda *t: sum(c.get(x, {}).get("high", 0) for x in t)
t = raw["town"]
data = {
  "slug": slug, "name": t["name"], "region": t["region"], "country": "Slovenia", "checked": "2026-11-16",
  "center": [round(t["lon"], 5), round(t["lat"], 5)], "bounds": [t["w"], t["s"], t["e"], t["n"]], "boundary": t["boundary"],
  "counts": {"routes": len(routes), "stays": hi("accommodation"), "food": hi("restaurant", "cafe"), "water": n("water_point"), "repair": n("bicycle_repair", "bicycle_shop"), "chargers": len(raw["chargers_in"]), "sights": n("historic", "attraction", "viewpoint", "waterfall", "gorge", "cave")},
  "water_near_route": sum(1 for w in raw["water"] if near(w["near"]) and near(w["near"])["m"] <= 150),
  "routes": routes,
  "featured": [{"slug": f["slug"], "name": f["name"], "km": round(f["distance_meters"] / 1000), "climb_m": f["ascent_m"], "difficulty": f["difficulty"]} for f in raw["featured"]],
  "stays": stays, "food": food, "sights": sights,
  "repair": [{"name": r["name"], "type": r["type"], "lon": r["lon"], "lat": r["lat"]} for r in raw["repair"]],
  "nearest_shop": shop[0] if shop else None,
  "nearest_charger": raw["nearest_charger"][0] if raw["nearest_charger"] else None,
  "neighbours": [x["name"] for x in raw["neighbours"]],
}
os.makedirs(f"{WT}/content/towns/{slug}", exist_ok=True)
json.dump(data, open(f"{WT}/content/towns/{slug}/data.json", "w"), ensure_ascii=False, indent=1)
for k in ("stays", "food", "sights"):
    for r in data[k]: print(k, "|", r["name"], "|", r["kind"], "|", r.get("site"), "|", r.get("hours"), "|", r.get("near"), "|", (r.get("image") or {}).get("licence"), (r.get("image") or {}).get("author"))
print(data["counts"], data["water_near_route"], data["nearest_shop"], data["nearest_charger"], data["repair"])
# NOTE 2026-11-16: data.json also carries "photos" (three Commons pictures) and the Muhr sight photo,
# added by hand after this script ran. Re-running this script drops them until that step is folded in.
