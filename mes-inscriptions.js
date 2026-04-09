// ============================================================
// MES INSCRIPTIONS — Vue membre de toutes ses inscriptions
// Story 5.6
// ============================================================

var mesInscriptions = [];
var billetsMap = {};
var collecteursMap = {};
var collectesMap = {}; // Story 12.6 — {collecte_id: nom} pour affichage badge
var membrePays = '';
var fraisPortData = [];
var currentInscFilter = 'tous'; // #9 — filtre actif
var modifierInscCurrent = null; // Inscription en cours de modification (pré-collecte)

// #14 — Onboarding membre inscriptions
function getOnboardingMembreHtml() {
    var key = 'bt_onboarding_membre_dismissed';
    if (localStorage.getItem(key)) return '';

    return '<div class="onboarding-banner" id="onboarding-membre">'
        + '<button class="onboarding-close" onclick="dismissOnboardingMembre()" aria-label="Fermer"><i class="fa-solid fa-xmark"></i></button>'
        + '<h3 class="onboarding-title"><i class="fa-solid fa-hand-wave"></i> Bienvenue sur vos inscriptions !</h3>'
        + '<p class="onboarding-subtitle">Nouveau système : fini le Google Form ! Voici comment s\'inscrire à une collecte :</p>'
        + '<div class="onboarding-steps">'
        + '<div class="onboarding-step">'
        + '<div class="onboarding-step-num">1</div>'
        + '<div class="onboarding-step-content">'
        + '<strong>Choisissez un billet dans le catalogue</strong>'
        + '<p>Depuis la page <a href="billets.html">Les billets</a>, cliquez sur <em>« S\'inscrire »</em> sur la collecte qui vous intéresse.</p>'
        + '</div></div>'
        + '<div class="onboarding-step">'
        + '<div class="onboarding-step-num">2</div>'
        + '<div class="onboarding-step-content">'
        + '<strong>Indiquez la quantité voulue</strong>'
        + '<p>Choisissez le nombre de billets (normal et/ou variante) puis validez.</p>'
        + '</div></div>'
        + '<div class="onboarding-step">'
        + '<div class="onboarding-step-num">3</div>'
        + '<div class="onboarding-step-content">'
        + '<strong>Payez le collecteur</strong>'
        + '<p>Réglez le collecteur (virement, chèque…), puis déclarez votre paiement ici avec le bouton <em>« Déclarer paiement »</em>.</p>'
        + '</div></div>'
        + '<div class="onboarding-step">'
        + '<div class="onboarding-step-num">4</div>'
        + '<div class="onboarding-step-content">'
        + '<strong>Recevez vos billets par courrier</strong>'
        + '<p>Le collecteur prépare votre enveloppe et vous l\'envoie. Vous pouvez suivre l\'avancement dans l\'onglet <em>« Mes envois »</em>.</p>'
        + '</div></div>'
        + '</div>'
        + '</div>';
}

function dismissOnboardingMembre() {
    localStorage.setItem('bt_onboarding_membre_dismissed', '1');
    var el = document.getElementById('onboarding-membre');
    if (el) el.remove();
}

function escapeHtml(text) {
    if (!text) return '';
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function showToast(message, type) {
    var toast = document.createElement('div');
    toast.className = 'toast toast-' + (type || 'success');
    toast.textContent = message;
    document.body.appendChild(toast);
    if (type === 'error') {
        toast.onclick = function() { toast.remove(); };
    } else {
        setTimeout(function() {
            if (toast.parentNode) toast.remove();
        }, 4000);
    }
}

// ============================================================
// 1. CHARGEMENT DES DONNÉES
// ============================================================

function loadMesInscriptions() {
    var email = window.getActiveEmail();
    if (!email) return;

    var annee = new Date().getFullYear();

    // Étape 1 : charger les inscriptions du membre (pas_interesse = false)
    supabaseFetch('/rest/v1/inscriptions?membre_email=eq.' + encodeURIComponent(email) + '&pas_interesse=eq.false&select=*&order=date_inscription.desc')
        .then(function(data) {
            mesInscriptions = data || [];

            // Étape 2 : charger les billets associés pour noms, villes, prix, PayerFDP
            var billetIds = mesInscriptions.map(function(i) { return i.billet_id; });
            if (billetIds.length === 0) {
                renderInscriptions();
                return;
            }
            var idsParam = 'id=in.(' + billetIds.join(',') + ')';
            return supabaseFetch('/rest/v1/billets?' + idsParam + '&select=id,"NomBillet","Ville","Collecteur","Prix","PrixVariante","Categorie","PayerFDP","Reference","Millesime","Version","HasVariante"');
        })
        .then(function(billets) {
            if (billets) {
                billetsMap = {};
                billets.forEach(function(b) { billetsMap[b.id] = b; });
            }

            // Si le billet n'a pas de variante (HasVariante absent ou 'N'),
            // ignorer toute valeur résiduelle de nb_variantes côté affichage/totaux
            mesInscriptions.forEach(function(insc) {
                var b = billetsMap[insc.billet_id];
                if (b && (!b.HasVariante || b.HasVariante === 'N')) {
                    insc.nb_variantes = 0;
                }
            });

            // Étape 3 : charger collecteurs, pays du membre, frais de port en parallèle
            var promises = [
                supabaseFetch('/rest/v1/collecteurs?select=alias,paypal_email,paypal_me,email_membre'),
                supabaseFetch('/rest/v1/membres?email=eq.' + encodeURIComponent(email) + '&select=pays'),
                supabaseFetch('/rest/v1/frais_port?annee=eq.' + annee + '&select=*')
            ];
            // Story 12.6 — charger noms des collectes supplémentaires si nécessaire
            var collecteIds = mesInscriptions
                .filter(function(i) { return i.collecte_id; })
                .map(function(i) { return i.collecte_id; });
            if (collecteIds.length > 0) {
                promises.push(supabaseFetch('/rest/v1/collectes?id=in.(' + collecteIds.join(',') + ')&select=id,nom'));
            }
            return Promise.all(promises);
        })
        .then(function(results) {
            if (!results) return;
            var collecteurs = results[0];
            var membres = results[1];
            var fraisPort = results[2];

            if (collecteurs) {
                collecteursMap = {};
                collecteurs.forEach(function(c) { collecteursMap[c.alias] = c; });
            }
            membrePays = (membres && membres[0]) ? (membres[0].pays || '') : '';
            fraisPortData = fraisPort || [];
            // Story 12.6 — peupler collectesMap si la requête a été émise
            collectesMap = {};
            if (results[3]) {
                results[3].forEach(function(c) { collectesMap[c.id] = c.nom; });
            }

            renderInscriptions();
        })
        .catch(function(error) {
            console.error('Erreur chargement inscriptions:', error);
        });
}

// ============================================================
// 2. RENDU DE LA LISTE
// ============================================================

function findFdpPrice(nbBillets, destination, typeEnvoi) {
    for (var i = 0; i < fraisPortData.length; i++) {
        var r = fraisPortData[i];
        if (r.destination === destination && r.type_envoi === typeEnvoi &&
            nbBillets >= r.qte_min && nbBillets <= r.qte_max) {
            return parseFloat(r.prix);
        }
    }
    return 0;
}

// #9 — Filtrage par statut de paiement
function filterInscriptions(statut) {
    currentInscFilter = statut;
    // Mettre à jour les boutons actifs
    var btns = document.querySelectorAll('.inscriptions-filter-btn');
    for (var i = 0; i < btns.length; i++) {
        btns[i].classList.remove('active');
    }
    // Trouver le bouton correspondant par son attribut onclick (résistant aux réordonnements)
    for (var j = 0; j < btns.length; j++) {
        if (btns[j].getAttribute('onclick') === "filterInscriptions('" + statut + "')") {
            btns[j].classList.add('active');
            break;
        }
    }
    renderInscriptions();
}

function estBeneficiaire(insc, activeEmail) {
    var b = billetsMap[insc.billet_id] || {};
    var col = collecteursMap[b.Collecteur];
    return !!(col && col.email_membre && col.email_membre === activeEmail);
}

function renderInscriptions() {
    var container = document.getElementById('inscriptions-list');
    var emptyState = document.getElementById('inscriptions-empty');
    var summary = document.getElementById('inscriptions-summary');
    if (!container) return;

    // #14 — Onboarding membre
    var onboardingHtml = getOnboardingMembreHtml();

    // État vide
    if (mesInscriptions.length === 0) {
        container.innerHTML = '';
        if (emptyState) emptyState.style.display = '';
        if (summary) summary.innerHTML = onboardingHtml;
        return;
    }
    if (emptyState) emptyState.style.display = 'none';

    // #9 — Filtrer par statut
    var filteredInscriptions = mesInscriptions;
    if (currentInscFilter === 'prix_non_defini') {
        filteredInscriptions = mesInscriptions.filter(function(insc) {
            var billet = billetsMap[insc.billet_id] || {};
            return billet.Categorie === 'Pré collecte';
        });
    } else if (currentInscFilter === 'non_paye') {
        filteredInscriptions = mesInscriptions.filter(function(insc) {
            var billet = billetsMap[insc.billet_id] || {};
            return (insc.statut_paiement || 'non_paye') === 'non_paye' && billet.Categorie !== 'Pré collecte';
        });
    } else if (currentInscFilter !== 'tous') {
        filteredInscriptions = mesInscriptions.filter(function(insc) {
            return (insc.statut_paiement || 'non_paye') === currentInscFilter;
        });
    }

    var activeEmail = window.getActiveEmail();
    var totalDu = 0;
    var totalEnAttente = 0;


    function renderInscriptionCard(insc) {
        var billet = billetsMap[insc.billet_id] || {};
        var prix = parseFloat(billet.Prix || 0);
        var prixVar = (billet.PrixVariante !== null && billet.PrixVariante !== undefined && billet.PrixVariante !== '') ? parseFloat(billet.PrixVariante) : prix;
        var nbNormaux = insc.nb_normaux || 0;
        var nbVariantes = insc.nb_variantes || 0;
        var montant = (prix * nbNormaux) + (prixVar * nbVariantes);
        var statut = insc.statut_paiement || 'non_paye';
        var isBenef = estBeneficiaire(insc, activeEmail);

        var fdpMontant = 0;
        if (billet.PayerFDP === 'oui' && billet.Categorie !== 'Pré collecte') {
            var nbTotal = nbNormaux + nbVariantes;
            var dest = (membrePays === 'France') ? 'france' : 'international';
            var typeEnvoi = (insc.mode_envoi || 'Normal').toLowerCase();
            fdpMontant = findFdpPrice(nbTotal, dest, typeEnvoi);
        }
        var montantAvecFdp = montant + fdpMontant;

        if (billet.Categorie !== 'Pré collecte') {
            if (statut === 'non_paye' && !isBenef) totalDu += montantAvecFdp;
            else if (statut === 'declare' && !isBenef) totalEnAttente += montantAvecFdp;
        }

        var collecteur = collecteursMap[billet.Collecteur] || {};
        var paypalNoteHtml = '';
        var paypalBtnHtml = '';
        if (statut === 'non_paye' && !isBenef && insc.mode_paiement === 'PayPal' && billet.Categorie !== 'Pré collecte') {
            // Construire la note PayPal : Ref année-version titre - détail quantités = total
            var refPart = (billet.Reference || '') + ' ' + (billet.Millesime || '') + (billet.Version ? '-' + billet.Version : '');
            var noteparts = [refPart.trim(), billet.NomBillet || ''];
            var detailParts = [];
            if (nbNormaux > 0) detailParts.push(prix.toFixed(2) + '€ x ' + nbNormaux);
            if (nbVariantes > 0) detailParts.push(prixVar.toFixed(2) + '€ x ' + nbVariantes + ' var.');
            var paypalNote = noteparts.join(' ') + ' - ' + detailParts.join(' + ') + ' = ' + montantAvecFdp.toFixed(2) + '€';
            var paypalNoteJs = paypalNote.replace(/'/g, "\\'");

            var paypalUrl = '';
            if (collecteur.paypal_me) {
                paypalUrl = 'https://paypal.me/' + encodeURIComponent(collecteur.paypal_me) + '/' + montantAvecFdp.toFixed(2);
            } else if (collecteur.paypal_email) {
                paypalUrl = 'https://www.paypal.com/paypalme/' + encodeURIComponent(collecteur.paypal_email);
            }
            if (paypalUrl) {
                paypalNoteHtml = '<div class="paypal-note-hint"><i class="fa-solid fa-paste"></i> Note à coller : ' + escapeHtml(paypalNote) + ' <button type="button" class="btn-copier-note" onclick="event.stopPropagation();navigator.clipboard.writeText(\'' + paypalNoteJs + '\');this.innerHTML=\'<i class=fa-solid fa-check></i> Copié !\';var b=this;setTimeout(function(){b.innerHTML=\'<i class=fa-solid fa-copy></i> Copier\'},2000)"><i class="fa-solid fa-copy"></i> Copier</button></div>';
                paypalBtnHtml = '<a href="' + paypalUrl + '" target="_blank" class="btn-payer"><i class="fa-brands fa-paypal"></i> Payer via PayPal</a>';
            }
        }

        var dateInsc = insc.date_inscription ? new Date(insc.date_inscription).toLocaleDateString('fr-FR') : '';
        var montantClass = isBenef ? 'montant-indefini' : (statut === 'confirme' ? 'montant-paye' : 'montant-non-paye');

        return '<div class="inscription-card">'
            + '<div class="inscription-card-header">'
            + '<strong>' + escapeHtml(((billet.Reference ? billet.Reference + ' ' : '') + (billet.Millesime || '') + (billet.Version ? '-' + billet.Version : '') + (billet.NomBillet ? ' - ' + billet.NomBillet : '')).trim() || 'Billet inconnu') + '</strong>'
            + (insc.collecte_id && collectesMap[insc.collecte_id] ? '<span class="badge-nom-collecte-insc">' + escapeHtml(collectesMap[insc.collecte_id]) + '</span>' : '')
            + (billet.Collecteur ? '<span class="inscription-collecteur"><i class="fa-solid fa-user"></i> ' + escapeHtml(billet.Collecteur) + '</span>' : '')
            + '</div>'
            + '<div class="inscription-card-details">'
            + '<span><i class="fa-solid fa-ticket"></i> ' + (billet.VersionNormaleExiste === false ? (nbVariantes + ' var.') : (nbNormaux + (nbVariantes > 0 ? ' + ' + nbVariantes + ' var.' : ''))) + '</span>'
            + (billet.Categorie === 'Pré collecte'
                ? '<span class="montant-indefini"><i class="fa-solid fa-euro-sign"></i> Prix non défini</span>'
                : (fdpMontant > 0
                    ? '<span class="' + montantClass + '"><i class="fa-solid fa-euro-sign"></i> ' + montant.toFixed(2) + ' \u20AC + fdp ' + fdpMontant.toFixed(2) + ' \u20AC, soit ' + montantAvecFdp.toFixed(2) + ' \u20AC</span>'
                    : '<span class="' + montantClass + '"><i class="fa-solid fa-euro-sign"></i> ' + montant.toFixed(2) + ' \u20AC</span>'))
            + '</div>'
            + '<div class="inscription-card-statuts">'
            + badgeCollecte(billet.Categorie)
            + badgePaiementMembre(statut, insc.id, billet.Categorie, isBenef)
            + '<span class="badge-paiement ' + (insc.envoye ? 'badge-envoye' : 'badge-non-envoye') + '">' + (insc.envoye ? 'Envoy\u00E9' : 'Non envoy\u00E9') + '</span>'
            + '</div>'
            + paypalNoteHtml
            + '<div class="inscription-card-footer">'
            + '<span class="inscription-date"><i class="fa-regular fa-calendar"></i> ' + dateInsc + '</span>'
            + paypalBtnHtml
            + '</div>'
            + (billet.Categorie === 'Pré collecte'
                ? '<div class="inscription-card-actions">'
                    + '<button class="btn-modifier-insc" onclick="ouvrirModifierPreCollecte(' + insc.id + ')"><i class="fa-solid fa-pen"></i> Modifier</button>'
                    + '<button class="btn-desinscrire" onclick="desinscriprePreCollecte(' + insc.id + ')"><i class="fa-solid fa-xmark"></i> Se désinscrire</button>'
                    + '</div>'
                : '')
            + '</div>';
    }

    // Récap global par collecteur (uniquement section "À payer")
    function buildCollecteurRecapHtml(collecteurNom, inscList) {
        var totalGlobal = 0;
        var ids = [];
        var paypalParts = [];
        var totalPaypal = 0;
        var collecteurObj = collecteursMap[collecteurNom] || {};

        inscList.forEach(function(insc) {
            var billet = billetsMap[insc.billet_id] || {};
            var prix = parseFloat(billet.Prix || 0);
            var prixVar = (billet.PrixVariante !== null && billet.PrixVariante !== undefined && billet.PrixVariante !== '') ? parseFloat(billet.PrixVariante) : prix;
            var nbN = insc.nb_normaux || 0;
            var nbV = insc.nb_variantes || 0;
            var montant = (prix * nbN) + (prixVar * nbV);
            var fdp = 0;
            if (billet.PayerFDP === 'oui' && billet.Categorie !== 'Pré collecte') {
                var dest = (membrePays === 'France') ? 'france' : 'international';
                fdp = findFdpPrice(nbN + nbV, dest, (insc.mode_envoi || 'Normal').toLowerCase());
            }
            var total = montant + fdp;
            totalGlobal += total;
            ids.push(insc.id);

            if (insc.mode_paiement === 'PayPal') {
                var refCompact = ((billet.Reference || '') + ' ' + (billet.Millesime || '') + (billet.Version ? '-' + billet.Version : '')).trim();
                paypalParts.push(refCompact + ' ' + total.toFixed(2) + '\u20AC');
                totalPaypal += total;
            }
        });

        if (inscList.length < 2) return ''; // pas la peine pour 1 seule inscription

        var btnPaye = '<button class="btn-jai-paye btn-jai-paye-groupe" onclick="declarerPaiementGroupe(\'' + ids.join(',') + '\')"><i class="fa-solid fa-hand-holding-dollar"></i> J\'ai payé (' + totalGlobal.toFixed(2) + '\u20AC)</button>';

        var paypalNoteHtml = '';
        var paypalBtnHtml = '';
        if (paypalParts.length > 0 && (collecteurObj.paypal_me || collecteurObj.paypal_email)) {
            var note = paypalParts.join(', ') + ' = ' + totalPaypal.toFixed(2) + '\u20AC';
            var noteJs = note.replace(/'/g, "\\'");
            var paypalUrl = collecteurObj.paypal_me
                ? 'https://paypal.me/' + encodeURIComponent(collecteurObj.paypal_me) + '/' + totalPaypal.toFixed(2)
                : 'https://www.paypal.com/paypalme/' + encodeURIComponent(collecteurObj.paypal_email);
            paypalNoteHtml = '<div class="paypal-note-hint"><i class="fa-solid fa-paste"></i> Note à coller : ' + escapeHtml(note)
                + ' <button type="button" class="btn-copier-note" onclick="event.stopPropagation();navigator.clipboard.writeText(\'' + noteJs + '\');this.innerHTML=\'<i class=fa-solid fa-check></i> Copié !\';var b=this;setTimeout(function(){b.innerHTML=\'<i class=fa-solid fa-copy></i> Copier\'},2000)"><i class="fa-solid fa-copy"></i> Copier</button></div>';
            paypalBtnHtml = '<a href="' + paypalUrl + '" target="_blank" class="btn-payer"><i class="fa-brands fa-paypal"></i> Payer ' + totalPaypal.toFixed(2) + '\u20AC via PayPal</a>';
        }

        return '<div class="insc-collecteur-recap">'
            + '<div class="insc-collecteur-recap-total"><i class="fa-solid fa-coins"></i> Total dû : <strong>' + totalGlobal.toFixed(2) + ' \u20AC</strong> (' + inscList.length + ' inscriptions)</div>'
            + paypalNoteHtml
            + '<div class="insc-collecteur-recap-actions">' + btnPaye + paypalBtnHtml + '</div>'
            + '</div>';
    }

    // Double tri : statut (priorité action) puis sous-groupes par collecteur
    var statGroups = [
        { key: 'non_paye',        label: 'À payer',                        icon: 'fa-circle-exclamation', items: [] },
        { key: 'declare',         label: 'Validation paiement en attente', icon: 'fa-clock',              items: [] },
        { key: 'confirme',        label: 'Payés',                          icon: 'fa-check-circle',       items: [] },
        { key: 'prix_non_defini', label: 'Prix non défini',                icon: 'fa-tag',                items: [] },
        { key: 'beneficiaire',    label: 'Bénéficiaire',                   icon: 'fa-star',               items: [] }
    ];

    filteredInscriptions.forEach(function(insc) {
        var billet = billetsMap[insc.billet_id] || {};
        if (billet.Categorie === 'Pré collecte') {
            statGroups[3].items.push(insc);
        } else if (estBeneficiaire(insc, activeEmail)) {
            statGroups[4].items.push(insc);
        } else {
            var statut = insc.statut_paiement || 'non_paye';
            if (statut === 'non_paye')     statGroups[0].items.push(insc);
            else if (statut === 'declare') statGroups[1].items.push(insc);
            else                           statGroups[2].items.push(insc);
        }
    });

    var html = '';
    statGroups.forEach(function(group) {
        if (group.items.length === 0) return;
        html += '<div class="insc-statut-section">'
            + '<div class="insc-statut-header" role="heading" aria-level="2">'
            + '<i class="fa-solid ' + group.icon + '"></i> '
            + group.label
            + ' <span class="insc-statut-count">(' + group.items.length + ')</span>'
            + '</div>';

        if (group.key === 'prix_non_defini') {
            // Pré-collectes : liste simple, pas de collecteur assigné
            group.items.forEach(function(insc) { html += renderInscriptionCard(insc); });
        } else {
            // Sous-groupes par collecteur (ordre d'apparition)
            var byCollecteur = {};
            var colOrder = [];
            group.items.forEach(function(insc) {
                var billet = billetsMap[insc.billet_id] || {};
                var col = billet.Collecteur || '(sans collecteur)';
                if (!byCollecteur[col]) { byCollecteur[col] = []; colOrder.push(col); }
                byCollecteur[col].push(insc);
            });
            colOrder.forEach(function(col) {
                var headerExtra = '';
                if (group.key === 'non_paye') {
                    headerExtra = buildCollecteurRecapHtml(col, byCollecteur[col]);
                }
                html += '<div class="insc-collecteur-group">'
                    + '<div class="insc-collecteur-header" role="heading" aria-level="3">'
                    + '<div class="insc-collecteur-header-title"><i class="fa-solid fa-user"></i> ' + escapeHtml(col) + '</div>'
                    + headerExtra
                    + '</div>';
                byCollecteur[col].forEach(function(insc) { html += renderInscriptionCard(insc); });
                html += '</div>';
            });
        }
        html += '</div>';
    });

    if (filteredInscriptions.length === 0 && mesInscriptions.length > 0) {
        html = '<div class="inscriptions-empty-state"><i class="fa-solid fa-filter"></i><p>Aucune inscription avec ce filtre.</p></div>';
    }

    container.innerHTML = html;

    // Résumé en haut (calcul sur toutes les inscriptions, pas le filtre)
    var totalDuGlobal = 0;
    var totalEnAttenteGlobal = 0;
    mesInscriptions.forEach(function(insc) {
        var b = billetsMap[insc.billet_id] || {};
        var p = parseFloat(b.Prix || 0);
        var pv = (b.PrixVariante !== null && b.PrixVariante !== undefined && b.PrixVariante !== '') ? parseFloat(b.PrixVariante) : p;
        var m = (p * (insc.nb_normaux || 0)) + (pv * (insc.nb_variantes || 0));
        var fdp = 0;
        if (b.PayerFDP === 'oui' && b.Categorie !== 'Pré collecte') {
            var d = (membrePays === 'France') ? 'france' : 'international';
            fdp = findFdpPrice((insc.nb_normaux || 0) + (insc.nb_variantes || 0), d, (insc.mode_envoi || 'Normal').toLowerCase());
        }
        var total = m + fdp;
        var s = insc.statut_paiement || 'non_paye';
        if (b.Categorie !== 'Pré collecte' && !estBeneficiaire(insc, activeEmail)) {
            if (s === 'non_paye') totalDuGlobal += total;
            else if (s === 'declare') totalEnAttenteGlobal += total;
        }
    });

    if (summary) {
        summary.innerHTML = onboardingHtml + '<div class="inscriptions-resume">'
            + '<span>' + mesInscriptions.length + ' inscription(s)</span>'
            + '<span class="inscriptions-resume-montants">'
            + '<span class="montant-non-paye"><strong>' + totalDuGlobal.toFixed(2) + ' \u20AC restant \u00E0 payer</strong></span>'
            + (totalEnAttenteGlobal > 0 ? '<span class="montant-en-attente"><strong>' + totalEnAttenteGlobal.toFixed(2) + ' \u20AC en attente de validation par les collecteurs</strong></span>' : '')
            + '</span>'
            + '</div>';
    }

    // #12 — Compteur sur l'onglet "Mes inscriptions"
    var tabBtns = document.querySelectorAll('#inscriptions-tabs .tab-btn');
    if (tabBtns[0]) {
        tabBtns[0].innerHTML = '<i class="fa-solid fa-clipboard-list"></i> Mes inscriptions <span class="tab-badge">' + mesInscriptions.length + '</span>';
    }
}

// ============================================================
// 3. BADGE PAIEMENT ET DECLARATION
// ============================================================

// Story 9.7 — Badge statut collecte
function badgeCollecte(categorie) {
    var cat = categorie || 'Pré collecte';
    if (cat === 'Terminé') {
        return '<span class="badge-collecte badge-collecte-termine">Collecte terminée</span>';
    }
    if (cat === 'Collecte') {
        return '<span class="badge-collecte badge-collecte-en-cours">Collecte en cours</span>';
    }
    // Pré collecte (défaut)
    return '<span class="badge-collecte badge-collecte-pre">Pré-collecte</span>';
}

function badgePaiementMembre(statut, inscriptionId, categorie, isBeneficiaire) {
    if (isBeneficiaire) return '<span class="badge-paiement badge-beneficiaire">Bénéficiaire</span>';
    if (statut === 'confirme') {
        return '<span class="badge-paiement badge-paye">Payé</span>';
    }
    if (statut === 'declare') {
        // QW-4 — Badge raccourci avec tooltip pour le détail
        return '<span class="badge-paiement badge-declare" title="En attente de vérification par le collecteur">En attente</span>';
    }
    // non_paye — Story 9.8 : bloquer en pré-collecte
    if (categorie === 'Pré collecte') {
        return '<span class="badge-paiement badge-prix-indefini">Prix non défini</span>';
    }
    return '<button class="btn-jai-paye" title="Cliquez pour déclarer votre paiement" onclick="declarerPaiement(' + inscriptionId + ')"><i class="fa-solid fa-hand-holding-dollar"></i> J\'ai payé</button>';
}

// QW-3 — Confirmation avant déclaration de paiement
var pendingDeclarationId = null;
var pendingDeclarationIds = null; // mode groupé

function declarerPaiementGroupe(idsCsv) {
    var ids = String(idsCsv || '').split(',').map(function(s) { return parseInt(s, 10); }).filter(function(n) { return !isNaN(n); });
    if (ids.length === 0) return;
    var totalGlobal = 0;
    var collecteur = '';
    ids.forEach(function(id) {
        for (var i = 0; i < mesInscriptions.length; i++) {
            if (mesInscriptions[i].id !== id) continue;
            var insc = mesInscriptions[i];
            var billet = billetsMap[insc.billet_id] || {};
            if (!collecteur) collecteur = billet.Collecteur || '';
            var prix = parseFloat(billet.Prix || 0);
            var prixVar = (billet.PrixVariante !== null && billet.PrixVariante !== undefined && billet.PrixVariante !== '') ? parseFloat(billet.PrixVariante) : prix;
            var m = (prix * (insc.nb_normaux || 0)) + (prixVar * (insc.nb_variantes || 0));
            var fdp = 0;
            if (billet.PayerFDP === 'oui' && billet.Categorie !== 'Pré collecte') {
                var dest = (membrePays === 'France') ? 'france' : 'international';
                fdp = findFdpPrice((insc.nb_normaux || 0) + (insc.nb_variantes || 0), dest, (insc.mode_envoi || 'Normal').toLowerCase());
            }
            totalGlobal += m + fdp;
            break;
        }
    });
    pendingDeclarationIds = ids;
    pendingDeclarationId = null;
    var modal = document.getElementById('confirm-paiement-modal');
    var msgEl = document.getElementById('confirm-paiement-msg');
    if (msgEl) {
        msgEl.innerHTML = 'Confirmez-vous avoir payé <strong>' + totalGlobal.toFixed(2) + ' \u20AC</strong>'
            + (collecteur ? ' à <strong>' + escapeHtml(collecteur) + '</strong>' : '')
            + ' pour <strong>' + ids.length + ' inscriptions</strong> ?';
    }
    if (modal) modal.style.display = 'flex';
}

function declarerPaiement(inscriptionId) {
    // Trouver le billet associé pour afficher le montant
    var insc = null;
    for (var i = 0; i < mesInscriptions.length; i++) {
        if (mesInscriptions[i].id === inscriptionId) { insc = mesInscriptions[i]; break; }
    }
    var billet = insc ? billetsMap[insc.billet_id] : null;
    var collecteur = billet ? (billet.Collecteur || '') : '';
    var prix = parseFloat((billet && billet.Prix) || 0);
    var prixVar = (billet && billet.PrixVariante !== null && billet.PrixVariante !== undefined && billet.PrixVariante !== '') ? parseFloat(billet.PrixVariante) : prix;
    var montant = insc ? (prix * (insc.nb_normaux || 0)) + (prixVar * (insc.nb_variantes || 0)) : 0;

    pendingDeclarationId = inscriptionId;
    var modal = document.getElementById('confirm-paiement-modal');
    var msgEl = document.getElementById('confirm-paiement-msg');
    if (msgEl) {
        msgEl.innerHTML = 'Confirmez-vous avoir payé <strong>' + montant.toFixed(2) + ' \u20AC</strong>'
            + (collecteur ? ' à <strong>' + escapeHtml(collecteur) + '</strong>' : '') + ' ?';
    }
    if (modal) modal.style.display = 'flex';
}

function confirmerDeclarationPaiement() {
    var modal = document.getElementById('confirm-paiement-modal');
    if (modal) modal.style.display = 'none';

    var ids = [];
    if (pendingDeclarationIds && pendingDeclarationIds.length > 0) {
        ids = pendingDeclarationIds.slice();
    } else if (pendingDeclarationId) {
        ids = [pendingDeclarationId];
    }
    pendingDeclarationId = null;
    pendingDeclarationIds = null;
    if (ids.length === 0) return;

    var query = ids.length === 1 ? 'id=eq.' + ids[0] : 'id=in.(' + ids.join(',') + ')';
    supabaseFetch('/rest/v1/inscriptions?' + query, {
        method: 'PATCH',
        body: JSON.stringify({ statut_paiement: 'declare' })
    })
    .then(function() {
        for (var i = 0; i < mesInscriptions.length; i++) {
            if (ids.indexOf(mesInscriptions[i].id) !== -1) {
                mesInscriptions[i].statut_paiement = 'declare';
            }
        }
        renderInscriptions();
        showToast(ids.length > 1 ? (ids.length + ' paiements déclarés — le collecteur sera notifié') : 'Paiement déclaré — le collecteur sera notifié');
    })
    .catch(function(error) {
        console.error('Erreur déclaration paiement:', error);
        showToast('Erreur lors de la déclaration', 'error');
    });
}

function annulerDeclarationPaiement() {
    var modal = document.getElementById('confirm-paiement-modal');
    if (modal) modal.style.display = 'none';
    pendingDeclarationId = null;
    pendingDeclarationIds = null;
}

// ============================================================
// Modifier / se désinscrire d'une pré-collecte
// ============================================================

function ouvrirModifierPreCollecte(inscId) {
    var insc = null;
    for (var i = 0; i < mesInscriptions.length; i++) {
        if (mesInscriptions[i].id === inscId) { insc = mesInscriptions[i]; break; }
    }
    if (!insc) return;
    var billet = billetsMap[insc.billet_id] || {};
    modifierInscCurrent = { id: inscId, billet: billet };

    var titre = ((billet.Reference ? billet.Reference + ' ' : '') + (billet.Millesime || '') + (billet.Version ? '-' + billet.Version : '') + (billet.NomBillet ? ' - ' + billet.NomBillet : '')).trim();
    var hasNormale = billet.VersionNormaleExiste !== false && billet.VersionNormaleExiste !== 'false';
    var hasVariante = !!(billet.HasVariante && billet.HasVariante !== 'N');

    document.getElementById('modifier-preinsc-titre').textContent = titre || 'Billet inconnu';

    var fields = '';
    if (hasNormale) {
        fields += '<div class="preinsc-qty-field">'
            + '<label for="modifier-preinsc-normaux">Billets normaux</label>'
            + '<input type="number" id="modifier-preinsc-normaux" min="0" value="' + (insc.nb_normaux || 0) + '">'
            + '</div>';
    }
    if (hasVariante) {
        fields += '<div class="preinsc-qty-field">'
            + '<label for="modifier-preinsc-variantes">Variantes</label>'
            + '<input type="number" id="modifier-preinsc-variantes" min="0" value="' + (insc.nb_variantes || 0) + '">'
            + '</div>';
    }
    document.getElementById('modifier-preinsc-fields').innerHTML = fields;
    document.getElementById('modifier-preinsc-modal').style.display = 'flex';
}

function fermerModifierPreCollecte() {
    var modal = document.getElementById('modifier-preinsc-modal');
    if (modal) modal.style.display = 'none';
    modifierInscCurrent = null;
}

function confirmerModifierPreCollecte() {
    if (!modifierInscCurrent) return;
    var billet = modifierInscCurrent.billet;
    var hasNormale = billet.VersionNormaleExiste !== false && billet.VersionNormaleExiste !== 'false';
    var hasVariante = !!(billet.HasVariante && billet.HasVariante !== 'N');

    var normauxEl = document.getElementById('modifier-preinsc-normaux');
    var variantesEl = document.getElementById('modifier-preinsc-variantes');
    var nbNormaux = (hasNormale && normauxEl) ? (parseInt(normauxEl.value) || 0) : 0;
    var nbVariantes = (hasVariante && variantesEl) ? (parseInt(variantesEl.value) || 0) : 0;

    if (nbNormaux + nbVariantes === 0) {
        showToast('Sélectionnez au moins un billet', 'error');
        return;
    }

    var inscId = modifierInscCurrent.id;
    fermerModifierPreCollecte();

    supabaseFetch('/rest/v1/inscriptions?id=eq.' + inscId, {
        method: 'PATCH',
        body: JSON.stringify({ nb_normaux: nbNormaux, nb_variantes: nbVariantes })
    })
    .then(function() {
        for (var i = 0; i < mesInscriptions.length; i++) {
            if (mesInscriptions[i].id === inscId) {
                mesInscriptions[i].nb_normaux = nbNormaux;
                mesInscriptions[i].nb_variantes = nbVariantes;
                break;
            }
        }
        renderInscriptions();
        showToast('Inscription mise à jour');
    })
    .catch(function() {
        showToast('Erreur lors de la modification', 'error');
    });
}

function desinscriprePreCollecte(inscId) {
    var insc = null;
    for (var i = 0; i < mesInscriptions.length; i++) {
        if (mesInscriptions[i].id === inscId) { insc = mesInscriptions[i]; break; }
    }
    var billet = insc ? (billetsMap[insc.billet_id] || {}) : {};
    var titre = billet.NomBillet || 'cette collecte';

    if (!confirm('Se désinscrire de « ' + titre + ' » ?\n\nVotre inscription sera supprimée.')) return;

    supabaseFetch('/rest/v1/inscriptions?id=eq.' + inscId, { method: 'DELETE' })
    .then(function() {
        mesInscriptions = mesInscriptions.filter(function(i) { return i.id !== inscId; });
        renderInscriptions();
        showToast('Désinscription effectuée');
    })
    .catch(function() {
        showToast('Erreur lors de la désinscription', 'error');
    });
}

// ============================================================
// 4. ONGLETS + MES ENVOIS — VUE MEMBRE (Story 5.10 + 5.11)
// ============================================================

function showInscriptionsTab(tab) {
    var inscView = document.getElementById('inscriptions-view');
    var envoisView = document.getElementById('envois-view');
    if (!inscView || !envoisView) return;

    inscView.style.display = tab === 'inscriptions' ? '' : 'none';
    envoisView.style.display = tab === 'envois' ? '' : 'none';

    var btns = document.querySelectorAll('#inscriptions-tabs .tab-btn');
    for (var i = 0; i < btns.length; i++) {
        btns[i].classList.remove('active');
    }
    var idx = tab === 'inscriptions' ? 0 : 1;
    if (btns[idx]) btns[idx].classList.add('active');

    if (tab === 'envois') loadMesEnvois();
}

var envoisData = { enveloppes: [], inscByEnv: {}, billetsEnvoisMap: {}, inscSansEnveloppe: [] };

function loadMesEnvois() {
    var email = window.getActiveEmail();
    if (!email) return;

    // Charger en parallèle : enveloppes + toutes les inscriptions actives du membre
    var pEnveloppes = supabaseFetch('/rest/v1/enveloppes?membre_email=eq.' + encodeURIComponent(email) + '&select=*&order=date_creation.desc');
    var pInscriptions = supabaseFetch('/rest/v1/inscriptions?membre_email=eq.' + encodeURIComponent(email) + '&pas_interesse=eq.false&select=*');

    Promise.all([pEnveloppes, pInscriptions])
        .then(function(results) {
            var enveloppes = results[0] || [];
            var toutesInscriptions = results[1] || [];
            envoisData.enveloppes = enveloppes;

            // Séparer inscriptions avec/sans enveloppe
            var inscByEnv = {};
            var inscSansEnveloppe = [];
            toutesInscriptions.forEach(function(insc) {
                if (insc.enveloppe_id) {
                    if (!inscByEnv[insc.enveloppe_id]) inscByEnv[insc.enveloppe_id] = [];
                    inscByEnv[insc.enveloppe_id].push(insc);
                } else if (!insc.envoye) {
                    // Inscription sans enveloppe et pas encore envoyée
                    inscSansEnveloppe.push(insc);
                }
            });
            envoisData.inscByEnv = inscByEnv;
            envoisData.inscSansEnveloppe = inscSansEnveloppe;

            // Charger les billets pour toutes les inscriptions
            var billetIds = toutesInscriptions.map(function(i) { return i.billet_id; });
            var uniqueIds = billetIds.filter(function(id, idx) { return billetIds.indexOf(id) === idx; });
            if (uniqueIds.length === 0) {
                envoisData.billetsEnvoisMap = {};
                renderMesEnvois();
                return;
            }

            return supabaseFetch('/rest/v1/billets?id=in.(' + uniqueIds.join(',') + ')&select=id,"NomBillet","PayerFDP","Collecteur","Categorie"')
                .then(function(billets) {
                    var map = {};
                    (billets || []).forEach(function(b) { map[b.id] = b; });
                    envoisData.billetsEnvoisMap = map;
                    // Exclure les pré-collectes de la section "En attente de préparation"
                    envoisData.inscSansEnveloppe = envoisData.inscSansEnveloppe.filter(function(insc) {
                        var b = map[insc.billet_id];
                        return !(b && b.Categorie === 'Pré collecte');
                    });
                    renderMesEnvois();
                });
        })
        .catch(function(error) {
            console.error('Erreur chargement envois:', error);
        });
}

function renderMesEnvois() {
    var container = document.getElementById('envois-view');
    if (!container) return;

    var enveloppes = envoisData.enveloppes;
    var inscByEnv = envoisData.inscByEnv;
    var billetsMap2 = envoisData.billetsEnvoisMap;
    var inscSansEnveloppe = envoisData.inscSansEnveloppe;

    var enCours = enveloppes.filter(function(e) { return e.statut === 'en_cours'; });
    var expediees = enveloppes.filter(function(e) { return e.statut === 'expediee'; });
    var recues = enveloppes.filter(function(e) { return e.statut === 'recue'; });

    // Enveloppes en cours avec billets prêts
    var enCoursAvecBillets = enCours.filter(function(env) {
        var inscs = inscByEnv[env.id] || [];
        return inscs.some(function(i) { return i.statut_livraison === 'pret_a_envoyer'; });
    });

    // Grouper inscriptions sans enveloppe par collecteur
    var sansEnvParCollecteur = {};
    inscSansEnveloppe.forEach(function(insc) {
        var b = billetsMap2[insc.billet_id];
        var collecteur = (b && b.Collecteur) || '(sans collecteur)';
        if (!sansEnvParCollecteur[collecteur]) sansEnvParCollecteur[collecteur] = [];
        sansEnvParCollecteur[collecteur].push(insc);
    });
    var collecteursSansEnv = Object.keys(sansEnvParCollecteur);

    var rien = enCoursAvecBillets.length === 0 && collecteursSansEnv.length === 0 && expediees.length === 0 && recues.length === 0;
    if (rien) {
        container.innerHTML = '<div class="inscriptions-empty-state">'
            + '<i class="fa-solid fa-circle-info"></i>'
            + '<p>Aucun envoi en cours.</p>'
            + '</div>';
        return;
    }

    var html = '';

    // === Section "Chez le collecteur" ===
    if (enCoursAvecBillets.length > 0 || collecteursSansEnv.length > 0) {
        html += '<div class="envois-section">'
            + '<h3><i class="fa-solid fa-box-archive"></i> Chez le collecteur</h3>';

        // Enveloppes en cours avec billets prêts à envoyer
        enCoursAvecBillets.forEach(function(env) {
            var inscs = (inscByEnv[env.id] || []).filter(function(i) {
                return i.statut_livraison === 'pret_a_envoyer';
            });
            var nbBillets = inscs.reduce(function(sum, i) {
                return sum + (i.nb_normaux || 0) + (i.nb_variantes || 0);
            }, 0);
            var nomsBillets = inscs.map(function(i) {
                var b = billetsMap2[i.billet_id];
                return b ? b.NomBillet : 'Billet';
            }).join(', ');

            // Vérifier si TOUS les billets de cette enveloppe ont FDP demandé
            var tousAvecFDP = inscs.length > 0 && inscs.every(function(i) {
                var b = billetsMap2[i.billet_id];
                return b && b.PayerFDP === 'oui';
            });

            html += '<div class="envoi-carte">'
                + '<div class="envoi-carte-header">'
                + '<span><i class="fa-solid fa-user"></i> ' + escapeHtml(env.collecteur_alias || '') + '</span>'
                + '<span class="envoi-nb-billets">' + nbBillets + ' billet(s) prêt(s) à envoyer</span>'
                + '</div>'
                + '<div class="envoi-carte-details">'
                + '<span>' + escapeHtml(nomsBillets) + '</span>'
                + '</div>';

            if (tousAvecFDP) {
                html += '<span class="envoi-info-fdp"><i class="fa-solid fa-info-circle"></i> '
                    + 'Le collecteur vous enverra ces billets dès qu\'il les aura répartis.'
                    + '</span>';
            } else if (env.demande_envoi) {
                var dateStr = env.date_demande_envoi ? new Date(env.date_demande_envoi).toLocaleDateString('fr-FR') : '';
                var modeDemande = env.mode_envoi || 'normal';
                var modeLabelDemande = { normal: 'Normal', suivi: 'Suivi', recommande_r1: 'Recommandé R1', recommande_r2: 'Recommandé R2', recommande_r3: 'Recommandé R3' }[modeDemande] || modeDemande;
                html += '<span class="demande-envoyee"><i class="fa-solid fa-check"></i> Demande d\'envoi transmise le ' + dateStr + ' — ' + modeLabelDemande + '</span>';
            } else {
                html += '<div id="demande-envoi-' + env.id + '">'
                    + '<button onclick="afficherFormDemandeEnvoi(' + env.id + ')" class="btn-demande-envoi">'
                    + '<i class="fa-solid fa-paper-plane"></i> Je souhaite recevoir mes billets'
                    + '</button>'
                    + '</div>';
            }

            html += '</div>';
        });

        // Inscriptions sans enveloppe (en attente de préparation par le collecteur)
        collecteursSansEnv.forEach(function(collecteur) {
            var inscs = sansEnvParCollecteur[collecteur];
            var nbBillets = inscs.reduce(function(sum, i) {
                return sum + (i.nb_normaux || 0) + (i.nb_variantes || 0);
            }, 0);
            var nomsBillets = inscs.map(function(i) {
                var b = billetsMap2[i.billet_id];
                return b ? b.NomBillet : 'Billet';
            }).join(', ');

            html += '<div class="envoi-carte envoi-carte-attente">'
                + '<div class="envoi-carte-header">'
                + '<span><i class="fa-solid fa-user"></i> ' + escapeHtml(collecteur) + '</span>'
                + '<span class="envoi-nb-billets">' + nbBillets + ' billet(s)</span>'
                + '</div>'
                + '<div class="envoi-carte-details">'
                + '<span>' + escapeHtml(nomsBillets) + '</span>'
                + '</div>'
                + '<span class="envoi-info-fdp"><i class="fa-solid fa-hourglass-half"></i> '
                + 'En attente de préparation par le collecteur'
                + '</span>'
                + '</div>';
        });

        html += '</div>';
    }

    // === Section "En cours d'acheminement" (expédiées) ===
    if (expediees.length > 0) {
        html += '<div class="envois-section">'
            + '<h3><i class="fa-solid fa-truck"></i> En cours d\'acheminement</h3>';

        expediees.forEach(function(env) {
            html += renderEnvoiCarteExpediee(env, inscByEnv, billetsMap2, false);
        });

        html += '</div>';
    }

    // === Section "Reçus" ===
    if (recues.length > 0) {
        html += '<div class="envois-section">'
            + '<h3><i class="fa-solid fa-circle-check"></i> Reçus</h3>';

        recues.forEach(function(env) {
            html += renderEnvoiCarteExpediee(env, inscByEnv, billetsMap2, true);
        });

        html += '</div>';
    }

    container.innerHTML = html;
}

function renderEnvoiCarteExpediee(env, inscByEnv, billetsMap2, estRecue) {
    var inscs = inscByEnv[env.id] || [];
    var nbBillets = inscs.reduce(function(sum, i) {
        return sum + (i.nb_normaux || 0) + (i.nb_variantes || 0);
    }, 0);
    var nomsBillets = inscs.map(function(i) {
        var b = billetsMap2[i.billet_id];
        return b ? b.NomBillet : 'Billet';
    }).join(', ');

    var dateExp = env.date_expedition ? new Date(env.date_expedition).toLocaleDateString('fr-FR') : '';
    var modeEnvoi = env.mode_envoi_reel || 'normal';
    var modeLabel = { normal: 'Normal', suivi: 'Suivi', r1: 'Recommandé R1', r2: 'Recommandé R2', r3: 'Recommandé R3' }[modeEnvoi] || modeEnvoi;

    var html = '<div class="envoi-carte' + (estRecue ? ' envoi-carte-recue' : ' envoi-carte-expedition') + '">'
        + '<div class="envoi-carte-header">'
        + '<span><i class="fa-solid fa-user"></i> ' + escapeHtml(env.collecteur_alias || '') + '</span>'
        + '<span class="envoi-date"><i class="fa-solid fa-calendar"></i> Expédié le ' + dateExp + '</span>'
        + '</div>'
        + '<div class="envoi-carte-details">'
        + '<span><i class="fa-solid fa-ticket"></i> ' + nbBillets + ' billet(s) : ' + escapeHtml(nomsBillets) + '</span>'
        + '<span><i class="fa-solid fa-truck"></i> ' + modeLabel + '</span>';

    if (env.numero_suivi) {
        html += '<span><i class="fa-solid fa-barcode"></i> N° suivi : ' + escapeHtml(env.numero_suivi) + '</span>';
    }

    html += '</div>';

    if (estRecue) {
        var dateRec = env.date_reception ? new Date(env.date_reception).toLocaleDateString('fr-FR') : '';
        html += '<span class="envoi-recu"><i class="fa-solid fa-circle-check"></i> Reçu le ' + dateRec + '</span>';
    } else {
        html += '<button onclick="confirmerReception(' + env.id + ')" class="btn-confirmer-reception">'
            + '<i class="fa-solid fa-box-open"></i> J\'ai bien reçu cette enveloppe'
            + '</button>';
    }

    html += '</div>';
    return html;
}

function afficherFormDemandeEnvoi(enveloppeId) {
    var container = document.getElementById('demande-envoi-' + enveloppeId);
    if (!container) return;

    container.innerHTML = '<div class="demande-envoi-form">'
        + '<label class="expedition-form-label">Mode d\'envoi souhaité</label>'
        + '<select id="mode-envoi-demande-' + enveloppeId + '" class="expedition-form-select">'
        + '<option value="normal">Normal</option>'
        + '<option value="suivi">Suivi</option>'
        + '<option value="recommande_r1">Recommandé R1</option>'
        + '<option value="recommande_r2">Recommandé R2</option>'
        + '<option value="recommande_r3">Recommandé R3</option>'
        + '</select>'
        + '<div class="demande-envoi-actions">'
        + '<button onclick="confirmerDemandeEnvoi(' + enveloppeId + ')" class="btn-confirmer-expedition">'
        + '<i class="fa-solid fa-paper-plane"></i> Confirmer la demande'
        + '</button>'
        + '<button onclick="loadMesEnvois()" class="btn-annuler-expedition">'
        + '<i class="fa-solid fa-xmark"></i> Annuler'
        + '</button>'
        + '</div>'
        + '</div>';
}

function confirmerDemandeEnvoi(enveloppeId) {
    var select = document.getElementById('mode-envoi-demande-' + enveloppeId);
    var modeEnvoi = select ? select.value : 'normal';

    supabaseFetch('/rest/v1/enveloppes?id=eq.' + enveloppeId, {
        method: 'PATCH',
        body: JSON.stringify({
            demande_envoi: true,
            date_demande_envoi: new Date().toISOString(),
            mode_envoi: modeEnvoi
        })
    })
    .then(function() {
        showToast('Votre demande a été transmise au collecteur');
        loadMesEnvois();
    })
    .catch(function(error) {
        console.error('Erreur demande envoi:', error);
        showToast('Erreur lors de la demande', 'error');
    });
}

function confirmerReception(enveloppeId) {
    supabaseFetch('/rest/v1/enveloppes?id=eq.' + enveloppeId, {
        method: 'PATCH',
        body: JSON.stringify({
            statut: 'recue',
            date_reception: new Date().toISOString()
        })
    })
    .then(function() {
        showToast('Réception confirmée — merci !');
        loadMesEnvois();
    })
    .catch(function(error) {
        console.error('Erreur confirmation réception:', error);
        showToast('Erreur lors de la confirmation', 'error');
    });
}

// ============================================================
// 5. INITIALISATION
// ============================================================

document.addEventListener('DOMContentLoaded', function() {
    firebase.auth().onAuthStateChanged(function(user) {
        if (user) {
            loadMesInscriptions();
        }
    });
});
