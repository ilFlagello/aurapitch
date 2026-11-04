"""Test dell'agente "bookmaker esperti" (esperti.py): python3 -m unittest discover -s test"""
import os
import random
import sys
import unittest

RADICE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RADICE)
import esperti as E  # noqa: E402


def evento(pin=(2.0, 3.4, 3.9), altro=(2.1, 3.3, 3.6)):
    def bk(chiave, q):
        return {"key": chiave, "markets": [{"key": "h2h", "outcomes": [{"name": "Casa", "price": q[0]}, {"name": "Draw", "price": q[1]}, {"name": "Ospite", "price": q[2]}]},
                                           {"key": "totals", "outcomes": [{"name": "Over", "point": 2.5, "price": 1.9}, {"name": "Under", "point": 2.5, "price": 1.95}]}]}
    return {"home_team": "Casa", "away_team": "Ospite", "bookmakers": [bk("pinnacle", pin), bk("williamhill", altro), bk("betfair_ex_eu", altro)]}


def diario(n, meglio, seme=3):
    """Partite finite: la verita e la probabilita di Pinnacle; la media e "sporcata". meglio=False: Pinnacle e quello sporcato."""
    rnd = random.Random(seme)
    out = []
    for i in range(n):
        v = [rnd.uniform(0.3, 0.6)]
        v += [rnd.uniform(0.2, 0.3)]
        v.append(1 - sum(v))
        sp = [max(0.02, x + rnd.uniform(-0.12, 0.12)) for x in v]
        sp = [x / sum(sp) for x in sp]
        r = rnd.random()
        e = 0 if r < v[0] else 1 if r < v[0] + v[1] else 2
        g = [[1, 0], [1, 1], [0, 1]][e]
        pin, med = (v, sp) if meglio else (sp, v)
        out.append({"st": "FT", "g": g, "ko": f"2026-11-{1 + i % 28:02d}T{i % 24:02d}:00", "be": {"m": med + [None], "e": pin + [None], "pin": pin + [None]}})
    return out


class TestEsperti(unittest.TestCase):
    def test_riassunto_solo_candidati_senza_margine(self):
        r = E.riassunto(evento())
        self.assertIn("pin_1", r)
        self.assertIn("bfx_1", r)
        self.assertFalse(any(k.startswith("williamhill") for k in r))
        self.assertAlmostEqual(r["pin_1"] + r["pin_X"] + r["pin_2"], 1, places=3)
        self.assertTrue(0.4 < r["pin_O"] < 0.6)

    def test_da_riga_e_miscela(self):
        r = {f"oa_{k}": v for k, v in E.riassunto(evento()).items()}
        mk, mo = [0.45, 0.29, 0.26], 0.5
        be = E.da_riga(r, mk, mo, 1.0)
        self.assertEqual(be["m"], mk + [mo])
        self.assertEqual(be["e"][:3], be["pin"][:3])  # peso 1: solo Pinnacle
        be0 = E.da_riga(r, mk, mo, 0.0)
        self.assertAlmostEqual(sum(be0["e"][:3]), 1, places=3)
        for a, b in zip(be0["e"][:3], mk):
            self.assertAlmostEqual(a, b, places=3)  # peso 0: la media
        self.assertIsNone(E.da_riga({}, mk, mo))  # senza candidati nulla

    def test_applica_solo_se_acceso(self):
        r = {f"oa_{k}": v for k, v in E.riassunto(evento()).items()}
        mk = [0.45, 0.29, 0.26]
        q = {"mk": list(mk), "mo": 0.5, "be": E.da_riga(r, mk, 0.5, 1.0)}
        self.assertEqual(E.applica(dict(q), {})["mk"], mk)
        self.assertEqual(E.applica(dict(q), {"esperti": {"attivo": True}})["mk"], q["be"]["e"][:3])

    def test_decidi_in_ombra_con_poche_partite(self):
        a, mot = E.decidi(E.misura_diario(diario(100, True)))
        self.assertFalse(a)
        self.assertIn("in ombra", mot)

    def test_decidi_acceso_se_migliora_e_spento_se_no(self):
        a, _ = E.decidi(E.misura_diario(diario(1500, True)))
        self.assertTrue(a)
        b, mot = E.decidi(E.misura_diario(diario(1500, False)), prima=True)
        self.assertFalse(b)
        self.assertIn("spenta", mot)

    def test_misura_archivio(self):
        path = os.path.join(RADICE, "storico", "fd_partite.csv.gz")
        if not os.path.exists(path):
            self.skipTest("archivio non presente")
        r = E.misura_archivio(path)
        self.assertGreater(r["prova"], 1000)
        self.assertIn(r["peso_pinnacle"], [round(0.05 * k, 2) for k in range(21)])
        # alla chiusura le quote sono piu precise che prima (lezione misurata)
        self.assertLess(r["chiusura"]["media_chiusura"], r["chiusura"]["media_prima"])


if __name__ == "__main__":
    unittest.main()
