"""Onesta dei mercati nuovi sull'archivio (Blocco 2): handicap asiatico e draw no bet, espulsione si/no, tiri in porta di
squadra, squadra che segna per prima. Nessuna richiesta di rete: solo storico/fd_partite.csv.gz.

Gol attesi di ogni partita: gli stessi dell'app (mercati.gol_attesi), ricavati dalle quote medie prima della partita
(Avg, se mancano BbAv o Bet365) senza margine (metodo "potenza"). Le regole che hanno parametri (espulsioni, tiri in porta)
si scelgono sulle stagioni fino al 2019/20 e si provano sulle stagioni dal 2020/21 (partite mai viste). L'handicap asiatico
e la squadra che segna per prima non hanno parametri nuovi: si provano su tutte le partite con i dati.

"Onesto" = scarto tra probabilita e frequenze vere (per fasce di 10 punti, come onesta.py) al netto del caso sotto SOGLIA
punti, e errore medio (log-loss) piu basso della regola semplice di confronto. Risultato in storico/prova_mercati.json,
letto da mercati_extra.py: entrano nell'app solo i mercati promossi qui.

Uso: python3 strumenti/prova_mercati.py   (circa un minuto, serve numpy)"""
import csv
import gzip
import json
import math
import os
import sys

import numpy as np

RADICE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RADICE)
import mercati as M  # noqa: E402

ARCHIVIO = os.path.join(RADICE, "storico", "fd_partite.csv.gz")
OUT = os.path.join(RADICE, "storico", "prova_mercati.json")
SOGLIA = 1.5          # punti di scarto (al netto del caso) oltre i quali un mercato non e onesto
ALLENAMENTO = "2021"  # stagioni con codice < "2021" (fino al 2019/20) per scegliere i parametri
G = 11                # gol 0..10, come mercati.MAXG
PASSO, LMIN, LMAX = 0.025, 0.05, 4.0


def num(x):
    try:
        v = float(x)
        return v if v > 1.0 else None
    except (TypeError, ValueError):
        return None


def togli_margine(q):
    inv = np.array([1 / x for x in q])
    k = 1.0
    for _ in range(50):
        s = (inv ** k).sum()
        ds = (np.log(inv) * inv ** k).sum()
        k -= (s - 1) / ds
    p = inv ** k
    return p / p.sum()


def carica():
    righe = []
    with gzip.open(ARCHIVIO, "rt", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            q = next((t for t in ([num(r.get(p + e)) for e in "HDA"] for p in ("Avg", "BbAv", "B365")) if all(t)), None)
            if not q or r.get("FTHG", "") == "" or r.get("FTAG", "") == "":
                continue
            o = next((t for t in ([num(r.get(p + ">2.5")), num(r.get(p + "<2.5"))] for p in ("Avg", "BbAv", "B365")) if all(t)), None)
            righe.append((r, togli_margine(q), togli_margine(o)[0] if o else None))
    return righe


# ---------- gol attesi (stessa regola di mercati.gol_attesi, su una griglia fine) ----------

def griglia():
    lam = np.arange(LMIN, LMAX + 1e-9, PASSO)
    k = np.arange(G)
    fatt = np.array([math.factorial(i) for i in range(G)], dtype=float)
    pois = np.exp(-lam[:, None]) * lam[:, None] ** k[None, :] / fatt[None, :]
    LH, LA = np.meshgrid(lam, lam, indexing="ij")
    m = pois[:, None, :, None] * pois[None, :, None, :]  # (nh, na, i, j)
    m[:, :, 0, 0] *= 1 - LH * LA * M.RHO
    m[:, :, 0, 1] *= 1 + LH * M.RHO
    m[:, :, 1, 0] *= 1 + LA * M.RHO
    m[:, :, 1, 1] *= 1 - M.RHO
    m[:, :, 0, :] *= 1 - M.DELTA
    m[:, :, :, 0] *= 1 - M.DELTA
    m /= m.sum((2, 3), keepdims=True)
    I, J = np.meshgrid(k, k, indexing="ij")
    p1 = (m * (I > J)).sum((2, 3)).ravel()
    p2 = (m * (I < J)).sum((2, 3)).ravel()
    po = (m * (I + J > 2.5)).sum((2, 3)).ravel()
    return lam, m.reshape(-1, G, G), p1, p2, po, LH.ravel(), LA.ravel()


def gol_attesi(mk, mo, gr):
    lam, mats, p1, p2, po, LH, LA = gr
    idx = np.empty(len(mk), dtype=int)
    for s in range(0, len(mk), 400):
        a, b, o = mk[s:s + 400, 0:1], mk[s:s + 400, 2:3], mo[s:s + 400, None]
        e = (p1[None] - a) ** 2 + (p2[None] - b) ** 2
        e = e + np.where(np.isnan(o), 0.002 * (LH[None] + LA[None] - 2.6) ** 2, (po[None] - np.nan_to_num(o)) ** 2)
        idx[s:s + 400] = e.argmin(1)
    return idx


# ---------- misure ----------

def scarto(p, y):
    """Scarto per fasce di 10 punti al netto del caso (come onesta.scarto), in punti percentuali."""
    p, y = np.asarray(p, float), np.asarray(y, float)
    rov = p < 0.5
    p, y = np.where(rov, 1 - p, p), np.where(rov, 1 - y, y)
    f = np.minimum(9, (p * 10).astype(int))
    ecc = 0.0
    for b in np.unique(f):
        s = f == b
        ecc += max(0.0, abs((y[s] - p[s]).sum()) - math.sqrt(2 / math.pi * (p[s] * (1 - p[s])).sum()))
    return round(100 * ecc / len(p), 2)


def ll(p, y):
    p = np.clip(np.asarray(p, float), 1e-6, 1 - 1e-6)
    y = np.asarray(y, float)
    return round(float(-np.mean(y * np.log(p) + (1 - y) * np.log(1 - p))), 5)


def fasce(p, y):
    """Tabella per fasce (detta, vera, n) da mostrare nel rapporto."""
    p, y = np.asarray(p, float), np.asarray(y, float)
    f = np.minimum(9, (p * 10).astype(int))
    return [[int(b) * 10, round(100 * float(p[f == b].mean()), 1), round(100 * float(y[f == b].mean()), 1), int((f == b).sum())]
            for b in np.unique(f) if (f == b).sum() >= 50]


def giudizio(p, y, base=None, mercato=None):
    out = {"n": int(len(p)), "scarto": scarto(p, y), "errore": ll(p, y), "fasce": fasce(p, y)}
    if base is not None:
        out["errore_base"] = ll(base, y)
    if mercato is not None:
        out["errore_mercato"] = ll(mercato, y)
        out["scarto_mercato"] = scarto(mercato, y)
    out["onesto"] = bool(out["scarto"] <= SOGLIA and (base is None or out["errore"] < out["errore_base"]))
    return out


def handicap(R, mats, gh, ga):
    """Handicap asiatico sulla linea principale del mercato (AHh, quote medie AvgAHH/AvgAHA)."""
    d = np.arange(-(G - 1), G)
    I, J = np.meshgrid(np.arange(G), np.arange(G), indexing="ij")
    out = {"mezze": [], "intere": []}
    righe = []
    for i, (r, _, _) in enumerate(R):
        L, oh, oa = num_l(r.get("AHh")), num(r.get("AvgAHH")), num(r.get("AvgAHA"))
        if L is None or not oh or not oa:
            continue
        righe.append((i, L, oh, oa))
    # distribuzione della differenza reti per ogni partita
    for i, L, oh, oa in righe:
        m = mats[i]
        pd = np.array([m[I - J == k].sum() for k in d])
        dif = gh[i] - ga[i]
        pm = togli_margine([oh, oa])[0]
        fr = L % 1
        if abs(fr - 0.5) < 1e-9:  # linea a mezzo gol: niente rimborso
            out["mezze"].append((pd[d + L > 0].sum(), pm, float(dif + L > 0)))
        elif fr < 1e-9:  # linea intera (0 = draw no bet): si guarda solo quando non c'e rimborso
            if dif + L == 0:
                continue
            w, lo = pd[d + L > 0].sum(), pd[d + L < 0].sum()
            out["intere"].append((w / (w + lo), pm, float(dif + L > 0), L == 0))
    res = {}
    for k in ("mezze", "intere"):
        a = np.array(out[k], dtype=float)
        if len(a):
            res[k] = giudizio(a[:, 0], a[:, 2], mercato=a[:, 1])
    a = np.array([x for x in out["intere"] if x[3]], dtype=float)
    if len(a):
        res["draw_no_bet"] = giudizio(a[:, 0], a[:, 2], mercato=a[:, 1])
    return res


def num_l(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return None


RECENTI = 3  # stagioni piu recenti dell'allenamento per la frequenza delle espulsioni (calano negli anni)


def espulsioni(R, prova, stag):
    """Espulsione si/no nella partita: frequenza del campionato, avvicinata alla media se ci sono poche partite.
    Due varianti: tutte le stagioni di allenamento, oppure solo le RECENTI (le espulsioni calano negli anni)."""
    ok = np.array([r.get("HR", "") != "" and r.get("AR", "") != "" for r, _, _ in R])
    y = np.array([float(int(r["HR"]) + int(r["AR"]) > 0) if k else 0.0 for (r, _, _), k in zip(R, ok)])
    div = np.array([r["Div"] for r, _, _ in R])
    tr = ok & ~prova
    ultime = sorted(set(stag[tr]))[-RECENTI:]
    out = {}
    for nome, sel in (("tutte", tr), ("recenti", tr & np.isin(stag, ultime))):
        tot = y[sel].mean()
        per = {lg: float((y[sel & (div == lg)].sum() + 200 * tot) / ((sel & (div == lg)).sum() + 200)) for lg in np.unique(div[sel])}
        out[nome] = (np.array([per.get(lg, tot) for lg in div]), float(tot), per)
    return ok, y, out


def binomiale_negativa(media, k, soglia):
    """P(X > soglia) con X binomiale negativa di media 'media' e dispersione k (varianza = media + media^2/k)."""
    media = np.asarray(media, float)
    pr = k / (k + media)
    cum = np.zeros_like(media)
    term = pr ** k
    for x in range(int(math.floor(soglia)) + 1):
        if x > 0:
            term = term * (x - 1 + k) / x * (1 - pr)
        cum += term
    return 1 - cum


def tiri(R, lam_sq, prova, lato):
    """Tiri in porta di una squadra: media = a(campionato) + b * gol attesi (allenamento), dispersione stimata."""
    col = "HST" if lato == "H" else "AST"
    ok = np.array([r.get(col, "") != "" for r, _, _ in R])
    y = np.array([float(r[col]) if r.get(col, "") != "" else np.nan for r, _, _ in R])
    div = np.array([r["Div"] for r, _, _ in R])
    tr = ok & ~prova
    b, a = np.polyfit(lam_sq[tr], y[tr], 1)
    res = y - (a + b * lam_sq)
    corr = {lg: float(np.nanmean(res[tr & (div == lg)])) for lg in np.unique(div[tr])}
    mu = a + b * lam_sq + np.array([corr.get(lg, 0.0) for lg in div])
    mu = np.maximum(mu, 0.3)
    v = np.nanmean((y[tr] - mu[tr]) ** 2 - mu[tr])
    k = float(np.mean(mu[tr]) ** 2 / v) if v > 0 else 50.0
    mlg = {lg: float(np.nanmean(y[tr & (div == lg)])) for lg in np.unique(div[tr])}
    mu0 = np.array([mlg.get(lg, float(np.nanmean(y[tr]))) for lg in div])
    return ok, y, mu, mu0, k, {"a": round(float(a), 3), "b": round(float(b), 3), "k": round(k, 2), "campionati": {x: round(v, 3) for x, v in corr.items()}}


def primo_gol(R, LH, LA, gh, ga, hh, ha):
    """Squadra che segna per prima: gol come processo nel tempo, quota del primo tempo F1, chi segna prima in proporzione
    ai gol attesi. Nell'archivio non c'e il minuto dei gol: si verifica sugli eventi che i risultati dei tempi rivelano
    (nessun gol; nel tempo del primo gol ha segnato una sola squadra). Restano fuori i tempi in cui segnano tutte e due."""
    f = M.F1
    def esiti(lh, la):
        e1 = math.exp(-(lh + la) * f)
        e2 = math.exp(-(lh + la) * (1 - f))
        # primo tempo: solo casa segna (almeno 1) = exp(-la f) * (1 - exp(-lh f))
        h1 = math.exp(-la * f) * (1 - math.exp(-lh * f))
        a1 = math.exp(-lh * f) * (1 - math.exp(-la * f))
        h2 = e1 * math.exp(-la * (1 - f)) * (1 - math.exp(-lh * (1 - f)))
        a2 = e1 * math.exp(-lh * (1 - f)) * (1 - math.exp(-la * (1 - f)))
        nessuno = e1 * e2
        return h1 + h2, a1 + a2, nessuno
    P, Y, PF = [], [], []
    for i in range(len(R)):
        if hh[i] is None:
            continue
        ph, pa, p0 = esiti(LH[i], LA[i])
        h1, a1, h2, a2 = hh[i], ha[i], gh[i] - hh[i], ga[i] - ha[i]
        if h1 + a1 > 0:
            y = 0 if a1 == 0 else 1 if h1 == 0 else 3
        elif h2 + a2 > 0:
            y = 0 if a2 == 0 else 1 if h2 == 0 else 3
        else:
            y = 2
        P.append((ph, pa, p0, 1 - ph - pa - p0))
        Y.append(y)
        tot = 1 - math.exp(-(LH[i] + LA[i]))
        PF.append(LH[i] / (LH[i] + LA[i]) * tot)  # probabilita mostrata: "casa segna per prima"
    P, Y = np.array(P), np.array(Y)
    out = {"n": int(len(Y)), "rivelate": round(float((Y != 3).mean()), 3)}
    for k, nome in ((0, "casa_rivelata"), (1, "ospite_rivelata"), (2, "nessun_gol"), (3, "non_rivelata")):
        out[nome] = {"detta": round(100 * float(P[:, k].mean()), 2), "vera": round(100 * float((Y == k).mean()), 2),
                     "scarto": scarto(P[:, k], Y == k)}
    out["onesto"] = all(out[x]["scarto"] <= SOGLIA for x in ("casa_rivelata", "ospite_rivelata", "nessun_gol", "non_rivelata"))
    return out


def main():
    R = carica()
    mk = np.array([x[1] for x in R])
    mo = np.array([x[2] if x[2] is not None else np.nan for x in R])
    gr = griglia()
    cache = os.environ.get("PROVA_CACHE")
    if cache and os.path.exists(cache):
        idx = np.load(cache)
    else:
        idx = gol_attesi(mk, mo, gr)
        if cache:
            np.save(cache, idx)
    _, mats, _, _, _, LHg, LAg = gr
    LH, LA = LHg[idx], LAg[idx]
    gh = np.array([int(r["FTHG"]) for r, _, _ in R])
    ga = np.array([int(r["FTAG"]) for r, _, _ in R])
    hh = [int(r["HTHG"]) if r.get("HTHG", "") != "" else None for r, _, _ in R]
    ha = [int(r["HTAG"]) if r.get("HTAG", "") != "" else None for r, _, _ in R]
    stag = np.array([r["Season"] for r, _, _ in R])
    prova = stag >= ALLENAMENTO
    # controllo: la griglia riproduce la regola dell'app
    for i in range(0, len(R), len(R) // 5):
        lh, la = M.gol_attesi(list(mk[i]), None if np.isnan(mo[i]) else float(mo[i]))
        assert abs(lh - LH[i]) < 0.06 and abs(la - LA[i]) < 0.06, (lh, la, LH[i], LA[i])
    rap = {"partite": len(R), "allenamento": "fino al 2019/20", "prova": "dal 2020/21", "soglia": SOGLIA}

    rap["handicap_asiatico"] = handicap(R, mats[idx], gh, ga)

    ok, y, var = espulsioni(R, prova, stag)
    s = ok & prova
    prove = {nome: giudizio(p[s], y[s], base=np.full(s.sum(), tot)) for nome, (p, tot, _) in var.items()}
    scelta = min(prove, key=lambda k: (not prove[k]["onesto"], prove[k]["errore"]))
    g = dict(prove[scelta], regola=scelta, confronto={k: {x: v[x] for x in ("scarto", "errore")} for k, v in prove.items()})
    g["parametri"] = {"media": round(var[scelta][1], 4), "campionati": {k: round(v, 4) for k, v in var[scelta][2].items()}}
    rap["espulsione"] = g

    rap["tiri_in_porta"] = {}
    for lato, lam in (("H", LH), ("A", LA)):
        ok, yy, mu, mu0, k, par = tiri(R, lam, prova, lato)
        s = ok & prova
        linee = {}
        for linea in (2.5, 3.5, 4.5, 5.5, 6.5):
            pm, p0 = binomiale_negativa(mu[s], k, linea), binomiale_negativa(mu0[s], k, linea)
            linee[f"O{linea}"] = giudizio(pm, yy[s] > linea, base=p0)
        rap["tiri_in_porta"][lato] = {"parametri": par, "linee": linee, "onesto": all(v["onesto"] for v in linee.values())}

    # parametri per l'app: stesse regole, rifatte sulle ultime 3 stagioni complete (le piu vicine a oggi)
    complete = sorted(x for x in set(stag) if (stag == x).sum() > 5000)[-RECENTI:]
    ultime = np.isin(stag, complete)
    ok, y, var = espulsioni(R, ~ultime, stag)
    app = {"stagioni": complete, "espulsione": {"media": round(var["tutte"][1], 4), "campionati": {k: round(v, 4) for k, v in var["tutte"][2].items()}}}
    for lato, lam in (("H", LH), ("A", LA)):
        app[f"tiri_{lato}"] = tiri(R, lam, ~ultime, lato)[5]
    rap["per_app"] = app

    rap["primo_gol"] = primo_gol(R, LH, LA, gh, ga, hh, ha)
    rap["primo_marcatore"] = {"onesto": False, "motivo": "nell'archivio non c'e il minuto dei gol ne chi li segna: non si puo provare"}
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(rap, f, ensure_ascii=False, indent=1)
    print(json.dumps(rap, ensure_ascii=False)[:6000])


if __name__ == "__main__":
    main()
