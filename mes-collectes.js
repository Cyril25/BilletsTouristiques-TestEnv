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
    supabaseFetch('/rest/v1/billets?select=id,"NomBillet","Ville","Categorie","Collecteur","Prix","PrixVariante","DateColl","DateFin","HasVariante","VersionNormaleExiste","Date","Reference","Millesime","Version",attenuee&"Collecteur"=eq.' + encodeURIComponent(monCollecteur.alias) + '&order="Date".desc.nullslast')
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
        if (refPrefix) html += '<span class="collecte-ref">' + refPrefix + '</span>';
        html += '<h3>' + (b.NomBillet || '') + '</h3>';
        html += '<span class="collecte-status ' + statusClass + '">' + statusLabel + '</span>';
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

    // Inscriptions table
    if (inscriptions.length === 0) {
        html += '<p class="collectes-empty"><i class="fa-solid fa-users-slash"></i> Aucun inscrit pour cette collecte.</p>';
    } else {
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
            var montant = ((prix * (ins.nb_normaux || 0)) + (prixVariante * (ins.nb_variantes || 0))).toFixed(2);
            var commentaire = ins.commentaire || '';

            html += '<tr>';
            html += '<td data-label="Nom">' + nomPrenom + '</td>';
            html += '<td data-label="Adresse" class="td-adresse">' + adresse + '</td>';
            if (vne) html += '<td data-label="Normaux">' + (ins.nb_normaux || 0) + '</td>';
            html += '<td data-label="Variantes">' + (ins.nb_variantes || 0) + '</td>';
            html += '<td data-label="Paiement">' + (ins.mode_paiement || '') + '</td>';
            html += '<td data-label="Envoi">' + (ins.mode_envoi || '') + '</td>';
            html += '<td data-label="Montant">' + montant + ' €</td>';
            html += '<td data-label="Payé">' + badgePaiementCollecteur(ins) + '</td>';
            html += '<td data-label="Envoyé"><input type="checkbox" id="chk-envoye-' + ins.id + '" ' + (ins.envoye ? 'checked' : '') + ' onchange="toggleInscriptionField(' + ins.id + ', \'envoye\', this.checked)"></td>';
            html += '<td data-label="FDP"><input type="checkbox" id="chk-fdp_regles-' + ins.id + '" ' + (ins.fdp_regles ? 'checked' : '') + ' onchange="toggleInscriptionField(' + ins.id + ', \'fdp_regles\', this.checked)"></td>';
            html += '<td data-label="Actions">'
                + '<button class="btn-modifier-inscription" onclick="ouvrirModalModification(' + ins.id + ')" title="Modifier l\'inscription"><i class="fa-solid fa-pen"></i></button>'
                + '<button class="btn-desinscrire" onclick="desinscrireMembre(' + ins.id + ', \'' + nomPrenom.replace(/'/g, "\\'") + '\')"><i class="fa-solid fa-user-minus"></i></button>'
                + '</td>';
            html += '</tr>';

            if (commentaire) {
                html += '<tr class="tr-commentaire"><td colspan="' + (vne ? 11 : 10) + '"><i class="fa-solid fa-comment"></i> ' + commentaire + '</td></tr>';
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
// 9. VUE TRANSVERSALE — PREPARATION ENVOIS (Story 5.7)
// ============================================================

function showTab(tabName) {
    var collectesView = document.getElementById('collectes-list');
    var envoisView = document.getElementById('envois-view');
    var paiementsView = document.getElementById('paiements-view');
    var detailView = document.getElementById('collecte-detail');
    var tabs = document.querySelectorAll('.tab-btn');

    for (var i = 0; i < tabs.length; i++) {
        tabs[i].classList.remove('active');
    }

    // Hide all views
    if (collectesView) collectesView.style.display = 'none';
    if (envoisView) envoisView.style.display = 'none';
    if (paiementsView) paiementsView.style.display = 'none';
    if (detailView) detailView.style.display = 'none';

    if (tabName === 'paiements') {
        if (paiementsView) paiementsView.style.display = '';
        if (tabs[1]) tabs[1].classList.add('active');
        loadVerificationPaiement();
    } else if (tabName === 'envois') {
        if (envoisView) envoisView.style.display = '';
        if (tabs[2]) tabs[2].classList.add('active');
        loadPreparationEnvois();
    } else {
        if (collectesView) collectesView.style.display = '';
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
            var envVne = billet.VersionNormaleExiste !== false;
            var envQty = envVne ? 'N:' + (insc.nb_normaux || 0) + (insc.nb_variantes > 0 ? ' V:' + insc.nb_variantes : '') : 'V:' + (insc.nb_variantes || 0);
            lignes += '<div class="envoi-ligne">'
                + '<span class="envoi-billet">' + (billet.NomBillet || '?') + '</span>'
                + '<span class="envoi-qty">' + envQty + '</span>'
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

    var html = '';
    var emails = Object.keys(groupes);
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
            lignes += '<div class="envoi-ligne">'
                + '<span class="envoi-billet">' + (billet.NomBillet || '?') + '</span>'
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
