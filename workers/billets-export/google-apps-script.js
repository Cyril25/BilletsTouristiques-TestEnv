/**
 * Google Apps Script — Sync Supabase → Google Sheet
 * ===================================================
 * Ce script maintient un Google Sheet miroir des billets
 * en appelant le Cloudflare Worker billets-export.
 *
 * INSTALLATION :
 * 1. Ouvrir le Google Sheet miroir
 * 2. Extensions > Apps Script
 * 3. Coller ce code
 * 4. Configurer les constantes ci-dessous
 * 5. Exécuter syncBillets() une première fois (accepter les permissions)
 * 6. Ajouter un trigger : Déclencheurs > Ajouter > syncBillets > Minuteur > Toutes les 5 minutes
 */

// ===== CONFIGURATION =====
var WORKER_URL = 'https://billets-export.<VOTRE-SUBDOMAIN>.workers.dev/billets-export';
var API_KEY = '<VOTRE_EXPORT_API_KEY>';
var SHEET_NAME = 'Billets'; // nom de l'onglet dans le Google Sheet

// Colonnes : A=Dep, B=Reference, C=Millesime, D=Version, E=Cp, F=Ville, G=NomBillet
// (on peut aussi utiliser E:K si vous préférez garder la même structure que l'original)
var START_COLUMN = 1; // colonne A = 1, colonne E = 5
var NB_COLUMNS = 7;
// =========================

function syncBillets() {
  // 1. Appel au Worker
  var response = UrlFetchApp.fetch(WORKER_URL, {
    method: 'get',
    headers: { 'X-Api-Key': API_KEY },
    muteHttpExceptions: true,
  });

  if (response.getResponseCode() !== 200) {
    Logger.log('Erreur Worker : ' + response.getResponseCode() + ' - ' + response.getContentText());
    return;
  }

  var data = JSON.parse(response.getContentText());
  var billets = data.billets;

  if (!billets || billets.length === 0) {
    Logger.log('Aucun billet reçu.');
    return;
  }

  // 2. Trouver le max(id) pour dimensionner le tableau
  var maxId = 0;
  for (var i = 0; i < billets.length; i++) {
    if (billets[i].id > maxId) maxId = billets[i].id;
  }

  // 3. Construire un tableau indexé par id (toutes les lignes vides par défaut)
  var grid = [];
  for (var row = 0; row < maxId; row++) {
    grid.push(['', '', '', '', '', '', '']);
  }

  // 4. Placer chaque billet à la ligne correspondant à son id
  for (var j = 0; j < billets.length; j++) {
    var b = billets[j];
    var lineIndex = b.id - 1; // id=1 → index 0 → ligne 1 du Sheet
    grid[lineIndex] = [
      b.Dep || '',
      b.Reference || '',
      b.Millesime || '',
      b.Version || '',
      b.Cp || '',
      b.Ville || '',
      b.NomBillet || '',
    ];
  }

  // 5. Écrire dans le Sheet en une seule opération
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    Logger.log('Onglet "' + SHEET_NAME + '" introuvable.');
    return;
  }

  // Écrire toutes les lignes d'un coup (très performant)
  var range = sheet.getRange(1, START_COLUMN, maxId, NB_COLUMNS);
  range.setValues(grid);

  Logger.log('Sync terminée : ' + billets.length + ' billets écrits sur ' + maxId + ' lignes.');
}
