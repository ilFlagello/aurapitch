"""Il consiglio si blocca una volta sola: dopo il fischio e a partita finita i giri successivi non lo ri-bloccano
(prima ogni giro breve ri-bloccava le partite finite rimaste nel file, le segnava "tardive" e le toglieva dallo storico)."""
import copy
import json
import os
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from unittest import mock

RADICE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RADICE)
os.chdir(RADICE)
import genera_app as GA  # noqa: E402

KO = datetime(2026, 11, 3, 19, 45, tzinfo=timezone.utc)


def partita():
    tip = {k: {"c": c, "l": c, "p": p, "q": q, "qm": True, "titolo": k, "perche": ["al blocco"]}
           for k, c, p, q in (("consiglio", "1", 0.55, 1.8), ("prudente", "1X", 0.8, 1.2), ("coraggiosa", "O2.5", 0.45, 2.2))}
    return {"id": "PROVA-1", "date": "2026-11-03", "ko": KO.isoformat(), "lg": "SA", "h": "Casa", "a": "Ospite", "st": "NS",
            "tip": tip, "p": [0.55, 0.25, 0.2], "mk": [0.5, 0.27, 0.23], "fattori": [], "segnali": [], "odds": {}}


def orologio(t):
    class Finto(datetime):
        @classmethod
        def now(cls, tz=None):
            return t if tz is None else t.astimezone(tz)
    return Finto


class TestBloccoUnico(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.vecchi = GA.STORICO_IN, GA.STORICO_OUT
        GA.STORICO_IN = os.path.join(self.tmp, "consigli.json")
        GA.STORICO_OUT = os.path.join(self.tmp, "storico.json")
        self.patch = [mock.patch.object(GA.VM, "scrivi_pubblico", return_value={"totale": {}}),
                      mock.patch.object(GA.VM, "registra_chiusura", return_value=0),
                      mock.patch.object(GA.VM, "specialisti_attivi", return_value=[])]
        for p in self.patch:
            p.start()

    def tearDown(self):
        GA.STORICO_IN, GA.STORICO_OUT = self.vecchi
        for p in self.patch:
            p.stop()

    def giro(self, quando, m):
        d = {"matches": [m], "standings": {}}
        with mock.patch.object(GA, "datetime", orologio(quando)):
            GA.blocca_consigli(d)
            GA.aggiorna_storico(d)
        return d["matches"][0], json.load(open(GA.STORICO_IN, encoding="utf-8"))

    def test_finita_resta_bloccata(self):
        m = partita()
        m1, st = self.giro(KO - timedelta(minutes=50), copy.deepcopy(m))
        self.assertEqual(m1["blocco"]["st"], "bloccato")
        t_blocco = st["PROVA-1"]["tB"]
        # partita finita: il consiglio calcolato adesso e diverso, ma deve restare quello del blocco
        fine = copy.deepcopy(m)
        fine.update(st="FT", g=[2, 1], g1=[1, 0])
        for k in fine["tip"]:
            fine["tip"][k] = dict(fine["tip"][k], c="2", l="2", perche=["dopo"])
        for minuti in (130, 140, 150, 600):  # piu giri brevi con la partita ancora nel file
            m2, st = self.giro(KO + timedelta(minutes=minuti), copy.deepcopy(fine))
            r = st["PROVA-1"]
            self.assertEqual(r["tB"], t_blocco)
            self.assertFalse(r.get("tardivo"))
            self.assertEqual(r["tips"]["consiglio"]["c"], "1")
            self.assertEqual(r["esiti"]["consiglio"], True)
            self.assertEqual(m2["blocco"], {"st": "bloccato", "t": t_blocco})
            self.assertEqual(m2["tip"]["consiglio"]["c"], "1")
            self.assertIn("al blocco", m2["tip"]["consiglio"]["perche"])  # il consiglio completo resta finche la partita e nel file
            self.assertNotIn("dopo", m2["tip"]["consiglio"]["perche"])
        # la partita esce dal file: resta la versione corta (registro leggero)
        with mock.patch.object(GA, "datetime", orologio(KO + timedelta(days=1))):
            GA.aggiorna_storico({"matches": []})
        r = json.load(open(GA.STORICO_IN, encoding="utf-8"))["PROVA-1"]
        self.assertNotIn("tipB", r)
        self.assertEqual(r["esiti"]["consiglio"], True)

    def test_registro_vecchio_senza_consiglio_completo(self):
        # voce gia ridotta alla versione corta (registro scritto prima della correzione): niente nuovo blocco
        m = partita()
        _, st = self.giro(KO - timedelta(minutes=50), copy.deepcopy(m))
        st["PROVA-1"].pop("tipB")
        st["PROVA-1"].update(st="FT", g=[2, 1])
        json.dump(st, open(GA.STORICO_IN, "w", encoding="utf-8"))
        fine = copy.deepcopy(m)
        fine.update(st="FT", g=[2, 1])
        fine["tip"]["consiglio"] = dict(fine["tip"]["consiglio"], c="2", l="2")
        m2, st2 = self.giro(KO + timedelta(hours=3), fine)
        self.assertEqual(st2["PROVA-1"]["tB"], st["PROVA-1"]["tB"])
        self.assertFalse(st2["PROVA-1"].get("tardivo"))
        self.assertEqual(m2["tip"]["consiglio"]["c"], "1")
        self.assertEqual(m2["blocco"]["st"], "bloccato")

    def test_vista_dopo_il_fischio_resta_tardiva(self):
        m = partita()
        m.update(st="FT", g=[0, 0])
        m2, st = self.giro(KO + timedelta(hours=2), m)
        self.assertTrue(st["PROVA-1"]["tardivo"])
        self.assertEqual(m2["blocco"]["st"], "tardivo")
        t = st["PROVA-1"]["tB"]
        _, st = self.giro(KO + timedelta(hours=3), copy.deepcopy(m))
        self.assertEqual(st["PROVA-1"]["tB"], t)  # nemmeno le tardive si ri-bloccano


if __name__ == "__main__":
    unittest.main()
