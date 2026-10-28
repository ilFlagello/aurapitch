"""AuraPitch - dati ESPN raccolti ogni mattina per l'algoritmo (solo libreria standard).
Per le squadre che giocano nelle prossime 48 ore:
  - rosa con statistiche di stagione di ogni giocatore (gol, assist, presenze, da titolare, gialli, rossi): pesi dei giocatori per i fattori;
  - ultima partita di campionato: chi ha preso un rosso o il giallo che fa scattare la squalifica (5a o 10a ammonizione);
  - Serie B (non coperta da football-data): classifica e risultati, per forma, classifica e statistiche.
Fonte non ufficiale (endpoint pubblici ESPN): va bene per la beta, da sostituire con una fonte licenziata prima degli store."""
import gzip
import json
import os
import re
import time
import unicodedata
import urllib.request
from datetime import datetime, timedelta, timezone

SITE = "https://site.api.espn.com/apis/site/v2/sports/soccer/"
STAND = "https://site.api.espn.com/apis/v2/sports/soccer/"
ESPN_LG = {"I1": "ita.1", "I2": "ita.2", "E0": "eng.1", "SP1": "esp.1", "D1": "ger.1", "CL": "uefa.champions", "EL": "uefa.europa", "ECL": "uefa.europa.conf", "CI": "ita.coppa_italia",
           # campionati e coppe con quote gratuite da ESPN (DraftKings), senza crediti di The Odds API
           "F1": "fra.1", "N1": "ned.1", "P1": "por.1", "E1": "eng.2",
           "FAC": "eng.fa", "ELC": "eng.league_cup", "CDR": "esp.copa_del_rey", "DFB": "ger.dfb_pokal", "CDF": "fra.coupe_de_france", "SCI": "ita.super_cup",
           "D2": "ger.2", "SP2": "esp.2", "B1": "bel.1", "T1": "tur.1", "SC0": "sco.1", "A1": "aut.1", "G1": "gre.1", "DK1": "den.1",
           "MLS": "usa.1", "BR1": "bra.1", "AR1": "arg.1", "MX1": "mex.1", "J1": "jpn.1",
           "F2": "fra.2", "NO1": "nor.1", "SE1": "swe.1", "SA1": "ksa.1", "CHI1": "chi.1", "COL1": "col.1", "AU1": "aus.1", "UY1": "uru.1", "PY1": "par.1",
           "EC1": "ecu.1", "PE1": "per.1", "LIB": "conmebol.libertadores", "SUD": "conmebol.sudamericana", "ACL": "afc.champions",
           # nazionali
           "NL": "uefa.nations", "AMI": "fifa.friendly", "EQ": "uefa.euroq", "WCQ": "fifa.worldq.uefa"}
NAZIONALI = ("NL", "AMI", "EQ", "WCQ")
COPPE = ("CL", "EL", "ECL", "CI", "FAC", "ELC", "CDR", "DFB", "CDF", "SCI", "LIB", "SUD", "ACL", "NL", "AMI", "EQ", "WCQ")
SOLO_ESPN = ("I2", "F1", "N1", "P1", "E1", "D2", "SP2", "B1", "T1", "SC0", "A1", "G1", "DK1", "MLS", "BR1", "AR1", "MX1", "J1",
             "F2", "NO1", "SE1", "SA1", "CHI1", "COL1", "AU1", "UY1", "PY1", "EC1", "PE1")  # campionati con classifica e risultati da ESPN (non da football-data.org)
# quote da ESPN: nome del campionato come nel file delle quote (deve coincidere con l'ultimo campo di LEAGUES in genera_app.py)
QUOTE_ESPN = {"F1": "Ligue 1", "N1": "Eredivisie", "P1": "Primeira Liga", "E1": "Championship", "FAC": "FA Cup", "ELC": "Carabao Cup",
              "CDR": "Copa del Rey", "DFB": "DFB-Pokal", "CDF": "Coppa di Francia", "SCI": "Supercoppa Italiana",
              "D2": "2. Bundesliga", "SP2": "LaLiga 2", "B1": "Pro League", "T1": "Süper Lig", "SC0": "Premiership", "A1": "Bundesliga austriaca",
              "G1": "Super League", "DK1": "Superliga", "MLS": "MLS", "BR1": "Brasileirão", "AR1": "Liga Profesional", "MX1": "Liga MX", "J1": "J1 League",
              "F2": "Ligue 2", "NO1": "Eliteserien", "SE1": "Allsvenskan", "SA1": "Saudi Pro League", "CHI1": "Primera División Cile", "COL1": "Liga BetPlay",
              "AU1": "A-League", "UY1": "Primera División Uruguay", "PY1": "Primera División Paraguay", "EC1": "LigaPro Ecuador", "PE1": "Liga 1 Perù",
              "LIB": "Copa Libertadores", "SUD": "Copa Sudamericana", "ACL": "AFC Champions League", "NL": "Nations League", "AMI": "Amichevoli nazionali",
              "EQ": "Qualificazioni Europei", "WCQ": "Qualificazioni Mondiali"}
# Football-Data.co.uk: quote medie di molti bookmaker per il prossimo turno (fixtures.csv: codice "Div"; new_league_fixtures.csv: paese/campionato)
FD_DIV = {"F1": "F1", "N1": "N1", "P1": "P1", "E1": "E1", "D2": "D2", "SP2": "SP2", "B1": "B1", "T1": "T1", "SC0": "SC0", "G1": "G1", "F2": "F2"}
FD_NUOVI = {"A1": ("Austria", "Bundesliga"), "DK1": ("Denmark", "Superliga"), "MLS": ("USA", "MLS"), "BR1": ("Brazil", "Serie A"),
            "AR1": ("Argentina", "Liga Profesional"), "MX1": ("Mexico", "Liga MX"), "J1": ("Japan", "J1 League"),
            "NO1": ("Norway", "Eliteserien"), "SE1": ("Sweden", "Allsvenskan")}
SOGLIE_GIALLI = (5, 10)  # squalifica alla 5a e alla 10a ammonizione (regola comune a Serie A, Serie B, Premier, LaLiga, Bundesliga)
STOP = {"fc", "ac", "as", "ss", "us", "ssc", "afc", "cf", "sc", "calcio", "club", "de", "1907", "1909", "1913", "1919", "bc", "vfb", "vfl", "tsg", "sv", "fsv", "rc", "cd", "ud", "rcd", "ca", "sd", "1846", "04", "05", "1899", "hellas"}
ALIAS = {"internazionale": "inter", "inter milan": "inter", "ac milan": "milan", "manchester united": "man united", "manchester city": "man city", "bayern munich": "bayern", "tottenham hotspur": "tottenham"}


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (AuraPitch beta)", "Accept-Encoding": "gzip"})
    with urllib.request.urlopen(req, timeout=25) as r:
        raw = r.read()
        if raw[:2] == b"\x1f\x8b":
            raw = gzip.decompress(raw)
        time.sleep(0.4)
        return json.loads(raw.decode("utf-8"))


def piano(s):
    s = unicodedata.normalize("NFD", str(s or "").lower())
    return "".join(c for c in s if unicodedata.category(c) != "Mn")


def toks(s):
    p = re.sub(r"[^a-z0-9 ]", " ", piano(s)).strip()
    p = ALIAS.get(p, p)
    return [t for t in p.split() if t and t not in STOP]


def sim(a, nomi):
    best = 0
    for b in nomi:
        x, y = toks(a), toks(b)
        if not x or not y:
            continue
        if x == y:
            return 1.0
        if set(x) & set(y):
            best = max(best, 0.8)
        elif any(len(t) >= 4 and len(u) >= 4 and (t[:4] == u[:4]) for t in x for u in y):
            best = max(best, 0.5)
    return best


def trova_squadra(teams, nome):
    best, bs = None, 0
    for t in teams:
        s = sim(nome, [t["displayName"], t.get("shortDisplayName"), t.get("name"), t.get("location")])
        if s > bs:
            best, bs = t, s
    return best if bs >= 0.8 else None


def stat(a, nome):
    for c in ((a.get("statistics") or {}).get("splits") or {}).get("categories", []):
        for s in c.get("stats", []):
            if s["name"] == nome:
                return int(s.get("value") or 0)
    return 0


def rosa(lg, tid):
    d = get(f"{SITE}{lg}/teams/{tid}/roster")
    out = []
    for a in d.get("athletes", []):
        app = stat(a, "appearances")
        out.append({"id": a["id"], "n": a["displayName"], "last": a.get("lastName") or a["displayName"], "pos": (a.get("position") or {}).get("abbreviation"),
                    "g": stat(a, "totalGoals"), "a": stat(a, "goalAssists"), "pres": app, "tit": max(0, app - stat(a, "subIns")),
                    "gialli": stat(a, "yellowCards"), "rossi": stat(a, "redCards")})
    return out


def risultati(lg, tid):
    d = get(f"{SITE}{lg}/teams/{tid}/schedule")
    out = []
    for ev in d.get("events", []):
        c = ev["competitions"][0]
        if ((c.get("status") or {}).get("type") or {}).get("state") != "post":
            continue
        me = next((x for x in c["competitors"] if x["team"]["id"] == tid), None)
        op = next((x for x in c["competitors"] if x["team"]["id"] != tid), None)
        if not me or not op:
            continue
        sc = lambda x: int((x.get("score") or {}).get("value", 0) if isinstance(x.get("score"), dict) else (x.get("score") or 0))
        out.append({"eid": ev["id"], "t": ev["date"], "casa": me["homeAway"] == "home", "avv": op["team"].get("shortDisplayName") or op["team"]["displayName"], "gf": sc(me), "gs": sc(op)})
    out.sort(key=lambda r: r["t"])
    return out


def cartellini(lg, eid, tid):
    """Rossi e gialli della squadra nell'ultima partita (dagli eventi chiave)."""
    s = get(f"{SITE}{lg}/summary?event={eid}")
    rossi, gialli = [], []
    for e in s.get("keyEvents", []):
        tt = (e.get("type") or {}).get("type", "")
        if (e.get("team") or {}).get("id") != tid:
            continue
        chi = [p["athlete"]["displayName"] for p in (e.get("participants") or []) if p.get("athlete")]
        if not chi:
            continue
        if tt in ("red-card", "yellow-red-card"):
            rossi.append(chi[0])
        elif tt == "yellow-card":
            gialli.append(chi[0])
    return rossi, gialli


def classifica_espn(lg):
    d = get(f"{STAND}{lg}/standings")
    righe = []
    for e in ((d.get("children") or [{}])[0].get("standings") or {}).get("entries", []):
        v = {s["name"]: s.get("value") for s in e.get("stats", [])}
        righe.append({"team": e["team"].get("shortDisplayName") or e["team"]["displayName"], "pg": int(v.get("gamesPlayed") or 0), "v": int(v.get("wins") or 0),
                      "n": int(v.get("ties") or 0), "p": int(v.get("losses") or 0), "gf": int(v.get("pointsFor") or 0), "gs": int(v.get("pointsAgainst") or 0),
                      "pt": int(v.get("points") or 0), "rank": int(v.get("rank") or 0)})
    righe.sort(key=lambda r: (r["rank"] or 99, -r["pt"]))
    return righe


# ---------- voti AuraPitch della stagione (stessa formula dell'app, live.js votoGiocatore) ----------
DIFESA = ("D", "CB", "CD", "LB", "RB", "SW", "LWB", "RWB", "CD-L", "CD-R")


def _minuto(x):
    m = re.match(r"(\d+)'", str(x or ""))
    return int(m.group(1)) if m else None


def voto_giocatore(st, pos, starter, minuti, gf, gs):
    n = lambda k: float(st.get(k) or 0)
    if minuti < 10 and not (n("totalGoals") or n("goalAssists") or n("redCards")):
        return None
    v = (6 + 1.0 * n("totalGoals") + 0.7 * n("goalAssists") + 0.25 * max(0, n("shotsOnTarget") - n("totalGoals")) + 0.05 * max(0, n("totalShots") - n("shotsOnTarget"))
         + 0.1 * n("foulsSuffered") - 0.1 * n("foulsCommitted") - 0.4 * n("yellowCards") - 1.5 * n("redCards") - 1.0 * n("ownGoals") - 0.05 * n("offsides"))
    if pos == "G":
        v += 0.3 * n("saves") - 0.35 * gs + (0.6 if gs == 0 and minuti >= 60 else 0)
    elif str(pos or "").startswith(DIFESA) and not str(pos or "").startswith("DM"):  # DM = mediano
        v += -0.15 * gs + (0.4 if gs == 0 and minuti >= 60 else 0)
    v += 0.3 if gf > gs else (-0.2 if gf < gs else 0)
    if minuti < 30:
        v = 6 + (v - 6) * max(0.5, minuti / 30)
    return round(max(3, min(10, v)), 1)


def voti_partita(summ):
    """Voti e minuti di ogni giocatore di una partita finita (scheda ESPN)."""
    comp = summ["header"]["competitions"][0]
    lato = {c["team"]["id"]: (0 if c["homeAway"] == "home" else 1) for c in comp["competitors"]}
    g = [0, 0]
    for c in comp["competitors"]:
        g[lato[c["team"]["id"]]] = int(c.get("score") or 0)
    entra, esce = {}, {}
    for e in summ.get("keyEvents") or []:
        if ((e.get("type") or {}).get("type")) == "substitution":
            ps = [p.get("athlete", {}).get("displayName") for p in e.get("participants") or []]
            mi = _minuto((e.get("clock") or {}).get("displayValue"))
            if len(ps) >= 2 and mi is not None:
                entra[ps[0]], esce[ps[1]] = mi, mi
    out = []
    for r in summ.get("rosters") or []:
        j = 0 if r.get("homeAway") == "home" else 1
        for p in r.get("roster") or []:
            a = p.get("athlete") or {}
            nome = a.get("displayName")
            if p.get("starter"):
                minuti = esce.get(nome, 90)
            elif p.get("subbedIn") or nome in entra:
                minuti = max(1, 90 - entra.get(nome, 75))
            else:
                continue
            st = {x["name"]: x.get("value") for x in p.get("stats") or []}
            pos = (p.get("position") or {}).get("abbreviation")
            v = voto_giocatore(st, pos, p.get("starter"), minuti, g[j], g[1 - j])
            out.append({"id": a.get("id"), "n": nome, "team": r.get("team", {}).get("displayName"), "pos": pos, "min": minuti, "v": v,
                        "g": int(st.get("totalGoals") or 0), "a": int(st.get("goalAssists") or 0), "tit": bool(p.get("starter"))})
    return out


PESO_SPINTA = {"shot-on-target": 1.0, "shot-hit-woodwork": 1.0, "shot-off-target": 0.5, "shot-blocked": 0.4, "corner-awarded": 0.3}


def fotografie_diretta(summ):
    """Per il test della 'diretta piu intelligente': al 60' e al 75' risultato e spinta (tiri e angoli negli ultimi 20 minuti) delle due squadre, piu il risultato finale."""
    comp = summ["header"]["competitions"][0]
    nomi = {c["team"]["displayName"]: (0 if c["homeAway"] == "home" else 1) for c in comp["competitors"]}
    fin = [0, 0]
    for c in comp["competitors"]:
        fin[nomi[c["team"]["displayName"]]] = int(c.get("score") or 0)
    ev = []
    for c in summ.get("commentary") or []:
        p = c.get("play") or {}
        lato = nomi.get((p.get("team") or {}).get("displayName"))
        mi = _minuto((c.get("time") or {}).get("displayValue"))
        tp = (p.get("type") or {}).get("type") or ""
        if lato is None or mi is None:
            continue
        ev.append((mi, lato, tp))
    if len(ev) < 20:
        return None
    out = {"fin": fin}
    try:  # quote pre-partita (DraftKings, formato americano) per avere la forza delle squadre nel test
        pc = (summ.get("pickcenter") or [])[0]
        ml = [pc["homeTeamOdds"]["moneyLine"], (pc.get("drawOdds") or {}).get("moneyLine"), pc["awayTeamOdds"]["moneyLine"]]
        if None not in ml:
            out["ml"] = ml
        if pc.get("overUnder") is not None:
            out["ou"] = [pc["overUnder"], pc.get("overOdds"), pc.get("underOdds")]
    except (IndexError, KeyError, TypeError):
        pass
    for t in (60, 75):
        g = [0, 0]
        sp = [0.0, 0.0]
        for mi, lato, tp in ev:
            if mi <= t and (tp.startswith("goal") or tp == "penalty---scored"):
                g[lato if "own" not in tp else 1 - lato] += 1
            if t - 20 < mi <= t:
                sp[lato] += PESO_SPINTA.get(tp, 0)
        out[str(t)] = {"g": g, "sp": [round(x, 1) for x in sp]}
    return out


def giro_voti(base="data", giorni=4, massimo=350):
    """Aggiunge all'archivio della stagione i voti delle partite finite negli ultimi giorni (e recupera le precedenti, fino a 'massimo' schede per giro)."""
    path = os.path.join(base, "espn", "voti.json")
    try:
        with open(path, encoding="utf-8") as f:
            arch = json.load(f)
    except (OSError, ValueError):
        arch = {"fatte": [], "g": {}, "inizio": None}
    fatte, G = set(arch.get("fatte", [])), arch.get("g", {})
    dpath = os.path.join(base, "espn", "diretta.json")
    try:
        with open(dpath, encoding="utf-8") as f:
            dir_ = json.load(f)
    except (OSError, ValueError):
        dir_ = {}
    ora = datetime.now(timezone.utc)
    inizio = datetime(ora.year if ora.month >= 7 else ora.year - 1, 8, 1, tzinfo=timezone.utc)
    nuove, errori, ultimo_err = 0, 0, ""
    scans = set(arch.get("giorni", []))  # "lega|giorno" gia controllati (solo giorni chiusi da almeno 3 giorni)
    giorno_ev = {}
    for k, lg in ESPN_LG.items():
        if k in NAZIONALI:
            continue  # voti AuraPitch: solo club
        evs, w = [], inizio
        while w.date() <= ora.date():  # un giorno per richiesta: ESPN rifiuta gli intervalli di date
            chiave = f"{k}|{w.strftime('%Y%m%d')}"
            if chiave not in scans and nuove < massimo:
                try:
                    trovati = get(f"{SITE}{lg}/scoreboard?dates={w.strftime('%Y%m%d')}").get("events", [])
                    evs += trovati
                    if (ora - w).days >= 3:
                        giorno_ev[chiave] = [e["id"] for e in trovati if e["status"]["type"].get("completed")]
                except Exception as e:  # noqa: BLE001
                    errori += 1
                    ultimo_err = f"{k} {w.date()}: {str(e)[:150]}"
                    print(f"Voti {ultimo_err}")
            w = w + timedelta(days=1)
        for ev in evs:
            if nuove >= massimo:
                break
            if (ev["id"] in fatte and ev["id"] in dir_) or not ev["status"]["type"].get("completed"):
                continue
            gia_votata = ev["id"] in fatte
            try:
                summ = get(f"{SITE}{lg}/summary?event={ev['id']}")
                righe = voti_partita(summ)
                foto = fotografie_diretta(summ)
                dir_[ev["id"]] = {"lg": k, "t": ev["date"], **foto} if foto else {"vuota": True}
            except Exception as e:  # noqa: BLE001
                print(f"Voti {k} {ev['id']}: {e}")
                continue
            fatte.add(ev["id"])
            nuove += 1
            for r in ([] if gia_votata else righe):
                if not r["id"]:
                    continue
                x = G.setdefault(r["id"], {"n": r["n"], "t": r["team"], "lg": k, "pos": r["pos"], "p": 0, "tit": 0, "min": 0, "sv": 0.0, "nv": 0, "g": 0, "a": 0})
                x.update({"n": r["n"], "t": r["team"], "lg": k, "pos": x["pos"] if r["pos"] in (None, "SUB") else r["pos"]})
                x["p"] += 1
                x["tit"] += 1 if r["tit"] else 0
                x["min"] += r["min"]
                x["g"] += r["g"]
                x["a"] += r["a"]
                if r["v"] is not None:
                    x["sv"] = round(x["sv"] + r["v"], 1)
                    x["nv"] += 1
    with open(dpath, "w", encoding="utf-8") as f:
        json.dump(dir_, f, separators=(",", ":"))
    # un giorno e chiuso quando tutte le sue partite finite sono nell'archivio (altrimenti si riprende al prossimo giro)
    for chiave, ids in giorno_ev.items():
        if all(i in fatte and i in dir_ for i in ids):
            scans.add(chiave)
    arch = {"fatte": sorted(fatte), "giorni": sorted(scans), "g": G, "completo": nuove < massimo, "errori": errori, "ultimo_errore": ultimo_err, "agg": ora.isoformat()}
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(arch, f, ensure_ascii=False, separators=(",", ":"))
    # file leggero per l'app: id -> [voto medio, partite con voto, minuti, gol, assist, nome, squadra, campionato, ruolo]
    app = {i: [round(x["sv"] / x["nv"], 2), x["nv"], x["min"], x["g"], x["a"], x["n"], x["t"], x["lg"], x.get("pos")] for i, x in G.items() if x["nv"]}
    os.makedirs(os.path.join("app", "data"), exist_ok=True)
    with open(os.path.join("app", "data", "voti.json"), "w", encoding="utf-8") as f:
        json.dump(app, f, separators=(",", ":"))
    print(f"Voti: {nuove} partite nuove, {len(G)} giocatori, archivio {'completo' if arch['completo'] else 'in recupero'}, errori {errori}")


def giro_arbitri(base="data", giorni=3):
    """Arbitri designati per le partite dei prossimi giorni (ESPN: scoreboard, o la scheda della partita se manca).
    Serve quando football-data.org non ha ancora il nome dell'arbitro."""
    ora = datetime.now(timezone.utc)
    out = []
    for k, lg in ESPN_LG.items():
        evs = []
        for dd in range(giorni + 1):  # un giorno per richiesta: ESPN rifiuta gli intervalli di date
            try:
                evs += get(f"{SITE}{lg}/scoreboard?dates={(ora + timedelta(days=dd)).strftime('%Y%m%d')}").get("events", [])
            except Exception as e:  # noqa: BLE001
                print(f"ESPN arbitri {k}: {e}")
        for ev in evs:
            try:
                c = ev["competitions"][0]
                if ev["status"]["type"].get("completed"):
                    continue
                uff = c.get("officials") or []
                if not uff and datetime.fromisoformat(ev["date"].replace("Z", "+00:00")) - ora <= timedelta(hours=60):
                    uff = (get(f"{SITE}{lg}/summary?event={ev['id']}").get("gameInfo") or {}).get("officials") or []
                nome = next((o.get("displayName") or o.get("fullName") for o in uff
                             if (o.get("position") or {}).get("name", "Referee").lower() in ("referee", "arbitro") and (o.get("displayName") or o.get("fullName"))), None)
                if not nome and uff:
                    nome = uff[0].get("displayName") or uff[0].get("fullName")
                h = next(x for x in c["competitors"] if x["homeAway"] == "home")["team"]["displayName"]
                a = next(x for x in c["competitors"] if x["homeAway"] == "away")["team"]["displayName"]
                if nome:
                    out.append({"lg": k, "t": ev["date"], "h": h, "a": a, "nome": nome})
            except Exception as e:  # noqa: BLE001
                print(f"ESPN arbitri {k} {ev.get('id')}: {e}")
    try:
        out += arbitri_da_notizie(base, out)
    except Exception as e:  # noqa: BLE001
        print(f"Arbitri dalle notizie: errore {e}")
    os.makedirs(os.path.join(base, "espn"), exist_ok=True)
    with open(os.path.join(base, "espn", "arbitri.json"), "w", encoding="utf-8") as f:
        json.dump({"agg": ora.isoformat(), "partite": out, "diagnosi": DIAG}, f, ensure_ascii=False, separators=(",", ":"))
    print(f"ESPN: arbitri designati trovati {len(out)}")


DIAG = {}
PAROLE_ARB = {"it": ("arbitro", "arbitra", "arbitrer", "designaz", "fischietto", "direttore di gara"), "en": ("referee", "official"),
              "es": ("arbitro", "colegiado", "arbitrara", "designacion"), "de": ("schiedsrichter", "pfeift", "unparteiische")}
Q_ARB = {"it": "arbitro", "en": "referee", "es": "árbitro", "de": "Schiedsrichter"}


def arbitri_da_notizie(base, gia, giorni=4):
    """Arbitro designato letto dai titoli delle notizie (es. "Roma-Cagliari, arbitra Feliciani").
    Si accettano solo cognomi di arbitri gia presenti nello storico, e solo in titoli che parlano di arbitri."""
    import re
    import urllib.parse
    import fattori as FT
    try:
        with open(os.path.join("app", "data", "giornata.json"), encoding="utf-8") as f:
            gio = json.load(f)
        with open(os.path.join(base, "arbitri.json"), encoding="utf-8") as f:
            noti = json.load(f)
    except (OSError, ValueError):
        return []
    cognomi = {}
    for c, v in noti.items():
        cg = c.split()[-1]
        if len(cg) >= 4 and v.get("n", 0) >= 3:
            cognomi.setdefault(v.get("lega"), {})[cg] = v["nome"]
    ora = datetime.now(timezone.utc)
    out = []
    DIAG.update({"cercate": 0, "errori": 0, "titoli": 0, "titoli_arbitro": 0, "scartate_ambigue": 0})
    for m in gio.get("matches", []):
        try:
            ko = datetime.fromisoformat(m["ko"])
        except (KeyError, ValueError):
            continue
        if m.get("st") != "NS" or not timedelta(0) <= ko - ora <= timedelta(days=giorni):
            continue
        if arbitro_designato(gia, m["lg"], m["h"], m["a"], ko):
            continue
        lingua = FT.LINGUA_LEGA.get(m["lg"], "it")
        hl, gl, ceid, _ = FT.LINGUE[lingua]
        pulito = lambda s: re.sub(r"\b(fc|ac|as|ssc|cf|afc|1907|1909|calcio)\b", "", s, flags=re.I).strip()
        q = f'"{pulito(m["h"])}" "{pulito(m["a"])}" {Q_ARB[lingua]} when:5d'
        try:
            req = urllib.request.Request("https://news.google.com/rss/search?" + urllib.parse.urlencode({"q": q, "hl": hl, "gl": gl, "ceid": ceid}),
                                         headers={"User-Agent": "Mozilla/5.0 (AuraPitch beta)"})
            with urllib.request.urlopen(req, timeout=20) as r:
                titoli = [x["titolo"] for x in FT.leggi_rss(r.read().decode("utf-8", "replace"))]
        except Exception as e:  # noqa: BLE001
            print(f"Notizie arbitro {m['h']}-{m['a']}: {e}")
            DIAG["errori"] += 1
            DIAG["ultimo_errore"] = str(e)[:120]
            continue
        DIAG["cercate"] += 1
        DIAG["titoli"] += len(titoli)
        time.sleep(1)
        lega_cod = {"I2": "I1"}.get(m["lg"], m["lg"])
        nomi = cognomi.get(lega_cod) or {k: v for d in cognomi.values() for k, v in d.items()}
        voti = {}
        for t in titoli:
            p = FT.piano(t)
            if not any(w in p for w in PAROLE_ARB[lingua]):
                continue
            DIAG["titoli_arbitro"] += 1
            c = lambda nome: any(re.search(r"\b" + re.escape(w) + r"\b", p) for w in toks(nome) if len(w) >= 3)
            if not (c(m["h"]) and c(m["a"])):  # il titolo deve nominare entrambe le squadre
                continue
            for cg, nome in nomi.items():
                if re.search(r"\b" + re.escape(cg) + r"\b", p):
                    voti[nome] = voti.get(nome, 0) + 1
        if voti:
            nome = max(voti, key=voti.get)
            out.append({"lg": m["lg"], "t": m["ko"], "h": m["h"], "a": m["a"], "nome": nome, "fonte": "notizie"})
    # lo stesso arbitro non dirige due partite a meno di 2 giorni di distanza: in quel caso il titolo era ambiguo, si scartano
    def t_(x):
        return datetime.fromisoformat(x["t"].replace("Z", "+00:00"))
    n0 = len(out)
    out = [x for x in out if not any(y is not x and y["nome"] == x["nome"] and abs((t_(y) - t_(x)).total_seconds()) < 48 * 3600 for y in out + list(gia))]
    DIAG["scartate_ambigue"] = n0 - len(out)
    print(f"Arbitri dalle notizie: {len(out)}")
    return out


def arbitro_designato(elenco, lg, h, a, ko):
    """Nome dell'arbitro designato per la partita (lg, casa, ospite, calcio d'inizio) dall'elenco di giro_arbitri."""
    best, bs = None, 1.5
    for x in elenco or []:
        if x.get("lg") != lg:
            continue
        try:
            t = datetime.fromisoformat(x["t"].replace("Z", "+00:00"))
        except (KeyError, ValueError):
            continue
        if abs((t - ko).total_seconds()) > 6 * 3600:
            continue
        s = sim(h, [x["h"]]) + sim(a, [x["a"]])
        if s > bs:
            best, bs = x["nome"], s
    return best


def giro_espn(base="data", ore=48):
    try:
        with open(os.path.join("app", "data", "giornata.json"), encoding="utf-8") as f:
            gio = json.load(f)
    except (OSError, ValueError):
        print("ESPN: file dell'app non trovato, salto.")
        return
    ora = datetime.now(timezone.utc)
    squadre = {}
    for m in gio.get("matches", []):
        try:
            ko = datetime.fromisoformat(m["ko"])
        except (KeyError, ValueError):
            continue
        if m.get("lg") in ESPN_LG and m.get("lg") not in NAZIONALI and timedelta(hours=-3) <= ko - ora <= timedelta(hours=ore):
            for sq in (m["h"], m["a"]):
                if sq not in squadre or squadre[sq] in COPPE:  # il campionato vale piu della coppa (rosa, squalifiche)
                    squadre[sq] = m["lg"]
    out = {"agg": ora.isoformat(), "squadre": {}, "classifiche": {}}
    elenco = {}
    for k in sorted(set(squadre.values())):
        try:
            d = get(f"{SITE}{ESPN_LG[k]}/teams")
            elenco[k] = [t["team"] for t in d["sports"][0]["leagues"][0]["teams"]]
        except Exception as e:  # noqa: BLE001 - rete o formato: si salta il campionato
            print(f"ESPN {k}: elenco squadre non disponibile ({e})")
    for nome, k in squadre.items():
        t = trova_squadra(elenco.get(k, []), nome)
        if not t:
            print(f"ESPN: squadra non trovata {nome} ({k})")
            continue
        lg = ESPN_LG[k]
        try:
            r = {"lg": k, "id": t["id"], "rosa": rosa(lg, t["id"]), "risultati": risultati(lg, t["id"])}
            if r["risultati"]:
                ult = r["risultati"][-1]
                rossi, gialli = cartellini(lg, ult["eid"], t["id"])
                r["ultima"] = {"eid": ult["eid"], "t": ult["t"], "rossi": rossi, "gialli": gialli}
            out["squadre"][nome] = r
        except Exception as e:  # noqa: BLE001
            print(f"ESPN {nome}: errore {e}")
    # colori ufficiali delle maglie di tutte le squadre dei campionati (per l'aura delle partite nell'app)
    out["colori"] = {}
    for k, lg in ESPN_LG.items():
        try:
            tt = elenco.get(k) or [t["team"] for t in get(f"{SITE}{lg}/teams")["sports"][0]["leagues"][0]["teams"]]
            out["colori"][k] = [{x: t.get(x) for x in ("displayName", "shortDisplayName", "name", "location", "color", "alternateColor")} for t in tt]
        except Exception as e:  # noqa: BLE001
            print(f"ESPN colori {k}: {e}")
    out["risultati_lega"] = {}
    for k in SOLO_ESPN + COPPE:
        evs = []
        for dd in ((-4, -3, -2, -1, 0, 1, 2, 3) if k in COPPE else (-2, -1, 0)):
            giorno = (ora + timedelta(days=dd)).strftime("%Y%m%d")
            try:
                for ev in get(f"{SITE}{ESPN_LG[k]}/scoreboard?dates={giorno}").get("events", []):
                    c = ev["competitions"][0]
                    h = next(x for x in c["competitors"] if x["homeAway"] == "home")
                    a = next(x for x in c["competitors"] if x["homeAway"] == "away")
                    t = ev["status"]["type"]
                    evs.append({"t": ev["date"], "h": h["team"]["displayName"], "a": a["team"]["displayName"], "st": t["state"], "fine": t.get("completed", False),
                                "g": [int(h.get("score") or 0), int(a.get("score") or 0)]})
            except Exception as e:  # noqa: BLE001
                print(f"ESPN risultati {k} {giorno}: {e}")
        out["risultati_lega"][k] = evs
    for k in SOLO_ESPN:
        try:
            out["classifiche"][k] = classifica_espn(ESPN_LG[k])
        except Exception as e:  # noqa: BLE001
            print(f"ESPN classifica {k}: errore {e}")
    try:
        giro_arbitri(base)
    except Exception as e:  # noqa: BLE001
        print(f"ESPN arbitri: errore {e}")
    try:
        giro_voti(base)
    except Exception as e:  # noqa: BLE001
        print(f"ESPN voti: errore {e}")
    os.makedirs(os.path.join(base, "espn"), exist_ok=True)
    with open(os.path.join(base, "espn", "squadre.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print(f"ESPN: {len(out['squadre'])} squadre con rosa e risultati, classifiche: {list(out['classifiche'])}")


def squalificati(sq):
    """Chi salta la prossima partita: rosso nell'ultima partita, oppure giallo nell'ultima che porta il totale a 5 o 10."""
    u = sq.get("ultima") or {}
    out = []
    for p in sq.get("rosa", []):
        if any(sim(p["n"], [x]) == 1.0 or piano(p["n"]) == piano(x) for x in u.get("rossi", [])):
            out.append({"giocatore": p, "motivo": "rosso nell'ultima partita"})
        elif any(piano(p["n"]) == piano(x) for x in u.get("gialli", [])) and p["gialli"] in SOGLIE_GIALLI:
            out.append({"giocatore": p, "motivo": f"{p['gialli']}a ammonizione nell'ultima partita"})
    return out


def diffidati(sq):
    return [p for p in sq.get("rosa", []) if p["gialli"] + 1 in SOGLIE_GIALLI]


def _decimale(americana):
    """Quota americana ("+255", "-145") in decimale (3,55; 1,69)."""
    try:
        x = float(str(americana).replace("+", ""))
    except (TypeError, ValueError):
        return None
    if x == 0:
        return None
    return round(1 + (x / 100 if x > 0 else 100 / -x), 3)


def quote_espn(base="data", giorni=7):
    """Quote DraftKings dal calendario ESPN per i campionati e le coppe di QUOTE_ESPN (gratuite, nessun credito).
    Scrive data/AAAA-MM-GG/partite_espn.csv con le stesse colonne del file di The Odds API (bookmaker = 1)."""
    import csv
    oggi = datetime.now(timezone.utc)
    righe = []
    medie = medie_football_data()
    usate = 0
    for k, nome in QUOTE_ESPN.items():
        for dd in range(giorni):
            giorno = (oggi + timedelta(days=dd)).strftime("%Y%m%d")
            try:
                evs = get(f"{SITE}{ESPN_LG[k]}/scoreboard?dates={giorno}").get("events", [])
            except Exception as e:  # noqa: BLE001
                print(f"ESPN quote {k} {giorno}: {e}")
                continue
            for ev in evs:
                try:
                    c = (ev.get("competitions") or [{}])[0]
                    h = next(x for x in c["competitors"] if x["homeAway"] == "home")
                    a = next(x for x in c["competitors"] if x["homeAway"] == "away")
                    o = next((x for x in (c.get("odds") or []) if x and x.get("moneyline")), None)
                    if not o or (ev.get("status") or {}).get("type", {}).get("state") != "pre":
                        continue
                    ml = o["moneyline"]
                    q = [_decimale(((ml.get(x) or {}).get("close") or {}).get("odds")) for x in ("home", "draw", "away")]
                    if not all(q) or not all(1.01 < v < 100 for v in q):
                        continue
                    tot = o.get("total") or {}
                    ov, un = (tot.get("over") or {}).get("close") or {}, (tot.get("under") or {}).get("close") or {}
                    linea = o.get("overUnder")
                    qo, qu = _decimale(ov.get("odds")), _decimale(un.get("odds"))
                    r = {"campionato": nome, "casa": h["team"]["displayName"], "ospite": a["team"]["displayName"], "id": "es" + str(ev.get("id")),
                         "inizio": ev.get("date", "").replace("Z", ":00Z") if ev.get("date", "").count(":") == 1 else ev.get("date"), "stato": "NS",
                         "oa_quota_media_1": q[0], "oa_quota_media_X": q[1], "oa_quota_media_2": q[2],
                         "oa_quota_max_1": q[0], "oa_quota_max_X": q[1], "oa_quota_max_2": q[2], "oa_bookmaker_1": 1, "oa_bookmaker_X": 1, "oa_bookmaker_2": 1,
                         "linea": linea if qo and qu else "", "oa_quota_media_Over L": qo or "", "oa_quota_media_Under L": qu or ""}
                    if linea == 2.5 and qo and qu:
                        r.update({"oa_quota_media_Over 2.5": qo, "oa_quota_media_Under 2.5": qu, "oa_quota_max_Over 2.5": qo, "oa_quota_max_Under 2.5": qu,
                                  "oa_bookmaker_Over 2.5": 1, "oa_bookmaker_Under 2.5": 1})
                    # se Football-Data ha la stessa partita, si usa la media di molti bookmaker (più precisa di un bookmaker solo)
                    fd = trova_media(medie.get(k) or [], r["casa"], r["ospite"], ev.get("date", "")[:10])
                    if fd:
                        usate += 1
                        r.update({"oa_quota_media_1": fd["1"], "oa_quota_media_X": fd["X"], "oa_quota_media_2": fd["2"],
                                  "oa_quota_max_1": fd.get("m1") or fd["1"], "oa_quota_max_X": fd.get("mX") or fd["X"], "oa_quota_max_2": fd.get("m2") or fd["2"],
                                  "oa_bookmaker_1": "", "oa_bookmaker_X": "", "oa_bookmaker_2": "", "fonte": "football-data"})
                        if fd.get("O") and fd.get("U"):
                            r.update({"oa_quota_media_Over 2.5": fd["O"], "oa_quota_media_Under 2.5": fd["U"], "oa_quota_max_Over 2.5": fd.get("mO") or fd["O"],
                                      "oa_quota_max_Under 2.5": fd.get("mU") or fd["U"], "oa_bookmaker_Over 2.5": "", "oa_bookmaker_Under 2.5": ""})
                    righe.append(r)
                except Exception as e:  # noqa: BLE001
                    print(f"ESPN quote {k}: partita saltata ({e})")
    if not righe:
        print("ESPN quote: nessuna partita con quote")
        return 0
    cartella = os.path.join(base, datetime.now(timezone.utc).astimezone().strftime("%Y-%m-%d"))
    os.makedirs(cartella, exist_ok=True)
    campi = sorted({c for r in righe for c in r})
    with open(os.path.join(cartella, "partite_espn.csv"), "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=campi)
        w.writeheader()
        w.writerows(righe)
    print(f"ESPN quote: {len(righe)} partite in {len({r['campionato'] for r in righe})} competizioni ({usate} con la media di Football-Data)")
    return len(righe)


def medie_football_data():
    """Quote medie del prossimo turno da Football-Data.co.uk, per codice di campionato AuraPitch."""
    import csv
    import io
    out = {}
    def num(x):
        try:
            v = float(x)
            return v if v > 1 else None
        except (TypeError, ValueError):
            return None
    for nome in ("fixtures.csv", "new_league_fixtures.csv"):
        try:
            req = urllib.request.Request("https://www.football-data.co.uk/" + nome, headers={"User-Agent": "Mozilla/5.0 (AuraPitch beta)"})
            with urllib.request.urlopen(req, timeout=25) as r:
                testo = r.read().decode("utf-8-sig", "replace")
        except Exception as e:  # noqa: BLE001
            print(f"Football-Data {nome}: {e}")
            continue
        for x in csv.DictReader(io.StringIO(testo)):
            if nome == "fixtures.csv":
                k = next((a for a, b in FD_DIV.items() if b == x.get("Div")), None)
                h, a = x.get("HomeTeam"), x.get("AwayTeam")
            else:
                k = next((a for a, (c, l) in FD_NUOVI.items() if c == x.get("Country") and l == x.get("League")), None)
                h, a = x.get("Home"), x.get("Away")
            q = [num(x.get(c)) for c in ("AvgH", "AvgD", "AvgA")]
            if not k or not all(q):
                continue
            try:
                d = datetime.strptime(x.get("Date", ""), "%d/%m/%Y").strftime("%Y-%m-%d")
            except ValueError:
                continue
            out.setdefault(k, []).append({"h": h, "a": a, "d": d, "1": q[0], "X": q[1], "2": q[2], "m1": num(x.get("MaxH")), "mX": num(x.get("MaxD")), "m2": num(x.get("MaxA")),
                                          "O": num(x.get("Avg>2.5")), "U": num(x.get("Avg<2.5")), "mO": num(x.get("Max>2.5")), "mU": num(x.get("Max<2.5"))})
    print("Football-Data: quote medie per", {k: len(v) for k, v in out.items()})
    return out


def trova_media(elenco, casa, ospite, giorno):
    """La partita di Football-Data con le stesse squadre (nomi simili) entro un giorno di distanza."""
    try:
        g0 = datetime.strptime(giorno, "%Y-%m-%d")
    except ValueError:
        return None
    best, bs = None, 0
    for x in elenco:
        try:
            if abs((datetime.strptime(x["d"], "%Y-%m-%d") - g0).days) > 1:
                continue
        except ValueError:
            continue
        s = sim(casa, [x["h"]]) + sim(ospite, [x["a"]])
        if s > bs:
            best, bs = x, s
    return best if bs >= 1.3 else None


def quote_evento(evs, casa, ospite, ko):
    """Quote DraftKings attuali (1X2 e, se la linea e 2,5, Under/Over) della partita casa-ospite nel calendario ESPN,
    con le stesse chiavi del file delle quote (oa_quota_media_...). None se non ci sono."""
    try:
        t0 = datetime.fromisoformat(ko)
    except ValueError:
        return None
    best, bs = None, 0
    for ev in evs:
        try:
            c = (ev.get("competitions") or [{}])[0]
            h = next(x for x in c["competitors"] if x["homeAway"] == "home")["team"]["displayName"]
            a = next(x for x in c["competitors"] if x["homeAway"] == "away")["team"]["displayName"]
            t = datetime.fromisoformat(ev["date"].replace("Z", "+00:00"))
        except (KeyError, StopIteration, ValueError, TypeError):
            continue
        sc = sim(casa, [h]) + sim(ospite, [a])
        if abs((t - t0).total_seconds()) <= 3 * 3600 and sc > bs:
            best, bs = c, sc
    if not best or bs < 1.3:
        return None
    o = next((x for x in (best.get("odds") or []) if x and x.get("moneyline")), None)
    if not o:
        return None
    ml = o["moneyline"]
    q = [_decimale(((ml.get(x) or {}).get("close") or {}).get("odds")) for x in ("home", "draw", "away")]
    if not all(q):
        return None
    r = {"oa_quota_media_1": q[0], "oa_quota_media_X": q[1], "oa_quota_media_2": q[2], "oa_quota_max_1": q[0], "oa_quota_max_X": q[1], "oa_quota_max_2": q[2], "oa_bookmaker_1": 1}
    tot = o.get("total") or {}
    qo, qu = _decimale(((tot.get("over") or {}).get("close") or {}).get("odds")), _decimale(((tot.get("under") or {}).get("close") or {}).get("odds"))
    if o.get("overUnder") == 2.5 and qo and qu:
        r.update({"oa_quota_media_Over 2.5": qo, "oa_quota_media_Under 2.5": qu, "oa_quota_max_Over 2.5": qo, "oa_quota_max_Under 2.5": qu})
    return r
