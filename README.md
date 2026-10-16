# LaBOG multijoueur

Clone multijoueur de [LaBOG](https://www.solitaire-play.com/labog/) (Boggle 4×4 en français).

- Grille du jour commune, classement en temps réel (Firebase Realtime Database).
- À partir du niveau « Génial », on voit les mots trouvés par les autres joueurs.
- Compteurs permanents : mots par lettre initiale et par longueur (trouvés / total).
- Solveur à trie de préfixes (`game.js`), validé contre l'algorithme du site : `node test.mjs`.

## Multijoueur
Renseigner `firebase-config.js` (projet Firebase avec Realtime Database et authentification anonyme)
et publier `database.rules.json`. Sans config, le jeu fonctionne en solo.

Dictionnaire : Grammalecte. Grilles : liste du site d'origine.
