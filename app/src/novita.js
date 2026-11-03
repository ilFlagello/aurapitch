/* AuraPitch - versione dell'app e novità. A ogni pubblicazione con cambi visibili si aggiunge una voce IN CIMA:
   il numero cresce (1.1, 1.2, ...) e l'app lo mostra nel profilo e nel riquadro "Novità" dopo l'aggiornamento. */
export const NOVITA = [
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
