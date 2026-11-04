"""Prova (4/11 notte): classifiche ESPN della fase a campionato di Champions, Europa e Conference League."""
import gzip, json, urllib.request
def get(u):
    try:
        req = urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0 (AuraPitch beta)", "Accept-Encoding": "gzip"})
        with urllib.request.urlopen(req, timeout=25) as r:
            raw = r.read()
        return json.loads(gzip.decompress(raw) if raw[:2] == b"\x1f\x8b" else raw)
    except Exception as e:  # noqa: BLE001
        return {"_errore": str(e)[:150]}
for lg in ("uefa.champions", "uefa.europa", "uefa.europa.conf"):
    d = get(f"https://site.api.espn.com/apis/v2/sports/soccer/{lg}/standings")
    if "_errore" in d:
        print(lg, "ERRORE", d["_errore"]); continue
    ch = d.get("children") or []
    print(lg, "gruppi:", len(ch), [c.get("name") for c in ch][:5])
    for c in ch[:1]:
        en = (c.get("standings") or {}).get("entries", [])
        print("  squadre:", len(en))
        for e in en[:40]:
            v = {s["name"]: s.get("value") for s in e.get("stats", [])}
            print("  ", int(v.get("rank") or 0), e["team"].get("shortDisplayName"), "|", e["team"].get("displayName"), "| id", e["team"].get("id"), "| G", v.get("gamesPlayed"), "V", v.get("wins"), "N", v.get("ties"), "P", v.get("losses"), "GF", v.get("pointsFor"), "GS", v.get("pointsAgainst"), "Pt", v.get("points"))
