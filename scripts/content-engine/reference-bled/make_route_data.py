import json, sys, re, os, html, urllib.request, urllib.parse
from urllib.parse import urlparse
raw = json.load(open(sys.argv[1])); cur = json.load(open(sys.argv[2])); WT = sys.argv[3]
slug = cur["slug"]; UA = {"User-Agent": "route-page-preview/0.1 (local build script)"}
def get(u): return json.load(urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=40))
strip = lambda s: re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", s or ""))).strip()
def domain(u):
    if not u: return None
    if not re.match(r"https?://", u): u = "https://" + u
    u = u.split("?_gl=")[0]
    return {"url": u, "label": urlparse(u).netloc.replace("www.", "")}
def hours(h):
    if not h: return None
    h = re.sub(r"\b((?:Mo|Tu|We|Th|Fr|Sa|Su|PH)(?:[-,](?:Mo|Tu|We|Th|Fr|Sa|Su|PH))*):", r"\1", h)
    return h.replace("-", "–").replace(",PH", " and holidays")
STAY = {"guesthouse": "Guesthouse", "guest_house": "Guesthouse", "hotel": "Hotel", "apartment": "Apartment", "hostel": "Hostel", "campsite": "Campsite", "bnb": "Guesthouse"}
FOOD = {"restaurant": "Restaurant", "cafe": "Café"}
SIGHT = {"historic": "Historic site", "attraction": "Attraction", "viewpoint": "Viewpoint", "waterfall": "Waterfall", "gorge": "Gorge", "cave": "Cave", "museum": "Museum"}
def picks(rows, texts, kindmap, kindkey):
    by = {}
    for r in rows: by.setdefault(r["name"], r)
    out = []
    for name, about in texts.items():
        r = by.get(name)
        if not r: print("MISSING", name); continue
        out.append({"name": name.split(" - ")[0], "kind": kindmap.get(r.get(kindkey) or r["type"], "Stay" if kindmap is STAY else "Food"), "pin": "accommodation" if kindmap is STAY else r["type"],
                    "lon": r["lon"], "lat": r["lat"], "town": r["town"], "km": round(r["km"]), "m": r["m"], "site": domain(r["website"]), "hours": hours(r.get("hours")), "about": about})
    return sorted(out, key=lambda r: r["km"])
os.makedirs(f"{WT}/rebuild/assets/images/signed-routes/{slug}", exist_ok=True)
def commons(file, fn, width=1280):
    d = get("https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode({"action": "query", "titles": "File:" + file, "prop": "imageinfo", "iiprop": "url|extmetadata", "iiurlwidth": width, "format": "json"}))
    ii = (list(d["query"]["pages"].values())[0].get("imageinfo") or [None])[0]
    if not ii: return None
    em = ii.get("extmetadata", {}); g = lambda k: em.get(k, {}).get("value")
    if not g("LicenseShortName"): return None
    open(f"{WT}/rebuild/assets/images/signed-routes/{slug}/{fn}", "wb").write(urllib.request.urlopen(urllib.request.Request(ii["thumburl"], headers=UA), timeout=90).read())
    a = strip(g("Artist")); m = re.search(r"provided\. (.+?) assumed", a)
    return {"src": f"./assets/images/signed-routes/{slug}/{fn}", "author": (m.group(1) if m else a)[:60], "licence": g("LicenseShortName"), "licence_url": g("LicenseUrl"), "source": ii.get("descriptionurl")}
wd = get("https://www.wikidata.org/w/api.php?" + urllib.parse.urlencode({"action": "wbgetentities", "ids": "|".join(cur["sights"]), "props": "claims|sitelinks", "format": "json"}))["entities"]
sights = []
for r in raw["sights"]:
    c = cur["sights"].get(r["wikidata"])
    if not c or any(s["name"] == c["name"] for s in sights): continue
    p18 = [x["mainsnak"].get("datavalue", {}).get("value") for x in wd[r["wikidata"]].get("claims", {}).get("P18", [])]
    img = commons(p18[0], f"sight-{len(sights)+1}.jpg") if p18 else None
    en = wd[r["wikidata"]].get("sitelinks", {}).get("enwiki", {}).get("title")
    sights.append({"name": c["name"], "local_name": r["name"], "kind": SIGHT.get(r["type"], "Sight"), "pin": r["type"], "lon": r["lon"], "lat": r["lat"], "town": r["town"], "km": round(r["km"]), "m": r["m"],
                   "about": c["about"], "wiki": ("https://en.wikipedia.org/wiki/" + en.replace(" ", "_")) if en else None, **({"image": img} if img else {})})
rt = raw["route"]; pr = raw["profile"]
svc = raw["service"]
data = {
  "slug": slug, "code": rt["code"], "official_name": rt["display_name"], "from": cur["from"], "to": cur["to"], "ends": raw["ends"],
  "level": {"national": "National route", "regional": "Regional route", "local": "Local route", "international": "International route"}.get(rt["network_level"], "Signed route"),
  "kind": rt["kind"], "country": "Slovenia", "checked": "2026-11-16", "km": round(raw["main_km"]), "km_exact": raw["main_km"],
  "climb_m": int(round(pr["up_m"], -1)), "descent_m": int(round(pr["down_m"], -1)), "high_m": pr["max_m"], "high_at_km": round(pr["max_at_km"]), "high_place": raw["ends"]["high"], "low_m": pr["min_m"], "start_m": pr["start_m"], "end_m": pr["end_m"],
  "bounds": [rt["w"], rt["s"], rt["e"], rt["n"]], "line": raw["line"],
  "towns": [{"name": t["name"], "area_code": t["area_code"], "region": t["region"], "km_inside": round(float(t["km"])), "at_km": round(t["at_km"])} for t in raw["towns"]],
  "counts": {"towns": len(raw["towns"]), "stays": raw["counts"]["stays"], "food": raw["counts"]["food"], "water": len(raw["water"]),
             "repair": sum(1 for s in svc if s["type"] in ("bicycle_repair", "bicycle_shop")), "chargers": sum(1 for s in svc if s["type"] == "charging_station")},
  "stays": picks(raw["stays"], cur["stays"], STAY, "stay_type"), "food": picks(raw["food"], cur["food"], FOOD, "type"), "sights": sorted(sights, key=lambda s: s["km"]),
  "service": [{"name": "GALA IN" if "GALA IN" in s["name"] else s["name"], "type": s["type"], "town": s["town"], "km": round(s["km"]), "m": s["m"], "lon": s["lon"], "lat": s["lat"]} for s in svc],
  "water_by_town": {t["name"]: sum(1 for w in raw["water"] if w["town"] == t["name"]) for t in raw["towns"]},
}
os.makedirs(f"{WT}/content/signed-routes/{slug}", exist_ok=True)
json.dump(data, open(f"{WT}/content/signed-routes/{slug}/data.json", "w"), ensure_ascii=False, indent=1)
print({k: data[k] for k in ("km", "climb_m", "descent_m", "high_m", "high_at_km", "high_place", "counts", "water_by_town")})
for g in ("stays", "food", "sights"):
    for r in data[g]: print(g, "| km", r["km"], "|", r["name"], "|", r["town"], "|", r["kind"], "|", r.get("hours"), "|", r["m"], "m |", (r.get("image") or {}).get("licence"))
print(data["service"])
