/* AuraPitch - allenatori e termometro della panchina (dati: data/panchine.json, scaricato solo quando serve). */
import React, { useState, useEffect } from "react";
import { C, Crest, Ic, html } from "./base.js";
import { Citazione } from "./citazioni.js";

let cache = null;
const caricaPanchine = () => (cache = cache || fetch("data/panchine.json").then((r) => (r.ok ? r.json() : { squadre: {} })).catch(() => ({ squadre: {} })));
function usaPanchine() { const [P, setP] = useState(null); useEffect(() => { caricaPanchine().then(setP); }, []); return P; }

const COLORI = { "Appena arrivato": "#7B5CFF", "Tranquilla": "#0F9D84", "Da tenere d'occhio": "#E0A100", "Scotta": "#F2711C", "Rovente": "#FF3D5A" };
const inCarica = (g) => (g < 60 ? `da ${g} giorni` : g < 730 ? `da ${Math.round(g / 30.4)} mesi` : `da ${(g / 365).toFixed(1).replace(".", ",")} anni`);
const unoSu = (p) => (p >= 0.5 ? "più di una possibilità su due" : `circa una possibilità su ${Math.max(2, Math.round(1 / Math.max(p, 0.005)))}`);

// barra del termometro: dal verde al rosso, con il segno della squadra (scala fino al 30%)
function Barra({ p, alta }) {
  const x = Math.min(1, p / 0.3) * 100;
  return html`<div className=${"relative rounded-full " + (alta ? "h-2.5" : "h-1.5")} style=${{ background: "linear-gradient(90deg,#0F9D84 0%,#E0A100 30%,#F2711C 55%,#FF3D5A 100%)" }}>
    <span className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 rounded-full bg-white ring-2 ring-[#17152B] dark:ring-white shadow" style=${{ left: x + "%", width: alta ? 14 : 10, height: alta ? 14 : 10 }}></span></div>`;
}

// scheda allenatore nella pagina squadra
function SchedaAllenatore({ squadra }) {
  const P = usaPanchine();
  const [perche, setPerche] = useState(false);
  const s = P && P.squadre[squadra];
  if (!s) return null;
  return html`<div className=${C.card + " p-4 space-y-3"}>
    <div className="flex items-baseline gap-2"><span className=${C.lab + " flex-1"}>Allenatore</span><span className=${"text-[12px] " + C.mu}>${inCarica(s.giorni)}${s.partite ? `, ${s.partite} partite` : ""}</span></div>
    <div className=${"text-[20px] font-semibold -mt-1 " + C.tx}>${s.chi}</div>
    <div>
      <div className="flex items-baseline justify-between mb-1.5"><span className=${"text-[13px] font-semibold " + C.tx}>Termometro della panchina</span>
        <span className="text-[13px] font-bold" style=${{ color: COLORI[s.livello] }}>${s.livello}</span></div>
      ${s.p30 == null ? html`<div className=${"text-[13px] " + C.mu}>Il termometro si accende dalla terza partita del nuovo allenatore.</div>` : html`<${Barra} p=${s.p30} alta=${true} />
      <div className=${"text-[12px] mt-1.5 " + C.mu}>Probabilità che lasci la panchina entro 30 giorni: ${unoSu(s.p30)} (${Math.round(s.p30 * 100)}%).</div>`}</div>
    ${s.motivi.length > 0 && html`<div><button onClick=${() => setPerche(!perche)} aria-expanded=${perche} className=${"flex items-center gap-1 text-[13px] font-semibold " + C.acc}>Perché<${perche ? Ic.ChevronUp : Ic.ChevronDown} size=${15} /></button>
      ${perche && html`<div className=${"mt-2 space-y-2 text-[14px] " + C.tx}>${s.motivi.map((t) => html`<div key=${t} className="flex gap-2"><span className="w-1.5 h-1.5 rounded-full mt-2 shrink-0 bg-[#5B2EE6] dark:bg-[#A58BFF]"></span><span>${t}</span></div>`)}
        <p className=${"text-[11px] pt-1 " + C.mu}>Modello verificato sulle stagioni 2020/21-2025/26 di 7 campionati: il 10% delle situazioni più "calde" conteneva quasi un terzo degli addii veri. Non è una previsione certa.</p></div>`}</div>`}
    ${s.livello === "Rovente" && html`<${Citazione} q=${["Se sei primo sei primo, se sei secondo non sei niente.", "Bill Shankly"]} piccola=${true} />`}
    ${s.precedenti && s.precedenti.length > 0 && html`<div className=${"text-[12px] " + C.mu}>Prima di lui: ${s.precedenti.slice().reverse().map((x) => x.chi).join(", ")}.</div>`}</div>`;
}

// classifica delle panchine di un campionato, dalla più calda
function PanchineLega({ k, apriSquadra }) {
  const P = usaPanchine();
  if (!P) return html`<div className=${C.card + " p-4 text-sm " + C.mu}>Caricamento...</div>`;
  const L = Object.entries(P.squadre).filter(([, s]) => s.lg === k).sort((a, b) => (b[1].p30 ?? -1) - (a[1].p30 ?? -1));
  if (!L.length) return html`<div className=${C.card + " p-4 text-sm " + C.mu}>Termometro delle panchine non disponibile per questa competizione: serve lo storico degli allenatori (per ora i principali campionati europei e le loro seconde divisioni).</div>`;
  return html`<div className=${C.card + " px-4 py-2"}>
    <div className=${"text-[12px] py-2 " + C.mu}>Probabilità che l'allenatore lasci entro 30 giorni, dalla panchina più calda.</div>
    ${L.map(([t, s]) => html`<button key=${t} onClick=${() => apriSquadra && apriSquadra(t)} className=${"w-full flex items-center gap-3 py-2.5 border-t text-left " + C.bd}>
      <${Crest} t=${t} size=${22} />
      <span className="flex-1 min-w-0"><span className=${"block text-[15px] font-semibold truncate " + C.tx}>${s.chi}</span><span className=${"block text-[12px] truncate " + C.mu}>${t}, ${inCarica(s.giorni)}</span>
        ${s.p30 != null && html`<span className="block mt-1.5 w-full"><${Barra} p=${s.p30} /></span>`}</span>
      <span className="w-[86px] text-right"><span className="block text-[12px] font-bold" style=${{ color: COLORI[s.livello] }}>${s.livello}</span>${s.p30 != null && html`<span className=${"block num text-[17px] font-bold " + C.tx}>${Math.round(s.p30 * 100)}%</span>`}</span></button>`)}</div>`;
}

export { caricaPanchine, usaPanchine, SchedaAllenatore, PanchineLega };
