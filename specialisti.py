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
]
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


def segnali(storia_h, storia_a, t0):
    """Lista di valori (uno per specialista, None se mancano i dati) per la partita casa-trasferta che inizia a t0."""
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
    return [None if v is None else round(v, 4) for v in out]


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
