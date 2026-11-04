"""Mercati nuovi in ombra (mercati_extra.py, Blocco 2): handicap asiatico, draw no bet, espulsione, tiri in porta, primo gol.
Controlla le regole di pagamento, la coerenza con i mercati esistenti, il file in ombra e il controllo del revisore."""
import importlib
import json
import os
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone

RADICE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RADICE)
os.chdir(RADICE)
import mercati as M  # noqa: E402
import mercati_extra as MX  # noqa: E402
import raccoglitore as R  # noqa: E402


class TestHandicap(unittest.TestCase):
    def test_pagamento(self):
        self.assertEqual(MX.valore_ah(0, 0), 0.5)        # draw no bet: pareggio = rimborso
        self.assertEqual(MX.valore_ah(0, -0.25), 0.25)   # mezza persa
        self.assertEqual(MX.valore_ah(0, 0.25), 0.75)    # mezza vinta
        self.assertEqual(MX.valore_ah(1, -1), 0.5)       # vince di 1 con -1: rimborso
        self.assertEqual(MX.valore_ah(1, -0.75), 0.75)   # vince di 1 con -0,75: mezza vinta
        self.assertEqual(MX.valore_ah(2, -1.5), 1.0)
        self.assertEqual(MX.valore_ah(-1, 0.5), 0.0)

    def test_coerente_con_i_mercati_esistenti(self):
        lh, la = 1.6, 1.1
        m = M.matrice(lh, la)
        p1 = M._prob(m, lambda i, j: i > j)
        px = M._prob(m, lambda i, j: i == j)
        p2 = 1 - p1 - px
        h = MX.handicap(lh, la)
        self.assertAlmostEqual(h["ah"]["-0.5"], p1, places=3)          # -0,5 = vittoria della casa
        self.assertAlmostEqual(h["ah"]["+0.5"], p1 + px, places=3)     # +0,5 = 1X
        self.assertAlmostEqual(h["ah"]["+0"], p1 + px / 2, places=3)   # linea 0: rimborso a meta del valore
        self.assertAlmostEqual(h["dnb"][0], p1 / (p1 + p2), places=3)
        self.assertAlmostEqual(h["ah"]["-0.25"], (h["ah"]["-0.5"] + h["ah"]["+0"]) / 2, places=3)
        valori = [h["ah"][f"{x / 4:+g}"] for x in range(-8, 9)]
        self.assertEqual(valori, sorted(valori))  # piu vantaggio alla casa, piu valore


class TestAltriMercati(unittest.TestCase):
    def test_primo_gol(self):
        pg = MX.primo_gol(1.5, 1.0)
        self.assertAlmostEqual(sum(pg), 1, places=3)
        self.assertGreater(pg[0], pg[1])
        r = MX.primo_gol_rivelato(1.5, 1.0)
        self.assertTrue(r[0] < pg[0] and r[1] < pg[1])

    def test_tiri_ed_espulsione(self):
        if not MX.prova().get("per_app"):
            self.skipTest("storico/prova_mercati.json mancante")
        t = MX.tiri(1.8, 0.9, "I1")
        self.assertGreater(t["H"]["mu"], t["A"]["mu"])
        self.assertEqual([t["H"][f"O{L}"] for L in MX.LINEE_TIRI], sorted((t["H"][f"O{L}"] for L in MX.LINEE_TIRI), reverse=True))
        self.assertIsNone(MX.tiri(1.8, 0.9, "BR1"))  # campionato non provato sull'archivio: niente tiri in porta
        self.assertTrue(0.05 < MX.espulsione("I1") < 0.4)
        self.assertIsNone(MX.espulsione("BR1"))

    def test_promossi(self):
        p = MX.promossi()
        self.assertFalse(p["primo_marcatore"])
        if MX.prova():
            self.assertTrue(p["handicap"] and p["draw_no_bet"] and p["primo_gol"])

    def test_esiti(self):
        o = MX.ombra({"xg": [1.5, 1.0], "lg": "I1"})
        es = {c: (p, y) for c, p, y in MX.valuta_ombra(o, [2, 1], [0, 1], {"R": [0, 1], "TP": [6, 2]})}
        self.assertEqual(es["AH-1.5"][1], 0)
        self.assertEqual(es["AH-0.5"][1], 1)
        self.assertEqual(es["DNB1"][1], 1)
        self.assertEqual(es["PG0"][1], 0)
        self.assertEqual(es["PG1|noto"][1], 0)  # primo tempo 0-1: ha segnato prima l'ospite
        if "esp" in o:
            self.assertEqual(es["ESP"][1], 1)
            self.assertEqual(es["TPHO5.5"][1], 1)
            self.assertEqual(es["TPAO2.5"][1], 0)
        # pareggio: il draw no bet non si giudica (rimborso); primo tempo con gol di tutte e due: primo marcatore non noto
        es = {c for c, _, _ in MX.valuta_ombra(o, [1, 1], [1, 1])}
        self.assertNotIn("DNB1", es)
        self.assertNotIn("PG1|noto", es)


class TestQuoteAf(unittest.TestCase):
    def test_mercati_ombra_af(self):
        it = {"bookmakers": [{"bets": [{"name": "Asian Handicap", "values": [{"value": "Home -0.5", "odd": "1.90"}, {"value": "Away +3.5", "odd": "1.01"}]},
                                       {"name": "Home/Away", "values": [{"value": "Home", "odd": "1.50"}]},
                                       {"name": "Match Winner", "values": [{"value": "Home", "odd": "2"}]}]},
                             {"bets": [{"name": "Asian Handicap", "values": [{"value": "Home -0.5", "odd": "2.00"}]}]}]}
        x = R.mercati_ombra_af(it)
        self.assertEqual(x, {"ah": {"Home -0.5": 1.95}, "dnb": {"Home": 1.5}})


class TestFileInOmbra(unittest.TestCase):
    def test_salva_e_revisore(self):
        import genera_app as GA
        tmp = tempfile.mkdtemp()
        vecchio = GA.DATA
        GA.DATA = os.path.join(tmp, "data")
        ora = datetime.now(timezone.utc)
        dopo, presto = (ora + timedelta(hours=5)).isoformat(), (ora + timedelta(minutes=20)).isoformat()
        d = {"matches": [{"id": "A", "date": "2026-11-05", "ko": dopo, "st": "NS", "lg": "I1", "xg": [1.4, 1.2], "blocco": {"st": "provvisorio"}},
                         {"id": "B", "date": "2026-11-05", "ko": presto, "st": "NS", "lg": "I1", "xg": [1.0, 1.0]},
                         {"id": "C", "date": "2026-11-05", "ko": dopo, "st": "NS", "lg": "I1", "xg": [1.0, 1.0], "blocco": {"st": "bloccato"}}]}
        try:
            GA.salva_mercati_ombra(d)
        finally:
            GA.DATA = vecchio
        with open(os.path.join(tmp, "data", "2026-11-05", "mercati_ombra.json"), encoding="utf-8") as f:
            x = json.load(f)
        self.assertEqual(set(x), {"A"})  # B dentro i 45 minuti, C gia bloccata: non si toccano
        self.assertEqual(set(x["A"]), {"xg", "lg", "t"})

        argv = sys.argv
        sys.argv = ["revisore.py", tmp]
        import strumenti.revisore as RV
        importlib.reload(RV)
        os.makedirs(os.path.join(tmp, "data", "espn"), exist_ok=True)
        giorno = (RV.ORA - timedelta(days=1)).date().isoformat()
        ombre, diario = {}, []
        for i in range(400):
            ombre[f"P{i}"] = {"xg": [1.5, 1.0], "lg": "XX"}
            g = [[2, 1], [0, 0], [1, 1], [0, 2]][i % 4]
            diario.append({"id": f"P{i}", "date": giorno, "st": "FT", "g": g, "g1": [min(1, g[0]), 0], "lg": "XX", "ko": giorno + "T18:00:00+00:00"})
        os.makedirs(os.path.join(tmp, "data", giorno))
        with open(os.path.join(tmp, "data", giorno, "mercati_ombra.json"), "w", encoding="utf-8") as f:
            json.dump(ombre, f)
        try:
            out = RV.controlla_mercati_ombra(diario)
        finally:
            sys.argv = argv
            importlib.reload(RV)
        self.assertEqual(out["draw no bet"]["n"], 200)  # i pareggi non contano
        self.assertIsNotNone(out["handicap asiatico"]["scarto"])
        self.assertTrue(out["handicap asiatico"]["n"] > 0)


if __name__ == "__main__":
    unittest.main()
