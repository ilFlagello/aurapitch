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
const b = await pw.chromium.launch();
async function giro(tema) {
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, colorScheme: tema });
  p.on("pageerror", (e) => errori.push(`[${tema}] errore: ${e.message}`));
  p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|net::/.test(m.text())) errori.push(`[${tema}] console: ${m.text()}`); });
  await p.route(/^(?!http:\/\/127\.0\.0\.1)/, (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await p.goto(URL0);
  await p.evaluate(() => { localStorage.setItem("ap:onb", "true"); localStorage.setItem("ap:guideSeen", "true"); localStorage.setItem("ap:swipeOk", "true"); });
  await p.reload(); await p.waitForTimeout(1200);
  const foto = (n) => p.screenshot({ path: path.join(OUT, `${tema}-${n}.png`) });
  const passo = async (nome, fn) => { try { await fn(); } catch (e) { errori.push(`[${tema}] ${nome}: ${e.message.split("\n")[0]}`); } };
  await foto("partite");
  const tab = async (n) => { await p.getByRole("tab", { name: n, exact: true }).first().click({ timeout: 5000 }); await p.waitForTimeout(250); };
  const dock = async (n) => { await p.getByRole("button", { name: n, exact: true }).click({ timeout: 5000 }); await p.waitForTimeout(600); };
  await passo("partita", async () => {
    await p.locator("main button").filter({ hasText: /\d\d:\d\d/ }).first().click(); await p.waitForTimeout(1000);
    for (const n of ["Partita", "Formazioni", "IA", "Statistiche", "Cronaca", "In breve"]) { await tab(n); await foto("partita-" + n.replace(" ", "")); }
    await p.getByRole("button", { name: /Partite/ }).first().click(); await p.waitForTimeout(400);
  });
  await passo("campionati", async () => { await dock("Campionati"); for (const n of ["Classifica", "Marcatori", "Assist", "Voti", "Confronta"]) { await tab(n); } await foto("campionati"); });
  await passo("schedina", async () => {
    await dock("Schedina IA"); await tab("Crea con l'IA"); await p.waitForTimeout(800);
    await p.locator("button", { hasText: /^×10$/ }).click(); await p.waitForTimeout(300); await foto("schedina-x10");
    const altra = p.getByRole("button", { name: "Un'altra combinazione" }); if (await altra.count()) await altra.click();
    for (const n of ["La mia schedina", "Diario", "Storico IA"]) { await tab(n); await foto("schedina-" + n.replace(/ /g, "")); }
  });
  await passo("club", async () => { await dock("Il Mio Club"); for (const n of ["La mia squadra", "Gara", "Traguardi", "Account"]) { await tab(n); await foto("club-" + n.replace(/ /g, "")); } });
  await passo("ricerca", async () => { await p.getByRole("button", { name: /Cerca/ }).first().click(); await p.keyboard.type("Inter"); await p.waitForTimeout(400); await foto("ricerca"); });
  const testo = await p.evaluate(() => document.body.innerText);
  if (/undefined|NaN/.test(testo)) errori.push(`[${tema}] testo con "undefined" o "NaN" nell'ultima schermata`);
  await p.close();
}
for (const t of ["light", "dark"]) await giro(t);
await b.close(); srv.close();
console.log(errori.length ? errori.join("\n") : "Interfaccia: nessun errore");
process.exit(errori.length ? 1 : 0);
