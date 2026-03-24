// ============================================================
// CONFIGURATION — Version Supabase (Story 4.7)
// ============================================================

// SEC-02 — Fonctions d'echappement pour empecher les XSS
function escapeHtml(text) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(text));
    return div.innerHTML;
}

function escapeAttr(text) {
    return String(text).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function sanitizeUrl(url) {
    if (!url) return '';
    var trimmed = url.trim();
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    return '';
}

var allData = [];
var currentData = [];
var displayedCount = 0;
var BATCH_SIZE = 50;

// #14 — Onboarding catalogue billets
function showCatalogueOnboarding() {
    var key = 'bt_onboarding_catalogue_dismissed';
    if (localStorage.getItem(key)) return;

    var target = document.querySelector('header');
    if (!target) return;

    var html = '<div class="onboarding-banner onboarding-banner--compact" id="onboarding-catalogue">'
        + '<button class="onboarding-close" onclick="dismissOnboardingCatalogue()" aria-label="Fermer"><i class="fa-solid fa-xmark"></i></button>'
        + '<h3 class="onboarding-title"><i class="fa-solid fa-hand-point-up"></i> Comment s\'inscrire à une collecte ?</h3>'
        + '<p class="onboarding-text">Parcourez les billets ci-dessous. Quand une collecte vous intéresse, '
        + 'cliquez sur le bouton <strong>« S\'inscrire »</strong> sur la fiche du billet. '
        + 'Choisissez la quantité souhaitée, puis validez. '
        + 'Vous retrouverez ensuite toutes vos inscriptions dans <a href="mes-inscriptions.html"><strong>Mes inscriptions</strong></a>.</p>'
        + '</div>';

    target.insertAdjacentHTML('afterend', html);
}

function dismissOnboardingCatalogue() {
    localStorage.setItem('bt_onboarding_catalogue_dismissed', '1');
    var el = document.getElementById('onboarding-catalogue');
    if (el) el.remove();
}

// Story 5.4 : Inscriptions du membre connecté et collecteurs
var mesInscriptions = {};
var collecteursMap = {};

// Frais de port dynamiques
var fraisPortCatalogue = [];
var membrePaysCatalogue = '';

// Story 5.12 : Compteurs BT automatiques
var compteurInscriptionsMap = {};

// Filtre par catégorie actif
var billetsActiveStatusFilter = 'tous';

// Catégories dans l'ordre d'affichage
var BILLETS_CATEGORIES = [
    'Pré collecte',
    'Collecte',
    'Terminé',
    'Pas de collecte',
    'Jamais édité, projet'
];

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

function getTextColorForBg(hex) {
    if (!hex || hex.charAt(0) !== '#') return '#000';
    var r = parseInt(hex.substr(1, 2), 16);
    var g = parseInt(hex.substr(3, 2), 16);
    var b = parseInt(hex.substr(5, 2), 16);
    return (r * 0.299 + g * 0.587 + b * 0.114) > 150 ? '#000' : '#fff';
}

// Resolution image — priorite ImageUrl (Cloudinary) > ImageId (Google Drive)
function resolveImageUrl(item, size) {
    if (item.ImageUrl) {
        return item.ImageUrl.replace('/upload/', '/upload/f_auto,q_auto,w_' + (size || 800) + '/');
    }
    if (item.ImageId) {
        return 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(item.ImageId) + '&sz=w' + (size || 800);
    }
    return '';
}

function resolveDownloadUrl(item) {
    if (item.ImageUrl) {
        return item.ImageUrl;
    }
    if (item.ImageId) {
        return 'https://drive.usercontent.google.com/download?id=' + encodeURIComponent(item.ImageId);
    }
    return '#';
}

// Référence au slider (div vide dans le HTML)
var dateSlider = document.getElementById('date-slider');

document.addEventListener('DOMContentLoaded', function() {
    // S'assure que le mode par défaut (Collecte) est activé au chargement
    document.body.classList.add('view-collecte');
});

// Le chargement des données est déclenché après confirmation de l'auth Firebase.
// global.js gère les redirections et les membres ; app-new.js se contente d'écouter.
if (typeof firebase !== 'undefined') {
    firebase.auth().onAuthStateChanged(function(user) {
        if (user) {
            showCatalogueOnboarding();
            fetchData();
            loadMesInscriptions();
            loadCollecteursForCatalogue();
            loadCompteursInscriptions();
            loadFraisPortCatalogue(window.getActiveEmail());
            loadBlacklistMembre(window.getActiveEmail());
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

            // Lien direct : ?billet=ID → scroll + ouverture formulaire
            handleDeepLinkBillet();
        })
        .catch(function(err) {
            console.error("Erreur chargement Supabase :", err);
            if (counter) {
                counter.innerText = "Erreur !";
                counter.style.backgroundColor = "var(--color-danger, #CC4444)";
                counter.style.color = "#fff";
            }
            var grid = document.getElementById('cards-grid');
            if (grid) {
                grid.innerHTML =
                    '<div style="grid-column:1/-1; text-align:center; padding:40px; color:var(--color-danger, #CC4444);">' +
                    '<i class="fa-solid fa-circle-exclamation" style="font-size:2em; margin-bottom:12px; display:block;"></i>' +
                    '<strong>Impossible de charger les billets.</strong><br>' +
                    '<span style="color:var(--color-text-light, #666); font-size:0.9em;">' + escapeHtml(err.message || 'Erreur réseau') + ' — Réessaye dans quelques instants.</span>' +
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
    if (dateSlider && dateSlider.noUiSlider) {
        dateSlider.noUiSlider.destroy();
    }
    if (!dateSlider) return;

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
            h += '<option value="' + escapeAttr(val) + '"' + (val === currentVal ? ' selected' : '') + '>' + escapeHtml(val) + '</option>';
        });
        select.innerHTML = h;
    });

    renderBilletsStatusCounters();
}

function renderBilletsStatusCounters(filteredData) {
    var container = document.getElementById('billets-status-counters');
    if (!container) return;

    var source = filteredData || allData;
    var counts = {};
    var total = source.length;
    source.forEach(function(billet) {
        var statut = billet.Categorie || 'Non defini';
        counts[statut] = (counts[statut] || 0) + 1;
    });

    var statutOrder = BILLETS_CATEGORIES.slice();
    Object.keys(counts).forEach(function(s) {
        if (statutOrder.indexOf(s) === -1) statutOrder.push(s);
    });

    var html = '<button class="admin-status-counter' +
        (billetsActiveStatusFilter === 'tous' ? ' admin-status-counter--active' : '') +
        '" data-status="tous" onclick="billetsFilterByStatus(\'tous\')" aria-pressed="' +
        (billetsActiveStatusFilter === 'tous' ? 'true' : 'false') + '">' +
        '<span class="admin-status-counter__count">' + total + '</span>' +
        '<span class="admin-status-counter__label">Tous</span></button>';

    statutOrder.forEach(function(statut) {
        if (!counts[statut]) return;
        var isActive = billetsActiveStatusFilter === statut;
        var color = getCategorieColor(statut);
        html += '<button class="admin-status-counter' +
            (isActive ? ' admin-status-counter--active' : '') +
            '" data-status="' + statut.replace(/"/g, '&quot;') + '" onclick="billetsFilterByStatus(\'' +
            statut.replace(/'/g, "\\'") + '\')" aria-pressed="' +
            (isActive ? 'true' : 'false') +
            '" style="border-left-color: ' + color + ';">' +
            '<span class="admin-status-counter__count">' + counts[statut] + '</span>' +
            '<span class="admin-status-counter__label">' + escapeHtml(statut) + '</span></button>';
    });

    container.innerHTML = html;
}

function billetsFilterByStatus(statut) {
    billetsActiveStatusFilter = statut;
    renderBilletsStatusCounters();
    applyFilters();
}

function applyFilters(silent) {
    if (silent === undefined) silent = false;
    // Si on est sur une page sans grille, on arrête
    var grid = document.getElementById('cards-grid');
    if (!grid) return;

    var searchInput = document.getElementById('search-input');
    var s = searchInput ? searchInput.value.toLowerCase() : '';
    var fCat = billetsActiveStatusFilter !== 'tous' ? billetsActiveStatusFilter : '';
    var fPays = document.getElementById('sel-pays').value;
    var fYear = document.getElementById('sel-year').value;
    var fTheme = document.getElementById('sel-theme').value;
    var fColl = document.getElementById('sel-coll').value;

    // Dates (Input text YYYY-MM-DD)
    var fStart = document.getElementById('date-start').value;
    var fEnd = document.getElementById('date-end').value;

    // Filtre sans la catégorie pour mettre à jour les compteurs des chips
    var preFiltered = allData.filter(function(item) {
        var txt = !s || (item.NomBillet && item.NomBillet.toLowerCase().indexOf(s) !== -1) ||
            (item.Ville && item.Ville.toLowerCase().indexOf(s) !== -1) ||
            (item.Reference && item.Reference.toLowerCase().indexOf(s) !== -1) ||
            (item.Recherche && item.Recherche.toLowerCase().indexOf(s) !== -1);

        var itemDate = normalizeDate(item.Date);
        var matchDate = (!fStart || (itemDate && itemDate >= fStart)) &&
            (!fEnd || (itemDate && itemDate <= fEnd));

        return txt && matchDate &&
            (!fPays || item.Pays === fPays) && (!fYear || item.Millesime == fYear) &&
            (!fTheme || item.Theme === fTheme) && (!fColl || item.Collecteur === fColl);
    });

    renderBilletsStatusCounters(preFiltered);

    // Puis filtre par catégorie pour l'affichage
    if (fCat) {
        currentData = preFiltered.filter(function(item) {
            return (item.Categorie || 'Non defini') === fCat;
        });
    } else {
        currentData = preFiltered;
    }

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
            '<td>' + escapeHtml((item.Millesime || 'XXXX') + '-' + (item.Version || 'X')) + '</td>' +
            '<td>' + escapeHtml(item.Dep || '') + '</td>' +
            '<td class="col-ref">' + escapeHtml(item.Reference || '') + '</td>' +
            '<td>' + escapeHtml(item.Ville || '') + '</td>' +
            '<td>' + escapeHtml(item.NomBillet || '') + '</td>' +
            '<td>' + escapeHtml(item.Collecteur || '') + '</td>' +
            '<td class="col-comment">' + escapeHtml(item.Commentaire || '') + '</td>' +
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
        // Image — priorité ImageUrl (Cloudinary) > ImageId (Google Drive)
        var imgUrl = resolveImageUrl(item, 800);
        var downloadLink = resolveDownloadUrl(item);
        var couleur = getCategorieColor(item.Categorie);

        if (isGalleryMode) {
            // RENDU MODE GALERIE
            html +=
                '<div class="galerie-item" onclick="openModal(\'' + escapeAttr(imgUrl) + '\')">' +
                (imgUrl
                    ? '<img src="' + escapeAttr(imgUrl) + '" class="galerie-image" alt="' + escapeAttr(item.NomBillet || 'Billet') + '">'
                    : '<div style="text-align:center; color:#999; font-size:0.8em; padding:10px;">Image manquante<br>' + escapeHtml(item.Reference || '') + '</div>'
                ) +
                '</div>';

        } else {
            // RENDU MODE COLLECTE (par défaut)
            var inscriptionHtml = buildInscriptionHtml(item);
            var pasInteresse = mesInscriptions[item.id] && mesInscriptions[item.id].pas_interesse;
            html +=
                '<div class="global-container' + (pasInteresse ? ' carte-pas-interesse' : '') + '" data-billet-id="' + item.id + '" style="border-top: 8px solid ' + couleur + ';">' +
                '<div class="header-container">' +
                '<div class="image-bg" style="background: linear-gradient(to bottom, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 0.6) 100%), url(' + escapeAttr(imgUrl) + ') no-repeat;"></div>' +
                '<div class="category" style="background-color: ' + couleur + '; color: ' + (item.Categorie === 'Pré collecte' ? 'var(--color-text-light, #9e9e9e)' : '#fff') + ';">' +
                escapeHtml(item.Categorie || '') +
                '</div>' +
                '</div>' +
                '<div class="city-strip" style="color: ' + couleur + '; background-color: color-mix(in srgb, ' + couleur + ', #e0e0e0 70%);">' +
                escapeHtml(item.Ville || '') +
                '</div>' +
                '<div class="content">' +
                '<div class="description">' +
                escapeHtml(item.Dep || '') + ' ' + escapeHtml(item.Reference || '') + ' ' + escapeHtml(item.Millesime || '') + '-' + escapeHtml(item.Version || '') + '<br />' +
                escapeHtml(item.Cp || '') + ' ' + escapeHtml(item.Ville || '') + '<br />' +
                escapeHtml(item.NomBillet || '') +
                '</div>' +
                buildVersionBadgesHtml(item) +
                (function() {
                    var parts = [];
                    if (item.Collecteur) parts.push('Par ' + escapeHtml(item.Collecteur));

                    var versionNormaleExiste = item.VersionNormaleExiste !== false;
                    var varianteVal = item.HasVariante || '';
                    var varianteActive = varianteVal && varianteVal !== 'N';

                    var prixNormal = item.Prix ? parseFloat(item.Prix) : 0;
                    var prixVar = (item.PrixVariante !== null && item.PrixVariante !== undefined && item.PrixVariante !== '') ? parseFloat(item.PrixVariante) : prixNormal;

                    // Calcul FDP si demandé
                    var fdpInfo = '';
                    if (item.PayerFDP === 'oui' && membrePaysCatalogue) {
                        var destCat = (membrePaysCatalogue === 'France') ? 'france' : 'international';
                        var fdpBase = findFdpPriceCatalogue(1, destCat, 'normal');
                        if (fdpBase > 0) fdpInfo = ' + ' + fdpBase.toFixed(2) + '\u20AC fdp';
                    }

                    if (!versionNormaleExiste && varianteActive && prixVar) {
                        // Uniquement variante
                        parts.push('au prix de ' + prixVar.toFixed(2) + ' euros' + fdpInfo + ' uniquement ' + varianteVal);
                    } else if (versionNormaleExiste && varianteActive && prixNormal) {
                        // Normale + variante
                        parts.push('au prix de ' + prixNormal.toFixed(2) + ' euros version normale & ' + prixVar.toFixed(2) + ' euros version ' + varianteVal + fdpInfo);
                    } else if (prixNormal) {
                        // Normale seule
                        parts.push('au prix de ' + prixNormal.toFixed(2) + ' euros' + fdpInfo);
                    }

                    if (parts.length === 0) return '';
                    return '<div>' + parts.join(' ') + ' ' + escapeHtml(item.FDP_Com || '') + '</div>';
                })() +
                '<div style="margin-top:15px;">' +
                'Commentaire : ' + escapeHtml(item.Commentaire || '') +
                '</div>' +
                '</div>' +
                '<div class="more">' +
                '<center>' +
                '<table class="dates">' +
                '<tr><td>Pré Collecte :</td><td><b>' + escapeHtml(item.DatePre || '') + '</b></td></tr>' +
                '<tr><td>Collecte :</td><td><b>' + escapeHtml(item.DateColl || '') + '</b></td></tr>' +
                '<tr><td>Terminé :</td><td><b>' + escapeHtml(item.DateFin || '') + '</b></td></tr>' +
                '</table>' +
                '</center>' +
                '</div>' +
                '<div class="more">' +
                '<center>' + getCompteurBT(item) + '</center>' +
                '</div>' +
                '<div class="more action-icons">' +
                (function() {
                    // Masquer les liens Google pour les collectes terminées et les billets non actifs
                    var cat = item.Categorie || '';
                    var hideGoogle = (cat === 'Terminé' || cat === 'Non défini' || cat === 'Jamais édité, projet' || cat === 'Pas de collecte');
                    return ((!hideGoogle && sanitizeUrl(item.Sondage))
                        ? '<a href="' + escapeAttr(sanitizeUrl(item.Sondage)) + '" target="_blank" class="icon-btn ico-form" title="Répondre au sondage"><i class="fa-solid fa-clipboard-question"></i></a>'
                        : '') +
                    ((!hideGoogle && sanitizeUrl(item.LinkSheet))
                        ? '<a href="' + escapeAttr(sanitizeUrl(item.LinkSheet)) + '" target="_blank" class="icon-btn ico-sheet" title="Voir le fichier Excel"><i class="fa-solid fa-file-csv"></i></a>'
                        : '');
                })() +
                (sanitizeUrl(item.LinkFB)
                    ? '<a href="' + escapeAttr(sanitizeUrl(item.LinkFB)) + '" target="_blank" class="icon-btn ico-fb" title="Voir sur Facebook"><i class="fa-brands fa-facebook"></i></a>'
                    : '') +
                (imgUrl
                    ? '<a href="' + escapeAttr(downloadLink) + '" target="_blank" class="icon-btn ico-dl" title="Télécharger l\'image HD"><i class="fa-solid fa-download"></i></a>'
                    : '') +
                '<span style="font-size:10px; color:#ccc; align-self:center;">(n°' + (item.id || '') + ')</span>' +
                '</div>' +
                inscriptionHtml +
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

    // Zoom : résolution plus grande selon la source
    if (imgUrl.indexOf('cloudinary.com') !== -1) {
        modalImg.src = imgUrl.replace('/w_800/', '/w_1600/');
    } else {
        modalImg.src = imgUrl.replace('sz=w800', 'sz=w1600');
    }

    // Empêche le scroll de la page derrière
    document.body.style.overflow = 'hidden';
}

function closeModal() {
    var modal = document.getElementById('image-modal');

    modal.classList.add('hidden');

    // Rétablit le scroll de la page
    document.body.style.overflow = 'auto';
}

// ============================================================
// 6. INSCRIPTIONS — Story 5.4
// ============================================================

// --- Toast notification ---
function showToast(message, type) {
    var toast = document.createElement('div');
    toast.className = 'toast toast-' + (type || 'success');
    toast.textContent = message;
    document.body.appendChild(toast);
    if (type === 'error') {
        toast.onclick = function() { toast.remove(); };
    } else {
        setTimeout(function() {
            if (toast.parentNode) toast.remove();
        }, 4000);
    }
}

// --- Chargement des inscriptions du membre connecté ---
function loadMesInscriptions() {
    var email = window.getActiveEmail();
    if (!email) return;
    supabaseFetch('/rest/v1/inscriptions?membre_email=eq.' + encodeURIComponent(email) + '&select=id,billet_id,nb_normaux,nb_variantes,statut_paiement,envoye,pas_interesse')
        .then(function(data) {
            mesInscriptions = {};
            (data || []).forEach(function(insc) {
                mesInscriptions[insc.billet_id] = insc;
            });
            applyFilters(false);
        })
        .catch(function(error) {
            console.warn('Erreur chargement inscriptions:', error);
        });
}

// --- Chargement des collecteurs pour liens contact ---
function loadCollecteursForCatalogue() {
    supabaseFetch('/rest/v1/collecteurs?select=alias,paypal_email,paypal_me')
        .then(function(data) {
            (data || []).forEach(function(c) {
                collecteursMap[c.alias] = c;
            });
        })
        .catch(function(error) {
            console.warn('Erreur chargement collecteurs catalogue:', error);
        });
}

// --- Chargement de la blacklist pour le membre connecté ---
// Stocke les alias des collecteurs qui ont blacklisté ce membre
var blacklistCollecteurs = {};

function loadBlacklistMembre(email) {
    supabaseFetch('/rest/v1/collecteur_blacklist?membre_email=eq.' + encodeURIComponent(email) + '&select=collecteur_alias')
        .then(function(data) {
            blacklistCollecteurs = {};
            (data || []).forEach(function(e) {
                blacklistCollecteurs[e.collecteur_alias] = true;
            });
        })
        .catch(function(error) {
            console.warn('Erreur chargement blacklist membre:', error);
        });
}

// --- Story 5.12 : Compteurs BT automatiques ---
function loadCompteursInscriptions() {
    supabaseFetch('/rest/v1/rpc/compteurs_inscriptions')
        .then(function(compteurs) {
            compteurInscriptionsMap = {};
            (compteurs || []).forEach(function(c) {
                compteurInscriptionsMap[c.billet_id] = {
                    normaux: c.total_normaux || 0,
                    variantes: c.total_variantes || 0
                };
            });
        })
        .catch(function(error) {
            console.warn('Compteurs inscriptions non disponibles:', error);
        });
}

// --- Chargement frais de port et pays du membre pour le catalogue ---
function loadFraisPortCatalogue(email) {
    var annee = new Date().getFullYear();
    Promise.all([
        supabaseFetch('/rest/v1/frais_port?annee=eq.' + annee + '&select=*'),
        supabaseFetch('/rest/v1/membres?email=eq.' + encodeURIComponent(email) + '&select=pays')
    ])
    .then(function(results) {
        fraisPortCatalogue = results[0] || [];
        membrePaysCatalogue = (results[1] && results[1][0]) ? (results[1][0].pays || '') : '';
    })
    .catch(function(error) {
        console.warn('Erreur chargement frais de port catalogue:', error);
    });
}

function findFdpPriceCatalogue(nbBillets, destination, typeEnvoi) {
    for (var i = 0; i < fraisPortCatalogue.length; i++) {
        var r = fraisPortCatalogue[i];
        if (r.destination === destination && r.type_envoi === typeEnvoi &&
            nbBillets >= r.qte_min && nbBillets <= r.qte_max) {
            return parseFloat(r.prix);
        }
    }
    return 0;
}

function getCompteurBT(item) {
    var isInscriptionSite = !item.LinkSheet && !item.Sondage;
    if (isInscriptionSite && compteurInscriptionsMap[item.id]) {
        var c = compteurInscriptionsMap[item.id];
        var parts = [];
        if (c.normaux > 0) {
            parts.push(c.normaux + ' billet' + (c.normaux > 1 ? 's' : ''));
        }
        if (c.variantes > 0) {
            var nomVariante = item.HasVariante || 'variante';
            parts.push(c.variantes + ' billet' + (c.variantes > 1 ? 's' : '') + ' ' + nomVariante);
        }
        return parts.join(' + ') || '';
    }
    return item.CompteurBT || '';
}

// --- Badge paiement pour le catalogue ---
function badgePaiementCatalogue(statut, montant) {
    statut = statut || 'non_paye';
    if (statut === 'confirme') {
        return '<span class="badge-paiement badge-paye">Payé</span>';
    }
    if (statut === 'declare') {
        return '<span class="badge-paiement badge-declare">En attente de confirmation</span>';
    }
    return '<span class="badge-paiement badge-non-paye">Non payé — ' + montant.toFixed(2) + ' €</span>';
}

// --- Génération des badges version (normale / variante) ---
function buildVersionBadgesHtml(item) {
    var versionNormaleExiste = item.VersionNormaleExiste !== false;
    var varianteVal = item.HasVariante || '';
    var varianteActive = varianteVal && varianteVal !== 'N';
    var html = '<div class="version-badges">';
    if (!versionNormaleExiste) {
        html += '<span class="version-badge version-badge--warning"><i class="fa-solid fa-triangle-exclamation"></i> Pas de version normale</span>';
    }
    if (varianteActive) {
        html += '<span class="version-badge version-badge--variante"><i class="fa-solid fa-star"></i> ' + escapeHtml(varianteVal) + '</span>';
    } else if (varianteVal === 'N') {
        html += '<span class="version-badge version-badge--no-variante">Pas de variante</span>';
    }
    html += '</div>';
    return html;
}

// --- Génération du HTML d'inscription pour une carte ---
function buildInscriptionHtml(item) {
    var inscription = mesInscriptions[item.id];
    var collecteOuverte = (item.Categorie === 'Pré collecte' || item.Categorie === 'Collecte') &&
        !item.DateFin;

    var html = '';
    if (inscription && !inscription.pas_interesse) {
        // Inscrit — badges + contact collecteur
        var prixNormal = parseFloat(item.Prix || 0);
        var prixVar = (item.PrixVariante !== null && item.PrixVariante !== undefined && item.PrixVariante !== '') ? parseFloat(item.PrixVariante) : prixNormal;
        var montant = (prixNormal * (inscription.nb_normaux || 0)) + (prixVar * (inscription.nb_variantes || 0));
        html = '<div class="inscription-badges">'
            + '<span class="badge-inscrit">Inscrit</span>'
            + badgePaiementCatalogue(inscription.statut_paiement, montant)

            + '</div>';
        // Bouton contacter le collecteur
        var collecteurInfo = collecteursMap[item.Collecteur] || {};
        var contactEmail = collecteurInfo.paypal_email || '';
        if (contactEmail) {
            html += '<a href="mailto:' + escapeAttr(contactEmail) + '" class="btn-contacter-collecteur">Contacter le collecteur</a>';
        }
    } else if (inscription && inscription.pas_interesse) {
        // Pas intéressé
        html = '<div class="inscription-badges">'
            + '<span class="badge-pas-interesse">Pas intéressé</span>'
            + '<button onclick="annulerPasInteresse(' + item.id + ')" class="btn-annuler-pas-interesse">Annuler</button>'
            + '</div>';
    } else if (collecteOuverte) {
        // Non inscrit, collecte ouverte
        var isInscriptionSite = !item.LinkSheet && !item.Sondage;
        if (isInscriptionSite) {
            // Vérifier si le membre est blacklisté par le collecteur de ce billet
            var isBlackliste = item.Collecteur && blacklistCollecteurs[item.Collecteur];
            if (isBlackliste) {
                html = '<div class="inscription-badges">'
                    + '<span class="badge-non-inscrit">Non inscrit</span>'
                    + '<button class="btn-inscription-impossible" disabled><i class="fa-solid fa-ban"></i> Inscription impossible</button>'
                    + '</div>';
            } else {
                html = '<div class="inscription-badges">'
                    + '<span class="badge-non-inscrit">Non inscrit</span>'
                    + '<button onclick="ouvrirInscription(' + item.id + ')" class="btn-sinscrire"><i class="fa-solid fa-pen-to-square"></i> S\'inscrire</button>'
                    + '<button onclick="marquerPasInteresse(' + item.id + ')" class="btn-pas-interesse">Pas intéressé</button>'
                    + '</div>';
            }
        }
    }
    return html;
}

// --- Ouverture du mini-formulaire inline ---
function ouvrirInscription(billetId) {
    isProfilComplet(function(complet) {
        if (!complet) {
            showToast('Complétez votre profil avant de vous inscrire', 'error');
            setTimeout(function() {
                window.location.href = 'profil.html?from=inscription&billet=' + billetId;
            }, 1500);
            return;
        }
        var billet = allData.find(function(b) { return b.id === billetId; });
        if (!billet) return;
        var varianteActive = billet.HasVariante && billet.HasVariante !== 'N';
        var versionNormaleExiste = billet.VersionNormaleExiste !== false;
        var champNormaux = (!varianteActive || versionNormaleExiste)
            ? '<div class="mini-form-field"><label>Nb normaux</label><input type="number" id="insc-nb-normaux-' + billetId + '" value="' + (varianteActive ? '0' : '1') + '" min="0"></div>'
            : '';
        var champVariantes = varianteActive
            ? '<div class="mini-form-field"><label>Nb variantes</label><input type="number" id="insc-nb-variantes-' + billetId + '" value="' + (!versionNormaleExiste ? '1' : '0') + '" min="' + (!versionNormaleExiste ? '1' : '0') + '"></div>'
            : '';
        var formHtml = '<div class="mini-inscription-form" id="inscription-form-' + billetId + '">'
            + champNormaux
            + champVariantes
            + '<div class="mini-form-field"><label>Paiement</label><select id="insc-paiement-' + billetId + '"><option value="PayPal">PayPal</option><option value="Chèque">Chèque</option></select></div>'
            + '<div class="mini-form-field"><label>Envoi</label><select id="insc-envoi-' + billetId + '"><option value="Normal">Normal</option><option value="Suivi">Suivi</option><option value="R1">Recommandé R1</option><option value="R2">Recommandé R2</option><option value="R3">Recommandé R3</option></select></div>'
            + '<div class="mini-form-field"><label>Commentaire</label><textarea id="insc-commentaire-' + billetId + '" rows="2"></textarea></div>'
            + '<div class="mini-form-actions">'
            + '<button onclick="confirmerInscription(' + billetId + ')" class="btn-confirmer-inscription">Confirmer</button>'
            + '<button onclick="annulerInscription(' + billetId + ')" class="btn-annuler-inscription">Annuler</button>'
            + '</div>'
            + '</div>';
        var card = document.querySelector('[data-billet-id="' + billetId + '"]');
        if (!card) return;
        var existingForm = card.querySelector('.mini-inscription-form');
        if (existingForm) existingForm.remove();
        card.insertAdjacentHTML('beforeend', formHtml);
    });
}

// --- Annulation du formulaire (fermeture sans soumission) ---
function annulerInscription(billetId) {
    var form = document.getElementById('inscription-form-' + billetId);
    if (form) form.remove();
}

// --- Soumission de l'inscription ---
function confirmerInscription(billetId) {
    var email = window.getActiveEmail();
    var billet = allData.find(function(b) { return b.id === billetId; });
    if (!billet) return;
    var normauxEl = document.getElementById('insc-nb-normaux-' + billetId);
    var nbNormaux = normauxEl ? parseInt(normauxEl.value) || 0 : 0;
    var variantesEl = document.getElementById('insc-nb-variantes-' + billetId);
    var nbVariantes = variantesEl ? parseInt(variantesEl.value) || 0 : 0;
    if (nbNormaux + nbVariantes === 0) {
        showToast('Sélectionnez au moins un billet', 'error');
        return;
    }

    // Charger l'adresse du profil pour le snapshot
    supabaseFetch('/rest/v1/membres?email=eq.' + encodeURIComponent(email) + '&select=nom,prenom,rue,code_postal,ville,pays')
        .then(function(membreData) {
            var adresse = membreData && membreData[0] ? membreData[0] : {};
            var body = {
                billet_id: billetId,
                membre_email: email,
                nb_normaux: nbNormaux,
                nb_variantes: nbVariantes,
                mode_paiement: document.getElementById('insc-paiement-' + billetId).value,
                mode_envoi: document.getElementById('insc-envoi-' + billetId).value,
                commentaire: (document.getElementById('insc-commentaire-' + billetId).value || '').trim(),
                adresse_snapshot: adresse,
                statut_paiement: 'non_paye',
                envoye: false,
                fdp_regles: false,
                pas_interesse: false
            };
            return supabaseFetch('/rest/v1/inscriptions', {
                method: 'POST',
                body: JSON.stringify(body)
            });
        })
        .then(function() {
            showToast('Inscription confirmée !');
            var form = document.getElementById('inscription-form-' + billetId);
            if (form) form.remove();
            loadMesInscriptions();
            // Créer l'enveloppe en_cours si elle n'existe pas encore
            if (billet.Collecteur) {
                creerEnveloppeSiAbsente(billet.Collecteur, email);
            }
        })
        .catch(function(error) {
            console.error('Erreur inscription:', error);
            showToast('Erreur lors de l\'inscription', 'error');
        });
}

function creerEnveloppeSiAbsente(collecteurAlias, membreEmail) {
    return supabaseFetch('/rest/v1/enveloppes?collecteur_alias=eq.' + encodeURIComponent(collecteurAlias) + '&membre_email=eq.' + encodeURIComponent(membreEmail) + '&statut=eq.en_cours&select=id')
        .then(function(enveloppes) {
            if (enveloppes && enveloppes.length > 0) return;
            return supabaseFetch('/rest/v1/enveloppes', {
                method: 'POST',
                body: JSON.stringify({
                    collecteur_alias: collecteurAlias,
                    membre_email: membreEmail,
                    statut: 'en_cours'
                })
            });
        })
        .catch(function(error) {
            console.warn('Erreur création enveloppe:', error);
        });
}

// --- Marquage "Pas intéressé" ---
function marquerPasInteresse(billetId) {
    var email = window.getActiveEmail();
    var billet = allData.find(function(b) { return b.id === billetId; });
    var body = {
        billet_id: billetId,
        membre_email: email,
        pas_interesse: true,
        nb_normaux: 0,
        nb_variantes: 0
    };
    supabaseFetch('/rest/v1/inscriptions', {
        method: 'POST',
        body: JSON.stringify(body)
    })
    .then(function() {
        showToast('Billet marqué "Pas intéressé"');
        loadMesInscriptions();
    })
    .catch(function(error) {
        console.error('Erreur marquage:', error);
        showToast('Erreur', 'error');
    });
}

// --- Annulation "Pas intéressé" ---
function annulerPasInteresse(billetId) {
    var inscription = mesInscriptions[billetId];
    if (!inscription) return;
    supabaseFetch('/rest/v1/inscriptions?id=eq.' + inscription.id, {
        method: 'DELETE'
    })
    .then(function() {
        showToast('Marquage annulé');
        loadMesInscriptions();
    })
    .catch(function(error) {
        console.error('Erreur annulation:', error);
        showToast('Erreur', 'error');
    });
}

// ============================================================
// 7. LIEN DIRECT — ?billet=ID (deep link depuis admin)
// ============================================================
function handleDeepLinkBillet() {
    var params = new URLSearchParams(window.location.search);
    var billetId = params.get('billet');
    if (!billetId) return;

    billetId = parseInt(billetId);
    if (isNaN(billetId)) return;

    // Vérifier que le billet existe
    var billet = allData.find(function(b) { return b.id === billetId; });
    if (!billet) return;

    // S'assurer qu'on est en mode collecte (cartes)
    if (!document.body.classList.contains('view-collecte')) {
        changeView('collecte');
    }

    // Réinitialiser les filtres pour s'assurer que le billet est visible
    billetsActiveStatusFilter = 'tous';
    var searchInput = document.getElementById('search-input');
    if (searchInput) searchInput.value = '';

    // Recharger l'affichage
    applyFilters(false);

    // Attendre le rendu puis scroller
    setTimeout(function() {
        var card = document.querySelector('[data-billet-id="' + billetId + '"]');
        if (!card) {
            // Le billet est peut-être dans un batch non chargé, charger plus
            while (displayedCount < currentData.length) {
                showMore();
            }
            card = document.querySelector('[data-billet-id="' + billetId + '"]');
        }
        if (card) {
            card.scrollIntoView({ behavior: 'smooth', block: 'center' });
            card.style.boxShadow = '0 0 0 3px var(--color-primary)';
            setTimeout(function() {
                card.style.boxShadow = '';
                // Ouvrir le formulaire d'inscription
                ouvrirInscription(billetId);
            }, 800);
        }
    }, 300);

    // Nettoyer l'URL pour éviter de re-déclencher au refresh
    if (window.history.replaceState) {
        var cleanUrl = window.location.pathname;
        window.history.replaceState({}, document.title, cleanUrl);
    }
}
