/* AuraPitch beta - web app installabile.
   Si compila con build.mjs (esbuild + Tailwind): il risultato in dist/ non dipende da CDN esterni.
   Icone: set Lucide (pacchetto react-icons/lu). Dati: data/giornata.json. */
import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import htm from "htm";
import { useLiveScores, useSummary, loadPlayer, loadCareer, ruolo, findTeam, loadTeam, minuto, ESPN_LG, andamento } from "./live.js";
import { LuActivity, LuCalculator, LuCalendar, LuChartColumn, LuCheck, LuChevronDown, LuChevronLeft, LuChevronRight, LuChevronUp, LuCircleCheck, LuCircleDot, LuCircleHelp, LuCircleX, LuClock, LuCopy, LuCrown, LuInfo, LuLock, LuMoon, LuNewspaper, LuPlay, LuPlus, LuRepeat, LuSearch, LuShare2, LuBookOpen, LuShield, LuShieldCheck, LuShirt, LuSmartphone, LuSparkles, LuStar, LuSun, LuSwords, LuTrash2, LuTrendingUp, LuTriangleAlert, LuTrophy, LuUsers, LuX, LuZap } from "react-icons/lu";

const html = htm.bind(React.createElement);
const Ic = { Calendar: LuCalendar, Trophy: LuTrophy, Sparkles: LuSparkles, Shield: LuShield, Sun: LuSun, Moon: LuMoon, HelpCircle: LuCircleHelp, X: LuX, ChevronLeft: LuChevronLeft, ChevronRight: LuChevronRight, ChevronDown: LuChevronDown, ChevronUp: LuChevronUp, Lock: LuLock, Play: LuPlay, Crown: LuCrown, Zap: LuZap, Copy: LuCopy, Check: LuCheck, Plus: LuPlus, Trash2: LuTrash2, TrendingUp: LuTrendingUp, Swords: LuSwords, Users: LuUsers, Activity: LuActivity, Newspaper: LuNewspaper, Calculator: LuCalculator, BarChart3: LuChartColumn, AlertTriangle: LuTriangleAlert, Info: LuInfo, Star: LuStar, ShieldCheck: LuShieldCheck, CircleDot: LuCircleDot, Shirt: LuShirt, Smartphone: LuSmartphone, CheckCircle2: LuCircleCheck, XCircle: LuCircleX, Clock: LuClock, Repeat: LuRepeat, Search: LuSearch, Share: LuShare2, Book: LuBookOpen };
Ic.BallIn = ({ size = 14, c = "#17152B" }) => html`<svg width=${size} height=${size} viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="#fff" /><path d="M12 7.2l3.3 2.4-1.3 3.9h-4l-1.3-3.9z" fill=${c} /><path d="M12 2v5.2M15.3 9.6l4.6-1.8M14 13.5l2.6 4.3M10 13.5l-2.6 4.3M8.7 9.6L4.1 7.8" stroke=${c} strokeWidth="1.2" fill="none" /></svg>`;
Ic.Ball = ({ size = 14, className = "" }) => html`<svg width=${size} height=${size} viewBox="0 0 24 24" className=${className} aria-hidden="true"><circle cx="12" cy="12" r="10" fill="currentColor" /><path d="M12 7.2l3.3 2.4-1.3 3.9h-4l-1.3-3.9z" fill="#fff" /><path d="M12 2v5.2M15.3 9.6l4.6-1.8M14 13.5l2.6 4.3M10 13.5l-2.6 4.3M8.7 9.6L4.1 7.8" stroke="#fff" strokeWidth="1.2" fill="none" /></svg>`;

  /* ---------- utilità ---------- */
  const store = {
    get(k, d) { try { const v = localStorage.getItem("ap:" + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem("ap:" + k, JSON.stringify(v)); } catch (e) { /* archivio del browser non disponibile */ } },
  };
  const pct = (x) => Math.round((x || 0) * 100);
  const pctL = (x) => (x > 0.99 && x < 0.999 ? ">99" : x < 0.01 && x > 0.001 ? "<1" : pct(x)); // in diretta: niente 100% o 0% per esiti non ancora decisi
  const odd = (x) => (x == null ? "-" : Number(x).toFixed(2).replace(".", ","));
  const hs = (s) => [...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const mmss = (s) => String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
  /* Identità AuraPitch: nebbia lilla (#EFEEF5) e notte (#0E0C18), inchiostro #17152B, accento viola "aura" #5B2EE6 / #A58BFF,
     diretta corallo #FF3D5A. Il colore forte lo portano le squadre (colori di maglia veri) nell'aura delle probabilità. */
  const C = {
    card: "bg-white dark:bg-[#191626] rounded-[20px]",
    tx: "text-[#17152B] dark:text-[#F4F2FF]",
    mu: "text-[#5F5B76] dark:text-[#9A95B3]",
    bd: "border-[#17152B]/[0.07] dark:border-white/[0.07]",
    ch: "bg-[#17152B]/[0.05] dark:bg-white/[0.07]",
    seg: "bg-[#17152B] text-white dark:bg-[#F4F2FF] dark:text-[#17152B]",
    on: "bg-[#5B2EE6] text-white dark:bg-[#A58BFF] dark:text-[#0E0C18]",
    lab: "text-[17px] font-semibold tracking-[-0.01em] text-[#17152B] dark:text-[#F4F2FF]",
    acc: "text-[#5B2EE6] dark:text-[#A58BFF]",
    live: "text-[#FF3D5A]",
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
  /* colore di maglia per l'aura: colori veri da ESPN (m.col) se ci sono, altrimenti quelli generici dello stemma.
     Si evitano bianco puro e nero puro (poco visibili) e due squadre con lo stesso colore. */
  const lum = (hex) => { const h = String(hex || "").replace("#", ""); if (h.length !== 6) return 0.5; const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const dist = (a, b) => { const p = (x) => [0, 2, 4].map((i) => parseInt(String(x).replace("#", "").slice(i, i + 2), 16) || 0); const [x, y] = [p(a), p(b)]; return Math.abs(x[0] - y[0]) + Math.abs(x[1] - y[1]) + Math.abs(x[2] - y[2]); };
  function auraCol(m) {
    const one = (j) => {
      const c = (m.col && m.col[j]) || null;
      if (c) { const [a, b] = c; return lum(a) > 0.86 || lum(a) < 0.05 ? (lum(b) > 0.86 || lum(b) < 0.05 ? (lum(a) > 0.86 ? "#A7A3BC" : "#3A3654") : b) : a; }
      const t = teamColors(j ? m.a : m.h)[0];
      return /^#/.test(t) && lum(t) > 0.86 ? "#A7A3BC" : t;
    };
    let h = one(0), a = one(1);
    if (/^#/.test(h) && /^#/.test(a) && dist(h, a) < 90) { const alt = m.col && m.col[1] && m.col[1][1]; a = alt && dist(alt, h) >= 90 && lum(alt) <= 0.86 ? alt : "#A7A3BC"; }
    return document.documentElement.dataset.theme === "dark" ? [h, a].map(schiarisci) : [h, a];
  }
  // in tema scuro i colori molto scuri (nero, blu notte) si schiariscono, altrimenti spariscono sullo sfondo
  function schiarisci(c) { if (!/^#[0-9a-f]{6}$/i.test(c) || lum(c) > 0.32) return c; const v = [1, 3, 5].map((i) => Math.round(parseInt(c.slice(i, i + 2), 16) * 0.45 + 255 * 0.55)); return "#" + v.map((x) => x.toString(16).padStart(2, "0")).join(""); }
  /* aura delle probabilità: 1 X 2 in proporzione, colore di casa, grigio pareggio, colore ospite */
  function AuraLine({ m, p, h = 3, labels }) {
    const P = p || m.mk || m.p;
    const [ch, ca] = auraCol(m);
    return html`<div className="w-full">
      <div className="flex w-full gap-[3px]" style=${{ height: h }} aria-hidden="true">
        <i className="block rounded-full" style=${{ width: pct(P[0]) + "%", background: ch }}></i>
        <i className="block rounded-full bg-[#17152B]/[0.14] dark:bg-white/[0.18]" style=${{ width: pct(P[1]) + "%" }}></i>
        <i className="block rounded-full" style=${{ width: pct(P[2]) + "%", background: ca }}></i></div>
      ${labels && html`<div className=${"flex justify-between mt-1.5 text-[12px] " + C.mu}>
        <span>${m.h} <b className=${"num text-[17px] font-bold " + C.tx}>${pct(P[0])}%</b></span><span>Pari <b className=${"num text-[17px] font-bold " + C.tx}>${pct(P[1])}%</b></span><span><b className=${"num text-[17px] font-bold " + C.tx}>${pct(P[2])}%</b> ${m.a}</span></div>`}</div>`;
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
  const TEMPI = ["T1:", "T2:", "PF", "TPG", "HSET", "ASET", "HVET", "AVET"];
  // stessa logica di valuta() in mercati.py; h1/a1 = risultato del primo tempo (se noto)
  function evalCode(c, h, a, h1, a1) {
    if (/^[KCF][HA]?[OU]\d/.test(c) || c.startsWith("MARC:")) return null; // cartellini, angoli, falli, marcatori: non verificabili dal solo risultato
    if (c.includes("+")) { const r = c.split("+").map((x) => evalCode(x, h, a, h1, a1)); return r.includes(null) ? null : r.every(Boolean); }
    if (TEMPI.some((t) => c.startsWith(t))) {
      if (h1 == null || a1 == null) return null;
      const h2 = h - h1, a2 = a - a1;
      if (c.startsWith("T1:")) return evalCode(c.slice(3), h1, a1);
      if (c.startsWith("T2:")) return evalCode(c.slice(3), h2, a2);
      if (c.startsWith("PF")) { const [x, y] = c.slice(2).split("/"); return evalCode(x, h1, a1) && evalCode(y, h, a); }
      if (c.startsWith("TPG")) { const g1 = h1 + a1, g2 = h2 + a2; return { 1: g1 > g2, X: g1 === g2, 2: g2 > g1 }[c.slice(3)]; }
      return { HSET: h1 > 0 && h2 > 0, ASET: a1 > 0 && a2 > 0, HVET: h1 > a1 && h2 > a2, AVET: a1 > h1 && a2 > h2 }[c];
    }
    const t = h + a;
    if (["1", "X", "2", "1X", "X2", "12"].includes(c)) return c.includes(h > a ? "1" : h === a ? "X" : "2");
    if (c === "GG") return h > 0 && a > 0;
    if (c === "NG") return h === 0 || a === 0;
    if (c === "PARI") return t % 2 === 0;
    if (c === "DISPARI") return t % 2 === 1;
    if (c.startsWith("CS")) { const [x, y] = c.slice(2).split("-").map(Number); return h === x && a === y; }
    if (c.startsWith("MG")) { const [x, y] = c.slice(2).split("-").map(Number); return t >= x && t <= y; }
    if (c.startsWith("EH")) { const [hd, e] = c.slice(2).split(":"); return evalCode(e, h + (hd[0] === "M" ? -1 : 1) * Number(hd.slice(1)), a); }
    if (c.startsWith("MV")) { const [l, n] = c.slice(2).split(":"); const d = l === "1" ? h - a : a - h; return n === "3P" ? d >= 3 : d === Number(n); }
    if (c.startsWith("GE")) return c === "GE6P" ? t >= 6 : t === Number(c.slice(2));
    if (/^[HA]GE/.test(c)) { const g = c[0] === "H" ? h : a; return c.slice(3) === "3P" ? g >= 3 : g === Number(c.slice(3)); }
    if (/^[HA][OU]/.test(c)) { const g = c[0] === "H" ? h : a, n = parseFloat(c.slice(2)); return c[1] === "O" ? g > n : g < n; }
    if (/^[OU]/.test(c)) { const n = parseFloat(c.slice(1)); return c[0] === "O" ? t > n : t < n; }
    return null;
  }
  function mLabel(m, c, short) {
    c = norm(c);
    if (c.startsWith("MARC:")) return "Segna " + c.slice(5) + (short ? "" : " (in qualsiasi momento)");
    if (/^[KCF][HA][OU]\d/.test(c)) return ({ K: "Cartellini ", C: "Angoli ", F: "Falli " })[c[0]] + (c[1] === "H" ? m.h : m.a) + (c[2] === "O" ? " Over " : " Under ") + nf(c.slice(3));
    if (/^[KCF][OU]\d/.test(c)) return ({ K: "Cartellini ", C: "Angoli ", F: "Falli " })[c[0]] + (c[1] === "O" ? "Over " : "Under ") + nf(c.slice(2));
    if (c.includes("+")) { const ps = c.split("+"), tempi = ps.some((x) => /^T[12]:/.test(x));
      return ps.map((x) => (!tempi ? mLabel(m, x, true) : /^T[12]:/.test(x) ? mLabel(m, x.slice(3), true) + " nel " + x[1] + "° tempo" : mLabel(m, x, true) + " finale")).join(" + "); }
    if (c.startsWith("T1:") || c.startsWith("T2:")) return (c[1] === "1" ? "1° tempo: " : "2° tempo: ") + mLabel(m, c.slice(3), true);
    if (c.startsWith("PF")) return "Parziale/finale " + c.slice(2);
    if (c.startsWith("TPG")) return { 1: "Più gol nel 1° tempo", X: "Stessi gol nei due tempi", 2: "Più gol nel 2° tempo" }[c.slice(3)];
    if (c === "HSET" || c === "ASET") return (c[0] === "H" ? m.h : m.a) + " segna in entrambi i tempi";
    if (c === "HVET" || c === "AVET") return (c[0] === "H" ? m.h : m.a) + " vince entrambi i tempi";
    if (c.startsWith("EH")) { const [hd, e] = c.slice(2).split(":"); const k = Number(hd.slice(1)), meno = hd[0] === "M";
      const base = "Handicap " + (meno ? "−" : "+") + k + " " + m.h + ": " + e;
      if (short) return base;
      const sq = meno ? m.h : m.a, sc = k === 1 ? "1 gol" : k + " gol";
      const nonVince = k === 1 ? `${sq} non vince (pareggio o sconfitta)` : `${sq} vince di ${k - 1 === 1 ? "1 gol" : "massimo " + (k - 1) + " gol"}, pareggia o perde`;
      const sp = meno ? { 1: `${sq} vince con almeno ${k + 1} gol di scarto`, X: `${sq} vince con esattamente ${sc} di scarto`, 2: nonVince }
        : { 1: nonVince, X: `${sq} vince con esattamente ${sc} di scarto`, 2: `${sq} vince con almeno ${k + 1} gol di scarto` };
      return base + " (" + sp[e] + ")"; }
    if (c.startsWith("MV")) { const [l, n] = c.slice(2).split(":"); return (l === "1" ? m.h : m.a) + " vince " + (n === "3P" ? "di 3 o più gol" : n === "1" ? "di 1 gol" : "di " + n + " gol"); }
    if (c.startsWith("GE")) return c === "GE6P" ? "6 o più gol nella partita" : "Gol esatti nella partita: " + c.slice(2);
    if (/^[HA]GE/.test(c)) return (c[0] === "H" ? m.h : m.a) + (c.slice(3) === "3P" ? " segna 3 o più gol" : " segna esattamente " + c.slice(3) + (c.slice(3) === "1" ? " gol" : " gol"));
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
    if (/^[HA][OU]/.test(c)) return (c[0] === "H" ? m.h : m.a) + (c[1] === "O" ? " Over " : " Under ") + nf(c.slice(2)) + " gol";
    if (/^[OU]/.test(c)) return (c[0] === "O" ? "Over " : "Under ") + nf(c.slice(1));
    return c;
  }
  /* "Spiegamelo semplice": cosa deve succedere perché la giocata sia vinta, in parole di tutti i giorni */
  function spiega(m, c, dentro) {
    c = norm(c);
    const min1 = (t) => (/^(Nella|Nel|Si |La |Il |In |Una |Almeno|Segnano|All')/.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t);
    const fine = (t) => t.replace(/\.$/, "");
    const sq = (x) => (x === "H" ? m.h : m.a);
    const almeno = (n) => Math.ceil(parseFloat(n)), almassimo = (n) => Math.floor(parseFloat(n));
    const gol = (k) => (k === 1 ? "un gol" : k + " gol");
    let t;
    if (c.includes("+")) t = c.split("+").map((x, i) => (i ? min1(fine(spiega(m, x, true))) : fine(spiega(m, x, true)))).join(" e ") + ".";
    else if (c.startsWith("MARC:")) t = `${c.slice(5)} segna almeno un gol.`;
    else if (/^[KCF][HA][OU]/.test(c)) { const v = { K: ["riceve", "cartellini"], C: ["batte", "calci d'angolo"], F: ["commette", "falli"] }[c[0]]; t = `${sq(c[1])} ${v[0]} ${c[2] === "O" ? "almeno " + almeno(c.slice(3)) : "al massimo " + almassimo(c.slice(3))} ${v[1]}.`; }
    else if (/^[KCF][OU]/.test(c)) { const v = { K: "cartellini", C: "calci d'angolo", F: "falli" }[c[0]]; t = `In tutta la partita ci sono ${c[1] === "O" ? "almeno " + almeno(c.slice(2)) : "al massimo " + almassimo(c.slice(2))} ${v}.`; }
    else if (/^T1:(1|X|2|1X|X2|12)$/.test(c)) t = { 1: `${m.h} chiude il primo tempo in vantaggio.`, X: "Il primo tempo finisce in parità.", 2: `${m.a} chiude il primo tempo in vantaggio.`, "1X": `All'intervallo ${m.h} non è in svantaggio.`, X2: `All'intervallo ${m.a} non è in svantaggio.`, 12: "All'intervallo una delle due squadre è in vantaggio." }[c.slice(3)];
    else if (/^T2:(1|X|2|1X|X2|12)$/.test(c)) t = { 1: `Nel secondo tempo ${m.h} segna più gol di ${m.a}.`, X: "Nel secondo tempo le due squadre segnano gli stessi gol.", 2: `Nel secondo tempo ${m.a} segna più gol di ${m.h}.`, "1X": `Nel secondo tempo ${m.h} segna almeno quanto ${m.a}.`, X2: `Nel secondo tempo ${m.a} segna almeno quanto ${m.h}.`, 12: "Nel secondo tempo una squadra segna più dell'altra." }[c.slice(3)];
    else if (c.startsWith("T1:") || c.startsWith("T2:")) t = (c[1] === "1" ? "Nel primo tempo " : "Nel secondo tempo ") + min1(spiega(m, c.slice(3), true)).replace(/^nella partita /, "").replace(/^la partita finisce/, "si chiude");
    else if (c.startsWith("PF")) { const [x, y] = c.slice(2).split("/"); t = `All'intervallo ${{ 1: m.h + " è in vantaggio", X: "si è in parità", 2: m.a + " è in vantaggio" }[x]} e alla fine ${{ 1: "vince " + m.h, X: "è pareggio", 2: "vince " + m.a }[y]}.`; }
    else if (c.startsWith("TPG")) t = { 1: "Si segnano più gol nel primo tempo che nel secondo.", X: "Si segnano tanti gol nel primo tempo quanti nel secondo.", 2: "Si segnano più gol nel secondo tempo che nel primo." }[c.slice(3)];
    else if (c === "HSET" || c === "ASET") t = `${sq(c[0])} segna sia nel primo sia nel secondo tempo.`;
    else if (c === "HVET" || c === "AVET") t = `${sq(c[0])} vince sia il primo sia il secondo tempo.`;
    else if (c.startsWith("EH")) { const l = mLabel(m, c); t = l.includes("(") ? l.slice(l.indexOf("(") + 1, -1).replace(/^./, (x) => x.toUpperCase()) + "." : l; }
    else if (c.startsWith("MV")) { const [l, n] = c.slice(2).split(":"); t = `${l === "1" ? m.h : m.a} vince con ${n === "3P" ? "3 o più gol" : "esattamente " + gol(Number(n))} di scarto.`; }
    else if (c.startsWith("GE")) t = c === "GE6P" ? "Nella partita si segnano 6 o più gol." : `Nella partita si segnano esattamente ${gol(Number(c.slice(2)))}.`;
    else if (/^[HA]GE/.test(c)) t = c.slice(3) === "3P" ? `${sq(c[0])} segna 3 o più gol.` : c.slice(3) === "0" ? `${sq(c[0])} non segna.` : `${sq(c[0])} segna esattamente ${gol(Number(c.slice(3)))}.`;
    else if (c === "1") t = `Vince ${m.h}.`;
    else if (c === "X") t = "La partita finisce in pareggio.";
    else if (c === "2") t = `Vince ${m.a}.`;
    else if (c === "1X") t = `${m.h} vince o pareggia: basta che non perda.`;
    else if (c === "X2") t = `${m.a} vince o pareggia: basta che non perda.`;
    else if (c === "12") t = "Una delle due squadre vince: basta che non finisca in pareggio.";
    else if (c === "GG") t = "Segnano tutte e due le squadre.";
    else if (c === "NG") t = "Almeno una delle due squadre non segna.";
    else if (c === "PARI" || c === "DISPARI") t = `Il totale dei gol è un numero ${c === "PARI" ? "pari (zero compreso)" : "dispari"}.`;
    else if (c.startsWith("CS")) t = `La partita finisce esattamente ${c.slice(2)}.`;
    else if (c.startsWith("MG")) { const [x, y] = c.slice(2).split("-"); t = `Nella partita si segnano tra ${x} e ${y} gol.`; }
    else if (/^[HA][OU]/.test(c)) { const n = c.slice(2); t = c[1] === "O" ? `${sq(c[0])} segna almeno ${gol(almeno(n))}.` : almassimo(n) === 0 ? `${sq(c[0])} non segna.` : `${sq(c[0])} segna al massimo ${gol(almassimo(n))}.`; }
    else if (/^[OU]/.test(c)) { const n = c.slice(1), k = c[0] === "O" ? almeno(n) : almassimo(n); t = c[0] === "O" ? `Nella partita si ${k === 1 ? "segna" : "segnano"} almeno ${gol(k)}.` : k === 0 ? "Nella partita non si segna." : `Nella partita si ${k === 1 ? "segna" : "segnano"} al massimo ${gol(k)}.`; }
    else t = mLabel(m, c) + ".";
    return t;
  }
  const GROUPS = ["Esito finale", "Doppia chance", "Under/Over", "Goal/No Goal", "Multigol", "Gol squadra", "Combo", "Primo tempo", "Secondo tempo", "Parziale/finale", "Tempo con più gol", "Tempi",
    "Handicap", "Margine di vittoria", "Gol esatti", "Risultato esatto", "Marcatori", "Cartellini", "Cartellini squadra", "Falli", "Falli squadra", "Calci d'angolo", "Calci d'angolo squadra", "Pari/Dispari"];
  function mGroup(c) {
    if (c.startsWith("MARC:")) return "Marcatori";
    if (/^[KCF][HA][OU]\d/.test(c)) return ({ K: "Cartellini", C: "Calci d'angolo", F: "Falli" })[c[0]] + " squadra";
    if (/^K[OU]\d/.test(c)) return "Cartellini";
    if (/^C[OU]\d/.test(c)) return "Calci d'angolo";
    if (/^F[OU]\d/.test(c)) return "Falli";
    if (c.includes("+")) return "Combo";
    if (c.startsWith("T1:")) return "Primo tempo";
    if (c.startsWith("T2:")) return "Secondo tempo";
    if (c.startsWith("PF")) return "Parziale/finale";
    if (c.startsWith("TPG")) return "Tempo con più gol";
    if (["HSET", "ASET", "HVET", "AVET"].includes(c)) return "Tempi";
    if (c.startsWith("EH")) return "Handicap";
    if (c.startsWith("MV")) return "Margine di vittoria";
    if (c.startsWith("GE")) return "Gol esatti";
    if (["1", "X", "2"].includes(c)) return "Esito finale";
    if (["1X", "X2", "12"].includes(c)) return "Doppia chance";
    if (c === "GG" || c === "NG") return "Goal/No Goal";
    if (c === "PARI" || c === "DISPARI") return "Pari/Dispari";
    if (c.startsWith("CS")) return "Risultato esatto";
    if (c.startsWith("MG")) return "Multigol";
    if (/^[HA](GE|[OU])/.test(c)) return "Gol squadra";
    return "Under/Over";
  }
  function leggiXg(x) {
    const att = x.gf - x.xf, dif = x.xs - x.gs;
    const a = att >= 2 ? "Segna più di quanto crea: rendimento sopra le occasioni, in parte fortuna o un attaccante in stato di grazia." : att <= -2 ? "Crea più di quanto segna: imprecisione o sfortuna, i gol possono arrivare." : "Gol in linea con le occasioni create.";
    const d = dif >= 2 ? " Subisce meno di quanto concede: portiere decisivo o fortuna." : dif <= -2 ? " Subisce più di quanto concede: in difesa paga oltre i demeriti." : "";
    return a + d;
  }
  function options(m) {
    if (m.markets) return m.markets.map(([c, p, q, qm, sc]) => ({ k: c, p, q: q || Math.round(Math.max(1.01, 0.94 / p) * 100) / 100, stima: !qm, s: sc == null ? null : sc }));
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
    return evalCode(norm(k), m.g[0], m.g[1], m.g1 ? m.g1[0] : null, m.g1 ? m.g1[1] : null);
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

  /* schedina con quota obiettivo: numero di partite deciso dal profilo (quota tipica per partita), poi si sceglie in ogni
     partita la giocata con il miglior punteggio IA vicina alla quota per partita e si ritocca finché il totale è vicino all'obiettivo */
  const PROF_T = [{ lo: 1.12, hi: 1.55, mid: 1.3, pmin: 0.6 }, { lo: 1.3, hi: 2.3, mid: 1.7, pmin: 0.4 }, { lo: 1.7, hi: 4.5, mid: 2.4, pmin: 0.2 }];
  const ESCLUSI_SLIP = ["Pari/Dispari", "Risultato esatto"];
  function rumore(id, v) { // numero pseudo-casuale in [-0,5, 0,5): diverso per ogni combinazione richiesta
    if (!v) return 0; let h = hs(v + "|" + id) ^ Math.imul(v, 0x9E3779B1);
    h = Math.imul(h ^ (h >>> 16), 0x85EBCA6B); h = Math.imul(h ^ (h >>> 13), 0xC2B2AE35); h ^= h >>> 16;
    return (h >>> 0) / 4294967296 - 0.5; }
  function candidati(m, prof, qt, v) {
    const R = PROF_T[prof];
    return options(m).filter((o) => { const g = mGroup(o.k); if (ESCLUSI_SLIP.includes(g)) return false;
        if (prof === 0 && /Marcatori|Cartellini|Falli|angolo|Parziale|Gol esatti|Margine|Tempo con/.test(g)) return false;
        if (prof === 1 && /Marcatori|Parziale|Gol esatti/.test(g)) return false;
        if (prof < 2 && /^EH[MP]2/.test(o.k)) return false;
        return o.p >= R.pmin && o.q >= Math.max(1.08, R.lo * 0.92) && o.q <= R.hi * 1.8; })
      .map((o) => ({ ...o, sc: (o.s != null ? o.s : 50) / 100 + 0.5 * o.p - 0.35 * Math.abs(Math.log(o.q / qt)) + (o.stima ? 0 : 0.1) + 0.12 * rumore(m.id + o.k, v) }))
      .sort((a, b) => b.sc - a.sc);
  }
  function buildTarget(matches, prof, T, v) {
    const R = PROF_T[prof], LT = Math.log(T);
    let n = Math.max(1, Math.min(14, Math.round(LT / Math.log(R.mid))));
    const qt = Math.exp(LT / n);
    const pool = matches.map((m) => ({ m, c: candidati(m, prof, qt, v) })).filter((x) => x.c.length)
      .sort((a, b) => b.c[0].sc + 0.15 * rumore(b.m.id, v) - (a.c[0].sc + 0.15 * rumore(a.m.id, v)));
    if (!pool.length) return [];
    n = Math.min(n, pool.length);
    let sel = pool.slice(0, n).map((x) => ({ x, i: 0 }));
    const tot = () => sel.reduce((a, s) => a + Math.log(s.x.c[s.i].q), 0);
    for (let it = 0; it < 80; it++) {
      const d = tot() - LT;
      if (Math.abs(d) < 0.06) break;
      let best = null;
      sel.forEach((s, si) => s.x.c.forEach((o, oi) => { if (oi === s.i) return;
        const nd = d - Math.log(s.x.c[s.i].q) + Math.log(o.q); const gain = Math.abs(d) - Math.abs(nd); const loss = s.x.c[s.i].sc - o.sc;
        if (gain > 0.02 && (!best || gain - 0.6 * loss > best.v)) best = { si, oi, v: gain - 0.6 * loss }; }));
      if (best) { sel[best.si].i = best.oi; continue; }
      if (d < -Math.log(R.lo) && sel.length < pool.length) { sel.push({ x: pool[sel.length], i: 0 }); continue; }
      if (d > Math.log(1.25) && sel.length > 1) { sel.sort((a, b) => b.x.c[b.i].sc - a.x.c[a.i].sc); sel.pop(); continue; }
      break;
    }
    return sel.map((s) => ({ m: s.x.m, ...s.x.c[s.i] }));
  }
  const PERIODI = [["oggi", "Oggi"], ["domani", "Domani"], ["3g", "Prossimi 3 giorni"], ["weekend", "Weekend"], ["7g", "Prossimi 7 giorni"], ["tutte", "Tutte"]];
  function inPeriodo(date, per, today) {
    const t0 = new Date(today + "T12:00:00"), d = new Date(date + "T12:00:00"), g = Math.round((d - t0) / 86400000);
    if (per === "oggi") return g === 0;
    if (per === "domani") return g === 1;
    if (per === "3g") return g >= 0 && g <= 2;
    if (per === "7g") return g >= 0 && g <= 6;
    if (per === "weekend") { const wd = t0.getDay(); const sab = wd === 0 ? -1 : 6 - wd; return g >= Math.max(0, sab) && g <= sab + 1; }
    return true;
  }

  /* ---------- componenti base ---------- */
  function Seg({ items, val, set, small }) {
    return html`<div className=${"flex p-[3px] rounded-full " + C.ch} role="tablist">${items.map((t, i) => html`
      <button key=${t} role="tab" aria-selected=${val === i} onClick=${() => set(i)}
        className=${"flex-1 px-2 py-1.5 rounded-full font-semibold leading-tight transition-colors " + (small ? "text-[12px] " : "text-[13px] ") + (val === i ? C.seg : C.mu)}>${t}</button>`)}</div>`;
  }
  /* schede a pillola: la sezione attiva e piena color inchiostro, scorrevoli in orizzontale */
  function Tabs({ items, val, set, sticky }) {
    const ref = useRef(null);
    useEffect(() => { const el = ref.current && ref.current.children[val]; if (el && el.scrollIntoView) el.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" }); }, [val]);
    return html`<div data-noswipe="1" className=${(sticky ? "sticky z-20 " : "") + "-mx-4 px-4 py-2"} style=${sticky ? { top: "calc(env(safe-area-inset-top, 0px) + 56px)", background: "var(--bg)" } : null}>
      <div ref=${ref} className="flex gap-1.5 overflow-x-auto noscroll" role="tablist">${items.map((t, i) => html`<button key=${t} role="tab" aria-selected=${val === i} onClick=${() => set(i)}
        className=${"shrink-0 px-3.5 py-[7px] rounded-full text-[14px] font-semibold whitespace-nowrap transition-colors " + (val === i ? C.seg : C.mu + " hover:bg-[#17152B]/[0.05] dark:hover:bg-white/[0.06]")}>${t}</button>`)}</div></div>`;
  }
  function Chip({ on, children, onClick, cls }) {
    return html`<button onClick=${onClick} className=${"inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[13px] font-semibold shrink-0 " + (on ? C.on : C.ch + " " + C.tx) + " " + (cls || "")}>${children}</button>`;
  }
  function Sheet({ onClose, children, title }) {
    return html`<div className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center" onClick=${onClose}>
      <div onClick=${(e) => e.stopPropagation()} className=${"w-full max-w-[480px] rounded-t-[22px] p-5 space-y-3 max-h-[88vh] overflow-y-auto bg-white dark:bg-[#191626] " + C.tx}
        style=${{ paddingBottom: "calc(20px + env(safe-area-inset-bottom, 0px))" }}>
        <div className="flex items-center"><div className="font-semibold flex-1">${title}</div><button aria-label="Chiudi" onClick=${onClose} className=${C.mu}><${Ic.X} size=${20} /></button></div>
        ${children}</div></div>`;
  }
  function FavPill({ m, unlocked, big, pp }) {
    const P = pp || m.p;
    const f = P.indexOf(Math.max(...P));
    const p = P[f];
    // bloccata: niente esito né colore della fiducia, altrimenti si capirebbe il favorito
    return html`<span className=${"inline-flex items-center gap-1 rounded-full border tabular-nums font-bold shrink-0 " + (big ? "px-3 py-1 text-sm " : "px-2 py-0.5 text-[11px] ") + TONE[unlocked ? confTone(p) : "ok"]}>
      <span>${unlocked ? ESITI[f] : "?"}</span><span className=${"num " + (big ? "text-[16px] " : "text-[13px] ") + (unlocked ? "" : "blur-[4px] select-none")}>${unlocked ? pct(p) : 50}%</span>${!unlocked && html`<${Ic.Lock} size=${10} className="opacity-60" />`}</span>`;
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

  /* marchio: anelli concentrici (l'aura) attorno al dischetto del centrocampo */
  function Marchio({ size = 30 }) {
    return html`<svg width=${size} height=${size} viewBox="0 0 512 512" aria-hidden="true" className="shrink-0">
      <rect width="512" height="512" rx="128" fill="#17152B" />
      <circle cx="256" cy="286" r="170" fill="none" stroke="#A58BFF" strokeWidth="14" opacity="0.3" />
      <circle cx="256" cy="286" r="122" fill="none" stroke="#A58BFF" strokeWidth="18" opacity="0.55" />
      <circle cx="256" cy="286" r="76" fill="none" stroke="#C9B9FF" strokeWidth="22" />
      <line x1="72" y1="286" x2="440" y2="286" stroke="#F4F2FF" strokeWidth="14" opacity="0.85" /><circle cx="256" cy="286" r="30" fill="#F4F2FF" /></svg>`;
  }
  /* giorni: numero grande in stile tabellone, giorno della settimana sopra */
  function Giorni({ days, day, setDay, demo }) {
    const GS = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"];
    const ref = useRef(null);
    useEffect(() => { const el = ref.current && ref.current.querySelector("[aria-selected=true]"); if (el && el.scrollIntoView) el.scrollIntoView({ block: "nearest", inline: "center" }); }, [day]);
    const btn = (on) => "shrink-0 w-[58px] h-[60px] rounded-[16px] flex flex-col items-center justify-center " + (on ? C.seg : "bg-white dark:bg-[#191626] " + C.tx);
    return html`<div ref=${ref} data-noswipe="1" className="-mx-4 px-4 flex gap-1.5 overflow-x-auto noscroll" role="tablist">
      <button role="tab" aria-selected=${day === "all"} onClick=${() => setDay("all")} className=${btn(day === "all")}>
        <span className="text-[13px] font-semibold">${demo ? "Giornata" : "Tutte"}</span></button>
      ${days.map((d) => { const dt = new Date(d.k + "T12:00:00"); const on = day === d.k; return html`<button key=${d.k} role="tab" aria-selected=${on} onClick=${() => setDay(d.k)} className=${btn(on)}>
        <span className=${"text-[11px] font-semibold " + (on ? "opacity-80" : "opacity-60")}>${d.label === "Oggi" || d.label === "Domani" ? d.label : GS[dt.getDay()]}</span>
        <span className="num text-[24px] font-bold leading-none mt-0.5">${dt.getDate()}</span></button>`; })}</div>`;
  }

  /* schede scorrevoli col dito (stesso comportamento della scheda partita), con la scheda scelta ricordata */
  function Schede({ id, items, children }) {
    const [i, setI0] = useState(Math.min(store.get("sch:" + id, 0), items.length - 1));
    const [dir, setDir] = useState(0);
    const sw = useRef(null);
    const seg = useRef(null);
    const setI = (n) => { setDir(n > i ? 1 : -1); setI0(n); store.set("sch:" + id, n);
      const el = seg.current; if (el && el.getBoundingClientRect().top < 60) window.scrollTo({ top: Math.max(0, window.scrollY + el.getBoundingClientRect().top - 56), behavior: "instant" }); };
    const ts = (e) => { const t = e.touches[0]; sw.current = e.target.closest("[data-noswipe]") ? null : [t.clientX, t.clientY]; };
    const te = (e) => { if (!sw.current) return; const t = e.changedTouches[0], dx = t.clientX - sw.current[0], dy = t.clientY - sw.current[1]; sw.current = null;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) { const n = Math.max(0, Math.min(items.length - 1, i + (dx < 0 ? 1 : -1))); if (n !== i) setI(n); } };
    return html`<${React.Fragment}><div ref=${seg} className="h-0"></div><${Tabs} items=${items} val=${i} set=${setI} sticky=${true} />
      <div key=${i} onTouchStart=${ts} onTouchEnd=${te} className=${"space-y-3 min-h-[60vh] " + (dir > 0 ? "entra-dx" : dir < 0 ? "entra-sx" : "")}>${children[i]}</div><//>`;
  }

  const Ctx = React.createContext(null);

    /* ---- riga partita: orario a sinistra, squadre una sopra l'altra, punteggi in colonna, aura delle probabilita sotto ---- */
    function Row({ m, i }) {
    const { goMatch, unlocked } = React.useContext(Ctx);
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
    return html`<button onClick=${() => goMatch(m.id)} className=${"w-full text-left px-4 pt-3 pb-2.5 " + (i ? "border-t " + C.bd : "")}>
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
    function Lineups({ sm, m, onPlayer }) {
      const F = sm.formazioni;
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
            const g = await (await fetch("https://geocoding-api.open-meteo.com/v1/search?count=1&language=it&name=" + encodeURIComponent(citta))).json();
            const p = g.results && g.results[0];
            if (!p) return;
            const f = await (await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${p.latitude}&longitude=${p.longitude}&hourly=temperature_2m,precipitation,wind_speed_10m&timezone=UTC&forecast_days=8`)).json();
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
            ${form.length > 0 && html`<div className="mt-1.5"><${Form} list=${form} /></div>`}</div></div>
        <${Seg} items=${["Partite", "Rosa", "Indisponibili"]} val=${t} set=${setT} />
        ${!d ? html`<div className=${C.card + " p-4 text-sm " + C.mu}>${err || "Caricamento..."}</div>`
          : t === 0 ? html`<${React.Fragment}>
            <div className=${C.lab}>Prossime partite</div>
            <div className=${C.card + " px-4 py-1"}>${d.prossime.length ? d.prossime.map((r, i) => html`<div key=${r.id} className=${"flex items-center gap-2 py-2 text-sm " + (i ? "border-t " + C.bd : "") + " " + C.tx}>
              <span className=${"w-24 text-xs tabular-nums " + C.mu}>${dt(r.date)}</span><span className="flex-1 truncate">${r.casa ? "vs" : "@"} ${r.avv}</span><span className=${"text-[11px] " + C.mu}>${r.comp}</span></div>`)
              : html`<div className=${"py-2 text-sm " + C.mu}>Nessuna partita in calendario.</div>`}</div>
            <div className=${C.lab}>Risultati</div>
            <div className=${C.card + " px-4 py-1"}>${d.risultati.map((r, i) => html`<div key=${r.id} className=${"flex items-center gap-2 py-2 text-sm " + (i ? "border-t " + C.bd : "") + " " + C.tx}>
              <span className=${"w-6 h-6 rounded-md border text-[11px] font-semibold flex items-center justify-center " + TONE[r.esito === "V" ? "good" : r.esito === "N" ? "warn" : "bad"]}>${r.esito}</span>
              <span className=${"w-12 text-xs tabular-nums " + C.mu}>${new Date(r.date).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" })}</span>
              <span className="flex-1 truncate">${r.casa ? "vs" : "@"} ${r.avv}</span><b className="tabular-nums">${r.g[0]}-${r.g[1]}</b></div>`)}</div><//>`
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
      const { D, setGloss } = React.useContext(Ctx);
      const { mySlip, addLeg, aff } = React.useContext(Ctx);
      const [why, setWhy] = useState("consiglio");
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
        ${tip.consiglio ? html`<${Card} k="consiglio" /><div className="grid gap-2"><${Card} k="prudente" /><${Card} k="coraggiosa" /></div>`
          : html`<div className=${C.card + " p-4 text-sm " + C.tx}>Nessun consiglio: per questa partita mancano quote sufficienti per stimare i mercati.</div>`}
        ${scelte.length > 0 && html`<div className=${C.card + " p-4"}>
          <div className="flex items-baseline mb-1"><span className=${C.lab + " flex-1"}>La scelta dell'IA per ogni scommessa</span><span className=${"text-[12px] " + C.mu}>${scelte.length} tipi</span></div>
          <p className=${"text-[12px] mb-2 " + C.mu}>Per ogni tipo di scommessa, la giocata dove probabilità e dati della partita vanno più d'accordo. Il numero è il punteggio IA (0-100).</p>
          ${scelte.map(([g, x], i) => { const o = ap === g; return html`<div key=${g} className=${i ? "border-t " + C.bd : ""}>
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
              ${!x.si.length && !x.no.length && html`<div className=${C.mu}>Per questo tipo di scommessa non ci sono statistiche dedicate: conta solo la probabilità.</div>`}</div>`}</div>`; })}</div>`}
        <div className="flex items-baseline pt-1"><span className=${C.lab + " flex-1"}>Tutti i mercati</span><button onClick=${() => setGloss(true)} className=${"text-[13px] font-semibold " + C.acc}>Cosa vogliono dire?</button></div>
        <div className=${C.card + " px-4 py-1"}>${groups.map(([g, l], i) => { const o = grp === g; return html`<div key=${g} className=${i ? "border-t " + C.bd : ""}>
          <button onClick=${() => setGrp(o ? null : g)} className=${"w-full flex items-center py-3 text-[15px] font-semibold " + C.tx}><span className="flex-1 text-left">${g}</span><span className=${"num text-[15px] font-semibold mr-2 " + C.mu}>${l.length}</span><${o ? Ic.ChevronUp : Ic.ChevronDown} size=${16} className=${C.mu} /></button>
          ${o && html`<div className="pb-2">${l.map((x) => html`<div key=${x.k} className="flex items-center gap-2 py-1.5">
            <${Punti} v=${x.s} />
            <span className=${"flex-1 text-sm leading-tight " + C.tx}>${mLabel(m, x.k)}${ia.g[g] && ia.g[g].c === x.k ? html` <span className=${"text-[11px] font-semibold " + C.acc}>Scelta IA</span>` : ""}</span>
            <span className=${"text-xs tabular-nums w-10 text-right " + C.mu}>${pct(x.p)}%</span>
            <span className=${"text-sm font-semibold tabular-nums w-12 text-right " + C.tx}>${odd(x.q)}</span><${AddBtn} c=${x.k} /></div>`)}</div>`}</div>`; })}</div>
        <p className=${"text-[11px] " + C.mu}>Punteggio IA: 55% accordo con le statistiche delle squadre (forma, gol per tempo, differenza reti, cartellini attesi, gol dei giocatori), 45% probabilità. Probabilità calcolate dalle quote medie dei bookmaker (modello dei gol attesi, tempi tarati su 38.700 partite). Quota "media" = raccolta dai bookmaker; quota "stimata" = calcolata dalla probabilità con un margine tipico del 6%, quella reale può variare. Il consiglio sceglie il mercato dove probabilità e statistiche delle squadre vanno d'accordo: non è una garanzia.</p>
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
      const onTS = (e) => { const t = e.touches[0]; sw.current = e.target.closest("[data-noswipe]") ? null : [t.clientX, t.clientY]; };
      const onTE = (e) => { if (!sw.current) return; const t = e.changedTouches[0], dx = t.clientX - sw.current[0], dy = t.clientY - sw.current[1]; sw.current = null;
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) { const n = Math.max(0, Math.min(TABS.length - 1, mt + (dx < 0 ? 1 : -1))); if (n !== mt) { vai(n); store.set("swipeOk", true); } } };
      const fav = m.p.indexOf(Math.max(...m.p));
      const S = D.standings[m.lg];
      const st = S ? S[["generale", "casa", "trasferta"][filt]] : [];
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
          <div className="flex items-center justify-center gap-2"><${Flag} k=${L.flag} w=${16} /><span className=${"text-[12px] font-medium " + C.mu}>${L.name}, ${new Date(m.date + "T12:00:00").toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" })}</span></div>
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

        ${mt === 1 && html`<${React.Fragment}>
          ${(!sm || sm.st === "NS") && html`<div className=${C.card + " p-4 text-[14px] " + C.mu}>${m.st === "FT" ? "Il resoconto della partita non è disponibile." : `La partita inizia ${m.date === new Date().toISOString().slice(0, 10) ? "oggi" : "il " + m.date.slice(8) + "/" + m.date.slice(5, 7)} alle ${m.time}: qui troverai azione in diretta, andamento, eventi, migliori in campo, mappa dei tiri e statistiche.`}</div>`}
          ${sm && sm.st === "LIVE" && html`<${LiveAction} sm=${sm} m=${m} />`}
          ${sm && sm.st !== "NS" && html`<${Andamento} sm=${sm} m=${m} />`}
          ${sm && sm.st !== "NS" && html`<${KeyEvents} sm=${sm} m=${m} />`}
          ${sm && sm.st !== "NS" && html`<${Migliori} sm=${sm} m=${m} onPlayer=${(p, j) => setPl({ p, side: j })} />`}
          ${sm && sm.st !== "NS" && html`<${TiriCard} sm=${sm} m=${m} />`}
          ${sm && sm.st !== "NS" && html`<${StatsCard} sm=${sm} m=${m} />`}<//>`}

        ${mt === 3 && html`<${Gate} m=${m} title="Analisi IA: probabilità, gol attesi e consiglio">
          <${TipView} m=${m} sm=${sm} />
          <${FattoriCard} m=${m} />
          <${ArbitroCard} m=${m} />
          ${m.cart && html`<div className=${C.card + " p-4 space-y-1.5"}><div className=${C.lab}>Cartellini, falli e angoli attesi</div>
            ${[["K", "Cartellini"], ["F", "Falli"], ["C", "Calci d'angolo"]].filter(([k]) => m.cart[k]).map(([k, l]) => { const x = m.cart[k]; return html`<div key=${k} className=${"text-sm " + C.tx}><b>${l}: ${nf(x.attesi)}</b> <span className=${C.mu}>(media del campionato ${nf(x.media_lega)}; ${m.h} ${nf(x.casa[0])} fatti e ${nf(x.casa[1])} subiti a partita, ${m.a} ${nf(x.ospite[0])} e ${nf(x.ospite[1])})</span></div>`; })}
            <div className=${"text-[11px] " + C.mu}>Modello verificato su 7 campionati dal 2012: rispetto alla sola media del campionato sbaglia l'1,6% in meno sui cartellini e lo 0,4% sugli angoli. Le partite equilibrate hanno più cartellini. I mercati sono in "Tutti i mercati", con quota stimata.</div></div>`}
          <${MeteoCard} m=${m} sm=${sm} />
          <div className=${C.card + " p-4 space-y-2"}><div className=${C.lab}>Laboratorio: IA contro quote</div>
            <div className="overflow-x-auto"><table className=${"w-full text-sm tabular-nums " + C.tx}><thead><tr className=${"text-[11px] " + C.mu}><th className="text-left font-medium py-1">Esito</th><th className="text-right font-medium">IA</th><th className="text-right font-medium">Quote</th><th className="text-right font-medium">${D.demo ? "Bet365" : "Media"}</th><th className="text-right font-medium">Migliore</th></tr></thead>
              <tbody>${[["1", m.p[0], m.mk[0], m.odds["1"], m.max["1"]], ["X", m.p[1], m.mk[1], m.odds["X"], m.max["X"]], ["2", m.p[2], m.mk[2], m.odds["2"], m.max["2"]],
                ["Over 2,5", m.po, m.mo, m.odds.O, m.max.O], ["Under 2,5", 1 - m.po, 1 - m.mo, m.odds.U, m.max.U]].map((r) => html`<tr key=${r[0]} className=${"border-t " + C.bd}>
                <td className="py-1.5 font-semibold">${r[0]}</td><td className="text-right">${pct(r[1])}%</td><td className=${"text-right " + C.mu}>${pct(r[2])}%</td><td className="text-right">${odd(r[3])}</td><td className=${"text-right " + C.mu}>${odd(r[4])}</td></tr>`)}</tbody></table></div>
            <p className=${"text-[11px] " + C.mu}>${D.demo ? "\"Quote\" è la probabilità ricavata dalla quota togliendo il margine del bookmaker. Nel test su oltre 18.000 partite gli scarti tra IA e quote non hanno dato un vantaggio affidabile: per questo l'IA non li trasforma in consigli."
              : "Per ora l'IA usa come base la quota media dei bookmaker, perché nei test è la stima più precisa: se ne discosterà solo quando arriveranno formazioni ufficiali e notizie. \"Migliore\" è la quota più alta tra i bookmaker."}</p></div>
          ${m.xg[0] != null && html`<div className=${C.card + " p-4 grid grid-cols-2 gap-2 text-center"}>
            ${[["Gol attesi " + m.h, (m.xg[0] || 0).toFixed(2).replace(".", ",")], ["Gol attesi " + m.a, (m.xg[1] || 0).toFixed(2).replace(".", ",")], ...(m.elo[0] ? [["Elo casa", m.elo[0]], ["Elo ospiti", m.elo[1]]] : [])].map(([a, b]) => html`<div key=${a} className=${"rounded-xl p-2 " + C.ch}>
              <div className=${"text-base font-semibold tabular-nums " + C.tx}>${b}</div><div className=${"text-[10px] " + C.mu}>${a}</div></div>`)}</div>`}<//>`}


        ${mt === 4 && html`<${React.Fragment}>
          <div className=${C.card + " p-4 space-y-3"}><div className="flex justify-between items-baseline"><span className=${C.lab}>Probabilità dalle quote</span><span className=${"text-[11px] " + C.mu}>Over 2,5: <b className=${C.tx}>${pct(m.mo)}%</b></span></div>
            <${AuraLine} m=${m} h=${6} labels=${true} />
            ${!D.demo && m.nb ? html`<div className=${"text-[11px] " + C.mu}>Quota media di ${m.nb} bookmaker${m.prepartita ? ", aggiornata alle " + new Date(m.prepartita).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }) + " (prima del calcio d'inizio)" : ", fotografata al mattino"}.</div>` : null}
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
          <${Curiosita} m=${m} />

          <div className=${"flex items-center gap-2 text-sm font-semibold " + C.tx}><${Flag} k=${L.flag} />Classifica ${L.name}</div>
          ${!(S && S.solo_generale) && html`<${Seg} items=${["Generale", "Solo Casa", "Solo Trasferta"]} val=${filt} set=${setFilt} />`}
          <div className=${C.card + " p-2 overflow-x-auto"}><table className=${"w-full text-sm tabular-nums " + C.tx}><thead><tr className=${"text-[11px] " + C.mu}>
            <th className="text-left font-medium p-1.5 w-6">#</th><th className="text-left font-medium">Squadra</th><th className="text-right font-medium">G</th><th className="text-right font-medium">V</th><th className="text-right font-medium">N</th><th className="text-right font-medium">P</th><th className="text-right font-medium">DR</th><th className="text-right font-medium pr-1.5">Pt</th></tr></thead>
            <tbody>${st.map((r, i) => { const hl = r.team === m.h || r.team === m.a; return html`<tr key=${r.team} className=${hl ? "bg-[#5B2EE6]/[0.07] dark:bg-[#A58BFF]/[0.12] font-semibold" : ""}>
              <td className="p-1.5">${i + 1}</td><td><span className="flex items-center gap-1.5 min-w-0"><${Crest} t=${r.team} size=${14} /><span className="truncate">${r.team}</span></span></td>
              <td className=${"text-right " + C.mu}>${r.pg}</td><td className="text-right">${r.v}</td><td className="text-right">${r.n}</td><td className="text-right">${r.p}</td><td className="text-right">${r.gf - r.gs > 0 ? "+" : ""}${r.gf - r.gs}</td><td className="text-right pr-1.5 font-semibold">${r.pt}</td></tr>`; })}</tbody></table></div>
          <div className=${C.card + " p-4 space-y-2"}><div className=${C.lab}>Ultime 5</div>
            ${[m.h, m.a].map((t, j) => html`<div key=${t}><button onClick=${() => setL5(l5 === j ? null : j)} className="w-full flex items-center gap-2"><${Crest} t=${t} size=${16} />
              <span className=${"text-sm flex-1 text-left truncate " + C.tx}>${t}</span><${Form} list=${m.last5[j]} /><${Ic.ChevronDown} size=${14} className=${C.mu + (l5 === j ? " rotate-180" : "")} /></button>
              ${l5 === j && html`<div className="mt-2 space-y-1">${m.last5[j].slice().reverse().map((z, q) => html`<div key=${q} className=${"flex justify-between text-xs " + C.tx}><span className=${C.mu}>${z.data}</span><span className="flex-1 px-2 truncate">${z.casa ? "vs" : "@"} ${z.avv}</span><span className="font-semibold tabular-nums">${z.ris}</span></div>`)}</div>`}</div>`)}</div>
          <div className=${C.card + " p-4"}><div className=${C.lab + " mb-2"}>Scontri diretti</div>
            ${m.h2h.length ? m.h2h.map((z, q) => html`<div key=${q} className=${"flex justify-between text-sm py-1 tabular-nums " + C.tx}><span className=${C.mu + " w-16"}>${z.data}</span><span className="flex-1 text-right pr-2 truncate">${z.casa}</span><b>${z.ris}</b><span className="flex-1 pl-2 truncate">${z.ospite}</span></div>`)
              : html`<div className=${"text-sm " + C.mu}>${D.demo ? "Nessun precedente negli ultimi 8 anni." : "Nessun precedente nei dati disponibili."}</div>`}</div>
          ${!S && html`<div className=${C.card + " p-4 text-sm " + C.mu}>Classifica, ultime 5 e precedenti non sono disponibili per questo campionato nella fonte dati gratuita.</div>`}          <${InfoCard} m=${m} sm=${sm} L=${L} /><//>`}

        ${mt === 5 && (sm ? html`<${Cronaca} sm=${sm} m=${m} />` : html`<div className=${C.card + " p-4 text-sm " + C.mu}>${m.eid ? "Caricamento della cronaca..." : "La cronaca scritta compare quando la partita è collegata alla diretta: di solito dal giorno della partita, con le formazioni ufficiali."}</div>`)}

        ${mt === 2 && (sm ? html`<${Lineups} sm=${sm} m=${m} onPlayer=${(p) => setPl({ p, side: sm.formazioni[0] && sm.formazioni[0].all.includes(p) ? 0 : 1 })} />` : html`<div className=${C.card + " p-4 text-sm " + C.mu}>${m.eid ? "Caricamento delle formazioni..." : "Le formazioni compaiono il giorno della partita, circa un'ora prima del calcio d'inizio."}</div>`)}
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
      const { unlocked, setUnlock, addLeg, mySlip } = React.useContext(Ctx);
      const st = sm && sm.st !== "NS" ? sm.st : m.st;
      const tip = m.tip && m.tip.consiglio;
      const inSlip = mySlip.find((x) => x.id === m.id);
      const sapere = [];
      for (const f of (m.fattori || []).filter((f) => f.delta || f.delta_avv).slice(0, 1)) sapere.push(`${f.chi} (${f.lato ? m.a : m.h}) ${f.tipo === "dubbio" ? "è in dubbio" : f.tipo === "squalifica" ? "è squalificato" : "potrebbe non esserci"}.`);
      for (const t of (m.curiosita || []).slice(0, 3 - sapere.length)) sapere.push(t);
      if (m.arbitro && m.arbitro.ratio && m.arbitro.n >= 8 && Math.abs(m.arbitro.ratio.K - 1) > 0.08 && sapere.length < 4) sapere.push(`Arbitra ${m.arbitro.nome}, ${m.arbitro.ratio.K > 1 ? "di solito più severo" : "di solito meno severo"} della media con i cartellini.`);
      const evs = sm ? sm.eventi.filter((e) => /gol|rigore$|autogol|rosso/.test(e.k) && !/sbagliato|parato/.test(e.k)).slice(-3).reverse() : [];
      const stat = (n) => (sm ? sm.statistiche.find((r) => r[0] === n) : null);
      const best = sm && sm.st !== "NS" ? [0, 1].flatMap((j) => (sm.formazioni[j] ? sm.formazioni[j].all.filter((p) => p.voto != null).map((p) => ({ p, j })) : [])).sort((a, b) => b.p.voto - a.p.voto)[0] : null;
      const { D: DD } = React.useContext(Ctx);
      const grande = st === "NS" && (partitaSettimana(DD) || {}).id === m.id;
      return html`<${React.Fragment}>
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
      <//>`;
    }

    /* ---- voti AuraPitch della stagione per campionato (almeno 4 partite con voto) ---- */
    function usaVoti() { const [V, setV] = useState(null); useEffect(() => { caricaVoti().then(setV); }, []); return V; }
    function VotiLega({ k }) {
      const V = usaVoti();
      const [ruolo, setRuolo] = useState(0);
      if (!V) return html`<div className=${C.card + " p-4 text-sm " + C.mu}>Caricamento dei voti...</div>`;
      const R = ["Tutti", "Attaccanti", "Centrocampisti", "Difensori", "Portieri"];
      const ok = (pos) => { const p = String(pos || ""); return ruolo === 0 || (ruolo === 4 ? p === "G" : ruolo === 3 ? /^(D|CB|CD|LB|RB|SW|LWB|RWB)/.test(p) : ruolo === 1 ? /^(F|CF|ST|LW|RW|SS)/.test(p) : /^(M|CM|DM|AM|LM|RM|CDM|CAM)/.test(p)); };
      const L = Object.entries(V).filter(([, x]) => x[7] === k && x[1] >= 4 && ok(x[8])).sort((a, b) => b[1][0] - a[1][0]).slice(0, 25);
      return html`<${React.Fragment}>
        <div className="flex gap-1.5 overflow-x-auto noscroll -mx-4 px-4">${R.map((r, i) => html`<button key=${r} onClick=${() => setRuolo(i)} className=${"shrink-0 px-3 py-1.5 rounded-full text-[13px] font-semibold " + (ruolo === i ? C.seg : "bg-white dark:bg-[#191626] " + C.tx)}>${r}</button>`)}</div>
        <div className=${C.card + " px-4 py-1"}>${L.length ? L.map(([id, x], i) => html`<div key=${id} className=${"flex items-center gap-2.5 py-2 " + (i ? "border-t " + C.bd : "")}>
          <span className=${"num w-6 text-[16px] font-bold " + C.mu}>${i + 1}</span><${Crest} t=${x[6]} size=${16} />
          <span className="flex-1 min-w-0"><span className=${"block text-[14px] font-semibold truncate " + C.tx}>${x[5]}</span><span className=${"block text-[11px] truncate " + C.mu}>${x[6]}, ${x[1]} partite${x[3] ? ", " + x[3] + " gol" : ""}${x[4] ? ", " + x[4] + " assist" : ""}</span></span>
          <${VotoChip} v=${x[0]} /></div>`) : html`<div className=${"py-3 text-sm " + C.mu}>Ancora pochi voti per questo campionato.</div>`}</div>
        <p className=${"text-[11px] " + C.mu}>Voti AuraPitch calcolati dalle statistiche di ogni partita della stagione (ESPN), media su almeno 4 partite.</p><//>`;
    }
    /* ---- confronta due squadre o due giocatori ---- */
    function Confronta({ k }) {
      const { D } = React.useContext(Ctx);
      const V = usaVoti();
      const [tipo, setTipo] = useState(0);
      const S = D.standings[k];
      const squadre = S ? S.generale.map((r) => r.team) : [...new Set(D.matches.filter((m) => m.lg === k).flatMap((m) => [m.h, m.a]))];
      const [a, setA] = useState(squadre[0]); const [b, setB] = useState(squadre[1]);
      const gioc = V ? Object.entries(V).filter(([, x]) => x[7] === k && x[1] >= 3).sort((p, q) => q[1][2] - p[1][2]) : [];
      const [pa, setPa] = useState(""); const [pb, setPb] = useState("");
      const riga = (l, x, y, fmt, meglioBasso) => { const vx = Number(x) || 0, vy = Number(y) || 0, t = Math.abs(vx) + Math.abs(vy) || 1; const wx = meglioBasso ? vx < vy : vx > vy, wy = meglioBasso ? vy < vx : vy > vx;
        return html`<div key=${l} className="py-2"><div className="flex items-center justify-between"><span className=${"num text-[19px] font-bold " + (wx ? C.acc : C.tx)}>${fmt ? fmt(x) : x}</span><span className=${"text-[13px] " + C.mu}>${l}</span><span className=${"num text-[19px] font-bold " + (wy ? C.acc : C.tx)}>${fmt ? fmt(y) : y}</span></div>
          <div className="flex gap-[3px] mt-1.5 h-[5px]"><i className="block rounded-full bg-[#5B2EE6] dark:bg-[#A58BFF]" style=${{ width: (Math.abs(vx) / t) * 100 + "%", opacity: wx ? 1 : 0.35 }}></i><i className="block rounded-full bg-[#17152B] dark:bg-[#F4F2FF]" style=${{ width: (Math.abs(vy) / t) * 100 + "%", opacity: wy ? 1 : 0.35 }}></i></div></div>`; };
      const sel = (v, set, opts) => html`<select value=${v} onChange=${(e) => set(e.target.value)} className=${"w-full min-w-0 rounded-xl px-3 py-2.5 text-[14px] font-semibold " + C.ch + " " + C.tx}>${opts.map(([val, lab]) => html`<option key=${val} value=${val}>${lab}</option>`)}</select>`;
      const rs = (t) => (S ? S.generale.find((r) => r.team === t) : null);
      const f2 = (x) => nf(Number(x).toFixed(2));
      return html`<${React.Fragment}>
        <${Seg} small=${true} items=${["Squadre", "Giocatori"]} val=${tipo} set=${setTipo} />
        ${tipo === 0 ? html`<div className=${C.card + " p-4"}>
            <div className="grid grid-cols-2 gap-2 mb-2">${sel(a, setA, squadre.map((t) => [t, t]))}${sel(b, setB, squadre.map((t) => [t, t]))}</div>
            ${rs(a) && rs(b) ? html`<div>${[["Posizione", S.generale.indexOf(rs(a)) + 1, S.generale.indexOf(rs(b)) + 1, null, true], ["Punti", rs(a).pt, rs(b).pt], ["Vittorie", rs(a).v, rs(b).v], ["Gol fatti", rs(a).gf, rs(b).gf], ["Gol subiti", rs(a).gs, rs(b).gs, null, true],
                ["Punti a partita", rs(a).pt / (rs(a).pg || 1), rs(b).pt / (rs(b).pg || 1), f2], ["Gol a partita", rs(a).gf / (rs(a).pg || 1), rs(b).gf / (rs(b).pg || 1), f2]].map(([l, x, y, fmt, mb]) => riga(l, x, y, fmt, mb))}</div>`
              : html`<div className=${"text-sm " + C.mu}>Classifica non disponibile per questa competizione.</div>`}</div>`
          : html`<div className=${C.card + " p-4"}>${!V ? html`<div className=${"text-sm " + C.mu}>Caricamento...</div>` : html`<${React.Fragment}>
            <div className="grid grid-cols-2 gap-2 mb-2">${sel(pa || (gioc[0] || [""])[0], setPa, gioc.map(([id, x]) => [id, x[5] + " (" + x[6] + ")"]))}${sel(pb || (gioc[1] || [""])[0], setPb, gioc.map(([id, x]) => [id, x[5] + " (" + x[6] + ")"]))}</div>
            ${(() => { const x = V[pa || (gioc[0] || [""])[0]], y = V[pb || (gioc[1] || [""])[0]]; if (!x || !y) return null;
              return html`<div>${[["Voto medio", x[0], y[0], (v) => nf(Number(v).toFixed(2))], ["Partite", x[1], y[1]], ["Minuti", x[2], y[2]], ["Gol", x[3], y[3]], ["Assist", x[4], y[4]], ["Gol + assist ogni 90'", ((x[3] + x[4]) * 90) / (x[2] || 1), ((y[3] + y[4]) * 90) / (y[2] || 1), f2]].map(([l, p, q, fmt]) => riga(l, p, q, fmt))}</div>`; })()}<//>`}</div>`}<//>`;
    }

    /* ---- campionati ---- */
    function LeaguesView() {
      const { D, lg, fav, setTeam } = React.useContext(Ctx);
      const V = usaVoti();
      const pn = (x) => String(x || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const votoDi = (n) => { if (!V) return null; const t = pn(n); const x = Object.values(V).find((v) => pn(v[5]) === t) || Object.values(V).find((v) => pn(v[5]).split(" ").slice(-1)[0] === t.split(" ").slice(-1)[0] && pn(v[5])[0] === t[0]); return x && x[1] >= 3 ? x[0] : null; };
      const [vista, setVista] = useState(0);
      const [k, setK] = useState(() => { const s0 = store.get("lgSel", null); return D.leagues.some((l) => l.k === s0) ? s0 : D.leagues[0].k; });
      const [filt, setFilt] = useState(0);
      const L = lg(k);
      const st = D.standings[k] ? D.standings[k][["generale", "casa", "trasferta"][filt]] : [];
      const ms = D.matches.filter((m) => m.lg === k);
      const zone = (i) => { const n = st.length; if (["I1", "E0", "SP1", "D1"].includes(k)) return i < 4 ? "bg-[#5B2EE6] dark:bg-[#A58BFF]" : i >= n - 3 ? "bg-[#FF3D5A]" : ""; return i < 2 ? "bg-[#0F9D84]" : i >= n - 3 ? "bg-[#FF3D5A]" : ""; };
      return html`<div className="px-4 space-y-3">
        <div className="flex gap-2 overflow-x-auto noscroll -mx-4 px-4">${D.leagues.map((l) => html`<${Chip} key=${l.k} on=${k === l.k} onClick=${() => { setK(l.k); store.set("lgSel", l.k); }}><${Flag} k=${l.flag} w=${16} />${l.name}<//>`)}</div>
        <div className=${"flex items-center gap-2 text-sm font-semibold " + C.tx}><${Flag} k=${L.flag} w=${22} />${L.country} - ${L.name} 2026/27</div>
        <${Tabs} items=${["Classifica", "Marcatori", "Assist", "Voti", "Confronta"]} val=${vista} set=${setVista} />
        ${vista === 3 && html`<${VotiLega} k=${k} />`}
        ${vista === 4 && html`<${Confronta} k=${k} />`}
        ${(vista === 1 || vista === 2) && (() => { const sc = ((D.scorers || {})[k] || []).slice().sort((a, b) => (vista === 1 ? b.g - a.g || b.a - a.a : b.a - a.a || b.g - a.g)).filter((r) => (vista === 1 ? r.g : r.a) > 0);
          return sc.length ? html`<div className=${C.card + " px-4 py-1"}>${sc.slice(0, 20).map((r, i) => html`<div key=${r.n + r.t} className=${"flex items-center gap-2 py-2 text-sm " + (i ? "border-t " + C.bd : "") + " " + C.tx}>
            <span className=${"w-5 text-xs tabular-nums " + C.mu}>${i + 1}</span><${Crest} t=${r.t} size=${16} /><span className="flex-1 min-w-0"><span className="flex items-center gap-1.5 min-w-0"><span className="block truncate font-semibold">${r.n}</span>${votoDi(r.n) != null && html`<${VotoChip} v=${votoDi(r.n)} />`}</span><span className=${"block text-[11px] truncate " + C.mu}>${r.t} - ${r.pg} presenze${vista === 1 && r.r ? " - " + r.r + " su rigore" : ""}</span></span>
            <span className="text-right tabular-nums"><b className="text-base">${vista === 1 ? r.g : r.a}</b><span className=${"block text-[10px] " + C.mu}>${vista === 1 ? (r.a ? r.a + " assist" : "") : r.g + " gol"}</span></span></div>`)}</div>`
            : html`<div className=${C.card + " p-4 text-sm " + C.mu}>${D.scorers ? "Classifica marcatori non disponibile per questo campionato nella fonte dati gratuita." : "La classifica marcatori arriva con il prossimo aggiornamento dei dati (ogni mattina)."}</div>`; })()}
        ${vista === 0 && html`<${React.Fragment}>
        ${!(D.standings[k] && D.standings[k].solo_generale) && html`<${Seg} items=${["Generale", "Solo Casa", "Solo Trasferta"]} val=${filt} set=${setFilt} />`}
        <div className=${C.card + " p-2 overflow-x-auto"}><table className=${"w-full text-sm tabular-nums " + C.tx}><thead><tr className=${"text-[11px] " + C.mu}>
          <th className="text-left font-medium p-1.5 w-7">#</th><th className="text-left font-medium">Squadra</th><th className="text-right font-medium">G</th><th className="text-right font-medium">GF</th><th className="text-right font-medium">GS</th><th className="text-right font-medium pr-1.5">Pt</th></tr></thead>
          <tbody>${st.map((r, i) => html`<tr key=${r.team} onClick=${() => ESPN_LG[k] && setTeam({ lgE: ESPN_LG[k], name: r.team })} className=${"cursor-pointer " + (r.team === fav ? "bg-[#5B2EE6]/[0.07] dark:bg-[#A58BFF]/[0.12] font-semibold" : "")}>
            <td className="p-1.5"><span className="flex items-center gap-1"><span className=${"w-1 h-4 rounded-full " + (zone(i) || "bg-transparent")}></span>${i + 1}</span></td>
            <td><span className="flex items-center gap-1.5 min-w-0"><${Crest} t=${r.team} size=${14} /><span className="truncate">${r.team}</span></span></td>
            <td className=${"text-right " + C.mu}>${r.pg}</td><td className="text-right">${r.gf}</td><td className="text-right">${r.gs}</td><td className="text-right pr-1.5 font-semibold">${r.pt}</td></tr>`)}</tbody></table></div>
        ${!st.length && html`<div className=${C.card + " p-4 text-sm " + C.mu}>Classifica non disponibile per questo campionato nella fonte dati gratuita.</div>`}
        ${st.length > 0 && html`<p className=${"text-[11px] -mt-1 " + C.mu}>Tocca una squadra per aprire calendario, risultati e rosa.</p>`}<//>`}
        <div className=${C.lab}>${D.demo ? "Partite della giornata" : "Partite in programma"}</div>
        <div className=${C.card + " overflow-hidden"}>${ms.map((m, i) => html`<${Row} key=${m.id} m=${m} i=${i} />`)}</div></div>`;
    }

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
      const { D, lg, fav, setFav, setTeam } = React.useContext(Ctx);
      const lgK = Object.keys(D.standings).find((k) => D.standings[k].generale.some((r) => r.team === fav));
      const L = lgK && lg(lgK);
      const pos = lgK ? D.standings[lgK].generale.findIndex((r) => r.team === fav) + 1 : 0;
      const row = lgK && D.standings[lgK].generale[pos - 1];
      const m = D.matches.find((x) => x.h === fav || x.a === fav);
      const l5 = m ? m.last5[m.h === fav ? 0 : 1] : [];
      return html`<div className="px-4 space-y-3"><${Schede} id="club" items=${["La mia squadra", "Gara", "Traguardi", "Account"]}>${[html`<${React.Fragment}>
        <div className=${C.card + " p-4"}><div className="flex items-center gap-3">${fav ? html`<${Crest} t=${fav} size=${52} />` : html`<span className=${"w-[52px] h-[52px] rounded-full flex items-center justify-center " + C.ch + " " + C.mu}><${Ic.Shield} size=${24} /></span>`}
          <div className="flex-1 min-w-0"><div className=${"text-xs " + C.mu}>Squadra del cuore</div><div className=${(fav ? "text-xl " : "text-[15px] ") + "font-semibold truncate " + C.tx}>${fav || "Scegline una qui sotto"}</div>
            ${L && html`<div className=${"text-xs flex items-center gap-1.5 " + C.mu}><${Flag} k=${L.flag} w=${14} />${L.name} - ${pos}° con ${row.pt} punti</div>`}</div></div>
          ${l5.length > 0 && html`<div className="mt-4"><div className=${C.lab + " mb-1.5"}>Ultime 5</div><${Form} list=${l5} /></div>`}
          ${lgK && ESPN_LG[lgK] && html`<button onClick=${() => setTeam({ lgE: ESPN_LG[lgK], name: fav })} className=${"mt-4 w-full py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5 " + C.ch + " " + C.tx}>Calendario, risultati e rosa<${Ic.ChevronRight} size=${15} /></button>`}</div>
        ${m ? html`<div className=${C.lab}>Partita della giornata</div><div className=${C.card + " overflow-hidden"}><${Row} m=${m} i=${0} /></div>`
          : html`<div className=${C.card + " p-4 text-sm " + C.mu}>${fav} non gioca in questa giornata.</div>`}
        <div className=${C.card + " p-4 space-y-2"}><label htmlFor="fav" className=${C.lab}>${fav ? "Cambia squadra" : "Squadra del cuore"}</label>
          <select id="fav" value=${fav} onChange=${(e) => { setFav(e.target.value); store.set("fav", e.target.value); }} className=${"w-full rounded-xl px-3 py-2 text-sm " + C.ch + " " + C.tx}>
            ${!fav && html`<option value="">Scegli...</option>`}${D.leagues.map((l) => html`<optgroup key=${l.k} label=${l.name}>${(D.standings[l.k] ? D.standings[l.k].generale.map((r) => r.team) : [...new Set(D.matches.filter((x) => x.lg === l.k).flatMap((x) => [x.h, x.a]))]).slice().sort().map((t) => html`<option key=${t} value=${t}>${t}</option>`)}</optgroup>`)}</select></div><//>`,
        html`<${Gara} />`,
        html`<${React.Fragment}><${Riepilogo} /><${Medaglie} /><//>`,
        html`<${React.Fragment}><${Codice} /><${GiocoResponsabile} /><//>`]}<//></div>`;
    }

    /* ---- schedina ---- */
    function SlipView() {
      const { D, lg, byId, pro, mySlip, setMySlip, setUnlock, doCopy } = React.useContext(Ctx);
      const [prof, setProf] = useState(0);
      const [off, setOff] = useState(store.get("slipOff", []));
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
      const text = (ls, wa) => (wa ? "*Schedina AuraPitch*\n" : "") + ls.map((l) => (wa ? "- " : "") + `${l.m.h} - ${l.m.a}: ${wa ? "*" + mLabel(l.m, l.k, true) + "*" : mLabel(l.m, l.k, true)} @ ${odd(l.q)}`).join("\n") + `\nQuota totale ${odd(ls.reduce((a, l) => a * l.q, 1))}`;
      const LegRow = ({ l, onDel }) => { const h = hit(l.m, l.k); return html`<div className=${"flex items-center gap-2 py-2 border-t first:border-t-0 " + C.bd}>
        <div className="flex-1 min-w-0"><div className=${"text-sm truncate " + C.tx}>${l.m.h} - ${l.m.a}</div><div className=${"text-[11px] " + C.mu}>${lg(l.m.lg).name} - IA ${pct(l.p)}%${l.stima ? " - quota stimata" : ""}${l.shielded ? " - protetta" : ""}</div></div>
        <span className=${"text-sm font-semibold text-right max-w-[45%] leading-tight " + C.tx}>${mLabel(l.m, l.k, true)}</span><span className=${"text-sm tabular-nums w-11 text-right " + C.mu}>${odd(l.q)}</span>
        ${h === null ? null : h ? html`<${Ic.CheckCircle2} size=${17} className="text-emerald-500" />` : html`<${Ic.XCircle} size=${17} className="text-rose-500" />`}
        ${onDel && html`<button aria-label="Rimuovi" onClick=${onDel} className=${C.mu}><${Ic.Trash2} size=${15} /></button>`}</div>`; };
      return html`<div className="px-4 space-y-3"><${Schede} id="schedina" items=${["Crea con l'IA", "La mia schedina", "Diario", "Storico IA"]}>${[html`<${React.Fragment}>
        <div className="flex gap-2 overflow-x-auto noscroll -mx-4 px-4">${D.leagues.map((l) => html`<${Chip} key=${l.k} on=${!off.includes(l.k)} onClick=${() => { const nx = off.includes(l.k) ? off.filter((q) => q !== l.k) : [...off, l.k]; setOff(nx); store.set("slipOff", nx); }}><${Flag} k=${l.flag} w=${16} />${l.name}<//>`)}</div>
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
        <div className=${C.card + " px-4 py-2"}>${legs.length ? legs.map((l) => html`<${LegRow} key=${l.m.id} l=${l} />`) : html`<div className=${"py-3 text-sm " + C.mu}>${pool.length ? "Nessuna partita adatta a questo stile: prova un altro periodo o un altro stile." : "Nessuna partita in questo periodo nei campionati scelti."}</div>`}</div>
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
  async function immagineSchedina(legs, titolo, lg) {
    try { await document.fonts.ready; } catch (e) { /* caratteri di sistema */ }
    const W = 1080, H = 360 + legs.length * 150 + 260, c = document.createElement("canvas");
    c.width = W; c.height = H;
    const x = c.getContext("2d");
    x.fillStyle = "#0E0C18"; x.fillRect(0, 0, W, H);
    const g = x.createRadialGradient(W * 0.85, 0, 10, W * 0.85, 0, 700); g.addColorStop(0, "rgba(123,92,255,0.45)"); g.addColorStop(1, "rgba(123,92,255,0)");
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    const BS = '"Big Shoulders", "Figtree", sans-serif', FT = '"Figtree", system-ui, sans-serif';
    x.strokeStyle = "#A58BFF"; x.lineWidth = 8;
    for (const [r, o] of [[52, 0.3], [36, 0.55], [22, 1]]) { x.globalAlpha = o; x.beginPath(); x.arc(110, 120, r, 0, Math.PI * 2); x.stroke(); }
    x.globalAlpha = 1; x.fillStyle = "#F4F2FF"; x.beginPath(); x.arc(110, 120, 9, 0, Math.PI * 2); x.fill();
    x.font = `800 76px ${BS}`; x.fillText("AuraPitch", 190, 146);
    x.font = `500 38px ${FT}`; x.fillStyle = "#9A95B3"; x.fillText(titolo, 70, 260);
    let y = 330;
    for (const l of legs) {
      x.fillStyle = "#191626"; x.beginPath(); x.roundRect(50, y, W - 100, 130, 28); x.fill();
      const [ch, ca] = auraCol(l.m);
      x.fillStyle = ch; x.fillRect(50, y + 30, 8, 70); x.fillStyle = ca; x.fillRect(50, y + 65, 8, 35);
      x.fillStyle = "#9A95B3"; x.font = `500 30px ${FT}`; x.fillText(`${l.m.h} - ${l.m.a}  ·  ${(lg(l.m.lg) || {}).name || ""}`.slice(0, 52), 90, y + 52);
      x.fillStyle = "#F4F2FF"; x.font = `700 40px ${FT}`; x.fillText(mLabel(l.m, l.k, true).slice(0, 34), 90, y + 102);
      x.font = `800 60px ${BS}`; x.textAlign = "right"; x.fillText(odd(l.q), W - 90, y + 88); x.textAlign = "left";
      y += 150;
    }
    const tot = legs.reduce((a, l) => a * l.q, 1), pr = legs.reduce((a, l) => a * l.p, 1);
    x.fillStyle = "#9A95B3"; x.font = `500 34px ${FT}`; x.fillText("Quota totale", 70, y + 60); x.fillText(`Probabilità IA ${(pr * 100).toFixed(1).replace(".", ",")}%`, 70, y + 110);
    x.fillStyle = "#F4F2FF"; x.font = `800 120px ${BS}`; x.textAlign = "right"; x.fillText(odd(tot), W - 70, y + 110); x.textAlign = "left";
    x.fillStyle = "#6E6A85"; x.font = `400 26px ${FT}`; x.fillText("Stime, non certezze. Gioca responsabilmente.", 70, H - 50);
    const blob = await new Promise((r) => c.toBlob(r, "image/png"));
    const file = new File([blob], "schedina-aurapitch.png", { type: "image/png" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: "Schedina AuraPitch" }); return "condivisa"; }
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = file.name; a.click(); return "scaricata";
  }

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

  /* ---- partita della settimana: la sfida più importante dei prossimi 7 giorni (competizione, classifica delle due squadre, equilibrio) ---- */
  const PESO_LEGA = { CL: 3, I1: 2.4, E0: 2.4, SP1: 2.1, D1: 2, EL: 1.6, CI: 1.4, ECL: 1.1, I2: 0.6 };
  function partitaSettimana(D) {
    const pos = (k, t) => { const S = D.standings[k]; const i = S ? S.generale.findIndex((r) => r.team === t) : -1; return i < 0 ? 12 : i + 1; };
    let best = null;
    for (const m of D.matches) {
      if (m.st !== "NS" || new Date(m.ko).getTime() - Date.now() > 7 * 86400e3 || new Date(m.ko).getTime() < Date.now()) continue;
      const v = (PESO_LEGA[m.lg] || 1) + Math.max(0, 8 - pos(m.lg, m.h)) * 0.12 + Math.max(0, 8 - pos(m.lg, m.a)) * 0.12 + (1 - Math.abs(m.mk[0] - m.mk[2])) * 0.8;
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
    ["E0", "Premier League", "en"], ["SP1", "LaLiga", "es"], ["D1", "Bundesliga", "de"]];
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
          <div className="grid grid-cols-2 gap-2">${TUTTE_LEGHE.map(([k, n, f]) => html`<button key=${k} onClick=${() => tog(lg, setLg, k)} aria-pressed=${lg.includes(k)}
            className=${"flex items-center gap-2.5 rounded-[16px] px-3 py-3 text-left text-[15px] font-semibold " + (lg.includes(k) ? C.seg : "bg-white dark:bg-[#191626] " + C.tx)}><${Flag} k=${f} w=${22} />${n}</button>`)}</div>`
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
    const { D, lg, goMatch, setTeam } = React.useContext(Ctx);
    const [q, setQ] = useState("");
    const pn = (x) => String(x || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const t = pn(q.trim());
    const squadre = {};
    for (const m of D.matches) { squadre[m.h] = squadre[m.h] || { lg: m.lg, lgE: m.lgE || ESPN_LG[m.lg] }; squadre[m.a] = squadre[m.a] || { lg: m.lg, lgE: m.lgE || ESPN_LG[m.lg] }; }
    for (const [k, S] of Object.entries(D.standings || {})) for (const r of S.generale || []) squadre[r.team] = squadre[r.team] || { lg: k, lgE: ESPN_LG[k] };
    const sq = t.length >= 2 ? Object.entries(squadre).filter(([n]) => pn(n).includes(t)).slice(0, 8) : [];
    const pa = t.length >= 2 ? D.matches.filter((m) => pn(m.h).includes(t) || pn(m.a).includes(t)).slice(0, 8) : [];
    const gi = [];
    if (t.length >= 3) for (const m of D.matches.slice().sort((a, b) => a.ko.localeCompare(b.ko))) for (const c of Object.keys(m.marcatori || {})) if (pn(c.slice(5)).includes(t) && gi.length < 8 && !gi.some((g) => g.n === c.slice(5))) gi.push({ n: c.slice(5), m, x: m.marcatori[c] });
    const vai = (fn) => { onClose(); fn(); };
    const Riga = ({ onClick, children }) => html`<button onClick=${onClick} className=${"w-full flex items-center gap-3 py-2.5 text-left border-t first:border-t-0 " + C.bd}>${children}</button>`;
    return html`<${Sheet} title="Cerca" onClose=${onClose}>
      <input autoFocus value=${q} onChange=${(e) => setQ(e.target.value)} placeholder="Squadra, partita o giocatore" className=${"w-full rounded-xl px-3.5 py-3 text-[16px] outline-none " + C.ch + " " + C.tx} />
      ${t.length < 2 && html`<p className=${"text-[13px] " + C.mu}>Scrivi almeno 2 lettere. Trovi le squadre dei campionati seguiti, le loro partite in programma e i giocatori che possono segnare.</p>`}
      ${sq.length > 0 && html`<div><div className=${"text-[12px] font-semibold mb-1 " + C.mu}>Squadre</div>${sq.map(([n, x]) => html`<${Riga} key=${n} onClick=${() => vai(() => setTeam({ lgE: x.lgE, name: n }))}>
        <${Crest} t=${n} size=${22} /><span className=${"flex-1 text-[15px] " + C.tx}>${n}</span><span className=${"text-[12px] " + C.mu}>${(lg(x.lg) || {}).name || ""}</span><//>`)}</div>`}
      ${pa.length > 0 && html`<div><div className=${"text-[12px] font-semibold mb-1 " + C.mu}>Partite</div>${pa.map((m) => html`<${Riga} key=${m.id} onClick=${() => vai(() => goMatch(m.id))}>
        <span className=${"num text-[16px] font-bold w-12 " + C.tx}>${m.st === "NS" ? m.time : m.g ? m.g.join("-") : ""}</span><span className=${"flex-1 text-[15px] " + C.tx}>${m.h} - ${m.a}</span><span className=${"text-[12px] " + C.mu}>${m.date.slice(8)}/${m.date.slice(5, 7)}</span><//>`)}</div>`}
      ${gi.length > 0 && html`<div><div className=${"text-[12px] font-semibold mb-1 " + C.mu}>Giocatori</div>${gi.map((g) => html`<${Riga} key=${g.n + g.m.id} onClick=${() => vai(() => goMatch(g.m.id))}>
        <span className="flex-1 min-w-0"><span className=${"block text-[15px] " + C.tx}>${g.n}</span><span className=${"block text-[12px] " + C.mu}>${g.x.lato ? g.m.a : g.m.h}, ${g.x.g} gol in ${g.x.pres} presenze. Prossima: ${g.m.h} - ${g.m.a}</span></span><//>`)}</div>`}
      ${t.length >= 2 && !sq.length && !pa.length && !gi.length && html`<p className=${"text-[13px] " + C.mu}>Nessun risultato per "${q}".</p>`}<//>`;
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
    const [fav, setFav] = useState(store.get("fav", ""));
    const [mySlip, setMySlip] = useState(store.get("slip", []));
    const [banner, setBanner] = useState(store.get("banner2", true));
    const [copyText, setCopyText] = useState(null);
    const [toast, setToast] = useState("");
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
    const ricarica = () => fetch("data/giornata.json?t=" + Date.now(), { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((d) => { if (d) { setD(d); setToast("Partite aggiornate"); } }).catch(() => setToast("Nessuna connessione: riprova tra poco"));
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
      fetch("data/giornata.json").then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }).then((d) => { setD(d); if (d.today && (d.days || []).some((x) => x.k === d.today)) setDay(d.today); })
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
    useEffect(() => { if (!daAprire || !D) return; setOpen(daAprire); setMt(0); setTeam(null); window.scrollTo(0, 0); setDaAprire(null); if (location.hash) history.replaceState(null, "", location.pathname); }, [daAprire, D]);
    if (err) return html`<div className="p-6 text-center text-sm ${C.mu}">${err}</div>`;
    if (!D) return html`<div className="p-12 text-center text-sm ${C.mu}">Caricamento delle partite...</div>`;
    const byId = Object.fromEntries(D.matches.map((m) => [m.id, m]));
    const lg = (k) => D.leagues.find((l) => l.k === k);
    const lgOpen = openL || D.leagues.map((l) => l.k);
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
    const tsH = (e) => { tiraRef.current = window.scrollY <= 0 ? e.touches[0].clientY : null; };
    const tmH = (e) => { if (tiraRef.current == null) return; const d = e.touches[0].clientY - tiraRef.current; setTira(d > 0 ? Math.min(110, d * 0.6) : 0); };
    const teH = () => { if (tira >= 64) { try { if (navigator.vibrate) navigator.vibrate(12); } catch (x) { /* non supportato */ } ricarica(); } setTira(0); tiraRef.current = null; };
    const home = html`<div className="px-4 space-y-3" onTouchStart=${tsH} onTouchMove=${tmH} onTouchEnd=${teH}>
      ${tira > 0 && html`<div className="flex justify-center transition-all" style=${{ height: tira }}><span className=${"self-end mb-1 text-[13px] font-semibold flex items-center gap-1.5 " + C.mu}><${Ic.Repeat} size=${14} className=${tira >= 64 ? C.acc : ""} />${tira >= 64 ? "Rilascia per aggiornare" : "Tira giù per aggiornare"}</span></div>`}
      ${banner && html`<div className=${C.card + " p-3 flex gap-3 items-start"}><${Ic.Info} size=${16} className="text-sky-500 shrink-0 mt-0.5" />
        <div className=${"text-[13px] flex-1 " + C.tx}>${D.demo ? html`Beta con <b>dati reali</b> della giornata ${D.label}. Le partite sono già giocate: puoi confrontare le letture dell'IA con i risultati.`
          : html`Beta con <b>dati reali</b>, ${D.label}: quote medie di decine di bookmaker, classifiche e risultati in diretta (ogni 30 secondi). Apri una partita e scorri col dito tra le sezioni.`}</div>
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

    const ctx = { syncOn, setSyncOn, setGloss, favTeams, setFavTeams, favLeagues, setFavLeagues, mia, ripristina, diario, setDiario, pushUrl, D, byId, lg, pro, unlocked, goMatch, setOpen, mt, setMt, addLeg, mySlip, setMySlip, doCopy, setUnlock, fav, setFav, team, setTeam: openTeam, stor, aff, favM, toggleFavM };
    return html`<${Ctx.Provider} value=${ctx}><div className="min-h-screen pb-28">
      ${header}
      <main className="max-w-[480px] mx-auto">${guideBox}${team ? html`<${TeamView} key=${team.name} />` : open_m ? html`<${MatchView} key=${open_m.id} m=${open_m} />` : views[tab]}</main>
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
