"""Read-only access to the production database for the content-engine exports.

Uses the Supabase CLI against the linked project (run `supabase link` once in the
folder named by CONTENT_ENGINE_SUPABASE_DIR, default ~/Zyflow). Every export in this
folder only runs SELECT statements; nothing here writes to the database.
"""
import json
import os
import subprocess

SUPABASE_DIR = os.path.expanduser(os.environ.get("CONTENT_ENGINE_SUPABASE_DIR", "~/Zyflow"))


def query(sql):
    if not sql.lstrip().lower().startswith(("select", "with")):
        raise ValueError("content-engine exports are read-only: only SELECT / WITH statements")
    result = subprocess.run(
        ["supabase", "db", "query", "--linked", sql], cwd=SUPABASE_DIR, capture_output=True, text=True, timeout=110
    )
    out = result.stdout
    try:
        return json.loads(out[out.find("{") : out.rfind("}") + 1])["rows"]
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError(f"query failed: {out[:400]} {result.stderr[:400]}") from exc
