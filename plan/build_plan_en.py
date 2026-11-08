"""Plan d'un an pour la chaîne foot, en anglais pour un public anglophone : 730 sujets, 13 concepts, 4 moteurs.

2 vidéos par jour, à 21 h et à 2 h du matin, heure de Paris : le soir à Londres et à Lagos (20 h), puis le soir aux États-Unis
(20 h à New York, 17 h à Los Angeles). Le créneau de 2 h tombe le lendemain sur le calendrier : la vidéo de 2 h du dimanche 8
sort le lundi 9 à 2 h à Paris, c'est-à-dire le dimanche soir à New York. Dans le plan, « date » est toujours la vraie date de publication à Paris,
et « day » le jour de programme auquel le créneau appartient.
Les 6 vidéos du lancement, déjà rendues, occupent les 6 premiers créneaux (champ « ready »).
Chaque sujet porte son concept, son moteur, son habillage et son type d'accroche.
Le script échoue si une règle anti-répétition n'est pas respectée.

Lancer : python build_plan_en.py
Écrit à côté de lui : topic_plan.json (730 sujets), reserve.json (sujets en plus), concepts.json.
Pour lancer un autre jour, changer START puis relancer.
"""
import json
import random
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from datetime import date, timedelta
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
HERE = Path(__file__).resolve().parent
START = date(2026, 11, 8)  # jour 1 du plan : dimanche 8 novembre 2026, 1re vidéo à 21 h
SLOTS = ["21:00", "02:00"]
DAYS = 365
TOTAL = 2 * DAYS
SEED = 2026
R = random.Random(SEED)
END = START + timedelta(days=DAYS - 1)  # dernier jour de programme ; sa vidéo de minuit sort le lendemain
MON = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def slot_at(i):
    """Créneau n° i : (date de publication à Paris, heure)."""
    p, k = divmod(i, 2)
    return START + timedelta(days=p + k), SLOTS[k]


slots = [slot_at(i) for i in range(TOTAL)]
slot_index = {s: i for i, s in enumerate(slots)}


def aft(day):
    """Le créneau de 21 h de ce jour : 20 h à Londres et à Lagos."""
    return (day, "21:00")


def night(day):
    """Le créneau de 2 h qui termine ce jour : 20 h à New York le même jour."""
    return (day + timedelta(days=1), "02:00")


def d(y, m, dd):
    return date(y, m, dd)


# ----------------------------------------------------------------- moteurs et concepts
ENGINES = {
    "Frise": {"from_week": 0, "skins": ["Night", "Dusk", "Rain", "Snow"],
              "job": "Stade 3D de nuit, tours de drapeaux, compteurs et classement qui bouge. Palmarès, duels, tops. Les habillages sont des lumières de stade, à construire."},
    "Physique": {"from_week": 0, "skins": ["Night", "Dusk", "Rain", "Snow"],
                 "job": "Billes simulées en 3D : tableaux de tournoi, football de billes, classement gardé d'une vidéo à l'autre."},
    "Jeu": {"from_week": 3, "skins": ["TV studio", "Dressing room", "Neon"],
            "job": "Chrono, cases à remplir, score final. Le spectateur joue. À construire."},
    "Terrain": {"from_week": 6, "skins": ["Tactics board", "TV studio", "Chalk"],
                "job": "Terrain animé avec 11 places, maillots, tableau de score et minute de jeu. À construire."},
}
CONCEPTS = {
    "course": dict(name="The Title Race", engine="Frise", quota=150,
        idea="Une frise avance année après année, les tours montent, on découvre qui finit devant.",
        minute="3 s d'accroche, 54 à 58 s de frise, 4 s de classement et question : 61 à 65 s. Au plus 8 tours à l'écran : au-delà, les plus petits passent dans « Others ». Plus de 45 éditions : mode rapide, deux éditions par pulsation (à construire).", min_s=61,
        proof=[("All World Cup Winners", "y9OZzhVFVhA", "5,84 M", "92 s"), ("Ligue 1 all-time winners", "Ujt7C4bOpoA", "3,8 M", "60 s"), ("Premier League Winners", "X35cfPymtTU", "3,9 M", "63 s")],
        data="Wikidata (libre) pour les palmarès, puis contrôle par la routine", tokens="Faible", check=True),
    "duel": dict(name="The Duel", engine="Frise", quota=70,
        idea="Deux joueurs, deux clubs ou deux pays, côte à côte, année par année. L'avance change, les camps s'affrontent en commentaire.",
        minute="3 s d'accroche, 54 s de frise avec un flash à chaque changement de leader, 4 s de total et « whose side are you on? » : 61 s.", min_s=61,
        proof=[("Messi vs Ronaldo, Year by Year", "wWl3fvV8I5c", "1,66 M", "62 s"), ("G/A All Time, Year by Year", "6TEWG15wvfo", "275 000", "61 s")],
        data="Stats saison par saison à rassembler et vérifier : le concept le plus délicat", tokens="Moyen", check=True),
    "top": dict(name="The Top 10", engine="Frise", quota=50,
        idea="Un top 10 dévoilé du 10e au 1er. Le spectateur devine le numéro 1 et réclame l'oublié.",
        minute="3 s d'accroche, 10 places à 5,5 s chacune, 5 s de numéro 1 et « who's missing? » : 63 s.", min_s=63,
        proof=[("Top 10 Highest Paid Footballers", "09cNOGKMO6M", "3,4 M", "176 s")],
        data="Listes publiques vérifiées par la routine", tokens="Faible", check=True),
    "evolution": dict(name="The Evolution", engine="Frise", quota=8,
        idea="Un objet ou une règle du foot raconté étape par étape, dessiné en code.",
        minute="3 s d'accroche, 8 à 10 étapes réparties sur 54 s, 4 s de fin : 61 s.", min_s=61,
        proof=[("Football Ball Evolution", "HCy-aax2Z80", "420 000", "21 s")],
        data="Recherche et vérification par la routine", tokens="Moyen", check=True),
    "tournoi": dict(name="The Marble Tournament", engine="Physique", quota=80,
        idea="16 équipes, un tableau, une seule gagnante. Chaque tour se joue en physique, personne ne connaît le résultat. Aussi sur les vraies affiches : le premier tour reprend 8 vrais matchs de la journée.",
        minute="8 huitièmes, 4 quarts, 2 demies, finale au ralenti, 3 s de vainqueur : 61 à 69 s.", min_s=61,
        proof=[("Marble Nations World Cup", "m4hgZj-ymOM", "104 000", "67 s"), ("Europa League Matchday 4", "2C6NmsPS1CY", "95 000", "46 s")],
        data="Aucune, sauf les vraies affiches", tokens="Presque rien", check=False),
    "ligue": dict(name="The Marble League", engine="Physique", quota=52,
        idea="Un vrai championnat fictif de 20 nations, un épisode chaque dimanche soir (23 h à Londres, 18 h à New York). Le classement se garde d'une semaine à l'autre : c'est le rendez-vous qui fait revenir.",
        minute="3 matchs à 12 s, classement animé, l'affiche de la semaine suivante : 61 s et plus.", min_s=61,
        proof=[("Marble Nations World Cup, Race 1", "m4hgZj-ymOM", "104 000", "67 s")],
        data="Aucune : le classement vit dans le fichier d'état", tokens="Rien", check=False),
    "tirs": dict(name="Marble Penalties", engine="Physique", quota=20,
        idea="Une séance simulée entre rivaux, avec gardien, poteaux et mort subite.",
        minute="10 tirs à 4,5 s, 10 s de mort subite, 6 s de résultat : 61 s.", min_s=61,
        proof=[("8 Football Stars, One Penalty Shootout", "d7WsrHlnFdg", "175 000", "21 s")],
        data="Aucune", tokens="Rien", check=False),
    "draft": dict(name="The Draft", engine="Terrain", quota=90,
        idea="Deux équipes se construisent à tour de rôle sous tes yeux, 11 choix chacune. À la fin, le public vote : qui a gagné la draft ?",
        minute="3 s d'accroche, 11 tours à 5 s, 4 s de comparaison, 3 s de vote : 65 s.", min_s=65,
        proof=[("Footballers Draft", "YDbPJWL34M4", "16 M", "77 s"), ("World Cup Draft", "JgEccIbPmbc", "541 000", "61 s"), ("Building A Team With Over 2000 Goals", "qc8E2sbW2u0", "205 000", "61 s")],
        data="Listes de joueurs écrites par la routine, stats vérifiées si l'objectif est chiffré", tokens="Moyen", check=True),
    "onze": dict(name="The Mystery XI", engine="Terrain", quota=40,
        idea="La compo d'une équipe légendaire apparaît poste par poste, avec un indice. Tu as quelques secondes pour trouver chaque nom.",
        minute="3 s d'accroche, 11 joueurs à 4,5 s, 6 s de compo complète, 3 s de score : 61,5 s.", min_s=61,
        proof=[("Guess The Football Team", "WDyUyjlAniM", "3,08 M", "111 s")],
        data="Compositions publiques vérifiées par la routine", tokens="Faible", check=True),
    "match": dict(name="The Legendary Match", engine="Terrain", quota=30,
        idea="Un grand match raconté sans une seule image : terrain animé, score et minute qui défilent. Publié le jour de son anniversaire.",
        minute="3 s d'accroche, chrono de 0 à 90 minutes en 54 s avec 6 à 9 moments clés, 5 s de fin : 62 s.", min_s=62,
        proof=[("Tifo, greatest comeback", "oOG9jRlTBfE", "992 000", "70 s")],
        data="Récit écrit et vérifié par la routine", tokens="Élevé", check=True),
    "aveugle": dict(name="Blind Ranking", engine="Jeu", quota=60,
        idea="8 noms arrivent un par un. Il faut placer chacun sans savoir qui vient après, puis comparer son classement en commentaire.",
        minute="3 s d'accroche, 8 noms à 6,5 s, 6 s de résultat, 3 s de question : 64 s.", min_s=64,
        proof=[("Blind ranking part 69", "NhApP6BSt4Q", "867 000", "76 s"), ("2026 Ballon d'Or Tier List", "w1AN7xq82gM", "585 000", "103 s")],
        data="Noms seulement", tokens="Faible", check=False),
    "chrono": dict(name="The 60-Second Challenge", engine="Jeu", quota=60,
        idea="La vidéo est le chrono : 60 secondes pour répondre, des indices qui tombent, les réponses à la fin. Les gens répondent en commentaire.",
        minute="60 s de compte à rebours avec indices à 20, 40 et 50 s, puis 5 s de réponses : 65 s.", min_s=65,
        proof=[("Name 6 footballers starting with K", "-U4uigXf7Sk", "275 000", "57 s"), ("Footballers names in reverse", "4rUe3xrEyjQ", "517 000", "62 s")],
        data="Listes de réponses vérifiées par la routine", tokens="Faible", check=True),
    "quisuisje": dict(name="Who Am I?", engine="Jeu", quota=20,
        idea="Une carrière se dessine club après club. Quatre joueurs à trouver avant la révélation.",
        minute="3 s d'accroche, 4 parcours à 14 s, 3 s de score : 62 s.", min_s=62,
        proof=[("Recherche « guess the player »", "", "29 000 vues médianes sur le mois, mais souvent moins d'une minute", "")],
        data="Carrières depuis Wikidata (libre), contrôlées", tokens="Faible", check=True),
}
assert sum(c["quota"] for c in CONCEPTS.values()) == TOTAL
LATER = {"tirs": 4, "evolution": 8, "quisuisje": 8}  # concepts dont la preuve est plus faible ou le format pas encore construit
# fonctions du moteur encore à construire, et la semaine où elles seront prêtes ; un sujet qui en a besoin ne passe pas avant
FEATURES = {"fast": (3, "Course : mode rapide au-delà de 45 éditions, tour « Others » au-delà de 8 vainqueurs, écussons de compétitions"),
            "players": (3, "Tournoi : billes de joueurs (nom et couleurs du maillot) au lieu des drapeaux")}

# ----------------------------------------------------------------- listes de base (noms anglais, poids anglophone)
CLUBS = [("Man Utd", "Manchester United"), ("Liverpool", "Liverpool"), ("Arsenal", "Arsenal"), ("Chelsea", "Chelsea"), ("Man City", "Manchester City"),
    ("Tottenham", "Tottenham"), ("Newcastle", "Newcastle"), ("Aston Villa", "Aston Villa"), ("Everton", "Everton"), ("West Ham", "West Ham"),
    ("Leeds", "Leeds United"), ("Nottingham Forest", "Nottingham Forest"), ("Celtic", "Celtic"), ("Rangers", "Rangers"),
    ("Real Madrid", "Real Madrid"), ("Barcelona", "Barcelona"), ("Bayern", "Bayern Munich"), ("Juventus", "Juventus"), ("AC Milan", "AC Milan"),
    ("Inter", "Inter"), ("PSG", "PSG"), ("Dortmund", "Borussia Dortmund"), ("Atlético", "Atlético Madrid"), ("Ajax", "Ajax"),
    ("Benfica", "Benfica"), ("Porto", "Porto"), ("Napoli", "Napoli"), ("Roma", "Roma"), ("Marseille", "Marseille"),
    ("Boca", "Boca Juniors"), ("River", "River Plate"), ("Flamengo", "Flamengo"), ("Galatasaray", "Galatasaray"), ("Sporting", "Sporting CP"),
    ("PSV", "PSV"), ("Sevilla", "Sevilla"), ("Al Ahly", "Al Ahly"), ("Fenerbahçe", "Fenerbahçe"), ("Lyon", "Lyon"), ("Valencia", "Valencia"),
    ("Santos", "Santos"), ("Club América", "Club América"), ("Al Hilal", "Al Hilal"), ("LA Galaxy", "LA Galaxy"), ("Inter Miami", "Inter Miami")]
NAME = {**dict(CLUBS), "Zamalek": "Zamalek", "Palmeiras": "Palmeiras", "Feyenoord": "Feyenoord", "Lazio": "Lazio", "Sunderland": "Sunderland",
        "LAFC": "LAFC", "Seattle": "Seattle Sounders", "Portland": "Portland Timbers"}
TAG_OF_NAME = {v: k for k, v in NAME.items()}
NATIONS = ["England", "USA", "Brazil", "Argentina", "France", "Germany", "Spain", "Italy", "Portugal", "Netherlands",
    "Scotland", "Republic of Ireland", "Nigeria", "Ghana", "Mexico", "Canada", "Belgium", "Croatia", "Uruguay", "Wales",
    "Senegal", "Morocco", "Egypt", "Cameroon", "Ivory Coast", "South Africa", "Japan", "South Korea", "Australia", "Jamaica",
    "Colombia", "Denmark", "Sweden", "Poland", "Turkey", "Northern Ireland"]
SHOWN = {"USA": "USMNT", "Republic of Ireland": "Ireland", "Netherlands": "Netherlands"}
ANGLO = {"Premier League", "England", "USA", "Scotland", "Republic of Ireland", "Wales", "Northern Ireland", "Canada", "Australia", "Nigeria", "Ghana",
         "South Africa", "Jamaica", "FA Cup", "MLS", "Celtic", "Rangers", "LA Galaxy", "Inter Miami"} | {t for t, _ in CLUBS[:12]}
TOPICS = defaultdict(list)


def shown(country):
    return SHOWN.get(country, country)


def poss(name):
    return name + ("'" if name.endswith("s") else "'s")


def add(concept, title, series, tags=(), pin=None, note="", needs=()):
    TOPICS[concept].append(dict(title=title, series=series, tags=list(tags), pin=pin, note=note, needs=list(needs)))


# ----------------------------------------------------------------- The Title Race (Frise)
COMPS = [("World Cup", "winner"), ("Euros", "winner"), ("Copa América", "winner"), ("AFCON", "winner"), ("Asian Cup", "winner"), ("Gold Cup", "winner"),
    ("Olympic football", "champion"), ("Women's Olympic football", "champion"), ("Women's World Cup", "winner"), ("Women's Euros", "winner"), ("Confederations Cup", "winner"),
    ("Champions League", "winner"), ("Europa League", "winner"), ("Cup Winners' Cup", "winner"), ("UEFA Super Cup", "winner"), ("Club World Cup", "winner"),
    ("Intercontinental Cup", "winner"), ("Copa Libertadores", "winner"), ("Copa Sudamericana", "winner"), ("CAF Champions League", "winner"), ("AFC Champions League", "winner"),
    ("CONCACAF Champions Cup", "winner"), ("Women's Champions League", "winner"),
    ("Premier League", "champion"), ("FA Cup", "winner"), ("League Cup", "winner"), ("Community Shield", "winner"), ("Championship", "winner"),
    ("La Liga", "champion"), ("Copa del Rey", "winner"), ("Serie A", "champion"), ("Coppa Italia", "winner"), ("Bundesliga", "champion"), ("DFB-Pokal", "winner"),
    ("Ligue 1", "champion"), ("Eredivisie", "champion"), ("Primeira Liga", "champion"), ("Süper Lig", "champion"), ("Brasileirão", "champion"),
    ("Argentine Primera División", "champion"), ("Liga MX", "champion"), ("MLS Cup", "winner"), ("Supporters' Shield", "winner"), ("Saudi Pro League", "champion"),
    ("WSL", "champion"), ("NWSL", "champion"), ("South African Premiership", "champion"), ("A-League", "champion"), ("Indian Super League", "champion")]
for comp, noun in COMPS:
    add("course", f"Every {comp} {noun}, year by year", "Every winner", [comp])
for tag, name in [c for c in CLUBS if c[0] not in ("Inter Miami", "LA Galaxy", "Al Hilal")]:
    add("course", f"Every {name} trophy, year by year", "Club trophies", [tag])
for a, b in [("Man Utd", "Liverpool"), ("Arsenal", "Tottenham"), ("Man City", "Man Utd"), ("Chelsea", "Arsenal"), ("Liverpool", "Everton"), ("Celtic", "Rangers"),
             ("Liverpool", "Man City"), ("Arsenal", "Man Utd"), ("Chelsea", "Man City"), ("Newcastle", "Sunderland"), ("Aston Villa", "Nottingham Forest"),
             ("Real Madrid", "Barcelona"), ("Real Madrid", "Atlético"), ("Bayern", "Dortmund"), ("Juventus", "Inter"), ("Inter", "AC Milan"), ("Ajax", "PSV"),
             ("Porto", "Benfica"), ("Boca", "River"), ("Galatasaray", "Fenerbahçe"), ("Al Ahly", "Zamalek"), ("Flamengo", "Palmeiras"), ("PSG", "Marseille"),
             ("Real Madrid", "AC Milan"), ("Liverpool", "Bayern"), ("Barcelona", "Bayern"), ("Man Utd", "Real Madrid"), ("LA Galaxy", "Seattle")]:
    add("course", f"{NAME[a]} vs {NAME[b]}: the race for trophies", "Club races", [a, b])
for t, tags in [("Ballon d'Or winners by country, year by year", ["Ballon d'Or"]), ("Ballon d'Or winners by club, year by year", ["Ballon d'Or"]),
                ("Ballon d'Or winners by position, year by year", ["Ballon d'Or"]), ("Ballon d'Or winners by league, year by year", ["Ballon d'Or"]),
                ("Every Women's Ballon d'Or winner, year by year", ["Ballon d'Or"]), ("Every European Golden Shoe winner, year by year", []),
                ("Every Golden Boy winner, year by year", []), ("Every African Footballer of the Year, year by year", ["Africa"]),
                ("Every FIFA world player of the year since 1991", []), ("The top scorer of every World Cup", ["World Cup"]), ("The top scorer of every Euros", ["Euros"]),
                ("The top scorer of every AFCON", ["AFCON"]), ("The top scorer of every Champions League season", ["Champions League"]),
                ("Every Premier League Golden Boot winner, season by season", ["Premier League"]), ("Every La Liga top scorer, season by season", ["La Liga"]),
                ("Every Serie A top scorer, season by season", ["Serie A"]), ("Every Bundesliga top scorer, season by season", ["Bundesliga"]),
                ("The best player of every World Cup", ["World Cup"]), ("The captain of every World Cup winner", ["World Cup"]),
                ("The manager of every World Cup winner", ["World Cup"]), ("The manager of every Champions League winner", ["Champions League"]),
                ("Every PFA Player of the Year, year by year", ["Premier League"]), ("Every Premier League Player of the Season", ["Premier League"]),
                ("Every Premier League Manager of the Season", ["Premier League"]), ("Every MLS MVP, year by year", ["MLS"])]:
    add("course", t, "Awards", tags)
for t, tags in [("Europe vs South America: every World Cup, year by year", ["World Cup"]), ("Champions League titles by country, year by year", ["Champions League"]),
                ("Europa League titles by country, year by year", ["Europa League"]), ("Copa Libertadores titles by country, year by year", ["Copa Libertadores"]),
                ("CAF Champions League titles by country, year by year", ["Africa"]), ("Premier League titles by manager, season by season", ["Premier League"]),
                ("Champions League titles by manager, year by year", ["Champions League"]), ("Premier League Golden Boots by country, season by season", ["Premier League"]),
                ("Premier League titles by city, season by season", ["Premier League"]), ("English clubs in Europe: every trophy, year by year", ["England"])]:
    add("course", t, "By country", tags)
# sujets que le moteur Course sait déjà faire : au plus 8 vainqueurs différents et 48 éditions ; les autres attendent le mode rapide
READY_NOW = {"Every World Cup winner, year by year", "Every Premier League champion, year by year", "Europe vs South America: every World Cup, year by year",
             "Premier League titles by city, season by season", "Every Gold Cup winner, year by year", "Every Copa América winner, year by year",
             "Every Women's Euros winner, year by year", "Every WSL champion, year by year",
             "Every NWSL champion, year by year", "Every Women's World Cup winner, year by year"}
for t in TOPICS["course"]:
    if t["title"] not in READY_NOW:
        t["needs"] = ["fast"]

# ----------------------------------------------------------------- The Duel (Frise)
for a, b, stat in [("Messi", "Ronaldo", "club goals, year by year"), ("Messi", "Ronaldo", "assists, year by year"), ("Messi", "Ronaldo", "hat-tricks, year by year"),
                   ("Messi", "Ronaldo", "Champions League goals, year by year"), ("Messi", "Ronaldo", "trophies, year by year"), ("Messi", "Ronaldo", "international goals, year by year"),
                   ("Haaland", "Mbappé", "goals, year by year"), ("Haaland", "Mbappé", "goals at the same age"), ("Haaland", "Mbappé", "Champions League goals, year by year"),
                   ("Mbappé", "Messi", "goals at the same age"), ("Mbappé", "Ronaldo", "goals at the same age"), ("Yamal", "Messi", "stats at the same age"),
                   ("Haaland", "Kane", "league goals, year by year"), ("Kane", "Shearer", "Premier League goals, season by season"), ("Kane", "Rooney", "England goals, year by year"),
                   ("Salah", "Mané", "goals, year by year"), ("Salah", "Son", "Premier League goals, year by year"), ("Henry", "Drogba", "Premier League goals, year by year"),
                   ("Gerrard", "Lampard", "goals, year by year"), ("Rooney", "Ronaldo", "Manchester United goals, year by year"), ("Agüero", "Kane", "Premier League goals, year by year"),
                   ("Bellingham", "Vinícius", "goals, year by year"), ("Saka", "Foden", "goals and assists, year by year"), ("Pulisic", "Donovan", "USMNT goals, year by year"),
                   ("Pelé", "Maradona", "goals and trophies"), ("Ronaldo Nazário", "Henry", "goals, year by year"), ("Lewandowski", "Benzema", "goals, year by year"),
                   ("Drogba", "Eto'o", "goals, year by year"), ("Neymar", "Mbappé", "PSG goals, year by year"), ("Casillas", "Buffon", "trophies, year by year"),
                   ("Wambach", "Sinclair", "international goals, year by year"), ("Morgan", "Kerr", "goals, year by year"), ("De Bruyne", "Modrić", "assists, year by year"),
                   ("Henry", "Van Persie", "Arsenal goals, year by year"), ("Palmer", "Saka", "goals and assists, year by year")]:
    add("duel", f"{a} vs {b}: {stat}", "Players", [a, b] + (["England"] if "England" in stat else []))
for a, b, what in [("Man Utd", "Liverpool", "every match"), ("Arsenal", "Tottenham", "every North London derby"), ("Man City", "Man Utd", "every Manchester derby"),
                   ("Liverpool", "Everton", "every Merseyside derby"), ("Chelsea", "Arsenal", "every match"), ("Chelsea", "Tottenham", "every match"),
                   ("Newcastle", "Sunderland", "every Tyne-Wear derby"), ("Leeds", "Man Utd", "every Roses match"), ("Celtic", "Rangers", "every Old Firm derby"),
                   ("Real Madrid", "Barcelona", "every Clásico"), ("Real Madrid", "Atlético", "every Madrid derby"), ("Inter", "AC Milan", "every Milan derby"),
                   ("Bayern", "Dortmund", "every Klassiker"), ("Boca", "River", "every Superclásico"), ("Ajax", "Feyenoord", "every Klassieker"),
                   ("Porto", "Benfica", "every match"), ("Galatasaray", "Fenerbahçe", "every Istanbul derby"), ("Roma", "Lazio", "every Rome derby"),
                   ("Juventus", "Inter", "every Derby d'Italia"), ("PSG", "Marseille", "every Classique"), ("Al Ahly", "Zamalek", "every Cairo derby"),
                   ("Real Madrid", "Bayern", "every European match"), ("Barcelona", "Chelsea", "every European match"), ("Liverpool", "Man City", "every match"),
                   ("Arsenal", "Man Utd", "every match"), ("LA Galaxy", "LAFC", "every El Tráfico"), ("Seattle", "Portland", "every Cascadia derby"),
                   ("Liverpool", "Real Madrid", "every European match")]:
    pace = "year by year" if a in ("LA Galaxy", "Seattle") else "decade by decade"  # un siècle de derbys se raconte par décennie
    add("duel", f"{NAME[a]} vs {NAME[b]}: {what}, {pace}", "Clubs", [a, b])
for a, b in [("England", "Germany"), ("England", "Scotland"), ("England", "Argentina"), ("USA", "Mexico"), ("Brazil", "Argentina"), ("France", "Italy"),
             ("Germany", "Netherlands"), ("Spain", "Portugal"), ("Italy", "Germany"), ("Nigeria", "Ghana"), ("Nigeria", "Cameroon"), ("Morocco", "Egypt"),
             ("Japan", "South Korea"), ("England", "France"), ("England", "Brazil"), ("USA", "Canada"), ("Australia", "Japan"), ("England", "Italy"),
             ("Republic of Ireland", "England"), ("Wales", "Scotland")]:
    add("duel", f"{shown(a) if a != 'USA' else 'USA'} vs {shown(b) if b != 'USA' else 'USA'}: every match, decade by decade", "Nations", [a, b])

# ----------------------------------------------------------------- The Top 10 (Frise)
for tag, name in CLUBS[:36]:
    add("top", f"{poss(name)} 10 all-time top scorers", "Club scorers", [tag])
for c in NATIONS[:22]:
    add("top", f"{poss(shown(c))} 10 all-time top scorers", "Country scorers", [c])
for c in NATIONS[:10]:
    add("top", f"{poss(shown(c))} 10 most-capped players", "Caps", [c])
for t, tags in [("in the Premier League", ["Premier League"]), ("in the Champions League", ["Champions League"]), ("in La Liga", ["La Liga"]), ("in Serie A", ["Serie A"]),
                ("in the Bundesliga", ["Bundesliga"]), ("at the World Cup", ["World Cup"]), ("at the Euros", ["Euros"]), ("at AFCON", ["AFCON"]), ("in MLS", ["MLS"]),
                ("at the Women's World Cup", ["Women's World Cup"])]:
    add("top", f"The 10 all-time top scorers {t}", "Competition scorers", tags)
for t, tags in [("The 10 biggest transfers in history", []), ("The 10 biggest Premier League transfers", ["Premier League"]), ("The 10 most decorated players ever", []),
                ("The 10 biggest stadiums in the world", []), ("The 10 biggest stadiums in England", ["England"]), ("The 10 most successful clubs in Europe", []),
                ("The 10 biggest wins in World Cup history", ["World Cup"]), ("The 10 most Premier League appearances", ["Premier League"]),
                ("The 10 most Premier League assists", ["Premier League"]), ("The 10 most Premier League clean sheets", ["Premier League"]),
                ("The 10 youngest Premier League scorers", ["Premier League"]), ("The 10 fastest Premier League hat-tricks", ["Premier League"]),
                ("The 10 highest-scoring Premier League games", ["Premier League"]), ("The 10 most successful English clubs", ["England"])]:
    add("top", t, "Records", tags)

# ----------------------------------------------------------------- The Evolution (Frise)
for t in ["The World Cup ball, from 1930 to today", "The offside rule, from the first laws to today", "The world's most expensive player, record after record",
          "How many teams play the World Cup, edition by edition", "How the Champions League format changed", "The goalkeeper: how the rules changed",
          "How many substitutes are allowed, decade by decade", "Shirt numbers: where they come from", "The goals-in-a-season record, record after record",
          "The football kit, decade by decade", "The Premier League ball, season by season", "Refereeing tech, from the whistle to VAR"]:
    add("evolution", t, "History of the game", [])

# ----------------------------------------------------------------- The Marble Tournament (Physique)
for day, stage in [(d(2026, 11, 24), "matchday 5"), (d(2026, 12, 8), "matchday 6"), (d(2027, 1, 19), "matchday 7"), (d(2027, 1, 27), "matchday 8"),
                   (d(2027, 2, 16), "knockout play-offs, first leg"), (d(2027, 2, 23), "knockout play-offs, second leg"), (d(2027, 3, 9), "round of 16, first leg"),
                   (d(2027, 3, 16), "round of 16, second leg"), (d(2027, 4, 6), "quarter-finals, first leg"), (d(2027, 4, 13), "quarter-finals, second leg"),
                   (d(2027, 4, 27), "semi-finals, first leg"), (d(2027, 5, 4), "semi-finals, second leg"), (d(2027, 6, 5), "final")]:
    add("tournoi", f"Champions League {stage}: the marbles' verdict", "Real fixtures", ["Champions League"], pin=night(day - timedelta(days=1)), note="vraies affiches à remplir par la routine ; date à vérifier")
add("tournoi", "AFCON 2027: the marble tournament before kick-off", "Real fixtures", ["AFCON"], pin=night(d(2027, 6, 18)), note="dates de la CAN 2027 à confirmer")
add("tournoi", "AFCON 2027 final: the marbles' verdict", "Real fixtures", ["AFCON"], pin=night(d(2027, 7, 16)), note="affiche réelle à remplir ; date à confirmer")
add("tournoi", "Women's World Cup 2027: the marble tournament before kick-off", "Real fixtures", ["Women's World Cup"], pin=night(d(2027, 6, 23)))
add("tournoi", "Women's World Cup 2027 final: the marbles' verdict", "Real fixtures", ["Women's World Cup"], pin=night(d(2027, 7, 24)), note="affiche réelle à remplir")
BREAKS = [(d(2026, 11, 9), d(2026, 11, 17)), (d(2027, 1, 8), d(2027, 1, 11)), (d(2027, 3, 22), d(2027, 3, 30)), (d(2027, 5, 24), d(2027, 8, 12)),
          (d(2027, 8, 30), d(2027, 9, 7)), (d(2027, 10, 4), d(2027, 10, 12))]  # trêves, 3e tour de FA Cup et intersaison : dates approchées
day = START + timedelta(days=11)
while day <= END:
    if day.weekday() == 4 and day.day <= 14 and not any(a <= day <= b for a, b in BREAKS):
        add("tournoi", f"Premier League weekend: the marbles play 8 real games ({day.day} {MON[day.month]})", "Real fixtures", ["Premier League"], pin=aft(day),
            note="8 vraies affiches du week-end à remplir ; à déplacer s'il n'y a pas de Premier League ce week-end")
    day += timedelta(days=1)
add("tournoi", "Thanksgiving marble tournament: 16 nations of the Americas", "Holidays", ["USA"], pin=night(d(2026, 11, 26)))
add("tournoi", "Christmas marble tournament: 16 all-time legends", "Holidays", [], pin=night(d(2026, 12, 24)))
add("tournoi", "Boxing Day marble tournament: 16 Premier League legends", "Holidays", ["Premier League"], pin=aft(d(2026, 12, 26)))
add("tournoi", "New Year's Eve marble tournament: the 16 best clubs of 2026", "Holidays", [], pin=aft(d(2026, 12, 31)))
add("tournoi", "Opening weekend marble tournament: 16 Premier League clubs", "Holidays", ["Premier League"], pin=night(d(2027, 8, 13)), note="date de reprise de la Premier League à confirmer")
add("tournoi", "Marble World Cup: 16 nations, one winner", "Launch", ["World Cup"])
add("tournoi", "The Underdog Cup: 16 nations that never won a World Cup", "Launch", ["World Cup"])
for t, tags in [("The 16 biggest English clubs", ["England"]), ("The 16 biggest Spanish clubs", ["La Liga"]), ("The 16 biggest Italian clubs", ["Serie A"]),
                ("The 16 biggest German clubs", ["Bundesliga"]), ("The 16 biggest French clubs", ["Ligue 1"]), ("The 16 biggest Portuguese clubs", []),
                ("The 16 biggest Dutch clubs", []), ("The 16 biggest Turkish clubs", []), ("The 16 biggest African clubs", ["Africa"]),
                ("The 16 biggest South American clubs", []), ("The 16 biggest Asian clubs", []), ("The 16 biggest MLS clubs", ["MLS"]),
                ("The 16 best nations in Europe", []), ("The 16 best nations in Africa", ["Africa"]),
                ("The 16 best nations in Asia", []), ("The 16 best nations in history", []),
                ("16 England legends", ["England"]), ("16 Brazil legends", ["Brazil"]), ("16 Argentina legends", ["Argentina"]), ("16 Germany legends", ["Germany"]),
                ("16 Italy legends", ["Italy"]), ("16 Spain legends", ["Spain"]), ("16 France legends", ["France"]), ("16 Portugal legends", ["Portugal"]),
                ("16 Netherlands legends", ["Netherlands"]), ("16 Scotland legends", ["Scotland"]), ("16 Ireland legends", ["Republic of Ireland"]),
                ("16 Nigeria legends", ["Nigeria"]), ("16 Ghana legends", ["Ghana"]), ("16 African legends", ["Africa"]), ("16 USWNT legends", ["USA"]),
                ("16 Lionesses legends", ["England"]), ("16 legendary goalkeepers", []), ("16 legendary number 10s", []), ("16 legendary strikers", []),
                ("16 legendary defenders", []), ("16 legendary managers", []), ("16 Ballon d'Or winners", ["Ballon d'Or"]), ("16 current Premier League stars", ["Premier League"]),
                ("16 wonderkids under 21", []), ("The 16 greatest teams in history", []), ("16 World Cup-winning teams", ["World Cup"]),
                ("16 Champions League-winning teams", ["Champions League"]), ("16 European football cities", []), ("16 derbies around the world", []),
                ("16 iconic stadiums", []), ("16 Premier League clubs this season", ["Premier League"]), ("16 La Liga clubs this season", ["La Liga"]),
                ("16 Serie A clubs this season", ["Serie A"]), ("16 Bundesliga clubs this season", ["Bundesliga"]), ("16 Championship clubs this season", ["Championship"]),
                ("16 former Manchester United players", ["Man Utd"]), ("16 former Liverpool players", ["Liverpool"]), ("16 former Arsenal players", ["Arsenal"]),
                ("16 former Chelsea players", ["Chelsea"]), ("16 former Real Madrid players", ["Real Madrid"]), ("16 former Barcelona players", ["Barcelona"]),
                ("16 stars of the 2026 World Cup", ["World Cup"])]:
    people = re.search(r"legends|former|stars|winners|wonderkids|legendary|Lionesses", t) and "teams" not in t
    add("tournoi", f"Marble tournament: {t[0].lower() + t[1:] if t.startswith('The ') else t}", "Brackets", tags, needs=["players"] if people else [])
for t in TOPICS["tournoi"]:
    if t["series"] == "Holidays" and re.search(r"legends|stars", t["title"]):
        t["needs"] = ["players"]

# ----------------------------------------------------------------- The Marble League (Physique), chaque dimanche soir
sundays = []
day = START + timedelta(days=1)  # le premier dimanche du lancement est pris par les vidéos déjà prêtes
while day <= END:
    if day.weekday() == 6:
        sundays.append(day)
    day += timedelta(days=1)
ep = [f"The Marble League, season 1: matchday {i}" for i in range(1, 39)]
ep += [f"The Marble Cup: {x}" for x in ["round of 16", "quarter-finals", "semi-finals", "final"]]
ep += [f"The Marble League, season 2: matchday {i}" for i in range(1, 11)]
for sunday, title in zip(sundays, ep):
    add("ligue", title, "Weekly show", [], pin=night(sunday))
CONCEPTS["ligue"]["quota"] = len(sundays)

# ----------------------------------------------------------------- Marble Penalties (Physique)
for a, b in [("England", "Germany"), ("England", "Italy"), ("Argentina", "France"), ("Brazil", "Argentina"), ("Spain", "Portugal"), ("USA", "Mexico"),
             ("Nigeria", "Ghana"), ("Netherlands", "Argentina"), ("Croatia", "Brazil"), ("Morocco", "Spain"), ("England", "Colombia"), ("Senegal", "Egypt"),
             ("Ivory Coast", "Ghana"), ("Japan", "South Korea"), ("Scotland", "England"), ("Man Utd", "Chelsea"), ("Liverpool", "AC Milan"), ("Chelsea", "Bayern"),
             ("Real Madrid", "Barcelona"), ("Arsenal", "Tottenham"), ("Man City", "Liverpool"), ("Celtic", "Rangers"), ("Boca", "River"),
             ("Bayern", "Dortmund"), ("Real Madrid", "Atlético"), ("Man Utd", "Liverpool")]:
    add("tirs", f"Marble penalties: {NAME.get(a, shown(a) if a != 'USA' else 'USA')} vs {NAME.get(b, shown(b) if b != 'USA' else 'USA')}", "Rivals", [a, b])

# ----------------------------------------------------------------- The Draft (Terrain)
for tag, name in CLUBS[:30]:
    add("draft", f"Draft: {poss(name)} all-time XI", "Clubs", [tag])
for c in NATIONS[:20]:
    add("draft", f"Draft: {poss(shown(c))} all-time XI", "Nations", [c])
for t in ["1970s", "1980s", "1990s", "2000s", "2010s", "2020s"]:
    add("draft", f"Draft: the best players of the {t}", "Eras", [])
for g in ["1,000", "1,500", "2,000", "2,500", "3,000", "4,000"]:
    add("draft", f"Draft: build a team with {g} goals", "Goal target", [])
for t, tags in [("left-footed players only", []), ("English players born after 2000", ["England"]), ("no Ballon d'Or winners", []), ("Premier League players only", ["Premier League"]),
                ("La Liga players only", ["La Liga"]), ("Serie A players only", ["Serie A"]), ("Bundesliga players only", ["Bundesliga"]), ("under-23s only", []),
                ("over-33s only", []), ("one player per country", []), ("one player per Premier League club", ["Premier League"]), ("World Cup winners only", ["World Cup"]),
                ("Champions League winners only", ["Champions League"]), ("players who never won the World Cup", []), ("African legends only", ["Africa"]),
                ("players who played for two rivals", []), ("goalkeepers and defenders only", []), ("number 10s only", []), ("players under 5 ft 9", []),
                ("£100m transfers only", []), ("free transfers only", []), ("academy graduates only", []), ("La Masia graduates only", ["Barcelona"]),
                ("Manchester United players only", ["Man Utd"]), ("Liverpool players only", ["Liverpool"]), ("Arsenal players only", ["Arsenal"]),
                ("Chelsea players only", ["Chelsea"]), ("MLS players only", ["MLS"]), ("one-club men only", []), ("2026 World Cup players only", ["World Cup"]),
                ("Championship graduates only", ["Championship"]), ("players with one cap or fewer", [])]:
    add("draft", f"Draft: {t}", "Constraints", tags)
add("draft", "Draft: the stars of 2026", "Eras", [], pin=night(d(2026, 12, 31)))
add("draft", "Draft: every Ballon d'Or winner", "Constraints", ["Ballon d'Or"], pin=aft(d(2027, 10, 25)), note="date du Ballon d'Or à confirmer")

# ----------------------------------------------------------------- The Mystery XI (Terrain)
for team in ["England 1966", "England 1990", "England 1996", "England 2018", "England 2021", "USA 2002", "Brazil 1970", "Brazil 1982", "Brazil 2002",
             "Argentina 1986", "Argentina 2022", "France 1998", "France 2018", "Germany 2014", "Italy 2006", "Spain 2008", "Spain 2010", "Netherlands 1974",
             "Netherlands 1988", "Portugal 2016", "Greece 2004", "Croatia 2018", "Morocco 2022", "Cameroon 1990", "Senegal 2002", "Nigeria 1994", "Ghana 2010",
             "South Korea 2002", "Denmark 1992", "Hungary 1954", "Uruguay 1950",
             "Manchester United 1999", "Manchester United 2008", "Arsenal 2004", "Chelsea 2005", "Chelsea 2012", "Liverpool 2005", "Liverpool 2019",
             "Liverpool 2020", "Manchester City 2018", "Manchester City 2023", "Leicester 2016", "Blackburn 1995", "Nottingham Forest 1979", "Aston Villa 1982",
             "Celtic 1967", "Newcastle 1996", "Tottenham 2019", "Leeds United 2001", "Barcelona 2009", "Barcelona 2011", "Barcelona 2015", "Real Madrid 2002",
             "Real Madrid 2014", "Real Madrid 2017", "Real Madrid 2022", "Bayern Munich 2013", "Bayern Munich 2020", "Borussia Dortmund 2013", "Inter 2010",
             "AC Milan 1989", "AC Milan 2007", "Juventus 1996", "Ajax 1995", "Porto 2004", "PSG 2025"]:
    who = re.sub(r"\s\d{4}$", "", team)
    add("onze", f"Guess the XI: {team}", "Legendary teams", [TAG_OF_NAME.get(who, who)])

# ----------------------------------------------------------------- The Legendary Match (Terrain), publié le jour anniversaire
MATCHES = [((7, 30), "England vs West Germany 1966, the World Cup final", ["England", "Germany"]), ((6, 22), "Argentina vs England 1986, the Hand of God", ["Argentina", "England"]),
    ((6, 30), "England vs Argentina 1998, Owen's wonder goal", ["England", "Argentina"]), ((7, 4), "West Germany vs England 1990, the semi-final in Turin", ["England", "Germany"]),
    ((6, 26), "England vs Germany 1996, the Euro 96 semi-final", ["England", "Germany"]), ((6, 15), "England vs Scotland 1996, Gascoigne's goal", ["England", "Scotland"]),
    ((9, 1), "Germany 1-5 England 2001", ["England", "Germany"]), ((7, 11), "Italy vs England 2021, the Euro 2020 final", ["Italy", "England"]),
    ((6, 29), "USA vs England 1950, the great upset", ["USA", "England"]), ((6, 23), "USA vs Algeria 2010, Donovan in stoppage time", ["USA"]),
    ((5, 26), "Manchester United vs Bayern 1999, the stoppage-time comeback", ["Man Utd", "Bayern"]), ((5, 25), "AC Milan vs Liverpool 2005, the miracle of Istanbul", ["AC Milan", "Liverpool"]),
    ((5, 13), "Manchester City vs QPR 2012, 93:20", ["Man City"]), ((5, 7), "Liverpool vs Barcelona 2019, the 4-0", ["Liverpool", "Barcelona"]),
    ((5, 19), "Bayern vs Chelsea 2012, the final in Munich", ["Bayern", "Chelsea"]), ((5, 2), "Chelsea vs Tottenham 2016, the night Leicester won the league", ["Chelsea", "Tottenham"]),
    ((5, 15), "Arsenal vs Leicester 2004, the Invincibles", ["Arsenal"]), ((4, 23), "Manchester United vs Real Madrid 2003, Ronaldo's hat-trick", ["Man Utd", "Real Madrid"]),
    ((4, 3), "Liverpool vs Newcastle 1996, the 4-3", ["Liverpool", "Newcastle"]), ((8, 28), "Manchester United vs Arsenal 2011, the 8-2", ["Man Utd", "Arsenal"]),
    ((2, 5), "Newcastle vs Arsenal 2011, from 0-4 to 4-4", ["Newcastle", "Arsenal"]), ((5, 8), "Ajax vs Tottenham 2019, Lucas Moura's hat-trick", ["Tottenham", "Ajax"]),
    ((5, 4), "Real Madrid vs Manchester City 2022, Rodrygo's double", ["Real Madrid", "Man City"]), ((6, 10), "Manchester City vs Inter 2023, the treble", ["Man City", "Inter"]),
    ((5, 21), "Manchester United vs Chelsea 2008, the final in Moscow", ["Man Utd", "Chelsea"]), ((4, 14), "Liverpool vs Dortmund 2016, the 4-3", ["Liverpool", "Dortmund"]),
    ((4, 17), "Manchester City vs Tottenham 2019, the VAR quarter-final", ["Man City", "Tottenham"]), ((5, 12), "Arsenal vs Liverpool 2001, Owen's FA Cup final", ["Arsenal", "Liverpool"]),
    ((7, 3), "Colombia vs England 2018, the shootout", ["England"]), ((7, 7), "England vs Denmark 2021, the Euro 2020 semi-final", ["England", "Denmark"]),
    ((7, 10), "Netherlands vs England 2024, Watkins' winner", ["England", "Netherlands"]), ((7, 31), "England vs Germany 2022, the Women's Euro final", ["England", "Germany"]),
    ((7, 5), "USA vs Japan 2015, Lloyd's hat-trick in the final", ["USA", "Japan"]), ((7, 10), "USA vs China 1999, the Women's World Cup final", ["USA"]),
    ((5, 31), "PSG vs Inter 2025, the 5-0 final", ["PSG", "Inter"]), ((5, 26), "Real Madrid vs Liverpool 2018, Bale's bicycle kick", ["Real Madrid", "Liverpool"]),
    ((5, 24), "Real Madrid vs Atlético 2014, La Décima", ["Real Madrid", "Atlético"]), ((3, 8), "Barcelona vs PSG 2017, the remontada", ["Barcelona", "PSG"]),
    ((7, 16), "Uruguay vs Brazil 1950, the Maracanazo", ["Uruguay", "Brazil"]), ((7, 4), "West Germany vs Hungary 1954, the miracle of Bern", ["Germany"]),
    ((6, 21), "Brazil vs Italy 1970, the final in Mexico City", ["Brazil", "Italy"]), ((7, 8), "Brazil vs Germany 2014, the 7-1", ["Brazil", "Germany"]),
    ((6, 13), "Spain vs Netherlands 2014, the 5-1", ["Spain", "Netherlands"]), ((7, 9), "Italy vs France 2006, the headbutt final", ["Italy", "France"]),
    ((7, 10), "Portugal vs France 2016, Éder's goal", ["Portugal", "France"]), ((6, 30), "France vs Argentina 2018, the 4-3", ["France", "Argentina"]),
    ((12, 18), "Argentina vs France 2022, the greatest final", ["Argentina", "France"]), ((12, 10), "Morocco vs Portugal 2022, Africa's first semi-final", ["Morocco", "Portugal"]),
    ((6, 8), "Cameroon vs Argentina 1990, the opening shock", ["Cameroon", "Argentina"]), ((5, 31), "Senegal vs France 2002, the opening shock", ["Senegal", "France"]),
    ((7, 2), "Uruguay vs Ghana 2010, the handball on the line", ["Ghana", "Uruguay"]), ((6, 18), "South Korea vs Italy 2002, the golden goal", ["South Korea", "Italy"]),
    ((11, 18), "France vs Ireland 2009, Henry's handball", ["France", "Republic of Ireland"])]

# ----------------------------------------------------------------- Blind Ranking (Jeu)
CATS = ["England strikers", "goalkeepers", "number 10s", "Ballon d'Or winners", "defenders", "Premier League players", "La Liga players", "Brazilians",
        "Argentines", "Portuguese players", "Spanish players", "Italian players", "German players", "French players", "Dutch players", "African players",
        "Nigerian players", "USMNT players", "under-23s", "managers", "English clubs", "European clubs", "national teams", "strike partnerships",
        "captains", "midfielders", "wingers", "worst transfers", "Champions League scorers", "England legends", "current England players", "Premier League kits"]
for c in CATS:
    add("aveugle", f"Blind ranking: {c}", "Easy", [])
for c in CATS[:20]:
    add("aveugle", f"Blind ranking, expert mode: {c}", "Expert", [])
for c in CATS[:14]:
    add("aveugle", f"Blind ranking, 2000s edition: {c}", "Era", [])

# ----------------------------------------------------------------- The 60-Second Challenge (Jeu)
for L in "ABCDGHKLMNPRSTVW":
    add("chrono", f"60 seconds: name 6 players whose surname starts with {L}", "Letters", [])
for a, b in [("Man Utd", "Real Madrid"), ("Arsenal", "Barcelona"), ("Chelsea", "Inter"), ("Liverpool", "Real Madrid"), ("Man City", "Barcelona"),
             ("Tottenham", "Real Madrid"), ("Man Utd", "Chelsea"), ("Liverpool", "Chelsea"), ("Arsenal", "Chelsea"), ("Man City", "Man Utd"),
             ("Arsenal", "Man City"), ("Everton", "Man Utd"), ("Real Madrid", "Barcelona"), ("AC Milan", "Inter"), ("Juventus", "Real Madrid"),
             ("PSG", "Barcelona"), ("Celtic", "Liverpool"), ("Newcastle", "Liverpool")]:
    add("chrono", f"60 seconds: name 5 players who played for {NAME[a]} and {NAME[b]}", "Two clubs", [a, b])
for t, tags in [("the last 10 Ballon d'Or winners", ["Ballon d'Or"]), ("the last 10 Champions League winners", ["Champions League"]),
                ("the last 10 Premier League champions", ["Premier League"]), ("the last 10 La Liga champions", ["La Liga"]), ("the last 10 FA Cup winners", ["FA Cup"]),
                ("the last 10 AFCON winners", ["AFCON"]), ("the 8 nations that won the World Cup", ["World Cup"]), ("England's 10 top scorers", ["England"]),
                ("the 10 most successful English clubs", ["England"]), ("the last 5 England captains", ["England"]), ("the last 5 Manchester United managers", ["Man Utd"]),
                ("the last 5 Chelsea managers", ["Chelsea"]), ("the last 10 Premier League Golden Boot winners", ["Premier League"]),
                ("every English club that won the European Cup", ["Champions League"])]:
    add("chrono", f"60 seconds: name {t}", "Lists", tags)
for t, tags in [("England", ["England"]), ("Premier League", ["Premier League"]), ("Real Madrid", ["Real Madrid"]), ("Barcelona", ["Barcelona"]),
                ("Manchester United", ["Man Utd"]), ("Liverpool", ["Liverpool"]), ("Arsenal", ["Arsenal"]), ("Chelsea", ["Chelsea"]), ("2026 World Cup", ["World Cup"]),
                ("Ballon d'Or", ["Ballon d'Or"]), ("African legends", ["Africa"]), ("goalkeepers", [])]:
    add("chrono", f"60 seconds: 10 players' names written backwards, {t} special", "Backwards", tags)
for c in NATIONS[:14]:
    add("chrono", f"60 seconds: name 8 {shown(c) if c != 'USA' else 'USA'} players", "Countries", [c])

# ----------------------------------------------------------------- Who Am I? (Jeu)
for t in ["Premier League players", "England strikers", "England's 2018 squad", "England at Euro 96", "Brazilians", "Argentines", "Africans", "journeymen",
          "ex-Manchester United players", "ex-Arsenal players", "ex-Liverpool players", "ex-Chelsea players", "ex-Tottenham players", "ex-Real Madrid players",
          "ex-Barcelona players", "goalkeepers", "midfielders", "2000s stars", "today's stars", "Portuguese players", "Spanish players", "German players",
          "French players", "Italian players", "MLS stars", "USMNT players"]:
    add("quisuisje", f"Who am I? 4 career paths: {t}", "Careers", [])

# ----------------------------------------------------------------- dates fixes hors tournoi
FIRST = {"Every AFCON winner, year by year": aft(d(2027, 6, 18)), "Every Women's World Cup winner, year by year": aft(d(2027, 6, 23)),
         "Every Champions League winner, year by year": aft(d(2027, 6, 4)), "Every FA Cup winner, year by year": aft(d(2027, 5, 14)),
         "Every MLS Cup winner, year by year": aft(d(2026, 12, 4)), "Ballon d'Or winners by country, year by year": aft(d(2027, 10, 24)),
         "Every Premier League Golden Boot winner, season by season": aft(d(2027, 5, 22)),
         "The 10 biggest transfers in history": aft(d(2027, 1, 2)), "The 10 biggest Premier League transfers": aft(d(2027, 9, 1))}
FIRST_NOTE = {"Every FA Cup winner, year by year": "veille de la finale de la FA Cup, date à confirmer", "Every MLS Cup winner, year by year": "veille de la finale de la MLS Cup, date à confirmer",
              "Ballon d'Or winners by country, year by year": "veille du Ballon d'Or, date à confirmer", "Every Premier League Golden Boot winner, season by season": "veille de la dernière journée, date à confirmer",
              "The 10 biggest Premier League transfers": "fin du mercato d'été, date à confirmer"}
for items in TOPICS.values():
    for t in items:
        if t["title"] in FIRST:
            t["pin"] = FIRST[t["title"]]
            t["note"] = FIRST_NOTE.get(t["title"], t["note"])
PRIORITY = {"course": ["Europe vs South America", "Premier League titles by city", "Every Copa América winner", "Every Gold Cup winner", "Every Saudi Pro League champion",
                       "Every Women's Euros winner", "Manchester United vs Liverpool: the race", "Arsenal vs Tottenham: the race", "Every Euros winner", "Every La Liga champion",
                       "Every Manchester United trophy", "Every Liverpool trophy", "Real Madrid vs Barcelona: the race", "Ballon d'Or winners by club", "Every Arsenal trophy"],
            "duel": ["Haaland vs Mbappé: goals, year by year", "Manchester United vs Liverpool", "Real Madrid vs Barcelona", "England vs Germany", "Kane vs Shearer",
                     "USA vs Mexico", "Messi vs Ronaldo: Champions League goals"],
            "top": ["Manchester United's", "Liverpool's", "England's 10 all-time", "Arsenal's", "Real Madrid's", "Chelsea's"],
            "tournoi": ["the 16 greatest teams in history", "the 16 biggest English clubs", "the 16 best nations in history", "16 England legends"],
            "tirs": ["England vs Germany", "Argentina vs France"]}

# ----------------------------------------------------------------- les 6 vidéos du lancement, déjà rendues
LAUNCH = [("course", "Every World Cup winner, year by year", "01-world-cup-race.mp4"),
          ("tournoi", "Marble World Cup: 16 nations, one winner", "02-marble-world-cup.mp4"),
          ("duel", "Messi vs Ronaldo: club goals, year by year", "03-messi-vs-ronaldo.mp4"),
          ("tournoi", "The Underdog Cup: 16 nations that never won a World Cup", "04-underdog-cup.mp4"),
          ("top", "PSG's 10 all-time top scorers", "05-psg-top-scorers.mp4"),
          ("course", "Every Premier League champion, year by year", "06-premier-league-race.mp4")]

# ----------------------------------------------------------------- placement
assign = [None] * TOTAL


def engine_week(c):
    return max(ENGINES[CONCEPTS[c]["engine"]]["from_week"], LATER.get(c, 0))


def first_slot(c):
    return engine_week(c) * 14


for k, (c, title, file) in enumerate(LAUNCH):
    hit = [t for t in TOPICS[c] if t["title"] == title]
    if len(hit) != 1:
        raise SystemExit(f"Sujet du lancement introuvable : {title}")
    hit[0].update(pin=slots[k], ready=f"launch/{file}", placed=True, note="déjà rendue, à publier à la main")
    assign[k] = dict(hit[0], concept=c)


def place(concept, topic, pin):
    """Place un sujet à date fixe ; si le créneau est pris, essaie l'autre créneau du même jour, puis les 3 jours suivants."""
    i0 = slot_index.get(pin)
    if i0 is None:
        return False
    tries = [i0, i0 ^ 1]
    if concept != "match":  # un match de légende n'a de sens que le jour même de son anniversaire
        tries += [i0 + k for k in range(1, 7)]
    for i in tries:
        if not 0 <= i < TOTAL or assign[i] is not None or i < first_slot(concept):
            continue
        neighbours = [assign[j]["concept"] for j in (i - 1, i + 1) if 0 <= j < TOTAL and assign[j]]
        if concept in neighbours:
            continue
        assign[i] = dict(topic, concept=concept)
        return True
    return False


# anniversaires de matchs, à condition que le moteur Terrain existe déjà ce jour-là
for (mm, dd), label, tags in MATCHES:
    day = date(START.year, mm, dd)
    if day < START:
        day = date(START.year + 1, mm, dd)
    topic = dict(title=f"The legendary match: {label}", series="Anniversary", tags=tags, pin=None, note="publié le jour anniversaire ; date à vérifier par la routine")
    i = slot_index.get(aft(day))
    if i is not None and i >= first_slot("match"):
        topic["pin"] = aft(day)
    else:
        topic["note"] = "anniversaire avant la mise en route du moteur Terrain : publié sans lien de date"
    TOPICS["match"].append(topic)

reserve = []
pool = {}
for c, items in TOPICS.items():
    done = [t for t in items if t.get("placed")]
    pinned = [t for t in items if t.get("pin") and not t.get("placed")]
    free = [t for t in items if not t.get("pin")]
    quota = CONCEPTS[c]["quota"] - len(done)
    if len(pinned) > quota:
        reserve += [dict(t, concept=c, pin=None) for t in pinned[quota:]]
        pinned = pinned[:quota]
    placed = []
    for t in pinned:
        if place(c, t, t["pin"]):
            placed.append(t)
        elif c == "match":  # deux anniversaires le même jour : le second passe sans lien de date
            free.append(dict(t, pin=None, note="même jour qu'un autre anniversaire : publié sans lien de date"))
        else:
            raise SystemExit(f"Impossible de placer : {t['title']}")
    prio = PRIORITY.get(c, [])
    head = []
    for p in prio:
        for t in free:
            if p in t["title"] and t not in head:
                head.append(t)
    rest = [t for t in free if t not in head]
    R.shuffle(rest)
    need = quota - len(placed)
    if len(head) + len(rest) < need:
        raise SystemExit(f"{c} : pas assez de sujets ({len(head) + len(rest)} pour {need})")
    chosen = (head + rest)[:need]
    reserve += [dict(t, concept=c) for t in (head + rest)[need:]]
    pool[c] = dict(head=[t for t in chosen if t in head], rest=[t for t in chosen if t not in head])

left = {c: len(pool[c]["head"]) + len(pool[c]["rest"]) for c in pool}
free_total = sum(1 for a in assign if a is None)
assert free_total == sum(left.values()), (free_total, sum(left.values()))
free_used = Counter()


def ready_slot(t):
    """Premier créneau où le moteur sait faire ce sujet."""
    return max([FEATURES[f][0] * 14 for f in t.get("needs", [])], default=0)


def pick_topic(c, i, recent_tags, last_series):
    head = [t for t in pool[c]["head"] if ready_slot(t) <= i]
    if head:  # ordre de priorité gardé, mais on saute un sujet trop proche d'un sujet récent (même club, pays ou compétition)
        pick = next((t for t in head[:4] if not set(t["tags"]) & recent_tags), head[0])
        pool[c]["head"].remove(pick)
        return pick
    src = [t for t in pool[c]["rest"] if ready_slot(t) <= i]
    best, best_score = None, -1e9
    for t in src:
        score = R.random() * 0.1
        if set(t["tags"]) & recent_tags:
            score -= 2
        if t["series"] == last_series.get(c):
            score -= 1
        if score > best_score:
            best, best_score = t, score
    pool[c]["rest"].remove(best)
    return best


last_series = {}
for i in range(TOTAL):
    if assign[i] is None:
        prev = assign[i - 1]["concept"] if i else None
        nxt = assign[i + 1]["concept"] if i + 1 < TOTAL and assign[i + 1] else None
        prev_engine = CONCEPTS[prev]["engine"] if prev else None
        recent_concepts = [a["concept"] for a in assign[max(0, i - 4):i] if a]
        recent_tags = {tag for a in assign[max(0, i - 6):i] if a for tag in a["tags"]}
        week_start = i - i % 14
        week_counts = Counter(a["concept"] for a in assign[week_start:i] if a)
        best, best_score = None, -1e9
        for c, n in left.items():
            if n <= 0 or i < first_slot(c) or not any(ready_slot(t) <= i for t in pool[c]["head"] + pool[c]["rest"]):
                continue
            fs = first_slot(c)
            total_free = left[c] + free_used[c]
            ramp = total_free * (i + 1 - fs) / max(1, TOTAL - fs)
            score = ramp - free_used[c]
            if c == prev or c == nxt:
                score -= 100
            if CONCEPTS[c]["engine"] == prev_engine:
                score -= 0.7
            score -= 0.5 * recent_concepts.count(c)
            if week_counts[c] >= 3:
                score -= 1.2 * (week_counts[c] - 2)
            if i - fs < 28 and week_counts[c] >= 2:  # format tout neuf : 2 vidéos par semaine au plus, le temps de le roder
                score -= 4
            if score > best_score:
                best, best_score = c, score
        if best is None:
            raise SystemExit(f"Aucun concept possible au créneau {i}")
        t = pick_topic(best, i, recent_tags, last_series)
        assign[i] = dict(t, concept=best)
        last_series[best] = t["series"]
        left[best] -= 1
        free_used[best] += 1

# ----------------------------------------------------------------- habillage et accroche
HOOKS = ["question", "challenge", "stat", "debate", "trap"]
skin_pos = Counter()
hook_pos = Counter()
plan = []


def slug(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")[:70]


for i, a in enumerate(assign):
    c = a["concept"]
    eng = CONCEPTS[c]["engine"]
    skins = ENGINES[eng]["skins"]
    skin = skins[skin_pos[eng] % len(skins)]
    skin_pos[eng] += 1
    hook = HOOKS[hook_pos[c] % len(HOOKS)]
    hook_pos[c] += 1
    day, time = slots[i]
    entry = dict(n=i + 1, date=day.isoformat(), time=time, day=(START + timedelta(days=i // 2)).isoformat(), id=slug(a["title"]), category=CONCEPTS[c]["name"],
                 title=a["title"], concept=c, engine=eng, series=a["series"], skin=skin, hook=hook, check=CONCEPTS[c]["check"], fixed=bool(a.get("pin")))
    if a.get("ready"):
        entry["ready"] = a["ready"]
    if a.get("needs"):
        entry["needs"] = a["needs"]
    if a.get("note"):
        entry["note"] = a["note"]
    plan.append(entry)

# ----------------------------------------------------------------- contrôles : le script échoue si une règle casse
problems = []
if len(plan) != TOTAL:
    problems.append(f"{len(plan)} sujets au lieu de {TOTAL}")
for k, (c, title, _) in enumerate(LAUNCH):
    if plan[k]["title"] != title:
        problems.append(f"créneau {k + 1} : {plan[k]['title']} au lieu de {title}")
titles = Counter(p["title"] for p in plan)
problems += [f"titre en double : {t}" for t, n in titles.items() if n > 1]
ids = Counter(p["id"] for p in plan)
problems += [f"id en double : {t}" for t, n in ids.items() if n > 1]
same_row = sum(1 for a, b in zip(plan, plan[1:]) if a["concept"] == b["concept"])
if same_row:
    problems.append(f"{same_row} fois le même concept deux fois de suite")
FRENCH = re.compile(r"\b(contre|année|les|des|du|de la|équipe|Coupe|billes|joueurs|meilleurs?|journée|Ligue des)\b")
problems += [f"titre pas en anglais : {p['title']}" for p in plan if FRENCH.search(p["title"])]
for c, conf in CONCEPTS.items():
    if conf.get("min_s", 0) < 61:
        problems.append(f"{c} : format de {conf.get('min_s')} s, il faut au moins 61 s")
    rows = [i for i, p in enumerate(plan) if p["concept"] == c]
    if len(rows) != conf["quota"]:
        problems.append(f"{c} : {len(rows)} au lieu de {conf['quota']}")
    early = [i for i in rows if i < first_slot(c) and not plan[i].get("ready")]
    if early:
        problems.append(f"{c} : {len(early)} sujets avant que son moteur existe")
problems += [f"créneau {i + 1} avant la fonction {a['needs']} : {a['title']}" for i, a in enumerate(assign) if i < ready_slot(a) and not a.get("ready")]
if problems:
    print("\n".join(problems))
    raise SystemExit(1)

# ----------------------------------------------------------------- écriture et rapport
(HERE / "topic_plan.json").write_text(json.dumps(plan, ensure_ascii=False, indent=0), encoding="utf-8")
(HERE / "reserve.json").write_text(json.dumps([dict(concept=r["concept"], title=r["title"], series=r["series"]) for r in reserve], ensure_ascii=False, indent=0), encoding="utf-8")
(HERE / "concepts.json").write_text(json.dumps(dict(lang="en", engines=ENGINES, concepts=CONCEPTS, features={f: dict(week=w, what=t) for f, (w, t) in FEATURES.items()},
                                                    start=START.isoformat(), end=END.isoformat(), slots=SLOTS, timezone="Europe/Paris"),
                                               ensure_ascii=False, indent=1), encoding="utf-8")

print(f"OK : {len(plan)} sujets, du {plan[0]['date']} {plan[0]['time']} au {plan[-1]['date']} {plan[-1]['time']}, réserve : {len(reserve)} sujets, dates fixes : {sum(p['fixed'] for p in plan)}")
print("\nConcept                      prévus  réserve  fixes  1er passage")
res_count = Counter(r["concept"] for r in reserve)
for c, conf in CONCEPTS.items():
    rows = [p for p in plan if p["concept"] == c]
    print(f"{conf['name']:28s} {len(rows):5d} {res_count[c]:8d} {sum(p['fixed'] for p in rows):6d}  {rows[0]['date']}")
print("\nMoteurs :", {e: sum(1 for p in plan if p["engine"] == e) for e in ENGINES})
run, longest, last = 0, 0, None
for p in plan:
    run = run + 1 if p["engine"] == last else 1
    last = p["engine"]
    longest = max(longest, run)
print("Plus longue suite du même moteur :", longest)
gaps = defaultdict(list)
for i, p in enumerate(plan):
    gaps[p["concept"]].append(i)
print("Écart max entre 2 vidéos d'un même concept (en vidéos) :", {c: max(b - a for a, b in zip(v, v[1:])) for c, v in gaps.items()})
weeks = defaultdict(set)
for i, p in enumerate(plan):
    weeks[i // 14].add(p["concept"])
print("Concepts différents par semaine : min", min(len(v) for v in weeks.values()), "max", max(len(v) for v in weeks.values()))
print("Semaines les moins variées (concepts, numéro de semaine) :", sorted((len(v), w) for w, v in weeks.items())[:5])
tag_of = {a["title"]: set(a["tags"]) for a in assign}
near = sum(1 for i in range(TOTAL) for j in range(i + 1, min(i + 4, TOTAL)) if tag_of[plan[i]["title"]] & tag_of[plan[j]["title"]])
print("Même club, pays ou compétition à moins de 2 jours d'écart :", near, "cas sur", TOTAL)
anglo = sum(1 for p in plan if tag_of[p["title"]] & ANGLO)
print(f"Sujets anglophones (Angleterre, Premier League, États-Unis, Écosse, Irlande, Nigeria, Ghana...) : {anglo} sur {TOTAL} ({100 * anglo / TOTAL:.0f} %)")
print("Sujets à vérifier (routine) :", sum(p["check"] for p in plan), " sans aucune donnée à vérifier :", sum(not p["check"] for p in plan))
new_heavy = []
for c in CONCEPTS:
    fs = first_slot(c)
    for w in range(fs // 14, fs // 14 + 2):
        n = sum(1 for i in range(w * 14, min(TOTAL, w * 14 + 14)) if plan[i]["concept"] == c and not plan[i]["fixed"])
        if fs > 0 and n > 2:
            new_heavy.append((c, w, n))
print("Formats neufs à plus de 2 vidéos dans une de leurs 2 premières semaines :", new_heavy or "aucun")
for i in range(0, 14 * 8, 14):
    print(f"Semaine {i // 14} :", dict(Counter(p["concept"] for p in plan[i:i + 14])))
print("Premiers sujets :")
for p in plan[:20]:
    print(f"  {p['date']} {p['time']} [{p['category'][:22]:22s}] {p['title'][:70]}")
