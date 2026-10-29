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
const outC = path.join(tmp, "citazioni.mjs");
await esbuild.build({ entryPoints: [path.join(APP, "src/citazioni.js")], bundle: true, platform: "node", format: "esm", outfile: outC, nodePaths: [MODS],
  alias: { htm: path.join(APP, "vendor/htm/index.mjs") }, logLevel: "error" });
const outA = path.join(tmp, "allenatore.mjs");
await esbuild.build({ entryPoints: [path.join(APP, "src/allenatore.js")], bundle: true, platform: "node", format: "esm", outfile: outA, nodePaths: [MODS],
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

// 6. schedina con esito scelto: stesso esito in ogni partita, nessuna partita doppia, quota vicina all'obiettivo
if (pool.length >= 12) for (const es of ["1", "X", "GG", "O2.5", "FAV"]) {
  const L0 = B.buildForzata(pool, es, 1, 0, 0);
  ok(L0.length > 0 && (es === "FAV" || L0.every((l) => l.k === es)), `esito ${es}: giocate diverse da quella scelta`);
  for (const T of [5, 20]) {
    const L = B.buildForzata(pool, es, 1, T, 0), tot = L.reduce((a, l) => a * l.q, 1);
    ok(new Set(L.map((l) => l.m.id)).size === L.length, `esito ${es} x${T}: partite doppie`);
    ok(es === "FAV" ? L.every((l) => l.k === "1" || l.k === "2") : L.every((l) => l.k === es), `esito ${es} x${T}: esito sbagliato`);
    ok(tot > T * 0.75 && tot < T * 1.3, `esito ${es} x${T}: quota ${tot.toFixed(2)}`);
  }
}

// 5. citazioni: derby riconosciuti (anche al contrario), nessun falso derby, frequenza misurata, autore sempre presente
const Z = await import(pathToFileURL(outC).href);
const dd = (h, a) => (Z.derbyDi({ h, a }) || {}).nome;
ok(dd("Inter", "Milan") === "Derby della Madonnina" && dd("AC Milan", "Inter") === "Derby della Madonnina", "derby di Milano");
ok(dd("Roma", "Lazio") === "Derby della Capitale" && dd("Liverpool", "Everton") === "Merseyside derby", "derby noti");
ok(!dd("Paris FC", "Marseille") && !dd("Milan", "Bologna") && !dd("Venezia", "Inter"), "falsi derby");
ok(Object.values(Z.Q).every((q) => q[0] && q[1]), "citazione senza autore");
let conCit = 0; for (let i = 0; i < 600; i++) if (Z.citazioneSchedina([{ m: { id: "x" + i }, k: "1" }], 5)) conCit++;
ok(conCit > 120 && conCit < 290, "frequenza delle citazioni nella schedina: " + conCit + " su 600");

// 4. periodi
ok(B.inPeriodo("2026-10-28", "oggi", "2026-10-28") && !B.inPeriodo("2026-10-29", "oggi", "2026-10-28"), "periodo oggi");
ok(B.inPeriodo("2026-10-29", "domani", "2026-10-28"), "periodo domani");

// schedina onesta: Over 2,5 e Goal sulla stessa partita sono collegati (la probabilita vera e piu alta del prodotto)
{
  const m = { id: "t1", xg: [1.5, 1.2] };
  const M = B.matriceRis(1.5, 1.2);
  let tot = 0; for (const r of M) for (const v of r) tot += v;
  ok(Math.abs(tot - 1) < 1e-9, "matrice dei risultati: la somma deve essere 1");
  const pv = B.probVera([{ m, k: "O2.5", p: 0.5 }, { m, k: "GG", p: 0.55 }]);
  ok(pv.diversa && pv.p > pv.ind && pv.collegate.size === 2, "schedina onesta: Over 2,5 + Goal collegati");
  const pv2 = B.probVera([{ m, k: "1", p: 0.45 }, { m: { id: "t2", xg: [1, 1] }, k: "X", p: 0.3 }]);
  ok(!pv2.diversa && Math.abs(pv2.p - 0.135) < 1e-9, "schedina onesta: partite diverse restano indipendenti");
  const pv3 = B.probVera([{ m, k: "1", p: 0.45 }, { m, k: "2", p: 0.3 }]);
  ok(pv3.p < 1e-6, "schedina onesta: 1 e 2 sulla stessa partita sono impossibili insieme");
}
// allenatore personale: riconosce la rincorsa delle perdite
{
  const AL = await import(pathToFileURL(outA).href);
  const t0 = Date.now() - 5 * 86400e3;
  const g = (ok) => ({ id: "x", k: "1", q: 2, p: 0.5, ok });
  const diario = [
    { id: "a", t: t0, imp: 5, q: 2, legs: [g(false)] }, { id: "b", t: t0 + 3600e3, imp: 20, q: 2, legs: [g(false)] },
    { id: "c", t: t0 + 86400e3, imp: 5, q: 2, legs: [g(true)] }, { id: "d", t: t0 + 2 * 86400e3, imp: 5, q: 2, legs: [g(true)] }, { id: "e", t: t0 + 3 * 86400e3, imp: 5, q: 2, legs: [g(false)] }];
  const A = AL.analizza(diario, {});
  ok(A.chiuse.length === 5 && A.rincorse === 1, "allenatore: una rincorsa delle perdite (" + A.rincorse + ")");
  ok(A.G.length === 1 && A.G[0].n === 5 && A.G[0].prese === 2, "allenatore: conteggio per mercato");
}
console.log(`${prove} controlli, ${errori} errori`);
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(errori ? 1 : 0);
