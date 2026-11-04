"""Prova (Blocco 5): ESPN da' la storia di una squadra in TUTTE le competizioni, e l'id squadra/giocatore e lo stesso tra competizioni?"""
import gzip, json, urllib.request
S = "https://site.api.espn.com/apis/site/v2/sports/soccer/"
C = "https://sports.core.api.espn.com/v2/sports/soccer/"
def get(u):
    try:
        req = urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0 (AuraPitch beta)", "Accept-Encoding": "gzip"})
        with urllib.request.urlopen(req, timeout=25) as r:
            raw = r.read()
        return json.loads(gzip.decompress(raw) if raw[:2] == b"\x1f\x8b" else raw)
    except Exception as e:  # noqa: BLE001
        return {"_errore": str(e)[:120]}
def sched(u):
    d = get(u)
    if "_errore" in d:
        return d["_errore"]
    ev = d.get("events") or []
    fin = [e for e in ev if ((e.get("competitions") or [{}])[0].get("status") or {}).get("type", {}).get("state") == "post"]
    comp = sorted({(e.get("league") or {}).get("abbreviation") or (e.get("season") or {}).get("slug") or "?" for e in ev})
    leghe = sorted({((e.get("competitions") or [{}])[0].get("type") or {}).get("abbreviation") or "" for e in ev})
    return {"eventi": len(ev), "finiti": len(fin), "date": [e.get("date", "")[:10] for e in fin][-8:], "leghe": comp, "tipi": leghe, "chiavi": list(d)[:12],
            "nomi": [e.get("shortName") for e in fin][-8:]}
casi = [("Arsenal", "359", "eng.1", "uefa.champions"), ("Benfica", "1929", "por.1", "uefa.europa"), ("Flamengo", "819", "bra.1", "bra.copa_do_brazil"), ("Celtic", "256", "sco.1", "uefa.europa")]
for nome, tid, lg, coppa in casi:
    print(f"\n===== {nome} ({tid})")
    for u in (f"{S}{lg}/teams/{tid}/schedule", f"{S}{coppa}/teams/{tid}/schedule", f"{S}all/teams/{tid}/schedule",
              f"{S}{lg}/teams/{tid}/schedule?fixture=false&season=2026", f"{S}{lg}/teams/{tid}/schedule?season=2025",
              f"{S}{lg}/teams/{tid}/schedule?league=all"):
        print(u.replace(S, ""), "->", json.dumps(sched(u), ensure_ascii=False)[:600])
    d = get(f"{S}{lg}/teams/{tid}")
    t = d.get("team") or {}
    print("scheda squadra:", t.get("id"), t.get("displayName"), "| prossimo:", [(e.get("date", "")[:10], e.get("shortName")) for e in (t.get("nextEvent") or [])][:2], "| chiavi:", list(t)[:25])
    for u in (f"{C}teams/{tid}", f"{C}leagues/{lg}/seasons/2026/teams/{tid}/events?limit=50", f"{C}leagues/{lg}/seasons/2025/teams/{tid}/events?limit=50"):
        d = get(u)
        print(u.replace(C, "core:"), "->", json.dumps({k: (v if not isinstance(v, (list, dict)) else (len(v) if isinstance(v, list) else list(v)[:8])) for k, v in d.items()}, ensure_ascii=False)[:400])
    # rose: stessi giocatori (id) in campionato e coppa? statistiche diverse?
    r1, r2 = get(f"{S}{lg}/teams/{tid}/roster"), get(f"{S}{coppa}/teams/{tid}/roster")
    def st(a, n):
        for c in ((a.get("statistics") or {}).get("splits") or {}).get("categories", []):
            for s in c.get("stats", []):
                if s["name"] == n:
                    return s.get("value")
    m1 = {a["id"]: (a["displayName"], st(a, "appearances"), st(a, "totalGoals"), st(a, "yellowCards")) for a in r1.get("athletes", [])}
    m2 = {a["id"]: (a["displayName"], st(a, "appearances"), st(a, "totalGoals"), st(a, "yellowCards")) for a in r2.get("athletes", [])}
    comuni = set(m1) & set(m2)
    print(f"rose: campionato {len(m1)}, coppa {len(m2)}, stessi id {len(comuni)}; esempi:", [(m1[i], m2[i]) for i in list(comuni)[:4]])
    # statistiche giocatore su tutte le competizioni (core)
    if comuni:
        aid = sorted(comuni, key=lambda i: -(m1[i][1] or 0))[0]
        for u in (f"{C}athletes/{aid}/statistics", f"{C}leagues/{lg}/seasons/2026/types/1/athletes/{aid}/statistics", f"{C}athletes/{aid}/eventlog"):
            d = get(u)
            print(u.replace(C, "core:"), "->", json.dumps({k: (v if not isinstance(v, (list, dict)) else (len(v) if isinstance(v, list) else list(v)[:8])) for k, v in d.items()}, ensure_ascii=False)[:400])
# identita: gli id delle squadre di Champions sono gli stessi dei campionati?
cl = get(f"{S}uefa.champions/teams")
cl = {t["team"]["id"]: t["team"]["displayName"] for t in ((cl.get("sports") or [{}])[0].get("leagues") or [{}])[0].get("teams", [])}
for lg in ("eng.1", "esp.1", "ita.1", "por.1", "ned.1"):
    d = get(f"{S}{lg}/teams")
    ids = {t["team"]["id"]: t["team"]["displayName"] for t in ((d.get("sports") or [{}])[0].get("leagues") or [{}])[0].get("teams", [])}
    print(lg, "squadre", len(ids), "anche in Champions con lo stesso id:", [ids[i] for i in ids if i in cl])
