/* AuraPitch - utilità, stile, mercati (codici, etichette, esiti), algoritmi della schedina e componenti di base. */
import React, { useState, useEffect, useRef } from "react";
import htm from "htm";
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
      ${k === "fr" && html`<rect width="8" height="16" fill="#1d4ed8" /><rect x="8" width="8" height="16" fill="#f8fafc" /><rect x="16" width="8" height="16" fill="#dc2626" />`}
      ${k === "nl" && html`<rect width="24" height="5.34" fill="#dc2626" /><rect y="5.33" width="24" height="5.34" fill="#f8fafc" /><rect y="10.66" width="24" height="5.34" fill="#1d4ed8" />`}
      ${k === "pt" && html`<rect width="24" height="16" fill="#dc2626" /><rect width="9.6" height="16" fill="#15803d" /><circle cx="9.6" cy="8" r="2.6" fill="#facc15" />`}
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

export { html, Ic, store, pct, pctL, odd, hs, mmss, C, TONE, DOT, confTone, ESITI, TC, SH, teamColors, lum, dist, auraCol, schiarisci, AuraLine, Crest, Flag, LEGACY, norm, nf, TEMPI, evalCode, mLabel, spiega, GROUPS, mGroup, leggiXg, options, hit, buildSlip, PROF_T, ESCLUSI_SLIP, rumore, candidati, buildTarget, PERIODI, inPeriodo, Seg, Tabs, Chip, Sheet, FavPill, Form, ProbBar, Marchio, Giorni, Schede, Ctx };
