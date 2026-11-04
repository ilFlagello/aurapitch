/* AuraPitch - versione dell'app e novità. A ogni pubblicazione con cambi visibili si aggiunge una voce IN CIMA:
   il numero cresce (1.1, 1.2, ...) e l'app lo mostra nel profilo e nel riquadro "Novità" dopo l'aggiornamento. */
export const NOVITA = [
  { v: "2.2", data: "4 novembre 2026", punti: [
    "Nuova pagina dell'algoritmo (Schedina IA > Storico IA): in alto come sta andando l'IA in una frase, sotto le sezioni che si aprono al tocco (come ragiona, onestà, vantaggio sul mercato, campionati, cosa ha cambiato e perché)",
    "Coppe: nei Campionati c'è il tabellone a eliminazione diretta di Champions, Europa e Conference League e delle coppe nazionali",
    "Campionati senza quote: una stima dell'IA delle probabilità 1X2 (senza consiglio e senza schedina), con l'onestà controllata ogni giorno",
    "Nuovi campionati: Premier League russa con il consiglio; Finlandia e Irlanda tra quelli senza quote. In tutto 26 campionati e coppe in più dal 3 novembre",
    "Scheda squadra con la forma delle ultime 5 e la difficoltà delle prossime 3; in diretta la barra \"Chi spinge adesso\"; \"IA contro mercato\" nella pagina dell'IA",
    "App più veloce all'avvio: la scheda della partita si scarica dopo l'elenco",
  ] },
  { v: "2.1", data: "3 novembre 2026", punti: [
    "Storico dei consigli più onesto: se i dati di una partita arrivano dopo il fischio, il consiglio si vede ma non conta nel rendimento (etichetta \"Dati arrivati dopo il fischio\")",
    "Partite in Asia, Oceania e Sudamerica: il consiglio si blocca all'ultimo aggiornamento utile prima della notte, non più dopo l'inizio",
    "Un revisore controlla ogni mattina l'algoritmo: probabilità oneste, IA contro quote, consigli vinti contro attesi, risultati che non arrivano",
    "Sicurezza: limite di richieste condiviso dal servizio e correzioni segnalate dall'analisi automatica del codice",
  ] },
  { v: "2.0", data: "3 novembre 2026", punti: [
    "Schedina IA > Storico IA: ogni giorno si salva la schedina di base di ogni stile e si verifica sui risultati. Vedi quante sono passate questo mese, con quota e rendimento in punti",
    "\"Perché è cambiato\": nella partita, chi manca e di quanto si sposta la probabilità prima e dopo formazioni e notizie",
    "Notifica delle formazioni ufficiali (solo partite seguite) con l'effetto sul consiglio IA, prima che si blocchi",
    "Probabilità in diretta: 1, X e 2 ricalcolate a ogni gol ed espulsione, con minuto, risultato e gol attesi rimasti",
    "Cartellini, angoli e falli controllati dopo ogni partita sul tabellino vero (pagina dell'IA)",
  ] },
  { v: "1.9", data: "3 novembre 2026", punti: [
    "Schedina IA: i tre stili sono tre gradini della stessa scala. Zero Tachicardia (3 partite, quote 1,30-1,60, giocate molto probabili), La Classica (nuovo nome: 4 partite, quote 1,50-2,05), Colpaccio da Bar (3 partite, quote 2,00-3,60, le più papabili tra le difficili). Sotto ogni stile vedi quota e probabilità della sua schedina",
    "Voci insieme (partite, marcatori, assist, ammoniti): nessuna è obbligatoria, entra la giocata più convincente per lo stile",
    "Formazioni ufficiali dentro l'algoritmo: appena escono, cambiano probabilità e consiglio prima del blocco dei 45 minuti",
    "Marcatori, assist e ammoniti più precisi con le formazioni ufficiali, e controllati dopo ogni partita sui tabellini",
    "Nuovo in Il Mio Club: Tipster AuraPitch, la classifica dei pronostici verificati (solo se scegli di comparire)",
  ] },
  { v: "1.8", data: "3 novembre 2026", punti: [
    "Schedina IA: scegli insieme partite, marcatori, assist e ammoniti, e l'IA li mescola in una sola schedina",
  ] },
  { v: "1.7", data: "3 novembre 2026", punti: [
    "L'analisi resta aperta fino a 45 minuti dal fischio: infortuni, notizie e quote del pomeriggio entrano nel consiglio",
    "Infortunati e squalificati da una nuova fonte, aggiornati ogni 2 ore",
    "Poi il consiglio si blocca e non cambia più fino al risultato",
  ] },
  { v: "1.6", data: "3 novembre 2026", punti: [
    "Schedina dei giocatori: marcatori, assist, ammoniti o un mix, con quota obiettivo e numero di giocatori a scelta",
  ] },
  { v: "1.5", data: "3 novembre 2026", punti: [
    "Nuovo in \"Come sta andando l'IA\": quanto avresti oggi giocando 1 € su ogni consiglio, con il grafico giorno per giorno",
    "L'algoritmo impara ogni giorno anche dalle partite vere dell'app, non solo dall'archivio",
  ] },
  { v: "1.4", data: "3 novembre 2026", punti: [
    "Schedina IA più sensata: niente più giocate sotto quota 1,30 scelte dall'IA",
    "Scegli quante partite mettere in schedina (da 2 a 10) o lascia decidere all'IA",
    "Esiti principali da scegliere: 1, X, 2, favorita, Goal, No Goal, Over e Under 2,5",
    "Se aggiungi a mano una quota troppo bassa, l'IA ti avvisa e propone un'alternativa",
    "L'algoritmo ora ha 15 specialisti, tra cui un modello statistico indipendente dalle quote",
  ] },
  { v: "1.3", data: "3 novembre 2026", punti: [
    "L'algoritmo ora studia 94.000 partite di 30 campionati e si allena ogni mattina con nuovi specialisti",
    "Scontri diretti: se i precedenti dicono il contrario del consiglio, lo trovi nella motivazione",
  ] },
  { v: "1.2", data: "3 novembre 2026", punti: [
    "Più partite in una schermata: righe più compatte",
    "Accanto a ogni partita, l'affidabilità dei dati da 0 a 100%: quanto l'algoritmo conosce quella partita",
    "Nella pagina della partita, l'elenco dei dati usati dall'algoritmo",
  ] },
  { v: "1.1", data: "3 novembre 2026", punti: [
    "Il consiglio dell'IA si blocca 2 ore prima del fischio d'inizio: da lì non cambia più",
    "Ogni consiglio dice con quali dati è fatto: elaborazione completa, parziale o solo quote dei bookmaker",
    "Classifica in diretta: si aggiorna mentre si gioca e a fine partita",
    "Cronaca tutta in italiano anche nei campionati minori",
    "Notifiche senza doppioni e mai più ripetute alla riapertura",
    "\"Come sta andando l'IA\" spiegata con numeri semplici",
    "L'IA ora studia l'archivio di 30 campionati (prima 7)",
    "Nuovi campionati: Cina, Primera B argentina, Costa Rica",
  ] },
  { v: "1.0", data: "28 ottobre 2026", punti: ["Prima versione beta di AuraPitch"] },
];
export const VERSIONE = NOVITA[0].v;
