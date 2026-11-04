"""Test della misura del vantaggio sul mercato (vantaggio.py) e del suo uso nel revisore: python3 -m unittest discover -s test"""
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
import vantaggio as VM  # noqa: E402


def registro(n=120, verso=0.03, spec_contro=False, seme=3):
    """Registro finto dei consigli: la quota scende in media del 'verso' dopo il blocco; con spec_contro i consigli con lo
    specialista "ultima_ora" vedono invece la quota salire."""
    rnd = random.Random(seme)
    ora = datetime.now(timezone.utc)
    st = {}
    for i in range(n):
        ko = ora - timedelta(days=1 + i % 20)
        sp = ["ultima_ora"] if i % 2 else []
        mov = (-0.04 if (spec_contro and sp) else verso) + rnd.uniform(-0.01, 0.01)
        q = 2.0
        st[f"m{i}"] = {"date": ko.date().isoformat(), "lg": "I1", "ko": ko.isoformat(), "tB": (ko - timedelta(minutes=45)).isoformat(),
                       "tF": (ko - timedelta(minutes=5)).isoformat(), "spB": sp,
                       "tips": {"consiglio": {"c": "1" if i % 3 else "O2.5", "p": 0.5, "q": q, "qm": True, "qF": round(q / (1 + mov), 3)},
                                "prudente": {"c": "1X", "p": 0.7, "q": 1.3, "qm": False}}}
    return st


class TestVantaggio(unittest.TestCase):
    def test_mercato(self):
        self.assertEqual(VM.mercato_di("1"), "Esito finale")
        self.assertEqual(VM.mercato_di("O2.5"), "Under/Over")
        self.assertEqual(VM.mercato_di("T1:1"), "Tempi")
        self.assertEqual(VM.mercato_di("1X+GG"), "Combo")
        self.assertEqual(VM.mercato_di("HO1.5"), "Gol di una squadra")

    def test_chiusura_solo_prima_del_fischio_e_solo_quote_vere(self):
        ora = datetime.now(timezone.utc)
        m = {"st": "NS", "ko": (ora + timedelta(minutes=30)).isoformat(), "markets": [["1", 0.5, 1.9, 1], ["1X", 0.7, 1.3, 0]]}
        r = {"tB": ora.isoformat(), "tips": {"consiglio": {"c": "1", "q": 2.0, "qm": True}, "prudente": {"c": "1X", "q": 1.3, "qm": False}}}
        self.assertEqual(VM.registra_chiusura(r, m, ora), 1)
        self.assertEqual(r["tips"]["consiglio"]["qF"], 1.9)
        self.assertNotIn("qF", r["tips"]["prudente"])
        m["markets"][0][2] = 1.8
        self.assertEqual(VM.registra_chiusura(r, m, ora + timedelta(hours=1)), 0)  # dopo il fischio non si tocca
        self.assertEqual(r["tips"]["consiglio"]["qF"], 1.9)
        r["tardivo"] = True
        self.assertEqual(VM.registra_chiusura(r, m, ora), 0)

    def test_misura(self):
        mi = VM.misura(registro())
        t = mi["totale"]
        self.assertEqual(t["n"], 120)  # le prudenti hanno quota calcolata: fuori
        self.assertGreater(t["verso"], 100)
        self.assertAlmostEqual(t["medio"], 3.0, delta=0.5)
        self.assertIn("Esito finale", mi["per_mercato"])
        self.assertIn("ultima_ora", mi["per_specialista"])
        self.assertEqual(mi["senza_specialisti"]["n"], 60)

    def test_giudizio(self):
        p, a, n = VM.giudizio(VM.misura(registro()))
        self.assertFalse(p or a)
        self.assertTrue(any("Vantaggio sul mercato" in x for x in n))
        p, a, n = VM.giudizio(VM.misura(registro(verso=-0.03)))
        self.assertTrue(p)  # il mercato va contro i consigli
        p, a, n = VM.giudizio(VM.misura(registro(spec_contro=True)))
        self.assertTrue(any("ultima ora" in x and "non aggiunge" in x for x in a))
        p, a, n = VM.giudizio(VM.misura(registro(n=10)))
        self.assertTrue(any("servono almeno" in x for x in n))

    def test_tardivi_esclusi_e_pubblico(self):
        st = registro(n=10)
        st["m0"]["tardivo"] = True
        self.assertEqual(VM.misura(st)["totale"]["n"], 9)
        with tempfile.TemporaryDirectory() as d:
            out = VM.scrivi_pubblico(st, path=os.path.join(d, "v.json"))
            self.assertEqual(out["totale"]["n"], 9)
            testo = open(os.path.join(d, "v.json"), encoding="utf-8").read()
            self.assertNotIn("m1", testo)  # niente identificativi delle partite nel file pubblico

    def test_revisore(self):
        with tempfile.TemporaryDirectory() as base:
            os.makedirs(os.path.join(base, "data"))
            with open(os.path.join(base, "data", "consigli.json"), "w") as f:
                json.dump(registro(verso=-0.04), f)
            subprocess.run([sys.executable, "-I", os.path.join(RADICE, "strumenti", "revisore.py"), base], capture_output=True, timeout=120)
            rv = json.load(open(os.path.join(base, "data", "revisore.json"), encoding="utf-8"))
            self.assertEqual(rv["vantaggio"]["totale"]["n"], 120)
            self.assertTrue(any("mercato va contro" in x for x in rv["problemi"]))


if __name__ == "__main__":
    unittest.main()
