"""AuraPitch - controllo automatico di salute (ogni ora). Se qualcosa non va apre un avviso su GitHub (issue con etichetta
"avviso": GitHub manda una mail al proprietario) e lo aggiorna; quando tutto torna a posto lo chiude da solo.
Controlla: dati aggiornati, ultime esecuzioni dei processi automatici, crediti delle quote, servizio notifiche, sito, ESPN.
Nessun valore segreto viene stampato: il token di GitHub arriva solo dall'ambiente del workflow."""
import json
import urllib.parse
import os
import sys
import urllib.request
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

REPO = os.environ.get("GITHUB_REPOSITORY", "ilFlagello/aurapitch")
TOKEN = os.environ.get("GITHUB_TOKEN", "")
ORA = datetime.now(timezone.utc)
problemi, note = [], []


def get(url, gh=False, metodo="GET", corpo=None):
    h = {"User-Agent": "aurapitch-controllo", "Accept": "application/json"}
    if gh and TOKEN:
        h["Authorization"] = "Bearer " + TOKEN
        h["Accept"] = "application/vnd.github+json"
    data = json.dumps(corpo).encode() if corpo is not None else None
    if data:
        h["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=h, method=metodo)
    with urllib.request.urlopen(req, timeout=25) as r:
        t = r.read()
        return r.status, (json.loads(t) if t and t[:1] in (b"{", b"[") else t)


# 1. dati dell'app aggiornati: di giorno (10-23 UTC) ogni 10 minuti, di notte fermi dopo l'ultimo giro
try:
    d = json.load(open("app/data/giornata.json", encoding="utf-8"))
    gen = datetime.strptime(d["generato"], "%d/%m/%Y %H:%M").replace(tzinfo=ZoneInfo("Europe/Rome"))
    eta = (ORA - gen).total_seconds() / 3600
    limite = 1 if 11 <= ORA.hour <= 23 else (8 if ORA.hour < 7 else 3)
    (problemi if eta > limite else note).append(f"Dati dell'app aggiornati {eta:.1f} ore fa (limite {limite} h)")
    n = len(d.get("matches", []))
    if n == 0:
        problemi.append("Il file dell'app non contiene partite")
    note.append(f"Partite nel file: {n}")
except Exception as e:
    problemi.append(f"File dei dati dell'app illeggibile: {type(e).__name__}")

# 2. ultime esecuzioni dei processi automatici
for wf, nome in (("raccolta.yml", "Raccolta dati"), ("pubblica.yml", "Pubblicazione app"), ("notifiche.yml", "Servizio notifiche"), ("test.yml", "Test"), ("impara.yml", "Apprendimento"), ("ripristino.yml", "Prova della copia di sicurezza"), ("codeql.yml", "Analisi sicurezza")):
    try:
        _, j = get(f"https://api.github.com/repos/{REPO}/actions/workflows/{wf}/runs?per_page=5&status=completed", gh=True)
        runs = [r for r in j.get("workflow_runs", []) if r["conclusion"] != "cancelled"]
        if runs and runs[0]["conclusion"] not in ("success", "skipped"):
            problemi.append(f"{nome}: l'ultima esecuzione è finita con \"{runs[0]['conclusion']}\" ({runs[0]['html_url']})")
        else:
            note.append(f"{nome}: ok")
    except Exception as e:
        note.append(f"{nome}: stato non leggibile ({type(e).__name__})")

# 2b. apprendimento: il modello si aggiorna ogni mattina
try:
    ia = json.load(open("app/data/ia.json", encoding="utf-8"))  # il modello vero sta nella cassaforte; qui il suo riassunto pubblico
    agg = datetime.fromisoformat(ia["generato"])
    giorni = (ORA - agg).total_seconds() / 86400
    (problemi if giorni > 2.5 else note).append(f"Modello dell'IA aggiornato {giorni:.1f} giorni fa ({(ia.get('modello') or {}).get('nome', '?')})")
except Exception as e:
    note.append(f"Modello dell'IA non leggibile ({type(e).__name__})")

# 3. crediti di The Odds API: riserva per il giro del mattino fino a fine mese
try:
    c = json.load(open("data/crediti_quote.json", encoding="utf-8"))
    fine = (ORA.replace(day=28) + timedelta(days=4)).replace(day=1)
    giorni = max(1, (fine.date() - ORA.date()).days)
    serve = giorni * 14
    testo = f"Crediti quote rimasti: {c['rimasti']} (servono circa {serve} per i giri del mattino fino a fine mese)"
    (problemi if c["rimasti"] < serve else note).append(testo)
except Exception as e:
    note.append(f"Crediti quote: non leggibili ({type(e).__name__})")

# 4. servizio notifiche: risponde e l'orologio avvia la raccolta
try:
    _, p = get("https://ilflagello.github.io/aurapitch/data/push.json")
    _, dg = get(p["url"] + "/diagnosi")
    o = dg.get("orologio") or {}
    t = datetime.fromisoformat(o["t"].replace("Z", "+00:00")) if o.get("t") else None
    if 10 <= ORA.hour <= 23 and (not t or (ORA - t) > timedelta(minutes=40)):
        problemi.append("Orologio della raccolta fermo: ultimo avvio " + (t.isoformat() if t else "mai"))
    elif o.get("esito") not in (None, 204):
        problemi.append(f"Orologio della raccolta: GitHub ha risposto {o.get('esito')} (token scaduto?)")
    else:
        note.append(f"Servizio notifiche: ok ({dg.get('iscrizioni')} iscrizioni, archivio {(dg.get('archivio') or {}).get('tipo', dg.get('archivio'))})")
except Exception as e:
    problemi.append(f"Servizio notifiche non raggiungibile ({type(e).__name__})")

# 4a. allarmi di sicurezza: tentativi respinti oggi (firme false, codici sbagliati, raffiche di richieste)
SOGLIE = {"cassaforte_firma": 3, "admin_errato": 5, "ritiro_errato": 5, "passkey_rifiutata": 40, "google_rifiutato": 40, "sessione_non_valida": 300, "limite": 3000}
try:
    sic = dg.get("sicurezza") or {}
    oltre = [f"{k} {v} (soglia {SOGLIE[k]})" for k, v in sic.items() if k in SOGLIE and v > SOGLIE[k]]
    if oltre:
        problemi.append("Possibile attacco o abuso, oggi: " + ", ".join(oltre))
    else:
        note.append("Sicurezza: nessuna anomalia (" + (", ".join(f"{k} {v}" for k, v in sic.items()) or "nessun tentativo respinto") + ")")
except Exception as e:
    note.append(f"Sicurezza: conteggi non leggibili ({type(e).__name__})")

# 4b. ponte privacy (diretta ESPN attraverso il servizio) e accesso
try:
    _, p = get("https://ilflagello.github.io/aurapitch/data/push.json")
    get(p["url"] + "/x?u=" + urllib.parse.quote("https://site.api.espn.com/apis/site/v2/sports/soccer/ita.1/scoreboard", safe=""))
    note.append("Ponte privacy per la diretta: ok")
    _, cf = get(p["url"] + "/auth/config")
    note.append("Accesso con Google: " + ("configurato" if cf.get("google") else "non ancora configurato") + "; passkey: attive")
except Exception as e:
    problemi.append(f"Ponte privacy o accesso non raggiungibili ({type(e).__name__})")

# 5. sito pubblicato e fonte della diretta
for url, nome in (("https://ilflagello.github.io/aurapitch/data/lista.json", "Sito dell'app"),
                  ("https://site.api.espn.com/apis/site/v2/sports/soccer/ita.1/scoreboard", "ESPN (diretta, formazioni)")):
    try:
        s, _ = get(url)
        note.append(f"{nome}: ok")
    except Exception as e:
        problemi.append(f"{nome} non raggiungibile ({type(e).__name__})")

print("PROBLEMI:" if problemi else "Tutto in ordine.")
for x in problemi:
    print(" -", x)
for x in note:
    print("   ", x)

# avviso su GitHub: una sola issue aperta con etichetta "avviso", aggiornata o chiusa
if TOKEN:
    try:
        _, aperte = get(f"https://api.github.com/repos/{REPO}/issues?labels=avviso&state=open", gh=True)
        corpo = "\n".join(["Il controllo automatico ha trovato questi problemi:", ""] + [f"- {x}" for x in problemi] + ["", "Il resto:", ""] + [f"- {x}" for x in note]
                          + ["", f"Ultimo controllo: {ORA.strftime('%d/%m/%Y %H:%M')} UTC. L'avviso si chiude da solo quando tutto torna a posto."])
        if problemi and not aperte:
            get(f"https://api.github.com/repos/{REPO}/issues", gh=True, metodo="POST", corpo={"title": "AuraPitch: qualcosa non funziona", "body": corpo, "labels": ["avviso"]})
        elif problemi and aperte:
            get(aperte[0]["url"], gh=True, metodo="PATCH", corpo={"body": corpo})
        elif aperte:
            for a in aperte:
                get(a["url"] + "/comments", gh=True, metodo="POST", corpo={"body": "Tutto di nuovo in ordine. " + ORA.strftime("%d/%m/%Y %H:%M") + " UTC"})
                get(a["url"], gh=True, metodo="PATCH", corpo={"state": "closed"})
    except Exception as e:
        print("Avviso su GitHub non riuscito:", type(e).__name__)
sys.exit(1 if problemi else 0)
