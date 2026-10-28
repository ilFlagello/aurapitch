/* AuraPitch - app: stato generale, dati a strati, notifiche, navigazione. */
import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { useLiveScores } from "./live.js";
import { AuraLine, C, Crest, Ctx, Flag, Giorni, Ic, Marchio, Seg, Sheet, TONE, auraCol, hs, html, mmss, store } from "./base.js";
import { LeaguesView } from "./campionati.js";
import { ClubView } from "./club.js";
import { BarraSchedina, Cerca, Glossario, PrimoAvvio, partitaSettimana } from "./extra.js";
import { MatchView, Row, TeamView } from "./partita.js";
import { SlipView } from "./schedina.js";

  /* ---------- app ---------- */
  function App() {
    const [Draw, setD] = useState(null);
    // dati a strati: lista leggera all'avvio, dettagli di una partita quando la apri, mercati di tutte quando apri la Schedina
    const [extra, setExtra] = useState({});
    const [merc, setMerc] = useState(null);
    const inCarico = useRef({});
    const caricaDettagli = (id) => {
      if (!Draw || !Draw.leggera || extra[id] || inCarico.current[id]) return;
      inCarico.current[id] = true;
      fetch("data/m/" + String(id).replace(/[^A-Za-z0-9_-]/g, "_") + ".json").then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
        .then((x) => setExtra((e) => ({ ...e, [id]: x })))
        .catch(() => fetch("data/giornata.json").then((r) => (r.ok ? r.json() : null)).then((d) => d && setD(d)).catch(() => {})) // ripiego: il file completo
        .finally(() => { inCarico.current[id] = false; });
    };
    // mercati per campionato: si scaricano solo quelli dei campionati scelti nella Schedina
    const caricaMercati = (leghe) => {
      if (!Draw || !Draw.leggera) return;
      for (const k of leghe) {
        const c = "merc:" + k;
        if (inCarico.current[c]) continue;
        inCarico.current[c] = true;
        fetch("data/mercati/" + k + ".json").then((r) => (r.ok ? r.json() : fetch("data/mercati.json").then((r2) => r2.json())))
          .then((x) => setMerc((m) => ({ ...(m || {}), ...x }))).catch(() => { inCarico.current[c] = false; });
      }
    };
    const live = useLiveScores(Draw ? Draw.matches : null);
    const D = React.useMemo(() => Draw && { ...Draw, matches: Draw.matches.map((m0) => {
      const x = extra[m0.id];
      const m = !Draw.leggera ? m0 : { ...m0, ...(x && !x.mancano ? x : {}), markets: (x && x.markets) || (merc && merc[m0.id]) || m0.markets, dett: !!(x && !x.mancano) };
      const l = live[m.id];
      if (!l) return m;
      const ok = l.st === "LIVE" || l.st === "FT" || (l.st === "RINV" && m.st !== "FT");
      const g = ok && l.g ? l.g : m.g;
      return { ...m, eid: l.eid, lgE: l.lgE, clock: l.clock, hid: l.hid, aid: l.aid, ...(ok ? { st: l.st, g, res: g ? (g[0] > g[1] ? 0 : g[0] === g[1] ? 1 : 2) : m.res } : {}) };
    }) }, [Draw, live, extra, merc]);
    const [err, setErr] = useState("");
    const [theme, setTheme] = useState(store.get("theme", "system"));
    const [tab, setTab] = useState("partite");
    const [open, setOpen] = useState(null);
    const [mt, setMt] = useState(0);
    const [day, setDay] = useState("all");
    const [liveOnly, setLiveOnly] = useState(0);
    const [openL, setOpenL] = useState(store.get("openL", null));
    const [sub, setSub] = useState(store.get("sub", null));
    const [until, setUntil] = useState(store.get("until", 0));
    const [now, setNow] = useState(Date.now());
    const [ad, setAd] = useState(null);
    const [unlock, setUnlock] = useState(false);
    const [profile, setProfile] = useState(false);
    const [guide, setGuide] = useState(store.get("guideSeen", false) ? 0 : 1);
    const [name, setName] = useState(store.get("name", ""));
    const [fav, setFav] = useState(store.get("fav", ""));
    const [mySlip, setMySlip] = useState(store.get("slip", []));
    const [banner, setBanner] = useState(store.get("banner2", true));
    const [copyText, setCopyText] = useState(null);
    const [toast, setToast] = useState("");
    // senza rete: l'app continua con i dati salvati e lo dice
    const [online, setOnline] = useState(typeof navigator === "undefined" || navigator.onLine !== false);
    useEffect(() => { const su = () => setOnline(true), giu = () => setOnline(false); window.addEventListener("online", su); window.addEventListener("offline", giu); return () => { window.removeEventListener("online", su); window.removeEventListener("offline", giu); }; }, []);
    const [team, setTeam] = useState(null);
    const [stor, setStor] = useState(null);
    const [aff, setAff] = useState(null);
    const [favM, setFavM] = useState(store.get("favM", []));
    const [avvisi, setAvvisi] = useState(store.get("avvisi", true));
    const prev = useRef(null);
    const [pushUrl, setPushUrl] = useState(null);
    const [pushOn, setPushOn] = useState(store.get("push", false));
    const [pushMsg, setPushMsg] = useState("");
    const [askPush, setAskPush] = useState(false);
    const [cerca, setCerca] = useState(false);
    const [gloss, setGloss] = useState(false);
    const [favTeams, setFavTeams0] = useState(store.get("favTeams", []));
    const [favLeagues, setFavLeagues0] = useState(store.get("favLeagues", []));
    const [onb, setOnb] = useState(store.get("onb", false) || store.get("guideSeen", false));
    const setFavTeams = (x) => { setFavTeams0(x); store.set("favTeams", x); };
    const setFavLeagues = (x) => { setFavLeagues0(x); store.set("favLeagues", x); };
    const [tira, setTira] = useState(0);
    const tiraRef = useRef(null);
    const ricarica = () => fetch((Draw && Draw.leggera ? "data/lista.json" : "data/giornata.json") + "?t=" + Date.now(), { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((d) => { if (d) { setExtra({}); setMerc(null); setD(d); setToast("Partite aggiornate"); } }).catch(() => setToast("Nessuna connessione: riprova tra poco"));
    const [diario, setDiario0] = useState(store.get("diario", []));
    const setDiario = (d) => { setDiario0(d); store.set("diario", d); };
    const ripristina = (x) => {
      if (Array.isArray(x.favM)) { setFavM(x.favM); store.set("favM", x.favM); }
      if (x.fav) { setFav(x.fav); store.set("fav", x.fav); }
      if (Array.isArray(x.diario)) { const ids = new Set(x.diario.map((z) => z.id)); setDiario([...diario.filter((z) => !ids.has(z.id)), ...x.diario].sort((a, b) => a.t - b.t)); }
      if (Array.isArray(x.slip)) setMySlip(x.slip);
      if (typeof x.name === "string") { setName(x.name); store.set("name", x.name); }
    };
    // copia dei dati personali sul servizio AuraPitch: solo se l'utente l'ha attivata nel Club (Account), e solo quando i dati cambiano davvero
    const [syncOn, setSyncOn] = useState(store.get("syncOn", false));
    useEffect(() => {
      if (!pushUrl || !syncOn || !store.get("chi", null)) return;
      const dati = { favM, fav, diario, slip: mySlip, name }, impr = String(hs(JSON.stringify(dati)));
      if (store.get("syncImpr", "") === impr) return;
      const id = setTimeout(() => { fetch(pushUrl + "/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chi: store.get("chi", null), dati }) }).then((r) => { if (r.ok) store.set("syncImpr", impr); }).catch(() => {}); }, 15000);
      return () => clearTimeout(id);
    }, [pushUrl, syncOn, favM, fav, diario, mySlip, name]);
    const [pref, setPref] = useState(store.get("pushPref", { formazioni: true, inizio: true, gol: true, rossi: true, intervallo: true, finale: true }));
    const lastFollow = useRef("");

    useEffect(() => {
      fetch("data/push.json").then((r) => (r.ok ? r.json() : null)).then((x) => x && setPushUrl(x.url)).catch(() => {});
      fetch("data/affidabilita.json").then((r) => (r.ok ? r.json() : null)).then(setAff).catch(() => {});
      fetch("data/storico.json").then((r) => (r.ok ? r.json() : null)).then(setStor).catch(() => {});
      fetch("data/lista.json").then((r) => (r.ok ? r.json() : fetch("data/giornata.json").then((r2) => { if (!r2.ok) throw new Error(r2.status); return r2.json(); }))).then((d) => { setD(d); if (d.today && (d.days || []).some((x) => x.k === d.today)) setDay(d.today); })
        .catch(() => setErr("Non riesco a leggere i dati delle partite. Controlla la connessione e ricarica la pagina."));
      try { if ("serviceWorker" in navigator && window.top === window.self) navigator.serviceWorker.register("sw.js").catch(() => {}); } catch (e) { /* non installabile qui */ }
    }, []);
    useEffect(() => {
      const apply = () => {
        const dark = theme === "dark" || (theme === "system" && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
        document.documentElement.dataset.theme = dark ? "dark" : "light";
        const meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.content = dark ? "#0E0C18" : "#EFEEF5";
      };
      apply(); store.set("theme", theme);
      const mq = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
      if (mq && mq.addEventListener) { mq.addEventListener("change", apply); return () => mq.removeEventListener("change", apply); }
    }, [theme]);
    // l'orologio al secondo serve solo per il conto alla rovescia del pass PRO: niente ridisegni inutili quando non è attivo
    useEffect(() => { if (until <= Date.now()) return; const id = setInterval(() => { setNow(Date.now()); if (Date.now() > until) clearInterval(id); }, 1000); return () => clearInterval(id); }, [until]);
    useEffect(() => {
      if (ad === null) return;
      if (ad === 0) { const u = Date.now() + 15 * 60 * 1000 - 1000; setUntil(u); store.set("until", u); setAd(null); setUnlock(false); flash("PRO attivo per 15 minuti"); return; }
      const id = setTimeout(() => setAd(ad - 1), 1000); return () => clearTimeout(id);
    }, [ad]);
    useEffect(() => store.set("slip", mySlip), [mySlip]);
    useEffect(() => { if (toast) { const id = setTimeout(() => setToast(""), 1800); return () => clearTimeout(id); } }, [toast]);
    const flash = (t) => setToast(t);
    // notifiche push: partite seguite = preferite + squadra del cuore, collegate alla diretta e non ancora finite
    const mia = (m) => favM.includes(m.id) || m.h === fav || m.a === fav || favTeams.includes(m.h) || favTeams.includes(m.a);
    const followList = () => (D ? D.matches.filter((m) => m.eid && m.lgE && m.st !== "FT" && mia(m)).map((m) => ({ lgE: m.lgE, eid: m.eid, h: m.h, a: m.a })) : []);
    const sendFollow = async (sub, test) => {
      const r = await fetch(pushUrl + "/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sub: sub.toJSON(), follow: followList(), pref }) });
      if (!r.ok) throw new Error("iscrizione");
      if (test) await fetch(pushUrl + "/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
    };
    const attivaPush = async () => {
      try {
        if (!pushUrl) return setPushMsg("Il servizio notifiche non è ancora pronto: riprova tra qualche minuto.");
        if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window))
          return setPushMsg(navigator.standalone === false || /iPhone|iPad/.test(navigator.userAgent) ? "Su iPhone le notifiche funzionano solo aprendo AuraPitch dall'icona sulla schermata Home (Safari, Condividi, Aggiungi alla schermata Home)." : "Questo browser non supporta le notifiche.");
        const perm = await Notification.requestPermission();
        if (perm !== "granted") return setPushMsg("Permesso negato: puoi riattivarlo da Impostazioni, Notifiche, AuraPitch.");
        setPushMsg("Attivazione in corso...");
        const reg = await navigator.serviceWorker.ready;
        const { key } = await (await fetch(pushUrl + "/vapid")).json();
        const raw = Uint8Array.from(atob(key.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((key.length + 3) % 4)), (c) => c.charCodeAt(0));
        const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: raw }));
        await sendFollow(sub, true);
        lastFollow.current = JSON.stringify([followList(), pref]);
        setPushOn(true); store.set("push", true);
        setPushMsg("Notifiche attive: dovresti aver ricevuto una notifica di prova.");
      } catch (e) { setPushMsg("Non sono riuscito ad attivarle: controlla la connessione e riprova."); }
    };
    const disattivaPush = async () => {
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) { if (pushUrl) await fetch(pushUrl + "/unsubscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => {}); await sub.unsubscribe(); }
      } catch (e) { /* gia disattivate */ }
      setPushOn(false); store.set("push", false); setPushMsg("Notifiche disattivate.");
    };
    useEffect(() => {
      if (!pushOn || !pushUrl || !D) return;
      const key = JSON.stringify([followList(), pref]);
      if (key === lastFollow.current) return;
      const id = setTimeout(async () => {
        try {
          const reg = await navigator.serviceWorker.ready;
          const sub = await reg.pushManager.getSubscription();
          if (sub) { await sendFollow(sub, false); lastFollow.current = key; }
        } catch (e) { /* si riprova al prossimo aggiornamento */ }
      }, 1500);
      return () => clearTimeout(id);
    }, [D, favM, fav, pushOn, pushUrl, pref]);
    // avvisi: gol e fine partita delle partite preferite e della squadra del cuore (con l'app aperta)
    useEffect(() => {
      if (!D) return;
      const now = {};
      for (const m of D.matches) now[m.id] = { st: m.st, g: m.g ? m.g.join("-") : null };
      const old = prev.current;
      prev.current = now;
      if (!old || !avvisi) return;
      for (const m of D.matches) {
        if (!mia(m)) continue;
        const o = old[m.id], n = now[m.id];
        if (!o) continue;
        let msg = null;
        if (o.st !== "LIVE" && n.st === "LIVE") msg = `Calcio d'inizio: ${m.h} - ${m.a}`;
        else if (n.g && o.g !== n.g && n.st === "LIVE") msg = `Gol! ${m.h} ${m.g[0]} - ${m.g[1]} ${m.a}${m.clock ? " (" + m.clock + ")" : ""}`;
        else if (o.st === "LIVE" && n.st === "FT") msg = `Finale: ${m.h} ${m.g[0]} - ${m.g[1]} ${m.a}`;
        if (!msg) continue;
        setToast(msg);
        try { if (navigator.vibrate) navigator.vibrate([120, 60, 120]); } catch (e) { /* non supportato */ }
        try {
          if ("Notification" in window && Notification.permission === "granted" && navigator.serviceWorker)
            navigator.serviceWorker.ready.then((r) => r.showNotification("AuraPitch", { body: msg, icon: "icon-192.png", tag: m.id }));
        } catch (e) { /* notifiche non disponibili */ }
      }
    }, [D]);

    const left = Math.max(0, Math.ceil((until - now) / 1000));
    const pro = !!sub || left > 0;
    const unlocked = (m) => pro || m.free;
    const ini = (name.trim() ? name.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("") : "IO").toUpperCase();


    // apertura da una notifica: ./#m=<id partita> (anche ad app già aperta, tramite messaggio del service worker)
    const [daAprire, setDaAprire] = useState(() => { const x = /#m=([^&]+)/.exec(location.hash || ""); return x ? decodeURIComponent(x[1]) : null; });
    useEffect(() => {
      const sw = navigator.serviceWorker, fn = (e) => { const x = e.data && e.data.apri && /#m=([^&]+)/.exec(e.data.apri); if (x) setDaAprire(decodeURIComponent(x[1])); };
      if (sw) sw.addEventListener("message", fn);
      return () => { if (sw) sw.removeEventListener("message", fn); };
    }, []);
    useEffect(() => { if (open) caricaDettagli(open); }, [open, Draw, extra]);
    const legheSchedina = () => { const off = store.get("slipOff", null); return Draw ? [...new Set(Draw.matches.map((m) => m.lg))].filter((k) => (off ? !off.includes(k) : !favLeagues.length || favLeagues.includes(k))) : []; };
    useEffect(() => { if (tab === "schedina") caricaMercati([...legheSchedina(), ...mySlip.map((x) => (Draw && Draw.matches.find((m) => m.id === x.id) || {}).lg).filter(Boolean)]); }, [tab, Draw, mySlip.length]);
    useEffect(() => { if (!daAprire || !D) return; setOpen(daAprire); setMt(0); setTeam(null); window.scrollTo(0, 0); setDaAprire(null); if (location.hash) history.replaceState(null, "", location.pathname); }, [daAprire, D]);
    if (err) return html`<div className="p-6 text-center text-sm ${C.mu}">${err}</div>`;
    if (!D) return html`<div className="max-w-[480px] mx-auto px-4 pt-6 space-y-3" aria-busy="true" aria-label="Caricamento delle partite">
      <div className="h-9 w-40 rounded-xl bg-[#17152B]/[0.06] dark:bg-white/[0.06] animate-pulse"></div>
      <div className="flex gap-2">${[0, 1, 2, 3, 4].map((i) => html`<div key=${i} className="h-16 flex-1 rounded-2xl bg-[#17152B]/[0.06] dark:bg-white/[0.06] animate-pulse"></div>`)}</div>
      ${[0, 1, 2].map((i) => html`<div key=${i} className=${C.card + " p-4 space-y-3"}><div className="h-5 w-32 rounded bg-[#17152B]/[0.06] dark:bg-white/[0.06] animate-pulse"></div>
        ${[0, 1, 2].map((j) => html`<div key=${j} className="h-12 rounded-xl bg-[#17152B]/[0.05] dark:bg-white/[0.05] animate-pulse"></div>`)}</div>`)}</div>`;
    const byId = Object.fromEntries(D.matches.map((m) => [m.id, m]));
    const lg = (k) => D.leagues.find((l) => l.k === k);
    // senza scelte salvate: aperti i campionati che segui (o i primi 5 se non ne segui), gli altri chiusi con il solo conteggio
    const lgOpen = openL || (favLeagues && favLeagues.length ? D.leagues.filter((l) => favLeagues.includes(l.k)).map((l) => l.k) : D.leagues.slice(0, 5).map((l) => l.k));
    const goMatch = (id) => { setOpen(id); setMt(0); setTeam(null); window.scrollTo(0, 0); };
    const toggleFavM = (id) => {
      const adding = !favM.includes(id);
      const nx = adding ? [...favM, id] : favM.filter((x) => x !== id);
      setFavM(nx); store.set("favM", nx);
      if (adding && !pushOn && !store.get("pushNo", false)) { setPushMsg(""); setAskPush(true); }
      else flash(adding ? (pushOn ? "Aggiunta alle preferite: riceverai le notifiche" : "Aggiunta alle preferite") : "Tolta dalle preferite");
    };
    const openTeam = (t) => { setTeam(t); window.scrollTo(0, 0); };
    const addLeg = (m, k) => {
      if (mySlip.some((x) => x.id === m.id)) { setMySlip(mySlip.map((x) => (x.id === m.id ? { id: m.id, k } : x))); flash("Esito aggiornato in schedina"); }
      else { setMySlip([...mySlip, { id: m.id, k }]); flash("Aggiunta alla schedina"); }
    };
    const doCopy = async (t) => {
      try { await navigator.clipboard.writeText(t); flash("Copiata negli appunti"); } catch (e) { setCopyText(t); }
    };

    /* ---- header ---- */
    const header = html`<header className="sticky z-30" style=${{ top: "env(safe-area-inset-top, 0px)", background: "var(--bg)" }}>
      <div className="max-w-[480px] mx-auto px-4 h-14 flex items-center gap-2">
        <button onClick=${() => { setOpen(null); setTeam(null); setTab("partite"); }} className="flex items-center gap-2 mr-auto" aria-label="AuraPitch, vai alle partite">
          <${Marchio} size=${30} />
          <span className=${"num text-[25px] font-extrabold tracking-[0.01em] leading-none " + C.tx}>AuraPitch</span>
          <span className=${"text-[10px] font-semibold px-1.5 py-0.5 rounded-md " + C.ch + " " + C.mu}>beta</span></button>
        <button onClick=${() => setUnlock(true)} className=${"text-[11px] font-semibold px-2.5 py-1 rounded-full border tabular-nums " + (pro ? TONE.warn : C.ch + " " + C.tx + " border-transparent")}>${sub ? "PRO" : left > 0 ? "PRO " + mmss(left) : "FREE"}</button>
        <button aria-label="Cerca" onClick=${() => setCerca(true)} className=${"w-8 h-8 rounded-full flex items-center justify-center " + C.ch + " " + C.tx}><${Ic.Search} size=${15} /></button>
        <button aria-label="Guida rapida" onClick=${() => setGuide(guide ? 0 : 1)} className=${"w-8 h-8 rounded-full flex items-center justify-center " + C.ch + " " + C.tx}><${Ic.HelpCircle} size=${15} /></button>
        <button aria-label="Profilo e impostazioni" onClick=${() => setProfile(true)} className=${"w-8 h-8 rounded-full text-[11px] font-semibold " + C.on}>${ini}</button>
      </div></header>`;

    const steps = ["Partite: tocca un campionato per aprirlo. La stella dentro una partita la mette tra le Preferite, in cima, con gli avvisi dei gol.", "Tocca una partita: in \"In breve\" trovi l'essenziale. Scorri col dito a destra o a sinistra per approfondire: Partita, Formazioni, IA, Statistiche, Cronaca.",
      "Le analisi IA sono libere sulle partite FREE; sulle altre si sbloccano con PRO o con un video da 15 minuti.", "In Schedina IA scorri tra Crea, La mia schedina, Diario e Storico IA. Nel Club trovi Gara, Traguardi e Account."];
    const guideBox = guide > 0 && html`<div className=${"mx-4 mb-3 p-3 rounded-2xl border text-sm flex items-start gap-2 " + TONE.info}>
      <div className="flex-1"><b>Guida ${guide}/4.</b> ${steps[guide - 1]}</div>
      <button aria-label="Passo precedente" onClick=${() => setGuide(Math.max(1, guide - 1))}><${Ic.ChevronLeft} size=${18} /></button>
      <button aria-label=${guide === 4 ? "Chiudi la guida" : "Passo successivo"} onClick=${() => { if (guide === 4) { setGuide(0); store.set("guideSeen", true); } else setGuide(guide + 1); }}>${guide === 4 ? html`<${Ic.X} size=${18} />` : html`<${Ic.ChevronRight} size=${18} />`}</button></div>`;

    /* ---- vista partite ---- */
    const dayMatches = D.matches.filter((m) => (day === "all" || m.date === day) && (!liveOnly || m.st === "LIVE"));
    const tsH = (e) => { tiraRef.current = window.scrollY <= 0 ? [e.touches[0].clientX, e.touches[0].clientY] : null; };
    // aggiorna tirando giù: solo con un gesto verticale (scorrere le chip dei giorni non deve aggiornare)
    const tmH = (e) => { if (tiraRef.current == null) return; const dx = e.touches[0].clientX - tiraRef.current[0], d = e.touches[0].clientY - tiraRef.current[1];
      if (Math.abs(dx) > Math.abs(d)) { tiraRef.current = null; setTira(0); return; } setTira(d > 0 ? Math.min(110, d * 0.6) : 0); };
    const teH = () => { if (tira >= 64) { try { if (navigator.vibrate) navigator.vibrate(12); } catch (x) { /* non supportato */ } ricarica(); } setTira(0); tiraRef.current = null; };
    const home = html`<div className="px-4 space-y-3" onTouchStart=${tsH} onTouchMove=${tmH} onTouchEnd=${teH}>
      ${tira > 0 && html`<div className="flex justify-center transition-all" style=${{ height: tira }}><span className=${"self-end mb-1 text-[13px] font-semibold flex items-center gap-1.5 " + C.mu}><${Ic.Repeat} size=${14} className=${tira >= 64 ? C.acc : ""} />${tira >= 64 ? "Rilascia per aggiornare" : "Tira giù per aggiornare"}</span></div>`}
      ${banner && html`<div className=${C.card + " p-3 flex gap-3 items-start"}><${Ic.Info} size=${16} className="text-sky-500 shrink-0 mt-0.5" />
        <div className=${"text-[13px] flex-1 " + C.tx}>${D.demo ? html`Beta con <b>dati reali</b> della giornata ${D.label}. Le partite sono già giocate: puoi confrontare le letture dell'IA con i risultati.`
          : html`Beta con <b>dati reali</b>, ${D.label}: quote medie di decine di bookmaker (DraftKings per i campionati e le coppe in più), classifiche e risultati in diretta (ogni 30 secondi). Apri una partita e scorri col dito tra le sezioni.`}</div>
        <button aria-label="Chiudi avviso" onClick=${() => { setBanner(false); store.set("banner2", false); }} className=${C.mu}><${Ic.X} size=${16} /></button></div>`}
      <${Giorni} days=${D.days} day=${day} setDay=${setDay} demo=${D.demo} />
      <div className="flex items-center gap-2 pt-1"><span className=${"text-[22px] font-bold tracking-[-0.02em] flex-1 " + C.tx}>${day === "all" ? "Tutte le partite" : (D.days.find((d) => d.k === day) || {}).label === "Oggi" ? "Oggi" : new Date(day + "T12:00:00").toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" }).replace(/^./, (c) => c.toUpperCase())}</span>
        <button onClick=${() => setLiveOnly(liveOnly ? 0 : 1)} aria-pressed=${!!liveOnly} className=${"inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-bold " + (liveOnly ? "bg-[#FF3D5A] text-white" : "bg-white dark:bg-[#191626] " + C.tx)}>
        <span className=${"w-2 h-2 rounded-full " + (liveOnly ? "bg-white" : "bg-[#FF3D5A]" + (D.matches.some((m) => m.st === "LIVE") ? " pulse" : ""))}></span>In diretta${D.matches.some((m) => m.st === "LIVE") ? " " + D.matches.filter((m) => m.st === "LIVE").length : ""}</button></div>
      ${(() => { const fm = dayMatches.filter(mia); return fm.length > 0 && html`<div className=${C.card + " overflow-hidden"}>
        <div className="flex items-center gap-3 px-4 pt-3.5 pb-2.5"><${Ic.Star} size=${18} className="text-amber-400 fill-amber-400" /><span className=${"flex-1 text-[16px] font-semibold " + C.tx}>Le tue partite</span><span className=${"num text-[17px] font-bold " + C.mu}>${fm.length}</span></div>
        <div>${fm.map((m, i) => html`<${Row} key=${m.id} m=${m} i=${i} />`)}</div></div>`; })()}
      ${(() => { const pw = partitaSettimana(D); if (!pw || store.get("pwNo", "") === pw.id || liveOnly) return null;
        return html`<div className=${C.card + " p-4 relative overflow-hidden"}>
          <div aria-hidden="true" className="absolute inset-0 opacity-[0.16] dark:opacity-[0.25]" style=${{ background: `radial-gradient(80% 90% at 0% 0%, ${auraCol(pw)[0]}, transparent 70%), radial-gradient(80% 90% at 100% 0%, ${auraCol(pw)[1]}, transparent 70%)` }}></div>
          <div className="relative"><div className="flex items-center"><span className=${"flex-1 text-[12px] font-semibold " + C.acc}>Partita della settimana</span>
            <button aria-label="Nascondi" onClick=${() => { store.set("pwNo", pw.id); setToast("Nascosta"); }} className=${C.mu}><${Ic.X} size=${15} /></button></div>
          <button onClick=${() => goMatch(pw.id)} className="w-full text-left mt-1">
            <div className="flex items-center gap-2"><${Crest} t=${pw.h} size=${22} /><span className=${"text-[18px] font-bold " + C.tx}>${pw.h}</span><span className=${C.mu}>-</span><span className=${"text-[18px] font-bold " + C.tx}>${pw.a}</span><${Crest} t=${pw.a} size=${22} /></div>
            <div className=${"text-[13px] mt-1 " + C.mu}>${(lg(pw.lg) || {}).name}, ${new Date(pw.ko).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })} alle ${pw.time}</div>
            <div className="mt-2.5"><${AuraLine} m=${pw} h=${4} /></div></button></div></div>`; })()}
      ${D.leagues.slice().sort((a, b) => (favLeagues.includes(b.k) ? 1 : 0) - (favLeagues.includes(a.k) ? 1 : 0)).map((l) => {
        const ms = dayMatches.filter((m) => m.lg === l.k);
        if (!ms.length) return null;
        const o = lgOpen.includes(l.k);
        const toggle = () => { const nx = o ? lgOpen.filter((q) => q !== l.k) : [...lgOpen, l.k]; setOpenL(nx); store.set("openL", nx); };
        return html`<div key=${l.k} className=${C.card + " overflow-hidden"}>
          <button onClick=${toggle} aria-expanded=${o} className="w-full flex items-center gap-3 px-4 pt-3.5 pb-2.5"><${Flag} k=${l.flag} w=${22} />
            <span className="flex-1 text-left leading-tight"><span className=${"block text-[16px] font-semibold tracking-[-0.01em] " + C.tx}>${l.name}</span><span className=${"block text-[12px] " + C.mu}>${l.country}${ms.some((m) => m.st === "LIVE") ? html`<span className="text-[#FF3D5A] font-semibold">, ${ms.filter((m) => m.st === "LIVE").length} in diretta</span>` : ""}</span></span><span className=${"num text-[17px] font-bold " + C.mu}>${ms.length}</span>
            <${Ic.ChevronDown} size=${16} className=${C.mu + " transition-transform " + (o ? "rotate-180" : "")} /></button>
          ${o && html`<div>${ms.map((m, i) => html`<${Row} key=${m.id} m=${m} i=${i} />`)}</div>`}</div>`;
      })}
      ${!dayMatches.length && html`<div className=${C.card + " p-6 text-center text-sm " + C.mu}>${liveOnly ? "Nessuna partita in corso in questo momento." : "Nessuna partita in questo giorno."}</div>`}
      <p className=${"text-[11px] text-center " + C.mu}>${D.demo ? "Dati: Football-Data.co.uk, ClubElo." : "Dati: quote da The Odds API; classifiche da football-data.org; diretta, cronaca e formazioni da ESPN."} Stemmi generici, non ufficiali.</p></div>`;

    const open_m = open && byId[open];
    const views = { partite: home, campionati: html`<${LeaguesView} />`, schedina: html`<${SlipView} />`, club: html`<${ClubView} />` };
    const DOCK = [["partite", "Partite", Ic.Calendar], ["campionati", "Campionati", Ic.Trophy], ["schedina", "Schedina IA", Ic.Sparkles], ["club", "Il Mio Club", Ic.Shield]];

    const ctx = { caricaDettagli, caricaMercati, syncOn, setSyncOn, setGloss, favTeams, setFavTeams, favLeagues, setFavLeagues, mia, ripristina, diario, setDiario, pushUrl, D, byId, lg, pro, unlocked, goMatch, setOpen, mt, setMt, addLeg, mySlip, setMySlip, doCopy, setUnlock, fav, setFav, team, setTeam: openTeam, stor, aff, favM, toggleFavM };
    return html`<${Ctx.Provider} value=${ctx}><div className="min-h-screen pb-28">
      ${header}
      <main className="max-w-[480px] mx-auto">${!online && html`<div role="status" className=${"mx-4 mb-3 px-3.5 py-2.5 rounded-2xl border text-[13px] flex items-center gap-2 " + TONE.warn}><${Ic.Clock} size=${15} />Sei offline: vedi i dati delle ${(D.generato || "").slice(-5)}. Quando torna la rete, tira giù la pagina per aggiornarli.</div>`}${guideBox}${team ? html`<${TeamView} key=${team.name} />` : open_m ? (D.leggera && !open_m.dett ? html`<div className="px-4 pt-4 space-y-3" aria-busy="true"><div className=${C.card + " p-5 text-center"}><div className=${"text-[17px] font-semibold " + C.tx}>${open_m.h} - ${open_m.a}</div><div className=${"text-[13px] mt-1 " + C.mu}>${online ? "Carico l'analisi della partita..." : "Sei offline: l'analisi di questa partita non è ancora stata scaricata."}</div>
          <div className="h-2 mt-4 rounded-full bg-[#17152B]/[0.06] dark:bg-white/[0.06] animate-pulse"></div></div>${[0, 1].map((i) => html`<div key=${i} className=${C.card + " h-36 animate-pulse"}></div>`)}</div>` : html`<${MatchView} key=${open_m.id} m=${open_m} />`) : views[tab]}</main>
      <nav className="fixed inset-x-0 z-40" style=${{ bottom: "calc(10px + env(safe-area-inset-bottom, 0px))", paddingLeft: "calc(12px + env(safe-area-inset-left, 0px))", paddingRight: "calc(12px + env(safe-area-inset-right, 0px))" }}>
        <div className="dock max-w-[456px] mx-auto rounded-[26px] p-1.5 grid grid-cols-4 gap-1">${DOCK.map(([k, l, I]) => { const on = tab === k && !open && !team; return html`<button key=${k} onClick=${() => { setTab(k); setOpen(null); setTeam(null); window.scrollTo(0, 0); }}
          aria-current=${on ? "page" : undefined}
          className=${"flex flex-col items-center gap-0.5 py-1.5 rounded-[20px] text-[11px] font-semibold transition-colors " + (on ? "bg-[#5B2EE6]/[0.1] text-[#5B2EE6] dark:bg-[#A58BFF]/[0.16] dark:text-[#A58BFF]" : C.mu)}><${I} size=${22} strokeWidth=${on ? 2.4 : 2} />${l}</button>`; })}</div></nav>

      ${unlock && html`<${Sheet} title="Sblocca AuraPitch PRO" onClose=${() => ad === null && setUnlock(false)}>
        ${ad !== null ? html`<div className="py-6 text-center space-y-3"><div className="text-sm font-semibold">Spot in corso</div>
            <div className=${"h-1.5 rounded-full overflow-hidden " + C.ch}><div className="h-1.5 bg-amber-300 transition-all duration-1000" style=${{ width: ((5 - ad) / 5) * 100 + "%" }}></div></div>
            <div className=${"text-xs " + C.mu}>Ancora ${ad} secondi. Nella beta lo spot è simulato e dura 5 secondi.</div></div>`
          : html`<${React.Fragment}>
            <p className=${"text-sm " + C.mu}>PRO sblocca su tutte le partite la lettura in 10 secondi, l'analisi IA e il profilo Colpaccio da Bar.</p>
            ${[[Ic.Play, "Pass 15 minuti gratis", "Guarda uno spot e usa PRO per 15 minuti", () => setAd(5), true],
              [Ic.Zap, "Mensile - 4,99 € al mese", "Prezzo indicativo della beta", () => { setSub("mensile"); store.set("sub", "mensile"); setUnlock(false); flash("PRO attivo (simulato)"); }],
              [Ic.Crown, "Annuale - 29,99 € all'anno", "Risparmi il 50% rispetto al mensile", () => { setSub("annuale"); store.set("sub", "annuale"); setUnlock(false); flash("PRO attivo (simulato)"); }]].map(([I, t, s, fn, hi]) => html`
              <button key=${t} onClick=${fn} className=${"w-full text-left rounded-2xl border p-3 flex items-center gap-3 " + (hi ? TONE.warn : C.ch + " border-transparent")}>
                <span className=${"w-9 h-9 rounded-full flex items-center justify-center shrink-0 border " + TONE.warn}><${I} size=${17} /></span>
                <span><span className="block text-sm font-semibold">${t}</span><span className=${"block text-xs " + C.mu}>${s}</span></span></button>`)}
            ${pro && html`<button onClick=${() => { setSub(null); setUntil(0); store.set("sub", null); store.set("until", 0); setUnlock(false); }} className=${"w-full text-xs font-medium py-1 " + C.mu}>Torna a FREE</button>`}
            <p className=${"text-[11px] text-center " + C.mu}>Beta: nessun pagamento reale.</p><//>`}<//>`}

      ${cerca && html`<${Cerca} onClose=${() => setCerca(false)} />`}
      ${gloss && html`<${Glossario} onClose=${() => setGloss(false)} />`}
      ${!onb && html`<${PrimoAvvio} onFine=${() => { setOnb(true); store.set("onb", true); store.set("guideSeen", true); setGuide(0); }} />`}
      ${!open && !team && html`<${BarraSchedina} vaiSchedina=${() => { setTab("schedina"); window.scrollTo(0, 0); }} />`}
      ${askPush && html`<${Sheet} title="Notifiche della partita" onClose=${() => setAskPush(false)}>
        <p className=${"text-[15px] " + C.tx}>Vuoi ricevere un avviso anche con il telefono bloccato per <b>inizio partita, gol, espulsioni, fine primo tempo e finale</b> delle tue preferite?</p>
        ${/iPhone|iPad/.test(navigator.userAgent) && !navigator.standalone && html`<div className=${"text-[13px] rounded-xl p-3 " + TONE.warn + " border"}>Su iPhone le notifiche funzionano solo aprendo AuraPitch dall'icona sulla schermata Home (Safari, Condividi, Aggiungi alla schermata Home).</div>`}
        <button onClick=${async () => { await attivaPush(); }} className=${"w-full py-3 rounded-xl text-[15px] font-bold " + C.on}>${pushOn ? "Notifiche attive" : "Attiva le notifiche"}</button>
        ${pushMsg && html`<div className=${"text-[13px] " + C.tx}>${pushMsg}</div>`}
        <button onClick=${() => { setAskPush(false); store.set("pushNo", true); }} className=${"w-full py-2 text-[13px] font-semibold " + C.mu}>Non ora (puoi attivarle da Profilo)</button><//>`}

      ${profile && html`<${Sheet} title="Profilo e impostazioni" onClose=${() => setProfile(false)}>
        <label htmlFor="nome" className=${C.lab}>Il tuo nome</label>
        <input id="nome" value=${name} onChange=${(e) => { setName(e.target.value); store.set("name", e.target.value); }} placeholder="Come ti chiami?" className=${"w-full rounded-xl px-3 py-2 outline-none " + C.ch + " " + C.tx} />
        <div className=${C.lab}>Tema</div>
        <${Seg} items=${["Automatico", "Chiaro", "Scuro"]} val=${["system", "light", "dark"].indexOf(theme)} set=${(i) => setTheme(["system", "light", "dark"][i])} />
        <div className=${C.lab}>Avvisi</div>
        <button onClick=${() => { const v = !avvisi; setAvvisi(v); store.set("avvisi", v); if (v && "Notification" in window && Notification.permission === "default") Notification.requestPermission().catch(() => {}); }}
          className=${"w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left " + C.ch}>
          <span className="flex-1"><span className=${"block text-sm font-semibold " + C.tx}>Gol e risultati delle preferite</span><span className=${"block text-xs " + C.mu}>Partite con la stella e squadra del cuore. Per ora funzionano con l'app aperta.</span></span>
          <span className=${"w-11 h-6 rounded-full p-0.5 transition-colors " + (avvisi ? "bg-emerald-500" : "bg-black/20 dark:bg-white/20")}><span className=${"block w-5 h-5 rounded-full bg-white shadow transition-transform " + (avvisi ? "translate-x-5" : "")}></span></span></button>
        <div className=${C.lab}>Notifiche con l'app chiusa</div>
        <div className=${"rounded-xl px-3 py-2.5 space-y-2 " + C.ch}>
          <div className=${"text-xs " + C.mu}>Per le partite con la stella e la squadra del cuore, anche con il telefono bloccato. Scegli qui sotto quali avvisi ricevere.</div>
          <button onClick=${pushOn ? disattivaPush : attivaPush} className=${"w-full py-2.5 rounded-xl text-sm font-semibold " + (pushOn ? "bg-white dark:bg-[#2A2640] " + C.tx : C.on)}>${pushOn ? "Disattiva le notifiche" : "Attiva le notifiche"}</button>
          ${pushMsg && html`<div className=${"text-xs " + C.tx}>${pushMsg}</div>`}
          ${pushOn && html`<div className="pt-1 space-y-1">${[["promemoria", "Promemoria un'ora prima, con il consiglio IA"], ["formazioni", "Formazioni ufficiali (con la probabilità IA aggiornata)"], ["inizio", "Calcio d'inizio"], ["gol", "Gol"], ["rossi", "Espulsioni"], ["intervallo", "Fine primo tempo"], ["finale", "Risultato finale"]].map(([k, l]) => html`
            <button key=${k} onClick=${() => { const nx = { ...pref, [k]: pref[k] === false }; setPref(nx); store.set("pushPref", nx); }} className="w-full flex items-center gap-3 py-1.5 text-left">
              <span className=${"flex-1 text-[14px] " + C.tx}>${l}</span>
              <span className=${"w-10 h-6 rounded-full p-0.5 transition-colors " + (pref[k] !== false ? "bg-[#5B2EE6] dark:bg-[#A58BFF]" : "bg-black/20 dark:bg-white/20")}><span className=${"block w-5 h-5 rounded-full bg-white shadow transition-transform " + (pref[k] !== false ? "translate-x-4" : "")}></span></span></button>`)}</div>`}</div>
        <button onClick=${() => { setProfile(false); setGloss(true); }} className=${"w-full py-2.5 rounded-xl text-sm font-semibold " + C.ch + " " + C.tx}>Glossario delle scommesse</button>
        <button onClick=${() => { setProfile(false); setOnb(false); }} className=${"w-full py-2.5 rounded-xl text-sm font-semibold " + C.ch + " " + C.tx}>Scegli campionati e squadre che segui</button>
        <div className=${C.lab}>Squadra del cuore</div>
        <div className=${"text-sm " + C.tx}>${fav} <button onClick=${() => { setProfile(false); setOpen(null); setTab("club"); }} className="text-[#5B2EE6] dark:text-[#A58BFF] font-medium ml-1">Cambia</button></div>
        <div className=${C.lab}>Accesso</div>
        <div className="grid grid-cols-2 gap-2">${["Google", "Apple"].map((p) => html`<button key=${p} disabled className=${"py-2.5 rounded-xl text-sm font-semibold opacity-50 " + C.ch + " " + C.tx}>${p}</button>`)}</div>
        <p className=${"text-xs " + C.mu}>${syncOn ? "Una copia dei tuoi dati è salvata sul servizio AuraPitch con il tuo codice personale (Il Mio Club, Account)." : "I tuoi dati restano solo su questo dispositivo, a meno che tu non attivi il salvataggio in Il Mio Club, Account."} L'accesso con Google e Apple arriverà con la versione pubblica.</p><//>`}

      ${copyText !== null && html`<${Sheet} title="Copia la schedina" onClose=${() => setCopyText(null)}>
        <p className=${"text-sm " + C.mu}>Il telefono non ha permesso la copia automatica: tieni premuto sul testo e scegli Copia.</p>
        <textarea readOnly value=${copyText} rows=${8} className=${"w-full rounded-xl p-3 text-sm " + C.ch + " " + C.tx} onFocus=${(e) => e.target.select()}></textarea><//>`}

      ${toast && html`<div role="status" className="fixed left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full text-sm font-medium shadow-lg bg-[#17152B] text-white dark:bg-white dark:text-black"
        style=${{ bottom: "calc(96px + env(safe-area-inset-bottom, 0px))" }}>${toast}</div>`}
    </div><//>`;
  }

  createRoot(document.getElementById("root")).render(html`<${App} />`);
