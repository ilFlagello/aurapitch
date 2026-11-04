"""Test della fotografia delle quote al blocco del consiglio (orologio.py, raccoglitore.giro_prepartita):
python3 -m unittest discover -s test"""
import json
import os
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from unittest import mock

RADICE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RADICE)
import orologio as OR  # noqa: E402
import raccoglitore as R  # noqa: E402

UTC = timezone.utc


def partita(i, lg, ko, st="provvisorio"):
    return {"id": i, "lg": lg, "h": "Casa " + i, "a": "Ospite " + i, "ko": ko.isoformat(), "st": "NS", "blocco": {"st": st}}


class Orologio(unittest.TestCase):
    def test_ultimo_giro_come_il_blocco(self):
        ko = datetime(2026, 11, 4, 20, 0, tzinfo=UTC)  # blocco alle 19:15
        self.assertFalse(OR.ultimo_giro(ko, datetime(2026, 11, 4, 18, 50, tzinfo=UTC)))
        self.assertTrue(OR.ultimo_giro(ko, datetime(2026, 11, 4, 19, 10, tzinfo=UTC)))  # 19:10 e l'ultimo giro prima delle 19:15
        self.assertTrue(OR.ultimo_giro(ko, datetime(2026, 11, 4, 19, 20, tzinfo=UTC)))  # giro in ritardo: blocco adesso
        self.assertFalse(OR.ultimo_giro(ko, datetime(2026, 11, 4, 20, 5, tzinfo=UTC)))  # partita iniziata
        # deriva: la foto si scatta qualche minuto prima del blocco dello stesso giro
        self.assertTrue(OR.ultimo_giro(ko, datetime(2026, 11, 4, 19, 3, tzinfo=UTC)))
        # di notte non passa nessuno: la partita delle 2:00 si fotografa all'ultimo giro (23:50)
        notte = datetime(2026, 11, 5, 2, 0, tzinfo=UTC)
        self.assertTrue(OR.ultimo_giro(notte, datetime(2026, 11, 4, 23, 50, tzinfo=UTC)))
        self.assertFalse(OR.ultimo_giro(notte, datetime(2026, 11, 4, 23, 20, tzinfo=UTC)))

    def test_genera_app_usa_lo_stesso_orologio(self):
        import genera_app as GA
        self.assertIs(GA.prossimo_giro, OR.prossimo_giro)
        self.assertEqual(GA.BLOCCO_MIN, OR.BLOCCO_MIN)


class Piano(unittest.TestCase):
    def test_blocco_e_chiusura(self):
        ora = datetime(2026, 11, 4, 19, 10, tzinfo=UTC)
        ms = [partita("a", "CL", datetime(2026, 11, 4, 20, 0, tzinfo=UTC)),  # blocco ora
              partita("b", "CL", datetime(2026, 11, 4, 21, 0, tzinfo=UTC)),  # piu tardi
              partita("c", "F1", datetime(2026, 11, 4, 19, 30, tzinfo=UTC), "bloccato"),  # chiusura ESPN
              partita("d", "I1", datetime(2026, 11, 4, 19, 30, tzinfo=UTC), "bloccato"),  # blocco con The Odds API: niente ESPN
              partita("e", "F1", datetime(2026, 11, 4, 19, 35, tzinfo=UTC), "bloccato")]  # chiusura gia fatta
        stato = {"partite": {"d": {"pb": "x", "fonte": "oa"}, "e": {"pb": "x", "fonte": "espn", "ch": "y"}}}
        p = R.piano_prepartita(ms, ora, stato)
        self.assertEqual([m["id"] for m in p["blocco"].get("CL", [])], ["a"])
        self.assertEqual({k: [m["id"] for m in v] for k, v in p["chiusura"].items()}, {"F1": ["c"]})

    def test_una_chiamata_per_fascia(self):
        ora = datetime(2026, 11, 4, 19, 10, tzinfo=UTC)
        gio = {"matches": [partita("a", "CL", datetime(2026, 11, 4, 20, 0, tzinfo=UTC)), partita("b", "CL", datetime(2026, 11, 4, 20, 0, tzinfo=UTC)),
                           partita("c", "CL", datetime(2026, 11, 4, 21, 0, tzinfo=UTC))]}

        def ev(m):
            q = [{"name": m["h"], "price": 2.0}, {"name": "Draw", "price": 3.4}, {"name": m["a"], "price": 3.8}]
            return {"home_team": m["h"], "away_team": m["a"], "commence_time": m["ko"],
                    "bookmakers": [{"key": "bk%d" % i, "markets": [{"key": "h2h", "outcomes": q}]} for i in range(3)]}
        chiamate = []

        def finta(path, cat="mattino", **kw):
            if path == "/sports":
                return [{"title": "UEFA Champions League", "key": "soccer_uefa_champs_league"}], {"x-requests-remaining": "300"}
            chiamate.append((path, cat))
            return [ev(m) for m in gio["matches"]], {"x-requests-remaining": "298"}
        cwd = os.getcwd()
        with tempfile.TemporaryDirectory() as d:
            os.makedirs(os.path.join(d, "app", "data"))
            with open(os.path.join(d, "app", "data", "giornata.json"), "w") as f:
                json.dump(gio, f)
            os.chdir(d)
            try:
                with mock.patch.object(R, "odds_api", finta), mock.patch.object(R.SV, "odds_puo", lambda *a, **k: True), \
                        mock.patch.dict(os.environ, {"ODDS_API_KEY": "finta"}):
                    R.giro_prepartita("data", ora=ora)
                    R.giro_prepartita("data", ora=ora + timedelta(minutes=10))  # stessa fascia: nessuna nuova chiamata
                with open(os.path.join("data", "2026-11-04", "prepartita.json")) as f:
                    righe = json.load(f)
                with open(os.path.join("data", "prepartita_stato.json")) as f:
                    stato = json.load(f)
            finally:
                os.chdir(cwd)
        self.assertEqual(len(chiamate), 1)
        self.assertEqual(sorted(r["id"] for r in righe if r["tipo"] == "blocco"), ["a", "b"])
        self.assertEqual([r["id"] for r in righe if r["tipo"] == "fascia"], ["c"])  # la stessa chiamata aggiorna anche le partite dopo
        self.assertEqual(stato["partite"]["a"]["fonte"], "oa")


if __name__ == "__main__":
    unittest.main()
