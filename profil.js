// ============================================================
// profil.js — BilletsTouristiques Mon profil
// Story 5.3
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
// 2. INITIALISATION
// ============================================================
if (typeof firebase !== 'undefined') {
    firebase.auth().onAuthStateChanged(function(user) {
        if (user) {
            initProfilPage(user);
        }
    });
}

function initProfilPage(user) {
    // Afficher l'email
    var emailDisplay = document.getElementById('profil-email');
    if (emailDisplay) emailDisplay.textContent = user.email;

    // Vérifier si redirection depuis inscription
    var params = new URLSearchParams(window.location.search);
    if (params.get('from') === 'inscription') {
        var redirectMsg = document.getElementById('profil-redirect-msg');
        if (redirectMsg) redirectMsg.style.display = 'flex';
    }

    // Charger la liste des pays puis le profil
    loadPaysList().then(function() {
        loadProfil();
    });

    // Initialiser le formulaire
    var form = document.getElementById('profil-form');
    if (form) {
        form.addEventListener('submit', function(e) {
            e.preventDefault();
            saveProfil();
        });
    }
}

// ============================================================
// 2b. CHARGEMENT DE LA LISTE DES PAYS
// ============================================================
function loadPaysList() {
    return supabaseFetch('/rest/v1/pays?select=nom&order=nom')
        .then(function(data) {
            var select = document.getElementById('profil-pays');
            if (!select || !data) return;
            data.forEach(function(p) {
                var option = document.createElement('option');
                option.value = p.nom;
                option.textContent = p.nom;
                select.appendChild(option);
            });
        })
        .catch(function(error) {
            console.error('Erreur chargement pays:', error);
        });
}

// ============================================================
// 3. CHARGEMENT DU PROFIL
// ============================================================
function loadProfil() {
    var user = firebase.auth().currentUser;
    if (!user) return;

    var email = user.email;
    supabaseFetch('/rest/v1/membres?email=eq.' + encodeURIComponent(email) + '&select=nom,prenom,rue,code_postal,ville,pays')
        .then(function(data) {
            if (data && data.length > 0) {
                prefillProfil(data[0]);
            }
        })
        .catch(function(error) {
            console.error('Erreur chargement profil:', error);
        });
}

function prefillProfil(data) {
    var fields = {
        'profil-nom': 'nom',
        'profil-prenom': 'prenom',
        'profil-rue': 'rue',
        'profil-code-postal': 'code_postal',
        'profil-ville': 'ville',
        'profil-pays': 'pays'
    };

    for (var fieldId in fields) {
        var el = document.getElementById(fieldId);
        if (el) el.value = data[fields[fieldId]] || '';
    }
}

// ============================================================
// 4. SAUVEGARDE DU PROFIL
// ============================================================
function saveProfil() {
    var user = firebase.auth().currentUser;
    if (!user) return;

    var nomEl = document.getElementById('profil-nom');
    var prenomEl = document.getElementById('profil-prenom');
    var rueEl = document.getElementById('profil-rue');
    var codePostalEl = document.getElementById('profil-code-postal');
    var villeEl = document.getElementById('profil-ville');
    var paysEl = document.getElementById('profil-pays');
    if (!nomEl || !prenomEl || !rueEl || !codePostalEl || !villeEl || !paysEl) return;
    var nom = nomEl.value.trim();
    var prenom = prenomEl.value.trim();
    var rue = rueEl.value.trim();
    var codePostal = codePostalEl.value.trim();
    var ville = villeEl.value.trim();
    var pays = paysEl.value.trim();

    // Validation
    if (!nom || !prenom || !rue || !codePostal || !ville || !pays) {
        showToast('Tous les champs sont obligatoires', 'error');
        return;
    }

    var email = user.email;
    var body = {
        nom: nom,
        prenom: prenom,
        rue: rue,
        code_postal: codePostal,
        ville: ville,
        pays: pays
    };

    var saveBtn = document.getElementById('profil-save-btn');
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Sauvegarde...';
    }

    supabaseFetch('/rest/v1/membres?email=eq.' + encodeURIComponent(email), {
        method: 'PATCH',
        body: JSON.stringify(body)
    })
    .then(function() {
        showToast('Profil sauvegardé avec succès', 'success');
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Sauvegarder';
        }

        // Si redirection depuis inscription, retour au catalogue
        var params = new URLSearchParams(window.location.search);
        if (params.get('from') === 'inscription') {
            setTimeout(function() {
                window.location.href = 'billets.html';
            }, 1500);
        }
    })
    .catch(function(error) {
        console.error('Erreur sauvegarde profil:', error);
        showToast('Erreur lors de la sauvegarde : ' + error.message, 'error');
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Sauvegarder';
        }
    });
}
