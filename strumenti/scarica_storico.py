"""Scarica gli archivi storici per i test dell'algoritmo (gira su GitHub Actions, che ha accesso a internet).
- Football-Data.co.uk: risultati, tiri, cartellini, arbitro e quote (media, Bet365, Pinnacle apertura e chiusura) dal 2012/13.
- Understat: gol attesi (xG) per partita dei 5 grandi campionati dal 2014/15.
Salva file compatti in storico/ (solo le colonne utili)."""
import codecs, csv, gzip, io, json, os, re, time, urllib.request

OUT = "storico"
os.makedirs(OUT, exist_ok=True)
UA = {"User-Agent": "Mozilla/5.0 (AuraPitch beta; ricerca)"}


def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=20) as r:
        return r.read()


COL = ["Div", "Date", "Time", "HomeTeam", "AwayTeam", "FTHG", "FTAG", "HTHG", "HTAG", "Referee", "HS", "AS", "HST", "AST", "HC", "AC", "HF", "AF", "HY", "AY", "HR", "AR",
       "B365H", "B365D", "B365A", "PSH", "PSD", "PSA", "AvgH", "AvgD", "AvgA", "BbAvH", "BbAvD", "BbAvA", "MaxH", "MaxD", "MaxA",
       "PSCH", "PSCD", "PSCA", "AvgCH", "AvgCD", "AvgCA", "B365CH", "B365CD", "B365CA",
       "B365>2.5", "B365<2.5", "P>2.5", "P<2.5", "Avg>2.5", "Avg<2.5", "BbAv>2.5", "BbAv<2.5", "PC>2.5", "PC<2.5", "AvgC>2.5", "AvgC<2.5",
       "AHh", "PAHH", "PAHA", "AvgAHH", "AvgAHA"]
righe = 0
# campionati dell'archivio: i 7 storici dal 2012/13, gli altri dal 2019/20 (abbastanza partite per imparare, archivio leggero)
PRINCIPALI = ("I1", "I2", "E0", "E1", "SP1", "D1", "F1")
ALTRI = ("D2", "SP2", "F2", "N1", "B1", "P1", "T1", "G1", "SC0", "SC1", "E2", "E3", "EC")
# campionati extraeuropei e nordici (football-data.co.uk/new/<PAESE>.csv): codice del file -> codice AuraPitch
NUOVI = {"ARG": "AR1", "AUT": "A1", "BRA": "BR1", "DNK": "DK1", "JPN": "J1", "MEX": "MX1", "NOR": "NO1", "SWE": "SE1", "USA": "MLS", "CHN": "CN1",
         # verifica del 04/11/2026: risultati e quote medie di chiusura; Russia con consiglio, gli altri tra i campionati senza quote
         "RUS": "RU1", "SWZ": "CH1", "ROU": "RO1", "FIN": "FI1", "IRL": "IE1"}
DAL_ALTRI = 2019


def divisioni_presenti(p):
    try:
        with gzip.open(p, "rt", encoding="utf-8") as f:
            return {r["Div"] for r in csv.DictReader(f)}
    except (OSError, KeyError):
        return set()


ARCHIVIO = os.path.join(OUT, "fd_partite.csv.gz")
TUTTE = set(PRINCIPALI + ALTRI) | set(NUOVI.values())
gia = set() if os.environ.get("RIFAI_FD") == "1" else divisioni_presenti(ARCHIVIO)
SALTA_FD = gia >= TUTTE
# si tengono le righe dei campionati gia scaricati e si scarica solo cio che manca (ogni file ha un tetto di tempo breve)
vecchie = []
if gia and not SALTA_FD:
    with gzip.open(ARCHIVIO, "rt", encoding="utf-8") as f0:
        vecchie = [r for r in csv.reader(f0)][1:]
    print("Archivio esistente:", len(vecchie), "righe di", sorted(gia), flush=True)
with (open(os.devnull, "w") if SALTA_FD else gzip.open(ARCHIVIO + ".nuovo", "wt", encoding="utf-8", newline="")) as f:
    w = csv.writer(f)
    w.writerow(["Season"] + COL)
    for r in vecchie:
        w.writerow(r)
    for anno in ([] if SALTA_FD else range(2012, 2026)):
        stag = f"{anno % 100:02d}{(anno + 1) % 100:02d}"
        for div in [d for d in PRINCIPALI + (ALTRI if anno >= DAL_ALTRI else ()) if d not in gia]:
            print("scarico", stag, div, flush=True)
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
    # campionati "nuovi": un file per paese con tutte le stagioni; quote di chiusura (AvgC*), niente Over/Under
    for paese, div in ({} if SALTA_FD else {k: v for k, v in NUOVI.items() if v not in gia}).items():
        try:
            raw = get(f"https://www.football-data.co.uk/new/{paese}.csv")
        except Exception as e:  # noqa: BLE001
            print("errore", paese, e)
            continue
        testo = raw.decode("utf-8-sig", "replace") if raw[:3] == b"\xef\xbb\xbf" else raw.decode("latin-1")
        n0 = righe
        for r in csv.DictReader(io.StringIO(testo)):
            se = str(r.get("Season") or "")
            try:
                a0 = int(se[:4])
            except ValueError:
                continue
            if a0 < DAL_ALTRI or not r.get("Home"):
                continue
            stag = f"{a0 % 100:02d}{(a0 + 1) % 100:02d}"
            x = {"Div": div, "Date": r.get("Date", ""), "Time": r.get("Time", ""), "HomeTeam": r.get("Home", ""), "AwayTeam": r.get("Away", ""),
                 "FTHG": r.get("HG", ""), "FTAG": r.get("AG", ""), "MaxH": r.get("MaxCH", ""), "MaxD": r.get("MaxCD", ""), "MaxA": r.get("MaxCA", ""),
                 "PSCH": r.get("PSCH", ""), "PSCD": r.get("PSCD", ""), "PSCA": r.get("PSCA", ""), "AvgCH": r.get("AvgCH", ""), "AvgCD": r.get("AvgCD", ""), "AvgCA": r.get("AvgCA", ""),
                 "B365CH": r.get("B365CH", ""), "B365CD": r.get("B365CD", ""), "B365CA": r.get("B365CA", "")}
            w.writerow([stag] + [x.get(c, "") for c in COL])
            righe += 1
        print(paese, div, righe - n0, "partite")
        time.sleep(0.5)
if not SALTA_FD:
    os.replace(ARCHIVIO + ".nuovo", ARCHIVIO)  # il file vecchio si sostituisce solo a download finito
print("Football-Data: righe nuove", righe, flush=True)

LEGHE_US = {"EPL": "E0", "La_liga": "SP1", "Bundesliga": "D1", "Serie_A": "I1", "Ligue_1": "F1"}
n = 0
# archivio xG (Understat): serviva allo studio "fortuna o merito", concluso; nessun processo lo legge. Si riscarica solo a richiesta
if os.environ.get("RIFAI_XG") != "1":
    print("Understat: archivio xG non richiesto (RIFAI_XG=1 per riscaricarlo), salto", flush=True)
    raise SystemExit(0)
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
                        raw = r.read()
                        if raw[:2] == b"\x1f\x8b":
                            raw = gzip.decompress(raw)
                        dati = json.loads(raw.decode("utf-8")).get("dates")
                except Exception as e:  # noqa: BLE001
                    print("understat api", lg, anno, e)
            for p in dati or []:
                if not p.get("isResult"):
                    continue
                w.writerow([div, anno, p["datetime"], p["h"]["title"], p["a"]["title"], p["goals"]["h"], p["goals"]["a"], p["xG"]["h"], p["xG"]["a"]])
                n += 1
            time.sleep(1.0)
print("Understat: partite", n)
