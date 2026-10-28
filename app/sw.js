// AuraPitch - service worker: app installabile, apertura istantanea e uso offline.
// Strategia: l'app (pagina, codice, stili, icone) si apre SUBITO dalla copia salvata; ogni versione pubblicata ha la sua
// copia completa, scaricata in anticipo all'installazione del nuovo service worker (l'app poi propone "Aggiorna").
// I dati invece arrivano prima dalla rete (al massimo 6 secondi, poi copia salvata): l'app intanto mostra gli ultimi salvati.
const VERSIONE = "sviluppo"; // sostituita da build.mjs con l'impronta della versione pubblicata
const CACHE = "aurapitch-" + VERSIONE;
const PARTI = []; // pezzi del codice caricati su richiesta: elenco scritto da build.mjs
const SHELL = ["./", "index.html", "app.js", "app.css", "manifest.webmanifest", "icon.svg", "icon-192.png", "icon-512.png", "fonts/figtree.woff2", "fonts/bigshoulders.woff2", ...PARTI,
  ...["gol", "annullato", "rossi", "inizio", "intervallo", "finale", "formazioni", "promemoria", "test"].flatMap((t) => [`avvisi/${t}.png`, `avvisi/${t}-badge.png`])];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: "reload" })))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith("aurapitch-") && k !== CACHE && !k.endsWith("-dati")).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

// dati in una copia a parte, che sopravvive agli aggiornamenti dell'app (cosi l'apertura resta istantanea anche dopo)
const DATI = "aurapitch-dati";
function retePrima(req, ms) {
  const net = fetch(req).then((r) => { if (r.ok) { const c = r.clone(); caches.open(DATI).then((x) => x.put(req, c)); } return r; });
  const attesa = new Promise((ok) => setTimeout(ok, ms)).then(() => caches.match(req)).then((hit) => hit || net);
  return Promise.race([net.catch(() => caches.match(req)), attesa]);
}
function copiaPrima(e) {
  return caches.match(e.request, { ignoreSearch: e.request.mode === "navigate" }).then((hit) => hit || fetch(e.request).then((r) => {
    if (r.ok && new URL(e.request.url).origin === location.origin) { const c = r.clone(); caches.open(CACHE).then((x) => x.put(e.request, c)); }
    return r;
  }));
}

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  if (url.origin === location.origin && url.pathname.includes("/data/")) { e.respondWith(retePrima(e.request, 6000)); return; }
  if (url.origin !== location.origin) return;
  if (/\/(accesso|privacy|termini|sicurezza)\.html$|accesso-pagina\.js$|\.well-known/.test(url.pathname)) return; // pagine di servizio: sempre dalla rete
  e.respondWith(copiaPrima(e));
});

// Ogni tipo di avviso ha icona, badge e ritmo di vibrazione propri (la vibrazione funziona su Android;
// iPhone e browser usano sempre il suono di sistema: le web app non possono sceglierlo).
const AVVISO = {
  gol: { v: [80, 40, 80, 40, 260], forte: 1 }, annullato: { v: [150, 80, 150] }, rossi: { v: [420], forte: 1 },
  inizio: { v: [60, 60, 60, 60, 60] }, intervallo: { v: [120] }, finale: { v: [200, 100, 200], forte: 1 },
  formazioni: { v: [60, 40, 60] }, promemoria: { v: [100] }, test: { v: [80, 60, 80] },
};
// Notifiche push (servizio AuraPitch su Cloudflare): mostra l'avviso anche con l'app chiusa.
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { title: "AuraPitch", body: e.data ? e.data.text() : "" }; }
  const t = AVVISO[d.tipo] ? d.tipo : null, a = t ? AVVISO[t] : {};
  e.waitUntil(self.registration.showNotification(d.title || "AuraPitch", {
    body: d.body || "", tag: d.tag, data: { url: d.url || "./" },
    icon: t ? `avvisi/${t}.png` : "icon-192.png", badge: t ? `avvisi/${t}-badge.png` : "icon-192.png",
    vibrate: a.v || [100], renotify: !!a.forte, silent: !!a.muto,
  }));
});
// toccando la notifica si apre direttamente la partita (indirizzo ./#m=<id>)
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const dest = (e.notification.data && e.notification.data.url) || "./";
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((cs) => {
    for (const c of cs) if ("focus" in c) { c.postMessage({ apri: dest }); return c.focus(); }
    return self.clients.openWindow(dest);
  }));
});
