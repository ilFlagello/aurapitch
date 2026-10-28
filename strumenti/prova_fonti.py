"""Prova delle fonti gratuite di quote e calendari (nessuna chiave): ESPN (quote DraftKings nel calendario) e Football-Data
(fixtures.csv con le quote medie delle prossime partite). Scrive storico/prova_fonti.json."""
import csv, gzip, io, json, os, time, urllib.request
from datetime import datetime, timedelta, timezone

def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (AuraPitch beta)", "Accept-Encoding": "gzip"})
    with urllib.request.urlopen(req, timeout=25) as r:
        raw = r.read()
        return gzip.decompress(raw) if raw[:2] == b"\x1f\x8b" else raw

LEGHE = ["ita.1", "ita.2", "eng.1", "eng.2", "esp.1", "esp.2", "ger.1", "ger.2", "fra.1", "fra.2", "ned.1", "por.1", "bel.1", "tur.1", "sco.1",
         "aut.1", "sui.1", "gre.1", "den.1", "usa.1", "bra.1", "arg.1", "mex.1", "sau.1", "jpn.1",
         "uefa.champions", "uefa.europa", "uefa.europa.conf", "ita.coppa_italia", "eng.fa", "eng.league_cup", "esp.copa_del_rey",
         "ger.dfb_pokal", "fra.coupe_de_france", "ita.super_cup", "esp.super_cup", "uefa.nations", "fifa.worldq.uefa", "conmebol.libertadores"]
oggi = datetime.now(timezone.utc).date()
out = {"quando": datetime.now(timezone.utc).isoformat(), "espn": {}, "football_data": {}}
for lg in LEGHE:
    r = {"partite": 0, "con_quote": 0, "esempio": None, "errore": None}
    for g in range(0, 8):
        d = (oggi + timedelta(days=g)).strftime("%Y%m%d")
        try:
            j = json.loads(get(f"https://site.api.espn.com/apis/site/v2/sports/soccer/{lg}/scoreboard?dates={d}"))
        except Exception as e:
            r["errore"] = str(e)[:80]; break
        for ev in j.get("events", []):
          try:
            c = (ev.get("competitions") or [{}])[0]
            r["partite"] += 1
            o = c.get("odds") or []
            if o:
                r["con_quote"] += 1
                if not r["esempio"]:
                    x = o[0]
                    r["esempio"] = {"partita": ev.get("name"), "fornitore": (x.get("provider") or {}).get("name"), "overUnder": x.get("overUnder"),
                                    "casa": (x.get("homeTeamOdds") or {}).get("moneyLine"), "ospite": (x.get("awayTeamOdds") or {}).get("moneyLine"),
                                    "pari": (x.get("drawOdds") or {}).get("moneyLine"), "chiavi": sorted(x.keys())[:25]}
          except Exception as e:
            r["errore"] = "evento: " + str(e)[:80]
        time.sleep(0.25)
    out["espn"][lg] = r
    print(lg, r["partite"], r["con_quote"], r["errore"] or "")
for nome in ("fixtures.csv", "new_league_fixtures.csv"):
    try:
        t = get("https://www.football-data.co.uk/" + nome).decode("utf-8-sig", "replace")
        righe = list(csv.DictReader(io.StringIO(t)))
        div = {}
        for x in righe:
            k = x.get("Div") or x.get("Country", "") + "/" + x.get("League", "")
            div[k] = div.get(k, 0) + 1
        out["football_data"][nome] = {"righe": len(righe), "colonne": list(righe[0].keys())[:60] if righe else [], "campionati": div,
                                      "esempio": righe[0] if righe else None}
        print(nome, len(righe), div)
    except Exception as e:
        out["football_data"][nome] = {"errore": str(e)[:120]}
        print(nome, "errore", e)
os.makedirs("storico", exist_ok=True)
json.dump(out, open("storico/prova_fonti.json", "w"), ensure_ascii=False, indent=1)
