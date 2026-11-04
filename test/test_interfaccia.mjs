// Prova dell'interfaccia (node test/test_interfaccia.mjs, dopo "node build.mjs"): apre tutte le schermate in tema chiaro e scuro
// su app/dist, con le fonti esterne (ESPN, meteo, servizio notifiche) sostituite da risposte vuote, e segnala ogni errore.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const RADICE = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const DIST = path.join(RADICE, "app", "dist");
const MODS = process.env.AP_NODE_MODULES || path.join(RADICE, "app", "node_modules");
let pw;
try { pw = createRequire(path.join(MODS, "noop.js"))("playwright"); } catch (e) { pw = createRequire(import.meta.url)("playwright"); }
const OUT = path.join(RADICE, "test", "schermate");
fs.mkdirSync(OUT, { recursive: true });

const TIPI = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json" };
const srv = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]); if (p.endsWith("/")) p += "index.html";
  const f = path.join(DIST, p);
  if (!f.startsWith(DIST) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "Content-Type": TIPI[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(res);
}).listen(0);
const URL0 = `http://127.0.0.1:${srv.address().port}/`;

const errori = [];
// budget di velocità: codice scaricato all'avvio (compresso) sotto i 150 KB (185 fino al 4/11: la scheda partita ora si scarica dopo, 172 -> 132 KB)
// (175 fino alla 1.9; la 2.0 ha aggiunto storico schedine, "perché è cambiato" e probabilità in diretta: l'apertura resta sotto i 250 ms, il limite vero qui sotto è 2,5 secondi)
{
  const zlib = await import("node:zlib");
  const sw = fs.readFileSync(path.join(DIST, "sw.js"), "utf8");
  // file scaricati davvero all'avvio: app.js e i pezzi che importa (anche indirettamente). Fino al 4/11 si contavano tutti i pezzi
  // "chunk-", anche quelli usati solo dalle schermate caricate dopo (stima per eccesso: 172 KB contro 116 reali)
  const avvio = [], visita = (f) => { if (avvio.includes(f)) return; avvio.push(f);
    const dir = path.posix.dirname(f), t = fs.readFileSync(path.join(DIST, f), "utf8");
    for (const m of t.matchAll(/(?:from|import)\s*"(\.\/[^"]+\.js)"/g)) visita(path.posix.normalize(path.posix.join(dir, m[1]))); };
  visita("app.js");
  const vecchio = ["app.js", ...((/const PARTI = (\[[^\]]*\])/.exec(sw) || [0, "[]"])[1] ? JSON.parse((/const PARTI = (\[[^\]]*\])/.exec(sw) || [0, "[]"])[1]).filter((f) => /chunk-/.test(f)) : [])];
  console.log(`Codice all'avvio, conteggio di prima (tutti i pezzi "chunk-"): ${(vecchio.reduce((n, f) => n + zlib.gzipSync(fs.readFileSync(path.join(DIST, f))).length, 0) / 1024).toFixed(0)} KB compressi`);
  console.log(`File all'avvio: ${avvio.join(", ")}`);
  const kb = avvio.reduce((n, f) => n + zlib.gzipSync(fs.readFileSync(path.join(DIST, f))).length, 0) / 1024;
  console.log(`Codice all'avvio: ${kb.toFixed(0)} KB compressi`);
  if (kb > 150) errori.push(`avvio troppo pesante: ${kb.toFixed(0)} KB compressi (budget 150)`);
}
const b = await pw.chromium.launch();
async function giro(tema) {
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, colorScheme: tema, acceptDownloads: true, hasTouch: true });
  p.on("pageerror", (e) => errori.push(`[${tema}] errore: ${e.message}`));
  p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|net::/.test(m.text())) errori.push(`[${tema}] console: ${m.text()}`); });
  await p.route(/^(?!http:\/\/127\.0\.0\.1)/, (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  const passo0 = async (nome, fn) => { try { await fn(); } catch (e) { errori.push(`[${tema}] ${nome}: ${e.message.split("\n")[0]}`); } };
  await p.goto(URL0);
  await p.waitForTimeout(800);
  // primo avvio: prima di tutto il benvenuto con 18+, termini e privacy; "Entra" resta spento finché non si spunta
  await passo0("benvenuto", async () => {
    if (!(await p.getByText("Ho almeno").count())) { errori.push(`[${tema}] manca il benvenuto con 18+ e consensi`); return; }
    if (await p.getByRole("button", { name: "Entra", exact: true }).isEnabled()) errori.push(`[${tema}] benvenuto: si entra senza accettare`);
    await p.getByRole("button", { name: "Privacy", exact: true }).first().click(); await p.waitForTimeout(200);
    if (!(await p.getByText("I tuoi diritti").count())) errori.push(`[${tema}] informativa privacy non apribile dal benvenuto`);
    await p.keyboard.press("Escape"); await p.getByLabel("Chiudi").last().click(); await p.waitForTimeout(150);
    await p.locator("#eta").check(); await p.locator("#acc").check();
    await p.getByRole("button", { name: "Entra", exact: true }).click(); await p.waitForTimeout(200);
    if (await p.getByText("Ho almeno").count()) errori.push(`[${tema}] benvenuto: non si chiude dopo l'accettazione`);
  });
  await p.evaluate(() => { localStorage.setItem("ap:onb", "true"); localStorage.setItem("ap:guideSeen", "true"); localStorage.setItem("ap:swipeOk", "true"); });
  // guida delle funzionalità: parte da sola la prima volta, "Salta" la ferma per sempre, il "?" la riapre
  await p.reload(); await p.waitForTimeout(1000);
  await passo0("guida", async () => {
    if (!(await p.getByText("Benvenuto in AuraPitch").count())) { errori.push(`[${tema}] la guida non parte al primo avvio`); return; }
    await p.screenshot({ path: path.join(OUT, `${tema}-guida.png`) });
    await p.getByRole("button", { name: "Avanti" }).click(); await p.waitForTimeout(200);
    if (!(await p.getByText("Ogni partita, a colpo d'occhio").count())) errori.push(`[${tema}] guida: "Avanti" non funziona`);
    await p.getByRole("button", { name: "Salta" }).click(); await p.waitForTimeout(200);
    await p.reload(); await p.waitForTimeout(1000);
    if (await p.getByText("Benvenuto in AuraPitch").count()) errori.push(`[${tema}] la guida riparte dopo "Salta"`);
    await p.getByRole("button", { name: "Guida rapida" }).click(); await p.waitForTimeout(200);
    if (!(await p.getByText("Benvenuto in AuraPitch").count())) errori.push(`[${tema}] il "?" non riapre la guida`);
    await p.getByRole("button", { name: "Salta" }).click(); await p.waitForTimeout(200);
  });
  await p.reload(); await p.waitForTimeout(1200);
  const foto = (n) => p.screenshot({ path: path.join(OUT, `${tema}-${n}.png`) });
  const passo = async (nome, fn) => { try { await fn(); } catch (e) { errori.push(`[${tema}] ${nome}: ${e.message.split("\n")[0]}`); } };
  await foto("partite");
  // apertura con la copia salvata: la lista deve comparire entro 2,5 secondi (in pratica molto meno)
  await passo0("velocità di apertura", async () => {
    const t0 = Date.now(); await p.reload(); await p.getByRole("button", { name: /In diretta/ }).first().waitFor({ timeout: 8000 }); // con partite in corso i pulsanti sono due
    const ms = Date.now() - t0; console.log(`[${tema}] apertura: ${ms} ms`);
    if (ms > 2500) errori.push(`[${tema}] apertura lenta: ${ms} ms`);
  });
  // apertura di una partita subito dopo l'avvio (codice della scheda non ancora scaricato) e a app già aperta: entro 1,5 secondi
  await passo0("velocità di apertura della partita", async () => {
    await p.reload(); await p.getByRole("button", { name: /In diretta/ }).first().waitFor({ timeout: 8000 });
    const t0 = Date.now(); await p.locator("main button").filter({ hasText: /\d\d:\d\d/ }).first().click();
    await p.getByRole("tab", { name: "In breve", exact: true }).first().waitFor({ timeout: 8000 });
    const ms = Date.now() - t0; console.log(`[${tema}] apertura partita subito dopo l'avvio: ${ms} ms`);
    if (ms > 1500) errori.push(`[${tema}] apertura della partita lenta: ${ms} ms`);
    await p.getByRole("button", { name: "Partite", exact: true }).first().click(); await p.waitForTimeout(1500);
    const t1 = Date.now(); await p.locator("main button").filter({ hasText: /\d\d:\d\d/ }).nth(1).click();
    await p.getByRole("tab", { name: "In breve", exact: true }).first().waitFor({ timeout: 8000 });
    console.log(`[${tema}] apertura partita ad app aperta: ${Date.now() - t1} ms`);
    await p.getByRole("button", { name: "Partite", exact: true }).first().click(); await p.waitForTimeout(400);
  });
  const tab = async (n) => { await p.getByRole("tab", { name: n, exact: true }).first().click({ timeout: 5000 }); await p.waitForTimeout(250); };
  const dock = async (n) => { await p.getByRole("button", { name: n, exact: true }).click({ timeout: 5000 }); await p.waitForTimeout(600); };
  await passo("partita", async () => {
    await p.locator("main button").filter({ hasText: /\d\d:\d\d/ }).first().click(); await p.waitForTimeout(1000);
    for (const n of ["Partita", "Formazioni", "IA", "Statistiche", "Cronaca", "In breve"]) { await tab(n); await foto("partita-" + n.replace(" ", "")); }
    // voci a scomparsa: si aprono e si richiudono
    await tab("Statistiche");
    const voce = p.getByRole("button", { name: /Scontri diretti/ }).first();
    if (await voce.count()) { await voce.click(); await p.waitForTimeout(200); if (!(await p.getByText("Riduci").count())) errori.push(`[${tema}] voce: non si apre`); await p.getByText("Riduci").first().click(); }
    await tab("In breve");
    // calendario e immagine della partita: devono produrre un file
    for (const [nome, est] of [["Nel calendario", ".ics"], ["Condividi la partita", ".png"]]) {
      const b = p.getByRole("button", { name: nome }); if (!(await b.count())) continue;
      const [dl] = await Promise.all([p.waitForEvent("download", { timeout: 8000 }), b.click()]);
      if (!dl.suggestedFilename().endsWith(est)) errori.push(`[${tema}] ${nome}: file inatteso ${dl.suggestedFilename()}`);
    }
    await p.getByRole("button", { name: /Partite/ }).first().click(); await p.waitForTimeout(400);
  });
  await passo("campionati", async () => { await dock("Campionati"); for (const n of ["Classifica", "Marcatori", "Assist", "Voti", "Confronta", "Panchine"]) { await tab(n); } await foto("campionati"); });
  await passo("schedina", async () => {
    await dock("Schedina IA"); await tab("Crea con l'IA"); await p.waitForTimeout(800);
    // scelta dei campionati: foglio con gruppi, "Scegli/Togli tutti", ricerca, "Fatto"
    await p.getByRole("button", { name: /^Campionati: \d+ su \d+/ }).click(); await p.waitForTimeout(300); await foto("schedina-campionati");
    const tit0 = await p.getByText(/^Campionati della schedina: \d+ su \d+$/).textContent();
    await p.getByRole("button", { name: "Tutti", exact: true }).last().click();
    const tit1 = await p.getByText(/^Campionati della schedina: \d+ su \d+$/).textContent();
    const [n1, m1] = tit1.match(/\d+/g).map(Number); if (n1 !== m1) errori.push(`[${tema}] campionati: "Tutti" non li sceglie tutti (${tit1})`);
    await p.getByRole("button", { name: "Togli tutti" }).first().click();
    if ((await p.getByText(/^Campionati della schedina: \d+ su \d+$/).textContent()) === tit1) errori.push(`[${tema}] campionati: "Togli tutti" non cambia nulla`);
    await p.getByPlaceholder("Cerca campionato o paese").fill("zzzz"); if (!(await p.getByText("Nessun campionato trovato.").count())) errori.push(`[${tema}] campionati: la ricerca non filtra`);
    await p.getByRole("button", { name: "Consigliati" }).click(); await p.getByRole("button", { name: "Fatto" }).click(); await p.waitForTimeout(300);
    if (!tit0) errori.push(`[${tema}] campionati: titolo del foglio mancante`);
    await p.locator("button", { hasText: /^×10$/ }).click(); await p.waitForTimeout(300); await foto("schedina-x10");
    const altra = p.getByRole("button", { name: "Un'altra combinazione" }); if (await altra.count()) await altra.click();
    // scorrere i moltiplicatori col dito non deve cambiare scheda; un gesto su una zona libera sì
    const gesto = (sel) => p.evaluate((sel) => { const el = document.querySelector(sel); if (!el) return "manca";
      const r = el.getBoundingClientRect(), y = r.top + r.height / 2;
      const tt = (x) => [new Touch({ identifier: 1, target: el, clientX: x, clientY: y })];
      el.dispatchEvent(new TouchEvent("touchstart", { touches: tt(320), changedTouches: tt(320), bubbles: true }));
      el.dispatchEvent(new TouchEvent("touchend", { touches: [], changedTouches: tt(60), bubbles: true })); return "ok"; }, sel);
    await gesto("button.min-w-\\[52px\\]"); await p.waitForTimeout(300);
    if ((await p.getByRole("tab", { name: "Crea con l'IA" }).getAttribute("aria-selected")) !== "true") errori.push(`[${tema}] scorrere i moltiplicatori ha cambiato scheda`);
    await gesto("p.text-\\[12px\\]"); await p.waitForTimeout(300);
    if ((await p.getByRole("tab", { name: "La mia schedina" }).getAttribute("aria-selected")) !== "true") errori.push(`[${tema}] il gesto su una zona libera non cambia scheda`);
    await tab("Crea con l'IA");
    // schedina con esito scelto
    await p.getByRole("button", { name: "Tutti pareggi (X)" }).click(); await p.waitForTimeout(300);
    const legX = await p.locator("text=/IA \\d+%/").count();
    if (!legX) errori.push(`[${tema}] schedina "tutti pareggi" vuota`);
    await p.getByRole("button", { name: "Scelta IA" }).click(); await p.waitForTimeout(200);
    const [dl] = await Promise.all([p.waitForEvent("download", { timeout: 8000 }), p.getByRole("button", { name: /Condividi immagine/ }).first().click()]);
    if (!dl.suggestedFilename().endsWith(".png")) errori.push(`[${tema}] immagine della schedina: file inatteso`);
    for (const n of ["La mia schedina", "Diario", "Storico IA"]) { await tab(n); await foto("schedina-" + n.replace(/ /g, "")); }
  });
  await passo("profilo: account, privacy, recensione", async () => {
    await p.getByRole("button", { name: "Profilo e impostazioni" }).click(); await p.waitForTimeout(300);
    for (const t of ["Statistiche d'uso anonime", "Sicurezza", "Dicci cosa ne pensi", "800 55 88 22"]) if (!(await p.getByText(t).count())) errori.push(`[${tema}] profilo: manca "${t}"`);
    await foto("profilo");
    await p.getByRole("button", { name: "Dicci cosa ne pensi" }).click(); await p.waitForTimeout(300);
    if (!(await p.getByRole("radiogroup", { name: "Voto da 1 a 5" }).count())) errori.push(`[${tema}] recensione: mancano le stelle`);
    await foto("recensione");
    await p.getByLabel("Chiudi").last().click(); await p.waitForTimeout(200);
  });
  await passo("come sta andando l'IA", async () => {
    if (!(await p.getByText("Come sta andando l'IA").count())) { errori.push(`[${tema}] Storico IA: manca la pagina dell'apprendimento`); return; }
    if (!(await p.getByRole("button", { name: /IA contro mercato/ }).count())) errori.push(`[${tema}] pagina IA: manca "IA contro mercato"`);
    for (const v of ["IA contro mercato", "Probabilità oneste", "IA contro bookmaker", "Valore anticipato", "Quanto pesano notizie e assenze"]) {
      const bt = p.getByRole("button", { name: new RegExp(v) }).first();
      if (await bt.count()) { await bt.click(); await p.waitForTimeout(150); }
    }
    if (!(await p.getByText("Quando si è allontanata, aveva ragione?").count())) errori.push(`[${tema}] pagina IA: "IA contro mercato" non si apre`);
    const t = await p.evaluate(() => document.body.innerText);
    if (/undefined|NaN/.test(t)) errori.push(`[${tema}] pagina IA: testo con "undefined" o "NaN"`);
    await p.screenshot({ path: path.join(OUT, `${tema}-ia.png`), fullPage: true });
  });
  await passo("club", async () => { await dock("Il Mio Club"); for (const n of ["La mia squadra", "Gara", "Traguardi", "Account"]) { await tab(n); await foto("club-" + n.replace(/ /g, "")); } });
  await passo("indietro del telefono", async () => {
    await p.getByRole("button", { name: "Partite", exact: true }).last().click({ timeout: 5000 }); await p.waitForTimeout(400);
    await p.evaluate(() => window.scrollTo(0, 300)); await p.waitForTimeout(150);
    const righe = p.locator("main button").filter({ hasText: /\d\d:\d\d/ }); let presa = false;
    for (let i = 0; i < Math.min(30, await righe.count()) && !presa; i++) { const b = await righe.nth(i).boundingBox(); if (b && b.y > 120 && b.y < 600) { await p.mouse.click(b.x + 40, b.y + 15); presa = true; } }
    await p.waitForTimeout(700);
    await p.goBack(); await p.waitForTimeout(700);
    if (!(await p.getByRole("button", { name: /In diretta/ }).count())) errori.push(`[${tema}] il tasto indietro non torna alla lista`);
    const y = await p.evaluate(() => window.scrollY);
    if (y < 100) errori.push(`[${tema}] tornando indietro si perde il punto della lista (scroll ${y})`);
  });
  await passo("ricarica tirando giù", async () => {
    await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(150);
    const m = p.locator("main");
    const tocca = (y) => m.dispatchEvent("touchmove", { touches: [{ identifier: 1, clientX: 200, clientY: y }] });
    await m.dispatchEvent("touchstart", { touches: [{ identifier: 1, clientX: 200, clientY: 150 }] });
    for (const y of [180, 230, 290, 330]) { await tocca(y); await p.waitForTimeout(30); }
    if (!(await p.getByText("Rilascia per aggiornare").count())) errori.push(`[${tema}] ricarica: manca l'indicatore`);
    await foto("ricarica");
    await m.dispatchEvent("touchend", { touches: [] }); await p.waitForTimeout(900);
  });
  await passo("ricerca", async () => { await p.getByRole("button", { name: /Cerca/ }).first().click(); await p.keyboard.type("Inter"); await p.waitForTimeout(400); await foto("ricerca");
    await p.keyboard.press("Control+A"); await p.keyboard.type("Serie"); await p.waitForTimeout(300);
    if (!(await p.getByText("Campionati", { exact: true }).count())) errori.push(`[${tema}] ricerca: i campionati non compaiono`); });
  await passo("offline", async () => { await p.keyboard.press("Escape"); await p.context().setOffline(true); await p.waitForTimeout(300);
    if (!(await p.getByText("Sei offline").count())) errori.push(`[${tema}] offline: manca l'avviso`); await p.context().setOffline(false); });
  const testo = await p.evaluate(() => document.body.innerText);
  if (/undefined|NaN/.test(testo)) errori.push(`[${tema}] testo con "undefined" o "NaN" nell'ultima schermata`);
  await p.close();
}
// campionati senza quote (punto 2 del 3/11): elenco a parte, riga senza barra delle quote, scheda senza consiglio e senza schedina
async function giroSenzaQuote(tema) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, colorScheme: tema, hasTouch: true, serviceWorkers: "block" });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errori.push(`[${tema} senza quote] errore: ${e.message}`));
  await p.route(/^(?!http:\/\/127\.0\.0\.1)/, (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await p.route(/\/data\/lista\.json/, async (r) => {
    const res = await r.fetch(); const j = await res.json(); const oggi = j.today;
    j.leagues.push({ k: "RU1", name: "Premier League russa", country: "Russia", flag: "ru", nq: true, lgE: "rus.1" });
    j.standings.RU1 = { generale: [{ team: "Spartak Moscow", pg: 14, v: 9, n: 3, p: 2, gf: 25, gs: 12, pt: 30 }, { team: "CSKA Moscow", pg: 14, v: 8, n: 3, p: 3, gf: 22, gs: 14, pt: 27 }], casa: [], trasferta: [], solo_generale: true, inclusi: [] };
    j.senza_quote = [
      { id: "NQ-RU1-1", nq: true, lg: "RU1", lgE: "rus.1", eid: "1", date: oggi, time: "08:00", ko: oggi + "T07:00:00+00:00", h: "Krylia Sovetov", a: "Zenit", st: "FT", g: [0, 3], g1: null, res: 2 },
      { id: "NQ-RU1-2", nq: true, lg: "RU1", lgE: "rus.1", eid: "2", date: oggi, time: "23:30", ko: oggi + "T22:30:00+00:00", h: "Spartak Moscow", a: "CSKA Moscow", st: "NS", g: null, g1: null, res: null, q: [2.2, 3.4, 3.1], pq: [0.44, 0.27, 0.29] }];
    await r.fulfill({ response: res, json: j });
  });
  await p.goto(URL0); await p.waitForTimeout(800);
  await p.evaluate(() => { localStorage.setItem("ap:onb", "true"); localStorage.setItem("ap:guideSeen", "true"); localStorage.setItem("ap:swipeOk", "true"); });
  if (await p.getByText("Ho almeno").count()) { await p.locator("#eta").check(); await p.locator("#acc").check(); await p.getByRole("button", { name: "Entra", exact: true }).click(); }
  await p.reload(); await p.waitForTimeout(1200);
  if (await p.getByRole("button", { name: "Salta" }).count()) await p.getByRole("button", { name: "Salta" }).click();
  try {
    await p.getByRole("button", { name: /Premier League russa/ }).first().click({ timeout: 5000 }); await p.waitForTimeout(300);
    if (!(await p.getByText("Senza quote · risultati e diretta").count())) errori.push(`[${tema}] senza quote: la riga della partita senza quote non compare`);
    await p.getByRole("button", { name: /Spartak Moscow/ }).first().click(); await p.waitForTimeout(500);
    if (!(await p.getByText("Campionato senza analisi IA.").count())) errori.push(`[${tema}] senza quote: manca l'avviso nella scheda`);
    if (await p.getByText(/Aggiungi alla tua schedina|Consiglio IA/).count()) errori.push(`[${tema}] senza quote: compare la schedina o il consiglio`);
    await p.getByRole("tab", { name: "Classifica", exact: true }).first().click(); await p.waitForTimeout(200);
    if (!(await p.getByText("CSKA Moscow").count())) errori.push(`[${tema}] senza quote: classifica assente`);
    await p.screenshot({ path: path.join(OUT, `${tema}-senza-quote.png`) });
    const t = await p.evaluate(() => document.body.innerText);
    if (/undefined|NaN/.test(t)) errori.push(`[${tema}] senza quote: testo con "undefined" o "NaN"`);
  } catch (e) { errori.push(`[${tema}] senza quote: ${e.message.split("\n")[0]}`); }
  await ctx.close();
}
// scheda squadra (punto 3 del 3/11): forma delle ultime 5 e difficoltà delle prossime 3, con calendario ESPN finto
async function giroSquadra(tema) {
  const L = JSON.parse(fs.readFileSync(path.join(DIST, "data", "lista.json"), "utf8"));
  const m0 = L.matches.find((m) => m.date === L.today && ["CL", "I1", "E0", "SP1", "D1"].includes(m.lg));
  if (!m0) return;
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, colorScheme: tema, hasTouch: true, serviceWorkers: "block" });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errori.push(`[${tema} squadra] errore: ${e.message}`));
  const ev = (id, giorni, avv, casa, g) => { const d = new Date(Date.now() + giorni * 86400e3).toISOString();
    const me = { homeAway: casa ? "home" : "away", team: { id: "99", displayName: m0.h }, score: g ? String(g[0]) : null };
    const op = { homeAway: casa ? "away" : "home", team: { id: "77", displayName: avv, shortDisplayName: avv }, score: g ? String(g[1]) : null };
    return { id, date: d, league: { abbreviation: "UCL" }, competitions: [{ competitors: casa ? [me, op] : [op, me], status: { type: { state: g ? "post" : "pre" } } }] }; };
  await p.route(/^(?!http:\/\/127\.0\.0\.1)/, (r) => {
    const u = decodeURIComponent(r.request().url()), cors = { "Access-Control-Allow-Origin": "*" };
    if (/\/teams$/.test(u)) return r.fulfill({ headers: cors, json: { sports: [{ leagues: [{ teams: [{ team: { id: "99", displayName: m0.h, shortDisplayName: m0.h, name: m0.h } }] }] }] } });
    if (/\/teams\/99\/schedule\?fixture=true/.test(u)) return r.fulfill({ headers: cors, json: { events: [ev("f1", 4, "Lecce", true), ev("f2", 9, "Bayern", false), ev("f3", 13, "Roma", true)] } });
    if (/\/teams\/99\/schedule/.test(u)) return r.fulfill({ headers: cors, json: { events: [ev("r1", -20, "Genoa", true, [2, 0]), ev("r2", -16, "Milan", false, [1, 1]), ev("r3", -12, "Como", true, [0, 1]), ev("r4", -8, "Pisa", false, [3, 1]), ev("r5", -4, "Lazio", true, [2, 2])] } });
    return r.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
  await p.goto(URL0); await p.waitForTimeout(800);
  await p.evaluate(() => { localStorage.setItem("ap:onb", "true"); localStorage.setItem("ap:guideSeen", "true"); localStorage.setItem("ap:swipeOk", "true"); });
  if (await p.getByText("Ho almeno").count()) { await p.locator("#eta").check(); await p.locator("#acc").check(); await p.getByRole("button", { name: "Entra", exact: true }).click(); }
  await p.reload(); await p.waitForTimeout(1200);
  if (await p.getByRole("button", { name: "Salta" }).count()) await p.getByRole("button", { name: "Salta" }).click();
  try {
    await p.locator("main button").filter({ hasText: m0.h }).filter({ hasText: m0.a }).first().click({ timeout: 5000 }); await p.waitForTimeout(600);
    await p.locator("main button").filter({ hasText: m0.h }).filter({ hasText: /in classifica|Pagina squadra/ }).first().click({ timeout: 5000 }); await p.waitForTimeout(900);
    if (!(await p.getByText("Forma, ultime 5").count())) errori.push(`[${tema}] squadra: manca la forma delle ultime 5`);
    if (!(await p.getByText(/Prossime 3: quanto sono difficili/).count())) errori.push(`[${tema}] squadra: manca la difficoltà delle prossime 3`);
    if (!(await p.getByText("8 punti su 15", { exact: false }).count()) && !(await p.getByText(/8\s*punti su 15/).count())) errori.push(`[${tema}] squadra: punti della forma sbagliati`);
    await p.screenshot({ path: path.join(OUT, `${tema}-squadra-forma.png`) });
    const t = await p.evaluate(() => document.body.innerText);
    if (/undefined|NaN/.test(t)) errori.push(`[${tema}] squadra: testo con "undefined" o "NaN"`);
  } catch (e) { errori.push(`[${tema}] squadra: ${e.message.split("\n")[0]}`); }
  await ctx.close();
}
// diretta (punto 4 del 3/11): barra "Chi spinge adesso" con una partita finta in corso (scoreboard e scheda ESPN finti)
async function giroPressione(tema) {
  const L = JSON.parse(fs.readFileSync(path.join(DIST, "data", "lista.json"), "utf8"));
  const m0 = L.matches.find((m) => m.date === L.today && ["CL", "I1", "E0", "SP1", "D1"].includes(m.lg));
  if (!m0) return;
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, colorScheme: tema, hasTouch: true, serviceWorkers: "block" });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errori.push(`[${tema} pressione] errore: ${e.message}`));
  const cors = { "Access-Control-Allow-Origin": "*" };
  const sq = (j) => ({ homeAway: j ? "away" : "home", score: j ? "0" : "1", team: { id: j ? "2" : "1", displayName: j ? m0.a : m0.h, shortDisplayName: j ? m0.a : m0.h, name: j ? m0.a : m0.h, color: j ? "1d4ed8" : "dc2626" } });
  const stato = { type: { state: "in", name: "STATUS_SECOND_HALF", completed: false }, displayClock: "63'" };
  const giocata = (min, j, tipo, x) => ({ time: { displayValue: min, value: parseInt(min) * 60 }, text: "Attempt saved.", play: { type: { type: tipo }, team: { displayName: j ? m0.a : m0.h }, fieldPositionX: x, fieldPositionY: 40, period: { number: 2 } } });
  await p.route(/^(?!http:\/\/127\.0\.0\.1)/, (r) => {
    const u = decodeURIComponent(r.request().url());
    if (/\/scoreboard\?dates=/.test(u)) return r.fulfill({ headers: cors, json: { events: [{ id: "555", date: m0.ko, status: stato, competitions: [{ competitors: [sq(0), sq(1)] }] }] } });
    if (/\/summary\?event=555/.test(u)) return r.fulfill({ headers: cors, json: { header: { competitions: [{ competitors: [sq(0), sq(1)], status: stato }] }, keyEvents: [], rosters: [], boxscore: { teams: [] },
      commentary: [giocata("52'", 0, "shot-on-target", 88), giocata("55'", 0, "corner-awarded", 99), giocata("58'", 0, "shot-off-target", 80), giocata("60'", 1, "shot-blocked", 75), giocata("61'", 0, "ball-touch", 78)] } });
    return r.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
  await p.goto(URL0); await p.waitForTimeout(800);
  await p.evaluate(() => { localStorage.setItem("ap:onb", "true"); localStorage.setItem("ap:guideSeen", "true"); localStorage.setItem("ap:swipeOk", "true"); });
  if (await p.getByText("Ho almeno").count()) { await p.locator("#eta").check(); await p.locator("#acc").check(); await p.getByRole("button", { name: "Entra", exact: true }).click(); }
  await p.reload(); await p.waitForTimeout(1500);
  if (await p.getByRole("button", { name: "Salta" }).count()) await p.getByRole("button", { name: "Salta" }).click();
  try {
    await p.locator("main button").filter({ hasText: m0.h }).filter({ hasText: m0.a }).first().click({ timeout: 5000 }); await p.waitForTimeout(800);
    await p.getByRole("tab", { name: "Partita", exact: true }).first().click(); await p.waitForTimeout(800);
    if (!(await p.getByText("Chi spinge adesso").count())) errori.push(`[${tema}] diretta: manca la barra della pressione`);
    else if (!(await p.getByText("Sta spingendo " + m0.h).count())) errori.push(`[${tema}] diretta: la pressione non indica la squadra di casa`);
    await p.screenshot({ path: path.join(OUT, `${tema}-pressione.png`) });
    const t = await p.evaluate(() => document.body.innerText);
    if (/undefined|NaN/.test(t)) errori.push(`[${tema}] diretta: testo con "undefined" o "NaN"`);
  } catch (e) { errori.push(`[${tema}] diretta: ${e.message.split("\n")[0]}`); }
  await ctx.close();
}
for (const t of ["light", "dark"]) await giro(t);
await giroSenzaQuote("light");
await giroSquadra("dark");
await giroPressione("light");
await b.close(); srv.close();
console.log(errori.length ? errori.join("\n") : "Interfaccia: nessun errore");
process.exit(errori.length ? 1 : 0);
