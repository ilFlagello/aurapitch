/* AuraPitch - "IA contro mercato" (punto 5 del 3/11): le partite da giocare in cui l'IA si discosta di più dalle quote
   sull'esito finale. Funzione pura (provata in test_app); lo storico arriva da data/ia_mercato.json (ia_mercato.py). */
export const ESITI = ["1", "X", "2"];
export function divergenze(matches, soglia = 0.03, n = 6) {
  const out = [];
  for (const m of matches || []) {
    if (m.st !== "NS" || m.nq || !m.p || !m.mk) continue;
    let best = null;
    for (let i = 0; i < 3; i++) { const d = m.p[i] - m.mk[i]; if (!best || Math.abs(d) > Math.abs(best.d)) best = { d, i }; }
    if (best && Math.abs(best.d) >= soglia - 1e-9) out.push({ m, c: ESITI[best.i], ia: m.p[best.i], q: m.mk[best.i], d: best.d });
  }
  return out.sort((a, b) => Math.abs(b.d) - Math.abs(a.d) || a.m.ko.localeCompare(b.m.ko)).slice(0, n);
}
export const esitoLungo = (m, c) => (c === "1" ? "vittoria " + m.h : c === "2" ? "vittoria " + m.a : "pareggio");
