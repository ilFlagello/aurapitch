/* AuraPitch - partite nel calendario del telefono (.ics) e scheda partita come immagine da condividere. */
import { auraCol, mLabel, pct } from "./base.js";

const due = (n) => String(n).padStart(2, "0");
const utcIcs = (d) => `${d.getUTCFullYear()}${due(d.getUTCMonth() + 1)}${due(d.getUTCDate())}T${due(d.getUTCHours())}${due(d.getUTCMinutes())}00Z`;
const testoIcs = (s) => String(s || "").replace(/[\;,]/g, (c) => "\\" + c).replace(/\n/g, "\\n");

// file .ics con una o più partite: su iPhone si apre "Aggiungi al calendario", con promemoria 30 minuti prima
async function scaricaCalendario(partite, lg, nome) {
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
  try { await document.fonts.ready; } catch (e) { /* caratteri di sistema */ }
  const W = 1080, H = 1350, c = document.createElement("canvas");
  c.width = W; c.height = H;
  const x = c.getContext("2d");
  const BS = '"Big Shoulders", "Figtree", sans-serif', FT = '"Figtree", system-ui, sans-serif';
  x.fillStyle = "#0E0C18"; x.fillRect(0, 0, W, H);
  const [ch, ca] = auraCol(m).map((c) => (/^#[0-9a-f]{6}$/i.test(c) ? c : "#7B5CFF"));
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

export { scaricaCalendario, immaginePartita };
