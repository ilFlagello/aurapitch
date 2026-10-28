"""Il meteo del giorno aggiunge qualcosa alle quote? (Over 2,5 e pareggio)
Allenamento: stagioni fino al 2019/20; verifica: dal 2020/21. Errore = log-loss; base = quota media senza margine (ritarata con intercetta e pendenza)."""
import sys, csv, gzip, json, math
from datetime import datetime
import numpy as np
R = sys.argv[1]
met = {}
for r in csv.DictReader(gzip.open(R + "/storico/meteo_giorni.csv.gz", "rt")):
    try:
        met[(r["squadra"], r["data"])] = (float(r["pioggia"] or 0), float(r["vento"] or 0), float(r["temp"] or 15))
    except ValueError:
        pass
rows = []
for r in csv.DictReader(gzip.open(R + "/storico/fd_partite.csv.gz", "rt")):
    try:
        d = datetime.strptime(r["Date"], "%d/%m/%Y" if len(r["Date"]) == 10 else "%d/%m/%y").strftime("%Y-%m-%d")
        o = [float(r["Avg>2.5"] or r["BbAv>2.5"]), float(r["Avg<2.5"] or r["BbAv<2.5"])]
        x = [float(r["AvgH"] or r["BbAvH"]), float(r["AvgD"] or r["BbAvD"]), float(r["AvgA"] or r["BbAvA"])]
        g = int(r["FTHG"]) + int(r["FTAG"]); dr = int(r["FTHG"]) == int(r["FTAG"])
    except (ValueError, KeyError):
        continue
    m = met.get((r["HomeTeam"], d))
    if not m:
        continue
    po = (1 / o[0]) / (1 / o[0] + 1 / o[1]); pd = (1 / x[1]) / sum(1 / v for v in x)
    rows.append((r["Season"], po, pd, g > 2.5, dr, *m))
print("partite con meteo", len(rows))
A = np.array([[r[1], r[2], r[3], r[4], r[5], r[6], r[7]] for r in rows], float)
S = np.array([r[0] for r in rows]); tr = S < "2021"; te = ~tr
lg = lambda p: np.log(np.clip(p, 1e-4, 1 - 1e-4) / (1 - np.clip(p, 1e-4, 1 - 1e-4)))
pioggia, vento, temp = A[:, 4], A[:, 5], A[:, 6]
F = {"pioggia (log mm)": np.log1p(pioggia), "pioggia forte (>10 mm)": (pioggia > 10).astype(float), "vento forte (>35 km/h)": (vento > 35).astype(float),
     "freddo (<5°)": (temp < 5).astype(float), "caldo (>28°)": (temp > 28).astype(float)}
def fit(X, y, idx):
    w = np.zeros(X.shape[1]); w[1] = 1
    for _ in range(50):
        p = 1 / (1 + np.exp(-(X[idx] @ w))); g = X[idx].T @ (p - y[idx]); H = (X[idx] * (p * (1 - p))[:, None]).T @ X[idx] + 1e-6 * np.eye(len(w)); w -= np.linalg.solve(H, g)
    return w
def ll(X, y, w, idx):
    p = np.clip(1 / (1 + np.exp(-(X[idx] @ w))), 1e-6, 1 - 1e-6)
    return float(-np.mean(y[idx] * np.log(p) + (1 - y[idx]) * np.log(1 - p)))
out = {"partite": len(rows), "verifica": int(te.sum()), "frequenze": {k: round(float(v.mean()), 4) for k, v in F.items()}}
for nome, col_p, col_y in (("Over 2,5", 0, 2), ("Pareggio", 1, 3)):
    y = A[:, col_y]
    X0 = np.stack([np.ones(len(A)), lg(A[:, col_p])], 1)
    X1 = np.column_stack([X0] + list(F.values()))
    w0, w1 = fit(X0, y, tr), fit(X1, y, tr)
    e0, e1 = ll(X0, y, w0, te), ll(X1, y, w1, te)
    out[nome] = {"solo_quote": round(e0, 5), "quote_piu_meteo": round(e1, 5), "miglioramento_%": round((e0 - e1) / e0 * 100, 3),
                 "pesi_meteo": {k: round(float(v), 3) for k, v in zip(F.keys(), w1[2:])}}
    # quanti gol in piu o in meno con pioggia forte, a parita di quote (verifica)
    sel = te & (F["pioggia forte (>10 mm)"] > 0)
    if sel.sum() > 100:
        p0 = 1 / (1 + np.exp(-(X0[sel] @ w0)))
        out[nome]["pioggia_forte"] = {"partite": int(sel.sum()), "attesa_quote": round(float(p0.mean()), 3), "reale": round(float(y[sel].mean()), 3)}
json.dump(out, open(sys.argv[2], "w"), indent=1, ensure_ascii=False)
print(json.dumps(out, indent=1, ensure_ascii=False))
