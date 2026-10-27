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


def _prob(m, f):
    return sum(m[i][j] for i in range(MAXG + 1) for j in range(MAXG + 1) if f(i, j))


def gol_attesi(mk, mo):
    """Gol attesi (casa, ospite) che riproducono le probabilita del mercato 1X2 e Over 2.5."""
    def err(lh, la):
        m = matrice(lh, la)
        p1 = _prob(m, lambda i, j: i > j)
        p2 = _prob(m, lambda i, j: i < j)
        e = (p1 - mk[0]) ** 2 + (p2 - mk[2]) ** 2
        if mo is not None:
            e += (_prob(m, lambda i, j: i + j > 2) - mo) ** 2
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

def valuta(c, h, a):
    """Vero se il mercato (codice) e vinto con il risultato h-a. Stessa logica usata dall'app."""
    if "+" in c:
        return all(valuta(x, h, a) for x in c.split("+"))
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
    L += [("PARI", "Somma gol pari", "Pari/Dispari"), ("DISPARI", "Somma gol dispari", "Pari/Dispari")]
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
    esatti = sorted(((m[i][j], i, j) for i in range(7) for j in range(7)), reverse=True)[:6]
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
            "pts5": sum(3 if z["gf"] > z["gs"] else 1 if z["gf"] == z["gs"] else 0 for z in storico[-5:]), "n5": len(storico[-5:])}


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
            base = f"Probabilità stimata {round(mk['p'] * 100)}%" + (f", ricavata dalle quote medie di {nb} bookmaker." if nb else ", ricavata dalle quote medie dei bookmaker.")
            perche = [base] + [t for t, ok in mot if ok is not False]
            contro = [t for t, ok in mot if ok is False]
            out[k] = {"c": mk["c"], "l": mk["l"], "p": mk["p"], "q": mk["q"], "qm": mk["qm"], "titolo": pr["nome"],
                      "accordo": round(accordo, 2), "perche": perche, "contro": contro}
    return out
