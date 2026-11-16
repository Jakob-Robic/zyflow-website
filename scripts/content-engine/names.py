"""Names for routes the import left without one.

Some routes carry only a short label in the map data (K13 on the coast). The import
treats such a label as too short to be a name, so the record has neither a code nor a
name. Two sources fill the gap, in this order:

  content/signed-routes/_names.json   names looked up by a person, each with its source
                                      (also used to give a named route its English name)
  the label in the map data           a short label becomes the code, a longer one the name

Nothing here writes to the database; the names live in this repository.
"""
import json
import os
import re

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
NAMES_FILE = os.path.join(ROOT, "content", "signed-routes", "_names.json")
CODE_LIKE = re.compile(r"^[A-Za-z]{1,4}[ -]?\d{1,3}[A-Za-z]?$")


def hand_names():
    if not os.path.exists(NAMES_FILE):
        return {}
    return {r["record"]: r for r in json.load(open(NAMES_FILE))["routes"]}


def label(row):
    """The label the map data carries for a route record, if it has exactly one."""
    members = row.get("member_names") or []
    if isinstance(members, str):
        members = json.loads(members)
    labels = {(m.get("name") or "").strip() for m in members} - {""}
    return labels.pop() if len(labels) == 1 else None


def name_routes(rows):
    """Name rows from the hand list, then nameless ones from their label. Rows need `id` and `member_names`."""
    hand = hand_names()
    for row in rows:
        known = hand.get(row["id"])
        if known:
            hidden = known.get("hide")
            row["code"] = None if hidden else known.get("code") or row.get("code")
            row["display_name"] = None if hidden else known.get("name") or row.get("display_name")
            row["website"] = row.get("website") or known.get("website")
            row["hand"] = {k: known[k] for k in ("loop", "start", "bike") if k in known}
            continue
        if row.get("code") or row.get("display_name"):
            continue
        found = label(row)
        if found and CODE_LIKE.match(found):
            row["code"] = found.replace(" ", "").upper()
        elif found:
            row["display_name"] = found
    return rows
