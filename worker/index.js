/* AuraPitch - servizio notifiche (Cloudflare Worker).
   Ogni minuto legge i risultati in diretta (ESPN) delle partite seguite dagli utenti e manda una notifica Web Push
   per calcio d'inizio, gol ed esito finale. Le chiavi VAPID vengono create dal servizio stesso e restano nel suo archivio (KV).
   Archivio: "subs" = iscrizioni con le partite seguite; "state" = ultimo stato visto di ogni partita; "vapid" = chiavi. */

const SITE = "https://site.api.espn.com/apis/site/v2/sports/soccer/";
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };
const enc = new TextEncoder();

const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (s) => { s = s.replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "="; return Uint8Array.from(atob(s), (c) => c.charCodeAt(0)); };
const cat = (...a) => { const out = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of a) { out.set(x, i); i += x.length; } return out; };
const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { "Content-Type": "application/json", ...CORS } });

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
  return { st: t.state, half: t.name === "STATUS_HALFTIME", g: [Number(h.score || 0), Number(a.score || 0)], clock: ev.status.displayClock || "", goals, rossi };
}
async function controlla(env) {
  const subs = (await env.KV.get("subs", "json")) || {};
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
  const old = (await env.KV.get("state", "json")) || {};
  const nuovo = {};
  const msgs = [];
  for (const [k, { f, ids }] of Object.entries(follow)) {
    const ev = eventi[k];
    if (!ev) { if (old[k]) nuovo[k] = old[k]; continue; }
    const s = stato(ev), o = old[k];
    nuovo[k] = { st: s.st, g: s.g, half: s.half, rossi: s.rossi.length };
    if (!o) continue; // prima volta che la vediamo: nessun avviso
    const nomi = `${f.h} ${s.g[0]} - ${s.g[1]} ${f.a}`;
    const push = (title, body) => msgs.push({ ids, msg: { title, body, tag: k + "|" + title + "|" + body.length, url: "./" } });
    if (o.st === "pre" && s.st === "in") push("Calcio d'inizio", `${f.h} - ${f.a}`);
    if (s.st !== "pre" && (s.g[0] !== o.g[0] || s.g[1] !== o.g[1])) {
      const piu = s.g[0] + s.g[1] > o.g[0] + o.g[1];
      const last = s.goals[s.goals.length - 1];
      push(piu ? "Gol!" : "Gol annullato", nomi + (last && piu ? ` - ${last.min} ${last.chi}${last.pen ? " (rigore)" : ""}${last.og ? " (autogol)" : ""}` : ""));
    }
    if (s.rossi.length > (o.rossi || 0)) {
      for (const r of s.rossi.slice(o.rossi || 0)) push("Espulsione", `${r.chi} (${r.casa ? f.h : f.a}) al ${r.min} - ${nomi}`);
    }
    if (!o.half && s.half) push("Fine primo tempo", nomi);
    if (o.st === "in" && s.st === "post") push("Finale", nomi);
  }
  if (JSON.stringify(nuovo) !== JSON.stringify(old)) await env.KV.put("state", JSON.stringify(nuovo));
  if (!msgs.length) return "nessuna novità";
  const v = await vapid(env);
  let morte = [];
  for (const { ids, msg } of msgs) {
    await Promise.all(ids.map(async (id) => {
      try { const st = await invia(env, v, subs[id].sub, msg); if (st === 404 || st === 410) morte.push(id); } catch (e) { /* invio non riuscito */ }
    }));
  }
  if (morte.length) { for (const id of morte) delete subs[id]; await env.KV.put("subs", JSON.stringify(subs)); }
  return `${msgs.length} avvisi inviati`;
}

/* ---------- orologio: avvia la raccolta dati su GitHub (gli avvii programmati di GitHub non partono) ----------
   06:00 UTC giro completo; dalle 10:00 alle 23:50 UTC aggiornamento ogni 10 minuti. Serve il secret GH_TOKEN (permesso Actions: scrittura). */
async function orologio(env) {
  if (!env.GH_TOKEN) return "senza token";
  const t = new Date();
  const h = t.getUTCHours(), mi = t.getUTCMinutes();
  let modo = null;
  if (h === 6 && mi < 10) modo = "completo";
  else if (h >= 10 && h <= 23) modo = "live";
  if (!modo) return "fuori orario";
  const slot = t.toISOString().slice(0, 14) + Math.floor(mi / 10);
  const ultimo = (await env.KV.get("orologio", "json")) || {};
  if (ultimo.slot === slot) return "gia avviato";
  const r = await fetch("https://api.github.com/repos/ilFlagello/aurapitch/actions/workflows/raccolta.yml/dispatches", {
    method: "POST",
    headers: { Authorization: "Bearer " + env.GH_TOKEN, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "aurapitch-orologio", "Content-Type": "application/json" },
    body: JSON.stringify({ ref: "main", inputs: { modo } }),
  });
  await env.KV.put("orologio", JSON.stringify({ slot, modo, esito: r.status, t: t.toISOString() }));
  return `${modo}: ${r.status}`;
}

async function sha(s) { return b64u(await crypto.subtle.digest("SHA-256", enc.encode(s))).slice(0, 22); }

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
    if (url.pathname === "/vapid") return json({ key: (await vapid(env)).pub });
    if (url.pathname === "/subscribe" && req.method === "POST") {
      const d = await req.json().catch(() => null);
      if (!d || !d.sub || !d.sub.endpoint || !d.sub.keys) return json({ ok: false, err: "iscrizione non valida" }, 400);
      if (!/^https:\/\/[a-z0-9.-]+(push\.apple\.com|googleapis\.com|mozilla\.com|windows\.com|mozaws\.net)\//.test(d.sub.endpoint)) return json({ ok: false, err: "servizio push non riconosciuto" }, 400);
      const follow = (Array.isArray(d.follow) ? d.follow : []).slice(0, 60).filter((f) => f && /^[a-z0-9._]+$/.test(f.lgE || "") && /^\d+$/.test(String(f.eid || "")))
        .map((f) => ({ lgE: f.lgE, eid: String(f.eid), h: String(f.h || "").slice(0, 40), a: String(f.a || "").slice(0, 40) }));
      const subs = (await env.KV.get("subs", "json")) || {};
      const id = await sha(d.sub.endpoint);
      if (Object.keys(subs).length > 500 && !subs[id]) return json({ ok: false, err: "troppe iscrizioni" }, 429);
      const prima = JSON.stringify(subs[id] || null);
      subs[id] = { sub: { endpoint: d.sub.endpoint, keys: d.sub.keys }, follow, t: Date.now() };
      if (prima !== JSON.stringify(subs[id]) || !subs[id].t0) { subs[id].t0 = (JSON.parse(prima) || {}).t0 || Date.now(); await env.KV.put("subs", JSON.stringify(subs)); }
      return json({ ok: true, seguite: follow.length });
    }
    if (url.pathname === "/unsubscribe" && req.method === "POST") {
      const d = await req.json().catch(() => null);
      const subs = (await env.KV.get("subs", "json")) || {};
      const id = d && d.endpoint ? await sha(d.endpoint) : null;
      if (id && subs[id]) { delete subs[id]; await env.KV.put("subs", JSON.stringify(subs)); }
      return json({ ok: true });
    }
    if (url.pathname === "/test" && req.method === "POST") {
      const d = await req.json().catch(() => null);
      const subs = (await env.KV.get("subs", "json")) || {};
      const id = d && d.endpoint ? await sha(d.endpoint) : null;
      if (!id || !subs[id]) return json({ ok: false, err: "iscrizione non trovata" }, 404);
      const st = await invia(env, await vapid(env), subs[id].sub, { title: "AuraPitch", body: "Notifiche attive: ti avviso di gol e risultati delle tue preferite.", tag: "test", url: "./" });
      return json({ ok: st < 300, status: st });
    }
    if (url.pathname === "/diagnosi") {
      // controllo senza dati sensibili: quante iscrizioni, quali partite seguite, ultimo stato visto
      const subs = (await env.KV.get("subs", "json")) || {};
      const state = (await env.KV.get("state", "json")) || {};
      return json({
        iscrizioni: Object.values(subs).map((x) => ({ servizio: new URL(x.sub.endpoint).host, seguite: (x.follow || []).map((f) => `${f.h}-${f.a} (${f.lgE}/${f.eid})`), aggiornata: new Date(x.t).toISOString() })),
        stato_partite: state, orologio: (await env.KV.get("orologio", "json")) || null, vapid: !!(await env.KV.get("vapid")),
      });
    }
    // sondaggio "chi vince?": un voto per dispositivo (impronta anonima dal browser), chiuso al calcio d'inizio dall'app
    if (url.pathname === "/voti") {
      const id = String(url.searchParams.get("id") || "");
      if (!/^[A-Za-z0-9_-]{1,40}$/.test(id)) return json({ ok: false }, 400);
      return json({ ok: true, v: (await env.KV.get("v:" + id, "json")) || [0, 0, 0] });
    }
    if (url.pathname === "/voto" && req.method === "POST") {
      const d = await req.json().catch(() => null);
      const id = d && String(d.id || ""), s = d && Number(d.s), chi = d && String(d.chi || "");
      if (!/^[A-Za-z0-9_-]{1,40}$/.test(id) || ![0, 1, 2].includes(s) || !/^[a-z0-9]{8,40}$/.test(chi)) return json({ ok: false }, 400);
      const k = "v:" + id, kc = "vc:" + id + ":" + chi;
      const v = (await env.KV.get(k, "json")) || [0, 0, 0];
      const prima = await env.KV.get(kc);
      if (prima !== null && Number(prima) === s) return json({ ok: true, v });
      if (prima !== null) v[Number(prima)] = Math.max(0, v[Number(prima)] - 1);
      v[s] += 1;
      await env.KV.put(k, JSON.stringify(v), { expirationTtl: 60 * 60 * 24 * 21 });
      await env.KV.put(kc, String(s), { expirationTtl: 60 * 60 * 24 * 21 });
      return json({ ok: true, v });
    }
    if (url.pathname === "/stato") return json({ orologio: (await env.KV.get("orologio", "json")) || null, token: !!env.GH_TOKEN });
    if (url.pathname === "/") return json({ ok: true, servizio: "AuraPitch notifiche" });
    return json({ ok: false }, 404);
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(Promise.all([controlla(env), orologio(env)]));
  },
};
