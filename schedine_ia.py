"""AuraPitch - storico delle schedine IA per stile (Zero Tachicardia, La Classica, Colpaccio da Bar). Solo libreria standard.

Ogni giorno, alla prima occasione (giro del mattino), il server costruisce la schedina "di base" di ogni stile con le partite
del giorno non ancora iniziate: stesse regole dell'app (PROFILI_SLIP e buildSlip in app/src/base.js, numero di partite
dello stile, nessuna quota obiettivo, solo esiti delle partite). La schedina si salva e non cambia piu; a partite finite viene
verificata sul risultato. test/test_app.mjs controlla che questa copia in Python scelga le stesse giocate dell'app.

File pubblico (nessun dato personale): app/data/schedine_ia.json
  {"giorni": {"2026-11-03": {"0": {"legs": [...], "q": quota, "p": prob. IA, "esito": null/1/0}, "1": ..., "2": ...}},
   "mese": {"0": {"giocate", "passate", "punti", "q_media"}, ...}, "agg": ...}
Rendimento in punti: 1 punto su ogni schedina, alla quota totale mostrata (vinta = quota - 1, persa = -1). Nessun denaro."""
import json
import math
import os
import re
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import mercati as M

OUT = os.path.join("app", "data", "schedine_ia.json")
ROME = ZoneInfo("Europe/Rome")
GIORNI = 62  # storico tenuto: due mesi

# copia di PROFILI_SLIP (app/src/base.js): il test controlla che restino uguali
QUOTA_MIN = 1.3
PROFILI_SLIP = [
    {"nome": "Zero Tachicardia", "n": 3, "lo": 1.3, "hi": 1.6, "mid": 1.42, "pmin": 0.62, "pmax": 1, "wp": 1.3, "ws": 0.6, "wv": 0.5, "wm": 3.5},
    {"nome": "La Classica", "n": 4, "lo": 1.5, "hi": 2.05, "mid": 1.72, "pmin": 0.48, "pmax": 0.68, "wp": 1.2, "ws": 0.6, "wv": 0.7, "wm": 2.5},
    {"nome": "Colpaccio da Bar", "n": 3, "lo": 2.0, "hi": 3.6, "mid": 2.55, "pmin": 0.28, "pmax": 0.52, "wp": 1.8, "ws": 0.5, "wv": 1.0, "wm": 1.5},
]
ESCLUSI_SLIP = ("Pari/Dispari", "Risultato esatto")
MERCATI_ESCLUSI = [re.compile(r"Cartellini|Falli|angolo|Parziale|Gol esatti|Margine|Tempo|tempo|Combo|Handicap"),
                   re.compile(r"Cartellini|Falli|angolo|Parziale|Gol esatti|Margine|Tempo|tempo"), None]
TIP_STILE = ("prudente", "consiglio", "coraggiosa")


def gruppo(c):
    """Copia di mGroup (app/src/base.js)."""
    if c.startswith("MARC:"):
        return "Marcatori"
    if c.startswith("AMM:"):
        return "Cartellini giocatori"
    if c.startswith("ASS:"):
        return "Assist"
    if re.match(r"^[KCF][HA][OU]\d", c):
        return {"K": "Cartellini", "C": "Calci d'angolo", "F": "Falli"}[c[0]] + " squadra"
    if re.match(r"^K[OU]\d", c):
        return "Cartellini"
    if re.match(r"^C[OU]\d", c):
        return "Calci d'angolo"
    if re.match(r"^F[OU]\d", c):
        return "Falli"
    if "+" in c:
        return "Combo"
    if c.startswith("T1:"):
        return "Primo tempo"
    if c.startswith("T2:"):
        return "Secondo tempo"
    if c.startswith("PF"):
        return "Parziale/finale"
    if c.startswith("TPG"):
        return "Tempo con più gol"
    if c in ("HSET", "ASET", "HVET", "AVET"):
        return "Tempi"
    if c.startswith("EH"):
        return "Handicap"
    if c.startswith("MV"):
        return "Margine di vittoria"
    if c.startswith("GE"):
        return "Gol esatti"
    if c in ("1", "X", "2"):
        return "Esito finale"
    if c in ("1X", "X2", "12"):
        return "Doppia chance"
    if c in ("GG", "NG"):
        return "Goal/No Goal"
    if c in ("PARI", "DISPARI"):
        return "Pari/Dispari"
    if c.startswith("CS"):
        return "Risultato esatto"
    if c.startswith("MG"):
        return "Multigol"
    if re.match(r"^[HA](GE|[OU])", c):
        return "Gol squadra"
    return "Under/Over"


def _r2(x):
    return math.floor(x * 100 + 0.5) / 100  # come Math.round(x * 100) / 100


def opzioni(m):
    """Copia di options() per i mercati completi: {k, p, q, stima, s}."""
    out = []
    for r in m.get("markets") or []:
        c, p, q, qm = r[0], r[1], r[2], r[3]
        sc = r[4] if len(r) > 4 else None
        out.append({"k": c, "p": p, "q": q or _r2(max(1.01, 0.94 / p)), "stima": not qm, "s": sc})
    return out


def quota_ideale(prof, n):
    R = PROFILI_SLIP[prof]
    return R["mid"] if not n or n == R["n"] else min(R["hi"], max(R["lo"], math.exp(R["n"] * math.log(R["mid"]) / n)))


def _punteggio(o, R, tip):
    s = (o["s"] if o["s"] is not None else 50) / 100
    valore = 0 if o["stima"] else max(-0.3, min(0.4, o["p"] * o["q"] - 1))
    return R["ws"] * s + R["wp"] * o["p"] + R["wv"] * valore + (0 if o["stima"] else 0.03) + (0.12 if tip and tip.get("c") == o["k"] else 0)


def candidati(m, prof, allarga=0, ideale=0):
    """Copia di candidati() con le impostazioni della schedina di base: nessuna quota obiettivo, nessuna variante, solo esiti."""
    R, ex = PROFILI_SLIP[prof], MERCATI_ESCLUSI[prof]
    tip = (m.get("tip") or {}).get(TIP_STILE[prof]) if isinstance(m.get("tip"), dict) else None
    libera = allarga >= 9
    lo = QUOTA_MIN if libera else max(QUOTA_MIN, R["lo"] * (1 - 0.06 * allarga))
    hi = 8 if libera else R["hi"] * (1 + 0.12 * allarga)
    pmin = 0.1 if libera else R["pmin"] - 0.04 * allarga
    pmax = 1 if libera else R["pmax"] + 0.04 * allarga
    qi = ideale or R["mid"]
    out = []
    for o in opzioni(m):
        g = gruppo(o["k"])
        if re.match(r"^(MARC|ASS|AMM):", o["k"]) or g in ESCLUSI_SLIP or (ex and ex.search(g)) or (prof < 2 and re.match(r"^EH[MP]2", o["k"])):
            continue
        if lo <= o["q"] <= hi and pmin <= o["p"] <= pmax:
            out.append(dict(o, sc=_punteggio(o, R, tip) - R["wm"] * abs(math.log(o["q"] / qi))))
    out.sort(key=lambda x: -x["sc"])  # ordinamento stabile, come Array.sort
    return out


def schedina(matches, prof):
    """Copia di buildSlip(matches, prof) con numero di partite dello stile: in ogni partita la giocata migliore, poi le partite migliori."""
    n = PROFILI_SLIP[prof]["n"]
    ideale = quota_ideale(prof, n)
    pool = []
    for allarga in (0, 1, 2, 9):
        pool = [(m, c) for m in matches for c in [candidati(m, prof, allarga, ideale)] if c]
        if len(pool) >= n:
            break
    pool.sort(key=lambda x: -x[1][0]["sc"])
    return [dict(c[0], m=m) for m, c in pool[:n]]


def probabilita(legs):
    p = 1.0
    for x in legs:
        p *= x["p"]
    return p


def esito(c, g, g1):
    try:
        return M.valuta(c, g[0], g[1], *(g1 or [None, None]))
    except (ValueError, IndexError):
        return None


def riassunto(giorni, mese):
    out = {}
    for s in ("0", "1", "2"):
        z = [v[s] for k, v in giorni.items() if k[:7] == mese and v.get(s) and v[s].get("esito") is not None]
        passate = [x for x in z if x["esito"]]
        out[s] = {"nome": PROFILI_SLIP[int(s)]["nome"], "giocate": len(z), "passate": len(passate),
                  "punti": round(sum((x["q"] - 1) if x["esito"] else -1 for x in z), 2),
                  "q_media": round(sum(x["q"] for x in z) / len(z), 2) if z else None,
                  "attese": round(sum(x["p"] for x in z), 2)}
    return out


def aggiorna(d, ora=None, path=OUT):
    """Costruisce la schedina del giorno (una volta) e verifica quelle aperte. d = file dell'app (giornata.json)."""
    ora = ora or datetime.now(timezone.utc)
    oggi = ora.astimezone(ROME).date().isoformat()
    try:
        with open(path, encoding="utf-8") as f:
            arch = json.load(f)
    except (OSError, ValueError):
        arch = {}
    giorni = arch.get("giorni") or {}
    per_id = {m["id"]: m for m in d.get("matches", [])}
    nuove = 0
    if oggi not in giorni:
        def non_iniziata(m):
            try:
                return datetime.fromisoformat(m["ko"]) > ora
            except (KeyError, TypeError, ValueError):
                return False
        pool = [m for m in d.get("matches", []) if m.get("date") == oggi and m.get("st") == "NS" and m.get("markets") and non_iniziata(m)]
        if pool:
            giorni[oggi] = {}
            for prof in range(3):
                legs = schedina(pool, prof)
                if not legs:
                    continue
                q = 1.0
                for x in legs:
                    q *= x["q"]
                giorni[oggi][str(prof)] = {"t": ora.isoformat(timespec="minutes"), "q": round(q, 2), "p": round(probabilita(legs), 4), "esito": None,
                                           "legs": [{"id": x["m"]["id"], "lg": x["m"]["lg"], "h": x["m"]["h"], "a": x["m"]["a"], "ko": x["m"]["ko"],
                                                     "c": x["k"], "q": x["q"], "p": x["p"], "ok": None} for x in legs]}
                nuove += 1
    # verifica: una gamba si chiude con il risultato; partita rinviata = gamba annullata (quota 1); schedina persa alla prima gamba sbagliata
    for giorno, stili in giorni.items():
        for s in stili.values():
            if s.get("esito") is not None:
                continue
            for g in s["legs"]:
                if g.get("ok") is not None:
                    continue
                m = per_id.get(g["id"])
                if m and m.get("st") == "FT" and m.get("g"):
                    g["ok"] = esito(g["c"], m["g"], m.get("g1"))
                    if g["ok"] is not None:
                        g["ok"] = 1 if g["ok"] else 0
                        g["g"] = m["g"]
                elif m and m.get("st") == "RINV":
                    g["ok"], g["nulla"] = 1, 1
            esiti = [g.get("ok") for g in s["legs"]]
            if 0 in esiti:
                s["esito"] = 0
            elif all(e == 1 for e in esiti):
                s["esito"] = 1
                s["q"] = round(math.prod(1.0 if g.get("nulla") else g["q"] for g in s["legs"]), 2)
            elif giorno < (ora.date() - timedelta(days=4)).isoformat():
                s["esito"] = -1  # partita sparita dal file senza risultato: non verificabile, fuori dai conti
    limite = (ora.date() - timedelta(days=GIORNI)).isoformat()
    giorni = {k: v for k, v in sorted(giorni.items()) if k >= limite}
    mese = oggi[:7]
    prec = (datetime.fromisoformat(mese + "-01") - timedelta(days=1)).strftime("%Y-%m")
    out = {"agg": ora.astimezone(ROME).strftime("%d/%m/%Y %H:%M"), "stili": [p["nome"] for p in PROFILI_SLIP],
           "mese": riassunto(giorni, mese), "mese_prima": riassunto(giorni, prec), "giorni": giorni}
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print(f"Schedine IA per stile: {nuove} nuove oggi, {len(giorni)} giorni in archivio")
    return out
