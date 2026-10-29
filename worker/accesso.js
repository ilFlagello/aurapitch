/* AuraPitch - account, accesso, recensioni e statistiche anonime (parte del servizio su Cloudflare).

   Principi:
   - Dati minimi: da Google chiediamo solo "openid" (un identificativo anonimo, niente email, nome o foto) e lo salviamo
     solo cifrato con una chiave segreta del servizio (HMAC), quindi nemmeno l'archivio contiene l'identificativo vero.
   - Passkey (Face ID, Touch ID, impronta, PIN del telefono): il servizio conserva solo la chiave pubblica.
   - Sessioni: un gettone casuale da 256 bit che resta sul telefono; nell'archivio c'e solo la sua impronta (SHA-256).
   - Ogni sfida (Google o passkey) vale una volta sola e scade in 10 minuti.
   - Esporta ed elimina: l'utente scarica tutto quello che il servizio sa di lui o lo cancella con un tocco.
   - Recensioni e statistiche d'uso: anonime, mai collegate all'account; le statistiche sono solo conteggi giornalieri. */

const enc = new TextEncoder();
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (s) => { s = String(s || "").replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "="; return Uint8Array.from(atob(s), (c) => c.charCodeAt(0)); };
const cat = (...a) => { const out = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of a) { out.set(x, i); i += x.length; } return out; };
const casuale = (n) => b64u(crypto.getRandomValues(new Uint8Array(n)));
const sha256 = async (b) => new Uint8Array(await crypto.subtle.digest("SHA-256", typeof b === "string" ? enc.encode(b) : b));
const uguali = (a, b) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i]; return d === 0; };

export const ORIGINI = ["https://ilflagello.github.io"];
export const RP_ID = "ilflagello.github.io";
const DURATA_SESSIONE = 180 * 86400; // secondi
const MAX_SESSIONI = 15;
const EVENTI = new Set(["apertura", "nuovo", "partita", "schedina_ia", "schedina_esito", "campionati", "club", "schedina", "gara_voto", "notifiche_on", "immagine", "calendario",
  "accesso_google", "accesso_passkey", "account_nuovo", "recensione", "condividi", "glossario", "giorno_1", "giorno_2_7", "giorno_8_30", "giorno_30p", "installata"]);

/* ---------- utilità comuni ---------- */
async function corpo(req, max = 20000) {
  const t = await req.text();
  if (t.length > max) return null;
  try { return JSON.parse(t); } catch (e) { return null; }
}
async function pepe(env) { // chiave segreta del servizio, creata alla prima richiesta e mai mostrata
  let p = await env.KV.get("pepe");
  if (!p) { p = casuale(32); await env.KV.put("pepe", p); }
  return p;
}
async function hmac(env, testo) {
  const k = await crypto.subtle.importKey("raw", unb64u(await pepe(env)), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64u(await crypto.subtle.sign("HMAC", k, enc.encode(testo))).slice(0, 32);
}
const impronta = async (token) => b64u(await sha256(token)).slice(0, 32);

/* ---------- firma dei processi automatici (cassaforte): HMAC-SHA256 di "ts\npercorso\nsha256(corpo)" ---------- */
export async function firmaValida(req, env, corpoTxt) {
  if (!env.GH_TOKEN) return false;
  const [ts, sig] = String(req.headers.get("X-Firma") || "").split(".");
  if (!/^\d{10}$/.test(ts || "") || Math.abs(Date.now() / 1000 - Number(ts)) > 300 || !sig) return false;
  const k = await crypto.subtle.importKey("raw", enc.encode(env.GH_TOKEN), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const corpoH = b64u(await sha256(corpoTxt));
  try { return await crypto.subtle.verify("HMAC", k, unb64u(sig), enc.encode(ts + "\n" + new URL(req.url).pathname + "\n" + corpoH)); } catch (e) { return false; }
}

/* ---------- sfide monouso ---------- */
async function nuovaSfida(DB, extra = {}) {
  const s = casuale(32);
  await DB.put("sf:" + s, JSON.stringify({ t: Date.now(), ...extra }), { expirationTtl: 600 });
  return s;
}
async function usaSfida(DB, s) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(String(s || ""))) return null;
  const v = await DB.get("sf:" + s, "json");
  if (!v) return null;
  await DB.delete("sf:" + s);
  return Date.now() - v.t < 600000 ? v : null;
}

/* ---------- Google: verifica dell'ID token (firma RS256 con le chiavi pubbliche di Google) ---------- */
export async function verificaGoogle(idToken, clientId, nonce, chiavi) {
  const p = String(idToken || "").split(".");
  if (p.length !== 3) return { err: "token non valido" };
  let h, c;
  try { h = JSON.parse(new TextDecoder().decode(unb64u(p[0]))); c = JSON.parse(new TextDecoder().decode(unb64u(p[1]))); } catch (e) { return { err: "token illeggibile" }; }
  if (h.alg !== "RS256") return { err: "algoritmo non ammesso" };
  const jwk = (chiavi || []).find((k) => k.kid === h.kid);
  if (!jwk) return { err: "chiave sconosciuta" };
  const key = await crypto.subtle.importKey("jwk", { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true }, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, unb64u(p[2]), enc.encode(p[0] + "." + p[1]));
  if (!ok) return { err: "firma non valida" };
  const ora = Date.now() / 1000;
  if (!["accounts.google.com", "https://accounts.google.com"].includes(c.iss)) return { err: "emittente non valido" };
  if (c.aud !== clientId) return { err: "token per un'altra app" };
  if (!(c.exp > ora - 60) || !(c.iat < ora + 300)) return { err: "token scaduto" };
  if (!nonce || c.nonce !== nonce) return { err: "sfida non corrispondente" };
  if (!c.sub) return { err: "token senza identificativo" };
  return { sub: String(c.sub) };
}
async function chiaviGoogle() {
  const r = await fetch("https://www.googleapis.com/oauth2/v3/certs", { cf: { cacheTtl: 3600, cacheEverything: true } });
  return r.ok ? (await r.json()).keys : [];
}

/* ---------- passkey (WebAuthn): verifica senza librerie ---------- */
function leggiAuthData(ad) {
  if (ad.length < 37) return null;
  const fl = ad[32];
  return { rpIdHash: ad.slice(0, 32), up: !!(fl & 1), uv: !!(fl & 4), conta: (ad[33] << 24 | ad[34] << 16 | ad[35] << 8 | ad[36]) >>> 0 };
}
function derInRaw(der) { // firma ECDSA da DER (come la dà il telefono) a r||s (come la vuole WebCrypto)
  if (der.length === 64) return der;
  let i = 2;
  if (der[1] & 0x80) i += der[1] & 0x7f;
  const parte = () => { if (der[i++] !== 2) throw new Error("der"); const n = der[i++]; let x = der.slice(i, i + n); i += n; while (x.length > 32 && x[0] === 0) x = x.slice(1); return cat(new Uint8Array(32 - x.length), x); };
  return cat(parte(), parte());
}
export async function verificaClientData(cdj, tipo, sfida, origini = ORIGINI) {
  let cd;
  try { cd = JSON.parse(new TextDecoder().decode(cdj)); } catch (e) { return "dati del telefono illeggibili"; }
  if (cd.type !== tipo) return "tipo di operazione errato";
  if (cd.challenge !== sfida) return "sfida non corrispondente";
  if (!origini.includes(cd.origin)) return "sito non autorizzato";
  return null;
}
export async function verificaRegistrazione(d, sfida, rpId = RP_ID, origini = ORIGINI) {
  const cdj = unb64u(d.clientDataJSON), ad = unb64u(d.authenticatorData);
  const e = await verificaClientData(cdj, "webauthn.create", sfida, origini);
  if (e) return { err: e };
  const a = leggiAuthData(ad);
  if (!a || !uguali(a.rpIdHash, await sha256(rpId))) return { err: "passkey per un altro sito" };
  if (!a.up || !a.uv) return { err: "serve la conferma con Face ID, impronta o PIN" };
  const alg = Number(d.alg);
  if (![-7, -257].includes(alg)) return { err: "tipo di chiave non supportato" };
  try { // la chiave pubblica deve essere valida
    await crypto.subtle.importKey("spki", unb64u(d.publicKey), alg === -7 ? { name: "ECDSA", namedCurve: "P-256" } : { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  } catch (err) { return { err: "chiave pubblica non valida" }; }
  if (!/^[A-Za-z0-9_-]{16,700}$/.test(String(d.id || ""))) return { err: "identificativo della passkey non valido" };
  return { id: d.id, spki: d.publicKey, alg, conta: a.conta };
}
export async function verificaAccesso(d, sfida, pk, rpId = RP_ID, origini = ORIGINI) {
  const cdj = unb64u(d.clientDataJSON), ad = unb64u(d.authenticatorData);
  const e = await verificaClientData(cdj, "webauthn.get", sfida, origini);
  if (e) return { err: e };
  const a = leggiAuthData(ad);
  if (!a || !uguali(a.rpIdHash, await sha256(rpId))) return { err: "passkey per un altro sito" };
  if (!a.up || !a.uv) return { err: "serve la conferma con Face ID, impronta o PIN" };
  const dati = cat(ad, await sha256(cdj));
  let ok = false;
  try {
    if (pk.alg === -7) {
      const k = await crypto.subtle.importKey("spki", unb64u(pk.spki), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
      ok = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, k, derInRaw(unb64u(d.signature)), dati);
    } else {
      const k = await crypto.subtle.importKey("spki", unb64u(pk.spki), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
      ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", k, unb64u(d.signature), dati);
    }
  } catch (err) { ok = false; }
  if (!ok) return { err: "firma della passkey non valida" };
  if (a.conta && pk.conta && a.conta <= pk.conta) return { err: "passkey copiata o riutilizzata" };
  return { conta: a.conta };
}

/* ---------- account e sessioni ---------- */
const okChi = (c) => /^[a-z0-9]{8,40}$/.test(String(c || ""));
const nuovoChi = () => Array.from(crypto.getRandomValues(new Uint8Array(20)), (b) => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36]).join("");

async function sessione(req, DB) {
  const h = req.headers.get("Authorization") || "";
  const m = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(h);
  if (!m) return null;
  const s = await DB.get("ses:" + (await impronta(m[1])), "json");
  if (!s || s.exp < Date.now()) return null;
  const a = await DB.get("a:" + s.aid, "json");
  return a ? { aid: s.aid, a, imp: await impronta(m[1]) } : null;
}
async function apriSessione(DB, aid, a, metodo) {
  const token = casuale(32), imp = await impronta(token);
  await DB.put("ses:" + imp, JSON.stringify({ aid, exp: Date.now() + DURATA_SESSIONE * 1000 }), { expirationTtl: DURATA_SESSIONE });
  a.ses = [...(a.ses || []), imp];
  while (a.ses.length > MAX_SESSIONI) await DB.delete("ses:" + a.ses.shift()); // le sessioni piu vecchie si chiudono
  a.ultimo = Date.now();
  a.metodi = { ...(a.metodi || {}), [metodo]: true };
  await DB.put("a:" + aid, JSON.stringify(a));
  return token;
}
// PRO regalato con un codice invito (o, in futuro, pagato): vale se non ha scadenza o se la scadenza e nel futuro
const proValido = (a) => (a.pro && (!a.pro.fino || a.pro.fino > Date.now()) ? { piano: a.pro.piano, fino: a.pro.fino || null } : null);
function pubblico(a) {
  return { creato: a.t0, chi: a.chi, google: !!a.g, passkey: (a.pk || []).map((p) => ({ id: p.id.slice(0, 8), t: p.t, nome: p.nome || "" })), admin: !!a.admin, sessioni: (a.ses || []).length, pro: proValido(a) };
}
const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // senza 0/O e 1/I: si leggono e si dettano senza errori
const nuovoInvito = () => "AP-" + Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => ALFABETO[b % 32]).join("").replace(/^(.{4})/, "$1-");
const okInvito = (c) => /^AP-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(c);
// il codice personale del telefono (gara, preferite sincronizzate) passa all'account: cosi i dati seguono l'utente su ogni dispositivo
async function collegaChi(DB, a, chiTelefono) {
  if (!a.chi) a.chi = okChi(chiTelefono) ? chiTelefono : nuovoChi();
  return a.chi;
}

async function eliminaTutto(DB, aid, a) {
  for (const imp of a.ses || []) await DB.delete("ses:" + imp);
  for (const p of a.pk || []) await DB.delete("pk:" + p.id);
  if (a.g) await DB.delete("gs:" + a.g);
  if (a.chi) {
    const u = await DB.get("u:" + a.chi, "json");
    for (const code of (u && u.gruppi) || []) {
      const g = await DB.get("g:" + code, "json");
      if (g) { g.membri = (g.membri || []).filter((x) => x !== a.chi); await DB.put("g:" + code, JSON.stringify(g)); }
    }
    await DB.delete("u:" + a.chi);
    await DB.delete("s:" + a.chi);
  }
  await DB.delete("a:" + aid);
}

// account non usati da 24 mesi: cancellati del tutto (una volta al giorno, alle 3:00 UTC)
export async function pulisciInattivi(DB) {
  if (!DB.stub) return 0;
  const limite = Date.now() - 730 * 86400000;
  let n = 0;
  for (const [k, v] of await DB.stub.lista("a:", 2000)) {
    const a = JSON.parse(v);
    if ((a.ultimo || a.t0 || 0) < limite) { await eliminaTutto(DB, k.slice(2), a); n++; }
  }
  return n;
}

/* ---------- gestione delle richieste: restituisce una Response o null (= non e una rotta di questo modulo) ---------- */
export async function gestisci(req, url, env, DB, json, troppi, segnala = () => {}) {
  const p = url.pathname;
  if (!p.startsWith("/auth/") && !p.startsWith("/account/") && !p.startsWith("/admin/") && p !== "/feedback" && p !== "/evento") return null;
  const origini = env.ORIGINI ? String(env.ORIGINI).split(",") : ORIGINI;
  const rpId = env.RP_ID || RP_ID;

  if (p === "/auth/config") return json({ ok: true, google: env.GOOGLE_CLIENT_ID || null, rp: rpId });

  // statistiche anonime: solo conteggi del giorno, nessun identificativo (accetta anche sendBeacon, testo semplice)
  if (p === "/evento" && req.method === "POST") {
    if (troppi(req, 30) || !DB.stub) return json({ ok: false }, 429);
    const d = await corpo(req, 3000);
    const ev = d && typeof d.ev === "object" ? d.ev : null;
    if (!ev) return json({ ok: false }, 400);
    const campi = {};
    for (const [k, v] of Object.entries(ev).slice(0, 25)) if (EVENTI.has(k)) campi[k] = Math.max(0, Math.min(50, Math.floor(Number(v) || 0)));
    if (Object.keys(campi).length) await DB.stub.incr("st:" + new Date().toISOString().slice(0, 10), campi, 400 * 86400);
    return json({ ok: true });
  }
  // recensione: anonima (non collegata all'account), testo ripulito, si conserva al massimo 400 giorni
  if (p === "/feedback" && req.method === "POST") {
    if (troppi(req, 4) || !DB.stub) return json({ ok: false, err: "troppe richieste, riprova tra un minuto" }, 429);
    const d = await corpo(req, 6000);
    const voto = d && Number(d.voto);
    const testo = String((d && d.testo) || "").replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "").trim().slice(0, 1500);
    if (!(voto >= 1 && voto <= 5) && !testo) return json({ ok: false, err: "scrivi qualcosa o dai un voto" }, 400);
    const r = { t: Date.now(), voto: voto >= 1 && voto <= 5 ? Math.round(voto) : null, testo, dove: String((d && d.dove) || "").replace(/[^a-z0-9 _-]/gi, "").slice(0, 30),
      v: String((d && d.v) || "").replace(/[^0-9a-z.-]/gi, "").slice(0, 20), tipo: ["idea", "problema", "altro"].includes(d && d.tipo) ? d.tipo : "altro" };
    await DB.put("fb:" + Date.now().toString(36) + "-" + casuale(4), JSON.stringify(r), { expirationTtl: 400 * 86400 });
    return json({ ok: true });
  }

  if (troppi(req, 20)) return json({ ok: false, err: "troppe richieste, riprova tra un minuto" }, 429);
  if (!DB.stub) return json({ ok: false, err: "servizio non pronto" }, 503);

  if (p === "/auth/sfida" && req.method === "POST") {
    const d = (await corpo(req, 500)) || {};
    const s = await sessione(req, DB);
    // per creare una passkey nuova si prepara gia l'identificativo dell'account (se l'utente e entrato, quello suo)
    const aid = d.tipo === "registra" ? (s ? s.aid : casuale(16)) : null;
    // Google: la conferma arriva in una finestra a parte (su iPhone ha un archivio diverso dall'app installata), quindi
    // l'app ritira l'accesso con un secondo codice che non lascia mai il telefono
    const ritiro = d.tipo === "google" ? casuale(32) : null;
    const sfida = await nuovaSfida(DB, { tipo: d.tipo || "", aid, rh: ritiro ? await impronta(ritiro) : null });
    return json({ ok: true, sfida, aid, ritiro, rp: rpId });
  }

  if (p === "/auth/google" && req.method === "POST") { // chiamato dalla pagina di ritorno da Google
    if (!env.GOOGLE_CLIENT_ID) return json({ ok: false, err: "accesso con Google non ancora configurato" }, 503);
    const d = await corpo(req, 8000);
    const sf = d && (await usaSfida(DB, d.sfida));
    if (!sf || sf.tipo !== "google" || !sf.rh) return json({ ok: false, err: "richiesta scaduta, riprova dall'app" }, 400);
    const v = await verificaGoogle(d.id_token, env.GOOGLE_CLIENT_ID, d.sfida, env.CHIAVI_GOOGLE_PROVA || (await chiaviGoogle()));
    if (v.err) { segnala("google_rifiutato"); return json({ ok: false, err: v.err }, 401); }
    await DB.put("rit:" + d.sfida, JSON.stringify({ g: await hmac(env, "google:" + v.sub), rh: sf.rh }), { expirationTtl: 600 });
    return json({ ok: true });
  }

  if (p === "/auth/ritira" && req.method === "POST") { // l'app ritira l'accesso confermato da Google
    const d = (await corpo(req, 1000)) || {};
    if (!/^[A-Za-z0-9_-]{43}$/.test(String(d.sfida || "")) || !/^[A-Za-z0-9_-]{43}$/.test(String(d.ritiro || ""))) return json({ ok: false }, 400);
    const r = await DB.get("rit:" + d.sfida, "json");
    if (!r) return json({ ok: true, pronto: false });
    if (!uguali(enc.encode(r.rh), enc.encode(await impronta(d.ritiro)))) { segnala("ritiro_errato"); return json({ ok: false, err: "codice di ritiro errato" }, 403); }
    await DB.delete("rit:" + d.sfida);
    let aid = await DB.get("gs:" + r.g), a, nuovo = false;
    const s = await sessione(req, DB);
    if (s && !aid) { aid = s.aid; a = s.a; } // gia dentro con una passkey: Google si aggiunge allo stesso account
    else if (aid) a = await DB.get("a:" + aid, "json");
    if (!aid || !a) { aid = casuale(16); a = { t0: Date.now() }; nuovo = true; }
    a.g = r.g;
    await DB.put("gs:" + r.g, aid);
    await collegaChi(DB, a, d.chi);
    const token = await apriSessione(DB, aid, a, "google");
    return json({ ok: true, pronto: true, token, nuovo, account: pubblico(a) });
  }

  if (p === "/auth/passkey/registra" && req.method === "POST") {
    const d = await corpo(req, 12000);
    const sf = d && (await usaSfida(DB, d.sfida));
    if (!sf || sf.tipo !== "registra" || !sf.aid) return json({ ok: false, err: "richiesta scaduta, riprova" }, 400);
    const v = await verificaRegistrazione(d, d.sfida, rpId, origini);
    if (v.err) { segnala("passkey_rifiutata"); return json({ ok: false, err: v.err }, 401); }
    if (await DB.get("pk:" + v.id)) return json({ ok: false, err: "passkey gia registrata" }, 409);
    let a = await DB.get("a:" + sf.aid, "json"), nuovo = false;
    if (a) { const s = await sessione(req, DB); if (!s || s.aid !== sf.aid) return json({ ok: false, err: "accedi prima di aggiungere una passkey" }, 403); }
    else { a = { t0: Date.now() }; nuovo = true; }
    await DB.put("pk:" + v.id, JSON.stringify({ aid: sf.aid, spki: v.spki, alg: v.alg, conta: v.conta }));
    a.pk = [...(a.pk || []), { id: v.id, t: Date.now(), nome: String(d.nome || "").replace(/[^\p{L}\p{N} ._-]/gu, "").slice(0, 30) }].slice(-10);
    await collegaChi(DB, a, d.chi);
    const token = await apriSessione(DB, sf.aid, a, "passkey");
    return json({ ok: true, token, nuovo, account: pubblico(a) });
  }

  if (p === "/auth/passkey/accedi" && req.method === "POST") {
    const d = await corpo(req, 12000);
    const sf = d && (await usaSfida(DB, d.sfida));
    if (!sf || sf.tipo !== "accedi") return json({ ok: false, err: "richiesta scaduta, riprova" }, 400);
    const pk = /^[A-Za-z0-9_-]{16,700}$/.test(String(d.id || "")) ? await DB.get("pk:" + d.id, "json") : null;
    if (!pk) return json({ ok: false, err: "passkey sconosciuta: forse l'account e stato eliminato" }, 404);
    const v = await verificaAccesso(d, d.sfida, pk, rpId, origini);
    if (v.err) { segnala("passkey_rifiutata"); return json({ ok: false, err: v.err }, 401); }
    const a = await DB.get("a:" + pk.aid, "json");
    if (!a) return json({ ok: false, err: "account non trovato" }, 404);
    pk.conta = v.conta;
    await DB.put("pk:" + d.id, JSON.stringify(pk));
    const token = await apriSessione(DB, pk.aid, a, "passkey");
    return json({ ok: true, token, account: pubblico(a) });
  }

  // da qui in poi serve essere dentro
  const s = await sessione(req, DB);
  if (!s) { segnala("sessione_non_valida"); return json({ ok: false, err: "sessione scaduta: accedi di nuovo" }, 401); }
  const { aid, a } = s;

  if (p === "/account/io") return json({ ok: true, account: pubblico(a) });
  if (p === "/account/esci" && req.method === "POST") {
    await DB.delete("ses:" + s.imp);
    a.ses = (a.ses || []).filter((x) => x !== s.imp);
    await DB.put("a:" + aid, JSON.stringify(a));
    return json({ ok: true });
  }
  if (p === "/account/esci-ovunque" && req.method === "POST") {
    for (const imp of a.ses || []) await DB.delete("ses:" + imp);
    a.ses = [];
    await DB.put("a:" + aid, JSON.stringify(a));
    return json({ ok: true });
  }
  if (p === "/account/togli-passkey" && req.method === "POST") {
    const d = (await corpo(req, 500)) || {};
    const resta = (a.pk || []).filter((x) => !x.id.startsWith(String(d.id || "-")));
    if (resta.length === (a.pk || []).length) return json({ ok: false, err: "passkey non trovata" }, 404);
    if (!resta.length && !a.g) return json({ ok: false, err: "e l'unico modo per entrare: aggiungi prima Google o un'altra passkey" }, 409);
    for (const x of a.pk) if (!resta.includes(x)) await DB.delete("pk:" + x.id);
    a.pk = resta;
    await DB.put("a:" + aid, JSON.stringify(a));
    return json({ ok: true, account: pubblico(a) });
  }
  if (p === "/account/togli-google" && req.method === "POST") {
    if (!(a.pk || []).length) return json({ ok: false, err: "e l'unico modo per entrare: aggiungi prima una passkey" }, 409);
    if (a.g) await DB.delete("gs:" + a.g);
    delete a.g;
    if (a.metodi) delete a.metodi.google;
    await DB.put("a:" + aid, JSON.stringify(a));
    return json({ ok: true, account: pubblico(a) });
  }
  if (p === "/account/esporta" && req.method === "POST") {
    // tutto cio che il servizio conserva su questo account, in chiaro (le chiavi di sicurezza restano fuori: non dicono nulla di te)
    const u = a.chi ? await DB.get("u:" + a.chi, "json") : null;
    const sy = a.chi ? await DB.get("s:" + a.chi, "json") : null;
    return json({ ok: true, esportato: new Date().toISOString(), account: { creato: new Date(a.t0).toISOString(), ultimo_accesso: a.ultimo ? new Date(a.ultimo).toISOString() : null,
      accesso_google: !!a.g, passkey: (a.pk || []).map((x) => ({ creata: new Date(x.t).toISOString(), nome: x.nome })), sessioni_aperte: (a.ses || []).length, codice_personale: a.chi },
      gara_pronostici: u, dati_sincronizzati: sy, nota: "Le recensioni e le statistiche d'uso sono anonime: non sono collegate al tuo account." });
  }
  if (p === "/account/elimina" && req.method === "POST") {
    const d = (await corpo(req, 200)) || {};
    if (d.conferma !== "ELIMINA") return json({ ok: false, err: "conferma mancante" }, 400);
    await eliminaTutto(DB, aid, a);
    return json({ ok: true });
  }
  // amministratore: chi conosce il codice segreto (impostato da Andrea nei secret di GitHub) lo diventa con il suo account
  if (p === "/admin/rivendica" && req.method === "POST") {
    if (troppi(req, 3)) return json({ ok: false, err: "troppi tentativi" }, 429);
    const d = (await corpo(req, 500)) || {};
    if (!env.ADMIN_CODE || String(env.ADMIN_CODE).length < 12) return json({ ok: false, err: "codice amministratore non impostato" }, 503);
    if (!uguali(await sha256(String(d.codice || "")), await sha256(String(env.ADMIN_CODE)))) { segnala("admin_errato"); return json({ ok: false, err: "codice errato" }, 403); }
    a.admin = true;
    await DB.put("a:" + aid, JSON.stringify(a));
    return json({ ok: true, account: pubblico(a) });
  }
  // codici invito PRO: li crea l'amministratore dal Pannello beta, l'amico li riscatta con il suo account
  if (p === "/account/riscatta" && req.method === "POST") {
    if (troppi(req, 5)) return json({ ok: false, err: "troppi tentativi, riprova tra un minuto" }, 429);
    const d = (await corpo(req, 300)) || {};
    const codice = String(d.codice || "").toUpperCase().replace(/\s/g, "");
    const inv = okInvito(codice) ? await DB.get("inv:" + codice, "json") : null;
    if (!inv) { segnala("invito_errato"); return json({ ok: false, err: "codice non valido" }, 404); }
    if (inv.usato) return json({ ok: false, err: "codice già usato" }, 409);
    if (inv.revocato) return json({ ok: false, err: "codice non più valido" }, 410);
    const base = proValido(a) && a.pro.fino ? a.pro.fino : Date.now(); // se ha gia un PRO a tempo, si somma
    a.pro = { piano: "invito", fino: inv.mesi ? base + inv.mesi * 30 * 86400000 : null, codice, t: Date.now() };
    inv.usato = { t: Date.now(), aid };
    await DB.put("inv:" + codice, JSON.stringify(inv), { expirationTtl: 2 * 365 * 86400 });
    await DB.put("a:" + aid, JSON.stringify(a));
    return json({ ok: true, account: pubblico(a) });
  }
  if (p === "/admin/inviti" && req.method === "POST") {
    if (!a.admin) return json({ ok: false, err: "solo per l'amministratore" }, 403);
    const d = (await corpo(req, 500)) || {};
    if (d.azione === "crea") {
      const mesi = [0, 1, 3, 6, 12].includes(Number(d.mesi)) ? Number(d.mesi) : 1;
      const nota = String(d.nota || "").replace(/[^\p{L}\p{N} ._-]/gu, "").trim().slice(0, 30);
      const quanti = Math.max(1, Math.min(20, Number(d.quanti) || 1));
      const codici = [];
      for (let i = 0; i < quanti; i++) {
        const c = nuovoInvito();
        await DB.put("inv:" + c, JSON.stringify({ mesi, nota, t: Date.now(), usato: null }), { expirationTtl: 365 * 86400 });
        codici.push(c);
      }
      return json({ ok: true, codici, mesi });
    }
    if (d.azione === "revoca" && okInvito(String(d.codice || ""))) {
      const inv = await DB.get("inv:" + d.codice, "json");
      if (!inv) return json({ ok: false, err: "codice non trovato" }, 404);
      inv.revocato = Date.now();
      if (inv.usato && inv.usato.aid) { // si toglie il PRO regalato a chi l'aveva riscattato
        const b = await DB.get("a:" + inv.usato.aid, "json");
        if (b && b.pro && b.pro.codice === d.codice) { delete b.pro; await DB.put("a:" + inv.usato.aid, JSON.stringify(b)); }
      }
      await DB.put("inv:" + d.codice, JSON.stringify(inv), { expirationTtl: 365 * 86400 });
      return json({ ok: true });
    }
    const lista = (await DB.stub.lista("inv:", 300)).map(([k, v]) => { const x = JSON.parse(v); return { codice: k.slice(4), mesi: x.mesi, nota: x.nota, t: x.t, usato: x.usato ? x.usato.t : null, revocato: x.revocato || null }; }).sort((x, y) => y.t - x.t);
    return json({ ok: true, lista });
  }
  if (p === "/admin/riepilogo") {
    if (!a.admin) return json({ ok: false, err: "solo per l'amministratore" }, 403);
    const fb = (await DB.stub.lista("fb:", 300)).map(([, v]) => JSON.parse(v)).sort((x, y) => y.t - x.t);
    const giorni = [];
    for (let i = 29; i >= 0; i--) {
      const g = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      giorni.push({ g, ...((await DB.get("st:" + g, "json")) || {}) });
    }
    const conti = Object.fromEntries((await DB.stub.conta()).map((r) => [r.p, r.n]));
    const voti = fb.filter((x) => x.voto);
    return json({ ok: true, account: conti["a:"] || 0, passkey: conti["pk:"] || 0, iscrizioni_notifiche: Object.keys((await DB.get("subs", "json")) || {}).length,
      recensioni: { n: fb.length, media: voti.length ? Math.round((voti.reduce((s, x) => s + x.voto, 0) / voti.length) * 10) / 10 : null, lista: fb.slice(0, 150) }, giorni });
  }
  return json({ ok: false }, 404);
}
