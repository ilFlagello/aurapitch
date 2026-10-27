"""AuraPitch - mercati cartellini (gialli + rossi) e calci d'angolo.
Modello verificato su 7 campionati (allenamento 2012-2019, verifica 2020-2026):
  cartellini: errore -1,6% rispetto alla sola media del campionato; angoli: -0,4%.
log(media attesa) = b0 + b1 log(media campionato) + b2 log(fatti casa + subiti ospite) + b3 log(fatti ospite + subiti casa) + b4 equilibrio
(equilibrio = 1 - |prob. vittoria casa - prob. vittoria ospite|: le partite tirate hanno piu cartellini).
Dati della stagione in corso: CSV di Football-Data.co.uk (gialli, rossi, angoli per partita). Solo libreria standard."""
import csv
import math
from datetime import datetime

A = 0.1  # memoria delle medie mobili
MODELLI = {
    "K": {"pesi": [-0.2514, 0.4352, 0.2868, 0.2932, 0.3276], "r": 333.78, "shrink": 1.0, "linee": (2.5, 3.5, 4.5, 5.5, 6.5), "nome": "Cartellini"},
    "C": {"pesi": [0.6648, 0.2173, 0.3001, 0.221, -0.0725], "r": 68.97, "shrink": 0.85, "linee": (7.5, 8.5, 9.5, 10.5, 11.5), "nome": "Calci d'angolo"},
    # falli: verificato su 7 campionati, -5% di errore rispetto alla sola media del campionato
    "F": {"pesi": [-0.0445, -0.1535, 0.5567, 0.5755, 0.158], "r": 133.95, "shrink": 1.0, "linee": (19.5, 21.5, 23.5, 25.5, 27.5, 29.5, 31.5), "nome": "Falli"},
}
# arbitro: rapporto tra i suoi cartellini/falli e la media del campionato, con memoria (RA) e prudenza (K partite virtuali nella media).
# Verificato su Premier League e Championship (2012-2026): cartellini -0,7% di errore, falli -1,1/-1,4%.
ARBITRO = {"K": 20, "RA": 0.05, "beta": {"K": 0.3198, "F": 1.3951}}


def chiave_arbitro(nome):
    """'Anthony Taylor' e 'A Taylor' diventano la stessa chiave: iniziale + cognome."""
    import unicodedata
    p = "".join(c for c in unicodedata.normalize("NFD", str(nome or "").lower()) if unicodedata.category(c) != "Mn").replace(".", " ").split()
    return (p[0][0] + " " + p[-1]) if len(p) >= 2 else (p[0] if p else "")


def arbitri(partite):
    """partite: elenco in ordine di data di {arbitro, lega, K (cartellini), F (falli)}. Restituisce per arbitro i rapporti e le medie."""
    lega, out = {}, {}
    for r in partite:
        a = chiave_arbitro(r.get("arbitro"))
        if not a:
            continue
        for k in ("K", "F"):
            x = r.get(k)
            if x is None:
                continue
            m = lega.get((r["lega"], k))
            if m is not None and m > 0.5:
                s = out.setdefault(a, {"nome": r.get("arbitro"), "n": 0, "somma": {}, "peso": {}, "tot": {"K": 0.0, "F": 0.0}, "cnt": {"K": 0, "F": 0}, "lega": r["lega"]})
                s["somma"][k] = s["somma"].get(k, 0.0) * (1 - ARBITRO["RA"]) + x / m
                s["peso"][k] = s["peso"].get(k, 0.0) * (1 - ARBITRO["RA"]) + 1
                s["tot"][k] += x
                s["cnt"][k] += 1
                if k == "K":
                    s["n"] += 1
            lega[(r["lega"], k)] = max(x, 1.0) if m is None else m + 0.01 * (x - m)
    for a, s in out.items():
        s["ratio"] = {k: (s["somma"].get(k, 0) + ARBITRO["K"]) / (s["peso"].get(k, 0) + ARBITRO["K"]) for k in ("K", "F")}
        s["media"] = {k: (s["tot"][k] / s["cnt"][k]) if s["cnt"][k] else None for k in ("K", "F")}
    return out, {k: v for k, v in lega.items()}


def _num(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return None


def medie_stagione(path):
    """Medie mobili per squadra (fatti/subiti) di cartellini e angoli, e media del campionato, da un CSV di Football-Data."""
    try:
        with open(path, encoding="utf-8-sig", errors="replace") as f:
            righe = list(csv.DictReader(f))
    except OSError:
        return None
    def data(r):
        for fmt in ("%d/%m/%Y", "%d/%m/%y"):
            try:
                return datetime.strptime(r.get("Date", ""), fmt)
            except ValueError:
                pass
        return datetime.min
    righe.sort(key=data)
    sq, lega = {}, {"K": None, "C": None, "F": None}
    for r in righe:
        v = {k: _num(r.get(k)) for k in ("HY", "AY", "HR", "AR", "HC", "AC")}
        if None in v.values():
            continue
        dati = {"K": (v["HY"] + v["HR"], v["AY"] + v["AR"]), "C": (v["HC"], v["AC"])}
        hf, af = _num(r.get("HF")), _num(r.get("AF"))
        if hf is not None and af is not None:
            dati["F"] = (hf, af)
        for k, (x, y) in dati.items():
            lega[k] = (x + y) if lega[k] is None else lega[k] + 0.02 * ((x + y) - lega[k])
            for team, f_, s_ in ((r["HomeTeam"], x, y), (r["AwayTeam"], y, x)):
                t = sq.setdefault(team, {"n": 0})
                if k + "f" not in t:
                    t[k + "f"], t[k + "s"] = f_, s_
                else:
                    t[k + "f"] += A * (f_ - t[k + "f"])
                    t[k + "s"] += A * (s_ - t[k + "s"])
        sq[r["HomeTeam"]]["n"] += 1
        sq[r["AwayTeam"]]["n"] += 1
    return {"squadre": sq, "lega": lega}


def _pmf(k, mu, r):
    return math.exp(math.lgamma(k + r) - math.lgamma(r) - math.lgamma(k + 1) + r * math.log(r / (r + mu)) + k * math.log(mu / (r + mu)))


def linee(k, mu):
    """Righe Over/Under [codice, prob, quota equa, 0] per la statistica k con media attesa mu."""
    M, out = MODELLI[k], []
    for L in M["linee"]:
        po = 1 - sum(_pmf(i, mu, M["r"]) for i in range(int(L) + 1))
        for c, p in ((f"{k}O{L}", po), (f"{k}U{L}", 1 - po)):
            if 0.03 < p < 0.97:
                out.append([c, round(p, 4), round(max(1.01, 0.94 / p), 2), 0])
    return out


def con_arbitro(m, arb):
    """Aggiorna cartellini e falli di una partita gia calcolata quando l'arbitro viene designato dopo (arb: ratio K/F)."""
    cart = m.get("cart") or {}
    if not arb or not arb.get("ratio"):
        return False
    nuove = {}
    for k, beta in ARBITRO["beta"].items():
        if k in cart and cart[k].get("senza_arbitro"):
            mu = cart[k]["senza_arbitro"] * arb["ratio"][k] ** beta
            cart[k]["attesi"] = round(mu, 2)
            nuove[k] = linee(k, mu)
    if not nuove:
        return False
    tieni = lambda x: not (isinstance(x, list) and str(x[0])[:1] in nuove and str(x[0])[1:2] in ("O", "U"))
    agg = [r for k in nuove for r in nuove[k]]
    m["markets"] = [x for x in m.get("markets", []) if tieni(x)] + agg
    m["_extra"] = [x for x in m.get("_extra", []) if tieni(x)] + agg
    return True


def mercati(med, casa, ospite, p1, p2, arb=None):
    """Mercati Over/Under di cartellini, angoli e falli per una partita (con l'arbitro designato, se noto). casa/ospite: nomi come nel CSV. None se mancano i dati."""
    if not med:
        return None, None
    h, a = med["squadre"].get(casa), med["squadre"].get(ospite)
    if not h or not a or h["n"] < 4 or a["n"] < 4:
        return None, None
    eq = 1 - abs(p1 - p2)
    out, info = [], {}
    for k, M in MODELLI.items():
        lg = med["lega"][k]
        if not lg:
            continue
        w = M["pesi"]
        if k + "f" not in h or k + "f" not in a:
            continue
        mu = math.exp(sum(wi * xi for wi, xi in zip(w, [1, math.log(max(lg, .1)), math.log(max(h[k + "f"] + a[k + "s"], .1)), math.log(max(a[k + "f"] + h[k + "s"], .1)), eq])))
        mu = math.exp(math.log(lg) + M["shrink"] * (math.log(mu) - math.log(lg)))
        senza = mu
        if arb and k in ARBITRO["beta"] and arb.get("ratio"):
            mu *= arb["ratio"][k] ** ARBITRO["beta"][k]
        info[k] = {"attesi": round(mu, 2), "senza_arbitro": round(senza, 2), "media_lega": round(lg, 2), "casa": [round(h[k + "f"], 2), round(h[k + "s"], 2)], "ospite": [round(a[k + "f"], 2), round(a[k + "s"], 2)]}
        out += linee(k, mu)
    return out, info
