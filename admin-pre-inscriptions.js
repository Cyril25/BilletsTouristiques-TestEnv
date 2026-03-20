// ============================================================
// admin-pre-inscriptions.js — Gestion des pré-inscriptions (admin)
// ============================================================

var preInscData = [];           // inscriptions_auto pour l'année sélectionnée
var preInscPaysData = [];       // inscriptions_auto_pays pour l'année sélectionnée
var preInscCurrentYear = null;  // année affichée
var preInscMembresCache = null; // cache des membres
var preInscPaysListe = [];      // liste des pays

// ============================================================
// Initialisation
// ============================================================
document.addEventListener('DOMContentLoaded', function() {
    var checkAuth = setInterval(function() {
        if (window.userRole) {
            clearInterval(checkAuth);
            preInscInit();
        }
    }, 100);
});

function preInscInit() {
    preInscPopulateYearSelect();
    // Charger membres et pays en parallèle, puis charger l'année
    Promise.all([
        preInscLoadMembres(),
        preInscLoadPays()
    ]).then(function() {
        preInscLoadYear();
    }).catch(function(err) {
        console.error('Erreur init pré-inscriptions:', err);
        preInscLoadYear();
    });
}

// ============================================================
// Chargement membres et pays
// ============================================================
function preInscLoadMembres() {
    return supabaseFetch('/rest/v1/membres?select=email,nom,prenom,rue,code_postal,ville,pays&order=nom.asc')
        .then(function(data) {
            preInscMembresCache = data || [];
        });
}

function preInscLoadPays() {
    return supabaseFetch('/rest/v1/pays?select=nom&order=nom.asc')
        .then(function(data) {
            preInscPaysListe = (data || []).map(function(p) { return p.nom; });
        });
}

// ============================================================
// Sélecteur d'année
// ============================================================
function preInscPopulateYearSelect() {
    var select = document.getElementById('preinsc-year-select');
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
function preInscLoadYear() {
    var select = document.getElementById('preinsc-year-select');
    preInscCurrentYear = parseInt(select.value);

    var container = document.getElementById('preinsc-content');
    container.innerHTML = '<p style="text-align:center; padding:40px; color:#666; font-style:italic;">Chargement des pré-inscriptions ' + preInscCurrentYear + '...</p>';

    Promise.all([
        supabaseFetch('/rest/v1/inscriptions_auto?annee=eq.' + preInscCurrentYear + '&select=*&order=membre_email.asc'),
        supabaseFetch('/rest/v1/inscriptions_auto_pays?annee=eq.' + preInscCurrentYear + '&select=*&order=membre_email.asc,pays_nom.asc')
    ])
    .then(function(results) {
        preInscData = results[0] || [];
        preInscPaysData = results[1] || [];
        preInscRender();
    })
    .catch(function(err) {
        container.innerHTML = '<p style="text-align:center; padding:40px; color:var(--color-danger);">Erreur : ' + preInscEscapeHtml(err.message || 'Erreur réseau') + '</p>';
    });
}

// ============================================================
// Rendu de la liste
// ============================================================
function preInscRender() {
    var container = document.getElementById('preinsc-content');
    var html = '';

    // Bouton ajouter + bouton dupliquer en haut
    html += '<div class="fdp-actions" style="margin-bottom:var(--spacing-md);">';
    html += '<button class="btn-admin-primary" onclick="preInscOpenForm(null)"><i class="fa-solid fa-plus"></i> Ajouter un membre</button>';
    var isLastYear = preInscCurrentYear >= new Date().getFullYear() + 1;
    html += '<button class="btn-admin-secondary" onclick="preInscDuplicateYear()"' + (isLastYear ? ' disabled title="Impossible de dupliquer au-delà de l\'année suivante"' : '') + '><i class="fa-solid fa-copy"></i> Dupliquer vers ' + (preInscCurrentYear + 1) + '</button>';
    html += '</div>';

    // Zone formulaire (cachée par défaut)
    html += '<div id="preinsc-form-container" style="display:none;"></div>';

    if (preInscData.length === 0) {
        html += '<p style="text-align:center; padding:40px; color:#666; font-style:italic;">Aucun paramétrage pour ' + preInscCurrentYear + '.</p>';
    } else {
        html += '<div class="preinsc-list">';
        for (var i = 0; i < preInscData.length; i++) {
            html += preInscRenderCard(preInscData[i]);
        }
        html += '</div>';
    }

    container.innerHTML = html;
}

function preInscRenderCard(item) {
    var membre = preInscFindMembre(item.membre_email);
    var displayName = membre ? ((membre.prenom || '') + ' ' + (membre.nom || '')).trim() || item.membre_email : item.membre_email;

    // Résumé pays étrangers
    var paysItems = preInscPaysData.filter(function(p) {
        return p.membre_email === item.membre_email && p.annee === item.annee;
    });

    var html = '<div class="preinsc-member-card">';
    html += '<div class="preinsc-card-header">';
    html += '<div class="preinsc-card-name"><i class="fa-solid fa-user"></i> ' + preInscEscapeHtml(displayName) + ' <span class="preinsc-card-email">(' + preInscEscapeHtml(item.membre_email) + ')</span></div>';
    html += '<div class="preinsc-card-actions">';
    html += '<button class="btn-admin-primary btn-sm" onclick="preInscOpenForm(\'' + preInscEscapeHtml(item.membre_email) + '\')"><i class="fa-solid fa-pen"></i> Modifier</button>';
    html += '<button class="btn-admin-danger btn-sm" onclick="preInscDelete(\'' + preInscEscapeHtml(item.membre_email) + '\')"><i class="fa-solid fa-trash"></i> Supprimer</button>';
    html += '</div>';
    html += '</div>';

    html += '<div class="preinsc-card-body">';

    // France
    if (item.france) {
        html += '<span class="preinsc-badge preinsc-badge--fr"><i class="fa-solid fa-flag"></i> FR : ' + item.nb_normaux_fr + ' norm. / ' + item.nb_variantes_fr + ' var.</span>';
    }

    // Étranger
    if (item.etranger) {
        if (paysItems.length > 0) {
            var paysNoms = paysItems.map(function(p) { return p.pays_nom; });
            html += '<span class="preinsc-badge preinsc-badge--etr"><i class="fa-solid fa-earth-europe"></i> Étr. : ' + paysNoms.join(', ') + '</span>';
        } else {
            html += '<span class="preinsc-badge preinsc-badge--etr"><i class="fa-solid fa-earth-europe"></i> Étr. : tous les pays (' + item.nb_normaux_etr_defaut + ' norm. / ' + item.nb_variantes_etr_defaut + ' var.)</span>';
        }
    }

    // Mode paiement / envoi
    html += '<span class="preinsc-badge preinsc-badge--info"><i class="fa-solid fa-credit-card"></i> ' + item.mode_paiement + '</span>';
    html += '<span class="preinsc-badge preinsc-badge--info"><i class="fa-solid fa-truck"></i> ' + item.mode_envoi + '</span>';

    html += '</div>';
    html += '</div>';

    return html;
}

// ============================================================
// Formulaire ajout/modification
// ============================================================
function preInscOpenForm(membreEmail) {
    var container = document.getElementById('preinsc-form-container');
    var isEdit = !!membreEmail;
    var existing = null;
    var existingPays = [];

    if (isEdit) {
        for (var i = 0; i < preInscData.length; i++) {
            if (preInscData[i].membre_email === membreEmail) {
                existing = preInscData[i];
                break;
            }
        }
        existingPays = preInscPaysData.filter(function(p) {
            return p.membre_email === membreEmail && p.annee === preInscCurrentYear;
        });
    }

    var html = '<div class="preinsc-form">';
    html += '<h3><i class="fa-solid fa-' + (isEdit ? 'pen' : 'plus') + '"></i> ' + (isEdit ? 'Modifier le paramétrage' : 'Ajouter un membre') + '</h3>';

    // Recherche membre (ajout seulement)
    if (!isEdit) {
        html += '<div class="preinsc-form-group">';
        html += '<label>Rechercher un membre :</label>';
        html += '<input type="text" id="preinsc-membre-search" class="admin-form-input" placeholder="Nom, prénom ou email..." oninput="preInscFilterMembres()">';
        html += '<select id="preinsc-membre-select" class="admin-form-select" size="5" style="margin-top:4px;">';
        html += '<option value="">— Sélectionner un membre —</option>';
        html += '</select>';
        html += '</div>';
    } else {
        var membreDisplay = preInscFindMembre(membreEmail);
        var label = membreDisplay ? ((membreDisplay.prenom || '') + ' ' + (membreDisplay.nom || '')).trim() + ' (' + membreEmail + ')' : membreEmail;
        html += '<div class="preinsc-form-group"><label>Membre :</label><strong>' + preInscEscapeHtml(label) + '</strong>';
        html += '<input type="hidden" id="preinsc-membre-select" value="' + preInscEscapeHtml(membreEmail) + '">';
        html += '</div>';
    }

    // Mode paiement
    html += '<div class="preinsc-form-row">';
    html += '<div class="preinsc-form-group">';
    html += '<label for="preinsc-mode-paiement">Mode de paiement :</label>';
    html += '<select id="preinsc-mode-paiement" class="admin-form-select">';
    html += '<option value="PayPal"' + (existing && existing.mode_paiement === 'PayPal' ? ' selected' : '') + '>PayPal</option>';
    html += '<option value="Chèque"' + (existing && existing.mode_paiement === 'Chèque' ? ' selected' : '') + '>Chèque</option>';
    html += '</select>';
    html += '</div>';

    // Mode envoi
    html += '<div class="preinsc-form-group">';
    html += '<label for="preinsc-mode-envoi">Mode d\'envoi :</label>';
    html += '<select id="preinsc-mode-envoi" class="admin-form-select">';
    var envois = ['Normal', 'Suivi', 'R1', 'R2', 'R3'];
    for (var e = 0; e < envois.length; e++) {
        html += '<option value="' + envois[e] + '"' + (existing && existing.mode_envoi === envois[e] ? ' selected' : '') + '>' + envois[e] + '</option>';
    }
    html += '</select>';
    html += '</div>';
    html += '</div>';

    // Section France
    var frChecked = existing ? existing.france : false;
    html += '<fieldset class="preinsc-fieldset">';
    html += '<legend><input type="checkbox" id="preinsc-france" onchange="preInscToggleSection(\'france\')"' + (frChecked ? ' checked' : '') + '> Billets français</legend>';
    html += '<div id="preinsc-france-details" style="' + (frChecked ? '' : 'display:none;') + '">';
    html += '<div class="preinsc-form-row">';
    html += '<div class="preinsc-form-group"><label>Nb normaux :</label><input type="number" id="preinsc-nb-normaux-fr" class="admin-form-input" min="0" value="' + (existing ? existing.nb_normaux_fr : 1) + '"></div>';
    html += '<div class="preinsc-form-group"><label>Nb variantes :</label><input type="number" id="preinsc-nb-variantes-fr" class="admin-form-input" min="0" value="' + (existing ? existing.nb_variantes_fr : 0) + '"></div>';
    html += '</div>';
    html += '</div>';
    html += '</fieldset>';

    // Section Étranger
    var etrChecked = existing ? existing.etranger : false;
    var hasFineSelection = existingPays.length > 0;
    html += '<fieldset class="preinsc-fieldset">';
    html += '<legend><input type="checkbox" id="preinsc-etranger" onchange="preInscToggleSection(\'etranger\')"' + (etrChecked ? ' checked' : '') + '> Billets étrangers</legend>';
    html += '<div id="preinsc-etranger-details" style="' + (etrChecked ? '' : 'display:none;') + '">';

    // Toggle global / sélection fine
    html += '<div class="preinsc-radio-group">';
    html += '<label><input type="radio" name="preinsc-etr-mode" value="global" onchange="preInscToggleEtrMode()"' + (!hasFineSelection ? ' checked' : '') + '> Tous les pays étrangers</label>';
    html += '<label><input type="radio" name="preinsc-etr-mode" value="fine" onchange="preInscToggleEtrMode()"' + (hasFineSelection ? ' checked' : '') + '> Sélection par pays</label>';
    html += '</div>';

    // Mode global
    html += '<div id="preinsc-etr-global" style="' + (!hasFineSelection ? '' : 'display:none;') + '">';
    html += '<div class="preinsc-form-row">';
    html += '<div class="preinsc-form-group"><label>Nb normaux (défaut) :</label><input type="number" id="preinsc-nb-normaux-etr-defaut" class="admin-form-input" min="0" value="' + (existing ? existing.nb_normaux_etr_defaut : 1) + '"></div>';
    html += '<div class="preinsc-form-group"><label>Nb variantes (défaut) :</label><input type="number" id="preinsc-nb-variantes-etr-defaut" class="admin-form-input" min="0" value="' + (existing ? existing.nb_variantes_etr_defaut : 0) + '"></div>';
    html += '</div>';
    html += '</div>';

    // Mode sélection fine par pays
    html += '<div id="preinsc-etr-fine" style="' + (hasFineSelection ? '' : 'display:none;') + '">';
    html += '<div class="preinsc-country-grid">';
    for (var p = 0; p < preInscPaysListe.length; p++) {
        var paysNom = preInscPaysListe[p];
        var paysExisting = null;
        for (var ep = 0; ep < existingPays.length; ep++) {
            if (existingPays[ep].pays_nom === paysNom) {
                paysExisting = existingPays[ep];
                break;
            }
        }
        var pChecked = !!paysExisting;
        html += '<div class="preinsc-country-item">';
        html += '<label><input type="checkbox" class="preinsc-pays-cb" data-pays="' + preInscEscapeHtml(paysNom) + '" onchange="preInscTogglePays(this)"' + (pChecked ? ' checked' : '') + '> ' + preInscEscapeHtml(paysNom) + '</label>';
        html += '<div class="preinsc-pays-qte" style="' + (pChecked ? '' : 'display:none;') + '">';
        html += '<input type="number" class="admin-form-input preinsc-pays-normaux" data-pays="' + preInscEscapeHtml(paysNom) + '" min="0" value="' + (paysExisting ? paysExisting.nb_normaux : 1) + '" placeholder="Norm.">';
        html += '<input type="number" class="admin-form-input preinsc-pays-variantes" data-pays="' + preInscEscapeHtml(paysNom) + '" min="0" value="' + (paysExisting ? paysExisting.nb_variantes : 0) + '" placeholder="Var.">';
        html += '</div>';
        html += '</div>';
    }
    html += '</div>';
    html += '</div>';

    html += '</div>';
    html += '</fieldset>';

    // Boutons
    html += '<div class="fdp-actions">';
    html += '<button class="btn-admin-primary" onclick="preInscSave()"><i class="fa-solid fa-floppy-disk"></i> Sauvegarder</button>';
    html += '<button class="btn-admin-secondary" onclick="preInscCancelForm()"><i class="fa-solid fa-xmark"></i> Annuler</button>';
    html += '</div>';

    html += '</div>';

    container.innerHTML = html;
    container.style.display = '';
    container.scrollIntoView({ behavior: 'smooth' });

    // Si ajout, remplir la liste des membres
    if (!isEdit) {
        preInscFilterMembres();
    }
}

function preInscToggleSection(section) {
    var cb = document.getElementById('preinsc-' + section);
    var details = document.getElementById('preinsc-' + section + '-details');
    if (cb && details) {
        details.style.display = cb.checked ? '' : 'none';
    }
}

function preInscToggleEtrMode() {
    var radios = document.getElementsByName('preinsc-etr-mode');
    var mode = 'global';
    for (var i = 0; i < radios.length; i++) {
        if (radios[i].checked) { mode = radios[i].value; break; }
    }
    var globalDiv = document.getElementById('preinsc-etr-global');
    var fineDiv = document.getElementById('preinsc-etr-fine');
    if (globalDiv) globalDiv.style.display = mode === 'global' ? '' : 'none';
    if (fineDiv) fineDiv.style.display = mode === 'fine' ? '' : 'none';
}

function preInscTogglePays(cb) {
    var paysNom = cb.getAttribute('data-pays');
    var qteDiv = cb.parentElement.nextElementSibling;
    if (qteDiv) {
        qteDiv.style.display = cb.checked ? '' : 'none';
    }
}

function preInscFilterMembres() {
    var searchInput = document.getElementById('preinsc-membre-search');
    var selectEl = document.getElementById('preinsc-membre-select');
    if (!searchInput || !selectEl || !preInscMembresCache) return;

    var terme = searchInput.value.toLowerCase().trim();

    // Exclure les membres déjà paramétrés pour cette année
    var emailsParametres = {};
    for (var i = 0; i < preInscData.length; i++) {
        emailsParametres[preInscData[i].membre_email] = true;
    }

    var html = '<option value="">— Sélectionner un membre —</option>';
    for (var j = 0; j < preInscMembresCache.length; j++) {
        var m = preInscMembresCache[j];
        if (emailsParametres[m.email]) continue;
        var label = ((m.prenom || '') + ' ' + (m.nom || '')).trim() || m.email;
        var searchable = (label + ' ' + m.email).toLowerCase();
        if (terme && searchable.indexOf(terme) === -1) continue;
        html += '<option value="' + preInscEscapeHtml(m.email) + '">' + preInscEscapeHtml(label) + ' (' + preInscEscapeHtml(m.email) + ')</option>';
    }
    selectEl.innerHTML = html;
}

function preInscCancelForm() {
    var container = document.getElementById('preinsc-form-container');
    if (container) {
        container.style.display = 'none';
        container.innerHTML = '';
    }
}

// ============================================================
// Sauvegarde
// ============================================================
function preInscSave() {
    // Récupérer l'email du membre
    var selectEl = document.getElementById('preinsc-membre-select');
    var membreEmail = selectEl ? selectEl.value : '';
    if (!membreEmail) {
        preInscShowNotification('Veuillez sélectionner un membre.', 'error');
        return;
    }

    var france = document.getElementById('preinsc-france').checked;
    var etranger = document.getElementById('preinsc-etranger').checked;

    if (!france && !etranger) {
        preInscShowNotification('Cochez au moins une option (France ou Étranger).', 'error');
        return;
    }

    var nbNormauxFr = france ? (parseInt(document.getElementById('preinsc-nb-normaux-fr').value) || 0) : 0;
    var nbVariantesFr = france ? (parseInt(document.getElementById('preinsc-nb-variantes-fr').value) || 0) : 0;

    var nbNormauxEtrDefaut = etranger ? (parseInt(document.getElementById('preinsc-nb-normaux-etr-defaut').value) || 1) : 0;
    var nbVariantesEtrDefaut = etranger ? (parseInt(document.getElementById('preinsc-nb-variantes-etr-defaut').value) || 0) : 0;

    var modePaiement = document.getElementById('preinsc-mode-paiement').value;
    var modeEnvoi = document.getElementById('preinsc-mode-envoi').value;

    // Déterminer mode étranger (global ou fine)
    var etrMode = 'global';
    var radios = document.getElementsByName('preinsc-etr-mode');
    for (var i = 0; i < radios.length; i++) {
        if (radios[i].checked) { etrMode = radios[i].value; break; }
    }

    // Collecter les pays sélectionnés (mode fine)
    var paysSelections = [];
    if (etranger && etrMode === 'fine') {
        var checkboxes = document.querySelectorAll('.preinsc-pays-cb:checked');
        var allNormaux = document.querySelectorAll('.preinsc-pays-normaux');
        var allVariantes = document.querySelectorAll('.preinsc-pays-variantes');
        for (var c = 0; c < checkboxes.length; c++) {
            var paysNom = checkboxes[c].getAttribute('data-pays');
            var normaux = 1;
            var variantes = 0;
            for (var ni = 0; ni < allNormaux.length; ni++) {
                if (allNormaux[ni].getAttribute('data-pays') === paysNom) {
                    normaux = parseInt(allNormaux[ni].value) || 1;
                    break;
                }
            }
            for (var vi = 0; vi < allVariantes.length; vi++) {
                if (allVariantes[vi].getAttribute('data-pays') === paysNom) {
                    variantes = parseInt(allVariantes[vi].value) || 0;
                    break;
                }
            }
            paysSelections.push({
                membre_email: membreEmail,
                annee: preInscCurrentYear,
                pays_nom: paysNom,
                nb_normaux: normaux,
                nb_variantes: variantes
            });
        }
    }

    // Objet principal
    var mainRecord = {
        membre_email: membreEmail,
        annee: preInscCurrentYear,
        france: france,
        nb_normaux_fr: nbNormauxFr,
        nb_variantes_fr: nbVariantesFr,
        etranger: etranger,
        nb_normaux_etr_defaut: nbNormauxEtrDefaut,
        nb_variantes_etr_defaut: nbVariantesEtrDefaut,
        mode_paiement: modePaiement,
        mode_envoi: modeEnvoi
    };

    // DELETE + INSERT pattern (comme fdp)
    // 1. Supprimer les anciennes lignes pays pour ce membre+année
    supabaseFetch('/rest/v1/inscriptions_auto_pays?membre_email=eq.' + encodeURIComponent(membreEmail) + '&annee=eq.' + preInscCurrentYear, {
        method: 'DELETE'
    })
    .then(function() {
        // 2. Supprimer l'ancienne ligne principale
        return supabaseFetch('/rest/v1/inscriptions_auto?membre_email=eq.' + encodeURIComponent(membreEmail) + '&annee=eq.' + preInscCurrentYear, {
            method: 'DELETE'
        });
    })
    .then(function() {
        // 3. Insérer la ligne principale
        return supabaseFetch('/rest/v1/inscriptions_auto', {
            method: 'POST',
            body: JSON.stringify(mainRecord),
            headers: { 'Prefer': 'return=minimal' }
        });
    })
    .then(function() {
        // 4. Insérer les lignes pays (si mode fine)
        if (paysSelections.length > 0) {
            return supabaseFetch('/rest/v1/inscriptions_auto_pays', {
                method: 'POST',
                body: JSON.stringify(paysSelections),
                headers: { 'Prefer': 'return=minimal' }
            });
        }
    })
    .then(function() {
        preInscShowNotification('Paramétrage sauvegardé avec succès !', 'success');
        preInscCancelForm();
        preInscLoadYear();
    })
    .catch(function(err) {
        preInscShowNotification('Erreur : ' + (err.message || 'Erreur réseau'), 'error');
    });
}

// ============================================================
// Suppression
// ============================================================
function preInscDelete(membreEmail) {
    var membre = preInscFindMembre(membreEmail);
    var displayName = membre ? ((membre.prenom || '') + ' ' + (membre.nom || '')).trim() || membreEmail : membreEmail;

    if (!confirm('Supprimer le paramétrage de ' + displayName + ' pour ' + preInscCurrentYear + ' ?\n\nLes inscriptions déjà créées ne seront pas supprimées.')) {
        return;
    }

    // Supprimer pays puis principal
    supabaseFetch('/rest/v1/inscriptions_auto_pays?membre_email=eq.' + encodeURIComponent(membreEmail) + '&annee=eq.' + preInscCurrentYear, {
        method: 'DELETE'
    })
    .then(function() {
        return supabaseFetch('/rest/v1/inscriptions_auto?membre_email=eq.' + encodeURIComponent(membreEmail) + '&annee=eq.' + preInscCurrentYear, {
            method: 'DELETE'
        });
    })
    .then(function() {
        preInscShowNotification('Paramétrage supprimé.', 'success');
        preInscLoadYear();
    })
    .catch(function(err) {
        preInscShowNotification('Erreur : ' + (err.message || 'Erreur réseau'), 'error');
    });
}

// ============================================================
// Duplication vers l'année suivante
// ============================================================
function preInscDuplicateYear() {
    var targetYear = preInscCurrentYear + 1;

    if (!confirm('Dupliquer les paramétrages ' + preInscCurrentYear + ' vers ' + targetYear + ' ?\n\nLes paramétrages existants pour ' + targetYear + ' seront remplacés.')) {
        return;
    }

    if (preInscData.length === 0) {
        preInscShowNotification('Aucun paramétrage à dupliquer pour ' + preInscCurrentYear + '.', 'error');
        return;
    }

    // Préparer les données dupliquées (depuis le cache mémoire)
    var newMainRecords = preInscData.map(function(item) {
        return {
            membre_email: item.membre_email,
            annee: targetYear,
            france: item.france,
            nb_normaux_fr: item.nb_normaux_fr,
            nb_variantes_fr: item.nb_variantes_fr,
            etranger: item.etranger,
            nb_normaux_etr_defaut: item.nb_normaux_etr_defaut,
            nb_variantes_etr_defaut: item.nb_variantes_etr_defaut,
            mode_paiement: item.mode_paiement,
            mode_envoi: item.mode_envoi
        };
    });

    var newPaysRecords = preInscPaysData.map(function(item) {
        return {
            membre_email: item.membre_email,
            annee: targetYear,
            pays_nom: item.pays_nom,
            nb_normaux: item.nb_normaux,
            nb_variantes: item.nb_variantes
        };
    });

    // DELETE année cible dans les 2 tables, puis INSERT
    supabaseFetch('/rest/v1/inscriptions_auto_pays?annee=eq.' + targetYear, {
        method: 'DELETE'
    })
    .then(function() {
        return supabaseFetch('/rest/v1/inscriptions_auto?annee=eq.' + targetYear, {
            method: 'DELETE'
        });
    })
    .then(function() {
        return supabaseFetch('/rest/v1/inscriptions_auto', {
            method: 'POST',
            body: JSON.stringify(newMainRecords),
            headers: { 'Prefer': 'return=minimal' }
        });
    })
    .then(function() {
        if (newPaysRecords.length > 0) {
            return supabaseFetch('/rest/v1/inscriptions_auto_pays', {
                method: 'POST',
                body: JSON.stringify(newPaysRecords),
                headers: { 'Prefer': 'return=minimal' }
            });
        }
    })
    .then(function() {
        preInscShowNotification('Paramétrages dupliqués vers ' + targetYear + ' avec succès !', 'success');
        // Basculer sur l'année cible
        var select = document.getElementById('preinsc-year-select');
        select.value = targetYear;
        preInscLoadYear();
    })
    .catch(function(err) {
        preInscShowNotification('Erreur : ' + (err.message || 'Erreur réseau'), 'error');
    });
}

// ============================================================
// Utilitaires
// ============================================================
function preInscFindMembre(email) {
    if (!preInscMembresCache) return null;
    for (var i = 0; i < preInscMembresCache.length; i++) {
        if (preInscMembresCache[i].email === email) return preInscMembresCache[i];
    }
    return null;
}

function preInscEscapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function preInscShowNotification(message, type) {
    var old = document.querySelector('.preinsc-notification');
    if (old) old.remove();

    var div = document.createElement('div');
    div.className = 'preinsc-notification preinsc-notification--' + type;
    var icon = document.createElement('i');
    icon.className = 'fa-solid ' + (type === 'success' ? 'fa-circle-check' : 'fa-circle-exclamation');
    div.appendChild(icon);
    div.appendChild(document.createTextNode(' ' + message));
    document.getElementById('preinsc-content').prepend(div);

    setTimeout(function() { div.remove(); }, 5000);
}
