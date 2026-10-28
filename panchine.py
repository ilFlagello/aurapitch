"""AuraPitch - allenatori e termometro della panchina.
Chi allena (Wikidata, storico/allenatori.json), da quanto, e la probabilità che lasci entro 30 giorni secondo il modello
verificato in strumenti/test_allenatori.py (AUC 0,73 sulle stagioni 2020/21-2025/26). Dati della stagione in corso con le quote
da Football-Data.co.uk (data/fd/stagione_XX.csv). Le probabilità non entrano nelle quote: lo studio mostra che il mercato
tiene già conto dell'allenatore."""
import csv
import json
import math
import os
from datetime import date, datetime, timezone

LEGHE = ("I1", "I2", "E0", "E1", "SP1", "D1", "F1")
LIVELLI = [(0.03, "Tranquilla"), (0.08, "Da tenere d'occhio"), (0.15, "Scotta"), (1.01, "Rovente")]


def _jload(p, d=None):
    try:
        with open(p, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return d


def _num(x):
    try:
        v = float(x)
        return v if v > 1 else None
    except (TypeError, ValueError):
        return None


def _togli(q):
    inv = [1 / x for x in q]
    k = 1.0
    for _ in range(50):
        s = sum(v ** k for v in inv)
        ds = sum(math.log(v) * v ** k for v in inv)
        k -= (s - 1) / ds
    p = [v ** k for v in inv]
    t = sum(p)
    return [v / t for v in p]


def _d(s):
    try:
        return date.fromisoformat(s) if s else None
    except ValueError:
        return None


def _calibra(p, fasce):
    """Correzione con la verifica: nelle fasce alte il modello sottostimava le uscite vere (es. 13% stimato, 21% reale)."""
    pts = sorted((f["stimata"], f["reale"]) for f in fasce if f.get("n", 0) >= 100)
    if len(pts) < 2:
        return p
    if p <= pts[0][0]:
        return p * pts[0][1] / pts[0][0]
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        if p <= x1:
            return y0 + (y1 - y0) * (p - x0) / (x1 - x0)
    return min(0.6, p * pts[-1][1] / pts[-1][0])


def calcola(fd_dir="data/fd", storico="storico"):
    """{nome squadra Football-Data: scheda allenatore e termometro} per i campionati con dati completi."""
    A = (_jload(os.path.join(storico, "allenatori.json"), {}) or {}).get("squadre", {})
    T = (_jload(os.path.join(storico, "test_allenatori.json"), {}) or {}).get("termometro", {})
    M = T.get("modello_finale") or T.get("modello")
    car = _jload(os.path.join(storico, "allenatori_carriere.json"), {}) or {}
    if not A or not M:
        return {}
    oggi = datetime.now(timezone.utc).date()
    out = {}
    for lg in LEGHE:
        try:
            with open(os.path.join(fd_dir, f"stagione_{lg}.csv"), encoding="utf-8-sig", errors="replace") as f:
                righe = list(csv.DictReader(f))
        except OSError:
            continue
        serie = {}
        for r in righe:
            q = [_num(r.get(c)) for c in ("AvgH", "AvgD", "AvgA")]
            try:
                hg, ag = int(r["FTHG"]), int(r["FTAG"])
                g = datetime.strptime(r["Date"], "%d/%m/%Y").date()
            except (ValueError, KeyError, TypeError):
                continue
            if not all(q):
                continue
            p = _togli(q)
            ph, pa = (3 if hg > ag else 1 if hg == ag else 0), (3 if ag > hg else 1 if hg == ag else 0)
            serie.setdefault(r["HomeTeam"], []).append((g, ph - (3 * p[0] + p[1]), ph))
            serie.setdefault(r["AwayTeam"], []).append((g, pa - (3 * p[2] + p[1]), pa))
        for team, s in serie.items():
            s.sort()
            info = A.get(team)
            if not info:
                continue
            aperti = [t for t in info["allenatori"] if t.get("da") and not t.get("a")]
            if not aperti:
                continue
            c = max(aperti, key=lambda t: t["da"])
            da = _d(c["da"])
            if not da or da > oggi:
                continue
            giorni = (oggi - da).days
            mie = [x for x in s if x[0] >= da]
            diffs = [x[1] for x in s]
            u5, u10 = diffs[-5:], diffs[-10:]
            cambi3 = sum(1 for t in info["allenatori"] if t.get("da") and 0 < (oggi - _d(t["da"])).days <= 3 * 365) - 1
            persi5 = sum(1 for x in u5 if x < -1.2)
            cr = car.get(c["qid"], {"n": 0, "res": 0.0})
            res = (cr["res"] + sum(x[1] for x in mie)) / (cr["n"] + len(mie) + 20)
            x = [sum(u5) / 5 if len(u5) == 5 else sum(u5) / max(1, len(u5)), sum(u10) / max(1, len(u10)), math.log1p(giorni), max(0, cambi3), persi5, res * 10]
            z = sum(w * (v - mu) / sd for w, v, mu, sd in zip(M["pesi"], x, M["media"], M["scarto"])) + M["intercetta"]
            p30 = _calibra(1 / (1 + math.exp(-z)), T.get("verifica", {}).get("calibrazione") or [])
            livello = next(n for soglia, n in LIVELLI if p30 < soglia)
            motivi = []
            if len(u5) >= 3:
                motivi.append(f"Ultime {len(u5)}: {sum(x[2] for x in s[-5:])} punti, {'+' if sum(u5) >= 0 else ''}{sum(u5):.1f} rispetto a quanto si aspettavano le quote".replace(".", ","))
            if persi5 >= 2:
                motivi.append(f"{persi5} sconfitte nette nelle ultime 5")
            if cambi3 >= 2:
                motivi.append(f"Il club ha cambiato {cambi3} allenatori negli ultimi 3 anni")
            if giorni < 120:
                motivi.append("Arrivato da poco: di solito si concede tempo")
            if cr["n"] >= 30:
                motivi.append(f"In carriera {'sopra' if res > 0.05 else 'sotto' if res < -0.05 else 'in linea con'} le attese delle quote ({cr['n'] + len(mie)} partite nei campionati seguiti)")
            out[team] = {"lg": lg, "chi": c["chi"], "da": c["da"], "giorni": giorni, "partite": len(mie), "p30": round(p30, 3), "livello": livello,
                         "motivi": motivi, "precedenti": [{"chi": t["chi"], "da": t["da"], "a": t["a"]} for t in info["allenatori"][-4:-1]]}
    return out
