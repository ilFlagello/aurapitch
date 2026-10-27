"""AuraPitch - raccoglitore dati della fase 2.

Scarica ogni giorno, entro i limiti dei piani gratuiti:
  - API-Football (100 richieste/giorno): partite del giorno, infortuni, formazioni (vicino al calcio d'inizio), quote di piu bookmaker
  - The Odds API (500 crediti/mese): quote 1X2 e Over/Under di decine di bookmaker europei
e calcola la QUOTA MEDIA di ogni esito (media delle quote di tutti i bookmaker disponibili).
Salva tutto in data/AAAA-MM-GG/: le risposte originali (per poter rifare i calcoli) e un riepilogo partite.csv.

Uso:
  export API_FOOTBALL_KEY=...   (da dashboard.api-football.com, Account -> My Access)
  export ODDS_API_KEY=...       (dalla mail di the-odds-api.com)
  python3 raccoglitore.py                 # giro completo di oggi
  python3 raccoglitore.py --formazioni    # solo formazioni delle partite che iniziano entro 90 minuti
Pensato per girare in automatico (per esempio con GitHub Actions): una volta al mattino il giro completo,
ogni 30 minuti nei giorni di partita il giro "--formazioni".
Usa solo la libreria standard di Python: nessuna installazione richiesta.
"""
import csv
import json
import os
import sys
import time
import urllib.parse
import urllib.request
from collections import defaultdict
from datetime import datetime, timedelta, timezone

# Campionati: id API-Football e titolo usato da The Odds API (la chiave viene cercata nell'elenco ufficiale, che e gratuito)
LEAGUES = [
    {"nome": "Serie A", "af": 135, "odds_title": "Serie A - Italy", "odds_key": "soccer_italy_serie_a"},
    {"nome": "Serie B", "af": 136, "odds_title": "Serie B - Italy", "odds_key": "soccer_italy_serie_b"},
    {"nome": "Premier League", "af": 39, "odds_title": "EPL", "odds_key": "soccer_epl"},
    {"nome": "Championship", "af": 40, "odds_title": "Championship", "odds_key": "soccer_efl_champ"},
    {"nome": "LaLiga", "af": 140, "odds_title": "La Liga - Spain", "odds_key": "soccer_spain_la_liga"},
    {"nome": "LaLiga 2", "af": 141, "odds_title": "La Liga 2 - Spain", "odds_key": "soccer_spain_segunda_division"},
    {"nome": "Bundesliga", "af": 78, "odds_title": "Bundesliga - Germany", "odds_key": "soccer_germany_bundesliga"},
    {"nome": "2. Bundesliga", "af": 79, "odds_title": "Bundesliga 2 - Germany", "odds_key": "soccer_germany_bundesliga2"},
    {"nome": "Champions League", "af": 2, "odds_title": "UEFA Champions League", "odds_key": "soccer_uefa_champs_league"},
]
# The Odds API: 2 crediti per campionato (mercati h2h + totals, area eu). 6 campionati al giorno = circa 360 crediti al mese su 500.
ODDS_API_LEAGUES = ["Serie A", "Serie B", "Premier League", "LaLiga", "Bundesliga", "Champions League"]
AF_BASE = "https://v3.football.api-sports.io"
ODDS_BASE = "https://api.the-odds-api.com/v4"
AF_RISERVA = 5  # richieste API-Football da lasciare sempre libere
TZ = "Europe/Rome"


class Budget:
    def __init__(self):
        self.af_rimaste = None
        self.odds_rimasti = None


BUDGET = Budget()


def get(url, headers=None):
    req = urllib.request.Request(url, headers=headers or {})
    with urllib.request.urlopen(req, timeout=30) as r:
        body = json.loads(r.read().decode("utf-8"))
        return body, {k.lower(): v for k, v in r.headers.items()}


def af(path, **params):
    """Chiamata ad API-Football con controllo del budget giornaliero."""
    key = os.environ.get("API_FOOTBALL_KEY")
    if not key:  # fonte facoltativa: senza chiave si va avanti con le altre
        return None
    if BUDGET.af_rimaste is not None and BUDGET.af_rimaste <= AF_RISERVA:
        print(f"  [API-Football] budget quasi esaurito ({BUDGET.af_rimaste} rimaste): salto {path}")
        return None
    body, h = get(f"{AF_BASE}{path}?{urllib.parse.urlencode(params)}", {"x-apisports-key": key})
    if "x-ratelimit-requests-remaining" in h:
        BUDGET.af_rimaste = int(h["x-ratelimit-requests-remaining"])
    if body.get("errors"):
        print(f"  [API-Football] {path} {params}: {body['errors']}")
    time.sleep(6.5)  # il piano gratuito limita anche le richieste al minuto
    return body


def odds_api(path, **params):
    key = os.environ.get("ODDS_API_KEY")
    if not key:
        return None, {}
    params["apiKey"] = key
    body, h = get(f"{ODDS_BASE}{path}?{urllib.parse.urlencode(params)}")
    if "x-requests-remaining" in h:
        BUDGET.odds_rimasti = h["x-requests-remaining"]
    return body, h


# ---------- calcolo della quota media ----------

def media_af(odds_item):
    """Quote API-Football di una partita -> quota media per esito (1, X, 2, Over 2.5, Under 2.5)."""
    raccolta = defaultdict(list)
    for bk in odds_item.get("bookmakers", []):
        for bet in bk.get("bets", []):
            if bet.get("name") == "Match Winner":
                for v in bet.get("values", []):
                    k = {"Home": "1", "Draw": "X", "Away": "2"}.get(v.get("value"))
                    if k:
                        raccolta[k].append(float(v["odd"]))
            elif bet.get("name") == "Goals Over/Under":
                for v in bet.get("values", []):
                    if v.get("value") in ("Over 2.5", "Under 2.5"):
                        raccolta[v["value"]].append(float(v["odd"]))
    return raccolta


def media_oddsapi(event):
    """Evento The Odds API -> quota per esito, per ogni bookmaker."""
    raccolta = defaultdict(list)
    home, away = event.get("home_team"), event.get("away_team")
    for bk in event.get("bookmakers", []):
        for mk in bk.get("markets", []):
            if mk.get("key") == "h2h":
                for o in mk.get("outcomes", []):
                    k = "1" if o["name"] == home else "2" if o["name"] == away else "X" if o["name"] == "Draw" else None
                    if k:
                        raccolta[k].append(float(o["price"]))
            elif mk.get("key") == "totals":
                for o in mk.get("outcomes", []):
                    if float(o.get("point", 0)) == 2.5 and o["name"] in ("Over", "Under"):
                        raccolta[f"{o['name']} 2.5"].append(float(o["price"]))
    return raccolta


def riassunto(raccolta):
    """Quota media, numero di bookmaker e probabilita 'pulita' (senza il margine del bookmaker)."""
    out = {}
    for k, v in raccolta.items():
        if v:
            out[f"quota_media_{k}"] = round(sum(v) / len(v), 3)
            out[f"bookmaker_{k}"] = len(v)
    tre = [out.get(f"quota_media_{k}") for k in ("1", "X", "2")]
    if all(tre):
        inv = [1 / q for q in tre]
        s = sum(inv)
        for k, p in zip(("1", "X", "2"), inv):
            out[f"prob_{k}"] = round(p / s, 4)
        out["margine"] = round(s - 1, 4)
    ou = [out.get("quota_media_Over 2.5"), out.get("quota_media_Under 2.5")]
    if all(ou):
        io = [1 / q for q in ou]
        out["prob_Over 2.5"] = round(io[0] / sum(io), 4)
    return out


# ---------- giri di raccolta ----------

def salva(cartella, nome, obj):
    os.makedirs(cartella, exist_ok=True)
    with open(os.path.join(cartella, nome), "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False)


def stagione(oggi):
    return oggi.year if oggi.month >= 7 else oggi.year - 1


def giro_completo(base="data"):
    oggi = datetime.now(timezone.utc).astimezone()
    giorno = oggi.strftime("%Y-%m-%d")
    cart = os.path.join(base, giorno)
    ora = oggi.strftime("%H%M")
    ids = {lg["af"]: lg for lg in LEAGUES}
    partite = {}

    fx = af("/fixtures", date=giorno, timezone=TZ)  # una sola richiesta per tutte le partite del giorno
    if fx:
        salva(cart, f"{ora}_af_fixtures.json", fx)
        for f in fx.get("response", []):
            lid = f["league"]["id"]
            if lid in ids:
                fid = f["fixture"]["id"]
                partite[fid] = {"id": fid, "campionato": ids[lid]["nome"], "inizio": f["fixture"]["date"],
                                "casa": f["teams"]["home"]["name"], "ospite": f["teams"]["away"]["name"], "stato": f["fixture"]["status"]["short"]}
    print(f"Partite di oggi nei campionati seguiti (API-Football): {len(partite)}")
    attivi = {p["campionato"] for p in partite.values()} if fx else set(ODDS_API_LEAGUES)
    if not fx:
        print("API-Football non disponibile: uso solo The Odds API per partite e quote.")

    for lg in LEAGUES:
        if lg["nome"] not in attivi:
            continue
        inj = af("/injuries", league=lg["af"], season=stagione(oggi), date=giorno, timezone=TZ)
        if inj:
            salva(cart, f"{ora}_af_injuries_{lg['af']}.json", inj)
            for it in inj.get("response", []):
                fid = it.get("fixture", {}).get("id")
                if fid in partite:
                    lato = "assenti_casa" if it["team"]["name"] == partite[fid]["casa"] else "assenti_ospite"
                    partite[fid].setdefault(lato, []).append(f"{it['player']['name']} ({it['player'].get('reason') or it['player'].get('type')})")
        page, tot = 1, 1
        while page <= tot:
            od = af("/odds", league=lg["af"], season=stagione(oggi), date=giorno, page=page)
            if not od:
                break
            salva(cart, f"{ora}_af_odds_{lg['af']}_p{page}.json", od)
            tot = od.get("paging", {}).get("total", 1)
            for it in od.get("response", []):
                fid = it.get("fixture", {}).get("id")
                if fid in partite:
                    partite[fid].update({f"af_{k}": v for k, v in riassunto(media_af(it)).items()})
            page += 1

    # The Odds API: l'elenco dei campionati e gratuito; poi 2 crediti per campionato
    sports, _ = odds_api("/sports")
    chiavi = {}
    if sports:
        per_titolo = {s["title"]: s["key"] for s in sports}
        for lg in LEAGUES:
            chiavi[lg["nome"]] = per_titolo.get(lg["odds_title"], lg["odds_key"])
    for nome in ODDS_API_LEAGUES:
        if nome not in attivi or nome not in chiavi:
            continue
        ev, _ = odds_api(f"/sports/{chiavi[nome]}/odds", regions="eu", markets="h2h,totals", oddsFormat="decimal", dateFormat="iso")
        if ev is None:
            continue
        salva(cart, f"{ora}_oddsapi_{chiavi[nome]}.json", ev)
        for e in ev:
            trovata = None
            for p in partite.values():
                if p["campionato"] == nome and simile(p["casa"], e["home_team"]) and simile(p["ospite"], e["away_team"]):
                    trovata = p
            if trovata is None and not fx:  # senza API-Football le partite arrivano da qui (prossimi giorni compresi)
                trovata = partite.setdefault(e.get("id", e["home_team"] + e["away_team"]), {"id": e.get("id"), "campionato": nome, "inizio": e.get("commence_time"),
                                                                                         "casa": e["home_team"], "ospite": e["away_team"], "stato": "NS"})
            if trovata is not None:
                trovata.update({f"oa_{k}": v for k, v in riassunto(media_oddsapi(e)).items()})

    scrivi_csv(cart, partite)
    print(f"Fatto. Richieste API-Football rimaste oggi: {BUDGET.af_rimaste}; crediti The Odds API rimasti: {BUDGET.odds_rimasti}")


def giro_formazioni(base="data", finestra_min=90):
    if not os.environ.get("API_FOOTBALL_KEY"):
        print("Formazioni: serve API-Football, per ora non disponibile.")
        return
    oggi = datetime.now(timezone.utc).astimezone()
    cart = os.path.join(base, oggi.strftime("%Y-%m-%d"))
    path = sorted(f for f in os.listdir(cart) if f.endswith("_af_fixtures.json")) if os.path.isdir(cart) else []
    if not path:
        print("Prima serve il giro completo di oggi.")
        return
    fx = json.load(open(os.path.join(cart, path[-1]), encoding="utf-8"))
    ids = {lg["af"] for lg in LEAGUES}
    gia = {f.split("_")[2] for f in os.listdir(cart) if "_af_lineups_" in f}
    for f in fx.get("response", []):
        if f["league"]["id"] not in ids or str(f["fixture"]["id"]) in gia:
            continue
        inizio = datetime.fromisoformat(f["fixture"]["date"])
        if timedelta(0) <= inizio - oggi <= timedelta(minutes=finestra_min):
            lu = af("/fixtures/lineups", fixture=f["fixture"]["id"])
            if lu and lu.get("response"):
                salva(cart, f"{oggi.strftime('%H%M')}_af_lineups_{f['fixture']['id']}.json", lu)
                print(f"  Formazioni salvate: {f['teams']['home']['name']} - {f['teams']['away']['name']}")


def simile(a, b):
    """Confronto tollerante dei nomi squadra tra le due fonti (es. 'AC Milan' e 'Milan')."""
    norm = lambda s: "".join(ch for ch in s.lower() if ch.isalnum()).replace("fc", "").replace("ac", "").replace("calcio", "")
    x, y = norm(a), norm(b)
    return x == y or x in y or y in x


def scrivi_csv(cart, partite):
    righe = sorted(partite.values(), key=lambda p: (p["inizio"], p["campionato"]))
    if not righe:
        return
    campi = sorted({k for r in righe for k in r}, key=lambda k: (k not in ("id", "campionato", "inizio", "casa", "ospite", "stato"), k))
    with open(os.path.join(cart, "partite.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=campi)
        w.writeheader()
        for r in righe:
            w.writerow({k: ("; ".join(v) if isinstance(v, list) else v) for k, v in r.items()})


if __name__ == "__main__":
    if "--formazioni" in sys.argv:
        giro_formazioni()
    else:
        giro_completo()
