"""Test automatici dell'algoritmo (solo libreria standard). Si lanciano con: python3 -m unittest discover -s test -v"""
import json
import os
import sys
import unittest

RADICE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RADICE)
import cartellini as CK  # noqa: E402
import mercati as M  # noqa: E402


def mercati_di(lh, la):
    return {x["c"]: x["p"] for x in M.calcola_mercati(lh, la, "Casa", "Ospite", {})}


class Esiti(unittest.TestCase):
    def test_esito_finale(self):
        self.assertTrue(M.valuta("1", 2, 1)); self.assertTrue(M.valuta("X", 1, 1)); self.assertTrue(M.valuta("2", 0, 3))
        self.assertFalse(M.valuta("1X", 0, 1)); self.assertTrue(M.valuta("12", 0, 1))

    def test_gol(self):
        self.assertTrue(M.valuta("O2.5", 2, 1)); self.assertFalse(M.valuta("O2.5", 1, 1)); self.assertTrue(M.valuta("U2.5", 1, 1))
        self.assertTrue(M.valuta("GG", 1, 1)); self.assertTrue(M.valuta("NG", 2, 0))

    def test_combo_e_tempi(self):
        self.assertTrue(M.valuta("1+O1.5", 2, 0)); self.assertFalse(M.valuta("1+O1.5", 1, 0))
        self.assertIsNone(M.valuta("T1:1", 2, 0))  # primo tempo non noto
        self.assertTrue(M.valuta("T1:1", 2, 0, 1, 0)); self.assertFalse(M.valuta("T2:1", 2, 0, 2, 0))

    def test_handicap_e_margine(self):
        self.assertTrue(M.valuta("EHM1:1", 2, 0)); self.assertFalse(M.valuta("EHM1:1", 1, 0)); self.assertTrue(M.valuta("EHM1:X", 1, 0))
        self.assertTrue(M.valuta("MV1:2", 3, 1)); self.assertTrue(M.valuta("MV2:3P", 0, 3))


class Probabilita(unittest.TestCase):
    def test_complementari(self):
        for lh, la in ((1.6, 1.1), (0.7, 2.2), (1.3, 1.3)):
            p = mercati_di(lh, la)
            self.assertAlmostEqual(p["1"] + p["X"] + p["2"], 1, delta=0.01)
            for n in ("0.5", "1.5", "2.5", "3.5"):
                self.assertAlmostEqual(p[f"O{n}"] + p[f"U{n}"], 1, delta=0.01)
            self.assertAlmostEqual(p["GG"] + p["NG"], 1, delta=0.01)
            self.assertGreaterEqual(p["O1.5"], p["O2.5"]); self.assertGreaterEqual(p["O2.5"], p["O3.5"])

    def test_favorito(self):
        p = mercati_di(2.2, 0.7)
        self.assertGreater(p["1"], 0.6); self.assertLess(p["2"], 0.15)

    def test_gol_attesi_dalle_quote(self):
        lh, la = M.gol_attesi([0.5, 0.27, 0.23], 0.52)
        p = mercati_di(lh, la)
        self.assertAlmostEqual(p["1"], 0.5, delta=0.03); self.assertAlmostEqual(p["O2.5"], 0.52, delta=0.03)


class Cartellini(unittest.TestCase):
    def test_linee(self):
        righe = CK.linee("K", 4.2)
        d = {r[0]: r[1] for r in righe}
        self.assertAlmostEqual(d["KO3.5"] + d["KU3.5"], 1, delta=0.01)
        self.assertGreater(d["KO2.5"], d["KO4.5"])
        for r in righe:
            self.assertTrue(0 < r[1] < 1)


class FileDellApp(unittest.TestCase):
    """Controlli sui dati pubblicati: struttura, probabilità valide, file leggeri coerenti con quello completo."""
    @classmethod
    def setUpClass(cls):
        p = os.path.join(RADICE, "app", "data", "giornata.json")
        cls.D = json.load(open(p, encoding="utf-8")) if os.path.exists(p) else None

    def test_partite(self):
        if not self.D:
            self.skipTest("giornata.json assente")
        for m in self.D["matches"]:
            for k in ("id", "h", "a", "lg", "date", "ko", "st", "p", "markets"):
                self.assertIn(k, m, f"{m.get('id')}: manca {k}")
            self.assertAlmostEqual(sum(m["p"]), 1, delta=0.02, msg=m["id"])
            for r in m["markets"]:
                self.assertTrue(0 < r[1] <= 1, f"{m['id']} {r[0]} probabilità {r[1]}")
                self.assertTrue(r[2] == 0 or r[2] >= 1.0, f"{m['id']} {r[0]} quota {r[2]}")

    def test_lista_e_dettagli(self):
        p = os.path.join(RADICE, "app", "data", "lista.json")
        if not self.D or not os.path.exists(p):
            self.skipTest("lista.json assente")
        L = json.load(open(p, encoding="utf-8"))
        self.assertEqual([m["id"] for m in L["matches"]], [m["id"] for m in self.D["matches"]])
        for m in L["matches"]:
            self.assertNotIn("markets", m)
            f = os.path.join(RADICE, "app", "data", "m", "".join(c if c.isalnum() or c in "_-" else "_" for c in m["id"]) + ".json")
            self.assertTrue(os.path.exists(f), f"manca il dettaglio di {m['id']}")


class Apprendimento(unittest.TestCase):
    """Correzioni imparate dai risultati (calibrazione.py) e motore di apprendimento (strumenti/impara.py)."""
    MOD = {"cal": {"1": [0.05, 0.95], "X": [-0.03, 1.02], "GG": [0.02, 0.97], "O2.5": [-0.02, 1.01], "PF1/1": [0.04, 0.96], "MG1-3": [0.01, 0.98]},
           "cal_lg": {"I1": {"X": 0.04, "O2.5": -0.03}}, "peso_ia": {"Esito finale": 0.6, "Under/Over": 1.2}}

    def test_nessuna_correzione(self):
        import calibrazione as CB
        righe = M.calcola_mercati(1.5, 1.1, "C", "O", {})
        prima = [(x["c"], x["p"], x["q"]) for x in righe]
        CB.calibra(righe, "I1", mod={})
        self.assertEqual(prima, [(x["c"], x["p"], x["q"]) for x in righe])

    def test_coerenza(self):
        import calibrazione as CB
        for lh, la, lg in ((1.5, 1.1, "I1"), (0.8, 2.0, "E0"), (1.2, 1.2, "I1")):
            righe = M.calcola_mercati(lh, la, "C", "O", {"1": 2.0})
            quote = M.calcola_mercati(lh * 1.08, la, "C", "O", {})
            CB.calibra(righe, lg, quote, mod=self.MOD)
            p = {x["c"]: x for x in righe}
            self.assertAlmostEqual(p["1"]["p"] + p["X"]["p"] + p["2"]["p"], 1, delta=0.002)
            self.assertAlmostEqual(p["1X"]["p"], p["1"]["p"] + p["X"]["p"], delta=0.002)
            self.assertAlmostEqual(p["O2.5"]["p"] + p["U2.5"]["p"], 1, delta=0.002)
            self.assertAlmostEqual(sum(p[f"PF{a}/{b}"]["p"] for a in "1X2" for b in "1X2"), 1, delta=0.005)
            self.assertEqual(p["1"]["q"], 2.0)  # le quote raccolte non si toccano
            self.assertTrue(all(0 < x["p"] < 1 for x in righe))

    def test_stessa_logica_numpy(self):
        try:
            import numpy as np
        except ImportError:
            self.skipTest("numpy assente")
        sys.path.insert(0, os.path.join(RADICE, "strumenti"))
        import calibrazione as CB
        import impara as I
        lh, la = np.array([1.5, 0.8, 1.2]), np.array([1.1, 2.0, 1.2])
        cod, P = I.probabilita(lh, la)
        _, PM = I.probabilita(lh * 1.08, la)
        for n in range(3):  # stesse probabilita del motore di mercati.py
            rif = mercati_di(lh[n], la[n])
            self.assertLess(max(abs(P[n, k] - rif[c]) for k, c in enumerate(cod) if c in rif), 2e-4)
        LG = np.array(["I1", "E0", "I1"])
        Q = I.applica(self.MOD, cod, P, LG, PM)
        for n in range(3):
            z = CB.calibra_p({c: float(P[n, k]) for k, c in enumerate(cod)}, LG[n], self.MOD, {c: float(PM[n, k]) for k, c in enumerate(cod)})
            self.assertLess(max(abs(Q[n, k] - z[c]) for k, c in enumerate(cod)), 1e-6)

    def test_ricalibrazione_impara(self):
        try:
            import numpy as np
        except ImportError:
            self.skipTest("numpy assente")
        sys.path.insert(0, os.path.join(RADICE, "strumenti"))
        import impara as I
        rng = np.random.default_rng(0)
        p = rng.uniform(0.2, 0.8, 20000)
        y = (rng.uniform(size=p.size) < I.sig(0.3 + 0.8 * I.logit(p))).astype(float)  # probabilita "storte" di proposito
        a, b = I.adatta(I.logit(p), y, np.ones(p.size), pen=1.0)
        self.assertAlmostEqual(a, 0.3, delta=0.06)
        self.assertAlmostEqual(b, 0.8, delta=0.06)


class NuoveFunzioni(unittest.TestCase):
    """Formazione probabile IA e Radar dei movimenti delle quote."""
    def test_formazione_probabile(self):
        import genera_app as GA
        rosa = [{"id": str(i), "n": f"Gioc {i}", "last": f"G{i}", "pos": "G" if i < 2 else "D" if i < 8 else "M" if i < 13 else "F",
                 "tit": max(0, 10 - (i % 7)), "pres": 10, "gialli": 0} for i in range(22)]
        es = {"rosa": rosa, "risultati": [{}] * 10, "ultima": {}}
        xi = GA.formazione_probabile(es, set(), False)
        self.assertEqual(len(xi), 11)
        self.assertEqual(xi[0]["r"], "G")
        self.assertEqual(sum(1 for x in xi if x["r"] == "G"), 1)
        self.assertTrue(all(0 <= x["c"] <= 0.97 for x in xi))
        primo = max((x for x in rosa if x["pos"] != "G"), key=lambda x: x["tit"])
        self.assertIn(primo["last"], [x["n"] for x in xi])
        xi2 = GA.formazione_probabile(es, {primo["n"]}, False)  # indisponibile: fuori dalla formazione
        self.assertNotIn(primo["last"], [x["n"] for x in xi2])
        self.assertIsNone(GA.formazione_probabile({"rosa": rosa, "risultati": [{}]}, set(), False))  # stagione appena iniziata

    def test_radar(self):
        import tempfile
        import genera_app as GA
        with tempfile.TemporaryDirectory() as tmp:
            vecchio = GA.DIARIO
            GA.DIARIO = tmp
            try:
                with open(os.path.join(tmp, "2026-11-01.json"), "w") as f:
                    json.dump({"X1": {"mk0": [0.45, 0.28, 0.27], "q0": {"1": 2.1, "X": 3.4, "2": 3.5}, "t0": "2026-10-30T06:00+00:00"},
                               "X2": {"mk0": [0.45, 0.28, 0.27], "q0": {"1": 2.1, "X": 3.4, "2": 3.5}}}, f)
                d = {"matches": [
                    {"id": "X1", "date": "2026-11-01", "st": "NS", "h": "Casa", "a": "Ospite", "mk": [0.38, 0.29, 0.33], "odds": {"1": 2.5, "X": 3.3, "2": 2.9},
                     "fattori": [{"chi": "Bomber", "lato": 0, "tipo": "infortunio", "delta": -0.08}]},
                    {"id": "X2", "date": "2026-11-01", "st": "NS", "h": "A", "a": "B", "mk": [0.46, 0.28, 0.26], "odds": {"1": 2.05, "X": 3.4, "2": 3.6}}]}
                GA.aggiungi_movimenti(d)
            finally:
                GA.DIARIO = vecchio
        m1, m2 = d["matches"]
        self.assertIn("mov", m1)
        self.assertEqual(m1["mov"]["da"], [2.1, 3.4, 3.5])
        self.assertIn("Bomber", m1["mov"]["perche"])
        self.assertNotIn("mov", m2)  # spostamento sotto i 3 punti: niente Radar


class Specialisti(unittest.TestCase):
    def test_solo_passato_e_integratore_spento(self):
        import specialisti as SP
        from datetime import date, timedelta
        t0 = date(2026, 11, 3)
        h = [{"t": t0 - timedelta(days=3 * i + 3), "casa": i % 2 == 0, "gf": 2, "gs": 0} for i in range(8)]
        a = [{"t": t0 - timedelta(days=3 * i + 3), "casa": i % 2 == 1, "gf": 0, "gs": 1} for i in range(8)]
        futura = [{"t": t0 + timedelta(days=1), "casa": True, "gf": 9, "gs": 0}]
        self.assertEqual(SP.segnali(h, a, t0), SP.segnali(h + futura, a, t0))  # le partite future non contano mai
        self.assertGreater(SP.segnali(h, a, t0)[0], 0)
        mk = [0.45, 0.28, 0.27]
        self.assertEqual(SP.correggi(mk, 0.5, SP.segnali(h, a, t0), "P1", None), (mk, 0.5))  # senza integratore nulla cambia
        integ = {"gruppi": {"altri": {"attivo": True, "mu": [0] * 5, "sd": [1] * 5, "B": [[0.1, 0, -0.1]] * 5, "b_ou": None}}}
        mk2, mo2 = SP.correggi(mk, 0.5, SP.segnali(h, a, t0), "P1", integ)
        self.assertAlmostEqual(sum(mk2), 1.0, places=6)
        self.assertGreater(mk2[0], mk[0])
        self.assertEqual(mo2, 0.5)
        self.assertEqual(SP.correggi(mk, 0.5, SP.segnali(h, a, t0), "I1", integ), (mk, 0.5))  # gruppo diverso: spento


class MotoreStatistico(unittest.TestCase):
    def test_elo_e_solo_passato(self):
        import specialisti as SP
        m = SP.Motore()
        self.assertEqual(m.caratteristiche("A", "B", "I1"), [None] * SP.N_MOTORE)  # senza partite: nessuna opinione
        for _ in range(6):
            m.aggiorna("A", "C", "I1", 3, 0, 8, 2)
            m.aggiorna("B", "C", "I1", 0, 2, 2, 7)
        f = m.caratteristiche("A", "B", "I1")
        self.assertGreater(f[0], 0)  # A piu forte di B (Elo)
        self.assertGreater(f[1], 0)  # A segna di piu
        self.assertGreater(f[4], 0)  # A domina nei tiri in porta
        self.assertEqual(len(SP.segnali([], [], None, None, f)), len(SP.NOMI))


class FormazioniUfficiali(unittest.TestCase):
    def test_formazione_dentro_i_fattori(self):
        import fattori as FT
        from datetime import datetime, timezone
        rosa = [{"n": "Mario Rossi", "g": 8, "a": 2, "pres": 10, "tit": 10, "pos": "F"},
                {"n": "Luca Bianchi", "g": 4, "a": 3, "pres": 10, "tit": 9, "pos": "M"},
                {"n": "Paolo Verdi", "g": 1, "a": 0, "pres": 9, "tit": 8, "pos": "D"},
                {"n": "Gino Neri", "g": 1, "a": 0, "pres": 6, "tit": 1, "pos": "F"}]
        notizia = [{"titolo": "Mario Rossi in dubbio per la partita", "fonte": "x", "link": "", "t": "2026-11-01T10:00:00+00:00"}]
        ko = datetime(2026, 11, 3, 20, tzinfo=timezone.utc)
        xi = ["Mario Rossi"] + [f"Titolare {i}" for i in range(10)]
        lista, tot, _ = FT.fattori_squadra("Casa", 0, notizia, rosa, 20, None, ko, formazione={"xi": xi, "pan": ["Luca Bianchi", "Gino Neri"], "t": "2026-11-03T19:00+00:00"})
        tipi = {f["chi"]: f["tipo"] for f in lista}
        self.assertNotIn("Mario Rossi", tipi)  # titolare: la notizia "in dubbio" non conta piu
        self.assertEqual(tipi.get("Luca Bianchi"), "panchina")  # titolare abituale in panchina
        self.assertEqual(tipi.get("Paolo Verdi"), "assente")  # non convocato
        self.assertNotIn("Gino Neri", tipi)  # riserva che resta riserva
        self.assertLess(tot, 0)
        senza, tot0, _ = FT.fattori_squadra("Casa", 0, notizia, rosa, 20, None, ko)
        self.assertEqual([f["chi"] for f in senza], ["Mario Rossi"])  # senza formazione vale la notizia

    def test_presenza_ufficiale_nei_marcatori(self):
        rosa = [{"n": f"G{i}", "g": 3, "a": 1, "pres": 10, "tit": 5, "pos": "F", "gialli": 2} for i in range(4)]
        base = {x["n"]: x["p"] for x in M.marcatori(rosa, 1.5)}
        uff = {x["n"]: x["p"] for x in M.marcatori(rosa, 1.5, presenza={"G0": "titolare", "G1": "panchina"})}
        self.assertGreater(uff["G0"], base["G0"])
        self.assertLess(uff["G1"], base["G1"])
        self.assertAlmostEqual(uff["G2"], base["G2"])


class AgentiGiocatori(unittest.TestCase):
    def test_specialisti_giocatore(self):
        import giocatori as GC
        x = {"n": "A", "g": 5, "a": 1, "pres": 10, "tit": 8, "rig": 3, "gialli": 2, "min_v": 800, "u5": [[90, 1, 0, 0], [90, 1, 0, 1], [80, 0, 1, 0], [90, 1, 0, 0], [70, 0, 0, 0]]}
        sg = GC.segnali("MARC", x, {"stato": "titolare", "lam": 1.8, "rig_max": 3})
        self.assertEqual(len(sg), len(GC.NOMI))
        self.assertEqual(sg[0], 1.0)  # titolare nella formazione ufficiale
        self.assertEqual(sg[1], 1.0)  # rigorista della squadra
        self.assertGreater(sg[2], 0)  # in forma: segna piu della sua media
        self.assertIsNone(sg[4])  # l'arbitro conta solo per gli ammoniti
        self.assertIsNotNone(GC.segnali("AMM", x, {"k": 2.2, "k_lega": 1.7, "arb": 1.2})[4])

    def test_taratura_in_ombra_e_accesa(self):
        import random
        import giocatori as GC
        self.assertEqual(GC.applica("MARC", 0.3, [1, None, None, None, None], {}), 0.3)  # senza taratura nulla cambia
        rnd = random.Random(1)
        righe = []
        for k in range(3000):  # la probabilita di base sottovaluta i titolari e sopravvaluta chi parte dalla panchina
            tit = rnd.random() < 0.6
            p0 = 0.25
            vero = 0.33 if tit else 0.12
            righe.append([f"2026-{1 + k // 300:02d}-01", "MARC", f"m{k}", "X", p0, p0, 1 if rnd.random() < vero else 0, 1, 1.0 if tit else -1.0, None, None, None, None])
        tar = GC.tara(righe)
        t = tar["tipi"]["MARC"]
        self.assertTrue(t["attivo"], t)
        self.assertIn("minuti", t["w"])
        self.assertGreater(GC.applica("MARC", 0.25, [1.0, None, None, None, None], tar), 0.29)
        self.assertLess(GC.applica("MARC", 0.25, [-1.0, None, None, None, None], tar), 0.18)
        self.assertFalse(tar["tipi"]["ASS"]["attivo"])  # nessun controllo: in ombra

    def test_verificatore(self):
        import tempfile
        import giocatori as GC
        from datetime import date
        with tempfile.TemporaryDirectory() as d:
            oggi = date.today().isoformat()
            os.makedirs(os.path.join(d, "diario"))
            with open(os.path.join(d, "diario", oggi + ".json"), "w") as f:
                json.dump({"p1": {"lg": "I1", "h": "Inter", "a": "Milan", "date": oggi, "ko": oggi + "T19:45:00+00:00", "st": "FT", "g": [2, 1],
                                  "pg": {"MARC:Lautaro Martinez": [0.4, 0.42, 1.0, 1.0, 0.1, 0.2, None], "AMM:Theo Hernandez": [0.3, 0.3, 1.0, None, None, 0.1, 0.05],
                                         "ASS:Nicolo Barella": [0.2, 0.2, None, None, None, 0.2, None]}}}, f)
            with open(os.path.join(d, "tab.json"), "w") as f:
                json.dump({"e1": {"lg": "I1", "t": oggi + "T19:45Z", "h": "Internazionale", "a": "AC Milan", "in": ["Lautaro Martínez", "Theo Hernández", "Nicolò Barella"],
                                  "marc": ["Lautaro Martínez"], "ass": [], "amm": ["Theo Hernández"]}}, f)
            vecchi = (GC.DIARIO, GC.TABELLINI, GC.VERIFICA)
            GC.DIARIO, GC.TABELLINI, GC.VERIFICA = os.path.join(d, "diario"), os.path.join(d, "tab.json"), os.path.join(d, "ver.json")
            try:
                righe = GC.verifica()
                self.assertEqual(len(righe), 3)
                esito = {z[1]: z[6] for z in righe}
                self.assertEqual(esito, {"MARC": 1, "AMM": 1, "ASS": 0})
                self.assertEqual(len(GC.verifica()), 3)  # una partita si controlla una volta sola
            finally:
                GC.DIARIO, GC.TABELLINI, GC.VERIFICA = vecchi


class ConsensoCommunity(unittest.TestCase):
    def test_consenso(self):
        import specialisti as SP
        self.assertIn("consenso", SP.NOMI)
        self.assertIsNone(SP.consenso([3, 0, 0, 3], [0.5, 0.3, 0.2]))  # troppo pochi pronostici
        self.assertGreater(SP.consenso([8, 1, 1, 10], [0.5, 0.3, 0.2]), 0)  # la community crede alla casa piu del mercato
        self.assertLess(SP.consenso([1, 1, 8, 10], [0.5, 0.3, 0.2]), 0)
        self.assertEqual(len(SP.segnali([], [], None)), len(SP.NOMI))


class Salvadanaio(unittest.TestCase):
    def test_crediti_fino_a_fine_mese(self):
        import tempfile
        from datetime import date, datetime, timedelta, timezone
        import salvadanaio as SV
        vecchi = (SV.PATH, SV._ora)
        with tempfile.TemporaryDirectory() as d:
            SV.PATH = os.path.join(d, "budget.json")
            try:
                rim, g, spesi = 400, date(2026, 11, 3), {}
                while g.month == 11:  # ogni giorno si chiede molto piu del possibile: i crediti devono comunque durare
                    SV._ora = lambda g=g: datetime(g.year, g.month, g.day, 6, tzinfo=timezone.utc)
                    spesi[g] = 0
                    for cat, volte in (("mattino", 9), ("prepartita", 12)):
                        for _ in range(volte):
                            if SV.odds_puo(cat, 2, rim):
                                rim -= 2
                                SV.odds_spesa(cat, 2, rim)
                                spesi[g] += 2
                        if cat == "mattino":
                            SV.odds_mattino_fatto()
                    g += timedelta(days=1)
                self.assertGreaterEqual(rim, SV.ODDS_RISERVA)
                self.assertTrue(all(v > 0 for v in spesi.values()))  # nessun giorno a secco, nemmeno l'ultimo
                self.assertGreater(spesi[date(2026, 11, 7)], spesi[date(2026, 11, 4)])  # il sabato riceve di piu
                SV._ora = lambda: datetime(2026, 11, 4, 20, tzinfo=timezone.utc)
                usate = {"infortuni": 0, "formazioni": 0}
                for _ in range(200):
                    for c in usate:
                        if SV.af_puo(c):
                            SV.af_spesa(c)
                            usate[c] += 1
                self.assertLessEqual(sum(usate.values()), SV.AF_GIORNO - SV.AF_RISERVA)
                self.assertGreater(usate["formazioni"], 20)  # gli infortuni non lasciano a secco le formazioni
            finally:
                SV.PATH, SV._ora = vecchi


class NuoviSpecialisti(unittest.TestCase):
    def test_coppe_e_movimento(self):
        import specialisti as SP
        for n in ("coppe", "movimento"):
            self.assertIn(n, SP.NOMI)
        self.assertEqual(SP.NOMI[-4:], ["consenso", "coppe", "movimento", "ultima_ora"])  # in coda: i diari vecchi restano validi
        self.assertIsNone(SP.coppe(None))  # partita di coppa: nessun valore
        self.assertEqual(SP.coppe([{"prima": None, "dopo": None}, {"prima": None, "dopo": None}]), 0)
        self.assertGreater(SP.coppe([{"prima": None, "dopo": None}, {"prima": 2, "dopo": None}]), 0)  # l'ospite ha giocato in coppa: favorisce la casa
        self.assertGreater(SP.carico_coppa({"prima": 2}), SP.carico_coppa({"dopo": 2}))  # la coppa giocata pesa piu di quella da giocare
        self.assertIsNone(SP.movimento([0.5, 0.3, 0.2], None))
        self.assertAlmostEqual(SP.movimento([0.55, 0.27, 0.18], [0.5, 0.3, 0.2]), 0.07)
        v = SP.segnali([], [], None, coppa=0.3, mov=-0.02)
        self.assertEqual(len(v), len(SP.NOMI))
        self.assertEqual(v[SP.NOMI.index("coppe")], 0.3)
        self.assertEqual(v[SP.NOMI.index("movimento")], -0.02)

    def test_specialisti_del_giorno(self):
        import tempfile
        import genera_app as GA
        import specialisti as SP
        with tempfile.TemporaryDirectory() as d:
            vecchio = GA.DIARIO
            GA.DIARIO = d
            with open(os.path.join(d, "2026-11-03.json"), "w") as f:
                json.dump({"m1": {"mk0": [0.5, 0.3, 0.2]}}, f)
            try:
                dd = {"matches": [{"id": "m1", "date": "2026-11-03", "st": "NS", "mk": [0.55, 0.27, 0.18], "sp": None,
                                   "_ctx": {"coppa": [{"prima": None, "dopo": None}, {"prima": 2, "dopo": None}]}}]}
                GA.aggiorna_specialisti_giorno(dd)
                sp = dd["matches"][0]["sp"]
                self.assertEqual(len(sp), len(SP.NOMI))
                self.assertGreater(sp[SP.NOMI.index("coppe")], 0)
                self.assertAlmostEqual(sp[SP.NOMI.index("movimento")], 0.07)
            finally:
                GA.DIARIO = vecchio


class VerificatoreStatistiche(unittest.TestCase):
    def test_senza_taratura_nulla_cambia(self):
        CK._TAR_STAT = {}
        try:
            a = CK.linee("K", 4.6)
            b = CK.linee("K", 4.6, {"lega": 4.4, "arb": {"K": 1.2}, "eq": 0.7})
            self.assertEqual(a, b)
            sg = CK.segnali_stat("K", 4.5, 4.6, CK.MODELLI["K"]["r"], {"lega": 4.4, "arb": {"K": 1.2}, "eq": 0.7})
            self.assertEqual(len(sg), len(CK.NOMI_STAT))
            self.assertIsNone(CK.segnali_stat("C", 9.5, 10, CK.MODELLI["C"]["r"], {"arb": {"K": 1.2}})[2])  # arbitro: niente per gli angoli
            tar = {"tipi": {"K": {"attivo": True, "a": 0.3, "b": 1.0, "mu": [0] * 5, "sd": [1] * 5, "w": {}}}}
            p = CK.applica_stat("K", 0.5, sg, tar)
            self.assertGreater(p, 0.5)
            self.assertLessEqual(p, 0.62)  # mai piu di 12 punti
        finally:
            CK._TAR_STAT = None

    def test_controllo_sul_tabellino(self):
        import tempfile
        from datetime import date
        import statistiche_ia as SI
        oggi = date.today().isoformat()
        ck = {"K": [4.6, 2.2, 2.4, 4.4], "C": [9.8, 5.5, 4.3, 9.9], "F": [24.0, 12.0, 12.0, 24.5], "arb": {"K": 1.1, "F": 1.0}, "eq": 0.6}
        righe = SI.righe_partita(ck, {"K": [3, 3], "C": [7, 2], "F": [10, 11]}, oggi, "p1")
        self.assertTrue(righe)
        per = {z[3]: z[5] for z in righe}
        self.assertEqual(per.get("KO4.5"), 1)  # 6 cartellini
        self.assertEqual(per.get("CO9.5"), 0)  # 9 angoli
        self.assertEqual(per.get("CHO4.5"), 1)  # 7 angoli della squadra di casa
        self.assertTrue(all(0.03 < z[4] < 0.97 and len(z) == 6 + len(SI.NOMI) for z in righe))
        with tempfile.TemporaryDirectory() as d:
            os.makedirs(os.path.join(d, "diario"))
            with open(os.path.join(d, "diario", oggi + ".json"), "w") as f:
                json.dump({"p1": {"lg": "I1", "h": "Inter", "a": "Milan", "date": oggi, "ko": oggi + "T19:45:00+00:00", "st": "FT", "g": [2, 1], "ck": ck}}, f)
            with open(os.path.join(d, "tab.json"), "w") as f:
                json.dump({"e1": {"lg": "I1", "t": oggi + "T19:45Z", "h": "Internazionale", "a": "AC Milan", "st": {"K": [3, 3], "C": [7, 2], "F": [10, 11]}}}, f)
            vecchi = (SI.DIARIO, SI.TABELLINI, SI.VERIFICA)
            SI.DIARIO, SI.TABELLINI, SI.VERIFICA = os.path.join(d, "diario"), os.path.join(d, "tab.json"), os.path.join(d, "ver.json")
            try:
                r1 = SI.verifica()
                self.assertEqual(len(r1), len(righe))
                self.assertEqual(len(SI.verifica()), len(righe))  # una partita si controlla una volta sola
                tar = SI.tara(r1)
                self.assertFalse(tar["tipi"]["K"]["attivo"])  # pochi controlli: in ombra
            finally:
                SI.DIARIO, SI.TABELLINI, SI.VERIFICA = vecchi

    def test_statistiche_dal_tabellino_espn(self):
        import espn_dati as ES
        summ = {"header": {"competitions": [{"competitors": [{"homeAway": "home", "team": {"id": "1"}}, {"homeAway": "away", "team": {"id": "2"}}]}]},
                "boxscore": {"teams": [{"team": {"id": "2"}, "statistics": [{"name": "yellowCards", "displayValue": "3"}, {"name": "redCards", "displayValue": "1"},
                                                                          {"name": "wonCorners", "displayValue": "4"}, {"name": "foulsCommitted", "displayValue": "14"}]},
                                       {"team": {"id": "1"}, "statistics": [{"name": "yellowCards", "displayValue": "2"}, {"name": "redCards", "displayValue": "0"},
                                                                          {"name": "wonCorners", "displayValue": "6"}, {"name": "foulsCommitted", "displayValue": "11"}]}]}}
        self.assertEqual(ES.statistiche_squadre(summ), {"K": [2, 4], "C": [6, 4], "F": [11, 14]})
        self.assertIsNone(ES.statistiche_squadre({"header": {"competitions": [{"competitors": []}]}}))


class StoricoSchedine(unittest.TestCase):
    def test_salvata_una_volta_e_verificata(self):
        import tempfile
        from datetime import datetime, timezone
        import schedine_ia as SI

        def partita(i, p1, q1):
            return {"id": f"m{i}", "lg": "I1", "h": f"Casa{i}", "a": f"Ospite{i}", "date": "2026-11-03", "ko": "2026-11-03T19:45:00+00:00", "st": "NS",
                    "markets": [["1", p1, q1, 1], ["X", 0.25, 3.6, 1], ["2", round(0.75 - p1, 3), 4.0, 1], ["1X", 0.9, 1.15, 0], ["O2.5", 0.55, 1.8, 1], ["U2.5", 0.45, 2.0, 1]]}
        d = {"matches": [partita(i, 0.66 - 0.02 * i, 1.45 + 0.03 * i) for i in range(6)]}
        with tempfile.TemporaryDirectory() as t:
            path = os.path.join(t, "s.json")
            out = SI.aggiorna(d, ora=datetime(2026, 11, 3, 6, 30, tzinfo=timezone.utc), path=path)
            giorno = out["giorni"]["2026-11-03"]
            self.assertEqual(len(giorno["0"]["legs"]), 3)
            self.assertTrue(all(1.3 <= l["q"] <= 1.6 for l in giorno["0"]["legs"]))  # Zero Tachicardia: quote 1,30-1,60
            prima = json.dumps(giorno)
            for m in d["matches"]:
                m["markets"][0][2] = 1.31  # le quote cambiano: la schedina del giorno no
            out = SI.aggiorna(d, ora=datetime(2026, 11, 3, 12, tzinfo=timezone.utc), path=path)
            self.assertEqual(json.dumps(out["giorni"]["2026-11-03"]), prima)
            for m in d["matches"]:
                m["st"], m["g"] = "FT", [2, 1]
            out = SI.aggiorna(d, ora=datetime(2026, 11, 4, 8, tzinfo=timezone.utc), path=path)
            s0 = out["giorni"]["2026-11-03"]["0"]
            self.assertIn(s0["esito"], (0, 1))
            self.assertEqual(out["mese"]["0"]["giocate"], 1)
            self.assertAlmostEqual(out["mese"]["0"]["punti"], round((s0["q"] - 1) if s0["esito"] else -1, 2))


class Coerenza(unittest.TestCase):
    def test_controlli(self):
        sys.path.insert(0, os.path.join(RADICE, "strumenti"))
        import coerenza as CO
        buona = {"id": "a", "date": "2026-11-03", "h": "A", "a": "B", "ko": "2026-11-03T19:00:00+00:00", "st": "NS", "p": [0.5, 0.3, 0.2], "mk": [0.5, 0.3, 0.2],
                 "po": 0.5, "odds": {"1": 1.9, "X": 3.2}, "markets": [["1", 0.5, 1.9, 1]], "tip": {"consiglio": {"c": "1"}}, "blocco": {"st": "bloccato"}}
        reg = {"a": {"tips": {"consiglio": {"c": "1"}}, "tB": "2026-11-03T18:15:00+00:00"}}
        pr, n = CO.controlla({"matches": [buona]}, {"x.json": '{"a": "https://x/NaN"}'}, reg, {"matches": [{"id": "a"}]})
        self.assertEqual(pr, [])
        self.assertGreater(n, 5)
        cattiva = dict(buona, p=[0.6, 0.3, 0.2], odds={"1": 0.9}, tip={"consiglio": {"c": "2"}})
        pr, _ = CO.controlla({"matches": [cattiva, dict(buona)]}, {"x.json": '{"a": NaN}'}, reg)
        testo = " ".join(pr)
        for parola in ("NaN", "sommano", "quota 1", "doppia", "cambiato dopo il blocco"):
            self.assertIn(parola, testo)


class RitmoCrediti(unittest.TestCase):
    def test_previsione(self):
        from datetime import date
        import salvadanaio as SV
        vecchio = SV.PATH
        SV.PATH = os.path.join(RADICE, "data", "_non_esiste.json")
        try:
            self.assertTrue(SV.previsione(date(2026, 11, 15), rimasti=260)["basta"])  # 15,6 al giorno per 16 giorni: bastano
            pv = SV.previsione(date(2026, 11, 10), rimasti=100)  # 4,3 al giorno: non bastano per il mattino
            self.assertFalse(pv["basta"])
            self.assertLess(pv["fino_al"], 30)
            self.assertTrue(SV.previsione(date(2026, 11, 3), rimasti=400)["basta"])  # inizio mese con una spesa alta: la parte del giorno basta
        finally:
            SV.PATH = vecchio


class PercheCambiato(unittest.TestCase):
    def test_riga(self):
        import genera_app as GA
        m = {"h": "Inter", "a": "Milan"}
        f = [{"chi": "Lautaro", "lato": 0, "tipo": "panchina", "delta": -0.08}]
        q = [{"c": "1", "p": 0.5}, {"c": "X", "p": 0.27}, {"c": "2", "p": 0.23}]
        r = GA.perche_cambiato(m, f, q, [0.46, 0.28, 0.26], True)
        self.assertEqual(r["da"], [0.5, 0.27, 0.23])
        self.assertIn("Lautaro (Inter) in panchina", r["chi"][0])
        self.assertIsNone(GA.perche_cambiato(m, f, q, [0.502, 0.27, 0.228], True))  # sotto un punto: niente riga


if __name__ == "__main__":
    unittest.main()
