"""Test del controllo delle parti inutilizzate (strumenti/pulizia.py) su un progetto finto: python3 -m unittest discover -s test -v"""
import json
import os
import subprocess
import sys
import tempfile
import unittest

RADICE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PULIZIA = os.path.join(RADICE, "strumenti", "pulizia.py")


def scrivi(base, rel, testo):
    p = os.path.join(base, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "w", encoding="utf-8") as f:
        f.write(testo)


def progetto(base):
    scrivi(base, ".github/workflows/raccolta.yml", "name: Raccolta\non:\n  schedule:\n    - cron: '0 * * * *'\njobs:\n  a:\n    steps:\n      - run: python3 raccoglitore.py\n")
    scrivi(base, ".github/workflows/studio.yml", "name: Studio\non: { workflow_dispatch: {} }\njobs:\n  a:\n    steps:\n      - run: python3 strumenti/studio.py\n")
    scrivi(base, "raccoglitore.py", "import aiuto\n\nUSATA = 3\nMORTA = 4\n\n\ndef giro():\n    return aiuto.somma(USATA, 1)\n\n\nif __name__ == '__main__':\n    giro()\n")
    scrivi(base, "aiuto.py", "def somma(a, b):\n    return a + b\n\n\ndef vecchia(x):\n    return x\n\n\ndef per_test(x):\n    return x\n")
    scrivi(base, "strumenti/studio.py", "open('storico/studio_dati.csv')\n")
    scrivi(base, "orfano.py", "print('nessuno mi usa')\n")
    scrivi(base, "test/test_aiuto.py", "from aiuto import per_test\n")
    scrivi(base, "app/src/base.js", "function usata() { return 1; }\nfunction morta() { return 2; }\nconst sempre = usata();\nexport { usata, morta, sempre };\n")
    scrivi(base, "app/src/app.js", "import { usata, sempre } from './base.js';\nimport { meteoCache } from './meteo.js';\nconsole.log(usata(), sempre, meteoCache);\n")
    scrivi(base, "app/index.html", "<script src='src/app.js'></script>\n")
    scrivi(base, "storico/studio_dati.csv", "a,b\n1,2\n")
    scrivi(base, "storico/abbandonato.csv", "a,b\n")
    scrivi(base, "storico/meteo/1.json", "{}")
    scrivi(base, "app/src/meteo.js", "export const meteoCache = {}; // la parola meteo compare anche nell'app\n")
    scrivi(base, "data/2026-11-01/partite.csv", "x\n")
    scrivi(base, "data/2026-11-02/partite.csv", "x\n")


class TestPulizia(unittest.TestCase):
    def esegui(self, base):
        env = {k: v for k, v in os.environ.items() if k != "GITHUB_TOKEN"}
        env["PULIZIA_RADICE"] = base
        r = subprocess.run([sys.executable, PULIZIA], capture_output=True, text=True, env=env, timeout=120)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        with open(os.path.join(base, "data", "pulizia.json"), encoding="utf-8") as f:
            return json.load(f)

    def test_trova_le_parti_inutili(self):
        with tempfile.TemporaryDirectory() as base:
            progetto(base)
            e = self.esegui(base)
            togliere, valutare = "\n".join(e["da_togliere"]), "\n".join(e["da_valutare"])
            for x in ("MORTA in raccoglitore.py", "vecchia in aiuto.py", "morta in app/src/base.js", "orfano.py", "storico/abbandonato.csv"):
                self.assertIn(x, togliere)
            self.assertIn("per_test in aiuto.py", valutare)            # usata solo nei test
            self.assertIn("storico/studio_dati.csv", valutare)          # letta solo da uno studio fatto a mano
            self.assertIn("storico/meteo/", valutare + togliere)        # la parola "meteo" nell'app non la salva
            for x in ("USATA", "somma", "usata", "sempre", "giro", "meteoCache"):
                self.assertNotIn(f": {x} in ", togliere, f"{x} e usata ma risulta da togliere")
            self.assertTrue(any("Cartelle giornaliere in data/: 2" in n for n in e["note"]))
            self.assertTrue(any("permesso di lettura" in n for n in e["note"]))  # senza GitHub: processi e rami saltati


if __name__ == "__main__":
    unittest.main()
