"""Specialista "notizie dell'ultima ora" (in ombra): assenze e cambi annunciati nelle 6 ore prima del fischio."""
import json
import os
import sys
import tempfile
import unittest

RADICE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RADICE)
os.chdir(RADICE)
import genera_app as GA  # noqa: E402
import specialisti as SP  # noqa: E402

KO = "2026-11-04T19:45:00+00:00"


class TestUltimaOra(unittest.TestCase):
    def test_segno_e_finestra(self):
        f_casa = {"lato": 0, "delta": -0.06, "delta_avv": 0.0, "t": "2026-11-04T18:40:00+00:00"}   # manca l'attaccante di casa, annunciato 65' prima
        f_osp = {"lato": 1, "delta": -0.02, "delta_avv": 0.03, "t": "2026-11-04T16:00:00+00:00"}    # manca un difensore dell'ospite
        vecchia = {"lato": 1, "delta": -0.10, "delta_avv": 0.0, "t": "2026-11-03T10:00:00+00:00"}   # il giorno prima: le quote la sanno gia
        dopo = {"lato": 0, "delta": -0.10, "delta_avv": 0.0, "t": "2026-11-04T20:00:00+00:00"}     # dopo il fischio: non vale
        squal = {"lato": 0, "delta": -0.05, "delta_avv": 0.0, "t": ""}                             # squalifica: nessun orario
        self.assertAlmostEqual(SP.ultima_ora([f_casa], KO), -0.06)  # sfavorisce la casa
        self.assertAlmostEqual(SP.ultima_ora([f_osp], KO), 0.05)  # attacco ospite piu debole e difesa ospite piu debole: favorisce la casa
        self.assertAlmostEqual(SP.ultima_ora([f_casa, f_osp, vecchia, dopo, squal], KO), -0.01)
        self.assertIsNone(SP.ultima_ora([vecchia, squal], KO))  # nessuna notizia recente: nessun dato (non zero)
        self.assertIsNone(SP.ultima_ora([], KO))
        self.assertIsNone(SP.ultima_ora([f_casa], None))

    def test_nei_segnali_e_in_ombra(self):
        v = SP.segnali([], [], None, ultima=0.04)
        self.assertEqual(len(v), len(SP.NOMI))
        self.assertEqual(v[SP.NOMI.index("ultima_ora")], 0.04)
        # integratore allenato prima dello specialista (un valore in meno): niente errori, il valore nuovo non pesa
        n = len(SP.NOMI) - 1
        integ = {"gruppi": {"principali": {"attivo": True, "mu": [0.0] * n, "sd": [1.0] * n, "B": [[0.0, 0.0, 0.0]] * n}}}
        mk = [0.5, 0.3, 0.2]
        mk2, _ = SP.correggi(mk, 0.5, v, "I1", integ)
        for a, b in zip(mk, mk2):
            self.assertAlmostEqual(a, b)

    def test_specialisti_del_giorno(self):
        with tempfile.TemporaryDirectory() as d:
            vecchio = GA.DIARIO
            GA.DIARIO = d
            with open(os.path.join(d, "2026-11-04.json"), "w") as f:
                json.dump({}, f)
            try:
                dd = {"matches": [{"id": "m1", "date": "2026-11-04", "st": "NS", "ko": KO, "mk": [0.5, 0.3, 0.2], "sp": None,
                                   "fattori": [{"lato": 0, "delta": -0.06, "delta_avv": 0.0, "t": "2026-11-04T18:40:00+00:00"}]}]}
                GA.aggiorna_specialisti_giorno(dd)
                sp = dd["matches"][0]["sp"]
                self.assertEqual(len(sp), len(SP.NOMI))
                self.assertAlmostEqual(sp[SP.NOMI.index("ultima_ora")], -0.06)
            finally:
                GA.DIARIO = vecchio


if __name__ == "__main__":
    unittest.main()
