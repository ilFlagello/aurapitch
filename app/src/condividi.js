/* AuraPitch - partite nel calendario del telefono (.ics) e scheda partita come immagine da condividere. */
import { conta } from "./statistiche.js";
import { auraCol, mGroup, mLabel, odd, pct, schiarisci } from "./base.js";

const due = (n) => String(n).padStart(2, "0");
const utcIcs = (d) => `${d.getUTCFullYear()}${due(d.getUTCMonth() + 1)}${due(d.getUTCDate())}T${due(d.getUTCHours())}${due(d.getUTCMinutes())}00Z`;
const testoIcs = (s) => String(s || "").replace(/[\;,]/g, (c) => "\\" + c).replace(/\n/g, "\\n");

// file .ics con una o più partite: su iPhone si apre "Aggiungi al calendario", con promemoria 30 minuti prima
async function scaricaCalendario(partite, lg, nome) {
  conta("calendario");
  const ora = utcIcs(new Date());
  const ev = partite.filter((m) => m && m.ko).map((m) => {
    const t = new Date(m.ko), fine = new Date(t.getTime() + 115 * 60000), L = (lg(m.lg) || {}).name || "";
    return ["BEGIN:VEVENT", `UID:${m.id}@aurapitch`, `DTSTAMP:${ora}`, `DTSTART:${utcIcs(t)}`, `DTEND:${utcIcs(fine)}`,
      `SUMMARY:${testoIcs(m.h + " - " + m.a)}`, `DESCRIPTION:${testoIcs(L + " · analisi e probabilità su AuraPitch")}`, "URL:https://ilflagello.github.io/aurapitch/#m=" + encodeURIComponent(m.id),
      "BEGIN:VALARM", "TRIGGER:-PT30M", "ACTION:DISPLAY", `DESCRIPTION:${testoIcs(m.h + " - " + m.a + " tra 30 minuti")}`, "END:VALARM", "END:VEVENT"].join("\r\n");
  });
  if (!ev.length) return "nessuna";
  const txt = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//AuraPitch//IT", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", ...ev, "END:VCALENDAR"].join("\r\n");
  const file = new File([txt], (nome || "partite-aurapitch") + ".ics", { type: "text/calendar" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(file); a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
  return "pronta";
}

// scheda partita 1080 x 1350 nello stile AuraPitch: squadre, orario, probabilità e (se sbloccato) il consiglio dell'IA
async function immaginePartita(m, lg, conConsiglio) {
  conta("immagine");
  try { await document.fonts.ready; } catch (e) { /* caratteri di sistema */ }
  const W = 1080, H = 1350, c = document.createElement("canvas");
  c.width = W; c.height = H;
  const x = c.getContext("2d");
  const BS = '"Big Shoulders", "Figtree", sans-serif', FT = '"Figtree", system-ui, sans-serif';
  x.fillStyle = "#0E0C18"; x.fillRect(0, 0, W, H);
  const [ch, ca] = auraCol(m).map((c) => (/^#[0-9a-f]{6}$/i.test(c) ? schiarisci(c) : "#7B5CFF"));
  for (const [cx, col] of [[0, ch], [W, ca]]) { const g = x.createRadialGradient(cx, 520, 10, cx, 520, 640); g.addColorStop(0, col + "88"); g.addColorStop(1, col + "00"); x.fillStyle = g; x.fillRect(0, 0, W, H); }
  x.strokeStyle = "#A58BFF"; x.lineWidth = 8;
  for (const [r, o] of [[52, 0.3], [36, 0.55], [22, 1]]) { x.globalAlpha = o; x.beginPath(); x.arc(110, 120, r, 0, Math.PI * 2); x.stroke(); }
  x.globalAlpha = 1; x.fillStyle = "#F4F2FF"; x.beginPath(); x.arc(110, 120, 9, 0, Math.PI * 2); x.fill();
  x.font = `800 76px ${BS}`; x.fillText("AuraPitch", 190, 146);
  const quando = new Date(m.ko).toLocaleString("it-IT", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
  x.textAlign = "center"; x.fillStyle = "#9A95B3"; x.font = `500 36px ${FT}`; x.fillText(`${(lg(m.lg) || {}).name || ""} · ${quando}`, W / 2, 300);
  const fit = (t, max, size, peso) => { let s = size; do { x.font = `${peso} ${s}px ${BS}`; s -= 4; } while (x.measureText(t).width > max && s > 40); };
  x.fillStyle = "#F4F2FF"; fit(m.h.toUpperCase(), W - 140, 118, 800); x.fillText(m.h.toUpperCase(), W / 2, 470);
  x.fillStyle = "#9A95B3"; x.font = `600 44px ${FT}`; x.fillText(m.st === "NS" ? "contro" : `${(m.g || [0, 0])[0]} - ${(m.g || [0, 0])[1]}`, W / 2, 560);
  x.fillStyle = "#F4F2FF"; fit(m.a.toUpperCase(), W - 140, 118, 800); x.fillText(m.a.toUpperCase(), W / 2, 690);
  // aura delle probabilità
  const P = m.mk || m.p, bx = 90, bw = W - 180, gap = 10;
  let px = bx;
  [ch, "#3A3654", ca].forEach((col, i) => { const w = (bw - 2 * gap) * P[i]; x.fillStyle = col; x.beginPath(); x.roundRect(px, 790, w, 22, 11); x.fill(); px += w + gap; });
  const et = [m.h, "Pareggio", m.a];
  [0, 1, 2].forEach((i) => { const cx = bx + (bw / 3) * i + bw / 6; x.fillStyle = "#F4F2FF"; x.font = `800 96px ${BS}`; x.fillText(pct(P[i]) + "%", cx, 930); x.fillStyle = "#9A95B3"; x.font = `500 30px ${FT}`; x.fillText(et[i].slice(0, 18), cx, 978); });
  const t = m.tip && m.tip.consiglio;
  x.fillStyle = "#191626"; x.beginPath(); x.roundRect(70, 1050, W - 140, 170, 32); x.fill();
  x.fillStyle = "#A58BFF"; x.font = `700 32px ${FT}`; x.fillText("IL CONSIGLIO DELL'IA", W / 2, 1110);
  x.fillStyle = "#F4F2FF"; x.font = `700 46px ${FT}`;
  x.fillText(conConsiglio && t ? `${mLabel(m, t.c, true)} · ${pct(t.p)}%`.slice(0, 40) : "Scoprilo su AuraPitch", W / 2, 1178);
  x.fillStyle = "#6E6A85"; x.font = `400 26px ${FT}`; x.fillText("Probabilità dalle quote dei bookmaker. Stime, non certezze. Gioca responsabilmente.", W / 2, H - 50);
  x.textAlign = "left";
  const blob = await new Promise((r) => c.toBlob(r, "image/png"));
  const file = new File([blob], `${m.h}-${m.a}-aurapitch.png`.replace(/[^\w.-]+/g, "-"), { type: "image/png" });
  if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: `${m.h} - ${m.a} su AuraPitch` }); return "condivisa"; }
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = file.name; a.click(); return "scaricata";
}

// nome del mercato come lo scrivono di solito i bookmaker italiani, per ritrovarlo subito sul sito
const NOMI_BOOK = { "Esito finale": "1X2 finale", "Doppia chance": "Doppia chance", "Under/Over": "Under/Over", "Goal/No Goal": "Goal/No Goal", "Multigol": "Multigol",
  "Combo": "Combo", "Handicap": "Handicap europeo", "Risultato esatto": "Risultato esatto", "Parziale/finale": "Parziale/finale", "Gol esatti": "Somma gol",
  "Margine di vittoria": "Margine di vittoria", "Tempo con più gol": "Tempo con più gol", "Tempi": "Segna/vince entrambi i tempi", "Gol squadra": "Under/Over squadra",
  "Pari/Dispari": "Pari/Dispari", "Marcatori": "Marcatore (in qualsiasi momento)", "Cartellini": "Cartellini", "Calci d'angolo": "Calci d'angolo", "Falli": "Falli" };
function mercatoBookmaker(m, k) {
  const g = mGroup(k);
  if (g === "Primo tempo" || g === "Secondo tempo") { const d = mGroup(k.slice(3)); return [(NOMI_BOOK[d] || d) + (g === "Primo tempo" ? " · 1° tempo" : " · 2° tempo"), mLabel(m, k.slice(3), ["1", "X", "2"].includes(k.slice(3)) ? false : true)]; }
  return [NOMI_BOOK[g] || g, mLabel(m, k, ["1", "X", "2"].includes(k) ? false : true)];
}

// schedina come immagine: alta risoluzione, partite in ordine di orario e divise per giorno, mercato scritto come sui siti dei bookmaker
async function immagineSchedina(legs, titolo, lg) {
  conta("immagine");
  try { await document.fonts.ready; } catch (e) { /* caratteri di sistema */ }
  const L = legs.filter((l) => l && l.m).slice().sort((a, b) => String(a.m.ko).localeCompare(String(b.m.ko)));
  const giorno = (m) => new Date(m.ko).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
  const giorni = [...new Set(L.map((l) => giorno(l.m)))];
  const W = 1080, S = 2, RIGA = 214, TESTA = 330, GIORNO = 86, PIEDE = 420;
  const H = TESTA + giorni.length * GIORNO + L.length * (RIGA + 18) + PIEDE;
  const c = document.createElement("canvas");
  c.width = W * S; c.height = H * S;
  const x = c.getContext("2d");
  x.scale(S, S);
  const BS = '"Big Shoulders", "Figtree", sans-serif', FT = '"Figtree", system-ui, sans-serif';
  const INK = "#F4F2FF", MU = "#9A95B3", CARD = "#191626", ACC = "#A58BFF";
  const taglia = (t, max) => { t = String(t); if (x.measureText(t).width <= max) return t; while (t.length > 1 && x.measureText(t + "…").width > max) t = t.slice(0, -1); return t + "…"; };
  // sfondo notte con l'aura viola in alto
  x.fillStyle = "#0E0C18"; x.fillRect(0, 0, W, H);
  const g1 = x.createRadialGradient(W * 0.9, -40, 10, W * 0.9, -40, 760); g1.addColorStop(0, "rgba(123,92,255,0.50)"); g1.addColorStop(1, "rgba(123,92,255,0)");
  x.fillStyle = g1; x.fillRect(0, 0, W, H);
  const g2 = x.createRadialGradient(0, H, 10, 0, H, 700); g2.addColorStop(0, "rgba(91,46,230,0.25)"); g2.addColorStop(1, "rgba(91,46,230,0)");
  x.fillStyle = g2; x.fillRect(0, 0, W, H);
  // marchio
  x.strokeStyle = ACC; x.lineWidth = 7;
  for (const [r, o] of [[44, 0.3], [31, 0.55], [19, 1]]) { x.globalAlpha = o; x.beginPath(); x.arc(108, 112, r, 0, Math.PI * 2); x.stroke(); }
  x.globalAlpha = 1; x.fillStyle = INK; x.beginPath(); x.arc(108, 112, 8, 0, Math.PI * 2); x.fill();
  x.font = `800 66px ${BS}`; x.fillText("AuraPitch", 172, 136);
  x.textAlign = "right"; x.font = `700 26px ${FT}`; x.fillStyle = ACC; x.fillText("LA MIA SCHEDINA", W - 64, 104);
  x.font = `500 26px ${FT}`; x.fillStyle = MU; x.fillText(new Date().toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" }), W - 64, 142); x.textAlign = "left";
  x.font = `700 44px ${FT}`; x.fillStyle = INK; x.fillText(taglia(titolo || "Schedina", W - 128), 64, 240);
  x.font = `500 28px ${FT}`; x.fillStyle = MU; x.fillText(`${L.length} ${L.length === 1 ? "partita" : "partite"} in ordine di orario: cercale sul sito in questa sequenza`, 64, 286);
  let y = TESTA;
  let n = 0;
  for (const gg of giorni) {
    // intestazione del giorno
    x.font = `700 26px ${FT}`; x.fillStyle = ACC; const tg = gg.toUpperCase(); x.fillText(tg, 64, y + 44);
    const lw = x.measureText(tg).width; x.strokeStyle = "rgba(165,139,255,0.25)"; x.lineWidth = 2; x.beginPath(); x.moveTo(64 + lw + 20, y + 35); x.lineTo(W - 64, y + 35); x.stroke();
    y += GIORNO;
    for (const l of L.filter((z) => giorno(z.m) === gg)) {
      n++;
      const m = l.m, [mercato, esito] = mercatoBookmaker(m, l.k);
      x.fillStyle = CARD; x.beginPath(); x.roundRect(48, y, W - 96, RIGA, 30); x.fill();
      const [ch, ca] = auraCol(m).map((v) => (/^#[0-9a-f]{6}$/i.test(v) ? schiarisci(v) : "#7B5CFF")); // l'immagine è sempre su fondo scuro
      x.fillStyle = ch; x.beginPath(); x.roundRect(48, y + 36, 7, (RIGA - 72) / 2, 3); x.fill();
      x.fillStyle = ca; x.beginPath(); x.roundRect(48, y + 36 + (RIGA - 72) / 2, 7, (RIGA - 72) / 2, 3); x.fill();
      // numero e orario
      x.fillStyle = MU; x.font = `600 22px ${FT}`; x.fillText(String(n).padStart(2, "0"), 84, y + 52);
      x.fillStyle = INK; x.font = `800 58px ${BS}`; x.fillText(new Date(m.ko).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }), 84, y + 118);
      x.fillStyle = MU; x.font = `500 22px ${FT}`; x.fillText(taglia((lg(m.lg) || {}).name || "", 150), 84, y + 160);
      // partita, mercato ed esito
      const X0 = 262, larg = W - 96 - (X0 - 48) - 190;
      x.fillStyle = INK; x.font = `700 36px ${FT}`; x.fillText(taglia(`${m.h} – ${m.a}`, larg), X0, y + 62);
      x.fillStyle = MU; x.font = `600 24px ${FT}`; x.fillText(taglia(mercato.toUpperCase(), larg), X0, y + 112);
      x.fillStyle = ACC; x.font = `700 38px ${FT}`; x.fillText(taglia(esito, larg), X0, y + 162);
      // quota
      x.textAlign = "right"; x.fillStyle = INK; x.font = `800 72px ${BS}`; x.fillText(odd(l.q), W - 84, y + 128);
      if (l.stima) { x.fillStyle = MU; x.font = `500 20px ${FT}`; x.fillText("quota stimata", W - 84, y + 162); }
      x.textAlign = "left";
      y += RIGA + 18;
    }
  }
  // totale
  const tot = L.reduce((a, l) => a * l.q, 1), pr = L.reduce((a, l) => a * l.p, 1);
  y += 12;
  x.fillStyle = CARD; x.beginPath(); x.roundRect(48, y, W - 96, 230, 34); x.fill();
  const gt = x.createLinearGradient(48, y, W - 48, y); gt.addColorStop(0, "rgba(165,139,255,0.18)"); gt.addColorStop(1, "rgba(165,139,255,0)");
  x.fillStyle = gt; x.beginPath(); x.roundRect(48, y, W - 96, 230, 34); x.fill();
  x.fillStyle = MU; x.font = `600 26px ${FT}`; x.fillText("QUOTA TOTALE", 92, y + 74);
  x.font = `500 28px ${FT}`; x.fillText(`${L.length} ${L.length === 1 ? "partita" : "partite"}`, 92, y + 134);
  x.fillText(`Probabilità secondo l'IA: ${(pr * 100).toFixed(1).replace(".", ",")}%`, 92, y + 178);
  x.textAlign = "right"; x.fillStyle = INK; x.font = `800 150px ${BS}`; x.fillText(odd(tot), W - 92, y + 178); x.textAlign = "left";
  // avvertenza
  x.fillStyle = "#6E6A85"; x.font = `400 22px ${FT}`; x.textAlign = "center";
  x.fillText("Quote indicative al momento della creazione: sul sito possono essere diverse.", W / 2, H - 98);
  x.fillText("Stime, non certezze. Gioco vietato ai minori di 18 anni. Gioca responsabilmente.", W / 2, H - 62);
  x.textAlign = "left";
  const blob = await new Promise((r) => c.toBlob(r, "image/png"));
  const file = new File([blob], "schedina-aurapitch.png", { type: "image/png" });
  if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: "Schedina AuraPitch" }); return "condivisa"; }
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = file.name; a.click(); return "scaricata";
}

export { scaricaCalendario, immaginePartita, immagineSchedina, mercatoBookmaker };
