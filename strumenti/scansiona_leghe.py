"""AuraPitch - scansione di tutte le competizioni di calcio su ESPN: quali hanno partite nei prossimi giorni CON quote
gratuite (DraftKings nel calendario). Sono le uniche che l'algoritmo puo analizzare senza consumare crediti.
Scrive storico/scansione_leghe.json (gia presenti nell'app oppure nuove candidate). Una richiesta per competizione."""
import gzip
import json
import os
import sys
import time
import urllib.request
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import espn_dati as ES  # noqa: E402


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (AuraPitch beta)", "Accept-Encoding": "gzip"})
    with urllib.request.urlopen(req, timeout=25) as r:
        raw = r.read()
        return json.loads(gzip.decompress(raw) if raw[:2] == b"\x1f\x8b" else raw)


def elenco():
    out, url = [], "https://sports.core.api.espn.com/v2/sports/soccer/leagues?limit=1000"
    j = get(url)
    for it in j.get("items", []):
        ref = it.get("$ref", "")
        slug = ref.split("/leagues/")[-1].split("?")[0] if "/leagues/" in ref else None
        if slug:
            out.append(slug)
    return out


def main():
    giorni = int(os.environ.get("GIORNI", "10"))
    oggi = datetime.now(timezone.utc).date()
    rng = f"{oggi.strftime('%Y%m%d')}-{(oggi + timedelta(days=giorni)).strftime('%Y%m%d')}"
    gia = set(ES.ESPN_LG.values())
    slugs = elenco()
    print(f"Competizioni ESPN: {len(slugs)}")
    ris = []
    for s in slugs:
        try:
            j = get(f"https://site.api.espn.com/apis/site/v2/sports/soccer/{s}/scoreboard?dates={rng}&limit=300")
        except Exception as e:  # noqa: BLE001
            continue
        ev = j.get("events", [])
        if not ev:
            continue
        q = sum(1 for e in ev if ((e.get("competitions") or [{}])[0].get("odds") or []))
        nome = ((j.get("leagues") or [{}])[0]).get("name") or s
        ris.append({"slug": s, "nome": nome, "partite": len(ev), "con_quote": q, "gia_in_app": s in gia})
        time.sleep(0.15)
    ris.sort(key=lambda r: (-r["con_quote"], -r["partite"]))
    with open("storico/scansione_leghe.json", "w", encoding="utf-8") as f:
        json.dump({"quando": datetime.now(timezone.utc).isoformat(timespec="minutes"), "giorni": giorni, "competizioni": ris}, f, ensure_ascii=False, indent=1)
    nuove = [r for r in ris if not r["gia_in_app"] and r["con_quote"] >= 3]
    print(f"Con partite: {len(ris)}; nuove con quote gratuite: {len(nuove)}")
    for r in nuove[:40]:
        print(f"  {r['slug']:28} {r['nome'][:40]:40} {r['con_quote']}/{r['partite']}")


if __name__ == "__main__":
    main()
