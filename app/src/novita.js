/* AuraPitch - versione dell'app e novità. A ogni pubblicazione con cambi visibili si aggiunge una voce IN CIMA:
   il numero cresce (1.1, 1.2, ...) e l'app lo mostra nel profilo e nel riquadro "Novità" dopo l'aggiornamento. */
export const NOVITA = [
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
