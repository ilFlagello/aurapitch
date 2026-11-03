"""AuraPitch - "IA contro mercato" (punto 5 del 3/11, per l'utente esperto).
Dal diario delle previsioni (salvate PRIMA del fischio): le partite in cui l'IA si e discostata dalle quote di almeno
SOGLIA sull'esito finale, e quante volte ha avuto ragione. "Ragione" = l'IA dava al risultato vero piu probabilita del
mercato. Si confronta anche l'errore (log-loss) di IA e quote sulle stesse partite. Nessun bookmaker, nessun invito a giocare.
Scrive app/data/ia_mercato.json: il registro degli ultimi 60 giorni (pubblico e verificabile, come lo storico dei consigli)
e il riassunto. Il diario in locale copre solo gli ultimi 10 giorni (cassaforte): il registro tiene la memoria piu lunga."""
import glob
import json
import math
import os
from datetime import datetime, timedelta, timezone

SOGLIA = 0.03  # 3 punti percentuali sull'esito finale
GIORNI = 60
FASCE = ((0.03, 0.05), (0.05, 0.08), (0.08, 1.0))
ESITI = ("1", "X", "2")
OUT = os.path.join("app", "data", "ia_mercato.json")
DIARIO = os.path.join("data", "diario")


def scarto(pc, mk):
    """Lo scarto piu grande tra IA e quote sull'esito finale: (scarto con segno, esito). None se mancano i numeri."""
    try:
        d = [(pc[c] - mk[i], c) for i, c in enumerate(ESITI)]
    except (KeyError, IndexError, TypeError):
        return None
    return max(d, key=lambda x: abs(x[0]))


def _data(s):
    try:
        return datetime.fromisoformat(str(s).replace("Z", "+00:00"))
    except ValueError:
        return None


def voce(mid, v):
    """Riga del registro da una voce del diario finita, se l'IA si e discostata abbastanza. None altrimenti."""
    if v.get("st") != "FT" or not isinstance(v.get("g"), list) or len(v["g"]) != 2 or not v.get("mk") or not v.get("pc"):
        return None
    t0, ko = _data(v.get("t0")), _data(v.get("ko"))
    if t0 and ko and t0 > ko:  # registrata dopo il fischio: non vale
        return None
    s = scarto(v["pc"], v["mk"])
    if not s or abs(s[0]) < SOGLIA:
        return None
    g = v["g"]
    r = 0 if g[0] > g[1] else 1 if g[0] == g[1] else 2
    pia, pmk = v["pc"][ESITI[r]], v["mk"][r]
    return {"id": mid, "date": v.get("date"), "lg": v.get("lg"), "h": v.get("h"), "a": v.get("a"), "c": s[1], "ia": round(v["pc"][s[1]], 4),
            "q": round(v["mk"][ESITI.index(s[1])], 4), "g": g, "ok": 1 if pia > pmk else 0,
            "lia": round(-math.log(max(1e-9, pia)), 4), "lq": round(-math.log(max(1e-9, pmk)), 4)}


def riassunto(reg):
    def blocco(rr):
        n = len(rr)
        return {"n": n, "ok": sum(r["ok"] for r in rr), "ll_ia": round(sum(r["lia"] for r in rr) / n, 4) if n else None,
                "ll_q": round(sum(r["lq"] for r in rr) / n, 4) if n else None}
    out = blocco(reg)
    out["fasce"] = [{"da": lo, "a": hi, **blocco([r for r in reg if lo <= abs(r["ia"] - r["q"]) < hi])} for lo, hi in FASCE]
    out["dal"] = min((r["date"] for r in reg if r.get("date")), default=None)
    return out


def aggiorna(diario=DIARIO, out=OUT, oggi=None):
    oggi = oggi or datetime.now(timezone.utc).date()
    try:
        with open(out, encoding="utf-8") as f:
            vecchio = json.load(f)
    except (OSError, ValueError):
        vecchio = {}
    reg = {r["id"]: r for r in vecchio.get("registro") or []}
    for p in sorted(glob.glob(os.path.join(diario, "*.json"))):
        try:
            with open(p, encoding="utf-8") as f:
                dd = json.load(f)
        except (OSError, ValueError):
            continue
        for mid, v in dd.items():
            r = voce(mid, v)
            if r:
                reg[mid] = r
            elif mid in reg and v.get("st") == "FT":  # risultato corretto dopo: la riga si ricalcola o esce
                reg.pop(mid)
    limite = (oggi - timedelta(days=GIORNI)).isoformat()
    righe = sorted((r for r in reg.values() if (r.get("date") or "") >= limite), key=lambda r: (r["date"], r["id"]), reverse=True)
    dati = {"generato": datetime.now(timezone.utc).isoformat(timespec="minutes"), "soglia": SOGLIA, "giorni": GIORNI, "riass": riassunto(righe), "registro": righe}
    if {k: v for k, v in vecchio.items() if k != "generato"} == {k: v for k, v in dati.items() if k != "generato"}:
        return vecchio  # niente di nuovo: il file non si tocca (il giro gira ogni 10 minuti)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        json.dump(dati, f, ensure_ascii=False, separators=(",", ":"))
    R = dati["riass"]
    print(f"IA contro mercato: {R['n']} partite con scarto di almeno {round(SOGLIA * 100)} punti, IA piu vicina al risultato in {R['ok']}")
    return dati


if __name__ == "__main__":
    aggiorna()
