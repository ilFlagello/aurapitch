"""Test del budget delle API (salvadanaio.py: calendario dei costi, precedenza alle fotografie al blocco, economo):
python3 -m unittest discover -s test"""
import os
import sys
import tempfile
import unittest
from datetime import date, datetime, timedelta, timezone

RADICE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RADICE)
import salvadanaio as SV  # noqa: E402

UTC = timezone.utc


def ev(t):
    return {"commence_time": t.isoformat().replace("+00:00", "Z")}


class Calendario(unittest.TestCase):
    def test_fasce_e_campionati(self):
        g = datetime(2026, 11, 7, tzinfo=UTC)
        cal = SV.calendario_da_eventi({
            "Serie A": [ev(g.replace(hour=14)), ev(g.replace(hour=14, minute=15)), ev(g.replace(hour=17)), ev(g.replace(hour=19, minute=45))],
            "Premier League": [ev(g.replace(hour=15)), ev(g.replace(hour=15)), ev(g + timedelta(days=1, hours=14))]})
        self.assertEqual(cal["2026-11-07"], {"fasce": 4, "leghe": 2})  # 14:00 e 14:15 = una fascia
        self.assertEqual(cal["2026-11-08"], {"fasce": 1, "leghe": 1})
        self.assertEqual(SV.costo_giorno(cal["2026-11-07"]), 12)

    def test_parte_del_giorno_segue_il_calendario(self):
        cal = {"2026-11-04": {"fasce": 1, "leghe": 1}, "2026-11-07": {"fasce": 12, "leghe": 5}, "2026-11-10": {"fasce": 1, "leghe": 2}}
        poca = SV.quota_odds_giorno(384, date(2026, 11, 4), cal)
        self.assertLess(poca, SV.quota_odds_giorno(384, date(2026, 11, 4)))  # oggi si gioca poco: si risparmia
        tanta = SV.quota_odds_giorno(300, date(2026, 11, 7), cal)
        self.assertGreater(tanta, SV.quota_odds_giorno(300, date(2026, 11, 7)))  # sabato pieno: ricava di piu
        self.assertGreaterEqual(tanta, 20)
        self.assertEqual(SV.quota_odds_giorno(384, date(2026, 11, 4), {"2026-11-04": {"fasce": 0, "leghe": 0}}), 0)


class Precedenza(unittest.TestCase):
    def setUp(self):
        self.vecchi = (SV.PATH, SV._ora)
        self.d = tempfile.TemporaryDirectory()
        SV.PATH = os.path.join(self.d.name, "budget.json")

    def tearDown(self):
        SV.PATH, SV._ora = self.vecchi
        self.d.cleanup()

    def test_il_mattino_lascia_i_crediti_al_blocco(self):
        SV._ora = lambda: datetime(2026, 11, 4, 6, tzinfo=UTC)
        SV.odds_puo("mattino", 0, 384)
        SV.odds_calendario({"2026-11-04": {"fasce": 2, "leghe": 6}, "2026-11-07": {"fasce": 12, "leghe": 5}})
        quota = SV.carica()["odds"]["quota"]
        rim, mattino = 384, 0
        while SV.odds_puo("mattino", 2, rim):
            rim -= 2
            mattino += 2
            SV.odds_spesa("mattino", 2, rim)
        SV.odds_mattino_fatto()
        self.assertLessEqual(mattino, quota - 4)  # 2 fasce al blocco (CL 17:45 e 20:00) restano libere
        blocco = 0
        SV._ora = lambda: datetime(2026, 11, 4, 17, tzinfo=UTC)
        while SV.odds_puo("prepartita", 2, rim):
            rim -= 2
            blocco += 2
            SV.odds_spesa("prepartita", 2, rim)
        self.assertGreaterEqual(blocco, 4)

    def test_crediti_fino_a_fine_mese_con_il_calendario(self):
        rim, g = 384, date(2026, 11, 4)
        cal = {}
        while g.month == 11:
            sab = g.weekday() >= 5
            cal[g.isoformat()] = {"fasce": 12 if sab else 2, "leghe": 6 if sab else 2}
            g += timedelta(days=1)
        g, a_secco = date(2026, 11, 4), 0
        while g.month == 11:
            SV._ora = lambda g=g: datetime(g.year, g.month, g.day, 6, tzinfo=UTC)
            SV.odds_puo("mattino", 0, rim)
            SV.odds_calendario(cal)
            spesi = 0
            for cat in ("mattino", "prepartita"):
                for _ in range(30):  # si chiede sempre di piu del possibile
                    if SV.odds_puo(cat, 2, rim):
                        rim -= 2
                        spesi += 2
                        SV.odds_spesa(cat, 2, rim)
                if cat == "mattino":
                    SV.odds_mattino_fatto()
            a_secco += spesi == 0
            g += timedelta(days=1)
        self.assertGreaterEqual(rim, SV.ODDS_RISERVA)
        self.assertEqual(a_secco, 0)

    def test_economo(self):
        SV._ora = lambda: datetime(2026, 11, 4, 20, tzinfo=UTC)
        SV.odds_puo("mattino", 0, 384)
        SV.odds_calendario({"2026-11-05": {"fasce": 3, "leghe": 4}})
        SV.af_spesa("infortuni", 90)
        SV.fd_spesa()
        e = SV.economo(rimasti=384)
        fonti = [r["fonte"] for r in e["righe"]]
        self.assertEqual(fonti[:3], ["The Odds API", "API-Football", "football-data.org"])
        self.assertEqual(e["avvisi"], [])
        self.assertIn("The Odds API", SV.riga_economo(rimasti=384))
        poveri = SV.economo(rimasti=40)  # 30 crediti per 26 giorni: non bastano
        self.assertTrue(any("The Odds API" in x for x in poveri["avvisi"]))


if __name__ == "__main__":
    unittest.main()
