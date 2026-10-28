"""Archivio delle panchine (chi allenava ogni squadra e da quando), da Wikidata: proprieta P286 "allenatore" con date di
inizio (P580) e fine (P582). Abbina i club ai nomi di Football-Data (storico/fd_partite.csv.gz) e scrive storico/allenatori.json.
Wikidata e' rilasciato in CC0: si puo' usare liberamente."""
import csv, gzip, json, os, re, sys, time, unicodedata, urllib.parse, urllib.request

PAESI = {"I": ["Q38"], "E": ["Q21", "Q145"], "S": ["Q29"], "D": ["Q183"], "F": ["Q142", "Q235"]}  # Q235 = Monaco (gioca in Ligue 1)
NO_PRIMA = re.compile(r"academy|women|femminile|femenino|frauen|feminine|u-?\d\d|under|youth|primavera|reserve|riserve|development|juvenil|\bb\b|\bii\b|giovanili|nachwuchs", re.I)
SPARQL = """SELECT ?club ?clubLabel (GROUP_CONCAT(DISTINCT ?alt; separator="|") AS ?alts) ?coach ?coachLabel ?start ?end WHERE {
  VALUES ?paese { %s }
  ?club wdt:P31 wd:Q476028 ; wdt:P17 ?paese ; p:P286 ?st .
  ?st ps:P286 ?coach .
  OPTIONAL { ?st pq:P580 ?start } OPTIONAL { ?st pq:P582 ?end }
  OPTIONAL { ?club skos:altLabel ?alt . FILTER(LANG(?alt) IN ("en", "it")) }
  FILTER(!BOUND(?end) || ?end >= "2010-01-01T00:00:00Z"^^xsd:dateTime)
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,it". }
} GROUP BY ?club ?clubLabel ?coach ?coachLabel ?start ?end"""
# nomi di Football-Data che non si capiscono dalle parole
ALIAS = {"mgladbach": "borussia monchengladbach", "nottm forest": "nottingham forest", "man united": "manchester united", "man city": "manchester city", "nott'm forest": "nottingham forest", "ath madrid": "atletico madrid",
         "ath bilbao": "athletic bilbao", "sp gijon": "sporting gijon", "betis": "real betis", "celta": "celta vigo", "sociedad": "real sociedad",
         "espanol": "espanyol", "la coruna": "deportivo la coruna", "vallecano": "rayo vallecano", "m'gladbach": "borussia monchengladbach",
         "ein frankfurt": "eintracht frankfurt", "fc koln": "fc koln", "paris sg": "paris saint-germain", "st etienne": "saint-etienne",
         "inter": "inter milan", "milan": "ac milan", "verona": "hellas verona", "qpr": "queens park rangers", "west brom": "west bromwich albion",
         "wolves": "wolverhampton wanderers", "sheffield weds": "sheffield wednesday", "leverkusen": "bayer leverkusen", "dortmund": "borussia dortmund",
         "bayern munich": "bayern munich", "hertha": "hertha bsc", "mainz": "mainz 05", "hoffenheim": "tsg hoffenheim", "fortuna dusseldorf": "fortuna dusseldorf",
         "greuther furth": "greuther furth", "st pauli": "fc st pauli", "spal": "spal", "chievo": "chievo verona", "alaves": "deportivo alaves",
         "leganes": "cd leganes", "huesca": "sd huesca", "cadiz": "cadiz cf", "almeria": "ud almeria", "granada": "granada cf", "osasuna": "ca osasuna"}
STOP = {"fc", "ac", "as", "ss", "us", "ssc", "afc", "cf", "sc", "calcio", "club", "de", "football", "sv", "vfb", "vfl", "tsg", "rc", "cd", "ud", "rcd", "sd", "ca", "1", "04", "05", "fk", "bc", "sk"}


def piano(s):
    return unicodedata.normalize("NFKD", str(s or "")).encode("ascii", "ignore").decode().lower().replace("'", "")


def tok(s):
    return {t for t in re.split(r"[^a-z0-9]+", piano(s)) if t and t not in STOP}


def get(url, tentativi=4):
    for i in range(tentativi):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "AuraPitch/0.1 (https://github.com/ilFlagello/aurapitch)", "Accept": "application/sparql-results+json"})
            with urllib.request.urlopen(req, timeout=120) as r:
                return json.loads(r.read())
        except Exception as e:  # noqa: BLE001
            print("  riprovo:", type(e).__name__, e)
            time.sleep(10 * (i + 1))
    return None


def data(x):
    return x["value"][:10] if x else None


def main():
    with gzip.open("storico/fd_partite.csv.gz", "rt", encoding="utf-8") as f:
        righe = list(csv.DictReader(f))
    squadre = {}
    for r in righe:
        for t in (r["HomeTeam"], r["AwayTeam"]):
            squadre.setdefault(t, r["Div"][0])
    print("squadre Football-Data:", len(squadre))
    club = {}
    for paese, qids in PAESI.items():
        q = SPARQL % " ".join("wd:" + x for x in qids)
        j = get("https://query.wikidata.org/sparql?format=json&query=" + urllib.parse.quote(q))
        if not j:
            print("Wikidata", paese, ": nessuna risposta"); continue
        for b in j["results"]["bindings"]:
            c = b["club"]["value"].rsplit("/", 1)[1]
            x = club.setdefault(c, {"nome": b["clubLabel"]["value"], "alias": set(), "paese": paese, "all": []})
            x["alias"] |= set(filter(None, b.get("alts", {}).get("value", "").split("|")))
            x["all"].append({"chi": b["coachLabel"]["value"], "qid": b["coach"]["value"].rsplit("/", 1)[1], "da": data(b.get("start")), "a": data(b.get("end"))})
        print("Wikidata", paese, ":", len(j["results"]["bindings"]), "righe")
        time.sleep(5)
    out, mancano = {}, []
    for t, paese in squadre.items():
        cerca = tok(ALIAS.get(piano(t), ALIAS.get(t.lower(), t)))
        best, bs = None, 0
        for c, x in club.items():
            if x["paese"] != paese:
                continue
            if NO_PRIMA.search(x["nome"]):
                continue  # squadre giovanili, femminili, riserve
            for nome in [x["nome"], *x["alias"]]:
                tt = tok(nome)
                if not tt or not cerca:
                    continue
                s = len(cerca & tt) / len(cerca | tt)
                if cerca <= tt:
                    s += 0.3
                s += min(0.2, len(x["all"]) / 100)  # a parità di nome, il club con più allenatori registrati (la prima squadra)
                if s > bs:
                    best, bs = c, s
        if best and bs >= 0.5:
            x = club[best]
            out[t] = {"wikidata": best, "nome": x["nome"], "allenatori": sorted([a for a in x["all"] if a["da"]], key=lambda a: a["da"])}
        else:
            mancano.append(t)
    # seconda prova per le squadre non trovate: ricerca per nome su Wikidata (es. Chelsea, Sunderland)
    ancora = []
    for t in mancano:
        nome = ALIAS.get(piano(t), t)
        trovato = None
        for q in (nome + " F.C.", nome + " FC", nome):
            j = get("https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&language=en&type=item&limit=7&search=" + urllib.parse.quote(q))
            for x in (j or {}).get("search", []):
                if "football club" in (x.get("description") or "").lower() and not NO_PRIMA.search(x.get("label", "")) and not NO_PRIMA.search(x.get("description", "")):
                    trovato = x; break
            if trovato:
                break
        if not trovato:
            ancora.append(t); continue
        qid = trovato["id"]
        jj = get("https://query.wikidata.org/sparql?format=json&query=" + urllib.parse.quote(
            "SELECT ?coach ?coachLabel ?start ?end WHERE { wd:%s p:P286 ?st . ?st ps:P286 ?coach . OPTIONAL { ?st pq:P580 ?start } OPTIONAL { ?st pq:P582 ?end } "
            "SERVICE wikibase:label { bd:serviceParam wikibase:language \"en,it\". } }" % qid))
        al = [{"chi": b["coachLabel"]["value"], "qid": b["coach"]["value"].rsplit("/", 1)[1], "da": data(b.get("start")), "a": data(b.get("end"))} for b in (jj or {}).get("results", {}).get("bindings", [])]
        al = sorted([a for a in al if a["da"]], key=lambda a: a["da"])
        if al:
            out[t] = {"wikidata": qid, "nome": trovato.get("label"), "allenatori": al}
        else:
            ancora.append(t)
        time.sleep(1)
    mancano = ancora
    os.makedirs("storico", exist_ok=True)
    json.dump({"fonte": "Wikidata (CC0), proprieta P286", "squadre": out, "non_trovate": mancano}, open("storico/allenatori.json", "w"), ensure_ascii=False, indent=0)
    print("abbinate", len(out), "non trovate", len(mancano), mancano[:40])


if __name__ == "__main__":
    main()
