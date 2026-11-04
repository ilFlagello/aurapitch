/* AuraPitch - Schedina IA, schedina come immagine, diario delle giocate. */
import React, { useState, useEffect } from "react";
import { immagineSchedina, mercatoBookmaker } from "./condividi.js";
import { Citazione, citazioneSchedina, citazioneDiario } from "./citazioni.js";
import { Sheet, TIPI_GIOCATORI, QUOTA_MIN, probVera, esitoGamba, statoGiocata, C, Chip, Ctx, Flag, Ic, PERIODI, Schede, TONE, auraCol, buildSlip, buildTarget, buildForzata, PROFILI_SLIP, ESITI_SCHEDINA, candidati, evalCode, hit, html, inPeriodo, mLabel, norm, odd, options, pct, store } from "./base.js";
import { GiocoResponsabile } from "./extra.js";
import { IACard } from "./ia.js";
import { Allenatore } from "./allenatore.js";
import { META, principali, slipOffPredefinito } from "./ordine.js";

    /* ---- campionati della schedina: foglio con gruppi (i tuoi, principali, altri per paese), interruttore per gruppo,
       ricerca; le voci vanno a capo, così si vedono quasi tutte senza scorrere una per una ---- */
    function SceltaLeghe({ leghe, off, setOff, fav, onClose }) {
      const [q, setQ] = useState("");
      const tutte = leghe.map((l) => l.k), byK = Object.fromEntries(leghe.map((l) => [l.k, l]));
      const paese = (k) => (META[k] || [])[0] || (byK[k] || {}).country || "Altro";
      const t = norm(q.trim());
      const vede = (k) => !t || norm(byK[k].name).includes(t) || norm(paese(k)).includes(t);
      const miei = (fav || []).filter((k) => byK[k]);
      const pr = principali().filter((k) => byK[k] && !miei.includes(k));
      const altri = tutte.filter((k) => !miei.includes(k) && !pr.includes(k));
      // minori in un gruppo solo, per paese e poi per livello (prima divisione, seconda, coppe)
      altri.sort((a, b) => paese(a).localeCompare(paese(b), "it") || ((META[a] || [])[1] || 99) - ((META[b] || [])[1] || 99));
      const gruppi = [["I tuoi campionati", miei], ["Principali: quote di molti bookmaker e più dati", pr], ["Altri campionati e coppe", altri]].map(([n, ks]) => [n, ks.filter(vede)]).filter(([, ks]) => ks.length);
      const accesi = (ks) => ks.filter((k) => !off.includes(k)).length;
      const gruppo = (ks, on) => setOff(on ? off.filter((k) => !ks.includes(k)) : [...new Set([...off, ...ks])]);
      const una = (k) => setOff(off.includes(k) ? off.filter((x) => x !== k) : [...off, k]);
      const cons = slipOffPredefinito(tutte, fav);
      const preset = [["Consigliati", cons], ["Tutti", []], ["Nessuno", tutte]];
      const stesso = (a) => a.length === off.length && a.every((k) => off.includes(k));
      return html`<${Sheet} title=${"Campionati della schedina: " + (tutte.length - off.length) + " su " + tutte.length} onClose=${onClose}>
        <div className="flex gap-1.5 flex-wrap">${preset.map(([n, o]) => html`<${Chip} key=${n} on=${stesso(o)} onClick=${() => setOff(o)}>${n}<//>`)}</div>
        <p className=${"text-[12px] leading-snug " + C.mu}>Consigliati = quelli che segui + i principali. I minori danno più scelta ma hanno meno informazioni: lo vedi dalla % dati di ogni partita.</p>
        <input value=${q} onChange=${(e) => setQ(e.target.value)} placeholder="Cerca campionato o paese" className=${"w-full rounded-xl px-3.5 py-2.5 text-[16px] outline-none " + C.ch + " " + C.tx} />
        ${gruppi.map(([n, ks]) => { const a = accesi(ks), tutti = a === ks.length; return html`<div key=${n} className="space-y-2 pt-1">
          <div className="flex items-center gap-2"><div className=${"text-[13px] font-semibold flex-1 " + C.tx}>${n} <span className=${C.mu}>${a}/${ks.length}</span></div>
            ${ks.length > 1 && html`<button onClick=${() => gruppo(ks, !tutti)} className=${"text-[13px] font-semibold " + C.acc}>${tutti ? "Togli tutti" : "Scegli tutti"}</button>`}</div>
          <div className="flex flex-wrap gap-1.5">${ks.map((k) => html`<${Chip} key=${k} on=${!off.includes(k)} onClick=${() => una(k)}><${Flag} k=${byK[k].flag} w=${16} />${byK[k].name}<//>`)}</div></div>`; })}
        ${!gruppi.length && html`<div className=${"text-sm " + C.mu}>Nessun campionato trovato.</div>`}
        <button onClick=${onClose} className=${"w-full py-3 rounded-xl text-[15px] font-semibold " + C.on}>Fatto</button><//>`;
    }

    /* ---- schedina ---- */
    function SlipView() {
      const { D, lg, byId, pro, mySlip, setMySlip, setUnlock, doCopy, favLeagues, caricaMercati } = React.useContext(Ctx);
      const [prof, setProf0] = useState(() => { const v = store.get("slipProf", 0); return [0, 1, 2].includes(v) ? v : 0; });
      const setProf = (v) => { setProf0(v); store.set("slipProf", v); };
      useEffect(() => { if (prof === 2 && !pro) setProf0(0); }, [pro]); // Colpaccio da Bar è PRO: finito il PRO si torna allo stile base
      // campionati della schedina: se non li hai mai scelti qui, quelli che segui + i principali
      const [off, setOff0] = useState(() => store.get("slipOff", null) || slipOffPredefinito(D.leagues.map((l) => l.k), favLeagues));
      const [scegliLeghe, setScegliLeghe] = useState(false);
      const setOff = (nx) => { setOff0(nx); store.set("slipOff", nx); if (caricaMercati) caricaMercati(D.leagues.map((l) => l.k).filter((k) => !nx.includes(k))); };
      const [shield, setShield] = useState(false);
      const [per, setPer] = useState(store.get("slipPer", "3g"));
      const [qo, setQo] = useState(store.get("slipQ", 0));
      const [vr, setVr] = useState(0);
      const [esito, setEsito0] = useState(() => { const e = store.get("slipEsito", ""); return ESITI_SCHEDINA.some(([k]) => k === e) ? e : ""; });
      const setEsito = setEsito0;
      const [nP, setNP] = useState(store.get("slipN", 0)); // numero di partite: 0 = lo decide l'IA
      // cosa giocare: una o più voci insieme (Partite, Marcatori, Assist, Cartellini); solo "Partite" = schedina classica con esito e stile
      const [tipi, setTipi0] = useState(() => { const t = store.get("slipTipi", null); return Array.isArray(t) && t.length ? t : ["P"]; });
      const setTipi = (t) => { setTipi0(t); store.set("slipTipi", t); };
      const tipoG = tipi.length === 1 && tipi[0] === "P" ? "" : tipi.join("+");
      const today = D.today || new Date().toISOString().slice(0, 10);
      const pool = D.matches.filter((m) => !off.includes(m.lg) && (D.demo || m.st === "NS") && (D.demo || inPeriodo(m.date, per, today)));
      // stessa regola per tutte le voci scelte: lo stile decide probabilità, quota e numero di partite; nessuna voce è obbligatoria
      const costruisci = (pr) => (!tipoG && esito ? buildForzata(pool, esito, pr, qo, vr, nP) : qo ? buildTarget(pool, pr, qo, vr, nP, tipi) : buildSlip(pool, pr, nP, vr, tipi));
      let legs = costruisci(prof);
      const allargata = legs.allargata, libera = legs.libera;
      // confronto dei tre stili sulle stesse partite e impostazioni: quota totale e probabilità di ognuno, nella scheda dello stile
      const confronto = !(esito && !tipoG) ? PROFILI_SLIP.map((_, i) => { const L = i === prof ? legs : costruisci(i); return L.length ? { q: L.reduce((a, l) => a * l.q, 1), p: probVera(L).p, n: L.length } : null; }) : null;
      const weak = legs.length ? legs.reduce((a, b) => (a.p < b.p ? a : b)) : null;
      const alt = weak && !esito ? candidati(weak.m, Math.max(0, prof - 1), weak.q, 0, 0, tipi)
        .filter((o) => o.k !== weak.k && o.p >= weak.p + 0.1 && o.q >= QUOTA_MIN && evalCode(o.k, 1, 0, 0, 0) !== null)
        .sort((a, b) => b.sc - a.sc)[0] : null;
      if (shield && weak && alt) legs = legs.map((l) => (l === weak ? { m: l.m, ...alt, shielded: true } : l));
      const tot = legs.reduce((a, l) => a * l.q, 1), prob = probVera(legs).p;
      const done = legs.filter((l) => hit(l.m, l.k) !== null), won = done.filter((l) => hit(l.m, l.k));
      const mine = mySlip.map((x) => ({ ...x, m: byId[x.id] })).filter((x) => x.m).map((x) => ({ ...x, ...options(x.m).find((o) => o.k === norm(x.k)) }));
      const mTot = mine.reduce((a, l) => a * (l.q || 1), 1), PV = probVera(mine), mProb = PV.p;
      // testo da copiare: in ordine di orario, con il mercato scritto come sui siti dei bookmaker
      const text = (ls, wa) => (wa ? "*Schedina AuraPitch*\n" : "") + ls.slice().sort((a, b) => String(a.m.ko).localeCompare(String(b.m.ko))).map((l) => { const [mer, es] = mercatoBookmaker(l.m, l.k);
        const ora = new Date(l.m.ko).toLocaleString("it-IT", { weekday: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
        return (wa ? "- " : "") + `${ora} ${l.m.h} - ${l.m.a} | ${mer}: ${wa ? "*" + es + "*" : es} @ ${odd(l.q)}`; }).join("\n") + `\nQuota totale ${odd(ls.reduce((a, l) => a * l.q, 1))}`;
      const LegRow = ({ l, onDel }) => { const h = hit(l.m, l.k); return html`<div className=${"flex items-center gap-2 py-2 border-t first:border-t-0 " + C.bd}>
        <div className="flex-1 min-w-0"><div className=${"text-sm truncate " + C.tx}>${l.m.h} - ${l.m.a}</div><div className=${"text-[11px] " + C.mu}>${lg(l.m.lg).name} - IA ${pct(l.p)}%${l.stima ? " - quota stimata" : ""}${l.shielded ? " - protetta" : ""}${PV && PV.collegate && PV.collegate.has(l) ? " - collegata" : ""}</div></div>
        <span className=${"text-sm font-semibold text-right max-w-[45%] leading-tight " + C.tx}>${mLabel(l.m, l.k, true)}</span><span className=${"text-sm tabular-nums w-11 text-right " + C.mu}>${odd(l.q)}</span>
        ${h === null ? null : h ? html`<${Ic.CheckCircle2} size=${17} className="text-emerald-500" />` : html`<${Ic.XCircle} size=${17} className="text-rose-500" />`}
        ${onDel && html`<button aria-label="Rimuovi" onClick=${onDel} className=${C.mu}><${Ic.Trash2} size=${15} /></button>`}</div>`; };
      return html`<div className="px-4 space-y-3"><${Schede} id="schedina" items=${["Crea con l'IA", "La mia schedina", "Diario", "Storico IA"]}>${[html`<${React.Fragment}>
        <button onClick=${() => setScegliLeghe(true)} className=${C.card + " w-full px-4 py-3 flex items-center gap-3 text-left"}>
          <div className="flex-1 min-w-0"><div className=${"text-[14px] font-semibold " + C.tx}>Campionati: ${D.leagues.length - off.length} su ${D.leagues.length}</div>
            <div className="flex items-center gap-1 mt-1 overflow-hidden">${D.leagues.filter((l) => !off.includes(l.k)).slice(0, 9).map((l) => html`<${Flag} key=${l.k} k=${l.flag} w=${18} />`)}${D.leagues.length - off.length > 9 && html`<span className=${"text-[12px] " + C.mu}>+${D.leagues.length - off.length - 9}</span>`}</div></div>
          <span className=${"text-[14px] font-semibold " + C.acc}>Cambia</span></button>
        ${scegliLeghe && html`<${SceltaLeghe} leghe=${D.leagues} off=${off} setOff=${setOff} fav=${favLeagues} onClose=${() => setScegliLeghe(false)} />`}
        <div className=${"text-[14px] font-semibold " + C.tx}>Partite di</div>
        <div className="flex gap-1.5 overflow-x-auto noscroll -mx-4 px-4">${PERIODI.map(([k, l]) => html`<button key=${k} onClick=${() => { setPer(k); store.set("slipPer", k); setVr(0); }}
          className=${"shrink-0 px-3.5 py-[7px] rounded-full text-[14px] font-semibold " + (per === k ? C.seg : "bg-white dark:bg-[#191626] " + C.tx)}>${l}</button>`)}</div>
        <div className=${"text-[14px] font-semibold " + C.tx}>Quota totale che vuoi giocare</div>
        <div className="flex gap-1.5 overflow-x-auto noscroll -mx-4 px-4">${[0, 2, 3, 5, 10, 20, 50, 100, 200].map((q) => html`<button key=${q} onClick=${() => { setQo(q); store.set("slipQ", q); setVr(0); setShield(false); }}
          className=${"shrink-0 min-w-[52px] px-3 py-[6px] rounded-full font-semibold " + (qo === q ? C.on : "bg-white dark:bg-[#191626] " + C.tx)}>${q ? html`<span className="num text-[18px] font-bold">×${q}</span>` : html`<span className="text-[14px]">Libera</span>`}</button>`)}</div>
        <div className=${"text-[14px] font-semibold " + C.tx}>Cosa giocare</div>
        <div className="flex gap-1.5 overflow-x-auto noscroll -mx-4 px-4">${TIPI_GIOCATORI.map(([k, l]) => { const on = tipi.includes(k); return html`<button key=${k} aria-pressed=${on}
          onClick=${() => { const nx = on ? tipi.filter((x) => x !== k) : [...tipi, k]; setTipi(nx.length ? nx : ["P"]); setVr(0); setShield(false); }}
          className=${"shrink-0 px-3.5 py-[7px] rounded-full text-[14px] font-semibold flex items-center gap-1.5 " + (on ? C.seg : "bg-white dark:bg-[#191626] " + C.tx)}>${on && html`<${Ic.Check} size=${13} />`}${l}</button>`; })}</div>
        <p className=${"text-[12px] -mt-1 " + C.mu}>${tipoG ? `Voci ammesse: ${tipi.map((k) => TIPI_GIOCATORI.find((x) => x[0] === k)[1].toLowerCase()).join(", ").replace(/, ([^,]*)$/, " e $1")}. Nessuna è obbligatoria: in ogni partita entra la giocata più convincente per lo stile scelto, che sia un esito o un giocatore. Una giocata per partita, sempre sopra quota 1,30.` : "Puoi ammettere più voci insieme: l'IA sceglie tra esiti delle partite e giocatori secondo lo stile."}</p>
        <div className=${"text-[14px] font-semibold " + C.tx}>${tipoG ? "Quante giocate" : "Quante partite"}</div>
        <div className="flex gap-1.5 overflow-x-auto noscroll -mx-4 px-4">${[0, 2, 3, 4, 5, 6, 8, 10].map((n) => html`<button key=${n} onClick=${() => { setNP(n); store.set("slipN", n); setVr(0); setShield(false); }}
          className=${"shrink-0 min-w-[46px] px-3 py-[6px] rounded-full font-semibold " + (nP === n ? C.on : "bg-white dark:bg-[#191626] " + C.tx)}>${n ? html`<span className="num text-[18px] font-bold">${n}</span>` : html`<span className="text-[14px]">Decide l'IA</span>`}</button>`)}</div>
        ${!tipoG && html`<${React.Fragment}><div className=${"text-[14px] font-semibold " + C.tx}>Esito</div>
        <div className="flex gap-1.5 overflow-x-auto noscroll -mx-4 px-4">${ESITI_SCHEDINA.map(([k, l]) => html`<button key=${k || "ia"} onClick=${() => { setEsito(k); store.set("slipEsito", k); setVr(0); setShield(false); }}
          className=${"shrink-0 px-3.5 py-[7px] rounded-full text-[14px] font-semibold " + (esito === k ? C.seg : "bg-white dark:bg-[#191626] " + C.tx)}>${l}</button>`)}</div>
        <//>`}
        ${!tipoG && esito && html`<p className=${"text-[12px] -mt-1 " + C.mu}>Tutte le partite con lo stesso esito: l'IA sceglie quelle dove è più probabile e più d'accordo con i dati delle squadre${qo ? ", fino alla quota che hai chiesto" : ""}.</p>`}
        ${html`<${React.Fragment}><div className=${"text-[14px] font-semibold " + C.tx}>Stile</div>
        <div className="grid grid-cols-3 gap-2">${PROFILI_SLIP.map((P, i) => { const p = P.nome, lk = i === 2 && !pro; return html`<button key=${p} onClick=${() => (lk ? setUnlock(true) : (setProf(i), setShield(false), setVr(0)))}
          className=${C.card + " p-3 text-xs font-semibold text-center " + C.tx + (prof === i ? " ring-2 ring-[#5B2EE6] dark:ring-[#A58BFF]" : "")}>${p}
          ${confronto && confronto[i] && html`<div className=${"mt-1.5 font-normal leading-tight " + C.mu}><span className=${"num text-[17px] font-bold " + C.tx}>×${odd(confronto[i].q)}</span><div className="text-[11px]">${confronto[i].n} ${tipoG ? "giocate" : "partite"}, passa ${confronto[i].p >= 0.095 ? Math.round(confronto[i].p * 100) + "%" : (confronto[i].p * 100).toFixed(1).replace(".", ",") + "%"}</div></div>`}${lk && html`<div className="text-[10px] mt-1 text-amber-600 dark:text-amber-300 flex items-center justify-center gap-1"><${Ic.Lock} size=${10} />PRO</div>`}</button>`; })}</div>
        <p className=${"text-[12px] " + C.mu}>${PROFILI_SLIP[prof].testo} ${nP ? (nP > PROFILI_SLIP[prof].n ? `Con ${nP} partite l'IA sceglie giocate più prudenti dentro lo stile, per non far salire troppo il rischio.` : nP < PROFILI_SLIP[prof].n ? `Con ${nP} partite l'IA può osare un po' di più dentro lo stile.` : "") : `Di base ${PROFILI_SLIP[prof].n} partite: puoi sceglierne un altro numero qui sopra.`} ${qo ? `Con una quota totale da raggiungere, il numero di partite segue la quota e l'IA sceglie in ogni partita la giocata migliore vicina alla quota che serve.` : ""} Sotto ogni stile: quota e probabilità che avrebbe la sua schedina con queste impostazioni.</p>
        ${legs.length > 0 && (libera || allargata) && html`<p className=${"text-[12px] rounded-xl p-2.5 border " + TONE.warn}>${libera ? "Con le voci e le partite scelte non ci sono giocate da questo stile: ecco le più vicine. Prova ad ammettere altre voci o un periodo più lungo." : "Poche giocate perfette per questo stile: l'IA ha allargato un poco le fasce di quota e probabilità."}</p>`}
        <//>`}
        <div className=${C.card + " px-4 py-2"}>${legs.length ? legs.map((l) => html`<${LegRow} key=${l.m.id} l=${l} />`) : html`<div className=${"py-3 text-sm " + C.mu}>${pool.length && D.leggera && !pool.some((m) => m.markets) ? "Carico le quote di tutte le partite..." : pool.length ? "Nessuna partita adatta a questo stile: prova un altro periodo o un altro stile." : "Nessuna partita in questo periodo nei campionati scelti."}</div>`}</div>
        ${legs.length > 0 && html`<div className=${C.card + " p-4 space-y-2"}>
          <div className="flex justify-between items-baseline text-sm"><span className=${C.mu}>${D.demo ? "Quota totale (Bet365)" : "Quota totale"}${qo ? ", obiettivo ×" + qo : ""}</span><b className=${"num text-[24px] " + C.tx}>${odd(tot)}</b></div>
          ${qo > 0 && !shield && tot < qo * 0.8 && html`<div className=${"text-[13px] rounded-xl p-3 border " + TONE.warn}>Con le partite di questo periodo si arriva al massimo a ${odd(tot)}: scegli un periodo più lungo o uno stile più rischioso.</div>`}
          ${legs.some((l) => l.stima) && html`<div className=${"text-[12px] " + C.mu}>Di cui ${legs.filter((l) => l.stima).length} ${legs.filter((l) => l.stima).length === 1 ? "quota stimata" : "quote stimate"} dall'IA: dal bookmaker la quota reale può essere un po' più bassa.</div>`}
          <div className="flex justify-between text-sm"><span className=${C.mu}>${tipoG ? "Giocate" : "Partite"}</span><b className=${"tabular-nums " + C.tx}>${legs.length}</b></div>
          <div className="flex justify-between text-sm"><span className=${C.mu}>Probabilità che passi, secondo l'IA</span><b className=${"tabular-nums " + C.tx}>${(prob * 100).toFixed(1).replace(".", ",")}%</b></div>
          ${done.length > 0 && html`<div className=${"text-xs font-semibold " + (won.length === done.length ? "text-emerald-600 dark:text-emerald-300" : "text-rose-600 dark:text-rose-300")}>Verifica sulla giornata: ${won.length} su ${done.length} esiti corretti${won.length === done.length ? ", schedina vinta" : ""}.</div>`}
          ${weak && html`<div className=${"rounded-xl border p-3 text-sm " + TONE.bad}><div className="font-semibold flex items-center gap-1.5"><${Ic.AlertTriangle} size=${14} />Anello debole</div>
            <div>${shield && alt ? `Protetto dallo Scudo IA: nella stessa partita ora c'è ${mLabel(weak.m, alt.k, true)} (IA ${pct(alt.p)}%, quota ${odd(alt.q)}). Nuova quota totale ${odd(tot)}${qo ? ", obiettivo ×" + qo : ""}.` : `${weak.m.h} - ${weak.m.a}, ${mLabel(weak.m, weak.k, true)} (IA ${pct(weak.p)}%) è la gamba più fragile.${alt || esito ? "" : " Nella stessa partita non c'è un'alternativa più sicura e sensata."}`}</div>
            ${alt && html`<button onClick=${() => setShield(!shield)} className=${"mt-2 inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-full " + (shield ? TONE.good + " border" : C.on)}><${Ic.ShieldCheck} size=${13} />${shield ? "Scudo IA attivo" : "Scudo IA: proteggi"}</button>`}</div>`}
          ${citazioneSchedina(legs, tot) && html`<div className="pt-1"><${Citazione} q=${citazioneSchedina(legs, tot)} piccola=${true} /></div>`}
          <${Gioca} legs=${legs} />
          ${!(esito && !tipoG && !qo) && html`<button onClick=${() => { setVr(vr + 1); setShield(false); }} className=${"w-full py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5 " + C.ch + " " + C.tx}><${Ic.Repeat} size=${15} />Un'altra combinazione</button>`}
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
          ${PV.diversa && html`<div className=${"text-[12px] rounded-xl border p-2.5 " + (PV.p < PV.ind ? TONE.warn : TONE.info)}><b>Schedina onesta:</b> ${PV.collegate.size} giocate sono sulla stessa partita e dipendono l'una dall'altra.
            Moltiplicando le probabilità sembrerebbe il ${(PV.ind * 100).toFixed(1).replace(".", ",")}%, quella vera è il <b>${(PV.p * 100).toFixed(1).replace(".", ",")}%</b>.${PV.p > PV.ind ? " Qui giocano a tuo favore: ma la quota del bookmaker di solito ne tiene già conto." : ""}</div>`}
          <div className="grid grid-cols-3 gap-2 pt-1">
            <button onClick=${() => doCopy(text(mine, false))} className=${"py-2 rounded-xl border text-xs font-semibold " + TONE.good}>Copia</button>
            <button onClick=${() => doCopy(text(mine, true))} className=${"py-2 rounded-xl border text-xs font-semibold " + TONE.good}>WhatsApp</button>
            <button onClick=${() => setMySlip([])} className=${"py-2 rounded-xl text-xs font-semibold " + C.ch + " " + C.tx}>Svuota</button></div>
          <${Gioca} legs=${mine.filter((l) => l.q)} /></div>`}<//>`,
        html`<${React.Fragment}><${Diario} /><${Allenatore} /><${GiocoResponsabile} compatto=${true} /><//>`,
        html`<${React.Fragment}><${IACard} /><${StoricoSchedine} /><${StoricoCard} /><//>`]}<//></div>`;
    }


  /* ---- storico delle schedine IA per stile: ogni giorno il server salva la schedina di base di ogni stile e la verifica ---- */
  function StoricoSchedine() {
    const [S, setS] = useState(null);
    const [aperto, setAperto] = useState(null);
    useEffect(() => { let ok = true; fetch("data/schedine_ia.json").then((r) => (r.ok ? r.json() : null)).then((x) => ok && setS(x)).catch(() => {}); return () => { ok = false; }; }, []);
    if (!S || !S.mese) return null;
    const mese = new Date().toLocaleDateString("it-IT", { month: "long" });
    const giorni = Object.keys(S.giorni || {}).sort().reverse();
    const pun = (v) => (v >= 0 ? "+" : "") + String(v).replace(".", ",");
    return html`<div className=${C.card + " p-4 space-y-2"}>
      <div className="flex items-baseline"><span className=${C.lab + " flex-1"}>Schedine IA di ${mese}</span><${Ic.BarChart3} size=${15} className=${C.mu} /></div>
      <div className=${"grid grid-cols-[1.4fr_0.9fr_0.8fr_0.9fr] text-[11px] font-medium " + C.mu}><span>Stile</span><span className="text-right">Passate</span><span className="text-right">Quota</span><span className="text-right">Punti</span></div>
      ${["0", "1", "2"].map((k) => { const r = S.mese[k] || {}; return html`<div key=${k} className=${"grid grid-cols-[1.4fr_0.9fr_0.8fr_0.9fr] items-baseline text-sm tabular-nums border-t pt-1.5 " + C.bd + " " + C.tx}>
        <span className="font-semibold truncate">${r.nome || PROFILI_SLIP[k].nome}</span>
        <span className="text-right">${r.giocate ? html`${r.passate}/${r.giocate}` : html`<span className=${C.mu}>-</span>`}</span>
        <span className=${"text-right " + C.mu}>${r.q_media ? "×" + odd(r.q_media) : "-"}</span>
        <span className=${"text-right font-semibold " + (!r.giocate ? C.mu : r.punti >= 0 ? "text-emerald-600 dark:text-emerald-300" : "text-rose-600 dark:text-rose-300")}>${r.giocate ? pun(r.punti) : "-"}</span></div>`; })}
      <p className=${"text-[11px] " + C.mu}>Ogni mattina AuraPitch salva la schedina di base di ogni stile con le partite del giorno (stesse regole che vedi in "Crea con l'IA", numero di partite dello stile) e non la cambia più. "Quota" è la quota totale media; "Punti" è il rendimento puntando 1 punto su ogni schedina (vinta: quota meno 1, persa: meno 1). Nessun denaro.</p>
      ${giorni.length > 0 && html`<div className="space-y-1">${giorni.slice(0, 10).map((g) => html`<div key=${g} className=${"border-t " + C.bd}>
        <button onClick=${() => setAperto(aperto === g ? null : g)} className="w-full flex items-center gap-2 py-2 text-left text-[13px]">
          <span className=${"flex-1 " + C.tx}>${new Date(g + "T12:00:00").toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" })}</span>
          ${["0", "1", "2"].map((k) => { const x = S.giorni[g][k]; return x ? html`<span key=${k} className=${"text-[11px] font-semibold px-2 py-0.5 rounded-full border " + (x.esito === 1 ? TONE.good : x.esito === 0 ? TONE.bad : TONE.ok)}>×${odd(x.q)}</span>` : null; })}</button>
        ${aperto === g && html`<div className="pb-2 space-y-2">${["0", "1", "2"].filter((k) => S.giorni[g][k]).map((k) => { const x = S.giorni[g][k]; return html`<div key=${k}>
          <div className=${"text-[12px] font-semibold " + C.tx}>${PROFILI_SLIP[k].nome} · ${x.esito === 1 ? "passata" : x.esito === 0 ? "non passata" : x.esito === -1 ? "non verificabile" : "in corso"}</div>
          ${x.legs.map((l) => html`<div key=${l.id} className="flex items-center gap-2 text-[12px]"><span className=${"flex-1 truncate " + C.mu}>${l.h} - ${l.a}: <b className=${C.tx}>${mLabel({ h: l.h, a: l.a }, l.c, true)}</b></span>
            <span className=${"num text-[14px] " + C.mu}>${odd(l.q)}</span>${l.ok === 1 ? html`<${Ic.CheckCircle2} size=${14} className="text-emerald-500" />` : l.ok === 0 ? html`<${Ic.XCircle} size=${14} className="text-rose-500" />` : html`<${Ic.Clock} size=${14} className=${C.mu} />`}</div>`)}</div>`; })}</div>`}</div>`)}</div>`}</div>`;
  }

  /* ---- schedina come immagine (1080 x altezza variabile), nello stile AuraPitch ---- */


  /* ---- diario delle giocate: resta sul telefono; l'esito di ogni partita si salva appena è noto ---- */
  // esitoGamba e statoGiocata stanno in base.js (servono anche fuori dalla Schedina)
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
          ${st !== "aperta" && citazioneDiario(x.id, st === "vinta") && html`<div className="pt-1"><${Citazione} q=${citazioneDiario(x.id, st === "vinta")} piccola=${true} /></div>`}
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

export { SlipView, esitoGamba, statoGiocata, Diario, Gioca, StoricoSchedine };

    /* ---- storico dei consigli IA (registro pubblico degli ultimi 30 giorni): sta qui perché si vede solo nella Schedina ---- */
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
