/* AuraPitch - fiducia: account (Google e passkey), benvenuto con 18+ e consensi, privacy e termini, recensioni, pannello beta.
   Le scelte di sicurezza sono spiegate in worker/accesso.js; qui c'e solo cio che serve al telefono. */
import React, { useState, useEffect, useRef } from "react";
import { C, Ic, Marchio, Sheet, TONE, html, store } from "./base.js";
import { conta, giorniUso, statAttive } from "./statistiche.js";
import { AGGIORNATA, VERSIONE, privacy, sicurezza, termini } from "./legale.js";

const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (s) => { s = s.replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "="; return Uint8Array.from(atob(s), (c) => c.charCodeAt(0)); };
const IOS = typeof navigator !== "undefined" && /iPhone|iPad|iPod/.test(navigator.userAgent);
const ANDROID = typeof navigator !== "undefined" && /Android/.test(navigator.userAgent);
export const NOME_PASSKEY = IOS ? "Face ID" : ANDROID ? "impronta" : "passkey";
const VERS_APP = "beta-2026.10";

export function codiceChi() {
  let chi = store.get("chi", null);
  if (!chi) { chi = Array.from(crypto.getRandomValues(new Uint8Array(20)), (b) => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36]).join(""); store.set("chi", chi); }
  return chi;
}

async function chiama(url, path, body) {
  const t = store.get("sess", null);
  const r = await fetch(url + path, { method: body === undefined ? "GET" : "POST", headers: { "Content-Type": "application/json", ...(t ? { Authorization: "Bearer " + t } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const j = await r.json().catch(() => ({ ok: false, err: "risposta non valida" }));
  if (r.status === 401 && t && path.startsWith("/account/")) store.set("sess", null);
  return { ...j, st: r.status };
}

/* ---------- stato dell'account (usato da tutta l'app tramite il contesto) ---------- */
export function useAccount(pushUrl, { ripristina, setSyncOn, flash }) {
  const [acc, setAcc] = useState(undefined); // undefined = non so ancora, null = fuori
  const [google, setGoogle] = useState(null); // identificativo dell'app Google (pubblico) o null se non configurato
  const entrato = async (r, metodo) => {
    store.set("sess", r.token);
    setAcc(r.account);
    conta(metodo === "google" ? "accesso_google" : "accesso_passkey");
    if (r.nuovo) conta("account_nuovo");
    // il codice personale dell'account vale su ogni telefono: se e diverso da quello di qui, si portano i dati dell'account
    const mio = store.get("chi", null);
    if (r.account.chi && r.account.chi !== mio) {
      store.set("chi", r.account.chi);
      store.set("syncImpr", "");
      const x = await fetch(pushUrl + "/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chi: r.account.chi, leggi: 1 }) }).then((z) => z.json()).catch(() => null);
      if (x && x.dati) ripristina(x.dati);
    }
    store.set("syncOn", true);
    setSyncOn(true);
    flash(r.nuovo ? "Account creato: i tuoi dati ora ti seguono su ogni telefono" : "Bentornato: sei dentro");
  };
  useEffect(() => {
    if (!pushUrl) return;
    chiama(pushUrl, "/auth/config").then((x) => setGoogle(x.google || null)).catch(() => {});
    if (store.get("sess", null)) chiama(pushUrl, "/account/io", {}).then((x) => setAcc(x.ok ? x.account : null)).catch(() => setAcc(null));
    else setAcc(null);
  }, [pushUrl]);
  // ritiro dell'accesso confermato da Google in un'altra finestra
  useEffect(() => {
    if (!pushUrl) return;
    let fermo = false, timer = null;
    const prova = async () => {
      const g = store.get("gAttesa", null);
      if (fermo || !g) return;
      if (Date.now() - g.t > 10 * 60 * 1000) { store.set("gAttesa", null); return; }
      if (document.visibilityState === "visible") {
        const r = await chiama(pushUrl, "/auth/ritira", { sfida: g.sfida, ritiro: g.ritiro, chi: codiceChi() }).catch(() => null);
        if (r && r.ok && r.pronto) { store.set("gAttesa", null); await entrato(r, "google"); return; }
        if (r && r.st === 403) { store.set("gAttesa", null); return; }
      }
      timer = setTimeout(prova, 2500);
    };
    const sveglia = () => { if (document.visibilityState === "visible") { clearTimeout(timer); prova(); } };
    window.addEventListener("ap-google", sveglia);
    document.addEventListener("visibilitychange", sveglia);
    prova();
    return () => { fermo = true; clearTimeout(timer); window.removeEventListener("ap-google", sveglia); document.removeEventListener("visibilitychange", sveglia); };
  }, [pushUrl]);
  return { acc, setAcc, google, entrato, chiama: (p, b) => chiama(pushUrl, p, b) };
}

/* ---------- foglio con privacy o termini ---------- */
export function Legale({ tipo, onClose }) {
  const sez = tipo === "termini" ? termini() : tipo === "sicurezza" ? sicurezza() : privacy();
  return html`<${Sheet} title=${tipo === "termini" ? "Termini d'uso" : tipo === "sicurezza" ? "Come ti proteggiamo" : "Privacy"} onClose=${onClose}>
    <p className=${"text-[12px] " + C.mu}>Versione ${VERSIONE}, aggiornata il ${AGGIORNATA}</p>
    ${sez.map(([t, ps]) => html`<section key=${t} className="space-y-1.5"><h3 className=${"text-[15px] font-semibold " + C.tx}>${t}</h3>
      ${ps.map((x, i) => html`<p key=${i} className=${"text-[14px] leading-relaxed " + C.mu}>${x}</p>`)}</section>`)}<//>`;
}

/* ---------- benvenuto: 18+, termini e privacy, statistiche anonime ---------- */
export function Benvenuto({ onFine }) {
  const [eta, setEta] = useState(false), [ok, setOk] = useState(false), [stat, setStat] = useState(statAttive());
  const [leggi, setLeggi] = useState(null);
  const Spunta = ({ v, set, children, id }) => html`<label htmlFor=${id} className=${"flex items-start gap-3 rounded-2xl p-3.5 cursor-pointer " + C.card}>
    <input id=${id} type="checkbox" checked=${v} onChange=${(e) => set(e.target.checked)} className="mt-0.5 w-5 h-5 accent-[#5B2EE6] shrink-0" />
    <span className=${"text-[15px] leading-snug " + C.tx}>${children}</span></label>`;
  const punti = [[Ic.Shield, "Niente pubblicità e niente profilazione", "Non vendiamo dati e non usiamo tracciamenti di terzi."],
    [Ic.Smartphone, "I tuoi dati restano sul telefono", "L'account è facoltativo: serve solo a ritrovarli su altri dispositivi."],
    [Ic.Lock, "Nessuna password, nessuna email", `Si entra con Google (senza email) o con ${NOME_PASSKEY}.`]];
  return html`<div className="fixed inset-0 z-[70] overflow-y-auto" style=${{ background: "var(--bg)", paddingTop: "env(safe-area-inset-top, 0px)" }}>
    <div className="max-w-[480px] mx-auto px-5 pt-8 pb-16 space-y-5">
      <div className="flex items-center gap-3"><${Marchio} size=${40} /><span className=${"num text-[30px] font-extrabold " + C.tx}>AuraPitch</span></div>
      <div><div className=${"text-[26px] font-bold leading-tight tracking-[-0.02em] " + C.tx}>Benvenuto nella beta</div>
        <p className=${"text-[15px] mt-1.5 " + C.mu}>Prima di entrare, tre cose su come trattiamo i tuoi dati.</p></div>
      <div className="space-y-2.5">${punti.map(([I, t, s]) => html`<div key=${t} className="flex gap-3 items-start">
        <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-[#5B2EE6]/10 text-[#5B2EE6] dark:bg-[#A58BFF]/15 dark:text-[#A58BFF]"><${I} size=${17} /></span>
        <span><span className=${"block text-[15px] font-semibold " + C.tx}>${t}</span><span className=${"block text-[13px] " + C.mu}>${s}</span></span></div>`)}</div>
      <button onClick=${() => setLeggi("sicurezza")} className=${"w-full flex items-center gap-3 rounded-2xl p-3 text-left border border-emerald-500/30 bg-emerald-500/[0.07]"}>
        <${Ic.ShieldCheck} size=${20} className="text-emerald-600 dark:text-emerald-300 shrink-0" />
        <span className="flex-1"><span className=${"block text-[14px] font-semibold " + C.tx}>Protetto fin dal primo giorno</span><span className=${"block text-[12px] " + C.mu}>Collegamenti cifrati · niente password · dati eliminabili in un tocco</span></span>
        <${Ic.ChevronRight} size=${16} className=${C.mu} /></button>
      <div className="space-y-2">
        <${Spunta} id="eta" v=${eta} set=${setEta}>Ho almeno <b>18 anni</b></${Spunta}>
        <${Spunta} id="acc" v=${ok} set=${setOk}>Ho letto e accetto i <button type="button" onClick=${(e) => { e.preventDefault(); setLeggi("termini"); }} className=${"underline font-semibold " + C.acc}>Termini d'uso</button> e la <button type="button" onClick=${(e) => { e.preventDefault(); setLeggi("privacy"); }} className=${"underline font-semibold " + C.acc}>Privacy</button></${Spunta}>
        <${Spunta} id="stat" v=${stat} set=${setStat}>Statistiche d'uso anonime <span className=${"block text-[13px] " + C.mu}>Solo conteggi del giorno, senza nulla che ti identifichi. Ci aiutano a capire cosa migliorare. Facoltative.</span></${Spunta}>
      </div>
      <button disabled=${!eta || !ok} onClick=${() => { store.set("statNo", !stat); store.set("consenso", { v: VERSIONE, t: Date.now() }); onFine(); }}
        className=${"w-full py-3.5 rounded-2xl text-[16px] font-bold disabled:opacity-40 " + C.on}>Entra</button>
      <p className=${"text-[12px] text-center " + C.mu}>Il gioco può causare dipendenza. Telefono Verde Nazionale 800 55 88 22, gratuito e anonimo.</p>
    </div>
    ${leggi && html`<${Legale} tipo=${leggi} onClose=${() => setLeggi(null)} />`}</div>`;
}

/* ---------- account: entra, crea, gestisci, esporta, elimina ---------- */
export function AccountCard({ A, pushUrl, compatta }) {
  const [msg, setMsg] = useState("");
  const [lavoro, setLavoro] = useState("");
  const [conf, setConf] = useState(false);
  const [admin, setAdmin] = useState(false), [codice, setCodice] = useState("");
  const [pk, setPk] = useState(false);
  const [legale, setLegale] = useState(null);
  const pronta = useRef(null);
  useEffect(() => { try { if (window.PublicKeyCredential && PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable) PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable().then(setPk).catch(() => {}); } catch (e) { /* niente passkey */ } }, []);
  // la sfida per Google si prepara prima del tocco: cosi la finestra di Google si apre subito (i browser bloccano quelle aperte dopo un'attesa)
  useEffect(() => {
    if (!A.google || A.acc === undefined) return;
    let fermo = false;
    const prepara = () => A.chiama("/auth/sfida", { tipo: "google" }).then((x) => { if (!fermo && x.ok) pronta.current = { sfida: x.sfida, ritiro: x.ritiro, t: Date.now() }; }).catch(() => {});
    prepara();
    const id = setInterval(prepara, 8 * 60 * 1000);
    return () => { fermo = true; clearInterval(id); };
  }, [A.google, A.acc && A.acc.google]);
  if (!pushUrl || A.acc === undefined) return null;
  const errore = (e) => setMsg(e && e.name === "NotAllowedError" ? "Operazione annullata." : e && e.name === "InvalidStateError" ? `Su questo telefono c'è già una ${NOME_PASSKEY} per AuraPitch: usa "Entra con ${NOME_PASSKEY}".` : "Non è andata: " + ((e && (e.err || e.message)) || "riprova"));
  const google = () => {
    const p = pronta.current;
    if (!A.google) return setMsg("L'accesso con Google è in attivazione: intanto puoi usare " + NOME_PASSKEY + ".");
    if (!p) return setMsg("Un attimo, sto preparando l'accesso: riprova tra un secondo.");
    pronta.current = null;
    store.set("gAttesa", p);
    const ritorno = new URL("accesso.html", location.href).href;
    const u = "https://accounts.google.com/o/oauth2/v2/auth?" + new URLSearchParams({ client_id: A.google, redirect_uri: ritorno, response_type: "id_token", scope: "openid", nonce: p.sfida, state: p.sfida, prompt: "select_account" });
    setMsg("Completa l'accesso nella finestra di Google, poi torna qui.");
    const w = window.open(u, "_blank");
    if (!w) location.href = u;
    setTimeout(() => window.dispatchEvent(new Event("ap-google")), 3000);
  };
  const creaPasskey = async () => {
    setMsg(""); setLavoro("pk");
    try {
      const sf = await A.chiama("/auth/sfida", { tipo: "registra" });
      if (!sf.ok) throw sf;
      const cred = await navigator.credentials.create({ publicKey: {
        challenge: unb64u(sf.sfida), rp: { name: "AuraPitch", id: sf.rp }, user: { id: unb64u(sf.aid), name: "AuraPitch", displayName: "Il tuo account AuraPitch" },
        pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }], timeout: 120000, attestation: "none",
        authenticatorSelection: { residentKey: "required", requireResidentKey: true, userVerification: "required" } } });
      const r = cred.response;
      const x = await A.chiama("/auth/passkey/registra", { sfida: sf.sfida, id: cred.id, clientDataJSON: b64u(r.clientDataJSON), authenticatorData: b64u(r.getAuthenticatorData()),
        publicKey: b64u(r.getPublicKey()), alg: r.getPublicKeyAlgorithm(), chi: codiceChi(), nome: IOS ? "iPhone" : ANDROID ? "Android" : "Computer" });
      if (!x.ok) throw x;
      if (A.acc) { A.setAcc(x.account); setMsg(NOME_PASSKEY + " aggiunto."); } else await A.entrato(x, "passkey");
    } catch (e) { errore(e); } finally { setLavoro(""); }
  };
  const entraPasskey = async () => {
    setMsg(""); setLavoro("in");
    try {
      const sf = await A.chiama("/auth/sfida", { tipo: "accedi" });
      if (!sf.ok) throw sf;
      const cred = await navigator.credentials.get({ publicKey: { challenge: unb64u(sf.sfida), rpId: sf.rp, userVerification: "required", timeout: 120000 } });
      const r = cred.response;
      const x = await A.chiama("/auth/passkey/accedi", { sfida: sf.sfida, id: cred.id, clientDataJSON: b64u(r.clientDataJSON), authenticatorData: b64u(r.authenticatorData), signature: b64u(r.signature) });
      if (!x.ok) throw x;
      await A.entrato(x, "passkey");
    } catch (e) { errore(e); } finally { setLavoro(""); }
  };
  const esporta = async () => {
    const x = await A.chiama("/account/esporta", {});
    if (!x.ok) return setMsg(x.err || "Non riesco a scaricare i dati.");
    delete x.st; delete x.ok;
    const locali = {};
    try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith("ap:") && !["ap:sess", "ap:gAttesa"].includes(k)) locali[k.slice(3)] = JSON.parse(localStorage.getItem(k)); } } catch (e) { /* niente */ }
    const blob = new Blob([JSON.stringify({ ...x, dati_su_questo_telefono: locali }, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "aurapitch-i-miei-dati.json"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    setMsg("File scaricato: contiene tutto quello che sappiamo di te.");
  };
  const esci = async (ovunque) => { await A.chiama(ovunque ? "/account/esci-ovunque" : "/account/esci", {}).catch(() => {}); store.set("sess", null); A.setAcc(null); setMsg(ovunque ? "Uscito da tutti i dispositivi." : "Sei uscito. I dati restano su questo telefono."); };
  const elimina = async () => {
    const x = await A.chiama("/account/elimina", { conferma: "ELIMINA" });
    if (!x.ok) return setMsg(x.err || "Eliminazione non riuscita, riprova.");
    for (const k of ["sess", "chi", "syncOn", "syncImpr", "garaGruppo"]) store.set(k, null);
    A.setAcc(null); setConf(false);
    setMsg("Account eliminato: sul servizio AuraPitch non resta nulla di tuo.");
  };
  const cancellaTelefono = () => {
    if (!window.confirm("Cancellare tutti i dati di AuraPitch da questo telefono (preferite, diario, schedina, impostazioni)?")) return;
    try { Object.keys(localStorage).filter((k) => k.startsWith("ap:")).forEach((k) => localStorage.removeItem(k)); } catch (e) { /* niente */ }
    location.reload();
  };
  const Bott = ({ onClick, children, tono = C.ch + " " + C.tx, dis }) => html`<button disabled=${dis} onClick=${onClick} className=${"w-full py-2.5 rounded-xl text-[14px] font-semibold disabled:opacity-50 " + tono}>${children}</button>`;
  const a = A.acc;
  return html`<div className=${C.card + " p-4 space-y-2.5"}>
    <div className="flex items-center gap-2"><span className=${C.lab + " flex-1"}>${a ? "Il tuo account" : "Account (facoltativo)"}</span>${a && html`<span className=${"text-[11px] font-semibold px-2 py-0.5 rounded-full border " + TONE.good}>attivo</span>`}</div>
    ${!a ? html`<${React.Fragment}>
        <p className=${"text-[13px] " + C.mu}>Ritrovi preferite, diario, schedina e gara su ogni telefono. Niente email, niente password.</p>
        <${Bott} onClick=${google} tono=${"bg-white text-[#1F1F1F] border border-black/15 dark:bg-[#F4F2FF] dark:text-[#17152B]"}>Continua con Google</${Bott}>
        ${pk && html`<${Bott} onClick=${entraPasskey} dis=${!!lavoro} tono=${C.on}>${lavoro === "in" ? "Attendi..." : "Entra con " + NOME_PASSKEY}</${Bott}>
          <${Bott} onClick=${creaPasskey} dis=${!!lavoro}>${lavoro === "pk" ? "Attendi..." : "Crea account con " + NOME_PASSKEY}</${Bott}>`}
        <p className=${"text-[11px] " + C.mu}>Da Google riceviamo solo un identificativo anonimo, non la tua email. Con ${NOME_PASSKEY} il volto o l'impronta restano nel telefono. <button onClick=${() => setLegale("sicurezza")} className=${"underline " + C.acc}>Come ti proteggiamo</button></p><//>`
      : html`<${React.Fragment}>
        <div className="flex flex-wrap gap-1.5">
          ${a.google && html`<span className=${"text-[12px] font-semibold px-2.5 py-1 rounded-full " + C.ch + " " + C.tx}>Google</span>`}
          ${(a.passkey || []).map((p) => html`<span key=${p.id} className=${"text-[12px] font-semibold px-2.5 py-1 rounded-full " + C.ch + " " + C.tx}>${NOME_PASSKEY} · ${p.nome || "dispositivo"}</span>`)}
        </div>
        <p className=${"text-[12px] " + C.mu}>Dal ${new Date(a.creato).toLocaleDateString("it-IT")} · preferite, diario, schedina e gara si salvano da soli.</p>
        ${!compatta && html`<${React.Fragment}>
          ${pk && html`<${Bott} onClick=${creaPasskey} dis=${!!lavoro}>Aggiungi ${NOME_PASSKEY} di questo telefono</${Bott}>`}
          ${!a.google && A.google && html`<${Bott} onClick=${google}>Collega anche Google</${Bott}>`}
          <${Bott} onClick=${esporta}>Scarica i miei dati</${Bott}>
          <div className="grid grid-cols-2 gap-2"><${Bott} onClick=${() => esci(false)}>Esci</${Bott}><${Bott} onClick=${() => esci(true)}>Esci ovunque</${Bott}></div>
          ${!conf ? html`<button onClick=${() => setConf(true)} className="w-full py-2 text-[13px] font-semibold text-rose-600 dark:text-rose-300">Elimina account</button>`
            : html`<div className=${"rounded-xl border p-3 space-y-2 " + TONE.bad}><div className="text-[13px]">Cancelliamo subito e per sempre account, accessi, gara dei pronostici e copia dei dati. Non si può annullare.</div>
              <div className="grid grid-cols-2 gap-2"><${Bott} onClick=${() => setConf(false)}>Annulla</${Bott}><${Bott} onClick=${elimina} tono="bg-rose-600 text-white">Sì, elimina</${Bott}></div></div>`}
          ${!a.admin && html`${!admin ? html`<button onClick=${() => setAdmin(true)} className=${"w-full text-[11px] " + C.mu}>Sei l'amministratore della beta?</button>`
            : html`<div className="flex gap-2"><input type="password" value=${codice} onChange=${(e) => setCodice(e.target.value)} placeholder="Codice amministratore" aria-label="Codice amministratore" autoComplete="off" className=${"flex-1 min-w-0 rounded-xl px-3 py-2 text-[14px] outline-none " + C.ch + " " + C.tx} />
              <button onClick=${async () => { const x = await A.chiama("/admin/rivendica", { codice }); setCodice(""); if (x.ok) { A.setAcc(x.account); setAdmin(false); setMsg("Ora sei l'amministratore: trovi il Pannello beta nel Profilo."); } else setMsg(x.err || "Codice errato."); }} className=${"px-3 rounded-xl text-[13px] font-semibold " + C.on}>Ok</button></div>`}`}<//>`}<//>`}
    ${msg && html`<div role="status" className=${"text-[13px] " + C.tx}>${msg}</div>`}
    ${!compatta && html`<button onClick=${cancellaTelefono} className=${"w-full text-[12px] pt-1 " + C.mu}>Cancella i dati di AuraPitch da questo telefono</button>`}
    ${legale && html`<${Legale} tipo=${legale} onClose=${() => setLegale(null)} />`}</div>`;
}

/* ---------- recensioni ---------- */
function Stelle({ v, set }) {
  return html`<div className="flex gap-1.5 justify-center" role="radiogroup" aria-label="Voto da 1 a 5">${[1, 2, 3, 4, 5].map((n) => html`
    <button key=${n} role="radio" aria-checked=${v === n} aria-label=${n + " su 5"} onClick=${() => set(n)} className="p-1">
      <svg width="34" height="34" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8l2.75 5.6 6.15.9-4.45 4.33 1.05 6.12L12 16.87l-5.5 2.88 1.05-6.12L3.1 9.3l6.15-.9z"
        className=${n <= v ? "fill-[#5B2EE6] dark:fill-[#A58BFF] stroke-[#5B2EE6] dark:stroke-[#A58BFF]" : "fill-transparent stroke-[#5F5B76]/50 dark:stroke-[#9A95B3]/50"} strokeWidth="1.4" strokeLinejoin="round" /></svg></button>`)}</div>`;
}
export function Recensione({ pushUrl, dove, onClose }) {
  const [voto, setVoto] = useState(0), [tipo, setTipo] = useState("idea"), [testo, setTesto] = useState(""), [stato, setStato] = useState("");
  const invia = async () => {
    setStato("invio");
    const r = await fetch(pushUrl + "/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ voto: voto || null, tipo, testo, dove, v: VERS_APP }) }).then((x) => x.json()).catch(() => ({ ok: false, err: "nessuna connessione" }));
    if (r.ok) { setStato("ok"); store.set("recFatta", Date.now()); conta("recensione"); } else setStato(r.err || "errore");
  };
  return html`<${Sheet} title="Dicci cosa ne pensi" onClose=${onClose}>
    ${stato === "ok" ? html`<div className="text-center space-y-2 py-4"><div className=${"text-[18px] font-semibold " + C.tx}>Grazie!</div><p className=${"text-[14px] " + C.mu}>Leggiamo tutto: ogni messaggio aiuta a migliorare AuraPitch.</p>
      <button onClick=${onClose} className=${"w-full py-2.5 rounded-xl text-[14px] font-semibold " + C.on}>Chiudi</button></div>`
    : html`<${React.Fragment}>
      <p className=${"text-[14px] " + C.mu}>Come ti trovi con AuraPitch?</p>
      <${Stelle} v=${voto} set=${setVoto} />
      <div className="flex gap-1.5">${[["idea", "Un'idea"], ["problema", "Un problema"], ["altro", "Altro"]].map(([k, l]) => html`<button key=${k} onClick=${() => setTipo(k)} aria-pressed=${tipo === k}
        className=${"flex-1 py-2 rounded-full text-[13px] font-semibold " + (tipo === k ? C.seg : C.ch + " " + C.tx)}>${l}</button>`)}</div>
      <textarea value=${testo} onChange=${(e) => setTesto(e.target.value.slice(0, 1500))} rows=${5} placeholder=${tipo === "problema" ? "Cosa non funziona? In quale schermata?" : "Cosa ti piace, cosa cambieresti, cosa manca?"}
        aria-label="Il tuo messaggio" className=${"w-full rounded-xl p-3 text-[15px] outline-none " + C.ch + " " + C.tx}></textarea>
      <p className=${"text-[11px] " + C.mu}>Il messaggio è anonimo: non scrivere email, numeri di telefono o altri dati personali.</p>
      <button disabled=${(!voto && testo.trim().length < 3) || stato === "invio"} onClick=${invia} className=${"w-full py-3 rounded-xl text-[15px] font-bold disabled:opacity-50 " + C.on}>${stato === "invio" ? "Invio..." : "Invia"}</button>
      ${stato && stato !== "invio" && html`<div className=${"text-[13px] text-rose-600 dark:text-rose-300"}>Non inviato: ${stato}.</div>`}<//>`}<//>`;
}
// invito discreto: dal terzo giorno d'uso, una volta sola (poi di nuovo solo dopo 30 giorni se l'hai rimandato)
export function InvitoRecensione({ onApri }) {
  const [via, setVia] = useState(false);
  const fatto = store.get("recFatta", 0), dopo = store.get("recDopo", 0);
  if (via || fatto || giorniUso() < 3 || Date.now() < dopo) return null;
  return html`<div className=${C.card + " p-4 flex items-center gap-3"}>
    <span className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-[#5B2EE6]/10 text-[#5B2EE6] dark:bg-[#A58BFF]/15 dark:text-[#A58BFF]"><${Ic.Sparkles} size=${18} /></span>
    <div className="flex-1 min-w-0"><div className=${"text-[15px] font-semibold " + C.tx}>Ti stai trovando bene?</div><div className=${"text-[13px] " + C.mu}>Dicci la tua in 30 secondi: è una beta, conta molto.</div></div>
    <div className="flex flex-col gap-1 shrink-0"><button onClick=${onApri} className=${"px-3 py-1.5 rounded-full text-[13px] font-semibold " + C.on}>Scrivi</button>
      <button onClick=${() => { store.set("recDopo", Date.now() + 30 * 86400000); setVia(true); }} className=${"text-[12px] " + C.mu}>Più tardi</button></div></div>`;
}

/* ---------- pannello beta: solo per l'amministratore ---------- */
const NOMI_EV = { apertura: "Aperture", nuovo: "Nuovi dispositivi", partita: "Partite aperte", schedina_ia: "Schedine IA", schedina_esito: "Schedine con esito scelto", campionati: "Scheda Campionati", schedina: "Scheda Schedina",
  club: "Scheda Il Mio Club", gara_voto: "Pronostici gara", notifiche_on: "Notifiche attivate", immagine: "Immagini condivise", calendario: "Calendario", accesso_google: "Accessi Google",
  accesso_passkey: "Accessi passkey", account_nuovo: "Account nuovi", recensione: "Recensioni", condividi: "Condivisioni", glossario: "Glossario", installata: "Da app installata",
  giorno_1: "Primo giorno", giorno_2_7: "Giorni 2-7", giorno_8_30: "Giorni 8-30", giorno_30p: "Oltre 30 giorni" };
export function PannelloBeta({ A, onClose }) {
  const [R, setR] = useState(null), [err, setErr] = useState("");
  useEffect(() => { A.chiama("/admin/riepilogo").then((x) => (x.ok ? setR(x) : setErr(x.err || "non disponibile"))).catch(() => setErr("nessuna connessione")); }, []);
  const somma = (k) => (R ? R.giorni.reduce((s, g) => s + (g[k] || 0), 0) : 0);
  const max = R ? Math.max(1, ...R.giorni.map((g) => g.apertura || 0)) : 1;
  return html`<${Sheet} title="Pannello beta" onClose=${onClose}>
    ${err ? html`<p className=${"text-[14px] " + C.mu}>${err}</p>` : !R ? html`<p className=${"text-[14px] " + C.mu}>Carico...</p>` : html`<${React.Fragment}>
      <div className="grid grid-cols-3 gap-2">${[["Account", R.account], ["Notifiche", R.iscrizioni_notifiche], ["Voto medio", R.recensioni.media == null ? "-" : String(R.recensioni.media).replace(".", ",")]].map(([k, v]) => html`
        <div key=${k} className=${"rounded-xl p-2.5 " + C.ch}><div className=${"text-[11px] " + C.mu}>${k}</div><div className=${"num text-[22px] font-bold " + C.tx}>${v}</div></div>`)}</div>
      <div className=${"text-[13px] font-semibold " + C.tx}>Aperture negli ultimi 30 giorni</div>
      <div className="flex items-end gap-[3px] h-20" role="img" aria-label="Aperture al giorno">${R.giorni.map((g) => html`<div key=${g.g} title=${g.g + ": " + (g.apertura || 0)} className="flex-1 rounded-t bg-[#5B2EE6] dark:bg-[#A58BFF]" style=${{ height: Math.max(2, ((g.apertura || 0) / max) * 100) + "%", opacity: g.apertura ? 1 : 0.25 }}></div>`)}</div>
      <div className="space-y-1">${Object.keys(NOMI_EV).filter((k) => somma(k)).map((k) => html`<div key=${k} className=${"flex justify-between text-[13px] border-t pt-1 " + C.bd}><span className=${C.mu}>${NOMI_EV[k]}</span><b className=${"tabular-nums " + C.tx}>${somma(k)}</b></div>`)}</div>
      <div className=${"text-[13px] font-semibold pt-2 " + C.tx}>Recensioni (${R.recensioni.n})</div>
      ${R.recensioni.lista.length === 0 ? html`<p className=${"text-[13px] " + C.mu}>Ancora nessuna recensione.</p>` : R.recensioni.lista.map((f, i) => html`<div key=${i} className=${"rounded-xl p-3 space-y-1 " + C.ch}>
        <div className="flex items-center gap-2 text-[12px]"><b className=${C.tx}>${f.voto ? f.voto + "/5" : "senza voto"}</b><span className=${"px-2 rounded-full border " + (f.tipo === "problema" ? TONE.bad : f.tipo === "idea" ? TONE.info : TONE.ok)}>${f.tipo}</span>
          <span className=${"flex-1 text-right " + C.mu}>${new Date(f.t).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}${f.dove ? " · " + f.dove : ""}</span></div>
        ${f.testo && html`<p className=${"text-[14px] whitespace-pre-wrap " + C.tx}>${f.testo}</p>`}</div>`)}<//>`}<//>`;
}
