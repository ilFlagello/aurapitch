"""AuraPitch - mercati cartellini (gialli + rossi), calci d'angolo e falli. Versione 2 (modello per squadra).
Verificato su 7 campionati (allenamento 2012/13-2019/20, verifica 2020/21-2025/26, 14.605 partite):
un modello per ciascuna squadra (casa e ospite separati), il totale e la somma delle due medie.
  log(media squadra) = b0 + pesi * [log media lega dello stesso lato (casa/ospite), log fatti squadra, log subiti avversaria, casa,
                                    + variabili proprie di ogni statistica (vedi MODELLI)]
Errore (log-loss sulle linee Over/Under) rispetto alla versione 1, sulle stesse partite:
  totali: cartellini -1,2%, angoli -0,1%, falli -1,5%;  per squadra: cartellini -2,0%, angoli -4,7%, falli -1,6%.
Medie mobili con partenza "a media cumulata" (le prime partite della stagione non dipendono dalla sola prima giornata).
Dati della stagione in corso: CSV di Football-Data.co.uk. Solo libreria standard. Funzioni pubbliche compatibili con la versione 1."""
import csv
import math
from datetime import datetime

A = 0.1  # memoria delle medie mobili delle squadre (all'inizio: media cumulata, peso max(A, 1/n))
A_LEGA = 0.02  # memoria della media del campionato (all'inizio: media cumulata)
# pesi per squadra. Variabili: lg_side = log media lega del lato, lg_tot = log media lega totale, t_f = log fatti squadra,
# o_s = log subiti avversaria, home = 1 se in casa, sbil = 1 se |p1-p2| > 0,5, pdiff = prob. vittoria squadra - avversaria,
# eq = 1 - |p1-p2|, ppgdiff = punti a partita squadra - avversaria, t_Ff = log(falli fatti squadra + subiti avversaria),
# arb = log(rapporto arbitro) (solo con arbitro noto; applicato a parte come "beta").
MODELLI = {
    "K": {"b0": -0.9182, "pesi": {"lg_side": 0.4109, "t_f": 0.175, "o_s": 0.2698, "home": -0.091, "sbil": -0.1838, "ppgdiff": -0.0772, "t_Ff": 0.3353},
          "r": 277.68, "r_squadra": 1000.0, "linee": (2.5, 3.5, 4.5, 5.5, 6.5), "nome": "Cartellini"},
    "C": {"b0": 0.4669, "pesi": {"lg_side": 0.2097, "t_f": 0.2251, "o_s": 0.2515, "home": 0.0765, "pdiff": 0.3634},
          "r": 68.85, "r_squadra": 14.17, "linee": (7.5, 8.5, 9.5, 10.5, 11.5), "nome": "Calci d'angolo"},
    "F": {"b0": 0.1874, "pesi": {"lg_side": 0.3686, "lg_tot": -0.4674, "t_f": 0.5452, "o_s": 0.5643, "home": -0.0249, "eq": 0.16, "ppgdiff": -0.0227},
          "r": 148.26, "r_squadra": 249.66, "linee": (19.5, 21.5, 23.5, 25.5, 27.5, 29.5, 31.5), "nome": "Falli"},
}
# arbitro: rapporto tra i suoi cartellini/falli e la media del campionato, con memoria (RA) e prudenza (K partite virtuali nella media).
# Esponenti stimati nello stesso modello (Premier League e Championship, verifica 2020-2026):
# cartellini 0,91 (-0,95% di errore sulle linee totali con arbitro noto), falli 1,41 (-1,2%).
ARBITRO = {"K": 20, "RA": 0.05, "beta": {"K": 0.9084, "F": 1.4091}}


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
        v = float(x)
        return None if v != v else v
    except (TypeError, ValueError):
        return None


def medie_stagione(path):
    """Medie mobili per squadra (fatti/subiti) di cartellini, angoli e falli, punti in classifica,
    e medie del campionato (totale, squadra di casa, squadra ospite), da un CSV di Football-Data."""
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
    sq, lega, nl = {}, {"K": None, "C": None, "F": None}, {}
    for r in righe:
        h, a = r.get("HomeTeam"), r.get("AwayTeam")
        if not h or not a:
            continue
        gh, ga = _num(r.get("FTHG")), _num(r.get("FTAG"))
        if gh is not None and ga is not None:  # classifica: tutte le partite giocate
            for team, x, y in ((h, gh, ga), (a, ga, gh)):
                t = sq.setdefault(team, {"n": 0})
                t["pt"] = t.get("pt", 0) + (3 if x > y else 1 if x == y else 0)
                t["gp"] = t.get("gp", 0) + 1
        v = {k: _num(r.get(k)) for k in ("HY", "AY", "HR", "AR", "HC", "AC")}
        if None in v.values():
            continue
        dati = {"K": (v["HY"] + v["HR"], v["AY"] + v["AR"]), "C": (v["HC"], v["AC"])}
        hf, af = _num(r.get("HF")), _num(r.get("AF"))
        if hf is not None and af is not None:
            dati["F"] = (hf, af)
        for k, (x, y) in dati.items():
            nl[k] = nl.get(k, 0) + 1
            w = max(A_LEGA, 1.0 / nl[k])
            for kk, xx in ((k, x + y), (k + "h", x), (k + "a", y)):
                lega[kk] = xx if lega.get(kk) is None else lega[kk] + w * (xx - lega[kk])
            for team, f_, s_ in ((h, x, y), (a, y, x)):
                t = sq.setdefault(team, {"n": 0})
                t[k + "n"] = t.get(k + "n", 0) + 1
                w2 = max(A, 1.0 / t[k + "n"])
                if k + "f" not in t:
                    t[k + "f"], t[k + "s"] = f_, s_
                else:
                    t[k + "f"] += w2 * (f_ - t[k + "f"])
                    t[k + "s"] += w2 * (s_ - t[k + "s"])
        sq[h]["n"] += 1
        sq[a]["n"] += 1
    return {"squadre": sq, "lega": lega}


def _pmf(k, mu, r):
    return math.exp(math.lgamma(k + r) - math.lgamma(r) - math.lgamma(k + 1) + r * math.log(r / (r + mu)) + k * math.log(mu / (r + mu)))


def _righe(codice, linee_, mu, r):
    out = []
    for L in linee_:
        po = 1 - sum(_pmf(i, mu, r) for i in range(int(L) + 1))
        for c, p in ((f"{codice}O{L}", po), (f"{codice}U{L}", 1 - po)):
            if 0.03 < p < 0.97:
                out.append([c, round(p, 3), 0, 0])
    return out


def linee(k, mu):
    """Righe Over/Under [codice, prob, quota equa, 0] per la statistica k (totale della partita) con media attesa mu."""
    return _righe(k, MODELLI[k]["linee"], mu, MODELLI[k]["r"])


LINEE_SQUADRA = {"K": (0.5, 1.5, 2.5, 3.5), "C": (2.5, 3.5, 4.5, 5.5, 6.5), "F": (9.5, 10.5, 11.5, 12.5, 13.5, 14.5)}


def linee_squadra(k, lato, mu):
    """Over/Under di una sola squadra: codici KHO1.5 (cartellini casa oltre 1,5), CAU4.5, FHO11.5..."""
    return _righe(f"{k}{lato}", LINEE_SQUADRA[k], mu, MODELLI[k]["r_squadra"])


def con_arbitro(m, arb):
    """Aggiorna cartellini e falli di una partita gia calcolata quando l'arbitro viene designato dopo (arb: ratio K/F)."""
    cart = m.get("cart") or {}
    if not arb or not arb.get("ratio"):
        return False
    nuove = {}
    for k, beta in ARBITRO["beta"].items():
        if k in cart and cart[k].get("senza_arbitro"):
            mu = cart[k]["senza_arbitro"] * arb["ratio"][k] ** beta
            f = mu / max(0.01, cart[k]["attesi"])
            cart[k]["attesi"] = round(mu, 2)
            nuove[k] = linee(k, mu)
            if cart[k].get("squadre"):
                sq = [x * f for x in cart[k]["squadre"]]
                cart[k]["squadre"] = [round(x, 2) for x in sq]
                nuove[k] += linee_squadra(k, "H", sq[0]) + linee_squadra(k, "A", sq[1])
    if not nuove:
        return False
    tieni = lambda x: not (isinstance(x, list) and str(x[0])[:1] in nuove and (str(x[0])[1:2] in ("O", "U") or (str(x[0])[1:2] in ("H", "A") and str(x[0])[2:3] in ("O", "U"))))
    agg = [r for k in nuove for r in nuove[k]]
    m["markets"] = [x for x in m.get("markets", []) if tieni(x)] + agg
    m.pop("_extra", None)
    return True


def _log(x):
    return math.log(max(x, 0.1))


def _media_squadra(k, med, t, o, casa, pt, po):
    """Media attesa (senza arbitro) della squadra t contro o. casa: True se t gioca in casa; pt/po: prob. vittoria t/o."""
    M, lg = MODELLI[k], med["lega"]
    lgF = lg.get("F") or 25.0
    x = {
        "lg_side": _log(lg[k + ("h" if casa else "a")]), "lg_tot": _log(lg[k]),
        "t_f": _log(t[k + "f"]), "o_s": _log(o[k + "s"]), "home": 1.0 if casa else 0.0,
        "sbil": 1.0 if abs(pt - po) > 0.5 else 0.0, "pdiff": pt - po, "eq": 1 - abs(pt - po),
        "ppgdiff": t.get("pt", 0) / max(t.get("gp", 0), 1) - o.get("pt", 0) / max(o.get("gp", 0), 1),
        "t_Ff": _log(t["Ff"] + o["Fs"]) if "Ff" in t and "Fs" in o else _log(lgF),
    }
    return math.exp(M["b0"] + sum(w * x[c] for c, w in M["pesi"].items()))


def mercati(med, casa, ospite, p1, p2, arb=None):
    """Mercati Over/Under di cartellini, angoli e falli per una partita (con l'arbitro designato, se noto). casa/ospite: nomi come nel CSV. None se mancano i dati."""
    if not med:
        return None, None
    h, a = med["squadre"].get(casa), med["squadre"].get(ospite)
    if not h or not a or h["n"] < 4 or a["n"] < 4:
        return None, None
    out, info = [], {}
    for k in MODELLI:
        lg = med["lega"]
        if not lg.get(k) or not lg.get(k + "h") or not lg.get(k + "a") or k + "f" not in h or k + "f" not in a:
            continue
        sh = _media_squadra(k, med, h, a, True, p1, p2)
        sa = _media_squadra(k, med, a, h, False, p2, p1)
        senza = sh + sa
        f = 1.0
        if arb and k in ARBITRO["beta"] and arb.get("ratio"):
            f = arb["ratio"][k] ** ARBITRO["beta"][k]
        mu = senza * f
        info[k] = {"attesi": round(mu, 2), "senza_arbitro": round(senza, 2), "media_lega": round(lg[k], 2),
                   "casa": [round(h[k + "f"], 2), round(h[k + "s"], 2)], "ospite": [round(a[k + "f"], 2), round(a[k + "s"], 2)],
                   "squadre": [round(sh * f, 2), round(sa * f, 2)]}
        out += linee(k, mu)
        out += linee_squadra(k, "H", sh * f) + linee_squadra(k, "A", sa * f)
    return out, info
