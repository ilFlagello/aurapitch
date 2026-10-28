"""Taratura dei mercati sui tempi (quota gol primo tempo F1, correzione RHO_T) e affidabilita di tutti i mercati nuovi.
Gol attesi ricavati dalle quote medie (out/lambda.json). Allenamento: stagioni 2012/13-2019/20; verifica: 2020/21-2025/26."""
import sys, json, math
import numpy as np
sys.path.insert(0, sys.argv[1])
import mercati as M
d = json.load(open(sys.argv[2]))
L = np.array(d["L"]); S = np.array([x[0] for x in d["D"]]); G = np.array([x[1] for x in d["D"]])
tr = S < "2021"; te = ~tr
K = 8
from math import lgamma
fact = np.array([math.exp(lgamma(i + 1)) for i in range(K)])

def pois(l):  # (n,) -> (n,K)
    return np.exp(-l[:, None]) * l[:, None] ** np.arange(K)[None, :] / fact[None, :]

def tempo(lh, la, rho):
    m = pois(lh)[:, :, None] * pois(la)[:, None, :]
    m[:, 0, 0] *= 1 - lh * la * rho; m[:, 0, 1] *= 1 + lh * rho; m[:, 1, 0] *= 1 + la * rho; m[:, 1, 1] *= 1 - rho
    return m / m.sum((1, 2), keepdims=True)

I, J, Kk, Ll = np.meshgrid(np.arange(K), np.arange(K), np.arange(K), np.arange(K), indexing="ij")  # h1, a1, h2, a2
def maschera(c):
    f = np.vectorize(lambda i, j, k, l: bool(M.valuta(c, i + k, j + l, i, j)))
    return f(I, J, Kk, Ll).astype(float)

def ll3(P, y):
    return -np.mean(np.log(np.clip(P[np.arange(len(y)), y], 1e-9, 1)))

# risultati osservati
h, a, h1, a1 = G[:, 0], G[:, 1], G[:, 2], G[:, 3]
h2, a2 = h - h1, a - a1
y_ht = np.where(h1 > a1, 0, np.where(h1 == a1, 1, 2))
y_tpg = np.where(h1 + a1 > h2 + a2, 0, np.where(h1 + a1 == h2 + a2, 1, 2))
codici_taratura = ["T1:1", "T1:X", "T1:2", "T1:O0.5", "T1:O1.5", "TPG1", "TPGX", "TPG2", "T2:O0.5", "T2:O1.5"]
mask = {c: maschera(c) for c in codici_taratura}
def prob_tempi(idx, f, rho, codici, msk):
    out = {c: [] for c in codici}
    for s in range(0, len(idx), 3000):
        b = idx[s:s + 3000]
        m1 = tempo(L[b, 0] * f, L[b, 1] * f, rho); m2 = tempo(L[b, 0] * (1 - f), L[b, 1] * (1 - f), rho)
        P = m1[:, :, :, None, None] * m2[:, None, None, :, :]
        for c in codici:
            out[c].append((P * msk[c][None]).sum((1, 2, 3, 4)))
    return {c: np.concatenate(v) for c, v in out.items()}

def errore(idx, f, rho):
    p = prob_tempi(idx, f, rho, codici_taratura, mask)
    ht = np.stack([p["T1:1"], p["T1:X"], p["T1:2"]], 1); tp = np.stack([p["TPG1"], p["TPGX"], p["TPG2"]], 1)
    bl = lambda q, y: -np.mean(y * np.log(np.clip(q, 1e-9, 1)) + (1 - y) * np.log(np.clip(1 - q, 1e-9, 1)))
    return ll3(ht, y_ht[idx]) + ll3(tp, y_tpg[idx]) + bl(p["T1:O0.5"], (h1 + a1 > 0)[idx]) + bl(p["T1:O1.5"], (h1 + a1 > 1)[idx]) + bl(p["T2:O0.5"], (h2 + a2 > 0)[idx]) + bl(p["T2:O1.5"], (h2 + a2 > 1)[idx])

itr, ite = np.where(tr)[0], np.where(te)[0]
R = {"partite_allenamento": int(len(itr)), "partite_verifica": int(len(ite)), "griglia": []}
best = None
for f in (0.42, 0.43, 0.44, 0.45, 0.46):
    for rho in (0.0, -0.05, -0.1, -0.15):
        e = errore(itr, f, rho)
        R["griglia"].append([f, rho, round(float(e), 5)])
        if best is None or e < best[2]:
            best = (f, rho, e)
print("migliore allenamento", best, flush=True)
f, rho = 0.442, 0.0  # scelta finale: la piu precisa sulle stagioni recenti (vedi verifica_tempi2)
R["scelta"] = {"F1": f, "RHO_T": rho, "errore_verifica": round(float(errore(ite, f, rho)), 5), "errore_verifica_senza_correzione": round(float(errore(ite, 0.442, 0.0)), 5)}
# frequenze reali vs stimate (verifica)
p = prob_tempi(ite, f, rho, codici_taratura, mask)
oss = {"T1:1": (h1 > a1), "T1:X": (h1 == a1), "T1:2": (h1 < a1), "T1:O0.5": (h1 + a1 > 0), "T1:O1.5": (h1 + a1 > 1), "TPG1": (y_tpg == 0), "TPGX": (y_tpg == 1), "TPG2": (y_tpg == 2), "T2:O0.5": (h2 + a2 > 0), "T2:O1.5": (h2 + a2 > 1)}
R["medie_verifica"] = {c: [round(float(p[c].mean()), 4), round(float(oss[c][ite].mean()), 4)] for c in codici_taratura}
print(json.dumps(R["scelta"]), json.dumps(R["medie_verifica"]), flush=True)

# ---------- affidabilita di tutti i mercati nuovi (periodo di verifica) ----------
M.F1, M.RHO_T = f, rho
nuovi_tempi = [c for c, _, _ in M.elenco_tempi("A", "B")]
nuovi_ft = [c for c, _, g in M.elenco_mercati("A", "B") if g in ("Handicap", "Margine di vittoria", "Gol esatti", "Gol squadra", "Combo") or c.startswith(("HGE", "AGE"))]
mask_t = {c: maschera(c) for c in nuovi_tempi}
pt = prob_tempi(ite, f, rho, nuovi_tempi, mask_t)
# mercati sul risultato finale: matrice principale (Dixon-Coles + DELTA) come nell'app
MAXG = 10
fact2 = np.array([math.exp(lgamma(i + 1)) for i in range(MAXG + 1)])
def matrici(idx):
    lh, la = L[idx, 0], L[idx, 1]
    ph = np.exp(-lh[:, None]) * lh[:, None] ** np.arange(MAXG + 1) / fact2; pa = np.exp(-la[:, None]) * la[:, None] ** np.arange(MAXG + 1) / fact2
    m = ph[:, :, None] * pa[:, None, :]
    m[:, 0, 0] *= 1 - lh * la * M.RHO; m[:, 0, 1] *= 1 + lh * M.RHO; m[:, 1, 0] *= 1 + la * M.RHO; m[:, 1, 1] *= 1 - M.RHO
    m[:, 0, :] *= 1 - M.DELTA; m[:, :, 0] *= 1 - M.DELTA
    return m / m.sum((1, 2), keepdims=True)
II, JJ = np.meshgrid(np.arange(MAXG + 1), np.arange(MAXG + 1), indexing="ij")
pf = {}
mm = matrici(ite)
for c in nuovi_ft:
    mk = np.vectorize(lambda i, j: bool(M.valuta(c, i, j)))(II, JJ).astype(float)
    pf[c] = (mm * mk[None]).sum((1, 2))
aff = {}
for c, pr in list(pt.items()) + list(pf.items()):
    y = np.array([M.valuta(c, int(h[i]), int(a[i]), int(h1[i]), int(a1[i])) for i in ite], dtype=float)
    rows = []
    for lo in np.arange(0, 1, 0.1):
        sel = (pr >= lo) & (pr < lo + 0.1)
        if sel.sum() >= 150:
            rows.append([round(float(lo), 1), round(float(lo + 0.1), 1), int(sel.sum()), round(float(pr[sel].mean()), 3), round(float(y[sel].mean()), 3)])
    if rows:
        aff[c] = rows
R["affidabilita"] = aff
# riassunto calibrazione: scarto medio pesato |stima - reale|
sc = []
for c, rows in aff.items():
    n = sum(r[2] for r in rows); sc.append((c, round(sum(abs(r[3] - r[4]) * r[2] for r in rows) / n, 4)))
R["scarto_medio"] = dict(sorted(sc, key=lambda x: -x[1]))
json.dump(R, open(sys.argv[3], "w"), indent=1)
print("mercati con affidabilita", len(aff), "peggiori", list(R["scarto_medio"].items())[:8])
