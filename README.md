# BilletsTouristiques

Application web privée pour la gestion de la collection de billets et jetons touristiques de l'association **Billets et Jetons Touristiques** (groupe Facebook éponyme).

## Fonctionnalités

- Annuaire des billets avec 3 modes d'affichage : Collecte (cartes), Liste (tableau), Galerie
- Filtres : recherche texte, période (slider), catégorie, pays, millésime, thème, collecteur
- Suivi du cycle de vie des collections : Pré-collecte → Collecte → Terminé
- Référentiel des frais de port 2026 (France + International)
- Espace membres avec authentification Google (Firebase)

## Architecture

| Fichier | Rôle |
|---|---|
| `index.html` | Page d'accueil |
| `billets.html` | Annuaire principal (chargé depuis l'API) |
| `login.html` | Page de connexion Google |
| `menu.html` | Composant navigation (injecté dynamiquement) |
| `global.js` | Auth Firebase + vérification whitelist + menu |
| `app.js` | Chargement, filtrage et rendu des billets |
| `style.css` | Feuille de styles unique |

## Prérequis

- Compte Firebase (projet `asso-billet-site`) avec :
  - Authentication Google activée
  - Firestore collection `whitelist` (document par email autorisé)
- Cloudflare Worker (`airbnb-ical-proxy`) servant le JSON des billets depuis Google Drive
- Hébergement : GitHub Pages (branche `main`)

## Accès et sécurité

L'accès est restreint aux membres de l'association :
1. Connexion via compte Google
2. L'email est vérifié dans la whitelist Firestore
3. L'API de données exige un token Firebase valide (`Authorization: Bearer`)

## Déploiement

Le site est servi automatiquement par GitHub Pages à chaque push sur `main`.
Le Worker Cloudflare est déployé séparément depuis le dashboard [dash.cloudflare.com](https://dash.cloudflare.com).

## Équipe

Geneviève, Laura, Jean-Philippe, Cyril, Damien, Vanessa
