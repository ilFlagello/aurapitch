/* AuraPitch - dati live letti direttamente dal telefono.
   Fonte: endpoint pubblici di ESPN (risultati, eventi, cronaca, formazioni, giocatori), aperti ai browser (CORS).
   Fonte non ufficiale: va bene per la beta privata, da sostituire o licenziare prima della pubblicazione negli store. */
import { useState, useEffect, useRef } from "react";

export const ESPN_LG = { I1: "ita.1", I2: "ita.2", CL: "uefa.champions", EL: "uefa.europa", ECL: "uefa.europa.conf", CI: "ita.coppa_italia", E0: "eng.1", SP1: "esp.1", D1: "ger.1",
  F1: "fra.1", N1: "ned.1", P1: "por.1", E1: "eng.2", FAC: "eng.fa", ELC: "eng.league_cup", CDR: "esp.copa_del_rey", DFB: "ger.dfb_pokal", CDF: "fra.coupe_de_france", SCI: "ita.super_cup" };
const SITE = "https://site.api.espn.com/apis/site/v2/sports/soccer/";
const WEB = "https://site.web.api.espn.com/apis/common/v3/sports/soccer/";
const CORE = "https://sports.core.api.espn.com/v2/sports/soccer/";

const cache = new Map();
export async function getJSON(url, maxAge = 0) {
  const c = cache.get(url);
  if (c && Date.now() - c.t < maxAge) return c.d;
  const ctl = new AbortController();
  const to = setTimeout(() => ctl.abort(), 12000);
  try {
    const r = await fetch(url.replace(/^http:/, "https:"), { signal: ctl.signal, cache: "no-store" });
    if (!r.ok) throw new Error(r.status);
    const d = await r.json();
    cache.set(url, { t: Date.now(), d });
    return d;
  } finally { clearTimeout(to); }
}

/* ---------- abbinamento squadre ---------- */
const STOP = new Set(["fc", "ac", "as", "ss", "us", "ssc", "afc", "cf", "sc", "calcio", "club", "de", "del", "la", "1907", "1909", "1913", "1919", "bc", "vfb", "vfl", "tsg", "sv", "fsv", "rc", "cd", "ud", "rcd", "ca", "sd", "1846", "04", "05", "1899", "1900", "hellas"]);
const ALIAS = { internazionale: "inter", "inter milan": "inter", "ac milan": "milan", "athletic club": "bilbao", "atletico madrid": "atletico", "atlético madrid": "atletico", "manchester united": "man united", "manchester city": "man city", "bayern munich": "bayern", "bayern münchen": "bayern", "borussia dortmund": "dortmund", "borussia monchengladbach": "gladbach", "borussia mönchengladbach": "gladbach", "tottenham hotspur": "tottenham", "wolverhampton wanderers": "wolves", "paris saint-germain": "psg", "sporting cp": "sporting" };
const plain = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
function toks(s) {
  let p = plain(s);
  for (const [k, v] of Object.entries(ALIAS)) if (p === plain(k)) p = v;
  return p.split(" ").filter((t) => t && !STOP.has(t));
}
function sim(a, bs) {
  let best = 0;
  for (const b of bs) {
    const x = toks(a), y = toks(b);
    if (!x.length || !y.length) continue;
    if (x.join(" ") === y.join(" ")) return 1;
    if (x.some((t) => y.includes(t))) best = Math.max(best, 0.8);
    else if (x.some((t) => y.some((u) => t.length >= 4 && u.length >= 4 && (t.startsWith(u.slice(0, 4)) || u.startsWith(t.slice(0, 4)))))) best = Math.max(best, 0.5);
  }
  return best;
}
const names = (c) => [c.team.displayName, c.team.shortDisplayName, c.team.name, c.team.location].filter(Boolean);

/* stato di una partita ESPN in forma compatta */
function compact(ev) {
  const c = ev.competitions[0];
  const h = c.competitors.find((x) => x.homeAway === "home"), a = c.competitors.find((x) => x.homeAway === "away");
  const t = ev.status.type;
  const st = t.state === "in" ? "LIVE" : t.state === "post" ? (t.completed ? "FT" : "RINV") : /postpon|cancel|suspend/i.test(t.name) ? "RINV" : "NS";
  const half = t.name === "STATUS_HALFTIME";
  return {
    eid: ev.id, st, g: st === "NS" || st === "RINV" ? null : [Number(h.score), Number(a.score)],
    clock: half ? "Intervallo" : st === "LIVE" ? ev.status.displayClock || "" : "",
    hc: "#" + (h.team.color || "8E8E93"), ac: "#" + (a.team.color || "8E8E93"),
    hid: h.team.id, aid: a.team.id,
  };
}

/* Risultati live di tutte le partite in lista: legge gli scoreboard dei campionati e li abbina alle nostre partite.
   Ogni 30 secondi se c'è una partita in corso (o che sta per iniziare), altrimenti ogni 5 minuti. */
export function useLiveScores(matches) {
  const [live, setLive] = useState({});
  const ref = useRef(matches);
  ref.current = matches;
  useEffect(() => {
    let stop = false, timer = null;
    const tick = async () => {
      const ms = ref.current || [];
      const now = Date.now();
      const near = ms.filter((m) => Math.abs(new Date(m.ko).getTime() - now) < 36 * 3600e3 && ESPN_LG[m.lg]);
      const keys = new Set(near.map((m) => m.lg + "|" + m.date.replace(/-/g, "")));
      const out = {};
      await Promise.all([...keys].map(async (k) => {
        const [lg, d] = k.split("|");
        try {
          const sb = await getJSON(`${SITE}${ESPN_LG[lg]}/scoreboard?dates=${d}`, 20000);
          const evs = sb.events || [];
          for (const m of near.filter((x) => x.lg === lg && x.date.replace(/-/g, "") === d)) {
            let best = null, bs = 0;
            for (const ev of evs) {
              if (Math.abs(new Date(ev.date).getTime() - new Date(m.ko).getTime()) > 3 * 3600e3) continue;
              const c = ev.competitions[0].competitors;
              const h = c.find((x) => x.homeAway === "home"), a = c.find((x) => x.homeAway === "away");
              const s = sim(m.h, names(h)) + sim(m.a, names(a));
              if (s > bs) { best = ev; bs = s; }
            }
            if (best && bs >= 1.3) out[m.id] = { ...compact(best), lgE: ESPN_LG[lg] };
          }
        } catch (e) { /* rete assente: si riprova al giro dopo */ }
      }));
      if (!stop) {
        setLive((old) => ({ ...old, ...out }));
        const hot = Object.values(out).some((x) => x.st === "LIVE") || near.some((m) => { const t = new Date(m.ko).getTime(); return t - now < 15 * 60e3 && now - t < 150 * 60e3; });
        timer = setTimeout(tick, document.hidden ? 120000 : hot ? 30000 : 300000);
      }
    };
    tick();
    const vis = () => { if (!document.hidden) { clearTimeout(timer); tick(); } };
    document.addEventListener("visibilitychange", vis);
    return () => { stop = true; clearTimeout(timer); document.removeEventListener("visibilitychange", vis); };
  }, [(matches || []).length]);
  return live;
}

/* ---------- traduzione della cronaca ---------- */
const POS = {
  "outside the box": "da fuori area", "the centre of the box": "dal centro dell'area", "the right side of the box": "dal lato destro dell'area", "the left side of the box": "dal lato sinistro dell'area",
  "the right side of the six yard box": "dal lato destro dell'area piccola", "the left side of the six yard box": "dal lato sinistro dell'area piccola", "the centre of the six yard box": "dal centro dell'area piccola",
  "very close range": "a distanza ravvicinata", "a difficult angle on the left": "da posizione defilata a sinistra", "a difficult angle on the right": "da posizione defilata a destra", "long range on the left": "dalla distanza, sulla sinistra", "long range on the right": "dalla distanza, sulla destra", "more than 35 yards": "da oltre 30 metri", "a difficult angle and long range on the left": "dalla distanza e defilato a sinistra", "a difficult angle and long range on the right": "dalla distanza e defilato a destra",
};
const CORNER = { "top left corner": "all'incrocio sinistro", "top right corner": "all'incrocio destro", "bottom left corner": "nell'angolo basso a sinistra", "bottom right corner": "nell'angolo basso a destra", "centre of the goal": "al centro della porta", "top centre of the goal": "centrale e alto", "bottom centre of the goal": "centrale e basso", "high centre of the goal": "centrale e alto" };
const RULES = [
  [/^Lineups are announced and players are warming up\.?/, "Formazioni ufficiali annunciate, squadre in riscaldamento."],
  [/^First Half begins\.?/, "Inizia il primo tempo."],
  [/^Second Half begins (.+?)\.?$/, "Inizia il secondo tempo: $1."],
  [/^First Half Extra Time begins (.+?)\.?$/, "Iniziano i supplementari: $1."],
  [/^First Half ends, (.+?)\.?$/, "Fine primo tempo: $1."],
  [/^Second Half ends, (.+?)\.?$/, "Fine secondo tempo: $1."],
  [/^Match ends, (.+?)\.?$/, "Fine partita: $1."],
  [/^Fourth official has announced 1 minutes? of added time\./, "Il quarto uomo segnala 1 minuto di recupero."],
  [/^Fourth official has announced (\d+) minutes of added time\./, "Il quarto uomo segnala $1 minuti di recupero."],
  [/^Delay in match because of an injury (.+?)\.$/, "Gioco fermo per l'infortunio di $1."],
  [/^Delay in match \((.+?)\)\.$/, "Gioco fermo ($1)."],
  [/^Delay in match\.?/, "Gioco fermo."],
  [/^Delay over\. They are ready to continue\./, "Si riprende a giocare."],
  [/^Substitution, (.+?)\. (.+?) replaces (.+?) because of an injury\./, "Sostituzione per $1: entra $2, esce $3 per infortunio."],
  [/^Substitution, (.+?)\. (.+?) replaces (.+?)\./, "Sostituzione per $1: entra $2, esce $3."],
  [/^Foul by (.+?)\.$/, "Fallo di $1."],
  [/^Hand ?ball by (.+?)\.$/, "Fallo di mano di $1."],
  [/^Dangerous play by (.+?)\.$/, "Gioco pericoloso di $1."],
  [/^(.+?) wins a free kick in the attacking half\./, "$1 conquista una punizione nella metà campo avversaria."],
  [/^(.+?) wins a free kick in the defensive half\./, "$1 conquista una punizione nella propria metà campo."],
  [/^(.+?) wins a free kick on the right wing\./, "$1 conquista una punizione sulla fascia destra."],
  [/^(.+?) wins a free kick on the left wing\./, "$1 conquista una punizione sulla fascia sinistra."],
  [/^(.+?) wins a free kick\.?/, "$1 conquista una punizione."],
  [/^Offside, (.+?)\. (.+?) tries a through ball, but (.+?) is caught offside\./, "Fuorigioco per $1: $3 in posizione irregolare sul filtrante di $2."],
  [/^Offside, (.+?)\. (.+?) is caught offside\./, "Fuorigioco per $1: $2 in posizione irregolare."],
  [/^Corner, {1,2}(.+?)\. Conceded by (.+?)\./, "Calcio d'angolo per $1, concesso da $2."],
  [/^(.+?) is shown the yellow card for a bad foul\./, "Ammonito $1 per un brutto fallo."],
  [/^(.+?) is shown the yellow card for hand ball\./, "Ammonito $1 per fallo di mano."],
  [/^(.+?) is shown the yellow card for simulation\./, "Ammonito $1 per simulazione."],
  [/^(.+?) is shown the yellow card for (.+?)\./, "Ammonito $1 ($2)."],
  [/^(.+?) is shown the yellow card\./, "Ammonito $1."],
  [/^(.+?) is shown the red card for violent conduct\./, "Espulso $1 per condotta violenta."],
  [/^(.+?) is shown the red card\.?/, "Espulso $1."],
  [/^Second yellow card to (.+?) for (.+?)\./, "Secondo giallo e rosso per $1 ($2)."],
  [/^(.+?) is shown the second yellow card\.?/, "Secondo giallo e rosso per $1."],
  [/^Penalty conceded by (.+?) after a foul in the penalty area\./, "Rigore: fallo in area di $1."],
  [/^Penalty conceded by (.+?) with a hand ball in the penalty area\./, "Rigore: fallo di mano in area di $1."],
  [/^Penalty (.+?)\. (.+?) draws a foul in the penalty area\./, "Rigore per $1: $2 subisce fallo in area."],
  [/^Own Goal by (.+?)\. (.+?)$/, "Autogol di $1. $2"],
  [/^VAR Decision: (.+)$/, "Decisione VAR: $1"],
  [/^Goal!/, "Gol!"], [/^Attempt saved\./, "Tiro parato."], [/^Attempt missed\./, "Tiro fuori."], [/^Attempt blocked\./, "Tiro respinto."], [/^Penalty saved!/, "Rigore parato!"], [/^Penalty missed!/, "Rigore sbagliato!"],
  [/ converts the penalty with a right footed shot/, " trasforma il rigore con il destro"], [/ converts the penalty with a left footed shot/, " trasforma il rigore con il sinistro"],
  [/ hits the (left|right) post with a (right footed shot|left footed shot|header)/, (m, s, k) => " colpisce il palo " + (s === "left" ? "sinistro" : "destro") + " con " + ({ "right footed shot": "un destro", "left footed shot": "un sinistro", header: "un colpo di testa" })[k]],
  [/ hits the bar with a (right footed shot|left footed shot|header)/, (m, k) => " colpisce la traversa con " + ({ "right footed shot": "un destro", "left footed shot": "un sinistro", header: "un colpo di testa" })[k]],
  [/ right footed shot/g, " tiro di destro"], [/ left footed shot/g, " tiro di sinistro"], [/ header/g, " colpo di testa"],
  [/ from (a difficult angle and long range on the (?:left|right)|outside the box|the centre of the box|the (?:right|left) side of the box|the (?:right|left|centre) side of the six yard box|the centre of the six yard box|very close range|a difficult angle on the (?:left|right)|long range on the (?:left|right)|more than 35 yards)/g, (m, k) => " " + (POS[k] || "da " + k)],
  [/ is saved in the (top left corner|top right corner|bottom left corner|bottom right corner|centre of the goal|top centre of the goal|bottom centre of the goal|high centre of the goal) by /, (m, k) => " viene parato (" + CORNER[k].replace(/^(all'|nell'|al |nel )/, "") + ") da "],
  [/ to the (top left corner|top right corner|bottom left corner|bottom right corner|centre of the goal|top centre of the goal|bottom centre of the goal|high centre of the goal)/, (m, k) => " " + CORNER[k]],
  [/ is blocked\./, " viene respinto."], [/ is too high\./, " termina alto."], [/ is just a bit too high\./, " termina di poco alto."], [/ is high and wide to the (left|right)\./, (m, s) => " termina alto e a lato, a " + (s === "left" ? "sinistra" : "destra") + "."],
  [/ is close, but misses to the (left|right)\./, (m, s) => " sfiora il palo " + (s === "left" ? "sinistro" : "destro") + "."], [/ is close, but misses the top (left|right) corner\./, (m, s) => " sfiora l'incrocio " + (s === "left" ? "sinistro" : "destro") + "."],
  [/ is close, but misses to the (left|right) from a direct free kick\./, (m, s) => " su punizione diretta sfiora il palo " + (s === "left" ? "sinistro" : "destro") + "."],
  [/ misses to the (left|right)\./, (m, s) => " termina a lato, a " + (s === "left" ? "sinistra" : "destra") + "."], [/ misses to the (left|right) from a direct free kick\./, (m, s) => " su punizione diretta termina a lato, a " + (s === "left" ? "sinistra" : "destra") + "."],
  [/ from a direct free kick/, " su punizione diretta"],
  [/Assisted by (.+?) with a cross following a corner\./, "Assist di $1 con un cross da calcio d'angolo."], [/Assisted by (.+?) with a cross following a set piece situation\./, "Assist di $1 con un cross su palla inattiva."],
  [/Assisted by (.+?) with a cross\./, "Assist di $1 con un cross."], [/Assisted by (.+?) with a headed pass\./, "Assist di testa di $1."], [/Assisted by (.+?) with a through ball\./, "Assist di $1 con un filtrante."],
  [/Assisted by (.+?) following a fast break\./, "Assist di $1 in contropiede."], [/Assisted by (.+?) following a set piece situation\./, "Assist di $1 su palla inattiva."], [/Assisted by (.+?) following a corner\./, "Assist di $1 da calcio d'angolo."], [/Assisted by (.+?)\.$/, "Assist di $1."],
  [/ following a corner\./, " da calcio d'angolo."], [/ following a fast break\./, " in contropiede."], [/ following a set piece situation\./, " su palla inattiva."],
];
export function itText(t) {
  if (!t) return "";
  let s = t;
  for (const [re, to] of RULES) s = s.replace(re, to);
  return s;
}

/* ---------- riepilogo di una partita ---------- */
const POS_IT = { G: "Portiere", D: "Difensore", M: "Centrocampista", F: "Attaccante" };
export function ruolo(abbr) {
  const a = (abbr || "").toUpperCase();
  if (a === "G" || a === "GK") return "Portiere";
  if (/^(DM|CM|AM|LM|RM)/.test(a)) return "Centrocampista"; // DM è il mediano, non un difensore
  if (/^(CD|D|LB|RB|LWB|RWB|SW)/.test(a) || a.endsWith("B")) return "Difensore";
  if (/^(F|CF|ST|LF|RF|LW|RW|SS)/.test(a)) return "Attaccante";
  return POS_IT[a[0]] || "Centrocampista";
}
function depth(abbr) {
  const a = (abbr || "").toUpperCase();
  if (a === "G" || a === "GK") return 0;
  if (/^(LWB|RWB)/.test(a)) return 1.6;
  if (/^(CD|SW|D)/.test(a) || /^(LB|RB)$/.test(a)) return 1;
  if (/^DM/.test(a)) return 2;
  if (/^(CM|LM|RM|M)/.test(a)) return 3;
  if (/^AM/.test(a)) return 4;
  if (/^(LW|RW)/.test(a)) return 4.5;
  return 5;
}
function lateral(abbr) {
  const a = (abbr || "").toUpperCase();
  if (/-L$/.test(a)) return -1;
  if (/-R$/.test(a)) return 1;
  if (/^L/.test(a)) return -2;
  if (/^R/.test(a)) return 2;
  return 0;
}
const statMap = (arr) => Object.fromEntries((arr || []).map((s) => [s.name, s.value != null ? s.value : Number(s.displayValue)]));

/* linee del modulo: [[portiere], [difensori da sinistra a destra], ...] */
function linee(starters, formation) {
  const sizes = String(formation || "").split("-").map(Number).filter((n) => n > 0);
  const pl = starters.slice().sort((x, y) => depth(x.pos) - depth(y.pos) || lateral(x.pos) - lateral(y.pos));
  const gk = pl.filter((p) => depth(p.pos) === 0).slice(0, 1);
  const rest = pl.filter((p) => !gk.includes(p));
  if (!sizes.length || sizes.reduce((a, b) => a + b, 0) !== rest.length) {
    const groups = {};
    for (const p of rest) (groups[Math.round(depth(p.pos))] = groups[Math.round(depth(p.pos))] || []).push(p);
    return [gk, ...Object.keys(groups).sort().map((k) => groups[k])];
  }
  const out = [gk];
  let i = 0;
  for (const n of sizes) { out.push(rest.slice(i, i + n).sort((x, y) => lateral(x.pos) - lateral(y.pos))); i += n; }
  return out;
}

export function parseSummary(s) {
  const comp = s.header.competitions[0];
  const side = {};
  comp.competitors.forEach((c) => { side[c.team.id] = c.homeAway === "home" ? 0 : 1; });
  const teams = [0, 1].map((j) => comp.competitors.find((c) => (c.homeAway === "home") === (j === 0)));
  const st = comp.status || s.header.status || {};
  const t = st.type || {};
  const recupero = {};
  const commentary = (s.commentary || []).map((c, i) => {
    const p = c.play || {};
    const txt = p.text && c.text && p.text !== c.text && /Goal!|Attempt|Penalty/.test(p.text) ? p.text : c.text;
    return {
      i, min: (c.time && c.time.displayValue) || "", text: itText(txt), type: (p.type && p.type.type) || "", side: p.team ? side[Object.keys(side).find((id) => teams[side[id]].team.displayName === p.team.displayName)] : null,
      x: p.fieldPositionX, y: p.fieldPositionY, x2: p.fieldPosition2X, y2: p.fieldPosition2Y, period: p.period && p.period.number,
    };
  });
  // recupero anche dalla cronaca senza "play"
  (s.commentary || []).forEach((c) => { const m = /announced (\d+) minutes? of added time/.exec(c.text || ""); if (m) { const v = c.time ? c.time.value : 0; recupero[(c.play && c.play.period && c.play.period.number) || (v > 6000 ? 3 : v >= 2400 ? 2 : 1)] = Number(m[1]); } });
  const KEY = { goal: "gol", "goal---header": "gol", "goal---free-kick": "gol", "penalty---scored": "rigore", "own-goal": "autogol", "yellow-card": "giallo", "red-card": "rosso", "yellow-red-card": "rosso", substitution: "cambio", "penalty---missed": "rigore sbagliato", "penalty---saved": "rigore parato" };
  const eventi = (s.keyEvents || []).map((e) => {
    const tt = (e.type && e.type.type) || "";
    let k = KEY[tt] || (/goal/.test(tt) && e.scoringPlay ? "gol" : null);
    const SEP = { halftime: "intervallo", "end-regular-time": "fine", "full-time": "fine", "end-extra-time": "fine" };
    if (!k && SEP[tt]) k = SEP[tt];
    if (!k) return null;
    const ps = (e.participants || []).map((p) => p.athlete && p.athlete.displayName).filter(Boolean);
    const sc = /(\d+),\s[^,]+?\s(\d+)\./.exec(e.text || ""); // punteggio scritto nel testo ("... Inter Milan 0, Fiorentina 1.")
    return { k, min: (e.clock && e.clock.displayValue) || "", side: e.team ? side[e.team.id] : null, a: ps[0] || "", b: ps[1] || "", text: itText(e.text || ""), score: sc ? [Number(sc[1]), Number(sc[2])] : null };
  }).filter(Boolean);
  const stats = (s.boxscore && s.boxscore.teams) || [];
  const sv = (j, n) => { const tm = stats.find((x) => side[x.team.id] === j); const z = tm && tm.statistics.find((q) => q.name === n); return z ? Number(z.displayValue) : null; };
  const STATS = [["possessionPct", "Possesso palla", "%"], ["totalShots", "Tiri"], ["shotsOnTarget", "Tiri in porta"], ["wonCorners", "Calci d'angolo"], ["foulsCommitted", "Falli"], ["offsides", "Fuorigioco"], ["yellowCards", "Ammonizioni"], ["redCards", "Espulsioni"], ["saves", "Parate"], ["accuratePasses", "Passaggi riusciti"], ["totalPasses", "Passaggi"], ["totalCrosses", "Cross"], ["effectiveTackles", "Contrasti vinti"], ["interceptions", "Intercetti"], ["effectiveClearance", "Respinte"]];
  const statistiche = STATS.map(([n, l, u]) => [l, sv(0, n), sv(1, n), u]).filter((r) => r[1] != null && r[2] != null);
  const formazioni = [0, 1].map((j) => {
    const r = (s.rosters || []).find((x) => x.homeAway === (j ? "away" : "home"));
    if (!r || !r.roster || !r.roster.length) return null;
    const pl = r.roster.map((p) => ({
      id: p.athlete.id, name: p.athlete.displayName, short: p.athlete.shortName || p.athlete.displayName, last: p.athlete.lastName || p.athlete.displayName, num: p.jersey, pos: p.position && p.position.abbreviation,
      starter: p.starter, inn: p.subbedIn, out: p.subbedOut, st: statMap(p.stats),
    }));
    const starters = pl.filter((p) => p.starter);
    return { formation: r.formation, team: r.team.displayName, lines: linee(starters, r.formation), bench: pl.filter((p) => !p.starter), all: pl };
  });
  // minuti di ingresso/uscita dai cambi
  for (const e of eventi.filter((x) => x.k === "cambio")) {
    const f = formazioni[e.side];
    if (!f) continue;
    const pin = f.all.find((p) => p.name === e.a), pout = f.all.find((p) => p.name === e.b);
    if (pin) pin.minIn = e.min;
    if (pout) pout.minOut = e.min;
  }
  const clock = t.state === "in" ? (t.name === "STATUS_HALFTIME" ? "Intervallo" : st.displayClock || "") : "";
  // voti AuraPitch: calcolati dalle statistiche della partita (solo a partita iniziata)
  const gg = teams.map((c) => (c.score != null ? Number(c.score) : 0));
  const ora = t.state === "post" ? 90 : Math.max(1, minuto(clock));
  if (t.state !== "pre") formazioni.forEach((f, j) => { if (f) f.all.forEach((p) => { const v = votoGiocatore(p, gg[j], gg[1 - j], ora, t.state === "post"); if (v != null) p.voto = v; }); });
  return {
    st: t.state === "in" ? "LIVE" : t.state === "post" ? "FT" : "NS", clock, detail: t.shortDetail || "",
    g: teams.map((c) => (c.score != null ? Number(c.score) : null)), colors: teams.map((c) => "#" + (c.team.color || "8E8E93")),
    nomi: teams.map((c) => c.team.shortDisplayName || c.team.displayName),
    eventi, statistiche, formazioni, cronaca: commentary.filter((c, i, a) => !(i && a[i - 1].text === c.text && a[i - 1].min === c.min)).reverse(), recupero,
    stadio: s.gameInfo && s.gameInfo.venue ? [s.gameInfo.venue.fullName, s.gameInfo.venue.address && s.gameInfo.venue.address.city].filter(Boolean).join(", ") : "",
  };
}

/* Voto AuraPitch (da 3 a 10): base 6, piu gol, assist, tiri, falli subiti; meno cartellini, falli, autogol;
   portieri e difensori pesati sui gol subiti; risultato della squadra; pochi minuti = voto vicino a 6. */
export function votoGiocatore(p, gf, gs, ora, finita) {
  const s = p.st || {};
  const dentro = p.starter || p.inn;
  if (!dentro) return null;
  const mi = (x) => { const r = /(\d+)'(?:\+(\d+))?/.exec(x || ""); return r ? Number(r[1]) : null; };
  const da = p.starter ? 0 : mi(p.minIn) ?? ora;
  const a = p.out ? mi(p.minOut) ?? ora : ora;
  const min = Math.max(0, a - da);
  if (min < 10 && !(s.totalGoals || s.goalAssists || s.redCards)) return null;
  const n = (k) => Number(s[k] || 0);
  let v = 6 + 1.0 * n("totalGoals") + 0.7 * n("goalAssists") + 0.25 * Math.max(0, n("shotsOnTarget") - n("totalGoals")) + 0.05 * Math.max(0, n("totalShots") - n("shotsOnTarget"))
    + 0.1 * n("foulsSuffered") - 0.1 * n("foulsCommitted") - 0.4 * n("yellowCards") - 1.5 * n("redCards") - 1.0 * n("ownGoals") - 0.05 * n("offsides");
  const ruoloP = String(p.pos || "");
  if (ruoloP === "G") v += 0.3 * n("saves") - 0.35 * gs + (gs === 0 && min >= 60 ? 0.6 : 0);
  else if (/^(D(?!M)|CB|CD|LB|RB|SW|LWB|RWB)/.test(ruoloP)) v += -0.15 * gs + (gs === 0 && min >= 60 ? 0.4 : 0);
  if (finita) v += gf > gs ? 0.3 : gf < gs ? -0.2 : 0;
  if (min < 30) v = 6 + (v - 6) * Math.max(0.5, min / 30);
  return Math.round(Math.max(3, Math.min(10, v)) * 10) / 10;
}

/* Andamento della partita: pressione offensiva minuto per minuto dalla cronaca (tiri, angoli, gol), smussata.
   Positivo = squadra di casa, negativo = ospite. */
export function andamento(cronaca, finoA) {
  const P = { goal: 1.4, "goal---header": 1.4, "goal---free-kick": 1.4, "penalty---scored": 1.2, "shot-on-target": 1.0, "shot-hit-woodwork": 0.9, "shot-off-target": 0.6, "shot-blocked": 0.5, "corner-awarded": 0.5, "penalty---saved": 1.0, "penalty---missed": 0.8, offside: 0.2 };
  const fine = Math.max(45, finoA || 90);
  const raw = new Array(fine + 2).fill(0);
  const gol = [];
  for (const c of cronaca || []) {
    if (c.side == null) continue;
    const r = /(\d+)'(?:\+(\d+))?/.exec(c.min || "");
    if (!r) continue;
    const m = Math.min(fine, Number(r[1]));
    const w = P[c.type] || (/^goal/.test(c.type) ? 1.4 : c.type === "foul" ? 0.12 : 0);
    if (!w) continue;
    // fallo: punizione per la squadra che lo subisce
    const lato = c.type === "foul" ? 1 - c.side : c.side;
    raw[m] += lato === 0 ? w : -w;
    if (/^goal|penalty---scored/.test(c.type) && !/own/.test(c.type)) gol.push({ m, side: c.side });
  }
  const out = [];
  for (let i = 1; i <= fine; i++) {
    let x = 0, wt = 0;
    for (let d = -5; d <= 5; d++) { const k = Math.exp(-(d * d) / 8); const j = i + d; if (j >= 0 && j < raw.length) { x += raw[j] * k; } wt += k; }
    out.push(x / wt * 3);
  }
  return { punti: out, gol };
}

export function useSummary(lgE, eid, live) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    if (!lgE || !eid) { setD(null); return; }
    let stop = false, timer = null;
    const tick = async () => {
      try {
        const s = await getJSON(`${SITE}${lgE}/summary?event=${eid}`, 10000);
        if (!stop) { setD(parseSummary(s)); setErr(false); }
      } catch (e) { if (!stop) setErr(true); }
      if (!stop && live) timer = setTimeout(tick, document.hidden ? 60000 : 20000);
    };
    tick();
    return () => { stop = true; clearTimeout(timer); };
  }, [lgE, eid, live]);
  return { d, err };
}

/* ---------- giocatore ---------- */
const LEGHE = { "ita.1": "Serie A", "ita.2": "Serie B", "eng.1": "Premier League", "eng.2": "Championship", "esp.1": "LaLiga", "esp.2": "LaLiga 2", "ger.1": "Bundesliga", "ger.2": "2. Bundesliga", "fra.1": "Ligue 1", "fra.2": "Ligue 2", "por.1": "Primeira Liga", "ned.1": "Eredivisie", "bel.1": "Pro League", "tur.1": "Süper Lig", "sco.1": "Premiership", "usa.1": "MLS", "bra.1": "Brasileirão", "arg.1": "Liga Profesional", "uefa.champions": "Champions League", "uefa.europa": "Europa League", "uefa.europa.conf": "Conference League", "ita.coppa_italia": "Coppa Italia", "ita.super_cup": "Supercoppa", "esp.copa_del_rey": "Copa del Rey", "eng.fa": "FA Cup", "eng.league_cup": "League Cup", "ger.dfb_pokal": "DFB-Pokal", "fifa.friendly": "Amichevoli", "uefa.nations": "Nations League", "fifa.world": "Mondiali", "uefa.euro": "Europei", "fifa.worldq.uefa": "Qualificazioni Mondiali", "uefa.euroq": "Qualificazioni Europei", "club.friendly": "Amichevoli" };
export const nomeLega = (slug) => LEGHE[slug] || slug;
const NAZ = { Italy: "Italia", France: "Francia", Spain: "Spagna", Germany: "Germania", England: "Inghilterra", Brazil: "Brasile", Argentina: "Argentina", Portugal: "Portogallo", Netherlands: "Paesi Bassi", Belgium: "Belgio", Croatia: "Croazia", Switzerland: "Svizzera", Serbia: "Serbia", Poland: "Polonia", Denmark: "Danimarca", Sweden: "Svezia", Norway: "Norvegia", Austria: "Austria", Turkey: "Turchia", Morocco: "Marocco", Senegal: "Senegal", Nigeria: "Nigeria", "Ivory Coast": "Costa d'Avorio", Ghana: "Ghana", Cameroon: "Camerun", Uruguay: "Uruguay", Colombia: "Colombia", "United States": "Stati Uniti", Mexico: "Messico", Japan: "Giappone", Scotland: "Scozia", Wales: "Galles", Ireland: "Irlanda", Greece: "Grecia", Albania: "Albania", Slovenia: "Slovenia", Slovakia: "Slovacchia", "Czech Republic": "Repubblica Ceca", Czechia: "Repubblica Ceca", Ukraine: "Ucraina", Georgia: "Georgia", Armenia: "Armenia", Romania: "Romania", Hungary: "Ungheria", Algeria: "Algeria", Tunisia: "Tunisia", Egypt: "Egitto", Kosovo: "Kosovo", Montenegro: "Montenegro", "Bosnia-Herzegovina": "Bosnia ed Erzegovina", "North Macedonia": "Macedonia del Nord", Iceland: "Islanda", Finland: "Finlandia", Ecuador: "Ecuador", Paraguay: "Paraguay", Chile: "Cile", Peru: "Perù", Venezuela: "Venezuela", Canada: "Canada", Australia: "Australia", "South Korea": "Corea del Sud", Gambia: "Gambia", Mali: "Mali", Guinea: "Guinea", "DR Congo": "RD Congo" };
export const nazione = (n) => NAZ[n] || n || "";

const pick = (cats, name) => {
  for (const c of cats || []) for (const st of c.stats || []) if (st.name === name) return st.value;
  return null;
};
/* Profilo, stagione in corso e carriera (stagione per stagione, squadra per squadra). */
export async function loadPlayer(id) {
  const [info, ov] = await Promise.all([getJSON(`${WEB}athletes/${id}`, 3600e3).catch(() => null), getJSON(`${WEB}athletes/${id}/overview`, 600e3).catch(() => null)]);
  const a = (info && info.athlete) || {};
  const prof = { name: a.displayName, eta: a.age, nascita: a.dateOfBirth ? a.dateOfBirth.slice(0, 10) : "", naz: nazione(a.citizenship), ruolo: a.position ? ruolo(a.position.abbreviation) : "", squadra: a.team ? a.team.displayName : "", num: a.jersey, altezza: a.displayHeight, piede: a.foot };
  let stagione = [];
  if (ov && ov.statistics) {
    const lb = ov.statistics.names || [];
    stagione = (ov.statistics.splits || []).map((sp) => ({ comp: sp.displayName, v: Object.fromEntries(lb.map((n, i) => [n, Number(sp.stats[i])])) }));
  }
  const ultime = [];
  if (ov && ov.gameLog && ov.gameLog.statistics) {
    for (const g of ov.gameLog.statistics) {
      const lb = g.names || [];
      for (const ev of g.events || []) ultime.push({ id: ev.eventId, v: Object.fromEntries(lb.map((n, i) => [n, ev.stats[i]])) });
    }
  }
  const evInfo = (ov && ov.gameLog && ov.gameLog.events) || {};
  return { prof, stagione, ultime: ultime.map((u) => ({ ...u, ev: evInfo[u.id] })) };
}

export async function loadCareer(id) {
  const log = await getJSON(`${CORE}athletes/${id}/statisticslog?lang=en&region=us`, 3600e3);
  const rows = [];
  for (const e of (log.entries || []).slice().reverse()) {
    const sref = (e.season && e.season.$ref) || "";
    const m = /leagues\/([^/]+)\/seasons\/(\d+)/.exec(sref);
    if (!m || /friendly/.test(m[1])) continue;
    for (const x of e.statistics || []) {
      if (x.type !== "total" || !x.statistics) continue;
      rows.push({ lega: m[1], anno: Number(m[2]), teamRef: x.team && x.team.$ref, statRef: x.statistics.$ref });
    }
  }
  const top = rows.slice(0, 24);
  const teams = {};
  await Promise.all([...new Set(top.map((r) => r.teamRef).filter(Boolean))].map(async (ref) => {
    try { const t = await getJSON(ref, 86400e3); teams[ref] = t.shortDisplayName || t.displayName || t.name; } catch (e) { teams[ref] = ""; }
  }));
  await Promise.all(top.map(async (r) => {
    try {
      const st = await getJSON(r.statRef, 86400e3);
      const cats = (st.splits && st.splits.categories) || [];
      r.pres = pick(cats, "appearances"); r.minuti = pick(cats, "minutes"); r.gol = pick(cats, "totalGoals"); r.ass = pick(cats, "goalAssists");
      r.gialli = pick(cats, "yellowCards"); r.rossi = pick(cats, "redCards"); r.cs = pick(cats, "cleanSheet"); r.subiti = pick(cats, "goalsConceded");
    } catch (e) { /* stagione senza statistiche */ }
  }));
  return top.map((r) => ({ ...r, squadra: teams[r.teamRef] || "", lega: nomeLega(r.lega), stagione: r.anno + "/" + String(r.anno + 1).slice(2) }));
}

/* ---------- squadra ---------- */
export async function findTeam(lgE, name) {
  const d = await getJSON(`${SITE}${lgE}/teams`, 86400e3);
  const list = (((d.sports || [])[0] || {}).leagues || [{}])[0].teams || [];
  let best = null, bs = 0;
  for (const t of list) {
    const s0 = sim(name, [t.team.displayName, t.team.shortDisplayName, t.team.name, t.team.location].filter(Boolean));
    if (s0 > bs) { best = t.team; bs = s0; }
  }
  return bs >= 0.8 ? best.id : null;
}
function riga(ev, tid) {
  const c = ev.competitions[0];
  const me = c.competitors.find((x) => x.team.id === tid) || c.competitors[0];
  const op = c.competitors.find((x) => x !== me) || {};
  const sc = (x) => (x && x.score != null ? Number(typeof x.score === "object" ? x.score.value : x.score) : null);
  const t = (c.status || ev.status || {}).type || {};
  const g = [sc(me), sc(op)];
  return {
    id: ev.id, date: ev.date, casa: me.homeAway === "home", avv: op.team ? op.team.shortDisplayName || op.team.displayName : "?",
    comp: ev.league ? ev.league.abbreviation || ev.league.name : "", fatto: t.state === "post" && g[0] != null, g,
    esito: t.state === "post" && g[0] != null ? (g[0] > g[1] ? "V" : g[0] === g[1] ? "N" : "P") : null,
  };
}
export async function loadTeam(lgE, tid) {
  const [res, fix, ros] = await Promise.all([
    getJSON(`${SITE}${lgE}/teams/${tid}/schedule`, 600e3).catch(() => null),
    getJSON(`${SITE}${lgE}/teams/${tid}/schedule?fixture=true`, 600e3).catch(() => null),
    getJSON(`${SITE}${lgE}/teams/${tid}/roster`, 3600e3).catch(() => null),
  ]);
  const team = (res && res.team) || (ros && ros.team) || {};
  const risultati = ((res && res.events) || []).map((e) => riga(e, tid)).filter((r) => r.fatto).sort((a, b) => b.date.localeCompare(a.date));
  const prossime = ((fix && fix.events) || []).map((e) => riga(e, tid)).filter((r) => !r.fatto).sort((a, b) => a.date.localeCompare(b.date));
  const rosa = ((ros && ros.athletes) || []).map((a) => ({
    id: a.id, name: a.displayName, short: a.shortName || a.displayName, last: a.lastName || a.displayName, num: a.jersey, pos: a.position && a.position.abbreviation,
    ruolo: ruolo(a.position && a.position.abbreviation), eta: a.age, naz: nazione(a.citizenship),
    inf: (a.injuries || []).length ? (a.injuries[0].status || "Infortunato") : null, st: {},
  }));
  return { nome: team.displayName || team.name || "", colore: "#" + (team.color || "8E8E93"), risultati, prossime, rosa };
}

/* ---------- consiglio in diretta ---------- */
export function minuto(clock) {
  const m = /(\d+)'(?:\+(\d+))?/.exec(clock || "");
  if (/Intervallo/.test(clock || "")) return 45;
  return m ? Number(m[1]) : 0;
}
