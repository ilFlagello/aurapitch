/* AuraPitch - disegno della maglia delle squadre per gli stemmi "tondo maglia" (5/11, scelta di Andrea).
   Nessuno stemma ufficiale: solo il disegno della prima maglia (strisce, cerchi, metà, banda) con i suoi due colori.
   Le squadre che non sono qui hanno la tinta unita con i colori veri da ESPN (m.col). Si aggiunge a mano.
   Disegni: v strisce verticali, h cerchi (strisce orizzontali), m metà e metà, d banda diagonale,
   c banda verticale al centro, f fascia orizzontale sul petto, s tinta unita con anello del secondo colore. */

const MAGLIE = {
  // Italia
  "milan": ["v", "#D6001C", "#111111"], "inter": ["v", "#0B1F4B", "#1E6FD9"], "internazionale": ["v", "#0B1F4B", "#1E6FD9"], "juventus": ["v", "#FFFFFF", "#111111"],
  "atalanta": ["v", "#1E3A8A", "#111111"], "udinese": ["v", "#FFFFFF", "#111111"], "bologna": ["v", "#B91C1C", "#1E3A8A"],
  "genoa": ["m", "#B91C1C", "#1E3A8A"], "cagliari": ["m", "#B91C1C", "#1E3A8A"], "lecce": ["v", "#FACC15", "#DC2626"],
  "sassuolo": ["v", "#16A34A", "#111111"], "napoli": ["s", "#1E90D6", "#FFFFFF"], "roma": ["s", "#8B1D2C", "#F5A623"],
  "lazio": ["s", "#7DC4EA", "#FFFFFF"], "fiorentina": ["s", "#6D28D9", "#FFFFFF"], "torino": ["s", "#7F1D1D", "#FFFFFF"],
  "como": ["s", "#1D4ED8", "#FFFFFF"], "parma": ["c", "#FFFFFF", "#111111"], "verona": ["s", "#1D4ED8", "#FACC15"],
  "hellas verona": ["s", "#1D4ED8", "#FACC15"], "pisa": ["v", "#111111", "#1D4ED8"], "cremonese": ["v", "#9CA3AF", "#B91C1C"],
  "palermo": ["s", "#F9A8C4", "#111111"], "sampdoria": ["f", "#1D4ED8", "#FFFFFF"], "bari": ["s", "#FFFFFF", "#DC2626"],
  "venezia": ["s", "#111111", "#F97316"], "monza": ["f", "#DC2626", "#FFFFFF"], "empoli": ["s", "#1D4ED8", "#FFFFFF"],
  "modena": ["s", "#FACC15", "#1D4ED8"], "catanzaro": ["v", "#FACC15", "#DC2626"], "cesena": ["s", "#FFFFFF", "#111111"],
  "padova": ["s", "#FFFFFF", "#DC2626"], "spezia": ["s", "#FFFFFF", "#111111"], "frosinone": ["s", "#FACC15", "#1D4ED8"],
  "salernitana": ["s", "#7F1D1D", "#FFFFFF"], "spal": ["v", "#FFFFFF", "#38BDF8"], "ternana": ["v", "#16A34A", "#DC2626"],
  "reggiana": ["s", "#8B1D2C", "#FFFFFF"], "carrarese": ["v", "#FACC15", "#1D4ED8"], "juve stabia": ["v", "#FACC15", "#1D4ED8"],
  "avellino": ["s", "#16A34A", "#FFFFFF"], "entella": ["s", "#38BDF8", "#FFFFFF"], "mantova": ["s", "#DC2626", "#FFFFFF"],
  "sudtirol": ["s", "#DC2626", "#FFFFFF"], "pescara": ["s", "#38BDF8", "#FFFFFF"], "livorno": ["s", "#8B1D2C", "#FFFFFF"],
  // Inghilterra
  "newcastle": ["v", "#111111", "#FFFFFF"], "newcastle united": ["v", "#111111", "#FFFFFF"], "brentford": ["v", "#DC2626", "#FFFFFF"],
  "sunderland": ["v", "#EB172B", "#FFFFFF"], "crystal palace": ["v", "#1B458F", "#C4122E"], "brighton": ["v", "#0057B8", "#FFFFFF"],
  "brighton hove albion": ["v", "#0057B8", "#FFFFFF"], "stoke": ["v", "#E03A3E", "#FFFFFF"], "stoke city": ["v", "#E03A3E", "#FFFFFF"],
  "sheffield united": ["v", "#EE2737", "#FFFFFF"], "west brom": ["v", "#122F67", "#FFFFFF"], "west bromwich albion": ["v", "#122F67", "#FFFFFF"],
  "blackburn": ["m", "#009EE0", "#FFFFFF"], "blackburn rovers": ["m", "#009EE0", "#FFFFFF"], "qpr": ["h", "#1D5BA4", "#FFFFFF"],
  "queens park rangers": ["h", "#1D5BA4", "#FFFFFF"], "southampton": ["v", "#D71920", "#FFFFFF"], "arsenal": ["c", "#E11D2E", "#FFFFFF"],
  "manchester city": ["s", "#6CABDD", "#FFFFFF"], "man city": ["s", "#6CABDD", "#FFFFFF"], "manchester united": ["s", "#DA291C", "#111111"],
  "man united": ["s", "#DA291C", "#111111"], "liverpool": ["s", "#C8102E", "#FFFFFF"], "chelsea": ["s", "#034694", "#FFFFFF"],
  "tottenham": ["s", "#FFFFFF", "#132257"], "tottenham hotspur": ["s", "#FFFFFF", "#132257"], "aston villa": ["s", "#7B003C", "#95BFE5"],
  "west ham": ["s", "#7A263A", "#1BB1E7"], "west ham united": ["s", "#7A263A", "#1BB1E7"], "everton": ["s", "#003399", "#FFFFFF"],
  "wolverhampton": ["s", "#FDB913", "#231F20"], "wolves": ["s", "#FDB913", "#231F20"], "wolverhampton wanderers": ["s", "#FDB913", "#231F20"], "fulham": ["s", "#FFFFFF", "#111111"],
  "bournemouth": ["v", "#DA291C", "#111111"], "afc bournemouth": ["v", "#DA291C", "#111111"], "nottingham forest": ["s", "#DD0000", "#FFFFFF"],
  "spurs": ["s", "#FFFFFF", "#132257"], "man utd": ["s", "#DA291C", "#111111"], "nottm forest": ["s", "#DD0000", "#FFFFFF"],
  "leeds": ["s", "#FFFFFF", "#1D428A"], "leeds united": ["s", "#FFFFFF", "#1D428A"], "burnley": ["s", "#6C1D45", "#99D6EA"],
  // Scozia
  "celtic": ["h", "#009B3A", "#FFFFFF"], "rangers": ["s", "#1B458F", "#FFFFFF"], "hearts": ["s", "#8B1D2C", "#FFFFFF"],
  "heart of midlothian": ["s", "#8B1D2C", "#FFFFFF"], "hibernian": ["s", "#007A33", "#FFFFFF"], "kilmarnock": ["v", "#1E3A8A", "#FFFFFF"],
  "aberdeen": ["s", "#C8102E", "#FFFFFF"], "dundee united": ["s", "#F68B1F", "#111111"],
  // Spagna
  "barcelona": ["v", "#A50044", "#004D98"], "fc barcelona": ["v", "#A50044", "#004D98"], "atletico madrid": ["v", "#CB3524", "#FFFFFF"],
  "athletic club": ["v", "#E11D2E", "#FFFFFF"], "athletic bilbao": ["v", "#E11D2E", "#FFFFFF"], "real sociedad": ["v", "#0067B1", "#FFFFFF"],
  "real betis": ["v", "#0BB363", "#FFFFFF"], "betis": ["v", "#0BB363", "#FFFFFF"], "espanyol": ["v", "#1E64C8", "#FFFFFF"],
  "girona": ["v", "#CD2534", "#FFFFFF"], "rayo vallecano": ["d", "#FFFFFF", "#E53027"], "real madrid": ["s", "#FFFFFF", "#C9A227"],
  "sevilla": ["s", "#FFFFFF", "#D71920"], "valencia": ["s", "#FFFFFF", "#111111"], "villarreal": ["s", "#FFE667", "#005187"],
  "celta vigo": ["s", "#8AC3EE", "#FFFFFF"], "celta": ["s", "#8AC3EE", "#FFFFFF"], "osasuna": ["s", "#D91A21", "#0A346F"],
  "getafe": ["s", "#004FA3", "#FFFFFF"], "mallorca": ["s", "#E20613", "#111111"], "alaves": ["v", "#0761AF", "#FFFFFF"],
  "barca": ["v", "#A50044", "#004D98"], "atleti": ["v", "#CB3524", "#FFFFFF"], "athletic": ["v", "#E11D2E", "#FFFFFF"],
  // Germania
  "bayern munich": ["s", "#DC052D", "#FFFFFF"], "bayern monaco": ["s", "#DC052D", "#FFFFFF"], "borussia dortmund": ["s", "#FDE100", "#111111"],
  "dortmund": ["s", "#FDE100", "#111111"], "bayer leverkusen": ["s", "#E32221", "#111111"], "rb leipzig": ["s", "#FFFFFF", "#DD0741"],
  "vfb stuttgart": ["f", "#FFFFFF", "#E32219"], "stuttgart": ["f", "#FFFFFF", "#E32219"], "stoccarda": ["f", "#FFFFFF", "#E32219"],
  "eintracht frankfurt": ["s", "#111111", "#E1000F"], "union berlin": ["s", "#EB1923", "#FFFFFF"], "schalke 04": ["s", "#004D9D", "#FFFFFF"],
  "werder bremen": ["s", "#1D9053", "#FFFFFF"], "freiburg": ["s", "#111111", "#E2001A"], "borussia monchengladbach": ["s", "#FFFFFF", "#111111"],
  "leverkusen": ["s", "#E32221", "#111111"], "gladbach": ["s", "#FFFFFF", "#111111"], "bayern": ["s", "#DC052D", "#FFFFFF"],
  "hamburg": ["s", "#FFFFFF", "#0A3F86"], "hamburger sv": ["s", "#FFFFFF", "#0A3F86"], "st pauli": ["s", "#624839", "#FFFFFF"],
  // Francia
  "paris saint germain": ["c", "#004170", "#DA291C"], "psg": ["c", "#004170", "#DA291C"], "marseille": ["s", "#FFFFFF", "#2FAEE0"],
  "lyon": ["s", "#FFFFFF", "#1D428A"], "monaco": ["m", "#E51B22", "#FFFFFF"], "lens": ["v", "#FFE600", "#E51B22"], "rc lens": ["v", "#FFE600", "#E51B22"],
  "lille": ["s", "#E01E13", "#24216A"], "nice": ["v", "#E30613", "#111111"], "rennes": ["s", "#E13327", "#111111"], "nantes": ["s", "#FCD405", "#00843D"],
  // Portogallo, Olanda, Belgio
  "porto": ["v", "#0050A0", "#FFFFFF"], "fc porto": ["v", "#0050A0", "#FFFFFF"], "sporting cp": ["h", "#008057", "#FFFFFF"],
  "sporting": ["h", "#008057", "#FFFFFF"], "benfica": ["s", "#E83030", "#FFFFFF"], "braga": ["s", "#E21B23", "#FFFFFF"],
  "ajax": ["c", "#FFFFFF", "#D2122E"], "psv": ["v", "#ED1C24", "#FFFFFF"], "psv eindhoven": ["v", "#ED1C24", "#FFFFFF"],
  "feyenoord": ["m", "#FFFFFF", "#E00000"], "az alkmaar": ["s", "#E30613", "#FFFFFF"], "az": ["s", "#E30613", "#FFFFFF"],
  "club brugge": ["v", "#0081FF", "#111111"], "club brugge kv": ["v", "#0081FF", "#111111"], "anderlecht": ["s", "#4C2A85", "#FFFFFF"],
  // Turchia, Grecia, Balcani, Est
  "galatasaray": ["m", "#A90432", "#FDB912"], "fenerbahce": ["v", "#163962", "#FFED00"], "besiktas": ["v", "#111111", "#FFFFFF"],
  "besiktas jk": ["v", "#111111", "#FFFFFF"], "trabzonspor": ["v", "#7B1C2E", "#5BC4F1"], "olympiacos": ["v", "#E20613", "#FFFFFF"],
  "olympiakos": ["v", "#E20613", "#FFFFFF"], "paok": ["v", "#111111", "#FFFFFF"], "aek athens": ["s", "#FFD700", "#111111"],
  "pae aek": ["s", "#FFD700", "#111111"], "panathinaikos": ["s", "#007A33", "#FFFFFF"], "partizan": ["v", "#111111", "#FFFFFF"],
  "red star belgrade": ["v", "#E20613", "#FFFFFF"], "crvena zvezda": ["v", "#E20613", "#FFFFFF"], "dinamo zagreb": ["s", "#0033A0", "#FFFFFF"],
  "ferencvaros": ["v", "#1E9B4B", "#FFFFFF"], "ferencvaros tc": ["v", "#1E9B4B", "#FFFFFF"], "slavia praha": ["m", "#FFFFFF", "#DC1F26"],
  "slavia prague": ["m", "#FFFFFF", "#DC1F26"], "sparta prague": ["s", "#8B1A2C", "#FFFFFF"], "sparta praha": ["s", "#8B1A2C", "#FFFFFF"],
  "shakhtar donetsk": ["v", "#F47920", "#111111"], "dynamo kyiv": ["s", "#FFFFFF", "#0057B7"], "red bull salzburg": ["s", "#FFFFFF", "#D82C3A"],
  "salzburg": ["s", "#FFFFFF", "#D82C3A"], "sturm graz": ["v", "#111111", "#FFFFFF"], "rapid wien": ["s", "#00663C", "#FFFFFF"],
  "young boys": ["s", "#FFD700", "#111111"], "basel": ["m", "#E30613", "#1D3D8F"], "copenhagen": ["s", "#FFFFFF", "#1E3A8A"],
  "kobenhavn": ["s", "#FFFFFF", "#1E3A8A"], "midtjylland": ["s", "#111111", "#E30613"], "bodo glimt": ["s", "#FFE600", "#111111"],
  "malmo": ["s", "#7FC3F0", "#FFFFFF"], "malmo ff": ["s", "#7FC3F0", "#FFFFFF"],
  // Sudamerica
  "boca juniors": ["f", "#103F79", "#F3B229"], "river plate": ["d", "#FFFFFF", "#E30613"], "racing club": ["v", "#6CB4E4", "#FFFFFF"],
  "independiente": ["s", "#E30613", "#FFFFFF"], "san lorenzo": ["v", "#1D3D8F", "#E30613"], "estudiantes": ["v", "#E30613", "#FFFFFF"],
  "velez sarsfield": ["s", "#FFFFFF", "#1D3D8F"], "newells old boys": ["m", "#E30613", "#111111"], "rosario central": ["v", "#003DA5", "#FFD100"],
  "flamengo": ["h", "#E30613", "#111111"], "fluminense": ["v", "#8B1D2C", "#00843D"], "vasco da gama": ["d", "#111111", "#FFFFFF"],
  "botafogo": ["v", "#111111", "#FFFFFF"], "palmeiras": ["s", "#006437", "#FFFFFF"], "corinthians": ["s", "#FFFFFF", "#111111"],
  "sao paulo": ["f", "#FFFFFF", "#E30613"], "santos": ["s", "#FFFFFF", "#111111"], "gremio": ["v", "#0D80BF", "#111111"],
  "internacional": ["s", "#E30613", "#FFFFFF"], "atletico mineiro": ["v", "#111111", "#FFFFFF"], "cruzeiro": ["s", "#0033A0", "#FFFFFF"],
  "penarol": ["v", "#FFD100", "#111111"], "nacional": ["s", "#FFFFFF", "#003DA5"], "colo colo": ["s", "#FFFFFF", "#111111"],
  // Nord America
  "inter miami": ["s", "#F7B5CD", "#231F20"], "la galaxy": ["s", "#FFFFFF", "#00245D"], "america": ["s", "#FFD100", "#1D3D8F"],
  "club america": ["s", "#FFD100", "#1D3D8F"], "chivas": ["v", "#E30613", "#FFFFFF"], "guadalajara": ["v", "#E30613", "#FFFFFF"],
  "tigres": ["s", "#FDB913", "#003DA5"], "monterrey": ["v", "#0A2240", "#FFFFFF"],
  // altre squadre viste spesso (5/11): stesse regole
  "frankfurt": ["s", "#111111", "#E1000F"], "bremen": ["s", "#1D9053", "#FFFFFF"], "nottingham": ["s", "#DD0000", "#FFFFFF"],
  "brighton hove": ["v", "#0057B8", "#FFFFFF"], "stade rennais": ["s", "#E13327", "#111111"], "schalke": ["s", "#004D9D", "#FFFFFF"],
  "1 koln": ["s", "#FFFFFF", "#ED1C24"], "koln": ["s", "#FFFFFF", "#ED1C24"], "hoffenheim": ["s", "#1C63B7", "#FFFFFF"],
  "mainz": ["s", "#C3141E", "#FFFFFF"], "mainz 05": ["s", "#C3141E", "#FFFFFF"], "toulouse": ["s", "#5B2A86", "#FFFFFF"],
  "strasbourg": ["s", "#009FE3", "#FFFFFF"], "angers": ["v", "#111111", "#FFFFFF"], "brest": ["s", "#E30613", "#FFFFFF"],
  "lorient": ["s", "#F37021", "#111111"], "auxerre": ["s", "#FFFFFF", "#0A4595"], "aj auxerre": ["s", "#FFFFFF", "#0A4595"],
  "le havre": ["s", "#8DC8E8", "#0A2240"], "malaga": ["v", "#0B66B2", "#FFFFFF"], "deportivo": ["v", "#FFFFFF", "#0047AB"],
  "deportivo coruna": ["v", "#FFFFFF", "#0047AB"], "elche": ["f", "#FFFFFF", "#00843D"], "levante": ["m", "#00428E", "#B4053F"],
  "coventry city": ["s", "#77B5E5", "#FFFFFF"], "ipswich town": ["s", "#0044A9", "#FFFFFF"], "hull city": ["s", "#F5A623", "#111111"],
  "viktoria plzen": ["m", "#E30613", "#0033A0"], "twente": ["s", "#E30613", "#FFFFFF"], "twente enschede": ["s", "#E30613", "#FFFFFF"],
  "gent": ["s", "#0055A4", "#FFFFFF"], "nec nijmegen": ["v", "#E30613", "#00843D"], "union saint gilloise": ["s", "#FCEE33", "#0B2A6F"],
  "levski sofia": ["s", "#0033A0", "#FFFFFF"], "cska sofia": ["s", "#E30613", "#FFFFFF"], "hajduk split": ["s", "#FFFFFF", "#0B2A6F"],
  "brann": ["s", "#E30613", "#FFFFFF"], "omonoia": ["s", "#00843D", "#FFFFFF"], "lillestrom": ["s", "#FFE600", "#111111"],
};


/* stesse parole tolte da tutti e due i lati: "FC Porto" = "Porto", "Atlético de Madrid" = "Atletico Madrid".
   Non si tolgono "real", "athletic", "united", "city": distinguono squadre diverse. */
const VUOTE = new Set(["fc", "cf", "ac", "as", "ssc", "afc", "sc", "us", "ss", "ssd", "cd", "ud", "sd", "rc", "rcd", "sv", "vfl", "tsg", "fk", "sk", "if", "bk", "de", "del", "the", "club", "calcio", "1909", "1913", "1907", "1899", "1900", "1904", "jk", "kv", "tc", "cfc", "fbc", "bc", "pfc", "nk", "kf"]);
const chiave = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w && !VUOTE.has(w)).join(" ");
const INDICE = {};
for (const [k, v] of Object.entries(MAGLIE)) INDICE[chiave(k)] = v;

/* disegno della maglia di una squadra: [disegno, colore base, secondo colore] oppure null (allora tinta unita) */
function maglia(t) { return INDICE[chiave(t)] || null; }

/* forme dentro il cerchio (viewBox 24): il secondo colore si disegna sopra il colore base */
const DISEGNI = {
  v: "M5 0h3v24H5zM10.5 0h3v24h-3zM16 0h3v24h-3z",
  h: "M0 6h24v3H0zM0 11.5h24v3H0zM0 17h24v3H0z",
  m: "M12 0h12v24H12z",
  d: "M-2 6.5L6.5 -2L26 17.5L17.5 26z",
  c: "M9 0h6v24H9z",
  f: "M0 9.2h24v5.6H0z",
  s: "",
};

export { MAGLIE, maglia, chiave, DISEGNI };
