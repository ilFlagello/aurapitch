"""AuraPitch - mercati nuovi (Blocco 2), IN OMBRA: handicap asiatico e draw no bet, espulsione si/no, tiri in porta di
squadra, squadra che segna per prima. Solo libreria standard.

Le regole e i parametri vengono da strumenti/prova_mercati.py, che ne ha misurato l'onesta sull'archivio (storico/
prova_mercati.json, stagioni dal 2020/21 mai viste). Ogni giro salva le probabilita delle partite non ancora iniziate in
data/AAAA-MM-GG/mercati_ombra.json; il revisore le confronta con i risultati veri (gol, primo tempo e tabellini ESPN con
espulsioni e tiri in porta). Nell'app non si mostrano finche anche questa prova sulle partite vere non va bene.

- Handicap asiatico: dalla stessa matrice dei risultati degli altri mercati (mercati.matrice). Per ogni linea della casa
  (-2 ... +2, a quarti) il "valore" atteso della giocata: 1 vinta, 0,5 rimborso, 0,75/0,25 mezza vinta/persa, 0 persa.
  Draw no bet = linea 0: probabilita di vincere quando non c'e il rimborso (quota giusta = 1/p).
- Espulsione si/no: frequenza del campionato nelle ultime 3 stagioni (solo campionati dell'archivio).
- Tiri in porta di squadra: media = a + b * gol attesi (+ correzione del campionato), binomiale negativa.
- Squadra che segna per prima: gol come processo nel tempo (quota del primo tempo F1); prima chi ha piu gol attesi.
- Primo marcatore: no (nell'archivio non c'e chi segna per primo, quindi non si puo provare)."""
import json
import math
import os

import mercati as M

PROVA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "storico", "prova_mercati.json")
LINEE_AH = [x / 4 for x in range(-8, 9)]  # -2 ... +2
LINEE_TIRI = (2.5, 3.5, 4.5, 5.5, 6.5)
_cache = {}


def prova():
    if "p" not in _cache:
        try:
            with open(PROVA, encoding="utf-8") as f:
                _cache["p"] = json.load(f)
        except (OSError, ValueError):
            _cache["p"] = {}
    return _cache["p"]


def promossi():
    """Mercati con onesta provata sull'archivio (solo questi potranno un giorno entrare nell'app)."""
    p = prova()
    ah = p.get("handicap_asiatico") or {}
    out = {"handicap": all((ah.get(k) or {}).get("onesto") for k in ("mezze", "intere")) and bool(ah),
           "draw_no_bet": bool((ah.get("draw_no_bet") or {}).get("onesto")),
           "espulsione": bool((p.get("espulsione") or {}).get("onesto")),
           "tiri_in_porta": all(((p.get("tiri_in_porta") or {}).get(x) or {}).get("onesto") for x in "HA") and bool(p.get("tiri_in_porta")),
           "primo_gol": bool((p.get("primo_gol") or {}).get("onesto")),
           "primo_marcatore": False}
    return out


def differenza(lh, la):
    """Distribuzione della differenza reti (casa - ospite): {d: probabilita}."""
    m = M.matrice(lh, la)
    out = {}
    for i in range(M.MAXG + 1):
        for j in range(M.MAXG + 1):
            out[i - j] = out.get(i - j, 0.0) + m[i][j]
    return out


def _esito(x):
    return 1.0 if x > 0 else 0.5 if x == 0 else 0.0


def valore_ah(d, linea):
    """Valore della giocata 'casa con handicap linea' quando la differenza reti e d (1 vinta ... 0 persa)."""
    if abs(linea * 2 - round(linea * 2)) > 1e-9:  # quarto di linea: meta su ciascuna linea vicina
        return (_esito(d + linea - 0.25) + _esito(d + linea + 0.25)) / 2
    return _esito(d + linea)


def handicap(lh, la):
    pd = differenza(lh, la)
    ah = {f"{L:+g}": round(sum(p * valore_ah(d, L) for d, p in pd.items()), 4) for L in LINEE_AH}
    p1 = sum(p for d, p in pd.items() if d > 0)
    p2 = sum(p for d, p in pd.items() if d < 0)
    return {"ah": ah, "dnb": [round(p1 / (p1 + p2), 4), round(p2 / (p1 + p2), 4)]}


def espulsione(lg):
    par = ((prova().get("per_app") or {}).get("espulsione") or {}).get("campionati") or {}
    return par.get(lg)


def _sopra(media, k, soglia):
    pr = k / (k + media)
    term, cum = pr ** k, 0.0
    for x in range(int(math.floor(soglia)) + 1):
        if x > 0:
            term *= (x - 1 + k) / x * (1 - pr)
        cum += term
    return 1 - cum


def tiri(lh, la, lg):
    app = prova().get("per_app") or {}
    out = {}
    for lato, lam in (("H", lh), ("A", la)):
        par = app.get(f"tiri_{lato}") or {}
        if lg not in (par.get("campionati") or {}):
            return None
        mu = max(0.3, par["a"] + par["b"] * lam + par["campionati"][lg])
        out[lato] = {"mu": round(mu, 2), **{f"O{L}": round(_sopra(mu, par["k"], L), 4) for L in LINEE_TIRI}}
    return out


def primo_gol(lh, la):
    """[casa segna per prima, ospite segna per prima, nessun gol]."""
    nessuno = math.exp(-(lh + la))
    return [round((1 - nessuno) * lh / (lh + la), 4), round((1 - nessuno) * la / (lh + la), 4), round(nessuno, 4)]


def primo_gol_rivelato(lh, la):
    """[casa, ospite]: probabilita che il primo gol sia di quella squadra E che i risultati dei tempi lo rivelino (nel tempo
    del primo gol segna una sola squadra). Serve al controllo sulle partite vere, che hanno solo i risultati dei tempi."""
    f = M.F1
    e1 = math.exp(-(lh + la) * f)
    h = math.exp(-la * f) * (1 - math.exp(-lh * f)) + e1 * math.exp(-la * (1 - f)) * (1 - math.exp(-lh * (1 - f)))
    a = math.exp(-lh * f) * (1 - math.exp(-la * f)) + e1 * math.exp(-lh * (1 - f)) * (1 - math.exp(-la * (1 - f)))
    return [round(h, 4), round(a, 4)]


def ombra(m):
    """Probabilita dei mercati nuovi di una partita (forma compatta per il file in ombra)."""
    try:
        lh, la = (float(x) for x in m["xg"])
    except (KeyError, TypeError, ValueError):
        return None
    if lh <= 0 or la <= 0:
        return None
    out = {"xg": [round(lh, 3), round(la, 3)], **handicap(lh, la), "pg": primo_gol(lh, la), "pgr": primo_gol_rivelato(lh, la)}
    e = espulsione(m.get("lg"))
    if e is not None:
        out["esp"] = e
    t = tiri(lh, la, m.get("lg"))
    if t:
        out["tp"] = t
    return out


def valuta_ombra(o, g, g1=None, st=None):
    """Esiti veri dei mercati in ombra di una partita finita: coppie (mercato, probabilita detta, esito 0/1)
    per il controllo di onesta. g = [casa, ospite]; g1 = primo tempo; st = statistiche del tabellino ESPN."""
    out = []
    h, a = g
    d = h - a
    for L in (-1.5, -0.5, 0.5, 1.5):  # linee senza rimborso: esito netto
        p = (o.get("ah") or {}).get(f"{L:+g}")
        if p is not None:
            out.append((f"AH{L:+g}", p, int(d + L > 0)))
    if o.get("dnb") and d != 0:
        out.append(("DNB1", o["dnb"][0], int(d > 0)))
    if g1 and o.get("pg"):
        h1, a1 = g1
        h2, a2 = h - h1, a - a1
        if h + a == 0:
            out.append(("PG0", o["pg"][2], 1))
        else:
            out.append(("PG0", o["pg"][2], 0))
            prima = (h1, a1) if h1 + a1 else (h2, a2)
            if (prima[0] == 0 or prima[1] == 0) and o.get("pgr"):  # chi ha segnato per primo e noto solo se nel tempo del primo gol segna una squadra
                out.append(("PG1|noto", o["pgr"][0] / (o["pgr"][0] + o["pgr"][1]), int(prima[0] > 0)))
    st = st or {}
    if "esp" in o and isinstance(st.get("R"), list):
        out.append(("ESP", o["esp"], int(sum(st["R"]) > 0)))
    if o.get("tp") and isinstance(st.get("TP"), list):
        for i, lato in enumerate("HA"):
            for L in LINEE_TIRI:
                out.append((f"TP{lato}O{L}", o["tp"][lato][f"O{L}"], int(st["TP"][i] > L)))
    return out
