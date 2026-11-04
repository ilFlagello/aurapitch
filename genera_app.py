"""AuraPitch - genera i dati dell'app (app/data/giornata.json) dai dati raccolti.

  python3 genera_app.py           giro completo (mattino): partite da ieri a +3 giorni, quote medie, letture,
                                  classifiche, ultime 5, precedenti
  python3 genera_app.py --live    aggiorna solo stato e risultato delle partite (durante il giorno)

Fonti: data/AAAA-MM-GG/partite.csv (quote medie, The Odds API) e data/fd/*.json (football-data.org,
risultati di Serie B da The Odds API). Usa solo la libreria standard di Python.
"""
import csv
import glob
import gzip
import math
import json
import os
import re
import sys
import unicodedata
import zlib

import calibrazione as CB
import onesta as ON
import specialisti as SP
import cartellini as CK
import espn_dati as ES
import fattori as FT
import giocatori as GC
import mercati as M
import vantaggio as VM
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
    # dalla scansione del 29/10/2026 (quote gratuite ESPN)
    ("E2", "League One", "Inghilterra", "en", None, "League One"),
    ("E3", "League Two", "Inghilterra", "en", None, "League Two"),
    ("EC", "National League", "Inghilterra", "en", None, "National League"),
    ("SC1", "Scottish Championship", "Scozia", "sc", None, "Scottish Championship"),
    ("N2", "Eerste Divisie", "Olanda", "nl", None, "Eerste Divisie"),
    ("KNV", "KNVB Beker", "Olanda", "nl", None, "KNVB Beker"),
    ("BR2", "Série B Brasile", "Brasile", "br", None, "Série B Brasile"),
    ("CDB", "Copa do Brasil", "Brasile", "br", None, "Copa do Brasil"),
    ("AR2", "Primera Nacional", "Argentina", "ar", None, "Primera Nacional"),
    ("MX2", "Liga de Expansión", "Messico", "mx", None, "Liga de Expansión"),
    ("USL", "USL Championship", "Stati Uniti", "us", None, "USL Championship"),
    ("ACL2", "AFC Champions League Two", "Asia", "as", None, "AFC Champions League Two"),
    ("WSL", "Women's Super League", "Inghilterra", "en", None, "Women's Super League"),
    ("AUW", "A-League Women", "Australia", "au", None, "A-League Women"),
    ("UWCL", "Champions League femminile", "Europa", "eu", None, "Champions League femminile"),
    # dalla scansione del 02/11/2026
    ("CN1", "Chinese Super League", "Cina", "cn", None, "Chinese Super League"),
    ("AR3", "Primera B Metropolitana", "Argentina", "ar", None, "Primera B Metropolitana"),
    ("CR1", "Primera División", "Costa Rica", "cr", None, "Primera División Costa Rica"),
]
PRIORITA = ["NL", "CL", "I1", "EL", "CI", "SCI", "E0", "SP1", "D1", "F1", "ECL", "I2", "FAC", "CDR", "DFB", "ELC", "CDF", "P1", "N1", "E1", "D2", "SP2", "T1", "B1", "SC0", "BR1", "AR1", "MLS", "MX1", "A1", "G1", "DK1", "J1", "SA1", "LIB", "SUD", "F2", "NO1", "SE1", "COL1", "CHI1", "AU1", "UY1", "PY1", "EC1", "PE1", "ACL", "AMI", "EQ", "WCQ", "E2", "E3", "EC", "SC1", "N2", "KNV", "BR2", "CDB", "AR2", "MX2", "USL", "ACL2", "WSL", "AUW", "UWCL", "CN1", "CR1", "AR3"]
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

def indice_scontri():
    """Precedenti tra squadre dall'archivio storico (30 campionati) e dalla stagione in corso (CSV di Football-Data)."""
    righe = []

    def aggiungi(r):
        try:
            d = datetime.strptime(r["Date"], "%d/%m/%Y" if len(r["Date"]) > 8 else "%d/%m/%y").replace(tzinfo=timezone.utc)
            st = [int(r["HST"]), int(r["AST"])] if r.get("HST") not in (None, "") and r.get("AST") not in (None, "") else [None, None]
            righe.append({"t": d, "h": r["HomeTeam"], "a": r["AwayTeam"], "gh": int(r["FTHG"]), "ga": int(r["FTAG"]), "lg": r.get("Div"), "sh": st[0], "sa": st[1]})
        except (ValueError, KeyError, TypeError):
            pass
    try:
        with gzip.open(os.path.join("storico", "fd_partite.csv.gz"), "rt", encoding="utf-8") as f:
            for r in csv.DictReader(f):
                if r.get("Season", "") >= "1920":
                    aggiungi(r)
    except OSError:
        pass
    for p in glob.glob(os.path.join(FD, "stagione_*.csv")):
        try:
            with open(p, encoding="utf-8-sig", errors="replace") as f:
                for r in csv.DictReader(f):
                    aggiungi(r)
        except OSError:
            pass
    vista, uniche = set(), []
    for r in sorted(righe, key=lambda r: r["t"]):  # archivio e stagione in corso possono avere la stessa partita
        k = (r["t"].date(), SP.piega(r["h"]), SP.piega(r["a"]))
        if k not in vista:
            vista.add(k)
            uniche.append(r)
    mot = SP.Motore()  # modello statistico indipendente: stato aggiornato a oggi
    for r in uniche:
        mot.aggiorna(r["h"], r["a"], r["lg"], r["gh"], r["ga"], r["sh"], r["sa"], r["t"])
    return SP.indice_diretti(uniche), mot


def nota_scontri(dir_, tip, h, a):
    """Riga "da tenere d'occhio" quando i precedenti dicono il contrario del consiglio (solo informazione: il peso lo decide l'integratore)."""
    d6 = dir_[-6:]
    if len(d6) < 3 or not tip:
        return None
    v = sum(1 for z in d6 if z["gf"] > z["gs"]); n = sum(1 for z in d6 if z["gf"] == z["gs"]); p = len(d6) - v - n
    c = str(tip.get("c", ""))
    casa = c in ("1", "1X") or c.startswith("1+") or c.startswith("1 ")
    ospite = c in ("2", "X2") or c.startswith("2+") or c.startswith("2 ")
    if casa and v <= 1 and p >= 2:
        return f"Negli ultimi {len(d6)} scontri diretti {h} ha vinto {v} volt{'a' if v == 1 else 'e'}, {a} {p} ({n} pareggi)."
    if ospite and p <= 1 and v >= 2:
        return f"Negli ultimi {len(d6)} scontri diretti {a} ha vinto {p} volt{'a' if p == 1 else 'e'}, {h} {v} ({n} pareggi)."
    return None


def genera():
    now = datetime.now(timezone.utc)
    oggi = now.astimezone(ROME).date()
    giorni = [oggi + timedelta(days=d) for d in range(-1, 6)]
    quote = carica_quote()
    fdp, classifiche = carica_fd()
    per_team = storico(fdp)
    scontri, motore = indice_scontri()
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
        g1_es = None  # primo tempo dal calendario ESPN (campionati senza football-data)
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
            e = ES.evento_vicino((esd.get("risultati_lega") or {}).get(k), h, a, r["_t"])  # campionati e coppe solo ESPN: risultati da ESPN
            if e:
                st_e, g_e, _ = ES.stato_evento(e)
                if st_e != "NS":
                    st, g = st_e, g_e
                    g1_es = e.get("g1") if st_e == "FT" else None
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
        xg_quote = [lh, la]
        # specialisti (forma, riposo, casa/trasferta, tendenza gol) pesati dall'integratore imparato ogni mattina: corregge le quote
        # prima dei gol attesi; se l'integratore e spento per questo gruppo di campionati non cambia nulla
        dir_ = SP.diretti_di(scontri, h, a)
        mot_f = motore.caratteristiche(SP.risolvi(h, scontri), SP.risolvi(a, scontri), k, t0)
        sp = SP.segnali(per_team.get(hid, []), per_team.get(aid, []), t0, dir_, mot_f) if (hid or aid or dir_ or any(v is not None for v in mot_f)) else None
        mkc, moc = SP.correggi(q["mk"], q["mo"], sp, k, (CB.modello() or {}).get("integratore"))
        if mkc is not q["mk"]:
            lh, la = M.gol_attesi(mkc, moc)
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
        for v in tip.values():  # precedenti contrari al consiglio: lo diciamo
            nota = nota_scontri(dir_, v, h, a)
            if nota and isinstance(v, dict):
                v.setdefault("contro", []).append(nota)
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
            "h": h, "a": a, "st": st, "g": g, "g1": primo_tempo(m_fd) if m_fd and st in ("FT", "LIVE") else g1_es, "res": (None if g is None else (0 if g[0] > g[1] else 1 if g[0] == g[1] else 2)), "free": False,
            "p": [pc["1"], pc["X"], pc["2"]] if CB.attivo() and all(c in pc for c in "1X2") else q["mk"], "_p0": q["mk"], "mk": q["mk"],
            "po": pc.get("O2.5", q["mo"]) if CB.attivo() and q["mo"] is not None else (q["mo"] if q["mo"] is not None else 0.5), "mo": q["mo"] if q["mo"] is not None else 0.5,
            "odds": q["odds"], "max": q["max"], "nb": q["nb"], "xg": [lh, la], "elo": [None, None],
            "forma": [testo_forma(l5[0]), testo_forma(l5[1])] if (code or hid or aid) else [{"tone": "ok", "text": "Forma non disponibile per questo campionato nei dati gratuiti."}] * 2,
            "attese": [testo_classifica(tabs, hid), testo_classifica(tabs, aid)] if tabs else [{"tone": "ok", "text": "Classifica non disponibile nei dati gratuiti."}] * 2,
            "prec": prec, "ctx": ctx, "flags": [], "last5": l5, "h2h": h2h, "stats": [],
            "markets": righe_mercati(mercati) + extra, "tip": tip,
            "xg_mercato": xg_quote, "xg_base": [lh, la], "sp": sp, "fattori": [], "foto": r["_foto"], "cart": cart, "arbitro": arbitro,
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
    out["senza_quote"], leghe_sq, cl_sq = partite_senza_quote(esd, giorni)
    out["leagues"] += [l for l in leghe_sq if l["k"] not in presenti]
    for k, v in cl_sq.items():
        out["standings"].setdefault(k, v)
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
    # partite gia contate nella classifica scaricata ora: l'app aggiunge da sola solo i risultati arrivati dopo (in diretta e finali)
    for k, tabs in out["standings"].items():
        tabs["inclusi"] = [m["id"] for m in out["matches"] + out["senza_quote"] if m["lg"] == k and m.get("st") == "FT"]
    etich = {-1: "Ieri", 0: "Oggi", 1: "Domani"}
    for d in giorni:
        if any(m["date"] == d.isoformat() for m in out["matches"] + out["senza_quote"]):
            delta = (d - oggi).days
            out["days"].append({"k": d.isoformat(), "label": etich.get(delta, f"{GG[d.weekday()]} {d.day}")})
    out["today"] = oggi.isoformat()
    scrivi_panchine(out)
    out["label"] = f"aggiornati il {out['generato'][:5]} alle {out['generato'][-5:]}"
    squadre = {m["h"] for m in out["matches"]} | {m["a"] for m in out["matches"]}
    for v in out["standings"].values():
        squadre |= {r["team"] for r in v["generale"]}
    out["teams"] = sorted(squadre)
    try:
        scrivi_forza(out, scontri, motore)
    except Exception as e:  # noqa: BLE001 - la scheda squadra non deve fermare il giro
        print(f"Forza delle squadre: non scritta ({type(e).__name__}: {e})")
    aggiorna_prepartita(out)
    applica_fattori(out)
    return out


FORZA_OUT = os.path.join("app", "data", "forza.json")


def scrivi_forza(out, scontri, motore, path=None):
    """Forza Elo dell'algoritmo (specialista "elo", solo risultati) per le squadre dell'app, con il campionato: serve alla
    scheda squadra per la difficolta delle prossime partite quando l'IA non ha ancora le probabilita (oltre i 5 giorni).
    Solo squadre con almeno 5 partite nell'archivio; il confronto vale solo tra squadre dello stesso campionato."""
    lg_di = {}
    for k, S in (out.get("standings") or {}).items():
        if k in ES.COPPE or k in ES.NAZIONALI:
            continue
        for r in S.get("generale") or []:
            lg_di.setdefault(r["team"], k)
    for m in out.get("matches") or []:
        if m["lg"] not in ES.COPPE and m["lg"] not in ES.NAZIONALI:
            lg_di.setdefault(m["h"], m["lg"])
            lg_di.setdefault(m["a"], m["lg"])
    forza = {}
    for nome, k in lg_di.items():
        chiave = SP.piega(SP.risolvi(nome, scontri))
        if motore.n.get(chiave, 0) >= 5 and chiave in motore.elo:
            forza[nome] = [round(motore.elo[chiave]), k]
    path = path or FORZA_OUT
    with open(path, "w", encoding="utf-8") as f:
        json.dump({"agg": out.get("generato"), "casa": 60, "t": forza}, f, ensure_ascii=False, separators=(",", ":"))
    print(f"Forza delle squadre: {len(forza)} squadre con punteggio Elo su {len(lg_di)}")
    return forza


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
        mkc, moc = SP.correggi(m["mk"], m["mo"], m.get("sp"), m["lg"], (CB.modello() or {}).get("integratore"))
        m["xg_base"] = list(M.gol_attesi(mkc, moc)) if mkc is not m["mk"] else m["xg_mercato"]
        c = m.get("_ctx") or {}
        c["raccolte"] = {cc: v for cc, v in (("1", q["odds"]["1"]), ("X", q["odds"]["X"]), ("2", q["odds"]["2"]), ("O2.5", q["odds"]["O"]), ("U2.5", q["odds"]["U"])) if v}
        m["foto"] = r["t"]
        m["prepartita"] = r["t"]
        m.pop("_firma", None)
        n += 1
    return n


ORDINE_RUOLI = {"G": 0, "D": 1, "M": 2, "F": 3}


def formazione_probabile(es, assenti, prossima):
    """Formazione probabile secondo l'IA: chi parte titolare piu spesso in stagione, tolti indisponibili (notizie affidabili)
    e squalificati per la prossima partita. Un portiere e i dieci giocatori di movimento con piu partenze da titolare;
    per ognuno la sicurezza = quota di partite giocate da titolare. Restituisce None se i dati non bastano."""
    rosa = es.get("rosa") or []
    giocate = len(es.get("risultati") or []) or max([x.get("pres", 0) for x in rosa] or [0])
    if giocate < 3 or len(rosa) < 14:
        return None
    fuori = set(assenti) | ({x["giocatore"]["n"] for x in ES.squalificati(es)} if prossima else set())
    ok = [x for x in rosa if x.get("n") not in fuori and x.get("last") not in fuori]
    por = sorted([x for x in ok if x.get("pos") == "G"], key=lambda x: (x.get("tit", 0), x.get("pres", 0)), reverse=True)[:1]
    mov = sorted([x for x in ok if x.get("pos") in ("D", "M", "F")], key=lambda x: (x.get("tit", 0), x.get("pres", 0)), reverse=True)[:10]
    xi = por + mov
    if len(xi) < 11 or sum(x.get("tit", 0) for x in xi) < giocate * 6:  # stagione troppo all'inizio o rosa poco nota
        return None
    xi.sort(key=lambda x: (ORDINE_RUOLI.get(x.get("pos"), 9), -x.get("tit", 0)))
    return [{"n": x.get("last") or x["n"], "id": x.get("id"), "r": x.get("pos"), "c": round(min(0.97, x.get("tit", 0) / giocate), 2)} for x in xi]


def aggiungi_movimenti(d):
    """Radar dei movimenti: per ogni partita non iniziata confronta le quote 1X2 di adesso con quelle viste la prima volta
    (dal diario nella cassaforte). Se una probabilita si e spostata di almeno 3 punti, la partita entra nel Radar, con il
    possibile motivo (notizia o assenza registrata dall'IA sulla squadra che si e indebolita)."""
    giorni = {}
    n = 0
    for m in d.get("matches", []):
        m.pop("mov", None)
        if m.get("st") != "NS" or not m.get("odds"):
            continue
        if m["date"] not in giorni:
            giorni[m["date"]] = jload(os.path.join(DIARIO, m["date"] + ".json"), {}) or {}
        r = giorni[m["date"]].get(m["id"])
        if not r or not r.get("mk0") or not r.get("q0"):
            continue
        dp = [round(a - b, 3) for a, b in zip(m["mk"], r["mk0"])]
        if max(abs(x) for x in dp) < 0.03:
            continue
        q0 = [r["q0"].get(c) for c in ("1", "X", "2")]
        q1 = [m["odds"].get(c) for c in ("1", "X", "2")]
        if None in q0 or None in q1:
            continue
        lato = 0 if dp[0] < dp[2] else 1  # squadra che si e indebolita (la sua probabilita e scesa di piu)
        motivo = next((f for f in (m.get("fattori") or []) if f.get("lato") == lato and (f.get("delta") or 0) < 0), None) \
            or next((f for f in (m.get("fattori") or []) if f.get("lato") == 1 - lato and (f.get("delta_avv") or 0) > 0), None)
        perche = None
        if motivo:
            sq = m["h"] if motivo["lato"] == 0 else m["a"]
            perche = f"{motivo['chi']} ({sq}): " + dict(squalifica="squalificato", infortunio="indisponibile", dubbio="in dubbio", panchina="in panchina", assente="fuori dai convocati").get(motivo.get("tipo"), motivo.get("tipo") or "notizia")
        m["mov"] = {"da": q0, "a": q1, "dp": dp, "dal": r.get("t0"), "perche": perche}
        n += 1
    print(f"Radar dei movimenti: {n} partite con quote in movimento")


def notizie_infortuni():
    """Infortunati e squalificati da API-Football (data/infortuni.json) trasformati in "notizie" per i fattori:
    stesso calcolo delle notizie dei giornali (peso del giocatore, affidabilita, parte gia nelle quote secondo l'ora in cui e comparso)."""
    d = jload(os.path.join(DATA, "infortuni.json"), {}) or {}
    per = {}
    for sq, xs in (d.get("squadre") or {}).items():
        voci = []
        for x in xs:
            tipo, mot = str(x.get("tipo", "")).lower(), str(x.get("motivo", ""))
            if "question" in tipo or "doubt" in mot.lower():
                parola = "doubtful"
            elif "suspen" in mot.lower() or "card" in mot.lower():
                parola = "suspended"
            else:
                parola = "injured, ruled out"
            voci.append({"t": x.get("dal") or d.get("aggiornato"), "titolo": f"{x['n']} {parola} ({mot})", "fonte": "API-Football", "link": ""})
        per[SP.piega(sq)] = voci
    return per


def infortuni_di(per, squadra):
    p = SP.piega(squadra)
    if p in per:
        return per[p]
    a = SP.ALIAS.get(p)
    if a in per:
        return per[a]
    inv = [k for k in per if SP.ALIAS.get(k) == p]  # stesso alias dall'altra parte ("manchester united" -> "man united")
    if len(inv) == 1:
        return per[inv[0]]
    tp = set(p.split())
    cand = [k for k in per if k and (set(k.split()) <= tp or tp <= set(k.split()))]
    return per[cand[0]] if len(cand) == 1 else []


def applica_fattori(d):
    """Ricalcola gol attesi, mercati e consigli delle partite non iniziate con i fattori (per ora: notizie su indisponibili).
    Base = lettura delle quote; ogni fattore pesa secondo fattori.py e la somma per squadra ha un tetto. Restituisce quante partite cambiano."""
    notizie = jload(NOTIZIE, {}) or {}
    infortuni = notizie_infortuni()
    espn = (jload(ESPN, {}) or {}).get("squadre", {})
    voti = (jload(os.path.join(DATA, "espn", "voti.json"), {}) or {}).get("g", {})
    # formazioni ufficiali (espn_dati.giro_formazioni, ogni 10 minuti): entrano nei fattori prima del blocco del consiglio
    formazioni = (jload(os.path.join(DATA, "espn", "formazioni.json"), {}) or {}).get("partite", {})
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
        lh0, la0 = m.get("xg_base") or m.get("xg_mercato") or m["xg"]  # base = quote corrette dall'integratore (se acceso)
        try:
            f0 = m.get("foto", "2000-01-01")
            foto = datetime.fromisoformat(f0 if "T" in f0 else f0 + "T06:00:00+00:00")
            ko = datetime.fromisoformat(m["ko"])
        except ValueError:
            foto, ko = None, None
        tutti, tot, segnali, diffidati = [], [0.0, 0.0], [], []
        fm = formazioni.get(m["id"]) or {}
        uff = [dict(fm[k], t=fm.get("t")) if fm.get(k) else None for k in ("h", "a")]
        for lato, sq in enumerate((m["h"], m["a"])):
            items = (notizie.get(sq) or {}).get("items", []) + infortuni_di(infortuni, sq)
            es = espn.get(sq) or {}
            if es.get("rosa"):
                # voto medio e quota dei minuti della stagione (archivio dei voti AuraPitch): servono al peso difensivo
                giornate = max([voti[x["id"]]["min"] for x in es["rosa"] if x.get("id") in voti] or [0]) / 90 or 1
                for x in es["rosa"]:
                    v = voti.get(x.get("id"))
                    if v and v.get("nv", 0) >= 3:
                        x["vm"], x["minq"] = round(v["sv"] / v["nv"], 2), round(v["min"] / (90 * giornate), 3)
                    if v:  # per gli specialisti dei giocatori: ultime 5 partite, rigori tirati, minuti in stagione
                        x["u5"], x["rig"], x["min_v"] = v.get("u5"), v.get("rig", 0), v.get("min")
                gioc, gol = es["rosa"], sum(x["g"] for x in es["rosa"]) or None
                squal = ES.squalificati(es) if prossima.get(sq) == m["ko"] else []
                diffidati += [{"chi": p["n"], "lato": lato, "gialli": p["gialli"]} for p in ES.diffidati(es) if p["g"] + p["a"] > 0 or p["tit"] >= 3]
            else:
                gioc, gol, squal = [g for g in marc.get(m["lg"], []) if g["t"] == sq], (c.get("gol") or [None, None])[lato], []
            lista, t, sg = FT.fattori_squadra(sq, lato, items, gioc, gol, foto, ko, squal, prossima.get(sq) == m["ko"], formazione=uff[lato])
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
        prima_p = m.get("p")  # probabilita e consiglio prima di questo ricalcolo (per l'effetto delle formazioni ufficiali)
        prima_tip = ((m.get("tip") or {}).get("consiglio") or {}) if isinstance(m.get("tip"), dict) else {}
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
        # "perche e cambiato": chi manca (formazioni ufficiali, notizie) e di quanto si spostano le probabilita rispetto alle sole quote
        cambio = perche_cambiato(m, tutti, sole_quote or (M.calcola_mercati(lh0, la0, m["h"], m["a"], c.get("raccolte") or {}) if corretta else None), m["_p0"], any(uff))
        if cambio:
            m["cambio"] = cambio
        else:
            m.pop("cambio", None)
        # effetto delle formazioni ufficiali sul consiglio (per la notifica "Formazioni ufficiali"): prima e dopo la loro uscita
        if any(uff):
            eff = m.get("uff_eff") or {"da": prima_p, "tip_da": prima_tip.get("l")}
            cons = tip.get("consiglio") if isinstance(tip.get("consiglio"), dict) else {}
            eff.update({"a": m["p"], "tip_a": cons.get("l"), "pa": cons.get("p")})
            m["uff_eff"] = eff
        else:
            m.pop("uff_eff", None)
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
            righe.append(((f"{f['titolo']}. " if f.get("fonte_tipo") == "formazione" else f"Squalifica: {f['chi']} ({f['titolo'].split(': ', 1)[-1]}). " if f.get("fonte_tipo") == "cartellini" else
                          f"Notizia ({f['fonte'] or 'stampa'}): {f['chi']} {dict(squalifica='squalificato', infortunio='indisponibile', dubbio='in dubbio').get(f['tipo'], f['tipo'])}. ")
                         + testo[:1].upper() + testo[1:] + (" (in parte già nelle quote)." if f["prezzo"] < 1 else "."), (f["delta"] or 0) < 0))
        for v in tip.values():
            if not (c.get("sh") and c.get("sa")):
                v["perche"].append("Statistiche delle squadre non disponibili per questo campionato: il consiglio si basa solo sulle quote.")
            # le assenze che abbassano i gol attesi vanno tra le cose "da tenere d'occhio", non tra i motivi a favore
            v["perche"] += [t for t, neg in righe if not neg]
            v.setdefault("contro", []).extend(t for t, neg in righe if neg)
        # chi parte dalla panchina non e assente: per marcatori, assist e ammoniti conta come "gioca un terzo della partita"
        assenti = {f["chi"] for f in tutti if (f.get("delta") or f.get("delta_avv")) and f.get("affidabilita", 0) >= 0.6 and f.get("tipo") != "panchina"}
        if any(uff):
            m["uff"] = [bool(x) for x in uff]
        else:
            m.pop("uff", None)
        m["formazione"] = [formazione_probabile(espn.get(sq) or {}, assenti, prossima.get(sq) == m["ko"]) for sq in (m["h"], m["a"])]
        if not any(m["formazione"]):
            m.pop("formazione", None)
        # scommesse sui giocatori: probabilita di base (mercati.py) poi agenti sui giocatori (giocatori.py): specialisti calcolati
        # sempre e salvati nel diario; la taratura del verificatore cambia la probabilita solo quando ha dimostrato di migliorarla
        marc_l, marc_info, pg = [], {}, {}
        kk = (m.get("cart") or {}).get("K") or {}
        arb_k = (((m.get("arbitro") or {}).get("ratio") or {}).get("K"))
        for lato, sq in enumerate((m["h"], m["a"])):
            es = espn.get(sq) or {}
            rosa = es.get("rosa") or []
            per_nome = {x["n"]: x for x in rosa}
            presenza = {}
            if uff[lato]:
                for x in rosa:
                    st_ = FT._da_formazione(x, uff[lato])
                    if st_ in ("titolare", "panchina"):
                        presenza[x["n"]] = st_
            rig = [x.get("rig") for x in rosa if x.get("u5") is not None]
            k_sq = (kk.get("squadre") or [None, None])[lato]
            ctx = {"lam": lh if lato == 0 else la, "k": k_sq, "k_lega": (kk.get("media_lega") or 0) / 2 or None, "arb": arb_k,
                   "rig_max": max([r or 0 for r in rig]) if rig else None}

            def aggiungi(pre, x, info):
                cm = pre + x["n"]
                sg_ = GC.segnali(pre[:-1], per_nome.get(x["n"]) or {}, dict(ctx, stato=presenza.get(x["n"])))
                p = GC.applica(pre[:-1], x["p"], sg_)
                marc_l.append([cm, p, round(max(1.01, 0.88 / p), 2), 0])
                marc_info[cm] = info
                pg[cm] = [x["p"], p] + sg_
            for x in M.marcatori(rosa, ctx["lam"], assenti, presenza=presenza):
                aggiungi("MARC:", x, {"lato": lato, "g": x["g"], "pres": x["pres"], "tit": x["tit"]})
            # ammonito (gialli attesi della squadra, gia corretti per arbitro e avversario) e assist
            for pre, lista in (("AMM:", M.ammoniti(rosa, k_sq, assenti, presenza=presenza)), ("ASS:", M.assist(rosa, ctx["lam"], assenti, presenza=presenza))):
                for x in lista:
                    aggiungi(pre, x, {"lato": lato, "v": x["v"], "pres": x["pres"], "tit": x["tit"]})
        m["_pg"] = pg
        extra = extra_di(m)
        m["markets"] = righe_mercati(mercati) + extra + marc_l
        m["marcatori"] = marc_info
        m["tip"] = tip
        ia = M.valutazioni(mercati, m["h"], m["a"], c.get("sh"), c.get("sa"), {"pos_h": c.get("pos_h"), "pos_a": c.get("pos_a")}, m.get("cart"), extra, marc_l, marc_info)
        m["ia"] = compatta_ia(ia, m["markets"])
    return cambi


PAROLA_ASSENZA = {"squalifica": "squalificato", "infortunio": "indisponibile", "dubbio": "in dubbio", "panchina": "in panchina", "assente": "fuori dai convocati"}


def perche_cambiato(m, fattori, sole_quote, dopo, ufficiali):
    """Riga "Perche e cambiato" della partita: le assenze che spostano davvero i gol attesi (formazioni ufficiali o notizie)
    e le probabilita 1X2 prima (sole quote) e dopo. None se lo spostamento e sotto un punto."""
    if not sole_quote or not dopo:
        return None
    pq = {x["c"]: x["p"] for x in sole_quote}
    da = [round(pq.get(c, 0), 4) for c in ("1", "X", "2")]
    if max(abs(a - b) for a, b in zip(da, dopo)) < 0.01:
        return None
    chi = []
    for f in sorted(fattori, key=lambda f: f.get("delta") or 0):  # prima chi pesa di piu
        if not (f.get("delta") or f.get("delta_avv")) or not f.get("chi"):
            continue
        sq = m["h"] if f["lato"] == 0 else m["a"]
        chi.append(f"{f['chi']} ({sq}) {PAROLA_ASSENZA.get(f.get('tipo'), 'assente')}")
    if not chi:
        return None
    return {"da": da, "a": [round(x, 4) for x in dopo], "chi": chi[:4], "uff": bool(ufficiali)}


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
    try:
        cambi += aggiorna_senza_quote(d)
    except Exception as e:  # noqa: BLE001
        print(f"Senza quote: non aggiornate ({type(e).__name__}: {e})")
    try:
        cambi += risultati_espn(d)
    except Exception as e:  # noqa: BLE001 - i risultati ESPN non devono fermare il giro
        print(f"Risultati ESPN: non aggiornati ({type(e).__name__}: {e})")
    d["generato"] = datetime.now(timezone.utc).astimezone(ROME).strftime("%d/%m/%Y %H:%M")
    d["label"] = f"aggiornati il {d['generato'][:5]} alle {d['generato'][-5:]}"
    print(f"Partite aggiornate: {cambi}")
    npre = aggiorna_prepartita(d)
    nf = applica_fattori(d)
    na = aggiorna_arbitri(d)
    print(f"Quote pre-partita applicate: {npre}; partite ricalcolate: {nf}; arbitri aggiunti: {na}")
    return d if (cambi or nf or npre or na) else None


# ---------- campionati senza quote (punto 2 del piano del 3/11) ----------
# Partite dal calendario ESPN: risultato, classifica e diretta, archiviate per l'apprendimento. SENZA consiglio e FUORI dalla
# schedina: vivono in un elenco a parte ("senza_quote"), cosi nessuna parte dell'app che lavora con le quote le incontra.
ARCHIVIO_SQ = os.path.join(DATA, "archivio", "senza_quote.json")


def partite_senza_quote(esd, giorni):
    """Elenco delle partite senza quote dei giorni dell'app, leghe e classifiche."""
    sq = esd.get("senza_quote") or {}
    partite, leghe, classifiche = [], [], {}
    for k, (lgE, nome, paese, flag) in ES.SENZA_QUOTE.items():
        x = sq.get(k) or {}
        n = 0
        for e in x.get("ev") or []:
            try:
                t0 = datetime.fromisoformat(e["t"].replace("Z", "+00:00"))
            except (KeyError, ValueError):
                continue
            loc = t0.astimezone(ROME)
            if loc.date() not in giorni:
                continue
            st, g, g1 = ES.stato_evento(e)
            m = {"id": f"NQ-{k}-{e['eid']}", "nq": True, "lg": k, "lgE": lgE, "eid": e["eid"], "date": loc.strftime("%Y-%m-%d"), "time": loc.strftime("%H:%M"),
                 "ko": t0.isoformat(), "h": e["h"], "a": e["a"], "st": st, "g": g, "g1": g1, "res": None if g is None else (0 if g[0] > g[1] else 1 if g[0] == g[1] else 2)}
            if e.get("q"):  # quote DraftKings da ESPN: solo informazione (probabilita senza margine), nessun consiglio
                m["q"] = e["q"]
                m["pq"] = [round(v, 4) for v in togli_margine(e["q"])]
            partite.append(m)
            n += 1
        if x.get("cl"):
            righe = [{"team": r["team"], "pg": r["pg"], "v": r["v"], "n": r["n"], "p": r["p"], "gf": r["gf"], "gs": r["gs"], "pt": r["pt"]} for r in x["cl"]]
            classifiche[k] = {"generale": righe, "casa": [], "trasferta": [], "solo_generale": True}
        if n or x.get("cl"):
            leghe.append({"k": k, "name": nome, "country": paese, "flag": flag, "nq": True, "lgE": lgE})
    partite.sort(key=lambda m: (m["ko"], m["lg"]))
    return partite, leghe, classifiche


def archivia_senza_quote(esd, path=None):
    """Archivio per l'apprendimento: ogni partita finita dei campionati senza quote (risultato, primo tempo, quote se c'erano)."""
    path = path or ARCHIVIO_SQ
    arch = jload(path, {}) or {}
    nuove = 0
    for k, x in (esd.get("senza_quote") or {}).items():
        for e in x.get("ev") or []:
            st, g, g1 = ES.stato_evento(e)
            if st != "FT" or not e.get("eid"):
                continue
            r = {"lg": k, "t": e["t"], "h": e["h"], "a": e["a"], "g": g, **({"g1": g1} if g1 else {}), **({"q": e["q"]} if e.get("q") else {})}
            if arch.get(e["eid"]) != r:
                nuove += 0 if e["eid"] in arch else 1
                arch[e["eid"]] = r
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:  # una partita per riga: git conserva solo le righe nuove
        f.write("{\n" + ",\n".join(json.dumps(i) + ":" + json.dumps(arch[i], ensure_ascii=False, separators=(",", ":")) for i in sorted(arch, key=lambda i: (arch[i]["t"], i))) + "\n}\n")
    print(f"Archivio senza quote: {nuove} partite nuove, {len(arch)} in tutto")
    return nuove


def aggiorna_senza_quote(d, get=None, massimo=10, ora=None):
    """Durante il giorno: stato e risultato delle partite senza quote iniziate (abbinate per id ESPN, nessun dubbio sui nomi)."""
    get = get or ES.get
    ora = ora or datetime.now(timezone.utc)
    da_fare = {}
    for m in d.get("senza_quote") or []:
        try:
            t0 = datetime.fromisoformat(m["ko"])
        except (KeyError, ValueError):
            continue
        if m.get("st") in ("NS", "LIVE") and ora - timedelta(hours=36) <= t0 <= ora - timedelta(minutes=5):
            for g in {t0.strftime("%Y%m%d"), (t0 - timedelta(hours=6)).strftime("%Y%m%d")}:
                da_fare.setdefault((m["lgE"], g), []).append(m)
    per_id, richieste = {}, 0
    for (lgE, g) in sorted(da_fare)[:massimo]:
        richieste += 1
        try:
            for ev in get(f"{ES.SITE}{lgE}/scoreboard?dates={g}").get("events", []):
                try:
                    per_id[ev["id"]] = ES.evento(ev)
                except (KeyError, StopIteration, TypeError, ValueError):
                    continue
        except Exception as e:  # noqa: BLE001
            print(f"Senza quote {lgE} {g}: {str(e)[:100]}")
    cambi = 0
    for m in d.get("senza_quote") or []:
        e = per_id.get(m.get("eid"))
        if not e:
            continue
        st, g, g1 = ES.stato_evento(e)
        if st != "NS" and (st, g) != (m.get("st"), m.get("g")):
            m.update({"st": st, "g": g, "g1": g1, "res": None if g is None else (0 if g[0] > g[1] else 1 if g[0] == g[1] else 2)})
            cambi += 1
    if richieste:
        print(f"Senza quote: {cambi} partite aggiornate, {richieste} richieste")
    return cambi


def senza_fd():
    """Campionati e coppe senza football-data (risultati solo dal calendario ESPN), nazionali escluse (nomi in italiano)."""
    return {k for k, _, _, _, code, _ in LEAGUES if code is None and k in ES.ESPN_LG and k not in ES.NAZIONALI}


def scrivi_diario(path, dd):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:  # una partita per riga: git conserva solo le righe cambiate
        f.write("{\n" + ",\n".join(json.dumps(k) + ":" + json.dumps(dd[k], ensure_ascii=False, separators=(",", ":")) for k in sorted(dd)) + "\n}\n")


def risultati_espn(d, eventi=None, get=None, massimo=14, ora=None):
    """Campionati e coppe senza football-data: il risultato arriva solo dal calendario ESPN.
    1) partite dell'app iniziate e non ancora finite: stato e risultato aggiornati anche durante il giorno (prima arrivavano
       solo al giro del mattino: le partite asiatiche restavano "da giocare" fino al giorno dopo);
    2) diario e storico dei consigli degli ultimi 7 giorni: risultati mancanti aggiunti; con 'eventi' (giro del mattino)
       anche i risultati gia registrati vengono ricontrollati e corretti (fino al 3/11 "Al Ittihad - Al Ain" poteva prendere
       il risultato di "Al Sadd - Al Ahli").
    eventi: {lega: [partite compatte]} gia scaricate; le leghe mancanti si scaricano per giorno, al massimo 'massimo' richieste.
    Restituisce il numero di partite dell'app cambiate."""
    get = get or ES.get
    ora = ora or datetime.now(timezone.utc)
    ricontrolla = eventi is not None
    eventi = dict(eventi or {})
    leghe = senza_fd()
    obiettivi = []  # (tipo, oggetto, lega, casa, ospite, calcio d'inizio)
    for m in d.get("matches", []):
        if m.get("fd") is not None or m.get("lg") not in leghe:
            continue
        try:
            t0 = datetime.fromisoformat(m["ko"])
        except (KeyError, ValueError):
            continue
        if ora - timedelta(hours=36) <= t0 <= ora - timedelta(minutes=5) and (m.get("st") in ("NS", "LIVE") or (ricontrolla and m.get("st") == "FT")):
            obiettivi.append(("app", m, m["lg"], m["h"], m["a"], t0))
    oggi = ora.astimezone(ROME).date()
    diari, ko_di = {}, {}
    for dd_ in range(-7, 1):
        giorno = (oggi + timedelta(days=dd_)).isoformat()
        path = os.path.join(DIARIO, giorno + ".json")
        voci = jload(path, None)
        if not voci:
            continue
        diari[path] = voci
        for mid, v in voci.items():
            try:
                t0 = datetime.fromisoformat(v["ko"])
            except (KeyError, TypeError, ValueError):
                continue
            ko_di[mid] = t0
            if v.get("lg") not in leghe or not (ora - timedelta(days=7) <= t0 <= ora - timedelta(hours=2, minutes=30)):
                continue
            if v.get("st") not in ("FT", "RINV") or (ricontrolla and v.get("st") == "FT"):
                obiettivi.append(("diario", (path, mid), v["lg"], v.get("h"), v.get("a"), t0))
    consigli = jload(STORICO_IN, {}) or {}
    for mid, v in consigli.items():
        t0 = ko_di.get(mid)
        if not t0 or v.get("lg") not in leghe or not (ora - timedelta(days=7) <= t0 <= ora - timedelta(hours=2, minutes=30)):
            continue
        if v.get("st") not in ("FT", "RINV") or (ricontrolla and v.get("st") == "FT"):
            obiettivi.append(("consigli", mid, v["lg"], v.get("h"), v.get("a"), t0))
    # giorni del calendario ESPN da leggere: giorno UTC del fischio e quello di 6 ore prima (ESPN ragiona con l'ora americana)
    richieste, scaricati = 0, {}
    coperti = ora - timedelta(days=3, hours=18)  # il giro del mattino scarica 4 giorni indietro: prima di allora si legge il giorno
    for tipo, _, lg, _, _, t0 in sorted(obiettivi, key=lambda o: (o[0] != "app", -o[5].timestamp())):
        if lg in eventi and t0 >= coperti:
            continue
        for g in sorted({t0.strftime("%Y%m%d"), (t0 - timedelta(hours=6)).strftime("%Y%m%d")}):
            if (lg, g) in scaricati or richieste >= massimo:
                continue
            richieste += 1
            try:
                scaricati[(lg, g)] = [ES.evento(ev) for ev in get(f"{ES.SITE}{ES.ESPN_LG[lg]}/scoreboard?dates={g}").get("events", [])]
            except Exception as e:  # noqa: BLE001 - rete o formato: si riprova al prossimo giro
                scaricati[(lg, g)] = []
                print(f"Risultati ESPN {lg} {g}: {str(e)[:120]}")
    for (lg, _), evs in scaricati.items():
        eventi.setdefault("~" + lg, []).extend(evs)
    cambi, diario_cambi, cons_cambi, corretti = 0, set(), 0, []
    for tipo, obj, lg, h, a, t0 in obiettivi:
        e = ES.evento_vicino((eventi.get(lg) or []) + (eventi.get("~" + lg) or []), h, a, t0, ore=3)
        if not e:
            continue
        st, g, g1 = ES.stato_evento(e)
        if tipo == "app":
            if st != "NS" and (st, g) != (obj.get("st"), obj.get("g")):
                obj["st"], obj["g"], obj["g1"] = st, g, g1
                obj["res"] = None if g is None else (0 if g[0] > g[1] else 1 if g[0] == g[1] else 2)
                cambi += 1
            continue
        if st not in ("FT", "RINV"):
            continue
        v = diari[obj[0]][obj[1]] if tipo == "diario" else consigli[obj]
        if (st, g) == (v.get("st"), v.get("g")):
            continue
        if v.get("st") == "FT":
            corretti.append(f"{lg} {h}-{a} {v.get('g')} -> {g}")
        v["st"], v["g"], v["g1"] = st, g, g1
        if tipo == "diario":
            diario_cambi.add(obj[0])
            continue
        cons_cambi += 1
        if st == "FT" and not v.get("tardivo"):
            es = {k: esito_sicuro(x["c"], g, g1) for k, x in (v.get("tips") or {}).items()}
            v["esiti"] = {k: x for k, x in es.items() if x is not None}
        else:
            v.pop("esiti", None)
    for path in diario_cambi:
        scrivi_diario(path, diari[path])
    if cons_cambi:
        with open(STORICO_IN, "w", encoding="utf-8") as f:
            json.dump(consigli, f, ensure_ascii=False, separators=(",", ":"))
    print(f"Risultati ESPN: {cambi} partite dell'app, {sum(1 for o in obiettivi if o[0] == 'diario')} voci del diario controllate "
          f"({len(diario_cambi)} file aggiornati), {cons_cambi} consigli aggiornati, {richieste} richieste" + (f"; corretti: {corretti[:8]}" if corretti else ""))
    return cambi


STORICO_IN = os.path.join(DATA, "consigli.json")
STORICO_OUT = os.path.join("app", "data", "storico.json")


# il consiglio si blocca 45 minuti prima del calcio d'inizio e da li non cambia piu. Fino ad allora gli specialisti lavorano:
# notizie e infortuni (ogni ora / ogni 2 ore), formazioni ufficiali (escono circa 60 minuti prima), quote pre-partita (15-70 minuti prima).
# 45 minuti lasciano il tempo di leggere l'analisi e giocare, e il consiglio resta lo stesso fino al risultato.
BLOCCO_MIN = 45
TITOLI_QUOTE = {"consiglio": "Indicazione dalle quote", "prudente": "Alternativa prudente (dalle quote)", "coraggiosa": "Alternativa coraggiosa (dalle quote)"}


def livello_dati(m):
    """Quanti dati ha AuraPitch oltre alle quote: "completa", "parziale" o "quote" (solo bookmaker, nessuna elaborazione propria)."""
    nb = m.get("nb") or 0
    try:
        cal_lg = (CB.modello() or {}).get("cal_lg") or {}
    except Exception:  # noqa: BLE001
        cal_lg = {}
    fonti = []
    if nb >= 5:
        fonti.append(f"quote medie di {nb} bookmaker")
    if m["lg"] in cal_lg:
        fonti.append("archivio storico del campionato")
    if m.get("xgf"):
        fonti.append("gol attesi (xG) delle squadre")
    if m.get("arbitro"):
        fonti.append("statistiche dell'arbitro")
    if any(f.get("delta") or f.get("delta_avv") for f in m.get("fattori") or []):
        fonti.append("notizie su assenze e squalifiche")
    if any(m.get("uff") or []):
        fonti.append("formazioni ufficiali")
    elif m.get("formazione"):
        fonti.append("formazione probabile")
    # affidabilita dei dati (0-100): quanta informazione ha l'algoritmo su questa partita, oltre alle quote
    pf = m.get("fattori") or []
    punti = {"quote": 30 if nb >= 10 else 25 if nb >= 5 else 15 if nb >= 2 else 10, "archivio": 20 if m["lg"] in cal_lg else 0,
             "forma": 10 if (m.get("last5") or m.get("forma")) else 0, "classifica": 5 if m.get("_classifica") else 0, "xg": 10 if m.get("xgf") else 0,
             "arbitro": 5 if m.get("arbitro") else 0, "notizie": 10 if pf else 0, "formazione": 15 if any(m.get("uff") or []) else 10 if m.get("formazione") else 0}
    score = min(100, sum(punti.values()))
    # onesta passata dell'IA nel campionato (onesta.py): dove le probabilita sono state meno oneste l'affidabilita scende.
    # Il fattore esiste solo se l'apprendimento l'ha provato su partite mai viste (altrimenti resta in ombra e vale 1)
    try:
        f_lg = ((CB.modello() or {}).get("affid_lg") or {}).get(m["lg"])
    except Exception:  # noqa: BLE001
        f_lg = None
    if f_lg:
        score = ON.applica(score, m["lg"], {m["lg"]: f_lg})
    if nb < 5 and m["lg"] not in cal_lg:
        lv = "quote"
    elif nb >= 5 and m["lg"] in cal_lg and len(fonti) >= 3:
        lv = "completa"
    else:
        lv = "parziale"
    return {"lv": lv, "fonti": fonti, "nb": nb, "score": score, **({"f_lg": f_lg} if f_lg else {})}


def prossimo_giro(ora):
    """Quando ripasserà la raccolta (orologio del servizio): giro completo alle 6:00 UTC, giri brevi ogni 10 minuti dalle 10:00
    alle 23:50 UTC. Tra mezzanotte e le 6 e tra le 6:10 e le 10 non passa nessuno: le partite asiatiche e australiane che
    iniziano in quelle ore vanno bloccate all'ultimo giro utile, prima del fischio."""
    h = ora.replace(minute=0, second=0, microsecond=0)
    if 10 <= ora.hour <= 23 and not (ora.hour == 23 and ora.minute >= 50):
        return ora + timedelta(minutes=10)
    if ora.hour >= 23:
        return (h + timedelta(days=1)).replace(hour=6)
    if ora.hour < 6:
        return h.replace(hour=6)
    return h.replace(hour=10)


def blocca_consigli(d):
    """Ogni consiglio si blocca BLOCCO_MIN minuti prima del calcio d'inizio (o al giro del mattino, se fino ad allora non ci sono altri giri)
    e resta quello fino a fine partita, giusto o sbagliato. Il consiglio bloccato vive nel registro privato dei consigli (cassaforte)."""
    st = jload(STORICO_IN, {}) or {}
    ora = datetime.now(timezone.utc)
    prossimo = prossimo_giro(ora)
    nuovi = 0
    for m in d.get("matches", []):
        m["_classifica"] = m["lg"] in (d.get("standings") or {})
        info = livello_dati(m)
        m.pop("_classifica", None)
        m["dati"] = info
        tip = m.get("tip")
        if not isinstance(tip, dict) or not tip:
            continue
        r = st.get(m["id"])
        if r and r.get("tipB"):
            try:  # registrato dopo il fischio (anche prima che esistesse questa regola): resta fuori dallo storico
                if not r.get("tardivo") and datetime.fromisoformat(r["tB"]) > datetime.fromisoformat(m["ko"]):
                    r["tardivo"] = True
            except (KeyError, TypeError, ValueError):
                pass
            m["tip"], m["dati"] = r["tipB"], r.get("datiB", info)
            m["blocco"] = {"st": "tardivo" if r.get("tardivo") else "bloccato", "t": r["tB"]}
            continue
        if info["lv"] == "quote" and (tip.get("consiglio") or {}).get("titolo") != TITOLI_QUOTE["consiglio"]:  # niente elaborazione propria: lo diciamo chiaramente
            tip = {k: dict(v, titolo=TITOLI_QUOTE.get(k, v.get("titolo")), perche=[f"Per questa partita AuraPitch ha solo le quote di {info['nb'] or 1} bookmaker e nessun archivio del campionato: l'indicazione viene dalle quote, senza un'elaborazione propria."] + list(v.get("perche") or []))
                   if isinstance(v, dict) else v for k, v in tip.items()}
            m["tip"] = tip
        m["dati"] = info
        try:
            ko = datetime.fromisoformat(m["ko"])
        except (ValueError, TypeError, KeyError):
            continue
        limite = ko - timedelta(minutes=BLOCCO_MIN)
        if m.get("st") != "NS" or ora >= limite or prossimo > limite:
            r = st.get(m["id"]) or {"date": m["date"], "lg": m["lg"], "h": m["h"], "a": m["a"], "st": m.get("st"), "g": m.get("g"), "mk": m.get("mk"), "p": m.get("_p0") or m.get("p"),
                                    "nf": sum(1 for f in m.get("fattori", []) if f.get("delta")), "sc": SCALA_FATTORI(), "ver": FT.VERSIONE, "segnali": [x["tipo"] for x in m.get("segnali", [])]}
            r["tips"] = {k: {x: v[x] for x in ("c", "l", "p", "q", "qm")} for k, v in tip.items() if isinstance(v, dict)}
            r["tipB"], r["tB"], r["datiB"], r["ko"] = tip, ora.isoformat(timespec="minutes"), info, m.get("ko")
            r["spB"] = VM.specialisti_attivi(m, SP.NOMI)  # chi lavorava al blocco: serve alla misura del vantaggio (vantaggio.py)
            # partita vista per la prima volta dopo il fischio (dati arrivati tardi): il consiglio si mostra ma non conta
            # nello storico, perche non e stato fissato prima della partita (credibilita del rendimento)
            if ora >= ko:
                r["tardivo"] = True
            st[m["id"]] = r
            m["blocco"] = {"st": "tardivo" if r.get("tardivo") else "bloccato", "t": r["tB"]}
            nuovi += 1
        else:
            m["blocco"] = {"st": "provvisorio", "t": limite.isoformat(timespec="minutes")}
    os.makedirs(os.path.dirname(STORICO_IN), exist_ok=True)
    with open(STORICO_IN, "w", encoding="utf-8") as f:
        json.dump(st, f, ensure_ascii=False, separators=(",", ":"))
    print(f"Consigli bloccati ora: {nuovi}")


def segna_tardivi(st):
    """Consigli del registro bloccati dopo il calcio d'inizio (anche di partite non piu nel file del giorno): l'orario del
    fischio si prende dal diario delle previsioni. Restano visibili come "tardivi" ma escono dallo storico e dal rendimento."""
    diari, n = {}, 0
    for k, r in st.items():
        if r.get("tardivo") or not r.get("tB"):
            continue
        if not r.get("ko"):
            if r.get("date") not in diari:
                diari[r.get("date")] = jload(os.path.join(DIARIO, f"{r.get('date')}.json"), {}) or {}
            r["ko"] = (diari[r.get("date")].get(k) or {}).get("ko")
        try:
            if r.get("ko") and datetime.fromisoformat(r["tB"]) > datetime.fromisoformat(r["ko"]):
                r["tardivo"] = True
                r.pop("esiti", None)
                n += 1
        except (TypeError, ValueError):
            continue
    if n:
        print(f"Registro dei consigli: {n} consigli bloccati dopo il fischio esclusi dallo storico")


def aggiorna_storico(d):
    """Salva i consigli IA prima del calcio d'inizio e li verifica a fine partita (storico trasparente)."""
    st = jload(STORICO_IN, {}) or {}
    adesso, chiusure = datetime.now(timezone.utc), 0
    for m in d.get("matches", []):
        tip = m.get("tip") or {}
        if not tip:
            continue
        r = st.get(m["id"])
        if r is None or (r.get("st") == "NS" and m["st"] == "NS" and not r.get("tipB")):  # bloccato = non si tocca piu
            # finche la partita non inizia si tiene l'ultima versione del consiglio (quote piu recenti)
            r = {"date": m["date"], "lg": m["lg"], "h": m["h"], "a": m["a"], "st": m["st"], "g": m.get("g"), "mk": m.get("mk"), "p": m.get("_p0") or m.get("p"),
                 "nf": sum(1 for f in m.get("fattori", []) if f.get("delta")), "sc": SCALA_FATTORI(), "ver": FT.VERSIONE, "segnali": [x["tipo"] for x in m.get("segnali", [])],
                 "tips": {k: {x: v[x] for x in ("c", "l", "p", "q", "qm")} for k, v in tip.items()}}
            st[m["id"]] = r
        chiusure += VM.registra_chiusura(r, m, adesso)  # quota dello stesso esito fino al fischio (misura del vantaggio)
        if m["st"] in ("FT", "LIVE", "RINV"):
            r["st"], r["g"], r["g1"] = m["st"], m.get("g"), m.get("g1")
        # registrato dopo il fischio (anche prima di questa regola): fuori dallo storico
        if not r.get("tardivo") and (r.get("tB") or "") and m.get("ko"):
            try:
                if datetime.fromisoformat(r["tB"]) > datetime.fromisoformat(m["ko"]):
                    r["tardivo"] = True
            except (TypeError, ValueError):
                pass
        if r["st"] == "FT":  # a partita finita il consiglio completo non serve piu: resta la versione corta (registro leggero)
            r.pop("tipB", None)
            r.pop("datiB", None)
        if r.get("tardivo"):
            r.pop("esiti", None)
            continue
        if r["st"] == "FT" and r.get("g"):
            es = {k: esito_sicuro(v["c"], r["g"], r.get("g1")) for k, v in r["tips"].items()}
            r["esiti"] = {k: v for k, v in es.items() if v is not None}
    limite = (datetime.now(timezone.utc).astimezone(ROME).date() - timedelta(days=60)).isoformat()
    st = {k: v for k, v in st.items() if v["date"] >= limite}
    segna_tardivi(st)
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
    print(f"Storico consigli: {len(chiuse)} partite verificate, {len(st)} salvate; quote di chiusura aggiornate: {chiusure}")
    try:  # riassunto pubblico del vantaggio sul mercato (solo numeri) per la pagina dell'algoritmo
        t = VM.scrivi_pubblico(st, SP.NOMI)["totale"]
        print(f"Vantaggio sul mercato: {t.get('n', 0)} consigli misurati" + (f", movimento medio {t['medio']:+.2f}%" if t.get("n") else ""))
    except Exception as e:  # noqa: BLE001 - la misura non deve mai fermare il giro dei dati
        print(f"Vantaggio sul mercato: non aggiornato ({type(e).__name__}: {e})")


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
                     "ver": ver, "pc": {c: pr[c] for c in CHIAVI_DIARIO if c in pr}, "q": q, "tips": tips, "st": "NS",
                     "lv": (m.get("dati") or {}).get("lv"), "bl": 1 if (m.get("blocco") or {}).get("st") == "bloccato" else 0, "sp": m.get("sp"),
                     # giocatori: [probabilita di base, probabilita mostrata, specialisti...] (le controlla giocatori.py a partita finita)
                     "pg": m.get("_pg") or (r or {}).get("pg"), "uff": m.get("uff") or (r or {}).get("uff"),
                     # cartellini, angoli e falli attesi (partita e squadre), media del campionato, arbitro: li controlla statistiche_ia.py
                     "ck": diario_statistiche(m) or (r or {}).get("ck")}
                if r is None:
                    n.update({"t0": ora, "mk0": n["mk"], "mo0": n["mo"], "xm0": n["xm"], "pc0": n["pc"], "q0": q, "tips0": tips})
                    nuove += 1
                else:
                    n.update({k: r[k] for k in ("t0", "mk0", "mo0", "xm0", "pc0", "q0", "tips0") if k in r})
                dd[m["id"]] = n
            elif r is not None and m.get("st") in ("FT", "LIVE", "RINV"):
                r["st"], r["g"], r["g1"] = m["st"], m.get("g"), m.get("g1")
        if dd != vecchio:
            scrivi_diario(path, dd)
    print(f"Diario: {nuove} nuove previsioni")


def diario_statistiche(m):
    """Per il verificatore delle statistiche: {"K": [attesi, casa, ospite, media lega], "C": [...], "F": [...], "arb": {...}, "eq": x}."""
    cart = m.get("cart") or {}
    out = {k: [cart[k].get("attesi")] + list(cart[k].get("squadre") or [None, None]) + [cart[k].get("media_lega")]
           for k in ("K", "C", "F") if isinstance(cart.get(k), dict) and cart[k].get("attesi")}
    if not out:
        return None
    ratio = (m.get("arbitro") or {}).get("ratio")
    if ratio:
        out["arb"] = ratio
    if cart.get("eq") is not None:
        out["eq"] = cart["eq"]
    return out


def aggiorna_specialisti_giorno(d):
    """Specialisti che cambiano durante il giorno, fino al fischio: turnover e coppe (partita di coppa pochi giorni prima o dopo),
    movimento delle quote (prima lettura del mattino, dal diario, contro l'ultima) e notizie dell'ultima ora (assenze e cambi
    annunciati nelle 6 ore prima del fischio, dai fattori). Come il consenso, pesano solo quando
    l'integratore (strumenti/impara.py) li trova utili su partite mai viste."""
    ic, im, iu = SP.NOMI.index("coppe"), SP.NOMI.index("movimento"), SP.NOMI.index("ultima_ora")
    giorni, n = {}, 0
    for m in d.get("matches", []):
        if m.get("st") != "NS":
            continue
        if m["date"] not in giorni:
            giorni[m["date"]] = jload(os.path.join(DIARIO, m["date"] + ".json"), {}) or {}
        r = giorni[m["date"]].get(m["id"]) or {}
        coppa = (m.get("_ctx") or {}).get("coppa")
        vals = {ic: SP.coppe(coppa) if coppa is not None else None, im: SP.movimento(m.get("mk"), r.get("mk0")), iu: SP.ultima_ora(m.get("fattori"), m.get("ko"))}
        if m.get("sp") is None and all(v is None for v in vals.values()):
            continue
        sp = list(m.get("sp") or [])
        sp += [None] * (len(SP.NOMI) - len(sp))  # file scritti prima dei nuovi specialisti: valori mancanti = nessun dato
        for i, v in vals.items():
            if sp[i] != v:
                sp[i] = v
                n += 1
        m["sp"] = sp
    print(f"Specialisti del giorno (coppe, movimento delle quote, ultima ora): {n} valori aggiornati")
    return n


def aggiorna_consenso(d):
    """Specialista "consenso": i pronostici 1/X/2 dei tipster AuraPitch (servizio, /consenso: solo somme anonime, pesate per bravura)
    entrano nei segnali di ogni partita non iniziata. Pesa solo quando l'integratore (strumenti/impara.py) lo trova utile."""
    import urllib.request
    try:
        url = (jload(os.path.join("app", "data", "push.json"), {}) or {}).get("url")
        req = urllib.request.Request(url + "/consenso", headers={"User-Agent": "aurapitch-raccolta"})
        with urllib.request.urlopen(req, timeout=20) as r:
            cons = (json.loads(r.read().decode()) or {}).get("p") or {}
    except Exception as e:  # noqa: BLE001 - senza servizio il consenso resta vuoto
        print(f"Consenso della community: non disponibile ({e})")
        return 0
    i, n = SP.NOMI.index("consenso"), 0
    for m in d.get("matches", []):
        if m.get("st") != "NS" or not m.get("sp"):
            continue
        sp = list(m["sp"]) + [None] * (len(SP.NOMI) - len(m["sp"]))
        v = SP.consenso(cons.get(m["id"]), m.get("mk"))
        if sp[i] != v:
            sp[i] = v
            n += 1
        m["sp"] = sp
    print(f"Consenso della community: {sum(1 for c in cons.values() if c and c[3] >= 5)} partite con almeno 5 pronostici, {n} aggiornate")
    return n


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
        try:
            archivia_senza_quote(jload(ESPN, {}) or {})
        except Exception as e:  # noqa: BLE001
            print(f"Archivio senza quote: non aggiornato ({type(e).__name__}: {e})")
        try:  # mattino: ricontrollo dei risultati del diario e dei consigli con il calendario ESPN appena scaricato
            risultati_espn(d, eventi=(jload(ESPN, {}) or {}).get("risultati_lega") or {}, massimo=60)
        except Exception as e:  # noqa: BLE001
            print(f"Risultati ESPN: non ricontrollati ({type(e).__name__}: {e})")
    aggiorna_consenso(d)
    aggiorna_specialisti_giorno(d)
    blocca_consigli(d)
    aggiungi_movimenti(d)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        # le probabilita di base e gli specialisti dei giocatori (_pg) vanno solo nel diario, non nel file pubblico dell'app
        json.dump({**d, "matches": [{k: v for k, v in m.items() if k != "_pg"} for m in d.get("matches", [])]}, f, ensure_ascii=False, separators=(",", ":"))
    scrivi_stato(d)
    scrivi_lista(d)
    aggiorna_storico(d)
    aggiorna_diario(d)
    try:
        import ia_mercato as IM
        IM.aggiorna()
    except Exception as e:  # noqa: BLE001 - "IA contro mercato" non deve mai fermare il giro dei dati
        print(f"IA contro mercato: non aggiornata ({type(e).__name__}: {e})")
    try:
        import schedine_ia as SI
        SI.aggiorna(d)
    except Exception as e:  # noqa: BLE001 - lo storico delle schedine non deve mai fermare il giro dei dati
        print(f"Schedine IA per stile: non aggiornate ({type(e).__name__}: {e})")


STATO_OUT = os.path.join("app", "data", "stato.json")
# l'app scarica prima una lista leggera; i dettagli di una partita arrivano quando la apri, i mercati quando apri la Schedina
DETTAGLI = ("markets", "ia", "cart", "curiosita", "xgf", "segnali", "attese", "prec", "forma", "ctx", "h2h", "last5", "odds", "max", "elo", "foto",
            "arbitro", "xg_mercato", "fattori", "formazione", "cambio")
FATTORI_LISTA = ("chi", "lato", "tipo", "fonte", "delta")  # nella lista resta un riassunto delle assenze (pagina squadra)
NON_SERVONO = ("_ctx", "_firma", "_p0", "sp", "xg_base", "_pg", "uff_eff")


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
                      "p": m.get("p"), "mk": m.get("mk"), "mov": m.get("mov"), "uff": m.get("uff"), "eff": m.get("uff_eff"),
                      "bl": (m.get("blocco") or {}).get("st"), "cambio": {"chi": m["cambio"]["chi"][:2]} if m.get("cambio") and m.get("uff") else None,  # solo per l'avviso delle formazioni
                      "tip": {"consiglio": {"l": t.get("l"), "p": t.get("p")}} if t else None,
                      "marcatori": {k: {"lato": v["lato"], "g": v["g"]} for k, v in (m.get("marcatori") or {}).items() if k.startswith("MARC:") and v.get("g", 0) >= 2}})
    with open(STATO_OUT, "w", encoding="utf-8") as f:
        json.dump({"matches": righe}, f, ensure_ascii=False, separators=(",", ":"))


if __name__ == "__main__":
    main()
