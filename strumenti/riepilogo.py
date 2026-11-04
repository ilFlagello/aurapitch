"""AuraPitch - riepilogo settimanale (lunedi mattina). Mette insieme lo stato di tutto e, SOLO se c'e qualcosa da sistemare,
apre un unico avviso su GitHub (issue con etichetta "riepilogo": GitHub manda una mail). Se tutto va bene non apre nulla.
Guarda: esecuzioni dei processi automatici della settimana, avviso orario ancora aperto, coerenza dei dati, crediti delle
quote, guardiano della sicurezza, prova dal vivo del sito, apprendimento dell'IA, parti inutilizzate da togliere (strumenti/pulizia.py). Nessun valore segreto viene stampato."""
import json
import os
import sys
import urllib.request
from datetime import datetime, timedelta, timezone

RADICE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RADICE)
REPO = os.environ.get("GITHUB_REPOSITORY", "ilFlagello/aurapitch")
TOKEN = os.environ.get("GITHUB_TOKEN", "")
ORA = datetime.now(timezone.utc)
PROCESSI = (("raccolta.yml", "Raccolta dati"), ("pubblica.yml", "Pubblicazione app"), ("impara.yml", "Apprendimento"), ("test.yml", "Test"),
            ("notifiche.yml", "Servizio notifiche"), ("vivo.yml", "Prova dal vivo del sito"), ("guardiano.yml", "Guardiano della sicurezza"), ("revisore.yml", "Revisore dell'algoritmo"),
            ("controllo.yml", "Controllo orario"), ("codeql.yml", "Analisi sicurezza"), ("ripristino.yml", "Prova della copia di sicurezza"))


def gh(percorso, metodo="GET", corpo=None):
    h = {"User-Agent": "aurapitch-riepilogo", "Accept": "application/vnd.github+json"}
    if TOKEN:
        h["Authorization"] = "Bearer " + TOKEN
    data = json.dumps(corpo).encode() if corpo is not None else None
    if data:
        h["Content-Type"] = "application/json"
    req = urllib.request.Request(percorso if percorso.startswith("http") else f"https://api.github.com/repos/{REPO}/{percorso}", data=data, headers=h, method=metodo)
    with urllib.request.urlopen(req, timeout=25) as r:
        t = r.read()
        return json.loads(t) if t else None


def _jload(p):
    try:
        with open(os.path.join(RADICE, p), encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def raccogli():
    """(da sistemare, tutto il resto): due elenchi di righe in italiano."""
    sistemare, stato = [], []
    dal = (ORA - timedelta(days=7)).strftime("%Y-%m-%d")
    # 1. processi automatici della settimana
    for wf, nome in PROCESSI:
        try:
            runs = [r for r in (gh(f"actions/workflows/{wf}/runs?per_page=100&created=>={dal}") or {}).get("workflow_runs", []) if r.get("status") == "completed" and r.get("conclusion") != "cancelled"]
        except Exception as e:  # noqa: BLE001
            stato.append(f"{nome}: esecuzioni non leggibili ({type(e).__name__})")
            continue
        if not runs:
            stato.append(f"{nome}: nessuna esecuzione in settimana")
            continue
        falliti = [r for r in runs if r.get("conclusion") not in ("success", "skipped")]
        riga = f"{nome}: {len(runs)} esecuzioni, {len(falliti)} non riuscite"
        if runs[0].get("conclusion") not in ("success", "skipped") or len(falliti) >= max(2, len(runs) * 0.2):
            sistemare.append(riga + f" (ultima: {runs[0].get('conclusion')}, {runs[0].get('html_url')})")
        else:
            stato.append(riga)
    # 2. avviso del controllo orario ancora aperto
    try:
        aperti = gh("issues?labels=avviso&state=open") or []
        if aperti:
            sistemare.append(f"Avviso del controllo orario aperto da {aperti[0]['created_at'][:10]}: {aperti[0]['html_url']}")
    except Exception as e:  # noqa: BLE001
        stato.append(f"Avvisi aperti: non leggibili ({type(e).__name__})")
    # 3. coerenza dei dati (ultimo giro della raccolta)
    co = _jload("data/coerenza.json")
    if co is None:
        stato.append("Coerenza dei dati: non ancora disponibile")
    elif co.get("problemi"):
        sistemare.append(f"Coerenza dei dati ({co.get('quando')}): " + "; ".join(co["problemi"][:5]))
    else:
        stato.append(f"Coerenza dei dati: ok ({co.get('controlli')} controlli all'ultimo giro)")
    # 4. crediti delle quote
    try:
        import salvadanaio as SV
        pv = SV.previsione(rimasti=(_jload("data/crediti_quote.json") or {}).get("rimasti"))
        if pv:
            riga = f"Crediti delle quote: {pv['rimasti']} rimasti, {pv['per_giorno']} al giorno per i {pv['giorni']} giorni che mancano (spesa media del mese {pv['ritmo']})"
            (stato if pv["basta"] else sistemare).append(riga + ("" if pv["basta"] else f": sotto i {SV.ODDS_MATTINO} del giro del mattino o spesa oltre la parte del giorno"))
    except Exception as e:  # noqa: BLE001
        stato.append(f"Crediti delle quote: non leggibili ({type(e).__name__})")
    # 5. guardiano della sicurezza (eseguito appena prima dal workflow)
    g = _jload("data/guardiano.json")
    if g:
        sistemare += [f"Sicurezza: {x}" for x in g.get("problemi", [])] + [f"Sicurezza, da tenere d'occhio: {x}" for x in g.get("attenzione", [])]
        stato += [f"Sicurezza: {x}" for x in g.get("note", [])]
    # 5b. revisore dell'algoritmo (eseguito appena prima dal workflow)
    rv = _jload("data/revisore.json")
    if rv:
        sistemare += [f"Algoritmo: {x}" for x in rv.get("problemi", [])] + [f"Algoritmo, da tenere d'occhio: {x}" for x in rv.get("attenzione", [])]
        stato += [f"Algoritmo: {x}" for x in rv.get("note", [])]
    # 5c. parti inutilizzate (strumenti/pulizia.py, eseguito appena prima dal workflow): da togliere tra le cose da sistemare
    pu = _jload("data/pulizia.json")
    if pu:
        sistemare += [f"Pulizia: {x}" for x in pu.get("da_togliere", [])]
        stato += [f"Pulizia, da valutare: {x}" for x in pu.get("da_valutare", [])] + [f"Pulizia: {x}" for x in pu.get("note", [])]
    # 6. apprendimento dell'IA
    ia = _jload("app/data/ia.json")
    try:
        giorni = (ORA - datetime.fromisoformat(ia["generato"])).total_seconds() / 86400
        (sistemare if giorni > 2.5 else stato).append(f"Modello dell'IA aggiornato {giorni:.1f} giorni fa")
    except (TypeError, KeyError, ValueError):
        stato.append("Modello dell'IA: riassunto non leggibile")
    # 7. schedine IA del mese (solo informazione)
    sc = _jload("app/data/schedine_ia.json")
    if sc and sc.get("mese"):
        stato.append("Schedine IA del mese: " + "; ".join(f"{v['nome']} {v['passate']}/{v['giocate']} ({v['punti']:+} punti)" for v in sc["mese"].values()))
    return sistemare, stato


def main():
    sistemare, stato = raccogli()
    print("DA SISTEMARE:" if sistemare else "Settimana senza problemi.")
    for x in sistemare:
        print(" -", x)
    for x in stato:
        print("   ", x)
    if not TOKEN:
        return
    try:
        vecchi = gh("issues?labels=riepilogo&state=open") or []
        if sistemare:
            corpo = "\n".join([f"Riepilogo della settimana fino al {ORA.strftime('%d/%m/%Y')}.", "", "**Da sistemare**", ""] + [f"- {x}" for x in sistemare]
                              + ["", "<details><summary>Tutto il resto</summary>", ""] + [f"- {x}" for x in stato] + ["", "</details>"])
            gh("issues", "POST", {"title": f"AuraPitch: riepilogo settimanale del {ORA.strftime('%d/%m')}", "body": corpo, "labels": ["riepilogo"]})
        for v in vecchi:  # un solo riepilogo aperto: quello della settimana prima si chiude
            gh(v["url"], "PATCH", {"state": "closed", "state_reason": "completed"})
    except Exception as e:  # noqa: BLE001
        print("Avviso su GitHub non riuscito:", type(e).__name__)


if __name__ == "__main__":
    main()
