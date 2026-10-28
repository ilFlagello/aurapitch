"""AuraPitch - cassaforte dell'algoritmo: diario delle previsioni, modello imparato, storico dei consigli.

Questi file non stanno nel repository pubblico: vivono nell'archivio privato del servizio AuraPitch (Cloudflare).
I processi automatici li scaricano all'inizio ("apri") e rimandano solo quelli cambiati alla fine ("chiudi").
Ogni richiesta e firmata (HMAC-SHA256) con il token GH_DISPATCH_TOKEN, che il servizio conosce gia e che non viaggia mai.
Uso:  python3 strumenti/cassaforte.py apri [--tutto]   |   python3 strumenti/cassaforte.py chiudi
Senza token (prove in locale) non fa nulla: gli script lavorano sui file presenti, se ci sono.
"""
import base64
import glob
import hashlib
import hmac
import json
import os
import sys
import time
import urllib.request
from datetime import datetime, timedelta, timezone

RADICE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(RADICE, "data")
IMPRONTE = os.path.join(DATA, ".cassaforte.json")  # impronte dei file scaricati: si rimanda solo cio che cambia
APERTA = os.path.join(DATA, ".cassaforte_aperta")  # senza un'apertura riuscita non si rimanda nulla (niente storico sovrascritto)
FISSI = ["modello.json", "consigli.json"]


def _b64u(b):
    return base64.urlsafe_b64encode(b).decode().rstrip("=")


def _url():
    with open(os.path.join(RADICE, "app", "data", "push.json"), encoding="utf-8") as f:
        return json.load(f)["url"]


def firma(token, percorso, testo, ts=None):
    """Intestazione X-Firma: "ts.HMAC-SHA256(token, ts \\n percorso \\n sha256(corpo))" (verificata da worker/accesso.js)."""
    ts = ts or str(int(time.time()))
    h = hmac.new(token.encode(), f"{ts}\n{percorso}\n{_b64u(hashlib.sha256(testo.encode()).digest())}".encode(), hashlib.sha256).digest()
    return ts + "." + _b64u(h)


def chiama(percorso, corpo):
    testo = json.dumps(corpo, ensure_ascii=False, separators=(",", ":"))
    req = urllib.request.Request(_url() + percorso, data=testo.encode(), method="POST",
                                 headers={"Content-Type": "application/json", "X-Firma": firma(os.environ.get("GH_DISPATCH_TOKEN", ""), percorso, testo), "User-Agent": "aurapitch-cassaforte"})
    for prova in range(3):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read().decode())
        except urllib.error.HTTPError as e:
            if e.code in (400, 403, 413):
                raise RuntimeError(f"cassaforte: {percorso} rifiutata ({e.code})") from None
            if prova == 2:
                raise
        except (urllib.error.URLError, TimeoutError):
            if prova == 2:
                raise
        time.sleep(2 + 3 * prova)


def _impronta(p):
    with open(p, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()


def apri(tutto=False):
    """Scarica i file: il modello, lo storico dei consigli e il diario (ultimi 10 giorni, o tutto per l'apprendimento)."""
    nomi = chiama("/cassaforte/elenco", {}).get("nomi", [])
    limite = (datetime.now(timezone.utc).date() - timedelta(days=10)).isoformat()
    scelti = [n for n in nomi if n in FISSI or n == "taratura_fattori.json" or (n.startswith("diario/") and (tutto or n[7:17] >= limite))]
    impronte = {}
    for n in scelti:
        t = chiama("/cassaforte/leggi", {"nome": n}).get("testo")
        if t is None:
            continue
        p = os.path.join(DATA, n)
        os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p, "w", encoding="utf-8") as f:
            f.write(t)
        impronte[n] = _impronta(p)
    with open(IMPRONTE, "w", encoding="utf-8") as f:
        json.dump(impronte, f)
    with open(APERTA, "w", encoding="utf-8") as f:
        f.write(datetime.now(timezone.utc).isoformat())
    print(f"Cassaforte aperta: {len(scelti)} file su {len(nomi)}")


def chiudi():
    """Rimanda alla cassaforte i file nuovi o cambiati (solo se all'inizio la cassaforte si era aperta davvero)."""
    if not os.path.exists(APERTA):
        print("Cassaforte: non era stata aperta, non rimando nulla (lo storico resta intatto)")
        return
    try:
        with open(IMPRONTE, encoding="utf-8") as f:
            impronte = json.load(f)
    except (OSError, ValueError):
        impronte = {}
    candidati = [os.path.join(DATA, n) for n in FISSI + ["taratura_fattori.json"]] + sorted(glob.glob(os.path.join(DATA, "diario", "*.json")))
    n = 0
    for p in candidati:
        if not os.path.exists(p):
            continue
        nome = os.path.relpath(p, DATA).replace(os.sep, "/")
        if impronte.get(nome) == _impronta(p):
            continue
        with open(p, encoding="utf-8") as f:
            testo = f.read()
        if len(testo) > 1500000:
            print(f"Cassaforte: {nome} troppo grande, saltato")
            continue
        chiama("/cassaforte/scrivi", {"nome": nome, "testo": testo})
        impronte[nome] = _impronta(p)
        n += 1
    with open(IMPRONTE, "w", encoding="utf-8") as f:
        json.dump(impronte, f)
    print(f"Cassaforte chiusa: {n} file aggiornati")


if __name__ == "__main__":
    if not os.environ.get("GH_DISPATCH_TOKEN"):
        print("Cassaforte: nessun token (prova locale), salto")
        sys.exit(0)
    azione = sys.argv[1] if len(sys.argv) > 1 else ""
    if azione == "apri":
        apri("--tutto" in sys.argv)
    elif azione == "chiudi":
        chiudi()
    else:
        print(__doc__)
