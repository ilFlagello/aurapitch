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

// 3b. i tre stili si sentono: Zero Tachicardia più probabile e a quota più bassa, La Classica con più partite, Colpaccio a quota alta
if (pool.length >= 12) {
  const S = [0, 1, 2].map((prof) => B.buildSlip(pool, prof, 0));
  const R = B.PROFILI_SLIP;
  S.forEach((L, prof) => {
    ok(L.length === R[prof].n, `stile ${prof}: ${L.length} partite invece di ${R[prof].n}`);
    ok(new Set(L.map((l) => l.m.id)).size === L.length, `stile ${prof}: partite doppie`);
    ok(L.every((l) => l.q >= B.QUOTA_MIN), `stile ${prof}: quota sotto il minimo`);
  });
  const pm = (L) => L.reduce((a, l) => a + l.p, 0) / L.length, qm = (L) => L.reduce((a, l) => a + Math.log(l.q), 0) / L.length;
  ok(pm(S[0]) > pm(S[1]) && pm(S[1]) > pm(S[2]), "stili: la probabilità media delle giocate deve scendere da Zero Tachicardia a Colpaccio");
  ok(qm(S[0]) < qm(S[1]) && qm(S[1]) < qm(S[2]), "stili: la quota media delle giocate deve salire da Zero Tachicardia a Colpaccio");
  ok(S[2].every((l) => l.q >= 2.0), "Colpaccio da Bar: tutte le giocate a quota alta");
  ok(B.buildSlip(pool, 1, 7).length === 7, "numero di partite scelto dall'utente rispettato");
  // scala senza salti: quota totale e probabilità cambiano di gradino in gradino, non di colpo
  const Q = S.map((L) => L.reduce((a, l) => a * l.q, 1)), P = S.map((L) => B.probVera(L).p);
  ok(Q[0] < Q[1] && Q[1] < Q[2] && P[0] > P[1] && P[1] > P[2], "stili: quota totale sale e probabilità scende");
  ok(Q[1] / Q[0] < 5 && Q[2] / Q[1] < 5, `stili: salto troppo grande tra stili vicini (${Q.map((q) => q.toFixed(1)).join(", ")})`);
  // con più partite le giocate diventano più prudenti dentro lo stile: quota per giocata uguale o più bassa. La probabilità può
  // calare un poco: La Classica accetta giocate fino al 68%, quindi con 7 partite servono anche giocate un po' meno sicure
  // (misurato su 243 schedine di 27 giornate passate: quota mai salita, probabilità al massimo 2,5 punti più bassa)
  const pmed = (L) => L.reduce((a, l) => a + l.p, 0) / L.length, qmed = (L) => Math.exp(L.reduce((a, l) => a + Math.log(l.q), 0) / L.length);
  const S7 = B.buildSlip(pool, 1, 7);
  ok(qmed(S7) <= qmed(S[1]) + 0.02, `con più partite la quota per giocata non sale (${qmed(S7).toFixed(2)} contro ${qmed(S[1]).toFixed(2)})`);
  ok(pmed(S7) >= pmed(S[1]) - 0.04, `con più partite le giocate non diventano molto più rischiose (${(pmed(S7) * 100).toFixed(1)}% contro ${(pmed(S[1]) * 100).toFixed(1)}%)`);
  // voci insieme: nessuna voce obbligatoria, una giocata per partita, stesse regole dello stile
  const V = ["P", "MARC", "ASS", "AMM"];
  for (const prof of [0, 1, 2]) {
    const L = B.buildSlip(pool, prof, 0, 0, V);
    ok(L.length === B.PROFILI_SLIP[prof].n && new Set(L.map((l) => l.m.id)).size === L.length, `voci insieme (stile ${prof}): partite doppie o numero sbagliato`);
    const solo = B.buildSlip(pool, prof, 0, 0, ["AMM"]);
    ok(solo.length > 0 && solo.every((l) => l.k.startsWith("AMM:")), `solo ammoniti (stile ${prof}): schedina vuota o voci non ammesse`);
  }
}

// 3c. "La mia schedina" completata dall'IA (5/11): scelte ferme, nessuna partita riusata, numero di partite e quota obiettivo rispettati
{
  const pool = D.matches.filter((m) => m.st === "NS" && m.markets);
  const fisse = pool.filter((m) => m.tip && m.tip.consiglio).slice(0, 2).map((m) => ({ m, ...B.options(m).find((o) => o.k === m.tip.consiglio.c) })).filter((l) => l.q);
  if (fisse.length === 2) {
    const ids = (L) => L.map((l) => l.m.id);
    for (const prof of [0, 1]) {
      const L = B.completaSchedina(pool, fisse, prof, 0, 0, 0);
      ok(L.length === B.PROFILI_SLIP[prof].n, `mia schedina stile ${prof}: ${L.length} partite invece di ${B.PROFILI_SLIP[prof].n}`);
      ok(L.slice(0, 2).every((l, i) => l.mia && l.m.id === fisse[i].m.id && l.k === fisse[i].k), "mia schedina: le scelte dell'utente devono restare ferme e in testa");
      ok(new Set(ids(L)).size === L.length, "mia schedina: partita usata due volte");
      const L6 = B.completaSchedina(pool, fisse, prof, 6, 0, 0);
      ok(L6.length === 6 && L6.aggiunte === 4, `mia schedina: con 6 partite in tutto l'IA ne aggiunge 4 (${L6.aggiunte})`);
      const L2 = B.completaSchedina(pool, fisse, prof, 2, 0, 0);
      ok(L2.length === 2 && L2.completa, "mia schedina: con 2 partite in tutto non si aggiunge nulla");
      const LT = B.completaSchedina(pool, fisse, prof, 0, 20, 0), q = LT.reduce((a, l) => a * l.q, 1);
      ok(LT.aggiunte > 0 && q > 20 * 0.7 && q < 20 * 1.45, `mia schedina stile ${prof}: obiettivo x20, quota ${q.toFixed(2)}`);
      const LV = B.completaSchedina(pool, fisse, prof, 0, 0, 1);
      ok(ids(LV).join() !== ids(L).join(), `mia schedina stile ${prof}: "Un'altra combinazione" non cambia`);
    }
    const R = B.completaSchedina(pool, fisse, 1, 0, 1.2, 0);
    ok(R.raggiunta && R.length === 2, "mia schedina: obiettivo già raggiunto dalle scelte");
    const giocatori = B.completaSchedina(pool, fisse, 1, 5, 0, 0, ["MARC"]);
    ok(giocatori.slice(2).every((l) => /^MARC:/.test(l.k)), "mia schedina: con i soli marcatori l'IA aggiunge solo marcatori");
  } else console.log("mia schedina: meno di 2 partite con consiglio, prova saltata");
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
// storico delle schedine IA: la copia in Python (schedine_ia.py, sul server) sceglie le stesse giocate dell'app, stile per stile
{
  const giorni = [...new Set(D.matches.map((m) => m.date))];
  const script = `import json,sys
sys.path.insert(0, ${JSON.stringify(RADICE)})
import schedine_ia as SI
d = json.load(open(${JSON.stringify(path.join(APP, "data/giornata.json"))}, encoding="utf-8"))
out = {"profili": SI.PROFILI_SLIP, "q_min": SI.QUOTA_MIN, "giorni": {}}
for g in json.loads(sys.argv[1]):
    pool = [m for m in d["matches"] if m.get("date") == g and m.get("markets")]
    out["giorni"][g] = [[[x["m"]["id"], x["k"]] for x in SI.schedina(pool, p)] for p in range(3)]
print(json.dumps(out))`;
  const py2 = JSON.parse(execFileSync("python3", ["-c", script, JSON.stringify(giorni)], { maxBuffer: 1 << 26 }).toString());
  const campi = ["nome", "n", "lo", "hi", "mid", "pmin", "pmax", "wp", "ws", "wv", "wm"];
  ok(py2.profili.length === B.PROFILI_SLIP.length && py2.profili.every((P, i) => campi.every((c) => P[c] === B.PROFILI_SLIP[i][c])), "schedine_ia.py: PROFILI_SLIP diversi da base.js");
  ok(py2.q_min === B.QUOTA_MIN, "schedine_ia.py: quota minima diversa da base.js");
  let confronti = 0;
  for (const g of giorni) {
    const pool = D.matches.filter((m) => m.date === g && m.markets);
    for (let p = 0; p < 3; p++) {
      const js = B.buildSlip(pool, p, 0, 0, null).map((l) => [l.m.id, l.k]);
      confronti++;
      ok(JSON.stringify(js) === JSON.stringify(py2.giorni[g][p]), `schedine_ia.py diversa dall'app (${g}, stile ${p}): ${JSON.stringify(py2.giorni[g][p])} contro ${JSON.stringify(js)}`);
    }
  }
  console.log("schedine IA confrontate con l'app:", confronti);
}
// IA contro mercato: le partite da giocare con lo scarto più grande tra IA e quote sull'esito finale
{
  const outM = path.join(tmp, "mercato.mjs");
  await esbuild.build({ entryPoints: [path.join(APP, "src/mercato.js")], bundle: true, platform: "node", format: "esm", outfile: outM, logLevel: "error" });
  const MK = await import(pathToFileURL(outM).href);
  const ms = [{ id: "a", st: "NS", ko: "2026-11-05T19:00Z", h: "A", a: "B", p: [0.5, 0.25, 0.25], mk: [0.45, 0.27, 0.28] },
    { id: "b", st: "NS", ko: "2026-11-05T18:00Z", h: "C", a: "D", p: [0.2, 0.25, 0.55], mk: [0.3, 0.27, 0.43] },
    { id: "c", st: "NS", ko: "2026-11-05T17:00Z", h: "E", a: "F", p: [0.46, 0.27, 0.27], mk: [0.45, 0.27, 0.28] },
    { id: "d", st: "FT", ko: "2026-11-04T17:00Z", h: "G", a: "H", p: [0.7, 0.2, 0.1], mk: [0.5, 0.3, 0.2] }, { id: "e", st: "NS", nq: true, ko: "2026-11-05T17:00Z", h: "I", a: "L" }];
  const dv = MK.divergenze(ms);
  ok(dv.map((x) => x.m.id).join() === "b,a", `IA contro mercato: ordine e filtri (${dv.map((x) => x.m.id)})`);
  ok(dv[0].c === "2" && Math.abs(dv[0].d - 0.12) < 1e-9 && dv[1].c === "1", "IA contro mercato: esito e scarto");
  ok(MK.esitoLungo({ h: "A", a: "B" }, "2") === "vittoria B" && MK.esitoLungo({}, "X") === "pareggio", "IA contro mercato: etichette");
}
// scheda squadra: difficoltà delle prossime 3 dalle probabilità dell'IA o dal punteggio Elo dell'algoritmo
{
  const outD = path.join(tmp, "difficolta.mjs");
  await esbuild.build({ entryPoints: [path.join(APP, "src/difficolta.js")], bundle: true, platform: "node", format: "esm", outfile: outD, logLevel: "error" });
  const DF = await import(pathToFileURL(outD).href);
  const pe = DF.probElo(1600, 1600, true);
  ok(Math.abs(pe[0] + pe[1] + pe[2] - 1) < 1e-9 && pe[0] > pe[2] && pe[1] > 0.2, `probElo pari in casa: ${pe}`);
  const forte = DF.probElo(1800, 1450, false);
  ok(forte[0] > 0.6 && forte[1] >= 0.15, `probElo favorita in trasferta: ${forte}`);
  ok(DF.livello(2.1) === "Facile" && DF.livello(1.5) === "Media" && DF.livello(0.9) === "Difficile", "livelli di difficoltà");
  ok(DF.simile("Inter Milan", "Inter") >= 0.8 && DF.simile("AC Milan", "Inter") === 0 && DF.simile("Al Ittihad", "Al Ain") === 0, "nomi delle squadre");
  const ko = "2026-11-08T19:45:00+00:00";
  const matches = [{ id: "SA-1", h: "Roma", a: "Inter", ko, p: [0.3, 0.27, 0.43] }];
  const forza = { casa: 60, t: { Inter: [1720, "I1"], Lecce: [1450, "I1"], Bayern: [1800, "D1"] } };
  const prossime = [{ id: "a", date: ko, avv: "AS Roma", casa: false, comp: "Serie A" }, { id: "b", date: "2026-11-22T17:00Z", avv: "Lecce", casa: true },
    { id: "c", date: "2026-11-26T20:00Z", avv: "Bayern Munich", casa: true }, { id: "d", date: "2026-11-30T20:00Z", avv: "Napoli", casa: false }];
  const r = DF.difficolta(prossime, "Inter Milan", matches, forza);
  ok(r.length === 3, "difficoltà: solo le prossime 3");
  ok(r[0].fonte === "ia" && r[0].mid === "SA-1" && Math.abs(r[0].prob[0] - 0.43) < 1e-9 && Math.abs(r[0].punti - (3 * 0.43 + 0.27)) < 1e-9, `difficoltà dall'IA, lato ospite: ${JSON.stringify(r[0])}`);
  ok(r[1].fonte === "elo" && r[1].livello === "Facile", `difficoltà dall'Elo contro una squadra più debole in casa: ${JSON.stringify(r[1])}`);
  ok(r[2].fonte === null && r[2].livello === null, "campionati diversi (coppa): non stimabile");
  ok(DF.difficolta(prossime, "Inter", [], null)[1].livello === null, "senza forza.json: non stimabile");
}
// diretta: barra della pressione (chi spinge negli ultimi 15 minuti) dalla cronaca
{
  const outP = path.join(tmp, "pressione.mjs");
  await esbuild.build({ entryPoints: [path.join(APP, "src/pressione.js")], bundle: true, platform: "node", format: "esm", outfile: outP, logLevel: "error" });
  const PR = await import(pathToFileURL(outP).href);
  const cr = [{ min: "52'", side: 0, type: "shot-on-target", x: 88 }, { min: "55'", side: 0, type: "corner-awarded" }, { min: "58'", side: 0, type: "shot-off-target", x: 80 },
    { min: "60'", side: 1, type: "shot-blocked", x: 75 }, { min: "61'", side: 0, type: "ball-touch", x: 78 }, { min: "62'", side: 1, type: "foul", x: 90 },
    { min: "20'", side: 1, type: "shot-on-target", x: 90 }, { min: "45'+2'", side: 1, type: "goal", x: 95 }];
  const a = PR.pressione(cr, 63);
  ok(Math.abs(a.sp[0] - 1.9) < 1e-9 && Math.abs(a.sp[1] - 0.4) < 1e-9, `pressione: pesi e finestra di 15 minuti (${a.sp})`);
  ok(a.chi === 0 && a.quota > 0.8, "pressione: spinge la squadra di casa");
  ok(PR.pressione(cr, 49).sp[1] === 1, "pressione: gol in recupero dentro la finestra");
  ok(PR.pressione([{ min: "10'", side: 0, type: "corner-awarded" }], 12).quota === null, "pressione: troppe poche azioni");
  ok(PR.conPosizioni(cr) && !PR.conPosizioni([{ min: "1'", side: 0, type: "goal" }]), "cronaca con e senza posizioni");
}
console.log(`${prove} controlli, ${errori} errori`);
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(errori ? 1 : 0);
