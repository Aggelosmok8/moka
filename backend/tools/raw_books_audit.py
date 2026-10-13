"""One fetch per provider, saved raw to /tmp/raw_books, then list the market
names we do NOT map. Re-runs read the saved file (zero further API calls)."""
import asyncio, json, os, sys, collections
from pathlib import Path
sys.path.insert(0, "/app/backend")
from dotenv import load_dotenv
load_dotenv("/app/backend/.env")
import httpx
import rapid_books as rb

RAW = Path("/tmp/raw_books")


async def raw(slug):
    RAW.mkdir(parents=True, exist_ok=True)
    f = RAW / f"{slug}.json"
    if f.exists():
        return json.loads(f.read_text())
    book, host, file, _ = rb.PROVIDERS[slug]
    async with httpx.AsyncClient(timeout=httpx.Timeout(90.0, connect=10.0)) as c:
        r = await c.get(f"https://{host}.p.rapidapi.com/v1/data/{file}",
                        headers={"x-rapidapi-key": rb._key(),
                                 "x-rapidapi-host": f"{host}.p.rapidapi.com"})
    print(slug, r.status_code, len(r.content))
    d = r.json()
    f.write_text(json.dumps(d))
    return d


def walk_markets(slug, payload):
    """Yield (market_name, selection_name) pairs as the parsers see them."""
    out = []
    if slug == "stoiximan":
        for blk in payload.get("data") or []:
            for b in ((blk or {}).get("data") or {}).get("blocks") or []:
                for ev in b.get("events") or []:
                    for m in ev.get("markets") or []:
                        for s in m.get("selections") or []:
                            out.append((f"{m.get('type')}|{m.get('name')}", s.get("name")))
    elif slug == "novibet":
        for view in payload.get("data") or []:
            for bv in (view or {}).get("betViews") or []:
                for it in bv.get("items") or []:
                    for m in it.get("markets") or []:
                        for x in m.get("betItems") or []:
                            out.append((m.get("betTypeSysname"),
                                        x.get("caption") or x.get("code")))
    elif slug == "bwin":
        for fx in ((payload.get("data") or {}).get("fixtures")) or []:
            for m in fx.get("optionMarkets") or []:
                nm = ((m.get("name") or {}).get("value")) or ""
                for o in m.get("options") or []:
                    out.append((nm, ((o.get("name") or {}).get("value")) or ""))
    elif slug == "pamestoixima":
        for ev in (((payload.get("data") or {}).get("data")) or {}).get("events") or []:
            for m in ev.get("markets") or []:
                for o in m.get("outcomes") or []:
                    out.append((m.get("name") or m.get("groupCode"), o.get("name")))
    elif slug == "elabet":
        d = payload.get("data") or {}
        ods = {o.get("id"): o for o in d.get("odds") or []}
        for m in d.get("markets") or []:
            for oid in m.get("oddIds") or []:
                out.append((m.get("name"), (ods.get(oid) or {}).get("name")))
    return out


async def main():
    for slug in rb.active_slugs():
        d = await raw(slug)
        pairs = walk_markets(slug, d)
        mapped, unmapped = collections.Counter(), collections.Counter()
        samples = {}
        for mkt, sel in pairs:
            pid = rb._pick_id(mkt or "", sel or "", None, "Home", "Away")
            (mapped if pid else unmapped)[mkt] += 1
            if not pid:
                samples.setdefault(mkt, set()).add(sel)
        print(f"\n=== {slug}: {len(pairs)} selections, mapped {sum(mapped.values())}, unmapped {sum(unmapped.values())}")
        print("  MAPPED markets:", dict(mapped.most_common(20)))
        for mkt, n in unmapped.most_common(25):
            print(f"  UNMAPPED {n:6d}  {mkt!r} -> {list(samples[mkt])[:5]}")


asyncio.run(main())
