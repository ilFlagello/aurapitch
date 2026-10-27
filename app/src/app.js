/* AuraPitch beta - web app installabile.
   Si compila con build.mjs (esbuild + Tailwind): il risultato in dist/ non dipende da CDN esterni.
   Icone: set Lucide (pacchetto react-icons/lu). Dati: data/giornata.json. */
import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import htm from "htm";
import { useLiveScores, useSummary, loadPlayer, loadCareer, ruolo, findTeam, loadTeam, minuto, ESPN_LG } from "./live.js";
import { LuActivity, LuCalculator, LuCalendar, LuChartColumn, LuCheck, LuChevronDown, LuChevronLeft, LuChevronRight, LuChevronUp, LuCircleCheck, LuCircleDot, LuCircleHelp, LuCircleX, LuClock, LuCopy, LuCrown, LuInfo, LuLock, LuMoon, LuNewspaper, LuPlay, LuPlus, LuRepeat, LuShield, LuShieldCheck, LuShirt, LuSmartphone, LuSparkles, LuStar, LuSun, LuSwords, LuTrash2, LuTrendingUp, LuTriangleAlert, LuTrophy, LuUsers, LuX, LuZap } from "react-icons/lu";

const html = htm.bind(React.createElement);
const Ic = { Calendar: LuCalendar, Trophy: LuTrophy, Sparkles: LuSparkles, Shield: LuShield, Sun: LuSun, Moon: LuMoon, HelpCircle: LuCircleHelp, X: LuX, ChevronLeft: LuChevronLeft, ChevronRight: LuChevronRight, ChevronDown: LuChevronDown, ChevronUp: LuChevronUp, Lock: LuLock, Play: LuPlay, Crown: LuCrown, Zap: LuZap, Copy: LuCopy, Check: LuCheck, Plus: LuPlus, Trash2: LuTrash2, TrendingUp: LuTrendingUp, Swords: LuSwords, Users: LuUsers, Activity: LuActivity, Newspaper: LuNewspaper, Calculator: LuCalculator, BarChart3: LuChartColumn, AlertTriangle: LuTriangleAlert, Info: LuInfo, Star: LuStar, ShieldCheck: LuShieldCheck, CircleDot: LuCircleDot, Shirt: LuShirt, Smartphone: LuSmartphone, CheckCircle2: LuCircleCheck, XCircle: LuCircleX, Clock: LuClock, Repeat: LuRepeat };
Ic.Ball = ({ size = 14, className = "" }) => html`<svg width=${size} height=${size} viewBox="0 0 24 24" className=${className} aria-hidden="true"><circle cx="12" cy="12" r="10" fill="currentColor" /><path d="M12 7.2l3.3 2.4-1.3 3.9h-4l-1.3-3.9z" fill="#fff" /><path d="M12 2v5.2M15.3 9.6l4.6-1.8M14 13.5l2.6 4.3M10 13.5l-2.6 4.3M8.7 9.6L4.1 7.8" stroke="#fff" strokeWidth="1.2" fill="none" /></svg>`;

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
  // codici dei mercati (stessa logica di mercati.py): 1, X, 2, 1X, O2.5, U3.5, GG, NG, MG1-3, HO0.5 (casa segna oltre 0,5), AU0.5, CS2-1, combo "1+O1.5", PARI, DISPARI
  const LEGACY = { "Over 2.5": "O2.5", "Under 2.5": "U2.5" };
  const norm = (c) => LEGACY[c] || c;
  const nf = (x) => String(x).replace(".", ",");
  function evalCode(c, h, a) {
    if (c.includes("+")) return c.split("+").every((x) => evalCode(x, h, a));
    const t = h + a;
    if (["1", "X", "2", "1X", "X2", "12"].includes(c)) return c.includes(h > a ? "1" : h === a ? "X" : "2");
    if (c === "GG") return h > 0 && a > 0;
    if (c === "NG") return h === 0 || a === 0;
    if (c === "PARI") return t % 2 === 0;
    if (c === "DISPARI") return t % 2 === 1;
    if (c.startsWith("CS")) { const [x, y] = c.slice(2).split("-").map(Number); return h === x && a === y; }
    if (c.startsWith("MG")) { const [x, y] = c.slice(2).split("-").map(Number); return t >= x && t <= y; }
    if (/^[HA][OU]/.test(c)) { const g = c[0] === "H" ? h : a, n = parseFloat(c.slice(2)); return c[1] === "O" ? g > n : g < n; }
    if (/^[OU]/.test(c)) { const n = parseFloat(c.slice(1)); return c[0] === "O" ? t > n : t < n; }
    return null;
  }
  function mLabel(m, c, short) {
    c = norm(c);
    if (c.includes("+")) return c.split("+").map((x) => mLabel(m, x, true)).join(" + ");
    if (c === "1") return short ? "1" : "1 (" + m.h + ")";
    if (c === "2") return short ? "2" : "2 (" + m.a + ")";
    if (c === "X") return short ? "X" : "X (pareggio)";
    if (["1X", "X2", "12"].includes(c)) return c;
    if (c === "GG") return short ? "Goal" : "Goal (segnano entrambe)";
    if (c === "NG") return "No Goal";
    if (c === "PARI" || c === "DISPARI") return "Somma gol " + c.toLowerCase();
    if (c.startsWith("CS")) return "Esatto " + c.slice(2);
    if (c.startsWith("MG")) return "Multigol " + c.slice(2);
    if (c === "HO0.5") return m.h + " segna";
    if (c === "AO0.5") return m.a + " segna";
    if (c === "HO1.5") return m.h + " almeno 2 gol";
    if (c === "AO1.5") return m.a + " almeno 2 gol";
    if (c === "AU0.5") return m.h + " non subisce";
    if (c === "HU0.5") return m.a + " non subisce";
    if (/^[OU]/.test(c)) return (c[0] === "O" ? "Over " : "Under ") + nf(c.slice(1));
    return c;
  }
  const GROUPS = ["Esito finale", "Doppia chance", "Under/Over", "Goal/No Goal", "Multigol", "Gol squadra", "Combo", "Risultato esatto", "Pari/Dispari"];
  function mGroup(c) {
    if (c.includes("+")) return "Combo";
    if (["1", "X", "2"].includes(c)) return "Esito finale";
    if (["1X", "X2", "12"].includes(c)) return "Doppia chance";
    if (c === "GG" || c === "NG") return "Goal/No Goal";
    if (c === "PARI" || c === "DISPARI") return "Pari/Dispari";
    if (c.startsWith("CS")) return "Risultato esatto";
    if (c.startsWith("MG")) return "Multigol";
    if (/^[HA][OU]/.test(c)) return "Gol squadra";
    return "Under/Over";
  }
  function options(m) {
    if (m.markets) return m.markets.map(([c, p, q, qm]) => ({ k: c, p, q, stima: !qm }));
    const [p1, px, p2] = m.p, o = m.odds, po = m.po, mk = m.mk;
    // dati vecchi senza mercati: doppia chance con quota "equa" ricavata dalle probabilita, minimo 1,01
    const dc = (a, b) => Math.max(1.01, 1 / (mk[a] + mk[b]));
    return [
      { k: "1", p: p1, q: o["1"] }, { k: "X", p: px, q: o["X"] }, { k: "2", p: p2, q: o["2"] },
      { k: "1X", p: p1 + px, q: dc(0, 1), stima: true }, { k: "X2", p: px + p2, q: dc(1, 2), stima: true },
      { k: "12", p: p1 + p2, q: dc(0, 2), stima: true },
      { k: "O2.5", p: po, q: o["O"] }, { k: "U2.5", p: 1 - po, q: o["U"] },
    ].filter((x) => x.q);
  }
  function hit(m, k) {
    if (m.st !== "FT" || !m.g) return null;
    return evalCode(norm(k), m.g[0], m.g[1]);
  }
  function buildSlip(matches, prof) {
    const legs = [];
    for (const m of matches) {
      const opts = options(m).filter((o) => !/^CS|PARI|DISPARI/.test(o.k));
      const tip = m.tip || {};
      let best = null;
      const fromTip = (t) => t && opts.find((o) => o.k === t.c);
      if (prof === 0) best = fromTip(tip.prudente) || opts.filter((o) => ["1X", "X2", "12", "U2.5", "O2.5", "O1.5", "U3.5"].includes(o.k) && o.p >= 0.7 && o.q >= 1.2).sort((a, b) => b.p - a.p)[0];
      if (prof === 1) best = fromTip(tip.consiglio) || opts.filter((o) => ["1", "2"].includes(o.k) && o.p >= 0.5).sort((a, b) => b.p - a.p)[0];
      if (prof === 2) best = fromTip(tip.coraggiosa) || opts.filter((o) => o.q >= 2 && o.q <= 4).sort((a, b) => b.p * b.q - a.p * a.q)[0];
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
      <div className=${"w-11 shrink-0 text-xs font-semibold tabular-nums " + (m.st === "LIVE" ? "text-rose-500" : C.mu)}>${m.st === "FT" ? "FT" : m.st === "LIVE" ? (m.clock || "LIVE") : m.st === "RINV" ? "Rinv." : m.time || "-"}</div>
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

    /* ---- dati live: azione in campo, momenti chiave, statistiche, cronaca, formazioni, giocatore ---- */
    const KEY_T = /goal|penalty|red-card|yellow-card|substitution|shot-on-target|woodwork|halftime|end-regular|own-goal|var/;
    function trasf(side, x, y) {
      if (x == null || y == null) return null;
      return side === 1 ? [105 - x * 1.05, y * 0.68] : [x * 1.05, 68 - y * 0.68];
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
          <svg viewBox="-2 -2 109 72" className="w-full rounded-xl" style=${{ background: "#3f8f5a" }}>
            ${[0, 1, 2, 3, 4, 5, 6].map((i) => html`<rect key=${i} x=${i * 15} y="0" width="7.5" height="68" fill="#ffffff" opacity="0.04" />`)}
            <g fill="none" stroke="#ffffff" strokeOpacity="0.7" strokeWidth="0.4">
              <rect x="0" y="0" width="105" height="68" /><line x1="52.5" y1="0" x2="52.5" y2="68" /><circle cx="52.5" cy="34" r="9.15" />
              <rect x="0" y="13.84" width="16.5" height="40.32" /><rect x="88.5" y="13.84" width="16.5" height="40.32" />
              <rect x="0" y="24.84" width="5.5" height="18.32" /><rect x="99.5" y="24.84" width="5.5" height="18.32" />
              <rect x="-1.5" y="30.34" width="1.5" height="7.32" /><rect x="105" y="30.34" width="1.5" height="7.32" /></g>
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
      if (k === "cambio") return html`<${Ic.Repeat} size=${14} className="text-sky-500" />`;
      if (/sbagliato|parato/.test(k)) return html`<${Ic.XCircle} size=${14} className="text-rose-500" />`;
      return html`<${Ic.Ball} size=${14} className=${k === "autogol" ? "text-rose-500" : "text-emerald-600 dark:text-emerald-300"} />`;
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
    function KeyEvents({ sm, m }) {
      const [subs, setSubs] = useState(false);
      const ev = sm.eventi.filter((e) => subs || e.k !== "cambio");
      const nSub = sm.eventi.filter((e) => e.k === "cambio").length;
      return html`<div className=${C.card + " p-4 space-y-2"}>
        <div className="flex items-center"><span className=${C.lab + " flex-1"}>Momenti chiave</span>${sm.stadio && html`<span className=${"text-[11px] truncate max-w-[55%] " + C.mu}>${sm.stadio}</span>`}</div>
        <p className=${"text-sm leading-relaxed " + C.tx}>${riassunto(sm, m)}</p>
        ${ev.length > 0 && html`<div className="space-y-1 pt-1">${ev.map((e, i) => html`<div key=${i} className=${"flex items-center gap-2 text-sm " + (e.side === 1 ? "flex-row-reverse text-right" : "")}>
          <span className=${"w-12 shrink-0 text-xs font-semibold tabular-nums " + C.mu + (e.side === 1 ? " text-right" : "")}>${e.min}</span><${EvIcon} k=${e.k} />
          <span className=${"min-w-0 " + C.tx}>${e.k === "cambio" ? html`<span className="text-emerald-600 dark:text-emerald-300">${e.a}</span> <span className=${C.mu}>per ${e.b}</span>`
            : html`<b>${e.a}</b>${e.b && /gol|rigore$/.test(e.k) && e.k !== "rigore" ? html`<span className=${C.mu}> assist ${e.b}</span>` : ""}${e.k === "rigore" ? html`<span className=${C.mu}> (rigore)</span>` : ""}${e.k === "autogol" ? html`<span className=${C.mu}> (autogol)</span>` : ""}${/sbagliato|parato/.test(e.k) ? html`<span className=${C.mu}> (${e.k})</span>` : ""}`}</span></div>`)}</div>`}
        ${nSub > 0 && html`<button onClick=${() => setSubs(!subs)} className="text-xs font-semibold text-[#0A84FF]">${subs ? "Nascondi le sostituzioni" : `Mostra le sostituzioni (${nSub})`}</button>`}</div>`;
    }
    function StatsCard({ sm, m }) {
      const [all, setAll] = useState(false);
      if (!sm.statistiche.length) return null;
      const rows = all ? sm.statistiche : sm.statistiche.slice(0, 6);
      const fmt = (v, u) => (u === "%" ? Math.round(v) + "%" : v);
      return html`<div className=${C.card + " p-4 space-y-3"}>
        <div className=${"flex justify-between text-xs font-semibold " + C.mu}><span className="flex items-center gap-1.5"><${Crest} t=${m.h} size=${14} />${m.h}</span><span className=${C.lab}>Statistiche</span><span className="flex items-center gap-1.5">${m.a}<${Crest} t=${m.a} size=${14} /></span></div>
        ${rows.map(([l, a, b, u]) => html`<div key=${l}><div className="flex justify-between text-sm tabular-nums"><span className=${"font-semibold " + (a >= b ? C.tx : C.mu)}>${fmt(a, u)}</span><span className=${"text-xs " + C.mu}>${l}</span><span className=${"font-semibold " + (b >= a ? C.tx : C.mu)}>${fmt(b, u)}</span></div>
          <div className="flex gap-1 mt-1"><div className=${"flex-1 h-1.5 rounded-full flex justify-end " + C.ch}><div className="h-1.5 rounded-full bg-emerald-300 dark:bg-emerald-500/70" style=${{ width: (a / (a + b || 1)) * 100 + "%" }}></div></div>
            <div className=${"flex-1 h-1.5 rounded-full " + C.ch}><div className="h-1.5 rounded-full bg-sky-300 dark:bg-sky-500/70" style=${{ width: (b / (a + b || 1)) * 100 + "%" }}></div></div></div></div>`)}
        ${sm.statistiche.length > 6 && html`<button onClick=${() => setAll(!all)} className="text-xs font-semibold text-[#0A84FF]">${all ? "Mostra meno" : "Tutte le statistiche"}</button>`}</div>`;
    }
    function Cronaca({ sm, m }) {
      const [f, setF] = useState(0);
      const [n, setN] = useState(40);
      const list = sm.cronaca.filter((c) => c.text && (!f || KEY_T.test(c.type) || /^Gol!|Fine|Inizia|recupero/.test(c.text)));
      const tone = (t) => (/goal|penalty---scored|own-goal/.test(t) ? TONE.good : /red-card/.test(t) ? TONE.bad : /yellow-card/.test(t) ? TONE.warn : /substitution/.test(t) ? TONE.info : "");
      return html`<${React.Fragment}>
        <div className=${C.card + " p-4"}><div className=${C.lab + " mb-1"}>Resoconto</div><p className=${"text-sm leading-relaxed " + C.tx}>${riassunto(sm, m) || "La partita non è ancora iniziata: la cronaca scritta parte con le formazioni ufficiali e il calcio d'inizio."}</p></div>
        <${Seg} items=${["Tutta la cronaca", "Solo momenti chiave"]} val=${f} set=${setF} />
        <div className=${C.card + " px-4 py-1"}>${list.length ? list.slice(0, n).map((c, i) => html`<div key=${c.i} className=${"flex gap-3 py-2.5 " + (i ? "border-t " + C.bd : "")}>
          <span className=${"w-11 shrink-0 text-xs font-semibold tabular-nums pt-0.5 " + C.mu}>${c.min}</span>
          <span className=${"flex-1 text-sm leading-relaxed " + C.tx + (tone(c.type) ? " rounded-lg border px-2 py-1 -my-1 " + tone(c.type) : "")}>${c.text}</span></div>`)
          : html`<div className=${"py-3 text-sm " + C.mu}>Nessun commento ancora.</div>`}</div>
        ${list.length > n && html`<button onClick=${() => setN(n + 60)} className=${"w-full py-2.5 rounded-xl text-sm font-semibold " + C.ch + " " + C.tx}>Mostra altri commenti</button>`}
        <p className=${"text-[11px] " + C.mu}>Cronaca minuto per minuto tradotta automaticamente in italiano${sm.st === "LIVE" ? ", aggiornata ogni 20 secondi" : ""}.</p><//>`;
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
    function Lineups({ sm, m, onPlayer }) {
      const F = sm.formazioni;
      if (!F[0] && !F[1]) return html`<div className=${C.card + " p-4 flex gap-3"}><span className=${"w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border " + TONE.ok}><${Ic.Shirt} size=${17} /></span>
        <div><div className=${"text-sm font-semibold " + C.tx}>Formazioni non ancora ufficiali</div><p className=${"text-sm " + C.mu}>Escono circa un'ora prima del calcio d'inizio: compariranno qui da sole, sul campo.</p></div></div>`;
      const Tok = ({ p, col }) => html`<button onClick=${() => onPlayer(p)} className="flex flex-col items-center w-[19%] min-w-0">
        <span className="relative"><span className="w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-bold text-white border-2 border-white/80 shadow" style=${{ background: col }}>${p.num}</span><${Badges} p=${p} /></span>
        <span className="mt-0.5 text-[10px] font-semibold text-white leading-tight truncate max-w-full drop-shadow">${p.last}</span></button>`;
      const half = (j) => { const f = F[j]; if (!f) return html`<div className="h-1/2"></div>`; const lines = j === 0 ? f.lines.map((l) => l.slice().reverse()) : f.lines.slice().reverse();
        return html`<div className="flex flex-col justify-around h-1/2 py-2">${lines.map((l, i) => html`<div key=${i} className="flex justify-around">${l.map((p) => html`<${Tok} key=${p.id} p=${p} col=${sm.colors[j]} />`)}</div>`)}</div>`; };
      return html`<${React.Fragment}>
        <div className=${C.card + " p-3"}>
          <div className=${"flex justify-between text-xs font-semibold mb-2 " + C.tx}><span className="flex items-center gap-1.5"><${Crest} t=${m.h} size=${14} />${m.h} <span className=${C.mu}>${F[0] ? F[0].formation : ""}</span></span></div>
          <div className="relative rounded-xl overflow-hidden" style=${{ background: "#3f8f5a", aspectRatio: "68 / 105" }}>
            <svg viewBox="0 0 68 105" className="absolute inset-0 w-full h-full" preserveAspectRatio="none"><g fill="none" stroke="#fff" strokeOpacity="0.5" strokeWidth="0.35">
              <rect x="0.5" y="0.5" width="67" height="104" /><line x1="0" y1="52.5" x2="68" y2="52.5" /><circle cx="34" cy="52.5" r="9.15" />
              <rect x="13.84" y="0.5" width="40.32" height="16.5" /><rect x="13.84" y="88" width="40.32" height="16.5" /><rect x="24.84" y="0.5" width="18.32" height="5.5" /><rect x="24.84" y="99" width="18.32" height="5.5" /></g></svg>
            <div className="absolute inset-0 flex flex-col">${half(0)}${half(1)}</div></div>
          <div className=${"flex justify-between text-xs font-semibold mt-2 " + C.tx}><span></span><span className="flex items-center gap-1.5"><span className=${C.mu}>${F[1] ? F[1].formation : ""}</span> ${m.a}<${Crest} t=${m.a} size=${14} /></span></div>
          <p className=${"text-[11px] mt-1 " + C.mu}>Tocca un giocatore per vedere partita, stagione e carriera.</p></div>
        <div className=${C.card + " p-4"}><div className=${C.lab + " mb-2"}>Panchina</div>
          <div className="grid grid-cols-2 gap-x-3">${[0, 1].map((j) => html`<div key=${j} className="space-y-1 min-w-0">${(F[j] ? F[j].bench : []).map((p) => html`<button key=${p.id} onClick=${() => onPlayer(p)} className=${"w-full flex items-center gap-1.5 text-left text-[13px] " + C.tx}>
            <span className=${"w-5 text-[11px] tabular-nums " + C.mu}>${p.num}</span><span className=${"truncate flex-1 " + (p.inn ? "font-semibold" : "")}>${p.short}</span>${p.inn && html`<span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-300 shrink-0">${p.minIn || "in"}</span>`}</button>`)}</div>`)}</div></div><//>`;
    }
    const ST_IT = [["totalGoals", "Gol"], ["goalAssists", "Assist"], ["totalShots", "Tiri"], ["shotsOnTarget", "Tiri in porta"], ["foulsCommitted", "Falli fatti"], ["foulsSuffered", "Falli subiti"], ["offsides", "Fuorigioco"], ["yellowCards", "Gialli"], ["redCards", "Rossi"], ["saves", "Parate"], ["goalsConceded", "Gol subiti"], ["shotsFaced", "Tiri subiti"], ["ownGoals", "Autogol"]];
    function PlayerSheet({ p, side, m, col, onClose, noMatch }) {
      const [t, setT] = useState(noMatch ? 1 : 0);
      const [info, setInfo] = useState(null);
      const [car, setCar] = useState(null);
      const [err, setErr] = useState("");
      useEffect(() => { loadPlayer(p.id).then(setInfo).catch(() => setErr("Profilo non raggiungibile ora.")); }, [p.id]);
      useEffect(() => { if (t === 2 && car === null) loadCareer(p.id).then(setCar).catch(() => setCar([])); }, [t]);
      const gk = ruolo(p.pos) === "Portiere";
      const s = p.st || {};
      const box = (l, v) => html`<div key=${l} className=${"rounded-xl p-2 text-center " + C.ch}><div className=${"text-base font-semibold tabular-nums " + C.tx}>${v == null || Number.isNaN(v) ? "-" : v}</div><div className=${"text-[10px] " + C.mu}>${l}</div></div>`;
      const pr = info && info.prof;
      const stato = p.starter ? (p.out ? `Titolare, uscito al ${p.minOut || "?"}` : "Titolare") : p.inn ? `Entrato al ${p.minIn || "?"}` : "In panchina";
      return html`<${Sheet} title=${p.name} onClose=${onClose}>
        <div className="flex items-center gap-3"><span className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold text-white shrink-0" style=${{ background: col || "#8E8E93" }}>${p.num || "-"}</span>
          <div className="min-w-0"><div className=${"text-sm font-semibold " + C.tx}>${ruolo(p.pos)}${pr && pr.squadra ? " - " + pr.squadra : m.h ? " - " + (side === 0 ? m.h : m.a) : ""}</div>
            <div className=${"text-xs " + C.mu}>${pr ? [pr.naz, pr.eta ? pr.eta + " anni" : "", pr.altezza].filter(Boolean).join(" - ") : err || "Caricamento del profilo..."}</div></div></div>
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

    /* ---- consiglio IA in diretta ---- */
    function pois(l) { const o = [Math.exp(-l)]; for (let k = 1; k <= 8; k++) o.push((o[k - 1] * l) / k); return o; }
    function liveProb(code, xg, g, min, reds) {
      const f = Math.max(0.005, (90 - Math.min(min, 90)) / 90);
      const rh = Math.pow(0.67, reds[0]) * Math.pow(1.25, reds[1]), ra = Math.pow(0.67, reds[1]) * Math.pow(1.25, reds[0]);
      const ph = pois(Math.max(0.01, xg[0] * f * rh)), pa = pois(Math.max(0.01, xg[1] * f * ra));
      let p = 0, tot = 0;
      for (let i = 0; i <= 8; i++) for (let j = 0; j <= 8; j++) { const w = ph[i] * pa[j]; tot += w; if (evalCode(code, g[0] + i, g[1] + j)) p += w; }
      return p / tot;
    }
    function LiveTips({ m, sm }) {
      const tip = m.tip || {};
      const ks = ["consiglio", "prudente", "coraggiosa"].filter((k) => tip[k]);
      if (!ks.length || !(m.st === "LIVE" || m.st === "FT")) return null;
      const g = (sm && sm.st !== "NS" && sm.g[0] != null ? sm.g : m.g) || [0, 0];
      if (m.st === "FT") {
        return html`<div className=${C.card + " p-4 space-y-2"}><div className=${C.lab}>Com'è andata</div>
          ${ks.map((k) => { const ok = evalCode(tip[k].c, g[0], g[1]); return html`<div key=${k} className="flex items-center gap-2 text-sm">
            <span className=${"flex-1 " + C.tx}><span className=${C.mu}>${tip[k].titolo}:</span> ${mLabel(m, tip[k].c)}</span>
            <span className=${"text-xs font-semibold px-2 py-0.5 rounded-full border " + (ok ? TONE.good : TONE.bad)}>${ok ? "Presa" : "Non presa"}</span></div>`; })}
          <div className=${"text-[11px] " + C.mu}>Risultato finale ${g[0]}-${g[1]}. Lo storico completo dei consigli è in Schedina IA.</div></div>`;
      }
      const clock = (sm && sm.clock) || m.clock || "";
      const min = minuto(clock);
      const reds = [0, 1].map((j) => (sm ? sm.eventi.filter((e) => e.k === "rosso" && e.side === j).length : 0));
      const xg = m.xg && m.xg[0] != null ? m.xg : [1.35, 1.1];
      return html`<div className=${C.card + " p-4 space-y-2 ring-1 ring-rose-200 dark:ring-rose-500/40"}>
        <div className="flex items-center gap-2"><span className="relative flex w-2 h-2"><span className="absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75 animate-ping"></span><span className="relative inline-flex rounded-full w-2 h-2 bg-rose-500"></span></span>
          <span className=${C.lab + " flex-1"}>Consigli in diretta</span><span className=${"text-xs tabular-nums " + C.mu}>${clock} - ${g[0]}-${g[1]}</span></div>
        ${ks.map((k) => { const t = tip[k], p = liveProb(t.c, xg, g, min, reds), d = p - t.p;
          const lab = p >= 0.999 ? ["Già vinta", TONE.good] : p <= 0.001 ? ["Persa", TONE.bad] : null;
          return html`<div key=${k} className="flex items-center gap-2 text-sm">
            <span className=${"flex-1 min-w-0 " + C.tx}><span className=${C.mu}>${{ consiglio: "Consiglio", prudente: "Prudente", coraggiosa: "Coraggiosa" }[k]}:</span> ${mLabel(m, t.c)}</span>
            ${lab ? html`<span className=${"text-xs font-semibold px-2 py-0.5 rounded-full border " + lab[1]}>${lab[0]}</span>`
              : html`<span className="tabular-nums text-right"><b className=${C.tx}>${pct(p)}%</b> <span className=${"text-xs " + (d >= 0 ? "text-emerald-600 dark:text-emerald-300" : "text-rose-600 dark:text-rose-300")}>${d >= 0 ? "+" : ""}${pct(d)}</span></span>`}</div>`; })}
        <div className=${"text-[11px] " + C.mu}>Probabilità ricalcolate su punteggio, minuto ed espulsioni, partendo dai gol attesi prima della partita (il numero piccolo è la differenza rispetto al pre-partita).${reds[0] + reds[1] ? " Espulsioni considerate: " + reds[0] + " - " + reds[1] + "." : ""}</div></div>`;
    }

    /* ---- storico dei consigli ---- */
    function StoricoCard() {
      const { stor } = React.useContext(Ctx);
      const [open, setOpen] = useState(false);
      if (!stor || !stor.riass) return null;
      const R = stor.riass, nomi = { consiglio: "Consiglio", prudente: "Prudente", coraggiosa: "Coraggiosa" };
      const tot = R.consiglio ? R.consiglio.n : 0;
      return html`<div className=${C.card + " p-4 space-y-2"}>
        <div className="flex items-center"><span className=${C.lab + " flex-1"}>Storico consigli IA - ultimi ${stor.giorni} giorni</span><${Ic.BarChart3} size=${15} className=${C.mu} /></div>
        ${!tot ? html`<p className=${"text-sm " + C.mu}>Lo storico parte da oggi: ogni consiglio viene salvato prima del calcio d'inizio e verificato a fine partita, senza ritocchi. Torna tra qualche giorno.</p>`
          : html`<${React.Fragment}>
            <div className=${"grid grid-cols-[1.3fr_1fr_0.8fr_0.8fr] text-[11px] font-medium " + C.mu}><span>Profilo</span><span className="text-right">Presi</span><span className="text-right">Attesi</span><span className="text-right">Resa</span></div>
            ${Object.keys(nomi).filter((k) => R[k] && R[k].n).map((k) => { const r = R[k]; return html`<div key=${k} className=${"grid grid-cols-[1.3fr_1fr_0.8fr_0.8fr] text-sm tabular-nums border-t pt-1.5 " + C.bd + " " + C.tx}>
              <span className="font-semibold">${nomi[k]}</span><span className="text-right">${r.vinti}/${r.n} <span className=${"text-xs " + C.mu}>${Math.round((r.vinti / r.n) * 100)}%</span></span>
              <span className=${"text-right " + C.mu}>${String(r.attesa).replace(".", ",")}</span><span className=${"text-right font-semibold " + (r.resa >= 0 ? "text-emerald-600 dark:text-emerald-300" : "text-rose-600 dark:text-rose-300")}>${r.resa >= 0 ? "+" : ""}${String(r.resa).replace(".", ",")}</span></div>`; })}
            <p className=${"text-[11px] " + C.mu}>"Attesi" è quanti consigli ci si aspettava di prendere sommando le probabilità: se "Presi" gli resta vicino, le probabilità sono oneste. "Resa" è il guadagno in unità puntando 1 su ogni consiglio alla quota mostrata (stimata dove manca quella media).</p>
            <button onClick=${() => setOpen(!open)} className="text-xs font-semibold text-[#0A84FF]">${open ? "Nascondi le partite" : "Vedi partita per partita"}</button>
            ${open && html`<div className="space-y-1.5">${stor.lista.map((v, i) => html`<div key=${i} className=${"text-sm border-t pt-1.5 " + C.bd}>
              <div className=${"flex justify-between " + C.tx}><span className="truncate">${v.h} - ${v.a}</span><b className="tabular-nums">${v.g ? v.g[0] + "-" + v.g[1] : ""}</b></div>
              <div className="flex flex-wrap gap-1 mt-1">${Object.keys(nomi).filter((k) => v.tips[k]).map((k) => html`<span key=${k} className=${"text-[11px] px-2 py-0.5 rounded-full border " + (v.esiti[k] ? TONE.good : TONE.bad)}>${mLabel({ h: v.h, a: v.a }, v.tips[k].c, true)}</span>`)}</div></div>`)}</div>`}<//>`}</div>`;
    }

    /* ---- pagina squadra ---- */
    function TeamView() {
      const { team, setTeam } = React.useContext(Ctx);
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
        <button onClick=${() => setTeam(null)} className="flex items-center gap-1 text-sm font-medium text-[#0A84FF]"><${Ic.ChevronLeft} size=${18} />Indietro</button>
        <div className=${C.card + " p-4 flex items-center gap-3"}><${Crest} t=${team.name} size=${52} />
          <div className="flex-1 min-w-0"><div className=${"text-xl font-semibold truncate " + C.tx}>${team.name}</div>
            ${form.length > 0 && html`<div className="mt-1.5"><${Form} list=${form} /></div>`}</div></div>
        <${Seg} items=${["Partite", "Rosa"]} val=${t} set=${setT} />
        ${!d ? html`<div className=${C.card + " p-4 text-sm " + C.mu}>${err || "Caricamento..."}</div>`
          : t === 0 ? html`<${React.Fragment}>
            <div className=${C.lab}>Prossime partite</div>
            <div className=${C.card + " px-4 py-1"}>${d.prossime.length ? d.prossime.slice(0, 6).map((r, i) => html`<div key=${r.id} className=${"flex items-center gap-2 py-2 text-sm " + (i ? "border-t " + C.bd : "") + " " + C.tx}>
              <span className=${"w-24 text-xs tabular-nums " + C.mu}>${dt(r.date)}</span><span className="flex-1 truncate">${r.casa ? "vs" : "@"} ${r.avv}</span><span className=${"text-[11px] " + C.mu}>${r.comp}</span></div>`)
              : html`<div className=${"py-2 text-sm " + C.mu}>Nessuna partita in calendario.</div>`}</div>
            <div className=${C.lab}>Risultati</div>
            <div className=${C.card + " px-4 py-1"}>${d.risultati.slice(0, 12).map((r, i) => html`<div key=${r.id} className=${"flex items-center gap-2 py-2 text-sm " + (i ? "border-t " + C.bd : "") + " " + C.tx}>
              <span className=${"w-6 h-6 rounded-md border text-[11px] font-semibold flex items-center justify-center " + TONE[r.esito === "V" ? "good" : r.esito === "N" ? "warn" : "bad"]}>${r.esito}</span>
              <span className=${"w-12 text-xs tabular-nums " + C.mu}>${new Date(r.date).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" })}</span>
              <span className="flex-1 truncate">${r.casa ? "vs" : "@"} ${r.avv}</span><b className="tabular-nums">${r.g[0]}-${r.g[1]}</b></div>`)}</div><//>`
          : html`<${React.Fragment}>${RUOLI.map((ru) => { const ps = d.rosa.filter((p) => p.ruolo === ru); if (!ps.length) return null; return html`<div key=${ru}>
            <div className=${C.lab + " mb-1.5"}>${ru === "Attaccante" ? "Attaccanti" : ru === "Portiere" ? "Portieri" : ru === "Difensore" ? "Difensori" : "Centrocampisti"}</div>
            <div className=${C.card + " px-4 py-1"}>${ps.map((p, i) => html`<button key=${p.id} onClick=${() => setPl(p)} className=${"w-full flex items-center gap-2 py-2 text-left text-sm " + (i ? "border-t " + C.bd : "") + " " + C.tx}>
              <span className=${"w-6 text-xs tabular-nums " + C.mu}>${p.num || ""}</span><span className="flex-1 truncate">${p.name}</span>
              ${p.inf && html`<span className=${"text-[10px] font-semibold px-1.5 py-0.5 rounded-full border " + TONE.bad}>${/out|injur/i.test(p.inf) ? "Infortunato" : p.inf}</span>`}
              <span className=${"text-xs " + C.mu}>${[p.naz, p.eta ? p.eta + " a" : ""].filter(Boolean).join(" - ")}</span><${Ic.ChevronRight} size=${14} className=${C.mu} /></button>`)}</div></div>`; })}<//>`}
        ${pl && html`<${PlayerSheet} p=${pl} side=${0} col=${d && d.colore} m=${{ h: team.name, a: "" }} noMatch=${true} onClose=${() => setPl(null)} />`}
        <p className=${"text-[11px] " + C.mu}>Dati da ESPN: calendario, risultati e rosa si aggiornano da soli.</p></div>`;
    }

    /* ---- consiglio IA motivato e tutti i mercati ---- */
    function TipView({ m, sm }) {
      const { mySlip, addLeg } = React.useContext(Ctx);
      const [why, setWhy] = useState("consiglio");
      const [grp, setGrp] = useState(null);
      const inSlip = mySlip.find((x) => x.id === m.id);
      const tip = m.tip || {};
      const AddBtn = ({ c }) => { const on = inSlip && norm(inSlip.k) === c; return html`<button aria-label="Aggiungi alla schedina" onClick=${(e) => { e.stopPropagation(); addLeg(m, c); }}
        className=${"w-8 h-8 rounded-full flex items-center justify-center shrink-0 border " + (on ? TONE.good : C.ch + " border-transparent " + C.tx)}>${on ? html`<${Ic.Check} size=${14} />` : html`<${Ic.Plus} size=${14} />`}</button>`; };
      const Card = ({ k }) => { const t = tip[k]; if (!t) return null; const o = why === k, main = k === "consiglio";
        return html`<div className=${C.card + " p-4 " + (main ? "ring-1 ring-sky-200 dark:ring-sky-500/40" : "")}>
          <div className="flex items-center gap-3 cursor-pointer" onClick=${() => setWhy(o ? null : k)}>
            ${main && html`<span className=${"w-9 h-9 rounded-xl flex items-center justify-center border shrink-0 " + TONE.info}><${Ic.Sparkles} size=${17} /></span>`}
            <div className="flex-1 min-w-0"><div className=${C.lab}>${t.titolo}</div>
              <div className=${(main ? "text-base " : "text-sm ") + "font-semibold leading-tight " + C.tx}>${mLabel(m, t.c)}</div>
              <div className=${"text-xs tabular-nums " + C.mu}>Probabilità ${pct(t.p)}% - quota ${t.qm ? "media" : "stimata"} ${odd(t.q)}</div></div>
            <${AddBtn} c=${t.c} /></div>
          <button onClick=${() => setWhy(o ? null : k)} className="mt-2 text-xs font-semibold text-[#0A84FF] flex items-center gap-1">${o ? "Nascondi motivazione" : "Perché questo consiglio?"}<${o ? Ic.ChevronUp : Ic.ChevronDown} size=${13} /></button>
          ${o && html`<div className="mt-2 space-y-1.5 text-sm leading-relaxed">
            ${t.perche.map((x) => html`<div key=${x} className="flex gap-2"><span className=${"w-1.5 h-1.5 rounded-full mt-2 shrink-0 " + DOT.good}></span><span className=${C.tx}>${x}</span></div>`)}
            ${(t.contro || []).map((x) => html`<div key=${x} className="flex gap-2"><span className=${"w-1.5 h-1.5 rounded-full mt-2 shrink-0 " + DOT.warn}></span><span className=${C.tx}><b>Da tenere d'occhio:</b> ${x}</span></div>`)}</div>`}</div>`; };
      const opts = options(m);
      const groups = GROUPS.map((g) => [g, opts.filter((o) => mGroup(o.k) === g)]).filter(([, l]) => l.length);
      return html`<${React.Fragment}>
        <${LiveTips} m=${m} sm=${sm} />
        ${tip.consiglio ? html`<${Card} k="consiglio" /><div className="grid gap-2"><${Card} k="prudente" /><${Card} k="coraggiosa" /></div>`
          : html`<div className=${C.card + " p-4 text-sm " + C.tx}>Nessun consiglio: per questa partita mancano quote sufficienti per stimare i mercati.</div>`}
        <div className=${C.lab + " pt-1"}>Tutti i mercati - tocca un gruppo</div>
        <div className=${C.card + " px-4 py-1"}>${groups.map(([g, l], i) => { const o = grp === g; return html`<div key=${g} className=${i ? "border-t " + C.bd : ""}>
          <button onClick=${() => setGrp(o ? null : g)} className=${"w-full flex items-center py-3 text-sm font-semibold " + C.tx}><span className="flex-1 text-left">${g}</span><span className=${"text-xs font-normal mr-2 " + C.mu}>${l.length}</span><${o ? Ic.ChevronUp : Ic.ChevronDown} size=${16} className=${C.mu} /></button>
          ${o && html`<div className="pb-2">${l.map((x) => html`<div key=${x.k} className="flex items-center gap-2 py-1.5">
            <span className=${"flex-1 text-sm leading-tight " + C.tx}>${mLabel(m, x.k)}</span>
            <span className=${"text-xs tabular-nums w-10 text-right " + C.mu}>${pct(x.p)}%</span>
            <span className=${"text-sm font-semibold tabular-nums w-12 text-right " + C.tx}>${odd(x.q)}</span><${AddBtn} c=${x.k} /></div>`)}</div>`}</div>`; })}</div>
        <p className=${"text-[11px] " + C.mu}>Probabilità calcolate dalle quote medie dei bookmaker (modello dei gol attesi). Quota "media" = raccolta dai bookmaker; quota "stimata" = calcolata dalla probabilità con un margine tipico del 6%, quella reale può variare. Il consiglio sceglie il mercato dove probabilità e statistiche delle squadre vanno d'accordo: non è una garanzia.</p>
      <//>`;
    }

    /* ---- scheda partita ---- */
    function MatchView({ m }) {
      const { D, lg, unlocked, setOpen, mt, setMt, mySlip, addLeg, setTeam, favM, toggleFavM } = React.useContext(Ctx);
      const L = lg(m.lg);
      const [pOpen, setPOpen] = useState(null);
      const [filt, setFilt] = useState(0);
      const [l5, setL5] = useState(null);
      const [pl, setPl] = useState(null);
      const { d: sm } = useSummary(m.lgE, m.eid, m.st === "LIVE");
      const sw = useRef(null);
      const TABS = ["Panoramica", "Cronaca", "Formazioni", "Analisi IA", "Classifiche"];
      const onTS = (e) => { const t = e.touches[0]; sw.current = e.target.closest("[data-noswipe]") ? null : [t.clientX, t.clientY]; };
      const onTE = (e) => { if (!sw.current) return; const t = e.changedTouches[0], dx = t.clientX - sw.current[0], dy = t.clientY - sw.current[1]; sw.current = null;
        if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.6) setMt(Math.max(0, Math.min(TABS.length - 1, mt + (dx < 0 ? 1 : -1)))); };
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
            <span className=${"ml-auto text-xs " + C.mu}>${m.date.slice(8)}/${m.date.slice(5, 7)} ${m.time || ""}</span>
            <button aria-label=${favM.includes(m.id) ? "Togli dalle preferite" : "Aggiungi alle preferite"} onClick=${() => toggleFavM(m.id)} className="ml-1 -mr-1 p-1">
              <${Ic.Star} size=${18} className=${favM.includes(m.id) ? "text-amber-400 fill-amber-400" : C.mu} /></button></div>
          <div className="flex items-start justify-between mt-4">
            ${[m.h, m.a].map((t, j) => html`<button key=${t} onClick=${() => setTeam({ lgE: m.lgE || ESPN_LG[m.lg], id: j ? m.aid : m.hid, name: t })} className=${"flex flex-col items-center gap-1.5 w-28 " + (j ? "order-3" : "order-1")}><${Crest} t=${t} size=${44} />
              <span className=${"text-sm font-semibold text-center leading-tight " + C.tx}>${t}</span><span className=${"text-[11px] " + C.mu}>${pos(t) ? pos(t) + "° in classifica" : "Pagina squadra"}</span></button>`)}
            <div className="order-2 flex flex-col items-center pt-2"><div className=${"text-3xl font-semibold tabular-nums " + C.tx}>${m.g ? m.g[0] + " - " + m.g[1] : m.time}</div>
              <div className=${"text-xs mt-1 " + (m.st === "LIVE" ? "text-rose-500 font-semibold " : C.mu)}>${m.st === "FT" ? "Finale" : m.st === "LIVE" ? (sm && sm.clock) || m.clock || "In corso" : m.st === "RINV" ? "Rinviata" : ""}</div></div></div>
          <div className="flex items-center justify-center gap-2 mt-4"><${FavPill} m=${m} unlocked=${unlocked(m)} big=${true} />
            ${m.free && html`<span className=${"text-[10px] font-semibold px-2 py-0.5 rounded-full border " + TONE.good}>FREE oggi</span>`}
            ${m.st === "FT" && unlocked(m) && html`<span className=${"text-xs " + (m.res === fav ? "text-emerald-600 dark:text-emerald-300" : "text-rose-600 dark:text-rose-300")}>${m.res === fav ? "Favorito rispettato" : "Sorpresa"}</span>`}</div></div>
        <div data-noswipe="1"><${Seg} small=${true} items=${TABS} val=${mt} set=${setMt} /></div>
        <div onTouchStart=${onTS} onTouchEnd=${onTE} className="space-y-3 min-h-[50vh]">

        ${mt === 0 && html`<${React.Fragment}>
          ${sm && sm.st === "LIVE" && html`<${LiveAction} sm=${sm} m=${m} />`}
          ${sm && sm.st !== "NS" && html`<${KeyEvents} sm=${sm} m=${m} />`}
          ${sm && sm.st !== "NS" && html`<${StatsCard} sm=${sm} m=${m} />`}
          <div className=${C.card + " p-4 space-y-3"}><div className="flex justify-between items-baseline"><span className=${C.lab}>Probabilità dalle quote</span><span className=${"text-[11px] " + C.mu}>Over 2.5: <b className=${C.tx}>${pct(m.mo)}%</b></span></div>
            <${ProbBar} p=${m.mk} />
            ${!D.demo && m.nb ? html`<div className=${"text-[11px] " + C.mu}>Quota media di ${m.nb} bookmaker.</div>` : null}
            <div className=${C.lab + " pt-1"}>Aggiungi alla tua schedina</div>
            <div className="flex flex-wrap gap-1.5">${opts.filter((o) => !o.stima).map((o) => html`<button key=${o.k} onClick=${() => addLeg(m, o.k)}
              className=${"inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border " + (inSlip && inSlip.k === o.k ? TONE.good : C.ch + " " + C.tx + " border-transparent")}>
              ${inSlip && inSlip.k === o.k ? html`<${Ic.Check} size=${12} />` : html`<${Ic.Plus} size=${12} />`}${mLabel(m, o.k, true)}<span className=${"font-normal " + C.mu}>${odd(o.q)}</span></button>`)}</div></div>
          <div className=${C.lab}>Lettura in 10 secondi - tocca per aprire</div>
          <${Gate} m=${m} title="Lettura IA: forma reale, attese, precedenti, contesto">
            <div className="grid grid-cols-2 gap-2">${tiles.map((t, i) => { const o = pOpen === i; return html`<button key=${t.k} onClick=${() => setPOpen(o ? null : i)} className=${C.card + " p-3 text-left " + (o ? "col-span-2" : "")}>
              <div className="flex items-center gap-2"><span className=${"w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border " + TONE[t.tone]}><${t.i} size=${15} /></span>
                <span className=${"flex-1 text-[13px] font-semibold leading-tight " + C.tx}>${t.k}</span><span className=${"w-2 h-2 rounded-full " + DOT[t.tone]}></span></div>
              ${o && html`<div className=${"text-sm mt-2 leading-relaxed " + C.tx}>${t.body}</div>`}</button>`; })}</div>
            ${m.flags.length > 0 && html`<div className="flex flex-wrap gap-1.5">${m.flags.map((f) => html`<span key=${f.text} className=${"text-[11px] font-semibold px-2 py-0.5 rounded-full border " + TONE[f.tone]}>${f.text}</span>`)}</div>`}
          <//><//>`}

        ${mt === 3 && html`<${Gate} m=${m} title="Analisi IA: probabilità, gol attesi e consiglio">
          <${TipView} m=${m} sm=${sm} />
          <div className=${C.card + " p-4 space-y-2"}><div className=${C.lab}>Laboratorio: IA contro quote</div>
            <div className="overflow-x-auto"><table className=${"w-full text-sm tabular-nums " + C.tx}><thead><tr className=${"text-[11px] " + C.mu}><th className="text-left font-medium py-1">Esito</th><th className="text-right font-medium">IA</th><th className="text-right font-medium">Quote</th><th className="text-right font-medium">${D.demo ? "Bet365" : "Media"}</th><th className="text-right font-medium">Migliore</th></tr></thead>
              <tbody>${[["1", m.p[0], m.mk[0], m.odds["1"], m.max["1"]], ["X", m.p[1], m.mk[1], m.odds["X"], m.max["X"]], ["2", m.p[2], m.mk[2], m.odds["2"], m.max["2"]],
                ["Over 2.5", m.po, m.mo, m.odds.O, m.max.O], ["Under 2.5", 1 - m.po, 1 - m.mo, m.odds.U, m.max.U]].map((r) => html`<tr key=${r[0]} className=${"border-t " + C.bd}>
                <td className="py-1.5 font-semibold">${r[0]}</td><td className="text-right">${pct(r[1])}%</td><td className=${"text-right " + C.mu}>${pct(r[2])}%</td><td className="text-right">${odd(r[3])}</td><td className=${"text-right " + C.mu}>${odd(r[4])}</td></tr>`)}</tbody></table></div>
            <p className=${"text-[11px] " + C.mu}>${D.demo ? "\"Quote\" è la probabilità ricavata dalla quota togliendo il margine del bookmaker. Nel test su oltre 18.000 partite gli scarti tra IA e quote non hanno dato un vantaggio affidabile: per questo l'IA non li trasforma in consigli."
              : "Per ora l'IA usa come base la quota media dei bookmaker, perché nei test è la stima più precisa: se ne discosterà solo quando arriveranno formazioni ufficiali e notizie. \"Migliore\" è la quota più alta tra i bookmaker."}</p></div>
          ${m.xg[0] != null && html`<div className=${C.card + " p-4 grid grid-cols-2 gap-2 text-center"}>
            ${[["Gol attesi " + m.h, (m.xg[0] || 0).toFixed(2).replace(".", ",")], ["Gol attesi " + m.a, (m.xg[1] || 0).toFixed(2).replace(".", ",")], ...(m.elo[0] ? [["Elo casa", m.elo[0]], ["Elo ospiti", m.elo[1]]] : [])].map(([a, b]) => html`<div key=${a} className=${"rounded-xl p-2 " + C.ch}>
              <div className=${"text-base font-semibold tabular-nums " + C.tx}>${b}</div><div className=${"text-[10px] " + C.mu}>${a}</div></div>`)}</div>`}<//>`}

        ${mt === 4 && html`<${React.Fragment}>
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

        ${mt === 1 && (sm ? html`<${Cronaca} sm=${sm} m=${m} />` : html`<div className=${C.card + " p-4 text-sm " + C.mu}>${m.eid ? "Caricamento della cronaca..." : "La cronaca scritta compare quando la partita è collegata alla diretta: di solito dal giorno della partita, con le formazioni ufficiali."}</div>`)}

        ${mt === 2 && (sm ? html`<${Lineups} sm=${sm} m=${m} onPlayer=${(p) => setPl({ p, side: sm.formazioni[0] && sm.formazioni[0].all.includes(p) ? 0 : 1 })} />` : html`<div className=${C.card + " p-4 text-sm " + C.mu}>${m.eid ? "Caricamento delle formazioni..." : "Le formazioni compaiono il giorno della partita, circa un'ora prima del calcio d'inizio."}</div>`)}
        </div>
        ${pl && html`<${PlayerSheet} p=${pl.p} side=${pl.side} col=${sm && sm.colors[pl.side]} m=${m} onClose=${() => setPl(null)} />`}
      </div>`;
    }

    /* ---- campionati ---- */
    function LeaguesView() {
      const { D, lg, fav, setTeam } = React.useContext(Ctx);
      const [vista, setVista] = useState(0);
      const [k, setK] = useState(() => { const s0 = store.get("lgSel", null); return D.leagues.some((l) => l.k === s0) ? s0 : D.leagues[0].k; });
      const [filt, setFilt] = useState(0);
      const L = lg(k);
      const st = D.standings[k] ? D.standings[k][["generale", "casa", "trasferta"][filt]] : [];
      const ms = D.matches.filter((m) => m.lg === k);
      const zone = (i) => { const n = st.length; if (["I1", "E0", "SP1", "D1"].includes(k)) return i < 4 ? "bg-sky-400" : i >= n - 3 ? "bg-rose-400" : ""; return i < 2 ? "bg-emerald-400" : i >= n - 3 ? "bg-rose-400" : ""; };
      return html`<div className="px-4 space-y-3">
        <div className="flex gap-2 overflow-x-auto noscroll -mx-4 px-4">${D.leagues.map((l) => html`<${Chip} key=${l.k} on=${k === l.k} onClick=${() => { setK(l.k); store.set("lgSel", l.k); }}><${Flag} k=${l.flag} w=${16} />${l.name}<//>`)}</div>
        <div className=${"flex items-center gap-2 text-sm font-semibold " + C.tx}><${Flag} k=${L.flag} w=${22} />${L.country} - ${L.name} 2026/27</div>
        <${Seg} items=${["Classifica", "Marcatori", "Assist"]} val=${vista} set=${setVista} />
        ${vista > 0 && (() => { const sc = ((D.scorers || {})[k] || []).slice().sort((a, b) => (vista === 1 ? b.g - a.g || b.a - a.a : b.a - a.a || b.g - a.g)).filter((r) => (vista === 1 ? r.g : r.a) > 0);
          return sc.length ? html`<div className=${C.card + " px-4 py-1"}>${sc.slice(0, 20).map((r, i) => html`<div key=${r.n + r.t} className=${"flex items-center gap-2 py-2 text-sm " + (i ? "border-t " + C.bd : "") + " " + C.tx}>
            <span className=${"w-5 text-xs tabular-nums " + C.mu}>${i + 1}</span><${Crest} t=${r.t} size=${16} /><span className="flex-1 min-w-0"><span className="block truncate font-semibold">${r.n}</span><span className=${"block text-[11px] truncate " + C.mu}>${r.t} - ${r.pg} presenze${vista === 1 && r.r ? " - " + r.r + " su rigore" : ""}</span></span>
            <span className="text-right tabular-nums"><b className="text-base">${vista === 1 ? r.g : r.a}</b><span className=${"block text-[10px] " + C.mu}>${vista === 1 ? (r.a ? r.a + " assist" : "") : r.g + " gol"}</span></span></div>`)}</div>`
            : html`<div className=${C.card + " p-4 text-sm " + C.mu}>${D.scorers ? "Classifica marcatori non disponibile per questo campionato nella fonte dati gratuita." : "La classifica marcatori arriva con il prossimo aggiornamento dei dati (ogni mattina)."}</div>`; })()}
        ${vista === 0 && html`<${React.Fragment}>
        <${Seg} items=${["Generale", "Solo Casa", "Solo Trasferta"]} val=${filt} set=${setFilt} />
        <div className=${C.card + " p-2 overflow-x-auto"}><table className=${"w-full text-sm tabular-nums " + C.tx}><thead><tr className=${"text-[11px] " + C.mu}>
          <th className="text-left font-medium p-1.5 w-7">#</th><th className="text-left font-medium">Squadra</th><th className="text-right font-medium">G</th><th className="text-right font-medium">GF</th><th className="text-right font-medium">GS</th><th className="text-right font-medium pr-1.5">Pt</th></tr></thead>
          <tbody>${st.map((r, i) => html`<tr key=${r.team} onClick=${() => ESPN_LG[k] && setTeam({ lgE: ESPN_LG[k], name: r.team })} className=${"cursor-pointer " + (r.team === fav ? "bg-emerald-50 dark:bg-emerald-500/15 font-semibold" : "")}>
            <td className="p-1.5"><span className="flex items-center gap-1"><span className=${"w-1 h-4 rounded-full " + (zone(i) || "bg-transparent")}></span>${i + 1}</span></td>
            <td><span className="flex items-center gap-1.5 min-w-0"><${Crest} t=${r.team} size=${14} /><span className="truncate">${r.team}</span></span></td>
            <td className=${"text-right " + C.mu}>${r.pg}</td><td className="text-right">${r.gf}</td><td className="text-right">${r.gs}</td><td className="text-right pr-1.5 font-semibold">${r.pt}</td></tr>`)}</tbody></table></div>
        ${!st.length && html`<div className=${C.card + " p-4 text-sm " + C.mu}>Classifica non disponibile per questo campionato nella fonte dati gratuita.</div>`}
        ${st.length > 0 && html`<p className=${"text-[11px] -mt-1 " + C.mu}>Tocca una squadra per aprire calendario, risultati e rosa.</p>`}<//>`}
        <div className=${C.lab}>${D.demo ? "Partite della giornata" : "Partite in programma"}</div>
        <div className=${C.card + " overflow-hidden"}>${ms.map((m, i) => html`<${Row} key=${m.id} m=${m} i=${i} />`)}</div></div>`;
    }

    /* ---- il mio club ---- */
    function ClubView() {
      const { D, lg, fav, setFav, setTeam } = React.useContext(Ctx);
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
          ${l5.length > 0 && html`<div className="mt-4"><div className=${C.lab + " mb-1.5"}>Ultime 5</div><${Form} list=${l5} /></div>`}
          ${lgK && ESPN_LG[lgK] && html`<button onClick=${() => setTeam({ lgE: ESPN_LG[lgK], name: fav })} className=${"mt-4 w-full py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5 " + C.ch + " " + C.tx}>Calendario, risultati e rosa<${Ic.ChevronRight} size=${15} /></button>`}</div>
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
      const mine = mySlip.map((x) => ({ ...x, m: byId[x.id] })).filter((x) => x.m).map((x) => ({ ...x, ...options(x.m).find((o) => o.k === norm(x.k)) }));
      const mTot = mine.reduce((a, l) => a * (l.q || 1), 1), mProb = mine.reduce((a, l) => a * (l.p || 1), 1);
      const text = (ls, wa) => (wa ? "*Schedina AuraPitch*\n" : "") + ls.map((l) => (wa ? "- " : "") + `${l.m.h} - ${l.m.a}: ${wa ? "*" + mLabel(l.m, l.k, true) + "*" : mLabel(l.m, l.k, true)} @ ${odd(l.q)}`).join("\n") + `\nQuota totale ${odd(ls.reduce((a, l) => a * l.q, 1))}`;
      const LegRow = ({ l, onDel }) => { const h = hit(l.m, l.k); return html`<div className=${"flex items-center gap-2 py-2 border-t first:border-t-0 " + C.bd}>
        <div className="flex-1 min-w-0"><div className=${"text-sm truncate " + C.tx}>${l.m.h} - ${l.m.a}</div><div className=${"text-[11px] " + C.mu}>${lg(l.m.lg).name} - IA ${pct(l.p)}%${l.stima ? " - quota stimata" : ""}${l.shielded ? " - protetta" : ""}</div></div>
        <span className=${"text-sm font-semibold text-right max-w-[45%] leading-tight " + C.tx}>${mLabel(l.m, l.k, true)}</span><span className=${"text-sm tabular-nums w-11 text-right " + C.mu}>${odd(l.q)}</span>
        ${h === null ? null : h ? html`<${Ic.CheckCircle2} size=${17} className="text-emerald-500" />` : html`<${Ic.XCircle} size=${17} className="text-rose-500" />`}
        ${onDel && html`<button aria-label="Rimuovi" onClick=${onDel} className=${C.mu}><${Ic.Trash2} size=${15} /></button>`}</div>`; };
      return html`<div className="px-4 space-y-3">
        <${StoricoCard} />
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
            <div>${shield ? "Protetto dallo Scudo IA: la gamba più fragile è passata all'esito più probabile della stessa partita." : `${weak.m.h} - ${weak.m.a}, ${mLabel(weak.m, weak.k, true)} (IA ${pct(weak.p)}%) è la gamba più fragile.`}</div>
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
    const [Draw, setD] = useState(null);
    const live = useLiveScores(Draw ? Draw.matches : null);
    const D = React.useMemo(() => Draw && { ...Draw, matches: Draw.matches.map((m) => {
      const l = live[m.id];
      if (!l) return m;
      const ok = l.st === "LIVE" || l.st === "FT" || (l.st === "RINV" && m.st !== "FT");
      const g = ok && l.g ? l.g : m.g;
      return { ...m, eid: l.eid, lgE: l.lgE, clock: l.clock, hid: l.hid, aid: l.aid, ...(ok ? { st: l.st, g, res: g ? (g[0] > g[1] ? 0 : g[0] === g[1] ? 1 : 2) : m.res } : {}) };
    }) }, [Draw, live]);
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
    const [team, setTeam] = useState(null);
    const [stor, setStor] = useState(null);
    const [favM, setFavM] = useState(store.get("favM", []));
    const [avvisi, setAvvisi] = useState(store.get("avvisi", true));
    const prev = useRef(null);

    useEffect(() => {
      fetch("data/storico.json").then((r) => (r.ok ? r.json() : null)).then(setStor).catch(() => {});
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
    // avvisi: gol e fine partita delle partite preferite e della squadra del cuore (con l'app aperta)
    useEffect(() => {
      if (!D) return;
      const now = {};
      for (const m of D.matches) now[m.id] = { st: m.st, g: m.g ? m.g.join("-") : null };
      const old = prev.current;
      prev.current = now;
      if (!old || !avvisi) return;
      for (const m of D.matches) {
        if (!(favM.includes(m.id) || m.h === fav || m.a === fav)) continue;
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

    if (err) return html`<div className="p-6 text-center text-sm ${C.mu}">${err}</div>`;
    if (!D) return html`<div className="p-12 text-center text-sm ${C.mu}">Caricamento delle partite...</div>`;
    const byId = Object.fromEntries(D.matches.map((m) => [m.id, m]));
    const lg = (k) => D.leagues.find((l) => l.k === k);
    const lgOpen = openL || D.leagues.map((l) => l.k);
    const goMatch = (id) => { setOpen(id); setMt(0); setTeam(null); window.scrollTo(0, 0); };
    const toggleFavM = (id) => { const nx = favM.includes(id) ? favM.filter((x) => x !== id) : [...favM, id]; setFavM(nx); store.set("favM", nx); flash(favM.includes(id) ? "Tolta dalle preferite" : "Aggiunta alle preferite: ti avviso dei gol"); };
    const openTeam = (t) => { setTeam(t); window.scrollTo(0, 0); };
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
        <button onClick=${() => { setOpen(null); setTeam(null); setTab("partite"); }} className="flex items-center gap-2 mr-auto" aria-label="AuraPitch, vai alle partite">
          <span className="w-8 h-8 rounded-[10px] flex items-center justify-center bg-[#1D1D1F] dark:bg-white"><${Ic.Activity} size=${17} className="text-emerald-300 dark:text-emerald-600" /></span>
          <span className=${"text-[17px] font-semibold tracking-tight " + C.tx}>AuraPitch</span>
          <span className=${"text-[10px] font-semibold px-1.5 py-0.5 rounded-md " + C.ch + " " + C.mu}>BETA</span></button>
        <button onClick=${() => setUnlock(true)} className=${"text-[11px] font-semibold px-2.5 py-1 rounded-full border tabular-nums " + (pro ? TONE.warn : C.ch + " " + C.tx + " border-transparent")}>${sub ? "PRO" : left > 0 ? "PRO " + mmss(left) : "FREE"}</button>
        <button aria-label="Guida rapida" onClick=${() => setGuide(guide ? 0 : 1)} className=${"w-8 h-8 rounded-full flex items-center justify-center " + C.ch + " " + C.tx}><${Ic.HelpCircle} size=${15} /></button>
        <button aria-label="Profilo e impostazioni" onClick=${() => setProfile(true)} className=${"w-8 h-8 rounded-full text-[11px] font-semibold " + C.on}>${ini}</button>
      </div></header>`;

    const steps = ["Partite: tocca un campionato per aprirlo. La stella dentro una partita la mette tra le Preferite, in cima, con gli avvisi dei gol.", "Tocca una partita: Panoramica, Cronaca, Formazioni, Analisi IA e Classifiche. Scorri col dito a destra o a sinistra per cambiare sezione.",
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
          : html`Beta con <b>dati reali</b>, ${D.label}: quote medie di decine di bookmaker, classifiche e risultati in diretta (ogni 30 secondi). Apri una partita e scorri col dito tra le sezioni.`}</div>
        <button aria-label="Chiudi avviso" onClick=${() => { setBanner(false); store.set("banner2", false); }} className=${C.mu}><${Ic.X} size=${16} /></button></div>`}
      <div className="flex gap-2 overflow-x-auto noscroll -mx-4 px-4">${[{ k: "all", label: D.demo ? "Tutta la giornata" : "Tutti i giorni" }, ...D.days].map((d) => html`<${Chip} key=${d.k} on=${day === d.k} onClick=${() => setDay(d.k)}>${d.label}<//>`)}</div>
      <div className="w-40"><${Seg} items=${["Tutte", "Live"]} val=${liveOnly} set=${setLiveOnly} /></div>
      ${(() => { const fm = dayMatches.filter((m) => favM.includes(m.id) || m.h === fav || m.a === fav); return fm.length > 0 && html`<div className=${C.card + " overflow-hidden"}>
        <div className="flex items-center gap-3 px-4 py-3"><${Ic.Star} size=${17} className="text-amber-400 fill-amber-400" /><span className=${"flex-1 text-sm font-semibold " + C.tx}>Preferite</span><span className=${"text-xs " + C.mu}>${fm.length}</span></div>
        <div className=${"border-t " + C.bd}>${fm.map((m, i) => html`<${Row} key=${m.id} m=${m} i=${i} />`)}</div></div>`; })()}
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
      <p className=${"text-[11px] text-center " + C.mu}>${D.demo ? "Dati: Football-Data.co.uk, ClubElo." : "Dati: quote da The Odds API; classifiche da football-data.org; diretta, cronaca e formazioni da ESPN."} Stemmi generici, non ufficiali.</p></div>`;

    const open_m = open && byId[open];
    const views = { partite: home, campionati: html`<${LeaguesView} />`, schedina: html`<${SlipView} />`, club: html`<${ClubView} />` };
    const DOCK = [["partite", "Partite", Ic.Calendar], ["campionati", "Campionati", Ic.Trophy], ["schedina", "Schedina IA", Ic.Sparkles], ["club", "Il Mio Club", Ic.Shield]];

    const ctx = { D, byId, lg, pro, unlocked, goMatch, setOpen, mt, setMt, addLeg, mySlip, setMySlip, doCopy, setUnlock, fav, setFav, team, setTeam: openTeam, stor, favM, toggleFavM };
    return html`<${Ctx.Provider} value=${ctx}><div className="min-h-screen pb-28">
      ${header}
      <main className="max-w-[480px] mx-auto">${guideBox}${team ? html`<${TeamView} key=${team.name} />` : open_m ? html`<${MatchView} key=${open_m.id} m=${open_m} />` : views[tab]}</main>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-black/[0.06] dark:border-white/[0.08] backdrop-blur-md bg-white/90 dark:bg-[#1C1C1E]/90"
        style=${{ paddingBottom: "env(safe-area-inset-bottom, 0px)", paddingLeft: "env(safe-area-inset-left, 0px)", paddingRight: "env(safe-area-inset-right, 0px)" }}>
        <div className="max-w-[480px] mx-auto grid grid-cols-4">${DOCK.map(([k, l, I]) => html`<button key=${k} onClick=${() => { setTab(k); setOpen(null); setTeam(null); window.scrollTo(0, 0); }}
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
        <div className=${C.lab}>Avvisi</div>
        <button onClick=${() => { const v = !avvisi; setAvvisi(v); store.set("avvisi", v); if (v && "Notification" in window && Notification.permission === "default") Notification.requestPermission().catch(() => {}); }}
          className=${"w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left " + C.ch}>
          <span className="flex-1"><span className=${"block text-sm font-semibold " + C.tx}>Gol e risultati delle preferite</span><span className=${"block text-xs " + C.mu}>Partite con la stella e squadra del cuore. Per ora funzionano con l'app aperta.</span></span>
          <span className=${"w-11 h-6 rounded-full p-0.5 transition-colors " + (avvisi ? "bg-emerald-500" : "bg-black/20 dark:bg-white/20")}><span className=${"block w-5 h-5 rounded-full bg-white shadow transition-transform " + (avvisi ? "translate-x-5" : "")}></span></span></button>
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
