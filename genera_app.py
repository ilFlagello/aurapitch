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
    ("CL", "Champions League", "Europa", "eu", "CL", "Champions League"), ("E0", "Premier League", "Inghilterra", "en", "PL", "Premier League"),
    ("SP1", "LaLiga", "Spagna", "es", "PD", "LaLiga"), ("D1", "Bundesliga", "Germania", "de", "BL1", "Bundesliga"),
]
PRIORITA = ["CL", "I1", "E0", "SP1", "D1", "I2"]
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
    for path in sorted(glob.glob(os.path.join(DATA, "*", "partite.csv"))):
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
    return {"mk": mk, "mo": mo, "odds": {"1": q["1"], "X": q["X"], "2": q["2"], "O": q["Over 2.5"], "U": q["Under 2.5"]},
            "max": {"1": mx["1"], "X": mx["X"], "2": mx["2"], "O": mx["Over 2.5"], "U": mx["Under 2.5"]}, "nb": int(nb) if nb else None}


# ---------- football-data ----------

def nome_fd(team):
    return (team or {}).get("shortName") or (team or {}).get("name") or "?"


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
            per_team.setdefault(tid, []).append({"t": t, "avv": nome_fd(m.get(altro)), "casa": lato == "homeTeam", "gf": gf, "gs": gs})
    for v in per_team.values():
        v.sort(key=lambda z: z["t"])
    return per_team


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
        if es.get("lg") == "I2" and es.get("risultati"):
            per_team["es:" + nome] = [{"t": utc(x["t"].replace("Z", "+00:00") if x["t"].endswith("Z") else x["t"]), "avv": x["avv"], "casa": x["casa"], "gf": x["gf"], "gs": x["gs"]} for x in es["risultati"]]
    cl2 = (esd.get("classifiche") or {}).get("I2")
    if cl2:
        nostri = [n for n, es in (esd.get("squadre") or {}).items() if es.get("lg") == "I2"]
        righe = []
        for i, r in enumerate(cl2):
            mio = next((n for n in nostri if ES.sim(n, [r["team"]]) >= 0.8), None)
            righe.append({"team": {"id": "es:" + (mio or r["team"]), "shortName": mio or r["team"]}, "position": r["rank"] or i + 1, "points": r["pt"], "playedGames": r["pg"],
                          "won": r["v"], "draw": r["n"], "lost": r["p"], "goalsFor": r["gf"], "goalsAgainst": r["gs"]})
        classifiche["ES_I2"] = {"TOTAL": righe}
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
        lh, la = M.gol_attesi(q["mk"], q["mo"])
        raccolte = {c: v for c, v in (("1", q["odds"]["1"]), ("X", q["odds"]["X"]), ("2", q["odds"]["2"]), ("O2.5", q["odds"]["O"]), ("U2.5", q["odds"]["U"])) if v}
        mercati = M.calcola_mercati(lh, la, h, a, raccolte)
        sh = M.statistiche([z for z in per_team.get(hid, []) if z["t"] < t0]) if hid else None
        sa = M.statistiche([z for z in per_team.get(aid, []) if z["t"] < t0]) if aid else None
        pos = {}
        for i, rr in enumerate((tabs or {}).get("TOTAL", [])):
            pos[(rr.get("team") or {}).get("id")] = rr.get("position", i + 1)
        tip = M.scegli(mercati, h, a, sh, sa, {"pos_h": pos.get(hid), "pos_a": pos.get(aid)}, q["nb"])
        if not (sh and sa):
            for v in tip.values():
                v["perche"].append("Statistiche delle squadre non disponibili per questo campionato: il consiglio si basa solo sulle quote.")
        mid = f"{k}-{m_fd['id'] if m_fd else zlib.crc32((h + '|' + a + '|' + loc.date().isoformat()).encode())}"
        out["matches"].append({
            "id": mid, "fd": m_fd["id"] if m_fd else None, "lg": k, "date": loc.strftime("%Y-%m-%d"), "time": loc.strftime("%H:%M"), "ko": t0.isoformat(),
            "h": h, "a": a, "st": st, "g": g, "res": (None if g is None else (0 if g[0] > g[1] else 1 if g[0] == g[1] else 2)), "free": False,
            "p": q["mk"], "mk": q["mk"], "po": q["mo"] if q["mo"] is not None else 0.5, "mo": q["mo"] if q["mo"] is not None else 0.5,
            "odds": q["odds"], "max": q["max"], "nb": q["nb"], "xg": [lh, la], "elo": [None, None],
            "forma": [testo_forma(l5[0]), testo_forma(l5[1])] if (code or hid or aid) else [{"tone": "ok", "text": "Forma non disponibile per questo campionato nei dati gratuiti."}] * 2,
            "attese": [testo_classifica(tabs, hid), testo_classifica(tabs, aid)] if tabs else [{"tone": "ok", "text": "Classifica non disponibile nei dati gratuiti."}] * 2,
            "prec": prec, "ctx": ctx, "flags": [], "last5": l5, "h2h": h2h, "stats": [],
            "markets": [[x["c"], x["p"], x["q"], 1 if x["qm"] else 0] for x in mercati], "tip": tip,
            "xg_mercato": [lh, la], "fattori": [], "foto": r["_foto"],
            "_ctx": {"riposo": [rh, ra], "sh": sh, "sa": sa, "pos_h": pos.get(hid), "pos_a": pos.get(aid), "raccolte": raccolte,
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
    etich = {-1: "Ieri", 0: "Oggi", 1: "Domani"}
    for d in giorni:
        if any(m["date"] == d.isoformat() for m in out["matches"]):
            delta = (d - oggi).days
            out["days"].append({"k": d.isoformat(), "label": etich.get(delta, f"{GG[d.weekday()]} {d.day}")})
    out["today"] = oggi.isoformat()
    out["label"] = f"aggiornati il {out['generato'][:5]} alle {out['generato'][-5:]}"
    squadre = {m["h"] for m in out["matches"]} | {m["a"] for m in out["matches"]}
    for v in out["standings"].values():
        squadre |= {r["team"] for r in v["generale"]}
    out["teams"] = sorted(squadre)
    applica_fattori(out)
    return out


NOTIZIE = os.path.join(DATA, "notizie", "notizie.json")
ESPN = os.path.join(DATA, "espn", "squadre.json")


def applica_fattori(d):
    """Ricalcola gol attesi, mercati e consigli delle partite non iniziate con i fattori (per ora: notizie su indisponibili).
    Base = lettura delle quote; ogni fattore pesa secondo fattori.py e la somma per squadra ha un tetto. Restituisce quante partite cambiano."""
    notizie = jload(NOTIZIE, {}) or {}
    espn = (jload(ESPN, {}) or {}).get("squadre", {})
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
            foto = datetime.fromisoformat(m.get("foto", "2000-01-01") + "T06:00:00+00:00")
            ko = datetime.fromisoformat(m["ko"])
        except ValueError:
            foto, ko = None, None
        tutti, tot, segnali, diffidati = [], [0.0, 0.0], [], []
        for lato, sq in enumerate((m["h"], m["a"])):
            items = (notizie.get(sq) or {}).get("items", [])
            es = espn.get(sq) or {}
            if es.get("rosa"):
                gioc, gol = es["rosa"], sum(x["g"] for x in es["rosa"]) or None
                squal = ES.squalificati(es) if prossima.get(sq) == m["ko"] else []
                diffidati += [{"chi": p["n"], "lato": lato, "gialli": p["gialli"]} for p in ES.diffidati(es) if p["g"] + p["a"] > 0 or p["tit"] >= 3]
            else:
                gioc, gol, squal = [g for g in marc.get(m["lg"], []) if g["t"] == sq], (c.get("gol") or [None, None])[lato], []
            lista, t, sg = FT.fattori_squadra(sq, lato, items, gioc, gol, foto, ko, squal, prossima.get(sq) == m["ko"])
            tutti += lista
            tot[lato] = t
            segnali += [dict(x, lato=lato) for x in sg]
        rr = c.get("riposo") or [None, None]
        if None not in rr and abs(rr[0] - rr[1]) >= 3:
            segnali.append({"tipo": "riposo", "lato": 0 if rr[0] > rr[1] else 1, "titolo": f"{abs(rr[0] - rr[1])} giorni di riposo in più", "fonte": "", "link": "", "t": ""})
        m["segnali"] = segnali[:6]
        m["diffidati"] = diffidati[:8]
        nuovo = [round(lh0 * (1 + tot[0]), 3), round(la0 * (1 + tot[1]), 3)]
        firma = zlib.crc32(json.dumps([tutti, nuovo, segnali], sort_keys=True).encode())
        if firma == m.get("_firma"):
            continue
        m["_firma"] = firma
        cambi += 1
        m["fattori"] = [{k: f.get(k) for k in ("tipo", "chi", "lato", "quota", "affidabilita", "prezzo", "delta", "titolo", "fonte", "link", "t", "tetto")} for f in tutti][:10]
        lh, la = nuovo
        m["xg"] = nuovo
        mercati = M.calcola_mercati(lh, la, m["h"], m["a"], c.get("raccolte") or {})
        pm = {x["c"]: x["p"] for x in mercati}
        if any(f["delta"] for f in tutti):
            m["p"] = [round(pm.get("1", 0), 4), round(pm.get("X", 0), 4), round(pm.get("2", 0), 4)]
            m["po"] = round(pm.get("O2.5", 0.5), 4)
        else:
            m["p"], m["po"] = m["mk"], m["mo"]
        tip = M.scegli(mercati, m["h"], m["a"], c.get("sh"), c.get("sa"), {"pos_h": c.get("pos_h"), "pos_a": c.get("pos_a")}, m.get("nb"))
        righe = []
        for f in tutti:
            if not f["delta"]:
                continue
            sq = m["h"] if f["lato"] == 0 else m["a"]
            righe.append((f"Squalifica: {f['chi']} ({f['titolo'].split(': ', 1)[-1]}). " if f.get("fonte_tipo") == "cartellini" else
                          f"Notizia ({f['fonte'] or 'stampa'}): {f['chi']} {dict(squalifica='squalificato', infortunio='indisponibile', dubbio='in dubbio').get(f['tipo'], f['tipo'])}. ")
                         + f"Gol attesi di {sq} corretti del {str(round(f['delta'] * 100, 1)).replace('.', ',')}%" + (" (in parte già nelle quote)." if f["prezzo"] < 1 else "."))
        for v in tip.values():
            if not (c.get("sh") and c.get("sa")):
                v["perche"].append("Statistiche delle squadre non disponibili per questo campionato: il consiglio si basa solo sulle quote.")
            v["perche"] += righe
        m["markets"] = [[x["c"], x["p"], x["q"], 1 if x["qm"] else 0] for x in mercati]
        m["tip"] = tip
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
        if (st, g) != (m.get("st"), m.get("g")):
            m["st"], m["g"], m["res"] = st, g, res
            cambi += 1
    d["generato"] = datetime.now(timezone.utc).astimezone(ROME).strftime("%d/%m/%Y %H:%M")
    d["label"] = f"aggiornati il {d['generato'][:5]} alle {d['generato'][-5:]}"
    print(f"Partite aggiornate: {cambi}")
    nf = applica_fattori(d)
    print(f"Partite ricalcolate con le notizie: {nf}")
    return d if (cambi or nf) else None


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
            r = {"date": m["date"], "lg": m["lg"], "h": m["h"], "a": m["a"], "st": m["st"], "g": m.get("g"), "mk": m.get("mk"), "p": m.get("p"),
                 "nf": sum(1 for f in m.get("fattori", []) if f.get("delta")), "ver": FT.VERSIONE, "segnali": [x["tipo"] for x in m.get("segnali", [])],
                 "tips": {k: {x: v[x] for x in ("c", "l", "p", "q", "qm")} for k, v in tip.items()}}
            st[m["id"]] = r
        if m["st"] in ("FT", "LIVE", "RINV"):
            r["st"], r["g"] = m["st"], m.get("g")
        if r["st"] == "FT" and r.get("g"):
            r["esiti"] = {k: M.valuta(v["c"], r["g"][0], r["g"][1]) for k, v in r["tips"].items()}
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
    out = {"generato": datetime.now(timezone.utc).astimezone(ROME).strftime("%d/%m/%Y %H:%M"), "giorni": 30, "riass": riass, "taratura": taratura,
           "lista": [{"date": v["date"], "lg": v["lg"], "h": v["h"], "a": v["a"], "g": v["g"], "tips": v["tips"], "esiti": v["esiti"]} for v in rec[:60]]}
    with open(STORICO_OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print(f"Storico consigli: {len(chiuse)} partite verificate, {len(st)} salvate")


def main():
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
    aggiorna_storico(d)


if __name__ == "__main__":
    main()
