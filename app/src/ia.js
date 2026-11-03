/* AuraPitch - "Come sta andando l'IA": l'algoritmo che impara dai risultati (dati da data/ia.json, scritto ogni mattina da strumenti/impara.py). */
import React, { useState, useEffect } from "react";
import { C, Ic, Voce, html } from "./base.js";

const num = (x, d = 1) => (x == null ? "-" : Number(x).toFixed(d).replace(".", ","));
const segno = (x, d = 2) => (x == null ? "-" : (x > 0 ? "+" : "") + num(x, d));
const giorno = (s) => (s ? new Date(s + (s.length === 10 ? "T12:00:00" : "")).toLocaleDateString("it-IT", { day: "numeric", month: "short" }) : "");
const VIOLA = "text-[#5B2EE6] dark:text-[#A58BFF]";

/* grafico di affidabilità: sull'asse orizzontale la probabilità detta, su quello verticale quante volte è successo.
   Punti sulla diagonale = probabilità oneste. */
function Affidabilita({ titolo, punti }) {
  const W = 132, P = 14, s = (v) => P + v * (W - 2 * P);
  const nmax = Math.max(1, ...punti.map((p) => p[2]));
  return html`<figure className="flex flex-col items-center gap-1">
    <svg viewBox=${`0 0 ${W} ${W}`} className="w-full max-w-[150px]" role="img" aria-label=${"Affidabilità " + titolo}>
      <rect x=${P} y=${P} width=${W - 2 * P} height=${W - 2 * P} rx="6" className="fill-black/[0.03] dark:fill-white/[0.04]" />
      <line x1=${s(0)} y1=${W - s(0)} x2=${s(1)} y2=${W - s(1)} className="stroke-black/25 dark:stroke-white/25" strokeDasharray="3 3" strokeWidth="1" />
      ${punti.length > 1 && html`<polyline fill="none" className="stroke-[#5B2EE6] dark:stroke-[#A58BFF]" strokeWidth="1.6" strokeLinejoin="round" points=${punti.map((p) => s(p[0]) + "," + (W - s(p[1]))).join(" ")} />`}
      ${punti.map((p, i) => html`<circle key=${i} cx=${s(p[0])} cy=${W - s(p[1])} r=${2 + 3 * Math.sqrt(p[2] / nmax)} className="fill-[#5B2EE6] dark:fill-[#A58BFF]" fillOpacity="0.85"><title>${`Detto ${num(p[0] * 100, 0)}%, successo ${num(p[1] * 100, 0)}% (${p[2]} casi)`}</title></circle>`)}
    </svg>
    <figcaption className=${"text-[12px] font-medium text-center " + C.tx}>${titolo}</figcaption></figure>`;
}

function Barra({ v, max, tono = "bg-[#5B2EE6] dark:bg-[#A58BFF]" }) {
  return html`<span className="block h-1.5 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden"><span className=${"block h-full rounded-full " + tono} style=${{ width: Math.max(2, Math.min(100, (100 * v) / (max || 1))) + "%" }}></span></span>`;
}

function Riga({ k, v, nota }) {
  return html`<div className=${"flex items-baseline justify-between gap-3 text-sm border-t pt-1.5 " + C.bd}><span className=${C.tx}>${k}${nota && html` <span className=${"text-[11px] " + C.mu}>${nota}</span>`}</span><b className=${"tabular-nums shrink-0 " + C.tx}>${v}</b></div>`;
}

function Attesa({ testo }) {
  return html`<p className=${"text-[13px] rounded-lg p-2.5 " + C.ch + " " + C.mu}>${testo}</p>`;
}

function IACard() {
  const [I, setI] = useState(null);
  useEffect(() => {
    let ok = true;
    fetch("data/ia.json").then((r) => (r.ok ? r.json() : null)).then((x) => ok && setI(x)).catch(() => {});
    return () => { ok = false; };
  }, []);
  if (!I || !I.modello) return null;
  const pr = I.prova || {}, ric = pr.ricette || [], gmax = Math.max(0.01, ...ric.map((r) => r.guadagno));
  const bk = I.bookmaker || {}, va = I.valore || {}, pe = (I.peso_ia || {}).famiglie || {}, minP = (I.peso_ia || {}).minimo || 100;
  const fam = (I.famiglie || []).slice().sort((a, b) => b.guadagno - a.guadagno), fmax = Math.max(0.01, ...fam.map((f) => f.guadagno));
  const cons = I.consigli || [];
  const aff = (I.affidabilita || {}).gruppi || {};
  const vers = I.diario || {};
  const S = I.semplice || {}, fv = S.favorito || {}, cs = S.consigli, fasce = (S.fasce || []).filter((f) => f.n >= 20);
  const perc = (a, b) => (b ? Math.round((100 * a) / b) + "%" : "—");
  return html`<div className="space-y-3">
    <div className=${C.card + " p-4 space-y-3"}>
      <div className="flex items-center gap-2"><span className=${C.lab + " flex-1"}>Come sta andando l'IA</span><${Ic.Sparkles} size=${15} className=${VIOLA} /></div>
      <p className=${"text-[13px] leading-snug " + C.mu}>Ogni previsione viene salvata <b className=${C.tx}>prima</b> del calcio d'inizio e confrontata con il risultato vero. Nessun ritocco dopo.</p>
      <div className="grid grid-cols-3 gap-2">
        ${[["Partite controllate", (vers.verificate || 0).toLocaleString("it-IT"), vers.dal ? "dal " + giorno(vers.dal) : "si parte oggi"],
           ["Favorito giusto", fv.n ? perc(fv.ia, fv.n) : "—", fv.n ? `${fv.ia} volte su ${fv.n}` : "dopo le prime partite"],
           ["Consigli presi", cs && cs.n ? perc(cs.vinti, cs.n) : "—", cs && cs.n ? `${cs.vinti} su ${cs.n}` : "dopo i primi consigli"]].map(([k, v, s]) => html`
          <div key=${k} className=${"rounded-xl p-2.5 " + C.ch}><div className=${"text-[11px] font-medium leading-tight " + C.mu}>${k}</div><div className=${"text-[22px] font-bold tabular-nums leading-tight mt-0.5 " + C.tx}>${v}</div><div className=${"text-[11px] leading-tight " + C.mu}>${s}</div></div>`)}
      </div>
      ${fasce.length > 0 && html`<div className="space-y-1.5">
        <div className=${"text-[13px] font-semibold " + C.tx}>Quando l'IA dice che una cosa è probabile, succede davvero?</div>
        <div className=${"grid grid-cols-[1fr_auto_auto] gap-x-4 text-[11px] font-medium " + C.mu}><span>L'IA diceva</span><span className="text-right">È successo</span><span className="text-right">Partite</span></div>
        ${fasce.map((f) => { const [lo, hi] = f.fascia.split("-").map(Number), ok = f.successo >= lo - 5; return html`<div key=${f.fascia} className=${"grid grid-cols-[1fr_auto_auto] gap-x-4 items-center text-[14px] tabular-nums border-t pt-1.5 " + C.bd + " " + C.tx}>
          <span>tra il ${lo}% e il ${hi}%</span><b className=${"text-right " + (ok ? "text-emerald-600 dark:text-emerald-300" : "text-amber-600 dark:text-amber-300")}>${num(f.successo, 0)}%</b><span className=${"text-right text-[12px] " + C.mu}>${f.n.toLocaleString("it-IT")}</span></div>`; })}
        <p className=${"text-[11px] " + C.mu}>Se "è successo" cade dentro la fascia, le percentuali dell'IA sono oneste: quando dice 70%, succede circa 7 volte su 10.</p></div>`}
      ${fv.n > 0 && fv.quote > 0 && html`<p className=${"text-[13px] rounded-lg p-2.5 " + C.ch + " " + C.tx}>Esito più probabile indovinato: <b>IA ${perc(fv.ia, fv.n)}</b> contro <b>bookmaker ${perc(fv.quote, fv.n)}</b>, sulle stesse ${fv.n} partite.</p>`}
      ${cs && cs.n > 0 && html`<p className=${"text-[12px] " + C.mu}>Consigli: ne aspettavamo vinti circa ${num(cs.attesi, 0)} su ${cs.n} (somma delle probabilità date), ne sono arrivati ${cs.vinti}.</p>`}
      <div className=${"rounded-xl p-3 border border-[#5B2EE6]/25 dark:border-[#A58BFF]/30 bg-[#5B2EE6]/[0.05] dark:bg-[#A58BFF]/[0.07]"}>
        <div className=${"text-[11px] font-semibold uppercase tracking-[0.06em] " + VIOLA}>Si allena ogni mattina</div>
        <div className=${"text-[14px] " + C.tx}>Ultimo allenamento: <b>${giorno(I.allenato || (I.generato || "").slice(0, 10))}</b>, su ${(I.modello.partite || 0).toLocaleString("it-IT")} partite. Una versione nuova entra in uso solo se sbaglia meno su partite mai viste; se poi va peggio, si torna indietro da sola.</div>
      </div>
    </div>

    <${Voce} id="ia-onesta" titolo="Probabilità oneste" sotto="Quando l'IA dice 60%, succede 6 volte su 10?" icona=${Ic.Activity}>
      <div className=${C.card + " p-4 space-y-2"}>
        <div className="grid grid-cols-3 gap-2">${Object.entries(aff).map(([t, p]) => html`<${Affidabilita} key=${t} titolo=${t} punti=${p} />`)}</div>
        <p className=${"text-[11px] " + C.mu}>Ogni punto: in orizzontale la probabilità detta, in verticale quante volte è successo davvero (più grande = più partite). Sulla diagonale tratteggiata le probabilità sono oneste. ${I.affidabilita.fonte === "diario" ? "Dati: le previsioni vere dell'app." : "Dati: partite d'archivio mai viste dal modello (con 300 partite nel diario si passa alle previsioni vere dell'app)."}</p>
      </div><//>

    <${Voce} id="ia-bookmaker" titolo="IA contro bookmaker" sotto=${bk["1X2"] && bk["1X2"].n ? `${bk["1X2"].n} partite confrontate` : "Si riempie con le prime partite finite"} icona=${Ic.Swords}>
      <div className=${C.card + " p-4 space-y-1"}>
        ${!(bk["1X2"] && bk["1X2"].n) ? html`<${Attesa} testo="Ogni previsione viene salvata prima del calcio d'inizio: appena le partite finiscono, qui vedi chi ha sbagliato meno tra l'IA e le quote." />`
          : html`<${React.Fragment}>
            <div className=${"grid grid-cols-[1fr_auto_auto] gap-x-4 text-[11px] font-medium " + C.mu}><span>Mercato</span><span className="text-right">IA</span><span className="text-right">Quote</span></div>
            ${[["1X2", "Esito finale"], ["O2.5", "Under/Over 2,5"]].filter(([k]) => bk[k] && bk[k].n).map(([k, n]) => { const b = bk[k], meglio = b.ia <= b.quote; return html`<div key=${k} className=${"grid grid-cols-[1fr_auto_auto] gap-x-4 text-sm tabular-nums border-t pt-1.5 " + C.bd + " " + C.tx}>
              <span>${n} <span className=${"text-[11px] " + C.mu}>${b.n} partite</span></span><b className=${"text-right " + (meglio ? "text-emerald-600 dark:text-emerald-300" : "")}>${num(b.ia, 3)}</b><span className="text-right">${num(b.quote, 3)}</span></div>`; })}
            <p className=${"text-[11px] pt-1 " + C.mu}>Numero più basso = meno errori (misura tecnica: log-loss). Battere le quote è difficile: già pareggiarle vuol dire che le probabilità sono affidabili.</p><//>`}
      </div><//>

    <${Voce} id="ia-valore" titolo="Valore anticipato" sotto=${va.n >= 30 ? `${num(va.positivi, 0)}% dei consigli: quote scese prima del fischio` : "Il segnale più rapido di bravura"} icona=${Ic.TrendingUp}>
      <div className=${C.card + " p-4 space-y-1"}>
        ${va.n < 30 ? html`<${Attesa} testo=${`Confrontiamo le quote dei consigli dal mattino al calcio d'inizio: se scendono, il mercato ha dato ragione all'IA. Servono almeno 30 consigli (ora ${va.n || 0}).`} />`
          : html`<${React.Fragment}>
            <${Riga} k="Movimento medio verso i consigli" v=${segno(va.medio, 2) + "%"} />
            <${Riga} k="Consigli con quota poi scesa" v=${num(va.positivi, 0) + "%"} nota=${va.n + " consigli"} />
            ${va.direzione && va.direzione.n > 0 && html`<${Riga} k="Quando l'IA si discosta, le quote la seguono" v=${num(va.direzione.ok, 0) + "%"} nota=${va.direzione.n + " casi"} />`}
            <p className=${"text-[11px] pt-1 " + C.mu}>Positivo = tra mattino e fischio d'inizio il mercato si è spostato nella direzione dell'IA. Non serve aspettare mesi di risultati per vederlo.</p><//>`}
      </div><//>

    <${Voce} id="ia-peso" titolo="Quanto pesano notizie e assenze" sotto="Il peso delle correzioni si impara mercato per mercato" icona=${Ic.Newspaper}>
      <div className=${C.card + " p-4 space-y-2"}>
        ${Object.keys(pe).length === 0 ? html`<${Attesa} testo=${`Quando una notizia (infortunio, squalifica, formazione) cambia le probabilità, la partita entra in questo conto. Da ${minP} partite l'algoritmo decide da solo quanto fidarsi delle correzioni, famiglia per famiglia.`} />`
          : Object.entries(pe).map(([f, v]) => html`<div key=${f} className="space-y-0.5">
            <div className="flex justify-between text-[13px]"><span className=${C.tx}>${f}</span><span className=${"tabular-nums " + (v.attivo ? "font-semibold " + C.tx : C.mu)}>${v.attivo ? "peso " + num(v.peso, 2) : v.n + "/" + minP}</span></div>
            <${Barra} v=${Math.min(v.n, minP)} max=${minP} tono=${v.attivo ? "bg-emerald-500" : "bg-[#5B2EE6] dark:bg-[#A58BFF]"} /></div>`)}
        <p className=${"text-[11px] " + C.mu}>Peso 1 = la correzione resta com'è; sotto 1 le notizie contano meno, sopra 1 contano di più. Si sposta piano, per non inseguire il caso.</p>
      </div><//>

    ${fam.length > 0 && html`<${Voce} id="ia-dove" titolo="Dove migliora di più" sotto=${fam[0].f + " in testa"} icona=${Ic.BarChart3}>
      <div className=${C.card + " p-4 space-y-2"}>
        ${fam.map((f) => html`<div key=${f.f} className="space-y-0.5"><div className="flex justify-between text-[13px]"><span className=${C.tx}>${f.f} <span className=${"text-[11px] " + C.mu}>${f.mercati} mercati</span></span><span className=${"tabular-nums " + C.tx}>${segno(f.guadagno, 2)}%</span></div>
          <${Barra} v=${Math.max(0, f.guadagno)} max=${fmax} /></div>`)}
      </div><//>`}

    ${cons.length > 0 && html`<${Voce} id="ia-settimane" titolo="Consigli settimana per settimana" sotto=${`${cons[cons.length - 1].vinti}/${cons[cons.length - 1].n} questa settimana`} icona=${Ic.Calendar}>
      <div className=${C.card + " p-4 space-y-1"}>
        <div className=${"grid grid-cols-[1fr_auto_auto] gap-x-4 text-[11px] font-medium " + C.mu}><span>Settimana</span><span className="text-right">Presi</span><span className="text-right">Attesi</span></div>
        ${cons.slice().reverse().map((s) => html`<div key=${s.sett} className=${"grid grid-cols-[1fr_auto_auto] gap-x-4 text-sm tabular-nums border-t pt-1.5 " + C.bd + " " + C.tx}>
          <span>dal ${giorno(s.dal)}</span><b className="text-right">${s.vinti}/${s.n}</b><span className=${"text-right " + C.mu}>${num(s.attesi)}</span></div>`)}
        <p className=${"text-[11px] pt-1 " + C.mu}>"Attesi" somma le probabilità dei consigli: se i presi gli restano vicini nel tempo, l'IA non promette più di quanto mantiene.</p>
      </div><//>`}

    ${(I.laboratorio || []).length > 0 && html`<${Voce} id="ia-lab" titolo="Laboratorio: segnali in prova" sotto=${(I.laboratorio.filter((x) => x.stato === "utile").length || "nessuno") + " utili oggi"} icona=${Ic.Sparkles}>
      <div className=${C.card + " p-4 space-y-1"}>
        <p className=${"text-[13px] pb-1 " + C.mu}>Ogni mattina l'IA prova idee nuove su migliaia di partite che non ha mai visto. Entra nel modello solo ciò che batte davvero le quote.</p>
        ${I.laboratorio.map((x) => html`<${Riga} key=${x.k} k=${x.nome} nota=${x.verifica ? `${x.verifica.toLocaleString("it-IT")} partite di prova` : x.stato}
          v=${x.guadagno == null ? "—" : html`<span className=${x.stato === "utile" ? "text-emerald-600 dark:text-emerald-300" : ""}>${segno(x.guadagno, 3)}%</span>`} />`)}
        <p className=${"text-[11px] pt-1 " + C.mu}>Vicino a zero vuol dire che i bookmaker ne tengono già conto: lo diciamo invece di fingere un vantaggio.</p>
      </div><//>`}

    ${ric.length > 0 && html`<${Voce} id="ia-tecnico" titolo="Dettagli tecnici dell'allenamento" sotto="Per chi vuole i numeri dell'algoritmo" icona=${Ic.BarChart3}>
      <div className=${C.card + " p-4 space-y-1.5"}>
        <div className=${"text-[12px] font-semibold " + C.tx}>Ultima prova su ${(pr.partite || 0).toLocaleString("it-IT")} partite mai viste · in uso: ${I.modello.nome}</div>
        ${ric.map((r) => html`<div key=${r.k} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-0.5">
          <span className=${"text-[13px] truncate " + (r.attiva ? "font-semibold " + C.tx : C.mu)}>${r.nome}</span>
          <span className=${"text-[12px] tabular-nums " + (r.attiva ? "font-semibold " + C.tx : C.mu)}>${r.k === "nessuna" ? "base" : segno(r.guadagno, 3) + "%"}</span>
          <span className="col-span-2"><${Barra} v=${Math.max(0, r.guadagno)} max=${gmax} tono=${r.attiva ? "bg-[#5B2EE6] dark:bg-[#A58BFF]" : "bg-black/25 dark:bg-white/25"} /></span></div>`)}
        <p className=${"text-[11px] " + C.mu}>Percentuale = errore in meno (log-loss) rispetto alle sole quote. Le quote dei bookmaker sono già molto precise: anche pochi centesimi di punto contano su migliaia di partite.</p></div><//>`}

    ${(I.cronologia || []).length > 0 && html`<${Voce} id="ia-storia" titolo="Cronologia delle versioni" sotto=${(I.cronologia || []).length + " cambi"} icona=${Ic.Clock}>
      <div className=${C.card + " p-4 space-y-1"}>
        ${I.cronologia.slice().reverse().map((e, i) => html`<div key=${i} className=${"text-sm border-t pt-1.5 first:border-0 first:pt-0 " + C.bd}>
          <span className=${"text-[11px] tabular-nums " + C.mu}>${giorno(e.data)}</span>
          <div className=${C.tx}>${e.evento === "promossa" ? html`In campo <b>${(ric.find((r) => r.k === e.ricetta) || {}).nome || e.ricetta}</b> <span className="text-emerald-600 dark:text-emerald-300">${segno(e.guadagno, 3)}%</span>` : html`Ritirata <b>${(ric.find((r) => r.k === e.ricetta) || {}).nome || e.ricetta}</b>: ${e.motivo}`}</div></div>`)}
      </div><//>`}
  </div>`;
}

export { IACard };
