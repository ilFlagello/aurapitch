"""Test del ciclo di miglioramento (ciclo.py) e della ritaratura per fasce in calibrazione.py: python3 -m unittest discover -s test"""
import os
import random
import sys
import unittest
from datetime import datetime, timedelta, timezone

RADICE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RADICE)
import calibrazione as CB  # noqa: E402
import ciclo as CI  # noqa: E402


def diario(n=800, sicura=0.0, seme=11):
    """Partite finite; con sicura > 0 l'IA esagera: dice vero + sicura quando il favorito vince con probabilita 'vero'."""
    rnd = random.Random(seme)
    ora = datetime.now(timezone.utc)
    out = []
    for i in range(n):
        ko = ora - timedelta(hours=n - i)
        vero = rnd.uniform(0.55, 0.75)
        h = 2 if rnd.random() < vero else 0
        a = 1 if rnd.random() < 0.5 else 0
        p1 = min(0.97, vero + sicura)
        out.append({"lg": "I1", "date": ko.date().isoformat(), "ko": ko.isoformat(), "st": "FT", "g": [h, a],
                    "pc": {"1": p1, "X": (1 - p1) / 2, "2": (1 - p1) / 2}})
    return out


class TestCiclo(unittest.TestCase):
    def test_applica_fasce(self):
        self.assertEqual(CI.fascia(0.65), 6)
        self.assertEqual(CI.fascia(0.25), 7)
        self.assertAlmostEqual(CI.applica_fasce(0.65, {"6": -0.03}), 0.62)
        self.assertAlmostEqual(CI.applica_fasce(0.35, {"6": -0.03}), 0.38)  # al contrario sotto il 50%
        self.assertEqual(CI.applica_fasce(0.65, {}), 0.65)
        self.assertAlmostEqual(CI.togli_fasce(CI.applica_fasce(0.65, {"6": -0.03}), {"6": -0.03}), 0.65)

    def test_impara_solo_se_migliora_su_partite_mai_viste(self):
        f = CI.impara_fasce(diario(sicura=0.12))
        self.assertTrue(f["attivo"], f["motivo"])
        self.assertTrue(all(v < 0 for v in f["corr"].values()))  # l'IA era troppo sicura: le fasce alte scendono
        self.assertGreater(f["prova"]["guadagno"], 0)
        g = CI.impara_fasce(diario(sicura=0.0))
        self.assertFalse(g["attivo"])
        self.assertEqual(g["corr"], {})
        self.assertFalse(CI.impara_fasce(diario(n=100))["attivo"])

    def test_storia_evita_di_correggere_due_volte(self):
        d = diario(sicura=0.12)
        f = CI.impara_fasce(d)
        oggi = datetime.now(timezone.utc).date().isoformat()
        # le probabilita di oggi escono gia corrette: con la storia la correzione imparata resta la stessa, senza raddoppiare
        corr = f["corr"]
        d2 = [dict(v, pc={c: CI.applica_fasce(p, corr) for c, p in v["pc"].items()}) for v in d]
        g = CI.impara_fasce(d2, {"2000-01-01": corr})
        for k, v in corr.items():
            self.assertAlmostEqual(g["corr"].get(k, 0), v, delta=0.012)
        self.assertTrue(oggi)

    def test_calibrazione_applica_le_fasce(self):
        mod = {"fasce": {"6": -0.03}}
        self.assertTrue(CB.attivo(mod))
        out = CB.calibra_p({"1": 0.65, "X": 0.2, "2": 0.15}, "I1", mod)
        self.assertLess(out["1"], 0.65)
        self.assertAlmostEqual(sum(out.values()), 1.0, places=6)
        self.assertEqual(CB.calibra_p({"1": 0.65, "X": 0.2, "2": 0.15}, "I1", {})["1"], 0.65)

    def test_eventi(self):
        prima = {"ricetta": "mercato", "integratore": {"gruppi": {"principali": {"attivo": False}}}}
        dopo = {"ricetta": "mercato", "fasce": {"6": -0.02}, "affid_lg": {"T1": 0.8},
                "integratore": {"gruppi": {"principali": {"attivo": True}}, "ridotti": {"ultima_ora": 0.7}}}
        ev = CI.eventi(prima, dopo, "2026-11-05", {"fasce": "perché sì"})
        testi = " | ".join(e["cosa"] for e in ev)
        self.assertIn("60-70%: -2 punti", testi)
        self.assertIn("T1 ×0,8", testi)
        self.assertIn("Acceso l'integratore", testi)
        self.assertIn("ultima ora", testi)
        self.assertEqual(ev[0]["data"], "2026-11-05")
        self.assertEqual(CI.eventi(dopo, dopo, "2026-11-05"), [])

    def test_peso_specialisti(self):
        try:
            import vantaggio  # noqa: F401
        except ImportError:
            self.assertEqual(CI.peso_specialisti({})[0], {})
            return
        ora = datetime.now(timezone.utc)
        st = {}
        for i in range(120):
            ko = ora - timedelta(days=1 + i % 20)
            sp = ["ultima_ora"] if i % 2 else []
            mov = -0.04 if sp else 0.02
            st[f"m{i}"] = {"date": ko.date().isoformat(), "ko": ko.isoformat(), "tB": (ko - timedelta(minutes=45)).isoformat(), "spB": sp,
                           "tips": {"consiglio": {"c": "1", "p": 0.5, "q": 2.0, "qm": True, "qF": round(2.0 / (1 + mov), 3)}}}
        r, _ = CI.peso_specialisti(st)
        self.assertIn("ultima_ora", r)
        self.assertLess(r["ultima_ora"], 1)


if __name__ == "__main__":
    unittest.main()
