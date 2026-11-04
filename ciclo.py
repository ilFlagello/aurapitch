"""AuraPitch - ciclo di miglioramento guidato dagli agenti di controllo (ogni mattina, dentro strumenti/impara.py).

Gli agenti (revisore, verificatori, misura del vantaggio) trovano dove l'IA sbaglia; qui l'apprendimento ne tiene conto:
 1. fasce di probabilita: se nel diario una fascia (es. 60-70%) succede piu o meno spesso di quanto l'IA dice (lo stesso
    controllo del revisore), si impara una piccola correzione per quella fascia;
 2. specialisti: se la misura del vantaggio (vantaggio.py) dice che dove lavora uno specialista il mercato va contro i
    consigli, il suo peso nell'integratore scende;
 3. cronologia semplice: "cosa ha cambiato l'IA e perche", un evento per ogni cambio del modello attivo.
Regola ferma: ogni correzione si impara sulle partite piu vecchie e si prova su quelle piu recenti (mai viste). Entra solo
se riduce l'errore; altrimenti resta in ombra. Solo libreria standard (le correzioni si applicano in calibrazione.py)."""
import math

CHIAVI = ("1", "X", "2", "O2.5", "GG")
K_FASCE = 150          # prudenza: una fascia con 150 previsioni vale meta della differenza misurata
TETTO_FASCE = 0.05     # mai piu di 5 punti di correzione per fascia
MIN_FASCE = 300        # partite finite del diario prima di provare la correzione
MARGINE = 0.0005       # la correzione deve ridurre l'errore di almeno lo 0,05% sulle partite mai viste
QUOTA_PROVA = 0.3      # le ultime 30% partite (per data) fanno da prova


def _esito(c, g):
    h, a = g
    return int({"1": h > a, "X": h == a, "2": h < a, "O2.5": h + a > 2.5, "GG": h > 0 and a > 0}[c])


def fascia(p):
    """Fascia della probabilita "piegata" (sotto il 50% si legge al contrario): 5 = 50-60% ... 9 = 90-100%."""
    q = p if p >= 0.5 else 1 - p
    return min(9, int(q * 10))


def applica_fasce(p, corr):
    """Probabilita corretta per fascia. corr = {"6": -0.02, ...} (chiave = fascia). Senza correzione resta uguale."""
    if not corr:
        return p
    d = corr.get(str(fascia(p)))
    if not d:
        return p
    if p >= 0.5:
        return min(0.995, max(0.5, p + d))
    return max(0.005, min(0.5, p - d))


def _correzione_attiva(storia, giorno):
    """La correzione per fasce in vigore in un certo giorno (storia = {data: corr})."""
    date = [d for d in (storia or {}) if d <= (giorno or "")]
    return (storia or {}).get(max(date)) if date else None


def togli_fasce(p, corr):
    """Inverso approssimato di applica_fasce: serve a imparare dalle probabilita "prima" della correzione gia in vigore."""
    if not corr:
        return p
    d = corr.get(str(fascia(p)))
    if not d:
        return p
    return applica_fasce(p, {k: -v for k, v in corr.items()}) if p != 0.5 else p


def _righe(fin, storia):
    out = []
    for v in fin:
        corr = _correzione_attiva(storia, (v.get("t0") or v.get("date") or "")[:10])
        for c in CHIAVI:
            if c in (v.get("pc") or {}):
                out.append((togli_fasce(float(v["pc"][c]), corr), _esito(c, v["g"])))
    return out


def _impara(righe):
    """Correzione per fascia: solo dove lo scarto supera due volte quello che puo fare il caso (come nel revisore), ridotta
    verso zero con K_FASCE e mai oltre TETTO_FASCE."""
    s = {}
    for p, y in righe:
        q, yy = (p, y) if p >= 0.5 else (1 - p, 1 - y)
        x = s.setdefault(str(fascia(p)), [0.0, 0, 0.0])
        x[0] += yy - q
        x[1] += 1
        x[2] += q * (1 - q)
    out = {}
    for f, (d, n, var) in s.items():
        c = d / (n + K_FASCE)
        if abs(d) > 2 * math.sqrt(max(var, 1e-9)) and abs(c) >= 0.005:
            out[f] = round(max(-TETTO_FASCE, min(TETTO_FASCE, c)), 4)
    return out


def _ll(righe, corr):
    t = 0.0
    for p, y in righe:
        q = min(1 - 1e-6, max(1e-6, applica_fasce(p, corr)))
        t += -math.log(q if y else 1 - q)
    return t / max(1, len(righe))


def impara_fasce(diario, storia=None):
    """Correzione per fasce imparata sulle partite piu vecchie del diario e provata sulle piu recenti.
    Restituisce {"attivo", "corr", "prova": {...}, "motivo"}; con attivo=True "corr" e allenata su tutte le partite."""
    fin = sorted((v for v in diario if v.get("st") == "FT" and isinstance(v.get("g"), list) and len(v["g"]) == 2 and v.get("pc")),
                 key=lambda v: v.get("ko") or v.get("date") or "")
    if len(fin) < MIN_FASCE:
        return {"attivo": False, "corr": {}, "prova": {"partite": len(fin)}, "motivo": f"servono almeno {MIN_FASCE} partite finite (ora {len(fin)})"}
    taglio = int(len(fin) * (1 - QUOTA_PROVA))
    tr, te = _righe(fin[:taglio], storia), _righe(fin[taglio:], storia)
    corr = _impara(tr)
    base, nuovo = _ll(te, {}), _ll(te, corr)
    guad = (base - nuovo) / base if base else 0.0
    prova = {"partite": len(fin) - taglio, "previsioni": len(te), "errore_prima": round(base, 5), "errore_dopo": round(nuovo, 5), "guadagno": round(100 * guad, 3), "corr_prova": corr}
    if not corr:
        return {"attivo": False, "corr": {}, "prova": prova, "motivo": "nessuna fascia si discosta abbastanza: niente da correggere"}
    if guad < MARGINE:
        return {"attivo": False, "corr": {}, "prova": prova, "ombra": corr,
                "motivo": f"sulle partite mai viste la correzione non riduce l'errore ({100 * guad:+.2f}%): resta in ombra".replace(".", ",")}
    finale = _impara(_righe(fin, storia))
    return {"attivo": bool(finale), "corr": finale, "prova": prova,
            "motivo": f"errore più basso del {100 * guad:.2f}% su {len(fin) - taglio} partite mai viste".replace(".", ",")}


def testo_fasce(corr):
    """"60-70%: -2 punti; 80-90%: +1 punto" (in parole semplici)."""
    def pt(d):
        x = round(100 * d, 1)
        return (f"{x:+.1f}".rstrip("0").rstrip(".") + (" punto" if abs(x) == 1 else " punti")).replace(".", ",")
    return "; ".join(f"{int(f) * 10}-{int(f) * 10 + 10}%: {pt(d)}" for f, d in sorted((corr or {}).items()))


def peso_specialisti(consigli):
    """Dalla misura del vantaggio (vantaggio.py, se c'e): specialisti dove il mercato va contro i consigli piu che senza
    specialisti, oltre il margine statistico. {nome: fattore 0,5-1} (1 = nessun cambio)."""
    try:
        import vantaggio as VM
    except ImportError:
        return {}, None
    mi = VM.misura(consigli or {})
    base, t = mi.get("senza_specialisti") or {}, mi.get("totale") or {}
    rif = base.get("medio") if base.get("n", 0) >= VM.MIN_GRUPPO else t.get("medio")
    out = {}
    if rif is None:
        return out, mi
    for s, r in (mi.get("per_specialista") or {}).items():
        if s == VM.FORMAZIONI or r.get("n", 0) < VM.MIN_GRUPPO:
            continue
        diff = r["medio"] - rif
        if diff < 0 and r["medio"] + r["margine"] < rif:
            out[s] = round(max(0.5, 1 + diff / 4), 2)
    return out, mi


NOMI_RICETTE = {"nessuna": "nessuna correzione", "mercato": "correzione per mercato", "mercato+campionato": "correzione per mercato e campionato"}


def eventi(prima, dopo, oggi, motivi=None):
    """Cosa e cambiato nel modello attivo tra ieri (prima) e oggi (dopo), in parole semplici: [{"data", "cosa", "perche"}]."""
    motivi = motivi or {}
    out = []

    def ev(cosa, perche):
        out.append({"data": oggi, "cosa": cosa, "perche": perche})

    if (prima.get("ricetta") or "nessuna") != (dopo.get("ricetta") or "nessuna"):
        ev(f"Nuovo modello: {NOMI_RICETTE.get(dopo.get('ricetta'), dopo.get('ricetta'))} (prima: {NOMI_RICETTE.get(prima.get('ricetta') or 'nessuna', prima.get('ricetta'))})",
           motivi.get("ricetta") or "")
    f0, f1 = prima.get("fasce") or {}, dopo.get("fasce") or {}
    if f0 != f1:
        if f1 and not f0:
            ev("Probabilità ritarate per fascia: " + testo_fasce(f1), motivi.get("fasce") or "")
        elif f0 and not f1:
            ev("Tolta la ritaratura delle probabilità per fascia", motivi.get("fasce") or "")
        elif sorted(f0) != sorted(f1) or max(abs(f1.get(k, 0) - f0.get(k, 0)) for k in set(f0) | set(f1)) >= 0.005:
            ev("Ritaratura delle fasce aggiornata: " + testo_fasce(f1), motivi.get("fasce") or "")
    a0, a1 = prima.get("affid_lg") or {}, dopo.get("affid_lg") or {}
    if a0 != a1:
        if a1:
            ev("Affidabilità più bassa dove l'IA è stata meno onesta: " + ", ".join(f"{lg} ×{v}" for lg, v in sorted(a1.items())).replace(".", ","),
               motivi.get("affid_lg") or "")
        else:
            ev("Tolta la riduzione dell'affidabilità per campionato", motivi.get("affid_lg") or "")
    g0 = {g: bool(v.get("attivo")) for g, v in (((prima.get("integratore") or {}).get("gruppi")) or {}).items()}
    g1 = {g: bool(v.get("attivo")) for g, v in (((dopo.get("integratore") or {}).get("gruppi")) or {}).items()}
    for g in sorted(set(g0) | set(g1)):
        if g0.get(g, False) != g1.get(g, False):
            ev(("Acceso" if g1.get(g) else "Spento") + f" l'integratore degli specialisti ({'campionati principali' if g == 'principali' else 'altri campionati'})",
               motivi.get("integratore") or "")
    r0, r1 = (prima.get("integratore") or {}).get("ridotti") or {}, (dopo.get("integratore") or {}).get("ridotti") or {}
    for s in sorted(set(r1) - set(r0)):
        ev(f"Peso più basso per lo specialista \"{s.replace('_', ' ')}\" (×{r1[s]})".replace(".", ","),
           motivi.get("specialisti") or "dopo il suo consiglio il mercato si muoveva contro più spesso del solito")
    for s in sorted(set(r0) - set(r1)):
        ev(f"Peso pieno di nuovo per lo specialista \"{s.replace('_', ' ')}\"", motivi.get("ridotti_tolti") or "la misura del vantaggio non lo penalizza più")
    p0, p1 = prima.get("peso_ia") or {}, dopo.get("peso_ia") or {}
    if p0 and not p1 and motivi.get("peso_ia"):  # spento dall'anti-illusione: una voce sola, non una per famiglia
        ev("Le notizie (assenze, squalifiche) pesano di nuovo per intero in tutti i mercati", motivi["peso_ia"])
        p0 = {}
    for fam in sorted(set(p0) | set(p1)):
        if p0.get(fam) != p1.get(fam):
            ev(f"{fam}: le notizie (assenze, squalifiche) pesano " + (f"il {round(100 * p1[fam])}%" if fam in p1 else "di nuovo per intero"),
               motivi.get("peso_ia") or "misurato sulle partite in cui l'IA ha corretto le quote")
    return out
