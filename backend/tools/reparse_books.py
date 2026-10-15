"""Re-parse the saved raw snapshots (/tmp/raw_books) with the current parsers and
report pick coverage per provider. Zero API calls."""
import json, sys, collections
from pathlib import Path
sys.path.insert(0, "/app/backend")
import rapid_books as rb

FILES = {"stoiximan": "stoiximan_full.json", "novibet": "novibet.json",
         "bwin": "bwin.json", "pamestoixima": "pamestoixima.json",
         "elabet": "elabet.json"}

for slug, fn in FILES.items():
    p = Path("/tmp/raw_books") / fn
    if not p.exists():
        print(slug, "no raw file"); continue
    book, _, _, parser = rb.PROVIDERS[slug]
    idx, pidx = {}, {}
    parser(json.loads(p.read_text()), book, idx, pidx)
    fam = collections.Counter()
    for v in pidx.values():
        for pick in v:
            if pick.startswith(("over_", "under_")):
                fam["goals"] += 1
            elif pick.startswith("fh_"):
                fam["first half"] += 1
            elif pick.startswith("ht_"):
                fam["half-time result"] += 1
            elif pick.startswith("corners_"):
                fam["corners"] += 1
            elif pick.startswith("cards_"):
                fam["cards"] += 1
            elif pick.startswith("btts_"):
                fam["btts"] += 1
            elif pick.startswith("fts_"):
                fam["first scorer"] += 1
            elif "_hcp_" in pick:
                fam["handicap"] += 1
            elif pick.endswith(("_or_draw", "_or_away")):
                fam["double chance"] += 1
            else:
                fam[pick] += 1
    print(f"{slug:14s} 1x2 {len(idx):4d}  matches_with_picks {len(pidx):4d}  "
          f"picks {sum(len(v) for v in pidx.values()):6d}  {dict(fam.most_common())}")
