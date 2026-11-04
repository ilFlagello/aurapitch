"""AuraPitch - controllo delle parti inutilizzate (ogni lunedi nel riepilogo settimanale, o a mano). Solo libreria standard.
Non cancella nulla: trova cosa si potrebbe togliere per tenere il progetto snello e lo dice in parole semplici.
Controlla:
 1. codice morto: funzioni e costanti Python e JavaScript scritte ma mai usate da nessuna parte;
 2. file di codice orfani: file .py o .js che nessun altro file nomina;
 3. archivi in storico/: quelli che nessun processo automatico legge (servono solo a studi fatti a mano) e quanto pesano;
 4. processi su GitHub che si avviano solo a mano e non girano da piu di 45 giorni;
 5. rami su GitHub gia uniti o fermi da piu di 7 giorni senza una pull request aperta;
 6. crescita: cartelle giornaliere in data/ (genera_app.py le legge tutte a ogni giro) e peso di ogni scaricamento del progetto.
Le cose tenute apposta stanno in TENUTI con il motivo, cosi non vengono segnalate ogni settimana.
Esito in data/pulizia.json (mai nel repository): "da_togliere" (sicuramente inutile), "da_valutare" (forse inutile), "note".
Il riepilogo del lunedi mette "da_togliere" tra le cose da sistemare."""
import ast
import json
import os
import re
import subprocess
import sys
import urllib.request
from datetime import datetime, timedelta, timezone

RADICE = os.environ.get("PULIZIA_RADICE") or os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO = os.environ.get("GITHUB_REPOSITORY", "ilFlagello/aurapitch")
TOKEN = os.environ.get("GITHUB_TOKEN", "")
ORA = datetime.now(timezone.utc)
ESCLUSE = ("app/data/", "data/", "storico/", "app/dist/", "app/node_modules/", "app/vendor/", "test/schermate/")
CODICE = (".py", ".js", ".mjs", ".yml", ".yaml", ".html")
TESTO = CODICE + (".json", ".css", ".md", ".txt", ".toml", ".webmanifest")
# tenuti apposta: nome (funzione, file, archivio o processo) -> motivo. Non vengono segnalati.
TENUTI = {
    "storico.yml": "scarica a mano gli archivi storici per gli studi dell'algoritmo",
    "meteo.yml": "rifa a mano lo studio sul meteo (archivio riscaricato da zero)",
    "prova_fonti.yml": "prova a mano nuove fonti di quote e calendari",
    "storico/test_meteo.json": "risultato dello studio sul meteo (il meteo non migliora le previsioni)",
    "storico/test_allenatori.json": "risultato dello studio sugli allenatori",
    "storico/prova_fonti.json": "risultato dell'ultima prova delle fonti",
    "storico/esito.txt": "registro dell'ultimo scaricamento a mano degli archivi",
}
RAMI_FISSI = {"main", "gh-pages"}
GIORNI_FERMO = 45
CARTELLE_MAX = 60       # cartelle giornaliere in data/ oltre cui genera_app.py legge troppo a ogni giro
SCARICO_MAX = 80e6      # peso massimo di ogni scaricamento del progetto (byte)
da_togliere, da_valutare, note = [], [], []


def file_tracciati():
    """File del repository (git ls-files se disponibile, altrimenti tutta la cartella)."""
    try:
        r = subprocess.run(["git", "-C", RADICE, "ls-files"], capture_output=True, text=True, timeout=60)
        if r.returncode == 0 and r.stdout.strip():
            return [x for x in r.stdout.split("\n") if x]
    except (OSError, subprocess.SubprocessError):
        pass
    out = []
    for cart, dirs, files in os.walk(RADICE):
        dirs[:] = [d for d in dirs if d not in (".git", "node_modules", "dist", "__pycache__")]
        out += [os.path.relpath(os.path.join(cart, f), RADICE).replace(os.sep, "/") for f in files]
    return out


def leggi(rel):
    try:
        with open(os.path.join(RADICE, rel), encoding="utf-8", errors="ignore") as f:
            return f.read()
    except OSError:
        return ""


def peso(rel):
    try:
        return os.path.getsize(os.path.join(RADICE, rel))
    except OSError:
        return 0


def mb(b):
    return f"{b / 1e6:.1f} MB" if b >= 1e5 else f"{b / 1e3:.0f} KB"


def conta(nome, testi):
    pat = re.compile(r"(?<![\w$])" + re.escape(nome) + r"(?![\w$])")
    return {f: len(pat.findall(t)) for f, t in testi.items() if pat.search(t)}


def nomi_python(testo):
    """Funzioni, classi e costanti di primo livello di un file Python, con la riga."""
    out = []
    for n in ast.parse(testo).body:
        if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            out.append((n.name, n.lineno))
        elif isinstance(n, ast.Assign):
            out += [(t.id, n.lineno) for t in n.targets if isinstance(t, ast.Name)]
    return [(x, r) for x, r in out if x != "main" and not x.startswith("__") and len(x) > 2]


def nomi_js(testo):
    """Funzioni e costanti dichiarate in un file JavaScript (anche dentro altre funzioni), con la riga."""
    out = []
    for m in re.finditer(r"(?:^|[\s;{(])(?:export\s+)?(?:async\s+)?(?:function\s*\*?\s*([A-Za-z_$][\w$]*)\s*\(|(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=|class\s+([A-Za-z_$][\w$]*))", testo):
        nome = m.group(1) or m.group(2) or m.group(3)
        if len(nome) > 2:
            out.append((nome, testo.count("\n", 0, m.start()) + 1))
    return out


def solo_esportato(nome, testo):
    """Il nome compare, oltre alla dichiarazione, solo in una riga export { ... } dello stesso file."""
    return any(re.search(r"(?<![\w$])" + re.escape(nome) + r"(?![\w$])", blk) for blk in re.findall(r"export\s*\{([^}]*)\}", testo))


def codice_morto(testi):
    codice = {f: t for f, t in testi.items() if f.endswith(CODICE)}
    for f in sorted(codice):
        if f.startswith(("test/", ".github/")) or "/test_" in f or f.endswith("build.mjs"):
            continue
        t = codice[f]
        if f.endswith(".py"):
            try:
                nomi = nomi_python(t)
            except SyntaxError:
                continue
        elif f.endswith((".js", ".mjs")):
            nomi = nomi_js(t)
        else:
            continue
        visti = set()
        for nome, riga in nomi:
            if nome in visti or nome in TENUTI or f"{f}:{nome}" in TENUTI:
                continue
            visti.add(nome)
            usi = conta(nome, codice)
            tot = sum(usi.values())
            fuori_test = sum(n for g, n in usi.items() if not g.startswith("test/") and "/test_" not in g)
            if tot == 1 or (tot == 2 and usi.get(f) == 2 and solo_esportato(nome, t)):
                da_togliere.append(f"Codice mai usato: {nome} in {f} (riga {riga})")
            elif fuori_test == 1 or (fuori_test == 2 and usi.get(f) == 2 and solo_esportato(nome, t)):
                da_valutare.append(f"Codice usato solo nei test: {nome} in {f} (riga {riga})")


def file_orfani(testi):
    for f in sorted(testi):
        if not f.endswith((".py", ".js", ".mjs")) or f.startswith(("test/", ".github/")) or "/test_" in f or f in TENUTI:
            continue
        base, stem = os.path.basename(f), os.path.splitext(os.path.basename(f))[0]
        pat = re.compile(r"(?<![\w])" + re.escape(stem) + r"(?![\w])")
        if not any(g != f and (base in t or pat.search(t)) for g, t in testi.items()):
            da_togliere.append(f"File di codice che nessuno usa: {f} ({mb(peso(f))})")


def workflow(testi):
    """(automatici, manuali): processi con un avvio automatico (orario, salvataggio, altro processo) e processi solo a mano."""
    auto, mano = {}, {}
    for f, t in testi.items():
        if f.startswith(".github/workflows/") and f.endswith((".yml", ".yaml")):
            on = re.search(r"^on:(.*?)(?=^\w)", t + "\nfine:", re.S | re.M)
            blocco = on.group(1) if on else ""
            (auto if re.search(r"\b(schedule|push|pull_request|workflow_run|repository_dispatch)\b", blocco) else mano)[f] = t
    return auto, mano


def script_in_uso(testi, auto):
    """Programmi lanciati dai processi automatici, con i moduli che importano (a cascata), piu app e servizio."""
    py = {os.path.splitext(os.path.basename(f))[0]: f for f in testi if f.endswith(".py")}
    uso = set()
    for t in auto.values():
        uso |= {m.replace("\\", "/") for m in re.findall(r"python3?\s+(?:-\w+\s+)*([\w/.-]+\.py)", t)}
        uso |= {py[m] for m in re.findall(r"(?:import|from)\s+(\w+)", t) if m in py}
    coda = list(uso)
    while coda:
        f = coda.pop()
        for m in re.findall(r"^\s*(?:import\s+(\w+)|from\s+(\w+)\s+import)", testi.get(f, ""), re.M):
            g = py.get(m[0] or m[1])
            if g and g not in uso:
                uso.add(g)
                coda.append(g)
    uso |= {f for f in testi if f.startswith(("app/src/", "worker/", "app/")) and f.endswith((".js", ".mjs", ".html"))}
    return uso


def archivi(tracciati, testi, uso):
    """File e cartelle di storico/ che nessun programma in uso nomina."""
    gruppi = {}
    for f in tracciati:
        if f.startswith("storico/"):
            parti = f.split("/")
            chiave = "/".join(parti[:2]) + ("/" if len(parti) > 2 else "")
            gruppi.setdefault(chiave, []).append(f)
    letti = "\n".join(testi[f] for f in uso if f in testi)
    for chiave, files in sorted(gruppi.items()):
        nome = chiave.rstrip("/").split("/")[-1]
        if chiave.rstrip("/") in TENUTI or chiave in TENUTI:
            continue
        tot = sum(peso(f) for f in files)
        # si cerca il percorso (storico/meteo, "storico", "meteo") o il nome con l'estensione: una parola comune come "meteo"
        # compare anche nel codice dell'app senza riferirsi all'archivio
        pat = re.compile(r"storico\W{0,4}" + re.escape(nome) + r"(?![\w])" + ("" if chiave.endswith("/") else r"|(?<![\w])" + re.escape(nome) + r"(?![\w])"))
        if pat.search(letti):
            continue
        usato_da = sorted({os.path.basename(g) for g, t in testi.items() if g not in uso and pat.search(t)})
        riga = f"Archivio che nessun processo automatico legge: {chiave} ({len(files)} file, {mb(tot)})"
        (da_togliere if not usato_da else da_valutare).append(riga + (f", usato solo da {', '.join(usato_da[:4])}" if usato_da else ""))


def gh(percorso):
    req = urllib.request.Request(f"https://api.github.com/repos/{REPO}/{percorso}", headers={
        "User-Agent": "aurapitch-pulizia", "Accept": "application/vnd.github+json", "Authorization": "Bearer " + TOKEN})
    with urllib.request.urlopen(req, timeout=25) as r:
        return json.loads(r.read() or b"null")


def processi_fermi(mano):
    if not TOKEN:
        note.append("Processi e rami su GitHub non controllati (manca il permesso di lettura)")
        return
    for f in sorted(mano):
        nome = os.path.basename(f)
        if nome in TENUTI:
            continue
        try:
            runs = (gh(f"actions/workflows/{nome}/runs?per_page=1") or {}).get("workflow_runs", [])
        except Exception as e:  # noqa: BLE001
            note.append(f"Processo {nome}: esecuzioni non leggibili ({type(e).__name__})")
            continue
        if not runs:
            da_valutare.append(f"Processo avviabile solo a mano e mai usato: {nome}")
            continue
        giorni = (ORA - datetime.fromisoformat(runs[0]["created_at"].replace("Z", "+00:00"))).days
        if giorni > GIORNI_FERMO:
            da_valutare.append(f"Processo avviabile solo a mano, fermo da {giorni} giorni: {nome}")


def rami_vecchi():
    if not TOKEN:
        return
    try:
        rami = []
        for pag in range(1, 6):
            blocco = gh(f"branches?per_page=100&page={pag}") or []
            rami += blocco
            if len(blocco) < 100:
                break
        prs = []
        for stato in ("open", "closed"):
            prs += gh(f"pulls?state={stato}&per_page=100") or []
    except Exception as e:  # noqa: BLE001
        note.append(f"Rami su GitHub non leggibili ({type(e).__name__})")
        return
    aperti = {p["head"]["ref"] for p in prs if p["state"] == "open"}
    uniti = {p["head"]["ref"] for p in prs if p["state"] == "closed" and p.get("merged_at")}
    vecchi = []
    for r in rami:
        n = r["name"]
        if n in RAMI_FISSI or n in aperti or n in TENUTI:
            continue
        if n in uniti:
            vecchi.append(n)
            continue
        try:
            quando = gh(f"commits/{r['commit']['sha']}")["commit"]["committer"]["date"]
            if (ORA - datetime.fromisoformat(quando.replace("Z", "+00:00"))).days > 7:
                vecchi.append(n)
        except Exception:  # noqa: BLE001
            continue
    if vecchi:
        da_togliere.append(f"Rami su GitHub gia uniti o fermi da oltre 7 giorni ({len(vecchi)}): {', '.join(sorted(vecchi))}. "
                           "Si cancellano da Branches; per non doverlo piu fare: Settings > General > 'Automatically delete head branches'")


def crescita(tracciati):
    giorni = sorted({f.split("/")[1] for f in tracciati if re.match(r"data/\d{4}-\d{2}-\d{2}/", f)})
    peso_g = sum(peso(f) for f in tracciati if re.match(r"data/\d{4}-\d{2}-\d{2}/", f))
    riga = f"Cartelle giornaliere in data/: {len(giorni)} ({mb(peso_g)})" + (f", dal {giorni[0]}" if giorni else "")
    (da_valutare if len(giorni) > CARTELLE_MAX else note).append(
        riga + (": genera_app.py le legge tutte a ogni giro, conviene leggere solo le piu recenti o spostare le vecchie nella cassaforte" if len(giorni) > CARTELLE_MAX else ""))
    tot = sum(peso(f) for f in tracciati)
    cart = {}
    for f in tracciati:
        cart[f.split("/")[0]] = cart.get(f.split("/")[0], 0) + peso(f)
    grandi = ", ".join(f"{k} {mb(v)}" for k, v in sorted(cart.items(), key=lambda x: -x[1])[:4])
    (da_valutare if tot > SCARICO_MAX else note).append(f"Peso di ogni scaricamento del progetto: {mb(tot)} (piu grandi: {grandi})")


def main():
    tracciati = file_tracciati()
    testi = {f: leggi(f) for f in tracciati if f.endswith(TESTO) and not f.startswith(ESCLUSE)}
    auto, mano = workflow(testi)
    passi = [("codice morto", lambda: codice_morto(testi)), ("file orfani", lambda: file_orfani(testi)),
             ("archivi", lambda: archivi(tracciati, testi, script_in_uso(testi, auto))), ("processi", lambda: processi_fermi(mano)),
             ("rami", rami_vecchi), ("crescita", lambda: crescita(tracciati))]
    for nome, fn in passi:
        try:
            fn()
        except Exception as e:  # noqa: BLE001 - un controllo rotto si segnala, non ferma gli altri
            note.append(f"Controllo {nome} non riuscito: {type(e).__name__}")
    esito = {"quando": ORA.isoformat(timespec="minutes"), "da_togliere": da_togliere, "da_valutare": da_valutare, "note": note}
    os.makedirs(os.path.join(RADICE, "data"), exist_ok=True)
    with open(os.path.join(RADICE, "data", "pulizia.json"), "w", encoding="utf-8") as f:
        json.dump(esito, f, ensure_ascii=False, indent=1)
    print("Pulizia: " + ("ci sono parti da togliere" if da_togliere else "niente da togliere") + ".")
    for x in da_togliere:
        print("  DA TOGLIERE: " + x)
    for x in da_valutare:
        print("  da valutare: " + x)
    for x in note:
        print("    " + x)
    return 0


if __name__ == "__main__":
    sys.exit(main())
