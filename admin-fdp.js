// ============================================================
// admin-fdp.js — Gestion des frais de port (admin)
// ============================================================

var fdpData = [];          // données chargées pour l'année sélectionnée
var fdpCurrentYear = null;  // année affichée

// Tranches de quantités (identiques France et International)
var FDP_TRANCHES = [
    { qte_min: 1,   qte_max: 10,  poids: 20,  label: '1 à 10 billets (20g)' },
    { qte_min: 11,  qte_max: 25,  poids: 50,  label: '11 à 25 billets (50g)' },
    { qte_min: 26,  qte_max: 50,  poids: 100, label: '26 à 50 billets (100g)' },
    { qte_min: 51,  qte_max: 100, poids: 250, label: '51 à 100 billets (250g)' },
    { qte_min: 101, qte_max: 200, poids: 500, label: '101 à 200 billets (500g)' }
];

var FDP_TYPES_FRANCE = ['normal', 'suivi', 'r1', 'r2', 'r3'];
var FDP_TYPES_INTERNATIONAL = ['normal', 'r1', 'r2'];

var FDP_TYPE_LABELS = {
    'normal': 'Normal',
    'suivi': 'Suivi',
    'r1': 'Recommandé R1',
    'r2': 'Recommandé R2',
    'r3': 'Recommandé R3'
};

// ============================================================
// Initialisation
// ============================================================
document.addEventListener('DOMContentLoaded', function() {
    // Attendre que l'auth soit prête (global.js gère l'affichage)
    var checkAuth = setInterval(function() {
        if (window.userRole) {
            clearInterval(checkAuth);
            fdpInit();
        }
    }, 100);
});

function fdpInit() {
    fdpPopulateYearSelect();
    fdpLoadYear();
}

// ============================================================
// Sélecteur d'année
// ============================================================
function fdpPopulateYearSelect() {
    var select = document.getElementById('fdp-year-select');
    var currentYear = new Date().getFullYear();
    var nextYear = currentYear + 1;

    select.innerHTML = '';

    var optCurrent = document.createElement('option');
    optCurrent.value = currentYear;
    optCurrent.textContent = currentYear;
    select.appendChild(optCurrent);

    var optNext = document.createElement('option');
    optNext.value = nextYear;
    optNext.textContent = nextYear;
    select.appendChild(optNext);
}

// ============================================================
// Chargement des données
// ============================================================
function fdpLoadYear() {
    var select = document.getElementById('fdp-year-select');
    fdpCurrentYear = parseInt(select.value);

    var container = document.getElementById('fdp-content');
    container.innerHTML = '<p style="text-align:center; padding:40px; color:#666; font-style:italic;">Chargement des tarifs ' + fdpCurrentYear + '...</p>';

    supabaseFetch('/rest/v1/frais_port?annee=eq.' + fdpCurrentYear + '&select=*&order=destination,qte_min,type_envoi')
        .then(function(data) {
            fdpData = data || [];
            fdpRender();
        })
        .catch(function(err) {
            var errDiv = document.createElement('p');
            errDiv.style.cssText = 'text-align:center; padding:40px; color:#CC4444;';
            errDiv.textContent = 'Erreur : ' + (err.message || 'Erreur réseau');
            container.innerHTML = '';
            container.appendChild(errDiv);
        });
}

// ============================================================
// Rendu des tableaux éditables
// ============================================================
function fdpRender() {
    var container = document.getElementById('fdp-content');
    var html = '';

    // --- France ---
    html += '<h2><i class="fa-solid fa-location-dot"></i> Envois en France Métropolitaine — ' + fdpCurrentYear + '</h2>';
    html += fdpBuildTable('france', FDP_TYPES_FRANCE);

    html += '<hr style="border:0; border-top:1px solid #eee; margin:40px 0;">';

    // --- International ---
    html += '<h2><i class="fa-solid fa-earth-europe"></i> Envois à l\'Étranger — ' + fdpCurrentYear + '</h2>';
    html += fdpBuildTable('international', FDP_TYPES_INTERNATIONAL);

    // --- Boutons ---
    html += '<div class="fdp-actions">';
    html += '<button class="btn-admin-primary" onclick="fdpSave()"><i class="fa-solid fa-floppy-disk"></i> Enregistrer les modifications</button>';
    html += '<button class="btn-admin-secondary" onclick="fdpDuplicateYear()"><i class="fa-solid fa-copy"></i> Dupliquer vers ' + (fdpCurrentYear + 1) + '</button>';
    html += '</div>';

    container.innerHTML = html;
}

function fdpBuildTable(destination, types) {
    var html = '<div class="rates-table-container">';
    html += '<table class="rates-table fdp-edit-table">';

    // En-tête
    html += '<thead><tr><th>Poids / Quantité</th>';
    for (var t = 0; t < types.length; t++) {
        html += '<th>' + FDP_TYPE_LABELS[types[t]] + '</th>';
    }
    html += '</tr></thead>';

    // Corps
    html += '<tbody>';
    for (var i = 0; i < FDP_TRANCHES.length; i++) {
        var tr = FDP_TRANCHES[i];
        html += '<tr>';
        html += '<td class="fdp-label-cell">' + tr.label + '</td>';

        for (var t = 0; t < types.length; t++) {
            var type = types[t];
            var prix = fdpGetPrice(destination, tr.qte_min, tr.qte_max, type);
            var inputId = 'fdp-' + destination + '-' + tr.qte_min + '-' + tr.qte_max + '-' + type;
            html += '<td>';
            html += '<input type="number" step="0.01" min="0" class="fdp-price-input" ';
            html += 'id="' + inputId + '" ';
            html += 'data-destination="' + destination + '" ';
            html += 'data-qte-min="' + tr.qte_min + '" ';
            html += 'data-qte-max="' + tr.qte_max + '" ';
            html += 'data-poids="' + tr.poids + '" ';
            html += 'data-type="' + type + '" ';
            html += 'value="' + (prix !== null ? prix : '') + '">';
            html += '</td>';
        }
        html += '</tr>';
    }
    html += '</tbody></table></div>';
    return html;
}

function fdpGetPrice(destination, qteMin, qteMax, type) {
    for (var i = 0; i < fdpData.length; i++) {
        var r = fdpData[i];
        if (r.destination === destination && r.qte_min === qteMin && r.qte_max === qteMax && r.type_envoi === type) {
            return r.prix;
        }
    }
    return null;
}

// ============================================================
// Sauvegarde
// ============================================================
function fdpSave() {
    var inputs = document.querySelectorAll('.fdp-price-input');
    var upserts = [];

    for (var i = 0; i < inputs.length; i++) {
        var input = inputs[i];
        var val = input.value.trim();
        if (val === '') continue;

        var prix = parseFloat(val);
        if (isNaN(prix) || prix < 0) {
            alert('Prix invalide : ' + val);
            input.focus();
            return;
        }

        upserts.push({
            annee: fdpCurrentYear,
            destination: input.getAttribute('data-destination'),
            qte_min: parseInt(input.getAttribute('data-qte-min')),
            qte_max: parseInt(input.getAttribute('data-qte-max')),
            poids_grammes: parseInt(input.getAttribute('data-poids')),
            type_envoi: input.getAttribute('data-type'),
            prix: prix
        });
    }

    if (upserts.length === 0) {
        alert('Aucun tarif à enregistrer.');
        return;
    }

    // Supprimer les anciens tarifs de cette année puis insérer les nouveaux
    supabaseFetch('/rest/v1/frais_port?annee=eq.' + fdpCurrentYear, {
        method: 'DELETE'
    })
    .then(function() {
        return supabaseFetch('/rest/v1/frais_port', {
            method: 'POST',
            body: JSON.stringify(upserts),
            headers: { 'Prefer': 'return=minimal' }
        });
    })
    .then(function() {
        fdpShowNotification('Tarifs ' + fdpCurrentYear + ' enregistrés avec succès !', 'success');
        fdpLoadYear();
    })
    .catch(function(err) {
        fdpShowNotification('Erreur : ' + err.message, 'error');
    });
}

// ============================================================
// Duplication vers l'année suivante
// ============================================================
function fdpDuplicateYear() {
    var targetYear = fdpCurrentYear + 1;

    if (!confirm('Dupliquer les tarifs ' + fdpCurrentYear + ' vers ' + targetYear + ' ?\n\nLes tarifs existants pour ' + targetYear + ' seront remplacés.')) {
        return;
    }

    // Collecter les données actuelles depuis les inputs
    var inputs = document.querySelectorAll('.fdp-price-input');
    var upserts = [];

    for (var i = 0; i < inputs.length; i++) {
        var input = inputs[i];
        var val = input.value.trim();
        if (val === '') continue;

        var prix = parseFloat(val);
        if (isNaN(prix) || prix < 0) continue;

        upserts.push({
            annee: targetYear,
            destination: input.getAttribute('data-destination'),
            qte_min: parseInt(input.getAttribute('data-qte-min')),
            qte_max: parseInt(input.getAttribute('data-qte-max')),
            poids_grammes: parseInt(input.getAttribute('data-poids')),
            type_envoi: input.getAttribute('data-type'),
            prix: prix
        });
    }

    if (upserts.length === 0) {
        alert('Aucun tarif à dupliquer.');
        return;
    }

    // Supprimer les tarifs existants de l'année cible puis insérer
    supabaseFetch('/rest/v1/frais_port?annee=eq.' + targetYear, {
        method: 'DELETE'
    })
    .then(function() {
        return supabaseFetch('/rest/v1/frais_port', {
            method: 'POST',
            body: JSON.stringify(upserts),
            headers: { 'Prefer': 'return=minimal' }
        });
    })
    .then(function() {
        fdpShowNotification('Tarifs dupliqués vers ' + targetYear + ' avec succès !', 'success');
        // Basculer sur l'année cible
        var select = document.getElementById('fdp-year-select');
        select.value = targetYear;
        fdpLoadYear();
    })
    .catch(function(err) {
        fdpShowNotification('Erreur : ' + err.message, 'error');
    });
}

// ============================================================
// Notification
// ============================================================
function fdpShowNotification(message, type) {
    // Retirer l'ancienne notification si elle existe
    var old = document.querySelector('.fdp-notification');
    if (old) old.remove();

    var div = document.createElement('div');
    div.className = 'fdp-notification fdp-notification--' + type;
    var icon = document.createElement('i');
    icon.className = 'fa-solid ' + (type === 'success' ? 'fa-circle-check' : 'fa-circle-exclamation');
    div.appendChild(icon);
    div.appendChild(document.createTextNode(' ' + message));
    document.getElementById('fdp-content').prepend(div);

    setTimeout(function() { div.remove(); }, 5000);
}
