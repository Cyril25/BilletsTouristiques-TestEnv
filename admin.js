// ============================================================
// admin.js — BilletsTouristiques Administration
// Stories 2.1, 2.2, 2.3, 2.4, 2.5
// ============================================================

// ============================================================
// 1. TOAST NOTIFICATIONS (Fondation FR11)
// ============================================================
function showToast(message, type) {
    var toast = document.createElement('div');
    toast.className = 'toast toast-' + type;
    toast.textContent = message;
    document.body.appendChild(toast);

    if (type === 'success') {
        setTimeout(function() {
            if (toast.parentNode) toast.remove();
        }, 4000);
    }
    if (type === 'info') {
        setTimeout(function() {
            if (toast.parentNode) toast.remove();
        }, 4000);
    }
    if (type === 'error') {
        toast.onclick = function() { toast.remove(); };
    }
}

// ============================================================
// 2. CONSTANTES & CONFIGURATION
// ============================================================
var adminBillets = [];

// Categories (= statuts) — valeurs reelles du Google Sheet
var CATEGORIES = [
    'Jamais édité, projet',
    'Pré collecte',
    'Collecte',
    'Pas de collecte',
    'Terminé'
];
var CATEGORIE_FLOW = {
    'Jamais édité, projet': 'Pré collecte',
    'Pré collecte': 'Collecte',
    'Collecte': 'Terminé',
    'Pas de collecte': null,
    'Terminé': null
};
var CATEGORIE_DEFAULT = 'Jamais édité, projet';

// Couleurs des categories
var CATEGORIE_COLORS = {
    'Collecte': '#A4C2F4',
    'Pré collecte': '#FFFF00',
    'Terminé': '#C27BA0',
    'Pas de collecte': '#CECECE',
    'Jamais édité, projet': '#CECECE',
    'Non defini': '#F57C00'
};

// Story 2.2 — Focus trap
var focusTrapHandler = null;
var escapeHandler = null;

// Story 2.4 — Suppression
var deleteTargetDocId = null;
var deleteTargetName = '';

// Pagination
var PAGE_SIZE = 50;
var currentPage = 1;

// Story 2.1b — Variables de filtrage admin
var adminActiveStatusFilter = 'tous';
var adminFilterEnCours = false;
var adminFilteredBillets = [];

// ============================================================
// 3. INITIALISATION
// ============================================================
if (typeof firebase !== 'undefined') {
    firebase.auth().onAuthStateChanged(function(user) {
        if (user) {
            loadAdminBillets();
            initPanel();
        }
    });
}

// ============================================================
// 4. CHARGEMENT DES BILLETS DEPUIS SUPABASE
// ============================================================
function loadAdminBillets() {
    var grid = document.getElementById('admin-cards-grid');
    if (!grid) return;
    currentPage = 1;

    supabaseFetch('/rest/v1/billets?select=*&order=id.desc&limit=10000', { method: 'GET' })
        .then(function(rows) {
            adminBillets = rows.map(function(row) {
                row._id = row.id;
                return row;
            });
            // Story 2.1b — Initialiser compteurs et filtres
            renderStatusCounters();
            adminApplyFilters();
        })
        .catch(function(error) {
            showToast('Erreur chargement : ' + error.message, 'error');
            console.error('Erreur chargement billets:', error);
            if (grid) {
                grid.innerHTML = '<div class="admin-empty-state">' +
                    '<i class="fa-solid fa-circle-exclamation" style="color: var(--color-danger);"></i>' +
                    '<p>Impossible de charger les billets.</p>' +
                    '</div>';
            }
        });
}

// ============================================================
// 5. RENDU DES CARTES BILLETS (Stories 2.1, 2.3, 2.4, 2.5)
// ============================================================
function getStatusColor(categorie) {
    var key = categorie || 'Non defini';
    return CATEGORIE_COLORS[key] || CATEGORIE_COLORS['Non defini'];
}

function getTextColorForBg(hex) {
    hex = hex.replace('#', '');
    var r = parseInt(hex.substring(0, 2), 16);
    var g = parseInt(hex.substring(2, 4), 16);
    var b = parseInt(hex.substring(4, 6), 16);
    var luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.55 ? '#333' : '#fff';
}

function renderAdminCards() {
    var grid = document.getElementById('admin-cards-grid');
    if (!grid) return;

    var source = getDisplayedBillets();

    if (source.length === 0) {
        var hasFilters = adminActiveStatusFilter !== 'tous' || adminFilterEnCours || getSearchText();
        if (hasFilters) {
            // Story 2.1b — Etat vide avec filtres actifs
            grid.innerHTML = '<div class="admin-empty-state">' +
                '<i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>' +
                '<p>Aucun billet ne correspond a votre recherche</p>' +
                '<button class="admin-empty-state__reset" onclick="adminResetFilters()">' +
                'Reinitialiser les filtres</button>' +
                '</div>';
        } else {
            grid.innerHTML = '<div class="admin-empty-state">' +
                '<i class="fa-solid fa-box-open"></i>' +
                '<p>Aucun billet dans le catalogue</p>' +
                '<button class="btn-admin-primary" onclick="openBilletPanel()">' +
                '<i class="fa-solid fa-plus"></i> Ajouter un premier billet</button>' +
                '</div>';
        }
        var paginationContainer = document.getElementById('admin-pagination');
        if (paginationContainer) paginationContainer.style.display = 'none';
        return;
    }

    var totalPages = Math.ceil(source.length / PAGE_SIZE);
    if (currentPage > totalPages && totalPages > 0) currentPage = totalPages;
    var start = (currentPage - 1) * PAGE_SIZE;
    var end = Math.min(start + PAGE_SIZE, source.length);

    var html = '';
    for (var i = start; i < end; i++) {
        var billet = source[i];
        var docId = billet._id;
        var nom = billet.NomBillet || 'Sans nom';
        var statut = billet.Categorie || '';
        var statusLabel = statut || 'Non defini';
        var statusColor = getStatusColor(statut);

        html += '<div class="admin-card-billet" data-doc-id="' + docId + '">' +
            '<div class="admin-card-header">' +
                '<h3 class="admin-card-title">' + escapeHtml(nom) + '</h3>' +
                '<div class="card-badge-wrapper">' +
                    '<span class="admin-badge-status clickable" ' +
                        'data-doc-id="' + docId + '" ' +
                        'data-current-status="' + escapeAttr(statut) + '" ' +
                        'style="background-color: ' + statusColor + '; color: ' + getTextColorForBg(statusColor) + ';">' +
                        escapeHtml(statusLabel) +
                    '</span>' +
                    // Story 2.5 — popup de statut rapide (cache par defaut)
                    '<div class="quick-status-popup" id="quick-status-popup-' + docId + '" style="display: none;">' +
                        '<div class="quick-status-chips">' +
                            buildStatusChipsHtml(docId, statut) +
                        '</div>' +
                    '</div>' +
                '</div>' +
            '</div>' +
            '<div class="admin-card-meta">' +
                '<span>' + escapeHtml(billet.Ville || '') + '</span>' +
                '<span class="admin-card-ref">' +
                    escapeHtml(billet.Reference || '') +
                    (billet.Millesime ? ' - ' + escapeHtml(billet.Millesime) : '') +
                '</span>' +
            '</div>' +
            // Story 2.3/2.4 — Boutons d'action
            '<div class="admin-card-actions">' +
                '<button class="admin-card-edit-btn" data-doc-id="' + docId + '" title="Modifier">' +
                    '<i class="fa-solid fa-pen"></i> Modifier' +
                '</button>' +
                '<button class="admin-card-delete-btn" data-doc-id="' + docId + '" data-billet-name="' + escapeAttr(nom) + '" title="Supprimer">' +
                    '<i class="fa-solid fa-trash-can"></i>' +
                '</button>' +
            '</div>' +
            '</div>';
    }

    grid.innerHTML = html;
    renderPaginationControls(source.length, totalPages);
}

// Story 2.5 — Generer le HTML des chips de statut pour le popup rapide
function buildStatusChipsHtml(docId, currentStatus) {
    var html = '';
    var currentIndex = CATEGORIES.indexOf(currentStatus);

    CATEGORIES.forEach(function(statut, index) {
        var classes = 'status-chip';
        if (statut === currentStatus) classes += ' status-chip--active';
        if (currentIndex >= 0 && index === currentIndex + 1) classes += ' status-chip--next';

        var color = getStatusColor(statut);
        html += '<button class="' + classes + '" ' +
            'data-status="' + escapeAttr(statut) + '" ' +
            'data-doc-id="' + docId + '" ' +
            'style="background-color: ' + color + '; color: ' + getTextColorForBg(color) + ';" ' +
            'aria-pressed="' + (statut === currentStatus ? 'true' : 'false') + '">' +
            escapeHtml(statut) +
            '</button>';
    });

    return html;
}

// Utilitaires d'echappement
function escapeHtml(text) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(text));
    return div.innerHTML;
}

function escapeAttr(text) {
    return String(text).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ============================================================
// 5b. PAGINATION — SOURCE DE DONNEES
// ============================================================
function getDisplayedBillets() {
    return adminFilteredBillets.length > 0 || adminActiveStatusFilter !== 'tous' || adminFilterEnCours || getSearchText()
        ? adminFilteredBillets
        : adminBillets;
}

function getSearchText() {
    var input = document.getElementById('admin-search-input');
    return input ? input.value.trim() : '';
}

// ============================================================
// 5c. PAGINATION — CONTROLES DE NAVIGATION
// ============================================================
function renderPaginationControls(totalItems, totalPages) {
    var container = document.getElementById('admin-pagination');
    if (!container) return;

    if (totalPages <= 1) {
        container.style.display = 'none';
        return;
    }

    container.style.display = 'flex';
    container.setAttribute('role', 'navigation');
    container.setAttribute('aria-label', 'Pagination');
    var html = '';

    // Bouton precedent
    html += '<button class="admin-pagination-btn admin-pagination-prev"' +
        ' aria-label="Page précédente"' +
        (currentPage === 1 ? ' disabled' : '') +
        ' data-page="' + (currentPage - 1) + '">' +
        '<i class="fa-solid fa-chevron-left"></i> Précédent</button>';

    // Numeros de page (avec ellipses si > 7 pages)
    var pages = getPaginationRange(currentPage, totalPages);
    for (var i = 0; i < pages.length; i++) {
        if (pages[i] === '...') {
            html += '<span class="admin-pagination-ellipsis">...</span>';
        } else {
            html += '<button class="admin-pagination-btn admin-pagination-num' +
                (pages[i] === currentPage ? ' active' : '') + '"' +
                (pages[i] === currentPage ? ' aria-current="page"' : '') +
                ' aria-label="Page ' + pages[i] + '"' +
                ' data-page="' + pages[i] + '">' + pages[i] + '</button>';
        }
    }

    // Bouton suivant
    html += '<button class="admin-pagination-btn admin-pagination-next"' +
        ' aria-label="Page suivante"' +
        (currentPage === totalPages ? ' disabled' : '') +
        ' data-page="' + (currentPage + 1) + '">' +
        'Suivant <i class="fa-solid fa-chevron-right"></i></button>';

    // Compteur
    html += '<span class="admin-pagination-info">' +
        totalItems + ' billets — Page ' + currentPage + ' sur ' + totalPages +
        '</span>';

    container.innerHTML = html;
}

function getPaginationRange(current, total) {
    if (total <= 7) {
        var range = [];
        for (var i = 1; i <= total; i++) range.push(i);
        return range;
    }
    var pages = [];
    pages.push(1);
    var rangeStart = Math.max(2, current - 1);
    var rangeEnd = Math.min(total - 1, current + 1);
    // Etendre la fenetre si proche des bords
    if (rangeStart <= 3) {
        rangeEnd = Math.max(rangeEnd, 4);
        rangeStart = 2;
    }
    if (rangeEnd >= total - 2) {
        rangeStart = Math.min(rangeStart, total - 3);
        rangeEnd = total - 1;
    }
    if (rangeStart > 2) pages.push('...');
    for (var i = rangeStart; i <= rangeEnd; i++) pages.push(i);
    if (rangeEnd < total - 1) pages.push('...');
    pages.push(total);
    return pages;
}

// ============================================================
// 6. STORY 2.2 — PANEL LATERAL (ouverture / fermeture)
// ============================================================

function initPanel() {
    // Bouton "Ajouter un billet"
    var addBtn = document.getElementById('btn-add-billet');
    if (addBtn) {
        addBtn.addEventListener('click', function() {
            openBilletPanel();
        });
    }

    // Bouton fermer le panel
    var closeBtn = document.getElementById('panel-close-btn');
    if (closeBtn) {
        closeBtn.addEventListener('click', function() {
            closeBilletPanel();
        });
    }

    // Clic sur l'overlay ferme le panel
    var overlay = document.getElementById('admin-panel-overlay');
    if (overlay) {
        overlay.addEventListener('click', function() {
            closeBilletPanel();
        });
    }

    // Soumission du formulaire
    var form = document.getElementById('admin-billet-form');
    if (form) {
        form.addEventListener('submit', function(e) {
            e.preventDefault();
            if (!validateBilletForm()) return;

            var panel = document.getElementById('admin-panel');
            var billetData = collectFormData();

            // Story 2.3 — Mode edition ou ajout ?
            if (panel && panel.dataset.editId) {
                updateBillet(panel.dataset.editId, billetData);
            } else {
                saveBillet(billetData);
            }
        });
    }

    // Story 2.5 — Delegation d'evenements sur la grille
    var cardsGrid = document.getElementById('admin-cards-grid');
    if (cardsGrid) {
        cardsGrid.addEventListener('click', function(event) {
            // Story 2.5 — Clic sur un chip de statut rapide
            var chip = event.target.closest('.status-chip');
            if (chip) {
                event.stopPropagation();
                handleQuickStatusChange(chip);
                return;
            }

            // Story 2.5 — Clic sur le badge de statut
            var badge = event.target.closest('.admin-badge-status.clickable');
            if (badge) {
                event.stopPropagation();
                handleBadgeClick(badge);
                return;
            }

            // Story 2.4 — Clic sur le bouton supprimer
            var deleteBtn = event.target.closest('.admin-card-delete-btn');
            if (deleteBtn) {
                event.stopPropagation();
                var docId = deleteBtn.getAttribute('data-doc-id');
                var billetName = deleteBtn.getAttribute('data-billet-name');
                if (docId && billetName) {
                    openDeleteModal(docId, billetName);
                }
                return;
            }

            // Story 2.3 — Clic sur le bouton modifier
            var editBtn = event.target.closest('.admin-card-edit-btn');
            if (editBtn) {
                event.stopPropagation();
                var editDocId = editBtn.getAttribute('data-doc-id');
                if (editDocId) {
                    var billetEditData = findBilletById(editDocId);
                    if (billetEditData) {
                        openBilletPanel(billetEditData, editDocId);
                    }
                }
                return;
            }
        });
    }

    // Story 2.5 — Fermer les popups au clic en dehors
    document.addEventListener('click', function(event) {
        if (!event.target.closest('.quick-status-popup') && !event.target.closest('.admin-badge-status')) {
            closeAllStatusPopups();
        }
    });

    // Story 2.5 — Fermer les popups avec Escape
    document.addEventListener('keydown', function(event) {
        if (event.key === 'Escape') {
            closeAllStatusPopups();
        }
    });

    // Pagination — event delegation
    var paginationContainer = document.getElementById('admin-pagination');
    if (paginationContainer) {
        paginationContainer.addEventListener('click', function(event) {
            var btn = event.target.closest('.admin-pagination-btn');
            if (!btn || btn.disabled) return;
            var page = parseInt(btn.getAttribute('data-page'), 10);
            if (isNaN(page) || page < 1 || page === currentPage) return;
            var source = getDisplayedBillets();
            var maxPage = Math.ceil(source.length / PAGE_SIZE);
            if (page > maxPage) return;
            currentPage = page;
            renderAdminCards();
            // Scroll vers le haut de la grille
            var grid = document.getElementById('admin-cards-grid');
            if (grid) grid.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    }
}

// Trouver un billet par son ID dans le tableau en memoire
function findBilletById(docId) {
    for (var i = 0; i < adminBillets.length; i++) {
        if (String(adminBillets[i]._id) === String(docId)) {
            return adminBillets[i];
        }
    }
    return null;
}

// --- Ouverture du panel (mode ajout ou edition) ---
// Story 2.2 (ajout) + Story 2.3 (edition)
function openBilletPanel(billetData, docId) {
    var panel = document.getElementById('admin-panel');
    if (!panel) return;
    var overlay = document.getElementById('admin-panel-overlay');
    var form = document.getElementById('admin-billet-form');
    var title = document.getElementById('panel-title');
    var saveBtn = document.getElementById('panel-save-btn');

    // Reinitialiser le formulaire
    if (form) form.reset();

    // Nettoyer les erreurs de validation
    clearValidationErrors();

    // Reactiver le bouton de sauvegarde
    if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Sauvegarder';
    }

    if (billetData && docId) {
        // --- Mode edition (Story 2.3) ---
        panel.dataset.editId = docId;
        if (title) title.textContent = 'Modifier le billet';
        if (saveBtn) saveBtn.textContent = 'Enregistrer les modifications';
        panel.setAttribute('aria-label', 'Modifier le billet');

        // Pre-remplir tous les champs
        prefillForm(billetData);
    } else {
        // --- Mode ajout (Story 2.2) ---
        delete panel.dataset.editId;
        if (title) title.textContent = 'Ajouter un billet';
        if (saveBtn) saveBtn.textContent = 'Sauvegarder';
        panel.setAttribute('aria-label', 'Ajouter un billet');

        // Statut par defaut
        var categorieField = document.getElementById('field-categorie');
        if (categorieField) categorieField.value = CATEGORIE_DEFAULT;
    }

    // Ouvrir le panel
    panel.classList.add('open');
    if (overlay) overlay.classList.add('open');
    document.body.style.overflow = 'hidden';

    // Focus trap
    initFocusTrap(panel);

    // Focus sur le premier champ
    var firstInput = document.getElementById('field-nom-billet');
    if (firstInput) {
        setTimeout(function() { firstInput.focus(); }, 350);
    }
}

// Story 2.3 — Pre-remplir le formulaire avec les donnees du billet
function prefillForm(data) {
    var fields = {
        'field-nom-billet': 'NomBillet',
        'field-ville': 'Ville',
        'field-reference': 'Reference',
        'field-millesime': 'Millesime',
        'field-version': 'Version',
        'field-dep': 'Dep',
        'field-cp': 'Cp',
        'field-pays': 'Pays',
        'field-categorie': 'Categorie',
        'field-theme': 'Theme',
        'field-collecteur': 'Collecteur',
        'field-prix': 'Prix',
        'field-fdp': 'FDP',
        'field-fdp-com': 'FDP_Com',
        'field-info-paiement': 'InfoPaiement',
        'field-date': 'Date',
        'field-date-pre': 'DatePre',
        'field-date-coll': 'DateColl',
        'field-date-fin': 'DateFin',
        'field-image-id': 'ImageId',
        'field-sondage': 'Sondage',
        'field-link-sheet': 'LinkSheet',
        'field-link-fb': 'LinkFB',
        'field-couleur': 'Couleur',
        'field-compteur-bt': 'CompteurBT',
        'field-collecte-cache': 'CollecteCache',
        'field-com-cache': 'ComCache'
    };

    for (var fieldId in fields) {
        var el = document.getElementById(fieldId);
        if (el) el.value = data[fields[fieldId]] || '';
    }

    // Commentaire (textarea)
    var commentaireEl = document.getElementById('field-commentaire');
    if (commentaireEl) commentaireEl.value = data.Commentaire || '';

    // Statut
    var categorie = data.Categorie || CATEGORIE_DEFAULT;
    var categorieField = document.getElementById('field-categorie');
    if (categorieField) categorieField.value = categorie;
}

// --- Fermeture du panel ---
function closeBilletPanel() {
    var panel = document.getElementById('admin-panel');
    if (!panel) return;
    var overlay = document.getElementById('admin-panel-overlay');

    panel.classList.remove('open');
    if (overlay) overlay.classList.remove('open');
    document.body.style.overflow = '';

    // Nettoyer le mode edition
    delete panel.dataset.editId;

    // Retirer le focus trap
    destroyFocusTrap();

    // Remettre le focus sur le bouton d'ajout
    var addBtn = document.getElementById('btn-add-billet');
    if (addBtn) addBtn.focus();
}

// ============================================================
// 7. STORY 2.2 — FOCUS TRAP & ESCAPE
// ============================================================

function initFocusTrap(panelElement) {
    destroyFocusTrap();

    focusTrapHandler = function(e) {
        if (e.key !== 'Tab') return;

        var focusableElements = panelElement.querySelectorAll(
            'input:not([type="hidden"]), select, textarea, button, [tabindex]:not([tabindex="-1"])'
        );
        if (focusableElements.length === 0) return;

        var firstEl = focusableElements[0];
        var lastEl = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
            if (document.activeElement === firstEl) {
                e.preventDefault();
                lastEl.focus();
            }
        } else {
            if (document.activeElement === lastEl) {
                e.preventDefault();
                firstEl.focus();
            }
        }
    };

    escapeHandler = function(e) {
        if (e.key === 'Escape') {
            var panel = document.getElementById('admin-panel');
            if (panel && panel.classList.contains('open')) {
                e.preventDefault();
                closeBilletPanel();
            }
        }
    };

    document.addEventListener('keydown', focusTrapHandler);
    document.addEventListener('keydown', escapeHandler);
}

function destroyFocusTrap() {
    if (focusTrapHandler) {
        document.removeEventListener('keydown', focusTrapHandler);
        focusTrapHandler = null;
    }
    if (escapeHandler) {
        document.removeEventListener('keydown', escapeHandler);
        escapeHandler = null;
    }
}

// ============================================================
// 8. (Section supprimee — les chips statut sont remplaces par un select)
// ============================================================

// ============================================================
// 9. STORY 2.2 — VALIDATION DU FORMULAIRE
// ============================================================

function clearValidationErrors() {
    var errorGroups = document.querySelectorAll('.admin-form-group.has-error');
    errorGroups.forEach(function(group) {
        group.classList.remove('has-error');
    });
    var errorMsgs = document.querySelectorAll('.admin-form-error');
    errorMsgs.forEach(function(msg) {
        msg.textContent = '';
    });
}

function setFieldError(fieldId, errorId, message) {
    var field = document.getElementById(fieldId);
    if (!field) return;
    var group = field.closest('.admin-form-group');
    if (group) group.classList.add('has-error');
    var errorEl = document.getElementById(errorId);
    if (errorEl) errorEl.textContent = message;
}

function validateBilletForm() {
    clearValidationErrors();
    var valid = true;
    var firstErrorField = null;

    var nomBillet = document.getElementById('field-nom-billet');
    if (nomBillet && nomBillet.value.trim() === '') {
        setFieldError('field-nom-billet', 'error-nom-billet', 'Le champ Nom est requis');
        valid = false;
        if (!firstErrorField) firstErrorField = nomBillet;
    }

    var ville = document.getElementById('field-ville');
    if (ville && ville.value.trim() === '') {
        setFieldError('field-ville', 'error-ville', 'Le champ Ville est requis');
        valid = false;
        if (!firstErrorField) firstErrorField = ville;
    }

    var prix = document.getElementById('field-prix');
    if (prix && prix.value !== '' && (isNaN(parseFloat(prix.value)) || parseFloat(prix.value) < 0)) {
        setFieldError('field-prix', 'error-prix', 'Le prix doit etre un nombre positif');
        valid = false;
        if (!firstErrorField) firstErrorField = prix;
    }

    if (!valid && firstErrorField) {
        firstErrorField.focus();
    }

    return valid;
}

// ============================================================
// 10. STORY 2.2 — COLLECTE DES DONNEES DU FORMULAIRE
// ============================================================

function collectFormData() {
    var getValue = function(id) {
        var el = document.getElementById(id);
        return el ? el.value.trim() : '';
    };

    var billetData = {
        NomBillet: getValue('field-nom-billet'),
        Ville: getValue('field-ville'),
        Reference: getValue('field-reference'),
        Millesime: getValue('field-millesime'),
        Version: getValue('field-version'),
        Dep: getValue('field-dep'),
        Cp: getValue('field-cp'),
        Pays: getValue('field-pays'),
        Theme: getValue('field-theme'),
        Collecteur: getValue('field-collecteur'),
        Prix: getValue('field-prix'),
        FDP: getValue('field-fdp'),
        FDP_Com: getValue('field-fdp-com'),
        InfoPaiement: getValue('field-info-paiement'),
        Date: getValue('field-date'),
        DatePre: getValue('field-date-pre'),
        DateColl: getValue('field-date-coll'),
        DateFin: getValue('field-date-fin'),
        ImageId: getValue('field-image-id'),
        Sondage: getValue('field-sondage'),
        LinkSheet: getValue('field-link-sheet'),
        LinkFB: getValue('field-link-fb'),
        Couleur: getValue('field-couleur'),
        Commentaire: getValue('field-commentaire'),
        CompteurBT: getValue('field-compteur-bt'),
        CollecteCache: getValue('field-collecte-cache'),
        ComCache: getValue('field-com-cache'),
        Categorie: getValue('field-categorie') || CATEGORIE_DEFAULT
    };

    // Champ Recherche (concatenation des champs cles en minuscules)
    billetData.Recherche = [
        billetData.NomBillet,
        billetData.Ville,
        billetData.Reference,
        billetData.Millesime,
        billetData.Dep,
        billetData.Pays,
        billetData.Categorie,
        billetData.Theme,
        billetData.Collecteur
    ].join(' ').toLowerCase();

    return billetData;
}

// ============================================================
// 11. STORY 2.2 — SOUMISSION (AJOUT)
// ============================================================

function saveBillet(billetData) {
    var saveBtn = document.getElementById('panel-save-btn');
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Enregistrement...';
    }

    supabaseFetch('/rest/v1/billets', {
        method: 'POST',
        headers: { 'Prefer': 'return=representation' },
        body: JSON.stringify(billetData)
    })
        .then(function() {
            showToast('Billet ajoute avec succes', 'success');
            closeBilletPanel();
            loadAdminBillets();
        })
        .catch(function(error) {
            showToast('Erreur lors de l\'ajout : ' + error.message, 'error');
            console.error('Erreur ajout billet:', error);
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.textContent = 'Sauvegarder';
            }
        });
}

// ============================================================
// 12. STORY 2.3 — MODIFICATION (UPDATE)
// ============================================================

function updateBillet(docId, billetData) {
    var saveBtn = document.getElementById('panel-save-btn');
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Enregistrement...';
    }

    supabaseFetch('/rest/v1/billets?id=eq.' + encodeURIComponent(docId), {
        method: 'PATCH',
        body: JSON.stringify(billetData)
    })
        .then(function() {
            showToast('Billet modifie avec succes', 'success');
            updateCardInList(docId, billetData);
            closeBilletPanel();
        })
        .catch(function(error) {
            showToast('Erreur lors de la modification : ' + error.message, 'error');
            console.error('Erreur modification billet:', error);
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.textContent = 'Enregistrer les modifications';
            }
        });
}

// Story 2.3 — Rafraichir la carte dans le DOM apres modification
function updateCardInList(docId, billetData) {
    var card = document.querySelector('[data-doc-id="' + docId + '"]');
    if (!card) return;

    // Mise a jour des elements textuels
    var titleEl = card.querySelector('.admin-card-title');
    if (titleEl) titleEl.textContent = billetData.NomBillet || 'Sans nom';

    var metaEl = card.querySelector('.admin-card-meta');
    if (metaEl) {
        var villeSpan = metaEl.querySelector('span:first-child');
        if (villeSpan) villeSpan.textContent = billetData.Ville || '';
        var refSpan = metaEl.querySelector('.admin-card-ref');
        if (refSpan) {
            refSpan.textContent = (billetData.Reference || '') +
                (billetData.Millesime ? ' - ' + billetData.Millesime : '');
        }
    }

    // Mise a jour du badge de statut
    var badge = card.querySelector('.admin-badge-status');
    if (badge) {
        var statut = billetData.Categorie || '';
        var statusLabel = statut || 'Non defini';
        var color = getStatusColor(statut);
        badge.textContent = statusLabel;
        badge.setAttribute('data-current-status', statut);
        badge.style.backgroundColor = color;
        badge.style.color = getTextColorForBg(color);
    }

    // Mise a jour du bouton supprimer (nom du billet)
    var deleteBtn = card.querySelector('.admin-card-delete-btn');
    if (deleteBtn) {
        deleteBtn.setAttribute('data-billet-name', billetData.NomBillet || '');
    }

    // Mise a jour du popup de statut rapide
    var popup = document.getElementById('quick-status-popup-' + docId);
    if (popup) {
        var chipsContainer = popup.querySelector('.quick-status-chips');
        if (chipsContainer) {
            chipsContainer.innerHTML = buildStatusChipsHtml(docId, billetData.Categorie || '');
        }
    }

    // Mise a jour des donnees en memoire
    for (var i = 0; i < adminBillets.length; i++) {
        if (String(adminBillets[i]._id) === String(docId)) {
            for (var key in billetData) {
                adminBillets[i][key] = billetData[key];
            }
            break;
        }
    }

    // Story 2.1b — Recalculer les compteurs
    renderStatusCounters();
}

// ============================================================
// 13. STORY 2.4 — MODALE DE SUPPRESSION
// ============================================================

function openDeleteModal(docId, nomBillet) {
    var overlay = document.getElementById('delete-modal-overlay');
    var billetNameEl = document.getElementById('delete-modal-billet-name');
    var confirmInput = document.getElementById('delete-confirm-input');
    var confirmBtn = document.getElementById('delete-confirm-btn');
    if (!overlay || !billetNameEl || !confirmInput || !confirmBtn) return;

    deleteTargetDocId = docId;
    deleteTargetName = nomBillet;

    billetNameEl.textContent = nomBillet;
    confirmInput.value = '';
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Confirmer la suppression';

    overlay.style.display = 'flex';

    // Focus sur l'input apres ouverture
    setTimeout(function() { confirmInput.focus(); }, 100);

    // Ecouteurs
    confirmInput.addEventListener('input', onDeleteInputChange);
    document.addEventListener('keydown', onDeleteModalKeydown);
    overlay.addEventListener('click', onDeleteOverlayClick);
}

function closeDeleteModal() {
    var overlay = document.getElementById('delete-modal-overlay');
    var confirmInput = document.getElementById('delete-confirm-input');
    if (!overlay) return;

    overlay.style.display = 'none';
    deleteTargetDocId = null;
    deleteTargetName = '';

    if (confirmInput) {
        confirmInput.value = '';
        confirmInput.removeEventListener('input', onDeleteInputChange);
    }
    document.removeEventListener('keydown', onDeleteModalKeydown);
    overlay.removeEventListener('click', onDeleteOverlayClick);
}

function onDeleteInputChange(e) {
    var confirmBtn = document.getElementById('delete-confirm-btn');
    if (!confirmBtn) return;
    var typed = e.target.value.trim();
    confirmBtn.disabled = (typed !== deleteTargetName);
}

function onDeleteModalKeydown(e) {
    if (e.key === 'Escape') {
        closeDeleteModal();
        return;
    }
    // Focus trap dans la modale
    if (e.key === 'Tab') {
        var modal = document.getElementById('delete-modal');
        if (!modal) return;
        var focusable = modal.querySelectorAll('input, button:not(:disabled)');
        if (focusable.length === 0) return;
        var first = focusable[0];
        var last = focusable[focusable.length - 1];
        if (e.shiftKey) {
            if (document.activeElement === first) {
                e.preventDefault();
                last.focus();
            }
        } else {
            if (document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        }
    }
}

function onDeleteOverlayClick(e) {
    if (e.target.id === 'delete-modal-overlay') {
        closeDeleteModal();
    }
}

function confirmDelete() {
    if (!deleteTargetDocId) return;

    var docId = deleteTargetDocId;
    var confirmBtn = document.getElementById('delete-confirm-btn');
    if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Suppression...';
    }

    supabaseFetch('/rest/v1/billets?id=eq.' + encodeURIComponent(docId), {
        method: 'DELETE'
    })
        .then(function() {
            showToast('Billet supprime avec succes', 'success');
            closeDeleteModal();
            // Retirer du tableau en memoire
            adminBillets = adminBillets.filter(function(b) {
                return String(b._id) !== String(docId);
            });
            // Story 2.1b — Recalculer compteurs et filtres
            renderStatusCounters();
            adminApplyFilters();
        })
        .catch(function(error) {
            console.error('Erreur suppression billet:', error);
            showToast('Erreur lors de la suppression : ' + error.message, 'error');
            if (confirmBtn) {
                confirmBtn.disabled = false;
                confirmBtn.textContent = 'Confirmer la suppression';
            }
        });
}

// ============================================================
// 14. STORY 2.5 — CHANGEMENT DE STATUT RAPIDE
// ============================================================

function handleBadgeClick(badge) {
    var docId = badge.getAttribute('data-doc-id');
    if (!docId) return;

    // Fermer tout popup deja ouvert
    closeAllStatusPopups();

    var popup = document.getElementById('quick-status-popup-' + docId);
    if (!popup) return;

    popup.style.display = 'block';

    // Mettre a jour les chips actifs
    var currentStatus = badge.getAttribute('data-current-status');
    highlightActiveAndNextChip(popup, currentStatus);
}

function closeAllStatusPopups() {
    var popups = document.querySelectorAll('.quick-status-popup');
    popups.forEach(function(popup) {
        popup.style.display = 'none';
    });
}

function highlightActiveAndNextChip(popup, currentStatus) {
    if (!popup) return;
    var chips = popup.querySelectorAll('.status-chip');
    var currentIndex = CATEGORIES.indexOf(currentStatus);

    chips.forEach(function(chip, index) {
        chip.classList.remove('status-chip--active', 'status-chip--next');
        chip.setAttribute('aria-pressed', 'false');
        if (chip.getAttribute('data-status') === currentStatus) {
            chip.classList.add('status-chip--active');
            chip.setAttribute('aria-pressed', 'true');
        }
        if (currentIndex >= 0 && index === currentIndex + 1) {
            chip.classList.add('status-chip--next');
        }
    });
}

function handleQuickStatusChange(chip) {
    var newStatus = chip.getAttribute('data-status');
    var docId = chip.getAttribute('data-doc-id');
    if (!newStatus || !docId) return;

    // Ne rien faire si on clique sur le statut actif
    var badge = document.querySelector('.admin-badge-status[data-doc-id="' + docId + '"]');
    if (!badge) return;
    var previousStatus = badge.getAttribute('data-current-status');
    if (previousStatus === newStatus) return;

    // --- Mise a jour optimiste (UI d'abord) ---
    updateBadgeUI(badge, newStatus);
    closeAllStatusPopups();

    // --- Mise a jour Supabase ---
    supabaseFetch('/rest/v1/billets?id=eq.' + encodeURIComponent(docId), {
        method: 'PATCH',
        body: JSON.stringify({ Categorie: newStatus })
    })
        .then(function() {
            // Succes : mettre a jour les donnees en memoire
            updateInMemoryStatus(docId, newStatus);

            // Mettre a jour le popup de statut rapide
            var popup = document.getElementById('quick-status-popup-' + docId);
            if (popup) {
                var chipsContainer = popup.querySelector('.quick-status-chips');
                if (chipsContainer) {
                    chipsContainer.innerHTML = buildStatusChipsHtml(docId, newStatus);
                }
            }

            // Story 2.1b — Recalculer les compteurs
            renderStatusCounters();

            showToast('Statut mis a jour : ' + newStatus, 'success');
        })
        .catch(function(error) {
            // Echec : rollback du badge a l'etat precedent
            console.error('Erreur changement statut:', error);
            updateBadgeUI(badge, previousStatus);
            showToast('Erreur : ' + error.message, 'error');
        });
}

function updateBadgeUI(badge, status) {
    if (!badge) return;
    badge.setAttribute('data-current-status', status);
    badge.textContent = status;
    var color = getStatusColor(status);
    badge.style.backgroundColor = color;
}

function updateInMemoryStatus(docId, newStatus) {
    for (var i = 0; i < adminBillets.length; i++) {
        if (String(adminBillets[i]._id) === String(docId)) {
            adminBillets[i].Categorie = newStatus;
            break;
        }
    }
}

// ============================================================
// 15. STORY 2.1b — COMPTEURS DE STATUT
// ============================================================

function renderStatusCounters() {
    var container = document.getElementById('admin-status-counters');
    if (!container) return;

    // Compter par statut depuis le tableau complet (pas les filtres)
    var counts = {};
    var total = adminBillets.length;
    adminBillets.forEach(function(billet) {
        var statut = billet.Categorie || 'Non defini';
        counts[statut] = (counts[statut] || 0) + 1;
    });

    // Ordre des statuts
    var statutOrder = CATEGORIES.slice();
    // Ajouter les statuts non prevus
    Object.keys(counts).forEach(function(s) {
        if (statutOrder.indexOf(s) === -1) statutOrder.push(s);
    });

    var html = '<button class="admin-status-counter' +
        (adminActiveStatusFilter === 'tous' ? ' admin-status-counter--active' : '') +
        '" data-status="tous" onclick="adminFilterByStatus(\'tous\')" aria-pressed="' +
        (adminActiveStatusFilter === 'tous' ? 'true' : 'false') + '">' +
        '<span class="admin-status-counter__count">' + total + '</span>' +
        '<span class="admin-status-counter__label">Tous</span></button>';

    statutOrder.forEach(function(statut) {
        if (!counts[statut]) return;
        var isActive = adminActiveStatusFilter === statut;
        var color = getStatusColor(statut);
        html += '<button class="admin-status-counter' +
            (isActive ? ' admin-status-counter--active' : '') +
            '" data-status="' + escapeAttr(statut) + '" onclick="adminFilterByStatus(\'' +
            statut.replace(/'/g, "\\'") + '\')" aria-pressed="' +
            (isActive ? 'true' : 'false') +
            '" style="border-left-color: ' + color + ';">' +
            '<span class="admin-status-counter__count">' + counts[statut] + '</span>' +
            '<span class="admin-status-counter__label">' + escapeHtml(statut) + '</span></button>';
    });

    container.innerHTML = html;
}

// ============================================================
// 16. STORY 2.1b — FILTRAGE PAR STATUT
// ============================================================

function adminFilterByStatus(statut) {
    adminActiveStatusFilter = statut;
    currentPage = 1;
    renderStatusCounters();
    adminApplyFilters();
}

// ============================================================
// 17. STORY 2.1b — FILTRAGE COMBINE (recherche + statut + en cours)
// ============================================================

function adminApplyFilters() {
    var searchInput = document.getElementById('admin-search-input');
    var clearBtn = document.getElementById('admin-search-clear');
    if (!searchInput) return;

    var searchText = searchInput.value.toLowerCase().trim();

    // Afficher/masquer le bouton clear
    if (clearBtn) {
        if (searchText.length > 0) {
            clearBtn.classList.remove('hidden');
        } else {
            clearBtn.classList.add('hidden');
        }
    }

    adminFilteredBillets = adminBillets.filter(function(billet) {
        // Filtre statut
        if (adminActiveStatusFilter !== 'tous') {
            var billetStatut = billet.Categorie || 'Non defini';
            if (billetStatut !== adminActiveStatusFilter) {
                return false;
            }
        }

        // Filtre "En cours" (masquer les termines)
        if (adminFilterEnCours && billet.Categorie === 'Terminé') {
            return false;
        }

        // Recherche textuelle
        if (searchText) {
            var fields = [
                billet.NomBillet, billet.Ville, billet.Reference,
                billet.Millesime, billet.Collecteur, billet.Dep,
                billet.Cp, billet.Pays, billet.Categorie,
                billet.Theme, billet.Commentaire
            ];
            var match = fields.some(function(val) {
                return val && String(val).toLowerCase().indexOf(searchText) !== -1;
            });
            if (!match) return false;
        }

        return true;
    });

    renderAdminCards();
}

// ============================================================
// 18. STORY 2.1b — FONCTIONS UTILITAIRES DE RECHERCHE
// ============================================================

function adminClearSearch() {
    var input = document.getElementById('admin-search-input');
    if (input) input.value = '';
    currentPage = 1;
    adminApplyFilters();
}

function adminToggleEnCours() {
    adminFilterEnCours = !adminFilterEnCours;
    var btn = document.getElementById('admin-filter-en-cours');
    if (btn) {
        btn.setAttribute('aria-pressed', adminFilterEnCours ? 'true' : 'false');
        if (adminFilterEnCours) {
            btn.classList.add('admin-filter-toggle--active');
        } else {
            btn.classList.remove('admin-filter-toggle--active');
        }
    }
    currentPage = 1;
    adminApplyFilters();
}

function adminResetFilters() {
    // Reset recherche
    var input = document.getElementById('admin-search-input');
    if (input) input.value = '';

    // Reset statut
    adminActiveStatusFilter = 'tous';

    // Reset "En cours"
    adminFilterEnCours = false;
    var btn = document.getElementById('admin-filter-en-cours');
    if (btn) {
        btn.setAttribute('aria-pressed', 'false');
        btn.classList.remove('admin-filter-toggle--active');
    }

    currentPage = 1;
    renderStatusCounters();
    adminApplyFilters();
}

// ============================================================
// 19. COMPATIBILITE — Ancien handler
// ============================================================
// Garde pour compatibilite si le onclick="handleAddBillet()" existe encore dans le HTML
function handleAddBillet() {
    openBilletPanel();
}
