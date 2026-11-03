"""AuraPitch - salvadanaio delle fonti a consumo: usare bene i crediti, senza restare a secco a meta mese.

Fonti con un limite (le altre, ESPN, football-data.co.uk, Google News, Open-Meteo, sono libere):
- The Odds API: 500 crediti al MESE (si azzerano il 1° del mese, verificato nello storico di data/crediti_quote.json).
  Ogni giorno riceve una parte dei crediti rimasti, divisa sui giorni che mancano a fine mese e pesata per quante partite
  ci sono di solito quel giorno (sabato e domenica di piu). Quello che un giorno non spende passa ai giorni dopo.
  Il giro del mattino ha la precedenza: finche non e passato, le fotografie pre-partita non possono toccare la sua parte.
- API-Football: 100 richieste al GIORNO (si azzerano a mezzanotte UTC), divise tra i lavori: infortuni, partite del giorno,
  formazioni. Ogni lavoro ha il suo tetto, cosi nessuno lascia a secco gli altri; resta sempre una piccola riserva.
Quando i crediti di una fonte non bastano, si usa la fonte gratuita (quote ESPN, formazioni ESPN): le partite si aggiornano sempre.
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

def quota_odds_giorno(rimasti, giorno):
    """Crediti che il giorno puo spendere: i rimasti (meno la riserva) divisi sui giorni fino a fine mese, pesati per giorno."""
    ultimo = calendar.monthrange(giorno.year, giorno.month)[1]
    pesi = [PESI_GIORNO[date(giorno.year, giorno.month, g).weekday()] for g in range(giorno.day, ultimo + 1)]
    return max(0, int((rimasti - ODDS_RISERVA) * pesi[0] / sum(pesi)))


def _odds_oggi(d, rimasti=None):
    o = d.setdefault("odds", {})
    oggi = _ora().date()
    if o.get("giorno") != oggi.isoformat():
        base = rimasti if rimasti is not None else o.get("rimasti")
        o.update({"giorno": oggi.isoformat(), "inizio": base, "quota": quota_odds_giorno(base, oggi) if base is not None else None,
                  "spesi": {}, "mattino_fatto": False})
    elif o.get("quota") is None and rimasti is not None:
        o.update({"inizio": rimasti, "quota": quota_odds_giorno(rimasti, oggi)})
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


def riassunto():
    d = carica()
    o, a = d.get("odds") or {}, d.get("af") or {}
    return (f"The Odds API: oggi {sum((o.get('spesi') or {}).values())}/{o.get('quota')} crediti, rimasti nel mese {o.get('rimasti')}; "
            f"API-Football: oggi {sum((a.get('usate') or {}).values())} richieste {a.get('usate')}, rimaste {a.get('rimaste')}")


if __name__ == "__main__":
    print(riassunto())
