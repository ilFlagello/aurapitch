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


# riserva: competizioni ESPN note (se l'elenco completo non risponde)
NOTE = ["ita.1", "ita.2", "ita.3", "eng.1", "eng.2", "eng.3", "eng.4", "eng.5", "sco.1", "sco.2", "esp.1", "esp.2", "ger.1", "ger.2", "ger.3", "fra.1", "fra.2", "ned.1", "ned.2",
        "por.1", "bel.1", "tur.1", "aut.1", "sui.1", "gre.1", "den.1", "nor.1", "swe.1", "fin.1", "irl.1", "pol.1", "cze.1", "rou.1", "rus.1", "ukr.1", "cro.1", "srb.1", "isr.1", "cyp.1",
        "usa.1", "usa.usl.1", "mex.1", "bra.1", "bra.2", "arg.1", "chi.1", "col.1", "uru.1", "par.1", "per.1", "ecu.1", "ven.1", "bol.1", "crc.1", "hon.1", "gua.1", "slv.1",
        "jpn.1", "kor.1", "chn.1", "aus.1", "sau.1", "uae.1", "qat.1", "ind.1", "tha.1", "rsa.1", "egy.1", "mar.1",
        "uefa.champions", "uefa.europa", "uefa.europa.conf", "uefa.nations", "uefa.wchampions", "conmebol.libertadores", "conmebol.sudamericana", "concacaf.champions", "afc.champions",
        "fifa.worldq.uefa", "fifa.worldq.conmebol", "fifa.worldq.concacaf", "fifa.worldq.afc", "fifa.worldq.caf", "fifa.cwc", "fifa.world", "uefa.euro", "caf.nations",
        "eng.fa", "eng.league_cup", "esp.copa_del_rey", "ita.coppa_italia", "ger.dfb_pokal", "fra.coupe_de_france", "ned.cup", "por.taca", "sco.tennents", "usa.open",
        "eng.w.1", "usa.nwsl", "esp.w.1", "fra.w.1", "ger.w.1", "ita.w.1"]


def elenco():
    out = []
    try:
        j = get("https://sports.core.api.espn.com/v2/sports/soccer/leagues?limit=1000")
        for it in j.get("items", []):
            ref = it.get("$ref", "")
            slug = ref.split("/leagues/")[-1].split("?")[0] if "/leagues/" in ref else None
            if slug:
                out.append(slug)
    except Exception as e:  # noqa: BLE001
        print("Elenco completo non disponibile:", str(e)[:120])
    return sorted(set(out) | set(NOTE))


def main():
    giorni = int(os.environ.get("GIORNI", "10"))
    oggi = datetime.now(timezone.utc).date()
    rng = f"{oggi.strftime('%Y%m%d')}-{(oggi + timedelta(days=giorni)).strftime('%Y%m%d')}"
    gia = set(ES.ESPN_LG.values())
    slugs = elenco()
    print(f"Competizioni ESPN: {len(slugs)}")
    ris, errori = [], []
    for s in slugs:
        ev, j = [], {}
        try:
            j = get(f"https://site.api.espn.com/apis/site/v2/sports/soccer/{s}/scoreboard?dates={rng}")
            ev = j.get("events", [])
        except Exception as e:  # noqa: BLE001
            # alcune competizioni non accettano un intervallo di date: si prova giorno per giorno
            for g in range(giorni):
                try:
                    j = get(f"https://site.api.espn.com/apis/site/v2/sports/soccer/{s}/scoreboard?dates={(oggi + timedelta(days=g)).strftime('%Y%m%d')}")
                    ev += j.get("events", [])
                except Exception as e2:  # noqa: BLE001
                    errori.append(f"{s}: {str(e2)[:60]}")
                    break
        if not ev:
            continue
        q = sum(1 for e in ev if ((e.get("competitions") or [{}])[0].get("odds") or []))
        nome = ((j.get("leagues") or [{}])[0]).get("name") or s
        ris.append({"slug": s, "nome": nome, "partite": len(ev), "con_quote": q, "gia_in_app": s in gia})
        time.sleep(0.15)
    ris.sort(key=lambda r: (-r["con_quote"], -r["partite"]))
    with open("storico/scansione_leghe.json", "w", encoding="utf-8") as f:
        json.dump({"quando": datetime.now(timezone.utc).isoformat(timespec="minutes"), "giorni": giorni, "esaminate": len(slugs), "errori": errori[:30], "competizioni": ris}, f, ensure_ascii=False, indent=1)
    nuove = [r for r in ris if not r["gia_in_app"] and r["con_quote"] >= 3]
    print(f"Con partite: {len(ris)}; nuove con quote gratuite: {len(nuove)}")
    for r in nuove[:40]:
        print(f"  {r['slug']:28} {r['nome'][:40]:40} {r['con_quote']}/{r['partite']}")


if __name__ == "__main__":
    main()
