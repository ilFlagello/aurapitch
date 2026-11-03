/* AuraPitch - scheda squadra in stile FotMob: forma delle ultime 5 e difficoltà delle prossime 3 partite.
   La difficoltà non è a sensazione: viene dalle probabilità dell'IA della partita (quando è già nell'app, fino a 5 giorni
   prima) oppure dal punteggio Elo dell'algoritmo (specialista "elo", solo risultati, app/data/forza.json) per le partite
   più lontane dello stesso campionato. Misura: punti attesi su 3 (vittoria 3, pareggio 1). Funzioni pure, provate in test_app. */
const STOP = new Set(["fc", "ac", "as", "ss", "us", "ssc", "afc", "cf", "sc", "calcio", "club", "de", "cd", "ud", "rcd", "sd", "ca", "al", "sv", "vfb", "vfl", "tsg", "fsv", "rc", "bc", "1907", "1909", "1913", "1919", "1846", "1899"]);
export const parole = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((t) => t && !STOP.has(t));
export function simile(a, b) {
  const x = parole(a), y = parole(b);
  if (!x.length || !y.length) return 0;
  if (x.join(" ") === y.join(" ")) return 1;
  if (x.some((t) => y.includes(t))) return 0.8;
  if (x.some((t) => t.length >= 4 && y.some((u) => u.length >= 4 && u.slice(0, 4) === t.slice(0, 4)))) return 0.5;
  return 0;
}
function cerca(nomi, nome) {
  let best = null, bs = 0;
  for (const n of nomi) { const s = simile(nome, n); if (s > bs) { best = n; bs = s; } }
  return bs >= 0.8 ? best : null;
}
/* la partita dell'app (stesso giorno, entro 6 ore) tra la squadra e l'avversario, con il lato della squadra (0 casa, 1 ospite) */
export function partitaApp(matches, squadra, r) {
  const t = new Date(r.date).getTime();
  for (const m of matches || []) {
    if (!m.p || Math.abs(new Date(m.ko).getTime() - t) > 6 * 3600e3) continue;
    if (simile(m.h, squadra) >= 0.8 && simile(m.a, r.avv) >= 0.8) return { m, lato: 0 };
    if (simile(m.a, squadra) >= 0.8 && simile(m.h, r.avv) >= 0.8) return { m, lato: 1 };
  }
  return null;
}
/* probabilità di vittoria, pareggio e sconfitta dal punteggio Elo (stesso campionato): attesa Elo con il vantaggio di casa,
   pareggio più probabile quando le squadre si equivalgono (28%, come nei campionati europei), mai sotto il 15% */
export function probElo(eSq, eAvv, casa, vantaggio = 60) {
  const d = eSq - eAvv + (casa ? vantaggio : -vantaggio);
  const E = 1 / (1 + Math.pow(10, -d / 400));
  const pn = Math.min(0.28, Math.max(0.15, 0.28 - 0.4 * Math.abs(E - 0.5)));
  const pv = Math.max(0.01, E - pn / 2), pp = Math.max(0.01, 1 - E - pn / 2);
  const s = pv + pn + pp;
  return [pv / s, pn / s, pp / s];
}
export function livello(punti) { return punti >= 1.85 ? "Facile" : punti >= 1.25 ? "Media" : "Difficile"; }
/* le prossime n partite con la difficoltà: { ...r, prob: [v, n, p] | null, punti, livello, fonte: "ia" | "elo" | null } */
export function difficolta(prossime, squadra, matches, forza, n = 3) {
  const F = (forza && forza.t) || {}, nomi = Object.keys(F);
  return (prossime || []).slice(0, n).map((r) => {
    const app = partitaApp(matches, squadra, r);
    let prob = null, fonte = null;
    if (app) {
      const p = app.m.p;
      prob = app.lato === 0 ? [p[0], p[1], p[2]] : [p[2], p[1], p[0]];
      fonte = "ia";
    } else {
      const a = cerca(nomi, squadra), b = cerca(nomi, r.avv);
      if (a && b && a !== b && F[a][1] === F[b][1]) { prob = probElo(F[a][0], F[b][0], r.casa, forza.casa || 60); fonte = "elo"; }
    }
    const punti = prob ? 3 * prob[0] + prob[1] : null;
    return { ...r, prob, punti, livello: punti == null ? null : livello(punti), fonte, mid: app ? app.m.id : null };
  });
}
