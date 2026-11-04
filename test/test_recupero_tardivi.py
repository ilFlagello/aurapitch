"""Recupero dei consigli segnati "tardivi" per errore (strumenti/recupero_tardivi.py): si ripristina solo cio che era stato
bloccato prima del fischio, le tardive vere restano tali, il recupero si puo rilanciare e i giri successivi non lo disfano."""
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
sys.path.insert(0, os.path.join(RADICE, "strumenti"))
os.chdir(RADICE)
import genera_app as GA  # noqa: E402
import recupero_tardivi as RT  # noqa: E402

KO = datetime(2026, 11, 3, 19, 45, tzinfo=timezone.utc)
T_BLOCCO = (KO - timedelta(minutes=54)).isoformat(timespec="minutes")
T_ERRATO = "2026-11-04T16:07+00:00"


def tip(c, testo):
    return {k: {"c": c if k == "consiglio" else x, "l": c if k == "consiglio" else x, "p": p, "q": q, "qm": True, "titolo": k, "perche": [testo]}
            for k, x, p, q in (("consiglio", "1", 0.55, 1.8), ("prudente", "1X", 0.8, 1.2), ("coraggiosa", "O2.5", 0.45, 2.2))}


def registro_riblocco(mid="PROVA-1"):
    """Voce come l'aveva lasciata l'errore: consiglio ricalcolato dopo la partita, ora del blocco dopo il fischio, tardiva."""
    t = tip("2", "dopo")
    return {mid: {"date": "2026-11-03", "lg": "SA", "h": "Casa", "a": "Ospite", "st": "FT", "g": [2, 1], "g1": [1, 0], "ko": KO.isoformat(),
                  "p": [0.55, 0.25, 0.2], "mk": [0.5, 0.27, 0.23], "tips": {k: {x: v[x] for x in RT.CAMPI} for k, v in t.items()},
                  "tipB": t, "tB": T_ERRATO, "tardivo": True, "spB": []}}


def voce(mid="PROVA-1", gruppo="riblocco", tB=T_BLOCCO):
    return {"id": mid, "gruppo": gruppo, "tB": tB, "ko": KO.isoformat(), "tip": tip("1", "al blocco"), "dati": {"lv": "completa"},
            "spB": ["elo"], "qF": {"consiglio": 1.7}, "tF": (KO - timedelta(minutes=5)).isoformat(timespec="minutes"),
            "date": "2026-11-03", "h": "Casa", "a": "Ospite", "lg": "SA", "tB_errato": T_ERRATO, "c_errato": "2"}


class TestRecupero(unittest.TestCase):
    def test_ripristina_consiglio_e_ora_veri(self):
        st = registro_riblocco()
        righe, n, saltate = RT.ripristina(st, [voce()], {"riblocco"})
        r = st["PROVA-1"]
        self.assertEqual((n, saltate), (1, []))
        self.assertNotIn("tardivo", r)
        self.assertEqual(r["tB"], T_BLOCCO)
        self.assertEqual(r["tips"]["consiglio"]["c"], "1")
        self.assertEqual(r["tips"]["consiglio"]["qF"], 1.7)
        self.assertEqual(r["tipB"]["consiglio"]["perche"], ["al blocco"])
        self.assertEqual(r["esiti"]["consiglio"], True)  # 2-1: vince "1"
        self.assertEqual(r["spB"], ["elo"])
        self.assertIn("prima: 2", righe[0])

    def test_rilancio_non_cambia_nulla(self):
        st = registro_riblocco()
        RT.ripristina(st, [voce()], {"riblocco"})
        dopo = copy.deepcopy(st)
        _, n, saltate = RT.ripristina(st, [voce()], {"riblocco"})
        self.assertEqual(n, 0)
        self.assertEqual(len(saltate), 1)
        self.assertEqual(st, dopo)

    def test_gruppo_regole_vecchie_solo_su_richiesta(self):
        st = registro_riblocco()
        _, n, _ = RT.ripristina(st, [voce(gruppo="regole_vecchie")], {"riblocco"})
        self.assertEqual(n, 0)
        self.assertTrue(st["PROVA-1"]["tardivo"])
        _, n, _ = RT.ripristina(st, [voce(gruppo="regole_vecchie")], {"riblocco", "regole_vecchie"})
        self.assertEqual(n, 1)

    def test_non_tocca_tardive_vere_ne_ricostruzioni_dopo_il_fischio(self):
        st = registro_riblocco()
        st["ALTRA"] = copy.deepcopy(st["PROVA-1"])
        _, n, saltate = RT.ripristina(st, [voce(tB=(KO + timedelta(minutes=1)).isoformat())], {"riblocco"})
        self.assertEqual(n, 0)
        self.assertTrue(st["PROVA-1"]["tardivo"] and st["ALTRA"]["tardivo"])  # ALTRA non e nell'elenco
        self.assertIn("dopo il fischio", saltate[0])

    def test_i_giri_successivi_non_disfano_il_recupero(self):
        tmp = tempfile.mkdtemp()
        vecchi = GA.STORICO_IN, GA.STORICO_OUT
        GA.STORICO_IN, GA.STORICO_OUT = os.path.join(tmp, "consigli.json"), os.path.join(tmp, "storico.json")
        patch = [mock.patch.object(GA.VM, "scrivi_pubblico", return_value={"totale": {}}),
                 mock.patch.object(GA.VM, "registra_chiusura", return_value=0)]
        try:
            for p in patch:
                p.start()
            st = registro_riblocco()
            RT.ripristina(st, [voce()], {"riblocco"})
            json.dump(st, open(GA.STORICO_IN, "w", encoding="utf-8"))
            m = {"id": "PROVA-1", "date": "2026-11-03", "ko": KO.isoformat(), "lg": "SA", "h": "Casa", "a": "Ospite", "st": "FT", "g": [2, 1],
                 "g1": [1, 0], "tip": tip("2", "dopo"), "p": [0.55, 0.25, 0.2], "mk": [0.5, 0.27, 0.23], "fattori": [], "segnali": [], "odds": {}}
            quando = datetime(2026, 11, 4, 18, 0, tzinfo=timezone.utc)

            class Finto(datetime):
                @classmethod
                def now(cls, tz=None):
                    return quando if tz is None else quando.astimezone(tz)
            d = {"matches": [m], "standings": {}}
            with mock.patch.object(GA, "datetime", Finto):
                GA.blocca_consigli(d)
                GA.aggiorna_storico(d)
            r = json.load(open(GA.STORICO_IN, encoding="utf-8"))["PROVA-1"]
            self.assertFalse(r.get("tardivo"))
            self.assertEqual(r["tB"], T_BLOCCO)
            self.assertEqual(r["esiti"]["consiglio"], True)
            self.assertEqual(d["matches"][0]["blocco"], {"st": "bloccato", "t": T_BLOCCO})
            self.assertEqual(d["matches"][0]["tip"]["consiglio"]["perche"], ["al blocco"])
        finally:
            for p in patch:
                p.stop()
            GA.STORICO_IN, GA.STORICO_OUT = vecchi

    def test_elenco_nel_repository(self):
        voci = json.load(open(RT.ELENCO, encoding="utf-8"))
        self.assertTrue(voci)
        for v in voci:
            self.assertIn(v["gruppo"], ("riblocco", "regole_vecchie"))
            self.assertLessEqual(datetime.fromisoformat(v["tB"]), datetime.fromisoformat(v["ko"]))
            self.assertGreater(datetime.fromisoformat(v["tB_errato"]), datetime.fromisoformat(v["ko"]))


if __name__ == "__main__":
    unittest.main()
