"""AuraPitch - onesta delle probabilita e consigli per campionato (revisore e apprendimento). Solo libreria standard.

"Onesta": quando l'IA dice 60% deve succedere circa 6 volte su 10. Per ogni campionato con abbastanza partite finite nel
diario si misura lo scarto tra probabilita dette e frequenze vere (per fasce di 10 punti, le probabilita sotto il 50% lette
al contrario), togliendo la parte dovuta al caso (con poche partite lo scarto e sempre un po' sopra zero anche per un'IA
perfetta). Si confrontano anche IA e quote (errore medio sull'esito finale) e i consigli vinti contro attesi.

Affidabilita del consiglio: dove l'IA e stata meno onesta, l'affidabilita mostrata nell'app scende (fattore 0,6-1).
Regola ferma: prima si misura. I fattori si calcolano sulle partite piu vecchie del diario e si provano sulle piu recenti
(mai viste): entrano solo se i campionati penalizzati restano davvero meno onesti anche li. Altrimenti restano in ombra.
Usato da strumenti/revisore.py (controllo per campionato), strumenti/impara.py (fattori nel modello) e genera_app.py."""
import math

CODICI = ("1", "X", "2", "O2.5", "GG")
MIN_PARTITE = 60      # partite finite di un campionato prima di giudicarne l'onesta
MIN_CONSIGLI = 30     # consigli verificati di un campionato prima di giudicarli
SOGLIA_SCARTO = 3.0   # punti di scarto (oltre la media) prima di abbassare l'affidabilita
MIN_PROVA = 100       # partite mai viste nei campionati penalizzati per poter dire che la penalita e giusta
FATTORE_MIN = 0.6


def esito(c, g):
    h, a = g
    return int({"1": h > a, "X": h == a, "2": h < a, "O2.5": h + a > 2.5, "GG": h > 0 and a > 0}[c])


def finite(diario):
    """Voci del diario finite con risultato e probabilita mostrate."""
    return [v for v in diario if v.get("st") == "FT" and isinstance(v.get("g"), list) and len(v["g"]) == 2 and v.get("pc")]


def scarto(voci):
    """Scarto medio (in punti percentuali) tra probabilita dette e frequenze vere, per fasce, al netto del caso.
    Restituisce (scarto, previsioni)."""
    fasce = {}
    for v in voci:
        for c in CODICI:
            if c not in v["pc"]:
                continue
            p, y = float(v["pc"][c]), esito(c, v["g"])
            if p < 0.5:
                p, y = 1 - p, 1 - y
            s = fasce.setdefault(min(9, int(p * 10)), [0.0, 0.0, 0.0])
            s[0] += y - p
            s[1] += p * (1 - p)
            s[2] += 1
    n = sum(s[2] for s in fasce.values())
    if not n:
        return None, 0
    # |somma(y - p)| ha valore atteso circa sqrt(2/pi * varianza) anche con probabilita perfette: quella parte e caso
    eccesso = sum(max(0.0, abs(d) - math.sqrt(2 / math.pi * var)) for d, var, _ in fasce.values())
    return round(100 * eccesso / n, 2), int(n)


def errore_esito(voci):
    """Errore medio (log-loss) di IA e quote sull'esito finale: (ia, quote, n)."""
    ia = qu = 0.0
    n = 0
    for v in voci:
        pc, mk = v["pc"], v.get("mk")
        if not (mk and len(mk) == 3 and all(c in pc for c in ("1", "X", "2"))):
            continue
        k = 0 if v["g"][0] > v["g"][1] else 1 if v["g"][0] == v["g"][1] else 2
        ia += -math.log(max(1e-6, pc[("1", "X", "2")[k]]))
        qu += -math.log(max(1e-6, mk[k] / (sum(mk) or 1)))
        n += 1
    return (round(ia / n, 4), round(qu / n, 4), n) if n else (None, None, 0)


def consigli_per_campionato(consigli, dal=None):
    """{campionato: [n, vinti, attesi, varianza]} dei consigli principali verificati (bloccati prima del fischio)."""
    out = {}
    for v in (consigli or {}).values():
        es = (v.get("esiti") or {}).get("consiglio")
        t = (v.get("tips") or {}).get("consiglio") or {}
        if v.get("tardivo") or es is None or not t.get("p") or (dal and v.get("date", "") < dal):
            continue
        s = out.setdefault(v.get("lg", "?"), [0, 0, 0.0, 0.0])
        s[0] += 1
        s[1] += 1 if es else 0
        s[2] += t["p"]
        s[3] += t["p"] * (1 - t["p"])
    return out


def per_campionato(diario, consigli=None, dal=None):
    """Quadro per campionato (solo quelli con abbastanza partite o consigli) e il riferimento di tutti i campionati insieme."""
    fin = [v for v in finite(diario) if not dal or v.get("date", "") >= dal]
    per_lg = {}
    for v in fin:
        per_lg.setdefault(v.get("lg", "?"), []).append(v)
    cons = consigli_per_campionato(consigli, dal)
    out = {}
    for lg in sorted(set(per_lg) | set(cons)):
        vv = per_lg.get(lg, [])
        c = cons.get(lg, [0, 0, 0.0, 0.0])
        if len(vv) < MIN_PARTITE and c[0] < MIN_CONSIGLI:
            continue
        r = {"partite": len(vv)}
        if len(vv) >= MIN_PARTITE:
            r["scarto"], r["previsioni"] = scarto(vv)
            r["ia"], r["quote"], r["n_esito"] = errore_esito(vv)
        if c[0] >= MIN_CONSIGLI:
            r.update({"consigli": c[0], "vinti": c[1], "attesi": round(c[2], 1), "z": round((c[1] - c[2]) / math.sqrt(c[3]), 2) if c[3] > 0 else 0.0})
        out[lg] = r
    tot, prev = scarto(fin)
    return {"campionati": out, "tutti": {"partite": len(fin), "scarto": tot, "previsioni": prev}}


def _penalita(scarti, riferimento):
    """Fattore di affidabilita per campionato: 1 se lo scarto e nella norma, fino a FATTORE_MIN se e molto sopra la media."""
    out = {}
    for lg, s in scarti.items():
        oltre = s - riferimento - SOGLIA_SCARTO
        if oltre > 0:
            out[lg] = round(max(FATTORE_MIN, 1 - oltre / 20), 2)
    return out


def fattori_affidabilita(diario, quota_prova=0.4):
    """Fattori di affidabilita per campionato, provati su partite mai viste.
    1) Le partite finite si ordinano per data: le piu vecchie (1 - quota_prova) servono a calcolare i fattori.
    2) Sulle piu recenti (mai viste) si controlla che i campionati penalizzati siano davvero meno onesti degli altri:
       scarto nei penalizzati > scarto negli altri, con almeno MIN_PROVA partite penalizzate.
    3) Se la prova riesce, i fattori definitivi si calcolano su tutto e diventano attivi; altrimenti restano in ombra.
    Restituisce {"attivo": bool, "fattori": {...}, "ombra": {...}, "prova": {...}, "motivo": testo semplice}."""
    fin = sorted(finite(diario), key=lambda v: (v.get("ko") or v.get("date") or ""))
    if len(fin) < 4 * MIN_PARTITE:
        return {"attivo": False, "fattori": {}, "ombra": {}, "prova": {"partite": len(fin)}, "motivo": f"servono almeno {4 * MIN_PARTITE} partite finite (ora {len(fin)})"}
    taglio = int(len(fin) * (1 - quota_prova))
    vecchie, nuove = fin[:taglio], fin[taglio:]

    def scarti_di(voci):
        per = {}
        for v in voci:
            per.setdefault(v.get("lg", "?"), []).append(v)
        return {lg: scarto(vv)[0] for lg, vv in per.items() if len(vv) >= MIN_PARTITE}, scarto(voci)[0] or 0.0

    sc_old, rif_old = scarti_di(vecchie)
    pen = _penalita(sc_old, rif_old)
    pen_n = [v for v in nuove if v.get("lg") in pen]
    altre = [v for v in nuove if v.get("lg") not in pen]
    s_pen, s_alt = scarto(pen_n)[0], scarto(altre)[0]
    prova = {"partite": len(nuove), "penalizzati": sorted(pen), "partite_penalizzate": len(pen_n), "scarto_penalizzati": s_pen, "scarto_altri": s_alt}
    sc_all, rif_all = scarti_di(fin)
    definitivi = _penalita(sc_all, rif_all)
    if not pen:
        return {"attivo": False, "fattori": {}, "ombra": definitivi, "prova": prova, "motivo": "nessun campionato era meno onesto della media sulle partite più vecchie"}
    if len(pen_n) < MIN_PROVA or s_pen is None or s_alt is None:
        return {"attivo": False, "fattori": {}, "ombra": definitivi, "prova": prova,
                "motivo": f"servono almeno {MIN_PROVA} partite mai viste nei campionati penalizzati (ora {len(pen_n)})"}
    if s_pen <= s_alt:
        return {"attivo": False, "fattori": {}, "ombra": definitivi, "prova": prova,
                "motivo": "sulle partite mai viste i campionati penalizzati non erano meno onesti degli altri: la penalità resta in ombra"}
    return {"attivo": True, "fattori": definitivi, "ombra": {}, "prova": prova,
            "motivo": f"confermata su {len(nuove)} partite mai viste: scarto {s_pen} punti nei campionati penalizzati contro {s_alt} negli altri".replace(".", ",")}


def applica(score, lg, fattori):
    """Affidabilita mostrata (0-100) tenendo conto dell'onesta passata dell'IA nel campionato."""
    f = (fattori or {}).get(lg)
    return int(round(score * f)) if f and score is not None else score
