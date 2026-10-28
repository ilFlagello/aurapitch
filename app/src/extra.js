/* AuraPitch - partita della settimana, glossario, gioco responsabile, primo avvio, schedina in diretta, ricerca. */
import React, { useState } from "react";
import { ESPN_LG } from "./live.js";
import { C, Crest, Ctx, Flag, Ic, Marchio, Sheet, evalCode, hit, html, norm, pct, store } from "./base.js";
import { statoGiocata } from "./schedina.js";

  /* ---- partita della settimana: la sfida più importante dei prossimi 7 giorni (competizione, classifica delle due squadre, equilibrio) ---- */
  const PESO_LEGA = { NL: 2.6, LIB: 1.2, SA1: 0.6, F2: 0.4, NO1: 0.3, SE1: 0.3, COL1: 0.3, CHI1: 0.3, AU1: 0.3, UY1: 0.2, PY1: 0.2, EC1: 0.2, PE1: 0.2, SUD: 0.6, ACL: 0.5, AMI: 0.8, EQ: 1.5, WCQ: 1.8, CL: 3, I1: 2.4, E0: 2.4, SP1: 2.1, D1: 2, F1: 1.7, EL: 1.6, CI: 1.4, SCI: 1.6, FAC: 1.2, CDR: 1.2, DFB: 1.1, ECL: 1.1, P1: 1, N1: 1, ELC: 0.8, CDF: 0.7, E1: 0.6, I2: 0.6, T1: 0.7, B1: 0.6, SC0: 0.6, BR1: 0.7, AR1: 0.6, MLS: 0.5, MX1: 0.5, D2: 0.5, SP2: 0.5, A1: 0.4, G1: 0.4, DK1: 0.4, J1: 0.4 };
  function partitaSettimana(D) {
    const pos = (k, t) => { const S = D.standings[k]; const i = S ? S.generale.findIndex((r) => r.team === t) : -1; return i < 0 ? 12 : i + 1; };
    let best = null;
    for (const m of D.matches) {
      if (m.st !== "NS" || new Date(m.ko).getTime() - Date.now() > 7 * 86400e3 || new Date(m.ko).getTime() < Date.now()) continue;
      const bonus = (t) => { const q = pos(m.lg, t); return q > 0 ? Math.max(0, 8 - q) * 0.12 : 0; }; // senza classifica (coppe, nazionali): nessun bonus
      const v = (PESO_LEGA[m.lg] || 0.3) + bonus(m.h) + bonus(m.a) + (1 - Math.abs(m.mk[0] - m.mk[2])) * 0.8;
      if (!best || v > best.v) best = { m, v };
    }
    return best && best.m;
  }
  function Anteprima({ m }) {
    const { D } = React.useContext(Ctx);
    const S = D.standings[m.lg];
    const riga = (t) => { const r = S && S.generale.find((x) => x.team === t); return r ? `${S.generale.indexOf(r) + 1}° con ${r.pt} punti` : ""; };
    const bomber = (j) => Object.entries(m.marcatori || {}).filter(([, x]) => x.lato === j).sort((a, b) => b[1].g - a[1].g)[0];
    const chiavi = [];
    for (const j of [0, 1]) { const b = bomber(j); if (b && b[1].g >= 2) chiavi.push(`${b[0].slice(5)} è l'uomo gol di ${j ? m.a : m.h}: ${b[1].g} reti in ${b[1].pres} partite.`); }
    if (m.forma) chiavi.push(...m.forma.filter((f) => f.tone !== "ok").slice(0, 1).map((f) => f.text));
    return html`<div className=${C.card + " p-4 relative overflow-hidden"}>
      <div className=${"text-[12px] font-semibold " + C.acc}>Partita della settimana</div>
      <div className=${C.lab + " mt-0.5"}>Anteprima</div>
      ${S && html`<div className=${"text-[14px] mt-2 " + C.tx}>${m.h} arriva ${riga(m.h)}, ${m.a} ${riga(m.a)}.</div>`}
      <div className="space-y-2 mt-2">${chiavi.slice(0, 3).map((t, i) => html`<div key=${i} className="flex gap-3"><i className="block w-[3px] self-stretch rounded-full shrink-0 bg-[#5B2EE6] dark:bg-[#A58BFF]"></i><span className=${"text-[14px] leading-snug " + C.tx}>${t}</span></div>`)}</div>
      <div className=${"text-[13px] mt-2 " + C.mu}>Per le quote: ${m.h} ${pct(m.mk[0])}%, pareggio ${pct(m.mk[1])}%, ${m.a} ${pct(m.mk[2])}%.</div></div>`;
  }

  /* ---- glossario delle scommesse ---- */
  const GLOSSARIO = [
    ["1, X, 2", "Vince la squadra di casa (1), pareggio (X), vince la squadra ospite (2)."],
    ["Doppia chance (1X, X2, 12)", "Copri due esiti su tre: per esempio 1X vince se la squadra di casa vince o pareggia."],
    ["Under / Over", "Under 2,5: al massimo 2 gol in tutta la partita. Over 2,5: almeno 3. Il numero con la virgola evita i pareggi con il bookmaker."],
    ["Goal / No Goal", "Goal: segnano tutte e due le squadre. No Goal: almeno una non segna."],
    ["Multigol", "Il totale dei gol cade in un intervallo, per esempio Multigol 1-3: da 1 a 3 gol."],
    ["Primo e secondo tempo", "La giocata vale solo per quel tempo: per esempio \"1° tempo: Over 0,5\" vince se c'è almeno un gol prima dell'intervallo."],
    ["Parziale/finale", "Indovini insieme il risultato all'intervallo e quello finale: 1/1 vuol dire casa in vantaggio all'intervallo e vincente alla fine."],
    ["Handicap europeo", "Si aggiunge un vantaggio o uno svantaggio di gol a una squadra prima della partita. Handicap −1 a una squadra: per vincere deve fare almeno 2 gol più dell'avversaria."],
    ["Margine di vittoria", "Una squadra vince con un certo scarto esatto, per esempio di 2 gol."],
    ["Risultato esatto", "Indovini il punteggio preciso: rischioso, quote alte."],
    ["Combo", "Due condizioni insieme, devono avverarsi entrambe: per esempio 1 + Over 1,5."],
    ["Quota", "Quanto ti viene restituito per ogni euro giocato se vinci: quota 2,00 con 10 € = 20 €."],
    ["Quota stimata", "Calcolata dall'IA dalla probabilità con il margine tipico dei bookmaker: quella reale può essere un po' diversa."],
    ["Probabilità", "Quante volte su 100 l'IA si aspetta che la giocata passi. In una schedina le probabilità si moltiplicano: 3 giocate al 70% passano tutte insieme circa 1 volta su 3."],
    ["Punteggio IA", "Da 0 a 100: quanto probabilità e statistiche delle squadre sono d'accordo su quella giocata."],
    ["Marcatore", "Il giocatore segna almeno un gol nella partita (in qualsiasi momento)."],
  ];
  function Glossario({ onClose }) {
    return html`<${Sheet} title="Glossario delle scommesse" onClose=${onClose}>
      ${GLOSSARIO.map(([t, d]) => html`<div key=${t} className=${"py-2 border-t first:border-t-0 " + C.bd}><div className=${"text-[15px] font-semibold " + C.tx}>${t}</div><div className=${"text-[14px] mt-0.5 " + C.mu}>${d}</div></div>`)}<//>`;
  }

  /* ---- gioco responsabile: limite di spesa mensile nel diario ---- */
  function GiocoResponsabile({ compatto }) {
    const { diario } = React.useContext(Ctx);
    const [lim, setLim] = useState(store.get("limite", 0));
    const mese = new Date().toISOString().slice(0, 7);
    const speso = diario.filter((x) => new Date(x.t).toISOString().slice(0, 7) === mese).reduce((a, x) => a + x.imp, 0);
    const eur = (v) => v.toLocaleString("it-IT", { style: "currency", currency: "EUR" });
    const oltre = lim > 0 && speso > lim;
    return html`<div className=${C.card + " p-4 " + (oltre ? "ring-2 ring-[#FF3D5A]" : "")}>
      <div className=${C.lab}>Gioco responsabile</div>
      ${lim > 0 ? html`<div className=${"text-[14px] mt-1 " + (oltre ? "text-[#FF3D5A] font-semibold" : C.tx)}>Questo mese hai giocato ${eur(speso)} su un limite di ${eur(lim)}.${oltre ? " Hai superato il limite che ti eri dato: fermati per questo mese." : ""}</div>
        <div className=${"h-[6px] rounded-full mt-2 " + C.ch}><div className="h-[6px] rounded-full" style=${{ width: Math.min(100, (speso / lim) * 100) + "%", background: oltre ? "#FF3D5A" : speso / lim > 0.8 ? "#E8A317" : "#0F9D84" }}></div></div>`
        : html`<div className=${"text-[14px] mt-1 " + C.mu}>Datti un limite di spesa al mese: l'app ti avvisa quando ti avvicini.</div>`}
      ${!compatto && html`<div className="flex gap-1.5 mt-3 flex-wrap">${[0, 20, 50, 100, 200].map((v) => html`<button key=${v} onClick=${() => { setLim(v); store.set("limite", v); }} className=${"num px-3 py-1 rounded-full text-[16px] font-bold " + (lim === v ? C.on : C.ch + " " + C.tx)}>${v ? v + "€" : "Nessuno"}</button>`)}</div>
        <p className=${"text-[12px] mt-3 " + C.mu}>Il gioco può creare dipendenza. Se senti di non riuscire a smettere, chiama il numero gratuito e anonimo dell'Istituto Superiore di Sanità per le dipendenze, 800 940 789 (dal lunedì al venerdì), o il Telefono Verde sul gioco d'azzardo 800 558 822. Il gioco è vietato ai minori.</p>`}</div>`;
  }

  /* ---- primo avvio: campionati e squadre che ti interessano (mettono in alto le tue partite e attivano gli avvisi) ---- */
  const TUTTE_LEGHE = [["I1", "Serie A", "it"], ["I2", "Serie B", "it"], ["CL", "Champions League", "eu"], ["EL", "Europa League", "eu"], ["ECL", "Conference League", "eu"], ["CI", "Coppa Italia", "it"],
    ["E0", "Premier League", "en"], ["SP1", "LaLiga", "es"], ["D1", "Bundesliga", "de"],
    ["F1", "Ligue 1", "fr"], ["N1", "Eredivisie", "nl"], ["P1", "Primeira Liga", "pt"], ["E1", "Championship", "en"], ["SCI", "Supercoppa Italiana", "it"],
    ["FAC", "FA Cup", "en"], ["ELC", "Carabao Cup", "en"], ["CDR", "Copa del Rey", "es"], ["DFB", "DFB-Pokal", "de"], ["CDF", "Coppa di Francia", "fr"],
    ["D2", "2. Bundesliga", "de"], ["SP2", "LaLiga 2", "es"], ["B1", "Pro League", "be"], ["T1", "Süper Lig", "tr"], ["SC0", "Premiership", "sc"], ["A1", "Bundesliga austriaca", "at"],
    ["G1", "Super League", "gr"], ["DK1", "Superliga", "dk"], ["MLS", "MLS", "us"], ["BR1", "Brasileirão", "br"], ["AR1", "Liga Profesional", "ar"], ["MX1", "Liga MX", "mx"], ["J1", "J1 League", "jp"],
    ["F2", "Ligue 2", "fr"], ["NO1", "Eliteserien", "no"], ["SE1", "Allsvenskan", "se"], ["SA1", "Saudi Pro League", "sa"], ["CHI1", "Primera Cile", "cl"], ["COL1", "Liga BetPlay", "co"],
    ["AU1", "A-League", "au"], ["UY1", "Primera Uruguay", "uy"], ["PY1", "Primera Paraguay", "py"], ["EC1", "LigaPro Ecuador", "ec"], ["PE1", "Liga 1 Perù", "pe"],
    ["LIB", "Copa Libertadores", "sam"], ["SUD", "Copa Sudamericana", "sam"], ["ACL", "AFC Champions League", "as"],
    ["NL", "Nations League", "eu"], ["AMI", "Amichevoli nazionali", "wo"], ["EQ", "Qualificazioni Europei", "eu"], ["WCQ", "Qualificazioni Mondiali", "wo"]];
  // gruppi per il primo avvio: prima le competizioni più seguite, il resto a scomparsa
  const GRUPPI_LEGHE = [["Italia ed Europa", ["I1", "I2", "CL", "EL", "ECL", "CI", "SCI", "E0", "SP1", "D1", "F1"]], ["Nazionali", ["NL", "AMI", "EQ", "WCQ"]],
    ["Coppe nazionali", ["FAC", "ELC", "CDR", "DFB", "CDF"]], ["Altri campionati europei", ["E1", "SP2", "D2", "F2", "N1", "P1", "B1", "T1", "SC0", "A1", "G1", "DK1", "NO1", "SE1"]],
    ["Resto del mondo", ["MLS", "BR1", "AR1", "MX1", "SA1", "J1", "COL1", "CHI1", "UY1", "PY1", "EC1", "PE1", "AU1", "LIB", "SUD", "ACL"]]];
  function PrimoAvvio({ onFine }) {
    const { D, setFavTeams, setFavLeagues, setFav } = React.useContext(Ctx);
    const [passo, setPasso] = useState(0);
    const [lg, setLg] = useState(["I1"]);
    const [sq, setSq] = useState([]);
    const [q, setQ] = useState("");
    const squadre = [...new Set([...lg.flatMap((k) => ((D.standings[k] || {}).generale || []).map((r) => r.team)), ...D.matches.filter((m) => lg.includes(m.lg)).flatMap((m) => [m.h, m.a])])]
      .filter((t) => !q || t.toLowerCase().includes(q.toLowerCase())).sort((a, b) => a.localeCompare(b, "it"));
    const tog = (arr, set, x) => set(arr.includes(x) ? arr.filter((y) => y !== x) : [...arr, x]);
    const fine = () => { setFavLeagues(lg); setFavTeams(sq); if (sq[0]) { setFav(sq[0]); store.set("fav", sq[0]); } onFine(); };
    return html`<div className="fixed inset-0 z-[60] overflow-y-auto" style=${{ background: "var(--bg)", paddingTop: "env(safe-area-inset-top, 0px)" }}>
      <div className="max-w-[480px] mx-auto px-5 pt-8 pb-32 space-y-5">
        <div className="flex items-center gap-3"><${Marchio} size=${40} /><span className=${"num text-[30px] font-extrabold " + C.tx}>AuraPitch</span></div>
        ${passo === 0 ? html`<${React.Fragment}>
          <div><div className=${"text-[26px] font-bold leading-tight tracking-[-0.02em] " + C.tx}>Quali campionati segui?</div>
            <p className=${"text-[15px] mt-1.5 " + C.mu}>Li mettiamo in cima alle partite. Puoi cambiarli quando vuoi dal profilo.</p></div>
          ${GRUPPI_LEGHE.map(([titolo, ks], gi) => html`<details key=${titolo} open=${gi === 0} className="group"><summary className=${"list-none cursor-pointer flex items-center justify-between py-1 text-[13px] font-semibold uppercase tracking-[0.06em] " + C.mu}>${titolo}<${Ic.ChevronDown} size=${16} className="group-open:rotate-180 transition-transform" /></summary>
            <div className="grid grid-cols-2 gap-2 mt-2">${ks.map((k) => TUTTE_LEGHE.find((x) => x[0] === k)).filter(Boolean).map(([k, n, f]) => html`<button key=${k} onClick=${() => tog(lg, setLg, k)} aria-pressed=${lg.includes(k)}
            className=${"flex items-center gap-2.5 rounded-[16px] px-3 py-3 text-left text-[15px] font-semibold " + (lg.includes(k) ? C.seg : "bg-white dark:bg-[#191626] " + C.tx)}><${Flag} k=${f} w=${22} />${n}</button>`)}</div></details>`)}`
        : html`<${React.Fragment}>
          <div><div className=${"text-[26px] font-bold leading-tight tracking-[-0.02em] " + C.tx}>Le tue squadre</div>
            <p className=${"text-[15px] mt-1.5 " + C.mu}>Le loro partite saranno sempre in alto e riceverai gli avvisi se attivi le notifiche. La prima che scegli è la squadra del cuore.</p></div>
          <input value=${q} onChange=${(e) => setQ(e.target.value)} placeholder="Cerca una squadra" className=${"w-full rounded-xl px-3.5 py-3 text-[16px] outline-none bg-white dark:bg-[#191626] " + C.tx} />
          <div className="flex flex-wrap gap-2">${squadre.map((t) => html`<button key=${t} onClick=${() => tog(sq, setSq, t)} aria-pressed=${sq.includes(t)}
            className=${"flex items-center gap-2 rounded-full pl-2 pr-3.5 py-1.5 text-[14px] font-semibold " + (sq.includes(t) ? C.seg : "bg-white dark:bg-[#191626] " + C.tx)}><${Crest} t=${t} size=${18} />${t}${sq[0] === t ? html`<${Ic.Star} size=${13} className="text-amber-400 fill-amber-400" />` : ""}</button>`)}</div>
          ${!squadre.length && html`<p className=${"text-[14px] " + C.mu}>Nessuna squadra trovata.</p>`}`}
      </div>
      <div className="fixed inset-x-0 bottom-0 px-5 pt-3" style=${{ background: "var(--bg)", paddingBottom: "calc(16px + env(safe-area-inset-bottom, 0px))" }}>
        <div className="max-w-[440px] mx-auto flex gap-2">
          <button onClick=${() => (passo ? setPasso(0) : onFine())} className=${"px-4 py-3 rounded-2xl text-[15px] font-semibold " + C.ch + " " + C.tx}>${passo ? "Indietro" : "Salta"}</button>
          <button disabled=${passo === 0 && !lg.length} onClick=${() => (passo ? fine() : setPasso(1))} className=${"flex-1 py-3 rounded-2xl text-[16px] font-bold disabled:opacity-50 " + C.on}>${passo ? (sq.length ? "Inizia" : "Inizia senza squadre") : "Avanti"}</button></div></div></div>`;
  }

  /* ---- schedina in diretta: barra sopra il menu quando una tua giocata è in campo ---- */
  function BarraSchedina({ vaiSchedina }) {
    const { mySlip, diario, byId } = React.useContext(Ctx);
    const legs = [...mySlip.map((x) => ({ id: x.id, k: x.k })), ...diario.filter((x) => statoGiocata(x, byId) === "aperta").flatMap((x) => x.legs.filter((g) => g.ok == null).map((g) => ({ id: g.id, k: g.k })))];
    const vis = [...new Map(legs.map((l) => [l.id + l.k, l])).values()].map((l) => ({ ...l, m: byId[l.id] })).filter((l) => l.m && (l.m.st === "LIVE" || l.m.st === "FT"));
    if (!vis.some((l) => l.m.st === "LIVE")) return null;
    const ora = vis.map((l) => { const g = l.m.g || [0, 0]; const v = evalCode(norm(l.k), g[0], g[1]); return l.m.st === "FT" ? (hit(l.m, l.k) ?? null) : v; });
    const si = ora.filter((v) => v === true).length, no = ora.filter((v) => v === false).length;
    return html`<button onClick=${vaiSchedina} className="fixed inset-x-0 z-40 px-3" style=${{ bottom: "calc(88px + env(safe-area-inset-bottom, 0px))" }}>
      <div className=${"dock max-w-[456px] mx-auto rounded-[18px] px-4 py-2.5 flex items-center gap-2.5 text-left"}>
        <i className="pulse block w-2 h-2 rounded-full bg-[#FF3D5A] shrink-0"></i>
        <span className=${"flex-1 text-[14px] font-semibold " + C.tx}>Le tue giocate in campo</span>
        <span className="num text-[18px] font-bold text-[#0F9D84]">${si} ✓</span><span className="num text-[18px] font-bold text-[#FF3D5A]">${no} ✗</span>
        <span className=${"text-[12px] " + C.mu}>su ${vis.length}</span></div></button>`;
  }

  /* ---- ricerca: squadre, partite e giocatori (marcatori delle partite in programma) ---- */
  function Cerca({ onClose }) {
    const { D, lg, goMatch, setTeam, favLeagues } = React.useContext(Ctx);
    const [q, setQ] = useState("");
    const [solo, setSolo] = useState(store.get("cercaMiei", false) && favLeagues && favLeagues.length > 0);
    const ok = (k) => !solo || favLeagues.includes(k);
    const pn = (x) => String(x || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const t = pn(q.trim());
    const squadre = {};
    for (const m of D.matches) { squadre[m.h] = squadre[m.h] || { lg: m.lg, lgE: m.lgE || ESPN_LG[m.lg] }; squadre[m.a] = squadre[m.a] || { lg: m.lg, lgE: m.lgE || ESPN_LG[m.lg] }; }
    for (const [k, S] of Object.entries(D.standings || {})) for (const r of S.generale || []) squadre[r.team] = squadre[r.team] || { lg: k, lgE: ESPN_LG[k] };
    const sq = t.length >= 2 ? Object.entries(squadre).filter(([n, x]) => ok(x.lg) && pn(n).includes(t)).slice(0, 8) : [];
    const pa = t.length >= 2 ? D.matches.filter((m) => ok(m.lg) && (pn(m.h).includes(t) || pn(m.a).includes(t))).slice(0, 8) : [];
    const gi = [];
    if (t.length >= 3) for (const m of D.matches.filter((m) => ok(m.lg)).sort((a, b) => a.ko.localeCompare(b.ko))) for (const c of Object.keys(m.marcatori || {})) if (pn(c.slice(5)).includes(t) && gi.length < 8 && !gi.some((g) => g.n === c.slice(5))) gi.push({ n: c.slice(5), m, x: m.marcatori[c] });
    const vai = (fn) => { onClose(); fn(); };
    const Riga = ({ onClick, children }) => html`<button onClick=${onClick} className=${"w-full flex items-center gap-3 py-2.5 text-left border-t first:border-t-0 " + C.bd}>${children}</button>`;
    return html`<${Sheet} title="Cerca" onClose=${onClose}>
      <input autoFocus value=${q} onChange=${(e) => setQ(e.target.value)} placeholder="Squadra, partita o giocatore" className=${"w-full rounded-xl px-3.5 py-3 text-[16px] outline-none " + C.ch + " " + C.tx} />
      ${favLeagues && favLeagues.length > 0 && html`<label className=${"flex items-center gap-2 text-[14px] " + C.tx}><input type="checkbox" checked=${solo} onChange=${(e) => { setSolo(e.target.checked); store.set("cercaMiei", e.target.checked); }} className="w-4 h-4 accent-[#5B2EE6]" />Solo i campionati che seguo</label>`}
      ${t.length < 2 && html`<p className=${"text-[13px] " + C.mu}>Scrivi almeno 2 lettere. Trovi le squadre dei campionati seguiti, le loro partite in programma e i giocatori che possono segnare.</p>`}
      ${sq.length > 0 && html`<div><div className=${"text-[12px] font-semibold mb-1 " + C.mu}>Squadre</div>${sq.map(([n, x]) => html`<${Riga} key=${n} onClick=${() => vai(() => setTeam({ lgE: x.lgE, name: n }))}>
        <${Crest} t=${n} size=${22} /><span className=${"flex-1 text-[15px] " + C.tx}>${n}</span><span className=${"text-[12px] " + C.mu}>${(lg(x.lg) || {}).name || ""}</span><//>`)}</div>`}
      ${pa.length > 0 && html`<div><div className=${"text-[12px] font-semibold mb-1 " + C.mu}>Partite</div>${pa.map((m) => html`<${Riga} key=${m.id} onClick=${() => vai(() => goMatch(m.id))}>
        <span className=${"num text-[16px] font-bold w-12 " + C.tx}>${m.st === "NS" ? m.time : m.g ? m.g.join("-") : ""}</span><span className=${"flex-1 text-[15px] " + C.tx}>${m.h} - ${m.a}</span><span className=${"text-[12px] " + C.mu}>${m.date.slice(8)}/${m.date.slice(5, 7)}</span><//>`)}</div>`}
      ${gi.length > 0 && html`<div><div className=${"text-[12px] font-semibold mb-1 " + C.mu}>Giocatori</div>${gi.map((g) => html`<${Riga} key=${g.n + g.m.id} onClick=${() => vai(() => goMatch(g.m.id))}>
        <span className="flex-1 min-w-0"><span className=${"block text-[15px] " + C.tx}>${g.n}</span><span className=${"block text-[12px] " + C.mu}>${g.x.lato ? g.m.a : g.m.h}, ${g.x.g} gol in ${g.x.pres} presenze. Prossima: ${g.m.h} - ${g.m.a}</span></span><//>`)}</div>`}
      ${t.length >= 2 && !sq.length && !pa.length && !gi.length && html`<p className=${"text-[13px] " + C.mu}>Nessun risultato per "${q}".</p>`}<//>`;
  }

export { GRUPPI_LEGHE, PESO_LEGA, partitaSettimana, Anteprima, GLOSSARIO, Glossario, GiocoResponsabile, TUTTE_LEGHE, PrimoAvvio, BarraSchedina, Cerca };
