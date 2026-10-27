"""AuraPitch - dati ESPN raccolti ogni mattina per l'algoritmo (solo libreria standard).
Per le squadre che giocano nelle prossime 48 ore:
  - rosa con statistiche di stagione di ogni giocatore (gol, assist, presenze, da titolare, gialli, rossi): pesi dei giocatori per i fattori;
  - ultima partita di campionato: chi ha preso un rosso o il giallo che fa scattare la squalifica (5a o 10a ammonizione);
  - Serie B (non coperta da football-data): classifica e risultati, per forma, classifica e statistiche.
Fonte non ufficiale (endpoint pubblici ESPN): va bene per la beta, da sostituire con una fonte licenziata prima degli store."""
import gzip
import json
import os
import re
import time
import unicodedata
import urllib.request
from datetime import datetime, timedelta, timezone

SITE = "https://site.api.espn.com/apis/site/v2/sports/soccer/"
STAND = "https://site.api.espn.com/apis/v2/sports/soccer/"
ESPN_LG = {"I1": "ita.1", "I2": "ita.2", "E0": "eng.1", "SP1": "esp.1", "D1": "ger.1"}
SOGLIE_GIALLI = (5, 10)  # squalifica alla 5a e alla 10a ammonizione (regola comune a Serie A, Serie B, Premier, LaLiga, Bundesliga)
STOP = {"fc", "ac", "as", "ss", "us", "ssc", "afc", "cf", "sc", "calcio", "club", "de", "1907", "1909", "1913", "1919", "bc", "vfb", "vfl", "tsg", "sv", "fsv", "rc", "cd", "ud", "rcd", "ca", "sd", "1846", "04", "05", "1899", "hellas"}
ALIAS = {"internazionale": "inter", "inter milan": "inter", "ac milan": "milan", "manchester united": "man united", "manchester city": "man city", "bayern munich": "bayern", "tottenham hotspur": "tottenham"}


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (AuraPitch beta)", "Accept-Encoding": "gzip"})
    with urllib.request.urlopen(req, timeout=25) as r:
        raw = r.read()
        if raw[:2] == b"\x1f\x8b":
            raw = gzip.decompress(raw)
        time.sleep(0.4)
        return json.loads(raw.decode("utf-8"))


def piano(s):
    s = unicodedata.normalize("NFD", str(s or "").lower())
    return "".join(c for c in s if unicodedata.category(c) != "Mn")


def toks(s):
    p = re.sub(r"[^a-z0-9 ]", " ", piano(s)).strip()
    p = ALIAS.get(p, p)
    return [t for t in p.split() if t and t not in STOP]


def sim(a, nomi):
    best = 0
    for b in nomi:
        x, y = toks(a), toks(b)
        if not x or not y:
            continue
        if x == y:
            return 1.0
        if set(x) & set(y):
            best = max(best, 0.8)
        elif any(len(t) >= 4 and len(u) >= 4 and (t[:4] == u[:4]) for t in x for u in y):
            best = max(best, 0.5)
    return best


def trova_squadra(teams, nome):
    best, bs = None, 0
    for t in teams:
        s = sim(nome, [t["displayName"], t.get("shortDisplayName"), t.get("name"), t.get("location")])
        if s > bs:
            best, bs = t, s
    return best if bs >= 0.8 else None


def stat(a, nome):
    for c in ((a.get("statistics") or {}).get("splits") or {}).get("categories", []):
        for s in c.get("stats", []):
            if s["name"] == nome:
                return int(s.get("value") or 0)
    return 0


def rosa(lg, tid):
    d = get(f"{SITE}{lg}/teams/{tid}/roster")
    out = []
    for a in d.get("athletes", []):
        app = stat(a, "appearances")
        out.append({"id": a["id"], "n": a["displayName"], "last": a.get("lastName") or a["displayName"], "pos": (a.get("position") or {}).get("abbreviation"),
                    "g": stat(a, "totalGoals"), "a": stat(a, "goalAssists"), "pres": app, "tit": max(0, app - stat(a, "subIns")),
                    "gialli": stat(a, "yellowCards"), "rossi": stat(a, "redCards")})
    return out


def risultati(lg, tid):
    d = get(f"{SITE}{lg}/teams/{tid}/schedule")
    out = []
    for ev in d.get("events", []):
        c = ev["competitions"][0]
        if ((c.get("status") or {}).get("type") or {}).get("state") != "post":
            continue
        me = next((x for x in c["competitors"] if x["team"]["id"] == tid), None)
        op = next((x for x in c["competitors"] if x["team"]["id"] != tid), None)
        if not me or not op:
            continue
        sc = lambda x: int((x.get("score") or {}).get("value", 0) if isinstance(x.get("score"), dict) else (x.get("score") or 0))
        out.append({"eid": ev["id"], "t": ev["date"], "casa": me["homeAway"] == "home", "avv": op["team"].get("shortDisplayName") or op["team"]["displayName"], "gf": sc(me), "gs": sc(op)})
    out.sort(key=lambda r: r["t"])
    return out


def cartellini(lg, eid, tid):
    """Rossi e gialli della squadra nell'ultima partita (dagli eventi chiave)."""
    s = get(f"{SITE}{lg}/summary?event={eid}")
    rossi, gialli = [], []
    for e in s.get("keyEvents", []):
        tt = (e.get("type") or {}).get("type", "")
        if (e.get("team") or {}).get("id") != tid:
            continue
        chi = [p["athlete"]["displayName"] for p in (e.get("participants") or []) if p.get("athlete")]
        if not chi:
            continue
        if tt in ("red-card", "yellow-red-card"):
            rossi.append(chi[0])
        elif tt == "yellow-card":
            gialli.append(chi[0])
    return rossi, gialli


def classifica_espn(lg):
    d = get(f"{STAND}{lg}/standings")
    righe = []
    for e in ((d.get("children") or [{}])[0].get("standings") or {}).get("entries", []):
        v = {s["name"]: s.get("value") for s in e.get("stats", [])}
        righe.append({"team": e["team"].get("shortDisplayName") or e["team"]["displayName"], "pg": int(v.get("gamesPlayed") or 0), "v": int(v.get("wins") or 0),
                      "n": int(v.get("ties") or 0), "p": int(v.get("losses") or 0), "gf": int(v.get("pointsFor") or 0), "gs": int(v.get("pointsAgainst") or 0),
                      "pt": int(v.get("points") or 0), "rank": int(v.get("rank") or 0)})
    righe.sort(key=lambda r: (r["rank"] or 99, -r["pt"]))
    return righe


def giro_espn(base="data", ore=48):
    try:
        with open(os.path.join("app", "data", "giornata.json"), encoding="utf-8") as f:
            gio = json.load(f)
    except (OSError, ValueError):
        print("ESPN: file dell'app non trovato, salto.")
        return
    ora = datetime.now(timezone.utc)
    squadre = {}
    for m in gio.get("matches", []):
        try:
            ko = datetime.fromisoformat(m["ko"])
        except (KeyError, ValueError):
            continue
        if m.get("lg") in ESPN_LG and timedelta(hours=-3) <= ko - ora <= timedelta(hours=ore):
            squadre[m["h"]] = m["lg"]
            squadre[m["a"]] = m["lg"]
    out = {"agg": ora.isoformat(), "squadre": {}, "classifiche": {}}
    elenco = {}
    for k in sorted(set(squadre.values())):
        try:
            d = get(f"{SITE}{ESPN_LG[k]}/teams")
            elenco[k] = [t["team"] for t in d["sports"][0]["leagues"][0]["teams"]]
        except Exception as e:  # noqa: BLE001 - rete o formato: si salta il campionato
            print(f"ESPN {k}: elenco squadre non disponibile ({e})")
    for nome, k in squadre.items():
        t = trova_squadra(elenco.get(k, []), nome)
        if not t:
            print(f"ESPN: squadra non trovata {nome} ({k})")
            continue
        lg = ESPN_LG[k]
        try:
            r = {"lg": k, "id": t["id"], "rosa": rosa(lg, t["id"]), "risultati": risultati(lg, t["id"])}
            if r["risultati"]:
                ult = r["risultati"][-1]
                rossi, gialli = cartellini(lg, ult["eid"], t["id"])
                r["ultima"] = {"eid": ult["eid"], "t": ult["t"], "rossi": rossi, "gialli": gialli}
            out["squadre"][nome] = r
        except Exception as e:  # noqa: BLE001
            print(f"ESPN {nome}: errore {e}")
    out["risultati_lega"] = {}
    for k in ("I2",):
        evs = []
        for dd in (-2, -1, 0):
            giorno = (ora + timedelta(days=dd)).strftime("%Y%m%d")
            try:
                for ev in get(f"{SITE}{ESPN_LG[k]}/scoreboard?dates={giorno}").get("events", []):
                    c = ev["competitions"][0]
                    h = next(x for x in c["competitors"] if x["homeAway"] == "home")
                    a = next(x for x in c["competitors"] if x["homeAway"] == "away")
                    t = ev["status"]["type"]
                    evs.append({"t": ev["date"], "h": h["team"]["displayName"], "a": a["team"]["displayName"], "st": t["state"], "fine": t.get("completed", False),
                                "g": [int(h.get("score") or 0), int(a.get("score") or 0)]})
            except Exception as e:  # noqa: BLE001
                print(f"ESPN risultati {k} {giorno}: {e}")
        out["risultati_lega"][k] = evs
    for k in ("I2",):
        try:
            out["classifiche"][k] = classifica_espn(ESPN_LG[k])
        except Exception as e:  # noqa: BLE001
            print(f"ESPN classifica {k}: errore {e}")
    os.makedirs(os.path.join(base, "espn"), exist_ok=True)
    with open(os.path.join(base, "espn", "squadre.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print(f"ESPN: {len(out['squadre'])} squadre con rosa e risultati, classifiche: {list(out['classifiche'])}")


def squalificati(sq):
    """Chi salta la prossima partita: rosso nell'ultima partita, oppure giallo nell'ultima che porta il totale a 5 o 10."""
    u = sq.get("ultima") or {}
    out = []
    for p in sq.get("rosa", []):
        if any(sim(p["n"], [x]) == 1.0 or piano(p["n"]) == piano(x) for x in u.get("rossi", [])):
            out.append({"giocatore": p, "motivo": "rosso nell'ultima partita"})
        elif any(piano(p["n"]) == piano(x) for x in u.get("gialli", [])) and p["gialli"] in SOGLIE_GIALLI:
            out.append({"giocatore": p, "motivo": f"{p['gialli']}a ammonizione nell'ultima partita"})
    return out


def diffidati(sq):
    return [p for p in sq.get("rosa", []) if p["gialli"] + 1 in SOGLIE_GIALLI]
