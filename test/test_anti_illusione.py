"""Test dell'agente anti-illusione (anti_illusione.py): python3 -m unittest discover -s test"""
import math
import os
import random
import sys
import unittest
from datetime import date, timedelta

RADICE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RADICE)
import anti_illusione as AI  # noqa: E402
import ciclo as CI  # noqa: E402
import specialisti as SP  # noqa: E402

OGGI = "2026-11-20"
DAL = "2026-10-20"


def giorni(n, da=DAL):
    d0 = date.fromisoformat(da)
    return [(d0 + timedelta(days=1 + i % 28)).isoformat() for i in range(n)]


def diario_fasce(n, spinta, seme=5):
    """L'IA dice p (60-70%) e prima del fischio la ritaratura aggiunge 4 punti; succede con frequenza p + spinta."""
    rnd = random.Random(seme)
    out = []
    for d in giorni(n):
        p = rnd.uniform(0.61, 0.65)
        h = 2 if rnd.random() < p + spinta else 0
        out.append({"lg": "I1", "date": d, "ko": d + "T18:00", "t0": d + "T08:00", "st": "FT", "g": [h, 1 if h == 0 else 0], "pc": {"1": p + 0.04}})
    return out


def gruppo(w):
    k = len(SP.NOMI)
    B = [[0.0, 0.0, 0.0] for _ in range(k)]
    B[0] = [w, 0.0, -w]
    return {"attivo": True, "mu": [0.0] * k, "sd": [1.0] * k, "B": B, "b_ou": None}


def diario_integ(n, vero, seme=7):
    """Lo specialista 0 sposta davvero l'esito di "vero" (in log): l'integratore con w = vero aiuta, con w sbagliato no."""
    rnd = random.Random(seme)
    out = []
    for d in giorni(n):
        z = rnd.gauss(0, 1)
        mk = [0.45, 0.28, 0.27]
        lg = [math.log(mk[0]) + vero * z, math.log(mk[1]), math.log(mk[2]) - vero * z]
        e = [math.exp(x) for x in lg]
        p = [x / sum(e) for x in e]
        r = rnd.random()
        g = [1, 0] if r < p[0] else [1, 1] if r < p[0] + p[1] else [0, 1]
        out.append({"lg": "I1", "date": d, "ko": d + "T18:00", "st": "FT", "g": g, "mk": mk, "mo": None, "sp": [z] + [None] * (len(SP.NOMI) - 1),
                    "pc": {"1": p[0], "X": p[1], "2": p[2]}})
    return out


class TestAntiIllusione(unittest.TestCase):
    def test_fasce_spenta_se_non_aiuta_piu(self):
        attivo = {"fasce": {"6": 0.04}, "fasce_storia": {DAL: {"6": 0.04}, OGGI: {"6": 0.04}}}
        att, stato, rap, motivi = AI.controlla(attivo, {}, diario_fasce(5000, 0.0), OGGI)
        self.assertNotIn("fasce", att)
        self.assertEqual(att["fasce_storia"][OGGI], {})
        self.assertIn("fasce", stato["pause"])
        self.assertIn("anti-illusione", motivi["fasce"])
        # la voce in "cambi" arriva da ciclo.eventi con il motivo dell'anti-illusione
        ev = CI.eventi({"fasce": {"6": 0.04}}, att, OGGI, motivi)
        self.assertTrue(any("Tolta la ritaratura" in e["cosa"] and "anti-illusione" in e["perche"] for e in ev))

    def test_fasce_resta_se_aiuta(self):
        attivo = {"fasce": {"6": 0.04}, "fasce_storia": {DAL: {"6": 0.04}, OGGI: {"6": 0.04}}}
        att, stato, rap, motivi = AI.controlla(attivo, {}, diario_fasce(5000, 0.05), OGGI)
        self.assertIn("fasce", att)
        self.assertFalse(motivi)
        r = next(x for x in rap["voci"] if x["voce"] == "fasce")
        self.assertEqual(r["stato"], "aiuta")
        self.assertEqual(r["dal"], DAL)  # l'accensione vera viene da fasce_storia
        self.assertGreater(r["guadagno"], 0)

    def test_in_pausa_resta_spento(self):
        attivo = {"fasce": {"6": 0.04}, "fasce_storia": {OGGI: {"6": 0.04}}}
        att, stato, rap, _ = AI.controlla(attivo, {"pause": {"fasce": "2026-11-30"}}, [], OGGI)
        self.assertNotIn("fasce", att)
        self.assertEqual(rap["voci"][0]["stato"], "in pausa")
        att2, stato2, _, _ = AI.controlla({"fasce": {"6": 0.04}}, {"pause": {"fasce": "2026-11-19"}}, [], OGGI)  # pausa finita
        self.assertIn("fasce", att2)
        self.assertNotIn("fasce", stato2["pause"])

    def test_registro_congela_e_aspetta(self):
        attivo = {"integratore": {"specialisti": SP.NOMI, "gruppi": {"principali": gruppo(0.3)}}}
        att, stato, rap, motivi = AI.controlla(attivo, {}, diario_integ(400, 0.0), OGGI)
        rec = stato["registro"]["integratore:principali"]
        self.assertEqual(rec["dal"], OGGI)  # acceso oggi: le partite di prima non contano
        self.assertEqual(rec["param"]["B"][0], [0.3, 0.0, -0.3])
        self.assertEqual(rap["voci"][0]["stato"], "in verifica")
        self.assertTrue(att["integratore"]["gruppi"]["principali"]["attivo"])

    def test_integratore_spento_o_tenuto(self):
        stato = {"registro": {"integratore:principali": {"dal": DAL, "param": gruppo(0.3)}}}
        attivo = {"integratore": {"specialisti": SP.NOMI, "gruppi": {"principali": gruppo(0.3)}}}
        att, st, rap, motivi = AI.controlla(attivo, stato, diario_integ(800, 0.3), OGGI)
        self.assertTrue(att["integratore"]["gruppi"]["principali"]["attivo"])
        self.assertEqual(rap["voci"][0]["stato"], "aiuta")
        attivo = {"integratore": {"specialisti": SP.NOMI, "gruppi": {"principali": gruppo(0.3)}}}
        att, st, rap, motivi = AI.controlla(attivo, stato, diario_integ(800, 0.0), OGGI)
        self.assertFalse(att["integratore"]["gruppi"]["principali"]["attivo"])
        self.assertIn("integratore:principali", st["pause"])
        self.assertIn("integratore", motivi)

    def test_ridotti_ripristinati(self):
        g = gruppo(0.15)  # peso dimezzato rispetto al vero (0,3): ridurlo fa male
        attivo = {"integratore": {"specialisti": SP.NOMI, "gruppi": {"principali": g}, "ridotti": {SP.NOMI[0]: 0.5}}}
        stato = {"registro": {"ridotti": {"dal": DAL, "param": AI.accese(attivo)["ridotti"]}, "integratore:principali": {"dal": DAL, "param": gruppo(0.15)}}}
        att, st, rap, motivi = AI.controlla(attivo, stato, diario_integ(1500, 0.3), OGGI)
        self.assertNotIn("ridotti", att["integratore"])
        self.assertAlmostEqual(att["integratore"]["gruppi"]["principali"]["B"][0][0], 0.3)
        self.assertIn("ridotti_tolti", motivi)

    def test_peso_ia_dalle_probabilita_senza(self):
        d = diario_fasce(400, 0.0)
        for v in d:  # "senza peso" = la probabilita vera, "con peso" = esagerata: il peso non aiuta
            v["sz"] = {"peso_ia": [v["pc"]["1"] - 0.04, None, None, None, None]}
        stato = {"registro": {"peso_ia": {"dal": DAL, "param": {"Esito finale": 0.4}}}}
        att, st, rap, motivi = AI.controlla({"peso_ia": {"Esito finale": 0.4}}, stato, d, OGGI)
        self.assertNotIn("peso_ia", att)
        self.assertIn("peso_ia", motivi)
        ev = CI.eventi({"peso_ia": {"Esito finale": 0.4}}, att, OGGI, motivi)
        self.assertTrue(any("anti-illusione" in e["perche"] for e in ev))

    def test_affidabilita_campionati(self):
        d = diario_fasce(600, 0.04, seme=9) + diario_fasce(600, -0.2, seme=10)  # T1 onesto, gli altri no
        for i, v in enumerate(d):
            v["lg"] = "T1" if i < 600 else "I1"
        stato = {"registro": {"affid_lg": {"dal": DAL, "param": {"T1": 0.8}}}}
        att, st, rap, motivi = AI.controlla({"affid_lg": {"T1": 0.8}}, stato, d, OGGI)  # T1 non e meno onesto degli altri
        self.assertNotIn("affid_lg", att)
        self.assertIn("affid_lg", motivi)

    def test_riassunto(self):
        self.assertEqual(AI.riassunto({}), "nessun miglioramento acceso")
        t = AI.riassunto({"voci": [{"nome": "X", "stato": "aiuta", "partite": 200, "minimo": 150, "guadagno": 0.1}, {"nome": "Y", "stato": "in pausa", "fino": "2026-12-01"}]})
        self.assertIn("+0,10%", t)
        self.assertIn("in pausa", t)


if __name__ == "__main__":
    unittest.main()
