"""AuraPitch - agenti sui giocatori (marcatori, assist, ammoniti). Solo libreria standard: gira nel giro dei dati.

Come per le partite, ogni agente ha un solo compito e lavora "in ombra" finche non dimostra di servire:

- VERIFICATORE: ogni mattina confronta le probabilita dei giocatori mostrate dall'app (salvate nel diario prima del fischio)
  con i tabellini ESPN delle partite finite: ha segnato? ha fatto assist? ha preso un cartellino? Ogni controllo diventa una
  riga dell'archivio data/giocatori_verifica.json (nella cassaforte, come il diario).
- SPECIALISTI (un numero ciascuno, None se mancano i dati):
    minuti      quanto gioca adesso: titolare/panchina dalla formazione ufficiale, altrimenti minuti delle ultime 5 rispetto alla stagione
    rigorista   tira i rigori della squadra? (solo marcatori)
    forma       gol, assist o cartellini nelle ultime 5 rispetto alla sua media di stagione
    avversario  quanto e favorevole la partita: gol attesi della squadra (marcatori, assist) o cartellini attesi (ammoniti)
    arbitro     quanti cartellini da l'arbitro rispetto alla media del campionato (solo ammoniti)
- TARATURA: per ogni tipo di giocata, con abbastanza controlli, impara una correzione logistica
      logit(p) = a + b * logit(p_base) + somma(peso_i * specialista_i)
  allenata sui controlli piu vecchi e provata sui piu recenti (mai visti). Uno specialista entra solo se migliora la prova;
  la correzione si accende solo se batte la probabilita di base. Altrimenti l'app usa la probabilita di base, invariata.

Uso: python3 giocatori.py   (verifica + taratura; scrive data/taratura_giocatori.json e app/data/giocatori_ia.json)"""
import glob
import json
import math
import os
import unicodedata
from datetime import datetime, timedelta, timezone

DATA = "data"
VERIFICA = os.path.join(DATA, "giocatori_verifica.json")
TARATURA = os.path.join(DATA, "taratura_giocatori.json")
PAGINA = os.path.join("app", "data", "giocatori_ia.json")
TABELLINI = os.path.join(DATA, "espn", "tabellini.json")
DIARIO = os.path.join(DATA, "diario")

TIPI = ("MARC", "ASS", "AMM")
NOMI_TIPI = {"MARC": "Marcatori", "ASS": "Assist", "AMM": "Ammoniti"}
SPECIALISTI = [("minuti", "Minuti: titolare, panchina o minuti recenti"), ("rigorista", "Rigorista della squadra"),
               ("forma", "Forma del giocatore nelle ultime 5"), ("avversario", "Partita favorevole (gol o cartellini attesi)"),
               ("arbitro", "Arbitro severo o permissivo")]
NOMI = [s[0] for s in SPECIALISTI]
MIN_TIPO = 400        # controlli di un tipo prima di provare una taratura
MARGINE = 0.002       # la taratura deve ridurre l'errore (log-loss) sulle partite mai viste di almeno lo 0,2%
MAX_RIGHE = 18000     # archivio dei controlli: le piu recenti (la cassaforte accetta file fino a 1,5 MB)


# ---------- specialisti ----------

def _piano(s):
    s = unicodedata.normalize("NFD", str(s or "").lower())
    return "".join(c for c in s if unicodedata.category(c) != "Mn").strip()


def segnali(tipo, x, ctx):
    """Valori degli specialisti per un giocatore. x = giocatore della rosa ESPN arricchito dall'archivio voti (minq, u5, rig...);
    ctx = {"stato": "titolare"/"panchina"/None, "lam": gol attesi della squadra, "k": cartellini attesi della squadra,
           "k_lega": cartellini medi per squadra nel campionato, "arb": rapporto cartellini arbitro/campionato, "rig_max": rigori del rigorista}."""
    u5 = x.get("u5") or []
    pres = max(1, x.get("pres") or 0)
    # minuti: la formazione ufficiale vale piu di tutto; senza, minuti medi delle ultime 5 contro la quota di partenze da titolare
    if ctx.get("stato") == "titolare":
        minuti = 1.0
    elif ctx.get("stato") == "panchina":
        minuti = -1.0
    elif len(u5) >= 3:
        minuti = sum(r[0] for r in u5) / (90 * len(u5)) - min(1.0, (x.get("tit") or 0) / pres)
    else:
        minuti = None
    # rigorista: 1 se e il giocatore che ne ha tirati di piu nella squadra, 0,5 se ne ha tirato almeno uno, 0 altrimenti
    rigorista = None
    if tipo == "MARC" and ctx.get("rig_max") is not None:
        r = x.get("rig") or 0
        rigorista = 1.0 if r and r >= ctx["rig_max"] else 0.5 if r else 0.0
    # forma: ritmo nelle ultime 5 (per 90 minuti) meno ritmo di stagione
    forma = None
    col = {"MARC": 1, "ASS": 2, "AMM": 3}[tipo]
    min5 = sum(r[0] for r in u5)
    if len(u5) >= 3 and min5 >= 90:
        stag = {"MARC": x.get("g", 0), "ASS": x.get("a", 0), "AMM": (x.get("gialli", 0) or 0) + (x.get("rossi", 0) or 0)}[tipo]
        min_stag = x.get("min_v") or 90 * pres * 0.8
        forma = round(90 * sum(r[col] for r in u5) / min5 - 90 * stag / max(90, min_stag), 4)
    # avversario: partita piu o meno favorevole del normale
    avversario = None
    if tipo in ("MARC", "ASS") and ctx.get("lam"):
        avversario = math.log(max(0.1, ctx["lam"]) / 1.35)
    elif tipo == "AMM" and ctx.get("k") and ctx.get("k_lega"):
        avversario = math.log(max(0.1, ctx["k"]) / max(0.1, ctx["k_lega"]))
    arbitro = math.log(max(0.3, ctx["arb"])) if tipo == "AMM" and ctx.get("arb") else None
    return [None if v is None else round(v, 4) for v in (minuti, rigorista, forma, avversario, arbitro)]


def logit(p):
    p = min(1 - 1e-4, max(1e-4, p))
    return math.log(p / (1 - p))


def sig(z):
    return 1 / (1 + math.exp(-max(-30, min(30, z))))


_TAR = None


def taratura():
    global _TAR
    if _TAR is None:
        try:
            with open(TARATURA, encoding="utf-8") as f:
                _TAR = json.load(f)
        except (OSError, ValueError):
            _TAR = {}
    return _TAR


def applica(tipo, p, sg, tar=None):
    """Probabilita dopo la taratura del verificatore; se la taratura del tipo e spenta o assente, p resta com'e."""
    t = ((tar if tar is not None else taratura()).get("tipi") or {}).get(tipo) or {}
    if not t.get("attivo"):
        return p
    z = t["a"] + t["b"] * logit(p)
    for i, n in enumerate(NOMI):
        w = (t.get("w") or {}).get(n)
        if w and sg and sg[i] is not None:
            z += w * (sg[i] - t["mu"][i]) / (t["sd"][i] or 1)
    # prudenza: la taratura non sposta mai una probabilita di piu di 15 punti
    return round(min(p + 0.15, max(p - 0.15, min(0.85, max(0.02, sig(z))))), 4)


# ---------- verificatore ----------

def _jload(p, dflt):
    try:
        with open(p, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return dflt


def _stessa_squadra(a, b):
    import espn_dati as ES
    return ES.sim(a, [b]) >= 0.8


def trova_tabellino(r, tab):
    """Tabellino ESPN della partita del diario: stesso campionato, data entro un giorno, stesse squadre."""
    try:
        ko = datetime.fromisoformat(r["ko"])
    except (KeyError, ValueError):
        return None
    for x in tab.values():
        if x.get("lg") != r.get("lg") or not x.get("t"):
            continue
        try:
            t = datetime.fromisoformat(str(x["t"]).replace("Z", "+00:00"))
        except ValueError:
            continue
        if abs((t - ko).total_seconds()) <= 36 * 3600 and _stessa_squadra(r["h"], x.get("h")) and _stessa_squadra(r["a"], x.get("a")):
            return x
    return None


def verifica(giorni=14):
    """Aggiunge all'archivio dei controlli le giocate sui giocatori delle partite finite degli ultimi giorni (una volta sola ciascuna).
    Riga: [data, tipo, id partita, nome, p base, p mostrata, preso (0/1), ha giocato (0/1), specialisti...]."""
    arch = _jload(VERIFICA, {"righe": [], "fatte": []})
    fatte = set(arch.get("fatte", []))
    righe = arch.get("righe", [])
    tab = _jload(TABELLINI, {})
    limite = (datetime.now(timezone.utc).date() - timedelta(days=giorni)).isoformat()
    nuove, partite, visti = 0, 0, set()
    for path in sorted(glob.glob(os.path.join(DIARIO, "*.json"))):
        giorno = os.path.basename(path)[:10]
        if giorno < limite:
            continue
        for mid, r in (_jload(path, {}) or {}).items():
            visti.add(mid)
            if mid in fatte or r.get("st") != "FT" or not r.get("pg"):
                continue
            t = trova_tabellino(r, tab)
            if not t:
                continue
            fatte.add(mid)
            partite += 1
            dentro = {_piano(n) for n in t.get("in") or []}
            per_tipo = {"MARC": t.get("marc"), "ASS": t.get("ass"), "AMM": t.get("amm")}
            for code, v in r["pg"].items():
                tipo, nome = code.split(":", 1)
                if tipo not in TIPI:
                    continue
                preso = 1 if _piano(nome) in {_piano(n) for n in per_tipo[tipo] or []} else 0
                giocato = 1 if _piano(nome) in dentro else 0
                righe.append([r.get("date", giorno), tipo, mid, nome, v[0], v[1], preso, giocato] + list(v[2:2 + len(NOMI)]))
                nuove += 1
    righe = sorted(righe, key=lambda z: z[0])[-MAX_RIGHE:]
    tenute = {z[2] for z in righe} | visti  # si ricordano le partite gia controllate finche possono ricomparire nel diario
    arch = {"agg": datetime.now(timezone.utc).isoformat(timespec="minutes"), "righe": righe, "fatte": sorted(f for f in fatte if f in tenute)}
    os.makedirs(DATA, exist_ok=True)
    with open(VERIFICA, "w", encoding="utf-8") as f:
        json.dump(arch, f, ensure_ascii=False, separators=(",", ":"))
    print(f"Verificatore giocatori: {partite} partite controllate, {nuove} giocate nuove, {len(righe)} in archivio")
    return righe


# ---------- taratura (regressione logistica con il metodo di Newton, in Python puro) ----------

def _risolvi(A, b):
    n = len(b)
    M = [row[:] + [b[i]] for i, row in enumerate(A)]
    for c in range(n):
        piv = max(range(c, n), key=lambda r: abs(M[r][c]))
        if abs(M[piv][c]) < 1e-12:
            return None
        M[c], M[piv] = M[piv], M[c]
        for r in range(n):
            if r != c:
                f = M[r][c] / M[c][c]
                for k in range(c, n + 1):
                    M[r][k] -= f * M[c][k]
    return [M[i][n] / M[i][i] for i in range(n)]


def _adatta(X, y, l2=1.0, it=12):
    """Logistica: X righe di caratteristiche (con la costante), y 0/1. Penalita l2 su tutti i pesi tranne la costante."""
    k = len(X[0])
    w = [0.0] * k
    if k >= 2:
        w[1] = 1.0  # si parte da "nessuna correzione": a = 0, b = 1
    for _ in range(it):
        g = [0.0] * k
        H = [[0.0] * k for _ in range(k)]
        for x, t in zip(X, y):
            p = sig(sum(a * b for a, b in zip(w, x)))
            e, v = p - t, p * (1 - p)
            for i in range(k):
                g[i] += e * x[i]
                xi = v * x[i]
                for j in range(i, k):
                    H[i][j] += xi * x[j]
        for i in range(k):
            for j in range(i):
                H[i][j] = H[j][i]
            if i > 0:
                rif = 1.0 if i == 1 else 0.0  # b tirato verso 1, gli specialisti verso 0
                g[i] += l2 * (w[i] - rif)
                H[i][i] += l2
        d = _risolvi(H, g)
        if d is None:
            break
        w = [a - b for a, b in zip(w, d)]
        if max(abs(v) for v in d) < 1e-6:
            break
    return w


def _ll(X, y, w):
    s = 0.0
    for x, t in zip(X, y):
        p = min(1 - 1e-6, max(1e-6, sig(sum(a * b for a, b in zip(w, x)))))
        s -= t * math.log(p) + (1 - t) * math.log(1 - p)
    return s / max(1, len(y))


def tara(righe):
    """Per ogni tipo: base (probabilita senza taratura) contro taratura, sulle partite piu recenti mai viste in allenamento."""
    out = {"agg": datetime.now(timezone.utc).isoformat(timespec="minutes"), "specialisti": NOMI, "tipi": {}}
    for tipo in TIPI:
        R = [z for z in righe if z[1] == tipo]
        info = {"controlli": len(R), "presi": sum(z[6] for z in R), "attivo": False}
        if R:
            info["attesi"] = round(sum(z[5] for z in R), 1)  # quante ne aspettava l'app: se sono vicine ai "presi", le probabilita sono oneste
        if len(R) < MIN_TIPO:
            info["stato"] = f"in ombra: servono almeno {MIN_TIPO} controlli"
            out["tipi"][tipo] = info
            continue
        R.sort(key=lambda z: z[0])
        cut = int(len(R) * 0.8)
        F = [[None if v is None else float(v) for v in z[8:8 + len(NOMI)]] + [None] * (len(NOMI) - len(z[8:8 + len(NOMI)])) for z in R]
        mu, sd = [], []
        for i in range(len(NOMI)):
            vs = [f[i] for f in F[:cut] if f[i] is not None]
            m = sum(vs) / len(vs) if vs else 0.0
            mu.append(round(m, 5))
            sd.append(round(math.sqrt(sum((v - m) ** 2 for v in vs) / len(vs)) if len(vs) > 1 else 1.0, 5) or 1.0)

        def mat(cols):
            return [[1.0, logit(z[4])] + [0.0 if F[k][i] is None else (F[k][i] - mu[i]) / sd[i] for i in cols] for k, z in enumerate(R)]
        y = [z[6] for z in R]
        X0 = [[0.0, logit(z[4])] for z in R]
        base = _ll(X0[cut:], y[cut:], [0.0, 1.0])
        # scelta in avanti: si aggiunge uno specialista alla volta, solo se migliora la prova
        usa, migliore = [], None
        Xc = mat([])
        w = _adatta(Xc[:cut], y[:cut])
        migliore = _ll(Xc[cut:], y[cut:], w)
        contributi = {}
        cambiato = True
        while cambiato:
            cambiato = False
            prove = []
            for i in range(len(NOMI)):
                if i in usa or sum(1 for f in F if f[i] is not None) < MIN_TIPO // 2:
                    continue
                Xi = mat(usa + [i])
                wi = _adatta(Xi[:cut], y[:cut])
                prove.append((_ll(Xi[cut:], y[cut:], wi), i))
            if prove:
                v, i = min(prove)
                if v < migliore * (1 - 0.0005):
                    contributi[NOMI[i]] = round(100 * (migliore - v) / base, 3)
                    usa.append(i)
                    migliore, cambiato = v, True
        guad = (base - migliore) / base
        info.update({"errore_base": round(base, 5), "errore_tarato": round(migliore, 5), "guadagno": round(100 * guad, 3), "contributi": contributi})
        if guad >= MARGINE:
            Xf = mat(usa)
            wf = _adatta(Xf, y)  # modello definitivo su tutti i controlli
            info.update({"attivo": True, "a": round(wf[0], 5), "b": round(wf[1], 5), "mu": mu, "sd": sd,
                         "w": {NOMI[i]: round(wf[2 + j], 5) for j, i in enumerate(usa)}, "stato": "attiva"})
        else:
            info["stato"] = "in ombra: non migliora ancora le probabilità di base"
        out["tipi"][tipo] = info
    return out


def pagina(tar, righe):
    """Riassunto pubblico per la pagina dell'IA (solo conteggi: nessun dato del diario)."""
    tipi = {}
    for tipo in TIPI:
        t = (tar.get("tipi") or {}).get(tipo) or {}
        R = [z for z in righe if z[1] == tipo]
        fasce = []
        for lo, hi in ((0, 0.2), (0.2, 0.35), (0.35, 1.01)):
            Z = [z for z in R if lo <= z[5] < hi]
            if len(Z) >= 30:
                fasce.append({"da": lo, "a": min(1, hi), "n": len(Z), "attesa": round(100 * sum(z[5] for z in Z) / len(Z), 1), "vera": round(100 * sum(z[6] for z in Z) / len(Z), 1)})
        tipi[tipo] = {"nome": NOMI_TIPI[tipo], "controlli": len(R), "presi": sum(z[6] for z in R), "attesi": round(sum(z[5] for z in R), 1),
                      "attivo": bool(t.get("attivo")), "fasce": fasce}
    out = {"agg": tar.get("agg"), "tipi": tipi}
    os.makedirs(os.path.dirname(PAGINA), exist_ok=True)
    with open(PAGINA, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))


def main():
    righe = verifica()
    tar = tara(righe)
    with open(TARATURA, "w", encoding="utf-8") as f:
        json.dump(tar, f, ensure_ascii=False, separators=(",", ":"))
    pagina(tar, righe)
    for tipo, t in tar["tipi"].items():
        print(f"  {NOMI_TIPI[tipo]}: {t['controlli']} controlli, presi {t['presi']}, {t.get('stato')}")


if __name__ == "__main__":
    main()
