#!/usr/bin/env node
/**
 * Générateur de rapport de ventes
 * --------------------------------
 * Lit un fichier CSV de ventes (export Excel, caisse, boutique en ligne…)
 * et produit automatiquement :
 *   - rapport.html          : un rapport visuel avec indicateurs et graphiques
 *   - resume-mensuel.csv    : un résumé par mois, à ouvrir dans Excel
 *
 * Utilisation :
 *   node rapport.js ventes.csv
 *   node rapport.js ventes.csv --sortie mon-dossier
 *
 * Aucune dépendance : seul Node.js est nécessaire.
 */

const fs = require('fs');
const path = require('path');

// ---------- 1. Lecture des arguments ----------

function lireArguments(argv) {
  const args = argv.slice(2);
  if (args.length === 0 || args.includes('--aide') || args.includes('-h')) {
    console.log('Utilisation : node rapport.js <fichier.csv> [--sortie <dossier>]');
    process.exit(args.length === 0 ? 1 : 0);
  }
  const options = { fichier: args[0], sortie: 'resultats' };
  const i = args.indexOf('--sortie');
  if (i !== -1 && args[i + 1]) options.sortie = args[i + 1];
  return options;
}

// ---------- 2. Lecture du CSV ----------

/** Découpe une ligne CSV en gérant les guillemets ("Dupont; Fils"). */
function decouperLigne(ligne, sep) {
  const champs = [];
  let actuel = '';
  let entreGuillemets = false;
  for (let i = 0; i < ligne.length; i++) {
    const c = ligne[i];
    if (c === '"') {
      if (entreGuillemets && ligne[i + 1] === '"') { actuel += '"'; i++; }
      else entreGuillemets = !entreGuillemets;
    } else if (c === sep && !entreGuillemets) {
      champs.push(actuel.trim());
      actuel = '';
    } else {
      actuel += c;
    }
  }
  champs.push(actuel.trim());
  return champs;
}

/** Excel en français exporte avec « ; », les autres outils avec « , ». */
function detecterSeparateur(entete) {
  return (entete.match(/;/g) || []).length >= (entete.match(/,/g) || []).length ? ';' : ',';
}

/** Met un nom de colonne en forme : "Prix Unitaire" -> "prix_unitaire", "Quantité" -> "quantite". */
function normaliserNom(nom) {
  return nom.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

/** Accepte 12.5, 12,5, "1 250,00 €" … */
function lireNombre(texte) {
  if (texte === undefined || texte === '') return NaN;
  const propre = texte.replace(/[€\s ]/g, '').replace(',', '.');
  return /^-?\d+(\.\d+)?$/.test(propre) ? Number(propre) : NaN;
}

/** Accepte 2026-03-14 et 14/03/2026. */
function lireDate(texte) {
  let a, m, j;
  let r = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texte);
  if (r) [, a, m, j] = r;
  else if ((r = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(texte))) [, j, m, a] = r;
  else return null;
  const d = new Date(Date.UTC(+a, +m - 1, +j));
  return d.getUTCMonth() === +m - 1 ? d : null; // refuse le 31/02
}

const COLONNES = ['date', 'produit', 'categorie', 'quantite', 'prix_unitaire', 'vendeur'];

function lireVentes(fichier) {
  const contenu = fs.readFileSync(fichier, 'utf8').replace(/^﻿/, '');
  const lignes = contenu.split(/\r?\n/).filter(l => l.trim() !== '');
  if (lignes.length < 2) throw new Error('Le fichier est vide ou ne contient que l\'en-tête.');

  const sep = detecterSeparateur(lignes[0]);
  const entete = decouperLigne(lignes[0], sep).map(normaliserNom);
  const manquantes = COLONNES.filter(c => !entete.includes(c));
  if (manquantes.length) {
    throw new Error(`Colonnes manquantes : ${manquantes.join(', ')}.\nColonnes attendues : ${COLONNES.join(', ')}`);
  }

  const ventes = [];
  const erreurs = [];
  lignes.slice(1).forEach((ligne, idx) => {
    const numero = idx + 2; // numéro de ligne tel qu'affiché dans Excel
    const champs = decouperLigne(ligne, sep);
    const v = Object.fromEntries(entete.map((nom, i) => [nom, champs[i] ?? '']));

    const date = lireDate(v.date);
    const quantite = lireNombre(v.quantite);
    const prix = lireNombre(v.prix_unitaire);
    const problemes = [];
    if (!date) problemes.push(`date invalide « ${v.date} »`);
    if (!v.produit) problemes.push('produit manquant');
    if (!v.quantite) problemes.push('quantité manquante');
    else if (!Number.isFinite(quantite) || quantite <= 0) problemes.push(`quantité invalide « ${v.quantite} »`);
    if (!v.prix_unitaire) problemes.push('prix manquant');
    else if (!Number.isFinite(prix) || prix < 0) problemes.push(`prix invalide « ${v.prix_unitaire} »`);

    if (problemes.length) {
      erreurs.push({ numero, raison: problemes.join(', ') });
      return;
    }
    ventes.push({
      date,
      mois: date.toISOString().slice(0, 7),
      produit: v.produit,
      categorie: v.categorie || 'Sans catégorie',
      vendeur: v.vendeur || 'Inconnu',
      quantite,
      total: quantite * prix,
    });
  });
  return { ventes, erreurs, separateur: sep };
}

// ---------- 3. Calculs ----------

function grouperPar(ventes, cle) {
  const groupes = new Map();
  for (const v of ventes) {
    const g = groupes.get(v[cle]) || { nom: v[cle], total: 0, quantite: 0, nombre: 0 };
    g.total += v.total;
    g.quantite += v.quantite;
    g.nombre += 1;
    groupes.set(v[cle], g);
  }
  return [...groupes.values()];
}

function analyser(ventes) {
  const total = ventes.reduce((s, v) => s + v.total, 0);
  const parMois = grouperPar(ventes, 'mois').sort((a, b) => a.nom.localeCompare(b.nom));
  const parProduit = grouperPar(ventes, 'produit').sort((a, b) => b.total - a.total);
  const parCategorie = grouperPar(ventes, 'categorie').sort((a, b) => b.total - a.total);
  const parVendeur = grouperPar(ventes, 'vendeur').sort((a, b) => b.total - a.total);
  const meilleurMois = [...parMois].sort((a, b) => b.total - a.total)[0];

  // Évolution par rapport au mois précédent
  parMois.forEach((m, i) => {
    m.evolution = i === 0 || parMois[i - 1].total === 0
      ? null
      : (m.total - parMois[i - 1].total) / parMois[i - 1].total;
  });

  return {
    total,
    nombre: ventes.length,
    panierMoyen: ventes.length ? total / ventes.length : 0,
    articles: ventes.reduce((s, v) => s + v.quantite, 0),
    parMois, parProduit, parCategorie, parVendeur, meilleurMois,
    debut: ventes.reduce((d, v) => (v.date < d ? v.date : d), ventes[0].date),
    fin: ventes.reduce((d, v) => (v.date > d ? v.date : d), ventes[0].date),
  };
}

// ---------- 4. Mise en forme ----------

const euros = n => n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
const entier = n => n.toLocaleString('fr-FR');
const pourcent = n => (n > 0 ? '+' : '') + (n * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' %';
const dateFr = d => d.toLocaleDateString('fr-FR', { timeZone: 'UTC' });
const nomMois = m => {
  const [a, mm] = m.split('-');
  return new Date(Date.UTC(+a, +mm - 1, 1)).toLocaleDateString('fr-FR', { month: 'short', year: '2-digit', timeZone: 'UTC' });
};
const echapper = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Graphique en barres verticales (SVG) du chiffre d'affaires par mois. */
function graphiqueMois(parMois) {
  const L = 760, H = 280, marge = { h: 20, b: 40, g: 70, d: 10 };
  // Graduations « rondes » : pas de 1, 2 ou 5 × une puissance de 10
  const maxBrut = Math.max(...parMois.map(m => m.total)) || 1;
  const puissance = 10 ** Math.floor(Math.log10(maxBrut / 4));
  const pas = [1, 2, 5, 10].map(k => k * puissance).find(p => maxBrut / p <= 5);
  const max = Math.ceil(maxBrut / pas) * pas;
  const largeur = (L - marge.g - marge.d) / parMois.length;
  const hauteurUtile = H - marge.h - marge.b;
  const etiquette = v => (max >= 10000 ? `${(v / 1000).toLocaleString('fr-FR')} k€` : `${entier(v)} €`);

  let graduations = '';
  for (let v = 0; v <= max; v += pas) {
    const y = marge.h + hauteurUtile * (1 - v / max);
    graduations += `<line x1="${marge.g}" x2="${L - marge.d}" y1="${y}" y2="${y}" class="grille"/>
      <text x="${marge.g - 8}" y="${y + 4}" text-anchor="end" class="axe">${etiquette(v)}</text>`;
  }

  const barres = parMois.map((m, i) => {
    const h = (m.total / max) * hauteurUtile;
    const x = marge.g + i * largeur + largeur * 0.15;
    const y = marge.h + hauteurUtile - h;
    return `<g><title>${nomMois(m.nom)} : ${euros(m.total)}</title>
      <rect x="${x}" y="${y}" width="${largeur * 0.7}" height="${h}" rx="4" class="barre"/>
      <text x="${x + largeur * 0.35}" y="${H - marge.b + 18}" text-anchor="middle" class="axe">${nomMois(m.nom)}</text></g>`;
  }).join('');

  return `<svg viewBox="0 0 ${L} ${H}" role="img" aria-label="Chiffre d'affaires par mois">${graduations}${barres}</svg>`;
}

/** Barres horizontales simples en HTML (catégories, vendeurs). */
function barresHorizontales(groupes, total) {
  const max = Math.max(...groupes.map(g => g.total)) || 1;
  return groupes.map(g => `
    <div class="hbar">
      <span class="hbar-nom">${echapper(g.nom)}</span>
      <span class="hbar-piste"><span style="width:${(g.total / max) * 100}%"></span></span>
      <span class="hbar-val">${euros(g.total)} <small>(${Math.round((g.total / total) * 100)} %)</small></span>
    </div>`).join('');
}

function genererHTML(a, erreurs, fichierSource) {
  const lignesTop = a.parProduit.slice(0, 5).map((p, i) => `
    <tr><td>${i + 1}</td><td>${echapper(p.nom)}</td><td class="num">${entier(p.quantite)}</td><td class="num">${euros(p.total)}</td></tr>`).join('');

  const lignesMois = a.parMois.map(m => `
    <tr><td>${nomMois(m.nom)}</td><td class="num">${entier(m.nombre)}</td><td class="num">${euros(m.total)}</td>
    <td class="num ${m.evolution > 0 ? 'hausse' : m.evolution < 0 ? 'baisse' : ''}">${m.evolution === null ? '—' : pourcent(m.evolution)}</td></tr>`).join('');

  const blocErreurs = erreurs.length ? `
    <section class="carte alerte">
      <h2>⚠️ ${erreurs.length} ligne(s) ignorée(s)</h2>
      <p>Ces lignes du fichier contiennent des erreurs et n'ont pas été comptées :</p>
      <ul>${erreurs.slice(0, 20).map(e => `<li>Ligne ${e.numero} : ${echapper(e.raison)}</li>`).join('')}</ul>
      ${erreurs.length > 20 ? `<p>… et ${erreurs.length - 20} autre(s).</p>` : ''}
    </section>` : '';

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Rapport de ventes — ${dateFr(a.debut)} au ${dateFr(a.fin)}</title>
<style>
  :root { --bleu:#2563eb; --texte:#1f2937; --gris:#6b7280; --fond:#f3f4f6; }
  * { box-sizing: border-box; }
  body { margin:0; font-family:"Segoe UI",system-ui,sans-serif; background:var(--fond); color:var(--texte); }
  header { background:linear-gradient(135deg,#1e3a8a,var(--bleu)); color:#fff; padding:2rem 0; }
  .wrap { width:min(1000px,92%); margin:0 auto; }
  header h1 { margin:0 0 .3rem; font-size:1.8rem; }
  header p { margin:0; opacity:.85; }
  main { padding:2rem 0 3rem; display:grid; gap:1.5rem; }
  .kpis { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:1rem; }
  .kpi, .carte { background:#fff; border-radius:12px; padding:1.3rem 1.5rem; box-shadow:0 2px 8px rgba(0,0,0,.05); }
  .kpi span { color:var(--gris); font-size:.9rem; }
  .kpi strong { display:block; font-size:1.6rem; margin-top:.3rem; }
  .kpi small { color:var(--gris); }
  h2 { margin:0 0 1rem; font-size:1.15rem; }
  .deux { display:grid; grid-template-columns:1fr 1fr; gap:1.5rem; }
  svg { width:100%; height:auto; }
  .barre { fill:var(--bleu); } .barre:hover { fill:#1e40af; }
  .grille { stroke:#e5e7eb; } .axe { fill:var(--gris); font-size:12px; }
  table { width:100%; border-collapse:collapse; font-size:.95rem; }
  th, td { padding:.55rem .4rem; border-bottom:1px solid #e5e7eb; text-align:left; }
  th { color:var(--gris); font-weight:600; font-size:.85rem; text-transform:uppercase; }
  .num { text-align:right; white-space:nowrap; }
  .hausse { color:#16a34a; } .baisse { color:#dc2626; }
  .hbar { display:grid; grid-template-columns:130px 1fr 150px; gap:.8rem; align-items:center; margin:.55rem 0; font-size:.95rem; }
  .hbar-piste { background:#e5e7eb; height:12px; border-radius:6px; overflow:hidden; }
  .hbar-piste span { display:block; height:100%; background:var(--bleu); border-radius:6px; }
  .hbar-val { text-align:right; } .hbar-val small { color:var(--gris); }
  .alerte { border-left:5px solid #f59e0b; } .alerte ul { margin:.5rem 0 0; color:#92400e; }
  footer { text-align:center; color:var(--gris); font-size:.85rem; padding-bottom:2rem; }
  @media (max-width:750px) { .deux { grid-template-columns:1fr; } .hbar { grid-template-columns:1fr; gap:.3rem; } .hbar-val { text-align:left; } }
  @media print { body { background:#fff; } .kpi, .carte { box-shadow:none; border:1px solid #ddd; break-inside:avoid; } }
</style>
</head>
<body>
<header><div class="wrap">
  <h1>📊 Rapport de ventes</h1>
  <p>Du ${dateFr(a.debut)} au ${dateFr(a.fin)} · source : ${echapper(path.basename(fichierSource))}</p>
</div></header>
<main class="wrap">
  <section class="kpis">
    <div class="kpi"><span>Chiffre d'affaires</span><strong>${euros(a.total)}</strong></div>
    <div class="kpi"><span>Ventes</span><strong>${entier(a.nombre)}</strong><small>${entier(a.articles)} articles</small></div>
    <div class="kpi"><span>Panier moyen</span><strong>${euros(a.panierMoyen)}</strong></div>
    <div class="kpi"><span>Meilleur mois</span><strong>${nomMois(a.meilleurMois.nom)}</strong><small>${euros(a.meilleurMois.total)}</small></div>
  </section>

  <section class="carte">
    <h2>Chiffre d'affaires par mois</h2>
    ${graphiqueMois(a.parMois)}
  </section>

  <div class="deux">
    <section class="carte">
      <h2>🏆 Top 5 des produits</h2>
      <table><thead><tr><th>#</th><th>Produit</th><th class="num">Qté</th><th class="num">CA</th></tr></thead>
      <tbody>${lignesTop}</tbody></table>
    </section>
    <section class="carte">
      <h2>Détail par mois</h2>
      <table><thead><tr><th>Mois</th><th class="num">Ventes</th><th class="num">CA</th><th class="num">Évol.</th></tr></thead>
      <tbody>${lignesMois}</tbody></table>
    </section>
  </div>

  <section class="carte"><h2>Par catégorie</h2>${barresHorizontales(a.parCategorie, a.total)}</section>
  <section class="carte"><h2>Par vendeur</h2>${barresHorizontales(a.parVendeur, a.total)}</section>
  ${blocErreurs}
</main>
<footer>Rapport généré automatiquement le ${new Date().toLocaleString('fr-FR')}</footer>
</body>
</html>`;
}

/** CSV « ; » avec BOM : s'ouvre directement et proprement dans Excel en français. */
function genererCSV(a) {
  const nombreExcel = n => n.toFixed(2).replace('.', ',');
  const lignes = ['Mois;Nombre de ventes;Articles;Chiffre d\'affaires (€);Évolution'];
  for (const m of a.parMois) {
    lignes.push([m.nom, m.nombre, m.quantite, nombreExcel(m.total),
      m.evolution === null ? '' : pourcent(m.evolution)].join(';'));
  }
  lignes.push(['TOTAL', a.nombre, a.articles, nombreExcel(a.total), ''].join(';'));
  return '﻿' + lignes.join('\r\n') + '\r\n';
}

// ---------- 5. Programme principal ----------

function main() {
  const options = lireArguments(process.argv);
  if (!fs.existsSync(options.fichier)) {
    console.error(`❌ Fichier introuvable : ${options.fichier}`);
    process.exit(1);
  }

  let resultat;
  try {
    resultat = lireVentes(options.fichier);
  } catch (e) {
    console.error(`❌ ${e.message}`);
    process.exit(1);
  }
  const { ventes, erreurs } = resultat;
  if (ventes.length === 0) {
    console.error('❌ Aucune vente valide trouvée dans le fichier.');
    process.exit(1);
  }

  const analyse = analyser(ventes);
  fs.mkdirSync(options.sortie, { recursive: true });
  const cheminHTML = path.join(options.sortie, 'rapport.html');
  const cheminCSV = path.join(options.sortie, 'resume-mensuel.csv');
  fs.writeFileSync(cheminHTML, genererHTML(analyse, erreurs, options.fichier), 'utf8');
  fs.writeFileSync(cheminCSV, genererCSV(analyse), 'utf8');

  console.log(`✅ ${ventes.length} ventes analysées (${erreurs.length} ligne(s) ignorée(s))`);
  console.log(`   Chiffre d'affaires : ${euros(analyse.total)}`);
  console.log(`   Rapport  : ${cheminHTML}`);
  console.log(`   Résumé   : ${cheminCSV}`);
}

if (require.main === module) main();

module.exports = { decouperLigne, lireNombre, lireDate, lireVentes, analyser };
