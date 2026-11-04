"""AuraPitch - probabilita 1X2 stimate dall'IA per i campionati e le coppe SENZA quote (punto 4 del 4/11).

Senza quote dei bookmaker l'algoritmo non ha la sua materia prima. Qui c'e solo una stima, detta chiaramente:
 - forza delle squadre dalla classifica: gol fatti e subiti a partita rispetto alla media del campionato, con prudenza
   (ogni squadra parte da K partite "nella media", cosi a inizio stagione la stima resta vicina al 33/33/33);
 - gol attesi = media del campionato x attacco x difesa avversaria, con il vantaggio del campo;
 - modello dei gol (Poisson con la correzione Dixon-Coles di mercati.py) -> 1, X, 2.
Coppe: solo se le due squadre stanno nella stessa classifica (stessa categoria); altrimenti nessuna stima.
Mai consiglio, mai schedina, mai nello storico dei consigli: le stime vanno solo in data/stime_senza_quote.json, dove il
revisore ne misura l'onesta man mano che arrivano i risultati. Solo libreria standard."""
import json
import math
import os
from datetime import datetime, timedelta, timezone

import mercati as M

K = 5                 # partite "nella media" aggiunte a ogni squadra (prudenza)
MIN_PG = 3            # partite giocate da entrambe prima di stimare
CASA = 1.12           # vantaggio del campo sui gol attesi (casa x CASA, ospite / CASA)
GIORNI = 120          # memoria delle stime per il revisore
PATH = os.path.join("data", "stime_senza_quote.json")
BASE = (0.45, 0.27, 0.28)  # riferimento ingenuo: frequenze medie di 1, X, 2 nel calcio


def _piega(x):
    import unicodedata
    return unicodedata.normalize("NFD", x or "").encode("ascii", "ignore").decode().lower().strip()


def forze(classifica):
    """{squadra piegata: (attacco, difesa, partite)} e gol medi a squadra per partita, da una classifica generale."""
    righe = [r for r in classifica or [] if r.get("pg")]
    pg = sum(r["pg"] for r in righe)
    if not righe or pg < 10:
        return {}, None
    mu = sum(r["gf"] for r in righe) / pg
    if mu <= 0:
        return {}, None
    out = {}
    for r in righe:
        att = (r["gf"] + K * mu) / ((r["pg"] + K) * mu)
        dif = (r["gs"] + K * mu) / ((r["pg"] + K) * mu)
        out[_piega(r["team"])] = (att, dif, r["pg"])
    return out, mu


def probabilita(lh, la):
    m = M.matrice(lh, la)
    p1 = sum(m[i][j] for i in range(len(m)) for j in range(len(m)) if i > j)
    px = sum(m[i][i] for i in range(len(m)))
    return [round(p1, 4), round(px, 4), round(max(0.0, 1 - p1 - px), 4)]


def stima(h, a, tabelle):
    """Probabilita [1, X, 2] e gol attesi, dalla prima classifica che contiene entrambe le squadre. None se non si puo."""
    kh, ka = _piega(h), _piega(a)
    for nome, (fz, mu) in tabelle:
        if kh in fz and ka in fz and min(fz[kh][2], fz[ka][2]) >= MIN_PG:
            lh = mu * fz[kh][0] * fz[ka][1] * CASA
            la = mu * fz[ka][0] * fz[kh][1] / CASA
            return {"p": probabilita(lh, la), "xg": [round(lh, 2), round(la, 2)], "da": nome}
    return None


def aggiungi_stime(partite, classifiche, ora=None, path=PATH, archivio=None):
    """Mette "pia" (stima dell'IA) nelle partite senza quote e aggiorna il registro delle stime: la stima si fissa fino al
    calcio d'inizio, il risultato si aggiunge a fine partita. classifiche = {campionato: {"generale": [...]}}.
    Restituisce il numero di partite con una stima."""
    ora = ora or datetime.now(timezone.utc)
    tab = {}
    for k, v in (classifiche or {}).items():
        fz, mu = forze((v or {}).get("generale"))
        if fz:
            tab[k] = (fz, mu)
    try:
        with open(path, encoding="utf-8") as f:
            reg = json.load(f)
    except (OSError, ValueError):
        reg = {}
    for eid, x in (archivio or {}).items():  # risultati dall'archivio dei senza quote (anche partite uscite dai giorni dell'app)
        if eid in reg and "g" not in reg[eid] and isinstance(x.get("g"), list):
            reg[eid]["g"] = x["g"]
    n = 0
    for m in partite:
        # prima la classifica del campionato stesso; per le coppe tutte le classifiche (le due squadre nella stessa)
        ordine = [(m["lg"], tab[m["lg"]])] if m["lg"] in tab else []
        ordine += [(k, v) for k, v in tab.items() if k != m["lg"]]
        chiave = str(m.get("eid") or m.get("id"))
        r = reg.get(chiave)
        try:
            ko = datetime.fromisoformat(m["ko"])
        except (KeyError, TypeError, ValueError):
            continue
        if ora < ko and m.get("st") == "NS":
            s = stima(m["h"], m["a"], ordine)
            if s:
                m["pia"], m["xia"] = s["p"], s["xg"]
                reg[chiave] = {"lg": m["lg"], "t": m["ko"], "h": m["h"], "a": m["a"], "p": s["p"], "da": s["da"], "agg": ora.isoformat(timespec="minutes"),
                               **({"pq": m["pq"]} if m.get("pq") else {})}
                n += 1
        elif r:  # partita iniziata o finita: la stima resta quella fissata prima del fischio
            m["pia"] = r["p"]
            if m.get("st") == "FT" and m.get("g"):
                r["g"] = m["g"]
            n += 1
    limite = (ora - timedelta(days=GIORNI)).isoformat()
    reg = {k: v for k, v in reg.items() if v.get("t", "") >= limite}
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:  # una partita per riga: git conserva solo le righe cambiate
        f.write("{\n" + ",\n".join(json.dumps(k) + ":" + json.dumps(reg[k], ensure_ascii=False, separators=(",", ":")) for k in sorted(reg, key=lambda k: (reg[k]["t"], k))) + "\n}\n")
    return n


def valuta(reg):
    """Onesta delle stime a partite finite: errore medio (log-loss) dell'IA, del riferimento ingenuo (BASE) e, dove c'erano,
    delle quote DraftKings; scarto per fasce (al netto del caso)."""
    fin = [v for v in (reg or {}).values() if isinstance(v.get("g"), list) and len(v["g"]) == 2 and v.get("p")]
    if not fin:
        return {"n": 0}
    ll = lb = 0.0
    lq, nq = 0.0, 0
    fasce = {}
    for v in fin:
        k = 0 if v["g"][0] > v["g"][1] else 1 if v["g"][0] == v["g"][1] else 2
        ll += -math.log(max(1e-6, v["p"][k]))
        lb += -math.log(BASE[k])
        if v.get("pq"):
            lq += -math.log(max(1e-6, v["pq"][k]))
            nq += 1
        for j in range(3):
            p, y = v["p"][j], int(j == k)
            if p < 0.5:
                p, y = 1 - p, 1 - y
            s = fasce.setdefault(min(9, int(p * 10)), [0.0, 0.0, 0])
            s[0] += y - p
            s[1] += p * (1 - p)
            s[2] += 1
    tot = sum(s[2] for s in fasce.values())
    eccesso = sum(max(0.0, abs(d) - math.sqrt(2 / math.pi * var)) for d, var, _ in fasce.values())
    n = len(fin)
    return {"n": n, "ia": round(ll / n, 4), "base": round(lb / n, 4), "quote": round(lq / nq, 4) if nq else None, "n_quote": nq,
            "scarto": round(100 * eccesso / tot, 2) if tot else None}
