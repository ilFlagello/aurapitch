"""AuraPitch - correzioni imparate dai risultati (applicate a ogni partita, solo libreria standard).

Il modello lo scrive ogni mattina strumenti/impara.py in data/modello.json; qui lo si applica:
1) peso della correzione IA (notizie, assenze...) contro la lettura delle quote, per famiglia di mercato;
2) ricalibrazione per mercato (a + b * logit p) e piccola correzione per campionato;
3) gli esiti che si escludono a vicenda tornano a sommare 1; le doppie chance sono la somma degli esiti singoli.
Se il modello manca o e "nessuna correzione", le probabilita restano quelle del motore.
"""
import json
import math
import os

MODELLO = os.path.join("data", "modello.json")
MARGINE = 0.06

GRUPPI = [["1", "X", "2"], ["T1:1", "T1:X", "T1:2"], ["T2:1", "T2:X", "T2:2"], [f"PF{x}/{y}" for x in "1X2" for y in "1X2"],
          [f"GE{k}" for k in range(6)] + ["GE6P"], [f"HGE{k}" for k in ("0", "1", "2", "3P")], [f"AGE{k}" for k in ("0", "1", "2", "3P")],
          ["TPG1", "TPGX", "TPG2"], ["PARI", "DISPARI"], ["GG", "NG"], ["T1:GG", "T1:NG"], ["T2:GG", "T2:NG"]]
GRUPPI += [[f"EH{hd}:{e}" for e in "1X2"] for hd in ("M1", "P1", "M2", "P2")]
for _t in ("", "T1:", "T2:"):
    for _n in (("0.5", "1.5", "2.5", "3.5", "4.5") if not _t else ("0.5", "1.5", "2.5")):
        GRUPPI.append([f"{_t}O{_n}", f"{_t}U{_n}"])
GRUPPI += [["HO0.5", "HU0.5"], ["AO0.5", "AU0.5"]]
DERIVATI = {"1X": ("1", "X"), "X2": ("X", "2"), "12": ("1", "2")}
for _t in ("T1:", "T2:"):
    DERIVATI.update({_t + "1X": (_t + "1", _t + "X"), _t + "X2": (_t + "X", _t + "2"), _t + "12": (_t + "1", _t + "2")})

FAMIGLIE = ["Esito finale", "Under/Over", "Goal/No Goal", "Multigol", "Gol squadra e gol esatti", "Combo", "Handicap e margine", "Tempi"]


def famiglia(c):
    """Famiglia di mercato (per il peso della correzione IA e per la pagina "Come sta andando l'IA")."""
    if c in ("1", "X", "2", "1X", "X2", "12"):
        return "Esito finale"
    if c[:1] in "OU" and c[1:2].isdigit():
        return "Under/Over"
    if c in ("GG", "NG"):
        return "Goal/No Goal"
    if c.startswith(("T1:", "T2:", "PF", "TPG")) or c in ("HSET", "ASET", "HVET", "AVET"):
        return "Tempi"
    if "+" in c:
        return "Combo"
    if c.startswith("MG"):
        return "Multigol"
    if c.startswith(("EH", "MV")):
        return "Handicap e margine"
    return "Gol squadra e gol esatti"


def logit(p):
    p = min(1 - 1e-6, max(1e-6, p))
    return math.log(p / (1 - p))


def sig(x):
    return 1 / (1 + math.exp(-x)) if x > -700 else 0.0


_CACHE = {}


def modello(path=MODELLO):
    """Il modello attivo ({} = nessuna correzione). Letto una volta per giro."""
    if path not in _CACHE:
        try:
            with open(path, encoding="utf-8") as f:
                _CACHE[path] = (json.load(f) or {}).get("attivo") or {}
        except (OSError, ValueError):
            _CACHE[path] = {}
    return _CACHE[path]


def versione(mod=None):
    mod = modello() if mod is None else mod
    return mod.get("versione") or "nessuna"


def attivo(mod=None):
    mod = modello() if mod is None else mod
    return bool(mod.get("cal") or mod.get("cal_lg") or mod.get("peso_ia"))


def calibra_p(pr, lg, mod=None, pm=None):
    """pr: {codice: probabilita del motore}; pm: stesse probabilita lette dalle sole quote (serve al peso IA).
    Restituisce {codice: probabilita corretta}. Stessa logica di strumenti/impara.applica (versione numpy)."""
    mod = modello() if mod is None else mod
    cal, cl, peso = mod.get("cal") or {}, (mod.get("cal_lg") or {}).get(lg) or {}, mod.get("peso_ia") or {}
    z = {}
    for c, p in pr.items():
        l = logit(p)
        if pm and c in pm and famiglia(c) in peso:
            w = peso[famiglia(c)]
            l = (1 - w) * logit(pm[c]) + w * l
        a, b = cal.get(c, (0.0, 1.0))
        z[c] = a + b * l + cl.get(c, 0.0)
    z = {c: sig(v) for c, v in z.items()}
    for gr in GRUPPI:
        if all(c in z for c in gr):
            s = sum(z[c] for c in gr)
            for c in gr:
                z[c] /= s
    for c, (x, y) in DERIVATI.items():
        if c in z and x in z and y in z:
            z[c] = z[x] + z[y]
    return {c: min(1 - 1e-6, max(1e-6, v)) for c, v in z.items()}


def calibra(mercati, lg, mercati_quote=None, mod=None):
    """Applica il modello alle righe di mercati.calcola_mercati (modificate sul posto: probabilita e quota stimata)."""
    mod = modello() if mod is None else mod
    if not attivo(mod):
        return mercati
    righe = [x for x in mercati if not x["c"].startswith("CS")]  # risultati esatti: solo i 10 piu probabili, restano come sono
    pm = {x["c"]: x["p"] for x in mercati_quote} if mercati_quote else None
    nuovo = calibra_p({x["c"]: x["p"] for x in righe}, lg, mod, pm)
    for x in righe:
        x["p"] = round(nuovo[x["c"]], 4)
        if not x.get("qm"):
            x["q"] = round(max(1.01, (1 - MARGINE) / x["p"]), 2)
    return mercati
