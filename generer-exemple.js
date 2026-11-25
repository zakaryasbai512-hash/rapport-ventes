/**
 * Crée un fichier ventes-exemple.csv avec des données fictives
 * (format Excel français : séparateur « ; », virgule décimale).
 * Quelques lignes contiennent volontairement des erreurs pour montrer
 * que le rapport les détecte.
 *
 * Utilisation : node generer-exemple.js
 */
const fs = require('fs');

// Générateur pseudo-aléatoire : mêmes données à chaque exécution
let graine = 42;
const hasard = () => ((graine = (graine * 16807) % 2147483647) - 1) / 2147483646;
const choisir = liste => liste[Math.floor(hasard() * liste.length)];

const produits = [
  ['Casque audio sans fil', 'Audio', 79.9],
  ['Enceinte Bluetooth', 'Audio', 49.9],
  ['Écouteurs intra', 'Audio', 29.9],
  ['Clavier mécanique', 'Informatique', 89],
  ['Souris ergonomique', 'Informatique', 34.5],
  ['Écran 27 pouces', 'Informatique', 249],
  ['Câble USB-C', 'Accessoires', 9.9],
  ['Chargeur rapide', 'Accessoires', 24.9],
  ['Coque de téléphone', 'Accessoires', 14.9],
  ['Montre connectée', 'Objets connectés', 159],
  ['Ampoule connectée', 'Objets connectés', 19.9],
];
const vendeurs = ['Vendeur A', 'Vendeur B', 'Vendeur C', 'Boutique en ligne'];

const lignes = ['Date;Produit;Catégorie;Quantité;Prix unitaire;Vendeur'];
for (let mois = 1; mois <= 10; mois++) {
  // Plus de ventes en fin d'année pour avoir une tendance visible
  const nb = 25 + mois * 4 + Math.floor(hasard() * 15);
  for (let k = 0; k < nb; k++) {
    const [nom, cat, prix] = choisir(produits);
    const jour = String(1 + Math.floor(hasard() * 28)).padStart(2, '0');
    const qte = 1 + Math.floor(hasard() * (prix < 30 ? 5 : 2));
    lignes.push(`${jour}/${String(mois).padStart(2, '0')}/2026;${nom};${cat};${qte};${prix.toFixed(2).replace('.', ',')};${choisir(vendeurs)}`);
  }
}

// Lignes avec erreurs, comme dans un vrai fichier client
lignes.push('31/02/2026;Câble USB-C;Accessoires;2;9,90;Vendeur A');      // date impossible
lignes.push('15/06/2026;Enceinte Bluetooth;Audio;deux;49,90;Vendeur B'); // quantité en lettres
lignes.push('20/07/2026;;Audio;1;29,90;Vendeur C');                      // produit vide
lignes.push('12/09/2026;Souris ergonomique;Informatique;1;;Vendeur A');  // prix manquant

fs.writeFileSync('ventes-exemple.csv', '﻿' + lignes.join('\r\n') + '\r\n', 'utf8');
console.log(`✅ ventes-exemple.csv créé (${lignes.length - 1} lignes)`);
