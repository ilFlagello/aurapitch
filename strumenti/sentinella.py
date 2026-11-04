"""AuraPitch - sentinella delle fonti (ogni mattina dopo il giro completo). Solo libreria standard, nessuna richiesta di rete.

ESPN e una fonte non ufficiale: puo cambiare formato o smettere di dare un dato senza avvisare, e le altre fonti possono
restare a secco. Il controllo orario (controllo.py) guarda solo se le fonti rispondono; la sentinella guarda QUANTI dati sono
arrivati e se hanno la FORMA giusta, sui file appena scritti dal giro:
- The Odds API (partite.csv), quote ESPN e Football-Data.co.uk (partite_espn.csv), API-Football (quote_af.json);
- fotografie al blocco del giorno prima (prepartita.json, per fonte);
- tabellini ESPN (cartellini, angoli, falli) e dati della diretta delle partite del giorno prima.
Ogni numero si confronta con la mediana degli ultimi 14 giorni della stessa fonte: avviso se arriva a zero o sotto il 30%,
o se piu del 10% dei dati ha una forma sbagliata (quote sotto 1, campi mancanti). Storia e avvisi in data/sentinella.json;
il revisore li riporta tra i punti "da tenere d'occhio". Uso: python3 strumenti/sentinella.py [cartella radice]"""
import csv
import json
import os
import statistics
import sys
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

RADICE = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GIORNI = 14        # giorni di storia per la mediana
MIN_STORIA = 5     # giorni di storia prima di giudicare una fonte
CALO = 0.3         # sotto il 30% della mediana = avviso
FORMA = 0.10       # piu del 10% di dati con forma sbagliata = avviso
MIN_MEDIANA = 5    # una fonte che di solito da meno di 5 dati non si giudica sul numero


def _json(rel, vuoto=None):
    try:
        with open(os.path.join(RADICE, rel), encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return vuoto


def _csv(rel):
    try:
        with open(os.path.join(RADICE, rel), encoding="utf-8") as f:
            return list(csv.DictReader(f))
    except OSError:
        return None


def _quota(x):
    try:
        return float(x) > 1.0
    except (TypeError, ValueError):
        return False


def _q1x2(r, pre="oa_quota_media_"):
    return all(_quota(r.get(pre + e)) for e in ("1", "X", "2"))


def misura(oggi, ieri):
    """{fonte: [quanti, quanti con forma sbagliata]} dai file del giro (oggi e ieri = date AAAA-MM-GG)."""
    out = {}
    oa = _csv(f"data/{oggi}/partite.csv")
    if oa is not None:
        con = [r for r in oa if r.get("oa_quota_media_1")]
        out["The Odds API"] = [len(con), sum(1 for r in con if not _q1x2(r))]
    es = _csv(f"data/{oggi}/partite_espn.csv")
    if es is not None:
        for nome, fonte in (("Quote ESPN", ""), ("Football-Data.co.uk", "football-data")):
            con = [r for r in es if (r.get("fonte") or "") == fonte and r.get("oa_quota_media_1")]
            out[nome] = [len(con), sum(1 for r in con if not _q1x2(r))]
    af = _json(f"data/{oggi}/quote_af.json")
    if isinstance(af, list):
        out["API-Football quote"] = [len(af), sum(1 for r in af if not all(_quota(x) for x in (r.get("q") or [None] * 3)))]
    pp = _json(f"data/{ieri}/prepartita.json")
    if isinstance(pp, list):
        for fonte in ("espn", "oa"):
            con = [r for r in pp if (r.get("fonte") or "oa") == fonte]  # le righe di The Odds API non hanno "fonte"
            out[f"Pre-partita {fonte}"] = [len(con), sum(1 for r in con if not _q1x2(r))]
    tab = _json("data/espn/tabellini.json")
    if isinstance(tab, dict):
        con = [v for v in tab.values() if str(v.get("t", ""))[:10] == ieri]
        out["Tabellini ESPN"] = [len(con), sum(1 for v in con if not all(k in (v.get("st") or {}) for k in ("K", "C", "F")))]
    di = _json("data/espn/diretta.json")
    if isinstance(di, dict):
        con = [v for v in di.values() if isinstance(v, dict) and str(v.get("t", ""))[:10] == ieri]
        out["Diretta ESPN"] = [len(con), sum(1 for v in con if not isinstance(v.get("fin"), list))]
    return out


def giudica(storia, oggi, misure):
    avvisi = []
    for fonte, (n, rotti) in sorted(misure.items()):
        prima = [v for g, v in sorted(storia.get(fonte, {}).items()) if g < oggi][-GIORNI:]
        if len(prima) >= MIN_STORIA:
            med = statistics.median(prima)
            if med >= MIN_MEDIANA and n == 0:
                avvisi.append(f"{fonte}: nessun dato (di solito {med:g})")
            elif med >= MIN_MEDIANA and n < CALO * med:
                avvisi.append(f"{fonte}: solo {n} dati (di solito {med:g})")
        if n and rotti / n > FORMA:
            avvisi.append(f"{fonte}: {rotti} dati su {n} con forma sbagliata (formato cambiato?)")
    return avvisi


def main():
    ora = datetime.now(timezone.utc).astimezone(ZoneInfo("Europe/Rome"))
    oggi, ieri = ora.date().isoformat(), (ora.date() - timedelta(days=1)).isoformat()
    path = os.path.join(RADICE, "data", "sentinella.json")
    stato = _json("data/sentinella.json", {}) or {}
    storia = stato.get("storia") or {}
    misure = misura(oggi, ieri)
    avvisi = giudica(storia, oggi, misure)
    limite = (ora.date() - timedelta(days=GIORNI + 7)).isoformat()
    for fonte, (n, _) in misure.items():
        storia.setdefault(fonte, {})[oggi] = n
    storia = {f: {g: v for g, v in s.items() if g >= limite} for f, s in storia.items()}
    out = {"quando": datetime.now(timezone.utc).isoformat(timespec="minutes"), "oggi": {f: m[0] for f, m in misure.items()},
           "avvisi": avvisi, "storia": storia}
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print("Sentinella delle fonti: " + ", ".join(f"{k} {v[0]}" for k, v in sorted(misure.items())))
    for a in avvisi:
        print(f"::warning::Sentinella: {a}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
