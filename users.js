// ============================================================
// users.js — BilletsTouristiques Gestion des membres
// Stories 3.1, 3.2, 4.1
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
// 2b. FORMATAGE DERNIERE ACTIVITE
// ============================================================
function formatLastActive(isoString) {
    if (!isoString) return 'Jamais connecté';
    var date = new Date(isoString);
    var now = new Date();
    var diffMs = now - date;
    var diffMin = Math.floor(diffMs / 60000);
    var diffH = Math.floor(diffMs / 3600000);
    var diffJ = Math.floor(diffMs / 86400000);

    if (diffMin < 1) return 'En ligne';
    if (diffMin < 60) return 'Il y a ' + diffMin + ' min';
    if (diffH < 24) return 'Il y a ' + diffH + 'h';
    if (diffJ < 7) return 'Il y a ' + diffJ + ' jour' + (diffJ > 1 ? 's' : '');
    return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ============================================================
// 3. DONNEES EN MEMOIRE
// ============================================================
var usersList = [];

// ============================================================
// 4. INITIALISATION
// ============================================================
if (typeof firebase !== 'undefined') {
    firebase.auth().onAuthStateChanged(function(user) {
        if (user) {
            loadUsers();
            initUserEvents();
        }
    });
}

// ============================================================
// 5. CHARGEMENT DES UTILISATEURS DEPUIS SUPABASE
// ============================================================
function loadUsers() {
    var grid = document.getElementById('user-cards-grid');
    if (!grid) return;

    supabaseFetch('/rest/v1/membres?select=email,role,pseudo,nom,prenom,rue,code_postal,ville,pays,indicatif_tel,telephone,last_active_at&order=nom.asc.nullslast,prenom.asc.nullslast', { method: 'GET' })
        .then(function(rows) {
            usersList = rows.map(function(row) {
                row._id = row.email;
                return row;
            });

            if (usersList.length === 0) {
                grid.innerHTML = '';
                var emptyState = document.getElementById('user-empty-state');
                if (emptyState) emptyState.style.display = 'block';
            } else {
                var emptyState = document.getElementById('user-empty-state');
                if (emptyState) emptyState.style.display = 'none';
                renderUserCards();
            }
        })
        .catch(function(error) {
            showToast('Erreur chargement membres : ' + error.message, 'error');
            console.error('Erreur chargement membres:', error);
            if (grid) {
                grid.innerHTML = '<div class="user-empty-state">' +
                    '<i class="fa-solid fa-circle-exclamation" style="color: var(--color-danger);"></i>' +
                    '<p>Impossible de charger les membres.</p>' +
                    '</div>';
            }
        });
}

// ============================================================
// 5b. QW-5 — RECHERCHE MEMBRES
// ============================================================
var activeRoleFilter = 'tous';

function filterUsers() {
    var input = document.getElementById('user-search-input');
    var clearBtn = document.getElementById('user-search-clear');
    var query = input ? input.value.trim().toLowerCase() : '';
    if (clearBtn) clearBtn.style.display = query ? '' : 'none';
    renderUserCards(query);
}

function clearUserSearch() {
    var input = document.getElementById('user-search-input');
    if (input) input.value = '';
    var clearBtn = document.getElementById('user-search-clear');
    if (clearBtn) clearBtn.style.display = 'none';
    renderUserCards('');
}

function filterUsersByRole(role) {
    activeRoleFilter = role;
    document.querySelectorAll('.user-role-filter-btn').forEach(function(btn) {
        btn.classList.toggle('active', btn.getAttribute('data-role') === role);
    });
    filterUsers();
}

// ============================================================
// 6. RENDU DES CARTES UTILISATEURS
// ============================================================
function renderUserCards(searchQuery) {
    var grid = document.getElementById('user-cards-grid');
    if (!grid) return;

    var query = (searchQuery || '').toLowerCase();
    var filtered = usersList;
    if (activeRoleFilter === 'admin') {
        filtered = filtered.filter(function(user) { return user.role === 'admin' || user.role === 'superadmin'; });
    } else if (activeRoleFilter === 'member') {
        filtered = filtered.filter(function(user) { return user.role !== 'admin' && user.role !== 'superadmin'; });
    }
    if (query) {
        filtered = filtered.filter(function(user) {
            var email = (user._id || '').toLowerCase();
            var pseudo = (user.pseudo || '').toLowerCase();
            var nom = (user.nom || '').toLowerCase();
            var prenom = (user.prenom || '').toLowerCase();
            return email.indexOf(query) !== -1 || pseudo.indexOf(query) !== -1
                || nom.indexOf(query) !== -1 || prenom.indexOf(query) !== -1;
        });
    }

    // Afficher le compteur
    var countEl = document.getElementById('user-count');
    if (countEl) {
        countEl.textContent = filtered.length + ' membre' + (filtered.length > 1 ? 's' : '')
            + (query ? ' sur ' + usersList.length : '');
    }

    var html = '';
    filtered.forEach(function(user) {
        var email = user._id || '';
        var pseudo = user.pseudo || '';
        var nom = user.nom || '';
        var prenom = user.prenom || '';
        var role = user.role || '';
        var lastActive = user.last_active_at || '';
        var displayName = pseudo || ((nom && prenom) ? nom + ' ' + prenom : (nom || prenom)) || email;
        var isAdmin = role === 'admin' || role === 'superadmin';
        var badgeClass = isAdmin ? 'user-badge-role user-badge-admin' : 'user-badge-role user-badge-member';
        var badgeLabel = isAdmin ? 'Admin' : 'Membre';
        var btnClass = isAdmin ? 'user-role-toggle-btn demote' : 'user-role-toggle-btn promote';
        var btnIcon = isAdmin ? 'fa-solid fa-user-minus' : 'fa-solid fa-user-plus';
        var btnText = isAdmin ? 'Rétrograder membre' : 'Promouvoir admin';

        html += '<div class="user-card" data-doc-id="' + escapeAttr(email) + '">' +
            '<div class="user-card-header">' +
                '<span class="user-card-name">' + escapeHtml(displayName) + '</span>' +
                '<span class="' + badgeClass + '">' + badgeLabel + '</span>' +
            '</div>' +
            '<div class="user-card-details">' +
                '<span class="user-card-email"><i class="fa-solid fa-envelope"></i> ' + escapeHtml(email) + '</span>' +
                (pseudo ? '<span class="user-card-pseudo"><i class="fa-solid fa-at"></i> ' + escapeHtml(pseudo) + '</span>' : '') +
                '<span class="user-card-last-active"><i class="fa-solid fa-clock"></i> ' + formatLastActive(lastActive) + '</span>' +
                (function() {
                    var hasAddr = user.rue || user.code_postal || user.ville;
                    return '<a href="#" class="user-addr-indicator' + (hasAddr ? ' user-addr-ok' : ' user-addr-missing') + '" data-doc-id="' + escapeAttr(email) + '" onclick="event.preventDefault(); openUserEditModal(\'' + escapeAttr(email).replace(/'/g, "\\'") + '\')">' +
                        '<i class="fa-solid fa-location-dot"></i> ' + (hasAddr ? 'Adresse renseignée' : 'Adresse non renseignée') +
                    '</a>';
                })() +
            '</div>' +
            '<div class="user-card-actions">' +
                '<button class="user-edit-toggle-btn" ' +
                    'data-doc-id="' + escapeAttr(email) + '" ' +
                    'title="Modifier la fiche">' +
                    '<i class="fa-solid fa-pen"></i> Modifier la fiche' +
                '</button>' +
                (role === 'superadmin' ? '' :
                '<button class="' + btnClass + '" ' +
                    'data-doc-id="' + escapeAttr(email) + '" ' +
                    'data-current-role="' + escapeAttr(role) + '" ' +
                    'title="' + escapeAttr(btnText) + '">' +
                    '<i class="' + btnIcon + '"></i> ' + escapeHtml(btnText) +
                '</button>') +
                '<button class="user-delete-btn" ' +
                    'data-doc-id="' + escapeAttr(email) + '" ' +
                    'title="Supprimer ce membre">' +
                    '<i class="fa-solid fa-trash"></i> Supprimer' +
                '</button>' +
            '</div>' +
            '</div>';
    });

    grid.innerHTML = html;
}

// ============================================================
// 7. EVENT DELEGATION & INITIALISATION
// ============================================================
function initUserEvents() {
    var cardsGrid = document.getElementById('user-cards-grid');
    if (cardsGrid) {
        cardsGrid.addEventListener('click', function(event) {
            var roleBtn = event.target.closest('.user-role-toggle-btn');
            if (roleBtn) {
                event.stopPropagation();
                var email = roleBtn.getAttribute('data-doc-id');
                var currentRole = roleBtn.getAttribute('data-current-role');
                if (currentRole === 'superadmin') return; // rôle protégé
                var newRole = (currentRole === 'admin') ? 'member' : 'admin';

                // Verifier auto-retrogradation
                if (newRole === 'member' && firebase.auth().currentUser && email === firebase.auth().currentUser.email) {
                    openSelfDemoteModal(email);
                    return;
                }
                changeUserRole(email, newRole);
                return;
            }

            var editToggle = event.target.closest('.user-edit-toggle-btn');
            if (editToggle) {
                event.stopPropagation();
                var email = editToggle.getAttribute('data-doc-id');
                openUserEditModal(email);
                return;
            }

            var deleteBtn = event.target.closest('.user-delete-btn');
            if (deleteBtn) {
                event.stopPropagation();
                var email = deleteBtn.getAttribute('data-doc-id');
                if (firebase.auth().currentUser && email === firebase.auth().currentUser.email) {
                    showToast('Vous ne pouvez pas supprimer votre propre compte.', 'error');
                    return;
                }
                openDeleteUserModal(email);
            }
        });
    }

    // Add user form toggle
    var addBtn = document.getElementById('add-user-btn');
    var addForm = document.getElementById('add-user-form');
    var cancelBtn = document.getElementById('cancel-add-user-btn');
    var confirmBtn = document.getElementById('confirm-add-user-btn');
    var emailInput = document.getElementById('new-user-email');

    if (addBtn && addForm) {
        addBtn.addEventListener('click', function() {
            addForm.style.display = addForm.style.display === 'none' ? 'flex' : 'none';
            if (addForm.style.display === 'flex' && emailInput) {
                emailInput.value = '';
                emailInput.focus();
            }
        });
    }

    if (cancelBtn && addForm) {
        cancelBtn.addEventListener('click', function() {
            addForm.style.display = 'none';
        });
    }

    if (confirmBtn) {
        confirmBtn.addEventListener('click', function() {
            addUser();
        });
    }

    if (emailInput) {
        emailInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') addUser();
        });
    }
}

// ============================================================
// 7b. AJOUT D'UN MEMBRE
// ============================================================
function addUser() {
    var emailInput = document.getElementById('new-user-email');
    var addForm = document.getElementById('add-user-form');
    if (!emailInput) return;

    var email = emailInput.value.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showToast('Veuillez saisir une adresse email valide.', 'error');
        return;
    }

    // Verifier si l'email existe deja
    for (var i = 0; i < usersList.length; i++) {
        if (usersList[i]._id === email) {
            showToast('Ce membre existe déjà.', 'error');
            return;
        }
    }

    var pseudoInput = document.getElementById('new-user-pseudo');
    var nomInput = document.getElementById('new-user-nom');
    var prenomInput = document.getElementById('new-user-prenom');
    var pseudo = pseudoInput ? pseudoInput.value.trim() : '';
    var nom = nomInput ? nomInput.value.trim() : '';
    var prenom = prenomInput ? prenomInput.value.trim() : '';

    supabaseFetch('/rest/v1/membres', {
        method: 'POST',
        body: JSON.stringify({ email: email, role: 'member', pseudo: pseudo, nom: nom, prenom: prenom })
    })
        .then(function() {
            showToast('Membre ajouté avec succès', 'success');
            emailInput.value = '';
            if (pseudoInput) pseudoInput.value = '';
            if (nomInput) nomInput.value = '';
            if (prenomInput) prenomInput.value = '';
            if (addForm) addForm.style.display = 'none';
            loadUsers();
        })
        .catch(function(error) {
            showToast('Erreur lors de l\'ajout : ' + error.message, 'error');
            console.error('Erreur ajout membre:', error);
        });
}

// ============================================================
// 7b2. MODALE EDITION FICHE MEMBRE
// ============================================================
function openUserEditModal(email) {
    var user = null;
    for (var i = 0; i < usersList.length; i++) {
        if (usersList[i]._id === email) { user = usersList[i]; break; }
    }
    if (!user) return;

    var existing = document.getElementById('user-edit-modal-overlay');
    if (existing) existing.remove();

    var html = '<div id="user-edit-modal-overlay" class="user-modal-overlay" onclick="if(event.target===this)closeUserEditModal()">';
    html += '<div class="user-edit-modal">';
    html += '<button class="user-edit-modal-close" onclick="closeUserEditModal()">&times;</button>';
    html += '<h2><i class="fa-solid fa-user-pen"></i> Modifier la fiche</h2>';
    html += '<p class="user-edit-modal-email"><i class="fa-solid fa-envelope"></i> ' + escapeHtml(email) + '</p>';

    html += '<div class="user-edit-modal-fields">';
    html += '<div class="user-edit-modal-row">';
    html += '<div class="user-edit-modal-field"><label>Pseudo</label><input type="text" id="ue-pseudo" value="' + escapeAttr(user.pseudo || '') + '" placeholder="Pseudo"></div>';
    html += '</div>';
    html += '<div class="user-edit-modal-row">';
    html += '<div class="user-edit-modal-field"><label>Nom</label><input type="text" id="ue-nom" value="' + escapeAttr(user.nom || '') + '" placeholder="Nom"></div>';
    html += '<div class="user-edit-modal-field"><label>Prénom</label><input type="text" id="ue-prenom" value="' + escapeAttr(user.prenom || '') + '" placeholder="Prénom"></div>';
    html += '</div>';
    html += '<div class="user-edit-modal-row">';
    html += '<div class="user-edit-modal-field user-edit-modal-field-full"><label>Rue</label><input type="text" id="ue-rue" value="' + escapeAttr(user.rue || '') + '" placeholder="Adresse"></div>';
    html += '</div>';
    html += '<div class="user-edit-modal-row">';
    html += '<div class="user-edit-modal-field"><label>Code postal</label><input type="text" id="ue-cp" value="' + escapeAttr(user.code_postal || '') + '" placeholder="Code postal"></div>';
    html += '<div class="user-edit-modal-field"><label>Ville</label><input type="text" id="ue-ville" value="' + escapeAttr(user.ville || '') + '" placeholder="Ville"></div>';
    html += '</div>';
    html += '<div class="user-edit-modal-row">';
    html += '<div class="user-edit-modal-field"><label>Pays</label><input type="text" id="ue-pays" value="' + escapeAttr(user.pays || '') + '" placeholder="Pays"></div>';
    html += '</div>';
    html += '<div class="user-edit-modal-row">';
    html += '<div class="user-edit-modal-field"><label>Indicatif</label><input type="text" id="ue-indicatif" value="' + escapeAttr(user.indicatif_tel || '') + '" placeholder="+33"></div>';
    html += '<div class="user-edit-modal-field"><label>Téléphone</label><input type="text" id="ue-telephone" value="' + escapeAttr(user.telephone || '') + '" placeholder="Téléphone"></div>';
    html += '</div>';
    html += '</div>';

    html += '<div class="user-edit-modal-actions">';
    html += '<button class="user-modal-btn user-modal-btn-primary" onclick="saveUserEditModal(\'' + escapeAttr(email).replace(/'/g, "\\'") + '\')"><i class="fa-solid fa-check"></i> Sauvegarder</button>';
    html += '<button class="user-modal-btn" onclick="closeUserEditModal()"><i class="fa-solid fa-xmark"></i> Annuler</button>';
    html += '</div>';
    html += '</div></div>';

    document.body.insertAdjacentHTML('beforeend', html);
    document.addEventListener('keydown', onUserEditKeydown);
}

function closeUserEditModal() {
    var overlay = document.getElementById('user-edit-modal-overlay');
    if (overlay) overlay.remove();
    document.removeEventListener('keydown', onUserEditKeydown);
}

function onUserEditKeydown(e) {
    if (e.key === 'Escape') closeUserEditModal();
}

function saveUserEditModal(email) {
    var data = {
        pseudo: document.getElementById('ue-pseudo').value.trim(),
        nom: document.getElementById('ue-nom').value.trim(),
        prenom: document.getElementById('ue-prenom').value.trim(),
        rue: document.getElementById('ue-rue').value.trim(),
        code_postal: document.getElementById('ue-cp').value.trim(),
        ville: document.getElementById('ue-ville').value.trim(),
        pays: document.getElementById('ue-pays').value.trim(),
        indicatif_tel: document.getElementById('ue-indicatif').value.trim(),
        telephone: document.getElementById('ue-telephone').value.trim()
    };

    supabaseFetch('/rest/v1/membres?email=eq.' + encodeURIComponent(email), {
        method: 'PATCH',
        body: JSON.stringify(data)
    })
        .then(function() {
            for (var i = 0; i < usersList.length; i++) {
                if (usersList[i]._id === email) {
                    Object.keys(data).forEach(function(k) { usersList[i][k] = data[k]; });
                    break;
                }
            }
            showToast('Fiche mise à jour', 'success');
            closeUserEditModal();
            var searchInput = document.getElementById('user-search-input');
            var currentQuery = searchInput ? searchInput.value.trim() : '';
            renderUserCards(currentQuery);
        })
        .catch(function(error) {
            showToast('Erreur : ' + error.message, 'error');
        });
}

// ============================================================
// 7c. SUPPRESSION D'UN MEMBRE
// ============================================================
var deleteUserTargetEmail = null;

function openDeleteUserModal(email) {
    deleteUserTargetEmail = email;
    var overlay = document.getElementById('delete-user-modal-overlay');
    if (!overlay) return;

    var nameEl = document.getElementById('delete-user-email-display');
    if (nameEl) nameEl.textContent = email;

    overlay.style.display = 'flex';
    var cancelBtn = document.getElementById('delete-user-cancel-btn');
    if (cancelBtn) setTimeout(function() { cancelBtn.focus(); }, 100);

    document.addEventListener('keydown', onDeleteUserKeydown);
    overlay.addEventListener('click', onDeleteUserOverlayClick);
}

function closeDeleteUserModal() {
    var overlay = document.getElementById('delete-user-modal-overlay');
    if (overlay) {
        overlay.style.display = 'none';
        overlay.removeEventListener('click', onDeleteUserOverlayClick);
    }
    deleteUserTargetEmail = null;
    document.removeEventListener('keydown', onDeleteUserKeydown);
}

function confirmDeleteUser() {
    if (!deleteUserTargetEmail) return;
    var email = deleteUserTargetEmail;
    closeDeleteUserModal();

    supabaseFetch('/rest/v1/membres?email=eq.' + encodeURIComponent(email), {
        method: 'DELETE'
    })
        .then(function() {
            showToast('Membre supprimé', 'success');
            usersList = usersList.filter(function(u) { return u._id !== email; });
            renderUserCards();
            if (usersList.length === 0) {
                var emptyState = document.getElementById('user-empty-state');
                if (emptyState) emptyState.style.display = 'block';
            }
        })
        .catch(function(error) {
            showToast('Erreur lors de la suppression : ' + error.message, 'error');
            console.error('Erreur suppression membre:', error);
        });
}

function onDeleteUserKeydown(e) {
    if (e.key === 'Escape') closeDeleteUserModal();
}

function onDeleteUserOverlayClick(e) {
    if (e.target.id === 'delete-user-modal-overlay') closeDeleteUserModal();
}

// ============================================================
// 8. STORY 3.2 — CHANGEMENT DE ROLE SUPABASE
// ============================================================
function changeUserRole(email, newRole, isSelfDemotion) {
    var previousRole = (newRole === 'admin') ? 'member' : 'admin';

    // Mise a jour optimiste du DOM
    updateRoleInDOM(email, newRole);

    supabaseFetch('/rest/v1/membres?email=eq.' + encodeURIComponent(email), {
        method: 'PATCH',
        body: JSON.stringify({ role: newRole })
    })
        .then(function() {
            // Succes : mettre a jour usersList en memoire
            for (var i = 0; i < usersList.length; i++) {
                if (usersList[i]._id === email) {
                    usersList[i].role = newRole;
                    break;
                }
            }
            showToast('Rôle mis à jour avec succès', 'success');

            // Si auto-retrogradation, rediriger
            if (isSelfDemotion) {
                window.location.href = 'index.html';
            }
        })
        .catch(function(error) {
            showToast('Erreur lors du changement de rôle : ' + error.message, 'error');
            console.error('Erreur changement rôle:', error);
            // Rollback : revenir a l'etat precedent
            updateRoleInDOM(email, previousRole);
        });
}

function updateRoleInDOM(email, newRole) {
    var card = document.querySelector('.user-card[data-doc-id="' + CSS.escape(email) + '"]');
    if (!card) return;

    var badge = card.querySelector('.user-badge-role');
    if (badge) {
        badge.textContent = (newRole === 'admin') ? 'Admin' : 'Membre';
        badge.className = 'user-badge-role user-badge-' + newRole;
    }

    var btn = card.querySelector('.user-role-toggle-btn');
    if (btn) {
        var isAdmin = newRole === 'admin';
        btn.setAttribute('data-current-role', newRole);
        btn.className = isAdmin ? 'user-role-toggle-btn demote' : 'user-role-toggle-btn promote';
        btn.title = isAdmin ? 'Rétrograder membre' : 'Promouvoir admin';
        btn.innerHTML = isAdmin
            ? '<i class="fa-solid fa-user-minus"></i> Rétrograder membre'
            : '<i class="fa-solid fa-user-plus"></i> Promouvoir admin';
    }
}

// ============================================================
// 9. STORY 3.2 — MODALE AUTO-RETROGRADATION
// ============================================================
var selfDemoteTargetEmail = null;

function openSelfDemoteModal(email) {
    var overlay = document.getElementById('self-demote-modal-overlay');
    if (!overlay) return;

    selfDemoteTargetEmail = email;
    overlay.style.display = 'flex';

    var cancelBtn = document.getElementById('self-demote-cancel-btn');
    if (cancelBtn) {
        setTimeout(function() { cancelBtn.focus(); }, 100);
    }

    document.addEventListener('keydown', onSelfDemoteKeydown);
    overlay.addEventListener('click', onSelfDemoteOverlayClick);
}

function closeSelfDemoteModal() {
    var overlay = document.getElementById('self-demote-modal-overlay');
    if (!overlay) return;

    overlay.style.display = 'none';
    selfDemoteTargetEmail = null;

    document.removeEventListener('keydown', onSelfDemoteKeydown);
    overlay.removeEventListener('click', onSelfDemoteOverlayClick);
}

function confirmSelfDemotion() {
    if (!selfDemoteTargetEmail) return;
    var email = selfDemoteTargetEmail;
    closeSelfDemoteModal();
    changeUserRole(email, 'member', true);
}

function onSelfDemoteKeydown(e) {
    if (e.key === 'Escape') {
        closeSelfDemoteModal();
        return;
    }
    // Focus trap dans la modale
    if (e.key === 'Tab') {
        var modal = document.getElementById('self-demote-modal');
        if (!modal) return;
        var focusable = modal.querySelectorAll('button');
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

function onSelfDemoteOverlayClick(e) {
    if (e.target.id === 'self-demote-modal-overlay') {
        closeSelfDemoteModal();
    }
}
