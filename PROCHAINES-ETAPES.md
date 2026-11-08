# Football Races 3D : ce qu'il reste à faire

La chaîne publie 2 vidéos par jour (vers 21 h et 2 h, heure de Paris, à ±35 minutes près) sur TikTok et Instagram,
toute seule. GitHub fabrique les vidéos chaque matin, Zernio les publie, et Telegram te prévient. Ton PC n'est pas
nécessaire.

## Ce qui tourne tout seul

| Quoi | Quand | Où |
|---|---|---|
| Fabrication des 2 vidéos du jour | chaque matin (08:17, secours 13:47) | GitHub → Actions → Daily |
| Vérification des posts + alertes | toutes les 30 min autour de 21 h et 2 h | GitHub → Actions → Check posts |
| Écriture des données des 16 jours suivants | lundi et jeudi à 7 h | claude.ai/code/routines |

Si une donnée manque ou si un sujet plante, un **tournoi de billes de secours** part à la place et Telegram le dit.

## À faire

1. **Stats Hub** : ajouter la chaîne au tableau de bord. Onglet Settings → nom `Football Races 3D`, ta clé Zernio
   du foot (tu la colles toi-même), dossier `C:\Users\wqach\football-races-3d` → Check and add.
2. **Avant le 29 nov 2026** (avec Claude) : construire les nouveaux formats. Blind Ranking (29 nov), mode rapide et
   billes de joueurs (30 nov), 60-Second Challenge (1er déc), Penalties (6 déc), Draft et Mystery XI (20-21 déc),
   Legendary Match (22 déc), Evolution et Who Am I (janvier). Sans eux, ces jours-là deviennent des tournois de secours.
3. **Vers le 22 nov 2026** : regarder les stats TikTok (pays des spectateurs, quel créneau marche le mieux) et
   décider si on garde 21 h et 2 h.
4. **23 nov 2026** : la donnée NWSL s'écrit après la finale du 21 nov (routine du lundi).

## Vérifier que tout va bien

Demande à Claude de lancer l'audit, ou lance-le toi-même :

```
python tools/audit.py
```

Il doit finir par **0 problem(s)**. Il ne change rien et ne publie rien.
