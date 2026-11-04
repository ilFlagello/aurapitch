"""Sentinella delle fonti (strumenti/sentinella.py): avvisa quando una fonte arriva a zero, cala molto o cambia formato."""
import csv
import json
import os
import sys
import tempfile
import unittest

RADICE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(RADICE, "strumenti"))
import sentinella as SE  # noqa: E402


def scrivi_csv(path, righe):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["id", "fonte", "oa_quota_media_1", "oa_quota_media_X", "oa_quota_media_2"])
        w.writeheader()
        w.writerows(righe)


class TestSentinella(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.vecchia = SE.RADICE
        SE.RADICE = self.tmp

    def tearDown(self):
        SE.RADICE = self.vecchia

    def test_misura_e_forma(self):
        buone = [{"id": i, "fonte": "", "oa_quota_media_1": 2.1, "oa_quota_media_X": 3.2, "oa_quota_media_2": 3.5} for i in range(8)]
        rotte = [{"id": 99, "fonte": "", "oa_quota_media_1": 0.5, "oa_quota_media_X": 3.2, "oa_quota_media_2": 3.5}]
        fd = [{"id": 7, "fonte": "football-data", "oa_quota_media_1": 2, "oa_quota_media_X": 3, "oa_quota_media_2": 4}]
        scrivi_csv(os.path.join(self.tmp, "data", "2026-11-05", "partite_espn.csv"), buone + rotte + fd)
        os.makedirs(os.path.join(self.tmp, "data", "2026-11-04"))
        with open(os.path.join(self.tmp, "data", "2026-11-04", "prepartita.json"), "w") as f:
            json.dump([{"id": "a", "fonte": "espn", "oa_quota_media_1": 2, "oa_quota_media_X": 3, "oa_quota_media_2": 4},
                       {"id": "b", "oa_quota_media_1": 2, "oa_quota_media_X": 3, "oa_quota_media_2": 4}], f)
        m = SE.misura("2026-11-05", "2026-11-04")
        self.assertEqual(m["Quote ESPN"], [9, 1])
        self.assertEqual(m["Football-Data.co.uk"], [1, 0])
        self.assertEqual(m["Pre-partita espn"], [1, 0])
        self.assertEqual(m["Pre-partita oa"], [1, 0])
        self.assertNotIn("The Odds API", m)  # file mancante: la fonte non si giudica
        a = SE.giudica({}, "2026-11-05", m)
        self.assertTrue(any("forma sbagliata" in x and "Quote ESPN" in x for x in a))

    def test_calo(self):
        storia = {"Quote ESPN": {f"2026-10-{20 + i}": 250 for i in range(10)}, "Pochi": {f"2026-10-{20 + i}": 2 for i in range(10)}}
        self.assertEqual(SE.giudica(storia, "2026-11-05", {"Quote ESPN": [240, 0], "Pochi": [0, 0]}), [])
        a = SE.giudica(storia, "2026-11-05", {"Quote ESPN": [0, 0]})
        self.assertEqual(a, ["Quote ESPN: nessun dato (di solito 250)"])
        a = SE.giudica(storia, "2026-11-05", {"Quote ESPN": [40, 0]})
        self.assertEqual(a, ["Quote ESPN: solo 40 dati (di solito 250)"])
        # storia troppo corta: si raccoglie e basta
        self.assertEqual(SE.giudica({"X": {"2026-11-01": 100}}, "2026-11-05", {"X": [0, 0]}), [])

    def test_main_scrive_storia(self):
        self.assertEqual(SE.main(), 0)
        with open(os.path.join(self.tmp, "data", "sentinella.json")) as f:
            out = json.load(f)
        self.assertIn("avvisi", out)
        self.assertIn("storia", out)


if __name__ == "__main__":
    unittest.main()
