"""AuraPitch - salvadanaio delle fonti a consumo: usare bene i crediti, senza restare a secco a meta mese.

Fonti con un limite (le altre, ESPN, football-data.co.uk, Google News, Open-Meteo, sono libere):
- The Odds API: 500 crediti al MESE (si azzerano il 1° del mese, verificato nello storico di data/crediti_quote.json).
  Ogni giorno riceve una parte dei crediti rimasti, divisa sui giorni che mancano a fine mese e pesata per quante partite
  ci sono di solito quel giorno (sabato e domenica di piu). Quello che un giorno non spende passa ai giorni dopo.
  Il giro del mattino ha la precedenza: finche non e passato, le fotografie pre-partita non possono toccare la sua parte.
- API-Football: 100 richieste al GIORNO (si azzerano a mezzanotte UTC), divise tra i lavori: infortuni, partite del giorno,
  formazioni. Ogni lavoro ha il suo tetto, cosi nessuno lascia a secco gli altri; resta sempre una piccola riserva.
Quando i crediti di una fonte non bastano, si usa la fonte gratuita (quote ESPN, formazioni ESPN): le partite si aggiornano sempre.
Dal 4/11: la parte di ogni giorno segue il calendario vero (elenco eventi di The Odds API, gratuito): quanto costano le
fotografie al blocco del consiglio (una chiamata per campionato e fascia di calcio d'inizio) e il giro del mattino dei
campionati che giocano. Le fotografie al blocco hanno la precedenza sul mattino (l'ora delle quote conta 13 volte piu del
bookmaker). "Economo": una sola tabella con usato, rimasto e previsione di tutte le fonti a consumo (economo()).
Registro: data/budget.json (solo conteggi). Solo libreria standard."""
import calendar
import json
import os
from datetime import date, datetime, timezone

PATH = os.path.join("data", "budget.json")

ODDS_MESE = 500
ODDS_RISERVA = 10           # crediti da non toccare mai (imprevisti di fine mese)
ODDS_RISERVA_MATTINO = 12   # parte del giorno tenuta per il giro del mattino finche non e passato
# peso dei giorni della settimana (lunedi = 0): di sabato e domenica si gioca di piu, a meta settimana ci sono le coppe
PESI_GIORNO = {0: 0.8, 1: 1.2, 2: 1.2, 3: 1.2, 4: 0.8, 5: 2.0, 6: 2.0}

AF_GIORNO = 100
AF_RISERVA = 5
AF_TETTI = {"partite": 6, "infortuni": 64, "formazioni": 25}  # + 5 di riserva = 100


def _ora():
    return datetime.now(timezone.utc)


def carica():
    try:
        with open(PATH, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def salva(d):
    os.makedirs(os.path.dirname(PATH), exist_ok=True)
    with open(PATH, "w", encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False, indent=1)


# ---------- The Odds API (mese) ----------

ODDS_CHIAMATA = 2           # crediti di una chiamata (h2h + totals, area eu)
FASCIA_MIN = 20             # partite dello stesso campionato a meno di 20 minuti: una sola fotografia al blocco


def costo_giorno(v):
    """Crediti che servono in un giorno del calendario: una chiamata per fascia (blocco) e una per campionato (mattino)."""
    return ODDS_CHIAMATA * ((v or {}).get("fasce", 0) + (v or {}).get("leghe", 0))


def quota_odds_giorno(rimasti, giorno, cal=None):
    """Crediti che il giorno puo spendere: i rimasti (meno la riserva) divisi sui giorni fino a fine mese, in proporzione a
    quanto costa ogni giorno secondo il calendario (cal: {"AAAA-MM-GG": {"fasce", "leghe"}}). I giorni che il calendario non
    copre ancora valgono il costo medio dei giorni noti, pesato per giorno della settimana (sabato e domenica di piu).
    Senza calendario: solo i pesi della settimana (come prima)."""
    ultimo = calendar.monthrange(giorno.year, giorno.month)[1]
    giorni = [date(giorno.year, giorno.month, g) for g in range(giorno.day, ultimo + 1)]
    pesi = [PESI_GIORNO[g.weekday()] for g in giorni]
    noti = [(i, costo_giorno(cal[g.isoformat()])) for i, g in enumerate(giorni) if cal and g.isoformat() in cal]
    if noti and sum(c for _, c in noti) > 0:
        scala = sum(c for _, c in noti) / sum(pesi[i] for i, _ in noti)
        pesi = [p * scala for p in pesi]
    for i, c in noti:  # giorno noto senza partite nei campionati con crediti: nessun credito (restano ai giorni dopo)
        pesi[i] = c
    if sum(pesi) <= 0:
        return 0
    return max(0, int((rimasti - ODDS_RISERVA) * pesi[0] / sum(pesi)))


def calendario_da_eventi(eventi, fascia_min=FASCIA_MIN):
    """Calendario dei costi da {campionato: [eventi di The Odds API]}: per ogni giorno (UTC) le fasce di calcio d'inizio
    (partite dello stesso campionato a meno di fascia_min minuti l'una dall'altra = una fascia) e i campionati che giocano."""
    per = {}
    for lega, evs in (eventi or {}).items():
        orari = {}
        for e in evs or []:
            try:
                t = datetime.fromisoformat(str(e["commence_time"]).replace("Z", "+00:00"))
            except (KeyError, ValueError):
                continue
            orari.setdefault(t.date().isoformat(), []).append(t)
        for g, ts in orari.items():
            ts.sort()
            fasce = 1 + sum(1 for a, b in zip(ts, ts[1:]) if (b - a).total_seconds() > fascia_min * 60)
            v = per.setdefault(g, {"fasce": 0, "leghe": 0})
            v["fasce"] += fasce
            v["leghe"] += 1
    return dict(sorted(per.items()))


def odds_calendario(cal):
    """Salva il calendario dei costi (si tengono solo i giorni da oggi in poi)."""
    d = carica()
    o = d.setdefault("odds", {})
    oggi = _ora().date().isoformat()
    vecchio = {g: v for g, v in (o.get("calendario") or {}).items() if g >= oggi}
    vecchio.update({g: v for g, v in (cal or {}).items() if g >= oggi})
    o["calendario"] = dict(sorted(vecchio.items()))
    if o.get("giorno") == oggi and o.get("inizio") is not None:  # la parte di oggi si ricalcola con il calendario vero
        o["quota"] = quota_odds_giorno(o["inizio"], _ora().date(), o["calendario"])
    salva(d)


def _odds_oggi(d, rimasti=None):
    o = d.setdefault("odds", {})
    oggi = _ora().date()
    if o.get("giorno") != oggi.isoformat():
        base = rimasti if rimasti is not None else o.get("rimasti")
        o.update({"giorno": oggi.isoformat(), "inizio": base, "quota": quota_odds_giorno(base, oggi, o.get("calendario")) if base is not None else None,
                  "spesi": {}, "mattino_fatto": False})
    elif o.get("quota") is None and rimasti is not None:
        o.update({"inizio": rimasti, "quota": quota_odds_giorno(rimasti, oggi, o.get("calendario"))})
    if rimasti is not None:
        o["rimasti"] = rimasti
    return o


def odds_puo(cat, costo, rimasti=None):
    """Si puo spendere 'costo' crediti per il lavoro 'cat' ("mattino" o "prepartita")?"""
    d = carica()
    o = _odds_oggi(d, rimasti)
    salva(d)
    if o.get("quota") is None:
        return True  # crediti ancora sconosciuti: la prima chiamata li fa conoscere (dalle intestazioni)
    if (o.get("rimasti") or 0) - costo < ODDS_RISERVA:
        return False
    spesi = sum(o["spesi"].values())
    limite = o["quota"]
    if cat != "mattino" and not o.get("mattino_fatto"):
        limite -= min(ODDS_RISERVA_MATTINO, o["quota"] // 2)
    fasce = ((o.get("calendario") or {}).get(o["giorno"]) or {}).get("fasce")
    if cat == "mattino" and fasce:  # le fotografie al blocco di oggi hanno la precedenza: il mattino lascia loro i crediti
        limite -= min(ODDS_CHIAMATA * fasce, max(0, o["quota"] - ODDS_CHIAMATA))  # (ma almeno un campionato al mattino)
    return spesi + costo <= limite


def odds_spesa(cat, costo, rimasti=None):
    d = carica()
    o = _odds_oggi(d, rimasti)
    o["spesi"][cat] = o["spesi"].get(cat, 0) + costo
    salva(d)


def odds_mattino_fatto():
    d = carica()
    _odds_oggi(d)["mattino_fatto"] = True
    salva(d)


def odds_ultima(lega):
    """Data dell'ultima fotografia del mattino di un campionato (per i campionati senza partite vicine: una ogni 2 giorni)."""
    return ((carica().get("odds") or {}).get("ultime") or {}).get(lega)


def odds_segna_lega(lega):
    d = carica()
    d.setdefault("odds", {}).setdefault("ultime", {})[lega] = _ora().date().isoformat()
    salva(d)


# ---------- API-Football (giorno) ----------

def _af_oggi(d):
    a = d.setdefault("af", {})
    oggi = _ora().date().isoformat()
    if a.get("giorno") != oggi:
        a.update({"giorno": oggi, "usate": {}, "rimaste": None})
    return a


def af_puo(cat, costo=1):
    """Si puo fare una richiesta API-Football per il lavoro 'cat'? Tetto del lavoro + riserva + richieste rimaste davvero."""
    d = carica()
    a = _af_oggi(d)
    salva(d)
    usate = a["usate"]
    if a.get("rimaste") is not None and a["rimaste"] - costo < AF_RISERVA:
        return False
    if sum(usate.values()) + costo > AF_GIORNO - AF_RISERVA:
        return False
    tetto = AF_TETTI.get(cat, 0)
    # dal pomeriggio quello che il mattino non ha usato per le partite passa a infortuni e formazioni
    if cat != "partite" and _ora().hour >= 12:
        tetto += max(0, AF_TETTI["partite"] - usate.get("partite", 0)) // 2
    return usate.get(cat, 0) + costo <= tetto


def af_spesa(cat, rimaste=None, costo=1):
    d = carica()
    a = _af_oggi(d)
    a["usate"][cat] = a["usate"].get(cat, 0) + costo
    if rimaste is not None:
        a["rimaste"] = rimaste
    salva(d)


ODDS_MATTINO = 14  # crediti di un giro del mattino (quote di tutti i campionati con partite vicine): il minimo da garantire ogni giorno


def previsione(oggi=None, rimasti=None):
    """Bastano i crediti di The Odds API fino a fine mese? Il salvadanaio divide i rimasti sui giorni che mancano, quindi non
    restano mai a zero: il rischio vero e che la parte di ogni giorno scenda sotto il costo del giro del mattino (allora le
    partite si aggiornano solo con le quote gratuite). Usa il registro (data/budget.json) e, se manca, i crediti rimasti.
    Restituisce {"rimasti", "per_giorno" (crediti disponibili per ogni giorno che manca), "ritmo" (spesa media del mese finora),
    "giorni", "fino_al" (giorno in cui finirebbero al ritmo del mese, solo informazione), "oltre" (oggi spesi oltre la quota), "basta"}."""
    oggi = oggi or _ora().date()
    o = carica().get("odds") or {}
    if rimasti is None:
        rimasti = o.get("rimasti")
    if rimasti is None:
        return None
    ultimo = calendar.monthrange(oggi.year, oggi.month)[1]
    giorni = max(1, ultimo - oggi.day)  # i giorni dopo oggi (la parte di oggi e gia assegnata), come il vecchio controllo orario
    disponibili = max(0, rimasti - ODDS_RISERVA)
    per_giorno = disponibili / giorni
    ritmo = max(0, ODDS_MESE - rimasti) / max(1, oggi.day)
    fino_al = oggi.day + int(disponibili / ritmo) if ritmo > 0 and disponibili / ritmo < giorni else None
    di_oggi = {"quota": o.get("quota"), "spesi": sum((o.get("spesi") or {}).values())} if o.get("giorno") == oggi.isoformat() else None
    oltre = bool(di_oggi and di_oggi["quota"] is not None and di_oggi["spesi"] > di_oggi["quota"] + ODDS_MATTINO)
    return {"rimasti": rimasti, "per_giorno": round(per_giorno, 1), "ritmo": round(ritmo, 1), "giorni": giorni, "fino_al": fino_al,
            "oggi": di_oggi, "oltre": oltre, "basta": per_giorno >= ODDS_MATTINO and not oltre}


# ---------- football-data.org (10 richieste al minuto, nessun limite giornaliero) ----------

FD_MINUTO = 10


def fd_spesa():
    """Conta le richieste a football-data.org del giorno (il limite e al minuto: raccoglitore.fd aspetta 6,5 secondi)."""
    d = carica()
    f = d.setdefault("fd", {})
    oggi = _ora().date().isoformat()
    if f.get("giorno") != oggi:
        f.update({"giorno": oggi, "usate": 0})
    f["usate"] += 1
    salva(d)


# ---------- economo: una sola tabella per tutte le fonti a consumo ----------

def economo(oggi=None, rimasti=None):
    """Tabella del budget di tutte le API: per ogni fonte limite, usato, rimasto, previsione e stato ("ok" o "attenzione").
    The Odds API: previsione a fine mese (crediti al giorno contro il costo medio dei giorni del calendario).
    API-Football: oggi contro le 100 richieste. football-data.org: richieste di oggi (limite al minuto, rispettato dal giro).
    Le altre fonti sono libere. Restituisce {"righe": [...], "avvisi": [...]}."""
    oggi = oggi or _ora().date()
    d = carica()
    righe, avvisi = [], []
    o = d.get("odds") or {}
    pv = previsione(oggi, rimasti)
    if pv:
        futuri = [costo_giorno(v) for g, v in (o.get("calendario") or {}).items() if g > oggi.isoformat()]
        bisogno = round(sum(futuri) / len(futuri), 1) if futuri else None
        copertura = min(1.0, pv["per_giorno"] / bisogno) if bisogno else None
        ok = pv["basta"] and (copertura is None or copertura >= 0.6)
        righe.append({"fonte": "The Odds API", "limite": f"{ODDS_MESE} crediti al mese", "usato": ODDS_MESE - pv["rimasti"], "rimasto": pv["rimasti"],
                      "previsione": f"{pv['per_giorno']} al giorno per {pv['giorni']} giorni" + (f", servirebbero {bisogno} (calendario)" if bisogno else ""),
                      "copertura": None if copertura is None else round(copertura, 2), "stato": "ok" if ok else "attenzione"})
        if not ok:
            avvisi.append(f"The Odds API: {pv['per_giorno']} crediti al giorno fino a fine mese"
                          + (f" contro {bisogno} che servirebbero per tutte le fotografie al blocco e il mattino" if bisogno else "")
                          + ": alcune partite avranno solo le quote gratuite ESPN")
    a = d.get("af") or {}
    if a.get("giorno") == oggi.isoformat():
        usate = sum((a.get("usate") or {}).values())
        ok = usate <= AF_GIORNO - AF_RISERVA
        righe.append({"fonte": "API-Football", "limite": f"{AF_GIORNO} richieste al giorno", "usato": usate, "rimasto": a.get("rimaste"),
                      "previsione": "per lavoro: " + ", ".join(f"{k} {v}/{AF_TETTI.get(k, '-')}" for k, v in sorted((a.get("usate") or {}).items())),
                      "stato": "ok" if ok else "attenzione"})
        if not ok:
            avvisi.append(f"API-Football: oggi {usate} richieste, oltre le {AF_GIORNO - AF_RISERVA} previste")
    f = d.get("fd") or {}
    if f.get("giorno") == oggi.isoformat():
        righe.append({"fonte": "football-data.org", "limite": f"{FD_MINUTO} richieste al minuto", "usato": f.get("usate", 0), "rimasto": None,
                      "previsione": "nessun limite giornaliero (il giro aspetta 6,5 secondi tra due richieste)", "stato": "ok"})
    righe.append({"fonte": "ESPN, Football-Data.co.uk, Google News, Open-Meteo", "limite": "libere", "usato": None, "rimasto": None,
                  "previsione": "-", "stato": "ok"})
    return {"righe": righe, "avvisi": avvisi}


def riga_economo(oggi=None, rimasti=None):
    """Una riga di testo per il riepilogo del lunedi."""
    e = economo(oggi, rimasti)
    pezzi = [f"{r['fonte']} {r['usato']} usati, {r['rimasto']} rimasti ({r['previsione']})" for r in e["righe"] if r["usato"] is not None]
    return ("Budget delle API: " + "; ".join(pezzi)).replace(".", ",") if pezzi else None


def riassunto():
    d = carica()
    o, a = d.get("odds") or {}, d.get("af") or {}
    return (f"The Odds API: oggi {sum((o.get('spesi') or {}).values())}/{o.get('quota')} crediti, rimasti nel mese {o.get('rimasti')}; "
            f"API-Football: oggi {sum((a.get('usate') or {}).values())} richieste {a.get('usate')}, rimaste {a.get('rimaste')}")


if __name__ == "__main__":
    print(riassunto())
