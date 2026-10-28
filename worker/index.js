/* AuraPitch - servizio notifiche (Cloudflare Worker).
   Ogni minuto legge i risultati in diretta (ESPN) delle partite seguite dagli utenti e manda una notifica Web Push
   per calcio d'inizio, gol ed esito finale. Le chiavi VAPID vengono create dal servizio stesso e restano nel suo archivio (KV).
   Archivio: "subs" = iscrizioni con le partite seguite; "state" = ultimo stato visto di ogni partita; "vapid" = chiavi. */

import { DurableObject } from "cloudflare:workers";
import { gestisci as accesso, ORIGINI, pulisciInattivi, firmaValida } from "./accesso.js";

const SITE = "https://site.api.espn.com/apis/site/v2/sports/soccer/";
// solo l'app AuraPitch puo usare il servizio dal browser; niente dati in cache intermedie, niente indirizzo di provenienza
const CORS = { "Access-Control-Allow-Origin": ORIGINI[0], "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400", "Vary": "Origin", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "Cache-Control": "no-store" };
// fonti pubbliche che l'app legge passando dal servizio: cosi ESPN e Open-Meteo non vedono l'indirizzo IP di chi usa l'app
const PONTE = new Set(["site.api.espn.com", "site.web.api.espn.com", "sports.core.api.espn.com", "api.open-meteo.com", "geocoding-api.open-meteo.com"]);
const enc = new TextEncoder();

const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (s) => { s = s.replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "="; return Uint8Array.from(atob(s), (c) => c.charCodeAt(0)); };
const cat = (...a) => { const out = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of a) { out.set(x, i); i += x.length; } return out; };
const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { "Content-Type": "application/json", ...CORS } });

/* ---------- archivio: database SQLite in un Durable Object ----------
   Prima i dati stavano solo in KV (gratuito: 1000 scritture al giorno, nessuna scrittura atomica).
   Ora voti, iscrizioni, profili, gruppi, risultati e dati sincronizzati stanno in un unico database (gratuito: 100.000 scritture
   al giorno). Un solo archivio "main": le operazioni delicate (voto, iscrizione) avvengono tutte dentro, una alla volta,
   quindi due richieste contemporanee non si sovrascrivono. Se il database non c'è, si torna a KV. Le chiavi VAPID restano in KV. */
export class Archivio extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.st = ctx.storage;
    this.cx = ctx;
    this.sql.exec("CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL, exp INTEGER)");
  }
  _get(k) {
    const r = this.sql.exec("SELECT v, exp FROM kv WHERE k = ?", k).toArray()[0];
    if (!r) return null;
    if (r.exp && r.exp < Date.now()) { this.sql.exec("DELETE FROM kv WHERE k = ?", k); return null; }
    return r.v;
  }
  _put(k, v, ttl) {
    this.sql.exec("INSERT INTO kv (k, v, exp) VALUES (?, ?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v, exp = excluded.exp", k, v, ttl ? Date.now() + ttl * 1000 : null);
  }
  async get(k) { return this._get(k); }
  async getMany(ks) { return ks.map((k) => this._get(k)); }
  async put(k, v, ttl) { this._put(k, String(v), ttl); }
  async del(k) { this.sql.exec("DELETE FROM kv WHERE k = ?", k); }
  async conta() { return this.sql.exec("SELECT substr(k, 1, instr(k || ':', ':')) AS p, count(*) AS n FROM kv GROUP BY p").toArray(); }
  // statistiche anonime: somma dei conteggi del giorno in un colpo solo
  async incr(k, campi, ttl) {
    const v = JSON.parse(this._get(k) || "{}");
    for (const [c, n] of Object.entries(campi)) v[c] = (v[c] || 0) + n;
    this._put(k, JSON.stringify(v), ttl);
  }
  // copia di sicurezza integrata: Cloudflare conserva 30 giorni di storia del database e permette di tornare a un istante preciso
  async puntoDiRipristino(ts) { try { return { ok: true, segnalibro: !!(await this.st.getBookmarkForTime(ts)) }; } catch (e) { return { ok: false, err: String(e && e.message || e).slice(0, 120) }; } }
  async ripristina(ts) {
    const b = await this.st.getBookmarkForTime(ts);
    await this.st.onNextSessionRestoreBookmark(b);
    setTimeout(() => this.cx.abort("ripristino"), 50); // il database riparte dall'istante scelto
    return { ok: true };
  }
  async chiavi(prefisso) { return this.sql.exec("SELECT k FROM kv WHERE k >= ? AND k < ?", prefisso, prefisso + "\uffff").toArray().map((r) => r.k); }
  async lista(prefisso, max) { return this.sql.exec("SELECT k, v FROM kv WHERE k >= ? AND k < ? AND (exp IS NULL OR exp > ?) ORDER BY k DESC LIMIT ?", prefisso, prefisso + "\uffff", Date.now(), max).toArray().map((r) => [r.k, r.v]); }
  async pulisci() { this.sql.exec("DELETE FROM kv WHERE exp IS NOT NULL AND exp < ?", Date.now()); }
  // voto atomico: legge e scrive profilo e conteggio in un colpo solo
  async voto(id, chi, s, meta) {
    const v = JSON.parse(this._get("v:" + id) || "[0,0,0]");
    const u = JSON.parse(this._get("u:" + chi) || '{"nome":"","gruppi":[],"voti":{}}');
    const prima = u.voti[id] ? u.voti[id].s : null;
    if (prima === s) return v;
    u.voti[id] = { s, ...meta };
    if (prima != null) v[prima] = Math.max(0, v[prima] - 1);
    v[s] += 1;
    this._put("u:" + chi, JSON.stringify(u));
    this._put("v:" + id, JSON.stringify(v), 60 * 60 * 24 * 21);
    return v;
  }
  // iscrizione atomica alle notifiche: scrive solo se qualcosa cambia davvero
  async iscrivi(id, nuova, max) {
    const subs = JSON.parse(this._get("subs") || "{}");
    const vecchia = subs[id] || null;
    if (!vecchia && Object.keys(subs).length >= max) return "troppe";
    const confronta = (x) => x && JSON.stringify({ sub: x.sub, follow: x.follow, pref: x.pref });
    if (confronta(vecchia) === confronta(nuova)) return "uguale";
    subs[id] = { ...nuova, t: Date.now(), t0: (vecchia && vecchia.t0) || Date.now() };
    this._put("subs", JSON.stringify(subs));
    return "salvata";
  }
  async togli(ids) {
    const subs = JSON.parse(this._get("subs") || "{}");
    let n = 0;
    for (const id of ids) if (subs[id]) { delete subs[id]; n++; }
    if (n) this._put("subs", JSON.stringify(subs));
    return n;
  }
  // copia una tantum dei dati da KV: non sovrascrive quello che il database ha già
  async migra(righe) {
    let n = 0;
    for (const [k, v, exp] of righe) {
      const ora = this._get(k);
      if (ora === null) { this.sql.exec("INSERT INTO kv (k, v, exp) VALUES (?, ?, ?)", k, v, exp || null); n++; }
      else if (k === "subs" || k === "ris") { this._put(k, JSON.stringify({ ...JSON.parse(v), ...JSON.parse(ora) })); n++; } // unione: vince il dato più nuovo
    }
    return n;
  }
}
// stessa forma dell'API di KV (get(k, "json"), put(k, v, {expirationTtl}), delete(k)), così il resto del codice non cambia
function archivio(env) {
  if (!env.ARCH) return { stub: null, get: (k, t) => env.KV.get(k, t), put: (k, v, o) => env.KV.put(k, v, o), delete: (k) => env.KV.delete(k) };
  const st = env.ARCH.get(env.ARCH.idFromName("main"));
  return {
    stub: st,
    get: async (k, t) => { const v = await st.get(k); return v == null ? null : t === "json" ? JSON.parse(v) : v; },
    put: (k, v, o) => st.put(k, v, o && o.expirationTtl),
    delete: (k) => st.del(k),
  };
}
async function migraDaKV(env) {
  if (!env.ARCH) return "senza database";
  const DB = archivio(env);
  if (await DB.get("_migrato")) return "fatto";
  const chiavi = [];
  let cur;
  do {
    const l = await env.KV.list(cur ? { cursor: cur } : {});
    for (const k of l.keys) if (k.name !== "vapid" && !k.name.startsWith("vc:")) chiavi.push(k);
    cur = l.list_complete ? null : l.cursor;
  } while (cur);
  const gia = await DB.stub.getMany(chiavi.map((k) => k.name));
  const daFare = chiavi.filter((k, i) => gia[i] === null || k.name === "subs" || k.name === "ris");
  const mancano = daFare.slice(0, 30); // limite di richieste per esecuzione
  const righe = [];
  for (const k of mancano) { const v = await env.KV.get(k.name); if (v != null) righe.push([k.name, v, k.expiration ? k.expiration * 1000 : null]); }
  const n = await DB.stub.migra(righe);
  if (daFare.length <= 30) await DB.put("_migrato", String(Date.now()));
  return `copiate ${n}`;
}

/* ---------- chiavi VAPID ---------- */
async function vapid(env) {
  let v = await env.KV.get("vapid", "json");
  if (!v) {
    const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    const priv = await crypto.subtle.exportKey("jwk", kp.privateKey);
    const pub = b64u(await crypto.subtle.exportKey("raw", kp.publicKey));
    v = { priv, pub };
    await env.KV.put("vapid", JSON.stringify(v));
  }
  return v;
}
async function jwt(v, aud) {
  const h = b64u(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const c = b64u(enc.encode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: "https://ilflagello.github.io/aurapitch/" })));
  const key = await crypto.subtle.importKey("jwk", v.priv, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(h + "." + c));
  return h + "." + c + "." + b64u(sig);
}

/* ---------- cifratura del messaggio (RFC 8291, aes128gcm) ---------- */
async function hmac(key, data) {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, data));
}
async function cifra(sub, payload) {
  const uaPub = unb64u(sub.keys.p256dh), auth = unb64u(sub.keys.auth);
  const as = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPub = new Uint8Array(await crypto.subtle.exportKey("raw", as.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", uaPub, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, as.privateKey, 256));
  const prkKey = await hmac(auth, ecdh);
  const ikm = (await hmac(prkKey, cat(enc.encode("WebPush: info\0"), uaPub, asPub, new Uint8Array([1])))).slice(0, 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, cat(enc.encode("Content-Encoding: aes128gcm\0"), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, cat(enc.encode("Content-Encoding: nonce\0"), new Uint8Array([1])))).slice(0, 12);
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, cat(enc.encode(payload), new Uint8Array([2]))));
  const rs = new Uint8Array([0, 0, 16, 0]);
  return cat(salt, rs, new Uint8Array([asPub.length]), asPub, ct);
}
async function invia(env, v, sub, msg) {
  const url = new URL(sub.endpoint);
  const body = await cifra(sub, JSON.stringify(msg));
  const r = await fetch(sub.endpoint, {
    method: "POST", body,
    headers: { "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream", TTL: "3600", Urgency: "high", Authorization: `vapid t=${await jwt(v, url.origin)}, k=${v.pub}` },
  });
  return r.status;
}

/* ---------- controllo partite ---------- */
function stato(ev) {
  const c = ev.competitions[0], t = ev.status.type;
  const h = c.competitors.find((x) => x.homeAway === "home"), a = c.competitors.find((x) => x.homeAway === "away");
  const goals = (c.details || []).filter((d) => d.scoringPlay).map((d) => ({ min: (d.clock && d.clock.displayValue) || "", chi: ((d.athletesInvolved || [])[0] || {}).displayName || "", og: d.ownGoal, pen: d.penaltyKick }));
  const rossi = (c.details || []).filter((d) => d.redCard).map((d) => ({ min: (d.clock && d.clock.displayValue) || "", chi: ((d.athletesInvolved || [])[0] || {}).displayName || "", casa: (d.team || {}).id === h.team.id }));
  return { st: t.state, half: t.name === "STATUS_HALFTIME", g: h.score == null || a.score == null ? null : [Number(h.score), Number(a.score)], clock: ev.status.displayClock || "", goals, rossi, ko: Date.parse(ev.date) };
}
// simboli degli avvisi: forme geometriche, sempre uguali, riconoscibili a colpo d'occhio
const SIMBOLO = { gol: "◉ ", annullato: "⊘ ", rossi: "▮ ", inizio: "▷ ", intervallo: "◐ ", finale: "■ ", formazioni: "≡ ", promemoria: "◔ ", test: "◎ " };
const PREF0 = { promemoria: true, inizio: true, gol: true, rossi: true, intervallo: true, finale: true, formazioni: true };
const vuole = (sub, tipo) => ((sub && sub.pref) || PREF0)[tipo] !== false;
/* dati dell'app (probabilita IA e marcatori) per arricchire l'avviso delle formazioni; letti al massimo ogni 5 minuti */
// stato.json è la versione ridotta di giornata.json (pochi KB): leggerla costa poca CPU, dentro il limite del piano gratuito
async function giornata() {
  for (const f of ["stato.json", "giornata.json"]) {
    try { const r = await fetch("https://ilflagello.github.io/aurapitch/data/" + f, { cf: { cacheTtl: 300 } }); if (r.ok) return await r.json(); } catch (e) { /* si prova il file successivo */ }
  }
  return null;
}
const piano = (x) => String(x || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
async function formazioni(lg, eid) {
  try {
    const d = await (await fetch(`${SITE}${lg}/summary?event=${eid}`, { cf: { cacheTtl: 60 } })).json();
    const R = d.rosters || [];
    const tit = ["home", "away"].map((ha) => ((R.find((r) => r.homeAway === ha) || {}).roster || []).filter((p) => p.starter).map((p) => p.athlete && p.athlete.displayName).filter(Boolean));
    return tit.length === 2 && tit[0].length >= 11 && tit[1].length >= 11 ? tit : null;
  } catch (e) { return null; }
}
async function controlla(env) {
  const DB = archivio(env);
  const subs = (await DB.get("subs", "json")) || {};
  const follow = {};
  for (const [id, s] of Object.entries(subs)) for (const f of s.follow || []) (follow[f.lgE + "|" + f.eid] = follow[f.lgE + "|" + f.eid] || { f, ids: [] }).ids.push(id);
  if (!Object.keys(follow).length) return "nessuna partita seguita";
  const leghe = [...new Set(Object.keys(follow).map((k) => k.split("|")[0]))];
  const eventi = {};
  await Promise.all(leghe.map(async (lg) => {
    try {
      const r = await fetch(`${SITE}${lg}/scoreboard`, { cf: { cacheTtl: 20 } });
      const d = await r.json();
      for (const ev of d.events || []) eventi[lg + "|" + ev.id] = ev;
    } catch (e) { /* si riprova al giro dopo */ }
  }));
  const old = (await DB.get("state", "json")) || {};
  const nuovo = {};
  let G = null;
  const msgs = [];
  for (const [k, { f, ids }] of Object.entries(follow)) {
    const ev = eventi[k];
    if (!ev) { if (old[k]) nuovo[k] = old[k]; continue; }
    const s = stato(ev), o = old[k];
    if (!s.g) s.g = o ? o.g : [0, 0]; // punteggio assente da ESPN: si tiene quello di prima (niente falsi "gol annullato")
    nuovo[k] = { st: s.st, g: s.g, half: s.half, rossi: s.rossi.length, form: o ? o.form : false, prom: o ? o.prom : false };
    if (!o) continue; // prima volta che la vediamo: nessun avviso
    // ogni avviso ha il suo simbolo (geometrico, non un'emoji), la sua icona e la sua vibrazione (vedi sw.js); "stile" sceglie quale
    const push = (title, body, tipo, stile) => msgs.push({ f, ids: ids.filter((id) => vuole(subs[id], tipo)), msg: { title: (SIMBOLO[stile || tipo] || "") + title, body, tipo: stile || tipo, tag: k + "|" + tipo + "|" + s.g.join("-") + "|" + (tipo === "rossi" ? body : ""), url: "./" } });
    const ris = `${f.h} ${s.g[0]} - ${s.g[1]} ${f.a}`;
    // promemoria un'ora prima, con il consiglio dell'IA
    if (s.st === "pre" && !o.prom && s.ko - Date.now() < 62 * 60000 && s.ko - Date.now() > 40 * 60000) {
      nuovo[k].prom = true;
      G = G || (await giornata()) || { matches: [] };
      const m = G.matches.find((x) => piano(x.h) === piano(f.h) && piano(x.a) === piano(f.a));
      const t = m && m.tip && m.tip.consiglio;
      push("Tra un'ora", `${f.h} - ${f.a}` + (t ? ` · Consiglio IA: ${t.l} (${Math.round(t.p * 100)}%)` : ""), "promemoria");
    }
    // formazioni ufficiali: da 75 minuti prima del calcio d'inizio, controllo ogni 3 minuti finche escono
    if (s.st === "pre" && !o.form && s.ko - Date.now() < 75 * 60000 && new Date().getUTCMinutes() % 3 === 0) {
      const tit = await formazioni(k.split("|")[0], k.split("|")[1]);
      if (tit) {
        nuovo[k].form = true;
        G = G || (await giornata()) || { matches: [] };
        const m = G.matches.find((x) => piano(x.h) === piano(f.h) && piano(x.a) === piano(f.a));
        let body = `${f.h} - ${f.a}: sono uscite le formazioni ufficiali.`;
        if (m && m.p) body += ` IA: ${f.h} ${Math.round(m.p[0] * 100)}%, pari ${Math.round(m.p[1] * 100)}%, ${f.a} ${Math.round(m.p[2] * 100)}%.`;
        if (m && m.marcatori) {
          const fuori = Object.entries(m.marcatori).filter(([c, x]) => x.g >= 2 && !tit[x.lato].some((n) => piano(n) === piano(c.slice(5)))).map(([c, x]) => `${c.slice(5)} (${x.lato ? f.a : f.h})`);
          if (fuori.length) body += ` Non titolari: ${fuori.slice(0, 3).join(", ")}.`;
        }
        push("Formazioni ufficiali", body, "formazioni");
      }
    }
    if (o.st === "pre" && s.st === "in") push("Si parte", `${f.h} - ${f.a}`, "inizio");
    if (s.st !== "pre" && (s.g[0] !== o.g[0] || s.g[1] !== o.g[1])) {
      const piu = s.g[0] + s.g[1] > o.g[0] + o.g[1];
      const last = s.goals[s.goals.length - 1];
      const chi = s.g[0] > o.g[0] ? f.h : f.a;
      if (piu) push(`Gol ${chi}`, ris + (last ? ` · ${last.min} ${last.chi}${last.pen ? " su rigore" : ""}${last.og ? ", autogol" : ""}` : ""), "gol");
      else push("Gol annullato", ris, "gol", "annullato");
    }
    if (s.rossi.length > (o.rossi || 0)) {
      for (const r of s.rossi.slice(o.rossi || 0)) push(`Rosso a ${r.chi}`, `${r.casa ? f.h : f.a}, ${r.min} · ${ris}`, "rossi");
    }
    if (!o.half && s.half) push("Intervallo", ris, "intervallo");
    if (o.st === "in" && s.st === "post") push("Finale", ris, "finale");
  }
  if (JSON.stringify(nuovo) !== JSON.stringify(old)) await DB.put("state", JSON.stringify(nuovo));
  if (!msgs.length) return "nessuna novità";
  // toccando la notifica si apre la partita nell'app
  G = G || (await giornata()) || { matches: [] };
  for (const x of msgs) { const m = G.matches.find((y) => piano(y.h) === piano(x.f.h) && piano(y.a) === piano(x.f.a)); if (m) x.msg.url = "./#m=" + encodeURIComponent(m.id); }
  const v = await vapid(env);
  let morte = [];
  for (const { ids, msg } of msgs.filter((x) => x.ids.length)) {
    await Promise.all(ids.map(async (id) => {
      try { const st = await invia(env, v, subs[id].sub, msg); if (st === 404 || st === 410) morte.push(id); } catch (e) { /* invio non riuscito */ }
    }));
  }
  if (morte.length) {
    // si rilegge subito prima di scrivere, per non cancellare un'iscrizione arrivata nel frattempo
    if (DB.stub) await DB.stub.togli(morte);
    else { const ora = (await DB.get("subs", "json")) || {}; for (const id of morte) delete ora[id]; await DB.put("subs", JSON.stringify(ora)); }
  }
  return `${msgs.length} avvisi inviati`;
}

/* ---------- orologio: avvia la raccolta dati su GitHub (gli avvii programmati di GitHub non partono) ----------
   06:00 UTC giro completo; dalle 10:00 alle 23:50 UTC aggiornamento ogni 10 minuti. Serve il secret GH_TOKEN (permesso Actions: scrittura). */
async function orologio(env) {
  const DB = archivio(env);
  if (!env.GH_TOKEN) return "senza token";
  const t = new Date();
  const h = t.getUTCHours(), mi = t.getUTCMinutes();
  let modo = null;
  if (h === 6 && mi < 10) modo = "completo";
  else if (h >= 10 && h <= 23) modo = "live";
  if (!modo) return "fuori orario";
  const slot = t.toISOString().slice(0, 14) + Math.floor(mi / 10);
  const ultimo = (await DB.get("orologio", "json")) || {};
  if (ultimo.slot === slot) return "gia avviato";
  const r = await fetch("https://api.github.com/repos/ilFlagello/aurapitch/actions/workflows/raccolta.yml/dispatches", {
    method: "POST",
    headers: { Authorization: "Bearer " + env.GH_TOKEN, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "aurapitch-orologio", "Content-Type": "application/json" },
    body: JSON.stringify({ ref: "main", inputs: { modo } }),
  });
  await DB.put("orologio", JSON.stringify({ slot, modo, esito: r.status, t: t.toISOString() }));
  return `${modo}: ${r.status}`;
}

// limite di richieste per indirizzo (in memoria, al minuto): frena chi prova a gonfiare i voti o a consumare le scritture
const conta = new Map();
function troppi(req, max = 20) {
  const ip = req.headers.get("CF-Connecting-IP") || "?", k = ip + ":" + Math.floor(Date.now() / 60000) + ":" + max;
  const n = (conta.get(k) || 0) + 1; conta.set(k, n);
  if (conta.size > 5000) conta.clear();
  return n > max;
}
/* ---------- cassaforte: diario delle previsioni, modello imparato, storico dei consigli ----------
   Non stanno nel repository pubblico ma qui, nell'archivio privato del servizio. Ci accedono solo i processi automatici
   di GitHub, firmando ogni richiesta (HMAC-SHA256 con il token gia condiviso tra GitHub e il servizio, che non viaggia mai).
   Firma valida 5 minuti; un file alla volta (max 1,5 MB); nomi ammessi da una lista chiusa. */
const NOME_CF = /^(diario\/\d{4}-\d{2}-\d{2}\.json|modello\.json|consigli\.json|taratura_fattori\.json)$/;
async function cassaforte(req, url, env, DB, segnala) {
  const nojson = (d, st = 200) => new Response(JSON.stringify(d), { status: st, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  if (req.method !== "POST") return nojson({ ok: false }, 405);
  const txt = await req.text();
  if (txt.length > 1600000) return nojson({ ok: false, err: "troppo grande" }, 413);
  if (!(await firmaValida(req, env, txt))) { segnala("cassaforte_firma"); return nojson({ ok: false, err: "firma non valida" }, 403); }
  if (!DB.stub) return nojson({ ok: false, err: "archivio non pronto" }, 503);
  let d; try { d = JSON.parse(txt); } catch (e) { return nojson({ ok: false }, 400); }
  if (url.pathname === "/cassaforte/ripristino") { // solo dal processo "Ripristino di emergenza" su GitHub (firmato)
    const ts = Date.parse(String(d.quando || ""));
    if (!(ts > Date.now() - 30 * 86400000 && ts < Date.now())) return nojson({ ok: false, err: "data fuori dagli ultimi 30 giorni" }, 400);
    if (d.prova) return nojson(await DB.stub.puntoDiRipristino(ts));
    return nojson(await DB.stub.ripristina(ts));
  }
  if (url.pathname === "/cassaforte/elenco") return nojson({ ok: true, nomi: (await DB.stub.chiavi("cf:")).map((k) => k.slice(3)) });
  if (!NOME_CF.test(String(d.nome || ""))) return nojson({ ok: false, err: "nome non ammesso" }, 400);
  if (url.pathname === "/cassaforte/leggi") return nojson({ ok: true, testo: await DB.get("cf:" + d.nome) });
  if (url.pathname === "/cassaforte/scrivi" && typeof d.testo === "string") { await DB.put("cf:" + d.nome, d.testo); return nojson({ ok: true }); }
  return nojson({ ok: false }, 404);
}

async function sha(s) { return b64u(await crypto.subtle.digest("SHA-256", enc.encode(s))).slice(0, 22); }

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const DB = archivio(env);
    if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
    // allarmi di sicurezza: conteggi del giorno (richieste respinte, firme e codici sbagliati), letti dal controllo orario
    const segnala = (tipo) => { try { ctx && ctx.waitUntil(DB.stub ? DB.stub.incr("sic:" + new Date().toISOString().slice(0, 10), { [tipo]: 1 }, 30 * 86400).catch(() => {}) : Promise.resolve()); } catch (e) { /* niente */ } };
    const troppiS = (r, max) => { const t = troppi(r, max); if (t) segnala("limite"); return t; };
    if (url.pathname.startsWith("/cassaforte/")) return cassaforte(req, url, env, DB, segnala);
    const acc = await accesso(req, url, env, DB, json, troppiS, segnala);
    if (acc) return acc;
    if (url.pathname === "/x") {
      let t;
      try { t = new URL(url.searchParams.get("u") || ""); } catch (e) { return json({ ok: false }, 400); }
      if (t.protocol !== "https:" || !PONTE.has(t.hostname)) return json({ ok: false }, 400);
      if (troppi(req, 240)) return json({ ok: false, err: "troppe richieste" }, 429);
      const vivo = /scoreboard|summary|plays|status/.test(t.pathname);
      const r = await fetch(t.toString(), { cf: { cacheTtl: vivo ? 15 : 300, cacheEverything: true }, headers: { "User-Agent": "AuraPitch" } });
      return new Response(r.body, { status: r.status, headers: { ...CORS, "Content-Type": r.headers.get("Content-Type") || "application/json", "Cache-Control": "public, max-age=" + (vivo ? 10 : 120) } });
    }
    if (url.pathname === "/vapid") return json({ key: (await vapid(env)).pub });
    if (url.pathname === "/subscribe" && req.method === "POST") {
      if (troppi(req, 15)) return json({ ok: false, err: "troppe richieste" }, 429);
      const d = await req.json().catch(() => null);
      if (!d || !d.sub || !d.sub.endpoint || !d.sub.keys) return json({ ok: false, err: "iscrizione non valida" }, 400);
      if (!/^https:\/\/[a-z0-9.-]+(push\.apple\.com|googleapis\.com|mozilla\.com|windows\.com|mozaws\.net)\//.test(d.sub.endpoint)) return json({ ok: false, err: "servizio push non riconosciuto" }, 400);
      const follow = (Array.isArray(d.follow) ? d.follow : []).slice(0, 60).filter((f) => f && /^[a-z0-9._]+$/.test(f.lgE || "") && /^\d+$/.test(String(f.eid || "")))
        .map((f) => ({ lgE: f.lgE, eid: String(f.eid), h: String(f.h || "").slice(0, 40), a: String(f.a || "").slice(0, 40) }));
      const id = await sha(d.sub.endpoint);
      const pref = {};
      for (const k of Object.keys(PREF0)) pref[k] = !(d.pref && d.pref[k] === false);
      const nuova = { sub: { endpoint: d.sub.endpoint, keys: d.sub.keys }, follow, pref };
      if (DB.stub) {
        if ((await DB.stub.iscrivi(id, nuova, 5000)) === "troppe") return json({ ok: false, err: "troppe iscrizioni" }, 429);
        return json({ ok: true, seguite: follow.length });
      }
      const subs = (await DB.get("subs", "json")) || {};
      if (Object.keys(subs).length > 500 && !subs[id]) return json({ ok: false, err: "troppe iscrizioni" }, 429);
      const vecchia = subs[id] || null;
      const confronta = (x) => x && JSON.stringify({ sub: x.sub, follow: x.follow, pref: x.pref });
      // si scrive solo se qualcosa è cambiato davvero (limite gratuito: 1000 scritture al giorno)
      if (confronta(vecchia) !== confronta(nuova)) { subs[id] = { ...nuova, t: Date.now(), t0: (vecchia && vecchia.t0) || Date.now() }; await DB.put("subs", JSON.stringify(subs)); }
      return json({ ok: true, seguite: follow.length });
    }
    if (url.pathname === "/unsubscribe" && req.method === "POST") {
      const d = await req.json().catch(() => null);
      const subs = (await DB.get("subs", "json")) || {};
      const id = d && d.endpoint ? await sha(d.endpoint) : null;
      if (id && DB.stub) await DB.stub.togli([id]);
      else if (id && subs[id]) { delete subs[id]; await DB.put("subs", JSON.stringify(subs)); }
      return json({ ok: true });
    }
    if (url.pathname === "/test" && req.method === "POST") {
      if (troppi(req, 5)) return json({ ok: false, err: "troppe richieste" }, 429);
      const d = await req.json().catch(() => null);
      const subs = (await DB.get("subs", "json")) || {};
      const id = d && d.endpoint ? await sha(d.endpoint) : null;
      if (!id || !subs[id]) return json({ ok: false, err: "iscrizione non trovata" }, 404);
      const st = await invia(env, await vapid(env), subs[id].sub, { title: SIMBOLO.test + "AuraPitch", body: "Notifiche attive: ti avviso di gol e risultati delle tue preferite.", tag: "test", tipo: "test", url: "./" });
      return json({ ok: st < 300, status: st });
    }
    if (url.pathname === "/diagnosi") {
      // controllo senza dati personali: solo conteggi e stato del servizio
      const subs = (await DB.get("subs", "json")) || {};
      const state = (await DB.get("state", "json")) || {};
      return json({
        iscrizioni: Object.keys(subs).length, partite_seguite: new Set(Object.values(subs).flatMap((x) => (x.follow || []).map((f) => f.lgE + "/" + f.eid))).size,
        sicurezza: DB.stub ? (await DB.get("sic:" + new Date().toISOString().slice(0, 10), "json")) || {} : null,
        stato_partite: Object.keys(state).length, archivio: DB.stub ? { tipo: "database", chiavi: await DB.stub.conta(), migrazione: (await DB.get("_migrato")) ? "fatta" : "in corso" } : "KV", orologio: (await DB.get("orologio", "json")) || null, vapid: !!(await env.KV.get("vapid")),
      });
    }
    // sondaggio "chi vince?": un voto per dispositivo (impronta anonima dal browser), chiuso al calcio d'inizio dall'app
    if (url.pathname === "/voti") {
      const id = String(url.searchParams.get("id") || "");
      if (!/^[A-Za-z0-9_-]{1,40}$/.test(id)) return json({ ok: false }, 400);
      return json({ ok: true, v: (await DB.get("v:" + id, "json")) || [0, 0, 0] });
    }
    if (url.pathname === "/voto" && req.method === "POST") {
      const d = await req.json().catch(() => null);
      const id = d && String(d.id || ""), s = d && Number(d.s), chi = d && String(d.chi || "");
      if (!/^[A-Za-z0-9_-]{1,40}$/.test(id) || ![0, 1, 2].includes(s) || !/^[a-z0-9]{8,40}$/.test(chi)) return json({ ok: false }, 400);
      if (troppi(req)) return json({ ok: false, err: "troppi voti, riprova tra un minuto" }, 429);
      const G0 = await giornata();
      if (!G0) return json({ ok: false, err: "servizio momentaneamente non disponibile" }, 503);
      const mt = G0.matches.find((x) => x.id === id);
      // si vota solo su partite note e non ancora iniziate
      if (!mt) return json({ ok: false, err: "partita sconosciuta" }, 404);
      if (mt.st !== "NS" || Date.parse(mt.ko) <= Date.now()) return json({ ok: false, err: "votazione chiusa" }, 409);
      const meta = { t: Date.now(), k: mt.ko, d: mt.date, p: mt.mk || mt.p || null, ia: mt.p ? mt.p.indexOf(Math.max(...mt.p)) : null };
      if (DB.stub) return json({ ok: true, v: await DB.stub.voto(id, chi, s, meta) });
      const k = "v:" + id;
      const v = (await DB.get(k, "json")) || [0, 0, 0];
      const u = (await DB.get("u:" + chi, "json")) || { nome: "", gruppi: [], voti: {} };
      const prima = u.voti[id] ? u.voti[id].s : null;
      if (prima === s) return json({ ok: true, v }); // nessun cambiamento: nessuna scrittura
      u.voti[id] = { s, t: Date.now(), k: mt.ko, d: mt.date, p: mt.mk || mt.p || null, ia: mt.p ? mt.p.indexOf(Math.max(...mt.p)) : null };
      if (prima != null) v[prima] = Math.max(0, v[prima] - 1);
      v[s] += 1;
      await DB.put("u:" + chi, JSON.stringify(u));
      await DB.put(k, JSON.stringify(v), { expirationTtl: 60 * 60 * 24 * 21 });
      return json({ ok: true, v });
    }
    // ---------- gara dei pronostici ----------
    const okChi = (c) => /^[a-z0-9]{8,40}$/.test(String(c || ""));
    if (url.pathname === "/profilo" && req.method === "POST") {
      const d = await req.clone().json().catch(() => null);
      if (!d || !okChi(d.chi)) return json({ ok: false }, 400);
      if (typeof d.nome === "string") {
        const u = (await DB.get("u:" + d.chi, "json")) || { nome: "", gruppi: [], voti: {} };
        const nome = d.nome.replace(/[^\p{L}\p{N} ._-]/gu, "").trim().slice(0, 20);
        if (nome !== u.nome || !(await DB.get("u:" + d.chi))) { u.nome = nome; await DB.put("u:" + d.chi, JSON.stringify(u)); }
        return json({ ok: true, u: { nome: u.nome, gruppi: u.gruppi } });
      }
    }
    if (url.pathname === "/profilo") {
      if (troppi(req, 40)) return json({ ok: false, err: "troppe richieste" }, 429);
      // lettura: il codice arriva nel corpo (POST) per non finire nei registri; GET resta per le versioni vecchie dell'app
      const chi = req.method === "POST" ? ((await req.clone().json().catch(() => null)) || {}).chi : url.searchParams.get("chi");
      if (!okChi(chi)) return json({ ok: false }, 400);
      const u = await DB.get("u:" + chi, "json");
      if (!u) return json({ ok: false, err: "codice non trovato" }, 404);
      const gr = await Promise.all((u.gruppi || []).map(async (g) => ({ code: g, ...((await DB.get("g:" + g, "json")) || {}) })));
      return json({ ok: true, u: { nome: u.nome, gruppi: gr.map((g) => ({ code: g.code, nome: g.nome, n: (g.membri || []).length })), voti: Object.fromEntries(Object.entries(u.voti || {}).map(([k, v]) => [k, v.s])) } });
    }
    if (url.pathname === "/gruppo" && req.method === "POST") {
      if (troppi(req, 15)) return json({ ok: false, err: "troppe richieste" }, 429);
      const d = await req.json().catch(() => null);
      if (!d || !okChi(d.chi)) return json({ ok: false }, 400);
      const u = (await DB.get("u:" + d.chi, "json")) || { nome: "", gruppi: [], voti: {} };
      let code = String(d.code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
      let g;
      if (d.azione === "crea") {
        code = Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[b % 32]).join("");
        g = { nome: String(d.nome || "Gruppo").replace(/[^\p{L}\p{N} ._-]/gu, "").trim().slice(0, 24) || "Gruppo", membri: [] };
      } else {
        g = await DB.get("g:" + code, "json");
        if (!g) return json({ ok: false, err: "gruppo non trovato" }, 404);
      }
      if (d.azione === "esci") { g.membri = g.membri.filter((x) => x !== d.chi); u.gruppi = u.gruppi.filter((x) => x !== code); }
      else { if (!g.membri.includes(d.chi)) { if (g.membri.length >= 50) return json({ ok: false, err: "gruppo pieno" }, 409); g.membri.push(d.chi); } if (!u.gruppi.includes(code)) u.gruppi.push(code); }
      await DB.put("g:" + code, JSON.stringify(g));
      await DB.put("u:" + d.chi, JSON.stringify(u));
      return json({ ok: true, code, nome: g.nome });
    }
    if (url.pathname === "/classifica") {
      const q = req.method === "POST" ? (await req.json().catch(() => null)) || {} : Object.fromEntries(url.searchParams);
      if (troppi(req, 40)) return json({ ok: false, err: "troppe richieste" }, 429);
      const chi = q.chi, code = String(q.gruppo || "").toUpperCase(), per = q.periodo || "settimana";
      if (!okChi(chi)) return json({ ok: false }, 400);
      // risultati: archivio "ris" aggiornato con le partite finite del file dell'app
      const ris = (await DB.get("ris", "json")) || {};
      const G1 = await giornata();
      let nuovi = false;
      for (const m of (G1 && G1.matches) || []) if (m.st === "FT" && m.g && !ris[m.id]) { ris[m.id] = [m.g[0] > m.g[1] ? 0 : m.g[0] === m.g[1] ? 1 : 2, m.date]; nuovi = true; }
      if (nuovi) { // archivio dei risultati: si tengono gli ultimi 120 giorni
        const lim = new Date(Date.now() - 120 * 86400000).toISOString().slice(0, 10);
        for (const id of Object.keys(ris)) if (ris[id][1] < lim) delete ris[id];
        await DB.put("ris", JSON.stringify(ris));
      }
      const lun = new Date(); lun.setUTCHours(0, 0, 0, 0); lun.setUTCDate(lun.getUTCDate() - ((lun.getUTCDay() + 6) % 7));
      const lunPrima = new Date(lun.getTime() - 7 * 86400000);
      const da = per === "settimana" ? lun.toISOString().slice(0, 10) : per === "scorsa" ? lunPrima.toISOString().slice(0, 10) : "0000";
      const a_ = per === "scorsa" ? lun.toISOString().slice(0, 10) : "9999";
      const punteggio = (u) => {
        let pt = 0, giuste = 0, giocate = 0, ia = 0, iaG = 0;
        for (const [id, v] of Object.entries(u.voti || {})) {
          const r = ris[id];
          if (!r || r[1] < da || r[1] >= a_) continue;
          if (v.t && v.k && v.t >= Date.parse(v.k)) continue; // voto arrivato dopo il calcio d'inizio: non conta
          giocate++;
          if (v.s === r[0]) { giuste++; pt += 3 + (v.p && v.p[v.s] < 0.3 ? 2 : 0); }
          if (v.ia != null) { iaG++; if (v.ia === r[0]) ia++; }
        }
        return { pt, giuste, giocate, ia, iaG };
      };
      const io = (await DB.get("u:" + chi, "json")) || { nome: "", voti: {} };
      let membri = [];
      if (code) {
        const g = await DB.get("g:" + code, "json");
        if (!g || !g.membri.includes(chi)) return json({ ok: false, err: "non sei nel gruppo" }, 403);
        membri = await Promise.all(g.membri.map(async (c) => ({ c, u: (await DB.get("u:" + c, "json")) || { nome: "", voti: {} } })));
      }
      const righe = membri.map(({ c, u }) => ({ nome: u.nome || "Anonimo", io: c === chi, ...punteggio(u) })).sort((a, b) => b.pt - a.pt || b.giuste - a.giuste);
      return json({ ok: true, io: { nome: io.nome, ...punteggio(io) }, righe, da });
    }
    // ---------- sincronizzazione tra dispositivi (codice personale) ----------
    if (url.pathname === "/sync" && req.method === "POST") {
      const d = await req.json().catch(() => null);
      if (troppi(req, 30)) return json({ ok: false, err: "troppe richieste" }, 429);
      if (d && okChi(d.chi) && d.leggi) return json({ ok: true, dati: (await DB.get("s:" + d.chi, "json")) || null });
      if (!d || !okChi(d.chi) || typeof d.dati !== "object") return json({ ok: false }, 400);
      if (troppi(req, 6)) return json({ ok: false, err: "troppe richieste" }, 429);
      const txt = JSON.stringify(d.dati);
      if (txt.length > 200000) return json({ ok: false, err: "troppi dati" }, 413);
      await DB.put("s:" + d.chi, txt);
      return json({ ok: true });
    }
    if (url.pathname === "/stato") return json({ orologio: (await DB.get("orologio", "json")) || null, token: !!env.GH_TOKEN });
    if (url.pathname === "/") return json({ ok: true, servizio: "AuraPitch notifiche" });
    return json({ ok: false }, 404);
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(Promise.all([controlla(env), orologio(env), migraDaKV(env).catch(() => null),
      env.ARCH && new Date().getUTCMinutes() === 0 ? archivio(env).stub.pulisci() : null,
      env.ARCH && new Date().getUTCHours() === 3 && new Date().getUTCMinutes() === 0 ? pulisciInattivi(archivio(env)).catch(() => 0) : null]));
  },
};
