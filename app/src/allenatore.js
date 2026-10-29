/* AuraPitch - allenatore personale: legge il diario delle giocate (che resta sul telefono) e ti dice, con numeri veri,
   dove vai bene, dove perdi e se stai rincorrendo le perdite. Niente consigli per giocare di piu: lo scopo e giocare meglio
   e meno, con il gioco responsabile al centro. */
import React from "react";
import { C, Ctx, Ic, TONE, esitoGamba, html, mGroup, norm, statoGiocata, store } from "./base.js";

const eur = (v) => v.toLocaleString("it-IT", { style: "currency", currency: "EUR" });
const pc = (x) => Math.round(x * 100) + "%";

export function analizza(diario, byId) {
  const chiuse = diario.filter((x) => statoGiocata(x, byId) !== "aperta").sort((a, b) => a.t - b.t);
  const res = (x) => (statoGiocata(x, byId) === "vinta" ? x.imp * x.q : 0) - x.imp;
  // per tipo di mercato: gambe prese contro attese (somma delle probabilita IA al momento della giocata)
  const gruppi = {};
  for (const x of chiuse) for (const g of x.legs) {
    const e = esitoGamba(g, byId);
    if (e == null) continue;
    const k = mGroup(norm(g.k));
    const r = (gruppi[k] = gruppi[k] || { k, n: 0, prese: 0, attese: 0 });
    r.n++; r.prese += e ? 1 : 0; r.attese += g.p || 0;
  }
  const G = Object.values(gruppi).filter((r) => r.n >= 4).map((r) => ({ ...r, scarto: (r.prese - r.attese) / r.n })).sort((a, b) => b.scarto - a.scarto);
  // singole contro multiple
  const tipo = (f) => { const z = chiuse.filter(f); const sp = z.reduce((a, x) => a + x.imp, 0); return { n: z.length, resa: sp ? z.reduce((a, x) => a + res(x), 0) / sp : 0 }; };
  const singole = tipo((x) => x.legs.length <= 2), multiple = tipo((x) => x.legs.length >= 4);
  // rincorsa delle perdite: dopo una giocata persa, entro 3 ore una nuova giocata con importo almeno 1,5 volte piu alto
  const trenta = Date.now() - 30 * 86400e3;
  let rincorse = 0;
  for (let i = 1; i < diario.length; i++) {
    const a = diario[i - 1], b = diario[i];
    if (b.t < trenta) continue;
    if (statoGiocata(a, byId) === "persa" && b.t - a.t < 3 * 3600e3 && b.imp >= a.imp * 1.5 && b.imp >= 5) rincorse++;
  }
  // quote alte: le schedine sopra quota 20 rendono di solito molto meno di quanto promettono
  const alte = tipo((x) => x.q >= 20);
  const mese = new Date().toISOString().slice(0, 7);
  const spesoMese = diario.filter((x) => new Date(x.t).toISOString().slice(0, 7) === mese).reduce((a, x) => a + x.imp, 0);
  return { chiuse, G, singole, multiple, alte, rincorse, spesoMese };
}

export function Allenatore() {
  const { diario, byId } = React.useContext(Ctx);
  if (!diario || !diario.length) return null;
  const A = analizza(diario, byId);
  if (A.chiuse.length < 5) return html`<div className=${C.card + " p-4 flex gap-3"}>
    <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-[#5B2EE6]/10 text-[#5B2EE6] dark:bg-[#A58BFF]/15 dark:text-[#A58BFF]"><${Ic.Activity} size=${17} /></span>
    <div><div className=${"text-[15px] font-semibold " + C.tx}>Il tuo allenatore personale</div><p className=${"text-[13px] " + C.mu}>Dalla quinta giocata chiusa nel diario ti mostro dove vai bene, dove perdi e le abitudini da correggere (ora ${A.chiuse.length}/5).</p></div></div>`;
  const frasi = [];
  if (A.rincorse > 0) frasi.push(["bad", `Negli ultimi 30 giorni, ${A.rincorse === 1 ? "una volta" : A.rincorse + " volte"} hai rigiocato subito dopo una perdita alzando molto l'importo. È il segnale più classico della rincorsa: fermati un giorno prima di rigiocare.`]);
  const best = A.G[0], worst = A.G[A.G.length - 1];
  if (best && best.scarto > 0.05) frasi.push(["good", `Sul mercato "${best.k}" vai meglio dell'IA: ${best.prese} giocate prese su ${best.n}, ne attendevi ${best.attese.toFixed(1).replace(".", ",")}.`]);
  if (worst && worst !== best && worst.scarto < -0.05) frasi.push(["warn", `Sul mercato "${worst.k}" vai peggio del previsto: ${worst.prese} prese su ${worst.n}, ne attendevi ${worst.attese.toFixed(1).replace(".", ",")}. Prova a giocarlo meno.`]);
  if (A.multiple.n >= 3 && A.singole.n >= 3 && A.multiple.resa < A.singole.resa - 0.15) frasi.push(["warn", `Le schedine lunghe (4 partite o più) ti rendono ${pc(A.multiple.resa)} contro ${pc(A.singole.resa)} di quelle corte: meno partite, meno margine regalato al bookmaker.`]);
  if (A.alte.n >= 3 && A.alte.resa < -0.5) frasi.push(["warn", `Le schedine sopra quota 20 ti hanno reso ${pc(A.alte.resa)}: divertenti, ma costose.`]);
  if (!frasi.length) frasi.push(["good", "Nessuna abitudine da correggere per ora: continua a giocare con calma e con un limite."]);
  const lim = store.get("limite", 0);
  return html`<div className=${C.card + " p-4 space-y-2.5"}>
    <div className="flex items-center gap-2"><${Ic.Activity} size=${16} className=${C.acc} /><span className=${C.lab + " flex-1"}>Il tuo allenatore personale</span><span className=${"text-[11px] " + C.mu}>${A.chiuse.length} giocate</span></div>
    ${frasi.map(([t, f], i) => html`<div key=${i} className=${"text-[13px] rounded-xl border p-2.5 leading-snug " + TONE[t]}>${f}</div>`)}
    ${A.G.length > 0 && html`<div className="space-y-1">${A.G.slice(0, 6).map((r) => html`<div key=${r.k} className="flex items-center gap-2 text-[12px]">
      <span className=${"flex-1 truncate " + C.tx}>${r.k}</span><span className=${"tabular-nums " + C.mu}>${r.prese}/${r.n}</span>
      <span className="w-16 h-1.5 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden"><span className="block h-full rounded-full" style=${{ width: pc(r.prese / r.n), background: r.scarto >= 0 ? "#0F9D84" : "#FF3D5A" }}></span></span></div>`)}</div>`}
    <p className=${"text-[11px] " + C.mu}>Questo mese hai giocato ${eur(A.spesoMese)}${lim ? " su un limite di " + eur(lim) : ""}. Se il gioco smette di essere un divertimento: Telefono Verde Nazionale 800 55 88 22, gratuito e anonimo.</p></div>`;
}
