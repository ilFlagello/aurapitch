"""Archivio meteo per il test "il meteo conta?": per ogni squadra dei 7 campionati dell'archivio Football-Data trova la citta
(geocodifica Open-Meteo, con alias per i nomi abbreviati) e scarica il meteo giornaliero 2012-2026 (Open-Meteo archive, gratuito).
Risultato: storico/meteo_squadre.json (squadra -> citta, coordinate) e storico/meteo_giorni.csv.gz (squadra, data, pioggia mm, vento max km/h, temperatura max)."""
import csv, gzip, json, os, time, urllib.parse, urllib.request

PAESE = {"I1": "IT", "I2": "IT", "E0": "GB", "E1": "GB", "SP1": "ES", "SP2": "ES", "D1": "DE", "D2": "DE", "F1": "FR", "F2": "FR"}
ALIAS = {"Man United": "Manchester", "Man City": "Manchester", "Nott'm Forest": "Nottingham", "Wolves": "Wolverhampton", "Sheffield United": "Sheffield", "Sheffield Weds": "Sheffield",
         "West Ham": "London", "Tottenham": "London", "Arsenal": "London", "Chelsea": "London", "Fulham": "London", "Crystal Palace": "London", "Brentford": "London", "QPR": "London",
         "Charlton": "London", "Millwall": "London", "Leyton Orient": "London", "Aston Villa": "Birmingham", "West Brom": "West Bromwich", "Newcastle": "Newcastle upon Tyne",
         "Brighton": "Brighton", "Bournemouth": "Bournemouth", "Leeds": "Leeds", "Leicester": "Leicester", "Everton": "Liverpool", "Liverpool": "Liverpool", "Middlesbrough": "Middlesbrough",
         "Stoke": "Stoke-on-Trent", "Swansea": "Swansea", "Cardiff": "Cardiff", "Hull": "Kingston upon Hull", "Blackburn": "Blackburn", "Bolton": "Bolton", "MK Dons": "Milton Keynes",
         "Ath Madrid": "Madrid", "Real Madrid": "Madrid", "Rayo Vallecano": "Madrid", "Getafe": "Getafe", "Leganes": "Leganés", "Ath Bilbao": "Bilbao", "Sociedad": "San Sebastián",
         "Betis": "Sevilla", "Sevilla": "Sevilla", "Espanol": "Barcelona", "Barcelona": "Barcelona", "Celta": "Vigo", "La Coruna": "A Coruña", "Sp Gijon": "Gijón", "Alaves": "Vitoria-Gasteiz",
         "Vallecano": "Madrid", "Las Palmas": "Las Palmas de Gran Canaria", "Valladolid": "Valladolid", "Mallorca": "Palma", "Osasuna": "Pamplona", "Girona": "Girona", "Cadiz": "Cádiz",
         "Inter": "Milano", "Milan": "Milano", "Roma": "Roma", "Lazio": "Roma", "Juventus": "Torino", "Torino": "Torino", "Sampdoria": "Genova", "Genoa": "Genova", "Chievo": "Verona",
         "Verona": "Verona", "Spal": "Ferrara", "Atalanta": "Bergamo", "Fiorentina": "Firenze", "Napoli": "Napoli", "Sudtirol": "Bolzano", "Virtus Entella": "Chiavari", "Juve Stabia": "Castellammare di Stabia",
         "Feralpisalo": "Salò", "Pro Vercelli": "Vercelli", "Virtus Lanciano": "Lanciano",
         "M'gladbach": "Mönchengladbach", "Ein Frankfurt": "Frankfurt am Main", "Hertha": "Berlin", "Union Berlin": "Berlin", "FC Koln": "Köln", "Bayern Munich": "München", "Munich 1860": "München",
         "Dortmund": "Dortmund", "Leverkusen": "Leverkusen", "Hoffenheim": "Sinsheim", "RB Leipzig": "Leipzig", "Mainz": "Mainz", "Greuther Furth": "Fürth", "Fortuna Dusseldorf": "Düsseldorf",
         "St Pauli": "Hamburg", "Hamburg": "Hamburg", "Nurnberg": "Nürnberg", "Stuttgart": "Stuttgart", "Werder Bremen": "Bremen", "Schalke 04": "Gelsenkirchen", "Heidenheim": "Heidenheim an der Brenz"}


def get(url, tent=4):
    for i in range(tent):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "AuraPitch-test"}), timeout=60) as r:
                return json.load(r)
        except Exception as e:  # noqa: BLE001
            print("  riprovo:", url[:90], e)
            time.sleep(5 * (i + 1))
    return None


def main(limite_s=40 * 60):
    """Riprende da dove era rimasto: citta gia geocodificate in meteo_squadre.json, serie gia scaricate in storico/meteo/<lat,lon>.json.
    Si ferma dopo 'limite_s' secondi (il workflow salva e si puo rilanciare)."""
    t0 = time.time()
    righe = list(csv.DictReader(gzip.open("storico/fd_partite.csv.gz", "rt")))
    squadre = {}
    for r in righe:
        if r["Season"] >= "1617":  # test su 10 stagioni: meno dati da scaricare
            squadre.setdefault(r["HomeTeam"], PAESE.get(r["Div"], ""))
    try:
        citta = json.load(open("storico/meteo_squadre.json"))
    except (OSError, ValueError):
        citta = {}
    for sq, paese in sorted(squadre.items()):
        if sq in citta:
            continue
        nome = ALIAS.get(sq, sq)
        g = get("https://geocoding-api.open-meteo.com/v1/search?" + urllib.parse.urlencode({"name": nome, "count": 5, "language": "it", "format": "json"}), tent=2)
        res = [x for x in (g or {}).get("results", []) if x.get("country_code") == paese] if g else []
        if res:
            x = max(res, key=lambda z: z.get("population") or 0)
            citta[sq] = {"citta": x["name"], "lat": x["latitude"], "lon": x["longitude"]}
        else:
            citta[sq] = None
            print("non trovata:", sq, "->", nome)
        time.sleep(0.2)
    json.dump(citta, open("storico/meteo_squadre.json", "w"), ensure_ascii=False, indent=0)
    os.makedirs("storico/meteo", exist_ok=True)
    fatte = 0
    for sq, c in citta.items():
        if not c or time.time() - t0 > limite_s:
            continue
        k = f"{round(c['lat'], 2)},{round(c['lon'], 2)}"
        path = f"storico/meteo/{k}.json"
        if os.path.exists(path):
            continue
        d = get("https://archive-api.open-meteo.com/v1/archive?" + urllib.parse.urlencode({"latitude": c["lat"], "longitude": c["lon"], "start_date": "2016-08-01", "end_date": "2026-06-30",
                                                                                             "daily": "precipitation_sum,wind_speed_10m_max,temperature_2m_max", "timezone": "Europe/Rome"}), tent=2)
        if d and "daily" in d:
            D = d["daily"]
            json.dump({"t": D["time"], "p": D["precipitation_sum"], "w": D["wind_speed_10m_max"], "te": D["temperature_2m_max"]}, open(path, "w"), separators=(",", ":"))
            fatte += 1
        time.sleep(2)
    # file unico per il test
    out = []
    for sq, c in citta.items():
        if not c:
            continue
        path = f"storico/meteo/{round(c['lat'], 2)},{round(c['lon'], 2)}.json"
        if os.path.exists(path):
            D = json.load(open(path))
            out += [[sq, t, p, w, te] for t, p, w, te in zip(D["t"], D["p"], D["w"], D["te"])]
    with gzip.open("storico/meteo_giorni.csv.gz", "wt") as f:
        w = csv.writer(f)
        w.writerow(["squadra", "data", "pioggia", "vento", "temp"])
        w.writerows(out)
    mancano = sum(1 for sq, c in citta.items() if c and not os.path.exists(f"storico/meteo/{round(c['lat'], 2)},{round(c['lon'], 2)}.json"))
    print(f"squadre {len(squadre)}, con citta {sum(1 for c in citta.values() if c)}, serie scaricate ora {fatte}, mancano {mancano}, righe {len(out)}")


if __name__ == "__main__":
    os.makedirs("storico", exist_ok=True)
    main()
