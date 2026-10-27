"""Prova offline del raccoglitore: risposte finte con la stessa struttura delle API, nessuna rete."""
import csv
import json
import os
import shutil
import sys
import tempfile

sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
import raccoglitore as R  # noqa: E402

R.time.sleep = lambda s: None
os.environ["API_FOOTBALL_KEY"] = "finta"
os.environ["ODDS_API_KEY"] = "finta"
calls = []
today = R.datetime.now(R.timezone.utc).astimezone()
kick = (today + R.timedelta(minutes=45)).isoformat()


def fake_get(url, headers=None):
    calls.append(url)
    h = {"x-ratelimit-requests-remaining": str(100 - len(calls)), "x-requests-remaining": "480"}
    if "/fixtures/lineups" in url:
        return {"response": [{"team": {"name": "Napoli"}, "startXI": []}]}, h
    if "/fixtures" in url:
        return {"errors": [], "response": [
            {"league": {"id": 135}, "fixture": {"id": 1, "date": kick, "status": {"short": "NS"}}, "teams": {"home": {"name": "Napoli"}, "away": {"name": "AS Roma"}}},
            {"league": {"id": 999}, "fixture": {"id": 2, "date": kick, "status": {"short": "NS"}}, "teams": {"home": {"name": "X"}, "away": {"name": "Y"}}}]}, h
    if "/injuries" in url:
        return {"errors": [], "response": [{"fixture": {"id": 1}, "team": {"name": "AS Roma"}, "player": {"name": "P. Dybala", "type": "Missing Fixture", "reason": "Muscle Injury"}}]}, h
    if "/odds" in url and "v3.football" in url:
        return {"errors": [], "paging": {"current": 1, "total": 1}, "response": [{"fixture": {"id": 1}, "bookmakers": [
            {"name": "A", "bets": [{"name": "Match Winner", "values": [{"value": "Home", "odd": "1.80"}, {"value": "Draw", "odd": "3.60"}, {"value": "Away", "odd": "4.50"}]},
                                   {"name": "Goals Over/Under", "values": [{"value": "Over 2.5", "odd": "2.00"}, {"value": "Under 2.5", "odd": "1.80"}]}]},
            {"name": "B", "bets": [{"name": "Match Winner", "values": [{"value": "Home", "odd": "1.90"}, {"value": "Draw", "odd": "3.40"}, {"value": "Away", "odd": "4.30"}]}]}]}]}, h
    if url.split("?")[0].endswith("/sports"):
        return [{"key": "soccer_italy_serie_a", "title": "Serie A - Italy"}], h
    if "the-odds-api" in url:
        return [{"home_team": "Napoli", "away_team": "AS Roma", "bookmakers": [
            {"key": "b1", "markets": [{"key": "h2h", "outcomes": [{"name": "Napoli", "price": 1.85}, {"name": "AS Roma", "price": 4.4}, {"name": "Draw", "price": 3.5}]},
                                      {"key": "totals", "outcomes": [{"name": "Over", "price": 1.95, "point": 2.5}, {"name": "Under", "price": 1.85, "point": 2.5}]}]},
            {"key": "b2", "markets": [{"key": "h2h", "outcomes": [{"name": "Napoli", "price": 1.95}, {"name": "AS Roma", "price": 4.2}, {"name": "Draw", "price": 3.3}]}]}]}], h
    raise AssertionError(url)


R.get = fake_get
tmp = tempfile.mkdtemp()
try:
    R.giro_completo(base=tmp)
    day = os.listdir(tmp)[0]
    rows = list(csv.DictReader(open(os.path.join(tmp, day, "partite.csv"), encoding="utf-8")))
    assert len(rows) == 1, rows
    r = rows[0]
    print(json.dumps(r, indent=1, ensure_ascii=False))
    assert abs(float(r["af_quota_media_1"]) - 1.85) < 1e-9
    assert r["af_bookmaker_1"] == "2" and r["af_bookmaker_Over 2.5"] == "1"
    assert abs(float(r["oa_quota_media_1"]) - 1.90) < 1e-9 and abs(float(r["oa_quota_media_X"]) - 3.40) < 1e-9
    p = [float(r[f"oa_prob_{k}"]) for k in "1X2"]
    assert abs(sum(p) - 1) < 1e-3
    assert "Dybala" in r["assenti_ospite"]
    R.giro_formazioni(base=tmp)
    assert any("_af_lineups_1.json" in f for f in os.listdir(os.path.join(tmp, day)))
    assert R.simile("AC Milan", "Milan") and not R.simile("Inter", "Milan")
    print("chiamate:", len(calls), "- tutte le verifiche superate")
finally:
    shutil.rmtree(tmp)
