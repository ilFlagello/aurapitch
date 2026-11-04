"""Gol attesi con la linea Over/Under ESPN (es. 3,5) quando manca la 2,5: la correzione degli specialisti non deve buttarla via (#66).
python3 -m unittest discover -s test"""
import os
import sys
import unittest
from datetime import datetime, timedelta, timezone
from unittest import mock

RADICE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RADICE)
import genera_app as G  # noqa: E402
import mercati as M  # noqa: E402
import specialisti as SP  # noqa: E402

MK = [0.80, 0.13, 0.07]  # favorita netta, come Chelsea-Everton femminile
MO_L = 0.48  # Over 3,5 senza margine
# integratore come dal 3/11: 1X2 spento (B a zero), correzione Over/Under attiva nel gruppo "altri"
INTEG = {"gruppi": {"altri": {"attivo": True, "mu": [0.0] * len(SP.NOMI), "sd": [1.0] * len(SP.NOMI),
                              "B": [[0.0, 0.0, 0.0] for _ in SP.NOMI], "b_ou": [0.1] * len(SP.NOMI)}}}
SP_VAL = [0.5] * len(SP.NOMI)


class LineaEspn(unittest.TestCase):
    def test_gol_da_quote(self):
        self.assertEqual(G.gol_da_quote(MK, None, MO_L, 3.5), M.gol_attesi(MK, MO_L, 3.5))
        self.assertEqual(G.gol_da_quote(MK, 0.6, MO_L, 3.5), M.gol_attesi(MK, 0.6))  # la 2,5 vera vince
        self.assertEqual(G.gol_da_quote(MK, None), M.gol_attesi(MK, None))
        self.assertGreater(sum(G.gol_da_quote(MK, None, MO_L, 3.5)), 3.2)

    def test_correzione_non_butta_la_linea(self):
        mkc, moc = SP.correggi(MK, None, SP_VAL, "WSL", INTEG)
        self.assertIsNot(mkc, MK)  # e proprio il caso dell'errore: oggetto nuovo anche se l'1X2 non cambia
        self.assertIsNone(moc)
        base = sum(G.gol_da_quote(mkc, moc, MO_L, 3.5))
        mercato = sum(G.gol_da_quote(MK, None, MO_L, 3.5))
        self.assertLess(abs(base - mercato), 0.05)
        self.assertGreater(mercato - sum(M.gol_attesi(mkc, moc)), 0.3)  # prima della correzione si perdevano piu di 0,3 gol

    def test_prepartita_tiene_la_linea(self):
        ko = datetime.now(timezone.utc) + timedelta(hours=1)
        m = {"id": "WSL-1", "lg": "WSL", "st": "NS", "h": "A", "a": "B", "ko": ko.isoformat(), "mk": MK, "mo": 0.54, "odds": {}, "max": {}, "nb": None,
             "sp": SP_VAL, "_ctx": {"ol": [MO_L, 3.5], "raccolte": {}}}
        riga = {"id": "WSL-1", "t": (ko - timedelta(minutes=45)).isoformat(), "oa_quota_media_1": "1.13", "oa_quota_media_X": "7.5", "oa_quota_media_2": "12",
                "linea": "3.5", "oa_quota_media_Over L": "1.95", "oa_quota_media_Under L": "1.80"}
        with mock.patch.object(G, "jload", side_effect=lambda p, d=None: [riga] if p.endswith("prepartita.json") else d), \
                mock.patch.object(G.CB, "modello", return_value={"integratore": INTEG}):
            self.assertEqual(G.aggiorna_prepartita({"matches": [m]}), 1)
        self.assertGreater(sum(m["xg_mercato"]), 3.0)
        self.assertLess(abs(sum(m["xg_base"]) - sum(m["xg_mercato"])), 0.05)
        self.assertIn("O3.5", m["_ctx"]["raccolte"])
        self.assertEqual(m["_ctx"]["ol"][1], 3.5)

    def test_prepartita_senza_linea_usa_quella_del_mattino(self):
        ko = datetime.now(timezone.utc) + timedelta(hours=1)
        m = {"id": "WSL-2", "lg": "WSL", "st": "NS", "h": "A", "a": "B", "ko": ko.isoformat(), "mk": MK, "mo": 0.54, "odds": {}, "max": {}, "nb": None,
             "sp": SP_VAL, "_ctx": {"ol": [MO_L, 3.5], "raccolte": {}}}
        riga = {"id": "WSL-2", "t": (ko - timedelta(minutes=45)).isoformat(), "oa_quota_media_1": "1.13", "oa_quota_media_X": "7.5", "oa_quota_media_2": "12"}
        with mock.patch.object(G, "jload", side_effect=lambda p, d=None: [riga] if p.endswith("prepartita.json") else d), \
                mock.patch.object(G.CB, "modello", return_value={"integratore": INTEG}):
            G.aggiorna_prepartita({"matches": [m]})
        self.assertGreater(sum(m["xg_mercato"]), 3.0)


if __name__ == "__main__":
    unittest.main()
