"""AuraPitch - specialisti dell'algoritmo e integratore (solo libreria standard: lo usano sia l'allenamento sia l'app).

Ogni SPECIALISTA guarda una sola cosa, con i soli dati disponibili PRIMA del calcio d'inizio, e restituisce un numero
(positivo = a favore della squadra di casa, o di piu gol per "tendenza_gol"). Non decide nulla da solo.
L'INTEGRATORE (allenato ogni mattina da strumenti/impara.py) impara quanto pesa ogni specialista, separatamente per i
campionati principali e per gli altri, provandolo su partite mai viste: se uno specialista non aiuta, il suo peso resta
vicino a zero; se l'insieme non batte le sole quote, l'integratore resta spento.
Lo storico di una squadra e una lista di partite {"t": data, "casa": bool, "gf": gol fatti, "gs": gol subiti} in ordine di data."""
import math

# nome interno, descrizione, a cosa serve
SPECIALISTI = [
    ("forma_punti", "Forma: punti nelle ultime 5", "1x2"),
    ("forma_gol", "Forma: differenza reti nelle ultime 5", "1x2"),
    ("riposo", "Giorni di riposo", "1x2"),
    ("casa_trasferta", "Rendimento in casa e in trasferta", "1x2"),
    ("tendenza_gol", "Tendenza gol delle due squadre", "ou"),
    ("scontri_diretti", "Scontri diretti (ultimi 6, negli ultimi 6 anni)", "1x2"),
    # modello statistico indipendente (non guarda le quote): calcolato dal Motore qui sotto su tutti i risultati
    ("elo", "Punteggio di forza Elo (dai soli risultati)", "1x2"),
    ("forza_esito", "Forza d'attacco e difesa: chi segna di piu", "1x2"),
    ("forza_gol", "Forza d'attacco e difesa: quanti gol", "ou"),
    ("fortuna", "Fortuna o merito: gol rispetto ai tiri in porta", "1x2"),
    ("tiri", "Dominio nei tiri in porta", "1x2"),
    ("momento", "Momento: punteggio Elo guadagnato o perso nelle ultime 5", "1x2"),
    ("stanchezza", "Stanchezza: partite giocate negli ultimi 14 giorni", "1x2"),
    ("classifica", "Posizione in classifica", "1x2"),
    ("motivazioni", "Motivazioni: lotta per titolo, coppe o salvezza a fine stagione", "1x2"),
    # community: i pronostici dei tipster AuraPitch (verificati dal servizio), pesati per bravura. Vale solo per le partite dell'app
    # (nell'archivio storico non c'e): resta in ombra finche non ha abbastanza partite, poi l'integratore decide se pesa
    ("consenso", "Consenso della community AuraPitch (tipster pesati per bravura)", "1x2"),
    # come il consenso, questi due valgono solo per le partite dell'app (l'archivio non ha coppe ne quote del mattino):
    # restano in ombra finche non hanno abbastanza partite, poi l'integratore decide se pesano
    ("coppe", "Turnover e coppe: partita di coppa pochi giorni prima o dopo", "1x2"),
    ("movimento", "Movimento delle quote dal mattino al fischio", "1x2"),
    # notizie dell'ultima ora (3/11): assenze e cambi annunciati poco prima del fischio. Solo partite dell'app: in ombra
    # finche non ha abbastanza partite, poi l'integratore decide se pesa. Sempre in coda: i diari vecchi restano validi
    ("ultima_ora", "Notizie dell'ultima ora: assenze e cambi annunciati nelle 6 ore prima del fischio", "1x2"),
]
N_MOTORE = 9
# campionati che si giocano nell'anno solare (la stagione e l'anno); gli altri vanno da luglio a giugno
ANNO_SOLARE = {"MLS", "BR1", "BR2", "AR1", "AR2", "AR3", "J1", "CN1", "NO1", "SE1", "CHI1", "COL1", "UY1", "PY1", "EC1", "PE1", "USL", "CR1"}


def _data(t):
    return t.date() if hasattr(t, "date") and callable(t.date) else t


def stagione(lg, t):
    d = _data(t)
    return str(d.year) if lg in ANNO_SOLARE else str(d.year if d.month >= 7 else d.year - 1)
NOMI = [s[0] for s in SPECIALISTI]
PRINCIPALI = ("I1", "I2", "E0", "E1", "SP1", "D1", "F1")


def gruppo(lg):
    return "principali" if lg in PRINCIPALI else "altri"


def _punti(z):
    return 3 if z["gf"] > z["gs"] else 1 if z["gf"] == z["gs"] else 0


def _media(xs):
    return sum(xs) / len(xs) if xs else None


def _giorni(a, b):
    d = a - b
    return d.days if hasattr(d, "days") else None


def consenso(c, mk, minimo=5):
    """Specialista "consenso": quanto la community (quote dei voti 1/X/2 pesati per bravura) si sposta dal mercato verso la
    squadra di casa. c = [peso 1, peso X, peso 2, numero di voti]; mk = probabilita 1X2 delle quote. None con meno di 'minimo' voti."""
    if not c or len(c) < 4 or c[3] < minimo or not mk:
        return None
    tot = (c[0] + c[1] + c[2]) or 1
    return round(((c[0] - c[2]) / tot - (mk[0] - mk[2])), 4)


def carico_coppa(cp):
    """Quanto pesa la coppa su una squadra (0 = niente, 1 = ha giocato in coppa il giorno prima). La partita di coppa
    ancora da giocare pesa un po' meno (turnover possibile, non certo). cp = {"prima": giorni o None, "dopo": giorni o None}."""
    if not cp:
        return 0.0
    v = 0.0
    if cp.get("prima") is not None:
        v = max(v, (6 - min(5, max(1, cp["prima"]))) / 5)
    if cp.get("dopo") is not None:
        v = max(v, 0.7 * (6 - min(5, max(1, cp["dopo"]))) / 5)
    return v


def coppe(cps):
    """Specialista "coppe": carico di coppa dell'ospite meno quello della squadra di casa (positivo = favorisce la casa).
    cps = [coppa casa, coppa ospite] da genera_app.coppa_vicina; None quando la partita e essa stessa di coppa."""
    if not cps or len(cps) < 2:
        return None
    return round(carico_coppa(cps[1]) - carico_coppa(cps[0]), 4)


def movimento(mk, mk0):
    """Specialista "movimento": di quanto si e spostato il mercato verso la squadra di casa dalla prima lettura del mattino
    (diario: mk0) all'ultima prima del fischio (mk). None senza le due letture."""
    if not mk or not mk0 or len(mk) < 3 or len(mk0) < 3:
        return None
    return round((mk[0] - mk[2]) - (mk0[0] - mk0[2]), 4)


ULTIMA_ORA_ORE = 6


def _quando(t):
    from datetime import datetime, timezone
    try:
        x = datetime.fromisoformat(str(t).replace("Z", "+00:00"))
    except ValueError:
        return None
    return x if x.tzinfo else x.replace(tzinfo=timezone.utc)


def ultima_ora(fattori, ko, ore=ULTIMA_ORA_ORE):
    """Specialista "ultima_ora": effetto netto, a favore della squadra di casa, delle assenze e dei cambi annunciati nelle
    ultime 'ore' prima del fischio (notizie, infortuni, formazione ufficiale: i fattori con l'orario della notizia).
    Le quote del mattino non li conoscono; quelle vicine al fischio forse si': lo decide l'integratore, su partite mai viste.
    Per ogni fattore: "delta" = attacco della propria squadra (negativo se manca un giocatore), "delta_avv" = attacco
    dell'avversaria (positivo se manca un difensore). None senza notizie recenti (nessun dato, non zero)."""
    k = ko if hasattr(ko, "tzinfo") else (_quando(ko) if ko else None)
    if k is not None and k.tzinfo is None:
        from datetime import timezone
        k = k.replace(tzinfo=timezone.utc)
    if not fattori or k is None:
        return None
    from datetime import timedelta
    v, n = 0.0, 0
    for f in fattori:
        t = _quando(f.get("t")) if f.get("t") else None
        if t is None or not (k - timedelta(hours=ore) <= t <= k) or f.get("lato") not in (0, 1):
            continue
        segno = 1 if f["lato"] == 0 else -1
        v += segno * ((f.get("delta") or 0) - (f.get("delta_avv") or 0))
        n += 1
    return round(v, 4) if n else None


def segnali(storia_h, storia_a, t0, diretti=None, motore=None, comunita=None, coppa=None, mov=None, ultima=None):
    """Lista di valori (uno per specialista, None se mancano i dati) per la partita casa-trasferta che inizia a t0.
    diretti = precedenti tra le due squadre visti dalla squadra di casa di oggi: [{"t", "gf", "gs"}, ...] (in casa e fuori)."""
    h, a = [z for z in storia_h if z["t"] < t0], [z for z in storia_a if z["t"] < t0]
    out = []
    # forma: punti e differenza reti nelle ultime 5 (almeno 3 partite per squadra)
    h5, a5 = h[-5:], a[-5:]
    ok = len(h5) >= 3 and len(a5) >= 3
    out.append((_media([_punti(z) for z in h5]) - _media([_punti(z) for z in a5])) / 3 if ok else None)
    out.append((_media([z["gf"] - z["gs"] for z in h5]) - _media([z["gf"] - z["gs"] for z in a5])) / 3 if ok else None)
    # riposo: differenza di giorni dall'ultima partita (tetto 7)
    rh = _giorni(t0, h[-1]["t"]) if h else None
    ra = _giorni(t0, a[-1]["t"]) if a else None
    out.append((min(7, rh) - min(7, ra)) / 7 if rh and ra and rh > 0 and ra > 0 else None)
    # casa/trasferta: punti della squadra di casa nelle sue ultime 8 in casa contro quelli dell'ospite nelle sue ultime 8 fuori
    hc, at = [z for z in h if z["casa"]][-8:], [z for z in a if not z["casa"]][-8:]
    out.append((_media([_punti(z) for z in hc]) - _media([_punti(z) for z in at])) / 3 if len(hc) >= 3 and len(at) >= 3 else None)
    # tendenza gol: media dei gol totali nelle ultime 8 delle due squadre, rispetto a 2,6
    h8, a8 = h[-8:], a[-8:]
    out.append((_media([z["gf"] + z["gs"] for z in h8 + a8]) - 2.6) / 2 if len(h8) >= 3 and len(a8) >= 3 else None)
    # scontri diretti: punti medi della squadra di casa di oggi negli ultimi 6 precedenti (almeno 3, al massimo 6 anni fa)
    d6 = [z for z in (diretti or []) if z["t"] < t0 and _giorni(t0, z["t"]) is not None and _giorni(t0, z["t"]) <= 6 * 366][-6:]
    out.append((_media([_punti(z) for z in d6]) - 1.35) / 3 if len(d6) >= 3 else None)
    out += list(motore) if motore else [None] * N_MOTORE
    out.append(comunita)  # consenso della community (genera_app.aggiorna_consenso lo aggiorna durante il giorno)
    out.append(coppa)  # turnover e coppe (genera_app.aggiorna_specialisti_giorno)
    out.append(mov)  # movimento delle quote (genera_app.aggiorna_specialisti_giorno, fino al fischio)
    out.append(ultima)  # notizie dell'ultima ora (genera_app.aggiorna_specialisti_giorno, fino al fischio)
    return [None if v is None else round(v, 4) for v in out]


class Motore:
    """Modello statistico indipendente dalle quote. Legge i risultati in ordine di data e tiene, per ogni squadra:
    - punteggio Elo (parte da 1500, vantaggio casa 60, K 20);
    - forza d'attacco e di difesa (medie mobili dei gol fatti e subiti rispetto alla media del campionato);
    - fortuna (gol meno 0,31 x tiri in porta) e dominio nei tiri in porta (fatti meno subiti), in media mobile.
    caratteristiche() va chiamata PRIMA di aggiorna() per la stessa partita: cosi usa solo il passato."""
    A = 0.12  # peso dell'ultima partita nelle medie mobili

    def __init__(self):
        self.elo, self.att, self.dif, self.n, self.fort, self.tiri, self.lega = {}, {}, {}, {}, {}, {}, {}
        self.storia_elo, self.date, self.tab = {}, {}, {}  # Elo dopo ogni partita, date delle partite, classifiche per stagione

    def _classifica(self, lg, t):
        tab = self.tab.get((lg, stagione(lg, t)))
        if not tab or len(tab) < 8:
            return None
        ordine = sorted(tab.items(), key=lambda x: (-x[1][0], -x[1][2], x[0]))
        return {sq: (i + 1, v) for i, (sq, v) in enumerate(ordine)}, len(ordine)

    def _pressione(self, sq, cl, n):
        """1 = si gioca qualcosa (titolo, coppe, salvezza) a stagione avanzata; 0 = meta classifica o stagione ancora lunga."""
        pos, (pt, pg, _) = cl[sq]
        if pg < 0.6 * 2 * (n - 1):
            return 0.0
        punti = sorted((v[1][0] for v in cl.values()), reverse=True)
        soglie = [punti[0], punti[min(3, n - 1)], punti[max(0, n - 4)]]  # primo posto, quarto posto, quartultimo
        return 1.0 if pos <= 4 or pos >= n - 3 or any(abs(pt - s) <= 3 for s in soglie) else 0.0

    def caratteristiche(self, h, a, lg, t=None):
        ph, pa = piega(h), piega(a)
        if self.n.get(ph, 0) < 5 or self.n.get(pa, 0) < 5:
            return [None] * N_MOTORE
        eh, ea = self.elo.get(ph, 1500), self.elo.get(pa, 1500)
        mg = self.lega.get(lg, 1.35)
        xh = mg * 1.12 * (self.att[ph] / mg) * (self.dif[pa] / mg)
        xa = mg * 0.88 * (self.att[pa] / mg) * (self.dif[ph] / mg)
        f = [(eh + 60 - ea) / 400, math.log(max(0.05, xh) / max(0.05, xa)) / 2, (xh + xa - 2 * mg) / 2]
        f.append((self.fort[ph] - self.fort[pa]) / 2 if ph in self.fort and pa in self.fort else None)
        f.append((self.tiri[ph] - self.tiri[pa]) / 5 if ph in self.tiri and pa in self.tiri else None)
        # momento: Elo guadagnato nelle ultime 5 (casa) meno quello dell'ospite
        mo = [(sh[-1] - sh[-6]) if len(sh) >= 6 else None for sh in (self.storia_elo.get(ph, []), self.storia_elo.get(pa, []))]
        f.append((mo[0] - mo[1]) / 100 if None not in mo else None)
        if t is None:
            return f + [None, None, None]
        d = _data(t)
        st = [sum(1 for x in self.date.get(q, [])[-6:] if 0 < (d - x).days <= 14) for q in (ph, pa)]
        f.append((st[0] - st[1]) / 2)
        c = self._classifica(lg, t)
        if c and ph in c[0] and pa in c[0]:
            cl, n = c
            f.append((cl[pa][0] - cl[ph][0]) / n)
            f.append(self._pressione(ph, cl, n) - self._pressione(pa, cl, n))
        else:
            f += [None, None]
        return f

    def aggiorna(self, h, a, lg, gh, ga, sh=None, sa=None, t=None):
        ph, pa, A = piega(h), piega(a), self.A
        if t is not None:
            d = _data(t)
            tab = self.tab.setdefault((lg, stagione(lg, t)), {})
            for q, gf, gs in ((ph, gh, ga), (pa, ga, gh)):
                self.date.setdefault(q, []).append(d)
                del self.date[q][:-8]
                v = tab.get(q, [0, 0, 0])
                tab[q] = [v[0] + (3 if gf > gs else 1 if gf == gs else 0), v[1] + 1, v[2] + gf - gs]
        mg = self.lega.get(lg, 1.35)
        self.lega[lg] = mg + 0.02 * ((gh + ga) / 2 - mg)
        eh, ea = self.elo.get(ph, 1500), self.elo.get(pa, 1500)
        att = 1 / (1 + 10 ** ((ea - eh - 60) / 400))
        ris = 1.0 if gh > ga else 0.5 if gh == ga else 0.0
        k = 20 * (1 + math.log(1 + abs(gh - ga)) / 2)
        self.elo[ph], self.elo[pa] = eh + k * (ris - att), ea - k * (ris - att)
        for q in (ph, pa):
            self.storia_elo.setdefault(q, []).append(self.elo[q])
            del self.storia_elo[q][:-8]
        for t, gf, gs in ((ph, gh, ga), (pa, ga, gh)):
            self.att[t] = self.att.get(t, mg) + A * (gf - self.att.get(t, mg))
            self.dif[t] = self.dif.get(t, mg) + A * (gs - self.dif.get(t, mg))
            self.n[t] = self.n.get(t, 0) + 1
        if sh is not None and sa is not None:
            for t, gf, tf, ts in ((ph, gh, sh, sa), (pa, ga, sa, sh)):
                self.fort[t] = self.fort.get(t, 0.0) + A * ((gf - 0.31 * tf) - self.fort.get(t, 0.0))
                self.tiri[t] = self.tiri.get(t, 0.0) + A * ((tf - ts) - self.tiri.get(t, 0.0))


SIGLE = {"fc", "afc", "cf", "sc", "ac", "as", "ssc", "cd", "ud", "sd", "rc", "rcd", "sv", "vfb", "vfl", "tsg", "fk", "sk", "if", "bk", "club", "de", "calcio", "cp", "sad", "ca", "ec", "se", "fbc", "1907", "1909", "1913", "1919", "1899"}
# nomi diversi tra le fonti (app/ESPN/football-data.org -> archivio Football-Data.co.uk), gia "piegati"
ALIAS = {"manchester united": "man united", "manchester city": "man city", "queens park rangers": "qpr", "wolverhampton wanderers": "wolves",
         "nottingham forest": "nott m forest", "sheffield wednesday": "sheffield weds", "west bromwich albion": "west brom", "brighton hove albion": "brighton",
         "tottenham hotspur": "tottenham", "paris saint germain": "paris sg", "psg": "paris sg", "bayern munchen": "bayern munich", "inter milan": "inter", "internazionale": "inter",
         "ac milan": "milan", "atletico madrid": "ath madrid", "athletic bilbao": "ath bilbao", "athletic club": "ath bilbao", "real sociedad": "sociedad",
         "borussia monchengladbach": "m gladbach", "borussia dortmund": "dortmund", "bayer leverkusen": "leverkusen", "eintracht frankfurt": "ein frankfurt",
         "sporting lisbon": "sp lisbon", "sporting": "sp lisbon", "vitoria guimaraes": "guimaraes", "hamburger": "hamburg", "stade reims": "reims", "stade rennais": "rennes", "sporting braga": "sp braga", "braga": "sp braga",
         "psv eindhoven": "psv", "ajax amsterdam": "ajax", "olympique marseille": "marseille", "olympique lyonnais": "lyon", "stade rennais": "rennes", "stade de reims": "reims",
         "deportivo": "la coruna", "deportivo la coruna": "la coruna", "real oviedo": "oviedo", "real valladolid": "valladolid", "red bull bragantino": "bragantino",
         "lafc": "los angeles", "la galaxy": "los angeles galaxy", "kv kortrijk": "kortrijk", "kv mechelen": "mechelen"}


def piega(nome):
    """Nome di squadra semplificato per abbinare fonti diverse ("Newcastle United FC" ~ "Newcastle")."""
    import unicodedata
    x = unicodedata.normalize("NFD", str(nome or "")).encode("ascii", "ignore").decode().lower()
    parole = [w for w in "".join(c if c.isalnum() else " " for c in x).split() if w not in SIGLE]
    return " ".join(parole) or x.strip()


def indice_diretti(righe):
    """Da righe {"t", "h", "a", "gh", "ga"} a un indice coppia -> precedenti (in ordine di data)."""
    idx = {}
    for r in sorted(righe, key=lambda r: r["t"]):
        k = (piega(r["h"]), piega(r["a"]))
        idx.setdefault(k, []).append((r["t"], r["gh"], r["ga"]))
    return idx


_NOMI_IDX = {}


def risolvi(nome, idx):
    """Nome dell'archivio piu vicino: identico, alias, oppure (unico) contenuto nell'altro ("blackburn rovers" -> "blackburn")."""
    noti = _NOMI_IDX.get(id(idx))
    if noti is None:
        noti = _NOMI_IDX[id(idx)] = {x for k in idx for x in k}
    p = piega(nome)
    if p in noti:
        return p
    if ALIAS.get(p) in noti:
        return ALIAS[p]
    tp = set(p.split())
    cand = [n for n in noti if n and (set(n.split()) <= tp or tp <= set(n.split()))]
    if len(cand) == 1:
        return cand[0]
    pref = [n for n in cand if n.split()[0] == p.split()[0]] if p else []
    return pref[0] if len(pref) == 1 else p


def diretti_di(idx, h, a):
    """Precedenti visti dalla squadra h (in casa e in trasferta), dall'indice."""
    ph, pa = risolvi(h, idx), risolvi(a, idx)
    out = [{"t": t, "gf": x, "gs": y} for t, x, y in idx.get((ph, pa), [])] + [{"t": t, "gf": y, "gs": x} for t, x, y in idx.get((pa, ph), [])]
    return sorted(out, key=lambda z: z["t"])


def _norm(x, mu, sd):
    return [0.0 if v is None else (v - m) / (s or 1.0) for v, m, s in zip(x, mu, sd)]


def correggi(mk, mo, sp, lg, integ):
    """Probabilita 1X2 e Over 2,5 dopo l'integratore. integ = modello["integratore"]; se spento o assente non cambia nulla."""
    g = ((integ or {}).get("gruppi") or {}).get(gruppo(lg))
    if not g or not g.get("attivo") or not sp or all(v is None for v in sp) or not mk:
        return mk, mo
    z = _norm(sp, g["mu"], g["sd"])
    B = g["B"]  # una riga per specialista, colonne 1 / X / 2
    lg3 = [math.log(max(1e-6, p)) + sum(z[i] * B[i][j] for i in range(len(z))) for j, p in enumerate(mk)]
    mx = max(lg3)
    e = [math.exp(v - mx) for v in lg3]
    mk2 = [v / sum(e) for v in e]
    mo2 = mo
    if mo is not None and g.get("b_ou"):
        lo = math.log(max(1e-6, mo) / max(1e-6, 1 - mo)) + sum(z[i] * g["b_ou"][i] for i in range(len(z)))
        mo2 = 1 / (1 + math.exp(-lo))
    return mk2, mo2
