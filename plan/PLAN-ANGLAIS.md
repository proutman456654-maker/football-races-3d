# Le plan d'un an, en anglais

## En bref

- **730 vidéos**, du lundi 9 novembre 2026 au lundi 8 novembre 2027.
- **2 par jour**, à 14 h et à minuit, heure de Paris. Cela donne 13 h et 23 h à Londres, 8 h et 18 h à New York.
- **13 formats** différents, plus **167 sujets en réserve** si un sujet ne marche pas.
- Tous les titres sont en anglais.
- Un tiers des sujets parle directement de la Premier League, de l'Angleterre, des États-Unis, de l'Écosse, de l'Irlande, du Nigeria ou du Ghana.
- Le reste parle à tous les fans : Messi, Ronaldo, la Coupe du monde, la Ligue des champions.

## Les 13 formats

| Format | Ce que c'est | Vidéos | Début |
|---|---|---|---|
| The Title Race | Un palmarès qui avance année après année | 150 | 9 nov. |
| The Duel | Deux joueurs, clubs ou pays côte à côte | 70 | 10 nov. |
| The Top 10 | Un top 10 dévoilé du 10e au 1er | 50 | 11 nov. |
| The Marble Tournament | 16 billes, un tableau, un vainqueur | 80 | 10 nov. |
| The Marble League | Le championnat de billes, chaque dimanche soir | 52 | 15 nov. au soir |
| Blind Ranking | Classer 8 noms sans savoir la suite | 60 | 1er déc. |
| The 60-Second Challenge | 60 secondes pour répondre | 60 | 1er déc. |
| Marble Penalties | Une séance de tirs au but en billes | 20 | 7 déc. |
| The Draft | Deux équipes se construisent, le public vote | 90 | 21 déc. |
| The Mystery XI | Retrouver la compo d'une équipe de légende | 40 | 22 déc. |
| Who Am I? | Deviner un joueur à partir de sa carrière | 20 | 4 janv. |
| The Evolution | Le ballon, les règles, les records qui changent | 8 | 5 janv. |
| The Legendary Match | Un grand match raconté le jour de son anniversaire | 30 | 5 févr. |

## Les règles de variété

Les deux premières sont strictes : le programme refuse de sortir un plan qui les casse.

- Jamais deux fois le même format d'affilée.
- Un sujet ne passe jamais avant que le moteur sache le faire.
- Le même club, pays ou compétition revient rarement dans les 2 jours : 15 cas sur 730.
- Un format tout neuf commence doucement : 2 vidéos par semaine au plus pendant 15 jours.
- 136 vidéos sont calées sur l'actualité :
  - chaque journée de Ligue des champions, avec 8 vrais matchs joués en billes ;
  - un week-end de Premier League sur deux ;
  - Thanksgiving, Noël, Boxing Day, le Nouvel An, la reprise de la Premier League ;
  - la CAN et la Coupe du monde féminine de l'été 2027 ;
  - l'anniversaire des grands matchs ;
  - la Ligue des billes chaque dimanche soir.

## Les premières vidéos après le lancement

À partir du jeudi 12 novembre (les 6 premières sont déjà prêtes) :

1. Haaland vs Mbappé: goals, year by year
2. Manchester United's 10 all-time top scorers
3. Every Copa América winner, year by year
4. Marble tournament: the 16 greatest teams in history
5. Real Madrid vs Barcelona: every Clásico, decade by decade
6. Europe vs South America: every World Cup, year by year
7. Liverpool's 10 all-time top scorers
8. The Marble League, season 1: matchday 1 (dimanche 15 au soir)

## Ce que je construis encore, et pour quand

| Pour le | Quoi |
|---|---|
| 15 nov. | La Ligue des billes en anglais (1er épisode) |
| 30 nov. | Les longs palmarès (plus de 45 saisons ou plus de 8 équipes), les tournois de joueurs, Blind Ranking, The 60-Second Challenge |
| 7 déc. | Marble Penalties |
| 21 déc. | The Draft, The Mystery XI |
| 4 janv. | Who Am I?, The Evolution |
| 5 févr. | The Legendary Match |

## Les fichiers

- `topic_plan.json` : les 730 sujets avec date, heure et format (lu par l'automatisation).
- `reserve.json` : les 167 sujets en réserve.
- `build_plan_en.py` : le programme qui fabrique le plan. Pour changer la date de départ, on change une ligne et on le relance.
- `archive-fr/` : l'ancien plan en français, gardé au cas où.
