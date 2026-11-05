"""Lettura delle fotografie delle quote: una sola riga per partita, quella con le quote (4/11: Fenerbahce-Liverpool
spariva dall'app e PSV-Brugge compariva due volte). python3 -m unittest discover -s test"""
import csv
import os
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from unittest import mock

RADICE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RADICE)
import genera_app as G  # noqa: E402

CAMPI = ["campionato", "casa", "ospite", "inizio", "oa_quota_media_1", "oa_quota_media_X", "oa_quota_media_2"]


def riga(camp, casa, osp, inizio, q=True):
    return {"campionato": camp, "casa": casa, "ospite": osp, "inizio": inizio,
            "oa_quota_media_1": "2.1" if q else "", "oa_quota_media_X": "3.4" if q else "", "oa_quota_media_2": "3.5" if q else ""}


class CaricaQuote(unittest.TestCase):
    def carica(self, giorni):
        with tempfile.TemporaryDirectory() as d:
            for g, righe in giorni.items():
                os.makedirs(os.path.join(d, g))
                with open(os.path.join(d, g, "partite.csv"), "w", encoding="utf-8", newline="") as f:
                    w = csv.DictWriter(f, CAMPI)
                    w.writeheader()
                    w.writerows(righe)
            with mock.patch.object(G, "DATA", d):
                return sorted(G.carica_quote(), key=lambda r: (r["_t"], r["casa"]))

    def test_riga_senza_quote_non_copre_quella_con_le_quote(self):
        out = self.carica({"2026-11-03": [riga("Champions League", "Fenerbahce", "Liverpool", "2026-11-04T17:45:00Z")],
                           "2026-11-04": [riga("Champions League", "Fenerbahçe", "Liverpool", "2026-11-04T18:45:00+01:00", q=False)]})
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0]["_foto"], "2026-11-03")
        self.assertTrue(G.ha_quote_1x2(out[0]))

    def test_nomi_diversi_stessa_partita(self):
        out = self.carica({"2026-11-03": [riga("Champions League", "PSV Eindhoven", "Club Brugge", "2026-11-04T20:00:00Z"),
                                          riga("Champions League", "AEK Athens", "Real Madrid", "2026-11-04T17:45:00Z")],
                           "2026-11-04": [riga("Champions League", "PSV Eindhoven", "Club Brugge KV", "2026-11-04T21:00:00+01:00"),
                                          riga("Champions League", "PAE AEK", "Real Madrid", "2026-11-04T18:45:00+01:00")]})
        self.assertEqual(len(out), 2)
        self.assertTrue(all(r["_foto"] == "2026-11-04" for r in out))  # la piu recente con le quote

    def test_orario_spostato(self):
        out = self.carica({"2026-10-29": [riga("Primera Nacional", "San Martín (Tucumán)", "Colegiales", "2026-10-31T18:00:00Z")],
                           "2026-10-30": [riga("Primera Nacional", "San Martín (Tucumán)", "Colegiales", "2026-11-01T21:30:00Z")]})
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0]["_t"], datetime(2026, 11, 1, 21, 30, tzinfo=timezone.utc))

    def test_squadre_diverse_restano_separate(self):
        out = self.carica({"2026-10-30": [riga("A-League", "Melbourne City FC", "Sydney FC", "2026-10-31T06:00:00Z"),
                                          riga("A-League", "Macarthur FC", "Western Sydney Wanderers FC", "2026-10-31T08:40:00Z"),
                                          riga("Primera Nacional", "San Martín (Tucumán)", "Colegiales", "2026-10-31T18:00:00Z"),
                                          riga("Primera Nacional", "San Martín (San Juan)", "Gimnasia y Esgrima (Jujuy)", "2026-10-31T18:00:00Z")]})
        self.assertEqual(len(out), 4)

    def test_fotografia_dopo_la_partita_ignorata(self):
        out = self.carica({"2026-11-01": [riga("Serie A", "Inter", "Milan", "2026-11-02T19:45:00Z")],
                           "2026-11-03": [riga("Serie A", "Inter", "Milan", "2026-11-02T19:45:00Z")]})
        self.assertEqual([r["_foto"] for r in out], ["2026-11-01"])


if __name__ == "__main__":
    unittest.main()
