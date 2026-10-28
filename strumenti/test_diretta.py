"""La spinta (tiri e angoli negli ultimi 20 minuti) migliora la previsione in diretta?
Dati: archivio ESPN della stagione (data/espn/diretta.json): quote pre-partita DraftKings, risultato e spinta al 60' e al 75', risultato finale.
Base: gol attesi dalle quote, Poisson sui minuti che restano (come l'app). Variante: gol attesi restanti x exp(b * (quota di spinta - 0,5)).
b scelto sulle partite piu vecchie (prima meta), verifica sulle piu recenti."""
import sys, json, math
import numpy as np
sys.path.insert(0, sys.argv[1])
import mercati as M
D = json.load(open(sys.argv[2]))
def am(x):  # quota americana -> probabilita implicita
    return 100 / (x + 100) if x > 0 else -x / (-x + 100)
righe = []
for eid, r in sorted(D.items(), key=lambda kv: kv[1].get("t", "")):
    if r.get("vuota") or "ml" not in r:
        continue
    p = [am(x) for x in r["ml"]]; s = sum(p); mk = [x / s for x in p]
    lh, la = M.gol_attesi(mk, None)
    for t in ("60", "75"):
        if t in r:
            righe.append((lh, la, int(t), r[t]["g"], r[t]["sp"], r["fin"]))
print("fotografie", len(righe))
def pois(l, k):
    return math.exp(-l) * l ** k / math.factorial(k)
def prob(lh, la, t, g, sp, b):
    f = max(0.02, (93 - t) / 93)
    q = (sp[0] + 0.5) / (sp[0] + sp[1] + 1.0)
    rh, ra = lh * f * math.exp(b * (q - 0.5)), la * f * math.exp(-b * (q - 0.5))
    P = [0.0, 0.0, 0.0]; ancora = 1 - pois(rh, 0) * pois(ra, 0)
    for i in range(9):
        for j in range(9):
            w = pois(rh, i) * pois(ra, j); h, a = g[0] + i, g[1] + j
            P[0 if h > a else 1 if h == a else 2] += w
    return P, ancora
def errore(idx, b):
    e = 0.0
    for k in idx:
        lh, la, t, g, sp, fin = righe[k]
        P, anc = prob(lh, la, t, g, sp, b)
        y = 0 if fin[0] > fin[1] else 1 if fin[0] == fin[1] else 2
        e += -math.log(max(1e-9, P[y]))
        y2 = (fin[0] + fin[1]) > (g[0] + g[1])
        e += -math.log(max(1e-9, anc if y2 else 1 - anc))
    return e / max(1, len(idx))
n = len(righe); tr = range(0, n // 2); te = range(n // 2, n)
griglia = [(round(b, 2), round(errore(tr, b), 5)) for b in np.arange(-0.4, 1.61, 0.2)]
b = min(griglia, key=lambda x: x[1])[0]
out = {"fotografie": n, "griglia_allenamento": griglia, "b_scelto": b, "verifica_senza_spinta": round(errore(te, 0.0), 5), "verifica_con_spinta": round(errore(te, b), 5)}
out["miglioramento_%"] = round((out["verifica_senza_spinta"] - out["verifica_con_spinta"]) / out["verifica_senza_spinta"] * 100, 3)
json.dump(out, open(sys.argv[3], "w"), indent=1)
print(json.dumps(out, indent=1))
