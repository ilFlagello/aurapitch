"""AuraPitch - fattori dell'algoritmo: ogni informazione nuova entra con un peso dichiarato e un tetto massimo.

Schema (uguale per ogni fonte):
    correzione dei gol attesi di una squadra = - peso del giocatore x quota non coperta dal sostituto x affidabilita della notizia x parte non ancora nelle quote
    - peso del giocatore: la sua parte dei gol della squadra (gol + mezzo assist, diviso i gol fatti dalla squadra)
    - sostituto: chi entra al suo posto copre circa meta del suo contributo (SOSTITUTO)
    - affidabilita: squalifica ufficiale > infortunio > "in dubbio" (AFFIDABILITA)
    - gia nelle quote: se la notizia e piu vecchia della fotografia delle quote, il mercato l'ha gia in gran parte assorbita (GIA_NELLE_QUOTE)
    - tetto: la somma delle correzioni non puo togliere piu del TETTO dei gol attesi di una squadra
Ogni correzione viene registrata nello storico: quando ci saranno abbastanza partite si misura se aiuta e si ritarano i pesi.
Le notizie: solo titoli, fonte, data e link da feed pubblici (Google News RSS); gli articoli non vengono copiati.
Solo libreria standard di Python."""
import re
import unicodedata
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

VERSIONE = "fattori-3"
SOSTITUTO = 0.5
AFFIDABILITA = {"squalifica": 0.9, "squalifica_gialli": 0.8, "infortunio": 0.7, "dubbio": 0.3, "assente": 1.0, "panchina": 0.6}
GIA_NELLE_QUOTE = 0.25
TETTO = 0.15
ASSIST = 0.5
QUOTA_MAX = 0.4  # nessun giocatore vale piu del 40% dei gol della squadra

PAROLE = {
    "squalifica": ["squalificat", "squalifica", "suspended", "suspension", "sancionad", "gesperrt", "sperre", "red card ban"],
    "dubbio": ["in dubbio", "a rischio", "in forse", "da valutare", "doubt", "doubtful", "late fitness test", "duda", "fraglich", "en el aire"],
    "infortunio": ["infortun", "lesione", "stiramento", "frattura", "ko ", " out ", "fermo ai box", "stop per", "indisponibil", "injur", "ruled out",
                   "sidelined", "hamstring", "lesion", "baja", "verletz", "fällt aus", "fehlt"],
    "rientro": ["recupera", "rientra", "torna a disposizione", "torna in gruppo", "convocato", "back in training", "returns", "available again", "recuperado", "vuelve", "zurück", "comeback"],
    "assenza": ["non convocat", "salter", "non ci sar", "non potr", "assent", "ai box", "forfait", "out per", "out contro", "stagione finita", "fuori dai convocati", "esclus", "salta la", "salta il", "out of the squad", "will miss", "misses", "se pierde", "verpasst"],
    "smentita": ["smentit", "nessun infortunio", "sta bene", "non preoccupa", "fit to play", "no injury"],
}
LINGUE = {
    "it": ("it", "IT", "IT:it", "(infortunio OR infortunato OR squalificato OR indisponibile OR \"in dubbio\" OR convocati)"),
    "en": ("en-GB", "GB", "GB:en", "(injury OR injured OR \"ruled out\" OR suspended OR doubt)"),
    "es": ("es", "ES", "ES:es", "(lesión OR lesionado OR baja OR sancionado OR duda)"),
    "de": ("de", "DE", "DE:de", "(verletzt OR Verletzung OR gesperrt OR fraglich OR fällt aus)"),
}
LINGUA_LEGA = {"I1": "it", "I2": "it", "E0": "en", "SP1": "es", "D1": "de", "CL": "en"}


def piano(s):
    s = unicodedata.normalize("NFD", str(s or "").lower())
    return "".join(c for c in s if unicodedata.category(c) != "Mn")


def url_notizie(squadra, lega):
    import urllib.parse
    hl, gl, ceid, chiavi = LINGUE[LINGUA_LEGA.get(lega, "it")]
    nome = re.sub(r"\b(fc|ac|as|ssc|cf|1907|1909|calcio)\b", "", squadra, flags=re.I).strip()
    q = f'"{nome}" {chiavi} when:3d'
    return "https://news.google.com/rss/search?" + urllib.parse.urlencode({"q": q, "hl": hl, "gl": gl, "ceid": ceid})


def leggi_rss(testo):
    """Solo titolo, fonte, data e link di ogni notizia."""
    out = []
    try:
        root = ET.fromstring(testo)
    except ET.ParseError:
        return out
    for it in root.iter("item"):
        tit = (it.findtext("title") or "").strip()
        fonte = (it.findtext("source") or "").strip()
        if fonte and tit.endswith(" - " + fonte):
            tit = tit[: -len(fonte) - 3]
        try:
            t = parsedate_to_datetime(it.findtext("pubDate")).astimezone(timezone.utc).isoformat()
        except (TypeError, ValueError):
            t = None
        out.append({"titolo": tit, "fonte": fonte, "link": (it.findtext("link") or "").strip(), "t": t})
    return out


def _cognome_in(nome, titolo):
    """Il giocatore e nominato nel titolo? Si cerca il cognome (o i cognomi composti)."""
    parti = [p for p in re.split(r"[\s\-]+", piano(nome)) if len(p) > 2]
    if not parti:
        return False
    tp = " " + re.sub(r"[^a-z0-9 ]", " ", piano(titolo)) + " "
    return f" {parti[-1]} " in tp or (len(parti) > 2 and f" {parti[-2]} " in tp)


def frase_di(nome, titolo):
    """Il pezzo di titolo che parla del giocatore: la parola chiave deve stare vicino al suo nome
    (in "Allegri squalificato, Varela titolare" la squalifica non e di Varela)."""
    pezzi = [p for p in re.split(r"\s*[,;:|.!?\u2013\u2014]\s*|\s+-\s+", titolo) if p.strip()]
    for i, p in enumerate(pezzi):
        if _cognome_in(nome, p):
            # se il pezzo e solo il nome ("Rabiot: out contro il Bologna") si guarda anche il pezzo dopo
            return p + (" " + pezzi[i + 1] if len(p.split()) <= 3 and i + 1 < len(pezzi) else "")
    return titolo


def classifica(titolo):
    t = " " + piano(titolo) + " "
    if any(k in t for k in PAROLE["smentita"]):
        return "smentita"
    for tipo in ("squalifica", "dubbio", "assenza", "rientro", "infortunio"):
        if any(piano(k) in t for k in PAROLE[tipo]):
            return "infortunio" if tipo == "assenza" else tipo
    return None


def _quota(g, gol_squadra):
    return min(QUOTA_MAX, (g["g"] + ASSIST * g["a"]) / max(gol_squadra, g["g"] + g["a"], 1))


DIFESA_MAX = 0.12  # fattori-3: un difensore o portiere vale al massimo +12% di gol attesi per l'avversaria


def _difesa(g):
    """Peso difensivo (fattori-3): portieri e difensori titolari con un voto medio AuraPitch sopra 6 nella stagione.
    Quanto e piu bravo (voto medio - 6) per quanto gioca (quota dei minuti): la sua assenza alza i gol attesi dell'avversaria."""
    pos = str(g.get("pos") or "")
    if not (pos.startswith("G") or pos.startswith("D")) or g.get("vm") is None:
        return 0.0
    v = max(0.0, g["vm"] - 6.0) * 0.15 * min(1.0, g.get("minq", 0)) * (1.3 if pos.startswith("G") else 1.0)
    return round(min(DIFESA_MAX, v), 3)


ALLENATORE = ["esonerat", "esonero", "nuovo allenatore", "nuovo tecnico", "panchina a ", "sacked", "new manager", "new head coach", "cesado", "destituido", "nuevo entrenador",
              "entlassen", "neuer trainer", "trennt sich von trainer"]


def fattori_squadra(squadra, lato, notizie, giocatori, gol_squadra, foto_utc, ko_utc, squalifiche=(), prima_partita=True):
    """Correzioni per una squadra: notizie (infortuni, squalifiche, dubbi) e squalifiche dall'ultima partita.
    giocatori: rosa con gol e assist di stagione (ESPN) o, in mancanza, i migliori marcatori (football-data).
    Restituisce (lista fattori, correzione relativa totale, segnali senza peso)."""
    if not gol_squadra:  # gol della squadra non noti: somma dei gol della rosa, o stima prudente dai marcatori
        gol_squadra = max(sum(x["g"] for x in giocatori) * (1.0 if len(giocatori) > 15 else 1.4), 1)
    per_giocatore, segnali = {}, []
    regolari = [g for g in giocatori if g["g"] + g["a"] > 0 or (g.get("tit") or 0) >= 3]
    for n in notizie:
        if not n.get("t"):
            continue
        t = datetime.fromisoformat(n["t"])
        if ko_utc and t > ko_utc:
            continue
        tp = " " + piano(n["titolo"]) + " "
        if any(k in tp for k in ALLENATORE) and (ko_utc is None or (ko_utc - t).days <= 10):
            segnali.append({"tipo": "allenatore", "titolo": n["titolo"], "fonte": n["fonte"], "link": n["link"], "t": n["t"]})
        for g in regolari:
            if not _cognome_in(g["n"], n["titolo"]):
                continue
            tipo = classifica(frase_di(g["n"], n["titolo"]))
            if tipo == "squalifica" and not prima_partita:
                continue  # una squalifica si sconta nella prima partita, non in quelle dopo
            quota = _quota(g, gol_squadra)
            prezzo = GIA_NELLE_QUOTE if foto_utc and t < foto_utc else 1.0
            aff = AFFIDABILITA.get(tipo, 0.0)
            f = {"tipo": tipo or "notizia", "chi": g["n"], "lato": lato, "squadra": squadra, "quota": round(quota, 3), "affidabilita": aff, "prezzo": prezzo,
                 "delta": round(-quota * (1 - SOSTITUTO) * aff * prezzo, 4), "delta_avv": round(_difesa(g) * (1 - SOSTITUTO) * aff * prezzo, 4), "titolo": n["titolo"], "fonte": n["fonte"], "link": n["link"], "t": n["t"], "fonte_tipo": "notizia"}
            old = per_giocatore.get(g["n"])
            # per ogni giocatore vale la notizia piu recente (un rientro annulla un infortunio piu vecchio)
            if old is None or f["t"] > old["t"]:
                per_giocatore[g["n"]] = f
    for sq in squalifiche:
        g = sq["giocatore"]
        aff = AFFIDABILITA["squalifica"] if "rosso" in sq["motivo"] else AFFIDABILITA["squalifica_gialli"]
        quota = _quota(g, gol_squadra)
        f = {"tipo": "squalifica", "chi": g["n"], "lato": lato, "squadra": squadra, "quota": round(quota, 3), "affidabilita": aff, "prezzo": GIA_NELLE_QUOTE,
             "delta": round(-quota * (1 - SOSTITUTO) * aff * GIA_NELLE_QUOTE, 4), "delta_avv": round(_difesa(g) * (1 - SOSTITUTO) * aff * GIA_NELLE_QUOTE, 4), "titolo": f"Squalificato: {sq['motivo']}", "fonte": "Cartellini ESPN", "link": "", "t": "", "fonte_tipo": "cartellini"}
        old = per_giocatore.get(g["n"])
        if old is None or f["delta"] - f["delta_avv"] < old["delta"] - old.get("delta_avv", 0):  # tra notizia e cartellini vale la correzione piu forte, non la somma
            per_giocatore[g["n"]] = f
    lista = sorted(per_giocatore.values(), key=lambda f: f["delta"])
    somma = sum(f["delta"] for f in lista)
    if somma < -TETTO:  # oltre il tetto: tutte le correzioni ridotte in proporzione
        for f in lista:
            f["delta"] = round(f["delta"] * TETTO / -somma, 4)
            f["tetto"] = True
        somma = -TETTO
    avv = sum(f.get("delta_avv", 0) for f in lista)
    if avv > TETTO:
        for f in lista:
            f["delta_avv"] = round(f.get("delta_avv", 0) * TETTO / avv, 4)
    return lista, somma, segnali
