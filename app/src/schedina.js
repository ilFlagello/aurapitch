/* AuraPitch - Schedina IA, schedina come immagine, diario delle giocate. */
import React, { useState, useEffect } from "react";
import { immagineSchedina, mercatoBookmaker } from "./condividi.js";
import { C, Chip, Ctx, Flag, Ic, PERIODI, Schede, TONE, auraCol, buildSlip, buildTarget, candidati, evalCode, hit, html, inPeriodo, mLabel, norm, odd, options, pct, store } from "./base.js";
import { GiocoResponsabile } from "./extra.js";
import { StoricoCard } from "./partita.js";

    /* ---- schedina ---- */
    function SlipView() {
      const { D, lg, byId, pro, mySlip, setMySlip, setUnlock, doCopy, favLeagues, caricaMercati } = React.useContext(Ctx);
      const [prof, setProf] = useState(0);
      // campionati della schedina: se non li hai mai scelti qui, quelli che segui
      const [off, setOff0] = useState(() => store.get("slipOff", null) || (favLeagues && favLeagues.length ? D.leagues.map((l) => l.k).filter((k) => !favLeagues.includes(k)) : []));
      const setOff = (nx) => { setOff0(nx); store.set("slipOff", nx); if (caricaMercati) caricaMercati(D.leagues.map((l) => l.k).filter((k) => !nx.includes(k))); };
      const miei = favLeagues && favLeagues.length ? D.leagues.map((l) => l.k).filter((k) => !favLeagues.includes(k)) : null;
      const [shield, setShield] = useState(false);
      const [per, setPer] = useState(store.get("slipPer", "3g"));
      const [qo, setQo] = useState(store.get("slipQ", 0));
      const [vr, setVr] = useState(0);
      const today = D.today || new Date().toISOString().slice(0, 10);
      const pool = D.matches.filter((m) => !off.includes(m.lg) && (D.demo || m.st === "NS") && (D.demo || inPeriodo(m.date, per, today)));
      let legs = qo ? buildTarget(pool, prof, qo, vr) : buildSlip(pool, prof);
      const weak = legs.length ? legs.reduce((a, b) => (a.p < b.p ? a : b)) : null;
      const alt = weak ? candidati(weak.m, Math.max(0, prof - 1), weak.q, 0)
        .filter((o) => o.k !== weak.k && o.p >= weak.p + 0.1 && o.q >= 1.15 && evalCode(o.k, 1, 0, 0, 0) !== null)
        .sort((a, b) => b.sc - a.sc)[0] : null;
      if (shield && weak && alt) legs = legs.map((l) => (l === weak ? { m: l.m, ...alt, shielded: true } : l));
      const tot = legs.reduce((a, l) => a * l.q, 1), prob = legs.reduce((a, l) => a * l.p, 1);
      const done = legs.filter((l) => hit(l.m, l.k) !== null), won = done.filter((l) => hit(l.m, l.k));
      const mine = mySlip.map((x) => ({ ...x, m: byId[x.id] })).filter((x) => x.m).map((x) => ({ ...x, ...options(x.m).find((o) => o.k === norm(x.k)) }));
      const mTot = mine.reduce((a, l) => a * (l.q || 1), 1), mProb = mine.reduce((a, l) => a * (l.p || 1), 1);
      // testo da copiare: in ordine di orario, con il mercato scritto come sui siti dei bookmaker
      const text = (ls, wa) => (wa ? "*Schedina AuraPitch*\n" : "") + ls.slice().sort((a, b) => String(a.m.ko).localeCompare(String(b.m.ko))).map((l) => { const [mer, es] = mercatoBookmaker(l.m, l.k);
        const ora = new Date(l.m.ko).toLocaleString("it-IT", { weekday: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
        return (wa ? "- " : "") + `${ora} ${l.m.h} - ${l.m.a} | ${mer}: ${wa ? "*" + es + "*" : es} @ ${odd(l.q)}`; }).join("\n") + `\nQuota totale ${odd(ls.reduce((a, l) => a * l.q, 1))}`;
      const LegRow = ({ l, onDel }) => { const h = hit(l.m, l.k); return html`<div className=${"flex items-center gap-2 py-2 border-t first:border-t-0 " + C.bd}>
        <div className="flex-1 min-w-0"><div className=${"text-sm truncate " + C.tx}>${l.m.h} - ${l.m.a}</div><div className=${"text-[11px] " + C.mu}>${lg(l.m.lg).name} - IA ${pct(l.p)}%${l.stima ? " - quota stimata" : ""}${l.shielded ? " - protetta" : ""}</div></div>
        <span className=${"text-sm font-semibold text-right max-w-[45%] leading-tight " + C.tx}>${mLabel(l.m, l.k, true)}</span><span className=${"text-sm tabular-nums w-11 text-right " + C.mu}>${odd(l.q)}</span>
        ${h === null ? null : h ? html`<${Ic.CheckCircle2} size=${17} className="text-emerald-500" />` : html`<${Ic.XCircle} size=${17} className="text-rose-500" />`}
        ${onDel && html`<button aria-label="Rimuovi" onClick=${onDel} className=${C.mu}><${Ic.Trash2} size=${15} /></button>`}</div>`; };
      return html`<div className="px-4 space-y-3"><${Schede} id="schedina" items=${["Crea con l'IA", "La mia schedina", "Diario", "Storico IA"]}>${[html`<${React.Fragment}>
        <div className="flex gap-2 overflow-x-auto noscroll -mx-4 px-4">
          ${miei && html`<${Chip} on=${off.length === miei.length && miei.every((k) => off.includes(k))} onClick=${() => setOff(miei)}><${Ic.Star} size=${14} />Solo i miei<//>`}
          <${Chip} on=${off.length === 0} onClick=${() => setOff([])}>Tutti<//>
          ${D.leagues.map((l) => html`<${Chip} key=${l.k} on=${!off.includes(l.k)} onClick=${() => { const nx = off.includes(l.k) ? off.filter((q) => q !== l.k) : [...off, l.k]; setOff(nx); }}><${Flag} k=${l.flag} w=${16} />${l.name}<//>`)}</div>
        <div className=${"text-[14px] font-semibold " + C.tx}>Partite di</div>
        <div className="flex gap-1.5 overflow-x-auto noscroll -mx-4 px-4">${PERIODI.map(([k, l]) => html`<button key=${k} onClick=${() => { setPer(k); store.set("slipPer", k); setVr(0); }}
          className=${"shrink-0 px-3.5 py-[7px] rounded-full text-[14px] font-semibold " + (per === k ? C.seg : "bg-white dark:bg-[#191626] " + C.tx)}>${l}</button>`)}</div>
        <div className=${"text-[14px] font-semibold " + C.tx}>Quota totale che vuoi giocare</div>
        <div className="flex gap-1.5 overflow-x-auto noscroll -mx-4 px-4">${[0, 2, 3, 5, 10, 20, 50, 100, 200].map((q) => html`<button key=${q} onClick=${() => { setQo(q); store.set("slipQ", q); setVr(0); setShield(false); }}
          className=${"shrink-0 min-w-[52px] px-3 py-[6px] rounded-full font-semibold " + (qo === q ? C.on : "bg-white dark:bg-[#191626] " + C.tx)}>${q ? html`<span className="num text-[18px] font-bold">×${q}</span>` : html`<span className="text-[14px]">Libera</span>`}</button>`)}</div>
        <div className=${"text-[14px] font-semibold " + C.tx}>Stile</div>
        <div className="grid grid-cols-3 gap-2">${["Zero Tachicardia", "Classica del Sabato", "Colpaccio da Bar"].map((p, i) => { const lk = i === 2 && !pro; return html`<button key=${p} onClick=${() => (lk ? setUnlock(true) : (setProf(i), setShield(false), setVr(0)))}
          className=${C.card + " p-3 text-xs font-semibold text-center " + C.tx + (prof === i ? " ring-2 ring-[#5B2EE6] dark:ring-[#A58BFF]" : "")}>${p}${lk && html`<div className="text-[10px] mt-1 text-amber-600 dark:text-amber-300 flex items-center justify-center gap-1"><${Ic.Lock} size=${10} />PRO</div>`}</button>`; })}</div>
        <p className=${"text-[12px] " + C.mu}>${["Molte partite con giocate molto probabili (quota 1,10-1,50 ciascuna).", "Giocate equilibrate (quota 1,30-2,30 ciascuna).", "Poche partite con giocate più rischiose, anche tempi, marcatori e handicap."][prof]} ${qo ? `L'IA sceglie in ogni partita, tra tutte le scommesse possibili, quella con il punteggio migliore vicina alla quota che serve.` : ""}</p>
        <div className=${C.card + " px-4 py-2"}>${legs.length ? legs.map((l) => html`<${LegRow} key=${l.m.id} l=${l} />`) : html`<div className=${"py-3 text-sm " + C.mu}>${pool.length && D.leggera && !pool.some((m) => m.markets) ? "Carico le quote di tutte le partite..." : pool.length ? "Nessuna partita adatta a questo stile: prova un altro periodo o un altro stile." : "Nessuna partita in questo periodo nei campionati scelti."}</div>`}</div>
        ${legs.length > 0 && html`<div className=${C.card + " p-4 space-y-2"}>
          <div className="flex justify-between items-baseline text-sm"><span className=${C.mu}>${D.demo ? "Quota totale (Bet365)" : "Quota totale"}${qo ? ", obiettivo ×" + qo : ""}</span><b className=${"num text-[24px] " + C.tx}>${odd(tot)}</b></div>
          ${qo > 0 && !shield && tot < qo * 0.8 && html`<div className=${"text-[13px] rounded-xl p-3 border " + TONE.warn}>Con le partite di questo periodo si arriva al massimo a ${odd(tot)}: scegli un periodo più lungo o uno stile più rischioso.</div>`}
          ${legs.some((l) => l.stima) && html`<div className=${"text-[12px] " + C.mu}>Di cui ${legs.filter((l) => l.stima).length} ${legs.filter((l) => l.stima).length === 1 ? "quota stimata" : "quote stimate"} dall'IA: dal bookmaker la quota reale può essere un po' più bassa.</div>`}
          <div className="flex justify-between text-sm"><span className=${C.mu}>Partite</span><b className=${"tabular-nums " + C.tx}>${legs.length}</b></div>
          <div className="flex justify-between text-sm"><span className=${C.mu}>Probabilità che passi, secondo l'IA</span><b className=${"tabular-nums " + C.tx}>${(prob * 100).toFixed(1).replace(".", ",")}%</b></div>
          ${done.length > 0 && html`<div className=${"text-xs font-semibold " + (won.length === done.length ? "text-emerald-600 dark:text-emerald-300" : "text-rose-600 dark:text-rose-300")}>Verifica sulla giornata: ${won.length} su ${done.length} esiti corretti${won.length === done.length ? ", schedina vinta" : ""}.</div>`}
          ${weak && html`<div className=${"rounded-xl border p-3 text-sm " + TONE.bad}><div className="font-semibold flex items-center gap-1.5"><${Ic.AlertTriangle} size=${14} />Anello debole</div>
            <div>${shield && alt ? `Protetto dallo Scudo IA: nella stessa partita ora c'è ${mLabel(weak.m, alt.k, true)} (IA ${pct(alt.p)}%, quota ${odd(alt.q)}). Nuova quota totale ${odd(tot)}${qo ? ", obiettivo ×" + qo : ""}.` : `${weak.m.h} - ${weak.m.a}, ${mLabel(weak.m, weak.k, true)} (IA ${pct(weak.p)}%) è la gamba più fragile.${alt ? "" : " Nella stessa partita non c'è un'alternativa più sicura e sensata."}`}</div>
            ${alt && html`<button onClick=${() => setShield(!shield)} className=${"mt-2 inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-full " + (shield ? TONE.good + " border" : C.on)}><${Ic.ShieldCheck} size=${13} />${shield ? "Scudo IA attivo" : "Scudo IA: proteggi"}</button>`}</div>`}
          <${Gioca} legs=${legs} />
          ${qo > 0 && html`<button onClick=${() => { setVr(vr + 1); setShield(false); }} className=${"w-full py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5 " + C.ch + " " + C.tx}><${Ic.Repeat} size=${15} />Un'altra combinazione</button>`}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button onClick=${() => doCopy(text(legs, false))} className=${"py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5 " + C.ch + " " + C.tx}><${Ic.Copy} size=${15} />Copia testo</button>
            <button onClick=${() => doCopy(text(legs, true))} className=${"py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5 " + C.ch + " " + C.tx}><${Ic.Smartphone} size=${15} />Testo WhatsApp</button></div></div>`}
        <p className=${"text-[11px] " + C.mu}>Le probabilità sono stime: nessuna schedina è sicura. Gioca solo cifre che puoi permetterti di perdere.</p><//>`,
        html`<${React.Fragment}>
        <div className=${C.card + " px-4 py-2"}>${mine.length ? mine.map((l) => html`<${LegRow} key=${l.id} l=${l} onDel=${() => setMySlip(mySlip.filter((x) => x.id !== l.id))} />`)
          : html`<div className=${"py-3 text-sm " + C.mu}>Vuota. Apri una partita e tocca un esito in "Aggiungi alla tua schedina".</div>`}</div>
        ${mine.length > 0 && html`<div className=${C.card + " p-4 space-y-2"}>
          <div className="flex justify-between text-sm"><span className=${C.mu}>Quota totale</span><b className=${"tabular-nums " + C.tx}>${odd(mTot)}</b></div>
          <div className="flex justify-between text-sm"><span className=${C.mu}>Probabilità secondo l'IA</span><b className=${"tabular-nums " + C.tx}>${(mProb * 100).toFixed(1).replace(".", ",")}%</b></div>
          <div className="grid grid-cols-3 gap-2 pt-1">
            <button onClick=${() => doCopy(text(mine, false))} className=${"py-2 rounded-xl border text-xs font-semibold " + TONE.good}>Copia</button>
            <button onClick=${() => doCopy(text(mine, true))} className=${"py-2 rounded-xl border text-xs font-semibold " + TONE.good}>WhatsApp</button>
            <button onClick=${() => setMySlip([])} className=${"py-2 rounded-xl text-xs font-semibold " + C.ch + " " + C.tx}>Svuota</button></div>
          <${Gioca} legs=${mine.filter((l) => l.q)} /></div>`}<//>`,
        html`<${React.Fragment}><${Diario} /><${GiocoResponsabile} compatto=${true} /><//>`,
        html`<${StoricoCard} />`]}<//></div>`;
    }


  /* ---- schedina come immagine (1080 x altezza variabile), nello stile AuraPitch ---- */


  /* ---- diario delle giocate: resta sul telefono; l'esito di ogni partita si salva appena è noto ---- */
  function esitoGamba(g, byId) {
    if (g.ok != null) return g.ok;
    const m = byId[g.id];
    return m ? hit(m, g.k) : null;
  }
  function statoGiocata(x, byId) {
    const e = x.legs.map((g) => esitoGamba(g, byId));
    return e.includes(false) ? "persa" : e.every((v) => v === true) ? "vinta" : "aperta";
  }
  function Diario() {
    const { byId, diario, setDiario } = React.useContext(Ctx);
    const [aperta, setAperta] = useState(null);
    // salva gli esiti noti (le partite escono dal file dopo qualche giorno)
    useEffect(() => {
      let ch = false;
      const nx = diario.map((x) => ({ ...x, legs: x.legs.map((g) => { if (g.ok != null) return g; const v = esitoGamba(g, byId); if (v != null) { ch = true; return { ...g, ok: v }; } return g; }) }));
      if (ch) setDiario(nx);
    }, [byId]);
    if (!diario.length) return html`<div className=${C.card + " p-4"}><div className=${C.lab}>Il mio diario</div>
      <p className=${"text-[14px] mt-1 " + C.mu}>Quando giochi una schedina, tocca "L'ho giocata": qui trovi esiti, spesa, vincite e resa nel tempo.</p></div>`;
    const ch = diario.filter((x) => statoGiocata(x, byId) !== "aperta");
    const speso = ch.reduce((a, x) => a + x.imp, 0), vinto = ch.filter((x) => statoGiocata(x, byId) === "vinta").reduce((a, x) => a + x.imp * x.q, 0);
    const eur = (v) => v.toLocaleString("it-IT", { style: "currency", currency: "EUR" });
    // le giocate che il risultato non verifica (cartellini, falli, angoli, marcatori) si chiudono a mano a partita finita
    const chiudibile = (g, x) => { const m = byId[g.id]; return m ? m.st === "FT" : Date.now() - x.t > 4 * 3600e3; };
    const segna = (id, i, v) => setDiario(diario.map((z) => (z.id !== id ? z : { ...z, legs: z.legs.map((g, j) => (j === i ? { ...g, ok: v } : g)) })));
    return html`<div className=${C.card + " p-4"}>
      <div className="flex items-baseline mb-2"><span className=${C.lab + " flex-1"}>Il mio diario</span><span className=${"text-[12px] " + C.mu}>${diario.length} giocate</span></div>
      <div className="grid grid-cols-3 gap-2 mb-2">${[["Giocato", eur(speso)], ["Vinto", eur(vinto)], ["Resa", ch.length ? (vinto - speso >= 0 ? "+" : "") + eur(vinto - speso) : "-"]].map(([l, v]) => html`<div key=${l} className=${"rounded-[14px] p-2.5 " + C.ch}>
        <div className=${"text-[11px] " + C.mu}>${l}</div><div className=${"num text-[20px] font-bold " + (l === "Resa" && ch.length ? (vinto >= speso ? "text-[#0F9D84]" : "text-[#FF3D5A]") : C.tx)}>${v}</div></div>`)}</div>
      ${diario.slice().reverse().map((x) => { const st = statoGiocata(x, byId), o = aperta === x.id; return html`<div key=${x.id} className=${"border-t " + C.bd}>
        <button onClick=${() => setAperta(o ? null : x.id)} className="w-full flex items-center gap-2 py-2.5 text-left">
          <span className=${"text-[11px] font-semibold px-2 py-0.5 rounded-full border " + (st === "vinta" ? TONE.good : st === "persa" ? TONE.bad : TONE.ok)}>${st === "vinta" ? "Vinta" : st === "persa" ? "Persa" : "In corso"}</span>
          <span className="flex-1 min-w-0"><span className=${"block text-[14px] truncate " + C.tx}>${x.legs.length} ${x.legs.length === 1 ? "partita" : "partite"}, ${new Date(x.t).toLocaleDateString("it-IT", { day: "numeric", month: "short" })}</span></span>
          <span className=${"text-[12px] " + C.mu}>${eur(x.imp)} @</span><span className=${"num text-[18px] font-bold " + C.tx}>${odd(x.q)}</span></button>
        ${o && html`<div className="pb-3 space-y-1">${x.legs.map((g, i) => { const e = esitoGamba(g, byId); return html`<div key=${i} className="flex items-center gap-2 text-[13px]">
          <span className=${"flex-1 truncate " + C.tx}>${g.h} - ${g.a}: <b>${g.l}</b></span><span className=${"num text-[15px] " + C.mu}>${odd(g.q)}</span>
          ${e === null ? (chiudibile(g, x) ? html`<span className="flex gap-1">${[[true, "Presa"], [false, "Non presa"]].map(([v, t]) => html`<button key=${t} onClick=${() => segna(x.id, i, v)} className=${"text-[11px] font-semibold px-2 py-0.5 rounded-full border " + (v ? TONE.good : TONE.bad)}>${t}</button>`)}</span>` : html`<${Ic.Clock} size=${15} className=${C.mu} />`) : e ? html`<${Ic.CheckCircle2} size=${15} className="text-[#0F9D84]" />` : html`<${Ic.XCircle} size=${15} className="text-[#FF3D5A]" />`}</div>`; })}
          <button onClick=${() => setDiario(diario.filter((z) => z.id !== x.id))} className=${"text-[12px] font-semibold " + C.mu}>Elimina dal diario</button></div>`}</div>`; })}
      <p className=${"text-[11px] mt-2 " + C.mu}>Il diario resta su questo telefono. Le giocate su cartellini, falli, angoli e marcatori non si verificano dal risultato: quando la partita è finita segnalo tu qui con "Presa" o "Non presa".</p></div>`;
  }
  function Gioca({ legs, onDone }) {
    const { setDiario, diario, lg } = React.useContext(Ctx);
    const [imp, setImp] = useState(store.get("impUltimo", 5));
    const [msg, setMsg] = useState("");
    const [fatto, setFatto] = useState("");
    const q = legs.reduce((a, l) => a * l.q, 1);
    const firma = legs.map((l) => l.m.id + l.k).join("|");
    const salva = () => { if (fatto === firma) return; setFatto(firma); const x = { id: Date.now().toString(36), t: Date.now(), imp: Number(imp) || 0, q, legs: legs.map((l) => ({ id: l.m.id, k: l.k, q: l.q, p: l.p, h: l.m.h, a: l.m.a, l: mLabel(l.m, l.k, true) })) };
      setDiario([...diario, x]); store.set("impUltimo", Number(imp) || 0);
      const lim = store.get("limite", 0), mese = new Date().toISOString().slice(0, 7);
      const speso = [...diario, x].filter((z) => new Date(z.t).toISOString().slice(0, 7) === mese).reduce((a, z) => a + z.imp, 0);
      setMsg(lim && speso > lim ? `Salvata. Attenzione: questo mese hai giocato ${speso} €, oltre il tuo limite di ${lim} €.` : lim && speso > lim * 0.8 ? `Salvata. Sei vicino al tuo limite mensile (${speso} € su ${lim} €).` : "Salvata nel diario.");
      if (onDone) setTimeout(onDone, 800); };
    return html`<div className="space-y-2">
      <div className="flex items-center gap-2"><span className=${"text-[13px] " + C.mu}>Importo</span>${[1, 2, 5, 10, 20].map((v) => html`<button key=${v} onClick=${() => setImp(v)} className=${"num text-[16px] font-bold px-2.5 py-1 rounded-full " + (Number(imp) === v ? C.on : C.ch + " " + C.tx)}>${v}€</button>`)}</div>
      <div className="grid grid-cols-2 gap-2">
        <button onClick=${salva} disabled=${fatto === firma} className=${"py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5 disabled:opacity-60 " + C.on}><${Ic.Book} size=${15} />${fatto === firma ? "Salvata" : "L'ho giocata"}</button>
        <button onClick=${async () => { try { const r = await immagineSchedina(legs, "Schedina del " + new Date().toLocaleDateString("it-IT", { day: "numeric", month: "long" }), lg); setMsg("Immagine " + r + "."); } catch (e) { setMsg("Condivisione annullata."); } }}
          className=${"py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5 " + C.ch + " " + C.tx}><${Ic.Share} size=${15} />Condividi immagine</button></div>
      ${msg && html`<div className=${"text-[12px] " + C.mu}>${msg}</div>`}</div>`;
  }

export { SlipView, esitoGamba, statoGiocata, Diario, Gioca };
