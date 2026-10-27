"""AuraPitch - genera i dati dell'app (app/data/giornata.json) dai dati raccolti.

  python3 genera_app.py           giro completo (mattino): partite da ieri a +3 giorni, quote medie, letture,
                                  classifiche, ultime 5, precedenti
  python3 genera_app.py --live    aggiorna solo stato e risultato delle partite (durante il giorno)

Fonti: data/AAAA-MM-GG/partite.csv (quote medie, The Odds API) e data/fd/*.json (football-data.org,
risultati di Serie B da The Odds API). Usa solo la libreria standard di Python.
"""
import csv
import glob
import json
import os
import re
import sys
import unicodedata
import zlib

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


def quote_di(r):
    src = "oa_" if r.get("oa_quota_media_1") else "af_"
    q = {e: fnum(r.get(f"{src}quota_media_{e}")) for e in ("1", "X", "2", "Over 2.5", "Under 2.5")}
    mx = {e: fnum(r.get(f"{src}quota_max_{e}")) for e in ("1", "X", "2", "Over 2.5", "Under 2.5")}
    if not all(q[e] for e in ("1", "X", "2")):
        return None
    inv = [1 / q[e] for e in ("1", "X", "2")]
    s = sum(inv)
    mk = [round(v / s, 4) for v in inv]
    mo = None
    if q["Over 2.5"] and q["Under 2.5"]:
        io = 1 / q["Over 2.5"], 1 / q["Under 2.5"]
        mo = round(io[0] / sum(io), 4)
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
            st, g = "NS", None
            sc = scores.get((" ".join(sorted(toks(r["casa"]))), " ".join(sorted(toks(r["ospite"])))))
            if sc and None not in sc:
                try:
                    st, g = "FT", [int(sc[0]), int(sc[1])]
                except (TypeError, ValueError):
                    pass
        t0 = r["_t"]
        l5 = [ultime5(per_team, hid, t0), ultime5(per_team, aid, t0)] if code else [[], []]
        prec, h2h = precedenti(m_fd["id"], hid, aid) if m_fd else ({"tone": "ok", "text": "Precedenti non disponibili per questo campionato nei dati gratuiti."}, [])
        rh, ra = (riposo(per_team, hid, t0), riposo(per_team, aid, t0)) if code else (None, None)
        if rh is not None and ra is not None and abs(rh - ra) >= 3:
            ctx = {"tone": "info", "text": f"{h if rh > ra else a} ha {abs(rh - ra)} giorni di riposo in più."}
        elif rh is not None and ra is not None:
            ctx = {"tone": "ok", "text": f"Riposo simile: {rh} giorni per {h}, {ra} per {a} (partite di campionato e coppe nei dati)."}
        else:
            ctx = {"tone": "ok", "text": "Giorni di riposo non disponibili per questo campionato."}
        tabs = classifiche.get(code) if code else None
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
            "forma": [testo_forma(l5[0]), testo_forma(l5[1])] if code else [{"tone": "ok", "text": "Forma non disponibile per questo campionato nei dati gratuiti."}] * 2,
            "attese": [testo_classifica(tabs, hid), testo_classifica(tabs, aid)] if tabs else [{"tone": "ok", "text": "Classifica non disponibile nei dati gratuiti."}] * 2,
            "prec": prec, "ctx": ctx, "flags": [], "last5": l5, "h2h": h2h, "stats": [],
            "markets": [[x["c"], x["p"], x["q"], 1 if x["qm"] else 0] for x in mercati], "tip": tip,
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
        tabs = classifiche.get(code) if code else None
        if tabs:
            conv = lambda rows: [{"team": nome_fd(r.get("team")), "pg": r.get("playedGames", 0), "v": r.get("won", 0), "n": r.get("draw", 0), "p": r.get("lost", 0),
                                  "gf": r.get("goalsFor", 0), "gs": r.get("goalsAgainst", 0), "pt": r.get("points", 0)} for r in rows]
            out["standings"][k] = {"generale": conv(tabs.get("TOTAL", [])), "casa": conv(tabs.get("HOME", [])), "trasferta": conv(tabs.get("AWAY", []))}
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
    return out


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
    return d if cambi else None


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


if __name__ == "__main__":
    main()
