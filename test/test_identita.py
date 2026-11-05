"""Identita unica delle squadre (Blocco 5, passo 2): nomi, id ESPN, archivio cercato nel paese giusto, storia di tutte le
competizioni, classifica del campionato anche in coppa. Casi veri del 4-5/11 (Milan-Ferencvaros, Celtic, Chelsea femminile,
Santos Laguna, Red Bull New York, Racing Genk, Real Sociedad II)."""
import os
import sys
import unittest
from datetime import datetime, timedelta, timezone

RADICE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RADICE)
os.chdir(RADICE)
import espn_dati as ES  # noqa: E402
import genera_app as GA  # noqa: E402
import identita as ID  # noqa: E402

ARCHIVIO = {
    "I1": {"Milan", "Inter", "Napoli", "Verona"}, "I2": {"Venezia", "Sudtirol"},
    "MX1": {"Santos Laguna", "Club Leon", "Club America", "Atl. San Luis"}, "BR1": {"Santos", "Flamengo", "Athletico-PR"},
    "MLS": {"New York Red Bulls", "New York City", "St. Louis City", "DC United", "Atlanta Utd"},
    "EC": {"York", "Barnet"}, "E0": {"Chelsea", "Man United", "Man City", "Nott'm Forest", "West Ham"}, "E1": {"Preston", "Leeds"},
    "B1": {"Genk", "Club Brugge", "Cercle Brugge", "St Truiden", "Oud-Heverlee Leuven"}, "AR1": {"Racing Club", "Estudiantes L.P.", "Estudiantes Rio Cuarto", "Gimnasia L.P.", "Gimnasia Mendoza"},
    "SP1": {"Sociedad", "Ath Bilbao", "Ath Madrid", "Barcelona", "Espanol"}, "SP2": {"Sociedad B", "Sp Gijon"},
    "J1": {"Verdy", "FC Tokyo", "Urawa Reds"}, "DK1": {"FC Copenhagen", "Brondby", "Nordsjaelland", "Aarhus"},
    "SC0": {"Celtic", "Kilmarnock", "Hearts"}, "N1": {"Ajax", "For Sittard"},
}


def t(g, h=18):
    return datetime(2026, 11, 1, h, tzinfo=timezone.utc) + timedelta(days=g)


class TestNomi(unittest.TestCase):
    def test_piega_lettere_nordiche(self):
        self.assertEqual(ID.piega("F.C. København"), "f c kobenhavn")
        self.assertEqual(ID.piega("Brøndby IF"), "brondby if")
        self.assertEqual(ID.piega("Nordsjælland"), "nordsjaelland")
        self.assertEqual(ID.piega("Newell's Old Boys"), "newells old boys")

    def test_abbinamenti_giusti(self):
        casi = [("Estudiantes de La Plata", "AR1", "Estudiantes L.P."), ("Gimnasia La Plata", "AR1", "Gimnasia L.P."),
                ("Atlético de San Luis", "MX1", "Atl. San Luis"), ("Santos", "MX1", "Santos Laguna"), ("Santos", "BR1", "Santos"),
                ("Red Bull New York", "MLS", "New York Red Bulls"), ("D.C. United", "MLS", "DC United"), ("Atlanta United", "MLS", "Atlanta Utd"),
                ("Racing Genk", "B1", "Genk"), ("Sint-Truidense", "B1", "St Truiden"), ("OH Leuven", "B1", "Oud-Heverlee Leuven"),
                ("Real Sociedad II", "SP2", "Sociedad B"), ("Real Sociedad", "SP1", "Sociedad"), ("Athletic", "SP1", "Ath Bilbao"),
                ("Atleti", "SP1", "Ath Madrid"), ("Barça", "SP1", "Barcelona"), ("Espanyol", "SP1", "Espanol"),
                ("Tokyo Verdy", "J1", "Verdy"), ("Urawa Red Diamonds", "J1", "Urawa Reds"), ("F.C. København", "DK1", "FC Copenhagen"),
                ("Brøndby IF", "DK1", "Brondby"), ("Nordsjælland", "DK1", "Nordsjaelland"), ("AGF", "DK1", "Aarhus"),
                ("Preston North End", "E1", "Preston"), ("Nottingham", "E0", "Nott'm Forest"), ("Manchester United", "E0", "Man United"),
                ("Heart of Midlothian", "SC0", "Hearts"), ("Fortuna Sittard", "N1", "For Sittard"), ("Hellas Verona", "I2", "Verona"),
                ("Cercle Brugge KSV", "B1", "Cercle Brugge"), ("Sporting Gijón", "SP2", "Sp Gijon")]
        for nome, k, atteso in casi:
            with self.subTest(nome=nome, k=k):
                self.assertEqual(ID.nome_archivio(nome, k, ARCHIVIO), atteso)

    def test_mai_un_altra_squadra(self):
        """Errori silenziosi del metodo di prima: meglio nessun dato che i numeri di un'altra squadra."""
        casi = [("Louisville City", "USL"), ("Leones Negros", "MX2"), ("Chelsea", "WSL"), ("Manchester City", "UWCL"),
                ("Jong Ajax", "N2"), ("Liverpool U21", "EFT"), ("Athletic", "BR2"), ("Jaguares de Córdoba", "COL1"),
                ("Inter Kashi", "IN1"), ("América de Cali", "COL1"), ("Newcastle Jets", "AU1")]
        for nome, k in casi:
            with self.subTest(nome=nome, k=k):
                self.assertIsNone(ID.nome_archivio(nome, k, ARCHIVIO))

    def test_coppa_usa_il_campionato_della_squadra(self):
        self.assertEqual(ID.nome_archivio("Milan", "EL", ARCHIVIO, casa="I1"), "Milan")
        self.assertEqual(ID.nome_archivio("Celtic", "EL", ARCHIVIO, casa="SC0"), "Celtic")
        self.assertIsNone(ID.nome_archivio("Ferencvaros", "EL", ARCHIVIO, casa=None))  # ESPN non ha il campionato ungherese

    def test_ambiguo_niente(self):
        self.assertIsNone(ID.migliore("Estudiantes", [("a", ["Estudiantes L.P."]), ("b", ["Estudiantes Rio Cuarto"])]))

    def test_id_espn(self):
        lista = [{"id": "103", "displayName": "AC Milan", "shortDisplayName": "Milan"}, {"id": "110", "displayName": "Internazionale", "shortDisplayName": "Inter"},
                 {"id": "363", "displayName": "Chelsea"}, {"id": "360", "displayName": "Manchester United", "shortDisplayName": "Man United"}]
        self.assertEqual(ID.id_espn("Milan", lista), "103")
        self.assertEqual(ID.id_espn("Inter", lista), "110")
        self.assertEqual(ID.id_espn("Man United", lista), "360")
        self.assertIsNone(ID.id_espn("Leeds United", lista))  # "United" in comune non basta

    def test_campionato_dalla_storia(self):
        storia = [{"lg": "ita.1"}] * 10 + [{"lg": "uefa.europa"}] * 3 + [{"lg": "club.friendly"}] * 4
        da_slug = {v: k for k, v in ES.ESPN_LG.items()}
        self.assertEqual(ID.campionato_di(storia, da_slug, ES.COPPE), "I1")
        self.assertIsNone(ID.campionato_di([{"lg": "uefa.europa"}, {"lg": "uefa.europa_qual"}], da_slug, ES.COPPE))

    def test_unisci_senza_doppioni(self):
        fd = [{"t": t(-4), "avv": "Inter", "casa": True, "gf": 3, "gs": 1, "gf1": 1, "gs1": 0}]
        es = [{"t": t(-4, 19), "avv": "Internazionale", "casa": True, "gf": 3, "gs": 1}, {"t": t(-1), "avv": "Ferencvaros", "casa": True, "gf": 2, "gs": 0}]
        u = ID.unisci(fd, es)
        self.assertEqual(len(u), 2)
        self.assertIn("gf1", u[0])  # la partita di football-data.org (con il primo tempo) vince
        self.assertEqual(u[-1]["avv"], "Ferencvaros")


class TestRaccoltaESPN(unittest.TestCase):
    def test_storia_senza_amichevoli_e_risultati_di_prima(self):
        def ev(i, slug, giorno, gf, gs):
            return {"id": str(i), "date": t(giorno).isoformat(), "league": {"slug": slug}, "competitions": [{"status": {"type": {"state": "post"}}, "competitors": [
                {"homeAway": "home", "team": {"id": "103", "displayName": "AC Milan"}, "score": {"value": gf}},
                {"homeAway": "away", "team": {"id": str(900 + i), "displayName": f"Avversario {i}", "shortDisplayName": f"Avv {i}"}, "score": {"value": gs}}]}]}
        risposta = {"events": [ev(1, "ita.1", -10, 2, 0), ev(2, "club.friendly", -9, 5, 0), ev(3, "uefa.europa", -7, 1, 1), ev(4, "ita.1", -4, 3, 1)]}
        vecchio_get = ES.get
        ES.get = lambda url: risposta
        try:
            tutte, _ = ES.storia_squadra("103")
        finally:
            ES.get = vecchio_get
        self.assertEqual([r["lg"] for r in tutte], ["ita.1", "uefa.europa", "ita.1"])  # niente amichevole
        self.assertEqual([r["eid"] for r in tutte if r["lg"] == "ita.1"], ["1", "4"])  # i "risultati" del campionato di sempre
        c = ES.compatta(tutte)
        self.assertEqual(c[-1][1:], [1, "Avv 4", 3, 1, "ita.1"])


def esd_finto():
    """Dati ESPN come li salva il nuovo giro: elenchi con id, storia di tutte le competizioni, classifiche con id."""
    storia_milan = [[t(-14).isoformat(), 1, "Lecce", 2, 0, "ita.1"], [t(-10).isoformat(), 1, "Benfica", 1, 1, "uefa.europa"],
                    [t(-7).isoformat(), 0, "Roma", 1, 0, "ita.1"], [t(-4).isoformat(), 0, "Torino", 3, 2, "ita.1"], [t(-2).isoformat(), 1, "Inter", 0, 0, "ita.1"]]
    storia_fer = [[t(-10).isoformat(), 0, "Celtic", 0, 1, "uefa.europa"], [t(-30).isoformat(), 1, "Sparta", 2, 0, "uefa.europa_qual"]]
    return {"colori": {"EL": [{"id": "103", "displayName": "AC Milan", "shortDisplayName": "Milan"}, {"id": "622", "displayName": "Ferencvaros"}],
                       "I1": [{"id": "103", "displayName": "AC Milan", "shortDisplayName": "Milan"}, {"id": "110", "displayName": "Internazionale"}],
                       "SC0": [{"id": "256", "displayName": "Celtic"}, {"id": "260", "displayName": "Kilmarnock"}]},
            "storia": {"103": storia_milan, "622": storia_fer},
            "classifiche": {"EL": [{"team": "Ferencvaros", "id": "622", "rank": 7, "pt": 7, "pg": 3}, {"team": "Milan", "id": "103", "rank": 12, "pt": 6, "pg": 3}]}}


class TestRiposo(unittest.TestCase):
    def test_testo(self):
        self.assertIn("Milan: 4 giorni di riposo", GA.testo_riposo("Milan", "Ferencvaros", 4, None)["text"])
        self.assertIn("Per Milan non disponibili", GA.testo_riposo("Milan", "Ferencvaros", None, 14)["text"])
        self.assertIn("ha 3 giorni di riposo in più", GA.testo_riposo("A", "B", 7, 4)["text"])


class TestIdentitaApp(unittest.TestCase):
    def setUp(self):
        fdp = {1: {"id": 1, "_code": "SA", "utcDate": t(-4).isoformat(), "status": "FINISHED", "homeTeam": {"id": 586, "name": "Torino FC", "shortName": "Torino"},
                   "awayTeam": {"id": 98, "name": "AC Milan", "shortName": "Milan"}, "score": {"fullTime": {"home": 2, "away": 3}, "halfTime": {"home": 1, "away": 1}}}}
        classifiche = {"SA": {"TOTAL": [{"team": {"id": 113}, "position": 1, "points": 25, "playedGames": 10}, {"team": {"id": 98}, "position": 3, "points": 22, "playedGames": 10}]}}
        self.ids = GA.Identita(esd_finto(), fdp, classifiche, ARCHIVIO)

    def test_milan_in_europa_league_ha_tutte_le_competizioni(self):
        i = self.ids.chi("Milan", "EL")
        self.assertEqual(i["es"], "103")
        self.assertEqual(i["fd"], 98)  # lo stesso club di football-data.org
        self.assertEqual(i["casa"], "I1")
        self.assertEqual(i["arch"], "Milan")
        ko = t(0, 20)
        storia = [z for z in i["storia"] if z["t"] < ko]
        self.assertEqual(len(storia), 5)  # Serie A ed Europa League; la partita di Torino una volta sola (con il primo tempo)
        self.assertEqual(sum(1 for z in storia if z.get("gf1") is not None), 1)
        self.assertEqual(GA.riposo({"x": storia}, "x", ko), 2)  # dalla partita di campionato del weekend, non dall'ultima di coppa

    def test_classifica_in_coppa_coppa_piu_campionato(self):
        att = self.ids.attese(self.ids.chi("Milan", "EL"), "EL")
        self.assertIn("Europa League: 12°", att["text"])
        self.assertIn("In Serie A: 3° con 22 punti", att["text"])
        att = self.ids.attese(self.ids.chi("Ferencvaros", "EL"), "EL")
        self.assertIn("Europa League: 7°", att["text"])
        self.assertNotIn("In ", att["text"])  # campionato ungherese non disponibile
        self.assertIsNone(self.ids.chi("Ferencvaros", "EL")["casa"])  # niente campionato: genera non calcola il riposo

    def test_squadra_sconosciuta_niente(self):
        i = self.ids.chi("Squadra Inventata", "SC0")
        self.assertIsNone(i["es"])
        self.assertEqual(i["storia"], [])
        self.assertIsNone(self.ids.attese(i, "SC0"))

    def test_ombra_non_tocca_il_consiglio(self):
        ih, ia = self.ids.chi("Milan", "EL"), self.ids.chi("Ferencvaros", "EL")
        sto = {"h": ih["storia"], "a": ia["storia"]}

        class Motore:
            def caratteristiche(self, h, a, lg, t0):
                return [None] * 7
        o = GA.ombra_identita(ih, ia, sto, t(0, 20), "EL", {}, Motore(), self.ids, [0.1, None])
        self.assertEqual(o["es"], ["103", "622"])
        self.assertEqual(o["sp0"], [0.1, None])
        self.assertEqual(o["pos"], [3, None])
        self.assertEqual(o["n"], [5, 2])
        self.assertNotIn("errore", o)


if __name__ == "__main__":
    unittest.main()
