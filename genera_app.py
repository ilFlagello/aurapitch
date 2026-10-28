"""AuraPitch - genera i dati dell'app (app/data/giornata.json) dai dati raccolti.

  python3 genera_app.py           giro completo (mattino): partite da ieri a +3 giorni, quote medie, letture,
                                  classifiche, ultime 5, precedenti
  python3 genera_app.py --live    aggiorna solo stato e risultato delle partite (durante il giorno)

Fonti: data/AAAA-MM-GG/partite.csv (quote medie, The Odds API) e data/fd/*.json (football-data.org,
risultati di Serie B da The Odds API). Usa solo la libreria standard di Python.
"""
import csv
import glob
import math
import json
import os
import re
import sys
import unicodedata
import zlib

import calibrazione as CB
import cartellini as CK
import espn_dati as ES
import fattori as FT
import mercati as M
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

ROME = ZoneInfo("Europe/Rome")
DATA, FD = "data", os.path.join("data", "fd")
OUT = os.path.join("app", "data", "giornata.json")
# chiave app, nome, paese, bandiera, codice football-data (None = solo quote), nome nel CSV delle quote
LEAGUES = [
    ("I1", "Serie A", "Italia", "it", "SA", "Serie A"), ("I2", "Serie B", "Italia", "it", None, "Serie B"),
    ("CL", "Champions League", "Europa", "eu", "CL", "Champions League"), ("EL", "Europa League", "Europa", "eu", None, "Europa League"),
    ("ECL", "Conference League", "Europa", "eu", None, "Conference League"), ("CI", "Coppa Italia", "Italia", "it", None, "Coppa Italia"),
    ("E0", "Premier League", "Inghilterra", "en", "PL", "Premier League"),
    ("SP1", "LaLiga", "Spagna", "es", "PD", "LaLiga"), ("D1", "Bundesliga", "Germania", "de", "BL1", "Bundesliga"),
    # quote gratuite da ESPN (DraftKings), classifica e risultati da ESPN
    ("F1", "Ligue 1", "Francia", "fr", None, "Ligue 1"), ("N1", "Eredivisie", "Olanda", "nl", None, "Eredivisie"),
    ("P1", "Primeira Liga", "Portogallo", "pt", None, "Primeira Liga"), ("E1", "Championship", "Inghilterra", "en", None, "Championship"),
    ("SCI", "Supercoppa Italiana", "Italia", "it", None, "Supercoppa Italiana"), ("FAC", "FA Cup", "Inghilterra", "en", None, "FA Cup"),
    ("ELC", "Carabao Cup", "Inghilterra", "en", None, "Carabao Cup"), ("CDR", "Copa del Rey", "Spagna", "es", None, "Copa del Rey"),
    ("DFB", "DFB-Pokal", "Germania", "de", None, "DFB-Pokal"), ("CDF", "Coppa di Francia", "Francia", "fr", None, "Coppa di Francia"),
    ("D2", "2. Bundesliga", "Germania", "de", None, "2. Bundesliga"), ("SP2", "LaLiga 2", "Spagna", "es", None, "LaLiga 2"),
    ("B1", "Pro League", "Belgio", "be", None, "Pro League"), ("T1", "Süper Lig", "Turchia", "tr", None, "Süper Lig"),
    ("SC0", "Premiership", "Scozia", "sc", None, "Premiership"), ("A1", "Bundesliga austriaca", "Austria", "at", None, "Bundesliga austriaca"),
    ("G1", "Super League", "Grecia", "gr", None, "Super League"), ("DK1", "Superliga", "Danimarca", "dk", None, "Superliga"),
    ("MLS", "MLS", "Stati Uniti", "us", None, "MLS"), ("BR1", "Brasileirão", "Brasile", "br", None, "Brasileirão"),
    ("AR1", "Liga Profesional", "Argentina", "ar", None, "Liga Profesional"), ("MX1", "Liga MX", "Messico", "mx", None, "Liga MX"),
    ("J1", "J1 League", "Giappone", "jp", None, "J1 League"),
    ("F2", "Ligue 2", "Francia", "fr", None, "Ligue 2"), ("NO1", "Eliteserien", "Norvegia", "no", None, "Eliteserien"),
    ("SE1", "Allsvenskan", "Svezia", "se", None, "Allsvenskan"), ("SA1", "Saudi Pro League", "Arabia Saudita", "sa", None, "Saudi Pro League"),
    ("CHI1", "Primera División", "Cile", "cl", None, "Primera División Cile"), ("COL1", "Liga BetPlay", "Colombia", "co", None, "Liga BetPlay"),
    ("AU1", "A-League", "Australia", "au", None, "A-League"), ("UY1", "Primera División", "Uruguay", "uy", None, "Primera División Uruguay"),
    ("PY1", "Primera División", "Paraguay", "py", None, "Primera División Paraguay"), ("EC1", "LigaPro", "Ecuador", "ec", None, "LigaPro Ecuador"),
    ("PE1", "Liga 1", "Perù", "pe", None, "Liga 1 Perù"), ("LIB", "Copa Libertadores", "Sudamerica", "sam", None, "Copa Libertadores"),
    ("SUD", "Copa Sudamericana", "Sudamerica", "sam", None, "Copa Sudamericana"), ("ACL", "AFC Champions League", "Asia", "as", None, "AFC Champions League"),
    # nazionali (nomi in italiano, originali in eh/ea)
    ("NL", "Nations League", "Europa", "eu", None, "Nations League"), ("AMI", "Amichevoli nazionali", "Mondo", "wo", None, "Amichevoli nazionali"),
    ("EQ", "Qualificazioni Europei", "Europa", "eu", None, "Qualificazioni Europei"), ("WCQ", "Qualificazioni Mondiali", "Mondo", "wo", None, "Qualificazioni Mondiali"),
]
PRIORITA = ["NL", "CL", "I1", "EL", "CI", "SCI", "E0", "SP1", "D1", "F1", "ECL", "I2", "FAC", "CDR", "DFB", "ELC", "CDF", "P1", "N1", "E1", "D2", "SP2", "T1", "B1", "SC0", "BR1", "AR1", "MLS", "MX1", "A1", "G1", "DK1", "J1", "SA1", "LIB", "SUD", "F2", "NO1", "SE1", "COL1", "CHI1", "AU1", "UY1", "PY1", "EC1", "PE1", "ACL", "AMI", "EQ", "WCQ"]
GG = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"]
STOP = {"fc", "ac", "as", "ssc", "afc", "cf", "sc", "us", "usd", "calcio", "club", "de", "del", "cd", "ud", "sd", "rc", "rcd", "sv", "vfb", "vfl", "tsg",
        "bc", "fk", "1", "04", "05", "1899", "1909", "1913", "1919", "1929", "and", "hove", "albion", "hotspur", "wanderers", "the"}
ALIAS = {"inter": "internazionale", "internazionale": "internazionale", "milan": "milan", "atleti": "atletico", "barca": "barcelona", "psg": "paris",
         "man": "manchester", "utd": "united", "munich": "munchen", "bayern": "bayern", "gladbach": "monchengladbach", "mgladbach": "monchengladbach",
         "wolves": "wolverhampton", "spurs": "tottenham", "leverkusen": "leverkusen", "koln": "koln", "cologne": "koln", "napoli": "napoli", "naples": "napoli"}


def toks(s):
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    out = set()
    for t in re.split(r"[^a-z0-9]+", s):
        if t and t not in STOP and not t.isdigit():
            out.add(ALIAS.get(t, t))
    return out


def sim(a, b):
    x, y = toks(a), toks(b)
    if not x or not y:
        return 0.0
    return len(x & y) / min(len(x), len(y))


def pulisci(nome):
    """Nome leggibile per le squadre che arrivano solo dalle quote (es. 'US Catanzaro 1929' -> 'Catanzaro')."""
    parti = [p for p in re.split(r"\s+", nome) if p.lower() not in {"fc", "us", "ac", "as", "ssc", "calcio", "usd"} and not p.isdigit()]
    return " ".join(parti) or nome


def utc(s):
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def jload(path, default=None):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def fnum(x):
    try:
        v = float(x)
        return v if v > 0 else None
    except (TypeError, ValueError):
        return None


# ---------- quote ----------

def carica_quote():
    """Per ogni partita, l'ultima fotografia delle quote presa prima del calcio d'inizio."""
    righe = []
    for path in sorted(glob.glob(os.path.join(DATA, "*", "partite*.csv"))):  # partite.csv (The Odds API) e partite_espn.csv (ESPN)
        giorno = os.path.basename(os.path.dirname(path))
        try:
            with open(path, encoding="utf-8") as f:
                for r in csv.DictReader(f):
                    r["_foto"] = giorno
                    righe.append(r)
        except OSError:
            continue
    migliori = {}
    for r in righe:
        if not r.get("inizio"):
            continue
        try:
            t = utc(r["inizio"])
        except ValueError:
            continue
        if r["_foto"] > t.astimezone(ROME).strftime("%Y-%m-%d"):
            continue  # fotografia presa dopo la partita
        k = (r.get("campionato"), " ".join(sorted(toks(r.get("casa")))), " ".join(sorted(toks(r.get("ospite")))), t.strftime("%Y-%m-%d"))
        if k not in migliori or migliori[k]["_foto"] < r["_foto"]:
            r["_t"] = t
            migliori[k] = r
    return list(migliori.values())


def togli_margine(quote):
    """Probabilita senza il margine del bookmaker, metodo "potenza" (v0.3: nei test batte la divisione proporzionale,
    perche corregge la tendenza delle quote a sopravvalutare gli sfavoriti)."""
    inv = [1 / x for x in quote]
    k = 1.0
    for _ in range(50):
        s = sum(v ** k for v in inv)
        ds = sum(math.log(v) * v ** k for v in inv)
        k -= (s - 1) / ds
    p = [v ** k for v in inv]
    return [v / sum(p) for v in p]


def quote_di(r):
    src = "oa_" if r.get("oa_quota_media_1") else "af_"
    q = {e: fnum(r.get(f"{src}quota_media_{e}")) for e in ("1", "X", "2", "Over 2.5", "Under 2.5")}
    mx = {e: fnum(r.get(f"{src}quota_max_{e}")) for e in ("1", "X", "2", "Over 2.5", "Under 2.5")}
    if not all(q[e] for e in ("1", "X", "2")):
        return None
    mk = [round(v, 4) for v in togli_margine([q[e] for e in ("1", "X", "2")])]
    mo = None
    if q["Over 2.5"] and q["Under 2.5"]:
        mo = round(togli_margine([q["Over 2.5"], q["Under 2.5"]])[0], 4)
    nb = fnum(r.get(f"{src}bookmaker_1"))
    # quote ESPN con una linea Under/Over diversa da 2,5 (es. 3,5): servono comunque a stimare i gol attesi
    mo_l, linea = None, fnum(r.get("linea"))
    if mo is None and linea and fnum(r.get("oa_quota_media_Over L")) and fnum(r.get("oa_quota_media_Under L")):
        mo_l = round(togli_margine([fnum(r["oa_quota_media_Over L"]), fnum(r["oa_quota_media_Under L"])])[0], 4)
    return {"mk": mk, "mo": mo, "mo_l": mo_l, "linea": linea, "odds": {"1": q["1"], "X": q["X"], "2": q["2"], "O": q["Over 2.5"], "U": q["Under 2.5"]},
            "max": {"1": mx["1"], "X": mx["X"], "2": mx["2"], "O": mx["Over 2.5"], "U": mx["Under 2.5"]}, "nb": int(nb) if nb else None}


# ---------- football-data ----------

def nome_fd(team):
    return (team or {}).get("shortName") or (team or {}).get("name") or "?"


def arbitro_di(m):
    for r in (m or {}).get("referees") or []:
        if r.get("type") in (None, "REFEREE") and r.get("name"):
            return r["name"]
    return None


def storia_arbitri(fdp):
    """Cartellini e falli di ogni partita con il nome dell'arbitro: Premier League dall'archivio storico (dal 2012),
    gli altri campionati dalla stagione in corso e da quella precedente (arbitro da football-data.org, cartellini e falli da Football-Data.co.uk)."""
    import gzip
    righe = []
    def num(x):
        try:
            return float(x)
        except (TypeError, ValueError):
            return None
    def dt(x):
        for f in ("%d/%m/%Y", "%d/%m/%y"):
            try:
                return datetime.strptime(x, f)
            except (TypeError, ValueError):
                pass
        return None
    # indice delle partite football-data.org con arbitro: (codice, giorno) -> [(casa, ospite, arbitro)]
    idx = {}
    prev = {}
    for code in ("SA", "PL", "PD", "BL1"):
        prev[code] = (jload(os.path.join(FD, f"{code}_matches_prev.json"), {}) or {}).get("matches", [])
    for m in list(fdp.values()) + [dict(x, _code=c) for c, xs in prev.items() for x in xs]:
        a = arbitro_di(m)
        if not a or not m.get("utcDate"):
            continue
        g = m["utcDate"][:10]
        idx.setdefault((m.get("_code"), g), []).append((nome_fd(m.get("homeTeam")), nome_fd(m.get("awayTeam")), a))
    def cerca(code, giorno, h, a):
        best, bs = None, 1.5
        for dd in (0, -1, 1):
            g = (giorno + timedelta(days=dd)).strftime("%Y-%m-%d")
            for hh, aa, ar in idx.get((code, g), []):
                sc = ES.sim(h, [hh]) + ES.sim(a, [aa])
                if sc > bs:
                    best, bs = ar, sc
        return best
    def aggiungi(r, lega, code):
        y = [num(r.get(c)) for c in ("HY", "AY", "HR", "AR")]
        f = [num(r.get(c)) for c in ("HF", "AF")]
        if None in y:
            return
        g = dt(r.get("Date"))
        if not g:
            return
        arb = r.get("Referee") or (cerca(code, g, r.get("HomeTeam"), r.get("AwayTeam")) if code else None)
        if arb:
            righe.append({"t": g, "arbitro": arb, "lega": lega, "K": sum(y), "F": (f[0] + f[1]) if None not in f else None})
    codici = {"I1": "SA", "E0": "PL", "SP1": "PD", "D1": "BL1"}
    try:  # archivio storico (stagioni passate)
        with gzip.open(os.path.join("storico", "fd_partite.csv.gz"), "rt", encoding="utf-8") as f:
            for r in csv.DictReader(f):
                if r["Div"] in codici and (r.get("Referee") or r["Season"] >= "2526"):
                    aggiungi(r, r["Div"], codici[r["Div"]] if not r.get("Referee") else None)
    except OSError:
        pass
    for k, code in codici.items():  # stagione in corso
        try:
            with open(os.path.join(FD, f"stagione_{k}.csv"), encoding="utf-8-sig", errors="replace") as f:
                for r in csv.DictReader(f):
                    aggiungi(r, k, code)
        except OSError:
            pass
    righe.sort(key=lambda r: r["t"])
    return CK.arbitri(righe)


def carica_fd():
    partite, classifiche = {}, {}
    for _, _, _, _, code, _ in LEAGUES:
        if not code:
            continue
        ms = jload(os.path.join(FD, f"{code}_matches.json"), {}) or {}
        for m in ms.get("matches", []):
            m["_code"] = code
            partite[m["id"]] = m
        st = jload(os.path.join(FD, f"{code}_standings.json"), {}) or {}
        tabs = {}
        for blocco in st.get("standings", []):
            tipo = blocco.get("type")
            if tipo in ("TOTAL", "HOME", "AWAY") and tipo not in tabs:
                tabs[tipo] = blocco.get("table", [])
        if tabs:
            classifiche[code] = tabs
    vic = jload(os.path.join(FD, "vicine.json"), {}) or {}
    for m in vic.get("matches", []):  # stato e risultati piu recenti
        if m.get("id") in partite:
            partite[m["id"]].update({k: m[k] for k in ("status", "score", "utcDate") if k in m})
    return partite, classifiche


def primo_tempo(m):
    """Risultato del primo tempo da football-data.org, se noto."""
    ht = (((m or {}).get("score") or {}).get("halfTime") or {})
    g = [ht.get("home"), ht.get("away")]
    return g if None not in g else None


def esito_sicuro(c, g, g1):
    try:
        return M.valuta(c, g[0], g[1], *(g1 or [None, None]))
    except (ValueError, IndexError):
        return None  # cartellini, angoli, falli, marcatori: non verificabili dal solo risultato


def stato(m):
    s = (m or {}).get("status", "")
    ft = ((m or {}).get("score") or {}).get("fullTime") or {}
    g = [ft.get("home"), ft.get("away")]
    if s == "FINISHED" and None not in g:
        return "FT", g
    if s in ("IN_PLAY", "PAUSED", "LIVE") and None not in g:
        return "LIVE", g
    if s in ("POSTPONED", "SUSPENDED", "CANCELLED"):
        return "RINV", None
    return "NS", None


def abbina(r, cand):
    """Partita football-data corrispondente a una riga di quote: stesso campionato, orario vicino, nomi simili."""
    best, score = None, 0.0
    for m in cand:
        try:
            dt = abs((utc(m["utcDate"]) - r["_t"]).total_seconds())
        except (KeyError, ValueError):
            continue
        if dt > 3 * 3600:
            continue
        s = sim(r.get("casa"), nome_fd(m.get("homeTeam"))) + sim(r.get("ospite"), nome_fd(m.get("awayTeam")))
        if s > score:
            best, score = m, s
    return best if score >= 0.9 else None


# ---------- letture ----------

def storico(partite):
    per_team = {}
    for m in partite.values():
        st, g = stato(m)
        if st != "FT":
            continue
        t = utc(m["utcDate"])
        for lato, altro, gf, gs in (("homeTeam", "awayTeam", g[0], g[1]), ("awayTeam", "homeTeam", g[1], g[0])):
            tid = (m.get(lato) or {}).get("id")
            if tid is None:
                continue
            z = {"t": t, "avv": nome_fd(m.get(altro)), "casa": lato == "homeTeam", "gf": gf, "gs": gs}
            g1 = primo_tempo(m)
            if g1:
                z["gf1"], z["gs1"] = (g1[0], g1[1]) if lato == "homeTeam" else (g1[1], g1[0])
            per_team.setdefault(tid, []).append(z)
    for v in per_team.values():
        v.sort(key=lambda z: z["t"])
    return per_team


def curiosita(lst, nome):
    """Frasi statistiche sulle serie in corso di una squadra (dalla piu recente indietro), con un punteggio per scegliere le piu forti."""
    out = []
    if len(lst) < 5:
        return out
    r = list(reversed(lst))
    def serie(f):
        n = 0
        for z in r:
            if not f(z):
                break
            n += 1
        return n
    v = serie(lambda z: z["gf"] > z["gs"])
    imb = serie(lambda z: z["gf"] >= z["gs"])
    nov = serie(lambda z: z["gf"] <= z["gs"])
    seg = serie(lambda z: z["gf"] > 0)
    cs = serie(lambda z: z["gs"] == 0)
    nos = serie(lambda z: z["gf"] == 0)
    sc = serie(lambda z: z["gf"] < z["gs"])
    if v >= 3:
        out.append((v * 1.2, f"{nome} ha vinto le ultime {v} partite."))
    elif imb >= 5:
        out.append((imb, f"{nome} non perde da {imb} partite."))
    if sc >= 3:
        out.append((sc * 1.2, f"{nome} ha perso le ultime {sc} partite."))
    elif nov >= 5:
        out.append((nov, f"{nome} non vince da {nov} partite."))
    if cs >= 3:
        out.append((cs * 1.3, f"{nome} non subisce gol da {cs} partite."))
    if nos >= 2:
        out.append((nos * 1.6, f"{nome} non segna da {nos} partite."))
    elif seg >= 8:
        out.append((seg * 0.7, f"{nome} segna da {seg} partite di fila."))
    u6 = r[:6]
    over = sum(1 for z in u6 if z["gf"] + z["gs"] >= 3)
    goal = sum(1 for z in u6 if z["gf"] > 0 and z["gs"] > 0)
    if over >= 5:
        out.append((over, f"In tutte le ultime 6 partite di {nome} ci sono stati almeno 3 gol." if over == 6 else f"In {over} delle ultime 6 partite di {nome} ci sono stati almeno 3 gol."))
    elif over <= 1:
        out.append((5, f"Nessuna delle ultime 6 partite di {nome} ha avuto 3 gol o più." if over == 0 else f"Solo una delle ultime 6 partite di {nome} ha avuto 3 gol o più."))
    if goal >= 5:
        out.append((goal - 0.5, f"Hanno segnato entrambe le squadre in tutte le ultime 6 partite di {nome}." if goal == 6 else f"Hanno segnato entrambe le squadre in {goal} delle ultime 6 partite di {nome}."))
    return out


def curiosita_partita(per_team, hid, aid, h, a, t0):
    """Le 4 curiosita piu forti: squadra di casa sulle partite in casa, ospite in trasferta, piu le serie generali."""
    tutte = []
    for tid, nome, casa in ((hid, h, True), (aid, a, False)):
        lst = [z for z in per_team.get(tid, []) if z["t"] < t0] if tid else []
        tutte += curiosita(lst, nome)
        sede = [z for z in lst if z["casa"] == casa][-6:]
        if len(sede) >= 5:
            vs = sum(1 for z in sede if z["gf"] > z["gs"])
            ps = sum(1 for z in sede if z["gf"] < z["gs"])
            dove = "in casa" if casa else "in trasferta"
            if vs >= 5:
                tutte.append((vs + 1, f"{nome} ha vinto {vs} delle ultime {len(sede)} partite {dove}."))
            elif ps >= 4:
                tutte.append((ps + 1, f"{nome} ha perso {ps} delle ultime {len(sede)} partite {dove}."))
            elif vs == 0:
                tutte.append((5, f"{nome} non ha vinto nessuna delle ultime {len(sede)} partite {dove}."))
    tutte.sort(key=lambda x: -x[0])
    return [t for _, t in tutte[:4]]


def ultime5(per_team, tid, prima):
    lst = [z for z in per_team.get(tid, []) if z["t"] < prima][-5:]
    return [{"data": z["t"].astimezone(ROME).strftime("%d/%m/%y"), "avv": z["avv"], "casa": z["casa"], "ris": f"{z['gf']}-{z['gs']}",
             "esito": "V" if z["gf"] > z["gs"] else ("N" if z["gf"] == z["gs"] else "P")} for z in lst]


def testo_forma(l5):
    if not l5:
        return {"tone": "ok", "text": "Nessuna partita recente nei dati disponibili."}
    pts = sum(3 if z["esito"] == "V" else 1 if z["esito"] == "N" else 0 for z in l5)
    v, n, p = (sum(z["esito"] == e for z in l5) for e in "VNP")
    gf = sum(int(z["ris"].split("-")[0]) for z in l5)
    gs = sum(int(z["ris"].split("-")[1]) for z in l5)
    tone = "good" if pts >= 3 * len(l5) * 0.6 else ("warn" if pts <= len(l5) * 0.8 else "ok")
    pl = lambda x, a, b: f"{x} {a if x == 1 else b}"
    ult = "nell'ultima partita" if len(l5) == 1 else f"nelle ultime {len(l5)}"
    return {"tone": tone, "text": f"{pl(pts, 'punto', 'punti')} {ult} ({pl(v, 'vittoria', 'vittorie')}, {pl(n, 'pareggio', 'pareggi')}, {pl(p, 'sconfitta', 'sconfitte')}), "
                                  f"{pl(gf, 'gol fatto', 'gol fatti')} e {pl(gs, 'subito', 'subiti')}."}


def testo_classifica(tabs, tid):
    for i, r in enumerate((tabs or {}).get("TOTAL", [])):
        if (r.get("team") or {}).get("id") == tid:
            pg = r.get("playedGames") or 0
            ppg = (r.get("points", 0) / pg) if pg else 0
            tone = "good" if r.get("position", i + 1) <= 4 else ("warn" if r.get("position", 99) >= len(tabs["TOTAL"]) - 2 else "ok")
            media = f"{ppg:.2f}".replace(".", ",")
            return {"tone": tone, "text": f"{r.get('position', i + 1)}° con {r.get('points', 0)} punti in {pg} partite, {media} a partita."}
    return {"tone": "ok", "text": "Classifica non disponibile nei dati gratuiti."}


def precedenti(mid, casa_id, ospite_id):
    h = jload(os.path.join(FD, f"h2h_{mid}.json"), {}) or {}
    lst = []
    for m in h.get("matches", []):
        st, g = stato(m)
        if st != "FT":
            continue
        lst.append({"t": utc(m["utcDate"]), "casa": nome_fd(m.get("homeTeam")), "ospite": nome_fd(m.get("awayTeam")), "hid": (m.get("homeTeam") or {}).get("id"), "g": g})
    lst.sort(key=lambda z: z["t"], reverse=True)
    lista = [{"data": z["t"].astimezone(ROME).strftime("%d/%m/%y"), "casa": z["casa"], "ospite": z["ospite"], "ris": f"{z['g'][0]}-{z['g'][1]}"} for z in lst]
    if not lst:
        return {"tone": "ok", "text": "Nessun precedente recente nei dati disponibili."}, lista
    vc = sum((z["g"][0] > z["g"][1]) == (z["hid"] == casa_id) and z["g"][0] != z["g"][1] for z in lst)
    vo = sum((z["g"][0] > z["g"][1]) == (z["hid"] == ospite_id) and z["g"][0] != z["g"][1] for z in lst)
    nn = sum(z["g"][0] == z["g"][1] for z in lst)
    pl = lambda x, a, b: f"{x} {a if x == 1 else b}"
    testa = "L'ultimo precedente" if len(lst) == 1 else f"Gli ultimi {len(lst)} precedenti"
    return {"tone": "ok", "text": f"{testa}: {pl(vc, 'vittoria', 'vittorie')} della squadra di casa di oggi, {pl(nn, 'pareggio', 'pareggi')}, {pl(vo, 'vittoria', 'vittorie')} dell'ospite. Nei test i precedenti pesano poco: sono già dentro le quote."}, lista


def calendario_coppe(fdp, esd):
    """Partite di coppa (Champions da football-data, Europa e Conference League e Coppa Italia da ESPN) per squadra: elenco di orari."""
    out = {}
    def add(nome, t):
        k = " ".join(sorted(toks(nome)))
        if k:
            out.setdefault(k, []).append(t)
    for m in fdp.values():
        if m.get("_code") == "CL" and m.get("utcDate"):
            t = utc(m["utcDate"])
            add(nome_fd(m.get("homeTeam")), t)
            add(nome_fd(m.get("awayTeam")), t)
    for k in ES.COPPE:
        for e in ((esd.get("risultati_lega") or {}).get(k) or []):
            try:
                t = utc(e["t"].replace("Z", "+00:00"))
            except (KeyError, ValueError):
                continue
            add(e["h"], t)
            add(e["a"], t)
    return out


def coppa_vicina(cal, nome, t0):
    """Giorni dall'ultima partita di coppa (entro 5) e alla prossima (entro 5), per il segnale 'stanchezza/turnover'."""
    ts = cal.get(" ".join(sorted(toks(nome)))) or []
    prima = [(t0 - t).total_seconds() / 86400 for t in ts if timedelta(hours=20) <= t0 - t <= timedelta(days=5)]
    dopo = [(t - t0).total_seconds() / 86400 for t in ts if timedelta(hours=20) <= t - t0 <= timedelta(days=5)]
    return {"prima": round(min(prima)) if prima else None, "dopo": round(min(dopo)) if dopo else None}


def riposo(per_team, tid, prima):
    lst = [z for z in per_team.get(tid, []) if z["t"] < prima]
    return (prima - lst[-1]["t"]).days if lst else None


# ---------- costruzione ----------

def genera():
    now = datetime.now(timezone.utc)
    oggi = now.astimezone(ROME).date()
    giorni = [oggi + timedelta(days=d) for d in range(-1, 6)]
    quote = carica_quote()
    fdp, classifiche = carica_fd()
    per_team = storico(fdp)
    # Serie B (non coperta da football-data): risultati e classifica da ESPN, con id "es:<nome>"
    esd = jload(ESPN, {}) or {}
    for nome, es in (esd.get("squadre") or {}).items():
        if es.get("lg") in ("I2", "EL", "ECL", "CI") and es.get("risultati") and "es:" + nome not in per_team:
            per_team["es:" + nome] = [{"t": utc(x["t"].replace("Z", "+00:00") if x["t"].endswith("Z") else x["t"]), "avv": x["avv"], "casa": x["casa"], "gf": x["gf"], "gs": x["gs"]} for x in es["risultati"]]
    medie_ck = {k: CK.medie_stagione(os.path.join(FD, f"stagione_{k}.csv")) for k in ("I1", "I2", "E0", "SP1", "D1", "E1", "F1")}
    refs, _ = storia_arbitri(fdp)
    print(f"Arbitri con statistiche: {len(refs)}")
    designati = (jload(os.path.join(DATA, "espn", "arbitri.json"), {}) or {}).get("partite", [])
    colori_es = esd.get("colori") or {}
    cal_coppe = calendario_coppe(fdp, esd)
    with open(ARBITRI, "w", encoding="utf-8") as f:  # per gli aggiornamenti durante il giorno (arbitri designati dopo il mattino)
        json.dump({c: {"nome": v["nome"], "n": v["n"], "ratio": v["ratio"], "media": v["media"], "lega": v.get("lega")} for c, v in refs.items()}, f, ensure_ascii=False, separators=(",", ":"))

    xg_lega = {k: jload(os.path.join(FD, f"understat_{k}.json"), []) or [] for k in ("I1", "E0", "SP1", "D1")}

    def lettura_xg(k, nome, prima):
        """Ultime 6 partite: gol fatti/subiti contro gol attesi (xG). Distingue merito e fortuna."""
        ps = xg_lega.get(k) or []
        if not ps:
            return None
        squadre = {p["h"] for p in ps} | {p["a"] for p in ps}
        best = max(squadre, key=lambda t: ES.sim(nome, [t]), default=None)
        if not best or ES.sim(nome, [best]) < 0.8:
            return None
        mie = sorted((p for p in ps if best in (p["h"], p["a"]) and p["t"] < prima.strftime("%Y-%m-%d %H:%M:%S")), key=lambda p: p["t"])[-6:]
        if len(mie) < 3:
            return None
        gf = sum(p["hg"] if p["h"] == best else p["ag"] for p in mie)
        gs = sum(p["ag"] if p["h"] == best else p["hg"] for p in mie)
        xf = sum(p["hx"] if p["h"] == best else p["ax"] for p in mie)
        xs = sum(p["ax"] if p["h"] == best else p["hx"] for p in mie)
        return {"n": len(mie), "gf": gf, "gs": gs, "xf": round(xf, 1), "xs": round(xs, 1)}

    def nome_csv(k, nome):
        med = medie_ck.get(k)
        if not med:
            return None
        best = max(med["squadre"], key=lambda t: ES.sim(nome, [t]), default=None)
        return best if best and ES.sim(nome, [best]) >= 0.8 else None
    for k_es in ES.SOLO_ESPN:  # classifiche da ESPN (Serie B e campionati senza football-data.org)
      cl2 = (esd.get("classifiche") or {}).get(k_es)
      if cl2:
        nostri = [n for n, es in (esd.get("squadre") or {}).items() if es.get("lg") == k_es]
        righe = []
        for i, r in enumerate(cl2):
            mio = next((n for n in nostri if ES.sim(n, [r["team"]]) >= 0.8), None)
            righe.append({"team": {"id": "es:" + (mio or r["team"]), "shortName": mio or r["team"]}, "position": r["rank"] or i + 1, "points": r["pt"], "playedGames": r["pg"],
                          "won": r["v"], "draw": r["n"], "lost": r["p"], "goalsFor": r["gf"], "goalsAgainst": r["gs"]})
        classifiche["ES_" + k_es] = {"TOTAL": righe}
    scores = {}
    for path in glob.glob(os.path.join(FD, "scores_*.json")):
        for e in jload(path, []) or []:
            if e.get("completed") and e.get("scores"):
                sc = {s.get("name"): s.get("score") for s in e["scores"]}
                scores[(" ".join(sorted(toks(e.get("home_team")))), " ".join(sorted(toks(e.get("away_team")))))] = (sc.get(e.get("home_team")), sc.get(e.get("away_team")))
    per_lega = {lg[5]: lg for lg in LEAGUES}
    out = {"generato": now.astimezone(ROME).strftime("%d/%m/%Y %H:%M"), "demo": False, "leagues": [], "matches": [], "standings": {}, "teams": [], "days": []}
    usate = set()
    for r in quote:
        lg = per_lega.get(r.get("campionato"))
        if not lg:
            continue
        k, _, _, _, code, _ = lg
        loc = r["_t"].astimezone(ROME)
        if loc.date() not in giorni:
            continue
        q = quote_di(r)
        if not q:
            continue
        m_fd = abbina(r, [m for m in fdp.values() if m["_code"] == code and m["id"] not in usate]) if code else None
        if m_fd:
            usate.add(m_fd["id"])
            h, a = nome_fd(m_fd.get("homeTeam")), nome_fd(m_fd.get("awayTeam"))
            hid, aid = (m_fd.get("homeTeam") or {}).get("id"), (m_fd.get("awayTeam") or {}).get("id")
            st, g = stato(m_fd)
        else:
            h, a, hid, aid = pulisci(r["casa"]), pulisci(r["ospite"]), None, None
            hid = "es:" + h if "es:" + h in per_team else None
            aid = "es:" + a if "es:" + a in per_team else None
            st, g = "NS", None
            sc = scores.get((" ".join(sorted(toks(r["casa"]))), " ".join(sorted(toks(r["ospite"])))))
            if sc and None not in sc:
                try:
                    st, g = "FT", [int(sc[0]), int(sc[1])]
                except (TypeError, ValueError):
                    pass
            for e in ((esd.get("risultati_lega") or {}).get(k) or []):  # Serie B: risultati da ESPN
                try:
                    vicino = abs((utc(e["t"].replace("Z", "+00:00")) - r["_t"]).total_seconds()) < 6 * 3600
                except ValueError:
                    vicino = False
                if vicino and ES.sim(h, [e["h"]]) + ES.sim(a, [e["a"]]) >= 1.3:
                    if e["st"] == "post" and e["fine"]:
                        st, g = "FT", e["g"]
                    elif e["st"] == "in":
                        st, g = "LIVE", e["g"]
                    break
        t0 = r["_t"]
        l5 = [ultime5(per_team, hid, t0), ultime5(per_team, aid, t0)] if (code or hid or aid) else [[], []]
        prec, h2h = precedenti(m_fd["id"], hid, aid) if m_fd else ({"tone": "ok", "text": "Precedenti non disponibili per questo campionato nei dati gratuiti."}, [])
        rh, ra = (riposo(per_team, hid, t0), riposo(per_team, aid, t0)) if (code or hid or aid) else (None, None)
        if rh is not None and ra is not None and abs(rh - ra) >= 3:
            ctx = {"tone": "info", "text": f"{h if rh > ra else a} ha {abs(rh - ra)} giorni di riposo in più."}
        elif rh is not None and ra is not None:
            ctx = {"tone": "ok", "text": f"Riposo simile: {rh} giorni per {h}, {ra} per {a} (partite di campionato e coppe nei dati)."}
        else:
            ctx = {"tone": "ok", "text": "Giorni di riposo non disponibili per questo campionato."}
        tabs = classifiche.get(code) if code else classifiche.get("ES_" + k)
        # mercati e consiglio IA motivato
        lh, la = M.gol_attesi(q["mk"], q["mo"]) if q["mo"] is not None or not q.get("mo_l") else M.gol_attesi(q["mk"], q["mo_l"], q["linea"])
        raccolte = {c: v for c, v in (("1", q["odds"]["1"]), ("X", q["odds"]["X"]), ("2", q["odds"]["2"]), ("O2.5", q["odds"]["O"]), ("U2.5", q["odds"]["U"])) if v}
        if q.get("mo_l") and q.get("linea"):  # quote raccolte sulla linea ESPN (es. Over/Under 3,5)
            L = ("%g" % q["linea"])
            raccolte.update({"O" + L: fnum(r.get("oa_quota_media_Over L")), "U" + L: fnum(r.get("oa_quota_media_Under L"))})
        mercati = M.calcola_mercati(lh, la, h, a, raccolte)
        p0 = {x["c"]: x["p"] for x in mercati if x["c"] in ("1", "X", "2")}  # probabilita del motore prima delle correzioni imparate
        CB.calibra(mercati, k)  # correzioni imparate dai risultati (data/modello.json, aggiornato ogni mattina)
        pc = {x["c"]: x["p"] for x in mercati}
        if q["mo"] is None:  # Over 2,5 senza quota diretta: probabilità del modello (dai gol attesi)
            q["mo"] = next((x["p"] for x in mercati if x["c"] == "O2.5"), None)
        sh = M.statistiche([z for z in per_team.get(hid, []) if z["t"] < t0]) if hid else None
        sa = M.statistiche([z for z in per_team.get(aid, []) if z["t"] < t0]) if aid else None
        pos = {}
        for i, rr in enumerate((tabs or {}).get("TOTAL", [])):
            pos[(rr.get("team") or {}).get("id")] = rr.get("position", i + 1)
        tip = M.scegli(mercati, h, a, sh, sa, {"pos_h": pos.get(hid), "pos_a": pos.get(aid)}, q["nb"])
        if not (sh and sa):
            for v in tip.values():
                v["perche"].append("Statistiche delle squadre non disponibili per questo campionato: il consiglio si basa solo sulle quote.")
        arb_nome = (arbitro_di(m_fd) if m_fd else None) or ES.arbitro_designato(designati, k, h, a, t0)
        arb = refs.get(CK.chiave_arbitro(arb_nome)) if arb_nome else None
        extra, cart = CK.mercati(medie_ck.get(k), nome_csv(k, h), nome_csv(k, a), q["mk"][0], q["mk"][2], arb) if k in medie_ck else (None, None)
        arbitro = scheda_arbitro(arb_nome, arb, (medie_ck.get(k) or {}).get("lega") or {}) if arb_nome else None
        extra = extra or []
        mid = f"{k}-{m_fd['id'] if m_fd else zlib.crc32((h + '|' + a + '|' + loc.date().isoformat()).encode())}"
        if k in ES.NAZIONALI:  # nazionali: nome italiano per l'app, quello originale per diretta e risultati
            import nazionali as NZ
            eh, ea, h, a = h, a, NZ.italiano(h), NZ.italiano(a)
        else:
            eh = ea = None
        out["matches"].append({
            "id": mid, "fd": m_fd["id"] if m_fd else None, "lg": k, **({"eh": eh, "ea": ea} if eh else {}), "date": loc.strftime("%Y-%m-%d"), "time": loc.strftime("%H:%M"), "ko": t0.isoformat(),
            "h": h, "a": a, "st": st, "g": g, "g1": primo_tempo(m_fd) if m_fd and st in ("FT", "LIVE") else None, "res": (None if g is None else (0 if g[0] > g[1] else 1 if g[0] == g[1] else 2)), "free": False,
            "p": [pc["1"], pc["X"], pc["2"]] if CB.attivo() and all(c in pc for c in "1X2") else q["mk"], "_p0": q["mk"], "mk": q["mk"],
            "po": pc.get("O2.5", q["mo"]) if CB.attivo() and q["mo"] is not None else (q["mo"] if q["mo"] is not None else 0.5), "mo": q["mo"] if q["mo"] is not None else 0.5,
            "odds": q["odds"], "max": q["max"], "nb": q["nb"], "xg": [lh, la], "elo": [None, None],
            "forma": [testo_forma(l5[0]), testo_forma(l5[1])] if (code or hid or aid) else [{"tone": "ok", "text": "Forma non disponibile per questo campionato nei dati gratuiti."}] * 2,
            "attese": [testo_classifica(tabs, hid), testo_classifica(tabs, aid)] if tabs else [{"tone": "ok", "text": "Classifica non disponibile nei dati gratuiti."}] * 2,
            "prec": prec, "ctx": ctx, "flags": [], "last5": l5, "h2h": h2h, "stats": [],
            "markets": righe_mercati(mercati) + extra, "tip": tip,
            "xg_mercato": [lh, la], "fattori": [], "foto": r["_foto"], "cart": cart, "arbitro": arbitro,
            "xgf": [lettura_xg(k, h, t0), lettura_xg(k, a, t0)] if k in xg_lega else None,
            "curiosita": curiosita_partita(per_team, hid, aid, h, a, t0) if (hid or aid) else [],
            "col": colori_partita(colori_es.get(k), h, a),
            "_ctx": {"coppa": [coppa_vicina(cal_coppe, h, t0), coppa_vicina(cal_coppe, a, t0)] if k not in ES.COPPE else None, "riposo": [rh, ra], "sh": sh, "sa": sa, "pos_h": pos.get(hid), "pos_a": pos.get(aid), "raccolte": raccolte,
                     "gol": [next((rr.get("goalsFor") for rr in (tabs or {}).get("TOTAL", []) if (rr.get("team") or {}).get("id") == x), None) for x in (hid, aid)]},
        })
    # 3 partite FREE: le piu importanti tra oggi e domani non ancora iniziate
    cand = [m for m in out["matches"] if m["st"] == "NS" and m["date"] in (oggi.isoformat(), (oggi + timedelta(days=1)).isoformat())]
    cand.sort(key=lambda m: (PRIORITA.index(m["lg"]), m["ko"]))
    for m in cand[:3]:
        m["free"] = True
    out["matches"].sort(key=lambda m: (m["ko"], m["lg"]))
    presenti = {m["lg"] for m in out["matches"]}
    for k, nome, paese, flag, code, _ in LEAGUES:
        if k in presenti:
            out["leagues"].append({"k": k, "name": nome, "country": paese, "flag": flag})
        tabs = classifiche.get(code) if code else classifiche.get("ES_" + k)
        if tabs:
            conv = lambda rows: [{"team": nome_fd(r.get("team")), "pg": r.get("playedGames", 0), "v": r.get("won", 0), "n": r.get("draw", 0), "p": r.get("lost", 0),
                                  "gf": r.get("goalsFor", 0), "gs": r.get("goalsAgainst", 0), "pt": r.get("points", 0)} for r in rows]
            out["standings"][k] = {"generale": conv(tabs.get("TOTAL", [])), "casa": conv(tabs.get("HOME", [])), "trasferta": conv(tabs.get("AWAY", []))}
            if not tabs.get("HOME"):
                out["standings"][k]["solo_generale"] = True
        sc = (jload(os.path.join(FD, f"{code}_scorers.json"), {}) or {}).get("scorers", []) if code else []
        if sc:
            out.setdefault("scorers", {})[k] = [{"n": (r.get("player") or {}).get("name", "?"), "t": nome_fd(r.get("team")), "g": r.get("goals") or 0, "a": r.get("assists") or 0,
                                                  "r": r.get("penalties") or 0, "pg": r.get("playedMatches") or 0} for r in sc]
    # stessi nomi tra partite e classifiche/marcatori (es. "Sudtirol" in classifica, "Südtirol" nelle partite)
    import unicodedata
    piega = lambda x: unicodedata.normalize("NFD", x or "").encode("ascii", "ignore").decode().lower().strip()
    nomi = {piega(t): t for m in out["matches"] for t in (m["h"], m["a"])}
    for tabs in out["standings"].values():
        for rows in tabs.values():
            if isinstance(rows, list):
                for r in rows:
                    r["team"] = nomi.get(piega(r["team"]), r["team"])
    for rows in (out.get("scorers") or {}).values():
        for r in rows:
            r["t"] = nomi.get(piega(r["t"]), r["t"])
    etich = {-1: "Ieri", 0: "Oggi", 1: "Domani"}
    for d in giorni:
        if any(m["date"] == d.isoformat() for m in out["matches"]):
            delta = (d - oggi).days
            out["days"].append({"k": d.isoformat(), "label": etich.get(delta, f"{GG[d.weekday()]} {d.day}")})
    out["today"] = oggi.isoformat()
    scrivi_panchine(out)
    out["label"] = f"aggiornati il {out['generato'][:5]} alle {out['generato'][-5:]}"
    squadre = {m["h"] for m in out["matches"]} | {m["a"] for m in out["matches"]}
    for v in out["standings"].values():
        squadre |= {r["team"] for r in v["generale"]}
    out["teams"] = sorted(squadre)
    aggiorna_prepartita(out)
    applica_fattori(out)
    return out


NOTIZIE = os.path.join(DATA, "notizie", "notizie.json")
ESPN = os.path.join(DATA, "espn", "squadre.json")
ARBITRI = os.path.join(DATA, "arbitri.json")


def extra_di(m):
    """Mercati di cartellini, angoli e falli gia nella partita (non dipendono dai gol attesi)."""
    return [x for x in m.get("markets", []) if re.match(r"^[KCF][HA]?[OU]\d", str(x[0]))]


def compatta_ia(ia, righe):
    """Per un file piu leggero: il punteggio IA va come 5a colonna di ogni mercato, le frasi delle motivazioni una volta sola."""
    for r in righe:
        del r[4:]
        r.append(ia["s"].get(r[0]))
    frasi, idx = [], {}
    def i(t):
        if t not in idx:
            idx[t] = len(frasi)
            frasi.append(t)
        return idx[t]
    g = {k: {"c": v["c"], "p": round(v["p"], 3), "q": v["q"], "s": v["s"], "si": [i(t) for t in v["si"]], "no": [i(t) for t in v["no"]], "info": [i(t) for t in v["info"]]} for k, v in ia["g"].items()}
    return {"g": g, "f": frasi}


def righe_mercati(mercati):
    """Righe compatte per l'app: [codice, probabilita, quota raccolta o 0 (= stimata dall'app con margine 6%), raccolta 1/0]."""
    return [[x["c"], round(x["p"], 3), x["q"] if x["qm"] else 0, 1 if x["qm"] else 0] for x in mercati]


def colori_partita(elenco, h, a):
    """Colori di maglia (principale, alternativo) delle due squadre da ESPN, o None."""
    out = []
    for n in (h, a):
        t = ES.trova_squadra(elenco or [], n)
        out.append(["#" + t["color"], "#" + (t.get("alternateColor") or "ffffff")] if t and t.get("color") else None)
    return out if any(out) else None


def scheda_arbitro(nome, arb, lega):
    return {"nome": nome, "n": arb["n"] if arb else 0,
            "media": {kk: round(v, 2) for kk, v in (arb["media"] if arb else {}).items() if v is not None},
            "ratio": {kk: round(v, 3) for kk, v in (arb["ratio"] if arb else {}).items()},
            "lega": {kk: round(lega[kk], 2) for kk in ("K", "F") if lega.get(kk)}}


def aggiorna_arbitri(d):
    """Durante il giorno: arbitri designati dopo il giro del mattino -> scheda arbitro e mercati cartellini/falli ricalcolati."""
    designati = (jload(os.path.join(DATA, "espn", "arbitri.json"), {}) or {}).get("partite", [])
    refs = jload(ARBITRI, {}) or {}
    n = 0
    for m in d.get("matches", []):
        if m.get("arbitro") or m.get("st") != "NS":
            continue
        try:
            ko = datetime.fromisoformat(m["ko"])
        except (KeyError, ValueError):
            continue
        nome = ES.arbitro_designato(designati, m.get("lg"), m["h"], m["a"], ko)
        if not nome:
            continue
        arb = refs.get(CK.chiave_arbitro(nome))
        lega = {kk: (m.get("cart") or {}).get(kk, {}).get("media_lega") for kk in ("K", "F")}
        m["arbitro"] = scheda_arbitro(nome, arb, {kk: v for kk, v in lega.items() if v})
        if arb:
            CK.con_arbitro(m, arb)
        n += 1
    return n


def scrivi_panchine(out):
    """Allenatori e termometro della panchina in app/data/panchine.json (file a parte: si scarica solo quando serve)."""
    try:
        import panchine as PN
        pc = PN.calcola(FD)
        nomi = {}
        for m in out.get("matches", []):
            if m["lg"] in PN.LEGHE:
                nomi[(m["lg"], m["h"])] = nomi[(m["lg"], m["a"])] = None
        for k in PN.LEGHE:
            for r in ((out.get("standings") or {}).get(k) or {}).get("generale", []):
                nomi[(k, r["team"])] = None
        sch = {}
        for (k, t) in nomi:
            c = PN.abbina(t, [n for n, v in pc.items() if v["lg"] == k])
            if c:
                sch[t] = pc[c]
        with open(os.path.join("app", "data", "panchine.json"), "w", encoding="utf-8") as f:
            json.dump({"generato": out.get("generato"), "squadre": sch}, f, ensure_ascii=False, separators=(",", ":"))
        print(f"Panchine: {len(sch)} squadre con allenatore e termometro")
    except Exception as e:  # noqa: BLE001
        print("Panchine: errore", e)


TARATURA = os.path.join(DATA, "taratura_fattori.json")
MIN_TARATURA = 100  # partite corrette e finite prima di toccare i pesi


def SCALA_FATTORI():
    t = jload(TARATURA, {}) or {}
    return float(t.get("scala", 1.0)) if t.get("attiva") else 1.0


def ritara_fattori(corr, ll):
    """Ritaratura automatica dei pesi delle correzioni (notizie, assenze, squalifiche).
    Sulle partite corrette e finite cerca la scala s (0-1,5) che rende più precise le probabilità:
    p_s = quote x (IA/quote)^s, normalizzata. Con meno di MIN_TARATURA partite non cambia nulla; poi la scala si avvicina
    a quella migliore man mano che le partite crescono (a metà strada con 100, del tutto con 300), per non inseguire il caso."""
    n = len(corr)
    out = {"n": n, "minimo": MIN_TARATURA, "attiva": False, "scala": 1.0, "aggiornata": datetime.now(timezone.utc).isoformat()}
    if n >= MIN_TARATURA:
        def err(s):
            tot = 0.0
            for v in corr:
                e = s / max(0.05, v.get("sc", 1.0))  # la correzione salvata era già scalata con la scala di allora
                q = [max(1e-6, a) * (max(1e-6, b) / max(1e-6, a)) ** e for a, b in zip(v["mk"], v["p"])]
                z = sum(q)
                tot += ll([x / z for x in q], v["g"])
            return tot / n
        prove = {round(s / 20, 2): err(s / 20) for s in range(0, 31)}
        migliore = min(prove, key=prove.get)
        peso = min(1.0, 0.5 + (n - MIN_TARATURA) / (2 * (300 - MIN_TARATURA))) if n < 300 else 1.0
        scala = round(1 + (migliore - 1) * peso, 2)
        # dal 29/10/2026 la scala resta 1: il peso delle correzioni si impara per famiglia di mercato in strumenti/impara.py
        # (qui resta solo come controllo: "suggerita" e quella che questo metodo sceglierebbe sull'1X2)
        out.update({"attiva": False, "scala": 1.0, "suggerita": scala, "migliore": migliore, "errore_1": round(prove[1.0], 4), "errore_0": round(prove[0.0], 4), "errore_migliore": round(prove[migliore], 4)})
    with open(TARATURA, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    return out["scala"]


def aggiorna_prepartita(d):
    """Quote prese 15-70 minuti prima del calcio d'inizio: diventano la nuova base (piu precise di quelle del mattino)."""
    righe = []
    oggi = datetime.now(timezone.utc)
    for dd in (-1, 0):
        righe += jload(os.path.join(DATA, (oggi + timedelta(days=dd)).strftime("%Y-%m-%d"), "prepartita.json"), []) or []
    ultime = {}
    for r in righe:
        if r["id"] not in ultime or r["t"] > ultime[r["id"]]["t"]:
            ultime[r["id"]] = r
    n = 0
    for m in d.get("matches", []):
        r = ultime.get(m["id"])
        if not r or m.get("st") != "NS" or m.get("prepartita") == r["t"]:
            continue
        q = quote_di(r)
        if not q:
            continue
        m.setdefault("mk_mattino", m["mk"])
        m.setdefault("mo_mattino", m["mo"])
        m["mk"], m["mo"] = q["mk"], (q["mo"] if q["mo"] is not None else m["mo"])
        m["odds"], m["max"], m["nb"] = q["odds"], q["max"], q["nb"] or m.get("nb")
        m["xg_mercato"] = list(M.gol_attesi(m["mk"], m["mo"]))
        c = m.get("_ctx") or {}
        c["raccolte"] = {cc: v for cc, v in (("1", q["odds"]["1"]), ("X", q["odds"]["X"]), ("2", q["odds"]["2"]), ("O2.5", q["odds"]["O"]), ("U2.5", q["odds"]["U"])) if v}
        m["foto"] = r["t"]
        m["prepartita"] = r["t"]
        m.pop("_firma", None)
        n += 1
    return n


def applica_fattori(d):
    """Ricalcola gol attesi, mercati e consigli delle partite non iniziate con i fattori (per ora: notizie su indisponibili).
    Base = lettura delle quote; ogni fattore pesa secondo fattori.py e la somma per squadra ha un tetto. Restituisce quante partite cambiano."""
    notizie = jload(NOTIZIE, {}) or {}
    espn = (jload(ESPN, {}) or {}).get("squadre", {})
    voti = (jload(os.path.join(DATA, "espn", "voti.json"), {}) or {}).get("g", {})
    marc = d.get("scorers") or {}
    cambi = 0
    prossima = {}  # prima partita non iniziata di ogni squadra: e li che si sconta una squalifica
    for m in d.get("matches", []):
        if m.get("st") == "NS":
            for sq in (m["h"], m["a"]):
                if sq not in prossima or m["ko"] < prossima[sq]:
                    prossima[sq] = m["ko"]
    for m in d.get("matches", []):
        if m.get("st") != "NS" or "_ctx" not in m:
            continue
        c = m["_ctx"]
        lh0, la0 = m.get("xg_mercato") or m["xg"]
        try:
            f0 = m.get("foto", "2000-01-01")
            foto = datetime.fromisoformat(f0 if "T" in f0 else f0 + "T06:00:00+00:00")
            ko = datetime.fromisoformat(m["ko"])
        except ValueError:
            foto, ko = None, None
        tutti, tot, segnali, diffidati = [], [0.0, 0.0], [], []
        for lato, sq in enumerate((m["h"], m["a"])):
            items = (notizie.get(sq) or {}).get("items", [])
            es = espn.get(sq) or {}
            if es.get("rosa"):
                # voto medio e quota dei minuti della stagione (archivio dei voti AuraPitch): servono al peso difensivo
                giornate = max([voti[x["id"]]["min"] for x in es["rosa"] if x.get("id") in voti] or [0]) / 90 or 1
                for x in es["rosa"]:
                    v = voti.get(x.get("id"))
                    if v and v.get("nv", 0) >= 3:
                        x["vm"], x["minq"] = round(v["sv"] / v["nv"], 2), round(v["min"] / (90 * giornate), 3)
                gioc, gol = es["rosa"], sum(x["g"] for x in es["rosa"]) or None
                squal = ES.squalificati(es) if prossima.get(sq) == m["ko"] else []
                diffidati += [{"chi": p["n"], "lato": lato, "gialli": p["gialli"]} for p in ES.diffidati(es) if p["g"] + p["a"] > 0 or p["tit"] >= 3]
            else:
                gioc, gol, squal = [g for g in marc.get(m["lg"], []) if g["t"] == sq], (c.get("gol") or [None, None])[lato], []
            lista, t, sg = FT.fattori_squadra(sq, lato, items, gioc, gol, foto, ko, squal, prossima.get(sq) == m["ko"])
            tutti += lista
            tot[lato] = t
            segnali += [dict(x, lato=lato) for x in sg]
        for lato, cp in enumerate(c.get("coppa") or []):
            sq = m["h"] if lato == 0 else m["a"]
            if cp and cp.get("prima") is not None:
                segnali.append({"tipo": "coppa_prima", "lato": lato, "titolo": f"{sq} ha giocato in coppa {cp['prima']} giorni prima", "fonte": "", "link": "", "t": ""})
            if cp and cp.get("dopo") is not None:
                segnali.append({"tipo": "coppa_dopo", "lato": lato, "titolo": f"{sq} ha una partita di coppa tra {cp['dopo']} giorni (possibile turnover)", "fonte": "", "link": "", "t": ""})
        rr = c.get("riposo") or [None, None]
        if None not in rr and abs(rr[0] - rr[1]) >= 3:
            segnali.append({"tipo": "riposo", "lato": 0 if rr[0] > rr[1] else 1, "titolo": f"{abs(rr[0] - rr[1])} giorni di riposo in più", "fonte": "", "link": "", "t": ""})
        m["segnali"] = segnali[:6]
        m["diffidati"] = diffidati[:8]
        avv = [sum(f.get("delta_avv", 0) for f in tutti if f["lato"] == 1), sum(f.get("delta_avv", 0) for f in tutti if f["lato"] == 0)]
        sc = SCALA_FATTORI()  # ritaratura automatica: quanto pesano davvero le correzioni (1 = come da fattori.py)
        nuovo = [round(lh0 * (1 + sc * (tot[0] + avv[0])), 3), round(la0 * (1 + sc * (tot[1] + avv[1])), 3)]
        firma = zlib.crc32(json.dumps([tutti, nuovo, segnali, CB.versione()], sort_keys=True).encode())
        if firma == m.get("_firma"):
            continue
        m["_firma"] = firma
        cambi += 1
        m["fattori"] = [{k: f.get(k) for k in ("tipo", "chi", "lato", "quota", "affidabilita", "prezzo", "delta", "delta_avv", "titolo", "fonte", "link", "t", "tetto")} for f in tutti][:10]
        lh, la = nuovo
        m["xg"] = nuovo
        mercati = M.calcola_mercati(lh, la, m["h"], m["a"], c.get("raccolte") or {})
        corretta = any(f["delta"] or f.get("delta_avv") for f in tutti)
        pm = {x["c"]: x["p"] for x in mercati}
        m["_p0"] = [round(pm.get("1", 0), 4), round(pm.get("X", 0), 4), round(pm.get("2", 0), 4)] if corretta else m["mk"]  # prima delle correzioni imparate
        # correzioni imparate: con le notizie serve anche la lettura delle sole quote (per il peso della correzione IA)
        sole_quote = M.calcola_mercati(lh0, la0, m["h"], m["a"], c.get("raccolte") or {}) if corretta and (CB.modello().get("peso_ia")) else None
        CB.calibra(mercati, m["lg"], sole_quote)
        pm = {x["c"]: x["p"] for x in mercati}
        if corretta or CB.attivo():
            m["p"] = [round(pm.get("1", 0), 4), round(pm.get("X", 0), 4), round(pm.get("2", 0), 4)]
            m["po"] = round(pm.get("O2.5", 0.5), 4)
        else:
            m["p"], m["po"] = m["mk"], m["mo"]
        tip = M.scegli(mercati, m["h"], m["a"], c.get("sh"), c.get("sa"), {"pos_h": c.get("pos_h"), "pos_a": c.get("pos_a")}, m.get("nb"))
        righe = []
        for f in tutti:
            if not f["delta"] and not f.get("delta_avv"):
                continue
            sq = m["h"] if f["lato"] == 0 else m["a"]
            avv = m["a"] if f["lato"] == 0 else m["h"]
            eff = []
            if f["delta"]:
                eff.append(f"gol attesi di {sq} corretti del {str(round(f['delta'] * 100, 1)).replace('.', ',')}%")
            if f.get("delta_avv"):
                eff.append(f"gol attesi di {avv} +{str(round(f['delta_avv'] * 100, 1)).replace('.', ',')}% (peso in difesa)")
            testo = ", ".join(eff)
            righe.append(((f"Squalifica: {f['chi']} ({f['titolo'].split(': ', 1)[-1]}). " if f.get("fonte_tipo") == "cartellini" else
                          f"Notizia ({f['fonte'] or 'stampa'}): {f['chi']} {dict(squalifica='squalificato', infortunio='indisponibile', dubbio='in dubbio').get(f['tipo'], f['tipo'])}. ")
                         + testo[:1].upper() + testo[1:] + (" (in parte già nelle quote)." if f["prezzo"] < 1 else "."), (f["delta"] or 0) < 0))
        for v in tip.values():
            if not (c.get("sh") and c.get("sa")):
                v["perche"].append("Statistiche delle squadre non disponibili per questo campionato: il consiglio si basa solo sulle quote.")
            # le assenze che abbassano i gol attesi vanno tra le cose "da tenere d'occhio", non tra i motivi a favore
            v["perche"] += [t for t, neg in righe if not neg]
            v.setdefault("contro", []).extend(t for t, neg in righe if neg)
        assenti = {f["chi"] for f in tutti if (f.get("delta") or f.get("delta_avv")) and f.get("affidabilita", 0) >= 0.6}
        marc_l, marc_info = [], {}
        for lato, sq in enumerate((m["h"], m["a"])):
            es = espn.get(sq) or {}
            for x in M.marcatori(es.get("rosa") or [], lh if lato == 0 else la, assenti):
                cm = "MARC:" + x["n"]
                marc_l.append([cm, x["p"], round(max(1.01, 0.88 / x["p"]), 2), 0])
                marc_info[cm] = {"lato": lato, "g": x["g"], "pres": x["pres"], "tit": x["tit"]}
        extra = extra_di(m)
        m["markets"] = righe_mercati(mercati) + extra + marc_l
        m["marcatori"] = marc_info
        m["tip"] = tip
        ia = M.valutazioni(mercati, m["h"], m["a"], c.get("sh"), c.get("sa"), {"pos_h": c.get("pos_h"), "pos_a": c.get("pos_a")}, m.get("cart"), extra, marc_l, marc_info)
        m["ia"] = compatta_ia(ia, m["markets"])
    return cambi


def aggiorna_live():
    """Durante il giorno: aggiorna stato e risultato delle partite gia nel file dell'app."""
    d = jload(OUT)
    vic = jload(os.path.join(FD, "vicine.json"), {}) or {}
    if not d or not vic:
        return None
    per_id = {m.get("id"): m for m in vic.get("matches", [])}
    cambi = 0
    for m in d.get("matches", []):
        v = per_id.get(m.get("fd"))
        if not v:
            continue
        st, g = stato(v)
        res = None if g is None else (0 if g[0] > g[1] else 1 if g[0] == g[1] else 2)
        g1 = primo_tempo(v) if st in ("FT", "LIVE") else None
        if (st, g, g1) != (m.get("st"), m.get("g"), m.get("g1")):
            m["st"], m["g"], m["res"], m["g1"] = st, g, res, g1
            cambi += 1
    d["generato"] = datetime.now(timezone.utc).astimezone(ROME).strftime("%d/%m/%Y %H:%M")
    d["label"] = f"aggiornati il {d['generato'][:5]} alle {d['generato'][-5:]}"
    print(f"Partite aggiornate: {cambi}")
    npre = aggiorna_prepartita(d)
    nf = applica_fattori(d)
    na = aggiorna_arbitri(d)
    print(f"Quote pre-partita applicate: {npre}; partite ricalcolate: {nf}; arbitri aggiunti: {na}")
    return d if (cambi or nf or npre or na) else None


STORICO_IN = os.path.join(DATA, "consigli.json")
STORICO_OUT = os.path.join("app", "data", "storico.json")


def aggiorna_storico(d):
    """Salva i consigli IA prima del calcio d'inizio e li verifica a fine partita (storico trasparente)."""
    st = jload(STORICO_IN, {}) or {}
    for m in d.get("matches", []):
        tip = m.get("tip") or {}
        if not tip:
            continue
        r = st.get(m["id"])
        if r is None or (r.get("st") == "NS" and m["st"] == "NS"):
            # finche la partita non inizia si tiene l'ultima versione del consiglio (quote piu recenti)
            r = {"date": m["date"], "lg": m["lg"], "h": m["h"], "a": m["a"], "st": m["st"], "g": m.get("g"), "mk": m.get("mk"), "p": m.get("_p0") or m.get("p"),
                 "nf": sum(1 for f in m.get("fattori", []) if f.get("delta")), "sc": SCALA_FATTORI(), "ver": FT.VERSIONE, "segnali": [x["tipo"] for x in m.get("segnali", [])],
                 "tips": {k: {x: v[x] for x in ("c", "l", "p", "q", "qm")} for k, v in tip.items()}}
            st[m["id"]] = r
        if m["st"] in ("FT", "LIVE", "RINV"):
            r["st"], r["g"], r["g1"] = m["st"], m.get("g"), m.get("g1")
        if r["st"] == "FT" and r.get("g"):
            es = {k: esito_sicuro(v["c"], r["g"], r.get("g1")) for k, v in r["tips"].items()}
            r["esiti"] = {k: v for k, v in es.items() if v is not None}
    limite = (datetime.now(timezone.utc).astimezone(ROME).date() - timedelta(days=60)).isoformat()
    st = {k: v for k, v in st.items() if v["date"] >= limite}
    os.makedirs(os.path.dirname(STORICO_IN), exist_ok=True)
    with open(STORICO_IN, "w", encoding="utf-8") as f:
        json.dump(st, f, ensure_ascii=False, separators=(",", ":"))
    chiuse = sorted((v for v in st.values() if v.get("esiti")), key=lambda v: v["date"], reverse=True)
    trenta = (datetime.now(timezone.utc).astimezone(ROME).date() - timedelta(days=30)).isoformat()
    rec = [v for v in chiuse if v["date"] >= trenta]
    riass = {}
    for k in ("consiglio", "prudente", "coraggiosa"):
        z = [v for v in rec if k in v["esiti"]]
        vinti = sum(v["esiti"][k] for v in z)
        riass[k] = {"n": len(z), "vinti": vinti, "attesa": round(sum(v["tips"][k]["p"] for v in z), 1),
                    "resa": round(sum((v["tips"][k]["q"] - 1) if v["esiti"][k] else -1 for v in z), 2)}
    # taratura dei fattori: sulle partite in cui l'IA ha corretto le quote, chi ha sbagliato meno? (log-loss sull'esito 1X2)
    def ll(p, g):
        e = 0 if g[0] > g[1] else 1 if g[0] == g[1] else 2
        return -math.log(max(1e-9, p[e]))
    corr = [v for v in chiuse if v.get("nf") and v.get("mk") and v.get("p") and v.get("g")]
    taratura = {"versione": FT.VERSIONE, "n": len(corr), "pesi": {"sostituto": FT.SOSTITUTO, "affidabilita": FT.AFFIDABILITA, "gia_nelle_quote": FT.GIA_NELLE_QUOTE, "tetto": FT.TETTO}}
    if corr:
        taratura["errore_quote"] = round(sum(ll(v["mk"], v["g"]) for v in corr) / len(corr), 4)
        taratura["errore_ia"] = round(sum(ll(v["p"], v["g"]) for v in corr) / len(corr), 4)
    taratura["scala"] = ritara_fattori(corr, ll)
    out = {"generato": datetime.now(timezone.utc).astimezone(ROME).strftime("%d/%m/%Y %H:%M"), "giorni": 30, "riass": riass, "taratura": taratura,
           "lista": [{"date": v["date"], "lg": v["lg"], "h": v["h"], "a": v["a"], "g": v["g"], "tips": v["tips"], "esiti": v["esiti"]} for v in rec[:60]]}
    with open(STORICO_OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print(f"Storico consigli: {len(chiuse)} partite verificate, {len(st)} salvate")


DIARIO = os.path.join(DATA, "diario")
CHIAVI_DIARIO = ("1", "X", "2", "O2.5", "GG")


def aggiorna_diario(d):
    """Diario di ogni previsione (tutte le partite, non solo i consigli): gol attesi dell'IA e delle sole quote, probabilita
    mostrate nell'app, quote e consigli del mattino (prima volta vista) e di chiusura (ultima prima del fischio), risultato.
    E' la materia prima con cui strumenti/impara.py migliora l'algoritmo ogni mattina. Un file per giorno di partita."""
    per_giorno = {}
    for m in d.get("matches", []):
        per_giorno.setdefault(m["date"], []).append(m)
    ver, ora = CB.versione(), datetime.now(timezone.utc).isoformat(timespec="minutes")
    nuove = 0
    for giorno, ms in per_giorno.items():
        path = os.path.join(DIARIO, giorno + ".json")
        vecchio = jload(path, {}) or {}
        dd = json.loads(json.dumps(vecchio))
        for m in ms:
            r = dd.get(m["id"])
            if m.get("st") == "NS" and m.get("xg") and m.get("xg_mercato") and m.get("mk"):
                od = m.get("odds") or {}
                q = {c: od[x] for c, x in (("1", "1"), ("X", "X"), ("2", "2"), ("O2.5", "O"), ("U2.5", "U")) if od.get(x)}
                pr = {x[0]: x[1] for x in m.get("markets", [])}
                tips = {k: [v["c"], v.get("q"), 1 if v.get("qm") else 0] for k, v in (m.get("tip") or {}).items() if isinstance(v, dict)}
                n = {"lg": m["lg"], "h": m["h"], "a": m["a"], "date": m["date"], "ko": m["ko"], "xg": m["xg"], "xm": m["xg_mercato"], "mk": m["mk"],
                     "mo": m.get("mo") if od.get("O") and od.get("U") else None, "nf": sum(1 for f in m.get("fattori") or [] if f.get("delta") or f.get("delta_avv")),
                     "ver": ver, "pc": {c: pr[c] for c in CHIAVI_DIARIO if c in pr}, "q": q, "tips": tips, "st": "NS"}
                if r is None:
                    n.update({"t0": ora, "mk0": n["mk"], "mo0": n["mo"], "xm0": n["xm"], "pc0": n["pc"], "q0": q, "tips0": tips})
                    nuove += 1
                else:
                    n.update({k: r[k] for k in ("t0", "mk0", "mo0", "xm0", "pc0", "q0", "tips0") if k in r})
                dd[m["id"]] = n
            elif r is not None and m.get("st") in ("FT", "LIVE", "RINV"):
                r["st"], r["g"], r["g1"] = m["st"], m.get("g"), m.get("g1")
        if dd != vecchio:
            os.makedirs(DIARIO, exist_ok=True)
            with open(path, "w", encoding="utf-8") as f:  # una partita per riga: git conserva solo le righe cambiate
                f.write("{\n" + ",\n".join(json.dumps(k) + ":" + json.dumps(dd[k], ensure_ascii=False, separators=(",", ":")) for k in sorted(dd)) + "\n}\n")
    print(f"Diario: {nuove} nuove previsioni")


def main():
    if "--panchine" in sys.argv:  # solo allenatori e termometro (workflow "Allenatori", ogni mattina)
        scrivi_panchine(jload(OUT, {}) or {})
        return
    if "--live" in sys.argv:
        d = aggiorna_live()
        if d is None:
            print("Nessun cambiamento.")
            return
    else:
        d = genera()
        if not d["matches"]:
            print("Nessuna partita con quote nei prossimi giorni: il file dell'app non viene toccato.")
            return
        print(f"Partite: {len(d['matches'])}; campionati: {[l['name'] for l in d['leagues']]}; FREE: {[m['h'] + '-' + m['a'] for m in d['matches'] if m['free']]}")
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False, separators=(",", ":"))
    scrivi_stato(d)
    scrivi_lista(d)
    aggiorna_storico(d)
    aggiorna_diario(d)


STATO_OUT = os.path.join("app", "data", "stato.json")
# l'app scarica prima una lista leggera; i dettagli di una partita arrivano quando la apri, i mercati quando apri la Schedina
DETTAGLI = ("markets", "ia", "cart", "curiosita", "xgf", "segnali", "attese", "prec", "forma", "ctx", "h2h", "last5", "odds", "max", "elo", "foto",
            "arbitro", "xg_mercato", "fattori")
FATTORI_LISTA = ("chi", "lato", "tipo", "fonte", "delta")  # nella lista resta un riassunto delle assenze (pagina squadra)
NON_SERVONO = ("_ctx", "_firma", "_p0")


def scrivi_lista(d):
    cartella = os.path.join("app", "data", "m")
    os.makedirs(cartella, exist_ok=True)
    lista, mercati, file_ok = [], {}, set()
    for m in d.get("matches", []):
        det = {k: m[k] for k in DETTAGLI if k in m}
        det["tip"] = m.get("tip")
        nome = re.sub(r"[^A-Za-z0-9_-]", "_", str(m["id"])) + ".json"
        file_ok.add(nome)
        with open(os.path.join(cartella, nome), "w", encoding="utf-8") as f:
            json.dump(det, f, ensure_ascii=False, separators=(",", ":"))
        if m.get("markets"):
            mercati.setdefault(m["lg"], {})[m["id"]] = m["markets"]
        leggera = {k: v for k, v in m.items() if k not in DETTAGLI and k not in NON_SERVONO}
        if m.get("fattori"):
            leggera["fattori"] = [{k: f.get(k) for k in FATTORI_LISTA} for f in m["fattori"]]
        if isinstance(m.get("tip"), dict):  # nel consiglio restano esito, probabilità e quota; le motivazioni sono nei dettagli
            leggera["tip"] = {k: {c: x for c, x in t.items() if c not in ("perche", "contro")} if isinstance(t, dict) else t for k, t in m["tip"].items()}
        lista.append(leggera)
    for f in os.listdir(cartella):  # via i dettagli delle partite uscite dal file
        if f.endswith(".json") and f not in file_ok:
            os.remove(os.path.join(cartella, f))
    with open(os.path.join("app", "data", "lista.json"), "w", encoding="utf-8") as f:
        json.dump({**{k: v for k, v in d.items() if k != "matches"}, "matches": lista, "leggera": True}, f, ensure_ascii=False, separators=(",", ":"))
    # mercati per campionato: la Schedina scarica solo quelli dei campionati scelti
    cm = os.path.join("app", "data", "mercati")
    os.makedirs(cm, exist_ok=True)
    for f in os.listdir(cm):
        if f.endswith(".json") and f[:-5] not in mercati:
            os.remove(os.path.join(cm, f))
    for k, v in mercati.items():
        with open(os.path.join(cm, k + ".json"), "w", encoding="utf-8") as f:
            json.dump(v, f, ensure_ascii=False, separators=(",", ":"))
    with open(os.path.join("app", "data", "mercati.json"), "w", encoding="utf-8") as f:  # tutto insieme: per le versioni vecchie dell'app
        json.dump({i: r for v in mercati.values() for i, r in v.items()}, f, ensure_ascii=False, separators=(",", ":"))


def scrivi_stato(d):
    """Versione ridotta del file dell'app per il servizio notifiche e la gara (pochi KB: poca CPU sul piano gratuito)."""
    righe = []
    for m in d.get("matches", []):
        t = (m.get("tip") or {}).get("consiglio")
        righe.append({"id": m["id"], "st": m.get("st"), "ko": m.get("ko"), "date": m.get("date"), "g": m.get("g"), "h": m["h"], "a": m["a"],
                      "p": m.get("p"), "mk": m.get("mk"),
                      "tip": {"consiglio": {"l": t.get("l"), "p": t.get("p")}} if t else None,
                      "marcatori": {k: {"lato": v["lato"], "g": v["g"]} for k, v in (m.get("marcatori") or {}).items() if v.get("g", 0) >= 2}})
    with open(STATO_OUT, "w", encoding="utf-8") as f:
        json.dump({"matches": righe}, f, ensure_ascii=False, separators=(",", ":"))


if __name__ == "__main__":
    main()
