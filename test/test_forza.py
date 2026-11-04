"""Forza Elo delle squadre per la scheda squadra (difficolta delle prossime partite): solo squadre con abbastanza partite,
con il loro campionato (le coppe non contano)."""
import json
import os
import sys
import tempfile
import unittest

RADICE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RADICE)
os.chdir(RADICE)
import genera_app as GA  # noqa: E402
import specialisti as SP  # noqa: E402


class TestForza(unittest.TestCase):
    def test_forza(self):
        mot = SP.Motore()
        partite = [("Inter", "Lecce", 3, 0), ("Lecce", "Inter", 0, 2), ("Inter", "Roma", 1, 1), ("Roma", "Lecce", 2, 0), ("Lecce", "Roma", 1, 1)] * 3
        for i, (h, a, gh, ga) in enumerate(partite):
            mot.aggiorna(h, a, "I1", gh, ga)
        idx = SP.indice_diretti([{"t": i, "h": h, "a": a, "gh": gh, "ga": ga} for i, (h, a, gh, ga) in enumerate(partite)])
        out = {"generato": "04/11/2026 07:00", "standings": {"I1": {"generale": [{"team": "Inter"}, {"team": "Roma"}, {"team": "Lecce"}]}, "CL": {"generale": [{"team": "Bayern"}]}},
               "matches": [{"lg": "CI", "h": "Inter", "a": "Torino"}, {"lg": "I1", "h": "Lecce", "a": "Roma"}]}
        path = os.path.join(tempfile.mkdtemp(), "forza.json")
        F = GA.scrivi_forza(out, idx, mot, path)
        self.assertEqual(set(F), {"Inter", "Roma", "Lecce"})  # Bayern solo in coppa, Torino solo in Coppa Italia: fuori
        self.assertGreater(F["Inter"][0], F["Lecce"][0])
        self.assertEqual(F["Inter"][1], "I1")
        with open(path) as f:
            self.assertEqual(json.load(f)["casa"], 60)


if __name__ == "__main__":
    unittest.main()
