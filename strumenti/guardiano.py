"""AuraPitch - guardiano della sicurezza (ogni giorno, workflow "Guardiano della sicurezza"). Solo libreria standard.

Controlla, senza mai stampare valori segreti:
1. sito: HTTPS obbligatorio, regole di sicurezza della pagina (Content-Security-Policy, referrer) e intestazioni del sito;
2. servizio: risponde con le intestazioni di sicurezza, respinge le richieste alla cassaforte senza firma valida e quelle troppo
   grandi, applica i limiti di richieste (troppe richieste in un minuto = risposta 429);
3. GitHub: avvisi di sicurezza aperti su dipendenze, codice e segreti (se il permesso di lettura c'e);
4. file pubblici: nessun dato personale nei dati pubblicati (indirizzi email, telefoni, IBAN, iscrizioni alle notifiche);
5. cassaforte: i file dell'algoritmo (diario, modello, consigli, verifiche) non devono mai stare nel repository.
Esito in data/guardiano.json (solo per chi lo esegue) e codice di uscita 1 se c'e un problema: il controllo orario vede
l'esecuzione fallita e apre l'avviso su GitHub; il riepilogo settimanale riporta anche i punti "da tenere d'occhio"."""
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone

RADICE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO = os.environ.get("GITHUB_REPOSITORY", "ilFlagello/aurapitch")
TOKEN = os.environ.get("GITHUB_TOKEN", "")
SITO = "https://ilflagello.github.io/aurapitch/"
# file della cassaforte: vivono solo nell'archivio privato del servizio (strumenti/cassaforte.py)
CASSAFORTE = re.compile(r"^data/(diario/|modello\.json$|consigli\.json$|taratura_fattori\.json$|giocatori_verifica\.json$|taratura_giocatori\.json$|"
                        r"statistiche_verifica\.json$|taratura_statistiche\.json$|\.cassaforte)")
# dati personali che non devono mai comparire nei file pubblici
PERSONALI = {
    "indirizzo email": re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b"),
    "IBAN": re.compile(r"\bIT\d{2}[A-Z]\d{10}[0-9A-Z]{12}\b"),
    "numero di telefono": re.compile(r"(?<![\d.])\+39[ ]?3\d{2}[ ]?\d{6,7}\b"),
    "iscrizione alle notifiche": re.compile(r"\"endpoint\"\s*:\s*\"https://(fcm\.googleapis|updates\.push\.services\.mozilla|web\.push\.apple)"),
}
EMAIL_AMMESSE = {"aurapitch.app@gmail.com"}
problemi, attenzione, note = [], [], []


def richiesta(url, metodo="GET", corpo=None, intestazioni=None, gh=False):
    h = {"User-Agent": "aurapitch-guardiano"}
    h.update(intestazioni or {})
    if gh and TOKEN:
        h.update({"Authorization": "Bearer " + TOKEN, "Accept": "application/vnd.github+json"})
    req = urllib.request.Request(url, data=corpo, headers=h, method=metodo)
    try:
        with urllib.request.urlopen(req, timeout=25) as r:
            return r.status, dict(r.headers), r.read()
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers or {}), e.read() if hasattr(e, "read") else b""


def _h(hd, nome):
    return next((v for k, v in hd.items() if k.lower() == nome.lower()), None)


def controlla_sito():
    st, hd, corpo = richiesta(SITO)
    if st != 200:
        problemi.append(f"Sito: risponde {st}")
        return
    html = corpo.decode("utf-8", "ignore")
    csp = re.search(r'http-equiv="Content-Security-Policy" content="([^"]+)"', html)
    if not csp:
        problemi.append("Sito: manca la regola Content-Security-Policy nella pagina")
    else:
        c = csp.group(1)
        for parte in ("default-src 'self'", "script-src 'self'", "object-src 'none'", "base-uri 'self'"):
            if parte not in c:
                problemi.append(f"Sito: la Content-Security-Policy non contiene \"{parte}\"")
        if "'unsafe-eval'" in c or re.search(r"script-src[^;]*'unsafe-inline'", c):
            problemi.append("Sito: la Content-Security-Policy permette script non sicuri")
    if 'name="referrer"' not in html:
        attenzione.append("Sito: manca la regola sul referrer nella pagina")
    if not _h(hd, "Strict-Transport-Security"):
        attenzione.append("Sito: intestazione Strict-Transport-Security assente (dipende da GitHub Pages)")
    # la versione http deve portare a quella https (urllib segue il reindirizzamento: si guarda dove arriva)
    try:
        with urllib.request.urlopen(urllib.request.Request(SITO.replace("https://", "http://"), headers={"User-Agent": "aurapitch-guardiano"}), timeout=25) as r:
            if not r.geturl().startswith("https://"):
                problemi.append("Sito: la versione http non porta a https")
    except (urllib.error.URLError, OSError):
        attenzione.append("Sito: versione http non raggiungibile per la prova")
    note.append("Sito: HTTPS e regole della pagina controllati")


def controlla_servizio():
    st, _, corpo = richiesta(SITO + "data/push.json")
    try:
        url = json.loads(corpo)["url"].rstrip("/")
    except (ValueError, KeyError, TypeError):
        problemi.append("Servizio: indirizzo non leggibile (data/push.json)")
        return
    st, hd, _ = richiesta(url + "/")
    if st != 200:
        problemi.append(f"Servizio: risponde {st}")
        return
    for nome, atteso in (("X-Content-Type-Options", "nosniff"), ("Referrer-Policy", "no-referrer"), ("Cache-Control", "no-store")):
        if (_h(hd, nome) or "").lower() != atteso:
            problemi.append(f"Servizio: intestazione {nome} assente o diversa da \"{atteso}\"")
    origine = _h(hd, "Access-Control-Allow-Origin")
    if origine in (None, "*"):
        problemi.append(f"Servizio: chiunque puo usarlo dal browser (Access-Control-Allow-Origin = {origine})")
    # cassaforte senza firma: deve rispondere 403 (una sola prova al giorno: il controllo orario allarma sopra 3)
    st, _, _ = richiesta(url + "/cassaforte/leggi", "POST", b'{"nome":"modello.json"}', {"Content-Type": "application/json"})
    if st != 403:
        problemi.append(f"Servizio: la cassaforte senza firma risponde {st} invece di 403")
    # richiesta troppo grande: respinta prima di leggere la firma
    st, _, _ = richiesta(url + "/cassaforte/leggi", "POST", b"x" * 1700000, {"Content-Type": "application/json"})
    if st != 413:
        problemi.append(f"Servizio: una richiesta di 1,7 MB alla cassaforte risponde {st} invece di 413")
    # limite di richieste: /consenso ne accetta 30 al minuto per indirizzo
    codici = [richiesta(url + "/consenso")[0] for _ in range(40)]
    if 429 not in codici:
        attenzione.append("Servizio: 40 richieste in un minuto a /consenso senza nessun 429 (il limite e in memoria: puo dipendere da quale copia del servizio risponde)")
    else:
        note.append(f"Servizio: limite di richieste attivo (429 dopo {codici.index(429)} richieste)")


def controlla_github():
    if not TOKEN:
        note.append("GitHub: nessun token, avvisi di sicurezza non controllati")
        return
    for tipo, percorso in (("dipendenze (Dependabot)", "dependabot/alerts"), ("codice (CodeQL)", "code-scanning/alerts"), ("segreti", "secret-scanning/alerts")):
        st, _, corpo = richiesta(f"https://api.github.com/repos/{REPO}/{percorso}?state=open&per_page=100", gh=True)
        if st == 200:
            try:
                n = len(json.loads(corpo))
            except ValueError:
                n = 0
            (problemi if n and tipo == "segreti" else attenzione if n else note).append(f"Avvisi di sicurezza GitHub, {tipo}: {n} aperti")
            if n and tipo.startswith("codice"):
                # quali regole e dove (nessun valore segreto: solo nome della regola, file e riga), per poterli correggere
                try:
                    for a in json.loads(corpo)[:15]:
                        loc = (a.get("most_recent_instance") or {}).get("location") or {}
                        note.append(f"  CodeQL #{a.get('number')}: {(a.get('rule') or {}).get('id')} in {loc.get('path')}:{loc.get('start_line')}")
                except (ValueError, AttributeError, TypeError):
                    pass
        else:
            note.append(f"Avvisi di sicurezza GitHub, {tipo}: non leggibili (risposta {st}: permesso o funzione non attivi)")


def controlla_file():
    try:
        tracciati = subprocess.run(["git", "ls-files"], cwd=RADICE, capture_output=True, text=True, check=True).stdout.split("\n")
    except (OSError, subprocess.CalledProcessError):
        attenzione.append("File: elenco dei file del repository non leggibile")
        return
    dentro = [f for f in tracciati if CASSAFORTE.match(f)]
    if dentro:
        problemi.append("Cassaforte: file dell'algoritmo nel repository pubblico: " + ", ".join(dentro[:5]))
    else:
        note.append("Cassaforte: nessun file dell'algoritmo nel repository")
    trovati = []
    for f in tracciati:
        if not f.endswith(".json") or not f.startswith(("app/data/", "data/")):
            continue
        try:
            testo = open(os.path.join(RADICE, f), encoding="utf-8", errors="ignore").read()
        except OSError:
            continue
        testo = re.sub(r"https?://\S+?(?=[\"'\s])", "", testo)  # gli indirizzi web (notizie) possono contenere "@" o numeri
        for tipo, rx in PERSONALI.items():
            for x in rx.findall(testo)[:3]:
                v = x if isinstance(x, str) else "".join(x)
                if tipo == "indirizzo email" and (v.lower() in EMAIL_AMMESSE or v.lower().endswith(("@users.noreply.github.com", "@example.com"))):
                    continue
                trovati.append(f"{f} ({tipo})")
                break
    if trovati:
        problemi.append("Dati personali possibili nei file pubblici: " + ", ".join(sorted(set(trovati))[:8]))
    else:
        note.append("File pubblici: nessun dato personale trovato")


def main():
    for f in (controlla_file, controlla_sito, controlla_servizio, controlla_github):
        try:
            f()
        except Exception as e:  # noqa: BLE001 - un controllo che si rompe non deve fermare gli altri
            attenzione.append(f"{f.__name__}: non eseguito ({type(e).__name__})")
    print("PROBLEMI:" if problemi else "Sicurezza: nessun problema.")
    for x in problemi:
        print(" -", x)
    for x in attenzione:
        print("  da tenere d'occhio:", x)
    for x in note:
        print("   ", x)
    out = {"quando": datetime.now(timezone.utc).isoformat(timespec="minutes"), "problemi": problemi, "attenzione": attenzione, "note": note}
    with open(os.path.join(RADICE, "data", "guardiano.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    sys.exit(1 if problemi else 0)


if __name__ == "__main__":
    main()
