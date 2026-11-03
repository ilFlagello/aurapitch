"""Test del revisore dell'algoritmo (strumenti/revisore.py) su dati finti: si lancia con python3 -m unittest discover -s test -v"""
import json
import os
import random
import subprocess
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone

RADICE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REVISORE = os.path.join(RADICE, "strumenti", "revisore.py")


def scrivi(base, rel, dati):
    p = os.path.join(base, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "w", encoding="utf-8") as f:
        json.dump(dati, f)


def mondo(base, onesta=True, tardivo_contato=False):
    """Diario di 400 partite finite: con onesta=True le probabilita dell'IA sono quelle vere, altrimenti l'IA e troppo sicura."""
    rnd = random.Random(7)
    ora = datetime.now(timezone.utc)
    oggi = ora.date().isoformat() if ora.hour >= 6 else (ora.date() - timedelta(days=1)).isoformat()
    scrivi(base, "app/data/ia.json", {"allenato": oggi, "modello": {"nome": "prova"}, "controllo": {"n": 400, "minimo": 150, "corrette": 0.61, "motore": 0.612}})
    scrivi(base, "data/modello.json", {"attivo": {"ricetta": "mercato", "integratore": {"principali": {"pesi": [0.1, -0.2]}}}})
    diario, consigli = {}, {}
    for i in range(400):
        ko = ora - timedelta(days=1 + i % 20, hours=2)
        vero = rnd.uniform(0.2, 0.6)
        h = 2 if rnd.random() < vero else 0
        a = 1 if rnd.random() < 0.5 else 0
        p1 = vero if onesta else min(0.95, vero + 0.3)
        resto = (1 - p1) / 2
        mid = f"m{i}"
        diario[mid] = {"lg": "I1", "date": ko.date().isoformat(), "ko": ko.isoformat(), "t0": (ko - timedelta(hours=5)).isoformat(), "st": "FT", "g": [h, a],
                       "pc": {"1": p1, "X": resto, "2": resto}, "mk": [vero, resto, resto]}
        consigli[mid] = {"date": ko.date().isoformat(), "tB": (ko - timedelta(minutes=50)).isoformat(), "tips": {"consiglio": {"c": "1", "p": p1, "q": 1.9}},
                         "esiti": {"consiglio": h > a}}
    if tardivo_contato:
        consigli["m0"]["tB"] = (datetime.fromisoformat(diario["m0"]["ko"]) + timedelta(minutes=30)).isoformat()
    for k, v in diario.items():
        scrivi(base, f"data/diario/{v['date']}_{k}.json", {k: v})
    scrivi(base, "data/consigli.json", consigli)
    scrivi(base, "app/data/giornata.json", {"matches": [{"lg": "ACL", "st": "NS", "ko": (ora - timedelta(hours=5)).isoformat()},
                                                        {"lg": "I1", "st": "FT", "ko": (ora - timedelta(hours=5)).isoformat()}]})
    scrivi(base, "data/coerenza.json", {"controlli": 10, "problemi": []})


def esegui(base):
    r = subprocess.run([sys.executable, "-I", REVISORE, base], capture_output=True, text=True, timeout=120)
    with open(os.path.join(base, "data", "revisore.json"), encoding="utf-8") as f:
        return r.returncode, json.load(f)


class TestRevisore(unittest.TestCase):
    def test_algoritmo_onesto(self):
        with tempfile.TemporaryDirectory() as base:
            mondo(base)
            codice, e = esegui(base)
            testo = " ".join(e["problemi"] + e["attenzione"])
            self.assertNotIn("troppo sicura", testo)
            self.assertNotIn("poco oneste", testo)
            self.assertIn("ACL (1)", testo)  # risultato che non arriva
            self.assertTrue(any("IA contro quote" in x for x in e["note"]))

    def test_algoritmo_troppo_sicuro(self):
        with tempfile.TemporaryDirectory() as base:
            mondo(base, onesta=False)
            codice, e = esegui(base)
            self.assertEqual(codice, 1)
            testo = " ".join(e["problemi"])
            self.assertIn("troppo sicura", testo)
            self.assertIn("IA peggiore", testo)

    def test_consiglio_dopo_il_fischio(self):
        with tempfile.TemporaryDirectory() as base:
            mondo(base, tardivo_contato=True)
            codice, e = esegui(base)
            self.assertEqual(codice, 1)
            self.assertTrue(any("dopo il calcio d'inizio contano nello storico" in x for x in e["problemi"]))

    def test_numeri_rotti_e_apprendimento_fermo(self):
        with tempfile.TemporaryDirectory() as base:
            mondo(base)
            scrivi(base, "app/data/ia.json", {"allenato": "2020-01-01", "modello": {"nome": "prova"}})
            with open(os.path.join(base, "data", "modello.json"), "w", encoding="utf-8") as f:
                f.write('{"attivo": {"ricetta": "mercato", "integratore": {"x": NaN}}}')
            codice, e = esegui(base)
            testo = " ".join(e["problemi"])
            self.assertIn("non si riallena", testo)
            self.assertIn("numeri non validi", testo)


if __name__ == "__main__":
    unittest.main()
