"""AuraPitch - identita unica delle squadre (Blocco 5, passo 2). Solo libreria standard.

Lo stesso club ha nomi diversi in ogni fonte: "AC Milan" (football-data.org), "Milan" (quote), "AC Milan" (ESPN), "Milan" (archivio
Football-Data.co.uk). Qui si decide CHI e una squadra:
  - id ESPN: e lo stesso in campionato e in coppa (verificato il 4/11) e separa le squadre femminili (Chelsea femminile 19970,
    maschile 363): e il codice del club;
  - id football-data.org (top 4 e Champions), quando c'e;
  - nome nell'archivio Football-Data.co.uk, cercato SOLO tra le squadre dello stesso paese (stesso campionato e divisioni vicine,
    per promosse e retrocesse): cosi "Santos" del Messico non diventa il Santos brasiliano e "Red Bull New York" non diventa lo
    York City. Squadre femminili, giovanili e seconde squadre (Jong, U21, II) non si abbinano mai a una prima squadra maschile.

Un nome non riconosciuto NON da errore: da un dato mancante. Per questo l'abbinamento e misurato (strumenti/identita.py) e i casi
che le regole non risolvono stanno nella tabella MANUALE, rivedibile a mano."""
import re
import unicodedata
from collections import Counter

# lettere che la scomposizione Unicode non riduce a ASCII (sparirebbero: "København" -> "kbenhavn")
TRASLITTERA = str.maketrans({"ø": "o", "Ø": "O", "æ": "ae", "Æ": "AE", "ß": "ss", "đ": "d", "Đ": "D", "ł": "l", "Ł": "L", "ı": "i",
                             "þ": "th", "Þ": "Th", "ð": "d", "Ð": "D", "œ": "oe", "Œ": "OE", "ğ": "g", "ş": "s", "ç": "c"})
# parole che non distinguono un club da un altro
VUOTE = {"fc", "afc", "cf", "sc", "ac", "as", "ss", "us", "usd", "ssc", "cd", "ud", "sd", "rc", "rcd", "sv", "vfb", "vfl", "tsg", "fk", "sk", "if", "bk",
         "club", "de", "del", "do", "da", "calcio", "cp", "sad", "ca", "ec", "se", "fbc", "kv", "krc", "the", "and", "cfc", "sfc", "bb", "spor", "sk"}
# abbreviazioni dell'archivio (valgono da tutte e due le parti)
ESTESE = {"atl": "atletico", "dep": "deportivo", "ind": "independiente", "sp": "sporting", "st": "saint", "sint": "saint", "jrs": "juniors",
          "jr": "juniors", "utd": "united", "rvs": "rovers", "ii": "b", "man": "manchester", "for": "fortuna", "ein": "eintracht"}
# segni di squadra femminile, giovanile o seconda squadra: se uno dei due nomi li ha e l'altro no, non e la stessa squadra
SEGNI = {"b", "jong", "u17", "u18", "u19", "u20", "u21", "u23", "sub", "reserves", "w", "women", "womens", "femenino", "feminino", "femminile", "ladies", "fem"}
# campionati e coppe femminili: mai nell'archivio (maschile)
FEMMINILI = ("WSL", "AUW", "UWCL")
# paese di ogni campionato e coppa nazionale dell'app -> divisioni dell'archivio dello stesso paese
PAESE = {"I1": "ITA", "I2": "ITA", "CI": "ITA", "SCI": "ITA",
         "E0": "ENG", "E1": "ENG", "E2": "ENG", "E3": "ENG", "EC": "ENG", "FAC": "ENG", "ELC": "ENG", "EFT": "ENG",
         "SP1": "ESP", "SP2": "ESP", "CDR": "ESP", "D1": "GER", "D2": "GER", "DFB": "GER", "F1": "FRA", "F2": "FRA", "CDF": "FRA",
         "SC0": "SCO", "SC1": "SCO", "SCC": "SCO", "SLC": "SCO", "SCH": "SCO", "N1": "NED", "N2": "NED", "KNV": "NED", "P1": "POR", "TPO": "POR",
         "B1": "BEL", "T1": "TUR", "G1": "GRE", "A1": "AUT", "DK1": "DEN", "MLS": "USA", "USL": "USA", "USL1": "USA", "USO": "USA",
         "BR1": "BRA", "BR2": "BRA", "CDB": "BRA", "AR1": "ARG", "AR2": "ARG", "AR3": "ARG", "CAR": "ARG", "MX1": "MEX", "MX2": "MEX",
         "J1": "JPN", "NO1": "NOR", "SE1": "SWE", "RU1": "RUS", "CN1": "CHN", "CH1": "SUI", "RO1": "ROU", "FI1": "FIN", "IE1": "IRL"}
DIVISIONI = {"ITA": ("I1", "I2"), "ENG": ("E0", "E1", "E2", "E3", "EC"), "ESP": ("SP1", "SP2"), "GER": ("D1", "D2"), "FRA": ("F1", "F2"),
             "SCO": ("SC0", "SC1"), "NED": ("N1",), "POR": ("P1",), "BEL": ("B1",), "TUR": ("T1",), "GRE": ("G1",), "AUT": ("A1",), "DEN": ("DK1",),
             "USA": ("MLS",), "BRA": ("BR1",), "ARG": ("AR1",), "MEX": ("MX1",), "JPN": ("J1",), "NOR": ("NO1",), "SWE": ("SE1",), "RUS": ("RU1",),
             "CHN": ("CN1",), "SUI": ("CH1",), "ROU": ("RO1",), "FIN": ("FI1",), "IRL": ("IE1",)}
# casi che le regole non risolvono: nome dell'app/ESPN "piegato" -> nome esatto nell'archivio (rivedibile a mano; misurato il 5/11)
MANUALE = {"espanyol": "Espanol", "rcd espanyol": "Espanol", "athletic": "Ath Bilbao", "athletic club": "Ath Bilbao", "athletic bilbao": "Ath Bilbao",
           "atleti": "Ath Madrid", "atletico madrid": "Ath Madrid", "atletico de madrid": "Ath Madrid", "barca": "Barcelona",
           "nottingham": "Nott'm Forest", "nottingham forest": "Nott'm Forest", "oh leuven": "Oud-Heverlee Leuven",
           "saint truidense": "St Truiden", "saint truiden": "St Truiden", "levadiakos": "Levadeiakos", "olympiacos": "Olympiakos",
           "olympiacos piraeus": "Olympiakos", "olympiakos piraeus": "Olympiakos", "heart of midlothian": "Hearts",
           "hamarkameratene": "HamKam", "kobenhavn": "FC Copenhagen", "copenhagen": "FC Copenhagen", "agf": "Aarhus", "agf aarhus": "Aarhus",
           "d c united": "DC United", "dc united": "DC United", "red bull new york": "New York Red Bulls", "new york red bulls": "New York Red Bulls",
           "psg": "Paris SG", "paris saint germain": "Paris SG", "inter milan": "Inter", "internazionale": "Inter", "bayern munchen": "Bayern Munich",
           "sporting": "Sp Lisbon", "sporting cp": "Sp Lisbon", "sporting lisbon": "Sp Lisbon", "braga": "Sp Braga", "sporting braga": "Sp Braga",
           "union saint gilloise": "St. Gilloise", "royale union saint gilloise": "St. Gilloise", "rsca anderlecht": "Anderlecht",
           "real sociedad": "Sociedad", "lafc": "Los Angeles FC", "la galaxy": "Los Angeles Galaxy", "vitoria guimaraes": "Guimaraes",
           "borussia monchengladbach": "M'gladbach", "monchengladbach": "M'gladbach", "eintracht frankfurt": "Ein Frankfurt",
           "west bromwich albion": "West Brom", "wolverhampton wanderers": "Wolves", "queens park rangers": "QPR", "sheffield wednesday": "Sheffield Weds",
           "brighton hove albion": "Brighton", "red bull bragantino": "Bragantino", "gaziantep fk": "Gaziantep", "goztepe": "Goztep",
           "istanbul basaksehir": "Buyuksehyr", "basaksehir": "Buyuksehyr", "fatih karagumruk": "Karagumruk", "caykur rizespor": "Rizespor",
           "deportivo": "La Coruna", "deportivo la coruna": "La Coruna", "rc deportivo": "La Coruna", "stade rennais": "Rennes", "peterborough united": "Peterboro",
           "peterborough": "Peterboro", "tokyo verdy": "Verdy", "cercle brugge ksv": "Cercle Brugge", "cercle brugge": "Cercle Brugge"}


def piega(nome):
    """Nome semplificato: minuscole, senza accenti (anche ø, æ, ß), senza apostrofi; le sigle con i punti restano lettere
    separate ("Estudiantes L.P." -> "estudiantes l p", che poi si abbina per iniziali a "la plata")."""
    x = str(nome or "").translate(TRASLITTERA)
    x = unicodedata.normalize("NFD", x).encode("ascii", "ignore").decode().lower()
    x = re.sub(r"['’`]", "", x)
    return " ".join(re.split(r"[^a-z0-9]+", x)).strip()


def parole(nome):
    out = []
    for t in piega(nome).split():
        t = ESTESE.get(t, t)
        if t and t not in VUOTE and not t.isdigit():
            out.append(t)
    return out


def segni(p):
    return {t for t in p if t in SEGNI}


def _uguali(a, b):
    """Stessa parola, o quasi: una e l'inizio dell'altra con al massimo 2 lettere di differenza ("hamburg" ~ "hamburger",
    "halmstad" ~ "halmstads"; non "louis" ~ "louisville"), o una lettera sola contro l'iniziale ("a lustenau")."""
    if a == b:
        return True
    corto, lungo = sorted((a, b), key=len)
    if len(corto) == 1:
        return lungo.startswith(corto)
    return len(corto) >= 3 and lungo.startswith(corto) and len(lungo) - len(corto) <= 2


def _copertura(x, y):
    """Quante parole di x e di y si corrispondono (_uguali), piu una sigla di 2-3 lettere contro le iniziali di parole
    consecutive ("lp" ~ "la plata")."""
    cx, cy = [False] * len(x), [False] * len(y)
    for i, a in enumerate(x):
        for j, b in enumerate(y):
            if cy[j]:
                continue
            if _uguali(a, b):
                cx[i] = cy[j] = True
                break
    for p, q, cp, cq in ((x, y, cx, cy), (y, x, cy, cx)):  # sigle: "lp" in p contro "la plata" in q
        for i, a in enumerate(p):
            if cp[i] or not (2 <= len(a) <= 3) or not a.isalpha():
                continue
            for j in range(len(q) - len(a) + 1):
                if not any(cq[j:j + len(a)]) and "".join(w[0] for w in q[j:j + len(a)]) == a:
                    cp[i] = True
                    for k in range(j, j + len(a)):
                        cq[k] = True
                    break
    return sum(cx) / len(x), sum(cy) / len(y)


def somiglianza(a, b):
    """0..1: media delle due coperture; almeno 0,8 se TUTTE le parole di un nome compaiono identiche nell'altro ("Preston" in
    "Preston North End", "Genk" in "Racing Genk"). Squadre femminili, giovanili o seconde squadre contro prime squadre: 0."""
    x, y = parole(a), parole(b)
    if not x or not y or segni(x) != segni(y):
        return 0.0
    if x == y:
        return 1.0
    cx, cy = _copertura(x, y)
    q = (cx + cy) / 2
    if set(x) <= set(y) or set(y) <= set(x):
        q = max(q, 0.8)
    return q


def migliore(nome, candidati, soglia=0.8, distacco=0.15):
    """candidati: lista di (chiave, [nomi]). La chiave del candidato piu simile, solo se supera la soglia e stacca il secondo
    (altrimenti None: meglio nessun dato che il dato di un'altra squadra)."""
    p = piega(nome)
    punti = []
    for k, nomi in candidati:
        nomi = [n for n in nomi if n]
        if any(piega(n) == p for n in nomi):
            return k
        punti.append((max((somiglianza(nome, n) for n in nomi), default=0.0), k))
    punti.sort(key=lambda x: -x[0])
    if not punti or punti[0][0] < soglia:
        return None
    if len(punti) > 1 and punti[0][0] - punti[1][0] < distacco and punti[1][1] != punti[0][1]:
        return None
    return punti[0][1]


# ---------- archivio Football-Data.co.uk ----------

def divisioni_di(k):
    """Divisioni dell'archivio dove cercare una squadra di questo campionato o coppa nazionale (tutto il paese)."""
    return DIVISIONI.get(PAESE.get(k), ())


def nomi_archivio(righe):
    """Da righe dell'archivio ({"h", "a", "lg"}) a divisione -> insieme dei nomi."""
    out = {}
    for r in righe:
        if r.get("lg"):
            out.setdefault(r["lg"], set()).update((r["h"], r["a"]))
    return out


def nome_archivio(nome, k, per_div, casa=None):
    """Nome dell'archivio per la squadra `nome` che gioca nel campionato/coppa `k`. `casa` = campionato della squadra quando `k`
    e una coppa internazionale (dall'identita ESPN). None se la squadra non e nell'archivio o non e riconoscibile con sicurezza."""
    if k in FEMMINILI:
        return None
    divs = divisioni_di(k) or divisioni_di(casa)
    if not divs:
        return None
    cand = sorted(set().union(*(per_div.get(d, set()) for d in divs)))
    if not cand:
        return None
    m = MANUALE.get(piega(nome))
    if m in cand:
        return m
    if segni(parole(nome)) - {"b"}:  # femminili e giovanili: l'archivio ha solo prime squadre maschili (e qualche seconda squadra "B")
        return None
    return migliore(nome, [(c, [c]) for c in cand])


# ---------- id ESPN ----------

def id_espn(nome, squadre):
    """Id ESPN della squadra `nome` tra le squadre di una competizione ESPN (elenco di dict con id, displayName, shortDisplayName,
    name, location, abbreviation)."""
    cand = [(t.get("id"), [t.get("displayName"), t.get("shortDisplayName"), t.get("name"), t.get("location")]) for t in squadre or [] if t.get("id")]
    return migliore(nome, cand)


def campionato_di(storia, da_slug, coppe):
    """Campionato (codice dell'app) della squadra: quello in cui ha giocato piu partite tra i campionati seguiti (non coppe)."""
    c = Counter(da_slug.get(z.get("lg")) for z in storia or [])
    c.pop(None, None)
    for k in list(c):
        if k in coppe:
            c.pop(k)
    return c.most_common(1)[0][0] if c else None


def unisci(fd, es, finestra_ore=20):
    """Storia unica della squadra: partite football-data.org (hanno il primo tempo) piu quelle ESPN di tutte le competizioni
    che football-data.org non ha (stessa partita = entro 20 ore). In ordine di data."""
    out = list(fd or [])
    for z in es or []:
        if not any(abs((z["t"] - y["t"]).total_seconds()) < finestra_ore * 3600 for y in out):
            out.append(z)
    out.sort(key=lambda z: z["t"])
    return out
