// ============================================================
// profil.js — BilletsTouristiques Mon profil
// Story 5.3
// ============================================================

// ============================================================
// 1. TOAST NOTIFICATIONS
// ============================================================
function showToast(message, type) {
    var toast = document.createElement('div');
    toast.className = 'toast toast-' + type;
    toast.textContent = message;
    document.body.appendChild(toast);

    if (type === 'success') {
        setTimeout(function() {
            if (toast.parentNode) toast.remove();
        }, 4000);
    }
    if (type === 'info') {
        setTimeout(function() {
            if (toast.parentNode) toast.remove();
        }, 4000);
    }
    if (type === 'error') {
        toast.onclick = function() { toast.remove(); };
    }
}

// ============================================================
// 1b. LISTE DES INDICATIFS TELEPHONIQUES
// ============================================================
var indicatifsList = [
    { code: 'FR', dial: '+33', nom: 'France' },
    { code: 'BE', dial: '+32', nom: 'Belgique' },
    { code: 'CH', dial: '+41', nom: 'Suisse' },
    { code: 'LU', dial: '+352', nom: 'Luxembourg' },
    { code: 'MC', dial: '+377', nom: 'Monaco' },
    { code: 'CA', dial: '+1', nom: 'Canada' },
    { code: 'DE', dial: '+49', nom: 'Allemagne' },
    { code: 'ES', dial: '+34', nom: 'Espagne' },
    { code: 'IT', dial: '+39', nom: 'Italie' },
    { code: 'PT', dial: '+351', nom: 'Portugal' },
    { code: 'GB', dial: '+44', nom: 'Royaume-Uni' },
    { code: 'US', dial: '+1', nom: 'États-Unis' },
    { code: 'NL', dial: '+31', nom: 'Pays-Bas' },
    { code: 'AT', dial: '+43', nom: 'Autriche' },
    { code: 'IE', dial: '+353', nom: 'Irlande' },
    { code: 'SE', dial: '+46', nom: 'Suède' },
    { code: 'NO', dial: '+47', nom: 'Norvège' },
    { code: 'DK', dial: '+45', nom: 'Danemark' },
    { code: 'FI', dial: '+358', nom: 'Finlande' },
    { code: 'PL', dial: '+48', nom: 'Pologne' },
    { code: 'CZ', dial: '+420', nom: 'Tchéquie' },
    { code: 'GR', dial: '+30', nom: 'Grèce' },
    { code: 'HU', dial: '+36', nom: 'Hongrie' },
    { code: 'RO', dial: '+40', nom: 'Roumanie' },
    { code: 'HR', dial: '+385', nom: 'Croatie' },
    { code: 'BG', dial: '+359', nom: 'Bulgarie' },
    { code: 'SK', dial: '+421', nom: 'Slovaquie' },
    { code: 'SI', dial: '+386', nom: 'Slovénie' },
    { code: 'EE', dial: '+372', nom: 'Estonie' },
    { code: 'LV', dial: '+371', nom: 'Lettonie' },
    { code: 'LT', dial: '+370', nom: 'Lituanie' },
    { code: 'MT', dial: '+356', nom: 'Malte' },
    { code: 'CY', dial: '+357', nom: 'Chypre' },
    { code: 'IS', dial: '+354', nom: 'Islande' },
    { code: 'AL', dial: '+355', nom: 'Albanie' },
    { code: 'RS', dial: '+381', nom: 'Serbie' },
    { code: 'BA', dial: '+387', nom: 'Bosnie-Herzégovine' },
    { code: 'ME', dial: '+382', nom: 'Monténégro' },
    { code: 'MK', dial: '+389', nom: 'Macédoine du Nord' },
    { code: 'TR', dial: '+90', nom: 'Turquie' },
    { code: 'RU', dial: '+7', nom: 'Russie' },
    { code: 'UA', dial: '+380', nom: 'Ukraine' },
    { code: 'MA', dial: '+212', nom: 'Maroc' },
    { code: 'DZ', dial: '+213', nom: 'Algérie' },
    { code: 'TN', dial: '+216', nom: 'Tunisie' },
    { code: 'SN', dial: '+221', nom: 'Sénégal' },
    { code: 'CI', dial: '+225', nom: 'Côte d\'Ivoire' },
    { code: 'CM', dial: '+237', nom: 'Cameroun' },
    { code: 'CD', dial: '+243', nom: 'RD Congo' },
    { code: 'CG', dial: '+242', nom: 'Congo' },
    { code: 'GA', dial: '+241', nom: 'Gabon' },
    { code: 'MG', dial: '+261', nom: 'Madagascar' },
    { code: 'MU', dial: '+230', nom: 'Maurice' },
    { code: 'RE', dial: '+262', nom: 'La Réunion' },
    { code: 'EG', dial: '+20', nom: 'Égypte' },
    { code: 'ZA', dial: '+27', nom: 'Afrique du Sud' },
    { code: 'NG', dial: '+234', nom: 'Nigeria' },
    { code: 'KE', dial: '+254', nom: 'Kenya' },
    { code: 'GH', dial: '+233', nom: 'Ghana' },
    { code: 'ET', dial: '+251', nom: 'Éthiopie' },
    { code: 'TZ', dial: '+255', nom: 'Tanzanie' },
    { code: 'BR', dial: '+55', nom: 'Brésil' },
    { code: 'MX', dial: '+52', nom: 'Mexique' },
    { code: 'AR', dial: '+54', nom: 'Argentine' },
    { code: 'CO', dial: '+57', nom: 'Colombie' },
    { code: 'CL', dial: '+56', nom: 'Chili' },
    { code: 'PE', dial: '+51', nom: 'Pérou' },
    { code: 'CN', dial: '+86', nom: 'Chine' },
    { code: 'JP', dial: '+81', nom: 'Japon' },
    { code: 'KR', dial: '+82', nom: 'Corée du Sud' },
    { code: 'IN', dial: '+91', nom: 'Inde' },
    { code: 'TH', dial: '+66', nom: 'Thaïlande' },
    { code: 'VN', dial: '+84', nom: 'Vietnam' },
    { code: 'ID', dial: '+62', nom: 'Indonésie' },
    { code: 'PH', dial: '+63', nom: 'Philippines' },
    { code: 'MY', dial: '+60', nom: 'Malaisie' },
    { code: 'SG', dial: '+65', nom: 'Singapour' },
    { code: 'AU', dial: '+61', nom: 'Australie' },
    { code: 'NZ', dial: '+64', nom: 'Nouvelle-Zélande' },
    { code: 'IL', dial: '+972', nom: 'Israël' },
    { code: 'AE', dial: '+971', nom: 'Émirats arabes unis' },
    { code: 'SA', dial: '+966', nom: 'Arabie Saoudite' },
    { code: 'QA', dial: '+974', nom: 'Qatar' },
    { code: 'LB', dial: '+961', nom: 'Liban' },
    { code: 'GP', dial: '+590', nom: 'Guadeloupe' },
    { code: 'MQ', dial: '+596', nom: 'Martinique' },
    { code: 'GF', dial: '+594', nom: 'Guyane française' },
    { code: 'PF', dial: '+689', nom: 'Polynésie française' },
    { code: 'NC', dial: '+687', nom: 'Nouvelle-Calédonie' },
    { code: 'WF', dial: '+681', nom: 'Wallis-et-Futuna' },
    { code: 'YT', dial: '+262', nom: 'Mayotte' },
    { code: 'HT', dial: '+509', nom: 'Haïti' }
];

// URL drapeau via flagcdn.com (20px de large)
function flagUrl(code) {
    return 'https://flagcdn.com/w40/' + code.toLowerCase() + '.png';
}

function loadIndicatifsList() {
    var container = document.getElementById('indicatif-options');
    var btn = document.getElementById('indicatif-btn');
    var hiddenInput = document.getElementById('profil-indicatif');
    var list = document.getElementById('indicatif-list');
    var search = document.getElementById('indicatif-search');
    if (!container || !btn || !hiddenInput) return;

    // Générer les options
    indicatifsList.forEach(function(item) {
        var div = document.createElement('div');
        div.className = 'indicatif-option';
        div.setAttribute('data-dial', item.dial);
        div.setAttribute('data-nom', item.nom.toLowerCase());
        div.setAttribute('data-code', item.code);
        div.innerHTML = '<img src="' + flagUrl(item.code) + '" alt="' + item.code + '" class="indicatif-flag">'
            + '<span class="indicatif-nom">' + item.nom + '</span>'
            + '<span class="indicatif-dial">' + item.dial + '</span>';
        div.addEventListener('click', function() {
            selectIndicatif(item);
        });
        container.appendChild(div);
    });

    // Ouvrir/fermer le dropdown
    btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var isOpen = list.classList.contains('open');
        list.classList.toggle('open');
        if (!isOpen && search) {
            search.value = '';
            filterIndicatifs('');
            setTimeout(function() { search.focus(); }, 50);
        }
    });

    // Recherche
    if (search) {
        search.addEventListener('input', function() {
            filterIndicatifs(search.value.toLowerCase());
        });
        search.addEventListener('click', function(e) {
            e.stopPropagation();
        });
    }

    // Fermer en cliquant ailleurs
    document.addEventListener('click', function(e) {
        if (!e.target.closest('#indicatif-dropdown')) {
            list.classList.remove('open');
        }
    });
}

function selectIndicatif(item) {
    var btn = document.getElementById('indicatif-btn');
    var hiddenInput = document.getElementById('profil-indicatif');
    var list = document.getElementById('indicatif-list');
    if (!btn || !hiddenInput) return;

    hiddenInput.value = item.dial;
    btn.innerHTML = '<img src="' + flagUrl(item.code) + '" alt="' + item.code + '" class="indicatif-flag">'
        + '<span>' + item.dial + '</span>';
    list.classList.remove('open');
}

function setIndicatifByDial(dial) {
    if (!dial) return;
    for (var i = 0; i < indicatifsList.length; i++) {
        if (indicatifsList[i].dial === dial) {
            selectIndicatif(indicatifsList[i]);
            return;
        }
    }
}

function filterIndicatifs(query) {
    var options = document.querySelectorAll('.indicatif-option');
    options.forEach(function(opt) {
        var nom = opt.getAttribute('data-nom');
        var dial = opt.getAttribute('data-dial');
        var visible = !query || nom.indexOf(query) !== -1 || dial.indexOf(query) !== -1;
        opt.style.display = visible ? '' : 'none';
    });
}

// ============================================================
// 2. INITIALISATION
// ============================================================
if (typeof firebase !== 'undefined') {
    firebase.auth().onAuthStateChanged(function(user) {
        if (user) {
            initProfilPage(user);
        }
    });
}

function initProfilPage(user) {
    // Afficher l'email
    var emailDisplay = document.getElementById('profil-email');
    if (emailDisplay) emailDisplay.textContent = user.email;

    // Vérifier si redirection depuis inscription
    var params = new URLSearchParams(window.location.search);
    if (params.get('from') === 'inscription') {
        var redirectMsg = document.getElementById('profil-redirect-msg');
        if (redirectMsg) redirectMsg.style.display = 'flex';
    }

    // Charger les indicatifs téléphoniques
    loadIndicatifsList();

    // Charger la liste des pays puis le profil
    loadPaysList().then(function() {
        loadProfil();
    });

    // Initialiser le formulaire
    var form = document.getElementById('profil-form');
    if (form) {
        form.addEventListener('submit', function(e) {
            e.preventDefault();
            saveProfil();
        });
    }
}

// ============================================================
// 2b. CHARGEMENT DE LA LISTE DES PAYS
// ============================================================
function loadPaysList() {
    return supabaseFetch('/rest/v1/pays?select=nom&order=nom')
        .then(function(data) {
            var select = document.getElementById('profil-pays');
            if (!select || !data) return;
            data.forEach(function(p) {
                var option = document.createElement('option');
                option.value = p.nom;
                option.textContent = p.nom;
                select.appendChild(option);
            });
        })
        .catch(function(error) {
            console.error('Erreur chargement pays:', error);
        });
}

// ============================================================
// 3. CHARGEMENT DU PROFIL
// ============================================================
function loadProfil() {
    var user = firebase.auth().currentUser;
    if (!user) return;

    var email = user.email;
    supabaseFetch('/rest/v1/membres?email=eq.' + encodeURIComponent(email) + '&select=nom,prenom,rue,code_postal,ville,pays,indicatif_tel,telephone')
        .then(function(data) {
            if (data && data.length > 0) {
                prefillProfil(data[0]);
            }
        })
        .catch(function(error) {
            console.error('Erreur chargement profil:', error);
        });
}

function prefillProfil(data) {
    var fields = {
        'profil-nom': 'nom',
        'profil-prenom': 'prenom',
        'profil-rue': 'rue',
        'profil-code-postal': 'code_postal',
        'profil-ville': 'ville',
        'profil-pays': 'pays',
        'profil-telephone': 'telephone'
    };

    for (var fieldId in fields) {
        var el = document.getElementById(fieldId);
        if (el) el.value = data[fields[fieldId]] || '';
    }

    // Pré-sélectionner l'indicatif (dropdown custom)
    if (data.indicatif_tel) {
        setIndicatifByDial(data.indicatif_tel);
    }
}

// ============================================================
// 4. SAUVEGARDE DU PROFIL
// ============================================================
function saveProfil() {
    var user = firebase.auth().currentUser;
    if (!user) return;

    var nomEl = document.getElementById('profil-nom');
    var prenomEl = document.getElementById('profil-prenom');
    var rueEl = document.getElementById('profil-rue');
    var codePostalEl = document.getElementById('profil-code-postal');
    var villeEl = document.getElementById('profil-ville');
    var paysEl = document.getElementById('profil-pays');
    var indicatifEl = document.getElementById('profil-indicatif');
    var telephoneEl = document.getElementById('profil-telephone');
    if (!nomEl || !prenomEl || !rueEl || !codePostalEl || !villeEl || !paysEl) return;
    var nom = nomEl.value.trim();
    var prenom = prenomEl.value.trim();
    var rue = rueEl.value.trim();
    var codePostal = codePostalEl.value.trim();
    var ville = villeEl.value.trim();
    var pays = paysEl.value.trim();
    var indicatifTel = indicatifEl ? indicatifEl.value.trim() : '';
    var telephone = telephoneEl ? telephoneEl.value.trim() : '';

    // Validation
    if (!nom || !prenom || !rue || !codePostal || !ville || !pays) {
        showToast('Tous les champs sont obligatoires', 'error');
        return;
    }

    // Validation téléphone : si l'un est rempli, l'autre doit l'être aussi
    if ((indicatifTel && !telephone) || (!indicatifTel && telephone)) {
        showToast('Veuillez renseigner l\'indicatif et le numéro de téléphone', 'error');
        return;
    }

    var email = user.email;
    var body = {
        nom: nom,
        prenom: prenom,
        rue: rue,
        code_postal: codePostal,
        ville: ville,
        pays: pays,
        indicatif_tel: indicatifTel,
        telephone: telephone
    };

    var saveBtn = document.getElementById('profil-save-btn');
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Sauvegarde...';
    }

    supabaseFetch('/rest/v1/membres?email=eq.' + encodeURIComponent(email), {
        method: 'PATCH',
        body: JSON.stringify(body)
    })
    .then(function() {
        showToast('Profil sauvegardé avec succès', 'success');
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Sauvegarder';
        }

        // Si redirection depuis inscription, retour au catalogue
        var params = new URLSearchParams(window.location.search);
        if (params.get('from') === 'inscription') {
            setTimeout(function() {
                window.location.href = 'billets.html';
            }, 1500);
        }
    })
    .catch(function(error) {
        console.error('Erreur sauvegarde profil:', error);
        showToast('Erreur lors de la sauvegarde : ' + error.message, 'error');
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Sauvegarder';
        }
    });
}
