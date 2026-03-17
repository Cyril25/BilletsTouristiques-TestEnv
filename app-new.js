// ============================================================
// CONFIGURATION — Version Supabase (Story 4.7)
// ============================================================

var allData = [];
var currentData = [];
var displayedCount = 0;
var BATCH_SIZE = 50;

// Story 5.4 : Inscriptions du membre connecté et collecteurs
var mesInscriptions = {};
var collecteursMap = {};

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
        return 'https://drive.google.com/thumbnail?id=' + item.ImageId + '&sz=w' + (size || 800);
    }
    return '';
}

function resolveDownloadUrl(item) {
    if (item.ImageUrl) {
        return item.ImageUrl;
    }
    if (item.ImageId) {
        return 'https://drive.usercontent.google.com/download?id=' + item.ImageId;
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
// global.js gère les redirections et la whitelist ; app-new.js se contente d'écouter.
if (typeof firebase !== 'undefined') {
    firebase.auth().onAuthStateChanged(function(user) {
        if (user) {
            fetchData();
            loadMesInscriptions();
            loadCollecteursForCatalogue();
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
            '<span class="admin-status-counter__label">' + statut + '</span></button>';
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
        // Image — priorité ImageUrl (Cloudinary) > ImageId (Google Drive)
        var imgUrl = resolveImageUrl(item, 800);
        var downloadLink = resolveDownloadUrl(item);
        var couleur = getCategorieColor(item.Categorie);

        if (isGalleryMode) {
            // RENDU MODE GALERIE
            html +=
                '<div class="galerie-item" onclick="openModal(\'' + imgUrl + '\')">' +
                (imgUrl
                    ? '<img src="' + imgUrl + '" class="galerie-image" alt="' + (item.NomBillet || 'Billet') + '">'
                    : '<div style="text-align:center; color:#999; font-size:0.8em; padding:10px;">Image manquante<br>' + (item.Reference || '') + '</div>'
                ) +
                '</div>';

        } else {
            // RENDU MODE COLLECTE (par défaut)
            var inscriptionHtml = buildInscriptionHtml(item);
            var pasInteresse = mesInscriptions[item.id] && mesInscriptions[item.id].pas_interesse;
            html +=
                '<div class="global-container' + (pasInteresse ? ' carte-pas-interesse' : '') + '" data-billet-id="' + item.id + '" style="border-top: 8px solid ' + couleur + ';">' +
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
                buildVersionBadgesHtml(item) +
                (function() {
                    var parts = [];
                    if (item.Collecteur) parts.push('Par ' + item.Collecteur);

                    var versionNormaleExiste = item.VersionNormaleExiste !== false;
                    var varianteVal = item.HasVariante || '';
                    var varianteActive = varianteVal && varianteVal !== 'N';

                    var prixNormal = item.Prix ? parseFloat(item.Prix) : 0;
                    var prixVar = (item.PrixVariante !== null && item.PrixVariante !== undefined && item.PrixVariante !== '') ? parseFloat(item.PrixVariante) : prixNormal;

                    if (!versionNormaleExiste && varianteActive && prixVar) {
                        // Uniquement variante
                        parts.push('au prix de ' + prixVar + ' euros uniquement ' + varianteVal);
                    } else if (versionNormaleExiste && varianteActive && prixNormal) {
                        // Normale + variante
                        parts.push('au prix de ' + prixNormal + ' euros version normale & ' + prixVar + ' euros version ' + varianteVal);
                    } else if (prixNormal) {
                        // Normale seule
                        parts.push('au prix de ' + prixNormal + ' euros');
                    }

                    if (parts.length === 0) return '';
                    return '<div>' + parts.join(' ') + ' ' + (item.FDP_Com || '') + '</div>';
                })() +
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
                (imgUrl
                    ? '<a href="' + downloadLink + '" target="_blank" class="icon-btn ico-dl" title="Télécharger l\'image HD"><i class="fa-solid fa-download"></i></a>'
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
    var user = firebase.auth().currentUser;
    if (!user) return;
    var email = user.email;
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
        html += '<span class="version-badge version-badge--variante"><i class="fa-solid fa-star"></i> ' + varianteVal + '</span>';
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
            html += '<a href="mailto:' + contactEmail + '" class="btn-contacter-collecteur">Contacter le collecteur</a>';
        }
    } else if (inscription && inscription.pas_interesse) {
        // Pas intéressé
        html = '<div class="inscription-badges">'
            + '<span class="badge-pas-interesse">Pas intéressé</span>'
            + '<button onclick="annulerPasInteresse(' + item.id + ')" class="btn-annuler-pas-interesse">Annuler</button>'
            + '</div>';
    } else if (collecteOuverte) {
        // Non inscrit, collecte ouverte
        html = '<div class="inscription-badges">'
            + '<span class="badge-non-inscrit">Non inscrit</span>'
            + '<button onclick="ouvrirInscription(' + item.id + ')" class="btn-sinscrire">S\'inscrire</button>'
            + '<button onclick="marquerPasInteresse(' + item.id + ')" class="btn-pas-interesse">Pas intéressé</button>'
            + '</div>';
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
            + '<div class="mini-form-field"><label>Envoi</label><select id="insc-envoi-' + billetId + '"><option value="Normal">Normal</option><option value="Suivi">Suivi</option><option value="Recommandé">Recommandé</option></select></div>'
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
    var email = firebase.auth().currentUser.email;
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
        })
        .catch(function(error) {
            console.error('Erreur inscription:', error);
            showToast('Erreur lors de l\'inscription', 'error');
        });
}

// --- Marquage "Pas intéressé" ---
function marquerPasInteresse(billetId) {
    var email = firebase.auth().currentUser.email;
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
