# Brain'z

Jeu vocal de rapidité 100% statique (HTML/CSS/JavaScript vanilla) basé sur la Web Speech API. Les joueurs répondent oralement à des questions, et le score dépend de la vitesse et de la validité de la réponse.

## ✅ Fonctionnement

- Deux modes : **Challenge entre potes** (2 à 4 joueurs) ou **Entrainement** (1 joueur).
- Chaque joueur reçoit **4 questions**.
- Les questions sont tirées **aléatoirement** à chaque partie, **sans répétition**.
- Validation stricte des réponses : tous les mots-clés attendus doivent être prononcés.

## 🔧 Modifier les questions

Les questions sont stockées dans `assets/questions.csv`.

**Format CSV (UTF-8)** :

```csv
theme;question;answer
Culture pop;Quel est le prénom du sorcier appelé "Harry" ?;Harry Potter
```

- Séparateurs acceptés : `;` ou `,` ou tabulation.
- Colonnes minimales : `question` et `answer`.
- Toute modification du CSV est prise en compte **au prochain chargement du site**.

## 🚀 Déployer sur Netlify

1. Poussez le dépôt sur GitHub.
2. Dans Netlify, cliquez sur **“Add new site > Import an existing project”**.
3. Sélectionnez votre dépôt GitHub.
4. Paramètres de build :
   - **Build command** : *(vide)*
   - **Publish directory** : `/` (racine du projet)
5. Déploiement automatique activé ✅

## 🧪 Développement local

Ouvrez simplement `index.html` dans votre navigateur, ou utilisez un serveur statique :

```bash
python3 -m http.server
```

---

Made for fast vocal fun 🎤⚡
