"""AuraPitch - motore dei mercati e consiglio IA motivato.

1) Dalle quote medie (1X2 e Over/Under 2.5) ricava i gol attesi delle due squadre (modello di Poisson con
   correzione Dixon-Coles), cioe la "lettura" del mercato in forma di punteggi.
2) Dalla matrice dei risultati calcola probabilita e quota stimata di circa 45 mercati.
3) Incrocia ogni mercato con le statistiche reali delle squadre (gol fatti/subiti, over, goal, forma,
   classifica) e sceglie un consiglio principale e due alternative, con le motivazioni.
Solo libreria standard di Python.
"""
import math

MAXG = 10
RHO = -0.12   # v0.3: scelto sul passato (2006-2015) e verificato su 2016-2026
DELTA = 0.06  # v0.3: meno partite in cui una squadra resta a zero gol (il Poisson puro le sovrastima)
MARGINE = 0.06  # margine tipico dei bookmaker, usato per la "quota stimata" dei mercati senza quota raccolta
F1 = 0.442    # quota dei gol segnati nel primo tempo (38.736 partite 2012-2026 di 7 campionati)
RHO_T = 0.0    # nessuna correzione sui singoli tempi: verificato sulle stagioni 2023/24-2025/26 (test_tempi.json)
MAXT = 7


def _pois(l):
    out = [math.exp(-l)]
    for k in range(1, MAXG + 1):
        out.append(out[-1] * l / k)
    return out


def matrice(lh, la):
    ph, pa = _pois(lh), _pois(la)
    m = [[ph[i] * pa[j] for j in range(MAXG + 1)] for i in range(MAXG + 1)]
    m[0][0] *= 1 - lh * la * RHO
    m[0][1] *= 1 + lh * RHO
    m[1][0] *= 1 + la * RHO
    m[1][1] *= 1 - RHO
    for k in range(MAXG + 1):
        m[0][k] *= 1 - DELTA
        m[k][0] *= 1 - DELTA
    s = sum(map(sum, m))
    return [[v / s for v in r] for r in m]


def matrice_tempo(lh, la, rho=None):
    """Risultato di un singolo tempo: Poisson con una correzione Dixon-Coles leggera."""
    r = RHO_T if rho is None else rho
    ph, pa = _pois(lh), _pois(la)
    m = [[ph[i] * pa[j] for j in range(MAXT + 1)] for i in range(MAXT + 1)]
    m[0][0] *= 1 - lh * la * r
    m[0][1] *= 1 + lh * r
    m[1][0] *= 1 + la * r
    m[1][1] *= 1 - r
    s = sum(map(sum, m))
    return [[v / s for v in x] for x in m]


def congiunta(lh, la, f=None):
    """Elenco (prob, h1, a1, h, a): primo tempo e risultato finale insieme, tempi indipendenti."""
    f = F1 if f is None else f
    m1, m2 = matrice_tempo(lh * f, la * f), matrice_tempo(lh * (1 - f), la * (1 - f))
    out = []
    for i in range(MAXT + 1):
        for j in range(MAXT + 1):
            p1 = m1[i][j]
            if p1 < 1e-7:
                continue
            for k in range(MAXT + 1):
                for l in range(MAXT + 1):
                    p = p1 * m2[k][l]
                    if p > 1e-8:
                        out.append((p, i, j, i + k, j + l))
    return out


def _prob(m, f):
    return sum(m[i][j] for i in range(MAXG + 1) for j in range(MAXG + 1) if f(i, j))


def gol_attesi(mk, mo, linea=2.5):
    """Gol attesi (casa, ospite) che riproducono le probabilita del mercato 1X2 e Over (di solito 2,5; ESPN a volte da' 3,5)."""
    def err(lh, la):
        m = matrice(lh, la)
        p1 = _prob(m, lambda i, j: i > j)
        p2 = _prob(m, lambda i, j: i < j)
        e = (p1 - mk[0]) ** 2 + (p2 - mk[2]) ** 2
        if mo is not None:
            e += (_prob(m, lambda i, j: i + j > linea) - mo) ** 2
        else:
            e += 0.002 * (lh + la - 2.6) ** 2
        return e
    best, be = (1.4, 1.1), 9.0
    for a in range(2, 36, 2):
        for b in range(2, 36, 2):
            e = err(a / 10, b / 10)
            if e < be:
                best, be = (a / 10, b / 10), e
    lh0, la0 = best
    for a in range(-10, 11):
        for b in range(-10, 11):
            lh, la = lh0 + a / 50, la0 + b / 50
            if lh <= 0.05 or la <= 0.05:
                continue
            e = err(lh, la)
            if e < be:
                best, be = (lh, la), e
    return round(best[0], 3), round(best[1], 3)


# ---------- mercati ----------

TEMPI = ("T1:", "T2:", "PF", "TPG", "HSET", "ASET", "HVET", "AVET")


def serve_primo_tempo(c):
    return any(x.startswith(TEMPI) for x in c.split("+"))


def valuta(c, h, a, h1=None, a1=None):
    """Vero se il mercato (codice) e vinto con il risultato finale h-a (e del primo tempo h1-a1, se serve).
    None se il mercato riguarda i tempi e il risultato del primo tempo non e noto. Stessa logica dell'app."""
    if "+" in c:
        r = [valuta(x, h, a, h1, a1) for x in c.split("+")]
        return None if None in r else all(r)
    if c.startswith(TEMPI):
        if h1 is None or a1 is None:
            return None
        h2, a2 = h - h1, a - a1
        if c.startswith("T1:"):
            return valuta(c[3:], h1, a1)
        if c.startswith("T2:"):
            return valuta(c[3:], h2, a2)
        if c.startswith("PF"):  # parziale/finale, es. PF1/X
            x, y = c[2:].split("/")
            return valuta(x, h1, a1) and valuta(y, h, a)
        if c.startswith("TPG"):  # tempo con piu gol: 1, X (uguali), 2
            g1, g2 = h1 + a1, h2 + a2
            return {"1": g1 > g2, "X": g1 == g2, "2": g2 > g1}[c[3:]]
        if c == "HSET":
            return h1 > 0 and h2 > 0
        if c == "ASET":
            return a1 > 0 and a2 > 0
        if c == "HVET":
            return h1 > a1 and h2 > a2
        if c == "AVET":
            return a1 > h1 and a2 > h2
    t = h + a
    if c in ("1", "X", "2", "1X", "X2", "12"):
        r = "1" if h > a else ("X" if h == a else "2")
        return r in c
    if c == "GG":
        return h > 0 and a > 0
    if c == "NG":
        return h == 0 or a == 0
    if c == "PARI":
        return t % 2 == 0
    if c == "DISPARI":
        return t % 2 == 1
    if c.startswith("CS"):
        x, y = c[2:].split("-")
        return h == int(x) and a == int(y)
    if c.startswith("MG"):
        x, y = c[2:].split("-")
        return int(x) <= t <= int(y)
    if c.startswith("EH"):  # handicap europeo, es. EHM1:1 = casa con -1, esito 1; EHP1:X = casa con +1, pareggio
        hd, e = c[2:].split(":")
        return valuta(e, h + (-1 if hd[0] == "M" else 1) * int(hd[1:]), a)
    if c.startswith("MV"):  # margine di vittoria, es. MV1:2 = casa vince con 2 gol di scarto, MV2:3P = ospite di 3 o piu
        lato, n = c[2:].split(":")
        d = (h - a) if lato == "1" else (a - h)
        return d >= 3 if n == "3P" else d == int(n)
    if c.startswith("GE"):  # gol esatti nella partita
        return t >= 6 if c == "GE6P" else t == int(c[2:])
    if c[:3] in ("HGE", "AGE"):  # gol esatti di una squadra
        g = h if c[0] == "H" else a
        return g >= 3 if c[3:] == "3P" else g == int(c[3:])
    if c[:2] in ("HO", "HU", "AO", "AU"):
        g = h if c[0] == "H" else a
        n = float(c[2:])
        return g > n if c[1] == "O" else g < n
    if c[0] in "OU":
        n = float(c[1:])
        return t > n if c[0] == "O" else t < n
    raise ValueError(c)


def elenco_mercati(h, a):
    L = [("1", f"1 ({h})", "Esito finale"), ("X", "X (pareggio)", "Esito finale"), ("2", f"2 ({a})", "Esito finale"),
         ("1X", "1X", "Doppia chance"), ("X2", "X2", "Doppia chance"), ("12", "12", "Doppia chance")]
    for n in ("0.5", "1.5", "2.5", "3.5", "4.5"):
        L += [(f"O{n}", f"Over {n}".replace(".", ","), "Under/Over"), (f"U{n}", f"Under {n}".replace(".", ","), "Under/Over")]
    L += [("GG", "Goal (segnano entrambe)", "Goal/No Goal"), ("NG", "No Goal", "Goal/No Goal")]
    for x, y in ((1, 2), (1, 3), (2, 3), (2, 4), (3, 5), (4, 6)):
        L.append((f"MG{x}-{y}", f"Multigol {x}-{y}", "Multigol"))
    L += [("HO0.5", f"{h} segna", "Gol squadra"), ("HO1.5", f"{h} almeno 2 gol", "Gol squadra"), ("AO0.5", f"{a} segna", "Gol squadra"),
          ("AO1.5", f"{a} almeno 2 gol", "Gol squadra"), ("AU0.5", f"{h} non subisce gol", "Gol squadra"), ("HU0.5", f"{a} non subisce gol", "Gol squadra")]
    for c, l in (("1+O1.5", "1 + Over 1,5"), ("1+U3.5", "1 + Under 3,5"), ("2+O1.5", "2 + Over 1,5"), ("2+U3.5", "2 + Under 3,5"), ("X+U2.5", "X + Under 2,5"),
                 ("1X+U3.5", "1X + Under 3,5"), ("X2+U3.5", "X2 + Under 3,5"), ("1X+O1.5", "1X + Over 1,5"), ("X2+O1.5", "X2 + Over 1,5"),
                 ("1+GG", "1 + Goal"), ("2+GG", "2 + Goal"), ("1X+GG", "1X + Goal"), ("X2+GG", "X2 + Goal"), ("GG+O2.5", "Goal + Over 2,5"), ("NG+U2.5", "No Goal + Under 2,5")):
        L.append((c, l, "Combo"))
    for c, l in (("1+AU0.5", f"{h} vince senza subire gol"), ("2+HU0.5", f"{a} vince senza subire gol"), ("1+MG2-4", "1 + Multigol 2-4"), ("2+MG2-4", "2 + Multigol 2-4"),
                 ("1X+MG1-3", "1X + Multigol 1-3"), ("X2+MG1-3", "X2 + Multigol 1-3"), ("1+NG", "1 + No Goal"), ("2+NG", "2 + No Goal"), ("X+GG", "X + Goal"),
                 ("1X+U2.5", "1X + Under 2,5"), ("X2+U2.5", "X2 + Under 2,5"), ("12+O2.5", "12 + Over 2,5"), ("12+GG", "12 + Goal"), ("GG+O3.5", "Goal + Over 3,5"),
                 ("1+O2.5", "1 + Over 2,5"), ("2+O2.5", "2 + Over 2,5"), ("1+U2.5", "1 + Under 2,5"), ("2+U2.5", "2 + Under 2,5"), ("1X+NG", "1X + No Goal"), ("X2+NG", "X2 + No Goal")):
        L.append((c, l, "Combo"))
    for hd, segno in (("M1", "−1"), ("P1", "+1"), ("M2", "−2"), ("P2", "+2")):
        for e, n in (("1", h), ("X", "pareggio"), ("2", a)):
            L.append((f"EH{hd}:{e}", f"Handicap {segno} a {h}: {e} ({n})", "Handicap"))
    for lato, n in (("1", h), ("2", a)):
        for k, t in (("1", "di 1 gol"), ("2", "di 2 gol"), ("3P", "di 3 o più gol")):
            L.append((f"MV{lato}:{k}", f"{n} vince {t}", "Margine di vittoria"))
    for k in range(6):
        L.append((f"GE{k}", f"Gol totali esatti: {k}", "Gol esatti"))
    L.append(("GE6P", "Gol totali: 6 o più", "Gol esatti"))
    for sq, n in (("H", h), ("A", a)):
        for k in ("0", "1", "2", "3P"):
            L.append((f"{sq}GE{k}", f"{n} segna esattamente {k} gol" if k != "3P" else f"{n} segna 3 o più gol", "Gol squadra"))
        L += [(f"{sq}O2.5", f"{n} Over 2,5 gol", "Gol squadra"), (f"{sq}U1.5", f"{n} Under 1,5 gol", "Gol squadra")]
    L += [("PARI", "Somma gol pari", "Pari/Dispari"), ("DISPARI", "Somma gol dispari", "Pari/Dispari")]
    return L


def elenco_tempi(h, a):
    """Mercati che dipendono dai singoli tempi."""
    L = []
    for t, nt in (("T1:", "1° tempo"), ("T2:", "2° tempo")):
        g = "Primo tempo" if t == "T1:" else "Secondo tempo"
        L += [(t + "1", f"{nt}: 1 ({h})", g), (t + "X", f"{nt}: X (pareggio)", g), (t + "2", f"{nt}: 2 ({a})", g),
              (t + "1X", f"{nt}: 1X", g), (t + "X2", f"{nt}: X2", g), (t + "12", f"{nt}: 12", g)]
        for n in ("0.5", "1.5", "2.5"):
            L += [(f"{t}O{n}", f"{nt}: Over {n}".replace(".", ","), g), (f"{t}U{n}", f"{nt}: Under {n}".replace(".", ","), g)]
        L += [(t + "GG", f"{nt}: segnano entrambe", g), (t + "NG", f"{nt}: No Goal", g),
              (t + "HO0.5", f"{nt}: {h} segna", g), (t + "AO0.5", f"{nt}: {a} segna", g)]
    for x in ("1", "X", "2"):
        for y in ("1", "X", "2"):
            L.append((f"PF{x}/{y}", f"Parziale/finale {x}/{y}", "Parziale/finale"))
    L += [("TPG1", "Più gol nel 1° tempo", "Tempo con più gol"), ("TPGX", "Stessi gol nei due tempi", "Tempo con più gol"), ("TPG2", "Più gol nel 2° tempo", "Tempo con più gol"),
          ("HSET", f"{h} segna in entrambi i tempi", "Tempi"), ("ASET", f"{a} segna in entrambi i tempi", "Tempi"),
          ("HVET", f"{h} vince entrambi i tempi", "Tempi"), ("AVET", f"{a} vince entrambi i tempi", "Tempi"),
          ("T1:O0.5+O1.5", "Gol nel 1° tempo + Over 1,5", "Combo"), ("T1:1+1", "1 nel 1° tempo + 1 finale", "Combo"), ("T1:2+2", "2 nel 1° tempo + 2 finale", "Combo")]
    return L


def calcola_mercati(lh, la, h, a, quote_raccolte):
    m = matrice(lh, la)
    out = []
    for c, l, g in elenco_mercati(h, a):
        p = _prob(m, lambda i, j, c=c: valuta(c, i, j))
        if p <= 0.001:
            continue
        q = quote_raccolte.get(c)
        out.append({"c": c, "l": l, "g": g, "p": round(p, 4), "q": round(q, 2) if q else round(max(1.01, (1 - MARGINE) / p), 2), "qm": bool(q)})
    J = congiunta(lh, la)
    for c, l, g in elenco_tempi(h, a):
        p = sum(x[0] for x in J if valuta(c, x[3], x[4], x[1], x[2]))
        if p <= 0.001:
            continue
        out.append({"c": c, "l": l, "g": g, "p": round(p, 4), "q": round(max(1.01, (1 - MARGINE) / p), 2), "qm": False})
    esatti = sorted(((m[i][j], i, j) for i in range(7) for j in range(7)), reverse=True)[:10]
    for p, i, j in esatti:
        out.append({"c": f"CS{i}-{j}", "l": f"Risultato esatto {i}-{j}", "g": "Risultato esatto", "p": round(p, 4), "q": round(max(1.01, (1 - MARGINE) / p), 2), "qm": False})
    return out


# ---------- statistiche e motivazioni ----------

def statistiche(storico):
    """storico: lista di partite giocate da una squadra (dict con gf, gs, casa), dalla piu vecchia alla piu recente."""
    u = storico[-10:]
    if len(u) < 4:
        return None
    n = len(u)
    tot = [z["gf"] + z["gs"] for z in u]
    return {"n": n, "gf": sum(z["gf"] for z in u) / n, "gs": sum(z["gs"] for z in u) / n, "media": sum(tot) / n,
            "over15": sum(t > 1.5 for t in tot), "over25": sum(t > 2.5 for t in tot), "over35": sum(t > 3.5 for t in tot),
            "gg": sum(z["gf"] > 0 and z["gs"] > 0 for z in u), "segna": sum(z["gf"] > 0 for z in u), "subisce": sum(z["gs"] > 0 for z in u),
            "pts5": sum(3 if z["gf"] > z["gs"] else 1 if z["gf"] == z["gs"] else 0 for z in storico[-5:]), "n5": len(storico[-5:]),
            "dr": sum(z["gf"] - z["gs"] for z in u) / n, **statistiche_tempi(u)}


def statistiche_tempi(u):
    """Gol nel primo e nel secondo tempo (se il risultato del primo tempo e noto)."""
    t = [z for z in u if z.get("gf1") is not None]
    if len(t) < 4:
        return {}
    n = len(t)
    g1 = [z["gf1"] + z["gs1"] for z in t]
    g2 = [z["gf"] + z["gs"] - z["gf1"] - z["gs1"] for z in t]
    return {"n1": n, "m1": sum(g1) / n, "m2": sum(g2) / n, "o05_1": sum(x > 0 for x in g1), "o15_1": sum(x > 1 for x in g1),
            "segna1": sum(z["gf1"] > 0 for z in t), "v1": sum(z["gf1"] > z["gs1"] for z in t), "x1": sum(z["gf1"] == z["gs1"] for z in t)}


def _f(x):
    return f"{x:.1f}".replace(".", ",")


def motivi(c, h, a, sh, sa, ctx):
    """Motivazioni per un mercato: lista di (testo, d'accordo: True/False/None)."""
    if "+" in c:
        out, visti = [], set()
        for x in c.split("+"):
            for t, ok in motivi(x, h, a, sh, sa, ctx):
                if t not in visti:
                    visti.add(t)
                    out.append((t, ok))
        return out
    out = []
    if c.startswith(("T1:", "T2:")) and sh and sa and sh.get("n1") and sa.get("n1"):
        primo = c.startswith("T1:")
        k = "m1" if primo else "m2"
        nt = "primo" if primo else "secondo"
        x = c[3:]
        out.append((f"Gol nel {nt} tempo: in media {_f(sh[k])} nelle partite di {h}, {_f(sa[k])} in quelle di {a}.",
                    None if x[0] not in "OU" else ((sh[k] + sa[k]) / 2 > float(x[1:]) + 0.2 if x[0] == "O" else (sh[k] + sa[k]) / 2 < float(x[1:]) + 0.1)))
        if primo and x in ("1", "X", "2", "1X", "X2", "12"):
            tx = sh["x1"] / sh["n1"] + sa["x1"] / sa["n1"]
            out.append((f"Primo tempo in parità in {sh['x1']} delle ultime {sh['n1']} di {h} e in {sa['x1']} delle ultime {sa['n1']} di {a}.",
                        tx / 2 > 0.42 if x == "X" else (tx / 2 < 0.42 if x == "12" else None)))
        if primo and x == "O0.5":
            out.append((f"Almeno un gol nel primo tempo in {sh['o05_1']} delle ultime {sh['n1']} di {h} e in {sa['o05_1']} delle ultime {sa['n1']} di {a}.",
                        (sh["o05_1"] + sa["o05_1"]) / (sh["n1"] + sa["n1"]) > 0.68))
        return out
    if c.startswith("TPG") and sh and sa and sh.get("n1") and sa.get("n1"):
        d = (sh["m2"] + sa["m2"]) - (sh["m1"] + sa["m1"])
        out.append((f"Gol nel primo/secondo tempo: {_f(sh['m1'])}/{_f(sh['m2'])} per {h}, {_f(sa['m1'])}/{_f(sa['m2'])} per {a}.",
                    d > 0.3 if c == "TPG2" else d < -0.1 if c == "TPG1" else None))
        return out
    if c.startswith("PF"):
        x, y = c[2:].split("/")
        return motivi(y, h, a, sh, sa, ctx) + motivi("T1:" + x, h, a, sh, sa, ctx)
    if c.startswith(("EH", "MV")) and sh and sa:
        d = sh["dr"] - sa["dr"]
        if c.startswith("EH"):
            hd, e = c[2:].split(":")
            soglia = (-1 if hd[0] == "M" else 1) * int(hd[1:])
            ok = None if e == "X" else (d + soglia > 0.6) if e == "1" else (d + soglia < -0.6)
        else:
            lato, n = c[2:].split(":")
            dd = d if lato == "1" else -d
            ok = dd >= 1.5 if n in ("2", "3P") else 0.3 <= dd <= 1.8
        out.append((f"Differenza reti media nelle ultime partite: {'+' if sh['dr'] >= 0 else ''}{_f(sh['dr'])} per {h}, {'+' if sa['dr'] >= 0 else ''}{_f(sa['dr'])} per {a}.", ok))
        return out + motivi("1" if (c[2:].startswith("1") or c.endswith(":1")) else "2", h, a, sh, sa, ctx)[:1]
    if c.startswith("GE") and sh and sa:
        media = (sh["media"] + sa["media"]) / 2
        n = 6 if c == "GE6P" else int(c[2:])
        out.append((f"Media gol nelle ultime partite: {_f(sh['media'])} con {h}, {_f(sa['media'])} con {a}.", abs(media - n) < 0.8))
        return out
    if c[:3] in ("HGE", "AGE") and sh and sa:
        att, dif, nome = (sh, sa, h) if c[0] == "H" else (sa, sh, a)
        n = 3 if c[3:] == "3P" else int(c[3:])
        e = (att["gf"] + dif["gs"]) / 2
        out.append((f"{nome} segna in media {_f(att['gf'])} gol a partita; l'avversaria ne subisce {_f(dif['gs'])}.", abs(e - n) < 0.7))
        return out
    if sh and sa:
        if c[0] in "OU" and c[1:].replace(".", "").isdigit():
            n = float(c[1:])
            media = (sh["media"] + sa["media"]) / 2
            out.append((f"Media gol nelle ultime partite: {_f(sh['media'])} con {h}, {_f(sa['media'])} con {a}.", media > n + 0.25 if c[0] == "O" else media < n + 0.15))
            if n == 2.5:
                ov = sh["over25"] + sa["over25"]
                tt = sh["n"] + sa["n"]
                out.append((f"Over 2,5 in {sh['over25']} delle ultime {sh['n']} di {h} e in {sa['over25']} delle ultime {sa['n']} di {a}.", ov / tt > 0.55 if c[0] == "O" else ov / tt < 0.45))
            if n == 1.5:
                ov = sh["over15"] + sa["over15"]
                tt = sh["n"] + sa["n"]
                out.append((f"Almeno 2 gol in {sh['over15']} delle ultime {sh['n']} di {h} e in {sa['over15']} delle ultime {sa['n']} di {a}.", ov / tt > 0.7 if c[0] == "O" else ov / tt < 0.5))
            if n == 3.5:
                ov = sh["over35"] + sa["over35"]
                tt = sh["n"] + sa["n"]
                out.append((f"Più di 3 gol solo in {ov} delle ultime {tt} partite delle due squadre.", ov / tt > 0.35 if c[0] == "O" else ov / tt < 0.3))
        elif c in ("GG", "NG"):
            r = (sh["segna"] / sh["n"] + sa["segna"] / sa["n"]) / 2
            out.append((f"{h} ha segnato in {sh['segna']} delle ultime {sh['n']}, {a} in {sa['segna']} delle ultime {sa['n']}.", r > 0.75 if c == "GG" else r < 0.65))
            g = (sh["gg"] + sa["gg"]) / (sh["n"] + sa["n"])
            out.append((f"Entrambe a segno in {sh['gg']} delle ultime {sh['n']} di {h} e in {sa['gg']} delle ultime {sa['n']} di {a}.", g > 0.55 if c == "GG" else g < 0.45))
        elif c.startswith("MG"):
            x, y = (int(v) for v in c[2:].split("-"))
            media = (sh["media"] + sa["media"]) / 2
            out.append((f"Media gol nelle ultime partite: {_f(sh['media'])} con {h}, {_f(sa['media'])} con {a}.", x <= media <= y))
        elif c[:2] in ("HO", "HU", "AO", "AU"):
            att, dif, nome_att = (sh, sa, h) if c[0] == "H" else (sa, sh, a)
            n = float(c[2:])
            if c[1] == "O":
                out.append((f"{nome_att} segna in media {_f(att['gf'])} gol a partita; l'avversaria ne subisce {_f(dif['gs'])}.", (att["gf"] + dif["gs"]) / 2 > n + 0.4))
            else:
                out.append((f"{nome_att} segna in media {_f(att['gf'])} gol a partita e non ha segnato in {att['n'] - att['segna']} delle ultime {att['n']}.", (att["gf"] + dif["gs"]) / 2 < 0.95))
        elif c in ("1", "X", "2", "1X", "X2", "12"):
            out.append((f"Forma: {sh['pts5']} punti nelle ultime {sh['n5']} per {h}, {sa['pts5']} nelle ultime {sa['n5']} per {a}.",
                        None if c in ("X", "12") else (sh["pts5"] >= sa["pts5"]) if "1" in c else (sa["pts5"] >= sh["pts5"])))
            ph, pa = ctx.get("pos_h"), ctx.get("pos_a")
            if ph and pa:
                out.append((f"In classifica {h} è {ph}°, {a} è {pa}°.", None if c in ("X", "12") else (ph <= pa) if "1" in c else (pa <= ph)))
    if c.startswith("CS"):
        out.append(("È tra i risultati più probabili secondo la lettura delle quote, ma resta un evento raro.", None))
    if c in ("PARI", "DISPARI"):
        out.append(("Mercato quasi casuale: utile solo per divertimento.", None))
    return out


PROFILI = {
    "consiglio": {"nome": "Consiglio IA", "pmin": 0.45, "pmax": 0.75, "qmin": 1.35, "qmax": 2.4},
    "prudente": {"nome": "Alternativa prudente", "pmin": 0.72, "pmax": 0.97, "qmin": 1.18, "qmax": 1.5},
    "coraggiosa": {"nome": "Alternativa coraggiosa", "pmin": 0.18, "pmax": 0.46, "qmin": 2.3, "qmax": 6.0},
}


def scegli(mercati, h, a, sh, sa, ctx, nb):
    """Per ogni profilo, il mercato con il miglior equilibrio tra probabilita e accordo delle statistiche."""
    out = {}
    usati = set()
    for k, pr in PROFILI.items():
        best, bs = None, -1
        for mk in mercati:
            if mk["g"] in ("Risultato esatto", "Pari/Dispari") or mk["c"] in usati:
                continue
            if not (pr["pmin"] <= mk["p"] <= pr["pmax"] and pr["qmin"] <= mk["q"] <= pr["qmax"]):
                continue
            mot = motivi(mk["c"], h, a, sh, sa, ctx)
            voti = [ok for _, ok in mot if ok is not None]
            accordo = sum(voti) / len(voti) if voti else 0.5
            if voti and accordo < 0.5:
                continue  # le statistiche dicono il contrario: niente consiglio su questo mercato
            score = 0.55 * accordo + 0.45 * mk["p"] + (0.03 if mk["qm"] else 0)
            if score > bs:
                best, bs = (mk, mot, accordo), score
        if best:
            mk, mot, accordo = best
            usati.add(mk["c"])
            base = f"Probabilità stimata {round(mk['p'] * 100)}%" + (", ricavata dalle quote di un bookmaker (DraftKings, tramite ESPN)." if nb == 1 else f", ricavata dalle quote medie di {nb} bookmaker." if nb else ", ricavata dalle quote medie dei bookmaker.")
            perche = [base] + [t for t, ok in mot if ok is not False]
            contro = [t for t, ok in mot if ok is False]
            out[k] = {"c": mk["c"], "l": mk["l"], "p": mk["p"], "q": mk["q"], "qm": mk["qm"], "titolo": pr["nome"],
                      "accordo": round(accordo, 2), "perche": perche, "contro": contro}
    return out


# ---------- marcatori ----------

PESO_RUOLO = {"F": 1.0, "M": 0.45, "D": 0.15, "G": 0.0}


def marcatori(rosa, lam, assenti=(), quanti=6):
    """Probabilita che un giocatore segni (in qualsiasi momento): quota dei gol della squadra (gol in stagione, con una
    piccola base per ruolo) x gol attesi della squadra, pesata per quanto spesso parte titolare. Esclude gli indisponibili."""
    reg = [x for x in rosa if x.get("pres", 0) >= 2 and x.get("n") not in assenti]
    if not reg:
        return []
    G = sum(x.get("g", 0) for x in reg)
    N = max(x.get("pres", 0) for x in reg)
    pesi = {x["n"]: PESO_RUOLO.get(str(x.get("pos") or "M")[0], 0.4) for x in reg}
    W = sum(pesi.values()) or 1
    out = []
    for x in reg:
        quota = (x.get("g", 0) + 2.0 * pesi[x["n"]] / W * 3) / (G + 6.0)
        tit = x.get("tit", 0) / max(1, N)
        sub = max(0, x.get("pres", 0) - x.get("tit", 0)) / max(1, N)
        att = min(1.0, tit * 1.0 + sub * 0.35) / max(0.35, min(1.0, x.get("pres", 0) / max(1, N)))
        p = 1 - math.exp(-lam * quota * min(1.15, att))
        if p >= 0.06:
            out.append({"n": x["n"], "p": round(p, 4), "g": x.get("g", 0), "pres": x.get("pres", 0), "tit": x.get("tit", 0)})
    out.sort(key=lambda z: -z["p"])
    return out[:quanti]


PESO_CART = {"D": 1.0, "M": 0.9, "F": 0.55, "G": 0.15}   # chi prende piu gialli, a parita di minuti
PESO_ASSIST = {"M": 1.0, "F": 0.7, "D": 0.45, "G": 0.02}
QUOTA_ASSISTITI = 0.72  # circa 7 gol su 10 hanno un assist (dati delle grandi leghe)


def _presenza(x, N):
    """Quanto e probabile che giochi e quanto: titolare pieno, ingresso dalla panchina vale circa un terzo."""
    tit = x.get("tit", 0) / max(1, N)
    sub = max(0, x.get("pres", 0) - x.get("tit", 0)) / max(1, N)
    return min(1.0, tit + sub * 0.35) / max(0.35, min(1.0, x.get("pres", 0) / max(1, N)))


def _giocatori_quota(rosa, campo, pesi_ruolo, totale_atteso, assenti, quanti, base=3.0):
    """Schema comune (come i marcatori): quota del giocatore sul totale della squadra (stagione + piccola base per ruolo),
    per il totale atteso della squadra in questa partita, pesata per i minuti attesi."""
    reg = [x for x in rosa if x.get("pres", 0) >= 2 and x.get("n") not in assenti]
    if not reg or totale_atteso <= 0:
        return []
    T = sum(x.get(campo, 0) for x in reg)
    N = max(x.get("pres", 0) for x in reg)
    pesi = {x["n"]: pesi_ruolo.get(str(x.get("pos") or "M")[0], 0.5) for x in reg}
    W = sum(pesi.values()) or 1
    out = []
    for x in reg:
        quota = (x.get(campo, 0) + 2.0 * pesi[x["n"]] / W * base) / (T + 2.0 * base)
        p = 1 - math.exp(-totale_atteso * quota * min(1.15, _presenza(x, N)))
        if p >= 0.06:
            out.append({"n": x["n"], "p": round(p, 4), "v": x.get(campo, 0), "pres": x.get("pres", 0), "tit": x.get("tit", 0)})
    out.sort(key=lambda z: -z["p"])
    return out[:quanti]


def ammoniti(rosa, cartellini_attesi, assenti=(), quanti=5):
    """Probabilita che un giocatore venga ammonito: quota dei gialli della squadra x gialli attesi della squadra in questa
    partita (che tengono gia conto di arbitro e avversario), pesata per i minuti attesi."""
    return _giocatori_quota(rosa, "gialli", PESO_CART, cartellini_attesi or 1.9, assenti, quanti, base=4.0)


def assist(rosa, lam, assenti=(), quanti=5):
    """Probabilita che un giocatore faccia almeno un assist: quota degli assist della squadra x gol attesi con assist."""
    return _giocatori_quota(rosa, "a", PESO_ASSIST, lam * QUOTA_ASSISTITI, assenti, quanti)


# ---------- valutazione IA di tutti i mercati ----------

GRUPPI_CART = {"K": "Cartellini", "C": "Calci d'angolo", "F": "Falli"}


def _cart_motivi(c, h, a, cart):
    k = c[0]
    info = (cart or {}).get(k)
    if not info:
        return [], GRUPPI_CART[k]
    nome = {"K": "cartellini", "C": "calci d'angolo", "F": "falli"}[k]
    if c[1] in "HA":
        lato = 0 if c[1] == "H" else 1
        att = (info.get("squadre") or [None, None])[lato]
        L = float(c[3:])
        sq = h if lato == 0 else a
        if att is None:
            return [], GRUPPI_CART[k] + " squadra"
        return [(f"{sq}: {nome} attesi {_f(att)} (fatti {_f(info['casa' if lato == 0 else 'ospite'][0])} a partita in media).", None)], GRUPPI_CART[k] + " squadra"
    L = float(c[2:])
    # i cartellini attesi sono gia la base della probabilita: qui sono un'informazione, non un "voto" in piu
    return [(f"{nome.capitalize()} attesi {_f(info['attesi'])}, media del campionato {_f(info['media_lega'])}.", None)], GRUPPI_CART[k]


def valutazioni(mercati, h, a, sh, sa, ctx, cart=None, extra=None, marc=None, marc_info=None):
    """Punteggio IA (0-100) di ogni mercato e la scelta migliore per ogni gruppo, con le motivazioni.
    Punteggio = 55% accordo delle statistiche (50% se non ci sono statistiche) + 45% probabilita."""
    tutti = [dict(x) for x in mercati]
    for c, p, q in ((r[0], r[1], r[2]) for r in (extra or [])):
        mot, g = _cart_motivi(c, h, a, cart)
        tutti.append({"c": c, "p": p, "q": q or round(max(1.01, (1 - MARGINE) / p), 2), "g": g, "qm": False, "_mot": mot})
    for c, p, q in ((r[0], r[1], r[2]) for r in (marc or [])):
        i = (marc_info or {}).get(c) or {}
        nome, pr, tit = c.split(":", 1)[1], i.get("pres", 0), i.get("tit", 0)
        if c.startswith("AMM:"):
            g, mot = "Ammoniti", [(f"{nome} ha preso {i.get('v', 0)} gialli in {pr} presenze ({tit} da titolare).", i.get("v", 0) / max(1, pr) >= 0.25)]
        elif c.startswith("ASS:"):
            g, mot = "Assist", [(f"{nome} ha fatto {i.get('v', 0)} assist in {pr} presenze ({tit} da titolare).", i.get("v", 0) / max(1, pr) >= 0.2)]
        else:
            g, mot = "Marcatori", [(f"{nome} ha segnato {i.get('g', 0)} gol in {pr} presenze ({tit} da titolare).", i.get("g", 0) / max(1, pr) >= 0.3)]
        tutti.append({"c": c, "p": p, "q": q, "g": g, "qm": False, "_mot": mot})
    punti, gruppi = {}, {}
    for x in tutti:
        mot = x.get("_mot")
        if mot is None:
            mot = motivi(x["c"], h, a, sh, sa, ctx)
        voti = [ok for _, ok in mot if ok is not None]
        acc = sum(voti) / len(voti) if voti else 0.5
        sc = round(100 * (0.55 * acc + 0.45 * x["p"]))
        punti[x["c"]] = sc
        if x["g"] in ("Pari/Dispari",):
            continue
        if not (0.33 <= x["p"] <= 0.9 and x["q"] >= 1.2) or (voti and acc < 0.5):
            continue
        b = gruppi.get(x["g"])
        if b is None or sc > b["s"]:
            gruppi[x["g"]] = {"c": x["c"], "p": x["p"], "q": x["q"], "s": sc, "si": [t for t, ok in mot if ok][:3], "no": [t for t, ok in mot if ok is False][:2],
                              "info": [t for t, ok in mot if ok is None][:1]}
    return {"s": punti, "g": gruppi}
