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


def giro_arbitri(base="data", giorni=3):
    """Arbitri designati per le partite dei prossimi giorni (ESPN: scoreboard, o la scheda della partita se manca).
    Serve quando football-data.org non ha ancora il nome dell'arbitro."""
    ora = datetime.now(timezone.utc)
    out = []
    da, a_ = ora.strftime("%Y%m%d"), (ora + timedelta(days=giorni)).strftime("%Y%m%d")
    for k, lg in ESPN_LG.items():
        try:
            evs = get(f"{SITE}{lg}/scoreboard?dates={da}-{a_}").get("events", [])
        except Exception as e:  # noqa: BLE001
            print(f"ESPN arbitri {k}: {e}")
            continue
        for ev in evs:
            try:
                c = ev["competitions"][0]
                if ev["status"]["type"].get("completed"):
                    continue
                uff = c.get("officials") or []
                if not uff and datetime.fromisoformat(ev["date"].replace("Z", "+00:00")) - ora <= timedelta(hours=60):
                    uff = (get(f"{SITE}{lg}/summary?event={ev['id']}").get("gameInfo") or {}).get("officials") or []
                nome = next((o.get("displayName") or o.get("fullName") for o in uff
                             if (o.get("position") or {}).get("name", "Referee").lower() in ("referee", "arbitro") and (o.get("displayName") or o.get("fullName"))), None)
                if not nome and uff:
                    nome = uff[0].get("displayName") or uff[0].get("fullName")
                h = next(x for x in c["competitors"] if x["homeAway"] == "home")["team"]["displayName"]
                a = next(x for x in c["competitors"] if x["homeAway"] == "away")["team"]["displayName"]
                if nome:
                    out.append({"lg": k, "t": ev["date"], "h": h, "a": a, "nome": nome})
            except Exception as e:  # noqa: BLE001
                print(f"ESPN arbitri {k} {ev.get('id')}: {e}")
    try:
        out += arbitri_da_notizie(base, out)
    except Exception as e:  # noqa: BLE001
        print(f"Arbitri dalle notizie: errore {e}")
    os.makedirs(os.path.join(base, "espn"), exist_ok=True)
    with open(os.path.join(base, "espn", "arbitri.json"), "w", encoding="utf-8") as f:
        json.dump({"agg": ora.isoformat(), "partite": out, "diagnosi": DIAG}, f, ensure_ascii=False, separators=(",", ":"))
    print(f"ESPN: arbitri designati trovati {len(out)}")


DIAG = {}
PAROLE_ARB = {"it": ("arbitro", "arbitra", "arbitrer", "designaz", "fischietto", "direttore di gara"), "en": ("referee", "official"),
              "es": ("arbitro", "colegiado", "arbitrara", "designacion"), "de": ("schiedsrichter", "pfeift", "unparteiische")}
Q_ARB = {"it": "arbitro", "en": "referee", "es": "árbitro", "de": "Schiedsrichter"}


def arbitri_da_notizie(base, gia, giorni=4):
    """Arbitro designato letto dai titoli delle notizie (es. "Roma-Cagliari, arbitra Feliciani").
    Si accettano solo cognomi di arbitri gia presenti nello storico, e solo in titoli che parlano di arbitri."""
    import re
    import urllib.parse
    import fattori as FT
    try:
        with open(os.path.join("app", "data", "giornata.json"), encoding="utf-8") as f:
            gio = json.load(f)
        with open(os.path.join(base, "arbitri.json"), encoding="utf-8") as f:
            noti = json.load(f)
    except (OSError, ValueError):
        return []
    cognomi = {}
    for c, v in noti.items():
        cg = c.split()[-1]
        if len(cg) >= 4 and v.get("n", 0) >= 3:
            cognomi.setdefault(v.get("lega"), {})[cg] = v["nome"]
    ora = datetime.now(timezone.utc)
    out = []
    DIAG.update({"cercate": 0, "errori": 0, "titoli": 0, "titoli_arbitro": 0, "scartate_ambigue": 0})
    for m in gio.get("matches", []):
        try:
            ko = datetime.fromisoformat(m["ko"])
        except (KeyError, ValueError):
            continue
        if m.get("st") != "NS" or m.get("arbitro") or not timedelta(0) <= ko - ora <= timedelta(days=giorni):
            continue
        if arbitro_designato(gia, m["lg"], m["h"], m["a"], ko):
            continue
        lingua = FT.LINGUA_LEGA.get(m["lg"], "it")
        hl, gl, ceid, _ = FT.LINGUE[lingua]
        pulito = lambda s: re.sub(r"\b(fc|ac|as|ssc|cf|afc|1907|1909|calcio)\b", "", s, flags=re.I).strip()
        q = f'"{pulito(m["h"])}" "{pulito(m["a"])}" {Q_ARB[lingua]} when:5d'
        try:
            req = urllib.request.Request("https://news.google.com/rss/search?" + urllib.parse.urlencode({"q": q, "hl": hl, "gl": gl, "ceid": ceid}),
                                         headers={"User-Agent": "Mozilla/5.0 (AuraPitch beta)"})
            with urllib.request.urlopen(req, timeout=20) as r:
                titoli = [x["titolo"] for x in FT.leggi_rss(r.read().decode("utf-8", "replace"))]
        except Exception as e:  # noqa: BLE001
            print(f"Notizie arbitro {m['h']}-{m['a']}: {e}")
            DIAG["errori"] += 1
            DIAG["ultimo_errore"] = str(e)[:120]
            continue
        DIAG["cercate"] += 1
        DIAG["titoli"] += len(titoli)
        time.sleep(1)
        lega_cod = {"I2": "I1"}.get(m["lg"], m["lg"])
        nomi = cognomi.get(lega_cod) or {k: v for d in cognomi.values() for k, v in d.items()}
        voti = {}
        for t in titoli:
            p = FT.piano(t)
            if not any(w in p for w in PAROLE_ARB[lingua]):
                continue
            DIAG["titoli_arbitro"] += 1
            c = lambda nome: any(re.search(r"\b" + re.escape(w) + r"\b", p) for w in toks(nome) if len(w) >= 3)
            if not (c(m["h"]) and c(m["a"])):  # il titolo deve nominare entrambe le squadre
                continue
            for cg, nome in nomi.items():
                if re.search(r"\b" + re.escape(cg) + r"\b", p):
                    voti[nome] = voti.get(nome, 0) + 1
        if voti:
            nome = max(voti, key=voti.get)
            out.append({"lg": m["lg"], "t": m["ko"], "h": m["h"], "a": m["a"], "nome": nome, "fonte": "notizie"})
    # lo stesso arbitro non dirige due partite a meno di 2 giorni di distanza: in quel caso il titolo era ambiguo, si scartano
    def t_(x):
        return datetime.fromisoformat(x["t"].replace("Z", "+00:00"))
    n0 = len(out)
    out = [x for x in out if not any(y is not x and y["nome"] == x["nome"] and abs((t_(y) - t_(x)).total_seconds()) < 48 * 3600 for y in out + list(gia))]
    DIAG["scartate_ambigue"] = n0 - len(out)
    print(f"Arbitri dalle notizie: {len(out)}")
    return out


def arbitro_designato(elenco, lg, h, a, ko):
    """Nome dell'arbitro designato per la partita (lg, casa, ospite, calcio d'inizio) dall'elenco di giro_arbitri."""
    best, bs = None, 1.5
    for x in elenco or []:
        if x.get("lg") != lg:
            continue
        try:
            t = datetime.fromisoformat(x["t"].replace("Z", "+00:00"))
        except (KeyError, ValueError):
            continue
        if abs((t - ko).total_seconds()) > 6 * 3600:
            continue
        s = sim(h, [x["h"]]) + sim(a, [x["a"]])
        if s > bs:
            best, bs = x["nome"], s
    return best


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
    # colori ufficiali delle maglie di tutte le squadre dei campionati (per l'aura delle partite nell'app)
    out["colori"] = {}
    for k, lg in ESPN_LG.items():
        try:
            tt = elenco.get(k) or [t["team"] for t in get(f"{SITE}{lg}/teams")["sports"][0]["leagues"][0]["teams"]]
            out["colori"][k] = [{x: t.get(x) for x in ("displayName", "shortDisplayName", "name", "location", "color", "alternateColor")} for t in tt]
        except Exception as e:  # noqa: BLE001
            print(f"ESPN colori {k}: {e}")
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
    try:
        giro_arbitri(base)
    except Exception as e:  # noqa: BLE001
        print(f"ESPN arbitri: errore {e}")
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
