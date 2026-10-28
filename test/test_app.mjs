// Test automatici della logica dell'app (node test/test_app.mjs). Compila src/base.js per Node e controlla:
// esiti dei mercati uguali a mercati.py, etichette senza "undefined", schedina con quota obiettivo, varianti diverse, periodi.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
const RADICE = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const APP = path.join(RADICE, "app");
const MODS = process.env.AP_NODE_MODULES || path.join(APP, "node_modules");
const esbuild = createRequire(path.join(MODS, "noop.js"))("esbuild");
const tmp = fs.mkdtempSync(path.join(process.env.RUNNER_TEMP || "/tmp", "ap-test-"));
const out = path.join(tmp, "base.mjs");
await esbuild.build({ entryPoints: [path.join(APP, "src/base.js")], bundle: true, platform: "node", format: "esm", outfile: out, nodePaths: [MODS],
  alias: { htm: path.join(APP, "vendor/htm/index.mjs") }, logLevel: "error" });
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
globalThis.document = { documentElement: { dataset: {} } };
const B = await import(pathToFileURL(out).href);

let errori = 0, prove = 0;
const ok = (cond, msg) => { prove++; if (!cond) { errori++; console.log("ERRORE:", msg); } };
const D = JSON.parse(fs.readFileSync(path.join(APP, "data/giornata.json"), "utf8"));

// 1. esiti uguali a mercati.py
const py = JSON.parse(execFileSync("python3", [path.join(RADICE, "test/esiti_python.py"), path.join(APP, "data/giornata.json")], { maxBuffer: 1 << 28 }).toString());
let casi = 0;
for (const [c, righe] of Object.entries(py)) for (const [h, a, h1, a1, v] of righe) {
  if (v === "errore") continue;
  const js = B.evalCode(c, h, a, h1, a1);
  casi++;
  if (js !== v) ok(false, `${c} ${h}-${a} (1° tempo ${h1}-${a1}): app ${js}, algoritmo ${v}`);
}
ok(casi > 1000, "troppi pochi casi confrontati: " + casi);
console.log("esiti confrontati:", casi, "su", Object.keys(py).length, "codici");

// 2. etichette leggibili per tutti i mercati
for (const m of D.matches) for (const r of m.markets) {
  const l = B.mLabel(m, r[0]), s = B.mLabel(m, r[0], true);
  ok(l && !/undefined|NaN/.test(l + s), `etichetta di ${r[0]}: "${l}"`);
}

// 3. schedina con quota obiettivo: nessuna partita doppia, quota vicina all'obiettivo con molte partite, varianti diverse
const pool = D.matches.filter((m) => m.st === "NS");
if (pool.length >= 12) for (const prof of [0, 1, 2]) for (const T of [2, 5, 10, 50]) {
  const legs = B.buildTarget(pool, prof, T, 0);
  const tot = legs.reduce((a, l) => a * l.q, 1);
  ok(new Set(legs.map((l) => l.m.id)).size === legs.length, `partite doppie (stile ${prof}, x${T})`);
  ok(legs.every((l) => l.q >= 1.08), `quota sotto 1,08 (stile ${prof}, x${T})`);
  ok(tot > T * 0.8 && tot < T * 1.25, `stile ${prof}, x${T}: quota ${tot.toFixed(2)}`);
  const firme = new Set([1, 2, 3].map((v) => B.buildTarget(pool, prof, T, v).map((l) => l.m.id + l.k).join("|")));
  ok(firme.size >= 2, `stile ${prof}, x${T}: "Un'altra combinazione" non cambia`);
}

// 4. periodi
ok(B.inPeriodo("2026-10-28", "oggi", "2026-10-28") && !B.inPeriodo("2026-10-29", "oggi", "2026-10-28"), "periodo oggi");
ok(B.inPeriodo("2026-10-29", "domani", "2026-10-28"), "periodo domani");

console.log(`${prove} controlli, ${errori} errori`);
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(errori ? 1 : 0);
