"""Classifiche della fase a campionato di Europa e Conference League (ESPN) con i nomi delle partite dell'app.
python3 -m unittest discover -s test"""
import os
import sys
import unittest

RADICE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RADICE)
import espn_dati as ES  # noqa: E402
import genera_app as G  # noqa: E402

NOMI_APP = {"Ferencváros TC", "Union Saint-Gilloise", "Sparta Prague", "PFC Levski Sofia", "Olympiakos Piraeus", "Omonoia",
            "Milan", "Crystal Palace", "Salzburg", "Sporting Braga", "Sporting CP", "Rennes"}


class ClassificheCoppe(unittest.TestCase):
    def test_coppe_con_classifica(self):
        self.assertEqual(ES.CLASSIFICHE_COPPE, ("EL", "ECL"))
        for k in ES.CLASSIFICHE_COPPE:
            self.assertIn(k, ES.ESPN_LG)
            self.assertIn(k, ES.COPPE)
            self.assertIsNone(next(lg for lg in G.LEAGUES if lg[0] == k)[4])  # niente football-data.org: la classifica viene da ESPN

    def test_nomi_espn_verso_app(self):
        casi = {("Ferencvaros", "Ferencvaros"): "Ferencváros TC", ("Union SG", "Union St.-Gilloise"): "Union Saint-Gilloise",
                ("Sparta", "Sparta Prague"): "Sparta Prague", ("Levski Sofia", "Levski Sofia"): "PFC Levski Sofia",
                ("Olympiacos", "Olympiacos"): "Olympiakos Piraeus", ("Omonia", "Omonia Nicosia"): "Omonoia",
                ("C Palace", "Crystal Palace"): "Crystal Palace", ("RB Salzburg", "RB Salzburg"): "Salzburg"}
        for varianti, atteso in casi.items():
            self.assertEqual(G.nome_unico(NOMI_APP, list(varianti)), atteso, varianti)

    def test_pari_merito_o_lontano_nessun_nome(self):
        self.assertIsNone(G.nome_unico(NOMI_APP, ["Sporting", "Sporting"]))  # Braga o Lisbona: meglio nessun abbinamento
        self.assertIsNone(G.nome_unico(NOMI_APP, ["Ajax", "Ajax Amsterdam"]))
        self.assertIsNone(G.nome_unico(set(), ["Milan"]))


if __name__ == "__main__":
    unittest.main()
