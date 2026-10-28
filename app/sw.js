// AuraPitch - service worker: rende l'app installabile e utilizzabile anche con rete debole.
// Strategia: pagina e codice dell'app prima dalla rete (al massimo 3 secondi, poi copia salvata), così dopo un aggiornamento
// si apre subito la versione nuova; caratteri e icone dalla copia salvata; dati sempre prima dalla rete (al massimo 8 secondi).
const CACHE = "aurapitch-v22";
const SHELL = ["./", "index.html", "app.js", "app.css", "manifest.webmanifest", "icon.svg", "icon-192.png", "icon-512.png", "fonts/figtree.woff2", "fonts/bigshoulders.woff2",
  ...["gol", "annullato", "rossi", "inizio", "intervallo", "finale", "formazioni", "promemoria", "test"].flatMap((t) => [`avvisi/${t}.png`, `avvisi/${t}-badge.png`])];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

function retePrima(req, ms) {
  const net = fetch(req).then((r) => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then((x) => x.put(req, c)); } return r; });
  const attesa = new Promise((ok) => setTimeout(ok, ms)).then(() => caches.match(req)).then((hit) => hit || net);
  return Promise.race([net.catch(() => caches.match(req)), attesa]);
}

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  if (url.pathname.includes("/data/")) { e.respondWith(retePrima(e.request, 8000)); return; }
  if (url.origin !== location.origin) return;
  if (e.request.mode === "navigate" || /\/(index\.html|app\.js|app\.css)?$/.test(url.pathname) || /\.(js|css|html)$/.test(url.pathname)) { e.respondWith(retePrima(e.request, 3000)); return; }
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((r) => { const c = r.clone(); caches.open(CACHE).then((x) => x.put(e.request, c)); return r; })));
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
