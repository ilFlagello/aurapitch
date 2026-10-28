"""Studio sugli allenatori (2012/13-2025/26, 7 campionati, partite di Football-Data + panchine di Wikidata).
1) Le informazioni sull'allenatore migliorano le probabilità delle quote? (nuovo allenatore, durata in carica, rendimento in
   carriera rispetto alle attese delle quote, esperienza). Allenamento fino al 2019/20, verifica dal 2020/21.
2) "Rimbalzo" del nuovo allenatore: punti rispetto alle attese prima e dopo il cambio.
3) Termometro della panchina: probabilità che l'allenatore lasci entro 30 giorni (esclusa l'estate), verificata sugli addii veri.
Scrive storico/test_allenatori.json (risultati e pesi del termometro). Solo numpy."""
import csv, gzip, json, math, os
from datetime import date, datetime, timedelta
import numpy as np

RNG = np.random.default_rng(7)


def togli_margine(q):
    inv = [1 / x for x in q]
    k = 1.0
    for _ in range(50):
        s = sum(v ** k for v in inv); ds = sum(math.log(v) * v ** k for v in inv); k -= (s - 1) / ds
    p = [v ** k for v in inv]; t = sum(p)
    return [v / t for v in p]


def num(x):
    try:
        v = float(x); return v if v > 1 else None
    except (TypeError, ValueError):
        return None


def giorno(s):
    for f in ("%d/%m/%Y", "%d/%m/%y"):
        try:
            return datetime.strptime(s, f).date()
        except ValueError:
            pass
    return None


def d(s):
    return date.fromisoformat(s) if s else None


# ---------- dati ----------
with gzip.open("storico/fd_partite.csv.gz", "rt", encoding="utf-8") as f:
    raw = list(csv.DictReader(f))
A = json.load(open("storico/allenatori.json", encoding="utf-8"))["squadre"]
partite = []
for r in raw:
    g = giorno(r["Date"]); q = [num(r.get(c)) or num(r.get(c2)) for c, c2 in (("AvgH", "BbAvH"), ("AvgD", "BbAvD"), ("AvgA", "BbAvA"))]
    try:
        hg, ag = int(r["FTHG"]), int(r["FTAG"])
    except ValueError:
        continue
    if not g or not all(q):
        continue
    p = togli_margine(q)
    partite.append({"g": g, "s": r["Season"], "div": r["Div"], "h": r["HomeTeam"], "a": r["AwayTeam"], "p": p, "e": 0 if hg > ag else 1 if hg == ag else 2,
                    "pts": (3 if hg > ag else 1 if hg == ag else 0, 3 if ag > hg else 1 if hg == ag else 0)})
partite.sort(key=lambda x: x["g"])
print("partite", len(partite))


def allenatore(team, g):
    best = None
    for t in (A.get(team) or {}).get("allenatori", []):
        da, a = d(t["da"]), d(t["a"])
        if da and da <= g and (a is None or g <= a) and (best is None or da > d(best["da"])):
            best = t
    return best


# ---------- variabili calcolate solo con il passato ----------
carriera = {}   # qid -> [n partite, somma (punti - attesi)]
alclub = {}     # (team, qid, da) -> partite
storia = {}     # team -> lista di (punti - attesi) recenti
cambi = {}      # team -> date di inizio dei nuovi allenatori
X, Y, P, S, coperte = [], [], [], [], 0
eventi = []     # campioni per il termometro
for m in partite:
    att = (3 * m["p"][0] + m["p"][1], 3 * m["p"][2] + m["p"][1])
    row, ok = [], True
    info = []
    for lato, team in enumerate((m["h"], m["a"])):
        c = allenatore(team, m["g"])
        if not c:
            ok = False; info.append(None); continue
        n_club = alclub.get((team, c["qid"], c["da"]), 0)
        giorni = (m["g"] - d(c["da"])).days
        nc, rc = carriera.get(c["qid"], [0, 0.0])
        info.append({"c": c, "n_club": n_club, "giorni": giorni, "res": rc / (nc + 20), "esp": math.log1p(nc)})
    if ok:
        coperte += 1
        h, a = info
        nuovo = lambda z: 1.0 if (z["giorni"] < 60 and z["n_club"] < 5) else 0.0
        row = [nuovo(h), nuovo(a), math.log1p(h["giorni"]) - math.log1p(a["giorni"]), h["res"] - a["res"], h["esp"] - a["esp"]]
        X.append(row); Y.append(m["e"]); P.append(m["p"]); S.append(m["s"])
    # termometro: dopo la partita, l'allenatore lascia entro 30 giorni? (escluse uscite tra il 1 giugno e il 15 agosto)
    for lato, team in enumerate((m["h"], m["a"])):
        z = info[lato]
        diff = m["pts"][lato] - att[lato]
        st = storia.setdefault(team, [])
        st.append(diff)
        if z:
            c = z["c"]; fine = d(c["a"])
            estate = lambda x: x and (6 <= x.month <= 7 or (x.month == 8 and x.day <= 15))
            if not estate(m["g"]) and z["n_club"] >= 3:
                lascia = 1 if (fine and 0 <= (fine - m["g"]).days <= 30 and not estate(fine)) else 0
                ultimi = st[-6:-1] if len(st) > 1 else []
                ultimi5 = st[-5:]; ultimi10 = st[-10:]
                cambi3 = sum(1 for x in cambi.get(team, []) if 0 < (m["g"] - x).days <= 3 * 365)
                persi5 = sum(1 for x in ultimi5 if x < -1.2)
                eventi.append({"x": [sum(ultimi5) / 5, sum(ultimi10) / 10, math.log1p(z["giorni"]), cambi3, persi5, z["res"] * 10], "y": lascia, "s": m["s"], "div": m["div"]})
    for lato, team in enumerate((m["h"], m["a"])):
        z = info[lato]
        if z:
            c = z["c"]
            alclub[(team, c["qid"], c["da"])] = z["n_club"] + 1
            cr = carriera.setdefault(c["qid"], [0, 0.0]); cr[0] += 1; cr[1] += m["pts"][lato] - att[lato]
            if z["n_club"] == 0 and d(c["da"]) and (m["g"] - d(c["da"])).days < 60:
                cambi.setdefault(team, []).append(d(c["da"]))
print("partite con allenatore noto per entrambe:", coperte)

X, Y, P = np.array(X), np.array(Y), np.array(P)
train = np.array([s < "2021" for s in S]); test = ~train


def ll(p, y):
    return float(-np.mean(np.log(np.clip(p[np.arange(len(y)), y], 1e-9, 1))))


def adatta(Xt, Yt, Pt, l2):
    """Logistica multinomiale con le quote come base (offset): logit_k = log p_k + w_k . x (pareggio come riferimento)."""
    k = Xt.shape[1]; W = np.zeros((2, k)); mu, sd = Xt.mean(0), Xt.std(0) + 1e-9
    Z = (Xt - mu) / sd; L = np.log(Pt)
    for it in range(3000):
        lo = L.copy(); lo[:, 0] += Z @ W[0]; lo[:, 2] += Z @ W[1]
        q = np.exp(lo - lo.max(1, keepdims=True)); q /= q.sum(1, keepdims=True)
        Yo = np.eye(3)[Yt]
        g0 = Z.T @ (q[:, 0] - Yo[:, 0]) / len(Yt) + l2 * W[0]; g2 = Z.T @ (q[:, 2] - Yo[:, 2]) / len(Yt) + l2 * W[1]
        W[0] -= 0.5 * g0; W[1] -= 0.5 * g2
    return W, mu, sd


def prevedi(W, mu, sd, Xv, Pv):
    Z = (Xv - mu) / sd; lo = np.log(Pv); lo[:, 0] += Z @ W[0]; lo[:, 2] += Z @ W[1]
    q = np.exp(lo - lo.max(1, keepdims=True)); return q / q.sum(1, keepdims=True)


R = {"partite": len(partite), "partite_con_allenatori": int(coperte), "allenamento": int(train.sum()), "verifica": int(test.sum())}
NOMI = ["nuovo allenatore casa", "nuovo allenatore ospite", "durata in carica (diff.)", "rendimento in carriera vs quote (diff.)", "esperienza (diff.)"]
base = ll(P[test], Y[test])
R["quote"] = round(base, 5)
mod = {}
for l2 in (0.001, 0.01, 0.1):
    W, mu, sd = adatta(X[train], Y[train], P[train], l2)
    q = prevedi(W, mu, sd, X[test], P[test])
    mod[l2] = (ll(q, Y[test]), W, mu, sd, q)
l2b = min(mod, key=lambda k: mod[k][0])
err, W, mu, sd, q = mod[l2b]
lp = -np.log(np.clip(q[np.arange(len(Y[test])), Y[test]], 1e-9, 1)); lb = -np.log(np.clip(P[test][np.arange(len(Y[test])), Y[test]], 1e-9, 1))
boot = [float(np.mean((lp - lb)[RNG.integers(0, len(lp), len(lp))])) for _ in range(500)]
R["modello"] = {"l2": l2b, "errore": round(err, 5), "miglioramento_pct": round(100 * (base - err) / base, 3),
                "ic95_differenza": [round(float(np.percentile(boot, 2.5)), 5), round(float(np.percentile(boot, 97.5)), 5)],
                "pesi_casa": dict(zip(NOMI, np.round(W[0], 4).tolist())), "pesi_ospite": dict(zip(NOMI, np.round(W[1], 4).tolist()))}
# una variabile alla volta
R["singole"] = {}
for j, nome in enumerate(NOMI):
    Wj, muj, sdj = adatta(X[train][:, [j]], Y[train], P[train], l2b)
    R["singole"][nome] = round(100 * (base - ll(prevedi(Wj, muj, sdj, X[test][:, [j]], P[test]), Y[test])) / base, 3)

# ---------- rimbalzo del nuovo allenatore (cambi a stagione in corso) ----------
per_team = {}
for m in partite:
    att = (3 * m["p"][0] + m["p"][1], 3 * m["p"][2] + m["p"][1])
    for lato, team in enumerate((m["h"], m["a"])):
        per_team.setdefault(team, []).append((m["g"], m["pts"][lato] - att[lato]))
prima, dopo5, dopo10 = [], [], []
for team, x in A.items():
    for t in x["allenatori"]:
        da = d(t["da"])
        if not da or not (9 <= da.month or da.month <= 4) or da.year < 2012:
            continue
        serie = per_team.get(team, [])
        pr = [v for g, v in serie if da - timedelta(days=70) <= g < da][-5:]
        dp = [v for g, v in serie if g >= da][:10]
        if len(pr) == 5 and len(dp) == 10:
            prima.append(np.mean(pr)); dopo5.append(np.mean(dp[:5])); dopo10.append(np.mean(dp))
if prima:
    R["rimbalzo"] = {"cambi": len(prima), "punti_vs_attese_5_prima": round(float(np.mean(prima)), 3), "5_dopo": round(float(np.mean(dopo5)), 3),
                     "10_dopo": round(float(np.mean(dopo10)), 3),
                     "nota": "Valori per partita: punti fatti meno punti attesi dalle quote. Se 'dopo' è vicino a zero, il nuovo allenatore fa quanto previsto dal mercato."}

# ---------- termometro della panchina ----------
NT = ["punti vs attese ultime 5", "punti vs attese ultime 10", "durata in carica (log giorni)", "cambi del club negli ultimi 3 anni", "sconfitte pesanti ultime 5", "rendimento in carriera"]
EX = np.array([e["x"] for e in eventi]); EY = np.array([e["y"] for e in eventi]); ES = [e["s"] for e in eventi]
tr = np.array([s < "2021" for s in ES]); te = ~tr
mu_t, sd_t = EX[tr].mean(0), EX[tr].std(0) + 1e-9
Z = (EX - mu_t) / sd_t
w = np.zeros(Z.shape[1]); b = math.log(EY[tr].mean() / (1 - EY[tr].mean()))
for it in range(4000):
    pz = 1 / (1 + np.exp(-(Z[tr] @ w + b)))
    gw = Z[tr].T @ (pz - EY[tr]) / tr.sum() + 0.01 * w; gb = float(np.mean(pz - EY[tr]))
    w -= 0.5 * gw; b -= 0.5 * gb
pt = 1 / (1 + np.exp(-(Z[te] @ w + b)))
base_t = float(EY[tr].mean())
bll = lambda p, y: float(-np.mean(y * np.log(np.clip(p, 1e-9, 1)) + (1 - y) * np.log(np.clip(1 - p, 1e-9, 1))))
ordine = np.argsort(-pt); yt = EY[te]
pos, neg = yt.sum(), len(yt) - yt.sum()
rank = np.empty(len(pt)); rank[np.argsort(pt)] = np.arange(1, len(pt) + 1)
auc = float((rank[yt == 1].sum() - pos * (pos + 1) / 2) / (pos * neg)) if pos and neg else None
dec = len(pt) // 10
fasce = []
for lo_, hi_ in ((0, 0.02), (0.02, 0.05), (0.05, 0.1), (0.1, 0.2), (0.2, 1.01)):
    s_ = (pt >= lo_) & (pt < hi_)
    if s_.sum():
        fasce.append({"fascia": f"{lo_:.0%}-{min(hi_, 1):.0%}", "n": int(s_.sum()), "stimata": round(float(pt[s_].mean()), 4), "reale": round(float(yt[s_].mean()), 4)})
R["termometro"] = {"campioni": len(eventi), "uscite": int(EY.sum()), "frequenza_base": round(base_t, 4),
                   "verifica": {"n": int(te.sum()), "errore_base": round(bll(np.full(te.sum(), base_t), yt), 5), "errore_modello": round(bll(pt, yt), 5),
                                "auc": round(auc, 3) if auc else None, "uscite_nel_10pct_piu_caldo": round(float(yt[ordine[:dec]].sum() / max(1, yt.sum())), 3),
                                "calibrazione": fasce},
                   "modello": {"variabili": NT, "pesi": np.round(w, 4).tolist(), "intercetta": round(float(b), 4), "media": np.round(mu_t, 4).tolist(), "scarto": np.round(sd_t, 4).tolist()}}
json.dump(R, open("storico/test_allenatori.json", "w"), ensure_ascii=False, indent=1)
print(json.dumps({k: v for k, v in R.items() if k != "termometro"}, ensure_ascii=False, indent=1)[:3000])
print(json.dumps(R["termometro"]["verifica"], ensure_ascii=False))
