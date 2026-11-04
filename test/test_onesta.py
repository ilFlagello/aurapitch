"""Test dell'onesta per campionato (onesta.py), del revisore per campionato e dell'affidabilita: python3 -m unittest discover -s test"""
import json
import os
import random
import subprocess
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone

RADICE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RADICE)
import onesta as ON  # noqa: E402


def diario(n=900, bugiardi=("T1",), seme=5, bugiardi_dopo=True):
    """Partite finite in 3 campionati; nei 'bugiardi' l'IA e troppo sicura (dice 75% quando e 50%).
    Con bugiardi_dopo=False l'IA e troppo sicura solo nelle partite piu vecchie (il problema sparisce: la penalita non regge)."""
    rnd = random.Random(seme)
    ora = datetime.now(timezone.utc)
    out = []
    for i in range(n):
        lg = ("I1", "E0", "T1")[i % 3]
        ko = ora - timedelta(hours=n - i)
        vero = rnd.uniform(0.3, 0.6)
        h = 2 if rnd.random() < vero else 0
        a = 1 if rnd.random() < 0.5 else 0
        mente = lg in bugiardi and (bugiardi_dopo or i < n * 0.6)
        p1 = min(0.95, vero + 0.25) if mente else vero
        r = (1 - p1) / 2
        out.append({"id": f"m{i}", "lg": lg, "date": ko.date().isoformat(), "ko": ko.isoformat(), "st": "FT", "g": [h, a],
                    "pc": {"1": p1, "X": r, "2": r}, "mk": [vero, (1 - vero) / 2, (1 - vero) / 2]})
    return out


class TestOnesta(unittest.TestCase):
    def test_scarto_al_netto_del_caso(self):
        d = diario(bugiardi=())
        s, n = ON.scarto(d)
        self.assertLess(s, 2.0)  # IA onesta: scarto vicino a zero
        s2, _ = ON.scarto(diario())
        self.assertGreater(s2, s + 3)

    def test_per_campionato(self):
        cons = {f"c{i}": {"lg": "T1", "date": "2026-11-01", "tips": {"consiglio": {"p": 0.8}}, "esiti": {"consiglio": i % 2 == 0}} for i in range(40)}
        q = ON.per_campionato(diario(), cons)
        c = q["campionati"]
        self.assertGreater(c["T1"]["scarto"], c["I1"]["scarto"] + 5)
        self.assertEqual(c["T1"]["consigli"], 40)
        self.assertLess(c["T1"]["z"], -2)
        self.assertNotIn("consigli", c["I1"])

    def test_fattori_provati_su_partite_mai_viste(self):
        f = ON.fattori_affidabilita(diario())
        self.assertTrue(f["attivo"], f["motivo"])
        self.assertIn("T1", f["fattori"])
        self.assertLess(f["fattori"]["T1"], 1)
        self.assertNotIn("I1", f["fattori"])
        self.assertEqual(ON.applica(80, "T1", f["fattori"]), round(80 * f["fattori"]["T1"]))
        self.assertEqual(ON.applica(80, "I1", f["fattori"]), 80)

    def test_penalita_che_non_regge_resta_in_ombra(self):
        f = ON.fattori_affidabilita(diario(bugiardi_dopo=False))
        self.assertFalse(f["attivo"])
        self.assertEqual(f["fattori"], {})
        f = ON.fattori_affidabilita(diario(n=100))
        self.assertFalse(f["attivo"])
        self.assertIn("servono", f["motivo"])

    def test_revisore(self):
        with tempfile.TemporaryDirectory() as base:
            for v in diario():
                p = os.path.join(base, "data", "diario", v["id"] + ".json")
                os.makedirs(os.path.dirname(p), exist_ok=True)
                with open(p, "w") as f:
                    json.dump({v["id"]: v}, f)
            subprocess.run([sys.executable, "-I", os.path.join(RADICE, "strumenti", "revisore.py"), base], capture_output=True, timeout=120)
            rv = json.load(open(os.path.join(base, "data", "revisore.json"), encoding="utf-8"))
            self.assertIn("T1", rv["campionati"]["campionati"])
            self.assertTrue(any("Campionato T1" in x for x in rv["attenzione"]), rv["attenzione"])
            self.assertTrue(any("meno onesto T1" in x for x in rv["note"]))


if __name__ == "__main__":
    unittest.main()
