/* AuraPitch - riga di una partita nell'elenco (orario, squadre, risultato, aura delle probabilità, affidabilità dei dati) e voti
   della stagione. Sta fuori da partita.js perché serve subito all'avvio: la scheda completa della partita (partita.js) si
   scarica solo quando ne apri una, o in silenzio quando l'app è ferma. */
import React, { useState, useEffect } from "react";
import { AuraLine, C, Crest, Ctx, html } from "./base.js";

    let _voti = null;
    function caricaVoti() { if (!_voti) _voti = fetch("data/voti.json").then((r) => (r.ok ? r.json() : {})).catch(() => ({})); return _voti; }
    /* ---- riga partita: orario a sinistra, squadre una sopra l'altra, punteggi in colonna, aura delle probabilita sotto ---- */
    function usaVoti() { const [V, setV] = useState(null); useEffect(() => { caricaVoti().then(setV); }, []); return V; }
    /* affidabilita dei dati (0-100): quanta informazione ha l'algoritmo su questa partita oltre alle quote. Colore: verde alta, ambra media, rossa bassa */
    const tonoAff = (v) => (v >= 70 ? "text-emerald-700 dark:text-emerald-300 bg-emerald-500/12 ring-emerald-500/30" : v >= 40 ? "text-amber-700 dark:text-amber-300 bg-amber-500/12 ring-amber-500/30" : "text-[#E0314B] dark:text-[#FF7085] bg-[#FF3D5A]/10 ring-[#FF3D5A]/25");
    function AffPill({ m }) {
      const v = m.dati && m.dati.score;
      if (v == null) return null;
      return html`<span className=${"flex flex-col items-center justify-center w-[46px] h-[38px] rounded-[12px] ring-1 " + tonoAff(v)} aria-label=${"Affidabilità dei dati " + v + "%"}>
        <span className="num text-[16px] font-bold leading-none">${v}<span className="text-[10px]">%</span></span><span className="text-[8.5px] font-bold uppercase tracking-[0.06em] leading-none mt-[3px] opacity-80">dati</span></span>`;
    }
    function Row({ m, i }) {
    const { goMatch, caricaDettagli } = React.useContext(Ctx);
    const fin = m.st === "FT" && m.g;
    const vince = (j) => m.g && m.g[j] > m.g[1 - j];
    const live = m.st === "LIVE";
    const left = m.st === "NS" ? html`<span className=${"num text-[17px] font-bold leading-none " + C.tx}>${m.time || "-"}</span>`
      : m.st === "RINV" ? html`<span className=${"text-[10px] font-semibold " + C.mu}>Rinviata</span>`
      : live ? html`<span className="flex items-center gap-1 text-[#FF3D5A] whitespace-nowrap" aria-label=${m.clock || "In diretta"}><i className="pulse block w-1.5 h-1.5 rounded-full bg-[#FF3D5A] shrink-0"></i>${m.clock && /\d/.test(m.clock)
        ? html`<span className="num text-[16px] font-bold leading-none">${m.clock.replace(/'.*/, "'")}</span>`
        : html`<span className="text-[11px] font-extrabold tracking-[0.06em] leading-none">${/Intervallo/.test(m.clock || "") ? "INT" : "LIVE"}</span>`}</span>`
      : html`<span className=${"text-[11px] font-semibold " + C.mu}>Finale</span>`;
    const team = (j) => html`<span className="flex items-center gap-2 min-w-0"><${Crest} t=${j ? m.a : m.h} size=${16} />
      <span className=${"text-[14px] leading-[18px] truncate " + (fin && !vince(j) ? C.mu : C.tx) + (vince(j) ? " font-semibold" : "")}>${j ? m.a : m.h}</span></span>`;
    const gol = (j) => html`<span className=${"num text-[17px] font-bold leading-[18px] text-right " + (live ? "text-[#FF3D5A]" : fin && !vince(j) ? C.mu : C.tx)}>${m.g ? m.g[j] : ""}</span>`;
    return html`<button onPointerDown=${() => { import("./partita.js").catch(() => {}); if (!m.nq && caricaDettagli) caricaDettagli(m.id); }} onClick=${() => goMatch(m.id)} className=${"w-full text-left px-4 pt-2 pb-1.5 " + (i ? "border-t " + C.bd : "")}>
      <span className="grid items-center gap-x-3 gap-y-1" style=${{ gridTemplateColumns: "44px minmax(0,1fr) 20px 46px" }}>
        <span className="row-span-2 flex items-center min-w-0 overflow-hidden">${left}</span>
        ${team(0)}${gol(0)}
        <span className="row-span-2 flex flex-col items-end justify-center gap-0.5">${m.free && html`<span className=${"text-[9px] font-bold " + C.acc}>Gratis</span>`}<${AffPill} m=${m} /></span>
        ${team(1)}${gol(1)}
        <span></span><span className="col-span-2 pt-0.5">${m.nq ? (m.pq ? html`<${AuraLine} m=${m} p=${m.pq} h=${2} />` : m.pia ? html`<span className="block"><${AuraLine} m=${m} p=${m.pia} h=${2} /><span className=${"block text-[9.5px] font-semibold mt-0.5 " + C.mu}>Stima dell'IA · senza quote</span></span>`
          : html`<span className=${"block text-[10px] font-semibold " + C.mu}>Senza quote · risultati e diretta</span>`) : html`<${AuraLine} m=${m} h=${2} />`}</span></span></button>`;
  }

    /* voto: numero in stile tabellone su una pastiglia; viola = ottimo, verde acqua = buono, lilla = nella media, corallo = insufficiente */
    const tonoVoto = (v) => (v >= 7.5 ? "#5B2EE6" : v >= 6.6 ? "#0F9D84" : v >= 5.8 ? "#8A84A3" : "#FF3D5A");
    function VotoChip({ v, big }) {
      return html`<span className=${"num inline-flex items-center justify-center rounded-[6px] text-white font-bold leading-none shrink-0 " + (big ? "text-[20px] px-2 py-1 min-w-[42px]" : "text-[13px] px-1 py-[2px] min-w-[28px]")} style=${{ background: tonoVoto(v) }}>${v.toFixed(1).replace(".", ",")}</span>`;
    }

export { AffPill, Row, VotoChip, caricaVoti, tonoVoto, usaVoti };
