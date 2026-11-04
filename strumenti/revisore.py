"""AuraPitch - revisore dell'algoritmo (ogni mattina dopo l'apprendimento e il giro completo, workflow "Revisore dell'algoritmo").
Solo libreria standard. Non cambia nulla: controlla che l'algoritmo stia lavorando bene e lo dice in parole semplici.

Controlla:
 1. apprendimento: il modello si e riallenato oggi, non contiene numeri rotti (NaN, infiniti), pesi degli specialisti sensati;
 2. partite vere dell'app (diario, ultimi 30 giorni): l'IA sbaglia meno, uguale o piu delle sole quote dei bookmaker;
 3. onesta delle probabilita: quando l'IA dice "60%" deve succedere circa 6 volte su 10 (per fasce, con margine statistico);
 4. consigli: vinti contro attesi (somma delle probabilita) negli ultimi 30 giorni, solo quelli bloccati prima del fischio;
 5. credibilita del blocco: nessun consiglio che conta nello storico registrato dopo il calcio d'inizio; quanti arrivano tardi;
 6. dati: partite rimaste "da giocare" ore dopo il fischio (risultati che non arrivano), partite finite mai verificate;
 7. coerenza dei dati dell'ultimo giro (strumenti/coerenza.py).
Esito in data/revisore.json (solo per chi lo esegue, mai nel repository) e codice di uscita 1 se c'e un problema:
il controllo orario vede l'esecuzione fallita e apre l'avviso su GitHub; il riepilogo del lunedi riporta i punti "da tenere d'occhio".
Uso: python3 strumenti/revisore.py [cartella radice]"""
import glob
import json
import math
import os
import sys
from datetime import datetime, timedelta, timezone

RADICE = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ORA = datetime.now(timezone.utc)
GIORNI = 30            # finestra dei controlli sulle partite vere
MIN_FASCIA = 60        # previsioni in una fascia prima di giudicarne l'onesta
MIN_CONFRONTO = 150    # partite finite prima di confrontare IA e quote
CODICI = ("1", "X", "2", "O2.5", "GG")
problemi, attenzione, note = [], [], []


def _jload(rel, vuoto=None):
    try:
        with open(os.path.join(RADICE, rel), encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return vuoto


def _data(s):
    try:
        d = datetime.fromisoformat(str(s).replace("Z", "+00:00"))
        return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
    except (TypeError, ValueError):
        return None


def _pct(x):
    return f"{100 * x:.0f}%".replace(".", ",")


def esito(c, g):
    """1 se l'esito c (1, X, 2, O2.5, GG) e uscito con il risultato g = [casa, ospite]."""
    h, a = g
    return int({"1": h > a, "X": h == a, "2": h < a, "O2.5": h + a > 2.5, "GG": h > 0 and a > 0}[c])


def numeri_rotti(x, percorso="", out=None):
    """Percorsi dei numeri non finiti (NaN, infinito) dentro un oggetto JSON."""
    out = [] if out is None else out
    if isinstance(x, float) and not math.isfinite(x):
        out.append(percorso or "radice")
    elif isinstance(x, dict):
        for k, v in x.items():
            numeri_rotti(v, f"{percorso}.{k}" if percorso else str(k), out)
    elif isinstance(x, list):
        for i, v in enumerate(x):
            numeri_rotti(v, f"{percorso}[{i}]", out)
    return out


# ---------- 1. apprendimento e modello ----------

def controlla_modello():
    ia = _jload("app/data/ia.json")
    if not ia:
        problemi.append("Apprendimento: il riassunto dell'IA (app/data/ia.json) non si legge")
        return
    allenato = ia.get("allenato")
    attesa = ORA.date() if ORA.hour >= 6 else ORA.date() - timedelta(days=1)
    try:
        ritardo = (attesa - datetime.strptime(allenato, "%Y-%m-%d").date()).days
    except (TypeError, ValueError):
        ritardo = 99
    if ritardo >= 2:
        problemi.append(f"Apprendimento: l'IA non si riallena da {ritardo} giorni (ultimo: {allenato})")
    elif ritardo == 1:
        attenzione.append(f"Apprendimento: oggi l'IA non si è ancora riallenata (ultimo: {allenato})")
    else:
        note.append(f"Apprendimento: fatto oggi, modello \"{(ia.get('modello') or {}).get('nome', '?')}\"")
    rotti = numeri_rotti(ia)
    if rotti:
        problemi.append("Riassunto dell'IA con numeri non validi: " + ", ".join(rotti[:5]))
    # controllo sulle partite vere fatto dall'apprendimento: il modello attivo deve fare almeno come il motore senza correzioni
    c = ia.get("controllo") or {}
    if c.get("corrette") and c.get("motore") and c.get("n", 0) >= c.get("minimo", 150):
        if c["corrette"] > c["motore"] * 1.002:
            attenzione.append(f"Modello attivo peggiore del motore senza correzioni sulle partite vere ({c['corrette']} contro {c['motore']}): "
                              "l'apprendimento lo ritira da solo, verificare domani")
        else:
            note.append(f"Modello attivo sulle partite vere: errore {c['corrette']} contro {c['motore']} senza correzioni ({c['n']} partite)")
    # modello vero (cassaforte): presente, senza numeri rotti, pesi degli specialisti in un intervallo sensato
    mod = _jload("data/modello.json")
    if mod is None:
        note.append("Modello: file della cassaforte non disponibile qui (controllo solo sul riassunto pubblico)")
        return
    att = mod.get("attivo") or {}
    if not att.get("ricetta"):
        problemi.append("Modello: manca il modello attivo")
    rotti = numeri_rotti(mod)
    if rotti:
        problemi.append("Modello con numeri non validi: " + ", ".join(rotti[:5]))
    grandi = []

    def pesi(x, p=""):
        if isinstance(x, dict):
            for k, v in x.items():
                pesi(v, f"{p}.{k}" if p else k)
        elif isinstance(x, (int, float)) and not isinstance(x, bool) and abs(x) > 25 and "partite" not in p and "verifica" not in p and p.split(".")[-1] not in ("n", "diario"):
            grandi.append(f"{p}={x}")
    pesi(att.get("integratore") or {})
    if grandi:
        attenzione.append("Integratore: pesi molto grandi (possibile instabilità): " + ", ".join(grandi[:4]))
    acc = [g for g, v in ((_jload("app/data/ia.json") or {}).get("integratore") or {}).items() if isinstance(v, dict) and v.get("attivo")]
    note.append("Integratore degli specialisti: " + (("acceso per " + ", ".join(acc)) if acc else "in ombra ovunque (nessun miglioramento sicuro ancora)"))


# ---------- 2-5. partite vere dell'app ----------

def carica_diario():
    out = []
    for p in sorted(glob.glob(os.path.join(RADICE, "data", "diario", "*.json"))):
        try:
            with open(p, encoding="utf-8") as f:
                out += [dict(v, id=k) for k, v in json.load(f).items()]
        except (OSError, ValueError):
            continue
    return out


def ll(p, y):
    p = min(max(float(p), 1e-6), 1 - 1e-6)
    return -math.log(p if y else 1 - p)


def controlla_diario(diario):
    dal = (ORA - timedelta(days=GIORNI)).date().isoformat()
    fin = [v for v in diario if v.get("st") == "FT" and isinstance(v.get("g"), list) and len(v["g"]) == 2 and v.get("date", "") >= dal and v.get("pc")]
    note.append(f"Diario: {len(diario)} previsioni, {len(fin)} finite negli ultimi {GIORNI} giorni")
    # previsioni registrate dopo il fischio (non dovrebbero esistere: il diario scrive solo partite "da giocare")
    sette = (ORA - timedelta(days=7)).date().isoformat()
    tardi = [v for v in diario if v.get("date", "") >= sette and _data(v.get("t0")) and _data(v.get("ko")) and _data(v["t0"]) > _data(v["ko"])]
    if tardi:
        attenzione.append(f"Diario: {len(tardi)} previsioni registrate per la prima volta dopo il calcio d'inizio (ultimi 7 giorni)")
    # 2. IA contro quote, esito finale: errore medio (log-loss) sulle stesse partite
    ia = qu = 0.0
    n = 0
    for v in fin:
        pc, mk = v["pc"], v.get("mk")
        if not (mk and len(mk) == 3 and all(c in pc for c in ("1", "X", "2"))):
            continue
        k = 0 if v["g"][0] > v["g"][1] else 1 if v["g"][0] == v["g"][1] else 2
        ia += -math.log(max(1e-6, pc[("1", "X", "2")[k]]))
        qu += -math.log(max(1e-6, mk[k] / (sum(mk) or 1)))
        n += 1
    if n >= MIN_CONFRONTO:
        ia, qu = ia / n, qu / n
        diff = (ia - qu) / qu
        testo = f"IA contro quote sull'esito finale ({n} partite): errore {ia:.4f} contro {qu:.4f}"
        if diff > 0.025:
            problemi.append(testo + f" (IA peggiore del {100 * diff:.1f}%)".replace(".", ","))
        elif diff > 0.01:
            attenzione.append(testo + f" (IA peggiore del {100 * diff:.1f}%)".replace(".", ","))
        else:
            note.append(testo)
    else:
        note.append(f"IA contro quote: servono almeno {MIN_CONFRONTO} partite finite (ora {n})")
    # 3. onesta delle probabilita per fascia (le probabilita sotto il 50% si leggono al contrario: 30% che succeda = 70% che non succeda)
    fasce = {}
    for v in fin:
        for c in CODICI:
            if c not in v["pc"]:
                continue
            p, y = float(v["pc"][c]), esito(c, v["g"])
            if p < 0.5:
                p, y = 1 - p, 1 - y
            f = min(9, int(p * 10))
            s = fasce.setdefault(f, [0, 0.0, 0])
            s[0] += 1
            s[1] += p
            s[2] += y
    giudicate = 0
    for f, (k, sp, sy) in sorted(fasce.items()):
        if k < MIN_FASCIA:
            continue
        giudicate += 1
        pm, fr = sp / k, sy / k
        se = math.sqrt(max(pm * (1 - pm), 1e-6) / k)
        if abs(fr - pm) > max(0.07, 3 * se):
            (problemi if abs(fr - pm) > max(0.12, 4 * se) else attenzione).append(
                f"Probabilità poco oneste nella fascia {f * 10}-{f * 10 + 10}%: l'IA dice in media {_pct(pm)}, è successo il {_pct(fr)} ({k} previsioni)")
    if giudicate:
        note.append(f"Onestà delle probabilità: {giudicate} fasce controllate")


def controlla_consigli(diario):
    st = _jload("data/consigli.json")
    if st is None:
        note.append("Consigli: registro della cassaforte non disponibile qui")
        return
    ko = {v["id"]: _data(v.get("ko")) for v in diario if v.get("ko")}
    dal = (ORA - timedelta(days=GIORNI)).date().isoformat()
    n = vinti = 0
    attesi = var = 0.0
    tardivi = dopo = recenti = 0
    sette = (ORA - timedelta(days=7)).date().isoformat()
    for mid, v in st.items():
        if v.get("date", "") >= sette and v.get("tB"):
            recenti += 1
            tardivi += 1 if v.get("tardivo") else 0
            k = ko.get(mid)
            tb = _data(v.get("tB"))
            if k and tb and tb > k and not v.get("tardivo") and v.get("esiti"):
                dopo += 1
        es = (v.get("esiti") or {}).get("consiglio")
        t = (v.get("tips") or {}).get("consiglio") or {}
        if v.get("tardivo") or es is None or not t.get("p") or v.get("date", "") < dal:
            continue
        n += 1
        vinti += 1 if es else 0
        attesi += t["p"]
        var += t["p"] * (1 - t["p"])
    if dopo:
        problemi.append(f"Credibilità: {dopo} consigli registrati dopo il calcio d'inizio contano nello storico (ultimi 7 giorni)")
    if recenti and tardivi:
        quota = tardivi / recenti
        (attenzione if quota > 0.05 else note).append(f"Consigli arrivati dopo il fischio e lasciati fuori dallo storico: {tardivi} su {recenti} ({_pct(quota)}, ultimi 7 giorni)")
    if n >= 50 and var > 0:
        z = (vinti - attesi) / math.sqrt(var)
        testo = f"Consigli degli ultimi {GIORNI} giorni: vinti {vinti} su {n}, attesi {attesi:.0f}".replace(".", ",")
        if z < -3:
            problemi.append(testo + ": molto sotto le attese, l'IA è troppo sicura di sé")
        elif z < -2:
            attenzione.append(testo + ": sotto le attese, da tenere d'occhio")
        elif z > 3:
            attenzione.append(testo + ": molto sopra le attese, l'IA è troppo prudente")
        else:
            note.append(testo + ": in linea con le attese")
    else:
        note.append(f"Consigli: servono almeno 50 consigli verificati per giudicarli (ora {n})")


# ---------- 6-7. dati del giorno ----------

def controlla_stime_sq():
    """Controllo 10: stime dell'IA nei campionati senza quote (stima_sq.py). A partite finite, errore contro un riferimento
    ingenuo (frequenze medie di 1, X, 2) e contro le quote DraftKings dove c'erano; onesta per fasce. Mai nei consigli.
    Lo chiama controlla_dati; il dettaglio va in data/revisore_stime_sq.json (mai nel repository)."""
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # stima_sq.py sta nella cartella del codice
    import stima_sq as SQ
    v = SQ.valuta(_jload("data/stime_senza_quote.json", {}) or {})
    with open(os.path.join(RADICE, "data", "revisore_stime_sq.json"), "w", encoding="utf-8") as f:
        json.dump({"quando": ORA.isoformat(timespec="minutes"), **v}, f, ensure_ascii=False, indent=1)
    if v.get("n", 0) < 50:
        note.append(f"Stime senza quote: servono almeno 50 partite finite per giudicarle (ora {v.get('n', 0)})")
        return v
    testo = f"Stime senza quote ({v['n']} partite): errore {v['ia']:.3f} contro {v['base']:.3f} del riferimento ingenuo".replace(".", ",")
    if v.get("quote"):
        testo += f", {v['quote']:.3f} delle quote DraftKings su {v['n_quote']}".replace(".", ",")
    if v["ia"] > v["base"] * 1.01 and v["n"] >= 100:
        attenzione.append(testo + ": la stima fa peggio del riferimento, da rivedere")
    elif (v.get("scarto") or 0) > 6:
        attenzione.append(testo + f"; probabilità poco oneste (scarto {v['scarto']:.1f} punti)".replace(".", ","))
    else:
        note.append(testo)
    return v


def controlla_dati(diario):
    d = _jload("app/data/giornata.json") or {}
    ferme, passate = {}, 0
    for m in d.get("matches", []):
        k = _data(m.get("ko"))
        if not k or k > ORA - timedelta(hours=3) or k < ORA - timedelta(days=2):
            continue
        passate += 1
        if m.get("st") == "NS":
            ferme[m.get("lg", "?")] = ferme.get(m.get("lg", "?"), 0) + 1
    if ferme:
        n = sum(ferme.values())
        elenco = ", ".join(f"{lg} ({x})" for lg, x in sorted(ferme.items(), key=lambda t: -t[1])[:6])
        (problemi if passate and n / passate > 0.2 else attenzione).append(
            f"Risultati che non arrivano: {n} partite iniziate da più di 3 ore risultano ancora da giocare: {elenco}")
    elif passate:
        note.append(f"Risultati: tutte le {passate} partite delle ultime 48 ore aggiornate")
    # partite finite da piu di un giorno ma mai verificate nel diario (non insegnano nulla all'algoritmo)
    soglia = (ORA - timedelta(days=1, hours=12))
    mai = {}
    for v in diario:
        k = _data(v.get("ko"))
        if k and soglia - timedelta(days=5) < k < soglia and v.get("st") not in ("FT", "RINV"):
            mai[v.get("lg", "?")] = mai.get(v.get("lg", "?"), 0) + 1
    if mai:
        n = sum(mai.values())
        elenco = ", ".join(f"{lg} ({x})" for lg, x in sorted(mai.items(), key=lambda t: -t[1])[:6])
        attenzione.append(f"Diario: {n} partite giocate negli ultimi giorni senza risultato registrato (non servono all'apprendimento): {elenco}")
    co = _jload("data/coerenza.json")
    if co:
        if co.get("problemi"):
            problemi.append("Coerenza dei dati all'ultimo giro: " + "; ".join(co["problemi"][:4]))
        else:
            note.append(f"Coerenza dei dati: ok ({co.get('controlli', 0)} controlli)")
    for f, nome in (("app/data/giocatori_ia.json", "verificatore dei giocatori"), ("app/data/statistiche_ia.json", "verificatore delle statistiche")):
        note.append(f"{nome[0].upper() + nome[1:]}: " + ("riassunto presente" if os.path.exists(os.path.join(RADICE, f)) else "nessun riassunto ancora (si crea al giro del mattino)"))
    try:  # 10. stime dell'IA nei campionati senza quote
        controlla_stime_sq()
    except Exception as e:  # noqa: BLE001
        attenzione.append(f"Controllo delle stime senza quote non riuscito: {type(e).__name__}")


def main():
    try:
        controlla_modello()
    except Exception as e:  # noqa: BLE001 - un controllo rotto si segnala, non ferma gli altri
        attenzione.append(f"Controllo del modello non riuscito: {type(e).__name__}")
    diario = carica_diario()
    controlli = [("registro dei consigli", controlla_consigli), ("dati del giorno", controlla_dati)]
    if diario:
        controlli.insert(0, ("diario", controlla_diario))
    else:
        note.append("Diario delle previsioni non disponibile qui (cassaforte chiusa): controlli sulle partite vere saltati")
    for nome, fn in controlli:
        try:
            fn(diario)
        except Exception as e:  # noqa: BLE001
            attenzione.append(f"Controllo {nome} non riuscito: {type(e).__name__}")
    esito_tot = {"quando": ORA.isoformat(timespec="minutes"), "problemi": problemi, "attenzione": attenzione, "note": note}
    os.makedirs(os.path.join(RADICE, "data"), exist_ok=True)
    with open(os.path.join(RADICE, "data", "revisore.json"), "w", encoding="utf-8") as f:
        json.dump(esito_tot, f, ensure_ascii=False, indent=1)
    print("Algoritmo: " + ("PROBLEMI" if problemi else "tutto in ordine") + ".")
    for x in problemi:
        print("  PROBLEMA: " + x)
    for x in attenzione:
        print("  da tenere d'occhio: " + x)
    for x in note:
        print("    " + x)
    return 1 if problemi else 0


if __name__ == "__main__":
    sys.exit(main())
