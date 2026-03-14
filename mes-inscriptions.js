// ============================================================
// MES INSCRIPTIONS — Vue membre de toutes ses inscriptions
// Story 5.6
// ============================================================

var mesInscriptions = [];
var billetsMap = {};
var collecteursMap = {};

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
    var html = mesInscriptions.map(function(insc) {
        var billet = billetsMap[insc.billet_id] || {};
        var prix = parseFloat(billet.Prix || 0);
        var prixVar = (billet.PrixVariante !== null && billet.PrixVariante !== undefined && billet.PrixVariante !== '') ? parseFloat(billet.PrixVariante) : prix;
        var nbNormaux = insc.nb_normaux || 0;
        var nbVariantes = insc.nb_variantes || 0;
        var montant = (prix * nbNormaux) + (prixVar * nbVariantes);
        var statut = insc.statut_paiement || 'non_paye';
        if (statut !== 'confirme' && billet.Categorie !== 'Pré collecte') totalDu += montant;

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
            + '<span><i class="fa-solid fa-ticket"></i> ' + nbNormaux + (nbVariantes > 0 ? ' + ' + nbVariantes + ' var.' : '') + '</span>'
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
            + '<span class="montant-non-paye"><strong>' + totalDu.toFixed(2) + ' \u20AC restant \u00E0 payer</strong></span>'
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
        return '<span class="badge-collecte badge-collecte-termine">Terminé</span>';
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
        return '<span class="badge-paiement badge-declare">En attente de confirmation</span>';
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
// 4. INITIALISATION
// ============================================================

document.addEventListener('DOMContentLoaded', function() {
    firebase.auth().onAuthStateChanged(function(user) {
        if (user) {
            loadMesInscriptions();
        }
    });
});
