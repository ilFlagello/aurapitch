"""'In breve' della scheda partita (5/11): le ultime 5 portano la competizione, le posizioni sono strutturate."""
import os
import sys
import unittest
from datetime import datetime, timezone, timedelta

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import genera_app as G  # noqa: E402


class UltimeCinque(unittest.TestCase):
    def test_competizione_nelle_ultime_5(self):
        t0 = datetime(2026, 11, 5, 18, tzinfo=timezone.utc)
        per = {"x": [{"t": t0 - timedelta(days=d), "avv": "A", "casa": True, "gf": 1, "gs": 0, **({"lg": "ita.1"} if d % 2 else {})} for d in range(7, 0, -1)]}
        l5 = G.ultime5(per, "x", t0)
        self.assertEqual(len(l5), 5)
        self.assertEqual([z.get("c") for z in l5], ["ita.1", None, "ita.1", None, "ita.1"])
        self.assertTrue(all(z["esito"] == "V" for z in l5))

    def test_posti_in_coppa_e_campionato(self):
        class Finta(G.Identita):
            def __init__(self):
                pass

            def riga(self, kk, ident):
                return {"EL": (12, 6, 4, 36), "I1": (3, 22, 10, 20)}.get(kk)
        f = Finta()
        self.assertEqual(f.posti({"casa": "I1"}, "EL"), [{"c": "EL", "p": 12, "n": 36}, {"c": "I1", "p": 3, "n": 20}])
        self.assertEqual(f.posti({"casa": "I1"}, "I1"), [{"c": "I1", "p": 3, "n": 20}])
        self.assertEqual(f.posti({}, "I2"), [])


if __name__ == "__main__":
    unittest.main()
