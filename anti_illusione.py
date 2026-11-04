"""AuraPitch - agente "anti-illusione": un miglioramento acceso deve continuare a meritarselo.

Ogni miglioramento entra solo se riduce l'errore su partite mai viste. Ma la prova si fa una volta, il giorno
dell'accensione: un piccolo vantaggio puo essere stato fortuna (illusione) o sparire col tempo. Qui, ogni mattina
(dentro strumenti/impara.py), ogni miglioramento acceso viene ricontrollato SOLO sulle partite arrivate DOPO la sua
accensione, confrontando le probabilita con e senza di lui:
  - fasce di probabilita (ciclo.py): probabilita mostrate contro le stesse senza la ritaratura in vigore quel giorno;
  - peso delle notizie (peso_ia): probabilita mostrate contro quelle calcolate senza peso (salvate nel diario, "sz");
  - integratore degli specialisti, per gruppo di campionati: quote corrette contro quote da sole, con i pesi
    "congelati" il giorno dell'accensione (cosi la prova resta su partite che quei pesi non hanno mai visto);
  - specialisti ridotti dalla misura del vantaggio: integratore con il peso ridotto contro peso pieno (pesi congelati);
  - affidabilita per campionato (onesta.py): i campionati penalizzati devono restare meno onesti degli altri.
Con almeno MIN_DOPO partite dopo l'accensione, se il miglioramento non riduce piu l'errore (guadagno <= 0) si spegne da
solo per PAUSA giorni, con una voce in "cambi" che dice perche. Poi puo tornare solo ripassando la prova normale.
La ricetta del modello ha gia il suo controllo (impara.py, "controllo" e "pause"); la miscela dei bookmaker esperti
si ricontrolla da sola (esperti.decidi). Solo libreria standard."""
import copy
import math
from datetime import date, timedelta

import ciclo as CI
import onesta as ON
import specialisti as SP

MIN_DOPO = 150   # partite finite dopo l'accensione prima di giudicare (come MIN_CTRL della ricetta)
PAUSA = 14       # giorni di stop dopo lo spegnimento (come PAUSA_RICETTA)
NOMI = {"fasce": "Ritaratura delle probabilità per fascia", "peso_ia": "Peso delle notizie e delle assenze",
        "integratore:principali": "Integratore degli specialisti (campionati principali)", "integratore:altri": "Integratore degli specialisti (altri campionati)",
        "ridotti": "Peso ridotto per alcuni specialisti", "affid_lg": "Affidabilità più bassa in alcuni campionati"}
TIPO = {"fasce": "fasce", "peso_ia": "peso_ia", "integratore:principali": "integratore", "integratore:altri": "integratore", "ridotti": "ridotti_tolti", "affid_lg": "affid_lg"}


def _giorno(v):
    return (v.get("t0") or v.get("ko") or v.get("date") or "")[:10]


def _finite(diario):
    return sorted((v for v in diario if v.get("st") == "FT" and isinstance(v.get("g"), list) and len(v["g"]) == 2),
                  key=lambda v: v.get("ko") or v.get("date") or "")


def _gruppi_attivi(attivo):
    return {g: v for g, v in (((attivo.get("integratore") or {}).get("gruppi")) or {}).items() if v.get("attivo")}


def accese(attivo):
    """Miglioramenti accesi oggi nel modello attivo, con i parametri da congelare: {voce: parametri}."""
    out = {}
    if attivo.get("fasce"):
        out["fasce"] = None  # la ritaratura in vigore giorno per giorno sta gia in fasce_storia
    if attivo.get("peso_ia"):
        out["peso_ia"] = dict(attivo["peso_ia"])
    gr = _gruppi_attivi(attivo)
    for g, v in gr.items():
        out["integratore:" + g] = copy.deepcopy(v)
    rid = (attivo.get("integratore") or {}).get("ridotti") or {}
    if rid and gr:
        out["ridotti"] = {"ridotti": dict(rid), "specialisti": list((attivo.get("integratore") or {}).get("specialisti") or SP.NOMI), "gruppi": copy.deepcopy(gr)}
    if attivo.get("affid_lg"):
        out["affid_lg"] = dict(attivo["affid_lg"])
    return out


def inizio_fasce(storia, oggi):
    """Primo giorno della serie ininterrotta di ritarature in vigore fino a oggi (fasce_storia)."""
    dal = oggi
    for d in sorted((storia or {}), reverse=True):
        if not storia[d]:
            break
        dal = d
    return min(dal, oggi)


# ---------- con e senza, sulle partite dopo l'accensione ----------

def _ll3(p, e):
    return -math.log(max(1e-9, p[e]))


def _ll2(p, y):
    p = min(1 - 1e-9, max(1e-9, p))
    return -math.log(p if y else 1 - p)


def _esito3(g):
    return 0 if g[0] > g[1] else 1 if g[0] == g[1] else 2


def _confronto(con, senza, partite):
    if not partite:
        return {"partite": 0}
    c, s = sum(con) / len(con), sum(senza) / len(senza)
    return {"partite": partite, "previsioni": len(con), "con": round(c, 5), "senza": round(s, 5), "guadagno": round(100 * (s - c) / s, 3) if s else 0.0}


def _sp(v):
    sp = v.get("sp")
    if not sp or len(sp) > len(SP.NOMI):
        return None
    return list(sp) + [None] * (len(SP.NOMI) - len(sp))


def _integ_ll(post, gruppi, lg_ok):
    """Errore 1X2 (+ Over 2,5 se c'e) delle quote corrette dall'integratore "gruppi" e delle quote da sole."""
    con, senza, n = [], [], 0
    for v in post:
        sp, mk = _sp(v), v.get("mk")
        if not sp or not mk or not lg_ok(v.get("lg")):
            continue
        mo = v.get("mo")
        mk2, mo2 = SP.correggi(mk, mo, sp, v.get("lg"), {"gruppi": gruppi})
        if all(abs(x - y) < 1e-9 for x, y in zip(mk2, mk)) and (mo2 == mo or mo is None or abs(mo2 - mo) < 1e-9):
            continue  # qui l'integratore non cambia nulla (nessun segnale): la partita non dice niente su di lui
        e = _esito3(v["g"])
        con.append(_ll3(mk2, e))
        senza.append(_ll3(mk, e))
        n += 1
        if mo is not None and mo2 is not None:
            y = int(sum(v["g"]) > 2.5)
            con.append(_ll2(mo2, y))
            senza.append(_ll2(mo, y))
    return con, senza, n


def _ripristina(gruppi, ridotti, specialisti):
    """Pesi dell'integratore senza la riduzione chiesta dalla misura del vantaggio (B e b_ou divisi per il fattore)."""
    out = copy.deepcopy(gruppi)
    for g in out.values():
        for s, f in ridotti.items():
            if s in specialisti and f:
                i = specialisti.index(s)
                if i < len(g.get("B") or []):
                    g["B"][i] = [x / f for x in g["B"][i]]
                if g.get("b_ou") and i < len(g["b_ou"]):
                    g["b_ou"][i] = g["b_ou"][i] / f
    return out


def misura(voce, rec, diario, storia_fasce=None):
    """Confronto con / senza il miglioramento sulle partite finite dopo l'accensione (rec = {"dal", "param"})."""
    fin = _finite(diario)
    dal, par = rec.get("dal") or "9999", rec.get("param")
    if voce == "fasce":
        con, senza, n = [], [], 0
        for v in fin:
            if _giorno(v) < dal or not v.get("pc"):
                continue
            corr = CI._correzione_attiva(storia_fasce, _giorno(v))
            if not corr:
                continue
            n += 1
            for c in CI.CHIAVI:
                if c in v["pc"]:
                    p, y = float(v["pc"][c]), CI._esito(c, v["g"])
                    con.append(_ll2(p, y))
                    senza.append(_ll2(CI.togli_fasce(p, corr), y))
        return _confronto(con, senza, n)
    if voce == "peso_ia":
        con, senza, n = [], [], 0
        for v in fin:
            sz = v.get("sz") or {}
            pz = sz.get("peso_ia")
            if _giorno(v) < dal or not pz or not v.get("pc"):
                continue
            n += 1
            for i, c in enumerate(CI.CHIAVI):
                if c in v["pc"] and i < len(pz) and pz[i] is not None:
                    y = CI._esito(c, v["g"])
                    con.append(_ll2(float(v["pc"][c]), y))
                    senza.append(_ll2(float(pz[i]), y))
        return _confronto(con, senza, n)
    post = [v for v in fin if (v.get("ko") or v.get("date") or "")[:10] > dal]
    if voce.startswith("integratore:"):
        g = voce.split(":", 1)[1]
        con, senza, n = _integ_ll(post, {g: par}, lambda lg: SP.gruppo(lg) == g)
        return _confronto(con, senza, n)
    if voce == "ridotti":
        gr = par.get("gruppi") or {}
        pieni = _ripristina(gr, par.get("ridotti") or {}, par.get("specialisti") or SP.NOMI)
        con, _, n = _integ_ll(post, gr, lambda lg: SP.gruppo(lg) in gr)
        senza, _, _ = _integ_ll(post, pieni, lambda lg: SP.gruppo(lg) in gr)
        return _confronto(con, senza, n)
    if voce == "affid_lg":
        fv = [v for v in post if v.get("pc")]
        pen = [v for v in fv if v.get("lg") in (par or {})]
        alt = [v for v in fv if v.get("lg") not in (par or {})]
        s_pen, s_alt = ON.scarto(pen)[0], ON.scarto(alt)[0]
        out = {"partite": len(pen), "minimo": ON.MIN_PROVA, "scarto_penalizzati": s_pen, "scarto_altri": s_alt}
        if s_pen is not None and s_alt is not None:
            out["guadagno"] = round(s_pen - s_alt, 2)  # positivo: i penalizzati restano meno onesti, la penalita serve
        return out
    return {"partite": 0}


# ---------- spegnimento ----------

def spegni(attivo, voce, oggi):
    """Toglie il miglioramento dal modello attivo (sul posto)."""
    if voce == "fasce":
        attivo.pop("fasce", None)
        if attivo.get("fasce_storia"):
            attivo["fasce_storia"][oggi] = {}
    elif voce in ("peso_ia", "affid_lg"):
        attivo.pop(voce, None)
    elif voce.startswith("integratore:"):
        g = ((attivo.get("integratore") or {}).get("gruppi") or {}).get(voce.split(":", 1)[1])
        if g:
            g["attivo"] = False
    elif voce == "ridotti":
        integ = attivo.get("integratore") or {}
        rid = integ.pop("ridotti", None) or {}
        if rid and integ.get("gruppi"):
            integ["gruppi"] = _ripristina(integ["gruppi"], rid, integ.get("specialisti") or SP.NOMI)
    return attivo


def _testo(voce, m):
    if voce == "affid_lg":
        return (f"anti-illusione: sulle {m['partite']} partite arrivate dopo l'accensione i campionati penalizzati non erano meno onesti "
                f"degli altri (scarto {m.get('scarto_penalizzati')} contro {m.get('scarto_altri')} punti)").replace(".", ",")
    return (f"anti-illusione: sulle {m['partite']} partite arrivate dopo l'accensione l'errore non scendeva più "
            f"({m['guadagno']:+.2f}%): spento per {PAUSA} giorni").replace(".", ",")


def controlla(attivo, stato, diario, oggi):
    """Ogni mattina, dopo che l'apprendimento ha deciso cosa accendere.
    stato = {"registro": {voce: {"dal", "param"}}, "pause": {voce: data}} (in modello.json, "anti_illusione").
    Restituisce (attivo, stato, rapporto, motivi): motivi = {tipo: perche} per le voci in "cambi" (ciclo.eventi)."""
    reg = dict((stato or {}).get("registro") or {})
    pause = {k: v for k, v in ((stato or {}).get("pause") or {}).items() if v > oggi}
    motivi, righe = {}, []
    # 1) in pausa: restano spente anche se l'apprendimento le riaccende
    for voce in list(accese(attivo)):
        if voce in pause:
            spegni(attivo, voce, oggi)
    acc = accese(attivo)
    storia = attivo.get("fasce_storia") or {}
    # 2) registro: chi si accende oggi riceve la data e i parametri congelati; chi si e spento esce
    for voce in list(reg):
        if voce not in acc:
            reg.pop(voce)
    for voce, par in acc.items():
        if voce not in reg:
            reg[voce] = {"dal": inizio_fasce(storia, oggi) if voce == "fasce" else oggi, "param": par}
    # 3) controllo sulle partite arrivate dopo l'accensione
    for voce in sorted(reg):
        rec = reg[voce]
        m = misura(voce, rec, diario, storia)
        minimo = m.get("minimo", MIN_DOPO)
        riga = {"voce": voce, "nome": NOMI.get(voce, voce), "dal": rec["dal"], "partite": m.get("partite", 0), "minimo": minimo, "guadagno": m.get("guadagno")}
        if m.get("partite", 0) >= minimo and m.get("guadagno") is not None and m["guadagno"] <= 0:
            spegni(attivo, voce, oggi)
            pause[voce] = (date.fromisoformat(oggi) + timedelta(days=PAUSA)).isoformat()
            motivi[TIPO[voce]] = _testo(voce, m)
            reg.pop(voce)
            riga.update(stato="spento", fino=pause[voce], motivo=motivi[TIPO[voce]])
        else:
            riga["stato"] = "aiuta" if m.get("partite", 0) >= minimo else "in verifica"
        righe.append(riga)
    for voce, fino in sorted(pause.items()):
        if not any(r["voce"] == voce for r in righe):
            righe.append({"voce": voce, "nome": NOMI.get(voce, voce), "stato": "in pausa", "fino": fino})
    return attivo, {"registro": reg, "pause": pause}, {"minimo": MIN_DOPO, "pausa": PAUSA, "voci": righe}, motivi


def riassunto(rap):
    """Una riga per il registro dell'apprendimento: "Integratore (...) aiuta (210/150 partite, +0,12%); ..."."""
    out = []
    for r in (rap or {}).get("voci") or []:
        if r["stato"] == "in pausa":
            out.append(f"{r['nome']} in pausa fino al {r['fino']}")
            continue
        g = "" if r.get("guadagno") is None else f", {r['guadagno']:+.2f}%".replace(".", ",")
        out.append(f"{r['nome']} {r['stato']} ({r.get('partite', 0)}/{r.get('minimo', MIN_DOPO)} partite dopo l'accensione{g})")
    return "; ".join(out) or "nessun miglioramento acceso"
