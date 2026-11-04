"""AuraPitch - agente "bookmaker esperti": pesare i bookmaker in base alla loro precisione invece della media semplice.

Oggi la base dell'algoritmo e la QUOTA MEDIA di tutti i bookmaker (raccoglitore.riassunto), senza margine. Alcuni bookmaker
(Pinnacle, gli exchange come Betfair) sono noti per quote piu precise: qui si misura se dare loro piu peso aiuta davvero.

Come lavora (regola di sempre: entra solo se migliora su partite mai viste):
 1. Archivio (misura_archivio, ogni mattina in strumenti/impara.py): sulle ~100.000 partite di Football-Data confronta
    Pinnacle (PS*), la media (Avg*) e Bet365 (B365*) prima della chiusura, e le stesse quote alla chiusura. Il peso di
    Pinnacle nella miscela si impara sul 70% piu vecchio e si prova sul 30% piu recente.
 2. Raccolta (raccoglitore.py): dalle risposte di The Odds API salva, oltre alla media, le probabilita senza margine di
    alcuni bookmaker "candidati" (Pinnacle, Betfair Exchange, Matchbook): colonne oa_pin_*, oa_bfx_*, oa_mbk_*.
 3. Diario (genera_app.py): per ogni partita salva "be" = probabilita della media, della miscela "esperti" e dei candidati.
 4. Decisione (misura_diario + decidi): la miscela entra al posto della media solo se sulle partite vere del diario (mai
    viste: il peso viene dall'archivio) riduce l'errore di almeno MARGINE, sia su tutte sia sul 40% piu recente. Se dopo
    l'accensione smette di aiutare, si spegne da sola (stessa misura, ogni mattina).
Solo libreria standard, tranne misura_archivio (numpy, solo dentro l'apprendimento)."""
import csv
import gzip
import math

# bookmaker candidati: chiave di The Odds API -> sigla nelle colonne (oa_pin_1, ...) e nel diario
CANDIDATI = {"pinnacle": "pin", "betfair_ex_eu": "bfx", "matchbook": "mbk"}
PESO_PIN = 1.0      # peso di Pinnacle nella miscela con la media: sull'archivio vince Pinnacle da solo (impara lo rimisura ogni mattina)
MIN_DIARIO = 300    # partite finite del diario con Pinnacle prima di poter accendere la miscela
MARGINE = 0.0005    # come per le ricette: almeno lo 0,05% di errore in meno
QUOTA_PROVA = 0.4   # il 40% piu recente del diario fa da seconda prova
ESITI = ("1", "X", "2")


def togli_margine(quote):
    """Metodo "potenza", come genera_app.togli_margine (solo libreria standard)."""
    inv = [1 / x for x in quote]
    k = 1.0
    for _ in range(50):
        s = sum(v ** k for v in inv)
        ds = sum(math.log(v) * v ** k for v in inv)
        k -= (s - 1) / ds
    p = [v ** k for v in inv]
    return [v / sum(p) for v in p]


def _quote_bk(bk, casa, ospite):
    """Quote di un bookmaker (formato The Odds API): {"1", "X", "2", "O", "U"}."""
    q = {}
    for mk in bk.get("markets", []):
        if mk.get("key") == "h2h":
            for o in mk.get("outcomes", []):
                k = "1" if o.get("name") == casa else "2" if o.get("name") == ospite else "X" if o.get("name") == "Draw" else None
                if k:
                    q[k] = float(o["price"])
        elif mk.get("key") == "totals":
            for o in mk.get("outcomes", []):
                if float(o.get("point", 0)) == 2.5 and o.get("name") in ("Over", "Under"):
                    q[o["name"][0]] = float(o["price"])
    return q


def riassunto(evento):
    """Evento The Odds API -> probabilita senza margine dei bookmaker candidati: {"pin_1": .., "pin_X": .., "pin_2": .., "pin_O": ..}."""
    out = {}
    for bk in (evento or {}).get("bookmakers", []):
        sig = CANDIDATI.get(bk.get("key"))
        if not sig:
            continue
        q = _quote_bk(bk, evento.get("home_team"), evento.get("away_team"))
        if all(q.get(e, 0) > 1 for e in ESITI):
            for e, p in zip(ESITI, togli_margine([q[e] for e in ESITI])):
                out[f"{sig}_{e}"] = round(p, 4)
            if q.get("O", 0) > 1 and q.get("U", 0) > 1:
                out[f"{sig}_O"] = round(togli_margine([q["O"], q["U"]])[0], 4)
    return out


def _num(x):
    try:
        v = float(x)
        return v if v == v else None
    except (TypeError, ValueError):
        return None


def miscela(pa, pb, w):
    """Miscela log-lineare: w sul primo (Pinnacle), 1 - w sul secondo (media). Vale per 1X2 (3 esiti) e per Over (1 numero)."""
    if isinstance(pa, (int, float)):
        la = w * math.log(max(1e-6, pa)) + (1 - w) * math.log(max(1e-6, pb))
        lb = w * math.log(max(1e-6, 1 - pa)) + (1 - w) * math.log(max(1e-6, 1 - pb))
        return round(1 / (1 + math.exp(lb - la)), 4)
    z = [w * math.log(max(1e-6, a)) + (1 - w) * math.log(max(1e-6, b)) for a, b in zip(pa, pb)]
    m = max(z)
    e = [math.exp(v - m) for v in z]
    return [round(v / sum(e), 4) for v in e]


def da_riga(r, mk, mo, peso=None):
    """Riga di partite.csv (prefisso oa_) + probabilita della media -> "be" per il diario (None senza bookmaker candidati).
    m = media, e = miscela "esperti", pin/bfx/mbk = candidati; ogni voce e [1, X, 2, Over 2,5] (Over None se manca)."""
    if not mk:
        return None
    w = PESO_PIN if peso is None else peso
    be = {"m": [round(x, 4) for x in mk] + [mo]}
    for sig in CANDIDATI.values():
        p = [_num(r.get(f"oa_{sig}_{e}")) for e in ESITI]
        if all(p):
            be[sig] = p + [_num(r.get(f"oa_{sig}_O"))]
    if "pin" not in be:
        return None if len(be) == 1 else be
    pin = be["pin"]
    e3 = miscela(pin[:3], mk, w)
    eo = miscela(pin[3], mo, w) if pin[3] is not None and mo is not None else mo
    be["e"] = e3 + [eo]
    return be


def applica(q, mod):
    """Se la miscela e accesa (modello["esperti"]["attivo"]), prende il posto della media in mk e mo. Altrimenti nulla."""
    es = (mod or {}).get("esperti") or {}
    be = (q or {}).get("be") or {}
    if not es.get("attivo") or not be.get("e"):
        return q
    q["mk"] = be["e"][:3]
    if be["e"][3] is not None and q.get("mo") is not None:
        q["mo"] = be["e"][3]
    return q


# ---------- misure ----------

def _esito(g):
    return 0 if g[0] > g[1] else 1 if g[0] == g[1] else 2


def _ll3(p, e):
    return -math.log(max(1e-9, p[e]))


def _ll2(p, y):
    return -math.log(max(1e-9, p if y else 1 - p))


def misura_diario(diario):
    """Sulle partite vere del diario con Pinnacle: errore (log-loss) della media e della miscela, 1X2 e Over 2,5.
    Anche i candidati da soli contro la media, per imparare in futuro i loro pesi."""
    fin = sorted((v for v in diario if v.get("st") == "FT" and isinstance(v.get("g"), list) and len(v["g"]) == 2
                  and (v.get("be") or {}).get("e") and (v.get("be") or {}).get("m")), key=lambda v: v.get("ko") or v.get("date") or "")
    out = {"partite": len(fin), "minimo": MIN_DIARIO}
    if not fin:
        return out

    def blocco(voci):
        a = {"m": 0.0, "e": 0.0, "d2": 0.0, "n": 0, "om": 0.0, "oe": 0.0, "no": 0}
        for v in voci:
            be, e = v["be"], _esito(v["g"])
            lm, le = _ll3(be["m"], e), _ll3(be["e"], e)
            a["m"] += lm
            a["e"] += le
            a["d2"] += (lm - le) ** 2
            a["n"] += 1
            if be["m"][3] is not None and be["e"][3] is not None:
                y = int(sum(v["g"]) > 2.5)
                a["om"] += _ll2(be["m"][3], y)
                a["oe"] += _ll2(be["e"][3], y)
                a["no"] += 1
        n = max(1, a["n"])
        m, e = a["m"] / n, a["e"] / n
        sd = math.sqrt(max(0.0, a["d2"] / n - (m - e) ** 2) / n)
        r = {"n": a["n"], "media": round(m, 5), "esperti": round(e, 5), "guadagno": round(100 * (m - e) / m, 3) if m else 0.0,
             "incertezza": round(100 * sd / m, 3) if m else None}
        if a["no"]:
            r["ou"] = {"n": a["no"], "media": round(a["om"] / a["no"], 5), "esperti": round(a["oe"] / a["no"], 5),
                       "guadagno": round(100 * (a["om"] - a["oe"]) / a["om"], 3) if a["om"] else 0.0}
        return r

    out["tutte"] = blocco(fin)
    out["recenti"] = blocco(fin[int(len(fin) * (1 - QUOTA_PROVA)):])
    cand = {}
    for sig in CANDIDATI.values():
        vv = [v for v in fin if v["be"].get(sig)]
        if vv:
            m = sum(_ll3(v["be"]["m"], _esito(v["g"])) for v in vv) / len(vv)
            c = sum(_ll3(v["be"][sig], _esito(v["g"])) for v in vv) / len(vv)
            cand[sig] = {"n": len(vv), "media": round(m, 5), "da_solo": round(c, 5), "guadagno": round(100 * (m - c) / m, 3) if m else 0.0}
    out["candidati"] = cand
    return out


def decidi(diario_misura, prima=None):
    """Accesa solo se sulle partite vere (mai viste) la miscela riduce l'errore di almeno MARGINE, su tutte e sulle piu recenti.
    Se era accesa e non aiuta piu, si spegne. Restituisce (attivo, motivo)."""
    n = diario_misura.get("partite", 0)
    if n < MIN_DIARIO:
        return False, f"in ombra: servono almeno {MIN_DIARIO} partite finite con le quote di Pinnacle nel diario (ora {n})"
    t, r = diario_misura["tutte"], diario_misura["recenti"]
    g, gr = t["guadagno"], r["guadagno"]
    testo = f"{g:+.3f}% su {t['n']} partite, {gr:+.3f}% sulle {r['n']} più recenti".replace(".", ",")
    if g >= 100 * MARGINE and gr >= 100 * MARGINE:
        return True, "accesa: errore più basso della media dei bookmaker (" + testo + ")"
    if prima:
        return False, "spenta: non migliora più la media dei bookmaker (" + testo + ")"
    return False, "in ombra: non migliora abbastanza la media dei bookmaker (" + testo + ")"


def misura_archivio(percorso, quota_prova=0.3):
    """Archivio Football-Data: Pinnacle, media e Bet365 prima della chiusura e alla chiusura, su partite mai viste.
    Il peso di Pinnacle nella miscela con la media si impara sul 70% piu vecchio e si prova sul 30% piu recente."""
    import numpy as np
    from datetime import datetime

    def tri(r, p):
        q = [_num(r.get(p + x)) for x in "HDA"]
        return q if all(x and x > 1 for x in q) else None

    def due(r, a, b):
        q = [_num(r.get(a)), _num(r.get(b))]
        return q if all(x and x > 1 for x in q) else None

    righe = []
    with gzip.open(percorso, "rt", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            hg, ag = _num(r.get("FTHG")), _num(r.get("FTAG"))
            if hg is None or ag is None:
                continue
            try:
                d = datetime.strptime(r["Date"], "%d/%m/%Y" if len(r["Date"]) > 8 else "%d/%m/%y").date().isoformat()
            except (KeyError, ValueError):
                continue
            q = {"PS": tri(r, "PS"), "AV": tri(r, "Avg") or tri(r, "BbAv"), "B3": tri(r, "B365"), "PSC": tri(r, "PSC"), "AVC": tri(r, "AvgC"),
                 "Po": due(r, "P>2.5", "P<2.5"), "Ao": due(r, "Avg>2.5", "Avg<2.5") or due(r, "BbAv>2.5", "BbAv<2.5")}
            if q["PS"] and q["AV"]:
                righe.append((d, 0 if hg > ag else 1 if hg == ag else 2, int(hg + ag > 2.5), q))
    righe.sort(key=lambda x: x[0])
    n = len(righe)
    if n < 2000:
        return {"partite": n, "motivo": "archivio troppo piccolo"}
    taglio = int(n * (1 - quota_prova))
    y = np.array([x[1] for x in righe])

    def margine_np(q):
        inv = 1 / np.asarray(q, float)
        k = np.ones(len(inv))
        for _ in range(30):
            s = (inv ** k[:, None]).sum(1)
            k -= (s - 1) / (np.log(inv) * inv ** k[:, None]).sum(1)
        p = inv ** k[:, None]
        return p / p.sum(1, keepdims=True)

    def prob(chiave, sub):
        return margine_np([righe[i][3][chiave] for i in sub])

    def ll(P, yy):
        return float(-np.log(np.clip(P[np.arange(len(yy)), yy], 1e-9, 1)).mean())

    def mix(w, A, B):
        z = w * np.log(A) + (1 - w) * np.log(B)
        p = np.exp(z - z.max(1, keepdims=True))
        return p / p.sum(1, keepdims=True)

    tutti = list(range(n))
    PS, AV = prob("PS", tutti), prob("AV", tutti)
    ws = [round(0.05 * k, 2) for k in range(21)]
    w = min(ws, key=lambda w: ll(mix(w, PS[:taglio], AV[:taglio]), y[:taglio]))
    te = slice(taglio, n)
    l_av, l_ps, l_mx = ll(AV[te], y[te]), ll(PS[te], y[te]), ll(mix(w, PS[te], AV[te]), y[te])
    out = {"partite": n, "prova": n - taglio, "dal": righe[taglio][0], "peso_pinnacle": w,
           "errore": {"media": round(l_av, 5), "pinnacle": round(l_ps, 5), "miscela": round(l_mx, 5)},
           "guadagno_miscela": round(100 * (l_av - l_mx) / l_av, 3), "guadagno_pinnacle": round(100 * (l_av - l_ps) / l_av, 3)}
    b3 = [i for i in range(taglio, n) if righe[i][3]["B3"]]
    if b3:
        out["errore"]["bet365"] = round(ll(prob("B3", b3), y[b3]), 5)
        out["errore"]["media_stesse_bet365"] = round(ll(prob("AV", b3), y[b3]), 5)
    ch = [i for i in range(taglio, n) if righe[i][3]["PSC"] and righe[i][3]["AVC"]]
    if ch:
        lc = ll(prob("AVC", ch), y[ch])
        out["chiusura"] = {"n": len(ch), "media_prima": round(ll(prob("AV", ch), y[ch]), 5), "media_chiusura": round(lc, 5),
                           "pinnacle_chiusura": round(ll(prob("PSC", ch), y[ch]), 5)}
        out["chiusura"]["guadagno_tempo"] = round(100 * (out["chiusura"]["media_prima"] - lc) / out["chiusura"]["media_prima"], 3)
    ou = [i for i in tutti if righe[i][3]["Po"] and righe[i][3]["Ao"]]
    if len(ou) > 2000:
        t2 = int(len(ou) * (1 - quota_prova))
        po = margine_np([righe[i][3]["Po"] for i in ou])[:, 0]
        ao = margine_np([righe[i][3]["Ao"] for i in ou])[:, 0]
        yo = np.array([righe[i][2] for i in ou])

        def l2(p, yy):
            p = np.clip(p, 1e-9, 1 - 1e-9)
            return float(-(yy * np.log(p) + (1 - yy) * np.log(1 - p)).mean())

        def m2(w, a, b):
            la, lb = w * np.log(a) + (1 - w) * np.log(b), w * np.log(1 - a) + (1 - w) * np.log(1 - b)
            return 1 / (1 + np.exp(lb - la))
        wo = min(ws, key=lambda w: l2(m2(w, po[:t2], ao[:t2]), yo[:t2]))
        a, mx = l2(ao[t2:], yo[t2:]), l2(m2(wo, po[t2:], ao[t2:]), yo[t2:])
        out["ou"] = {"prova": len(ou) - t2, "peso_pinnacle": wo, "media": round(a, 5), "miscela": round(mx, 5), "guadagno_miscela": round(100 * (a - mx) / a, 3)}
    g = out["guadagno_miscela"]
    out["motivo"] = (f"sull'archivio la miscela con Pinnacle (peso {w}) migliora la media del {g:+.3f}% su {n - taglio} partite mai viste"
                     + (f"; alla chiusura le quote migliorano del {out['chiusura']['guadagno_tempo']:+.3f}%" if ch else "")).replace(".", ",")
    return out
