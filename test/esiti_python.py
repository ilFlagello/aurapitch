"""Per il test di coerenza app/algoritmo: esito di ogni codice di mercato su una griglia di risultati (finali e primo tempo)."""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import mercati as M
D = json.load(open(sys.argv[1], encoding="utf-8"))
codici = sorted({r[0] for m in D["matches"] for r in m["markets"] if not r[0].startswith(("MARC:", "K", "C", "F")) or r[0].startswith("CS")})
out = {}
for c in codici:
    righe = []
    for h in range(5):
        for a in range(5):
            for h1, a1 in [(None, None)] + [(x, y) for x in range(h + 1) for y in range(a + 1)]:
                try:
                    v = M.valuta(c, h, a, h1, a1)
                except Exception:
                    v = "errore"
                righe.append([h, a, h1, a1, v])
    out[c] = righe
json.dump(out, sys.stdout)
