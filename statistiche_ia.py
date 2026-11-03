"""AuraPitch - verificatore delle statistiche della partita: cartellini (K), calci d'angolo (C) e falli (F).
Solo libreria standard: gira ogni mattina nel giro completo, come il verificatore dei giocatori (giocatori.py).

- VERIFICATORE: per ogni partita finita del diario prende le medie attese salvate prima del fischio (campo "ck": cartellini,
  angoli e falli attesi della partita e delle due squadre, media del campionato, arbitro, equilibrio) e le confronta con il
  tabellino ESPN (data/espn/tabellini.json, campo "st"). Ogni linea Over/Under mostrata dall'app diventa una riga dell'archivio
  data/statistiche_verifica.json (nella cassaforte): [data, tipo, id partita, codice, probabilita, preso 0/1, specialisti...].
- SPECIALISTI: cartellini.segnali_stat (linea, intensita, arbitro, squadra, equilibrio).
- TARATURA IN OMBRA: per ogni tipo, con abbastanza controlli, impara logit(p) = a + b * logit(p_base) + pesi * specialisti
  sulle partite piu vecchie e la prova su quelle piu recenti (mai viste). Si accende solo se riduce l'errore; altrimenti l'app
  mostra le probabilita del modello, invariate. Il file data/taratura_statistiche.json lo legge cartellini.applica_stat.

Uso: python3 statistiche_ia.py   (verifica + taratura; scrive anche il riassunto pubblico app/data/statistiche_ia.json)"""
import glob
import json
import os
from datetime import datetime, timedelta, timezone

import cartellini as CK
import giocatori as GC

DATA = "data"
VERIFICA = os.path.join(DATA, "statistiche_verifica.json")
TARATURA = os.path.join(DATA, "taratura_statistiche.json")
PAGINA = os.path.join("app", "data", "statistiche_ia.json")
TABELLINI = os.path.join(DATA, "espn", "tabellini.json")
DIARIO = os.path.join(DATA, "diario")

TIPI = ("K", "C", "F")
NOMI_TIPI = {"K": "Cartellini", "C": "Calci d'angolo", "F": "Falli"}
NOMI = CK.NOMI_STAT
MIN_TIPO = 1500       # linee controllate di un tipo prima di provare una taratura (ogni partita ne da una decina)
MARGINE = 0.002       # la taratura deve ridurre l'errore sulle partite mai viste di almeno lo 0,2%
MAX_RIGHE = 24000     # archivio dei controlli: le piu recenti (la cassaforte accetta file fino a 1,5 MB)


def righe_partita(ck, st, data, mid):
    """Righe di controllo di una partita: tutte le linee Over (totale e squadre) che l'app mostrava, con l'esito vero.
    ck = attese salvate nel diario; st = statistiche vere {"K": [casa, ospite], ...}."""
    out = []
    ctx = {"arb": ck.get("arb"), "eq": ck.get("eq")}
    for k in TIPI:
        x, vero = ck.get(k), (st or {}).get(k)
        if not x or not vero or len(vero) < 2:
            continue
        mu, sh, sa, lega = (list(x) + [None] * 4)[:4]
        c = dict(ctx, lega=lega)
        prove = [("", CK.MODELLI[k]["linee"], mu, CK.MODELLI[k]["r"], vero[0] + vero[1], False)]
        if sh and sa:
            prove += [("H", CK.LINEE_SQUADRA[k], sh, CK.MODELLI[k]["r_squadra"], vero[0], True),
                      ("A", CK.LINEE_SQUADRA[k], sa, CK.MODELLI[k]["r_squadra"], vero[1], True)]
        for lato, linee, m, r, tot, sq in prove:
            if not m:
                continue
            for L in linee:
                p = CK.p_over(L, m, r)
                if not 0.03 < p < 0.97:
                    continue
                out.append([data, k, mid, f"{k}{lato}O{L}", round(p, 4), 1 if tot > L else 0] + CK.segnali_stat(k, L, m, r, c, sq))
    return out


def verifica(giorni=14):
    """Aggiunge all'archivio le linee delle partite finite degli ultimi giorni (una volta sola ciascuna)."""
    arch = GC._jload(VERIFICA, {"righe": [], "fatte": []})
    fatte, righe = set(arch.get("fatte", [])), arch.get("righe", [])
    tab = GC._jload(TABELLINI, {})
    limite = (datetime.now(timezone.utc).date() - timedelta(days=giorni)).isoformat()
    nuove, partite, visti = 0, 0, set()
    for path in sorted(glob.glob(os.path.join(DIARIO, "*.json"))):
        giorno = os.path.basename(path)[:10]
        if giorno < limite:
            continue
        for mid, r in (GC._jload(path, {}) or {}).items():
            visti.add(mid)
            if mid in fatte or r.get("st") != "FT" or not r.get("ck"):
                continue
            t = GC.trova_tabellino(r, tab)
            if not t or not t.get("st"):
                continue
            fatte.add(mid)
            partite += 1
            nr = righe_partita(r["ck"], t["st"], r.get("date", giorno), mid)
            righe += nr
            nuove += len(nr)
    righe = sorted(righe, key=lambda z: z[0])[-MAX_RIGHE:]
    tenute = {z[2] for z in righe} | visti
    arch = {"agg": datetime.now(timezone.utc).isoformat(timespec="minutes"), "righe": righe, "fatte": sorted(f for f in fatte if f in tenute)}
    os.makedirs(DATA, exist_ok=True)
    with open(VERIFICA, "w", encoding="utf-8") as f:
        json.dump(arch, f, ensure_ascii=False, separators=(",", ":"))
    print(f"Verificatore statistiche: {partite} partite controllate, {nuove} linee nuove, {len(righe)} in archivio")
    return righe


def tara(righe):
    """Per ogni tipo: probabilita del modello contro taratura, sulle partite piu recenti mai viste in allenamento."""
    out = {"agg": datetime.now(timezone.utc).isoformat(timespec="minutes"), "specialisti": NOMI, "tipi": {}}
    for tipo in TIPI:
        R = sorted((z for z in righe if z[1] == tipo), key=lambda z: z[0])
        info = {"controlli": len(R), "presi": sum(z[5] for z in R), "attesi": round(sum(z[4] for z in R), 1), "attivo": False}
        if len(R) < MIN_TIPO:
            info["stato"] = f"in ombra: servono almeno {MIN_TIPO} linee controllate"
            out["tipi"][tipo] = info
            continue
        # divisione per data: le linee di una stessa partita restano dalla stessa parte
        cut = int(len(R) * 0.8)
        while 0 < cut < len(R) and R[cut][0] == R[cut - 1][0]:
            cut += 1
        if cut >= len(R) - 50:
            info["stato"] = "in ombra: servono partite di piu giorni"
            out["tipi"][tipo] = info
            continue
        F = [[None if v is None else float(v) for v in z[6:6 + len(NOMI)]] for z in R]
        mu, sd = [], []
        for i in range(len(NOMI)):
            vs = [f[i] for f in F[:cut] if f[i] is not None]
            m = sum(vs) / len(vs) if vs else 0.0
            mu.append(round(m, 5))
            sd.append(round((sum((v - m) ** 2 for v in vs) / len(vs)) ** 0.5 if len(vs) > 1 else 1.0, 5) or 1.0)

        def mat(cols):
            return [[1.0, GC.logit(z[4])] + [0.0 if F[k][i] is None else (F[k][i] - mu[i]) / sd[i] for i in cols] for k, z in enumerate(R)]
        y = [z[5] for z in R]
        base = GC._ll([[0.0, GC.logit(z[4])] for z in R][cut:], y[cut:], [0.0, 1.0])
        Xc = mat([])
        migliore = GC._ll(Xc[cut:], y[cut:], GC._adatta(Xc[:cut], y[:cut]))
        usa, contributi, cambiato = [], {}, True
        while cambiato:
            cambiato, prove = False, []
            for i in range(len(NOMI)):
                if i in usa or sum(1 for f in F if f[i] is not None) < MIN_TIPO // 2:
                    continue
                Xi = mat(usa + [i])
                prove.append((GC._ll(Xi[cut:], y[cut:], GC._adatta(Xi[:cut], y[:cut])), i))
            if prove:
                v, i = min(prove)
                if v < migliore * (1 - 0.0005):
                    contributi[NOMI[i]] = round(100 * (migliore - v) / base, 3)
                    usa.append(i)
                    migliore, cambiato = v, True
        guad = (base - migliore) / base
        info.update({"errore_base": round(base, 5), "errore_tarato": round(migliore, 5), "guadagno": round(100 * guad, 3), "contributi": contributi})
        if guad >= MARGINE:
            wf = GC._adatta(mat(usa), y)
            info.update({"attivo": True, "a": round(wf[0], 5), "b": round(wf[1], 5), "mu": mu, "sd": sd,
                         "w": {NOMI[i]: round(wf[2 + j], 5) for j, i in enumerate(usa)}, "stato": "attiva"})
        else:
            info["stato"] = "in ombra: non migliora ancora le probabilità del modello"
        out["tipi"][tipo] = info
    return out


def pagina(tar, righe):
    """Riassunto pubblico (solo conteggi): per ogni tipo, linee controllate, prese contro attese, fasce di probabilita."""
    tipi = {}
    for tipo in TIPI:
        t = (tar.get("tipi") or {}).get(tipo) or {}
        R = [z for z in righe if z[1] == tipo]
        fasce = []
        for lo, hi in ((0, 0.35), (0.35, 0.65), (0.65, 1.01)):
            Z = [z for z in R if lo <= z[4] < hi]
            if len(Z) >= 30:
                fasce.append({"da": lo, "a": min(1, hi), "n": len(Z), "attesa": round(100 * sum(z[4] for z in Z) / len(Z), 1), "vera": round(100 * sum(z[5] for z in Z) / len(Z), 1)})
        tipi[tipo] = {"nome": NOMI_TIPI[tipo], "controlli": len(R), "partite": len({z[2] for z in R}), "presi": sum(z[5] for z in R),
                      "attesi": round(sum(z[4] for z in R), 1), "attivo": bool(t.get("attivo")), "fasce": fasce}
    os.makedirs(os.path.dirname(PAGINA), exist_ok=True)
    with open(PAGINA, "w", encoding="utf-8") as f:
        json.dump({"agg": tar.get("agg"), "tipi": tipi}, f, ensure_ascii=False, separators=(",", ":"))


def main():
    righe = verifica()
    tar = tara(righe)
    with open(TARATURA, "w", encoding="utf-8") as f:
        json.dump(tar, f, ensure_ascii=False, separators=(",", ":"))
    pagina(tar, righe)
    for tipo, t in tar["tipi"].items():
        print(f"  {NOMI_TIPI[tipo]}: {t['controlli']} linee, prese {t['presi']} (attese {t['attesi']}), {t.get('stato')}")


if __name__ == "__main__":
    main()
