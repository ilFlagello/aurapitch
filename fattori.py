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

VERSIONE = "fattori-1"
SOSTITUTO = 0.5
AFFIDABILITA = {"squalifica": 0.9, "infortunio": 0.7, "dubbio": 0.3, "assente": 1.0, "panchina": 0.6}
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
    "assenza": ["non convocat", "fuori dai convocati", "esclus", "salta la", "salta il", "out of the squad", "will miss", "misses", "se pierde", "verpasst"],
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


def classifica(titolo):
    t = " " + piano(titolo) + " "
    if any(k in t for k in PAROLE["smentita"]):
        return "smentita"
    for tipo in ("squalifica", "dubbio", "assenza", "rientro", "infortunio"):
        if any(piano(k) in t for k in PAROLE[tipo]):
            return "infortunio" if tipo == "assenza" else tipo
    return None


def fattori_squadra(squadra, lato, lam, notizie, marcatori, gol_squadra, foto_utc, ko_utc):
    """Correzioni per una squadra a partire dalle notizie. Restituisce (lista fattori, correzione relativa totale)."""
    per_giocatore = {}
    for n in notizie:
        if not n.get("t"):
            continue
        t = datetime.fromisoformat(n["t"])
        if ko_utc and t > ko_utc:
            continue
        tipo = classifica(n["titolo"])
        for g in marcatori:
            if not _cognome_in(g["n"], n["titolo"]):
                continue
            if not gol_squadra:  # gol della squadra non noti: stima prudente dai marcatori in elenco
                gol_squadra = max(sum(x["g"] for x in marcatori) * 1.4, max(x.get("pg") or 0 for x in marcatori) * 1.3, 1)
            quota = min(QUOTA_MAX, (g["g"] + ASSIST * g["a"]) / max(gol_squadra, g["g"] + g["a"], 1))
            prezzo = GIA_NELLE_QUOTE if foto_utc and t < foto_utc else 1.0
            aff = AFFIDABILITA.get(tipo, 0.0)
            delta = -quota * (1 - SOSTITUTO) * aff * prezzo
            f = {"tipo": tipo or "notizia", "chi": g["n"], "lato": lato, "squadra": squadra, "quota": round(quota, 3), "affidabilita": aff, "prezzo": prezzo,
                 "delta": round(delta, 4), "titolo": n["titolo"], "fonte": n["fonte"], "link": n["link"], "t": n["t"]}
            old = per_giocatore.get(g["n"])
            # per ogni giocatore vale la notizia piu recente (un rientro annulla un infortunio piu vecchio)
            if old is None or f["t"] > old["t"]:
                per_giocatore[g["n"]] = f
    lista = sorted(per_giocatore.values(), key=lambda f: f["delta"])
    somma = sum(f["delta"] for f in lista)
    if somma < -TETTO:  # oltre il tetto: tutte le correzioni ridotte in proporzione
        for f in lista:
            f["delta"] = round(f["delta"] * TETTO / -somma, 4)
            f["tetto"] = True
        somma = -TETTO
    return lista, somma
