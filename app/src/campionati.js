/* AuraPitch - campionati: classifica, marcatori, assist, voti, confronta. */
import React, { useState, useEffect } from "react";
import { ruolo, ESPN_LG } from "./live.js";
import { NomeSquadra, NomeGiocatore, C, Chip, Crest, Ctx, Flag, Seg, Tabs, html, nf, store } from "./base.js";
import { Row, VotoChip, caricaVoti, usaVoti } from "./partita.js";
import { PanchineLega } from "./panchine.js";

    /* ---- voti AuraPitch della stagione per campionato (almeno 4 partite con voto) ---- */
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
          <span className="flex-1 min-w-0"><${NomeGiocatore} id=${id} name=${x[5]} pos=${x[8]} team=${x[6]} className=${"block text-[14px] font-semibold truncate " + C.tx} /><span className=${"block text-[11px] truncate " + C.mu}><${NomeSquadra} t=${x[6]} lg=${k} />, ${x[1]} partite${x[3] ? ", " + x[3] + " gol" : ""}${x[4] ? ", " + x[4] + " assist" : ""}</span></span>
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
      const idDi = (n) => { if (!V) return null; const t = pn(n); const e = Object.entries(V).find(([, v]) => pn(v[5]) === t); return e ? e[0] : null; };
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
        <${Tabs} items=${["Classifica", "Marcatori", "Assist", "Voti", "Confronta", "Panchine"]} val=${vista} set=${setVista} />
        ${vista === 3 && html`<${VotiLega} k=${k} />`}
        ${vista === 5 && html`<${PanchineLega} k=${k} apriSquadra=${(t) => ESPN_LG[k] && setTeam({ lgE: ESPN_LG[k], name: t })} />`}
        ${vista === 4 && html`<${Confronta} k=${k} />`}
        ${(vista === 1 || vista === 2) && (() => { const sc = ((D.scorers || {})[k] || []).slice().sort((a, b) => (vista === 1 ? b.g - a.g || b.a - a.a : b.a - a.a || b.g - a.g)).filter((r) => (vista === 1 ? r.g : r.a) > 0);
          return sc.length ? html`<div className=${C.card + " px-4 py-1"}>${sc.slice(0, 20).map((r, i) => html`<div key=${r.n + r.t} className=${"flex items-center gap-2 py-2 text-sm " + (i ? "border-t " + C.bd : "") + " " + C.tx}>
            <span className=${"w-5 text-xs tabular-nums " + C.mu}>${i + 1}</span><${NomeSquadra} t=${r.t} lg=${k}><${Crest} t=${r.t} size=${16} /><//><span className="flex-1 min-w-0"><span className="flex items-center gap-1.5 min-w-0"><${NomeGiocatore} id=${idDi(r.n)} name=${r.n} team=${r.t} className="block truncate font-semibold" />${votoDi(r.n) != null && html`<${VotoChip} v=${votoDi(r.n)} />`}</span><span className=${"block text-[11px] truncate " + C.mu}>${r.t} - ${r.pg} presenze${vista === 1 && r.r ? " - " + r.r + " su rigore" : ""}</span></span>
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

export { usaVoti, VotiLega, Confronta, LeaguesView };
