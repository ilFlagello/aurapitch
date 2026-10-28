// AuraPitch - service worker: rende l'app installabile e utilizzabile anche con rete debole.
// Strategia: pagina e codice dell'app prima dalla rete (al massimo 3 secondi, poi copia salvata), così dopo un aggiornamento
// si apre subito la versione nuova; caratteri e icone dalla copia salvata; dati sempre prima dalla rete (al massimo 8 secondi).
const CACHE = "aurapitch-v20";
const SHELL = ["./", "index.html", "app.js", "app.css", "manifest.webmanifest", "icon.svg", "icon-192.png", "icon-512.png", "fonts/figtree.woff2", "fonts/bigshoulders.woff2"];

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

// Notifiche push (servizio AuraPitch su Cloudflare): mostra l'avviso anche con l'app chiusa.
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { title: "AuraPitch", body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.title || "AuraPitch", { body: d.body || "", tag: d.tag, icon: "icon-192.png", badge: "icon-192.png", data: { url: d.url || "./" } }));
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
