// ============================================================
// collecteurs.js — BilletsTouristiques Gestion des collecteurs
// Story 5.1
// ============================================================

// ============================================================
// 1. TOAST NOTIFICATIONS
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
// 2. UTILITAIRES D'ECHAPPEMENT
// ============================================================
function escapeHtml(text) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(text));
    return div.innerHTML;
}

function escapeAttr(text) {
    return String(text).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ============================================================
// 3. DONNEES EN MEMOIRE
// ============================================================
var collecteursData = [];
var membresCache = [];
var membreSelectTargetId = null;

// ============================================================
// 4. INITIALISATION
// ============================================================
if (typeof firebase !== 'undefined') {
    firebase.auth().onAuthStateChanged(function(user) {
        if (user) {
            loadCollecteursPage();
            initCollecteurEvents();
        }
    });
}

// ============================================================
// 5. CHARGEMENT DES COLLECTEURS DEPUIS SUPABASE
// ============================================================
function loadCollecteursPage() {
    var grid = document.getElementById('collecteur-cards-grid');
    if (!grid) return;

    supabaseFetch('/rest/v1/collecteurs?select=*&order=alias.asc')
        .then(function(data) {
            collecteursData = data || [];
            renderCollecteurs();
        })
        .catch(function(error) {
            console.error('Erreur chargement collecteurs:', error);
            showToast('Erreur chargement collecteurs : ' + error.message, 'error');
        });
}

// ============================================================
// 6. RENDU DES CARTES COLLECTEURS
// ============================================================
function renderCollecteurs() {
    var grid = document.getElementById('collecteur-cards-grid');
    if (!grid) return;

    var emptyState = document.getElementById('collecteur-empty-state');

    if (collecteursData.length === 0) {
        grid.innerHTML = '';
        if (emptyState) emptyState.style.display = 'block';
        return;
    }

    if (emptyState) emptyState.style.display = 'none';

    var html = '';
    collecteursData.forEach(function(c) {
        var id = c.id || '';
        var alias = c.alias || '';
        var nom = c.nom || '';
        var prenom = c.prenom || '';
        var paypalEmail = c.paypal_email || '';
        var paypalMe = c.paypal_me || '';
        var emailMembre = c.email_membre || '';
        var masque = c.masque || false;
        var displayName = alias;
        var fullName = [prenom, nom].filter(function(s) { return s; }).join(' ');

        html += '<div class="user-card' + (masque ? ' collecteur-masque' : '') + '" data-collecteur-id="' + escapeAttr(id) + '">' +
            '<div class="user-card-header">' +
                '<span class="user-card-name">' + escapeHtml(displayName) + '</span>' +
                '<div class="collecteur-header-right">' +
                    (fullName ? '<span class="collecteur-fullname">' + escapeHtml(fullName) + '</span>' : '') +
                    '<button class="collecteur-masque-toggle' + (masque ? ' active' : '') + '" ' +
                        'data-collecteur-id="' + escapeAttr(id) + '" ' +
                        'title="' + (masque ? 'Rendre visible' : 'Masquer') + '">' +
                        '<i class="fa-solid ' + (masque ? 'fa-eye-slash' : 'fa-eye') + '"></i>' +
                    '</button>' +
                '</div>' +
            '</div>' +
            '<div class="user-card-details">' +
                (paypalEmail ? '<span class="user-card-email"><i class="fa-solid fa-credit-card"></i> ' + escapeHtml(paypalEmail) + '</span>' : '') +
                (paypalMe ? '<span class="user-card-pseudo"><i class="fa-brands fa-paypal"></i> ' + escapeHtml(paypalMe) + '</span>' : '') +
                '<span class="user-card-email collecteur-email-membre-display">' +
                    '<i class="fa-solid fa-link"></i> ' +
                    (emailMembre ? escapeHtml(emailMembre) : '<em>Aucun membre rattaché</em>') +
                    ' <button class="collecteur-pick-membre-btn" data-collecteur-id="' + escapeAttr(id) + '" title="Choisir un membre">' +
                        '<i class="fa-solid fa-address-book"></i>' +
                    '</button>' +
                '</span>' +
            '</div>' +
            // Mode edition (cache par defaut)
            '<div class="user-card-edit" data-collecteur-id="' + escapeAttr(id) + '" style="display:none">' +
                '<div class="user-edit-field">' +
                    '<label>Alias *</label>' +
                    '<input type="text" class="edit-alias" value="' + escapeAttr(alias) + '" placeholder="Alias">' +
                '</div>' +
                '<div class="user-edit-field">' +
                    '<label>Nom</label>' +
                    '<input type="text" class="edit-nom" value="' + escapeAttr(nom) + '" placeholder="Nom">' +
                '</div>' +
                '<div class="user-edit-field">' +
                    '<label>Prénom</label>' +
                    '<input type="text" class="edit-prenom" value="' + escapeAttr(prenom) + '" placeholder="Prénom">' +
                '</div>' +
                '<div class="user-edit-field">' +
                    '<label>PayPal Email</label>' +
                    '<input type="email" class="edit-paypal-email" value="' + escapeAttr(paypalEmail) + '" placeholder="PayPal Email">' +
                '</div>' +
                '<div class="user-edit-field">' +
                    '<label>PayPal.me</label>' +
                    '<input type="text" class="edit-paypal-me" value="' + escapeAttr(paypalMe) + '" placeholder="PayPal.me">' +
                '</div>' +
                '<div class="user-edit-field">' +
                    '<label>Email membre</label>' +
                    '<input type="email" class="edit-email-membre" value="' + escapeAttr(emailMembre) + '" placeholder="Email membre rattaché">' +
                '</div>' +
                '<div class="user-edit-actions">' +
                    '<button class="collecteur-edit-save-btn user-modal-btn user-modal-btn-primary" data-collecteur-id="' + escapeAttr(id) + '"><i class="fa-solid fa-check"></i> Enregistrer</button>' +
                    '<button class="collecteur-edit-cancel-btn user-modal-btn"><i class="fa-solid fa-xmark"></i> Annuler</button>' +
                '</div>' +
            '</div>' +
            '<div class="user-card-actions">' +
                '<button class="collecteur-edit-toggle-btn user-edit-toggle-btn" ' +
                    'data-collecteur-id="' + escapeAttr(id) + '" ' +
                    'title="Modifier ce collecteur">' +
                    '<i class="fa-solid fa-pen"></i> Modifier' +
                '</button>' +
            '</div>' +
            '</div>';
    });

    grid.innerHTML = html;
}

// ============================================================
// 7. EVENT DELEGATION & INITIALISATION
// ============================================================
function initCollecteurEvents() {
    var cardsGrid = document.getElementById('collecteur-cards-grid');
    if (cardsGrid) {
        cardsGrid.addEventListener('click', function(event) {
            // Toggle masque
            var masqueToggle = event.target.closest('.collecteur-masque-toggle');
            if (masqueToggle) {
                event.stopPropagation();
                var collecteurId = masqueToggle.getAttribute('data-collecteur-id');
                toggleMasqueCollecteur(collecteurId);
                return;
            }

            // Pick membre button
            var pickMembre = event.target.closest('.collecteur-pick-membre-btn');
            if (pickMembre) {
                event.stopPropagation();
                var collecteurId = pickMembre.getAttribute('data-collecteur-id');
                openMembreSelectPopup(collecteurId);
                return;
            }

            // Toggle edit mode
            var editToggle = event.target.closest('.collecteur-edit-toggle-btn');
            if (editToggle) {
                event.stopPropagation();
                var card = editToggle.closest('.user-card');
                if (!card) return;
                var editPanel = card.querySelector('.user-card-edit');
                if (editPanel) {
                    editPanel.style.display = editPanel.style.display === 'none' ? 'block' : 'none';
                }
                return;
            }

            // Save edit
            var editSave = event.target.closest('.collecteur-edit-save-btn');
            if (editSave) {
                event.stopPropagation();
                var collecteurId = editSave.getAttribute('data-collecteur-id');
                saveCollecteur(collecteurId);
                return;
            }

            // Cancel edit
            var editCancel = event.target.closest('.collecteur-edit-cancel-btn');
            if (editCancel) {
                event.stopPropagation();
                var card = editCancel.closest('.user-card');
                if (!card) return;
                var editPanel = card.querySelector('.user-card-edit');
                if (editPanel) editPanel.style.display = 'none';
                return;
            }
        });
    }

    // Add collecteur form toggle
    var addBtn = document.getElementById('add-collecteur-btn');
    var addForm = document.getElementById('add-collecteur-form');
    var cancelBtn = document.getElementById('cancel-add-collecteur-btn');
    var confirmBtn = document.getElementById('confirm-add-collecteur-btn');
    var aliasInput = document.getElementById('new-collecteur-alias');

    if (addBtn && addForm) {
        addBtn.addEventListener('click', function() {
            addForm.style.display = addForm.style.display === 'none' ? 'flex' : 'none';
            if (addForm.style.display === 'flex' && aliasInput) {
                aliasInput.value = '';
                aliasInput.focus();
            }
        });
    }

    if (cancelBtn && addForm) {
        cancelBtn.addEventListener('click', function() {
            addForm.style.display = 'none';
            resetAddCollecteurForm();
        });
    }

    if (confirmBtn) {
        confirmBtn.addEventListener('click', function() {
            addCollecteur();
        });
    }

    if (aliasInput) {
        aliasInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') addCollecteur();
        });
    }

    // Membre select popup events
    var membreOverlay = document.getElementById('membre-select-overlay');
    var membreCancel = document.getElementById('membre-select-cancel');
    var membreClear = document.getElementById('membre-select-clear');
    var membreSearch = document.getElementById('membre-search-input');

    if (membreCancel) {
        membreCancel.addEventListener('click', function() {
            closeMembreSelectPopup();
        });
    }

    if (membreClear) {
        membreClear.addEventListener('click', function() {
            if (membreSelectTargetId) {
                saveEmailMembre(membreSelectTargetId, '');
            }
        });
    }

    if (membreOverlay) {
        membreOverlay.addEventListener('click', function(e) {
            if (e.target === membreOverlay) closeMembreSelectPopup();
        });
    }

    if (membreSearch) {
        membreSearch.addEventListener('input', function() {
            renderMembreList(membreSearch.value.trim().toLowerCase());
        });
    }
}

// ============================================================
// 8. TOGGLE MASQUE COLLECTEUR
// ============================================================
function toggleMasqueCollecteur(id) {
    var collecteur = collecteursData.find(function(c) { return String(c.id) === String(id); });
    if (!collecteur) return;

    var newMasque = !collecteur.masque;

    supabaseFetch('/rest/v1/collecteurs?id=eq.' + id, {
        method: 'PATCH',
        body: JSON.stringify({ masque: newMasque }),
        headers: { 'Prefer': 'return=representation' }
    })
    .then(function() {
        showToast(newMasque ? 'Collecteur masqué' : 'Collecteur visible', 'success');
        loadCollecteursPage();
    })
    .catch(function(error) {
        console.error('Erreur toggle masque:', error);
        showToast('Erreur : ' + error.message, 'error');
    });
}

// ============================================================
// 9. POPUP SELECTION MEMBRE
// ============================================================
function openMembreSelectPopup(collecteurId) {
    membreSelectTargetId = collecteurId;
    var overlay = document.getElementById('membre-select-overlay');
    var searchInput = document.getElementById('membre-search-input');
    if (overlay) overlay.style.display = 'flex';
    if (searchInput) { searchInput.value = ''; searchInput.focus(); }

    if (membresCache.length > 0) {
        renderMembreList('');
        return;
    }

    var listDiv = document.getElementById('membre-list');
    if (listDiv) listDiv.innerHTML = '<p style="text-align:center;color:#888">Chargement...</p>';

    supabaseFetch('/rest/v1/membres?select=email,nom,prenom&order=nom.asc,prenom.asc')
        .then(function(data) {
            membresCache = data || [];
            renderMembreList('');
        })
        .catch(function(error) {
            console.error('Erreur chargement membres:', error);
            if (listDiv) listDiv.innerHTML = '<p style="color:red">Erreur de chargement</p>';
        });
}

function closeMembreSelectPopup() {
    var overlay = document.getElementById('membre-select-overlay');
    if (overlay) overlay.style.display = 'none';
    membreSelectTargetId = null;
}

function renderMembreList(filter) {
    var listDiv = document.getElementById('membre-list');
    if (!listDiv) return;

    var filtered = membresCache;
    if (filter) {
        filtered = membresCache.filter(function(m) {
            var search = (m.nom || '') + ' ' + (m.prenom || '') + ' ' + (m.email || '');
            return search.toLowerCase().indexOf(filter) !== -1;
        });
    }

    if (filtered.length === 0) {
        listDiv.innerHTML = '<p style="text-align:center;color:#888;padding:var(--spacing-md)">Aucun membre trouvé</p>';
        return;
    }

    var html = '';
    filtered.forEach(function(m) {
        var displayName = [m.prenom, m.nom].filter(function(s) { return s; }).join(' ');
        html += '<div class="membre-list-item" data-email="' + escapeAttr(m.email) + '">' +
            '<span class="membre-list-name">' + escapeHtml(displayName || '—') + '</span>' +
            '<span class="membre-list-email">' + escapeHtml(m.email) + '</span>' +
            '</div>';
    });

    listDiv.innerHTML = html;

    // Attach click handlers
    listDiv.querySelectorAll('.membre-list-item').forEach(function(item) {
        item.addEventListener('click', function() {
            var email = item.getAttribute('data-email');
            if (membreSelectTargetId) {
                saveEmailMembre(membreSelectTargetId, email);
            }
        });
    });
}

function saveEmailMembre(collecteurId, email) {
    supabaseFetch('/rest/v1/collecteurs?id=eq.' + collecteurId, {
        method: 'PATCH',
        body: JSON.stringify({ email_membre: email }),
        headers: { 'Prefer': 'return=representation' }
    })
    .then(function() {
        showToast(email ? 'Membre rattaché : ' + email : 'Membre détaché', 'success');
        closeMembreSelectPopup();
        loadCollecteursPage();
    })
    .catch(function(error) {
        console.error('Erreur rattachement membre:', error);
        showToast('Erreur : ' + error.message, 'error');
    });
}

// ============================================================
// 10. AJOUT D'UN COLLECTEUR
// ============================================================
function addCollecteur() {
    var alias = document.getElementById('new-collecteur-alias').value.trim();
    if (!alias) {
        showToast('L\'alias est obligatoire', 'error');
        return;
    }

    var exists = collecteursData.some(function(c) {
        return c.alias.toLowerCase() === alias.toLowerCase();
    });
    if (exists) {
        showToast('Cet alias existe déjà', 'error');
        return;
    }

    var body = {
        alias: alias,
        nom: document.getElementById('new-collecteur-nom').value.trim(),
        prenom: document.getElementById('new-collecteur-prenom').value.trim(),
        paypal_email: document.getElementById('new-collecteur-paypal-email').value.trim(),
        paypal_me: document.getElementById('new-collecteur-paypal-me').value.trim(),
        email_membre: document.getElementById('new-collecteur-email-membre').value.trim()
    };

    supabaseFetch('/rest/v1/collecteurs', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Prefer': 'return=representation' }
    })
    .then(function() {
        showToast('Collecteur ajouté avec succès', 'success');
        resetAddCollecteurForm();
        var addForm = document.getElementById('add-collecteur-form');
        if (addForm) addForm.style.display = 'none';
        loadCollecteursPage();
    })
    .catch(function(error) {
        console.error('Erreur ajout collecteur:', error);
        showToast('Erreur lors de l\'ajout : ' + error.message, 'error');
    });
}

function resetAddCollecteurForm() {
    var ids = [
        'new-collecteur-alias', 'new-collecteur-nom', 'new-collecteur-prenom',
        'new-collecteur-paypal-email', 'new-collecteur-paypal-me', 'new-collecteur-email-membre'
    ];
    ids.forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.value = '';
    });
}

// ============================================================
// 11. MODIFICATION D'UN COLLECTEUR
// ============================================================
function saveCollecteur(id) {
    var card = document.querySelector('[data-collecteur-id="' + id + '"]');
    if (!card) return;

    // Find the edit panel within the card
    var editPanel = card.querySelector('.user-card-edit') || card;

    var body = {
        alias: editPanel.querySelector('.edit-alias').value.trim(),
        nom: editPanel.querySelector('.edit-nom').value.trim(),
        prenom: editPanel.querySelector('.edit-prenom').value.trim(),
        paypal_email: editPanel.querySelector('.edit-paypal-email').value.trim(),
        paypal_me: editPanel.querySelector('.edit-paypal-me').value.trim(),
        email_membre: editPanel.querySelector('.edit-email-membre').value.trim()
    };

    if (!body.alias) {
        showToast('L\'alias est obligatoire', 'error');
        return;
    }

    // Vérifier unicité de l'alias (exclure le collecteur en cours)
    var aliasExists = collecteursData.some(function(c) {
        return String(c.id) !== String(id) && c.alias.toLowerCase() === body.alias.toLowerCase();
    });
    if (aliasExists) {
        showToast('Cet alias existe déjà', 'error');
        return;
    }

    supabaseFetch('/rest/v1/collecteurs?id=eq.' + id, {
        method: 'PATCH',
        body: JSON.stringify(body),
        headers: { 'Prefer': 'return=representation' }
    })
    .then(function() {
        showToast('Collecteur modifié avec succès', 'success');
        loadCollecteursPage();
    })
    .catch(function(error) {
        console.error('Erreur modification collecteur:', error);
        showToast('Erreur lors de la modification : ' + error.message, 'error');
    });
}
