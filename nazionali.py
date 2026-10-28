"""Nomi italiani delle nazionali (ESPN li dà in inglese). Il nome originale resta in "eh"/"ea" per abbinare diretta e risultati."""
NOMI = {
    "Italy": "Italia", "France": "Francia", "Belgium": "Belgio", "Turkey": "Turchia", "Türkiye": "Turchia", "Germany": "Germania", "Spain": "Spagna",
    "England": "Inghilterra", "Netherlands": "Paesi Bassi", "Portugal": "Portogallo", "Croatia": "Croazia", "Switzerland": "Svizzera", "Austria": "Austria",
    "Denmark": "Danimarca", "Sweden": "Svezia", "Norway": "Norvegia", "Poland": "Polonia", "Scotland": "Scozia", "Wales": "Galles",
    "Republic of Ireland": "Irlanda", "Ireland": "Irlanda", "Northern Ireland": "Irlanda del Nord", "Czechia": "Repubblica Ceca", "Czech Republic": "Repubblica Ceca",
    "Serbia": "Serbia", "Hungary": "Ungheria", "Greece": "Grecia", "Ukraine": "Ucraina", "Romania": "Romania", "Slovakia": "Slovacchia", "Slovenia": "Slovenia",
    "Albania": "Albania", "Georgia": "Georgia", "Israel": "Israele", "Iceland": "Islanda", "Finland": "Finlandia", "Bosnia-Herzegovina": "Bosnia ed Erzegovina",
    "Bosnia and Herzegovina": "Bosnia ed Erzegovina", "North Macedonia": "Macedonia del Nord", "Montenegro": "Montenegro", "Bulgaria": "Bulgaria", "Kosovo": "Kosovo",
    "Armenia": "Armenia", "Azerbaijan": "Azerbaigian", "Kazakhstan": "Kazakistan", "Belarus": "Bielorussia", "Lithuania": "Lituania", "Latvia": "Lettonia",
    "Estonia": "Estonia", "Cyprus": "Cipro", "Luxembourg": "Lussemburgo", "Malta": "Malta", "Faroe Islands": "Isole Fær Øer", "Moldova": "Moldavia",
    "Andorra": "Andorra", "San Marino": "San Marino", "Liechtenstein": "Liechtenstein", "Gibraltar": "Gibilterra", "Russia": "Russia",
    "Brazil": "Brasile", "Argentina": "Argentina", "Uruguay": "Uruguay", "Colombia": "Colombia", "Chile": "Cile", "Peru": "Perù", "Ecuador": "Ecuador",
    "Paraguay": "Paraguay", "Bolivia": "Bolivia", "Venezuela": "Venezuela", "Mexico": "Messico", "United States": "Stati Uniti", "USA": "Stati Uniti",
    "Canada": "Canada", "Costa Rica": "Costa Rica", "Panama": "Panama", "Jamaica": "Giamaica", "Honduras": "Honduras", "Japan": "Giappone",
    "South Korea": "Corea del Sud", "Korea Republic": "Corea del Sud", "Australia": "Australia", "Saudi Arabia": "Arabia Saudita", "Iran": "Iran",
    "Qatar": "Qatar", "China PR": "Cina", "China": "Cina", "Morocco": "Marocco", "Senegal": "Senegal", "Nigeria": "Nigeria", "Egypt": "Egitto",
    "Algeria": "Algeria", "Tunisia": "Tunisia", "Cameroon": "Camerun", "Ghana": "Ghana", "Ivory Coast": "Costa d'Avorio", "Côte d'Ivoire": "Costa d'Avorio",
    "South Africa": "Sudafrica", "New Zealand": "Nuova Zelanda",
}


def italiano(nome):
    return NOMI.get(nome, nome)
