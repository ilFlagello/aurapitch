"""Scarica gli archivi storici per i test dell'algoritmo (gira su GitHub Actions, che ha accesso a internet).
- Football-Data.co.uk: risultati, tiri, cartellini, arbitro e quote (media, Bet365, Pinnacle apertura e chiusura) dal 2012/13.
- Understat: gol attesi (xG) per partita dei 5 grandi campionati dal 2014/15.
Salva file compatti in storico/ (solo le colonne utili)."""
import codecs, csv, gzip, io, json, os, re, time, urllib.request

OUT = "storico"
os.makedirs(OUT, exist_ok=True)
UA = {"User-Agent": "Mozilla/5.0 (AuraPitch beta; ricerca)"}


def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=40) as r:
        return r.read()


COL = ["Div", "Date", "Time", "HomeTeam", "AwayTeam", "FTHG", "FTAG", "HTHG", "HTAG", "Referee", "HS", "AS", "HST", "AST", "HC", "AC", "HF", "AF", "HY", "AY", "HR", "AR",
       "B365H", "B365D", "B365A", "PSH", "PSD", "PSA", "AvgH", "AvgD", "AvgA", "BbAvH", "BbAvD", "BbAvA", "MaxH", "MaxD", "MaxA",
       "PSCH", "PSCD", "PSCA", "AvgCH", "AvgCD", "AvgCA", "B365CH", "B365CD", "B365CA",
       "B365>2.5", "B365<2.5", "P>2.5", "P<2.5", "Avg>2.5", "Avg<2.5", "BbAv>2.5", "BbAv<2.5", "PC>2.5", "PC<2.5", "AvgC>2.5", "AvgC<2.5",
       "AHh", "PAHH", "PAHA", "AvgAHH", "AvgAHA"]
righe = 0
with gzip.open(os.path.join(OUT, "fd_partite.csv.gz"), "wt", encoding="utf-8", newline="") as f:
    w = csv.writer(f)
    w.writerow(["Season"] + COL)
    for anno in range(2012, 2026):
        stag = f"{anno % 100:02d}{(anno + 1) % 100:02d}"
        for div in ("I1", "I2", "E0", "E1", "SP1", "D1", "F1"):
            try:
                raw = get(f"https://www.football-data.co.uk/mmz4281/{stag}/{div}.csv")
            except Exception as e:  # noqa: BLE001
                print("errore", stag, div, e)
                continue
            testo = raw.decode("utf-8-sig", "replace") if raw[:3] == b"\xef\xbb\xbf" else raw.decode("latin-1")
            for r in csv.DictReader(io.StringIO(testo)):
                if not r.get("HomeTeam"):
                    continue
                w.writerow([stag] + [r.get(c, "") for c in COL])
                righe += 1
            time.sleep(0.5)
print("Football-Data: righe", righe)

LEGHE_US = {"EPL": "E0", "La_liga": "SP1", "Bundesliga": "D1", "Serie_A": "I1", "Ligue_1": "F1"}
n = 0
with gzip.open(os.path.join(OUT, "understat_xg.csv.gz"), "wt", encoding="utf-8", newline="") as f:
    w = csv.writer(f)
    w.writerow(["Div", "Season", "Datetime", "Home", "Away", "HG", "AG", "HxG", "AxG"])
    for lg, div in LEGHE_US.items():
        for anno in range(2014, 2026):
            dati = None
            try:
                html = get(f"https://understat.com/league/{lg}/{anno}").decode("utf-8", "replace")
                m = re.search(r"datesData\s*=\s*JSON\.parse\('(.*?)'\)", html)
                if m:
                    dati = json.loads(codecs.decode(m.group(1), "unicode_escape"))
            except Exception as e:  # noqa: BLE001
                print("understat pagina", lg, anno, e)
            if dati is None:
                try:  # formato nuovo: dati da un endpoint JSON
                    req = urllib.request.Request(f"https://understat.com/getLeagueData/{lg}/{anno}", headers=dict(UA, **{"X-Requested-With": "XMLHttpRequest", "Referer": f"https://understat.com/league/{lg}/{anno}"}))
                    with urllib.request.urlopen(req, timeout=40) as r:
                        dati = json.loads(r.read().decode("utf-8")).get("dates")
                except Exception as e:  # noqa: BLE001
                    print("understat api", lg, anno, e)
            for p in dati or []:
                if not p.get("isResult"):
                    continue
                w.writerow([div, anno, p["datetime"], p["h"]["title"], p["a"]["title"], p["goals"]["h"], p["goals"]["a"], p["xG"]["h"], p["xG"]["a"]])
                n += 1
            time.sleep(1.0)
print("Understat: partite", n)
