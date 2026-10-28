// Test del modulo account del servizio (node test/test_accesso.mjs): firme delle passkey (ES256 e RS256), token Google,
// percorso completo con un archivio simulato (registrazione, accesso, esporta, elimina), recensioni, statistiche, amministratore.
import { verificaGoogle, verificaRegistrazione, verificaAccesso, gestisci } from "../worker/accesso.js";

const enc = new TextEncoder();
const b64u = (buf) => Buffer.from(buf).toString("base64url");
const S = crypto.subtle;
let errori = 0, prove = 0;
const ok = (c, m) => { prove++; if (!c) { errori++; console.log("ERRORE:", m); } };
const sha = async (x) => new Uint8Array(await S.digest("SHA-256", typeof x === "string" ? enc.encode(x) : x));
const RP = "ilflagello.github.io", ORIG = "https://ilflagello.github.io";

function rawInDer(raw) {
  const int = (x) => { let i = 0; while (i < x.length - 1 && x[i] === 0) i++; x = x.slice(i); if (x[0] & 0x80) x = Buffer.concat([Buffer.from([0]), x]); return Buffer.concat([Buffer.from([2, x.length]), x]); };
  const r = int(Buffer.from(raw.slice(0, 32))), s = int(Buffer.from(raw.slice(32)));
  return Buffer.concat([Buffer.from([0x30, r.length + s.length]), r, s]);
}
async function authData(flags, conta) {
  const c = Buffer.alloc(4); c.writeUInt32BE(conta);
  return Buffer.concat([Buffer.from(await sha(RP)), Buffer.from([flags]), c]);
}
async function telefono(alg) { // un "telefono" finto con la sua passkey
  const kp = alg === -7 ? await S.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])
    : await S.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  const id = b64u(crypto.getRandomValues(new Uint8Array(32)));
  return {
    id, alg,
    async crea(sfida, origin = ORIG) {
      return { id, alg, publicKey: b64u(await S.exportKey("spki", kp.publicKey)), clientDataJSON: b64u(enc.encode(JSON.stringify({ type: "webauthn.create", challenge: sfida, origin }))),
        authenticatorData: b64u(await authData(0x45, 0)), sfida };
    },
    async firma(sfida, conta, origin = ORIG, flags = 0x05) {
      const cdj = enc.encode(JSON.stringify({ type: "webauthn.get", challenge: sfida, origin }));
      const ad = await authData(flags, conta);
      const dati = Buffer.concat([ad, Buffer.from(await sha(cdj))]);
      const sig = alg === -7 ? rawInDer(new Uint8Array(await S.sign({ name: "ECDSA", hash: "SHA-256" }, kp.privateKey, dati))) : Buffer.from(await S.sign("RSASSA-PKCS1-v1_5", kp.privateKey, dati));
      return { id, clientDataJSON: b64u(cdj), authenticatorData: b64u(ad), signature: b64u(sig), sfida };
    },
  };
}

// ---------- passkey ----------
for (const alg of [-7, -257]) {
  const t = await telefono(alg);
  const sf = "x".repeat(43);
  const reg = await verificaRegistrazione(await t.crea(sf), sf);
  ok(!reg.err && reg.alg === alg, `registrazione ${alg}: ${reg.err}`);
  ok((await verificaRegistrazione(await t.crea(sf, "https://sito-falso.example"), sf)).err, `registrazione ${alg}: sito falso accettato`);
  ok((await verificaRegistrazione(await t.crea(sf), "y".repeat(43))).err, `registrazione ${alg}: sfida sbagliata accettata`);
  const pk = { spki: reg.spki, alg: reg.alg, conta: 0 };
  const acc = await verificaAccesso(await t.firma(sf, 1), sf, pk);
  ok(!acc.err && acc.conta === 1, `accesso ${alg}: ${acc.err}`);
  ok((await verificaAccesso(await t.firma(sf, 1, "https://sito-falso.example"), sf, pk)).err, `accesso ${alg}: sito falso accettato`);
  ok((await verificaAccesso(await t.firma(sf, 1, ORIG, 0x01), sf, pk)).err, `accesso ${alg}: senza Face ID/impronta accettato`);
  const altro = await telefono(alg);
  ok((await verificaAccesso(await altro.firma(sf, 1), sf, pk)).err, `accesso ${alg}: firma di un altro telefono accettata`);
  ok((await verificaAccesso(await t.firma(sf, 3), sf, { ...pk, conta: 5 })).err, `accesso ${alg}: contatore all'indietro accettato`);
}

// ---------- Google ----------
const g = await S.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
const jwk = { ...(await S.exportKey("jwk", g.publicKey)), kid: "k1" };
async function idToken(c, kid = "k1", chiave = g.privateKey) {
  const h = b64u(enc.encode(JSON.stringify({ alg: "RS256", kid, typ: "JWT" }))), p = b64u(enc.encode(JSON.stringify(c)));
  return h + "." + p + "." + b64u(await S.sign("RSASSA-PKCS1-v1_5", chiave, enc.encode(h + "." + p)));
}
const ora = Math.floor(Date.now() / 1000), CID = "123-abc.apps.googleusercontent.com";
const base = { iss: "https://accounts.google.com", aud: CID, sub: "1098765", iat: ora, exp: ora + 3600, nonce: "n".repeat(43) };
ok((await verificaGoogle(await idToken(base), CID, base.nonce, [jwk])).sub === "1098765", "Google: token valido rifiutato");
ok((await verificaGoogle(await idToken({ ...base, aud: "altra-app" }), CID, base.nonce, [jwk])).err, "Google: token di un'altra app accettato");
ok((await verificaGoogle(await idToken(base), CID, "m".repeat(43), [jwk])).err, "Google: sfida sbagliata accettata");
ok((await verificaGoogle(await idToken({ ...base, exp: ora - 600 }), CID, base.nonce, [jwk])).err, "Google: token scaduto accettato");
ok((await verificaGoogle(await idToken({ ...base, iss: "https://evil.example" }), CID, base.nonce, [jwk])).err, "Google: emittente falso accettato");
const falsa = await S.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
ok((await verificaGoogle(await idToken(base, "k1", falsa.privateKey), CID, base.nonce, [jwk])).err, "Google: firma falsa accettata");

// ---------- percorso completo con archivio simulato ----------
const mem = new Map();
const DB = {
  get: async (k, t) => { const v = mem.get(k); return v == null ? null : t === "json" ? JSON.parse(v) : v; },
  put: async (k, v) => { mem.set(k, String(v)); },
  delete: async (k) => { mem.delete(k); },
  stub: {
    incr: async (k, campi) => { const v = JSON.parse(mem.get(k) || "{}"); for (const [c, n] of Object.entries(campi)) v[c] = (v[c] || 0) + n; mem.set(k, JSON.stringify(v)); },
    lista: async (p) => [...mem.entries()].filter(([k]) => k.startsWith(p)),
    conta: async () => { const c = {}; for (const k of mem.keys()) { const p = k.split(":")[0] + ":"; c[p] = (c[p] || 0) + 1; } return Object.entries(c).map(([p, n]) => ({ p, n })); },
  },
};
const kv = new Map();
const env = { KV: { get: async (k) => kv.get(k) ?? null, put: async (k, v) => { kv.set(k, v); } }, ADMIN_CODE: "codice-segreto-di-prova-123" };
const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { "Content-Type": "application/json" } });
const troppi = () => false;
async function chiama(path, corpo, token) {
  const req = new Request("https://servizio.example" + path, { method: corpo === undefined ? "GET" : "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) }, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
  const r = await gestisci(req, new URL(req.url), env, DB, json, troppi);
  return r ? { st: r.status, ...(await r.json()) } : null;
}
ok((await chiama("/vapid")) === null, "rotte non sue: il modulo deve lasciarle passare");
const tel = await telefono(-7);
let r = await chiama("/auth/sfida", { tipo: "registra" });
ok(r.ok && r.aid, "sfida per registrare");
const sfReg = r.sfida;
r = await chiama("/auth/passkey/registra", { ...(await tel.crea(r.sfida)), sfida: r.sfida, chi: "abcdefgh12345678", nome: "iPhone" });
ok(r.ok && r.token && r.nuovo && r.account.chi === "abcdefgh12345678", "nuovo account con passkey: " + r.err);
const t1 = r.token;
ok([...mem.keys()].every((k) => !k.includes(t1)), "il gettone di sessione non deve stare in chiaro nell'archivio");
r = await chiama("/auth/passkey/registra", { ...(await (await telefono(-7)).crea(sfReg)), sfida: sfReg });
ok(!r.ok, "sfida monouso: la sfida gia usata non deve creare altro");
r = await chiama("/auth/sfida", { tipo: "accedi" });
const sfA = r.sfida;
r = await chiama("/auth/passkey/accedi", { ...(await tel.firma(sfA, 1)) });
ok(r.ok && r.token, "accesso con passkey: " + r.err);
const t2 = r.token;
r = await chiama("/auth/passkey/accedi", { ...(await tel.firma(sfA, 2)) });
ok(!r.ok, "la stessa sfida non deve valere due volte");
r = await chiama("/account/io", {}, t2);
ok(r.ok && r.account.passkey.length === 1 && r.account.sessioni === 2, "profilo dell'account");
ok((await chiama("/account/io", {}, "A".repeat(43))).st === 401, "gettone inventato rifiutato");
r = await chiama("/auth/google", { id_token: "x", sfida: "y" });
ok(!r.ok && r.st === 503, "Google non configurato: errore chiaro");
// Google: conferma nella finestra a parte, ritiro dall'app con il codice che resta sul telefono; si aggiunge allo stesso account
env.GOOGLE_CLIENT_ID = CID; env.CHIAVI_GOOGLE_PROVA = [jwk];
r = await chiama("/auth/sfida", { tipo: "google" });
const sfG = r.sfida, ritiro = r.ritiro;
ok(r.ok && ritiro, "sfida per Google con codice di ritiro");
ok((await chiama("/auth/ritira", { sfida: sfG, ritiro })).pronto === false, "prima della conferma non c'e nulla da ritirare");
r = await chiama("/auth/google", { id_token: await idToken({ ...base, nonce: sfG }), sfida: sfG });
ok(r.ok, "conferma Google: " + r.err);
ok(!(await chiama("/auth/google", { id_token: await idToken({ ...base, nonce: sfG }), sfida: sfG })).ok, "conferma Google: la stessa sfida non vale due volte");
ok((await chiama("/auth/ritira", { sfida: sfG, ritiro: "Z".repeat(43) })).st === 403, "ritiro con il codice sbagliato rifiutato");
r = await chiama("/auth/ritira", { sfida: sfG, ritiro, chi: "zzzzzzzz00000000" }, t2);
ok(r.ok && r.pronto && r.token && !r.nuovo && r.account.google && r.account.passkey.length === 1 && r.account.chi === "abcdefgh12345678", "Google aggiunto all'account della passkey: " + JSON.stringify(r).slice(0, 200));
ok((await chiama("/auth/ritira", { sfida: sfG, ritiro })).pronto === false, "il ritiro vale una volta sola");
ok(![...mem.keys()].some((k) => k.includes("1098765")) && ![...mem.values()].some((v) => v.includes("1098765")), "l'identificativo Google non deve stare in chiaro nell'archivio");
// stesso utente Google da un altro telefono: ritrova lo stesso account
r = await chiama("/auth/sfida", { tipo: "google" });
const sfG2 = r.sfida, rit2 = r.ritiro;
await chiama("/auth/google", { id_token: await idToken({ ...base, nonce: sfG2 }), sfida: sfG2 });
r = await chiama("/auth/ritira", { sfida: sfG2, ritiro: rit2, chi: "yyyyyyyy11111111" });
ok(r.pronto && !r.nuovo && r.account.chi === "abcdefgh12345678", "Google da un altro telefono: stesso account e stesso codice personale");
ok((await chiama("/account/togli-google", {}, r.token)).ok, "si puo togliere Google se resta la passkey");
ok((await chiama("/admin/riepilogo", {}, t2)).st === 403, "riepilogo vietato a chi non e amministratore");
ok((await chiama("/admin/rivendica", { codice: "sbagliato" }, t2)).st === 403, "codice amministratore sbagliato rifiutato");
ok((await chiama("/admin/rivendica", { codice: env.ADMIN_CODE }, t2)).ok, "codice amministratore giusto");
ok((await chiama("/feedback", { voto: 5, testo: "Bella app!\u0007", dove: "profilo", tipo: "idea" })).ok, "recensione");
ok((await chiama("/feedback", { voto: 9 })).st === 400, "recensione vuota rifiutata");
ok((await chiama("/evento", { ev: { apertura: 1, partita: 3, inventato: 5 } })).ok, "statistiche");
r = await chiama("/admin/riepilogo", {}, t2);
ok(r.ok && r.recensioni.n === 1 && r.recensioni.lista[0].testo === "Bella app!" && r.giorni.at(-1).partita === 3 && !("inventato" in r.giorni.at(-1)) && r.account === 1, "riepilogo amministratore");
mem.set("u:abcdefgh12345678", JSON.stringify({ nome: "Andrea", gruppi: ["GR1"], voti: {} }));
mem.set("g:GR1", JSON.stringify({ nome: "Amici", membri: ["abcdefgh12345678", "altro"] }));
mem.set("s:abcdefgh12345678", JSON.stringify({ fav: ["Inter"] }));
r = await chiama("/account/esporta", {}, t2);
ok(r.ok && r.gara_pronostici.nome === "Andrea" && r.dati_sincronizzati.fav[0] === "Inter" && !JSON.stringify(r).includes("spki"), "esporta i dati");
ok((await chiama("/account/togli-passkey", { id: tel.id.slice(0, 8) }, t2)).st === 409, "non si toglie l'unico modo per entrare");
ok((await chiama("/account/elimina", {}, t2)).st === 400, "eliminazione senza conferma rifiutata");
ok((await chiama("/account/elimina", { conferma: "ELIMINA" }, t2)).ok, "eliminazione");
const resta = [...mem.keys()].filter((k) => /^(a|pk|ses|u|s|gs):/.test(k));
ok(resta.length === 0, "dopo l'eliminazione non deve restare nulla dell'account: " + resta.join(", "));
ok(JSON.parse(mem.get("g:GR1")).membri.join() === "altro", "uscita dai gruppi della gara");
ok((await chiama("/account/io", {}, t1)).st === 401, "dopo l'eliminazione le sessioni non valgono piu");

console.log(`Accesso e account: ${prove} controlli, ${errori} errori`);
process.exit(errori ? 1 : 0);
