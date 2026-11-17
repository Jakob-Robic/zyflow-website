#!/usr/bin/env python3
"""Write the review sheet a person reads before any town text is written.

    python3 scripts/content-engine/review_towns.py --batch 1 ~/Zyflow/_notes/2026-11-16-town-review-sheet.md
    python3 scripts/content-engine/review_towns.py --batch 1 out.md --no-fetch      (skip the website check)

Reads the towns' data.json files (run export_town.py first). Also opens each pick's
website once and reads its page title, to catch the obvious cases: a site that no
longer answers, a social page instead of a website, a "coming soon" or parked page,
a title that shares no word with the place's name. It reads the first page only;
it cannot tell whether a place is still open or whether the site is the right one
when the title is generic. A person still has to look.

The website check sends a plain request with no personal details to the places'
own websites; nothing else leaves this machine.
"""
import concurrent.futures
import html
import json
import os
import re
import sys
import unicodedata
import urllib.request
from urllib.parse import urlparse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from export_town import BAR, BATCHES, PICKS, TOWNS_DIR  # noqa: E402

UA = {"User-Agent": "Mozilla/5.0 (compatible; zyflow-content-engine/0.1; town review)", "Accept-Language": "en,sl;q=0.8"}
SOCIAL = re.compile(r"(^|\.)(facebook|instagram|fb|booking|tripadvisor|airbnb|google)\.(com|me|si)$")
# Always worth a look, whatever the rest of the title says.
BAD_TITLE = re.compile(
    r"coming soon|under construction|v izdelavi|nova spletna stran|new website|domain (is )?for sale|buy this domain|parked|index of|"
    r"default web site|it works!|account suspended|website expired|not found|\b404\b",
    re.I,
)
# Signs of a taken-over address, but only when the title also has nothing of the place's name
# (a real hotel and casino says both).
SPAM_TITLE = re.compile(r"casino|slot|betting|loan|viagra|porn|escort|crypto", re.I)
GENERIC = set(
    "hotel hoteli hostel apartments apartment apartmaji apartma rooms room sobe soba guesthouse guest house penzion pension pansion "
    "gostilna gostišče gostisce restavracija restaurant restoran ristorante pizzeria picerija bar cafe café kavarna caffe caffè "
    "slaščičarna slascicarna bistro pub grill okrepčevalnica okrepcevalnica turistična turisticna kmetija tourist farm camp camping "
    "kamp glamping resort villa vila house hiša hisa the and pri in na ob od za del de la le bled bohinj".split()
)


def plain(text):
    return unicodedata.normalize("NFKD", text or "").encode("ascii", "ignore").decode().lower()


def tokens(name):
    return {w for w in re.findall(r"[a-z0-9]{3,}", plain(name)) if w not in {plain(g) for g in GENERIC}}


def fetch_title(url):
    try:
        req = urllib.request.Request(url, headers=UA)
        with urllib.request.urlopen(req, timeout=12) as resp:
            final = resp.geturl()
            body = resp.read(300_000).decode(resp.headers.get_content_charset() or "utf-8", "replace")
        found = re.search(r"<title[^>]*>(.*?)</title>", body, re.I | re.S)
        site_name = re.search(r'<meta[^>]+property=["\']og:site_name["\'][^>]+content=["\']([^"\']+)', body, re.I)
        title = html.unescape(re.sub(r"\s+", " ", found.group(1))).strip() if found else ""
        return {"ok": True, "final": final, "title": title, "site_name": html.unescape(site_name.group(1)) if site_name else ""}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": str(exc)[:80]}


def base(host):
    """example.com, example.si and www.example.com:443 are the same site for this check."""
    host = host.split(":")[0].replace("www.", "")
    parts = host.split(".")
    return parts[-2] if len(parts) >= 2 else host


def check(place, result):
    """Plain-language problems with a pick's website, or an empty list."""
    out = []
    site = place.get("site")
    if not site:
        return ["no website"]
    host = urlparse(site["url"]).netloc.lower().replace("www.", "")
    if SOCIAL.search(host):
        out.append(f"links to a social or booking page ({host}), not its own website")
        return out
    if result is None:
        return out
    if not result["ok"]:
        error = result["error"]
        if "nodename nor servname" in error or "Name or service not known" in error:
            return ["website address does not exist any more (no DNS record)"]
        if "403" in error:
            return ["website refused our check (403); it may only block automated visits, open it by hand"]
        if "CERTIFICATE" in error or "SSL" in error:
            return ["secure connection failed (certificate problem); open it by hand"]
        return [f"website did not answer ({error})"]
    final_host = urlparse(result["final"]).netloc.lower().split(":")[0].replace("www.", "")
    if final_host and base(final_host) != base(host):
        out.append(f"website forwards to another address ({final_host})")
    text = f"{result['title']} {result['site_name']}"
    name_words = tokens(place["name"])
    seen_words = tokens(text) | tokens(host.replace("-", " ").replace(".", " ")) | tokens(final_host.replace("-", " ").replace(".", " "))
    joined = plain(text + " " + host + " " + final_host).replace("-", "").replace(" ", "")
    shares = not name_words or bool(name_words & seen_words) or any(w in joined for w in name_words)
    if BAD_TITLE.search(text) or (SPAM_TITLE.search(text) and not shares):
        out.append(f"page title looks wrong: \"{result['title'][:80]}\"")
    elif not shares:
        out.append(f"page title shares no word with the name: \"{result['title'][:80] or '(no title)'}\"")
    return out


def same_business(town):
    """Pairs of picks that look like one business: same website, same distinctive name word, or within 25 m."""
    picks = [("stay", p) for p in town["stays"]] + [("food", p) for p in town["food"]]
    common = tokens(town["name"]) | tokens(town["official_name"]) | {plain(n) for n in town["neighbours"]} | set().union(*(tokens(n) for n in town["neighbours"]))
    pairs = []
    for i, (ga, a) in enumerate(picks):
        for gb, b in picks[i + 1 :]:
            why = None
            if a.get("site") and b.get("site") and a["site"]["label"] == b["site"]["label"]:
                why = f"same website {a['site']['label']}"
            elif (tokens(a["name"]) & tokens(b["name"])) - common:
                why = "names share a word"
            elif abs(a["lon"] - b["lon"]) < 0.00035 and abs(a["lat"] - b["lat"]) < 0.00025:
                why = "within about 25 m of each other"
            if why:
                pairs.append(f"{a['name']} ({ga}) and {b['name']} ({gb}): {why}")
    return pairs


def dist(near):
    if not near:
        return "–"
    m = near["m"]
    where = near["route"] if len(near["route"]) <= 12 else near["route"][:40]
    return f"{m} m ({where})" if m < 1000 else f"{m / 1000:.1f} km ({where})"


def main():
    args = sys.argv[1:]
    if len(args) < 3 or args[0] != "--batch":
        sys.exit(__doc__)
    batch = json.load(open(BATCHES))[args[1]]
    target = os.path.expanduser(args[2])
    fetch = "--no-fetch" not in args
    towns = []
    for slug in sorted(os.listdir(TOWNS_DIR)):
        file = os.path.join(TOWNS_DIR, slug, "data.json")
        if os.path.exists(file):
            town = json.load(open(file))
            if town.get("area_code") in batch["towns"]:
                # Sight photos a person chose (photos.json) count as photos, as on the page.
                chosen_file = os.path.join(TOWNS_DIR, slug, "photos.json")
                chosen = json.load(open(chosen_file)).get("sights", {}) if os.path.exists(chosen_file) else {}
                for sight in town["sights"]:
                    if not sight.get("image") and any(k != "_note" and sight["id"].startswith(k) for k in chosen):
                        sight["image"] = {"chosen": True}
                towns.append(town)
    missing = sorted(set(batch["towns"]) - {t["area_code"] for t in towns})

    results = {}
    if fetch:
        urls = {p["site"]["url"] for t in towns for p in t["stays"] + t["food"] if p.get("site") and not SOCIAL.search(urlparse(p["site"]["url"]).netloc.lower().replace("www.", ""))}
        with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
            ordered = sorted(urls)
            results = dict(zip(ordered, pool.map(fetch_title, ordered)))

    rows, flagged_total = [], 0
    for town in towns:
        notes, pick_flags = [], {}
        for group in ("stays", "food"):
            for p in town[group]:
                problems = check(p, results.get((p.get("site") or {}).get("url")) if fetch else None)
                if problems:
                    pick_flags[p["id"]] = problems
        flagged_total += len(pick_flags)
        c = town["counts"]
        thin = [g for g in ("stays", "food") if len(town[g]) < PICKS]
        at_bar = [k for k in ("stays", "food") if c[k] == BAR[k]]
        for g in thin:
            notes.append(f"Only {len(town[g])} {'stay' if g == 'stays' else 'food'} picks pass the pick rule (confirmed, working website{', sources agree 0.7+' if g == 'stays' else ''}).")
        for k in at_bar:
            notes.append(f"Exactly at the bar for {'places to stay' if k == 'stays' else 'places to eat'} ({c[k]}): one closed place and the town drops below it.")
        if len(town["sights"]) < 3:
            notes.append(f"Only {len(town['sights'])} sights have an encyclopedia entry; the page shows {len(town['sights'])}.")
        if not any(s.get("image") for s in town["sights"]):
            notes.append("No sight has a photo.")
        if not c["chargers"]:
            nc = town.get("nearest_charger")
            notes.append(f"No e-bike charger in town" + (f"; nearest {nc['name']} in {nc['municipality']}, {nc['km']} km." if nc else "."))
        if not c["repair"]:
            ns = town.get("nearest_shop")
            notes.append(f"No repair point or bike shop in town" + (f"; nearest shop {ns['name']} in {ns['municipality']}, {ns['km']} km." if ns else "."))
        if not town["routes"]:
            notes.append("No signed route with 1 km or more in town: the routes section is empty and the generated question \"Which cycle routes pass through\" reads \"No signed routes: .\". Decide whether this town gets a page.")
        if town.get("unnamed_routes"):
            u = town["unnamed_routes"]
            notes.append(f"{len(u)} signed route{'s' if len(u) > 1 else ''} with neither a code nor a name in OpenStreetMap left out ({', '.join(str(r['km_inside']) + ' km in town' for r in u)}). Worth fixing in OpenStreetMap if they are real routes.")
        if len(town["routes"]) > 8:
            notes.append(f"{len(town['routes'])} routes but 8 colours: colours repeat on the map from the ninth route on.")
        if len(town["routes"]) == 1:
            notes.append("One route only: the generated intro reads \"One signed cycle routes run through\" until a written intro replaces it.")
        for pair in same_business(town):
            notes.append(f"May be one business: {pair}.")
        for group in ("stays", "food"):
            for p in town[group]:
                for problem in pick_flags.get(p["id"], []):
                    notes.append(f"{p['name']}: {problem}.")
        if town["official_name"] != town["name"]:
            notes.append(f"Official name is \"{town['official_name']}\"; the page uses \"{town['name']}\".")
        if town["slug"] != town["area_code"]:
            notes.append(f"Page address /cycling/{town['slug']}; database code {town['area_code']}.")
        rows.append((town, notes, pick_flags, thin, at_bar))

    out = []
    w = out.append
    w(f"# Town review sheet, batch {args[1]}")
    w("")
    w(f"Made by `scripts/content-engine/review_towns.py` from the data the town job wrote. Data checked {max(t['checked'] for t in towns)}.")
    w("")
    w("**What this is for.** You know these towns. Read it for what only local knowledge catches: a closed place, a missing landmark, a pick in the wrong town, a route that is not really there. Nothing here is published; every page is a draft behind a switch that is off.")
    w("")
    w("## Summary")
    w("")
    w(f"- **{len(towns)} towns** in batch {args[1]}" + (f"; missing data for {', '.join(missing)}" if missing else "") + f". All pass the bar ({BAR['stays']} confirmed places to stay, {BAR['food']} to eat, {BAR['water']} water points, {BAR['sights']} sights) today.")
    full = [t for t, _, _, thin, _ in rows if not thin]
    w(f"- **{len(full)} towns have six stay picks and six food picks.** {len(towns) - len(full)} have fewer in at least one, because few of their confirmed places have a working website: " + ", ".join(f"{t['name']} ({len(t['stays'])}/{len(t['food'])})" for t, _, _, thin, _ in rows if thin) + ".")
    at = [t["name"] for t, _, _, _, at_bar in rows if at_bar]
    w(f"- **Exactly at the bar:** {', '.join(at) if at else 'none'}.")
    if fetch:
        w(f"- **{flagged_total} of {sum(len(t['stays']) + len(t['food']) for t in towns)} picks have a website flag** (no answer, forwards elsewhere, social page, title looks wrong or shares no word with the name). Listed per town under *Look at this*.")
    w(f"- **Towns without a charger:** {', '.join(t['name'] for t in towns if not t['counts']['chargers']) or 'none'}. **Without a repair point or shop:** {', '.join(t['name'] for t in towns if not t['counts']['repair']) or 'none'}.")
    w("")
    w("**How the website check works, and what it misses.** It opens each pick's website once and compares the page title with the place's name. It catches a dead site, a social page, a forward to another address, a parked or \"coming soon\" page and a title with nothing in common with the name. It does not catch a closed place whose site still runs, a generic title (\"Home\"), or a site that names the place but belongs to someone else. A flag is a reason to look, not a verdict.")
    w("")
    w("**How picks are chosen** (README in `scripts/content-engine/`): confirmed places with a working website; stays also need the sources to agree (0.7 or more). One pick per website. Stays: at most two of one kind, then the best agreement. Food: places with opening hours first, then agreement. Sights: only those with an encyclopedia entry, best known first. To drop a pick, add its id to `content/towns/<town>/curation.json` as `{\"exclude\": [\"<id>\"]}` and run the job again.")
    w("")
    w("| Town | Routes | Stays | Food | Water | Repair | Chargers | Sights | Picks (stay/food/sight) | Flags |")
    w("|---|---|---|---|---|---|---|---|---|---|")
    for town, notes, pick_flags, thin, at_bar in rows:
        c = town["counts"]
        w(f"| [{town['name']}](#{town['slug']}) | {c['routes']} | {c['stays']} | {c['food']} | {c['water']} | {c['repair']} | {c['chargers']} | {c['sights']} | {len(town['stays'])}/{len(town['food'])}/{len(town['sights'])} | {len(pick_flags)} |")
    w("")
    for town, notes, pick_flags, thin, at_bar in rows:
        c = town["counts"]
        w(f"## {town['name']}")
        w("")
        w(f"<a id=\"{town['slug']}\"></a>`/cycling/{town['slug']}` · {town['region']} · database code `{town['area_code']}`")
        w("")
        w(f"**Counts:** {c['routes']} routes, {c['stays']} confirmed places to stay, {c['food']} confirmed places to eat, {c['water']} water points ({town['water_near_route']} within 150 m of a route), {c['repair']} repair points, {c['chargers']} chargers, {c['sights']} sights.")
        w("")
        for group, label in (("stays", "Stays"), ("food", "Food")):
            w(f"**{label}**")
            w("")
            if not town[group]:
                w("None pass the pick rule.")
                w("")
                continue
            w("| Name | Type | Website | Nearest route | Check |")
            w("|---|---|---|---|---|")
            for p in town[group]:
                site = p.get("site")
                flag = "; ".join(pick_flags.get(p["id"], [])) or ("ok" if fetch else "")
                w(f"| {p['name']} | {p['kind']} | {('[' + site['label'] + '](' + site['url'] + ')') if site else '–'} | {dist(p.get('near'))} | {flag} |")
            w("")
        w("**Sights**")
        w("")
        if town["sights"]:
            for s in town["sights"]:
                local = f" ({s['local_name']})" if s.get("local_name") and s["local_name"] != s["name"] else ""
                w(f"- {s['name']}{local}, {s['kind'].lower()}, {dist(s.get('near'))} – {('photo (chosen by hand)' if s['image'].get('chosen') else 'photo') if s.get('image') else 'no photo'}")
        else:
            w("None with an encyclopedia entry.")
        w("")
        w("**Routes**")
        w("")
        if town["routes"]:
            w("| Code | Name | km in town | Length |")
            w("|---|---|---|---|")
            for r in town["routes"]:
                w(f"| {r['code'] or '–'} | {r['name']} | {r['km_inside']} | {r['length_km']} km |")
        else:
            w("None.")
        w("")
        w("**Look at this**")
        w("")
        for note in notes or ["Nothing flagged."]:
            w(f"- {note}")
        w("")
    os.makedirs(os.path.dirname(target), exist_ok=True)
    with open(target, "w") as fh:
        fh.write("\n".join(out))
    print(f"wrote {target}: {len(towns)} towns, {flagged_total} picks flagged")


if __name__ == "__main__":
    main()
