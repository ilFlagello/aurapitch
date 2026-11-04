"""AuraPitch - orologio dei giri: quando ripassa la raccolta e quale giro e l'ultimo prima del blocco del consiglio.

Le stesse regole servono a genera_app.py (blocco del consiglio) e a raccoglitore.py (fotografia delle quote): la fotografia
pre-partita si scatta nel giro in cui il consiglio viene bloccato, cosi il consiglio usa le quote piu vicine al blocco.
Solo libreria standard."""
from datetime import timedelta

BLOCCO_MIN = 45   # il consiglio si blocca 45 minuti prima del calcio d'inizio (genera_app.BLOCCO_MIN)
GIRO_MIN = 10     # i giri brevi passano ogni 10 minuti
DERIVA_MIN = 3    # minuti tra la fotografia delle quote e il blocco nello stesso giro (passi del giro in mezzo)


def prossimo_giro(ora):
    """Quando ripasserà la raccolta (orologio del servizio): giro completo alle 6:00 UTC, giri brevi ogni 10 minuti dalle 10:00
    alle 23:50 UTC. Tra mezzanotte e le 6 e tra le 6:10 e le 10 non passa nessuno: le partite asiatiche e australiane che
    iniziano in quelle ore vanno bloccate all'ultimo giro utile, prima del fischio."""
    h = ora.replace(minute=0, second=0, microsecond=0)
    if 10 <= ora.hour <= 23 and not (ora.hour == 23 and ora.minute >= 50):
        return ora + timedelta(minutes=GIRO_MIN)
    if ora.hour >= 23:
        return (h + timedelta(days=1)).replace(hour=6)
    if ora.hour < 6:
        return h.replace(hour=6)
    return h.replace(hour=10)


def limite(ko):
    return ko - timedelta(minutes=BLOCCO_MIN)


def ultimo_giro(ko, ora):
    """Questo giro e l'ultimo prima del blocco del consiglio della partita (o il blocco e gia passato ma la partita non e
    iniziata)? Il blocco avviene qualche minuto dopo la fotografia (DERIVA_MIN): si guarda l'orologio di quel momento."""
    if ora >= ko:
        return False
    poi = ora + timedelta(minutes=DERIVA_MIN)
    lim = limite(ko)
    return poi >= lim or prossimo_giro(poi) > lim
