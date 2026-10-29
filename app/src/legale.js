/* AuraPitch - informativa privacy e termini d'uso. Un'unica fonte: l'app li mostra in un foglio, build.mjs ne fa anche
   le pagine pubbliche privacy.html e termini.html (servono a Google per la schermata di accesso).
   Quando cambia qualcosa di sostanziale: aggiornare VERSIONE e AGGIORNATA (l'app richiede di nuovo l'accettazione). */

export const TITOLARE = { nome: "", email: "aurapitch.app@gmail.com" }; // nome del titolare: da confermare
export const VERSIONE = 1;
export const AGGIORNATA = "29 ottobre 2026";
const contatto = () => (TITOLARE.email ? TITOLARE.email : "il modulo \"Scrivici\" nel Profilo dell'app");
const titolare = () => (TITOLARE.nome ? `${TITOLARE.nome}${TITOLARE.email ? ", " + TITOLARE.email : ""}` : "il creatore di AuraPitch (dati in aggiornamento)");

export function privacy() {
  return [
    ["In breve", [
      "AuraPitch funziona anche senza account: in quel caso preferenze, diario e schedina restano solo sul tuo telefono.",
      "Niente pubblicità, niente profilazione, niente venduto a nessuno. Non usiamo cookie di profilazione né strumenti di tracciamento di terzi.",
      "Se crei un account non ci servono email, nome o foto: da Google riceviamo solo un identificativo anonimo, e con Face ID o impronta il dato biometrico non lascia mai il tuo telefono.",
      "Puoi scaricare o cancellare tutti i tuoi dati in ogni momento da Il Mio Club, Account.",
    ]],
    ["Chi è il titolare", [`Titolare del trattamento: ${titolare()}. Per qualsiasi richiesta sulla privacy scrivi a ${contatto()}.`]],
    ["Quali dati trattiamo e perché", [
      "Sul telefono (non arrivano a noi): campionati e squadre che segui, tema, diario delle giocate, schedina, limite di spesa. Restano nella memoria del browser finché non li cancelli.",
      "Account (facoltativo). Con Google: un identificativo anonimo che Google assegna alla tua app, salvato da noi solo in forma cifrata (non reversibile). Non chiediamo né riceviamo email, nome o foto. Con passkey (Face ID, Touch ID, impronta o PIN): conserviamo solo la chiave pubblica; l'impronta o il volto restano nel telefono e non ci vengono mai inviati. Per tenerti dentro usiamo un gettone casuale che resta sul telefono: da noi c'è solo la sua impronta crittografica. La sessione dura al massimo 180 giorni.",
      "Copia dei dati e gara dei pronostici (facoltative): il nome che scegli (puoi usare un soprannome), i pronostici, i gruppi di amici, le partite preferite, il diario e la schedina, legati a un codice personale casuale.",
      "Notifiche (solo se le attivi): l'indirizzo di consegna che il tuo browser crea presso Apple, Google o Mozilla, le partite che segui e i tipi di avviso scelti.",
      "Sondaggio \"chi vince\": il tuo voto, conteggiato insieme agli altri.",
      "Recensioni: voto, testo, schermata e versione dell'app. Sono anonime e non collegate all'account: non scrivere dati personali nel testo.",
      "Statistiche d'uso: solo conteggi giornalieri complessivi (per esempio quante volte l'app è stata aperta o quante partite sono state guardate), senza alcun identificativo tuo o del telefono. Puoi spegnerle nel Profilo.",
      "Dati tecnici: per consegnarti l'app e proteggerla dagli abusi, i fornitori di hosting elaborano l'indirizzo IP del tuo collegamento. Il servizio AuraPitch non lo salva: lo usa solo per contare le richieste dell'ultimo minuto.",
    ]],
    ["Basi giuridiche", [
      "Esecuzione del servizio che chiedi (art. 6.1.b GDPR): account, copia dei dati, gara, notifiche.",
      "Legittimo interesse (art. 6.1.f GDPR): sicurezza del servizio, prevenzione degli abusi, statistiche anonime e recensioni per migliorare l'app. Puoi opporti spegnendo le statistiche e non inviando recensioni.",
      "Consenso: le notifiche partono solo dopo il permesso che dai al browser, e puoi ritirarlo quando vuoi.",
    ]],
    ["Fornitori e dove stanno i dati", [
      "Cloudflare, Inc. (servizio AuraPitch e suo archivio) e GitHub, Inc. (pubblicazione dell'app) agiscono come nostri fornitori. Possono trattare dati anche fuori dall'Unione europea, con le garanzie previste dal GDPR (EU-US Data Privacy Framework e clausole contrattuali standard).",
      "Google: solo se scegli \"Continua con Google\". In quel momento parli direttamente con Google, secondo la sua informativa.",
      "Risultati in diretta e meteo arrivano da ESPN e Open-Meteo passando dal servizio AuraPitch, che fa da intermediario: queste fonti non vedono il tuo indirizzo IP. Solo se il servizio AuraPitch non risponde l'app si collega direttamente a loro.",
    ]],
    ["Per quanto tempo", [
      "Account, copia dei dati e gara: finché non elimini l'account; gli account non usati da 24 mesi vengono cancellati automaticamente.",
      "Sessioni: al massimo 180 giorni. Codici di verifica dell'accesso: 10 minuti.",
      "Notifiche: finché non le disattivi o il browser ritira il permesso.",
      "Recensioni e statistiche anonime: al massimo 400 giorni. Voti del sondaggio: 21 giorni.",
    ]],
    ["I tuoi diritti", [
      "Puoi chiedere accesso, rettifica, cancellazione, limitazione, portabilità e opporti al trattamento (artt. 15-22 GDPR).",
      "Senza scrivere a nessuno: in Il Mio Club, Account trovi \"Scarica i miei dati\" (file completo) ed \"Elimina account\" (cancellazione immediata e definitiva).",
      "Se ritieni che il trattamento violi la legge puoi presentare reclamo al Garante per la protezione dei dati personali (garanteprivacy.it).",
    ]],
    ["Minori", ["AuraPitch è riservata ai maggiorenni. Non raccogliamo consapevolmente dati di minori di 18 anni: se ne vieni a conoscenza, scrivici e li cancelliamo."]],
    ["Sicurezza", ["Collegamenti sempre cifrati (HTTPS), nessuna password da rubare, identificativi salvati solo in forma cifrata, limiti alle richieste ripetute, codici di accesso monouso. Nessun sistema è perfetto: se noti qualcosa di strano, scrivici subito."]],
    ["Modifiche", [`Versione ${VERSIONE}, aggiornata il ${AGGIORNATA}. Se cambia qualcosa di importante l'app te lo dice e ti chiede di nuovo di accettare.`]],
  ];
}

export function termini() {
  return [
    ["Che cos'è AuraPitch", ["AuraPitch è un'app gratuita di analisi e intrattenimento sul calcio, in versione di prova (beta). Mostra dati, probabilità stimate e curiosità. Nella beta non ci sono pagamenti reali: le offerte PRO sono solo simulate."]],
    ["Non è un bookmaker", [
      "AuraPitch non accetta scommesse, non gestisce denaro e non è collegata ad alcun concessionario.",
      "Probabilità, consigli e schedine generate dall'IA sono stime statistiche, non certezze né consigli di investimento: nessun risultato è garantito e le quote mostrate possono essere diverse da quelle reali.",
    ]],
    ["Solo maggiorenni e gioco responsabile", [
      "L'app è riservata a chi ha compiuto 18 anni.",
      "Il gioco d'azzardo può causare dipendenza patologica. Se vuoi parlarne con qualcuno: Telefono Verde Nazionale per le problematiche legate al gioco d'azzardo, 800 55 88 22 (Istituto Superiore di Sanità), gratuito e anonimo.",
      "Nell'app puoi fissare un limite di spesa mensile per il tuo diario.",
    ]],
    ["Dati e contenuti", [
      "Risultati, quote, statistiche e notizie provengono da fonti di terzi e possono contenere errori o arrivare in ritardo. Verifica sempre sui canali ufficiali.",
      "Nomi e marchi di squadre, competizioni e bookmaker appartengono ai rispettivi titolari e sono citati solo a scopo informativo.",
    ]],
    ["Uso corretto", ["Non usare l'app per scopi illeciti, non tentare di accedere ad account altrui o di sovraccaricare il servizio, non usare nomi offensivi nella gara dei pronostici. Possiamo rimuovere contenuti o bloccare l'accesso in caso di abusi."]],
    ["Responsabilità", ["Nei limiti consentiti dalla legge, AuraPitch non risponde di perdite economiche legate a decisioni prese usando l'app. Restano salvi i diritti che la legge italiana riconosce ai consumatori."]],
    ["Account e chiusura", ["Puoi eliminare l'account quando vuoi. La beta può cambiare, interrompersi o finire: in quel caso lo comunicheremo nell'app."]],
    ["Legge e contatti", [`Si applica la legge italiana. Contatti: ${contatto()}. Versione ${VERSIONE}, ${AGGIORNATA}.`]],
  ];
}

// "Come ti proteggiamo": la sicurezza spiegata senza gergo (stessa pagina nell'app e su sicurezza.html)
export function sicurezza() {
  return [
    ["In una frase", ["Ti chiediamo il minimo, lo proteggiamo come se fosse nostro e puoi cancellarlo quando vuoi."]],
    ["Niente password da rubare", [
      "Si entra con Google o con Face ID / impronta (passkey): non esiste una password AuraPitch che qualcuno possa indovinare, rubare o riusare.",
      "Le passkey funzionano solo sul sito vero di AuraPitch: un sito falso che la imita non può usarle (protezione contro il phishing).",
      "Il volto e l'impronta non lasciano mai il tuo telefono: a noi arriva solo una firma digitale.",
    ]],
    ["Dati minimi, cifrati", [
      "Da Google riceviamo solo un identificativo anonimo, e lo conserviamo trasformato con una chiave segreta: anche chi leggesse il nostro archivio non saprebbe a chi appartiene.",
      "La tua sessione è un codice casuale che resta sul telefono; da noi ne resta solo un'impronta, inutilizzabile per entrare.",
      "Tutti i collegamenti sono cifrati (HTTPS). Niente pubblicità, niente tracciamenti di terzi, nessun dato venduto.",
      "Risultati in diretta e meteo passano da noi: le fonti esterne non vedono il tuo indirizzo IP.",
    ]],
    ["Il tuo controllo", [
      "In Il Mio Club, Account: scarica tutti i tuoi dati in un file, esci da tutti i dispositivi, elimina l'account con un tocco (cancellazione immediata e definitiva).",
      "Le statistiche d'uso sono anonime e si spengono dal Profilo. Le recensioni non sono collegate al tuo account.",
    ]],
    ["Difese sempre accese", [
      "Codici di accesso monouso che scadono in 10 minuti, limiti alle richieste ripetute, blocco delle pagine estranee che provano a usare il servizio.",
      "Controllo automatico ogni ora: se qualcuno prova ripetutamente codici falsi o fa raffiche di richieste, scatta un allarme.",
      "Ad ogni modifica il codice passa test automatici di sicurezza (oltre 100 controlli su accessi e firme) e un'analisi delle vulnerabilità; le librerie si aggiornano quando escono correzioni.",
      "Il database ha una copia di sicurezza continua degli ultimi 30 giorni: in caso di incidente si torna indietro all'istante prima del problema.",
      "Il cuore dell'algoritmo (storico delle previsioni e modello imparato) sta in un archivio privato, separato dal codice pubblico.",
    ]],
    ["Hai trovato un problema di sicurezza?", ["Scrivici in privato tramite la pagina di segnalazione di GitHub (github.com/ilFlagello/aurapitch/security/advisories/new) o con il modulo \"Scrivici\" nel Profilo. Rispondiamo il prima possibile e ti ringraziamo pubblicamente, se vuoi."]],
  ];
}
