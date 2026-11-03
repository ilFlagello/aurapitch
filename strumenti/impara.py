"""AuraPitch - apprendimento iterativo dell'algoritmo (gira ogni mattina, prima del giro completo).

Che cosa fa, in ordine:
1) Archivio storico (football-data, ~39.000 partite con quote e risultati) + diario AuraPitch (ogni partita prevista
   dall'app, con probabilita IA, quote del mattino e di chiusura, risultato).
2) Per ogni mercato (1X2, Under/Over, Goal, Multigol, tempi, combo...) misura se le probabilita sono "oneste":
   quando diciamo 60% deve succedere circa 6 volte su 10. Se no, impara una correzione (ricalibrazione logistica,
   prudente: tirata verso "nessuna correzione"), piu una piccola correzione per campionato quando i dati bastano.
3) Peso IA contro bookmaker: sulle partite in cui l'IA ha corretto le quote (notizie, assenze...) cerca quanto
   conviene fidarsi della correzione, per famiglia di mercato.
4) Valore anticipato: le quote dei consigli IA scendono tra mattino e calcio d'inizio? (segnale precoce di bravura)
5) Versione in ombra: il nuovo modello si allena sul passato e viene provato su partite che non ha mai visto
   (le piu recenti). Prende il posto di quello attivo SOLO se e piu preciso; se sulle partite vere dell'app il
   modello attivo fa peggio di nessuna correzione, si torna indietro da soli.
Scrive data/modello.json (usato da genera_app.py, solo libreria standard) e app/data/ia.json (pagina dell'app).
Richiede numpy (solo qui, non nel giro dei dati).
"""
import csv
import glob
import gzip
import json
import math
import os
import sys
import warnings
from datetime import datetime, timedelta, timezone

import numpy as np

RADICE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RADICE)
import calibrazione as CB  # noqa: E402
import specialisti as SP  # noqa: E402
import mercati as M  # noqa: E402

MODELLO = os.path.join(RADICE, "data", "modello.json")
DIARIO = os.path.join(RADICE, "data", "diario")
PAGINA = os.path.join(RADICE, "app", "data", "ia.json")
STORICO = os.path.join(RADICE, "storico", "fd_partite.csv.gz")
STAGIONE = os.path.join(RADICE, "data", "fd")  # stagione in corso scaricata da raccoglitore.scarica_stagione_fd

G, T = M.MAXG + 1, M.MAXT + 1
PEN = 30.0        # quanto la correzione per mercato e tirata verso "nessuna correzione" (in partite equivalenti)
PEN_LG = 300.0    # correzione per campionato: molto piu prudente
MIN_LG = 1500     # partite di un campionato prima di concedergli una correzione propria
MARGINE_PROMO = 0.0005  # il candidato deve battere l'attivo di almeno lo 0,05% di log-loss medio
PESO_DIARIO = 3.0  # le partite vere dell'app contano piu dell'archivio (sono quelle che l'algoritmo vede oggi)
MIN_PESO_IA = 100  # partite corrette dall'IA prima di imparare il peso della correzione
MIN_DIARIO_CTRL = 300  # esiti del diario prima di poter bocciare il modello attivo
MIN_SEGNALE = 300  # partite con un valore prima che uno specialista possa pesare nell'integratore (prima resta in ombra)

GRUPPI, DERIVATI, famiglia, FAMIGLIE = CB.GRUPPI, CB.DERIVATI, CB.famiglia, CB.FAMIGLIE


# ---------- probabilita di tutti i mercati, in blocco (stesse formule di mercati.py) ----------

def _pois(l, n):
    k = np.arange(n)
    lf = np.array([math.lgamma(x + 1) for x in k])
    return np.exp(-l[:, None] + k[None, :] * np.log(np.maximum(l[:, None], 1e-12)) - lf[None, :])


def matrici(lh, la):
    m = _pois(lh, G)[:, :, None] * _pois(la, G)[:, None, :]
    r = M.RHO
    m[:, 0, 0] *= 1 - lh * la * r
    m[:, 0, 1] *= 1 + lh * r
    m[:, 1, 0] *= 1 + la * r
    m[:, 1, 1] *= 1 - r
    m[:, 0, :] *= 1 - M.DELTA
    m[:, :, 0] *= 1 - M.DELTA  # (lo 0-0 viene ridotto due volte, come in mercati.py)
    return m / m.sum(axis=(1, 2), keepdims=True)


def matrici_tempo(lh, la):
    m = _pois(lh, T)[:, :, None] * _pois(la, T)[:, None, :]
    r = M.RHO_T
    m[:, 0, 0] *= 1 - lh * la * r
    m[:, 0, 1] *= 1 + lh * r
    m[:, 1, 0] *= 1 + la * r
    m[:, 1, 1] *= 1 - r
    return m / m.sum(axis=(1, 2), keepdims=True)


_MASCHERE = None


def maschere():
    """Per ogni mercato: su quali risultati vince (finale 11x11; mercati dei tempi 8x8x8x8)."""
    global _MASCHERE
    if _MASCHERE is None:
        full = [c for c, _, _ in M.elenco_mercati("H", "A")]
        tempi = [c for c, _, _ in M.elenco_tempi("H", "A")]
        mf = np.array([[[1.0 if M.valuta(c, i, j) else 0.0 for j in range(G)] for i in range(G)] for c in full]).reshape(len(full), -1)
        mt = np.zeros((len(tempi), T, T, T, T))
        for n, c in enumerate(tempi):
            for i in range(T):
                for j in range(T):
                    for k in range(T):
                        for l in range(T):
                            mt[n, i, j, k, l] = 1.0 if M.valuta(c, i + k, j + l, i, j) else 0.0
        _MASCHERE = (full, mf, tempi, mt.reshape(len(tempi), -1))
    return _MASCHERE


def probabilita(lh, la, blocco=1500):
    """Matrice partite x mercati con le probabilita del motore (prima di ogni correzione)."""
    full, mf, tempi, mt = maschere()
    out = np.zeros((len(lh), len(full) + len(tempi)))
    for s in range(0, len(lh), blocco):
        a, b = lh[s:s + blocco], la[s:s + blocco]
        out[s:s + blocco, :len(full)] = matrici(a, b).reshape(len(a), -1) @ mf.T
        m1, m2 = matrici_tempo(a * M.F1, b * M.F1), matrici_tempo(a * (1 - M.F1), b * (1 - M.F1))
        J = (m1[:, :, :, None, None] * m2[:, None, None, :, :]).reshape(len(a), -1)
        out[s:s + blocco, len(full):] = J @ mt.T
    return full + tempi, np.clip(out, 1e-6, 1 - 1e-6)


_GRIGLIA = None


def gol_attesi(mk, mo):
    """Come mercati.gol_attesi ma per migliaia di partite insieme (griglia a passi di 0,02)."""
    global _GRIGLIA
    if _GRIGLIA is None:
        v = np.arange(0.06, 4.02, 0.02)
        lh, la = np.repeat(v, len(v)), np.tile(v, len(v))
        m = matrici(lh, la)
        i, j = np.indices((G, G))
        _GRIGLIA = (lh, la, (m * (i > j)).sum(axis=(1, 2)), (m * (i < j)).sum(axis=(1, 2)), (m * (i + j > 2.5)).sum(axis=(1, 2)))
    glh, gla, p1, p2, po = _GRIGLIA
    out = np.zeros((len(mk), 2))
    for s in range(0, len(mk), 400):
        k, o = mk[s:s + 400], mo[s:s + 400]
        e = (p1[None] - k[:, :1]) ** 2 + (p2[None] - k[:, 2:3]) ** 2
        e += np.where(np.isnan(o[:, None]), 0.002 * (glh + gla - 2.6)[None] ** 2, (po[None] - np.nan_to_num(o)[:, None]) ** 2)
        b = e.argmin(axis=1)
        out[s:s + 400] = np.stack([glh[b], gla[b]], 1)
    return out


def esiti(codici, g, g1):
    """1/0 per ogni partita e mercato; NaN quando non verificabile (es. manca il primo tempo)."""
    out = np.full((len(g), len(codici)), np.nan)
    for n, (a, b) in enumerate(zip(g, g1)):
        for k, c in enumerate(codici):
            try:
                v = M.valuta(c, int(a[0]), int(a[1]), *([int(b[0]), int(b[1])] if b is not None else [None, None]))
            except (ValueError, IndexError, TypeError):
                continue
            if v is not None:
                out[n, k] = 1.0 if v else 0.0
    return out


# ---------- archivio storico ----------

def togli_margine(q):
    inv = 1 / np.asarray(q, float)
    k = np.ones(len(inv))
    for _ in range(50):
        s = (inv ** k[:, None]).sum(1)
        ds = (np.log(inv) * inv ** k[:, None]).sum(1)
        k -= (s - 1) / ds
    p = inv ** k[:, None]
    return p / p.sum(1, keepdims=True)


def _f(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return float("nan")


def _primo(r, *chiavi):
    """Prima quota valida tra le colonne indicate (le stagioni vecchie usano BbAv, le nuove Avg)."""
    for k in chiavi:
        v = _f(r.get(k))
        if v == v and v > 1:
            return v
    return float("nan")


def carica_storico():
    righe = []
    if os.path.exists(STORICO):
        with gzip.open(STORICO, "rt", encoding="utf-8") as f:
            righe += list(csv.DictReader(f))
    visti = {(r["Div"], r["Date"], r["HomeTeam"]) for r in righe}
    for p in sorted(glob.glob(os.path.join(STAGIONE, "*.csv"))):  # stagione in corso, se scaricata
        try:
            with open(p, encoding="utf-8-sig") as f:
                for r in csv.DictReader(f):
                    if r.get("Div") and (r["Div"], r.get("Date"), r.get("HomeTeam")) not in visti and r.get("FTHG"):
                        righe.append(r)
        except (OSError, UnicodeDecodeError, csv.Error):
            pass
    ok = []
    for r in righe:
        q = [_primo(r, "Avg" + e, "BbAv" + e, "B365" + e, "AvgC" + e, "PSC" + e) for e in "HDA"]  # campionati "nuovi": solo quote di chiusura
        o = [_primo(r, "Avg" + e, "BbAv" + e, "B365" + e) for e in (">2.5", "<2.5")]
        g = [_f(r.get("FTHG")), _f(r.get("FTAG"))]
        if any(math.isnan(x) or x <= 1 for x in q) or any(math.isnan(x) for x in g):
            continue
        try:
            d = datetime.strptime(r["Date"], "%d/%m/%Y" if len(r["Date"]) > 8 else "%d/%m/%y").date()
        except ValueError:
            continue
        h1 = [_f(r.get("HTHG")), _f(r.get("HTAG"))]
        tiri = [_f(r.get("HST")), _f(r.get("AST"))]
        ok.append({"d": d.isoformat(), "lg": r["Div"], "q": q, "o": o if all(x > 1 for x in o) else None, "g": g, "g1": None if any(math.isnan(x) for x in h1) else h1,
                   "h": r.get("HomeTeam"), "a": r.get("AwayTeam"), "tp": None if any(math.isnan(x) for x in tiri) else tiri})
    ok.sort(key=lambda x: x["d"])
    return ok


def prepara_storico(righe):
    mk = togli_margine([r["q"] for r in righe])
    mo = np.array([togli_margine([r["o"]])[0, 0] if r["o"] else np.nan for r in righe])
    lam = gol_attesi(mk, mo)
    codici, P = probabilita(lam[:, 0], lam[:, 1])
    Y = esiti(codici, [r["g"] for r in righe], [r["g1"] for r in righe])
    return codici, P.astype(np.float32), Y.astype(np.float32)  # meta memoria: l'archivio ora ha ~80.000 partite


# ---------- laboratorio: segnali nuovi provati ogni giorno, in ombra, su partite mai viste ----------
GOL_PER_TIRO = 0.31  # gol per tiro in porta nel calcio europeo: serve a dire se una squadra segna "piu del dovuto"
MIN_LAB = 2000


def segnali_lab(R):
    """Per ogni partita dell'archivio (in ordine di data), con i soli dati disponibili PRIMA del calcio d'inizio:
    riposo = differenza di giorni di riposo (casa - trasferta, tetto 7 giorni);
    fortuna = differenza tra gol segnati e gol "meritati" dai tiri in porta nelle ultime 5 partite (casa - trasferta);
    fortuna_somma = la stessa misura sommata per le due squadre (per Over/Under)."""
    ultima, storia = {}, {}
    X = np.full((len(R), 3), np.nan)
    for i, r in enumerate(R):
        h, a = (r.get("lg"), r.get("h")), (r.get("lg"), r.get("a"))
        if not r.get("h") or not r.get("a"):
            continue
        d = datetime.fromisoformat(r["d"]).date()
        rh = min(7, (d - ultima[h]).days) if h in ultima else None
        ra = min(7, (d - ultima[a]).days) if a in ultima else None
        if rh is not None and ra is not None and rh > 0 and ra > 0:
            X[i, 0] = (rh - ra) / 7
        sh, sa = storia.get(h, []), storia.get(a, [])
        if len(sh) >= 3 and len(sa) >= 3:
            fh, fa = float(np.mean(sh[-5:])), float(np.mean(sa[-5:]))
            X[i, 1], X[i, 2] = fh - fa, fh + fa
        ultima[h] = ultima[a] = d
        if r.get("tp"):
            storia.setdefault(h, []).append(r["g"][0] - GOL_PER_TIRO * r["tp"][0])
            storia.setdefault(a, []).append(r["g"][1] - GOL_PER_TIRO * r["tp"][1])
    return X


def _adatta(L, Y, x, passi=300, lr=0.5, l2=0.01):
    """Piccola correzione lineare sui logit delle quote: logit' = logit + b*x (b imparato, con freno l2)."""
    b = np.zeros(L.shape[1])
    for _ in range(passi):
        Z = L + np.outer(x, b)
        Z = Z - Z.max(axis=1, keepdims=True)
        P = np.exp(Z) / np.exp(Z).sum(axis=1, keepdims=True)
        g = ((P - Y) * x[:, None]).mean(axis=0) + l2 * b
        b -= lr * g
    return b


def _ll_multi(L, Y, b, x):
    Z = L + np.outer(x, b)
    Z = Z - Z.max(axis=1, keepdims=True)
    P = np.exp(Z) / np.exp(Z).sum(axis=1, keepdims=True)
    return float(-np.mean(np.log(np.clip((P * Y).sum(axis=1), 1e-9, 1))))


def laboratorio(R, codici, P, Y):
    """Prova ogni segnale sull'80% piu vecchio e lo misura sul 20% piu recente: guadagno = errore in meno rispetto alle sole quote.
    Un segnale e "utile" solo se migliora di almeno MARGINE_PROMO; altrimenti resta in prova (il mercato lo sa gia)."""
    X = segnali_lab(R)
    idx = {c: k for k, c in enumerate(codici)}
    D = np.array([r["d"] for r in R])
    prove = [("riposo", "Giorni di riposo", 0, ("1", "X", "2")), ("fortuna", "Fortuna recente (gol contro tiri in porta)", 1, ("1", "X", "2")),
             ("fortuna_gol", "Fortuna recente su Over/Under", 2, ("O2.5", "U2.5"))]
    out = []
    for k, nome, col, esiti in prove:
        if any(e not in idx for e in esiti):
            continue
        cols = [idx[e] for e in esiti]
        ok = ~np.isnan(X[:, col]) & ~np.isnan(Y[:, cols]).any(axis=1)
        if ok.sum() < MIN_LAB:
            out.append({"k": k, "nome": nome, "partite": int(ok.sum()), "stato": "dati insufficienti"})
            continue
        Pk, Yk, xk, Dk = P[ok][:, cols], Y[ok][:, cols], X[ok, col], D[ok]
        Pk = Pk / Pk.sum(axis=1, keepdims=True)
        L = np.log(np.clip(Pk, 1e-6, 1))
        cut = np.sort(Dk)[int(len(Dk) * 0.8)]
        tr, te = Dk < cut, Dk >= cut
        b = _adatta(L[tr], Yk[tr], xk[tr])
        base, nuovo = _ll_multi(L[te], Yk[te], np.zeros_like(b), xk[te]), _ll_multi(L[te], Yk[te], b, xk[te])
        g = (base - nuovo) / base
        out.append({"k": k, "nome": nome, "partite": int(ok.sum()), "verifica": int(te.sum()), "guadagno": round(100 * g, 3),
                    "pesi": {e: round(float(v), 3) for e, v in zip(esiti, b)},
                    "stato": "utile" if g >= MARGINE_PROMO else "in prova"})
        print(f"  laboratorio {k}: {100 * g:+.3f}% su {int(te.sum())} partite mai viste")
    return out


# ---------- integratore degli specialisti (specialisti.py): ogni mattina impara quanto pesa ciascuno ----------
MIN_GRUPPO = 3000


def segnali_archivio(R):
    """Valori degli specialisti per ogni partita dell'archivio, con le sole partite giocate prima (stesso codice dell'app)."""
    storia, coppie, mot = {}, {}, SP.Motore()
    X = np.full((len(R), len(SP.NOMI)), np.nan, dtype=np.float32)
    for i, r in enumerate(R):
        if not r.get("h") or not r.get("a"):
            continue
        t = datetime.fromisoformat(r["d"]).date()
        kh, ka = (r["lg"], r["h"]), (r["lg"], r["a"])
        ph, pa = SP.piega(r["h"]), SP.piega(r["a"])
        dir_ = [{"t": t1, "gf": x, "gs": y} for t1, x, y in coppie.get((ph, pa), [])] + [{"t": t1, "gf": y, "gs": x} for t1, x, y in coppie.get((pa, ph), [])]
        v = SP.segnali(storia.get(kh, []), storia.get(ka, []), t, sorted(dir_, key=lambda z: z["t"]), mot.caratteristiche(r["h"], r["a"], r["lg"], t))
        tp = r.get("tp") or [None, None]
        mot.aggiorna(r["h"], r["a"], r["lg"], r["g"][0], r["g"][1], tp[0], tp[1], t)
        coppie.setdefault((ph, pa), []).append((t, r["g"][0], r["g"][1]))
        X[i] = [np.nan if x is None else x for x in v]
        storia.setdefault(kh, []).append({"t": t, "casa": True, "gf": r["g"][0], "gs": r["g"][1]})
        storia.setdefault(ka, []).append({"t": t, "casa": False, "gf": r["g"][1], "gs": r["g"][0]})
        if len(storia[kh]) > 20:
            del storia[kh][:-20]
        if len(storia[ka]) > 20:
            del storia[ka][:-20]
    return X


def _fit_multi(L, Y, Z, passi=400, lr=0.5, l2=0.02):
    """logit' = logit + Z @ B (B: specialisti x esiti), con freno l2. Restituisce B."""
    B = np.zeros((Z.shape[1], L.shape[1]))
    for _ in range(passi):
        E = L + Z @ B
        E = E - E.max(axis=1, keepdims=True)
        Q = np.exp(E) / np.exp(E).sum(axis=1, keepdims=True)
        B -= lr * (Z.T @ (Q - Y) / len(Z) + l2 * B)
    return B


def _ll_multi_B(L, Y, Z, B):
    E = L + Z @ B
    E = E - E.max(axis=1, keepdims=True)
    Q = np.exp(E) / np.exp(E).sum(axis=1, keepdims=True)
    return float(-np.mean(np.log(np.clip((Q * Y).sum(axis=1), 1e-9, 1))))


def integratore(R, codici, P, Y, diario=None):
    """Per gruppo di campionati: allenamento sull'80% piu vecchio, prova sul 20% piu recente. Si accende solo se l'insieme degli
    specialisti riduce l'errore di almeno MARGINE_PROMO; il contributo di ognuno = errore in piu quando lo si toglie."""
    X = segnali_archivio(R)
    idx = {c: k for k, c in enumerate(codici)}
    D = np.array([r["d"] for r in R])
    G = np.array([SP.gruppo(r["lg"]) for r in R])
    # partite vere dell'app (diario): cio che gli specialisti dicevano prima del fischio, con il risultato. Pesano come l'archivio
    # ma sono le piu recenti, quindi finiscono nella prova finale: l'integratore viene giudicato anche sulle partite dell'app.
    if diario:
        # i diari scritti prima di uno specialista nuovo hanno meno valori: quelli mancanti valgono "nessun dato"
        dd = [dict(v, sp=list(v["sp"]) + [None] * (len(SP.NOMI) - len(v["sp"]))) for v in diario
              if v.get("sp") and len(v["sp"]) <= len(SP.NOMI) and v.get("g") and v.get("mk")]
        if dd:
            _, Pd = probabilita(np.array([v["xm"][0] for v in dd]), np.array([v["xm"][1] for v in dd]))
            Yd = esiti(codici, [v["g"] for v in dd], [v.get("g1") for v in dd])
            X = np.vstack([X, np.array([[np.nan if x is None else x for x in v["sp"]] for v in dd], dtype=np.float32)])
            P, Y = np.vstack([P, Pd.astype(np.float32)]), np.vstack([Y, Yd.astype(np.float32)])
            D, G = np.concatenate([D, [v["date"] for v in dd]]), np.concatenate([G, [SP.gruppo(v["lg"]) for v in dd]])
            print(f"  integratore: {len(dd)} partite vere dell'app con gli specialisti")
    c3, co = [idx["1"], idx["X"], idx["2"]], [idx["O2.5"], idx["U2.5"]]
    modello, rapporto = {"specialisti": SP.NOMI, "gruppi": {}}, {}
    for gr in ("principali", "altri"):
        ok = (G == gr) & ~np.isnan(Y[:, c3]).any(axis=1) & ~np.isnan(X).all(axis=1)
        if ok.sum() < MIN_GRUPPO:
            rapporto[gr] = {"partite": int(ok.sum()), "stato": "dati insufficienti"}
            continue
        Xg = X[ok]
        # specialisti in ombra: con meno di MIN_SEGNALE partite con un valore non possono ancora pesare (es. consenso della community)
        ombra = [i for i in range(Xg.shape[1]) if int(np.sum(~np.isnan(Xg[:, i]))) < MIN_SEGNALE]
        with warnings.catch_warnings():  # colonne senza nessun valore: media "vuota", gestita qui sotto
            warnings.simplefilter("ignore", category=RuntimeWarning)
            mu, sd = np.nanmean(Xg, axis=0), np.nanstd(Xg, axis=0) + 1e-6
        mu, sd = np.where(np.isnan(mu), 0.0, mu), np.where(np.isnan(sd), 1.0, sd)
        Z = np.nan_to_num((Xg - mu) / sd)
        Z[:, ombra] = 0
        P3 = P[ok][:, c3].astype(np.float64)
        L = np.log(np.clip(P3 / P3.sum(axis=1, keepdims=True), 1e-6, 1))
        Y3 = Y[ok][:, c3].astype(np.float64)
        Dg = D[ok]
        cut = np.sort(Dg)[int(len(Dg) * 0.8)]
        tr, te = Dg < cut, Dg >= cut
        # scelta degli specialisti utili su una validazione interna (l'ultimo 25% dell'allenamento): via chi peggiora
        cut2 = np.sort(Dg[tr])[int(tr.sum() * 0.75)]
        fi, va = tr & (Dg < cut2), tr & (Dg >= cut2)
        usa = [i for i in range(Z.shape[1]) if i not in ombra]

        def val(cols):
            Zc = np.zeros_like(Z)
            Zc[:, cols] = Z[:, cols]
            return _ll_multi_B(L[va], Y3[va], Zc[va], _fit_multi(L[fi], Y3[fi], Zc[fi], passi=250)), Zc
        migliore, _ = val(usa)
        cambiato = True
        while cambiato and usa:
            cambiato = False
            prove = [(val([c for c in usa if c != i])[0], i) for i in usa]
            v, i = min(prove)
            if v < migliore:
                migliore, cambiato = v, True
                usa.remove(i)
        Zou = Z  # Over/Under: tutti gli specialisti (la scelta qui sopra vale per l'esito 1X2)
        Z = val(usa)[1]  # gli specialisti esclusi restano a zero (peso nullo)
        scelti = [SP.NOMI[i] for i in usa]
        B = _fit_multi(L[tr], Y3[tr], Z[tr])
        base = _ll_multi_B(L[te], Y3[te], Z[te], np.zeros_like(B))
        nuovo = _ll_multi_B(L[te], Y3[te], Z[te], B)
        guad = (base - nuovo) / base
        contributi = {}
        for i, n in enumerate(SP.NOMI):
            if n not in scelti:
                contributi[n] = "in ombra" if i in ombra else None
                continue
            Zs = Z.copy()
            Zs[:, i] = 0
            Bi = _fit_multi(L[tr], Y3[tr], Zs[tr])
            contributi[n] = round(100 * (_ll_multi_B(L[te], Y3[te], Zs[te], Bi) - nuovo) / base, 4)
        # Over/Under 2,5 (solo dove c'e la quota)
        po = P[ok][:, co[0]].astype(np.float64)
        yo = Y[ok][:, co[0]].astype(np.float64)
        oko = ~np.isnan(yo)
        b_ou, guad_ou = None, None
        if oko.sum() > MIN_GRUPPO:
            lo = np.log(np.clip(po, 1e-6, 1 - 1e-6) / np.clip(1 - po, 1e-6, 1))
            L2 = np.stack([lo, np.zeros_like(lo)], 1)
            Y2 = np.stack([yo, 1 - yo], 1)
            Bo = _fit_multi(L2[tr & oko], Y2[tr & oko], Zou[tr & oko])
            b0 = _ll_multi_B(L2[te & oko], Y2[te & oko], Zou[te & oko], np.zeros_like(Bo))
            b1 = _ll_multi_B(L2[te & oko], Y2[te & oko], Zou[te & oko], Bo)
            guad_ou = (b0 - b1) / b0
            b_ou = (Bo[:, 0] - Bo[:, 1]) if guad_ou >= MARGINE_PROMO else None
        attivo = guad >= MARGINE_PROMO
        Bf = _fit_multi(L, Y3, Z) if attivo else B  # modello definitivo su tutte le partite del gruppo
        modello["gruppi"][gr] = {"attivo": bool(attivo or b_ou is not None), "mu": [round(float(v), 5) for v in mu], "sd": [round(float(v), 5) for v in sd],
                                 "B": [[round(float(x), 5) for x in row] for row in (Bf if attivo else np.zeros_like(B))],
                                 "b_ou": [round(float(v), 5) for v in b_ou] if b_ou is not None else None}
        rapporto[gr] = {"partite": int(ok.sum()), "verifica": int(te.sum()), "guadagno_1x2": round(100 * guad, 4),
                        "guadagno_ou": None if guad_ou is None else round(100 * guad_ou, 4), "attivo": bool(attivo), "contributi": contributi, "scelti_1x2": scelti,
                        "in_ombra": {SP.NOMI[i]: int(np.sum(~np.isnan(Xg[:, i]))) for i in ombra}}
        print(f"  integratore {gr}: 1X2 {100 * guad:+.3f}%, O/U {'-' if guad_ou is None else f'{100 * guad_ou:+.3f}%'} su {int(te.sum())} partite mai viste; contributi {contributi}")
    return modello, rapporto


# ---------- diario dell'app ----------

def carica_diario():
    out = []
    for p in sorted(glob.glob(os.path.join(DIARIO, "*.json"))):
        try:
            with open(p, encoding="utf-8") as f:
                out += [dict(v, id=k) for k, v in json.load(f).items()]
        except (OSError, ValueError):
            pass
    return out


# ---------- ricalibrazione ----------

def logit(p):
    p = np.clip(p, 1e-6, 1 - 1e-6)
    return np.log(p / (1 - p))


def sig(x):
    return 1 / (1 + np.exp(-x))


def adatta(x, y, w, pen=PEN, it=12):
    """Ricalibrazione logistica a 2 parametri (a + b*logit p), tirata verso a=0, b=1 da una penalita."""
    a, b = 0.0, 1.0
    for _ in range(it):
        p = sig(a + b * x)
        r = w * (y - p)
        ga, gb = r.sum() - pen * a, (r * x).sum() - pen * (b - 1)
        h = w * p * (1 - p)
        haa, hab, hbb = h.sum() + pen, (h * x).sum(), (h * x * x).sum() + pen
        det = haa * hbb - hab * hab
        if det <= 0:
            break
        da, db = (hbb * ga - hab * gb) / det, (haa * gb - hab * ga) / det
        a, b = a + da, b + db
        if abs(da) + abs(db) < 1e-7:
            break
    return float(np.clip(a, -1.5, 1.5)), float(np.clip(b, 0.5, 1.5))


def adatta_offset(x, y, w, pen=PEN_LG, it=8):
    d = 0.0
    for _ in range(it):
        p = sig(x + d)
        g = (w * (y - p)).sum() - pen * d
        h = (w * p * (1 - p)).sum() + pen
        d += g / h
    return float(np.clip(d, -0.6, 0.6))


def allena(codici, P, Y, W, LG, pen=PEN, pen_lg=PEN_LG, per_lega=True):
    """Modello: per ogni mercato (a, b) e, per i campionati con abbastanza partite, uno spostamento proprio."""
    cal, cal_lg = {}, {}
    leghe = [l for l in set(LG.tolist()) if (LG == l).sum() >= MIN_LG] if per_lega else []
    for k, c in enumerate(codici):
        ok = ~np.isnan(Y[:, k])
        if ok.sum() < 500 or c in DERIVATI:
            continue
        x, y, w = logit(P[ok, k]), Y[ok, k], W[ok]
        a, b = adatta(x, y, w, pen)
        if abs(a) > 0.003 or abs(b - 1) > 0.003:
            cal[c] = [round(a, 4), round(b, 4)]
        base = a + b * x
        for l in leghe:
            s = LG[ok] == l
            if s.sum() >= MIN_LG:
                d = adatta_offset(base[s], y[s], w[s], pen_lg)
                if abs(d) >= 0.01:
                    cal_lg.setdefault(l, {})[c] = round(d, 3)
    return {"cal": cal, "cal_lg": cal_lg}


def applica(modello, codici, P, LG, PM=None):
    """Stessa logica di calibrazione.calibra_p (che lavora su una partita alla volta, senza numpy).
    PM: probabilita lette dalle sole quote (per il peso della correzione IA)."""
    cal, cl, peso = modello.get("cal", {}), modello.get("cal_lg", {}), modello.get("peso_ia", {})
    idx = {c: k for k, c in enumerate(codici)}
    Q = logit(P)
    if PM is not None:
        for c, k in idx.items():
            if famiglia(c) in peso:
                w = peso[famiglia(c)]
                Q[:, k] = (1 - w) * logit(PM[:, k]) + w * Q[:, k]
    for c, (a, b) in cal.items():
        if c in idx:
            Q[:, idx[c]] = a + b * Q[:, idx[c]]
    LGa = np.asarray(LG)
    for l, d in cl.items():
        s = LGa == l
        for c, v in d.items():
            if c in idx:
                Q[s, idx[c]] += v
    Q = sig(Q)
    for gr in GRUPPI:
        ii = [idx[c] for c in gr if c in idx]
        if len(ii) == len(gr):
            Q[:, ii] /= Q[:, ii].sum(1, keepdims=True)
    for c, (x, y) in DERIVATI.items():
        if c in idx and x in idx and y in idx:
            Q[:, idx[c]] = Q[:, idx[x]] + Q[:, idx[y]]
    return np.clip(Q, 1e-6, 1 - 1e-6)


def logloss(P, Y, W=None):
    """Log-loss medio per mercato (NaN = esito non verificabile, escluso)."""
    ok = ~np.isnan(Y)
    Yz = np.nan_to_num(Y)
    L = -(Yz * np.log(P) + (1 - Yz) * np.log(1 - P))
    L[~ok] = 0
    w = np.ones(len(P)) if W is None else W
    return (L * w[:, None]).sum(0) / np.maximum((ok * w[:, None]).sum(0), 1e-9), ok.sum(0)


def punteggio(P, Y, W=None):
    """Un numero solo: log-loss medio di tutti i mercati (ogni mercato pesa uguale)."""
    l, n = logloss(P, Y, W)
    return float(l[n > 0].mean())


def affidabilita(P, Y, bins=10):
    """Tabella di affidabilita: in ogni fascia di probabilita, quanto avevamo detto e quanto e successo."""
    ok = ~np.isnan(Y)
    p, y = P[ok], Y[ok]
    out = []
    for i in range(bins):
        s = (p >= i / bins) & (p < (i + 1) / bins)
        if s.sum() >= 30:
            out.append([round(float(p[s].mean()), 3), round(float(y[s].mean()), 3), int(s.sum())])
    return out


# ---------- versione in ombra, peso IA, valore anticipato, pagina dell'app ----------

RICETTE = {
    "nessuna": None,
    "mercato": {"pen": PEN, "per_lega": False},
    "mercato+campionato": {"pen": PEN, "pen_lg": PEN_LG, "per_lega": True},
    "prudente": {"pen": 300.0, "pen_lg": 1500.0, "per_lega": True},
}
NOMI = {"nessuna": "Motore senza correzioni", "mercato": "Correzione per mercato", "mercato+campionato": "Correzione per mercato e campionato",
        "prudente": "Correzione prudente"}
CHIAVI_DIARIO = ("1", "X", "2", "O2.5", "GG")  # probabilita mostrate nell'app, salvate nel diario prima del calcio d'inizio
MIN_CTRL = 150  # partite del diario con probabilita corrette prima di poter bocciare la correzione attiva
PAUSA_RICETTA = 14  # giorni in cui una ricetta bocciata non puo tornare


def ll_vettore(p, y):
    p = np.clip(p, 1e-6, 1 - 1e-6)
    return -(y * np.log(p) + (1 - y) * np.log(1 - p))


def peso_ia(codici, PI, PM, Y):
    """Per famiglia: quanto conviene fidarsi della correzione IA (0 = solo quote, 1 = come oggi, 1,5 = di piu)."""
    out = {}
    if len(PI) == 0:
        return out
    for f in FAMIGLIE:
        ks = [k for k, c in enumerate(codici) if famiglia(c) == f and c not in DERIVATI]
        if not ks:
            continue
        x_i, x_m, y = logit(PI[:, ks]), logit(PM[:, ks]), Y[:, ks]
        ok = ~np.isnan(y)
        prove = {}
        for w in np.arange(0, 1.51, 0.05):
            q = sig((1 - w) * x_m + w * x_i)
            prove[round(float(w), 2)] = float(ll_vettore(q[ok], y[ok]).mean())
        best = min(prove, key=prove.get)
        n = len(PI)
        quota = 0.0 if n < MIN_PESO_IA else min(1.0, 0.5 + (n - MIN_PESO_IA) / (2 * (300 - MIN_PESO_IA)))
        out[f] = {"n": n, "migliore": best, "peso": round(1 + (best - 1) * quota, 2), "attivo": n >= MIN_PESO_IA,
                  "errore_1": round(prove[1.0], 4), "errore_migliore": round(prove[best], 4)}
    return out


def valore_anticipato(diario, codici):
    """Valore anticipato: tra il mattino e il calcio d'inizio le quote si spostano verso i consigli dell'IA?
    Per ogni consiglio: probabilita secondo le sole quote del mattino e secondo quelle di chiusura (dai gol attesi del
    mercato, cosi vale per tutti i mercati e non solo per 1X2 e Under/Over). Positivo = il mercato ci ha dato ragione."""
    idx = {c: k for k, c in enumerate(codici)}
    righe = [r for r in diario if r.get("xm0") and r.get("xm") and r.get("tips0") and r.get("st") in ("FT", "LIVE")]
    v = []
    if righe:
        _, P0 = probabilita(np.array([r["xm0"][0] for r in righe]), np.array([r["xm0"][1] for r in righe]))
        _, P1 = probabilita(np.array([r["xm"][0] for r in righe]), np.array([r["xm"][1] for r in righe]))
        for n, r in enumerate(righe):
            if r["xm0"] == r["xm"]:
                continue  # quote mai cambiate: nessuna informazione
            for k in ("consiglio", "prudente", "coraggiosa"):
                t = r["tips0"].get(k)
                if t and t[0] in idx:
                    v.append(P1[n, idx[t[0]]] / P0[n, idx[t[0]]] - 1)
    # direzione: quando l'IA si discosta dalle quote del mattino sull'1X2, le quote poi si muovono verso l'IA?
    dir_ok = dir_n = 0
    for r in diario:
        pc0 = r.get("pc0") or {}
        if not (r.get("mk0") and r.get("mk") and pc0 and r.get("st") in ("FT", "LIVE")):
            continue
        for i, c in enumerate(("1", "X", "2")):
            dev = pc0.get(c, r["mk0"][i]) - r["mk0"][i]
            mov = r["mk"][i] - r["mk0"][i]
            if abs(dev) >= 0.02 and abs(mov) >= 0.005:
                dir_n += 1
                dir_ok += (dev > 0) == (mov > 0)
    return {"n": len(v), "medio": round(100 * float(np.mean(v)), 2) if v else None, "positivi": round(100 * float(np.mean(np.array(v) > 0)), 1) if v else None,
            "direzione": {"n": dir_n, "ok": round(100 * dir_ok / dir_n, 1) if dir_n else None}}


def confronto_bookmaker(diario):
    """Sulle partite vere dell'app: errore delle probabilita IA mostrate contro quello delle quote (senza margine)."""
    a = {"1X2": [[], []], "O2.5": [[], []]}
    for r in diario:
        g, pc = r.get("g"), r.get("pc") or {}
        if r.get("st") != "FT" or not g or not r.get("mk"):
            continue
        e = 0 if g[0] > g[1] else 1 if g[0] == g[1] else 2
        if all(c in pc for c in ("1", "X", "2")):
            a["1X2"][0].append(-math.log(max(1e-9, pc[("1", "X", "2")[e]])))
            a["1X2"][1].append(-math.log(max(1e-9, r["mk"][e])))
        if "O2.5" in pc and r.get("mo") is not None:
            y = 1 if g[0] + g[1] > 2.5 else 0
            a["O2.5"][0].append(-math.log(max(1e-9, pc["O2.5"] if y else 1 - pc["O2.5"])))
            a["O2.5"][1].append(-math.log(max(1e-9, r["mo"] if y else 1 - r["mo"])))
    return {k: {"n": len(v[0]), "ia": round(float(np.mean(v[0])), 4) if v[0] else None, "quote": round(float(np.mean(v[1])), 4) if v[1] else None} for k, v in a.items()}


def rendimento_consigli():
    """Se avessi giocato 1 euro su ogni consiglio (bloccato prima del fischio) da quando esiste il registro: quanto avresti oggi.
    Per i tre profili, con l'andamento giorno per giorno del consiglio principale. Quote: quelle mostrate nell'app al momento del blocco."""
    try:
        with open(os.path.join(RADICE, "data", "consigli.json"), encoding="utf-8") as f:
            st = json.load(f)
    except (OSError, ValueError):
        return {}
    out, giorni = {}, {}
    for k in ("consiglio", "prudente", "coraggiosa"):
        n = vinti = 0
        prof = 0.0
        for v in sorted(st.values(), key=lambda v: v["date"]):
            es = (v.get("esiti") or {}).get(k)
            t = (v.get("tips") or {}).get(k)
            if es is None or not t or not t.get("q"):
                continue
            n += 1
            vinti += 1 if es else 0
            g = (t["q"] - 1) if es else -1.0
            prof += g
            if k == "consiglio":
                giorni[v["date"]] = giorni.get(v["date"], 0.0) + g
        if n:
            out[k] = {"n": n, "vinti": vinti, "profitto": round(prof, 2), "roi": round(100 * prof / n, 1)}
    cum, serie = 0.0, []
    for d in sorted(giorni):
        cum += giorni[d]
        serie.append([d, round(cum, 2)])
    out["serie"] = serie[-60:]
    return out


def andamento_consigli(tutte=False):
    """Consigli IA settimana per settimana (dal registro dei consigli): vinti contro attesi."""
    try:
        with open(os.path.join(RADICE, "data", "consigli.json"), encoding="utf-8") as f:
            st = json.load(f)
    except (OSError, ValueError):
        return []
    sett = {}
    for v in st.values():
        es = (v.get("esiti") or {}).get("consiglio")
        if es is None:
            continue
        d = datetime.strptime(v["date"], "%Y-%m-%d").date()
        k = f"{d.isocalendar()[0]}-{d.isocalendar()[1]:02d}"
        s = sett.setdefault(k, {"sett": k, "dal": v["date"], "n": 0, "vinti": 0, "attesi": 0.0})
        s["dal"] = min(s["dal"], v["date"])
        s["n"] += 1
        s["vinti"] += 1 if es else 0
        s["attesi"] += v["tips"]["consiglio"]["p"]
    out = sorted(sett.values(), key=lambda s: s["sett"])
    out = out if tutte else out[-10:]
    for s in out:
        s["attesi"] = round(s["attesi"], 1)
    return out


def riepilogo_semplice(fin, Yd, codici):
    """Numeri che chiunque capisce, solo dalle previsioni vere dell'app (salvate prima del calcio d'inizio):
    quante volte l'esito piu probabile e uscito (IA e quote a confronto) e, per fasce di sicurezza,
    quante volte e successo cio che l'IA dava per probabile."""
    idx = {c: k for k, c in enumerate(codici)}
    fav = {"n": 0, "ia": 0, "quote": 0}
    fasce = {f: [0, 0] for f in ("50-60", "60-70", "70-80", "80-100")}
    for k, v in enumerate(fin):
        pc = v.get("pc0") or v.get("pc") or {}
        y = [Yd[k, idx[c]] if c in idx else np.nan for c in ("1", "X", "2")]
        if all(c in pc for c in ("1", "X", "2")) and not any(np.isnan(y)):
            fav["n"] += 1
            fav["ia"] += int(y[int(np.argmax([pc["1"], pc["X"], pc["2"]]))] == 1)
            mk = v.get("mk0") or v.get("mk")
            if mk and len(mk) == 3:
                fav["quote"] += int(y[int(np.argmax(mk))] == 1)
        for c in CHIAVI_DIARIO:
            if c not in pc or c not in idx or np.isnan(Yd[k, idx[c]]):
                continue
            p, esce = float(pc[c]), Yd[k, idx[c]] == 1
            if p < 0.5:  # "30% che succeda" = "70% che non succeda"
                p, esce = 1 - p, not esce
            f = "50-60" if p < 0.6 else "60-70" if p < 0.7 else "70-80" if p < 0.8 else "80-100"
            fasce[f][0] += 1
            fasce[f][1] += int(esce)
    out = {"partite": len(fin), "favorito": fav,
           "fasce": [{"fascia": f, "n": n, "successo": round(100 * ok / n, 1) if n else None} for f, (n, ok) in fasce.items()]}
    cons = andamento_consigli(tutte=True)
    if cons:
        out["consigli"] = {"n": sum(x["n"] for x in cons), "vinti": sum(x["vinti"] for x in cons), "attesi": round(sum(x["attesi"] for x in cons), 1)}
    return out


def affidabilita_gruppi(codici, P, Y):
    idx = {c: k for k, c in enumerate(codici)}
    out = {}
    for nome, cc in (("Esito finale (1, X, 2)", ("1", "X", "2")), ("Over 2,5", ("O2.5",)), ("Goal", ("GG",))):
        ks = [idx[c] for c in cc]
        out[nome] = affidabilita(P[:, ks].reshape(-1, 1), Y[:, ks].reshape(-1, 1))
    return out


def main():
    oggi = datetime.now(timezone.utc).date().isoformat()
    try:
        with open(MODELLO, encoding="utf-8") as f:
            vecchio = json.load(f)
    except (OSError, ValueError):
        vecchio = {}
    att0 = vecchio.get("attivo") or {"ricetta": "nessuna", "dal": oggi}
    cron = vecchio.get("cronologia") or []
    pause = {k: v for k, v in (vecchio.get("pause") or {}).items() if v > oggi}

    R = carica_storico()
    codici, Ph, Yh = prepara_storico(R)
    LGh, Dh = np.array([r["lg"] for r in R]), np.array([r["d"] for r in R])
    diario = carica_diario()
    fin = [v for v in diario if v.get("st") == "FT" and v.get("g") and v.get("xg") and v.get("xm")]
    if fin:
        _, Pd = probabilita(np.array([v["xg"][0] for v in fin]), np.array([v["xg"][1] for v in fin]))
        _, Pm = probabilita(np.array([v["xm"][0] for v in fin]), np.array([v["xm"][1] for v in fin]))
        Yd = esiti(codici, [v["g"] for v in fin], [v.get("g1") for v in fin])
    else:
        Pd = Pm = Yd = np.zeros((0, len(codici)))
    P, Y = np.vstack([Ph, Pd.astype(np.float32)]), np.vstack([Yh, Yd.astype(np.float32)])
    W = np.concatenate([np.ones(len(Ph)), np.full(len(Pd), PESO_DIARIO)])
    LG = np.concatenate([LGh, np.array([v["lg"] for v in fin], dtype=LGh.dtype if len(LGh) else object)])
    D = np.concatenate([Dh, np.array([v["date"] for v in fin], dtype=Dh.dtype if len(Dh) else object)])
    print(f"Archivio: {len(Ph)} partite; diario: {len(diario)} previste, {len(fin)} finite")

    # 1) versione in ombra: ogni ricetta si allena sull'80% piu vecchio e si prova sul 20% piu recente (mai visto)
    cut = np.sort(D)[int(len(D) * 0.8)]
    tr, te = D < cut, D >= cut
    prove, per_codice, Qs = {}, {}, {}
    for k, r in RICETTE.items():
        mod = {} if r is None else allena(codici, P[tr], Y[tr], W[tr], LG[tr], **r)
        Q = applica(mod, codici, P[te], LG[te])
        Qs[k] = Q
        prove[k] = punteggio(Q, Y[te], W[te])
        per_codice[k] = logloss(Q, Y[te], W[te])[0]
        print(f"  {k}: {prove[k]:.5f}")
    r0 = att0.get("ricetta", "nessuna")
    if r0 not in RICETTE:
        r0 = "nessuna"
    cand = min((k for k in RICETTE if k not in pause), key=prove.get)
    scelta, motivo = r0, "confermata: nessuna alternativa è abbastanza migliore"
    if cand != r0 and (prove[r0] - prove[cand]) / prove[r0] >= MARGINE_PROMO:
        guad = str(round(100 * (prove[r0] - prove[cand]) / prove[r0], 3)).replace(".", ",")
        scelta, motivo = cand, f"promossa: errore più basso del {guad}% rispetto a \"{NOMI[r0]}\" su partite mai viste"
        cron.append({"data": oggi, "evento": "promossa", "ricetta": cand, "da": r0, "guadagno": round(100 * (prove[r0] - prove[cand]) / prove[r0], 3)})

    # 2) controllo sulle partite vere: se le probabilita corrette mostrate nell'app fanno peggio di quelle del motore, si torna indietro
    ctrl = [k for k, v in enumerate(fin) if v.get("pc") and v.get("ver", "nessuna") != "nessuna"]
    controllo = {"n": len(ctrl), "minimo": MIN_CTRL}
    if ctrl:
        idx = {c: k for k, c in enumerate(codici)}
        lc, lr = [], []
        for k in ctrl:
            for c in CHIAVI_DIARIO:
                y = Yd[k, idx[c]]
                if c in fin[k]["pc"] and not np.isnan(y):
                    lc.append(float(ll_vettore(np.array([fin[k]["pc"][c]]), np.array([y]))[0]))
                    lr.append(float(ll_vettore(np.array([Pd[k, idx[c]]]), np.array([y]))[0]))
        if lc:
            controllo.update({"corrette": round(float(np.mean(lc)), 4), "motore": round(float(np.mean(lr)), 4)})
            if len(ctrl) >= MIN_CTRL and np.mean(lc) > np.mean(lr) * 1.002 and scelta != "nessuna":
                pause[scelta] = (datetime.now(timezone.utc).date() + timedelta(days=PAUSA_RICETTA)).isoformat()
                cron.append({"data": oggi, "evento": "ritirata", "ricetta": scelta, "motivo": "sulle partite vere faceva peggio del motore senza correzioni"})
                scelta, motivo = "nessuna", "ritirata la correzione: sulle partite vere dell'app faceva peggio"

    # 3) modello definitivo della ricetta scelta, allenato su tutto
    r = RICETTE[scelta]
    mod = {} if r is None else allena(codici, P, Y, W, LG, **r)
    nfk = [k for k, v in enumerate(fin) if v.get("nf")]  # partite in cui l'IA ha corretto le quote
    pesi = peso_ia(codici, Pd[nfk], Pm[nfk], Yd[nfk]) if nfk else {}
    peso_attivo = {f: v["peso"] for f, v in pesi.items() if v["attivo"] and v["peso"] != 1.0}
    if peso_attivo:
        mod["peso_ia"] = peso_attivo
    versione = f"{scelta}-{oggi}" if scelta != "nessuna" or peso_attivo else "nessuna"
    attivo = dict(mod, ricetta=scelta, nome=NOMI[scelta], versione=versione,
                  dal=att0.get("dal") if scelta == r0 else oggi, aggiornato=oggi, partite=int(len(P)), diario=len(fin))
    os.makedirs(os.path.dirname(MODELLO), exist_ok=True)
    with open(MODELLO, "w", encoding="utf-8") as f:
        json.dump({"attivo": attivo, "prova": {"data": oggi, "da": str(cut), "partite": int(te.sum()), "punteggi": {k: round(v, 5) for k, v in prove.items()}, "motivo": motivo},
                   "controllo": controllo, "pause": pause, "cronologia": cron[-30:]}, f, ensure_ascii=False, indent=1)

    # 3b) integratore degli specialisti: entra nel modello attivo (genera_app lo applica alle quote prima dei gol attesi)
    try:
        integ, integ_rap = integratore(R, codici, Ph, Yh, fin)
        attivo["integratore"] = integ
        with open(MODELLO, "w", encoding="utf-8") as f:
            json.dump({"attivo": attivo, "prova": {"data": oggi, "da": str(cut), "partite": int(te.sum()), "punteggi": {k: round(v, 5) for k, v in prove.items()}, "motivo": motivo},
                       "controllo": controllo, "pause": pause, "cronologia": cron[-30:]}, f, ensure_ascii=False, indent=1)
    except Exception as e:  # noqa: BLE001 - l'integratore non deve mai fermare l'apprendimento
        print("Integratore: errore", e)
        integ_rap = {}

    # 4) laboratorio: segnali nuovi provati ogni giorno in ombra (riposo, fortuna); entrano nel modello solo se utili
    try:
        lab = laboratorio(R, codici, Ph, Yh)
    except Exception as e:  # noqa: BLE001 - il laboratorio non deve mai fermare l'apprendimento
        print("Laboratorio: errore", e)
        lab = []

    # 5) pagina "Come sta andando l'IA"
    base = per_codice["nessuna"]
    fam = []
    for f in FAMIGLIE:
        ks = [k for k, c in enumerate(codici) if famiglia(c) == f]
        g = float(np.mean([(base[k] - per_codice[scelta][k]) / base[k] for k in ks])) if ks else 0.0
        fam.append({"f": f, "mercati": len(ks), "guadagno": round(100 * g, 2)})
    Qte = Qs[scelta]
    if len(fin) >= 300:
        idx = {c: k for k, c in enumerate(codici)}
        Pv = np.array([[v["pc"].get(c, Pd[n, idx[c]]) if v.get("pc") else Pd[n, idx[c]] for c in codici] for n, v in enumerate(fin)])
        aff, fonte = affidabilita_gruppi(codici, Pv, Yd), "diario"
    else:
        aff, fonte = affidabilita_gruppi(codici, Qte, Y[te]), "archivio"
    pagina = {
        "generato": datetime.now(timezone.utc).isoformat(timespec="minutes"),
        "diario": {"previste": len(diario), "verificate": len(fin), "dal": min((v["date"] for v in diario), default=None)},
        "modello": {"ricetta": scelta, "nome": NOMI[scelta], "dal": attivo["dal"], "motivo": motivo, "partite": int(len(P))},
        "prova": {"partite": int(te.sum()), "da": str(cut), "ricette": [{"k": k, "nome": NOMI[k], "guadagno": round(100 * (prove["nessuna"] - v) / prove["nessuna"], 3),
                                                                        "attiva": k == scelta} for k, v in prove.items()]},
        "famiglie": fam, "affidabilita": {"fonte": fonte, "gruppi": aff},
        "bookmaker": confronto_bookmaker(diario), "valore": valore_anticipato(diario, codici),
        "peso_ia": {"minimo": MIN_PESO_IA, "famiglie": pesi}, "controllo": controllo,
        "consigli": andamento_consigli(), "rendimento": rendimento_consigli(), "cronologia": cron[-10:],
        "laboratorio": lab,
        "integratore": integ_rap,
        "semplice": riepilogo_semplice(fin, Yd, codici),
        "allenato": oggi,
    }
    with open(PAGINA, "w", encoding="utf-8") as f:
        json.dump(pagina, f, ensure_ascii=False, separators=(",", ":"))
    print(f"Modello attivo: {NOMI[scelta]} ({motivo})")


if __name__ == "__main__":
    main()
