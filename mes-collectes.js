// ============================================================
// mes-collectes.js — BilletsTouristiques Module collecteur
// Story 5.5
// ============================================================

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
    supabaseFetch('/rest/v1/billets?select=id,"NomBillet","Ville","Categorie","Collecteur","Prix","DateColl","DateFin","HasVariante","Date","Reference","Millesime","Version"&"Collecteur"=eq.' + encodeURIComponent(monCollecteur.alias) + '&order="Date".desc.nullslast')
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

        html += '<div class="collecte-card" onclick="openCollecteDetail(' + b.id + ')">';
        html += '<div class="collecte-card-header">';
        if (refPrefix) html += '<span class="collecte-ref">' + refPrefix + '</span>';
        html += '<h3>' + (b.NomBillet || '') + '</h3>';
        html += '<span class="collecte-status ' + statusClass + '">' + statusLabel + '</span>';
        html += '</div>';
        html += '<div class="collecte-card-info">';
        if (b.Prix) html += '<span><i class="fa-solid fa-euro-sign"></i> ' + b.Prix + '</span>';
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
    html += '<h2>' + ((billet && billet.NomBillet) || '') + '</h2>';
    if (billet && billet.Ville) html += '<span class="collecte-detail-ville"><i class="fa-solid fa-location-dot"></i> ' + billet.Ville + '</span>';
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
    html += '<span class="compteur-value">' + totalNormaux + ' normaux, ' + totalVariantes + ' variantes</span>';
    html += '</div>';
    html += '</div>';

    // Close button
    if (isOpen) {
        html += '<div class="collecte-actions-bar">';
        html += '<button class="btn-cloturer" onclick="cloturerCollecte(' + billetId + ')"><i class="fa-solid fa-lock"></i> Clôturer la collecte</button>';
        html += '</div>';
    }

    // Inscriptions table
    if (inscriptions.length === 0) {
        html += '<p class="collectes-empty"><i class="fa-solid fa-users-slash"></i> Aucun inscrit pour cette collecte.</p>';
    } else {
        html += '<div class="collecte-table-wrap">';
        html += '<table class="collecte-table">';
        html += '<thead><tr>';
        html += '<th>Nom / Prénom</th>';
        html += '<th>Adresse</th>';
        html += '<th>Normaux</th>';
        html += '<th>Variantes</th>';
        html += '<th>Paiement</th>';
        html += '<th>Envoi</th>';
        html += '<th>Montant</th>';
        html += '<th>Payé</th>';
        html += '<th>Envoyé</th>';
        html += '<th>FDP</th>';
        html += '<th>Actions</th>';
        html += '</tr></thead>';
        html += '<tbody>';

        for (var j = 0; j < inscriptions.length; j++) {
            var ins = inscriptions[j];
            var snap = ins.adresse_snapshot || {};
            var nomPrenom = ((snap.prenom || '') + ' ' + (snap.nom || '')).trim() || ins.membre_email;
            var adresse = formatAdresse(snap);
            var montant = (prix * ((ins.nb_normaux || 0) + (ins.nb_variantes || 0))).toFixed(2);
            var commentaire = ins.commentaire || '';

            html += '<tr>';
            html += '<td data-label="Nom">' + nomPrenom + '</td>';
            html += '<td data-label="Adresse" class="td-adresse">' + adresse + '</td>';
            html += '<td data-label="Normaux">' + (ins.nb_normaux || 0) + '</td>';
            html += '<td data-label="Variantes">' + (ins.nb_variantes || 0) + '</td>';
            html += '<td data-label="Paiement">' + (ins.mode_paiement || '') + '</td>';
            html += '<td data-label="Envoi">' + (ins.mode_envoi || '') + '</td>';
            html += '<td data-label="Montant">' + montant + ' €</td>';
            html += '<td data-label="Payé">' + badgePaiementCollecteur(ins) + '</td>';
            html += '<td data-label="Envoyé"><input type="checkbox" id="chk-envoye-' + ins.id + '" ' + (ins.envoye ? 'checked' : '') + ' onchange="toggleInscriptionField(' + ins.id + ', \'envoye\', this.checked)"></td>';
            html += '<td data-label="FDP"><input type="checkbox" id="chk-fdp_regles-' + ins.id + '" ' + (ins.fdp_regles ? 'checked' : '') + ' onchange="toggleInscriptionField(' + ins.id + ', \'fdp_regles\', this.checked)"></td>';
            html += '<td data-label="Actions"><button class="btn-desinscrire" onclick="desinscrireMembre(' + ins.id + ', \'' + nomPrenom.replace(/'/g, "\\'") + '\')"><i class="fa-solid fa-user-minus"></i></button></td>';
            html += '</tr>';

            if (commentaire) {
                html += '<tr class="tr-commentaire"><td colspan="11"><i class="fa-solid fa-comment"></i> ' + commentaire + '</td></tr>';
            }
        }

        html += '</tbody></table>';
        html += '</div>';
    }

    container.innerHTML = html;
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
    if (compteurs.length >= 2) compteurs[1].textContent = totalNormaux + ' normaux, ' + totalVariantes + ' variantes';

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
// 9. VUE TRANSVERSALE — PREPARATION ENVOIS (Story 5.7)
// ============================================================

function showTab(tabName) {
    var collectesView = document.getElementById('collectes-list');
    var envoisView = document.getElementById('envois-view');
    var detailView = document.getElementById('collecte-detail');
    var tabs = document.querySelectorAll('.tab-btn');

    for (var i = 0; i < tabs.length; i++) {
        tabs[i].classList.remove('active');
    }

    if (tabName === 'envois') {
        if (collectesView) collectesView.style.display = 'none';
        if (detailView) detailView.style.display = 'none';
        if (envoisView) envoisView.style.display = '';
        if (tabs[1]) tabs[1].classList.add('active');
        loadPreparationEnvois();
    } else {
        if (collectesView) collectesView.style.display = '';
        if (envoisView) envoisView.style.display = 'none';
        if (tabs[0]) tabs[0].classList.add('active');
    }
}

function loadPreparationEnvois() {
    if (!monCollecteur || mesBillets.length === 0) {
        renderEnvoisVide();
        return;
    }
    // Récupérer les inscriptions via les billet_ids du collecteur (pas via collecteur_alias)
    var billetIds = mesBillets.map(function(b) { return b.id; });
    supabaseFetch('/rest/v1/inscriptions?billet_id=in.(' + billetIds.join(',') + ')&envoye=eq.false&pas_interesse=eq.false&select=*&order=membre_email.asc')
        .then(function(inscriptions) {
            if (!inscriptions || inscriptions.length === 0) {
                renderEnvoisVide();
                return;
            }
            // Enrichir les snapshots avec les noms actuels des membres
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
                    renderPreparationEnvois(inscriptions, billetsMap);
                });
        })
        .catch(function(error) {
            console.error('Erreur chargement envois:', error);
        });
}

function renderPreparationEnvois(inscriptions, billetsMap) {
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

    var container = document.getElementById('envois-view');
    if (!container) return;

    var html = '';
    var emails = Object.keys(groupes);
    for (var g = 0; g < emails.length; g++) {
        var email = emails[g];
        var groupe = groupes[email];
        var adr = groupe.adresse;
        var nom = ((adr.prenom || '') + ' ' + (adr.nom || '')).trim() || email;
        var adresseStr = [adr.rue, adr.code_postal, adr.ville, adr.pays].filter(Boolean).join(', ');

        var lignes = '';
        for (var l = 0; l < groupe.inscriptions.length; l++) {
            var insc = groupe.inscriptions[l];
            var billet = billetsMap[insc.billet_id] || {};
            lignes += '<div class="envoi-ligne">'
                + '<span class="envoi-billet">' + (billet.NomBillet || '?') + '</span>'
                + '<span class="envoi-qty">N:' + (insc.nb_normaux || 0) + (insc.nb_variantes > 0 ? ' V:' + insc.nb_variantes : '') + '</span>'
                + badgePaiementEnvoi(insc.statut_paiement)
                + '<span class="badge-' + (insc.fdp_regles ? 'paye' : 'non-paye') + '">' + (insc.fdp_regles ? 'FDP OK' : 'FDP —') + '</span>'
                + '<button onclick="marquerEnvoye(' + insc.id + ')" class="btn-marquer-envoye" title="Marquer envoyé"><i class="fa-solid fa-check"></i></button>'
                + '</div>';
        }

        html += '<div class="envoi-groupe">'
            + '<div class="envoi-groupe-header">'
            + '<strong>' + nom + '</strong>'
            + '<span class="envoi-adresse">' + (adresseStr || 'Adresse non renseignée') + '</span>'
            + '<span class="envoi-count">' + groupe.inscriptions.length + ' billet(s)</span>'
            + '</div>'
            + '<div class="envoi-groupe-lignes">' + lignes + '</div>'
            + '</div>';
    }

    container.innerHTML = html;
}

// ============================================================
// 9b. GESTION STATUT PAIEMENT COLLECTEUR
// ============================================================

function badgePaiementCollecteur(ins) {
    var statut = ins.statut_paiement || 'non_paye';
    if (statut === 'confirme') {
        return '<span class="badge-paye badge-paiement-collecteur">Payé</span>'
            + '<button class="btn-paiement-action btn-retrograder" onclick="changerStatutPaiement(' + ins.id + ', \'non_paye\')" title="Annuler la confirmation"><i class="fa-solid fa-rotate-left"></i></button>';
    }
    if (statut === 'declare') {
        return '<span class="badge-declare badge-paiement-collecteur">Déclaré</span>'
            + '<button class="btn-paiement-action btn-confirmer-paiement" onclick="changerStatutPaiement(' + ins.id + ', \'confirme\')" title="Confirmer le paiement"><i class="fa-solid fa-check"></i></button>'
            + '<button class="btn-paiement-action btn-retrograder" onclick="changerStatutPaiement(' + ins.id + ', \'non_paye\')" title="Refuser"><i class="fa-solid fa-xmark"></i></button>';
    }
    // non_paye
    return '<span class="badge-non-paye badge-paiement-collecteur">Non payé</span>'
        + '<button class="btn-paiement-action btn-confirmer-paiement" onclick="changerStatutPaiement(' + ins.id + ', \'confirme\')" title="Confirmer le paiement"><i class="fa-solid fa-check"></i></button>';
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

function marquerEnvoye(inscriptionId) {
    supabaseFetch('/rest/v1/inscriptions?id=eq.' + inscriptionId, {
        method: 'PATCH',
        body: JSON.stringify({ envoye: true })
    })
    .then(function() {
        showToast('Marqué comme envoyé');
        loadPreparationEnvois();
    })
    .catch(function(error) {
        console.error('Erreur marquage envoyé:', error);
        showToast('Erreur', 'error');
    });
}

function renderEnvoisVide() {
    var container = document.getElementById('envois-view');
    if (container) {
        container.innerHTML = '<div class="envois-empty"><i class="fa-solid fa-check-circle"></i><p>Tous les envois sont à jour !</p></div>';
    }
}
