// ============================================================
// CONFIGURATION — Version Supabase (Story 4.7)
// ============================================================

var allData = [];
var currentData = [];
var displayedCount = 0;
var BATCH_SIZE = 50;

// Couleurs des categories (meme mapping que admin.js)
var CATEGORIE_COLORS = {
    'Collecte': '#A4C2F4',
    'Pré collecte': '#FFFF00',
    'Terminé': '#C27BA0',
    'Pas de collecte': '#FF0000',
    'Jamais édité, projet': '#CECECE',
    'Non defini': '#F57C00'
};

function getCategorieColor(categorie) {
    return CATEGORIE_COLORS[categorie || 'Non defini'] || CATEGORIE_COLORS['Non defini'];
}

// Référence au slider (div vide dans le HTML)
var dateSlider = document.getElementById('date-slider');

document.addEventListener('DOMContentLoaded', function() {
    // S'assure que le mode par défaut (Collecte) est activé au chargement
    document.body.classList.add('view-collecte');
});

// Le chargement des données est déclenché après confirmation de l'auth Firebase.
// global.js gère les redirections et la whitelist ; app-new.js se contente d'écouter.
if (typeof firebase !== 'undefined') {
    firebase.auth().onAuthStateChanged(function(user) {
        if (user) {
            fetchData();
        }
    });
}

// ============================================================
// 1. CHARGEMENT DES DONNÉES DEPUIS SUPABASE
// ============================================================
function fetchData() {
    var counter = document.getElementById('counter');

    // Feedback visuel de chargement
    if (counter) {
        counter.innerText = "Chargement...";
        counter.style.backgroundColor = "#EFE9F7";
        counter.style.color = "#5D3A7E";
    }

    var user = firebase.auth().currentUser;
    if (!user) {
        console.warn("fetchData() appelé sans utilisateur connecté. Annulation.");
        if (counter) counter.innerText = "Non connecté";
        return;
    }

    supabaseFetch('/rest/v1/billets?select=*&order=Date.desc.nullslast,Categorie.asc')
        .then(function(data) {
            console.log("Données Supabase reçues :", data.length);
            allData = data || [];

            // On met à jour les listes déroulantes
            populateFilters();

            // Initialisation du slider
            initSlider();

            // Application des filtres et affichage
            applyFilters(false);

            if (counter) {
                counter.style.backgroundColor = "#B19CD9";
                counter.style.color = "white";
                counter.innerText = allData.length + " billets";
            }
        })
        .catch(function(err) {
            console.error("Erreur chargement Supabase :", err);
            if (counter) {
                counter.innerText = "Erreur !";
                counter.style.backgroundColor = "#CC4444";
                counter.style.color = "white";
            }
            var grid = document.getElementById('cards-grid');
            if (grid) {
                grid.innerHTML =
                    '<div style="grid-column:1/-1; text-align:center; padding:40px; color:#CC4444;">' +
                    '<i class="fa-solid fa-circle-exclamation" style="font-size:2em; margin-bottom:12px; display:block;"></i>' +
                    '<strong>Impossible de charger les billets.</strong><br>' +
                    '<span style="color:#666; font-size:0.9em;">' + (err.message || 'Erreur réseau') + ' — Réessaye dans quelques instants.</span>' +
                    '</div>';
            }
        });
}

// ============================================================
// 2. GESTION DU SLIDER DATE (NOUISLIDER)
// ============================================================
function initSlider() {
    // Si le div n'existe pas, on arrête
    if (!dateSlider) return;

    // 1. On récupère toutes les dates valides et on les convertit en Timestamp
    var dates = allData
        .map(function(d) { return normalizeDate(d.Date); })
        .filter(function(d) { return d.length > 0; })
        .map(function(d) { return new Date(d).getTime(); })
        .filter(function(t) { return !isNaN(t); });

    if (dates.length === 0) return;

    // 2. On trouve le Min et le Max
    var minTimestamp = Math.min.apply(null, dates);
    var maxTimestamp = Math.max.apply(null, dates);

    // 3. Si le slider existe déjà (re-chargement), on le détruit proprement
    if (dateSlider.noUiSlider) {
        dateSlider.noUiSlider.destroy();
    }

    // 4. Création du slider
    noUiSlider.create(dateSlider, {
        start: [minTimestamp, maxTimestamp],
        connect: true,
        range: {
            'min': minTimestamp,
            'max': maxTimestamp
        },
        step: 24 * 60 * 60 * 1000,
        tooltips: false
    });

    // 5. Quand le slider bouge -> On met à jour les inputs dates
    dateSlider.noUiSlider.on('update', function(values, handle) {
        var dateObj = new Date(parseInt(values[handle]));
        var dateStr = dateObj.toISOString().split('T')[0];

        if (handle === 0) {
            document.getElementById('date-start').value = dateStr;
        } else {
            document.getElementById('date-end').value = dateStr;
        }
    });

    // 6. Quand on lâche la souris -> On lance le filtre
    dateSlider.noUiSlider.on('change', function() {
        applyFilters();
    });
}

// Fonction appelée quand on change l'input date à la main
function manualDateChange() {
    var startVal = document.getElementById('date-start').value;
    var endVal = document.getElementById('date-end').value;

    // Si le slider est actif, on met à jour ses poignées
    if (dateSlider && dateSlider.noUiSlider && startVal && endVal) {
        var startTs = new Date(startVal).getTime();
        var endTs = new Date(endVal).getTime();
        dateSlider.noUiSlider.set([startTs, endTs]);
    }
    applyFilters();
}

// ============================================================
// 3. FONCTIONS UTILITAIRES & FILTRES
// ============================================================

// Change l'affichage (Collecte / Liste / Galerie)
function changeView(mode) {
    var body = document.body;
    body.classList.remove('view-collecte', 'view-liste', 'view-galerie');
    body.classList.add('view-' + mode);

    // Le filtre est relancé pour re-générer la vue correcte
    applyFilters(false);
}

// Convertit 25/12/2025 ou 2025-12-25T10:00 en 2025-12-25
function normalizeDate(str) {
    if (!str) return "";
    var clean = str.substring(0, 10);
    // Si format français JJ/MM/AAAA
    if (clean.indexOf('/') !== -1) {
        var parts = clean.split('/');
        if (parts.length === 3) return parts[2] + '-' + parts[1] + '-' + parts[0];
    }
    return clean;
}

function populateFilters() {
    var maps = [
        { id: 'sel-cat', key: 'Categorie' },
        { id: 'sel-pays', key: 'Pays' },
        { id: 'sel-year', key: 'Millesime' },
        { id: 'sel-theme', key: 'Theme' },
        { id: 'sel-coll', key: 'Collecteur' }
    ];
    maps.forEach(function(m) {
        var select = document.getElementById(m.id);
        if (!select) return;

        var currentVal = select.value;
        var h = '<option value="">Tout</option>';
        // Récupère valeurs uniques triées
        var unique = [];
        var seen = {};
        allData.forEach(function(item) {
            var v = item[m.key];
            if (v && !seen[v]) {
                seen[v] = true;
                unique.push(v);
            }
        });
        unique.sort().forEach(function(val) {
            h += '<option value="' + val + '"' + (val === currentVal ? ' selected' : '') + '>' + val + '</option>';
        });
        select.innerHTML = h;
    });
}

function applyFilters(silent) {
    if (silent === undefined) silent = false;
    // Si on est sur une page sans grille, on arrête
    var grid = document.getElementById('cards-grid');
    if (!grid) return;

    var searchInput = document.getElementById('search-input');
    var s = searchInput ? searchInput.value.toLowerCase() : '';
    var fCat = document.getElementById('sel-cat').value;
    var fPays = document.getElementById('sel-pays').value;
    var fYear = document.getElementById('sel-year').value;
    var fTheme = document.getElementById('sel-theme').value;
    var fColl = document.getElementById('sel-coll').value;

    // Dates (Input text YYYY-MM-DD)
    var fStart = document.getElementById('date-start').value;
    var fEnd = document.getElementById('date-end').value;

    currentData = allData.filter(function(item) {
        var txt = !s || (item.NomBillet && item.NomBillet.toLowerCase().indexOf(s) !== -1) ||
            (item.Ville && item.Ville.toLowerCase().indexOf(s) !== -1) ||
            (item.Reference && item.Reference.toLowerCase().indexOf(s) !== -1) ||
            (item.Recherche && item.Recherche.toLowerCase().indexOf(s) !== -1);

        // Comparaison de dates normalisées
        var itemDate = normalizeDate(item.Date);
        var matchDate = (!fStart || (itemDate && itemDate >= fStart)) &&
            (!fEnd || (itemDate && itemDate <= fEnd));

        return txt && matchDate &&
            (!fCat || item.Categorie === fCat) &&
            (!fPays || item.Pays === fPays) && (!fYear || item.Millesime == fYear) &&
            (!fTheme || item.Theme === fTheme) && (!fColl || item.Collecteur === fColl);
    });

    if (!silent) {
        // Vider l'affichage
        grid.innerHTML = "";
        displayedCount = 0;

        // Si le mode Liste est actif, on affiche le tableau, sinon la grille/galerie.
        if (document.body.classList.contains('view-liste')) {
            renderListTable();
        } else {
            // S'assure que le conteneur du tableau est vide si on passe en grille/galerie
            var listTableContainer = document.getElementById('list-table-container');
            if (listTableContainer) listTableContainer.innerHTML = "";
            showMore();
        }
    } else {
        updateLoadMoreButton();
    }

    // Mise à jour compteur global
    var counterBtn = document.getElementById('counter');
    if (counterBtn) counterBtn.innerText = currentData.length + " billets";
}

// ============================================================
// 4. RENDU HTML (TEMPLATES POUR 3 MODES)
// ============================================================

// --- Rendu Mode Liste (Tableau) ---
function renderListTable() {
    var tableContainer = document.getElementById('list-table-container');
    if (!tableContainer) return;

    if (currentData.length === 0) {
        tableContainer.innerHTML = "<p style='text-align:center;'>Aucun résultat.</p>";
        updateLoadMoreButton();
        return;
    }

    var html =
        '<table id="billets-table">' +
        '<thead><tr>' +
        '<th>N°</th><th>Année-Version</th><th>Dép.</th><th>Réf.</th>' +
        '<th>Ville</th><th>Nom Billet</th><th>Collecteur</th><th>Commentaire</th>' +
        '</tr></thead><tbody>';

    currentData.forEach(function(item) {
        html +=
            '<tr>' +
            '<td>' + (item.id || '') + '</td>' +
            '<td>' + (item.Millesime || 'XXXX') + '-' + (item.Version || 'X') + '</td>' +
            '<td>' + (item.Dep || '') + '</td>' +
            '<td class="col-ref">' + (item.Reference || '') + '</td>' +
            '<td>' + (item.Ville || '') + '</td>' +
            '<td>' + (item.NomBillet || '') + '</td>' +
            '<td>' + (item.Collecteur || '') + '</td>' +
            '<td class="col-comment">' + (item.Commentaire || '') + '</td>' +
            '</tr>';
    });

    html += '</tbody></table>';
    tableContainer.innerHTML = html;

    // On masque le bouton Load More car le tableau affiche tout
    var btn = document.getElementById('btn-load-more');
    if (btn) btn.style.display = 'none';
}


// --- Rendu Mode Collecte & Galerie ---
function showMore() {
    var body = document.body;
    var grid = document.getElementById('cards-grid');
    var batch = currentData.slice(displayedCount, displayedCount + BATCH_SIZE);

    var isGalleryMode = body.classList.contains('view-galerie');

    if (batch.length === 0 && displayedCount === 0) {
        grid.innerHTML = "<p style='grid-column: 1/-1; text-align:center;'>Aucun résultat.</p>";
        updateLoadMoreButton(); return;
    }

    var html = "";
    batch.forEach(function(item) {
        // Image HD
        var imgUrl = item.ImageId ? 'https://drive.google.com/thumbnail?id=' + item.ImageId + '&sz=w800' : '';
        var downloadLink = item.ImageId ? 'https://drive.usercontent.google.com/download?id=' + item.ImageId : '#';
        var couleur = getCategorieColor(item.Categorie);

        if (isGalleryMode) {
            // RENDU MODE GALERIE
            html +=
                '<div class="galerie-item" onclick="openModal(\'' + imgUrl + '\')">' +
                (item.ImageId
                    ? '<img src="' + imgUrl + '" class="galerie-image" alt="' + (item.NomBillet || 'Billet') + '">'
                    : '<div style="text-align:center; color:#999; font-size:0.8em; padding:10px;">Image manquante<br>' + (item.Reference || '') + '</div>'
                ) +
                '</div>';

        } else {
            // RENDU MODE COLLECTE (par défaut)
            html +=
                '<div class="global-container" style="border-top: 8px solid ' + couleur + ';">' +
                '<div class="header-container">' +
                '<div class="image-bg" style="background: linear-gradient(to bottom, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 0.6) 100%), url(' + imgUrl + ') no-repeat;"></div>' +
                '<div class="category" style="background-color: ' + couleur + '; color: ' + (item.Categorie === 'Pré collecte' ? '#9e9e9eff' : 'white') + ';">' +
                (item.Categorie || '') +
                '</div>' +
                '</div>' +
                '<div class="city-strip" style="color: ' + couleur + '; background-color: color-mix(in srgb, ' + couleur + ', #e0e0e0 70%);">' +
                (item.Ville || '') +
                '</div>' +
                '<div class="content">' +
                '<div class="description">' +
                (item.Dep || '') + ' ' + (item.Reference || '') + ' ' + (item.Millesime || '') + '-' + (item.Version || '') + '<br />' +
                (item.Cp || '') + ' ' + (item.Ville || '') + '<br />' +
                (item.NomBillet || '') +
                '</div>' +
                '<div>' +
                'Par ' + (item.Collecteur || '?') + ' au prix de ' + (item.Prix || '?') + ' euros ' + (item.FDP_Com || '') +
                '</div>' +
                '<div style="margin-top:15px;">' +
                'Commentaire : ' + (item.Commentaire || '') +
                '</div>' +
                '</div>' +
                '<div class="more">' +
                '<center>' +
                '<table class="dates">' +
                '<tr><td>Pré Collecte :</td><td><b>' + (item.DatePre || '') + '</b></td></tr>' +
                '<tr><td>Collecte :</td><td><b>' + (item.DateColl || '') + '</b></td></tr>' +
                '<tr><td>Terminé :</td><td><b>' + (item.DateFin || '') + '</b></td></tr>' +
                '</table>' +
                '</center>' +
                '</div>' +
                '<div class="more">' +
                '<center>' + (item.CompteurBT || '') + '</center>' +
                '</div>' +
                '<div class="more action-icons">' +
                (item.Sondage
                    ? '<a href="' + item.Sondage + '" target="_blank" class="icon-btn ico-form" title="Répondre au sondage"><i class="fa-solid fa-clipboard-question"></i></a>'
                    : '') +
                (item.LinkSheet
                    ? '<a href="' + item.LinkSheet + '" target="_blank" class="icon-btn ico-sheet" title="Voir le fichier Excel"><i class="fa-solid fa-file-csv"></i></a>'
                    : '') +
                (item.LinkFB
                    ? '<a href="' + item.LinkFB + '" target="_blank" class="icon-btn ico-fb" title="Voir sur Facebook"><i class="fa-brands fa-facebook"></i></a>'
                    : '') +
                (item.ImageId
                    ? '<a href="' + downloadLink + '" target="_blank" class="icon-btn ico-dl" title="Télécharger l\'image HD"><i class="fa-solid fa-download"></i></a>'
                    : '') +
                '<span style="font-size:10px; color:#ccc; align-self:center;">(n°' + (item.id || '') + ')</span>' +
                '</div>' +
                '</div>';
        }
    });

    grid.insertAdjacentHTML('beforeend', html);
    displayedCount += batch.length;
    updateLoadMoreButton();
}


function updateLoadMoreButton() {
    var btn = document.getElementById('btn-load-more');
    if (!btn) return;

    // Le bouton doit être masqué UNIQUEMENT en mode Liste (qui affiche tout d'un coup)
    var isListMode = document.body.classList.contains('view-liste');

    if (isListMode) {
        btn.style.display = 'none';
        return;
    }

    // Le bouton doit être visible si le nombre de billets affichés est inférieur au total filtré
    if (displayedCount < currentData.length) {
        btn.style.display = 'inline-block';
        btn.innerText = 'Voir la suite (' + (currentData.length - displayedCount) + ')';
    } else {
        btn.style.display = 'none';
    }
}

// ============================================================
// 5. GESTION DU MODAL (ZOOM GALERIE)
// ============================================================
function openModal(imgUrl) {
    var modal = document.getElementById('image-modal');
    var modalImg = document.getElementById('modal-image');

    modal.classList.remove('hidden');

    // Utiliser une taille d'image plus grande pour le zoom
    modalImg.src = imgUrl.replace('sz=w800', 'sz=w1600');

    // Empêche le scroll de la page derrière
    document.body.style.overflow = 'hidden';
}

function closeModal() {
    var modal = document.getElementById('image-modal');

    modal.classList.add('hidden');

    // Rétablit le scroll de la page
    document.body.style.overflow = 'auto';
}
