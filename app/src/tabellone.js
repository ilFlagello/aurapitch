/* AuraPitch - tabellone a eliminazione diretta delle coppe (dati da ESPN, file app/data/tabelloni.json scritto da tabellone.py).
   Si scarica solo quando apri la scheda "Tabellone" di una coppa. Un turno alla volta, dal più avanzato già iniziato. */
import React, { useState, useEffect } from "react";
import { C, Crest, html } from "./base.js";

export const COPPE_TABELLONE = ["CL", "EL", "ECL", "CI", "FAC", "ELC", "CDR", "DFB", "CDF"];
let cache = null;
const carica = () => (cache = cache || fetch("data/tabelloni.json").then((r) => (r.ok ? r.json() : null)).catch(() => null));

const data = (t) => (t ? new Date(t).toLocaleDateString("it-IT", { day: "numeric", month: "short" }) : "");

function Sfida({ s }) {
  const [A, B] = s.sq;
  const riga = (t, j) => {
    const tot = s.tot ? s.tot[j] : (s.gare[0].g ? (s.gare[0].h === t ? s.gare[0].g[0] : s.gare[0].g[1]) : null);
    const passa = s.passa === t, fuori = s.passa && s.passa !== t;
    return html`<div className="flex items-center gap-2 min-w-0 py-[3px]"><${Crest} t=${t} size=${16} />
      <span className=${"flex-1 truncate text-[14px] " + (fuori ? C.mu : C.tx) + (passa ? " font-semibold" : "")}>${t}</span>
      ${passa && html`<span className=${"text-[9.5px] font-bold uppercase tracking-[0.05em] " + C.acc}>passa</span>`}
      <span className=${"num w-6 text-right text-[16px] font-bold " + (fuori ? C.mu : C.tx)}>${tot == null ? "" : tot}</span></div>`;
  };
  const gare = s.gare.map((g, i) => (g.rinv ? `${s.gare.length > 1 ? (i ? "Ritorno" : "Andata") + " " : ""}rinviata`
    : `${s.gare.length > 1 ? (i ? "Ritorno" : "Andata") + " " : ""}${data(g.t)}${g.g && g.fine ? ` · ${g.h === A ? g.g[0] + "-" + g.g[1] : g.g[1] + "-" + g.g[0]}` : ""}${g.rig ? ` (rigori ${g.h === A ? g.rig[0] + "-" + g.rig[1] : g.rig[1] + "-" + g.rig[0]})` : ""}`));
  return html`<div className=${"py-2 border-t first:border-0 " + C.bd}>${riga(A, 0)}${riga(B, 1)}
    <div className=${"text-[11px] mt-0.5 " + C.mu}>${gare.join(" · ")}</div></div>`;
}

export function Tabellone({ k }) {
  const [T, setT] = useState(null);
  const [sel, setSel] = useState(null);
  useEffect(() => { let ok = true; carica().then((x) => ok && setT(x || {})); return () => { ok = false; }; }, []);
  if (!T) return html`<div className=${C.card + " p-4 text-sm " + C.mu}>Carico il tabellone...</div>`;
  const c = (T.coppe || {})[k];
  const turni = c ? c.turni.filter((t) => (t.sfide || []).length || t.saltato || t.n === 0 || !t.n) : [];
  if (!turni.length) return html`<div className=${C.card + " p-4 text-sm " + C.mu}>Tabellone non disponibile per questa coppa: arriva con l'aggiornamento del mattino, quando ESPN pubblica i turni.</div>`;
  const giocati = turni.filter((t) => (t.sfide || []).length);
  const i0 = sel != null ? sel : Math.max(0, turni.indexOf(giocati.length ? giocati[giocati.length - 1] : turni[0]));
  const t = turni[i0];
  return html`<${React.Fragment}>
    <div className="flex gap-1.5 overflow-x-auto noscroll -mx-4 px-4">${turni.map((x, i) => html`<button key=${x.id} onClick=${() => setSel(i)} aria-pressed=${i === i0}
      className=${"shrink-0 px-3 py-1.5 rounded-full text-[13px] font-semibold " + (i === i0 ? C.seg : C.ch + " " + C.mu)}>${x.nome}</button>`)}</div>
    <div className=${C.card + " px-4 py-2"}>
      ${t.saltato ? html`<div className=${"py-2 text-sm " + C.mu}>${t.n} partite in questo turno: troppe per il tabellone, che parte dal turno successivo.</div>`
        : (t.sfide || []).length ? t.sfide.map((s, i) => html`<${Sfida} key=${i} s=${s} />`)
        : html`<div className=${"py-2 text-sm " + C.mu}>Turno non ancora sorteggiato${t.inizio ? ": si gioca dal " + data(t.inizio + "T12:00:00Z") : ""}.</div>`}
    </div>
    <p className=${"text-[11px] " + C.mu}>${t.ar ? "Andata e ritorno: il numero è il totale dei gol. " : ""}Dati ESPN, aggiornati ogni mattina.</p><//>`;
}
