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
var fraisPortCollecte = [];
var verifPaiementData = null;
var currentCollecteSupp = null;       // Story 12.5 — collecte supplémentaire en consultation
var mesCollectesSupp = [];            // Story 12.5 — [{collecte, billet}, ...]
var mesInscriptionsParCollecte = {};  // Story 12.5 — {collecte_id: {total, confirmes, envoyes}}

function findFdpPriceCollecte(nbBillets, destination, typeEnvoi) {
    for (var i = 0; i < fraisPortCollecte.length; i++) {
        var r = fraisPortCollecte[i];
        if (r.destination === destination && r.type_envoi === typeEnvoi &&
            nbBillets >= r.qte_min && nbBillets <= r.qte_max) {
            return parseFloat(r.prix);
        }
    }
    return 0;
}

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
    var email = window.getActiveEmail();
    supabaseFetch('/rest/v1/collecteurs?email_membre=eq.' + encodeURIComponent(email) + '&select=*')
        .then(function(data) {
            if (!data || data.length === 0) {
                document.getElementById('collecteur-check').innerHTML =
                    '<p class="collecteur-not-found"><i class="fa-solid fa-circle-exclamation"></i> Vous n\'êtes pas enregistré comme collecteur.</p>';
                return;
            }
            monCollecteur = data[0];
            loadMesCollectes();
            loadBlacklistCache();
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
    supabaseFetch('/rest/v1/billets?select=id,"NomBillet","Ville","Categorie","Collecteur","Prix","PrixVariante","DateColl","DateFin","HasVariante","VersionNormaleExiste","Date","Reference","Millesime","Version",attenuee,"PayerFDP","LinkSheet"&"Collecteur"=eq.' + encodeURIComponent(monCollecteur.alias) + '&order="Date".desc.nullslast')
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
            return supabaseFetch('/rest/v1/inscriptions?billet_id=in.(' + billetIds.join(',') + ')&collecte_id=is.null&pas_interesse=eq.false&select=billet_id,statut_paiement,envoye');
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
            loadMesCollectesSupplementaires();
        })
        .catch(function(error) {
            console.error('Erreur chargement collectes:', error);
            showToast('Erreur lors du chargement des collectes', 'error');
        });
}

// #14 — Onboarding collecteur
function getOnboardingHtml() {
    var key = 'bt_onboarding_collecteur_dismissed';
    if (localStorage.getItem(key)) return '';

    var html = '<div class="onboarding-banner" id="onboarding-collecteur">'
        + '<button class="onboarding-close" onclick="dismissOnboarding()" aria-label="Fermer"><i class="fa-solid fa-xmark"></i></button>'
        + '<h3 class="onboarding-title"><i class="fa-solid fa-hand-wave"></i> Bienvenue sur votre espace collecteur !</h3>'
        + '<p class="onboarding-subtitle">Voici comment ça se passe, en 4 étapes simples :</p>'
        + '<div class="onboarding-steps">'
        + '<div class="onboarding-step">'
        + '<div class="onboarding-step-num">1</div>'
        + '<div class="onboarding-step-content">'
        + '<strong>Les membres s\'inscrivent à vos collectes</strong>'
        + '<p>Ils choisissent les billets qui les intéressent depuis le catalogue et cliquent sur « S\'inscrire ».</p>'
        + '</div></div>'
        + '<div class="onboarding-step">'
        + '<div class="onboarding-step-num">2</div>'
        + '<div class="onboarding-step-content">'
        + '<strong>Vous vérifiez les paiements reçus</strong>'
        + '<p>Quand un membre vous a payé, il le déclare ici. Vous n\'avez plus qu\'à confirmer dans l\'onglet <em>« Vérification paiement »</em>.</p>'
        + '</div></div>'
        + '<div class="onboarding-step">'
        + '<div class="onboarding-step-num">3</div>'
        + '<div class="onboarding-step-content">'
        + '<strong>Vous préparez les enveloppes</strong>'
        + '<p>Dans l\'onglet <em>« Préparation des envois »</em>, vous regroupez les billets de chaque membre dans une enveloppe.</p>'
        + '</div></div>'
        + '<div class="onboarding-step">'
        + '<div class="onboarding-step-num">4</div>'
        + '<div class="onboarding-step-content">'
        + '<strong>Vous envoyez les billets par courrier</strong>'
        + '<p>Indiquez comment vous avez envoyé l\'enveloppe (lettre normale, suivi, recommandé…) et c\'est terminé !</p>'
        + '</div></div>'
        + '</div>'
        + '</div>';

    return html;
}

function dismissOnboarding() {
    localStorage.setItem('bt_onboarding_collecteur_dismissed', '1');
    var el = document.getElementById('onboarding-collecteur');
    if (el) el.remove();
}

function renderCollectesList() {
    var container = document.getElementById('collectes-list');
    if (!container) return;

    // Hide detail view, show list
    var detailDiv = document.getElementById('collecte-detail');
    if (detailDiv) detailDiv.style.display = 'none';
    container.style.display = '';

    // #14 — Onboarding collecteur
    var onboardingHtml = getOnboardingHtml();

    // #12 — Compteurs sur l'onglet "Mes collectes"
    var enCours = mesBillets.filter(function(b) { return b.Categorie === 'Collecte' || b.Categorie === 'Pré collecte'; });
    var tabs = document.querySelectorAll('.collectes-tabs .tab-btn');
    if (tabs[0]) tabs[0].innerHTML = 'Mes collectes <span class="tab-badge">' + mesBillets.length + '</span>';

    if (mesBillets.length === 0 && mesCollectesSupp.length === 0) {
        container.innerHTML = onboardingHtml + '<p class="collectes-empty"><i class="fa-solid fa-inbox"></i> Aucune collecte assignée.</p>';
        return;
    }

    var today = new Date().toISOString().slice(0, 10);

    // Séparer billets principaux ouverts / fermés
    var billetsOpen   = mesBillets.filter(function(b) { return b.Categorie === 'Collecte' || b.Categorie === 'Pré collecte'; });
    var billetsClosed = mesBillets.filter(function(b) { return b.Categorie !== 'Collecte' && b.Categorie !== 'Pré collecte'; });
    var dateDesc = function(a, b) { return (b.Date || '').localeCompare(a.Date || ''); };
    billetsOpen.sort(dateDesc);
    billetsClosed.sort(dateDesc);

    // Séparer collectes supplémentaires ouvertes / fermées
    var suppOpen   = mesCollectesSupp.filter(function(e) { return !e.collecte.date_fin || e.collecte.date_fin > today; });
    var suppClosed = mesCollectesSupp.filter(function(e) { return e.collecte.date_fin && e.collecte.date_fin <= today; });
    var suppDateDesc = function(a, b) {
        var dA = a.collecte.date_fin || a.collecte.date_coll || a.collecte.date_pre || '';
        var dB = b.collecte.date_fin || b.collecte.date_coll || b.collecte.date_pre || '';
        return dB.localeCompare(dA);
    };
    suppOpen.sort(suppDateDesc);
    suppClosed.sort(suppDateDesc);

    function renderBilletCard(b) {
        var isOpen = b.Categorie === 'Collecte' || b.Categorie === 'Pré collecte';
        var statusClass = isOpen ? 'collecte-status-open' : 'collecte-status-closed';
        var statusLabel = isOpen ? 'En cours' : (b.Categorie || 'Terminé');
        var refParts = [];
        if (b.Reference) refParts.push(b.Reference);
        var milVersion = '';
        if (b.Millesime) milVersion += b.Millesime;
        if (b.Version) milVersion += '-' + b.Version;
        if (milVersion) refParts.push(milVersion);
        var refPrefix = refParts.length > 0 ? refParts.join(' - ') : '';
        var attenuee = b.attenuee === true;
        var h = '<div class="collecte-card' + (attenuee ? ' collecte-card-attenuee' : '') + '" onclick="openCollecteDetail(' + b.id + ')">';
        h += '<div class="collecte-card-header">';
        if (refPrefix) h += '<span class="collecte-ref">' + escapeHtmlMC(refPrefix) + '</span>';
        h += '<h3>' + escapeHtmlMC(b.NomBillet || '') + '</h3>';
        h += '<span class="collecte-status ' + statusClass + '">' + escapeHtmlMC(statusLabel) + '</span>';
        var sheetUrl = (b.LinkSheet || '').trim();
        if (!isOpen && sheetUrl && /^https?:\/\//i.test(sheetUrl)) {
            h += '<a href="' + escapeAttrMC(sheetUrl) + '" target="_blank" onclick="event.stopPropagation()" class="collecte-sheet-link" title="Voir le fichier Google Sheet"><i class="fa-solid fa-file-csv"></i></a>';
        }
        h += '</div>';
        var bVne = b.VersionNormaleExiste !== false;
        var bVarActive = b.HasVariante && b.HasVariante !== 'N';
        var bPrixVar = (b.PrixVariante !== null && b.PrixVariante !== undefined && b.PrixVariante !== '') ? parseFloat(b.PrixVariante) : null;
        h += '<div class="collecte-card-info">';
        if (bVne && b.Prix) {
            h += '<span><i class="fa-solid fa-euro-sign"></i> ' + b.Prix + (bVarActive && bPrixVar !== null ? ' / ' + bPrixVar + ' (var.)' : '') + '</span>';
        } else if (!bVne && bVarActive && bPrixVar !== null) {
            h += '<span><i class="fa-solid fa-euro-sign"></i> ' + bPrixVar + ' (var.)</span>';
        } else if (b.Prix) {
            h += '<span><i class="fa-solid fa-euro-sign"></i> ' + b.Prix + '</span>';
        }
        if (b.DateColl) h += '<span><i class="fa-solid fa-calendar"></i> ' + b.DateColl + '</span>';
        h += '</div>';
        var stats = mesInscriptionsParBillet[b.id] || { total: 0, confirmes: 0, envoyes: 0 };
        if (stats.total > 0) {
            var allConfirmes = stats.confirmes === stats.total;
            var allEnvoyes = stats.envoyes === stats.total;
            h += '<div class="collecte-card-indicators">';
            h += '<span class="indicator ' + (allConfirmes ? 'indicator-ok' : 'indicator-pending') + '"><i class="fa-solid fa-' + (allConfirmes ? 'check-circle' : 'clock') + '"></i> ' + stats.confirmes + '/' + stats.total + ' payés</span>';
            h += '<span class="indicator ' + (allEnvoyes ? 'indicator-ok' : 'indicator-pending') + '"><i class="fa-solid fa-' + (allEnvoyes ? 'check-circle' : 'clock') + '"></i> ' + stats.envoyes + '/' + stats.total + ' envoyés</span>';
            h += '</div>';
        } else {
            h += '<div class="collecte-card-indicators"><span class="indicator indicator-none">Aucun inscrit</span></div>';
        }
        h += '<button class="btn-attenuee' + (attenuee ? ' btn-attenuee-active' : '') + '" onclick="event.stopPropagation(); toggleAttenuee(' + b.id + ', ' + !attenuee + ')" title="' + (attenuee ? 'Rendre visible' : 'Atténuer cette collecte') + '"><i class="fa-solid fa-eye' + (attenuee ? '-slash' : '') + '"></i></button>';
        h += '<div class="collecte-card-action"><i class="fa-solid fa-chevron-right"></i></div>';
        h += '</div>';
        return h;
    }

    // Ordre final : billets ouverts → collectes supp ouvertes → billets fermés → collectes supp fermées
    var html = '<div class="collectes-cards">';
    for (var i = 0; i < billetsOpen.length; i++) html += renderBilletCard(billetsOpen[i]);
    for (var j = 0; j < suppOpen.length; j++) html += renderCollecteSupplementaireCard(suppOpen[j].collecte, suppOpen[j].billet);
    for (var k = 0; k < billetsClosed.length; k++) html += renderBilletCard(billetsClosed[k]);
    for (var l = 0; l < suppClosed.length; l++) html += renderCollecteSupplementaireCard(suppClosed[l].collecte, suppClosed[l].billet);
    html += '</div>';

    container.innerHTML = onboardingHtml + html;
}

// ============================================================
// 5. VUE DETAILLEE D'UNE COLLECTE (Task 5)
// ============================================================
function openCollecteDetail(billetId) {
    currentCollecteSupp = null;
    currentBilletId = billetId;

    // Find the billet in mesBillets
    currentBillet = null;
    for (var i = 0; i < mesBillets.length; i++) {
        if (mesBillets[i].id === billetId) {
            currentBillet = mesBillets[i];
            break;
        }
    }

    var annee = new Date().getFullYear();
    Promise.all([
        supabaseFetch('/rest/v1/inscriptions?billet_id=eq.' + billetId + '&pas_interesse=eq.false&select=*&order=date_inscription.asc'),
        supabaseFetch('/rest/v1/frais_port?annee=eq.' + annee + '&select=*')
    ])
        .then(function(results) {
            currentInscriptions = results[0] || [];
            fraisPortCollecte = results[1] || [];
            // Si le billet n'a pas de variante, ignorer toute valeur résiduelle de nb_variantes
            if (currentBillet && (!currentBillet.HasVariante || currentBillet.HasVariante === 'N')) {
                currentInscriptions.forEach(function(ins) { ins.nb_variantes = 0; });
            }
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
            return supabaseFetch('/rest/v1/membres?email=in.(' + emailFilter + ')&select=email,nom,prenom,rue,code_postal,ville,pays')
                .then(function(membres) {
                    var membresMap = {};
                    if (membres) {
                        membres.forEach(function(m) { membresMap[m.email] = m; });
                    }
                    currentInscriptions.forEach(function(ins) {
                        var membre = membresMap[ins.membre_email];
                        if (membre) {
                            if (!ins.adresse_snapshot) ins.adresse_snapshot = {};
                            ins.adresse_snapshot.nom = membre.nom || ins.adresse_snapshot.nom || '';
                            ins.adresse_snapshot.prenom = membre.prenom || ins.adresse_snapshot.prenom || '';
                            ins.adresse_snapshot.rue = membre.rue || ins.adresse_snapshot.rue || '';
                            ins.adresse_snapshot.code_postal = membre.code_postal || ins.adresse_snapshot.code_postal || '';
                            ins.adresse_snapshot.ville = membre.ville || ins.adresse_snapshot.ville || '';
                            ins.adresse_snapshot.pays = membre.pays || ins.adresse_snapshot.pays || '';
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

    // Header avec prix
    var prixHeader = '';
    if (billet && prix > 0) {
        var vne = billet.VersionNormaleExiste !== false;
        if (vne && prixVariante !== prix) {
            prixHeader = ' — ' + prix.toFixed(2) + ' \u20AC / ' + prixVariante.toFixed(2) + ' \u20AC var.';
        } else {
            prixHeader = ' — ' + prix.toFixed(2) + ' \u20AC';
        }
    }
    html += '<div class="collecte-detail-header">';
    var titreDetail = '';
    if (billet) {
        if (billet.Reference) titreDetail += billet.Reference + ' - ';
        if (billet.Millesime) titreDetail += billet.Millesime + (billet.Version ? '-' + billet.Version : '') + ' ';
        titreDetail += billet.NomBillet || '';
    }
    html += '<h2>' + escapeHtmlMC(titreDetail) + '<span style="font-weight:400; font-size:0.75em; color:#666;">' + prixHeader + '</span></h2>';
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
    var hasVar = billet && billet.HasVariante && billet.HasVariante !== 'N';
    html += '<span class="compteur-value">' + (vne ? totalNormaux + ' normaux' : '') + (vne && hasVar ? ', ' : '') + (hasVar ? totalVariantes + ' variantes' : '') + '</span>';
    html += '</div>';
    html += '</div>';

    // Actions bar: close button + relance button
    var isClotured = !isOpen;
    var impayes = inscriptions.filter(function(i) { return i.statut_paiement !== 'confirme' && i.membre_email !== monCollecteur.email_membre; });

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
    // Bouton "Tout cocher payé"
    var aValiderPaiement = inscriptions.filter(function(i) {
        return !i.pas_interesse && i.statut_paiement !== 'confirme' && i.membre_email !== monCollecteur.email_membre;
    });
    if (aValiderPaiement.length > 0) {
        var aValiderIds = aValiderPaiement.map(function(i) { return i.id; });
        html += '<button class="btn-export-csv" onclick="toutValiderPaiementsCollecte([' + aValiderIds.join(',') + '])" title="Confirmer tous les paiements">'
            + '<i class="fa-solid fa-check-double"></i> Tout cocher payé (' + aValiderPaiement.length + ')'
            + '</button>';
    }
    // Bouton "Tout cocher enveloppes" (uniquement si FDP non demandé)
    if (billet.PayerFDP !== 'oui') {
        var aCocher = inscriptions.filter(function(i) {
            return !i.pas_interesse && i.statut_livraison !== 'pret_a_envoyer' && i.statut_livraison !== 'expedie';
        });
        if (aCocher.length > 0) {
            var acocherIds = aCocher.map(function(i) { return i.id; });
            html += '<button class="btn-export-csv" onclick="toutCocherEnveloppes([' + acocherIds.join(',') + '])" title="Ajouter tous les billets aux enveloppes des membres">'
                + '<i class="fa-solid fa-check-double"></i> Tout cocher enveloppe (' + aCocher.length + ')'
                + '</button>';
        }
    }

    // Message si FDP non demandé — entre la barre d'actions et le tableau
    if (billet.PayerFDP !== 'oui') {
        html += '<div class="message-gerer-envoi">'
            + '<i class="fa-solid fa-info-circle"></i> '
            + 'Cochez la colonne <strong>Enveloppe</strong> pour ajouter le billet à la préparation des envois, '
            + 'puis gérez l\'expédition via l\'onglet <strong><a href="#" onclick="showTab(\'envois\');return false;">Préparation des envois</a></strong>.'
            + '</div>';
    }

    // Inscriptions table
    if (inscriptions.length === 0) {
        html += '<p class="collectes-empty"><i class="fa-solid fa-users-slash"></i> Aucun inscrit pour cette collecte.</p>';
    } else {
        // Tri par nom puis prénom
        inscriptions.sort(function(a, b) {
            var sa = a.adresse_snapshot || {}, sb = b.adresse_snapshot || {};
            var na = (sa.nom || '').toLowerCase(), nb = (sb.nom || '').toLowerCase();
            if (na < nb) return -1; if (na > nb) return 1;
            var pa = (sa.prenom || '').toLowerCase(), pb = (sb.prenom || '').toLowerCase();
            if (pa < pb) return -1; if (pa > pb) return 1;
            return 0;
        });

        html += '<div class="collecte-table-wrap">';
        html += '<table class="collecte-table">';
        html += '<thead><tr>';
        html += '<th>Nom / Prénom</th>';
        html += '<th>Adresse</th>';
        if (vne) html += '<th>Normaux</th>';
        if (hasVar) html += '<th>Variantes</th>';
        html += '<th>Paiement</th>';
        html += '<th>Envoi</th>';
        html += '<th>Montant</th>';
        html += '<th>Payé</th>';
        if (billet.PayerFDP === 'oui') {
            html += '<th>FDP</th>';
            html += '<th>Envoyé</th>';
        } else {
            html += '<th>Enveloppe</th>';
        }
        html += '<th>Actions</th>';
        html += '</tr></thead>';
        html += '<tbody>';

        for (var j = 0; j < inscriptions.length; j++) {
            var ins = inscriptions[j];
            var snap = ins.adresse_snapshot || {};
            var membreIns = membresCache ? membresCache.find(function(mc) { return mc.email === ins.membre_email; }) : null;
            var nomPrenom = ((snap.nom || '') + ' ' + (snap.prenom || '')).trim() || (membreIns ? ((membreIns.nom || '') + ' ' + (membreIns.prenom || '')).trim() : '') || ins.membre_email;
            var adresse = formatAdresse(membreIns || snap);
            var montantBillets = (prix * (ins.nb_normaux || 0)) + (prixVariante * (ins.nb_variantes || 0));
            var commentaire = ins.commentaire || '';

            // Calcul FDP si demandé
            var fdpMontantIns = 0;
            if (billet.PayerFDP === 'oui') {
                var nbTotalIns = (ins.nb_normaux || 0) + (ins.nb_variantes || 0);
                var destIns = (snap.pays === 'France') ? 'france' : 'international';
                var typeEnvoiIns = (ins.mode_envoi || 'Normal').toLowerCase();
                fdpMontantIns = findFdpPriceCollecte(nbTotalIns, destIns, typeEnvoiIns);
            }
            var montantAffiche = montantBillets.toFixed(2) + ' \u20AC' + (fdpMontantIns > 0 ? ' + ' + fdpMontantIns.toFixed(2) + ' \u20AC fdp' : '');

            html += '<tr>';
            var btnEditMembre = '';
            if (window.userRole === 'admin' || window.userRole === 'superadmin') {
                btnEditMembre = ' <button class="btn-edit-membre" data-email="' + escapeAttrMC(ins.membre_email) + '" title="Modifier la fiche membre"><i class="fa-solid fa-user-pen"></i></button>';
            }
            html += '<td data-label="Nom">' + escapeHtmlMC(nomPrenom) + btnEditMembre + '</td>';
            html += '<td data-label="Adresse" class="td-adresse">' + escapeHtmlMC(adresse) + '</td>';
            if (vne) html += '<td data-label="Normaux">' + (ins.nb_normaux || 0) + '</td>';
            if (hasVar) html += '<td data-label="Variantes">' + (ins.nb_variantes || 0) + '</td>';
            html += '<td data-label="Paiement">' + escapeHtmlMC(ins.mode_paiement || '') + '</td>';
            html += '<td data-label="Envoi">' + escapeHtmlMC(ins.mode_envoi || '') + '</td>';
            html += '<td data-label="Montant">' + montantAffiche + '</td>';
            html += '<td data-label="Payé">' + badgePaiementCollecteur(ins) + '</td>';
            if (billet.PayerFDP === 'oui') {
                html += '<td data-label="FDP"><input type="checkbox" id="chk-fdp_regles-' + ins.id + '" ' + (ins.fdp_regles ? 'checked' : '') + ' onchange="toggleInscriptionField(' + ins.id + ', \'fdp_regles\', this.checked)"></td>';
                html += '<td data-label="Envoyé"><input type="checkbox" id="chk-envoye-' + ins.id + '" ' + (ins.envoye ? 'checked' : '') + ' onchange="demanderExpeditionDirecte(' + ins.id + ', this)"></td>';
            } else {
                var dansEnv = ins.statut_livraison === 'pret_a_envoyer' || ins.statut_livraison === 'expedie';
                var envDisabled = ins.statut_livraison === 'expedie' ? ' disabled title="Déjà expédié"' : '';
                html += '<td data-label="Enveloppe"><input type="checkbox"' + envDisabled + ' ' + (dansEnv ? 'checked' : '') + ' onchange="toggleEnveloppeDepuisCollecte(' + ins.id + ', \'' + escapeAttrMC(ins.membre_email) + '\', this)"></td>';
            }
            html += '<td data-label="Actions">'
                + '<button class="btn-modifier-inscription" onclick="ouvrirModalModification(' + ins.id + ')" title="Modifier l\'inscription"><i class="fa-solid fa-pen"></i></button>'
                + '<button class="btn-desinscrire" data-ins-id="' + ins.id + '" data-membre-name="' + escapeAttrMC(nomPrenom) + '"><i class="fa-solid fa-user-minus"></i></button>'
                + '</td>';
            html += '</tr>';

            if (commentaire) {
                var colCount = 7 + (vne ? 1 : 0) + (hasVar ? 1 : 0) + (billet.PayerFDP === 'oui' ? 2 : 1);
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

    // Event delegation pour les boutons édition fiche membre
    container.querySelectorAll('.btn-edit-membre[data-email]').forEach(function(btn) {
        btn.addEventListener('click', function() {
            openMembreEditModal(btn.getAttribute('data-email'));
        });
    });
}

function formatAdresse(snap) {
    var parts = [];
    if (snap.rue) parts.push(snap.rue);
    if (snap.code_postal || snap.ville) parts.push(((snap.code_postal || '') + ' ' + (snap.ville || '').toUpperCase()).trim());
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
    currentCollecteSupp = null;
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

function toggleEnveloppeDepuisCollecte(inscriptionId, membreEmail, checkbox) {
    if (!monCollecteur) return;

    if (checkbox.checked) {
        // Ajouter à l'enveloppe en_cours
        creerEnveloppeSiAbsente(monCollecteur.alias, membreEmail)
            .then(function() {
                return supabaseFetch('/rest/v1/enveloppes?collecteur_alias=eq.' + encodeURIComponent(monCollecteur.alias) + '&membre_email=eq.' + encodeURIComponent(membreEmail) + '&statut=eq.en_cours&select=id');
            })
            .then(function(envs) {
                if (!envs || envs.length === 0) throw new Error('Enveloppe introuvable');
                return supabaseFetch('/rest/v1/inscriptions?id=eq.' + inscriptionId, {
                    method: 'PATCH',
                    body: JSON.stringify({ statut_livraison: 'pret_a_envoyer', enveloppe_id: envs[0].id })
                });
            })
            .then(function() {
                showToast('Billet ajouté à l\'enveloppe');
            })
            .catch(function(error) {
                console.error('Erreur ajout enveloppe:', error);
                checkbox.checked = false;
                showToast('Erreur', 'error');
            });
    } else {
        // Retirer de l'enveloppe
        supabaseFetch('/rest/v1/inscriptions?id=eq.' + inscriptionId, {
            method: 'PATCH',
            body: JSON.stringify({ statut_livraison: 'non_reparti', enveloppe_id: null })
        })
        .then(function() {
            showToast('Billet retiré de l\'enveloppe');
        })
        .catch(function(error) {
            console.error('Erreur retrait enveloppe:', error);
            checkbox.checked = true;
            showToast('Erreur', 'error');
        });
    }
}

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
    var modeMap = { Normal: 'normal', Suivi: 'suivi', R1: 'r1', R2: 'r2', R3: 'r3' };
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
        + '<option value="r1"' + (modeVal === 'r1' ? ' selected' : '') + '>Recommandé R1</option>'
        + '<option value="r2"' + (modeVal === 'r2' ? ' selected' : '') + '>Recommandé R2</option>'
        + '<option value="r3"' + (modeVal === 'r3' ? ' selected' : '') + '>Recommandé R3</option>'
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
    var modeEnvoiEl = document.getElementById('exp-direct-mode');
    var numeroSuiviEl = document.getElementById('exp-direct-suivi');
    if (!modeEnvoiEl || !numeroSuiviEl) return;
    var modeEnvoi = modeEnvoiEl.value;
    var numeroSuivi = numeroSuiviEl.value.trim() || null;

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
// QW-6 — Modale custom pour clôturer une collecte
var pendingClotureId = null;

function cloturerCollecte(billetId) {
    pendingClotureId = billetId;
    var modal = document.getElementById('cloturer-modal');
    if (modal) modal.style.display = 'flex';
}

function fermerModalCloturer() {
    var modal = document.getElementById('cloturer-modal');
    if (modal) modal.style.display = 'none';
    pendingClotureId = null;
}

function confirmerCloturer() {
    var billetId = pendingClotureId;
    fermerModalCloturer();
    if (!billetId) return;

    var today = new Date().toISOString().slice(0, 10);
    var patchPromise;
    if (currentCollecteSupp !== null) {
        patchPromise = supabaseFetch('/rest/v1/collectes?id=eq.' + currentCollecteSupp.id, {
            method: 'PATCH',
            body: JSON.stringify({ date_fin: today })
        });
    } else {
        patchPromise = supabaseFetch('/rest/v1/billets?id=eq.' + billetId, {
            method: 'PATCH',
            body: JSON.stringify({ Categorie: 'Terminé', DateFin: today })
        });
    }
    patchPromise
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
// QW-6 — Modale custom pour désinscrire un membre
var pendingDesinscriptionId = null;

function desinscrireMembre(inscriptionId, membrePrenom) {
    pendingDesinscriptionId = inscriptionId;
    var msgEl = document.getElementById('desinscrire-msg');
    if (msgEl) msgEl.textContent = 'Désinscrire ' + membrePrenom + ' de cette collecte ?';
    var modal = document.getElementById('desinscrire-modal');
    if (modal) modal.style.display = 'flex';
}

function fermerModalDesinscrire() {
    var modal = document.getElementById('desinscrire-modal');
    if (modal) modal.style.display = 'none';
    pendingDesinscriptionId = null;
}

function confirmerDesinscrire() {
    var inscriptionId = pendingDesinscriptionId;
    fermerModalDesinscrire();
    if (!inscriptionId) return;

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
    var blacklistView = document.getElementById('blacklist-view');
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
    if (blacklistView) blacklistView.style.display = 'none';
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
    } else if (tabName === 'blacklist') {
        if (blacklistView) blacklistView.style.display = '';
        if (tabs[4]) tabs[4].classList.add('active');
        loadBlacklist();
    } else {
        if (collectesView) collectesView.style.display = '';
        if (tabs[0]) tabs[0].classList.add('active');
    }
}

function countBillets(inscs) {
    var total = 0;
    for (var i = 0; i < inscs.length; i++) {
        total += (inscs[i].nb_normaux || 0) + (inscs[i].nb_variantes || 0);
    }
    return total;
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
            return supabaseFetch('/rest/v1/inscriptions?billet_id=in.(' + billetIds.join(',') + ')&pas_interesse=eq.false&or=(statut_livraison.is.null,statut_livraison.eq.non_reparti,statut_livraison.eq.pret_a_envoyer)&select=*')
                .then(function(inscriptions) {
                    inscriptions = inscriptions || [];

                    // Créer les enveloppes manquantes pour les membres avec des inscriptions à répartir
                    var enveloppeEmails = enveloppes.map(function(e) { return e.membre_email; });
                    var membresaSansEnveloppe = [];
                    inscriptions.forEach(function(ins) {
                        if ((ins.statut_livraison === 'non_reparti' || ins.statut_livraison === null) &&
                            ins.membre_email && membresaSansEnveloppe.indexOf(ins.membre_email) === -1 &&
                            enveloppeEmails.indexOf(ins.membre_email) === -1) {
                            membresaSansEnveloppe.push(ins.membre_email);
                        }
                    });
                    if (membresaSansEnveloppe.length > 0) {
                        return Promise.all(membresaSansEnveloppe.map(function(email) {
                            return creerEnveloppeSiAbsente(alias, email);
                        })).then(function() {
                            loadEnveloppes(); // Recharger avec les nouvelles enveloppes
                        });
                    }

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
                    return supabaseFetch('/rest/v1/membres?email=in.(' + emailFilter + ')&select=email,nom,prenom,rue,code_postal,ville,pays')
                        .then(function(membres) {
                            var membresMap = {};
                            if (membres) {
                                membres.forEach(function(m) { membresMap[m.email] = m; });
                            }
                            inscriptions.forEach(function(ins) {
                                var membre = membresMap[ins.membre_email];
                                if (membre) {
                                    if (!ins.adresse_snapshot) ins.adresse_snapshot = {};
                                    ins.adresse_snapshot.nom = membre.nom || ins.adresse_snapshot.nom || '';
                                    ins.adresse_snapshot.prenom = membre.prenom || ins.adresse_snapshot.prenom || '';
                                    ins.adresse_snapshot.rue = membre.rue || ins.adresse_snapshot.rue || '';
                                    ins.adresse_snapshot.code_postal = membre.code_postal || ins.adresse_snapshot.code_postal || '';
                                    ins.adresse_snapshot.ville = membre.ville || ins.adresse_snapshot.ville || '';
                                    ins.adresse_snapshot.pays = membre.pays || ins.adresse_snapshot.pays || '';
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

    // Annuler les enveloppes vides (aucune inscription active)
    var enveloppesVides = enveloppes.filter(function(env) {
        var membreInscs = inscByMembre[env.membre_email] || [];
        var dansEnv = membreInscs.filter(function(i) { return i.statut_livraison === 'pret_a_envoyer' && i.enveloppe_id === env.id; });
        var aRepartir = membreInscs.filter(function(i) { return i.statut_livraison === 'non_reparti' || i.statut_livraison === null; });
        return dansEnv.length === 0 && aRepartir.length === 0;
    });
    if (enveloppesVides.length > 0) {
        Promise.all(enveloppesVides.map(function(env) {
            return supabaseFetch('/rest/v1/enveloppes?id=eq.' + env.id, {
                method: 'PATCH',
                body: JSON.stringify({ statut: 'annulee' })
            });
        })).then(function() {
            enveloppes = enveloppes.filter(function(env) {
                return enveloppesVides.indexOf(env) === -1;
            });
            renderEnveloppesListe(enveloppes, inscriptions, billetsMap);
        });
        return;
    }

    // #12 — Compteur onglet envois
    var tabs = document.querySelectorAll('.collectes-tabs .tab-btn');
    if (tabs[2]) tabs[2].innerHTML = 'Préparation des envois' + (enveloppes.length > 0 ? ' <span class="tab-badge">' + enveloppes.length + '</span>' : '');

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
    // Tri par nom puis prénom
    enveloppesMeta.sort(function(a, b) {
        var na = (a.adr.nom || '').toLowerCase(), nb = (b.adr.nom || '').toLowerCase();
        if (na < nb) return -1; if (na > nb) return 1;
        var pa = (a.adr.prenom || '').toLowerCase(), pb = (b.adr.prenom || '').toLowerCase();
        if (pa < pb) return -1; if (pa > pb) return 1;
        return 0;
    });

    // Séparer en deux groupes : à répartir vs en attente
    var groupeARepartir = [];
    var groupeEnAttente = [];

    for (var e = 0; e < enveloppesMeta.length; e++) {
            var env = enveloppesMeta[e].env;
            var membreInscs = inscByMembre[env.membre_email] || [];
            var dansEnveloppe = membreInscs.filter(function(i) { return i.statut_livraison === 'pret_a_envoyer' && i.enveloppe_id === env.id; });
            var aRepartir = membreInscs.filter(function(i) { return i.statut_livraison === 'non_reparti' || i.statut_livraison === null; });
            var totalBillets = countBillets(dansEnveloppe);
            var totalARepartir = countBillets(aRepartir);

            // Masquer les enveloppes vides (0 dans l'enveloppe et 0 à répartir)
            if (totalBillets === 0 && totalARepartir === 0) continue;

            var item = { env: env, adr: enveloppesMeta[e].adr, totalBillets: totalBillets, aRepartir: totalARepartir, hasARepartir: aRepartir.length > 0 };
            if (item.hasARepartir) {
                groupeARepartir.push(item);
            } else {
                groupeEnAttente.push(item);
            }
    }

    if (groupeARepartir.length === 0 && groupeEnAttente.length === 0) {
        renderEnveloppesVide();
        return;
    }

    var html = '';

    function renderEnveloppeCard(item) {
        var nom = ((item.adr.nom || '') + ' ' + (item.adr.prenom || '')).trim() || item.env.membre_email;
        var adresseStr = [item.adr.rue, item.adr.code_postal, (item.adr.ville || '').toUpperCase() || null, item.adr.pays].filter(Boolean).join(', ');
        var demandeHtml = '';
        if (item.env.demande_envoi) {
            var dateStr = item.env.date_demande_envoi ? new Date(item.env.date_demande_envoi).toLocaleDateString('fr-FR') : '';
            var modeLabel = { normal: 'Normal', suivi: 'Suivi', recommande_r1: 'R1', recommande_r2: 'R2', recommande_r3: 'R3' }[item.env.mode_envoi] || '';
            demandeHtml = '<span class="badge-demande-envoi">⚡ Demande d\'envoi le ' + dateStr + (modeLabel ? ' — ' + modeLabel : '') + '</span>';
        }
        return '<div class="envoi-groupe" onclick="openEnveloppeDetail(' + item.env.id + ')" style="cursor:pointer">'
            + '<div class="envoi-groupe-header">'
            + '<strong>' + escapeHtmlMC(nom) + '</strong>'
            + '<span class="envoi-adresse">' + escapeHtmlMC(adresseStr || 'Adresse non renseignée') + '</span>'
            + '<span class="envoi-count">' + item.totalBillets + ' billet(s) dans l\'enveloppe, ' + item.aRepartir + ' billet(s) à répartir</span>'
            + demandeHtml
            + '</div>'
            + '</div>';
    }

    if (groupeARepartir.length > 0) {
        html += '<h3 class="envois-section-title"><i class="fa-solid fa-arrows-split-up-and-left"></i> À répartir (' + groupeARepartir.length + ')</h3>';
        for (var i = 0; i < groupeARepartir.length; i++) {
            html += renderEnveloppeCard(groupeARepartir[i]);
        }
    }

    if (groupeEnAttente.length > 0) {
        html += '<h3 class="envois-section-title"><i class="fa-solid fa-clock"></i> En attente (' + groupeEnAttente.length + ')</h3>';
        for (var i = 0; i < groupeEnAttente.length; i++) {
            html += renderEnveloppeCard(groupeEnAttente[i]);
        }
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
                        env._nomAffiche = ((membres[0].nom || '') + ' ' + (membres[0].prenom || '')).trim() || env.membre_email;
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
    var modeLabel = { normal: 'Normal', suivi: 'Suivi', r1: 'Recommandé R1', r2: 'Recommandé R2', r3: 'Recommandé R3' }[env.mode_envoi_reel] || env.mode_envoi_reel || '—';

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
    var nbBilletsHist = countBillets(inscriptions);
    html += '<div class="enveloppe-section">';
    html += '<h3><i class="fa-solid fa-box"></i> Contenu de l\'enveloppe (' + nbBilletsHist + ' billet(s))</h3>';
    if (inscriptions.length === 0) {
        html += '<p class="enveloppe-vide">Aucun billet enregistré</p>';
    } else {
        for (var i = 0; i < inscriptions.length; i++) {
            var insc = inscriptions[i];
            var billet = billetsMap[insc.billet_id] || {};
            var envVne = billet.VersionNormaleExiste !== false;
            var envHasVar = billet.HasVariante && billet.HasVariante !== 'N';
            var envNbVar = envHasVar ? (insc.nb_variantes || 0) : 0;
            var envQty = envVne ? 'N:' + (insc.nb_normaux || 0) + (envNbVar > 0 ? ' V:' + envNbVar : '') : 'V:' + envNbVar;
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

// #15 — Données historique pour recherche/export
var _historiqueEnvois = [];
var _historiqueMembresMap = {};

function renderHistoriqueGlobal(envPassees, membresMap) {
    var container = document.getElementById('historique-view');
    if (!container) return;

    _historiqueEnvois = envPassees;
    _historiqueMembresMap = membresMap;

    var html = '<div class="historique-toolbar">'
        + '<div class="admin-search" style="flex:1;max-width:350px">'
        + '<i class="fa-solid fa-magnifying-glass admin-search__icon"></i>'
        + '<input type="text" id="historique-search" class="admin-search__input" placeholder="Rechercher un membre, n° suivi…" oninput="filterHistorique()">'
        + '<button id="historique-search-clear" class="admin-search__clear" onclick="clearHistoriqueSearch()" style="display:none"><i class="fa-solid fa-xmark"></i></button>'
        + '</div>'
        + '<button class="btn-export-csv" onclick="exportHistoriqueCSV()"><i class="fa-solid fa-file-csv"></i> Export CSV</button>'
        + '</div>';

    html += '<h3 class="enveloppes-section-titre"><i class="fa-solid fa-clock-rotate-left"></i> Historique des envois (<span id="historique-count">' + envPassees.length + '</span>)</h3>';
    html += '<div id="historique-cards">';
    html += buildHistoriqueCards(envPassees, membresMap, '');
    html += '</div>';

    container.innerHTML = html;
}

function buildHistoriqueCards(envPassees, membresMap, query) {
    var html = '';
    var count = 0;
    var q = query.toLowerCase();
    for (var h = 0; h < envPassees.length; h++) {
        var envH = envPassees[h];
        var dateExp = envH.date_expedition ? new Date(envH.date_expedition).toLocaleDateString('fr-FR') : '—';
        var modeLabel = { normal: 'Normal', suivi: 'Suivi', r1: 'Recommandé R1', r2: 'Recommandé R2', r3: 'Recommandé R3' }[envH.mode_envoi_reel] || envH.mode_envoi_reel || '—';

        var membreH = membresMap[envH.membre_email];
        var nomH = membreH ? ((membreH.nom || '') + ' ' + (membreH.prenom || '')).trim() : '';
        nomH = nomH || envH.membre_email;

        // Filtre recherche
        if (q) {
            var haystack = (nomH + ' ' + dateExp + ' ' + modeLabel + ' ' + (envH.numero_suivi || '') + ' ' + envH.statut).toLowerCase();
            if (haystack.indexOf(q) === -1) continue;
        }
        count++;

        var statutHtml = '';
        if (envH.statut === 'recue') {
            var dateRec = envH.date_reception ? new Date(envH.date_reception).toLocaleDateString('fr-FR') : '';
            statutHtml = '<span class="badge-recue"><i class="fa-solid fa-circle-check"></i> Reçue ' + dateRec + '</span>';
        } else {
            statutHtml = '<span class="badge-pas-retour">Pas de retour</span>';
        }

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
    if (count === 0 && q) {
        html = '<div class="envois-empty"><p>Aucun résultat pour « ' + escapeHtmlMC(query) + ' »</p></div>';
    }
    var countEl = document.getElementById('historique-count');
    if (countEl) countEl.textContent = count;
    return html;
}

function filterHistorique() {
    var input = document.getElementById('historique-search');
    var clearBtn = document.getElementById('historique-search-clear');
    var q = input ? input.value : '';
    if (clearBtn) clearBtn.style.display = q ? 'flex' : 'none';
    var cardsContainer = document.getElementById('historique-cards');
    if (cardsContainer) {
        cardsContainer.innerHTML = buildHistoriqueCards(_historiqueEnvois, _historiqueMembresMap, q);
    }
}

function clearHistoriqueSearch() {
    var input = document.getElementById('historique-search');
    if (input) { input.value = ''; input.focus(); }
    filterHistorique();
}

function exportHistoriqueCSV() {
    if (!_historiqueEnvois || _historiqueEnvois.length === 0) return;
    var sep = ';';
    var lines = ['Membre' + sep + 'Email' + sep + 'Date expédition' + sep + 'Mode envoi' + sep + 'N° suivi' + sep + 'Statut' + sep + 'Date réception'];
    for (var i = 0; i < _historiqueEnvois.length; i++) {
        var e = _historiqueEnvois[i];
        var m = _historiqueMembresMap[e.membre_email];
        var nom = m ? ((m.nom || '') + ' ' + (m.prenom || '')).trim() : '';
        var dateExp = e.date_expedition ? new Date(e.date_expedition).toLocaleDateString('fr-FR') : '';
        var modeLabel = { normal: 'Normal', suivi: 'Suivi', r1: 'Recommandé R1', r2: 'Recommandé R2', r3: 'Recommandé R3' }[e.mode_envoi_reel] || e.mode_envoi_reel || '';
        var statut = e.statut === 'recue' ? 'Reçue' : 'Expédiée';
        var dateRec = e.date_reception ? new Date(e.date_reception).toLocaleDateString('fr-FR') : '';
        lines.push([nom, e.membre_email || '', dateExp, modeLabel, e.numero_suivi || '', statut, dateRec].join(sep));
    }
    var csvContent = '\uFEFF' + lines.join('\n');
    var blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'historique-envois-' + new Date().toISOString().slice(0, 10) + '.csv';
    a.click();
    URL.revokeObjectURL(url);
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
            return supabaseFetch('/rest/v1/inscriptions?billet_id=in.(' + billetIds.join(',') + ')&membre_email=eq.' + membreEmail + '&pas_interesse=eq.false&or=(statut_livraison.is.null,statut_livraison.eq.non_reparti,statut_livraison.eq.pret_a_envoyer)&select=*')
                .then(function(inscriptions) {
                    inscriptions = inscriptions || [];
                    var billetsMap = {};
                    mesBillets.forEach(function(b) { billetsMap[b.id] = b; });
                    // Enrichir adresse_snapshot depuis la table membres (comme dans loadEnveloppes)
                    return supabaseFetch('/rest/v1/membres?email=eq.' + membreEmail + '&select=email,nom,prenom,rue,code_postal,ville,pays')
                        .then(function(membres) {
                            var membre = (membres && membres.length > 0) ? membres[0] : null;
                            if (membre) {
                                inscriptions.forEach(function(ins) {
                                    if (!ins.adresse_snapshot) ins.adresse_snapshot = {};
                                    ins.adresse_snapshot.nom = membre.nom || ins.adresse_snapshot.nom || '';
                                    ins.adresse_snapshot.prenom = membre.prenom || ins.adresse_snapshot.prenom || '';
                                    ins.adresse_snapshot.rue = membre.rue || ins.adresse_snapshot.rue || '';
                                    ins.adresse_snapshot.code_postal = membre.code_postal || ins.adresse_snapshot.code_postal || '';
                                    ins.adresse_snapshot.ville = membre.ville || ins.adresse_snapshot.ville || '';
                                    ins.adresse_snapshot.pays = membre.pays || ins.adresse_snapshot.pays || '';
                                });
                            }
                            renderEnveloppeDetail(inscriptions, billetsMap);
                        });
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
    var aRepartir = inscriptions.filter(function(i) { return i.statut_livraison === 'non_reparti' || i.statut_livraison === null; });

    // Nom du membre
    var adr = {};
    for (var a = 0; a < inscriptions.length; a++) {
        if (inscriptions[a].adresse_snapshot && (inscriptions[a].adresse_snapshot.nom || inscriptions[a].adresse_snapshot.prenom)) {
            adr = inscriptions[a].adresse_snapshot;
            break;
        }
    }
    var nom = ((adr.nom || '') + ' ' + (adr.prenom || '')).trim() || env.membre_email;
    var cpVille = [adr.code_postal, (adr.ville || '').toUpperCase() || null].filter(Boolean).join(' ');
    var paysLigne = (adr.pays && adr.pays.trim().toLowerCase() !== 'france') ? (adr.pays.trim().toUpperCase()) : '';
    var adresseLines = [nom, adr.rue, cpVille, paysLigne].filter(Boolean);
    var adresseStr = adresseLines.join('\n');

    var html = '';
    html += '<button class="btn-retour-liste" onclick="retourEnveloppes()"><i class="fa-solid fa-arrow-left"></i> Retour aux enveloppes</button>';

    html += '<div class="enveloppe-detail-header">';
    html += '<h2><i class="fa-solid fa-envelope"></i> ' + escapeHtmlMC(nom) + '</h2>';
    if (adresseLines.length > 1) {
        html += '<div class="envoi-adresse-wrapper" onclick="copierAdresse(this)" title="Cliquer pour copier">';
        html += '<pre class="envoi-adresse-bloc">' + escapeHtmlMC(adresseStr) + '</pre>';
        html += '<span class="envoi-adresse-copie"><i class="fa-solid fa-check"></i> Copié !</span>';
        html += '</div>';
    } else {
        html += '<span class="envoi-adresse">Adresse non renseignée</span>';
    }
    if (env.demande_envoi) {
        var dateStr = env.date_demande_envoi ? new Date(env.date_demande_envoi).toLocaleDateString('fr-FR') : '';
        var modeLabelDetail = { normal: 'Normal', suivi: 'Suivi', recommande_r1: 'Recommandé R1', recommande_r2: 'Recommandé R2', recommande_r3: 'Recommandé R3' }[env.mode_envoi] || '';
        html += '<span class="badge-demande-envoi">⚡ Demande d\'envoi le ' + dateStr + (modeLabelDetail ? ' — envoi ' + modeLabelDetail : '') + '</span>';
    }
    html += '</div>';

    // Section : Dans l'enveloppe (prêts à envoyer)
    var nbBilletsDansEnv = countBillets(dansEnveloppe);
    html += '<div class="enveloppe-section">';
    html += '<h3><i class="fa-solid fa-box"></i> Dans l\'enveloppe (' + nbBilletsDansEnv + ')</h3>';
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
        html += '<button onclick="ouvrirFormulaireExpedition(' + env.id + ')" class="btn-expedier"><i class="fa-solid fa-paper-plane"></i> Expédier cette enveloppe (' + nbBilletsDansEnv + ' billet(s))</button>';
    }
    html += '</div>';

    // Formulaire d'expédition (caché par défaut, affiché par ouvrirFormulaireExpedition)
    html += '<div id="expedition-form-container" style="display:none"></div>';

    // Section : À répartir (non répartis)
    if (aRepartir.length > 0) {
        var nbBilletsARepartir = countBillets(aRepartir);
        html += '<div class="enveloppe-section">';
        html += '<h3><i class="fa-solid fa-inbox"></i> À répartir (' + nbBilletsARepartir + ')</h3>';
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
    var envHasVar = billet.HasVariante && billet.HasVariante !== 'N';
    var envNbVar = envHasVar ? (insc.nb_variantes || 0) : 0;
    var envQty = envVne ? 'N:' + (insc.nb_normaux || 0) + (envNbVar > 0 ? ' V:' + envNbVar : '') : 'V:' + envNbVar;
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

function copierAdresse(wrapper) {
    var pre = wrapper.querySelector('pre');
    if (!pre) return;
    navigator.clipboard.writeText(pre.textContent).then(function() {
        wrapper.classList.add('adresse-copiee');
        setTimeout(function() { wrapper.classList.remove('adresse-copiee'); }, 2000);
    });
}

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
        var modeLabel = { normal: 'Normal', suivi: 'Suivi', r1: 'Recommandé R1', r2: 'Recommandé R2', r3: 'Recommandé R3' }[env.mode_envoi_reel] || env.mode_envoi_reel || '—';

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
    var priorite = { Normal: 1, Suivi: 2, R1: 3, R2: 4, R3: 5 };
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
            var modeMap = { Normal: 'normal', Suivi: 'suivi', R1: 'r1', R2: 'r2', R3: 'r3' };
            var modeVal = modeMap[modeSuggere] || 'normal';

            var html = '<div class="expedition-form">'
                + '<h3><i class="fa-solid fa-paper-plane"></i> Expédier l\'enveloppe</h3>'
                + '<div class="insc-form-field"><label>Mode d\'envoi réel</label>'
                + '<select id="mode-envoi-reel">'
                + '<option value="normal"' + (modeVal === 'normal' ? ' selected' : '') + '>Normal</option>'
                + '<option value="suivi"' + (modeVal === 'suivi' ? ' selected' : '') + '>Suivi</option>'
                + '<option value="r1"' + (modeVal === 'r1' ? ' selected' : '') + '>Recommandé R1</option>'
                + '<option value="r2"' + (modeVal === 'r2' ? ' selected' : '') + '>Recommandé R2</option>'
                + '<option value="r3"' + (modeVal === 'r3' ? ' selected' : '') + '>Recommandé R3</option>'
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
    var modeEnvoiEl = document.getElementById('mode-envoi-reel');
    var numeroSuiviEl = document.getElementById('numero-suivi');
    if (!modeEnvoiEl || !numeroSuiviEl) return;
    var modeEnvoi = modeEnvoiEl.value;
    var numeroSuivi = numeroSuiviEl.value.trim() || null;

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

// QW-6 — Modale custom pour annuler un envoi
var pendingAnnulationEnvoiId = null;

function annulerEnvoi(enveloppeId) {
    pendingAnnulationEnvoiId = enveloppeId;
    var modal = document.getElementById('annuler-envoi-modal');
    if (modal) modal.style.display = 'flex';
}

function fermerModalAnnulerEnvoi() {
    var modal = document.getElementById('annuler-envoi-modal');
    if (modal) modal.style.display = 'none';
    pendingAnnulationEnvoiId = null;
}

function confirmerAnnulationEnvoi() {
    fermerModalAnnulerEnvoi();
    if (!pendingAnnulationEnvoiId) return;
    var enveloppeId = pendingAnnulationEnvoiId;
    pendingAnnulationEnvoiId = null;
    executerAnnulationEnvoi(enveloppeId);
}

function executerAnnulationEnvoi(enveloppeId) {
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
            if (!enCours || enCours.length === 0) {
                showToastMC('Erreur : enveloppe cible introuvable', 'error');
                return Promise.reject('enveloppe cible introuvable');
            }
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
    supabaseFetch('/rest/v1/inscriptions?billet_id=in.(' + billetIds.join(',') + ')&statut_paiement=in.(non_paye,declare)&pas_interesse=eq.false&membre_email=neq.' + encodeURIComponent(monCollecteur.email_membre) + '&select=*&order=membre_email.asc')
        .then(function(inscriptions) {
            if (!inscriptions || inscriptions.length === 0) {
                renderPaiementsVide();
                return;
            }
            // Ignorer nb_variantes pour les billets sans variante
            var bMap = {};
            mesBillets.forEach(function(b) { bMap[b.id] = b; });
            inscriptions.forEach(function(ins) {
                var b = bMap[ins.billet_id];
                if (b && (!b.HasVariante || b.HasVariante === 'N')) ins.nb_variantes = 0;
            });
            var emails = [];
            inscriptions.forEach(function(ins) {
                if (ins.membre_email && emails.indexOf(ins.membre_email) === -1) emails.push(ins.membre_email);
            });
            var emailFilter = emails.map(function(e) { return encodeURIComponent(e); }).join(',');
            return supabaseFetch('/rest/v1/membres?email=in.(' + emailFilter + ')&select=email,nom,prenom,pseudo,rue,code_postal,ville,pays')
                .then(function(membres) {
                    var membresMap = {};
                    if (membres) {
                        membres.forEach(function(m) { membresMap[m.email] = m; });
                    }
                    inscriptions.forEach(function(ins) {
                        var membre = membresMap[ins.membre_email];
                        if (membre) {
                            if (!ins.adresse_snapshot) ins.adresse_snapshot = {};
                            ins.adresse_snapshot.nom = membre.nom || ins.adresse_snapshot.nom || '';
                            ins.adresse_snapshot.prenom = membre.prenom || ins.adresse_snapshot.prenom || '';
                            ins.adresse_snapshot.pseudo = membre.pseudo || '';
                            ins.adresse_snapshot.rue = membre.rue || ins.adresse_snapshot.rue || '';
                            ins.adresse_snapshot.code_postal = membre.code_postal || ins.adresse_snapshot.code_postal || '';
                            ins.adresse_snapshot.ville = membre.ville || ins.adresse_snapshot.ville || '';
                            ins.adresse_snapshot.pays = membre.pays || ins.adresse_snapshot.pays || '';
                        }
                    });
                    var billetsMap = {};
                    mesBillets.forEach(function(b) { billetsMap[b.id] = b; });
                    verifPaiementData = { inscriptions: inscriptions, billetsMap: billetsMap };
                    renderVerificationPaiement(inscriptions, billetsMap);
                    // #12 — Compteur onglet paiements
                    var declares = inscriptions.filter(function(i) { return i.statut_paiement === 'declare'; });
                    var tabs = document.querySelectorAll('.collectes-tabs .tab-btn');
                    if (tabs[1]) tabs[1].innerHTML = 'Vérification paiement' + (declares.length > 0 ? ' <span class="tab-badge tab-badge-warning">' + declares.length + '</span>' : '');
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

    var html = '<div class="paiement-total-attente">'
        + 'En attente de paiement : <strong>' + totalEnAttente.toFixed(2) + ' €</strong>'
        + ' <button onclick="ouvrirRelanceGlobale()" class="btn-relance" style="margin-left:12px;"><i class="fa-solid fa-envelope"></i> Relancer tous les impayés</button>'
        + '</div>';
    var emails = Object.keys(groupes);
    // Tri par nom puis prénom
    emails.sort(function(a, b) {
        var ga = groupes[a].adresse || {}, gb = groupes[b].adresse || {};
        var na = (ga.nom || '').toLowerCase(), nb = (gb.nom || '').toLowerCase();
        if (na < nb) return -1; if (na > nb) return 1;
        var pa = (ga.prenom || '').toLowerCase(), pb = (gb.prenom || '').toLowerCase();
        if (pa < pb) return -1; if (pa > pb) return 1;
        return 0;
    });
    for (var g = 0; g < emails.length; g++) {
        var email = emails[g];
        var groupe = groupes[email];
        var adr = groupe.adresse;
        var nom = ((adr.nom || '') + ' ' + (adr.prenom || '')).trim() || email;
        if (adr.pseudo) nom += ' (' + adr.pseudo + ')';

        var lignes = '';
        var totalGroupe = 0;
        for (var l = 0; l < groupe.inscriptions.length; l++) {
            var insc = groupe.inscriptions[l];
            var billet = billetsMap[insc.billet_id] || {};
            var prix = parseFloat(billet.Prix || 0);
            var prixVariante = (billet.PrixVariante !== null && billet.PrixVariante !== undefined && billet.PrixVariante !== '') ? parseFloat(billet.PrixVariante) : prix;
            var montantNum = (prix * (insc.nb_normaux || 0)) + (prixVariante * (insc.nb_variantes || 0));
            totalGroupe += montantNum;
            var montant = montantNum.toFixed(2);
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
                + '<span class="envoi-billet">' + escapeHtmlMC(payRefPrefix + (billet.NomBillet || '?') + payDateStr) + '</span>'
                + '<span class="envoi-montant">' + montant + ' €</span>'
                + badgePaiementEnvoi(insc.statut_paiement)
                + '<button onclick="validerPaiementVue(' + insc.id + ')" class="btn-marquer-envoye" title="Confirmer le paiement"><i class="fa-solid fa-check"></i></button>'
                + '</div>';
        }

        var groupeIds = groupe.inscriptions.map(function(i) { return i.id; });
        html += '<div class="envoi-groupe">'
            + '<div class="envoi-groupe-header">'
            + '<strong>' + escapeHtmlMC(nom) + '</strong>'
            + '<span class="envoi-count">' + groupe.inscriptions.length + ' billet(s)</span>'
            + '<span class="paiement-groupe-total">Total : ' + totalGroupe.toFixed(2) + ' €</span>'
            + '<button onclick="validerTousPaiementsVue([' + groupeIds.join(',') + '])" class="btn-marquer-envoye" title="Confirmer tous les paiements de ce membre"><i class="fa-solid fa-check-double"></i></button>'
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

function validerTousPaiementsVue(ids) {
    if (!ids || ids.length === 0) return;
    supabaseFetch('/rest/v1/inscriptions?id=in.(' + ids.join(',') + ')', {
        method: 'PATCH',
        body: JSON.stringify({ statut_paiement: 'confirme' })
    })
    .then(function() {
        showToast(ids.length + ' paiement' + (ids.length > 1 ? 's' : '') + ' confirmé' + (ids.length > 1 ? 's' : ''));
        loadVerificationPaiement();
    })
    .catch(function(error) {
        console.error('Erreur confirmation paiements:', error);
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

    supabaseFetch('/rest/v1/inscriptions?billet_id=eq.' + billetId + '&statut_paiement=neq.confirme&pas_interesse=eq.false&membre_email=neq.' + encodeURIComponent(monCollecteur.email_membre) + '&select=*')
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
            return supabaseFetch('/rest/v1/membres?email=in.(' + emailFilter + ')&select=email,nom,prenom,rue,code_postal,ville,pays')
                .then(function(membres) {
                    var membresMap = {};
                    if (membres) {
                        membres.forEach(function(m) { membresMap[m.email] = m; });
                    }
                    impayes.forEach(function(ins) {
                        var membre = membresMap[ins.membre_email];
                        if (membre) {
                            if (!ins.adresse_snapshot) ins.adresse_snapshot = {};
                            ins.adresse_snapshot.nom = membre.nom || ins.adresse_snapshot.nom || '';
                            ins.adresse_snapshot.prenom = membre.prenom || ins.adresse_snapshot.prenom || '';
                            ins.adresse_snapshot.rue = membre.rue || ins.adresse_snapshot.rue || '';
                            ins.adresse_snapshot.code_postal = membre.code_postal || ins.adresse_snapshot.code_postal || '';
                            ins.adresse_snapshot.ville = membre.ville || ins.adresse_snapshot.ville || '';
                            ins.adresse_snapshot.pays = membre.pays || ins.adresse_snapshot.pays || '';
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
            + 'Je me permets de te relancer concernant ton inscription à la collecte "' + (billet.NomBillet || '') + '".\n\n'
            + 'Détails :\n'
            + (relVne ? '- Billets normaux : ' + (insc.nb_normaux || 0) + '\n' : '')
            + (insc.nb_variantes > 0 ? '- Billets variantes : ' + insc.nb_variantes + '\n' : '')
            + '- Montant dû : ' + montant.toFixed(2) + ' €\n'
            + '- Mode d\'envoi : ' + (insc.mode_envoi || 'Normal') + '\n'
            + (insc.mode_envoi && insc.mode_envoi !== 'Normal' ? '- Des frais de port supplémentaires peuvent s\'appliquer.\n' : '')
            + '\n';

        if (insc.mode_paiement === 'PayPal' && paypalInfo) {
            corps += 'Tu peux effectuer le paiement via PayPal :\n' + paypalInfo + '/' + montant.toFixed(2) + '\n\n';
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

// ---- Relance globale (tous les impayés d'un coup) ----

function ouvrirRelanceGlobale() {
    if (!verifPaiementData) {
        showToast('Aucune donnée de paiement chargée', 'error');
        return;
    }
    var inscriptions = verifPaiementData.inscriptions;
    var billetsMap = verifPaiementData.billetsMap;
    if (!inscriptions || inscriptions.length === 0) {
        showToast('Aucun impayé à relancer');
        return;
    }

    var paypalInfo = '';
    if (monCollecteur.paypal_me) {
        paypalInfo = 'https://paypal.me/' + monCollecteur.paypal_me;
    } else if (monCollecteur.paypal_email) {
        paypalInfo = monCollecteur.paypal_email;
    }

    // Grouper par membre
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

    var emails = Object.keys(groupes);
    emails.sort(function(a, b) {
        var ga = groupes[a].adresse || {}, gb = groupes[b].adresse || {};
        var na = (ga.nom || '').toLowerCase(), nb = (gb.nom || '').toLowerCase();
        if (na < nb) return -1; if (na > nb) return 1;
        var pa = (ga.prenom || '').toLowerCase(), pb = (gb.prenom || '').toLowerCase();
        if (pa < pb) return -1; if (pa > pb) return 1;
        return 0;
    });

    var messagesHtml = '';
    for (var idx = 0; idx < emails.length; idx++) {
        var groupe = groupes[emails[idx]];
        var adr = groupe.adresse;
        var prenom = adr.prenom || groupe.email;

        var totalMembre = 0;
        var detailsLignes = '';
        for (var j = 0; j < groupe.inscriptions.length; j++) {
            var insc = groupe.inscriptions[j];
            var billet = billetsMap[insc.billet_id] || {};
            var prix = parseFloat(billet.Prix || 0);
            var prixVar = (billet.PrixVariante !== null && billet.PrixVariante !== undefined && billet.PrixVariante !== '') ? parseFloat(billet.PrixVariante) : prix;
            var montant = (prix * (insc.nb_normaux || 0)) + (prixVar * (insc.nb_variantes || 0));
            totalMembre += montant;

            var relVne = billet.VersionNormaleExiste !== false;
            detailsLignes += '\n• ' + (billet.NomBillet || '?');
            if (relVne) detailsLignes += ' — ' + (insc.nb_normaux || 0) + ' normal(aux)';
            if (insc.nb_variantes > 0) detailsLignes += ' — ' + insc.nb_variantes + ' variante(s)';
            detailsLignes += ' — ' + montant.toFixed(2) + ' €';
        }

        var objet = 'Relance paiement — Tes collectes en attente';

        var corps = 'Bonjour ' + prenom + ',\n\n'
            + 'Je me permets de te relancer concernant tes inscriptions en attente de paiement.\n\n'
            + 'Récapitulatif :' + detailsLignes + '\n\n'
            + 'Total dû : ' + totalMembre.toFixed(2) + ' €\n';

        if (paypalInfo) {
            corps += '\nTu peux effectuer le paiement via PayPal :\n' + paypalInfo + '/' + totalMembre.toFixed(2) + '\n';
        }

        corps += '\nMerci d\'avance,\n' + (monCollecteur.alias || 'Le collecteur');

        var mailto = 'mailto:' + groupe.email
            + '?subject=' + encodeURIComponent(objet)
            + '&body=' + encodeURIComponent(corps);

        messagesHtml += '<div class="relance-message" id="relance-msg-' + idx + '">'
            + '<div class="relance-header">'
            + '<strong>' + prenom + '</strong> (' + groupe.email + ')'
            + ' — ' + totalMembre.toFixed(2) + ' €'
            + '</div>'
            + '<textarea class="relance-texte" id="relance-texte-' + idx + '" rows="10" readonly>' + corps + '</textarea>'
            + '<div class="relance-actions">'
            + '<button onclick="copierRelance(' + idx + ')" class="btn-copier"><i class="fa-solid fa-copy"></i> Copier</button>'
            + '<a href="' + mailto + '" class="btn-mailto"><i class="fa-solid fa-envelope"></i> Envoyer par email</a>'
            + '</div>'
            + '</div>';
    }

    var modal = document.getElementById('relance-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'relance-modal';
        modal.className = 'relance-modal-overlay';
        document.body.appendChild(modal);
    }
    modal.innerHTML = '<div class="relance-modal-content">'
        + '<div class="relance-modal-header">'
        + '<h2><i class="fa-solid fa-envelope"></i> Relance globale — Tous les impayés</h2>'
        + '<button onclick="fermerRelance()" class="relance-close"><i class="fa-solid fa-times"></i></button>'
        + '</div>'
        + '<p class="relance-count">' + emails.length + ' membre(s) à relancer</p>'
        + messagesHtml
        + '</div>';
    modal.style.display = '';
}

// ============================================================
// STORY 9.5 — EXPORT CSV DES INSCRIPTIONS
// ============================================================

function escapeCSV(val) {
    var s = String(val == null ? '' : val);
    // Prévention injection formule Excel (=, +, -, @)
    if (s.length > 0 && '=+-@'.indexOf(s[0]) >= 0) {
        s = "'" + s;
    }
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
            escapeCSV((adr.ville || '').toUpperCase()),
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
        var label = ((m.nom || '') + ' ' + (m.prenom || '')).trim() || m.email;
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
        var membreEdit = membresCache ? membresCache.find(function(mc) { return mc.email === defEmail; }) : null;
        var nomAffiche = membreEdit ? ((membreEdit.nom || '') + ' ' + (membreEdit.prenom || '')).trim() || defEmail : defEmail;
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
        + '<option value="R1"' + (defEnvoi === 'R1' ? ' selected' : '') + '>Recommandé R1</option>'
        + '<option value="R2"' + (defEnvoi === 'R2' ? ' selected' : '') + '>Recommandé R2</option>'
        + '<option value="R3"' + (defEnvoi === 'R3' ? ' selected' : '') + '>Recommandé R3</option>'
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
        if (blacklistEmails[m.email]) return;
        var label = ((m.nom || '') + ' ' + (m.prenom || '')).trim() || m.email;
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

function toutValiderPaiementsCollecte(ids) {
    if (!ids || ids.length === 0) return;
    supabaseFetch('/rest/v1/inscriptions?id=in.(' + ids.join(',') + ')', {
        method: 'PATCH',
        body: JSON.stringify({ statut_paiement: 'confirme' })
    })
    .then(function() {
        showToast(ids.length + ' paiement' + (ids.length > 1 ? 's' : '') + ' confirmé' + (ids.length > 1 ? 's' : ''));
        openCollecteDetail(currentBilletId);
    })
    .catch(function(error) {
        console.error('Erreur confirmation paiements:', error);
        showToast('Erreur', 'error');
    });
}

function toutCocherEnveloppes(ids) {
    if (!ids || ids.length === 0 || !monCollecteur) return;
    // Récupérer les inscriptions concernées depuis currentInscriptions
    var aTraiter = currentInscriptions.filter(function(i) { return ids.indexOf(i.id) !== -1; });
    // Grouper par membre_email
    var parMembre = {};
    aTraiter.forEach(function(i) {
        if (!parMembre[i.membre_email]) parMembre[i.membre_email] = [];
        parMembre[i.membre_email].push(i.id);
    });
    var emails = Object.keys(parMembre);
    // Traiter les membres séquentiellement : créer/trouver l'enveloppe puis PATCH les inscriptions
    var chain = Promise.resolve();
    emails.forEach(function(email) {
        chain = chain.then(function() {
            return creerEnveloppeSiAbsente(monCollecteur.alias, email)
                .then(function() {
                    return supabaseFetch('/rest/v1/enveloppes?collecteur_alias=eq.' + encodeURIComponent(monCollecteur.alias) + '&membre_email=eq.' + encodeURIComponent(email) + '&statut=eq.en_cours&select=id');
                })
                .then(function(envs) {
                    if (!envs || envs.length === 0) throw new Error('Enveloppe introuvable pour ' + email);
                    var enveloppeId = envs[0].id;
                    var insIds = parMembre[email];
                    return supabaseFetch('/rest/v1/inscriptions?id=in.(' + insIds.join(',') + ')', {
                        method: 'PATCH',
                        body: JSON.stringify({ statut_livraison: 'pret_a_envoyer', enveloppe_id: enveloppeId })
                    });
                });
        });
    });
    chain.then(function() {
        showToast(ids.length + ' billet' + (ids.length > 1 ? 's' : '') + ' ajouté' + (ids.length > 1 ? 's' : '') + ' aux enveloppes');
        openCollecteDetail(currentBilletId);
    }).catch(function(error) {
        console.error('Erreur tout cocher enveloppes:', error);
        showToast('Erreur lors de l\'ajout aux enveloppes', 'error');
        openCollecteDetail(currentBilletId);
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

// ============================================================
// 14. LISTE NOIRE (blacklist collecteur)
// ============================================================

var blacklistData = [];
var blacklistEmails = {};

function loadBlacklistCache() {
    if (!monCollecteur) return;
    supabaseFetch('/rest/v1/collecteur_blacklist?collecteur_alias=eq.' + encodeURIComponent(monCollecteur.alias) + '&select=membre_email')
        .then(function(data) {
            blacklistEmails = {};
            (data || []).forEach(function(e) { blacklistEmails[e.membre_email] = true; });
        })
        .catch(function(error) {
            console.warn('Erreur chargement cache blacklist:', error);
        });
}

function loadBlacklist() {
    if (!monCollecteur) {
        renderBlacklistView([]);
        return;
    }
    supabaseFetch('/rest/v1/collecteur_blacklist?collecteur_alias=eq.' + encodeURIComponent(monCollecteur.alias) + '&select=id,membre_email,date_ajout&order=date_ajout.desc')
        .then(function(data) {
            blacklistData = data || [];
            // Refresh le cache emails
            blacklistEmails = {};
            blacklistData.forEach(function(e) { blacklistEmails[e.membre_email] = true; });
            renderBlacklistView(blacklistData);
        })
        .catch(function(error) {
            console.error('Erreur chargement liste noire:', error);
            showToast('Erreur chargement liste noire', 'error');
        });
}

function renderBlacklistView(entries) {
    var container = document.getElementById('blacklist-view');
    if (!container) return;

    var html = '<div class="blacklist-section">';
    html += '<h2><i class="fa-solid fa-ban"></i> Liste noire</h2>';
    html += '<p class="blacklist-desc">Les membres ajoutés à votre liste noire ne pourront pas s\'inscrire à vos collectes.</p>';

    // Formulaire d'ajout
    html += '<div class="blacklist-add-form">';
    html += '<div class="blacklist-search-row">';
    html += '<input type="text" id="blacklist-search" placeholder="Rechercher un membre (nom, prénom ou email)..." oninput="filtrerMembresBlacklist()" class="blacklist-search-input">';
    html += '<select id="blacklist-membre-select" class="blacklist-membre-select"><option value="">— Sélectionner un membre —</option></select>';
    html += '<button onclick="ajouterBlacklist()" class="btn-blacklist-add"><i class="fa-solid fa-plus"></i> Ajouter</button>';
    html += '</div></div>';

    // Liste actuelle
    if (entries.length === 0) {
        html += '<p class="blacklist-empty"><i class="fa-solid fa-circle-check"></i> Votre liste noire est vide.</p>';
    } else {
        html += '<div class="blacklist-table-wrap"><table class="blacklist-table">';
        html += '<thead><tr><th>Membre</th><th>Date d\'ajout</th><th>Action</th></tr></thead><tbody>';

        // Enrichir avec les données membres si disponibles
        for (var i = 0; i < entries.length; i++) {
            var entry = entries[i];
            var membreLabel = entry.membre_email;
            if (membresCache) {
                for (var j = 0; j < membresCache.length; j++) {
                    if (membresCache[j].email === entry.membre_email) {
                        var m = membresCache[j];
                        membreLabel = ((m.nom || '') + ' ' + (m.prenom || '')).trim() + ' (' + m.email + ')';
                        break;
                    }
                }
            }
            var dateAjout = entry.date_ajout ? new Date(entry.date_ajout).toLocaleDateString('fr-FR') : '';
            html += '<tr>'
                + '<td>' + escapeHtmlMC(membreLabel) + '</td>'
                + '<td>' + escapeHtmlMC(dateAjout) + '</td>'
                + '<td><button onclick="retirerBlacklist(' + entry.id + ')" class="btn-blacklist-remove" title="Retirer de la liste noire"><i class="fa-solid fa-trash-can"></i> Retirer</button></td>'
                + '</tr>';
        }
        html += '</tbody></table></div>';
    }

    html += '</div>';
    container.innerHTML = html;

    // Charger les membres pour le sélecteur
    chargerMembres().then(function() {
        filtrerMembresBlacklist();
    });
}

function filtrerMembresBlacklist() {
    var searchInput = document.getElementById('blacklist-search');
    var selectEl = document.getElementById('blacklist-membre-select');
    if (!searchInput || !selectEl || !membresCache) return;

    var terme = searchInput.value.toLowerCase().trim();

    // Emails déjà dans la blacklist
    var emailsBlacklistes = {};
    for (var i = 0; i < blacklistData.length; i++) {
        emailsBlacklistes[blacklistData[i].membre_email] = true;
    }

    var html = '<option value="">— Sélectionner un membre —</option>';
    membresCache.forEach(function(m) {
        if (emailsBlacklistes[m.email]) return;
        var label = ((m.nom || '') + ' ' + (m.prenom || '')).trim() || m.email;
        var searchable = (label + ' ' + m.email).toLowerCase();
        if (terme && searchable.indexOf(terme) === -1) return;
        html += '<option value="' + escapeAttrMC(m.email) + '">' + escapeHtmlMC(label + ' (' + m.email + ')') + '</option>';
    });
    selectEl.innerHTML = html;
}

function ajouterBlacklist() {
    var selectEl = document.getElementById('blacklist-membre-select');
    if (!selectEl || !selectEl.value) {
        showToast('Veuillez sélectionner un membre', 'error');
        return;
    }
    if (!monCollecteur) return;

    var email = selectEl.value;
    var alias = monCollecteur.alias;

    supabaseFetch('/rest/v1/collecteur_blacklist', {
        method: 'POST',
        body: JSON.stringify({
            collecteur_alias: alias,
            membre_email: email
        })
    })
    .then(function() {
        showToast('Membre ajouté à la liste noire');
        // Supprimer les inscriptions existantes de ce membre sur les collectes de ce collecteur
        supprimerInscriptionsBlacklist(alias, email);
        loadBlacklist();
    })
    .catch(function(error) {
        console.error('Erreur ajout blacklist:', error);
        showToast('Erreur lors de l\'ajout', 'error');
    });
}

function supprimerInscriptionsBlacklist(collecteurAlias, membreEmail) {
    // Trouver tous les billets du collecteur
    var billetIds = mesBillets.map(function(b) { return b.id; });
    if (billetIds.length === 0) return;

    // Supprimer les inscriptions du membre sur ces billets
    var filter = 'membre_email=eq.' + encodeURIComponent(membreEmail)
        + '&billet_id=in.(' + billetIds.join(',') + ')';
    supabaseFetch('/rest/v1/inscriptions?' + filter, {
        method: 'DELETE'
    })
    .then(function() {
        // Supprimer aussi les enveloppes en_cours associées
        return supabaseFetch('/rest/v1/enveloppes?collecteur_alias=eq.' + encodeURIComponent(collecteurAlias)
            + '&membre_email=eq.' + encodeURIComponent(membreEmail)
            + '&statut=eq.en_cours', {
            method: 'DELETE'
        });
    })
    .catch(function(error) {
        console.warn('Erreur suppression inscriptions blacklist:', error);
    });
}

function retirerBlacklist(entryId) {
    supabaseFetch('/rest/v1/collecteur_blacklist?id=eq.' + entryId, {
        method: 'DELETE'
    })
    .then(function() {
        showToast('Membre retiré de la liste noire');
        loadBlacklist();
    })
    .catch(function(error) {
        console.error('Erreur retrait blacklist:', error);
        showToast('Erreur lors du retrait', 'error');
    });
}

// ============================================================
// ÉDITION FICHE MEMBRE DEPUIS COLLECTE (admin only)
// ============================================================

var _membreEditEmail = null;

function openMembreEditModal(email) {
    var existing = document.getElementById('membre-edit-modal-overlay');
    if (existing) existing.remove();
    document.removeEventListener('keydown', onMembreEditKeydown); // F6: éviter empilement

    _membreEditEmail = email;

    supabaseFetch('/rest/v1/membres?email=eq.' + encodeURIComponent(email) + '&select=pseudo,nom,prenom,rue,code_postal,ville,pays,indicatif_tel,telephone')
        .then(function(data) {
            if (!data.length) { // F5: membre inexistant → popup réattribution
                openMembreReassignModal(email);
                return;
            }
            var m = data[0];

            var html = '<div id="membre-edit-modal-overlay" class="user-modal-overlay">';
            html += '<div class="user-edit-modal">';
            html += '<button class="user-edit-modal-close">&times;</button>';
            html += '<h2><i class="fa-solid fa-user-pen"></i> Modifier la fiche</h2>';
            html += '<p class="user-edit-modal-email"><i class="fa-solid fa-envelope"></i> ' + escapeHtmlMC(email) + '</p>';

            html += '<div class="user-edit-modal-fields">';
            html += '<div class="user-edit-modal-row">';
            html += '<div class="user-edit-modal-field"><label>Pseudo</label><input type="text" id="me-pseudo" value="' + escapeAttrMC(m.pseudo || '') + '" placeholder="Pseudo"></div>';
            html += '</div>';
            html += '<div class="user-edit-modal-row">';
            html += '<div class="user-edit-modal-field"><label>Nom</label><input type="text" id="me-nom" class="input-uppercase" value="' + escapeAttrMC(m.nom || '') + '" placeholder="Nom"></div>';
            html += '<div class="user-edit-modal-field"><label>Prénom</label><input type="text" id="me-prenom" class="input-capitalize" value="' + escapeAttrMC(m.prenom || '') + '" placeholder="Prénom"></div>';
            html += '</div>';
            html += '<div class="user-edit-modal-row">';
            html += '<div class="user-edit-modal-field user-edit-modal-field-full"><label>Rue</label><input type="text" id="me-rue" value="' + escapeAttrMC(m.rue || '') + '" placeholder="Adresse"></div>';
            html += '</div>';
            html += '<div class="user-edit-modal-row">';
            html += '<div class="user-edit-modal-field"><label>Code postal</label><input type="text" id="me-cp" value="' + escapeAttrMC(m.code_postal || '') + '" placeholder="Code postal"></div>';
            html += '<div class="user-edit-modal-field"><label>Ville</label><input type="text" id="me-ville" class="input-uppercase" value="' + escapeAttrMC(m.ville || '') + '" placeholder="Ville"></div>';
            html += '</div>';
            html += '<div class="user-edit-modal-row">';
            html += '<div class="user-edit-modal-field"><label>Pays</label><input type="text" id="me-pays" value="' + escapeAttrMC(m.pays || '') + '" placeholder="Pays"></div>';
            html += '</div>';
            html += '<div class="user-edit-modal-row">';
            html += '<div class="user-edit-modal-field"><label>Indicatif</label><input type="text" id="me-indicatif" value="' + escapeAttrMC(m.indicatif_tel || '') + '" placeholder="+33"></div>';
            html += '<div class="user-edit-modal-field"><label>Téléphone</label><input type="text" id="me-telephone" value="' + escapeAttrMC(m.telephone || '') + '" placeholder="Téléphone"></div>';
            html += '</div>';
            html += '</div>';

            html += '<div class="user-edit-modal-actions">';
            html += '<button class="user-modal-btn user-modal-btn-primary" id="me-btn-save"><i class="fa-solid fa-check"></i> Sauvegarder</button>';
            html += '<button class="user-modal-btn" id="me-btn-cancel"><i class="fa-solid fa-xmark"></i> Annuler</button>';
            html += '</div>';
            html += '</div></div>';

            document.body.insertAdjacentHTML('beforeend', html);

            // F2: addEventListener au lieu de onclick inline
            var overlay = document.getElementById('membre-edit-modal-overlay');
            overlay.addEventListener('click', function(e) { if (e.target === overlay) closeMembreEditModal(); });
            document.querySelector('#membre-edit-modal-overlay .user-edit-modal-close').addEventListener('click', closeMembreEditModal);
            document.getElementById('me-btn-save').addEventListener('click', function() { saveMembreEditModal(_membreEditEmail); });
            document.getElementById('me-btn-cancel').addEventListener('click', closeMembreEditModal);
            document.addEventListener('keydown', onMembreEditKeydown);
        })
        .catch(function(error) {
            showToast('Erreur chargement fiche : ' + error.message, 'error');
        });
}

function saveMembreEditModal(email) {
    var btnSave = document.getElementById('me-btn-save');
    if (btnSave) btnSave.disabled = true; // F7: éviter double-soumission

    var data = {
        pseudo: document.getElementById('me-pseudo').value.trim(),
        nom: document.getElementById('me-nom').value.trim(),
        prenom: document.getElementById('me-prenom').value.trim(),
        rue: document.getElementById('me-rue').value.trim(),
        code_postal: document.getElementById('me-cp').value.trim(),
        ville: document.getElementById('me-ville').value.trim(),
        pays: document.getElementById('me-pays').value.trim(),
        indicatif_tel: document.getElementById('me-indicatif').value.trim(),
        telephone: document.getElementById('me-telephone').value.trim()
    };

    supabaseFetch('/rest/v1/membres?email=eq.' + encodeURIComponent(email), {
        method: 'PATCH',
        body: JSON.stringify(data)
    })
        .then(function() {
            // Mettre à jour les snapshots en mémoire pour ce membre
            for (var i = 0; i < currentInscriptions.length; i++) {
                if (currentInscriptions[i].membre_email === email) {
                    var snap = currentInscriptions[i].adresse_snapshot || {};
                    snap.nom = data.nom;
                    snap.prenom = data.prenom;
                    snap.rue = data.rue;
                    snap.code_postal = data.code_postal;
                    snap.ville = data.ville;
                    snap.pays = data.pays;
                    currentInscriptions[i].adresse_snapshot = snap;
                }
            }
            closeMembreEditModal();
            renderCollecteDetail(currentBilletId, currentInscriptions);
            showToast('Fiche mise à jour', 'success');
        })
        .catch(function(error) {
            if (btnSave) btnSave.disabled = false; // F7: réactiver en cas d'erreur
            showToast('Erreur : ' + error.message, 'error');
        });
}

function closeMembreEditModal() {
    var overlay = document.getElementById('membre-edit-modal-overlay');
    if (overlay) overlay.remove();
    document.removeEventListener('keydown', onMembreEditKeydown);
    _membreEditEmail = null;
}

function onMembreEditKeydown(e) {
    if (e.key === 'Escape') closeMembreEditModal();
}

// ============================================================
// REASSIGNATION D'UN MEMBRE (email non trouvé dans membres)
// ============================================================
var _reassignOldEmail = null;
var _reassignMembresCache = [];

function openMembreReassignModal(oldEmail) {
    _reassignOldEmail = oldEmail;
    var existing = document.getElementById('membre-reassign-overlay');
    if (existing) existing.remove();

    var html = '<div id="membre-reassign-overlay" class="user-modal-overlay">';
    html += '<div class="user-edit-modal">';
    html += '<button class="user-edit-modal-close" id="reassign-close">&times;</button>';
    html += '<h2><i class="fa-solid fa-user-slash"></i> Membre introuvable</h2>';
    html += '<p style="margin-bottom:var(--spacing-md)">L\u2019adresse <strong>' + escapeHtmlMC(oldEmail) + '</strong> ne correspond à aucun membre. Sélectionnez un membre existant pour réattribuer les inscriptions.</p>';
    html += '<input type="text" id="reassign-search" class="membre-search-input" placeholder="Rechercher par nom, prénom ou email\u2026" autocomplete="off">';
    html += '<div id="reassign-list" class="membre-list"><p style="text-align:center;color:#888">Chargement\u2026</p></div>';
    html += '<div class="user-edit-modal-actions">';
    html += '<button class="user-modal-btn" id="reassign-cancel"><i class="fa-solid fa-xmark"></i> Annuler</button>';
    html += '</div>';
    html += '</div></div>';

    document.body.insertAdjacentHTML('beforeend', html);

    var overlay = document.getElementById('membre-reassign-overlay');
    overlay.addEventListener('click', function(e) { if (e.target === overlay) closeMembreReassignModal(); });
    document.getElementById('reassign-close').addEventListener('click', closeMembreReassignModal);
    document.getElementById('reassign-cancel').addEventListener('click', closeMembreReassignModal);
    document.getElementById('reassign-search').addEventListener('input', function() {
        renderReassignList(this.value.toLowerCase().trim());
    });
    document.addEventListener('keydown', onReassignKeydown);

    // Charger les membres
    supabaseFetch('/rest/v1/membres?select=email,nom,prenom&order=nom.asc,prenom.asc')
        .then(function(data) {
            _reassignMembresCache = data || [];
            renderReassignList('');
            var searchInput = document.getElementById('reassign-search');
            if (searchInput) searchInput.focus();
        })
        .catch(function(error) {
            var listDiv = document.getElementById('reassign-list');
            if (listDiv) listDiv.innerHTML = '<p style="color:red">Erreur de chargement</p>';
        });
}

function renderReassignList(filter) {
    var listDiv = document.getElementById('reassign-list');
    if (!listDiv) return;

    var filtered = _reassignMembresCache;
    if (filter) {
        filtered = _reassignMembresCache.filter(function(m) {
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
        var displayName = [m.nom, m.prenom].filter(function(s) { return s; }).join(' ');
        html += '<div class="membre-list-item" data-email="' + escapeAttrMC(m.email) + '">' +
            '<span class="membre-list-name">' + escapeHtmlMC(displayName || '\u2014') + '</span>' +
            '<span class="membre-list-email">' + escapeHtmlMC(m.email) + '</span>' +
            '</div>';
    });

    listDiv.innerHTML = html;

    listDiv.querySelectorAll('.membre-list-item').forEach(function(item) {
        item.addEventListener('click', function() {
            var newEmail = item.getAttribute('data-email');
            confirmReassign(newEmail);
        });
    });
}

function confirmReassign(newEmail) {
    if (!_reassignOldEmail || !currentBilletId) return;

    // Trouver les IDs des inscriptions concernées
    var ids = [];
    for (var i = 0; i < currentInscriptions.length; i++) {
        if (currentInscriptions[i].membre_email === _reassignOldEmail) {
            ids.push(currentInscriptions[i].id);
        }
    }
    if (ids.length === 0) {
        closeMembreReassignModal();
        return;
    }

    // PATCH toutes les inscriptions de cet ancien email sur ce billet
    supabaseFetch('/rest/v1/inscriptions?id=in.(' + ids.join(',') + ')', {
        method: 'PATCH',
        body: JSON.stringify({ membre_email: newEmail })
    })
        .then(function() {
            // Récupérer l'adresse du nouveau membre pour mettre à jour les snapshots
            return supabaseFetch('/rest/v1/membres?email=eq.' + encodeURIComponent(newEmail) + '&select=nom,prenom,rue,code_postal,ville,pays');
        })
        .then(function(data) {
            var m = data && data[0] ? data[0] : {};
            var newSnap = { nom: m.nom || '', prenom: m.prenom || '', rue: m.rue || '', code_postal: m.code_postal || '', ville: m.ville || '', pays: m.pays || '' };

            // Mettre à jour les snapshots et le membre_email en mémoire
            for (var i = 0; i < currentInscriptions.length; i++) {
                if (ids.indexOf(currentInscriptions[i].id) !== -1) {
                    currentInscriptions[i].membre_email = newEmail;
                    currentInscriptions[i].adresse_snapshot = newSnap;
                }
            }

            // Persister les snapshots en base
            supabaseFetch('/rest/v1/inscriptions?id=in.(' + ids.join(',') + ')', {
                method: 'PATCH',
                body: JSON.stringify({ adresse_snapshot: newSnap })
            });

            closeMembreReassignModal();
            renderCollecteDetail(currentBilletId, currentInscriptions);
            showToast('Inscriptions réattribuées à ' + newEmail, 'success');
        })
        .catch(function(error) {
            showToast('Erreur réattribution : ' + error.message, 'error');
        });
}

function closeMembreReassignModal() {
    var overlay = document.getElementById('membre-reassign-overlay');
    if (overlay) overlay.remove();
    document.removeEventListener('keydown', onReassignKeydown);
    _reassignOldEmail = null;
}

function onReassignKeydown(e) {
    if (e.key === 'Escape') closeMembreReassignModal();
}

// ============================================================
// Story 12.5 — COLLECTES SUPPLÉMENTAIRES (collecteur)
// ============================================================
function loadMesCollectesSupplementaires() {
    supabaseFetch('/rest/v1/collectes?collecteur=eq.' + encodeURIComponent(monCollecteur.alias) + '&select=*')
        .then(function(collectes) {
            if (!collectes || collectes.length === 0) {
                mesCollectesSupp = [];
                mesInscriptionsParCollecte = {};
                renderCollectesList();
                return;
            }
            var ids = [];
            collectes.forEach(function(c) {
                if (ids.indexOf(c.billet_id) === -1) ids.push(c.billet_id);
            });
            return supabaseFetch('/rest/v1/billets?select=id,"NomBillet","Ville","Categorie","Prix","PrixVariante","DateColl","DateFin","HasVariante","VersionNormaleExiste","Date","Reference","Millesime","Version","PayerFDP"&id=in.(' + ids.join(',') + ')')
                .then(function(billets) {
                    var billetsMap = {};
                    (billets || []).forEach(function(b) { billetsMap[b.id] = b; });
                    var collecteIds = collectes.map(function(c) { return c.id; });
                    return supabaseFetch('/rest/v1/inscriptions?collecte_id=in.(' + collecteIds.join(',') + ')&pas_interesse=eq.false&select=collecte_id,statut_paiement,envoye')
                        .then(function(inscriptions) {
                            mesInscriptionsParCollecte = {};
                            (inscriptions || []).forEach(function(ins) {
                                if (!mesInscriptionsParCollecte[ins.collecte_id]) {
                                    mesInscriptionsParCollecte[ins.collecte_id] = { total: 0, confirmes: 0, envoyes: 0 };
                                }
                                mesInscriptionsParCollecte[ins.collecte_id].total++;
                                if (ins.statut_paiement === 'confirme') mesInscriptionsParCollecte[ins.collecte_id].confirmes++;
                                if (ins.envoye) mesInscriptionsParCollecte[ins.collecte_id].envoyes++;
                            });
                            mesCollectesSupp = collectes.map(function(c) {
                                return { collecte: c, billet: billetsMap[c.billet_id] || null };
                            });
                            renderCollectesList();
                        });
                });
        })
        .catch(function(error) {
            console.error('Erreur chargement collectes supplémentaires:', error);
            mesCollectesSupp = [];
            mesInscriptionsParCollecte = {};
            renderCollectesList();
        });
}

function renderCollecteSupplementaireCard(collecte, billet) {
    if (!billet) return '';
    var today = new Date().toISOString().slice(0, 10);
    var isOpen = !collecte.date_fin || collecte.date_fin > today;
    var statusClass = isOpen ? 'collecte-status-open' : 'collecte-status-closed';
    var statusLabel = isOpen ? 'En cours' : 'Terminée';
    var stats = mesInscriptionsParCollecte[collecte.id] || { total: 0, confirmes: 0, envoyes: 0 };

    var html = '<div class="collecte-card" onclick="openCollecteDetailSupp(\'' + escapeAttrMC(collecte.id) + '\')">';
    html += '<div class="collecte-card-header">';
    var refParts = [];
    if (billet.Reference) refParts.push(billet.Reference);
    var milVersion = '';
    if (billet.Millesime) milVersion += billet.Millesime;
    if (billet.Version) milVersion += '-' + billet.Version;
    if (milVersion) refParts.push(milVersion);
    if (refParts.length > 0) html += '<span class="collecte-ref">' + escapeHtmlMC(refParts.join(' - ')) + '</span>';
    html += '<h3>' + escapeHtmlMC(billet.NomBillet || '') + '</h3>';
    html += '<span class="badge-nom-collecte">' + escapeHtmlMC(collecte.nom || '') + '</span>';
    html += '<span class="collecte-status ' + statusClass + '">' + escapeHtmlMC(statusLabel) + '</span>';
    html += '</div>';
    html += '<div class="collecte-card-info">';
    if (billet.Prix) html += '<span><i class="fa-solid fa-euro-sign"></i> ' + billet.Prix + '</span>';
    if (collecte.date_coll) html += '<span><i class="fa-solid fa-calendar"></i> ' + collecte.date_coll + '</span>';
    html += '</div>';
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
    return html;
}

function openCollecteDetailSupp(collecteId) {
    var found = null;
    for (var i = 0; i < mesCollectesSupp.length; i++) {
        if (mesCollectesSupp[i].collecte.id === collecteId) {
            found = mesCollectesSupp[i];
            break;
        }
    }
    if (!found) return;

    currentCollecteSupp = found.collecte;
    currentBilletId = found.billet ? found.billet.id : null;

    var today = new Date().toISOString().slice(0, 10);
    var isOpen = !currentCollecteSupp.date_fin || currentCollecteSupp.date_fin > today;

    // Build currentBillet with Categorie override so renderCollecteDetail shows correct open/closed state
    currentBillet = found.billet ? JSON.parse(JSON.stringify(found.billet)) : {};
    if (currentBillet) {
        currentBillet.Categorie = isOpen ? 'Collecte' : 'Terminé';
    }

    var annee = new Date().getFullYear();
    Promise.all([
        supabaseFetch('/rest/v1/inscriptions?collecte_id=eq.' + collecteId + '&pas_interesse=eq.false&select=*&order=date_inscription.asc'),
        supabaseFetch('/rest/v1/frais_port?annee=eq.' + annee + '&select=*')
    ])
        .then(function(results) {
            currentInscriptions = results[0] || [];
            fraisPortCollecte = results[1] || [];
            // Si le billet n'a pas de variante, ignorer toute valeur résiduelle de nb_variantes
            if (currentBillet && (!currentBillet.HasVariante || currentBillet.HasVariante === 'N')) {
                currentInscriptions.forEach(function(ins) { ins.nb_variantes = 0; });
            }
            var emails = [];
            currentInscriptions.forEach(function(ins) {
                if (ins.membre_email && emails.indexOf(ins.membre_email) === -1) emails.push(ins.membre_email);
            });
            if (emails.length === 0) {
                renderCollecteDetail(currentBilletId, currentInscriptions);
                return;
            }
            var emailFilter = emails.map(function(e) { return encodeURIComponent(e); }).join(',');
            return supabaseFetch('/rest/v1/membres?email=in.(' + emailFilter + ')&select=email,nom,prenom,rue,code_postal,ville,pays')
                .then(function(membres) {
                    var membresMap = {};
                    if (membres) membres.forEach(function(m) { membresMap[m.email] = m; });
                    currentInscriptions.forEach(function(ins) {
                        var membre = membresMap[ins.membre_email];
                        if (membre) {
                            if (!ins.adresse_snapshot) ins.adresse_snapshot = {};
                            ins.adresse_snapshot.nom = membre.nom || ins.adresse_snapshot.nom || '';
                            ins.adresse_snapshot.prenom = membre.prenom || ins.adresse_snapshot.prenom || '';
                            ins.adresse_snapshot.rue = membre.rue || ins.adresse_snapshot.rue || '';
                            ins.adresse_snapshot.code_postal = membre.code_postal || ins.adresse_snapshot.code_postal || '';
                            ins.adresse_snapshot.ville = membre.ville || ins.adresse_snapshot.ville || '';
                            ins.adresse_snapshot.pays = membre.pays || ins.adresse_snapshot.pays || '';
                        }
                    });
                    renderCollecteDetail(currentBilletId, currentInscriptions);
                });
        })
        .catch(function(error) {
            console.error('Erreur chargement inscrits collecte supp:', error);
            showToast('Erreur lors du chargement des inscrits', 'error');
        });
}
