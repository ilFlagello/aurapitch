"""AuraPitch - controllo che nessuna chiave o token finisca nel repository pubblico (gira nei test a ogni modifica).
Cerca nei file tracciati da git le forme tipiche di token GitHub, Cloudflare, Google, chiavi private e simili.
Non stampa mai il valore trovato: solo file, riga e tipo."""
import re
import subprocess
import sys

MODELLI = {
    "token GitHub": r"\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}\b|\bgithub_pat_[A-Za-z0-9_]{40,}\b",
    "chiave privata": r"-----BEGIN (RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----",
    "chiave Google API": r"\bAIza[0-9A-Za-z_-]{35}\b",
    "segreto OAuth Google": r"\bGOCSPX-[A-Za-z0-9_-]{20,}\b",
    "token Slack": r"\bxox[abprs]-[A-Za-z0-9-]{10,}\b",
    "chiave AWS": r"\bAKIA[0-9A-Z]{16}\b",
    "chiave Stripe": r"\b(sk|rk)_live_[A-Za-z0-9]{20,}\b",
    "assegnazione sospetta": r"(?i)\b(api[_-]?key|secret|token|password)\b\s*[:=]\s*[\"'][A-Za-z0-9_\-]{24,}[\"']",
}
SALTA = (".png", ".woff2", ".gz", ".jpg", ".ico", ".pdf")
file = subprocess.run(["git", "ls-files"], capture_output=True, text=True, check=True).stdout.split("\n")
trovati = []
for f in file:
    if not f or f.endswith(SALTA) or f.startswith(("app/data/", "storico/", "data/")) or f == "strumenti/cerca_segreti.py":
        continue
    try:
        righe = open(f, encoding="utf-8", errors="ignore").read().split("\n")
    except OSError:
        continue
    for n, r in enumerate(righe, 1):
        for tipo, rx in MODELLI.items():
            if re.search(rx, r):
                trovati.append(f"{f}:{n} ({tipo})")
if trovati:
    print("ATTENZIONE: possibili segreti nel repository pubblico:")
    print("\n".join(" - " + x for x in trovati))
    sys.exit(1)
print(f"Nessun segreto trovato in {len([f for f in file if f])} file")
