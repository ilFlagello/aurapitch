"""AuraPitch - misura del vantaggio sul mercato (quota al consiglio contro quota al fischio).

Ogni consiglio si blocca 45 minuti prima del calcio d'inizio con la sua quota (qB). Fino al fischio la raccolta continua a
leggere la quota dello stesso esito (qF, l'ultima vista prima del calcio d'inizio, "quota di chiusura"). Se la quota e scesa
(qB > qF) il mercato si e mosso VERSO il consiglio: chi ha giocato al blocco ha preso una quota migliore di quella finale.
E la prova piu veloce del vantaggio: non serve aspettare centinaia di risultati, perche le quote di chiusura sono le piu
precise che esistano (studio di ottobre). Se i consigli in cui lavorano gli specialisti (formazioni, ultima ora, movimento...)
non vedono il mercato muoversi verso di loro piu degli altri, quegli specialisti non aggiungono nulla alle quote.

Si misurano solo le quote vere dei bookmaker (qm), mai quelle calcolate dall'IA. Movimento = qB / qF - 1
(+3% = la quota e scesa del 3% dopo il consiglio). Solo libreria standard.
Usato da: genera_app.py (registra qF e scrive il riassunto pubblico), strumenti/revisore.py (soglie di avviso),
strumenti/riepilogo.py."""
import json
import math
import os
from datetime import datetime, timedelta, timezone

MOSSO = 0.005          # sotto lo 0,5% la quota si considera ferma
MIN_TOTALE = 50        # consigli misurati prima di giudicare
MIN_GRUPPO = 30        # consigli in un gruppo (stile, mercato, specialista) prima di giudicarlo
FORMAZIONI = "formazioni"
NOMI_GRUPPI = {FORMAZIONI: "formazioni ufficiali", "ultima_ora": "notizie dell'ultima ora", "movimento": "movimento delle quote",
               "consenso": "consenso della community", "coppe": "coppe e turnover"}
OUT = os.path.join("app", "data", "vantaggio.json")


def mercato_di(c):
    """Famiglia di mercato di un codice di consiglio, in parole semplici."""
    c = str(c or "")
    if c.startswith(("T1:", "T2:", "T1", "T2", "PF", "TPG", "HSET", "ASET", "HVET", "AVET")):
        return "Tempi"
    if "+" in c:
        return "Combo"
    if c in ("1", "X", "2"):
        return "Esito finale"
    if c in ("1X", "X2", "12"):
        return "Doppia chance"
    if c[:1] in ("O", "U") and c[1:2].isdigit():
        return "Under/Over"
    if c in ("GG", "NG"):
        return "Gol/No gol"
    if c.startswith("MG"):
        return "Multigol"
    if c.startswith(("H", "A")):
        return "Gol di una squadra"
    return "Altro"


def _data(s):
    try:
        d = datetime.fromisoformat(str(s).replace("Z", "+00:00"))
        return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
    except (TypeError, ValueError):
        return None


def quota_attuale(m, c):
    """Quota vera dei bookmaker (non calcolata) dell'esito c nella partita m, o None."""
    for x in m.get("markets") or []:
        if len(x) >= 4 and x[0] == c and x[3] and x[2] and x[2] > 1:
            return float(x[2])
    return None


def specialisti_attivi(m, nomi):
    """Nomi degli specialisti che al momento del blocco avevano qualcosa da dire su questa partita (valore non nullo e non zero),
    piu "formazioni" se c'erano le formazioni ufficiali."""
    out = [n for n, v in zip(nomi, m.get("sp") or []) if isinstance(v, (int, float)) and abs(v) > 1e-9]
    if any(m.get("uff") or []):
        out.append(FORMAZIONI)
    return out


def registra_chiusura(r, m, ora):
    """Aggiorna la quota di chiusura (qF) dei consigli bloccati della partita m, finche la partita non e iniziata.
    Restituisce il numero di quote aggiornate."""
    if not r.get("tB") or r.get("tardivo") or m.get("st") != "NS":
        return 0
    ko = _data(m.get("ko"))
    if not ko or ora >= ko:
        return 0
    n = 0
    for v in (r.get("tips") or {}).values():
        if not isinstance(v, dict) or not v.get("qm"):
            continue
        q = quota_attuale(m, v.get("c"))
        if q and v.get("qF") != q:
            v["qF"] = q
            n += 1
    if n:
        r["tF"] = ora.isoformat(timespec="minutes")
    return n


def voci(consigli, dal=None):
    """Una voce per ogni consiglio misurabile: stile, mercato, specialisti, movimento."""
    out = []
    for mid, r in consigli.items():
        if r.get("tardivo") or not r.get("tB") or (dal and r.get("date", "") < dal):
            continue
        ko, tf = _data(r.get("ko")), _data(r.get("tF"))
        if ko and tf and tf > ko:
            continue
        for stile, v in (r.get("tips") or {}).items():
            if not isinstance(v, dict) or not v.get("qm"):
                continue
            q, qf = v.get("q"), v.get("qF")
            if not (isinstance(q, (int, float)) and isinstance(qf, (int, float)) and q > 1 and qf > 1):
                continue
            esito = (r.get("esiti") or {}).get(stile)
            out.append({"id": mid, "lg": r.get("lg"), "stile": stile, "mercato": mercato_di(v.get("c")), "sp": list(r.get("spB") or []),
                        "mov": q / qf - 1, "p": v.get("p"), "q": q, "esito": esito})
    return out


def riassunto(vv):
    """Quanti consigli, quante volte il mercato si e mosso verso / contro, movimento medio (in %) con margine statistico."""
    n = len(vv)
    if not n:
        return {"n": 0}
    movs = [v["mov"] for v in vv]
    media = sum(movs) / n
    var = sum((x - media) ** 2 for x in movs) / max(1, n - 1)
    verso = sum(1 for x in movs if x > MOSSO)
    contro = sum(1 for x in movs if x < -MOSSO)
    return {"n": n, "verso": verso, "contro": contro, "fermi": n - verso - contro, "medio": round(100 * media, 2),
            "margine": round(100 * 2 * math.sqrt(var / n), 2)}


def misura(consigli, dal=None, nomi_specialisti=()):
    """Il quadro completo: totale, per stile (consiglio / prudente / coraggiosa), per mercato, per specialista attivo
    (con il confronto con i consigli senza nessuno specialista attivo)."""
    vv = voci(consigli, dal)
    out = {"totale": riassunto(vv), "per_stile": {}, "per_mercato": {}, "per_specialista": {}, "senza_specialisti": riassunto([v for v in vv if not v["sp"]])}
    for chiave, campo in (("per_stile", "stile"), ("per_mercato", "mercato")):
        for g in sorted({v[campo] for v in vv}):
            out[chiave][g] = riassunto([v for v in vv if v[campo] == g])
    for s in sorted({s for v in vv for s in v["sp"]}):
        out["per_specialista"][s] = riassunto([v for v in vv if s in v["sp"]])
    return out


def nome(g):
    return NOMI_GRUPPI.get(g, g.replace("_", " "))


def giudizio(mi):
    """Avvisi in parole semplici per il revisore: (problemi, attenzione, note)."""
    problemi, attenzione, note = [], [], []
    t = mi.get("totale") or {}
    if t.get("n", 0) < MIN_TOTALE:
        note.append(f"Vantaggio sul mercato: servono almeno {MIN_TOTALE} consigli con la quota di chiusura (ora {t.get('n', 0)})")
        return problemi, attenzione, note
    testo = (f"Vantaggio sul mercato ({t['n']} consigli): dopo il consiglio la quota è scesa {t['verso']} volte e salita {t['contro']}, "
             f"movimento medio {t['medio']:+.1f}% (±{t['margine']:.1f})").replace(".", ",")
    if t["medio"] + t["margine"] < -1.5 and t["n"] >= 2 * MIN_TOTALE:
        problemi.append(testo + ": il mercato va contro i consigli, l'IA consiglia quote che poi salgono")
    elif t["medio"] < -0.5:
        attenzione.append(testo + ": il mercato tende ad andare contro i consigli")
    else:
        note.append(testo)
    base = mi.get("senza_specialisti") or {}
    for s, r in (mi.get("per_specialista") or {}).items():
        if r.get("n", 0) < MIN_GRUPPO:
            continue
        rif = base.get("medio") if base.get("n", 0) >= MIN_GRUPPO else t["medio"]
        diff = r["medio"] - rif
        riga = f"Specialista \"{nome(s)}\": movimento medio {r['medio']:+.1f}% su {r['n']} consigli, {diff:+.1f} punti rispetto ai consigli senza specialisti".replace(".", ",")
        if diff < -1.0 and r["medio"] < 0:
            attenzione.append(riga + ": non aggiunge niente alle quote")
        else:
            note.append(riga)
    for g, r in (mi.get("per_stile") or {}).items():
        if r.get("n", 0) >= MIN_GRUPPO:
            note.append(f"Vantaggio per stile \"{g}\": {r['medio']:+.1f}% ({r['verso']} verso, {r['contro']} contro, {r['n']} consigli)".replace(".", ","))
    return problemi, attenzione, note


def scrivi_pubblico(consigli, nomi_specialisti=(), path=OUT, ora=None):
    """Riassunto pubblico (solo numeri, nessun identificativo) per la pagina dell'algoritmo: ultimi 30 giorni."""
    ora = ora or datetime.now(timezone.utc)
    mi = misura(consigli, dal=(ora - timedelta(days=30)).date().isoformat(), nomi_specialisti=nomi_specialisti)
    out = {"generato": ora.isoformat(timespec="minutes"), "giorni": 30, **mi, "nomi": {k: nome(k) for k in mi["per_specialista"]}}
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    return out
