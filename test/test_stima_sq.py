"""Test delle stime dell'IA nei campionati senza quote (stima_sq.py) e del loro controllo nel revisore."""
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
import stima_sq as SQ  # noqa: E402

CL = {"IL1": {"generale": [{"team": "Maccabi Tel Aviv", "pg": 10, "gf": 25, "gs": 6}, {"team": "Hapoel Haifa", "pg": 10, "gf": 8, "gs": 22},
                           {"team": "Beitar", "pg": 10, "gf": 14, "gs": 14}, {"team": "Ashdod", "pg": 1, "gf": 1, "gs": 1}]},
      "P1": {"generale": [{"team": "Benfica", "pg": 10, "gf": 26, "gs": 7}, {"team": "Porto", "pg": 10, "gf": 22, "gs": 8}, {"team": "Casa Pia", "pg": 10, "gf": 9, "gs": 20}]}}


def partita(eid, lg, h, a, ore=5, st="NS", g=None):
    ko = datetime.now(timezone.utc) + timedelta(hours=ore)
    return {"id": f"NQ-{lg}-{eid}", "eid": eid, "nq": True, "lg": lg, "h": h, "a": a, "ko": ko.isoformat(), "st": st, "g": g}


class TestStimaSQ(unittest.TestCase):
    def test_forte_contro_debole(self):
        s = SQ.stima("Maccabi Tel Aviv", "Hapoel Haifa", [("IL1", SQ.forze(CL["IL1"]["generale"]))])
        self.assertGreater(s["p"][0], 0.6)
        self.assertAlmostEqual(sum(s["p"]), 1.0, places=3)
        s2 = SQ.stima("Hapoel Haifa", "Maccabi Tel Aviv", [("IL1", SQ.forze(CL["IL1"]["generale"]))])
        self.assertGreater(s2["p"][2], s2["p"][0])

    def test_prudenza_e_casi_senza_stima(self):
        fz = [("IL1", SQ.forze(CL["IL1"]["generale"]))]
        self.assertIsNone(SQ.stima("Maccabi Tel Aviv", "Ashdod", fz))  # una sola partita giocata
        self.assertIsNone(SQ.stima("Maccabi Tel Aviv", "Squadra sconosciuta", fz))
        uguali = SQ.stima("Beitar", "Beitar", fz)["p"]
        self.assertGreater(uguali[0], uguali[2])  # a parita di forza conta il campo

    def test_coppa_solo_stessa_classifica(self):
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "s.json")
            ms = [partita("1", "TPO", "Benfica", "Casa Pia"), partita("2", "TPO", "Benfica", "Maccabi Tel Aviv"), partita("3", "IL1", "Beitar", "Hapoel Haifa")]
            n = SQ.aggiungi_stime(ms, CL, path=path)
            self.assertEqual(n, 2)
            self.assertIn("pia", ms[0])
            self.assertNotIn("pia", ms[1])  # squadre di classifiche diverse: nessuna stima
            reg = json.load(open(path, encoding="utf-8"))
            self.assertEqual(reg["1"]["da"], "P1")
            # dopo il fischio la stima non cambia piu; a partita finita arriva il risultato
            ms[0].update({"st": "FT", "g": [3, 0]})
            ms[0].pop("pia")
            SQ.aggiungi_stime(ms, {"P1": {"generale": []}}, path=path)
            reg = json.load(open(path, encoding="utf-8"))
            self.assertEqual(reg["1"]["g"], [3, 0])
            self.assertEqual(ms[0]["pia"], reg["1"]["p"])
            # risultati anche dall'archivio dei senza quote
            SQ.aggiungi_stime([], {}, path=path, archivio={"3": {"g": [1, 1]}})
            self.assertEqual(json.load(open(path, encoding="utf-8"))["3"]["g"], [1, 1])

    def test_valuta_e_revisore(self):
        rnd = random.Random(2)
        reg = {}
        for i in range(120):
            p = [0.5, 0.25, 0.25]
            u = rnd.random()
            g = [1, 0] if u < 0.5 else [0, 0] if u < 0.75 else [0, 1]
            reg[str(i)] = {"lg": "IL1", "t": datetime.now(timezone.utc).isoformat(), "p": p, "g": g}
        v = SQ.valuta(reg)
        self.assertEqual(v["n"], 120)
        self.assertLess(v["ia"], v["base"] + 0.05)
        with tempfile.TemporaryDirectory() as base:
            os.makedirs(os.path.join(base, "data"))
            with open(os.path.join(base, "data", "stime_senza_quote.json"), "w") as f:
                json.dump(reg, f)
            subprocess.run([sys.executable, "-I", os.path.join(RADICE, "strumenti", "revisore.py"), base], capture_output=True, timeout=120)
            with open(os.path.join(base, "data", "revisore.json"), encoding="utf-8") as f:
                rv = json.load(f)
            with open(os.path.join(base, "data", "revisore_stime_sq.json"), encoding="utf-8") as f:
                self.assertEqual(json.load(f)["n"], 120)
            self.assertTrue(any("Stime senza quote (120 partite)" in x for x in rv["note"] + rv["attenzione"]))


if __name__ == "__main__":
    unittest.main()
