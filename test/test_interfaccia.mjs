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
// budget di velocità: codice scaricato all'avvio (compresso) sotto i 175 KB
{
  const zlib = await import("node:zlib");
  const sw = fs.readFileSync(path.join(DIST, "sw.js"), "utf8");
  const avvio = ["app.js", ...((/const PARTI = (\[[^\]]*\])/.exec(sw) || [0, "[]"])[1] ? JSON.parse((/const PARTI = (\[[^\]]*\])/.exec(sw) || [0, "[]"])[1]).filter((f) => /chunk-/.test(f)) : [])];
  const kb = avvio.reduce((n, f) => n + zlib.gzipSync(fs.readFileSync(path.join(DIST, f))).length, 0) / 1024;
  console.log(`Codice all'avvio: ${kb.toFixed(0)} KB compressi`);
  if (kb > 175) errori.push(`avvio troppo pesante: ${kb.toFixed(0)} KB compressi (budget 175)`);
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
  await p.reload(); await p.waitForTimeout(1200);
  const foto = (n) => p.screenshot({ path: path.join(OUT, `${tema}-${n}.png`) });
  const passo = async (nome, fn) => { try { await fn(); } catch (e) { errori.push(`[${tema}] ${nome}: ${e.message.split("\n")[0]}`); } };
  await foto("partite");
  // apertura con la copia salvata: la lista deve comparire entro 2,5 secondi (in pratica molto meno)
  await passo0("velocità di apertura", async () => {
    const t0 = Date.now(); await p.reload(); await p.getByRole("button", { name: /In diretta/ }).waitFor({ timeout: 8000 });
    const ms = Date.now() - t0; console.log(`[${tema}] apertura: ${ms} ms`);
    if (ms > 2500) errori.push(`[${tema}] apertura lenta: ${ms} ms`);
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
    for (const v of ["Probabilità oneste", "IA contro bookmaker", "Valore anticipato", "Quanto pesano notizie e assenze"]) {
      const bt = p.getByRole("button", { name: new RegExp(v) }).first();
      if (await bt.count()) { await bt.click(); await p.waitForTimeout(150); }
    }
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
for (const t of ["light", "dark"]) await giro(t);
await b.close(); srv.close();
console.log(errori.length ? errori.join("\n") : "Interfaccia: nessun errore");
process.exit(errori.length ? 1 : 0);
