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
}


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
    sq, lega = {}, {"K": None, "C": None}
    for r in righe:
        v = {k: _num(r.get(k)) for k in ("HY", "AY", "HR", "AR", "HC", "AC")}
        if None in v.values():
            continue
        dati = {"K": (v["HY"] + v["HR"], v["AY"] + v["AR"]), "C": (v["HC"], v["AC"])}
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


def mercati(med, casa, ospite, p1, p2):
    """Mercati Over/Under di cartellini e angoli per una partita. casa/ospite: nomi come nel CSV. None se mancano i dati."""
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
        x = [1, math.log(max(lg, .1)), math.log(max(h[k + "f"] + a[k + "s"], .1)), math.log(max(a[k + "f"] + h[k + "s"], .1)), eq]
        mu = math.exp(sum(wi * xi for wi, xi in zip(w, x)))
        mu = math.exp(math.log(lg) + M["shrink"] * (math.log(mu) - math.log(lg)))
        info[k] = {"attesi": round(mu, 2), "media_lega": round(lg, 2), "casa": [round(h[k + "f"], 2), round(h[k + "s"], 2)], "ospite": [round(a[k + "f"], 2), round(a[k + "s"], 2)]}
        for L in M["linee"]:
            po = 1 - sum(_pmf(i, mu, M["r"]) for i in range(int(L) + 1))
            for c, p in ((f"{k}O{L}", po), (f"{k}U{L}", 1 - po)):
                if 0.03 < p < 0.97:
                    out.append([c, round(p, 4), round(max(1.01, 0.94 / p), 2), 0])
    return out, info
