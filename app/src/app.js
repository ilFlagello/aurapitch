/* AuraPitch beta - web app installabile.
   Si compila con build.mjs (esbuild + Tailwind): il risultato in dist/ non dipende da CDN esterni.
   Icone: set Lucide (pacchetto react-icons/lu). Dati: data/giornata.json. */
import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import htm from "htm";
import { LuActivity, LuCalculator, LuCalendar, LuChartColumn, LuCheck, LuChevronDown, LuChevronLeft, LuChevronRight, LuCircleCheck, LuCircleDot, LuCircleHelp, LuCircleX, LuClock, LuCopy, LuCrown, LuInfo, LuLock, LuMoon, LuNewspaper, LuPlay, LuPlus, LuShield, LuShieldCheck, LuShirt, LuSmartphone, LuSparkles, LuStar, LuSun, LuSwords, LuTrash2, LuTrendingUp, LuTriangleAlert, LuTrophy, LuUsers, LuX, LuZap } from "react-icons/lu";

const html = htm.bind(React.createElement);
const Ic = { Calendar: LuCalendar, Trophy: LuTrophy, Sparkles: LuSparkles, Shield: LuShield, Sun: LuSun, Moon: LuMoon, HelpCircle: LuCircleHelp, X: LuX, ChevronLeft: LuChevronLeft, ChevronRight: LuChevronRight, ChevronDown: LuChevronDown, Lock: LuLock, Play: LuPlay, Crown: LuCrown, Zap: LuZap, Copy: LuCopy, Check: LuCheck, Plus: LuPlus, Trash2: LuTrash2, TrendingUp: LuTrendingUp, Swords: LuSwords, Users: LuUsers, Activity: LuActivity, Newspaper: LuNewspaper, Calculator: LuCalculator, BarChart3: LuChartColumn, AlertTriangle: LuTriangleAlert, Info: LuInfo, Star: LuStar, ShieldCheck: LuShieldCheck, CircleDot: LuCircleDot, Shirt: LuShirt, Smartphone: LuSmartphone, CheckCircle2: LuCircleCheck, XCircle: LuCircleX, Clock: LuClock };

  /* ---------- utilità ---------- */
  const store = {
    get(k, d) { try { const v = localStorage.getItem("ap:" + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem("ap:" + k, JSON.stringify(v)); } catch (e) { /* archivio del browser non disponibile */ } },
  };
  const pct = (x) => Math.round((x || 0) * 100);
  const odd = (x) => (x == null ? "-" : Number(x).toFixed(2).replace(".", ","));
  const hs = (s) => [...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const mmss = (s) => String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
  const C = {
    card: "bg-white dark:bg-[#1C1C1E] border border-black/[0.05] dark:border-white/[0.08] rounded-2xl shadow-[0_2px_10px_rgba(0,0,0,0.03)]",
    tx: "text-[#1D1D1F] dark:text-[#F5F5F7]",
    mu: "text-[#6E6E73] dark:text-[#98989F]",
    bd: "border-black/[0.06] dark:border-white/[0.08]",
    ch: "bg-black/[0.04] dark:bg-white/[0.08]",
    seg: "bg-white text-[#1D1D1F] shadow-sm dark:bg-[#3A3A3C] dark:text-white",
    on: "bg-[#1D1D1F] text-white dark:bg-white dark:text-black",
    lab: "text-[11px] font-semibold uppercase tracking-wide text-[#6E6E73] dark:text-[#98989F]",
  };
  const TONE = {
    good: "bg-emerald-50 text-emerald-700 border-emerald-200/70 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30",
    warn: "bg-amber-50 text-amber-700 border-amber-200/70 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30",
    bad: "bg-rose-50 text-rose-700 border-rose-200/70 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30",
    info: "bg-sky-50 text-sky-700 border-sky-200/70 dark:bg-sky-500/15 dark:text-sky-300 dark:border-sky-500/30",
    ok: "bg-black/[0.04] text-[#3A3A3C] border-transparent dark:bg-white/[0.08] dark:text-[#D1D1D6]",
  };
  const DOT = { good: "bg-emerald-500", warn: "bg-amber-500", info: "bg-sky-500", ok: "bg-[#AEAEB2] dark:bg-[#636366]", bad: "bg-rose-500" };
  const confTone = (p) => (p >= 0.6 ? "good" : p >= 0.45 ? "warn" : "bad");
  const ESITI = ["1", "X", "2"];

  /* ---------- stemmi e bandiere (generici, nessun logo ufficiale) ---------- */
  const TC = {
    Milan: ["#d11a2a", "#111827", "v"], Inter: ["#0b1f4b", "#1b6fd1", "v"], Juventus: ["#111827", "#f8fafc", "v"], Napoli: ["#1e90d6", "#f8fafc", "s"],
    Roma: ["#8b1d2c", "#f5a623", "v"], Lazio: ["#7dc4ea", "#f8fafc", "h"], Atalanta: ["#1e3a8a", "#111827", "v"], Fiorentina: ["#6d28d9", "#f8fafc", "s"],
    Bologna: ["#b91c1c", "#1e3a8a", "v"], Torino: ["#7f1d1d", "#f8fafc", "s"], Genoa: ["#b91c1c", "#1e3a8a", "v"], Udinese: ["#111827", "#f8fafc", "v"],
    Cagliari: ["#b91c1c", "#1e3a8a", "v"], Parma: ["#facc15", "#1e3a8a", "h"], Como: ["#1d4ed8", "#f8fafc", "s"], Lecce: ["#facc15", "#dc2626", "v"],
    Sassuolo: ["#16a34a", "#111827", "v"], Monza: ["#dc2626", "#f8fafc", "h"], Venezia: ["#047857", "#f97316", "v"], Frosinone: ["#facc15", "#1d4ed8", "h"],
    Palermo: ["#f9a8c4", "#111827", "v"], Sampdoria: ["#1d4ed8", "#f8fafc", "h"], Bari: ["#dc2626", "#f8fafc", "v"], Cremonese: ["#9ca3af", "#b91c1c", "h"],
    Verona: ["#1d4ed8", "#facc15", "v"], Empoli: ["#1d4ed8", "#f8fafc", "s"], Pisa: ["#111827", "#1d4ed8", "v"], Modena: ["#facc15", "#1d4ed8", "v"],
    Catanzaro: ["#facc15", "#dc2626", "v"], Cesena: ["#f8fafc", "#111827", "h"], Padova: ["#f8fafc", "#dc2626", "s"], Spezia: ["#111827", "#f8fafc", "h"],
    "Manchester City": ["#6cabdd", "#f8fafc", "s"], "Manchester United": ["#da291c", "#fbe122", "s"], Arsenal: ["#e11d2e", "#f8fafc", "h"],
    Chelsea: ["#1d4ed8", "#f8fafc", "s"], Liverpool: ["#c8102e", "#f6c700", "s"], Tottenham: ["#f8fafc", "#132257", "s"], Newcastle: ["#111827", "#f8fafc", "v"],
    "Aston Villa": ["#7b003c", "#95bfe5", "s"], "Crystal Palace": ["#1b458f", "#c4122e", "v"], Everton: ["#1d4ed8", "#f8fafc", "s"], Brighton: ["#0057b8", "#f8fafc", "v"],
    "Real Madrid": ["#f1f5f9", "#c9a227", "s"], Barcelona: ["#a50044", "#004d98", "v"], "Atletico Madrid": ["#cb3524", "#272e61", "v"], Sevilla: ["#f8fafc", "#d71920", "s"],
    Valencia: ["#f8fafc", "#f28a1e", "s"], "Athletic Club": ["#e11d2e", "#f8fafc", "v"], "Real Sociedad": ["#2563eb", "#f8fafc", "v"], Villarreal: ["#facc15", "#1d4ed8", "s"],
    Betis: ["#16a34a", "#f8fafc", "v"], "Bayern Monaco": ["#dc2626", "#1d4ed8", "v"], "Borussia Dortmund": ["#facc15", "#111827", "h"], "Bayer Leverkusen": ["#e11d2e", "#111827", "v"],
    "RB Leipzig": ["#f8fafc", "#dd0741", "s"], Stoccarda: ["#f8fafc", "#e32219", "h"], "Eintracht Francoforte": ["#111827", "#e1000f", "s"], "Schalke 04": ["#1d4ed8", "#f8fafc", "h"],
  };
  const SH = "M12 2L21 5V12C21 17 17 21 12 22C7 21 3 17 3 12V5Z";
  function teamColors(t) {
    if (TC[t]) return TC[t];
    const h = hs(t);
    return [`hsl(${h % 360} 55% 42%)`, `hsl(${(h >> 9) % 360} 30% 92%)`, "vhs"[h % 3]];
  }
  function Crest({ t, size = 20 }) {
    const [a, b, k] = teamColors(t);
    return html`<svg width=${size} height=${size} viewBox="0 0 24 24" className="shrink-0" aria-hidden="true">
      <path d=${SH} fill=${a} />
      ${k === "v" && html`<path d="M12 2L21 5V12C21 17 17 21 12 22Z" fill=${b} />`}
      ${k === "h" && html`<rect x="3.2" y="9" width="17.6" height="4" fill=${b} />`}
      ${k === "s" && html`<circle cx="12" cy="11" r="3.6" fill=${b} />`}
      <path d=${SH} fill="none" stroke=${b} strokeWidth="1.3" /></svg>`;
  }
  function Flag({ k, w = 20 }) {
    const h = (w * 2) / 3;
    return html`<svg width=${w} height=${h} viewBox="0 0 24 16" className="rounded-[3px] shrink-0 ring-1 ring-black/10" aria-hidden="true">
      ${k === "it" && html`<rect width="8" height="16" fill="#16a34a" /><rect x="8" width="8" height="16" fill="#f8fafc" /><rect x="16" width="8" height="16" fill="#dc2626" />`}
      ${k === "en" && html`<rect width="24" height="16" fill="#f8fafc" /><rect x="10" width="4" height="16" fill="#dc2626" /><rect y="6" width="24" height="4" fill="#dc2626" />`}
      ${k === "es" && html`<rect width="24" height="16" fill="#dc2626" /><rect y="4" width="24" height="8" fill="#facc15" />`}
      ${k === "de" && html`<rect width="24" height="5.34" fill="#111827" /><rect y="5.33" width="24" height="5.34" fill="#dc2626" /><rect y="10.66" width="24" height="5.34" fill="#facc15" />`}
      ${k === "eu" && html`<rect width="24" height="16" fill="#1d4ed8" />`}</svg>`;
  }

  /* ---------- logica schedina ---------- */
  function options(m) {
    const [p1, px, p2] = m.p, o = m.odds, po = m.po, mk = m.mk;
    // doppia chance: quota "equa" ricavata dalle probabilita delle quote (senza margine), minimo 1,01
    const dc = (a, b) => Math.max(1.01, 1 / (mk[a] + mk[b]));
    return [
      { k: "1", p: p1, q: o["1"] }, { k: "X", p: px, q: o["X"] }, { k: "2", p: p2, q: o["2"] },
      { k: "1X", p: p1 + px, q: dc(0, 1), stima: true }, { k: "X2", p: px + p2, q: dc(1, 2), stima: true },
      { k: "12", p: p1 + p2, q: dc(0, 2), stima: true },
      { k: "Over 2.5", p: po, q: o["O"] }, { k: "Under 2.5", p: 1 - po, q: o["U"] },
    ].filter((x) => x.q);
  }
  function hit(m, k) {
    if (m.st !== "FT") return null;
    const r = m.res, g = m.g[0] + m.g[1];
    return { "1": r === 0, X: r === 1, "2": r === 2, "1X": r !== 2, X2: r !== 0, "12": r !== 1, "Over 2.5": g > 2, "Under 2.5": g < 3 }[k];
  }
  function buildSlip(matches, prof) {
    const legs = [];
    for (const m of matches) {
      const opts = options(m);
      let best = null;
      if (prof === 0) best = opts.filter((o) => ["1X", "X2", "12", "Under 2.5", "Over 2.5"].includes(o.k) && o.p >= 0.7 && o.q >= 1.2).sort((a, b) => b.p - a.p)[0];
      if (prof === 1) best = opts.filter((o) => ["1", "2"].includes(o.k) && o.p >= 0.5).sort((a, b) => b.p - a.p)[0];
      if (prof === 2) best = opts.filter((o) => o.q >= 2 && o.q <= 4).sort((a, b) => b.p * b.q - a.p * a.q)[0];
      if (best) legs.push({ m, ...best });
    }
    const n = [4, 5, 4][prof];
    return legs.sort((a, b) => (prof === 2 ? b.p * b.q - a.p * a.q : b.p - a.p)).slice(0, n);
  }

  /* ---------- componenti base ---------- */
  function Seg({ items, val, set, small }) {
    return html`<div className=${"flex p-0.5 rounded-xl " + C.ch} role="tablist">${items.map((t, i) => html`
      <button key=${t} role="tab" aria-selected=${val === i} onClick=${() => set(i)}
        className=${"flex-1 px-1.5 py-1.5 rounded-[10px] font-semibold leading-tight transition-colors " + (small ? "text-[11px] " : "text-xs ") + (val === i ? C.seg : C.mu)}>${t}</button>`)}</div>`;
  }
  function Chip({ on, children, onClick, cls }) {
    return html`<button onClick=${onClick} className=${"inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold shrink-0 " + (on ? C.on : C.ch + " " + C.tx) + " " + (cls || "")}>${children}</button>`;
  }
  function Sheet({ onClose, children, title }) {
    return html`<div className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center" onClick=${onClose}>
      <div onClick=${(e) => e.stopPropagation()} className=${"w-full max-w-[480px] rounded-t-3xl p-5 space-y-3 max-h-[88vh] overflow-y-auto bg-white dark:bg-[#1C1C1E] " + C.tx}
        style=${{ paddingBottom: "calc(20px + env(safe-area-inset-bottom, 0px))" }}>
        <div className="flex items-center"><div className="font-semibold flex-1">${title}</div><button aria-label="Chiudi" onClick=${onClose} className=${C.mu}><${Ic.X} size=${20} /></button></div>
        ${children}</div></div>`;
  }
  function FavPill({ m, unlocked, big }) {
    const f = m.p.indexOf(Math.max(...m.p));
    const p = m.p[f];
    return html`<span className=${"inline-flex items-center gap-1.5 rounded-full border tabular-nums font-semibold shrink-0 " + (big ? "px-3 py-1 text-sm " : "px-2.5 py-0.5 text-xs ") + TONE[confTone(p)]}>
      <span>${ESITI[f]}</span><span className=${unlocked ? "" : "blur-[4px] select-none"}>${pct(p)}%</span>${!unlocked && html`<${Ic.Lock} size=${10} className="opacity-60" />`}</span>`;
  }
  function Form({ list }) {
    return html`<div className="flex gap-1">${list.map((z, i) => html`<span key=${i} title=${z.avv + " " + z.ris}
      className=${"w-6 h-6 rounded-md border flex items-center justify-center text-[11px] font-semibold " + TONE[z.esito === "V" ? "good" : z.esito === "N" ? "warn" : "bad"]}>${z.esito}</span>`)}</div>`;
  }
  function ProbBar({ p }) {
    return html`<div className="space-y-1">
      <div className="flex h-2 rounded-full overflow-hidden gap-0.5">
        <i className="block bg-emerald-300 dark:bg-emerald-500/70" style=${{ width: pct(p[0]) + "%" }}></i>
        <i className="block bg-[#C7C7CC] dark:bg-[#48484A]" style=${{ width: pct(p[1]) + "%" }}></i>
        <i className="block bg-sky-300 dark:bg-sky-500/70" style=${{ width: pct(p[2]) + "%" }}></i></div>
      <div className=${"flex justify-between text-xs tabular-nums " + C.mu}><span>1 <b className=${C.tx}>${pct(p[0])}%</b></span><span>X <b className=${C.tx}>${pct(p[1])}%</b></span><span>2 <b className=${C.tx}>${pct(p[2])}%</b></span></div></div>`;
  }

  const Ctx = React.createContext(null);

    /* ---- riga partita ---- */
    function Row({ m, i }) {
    const { goMatch, unlocked } = React.useContext(Ctx);
    return html`<button onClick=${() => goMatch(m.id)} className=${"w-full flex items-center gap-3 px-4 py-2.5 text-left " + (i ? "border-t " + C.bd : "")}>
      <div className=${"w-11 shrink-0 text-xs font-semibold tabular-nums " + (m.st === "LIVE" ? "text-rose-500" : C.mu)}>${m.st === "FT" ? "FT" : m.st === "LIVE" ? "LIVE" : m.st === "RINV" ? "Rinv." : m.time || "-"}</div>
      <div className="flex-1 min-w-0 space-y-1">${[m.h, m.a].map((t, j) => html`<div key=${t} className="flex items-center gap-2"><${Crest} t=${t} size=${18} />
        <span className=${"text-[15px] truncate flex-1 " + C.tx + (m.g && m.g[j] > m.g[1 - j] ? " font-semibold" : "")}>${t}</span>
        <span className=${"text-[15px] font-semibold w-4 text-right tabular-nums " + C.tx}>${m.g ? m.g[j] : ""}</span></div>`)}</div>
      <div className="flex flex-col items-end gap-1 shrink-0">${m.free && html`<span className="text-[9px] font-bold tracking-wider text-emerald-600 dark:text-emerald-300">FREE</span>`}<${FavPill} m=${m} unlocked=${unlocked(m)} /></div></button>`;
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

    /* ---- scheda partita ---- */
    function MatchView({ m }) {
      const { D, lg, unlocked, setOpen, mt, setMt, mySlip, addLeg } = React.useContext(Ctx);
      const L = lg(m.lg);
      const [pOpen, setPOpen] = useState(null);
      const [filt, setFilt] = useState(0);
      const [l5, setL5] = useState(null);
      const fav = m.p.indexOf(Math.max(...m.p));
      const S = D.standings[m.lg];
      const st = S ? S[["generale", "casa", "trasferta"][filt]] : [];
      const pos = (t) => (S ? S.generale.findIndex((r) => r.team === t) + 1 : 0);
      const inSlip = mySlip.find((x) => x.id === m.id);
      const tiles = [
        { k: "Forma", i: Ic.TrendingUp, tone: m.forma.some((f) => f.tone === "warn") ? "warn" : m.forma.some((f) => f.tone === "good") ? "good" : "ok", body: html`<div className="space-y-1.5">${m.forma.map((f, j) => html`<div key=${j} className="flex gap-2"><span className=${"w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 " + DOT[f.tone]}></span><span><b>${j ? m.a : m.h}:</b> ${f.text}</span></div>`)}</div>` },
        { k: "Classifica vs attese", i: Ic.BarChart3, tone: m.attese.some((f) => f.tone !== "ok") ? "info" : "ok", body: html`<div className="space-y-1.5">${m.attese.map((f, j) => html`<div key=${j} className="flex gap-2"><span className=${"w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 " + DOT[f.tone]}></span><span><b>${j ? m.a : m.h}:</b> ${f.text}</span></div>`)}</div>` },
        { k: "Precedenti", i: Ic.Swords, tone: m.prec.tone, body: m.prec.text },
        { k: "Contesto", i: Ic.Clock, tone: m.ctx.tone, body: m.ctx.text },
        { k: "Formazioni", i: Ic.Users, tone: "ok", body: "Titolari, assenti e infortuni arriveranno con la raccolta dati quotidiana, insieme alle notizie dei giornali locali." },
        { k: "Quote", i: Ic.Calculator, tone: "ok", body: `Favorito per le quote: ${["casa", "pareggio", "ospiti"][m.mk.indexOf(Math.max(...m.mk))]}. Le quote riassumono già forma, classifica e precedenti: la lettura qui sopra spiega il perché.` },
      ];
      const opts = options(m);
      return html`<div className="px-4 space-y-3">
        <button onClick=${() => setOpen(null)} className="flex items-center gap-1 text-sm font-medium text-[#0A84FF]"><${Ic.ChevronLeft} size=${18} />Partite</button>
        <div className=${C.card + " p-4"}>
          <div className="flex items-center gap-2"><${Flag} k=${L.flag} w=${18} /><span className=${"text-xs " + C.mu}>${L.name}</span>
            <span className=${"ml-auto text-xs " + C.mu}>${m.date.slice(8)}/${m.date.slice(5, 7)} ${m.time || ""}</span></div>
          <div className="flex items-start justify-between mt-4">
            ${[m.h, m.a].map((t, j) => html`<div key=${t} className=${"flex flex-col items-center gap-1.5 w-28 " + (j ? "order-3" : "order-1")}><${Crest} t=${t} size=${44} />
              <span className=${"text-sm font-semibold text-center leading-tight " + C.tx}>${t}</span><span className=${"text-[11px] " + C.mu}>${pos(t) ? pos(t) + "° in classifica" : ""}</span></div>`)}
            <div className="order-2 flex flex-col items-center pt-2"><div className=${"text-3xl font-semibold tabular-nums " + C.tx}>${m.g ? m.g[0] + " - " + m.g[1] : m.time}</div>
              <div className=${"text-xs mt-1 " + C.mu}>${m.st === "FT" ? "Finale" : m.st === "LIVE" ? "In corso" : m.st === "RINV" ? "Rinviata" : ""}</div></div></div>
          <div className="flex items-center justify-center gap-2 mt-4"><${FavPill} m=${m} unlocked=${unlocked(m)} big=${true} />
            ${m.free && html`<span className=${"text-[10px] font-semibold px-2 py-0.5 rounded-full border " + TONE.good}>FREE oggi</span>`}
            ${m.st === "FT" && unlocked(m) && html`<span className=${"text-xs " + (m.res === fav ? "text-emerald-600 dark:text-emerald-300" : "text-rose-600 dark:text-rose-300")}>${m.res === fav ? "Favorito rispettato" : "Sorpresa"}</span>`}</div></div>
        <${Seg} small=${true} items=${["Panoramica", "Analisi IA", "Classifiche", "Campo"]} val=${mt} set=${setMt} />

        ${mt === 0 && html`<${React.Fragment}>
          <div className=${C.card + " p-4 space-y-3"}><div className="flex justify-between items-baseline"><span className=${C.lab}>Probabilità dalle quote</span><span className=${"text-[11px] " + C.mu}>Over 2.5: <b className=${C.tx}>${pct(m.mo)}%</b></span></div>
            <${ProbBar} p=${m.mk} />
            ${!D.demo && m.nb ? html`<div className=${"text-[11px] " + C.mu}>Quota media di ${m.nb} bookmaker.</div>` : null}
            <div className=${C.lab + " pt-1"}>Aggiungi alla tua schedina</div>
            <div className="flex flex-wrap gap-1.5">${opts.filter((o) => !o.stima).map((o) => html`<button key=${o.k} onClick=${() => addLeg(m, o.k)}
              className=${"inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border " + (inSlip && inSlip.k === o.k ? TONE.good : C.ch + " " + C.tx + " border-transparent")}>
              ${inSlip && inSlip.k === o.k ? html`<${Ic.Check} size=${12} />` : html`<${Ic.Plus} size=${12} />`}${o.k}<span className=${"font-normal " + C.mu}>${odd(o.q)}</span></button>`)}</div></div>
          <div className=${C.lab}>Lettura in 10 secondi - tocca per aprire</div>
          <${Gate} m=${m} title="Lettura IA: forma reale, attese, precedenti, contesto">
            <div className="grid grid-cols-2 gap-2">${tiles.map((t, i) => { const o = pOpen === i; return html`<button key=${t.k} onClick=${() => setPOpen(o ? null : i)} className=${C.card + " p-3 text-left " + (o ? "col-span-2" : "")}>
              <div className="flex items-center gap-2"><span className=${"w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border " + TONE[t.tone]}><${t.i} size=${15} /></span>
                <span className=${"flex-1 text-[13px] font-semibold leading-tight " + C.tx}>${t.k}</span><span className=${"w-2 h-2 rounded-full " + DOT[t.tone]}></span></div>
              ${o && html`<div className=${"text-sm mt-2 leading-relaxed " + C.tx}>${t.body}</div>`}</button>`; })}</div>
            ${m.flags.length > 0 && html`<div className="flex flex-wrap gap-1.5">${m.flags.map((f) => html`<span key=${f.text} className=${"text-[11px] font-semibold px-2 py-0.5 rounded-full border " + TONE[f.tone]}>${f.text}</span>`)}</div>`}
          <//><//>`}

        ${mt === 1 && html`<${Gate} m=${m} title="Analisi IA: probabilità, gol attesi e consiglio">
          <div className=${C.card + " p-4 space-y-2"}><div className="flex items-center gap-2"><span className=${"w-9 h-9 rounded-xl flex items-center justify-center border " + TONE.info}><${Ic.Sparkles} size=${17} /></span>
            <div><div className=${"text-sm font-semibold " + C.tx}>Consiglio IA</div><div className=${"text-xs " + C.mu}>Nessun consiglio per questa partita</div></div></div>
            <p className=${"text-sm " + C.tx}>Il consiglio compare solo quando l'IA ha un'informazione che le quote non hanno ancora assorbito: formazione ufficiale, infortunio dell'ultima ora, notizia dei giornali locali. Per questa partita non ce ne sono: le quote sono già la stima migliore.</p></div>
          <div className=${C.card + " p-4 space-y-2"}><div className=${C.lab}>Laboratorio: IA contro quote</div>
            <div className="overflow-x-auto"><table className=${"w-full text-sm tabular-nums " + C.tx}><thead><tr className=${"text-[11px] " + C.mu}><th className="text-left font-medium py-1">Esito</th><th className="text-right font-medium">IA</th><th className="text-right font-medium">Quote</th><th className="text-right font-medium">${D.demo ? "Bet365" : "Media"}</th><th className="text-right font-medium">Migliore</th></tr></thead>
              <tbody>${[["1", m.p[0], m.mk[0], m.odds["1"], m.max["1"]], ["X", m.p[1], m.mk[1], m.odds["X"], m.max["X"]], ["2", m.p[2], m.mk[2], m.odds["2"], m.max["2"]],
                ["Over 2.5", m.po, m.mo, m.odds.O, m.max.O], ["Under 2.5", 1 - m.po, 1 - m.mo, m.odds.U, m.max.U]].map((r) => html`<tr key=${r[0]} className=${"border-t " + C.bd}>
                <td className="py-1.5 font-semibold">${r[0]}</td><td className="text-right">${pct(r[1])}%</td><td className=${"text-right " + C.mu}>${pct(r[2])}%</td><td className="text-right">${odd(r[3])}</td><td className=${"text-right " + C.mu}>${odd(r[4])}</td></tr>`)}</tbody></table></div>
            <p className=${"text-[11px] " + C.mu}>${D.demo ? "\"Quote\" è la probabilità ricavata dalla quota togliendo il margine del bookmaker. Nel test su oltre 18.000 partite gli scarti tra IA e quote non hanno dato un vantaggio affidabile: per questo l'IA non li trasforma in consigli."
              : "Per ora l'IA usa come base la quota media dei bookmaker, perché nei test è la stima più precisa: se ne discosterà solo quando arriveranno formazioni ufficiali e notizie. \"Migliore\" è la quota più alta tra i bookmaker."}</p></div>
          ${m.xg[0] != null && html`<div className=${C.card + " p-4 grid grid-cols-3 gap-2 text-center"}>
            ${[["Gol attesi", (m.xg[0] || 0).toFixed(2).replace(".", ",") + " - " + (m.xg[1] || 0).toFixed(2).replace(".", ",")], ["Elo casa", m.elo[0] || "-"], ["Elo ospiti", m.elo[1] || "-"]].map(([a, b]) => html`<div key=${a} className=${"rounded-xl p-2 " + C.ch}>
              <div className=${"text-base font-semibold tabular-nums " + C.tx}>${b}</div><div className=${"text-[10px] " + C.mu}>${a}</div></div>`)}</div>`}<//>`}

        ${mt === 2 && html`<${React.Fragment}>
          <div className=${"flex items-center gap-2 text-sm font-semibold " + C.tx}><${Flag} k=${L.flag} />Classifica ${L.name}</div>
          <${Seg} items=${["Generale", "Solo Casa", "Solo Trasferta"]} val=${filt} set=${setFilt} />
          <div className=${C.card + " p-2 overflow-x-auto"}><table className=${"w-full text-sm tabular-nums " + C.tx}><thead><tr className=${"text-[11px] " + C.mu}>
            <th className="text-left font-medium p-1.5 w-6">#</th><th className="text-left font-medium">Squadra</th><th className="text-right font-medium">G</th><th className="text-right font-medium">V</th><th className="text-right font-medium">N</th><th className="text-right font-medium">P</th><th className="text-right font-medium">DR</th><th className="text-right font-medium pr-1.5">Pt</th></tr></thead>
            <tbody>${st.map((r, i) => { const hl = r.team === m.h || r.team === m.a; return html`<tr key=${r.team} className=${hl ? "bg-emerald-50 dark:bg-emerald-500/15 font-semibold" : ""}>
              <td className="p-1.5">${i + 1}</td><td><span className="flex items-center gap-1.5 min-w-0"><${Crest} t=${r.team} size=${14} /><span className="truncate">${r.team}</span></span></td>
              <td className=${"text-right " + C.mu}>${r.pg}</td><td className="text-right">${r.v}</td><td className="text-right">${r.n}</td><td className="text-right">${r.p}</td><td className="text-right">${r.gf - r.gs > 0 ? "+" : ""}${r.gf - r.gs}</td><td className="text-right pr-1.5 font-semibold">${r.pt}</td></tr>`; })}</tbody></table></div>
          <div className=${C.card + " p-4 space-y-2"}><div className=${C.lab}>Ultime 5</div>
            ${[m.h, m.a].map((t, j) => html`<div key=${t}><button onClick=${() => setL5(l5 === j ? null : j)} className="w-full flex items-center gap-2"><${Crest} t=${t} size=${16} />
              <span className=${"text-sm flex-1 text-left truncate " + C.tx}>${t}</span><${Form} list=${m.last5[j]} /><${Ic.ChevronDown} size=${14} className=${C.mu + (l5 === j ? " rotate-180" : "")} /></button>
              ${l5 === j && html`<div className="mt-2 space-y-1">${m.last5[j].slice().reverse().map((z, q) => html`<div key=${q} className=${"flex justify-between text-xs " + C.tx}><span className=${C.mu}>${z.data}</span><span className="flex-1 px-2 truncate">${z.casa ? "vs" : "@"} ${z.avv}</span><span className="font-semibold tabular-nums">${z.ris}</span></div>`)}</div>`}</div>`)}</div>
          <div className=${C.card + " p-4"}><div className=${C.lab + " mb-2"}>Scontri diretti</div>
            ${m.h2h.length ? m.h2h.map((z, q) => html`<div key=${q} className=${"flex justify-between text-sm py-1 tabular-nums " + C.tx}><span className=${C.mu + " w-16"}>${z.data}</span><span className="flex-1 text-right pr-2 truncate">${z.casa}</span><b>${z.ris}</b><span className="flex-1 pl-2 truncate">${z.ospite}</span></div>`)
              : html`<div className=${"text-sm " + C.mu}>${D.demo ? "Nessun precedente negli ultimi 8 anni." : "Nessun precedente nei dati disponibili."}</div>`}</div>
          ${!S && html`<div className=${C.card + " p-4 text-sm " + C.mu}>Classifica, ultime 5 e precedenti non sono disponibili per questo campionato nella fonte dati gratuita.</div>`}<//>`}

        ${mt === 3 && html`<${React.Fragment}>
          <div className=${C.card + " p-4 space-y-3"}><div className="flex justify-between"><span className=${C.lab}>Statistiche partita</span><span className=${"text-[11px] " + C.mu}>dati reali</span></div>
            <div className=${"flex justify-between text-xs font-semibold " + C.mu}><span className="flex items-center gap-1.5"><${Crest} t=${m.h} size=${14} />${m.h}</span><span className="flex items-center gap-1.5">${m.a}<${Crest} t=${m.a} size=${14} /></span></div>
            ${m.stats.length ? m.stats.map(([l, a, b]) => html`<div key=${l}><div className="flex justify-between text-sm tabular-nums"><span className=${"font-semibold " + (a >= b ? C.tx : C.mu)}>${a}</span><span className=${"text-xs " + C.mu}>${l}</span><span className=${"font-semibold " + (b >= a ? C.tx : C.mu)}>${b}</span></div>
              <div className="flex gap-1 mt-1"><div className=${"flex-1 h-1.5 rounded-full flex justify-end " + C.ch}><div className="h-1.5 rounded-full bg-emerald-300 dark:bg-emerald-500/70" style=${{ width: (a / (a + b || 1)) * 100 + "%" }}></div></div>
                <div className=${"flex-1 h-1.5 rounded-full " + C.ch}><div className="h-1.5 rounded-full bg-sky-300 dark:bg-sky-500/70" style=${{ width: (b / (a + b || 1)) * 100 + "%" }}></div></div></div></div>`)
              : html`<div className=${"text-sm " + C.mu}>${D.demo ? "Statistiche disponibili a fine partita." : "Tiri, angoli e falli non sono inclusi nella fonte dati gratuita: arriveranno con API-Football."}</div>`}</div>
          <div className=${C.card + " p-4 flex gap-3"}><span className=${"w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border " + TONE.ok}><${Ic.Shirt} size=${17} /></span>
            <div><div className=${"text-sm font-semibold " + C.tx}>Formazioni e campo</div><p className=${"text-sm " + C.mu}>Campo con i titolari, assenti, panchina e ballottaggi arriveranno con la raccolta dati quotidiana: le formazioni ufficiali escono 20-40 minuti prima del calcio d'inizio.</p></div></div><//>`}
      </div>`;
    }

    /* ---- campionati ---- */
    function LeaguesView() {
      const { D, lg, fav } = React.useContext(Ctx);
      const [k, setK] = useState(() => { const s0 = store.get("lgSel", null); return D.leagues.some((l) => l.k === s0) ? s0 : D.leagues[0].k; });
      const [filt, setFilt] = useState(0);
      const L = lg(k);
      const st = D.standings[k] ? D.standings[k][["generale", "casa", "trasferta"][filt]] : [];
      const ms = D.matches.filter((m) => m.lg === k);
      const zone = (i) => { const n = st.length; if (["I1", "E0", "SP1", "D1"].includes(k)) return i < 4 ? "bg-sky-400" : i >= n - 3 ? "bg-rose-400" : ""; return i < 2 ? "bg-emerald-400" : i >= n - 3 ? "bg-rose-400" : ""; };
      return html`<div className="px-4 space-y-3">
        <div className="flex gap-2 overflow-x-auto noscroll -mx-4 px-4">${D.leagues.map((l) => html`<${Chip} key=${l.k} on=${k === l.k} onClick=${() => { setK(l.k); store.set("lgSel", l.k); }}><${Flag} k=${l.flag} w=${16} />${l.name}<//>`)}</div>
        <div className=${"flex items-center gap-2 text-sm font-semibold " + C.tx}><${Flag} k=${L.flag} w=${22} />${L.country} - ${L.name} 2026/27</div>
        <${Seg} items=${["Generale", "Solo Casa", "Solo Trasferta"]} val=${filt} set=${setFilt} />
        <div className=${C.card + " p-2 overflow-x-auto"}><table className=${"w-full text-sm tabular-nums " + C.tx}><thead><tr className=${"text-[11px] " + C.mu}>
          <th className="text-left font-medium p-1.5 w-7">#</th><th className="text-left font-medium">Squadra</th><th className="text-right font-medium">G</th><th className="text-right font-medium">GF</th><th className="text-right font-medium">GS</th><th className="text-right font-medium pr-1.5">Pt</th></tr></thead>
          <tbody>${st.map((r, i) => html`<tr key=${r.team} className=${r.team === fav ? "bg-emerald-50 dark:bg-emerald-500/15 font-semibold" : ""}>
            <td className="p-1.5"><span className="flex items-center gap-1"><span className=${"w-1 h-4 rounded-full " + (zone(i) || "bg-transparent")}></span>${i + 1}</span></td>
            <td><span className="flex items-center gap-1.5 min-w-0"><${Crest} t=${r.team} size=${14} /><span className="truncate">${r.team}</span></span></td>
            <td className=${"text-right " + C.mu}>${r.pg}</td><td className="text-right">${r.gf}</td><td className="text-right">${r.gs}</td><td className="text-right pr-1.5 font-semibold">${r.pt}</td></tr>`)}</tbody></table></div>
        ${!st.length && html`<div className=${C.card + " p-4 text-sm " + C.mu}>Classifica non disponibile per questo campionato nella fonte dati gratuita.</div>`}
        <div className=${C.lab}>${D.demo ? "Partite della giornata" : "Partite in programma"}</div>
        <div className=${C.card + " overflow-hidden"}>${ms.map((m, i) => html`<${Row} key=${m.id} m=${m} i=${i} />`)}</div></div>`;
    }

    /* ---- il mio club ---- */
    function ClubView() {
      const { D, lg, fav, setFav } = React.useContext(Ctx);
      const lgK = Object.keys(D.standings).find((k) => D.standings[k].generale.some((r) => r.team === fav));
      const L = lgK && lg(lgK);
      const pos = lgK ? D.standings[lgK].generale.findIndex((r) => r.team === fav) + 1 : 0;
      const row = lgK && D.standings[lgK].generale[pos - 1];
      const m = D.matches.find((x) => x.h === fav || x.a === fav);
      const l5 = m ? m.last5[m.h === fav ? 0 : 1] : [];
      return html`<div className="px-4 space-y-3">
        <div className=${C.card + " p-4"}><div className="flex items-center gap-3"><${Crest} t=${fav} size=${52} />
          <div className="flex-1 min-w-0"><div className=${"text-xs " + C.mu}>Squadra del cuore</div><div className=${"text-xl font-semibold truncate " + C.tx}>${fav}</div>
            ${L && html`<div className=${"text-xs flex items-center gap-1.5 " + C.mu}><${Flag} k=${L.flag} w=${14} />${L.name} - ${pos}° con ${row.pt} punti</div>`}</div></div>
          ${l5.length > 0 && html`<div className="mt-4"><div className=${C.lab + " mb-1.5"}>Ultime 5</div><${Form} list=${l5} /></div>`}</div>
        ${m ? html`<div className=${C.lab}>Partita della giornata</div><div className=${C.card + " overflow-hidden"}><${Row} m=${m} i=${0} /></div>`
          : html`<div className=${C.card + " p-4 text-sm " + C.mu}>${fav} non gioca in questa giornata.</div>`}
        <div className=${C.card + " p-4 space-y-2"}><label htmlFor="fav" className=${C.lab}>Cambia squadra</label>
          <select id="fav" value=${fav} onChange=${(e) => { setFav(e.target.value); store.set("fav", e.target.value); }} className=${"w-full rounded-xl px-3 py-2 text-sm " + C.ch + " " + C.tx}>
            ${D.leagues.map((l) => html`<optgroup key=${l.k} label=${l.name}>${(D.standings[l.k] ? D.standings[l.k].generale.map((r) => r.team) : [...new Set(D.matches.filter((x) => x.lg === l.k).flatMap((x) => [x.h, x.a]))]).slice().sort().map((t) => html`<option key=${t} value=${t}>${t}</option>`)}</optgroup>`)}</select></div></div>`;
    }

    /* ---- schedina ---- */
    function SlipView() {
      const { D, lg, byId, pro, mySlip, setMySlip, setUnlock, doCopy } = React.useContext(Ctx);
      const [prof, setProf] = useState(0);
      const [off, setOff] = useState(store.get("slipOff", []));
      const [shield, setShield] = useState(false);
      const pool = D.matches.filter((m) => !off.includes(m.lg) && (D.demo || m.st === "NS"));
      let legs = buildSlip(pool, prof);
      const weak = legs.length ? legs.reduce((a, b) => (a.p < b.p ? a : b)) : null;
      if (shield && weak) {
        const alt = options(weak.m).sort((a, b) => b.p - a.p)[0];
        legs = legs.map((l) => (l === weak ? { m: l.m, ...alt, shielded: true } : l));
      }
      const tot = legs.reduce((a, l) => a * l.q, 1), prob = legs.reduce((a, l) => a * l.p, 1);
      const done = legs.filter((l) => hit(l.m, l.k) !== null), won = done.filter((l) => hit(l.m, l.k));
      const mine = mySlip.map((x) => ({ ...x, m: byId[x.id] })).filter((x) => x.m).map((x) => ({ ...x, ...options(x.m).find((o) => o.k === x.k) }));
      const mTot = mine.reduce((a, l) => a * (l.q || 1), 1), mProb = mine.reduce((a, l) => a * (l.p || 1), 1);
      const text = (ls, wa) => (wa ? "*Schedina AuraPitch*\n" : "") + ls.map((l) => (wa ? "- " : "") + `${l.m.h} - ${l.m.a}: ${wa ? "*" + l.k + "*" : l.k} @ ${odd(l.q)}`).join("\n") + `\nQuota totale ${odd(ls.reduce((a, l) => a * l.q, 1))}`;
      const LegRow = ({ l, onDel }) => { const h = hit(l.m, l.k); return html`<div className=${"flex items-center gap-2 py-2 border-t first:border-t-0 " + C.bd}>
        <div className="flex-1 min-w-0"><div className=${"text-sm truncate " + C.tx}>${l.m.h} - ${l.m.a}</div><div className=${"text-[11px] " + C.mu}>${lg(l.m.lg).name} - IA ${pct(l.p)}%${l.stima ? " - quota stimata senza margine" : ""}${l.shielded ? " - protetta" : ""}</div></div>
        <span className=${"text-sm font-semibold " + C.tx}>${l.k}</span><span className=${"text-sm tabular-nums w-11 text-right " + C.mu}>${odd(l.q)}</span>
        ${h === null ? null : h ? html`<${Ic.CheckCircle2} size=${17} className="text-emerald-500" />` : html`<${Ic.XCircle} size=${17} className="text-rose-500" />`}
        ${onDel && html`<button aria-label="Rimuovi" onClick=${onDel} className=${C.mu}><${Ic.Trash2} size=${15} /></button>`}</div>`; };
      return html`<div className="px-4 space-y-3">
        <div className=${C.lab}>Schedina IA</div>
        <div className="flex gap-2 overflow-x-auto noscroll -mx-4 px-4">${D.leagues.map((l) => html`<${Chip} key=${l.k} on=${!off.includes(l.k)} onClick=${() => { const nx = off.includes(l.k) ? off.filter((q) => q !== l.k) : [...off, l.k]; setOff(nx); store.set("slipOff", nx); }}><${Flag} k=${l.flag} w=${16} />${l.name}<//>`)}</div>
        <div className="grid grid-cols-3 gap-2">${["Zero Tachicardia", "Classica del Sabato", "Colpaccio da Bar"].map((p, i) => { const lk = i === 2 && !pro; return html`<button key=${p} onClick=${() => (lk ? setUnlock(true) : (setProf(i), setShield(false)))}
          className=${C.card + " p-3 text-xs font-semibold text-center " + C.tx + (prof === i ? " ring-2 ring-emerald-300 dark:ring-emerald-500/60" : "")}>${p}${lk && html`<div className="text-[10px] mt-1 text-amber-600 dark:text-amber-300 flex items-center justify-center gap-1"><${Ic.Lock} size=${10} />PRO</div>`}</button>`; })}</div>
        <div className=${C.card + " px-4 py-2"}>${legs.length ? legs.map((l) => html`<${LegRow} key=${l.m.id} l=${l} />`) : html`<div className=${"py-3 text-sm " + C.mu}>Nessuna partita adatta a questo profilo nei campionati scelti.</div>`}</div>
        ${legs.length > 0 && html`<div className=${C.card + " p-4 space-y-2"}>
          <div className="flex justify-between text-sm"><span className=${C.mu}>${D.demo ? "Quota totale (Bet365)" : "Quota totale (quote medie)"}</span><b className=${"tabular-nums " + C.tx}>${odd(tot)}</b></div>
          <div className="flex justify-between text-sm"><span className=${C.mu}>Probabilità che passi, secondo l'IA</span><b className=${"tabular-nums " + C.tx}>${(prob * 100).toFixed(1).replace(".", ",")}%</b></div>
          ${done.length > 0 && html`<div className=${"text-xs font-semibold " + (won.length === done.length ? "text-emerald-600 dark:text-emerald-300" : "text-rose-600 dark:text-rose-300")}>Verifica sulla giornata: ${won.length} su ${done.length} esiti corretti${won.length === done.length ? ", schedina vinta" : ""}.</div>`}
          ${weak && html`<div className=${"rounded-xl border p-3 text-sm " + TONE.bad}><div className="font-semibold flex items-center gap-1.5"><${Ic.AlertTriangle} size=${14} />Anello debole</div>
            <div>${shield ? "Protetto dallo Scudo IA: la gamba più fragile è passata all'esito più probabile della stessa partita." : `${weak.m.h} - ${weak.m.a}, ${weak.k} (IA ${pct(weak.p)}%) è la gamba più fragile.`}</div>
            <button onClick=${() => setShield(!shield)} className=${"mt-2 inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-full " + (shield ? TONE.good + " border" : C.on)}><${Ic.ShieldCheck} size=${13} />${shield ? "Scudo IA attivo" : "Scudo IA: proteggi"}</button></div>`}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button onClick=${() => doCopy(text(legs, false))} className=${"py-2.5 rounded-xl border text-sm font-semibold flex items-center justify-center gap-1.5 " + TONE.good}><${Ic.Copy} size=${15} />Copia</button>
            <button onClick=${() => doCopy(text(legs, true))} className=${"py-2.5 rounded-xl border text-sm font-semibold flex items-center justify-center gap-1.5 " + TONE.good}><${Ic.Smartphone} size=${15} />Per WhatsApp</button></div></div>`}
        <div className=${C.lab + " pt-2"}>La mia schedina</div>
        <div className=${C.card + " px-4 py-2"}>${mine.length ? mine.map((l) => html`<${LegRow} key=${l.id} l=${l} onDel=${() => setMySlip(mySlip.filter((x) => x.id !== l.id))} />`)
          : html`<div className=${"py-3 text-sm " + C.mu}>Vuota. Apri una partita e tocca un esito in "Aggiungi alla tua schedina".</div>`}</div>
        ${mine.length > 0 && html`<div className=${C.card + " p-4 space-y-2"}>
          <div className="flex justify-between text-sm"><span className=${C.mu}>Quota totale</span><b className=${"tabular-nums " + C.tx}>${odd(mTot)}</b></div>
          <div className="flex justify-between text-sm"><span className=${C.mu}>Probabilità secondo l'IA</span><b className=${"tabular-nums " + C.tx}>${(mProb * 100).toFixed(1).replace(".", ",")}%</b></div>
          <div className="grid grid-cols-3 gap-2 pt-1">
            <button onClick=${() => doCopy(text(mine, false))} className=${"py-2 rounded-xl border text-xs font-semibold " + TONE.good}>Copia</button>
            <button onClick=${() => doCopy(text(mine, true))} className=${"py-2 rounded-xl border text-xs font-semibold " + TONE.good}>WhatsApp</button>
            <button onClick=${() => setMySlip([])} className=${"py-2 rounded-xl text-xs font-semibold " + C.ch + " " + C.tx}>Svuota</button></div></div>`}
        <p className=${"text-[11px] " + C.mu}>Le probabilità sono stime: nessuna schedina è sicura. Gioca solo cifre che puoi permetterti di perdere.</p></div>`;
    }


  /* ---------- app ---------- */
  function App() {
    const [D, setD] = useState(null);
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
    const [fav, setFav] = useState(store.get("fav", "Napoli"));
    const [mySlip, setMySlip] = useState(store.get("slip", []));
    const [banner, setBanner] = useState(store.get("banner2", true));
    const [copyText, setCopyText] = useState(null);
    const [toast, setToast] = useState("");

    useEffect(() => {
      fetch("data/giornata.json").then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }).then((d) => { setD(d); if (d.today && (d.days || []).some((x) => x.k === d.today)) setDay(d.today); })
        .catch(() => setErr("Non riesco a leggere i dati delle partite. Controlla la connessione e ricarica la pagina."));
      try { if ("serviceWorker" in navigator && window.top === window.self) navigator.serviceWorker.register("sw.js").catch(() => {}); } catch (e) { /* non installabile qui */ }
    }, []);
    useEffect(() => {
      const apply = () => {
        const dark = theme === "dark" || (theme === "system" && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
        document.documentElement.dataset.theme = dark ? "dark" : "light";
        const meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.content = dark ? "#000000" : "#F5F5F7";
      };
      apply(); store.set("theme", theme);
      const mq = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
      if (mq && mq.addEventListener) { mq.addEventListener("change", apply); return () => mq.removeEventListener("change", apply); }
    }, [theme]);
    useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
    useEffect(() => {
      if (ad === null) return;
      if (ad === 0) { const u = Date.now() + 15 * 60 * 1000 - 1000; setUntil(u); store.set("until", u); setAd(null); setUnlock(false); flash("PRO attivo per 15 minuti"); return; }
      const id = setTimeout(() => setAd(ad - 1), 1000); return () => clearTimeout(id);
    }, [ad]);
    useEffect(() => store.set("slip", mySlip), [mySlip]);
    useEffect(() => { if (toast) { const id = setTimeout(() => setToast(""), 1800); return () => clearTimeout(id); } }, [toast]);
    const flash = (t) => setToast(t);

    const left = Math.max(0, Math.ceil((until - now) / 1000));
    const pro = !!sub || left > 0;
    const unlocked = (m) => pro || m.free;
    const ini = (name.trim() ? name.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("") : "IO").toUpperCase();

    if (err) return html`<div className="p-6 text-center text-sm ${C.mu}">${err}</div>`;
    if (!D) return html`<div className="p-12 text-center text-sm ${C.mu}">Caricamento delle partite...</div>`;
    const byId = Object.fromEntries(D.matches.map((m) => [m.id, m]));
    const lg = (k) => D.leagues.find((l) => l.k === k);
    const lgOpen = openL || D.leagues.map((l) => l.k);
    const goMatch = (id) => { setOpen(id); setMt(0); window.scrollTo(0, 0); };
    const addLeg = (m, k) => {
      if (mySlip.some((x) => x.id === m.id)) { setMySlip(mySlip.map((x) => (x.id === m.id ? { id: m.id, k } : x))); flash("Esito aggiornato in schedina"); }
      else { setMySlip([...mySlip, { id: m.id, k }]); flash("Aggiunta alla schedina"); }
    };
    const doCopy = async (t) => {
      try { await navigator.clipboard.writeText(t); flash("Copiata negli appunti"); } catch (e) { setCopyText(t); }
    };

    /* ---- header ---- */
    const header = html`<header className="sticky z-30 bg-[#F5F5F7]/90 dark:bg-black/90 backdrop-blur-md" style=${{ top: "env(safe-area-inset-top, 0px)" }}>
      <div className="max-w-[480px] mx-auto px-4 py-3 flex items-center gap-2">
        <button onClick=${() => { setOpen(null); setTab("partite"); }} className="flex items-center gap-2 mr-auto" aria-label="AuraPitch, vai alle partite">
          <span className="w-8 h-8 rounded-[10px] flex items-center justify-center bg-[#1D1D1F] dark:bg-white"><${Ic.Activity} size=${17} className="text-emerald-300 dark:text-emerald-600" /></span>
          <span className=${"text-[17px] font-semibold tracking-tight " + C.tx}>AuraPitch</span>
          <span className=${"text-[10px] font-semibold px-1.5 py-0.5 rounded-md " + C.ch + " " + C.mu}>BETA</span></button>
        <button onClick=${() => setUnlock(true)} className=${"text-[11px] font-semibold px-2.5 py-1 rounded-full border tabular-nums " + (pro ? TONE.warn : C.ch + " " + C.tx + " border-transparent")}>${sub ? "PRO" : left > 0 ? "PRO " + mmss(left) : "FREE"}</button>
        <button aria-label="Guida rapida" onClick=${() => setGuide(guide ? 0 : 1)} className=${"w-8 h-8 rounded-full flex items-center justify-center " + C.ch + " " + C.tx}><${Ic.HelpCircle} size=${15} /></button>
        <button aria-label="Profilo e impostazioni" onClick=${() => setProfile(true)} className=${"w-8 h-8 rounded-full text-[11px] font-semibold " + C.on}>${ini}</button>
      </div></header>`;

    const steps = ["Partite: tocca un campionato per aprirlo. La pillola a destra dice il favorito e la sua probabilità.", "Tocca una partita: Panoramica, Analisi IA, Classifiche e Campo. Le card si aprono al tocco.",
      "Le analisi IA sono libere sulle partite FREE; sulle altre si sbloccano con PRO o con un video da 15 minuti.", "In Schedina IA scegli un profilo o costruisci la tua schedina dalle partite."];
    const guideBox = guide > 0 && html`<div className=${"mx-4 mb-3 p-3 rounded-2xl border text-sm flex items-start gap-2 " + TONE.info}>
      <div className="flex-1"><b>Guida ${guide}/4.</b> ${steps[guide - 1]}</div>
      <button aria-label="Passo precedente" onClick=${() => setGuide(Math.max(1, guide - 1))}><${Ic.ChevronLeft} size=${18} /></button>
      <button aria-label=${guide === 4 ? "Chiudi la guida" : "Passo successivo"} onClick=${() => { if (guide === 4) { setGuide(0); store.set("guideSeen", true); } else setGuide(guide + 1); }}>${guide === 4 ? html`<${Ic.X} size=${18} />` : html`<${Ic.ChevronRight} size=${18} />`}</button></div>`;

    /* ---- vista partite ---- */
    const dayMatches = D.matches.filter((m) => (day === "all" || m.date === day) && (!liveOnly || m.st === "LIVE"));
    const home = html`<div className="px-4 space-y-3">
      ${banner && html`<div className=${C.card + " p-3 flex gap-3 items-start"}><${Ic.Info} size=${16} className="text-sky-500 shrink-0 mt-0.5" />
        <div className=${"text-[13px] flex-1 " + C.tx}>${D.demo ? html`Beta con <b>dati reali</b> della giornata ${D.label}. Le partite sono già giocate: puoi confrontare le letture dell'IA con i risultati.`
          : html`Beta con <b>dati reali</b>, ${D.label}: quote medie di decine di bookmaker, risultati e classifiche. Si aggiorna da sola ogni mattina e durante le partite.`}</div>
        <button aria-label="Chiudi avviso" onClick=${() => { setBanner(false); store.set("banner2", false); }} className=${C.mu}><${Ic.X} size=${16} /></button></div>`}
      <div className="flex gap-2 overflow-x-auto noscroll -mx-4 px-4">${[{ k: "all", label: D.demo ? "Tutta la giornata" : "Tutti i giorni" }, ...D.days].map((d) => html`<${Chip} key=${d.k} on=${day === d.k} onClick=${() => setDay(d.k)}>${d.label}<//>`)}</div>
      <div className="w-40"><${Seg} items=${["Tutte", "Live"]} val=${liveOnly} set=${setLiveOnly} /></div>
      ${D.leagues.map((l) => {
        const ms = dayMatches.filter((m) => m.lg === l.k);
        if (!ms.length) return null;
        const o = lgOpen.includes(l.k);
        const toggle = () => { const nx = o ? lgOpen.filter((q) => q !== l.k) : [...lgOpen, l.k]; setOpenL(nx); store.set("openL", nx); };
        return html`<div key=${l.k} className=${C.card + " overflow-hidden"}>
          <button onClick=${toggle} aria-expanded=${o} className="w-full flex items-center gap-3 px-4 py-3"><${Flag} k=${l.flag} />
            <span className=${"flex-1 text-left text-sm font-semibold " + C.tx}>${l.country} - ${l.name}</span><span className=${"text-xs " + C.mu}>${ms.length}</span>
            <${Ic.ChevronDown} size=${16} className=${C.mu + " transition-transform " + (o ? "rotate-180" : "")} /></button>
          ${o && html`<div className=${"border-t " + C.bd}>${ms.map((m, i) => html`<${Row} key=${m.id} m=${m} i=${i} />`)}</div>`}</div>`;
      })}
      ${!dayMatches.length && html`<div className=${C.card + " p-6 text-center text-sm " + C.mu}>${liveOnly ? "Nessuna partita in corso in questo momento." : "Nessuna partita in questo giorno."}</div>`}
      <p className=${"text-[11px] text-center " + C.mu}>${D.demo ? "Dati: Football-Data.co.uk, ClubElo." : "Dati: quote da The Odds API; risultati e classifiche da football-data.org."} Stemmi generici, non ufficiali.</p></div>`;

    const open_m = open && byId[open];
    const views = { partite: home, campionati: html`<${LeaguesView} />`, schedina: html`<${SlipView} />`, club: html`<${ClubView} />` };
    const DOCK = [["partite", "Partite", Ic.Calendar], ["campionati", "Campionati", Ic.Trophy], ["schedina", "Schedina IA", Ic.Sparkles], ["club", "Il Mio Club", Ic.Shield]];

    const ctx = { D, byId, lg, pro, unlocked, goMatch, setOpen, mt, setMt, addLeg, mySlip, setMySlip, doCopy, setUnlock, fav, setFav };
    return html`<${Ctx.Provider} value=${ctx}><div className="min-h-screen pb-28">
      ${header}
      <main className="max-w-[480px] mx-auto">${guideBox}${open_m ? html`<${MatchView} key=${open_m.id} m=${open_m} />` : views[tab]}</main>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-black/[0.06] dark:border-white/[0.08] backdrop-blur-md bg-white/90 dark:bg-[#1C1C1E]/90"
        style=${{ paddingBottom: "env(safe-area-inset-bottom, 0px)", paddingLeft: "env(safe-area-inset-left, 0px)", paddingRight: "env(safe-area-inset-right, 0px)" }}>
        <div className="max-w-[480px] mx-auto grid grid-cols-4">${DOCK.map(([k, l, I]) => html`<button key=${k} onClick=${() => { setTab(k); setOpen(null); window.scrollTo(0, 0); }}
          aria-current=${tab === k && !open ? "page" : undefined}
          className=${"flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium " + (tab === k && !open ? "text-[#0A84FF]" : C.mu)}><${I} size=${22} />${l}</button>`)}</div></nav>

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

      ${profile && html`<${Sheet} title="Profilo e impostazioni" onClose=${() => setProfile(false)}>
        <label htmlFor="nome" className=${C.lab}>Il tuo nome</label>
        <input id="nome" value=${name} onChange=${(e) => { setName(e.target.value); store.set("name", e.target.value); }} placeholder="Come ti chiami?" className=${"w-full rounded-xl px-3 py-2 outline-none " + C.ch + " " + C.tx} />
        <div className=${C.lab}>Tema</div>
        <${Seg} items=${["Automatico", "Chiaro", "Scuro"]} val=${["system", "light", "dark"].indexOf(theme)} set=${(i) => setTheme(["system", "light", "dark"][i])} />
        <div className=${C.lab}>Squadra del cuore</div>
        <div className=${"text-sm " + C.tx}>${fav} <button onClick=${() => { setProfile(false); setOpen(null); setTab("club"); }} className="text-[#0A84FF] font-medium ml-1">Cambia</button></div>
        <div className=${C.lab}>Accesso</div>
        <div className="grid grid-cols-2 gap-2">${["Google", "Apple"].map((p) => html`<button key=${p} disabled className=${"py-2.5 rounded-xl text-sm font-semibold opacity-50 " + C.ch + " " + C.tx}>${p}</button>`)}</div>
        <p className=${"text-xs " + C.mu}>Nella beta i tuoi dati restano solo su questo dispositivo. L'accesso con Google e Apple arriverà con la versione pubblica.</p><//>`}

      ${copyText !== null && html`<${Sheet} title="Copia la schedina" onClose=${() => setCopyText(null)}>
        <p className=${"text-sm " + C.mu}>Il telefono non ha permesso la copia automatica: tieni premuto sul testo e scegli Copia.</p>
        <textarea readOnly value=${copyText} rows=${8} className=${"w-full rounded-xl p-3 text-sm " + C.ch + " " + C.tx} onFocus=${(e) => e.target.select()}></textarea><//>`}

      ${toast && html`<div role="status" className="fixed left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full text-sm font-medium shadow-lg bg-[#1D1D1F] text-white dark:bg-white dark:text-black"
        style=${{ bottom: "calc(84px + env(safe-area-inset-bottom, 0px))" }}>${toast}</div>`}
    </div><//>`;
  }

  createRoot(document.getElementById("root")).render(html`<${App} />`);
