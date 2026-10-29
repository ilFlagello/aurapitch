/* AuraPitch - ordine dei campionati, uguale in tutta l'app (partite, Campionati, primo avvio, scelta delle squadre).
   1) i campionati che segui; 2) i principali, con in testa quelli del tuo paese (dedotto da lingua e fuso orario del
      telefono, nessuna posizione GPS); 3) tutti gli altri in ordine alfabetico per paese, e dentro ogni paese per livello
      (prima divisione, seconda, ... coppe), il calcio femminile in fondo al suo paese. */
// paese e livello di ogni competizione (livello: 1 = prima divisione, 2.. = divisioni inferiori, 30 = coppa nazionale,
// 50+ = competizioni internazionali, +100 = femminile)
export const META = { I1: ["Italia", 1], I2: ["Italia", 2], CL: ["Europa", 51], EL: ["Europa", 52], ECL: ["Europa", 53], CI: ["Italia", 30], E0: ["Inghilterra", 1], SP1: ["Spagna", 1], D1: ["Germania", 1], F1: ["Francia", 1], N1: ["Olanda", 1], P1: ["Portogallo", 1], E1: ["Inghilterra", 2], SCI: ["Italia", 30], FAC: ["Inghilterra", 30], ELC: ["Inghilterra", 30], CDR: ["Spagna", 30], DFB: ["Germania", 30], CDF: ["Francia", 30], D2: ["Germania", 2], SP2: ["Spagna", 2], B1: ["Belgio", 1], T1: ["Turchia", 1], SC0: ["Scozia", 1], A1: ["Austria", 1], G1: ["Grecia", 1], DK1: ["Danimarca", 1], MLS: ["Stati Uniti", 1], BR1: ["Brasile", 1], AR1: ["Argentina", 1], MX1: ["Messico", 1], J1: ["Giappone", 1], F2: ["Francia", 2], NO1: ["Norvegia", 1], SE1: ["Svezia", 1], SA1: ["Arabia Saudita", 1], CHI1: ["Cile", 1], COL1: ["Colombia", 1], AU1: ["Australia", 1], UY1: ["Uruguay", 1], PY1: ["Paraguay", 1], EC1: ["Ecuador", 1], PE1: ["Perù", 1], LIB: ["Sudamerica", 51], SUD: ["Sudamerica", 52], ACL: ["Asia", 51], NL: ["Europa", 54], AMI: ["Mondo", 57], EQ: ["Europa", 55], WCQ: ["Mondo", 56], E2: ["Inghilterra", 3], E3: ["Inghilterra", 4], EC: ["Inghilterra", 5], SC1: ["Scozia", 2], N2: ["Olanda", 2], KNV: ["Olanda", 30], BR2: ["Brasile", 2], CDB: ["Brasile", 30], AR2: ["Argentina", 2], MX2: ["Messico", 2], USL: ["Stati Uniti", 2], ACL2: ["Asia", 52], WSL: ["Inghilterra", 101], AUW: ["Australia", 101], UWCL: ["Europa", 151] };
const PROPRI = {
  IT: ["I1", "CL", "EL", "ECL", "CI", "SCI", "I2", "NL", "WCQ", "EQ", "E0", "SP1", "D1", "F1"],
  EN: ["E0", "CL", "EL", "ECL", "FAC", "ELC", "E1", "NL", "WCQ", "EQ", "SP1", "I1", "D1", "F1"],
  ES: ["SP1", "CL", "EL", "ECL", "CDR", "SP2", "NL", "WCQ", "EQ", "E0", "I1", "D1", "F1"],
  DE: ["D1", "CL", "EL", "ECL", "DFB", "D2", "NL", "WCQ", "EQ", "E0", "SP1", "I1", "F1"],
  FR: ["F1", "CL", "EL", "ECL", "CDF", "F2", "NL", "WCQ", "EQ", "E0", "SP1", "I1", "D1"],
  PT: ["P1", "CL", "EL", "ECL", "NL", "WCQ", "EQ", "E0", "SP1", "I1", "D1", "F1"],
  NL: ["N1", "CL", "EL", "ECL", "KNV", "N2", "NL", "WCQ", "EQ", "E0", "SP1", "I1", "D1", "F1"],
  US: ["MLS", "CL", "E0", "SP1", "I1", "D1", "F1", "LIB", "MX1", "USL", "WCQ"],
  BR: ["BR1", "LIB", "SUD", "CDB", "BR2", "CL", "E0", "SP1", "I1", "D1", "F1", "WCQ"],
  AR: ["AR1", "LIB", "SUD", "AR2", "CL", "E0", "SP1", "I1", "D1", "F1", "WCQ"],
  MX: ["MX1", "MX2", "CL", "E0", "SP1", "I1", "D1", "F1", "LIB", "MLS", "WCQ"],
};
const FUSI = { "Europe/Rome": "IT", "Europe/Vatican": "IT", "Europe/San_Marino": "IT", "Europe/London": "EN", "Europe/Madrid": "ES", "Europe/Berlin": "DE", "Europe/Paris": "FR",
  "Europe/Lisbon": "PT", "Europe/Amsterdam": "NL", "America/Sao_Paulo": "BR", "America/Argentina/Buenos_Aires": "AR", "America/Mexico_City": "MX", "America/New_York": "US",
  "America/Chicago": "US", "America/Los_Angeles": "US", "America/Denver": "US" };
export function paeseUtente() {
  try {
    const f = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (FUSI[f]) return FUSI[f];
    const l = String((navigator.languages || [navigator.language])[0] || "it").toLowerCase();
    const m = { it: "IT", en: "EN", es: "ES", de: "DE", fr: "FR", pt: "PT", nl: "NL" }[l.slice(0, 2)];
    return l === "pt-br" ? "BR" : m || "IT";
  } catch (e) { return "IT"; }
}
export function principali(paese = paeseUtente()) { return PROPRI[paese] || PROPRI.IT; }
/* sezioni ordinate: [{ titolo, leghe: [codici] }] a partire dai codici disponibili */
export function sezioniLeghe(codici, seguiti = [], paese = paeseUtente()) {
  const P = principali(paese);
  const disp = new Set(codici);
  const miei = seguiti.filter((k) => disp.has(k)).sort((a, b) => rango(a, P) - rango(b, P));
  const pr = P.filter((k) => disp.has(k) && !miei.includes(k));
  const resto = codici.filter((k) => !miei.includes(k) && !pr.includes(k)).sort((a, b) => {
    const [pa, la] = META[a] || ["~", 99], [pb, lb] = META[b] || ["~", 99];
    return pa.localeCompare(pb, "it") || la - lb || a.localeCompare(b);
  });
  return [{ titolo: "I tuoi campionati", leghe: miei }, { titolo: "Principali", leghe: pr }, { titolo: "Tutti gli altri, dalla A alla Z", leghe: resto }].filter((s) => s.leghe.length);
}
function rango(k, P) { const i = P.indexOf(k); return i >= 0 ? i : 100 + (((META[k] || [])[1]) || 99); }
export function ordinaLeghe(codici, seguiti = [], paese) { return sezioniLeghe(codici, seguiti, paese).flatMap((s) => s.leghe); }
