#!/usr/bin/env python3
"""Which signed routes pass the page rule, for the towns of a batch. Writes nothing.

    python3 scripts/content-engine/route_candidates.py --batch 1
    python3 scripts/content-engine/route_candidates.py --batch 1 --json out.json

The rule (route plan, 2026-11-16): the route
  - runs through a town of the batch (at least 1 km inside it) and is not proposed,
  - has at least 3 confirmed places to stay or eat within 400 m of its line,
  - is at least 10 km long,
  - has a real name (not empty, not only its code, not only a generic word).

Two small pulls (route lines simplified to about 15 m, confirmed places as points);
distances are worked out here, not in the database.
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from db import query  # noqa: E402
from export_town import BATCHES, route_lines, sql_list  # noqa: E402
from geo import NearIndex  # noqa: E402

REACH_M = 400
MIN_PLACES = 3
MIN_KM = 10
GENERIC = {"kolesarska", "pot", "cycle", "route", "mtb", "kolesarjenje", "krog", "trasa", "povezava", "cesta", "bike", "the"}


def real_name(name, code):
    if not name or not name.strip():
        return False
    if code and name.strip().lower() == code.strip().lower():
        return False
    words = [w for w in re.findall(r"[^\W\d_]{3,}", name.lower())]
    return any(w not in GENERIC for w in words)


def main():
    args = sys.argv[1:]
    if len(args) < 2 or args[0] != "--batch":
        sys.exit(__doc__)
    towns = json.load(open(BATCHES))[args[1]]["towns"]
    routes = query(f"""select r.id, r.code, r.display_name, r.kind, r.network_level, r.length_km,
        string_agg(distinct sm.area_code, ',') towns
      from signed_routes r join signed_route_municipalities sm on sm.route_id = r.id
      where sm.country_code = 'SI' and sm.area_code in ({sql_list(towns)}) and not r.is_proposed and sm.km_inside >= 1
      group by r.id order by r.length_km desc""")
    places = query("""select p.longitude lon, p.latitude lat from pois p join poi_public_confidence c on c.poi_id = p.id
      where p.type in ('accommodation','restaurant','cafe') and c.high_confidence
        and p.is_published and not p.is_deleted and p.superseded_by is null""")
    lines = route_lines([r["id"] for r in routes])
    out = []
    for r in routes:
        parts = lines[r["id"]]
        coords = [c for part in parts for c in part]
        if not coords:
            r["near_places"] = 0
        else:
            w = min(c[0] for c in coords) - 0.006
            e = max(c[0] for c in coords) + 0.006
            s = min(c[1] for c in coords) - 0.004
            n = max(c[1] for c in coords) + 0.004
            index = NearIndex([("", part) for part in parts])
            r["near_places"] = sum(1 for p in places if w <= p["lon"] <= e and s <= p["lat"] <= n and index.within(p["lon"], p["lat"], REACH_M))
        r["length_km"] = float(r["length_km"])
        r["real_name"] = real_name(r["display_name"], r["code"])
        r["fails"] = [
            why
            for why, ok in (
                (f"fewer than {MIN_PLACES} places within {REACH_M} m", r["near_places"] >= MIN_PLACES),
                (f"shorter than {MIN_KM} km", r["length_km"] >= MIN_KM),
                ("no real name", r["real_name"]),
            )
            if not ok
        ]
        out.append(r)
    good = [r for r in out if not r["fails"]]
    print(f"{len(out)} signed routes run through the {len(towns)} towns; {len(good)} pass the page rule.")
    for why in sorted({f for r in out for f in r["fails"]}):
        print(f"   {sum(1 for r in out if why in r['fails'])} fail: {why}")
    if "--json" in args:
        json.dump(out, open(args[args.index("--json") + 1], "w"), ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
