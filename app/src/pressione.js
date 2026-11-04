/* AuraPitch - "chi spinge adesso": barra della pressione in diretta (punto 4 del 3/11).
   ESPN non dà dati di pressione né di tracciamento (verificato il 3/11 su 20 partite di 10 campionati): la pressione si
   ricava dalla cronaca. Pesi uguali alla "spinta" della probabilità in diretta (verificata su 990 fotografie), più un piccolo
   peso per le azioni nell'ultimo terzo quando ESPN dà la posizione in campo. Funzione pura, provata in test_app. */
export const PESO = { "shot-on-target": 1, "shot-hit-woodwork": 1, "shot-off-target": 0.5, "shot-blocked": 0.4, "corner-awarded": 0.3, "penalty---saved": 1, "penalty---missed": 1 };
export const ULTIMO_TERZO = 0.1;
const min_ = (s) => { const m = /(\d+)'(?:\+(\d+))?/.exec(s || ""); return m ? Number(m[1]) + (m[2] ? Number(m[2]) / 10 : 0) : null; };
/* quota della squadra di casa (0-1) negli ultimi `finestra` minuti; null se le azioni sono troppo poche per dirlo */
export function pressione(cronaca, minuto, finestra = 15) {
  const sp = [0, 0];
  for (const c of cronaca || []) {
    if (c.side !== 0 && c.side !== 1) continue;
    const m = min_(c.min);
    if (m == null || minuto - m < 0 || minuto - m >= finestra) continue;
    let w = PESO[c.type] || (/^(goal|penalty---scored)/.test(c.type || "") && !/own/.test(c.type) ? 1 : 0);
    if (!w && c.x != null && c.type !== "foul" && c.x >= 70) w = ULTIMO_TERZO; // x: verso la porta avversaria (0-100)
    sp[c.side] += w;
  }
  const tot = sp[0] + sp[1];
  if (tot < 0.6) return { quota: null, sp };
  const quota = sp[0] / tot;
  return { quota, sp, chi: quota >= 0.62 ? 0 : quota <= 0.38 ? 1 : null };
}
/* la cronaca ha le posizioni in campo? (campionati principali sì, molti minori no) */
export const conPosizioni = (cronaca) => (cronaca || []).some((c) => c.x != null);
