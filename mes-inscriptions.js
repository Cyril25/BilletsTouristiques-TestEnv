// ============================================================
// MES INSCRIPTIONS — Vue membre de toutes ses inscriptions
// Story 5.6
// ============================================================

var mesInscriptions = [];
var billetsMap = {};
var collecteursMap = {};
var membrePays = '';
var fraisPortData = [];
var currentInscFilter = 'tous'; // #9 — filtre actif

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
            return supabaseFetch('/rest/v1/billets?' + idsParam + '&select=id,"NomBillet","Ville","Collecteur","Prix","PrixVariante","Categorie","PayerFDP","Reference","Millesime","Version"');
        })
        .then(function(billets) {
            if (billets) {
                billetsMap = {};
                billets.forEach(function(b) { billetsMap[b.id] = b; });
            }

            // Étape 3 : charger collecteurs, pays du membre, frais de port en parallèle
            return Promise.all([
                supabaseFetch('/rest/v1/collecteurs?select=alias,paypal_email,paypal_me'),
                supabaseFetch('/rest/v1/membres?email=eq.' + encodeURIComponent(email) + '&select=pays'),
                supabaseFetch('/rest/v1/frais_port?annee=eq.' + annee + '&select=*')
            ]);
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
    // Trouver le bouton correspondant
    var filterMap = { 'tous': 0, 'non_paye': 1, 'declare': 2, 'confirme': 3 };
    if (btns[filterMap[statut]]) btns[filterMap[statut]].classList.add('active');
    renderInscriptions();
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
    if (currentInscFilter !== 'tous') {
        filteredInscriptions = mesInscriptions.filter(function(insc) {
            return (insc.statut_paiement || 'non_paye') === currentInscFilter;
        });
    }

    var totalDu = 0;
    var totalEnAttente = 0;

    // #11 — Grouper par collecteur
    var parCollecteur = {};
    var ordreCollecteurs = [];
    filteredInscriptions.forEach(function(insc) {
        var billet = billetsMap[insc.billet_id] || {};
        var collecteurAlias = billet.Collecteur || '\u2014';
        if (!parCollecteur[collecteurAlias]) {
            parCollecteur[collecteurAlias] = [];
            ordreCollecteurs.push(collecteurAlias);
        }
        parCollecteur[collecteurAlias].push(insc);
    });

    function renderInscriptionCard(insc) {
        var billet = billetsMap[insc.billet_id] || {};
        var prix = parseFloat(billet.Prix || 0);
        var prixVar = (billet.PrixVariante !== null && billet.PrixVariante !== undefined && billet.PrixVariante !== '') ? parseFloat(billet.PrixVariante) : prix;
        var nbNormaux = insc.nb_normaux || 0;
        var nbVariantes = insc.nb_variantes || 0;
        var montant = (prix * nbNormaux) + (prixVar * nbVariantes);
        var statut = insc.statut_paiement || 'non_paye';

        var fdpMontant = 0;
        if (billet.PayerFDP === 'oui' && billet.Categorie !== 'Pré collecte') {
            var nbTotal = nbNormaux + nbVariantes;
            var dest = (membrePays === 'France') ? 'france' : 'international';
            var typeEnvoi = (insc.mode_envoi || 'Normal').toLowerCase();
            fdpMontant = findFdpPrice(nbTotal, dest, typeEnvoi);
        }
        var montantAvecFdp = montant + fdpMontant;

        if (billet.Categorie !== 'Pré collecte') {
            if (statut === 'non_paye') totalDu += montantAvecFdp;
            else if (statut === 'declare') totalEnAttente += montantAvecFdp;
        }

        var collecteur = collecteursMap[billet.Collecteur] || {};
        var paypalNoteHtml = '';
        var paypalBtnHtml = '';
        if (statut === 'non_paye' && insc.mode_paiement === 'PayPal' && billet.Categorie !== 'Pré collecte') {
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
        var montantClass = statut === 'confirme' ? 'montant-paye' : 'montant-non-paye';

        return '<div class="inscription-card">'
            + '<div class="inscription-card-header">'
            + '<strong>' + escapeHtml(billet.NomBillet || 'Billet inconnu') + '</strong>'
            + '<span class="inscription-ville"><i class="fa-solid fa-location-dot"></i> ' + escapeHtml(billet.Ville || '') + '</span>'
            + '</div>'
            + '<div class="inscription-card-details">'
            + '<span><i class="fa-solid fa-ticket"></i> ' + (billet.VersionNormaleExiste === false ? (nbVariantes + ' var.') : (nbNormaux + (nbVariantes > 0 ? ' + ' + nbVariantes + ' var.' : ''))) + '</span>'
            + (billet.Categorie === 'Pré collecte'
                ? '<span class="montant-indefini"><i class="fa-solid fa-euro-sign"></i> En attente</span>'
                : (fdpMontant > 0
                    ? '<span class="' + montantClass + '"><i class="fa-solid fa-euro-sign"></i> ' + montant.toFixed(2) + ' \u20AC + fdp ' + fdpMontant.toFixed(2) + ' \u20AC, soit ' + montantAvecFdp.toFixed(2) + ' \u20AC</span>'
                    : '<span class="' + montantClass + '"><i class="fa-solid fa-euro-sign"></i> ' + montant.toFixed(2) + ' \u20AC</span>'))
            + '</div>'
            + '<div class="inscription-card-statuts">'
            + badgeCollecte(billet.Categorie)
            + badgePaiementMembre(statut, insc.id, billet.Categorie)
            + '<span class="badge-paiement ' + (insc.envoye ? 'badge-envoye' : 'badge-non-envoye') + '">' + (insc.envoye ? 'Envoy\u00E9' : 'Non envoy\u00E9') + '</span>'
            + '</div>'
            + paypalNoteHtml
            + '<div class="inscription-card-footer">'
            + '<span class="inscription-date"><i class="fa-regular fa-calendar"></i> ' + dateInsc + '</span>'
            + paypalBtnHtml
            + '</div>'
            + '</div>';
    }

    // Priorité d'affichage : 0=Collecte non payée, 1=Pré-collecte, 2=Collecte payée
    function inscPriorite(insc) {
        var billet = billetsMap[insc.billet_id] || {};
        var cat = billet.Categorie || 'Pré collecte';
        var statut = insc.statut_paiement || 'non_paye';
        if (cat === 'Collecte' && statut === 'non_paye') return 0;
        if (cat === 'Pré collecte') return 1;
        return 2; // Collecte déclarée ou confirmée
    }

    // #11 — Rendu groupé par collecteur (header seulement si > 1 collecteur)
    var html = '';
    var multiCollecteurs = ordreCollecteurs.length > 1;
    ordreCollecteurs.forEach(function(alias) {
        var inscs = parCollecteur[alias].slice().sort(function(a, b) {
            return inscPriorite(a) - inscPriorite(b);
        });
        if (multiCollecteurs) {
            html += '<div class="inscription-group-header"><i class="fa-solid fa-user"></i> ' + escapeHtml(alias) + ' <span class="inscription-group-count">(' + inscs.length + ')</span></div>';
        }
        inscs.forEach(function(insc) {
            html += renderInscriptionCard(insc);
        });
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
        if (b.Categorie !== 'Pré collecte') {
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

function badgePaiementMembre(statut, inscriptionId, categorie) {
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
    if (!pendingDeclarationId) return;
    var inscriptionId = pendingDeclarationId;
    pendingDeclarationId = null;

    supabaseFetch('/rest/v1/inscriptions?id=eq.' + inscriptionId, {
        method: 'PATCH',
        body: JSON.stringify({ statut_paiement: 'declare' })
    })
    .then(function() {
        for (var i = 0; i < mesInscriptions.length; i++) {
            if (mesInscriptions[i].id === inscriptionId) {
                mesInscriptions[i].statut_paiement = 'declare';
                break;
            }
        }
        renderInscriptions();
        showToast('Paiement déclaré — le collecteur sera notifié');
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

            return supabaseFetch('/rest/v1/billets?id=in.(' + uniqueIds.join(',') + ')&select=id,"NomBillet","PayerFDP","Collecteur"')
                .then(function(billets) {
                    var map = {};
                    (billets || []).forEach(function(b) { map[b.id] = b; });
                    envoisData.billetsEnvoisMap = map;
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
        var collecteur = b ? b.Collecteur : 'Inconnu';
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
