/* AuraPitch - "Schedine in corso" (scelta 2B di Andrea, 5/11): dal banner in basso si apre una pagina con ogni schedina giocata,
   la più recente in alto, e sotto ogni partita come in un tabellone: squadre, risultato, minuto o orario, giocata e quota,
   con lo stato della giocata. Verde e rosso anche prima del fischio quando l'esito è già deciso (Over 2,5 con 3 gol). */
import React, { useEffect, useState } from "react";
import { C, Crest, Ctx, Ic, evalCode, hit, html, mLabel, norm, odd, options } from "./base.js";

/* la giocata è già decisa? Con la partita finita, dal risultato. In corso: si provano tutti i risultati ancora possibili
   (i gol possono solo aumentare); se danno tutti lo stesso esito, è deciso. Giocate sui tempi, cartellini, angoli,
   marcatori: decise solo a fine partita (o segnate a mano nel diario). */
function giaDeciso(m, k) {
  if (!m) return null;
  if (m.st === "FT") return hit(m, k);
  if (m.st !== "LIVE" || !m.g) return null;
  const c = norm(k), [h, a] = m.g;
  let v0;
  for (let i = 0; i <= 8; i++) for (let j = 0; j <= 8; j++) {
    const v = evalCode(c, h + i, a + j, null, null);
    if (v === null) return null;
    if (v0 === undefined) v0 = v; else if (v !== v0) return null;
  }
  return v0;
}
/* stato di una giocata: v presa, x persa, a in corso (ancora possibile), n non iniziata, m da segnare a mano (partita finita
   ma l'esito non si ricava dal risultato), ? partita non più nei dati */
function statoGamba(g, byId) {
  if (g.ok === true) return "v";
  if (g.ok === false) return "x";
  const m = byId[g.id];
  if (!m) return "?";
  const d = giaDeciso(m, g.k);
  if (d === true) return "v";
  if (d === false) return "x";
  if (m.st === "LIVE") return "a";
  if (m.st === "FT") return "m";
  return "n";
}
/* la schedina è ancora in gioco finché c'è una partita da giocare o in corso */
const inGioco = (x, byId) => x.legs.some((g) => { const m = byId[g.id]; return g.ok == null && m && (m.st === "NS" || m.st === "LIVE"); });

const STILE = {
  v: ["bg-[#0F9D84]", "bg-[#DDF5EF] text-[#0B6E5C] dark:bg-[#0F9D84]/25 dark:text-[#7FE3CC]", "Presa · "],
  x: ["bg-[#E5304D]", "bg-[#FDE7EB] text-[#B4123A] dark:bg-[#E5304D]/25 dark:text-[#FF9AAD]", "Persa · "],
  a: ["bg-[#F5B800]", "bg-[#FFF3CC] text-[#7A5300] dark:bg-[#F5B800]/20 dark:text-[#FFD966]", ""],
  n: ["bg-[#17152B]/15 dark:bg-white/20", "bg-[#17152B]/[0.06] text-[#5F5B76] dark:bg-white/[0.08] dark:text-[#9A95B3]", ""],
  m: ["bg-[#17152B]/15 dark:bg-white/20", "bg-[#17152B]/[0.06] text-[#5F5B76] dark:bg-white/[0.08] dark:text-[#9A95B3]", "Da segnare · "],
  "?": ["bg-[#17152B]/15 dark:bg-white/20", "bg-[#17152B]/[0.06] text-[#5F5B76] dark:bg-white/[0.08] dark:text-[#9A95B3]", ""],
};
const NOME_ST = { v: "presa", x: "persa", a: "in corso, ancora possibile", n: "non ancora iniziata", m: "da segnare nel diario", "?": "non più nei dati" };

function tempo(m) {
  if (!m) return ["", ""];
  if (m.st === "LIVE") return [/Intervallo/i.test(m.clock || "") ? "Intervallo" : (m.clock || "In corso").replace(/'.*/, "'"), "text-[#E0314B] dark:text-[#FF7085]"];
  if (m.st === "FT") return ["Finale", C.mu];
  if (m.st === "RINV") return ["Rinviata", C.mu];
  const d = new Date(m.ko), oggi = new Date();
  const ora = d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  return [d.toDateString() === oggi.toDateString() ? "oggi " + ora : d.toLocaleDateString("it-IT", { weekday: "short" }) + " " + ora, C.mu];
}

function Riga({ g, m, s }) {
  const [t, tc] = tempo(m), live = m && m.st === "LIVE", gol = m && m.g;
  const sq = (j) => { const n = m ? (j ? m.a : m.h) : j ? g.a : g.h; return html`<span className="flex items-center gap-2 min-w-0">
    <${Crest} t=${n} size=${15} /><span className=${"flex-1 text-[13px] font-semibold truncate " + C.tx}>${n}</span>
    <b className=${"num text-[18px] leading-none " + (live ? "text-[#E0314B] dark:text-[#FF7085]" : C.tx)}>${gol ? m.g[j] : ""}</b></span>`; };
  return html`<div className=${"flex items-stretch border-t " + C.bd} aria-label=${(m ? m.h + " – " + m.a : g.h + " – " + g.a) + ": " + g.l + ", " + NOME_ST[s]}>
    <span className=${"w-[5px] shrink-0 " + STILE[s][0]}></span>
    <div className=${"flex-1 min-w-0 flex items-center gap-3 py-2.5 pl-2.5 pr-3.5 " + (s === "n" ? "opacity-[0.65]" : "")}>
      <div className="flex-1 min-w-0 flex flex-col gap-1">${sq(0)}${sq(1)}</div>
      <div className="max-w-[46%] flex flex-col items-end gap-1 text-right">
        <span className=${"text-[11px] font-bold " + tc}>${t}</span>
        <span className=${"text-[11px] font-bold leading-tight px-2 py-[3px] rounded-[10px] " + STILE[s][1]}>${STILE[s][2]}${g.l} · ${odd(g.q)}</span></div></div></div>`;
}

function Scheda({ x, byId, titolo }) {
  const st = x.legs.map((g) => statoGamba(g, byId));
  const n = (k) => st.filter((v) => v === k).length;
  const persa = n("x") > 0, vinta = st.every((v) => v === "v");
  const eur = (v) => v.toLocaleString("it-IT", { style: "currency", currency: "EUR" });
  const pezzi = [[n("v"), n("v") === 1 ? "presa" : "prese", "text-[#5EE0C2]"], [n("a"), "in corso", "text-[#FFD25E]"], [n("n"), "da giocare", "text-[#B9B4D6]"],
    [n("x"), n("x") === 1 ? "persa" : "perse", "text-[#FF8DA1]"], [n("m"), "da segnare", "text-[#B9B4D6]"]].filter((p) => p[0]);
  return html`<section className=${C.card + " overflow-hidden"}>
    <div className="bg-[#17152B] dark:bg-[#0E0C18] text-white px-4 py-3 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="text-[11px] text-[#B9B4D6] truncate">${titolo}</div>
        <div className="flex flex-wrap gap-x-2.5 mt-1 text-[12px] font-bold">${pezzi.map(([v, t, c]) => html`<span key=${t} className=${c}>${v} ${t}</span>`)}</div>
        ${(persa || vinta) && html`<div className=${"text-[12px] font-bold mt-0.5 " + (vinta ? "text-[#5EE0C2]" : "text-[#FF8DA1]")}>${vinta ? "Schedina vinta" + (x.imp ? ": " + eur(x.imp * x.q) : "") : "Schedina persa"}</div>`}</div>
      <div className="text-right shrink-0">
        ${x.imp ? html`<div className="text-[11px] text-[#B9B4D6]">${eur(x.imp)} · vincita ${eur(x.imp * x.q)}</div>` : null}
        <div className="num text-[26px] font-extrabold leading-none">×${odd(x.q)}</div></div></div>
    ${x.legs.map((g, i) => html`<${Riga} key=${g.id + g.k + i} g=${g} m=${byId[g.id]} s=${st[i]} />`)}</section>`;
}

function SchedineInCorso({ onClose }) {
  const { diario, mySlip, byId } = React.useContext(Ctx);
  const [vista, setVista] = useState(0);
  // il tasto "indietro" del telefono chiude la pagina
  useEffect(() => {
    try { history.pushState({ apInCorso: 1 }, ""); } catch (e) { /* niente cronologia */ }
    const fn = () => onClose();
    window.addEventListener("popstate", fn);
    // la pagina sotto resta ferma mentre questa è aperta
    const prima = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("popstate", fn); document.body.style.overflow = prima; };
  }, []);
  const chiudi = () => { if (history.state && history.state.apInCorso) history.back(); else onClose(); };
  const giocate = diario.slice().reverse();
  const aperte = giocate.filter((x) => inGioco(x, byId)), chiuse = giocate.filter((x) => !inGioco(x, byId));
  // la schedina non ancora segnata come giocata: compare se ha partite da giocare o in corso
  const mie = mySlip.map((x) => { const m = byId[x.id]; const o = m ? options(m).find((y) => y.k === norm(x.k)) : null;
    return m && o && o.q ? { id: x.id, k: x.k, q: o.q, h: m.h, a: m.a, l: mLabel(m, x.k, true) } : null; }).filter(Boolean);
  const mia = mie.length && inGioco({ legs: mie }, byId) ? { legs: mie, q: mie.reduce((a, g) => a * g.q, 1), imp: 0 } : null;
  const lista = vista ? chiuse : aperte;
  const quando = (t) => { const d = new Date(t), oggi = new Date(), ieri = new Date(Date.now() - 864e5);
    const ora = d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
    return (d.toDateString() === oggi.toDateString() ? "Giocata oggi alle " : d.toDateString() === ieri.toDateString() ? "Giocata ieri alle " : "Giocata " + d.toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" }) + " alle ") + ora; };
  return html`<div className="fixed inset-0 z-[60] overflow-y-auto overscroll-contain" style=${{ background: "var(--bg)" }} role="dialog" aria-label="Schedine in corso">
    <div className="max-w-[480px] mx-auto px-4 pb-10 space-y-3" style=${{ paddingTop: "calc(14px + env(safe-area-inset-top, 0px))" }}>
      <div className="flex items-center gap-2.5">
        <button onClick=${chiudi} aria-label="Indietro" className=${"w-9 h-9 rounded-full flex items-center justify-center " + C.card}><${Ic.ChevronLeft} size=${18} className=${C.tx} /></button>
        <h1 className=${"text-[24px] font-extrabold tracking-[-0.02em] " + C.tx}>Le mie schedine</h1></div>
      <div className="flex gap-1.5">${[["In gioco", aperte.length + (mia ? 1 : 0)], ["Chiuse", chiuse.length]].map(([t, v], i) => html`<button key=${t} onClick=${() => setVista(i)} aria-pressed=${vista === i}
        className=${"px-3.5 py-[7px] rounded-full text-[13px] font-semibold " + (vista === i ? C.seg : C.card + " " + C.tx)}>${t} · ${v}</button>`)}</div>
      ${!vista && mia && html`<${Scheda} x=${mia} byId=${byId} titolo="La mia schedina, non segnata come giocata" />`}
      ${lista.map((x) => html`<${Scheda} key=${x.id} x=${x} byId=${byId} titolo=${quando(x.t) + " · " + x.legs.length + (x.legs.length === 1 ? " partita" : " partite")} />`)}
      ${!lista.length && !(mia && !vista) && html`<div className=${C.card + " p-4 text-[13px] " + C.mu}>${vista ? "Nessuna schedina chiusa nel diario." : "Nessuna schedina in gioco. Quando ne giochi una, tocca “L'ho giocata”: la segui qui partita per partita."}</div>`}
      <p className=${"text-[11px] leading-snug " + C.mu}>Verde: presa. Giallo: in corso, ancora possibile. Rosso: persa. Verde e rosso compaiono anche prima del fischio finale quando il risultato non può più cambiare l'esito. Cartellini, angoli e marcatori si segnano nel diario a fine partita.</p>
    </div></div>`;
}

export { giaDeciso, statoGamba, inGioco, SchedineInCorso };
