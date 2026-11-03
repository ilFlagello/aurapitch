"""AuraPitch - coerenza dei dati, a ogni giro della raccolta (dopo genera_app.py). Solo libreria standard.

Controlla il file dell'app appena scritto (e il registro dei consigli bloccati, se la cassaforte e aperta):
- probabilita 1X2 (IA e quote) che sommano a 1 e stanno tra 0 e 1, Over/Under tra 0 e 1;
- nessun NaN o infinito nei file pubblicati;
- quote sopra 1 (quote dei bookmaker e quote dei mercati);
- nessuna partita doppia (stesso id, oppure stesse squadre nello stesso giorno);
- consigli bloccati che non cambiano piu: il consiglio mostrato e quello salvato al blocco (data/consigli.json), e il blocco
  avviene prima del fischio;
- lista leggera e file completo con le stesse partite.
Scrive data/coerenza.json (letto dal controllo orario e dal riepilogo settimanale). Non ferma mai la raccolta: segnala.
Uso: python3 strumenti/coerenza.py [cartella radice]"""
import json
import math
import os
import sys
from datetime import datetime, timezone

RADICE = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOLL = 0.02


def _carica(p):
    with open(p, encoding="utf-8") as f:
        testo = f.read()
    return testo, json.loads(testo)


def controlla(d, testi, consigli=None, lista=None):
    """Restituisce (problemi, numero di controlli). d = file completo dell'app; testi = {nome: testo} dei file pubblicati."""
    probs, n = [], 0

    def ok(cond, msg):
        nonlocal n
        n += 1
        if not cond and len(probs) < 40:
            probs.append(msg)

    for nome, t in testi.items():
        trovati = []  # NaN o infinito come numeri (non dentro un testo, es. un indirizzo web)
        try:
            json.loads(t, parse_constant=lambda c: trovati.append(c))
        except ValueError:
            pass
        ok(not trovati, f"{nome}: contiene {len(trovati)} valori NaN o infinito")
    ids, coppie = set(), set()
    for m in d.get("matches", []):
        nome = f"{m.get('h')}-{m.get('a')} ({m.get('date')})"
        ok(m.get("id") not in ids, f"partita doppia (stesso id): {nome}")
        ids.add(m.get("id"))
        k = (m.get("date"), m.get("h"), m.get("a"))
        ok(k not in coppie, f"partita doppia (stesse squadre, stesso giorno): {nome}")
        coppie.add(k)
        for campo in ("p", "mk"):
            v = m.get(campo)
            if not v:
                continue
            numeri = all(isinstance(x, (int, float)) and math.isfinite(x) for x in v)
            ok(numeri and len(v) == 3 and all(0 <= x <= 1 for x in v), f"{nome}: probabilità {campo} fuori da 0-1: {v}")
            if numeri:
                ok(abs(sum(v) - 1) <= TOLL, f"{nome}: probabilità {campo} che sommano a {round(sum(v), 3)} invece di 1")
        for campo in ("po", "mo"):
            v = m.get(campo)
            if v is not None:
                ok(isinstance(v, (int, float)) and 0 <= v <= 1, f"{nome}: {campo} fuori da 0-1: {v}")
        for c, q in (m.get("odds") or {}).items():
            if q is not None:
                ok(isinstance(q, (int, float)) and q > 1, f"{nome}: quota {c} non valida: {q}")
        for r in m.get("markets") or []:
            if len(r) >= 3:
                ok(isinstance(r[1], (int, float)) and 0 <= r[1] <= 1, f"{nome}: mercato {r[0]} con probabilità {r[1]}")
                ok(not r[2] or r[2] > 1, f"{nome}: mercato {r[0]} con quota {r[2]}")
        # consiglio bloccato: deve restare quello salvato al blocco
        if consigli is not None and isinstance(m.get("tip"), dict) and (m.get("blocco") or {}).get("st") == "bloccato":
            r = consigli.get(m.get("id"))
            ok(r is not None, f"{nome}: consiglio bloccato senza registro")
            if r:
                for tipo, t in (r.get("tips") or {}).items():
                    mostrato = m["tip"].get(tipo)
                    if isinstance(mostrato, dict):
                        ok(mostrato.get("c") == t.get("c"), f"{nome}: il consiglio \"{tipo}\" è cambiato dopo il blocco ({t.get('c')} -> {mostrato.get('c')})")
                try:
                    ok(datetime.fromisoformat(r["tB"]) <= datetime.fromisoformat(m["ko"]) or m.get("st") != "NS",
                       f"{nome}: consiglio bloccato dopo il calcio d'inizio")
                except (KeyError, TypeError, ValueError):
                    pass
    if lista is not None:
        li = {m.get("id") for m in lista.get("matches", [])}
        ok(li == ids, f"lista leggera e file completo diversi: {len(li ^ ids)} partite non coincidono")
    return probs, n


def main():
    dati = os.path.join(RADICE, "app", "data")
    testi, d, lista = {}, None, None
    problemi = []
    for nome in ("giornata.json", "lista.json", "stato.json", "schedine_ia.json", "storico.json"):
        p = os.path.join(dati, nome)
        if not os.path.exists(p):
            continue
        try:
            testi[nome], x = _carica(p)
        except ValueError as e:
            problemi.append(f"{nome}: JSON non valido ({e})")
            continue
        if nome == "giornata.json":
            d = x
        elif nome == "lista.json":
            lista = x
    consigli = None
    pc = os.path.join(RADICE, "data", "consigli.json")
    if os.path.exists(pc):  # nella cassaforte: c'e solo nei giri con la cassaforte aperta
        try:
            consigli = json.load(open(pc, encoding="utf-8"))
        except ValueError:
            problemi.append("registro dei consigli illeggibile")
    n = 0
    if d is None:
        problemi.append("file dell'app (giornata.json) mancante o illeggibile")
    else:
        pr, n = controlla(d, testi, consigli, lista)
        problemi += pr
    out = {"quando": datetime.now(timezone.utc).isoformat(timespec="minutes"), "controlli": n, "problemi": problemi,
           "consigli_controllati": consigli is not None}
    with open(os.path.join(RADICE, "data", "coerenza.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print(f"Coerenza dei dati: {n} controlli, {len(problemi)} problemi")
    for x in problemi:
        print(f"::warning::Coerenza: {x}")


if __name__ == "__main__":
    main()
