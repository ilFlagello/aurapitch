"""Risultati dei campionati senza football-data (solo calendario ESPN): abbinamento giusto, aggiornamento durante il giorno,
diario e consigli corretti. Nessuna richiesta di rete: il calendario ESPN e finto."""
import json
import os
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone

RADICE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RADICE)
os.chdir(RADICE)
import espn_dati as ES  # noqa: E402
import genera_app as GA  # noqa: E402

ORA = datetime(2026, 11, 3, 20, 0, tzinfo=timezone.utc)


def ev_espn(t, h, a, gh, ga, stato="post", fine=True, nome="STATUS_FULL_TIME", primo=None):
    sq = lambda nome_, gol, lato, pt: {"homeAway": lato, "team": {"displayName": nome_}, "score": str(gol), **({"linescores": [{"value": pt}, {"value": gol - pt}]} if pt is not None else {})}
    return {"date": t, "status": {"type": {"state": stato, "completed": fine, "name": nome}},
            "competitions": [{"competitors": [sq(h, gh, "home", primo[0] if primo else None), sq(a, ga, "away", primo[1] if primo else None)]}]}


GIORNATA_2_11 = [ev_espn("2026-11-02T16:00Z", "Al Sadd", "Al Ahli", 0, 0), ev_espn("2026-11-02T16:00Z", "Al Wasl", "Al-Quwa Al-Jawiya", 4, 3),
                 ev_espn("2026-11-02T18:15Z", "Al Ittihad", "Al Ain", 1, 4, primo=(0, 2)), ev_espn("2026-11-02T18:15Z", "Al-Gharafa", "Al Qadsiah", 0, 5)]


class TestAbbinamento(unittest.TestCase):
    def test_al_non_basta(self):
        evs = [ES.evento(e) for e in GIORNATA_2_11]
        t = datetime(2026, 11, 2, 18, 15, tzinfo=timezone.utc)
        self.assertEqual(ES.evento_vicino(evs, "Al Ittihad", "Al Ain", t)["g"], [1, 4])
        self.assertEqual(ES.evento_vicino(evs, "Al Wasl", "Al-Quwa Al-Jawiya", t - timedelta(hours=2, minutes=15))["g"], [4, 3])
        self.assertEqual(ES.evento_vicino(evs, "Al-Gharafa", "Al Qadsiah", t)["g"], [0, 5])
        self.assertIsNone(ES.evento_vicino(evs, "Al Hilal", "Shabab Al Ahli", t))  # partita non nel calendario: nessun risultato

    def test_primo_tempo_e_rinvio(self):
        e = ES.evento(GIORNATA_2_11[2])
        self.assertEqual(ES.stato_evento(e), ("FT", [1, 4], [0, 2]))
        r = ES.evento(ev_espn("2026-11-02T18:15Z", "A", "B", 0, 0, stato="post", fine=False, nome="STATUS_POSTPONED"))
        self.assertEqual(ES.stato_evento(r)[0], "RINV")
        self.assertEqual(ES.stato_evento(ES.evento(ev_espn("2026-11-02T18:15Z", "A", "B", 1, 0, stato="in", fine=False, nome="STATUS_FIRST_HALF")))[:2], ("LIVE", [1, 0]))

    def test_supplementari(self):
        # coppa d'Olanda: 1-2 dopo i supplementari, 1-1 al 90': i consigli valgono sui 90 minuti
        ev = ev_espn("2026-10-29T19:00Z", "ACV", "AFC", 1, 2, nome="STATUS_FINAL_AET")
        for i, ls in enumerate(([1, 0, 0], [0, 1, 1])):
            ev["competitions"][0]["competitors"][i]["linescores"] = [{"value": v} for v in ls]
        self.assertEqual(ES.stato_evento(ES.evento(ev)), ("FT", [1, 1], [1, 0]))
        senza = ES.evento(ev_espn("2026-10-27T17:45Z", "Excelsior '31", "ADO Den Haag", 1, 1, nome="STATUS_FINAL_PEN"))
        self.assertEqual(ES.stato_evento(senza)[0], "NS")  # senza il risultato dei 90 minuti non si usa


class TestRisultatiEspn(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.vecchi = GA.DIARIO, GA.STORICO_IN
        GA.DIARIO = os.path.join(self.tmp, "diario")
        GA.STORICO_IN = os.path.join(self.tmp, "consigli.json")
        self.richieste = []

    def tearDown(self):
        GA.DIARIO, GA.STORICO_IN = self.vecchi

    def get_finto(self, calendario):
        def get(url):
            self.richieste.append(url)
            giorno = url.split("dates=")[-1]
            return {"events": [e for e in calendario if e["date"][:10].replace("-", "") == giorno]}
        return get

    def test_durante_il_giorno(self):
        cal = [ev_espn("2026-11-03T10:00Z", "Vissel Kobe", "Ratchaburi FC", 3, 0), ev_espn("2026-11-03T18:15Z", "Al Hilal", "Shabab Al Ahli", 1, 1, stato="in", fine=False, nome="STATUS_SECOND_HALF")]
        d = {"matches": [{"id": "ACL-1", "fd": None, "lg": "ACL", "h": "Vissel Kobe", "a": "Ratchaburi", "ko": "2026-11-03T10:00:00+00:00", "st": "NS", "g": None},
                         {"id": "ACL-2", "fd": None, "lg": "ACL", "h": "Al Hilal", "a": "Shabab Al Ahli", "ko": "2026-11-03T18:15:00+00:00", "st": "NS", "g": None},
                         {"id": "ACL-3", "fd": None, "lg": "ACL", "h": "Pohang Steelers", "a": "Gamba Osaka", "ko": "2026-11-04T10:00:00+00:00", "st": "NS", "g": None},
                         {"id": "SA-9", "fd": 9, "lg": "SA", "h": "Inter", "a": "Roma", "ko": "2026-11-03T10:00:00+00:00", "st": "NS", "g": None}]}
        n = GA.risultati_espn(d, get=self.get_finto(cal), ora=ORA)
        self.assertEqual(n, 2)
        m = {x["id"]: x for x in d["matches"]}
        self.assertEqual((m["ACL-1"]["st"], m["ACL-1"]["g"], m["ACL-1"]["res"]), ("FT", [3, 0], 0))
        self.assertEqual((m["ACL-2"]["st"], m["ACL-2"]["g"]), ("LIVE", [1, 1]))
        self.assertEqual(m["ACL-3"]["st"], "NS")  # non ancora iniziata: nessuna richiesta per lei
        self.assertEqual(m["SA-9"]["st"], "NS")  # football-data: non tocca a ESPN
        self.assertTrue(all("afc.champions" in u for u in self.richieste))
        self.assertLessEqual(len(self.richieste), 2)

    def test_diario_e_consigli_corretti_al_mattino(self):
        os.makedirs(GA.DIARIO)
        voci = {"ACL-7": {"lg": "ACL", "h": "Al Ittihad", "a": "Al Ain", "date": "2026-11-02", "ko": "2026-11-02T18:15:00+00:00", "st": "FT", "g": [0, 0]},
                "SP2-4": {"lg": "SP2", "h": "Eldense", "a": "Granada", "date": "2026-11-02", "ko": "2026-11-02T13:00:00+00:00", "st": "NS"},
                "SA-1": {"lg": "SA", "h": "Inter", "a": "Roma", "date": "2026-11-02", "ko": "2026-11-02T19:45:00+00:00", "st": "NS"}}
        GA.scrivi_diario(os.path.join(GA.DIARIO, "2026-11-02.json"), voci)
        cons = {"ACL-7": {"date": "2026-11-02", "lg": "ACL", "h": "Al Ittihad", "a": "Al Ain", "st": "FT", "g": [0, 0], "esiti": {"consiglio": 1},
                          "tips": {"consiglio": {"c": "X", "p": 0.3, "q": 3.2}, "coraggiosa": {"c": "2", "p": 0.4, "q": 2.4}}}}
        with open(GA.STORICO_IN, "w") as f:
            json.dump(cons, f)
        eventi = {"ACL": [ES.evento(e) for e in GIORNATA_2_11], "SP2": [ES.evento(ev_espn("2026-11-02T13:00Z", "Eldense", "Granada", 0, 2))]}
        GA.scrivi_diario(os.path.join(GA.DIARIO, "2026-10-28.json"), {"KNV-1": {"lg": "KNV", "h": "Quick Boys", "a": "Eemdijk", "ko": "2026-10-28T19:00:00+00:00", "st": "NS"}})
        vecchia = [ev_espn("2026-10-28T19:00Z", "Quick Boys", "Eemdijk", 4, 0)]
        GA.risultati_espn({"matches": []}, eventi={**eventi, "KNV": []}, get=self.get_finto(vecchia), ora=ORA, massimo=60)
        self.assertEqual(GA.jload(os.path.join(GA.DIARIO, "2026-10-28.json"))["KNV-1"]["g"], [4, 0])  # oltre i 4 giorni del mattino: letto il giorno
        dd = GA.jload(os.path.join(GA.DIARIO, "2026-11-02.json"))
        self.assertEqual((dd["ACL-7"]["st"], dd["ACL-7"]["g"], dd["ACL-7"]["g1"]), ("FT", [1, 4], [0, 2]))
        self.assertEqual((dd["SP2-4"]["st"], dd["SP2-4"]["g"]), ("FT", [0, 2]))
        self.assertEqual(dd["SA-1"]["st"], "NS")  # football-data: resta com'era
        c = GA.jload(GA.STORICO_IN)["ACL-7"]
        self.assertEqual(c["g"], [1, 4])
        self.assertEqual(c["esiti"], {"consiglio": 0, "coraggiosa": 1})  # esiti ricalcolati sul risultato vero

    def test_durante_il_giorno_non_ricontrolla_i_finiti(self):
        os.makedirs(GA.DIARIO)
        GA.scrivi_diario(os.path.join(GA.DIARIO, "2026-11-02.json"), {"ACL-7": {"lg": "ACL", "h": "Al Ittihad", "a": "Al Ain", "ko": "2026-11-02T18:15:00+00:00", "st": "FT", "g": [1, 4]}})
        GA.risultati_espn({"matches": []}, get=self.get_finto(GIORNATA_2_11), ora=ORA)
        self.assertEqual(self.richieste, [])


if __name__ == "__main__":
    unittest.main()
