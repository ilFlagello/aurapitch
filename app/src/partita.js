/* AuraPitch - riga partita e scheda partita: diretta, formazioni, IA, statistiche, cronaca, In breve, pagina squadra. */
import React, { useState, useEffect, useRef } from "react";
import { scaricaCalendario, immaginePartita } from "./condividi.js";
import { Citazione, citazionePartita, citazioneArbitro } from "./citazioni.js";
import { SchedaAllenatore, usaPanchine } from "./panchine.js";
import { useSummary, loadPlayer, loadCareer, ruolo, findTeam, loadTeam, minuto, ESPN_LG, andamento, getJSON } from "./live.js";
import { NomeSquadra, NomeGiocatore, NomeLega, inizioSwipe, fineSwipe, Voce, AuraLine, C, Crest, Ctx, DOT, FavPill, Flag, Form, GROUPS, Ic, Seg, Sheet, TONE, Tabs, auraCol, evalCode, html, leggiXg, lum, mGroup, mLabel, nf, norm, odd, options, pct, pctL, spiega, store } from "./base.js";
import { Anteprima, partitaSettimana } from "./extra.js";

    /* ---- riga partita: orario a sinistra, squadre una sopra l'altra, punteggi in colonna, aura delle probabilita sotto ---- */
    function usaVoti() { const [V, setV] = useState(null); useEffect(() => { caricaVoti().then(setV); }, []); return V; }
    function Row({ m, i }) {
    const { goMatch, unlocked, caricaDettagli } = React.useContext(Ctx);
    const fin = m.st === "FT" && m.g;
    const vince = (j) => m.g && m.g[j] > m.g[1 - j];
    const live = m.st === "LIVE";
    const left = m.st === "NS" ? html`<span className=${"num text-[19px] font-bold leading-none " + C.tx}>${m.time || "-"}</span>`
      : m.st === "RINV" ? html`<span className=${"text-[11px] font-semibold " + C.mu}>Rinviata</span>`
      : live ? html`<span className="flex items-center gap-1 text-[#FF3D5A]"><i className="pulse block w-1.5 h-1.5 rounded-full bg-[#FF3D5A]"></i><span className="num text-[18px] font-bold leading-none">${m.clock && /\d/.test(m.clock) ? m.clock.replace(/'.*/, "'") : m.clock || "Live"}</span></span>`
      : html`<span className=${"text-[12px] font-semibold " + C.mu}>Finale</span>`;
    const team = (j) => html`<span className="flex items-center gap-2 min-w-0"><${Crest} t=${j ? m.a : m.h} size=${18} />
      <span className=${"text-[15px] truncate " + (fin && !vince(j) ? C.mu : C.tx) + (vince(j) ? " font-semibold" : "")}>${j ? m.a : m.h}</span></span>`;
    const gol = (j) => html`<span className=${"num text-[20px] font-bold leading-[22px] text-right " + (live ? "text-[#FF3D5A]" : fin && !vince(j) ? C.mu : C.tx)}>${m.g ? m.g[j] : ""}</span>`;
    return html`<button onPointerDown=${() => caricaDettagli && caricaDettagli(m.id)} onClick=${() => goMatch(m.id)} className=${"w-full text-left px-4 pt-3 pb-2.5 " + (i ? "border-t " + C.bd : "")}>
      <span className="grid items-center gap-x-3 gap-y-1.5" style=${{ gridTemplateColumns: "50px minmax(0,1fr) 22px 62px" }}>
        <span className="row-span-2 flex items-center">${left}</span>
        ${team(0)}${gol(0)}
        <span className="row-span-2 flex flex-col items-end justify-center gap-1">${m.free && html`<span className=${"text-[10px] font-bold " + C.acc}>Gratis</span>`}<${FavPill} m=${m} unlocked=${unlocked(m)} /></span>
        ${team(1)}${gol(1)}
        <span></span><span className="col-span-2 pt-1"><${AuraLine} m=${m} /></span></span></button>`;
  }

    /* ---- gate PRO ---- */
    function Gate({ m, title, children }) {
    const { unlocked, setUnlock } = React.useContext(Ctx);
    return unlocked(m) ? children : html`<div className="space-y-1.5">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300"><${Ic.Lock} size=${12} />${title}</div>
      <div className="relative rounded-2xl overflow-hidden min-h-[120px]"><div aria-hidden="true" className="blur-md select-none pointer-events-none space-y-3">${children}</div>
        <button onClick=${() => setUnlock(true)} className="absolute inset-0 flex items-center justify-center p-4 bg-white/30 dark:bg-black/30">
          <span className=${"px-3 py-2 rounded-full border text-xs font-semibold text-center shadow-sm " + TONE.warn}>Sblocca con PRO o guarda 1 video (15 minuti gratis)</span></button></div></div>`;
  }

    /* ---- dati live: azione in campo, momenti chiave, statistiche, cronaca, formazioni, giocatore ---- */
    const KEY_T = /goal|penalty|red-card|yellow-card|substitution|shot-on-target|woodwork|halftime|end-regular|own-goal|var/;
    function trasf(side, x, y) {
      if (x == null || y == null) return null;
      return side === 1 ? [105 - x * 1.05, y * 0.68] : [x * 1.05, 68 - y * 0.68];
    }
    /* stessi pesi di fattori.py (versione fattori-1) */
    const PESI = { sostituto: 0.5, assente: 1.0, panchina: 0.6, assist: 0.5, quotaMax: 0.4, tetto: 0.15 };
    function prob1x2(lh, la) {
      const ph = pois(lh), pa = pois(la), rho = -0.12, dl = 0.06; let p = [0, 0, 0], tot = 0;
      for (let i = 0; i <= 8; i++) for (let j = 0; j <= 8; j++) {
        let w = ph[i] * pa[j];
        if (i === 0 && j === 0) w *= 1 - lh * la * rho; else if (i === 0 && j === 1) w *= 1 + lh * rho; else if (i === 1 && j === 0) w *= 1 + la * rho; else if (i === 1 && j === 1) w *= 1 - rho;
        if (i === 0) w *= 1 - dl; if (j === 0) w *= 1 - dl;
        tot += w; p[i > j ? 0 : i === j ? 1 : 2] += w;
      }
      return p.map((x) => x / tot);
    }
    /* titolari importanti assenti: i migliori marcatori della squadra confrontati con la formazione ufficiale */
    const toks = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/[\s-]+/).filter((t) => t.length > 2);
    function stesso(sc, p) {
      const a = toks(sc), b = toks(p.name), l = toks(p.last);
      return (l.length && l.every((t) => a.includes(t))) || (a.length && b.includes(a[a.length - 1]));
    }
    function assenze(m, sm, D) {
      if (!sm || sm.st === "FT" || !D || !D.scorers || !D.scorers[m.lg]) return [];
      const out = [];
      [m.h, m.a].forEach((t, j) => {
        const f = sm.formazioni[j];
        if (!f) return;
        const tit = f.lines.flat(), panca = f.bench;
        const top = D.scorers[m.lg].filter((r) => r.t === t && r.g + r.a >= 2).sort((x, y) => y.g + y.a - (x.g + x.a)).slice(0, 3);
        for (const r of top) {
          if (tit.some((p) => stesso(r.n, p))) continue;
          const inPanca = panca.some((p) => stesso(r.n, p));
          const gf = ((D.standings[m.lg] || {}).generale || []).find((x) => x.team === t);
          const quota = Math.min(PESI.quotaMax, (r.g + PESI.assist * r.a) / Math.max(gf ? gf.gf : (r.g + r.a) * 3, r.g + r.a, 1));
          const gia = (m.fattori || []).filter((f) => f.chi === r.n).reduce((x, f) => x + (f.delta || 0), 0);
          const giaNotizia = gia < 0;
          // la formazione conferma: si aggiunge solo la parte non ancora applicata dalle notizie
          // se le quote sono state aggiornate dopo l'uscita delle formazioni, il mercato le conosce gia: pesano il 25%
          const prezzo = m.prepartita && (new Date(m.ko) - new Date(m.prepartita)) / 60000 <= 70 ? 0.25 : 1;
          const delta = Math.min(0, -quota * (1 - PESI.sostituto) * (inPanca ? PESI.panchina : PESI.assente) * prezzo - gia);
          out.push({ n: r.n, side: j, panca: inPanca, delta, giaNotizia, testo: `${r.n} (${t}, ${r.g} gol e ${r.a} assist in campionato) ${inPanca ? "parte dalla panchina" : "non è tra i convocati"}.` });
        }
      });
      return out;
    }
    function AssenzeCard({ m, sm }) {
      const { D } = React.useContext(Ctx);
      const al = assenze(m, sm, D);
      if (!sm || !sm.formazioni[0]) return null;
      const tot = [0, 1].map((j) => Math.max(-PESI.tetto, al.filter((x) => x.side === j).reduce((s, x) => s + x.delta, 0)));
      const xg = m.xg && m.xg[0] != null ? m.xg : null;
      const nuovo = xg && m.st === "NS" && (tot[0] || tot[1]) ? prob1x2(xg[0] * (1 + tot[0]), xg[1] * (1 + tot[1])) : null;
      const prima = xg ? prob1x2(xg[0], xg[1]) : null;
      return html`<div className=${C.card + " p-4 space-y-1.5"}><div className="flex items-center gap-2"><span className=${"w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border " + (al.length ? TONE.warn : TONE.good)}><${Ic.Users} size=${15} /></span>
        <span className=${"flex-1 text-sm font-semibold " + C.tx}>${al.length ? "Assenze pesanti nelle formazioni" : "Formazioni ufficiali: nessuna assenza pesante"}</span></div>
        ${al.map((x) => html`<div key=${x.n} className=${"text-sm " + C.tx}>${x.testo}</div>`)}
        ${!al.length && html`<div className=${"text-xs " + C.mu}>I migliori marcatori e assistman delle due squadre sono titolari.</div>`}
        ${nuovo && html`<div className=${"rounded-xl p-2.5 text-sm " + C.ch + " " + C.tx}><b>Con queste formazioni l'IA stima:</b> ${["1", "X", "2"].map((e, i) => html`<span key=${e} className="mr-2 tabular-nums whitespace-nowrap">${e} ${pct(nuovo[i])}% <span className=${"text-xs " + C.mu}>(era ${pct(prima[i])}%)</span></span>`)}
          <div className=${"text-[11px] mt-1 " + C.mu}>Gol attesi corretti: ${m.h} ${Math.round(tot[0] * 100)}%, ${m.a} ${Math.round(tot[1] * 100)}% (peso del giocatore nei gol della squadra, metà coperta dal sostituto, tetto 15%).</div></div>`}
        <div className=${"text-[11px] " + C.mu}>Le quote reagiscono alle formazioni in pochi minuti: guarda se la quota è già cambiata prima di giocare.</div></div>`;
    }
    /* campo orizzontale "notturno" (105 x 68), condiviso da azione in diretta e mappa dei tiri */
    const CampoNotte = () => html`<g>
      <rect x="-2" y="-2" width="109" height="72" fill="#1F1B38" />
      ${[0, 1, 2, 3, 4, 5, 6].map((i) => html`<rect key=${i} x=${i * 15} y="0" width="7.5" height="68" fill="#2A2450" opacity="0.55" />`)}
      <g fill="none" stroke="#B7A6FF" strokeOpacity="0.45" strokeWidth="0.4">
        <rect x="0" y="0" width="105" height="68" /><line x1="52.5" y1="0" x2="52.5" y2="68" /><circle cx="52.5" cy="34" r="9.15" />
        <rect x="0" y="13.84" width="16.5" height="40.32" /><rect x="88.5" y="13.84" width="16.5" height="40.32" />
        <rect x="0" y="24.84" width="5.5" height="18.32" /><rect x="99.5" y="24.84" width="5.5" height="18.32" />
        <rect x="-1.5" y="30.34" width="1.5" height="7.32" /><rect x="105" y="30.34" width="1.5" height="7.32" /></g></g>`;
    const TIRI = { "shot-on-target": "porta", "shot-off-target": "fuori", "shot-blocked": "respinto", "shot-hit-woodwork": "palo", "penalty---saved": "porta", "penalty---missed": "fuori" };
    // sul campo scuro un colore di maglia scuro si schiarisce (mescolato al bianco) per restare visibile
    const suNotte = (c) => { if (!/^#[0-9a-f]{6}$/i.test(c) || lum(c) > 0.32) return c; const v = [1, 3, 5].map((i) => Math.round(parseInt(c.slice(i, i + 2), 16) * 0.45 + 255 * 0.55)); return "#" + v.map((x) => x.toString(16).padStart(2, "0")).join(""); };
    function TiriCard({ sm, m }) {
      const [sel, setSel] = useState(null);
      const [lato, setLato] = useState(2);
      const col = auraCol(m).map(suNotte);
      const tiri = sm.cronaca.filter((c) => c.x != null && c.side != null && (TIRI[c.type] || (/^goal|penalty---scored/.test(c.type) && !/own/.test(c.type))))
        .map((c) => ({ ...c, k: TIRI[c.type] || "gol", pt: trasf(c.side, c.x, c.y) })).filter((c) => c.pt);
      if (tiri.length < 3) return null;
      const vis = tiri.filter((t) => lato === 2 || t.side === lato);
      const cnt = (j) => { const t = tiri.filter((x) => x.side === j); return [t.length, t.filter((x) => x.k === "porta" || x.k === "gol").length, t.filter((x) => x.k === "gol").length]; };
      const s = sel != null ? tiri.find((t) => t.i === sel) : null;
      return html`<div className=${C.card + " p-4"}>
        <div className="flex items-baseline mb-2"><span className=${C.lab + " flex-1"}>Mappa dei tiri</span><span className=${"text-[12px] " + C.mu}>${m.h} attacca a destra</span></div>
        <div className="mb-2"><${Seg} small=${true} items=${[m.h, m.a, "Entrambe"]} val=${lato} set=${setLato} /></div>
        <svg viewBox="-2 -2 109 72" className="w-full rounded-[14px]" role="img" aria-label="Mappa dei tiri della partita">
          <${CampoNotte} />
          ${vis.map((t) => { const c = col[t.side], [x, y] = t.pt, on = sel === t.i;
            return html`<g key=${t.i} onClick=${() => setSel(on ? null : t.i)} style=${{ cursor: "pointer" }}>
              ${t.k === "gol" ? html`<circle cx=${x} cy=${y} r=${on ? 3.4 : 2.8} fill=${c} stroke="#fff" strokeWidth="0.7" /><circle cx=${x} cy=${y} r="1" fill="#fff" />`
                : t.k === "porta" || t.k === "palo" ? html`<circle cx=${x} cy=${y} r=${on ? 2.4 : 1.8} fill=${c} stroke="#fff" strokeWidth="0.4" />`
                : t.k === "respinto" ? html`<rect x=${x - 1.2} y=${y - 1.2} width="2.4" height="2.4" fill="none" stroke=${c} strokeWidth="0.7" transform=${`rotate(45 ${x} ${y})`} />`
                : html`<circle cx=${x} cy=${y} r=${on ? 2.2 : 1.6} fill="none" stroke=${c} strokeWidth="0.7" />`}</g>`; })}</svg>
        <div className="grid grid-cols-2 gap-3 mt-3">${[0, 1].map((j) => { const [t, p, g] = cnt(j); return html`<div key=${j} className=${j ? "text-right" : ""}>
          <div className=${"text-[12px] " + C.mu}>${j ? m.a : m.h}</div>
          <div className=${"text-[13px] " + C.tx}><b className="num text-[19px]">${t}</b> tiri, <b className="num text-[19px]">${p}</b> in porta, <b className="num text-[19px]">${g}</b> gol</div></div>`; })}</div>
        <div className=${"flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[12px] " + C.mu}><span>● gol (punto bianco)</span><span>● in porta o palo</span><span>○ fuori</span><span>◇ respinto</span></div>
        ${s ? html`<div className=${"mt-2 text-[14px] rounded-xl p-2.5 " + C.ch + " " + C.tx}><b className="num text-[16px] mr-1">${s.min}</b>${s.text}</div>` : html`<div className=${"mt-2 text-[12px] " + C.mu}>Tocca un tiro per leggere com'è andata.</div>`}</div>`;
    }
    function LiveAction({ sm, m }) {
      const [open, setOpen] = useState(false);
      const plays = sm.cronaca.filter((c) => c.x != null && c.side != null).slice(0, 6);
      const last = sm.cronaca.find((c) => c.text) || null;
      return html`<div className=${C.card + " overflow-hidden"}>
        <button onClick=${() => setOpen(!open)} className="w-full flex items-center gap-2 px-4 py-3">
          <span className="relative flex w-2.5 h-2.5"><span className="absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75 animate-ping"></span><span className="relative inline-flex rounded-full w-2.5 h-2.5 bg-rose-500"></span></span>
          <span className=${"flex-1 text-left text-sm font-semibold " + C.tx}>Azione in diretta</span>
          <span className=${"text-xs tabular-nums " + C.mu}>${sm.clock}</span><${open ? Ic.ChevronUp : Ic.ChevronDown} size=${16} className=${C.mu} /></button>
        ${open && html`<div className="px-4 pb-4 space-y-2">
          <div className=${"flex justify-between text-[11px] font-semibold " + C.mu}><span>${m.h} attacca verso destra</span><span>${m.a} verso sinistra</span></div>
          <svg viewBox="-2 -2 109 72" className="w-full rounded-[14px]">
            <${CampoNotte} />
            ${plays.slice().reverse().map((p, i, arr) => {
              const a = trasf(p.side, p.x, p.y), b = trasf(p.side, p.x2, p.y2);
              const lastOne = i === arr.length - 1, col = sm.colors[p.side] || "#fff";
              return html`<g key=${p.i} opacity=${lastOne ? 1 : 0.35 + i * 0.1}>
                ${b && html`<line x1=${a[0]} y1=${a[1]} x2=${b[0]} y2=${b[1]} stroke="#ffffff" strokeWidth="0.6" strokeDasharray="1.5 1" />`}
                <circle cx=${a[0]} cy=${a[1]} r=${lastOne ? 2.4 : 1.5} fill=${col} stroke="#ffffff" strokeWidth="0.6" />
                ${lastOne && html`<circle cx=${a[0]} cy=${a[1]} r="2.4" fill="none" stroke="#ffffff" strokeWidth="0.5"><animate attributeName="r" values="2.4;6;2.4" dur="1.6s" repeatCount="indefinite" /><animate attributeName="opacity" values="1;0;1" dur="1.6s" repeatCount="indefinite" /></circle>`}</g>`;
            })}</svg>
          ${last && html`<div className=${"text-sm " + C.tx}><b className="tabular-nums mr-1">${last.min}</b>${last.text}</div>`}
          <div className=${"text-[11px] " + C.mu}>Le ultime azioni con la posizione in campo: il punto pulsante è la più recente. Si aggiorna ogni 20 secondi, con qualche secondo di ritardo sulla diretta.</div></div>`}</div>`;
    }
    function EvIcon({ k }) {
      if (k === "giallo") return html`<span className="inline-block w-2.5 h-3.5 rounded-[2px] bg-amber-400"></span>`;
      if (k === "rosso") return html`<span className="inline-block w-2.5 h-3.5 rounded-[2px] bg-rose-500"></span>`;
      if (k === "cambio") return html`<${Ic.Repeat} size=${13} className="text-[#6E6A85] dark:text-[#9A95B3]" />`;
      if (/sbagliato|parato/.test(k)) return html`<${Ic.XCircle} size=${14} className="text-rose-500" />`;
      return html`<${Ic.Ball} size=${14} className=${k === "autogol" ? "text-rose-500" : "text-[#17152B] dark:text-[#F4F2FF]"} />`;
    }
    function riassunto(sm, m) {
      const g = sm.g, ev = sm.eventi;
      const nome = (s) => (s === 0 ? m.h : m.a);
      const gol = ev.filter((e) => /gol|rigore$|autogol/.test(e.k) && !/sbagliato|parato/.test(e.k));
      const fr = [];
      if (sm.st === "NS") return "";
      fr.push(sm.st === "LIVE" ? `In corso (${sm.clock}): ${m.h} ${g[0]} - ${g[1]} ${m.a}.` : `Finale: ${m.h} ${g[0]} - ${g[1]} ${m.a}.`);
      if (gol.length) fr.push("Gol: " + gol.map((e) => `${e.min} ${e.a}${e.k === "rigore" ? " su rigore" : e.k === "autogol" ? " (autogol)" : ""} per ${e.k === "autogol" ? nome(e.side) : nome(e.side)}${e.b && e.k === "gol" ? `, assist di ${e.b}` : ""}`).join("; ") + ".");
      else fr.push("Nessun gol finora.");
      const rossi = ev.filter((e) => e.k === "rosso");
      if (rossi.length) fr.push("Espulsi: " + rossi.map((e) => `${e.a} (${nome(e.side)}, ${e.min})`).join(", ") + ".");
      const gi = ev.filter((e) => e.k === "giallo");
      if (gi.length) fr.push(`Ammoniti: ${gi.length} (${gi.filter((e) => e.side === 0).length} ${m.h}, ${gi.filter((e) => e.side === 1).length} ${m.a}).`);
      const s = Object.fromEntries(sm.statistiche.map((r) => [r[0], r]));
      if (s["Possesso palla"]) fr.push(`Possesso ${Math.round(s["Possesso palla"][1])}% - ${Math.round(s["Possesso palla"][2])}%, tiri ${s["Tiri"] ? s["Tiri"][1] + " - " + s["Tiri"][2] : "-"}${s["Tiri in porta"] ? " (in porta " + s["Tiri in porta"][1] + " - " + s["Tiri in porta"][2] + ")" : ""}.`);
      const rec = Object.entries(sm.recupero).map(([p, v]) => `${p === "1" ? "primo tempo" : p === "2" ? "secondo tempo" : "supplementari"} +${v}`);
      if (rec.length) fr.push("Recupero: " + rec.join(", ") + ".");
      return fr.join(" ");
    }
    /* resoconto in righe ordinate (etichetta a sinistra, contenuto a destra) */
    function righeResoconto(sm, m) {
      if (sm.st === "NS") return [];
      const nome = (j) => (j === 0 ? m.h : m.a);
      const ev = sm.eventi;
      const gol = ev.filter((e) => /gol|rigore$|autogol/.test(e.k) && !/sbagliato|parato/.test(e.k));
      const R = [[sm.st === "LIVE" ? "In corso" : "Finale", `${m.h} ${sm.g[0]} - ${sm.g[1]} ${m.a}${sm.st === "LIVE" && sm.clock ? " (" + sm.clock + ")" : ""}`]];
      R.push(["Gol", gol.length ? gol.map((e) => `${e.min} ${e.a.split(" ").slice(-1)[0]}${e.k === "rigore" ? " (rig.)" : e.k === "autogol" ? " (aut.)" : ""}, ${nome(e.side)}`).join("\n") : "Nessuno"]);
      const assist = gol.filter((e) => e.b && e.k === "gol");
      if (assist.length) R.push(["Assist", assist.map((e) => `${e.b} (per ${e.a.split(" ").slice(-1)[0]})`).join("\n")]);
      const rossi = ev.filter((e) => e.k === "rosso");
      if (rossi.length) R.push(["Espulsi", rossi.map((e) => `${e.min} ${e.a.split(" ").slice(-1)[0]}, ${nome(e.side)}`).join("\n")]);
      const gi = ev.filter((e) => e.k === "giallo");
      if (gi.length) R.push(["Ammoniti", `${gi.length}: ${gi.filter((e) => e.side === 0).length} ${m.h}, ${gi.filter((e) => e.side === 1).length} ${m.a}`]);
      const st = Object.fromEntries(sm.statistiche.map((r) => [r[0], r]));
      if (st["Possesso palla"]) R.push(["Possesso", `${Math.round(st["Possesso palla"][1])}% - ${Math.round(st["Possesso palla"][2])}%`]);
      if (st["Tiri"]) R.push(["Tiri (in porta)", `${st["Tiri"][1]} (${st["Tiri in porta"] ? st["Tiri in porta"][1] : "-"}) - ${st["Tiri"][2]} (${st["Tiri in porta"] ? st["Tiri in porta"][2] : "-"})`]);
      const rec = Object.entries(sm.recupero).map(([p, v]) => `${p === "1" ? "1° tempo" : p === "2" ? "2° tempo" : "suppl."} +${v}'`);
      if (rec.length) R.push(["Recupero", rec.join(", ")]);
      return R;
    }
    function Resoconto({ sm, m }) {
      const R = righeResoconto(sm, m);
      if (!R.length) return html`<div className=${C.card + " p-4 text-[15px] " + C.mu}>La partita non è ancora iniziata: la cronaca parte con le formazioni ufficiali e il calcio d'inizio.</div>`;
      return html`<div className=${C.card + " px-4 pt-4 pb-1"}><div className=${C.lab + " mb-2"}>Resoconto</div>
        ${R.map(([l, v], i) => html`<div key=${l} className=${"flex gap-4 py-2.5 " + (i ? "border-t " + C.bd : "")}>
          <span className=${"w-24 shrink-0 text-[13px] font-semibold " + C.mu}>${l}</span>
          <span className=${"flex-1 text-[14px] leading-relaxed whitespace-pre-line " + C.tx + (i === 0 ? " font-bold" : "")}>${v}</span></div>`)}</div>`;
    }
    /* eventi della partita in stile FotMob: casa a sinistra, ospite a destra, minuto al centro, separatori per intervallo e fine */
    /* Eventi: una "spina" verticale al centro con i minuti; casa a sinistra, ospite a destra.
       I gol sono in evidenza con il colore della squadra e il punteggio; cambi e cartellini più discreti. */
    function KeyEvents({ sm, m }) {
      const [cambi, setCambi] = useState(false);
      const col = auraCol(m);
      const tutti = sm.eventi.slice().reverse();
      const ev = tutti.filter((e) => cambi || e.k !== "cambio");
      const nCambi = tutti.filter((e) => e.k === "cambio").length;
      if (!tutti.length) return null;
      const nomeCorto = (n) => { const p = String(n || "").split(" "); return p.length > 1 && p.slice(-1)[0].length > 2 ? p.slice(-1)[0] : n; };
      const Tappa = ({ testo }) => html`<div className="relative flex justify-center py-2.5"><span className=${"relative z-10 px-3 py-1 rounded-full text-[12px] font-semibold bg-white dark:bg-[#191626] border " + C.bd + " " + C.mu}>${testo}</span></div>`;
      return html`<div className=${C.card + " px-4 pt-4 pb-3"}>
        <div className="flex items-center mb-1 gap-2"><span className=${C.lab + " flex-1"}>Eventi</span>
          ${nCambi > 0 && html`<button onClick=${() => setCambi(!cambi)} className=${"text-[12px] font-semibold px-2.5 py-1 rounded-full " + (cambi ? C.seg : C.ch + " " + C.tx)}>${cambi ? "Nascondi cambi" : "Mostra cambi (" + nCambi + ")"}</button>`}</div>
        <div className="relative">
          <span aria-hidden="true" className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-[2px] rounded-full bg-[#17152B]/[0.08] dark:bg-white/[0.08]"></span>
          ${sm.st === "FT" && html`<${Tappa} testo=${"Fine, " + sm.g[0] + "-" + sm.g[1]} />`}
          ${ev.map((e, i) => {
            if (e.k === "intervallo") return html`<${Tappa} key=${i} testo=${"Intervallo" + (e.score ? ", " + e.score[0] + "-" + e.score[1] : "")} />`;
            if (e.k === "fine") return null;
            const gol = /gol|rigore$|autogol/.test(e.k) && !/sbagliato|parato/.test(e.k);
            const dx = e.side === 1, c = col[e.side] || "#888";
            let titolo, sotto;
            if (e.k === "cambio") { titolo = nomeCorto(e.a); sotto = "per " + nomeCorto(e.b); }
            else if (gol) { titolo = nomeCorto(e.a); sotto = e.k === "rigore" ? "Rigore" : e.k === "autogol" ? "Autogol" : e.b ? "Assist di " + nomeCorto(e.b) : "Gol"; }
            else if (e.k === "giallo") { titolo = nomeCorto(e.a); sotto = "Ammonito"; }
            else if (e.k === "rosso") { titolo = nomeCorto(e.a); sotto = "Espulso"; }
            else { titolo = e.a; sotto = e.k; }
            const lato = html`<div className=${"min-w-0 flex items-center gap-2.5 " + (dx ? "" : "flex-row-reverse text-right")}>
              <span className=${"rounded-full flex items-center justify-center shrink-0 " + (gol ? "w-8 h-8" : "w-6 h-6")} style=${{ background: gol ? c : "transparent", color: gol ? "#fff" : undefined }}>
                ${gol ? html`<${Ic.BallIn} size=${18} c=${c} />` : html`<${EvIcon} k=${e.k} />`}</span>
              <span className="min-w-0"><span className=${"block leading-tight truncate " + (gol ? "text-[16px] font-bold " : e.k === "cambio" ? "text-[13px] " : "text-[14px] font-medium ") + C.tx}>${titolo}</span>
                <span className=${"block text-[12px] leading-tight mt-0.5 truncate " + C.mu}>${sotto}</span></span></div>`;
            return html`<div key=${i} className=${"relative grid items-center " + (gol ? "py-3" : e.k === "cambio" ? "py-1.5" : "py-2")} style=${{ gridTemplateColumns: "minmax(0,1fr) 62px minmax(0,1fr)" }}>
              <div className="min-w-0">${e.side === 0 && lato}</div>
              <div className="relative z-10 flex flex-col items-center">
                <span className=${"num px-1.5 bg-white dark:bg-[#191626] leading-none " + (gol ? "text-[19px] font-bold " + C.tx : "text-[16px] font-semibold " + C.mu)}>${e.min}</span>
                ${gol && e.score && html`<span className=${"num mt-1 text-[15px] font-bold px-2 py-0.5 rounded-md " + C.seg}>${e.score[0]}-${e.score[1]}</span>`}</div>
              <div className="min-w-0">${e.side === 1 && lato}</div></div>`;
          })}
          <${Tappa} testo="Calcio d'inizio" /></div></div>`;
    }
    function StatsCard({ sm, m }) {
      const [all, setAll] = useState(false);
      if (!sm.statistiche.length) return null;
      const [ch, ca] = auraCol(m);
      const rows = all ? sm.statistiche : sm.statistiche.slice(0, 6);
      const fmt = (v, u) => (u === "%" ? Math.round(v) + "%" : v);
      const Val = ({ v, u, top, c }) => html`<span className=${"num text-[18px] font-bold leading-none px-1.5 py-[3px] rounded-md min-w-[34px] text-center " + (top ? "text-white" : C.mu)} style=${top ? { background: c } : null}>${fmt(v, u)}</span>`;
      return html`<div className=${C.card + " p-4"}>
        <div className="flex items-center gap-2 mb-3"><span className=${C.lab + " flex-1"}>Statistiche</span>
          <span className="flex items-center gap-1"><i className="block w-2.5 h-2.5 rounded-full" style=${{ background: ch }}></i><span className=${"text-[12px] " + C.mu}>${m.h}</span></span>
          <span className="flex items-center gap-1 ml-2"><i className="block w-2.5 h-2.5 rounded-full" style=${{ background: ca }}></i><span className=${"text-[12px] " + C.mu}>${m.a}</span></span></div>
        <div className="space-y-3.5">${rows.map(([l, a, b, u]) => { const t = a + b || 1; return html`<div key=${l}>
          <div className="flex items-center justify-between"><${Val} v=${a} u=${u} top=${a > b} c=${ch} /><span className=${"text-[13px] font-medium " + C.tx}>${l}</span><${Val} v=${b} u=${u} top=${b > a} c=${ca} /></div>
          <div className="flex gap-[3px] mt-2 h-[5px]"><i className="block rounded-full" style=${{ width: (a / t) * 100 + "%", background: ch, opacity: a >= b ? 1 : 0.45 }}></i><i className="block rounded-full" style=${{ width: (b / t) * 100 + "%", background: ca, opacity: b >= a ? 1 : 0.45 }}></i></div></div>`; })}</div>
        ${sm.statistiche.length > 6 && html`<button onClick=${() => setAll(!all)} className=${"mt-3 text-[13px] font-semibold " + C.acc}>${all ? "Mostra meno" : "Tutte le statistiche"}</button>`}</div>`;
    }
    function Cronaca({ sm, m }) {
      const [f, setF] = useState(0);
      const [n, setN] = useState(40);
      const list = sm.cronaca.filter((c) => c.text && (!f || KEY_T.test(c.type) || /^Gol!|Fine|Inizia|recupero/.test(c.text)));
      const tipo = (c) => (/goal|penalty---scored|own-goal/.test(c.type) || /^Gol!/.test(c.text) ? "gol" : /red-card/.test(c.type) ? "rosso" : /yellow-card/.test(c.type) ? "giallo"
        : /substitution/.test(c.type) ? "cambio" : /^(Fine|Inizia)/.test(c.text) ? "sep" : /shot-on-target|woodwork|penalty/.test(c.type) ? "tiro" : "");
      const barra = { gol: "bg-[#5B2EE6] dark:bg-[#A58BFF]", rosso: "bg-[#FF3D5A]", giallo: "bg-amber-400", cambio: "bg-[#6E6A85]/50", tiro: "bg-black/20 dark:bg-white/25" };
      const sepLab = (t) => { const sc = /(\d+),\s[^,]+?\s(\d+)/.exec(t); const r = sc ? " " + sc[1] + " - " + sc[2] : "";
        return /^Fine primo tempo/.test(t) ? "Intervallo" + r : /^Inizia il secondo tempo/.test(t) ? "Secondo tempo" : /^Inizia il primo tempo/.test(t) ? "Calcio d'inizio" : /^Inizia/.test(t) ? "Supplementari" : "Fine" + r; };
      const voce = (c) => { const t = c.text; const i = t.indexOf(". "); return i > 0 && i < 40 && /^(Gol!|Tiro|Rigore|Sostituzione|Ammonito|Espulso|Calcio d'angolo|Fuorigioco)/.test(t) ? [t.slice(0, i + 1), t.slice(i + 2)] : [null, t]; };
      let ultimoSep = null;
      return html`<${React.Fragment}>
        <${Resoconto} sm=${sm} m=${m} />
        <${Seg} items=${["Tutta la cronaca", "Solo momenti chiave"]} val=${f} set=${setF} />
        <div className=${C.card + " px-4 py-1"}>${list.length ? list.slice(0, n).map((c, i) => {
          const k = tipo(c);
          if (k === "sep") { const lab = sepLab(c.text); if (lab === ultimoSep) return null; ultimoSep = lab;
            return html`<div key=${c.i} className="flex items-center gap-3 py-3.5"><span className=${"flex-1 border-t " + C.bd}></span><span className=${"text-[12px] font-bold uppercase tracking-wide text-center " + C.mu}>${lab}</span><span className=${"flex-1 border-t " + C.bd}></span></div>`; }
          ultimoSep = null;
          const [tit, corpo] = voce(c);
          return html`<div key=${c.i} className=${"flex gap-3 py-3.5 " + (i ? "border-t " + C.bd : "")}>
            <span className=${"w-12 shrink-0 text-[13px] font-bold tabular-nums pt-0.5 " + (k === "gol" ? C.acc : C.tx)}>${c.min}</span>
            ${barra[k] ? html`<span className=${"w-[3px] rounded-full shrink-0 " + barra[k]}></span>` : null}
            <span className=${"flex-1 text-[15px] leading-[1.55] " + C.tx}>${tit && html`<b className="block mb-0.5">${tit}</b>`}<span className=${k ? "" : C.mu}>${corpo}</span></span></div>`;
        }) : html`<div className=${"py-4 text-[15px] " + C.mu}>Nessun commento ancora.</div>`}</div>
        ${list.length > n && html`<button onClick=${() => setN(n + 60)} className=${"w-full py-3 rounded-[14px] text-[14px] font-semibold " + C.ch + " " + C.tx}>Mostra altri commenti</button>`}
        <p className=${"text-[12px] " + C.mu}>Cronaca minuto per minuto tradotta automaticamente in italiano${sm.st === "LIVE" ? ", aggiornata ogni 20 secondi" : ""}.</p><//>`;
    }
    /* informazioni partita (come FotMob): data, competizione, stadio, arbitro */
    function InfoCard({ m, sm, L }) {
      const righe = [["Data", new Date(m.ko).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" }) + ", " + (m.time || "")], ["Competizione", L.name]];
      if (sm && sm.stadio) righe.push(["Stadio", sm.stadio]);
      if (m.arbitro) righe.push(["Arbitro", m.arbitro.nome]);
      return html`<div className=${C.card + " px-4 pt-4 pb-1"}><div className=${C.lab + " mb-1"}>Info partita</div>${righe.map(([l, v], i) => html`<div key=${l} className=${"flex gap-4 py-2.5 " + (i ? "border-t " + C.bd : "")}>
        <span className=${"w-28 shrink-0 text-[13px] font-semibold " + C.mu}>${l}</span><span className=${"flex-1 text-[14px] capitalize-first " + C.tx}>${v}</span></div>`)}</div>`;
    }
    /* arbitro: severita rispetto al campionato ed effetto su cartellini e falli */
    function ArbitroCard({ m }) {
      const a = m.arbitro;
      if (!a) return html`<div className=${C.card + " p-4 space-y-1"}><div className=${C.lab}>Arbitro</div><div className=${"text-[14px] " + C.mu}>Non ancora designato o non disponibile per questo campionato. Di solito la designazione esce 2-3 giorni prima.</div></div>`;
      const giud = (r) => (r == null ? null : r >= 1.1 ? ["severo", TONE.bad] : r <= 0.9 ? ["permissivo", TONE.good] : ["nella media", TONE.ok]);
      const g = giud(a.ratio && a.ratio.K);
      const riga = (lab, k) => a.media && a.media[k] != null && html`<div className=${"flex items-center gap-3 py-2.5 border-t " + C.bd}>
        <span className=${"flex-1 text-[14px] " + C.tx}>${lab} a partita</span>
        <span className=${"text-[14px] font-bold tabular-nums " + C.tx}>${nf(a.media[k].toFixed(1))}</span>
        <span className=${"text-[12px] w-28 text-right " + C.mu}>${a.lega && a.lega[k] ? "campionato " + nf(a.lega[k].toFixed(1)) : ""}</span></div>`;
      const ck = m.cart || {};
      return html`<div className=${C.card + " px-4 pt-4 pb-3"}>
        <div className="flex items-center gap-2"><span className=${C.lab + " flex-1"}>Arbitro</span>${g && a.n >= 3 && html`<span className=${"text-[12px] font-bold px-2.5 py-0.5 rounded-full border " + g[1]}>${g[0]}</span>`}</div>
        <div className=${"text-[17px] font-bold mt-1 " + C.tx}>${a.nome}</div>
        <div className=${"text-[12px] mb-2 " + C.mu}>${a.n ? a.n + " partite nei dati (le più recenti pesano di più)" : "Nessuna partita nei dati: si usa la media del campionato"}</div>
        ${riga("Cartellini", "K")}${riga("Falli", "F")}
        ${(ck.K || ck.F) && html`<div className=${"text-[13px] mt-2 rounded-xl p-3 " + C.ch + " " + C.tx}>Con questo arbitro: ${ck.K ? html`cartellini attesi <b>${nf(ck.K.attesi)}</b> (senza arbitro ${nf(ck.K.senza_arbitro)})` : ""}${ck.K && ck.F ? ", " : ""}${ck.F ? html`falli attesi <b>${nf(ck.F.attesi)}</b> (${nf(ck.F.senza_arbitro)})` : ""}.</div>`}
        <div className=${"text-[11px] mt-2 " + C.mu}>Verificato su 13.000 partite di Premier League e Championship: tenere conto dell'arbitro riduce l'errore dello 0,7% sui cartellini e dell'1,1-1,4% sui falli.</div></div>`;
    }
    function Badges({ p }) {
      const s = p.st || {};
      const b = [];
      for (let i = 0; i < (s.totalGoals || 0); i++) b.push(html`<${Ic.Ball} key=${"g" + i} size=${12} className="text-[#1D1D1F] bg-white rounded-full" />`);
      if (s.goalAssists) b.push(html`<span key="a" className="text-[8px] font-bold px-1 rounded bg-sky-500 text-white">A${s.goalAssists > 1 ? s.goalAssists : ""}</span>`);
      if (s.redCards) b.push(html`<span key="r" className="inline-block w-2 h-2.5 rounded-[1px] bg-rose-500"></span>`);
      else if (s.yellowCards) b.push(html`<span key="y" className="inline-block w-2 h-2.5 rounded-[1px] bg-amber-400"></span>`);
      if (p.out) b.push(html`<span key="o" className="text-[8px] font-bold px-1 rounded bg-black/60 text-white">${p.minOut || "out"}</span>`);
      return b.length ? html`<span className="absolute -top-1.5 -right-3 flex gap-0.5 items-center">${b}</span>` : null;
    }
    /* formazione probabile secondo l'IA (prima di quelle ufficiali): titolari piu frequenti in stagione, senza indisponibili e squalificati */
    function FormazioneProbabile({ m }) {
      const F = m.formazione;
      if (!F || !(F[0] || F[1])) return null;
      const RU = { G: "Portiere", D: "Difesa", M: "Centrocampo", F: "Attacco" };
      const lato = (L, t) => html`<div className="flex-1 min-w-0">
        <div className=${"flex items-center gap-1.5 text-[13px] font-semibold mb-1.5 " + C.tx}><${Crest} t=${t} size=${14} /><${NomeSquadra} t=${t} lg=${m.lg} className="truncate" /></div>
        ${!L ? html`<div className=${"text-[12px] " + C.mu}>Dati non sufficienti</div>` : Object.keys(RU).map((r) => { const g = L.filter((x) => x.r === r); return g.length > 0 && html`<div key=${r} className="mb-1.5">
          <div className=${"text-[10px] font-semibold uppercase tracking-[0.06em] " + C.mu}>${RU[r]}</div>
          ${g.map((x) => html`<div key=${x.n} className="flex items-center gap-1.5 py-[3px]"><${NomeGiocatore} id=${x.id} name=${x.n} pos=${x.r} team=${t} className=${"flex-1 min-w-0 truncate text-[13px] " + C.tx} />
            <span className="w-8 h-1 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden shrink-0"><span className="block h-full rounded-full" style=${{ width: Math.round(x.c * 100) + "%", background: x.c >= 0.75 ? "#0F9D84" : x.c >= 0.5 ? "#E8A317" : "#9A95B3" }}></span></span></div>`)}</div>`; })}</div>`;
      return html`<div className=${C.card + " p-4 space-y-2"}>
        <div className="flex items-center gap-2"><span className=${C.lab + " flex-1"}>Formazione probabile</span><span className=${"text-[11px] font-semibold px-2 py-0.5 rounded-full border " + TONE.info}>stima IA</span></div>
        <div className="flex gap-4">${lato(F[0], m.h)}${lato(F[1], m.a)}</div>
        <p className=${"text-[11px] " + C.mu}>Chi è partito titolare più spesso in stagione, senza indisponibili e squalificati. La barra è la sicurezza della scelta. Le formazioni ufficiali escono circa un'ora prima e qui prendono il posto della stima.</p></div>`;
    }
    /* radar dei movimenti: le quote si sono spostate da quando l'app le ha viste la prima volta */
    function Movimento({ m, compatto }) {
      const v = m.mov;
      if (!v) return null;
      const i = v.dp.map(Math.abs).indexOf(Math.max(...v.dp.map(Math.abs))), giu = v.a[i] < v.da[i];
      const nome = [m.h, "il pareggio", m.a][i];
      const testo = html`<span className=${C.tx}><b>${nome}</b> ${giu ? "più probabile" : "meno probabile"}: quota da <span className="num text-[15px]">${odd(v.da[i])}</span> a <b className="num text-[15px]">${odd(v.a[i])}</b></span>`;
      if (compatto) return html`<span className="flex items-center gap-1.5 text-[12px]"><span className=${giu ? "text-emerald-600 dark:text-emerald-300" : "text-rose-600 dark:text-rose-300"}>${giu ? "▼" : "▲"}</span>${testo}</span>`;
      return html`<div className=${C.card + " p-4 flex gap-3"}>
        <span className=${"w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border " + (giu ? TONE.good : TONE.bad)}><${Ic.TrendingUp} size=${17} /></span>
        <div className="text-[14px] space-y-0.5"><div className=${"font-semibold " + C.tx}>Quote in movimento</div><div>${testo}</div>
          <div className=${"text-[12px] " + C.mu}>${v.perche ? "Possibile motivo: " + v.perche + "." : "Nessuna notizia registrata: il mercato potrebbe sapere qualcosa in più."} Variazione dalla prima lettura${v.dal ? " (" + new Date(v.dal).toLocaleString("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) + ")" : ""}.</div></div></div>`;
    }
    function Lineups({ sm, m, onPlayer }) {
      const F = sm.formazioni;
      if (!F[0] && !F[1] && m.formazione) return html`<${FormazioneProbabile} m=${m} />`;
      if (!F[0] && !F[1]) return html`<div className=${C.card + " p-4 flex gap-3"}><span className=${"w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border " + TONE.ok}><${Ic.Shirt} size=${17} /></span>
        <div><div className=${"text-sm font-semibold " + C.tx}>Formazioni non ancora ufficiali</div><p className=${"text-sm " + C.mu}>Escono circa un'ora prima del calcio d'inizio: compariranno qui da sole, sul campo.</p></div></div>`;
      const Tok = ({ p, col }) => html`<button onClick=${() => onPlayer(p)} className="flex flex-col items-center w-[19%] min-w-0">
        <span className="relative"><span className="num w-[34px] h-[34px] rounded-full flex items-center justify-center text-[16px] font-bold text-white" style=${{ background: col, boxShadow: "0 0 0 2px rgba(255,255,255,0.85), 0 6px 16px -4px " + col }}>${p.num}</span><${Badges} p=${p} />
          ${p.voto != null && html`<span className="absolute -top-1.5 -left-3"><${VotoChip} v=${p.voto} /></span>`}</span>
        <span className="mt-1 text-[11px] font-semibold text-white leading-tight truncate max-w-full">${p.last}</span></button>`;
      const half = (j) => { const f = F[j]; if (!f) return html`<div className="h-1/2"></div>`; const lines = j === 0 ? f.lines.map((l) => l.slice().reverse()) : f.lines.slice().reverse();
        return html`<div className="flex flex-col justify-around h-1/2 py-2">${lines.map((l, i) => html`<div key=${i} className="flex justify-around">${l.map((p) => html`<${Tok} key=${p.id} p=${p} col=${sm.colors[j]} />`)}</div>`)}</div>`; };
      return html`<${React.Fragment}>
        <div className=${C.card + " p-3"}>
          <div className=${"flex justify-between text-xs font-semibold mb-2 " + C.tx}><span className="flex items-center gap-1.5"><${Crest} t=${m.h} size=${14} />${m.h} <span className=${C.mu}>${F[0] ? F[0].formation : ""}</span></span></div>
          <div className="relative rounded-[16px] overflow-hidden" style=${{ background: "repeating-linear-gradient(180deg, #1F1B38 0 9.5%, #241F42 9.5% 19%)", aspectRatio: "68 / 105" }}>
            <svg viewBox="0 0 68 105" className="absolute inset-0 w-full h-full" preserveAspectRatio="none"><g fill="none" stroke="#B7A6FF" strokeOpacity="0.35" strokeWidth="0.35">
              <rect x="0.5" y="0.5" width="67" height="104" /><line x1="0" y1="52.5" x2="68" y2="52.5" /><circle cx="34" cy="52.5" r="9.15" />
              <rect x="13.84" y="0.5" width="40.32" height="16.5" /><rect x="13.84" y="88" width="40.32" height="16.5" /><rect x="24.84" y="0.5" width="18.32" height="5.5" /><rect x="24.84" y="99" width="18.32" height="5.5" /></g></svg>
            <div className="absolute inset-0 flex flex-col">${half(0)}${half(1)}</div></div>
          <div className=${"flex justify-between text-xs font-semibold mt-2 " + C.tx}><span></span><span className="flex items-center gap-1.5"><span className=${C.mu}>${F[1] ? F[1].formation : ""}</span> ${m.a}<${Crest} t=${m.a} size=${14} /></span></div>
          <p className=${"text-[11px] mt-1 " + C.mu}>Tocca un giocatore per vedere partita, stagione e carriera.</p></div>
        <div className=${C.card + " p-4"}><div className=${C.lab + " mb-2"}>Panchina</div>
          <div className="grid grid-cols-2 gap-x-3">${[0, 1].map((j) => html`<div key=${j} className="space-y-1 min-w-0">${(F[j] ? F[j].bench : []).map((p) => html`<button key=${p.id} onClick=${() => onPlayer(p)} className=${"w-full flex items-center gap-1.5 text-left text-[13px] " + C.tx}>
            <span className=${"num w-5 text-[14px] " + C.mu}>${p.num}</span><span className=${"truncate flex-1 py-0.5 " + (p.inn ? "font-semibold" : "")}>${p.short}</span>${p.inn && html`<span className=${"num text-[14px] shrink-0 " + C.acc}>${p.minIn || "in"}</span>`}${p.voto != null && html`<${VotoChip} v=${p.voto} />`}</button>`)}</div>`)}</div>
          <p className=${"text-[11px] mt-3 " + C.mu}>Voti AuraPitch: calcolati dalle statistiche della partita (gol, assist, tiri, falli, cartellini, parate, gol subiti, risultato). Partono da 6.</p></div><//>`;
    }
    /* voto: numero in stile tabellone su una pastiglia; viola = ottimo, verde acqua = buono, lilla = nella media, corallo = insufficiente */
    const tonoVoto = (v) => (v >= 7.5 ? "#5B2EE6" : v >= 6.6 ? "#0F9D84" : v >= 5.8 ? "#8A84A3" : "#FF3D5A");
    function VotoChip({ v, big }) {
      return html`<span className=${"num inline-flex items-center justify-center rounded-[6px] text-white font-bold leading-none shrink-0 " + (big ? "text-[20px] px-2 py-1 min-w-[42px]" : "text-[13px] px-1 py-[2px] min-w-[28px]")} style=${{ background: tonoVoto(v) }}>${v.toFixed(1).replace(".", ",")}</span>`;
    }
    /* migliori in campo: i 3 voti più alti, il primo in grande */
    function Migliori({ sm, m, onPlayer }) {
      const col = auraCol(m);
      const tutti = [0, 1].flatMap((j) => (sm.formazioni[j] ? sm.formazioni[j].all.filter((p) => p.voto != null).map((p) => ({ p, j })) : []));
      if (tutti.length < 6) return null;
      tutti.sort((a, b) => b.p.voto - a.p.voto);
      const [top, ...altri] = tutti.slice(0, 4);
      const riga = (x) => { const st = x.p.st || {}; return [st.totalGoals ? st.totalGoals + (st.totalGoals > 1 ? " gol" : " gol") : null, st.goalAssists ? st.goalAssists + " assist" : null, st.saves ? st.saves + " parate" : null, st.shotsOnTarget ? st.shotsOnTarget + " tiri in porta" : null].filter(Boolean).slice(0, 2).join(", ") || (x.j ? m.a : m.h); };
      return html`<div className=${C.card + " p-4"}>
        <div className="flex items-baseline mb-3"><span className=${C.lab + " flex-1"}>${sm.st === "FT" ? "Migliore in campo" : "Migliori finora"}</span><span className=${"text-[12px] " + C.mu}>Voti AuraPitch</span></div>
        <button onClick=${() => onPlayer(top.p, top.j)} className="w-full flex items-center gap-3 text-left">
          <span className="num w-12 h-12 rounded-full flex items-center justify-center text-[20px] font-bold text-white shrink-0" style=${{ background: col[top.j], boxShadow: "0 8px 22px -6px " + col[top.j] }}>${top.p.num}</span>
          <span className="flex-1 min-w-0"><span className=${"block text-[17px] font-bold truncate " + C.tx}>${top.p.name}</span><span className=${"block text-[13px] truncate " + C.mu}>${riga(top)}</span></span>
          <${VotoChip} v=${top.p.voto} big=${true} /></button>
        <div className=${"mt-3 pt-2 border-t space-y-1 " + C.bd}>${altri.map((x) => html`<button key=${x.p.id} onClick=${() => onPlayer(x.p, x.j)} className="w-full flex items-center gap-2.5 py-1.5 text-left">
          <i className="block w-2 h-2 rounded-full shrink-0" style=${{ background: col[x.j] }}></i><span className=${"flex-1 text-[14px] truncate " + C.tx}>${x.p.name}</span><span className=${"text-[12px] truncate max-w-[40%] " + C.mu}>${riga(x)}</span><${VotoChip} v=${x.p.voto} /></button>`)}</div></div>`;
    }
    /* andamento: chi spinge minuto per minuto. Onda sopra = casa, sotto = ospite, nel colore delle squadre; i gol sono segnati */
    function Andamento({ sm, m }) {
      const fino = sm.st === "FT" ? Math.max(90, ...sm.cronaca.map((c) => minuto(c.min))) : Math.max(1, minuto(sm.clock || ""));
      const { punti, gol } = React.useMemo(() => andamento(sm.cronaca, fino), [sm, fino]);
      if (sm.cronaca.length < 8 || punti.length < 5) return null;
      const [ch, ca] = auraCol(m);
      const W = 300, H = 110, Y = H / 2, N = Math.max(90, fino);
      const mx = Math.max(1.2, ...punti.map(Math.abs));
      const X = (i) => (i / N) * W;
      const area = (sgn) => "M0," + Y + " " + punti.map((v, i) => "L" + X(i + 1).toFixed(1) + "," + (Y - (sgn > 0 ? Math.max(0, v) : Math.min(0, v)) / mx * (Y - 8)).toFixed(1)).join(" ") + " L" + X(punti.length).toFixed(1) + "," + Y + " Z";
      const dom = punti.reduce((a, v) => a + v, 0);
      return html`<div className=${C.card + " p-4"}>
        <div className="flex items-baseline mb-2"><span className=${C.lab + " flex-1"}>Andamento</span><span className=${"text-[12px] " + C.mu}>${Math.abs(dom) < punti.length * 0.08 ? "Partita equilibrata" : "Ha spinto di più " + (dom > 0 ? m.h : m.a)}</span></div>
        <svg viewBox=${"0 0 " + W + " " + H} className="w-full h-[120px]" preserveAspectRatio="none" role="img" aria-label="Andamento della partita minuto per minuto">
          <rect x="0" y="0" width=${X(45)} height=${H} fill="currentColor" className="text-[#17152B]/[0.025] dark:text-white/[0.03]" />
          <line x1=${X(45)} y1="0" x2=${X(45)} y2=${H} stroke="currentColor" className=${C.mu} strokeOpacity="0.35" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
          <path d=${area(1)} fill=${ch} fillOpacity="0.85" />
          <path d=${area(-1)} fill=${ca} fillOpacity="0.85" />
          <line x1="0" y1=${Y} x2=${W} y2=${Y} stroke="currentColor" className=${C.mu} strokeOpacity="0.4" vectorEffect="non-scaling-stroke" />
        </svg>
        <div className="relative h-5 -mt-1">${gol.map((g, i) => html`<span key=${i} className="absolute -translate-x-1/2" style=${{ left: (g.m / N) * 100 + "%", top: 0 }}><${Ic.BallIn} size=${14} c=${g.side ? ca : ch} /></span>`)}</div>
        <div className=${"flex justify-between num text-[14px] " + C.mu}><span>0'</span><span>45'</span><span>${N}'</span></div>
        <div className=${"flex gap-4 mt-2 text-[12px] " + C.mu}><span className="flex items-center gap-1.5"><i className="block w-2.5 h-2.5 rounded-full" style=${{ background: ch }}></i>${m.h} in attacco</span><span className="flex items-center gap-1.5"><i className="block w-2.5 h-2.5 rounded-full" style=${{ background: ca }}></i>${m.a} in attacco</span></div></div>`;
    }
    /* curiosità: serie in corso delle due squadre (dati della stagione) */
    function Curiosita({ m }) {
      const L = m.curiosita || [];
      if (!L.length) return null;
      const col = auraCol(m);
      return html`<div className=${C.card + " p-4"}><div className=${C.lab + " mb-2"}>Curiosità</div>
        <div className="space-y-2.5">${L.map((t, i) => { const j = t.startsWith(m.a) ? 1 : t.startsWith(m.h) ? 0 : t.includes(m.a) && !t.includes(m.h) ? 1 : 0; return html`<div key=${i} className="flex gap-3 items-start">
          <i className="block w-[3px] self-stretch rounded-full shrink-0" style=${{ background: col[j] }}></i><span className=${"text-[15px] leading-snug " + C.tx}>${t}</span></div>`; })}</div></div>`;
    }
    /* sondaggio "chi vince?": voto del pubblico confrontato con quote e IA */
    function Sondaggio({ m }) {
      const { pushUrl } = React.useContext(Ctx);
      const [v, setV] = useState(null);
      const [mio, setMio] = useState(store.get("voto:" + m.id, null));
      const aperto = m.st === "NS";
      useEffect(() => { if (!pushUrl) return; fetch(pushUrl + "/voti?id=" + encodeURIComponent(m.id)).then((r) => (r.ok ? r.json() : null)).then((x) => x && x.ok && setV(x.v)).catch(() => {}); }, [pushUrl, m.id]);
      if (!pushUrl || (!aperto && (!v || v[0] + v[1] + v[2] === 0))) return null;
      const vota = (s) => {
        let chi = store.get("chi", null); if (!chi) { chi = Array.from({ length: 16 }, () => "abcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(Math.random() * 36)]).join(""); store.set("chi", chi); }
        if (s === mio) return;
        const pm = mio, pv = v;
        setMio(s); store.set("voto:" + m.id, s);
        const nv = (v || [0, 0, 0]).slice(); if (mio != null) nv[mio] = Math.max(0, nv[mio] - 1); nv[s] += 1; setV(nv);
        const annulla = () => { setMio(pm); store.set("voto:" + m.id, pm); setV(pv); };
        fetch(pushUrl + "/voto", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: m.id, s, chi }) }).then((r) => r.json()).then((x) => (x && x.ok ? setV(x.v) : annulla())).catch(annulla);
      };
      const tot = v ? v[0] + v[1] + v[2] : 0;
      const col = auraCol(m);
      const nomi = [m.h, "Pareggio", m.a];
      const cc = [col[0], "#8A84A3", col[1]];
      return html`<div className=${C.card + " p-4"}>
        <div className="flex items-baseline mb-3"><span className=${C.lab + " flex-1"}>Chi vince secondo te?</span>${tot > 0 && html`<span className=${"text-[12px] " + C.mu}>${tot} ${tot === 1 ? "voto" : "voti"}</span>`}</div>
        ${mio == null && aperto ? html`<div className="grid grid-cols-3 gap-2">${nomi.map((n, i) => html`<button key=${i} onClick=${() => vota(i)} className=${"rounded-[14px] py-3 px-2 text-[14px] font-semibold leading-tight " + C.ch + " " + C.tx}>
            <span className="block num text-[22px] font-bold mb-0.5" style=${{ color: i === 1 ? undefined : cc[i] }}>${["1", "X", "2"][i]}</span><span className="block truncate">${n}</span></button>`)}</div>
            <p className=${"text-[12px] mt-2 " + C.mu}>Vota per vedere cosa pensano gli altri tifosi.</p>`
          : html`<div className="space-y-2.5">${nomi.map((n, i) => { const q = tot ? v[i] / tot : 0; return html`<div key=${i}>
              <div className="flex items-baseline text-[14px]"><span className=${"flex-1 truncate " + C.tx + (mio === i ? " font-semibold" : "")}>${n}${mio === i ? " (il tuo voto)" : ""}</span><span className=${"num text-[18px] font-bold " + C.tx}>${Math.round(q * 100)}%</span></div>
              <div className=${"h-[6px] rounded-full mt-1 " + C.ch}><div className="h-[6px] rounded-full" style=${{ width: q * 100 + "%", background: cc[i] }}></div></div></div>`; })}
            <div className=${"text-[12px] pt-1 " + C.mu}>Le quote dicono: ${m.h} ${pct(m.mk[0])}%, pareggio ${pct(m.mk[1])}%, ${m.a} ${pct(m.mk[2])}%.${aperto ? " Puoi cambiare voto fino al calcio d'inizio." : " Votazione chiusa."}</div>
            ${aperto && html`<div className="flex gap-2">${nomi.map((n, i) => mio !== i && html`<button key=${i} onClick=${() => vota(i)} className=${"text-[12px] font-semibold px-2.5 py-1 rounded-full " + C.ch + " " + C.tx}>Vota ${["1", "X", "2"][i]}</button>`)}</div>`}</div>`}</div>`;
    }
    const ST_IT = [["totalGoals", "Gol"], ["goalAssists", "Assist"], ["totalShots", "Tiri"], ["shotsOnTarget", "Tiri in porta"], ["foulsCommitted", "Falli fatti"], ["foulsSuffered", "Falli subiti"], ["offsides", "Fuorigioco"], ["yellowCards", "Gialli"], ["redCards", "Rossi"], ["saves", "Parate"], ["goalsConceded", "Gol subiti"], ["shotsFaced", "Tiri subiti"], ["ownGoals", "Autogol"]];
    function PlayerSheet({ p, side, m, col, onClose, noMatch }) {
      const [t, setT] = useState(noMatch ? 1 : 0);
      const [info, setInfo] = useState(null);
      const [car, setCar] = useState(null);
      const [err, setErr] = useState("");
      useEffect(() => { loadPlayer(p.id).then(setInfo).catch(() => setErr("Profilo non raggiungibile ora.")); }, [p.id]);
      useEffect(() => { if (t === 2 && car === null) loadCareer(p.id).then(setCar).catch(() => setCar([])); }, [t]);
      const [vs, setVs] = useState(null);
      useEffect(() => { caricaVoti().then((V) => setVs(V[p.id] || false)).catch(() => setVs(false)); }, [p.id]);
      const gk = ruolo(p.pos) === "Portiere";
      const s = p.st || {};
      const box = (l, v) => html`<div key=${l} className=${"rounded-xl p-2 text-center " + C.ch}><div className=${"text-base font-semibold tabular-nums " + C.tx}>${v == null || Number.isNaN(v) ? "-" : v}</div><div className=${"text-[10px] " + C.mu}>${l}</div></div>`;
      const pr = info && info.prof;
      const stato = p.starter ? (p.out ? `Titolare, uscito al ${p.minOut || "?"}` : "Titolare") : p.inn ? `Entrato al ${p.minIn || "?"}` : "In panchina";
      return html`<${Sheet} title=${p.name} onClose=${onClose}>
        <div className="flex items-center gap-3"><span className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold text-white shrink-0" style=${{ background: col || "#8E8E93" }}>${p.num || "-"}</span>
          <div className="min-w-0"><div className=${"text-sm font-semibold " + C.tx}>${ruolo(p.pos)}${pr && pr.squadra ? " - " + pr.squadra : m.h ? " - " + (side === 0 ? m.h : m.a) : ""}</div>
            <div className=${"text-xs " + C.mu}>${pr ? [pr.naz, pr.eta ? pr.eta + " anni" : "", pr.altezza].filter(Boolean).join(" - ") : err || "Caricamento del profilo..."}</div></div></div>
        ${vs && html`<div className=${"flex items-center gap-3 rounded-[14px] p-3 " + C.ch}><${VotoChip} v=${vs[0]} big=${true} />
          <div className="min-w-0"><div className=${"text-[14px] font-semibold " + C.tx}>Voto medio AuraPitch nella stagione</div><div className=${"text-[12px] " + C.mu}>${vs[1]} partite, ${vs[2]} minuti${vs[3] ? ", " + vs[3] + " gol" : ""}${vs[4] ? ", " + vs[4] + " assist" : ""}${p.voto != null ? ". In questa partita: " + p.voto.toFixed(1).replace(".", ",") : ""}</div></div></div>`}
        ${noMatch ? html`<${Seg} small=${true} items=${["Stagione", "Carriera"]} val=${t - 1} set=${(i) => setT(i + 1)} />` : html`<${Seg} small=${true} items=${["Questa partita", "Stagione", "Carriera"]} val=${t} set=${setT} />`}
        ${t === 0 && html`<${React.Fragment}><div className=${"text-xs " + C.mu}>${stato}</div>
          <div className="grid grid-cols-4 gap-2">${ST_IT.filter(([k]) => (gk ? true : !["saves", "goalsConceded", "shotsFaced"].includes(k)) && (s[k] != null)).map(([k, l]) => box(l, s[k]))}</div><//>`}
        ${t === 1 && html`<${React.Fragment}>${!info ? html`<div className=${"text-sm " + C.mu}>${err || "Caricamento..."}</div>` : !info.stagione.length ? html`<div className=${"text-sm " + C.mu}>Nessuna statistica per la stagione in corso.</div>`
          : info.stagione.map((sp) => html`<div key=${sp.comp} className="space-y-1.5"><div className=${C.lab}>${sp.comp.replace(/(Italian|English|Spanish|German|French) /, "").replace("UEFA ", "")}</div>
            <div className="grid grid-cols-4 gap-2">${(gk ? [["starts", "Presenze"], ["cleanSheet", "Porta inviolata"], ["saves", "Parate"], ["goalsConceded", "Gol subiti"]] : [["starts", "Da titolare"], ["totalGoals", "Gol"], ["goalAssists", "Assist"], ["totalShots", "Tiri"], ["shotsOnTarget", "In porta"], ["yellowCards", "Gialli"], ["redCards", "Rossi"], ["foulsSuffered", "Falli subiti"]]).map(([k, l]) => box(l, sp.v[k]))}</div></div>`)}
          ${info && info.ultime.length > 0 && html`<div className="space-y-1"><div className=${C.lab}>Ultime partite</div>${info.ultime.slice(0, 5).map((u) => html`<div key=${u.id} className=${"flex items-center gap-2 text-sm " + C.tx}>
            <span className=${"w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center " + TONE[u.ev && u.ev.gameResult === "W" ? "good" : u.ev && u.ev.gameResult === "D" ? "warn" : "bad"]}>${u.ev ? { W: "V", D: "N", L: "P" }[u.ev.gameResult] || "-" : "-"}</span>
            <span className="flex-1 truncate">${u.ev ? (u.ev.atVs === "@" ? "@ " : "vs ") + (u.ev.opponent && u.ev.opponent.displayName) : ""}</span><span className="tabular-nums font-semibold">${u.ev ? u.ev.score : ""}</span>
            <span className=${"text-xs w-16 text-right " + C.mu}>${u.v.totalGoals && u.v.totalGoals !== "0" ? u.v.totalGoals + " gol " : ""}${u.v.goalAssists && u.v.goalAssists !== "0" ? u.v.goalAssists + " ass" : ""}</span></div>`)}</div>`}<//>`}
        ${t === 2 && html`<${React.Fragment}>${car === null ? html`<div className=${"text-sm " + C.mu}>Caricamento della carriera...</div>` : !car.length ? html`<div className=${"text-sm " + C.mu}>Carriera non disponibile per questo giocatore.</div>`
          : html`<div className="overflow-x-auto"><table className=${"w-full text-[13px] tabular-nums " + C.tx}><thead><tr className=${"text-[10px] " + C.mu}><th className="text-left font-medium py-1">Stagione</th><th className="text-left font-medium">Squadra</th><th className="text-right font-medium">Pres</th><th className="text-right font-medium">${gk ? "Inv" : "Gol"}</th><th className="text-right font-medium">${gk ? "Sub" : "Ass"}</th></tr></thead>
            <tbody>${car.map((r, i) => html`<tr key=${i} className=${"border-t " + C.bd}><td className="py-1.5 pr-1">${r.stagione}</td><td className="pr-1"><div className="truncate max-w-[130px] font-semibold">${r.squadra}</div><div className=${"text-[10px] truncate max-w-[130px] " + C.mu}>${r.lega}</div></td>
              <td className="text-right">${r.pres ?? "-"}</td><td className="text-right">${(gk ? r.cs : r.gol) ?? "-"}</td><td className="text-right">${(gk ? r.subiti : r.ass) ?? "-"}</td></tr>`)}</tbody></table></div>`}
          <p className=${"text-[11px] " + C.mu}>Campionati e coppe stagione per stagione, dalle più recenti. Le amichevoli sono escluse.</p><//>`}<//>`;
    }

    let _voti = null;
    function caricaVoti() { if (!_voti) _voti = fetch("data/voti.json").then((r) => (r.ok ? r.json() : {})).catch(() => ({})); return _voti; }

    /* ---- consiglio IA in diretta ---- */
    function pois(l) { const o = [Math.exp(-l)]; for (let k = 1; k <= 8; k++) o.push((o[k - 1] * l) / k); return o; }
    /* spinta: tiri e angoli negli ultimi 20 minuti (stessi pesi del test). Verificata su 990 fotografie della stagione (60' e 75'):
       errore della previsione in diretta -2,2% sulle partite non usate per tararla. b = 1,4 */
    const PESO_SPINTA = { "shot-on-target": 1, "shot-hit-woodwork": 1, "shot-off-target": 0.5, "shot-blocked": 0.4, "corner-awarded": 0.3 };
    function spinta(sm, min) {
      const sp = [0, 0];
      if (sm) for (const c of sm.cronaca) { const d = min - minuto(c.min); if (c.side != null && d >= 0 && d < 20) sp[c.side] += PESO_SPINTA[c.type] || 0; }
      return sp;
    }
    // Versione 2 (28/10/2026): rampa del tempo che resta (fine media 96') e spinta lineare. Verificata su 990 fotografie: -4,4% di errore.
    function quotaRestante(min) {
      const E = 96, r = 1.13, t = Math.min(Math.max(min || 0, 0), E - 0.5);
      return (E - t + (r * (E * E - t * t)) / 180) / (E + (r * E * E) / 180);
    }
    function liveProb(code, xg, g, min, reds, sp) {
      if (evalCode(code, 1, 0) === null) return null; // mercati sui tempi, cartellini, marcatori: niente stima in diretta
      reds = reds || [0, 0];
      const f = quotaRestante(min);
      const z = sp ? 0.058 * ((sp[0] || 0) - (sp[1] || 0)) : 0;
      const rh = Math.pow(0.67, reds[0]) * Math.pow(1.25, reds[1]) * Math.exp(z), ra = Math.pow(0.67, reds[1]) * Math.pow(1.25, reds[0]) * Math.exp(-z);
      const ph = pois(Math.max(0.001, xg[0] * f * rh)), pa = pois(Math.max(0.001, xg[1] * f * ra));
      let p = 0, tot = 0;
      for (let i = 0; i < ph.length; i++) for (let j = 0; j < pa.length; j++) { const w = ph[i] * pa[j]; tot += w; if (evalCode(code, g[0] + i, g[1] + j)) p += w; }
      return p / tot;
    }
    function LiveTips({ m, sm }) {
      const tip = m.tip || {};
      const ks = ["consiglio", "prudente", "coraggiosa"].filter((k) => tip[k]);
      if (!ks.length || !(m.st === "LIVE" || m.st === "FT")) return null;
      const g = (sm && sm.st !== "NS" && sm.g[0] != null ? sm.g : m.g) || [0, 0];
      if (m.st === "FT") {
        return html`<div className=${C.card + " p-4 space-y-2"}><div className=${C.lab}>Com'è andata</div>
          ${ks.map((k) => { const ok = evalCode(tip[k].c, g[0], g[1], m.g1 ? m.g1[0] : null, m.g1 ? m.g1[1] : null); return html`<div key=${k} className="flex items-center gap-2 text-sm">
            <span className=${"flex-1 " + C.tx}><span className=${C.mu}>${tip[k].titolo}:</span> ${mLabel(m, tip[k].c)}</span>
            <span className=${"text-xs font-semibold px-2 py-0.5 rounded-full border " + (ok === null ? TONE.ok : ok ? TONE.good : TONE.bad)}>${ok === null ? "Da verificare" : ok ? "Presa" : "Non presa"}</span></div>`; })}
          <div className=${"text-[11px] " + C.mu}>Risultato finale ${g[0]}-${g[1]}. Lo storico completo dei consigli è in Schedina IA.</div></div>`;
      }
      const clock = (sm && sm.clock) || m.clock || "";
      const min = minuto(clock);
      const reds = [0, 1].map((j) => (sm ? sm.eventi.filter((e) => e.k === "rosso" && e.side === j).length : 0));
      const xg = m.xg && m.xg[0] != null ? m.xg : [1.35, 1.1];
      const sp = spinta(sm, min);
      return html`<div className=${C.card + " p-4 space-y-2 ring-1 ring-rose-200 dark:ring-rose-500/40"}>
        <div className="flex items-center gap-2"><span className="relative flex w-2 h-2"><span className="absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75 animate-ping"></span><span className="relative inline-flex rounded-full w-2 h-2 bg-rose-500"></span></span>
          <span className=${C.lab + " flex-1"}>Consigli in diretta</span><span className=${"text-xs tabular-nums " + C.mu}>${clock} - ${g[0]}-${g[1]}</span></div>
        ${sp[0] + sp[1] >= 1 && html`<div className=${"text-[12px] " + C.mu}>Spinta negli ultimi 20 minuti (tiri e angoli): ${m.h} ${nf(sp[0].toFixed(1))}, ${m.a} ${nf(sp[1].toFixed(1))}. ${sp[0] > 2 * sp[1] + 1.5 ? m.h + " sta spingendo: l'IA alza i suoi gol attesi per il resto della partita." : sp[1] > 2 * sp[0] + 1.5 ? m.a + " sta spingendo: l'IA alza i suoi gol attesi per il resto della partita." : ""}</div>`}
        ${ks.filter((k) => liveProb(tip[k].c, xg, g, min, reds, sp) !== null).map((k) => { const t = tip[k], p = liveProb(t.c, xg, g, min, reds, sp), d = p - t.p;
          const lab = p >= 0.999 ? ["Già vinta", TONE.good] : p <= 0.001 ? ["Persa", TONE.bad] : null;
          return html`<div key=${k} className="flex items-center gap-2 text-sm">
            <span className=${"flex-1 min-w-0 " + C.tx}><span className=${C.mu}>${{ consiglio: "Consiglio", prudente: "Prudente", coraggiosa: "Coraggiosa" }[k]}:</span> ${mLabel(m, t.c)}</span>
            ${lab ? html`<span className=${"text-xs font-semibold px-2 py-0.5 rounded-full border " + lab[1]}>${lab[0]}</span>`
              : html`<span className="tabular-nums text-right"><b className=${C.tx}>${pctL(p)}%</b> <span className=${"text-xs " + (d >= 0 ? "text-emerald-600 dark:text-emerald-300" : "text-rose-600 dark:text-rose-300")}>${d >= 0 ? "+" : ""}${pct(d)}</span></span>`}</div>`; })}
        <div className=${"text-[11px] " + C.mu}>Probabilità ricalcolate su punteggio, minuto ed espulsioni, partendo dai gol attesi prima della partita (il numero piccolo è la differenza rispetto al pre-partita).${reds[0] + reds[1] ? " Espulsioni considerate: " + reds[0] + " - " + reds[1] + "." : ""}</div></div>`;
    }

    /* ---- meteo al calcio d'inizio (Open-Meteo, gratuito) ---- */
    const meteoCache = {};
    function MeteoCard({ m, sm }) {
      const [w, setW] = useState(null);
      const citta = sm && sm.stadio ? sm.stadio.split(",").slice(-1)[0].trim() : null;
      useEffect(() => {
        const ko = new Date(m.ko), ore = (ko - Date.now()) / 3600000;
        if (!citta || m.st !== "NS" || ore > 7 * 24 || ore < -2) return;
        const key = citta + m.ko;
        if (meteoCache[key]) { setW(meteoCache[key]); return; }
        (async () => {
          try {
            const g = await getJSON("https://geocoding-api.open-meteo.com/v1/search?count=1&language=it&name=" + encodeURIComponent(citta));
            const p = g.results && g.results[0];
            if (!p) return;
            const f = await getJSON(`https://api.open-meteo.com/v1/forecast?latitude=${p.latitude}&longitude=${p.longitude}&hourly=temperature_2m,precipitation,wind_speed_10m&timezone=UTC&forecast_days=8`);
            const h = m.ko.slice(0, 13);
            const i = (f.hourly.time || []).findIndex((t) => t.slice(0, 13) === h);
            if (i < 0) return;
            const x = { citta: p.name, t: f.hourly.temperature_2m[i], pioggia: f.hourly.precipitation[i], vento: f.hourly.wind_speed_10m[i] };
            meteoCache[key] = x; setW(x);
          } catch (e) { /* meteo non disponibile */ }
        })();
      }, [citta, m.ko, m.st]);
      if (!w) return null;
      const forte = w.pioggia >= 2 || w.vento >= 30;
      return html`<div className=${C.card + " p-4 space-y-1"}><div className=${C.lab}>Meteo al calcio d'inizio</div>
        <div className=${"text-sm " + C.tx}>${w.citta}: <b>${Math.round(w.t)}°</b>, pioggia ${nf(w.pioggia)} mm, vento ${Math.round(w.vento)} km/h</div>
        <div className=${"text-[11px] " + C.mu}>${forte ? "Pioggia forte o vento sostenuto abbassano un po' i gol: le quote di solito lo tengono già in conto, quindi per ora il meteo non cambia le probabilità." : "Condizioni normali: nessun effetto atteso sui gol."} Fonte: Open-Meteo.</div></div>`;
    }

    /* ---- fattori: come l'IA si discosta dalle quote ---- */
    function FattoriCard({ m }) {
      const [open, setOpen] = useState(false);
      const fs = m.fattori || [];
      const att = fs.filter((f) => f.delta || f.delta_avv), info = fs.filter((f) => !f.delta && !f.delta_avv);
      const xm = m.xg_mercato || m.xg;
      const TIPO = { infortunio: "indisponibile", squalifica: "squalificato", dubbio: "in dubbio", rientro: "rientra", smentita: "smentita", notizia: "notizia" };
      const nf = (x) => (x == null ? "-" : Number(x).toFixed(2).replace(".", ","));
      return html`<div className=${C.card + " p-4 space-y-2"}>
        <button onClick=${() => setOpen(!open)} className="w-full flex items-center gap-2 text-left"><span className=${C.lab + " flex-1"}>Fattori dell'IA</span>
          <span className=${"text-xs " + C.mu}>${att.length ? att.length + " correzion" + (att.length === 1 ? "e" : "i") : "nessuna correzione"}${(m.segnali || []).length + (m.diffidati || []).length ? " - " + ((m.segnali || []).length + (m.diffidati || []).length) + " segnali" : ""}</span><${open ? Ic.ChevronUp : Ic.ChevronDown} size=${15} className=${C.mu} /></button>
        <div className=${"text-sm " + C.tx}>Gol attesi: ${m.h} <b>${nf(m.xg[0])}</b>, ${m.a} <b>${nf(m.xg[1])}</b>${att.length ? html` <span className=${C.mu}>(dalle quote ${nf(xm[0])} e ${nf(xm[1])})</span>` : html` <span className=${C.mu}>(uguali alla lettura delle quote)</span>`}</div>
        ${open && html`<div className="space-y-2 pt-1">
          ${att.map((f, i) => html`<div key=${i} className=${"text-sm rounded-xl p-2.5 " + C.ch + " " + C.tx}>
            <div><b>${f.chi}</b> (${f.lato ? m.a : m.h}) ${TIPO[f.tipo] || f.tipo}: ${f.delta ? "gol attesi " + String(Math.round(f.delta * 1000) / 10).replace(".", ",") + "%" : ""}${f.delta && f.delta_avv ? ", " : ""}${f.delta_avv ? "gol attesi di " + (f.lato ? m.h : m.a) + " +" + String(Math.round(f.delta_avv * 1000) / 10).replace(".", ",") + "% (peso in difesa)" : ""}</div>
            <div className=${"text-[11px] " + C.mu}>${f.delta ? `Peso nei gol della squadra ${Math.round(f.quota * 100)}%` : "Peso difensivo dal voto medio AuraPitch e dai minuti giocati"} x scoperto dal sostituto 50% x affidabilità ${Math.round(f.affidabilita * 100)}%${f.prezzo < 1 ? " x 25% perché già nota al mercato" : ""}${f.tetto ? ", ridotto dal tetto del 15%" : ""}.</div>
            ${f.link ? html`<a href=${f.link} target="_blank" rel="noopener" className="text-[11px] text-[#5B2EE6] dark:text-[#A58BFF]">${f.fonte || "Fonte"}: ${f.titolo}</a>` : html`<div className=${"text-[11px] " + C.mu}>${f.titolo}</div>`}</div>`)}
          ${(m.segnali || []).length > 0 && html`<div className=${"text-[11px] font-semibold " + C.mu}>Segnali registrati (peso zero, in attesa di misura)</div>${m.segnali.map((x, i) => html`<div key=${"s" + i} className=${"text-[12px] " + C.tx}>
            ${x.tipo === "allenatore" ? html`Cambio in panchina (${x.lato ? m.a : m.h}): ${x.link ? html`<a href=${x.link} target="_blank" rel="noopener" className="text-[#5B2EE6] dark:text-[#A58BFF]">${x.titolo}</a>` : x.titolo}` : html`Riposo: ${x.lato ? m.a : m.h} ha ${x.titolo}.`}</div>`)}
            <div className=${"text-[11px] " + C.mu}>Cambio di allenatore e giorni di riposo vengono registrati ma non pesano: nei test il riposo non ha migliorato le quote e il "rimbalzo" del nuovo allenatore è in gran parte già nel prezzo. Lo storico dirà se meritano un peso.</div>`}
          ${(m.diffidati || []).length > 0 && html`<div className=${"text-[12px] " + C.tx}><b>Diffidati</b> (alla prossima ammonizione saltano la partita dopo): ${m.diffidati.map((x) => x.chi + " (" + (x.lato ? m.a : m.h) + ")").join(", ")}.</div>`}
          ${info.length > 0 && html`<div className=${"text-[11px] font-semibold " + C.mu}>Notizie lette ma senza effetto sulle probabilità</div>${info.map((f, i) => html`<a key=${"i" + i} href=${f.link} target="_blank" rel="noopener" className=${"block text-[12px] " + C.tx}>${f.chi}: ${TIPO[f.tipo] || f.tipo} <span className=${C.mu}>- ${f.fonte}</span></a>`)}`}
          <p className=${"text-[11px] " + C.mu}>Base: le quote dei bookmaker, che nei test su 55.000 partite sono la stima più precisa. Ogni informazione nuova (notizie su infortuni e squalifiche, formazioni ufficiali) corregge i gol attesi con un peso dichiarato e un tetto del 15% per squadra, per non sbilanciare il risultato. Ogni correzione viene registrata e misurata: i pesi si ritarano sui risultati.</p></div>`}</div>`;
    }

    /* ---- storico dei consigli ---- */
    function StoricoCard() {
      const { stor } = React.useContext(Ctx);
      const [open, setOpen] = useState(false);
      if (!stor || !stor.riass) return null;
      const R = stor.riass, nomi = { consiglio: "Consiglio", prudente: "Prudente", coraggiosa: "Coraggiosa" };
      const tot = R.consiglio ? R.consiglio.n : 0;
      return html`<div className=${C.card + " p-4 space-y-2"}>
        <div className="flex items-center"><span className=${C.lab + " flex-1"}>Storico consigli IA, ultimi ${stor.giorni} giorni</span><${Ic.BarChart3} size=${15} className=${C.mu} /></div>
        ${!tot ? html`<p className=${"text-sm " + C.mu}>Lo storico parte da oggi: ogni consiglio viene salvato prima del calcio d'inizio e verificato a fine partita, senza ritocchi. Torna tra qualche giorno.</p>`
          : html`<${React.Fragment}>
            <div className=${"grid grid-cols-[1.3fr_1fr_0.8fr_0.8fr] text-[11px] font-medium " + C.mu}><span>Profilo</span><span className="text-right">Presi</span><span className="text-right">Attesi</span><span className="text-right">Resa</span></div>
            ${Object.keys(nomi).filter((k) => R[k] && R[k].n).map((k) => { const r = R[k]; return html`<div key=${k} className=${"grid grid-cols-[1.3fr_1fr_0.8fr_0.8fr] text-sm tabular-nums border-t pt-1.5 " + C.bd + " " + C.tx}>
              <span className="font-semibold">${nomi[k]}</span><span className="text-right">${r.vinti}/${r.n} <span className=${"text-xs " + C.mu}>${Math.round((r.vinti / r.n) * 100)}%</span></span>
              <span className=${"text-right " + C.mu}>${String(r.attesa).replace(".", ",")}</span><span className=${"text-right font-semibold " + (r.resa >= 0 ? "text-emerald-600 dark:text-emerald-300" : "text-rose-600 dark:text-rose-300")}>${r.resa >= 0 ? "+" : ""}${String(r.resa).replace(".", ",")}</span></div>`; })}
            <p className=${"text-[11px] " + C.mu}>"Attesi" è quanti consigli ci si aspettava di prendere sommando le probabilità: se "Presi" gli resta vicino, le probabilità sono oneste. "Resa" è il guadagno in unità puntando 1 su ogni consiglio alla quota mostrata (stimata dove manca quella media).</p>
            ${stor.taratura && html`<div className=${"text-[11px] rounded-lg p-2 " + C.ch + " " + C.tx}>${stor.taratura.n ? html`<b>Taratura dei fattori:</b> su ${stor.taratura.n} partite in cui l'IA ha corretto le quote, errore medio quote ${String(stor.taratura.errore_quote).replace(".", ",")} contro IA ${String(stor.taratura.errore_ia).replace(".", ",")} (più basso è meglio).`
              : html`<b>Taratura dei fattori:</b> le correzioni dell'IA (notizie e formazioni) vengono registrate partita per partita; con abbastanza partite si misura se migliorano le quote e si ritarano i pesi.`}</div>`}
            <button onClick=${() => setOpen(!open)} className="text-xs font-semibold text-[#5B2EE6] dark:text-[#A58BFF]">${open ? "Nascondi le partite" : "Vedi partita per partita"}</button>
            ${open && html`<div className="space-y-1.5">${stor.lista.map((v, i) => html`<div key=${i} className=${"text-sm border-t pt-1.5 " + C.bd}>
              <div className=${"flex justify-between " + C.tx}><span className="truncate">${v.h} - ${v.a}</span><b className="tabular-nums">${v.g ? v.g[0] + "-" + v.g[1] : ""}</b></div>
              <div className="flex flex-wrap gap-1 mt-1">${Object.keys(nomi).filter((k) => v.tips[k]).map((k) => html`<span key=${k} className=${"text-[11px] px-2 py-0.5 rounded-full border " + (v.esiti[k] ? TONE.good : TONE.bad)}>${mLabel({ h: v.h, a: v.a }, v.tips[k].c, true)}</span>`)}</div></div>`)}</div>`}<//>`}</div>`;
    }

    /* ---- pagina squadra ---- */
    function TeamView() {
      const { team, setTeam, D } = React.useContext(Ctx);
      const V = usaVoti();
      const notizie = [];
      for (const m of D.matches) for (const f of m.fattori || []) { const sq = f.lato ? m.a : m.h; if (sq === team.name && !notizie.some((x) => x.chi === f.chi)) notizie.push(f); }
      const [t, setT] = useState(0);
      const [d, setDd] = useState(null);
      const [err, setErr] = useState("");
      const [pl, setPl] = useState(null);
      useEffect(() => {
        let ok = true;
        (async () => {
          try {
            const id = team.id || (await findTeam(team.lgE, team.name));
            if (!id) throw new Error("non trovata");
            const x = await loadTeam(team.lgE, id);
            if (ok) setDd(x);
          } catch (e) { if (ok) setErr("Dati della squadra non disponibili in questo momento."); }
        })();
        return () => { ok = false; };
      }, [team.lgE, team.id, team.name]);
      const dt = (s) => { const x = new Date(s); return x.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" }) + " " + x.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }); };
      const form = d ? d.risultati.slice(0, 5).reverse().map((r) => ({ esito: r.esito, avv: r.avv, ris: r.g.join("-") })) : [];
      const RUOLI = ["Portiere", "Difensore", "Centrocampista", "Attaccante"];
      return html`<div className="px-4 space-y-3">
        <button onClick=${() => setTeam(null)} className="flex items-center gap-1 text-sm font-medium text-[#5B2EE6] dark:text-[#A58BFF]"><${Ic.ChevronLeft} size=${18} />Indietro</button>
        <div className=${C.card + " p-4 flex items-center gap-3"}><${Crest} t=${team.name} size=${52} />
          <div className="flex-1 min-w-0"><div className=${"text-xl font-semibold truncate " + C.tx}>${team.name}</div>
            ${(() => { const k = Object.keys(ESPN_LG).find((q) => ESPN_LG[q] === team.lgE && D.leagues.some((l) => l.k === q)); const L0 = k && D.leagues.find((l) => l.k === k);
              return L0 && html`<div className=${"text-[13px] mt-0.5 flex items-center gap-1.5 " + C.mu}><${Flag} k=${L0.flag} w=${14} /><${NomeLega} k=${k}>${L0.name}<//></div>`; })()}
            ${form.length > 0 && html`<div className="mt-1.5"><${Form} list=${form} /></div>`}</div></div>
        <${SchedaAllenatore} squadra=${team.name} />
        <${Seg} items=${["Partite", "Rosa", "Indisponibili"]} val=${t} set=${setT} />
        ${!d ? html`<div className=${C.card + " p-4 text-sm " + C.mu}>${err || "Caricamento..."}</div>`
          : t === 0 ? html`<${React.Fragment}>
            <div className=${C.lab}>Prossime partite</div>
            <div className=${C.card + " px-4 py-1"}>${d.prossime.length ? d.prossime.map((r, i) => html`<div key=${r.id} className=${"flex items-center gap-2 py-2 text-sm " + (i ? "border-t " + C.bd : "") + " " + C.tx}>
              <span className=${"w-24 text-xs tabular-nums " + C.mu}>${dt(r.date)}</span><span className="flex-1 truncate">${r.casa ? "vs" : "@"} <${NomeSquadra} t=${r.avv} lgE=${team.lgE} /></span><span className=${"text-[11px] " + C.mu}>${r.comp}</span></div>`)
              : html`<div className=${"py-2 text-sm " + C.mu}>Nessuna partita in calendario.</div>`}</div>
            <div className=${C.lab}>Risultati</div>
            <div className=${C.card + " px-4 py-1"}>${d.risultati.map((r, i) => html`<div key=${r.id} className=${"flex items-center gap-2 py-2 text-sm " + (i ? "border-t " + C.bd : "") + " " + C.tx}>
              <span className=${"w-6 h-6 rounded-md border text-[11px] font-semibold flex items-center justify-center " + TONE[r.esito === "V" ? "good" : r.esito === "N" ? "warn" : "bad"]}>${r.esito}</span>
              <span className=${"w-12 text-xs tabular-nums " + C.mu}>${new Date(r.date).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" })}</span>
              <span className="flex-1 truncate">${r.casa ? "vs" : "@"} <${NomeSquadra} t=${r.avv} lgE=${team.lgE} /></span><b className="tabular-nums">${r.g[0]}-${r.g[1]}</b></div>`)}</div><//>`
          : t === 2 ? html`<div className=${C.card + " p-4 space-y-3"}>
              ${[...d.rosa.filter((p) => p.inf).map((p) => ({ chi: p.name, tipo: /out|injur/i.test(p.inf) ? "Infortunato" : p.inf, fonte: "ESPN" })), ...notizie.filter((f) => !d.rosa.some((p) => p.inf && p.name === f.chi)).map((f) => ({ chi: f.chi, tipo: { infortunio: "Indisponibile", squalifica: "Squalificato", dubbio: "In dubbio", rientro: "Rientra", smentita: "Smentita" }[f.tipo] || f.tipo, fonte: f.fonte || "Notizie", titolo: f.titolo, link: f.link }))]
                .map((x, i) => html`<div key=${i}><div className="flex items-center gap-2"><span className=${"flex-1 text-[15px] font-semibold " + C.tx}>${x.chi}</span><span className=${"text-[11px] font-semibold px-2 py-0.5 rounded-full border " + (x.tipo === "Rientra" || x.tipo === "Smentita" ? TONE.good : x.tipo === "In dubbio" ? TONE.warn : TONE.bad)}>${x.tipo}</span></div>
                  ${x.titolo && (x.link ? html`<a href=${x.link} target="_blank" rel="noopener" className=${"block text-[12px] mt-0.5 " + C.acc}>${x.fonte}: ${x.titolo}</a>` : html`<div className=${"text-[12px] mt-0.5 " + C.mu}>${x.titolo}</div>`)}</div>`)}
              ${!d.rosa.some((p) => p.inf) && !notizie.length && html`<div className=${"text-[14px] " + C.mu}>Nessun indisponibile segnalato da ESPN o dalle notizie degli ultimi giorni.</div>`}
              <p className=${"text-[11px] " + C.mu}>Fonti: rosa ESPN e titoli delle notizie letti dall'IA (solo le squadre che giocano nei prossimi giorni).</p></div>`
          : html`<${React.Fragment}>${RUOLI.map((ru) => { const ps = d.rosa.filter((p) => p.ruolo === ru); if (!ps.length) return null; return html`<div key=${ru}>
            <div className=${C.lab + " mb-1.5"}>${ru === "Attaccante" ? "Attaccanti" : ru === "Portiere" ? "Portieri" : ru === "Difensore" ? "Difensori" : "Centrocampisti"}</div>
            <div className=${C.card + " px-4 py-1"}>${ps.map((p, i) => html`<button key=${p.id} onClick=${() => setPl(p)} className=${"w-full flex items-center gap-2 py-2 text-left text-sm " + (i ? "border-t " + C.bd : "") + " " + C.tx}>
              <span className=${"w-6 text-xs tabular-nums " + C.mu}>${p.num || ""}</span><span className="flex-1 truncate">${p.name}</span>${V && V[p.id] && V[p.id][1] >= 2 && html`<${VotoChip} v=${V[p.id][0]} />`}
              ${p.inf && html`<span className=${"text-[10px] font-semibold px-1.5 py-0.5 rounded-full border " + TONE.bad}>${/out|injur/i.test(p.inf) ? "Infortunato" : p.inf}</span>`}
              <span className=${"text-xs " + C.mu}>${[p.naz, p.eta ? p.eta + " a" : ""].filter(Boolean).join(" - ")}</span><${Ic.ChevronRight} size=${14} className=${C.mu} /></button>`)}</div></div>`; })}<//>`}
        ${pl && html`<${PlayerSheet} p=${pl} side=${0} col=${d && d.colore} m=${{ h: team.name, a: "" }} noMatch=${true} onClose=${() => setPl(null)} />`}
        <p className=${"text-[11px] " + C.mu}>Dati da ESPN: calendario, risultati e rosa si aggiornano da soli.</p></div>`;
    }

    /* ---- consiglio IA motivato e tutti i mercati ---- */
    function TipView({ m, sm }) {
      const [tutte, setTutte] = useState(false);
      const { D, setGloss } = React.useContext(Ctx);
      const { mySlip, addLeg, aff } = React.useContext(Ctx);
      const [why, setWhy] = useState(null); // motivazioni chiuse: si aprono con "Perché questa scelta"
      const affid = (c, p) => { const rows = aff && aff.mercati && aff.mercati[c]; const r = rows && rows.find((x) => p >= x[0] && p < x[1]);
        return r ? `Affidabilità verificata: su ${r[2].toLocaleString("it-IT")} partite di prova (${aff.recenti && aff.recenti.includes(c) ? "2020/21-2025/26" : aff.stagioni}), quando questa giocata era stimata tra il ${Math.round(r[0] * 100)}% e il ${Math.round(r[1] * 100)}% è passata il ${Math.round(r[4] * 100)}% delle volte (stima media ${Math.round(r[3] * 100)}%).` : null; };
      const [grp, setGrp] = useState(null);
      const inSlip = mySlip.find((x) => x.id === m.id);
      const tip = m.tip || {};
      const AddBtn = ({ c }) => { const on = inSlip && norm(inSlip.k) === c; return html`<button aria-label="Aggiungi alla schedina" onClick=${(e) => { e.stopPropagation(); addLeg(m, c); }}
        className=${"w-8 h-8 rounded-full flex items-center justify-center shrink-0 border " + (on ? TONE.good : C.ch + " border-transparent " + C.tx)}>${on ? html`<${Ic.Check} size=${14} />` : html`<${Ic.Plus} size=${14} />`}</button>`; };
      const Card = ({ k }) => { const t = tip[k]; if (!t) return null; const o = why === k, main = k === "consiglio";
        return html`<div className=${C.card + " p-4 " + (main ? "ring-2 ring-[#5B2EE6]/30 dark:ring-[#A58BFF]/40" : "")}>
          <div className="flex items-center gap-3 cursor-pointer" onClick=${() => setWhy(o ? null : k)}>
            ${main && html`<span className=${"w-9 h-9 rounded-xl flex items-center justify-center border shrink-0 " + TONE.info}><${Ic.Sparkles} size=${17} /></span>`}
            <div className="flex-1 min-w-0"><div className=${C.lab}>${t.titolo}</div>
              <div className=${(main ? "text-base " : "text-sm ") + "font-semibold leading-tight " + C.tx}>${mLabel(m, t.c)}</div>
              <div className=${"text-[13px] leading-snug mt-0.5 " + C.mu}>${spiega(m, t.c)}</div>
              <div className=${"text-xs tabular-nums " + C.mu}>Probabilità ${pct(t.p)}% - quota ${t.qm ? "media" : "stimata"} ${odd(t.q)}</div></div>
            <${AddBtn} c=${t.c} /></div>
          <button onClick=${() => setWhy(o ? null : k)} className="mt-2 text-xs font-semibold text-[#5B2EE6] dark:text-[#A58BFF] flex items-center gap-1">${o ? "Nascondi motivazione" : "Perché questo consiglio?"}<${o ? Ic.ChevronUp : Ic.ChevronDown} size=${13} /></button>
          ${o && html`<div className="mt-2 space-y-1.5 text-sm leading-relaxed">
            ${t.perche.map((x) => html`<div key=${x} className="flex gap-2"><span className=${"w-1.5 h-1.5 rounded-full mt-2 shrink-0 " + DOT.good}></span><span className=${C.tx}>${x}</span></div>`)}
            ${(t.contro || []).map((x) => html`<div key=${x} className="flex gap-2"><span className=${"w-1.5 h-1.5 rounded-full mt-2 shrink-0 " + DOT.warn}></span><span className=${C.tx}><b>Da tenere d'occhio:</b> ${x}</span></div>`)}
            ${affid(t.c, t.p) && html`<div className="flex gap-2"><span className=${"w-1.5 h-1.5 rounded-full mt-2 shrink-0 " + DOT.info}></span><span className=${C.tx}>${affid(t.c, t.p)}</span></div>`}
            ${(() => { const al = assenze(m, sm, D); return al.length > 0 && al.map((x) => html`<div key=${x.n} className="flex gap-2"><span className=${"w-1.5 h-1.5 rounded-full mt-2 shrink-0 " + DOT.warn}></span><span className=${C.tx}><b>Formazione:</b> ${x.testo}</span></div>`); })()}</div>`}</div>`; };
      const opts = options(m);
      const groups = GROUPS.map((g) => [g, opts.filter((o) => mGroup(o.k) === g)]).filter(([, l]) => l.length);
      const ia = m.ia || { g: {}, f: [] };
      const F = (l) => (l || []).map((i) => (typeof i === "number" ? (ia.f || [])[i] : i)).filter(Boolean);
      const scelte = GROUPS.filter((g) => ia.g[g]).map((g) => [g, { ...ia.g[g], si: F(ia.g[g].si), no: F(ia.g[g].no), info: F(ia.g[g].info) }]);
      const [ap, setAp] = useState(null);
      const Punti = ({ v }) => v == null ? null : html`<span className=${"num text-[14px] font-bold w-8 text-center rounded-md py-[1px] " + (v >= 75 ? "bg-[#5B2EE6] text-white dark:bg-[#A58BFF] dark:text-[#0E0C18]" : v >= 60 ? C.ch + " " + C.tx : C.mu)} title="Punteggio IA">${v}</span>`;
      return html`<${React.Fragment}>
        <${LiveTips} m=${m} sm=${sm} />
        ${tip.consiglio ? html`<${Card} k="consiglio" />${(tip.prudente || tip.coraggiosa) && html`<${Voce} id="alternative" titolo="Altre due proposte" icona=${Ic.Sparkles}
            sotto=${[tip.prudente && "Prudente: " + mLabel(m, tip.prudente.c, true), tip.coraggiosa && "Coraggiosa: " + mLabel(m, tip.coraggiosa.c, true)].filter(Boolean).join(" · ")}>
            <div className="grid gap-2"><${Card} k="prudente" /><${Card} k="coraggiosa" /></div><//>`}`
          : html`<div className=${C.card + " p-4 text-sm " + C.tx}>Nessun consiglio: per questa partita mancano quote sufficienti per stimare i mercati.</div>`}
        ${scelte.length > 0 && html`<div className=${C.card + " p-4"}>
          <div className="flex items-baseline mb-1"><span className=${C.lab + " flex-1"}>La scelta dell'IA per ogni scommessa</span><span className=${"text-[12px] " + C.mu}>${tutte ? scelte.length + " tipi" : "le 5 migliori"}</span></div>
          <p className=${"text-[12px] mb-2 " + C.mu}>Per ogni tipo di scommessa, la giocata dove probabilità e dati della partita vanno più d'accordo. Il numero è il punteggio IA (0-100).</p>
          ${(tutte ? scelte : scelte.slice().sort((a, b) => (b[1].s || 0) - (a[1].s || 0)).slice(0, 5)).map(([g, x], i) => { const o = ap === g; return html`<div key=${g} className=${i ? "border-t " + C.bd : ""}>
            <div className="flex items-center gap-2.5 py-2.5 cursor-pointer" onClick=${() => setAp(o ? null : g)}>
              <${Punti} v=${x.s} />
              <span className="flex-1 min-w-0"><span className=${"block text-[12px] " + C.mu}>${g}</span><span className=${"block text-[15px] font-semibold leading-tight " + C.tx}>${mLabel(m, x.c)}</span>${o && html`<span className=${"block text-[13px] mt-0.5 " + C.tx}>${spiega(m, x.c)}</span>`}</span>
              <span className="text-right"><span className=${"block num text-[17px] font-bold " + C.tx}>${odd(x.q)}</span><span className=${"block text-[11px] " + C.mu}>${pct(x.p)}%</span></span>
              <${AddBtn} c=${x.c} /></div>
            ${o && html`<div className="pb-3 pl-[42px] space-y-1.5 text-[14px] leading-snug">
              ${x.si.map((t) => html`<div key=${t} className="flex gap-2"><span className=${"w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 " + DOT.good}></span><span className=${C.tx}>${t}</span></div>`)}
              ${(x.info || []).map((t) => html`<div key=${t} className="flex gap-2"><span className=${"w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 " + DOT.ok}></span><span className=${C.tx}>${t}</span></div>`)}
              ${x.no.map((t) => html`<div key=${t} className="flex gap-2"><span className=${"w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 " + DOT.warn}></span><span className=${C.tx}><b>Da tenere d'occhio:</b> ${t}</span></div>`)}
              ${affid(x.c, x.p) && html`<div className="flex gap-2"><span className=${"w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 " + DOT.info}></span><span className=${C.tx}>${affid(x.c, x.p)}</span></div>`}
              ${!x.si.length && !x.no.length && html`<div className=${C.mu}>Per questo tipo di scommessa non ci sono statistiche dedicate: conta solo la probabilità.</div>`}</div>`}</div>`; })}
          ${scelte.length > 5 && html`<button onClick=${() => setTutte(!tutte)} className=${"w-full pt-3 mt-1 border-t text-[14px] font-semibold " + C.bd + " " + C.acc}>${tutte ? "Mostra solo le 5 migliori" : `Mostra tutti i ${scelte.length} tipi di scommessa`}</button>`}</div>`}
        <${Voce} id="mercati" titolo="Tutti i mercati" icona=${Ic.BarChart3} sotto=${groups.reduce((a, [, l]) => a + l.length, 0) + " giocate in " + groups.length + " gruppi, con quota e punteggio IA"}>
        <div className="flex items-baseline pt-1"><span className=${"text-[13px] flex-1 " + C.mu}>Tocca un gruppo per aprirlo.</span><button onClick=${() => setGloss(true)} className=${"text-[13px] font-semibold " + C.acc}>Cosa vogliono dire?</button></div>
        <div className=${C.card + " px-4 py-1"}>${groups.map(([g, l], i) => { const o = grp === g; return html`<div key=${g} className=${i ? "border-t " + C.bd : ""}>
          <button onClick=${() => setGrp(o ? null : g)} className=${"w-full flex items-center py-3 text-[15px] font-semibold " + C.tx}><span className="flex-1 text-left">${g}</span><span className=${"num text-[15px] font-semibold mr-2 " + C.mu}>${l.length}</span><${o ? Ic.ChevronUp : Ic.ChevronDown} size=${16} className=${C.mu} /></button>
          ${o && html`<div className="pb-2">${l.map((x) => html`<div key=${x.k} className="flex items-center gap-2 py-1.5">
            <${Punti} v=${x.s} />
            <span className=${"flex-1 text-sm leading-tight " + C.tx}>${mLabel(m, x.k)}${ia.g[g] && ia.g[g].c === x.k ? html` <span className=${"text-[11px] font-semibold " + C.acc}>Scelta IA</span>` : ""}</span>
            <span className=${"text-xs tabular-nums w-10 text-right " + C.mu}>${pct(x.p)}%</span>
            <span className=${"text-sm font-semibold tabular-nums w-12 text-right " + C.tx}>${odd(x.q)}</span><${AddBtn} c=${x.k} /></div>`)}</div>`}</div>`; })}</div>
        <p className=${"text-[11px] " + C.mu}>Punteggio IA: 55% accordo con le statistiche delle squadre (forma, gol per tempo, differenza reti, cartellini attesi, gol dei giocatori), 45% probabilità. Probabilità calcolate dalle quote medie dei bookmaker (modello dei gol attesi, tempi tarati su 38.700 partite). Quota "media" = raccolta dai bookmaker; quota "stimata" = calcolata dalla probabilità con un margine tipico del 6%, quella reale può variare. Il consiglio sceglie il mercato dove probabilità e statistiche delle squadre vanno d'accordo: non è una garanzia.</p>
        <//>
      <//>`;
    }

    /* ---- scheda partita ---- */
    function MatchView({ m }) {
      const { D, lg, unlocked, setOpen, mt, setMt, mySlip, addLeg, setTeam, favM, toggleFavM } = React.useContext(Ctx);
      const L = lg(m.lg);
      const [pOpen, setPOpen] = useState(null);
      const [filt, setFilt] = useState(0);
      const [clIntera, setClIntera] = useState(false);
      const [l5, setL5] = useState(null);
      const [pl, setPl] = useState(null);
      const { d: sm } = useSummary(m.lgE, m.eid, m.st === "LIVE");
      const sw = useRef(null);
      const TABS = ["In breve", "Partita", "Formazioni", "IA", "Statistiche", "Cronaca"];
      const [dir, setDir] = useState(0);
      const vai = (i) => { setDir(i > mt ? 1 : -1); setMt(i); const el = document.querySelector("[data-schede]"); if (el && el.getBoundingClientRect().top < 60) window.scrollTo({ top: Math.max(0, window.scrollY + el.getBoundingClientRect().top - 120), behavior: "smooth" }); };
      // in diretta la pillola mostra la probabilita aggiornata (punteggio, minuto, espulsioni), non quella pre-partita
      const pLive = (() => {
        if (m.st !== "LIVE" || !m.xg || m.xg[0] == null) return null;
        const g = (sm && sm.st === "LIVE" && sm.g[0] != null ? sm.g : m.g) || [0, 0];
        const reds = [0, 1].map((j) => (sm ? sm.eventi.filter((e) => e.k === "rosso" && e.side === j).length : 0));
        const mn = minuto((sm && sm.clock) || m.clock || "");
        return ["1", "X", "2"].map((c) => liveProb(c, m.xg, g, mn, reds, spinta(sm, mn)));
      })();
      const onTS = (e) => { sw.current = inizioSwipe(e); };
      const onTE = (e) => { const d = fineSwipe(sw.current, e); sw.current = null;
        if (d) { const n = Math.max(0, Math.min(TABS.length - 1, mt + d)); if (n !== mt) { vai(n); store.set("swipeOk", true); } } };
      const fav = m.p.indexOf(Math.max(...m.p));
      const S = D.standings[m.lg];
      const st = S ? S[["generale", "casa", "trasferta"][filt]] : [];
      // classifica ridotta: le due squadre con le due sopra e le due sotto (la prima riga resta sempre)
      const posSq = [m.h, m.a].map((t) => st.findIndex((r) => r.team === t)).filter((i) => i >= 0);
      const vicino = (i) => st.length <= 8 || !posSq.length || i === 0 || posSq.some((p) => Math.abs(p - i) <= 2);
      const pos = (t) => (S ? S.generale.findIndex((r) => r.team === t) + 1 : 0);
      const inSlip = mySlip.find((x) => x.id === m.id);
      const tiles = [
        { k: "Forma", i: Ic.TrendingUp, tone: m.forma.some((f) => f.tone === "warn") ? "warn" : m.forma.some((f) => f.tone === "good") ? "good" : "ok", body: html`<div className="space-y-1.5">${m.forma.map((f, j) => html`<div key=${j} className="flex gap-2"><span className=${"w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 " + DOT[f.tone]}></span><span><b>${j ? m.a : m.h}:</b> ${f.text}</span></div>`)}
          ${(m.xgf || []).some(Boolean) && html`<div className=${"pt-1.5 mt-1 border-t " + C.bd}><div className=${C.lab + " mb-1"}>Fortuna o merito? (gol attesi xG)</div>${(m.xgf || []).map((x, j) => x && html`<div key=${"x" + j} className="text-[13px] mb-1"><b>${j ? m.a : m.h}</b>, ultime ${x.n}: ${x.gf} gol fatti con ${nf(x.xf)} xG creati, ${x.gs} subiti con ${nf(x.xs)} xG concessi. ${leggiXg(x)}</div>`)}</div>`}</div>` },
        { k: "Classifica vs attese", i: Ic.BarChart3, tone: m.attese.some((f) => f.tone !== "ok") ? "info" : "ok", body: html`<div className="space-y-1.5">${m.attese.map((f, j) => html`<div key=${j} className="flex gap-2"><span className=${"w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 " + DOT[f.tone]}></span><span><b>${j ? m.a : m.h}:</b> ${f.text}</span></div>`)}</div>` },
        { k: "Precedenti", i: Ic.Swords, tone: m.prec.tone, body: m.prec.text },
        { k: "Contesto", i: Ic.Clock, tone: m.ctx.tone, body: m.ctx.text },
        { k: "Fattore campo", i: Ic.Shield, tone: "ok", body: (() => {
          if (!S || S.solo_generale || !S.casa || !S.casa.length) return "Rendimento in casa e in trasferta non disponibile per questo campionato.";
          const rh = S.casa.find((r) => r.team === m.h), ra = S.trasferta.find((r) => r.team === m.a);
          const tot = S.casa.reduce((x, r) => [x[0] + r.v, x[1] + r.pg], [0, 0]);
          const ppg = (r) => (r && r.pg ? nf((r.pt / r.pg).toFixed(2)) : "-");
          return html`<div className="space-y-1.5">${rh && html`<div><b>${m.h} in casa:</b> ${rh.v} vittorie, ${rh.n} pareggi, ${rh.p} sconfitte, ${rh.gf}-${rh.gs} gol, ${ppg(rh)} punti a partita.</div>`}
            ${ra && html`<div><b>${m.a} in trasferta:</b> ${ra.v} vittorie, ${ra.n} pareggi, ${ra.p} sconfitte, ${ra.gf}-${ra.gs} gol, ${ppg(ra)} punti a partita.</div>`}
            ${tot[1] > 0 && html`<div className=${C.mu}>In questo campionato vince la squadra di casa nel ${Math.round((tot[0] / tot[1]) * 100)}% delle partite. Le quote tengono già conto del fattore campo: nei test su 16.000 partite il rendimento casa/trasferta della singola squadra non migliora la previsione.</div>`}</div>`;
        })() },
        { k: "Formazioni", i: Ic.Users, tone: (m.fattori || []).some((f) => f.delta) ? "warn" : "ok", body: ((m.fattori || []).filter((f) => f.delta).length ? "Indisponibili segnalati: " + m.fattori.filter((f) => f.delta).map((f) => f.chi + " (" + (f.lato ? m.a : m.h) + ")").join(", ") + ". " : "Nessun indisponibile importante segnalato da notizie e cartellini. ") + "Le formazioni ufficiali compaiono nella sezione Formazioni circa un'ora prima del calcio d'inizio." },
        { k: "Quote", i: Ic.Calculator, tone: "ok", body: `Favorito per le quote: ${["casa", "pareggio", "ospiti"][m.mk.indexOf(Math.max(...m.mk))]}. Le quote riassumono già forma, classifica e precedenti: la lettura qui sopra spiega il perché.` },
      ];
      const opts = options(m);
      const [ch, ca] = auraCol(m);
      const gScore = m.g && m.st !== "NS";
      const marcatori = (j) => sm ? sm.eventi.filter((e) => e.side === j && (/gol|rigore$|autogol/.test(e.k) && !/sbagliato|parato/.test(e.k) || e.k === "rosso")) : [];
      return html`<div className="px-4 space-y-3">
        <div className="flex items-center"><button onClick=${() => setOpen(null)} className=${"flex items-center gap-1 text-[15px] font-semibold " + C.acc}><${Ic.ChevronLeft} size=${20} />Partite</button>
          <span className="flex-1"></span>
          <button aria-label=${favM.includes(m.id) ? "Togli dalle preferite" : "Aggiungi alle preferite"} onClick=${() => toggleFavM(m.id)} className=${"w-9 h-9 rounded-full flex items-center justify-center bg-white dark:bg-[#191626]"}>
            <${Ic.Star} size=${18} className=${favM.includes(m.id) ? "text-amber-400 fill-amber-400" : C.mu} /></button></div>
        <div className=${C.card + " relative overflow-hidden"}>
          <div aria-hidden="true" className="absolute inset-0 opacity-[0.22] dark:opacity-[0.3]" style=${{ background: `radial-gradient(90% 75% at 8% 0%, ${ch}, transparent 70%), radial-gradient(90% 75% at 92% 0%, ${ca}, transparent 70%)` }}></div>
          <div className="relative p-4 pb-4">
          <div className="flex items-center justify-center gap-2"><${Flag} k=${L.flag} w=${16} /><span className=${"text-[12px] font-medium " + C.mu}><${NomeLega} k=${m.lg}>${L.name}<//>, ${new Date(m.date + "T12:00:00").toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" })}</span></div>
          <div className="grid items-start mt-4" style=${{ gridTemplateColumns: "minmax(0,1fr) auto minmax(0,1fr)" }}>
            ${[m.h, m.a].map((t, j) => html`<button key=${t} onClick=${() => setTeam({ lgE: m.lgE || ESPN_LG[m.lg], id: j ? m.aid : m.hid, name: t })} className=${"flex flex-col items-center gap-1.5 min-w-0 " + (j ? "order-3" : "order-1")}>
              <span className="w-[62px] h-[62px] rounded-full flex items-center justify-center bg-white/70 dark:bg-white/[0.06]" style=${{ boxShadow: `0 0 0 3px ${j ? ca : ch}33, 0 10px 28px -8px ${j ? ca : ch}` }}><${Crest} t=${t} size=${40} /></span>
              <span className=${"text-[15px] font-semibold text-center leading-tight " + C.tx}>${t}</span><span className=${"text-[11px] " + C.mu}>${pos(t) ? pos(t) + "° in classifica" : "Pagina squadra"}</span>
              ${marcatori(j).map((e, q) => html`<span key=${q} className=${"text-[12px] leading-tight text-center flex items-center gap-1 " + (e.k === "rosso" ? "text-[#FF3D5A]" : C.mu)}>${e.k === "rosso" ? html`<i className="inline-block w-1.5 h-2 rounded-[1px] bg-[#FF3D5A]"></i>` : html`<${Ic.Ball} size=${10} />`}${e.a.split(" ").slice(-1)[0]} <span className="num text-[13px]">${e.min}</span>${e.k === "rigore" ? " (R)" : e.k === "autogol" ? " (AG)" : ""}</span>`)}</button>`)}
            <div className="order-2 flex flex-col items-center px-2 pt-1">
              <div className=${"num font-extrabold leading-none tracking-[0.02em] " + (m.st === "LIVE" ? "text-[#FF3D5A] " : C.tx + " ") + (gScore ? "text-[60px]" : "text-[44px] pt-2")}>${gScore ? m.g[0] + "–" + m.g[1] : m.time || "-"}</div>
              <div className=${"text-[13px] mt-1.5 font-semibold flex items-center gap-1 " + (m.st === "LIVE" ? C.live : C.mu)}>${m.st === "LIVE" && html`<i className="pulse block w-1.5 h-1.5 rounded-full bg-[#FF3D5A]"></i>`}${m.st === "FT" ? "Finale" : m.st === "LIVE" ? (sm && sm.clock) || m.clock || "In corso" : m.st === "RINV" ? "Rinviata" : "Calcio d'inizio"}</div></div></div>
          <div className="mt-5"><${AuraLine} m=${m} p=${pLive || m.mk} h=${6} labels=${true} /></div>
          <div className="flex items-center justify-center flex-wrap gap-2 mt-3"><span className=${"text-[12px] " + C.mu}>${pLive ? "Probabilità in diretta" : "Barra: probabilità dalle quote"} · favorito IA</span><${FavPill} m=${m} unlocked=${unlocked(m)} pp=${pLive} />
            ${m.free && html`<span className=${"text-[11px] font-semibold px-2 py-0.5 rounded-full border " + TONE.good}>Gratis oggi</span>`}
            ${m.st === "FT" && unlocked(m) && html`<span className=${"text-xs " + (m.res === fav ? "text-emerald-600 dark:text-emerald-300" : "text-rose-600 dark:text-rose-300")}>${m.res === fav ? "Favorito rispettato" : "Sorpresa"}</span>`}</div></div></div>
        <div data-schede="1" className="h-0"></div>
        <${Tabs} items=${TABS} val=${mt} set=${vai} sticky=${true} />
        ${!store.get("swipeOk", false) && mt === 0 && html`<div className=${"text-[12px] text-center -mt-1 " + C.mu}>Scorri con il dito a sinistra per approfondire: Partita, Formazioni, IA, Statistiche, Cronaca.</div>`}
        <div key=${mt} onTouchStart=${onTS} onTouchEnd=${onTE} className=${"space-y-3 min-h-[50vh] " + (dir > 0 ? "entra-dx" : dir < 0 ? "entra-sx" : "")}>

        ${mt === 0 && html`<${InBreve} m=${m} sm=${sm} pLive=${pLive} vai=${vai} onPlayer=${(p, j) => setPl({ p, side: j })} />`}
        ${mt === 0 && m.st === "NS" && html`<${Movimento} m=${m} />`}

        ${mt === 1 && html`<${React.Fragment}>
          ${(!sm || sm.st === "NS") && html`<div className=${C.card + " p-4 text-[14px] " + C.mu}>${m.st === "FT" ? "Il resoconto della partita non è disponibile." : `La partita inizia ${m.date === new Date().toISOString().slice(0, 10) ? "oggi" : "il " + m.date.slice(8) + "/" + m.date.slice(5, 7)} alle ${m.time}: qui troverai azione in diretta, andamento, eventi, migliori in campo, mappa dei tiri e statistiche.`}</div>`}
          ${sm && sm.st === "LIVE" && html`<${LiveAction} sm=${sm} m=${m} />`}
          ${sm && sm.st !== "NS" && html`<${KeyEvents} sm=${sm} m=${m} />`}
          ${sm && sm.st !== "NS" && html`<${Migliori} sm=${sm} m=${m} onPlayer=${(p, j) => setPl({ p, side: j })} />`}
          ${sm && sm.st !== "NS" && html`<${StatsCard} sm=${sm} m=${m} />`}
          ${sm && sm.st !== "NS" && html`<${Voce} id="andamento" titolo="Andamento" sotto="Chi ha spinto, minuto per minuto" icona=${Ic.Activity}><${Andamento} sm=${sm} m=${m} /><//>`}
          ${sm && sm.st !== "NS" && html`<${Voce} id="tiri" titolo="Mappa dei tiri" sotto="Da dove sono partiti i tiri delle due squadre" icona=${Ic.Target || Ic.Activity}><${TiriCard} sm=${sm} m=${m} /><//>`}<//>`}

        ${mt === 3 && html`<${Gate} m=${m} title="Analisi IA: probabilità, gol attesi e consiglio">
          <${TipView} m=${m} sm=${sm} />
          <${Voce} id="fattori" titolo="Come l'IA corregge le quote" icona=${Ic.Sparkles}
            sotto=${(m.fattori || []).filter((f) => f.delta || f.delta_avv).length ? (m.fattori || []).filter((f) => f.delta || f.delta_avv).length + " correzioni per assenze e notizie" : "Nessuna correzione: l'IA segue le quote"}><${FattoriCard} m=${m} /><//>
          ${m.arbitro && html`<${Voce} id="arbitro" titolo="Arbitro" icona=${Ic.Users} sotto=${m.arbitro.nome + (m.arbitro.ratio && m.arbitro.n >= 8 ? (m.arbitro.ratio.K > 1.08 ? ": ammonisce più della media" : m.arbitro.ratio.K < 0.92 ? ": ammonisce meno della media" : ": nella media") : "")}><${ArbitroCard} m=${m} />${citazioneArbitro(m) && html`<div className="px-1"><${Citazione} q=${citazioneArbitro(m)} piccola=${true} /></div>`}<//>`}
          ${m.cart && html`<${Voce} id="cartellini" titolo="Cartellini, falli e angoli attesi" icona=${Ic.BarChart3 || Ic.Activity}
            sotto=${[["K", "Cartellini"], ["C", "Angoli"], ["F", "Falli"]].filter(([k]) => m.cart[k]).map(([k, l]) => l + " " + nf(m.cart[k].attesi)).join(" · ")}>
          <div className=${C.card + " p-4 space-y-1.5"}><div className=${C.lab}>Cartellini, falli e angoli attesi</div>
            ${[["K", "Cartellini"], ["F", "Falli"], ["C", "Calci d'angolo"]].filter(([k]) => m.cart[k]).map(([k, l]) => { const x = m.cart[k]; return html`<div key=${k} className=${"text-sm " + C.tx}><b>${l}: ${nf(x.attesi)}</b> <span className=${C.mu}>(media del campionato ${nf(x.media_lega)}; ${m.h} ${nf(x.casa[0])} fatti e ${nf(x.casa[1])} subiti a partita, ${m.a} ${nf(x.ospite[0])} e ${nf(x.ospite[1])})</span></div>`; })}
            <div className=${"text-[11px] " + C.mu}>Modello verificato su 7 campionati dal 2012: rispetto alla sola media del campionato sbaglia l'1,6% in meno sui cartellini e lo 0,4% sugli angoli. Le partite equilibrate hanno più cartellini. I mercati sono in "Tutti i mercati", con quota stimata.</div></div><//>`}
          ${m.st === "NS" && html`<${Voce} id="meteo" titolo="Meteo al calcio d'inizio" sotto="Previsioni per lo stadio (se disponibili)" icona=${Ic.Sun}><${MeteoCard} m=${m} sm=${sm} /><//>`}
          <${Voce} id="laboratorio" titolo="Laboratorio: IA contro quote" icona=${Ic.Calculator || Ic.Activity} sotto=${m.xg && m.xg[0] != null ? `Gol attesi ${nf((m.xg[0] || 0).toFixed(2))} – ${nf((m.xg[1] || 0).toFixed(2))}, quote medie e migliori` : "Quote medie e migliori a confronto"}>
          <div className=${C.card + " p-4 space-y-2"}><div className=${C.lab}>Laboratorio: IA contro quote</div>
            <div className="overflow-x-auto"><table className=${"w-full text-sm tabular-nums " + C.tx}><thead><tr className=${"text-[11px] " + C.mu}><th className="text-left font-medium py-1">Esito</th><th className="text-right font-medium">IA</th><th className="text-right font-medium">Quote</th><th className="text-right font-medium">${D.demo ? "Bet365" : "Media"}</th><th className="text-right font-medium">Migliore</th></tr></thead>
              <tbody>${[["1", m.p[0], m.mk[0], m.odds["1"], m.max["1"]], ["X", m.p[1], m.mk[1], m.odds["X"], m.max["X"]], ["2", m.p[2], m.mk[2], m.odds["2"], m.max["2"]],
                ["Over 2,5", m.po, m.mo, m.odds.O, m.max.O], ["Under 2,5", 1 - m.po, 1 - m.mo, m.odds.U, m.max.U]].map((r) => html`<tr key=${r[0]} className=${"border-t " + C.bd}>
                <td className="py-1.5 font-semibold">${r[0]}</td><td className="text-right">${pct(r[1])}%</td><td className=${"text-right " + C.mu}>${pct(r[2])}%</td><td className="text-right">${odd(r[3])}</td><td className=${"text-right " + C.mu}>${odd(r[4])}</td></tr>`)}</tbody></table></div>
            <p className=${"text-[11px] " + C.mu}>${D.demo ? "\"Quote\" è la probabilità ricavata dalla quota togliendo il margine del bookmaker. Nel test su oltre 18.000 partite gli scarti tra IA e quote non hanno dato un vantaggio affidabile: per questo l'IA non li trasforma in consigli."
              : "Per ora l'IA usa come base la quota media dei bookmaker, perché nei test è la stima più precisa: se ne discosterà solo quando arriveranno formazioni ufficiali e notizie. \"Migliore\" è la quota più alta tra i bookmaker."}</p></div>
          ${m.xg[0] != null && html`<div className=${C.card + " p-4 grid grid-cols-2 gap-2 text-center"}>
            ${[["Gol attesi " + m.h, (m.xg[0] || 0).toFixed(2).replace(".", ",")], ["Gol attesi " + m.a, (m.xg[1] || 0).toFixed(2).replace(".", ",")], ...(m.elo[0] ? [["Elo casa", m.elo[0]], ["Elo ospiti", m.elo[1]]] : [])].map(([a, b]) => html`<div key=${a} className=${"rounded-xl p-2 " + C.ch}>
              <div className=${"text-base font-semibold tabular-nums " + C.tx}>${b}</div><div className=${"text-[10px] " + C.mu}>${a}</div></div>`)}</div>`}<//><//>`}


        ${mt === 4 && html`<${React.Fragment}>
          <div className=${C.card + " p-4 space-y-3"}><div className="flex justify-between items-baseline"><span className=${C.lab}>Probabilità dalle quote</span><span className=${"text-[11px] " + C.mu}>Over 2,5: <b className=${C.tx}>${pct(m.mo)}%</b></span></div>
            <${AuraLine} m=${m} h=${6} labels=${true} />
            ${!D.demo && m.nb ? html`<div className=${"text-[11px] " + C.mu}>${m.nb === 1 ? "Quote di DraftKings (tramite ESPN)" : `Quota media di ${m.nb} bookmaker`}${m.prepartita ? ", aggiornata alle " + new Date(m.prepartita).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }) + " (prima del calcio d'inizio)" : ", fotografata al mattino"}.</div>` : null}
            ${m.mk_mattino && html`<div className=${"text-[12px] rounded-lg p-2 " + C.ch + " " + C.tx}><b>Movimento delle quote</b> dal mattino: ${["1", "X", "2"].map((e, i) => { const dd = m.mk[i] - m.mk_mattino[i]; return html`<span key=${e} className="mr-2 whitespace-nowrap tabular-nums">${e} ${pct(m.mk_mattino[i])}% → <b>${pct(m.mk[i])}%</b>${Math.abs(dd) >= 0.02 ? html`<span className=${dd > 0 ? " text-emerald-600 dark:text-emerald-300" : " text-rose-600 dark:text-rose-300"}> ${dd > 0 ? "▲" : "▼"}</span>` : ""}</span>`; })}
              <div className=${"text-[11px] " + C.mu}>Le quote vicine al calcio d'inizio sono le più precise: contengono formazioni e notizie dell'ultima ora.</div></div>`}
            <div className=${"text-[14px] font-semibold pt-1 " + C.tx}>Aggiungi alla tua schedina</div>
            <div className="flex flex-wrap gap-1.5">${opts.filter((o) => !o.stima).map((o) => html`<button key=${o.k} onClick=${() => addLeg(m, o.k)}
              className=${"inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border " + (inSlip && inSlip.k === o.k ? TONE.good : C.ch + " " + C.tx + " border-transparent")}>
              ${inSlip && inSlip.k === o.k ? html`<${Ic.Check} size=${12} />` : html`<${Ic.Plus} size=${12} />`}${mLabel(m, o.k, true)}<span className=${"font-normal " + C.mu}>${odd(o.q)}</span></button>`)}</div></div>
          <div className="flex items-baseline pt-1"><span className=${C.lab + " flex-1"}>Lettura in 10 secondi</span><span className=${"text-[12px] " + C.mu}>Tocca una voce per aprirla</span></div>
          <${Gate} m=${m} title="Lettura IA: forma reale, attese, precedenti, contesto">
            <div className="grid grid-cols-2 gap-2">${tiles.map((t, i) => { const o = pOpen === i; return html`<button key=${t.k} onClick=${() => setPOpen(o ? null : i)} className=${C.card + " p-3 text-left " + (o ? "col-span-2" : "")}>
              <div className="flex items-center gap-2"><span className=${"w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border " + TONE[t.tone]}><${t.i} size=${15} /></span>
                <span className=${"flex-1 text-[13px] font-semibold leading-tight " + C.tx}>${t.k}</span><span className=${"w-2 h-2 rounded-full " + DOT[t.tone]}></span></div>
              ${o && html`<div className=${"text-sm mt-2 leading-relaxed " + C.tx}>${t.body}</div>`}</button>`; })}</div>
            ${m.flags.length > 0 && html`<div className="flex flex-wrap gap-1.5">${m.flags.map((f) => html`<span key=${f.text} className=${"text-[11px] font-semibold px-2 py-0.5 rounded-full border " + TONE[f.tone]}>${f.text}</span>`)}</div>`}
          <//>
          ${(m.curiosita || []).length > 0 && html`<${Voce} id="curiosita" titolo="Curiosità" icona=${Ic.Sparkles} sotto=${m.curiosita[0]}><${Curiosita} m=${m} /><//>`}

          ${S && html`<div className=${"flex items-center gap-2 text-sm font-semibold " + C.tx}><${Flag} k=${L.flag} />Classifica <${NomeLega} k=${m.lg}>${L.name}<//></div>`}
          ${S && !S.solo_generale && html`<${Seg} items=${["Generale", "Solo Casa", "Solo Trasferta"]} val=${filt} set=${setFilt} />`}
          <div className=${C.card + " p-2 overflow-x-auto"}><table className=${"w-full text-sm tabular-nums " + C.tx}><thead><tr className=${"text-[11px] " + C.mu}>
            <th className="text-left font-medium p-1.5 w-6">#</th><th className="text-left font-medium">Squadra</th><th className="text-right font-medium">G</th><th className="text-right font-medium">V</th><th className="text-right font-medium">N</th><th className="text-right font-medium">P</th><th className="text-right font-medium">DR</th><th className="text-right font-medium pr-1.5">Pt</th></tr></thead>
            <tbody>${st.map((r, i) => { const hl = r.team === m.h || r.team === m.a; if (!clIntera && !vicino(i)) return null; return html`<tr key=${r.team} className=${hl ? "bg-[#5B2EE6]/[0.07] dark:bg-[#A58BFF]/[0.12] font-semibold" : ""}>
              <td className="p-1.5">${i + 1}</td><td><span className="flex items-center gap-1.5 min-w-0"><${Crest} t=${r.team} size=${14} /><span className="truncate">${r.team}</span></span></td>
              <td className=${"text-right " + C.mu}>${r.pg}</td><td className="text-right">${r.v}</td><td className="text-right">${r.n}</td><td className="text-right">${r.p}</td><td className="text-right">${r.gf - r.gs > 0 ? "+" : ""}${r.gf - r.gs}</td><td className="text-right pr-1.5 font-semibold">${r.pt}</td></tr>`; })}</tbody></table></div>
          ${S && st.length > 8 && html`<button onClick=${() => setClIntera(!clIntera)} className=${"w-full -mt-1 text-[14px] font-semibold " + C.acc}>${clIntera ? "Mostra solo le zone delle due squadre" : `Classifica completa (${st.length} squadre)`}</button>`}
          <div className=${C.card + " p-4 space-y-2"}><div className=${C.lab}>Ultime 5</div>
            ${[m.h, m.a].map((t, j) => html`<div key=${t}><button onClick=${() => setL5(l5 === j ? null : j)} className="w-full flex items-center gap-2"><${Crest} t=${t} size=${16} />
              <span className=${"text-sm flex-1 text-left truncate " + C.tx}>${t}</span><${Form} list=${m.last5[j]} /><${Ic.ChevronDown} size=${14} className=${C.mu + (l5 === j ? " rotate-180" : "")} /></button>
              ${l5 === j && html`<div className="mt-2 space-y-1">${m.last5[j].slice().reverse().map((z, q) => html`<div key=${q} className=${"flex justify-between text-xs " + C.tx}><span className=${C.mu}>${z.data}</span><span className="flex-1 px-2 truncate">${z.casa ? "vs" : "@"} ${z.avv}</span><span className="font-semibold tabular-nums">${z.ris}</span></div>`)}</div>`}</div>`)}</div>
          <${Voce} id="h2h" titolo="Scontri diretti" icona=${Ic.Swords || Ic.Users} sotto=${(m.h2h || []).length ? `Ultimi ${m.h2h.length}: ${m.h2h.slice(0, 3).map((z) => z.ris).join(", ")}${m.h2h.length > 3 ? "…" : ""}` : "Nessun precedente nei dati disponibili"}>
          <div className=${C.card + " p-4"}><div className=${C.lab + " mb-2"}>Scontri diretti</div>
            ${m.h2h.length ? m.h2h.map((z, q) => html`<div key=${q} className=${"flex justify-between text-sm py-1 tabular-nums " + C.tx}><span className=${C.mu + " w-16"}>${z.data}</span><span className="flex-1 text-right pr-2 truncate">${z.casa}</span><b>${z.ris}</b><span className="flex-1 pl-2 truncate">${z.ospite}</span></div>`)
              : html`<div className=${"text-sm " + C.mu}>${D.demo ? "Nessun precedente negli ultimi 8 anni." : "Nessun precedente nei dati disponibili."}</div>`}</div><//>
          ${!S && html`<div className=${C.card + " p-4 text-sm " + C.mu}>Classifica, ultime 5 e precedenti non sono disponibili per questo campionato nella fonte dati gratuita.</div>`}          <${Voce} id="info" titolo="Informazioni partita" icona=${Ic.Calendar} sotto=${[L.name, sm && sm.stadio, m.arbitro && "arbitro " + m.arbitro.nome].filter(Boolean).join(" · ")}><${InfoCard} m=${m} sm=${sm} L=${L} /><//><//>`}

        ${mt === 5 && (sm ? html`<${Cronaca} sm=${sm} m=${m} />` : html`<div className=${C.card + " p-4 text-sm " + C.mu}>${m.eid ? "Caricamento della cronaca..." : "La cronaca scritta compare quando la partita è collegata alla diretta: di solito dal giorno della partita, con le formazioni ufficiali."}</div>`)}

        ${mt === 2 && (sm ? html`<${Lineups} sm=${sm} m=${m} onPlayer=${(p) => setPl({ p, side: sm.formazioni[0] && sm.formazioni[0].all.includes(p) ? 0 : 1 })} />` : m.formazione ? html`<${FormazioneProbabile} m=${m} />` : html`<div className=${C.card + " p-4 text-sm " + C.mu}>${m.eid ? "Caricamento delle formazioni..." : "Le formazioni compaiono il giorno della partita, circa un'ora prima del calcio d'inizio."}</div>`)}
        ${mt === 2 && sm && html`<${AssenzeCard} m=${m} sm=${sm} />`}
        </div>
        ${pl && html`<${PlayerSheet} p=${pl.p} side=${pl.side} col=${sm && sm.colors[pl.side]} m=${m} onClose=${() => setPl(null)} />`}
      </div>`;
    }

    /* ---- "In breve": solo l'essenziale, diverso prima, durante e dopo la partita; il resto si scopre scorrendo ---- */
    function Vai({ onClick, children }) {
      return html`<button onClick=${onClick} className=${"mt-3 w-full flex items-center justify-between rounded-[14px] px-3.5 py-2.5 text-[14px] font-semibold " + C.ch + " " + C.tx}><span>${children}</span><${Ic.ChevronRight} size=${17} className=${C.mu} /></button>`;
    }
    function InBreve({ m, sm, vai, onPlayer }) {
      const { unlocked, setUnlock, addLeg, mySlip, lg, D } = React.useContext(Ctx);
      const [avviso, setAvviso] = useState("");
      const PAN = usaPanchine();
      // citazione: sempre nei grandi derby, a volte nei big match (le due squadre tra le prime 4, o la partita della settimana)
      const S0 = D && D.standings[m.lg], pos0 = (t) => (S0 ? S0.generale.findIndex((r) => r.team === t) : -1);
      const pw0 = D ? partitaSettimana(D) : null;
      const cit = citazionePartita(m, (pos0(m.h) >= 0 && pos0(m.h) < 4 && pos0(m.a) >= 0 && pos0(m.a) < 4) || (pw0 && pw0.id === m.id));
      const st = sm && sm.st !== "NS" ? sm.st : m.st;
      const tip = m.tip && m.tip.consiglio;
      const inSlip = mySlip.find((x) => x.id === m.id);
      const sapere = [];
      for (const f of (m.fattori || []).filter((f) => f.delta || f.delta_avv).slice(0, 1)) sapere.push(`${f.chi} (${f.lato ? m.a : m.h}) ${f.tipo === "dubbio" ? "è in dubbio" : f.tipo === "squalifica" ? "è squalificato" : "potrebbe non esserci"}.`);
      // panchine: debutto di un nuovo allenatore o panchina che scotta
      for (const [j, t] of [m.h, m.a].entries()) { const pc = PAN && PAN.squadre[t]; if (!pc || sapere.length >= 3) continue;
        if (pc.livello === "Appena arrivato" && pc.partite === 0) sapere.push(`${t}: prima partita con ${pc.chi} in panchina.`);
        else if (pc.livello === "Rovente" || pc.livello === "Scotta") sapere.push(`Panchina ${pc.livello === "Rovente" ? "rovente" : "che scotta"} per ${pc.chi} (${t}): ${Math.round(pc.p30 * 100)}% di probabilità che lasci entro 30 giorni.`); }
      for (const t of (m.curiosita || []).slice(0, 3 - sapere.length)) sapere.push(t);
      if (m.arbitro && m.arbitro.ratio && m.arbitro.n >= 8 && Math.abs(m.arbitro.ratio.K - 1) > 0.08 && sapere.length < 4) sapere.push(`Arbitra ${m.arbitro.nome}, ${m.arbitro.ratio.K > 1 ? "di solito più severo" : "di solito meno severo"} della media con i cartellini.`);
      const evs = sm ? sm.eventi.filter((e) => /gol|rigore$|autogol|rosso/.test(e.k) && !/sbagliato|parato/.test(e.k)).slice(-3).reverse() : [];
      const stat = (n) => (sm ? sm.statistiche.find((r) => r[0] === n) : null);
      const best = sm && sm.st !== "NS" ? [0, 1].flatMap((j) => (sm.formazioni[j] ? sm.formazioni[j].all.filter((p) => p.voto != null).map((p) => ({ p, j })) : [])).sort((a, b) => b.p.voto - a.p.voto)[0] : null;
      const { D: DD } = React.useContext(Ctx);
      const grande = st === "NS" && (partitaSettimana(DD) || {}).id === m.id;
      return html`<${React.Fragment}>
        ${cit && cit.derby && html`<div className=${C.card + " p-4 relative overflow-hidden"}>
          <div className=${"text-[12px] font-semibold uppercase tracking-[0.08em] " + C.acc}>${cit.derby}</div>
          <div className="mt-2"><${Citazione} q=${cit.q} /></div></div>`}
        ${grande && html`<${Anteprima} m=${m} />`}
        ${st === "NS" && tip && html`<div className=${C.card + " p-4"}>
          <div className="flex items-center gap-2 mb-2"><${Ic.Sparkles} size=${17} className=${C.acc} /><span className=${C.lab + " flex-1"}>Il consiglio dell'IA</span>
            ${unlocked(m) && html`<button aria-label="Aggiungi alla schedina" onClick=${() => addLeg(m, tip.c)} className=${"w-9 h-9 rounded-full flex items-center justify-center " + (inSlip && norm(inSlip.k) === tip.c ? C.on : C.ch + " " + C.tx)}>${inSlip && norm(inSlip.k) === tip.c ? html`<${Ic.Check} size=${16} />` : html`<${Ic.Plus} size=${16} />`}</button>`}</div>
          ${unlocked(m) ? html`<div className=${"text-[20px] font-bold leading-tight " + C.tx}>${mLabel(m, tip.c)}</div>
            <div className=${"text-[14px] mt-1 " + C.tx}>${spiega(m, tip.c)}</div>
            <div className="flex gap-4 mt-2.5"><span className=${"text-[13px] " + C.mu}>Probabilità <b className=${"num text-[19px] " + C.tx}>${pct(tip.p)}%</b></span><span className=${"text-[13px] " + C.mu}>Quota ${tip.qm ? "" : "stimata "}<b className=${"num text-[19px] " + C.tx}>${odd(tip.q)}</b></span></div>`
          : html`<button onClick=${() => setUnlock(true)} className=${"w-full text-left text-[14px] rounded-xl p-3 " + C.ch + " " + C.tx}><${Ic.Lock} size=${13} className="inline mr-1" />Sblocca con PRO o con un video di 15 secondi per vedere il consiglio.</button>`}
          <${Vai} onClick=${() => vai(3)}>Perché, e tutte le altre giocate<//></div>`}
        ${st !== "NS" && html`<${LiveTips} m=${m} sm=${sm} />`}
        ${st !== "NS" && sm && html`<div className=${C.card + " p-4"}>
          <div className=${C.lab + " mb-2"}>${st === "FT" ? "Com'è finita" : "In questo momento"}</div>
          ${evs.length ? evs.map((e, i) => html`<div key=${i} className="flex items-center gap-2.5 py-1">
              <span className=${"num w-12 text-[17px] font-bold " + C.mu}>${e.min}</span>${e.k === "rosso" ? html`<i className="block w-2.5 h-3.5 rounded-[2px] bg-[#FF3D5A]"></i>` : html`<${Ic.BallIn} size=${16} c=${auraCol(m)[e.side] || "#888"} />`}
              <span className=${"flex-1 text-[15px] " + C.tx}>${e.a.split(" ").slice(-1)[0]}<span className=${C.mu}>, ${e.side ? m.a : m.h}${e.k === "rigore" ? ", su rigore" : e.k === "autogol" ? ", autogol" : e.k === "rosso" ? ", espulso" : ""}</span></span></div>`)
            : html`<div className=${"text-[14px] " + C.mu}>Nessun gol finora.</div>`}
          ${[stat("Possesso palla"), stat("Tiri in porta")].filter(Boolean).length > 0 && html`<div className=${"grid grid-cols-2 gap-2 mt-3"}>${[stat("Possesso palla"), stat("Tiri in porta")].filter(Boolean).map((r) => html`<div key=${r[0]} className=${"rounded-[14px] p-2.5 " + C.ch}>
            <div className=${"text-[11px] " + C.mu}>${r[0]}</div><div className=${"num text-[20px] font-bold " + C.tx}>${Math.round(r[1])}${r[3] || ""} <span className=${C.mu}>–</span> ${Math.round(r[2])}${r[3] || ""}</div></div>`)}</div>`}
          ${best && html`<button onClick=${() => onPlayer(best.p, best.j)} className="w-full flex items-center gap-2.5 mt-3 text-left"><span className=${"text-[13px] " + C.mu}>${st === "FT" ? "Migliore in campo" : "Il migliore finora"}</span><span className=${"flex-1 text-[15px] font-semibold truncate " + C.tx}>${best.p.name}</span><${VotoChip} v=${best.p.voto} /></button>`}
          <${Vai} onClick=${() => vai(1)}>Andamento, eventi, tiri e statistiche<//></div>`}
        ${st === "NS" && html`<${Sondaggio} m=${m} />`}
        ${st === "NS" && sapere.length > 0 && html`<div className=${C.card + " p-4"}><div className=${C.lab + " mb-2"}>Da sapere</div>
          <div className="space-y-2.5">${sapere.map((t, i) => html`<div key=${i} className="flex gap-3"><i className="block w-[3px] self-stretch rounded-full shrink-0 bg-[#5B2EE6] dark:bg-[#A58BFF]"></i><span className=${"text-[15px] leading-snug " + C.tx}>${t}</span></div>`)}</div>
          <${Vai} onClick=${() => vai(4)}>Forma, classifica e precedenti<//></div>`}
        ${st === "NS" && sm && sm.formazioni[0] && html`<div className=${C.card + " p-4"}><div className=${C.lab}>Formazioni ufficiali uscite</div>
          <div className=${"text-[14px] mt-1 " + C.mu}>${m.h} ${sm.formazioni[0].formation || ""}, ${m.a} ${(sm.formazioni[1] || {}).formation || ""}.</div><${Vai} onClick=${() => vai(2)}>Guarda le formazioni<//></div>`}
        ${cit && !cit.derby && st === "NS" && html`<div className="px-1 py-1"><${Citazione} q=${cit.q} piccola=${true} /></div>`}
        <div className=${"grid gap-2 " + (st === "NS" ? "grid-cols-2" : "grid-cols-1")}>
          ${st === "NS" && html`<button onClick=${() => scaricaCalendario([m], lg, (m.h + "-" + m.a).replace(/[^\w-]+/g, "-")).then(() => setAvviso("Apri il file per aggiungerla al calendario (con promemoria 30 minuti prima)."))}
            className=${"py-3 rounded-[16px] text-[14px] font-semibold flex items-center justify-center gap-1.5 " + C.card + " " + C.tx}><${Ic.Calendar} size=${16} />Nel calendario</button>`}
          <button onClick=${() => immaginePartita(m, lg, unlocked(m)).then((r) => setAvviso("Immagine " + r + ".")).catch(() => setAvviso("Condivisione annullata."))}
            className=${"py-3 rounded-[16px] text-[14px] font-semibold flex items-center justify-center gap-1.5 " + C.card + " " + C.tx}><${Ic.Share} size=${16} />Condividi la partita</button></div>
        ${avviso && html`<div className=${"text-[12px] text-center " + C.mu}>${avviso}</div>`}
      <//>`;
    }

export { Movimento, FormazioneProbabile, usaVoti, Row, Gate, KEY_T, trasf, PESI, prob1x2, toks, stesso, assenze, AssenzeCard, CampoNotte, TIRI, suNotte, TiriCard, LiveAction, EvIcon, riassunto, righeResoconto, Resoconto, KeyEvents, StatsCard, Cronaca, InfoCard, ArbitroCard, Badges, Lineups, tonoVoto, VotoChip, Migliori, Andamento, Curiosita, Sondaggio, ST_IT, PlayerSheet, _voti, caricaVoti, pois, PESO_SPINTA, spinta, quotaRestante, liveProb, LiveTips, meteoCache, MeteoCard, FattoriCard, StoricoCard, TeamView, TipView, MatchView, Vai, InBreve };
