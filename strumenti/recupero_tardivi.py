"""AuraPitch - recupero dei consigli segnati "tardivi" per errore (errore del ri-blocco, corretto con la PR #59).

Fino al 4/11 alle 16:26 UTC ogni giro breve ri-bloccava "adesso" le partite finite rimaste nel file del giorno: il consiglio
veniva sostituito con quello ricalcolato dopo la partita, segnato "tardivo" e tolto dallo storico. Il consiglio vero, con
l'ora del blocco vera, e rimasto nella cronologia pubblica di app/data/giornata.json: questo strumento lo ricostruisce
e lo rimette nel registro dei consigli (data/consigli.json, nella cassaforte).

Tre passi:
  python3 strumenti/recupero_tardivi.py elenco            ricostruisce strumenti/recupero_tardivi.json dalla cronologia git
                                                           (serve la storia: git fetch --depth=1500 origin main)
  python3 strumenti/recupero_tardivi.py prova [--vecchie]  stampa cosa cambierebbe nel registro, senza toccare nulla
  python3 strumenti/recupero_tardivi.py applica [--vecchie] scrive il registro (solo dal workflow "Recupero consigli tardivi")

Gruppi dell'elenco:
  riblocco        bloccate in tempo (stato "bloccato", ora del blocco prima del fischio) e poi ri-bloccate dopo la partita.
                  Ricostruzione certa: consiglio e ora del blocco sono quelli mostrati nell'app prima del fischio.
  regole_vecchie  (solo con --vecchie) partite del 2-3/11 finite prima che esistesse il blocco (PR #6): con le regole di
                  allora il registro teneva l'ultima versione del consiglio vista prima del fischio. Si ricostruisce
                  dall'ultima fotografia prima del fischio; ricostruzione meno certa (un giro senza fotografia salvata
                  potrebbe aver aggiornato il consiglio dopo), e nessuna regola dei 45 minuti.
Mai toccate: le tardive vere (partita vista per la prima volta dopo il fischio) e ogni voce che non risulta piu "tardiva"
o la cui ora del blocco e gia prima del fischio (lo strumento si puo rilanciare senza fare danni).
"""
import json
import os
import subprocess
import sys
from datetime import datetime
from zoneinfo import ZoneInfo

RADICE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RADICE)

ELENCO = os.path.join(RADICE, "strumenti", "recupero_tardivi.json")
REGISTRO = os.path.join(RADICE, "data", "consigli.json")
GIORNATA = "app/data/giornata.json"
CORREZIONE = "2026-11-04T16:26:02+00:00"  # unione della PR #59: dopo, nessun ri-blocco
ROME = ZoneInfo("Europe/Rome")
CAMPI = ("c", "l", "p", "q", "qm")


def _t(s):
    return datetime.fromisoformat(s)


def _generato(d, commit_t):
    """Ora del giro che ha prodotto la fotografia (campo "generato", ora italiana); se manca, l'ora del salvataggio."""
    try:
        return datetime.strptime(d["generato"], "%d/%m/%Y %H:%M").replace(tzinfo=ROME).astimezone(_t(commit_t).tzinfo)
    except (KeyError, TypeError, ValueError):
        return _t(commit_t)


def _corti(tip):
    return {k: {x: v[x] for x in CAMPI if x in v} for k, v in (tip or {}).items() if isinstance(v, dict)}


def elenco():
    """Legge tutte le fotografie di giornata.json fino all'unione di #59 e scrive l'elenco delle voci da recuperare."""
    import vantaggio as VM
    import specialisti as SP
    righe = subprocess.check_output(["git", "log", "--reverse", "--format=%H %cI", "--until", CORREZIONE, "--", GIORNATA],
                                    cwd=RADICE).decode().split()
    viste, prima, tardive = {}, {}, {}  # id -> ultima foto "bloccato" in tempo / ultima foto prima del fischio / ultima foto "tardivo"
    for i in range(0, len(righe), 2):
        h, ct = righe[i], righe[i + 1]
        try:
            d = json.loads(subprocess.check_output(["git", "show", f"{h}:{GIORNATA}"], cwd=RADICE))
        except (subprocess.CalledProcessError, ValueError):
            continue
        gen = _generato(d, ct)
        for m in d.get("matches", []):
            if not m.get("tip") or not m.get("ko"):
                continue
            ko, b = _t(m["ko"]), m.get("blocco") or {}
            if b.get("st") == "bloccato" and b.get("t") and _t(b["t"]) <= ko:
                viste[m["id"]] = m
            elif b.get("st") == "tardivo":
                tardive[m["id"]] = m
            if m.get("st") == "NS" and gen < ko:
                prima[m["id"]] = (m, gen)
    voci = []
    for mid, mt in sorted(tardive.items()):
        m = viste.get(mid)
        if m:  # bloccata in tempo, poi ri-bloccata
            v = {"id": mid, "gruppo": "riblocco", "tB": m["blocco"]["t"], "tip": m["tip"], "dati": m.get("dati"),
                 "spB": VM.specialisti_attivi(m, SP.NOMI)}
            mp, gen = prima.get(mid, (None, None))
            if mp is not None and gen > _t(m["blocco"]["t"]):  # quota di chiusura: l'ultima vista prima del fischio
                qf = {k: VM.quota_attuale(mp, x.get("c")) for k, x in v["tip"].items() if isinstance(x, dict) and x.get("qm")}
                v["qF"] = {k: q for k, q in qf.items() if q}
                v["tF"] = gen.isoformat(timespec="minutes")
        elif mid in prima and _t(mt["blocco"]["t"]) > _t(mt["ko"]) and not (prima[mid][0].get("blocco") or {}).get("st"):
            m, gen = prima[mid]  # mai bloccata: finita prima che il blocco esistesse
            v = {"id": mid, "gruppo": "regole_vecchie", "tB": gen.isoformat(timespec="minutes"), "tip": m["tip"], "dati": m.get("dati"),
                 "spB": VM.specialisti_attivi(m, SP.NOMI)}
        else:
            continue  # tardiva vera
        v.update({"date": mt.get("date"), "ko": mt["ko"], "h": mt.get("h"), "a": mt.get("a"), "lg": mt.get("lg"),
                  "tB_errato": mt["blocco"]["t"], "c_errato": ((mt.get("tip") or {}).get("consiglio") or {}).get("c")})
        voci.append(v)
    with open(ELENCO, "w", encoding="utf-8") as f:
        json.dump(voci, f, ensure_ascii=False, separators=(",", ":"))
    n = {g: sum(1 for v in voci if v["gruppo"] == g) for g in ("riblocco", "regole_vecchie")}
    print(f"Elenco: {n['riblocco']} partite ri-bloccate per errore, {n['regole_vecchie']} con le regole vecchie -> {os.path.relpath(ELENCO, RADICE)}")


def ripristina(st, voci, gruppi):
    """Applica l'elenco al registro st (in memoria). Restituisce le righe di resoconto e quante voci ha cambiato."""
    from genera_app import esito_sicuro
    righe, n, saltate = [], 0, []
    for v in voci:
        if v["gruppo"] not in gruppi:
            continue
        r = st.get(v["id"])
        motivo = None
        if r is None:
            motivo = "non e nel registro"
        elif not r.get("tardivo"):
            motivo = "non e piu tardiva (gia recuperata?)"
        elif not r.get("tB"):
            motivo = "senza ora del blocco"
        elif _t(r["tB"]) <= _t(r.get("ko") or v["ko"]):
            motivo = "ora del blocco gia prima del fischio"
        elif _t(v["tB"]) > _t(v["ko"]):
            motivo = "ricostruzione dopo il fischio"
        if motivo:
            saltate.append(f"  {v['id']}: {motivo}")
            continue
        prima_c, prima_t = ((r.get("tips") or {}).get("consiglio") or {}).get("l"), r["tB"]
        tips = _corti(v["tip"])
        for k, q in (v.get("qF") or {}).items():
            if k in tips:
                tips[k]["qF"] = q
        r["tips"], r["tB"], r["ko"] = tips, v["tB"], r.get("ko") or v["ko"]
        r["spB"] = v.get("spB") or []
        if v.get("tF"):
            r["tF"] = v["tF"]
        else:
            r.pop("tF", None)
        if "tipB" in r:  # partita ancora nel file del giorno: si mostra il consiglio vero
            r["tipB"] = v["tip"]
            if v.get("dati"):
                r["datiB"] = v["dati"]
        r.pop("tardivo", None)
        r.pop("esiti", None)
        if r.get("st") == "FT" and r.get("g"):
            es = {k: esito_sicuro(x["c"], r["g"], r.get("g1")) for k, x in tips.items()}
            r["esiti"] = {k: x for k, x in es.items() if x is not None}
        ec = (r.get("esiti") or {}).get("consiglio")
        esito = "vinto" if ec is True else "perso" if ec is False else "senza esito"
        cambio = "" if prima_c == tips.get("consiglio", {}).get("l") else f" (prima: {prima_c})"
        righe.append(f"  {r.get('date')} {v['id']} {r.get('h')}-{r.get('a')} {r.get('g')}: blocco {prima_t[5:16]} -> {v['tB'][5:16]} "
                     f"(fischio {v['ko'][5:16]}), consiglio {tips.get('consiglio', {}).get('l')}{cambio} -> {esito}")
        n += 1
    return righe, n, saltate


def riassunto(st):
    """Consigli nello storico (con esito) e vinti, come li conta aggiorna_storico."""
    z = [v for v in st.values() if not v.get("tardivo") and "consiglio" in (v.get("esiti") or {})]
    return len(z), sum(1 for v in z if v["esiti"]["consiglio"]), round(sum(v["tips"]["consiglio"]["p"] for v in z), 1)


def main():
    azione = sys.argv[1] if len(sys.argv) > 1 else ""
    if azione == "elenco":
        return elenco()
    if azione not in ("prova", "applica"):
        print(__doc__)
        return 2
    gruppi = {"riblocco"} | ({"regole_vecchie"} if "--vecchie" in sys.argv else set())
    with open(ELENCO, encoding="utf-8") as f:
        voci = json.load(f)
    if not os.path.exists(REGISTRO):
        print("Registro dei consigli non trovato (cassaforte non aperta?): niente da fare")
        return 1
    with open(REGISTRO, encoding="utf-8") as f:
        st = json.load(f)
    n0, v0, a0 = riassunto(st)
    righe, n, saltate = ripristina(st, voci, gruppi)
    n1, v1, a1 = riassunto(st)
    print(f"Recupero dei consigli tardivi per errore ({', '.join(sorted(gruppi))}): {n} voci da ripristinare")
    print("\n".join(righe))
    if saltate:
        print(f"Saltate ({len(saltate)}):")
        print("\n".join(saltate))
    print(f"Consigli con esito nel registro: {n0} -> {n1}; vinti {v0} -> {v1}; attesi {a0} -> {a1}")
    print("(lo storico pubblico conta solo gli ultimi 30 giorni: si aggiorna al prossimo giro della raccolta)")
    if azione == "applica":
        if n:
            with open(REGISTRO, "w", encoding="utf-8") as f:
                json.dump(st, f, ensure_ascii=False, separators=(",", ":"))
            print(f"Registro scritto: {n} voci ripristinate")
        else:
            print("Niente da scrivere")
    else:
        print("PROVA: il registro non e stato toccato")
    return 0


if __name__ == "__main__":
    sys.exit(main())
