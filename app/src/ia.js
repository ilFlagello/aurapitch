/* AuraPitch - pagina dell'algoritmo: in alto pochi numeri chiari, sotto le sezioni che si aprono al tocco (dati da data/ia.json, scritto ogni mattina
   da strumenti/impara.py, e data/vantaggio.json, scritto a ogni giro da genera_app.py). */
import React, { useState, useEffect } from "react";
import { C, Ctx, Ic, Voce, html } from "./base.js";
import { divergenze, esitoLungo } from "./mercato.js";

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

/* agenti sui giocatori (giocatori.py): il verificatore controlla sui tabellini marcatori, assist e cartellini previsti dall'app */
function GiocatoriIA() {
  const [G, setG] = useState(null);
  useEffect(() => {
    let ok = true;
    fetch("data/giocatori_ia.json").then((r) => (r.ok ? r.json() : null)).then((x) => ok && setG(x)).catch(() => {});
    return () => { ok = false; };
  }, []);
  const tipi = G && G.tipi ? Object.values(G.tipi).filter((t) => t.controlli > 0) : [];
  if (!tipi.length) return null;
  return html`<div className=${C.card + " p-4 space-y-2"}>
    <div className=${C.lab}>Giocatori: marcatori, assist, ammoniti</div>
    <p className=${"text-[13px] " + C.mu}>Dopo ogni partita il verificatore controlla sul tabellino chi ha segnato, chi ha fatto assist e chi è stato ammonito, e lo confronta con quanto diceva l'app prima del fischio.</p>
    <div className=${"grid grid-cols-[1fr_auto_auto] gap-x-4 text-[11px] font-medium " + C.mu}><span>Giocata</span><span className="text-right">Attese</span><span className="text-right">Successe</span></div>
    ${tipi.map((t) => html`<div key=${t.nome} className=${"grid grid-cols-[1fr_auto_auto] gap-x-4 items-baseline text-[14px] tabular-nums border-t pt-1.5 " + C.bd + " " + C.tx}>
      <span>${t.nome} <span className=${"text-[11px] " + C.mu}>${t.controlli.toLocaleString("it-IT")} controlli${t.attivo ? ", taratura attiva" : ""}</span></span><span className="text-right">${num(t.attesi, 0)}</span><b className="text-right">${t.presi}</b></div>`)}
    <p className=${"text-[11px] " + C.mu}>Se le giocate successe sono vicine a quelle attese (somma delle probabilità), le percentuali sui giocatori sono oneste. Quando i controlli bastano, l'IA corregge da sola le stime con minuti, rigori, forma, avversario e arbitro, solo se così sbaglia meno.</p></div>`;
}

/* verificatore delle statistiche (statistiche_ia.py): cartellini, angoli e falli previsti contro quelli del tabellino */
function StatisticheIA() {
  const [G, setG] = useState(null);
  useEffect(() => {
    let ok = true;
    fetch("data/statistiche_ia.json").then((r) => (r.ok ? r.json() : null)).then((x) => ok && setG(x)).catch(() => {});
    return () => { ok = false; };
  }, []);
  const tipi = G && G.tipi ? Object.values(G.tipi).filter((t) => t.controlli > 0) : [];
  if (!tipi.length) return null;
  return html`<div className=${C.card + " p-4 space-y-2"}>
    <div className=${C.lab}>Partita: cartellini, angoli e falli</div>
    <p className=${"text-[13px] " + C.mu}>Dopo ogni partita il verificatore confronta le linee Over/Under di cartellini, calci d'angolo e falli che l'app mostrava prima del fischio con il tabellino vero.</p>
    <div className=${"grid grid-cols-[1fr_auto_auto] gap-x-4 text-[11px] font-medium " + C.mu}><span>Statistica</span><span className="text-right">Attese</span><span className="text-right">Successe</span></div>
    ${tipi.map((t) => html`<div key=${t.nome} className=${"grid grid-cols-[1fr_auto_auto] gap-x-4 items-baseline text-[14px] tabular-nums border-t pt-1.5 " + C.bd + " " + C.tx}>
      <span>${t.nome} <span className=${"text-[11px] " + C.mu}>${t.partite} partite, ${t.controlli.toLocaleString("it-IT")} linee${t.attivo ? ", taratura attiva" : ""}</span></span><span className="text-right">${num(t.attesi, 0)}</span><b className="text-right">${t.presi}</b></div>`)}
    <p className=${"text-[11px] " + C.mu}>Ogni linea "Over" conta come una giocata: se le successe sono vicine alle attese, le percentuali sono oneste. Con abbastanza partite l'IA corregge da sola le stime (distanza della linea, partita più o meno nervosa, arbitro, partita tirata), solo se così sbaglia meno.</p></div>`;
}

/* IA contro mercato (per chi vuole i numeri): dove l'IA la pensa diversamente dalle quote, e quante volte ha avuto ragione */
function IAMercato() {
  const { D, unlocked, goMatch } = React.useContext(Ctx);
  const [S, setS] = useState(null);
  useEffect(() => {
    let ok = true;
    fetch("data/ia_mercato.json").then((r) => (r.ok ? r.json() : null)).then((x) => ok && setS(x)).catch(() => {});
    return () => { ok = false; };
  }, []);
  const soglia = (S && S.soglia) || 0.03;
  const ora = divergenze(D ? D.matches : [], soglia);
  const R = S && S.riass;
  const pc = (x) => Math.round(x * 100);
  return html`<${Voce} id="ia-mercato" titolo="IA contro mercato" sotto=${ora.length ? `${ora.length} partite con l'IA lontana dalle quote` : "Dove l'IA la pensa diversamente dalle quote"} icona=${Ic.Swords}>
    <div className=${C.card + " p-4 space-y-2"}>
      <p className=${"text-[13px] leading-snug " + C.mu}>Partite da giocare in cui la probabilità dell'IA sull'esito finale si allontana di almeno ${pc(soglia)} punti da quella delle quote (senza margine).</p>
      ${ora.length ? ora.map((x, i) => html`<button key=${x.m.id} onClick=${() => goMatch && goMatch(x.m.id)} className=${"w-full text-left flex items-center gap-3 pt-2 " + (i ? "border-t " + C.bd : "")}>
          <span className="flex-1 min-w-0"><span className=${"block text-[14px] font-semibold truncate " + C.tx}>${x.m.h} - ${x.m.a}</span>
            <span className=${"block text-[12px] " + C.mu}>${esitoLungo(x.m, x.c)} · ${x.m.date.slice(8)}/${x.m.date.slice(5, 7)} ${x.m.time}</span></span>
          ${unlocked && unlocked(x.m) ? html`<span className="text-right tabular-nums shrink-0"><span className=${"block text-[15px] font-bold " + VIOLA}>IA ${pc(x.ia)}%</span><span className=${"block text-[12px] " + C.mu}>quote ${pc(x.q)}% (${x.d > 0 ? "+" : "−"}${Math.abs(pc(x.d))})</span></span>`
            : html`<span className=${"shrink-0 text-[11px] font-bold px-2 py-0.5 rounded-full " + C.ch + " " + C.mu}>PRO</span>`}</button>`)
        : html`<${Attesa} testo="In questo momento l'IA segue le quote su tutte le partite da giocare: si allontana quando arrivano formazioni ufficiali, assenze e notizie." />`}
      <div className=${"pt-2 border-t " + C.bd}>
        <div className=${"text-[13px] font-semibold " + C.tx}>Quando si è allontanata, aveva ragione?</div>
        ${!R || !R.n ? html`<${Attesa} testo="Si riempie con le prime partite finite in cui l'IA si è allontanata dalle quote: ogni previsione è salvata prima del fischio." />`
          : html`<${React.Fragment}>
            <p className=${"text-[14px] " + C.tx}>Ultimi ${S.giorni} giorni: <b>${R.n}</b> partite. L'IA dava più probabilità del mercato al risultato vero in <b>${R.ok}</b> (${pc(R.ok / R.n)}%).</p>
            <${Riga} k="Errore medio (log-loss) IA" v=${num(R.ll_ia, 3)} nota="più basso è meglio" />
            <${Riga} k="Errore medio quote, stesse partite" v=${num(R.ll_q, 3)} />
            ${R.fasce.filter((f) => f.n).map((f) => html`<${Riga} key=${f.da} k=${f.a >= 1 ? `Scarto oltre ${pc(f.da)} punti` : `Scarto ${pc(f.da)}-${pc(f.a)} punti`} nota=${f.n + " partite"} v=${pc(f.ok / f.n) + "% ragione"} />`)}<//>`}
      </div>
      <p className=${"text-[11px] " + C.mu}>"Ragione" = l'IA dava al risultato vero una probabilità più alta delle quote. È uno strumento per capire l'algoritmo, non un invito a giocare: uno scarto non è un vantaggio garantito, e nell'app non ci sono bookmaker.</p>
    </div><//>`;
}

/* una frase sola su come sta andando l'IA: precisione contro i bookmaker e consigli vinti contro attesi (pura, provata in test_app) */
export function giudizioIA(I) {
  const bk = ((I || {}).bookmaker || {})["1X2"], cs = ((I || {}).semplice || {}).consigli;
  let prec = null, cons = null;
  if (bk && bk.n >= 150 && bk.quote) { const d = (bk.ia - bk.quote) / bk.quote; prec = Math.abs(d) <= 0.01 ? "è precisa quanto i bookmaker" : d < 0 ? "è più precisa dei bookmaker" : "è un po' meno precisa dei bookmaker"; }
  if (cs && cs.n >= 50 && cs.attesi) { const z = (cs.vinti - cs.attesi) / Math.sqrt(Math.max(1, cs.attesi * (1 - cs.attesi / cs.n))); cons = Math.abs(z) <= 2 ? "i consigli vanno come previsto" : z > 2 ? "i consigli vanno meglio del previsto" : "i consigli vanno sotto le attese"; }
  if (prec && cons) return `L'IA ${prec} e ${cons}.`;
  if (prec) return `L'IA ${prec}.`;
  if (cons) return `${cons[0].toUpperCase() + cons.slice(1)}.`;
  return "L'IA sta raccogliendo le prime partite: il giudizio arriva con più risultati.";
}

/* ultimo cambio del modello, in parole semplici (cronologia del ciclo di miglioramento o, prima, delle versioni) */
function ultimoCambio(I, ric) {
  const c = (I.cambi || [])[(I.cambi || []).length - 1];
  if (c) return { data: c.data, testo: c.cosa };
  const v = (I.cronologia || [])[(I.cronologia || []).length - 1];
  if (v) return { data: v.data, testo: v.evento === "promossa" ? "In campo: " + ((ric.find((r) => r.k === v.ricetta) || {}).nome || v.ricetta) : "Ritirata una correzione che sbagliava di più" };
  return null;
}

/* barra "su 100": segmenti colorati che sommano a 100 */
function Su100({ parti }) {
  const tot = parti.reduce((n, p) => n + p.v, 0) || 1;
  return html`<div className="space-y-1.5"><div className="flex h-3 rounded-full overflow-hidden bg-black/10 dark:bg-white/10">${parti.filter((p) => p.v > 0).map((p) => html`<i key=${p.k} className=${"block h-full " + p.c} style=${{ width: (100 * p.v) / tot + "%" }}></i>`)}</div>
    <div className="flex flex-wrap gap-x-3 gap-y-0.5">${parti.map((p) => html`<span key=${p.k} className=${"flex items-center gap-1 text-[12px] " + C.mu}><i className=${"block w-2 h-2 rounded-full " + p.c}></i>${p.k} <b className=${"tabular-nums " + C.tx}>${Math.round((100 * p.v) / tot)}</b></span>`)}</div></div>`;
}

function Passi({ righe }) {
  return html`<ol className="space-y-2">${righe.map(([t, d], i) => html`<li key=${i} className="flex gap-3"><span className=${"w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-[12px] font-bold bg-[#5B2EE6]/10 dark:bg-[#A58BFF]/15 " + VIOLA}>${i + 1}</span>
    <span className="min-w-0"><span className=${"block text-[14px] font-semibold " + C.tx}>${t}</span><span className=${"block text-[13px] leading-snug " + C.mu}>${d}</span></span></li>`)}</ol>`;
}

const VERDE = "bg-emerald-500", ROSSO = "bg-[#FF3D5A]", GRIGIO = "bg-black/25 dark:bg-white/25";

/* vantaggio sul mercato (vantaggio.py): dopo il consiglio la quota scende (il mercato va verso l'IA) o sale? */
function Vantaggio({ V, va }) {
  const t = V && V.totale;
  const riga = (nome, r) => html`<div key=${nome} className=${"flex items-baseline justify-between gap-3 text-[14px] border-t pt-1.5 " + C.bd}>
    <span className=${C.tx}>${nome} <span className=${"text-[11px] " + C.mu}>${r.n} consigli</span></span>
    <b className=${"tabular-nums " + (r.medio > 0 ? "text-emerald-600 dark:text-emerald-300" : r.medio < 0 ? "text-[#E0314B] dark:text-[#FF7085]" : C.tx)}>${segno(r.medio, 1)}%</b></div>`;
  const stili = { consiglio: "Consiglio", prudente: "Alternativa prudente", coraggiosa: "Alternativa coraggiosa" };
  return html`<div className=${C.card + " p-4 space-y-3"}>
    <p className=${"text-[13px] leading-snug " + C.mu}>Ogni consiglio si blocca 45 minuti prima del fischio con la sua quota. Se poi la quota scende, il mercato si è mosso verso l'IA: chi ha seguito il consiglio ha preso una quota migliore di quella finale. È la prova più rapida che l'IA vede qualcosa prima dei bookmaker.</p>
    ${!t || !t.n ? html`<${Attesa} testo="Si riempie con i primi consigli bloccati: servono un paio di giorni di partite." />` : html`<${React.Fragment}>
      <div className=${"text-[14px] font-semibold " + C.tx}>Su 100 consigli, dopo il blocco la quota...</div>
      <${Su100} parti=${[{ k: "è scesa", v: t.verso, c: VERDE }, { k: "è rimasta ferma", v: t.fermi, c: GRIGIO }, { k: "è salita", v: t.contro, c: ROSSO }]} />
      <${Riga} k="Movimento medio della quota" v=${segno(t.medio, 1) + "%"} nota=${"su " + t.n + " consigli, ultimi " + (V.giorni || 30) + " giorni"} />
      ${Object.entries(V.per_stile || {}).filter(([, r]) => r.n >= 10).length > 0 && html`<div><div className=${"text-[12px] font-semibold pt-1 " + C.tx}>Per tipo di consiglio</div>
        ${Object.entries(V.per_stile).filter(([, r]) => r.n >= 10).map(([k, r]) => riga(stili[k] || k, r))}</div>`}
      ${Object.entries(V.per_specialista || {}).filter(([, r]) => r.n >= 10).length > 0 && html`<div><div className=${"text-[12px] font-semibold pt-1 " + C.tx}>Quando lavora uno specialista</div>
        ${Object.entries(V.per_specialista).filter(([, r]) => r.n >= 10).map(([k, r]) => riga(((V.nomi || {})[k] || k).replace(/^./, (x) => x.toUpperCase()), r))}
        ${V.senza_specialisti && V.senza_specialisti.n >= 10 && riga("Nessuno specialista (solo quote)", V.senza_specialisti)}</div>`}<//>`}
    ${va && va.n >= 30 && html`<${Riga} k="Dal mattino al fischio, quote dei consigli scese" v=${num(va.positivi, 0) + "%"} nota=${va.n + " consigli"} />`}
    <p className=${"text-[11px] " + C.mu}>Positivo = quota scesa dopo il consiglio. Se uno specialista non sposta il mercato più dei consigli senza specialisti, il suo peso scende da solo.</p></div>`;
}

/* campionati dove l'IA è più e meno affidabile (onesta.py, nell'apprendimento) */
function Campionati({ Q }) {
  const { lg } = React.useContext(Ctx);
  const el = ((Q && Q.elenco) || []).filter((r) => r.scarto != null).sort((a, b) => a.scarto - b.scarto);
  const nome = (k) => ((lg && lg(k)) || {}).name || k;
  const smax = Math.max(1, ...el.map((r) => r.scarto));
  const riga = (r) => html`<div key=${r.lg} className="space-y-0.5 pt-1.5">
    <div className="flex items-baseline justify-between gap-3 text-[14px]"><span className=${C.tx}>${nome(r.lg)} <span className=${"text-[11px] " + C.mu}>${r.partite} partite${r.consigli ? `, consigli ${r.vinti} su ${r.consigli} (attesi ${num(r.attesi, 0)})` : ""}</span></span>
      <b className=${"tabular-nums shrink-0 " + C.tx}>${num(r.scarto, 1)} punti</b></div>
    <${Barra} v=${r.scarto} max=${smax} tono=${r.fattore ? ROSSO : r.scarto <= (Q.tutti || {}).scarto ? VERDE : "bg-amber-500"} />
    ${r.fattore && html`<div className=${"text-[11px] " + C.mu}>Affidabilità mostrata ridotta del ${Math.round(100 * (1 - r.fattore))}% in questo campionato</div>`}</div>`;
  const aff = (Q && Q.affidabilita) || {};
  return html`<div className=${C.card + " p-4 space-y-2"}>
    <p className=${"text-[13px] leading-snug " + C.mu}>Lo "scarto" dice di quanti punti le probabilità si allontanano da quello che succede davvero (al netto del caso). Più basso è meglio: 0 vuol dire probabilità oneste.</p>
    ${!el.length ? html`<${Attesa} testo="Servono almeno 60 partite finite in un campionato prima di giudicarlo: il quadro si riempie nei prossimi giorni." />` : html`<${React.Fragment}>
      <div className=${"text-[12px] font-semibold " + C.tx}>Più affidabile</div>${el.slice(0, 3).map(riga)}
      ${el.length > 3 && html`<div className=${"text-[12px] font-semibold pt-2 " + C.tx}>Meno affidabile</div>${el.slice(-Math.min(3, el.length - 3)).reverse().map(riga)}`}
      ${Q.tutti && Q.tutti.scarto != null && html`<${Riga} k="Tutti i campionati insieme" v=${num(Q.tutti.scarto, 1) + " punti"} nota=${(Q.tutti.partite || 0) + " partite"} />`}<//>`}
    <p className=${"text-[11px] " + C.mu}>${aff.attivo ? "Dove l'IA è stata meno onesta, l'affidabilità mostrata sulle partite scende: provato su partite mai viste. " : "La riduzione dell'affidabilità per campionato è in prova: entra solo se si conferma su partite mai viste. "}${aff.motivo ? "Oggi: " + aff.motivo + "." : ""}</p></div>`;
}

/* cosa ha cambiato l'IA e perché (ciclo.py) più la cronologia delle versioni */
function Cambi({ I, ric }) {
  const ev = [...(I.cronologia || []).map((e) => ({ data: e.data, cosa: e.evento === "promossa" ? `In campo: ${(ric.find((r) => r.k === e.ricetta) || {}).nome || e.ricetta}` : `Ritirata: ${(ric.find((r) => r.k === e.ricetta) || {}).nome || e.ricetta}`,
    perche: e.evento === "promossa" ? `errore più basso del ${num(e.guadagno, 3)}% su partite mai viste` : e.motivo })), ...(I.cambi || [])];
  ev.sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : 0));
  return html`<div className=${C.card + " p-4 space-y-1"}>
    ${!ev.length ? html`<${Attesa} testo="Ancora nessun cambio: ogni mattina l'IA prova a migliorarsi e cambia solo se sbaglia meno su partite mai viste." />`
      : ev.slice(0, 15).map((e, i) => html`<div key=${i} className=${"text-sm border-t pt-1.5 first:border-0 first:pt-0 " + C.bd}>
        <span className=${"text-[11px] tabular-nums " + C.mu}>${giorno(e.data)}</span><div className=${C.tx}>${e.cosa}</div>${e.perche && html`<div className=${"text-[12px] " + C.mu}>Perché: ${e.perche}</div>`}</div>`)}
    <p className=${"text-[11px] pt-1 " + C.mu}>Ogni cambio si prova prima sulle partite più vecchie e poi su quelle più recenti, che il modello non ha mai visto: entra solo se sbaglia meno.</p></div>`;
}

function IACard() {
  const [I, setI] = useState(null);
  const [V, setV] = useState(null);
  useEffect(() => {
    let ok = true;
    fetch("data/ia.json").then((r) => (r.ok ? r.json() : null)).then((x) => ok && setI(x)).catch(() => {});
    fetch("data/vantaggio.json").then((r) => (r.ok ? r.json() : null)).then((x) => ok && setV(x)).catch(() => {});
    return () => { ok = false; };
  }, []);
  if (!I || !I.modello) return null;
  const pr = I.prova || {}, ric = pr.ricette || [], gmax = Math.max(0.01, ...ric.map((r) => r.guadagno));
  const bk = I.bookmaker || {}, va = I.valore || {}, pe = (I.peso_ia || {}).famiglie || {}, minP = (I.peso_ia || {}).minimo || 100;
  const fam = (I.famiglie || []).slice().sort((a, b) => b.guadagno - a.guadagno), fmax = Math.max(0.01, ...fam.map((f) => f.guadagno));
  const cons = I.consigli || [];
  const aff = (I.affidabilita || {}).gruppi || {};
  const vers = I.diario || {};
  const S = I.semplice || {}, cs = S.consigli, fasce = (S.fasce || []).filter((f) => f.n >= 20);
  const b1 = bk["1X2"], uc = ultimoCambio(I, ric), R = I.rendimento;
  const euro = (x) => (x >= 0 ? "+" : "−") + Math.abs(x).toFixed(2).replace(".", ",") + " €";
  const tessera = (k, v, s, tono) => html`<div key=${k} className=${"rounded-xl p-2.5 " + C.ch}><div className=${"text-[11px] font-medium leading-tight " + C.mu}>${k}</div>
    <div className=${"text-[22px] font-bold tabular-nums leading-tight mt-0.5 " + (tono || C.tx)}>${v}</div><div className=${"text-[11px] leading-tight " + C.mu}>${s}</div></div>`;
  const dIA = b1 && b1.n && b1.quote ? (100 * (b1.quote - b1.ia)) / b1.quote : null;
  return html`<div className="space-y-3">
    <div className=${C.card + " p-4 space-y-3"}>
      <div className="flex items-center gap-2"><span className=${C.lab + " flex-1"}>Come sta andando l'IA</span><${Ic.Sparkles} size=${15} className=${VIOLA} /></div>
      <p className=${"text-[19px] font-semibold leading-snug " + C.tx}>${giudizioIA(I)}</p>
      <div className="grid grid-cols-2 gap-2">
        ${tessera("Consigli vinti", cs && cs.n ? `${cs.vinti}/${cs.n}` : "—", cs && cs.n ? `attesi ${num(cs.attesi, 0)}` : "dopo i primi consigli")}
        ${tessera("IA contro bookmaker", dIA == null ? "—" : Math.abs(dIA) <= 1 ? "Pari" : segno(dIA, 1) + "%", dIA == null ? "dopo le prime partite" : Math.abs(dIA) <= 1 ? `stessa precisione, su ${b1.n} partite` : `errori in ${dIA > 0 ? "meno" : "più"}, su ${b1.n} partite`,
          dIA > 1 ? "text-emerald-600 dark:text-emerald-300" : dIA < -1 ? "text-amber-600 dark:text-amber-300" : null)}
      </div>
      <div className=${"rounded-xl p-3 border border-[#5B2EE6]/25 dark:border-[#A58BFF]/30 bg-[#5B2EE6]/[0.05] dark:bg-[#A58BFF]/[0.07]"}>
        <div className=${"text-[11px] font-semibold uppercase tracking-[0.06em] " + VIOLA}>Ultimo miglioramento${uc ? ", " + giorno(uc.data) : ""}</div>
        <div className=${"text-[14px] " + C.tx}>${uc ? uc.testo : "Nessun cambio finora: il modello in uso resta il migliore."}</div>
        <div className=${"text-[12px] mt-1 " + C.mu}>Si riallena ogni mattina su ${(I.modello.partite || 0).toLocaleString("it-IT")} partite; ultimo allenamento ${giorno(I.allenato || (I.generato || "").slice(0, 10))}.</div>
      </div>
      <p className=${"text-[12px] " + C.mu}>Ogni previsione è salvata prima del calcio d'inizio e confrontata con il risultato vero: ${(vers.verificate || 0).toLocaleString("it-IT")} partite controllate${vers.dal ? " dal " + giorno(vers.dal) : ""}.</p>
    </div>

    <${Voce} id="alg-ragiona" titolo="Come ragiona l'IA" sotto="Dalle quote al consiglio, in 6 passi" icona=${Ic.Book}>
      <div className=${C.card + " p-4 space-y-3"}><${Passi} righe=${[
        ["Legge le quote di molti bookmaker", "Sono la stima più precisa che esista: dentro c'è già quasi tutto (forma, classifica, scontri diretti)."],
        ["Toglie il margine dei bookmaker", "Le quote danno più del 100% in tutto: l'IA lo riporta a 100 per avere probabilità vere."],
        ["Calcola i gol attesi", "Da lì ricava tutti i mercati (Under/Over, Goal, risultato esatto) con un modello dei gol."],
        ["Ascolta gli specialisti", "Formazioni ufficiali, assenze dell'ultima ora, movimento delle quote: pesano solo se migliorano le previsioni su partite mai viste."],
        ["Corregge con ciò che ha imparato", "Ogni mattina confronta le sue probabilità con i risultati e si ritara dove sbagliava."],
        ["Blocca il consiglio 45 minuti prima", "Da lì non cambia più: giusto o sbagliato, entra nello storico così com'è."]]} />
        <p className=${"text-[12px] " + C.mu}>Su 100 partite le quote fanno già quasi tutto il lavoro: l'IA aggiunge le informazioni che arrivano dopo (formazioni, notizie) e lo dice quando non ha niente da aggiungere.</p></div><//>

    <${Voce} id="alg-dati" titolo="Da dove prende i dati" sotto="Quote, risultati, formazioni, notizie" icona=${Ic.Newspaper}>
      <div className=${C.card + " p-4 space-y-1"}>
        ${[["Quote", "The Odds API, Football-Data (medie di molti bookmaker), DraftKings tramite ESPN"], ["Risultati e classifiche", "football-data.org, ESPN"], ["Diretta, formazioni, cronaca", "ESPN, ogni 10 minuti"],
           ["Infortuni e squalifiche", "API-Football, Google News"], ["Archivio per imparare", `${(I.modello.partite || 0).toLocaleString("it-IT")} partite di 30 campionati (Football-Data)`]].map(([k, v]) => html`<${Riga} key=${k} k=${k} v=${html`<span className="font-normal text-[13px] text-right block max-w-[60vw]">${v}</span>`} />`)}
        <p className=${"text-[11px] pt-1 " + C.mu}>Nessun bookmaker paga AuraPitch e nell'app non ci sono link per giocare.</p></div><//>

    <${Voce} id="alg-agenti" titolo="Gli agenti di controllo" sotto="Chi controlla l'IA, ogni giorno" icona=${Ic.ShieldCheck}>
      <div className="space-y-3"><div className=${C.card + " p-4 space-y-3"}><${Passi} righe=${[
        ["Apprendimento, ogni mattina alle 6:20", "Si riallena su archivio e partite vere; una correzione entra solo se sbaglia meno su partite mai viste."],
        ["Revisore, alle 7:40", "Controlla l'onestà delle probabilità (anche campionato per campionato), i consigli vinti contro attesi, il vantaggio sul mercato e che nessun consiglio sia stato registrato dopo il fischio."],
        ["Verificatori, dopo ogni partita", "Confrontano marcatori, assist, cartellini, angoli e falli previsti con il tabellino vero."],
        ["Coerenza, a ogni aggiornamento", "Probabilità che sommano a 100, quote sensate, nessun doppione, consigli bloccati che non cambiano."],
        ["Guardiano, alle 6:50", "Sicurezza del servizio e dei dati."]]} /></div>
        <${GiocatoriIA} /><${StatisticheIA} /></div><//>

    <${Voce} id="alg-onesta" titolo="Quanto sono oneste le probabilità" sotto="Quando l'IA dice 60%, succede 6 volte su 10?" icona=${Ic.Activity}>
      <div className=${C.card + " p-4 space-y-3"}>
        ${fasce.length ? html`<div className="space-y-2">${fasce.map((f) => { const [lo, hi] = f.fascia.split("-").map(Number), ok = f.successo >= lo - 5 && f.successo <= hi + 5;
          return html`<div key=${f.fascia} className="space-y-0.5"><div className="flex items-baseline justify-between text-[13px]"><span className=${C.tx}>Diceva ${lo}-${hi}%</span>
            <span className=${C.mu}>su 100 è successo <b className=${"tabular-nums " + (ok ? "text-emerald-600 dark:text-emerald-300" : "text-amber-600 dark:text-amber-300")}>${num(f.successo, 0)}</b> volte <span className="text-[11px]">(${f.n.toLocaleString("it-IT")})</span></span></div>
            <div className="relative h-2 rounded-full bg-black/10 dark:bg-white/10"><i className="absolute top-0 bottom-0 bg-[#5B2EE6]/25 dark:bg-[#A58BFF]/25" style=${{ left: lo + "%", width: hi - lo + "%" }}></i>
              <i className=${"absolute -top-0.5 w-1.5 h-3 rounded-full " + (ok ? VERDE : "bg-amber-500")} style=${{ left: `calc(${Math.min(100, f.successo)}% - 3px)` }}></i></div></div>`; })}</div>`
          : html`<${Attesa} testo="Si riempie con le prime partite finite." />`}
        <p className=${"text-[11px] " + C.mu}>La fascia viola è quello che diceva l'IA, il segno è quello che è successo davvero: se il segno cade nella fascia, le probabilità sono oneste.</p>
        ${Object.keys(aff).length > 0 && html`<div className="grid grid-cols-3 gap-2 pt-1">${Object.entries(aff).map(([t, p]) => html`<${Affidabilita} key=${t} titolo=${t} punti=${p} />`)}</div>`}
      </div><//>

    <${Voce} id="alg-vantaggio" titolo="Il vantaggio sul mercato" sotto=${V && V.totale && V.totale.n ? `quota scesa dopo ${V.totale.verso} consigli su ${V.totale.n}` : "La quota scende dopo il consiglio?"} icona=${Ic.TrendingUp}>
      <${Vantaggio} V=${V} va=${va} /><//>

    <${Voce} id="alg-campionati" titolo="Campionati: dove è più e meno affidabile" sotto=${((I.campionati || {}).elenco || []).length ? `${I.campionati.elenco.length} campionati giudicati` : "Con 60 partite per campionato"} icona=${Ic.Trophy}>
      <${Campionati} Q=${I.campionati} /><//>

    <${Voce} id="alg-cambi" titolo="Cosa ha cambiato l'IA e perché" sotto=${uc ? giorno(uc.data) + ": " + uc.testo : "Nessun cambio finora"} icona=${Ic.Clock}>
      <${Cambi} I=${I} ric=${ric} /><//>

    <${IAMercato} />

    ${R && R.consiglio && html`<${Voce} id="alg-rendimento" titolo="1 € su ogni consiglio" sotto=${`${euro(R.consiglio.profitto)} su ${R.consiglio.n} € giocati`} icona=${Ic.Calculator}>
      ${(() => { const c = R.consiglio, su = c.profitto >= 0;
        const sr = R.serie || [], vs = sr.map((x) => x[1]), lo = Math.min(0, ...vs), hi = Math.max(0, ...vs), W = 300, H = 56;
        const X = (i) => (sr.length > 1 ? (i / (sr.length - 1)) * W : W / 2), Yv = (v) => H - 4 - ((v - lo) / (hi - lo || 1)) * (H - 8);
        return html`<div className=${C.card + " p-4 space-y-2"}>
          <div className=${"text-[13px] " + C.mu}>1 € su ogni consiglio dell'IA, bloccato prima del fischio, da quando esiste lo storico:</div>
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1"><span className=${"num text-[32px] font-bold leading-none whitespace-nowrap " + (su ? "text-emerald-600 dark:text-emerald-300" : "text-[#E0314B] dark:text-[#FF7085]")}>${euro(c.profitto)}</span>
            <span className=${"text-[13px] " + C.mu}>su ${c.n} € giocati (${c.vinti} vinti, resa ${c.roi >= 0 ? "+" : ""}${num(c.roi, 1)}%)</span></div>
          ${sr.length > 1 && html`<svg viewBox=${`0 0 ${W} ${H}`} className="w-full h-14" aria-hidden="true"><line x1="0" x2=${W} y1=${Yv(0)} y2=${Yv(0)} className="stroke-black/20 dark:stroke-white/20" strokeDasharray="3 3" />
            <polyline fill="none" strokeWidth="2" strokeLinejoin="round" className=${su ? "stroke-emerald-500" : "stroke-[#FF3D5A]"} points=${sr.map((x, i) => X(i) + "," + Yv(x[1])).join(" ")} /></svg>`}
          ${[["prudente", "Alternativa prudente"], ["coraggiosa", "Alternativa coraggiosa"]].filter(([k]) => R[k]).map(([k, n]) => html`<${Riga} key=${k} k=${n} nota=${R[k].vinti + " su " + R[k].n} v=${html`<span className=${R[k].profitto >= 0 ? "text-emerald-600 dark:text-emerald-300" : "text-[#E0314B] dark:text-[#FF7085]"}>${euro(R[k].profitto)}</span>`} />`)}
          <p className=${"text-[11px] " + C.mu}>Quote quelle mostrate nell'app al momento del blocco. Sono risultati passati su poche settimane: non garantiscono quelli futuri. Gioca solo ciò che puoi permetterti di perdere.</p></div>`; })()}<//>`}

    <${Voce} id="alg-tecnico" titolo="Per chi vuole i numeri" sotto="Errori, pesi, laboratorio, settimana per settimana" icona=${Ic.BarChart3}>
      <div className="space-y-3">
        ${b1 && b1.n > 0 && html`<div className=${C.card + " p-4 space-y-1"}>
          <div className=${"grid grid-cols-[1fr_auto_auto] gap-x-4 text-[11px] font-medium " + C.mu}><span>Errore medio (log-loss)</span><span className="text-right">IA</span><span className="text-right">Quote</span></div>
          ${[["1X2", "Esito finale"], ["O2.5", "Under/Over 2,5"]].filter(([k]) => bk[k] && bk[k].n).map(([k, n]) => html`<div key=${k} className=${"grid grid-cols-[1fr_auto_auto] gap-x-4 text-sm tabular-nums border-t pt-1.5 " + C.bd + " " + C.tx}>
            <span>${n} <span className=${"text-[11px] " + C.mu}>${bk[k].n} partite</span></span><b className="text-right">${num(bk[k].ia, 3)}</b><span className="text-right">${num(bk[k].quote, 3)}</span></div>`)}
          <p className=${"text-[11px] pt-1 " + C.mu}>Più basso è meglio. Battere le quote è difficile: già pareggiarle vuol dire che le probabilità sono affidabili.</p></div>`}
        ${Object.keys(pe).length > 0 && html`<div className=${C.card + " p-4 space-y-2"}><div className=${C.lab}>Quanto pesano notizie e assenze</div>
          ${Object.entries(pe).map(([f, v]) => html`<div key=${f} className="space-y-0.5"><div className="flex justify-between text-[13px]"><span className=${C.tx}>${f}</span><span className=${"tabular-nums " + (v.attivo ? "font-semibold " + C.tx : C.mu)}>${v.attivo ? "peso " + num(v.peso, 2) : v.n + "/" + minP}</span></div>
            <${Barra} v=${Math.min(v.n, minP)} max=${minP} tono=${v.attivo ? "bg-emerald-500" : "bg-[#5B2EE6] dark:bg-[#A58BFF]"} /></div>`)}</div>`}
        ${fam.length > 0 && html`<div className=${C.card + " p-4 space-y-2"}><div className=${C.lab}>Dove migliora di più</div>
          ${fam.map((f) => html`<div key=${f.f} className="space-y-0.5"><div className="flex justify-between text-[13px]"><span className=${C.tx}>${f.f}</span><span className=${"tabular-nums " + C.tx}>${segno(f.guadagno, 2)}%</span></div><${Barra} v=${Math.max(0, f.guadagno)} max=${fmax} /></div>`)}</div>`}
        ${cons.length > 0 && html`<div className=${C.card + " p-4 space-y-1"}><div className=${C.lab}>Consigli settimana per settimana</div>
          ${cons.slice().reverse().map((s) => html`<${Riga} key=${s.sett} k=${"dal " + giorno(s.dal)} nota=${"attesi " + num(s.attesi)} v=${s.vinti + "/" + s.n} />`)}</div>`}
        ${(I.laboratorio || []).length > 0 && html`<div className=${C.card + " p-4 space-y-1"}><div className=${C.lab}>Laboratorio: idee in prova</div>
          ${I.laboratorio.map((x) => html`<${Riga} key=${x.k} k=${x.nome} nota=${x.verifica ? x.verifica.toLocaleString("it-IT") + " partite di prova" : x.stato} v=${x.guadagno == null ? "—" : segno(x.guadagno, 3) + "%"} />`)}</div>`}
        ${ric.length > 0 && html`<div className=${C.card + " p-4 space-y-1.5"}><div className=${C.lab}>Ultima prova su ${(pr.partite || 0).toLocaleString("it-IT")} partite mai viste</div>
          ${ric.map((r) => html`<div key=${r.k} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-0.5"><span className=${"text-[13px] truncate " + (r.attiva ? "font-semibold " + C.tx : C.mu)}>${r.nome}</span>
            <span className=${"text-[12px] tabular-nums " + (r.attiva ? "font-semibold " + C.tx : C.mu)}>${r.k === "nessuna" ? "base" : segno(r.guadagno, 3) + "%"}</span>
            <span className="col-span-2"><${Barra} v=${Math.max(0, r.guadagno)} max=${gmax} tono=${r.attiva ? "bg-[#5B2EE6] dark:bg-[#A58BFF]" : GRIGIO} /></span></div>`)}</div>`}
      </div><//>
  </div>`;
}

export { IACard };
