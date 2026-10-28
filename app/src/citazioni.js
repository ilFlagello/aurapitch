/* AuraPitch - citazioni famose del calcio, usate con misura nei momenti giusti (schedina, derby, big match, arbitro, diario).
   Solo frasi note con l'autore; le straniere sono in traduzione italiana. Mai più di una per schermata, e non sempre:
   la scelta è "a caso ma stabile" (stessa schedina o stessa partita = stessa frase, o nessuna). */
import React from "react";
import { C, hs, html } from "./base.js";

const Q = {
  cruijff_semplice: ["Il calcio è semplice, ma la cosa più difficile è giocare un calcio semplice.", "Johan Cruijff"],
  cruijff_svantaggio: ["Ogni svantaggio ha il suo vantaggio.", "Johan Cruijff"],
  cruijff_errore: ["Prima di commettere un errore, non lo commetto.", "Johan Cruijff"],
  herberger: ["La palla è rotonda e la partita dura novanta minuti.", "Sepp Herberger"],
  lineker: ["Il calcio è un gioco semplice: ventidue uomini rincorrono un pallone per novanta minuti e alla fine vincono i tedeschi.", "Gary Lineker"],
  shankly_vita: ["Alcuni pensano che il calcio sia una questione di vita o di morte. Vi assicuro che è molto, molto più importante.", "Bill Shankly"],
  shankly_primo: ["Se sei primo sei primo, se sei secondo non sei niente.", "Bill Shankly"],
  shankly_tende: ["Se l'Everton giocasse in fondo al mio giardino, tirerei le tende.", "Bill Shankly"],
  boskov_rigore: ["Rigore è quando arbitro fischia.", "Vujadin Boškov"],
  boskov_dio: ["Pallone entra quando Dio vuole.", "Vujadin Boškov"],
  boskov_perdere: ["Meglio perdere una partita sei a zero che sei partite uno a zero.", "Vujadin Boškov"],
  boskov_autostrade: ["Grande giocatore vede autostrade dove altri vedono solo sentieri.", "Vujadin Boškov"],
  trap_gatto: ["Non dire gatto se non ce l'hai nel sacco.", "Giovanni Trapattoni"],
  boniperti: ["Vincere non è importante, è l'unica cosa che conta.", "Giampiero Boniperti"],
  baggio: ["I rigori li sbaglia solo chi ha il coraggio di tirarli.", "Roberto Baggio"],
  pele: ["Più difficile è la vittoria, più grande è la felicità nel vincere.", "Pelé"],
  rocco: ["Ciò, speremo de no!", "Nereo Rocco, a chi gli augurava «vinca il migliore»"],
  clough: ["Non direi di essere il miglior allenatore in circolazione. Ma sono tra i primi uno.", "Brian Clough"],
  totti: ["Vi ho purgato ancora.", "Francesco Totti, derby del 1999"],
};

// grandi derby e rivalità: per ogni lato, i pezzi di nome che lo riconoscono (e quelli da escludere)
const DERBY = [
  ["Derby della Madonnina", [["inter"], ["milan"], ["inter"]]], ["Derby della Capitale", [["roma"], ["lazio"]], "totti"], ["Derby della Mole", [["juventus"], ["torino"]]],
  ["Derby della Lanterna", [["genoa"], ["sampdoria"]]], ["Derby d'Italia", [["juventus"], ["inter"]]], ["Derby del Sole", [["napoli"], ["roma"]]],
  ["El Clásico", [["real madrid"], ["barcelona", "barca"]]], ["Derbi madrileño", [["atletico", "atlético"], ["real madrid"]]], ["Derbi sevillano", [["sevilla"], ["betis"]]],
  ["Merseyside derby", [["liverpool"], ["everton"]], "shankly_tende"], ["Derby di Manchester", [["manchester united", "man united", "man utd"], ["manchester city", "man city"]]],
  ["North London derby", [["arsenal"], ["tottenham"]]], ["North-West derby", [["liverpool"], ["manchester united", "man united", "man utd"]]], ["Old Firm", [["celtic"], ["rangers"]]],
  ["Revierderby", [["dortmund"], ["schalke"]]], ["Der Klassiker", [["bayern"], ["dortmund"]]], ["Le Classique", [["paris saint", "psg", "paris sg"], ["marseille"]]],
  ["De Klassieker", [["ajax"], ["feyenoord"]]], ["Derby di Lisbona", [["benfica"], ["sporting"]]], ["O Clássico", [["porto"], ["benfica"]]],
  ["Derby intercontinentale", [["galatasaray"], ["fenerbahce", "fenerbahçe"]]], ["Derby degli eterni nemici", [["olympiacos", "olympiakos"], ["panathinaikos"]]],
  ["Superclásico", [["boca"], ["river"]]],
  ["Italia-Germania, la sfida più amata", [["italia"], ["germania"]]], ["Italia-Francia, la sfida del 2006", [["italia"], ["francia"]]],
  ["Superclásico de las Américas", [["argentina"], ["brasile"]]], ["Inghilterra-Germania", [["inghilterra"], ["germania"]], "lineker"],
  ["Derbi ibérico", [["spagna"], ["portogallo"]]], ["Paesi Bassi-Germania", [["paesi bassi"], ["germania"]]], ["Fla-Flu", [["flamengo"], ["fluminense"]]], ["Clásico de México", [["america", "américa"], ["guadalajara", "chivas"]]],
];
const pn = (x) => String(x || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const ha = (nome, pezzi, escludi) => pezzi.some((p) => pn(nome).includes(pn(p))) && !(escludi || []).some((p) => pn(nome).includes(pn(p)));
function derbyDi(m) {
  for (const [nome, [a, b, esclB], frase] of DERBY) {
    if ((ha(m.h, a) && ha(m.a, b, esclB)) || (ha(m.a, a) && ha(m.h, b, esclB))) return { nome, frase };
  }
  return null;
}
const mescola = (s) => { let h = hs(s) ^ 0x9e3779b9; h = Math.imul(h ^ (h >>> 16), 0x85ebca6b); h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35); return (h ^ (h >>> 16)) >>> 0; };
const sceglie = (chiave, lista, quota) => { const h = mescola(chiave); return h % 100 < quota ? Q[lista[Math.floor(h / 100) % lista.length]] : null; };

// schedina dell'IA: una frase su tre, scelta in base a quanto è alta la quota totale
function citazioneSchedina(legs, tot) {
  if (!legs.length) return null;
  const k = legs.map((l) => l.m.id + l.k).join("|");
  const lista = tot <= 3 ? ["trap_gatto", "cruijff_errore", "shankly_primo"] : tot <= 20 ? ["herberger", "cruijff_semplice", "boniperti", "boskov_autostrade"] : ["boskov_dio", "baggio", "pele", "cruijff_svantaggio"];
  return sceglie("s" + k, lista, 34);
}
// scheda partita: sempre nei grandi derby (sono pochi), metà delle volte nei big match
function citazionePartita(m, big) {
  const d = derbyDi(m);
  if (d) return { derby: d.nome, q: Q[d.frase] || sceglie("d" + m.id, ["shankly_vita", "rocco", "boniperti"], 100) };
  if (big) { const q = sceglie("b" + m.id, ["shankly_vita", "rocco", "herberger", "boniperti", "pele"], 50); return q ? { q } : null; }
  if (/bayern|dortmund|leverkusen|leipzig/.test(pn(m.h) + pn(m.a)) && m.lg === "CL") { const q = sceglie("t" + m.id, ["lineker"], 60); return q ? { q } : null; }
  return null;
}
const citazioneArbitro = (m) => sceglie("a" + m.id, ["boskov_rigore"], 25);
const citazioneDiario = (id, vinta) => sceglie("g" + id, vinta ? ["clough", "pele", "shankly_primo"] : ["boskov_perdere", "cruijff_svantaggio", "boskov_dio"], 50);

function Citazione({ q, piccola }) {
  if (!q) return null;
  return html`<figure className=${"relative pl-4 " + (piccola ? "py-0.5" : "py-1")}>
    <i className="absolute left-0 top-1 bottom-1 w-[3px] rounded-full bg-gradient-to-b from-[#5B2EE6] to-[#A58BFF] dark:from-[#A58BFF] dark:to-[#5B2EE6]"></i>
    <blockquote className=${"italic leading-snug " + (piccola ? "text-[14px] " : "text-[16px] ") + C.tx}>“${q[0]}”</blockquote>
    <figcaption className=${"mt-1 text-[12px] font-semibold " + C.mu}>— ${q[1]}</figcaption></figure>`;
}

export { Q, DERBY, derbyDi, citazioneSchedina, citazionePartita, citazioneArbitro, citazioneDiario, Citazione };
