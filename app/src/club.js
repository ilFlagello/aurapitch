/* AuraPitch - Il Mio Club: squadra del cuore, gara dei pronostici, codice personale, riepilogo, medaglie. */
import React, { useState, useEffect } from "react";
import { ESPN_LG } from "./live.js";
import { C, Crest, Ctx, Flag, Form, Ic, Schede, Seg, html, store } from "./base.js";
import { GiocoResponsabile, gruppiSquadre } from "./extra.js";
import { scaricaCalendario } from "./condividi.js";
import { Row } from "./partita.js";
import { statoGiocata } from "./schedina.js";

    /* ---- il mio club ---- */
    /* ---- gara dei pronostici: 3 punti per ogni esito indovinato, +2 se le quote lo davano sotto il 30%; classifiche nei gruppi di amici ---- */
    function codiceChi() { let chi = store.get("chi", null); if (!chi) { chi = Array.from({ length: 16 }, () => "abcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(Math.random() * 36)]).join(""); store.set("chi", chi); } return chi; }
    function Gara() {
      const { D, pushUrl, favM, fav, goMatch } = React.useContext(Ctx);
      const [prof, setProf] = useState(undefined);
      const [nome, setNome] = useState(store.get("name", "") || "");
      const [per, setPer] = useState(0);
      const [gr, setGr] = useState(store.get("garaGruppo", ""));
      const [cl, setCl] = useState(null);
      const [codice, setCodice] = useState("");
      const [msg, setMsg] = useState("");
      const [voti, setVoti] = useState({});
      const chi = codiceChi();
      const api = (p, body) => fetch(pushUrl + p, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : undefined).then((r) => r.json());
      const carica = () => api("/profilo", { chi, leggi: 1 }).then((x) => { if (x.ok) { setProf(x.u); setVoti(x.u.voti || {}); if (!gr && x.u.gruppi[0]) setGr(x.u.gruppi[0].code); } else setProf(null); }).catch(() => setProf(null));
      useEffect(() => { if (pushUrl) carica(); }, [pushUrl]);
      useEffect(() => { if (!pushUrl || !prof) return; api("/classifica", { chi, gruppo: gr || "", periodo: per ? "tutto" : "settimana" }).then((x) => x.ok && setCl(x)).catch(() => {}); }, [pushUrl, prof, gr, per]);
      if (!pushUrl) return null;
      const prossime = D.matches.filter((m) => m.st === "NS" && new Date(m.ko).getTime() > Date.now()).sort((a, b) => (favM.includes(b.id) || b.h === fav || b.a === fav) - (favM.includes(a.id) || a.h === fav || a.a === fav) || a.ko.localeCompare(b.ko)).slice(0, 10);
      const vota = (m, s) => { const prima = voti, ps = store.get("voto:" + m.id, null);
        const annulla = (t) => { setVoti(prima); store.set("voto:" + m.id, ps); setMsg(t); };
        setVoti({ ...voti, [m.id]: s }); store.set("voto:" + m.id, s);
        api("/voto", { id: m.id, s, chi }).then((x) => { if (!x.ok) annulla(x.err === "votazione chiusa" ? `${m.h} - ${m.a} è già iniziata: voto non salvato.` : `Voto su ${m.h} - ${m.a} non salvato, riprova.`); }).catch(() => annulla("Voto non salvato: controlla la connessione.")); };
      if (prof === undefined) return html`<div className=${C.card + " p-4 text-sm " + C.mu}>Caricamento della gara dei pronostici...</div>`;
      if (prof === null || !prof.nome) return html`<div className=${C.card + " p-4 space-y-2"}>
        <div className=${C.lab}>Gara dei pronostici</div>
        <p className=${"text-[14px] " + C.tx}>Indovina chi vince le partite: 3 punti per ogni esito giusto, 2 in più se le quote lo davano sotto il 30%. Sfida gli amici in un gruppo e confrontati con l'IA.</p>
        <input value=${nome} onChange=${(e) => setNome(e.target.value)} placeholder="Il tuo nome in classifica" aria-label="Il tuo nome in classifica" maxLength=${20} className=${"w-full rounded-xl px-3 py-2.5 outline-none " + C.ch + " " + C.tx} />
        <button disabled=${nome.trim().length < 2} onClick=${() => api("/profilo", { chi, nome: nome.trim() }).then(carica)} className=${"w-full py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50 " + C.on}>Partecipa</button></div>`;
      const io = cl && cl.io;
      return html`<div className=${C.card + " p-4 space-y-3"}>
        <div className="flex items-baseline"><span className=${C.lab + " flex-1"}>Gara dei pronostici</span><span className=${"text-[12px] " + C.mu}>${prof.nome}</span></div>
        <${Seg} small=${true} items=${["Questa settimana", "Da sempre"]} val=${per} set=${setPer} />
        ${io && html`<div className="grid grid-cols-3 gap-2">${[["Punti", io.pt], ["Indovinati", io.giuste + "/" + io.giocate], ["L'IA", io.ia + "/" + io.iaG]].map(([l, v]) => html`<div key=${l} className=${"rounded-[14px] p-2.5 " + C.ch}>
          <div className=${"text-[11px] " + C.mu}>${l}</div><div className=${"num text-[22px] font-bold " + C.tx}>${v}</div></div>`)}</div>
          <div className=${"text-[13px] " + C.tx}>${io.giocate ? (io.giuste > io.ia ? "Stai battendo l'IA sulle stesse partite." : io.giuste === io.ia ? "Pari con l'IA sulle stesse partite." : "L'IA è avanti sulle stesse partite: tocca a te.") : "Le partite che pronostichi contano appena finiscono."}</div>`}
        <div className=${"text-[14px] font-semibold " + C.tx}>Pronostica le prossime</div>
        <div className="space-y-1.5">${prossime.map((m) => { const v = voti[m.id] ?? store.get("voto:" + m.id, null); return html`<div key=${m.id} className="flex items-center gap-2">
          <button onClick=${() => goMatch(m.id)} className="flex-1 min-w-0 text-left"><span className=${"block text-[14px] truncate " + C.tx}>${m.h} - ${m.a}</span><span className=${"block text-[11px] " + C.mu}>${m.date.slice(8)}/${m.date.slice(5, 7)} ${m.time}</span></button>
          ${["1", "X", "2"].map((e, i) => html`<button key=${e} onClick=${() => vota(m, i)} aria-pressed=${v === i} className=${"num w-10 h-9 rounded-[10px] text-[18px] font-bold " + (v === i ? C.on : C.ch + " " + C.tx)}>${e}</button>`)}</div>`; })}</div>
        ${msg && html`<div className=${"text-[12px] " + C.mu}>${msg}</div>`}
        <div className=${"text-[14px] font-semibold pt-1 " + C.tx}>Gruppi di amici</div>
        ${prof.gruppi.length > 0 && html`<div className="flex gap-1.5 flex-wrap">${prof.gruppi.map((g) => html`<button key=${g.code} onClick=${() => { setGr(g.code); store.set("garaGruppo", g.code); }} className=${"px-3 py-1.5 rounded-full text-[13px] font-semibold " + (gr === g.code ? C.seg : C.ch + " " + C.tx)}>${g.nome} (${g.n})</button>`)}</div>`}
        ${cl && cl.righe.length > 0 && html`<div>${cl.righe.map((r, i) => html`<div key=${i} className=${"flex items-center gap-2 py-1.5 border-t first:border-t-0 " + C.bd}>
          <span className=${"num w-6 text-[17px] font-bold " + C.mu}>${i + 1}</span><span className=${"flex-1 text-[14px] " + C.tx + (r.io ? " font-semibold" : "")}>${r.nome}${r.io ? " (tu)" : ""}</span>
          <span className=${"text-[12px] " + C.mu}>${r.giuste}/${r.giocate}</span><span className=${"num w-10 text-right text-[19px] font-bold " + C.tx}>${r.pt}</span></div>`)}</div>`}
        ${gr && html`<button onClick=${() => { const t = "Sfidami ai pronostici su AuraPitch! Apri l'app, vai in Il Mio Club e inserisci il codice gruppo " + gr + "."; if (navigator.share) navigator.share({ text: t }).catch(() => {}); else navigator.clipboard && navigator.clipboard.writeText(t).then(() => setMsg("Invito copiato.")); }}
          className=${"w-full py-2 rounded-xl text-[13px] font-semibold " + C.ch + " " + C.tx}>Invita amici nel gruppo (codice ${gr})</button>`}
        <div className="flex gap-2"><input value=${codice} onChange=${(e) => setCodice(e.target.value.toUpperCase())} placeholder="Nome gruppo o codice" aria-label="Nome del nuovo gruppo o codice di un gruppo" maxLength=${24} className=${"flex-1 min-w-0 rounded-xl px-3 py-2 text-[14px] outline-none " + C.ch + " " + C.tx} />
          <button onClick=${() => api("/gruppo", { chi, azione: "entra", code: codice }).then((x) => { if (x.ok) { setGr(x.code); store.set("garaGruppo", x.code); setCodice(""); carica(); } else setMsg("Codice non trovato."); })} className=${"px-3 rounded-xl text-[13px] font-semibold " + C.ch + " " + C.tx}>Entra</button>
          <button onClick=${() => api("/gruppo", { chi, azione: "crea", nome: codice || "Amici" }).then((x) => { if (x.ok) { setGr(x.code); store.set("garaGruppo", x.code); setCodice(""); carica(); setMsg("Gruppo creato: codice " + x.code + "."); } })} className=${"px-3 rounded-xl text-[13px] font-semibold " + C.on}>Crea</button></div></div>`;
    }
    /* ---- codice personale: preferite, diario e schedina anche su un altro dispositivo ---- */
    function Codice() {
      const { pushUrl, ripristina, syncOn, setSyncOn } = React.useContext(Ctx);
      const [c, setC] = useState("");
      const [msg, setMsg] = useState("");
      if (!pushUrl) return null;
      const attiva = (v) => { setSyncOn(v); store.set("syncOn", v); if (!v) store.set("syncImpr", ""); };
      if (!syncOn) return html`<div className=${C.card + " p-4 space-y-2"}>
        <div className=${C.lab}>Usa AuraPitch su un altro dispositivo</div>
        <p className=${"text-[13px] " + C.mu}>Ora i tuoi dati (preferite, squadra del cuore, diario, schedina) restano solo su questo telefono. Se vuoi ritrovarli su un altro dispositivo, puoi salvarne una copia sul servizio AuraPitch, protetta da un codice personale.</p>
        <button onClick=${() => attiva(true)} className=${"w-full py-2.5 rounded-xl text-[14px] font-semibold " + C.on}>Salva i miei dati sul servizio AuraPitch</button></div>`;
      const chi = codiceChi();
      return html`<div className=${C.card + " p-4 space-y-2"}>
        <div className=${C.lab}>Usa AuraPitch su un altro dispositivo</div>
        <p className=${"text-[13px] " + C.mu}>Una copia dei tuoi dati (preferite, squadra del cuore, diario, schedina) è salvata sul servizio AuraPitch con questo codice personale. Tienilo per te: chi lo conosce può vedere e cambiare i tuoi dati.</p>
        <div className="flex items-center gap-2"><span className=${"num flex-1 text-[22px] font-bold tracking-[0.06em] " + C.tx}>${chi}</span>
          <button onClick=${() => navigator.clipboard && navigator.clipboard.writeText(chi).then(() => setMsg("Codice copiato."))} className=${"px-3 py-1.5 rounded-full text-[13px] font-semibold " + C.ch + " " + C.tx}>Copia</button></div>
        <div className="flex gap-2"><input value=${c} onChange=${(e) => setC(e.target.value.trim().toLowerCase())} placeholder="Codice dell'altro dispositivo" aria-label="Codice dell'altro dispositivo" className=${"flex-1 min-w-0 rounded-xl px-3 py-2 text-[14px] outline-none " + C.ch + " " + C.tx} />
          <button disabled=${c.length < 8} onClick=${() => { if (!window.confirm("Vuoi portare su questo telefono i dati dell'altro dispositivo? Preferite e schedina verranno sostituite, il diario verrà unito.")) return;
            fetch(pushUrl + "/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chi: c, leggi: 1 }) }).then((r) => r.json()).then((x) => { if (x.ok && x.dati) { store.set("chi", c); store.set("syncImpr", ""); ripristina(x.dati); setMsg("Dati recuperati."); setTimeout(() => location.reload(), 1200); } else setMsg("Nessun dato per questo codice."); }).catch(() => setMsg("Non riesco a collegarmi.")); }}
            className=${"px-3 rounded-xl text-[13px] font-semibold disabled:opacity-50 " + C.on}>Usa</button></div>
        ${msg && html`<div className=${"text-[12px] " + C.mu}>${msg}</div>`}
        <button onClick=${() => attiva(false)} className=${"text-[12px] font-semibold " + C.mu}>Smetti di salvare i dati sul servizio</button></div>`;
    }
    /* ---- la tua settimana: pronostici, gruppo, diario e IA della settimana scorsa ---- */
    function Riepilogo() {
      const { pushUrl, diario, byId, stor } = React.useContext(Ctx);
      const [cl, setCl] = useState(null);
      const chi = store.get("chi", null), gr = store.get("garaGruppo", "");
      useEffect(() => { if (pushUrl && chi) fetch(pushUrl + "/classifica", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chi, gruppo: gr || "", periodo: "scorsa" }) }).then((r) => r.json()).then((x) => x.ok && setCl(x)).catch(() => {}); }, [pushUrl]);
      const lun = new Date(); lun.setHours(0, 0, 0, 0); lun.setDate(lun.getDate() - ((lun.getDay() + 6) % 7)); const da = lun.getTime() - 7 * 86400e3, a = lun.getTime();
      const gioc = diario.filter((x) => x.t >= da && x.t < a), chiuse = gioc.filter((x) => statoGiocata(x, byId) !== "aperta");
      const resa = chiuse.reduce((s0, x) => s0 + (statoGiocata(x, byId) === "vinta" ? x.imp * x.q : 0) - x.imp, 0);
      const ia = stor ? stor.lista.filter((v) => { const t = new Date(v.date + "T12:00:00").getTime(); return t >= da && t < a; }) : [];
      const iaOk = ia.filter((v) => v.esiti && v.esiti.consiglio).length, iaN = ia.filter((v) => v.esiti && "consiglio" in v.esiti).length;
      const io = cl && cl.io, pos = cl && cl.righe.findIndex((r) => r.io);
      const righe = [];
      if (io && io.giocate) righe.push(`Hai indovinato ${io.giuste} pronostici su ${io.giocate} (${io.pt} punti); l'IA ${io.ia} su ${io.iaG}.`);
      if (cl && cl.righe.length > 1 && pos >= 0) righe.push(`Nel tuo gruppo sei arrivato ${pos + 1}° su ${cl.righe.length}.`);
      if (chiuse.length) righe.push(`Diario: ${chiuse.length} giocate chiuse, resa ${(resa >= 0 ? "+" : "") + resa.toLocaleString("it-IT", { style: "currency", currency: "EUR" })}.`);
      if (iaN) righe.push(`Il consiglio principale dell'IA è passato ${iaOk} volte su ${iaN}.`);
      if (!righe.length) return null;
      return html`<div className=${C.card + " p-4"}><div className=${"text-[12px] font-semibold " + C.acc}>La tua settimana</div>
        <div className=${C.lab + " mt-0.5 mb-2"}>Com'è andata</div>
        <div className="space-y-2">${righe.map((t, i) => html`<div key=${i} className=${"text-[15px] leading-snug " + C.tx}>${t}</div>`)}</div></div>`;
    }
    /* ---- medaglie: piccoli traguardi, calcolati sul telefono ---- */
    function Medaglie() {
      const { diario, byId, favM, pushUrl } = React.useContext(Ctx);
      const [cl, setCl] = useState(null);
      const chi = store.get("chi", null);
      useEffect(() => { if (pushUrl && chi) fetch(pushUrl + "/classifica", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chi, periodo: "tutto" }) }).then((r) => r.json()).then((x) => x.ok && setCl(x)).catch(() => {}); }, [pushUrl]);
      const io = (cl && cl.io) || { giocate: 0, giuste: 0, ia: 0, iaG: 0, pt: 0 };
      const vinte = diario.filter((x) => statoGiocata(x, byId) === "vinta").length;
      const L = [
        ["Primo pronostico", "Fai un pronostico nella gara", io.giocate >= 1],
        ["Pronostici da 10", "10 pronostici giocati", io.giocate >= 10],
        ["Occhio fino", "10 pronostici indovinati", io.giuste >= 10],
        ["Meglio dell'IA", "Indovina più dell'IA su almeno 10 partite", io.giocate >= 10 && io.giuste > io.ia],
        ["Cinquanta punti", "Arriva a 50 punti nella gara", io.pt >= 50],
        ["In gruppo", "Entra o crea un gruppo di amici", !!store.get("garaGruppo", "")],
        ["Prima schedina", "Segna una schedina nel diario", diario.length >= 1],
        ["Schedina vinta", "Vinci una schedina del diario", vinte >= 1],
        ["Cinque vittorie", "5 schedine vinte nel diario", vinte >= 5],
        ["Tifoso attento", "Segui 5 partite con la stella", favM.length >= 5],
      ];
      const fatte = L.filter((x) => x[2]).length;
      return html`<div className=${C.card + " p-4"}>
        <div className="flex items-baseline mb-3"><span className=${C.lab + " flex-1"}>Medaglie</span><span className=${"num text-[18px] font-bold " + C.mu}>${fatte}/${L.length}</span></div>
        <div className="grid grid-cols-5 gap-2">${L.map(([n, d, ok]) => html`<div key=${n} title=${n + ": " + d} className="flex flex-col items-center text-center gap-1">
          <span className=${"w-11 h-11 rounded-full flex items-center justify-center " + (ok ? "bg-[#5B2EE6] text-white dark:bg-[#A58BFF] dark:text-[#0E0C18]" : C.ch + " " + C.mu)} style=${ok ? { boxShadow: "0 6px 16px -6px #7B5CFF" } : null}>${ok ? html`<${Ic.Crown} size=${18} />` : html`<${Ic.Lock} size=${14} />`}</span>
          <span className=${"text-[10px] leading-tight " + (ok ? C.tx + " font-semibold" : C.mu)}>${n}</span></div>`)}</div>
        <p className=${"text-[12px] mt-3 " + C.mu}>Prossima: ${(L.find((x) => !x[2]) || ["", "le hai tutte!"])[1]}.</p></div>`;
    }
    function ClubView() {
      const { D, lg, fav, setFav, setTeam, favLeagues } = React.useContext(Ctx);
      const lgK = Object.keys(D.standings).find((k) => D.standings[k].generale.some((r) => r.team === fav));
      const L = lgK && lg(lgK);
      const pos = lgK ? D.standings[lgK].generale.findIndex((r) => r.team === fav) + 1 : 0;
      const row = lgK && D.standings[lgK].generale[pos - 1];
      const m = D.matches.find((x) => x.h === fav || x.a === fav);
      const { caricaDettagli } = React.useContext(Ctx);
      useEffect(() => { if (m && caricaDettagli) caricaDettagli(m.id); }, [m && m.id]);
      const l5 = m && m.last5 ? m.last5[m.h === fav ? 0 : 1] : [];
      return html`<div className="px-4 space-y-3"><${Schede} id="club" items=${["La mia squadra", "Gara", "Traguardi", "Account"]}>${[html`<${React.Fragment}>
        <div className=${C.card + " p-4"}><div className="flex items-center gap-3">${fav ? html`<${Crest} t=${fav} size=${52} />` : html`<span className=${"w-[52px] h-[52px] rounded-full flex items-center justify-center " + C.ch + " " + C.mu}><${Ic.Shield} size=${24} /></span>`}
          <div className="flex-1 min-w-0"><div className=${"text-xs " + C.mu}>Squadra del cuore</div><div className=${(fav ? "text-xl " : "text-[15px] ") + "font-semibold truncate " + C.tx}>${fav || "Scegline una qui sotto"}</div>
            ${L && html`<div className=${"text-xs flex items-center gap-1.5 " + C.mu}><${Flag} k=${L.flag} w=${14} />${L.name} - ${pos}° con ${row.pt} punti</div>`}</div></div>
          ${l5.length > 0 && html`<div className="mt-4"><div className=${C.lab + " mb-1.5"}>Ultime 5</div><${Form} list=${l5} /></div>`}
          ${fav && D.matches.some((x) => x.st === "NS" && (x.h === fav || x.a === fav)) && html`<button onClick=${() => scaricaCalendario(D.matches.filter((x) => x.st === "NS" && (x.h === fav || x.a === fav)), lg, "partite-" + fav.replace(/[^\w-]+/g, "-"))}
            className=${"mt-3 w-full py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5 " + C.ch + " " + C.tx}><${Ic.Calendar} size=${15} />Prossime partite nel calendario</button>`}
          ${lgK && ESPN_LG[lgK] && html`<button onClick=${() => setTeam({ lgE: ESPN_LG[lgK], name: fav })} className=${"mt-4 w-full py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5 " + C.ch + " " + C.tx}>Calendario, risultati e rosa<${Ic.ChevronRight} size=${15} /></button>`}</div>
        ${m ? html`<div className=${C.lab}>Partita della giornata</div><div className=${C.card + " overflow-hidden"}><${Row} m=${m} i=${0} /></div>`
          : fav ? html`<div className=${C.card + " p-4 text-sm " + C.mu}>${fav} non gioca in questa giornata.</div>` : null}
        <div className=${C.card + " p-4 space-y-2"}><label htmlFor="fav" className=${C.lab}>${fav ? "Cambia squadra" : "Squadra del cuore"}</label>
          <select id="fav" value=${fav} onChange=${(e) => { setFav(e.target.value); store.set("fav", e.target.value); }} className=${"w-full rounded-xl px-3 py-2 text-sm " + C.ch + " " + C.tx}>
            ${!fav && html`<option value="">Scegli...</option>`}${gruppiSquadre(D, favLeagues || []).map((g) => html`<optgroup key=${g.k} label=${g.nome}>${g.nomi.map((t) => html`<option key=${t} value=${t}>${t}</option>`)}</optgroup>`)}</select></div><//>`,
        html`<${Gara} />`,
        html`<${React.Fragment}><${Riepilogo} /><${Medaglie} /><//>`,
        html`<${React.Fragment}><${Codice} /><${GiocoResponsabile} /><//>`]}<//></div>`;
    }

export { codiceChi, Gara, Codice, Riepilogo, Medaglie, ClubView };
