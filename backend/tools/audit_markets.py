"""One-off: list the market names each provider actually publishes.

Fetches each snapshot ONCE (1 request per provider) and writes a histogram of
raw market names to /tmp/market_audit.json, so we can see whether cards,
correct score, double chance or handicap lines exist in the feeds at all.
"""
import asyncio
import collections
import json
import sys

import httpx

sys.path.insert(0, "/app/backend")
from dotenv import load_dotenv  # noqa: E402

load_dotenv("/app/backend/.env")
import rapid_books as rb  # noqa: E402


async def grab(slug):
    book, host, file, _ = rb.PROVIDERS[slug]
    async with httpx.AsyncClient(timeout=httpx.Timeout(90.0, connect=10.0)) as c:
        r = await c.get(f"https://{host}.p.rapidapi.com/v1/data/{file}",
                        headers={"x-rapidapi-key": rb._key(),
                                 "x-rapidapi-host": f"{host}.p.rapidapi.com",
                                 "accept": "application/json"})
    return r.status_code, (r.json() if r.status_code == 200 else None)


def walk(o, names, depth=0):
    """Collect anything that looks like a market name + a sample selection."""
    if depth > 12:
        return
    if isinstance(o, dict):
        for k in ("betTypeSysname", "marketName", "groupCode"):
            if isinstance(o.get(k), str):
                names[o[k]] += 1
        if isinstance(o.get("name"), str) and ("markets" in str(o.keys()) or o.get("oddIds") or o.get("outcomes") or o.get("options") or o.get("selections") or o.get("betItems")):
            names[o["name"]] += 1
        if isinstance(o.get("name"), dict) and isinstance(o["name"].get("value"), str) and o.get("options"):
            names[o["name"]["value"]] += 1
        for v in o.values():
            walk(v, names, depth + 1)
    elif isinstance(o, list):
        for v in o[:400]:
            walk(v, names, depth + 1)


async def main():
    out = {}
    for slug in rb.active_slugs():
        code, payload = await grab(slug)
        if not payload:
            out[slug] = {"http": code}
            continue
        names = collections.Counter()
        walk(payload, names)
        out[slug] = {"http": code, "markets": names.most_common(80)}
        print(slug, code, len(names), "distinct market names")
    json.dump(out, open("/tmp/market_audit.json", "w"), ensure_ascii=False, indent=1)


asyncio.run(main())
