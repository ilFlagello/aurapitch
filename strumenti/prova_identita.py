"""Prova (Blocco 5, solo ramo di prova, nessun salvataggio): i "risultati" del campionato ricavati dalla storia di tutte le
competizioni sono identici a quelli scaricati come prima (calendario della sola competizione)?"""
import json, os, sys, random
sys.path.insert(0, os.getcwd())
import espn_dati as ES
d = json.load(open("data/espn/squadre.json"))
sq = list((d.get("squadre") or {}).items())
random.seed(5)
random.shuffle(sq)
uguali = diversi = 0
for nome, r in sq[:45]:
    try:
        vecchi = ES.risultati(ES.ESPN_LG[r["lg"]], r["id"])
    except Exception as e:  # noqa: BLE001
        print("errore", nome, e); continue
    a = [x["eid"] for x in vecchi]
    b = [x["eid"] for x in r.get("risultati") or []]
    if a == b:
        uguali += 1
    else:
        diversi += 1
        print(f"DIVERSI {nome} ({r['lg']}): vecchio {len(a)} nuovo {len(b)}; solo vecchio {sorted(set(a) - set(b))[:5]}, solo nuovo {sorted(set(b) - set(a))[:5]}")
print(f"Risultati del campionato: uguali {uguali}, diversi {diversi}")
st = d.get("storia") or {}
print("Storia:", len(st), "squadre; partite per squadra (mediana):", sorted(len(v) for v in st.values())[len(st) // 2] if st else 0)
print("Competizioni nella storia:", sorted({r[5] for v in st.values() for r in v})[:60])
