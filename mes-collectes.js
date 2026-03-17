// ============================================================
// mes-collectes.js — BilletsTouristiques Module collecteur
// Story 5.5
// ============================================================

// SEC-03 — Fonctions d'echappement pour empecher les XSS
function escapeHtmlMC(text) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(text));
    return div.innerHTML;
}
function escapeAttrMC(text) {
    return String(text).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

var monCollecteur = null;
var mesBillets = [];
var currentBilletId = null;
var currentBillet = null;
var currentInscriptions = [];

// ============================================================
// 1. TOAST NOTIFICATIONS
// ============================================================
function showToast(message, type) {
    type = type || 'success';
    var toast = document.createElement('div');
    toast.className = 'toast toast-' + type;
    toast.textContent = message;
    document.body.appendChild(toast);
    if (type === 'error') {
        toast.onclick = function() { toast.remove(); };
    } else {
        setTimeout(function() { if (toast.parentNode) toast.remove(); }, 4000);
    }
}

// ============================================================
// 2. INITIALISATION
// ============================================================
if (typeof firebase !== 'undefined') {
    firebase.auth().onAuthStateChanged(function(user) {
        if (user) {
            checkCollecteur();
        }
    });
}

// ============================================================
// 3. VERIFICATION COLLECTEUR (Task 3)
// ============================================================
function checkCollecteur() {
    var email = firebase.auth().currentUser.email;
    supabaseFetch('/rest/v1/collecteurs?email_membre=eq.' + encodeURIComponent(email) + '&select=*')
        .then(function(data) {
            if (!data || data.length === 0) {
                document.getElementById('collecteur-check').innerHTML =
                    '<p class="collecteur-not-found"><i class="fa-solid fa-circle-exclamation"></i> Vous n\'êtes pas enregistré comme collecteur.</p>';
                return;
            }
            monCollecteur = data[0];
            loadMesCollectes();
        })
        .catch(function(error) {
            console.error('Erreur vérification collecteur:', error);
            showToast('Erreur lors de la vérification collecteur', 'error');
        });
}

// ============================================================
// 4. CHARGEMENT LISTE DES COLLECTES (Task 4)
// ============================================================
var mesInscriptionsParBillet = {};

function loadMesCollectes() {
    supabaseFetch('/rest/v1/billets?select=id,"NomBillet","Ville","Categorie","Collecteur","Prix","PrixVariante","DateColl","DateFin","HasVariante","VersionNormaleExiste","Date","Reference","Millesime","Version",attenuee,"PayerFDP"&"Collecteur"=eq.' + encodeURIComponent(monCollecteur.alias) + '&order="Date".desc.nullslast')
        .then(function(billets) {
            mesBillets = billets || [];
            if (mesBillets.length === 0) {
                renderCollectesList();
                return;
            }
            // Charger toutes les inscriptions du collecteur pour les compteurs
            var billetIds = [];
            for (var i = 0; i < mesBillets.length; i++) {
                billetIds.push(mesBillets[i].id);
            }
            return supabaseFetch('/rest/v1/inscriptions?billet_id=in.(' + billetIds.join(',') + ')&pas_interesse=eq.false&select=billet_id,statut_paiement,envoye');
        })
        .then(function(inscriptions) {
            mesInscriptionsParBillet = {};
            if (inscriptions) {
                for (var i = 0; i < inscriptions.length; i++) {
                    var ins = inscriptions[i];
                    if (!mesInscriptionsParBillet[ins.billet_id]) {
                        mesInscriptionsParBillet[ins.billet_id] = { total: 0, confirmes: 0, envoyes: 0 };
                    }
                    mesInscriptionsParBillet[ins.billet_id].total++;
                    if (ins.statut_paiement === 'confirme') mesInscriptionsParBillet[ins.billet_id].confirmes++;
                    if (ins.envoye) mesInscriptionsParBillet[ins.billet_id].envoyes++;
                }
            }
            renderCollectesList();
        })
        .catch(function(error) {
            console.error('Erreur chargement collectes:', error);
            showToast('Erreur lors du chargement des collectes', 'error');
        });
}

function renderCollectesList() {
    var container = document.getElementById('collectes-list');
    if (!container) return;

    // Hide detail view, show list
    var detailDiv = document.getElementById('collecte-detail');
    if (detailDiv) detailDiv.style.display = 'none';
    container.style.display = '';

    if (mesBillets.length === 0) {
        container.innerHTML = '<p class="collectes-empty"><i class="fa-solid fa-inbox"></i> Aucune collecte assignée.</p>';
        return;
    }

    var html = '<div class="collectes-cards">';
    for (var i = 0; i < mesBillets.length; i++) {
        var b = mesBillets[i];
        var isOpen = b.Categorie === 'Collecte' || b.Categorie === 'Pré collecte';
        var statusClass = isOpen ? 'collecte-status-open' : 'collecte-status-closed';
        var statusLabel = isOpen ? 'En cours' : (b.Categorie || 'Terminé');

        // Construire le préfixe "Référence - Année-Version"
        var refParts = [];
        if (b.Reference) refParts.push(b.Reference);
        var milVersion = '';
        if (b.Millesime) milVersion += b.Millesime;
        if (b.Version) milVersion += '-' + b.Version;
        if (milVersion) refParts.push(milVersion);
        var refPrefix = refParts.length > 0 ? refParts.join(' - ') : '';

        var attenuee = b.attenuee === true;
        html += '<div class="collecte-card' + (attenuee ? ' collecte-card-attenuee' : '') + '" onclick="openCollecteDetail(' + b.id + ')">';
        html += '<div class="collecte-card-header">';
        if (refPrefix) html += '<span class="collecte-ref">' + escapeHtmlMC(refPrefix) + '</span>';
        html += '<h3>' + escapeHtmlMC(b.NomBillet || '') + '</h3>';
        html += '<span class="collecte-status ' + statusClass + '">' + escapeHtmlMC(statusLabel) + '</span>';
        html += '</div>';
        var bVne = b.VersionNormaleExiste !== false;
        var bVarActive = b.HasVariante && b.HasVariante !== 'N';
        var bPrixVar = (b.PrixVariante !== null && b.PrixVariante !== undefined && b.PrixVariante !== '') ? parseFloat(b.PrixVariante) : null;

        html += '<div class="collecte-card-info">';
        if (bVne && b.Prix) {
            html += '<span><i class="fa-solid fa-euro-sign"></i> ' + b.Prix + (bVarActive && bPrixVar !== null ? ' / ' + bPrixVar + ' (var.)' : '') + '</span>';
        } else if (!bVne && bVarActive && bPrixVar !== null) {
            html += '<span><i class="fa-solid fa-euro-sign"></i> ' + bPrixVar + ' (var.)</span>';
        } else if (b.Prix) {
            html += '<span><i class="fa-solid fa-euro-sign"></i> ' + b.Prix + '</span>';
        }
        if (b.DateColl) html += '<span><i class="fa-solid fa-calendar"></i> ' + b.DateColl + '</span>';
        html += '</div>';

        // Indicateurs payé / envoyé
        var stats = mesInscriptionsParBillet[b.id] || { total: 0, confirmes: 0, envoyes: 0 };
        if (stats.total > 0) {
            var allConfirmes = stats.confirmes === stats.total;
            var allEnvoyes = stats.envoyes === stats.total;
            html += '<div class="collecte-card-indicators">';
            html += '<span class="indicator ' + (allConfirmes ? 'indicator-ok' : 'indicator-pending') + '"><i class="fa-solid fa-' + (allConfirmes ? 'check-circle' : 'clock') + '"></i> ' + stats.confirmes + '/' + stats.total + ' payés</span>';
            html += '<span class="indicator ' + (allEnvoyes ? 'indicator-ok' : 'indicator-pending') + '"><i class="fa-solid fa-' + (allEnvoyes ? 'check-circle' : 'clock') + '"></i> ' + stats.envoyes + '/' + stats.total + ' envoyés</span>';
            html += '</div>';
        } else {
            html += '<div class="collecte-card-indicators"><span class="indicator indicator-none">Aucun inscrit</span></div>';
        }

        html += '<button class="btn-attenuee' + (attenuee ? ' btn-attenuee-active' : '') + '" onclick="event.stopPropagation(); toggleAttenuee(' + b.id + ', ' + !attenuee + ')" title="' + (attenuee ? 'Rendre visible' : 'Atténuer cette collecte') + '"><i class="fa-solid fa-eye' + (attenuee ? '-slash' : '') + '"></i></button>';
        html += '<div class="collecte-card-action"><i class="fa-solid fa-chevron-right"></i></div>';
        html += '</div>';
    }
    html += '</div>';
    container.innerHTML = html;
}

// ============================================================
// 5. VUE DETAILLEE D'UNE COLLECTE (Task 5)
// ============================================================
function openCollecteDetail(billetId) {
    currentBilletId = billetId;

    // Find the billet in mesBillets
    currentBillet = null;
    for (var i = 0; i < mesBillets.length; i++) {
        if (mesBillets[i].id === billetId) {
            currentBillet = mesBillets[i];
            break;
        }
    }

    supabaseFetch('/rest/v1/inscriptions?billet_id=eq.' + billetId + '&pas_interesse=eq.false&select=*&order=date_inscription.asc')
        .then(function(inscriptions) {
            currentInscriptions = inscriptions || [];
            // Enrichir les snapshots avec les noms actuels des membres
            var emails = [];
            currentInscriptions.forEach(function(ins) {
                if (ins.membre_email && emails.indexOf(ins.membre_email) === -1) emails.push(ins.membre_email);
            });
            if (emails.length === 0) {
                renderCollecteDetail(billetId, currentInscriptions);
                return;
            }
            var emailFilter = emails.map(function(e) { return encodeURIComponent(e); }).join(',');
            return supabaseFetch('/rest/v1/membres?email=in.(' + emailFilter + ')&select=email,nom,prenom')
                .then(function(membres) {
                    var membresMap = {};
                    if (membres) {
                        membres.forEach(function(m) { membresMap[m.email] = m; });
                    }
                    currentInscriptions.forEach(function(ins) {
                        var membre = membresMap[ins.membre_email];
                        if (membre && ins.adresse_snapshot) {
                            if (!ins.adresse_snapshot.nom && membre.nom) ins.adresse_snapshot.nom = membre.nom;
                            if (!ins.adresse_snapshot.prenom && membre.prenom) ins.adresse_snapshot.prenom = membre.prenom;
                        }
                    });
                    renderCollecteDetail(billetId, currentInscriptions);
                });
        })
        .catch(function(error) {
            console.error('Erreur chargement inscrits:', error);
            showToast('Erreur lors du chargement des inscrits', 'error');
        });
}

function renderCollecteDetail(billetId, inscriptions) {
    var container = document.getElementById('collecte-detail');
    var listDiv = document.getElementById('collectes-list');
    if (!container) return;

    // Hide list, show detail
    if (listDiv) listDiv.style.display = 'none';
    container.style.display = '';

    var billet = currentBillet;
    var isOpen = billet && (billet.Categorie === 'Collecte' || billet.Categorie === 'Pré collecte');
    var prix = parseFloat((billet && billet.Prix) || 0);
    var prixVariante = (billet && billet.PrixVariante !== null && billet.PrixVariante !== undefined && billet.PrixVariante !== '') ? parseFloat(billet.PrixVariante) : prix;

    // Compute counters
    var totalInscrits = inscriptions.length;
    var totalConfirmes = 0;
    var totalNormaux = 0;
    var totalVariantes = 0;
    for (var i = 0; i < inscriptions.length; i++) {
        if (inscriptions[i].statut_paiement === 'confirme') totalConfirmes++;
        totalNormaux += (inscriptions[i].nb_normaux || 0);
        totalVariantes += (inscriptions[i].nb_variantes || 0);
    }
    var progressPct = totalInscrits > 0 ? Math.round((totalConfirmes / totalInscrits) * 100) : 0;

    var html = '';

    // Back button
    html += '<button class="btn-retour-liste" onclick="retourListe()"><i class="fa-solid fa-arrow-left"></i> Retour à la liste</button>';

    // Header
    html += '<div class="collecte-detail-header">';
    html += '<h2>' + escapeHtmlMC((billet && billet.NomBillet) || '') + '</h2>';
    if (billet && billet.Ville) html += '<span class="collecte-detail-ville"><i class="fa-solid fa-location-dot"></i> ' + escapeHtmlMC(billet.Ville) + '</span>';
    html += '</div>';

    // Counters
    html += '<div class="collecte-compteurs">';
    html += '<div class="compteur-item">';
    html += '<span class="compteur-label">Paiements</span>';
    html += '<span class="compteur-value">' + totalConfirmes + '/' + totalInscrits + ' payés</span>';
    html += '<div class="progress-bar"><div class="progress-fill" style="width:' + progressPct + '%"></div></div>';
    html += '</div>';
    html += '<div class="compteur-item">';
    html += '<span class="compteur-label">Billets</span>';
    var vne = billet && billet.VersionNormaleExiste !== false;
    html += '<span class="compteur-value">' + (vne ? totalNormaux + ' normaux, ' : '') + totalVariantes + ' variantes' + '</span>';
    html += '</div>';
    html += '</div>';

    // Actions bar: close button + relance button
    var isClotured = !isOpen;
    var impayes = inscriptions.filter(function(i) { return i.statut_paiement !== 'confirme'; });

    html += '<div class="collecte-actions-bar">';
    if (isOpen) {
        html += '<button class="btn-cloturer" onclick="cloturerCollecte(' + billetId + ')"><i class="fa-solid fa-lock"></i> Clôturer la collecte</button>';
    }
    if (isClotured && impayes.length > 0) {
        html += '<button onclick="ouvrirRelance(' + billetId + ')" class="btn-relance"><i class="fa-solid fa-envelope"></i> Relancer les impayés (' + impayes.length + ')</button>';
    } else if (isClotured && impayes.length === 0) {
        html += '<span class="relance-ok"><i class="fa-solid fa-check-circle"></i> Tous les paiements sont reçus</span>';
    }
    // Bouton inscrire un membre
    html += '<button class="btn-inscrire-membre" onclick="ouvrirModalInscription()"><i class="fa-solid fa-user-plus"></i> Inscrire un membre</button>';

    // Story 9.5 — Bouton export CSV
    var inscActives = inscriptions.filter(function(i) { return !i.pas_interesse; });
    if (inscActives.length > 0) {
        html += '<button class="btn-export-csv" onclick="exporterCSV(' + billetId + ')"><i class="fa-solid fa-file-csv"></i> Exporter CSV</button>';
    }
    html += '</div>';

    // Message si FDP non demandé — entre la barre d'actions et le tableau
    if (billet.PayerFDP !== 'oui') {
        html += '<div class="message-gerer-envoi">'
            + '<i class="fa-solid fa-info-circle"></i> '
            + 'Veuillez gérer l\'envoi de ce billet via l\'onglet <strong><a href="#" onclick="showTab(\'envois\');return false;">Préparation des envois</a></strong>.'
            + '</div>';
    }

    // Inscriptions table
    if (inscriptions.length === 0) {
        html += '<p class="collectes-empty"><i class="fa-solid fa-users-slash"></i> Aucun inscrit pour cette collecte.</p>';
    } else {
        // Tri par prénom puis nom
        inscriptions.sort(function(a, b) {
            var sa = a.adresse_snapshot || {}, sb = b.adresse_snapshot || {};
            var pa = (sa.prenom || '').toLowerCase(), pb = (sb.prenom || '').toLowerCase();
            if (pa < pb) return -1; if (pa > pb) return 1;
            var na = (sa.nom || '').toLowerCase(), nb = (sb.nom || '').toLowerCase();
            if (na < nb) return -1; if (na > nb) return 1;
            return 0;
        });

        html += '<div class="collecte-table-wrap">';
        html += '<table class="collecte-table">';
        html += '<thead><tr>';
        html += '<th>Prénom / Nom</th>';
        html += '<th>Adresse</th>';
        if (vne) html += '<th>Normaux</th>';
        html += '<th>Variantes</th>';
        html += '<th>Paiement</th>';
        html += '<th>Envoi</th>';
        html += '<th>Montant</th>';
        html += '<th>Payé</th>';
        if (billet.PayerFDP === 'oui') {
            html += '<th>FDP</th>';
            html += '<th>Envoyé</th>';
        }
        html += '<th>Actions</th>';
        html += '</tr></thead>';
        html += '<tbody>';

        for (var j = 0; j < inscriptions.length; j++) {
            var ins = inscriptions[j];
            var snap = ins.adresse_snapshot || {};
            var nomPrenom = ((snap.prenom || '') + ' ' + (snap.nom || '')).trim() || ins.membre_email;
            var adresse = formatAdresse(snap);
            var montant = ((prix * (ins.nb_normaux || 0)) + (prixVariante * (ins.nb_variantes || 0))).toFixed(2);
            var commentaire = ins.commentaire || '';

            html += '<tr>';
            html += '<td data-label="Nom">' + escapeHtmlMC(nomPrenom) + '</td>';
            html += '<td data-label="Adresse" class="td-adresse">' + escapeHtmlMC(adresse) + '</td>';
            if (vne) html += '<td data-label="Normaux">' + (ins.nb_normaux || 0) + '</td>';
            html += '<td data-label="Variantes">' + (ins.nb_variantes || 0) + '</td>';
            html += '<td data-label="Paiement">' + escapeHtmlMC(ins.mode_paiement || '') + '</td>';
            html += '<td data-label="Envoi">' + escapeHtmlMC(ins.mode_envoi || '') + '</td>';
            html += '<td data-label="Montant">' + montant + ' €</td>';
            html += '<td data-label="Payé">' + badgePaiementCollecteur(ins) + '</td>';
            if (billet.PayerFDP === 'oui') {
                html += '<td data-label="FDP"><input type="checkbox" id="chk-fdp_regles-' + ins.id + '" ' + (ins.fdp_regles ? 'checked' : '') + ' onchange="toggleInscriptionField(' + ins.id + ', \'fdp_regles\', this.checked)"></td>';
                html += '<td data-label="Envoyé"><input type="checkbox" id="chk-envoye-' + ins.id + '" ' + (ins.envoye ? 'checked' : '') + ' onchange="demanderExpeditionDirecte(' + ins.id + ', this)"></td>';
            }
            html += '<td data-label="Actions">'
                + '<button class="btn-modifier-inscription" onclick="ouvrirModalModification(' + ins.id + ')" title="Modifier l\'inscription"><i class="fa-solid fa-pen"></i></button>'
                + '<button class="btn-desinscrire" data-ins-id="' + ins.id + '" data-membre-name="' + escapeAttrMC(nomPrenom) + '"><i class="fa-solid fa-user-minus"></i></button>'
                + '</td>';
            html += '</tr>';

            if (commentaire) {
                var colCount = (vne ? 9 : 8) + (billet.PayerFDP === 'oui' ? 2 : 0);
                html += '<tr class="tr-commentaire"><td colspan="' + colCount + '"><i class="fa-solid fa-comment"></i> ' + escapeHtmlMC(commentaire) + '</td></tr>';
            }
        }

        html += '</tbody></table>';
        html += '</div>';
    }

    container.innerHTML = html;

    // SEC-03 — Event delegation pour les boutons desinscrire (remplace onclick inline)
    container.querySelectorAll('.btn-desinscrire[data-ins-id]').forEach(function(btn) {
        btn.addEventListener('click', function() {
            desinscrireMembre(parseInt(btn.getAttribute('data-ins-id')), btn.getAttribute('data-membre-name'));
        });
    });
}

function formatAdresse(snap) {
    var parts = [];
    if (snap.rue) parts.push(snap.rue);
    if (snap.code_postal || snap.ville) parts.push(((snap.code_postal || '') + ' ' + (snap.ville || '')).trim());
    if (snap.pays) parts.push(snap.pays);
    return parts.join(', ') || '—';
}

function retourListe() {
    var detailDiv = document.getElementById('collecte-detail');
    var listDiv = document.getElementById('collectes-list');
    if (detailDiv) detailDiv.style.display = 'none';
    if (listDiv) listDiv.style.display = '';
    currentBilletId = null;
    currentBillet = null;
    currentInscriptions = [];
    loadMesCollectes();
}

// ============================================================
// 6. CASES A COCHER (Task 6)
// ============================================================
function toggleInscriptionField(inscriptionId, field, newValue) {
    // SEC-05 — Whitelist des champs modifiables via checkbox
    if (['envoye', 'fdp_regles'].indexOf(field) === -1) return;
    var body = {};
    body[field] = newValue;
    supabaseFetch('/rest/v1/inscriptions?id=eq.' + inscriptionId, {
        method: 'PATCH',
        body: JSON.stringify(body)
    })
    .then(function() {
        // Update local data and recompute counters
        for (var i = 0; i < currentInscriptions.length; i++) {
            if (currentInscriptions[i].id === inscriptionId) {
                currentInscriptions[i][field] = newValue;
                break;
            }
        }
        updateCompteurs();
    })
    .catch(function(error) {
        console.error('Erreur modification:', error);
        showToast('Erreur lors de la modification', 'error');
        // Revert checkbox state
        var checkbox = document.getElementById('chk-' + field + '-' + inscriptionId);
        if (checkbox) checkbox.checked = !newValue;
    });
}

// ============================================================
// 6b. EXPEDITION DIRECTE DEPUIS VUE COLLECTE (checkbox envoyé)
// ============================================================

function demanderExpeditionDirecte(inscriptionId, checkbox) {
    if (!checkbox.checked) {
        // Décochage → annuler l'envoi
        var body = { envoye: false, statut_livraison: 'non_reparti' };
        supabaseFetch('/rest/v1/inscriptions?id=eq.' + inscriptionId, {
            method: 'PATCH',
            body: JSON.stringify(body)
        })
        .then(function() {
            for (var i = 0; i < currentInscriptions.length; i++) {
                if (currentInscriptions[i].id === inscriptionId) {
                    currentInscriptions[i].envoye = false;
                    currentInscriptions[i].statut_livraison = 'non_reparti';
                    break;
                }
            }
            updateCompteurs();
            showToast('Envoi annulé');
        })
        .catch(function(error) {
            console.error('Erreur annulation envoi:', error);
            checkbox.checked = true;
        });
        return;
    }

    // Cochage → demander mode d'envoi + numéro de suivi
    checkbox.checked = false; // Remettre à false en attendant confirmation

    // Trouver le mode d'envoi souhaité par le membre
    var inscription = null;
    for (var i = 0; i < currentInscriptions.length; i++) {
        if (currentInscriptions[i].id === inscriptionId) {
            inscription = currentInscriptions[i];
            break;
        }
    }
    var modeSuggere = inscription ? inscription.mode_envoi || 'Normal' : 'Normal';
    var modeMap = { Normal: 'normal', Suivi: 'suivi', 'Recommandé': 'recommande' };
    var modeVal = modeMap[modeSuggere] || 'normal';

    // Injecter un mini-formulaire après la ligne
    var row = checkbox.closest('tr');
    if (!row) return;

    // Supprimer un éventuel formulaire précédent
    var existing = document.getElementById('expedition-directe-form');
    if (existing) existing.remove();

    var vne = currentBillet && currentBillet.VersionNormaleExiste !== false;
    var colCount = (vne ? 9 : 8) + 2; // +2 pour FDP + Envoyé

    var formRow = document.createElement('tr');
    formRow.id = 'expedition-directe-form';
    formRow.innerHTML = '<td colspan="' + colCount + '">'
        + '<div class="expedition-form expedition-form-inline">'
        + '<span class="expedition-form-label">Mode d\'envoi :</span>'
        + '<select id="exp-direct-mode">'
        + '<option value="normal"' + (modeVal === 'normal' ? ' selected' : '') + '>Normal</option>'
        + '<option value="suivi"' + (modeVal === 'suivi' ? ' selected' : '') + '>Suivi</option>'
        + '<option value="recommande"' + (modeVal === 'recommande' ? ' selected' : '') + '>Recommandé</option>'
        + '</select>'
        + '<span class="expedition-form-label">N° suivi :</span>'
        + '<input type="text" id="exp-direct-suivi" placeholder="Optionnel" style="width:160px">'
        + '<button onclick="confirmerExpeditionDirecte(' + inscriptionId + ')" class="btn-confirmer-expedition"><i class="fa-solid fa-check"></i> Confirmer</button>'
        + '<button onclick="annulerExpeditionDirecte()" class="btn-secondary">Annuler</button>'
        + '</div>'
        + '</td>';
    row.parentNode.insertBefore(formRow, row.nextSibling);
}

function confirmerExpeditionDirecte(inscriptionId) {
    var modeEnvoi = document.getElementById('exp-direct-mode').value;
    var numeroSuivi = document.getElementById('exp-direct-suivi').value.trim() || null;

    // Trouver l'inscription pour son membre_email
    var inscription = null;
    for (var i = 0; i < currentInscriptions.length; i++) {
        if (currentInscriptions[i].id === inscriptionId) {
            inscription = currentInscriptions[i];
            break;
        }
    }
    if (!inscription || !monCollecteur) return;

    // 1. Trouver ou créer l'enveloppe en_cours pour ce couple
    var alias = encodeURIComponent(monCollecteur.alias);
    var membreEmail = encodeURIComponent(inscription.membre_email);

    supabaseFetch('/rest/v1/enveloppes?collecteur_alias=eq.' + alias + '&membre_email=eq.' + membreEmail + '&statut=eq.en_cours&select=id')
        .then(function(enveloppes) {
            var enveloppePromise;
            if (enveloppes && enveloppes.length > 0) {
                enveloppePromise = Promise.resolve(enveloppes[0].id);
            } else {
                enveloppePromise = supabaseFetch('/rest/v1/enveloppes', {
                    method: 'POST',
                    headers: { Prefer: 'return=representation' },
                    body: JSON.stringify({
                        collecteur_alias: monCollecteur.alias,
                        membre_email: inscription.membre_email,
                        statut: 'en_cours'
                    })
                }).then(function(created) {
                    return created && created[0] ? created[0].id : null;
                });
            }
            return enveloppePromise;
        })
        .then(function(enveloppeId) {
            if (!enveloppeId) throw new Error('Impossible de trouver/créer l\'enveloppe');

            // 2. Mettre l'inscription dans l'enveloppe puis l'expédier
            return supabaseFetch('/rest/v1/inscriptions?id=eq.' + inscriptionId, {
                method: 'PATCH',
                body: JSON.stringify({
                    envoye: true,
                    statut_livraison: 'expedie',
                    enveloppe_id: enveloppeId
                })
            }).then(function() { return enveloppeId; });
        })
        .then(function(enveloppeId) {
            // 3. Créer une enveloppe expédiée dédiée (on crée une nouvelle, on y rattache, on expédie)
            // Approche simplifiée : créer directement une enveloppe expédiée pour cet envoi unique
            return supabaseFetch('/rest/v1/enveloppes', {
                method: 'POST',
                headers: { Prefer: 'return=representation' },
                body: JSON.stringify({
                    collecteur_alias: monCollecteur.alias,
                    membre_email: inscription.membre_email,
                    statut: 'expediee',
                    mode_envoi_reel: modeEnvoi,
                    numero_suivi: numeroSuivi,
                    date_expedition: new Date().toISOString()
                })
            }).then(function(created) {
                if (created && created[0]) {
                    // Rattacher l'inscription à l'enveloppe expédiée
                    return supabaseFetch('/rest/v1/inscriptions?id=eq.' + inscriptionId, {
                        method: 'PATCH',
                        body: JSON.stringify({ enveloppe_id: created[0].id })
                    });
                }
            });
        })
        .then(function() {
            // Supprimer le formulaire
            var formRow = document.getElementById('expedition-directe-form');
            if (formRow) formRow.remove();

            // Update local
            for (var i = 0; i < currentInscriptions.length; i++) {
                if (currentInscriptions[i].id === inscriptionId) {
                    currentInscriptions[i].envoye = true;
                    currentInscriptions[i].statut_livraison = 'expedie';
                    break;
                }
            }
            var checkbox = document.getElementById('chk-envoye-' + inscriptionId);
            if (checkbox) checkbox.checked = true;
            updateCompteurs();
            showToast('Billet marqué comme envoyé');
        })
        .catch(function(error) {
            console.error('Erreur expédition directe:', error);
            showToast('Erreur lors de l\'envoi', 'error');
        });
}

function annulerExpeditionDirecte() {
    var formRow = document.getElementById('expedition-directe-form');
    if (formRow) formRow.remove();
}

function updateCompteurs() {
    var totalInscrits = currentInscriptions.length;
    var totalConfirmes = 0;
    var totalNormaux = 0;
    var totalVariantes = 0;
    for (var i = 0; i < currentInscriptions.length; i++) {
        if (currentInscriptions[i].statut_paiement === 'confirme') totalConfirmes++;
        totalNormaux += (currentInscriptions[i].nb_normaux || 0);
        totalVariantes += (currentInscriptions[i].nb_variantes || 0);
    }
    var progressPct = totalInscrits > 0 ? Math.round((totalConfirmes / totalInscrits) * 100) : 0;

    // Update counter display
    var compteurs = document.querySelectorAll('.compteur-value');
    if (compteurs.length >= 1) compteurs[0].textContent = totalConfirmes + '/' + totalInscrits + ' payés';
    var vne = currentBillet && currentBillet.VersionNormaleExiste !== false;
    if (compteurs.length >= 2) compteurs[1].textContent = (vne ? totalNormaux + ' normaux, ' : '') + totalVariantes + ' variantes';

    var progressFill = document.querySelector('.progress-fill');
    if (progressFill) progressFill.style.width = progressPct + '%';
}

// ============================================================
// 7. CLOTURER UNE COLLECTE (Task 7)
// ============================================================
function cloturerCollecte(billetId) {
    if (!confirm('Êtes-vous sûr de vouloir clôturer cette collecte ? Aucune nouvelle inscription ne sera acceptée.')) return;
    var today = new Date().toISOString().slice(0, 10);
    supabaseFetch('/rest/v1/billets?id=eq.' + billetId, {
        method: 'PATCH',
        body: JSON.stringify({ Categorie: 'Terminé', DateFin: today })
    })
    .then(function() {
        showToast('Collecte clôturée');
        loadMesCollectes();
    })
    .catch(function(error) {
        console.error('Erreur clôture:', error);
        showToast('Erreur lors de la clôture', 'error');
    });
}

// ============================================================
// 8. DESINSCRIPTION D'UN MEMBRE (Task 8)
// ============================================================
function desinscrireMembre(inscriptionId, membrePrenom) {
    if (!confirm('Désinscrire ' + membrePrenom + ' de cette collecte ?')) return;
    supabaseFetch('/rest/v1/inscriptions?id=eq.' + inscriptionId, {
        method: 'DELETE'
    })
    .then(function() {
        showToast('Membre désinscrit');
        openCollecteDetail(currentBilletId);
    })
    .catch(function(error) {
        console.error('Erreur désinscription:', error);
        showToast('Erreur lors de la désinscription', 'error');
    });
}

// ============================================================
// 9. ENVELOPPES — CASIER PERMANENT COLLECTEUR/MEMBRE (Story 5.7b)
// ============================================================

var currentEnveloppeId = null;
var currentEnveloppeData = null;

function showTab(tabName) {
    var collectesView = document.getElementById('collectes-list');
    var envoisView = document.getElementById('envois-view');
    var paiementsView = document.getElementById('paiements-view');
    var historiqueView = document.getElementById('historique-view');
    var detailView = document.getElementById('collecte-detail');
    var tabs = document.querySelectorAll('.tab-btn');

    for (var i = 0; i < tabs.length; i++) {
        tabs[i].classList.remove('active');
    }

    // Hide all views
    if (collectesView) collectesView.style.display = 'none';
    if (envoisView) envoisView.style.display = 'none';
    if (paiementsView) paiementsView.style.display = 'none';
    if (historiqueView) historiqueView.style.display = 'none';
    if (detailView) detailView.style.display = 'none';

    if (tabName === 'paiements') {
        if (paiementsView) paiementsView.style.display = '';
        if (tabs[1]) tabs[1].classList.add('active');
        loadVerificationPaiement();
    } else if (tabName === 'envois') {
        if (envoisView) envoisView.style.display = '';
        if (tabs[2]) tabs[2].classList.add('active');
        loadEnveloppes();
    } else if (tabName === 'historique') {
        if (historiqueView) historiqueView.style.display = '';
        if (tabs[3]) tabs[3].classList.add('active');
        loadHistoriqueGlobal();
    } else {
        if (collectesView) collectesView.style.display = '';
        if (tabs[0]) tabs[0].classList.add('active');
    }
}

function loadEnveloppes() {
    if (!monCollecteur) {
        renderEnveloppesVide();
        return;
    }
    var alias = monCollecteur.alias;
    // Charger les enveloppes en_cours du collecteur
    supabaseFetch('/rest/v1/enveloppes?collecteur_alias=eq.' + encodeURIComponent(alias) + '&statut=eq.en_cours&select=*&order=membre_email.asc')
        .then(function(enveloppes) {
            enveloppes = enveloppes || [];
            if (enveloppes.length === 0) {
                renderEnveloppesVide();
                return;
            }

            // Charger toutes les inscriptions non-expédiées du collecteur (non_reparti + pret_a_envoyer)
            var billetIds = mesBillets.map(function(b) { return b.id; });
            if (billetIds.length === 0) {
                renderEnveloppesListe(enveloppes, [], {});
                return;
            }
            return supabaseFetch('/rest/v1/inscriptions?billet_id=in.(' + billetIds.join(',') + ')&pas_interesse=eq.false&statut_livraison=in.(non_reparti,pret_a_envoyer)&select=*')
                .then(function(inscriptions) {
                    inscriptions = inscriptions || [];
                    var emails = [];
                    inscriptions.forEach(function(ins) {
                        if (ins.membre_email && emails.indexOf(ins.membre_email) === -1) emails.push(ins.membre_email);
                    });
                    if (emails.length === 0) {
                        var billetsMap = {};
                        mesBillets.forEach(function(b) { billetsMap[b.id] = b; });
                        renderEnveloppesListe(enveloppes, inscriptions, billetsMap);
                        return;
                    }
                    var emailFilter = emails.map(function(e) { return encodeURIComponent(e); }).join(',');
                    return supabaseFetch('/rest/v1/membres?email=in.(' + emailFilter + ')&select=email,nom,prenom')
                        .then(function(membres) {
                            var membresMap = {};
                            if (membres) {
                                membres.forEach(function(m) { membresMap[m.email] = m; });
                            }
                            inscriptions.forEach(function(ins) {
                                var membre = membresMap[ins.membre_email];
                                if (membre && ins.adresse_snapshot) {
                                    if (!ins.adresse_snapshot.nom && membre.nom) ins.adresse_snapshot.nom = membre.nom;
                                    if (!ins.adresse_snapshot.prenom && membre.prenom) ins.adresse_snapshot.prenom = membre.prenom;
                                }
                            });
                            var billetsMap = {};
                            mesBillets.forEach(function(b) { billetsMap[b.id] = b; });
                            renderEnveloppesListe(enveloppes, inscriptions, billetsMap);
                        });
                });
        })
        .catch(function(error) {
            console.error('Erreur chargement enveloppes:', error);
        });
}

function renderEnveloppesListe(enveloppes, inscriptions, billetsMap) {
    var container = document.getElementById('envois-view');
    if (!container) return;

    // Grouper les inscriptions par membre_email
    var inscByMembre = {};
    inscriptions.forEach(function(ins) {
        if (!inscByMembre[ins.membre_email]) inscByMembre[ins.membre_email] = [];
        inscByMembre[ins.membre_email].push(ins);
    });

    // Pré-calculer le nom pour le tri
    var enveloppesMeta = [];
    for (var e = 0; e < enveloppes.length; e++) {
        var env = enveloppes[e];
        var membreInscs = inscByMembre[env.membre_email] || [];
        var adr = {};
        for (var a = 0; a < membreInscs.length; a++) {
            if (membreInscs[a].adresse_snapshot && (membreInscs[a].adresse_snapshot.nom || membreInscs[a].adresse_snapshot.prenom)) {
                adr = membreInscs[a].adresse_snapshot;
                break;
            }
        }
        enveloppesMeta.push({ env: env, adr: adr });
    }
    // Tri par prénom puis nom
    enveloppesMeta.sort(function(a, b) {
        var pa = (a.adr.prenom || '').toLowerCase(), pb = (b.adr.prenom || '').toLowerCase();
        if (pa < pb) return -1; if (pa > pb) return 1;
        var na = (a.adr.nom || '').toLowerCase(), nb = (b.adr.nom || '').toLowerCase();
        if (na < nb) return -1; if (na > nb) return 1;
        return 0;
    });

    var html = '';

    for (var e = 0; e < enveloppesMeta.length; e++) {
            var env = enveloppesMeta[e].env;
            var membreInscs = inscByMembre[env.membre_email] || [];
            var dansEnveloppe = membreInscs.filter(function(i) { return i.statut_livraison === 'pret_a_envoyer' && i.enveloppe_id === env.id; });
            var aRepartir = membreInscs.filter(function(i) { return i.statut_livraison === 'non_reparti'; });
            var totalBillets = dansEnveloppe.length;

            var adr = enveloppesMeta[e].adr;
            var nom = ((adr.prenom || '') + ' ' + (adr.nom || '')).trim() || env.membre_email;
            var adresseStr = [adr.rue, adr.code_postal, adr.ville, adr.pays].filter(Boolean).join(', ');

            var demandeHtml = '';
            if (env.demande_envoi) {
                var dateStr = env.date_demande_envoi ? new Date(env.date_demande_envoi).toLocaleDateString('fr-FR') : '';
                demandeHtml = '<span class="badge-demande-envoi">⚡ Demande d\'envoi (' + dateStr + ')</span>';
            }

            html += '<div class="envoi-groupe" onclick="openEnveloppeDetail(' + env.id + ')" style="cursor:pointer">'
                + '<div class="envoi-groupe-header">'
                + '<strong>' + escapeHtmlMC(nom) + '</strong>'
                + '<span class="envoi-adresse">' + escapeHtmlMC(adresseStr || 'Adresse non renseignée') + '</span>'
                + '<span class="envoi-count">' + totalBillets + ' dans l\'enveloppe, ' + aRepartir.length + ' à répartir</span>'
                + demandeHtml
                + '</div>'
                + '</div>';
    }

    if (html === '') {
        renderEnveloppesVide();
        return;
    }

    container.innerHTML = html;
}

function openEnveloppePassee(enveloppeId) {
    supabaseFetch('/rest/v1/enveloppes?id=eq.' + enveloppeId + '&select=*')
        .then(function(enveloppes) {
            if (!enveloppes || enveloppes.length === 0) return;
            var env = enveloppes[0];
            // Charger le nom du membre
            return supabaseFetch('/rest/v1/membres?email=eq.' + encodeURIComponent(env.membre_email) + '&select=nom,prenom')
                .then(function(membres) {
                    if (membres && membres[0]) {
                        env._nomAffiche = ((membres[0].prenom || '') + ' ' + (membres[0].nom || '')).trim() || env.membre_email;
                    } else {
                        env._nomAffiche = env.membre_email;
                    }
                    // Charger les inscriptions de cette enveloppe
                    return supabaseFetch('/rest/v1/inscriptions?enveloppe_id=eq.' + enveloppeId + '&select=*');
                })
                .then(function(inscriptions) {
                    inscriptions = inscriptions || [];
                    var billetsMap = {};
                    mesBillets.forEach(function(b) { billetsMap[b.id] = b; });
                    // Charger aussi les billets qu'on n'a peut-être plus dans mesBillets
                    var missingIds = [];
                    inscriptions.forEach(function(ins) {
                        if (!billetsMap[ins.billet_id] && missingIds.indexOf(ins.billet_id) === -1) {
                            missingIds.push(ins.billet_id);
                        }
                    });
                    if (missingIds.length > 0) {
                        return supabaseFetch('/rest/v1/billets?id=in.(' + missingIds.join(',') + ')&select=id,"NomBillet","Reference","Millesime","Version","VersionNormaleExiste"')
                            .then(function(billets) {
                                (billets || []).forEach(function(b) { billetsMap[b.id] = b; });
                                renderEnveloppePasseeDetail(env, inscriptions, billetsMap);
                            });
                    }
                    renderEnveloppePasseeDetail(env, inscriptions, billetsMap);
                });
        })
        .catch(function(error) {
            console.error('Erreur chargement enveloppe passée:', error);
            showToast('Erreur lors du chargement', 'error');
        });
}

function renderEnveloppePasseeDetail(env, inscriptions, billetsMap) {
    var container = _retourDepuisHistorique ? document.getElementById('historique-view') : document.getElementById('envois-view');
    if (!container) container = document.getElementById('envois-view');
    if (!container) return;

    var dateExp = env.date_expedition ? new Date(env.date_expedition).toLocaleDateString('fr-FR') : '—';
    var modeLabel = { normal: 'Normal', suivi: 'Suivi', recommande: 'Recommandé' }[env.mode_envoi_reel] || env.mode_envoi_reel || '—';

    var html = '';
    html += '<button class="btn-retour-liste" onclick="retourEnveloppes()"><i class="fa-solid fa-arrow-left"></i> Retour aux enveloppes</button>';

    html += '<div class="enveloppe-detail-header">';
    html += '<h2><i class="fa-solid fa-envelope"></i> Envoi à ' + escapeHtmlMC(env._nomAffiche || env.membre_email) + '</h2>';
    html += '<div class="historique-envoi-header" style="margin-top:8px">';
    html += '<span><i class="fa-solid fa-calendar"></i> Expédié le ' + dateExp + '</span>';
    html += '<span><i class="fa-solid fa-truck"></i> ' + modeLabel + '</span>';
    if (env.numero_suivi) {
        html += '<span><i class="fa-solid fa-barcode"></i> N° suivi : ' + escapeHtmlMC(env.numero_suivi) + '</span>';
    }
    if (env.statut === 'recue') {
        var dateRec = env.date_reception ? new Date(env.date_reception).toLocaleDateString('fr-FR') : '';
        html += '<span class="badge-recue"><i class="fa-solid fa-circle-check"></i> Reçue le ' + dateRec + '</span>';
    } else {
        html += '<span class="badge-pas-retour">Pas de retour</span>';
    }
    html += '</div>';
    // Bouton annuler l'envoi (seulement si pas encore reçue)
    if (env.statut !== 'recue') {
        html += '<div style="margin-top:10px">';
        html += '<button class="btn-annuler-envoi" onclick="annulerEnvoi(' + env.id + ')"><i class="fa-solid fa-rotate-left"></i> Annuler cet envoi</button>';
        html += '</div>';
    }
    html += '</div>';

    // Liste des billets dans l'enveloppe
    html += '<div class="enveloppe-section">';
    html += '<h3><i class="fa-solid fa-box"></i> Contenu de l\'enveloppe (' + inscriptions.length + ' billet(s))</h3>';
    if (inscriptions.length === 0) {
        html += '<p class="enveloppe-vide">Aucun billet enregistré</p>';
    } else {
        for (var i = 0; i < inscriptions.length; i++) {
            var insc = inscriptions[i];
            var billet = billetsMap[insc.billet_id] || {};
            var envVne = billet.VersionNormaleExiste !== false;
            var envQty = envVne ? 'N:' + (insc.nb_normaux || 0) + (insc.nb_variantes > 0 ? ' V:' + insc.nb_variantes : '') : 'V:' + (insc.nb_variantes || 0);
            var envRefParts = [];
            if (billet.Reference) envRefParts.push(billet.Reference);
            var envMilVersion = '';
            if (billet.Millesime) envMilVersion += billet.Millesime;
            if (billet.Version) envMilVersion += '-' + billet.Version;
            if (envMilVersion) envRefParts.push(envMilVersion);
            var envRefPrefix = envRefParts.length > 0 ? envRefParts.join(' - ') + ' ' : '';

            html += '<div class="envoi-ligne">'
                + '<span class="envoi-billet">' + envRefPrefix + escapeHtmlMC(billet.NomBillet || '?') + '</span>'
                + '<span class="envoi-qty">' + envQty + '</span>'
                + badgePaiementEnvoi(insc.statut_paiement)
                + '</div>';
        }
    }
    html += '</div>';

    container.innerHTML = html;
}

function renderEnveloppesVide() {
    var container = document.getElementById('envois-view');
    if (container) {
        container.innerHTML = '<div class="envois-empty"><i class="fa-solid fa-check-circle"></i><p>Aucune enveloppe en cours</p></div>';
    }
}

// ============================================================
// 9d. HISTORIQUE DES ENVOIS — ONGLET DÉDIÉ
// ============================================================

function loadHistoriqueGlobal() {
    if (!monCollecteur) {
        var hc = document.getElementById('historique-view');
        if (hc) hc.innerHTML = '<div class="envois-empty"><p>Aucun historique</p></div>';
        return;
    }
    var alias = encodeURIComponent(monCollecteur.alias);
    supabaseFetch('/rest/v1/enveloppes?collecteur_alias=eq.' + alias + '&statut=in.(expediee,recue)&select=*&order=date_expedition.desc')
        .then(function(envPassees) {
            envPassees = envPassees || [];
            if (envPassees.length === 0) {
                var hc = document.getElementById('historique-view');
                if (hc) hc.innerHTML = '<div class="envois-empty"><i class="fa-solid fa-clock-rotate-left"></i><p>Aucun envoi passé</p></div>';
                return;
            }
            // Charger les noms des membres
            var emails = [];
            envPassees.forEach(function(e) {
                if (e.membre_email && emails.indexOf(e.membre_email) === -1) emails.push(e.membre_email);
            });
            var emailFilter = emails.map(function(e) { return encodeURIComponent(e); }).join(',');
            return supabaseFetch('/rest/v1/membres?email=in.(' + emailFilter + ')&select=email,nom,prenom')
                .then(function(membres) {
                    var membresMap = {};
                    (membres || []).forEach(function(m) { membresMap[m.email] = m; });
                    renderHistoriqueGlobal(envPassees, membresMap);
                });
        })
        .catch(function(error) {
            console.error('Erreur chargement historique global:', error);
        });
}

function renderHistoriqueGlobal(envPassees, membresMap) {
    var container = document.getElementById('historique-view');
    if (!container) return;

    var html = '<h3 class="enveloppes-section-titre"><i class="fa-solid fa-clock-rotate-left"></i> Historique des envois (' + envPassees.length + ')</h3>';

    for (var h = 0; h < envPassees.length; h++) {
        var envH = envPassees[h];
        var dateExp = envH.date_expedition ? new Date(envH.date_expedition).toLocaleDateString('fr-FR') : '—';
        var modeLabel = { normal: 'Normal', suivi: 'Suivi', recommande: 'Recommandé' }[envH.mode_envoi_reel] || envH.mode_envoi_reel || '—';
        var statutHtml = '';
        if (envH.statut === 'recue') {
            var dateRec = envH.date_reception ? new Date(envH.date_reception).toLocaleDateString('fr-FR') : '';
            statutHtml = '<span class="badge-recue"><i class="fa-solid fa-circle-check"></i> Reçue ' + dateRec + '</span>';
        } else {
            statutHtml = '<span class="badge-pas-retour">Pas de retour</span>';
        }

        var membreH = membresMap[envH.membre_email];
        var nomH = membreH ? ((membreH.prenom || '') + ' ' + (membreH.nom || '')).trim() : '';
        nomH = nomH || envH.membre_email;

        html += '<div class="envoi-groupe historique-envoi-card" onclick="_retourDepuisHistorique=true;openEnveloppePassee(' + envH.id + ')" style="cursor:pointer">'
            + '<div class="envoi-groupe-header">'
            + '<strong>' + escapeHtmlMC(nomH) + '</strong>'
            + '<span class="envoi-date"><i class="fa-solid fa-calendar"></i> ' + dateExp + '</span>'
            + '<span><i class="fa-solid fa-truck"></i> ' + modeLabel + '</span>'
            + (envH.numero_suivi ? '<span><i class="fa-solid fa-barcode"></i> ' + escapeHtmlMC(envH.numero_suivi) + '</span>' : '')
            + statutHtml
            + '</div>'
            + '</div>';
    }

    container.innerHTML = html;
}

function openEnveloppeDetail(enveloppeId) {
    currentEnveloppeId = enveloppeId;
    // Charger l'enveloppe + ses inscriptions
    supabaseFetch('/rest/v1/enveloppes?id=eq.' + enveloppeId + '&select=*')
        .then(function(enveloppes) {
            if (!enveloppes || enveloppes.length === 0) return;
            currentEnveloppeData = enveloppes[0];
            var billetIds = mesBillets.map(function(b) { return b.id; });
            if (billetIds.length === 0) {
                renderEnveloppeDetail([], {});
                return;
            }
            // Inscriptions : dans l'enveloppe (pret_a_envoyer + enveloppe_id) OU à répartir (non_reparti + même membre)
            var membreEmail = encodeURIComponent(currentEnveloppeData.membre_email);
            return supabaseFetch('/rest/v1/inscriptions?billet_id=in.(' + billetIds.join(',') + ')&membre_email=eq.' + membreEmail + '&pas_interesse=eq.false&statut_livraison=in.(non_reparti,pret_a_envoyer)&select=*')
                .then(function(inscriptions) {
                    inscriptions = inscriptions || [];
                    var billetsMap = {};
                    mesBillets.forEach(function(b) { billetsMap[b.id] = b; });
                    renderEnveloppeDetail(inscriptions, billetsMap);
                });
        })
        .catch(function(error) {
            console.error('Erreur chargement enveloppe:', error);
            showToast('Erreur lors du chargement', 'error');
        });
}

function renderEnveloppeDetail(inscriptions, billetsMap) {
    var container = document.getElementById('envois-view');
    if (!container || !currentEnveloppeData) return;

    var env = currentEnveloppeData;
    var dansEnveloppe = inscriptions.filter(function(i) { return i.statut_livraison === 'pret_a_envoyer' && i.enveloppe_id === env.id; });
    var aRepartir = inscriptions.filter(function(i) { return i.statut_livraison === 'non_reparti'; });

    // Nom du membre
    var adr = {};
    for (var a = 0; a < inscriptions.length; a++) {
        if (inscriptions[a].adresse_snapshot && (inscriptions[a].adresse_snapshot.nom || inscriptions[a].adresse_snapshot.prenom)) {
            adr = inscriptions[a].adresse_snapshot;
            break;
        }
    }
    var nom = ((adr.prenom || '') + ' ' + (adr.nom || '')).trim() || env.membre_email;
    var adresseStr = [adr.rue, adr.code_postal, adr.ville, adr.pays].filter(Boolean).join(', ');

    var html = '';
    html += '<button class="btn-retour-liste" onclick="retourEnveloppes()"><i class="fa-solid fa-arrow-left"></i> Retour aux enveloppes</button>';

    html += '<div class="enveloppe-detail-header">';
    html += '<h2><i class="fa-solid fa-envelope"></i> ' + escapeHtmlMC(nom) + '</h2>';
    html += '<span class="envoi-adresse">' + escapeHtmlMC(adresseStr || 'Adresse non renseignée') + '</span>';
    if (env.demande_envoi) {
        var dateStr = env.date_demande_envoi ? new Date(env.date_demande_envoi).toLocaleDateString('fr-FR') : '';
        html += '<span class="badge-demande-envoi">⚡ Demande d\'envoi (' + dateStr + ')</span>';
    }
    html += '</div>';

    // Section : Dans l'enveloppe (prêts à envoyer)
    html += '<div class="enveloppe-section">';
    html += '<h3><i class="fa-solid fa-box"></i> Dans l\'enveloppe (' + dansEnveloppe.length + ')</h3>';
    if (dansEnveloppe.length === 0) {
        html += '<p class="enveloppe-vide">Aucun billet dans l\'enveloppe</p>';
    } else {
        for (var d = 0; d < dansEnveloppe.length; d++) {
            var insc = dansEnveloppe[d];
            var billet = billetsMap[insc.billet_id] || {};
            html += renderEnveloppeLigne(insc, billet, 'retirer');
        }
    }
    // Bouton Expédier (Story 5.9) — visible uniquement si billets prêts
    if (dansEnveloppe.length > 0) {
        html += '<button onclick="ouvrirFormulaireExpedition(' + env.id + ')" class="btn-expedier"><i class="fa-solid fa-paper-plane"></i> Expédier cette enveloppe (' + dansEnveloppe.length + ' billet(s))</button>';
    }
    html += '</div>';

    // Formulaire d'expédition (caché par défaut, affiché par ouvrirFormulaireExpedition)
    html += '<div id="expedition-form-container" style="display:none"></div>';

    // Section : À répartir (non répartis)
    if (aRepartir.length > 0) {
        html += '<div class="enveloppe-section">';
        html += '<h3><i class="fa-solid fa-inbox"></i> À répartir (' + aRepartir.length + ')</h3>';
        for (var r = 0; r < aRepartir.length; r++) {
            var inscR = aRepartir[r];
            var billetR = billetsMap[inscR.billet_id] || {};
            html += renderEnveloppeLigne(inscR, billetR, 'ajouter');
        }
        html += '</div>';
    }

    // Bouton historique
    html += '<div class="enveloppe-section">';
    html += '<button class="btn-historique-enveloppes" onclick="loadHistoriqueEnveloppes()"><i class="fa-solid fa-clock-rotate-left"></i> Historique des envois</button>';
    html += '<div id="historique-enveloppes"></div>';
    html += '</div>';

    container.innerHTML = html;
}

function renderEnveloppeLigne(insc, billet, action) {
    var envVne = billet.VersionNormaleExiste !== false;
    var envQty = envVne ? 'N:' + (insc.nb_normaux || 0) + (insc.nb_variantes > 0 ? ' V:' + insc.nb_variantes : '') : 'V:' + (insc.nb_variantes || 0);
    var envRefParts = [];
    if (billet.Reference) envRefParts.push(billet.Reference);
    var envMilVersion = '';
    if (billet.Millesime) envMilVersion += billet.Millesime;
    if (billet.Version) envMilVersion += '-' + billet.Version;
    if (envMilVersion) envRefParts.push(envMilVersion);
    var envRefPrefix = envRefParts.length > 0 ? envRefParts.join(' - ') + ' ' : '';

    var actionBtn = '';
    if (action === 'ajouter') {
        actionBtn = '<button onclick="ajouterAEnveloppe(' + insc.id + ', ' + currentEnveloppeId + ')" class="btn-ajouter-enveloppe" title="Ajouter à l\'enveloppe"><i class="fa-solid fa-plus"></i></button>';
    } else if (action === 'retirer') {
        actionBtn = '<button onclick="retirerDeEnveloppe(' + insc.id + ')" class="btn-retirer-enveloppe" title="Retirer de l\'enveloppe"><i class="fa-solid fa-minus"></i></button>';
    }

    return '<div class="envoi-ligne">'
        + '<span class="envoi-billet">' + envRefPrefix + escapeHtmlMC(billet.NomBillet || '?') + '</span>'
        + '<span class="envoi-qty">' + envQty + '</span>'
        + badgePaiementEnvoi(insc.statut_paiement)
        + '<span class="badge-' + (insc.fdp_regles ? 'paye' : 'non-paye') + '">' + (insc.fdp_regles ? 'FDP OK' : 'FDP —') + '</span>'
        + actionBtn
        + '</div>';
}

function ajouterAEnveloppe(inscriptionId, enveloppeId) {
    supabaseFetch('/rest/v1/inscriptions?id=eq.' + inscriptionId, {
        method: 'PATCH',
        body: JSON.stringify({ statut_livraison: 'pret_a_envoyer', enveloppe_id: enveloppeId })
    })
    .then(function() {
        showToast('Billet ajouté à l\'enveloppe');
        openEnveloppeDetail(enveloppeId);
    })
    .catch(function(error) {
        console.error('Erreur ajout enveloppe:', error);
        showToast('Erreur', 'error');
    });
}

function retirerDeEnveloppe(inscriptionId) {
    supabaseFetch('/rest/v1/inscriptions?id=eq.' + inscriptionId, {
        method: 'PATCH',
        body: JSON.stringify({ statut_livraison: 'non_reparti', enveloppe_id: null })
    })
    .then(function() {
        showToast('Billet retiré de l\'enveloppe');
        openEnveloppeDetail(currentEnveloppeId);
    })
    .catch(function(error) {
        console.error('Erreur retrait enveloppe:', error);
        showToast('Erreur', 'error');
    });
}

var _retourDepuisHistorique = false;

function retourEnveloppes() {
    currentEnveloppeId = null;
    currentEnveloppeData = null;
    if (_retourDepuisHistorique) {
        _retourDepuisHistorique = false;
        showTab('historique');
    } else {
        loadEnveloppes();
    }
}

function loadHistoriqueEnveloppes() {
    if (!currentEnveloppeData) return;
    var alias = encodeURIComponent(currentEnveloppeData.collecteur_alias);
    var email = encodeURIComponent(currentEnveloppeData.membre_email);
    supabaseFetch('/rest/v1/enveloppes?collecteur_alias=eq.' + alias + '&membre_email=eq.' + email + '&statut=in.(expediee,recue)&select=*&order=date_expedition.desc')
        .then(function(enveloppes) {
            var histContainer = document.getElementById('historique-enveloppes');
            if (!histContainer) return;
            if (!enveloppes || enveloppes.length === 0) {
                histContainer.innerHTML = '<p class="enveloppe-vide">Aucun envoi passé</p>';
                return;
            }
            // Charger les inscriptions de ces enveloppes pour les détails
            var envIds = enveloppes.map(function(e) { return e.id; });
            return supabaseFetch('/rest/v1/inscriptions?enveloppe_id=in.(' + envIds.join(',') + ')&select=*')
                .then(function(inscriptions) {
                    inscriptions = inscriptions || [];
                    var inscByEnv = {};
                    inscriptions.forEach(function(ins) {
                        if (!inscByEnv[ins.enveloppe_id]) inscByEnv[ins.enveloppe_id] = [];
                        inscByEnv[ins.enveloppe_id].push(ins);
                    });
                    var billetsMap = {};
                    mesBillets.forEach(function(b) { billetsMap[b.id] = b; });
                    renderHistoriqueEnveloppes(enveloppes, inscByEnv, billetsMap, histContainer);
                });
        })
        .catch(function(error) {
            console.error('Erreur chargement historique:', error);
        });
}

function renderHistoriqueEnveloppes(enveloppes, inscByEnv, billetsMap, container) {
    var html = '';
    for (var h = 0; h < enveloppes.length; h++) {
        var env = enveloppes[h];
        var inscs = inscByEnv[env.id] || [];
        var dateExp = env.date_expedition ? new Date(env.date_expedition).toLocaleDateString('fr-FR') : '—';
        var modeLabel = { normal: 'Normal', suivi: 'Suivi', recommande: 'Recommandé' }[env.mode_envoi_reel] || env.mode_envoi_reel || '—';

        var statutHtml = '';
        if (env.statut === 'recue') {
            var dateRec = env.date_reception ? new Date(env.date_reception).toLocaleDateString('fr-FR') : '';
            statutHtml = '<span class="badge-recue"><i class="fa-solid fa-circle-check"></i> Reçue ✓ ' + dateRec + '</span>';
        } else {
            statutHtml = '<span class="badge-pas-retour">Pas de retour</span>';
        }

        var billetsList = inscs.map(function(ins) {
            var b = billetsMap[ins.billet_id];
            return b ? b.NomBillet : 'Billet';
        }).join(', ');

        html += '<div class="historique-envoi">'
            + '<div class="historique-envoi-header">'
            + '<span><i class="fa-solid fa-calendar"></i> ' + dateExp + '</span>'
            + '<span><i class="fa-solid fa-truck"></i> ' + modeLabel + '</span>'
            + (env.numero_suivi ? '<span><i class="fa-solid fa-barcode"></i> ' + escapeHtmlMC(env.numero_suivi) + '</span>' : '')
            + '<span>' + inscs.length + ' billet(s)</span>'
            + statutHtml
            + '</div>'
            + '<div class="historique-envoi-billets">' + escapeHtmlMC(billetsList) + '</div>'
            + '</div>';
    }
    container.innerHTML = html;
}

// ============================================================
// 9c. EXPEDITION D'ENVELOPPE (Story 5.9)
// ============================================================

function getModeEnvoiPlusExigeant(inscriptions) {
    var priorite = { Normal: 1, Suivi: 2, 'Recommandé': 3 };
    var max = 'Normal';
    for (var i = 0; i < inscriptions.length; i++) {
        var mode = inscriptions[i].mode_envoi || 'Normal';
        if ((priorite[mode] || 0) > (priorite[max] || 0)) {
            max = mode;
        }
    }
    return max;
}

function ouvrirFormulaireExpedition(enveloppeId) {
    var container = document.getElementById('expedition-form-container');
    if (!container) return;

    // Récupérer les inscriptions dans l'enveloppe pour le mode pré-rempli
    var billetIds = mesBillets.map(function(b) { return b.id; });
    if (!currentEnveloppeData || billetIds.length === 0) return;

    var membreEmail = encodeURIComponent(currentEnveloppeData.membre_email);
    supabaseFetch('/rest/v1/inscriptions?enveloppe_id=eq.' + enveloppeId + '&statut_livraison=eq.pret_a_envoyer&select=mode_envoi')
        .then(function(inscriptions) {
            inscriptions = inscriptions || [];
            var modeSuggere = getModeEnvoiPlusExigeant(inscriptions);
            var modeMap = { Normal: 'normal', Suivi: 'suivi', 'Recommandé': 'recommande' };
            var modeVal = modeMap[modeSuggere] || 'normal';

            var html = '<div class="expedition-form">'
                + '<h3><i class="fa-solid fa-paper-plane"></i> Expédier l\'enveloppe</h3>'
                + '<div class="insc-form-field"><label>Mode d\'envoi réel</label>'
                + '<select id="mode-envoi-reel">'
                + '<option value="normal"' + (modeVal === 'normal' ? ' selected' : '') + '>Normal</option>'
                + '<option value="suivi"' + (modeVal === 'suivi' ? ' selected' : '') + '>Suivi</option>'
                + '<option value="recommande"' + (modeVal === 'recommande' ? ' selected' : '') + '>Recommandé</option>'
                + '</select></div>'
                + '<div class="insc-form-field"><label>Numéro de suivi (optionnel)</label>'
                + '<input type="text" id="numero-suivi" placeholder="Ex: 1Z999AA..."></div>'
                + '<div class="expedition-actions">'
                + '<button onclick="annulerExpedition()" class="btn-secondary">Annuler</button>'
                + '<button onclick="confirmerExpedition(' + enveloppeId + ')" class="btn-confirmer-expedition"><i class="fa-solid fa-check"></i> Confirmer l\'expédition</button>'
                + '</div>'
                + '</div>';
            container.innerHTML = html;
            container.style.display = '';
        })
        .catch(function(error) {
            console.error('Erreur chargement modes:', error);
        });
}

function annulerExpedition() {
    var container = document.getElementById('expedition-form-container');
    if (container) {
        container.style.display = 'none';
        container.innerHTML = '';
    }
}

function confirmerExpedition(enveloppeId) {
    var modeEnvoi = document.getElementById('mode-envoi-reel').value;
    var numeroSuivi = document.getElementById('numero-suivi').value.trim() || null;

    // 1. Mettre à jour l'enveloppe → expédiée
    supabaseFetch('/rest/v1/enveloppes?id=eq.' + enveloppeId, {
        method: 'PATCH',
        body: JSON.stringify({
            statut: 'expediee',
            mode_envoi_reel: modeEnvoi,
            numero_suivi: numeroSuivi,
            date_expedition: new Date().toISOString()
        })
    })
    .then(function() {
        // 2. Mettre à jour les inscriptions rattachées → expédié
        return supabaseFetch('/rest/v1/inscriptions?enveloppe_id=eq.' + enveloppeId + '&statut_livraison=eq.pret_a_envoyer', {
            method: 'PATCH',
            body: JSON.stringify({ statut_livraison: 'expedie', envoye: true })
        });
    })
    .then(function() {
        // 3. Créer une nouvelle enveloppe en_cours pour le même couple
        return creerNouvelleEnveloppe(enveloppeId);
    })
    .then(function() {
        showToast('Enveloppe expédiée avec succès');
        currentEnveloppeId = null;
        currentEnveloppeData = null;
        loadEnveloppes();
    })
    .catch(function(error) {
        console.error('Erreur expédition:', error);
        showToast('Erreur lors de l\'expédition', 'error');
    });
}

function creerNouvelleEnveloppe(ancienneEnveloppeId) {
    return supabaseFetch('/rest/v1/enveloppes?id=eq.' + ancienneEnveloppeId + '&select=collecteur_alias,membre_email')
        .then(function(enveloppes) {
            if (!enveloppes || enveloppes.length === 0) return;
            var env = enveloppes[0];
            return supabaseFetch('/rest/v1/enveloppes', {
                method: 'POST',
                body: JSON.stringify({
                    collecteur_alias: env.collecteur_alias,
                    membre_email: env.membre_email,
                    statut: 'en_cours'
                })
            });
        });
}

function annulerEnvoi(enveloppeId) {
    if (!confirm('Annuler cet envoi ? Les billets repasseront dans la préparation des envois.')) return;

    var envData;

    // 1. Récupérer l'enveloppe
    supabaseFetch('/rest/v1/enveloppes?id=eq.' + enveloppeId + '&select=*')
        .then(function(enveloppes) {
            if (!enveloppes || enveloppes.length === 0) throw new Error('Enveloppe introuvable');
            envData = enveloppes[0];

            // 2. S'assurer qu'une enveloppe en_cours existe pour ce couple
            return creerEnveloppeSiAbsente(envData.collecteur_alias, envData.membre_email);
        })
        .then(function() {
            // 3. Récupérer l'id de l'enveloppe en_cours cible
            return supabaseFetch('/rest/v1/enveloppes?collecteur_alias=eq.' + encodeURIComponent(envData.collecteur_alias) + '&membre_email=eq.' + encodeURIComponent(envData.membre_email) + '&statut=eq.en_cours&select=id');
        })
        .then(function(enCours) {
            var cibleId = enCours[0].id;

            // 4. Rattacher les inscriptions à l'enveloppe en_cours et remettre en pret_a_envoyer
            return supabaseFetch('/rest/v1/inscriptions?enveloppe_id=eq.' + enveloppeId + '&statut_livraison=eq.expedie', {
                method: 'PATCH',
                body: JSON.stringify({ enveloppe_id: cibleId, statut_livraison: 'pret_a_envoyer', envoye: false })
            });
        })
        .then(function() {
            // 5. Supprimer l'enveloppe expédiée
            return supabaseFetch('/rest/v1/enveloppes?id=eq.' + enveloppeId, { method: 'DELETE' });
        })
        .then(function() {
            showToast('Envoi annulé — billets replacés dans la préparation');
            loadHistoriqueGlobal();
        })
        .catch(function(error) {
            console.error('Erreur annulation envoi:', error);
            showToast('Erreur lors de l\'annulation', 'error');
        });
}

// ============================================================
// 9b. GESTION STATUT PAIEMENT COLLECTEUR
// ============================================================

function badgePaiementCollecteur(ins) {
    var statut = ins.statut_paiement || 'non_paye';
    if (statut === 'confirme') {
        return '<div class="paiement-cell"><span class="badge-paye badge-paiement-collecteur">Payé</span>'
            + '<button class="btn-paiement-action btn-retrograder" onclick="changerStatutPaiement(' + ins.id + ', \'non_paye\')" title="Annuler la confirmation"><i class="fa-solid fa-rotate-left"></i></button></div>';
    }
    if (statut === 'declare') {
        return '<div class="paiement-cell"><span class="badge-declare badge-paiement-collecteur">Déclaré</span>'
            + '<button class="btn-paiement-action btn-confirmer-paiement" onclick="changerStatutPaiement(' + ins.id + ', \'confirme\')" title="Confirmer le paiement"><i class="fa-solid fa-check"></i></button>'
            + '<button class="btn-paiement-action btn-retrograder" onclick="changerStatutPaiement(' + ins.id + ', \'non_paye\')" title="Refuser"><i class="fa-solid fa-xmark"></i></button></div>';
    }
    // non_paye
    return '<div class="paiement-cell"><span class="badge-non-paye badge-paiement-collecteur">Non payé</span>'
        + '<button class="btn-paiement-action btn-confirmer-paiement" onclick="changerStatutPaiement(' + ins.id + ', \'confirme\')" title="Confirmer le paiement"><i class="fa-solid fa-check"></i></button></div>';
}

function badgePaiementEnvoi(statut) {
    statut = statut || 'non_paye';
    if (statut === 'confirme') return '<span class="badge-paye">Payé</span>';
    if (statut === 'declare') return '<span class="badge-declare">Déclaré</span>';
    return '<span class="badge-non-paye">Non payé</span>';
}

function changerStatutPaiement(inscriptionId, nouveauStatut) {
    supabaseFetch('/rest/v1/inscriptions?id=eq.' + inscriptionId, {
        method: 'PATCH',
        body: JSON.stringify({ statut_paiement: nouveauStatut })
    })
    .then(function() {
        for (var i = 0; i < currentInscriptions.length; i++) {
            if (currentInscriptions[i].id === inscriptionId) {
                currentInscriptions[i].statut_paiement = nouveauStatut;
                break;
            }
        }
        renderCollecteDetail(currentBilletId, currentInscriptions);
    })
    .catch(function(error) {
        console.error('Erreur changement statut paiement:', error);
        showToast('Erreur lors du changement de statut', 'error');
    });
}

// marquerEnvoye conservée pour rétrocompatibilité (ancien système)
function marquerEnvoye(inscriptionId) {
    supabaseFetch('/rest/v1/inscriptions?id=eq.' + inscriptionId, {
        method: 'PATCH',
        body: JSON.stringify({ envoye: true, statut_livraison: 'expedie' })
    })
    .then(function() {
        showToast('Marqué comme envoyé');
        loadEnveloppes();
    })
    .catch(function(error) {
        console.error('Erreur marquage envoyé:', error);
        showToast('Erreur', 'error');
    });
}

// ============================================================
// 9c. VUE TRANSVERSALE — VERIFICATION PAIEMENT
// ============================================================

function loadVerificationPaiement() {
    if (!monCollecteur || mesBillets.length === 0) {
        renderPaiementsVide();
        return;
    }
    var billetIds = mesBillets.map(function(b) { return b.id; });
    supabaseFetch('/rest/v1/inscriptions?billet_id=in.(' + billetIds.join(',') + ')&statut_paiement=in.(non_paye,declare)&pas_interesse=eq.false&select=*&order=membre_email.asc')
        .then(function(inscriptions) {
            if (!inscriptions || inscriptions.length === 0) {
                renderPaiementsVide();
                return;
            }
            var emails = [];
            inscriptions.forEach(function(ins) {
                if (ins.membre_email && emails.indexOf(ins.membre_email) === -1) emails.push(ins.membre_email);
            });
            var emailFilter = emails.map(function(e) { return encodeURIComponent(e); }).join(',');
            return supabaseFetch('/rest/v1/membres?email=in.(' + emailFilter + ')&select=email,nom,prenom')
                .then(function(membres) {
                    var membresMap = {};
                    if (membres) {
                        membres.forEach(function(m) { membresMap[m.email] = m; });
                    }
                    inscriptions.forEach(function(ins) {
                        var membre = membresMap[ins.membre_email];
                        if (membre && ins.adresse_snapshot) {
                            if (!ins.adresse_snapshot.nom && membre.nom) ins.adresse_snapshot.nom = membre.nom;
                            if (!ins.adresse_snapshot.prenom && membre.prenom) ins.adresse_snapshot.prenom = membre.prenom;
                        }
                    });
                    var billetsMap = {};
                    mesBillets.forEach(function(b) { billetsMap[b.id] = b; });
                    renderVerificationPaiement(inscriptions, billetsMap);
                });
        })
        .catch(function(error) {
            console.error('Erreur chargement vérification paiement:', error);
        });
}

function renderVerificationPaiement(inscriptions, billetsMap) {
    var groupes = {};
    inscriptions.forEach(function(insc) {
        var key = insc.membre_email;
        if (!groupes[key]) {
            groupes[key] = {
                email: key,
                adresse: insc.adresse_snapshot || {},
                inscriptions: []
            };
        }
        groupes[key].inscriptions.push(insc);
    });

    var container = document.getElementById('paiements-view');
    if (!container) return;

    var totalEnAttente = 0;
    inscriptions.forEach(function(insc) {
        var billet = billetsMap[insc.billet_id] || {};
        var prix = parseFloat(billet.Prix || 0);
        var prixVariante = (billet.PrixVariante !== null && billet.PrixVariante !== undefined && billet.PrixVariante !== '') ? parseFloat(billet.PrixVariante) : prix;
        totalEnAttente += (prix * (insc.nb_normaux || 0)) + (prixVariante * (insc.nb_variantes || 0));
    });

    var html = '<div class="paiement-total-attente">En attente de paiement : <strong>' + totalEnAttente.toFixed(2) + ' €</strong></div>';
    var emails = Object.keys(groupes);
    // Tri par prénom puis nom
    emails.sort(function(a, b) {
        var ga = groupes[a].adresse || {}, gb = groupes[b].adresse || {};
        var pa = (ga.prenom || '').toLowerCase(), pb = (gb.prenom || '').toLowerCase();
        if (pa < pb) return -1; if (pa > pb) return 1;
        var na = (ga.nom || '').toLowerCase(), nb = (gb.nom || '').toLowerCase();
        if (na < nb) return -1; if (na > nb) return 1;
        return 0;
    });
    for (var g = 0; g < emails.length; g++) {
        var email = emails[g];
        var groupe = groupes[email];
        var adr = groupe.adresse;
        var nom = ((adr.prenom || '') + ' ' + (adr.nom || '')).trim() || email;

        var lignes = '';
        for (var l = 0; l < groupe.inscriptions.length; l++) {
            var insc = groupe.inscriptions[l];
            var billet = billetsMap[insc.billet_id] || {};
            var prix = parseFloat(billet.Prix || 0);
            var prixVariante = (billet.PrixVariante !== null && billet.PrixVariante !== undefined && billet.PrixVariante !== '') ? parseFloat(billet.PrixVariante) : prix;
            var montant = ((prix * (insc.nb_normaux || 0)) + (prixVariante * (insc.nb_variantes || 0))).toFixed(2);
            var payRefParts = [];
            if (billet.Reference) payRefParts.push(billet.Reference);
            var payMilVersion = '';
            if (billet.Millesime) payMilVersion += billet.Millesime;
            if (billet.Version) payMilVersion += '-' + billet.Version;
            if (payMilVersion) payRefParts.push(payMilVersion);
            var payRefPrefix = payRefParts.length > 0 ? payRefParts.join(' - ') + ' ' : '';
            var payDateStr = '';
            if (insc.date_inscription) {
                var payDate = new Date(insc.date_inscription);
                payDateStr = ' (' + payDate.toLocaleDateString('fr-FR') + ')';
            }
            lignes += '<div class="envoi-ligne">'
                + '<span class="envoi-billet">' + payRefPrefix + (billet.NomBillet || '?') + payDateStr + '</span>'
                + '<span class="envoi-montant">' + montant + ' €</span>'
                + badgePaiementEnvoi(insc.statut_paiement)
                + '<button onclick="validerPaiementVue(' + insc.id + ')" class="btn-marquer-envoye" title="Confirmer le paiement"><i class="fa-solid fa-check"></i></button>'
                + '</div>';
        }

        html += '<div class="envoi-groupe">'
            + '<div class="envoi-groupe-header">'
            + '<strong>' + nom + '</strong>'
            + '<span class="envoi-count">' + groupe.inscriptions.length + ' billet(s)</span>'
            + '</div>'
            + '<div class="envoi-groupe-lignes">' + lignes + '</div>'
            + '</div>';
    }

    container.innerHTML = html;
}

function validerPaiementVue(inscriptionId) {
    supabaseFetch('/rest/v1/inscriptions?id=eq.' + inscriptionId, {
        method: 'PATCH',
        body: JSON.stringify({ statut_paiement: 'confirme' })
    })
    .then(function() {
        showToast('Paiement confirmé');
        loadVerificationPaiement();
    })
    .catch(function(error) {
        console.error('Erreur confirmation paiement:', error);
        showToast('Erreur', 'error');
    });
}

function renderPaiementsVide() {
    var container = document.getElementById('paiements-view');
    if (container) {
        container.innerHTML = '<div class="envois-empty"><i class="fa-solid fa-check-circle"></i><p>Tous les paiements sont vérifiés !</p></div>';
    }
}

// ============================================================
// 10. RELANCE IMPAYÉS (Story 5.8)
// ============================================================

function ouvrirRelance(billetId) {
    var billet = null;
    for (var i = 0; i < mesBillets.length; i++) {
        if (mesBillets[i].id === billetId) {
            billet = mesBillets[i];
            break;
        }
    }
    if (!billet) return;

    supabaseFetch('/rest/v1/inscriptions?billet_id=eq.' + billetId + '&statut_paiement=neq.confirme&pas_interesse=eq.false&select=*')
        .then(function(impayes) {
            if (!impayes || impayes.length === 0) {
                showToast('Aucun impayé à relancer');
                return;
            }
            // Enrichir avec noms des membres
            var emails = [];
            impayes.forEach(function(ins) {
                if (ins.membre_email && emails.indexOf(ins.membre_email) === -1) emails.push(ins.membre_email);
            });
            if (emails.length === 0) {
                renderRelanceModal(billet, impayes);
                return;
            }
            var emailFilter = emails.map(function(e) { return encodeURIComponent(e); }).join(',');
            return supabaseFetch('/rest/v1/membres?email=in.(' + emailFilter + ')&select=email,nom,prenom')
                .then(function(membres) {
                    var membresMap = {};
                    if (membres) {
                        membres.forEach(function(m) { membresMap[m.email] = m; });
                    }
                    impayes.forEach(function(ins) {
                        var membre = membresMap[ins.membre_email];
                        if (membre && ins.adresse_snapshot) {
                            if (!ins.adresse_snapshot.nom && membre.nom) ins.adresse_snapshot.nom = membre.nom;
                            if (!ins.adresse_snapshot.prenom && membre.prenom) ins.adresse_snapshot.prenom = membre.prenom;
                        }
                    });
                    renderRelanceModal(billet, impayes);
                });
        })
        .catch(function(error) {
            console.error('Erreur chargement impayés:', error);
            showToast('Erreur lors du chargement des impayés', 'error');
        });
}

function renderRelanceModal(billet, impayes) {
    var prix = parseFloat(billet.Prix || 0);
    var prixVar = (billet.PrixVariante !== null && billet.PrixVariante !== undefined && billet.PrixVariante !== '') ? parseFloat(billet.PrixVariante) : prix;
    var paypalInfo = '';
    if (monCollecteur.paypal_me) {
        paypalInfo = 'https://paypal.me/' + monCollecteur.paypal_me;
    } else if (monCollecteur.paypal_email) {
        paypalInfo = monCollecteur.paypal_email;
    }

    var messagesHtml = impayes.map(function(insc, idx) {
        var adr = insc.adresse_snapshot || {};
        var prenom = adr.prenom || insc.membre_email;
        var montant = (prix * (insc.nb_normaux || 0)) + (prixVar * (insc.nb_variantes || 0));
        var objet = 'Relance paiement — ' + (billet.NomBillet || 'Collecte');

        var relVne = billet.VersionNormaleExiste !== false;
        var corps = 'Bonjour ' + prenom + ',\n\n'
            + 'Je me permets de vous relancer concernant votre inscription à la collecte "' + (billet.NomBillet || '') + '".\n\n'
            + 'Détails :\n'
            + (relVne ? '- Billets normaux : ' + (insc.nb_normaux || 0) + '\n' : '')
            + (insc.nb_variantes > 0 ? '- Billets variantes : ' + insc.nb_variantes + '\n' : '')
            + '- Montant dû : ' + montant.toFixed(2) + ' €\n'
            + '- Mode d\'envoi : ' + (insc.mode_envoi || 'Normal') + '\n'
            + (insc.mode_envoi && insc.mode_envoi !== 'Normal' ? '- Des frais de port supplémentaires peuvent s\'appliquer.\n' : '')
            + '\n';

        if (insc.mode_paiement === 'PayPal' && paypalInfo) {
            corps += 'Vous pouvez effectuer le paiement via PayPal :\n' + paypalInfo + '/' + montant.toFixed(2) + '\n\n';
        }

        corps += 'Merci d\'avance,\n' + (monCollecteur.alias || 'Le collecteur');

        var mailto = 'mailto:' + insc.membre_email
            + '?subject=' + encodeURIComponent(objet)
            + '&body=' + encodeURIComponent(corps);

        return '<div class="relance-message" id="relance-msg-' + idx + '">'
            + '<div class="relance-header">'
            + '<strong>' + prenom + '</strong> (' + insc.membre_email + ')'
            + ' — ' + montant.toFixed(2) + ' €'
            + '</div>'
            + '<textarea class="relance-texte" id="relance-texte-' + idx + '" rows="8" readonly>' + corps + '</textarea>'
            + '<div class="relance-actions">'
            + '<button onclick="copierRelance(' + idx + ')" class="btn-copier"><i class="fa-solid fa-copy"></i> Copier</button>'
            + '<a href="' + mailto + '" class="btn-mailto"><i class="fa-solid fa-envelope"></i> Envoyer par email</a>'
            + '</div>'
            + '</div>';
    }).join('');

    var modal = document.getElementById('relance-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'relance-modal';
        modal.className = 'relance-modal-overlay';
        document.body.appendChild(modal);
    }
    modal.innerHTML = '<div class="relance-modal-content">'
        + '<div class="relance-modal-header">'
        + '<h2><i class="fa-solid fa-envelope"></i> Relance impayés — ' + (billet.NomBillet || '') + '</h2>'
        + '<button onclick="fermerRelance()" class="relance-close"><i class="fa-solid fa-times"></i></button>'
        + '</div>'
        + '<p class="relance-count">' + impayes.length + ' membre(s) à relancer</p>'
        + messagesHtml
        + '</div>';
    modal.style.display = '';
}

function copierRelance(idx) {
    var textarea = document.getElementById('relance-texte-' + idx);
    if (!textarea) return;
    var text = textarea.value;
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text)
            .then(function() { showToast('Message copié !'); })
            .catch(function() { fallbackCopy(textarea); });
    } else {
        fallbackCopy(textarea);
    }
}

function fallbackCopy(textarea) {
    textarea.removeAttribute('readonly');
    textarea.select();
    document.execCommand('copy');
    textarea.setAttribute('readonly', 'readonly');
    showToast('Message copié !');
}

function fermerRelance() {
    var modal = document.getElementById('relance-modal');
    if (modal) modal.style.display = 'none';
}

// ============================================================
// STORY 9.5 — EXPORT CSV DES INSCRIPTIONS
// ============================================================

function escapeCSV(val) {
    var s = String(val == null ? '' : val);
    if (s.indexOf(';') >= 0 || s.indexOf('"') >= 0 || s.indexOf('\n') >= 0 || s.indexOf('\r') >= 0) {
        return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
}

function exporterCSV(billetId) {
    if (!currentInscriptions || !currentBillet) return;

    // Filtrer les inscriptions actives (pas_interesse = false)
    var inscActives = currentInscriptions.filter(function(i) { return !i.pas_interesse; });
    if (inscActives.length === 0) {
        showToast('Aucune inscription à exporter', 'error');
        return;
    }

    var inclureVariantes = currentBillet.HasVariante && currentBillet.HasVariante !== 'N';
    var csvVne = currentBillet.VersionNormaleExiste !== false;

    // En-têtes
    var headers = ['Nom', 'Prénom', 'Adresse', 'Code postal', 'Ville', 'Pays', 'Type de paiement', 'Type d\'envoi'];
    if (csvVne) headers.push('Nb billets normaux');
    if (inclureVariantes) headers.push('Nb billets variantes');

    // Lignes de données
    var lines = inscActives.map(function(ins) {
        var adr = ins.adresse_snapshot || {};
        var row = [
            escapeCSV(adr.nom),
            escapeCSV(adr.prenom),
            escapeCSV(adr.rue),
            escapeCSV(adr.code_postal),
            escapeCSV(adr.ville),
            escapeCSV(adr.pays),
            escapeCSV(ins.mode_paiement),
            escapeCSV(ins.mode_envoi)
        ];
        if (csvVne) row.push(ins.nb_normaux || 0);
        if (inclureVariantes) row.push(ins.nb_variantes || 0);
        return row.join(';');
    });

    // Assemblage CSV avec BOM UTF-8
    var csvContent = '\uFEFF' + headers.join(';') + '\r\n' + lines.join('\r\n');

    // Nom de fichier
    var nomBillet = (currentBillet.NomBillet || 'export').replace(/[^a-zA-Z0-9àâäéèêëïîôùûüçÀÂÄÉÈÊËÏÎÔÙÛÜÇ\s-]/g, '').replace(/\s+/g, '_');
    var today = new Date().toISOString().split('T')[0];
    var nomFichier = 'Collecte_' + nomBillet + '_' + today + '.csv';

    // Téléchargement
    var blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', nomFichier);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast('Export CSV téléchargé !');
}

// ============================================================
// 11. ATTENUER UNE COLLECTE
// ============================================================
function toggleAttenuee(billetId, newValue) {
    supabaseFetch('/rest/v1/billets?id=eq.' + billetId, {
        method: 'PATCH',
        body: JSON.stringify({ attenuee: newValue })
    })
    .then(function() {
        for (var i = 0; i < mesBillets.length; i++) {
            if (mesBillets[i].id === billetId) {
                mesBillets[i].attenuee = newValue;
                break;
            }
        }
        renderCollectesList();
    })
    .catch(function(error) {
        console.error('Erreur atténuation:', error);
        showToast('Erreur lors de la modification', 'error');
    });
}

// ============================================================
// 12. INSCRIRE UN MEMBRE (ajout par le collecteur)
// ============================================================

var membresCache = null;

function chargerMembres() {
    if (membresCache) return Promise.resolve(membresCache);
    return supabaseFetch('/rest/v1/membres?select=email,nom,prenom,rue,code_postal,ville,pays&order=nom.asc')
        .then(function(data) {
            membresCache = data || [];
            return membresCache;
        });
}

function ouvrirModalInscription() {
    if (!currentBillet) return;
    chargerMembres().then(function(membres) {
        renderInscriptionModal(membres, null);
    }).catch(function(error) {
        console.error('Erreur chargement membres:', error);
        showToast('Erreur lors du chargement des membres', 'error');
    });
}

function renderInscriptionModal(membres, editInscription) {
    var modal = document.getElementById('inscription-modal');
    if (!modal) return;

    var isEdit = !!editInscription;
    var titre = isEdit ? 'Modifier l\'inscription' : 'Inscrire un membre';
    var billet = currentBillet;
    var varianteActive = billet.HasVariante && billet.HasVariante !== 'N';
    var vne = billet.VersionNormaleExiste !== false;

    // Valeurs par défaut ou valeurs existantes
    var defEmail = isEdit ? editInscription.membre_email : '';
    var defNormaux = isEdit ? (editInscription.nb_normaux || 0) : (varianteActive && vne ? 0 : (vne ? 1 : 0));
    var defVariantes = isEdit ? (editInscription.nb_variantes || 0) : (!vne ? 1 : 0);
    var defPaiement = isEdit ? (editInscription.mode_paiement || 'PayPal') : 'PayPal';
    var defEnvoi = isEdit ? (editInscription.mode_envoi || 'Normal') : 'Normal';
    var defCommentaire = isEdit ? (editInscription.commentaire || '') : '';

    // Filtrer les membres déjà inscrits (sauf en mode edit)
    var emailsInscrits = {};
    if (!isEdit) {
        currentInscriptions.forEach(function(ins) {
            emailsInscrits[ins.membre_email] = true;
        });
    }

    // Construire la liste des options membres
    var optionsMembres = '<option value="">— Sélectionner un membre —</option>';
    membres.forEach(function(m) {
        if (!isEdit && emailsInscrits[m.email]) return;
        var label = ((m.prenom || '') + ' ' + (m.nom || '')).trim() || m.email;
        var selected = (m.email === defEmail) ? ' selected' : '';
        optionsMembres += '<option value="' + m.email + '"' + selected + '>' + label + ' (' + m.email + ')</option>';
    });

    var html = '<div class="relance-modal-content">'
        + '<div class="relance-modal-header">'
        + '<h2><i class="fa-solid fa-user-plus"></i> ' + titre + '</h2>'
        + '<button onclick="fermerModalInscription()" class="relance-close"><i class="fa-solid fa-times"></i></button>'
        + '</div>';

    html += '<div class="inscription-form-collecteur">';

    // Sélecteur de membre
    if (isEdit) {
        var snap = editInscription.adresse_snapshot || {};
        var nomAffiche = ((snap.prenom || '') + ' ' + (snap.nom || '')).trim() || defEmail;
        html += '<div class="insc-form-field"><label>Membre</label><span class="insc-form-readonly">' + nomAffiche + '</span></div>';
    } else {
        html += '<div class="insc-form-field"><label>Membre</label>'
            + '<input type="text" id="insc-membre-search" placeholder="Rechercher un membre..." oninput="filtrerMembresModal()" autocomplete="off">'
            + '<select id="insc-membre-email" size="5" class="insc-membre-select">' + optionsMembres + '</select>'
            + '</div>';
    }

    // Champs quantités
    if (vne) {
        html += '<div class="insc-form-field"><label>Nb normaux</label><input type="number" id="insc-nb-normaux" value="' + defNormaux + '" min="0"></div>';
    }
    if (varianteActive) {
        html += '<div class="insc-form-field"><label>Nb variantes</label><input type="number" id="insc-nb-variantes" value="' + defVariantes + '" min="0"></div>';
    }

    // Mode paiement et envoi
    html += '<div class="insc-form-field"><label>Paiement</label><select id="insc-paiement">'
        + '<option value="PayPal"' + (defPaiement === 'PayPal' ? ' selected' : '') + '>PayPal</option>'
        + '<option value="Chèque"' + (defPaiement === 'Chèque' ? ' selected' : '') + '>Chèque</option>'
        + '</select></div>';

    html += '<div class="insc-form-field"><label>Envoi</label><select id="insc-envoi">'
        + '<option value="Normal"' + (defEnvoi === 'Normal' ? ' selected' : '') + '>Normal</option>'
        + '<option value="Suivi"' + (defEnvoi === 'Suivi' ? ' selected' : '') + '>Suivi</option>'
        + '<option value="Recommandé"' + (defEnvoi === 'Recommandé' ? ' selected' : '') + '>Recommandé</option>'
        + '</select></div>';

    // Commentaire
    html += '<div class="insc-form-field"><label>Commentaire</label><textarea id="insc-commentaire" rows="2">' + defCommentaire + '</textarea></div>';

    // Boutons
    html += '<div class="insc-form-actions">';
    if (isEdit) {
        html += '<button onclick="soumettreModificationInscription(' + editInscription.id + ')" class="btn-confirmer-inscription-coll"><i class="fa-solid fa-check"></i> Enregistrer</button>';
    } else {
        html += '<button onclick="soumettreNouvelleInscription()" class="btn-confirmer-inscription-coll"><i class="fa-solid fa-check"></i> Inscrire</button>';
    }
    html += '<button onclick="fermerModalInscription()" class="btn-annuler-inscription-coll">Annuler</button>';
    html += '</div>';

    html += '</div></div>';

    modal.innerHTML = html;
    modal.style.display = '';
}

function filtrerMembresModal() {
    var searchInput = document.getElementById('insc-membre-search');
    var selectEl = document.getElementById('insc-membre-email');
    if (!searchInput || !selectEl || !membresCache) return;

    var terme = searchInput.value.toLowerCase().trim();
    var emailsInscrits = {};
    currentInscriptions.forEach(function(ins) {
        emailsInscrits[ins.membre_email] = true;
    });

    var html = '<option value="">— Sélectionner un membre —</option>';
    membresCache.forEach(function(m) {
        if (emailsInscrits[m.email]) return;
        var label = ((m.prenom || '') + ' ' + (m.nom || '')).trim() || m.email;
        var searchable = (label + ' ' + m.email).toLowerCase();
        if (terme && searchable.indexOf(terme) === -1) return;
        html += '<option value="' + m.email + '">' + label + ' (' + m.email + ')</option>';
    });
    selectEl.innerHTML = html;
}

function fermerModalInscription() {
    var modal = document.getElementById('inscription-modal');
    if (modal) modal.style.display = 'none';
}

function soumettreNouvelleInscription() {
    var selectEl = document.getElementById('insc-membre-email');
    if (!selectEl || !selectEl.value) {
        showToast('Veuillez sélectionner un membre', 'error');
        return;
    }
    var email = selectEl.value;

    var normauxEl = document.getElementById('insc-nb-normaux');
    var nbNormaux = normauxEl ? parseInt(normauxEl.value) || 0 : 0;
    var variantesEl = document.getElementById('insc-nb-variantes');
    var nbVariantes = variantesEl ? parseInt(variantesEl.value) || 0 : 0;

    if (nbNormaux + nbVariantes === 0) {
        showToast('Sélectionnez au moins un billet', 'error');
        return;
    }

    // Chercher l'adresse du membre dans le cache
    var membre = null;
    if (membresCache) {
        for (var i = 0; i < membresCache.length; i++) {
            if (membresCache[i].email === email) {
                membre = membresCache[i];
                break;
            }
        }
    }
    var adresseSnapshot = {};
    if (membre) {
        adresseSnapshot = {
            nom: membre.nom || '',
            prenom: membre.prenom || '',
            rue: membre.rue || '',
            code_postal: membre.code_postal || '',
            ville: membre.ville || '',
            pays: membre.pays || ''
        };
    }

    var body = {
        billet_id: currentBilletId,
        membre_email: email,
        nb_normaux: nbNormaux,
        nb_variantes: nbVariantes,
        mode_paiement: document.getElementById('insc-paiement').value,
        mode_envoi: document.getElementById('insc-envoi').value,
        commentaire: (document.getElementById('insc-commentaire').value || '').trim(),
        adresse_snapshot: adresseSnapshot,
        statut_paiement: 'non_paye',
        envoye: false,
        fdp_regles: false,
        pas_interesse: false
    };

    supabaseFetch('/rest/v1/inscriptions', {
        method: 'POST',
        body: JSON.stringify(body)
    })
    .then(function() {
        // Créer l'enveloppe en_cours si elle n'existe pas encore
        return creerEnveloppeSiAbsente(monCollecteur.alias, email);
    })
    .then(function() {
        showToast('Membre inscrit avec succès !');
        fermerModalInscription();
        openCollecteDetail(currentBilletId);
    })
    .catch(function(error) {
        console.error('Erreur inscription:', error);
        if (error.message && error.message.indexOf('unique') !== -1) {
            showToast('Ce membre est déjà inscrit à cette collecte', 'error');
        } else {
            showToast('Erreur lors de l\'inscription', 'error');
        }
    });
}

function creerEnveloppeSiAbsente(collecteurAlias, membreEmail) {
    return supabaseFetch('/rest/v1/enveloppes?collecteur_alias=eq.' + encodeURIComponent(collecteurAlias) + '&membre_email=eq.' + encodeURIComponent(membreEmail) + '&statut=eq.en_cours&select=id')
        .then(function(enveloppes) {
            if (enveloppes && enveloppes.length > 0) return; // Déjà existante
            return supabaseFetch('/rest/v1/enveloppes', {
                method: 'POST',
                body: JSON.stringify({
                    collecteur_alias: collecteurAlias,
                    membre_email: membreEmail,
                    statut: 'en_cours'
                })
            });
        });
}

// ============================================================
// 13. MODIFIER UNE INSCRIPTION (par le collecteur)
// ============================================================

function ouvrirModalModification(inscriptionId) {
    var inscription = null;
    for (var i = 0; i < currentInscriptions.length; i++) {
        if (currentInscriptions[i].id === inscriptionId) {
            inscription = currentInscriptions[i];
            break;
        }
    }
    if (!inscription) return;

    chargerMembres().then(function(membres) {
        renderInscriptionModal(membres, inscription);
    }).catch(function(error) {
        console.error('Erreur chargement membres:', error);
        showToast('Erreur lors du chargement', 'error');
    });
}

function soumettreModificationInscription(inscriptionId) {
    var normauxEl = document.getElementById('insc-nb-normaux');
    var nbNormaux = normauxEl ? parseInt(normauxEl.value) || 0 : 0;
    var variantesEl = document.getElementById('insc-nb-variantes');
    var nbVariantes = variantesEl ? parseInt(variantesEl.value) || 0 : 0;

    if (nbNormaux + nbVariantes === 0) {
        showToast('Sélectionnez au moins un billet', 'error');
        return;
    }

    var body = {
        nb_normaux: nbNormaux,
        nb_variantes: nbVariantes,
        mode_paiement: document.getElementById('insc-paiement').value,
        mode_envoi: document.getElementById('insc-envoi').value,
        commentaire: (document.getElementById('insc-commentaire').value || '').trim()
    };

    supabaseFetch('/rest/v1/inscriptions?id=eq.' + inscriptionId, {
        method: 'PATCH',
        body: JSON.stringify(body)
    })
    .then(function() {
        showToast('Inscription modifiée');
        fermerModalInscription();
        openCollecteDetail(currentBilletId);
    })
    .catch(function(error) {
        console.error('Erreur modification inscription:', error);
        showToast('Erreur lors de la modification', 'error');
    });
}
