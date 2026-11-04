"""Test delle quote per data di API-Football in ombra (raccoglitore.giro_quote_af): python3 -m unittest discover -s test"""
import json
import os
import sys
import tempfile
import unittest
from unittest import mock

RADICE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RADICE)
import raccoglitore as R  # noqa: E402
import salvadanaio as SV  # noqa: E402


def voce(fid, pin=True):
    def bk(nome, q):
        return {"name": nome, "bets": [{"name": "Match Winner", "values": [{"value": "Home", "odd": str(q[0])}, {"value": "Draw", "odd": str(q[1])},
                                                                          {"value": "Away", "odd": str(q[2])}]},
                                       {"name": "Goals Over/Under", "values": [{"value": "Over 2.5", "odd": "1.9"}, {"value": "Under 2.5", "odd": "1.95"}]}]}
    bks = [bk("Bet365", (2.0, 3.3, 3.8)), bk("William Hill", (2.1, 3.2, 3.6))] + ([bk("Pinnacle", (2.05, 3.4, 3.9))] if pin else [])
    return {"fixture": {"id": fid}, "league": {"name": "Serie A", "country": "Italy"}, "update": "2026-11-04T12:01:16+00:00", "bookmakers": bks}


class QuoteAF(unittest.TestCase):
    def test_pagine_e_salvataggio(self):
        pagine = {1: [voce(1), voce(2, pin=False)], 2: [voce(3)], 3: [voce(4)]}
        chiamate = []

        def finto(path, cat="partite", **kw):
            chiamate.append((path, cat, kw.get("page", 1)))
            return {"paging": {"current": kw.get("page", 1), "total": 3}, "response": pagine[kw.get("page", 1)]}
        fx = {"response": [{"fixture": {"id": 1, "date": "2026-11-04T19:45:00+00:00"}, "teams": {"home": {"name": "Inter"}, "away": {"name": "Roma"}}}]}
        with tempfile.TemporaryDirectory() as d, mock.patch.object(R, "af", finto), mock.patch.object(R, "AF_QUOTE_PAGINE", 2):
            n = R.giro_quote_af(d, fx, "2026-11-04")
            with open(os.path.join(d, "2026-11-04", "quote_af.json")) as f:
                righe = json.load(f)
        self.assertEqual(n, 3)  # due pagine su tre: il tetto ferma le altre
        self.assertEqual([c[1] for c in chiamate], ["quote", "quote"])
        r1 = next(r for r in righe if r["fx"] == 1)
        self.assertEqual((r1["h"], r1["a"], r1["nb"]), ("Inter", "Roma", 3))
        self.assertEqual(r1["pin"], [2.05, 3.4, 3.9])
        self.assertNotIn("pin", next(r for r in righe if r["fx"] == 2))

    def test_tetti_api_football(self):
        self.assertEqual(sum(SV.AF_TETTI.values()) + SV.AF_RISERVA, SV.AF_GIORNO)
        self.assertGreaterEqual(SV.AF_TETTI["quote"], 20)


if __name__ == "__main__":
    unittest.main()
