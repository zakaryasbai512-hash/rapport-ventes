# 📊 Générateur automatique de rapport de ventes

Un script **Node.js** qui transforme un simple fichier de ventes (export Excel, logiciel de caisse, boutique en ligne…) en **rapport visuel clair**, en une seule commande.

👉 **[Voir un exemple de rapport](https://zakaryasbai512-hash.github.io/rapport-ventes/resultats/rapport.html)**

## ✨ Ce que fait le script

- Lit un fichier **CSV** (séparateur `;` ou `,`, détecté automatiquement)
- Comprend les formats français : dates `14/03/2026`, nombres `12,50`, `1 250,00 €`
- **Détecte les lignes en erreur** (date impossible, quantité en lettres, prix manquant…) et les liste au lieu de planter
- Calcule les indicateurs clés : chiffre d'affaires, nombre de ventes, panier moyen, meilleur mois
- Génère :
  - `rapport.html` : un rapport avec graphiques, à ouvrir dans un navigateur ou à imprimer en PDF
  - `resume-mensuel.csv` : un résumé par mois qui s'ouvre directement dans Excel

## 📋 Contenu du rapport

- Chiffre d'affaires par mois (graphique) et évolution d'un mois à l'autre
- Top 5 des produits
- Répartition par catégorie et par vendeur
- Liste des lignes ignorées, avec le numéro de ligne et la raison

## 🚀 Utilisation

Il faut seulement [Node.js](https://nodejs.org), sans aucune autre installation.

```bash
# Créer des données d'exemple
node generer-exemple.js

# Générer le rapport
node rapport.js ventes-exemple.csv

# Choisir le dossier de sortie
node rapport.js mes-ventes.csv --sortie rapport-octobre
```

## 📄 Format du fichier attendu

| Date | Produit | Catégorie | Quantité | Prix unitaire | Vendeur |
|---|---|---|---|---|---|
| 14/03/2026 | Casque audio | Audio | 2 | 79,90 | Vendeur A |

Les noms de colonnes peuvent avoir des majuscules ou des accents (`Quantité` = `quantite`).

## 🛠️ Technologies

- JavaScript (Node.js), **sans dépendance**
- Graphiques en SVG générés par le script
- HTML/CSS responsive, adapté à l'impression

---

*Projet de démonstration (portfolio). Les données d'exemple sont fictives.*
