"""Misura dell'identita unica delle squadre (Blocco 5): copertura dei dati per gruppo di competizioni, prima e dopo.

  python3 strumenti/identita.py --salva FILE.json          gira genera_app.genera() e salva le partite (dalla cartella principale)
  python3 strumenti/identita.py PRIMA.json DOPO.json       tabella di copertura delle due versioni e controllo che i numeri del
                                                            consiglio (probabilita, mercati, consigli, specialisti) siano identici

Gruppi come nell'inventario del 4/11: top 5 campionati, altri campionati, coppe internazionali, coppe nazionali. Si contano
solo le partite non iniziate. Una squadra "ha" un dato se il testo della scheda non dice "non disponibile"/"nessuna partita"."""
import json
import os
import sys

RADICE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RADICE)

TOP5 = ("I1", "E0", "SP1", "D1", "F1")
COPPE_INT = ("CL", "EL", "ECL", "LIB", "SUD", "ACL", "ACL2", "UWCL")
NAZIONALI = ("NL", "AMI", "EQ", "WCQ")
# numeri che decidono consiglio e probabilita: con l'identita unica NON devono cambiare (i valori nuovi vanno in ombra)
ALGORITMO = ("p", "po", "mk", "mo", "xg", "xg_base", "xg_mercato", "tip", "sp", "markets", "cart", "odds", "nb", "_p0", "fattori")
VUOTO = ("non disponibil", "Nessuna partita")


def gruppo(lg):
    import espn_dati as ES
    if lg in TOP5:
        return "top 5"
    if lg in COPPE_INT:
        return "coppe int."
    if lg in NAZIONALI:
        return None
    return "coppe naz." if lg in ES.COPPE else "altri"


def _ha(t):
    return bool(t) and not any(v in (t.get("text") or "") for v in VUOTO)


def copertura(partite):
    """gruppo -> {voce: percentuale}, sulle partite non iniziate (due squadre per partita)."""
    out = {}
    for m in partite:
        g = gruppo(m.get("lg"))
        if not g or m.get("st") != "NS":
            continue
        c = out.setdefault(g, {"partite": 0, "sq": 0, "forma 5+": 0, "forma": 0, "classifica": 0, "riposo": 0, "archivio": 0, "id ESPN": 0})
        c["partite"] += 1
        oid = m.get("_oid") or {}
        for lato in (0, 1):
            c["sq"] += 1
            l5 = (m.get("last5") or [[], []])[lato]
            c["forma 5+"] += len(l5) >= 5
            c["forma"] += _ha((m.get("forma") or [{}, {}])[lato])
            c["classifica"] += _ha((m.get("attese") or [{}, {}])[lato])
            c["riposo"] += (((m.get("_ctx") or {}).get("riposo") or [None, None])[lato] is not None)
            c["archivio"] += bool((oid.get("arch") or [None, None])[lato])
            c["id ESPN"] += bool((oid.get("es") or [None, None])[lato])
    for c in out.values():
        for k in list(c):
            if k not in ("partite", "sq"):
                c[k] = round(100 * c[k] / c["sq"]) if c["sq"] else 0
    return out


def differenze(prima, dopo):
    a, b = {m["id"]: m for m in prima}, {m["id"]: m for m in dopo}
    diff = {}
    for i in set(a) & set(b):
        for c in ALGORITMO:
            if json.dumps(a[i].get(c), sort_keys=True, default=str) != json.dumps(b[i].get(c), sort_keys=True, default=str):
                diff.setdefault(c, []).append(i)
    return diff


def stampa(nome, cop):
    voci = ("forma 5+", "forma", "classifica", "riposo", "archivio", "id ESPN")
    print(f"\n{nome}")
    print("| gruppo | partite | " + " | ".join(voci) + " |")
    print("|---|---|" + "---|" * len(voci))
    for g in ("top 5", "altri", "coppe int.", "coppe naz."):
        c = cop.get(g)
        if c:
            print(f"| {g} | {c['partite']} | " + " | ".join(f"{c[v]}%" for v in voci) + " |")


def main():
    if len(sys.argv) == 3 and sys.argv[1] == "--salva":
        import genera_app as GA
        d = GA.genera()
        with open(sys.argv[2], "w", encoding="utf-8") as f:
            json.dump(d["matches"], f, default=str, ensure_ascii=False)
        print(f"Salvate {len(d['matches'])} partite in {sys.argv[2]}")
        return 0
    if len(sys.argv) != 3:
        print(__doc__)
        return 2
    prima, dopo = (json.load(open(p, encoding="utf-8")) for p in sys.argv[1:3])
    stampa("PRIMA", copertura(prima))
    stampa("DOPO", copertura(dopo))
    diff = differenze(prima, dopo)
    if diff:
        print("\nATTENZIONE, numeri del consiglio cambiati:", {k: len(v) for k, v in diff.items()}, "esempi:", {k: v[:3] for k, v in diff.items()})
        return 1
    print(f"\nNumeri del consiglio identici su {len(set(m['id'] for m in prima) & set(m['id'] for m in dopo))} partite.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
