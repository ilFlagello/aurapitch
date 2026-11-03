/* AuraPitch - versione dell'app e novità. A ogni pubblicazione con cambi visibili si aggiunge una voce IN CIMA:
   il numero cresce (1.1, 1.2, ...) e l'app lo mostra nel profilo e nel riquadro "Novità" dopo l'aggiornamento. */
export const NOVITA = [
  { v: "1.9", data: "3 novembre 2026", punti: [
    "Schedina IA: i tre stili ora scelgono le giocate sia per quota sia per probabilità. Zero Tachicardia: poche partite, quote giuste e molto probabili. La Classica (nuovo nome): più partite, quote standard. Colpaccio da Bar: quote alte, ma le più papabili",
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
