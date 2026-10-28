/* AuraPitch - ritorno dall'accesso con Google. Google rimanda qui con un "ID token" nella parte dopo il # dell'indirizzo
   (non arriva mai ai server di GitHub). La pagina lo passa al servizio AuraPitch, che lo verifica e prepara l'accesso;
   l'app lo ritira con un codice che solo lei conosce. Poi l'indirizzo viene ripulito. */
(async function () {
  const $ = (id) => document.getElementById(id);
  const fine = (titolo, testo, ok) => {
    $("titolo").textContent = titolo; $("testo").textContent = testo; $("torna").hidden = false;
    if (ok) { try { if (window.opener) window.opener.dispatchEvent(new Event("ap-google")); } catch (e) { /* altra finestra */ } setTimeout(() => { try { window.close(); } catch (e) { /* niente */ } }, 1500); }
  };
  const h = new URLSearchParams(location.hash.slice(1));
  history.replaceState(null, "", location.pathname); // il token non resta nella cronologia
  const idToken = h.get("id_token"), sfida = h.get("state");
  if (h.get("error")) return fine("Accesso annullato", "Nessun problema: puoi riprovare quando vuoi dall'app.", false);
  if (!idToken || !sfida) return fine("Qualcosa non torna", "Questa pagina serve solo a completare l'accesso con Google dall'app AuraPitch.", false);
  try {
    const { url } = await (await fetch("data/push.json", { cache: "no-store" })).json();
    const r = await (await fetch(url + "/auth/google", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id_token: idToken, sfida }) })).json();
    if (!r.ok) return fine("Accesso non riuscito", (r.err || "Errore") + ". Torna nell'app e riprova.", false);
    fine("Fatto!", "Accesso confermato. Torna su AuraPitch: entri in automatico tra pochi secondi.", true);
  } catch (e) { fine("Nessuna connessione", "Controlla la rete, poi torna nell'app e riprova.", false); }
})();
