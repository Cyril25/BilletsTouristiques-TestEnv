// ============================================================
// MES INSCRIPTIONS — Vue membre de toutes ses inscriptions
// Story 5.6
// ============================================================

var mesInscriptions = [];
var billetsMap = {};
var collecteursMap = {};

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
    var user = firebase.auth().currentUser;
    if (!user) return;
    var email = user.email;

    // Étape 1 : charger les inscriptions du membre (pas_interesse = false)
    supabaseFetch('/rest/v1/inscriptions?membre_email=eq.' + encodeURIComponent(email) + '&pas_interesse=eq.false&select=*&order=date_inscription.desc')
        .then(function(data) {
            mesInscriptions = data || [];

            // Étape 2 : charger les billets associés pour noms, villes, prix
            var billetIds = mesInscriptions.map(function(i) { return i.billet_id; });
            if (billetIds.length === 0) {
                renderInscriptions();
                return;
            }
            var idsParam = 'id=in.(' + billetIds.join(',') + ')';
            return supabaseFetch('/rest/v1/billets?' + idsParam + '&select=id,"NomBillet","Ville","Collecteur","Prix","PrixVariante","Categorie"');
        })
        .then(function(billets) {
            if (billets) {
                billetsMap = {};
                billets.forEach(function(b) { billetsMap[b.id] = b; });
            }

            // Étape 3 : charger les collecteurs pour les liens PayPal
            return supabaseFetch('/rest/v1/collecteurs?select=alias,paypal_email,paypal_me');
        })
        .then(function(collecteurs) {
            if (collecteurs) {
                collecteursMap = {};
                collecteurs.forEach(function(c) { collecteursMap[c.alias] = c; });
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

function renderInscriptions() {
    var container = document.getElementById('inscriptions-list');
    var emptyState = document.getElementById('inscriptions-empty');
    var summary = document.getElementById('inscriptions-summary');
    if (!container) return;

    // État vide
    if (mesInscriptions.length === 0) {
        container.innerHTML = '';
        if (emptyState) emptyState.style.display = '';
        if (summary) summary.innerHTML = '';
        return;
    }
    if (emptyState) emptyState.style.display = 'none';

    var totalDu = 0;
    var totalEnAttente = 0;
    var html = mesInscriptions.map(function(insc) {
        var billet = billetsMap[insc.billet_id] || {};
        var prix = parseFloat(billet.Prix || 0);
        var prixVar = (billet.PrixVariante !== null && billet.PrixVariante !== undefined && billet.PrixVariante !== '') ? parseFloat(billet.PrixVariante) : prix;
        var nbNormaux = insc.nb_normaux || 0;
        var nbVariantes = insc.nb_variantes || 0;
        var montant = (prix * nbNormaux) + (prixVar * nbVariantes);
        var statut = insc.statut_paiement || 'non_paye';
        if (billet.Categorie !== 'Pré collecte') {
            if (statut === 'non_paye') totalDu += montant;
            else if (statut === 'declare') totalEnAttente += montant;
        }

        var collecteur = collecteursMap[billet.Collecteur] || {};
        var paypalLink = '';
        if (statut === 'non_paye' && insc.mode_paiement === 'PayPal' && billet.Categorie !== 'Pré collecte') {
            if (collecteur.paypal_me) {
                paypalLink = '<a href="https://paypal.me/' + collecteur.paypal_me + '/' + montant.toFixed(2) + '" target="_blank" class="btn-payer"><i class="fa-brands fa-paypal"></i> Payer via PayPal</a>';
            } else if (collecteur.paypal_email) {
                paypalLink = '<a href="https://www.paypal.com/paypalme/' + collecteur.paypal_email + '" target="_blank" class="btn-payer"><i class="fa-brands fa-paypal"></i> Payer via PayPal</a>';
            }
        }

        var dateInsc = insc.date_inscription ? new Date(insc.date_inscription).toLocaleDateString('fr-FR') : '';
        var montantClass = statut === 'confirme' ? 'montant-paye' : 'montant-non-paye';

        return '<div class="inscription-card">'
            + '<div class="inscription-card-header">'
            + '<strong>' + (billet.NomBillet || 'Billet inconnu') + '</strong>'
            + '<span class="inscription-ville"><i class="fa-solid fa-location-dot"></i> ' + (billet.Ville || '') + '</span>'
            + '</div>'
            + '<div class="inscription-card-details">'
            + '<span><i class="fa-solid fa-user"></i> ' + (billet.Collecteur || '\u2014') + '</span>'
            + '<span><i class="fa-solid fa-ticket"></i> ' + (billet.VersionNormaleExiste === false ? (nbVariantes + ' var.') : (nbNormaux + (nbVariantes > 0 ? ' + ' + nbVariantes + ' var.' : ''))) + '</span>'
            + (billet.Categorie === 'Pré collecte'
                ? '<span class="montant-indefini"><i class="fa-solid fa-euro-sign"></i> En attente</span>'
                : '<span class="' + montantClass + '"><i class="fa-solid fa-euro-sign"></i> ' + montant.toFixed(2) + ' \u20AC</span>')
            + '</div>'
            + '<div class="inscription-card-statuts">'
            + badgeCollecte(billet.Categorie)
            + badgePaiementMembre(statut, insc.id, billet.Categorie)
            + '<span class="badge-paiement ' + (insc.envoye ? 'badge-envoye' : 'badge-non-envoye') + '">' + (insc.envoye ? 'Envoy\u00E9' : 'Non envoy\u00E9') + '</span>'
            + '</div>'
            + '<div class="inscription-card-footer">'
            + '<span class="inscription-date"><i class="fa-regular fa-calendar"></i> ' + dateInsc + '</span>'
            + paypalLink
            + '</div>'
            + '</div>';
    }).join('');

    container.innerHTML = html;

    // Résumé en haut
    if (summary) {
        summary.innerHTML = '<div class="inscriptions-resume">'
            + '<span>' + mesInscriptions.length + ' inscription(s)</span>'
            + '<span class="inscriptions-resume-montants">'
            + '<span class="montant-non-paye"><strong>' + totalDu.toFixed(2) + ' \u20AC restant \u00E0 payer</strong></span>'
            + (totalEnAttente > 0 ? '<span class="montant-en-attente"><strong>' + totalEnAttente.toFixed(2) + ' \u20AC en attente de validation par les collecteurs</strong></span>' : '')
            + '</span>'
            + '</div>';
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
        return '<span class="badge-paiement badge-declare">Paiement déclaré – en attente de vérification par le collecteur</span>';
    }
    // non_paye — Story 9.8 : bloquer en pré-collecte
    if (categorie === 'Pré collecte') {
        return '<span class="badge-paiement badge-prix-indefini">Prix non défini</span>';
    }
    return '<button class="btn-jai-paye" title="Cliquez pour déclarer votre paiement" onclick="declarerPaiement(' + inscriptionId + ')"><i class="fa-solid fa-hand-holding-dollar"></i> J\'ai payé</button>';
}

function declarerPaiement(inscriptionId) {
    supabaseFetch('/rest/v1/inscriptions?id=eq.' + inscriptionId, {
        method: 'PATCH',
        body: JSON.stringify({ statut_paiement: 'declare' })
    })
    .then(function() {
        // Mettre à jour localement et re-render
        for (var i = 0; i < mesInscriptions.length; i++) {
            if (mesInscriptions[i].id === inscriptionId) {
                mesInscriptions[i].statut_paiement = 'declare';
                break;
            }
        }
        renderInscriptions();
    })
    .catch(function(error) {
        console.error('Erreur déclaration paiement:', error);
    });
}

// ============================================================
// 4. MES ENVOIS — VUE MEMBRE (Story 5.10 + 5.11)
// ============================================================

function loadMesEnvois() {
    var user = firebase.auth().currentUser;
    if (!user) return;
    var email = user.email;

    supabaseFetch('/rest/v1/enveloppes?membre_email=eq.' + encodeURIComponent(email) + '&select=*&order=date_creation.desc')
        .then(function(enveloppes) {
            if (!enveloppes || enveloppes.length === 0) {
                renderMesEnvois([], [], {});
                return;
            }

            var enCours = enveloppes.filter(function(e) { return e.statut === 'en_cours'; });
            var passees = enveloppes.filter(function(e) { return e.statut === 'expediee' || e.statut === 'recue'; });

            var enCoursIds = enCours.map(function(e) { return e.id; });
            var passeesIds = passees.map(function(e) { return e.id; });
            var allIds = enCoursIds.concat(passeesIds);

            if (allIds.length === 0) {
                renderMesEnvois(enCours, passees, {});
                return;
            }

            var idsParam = 'enveloppe_id=in.(' + allIds.join(',') + ')';
            return supabaseFetch('/rest/v1/inscriptions?' + idsParam + '&select=*')
                .then(function(inscriptions) {
                    inscriptions = inscriptions || [];

                    var inscByEnv = {};
                    inscriptions.forEach(function(insc) {
                        if (!inscByEnv[insc.enveloppe_id]) inscByEnv[insc.enveloppe_id] = [];
                        inscByEnv[insc.enveloppe_id].push(insc);
                    });

                    var billetIdsEnvois = inscriptions.map(function(i) { return i.billet_id; });
                    var uniqueBilletIds = billetIdsEnvois.filter(function(id, idx) { return billetIdsEnvois.indexOf(id) === idx; });

                    if (uniqueBilletIds.length === 0) {
                        renderMesEnvois(enCours, passees, inscByEnv);
                        return;
                    }

                    return supabaseFetch('/rest/v1/billets?id=in.(' + uniqueBilletIds.join(',') + ')&select=id,"NomBillet"')
                        .then(function(billets) {
                            var billetsEnvoisMap = {};
                            (billets || []).forEach(function(b) { billetsEnvoisMap[b.id] = b; });
                            renderMesEnvois(enCours, passees, inscByEnv, billetsEnvoisMap);
                        });
                });
        })
        .catch(function(error) {
            console.error('Erreur chargement envois:', error);
        });
}

function renderMesEnvois(enCours, passees, inscByEnv, billetsEnvoisMap) {
    var container = document.getElementById('mes-envois-section');
    if (!container) return;

    billetsEnvoisMap = billetsEnvoisMap || {};

    // Filtrer enveloppes en cours avec billets prêts (FR57 : pas de non_reparti)
    var enCoursAvecBillets = enCours.filter(function(env) {
        var inscs = inscByEnv[env.id] || [];
        return inscs.some(function(i) { return i.statut_livraison === 'pret_a_envoyer'; });
    });

    if (enCoursAvecBillets.length === 0 && passees.length === 0) {
        container.innerHTML = '';
        return;
    }

    var html = '';

    // Section "Chez le collecteur"
    if (enCoursAvecBillets.length > 0) {
        html += '<div class="envois-section">'
            + '<h3><i class="fa-solid fa-envelope"></i> Chez le collecteur</h3>';

        enCoursAvecBillets.forEach(function(env) {
            var inscs = (inscByEnv[env.id] || []).filter(function(i) {
                return i.statut_livraison === 'pret_a_envoyer';
            });
            var nbBillets = inscs.reduce(function(sum, i) {
                return sum + (i.nb_normaux || 0) + (i.nb_variantes || 0);
            }, 0);

            html += '<div class="envoi-carte">'
                + '<div class="envoi-carte-header">'
                + '<span><i class="fa-solid fa-user"></i> ' + escapeHtml(env.collecteur_alias || '') + '</span>'
                + '<span class="envoi-nb-billets">' + nbBillets + ' billet(s) prêt(s)</span>'
                + '</div>';

            if (env.demande_envoi) {
                var dateStr = env.date_demande_envoi ? new Date(env.date_demande_envoi).toLocaleDateString('fr-FR') : '';
                html += '<span class="demande-envoyee"><i class="fa-solid fa-check"></i> Demande envoyée le ' + dateStr + '</span>';
            } else {
                html += '<button onclick="demanderEnvoi(' + env.id + ')" class="btn-demande-envoi">'
                    + '<i class="fa-solid fa-paper-plane"></i> Je souhaite recevoir mes billets'
                    + '</button>';
            }

            html += '</div>';
        });

        html += '</div>';
    }

    // Section "Envois passés"
    if (passees.length > 0) {
        html += '<div class="envois-section">'
            + '<h3><i class="fa-solid fa-clock-rotate-left"></i> Envois passés</h3>';

        passees.forEach(function(env) {
            var inscs = inscByEnv[env.id] || [];
            var nbBillets = inscs.reduce(function(sum, i) {
                return sum + (i.nb_normaux || 0) + (i.nb_variantes || 0);
            }, 0);
            var nomsBillets = inscs.map(function(i) {
                var b = billetsEnvoisMap[i.billet_id];
                return b ? b.NomBillet : 'Billet';
            }).join(', ');

            var dateExp = env.date_expedition ? new Date(env.date_expedition).toLocaleDateString('fr-FR') : '';
            var modeEnvoi = env.mode_envoi_reel || 'normal';
            var modeLabel = { normal: 'Normal', suivi: 'Suivi', recommande: 'Recommandé' }[modeEnvoi] || modeEnvoi;

            html += '<div class="envoi-carte envoi-carte-passe">'
                + '<div class="envoi-carte-header">'
                + '<span><i class="fa-solid fa-user"></i> ' + escapeHtml(env.collecteur_alias || '') + '</span>'
                + '<span class="envoi-date"><i class="fa-solid fa-calendar"></i> ' + dateExp + '</span>'
                + '</div>'
                + '<div class="envoi-carte-details">'
                + '<span>' + nbBillets + ' billet(s) : ' + escapeHtml(nomsBillets) + '</span>'
                + '<span><i class="fa-solid fa-truck"></i> ' + modeLabel + '</span>';

            if (env.numero_suivi) {
                html += '<span><i class="fa-solid fa-barcode"></i> N° suivi : ' + escapeHtml(env.numero_suivi) + '</span>';
            }

            html += '</div>';

            if (env.statut === 'recue') {
                var dateRec = env.date_reception ? new Date(env.date_reception).toLocaleDateString('fr-FR') : '';
                html += '<span class="envoi-recu"><i class="fa-solid fa-circle-check"></i> Reçue ✓ le ' + dateRec + '</span>';
            } else {
                html += '<button onclick="confirmerReception(' + env.id + ')" class="btn-confirmer-reception">'
                    + '<i class="fa-solid fa-box-open"></i> J\'ai bien reçu'
                    + '</button>';
            }

            html += '</div>';
        });

        html += '</div>';
    }

    container.innerHTML = html;
}

function demanderEnvoi(enveloppeId) {
    supabaseFetch('/rest/v1/enveloppes?id=eq.' + enveloppeId, {
        method: 'PATCH',
        body: JSON.stringify({
            demande_envoi: true,
            date_demande_envoi: new Date().toISOString()
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
            loadMesEnvois();
            loadMesInscriptions();
        }
    });
});
