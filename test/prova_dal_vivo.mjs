// Prova dal vivo (node test/prova_dal_vivo.mjs): ogni mattina apre il sito pubblicato VERO (non la copia compilata dei test),
// in formato iPhone, e percorre i passi di un utente: apertura, home, una partita, schedina, Il Mio Club, pagina dell'IA.
// Niente fonti finte: se ESPN, il servizio o i dati non rispondono, l'utente lo vedrebbe e la prova lo segnala.
// Segnala errori della pagina, testi con "undefined"/"NaN", schermate che non si aprono e tempi di apertura troppo lunghi.
// Scrive test/schermate-vivo/esito.json (letto dal controllo orario e dal riepilogo settimanale).
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const RADICE = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const MODS = process.env.AP_NODE_MODULES || path.join(RADICE, "app", "node_modules");
let pw;
try { pw = createRequire(path.join(MODS, "noop.js"))("playwright"); } catch (e) { pw = createRequire(import.meta.url)("playwright"); }
const SITO = process.env.AP_SITO || "https://ilflagello.github.io/aurapitch/";
const OUT = path.join(RADICE, "test", "schermate-vivo");
fs.mkdirSync(OUT, { recursive: true });
// tempi massimi (millisecondi): prima apertura su rete vera, riapertura con la copia salvata, apertura di una partita
const LIMITI = { prima: 9000, riapertura: 3500, partita: 4000 };

const errori = [], avvisi = [], tempi = {};
const b = await pw.chromium.launch();
const ctx = await b.newContext({ ...pw.devices["iPhone 13"], locale: "it-IT", timezoneId: "Europe/Rome" });
const p = await ctx.newPage();
p.on("pageerror", (e) => errori.push(`errore della pagina: ${e.message}`));
p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|net::|favicon/.test(m.text())) avvisi.push(`console: ${m.text().slice(0, 200)}`); });
const falliti = [];
p.on("response", (r) => { const u = r.url(); if (u.startsWith(SITO) && r.status() >= 400 && !/favicon/.test(u)) falliti.push(`${r.status()} ${u.slice(SITO.length)}`); });
const foto = (n) => p.screenshot({ path: path.join(OUT, `${n}.png`) }).catch(() => {});
const passo = async (nome, fn) => { try { await fn(); } catch (e) { errori.push(`${nome}: ${e.message.split("\n")[0]}`); await foto("errore-" + nome.replace(/\W+/g, "-")); } };
const tab = async (n) => { await p.getByRole("tab", { name: n, exact: true }).first().click({ timeout: 8000 }); await p.waitForTimeout(400); };
const dock = async (n) => { await p.getByRole("button", { name: n, exact: true }).click({ timeout: 8000 }); await p.waitForTimeout(900); };
// guida o "Novita" aperte sopra la pagina: si chiudono come farebbe l'utente, e si segnala (non dovrebbero ricomparire)
const chiudiFinestre = async () => {
  for (const nome of ["Salta", "Chiudi"]) {
    const b = p.getByRole("button", { name: nome, exact: true });
    if (await b.count() && await b.first().isVisible()) { avvisi.push(`finestra aperta sopra la pagina, chiusa con "${nome}"`); await b.first().click(); await p.waitForTimeout(400); }
  }
};
const testoPulito = async (dove) => { const t = await p.evaluate(() => document.body.innerText); if (/undefined|NaN/.test(t)) errori.push(`${dove}: testo con "undefined" o "NaN"`); };

await passo("prima apertura", async () => {
  const t0 = Date.now();
  await p.goto(SITO, { waitUntil: "domcontentloaded", timeout: 30000 });
  // primo avvio: benvenuto (18+ e consensi) come per un utente nuovo
  await p.getByText("Ho almeno").waitFor({ timeout: 15000 });
  tempi.prima = Date.now() - t0;
  await p.locator("#eta").check(); await p.locator("#acc").check();
  await p.getByRole("button", { name: "Entra", exact: true }).click();
  // come un utente che ha gia visto la guida delle funzionalita (chiave "guida2"): altrimenti la guida copre la pagina
  await p.evaluate(() => { for (const k of ["onb", "guideSeen", "guida2", "swipeOk"]) localStorage.setItem("ap:" + k, "true"); });
});
await passo("home", async () => {
  const t0 = Date.now();
  await p.reload({ waitUntil: "domcontentloaded" });
  await p.getByRole("button", { name: /In diretta/ }).waitFor({ timeout: 15000 });
  tempi.riapertura = Date.now() - t0;
  await chiudiFinestre();
  const righe = await p.locator("main button").filter({ hasText: /\d\d:\d\d/ }).count();
  if (!righe) errori.push("home: nessuna partita in lista");
  tempi.partite_in_lista = righe;
  await foto("home"); await testoPulito("home");
});
await passo("partita", async () => {
  const t0 = Date.now();
  await p.locator("main button").filter({ hasText: /\d\d:\d\d/ }).first().click({ timeout: 8000 });
  await p.getByRole("tab", { name: "In breve", exact: true }).first().waitFor({ timeout: 10000 });
  tempi.partita = Date.now() - t0;
  for (const n of ["Partita", "Formazioni", "IA", "Statistiche", "In breve"]) await tab(n);
  await foto("partita"); await testoPulito("partita");
  await p.goBack(); await p.waitForTimeout(800);
});
await passo("schedina", async () => {
  await dock("Schedina IA"); await tab("Crea con l'IA"); await p.waitForTimeout(2500); // i mercati arrivano dopo la lista
  const vuota = await p.getByText(/Nessuna partita (adatta|in questo periodo)/).count();
  if (vuota) avvisi.push("schedina: nessuna giocata proposta con le impostazioni di base");
  await tab("Storico IA");
  await foto("schedina"); await testoPulito("schedina");
});
await passo("pagina dell'IA", async () => {
  if (!(await p.getByText("Come sta andando l'IA").count())) errori.push("pagina dell'IA: non compare");
  await testoPulito("pagina dell'IA");
});
await passo("Il Mio Club", async () => {
  await dock("Il Mio Club");
  for (const n of ["La mia squadra", "Gara"]) await tab(n);
  await foto("club"); await testoPulito("Il Mio Club");
});
for (const [k, lim] of Object.entries(LIMITI)) if (tempi[k] != null && tempi[k] > lim) errori.push(`apertura lenta (${k}): ${tempi[k]} ms, limite ${lim} ms`);
if (falliti.length) errori.push(`file del sito non trovati: ${[...new Set(falliti)].slice(0, 5).join(", ")}`);
await b.close();
const esito = { quando: new Date().toISOString(), sito: SITO, ok: errori.length === 0, errori, avvisi: avvisi.slice(0, 10), tempi };
fs.writeFileSync(path.join(OUT, "esito.json"), JSON.stringify(esito, null, 1));
console.log(`Tempi: ${JSON.stringify(tempi)}`);
console.log(errori.length ? "PROBLEMI:\n - " + errori.join("\n - ") : "Prova dal vivo: tutto in ordine");
if (avvisi.length) console.log("Avvisi:\n - " + avvisi.slice(0, 10).join("\n - "));
process.exit(errori.length ? 1 : 0);
