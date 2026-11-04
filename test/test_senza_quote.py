"""Campionati senza quote: partite dal calendario ESPN, classifica, archivio e diretta, SENZA consiglio e fuori dalla schedina.
Nessuna richiesta di rete: il calendario ESPN e finto."""
import json
import os
import sys
import tempfile
import unittest
from datetime import date, datetime, timedelta, timezone

RADICE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RADICE)
os.chdir(RADICE)
import espn_dati as ES  # noqa: E402
import genera_app as GA  # noqa: E402

GIORNI = [date(2026, 11, 3) + timedelta(days=d) for d in range(-1, 6)]


def ev(eid, t, h, a, gh=0, ga=0, stato="pre", fine=False, quote=None):
    c = {"competitors": [{"homeAway": "home", "team": {"displayName": h}, "score": str(gh)}, {"homeAway": "away", "team": {"displayName": a}, "score": str(ga)}]}
    if quote:
        c["odds"] = [{"moneyline": {x: {"close": {"odds": v}} for x, v in zip(("home", "draw", "away"), quote)}}]
    return {"id": eid, "date": t, "status": {"type": {"state": stato, "completed": fine, "name": "STATUS_FULL_TIME" if fine else "STATUS_SCHEDULED"}}, "competitions": [c]}


def compatto(e):
    x = ES.evento(e)
    x["eid"] = e["id"]
    q = ES.quote_1x2(e["competitions"][0])
    if q:
        x["q"] = q
    return x


ESD = {"senza_quote": {
    "RU1": {"ev": [compatto(ev("1", "2026-11-02T15:00Z", "Krylia Sovetov", "Zenit St Petersburg", 0, 3, "post", True)),
                   compatto(ev("2", "2026-11-05T17:00Z", "Spartak Moscow", "CSKA Moscow", quote=["+120", "+240", "+210"]))],
            "cl": [{"team": "Zenit", "pg": 14, "v": 10, "n": 2, "p": 2, "gf": 30, "gs": 10, "pt": 32, "rank": 1}]},
    "SCC": {"ev": [compatto(ev("3", "2026-10-20T19:00Z", "Celtic", "Hearts", 2, 0, "post", True))], "cl": []},  # fuori dai giorni dell'app
}}


class TestSenzaQuote(unittest.TestCase):
    def test_partite_senza_consiglio(self):
        partite, leghe, cl = GA.partite_senza_quote(ESD, GIORNI)
        self.assertEqual([m["id"] for m in partite], ["NQ-RU1-1", "NQ-RU1-2"])
        fin, dopo = partite
        self.assertTrue(fin["nq"] and dopo["nq"])
        self.assertEqual((fin["st"], fin["g"], fin["res"]), ("FT", [0, 3], 2))
        for m in partite:  # nessun campo che l'app usa per consigli e schedina
            for k in ("tip", "p", "mk", "markets", "odds", "xg"):
                self.assertNotIn(k, m)
        self.assertEqual(dopo["q"], [2.2, 3.4, 3.1])
        self.assertAlmostEqual(sum(dopo["pq"]), 1, places=3)
        self.assertEqual([l["k"] for l in leghe], ["RU1"])  # la coppa senza partite nei giorni dell'app e senza classifica non compare
        self.assertTrue(cl["RU1"]["solo_generale"])
        self.assertEqual(cl["RU1"]["generale"][0]["pt"], 32)

    def test_archivio(self):
        path = os.path.join(tempfile.mkdtemp(), "archivio", "senza_quote.json")
        self.assertEqual(GA.archivia_senza_quote(ESD, path), 2)  # le due finite (anche quella fuori dai giorni dell'app)
        self.assertEqual(GA.archivia_senza_quote(ESD, path), 0)  # nessun doppione
        arch = GA.jload(path)
        self.assertEqual(arch["1"]["g"], [0, 3])
        self.assertNotIn("2", arch)  # non ancora giocata

    def test_diretta_per_id(self):
        partite, _, _ = GA.partite_senza_quote(ESD, GIORNI)
        d = {"senza_quote": partite}
        chiamate = []

        def get(url):
            chiamate.append(url)
            return {"events": [ev("2", "2026-11-05T17:00Z", "Spartak", "CSKA", 1, 0, "in", False)]}
        n = GA.aggiorna_senza_quote(d, get=get, ora=datetime(2026, 11, 5, 18, 0, tzinfo=timezone.utc))
        self.assertEqual(n, 1)
        self.assertEqual((partite[1]["st"], partite[1]["g"]), ("LIVE", [1, 0]))  # abbinata per id anche con nomi diversi
        self.assertTrue(all("rus.1" in u for u in chiamate))

    def test_fuori_da_schedina_e_storico(self):
        """Le partite senza quote non entrano in 'matches': schedina, consigli, diario e storico non le vedono."""
        partite, _, _ = GA.partite_senza_quote(ESD, GIORNI)
        d = {"matches": [], "senza_quote": partite}
        self.assertEqual(json.loads(json.dumps(d))["matches"], [])
        self.assertTrue(all(m["id"].startswith("NQ-") for m in d["senza_quote"]))


if __name__ == "__main__":
    unittest.main()
