/* AuraPitch - statistiche d'uso anonime: solo conteggi del giorno (quante aperture, quante partite guardate...).
   Nessun identificativo dell'utente o del telefono; si inviano in blocco quando l'app va in secondo piano.
   L'utente le spegne nel Profilo (o nel benvenuto): da quel momento non parte piu nulla. */
import { store } from "./base.js";

let ponte = null;
const coda = {};
export const statAttive = () => !store.get("statNo", false);
export function conta(e, n = 1) { if (statAttive()) coda[e] = (coda[e] || 0) + n; }
export function giorniUso() { return store.get("statGiorni", 0); }

function invia() {
  if (!ponte || !statAttive()) return;
  const ev = { ...coda };
  if (!Object.keys(ev).length) return;
  for (const k of Object.keys(coda)) delete coda[k];
  const b = JSON.stringify({ ev });
  try {
    const ok = navigator.sendBeacon && navigator.sendBeacon(ponte + "/evento", new Blob([b], { type: "text/plain" }));
    if (!ok) fetch(ponte + "/evento", { method: "POST", body: b, keepalive: true, headers: { "Content-Type": "text/plain" } }).catch(() => {});
  } catch (e) { /* nessuna rete: pazienza, sono solo conteggi */ }
}

export function avviaStatistiche(url) {
  if (ponte || !url) return;
  ponte = url;
  conta("apertura");
  const oggi = new Date().toISOString().slice(0, 10);
  if (store.get("statG", "") !== oggi) { // una volta al giorno: da quanto si usa l'app (fasce, non date)
    store.set("statG", oggi);
    store.set("statGiorni", giorniUso() + 1);
    let inst = store.get("statInst", null);
    if (!inst) { inst = oggi; store.set("statInst", inst); conta("nuovo"); }
    const gg = Math.round((Date.parse(oggi) - Date.parse(inst)) / 864e5);
    conta(gg === 0 ? "giorno_1" : gg < 7 ? "giorno_2_7" : gg < 30 ? "giorno_8_30" : "giorno_30p");
    try { if (navigator.standalone || window.matchMedia("(display-mode: standalone)").matches) conta("installata"); } catch (e) { /* niente */ }
  }
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") invia(); });
  window.addEventListener("pagehide", invia);
}
