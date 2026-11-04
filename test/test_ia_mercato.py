"""IA contro mercato: registro delle partite in cui l'IA si e discostata dalle quote, e quante volte ha avuto ragione."""
import json
import os
import sys
import tempfile
import unittest
from datetime import date

RADICE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RADICE)
import ia_mercato as IM  # noqa: E402


def v(pc, mk, g, st="FT", t0="2026-11-01T08:00+00:00", ko="2026-11-01T19:45:00+00:00", **k):
    return {"lg": "I1", "h": "Casa", "a": "Ospite", "date": "2026-11-01", "ko": ko, "t0": t0, "st": st, "g": g, "mk": mk, "pc": dict(zip(("1", "X", "2"), pc)), **k}


class TestIAMercato(unittest.TestCase):
    def test_scarto(self):
        d, c = IM.scarto({"1": 0.5, "X": 0.25, "2": 0.25}, [0.45, 0.27, 0.28])
        self.assertEqual(c, "1")
        self.assertAlmostEqual(d, 0.05)
        self.assertIsNone(IM.scarto({"1": 0.5}, [0.4, 0.3, 0.3]))

    def test_voce(self):
        r = IM.voce("A", v([0.50, 0.25, 0.25], [0.44, 0.28, 0.28], [2, 1]))
        self.assertEqual((r["c"], r["ok"]), ("1", 1))  # l'IA dava piu probabilita alla vittoria di casa, ed e arrivata
        self.assertLess(r["lia"], r["lq"])
        r = IM.voce("B", v([0.50, 0.25, 0.25], [0.44, 0.28, 0.28], [0, 0]))
        self.assertEqual(r["ok"], 0)
        self.assertIsNone(IM.voce("C", v([0.45, 0.27, 0.28], [0.44, 0.28, 0.28], [1, 0])))  # scarto sotto i 3 punti
        self.assertIsNone(IM.voce("D", v([0.50, 0.25, 0.25], [0.44, 0.28, 0.28], None, st="NS")))  # non finita
        self.assertIsNone(IM.voce("E", v([0.50, 0.25, 0.25], [0.44, 0.28, 0.28], [1, 0], t0="2026-11-01T20:00+00:00")))  # dopo il fischio

    def test_aggiorna(self):
        tmp = tempfile.mkdtemp()
        dia, out = os.path.join(tmp, "diario"), os.path.join(tmp, "ia_mercato.json")
        os.makedirs(dia)
        with open(os.path.join(dia, "2026-11-01.json"), "w") as f:
            json.dump({"A": v([0.50, 0.25, 0.25], [0.44, 0.28, 0.28], [2, 1]), "B": v([0.20, 0.25, 0.55], [0.30, 0.27, 0.43], [0, 3]),
                       "C": v([0.34, 0.26, 0.40], [0.30, 0.30, 0.40], [2, 2])}, f)
        d = IM.aggiorna(dia, out, oggi=date(2026, 11, 4))
        R = d["riass"]
        self.assertEqual((R["n"], R["ok"]), (3, 2))
        self.assertEqual([f["n"] for f in R["fasce"]], [1, 1, 1])
        self.assertEqual(R["dal"], "2026-11-01")
        # i file del diario escono dalla cassaforte dopo 10 giorni: il registro li ricorda
        os.remove(os.path.join(dia, "2026-11-01.json"))
        self.assertEqual(IM.aggiorna(dia, out, oggi=date(2026, 11, 20))["riass"]["n"], 3)
        self.assertEqual(IM.aggiorna(dia, out, oggi=date(2027, 1, 10))["riass"]["n"], 0)  # oltre i 60 giorni


if __name__ == "__main__":
    unittest.main()
