"""Test automatici dell'algoritmo (solo libreria standard). Si lanciano con: python3 -m unittest discover -s test -v"""
import json
import os
import sys
import unittest

RADICE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RADICE)
import cartellini as CK  # noqa: E402
import mercati as M  # noqa: E402


def mercati_di(lh, la):
    return {x["c"]: x["p"] for x in M.calcola_mercati(lh, la, "Casa", "Ospite", {})}


class Esiti(unittest.TestCase):
    def test_esito_finale(self):
        self.assertTrue(M.valuta("1", 2, 1)); self.assertTrue(M.valuta("X", 1, 1)); self.assertTrue(M.valuta("2", 0, 3))
        self.assertFalse(M.valuta("1X", 0, 1)); self.assertTrue(M.valuta("12", 0, 1))

    def test_gol(self):
        self.assertTrue(M.valuta("O2.5", 2, 1)); self.assertFalse(M.valuta("O2.5", 1, 1)); self.assertTrue(M.valuta("U2.5", 1, 1))
        self.assertTrue(M.valuta("GG", 1, 1)); self.assertTrue(M.valuta("NG", 2, 0))

    def test_combo_e_tempi(self):
        self.assertTrue(M.valuta("1+O1.5", 2, 0)); self.assertFalse(M.valuta("1+O1.5", 1, 0))
        self.assertIsNone(M.valuta("T1:1", 2, 0))  # primo tempo non noto
        self.assertTrue(M.valuta("T1:1", 2, 0, 1, 0)); self.assertFalse(M.valuta("T2:1", 2, 0, 2, 0))

    def test_handicap_e_margine(self):
        self.assertTrue(M.valuta("EHM1:1", 2, 0)); self.assertFalse(M.valuta("EHM1:1", 1, 0)); self.assertTrue(M.valuta("EHM1:X", 1, 0))
        self.assertTrue(M.valuta("MV1:2", 3, 1)); self.assertTrue(M.valuta("MV2:3P", 0, 3))


class Probabilita(unittest.TestCase):
    def test_complementari(self):
        for lh, la in ((1.6, 1.1), (0.7, 2.2), (1.3, 1.3)):
            p = mercati_di(lh, la)
            self.assertAlmostEqual(p["1"] + p["X"] + p["2"], 1, delta=0.01)
            for n in ("0.5", "1.5", "2.5", "3.5"):
                self.assertAlmostEqual(p[f"O{n}"] + p[f"U{n}"], 1, delta=0.01)
            self.assertAlmostEqual(p["GG"] + p["NG"], 1, delta=0.01)
            self.assertGreaterEqual(p["O1.5"], p["O2.5"]); self.assertGreaterEqual(p["O2.5"], p["O3.5"])

    def test_favorito(self):
        p = mercati_di(2.2, 0.7)
        self.assertGreater(p["1"], 0.6); self.assertLess(p["2"], 0.15)

    def test_gol_attesi_dalle_quote(self):
        lh, la = M.gol_attesi([0.5, 0.27, 0.23], 0.52)
        p = mercati_di(lh, la)
        self.assertAlmostEqual(p["1"], 0.5, delta=0.03); self.assertAlmostEqual(p["O2.5"], 0.52, delta=0.03)


class Cartellini(unittest.TestCase):
    def test_linee(self):
        righe = CK.linee("K", 4.2)
        d = {r[0]: r[1] for r in righe}
        self.assertAlmostEqual(d["KO3.5"] + d["KU3.5"], 1, delta=0.01)
        self.assertGreater(d["KO2.5"], d["KO4.5"])
        for r in righe:
            self.assertTrue(0 < r[1] < 1)


class FileDellApp(unittest.TestCase):
    """Controlli sui dati pubblicati: struttura, probabilità valide, file leggeri coerenti con quello completo."""
    @classmethod
    def setUpClass(cls):
        p = os.path.join(RADICE, "app", "data", "giornata.json")
        cls.D = json.load(open(p, encoding="utf-8")) if os.path.exists(p) else None

    def test_partite(self):
        if not self.D:
            self.skipTest("giornata.json assente")
        for m in self.D["matches"]:
            for k in ("id", "h", "a", "lg", "date", "ko", "st", "p", "markets"):
                self.assertIn(k, m, f"{m.get('id')}: manca {k}")
            self.assertAlmostEqual(sum(m["p"]), 1, delta=0.02, msg=m["id"])
            for r in m["markets"]:
                self.assertTrue(0 < r[1] <= 1, f"{m['id']} {r[0]} probabilità {r[1]}")
                self.assertTrue(r[2] == 0 or r[2] >= 1.0, f"{m['id']} {r[0]} quota {r[2]}")

    def test_lista_e_dettagli(self):
        p = os.path.join(RADICE, "app", "data", "lista.json")
        if not self.D or not os.path.exists(p):
            self.skipTest("lista.json assente")
        L = json.load(open(p, encoding="utf-8"))
        self.assertEqual([m["id"] for m in L["matches"]], [m["id"] for m in self.D["matches"]])
        for m in L["matches"]:
            self.assertNotIn("markets", m)
            f = os.path.join(RADICE, "app", "data", "m", "".join(c if c.isalnum() or c in "_-" else "_" for c in m["id"]) + ".json")
            self.assertTrue(os.path.exists(f), f"manca il dettaglio di {m['id']}")


if __name__ == "__main__":
    unittest.main()
