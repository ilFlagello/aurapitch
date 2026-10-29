/* AuraPitch - guida delle funzionalità: parte da sola una volta sola (dopo la scelta di campionati e squadre).
   Si sfoglia con le frecce o con il dito; "Salta" o la chiusura la fermano per sempre. Si riapre dal "?" in alto. */
import React, { useState, useRef } from "react";
import { C, Ic, Marchio, html, inizioSwipe, fineSwipe, store, vibra } from "./base.js";

const PASSI = [
  { i: null, t: "Benvenuto in AuraPitch", s: "Le partite di calcio lette in 10 secondi, con l'IA che spiega il perché. Ti mostro in un minuto cosa puoi fare.",
    p: ["In cima trovi le tue partite (stella e squadre preferite)", "Poi i campionati: prima quelli che segui, poi i principali, poi tutti gli altri dalla A alla Z", "Tira giù lo schermo per aggiornare"] },
  { i: Ic.CircleDot, t: "Ogni partita, a colpo d'occhio", s: "Tocca una partita: probabilità, forma, quote e diretta minuto per minuto.",
    p: ["Scorri con il dito tra Partita, Formazioni, IA, Statistiche e Cronaca", "Formazione probabile prima di quella ufficiale", "“E se…?”: togli un giocatore e guarda come cambia la partita"] },
  { i: Ic.Sparkles, t: "L'IA ti spiega le sue scelte", s: "Per ogni partita un consiglio con i motivi a favore e quelli da tenere d'occhio.",
    p: ["Ogni giorno un'analisi PRO gratis su una partita a tua scelta", "“Come sta andando l'IA”: errori e successi, tutto alla luce del sole", "L'algoritmo si allena ogni mattina sui risultati veri"] },
  { i: Ic.Zap, t: "Schedina IA in un tocco", s: "Scegli il rischio, la quota e anche l'esito (tutte in casa, pareggi, Goal, Over…): la compone l'IA.",
    p: ["“Schedina onesta”: ti avvisa se due giocate dipendono l'una dall'altra", "Diario delle giocate con l'allenatore personale", "Limite di spesa mensile per giocare con la testa"] },
  { i: Ic.TrendingUp, t: "Radar e notifiche", s: "Ti avvisiamo quando succede qualcosa che conta, con simboli diversi per ogni avviso.",
    p: ["“Quote in movimento”: filtro accanto a In diretta, con il possibile motivo", "Gol, rossi, formazioni, promemoria: scegli tu quali", "Metti la stella a una partita per seguirla"] },
  { i: Ic.Shield, t: "Il tuo Club, al sicuro", s: "Squadra del cuore, gara dei pronostici con gli amici e i tuoi dati su ogni telefono.",
    p: ["Account facoltativo con Google o Face ID, senza email né password", "Scarichi o cancelli i tuoi dati quando vuoi", "La guida resta sempre qui: tocca “?” in alto"] },
];

export function Guida({ onFine }) {
  const [i, setI] = useState(0);
  const sw = useRef(null);
  const P = PASSI[i], ultimo = i === PASSI.length - 1;
  const chiudi = () => { store.set("guida2", true); store.set("guideSeen", true); onFine(); };
  const vai = (n) => { vibra(6); setI(Math.max(0, Math.min(PASSI.length - 1, n))); };
  const I = P.i;
  return html`<div className="fixed inset-0 z-[65] flex items-end sm:items-center justify-center bg-black/50" role="dialog" aria-modal="true" aria-label="Guida di AuraPitch">
    <div className="w-full max-w-[480px] rounded-t-[26px] sm:rounded-[26px] bg-white dark:bg-[#191626] px-5 pt-5 space-y-4" style=${{ paddingBottom: "calc(20px + env(safe-area-inset-bottom, 0px))" }}
      onTouchStart=${(e) => { sw.current = inizioSwipe(e); }} onTouchEnd=${(e) => { const d = fineSwipe(sw.current, e); sw.current = null; if (d) vai(i + d); }}>
      <div className="flex items-center"><span className=${"text-[12px] font-semibold " + C.mu}>${i + 1} di ${PASSI.length}</span><span className="flex-1"></span>
        <button onClick=${chiudi} className=${"text-[14px] font-semibold px-2 py-1 " + C.mu}>${ultimo ? "Chiudi" : "Salta"}</button></div>
      <div key=${i} className="entra-dx space-y-3">
        <div className="w-16 h-16 rounded-[20px] flex items-center justify-center text-white" style=${{ background: "linear-gradient(135deg, #2A1A6E 0%, #5B2EE6 60%, #8B6CFF 100%)", boxShadow: "0 12px 30px -10px #5B2EE6" }}>
          ${I ? html`<${I} size=${30} />` : html`<${Marchio} size=${40} />`}</div>
        <div className=${"text-[24px] font-bold leading-tight tracking-[-0.02em] " + C.tx}>${P.t}</div>
        <p className=${"text-[15px] leading-snug " + C.mu}>${P.s}</p>
        <div className="space-y-2">${P.p.map((x) => html`<div key=${x} className="flex items-start gap-2.5"><span className="mt-[7px] w-1.5 h-1.5 rounded-full shrink-0 bg-[#5B2EE6] dark:bg-[#A58BFF]"></span><span className=${"text-[14px] " + C.tx}>${x}</span></div>`)}</div>
      </div>
      <div className="flex justify-center gap-1.5 pt-1" aria-hidden="true">${PASSI.map((_, j) => html`<span key=${j} className=${"h-1.5 rounded-full transition-all " + (j === i ? "w-5 bg-[#5B2EE6] dark:bg-[#A58BFF]" : "w-1.5 bg-black/15 dark:bg-white/20")}></span>`)}</div>
      <div className="grid grid-cols-[auto_1fr] gap-2">
        <button disabled=${i === 0} onClick=${() => vai(i - 1)} aria-label="Indietro" className=${"w-12 h-12 rounded-2xl flex items-center justify-center disabled:opacity-30 " + C.ch + " " + C.tx}><${Ic.ChevronLeft} size=${20} /></button>
        <button onClick=${() => (ultimo ? chiudi() : vai(i + 1))} className=${"h-12 rounded-2xl text-[16px] font-bold " + C.on}>${ultimo ? "Inizia" : "Avanti"}</button></div>
    </div></div>`;
}
