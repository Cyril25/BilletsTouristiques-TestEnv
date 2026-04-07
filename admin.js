// ============================================================
// admin.js — BilletsTouristiques Administration
// Stories 2.1, 2.2, 2.3, 2.4, 2.5
// ============================================================

// ============================================================
// 1. TOAST NOTIFICATIONS (Fondation FR11)
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
// 2. CONSTANTES & CONFIGURATION
// ============================================================
var adminBillets = [];
var adminInscriptionCounts = {};
var adminCollectesByBillet = {};
var adminCollecteInscriptionCounts = {};
var adminMembresCache = null;

// #14 — Onboarding admin
function showAdminOnboarding() {
    var key = 'bt_onboarding_admin_dismissed';
    if (localStorage.getItem(key)) return;

    var target = document.querySelector('.admin-page-header');
    if (!target) return;

    var html = '<div class="onboarding-banner onboarding-banner--compact" id="onboarding-admin">'
        + '<button class="onboarding-close" onclick="dismissOnboardingAdmin()" aria-label="Fermer"><i class="fa-solid fa-xmark"></i></button>'
        + '<h3 class="onboarding-title"><i class="fa-solid fa-hand-wave"></i> Espace administration</h3>'
        + '<p class="onboarding-text">Depuis cette page, vous gérez le <strong>catalogue des billets</strong> : '
        + 'créer, modifier, changer le statut (pré-collecte → collecte → terminé…). '
        + 'Les autres pages admin vous permettent de gérer les <strong>membres</strong>, les <strong>collecteurs</strong> et les <strong>frais de port</strong> via le menu.</p>'
        + '</div>';

    target.insertAdjacentHTML('afterend', html);
}

function dismissOnboardingAdmin() {
    localStorage.setItem('bt_onboarding_admin_dismissed', '1');
    var el = document.getElementById('onboarding-admin');
    if (el) el.remove();
}

// Categories (= statuts) — valeurs reelles du Google Sheet
var CATEGORIES = [
    'Pré collecte',
    'Collecte',
    'Terminé',
    'Pas de collecte',
    'Jamais édité, projet',
    'Masqué'
];
var CATEGORIE_FLOW = {
    'Jamais édité, projet': 'Pré collecte',
    'Pré collecte': 'Collecte',
    'Collecte': 'Terminé',
    'Pas de collecte': null,
    'Terminé': null
};
var CATEGORIE_DEFAULT = 'Pré collecte';

// Couleurs des categories
var CATEGORIE_COLORS = {
    'Collecte': '#A4C2F4',
    'Pré collecte': '#FFFF00',
    'Terminé': '#C27BA0',
    'Pas de collecte': '#FF0000',
    'Jamais édité, projet': '#CECECE',
    'Non defini': '#F57C00',
    'Masqué': '#555555'
};

// Cloudinary — configuration upload unsigned
var CLOUDINARY_CLOUD_NAME = 'dxoyqxben';
var CLOUDINARY_UPLOAD_PRESET = 'billets-touristiques';

// Story 2.2 — Focus trap
var focusTrapHandler = null;
var escapeHandler = null;

// Story 2.4 — Suppression
var deleteTargetDocId = null;
var deleteTargetName = '';

// Pagination
var PAGE_SIZE = 50;
var currentPage = 1;

// Story 2.1b — Variables de filtrage admin
var adminActiveStatusFilter = 'tous';
var adminFilterEnCours = false;
var adminFilteredBillets = [];

// Story 4.3 — Cache liste des pays
var paysListe = [];

// Mapping nom de pays → code ISO 2 lettres (tous les pays + variantes)
var paysIsoMap = {
    // Europe (49 pays + variantes)
    'Albanie': 'AL', 'Allemagne': 'DE', 'Andorre': 'AD', 'Angleterre': 'GB',
    'Autriche': 'AT', 'Belgique': 'BE', 'Biélorussie': 'BY', 'Bélarus': 'BY',
    'Belarus': 'BY', 'Bosnie': 'BA', 'Bosnie-Herzégovine': 'BA',
    'Bosnie Herzégovine': 'BA', 'Bulgarie': 'BG', 'Chypre': 'CY',
    'Croatie': 'HR', 'Danemark': 'DK', 'Écosse': 'GB', 'Ecosse': 'GB',
    'Espagne': 'ES', 'Estonie': 'EE', 'Finlande': 'FI', 'France': 'FR',
    'Grande-Bretagne': 'GB', 'Grèce': 'GR', 'Hongrie': 'HU',
    'Irlande': 'IE', 'Irlande du Nord': 'GB', 'Islande': 'IS', 'Italie': 'IT',
    'Kosovo': 'XK', 'Lettonie': 'LV', 'Liechtenstein': 'LI', 'Lituanie': 'LT',
    'Luxembourg': 'LU', 'Macédoine': 'MK', 'Macédoine du Nord': 'MK',
    'Malte': 'MT', 'Moldavie': 'MD', 'Moldova': 'MD', 'Monaco': 'MC',
    'Monténégro': 'ME', 'Montenegro': 'ME', 'Norvège': 'NO',
    'Pays de Galles': 'GB', 'Pays-Bas': 'NL', 'Pologne': 'PL',
    'Portugal': 'PT', 'République tchèque': 'CZ', 'Republique tcheque': 'CZ',
    'Roumanie': 'RO', 'Royaume-Uni': 'GB', 'Russie': 'RU',
    'Saint-Marin': 'SM', 'San Marino': 'SM', 'Serbie': 'RS',
    'Slovaquie': 'SK', 'Slovénie': 'SI', 'Suède': 'SE', 'Suede': 'SE',
    'Suisse': 'CH', 'Tchéquie': 'CZ', 'Tchequia': 'CZ', 'Ukraine': 'UA',
    'Vatican': 'VA', 'Cité du Vatican': 'VA',
    // Asie (48 pays + variantes)
    'Afghanistan': 'AF', 'Arabie Saoudite': 'SA', 'Arabie saoudite': 'SA',
    'Arménie': 'AM', 'Armenie': 'AM', 'Azerbaïdjan': 'AZ', 'Azerbaidjan': 'AZ',
    'Bahreïn': 'BH', 'Bahrein': 'BH', 'Bangladesh': 'BD', 'Bhoutan': 'BT',
    'Birmanie': 'MM', 'Myanmar': 'MM', 'Brunei': 'BN', 'Cambodge': 'KH',
    'Chine': 'CN', 'Corée du Nord': 'KP', 'Coree du Nord': 'KP',
    'Corée du Sud': 'KR', 'Coree du Sud': 'KR',
    'Émirats arabes unis': 'AE', 'Emirats arabes unis': 'AE', 'EAU': 'AE',
    'Géorgie': 'GE', 'Georgie': 'GE', 'Inde': 'IN', 'Indonésie': 'ID',
    'Indonesie': 'ID', 'Irak': 'IQ', 'Iraq': 'IQ', 'Iran': 'IR',
    'Israël': 'IL', 'Israel': 'IL', 'Japon': 'JP', 'Jordanie': 'JO',
    'Kazakhstan': 'KZ', 'Kirghizistan': 'KG', 'Kirghizstan': 'KG',
    'Koweït': 'KW', 'Koweit': 'KW', 'Laos': 'LA', 'Liban': 'LB',
    'Malaisie': 'MY', 'Maldives': 'MV', 'Mongolie': 'MN',
    'Népal': 'NP', 'Nepal': 'NP', 'Oman': 'OM', 'Ouzbékistan': 'UZ',
    'Ouzbekistan': 'UZ', 'Pakistan': 'PK', 'Palestine': 'PS',
    'Philippines': 'PH', 'Qatar': 'QA', 'Singapour': 'SG',
    'Sri Lanka': 'LK', 'Syrie': 'SY', 'Tadjikistan': 'TJ',
    'Taïwan': 'TW', 'Taiwan': 'TW', 'Thaïlande': 'TH', 'Thailande': 'TH',
    'Timor oriental': 'TL', 'Timor-Leste': 'TL', 'Turkménistan': 'TM',
    'Turkmenistan': 'TM', 'Turquie': 'TR', 'Türkiye': 'TR',
    'Vietnam': 'VN', 'Viêt Nam': 'VN', 'Yémen': 'YE', 'Yemen': 'YE',
    // Afrique (54 pays + variantes)
    'Afrique du Sud': 'ZA', 'Algérie': 'DZ', 'Algerie': 'DZ',
    'Angola': 'AO', 'Bénin': 'BJ', 'Benin': 'BJ', 'Botswana': 'BW',
    'Burkina Faso': 'BF', 'Burkina': 'BF', 'Burundi': 'BI',
    'Cabo Verde': 'CV', 'Cap-Vert': 'CV', 'Cameroun': 'CM',
    'Centrafrique': 'CF', 'République centrafricaine': 'CF',
    'Comores': 'KM', 'Congo': 'CG', 'République du Congo': 'CG',
    'Congo-Brazzaville': 'CG', 'Congo-Kinshasa': 'CD',
    'Côte d\'Ivoire': 'CI', 'Cote d\'Ivoire': 'CI', 'Djibouti': 'DJ',
    'Égypte': 'EG', 'Egypte': 'EG', 'Érythrée': 'ER', 'Erythree': 'ER',
    'Eswatini': 'SZ', 'Swaziland': 'SZ', 'Éthiopie': 'ET', 'Ethiopie': 'ET',
    'Gabon': 'GA', 'Gambie': 'GM', 'Ghana': 'GH', 'Guinée': 'GN',
    'Guinee': 'GN', 'Guinée équatoriale': 'GQ', 'Guinee equatoriale': 'GQ',
    'Guinée-Bissau': 'GW', 'Guinee-Bissau': 'GW', 'Kenya': 'KE',
    'Lesotho': 'LS', 'Liberia': 'LR', 'Libéria': 'LR',
    'Libye': 'LY', 'Lybie': 'LY', 'Madagascar': 'MG', 'Malawi': 'MW',
    'Mali': 'ML', 'Maroc': 'MA', 'Maurice': 'MU', 'Île Maurice': 'MU',
    'Ile Maurice': 'MU', 'Mauritanie': 'MR', 'Mayotte': 'YT',
    'Mozambique': 'MZ', 'Namibie': 'NA', 'Niger': 'NE', 'Nigeria': 'NG',
    'Nigéria': 'NG', 'Ouganda': 'UG', 'RD Congo': 'CD', 'RDC': 'CD',
    'République démocratique du Congo': 'CD', 'Republique democratique du Congo': 'CD',
    'La Réunion': 'RE', 'Réunion': 'RE', 'Rwanda': 'RW',
    'Sao Tomé-et-Príncipe': 'ST', 'São Tomé-et-Príncipe': 'ST',
    'Sénégal': 'SN', 'Senegal': 'SN', 'Seychelles': 'SC',
    'Sierra Leone': 'SL', 'Somalie': 'SO', 'Soudan': 'SD',
    'Soudan du Sud': 'SS', 'Tanzanie': 'TZ', 'Tchad': 'TD',
    'Togo': 'TG', 'Tunisie': 'TN', 'Zambie': 'ZM', 'Zimbabwe': 'ZW',
    // Amériques (35 pays + variantes)
    'Antigua-et-Barbuda': 'AG', 'Argentine': 'AR', 'Bahamas': 'BS',
    'Barbade': 'BB', 'Belize': 'BZ', 'Bolivie': 'BO', 'Brésil': 'BR',
    'Bresil': 'BR', 'Canada': 'CA', 'Chili': 'CL', 'Colombie': 'CO',
    'Costa Rica': 'CR', 'Cuba': 'CU', 'Curaçao': 'CW', 'Curacao': 'CW',
    'Dominique': 'DM', 'El Salvador': 'SV', 'Salvador': 'SV',
    'Équateur': 'EC', 'Equateur': 'EC', 'États-Unis': 'US', 'Etats-Unis': 'US',
    'USA': 'US', 'Grenade': 'GD', 'Guadeloupe': 'GP', 'Guatemala': 'GT',
    'Guyana': 'GY', 'Guyane': 'GF', 'Guyane française': 'GF',
    'Haïti': 'HT', 'Haiti': 'HT', 'Honduras': 'HN',
    'Jamaïque': 'JM', 'Jamaique': 'JM', 'Martinique': 'MQ', 'Mexique': 'MX',
    'Nicaragua': 'NI', 'Panama': 'PA', 'Paraguay': 'PY',
    'Pérou': 'PE', 'Perou': 'PE', 'Porto Rico': 'PR', 'Puerto Rico': 'PR',
    'République dominicaine': 'DO', 'Republique dominicaine': 'DO',
    'Saint-Barthélemy': 'BL', 'Saint-Kitts-et-Nevis': 'KN',
    'Saint-Martin': 'MF', 'Saint-Vincent-et-les-Grenadines': 'VC',
    'Sainte-Lucie': 'LC', 'Suriname': 'SR', 'Surinam': 'SR',
    'Trinité-et-Tobago': 'TT', 'Trinidad et Tobago': 'TT',
    'Uruguay': 'UY', 'Venezuela': 'VE',
    // Océanie (14 pays + variantes)
    'Australie': 'AU', 'Fidji': 'FJ', 'Îles Marshall': 'MH',
    'Iles Marshall': 'MH', 'Îles Salomon': 'SB', 'Iles Salomon': 'SB',
    'Kiribati': 'KI', 'Micronésie': 'FM', 'Micronesie': 'FM',
    'Nauru': 'NR', 'Nouvelle-Calédonie': 'NC', 'Nouvelle-Caledonie': 'NC',
    'Nouvelle-Zélande': 'NZ', 'Nouvelle-Zelande': 'NZ',
    'Palaos': 'PW', 'Palau': 'PW',
    'Papouasie-Nouvelle-Guinée': 'PG', 'Papouasie-Nouvelle-Guinee': 'PG',
    'Polynésie française': 'PF', 'Polynesie francaise': 'PF',
    'Samoa': 'WS', 'Tonga': 'TO', 'Tuvalu': 'TV', 'Vanuatu': 'VU',
    'Wallis-et-Futuna': 'WF'
};

// Story 4.6 — Cache liste des collecteurs
var collecteursList = [];

// Story 9.3 — Hiérarchie des statuts pour la gestion des dates
var STATUS_ORDER = {
    'Jamais édité, projet': 0,
    'Pré collecte': 1,
    'Collecte': 2,
    'Terminé': 3,
    'Pas de collecte': -1
};

// Story 9.3 — Calcule les mises à jour de dates lors d'un changement de statut
function getDateUpdatesForStatusChange(oldStatus, newStatus, existingDates) {
    var today = new Date().toISOString().split('T')[0];
    var updates = {};
    var oldLevel = STATUS_ORDER[oldStatus] !== undefined ? STATUS_ORDER[oldStatus] : 0;
    var newLevel = STATUS_ORDER[newStatus] !== undefined ? STATUS_ORDER[newStatus] : 0;

    // Auto-remplissage : remplir la date du nouveau statut si vide
    if (newStatus === 'Pré collecte' && !existingDates.DatePre) {
        updates.DatePre = today;
    }
    if (newStatus === 'Collecte' && !existingDates.DateColl) {
        updates.DateColl = today;
    }
    if (newStatus === 'Terminé' && !existingDates.DateFin) {
        updates.DateFin = today;
    }

    // Nettoyage : si retour en arrière, effacer les dates des statuts supérieurs
    if (newLevel < 3 && oldLevel >= 3) {
        updates.DateFin = null;
    }
    if (newLevel < 2 && oldLevel >= 2) {
        updates.DateColl = null;
        updates.DateFin = null;
    }

    return updates;
}

// Story 9.3 — Active/désactive les champs date selon le statut
function updateDateFieldsState(categorie) {
    var datePre = document.getElementById('field-date-pre');
    var dateColl = document.getElementById('field-date-coll');
    var dateFin = document.getElementById('field-date-fin');
    if (!datePre || !dateColl || !dateFin) return;

    // Par défaut tout actif
    datePre.disabled = false; datePre.title = '';
    dateColl.disabled = false; dateColl.title = '';
    dateFin.disabled = false; dateFin.title = '';

    if (categorie === 'Masqué') {
        datePre.disabled = true;
        datePre.title = 'Les dates ne sont pas requises pour un billet masqué';
        dateColl.disabled = true;
        dateColl.title = 'Les dates ne sont pas requises pour un billet masqué';
        dateFin.disabled = true;
        dateFin.title = 'Les dates ne sont pas requises pour un billet masqué';
    } else if (categorie === 'Pré collecte') {
        dateColl.disabled = true;
        dateColl.title = 'Passez en statut Collecte pour saisir cette date';
        dateFin.disabled = true;
        dateFin.title = 'Passez en statut Terminé pour saisir cette date';
    } else if (categorie === 'Collecte') {
        dateFin.disabled = true;
        dateFin.title = 'Passez en statut Terminé pour saisir cette date';
    }
}

// Story 9.3 — Auto-remplit la date du jour dans le champ correspondant au statut
function autoFillDateForStatus(categorie) {
    var today = new Date().toISOString().split('T')[0];
    var datePre = document.getElementById('field-date-pre');
    var dateColl = document.getElementById('field-date-coll');
    var dateFin = document.getElementById('field-date-fin');

    if (categorie === 'Pré collecte' && datePre && !datePre.value) {
        datePre.value = today;
    }
    if (categorie === 'Collecte' && dateColl && !dateColl.value) {
        dateColl.value = today;
    }
    if (categorie === 'Terminé' && dateFin && !dateFin.value) {
        dateFin.value = today;
    }
}

// ============================================================
// 2b. UPLOAD IMAGE CLOUDINARY
// ============================================================

function uploadImageToCloudinary(file) {
    var formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

    return fetch('https://api.cloudinary.com/v1_1/' + CLOUDINARY_CLOUD_NAME + '/image/upload', {
        method: 'POST',
        body: formData
    })
    .then(function(response) { return response.json(); })
    .then(function(data) {
        if (data.secure_url) {
            return data.secure_url;
        }
        throw new Error(data.error ? data.error.message : 'Erreur upload');
    });
}

function initImageUpload() {
    var zone = document.getElementById('image-upload-zone');
    var fileInput = document.getElementById('field-image-file');
    var browseBtn = document.getElementById('btn-image-browse');
    var removeBtn = document.getElementById('btn-image-remove');
    var preview = document.getElementById('image-preview');
    var placeholder = document.getElementById('image-upload-placeholder');
    var progressBar = document.getElementById('image-upload-bar');
    var progressContainer = document.getElementById('image-upload-progress');
    var imageUrlField = document.getElementById('field-image-url');

    if (!zone || !fileInput) return;

    // Clic sur le bouton Parcourir ou la zone
    browseBtn.addEventListener('click', function() { fileInput.click(); });
    zone.addEventListener('click', function(e) {
        if (e.target === zone || e.target === placeholder || e.target.parentNode === placeholder) {
            fileInput.click();
        }
    });

    // Drag & drop
    zone.addEventListener('dragover', function(e) {
        e.preventDefault();
        zone.classList.add('dragover');
    });
    zone.addEventListener('dragleave', function() {
        zone.classList.remove('dragover');
    });
    zone.addEventListener('drop', function(e) {
        e.preventDefault();
        zone.classList.remove('dragover');
        var files = e.dataTransfer.files;
        if (files.length > 0 && files[0].type.startsWith('image/')) {
            handleImageFile(files[0]);
        }
    });

    // Sélection via input file
    fileInput.addEventListener('change', function() {
        if (fileInput.files.length > 0) {
            handleImageFile(fileInput.files[0]);
        }
    });

    // Supprimer l'image
    removeBtn.addEventListener('click', function() {
        clearImageUpload();
    });

    // Changement manuel de l'URL — mettre à jour la prévisualisation
    imageUrlField.addEventListener('change', function() {
        var url = imageUrlField.value.trim();
        if (url) {
            showImagePreview(url);
        } else {
            clearImageUpload();
        }
    });

    function handleImageFile(file) {
        // Validation taille (max 10 MB)
        if (file.size > 10 * 1024 * 1024) {
            showToast('Image trop volumineuse (max 10 Mo)', 'error');
            return;
        }

        // Prévisualisation locale immédiate
        var reader = new FileReader();
        reader.onload = function(e) {
            showImagePreview(e.target.result);
        };
        reader.readAsDataURL(file);

        // Upload vers Cloudinary
        progressContainer.classList.remove('hidden');
        progressBar.style.width = '30%';
        zone.classList.add('uploading');

        uploadImageToCloudinary(file)
            .then(function(url) {
                progressBar.style.width = '100%';
                imageUrlField.value = url;
                showImagePreview(url);
                showToast('Image uploadée avec succès', 'success');
                setTimeout(function() {
                    progressContainer.classList.add('hidden');
                    progressBar.style.width = '0%';
                    zone.classList.remove('uploading');
                }, 800);
            })
            .catch(function(error) {
                progressContainer.classList.add('hidden');
                progressBar.style.width = '0%';
                zone.classList.remove('uploading');
                showToast('Erreur upload image : ' + error.message, 'error');
                console.error('Erreur upload Cloudinary:', error);
            });
    }

    function showImagePreview(url) {
        preview.src = url;
        preview.classList.remove('hidden');
        placeholder.classList.add('hidden');
        removeBtn.classList.remove('hidden');
    }
}

function clearImageUpload() {
    var preview = document.getElementById('image-preview');
    var placeholder = document.getElementById('image-upload-placeholder');
    var removeBtn = document.getElementById('btn-image-remove');
    var imageUrlField = document.getElementById('field-image-url');
    var imageIdField = document.getElementById('field-image-id');
    var fileInput = document.getElementById('field-image-file');
    var groupImageId = document.getElementById('group-image-id');

    if (preview) {
        preview.src = '';
        preview.classList.add('hidden');
    }
    if (placeholder) placeholder.classList.remove('hidden');
    if (removeBtn) removeBtn.classList.add('hidden');
    if (imageUrlField) imageUrlField.value = '';
    if (imageIdField) imageIdField.value = '';
    if (groupImageId) groupImageId.classList.add('hidden');
    if (fileInput) fileInput.value = '';
}

// ============================================================
// 3. INITIALISATION
// ============================================================
if (typeof firebase !== 'undefined') {
    firebase.auth().onAuthStateChanged(function(user) {
        if (user) {
            showAdminOnboarding();
            loadAdminBillets();
            loadAdminInscriptionCounts();
            loadAdminCollectes();
            loadPays();
            loadCollecteurs();
            initPanel();
            initImageUpload();
        }
    });
}

// ============================================================
// 4. CHARGEMENT DES BILLETS DEPUIS SUPABASE
// ============================================================
function loadAdminBillets() {
    var grid = document.getElementById('admin-cards-grid');
    if (!grid) return;
    currentPage = 1;

    supabaseFetch('/rest/v1/billets?select=*&order=date_effective.desc.nullslast&limit=10000', { method: 'GET' })
        .then(function(rows) {
            adminBillets = rows.map(function(row) {
                row._id = row.id;
                return row;
            });
            // Story 2.1b — Initialiser compteurs et filtres
            renderStatusCounters();
            adminApplyFilters();
        })
        .catch(function(error) {
            showToast('Erreur chargement : ' + error.message, 'error');
            console.error('Erreur chargement billets:', error);
            if (grid) {
                grid.innerHTML = '<div class="admin-empty-state">' +
                    '<i class="fa-solid fa-circle-exclamation" style="color: var(--color-danger);"></i>' +
                    '<p>Impossible de charger les billets.</p>' +
                    '</div>';
            }
        });
}

// ============================================================
// 4a-bis. CHARGEMENT DES COMPTEURS D'INSCRIPTIONS
// ============================================================
function loadAdminCollectes() {
    return supabaseFetch('/rest/v1/collectes?select=id,billet_id,nom,date_fin')
        .then(function(data) {
            adminCollectesByBillet = {};
            adminCollecteInscriptionCounts = {};
            var collectes = data || [];
            collectes.forEach(function(c) {
                if (!adminCollectesByBillet[c.billet_id]) adminCollectesByBillet[c.billet_id] = [];
                adminCollectesByBillet[c.billet_id].push(c);
            });
            if (collectes.length === 0) {
                if (adminBillets.length > 0) renderAdminCards();
                return;
            }
            var ids = collectes.map(function(c) { return c.id; });
            return supabaseFetch('/rest/v1/inscriptions?collecte_id=in.(' + ids.join(',') + ')&pas_interesse=eq.false&select=collecte_id,nb_normaux,nb_variantes')
                .then(function(rows) {
                    (rows || []).forEach(function(row) {
                        if (!adminCollecteInscriptionCounts[row.collecte_id]) {
                            adminCollecteInscriptionCounts[row.collecte_id] = { count: 0, normaux: 0, variantes: 0 };
                        }
                        var c = adminCollecteInscriptionCounts[row.collecte_id];
                        c.count++;
                        c.normaux += (row.nb_normaux || 0);
                        c.variantes += (row.nb_variantes || 0);
                    });
                    if (adminBillets.length > 0) renderAdminCards();
                });
        })
        .catch(function(error) {
            console.warn('Erreur chargement collectes admin:', error);
        });
}

function loadAdminInscriptionCounts() {
    return supabaseFetch('/rest/v1/inscriptions?select=billet_id,nb_normaux,nb_variantes&pas_interesse=eq.false&collecte_id=is.null')
        .then(function(data) {
            adminInscriptionCounts = {};
            (data || []).forEach(function(row) {
                if (!adminInscriptionCounts[row.billet_id]) {
                    adminInscriptionCounts[row.billet_id] = { count: 0, normaux: 0, variantes: 0 };
                }
                var c = adminInscriptionCounts[row.billet_id];
                c.count++;
                c.normaux += (row.nb_normaux || 0);
                c.variantes += (row.nb_variantes || 0);
            });
            // Re-render si les billets sont déjà chargés
            if (adminBillets.length > 0) renderAdminCards();
        })
        .catch(function(error) {
            console.warn('Erreur chargement compteurs inscriptions:', error);
        });
}

// ============================================================
// 4b. CHARGEMENT DES PAYS (Story 4.3)
// ============================================================
function loadPays() {
    supabaseFetch('/rest/v1/pays?select=id,nom&order=nom.asc')
        .then(function(data) {
            paysListe = data || [];
            populatePaysSelect();
        })
        .catch(function(error) {
            console.warn('Erreur chargement pays:', error);
        });
}

function populatePaysSelect() {
    var select = document.getElementById('field-pays');
    if (!select) return;
    // Garder la premiere option (placeholder)
    select.length = 1;
    paysListe.forEach(function(pays) {
        var option = document.createElement('option');
        option.value = pays.nom;
        option.textContent = pays.nom;
        select.appendChild(option);
    });
}

// ============================================================
// 4c. MILLESIME SELECT (Story 4.4)
// ============================================================
function populateMillesimeSelect(mode) {
    var select = document.getElementById('field-millesime');
    if (!select) return;

    var currentYear = new Date().getFullYear();
    var options = [];

    if (mode === 'create') {
        // N+1, N, N-1, N-2, N-3
        for (var y = currentYear + 1; y >= currentYear - 3; y--) {
            options.push(String(y));
        }
    } else {
        // 2015 a N+1
        for (var y = currentYear + 1; y >= 2015; y--) {
            options.push(String(y));
        }
    }

    // Reinitialiser le select
    select.length = 1; // Garder l'option placeholder
    options.forEach(function(year) {
        var opt = document.createElement('option');
        opt.value = year;
        opt.textContent = year;
        select.appendChild(opt);
    });

    // En mode creation, pre-selectionner l'annee en cours
    if (mode === 'create') {
        select.value = String(currentYear);
    }
}

// ============================================================
// 4d. CHARGEMENT DES COLLECTEURS (Story 4.6)
// ============================================================
function loadCollecteurs() {
    supabaseFetch('/rest/v1/collecteurs?select=id,alias,masque&order=alias.asc')
        .then(function(data) {
            collecteursList = (data || []).filter(function(c) { return !c.masque; });
            populateCollecteurSelect();
        })
        .catch(function(error) {
            console.warn('Erreur chargement collecteurs:', error);
        });
}

function populateCollecteurSelect() {
    var select = document.getElementById('field-collecteur');
    if (!select) return;
    // Garder la premiere option (placeholder)
    select.length = 1;
    collecteursList.forEach(function(coll) {
        var option = document.createElement('option');
        option.value = coll.alias;
        option.textContent = coll.alias;
        select.appendChild(option);
    });
}

// ============================================================
// 5. RENDU DES CARTES BILLETS (Stories 2.1, 2.3, 2.4, 2.5)
// ============================================================
function getStatusColor(categorie) {
    var key = categorie || 'Non defini';
    return CATEGORIE_COLORS[key] || CATEGORIE_COLORS['Non defini'];
}

function getTextColorForBg(hex) {
    hex = hex.replace('#', '');
    var r = parseInt(hex.substring(0, 2), 16);
    var g = parseInt(hex.substring(2, 4), 16);
    var b = parseInt(hex.substring(4, 6), 16);
    var luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.55 ? '#333' : '#fff';
}

function renderAdminCards() {
    var grid = document.getElementById('admin-cards-grid');
    if (!grid) return;

    var source = getDisplayedBillets();

    if (source.length === 0) {
        var hasFilters = adminActiveStatusFilter !== 'tous' || adminFilterEnCours || getSearchText();
        if (hasFilters) {
            // Story 2.1b — Etat vide avec filtres actifs
            grid.innerHTML = '<div class="admin-empty-state">' +
                '<i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>' +
                '<p>Aucun billet ne correspond a votre recherche</p>' +
                '<button class="admin-empty-state__reset" onclick="adminResetFilters()">' +
                'Reinitialiser les filtres</button>' +
                '</div>';
        } else {
            grid.innerHTML = '<div class="admin-empty-state">' +
                '<i class="fa-solid fa-box-open"></i>' +
                '<p>Aucun billet dans le catalogue</p>' +
                '<button class="btn-admin-primary" onclick="openBilletPanel()">' +
                '<i class="fa-solid fa-plus"></i> Ajouter un premier billet</button>' +
                '</div>';
        }
        var paginationContainer = document.getElementById('admin-pagination');
        if (paginationContainer) paginationContainer.style.display = 'none';
        return;
    }

    var totalPages = Math.ceil(source.length / PAGE_SIZE);
    if (currentPage > totalPages && totalPages > 0) currentPage = totalPages;
    var start = (currentPage - 1) * PAGE_SIZE;
    var end = Math.min(start + PAGE_SIZE, source.length);

    var html = '';
    for (var i = start; i < end; i++) {
        var billet = source[i];
        var docId = billet._id;
        var nom = billet.NomBillet || 'Sans nom';
        var statut = billet.Categorie || '';
        var statusLabel = statut || 'Non defini';
        var statusColor = getStatusColor(statut);

        html += '<div class="admin-card-billet" data-doc-id="' + docId + '">' +
            '<div class="admin-card-header">' +
                '<h3 class="admin-card-title">' + escapeHtml(nom) + ' <span style="font-size:10px; color:#ccc; font-weight:normal;">(n\u00b0' + docId + ')</span></h3>' +
                '<div class="card-badge-wrapper">' +
                    '<span class="admin-badge-status clickable" ' +
                        'data-doc-id="' + docId + '" ' +
                        'data-current-status="' + escapeAttr(statut) + '" ' +
                        'style="background-color: ' + statusColor + '; color: ' + getTextColorForBg(statusColor) + ';">' +
                        escapeHtml(statusLabel) +
                    '</span>' +
                    // Story 2.5 — popup de statut rapide (cache par defaut)
                    '<div class="quick-status-popup" id="quick-status-popup-' + docId + '" style="display: none;">' +
                        '<div class="quick-status-chips">' +
                            buildStatusChipsHtml(docId, statut) +
                        '</div>' +
                    '</div>' +
                '</div>' +
            '</div>' +
            '<div class="admin-card-meta">' +
                '<span>' + escapeHtml(billet.Ville || '') + '</span>' +
                '<span class="admin-card-ref">' +
                    escapeHtml(billet.Reference || '') +
                    (billet.Millesime ? ' - ' + escapeHtml(billet.Millesime) + (billet.Version ? '-' + escapeHtml(billet.Version) : '') : '') +
                '</span>' +
            '</div>' +
            // Story 4.5 — Badges version (normale + variante)
            (function() {
                var html = '';
                // Avertissement si la version normale n'existe pas
                if (billet.VersionNormaleExiste === false) {
                    html += '<span class="admin-card-version-warning">' +
                        '<i class="fa-solid fa-triangle-exclamation"></i> Pas de version normale' +
                        '</span>';
                }
                var v = billet.HasVariante || '';
                var label = '';
                if (v === 'anniversary') label = 'Anniversaire';
                else if (v === 'doré') label = 'Doré';
                if (label) {
                    html += '<span class="admin-card-variante-badge">' +
                        '<i class="fa-solid fa-star"></i> ' + escapeHtml(label) +
                        '</span>';
                }
                return html;
            })() +
            // Badge compteur inscriptions
            (function() {
                var data = adminInscriptionCounts[docId] || { count: 0, normaux: 0, variantes: 0 };
                var count = data.count;
                var detail = '';
                if (count > 0) {
                    var parts = [];
                    if (data.normaux > 0) parts.push(data.normaux + ' billet' + (data.normaux > 1 ? 's' : '') + ' normaux');
                    if (data.variantes > 0) {
                        var varLabel = billet.HasVariante || 'variante';
                        if (varLabel === 'anniversary') varLabel = 'anniv';
                        else if (varLabel === 'doré') varLabel = 'dorés';
                        parts.push(data.variantes + ' billet' + (data.variantes > 1 ? 's' : '') + ' ' + varLabel);
                    }
                    if (parts.length > 0) detail = ' (' + parts.join(', ') + ')';
                }
                return '<button class="admin-card-inscriptions-badge" onclick="openInscriptionsModal(' + docId + ')" title="Voir les inscriptions">' +
                    '<i class="fa-solid fa-users"></i> ' + count + ' inscription' + (count !== 1 ? 's' : '') + detail +
                    '</button>';
            })() +
            // Badges collectes supplémentaires
            (function() {
                var collectes = adminCollectesByBillet[docId] || [];
                if (collectes.length === 0) return '';
                var today = new Date().toISOString().slice(0, 10);
                return collectes.map(function(c) {
                    var isOpen = !c.date_fin || c.date_fin > today;
                    var cData = adminCollecteInscriptionCounts[c.id] || { count: 0, normaux: 0, variantes: 0 };
                    var statusIcon = isOpen ? 'fa-layer-group' : 'fa-circle-check';
                    var detail = '';
                    if (cData.count > 0) {
                        var parts = [];
                        if (cData.normaux > 0) parts.push(cData.normaux + ' billet' + (cData.normaux > 1 ? 's' : '') + ' normaux');
                        if (cData.variantes > 0) {
                            var varLabel = billet.HasVariante || 'variante';
                            if (varLabel === 'anniversary') varLabel = 'anniv';
                            else if (varLabel === 'doré') varLabel = 'dorés';
                            parts.push(cData.variantes + ' billet' + (cData.variantes > 1 ? 's' : '') + ' ' + varLabel);
                        }
                        if (parts.length > 0) detail = ' (' + parts.join(', ') + ')';
                    }
                    return '<button class="admin-card-inscriptions-badge admin-card-collecte-supp-badge" onclick="openInscriptionsModal(' + docId + ')" title="Collecte supplémentaire : ' + escapeAttr(c.nom) + '">' +
                        '<i class="fa-solid ' + statusIcon + '"></i> ' + escapeHtml(c.nom) + ' : ' + cData.count + ' inscription' + (cData.count !== 1 ? 's' : '') + detail +
                        (isOpen ? '' : ' <em>(clôturée)</em>') +
                        '</button>';
                }).join('');
            })() +
            // Story 2.3/2.4 — Boutons d'action
            '<div class="admin-card-actions">' +
                '<button class="admin-card-edit-btn" data-doc-id="' + docId + '" title="Modifier">' +
                    '<i class="fa-solid fa-pen"></i> Modifier' +
                '</button>' +
                (function() {
                    var ls = (billet.LinkSheet || '').trim();
                    if (ls && /^https?:\/\//i.test(ls)) {
                        return '<a href="' + escapeAttr(ls) + '" target="_blank" onclick="event.stopPropagation()" class="admin-card-sheet-btn" title="Google Sheet"><i class="fa-solid fa-file-csv"></i></a>';
                    }
                    return '';
                })() +
                '<button class="admin-card-share-btn" onclick="openShareModal(' + docId + ')" title="Partager">' +
                    '<i class="fa-solid fa-share-nodes"></i>' +
                '</button>' +
                '<button class="admin-card-copy-btn" data-doc-id="' + docId + '" title="Dupliquer">' +
                    '<i class="fa-solid fa-copy"></i>' +
                '</button>' +
                '<button class="admin-card-delete-btn" data-doc-id="' + docId + '" data-billet-name="' + escapeAttr(nom) + '" title="Supprimer">' +
                    '<i class="fa-solid fa-trash-can"></i>' +
                '</button>' +
            '</div>' +
            '</div>';
    }

    grid.innerHTML = html;
    renderPaginationControls(source.length, totalPages);
}

// Story 2.5 — Generer le HTML des chips de statut pour le popup rapide
function buildStatusChipsHtml(docId, currentStatus) {
    var html = '';
    var currentIndex = CATEGORIES.indexOf(currentStatus);

    CATEGORIES.forEach(function(statut, index) {
        var classes = 'status-chip';
        if (statut === currentStatus) classes += ' status-chip--active';
        if (currentIndex >= 0 && index === currentIndex + 1) classes += ' status-chip--next';

        var color = getStatusColor(statut);
        html += '<button class="' + classes + '" ' +
            'data-status="' + escapeAttr(statut) + '" ' +
            'data-doc-id="' + docId + '" ' +
            'style="background-color: ' + color + '; color: ' + getTextColorForBg(color) + ';" ' +
            'aria-pressed="' + (statut === currentStatus ? 'true' : 'false') + '">' +
            escapeHtml(statut) +
            '</button>';
    });

    return html;
}

// Utilitaires d'echappement
function escapeHtml(text) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(text));
    return div.innerHTML;
}

function escapeAttr(text) {
    return String(text).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ============================================================
// 5b. PAGINATION — SOURCE DE DONNEES
// ============================================================
function getDisplayedBillets() {
    return adminFilteredBillets.length > 0 || adminActiveStatusFilter !== 'tous' || adminFilterEnCours || getSearchText()
        ? adminFilteredBillets
        : adminBillets;
}

function getSearchText() {
    var input = document.getElementById('admin-search-input');
    return input ? input.value.trim() : '';
}

// ============================================================
// 5c. PAGINATION — CONTROLES DE NAVIGATION
// ============================================================
function renderPaginationControls(totalItems, totalPages) {
    var container = document.getElementById('admin-pagination');
    if (!container) return;

    if (totalPages <= 1) {
        container.style.display = 'none';
        return;
    }

    container.style.display = 'flex';
    container.setAttribute('role', 'navigation');
    container.setAttribute('aria-label', 'Pagination');
    var html = '';

    // Bouton precedent
    html += '<button class="admin-pagination-btn admin-pagination-prev"' +
        ' aria-label="Page précédente"' +
        (currentPage === 1 ? ' disabled' : '') +
        ' data-page="' + (currentPage - 1) + '">' +
        '<i class="fa-solid fa-chevron-left"></i> Précédent</button>';

    // Numeros de page (avec ellipses si > 7 pages)
    var pages = getPaginationRange(currentPage, totalPages);
    for (var i = 0; i < pages.length; i++) {
        if (pages[i] === '...') {
            html += '<span class="admin-pagination-ellipsis">...</span>';
        } else {
            html += '<button class="admin-pagination-btn admin-pagination-num' +
                (pages[i] === currentPage ? ' active' : '') + '"' +
                (pages[i] === currentPage ? ' aria-current="page"' : '') +
                ' aria-label="Page ' + pages[i] + '"' +
                ' data-page="' + pages[i] + '">' + pages[i] + '</button>';
        }
    }

    // Bouton suivant
    html += '<button class="admin-pagination-btn admin-pagination-next"' +
        ' aria-label="Page suivante"' +
        (currentPage === totalPages ? ' disabled' : '') +
        ' data-page="' + (currentPage + 1) + '">' +
        'Suivant <i class="fa-solid fa-chevron-right"></i></button>';

    // Compteur
    html += '<span class="admin-pagination-info">' +
        totalItems + ' billets — Page ' + currentPage + ' sur ' + totalPages +
        '</span>';

    container.innerHTML = html;
}

function getPaginationRange(current, total) {
    if (total <= 7) {
        var range = [];
        for (var i = 1; i <= total; i++) range.push(i);
        return range;
    }
    var pages = [];
    pages.push(1);
    var rangeStart = Math.max(2, current - 1);
    var rangeEnd = Math.min(total - 1, current + 1);
    // Etendre la fenetre si proche des bords
    if (rangeStart <= 3) {
        rangeEnd = Math.max(rangeEnd, 4);
        rangeStart = 2;
    }
    if (rangeEnd >= total - 2) {
        rangeStart = Math.min(rangeStart, total - 3);
        rangeEnd = total - 1;
    }
    if (rangeStart > 2) pages.push('...');
    for (var i = rangeStart; i <= rangeEnd; i++) pages.push(i);
    if (rangeEnd < total - 1) pages.push('...');
    pages.push(total);
    return pages;
}

// ============================================================
// 6. STORY 2.2 — PANEL LATERAL (ouverture / fermeture)
// ============================================================

function initPanel() {
    // Bouton "Ajouter un billet"
    var addBtn = document.getElementById('btn-add-billet');
    if (addBtn) {
        addBtn.addEventListener('click', function() {
            openBilletPanel();
        });
    }

    // Bouton fermer le panel
    var closeBtn = document.getElementById('panel-close-btn');
    if (closeBtn) {
        closeBtn.addEventListener('click', function() {
            closeBilletPanel();
        });
    }

    // Clic sur l'overlay ferme le panel
    var overlay = document.getElementById('admin-panel-overlay');
    if (overlay) {
        overlay.addEventListener('click', function() {
            closeBilletPanel();
        });
    }

    // Story 9.2 — Toggle PrixVariante quand HasVariante change
    var hasVarianteSelect = document.getElementById('field-has-variante');
    if (hasVarianteSelect) {
        hasVarianteSelect.addEventListener('change', function() {
            togglePrixVarianteField();
        });
    }

    // Toggle prix normal quand VersionNormaleExiste change
    var cbVersionNormale = document.getElementById('field-version-normale');
    if (cbVersionNormale) {
        cbVersionNormale.addEventListener('change', function() {
            togglePrixVarianteField();
        });
    }

    // Story 9.3 — Mise à jour état des champs date quand catégorie change
    // Story 9.6 — Toggle prix fields quand catégorie change
    var categorieSelect = document.getElementById('field-categorie');
    if (categorieSelect) {
        categorieSelect.addEventListener('change', function() {
            var newCat = categorieSelect.value;
            updateDateFieldsState(newCat);
            autoFillDateForStatus(newCat);
            togglePrixFields();
        });
    }

    // Auto-remplir le département avec le code ISO du pays sélectionné
    var paysSelect = document.getElementById('field-pays');
    if (paysSelect) {
        paysSelect.addEventListener('change', function() {
            var depField = document.getElementById('field-dep');
            if (!depField) return;
            var paysNom = paysSelect.value;
            var iso = paysIsoMap[paysNom];
            if (iso) {
                depField.value = iso + '-';
                depField.focus();
                // Placer le curseur après le tiret
                depField.setSelectionRange(depField.value.length, depField.value.length);
            }
        });
    }

    // Soumission du formulaire
    var form = document.getElementById('admin-billet-form');
    if (form) {
        form.addEventListener('submit', function(e) {
            e.preventDefault();
            if (!validateBilletForm()) return;

            var panel = document.getElementById('admin-panel');
            var billetData = collectFormData();

            // Story 9.3 — Auto-remplissage/nettoyage dates si statut changé (mode édition)
            if (panel && panel.dataset.editId) {
                var editId = panel.dataset.editId;
                var oldBillet = null;
                for (var bi = 0; bi < adminBillets.length; bi++) {
                    if (String(adminBillets[bi]._id) === String(editId)) { oldBillet = adminBillets[bi]; break; }
                }
                if (oldBillet && oldBillet.Categorie !== billetData.Categorie) {
                    var existingDates = {
                        DatePre: billetData.DatePre || oldBillet.DatePre,
                        DateColl: billetData.DateColl || oldBillet.DateColl,
                        DateFin: billetData.DateFin || oldBillet.DateFin
                    };
                    var dateUpdates = getDateUpdatesForStatusChange(oldBillet.Categorie, billetData.Categorie, existingDates);
                    for (var dk in dateUpdates) {
                        billetData[dk] = dateUpdates[dk];
                    }
                }
                // Détecter un changement forcé de type (champs déverrouillés par l'admin)
                var forcedTypeChange = null;
                var cbNormaleEl = document.getElementById('field-version-normale');
                var hasVarianteEl2 = document.getElementById('field-has-variante');
                if (cbNormaleEl && cbNormaleEl.dataset.frozenValue !== undefined &&
                    hasVarianteEl2 && hasVarianteEl2.dataset.frozenValue !== undefined) {
                    var ancienNormale = cbNormaleEl.dataset.frozenValue === '1';
                    var ancienVariante = hasVarianteEl2.dataset.frozenValue || '';
                    var nouveauNormale = billetData.VersionNormaleExiste;
                    var nouveauVariante = billetData.HasVariante || '';
                    var ancienVarianteActive = ancienVariante && ancienVariante !== 'N';
                    var nouveauVarianteActive = nouveauVariante && nouveauVariante !== 'N';
                    if (ancienNormale !== nouveauNormale || ancienVariante !== nouveauVariante) {
                        var tc = {
                            supprimeNormale: ancienNormale && !nouveauNormale,
                            supprimeVariante: ancienVarianteActive && !nouveauVarianteActive,
                            ajouteNormale: !ancienNormale && nouveauNormale,
                            ajouteVariante: !ancienVarianteActive && nouveauVarianteActive
                        };
                        if (tc.supprimeNormale || tc.supprimeVariante || tc.ajouteNormale || tc.ajouteVariante) {
                            forcedTypeChange = tc;
                        }
                    }
                }
                updateBillet(editId, billetData, forcedTypeChange);
            } else {
                saveBillet(billetData);
            }
        });
    }

    // Story 2.5 — Delegation d'evenements sur la grille
    var cardsGrid = document.getElementById('admin-cards-grid');
    if (cardsGrid) {
        cardsGrid.addEventListener('click', function(event) {
            // Story 2.5 — Clic sur un chip de statut rapide
            var chip = event.target.closest('.status-chip');
            if (chip) {
                event.stopPropagation();
                handleQuickStatusChange(chip);
                return;
            }

            // Story 2.5 — Clic sur le badge de statut
            var badge = event.target.closest('.admin-badge-status.clickable');
            if (badge) {
                event.stopPropagation();
                handleBadgeClick(badge);
                return;
            }

            // Story 2.4 — Clic sur le bouton supprimer
            var deleteBtn = event.target.closest('.admin-card-delete-btn');
            if (deleteBtn) {
                event.stopPropagation();
                var docId = deleteBtn.getAttribute('data-doc-id');
                var billetName = deleteBtn.getAttribute('data-billet-name');
                if (docId && billetName) {
                    openDeleteModal(docId, billetName);
                }
                return;
            }

            // Story 2.3 — Clic sur le bouton modifier
            var editBtn = event.target.closest('.admin-card-edit-btn');
            if (editBtn) {
                event.stopPropagation();
                var editDocId = editBtn.getAttribute('data-doc-id');
                if (editDocId) {
                    var billetEditData = findBilletById(editDocId);
                    if (billetEditData) {
                        openBilletPanel(billetEditData, editDocId);
                    }
                }
                return;
            }

            // Clic sur le bouton dupliquer
            var copyBtn = event.target.closest('.admin-card-copy-btn');
            if (copyBtn) {
                event.stopPropagation();
                var copyDocId = copyBtn.getAttribute('data-doc-id');
                if (copyDocId) {
                    var billetCopyData = findBilletById(copyDocId);
                    if (billetCopyData) {
                        copyBillet(billetCopyData);
                    }
                }
                return;
            }
        });
    }

    // Story 2.5 — Fermer les popups au clic en dehors
    document.addEventListener('click', function(event) {
        if (!event.target.closest('.quick-status-popup') && !event.target.closest('.admin-badge-status')) {
            closeAllStatusPopups();
        }
    });

    // Story 2.5 — Fermer les popups avec Escape
    document.addEventListener('keydown', function(event) {
        if (event.key === 'Escape') {
            closeAllStatusPopups();
        }
    });

    // Story 12.3 — Délégation sur la liste des collectes (clôture)
    var collectesList = document.getElementById('collectes-list');
    if (collectesList) {
        collectesList.addEventListener('click', function(e) {
            var btn = e.target.closest('.btn-cloturer-collecte');
            if (!btn) return;
            cloturerCollecte(btn.dataset.collecteId, btn.dataset.billetId);
        });
    }

    // Story 12.3 — Bouton ajouter une collecte
    var btnAddCollecte = document.getElementById('btn-add-collecte');
    if (btnAddCollecte) {
        btnAddCollecte.addEventListener('click', function() {
            var section = document.getElementById('admin-collectes-supplementaires');
            if (!section) return;
            var billetId = section.dataset.billetId;
            if (!billetId) return;
            if (!validateCollecteForm()) return;
            saveCollecte(billetId);
        });
    }

    // Pagination — event delegation
    var paginationContainer = document.getElementById('admin-pagination');
    if (paginationContainer) {
        paginationContainer.addEventListener('click', function(event) {
            var btn = event.target.closest('.admin-pagination-btn');
            if (!btn || btn.disabled) return;
            var page = parseInt(btn.getAttribute('data-page'), 10);
            if (isNaN(page) || page < 1 || page === currentPage) return;
            var source = getDisplayedBillets();
            var maxPage = Math.ceil(source.length / PAGE_SIZE);
            if (page > maxPage) return;
            currentPage = page;
            renderAdminCards();
            // Scroll vers le haut de la grille
            var grid = document.getElementById('admin-cards-grid');
            if (grid) grid.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    }
}

// Trouver un billet par son ID dans le tableau en memoire
function findBilletById(docId) {
    for (var i = 0; i < adminBillets.length; i++) {
        if (String(adminBillets[i]._id) === String(docId)) {
            return adminBillets[i];
        }
    }
    return null;
}

// --- Ouverture du panel (mode ajout ou edition) ---
// Story 2.2 (ajout) + Story 2.3 (edition)
function openBilletPanel(billetData, docId) {
    var panel = document.getElementById('admin-panel');
    if (!panel) return;
    var overlay = document.getElementById('admin-panel-overlay');
    var form = document.getElementById('admin-billet-form');
    var title = document.getElementById('panel-title');
    var saveBtn = document.getElementById('panel-save-btn');

    // Reinitialiser le formulaire
    if (form) form.reset();

    // Nettoyer les erreurs de validation
    clearValidationErrors();

    // Reactiver le bouton de sauvegarde
    if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Sauvegarder';
    }

    // Story 5.2 — Reset des champs Google et du gel collecteur
    resetGoogleFields();
    resetCollecteurFreeze();

    // Reset prévisualisation image
    clearImageUpload();

    if (billetData && docId) {
        // --- Mode edition (Story 2.3) ---
        panel.dataset.editId = docId;
        if (title) title.textContent = 'Modifier le billet';
        if (saveBtn) saveBtn.textContent = 'Enregistrer les modifications';
        panel.setAttribute('aria-label', 'Modifier le billet');

        // Story 4.4 — Millesime en mode edition (2015 a N+1)
        populateMillesimeSelect('edit');

        // Pre-remplir tous les champs
        prefillForm(billetData);

        // Story 12.3 — Section collectes supplémentaires (mode edition uniquement)
        var sectionCollectes = document.getElementById('admin-collectes-supplementaires');
        if (sectionCollectes) {
            sectionCollectes.style.display = '';
            sectionCollectes.dataset.billetId = billetData.id || '';
            sectionCollectes.dataset.billetCollecteur = billetData.Collecteur || '';
            loadCollectesForBillet(billetData.id);
            var elDatePre = document.getElementById('field-collecte-date-pre');
            if (elDatePre) elDatePre.value = new Date().toISOString().slice(0, 10);
        }
        populateCollecteCollecteurSelect();
        var selectColl = document.getElementById('field-collecte-collecteur');
        if (selectColl && billetData.Collecteur) selectColl.value = billetData.Collecteur;

        // Story 5.2 — Gestion des champs Google en mode edition
        var hasGoogleData = (billetData.LinkSheet && billetData.LinkSheet !== '') ||
                            (billetData.Sondage && billetData.Sondage !== '');

        document.querySelectorAll('[data-google-field="true"]').forEach(function(group) {
            if (hasGoogleData) {
                group.style.display = '';
                var input = group.querySelector('input');
                if (input) {
                    input.setAttribute('readonly', 'readonly');
                    input.classList.add('admin-field-readonly');
                    // Bouton supprimer le lien Google
                    if (input.value && !group.querySelector('.btn-clear-google')) {
                        var wrapper = document.createElement('div');
                        wrapper.className = 'google-field-wrapper';
                        input.parentNode.insertBefore(wrapper, input);
                        wrapper.appendChild(input);
                        var clearBtn = document.createElement('button');
                        clearBtn.type = 'button';
                        clearBtn.className = 'btn-clear-google';
                        clearBtn.title = 'Supprimer ce lien';
                        clearBtn.innerHTML = '<i class="fa-solid fa-trash-can"></i>';
                        clearBtn.onclick = function() {
                            input.value = '';
                            input.removeAttribute('readonly');
                            input.classList.remove('admin-field-readonly');
                            clearBtn.remove();
                        };
                        wrapper.appendChild(clearBtn);
                    }
                }
                var label = group.querySelector('label');
                if (label && !label.querySelector('.badge-ancien-systeme')) {
                    var badge = document.createElement('span');
                    badge.className = 'badge-ancien-systeme';
                    badge.textContent = 'Ancien système';
                    label.appendChild(badge);
                }
            } else {
                group.style.display = 'none';
            }
        });

        // Story 5.2 — Gel du collecteur + type de billet si des inscriptions existent
        var collecteurSelect = document.getElementById('field-collecteur');
        var collecteurValue = billetData.Collecteur || '';
        if (docId) {
            hasInscriptions(docId).then(function(frozen) {
                if (frozen) {
                    // Gel du collecteur
                    if (collecteurSelect && collecteurValue) {
                        collecteurSelect.disabled = true;
                        collecteurSelect.classList.add('admin-field-frozen');
                        var hint = document.createElement('small');
                        hint.className = 'collecteur-frozen-hint';
                        hint.textContent = 'Collecteur figé — des inscriptions existent pour ce billet';
                        if (collecteurSelect.parentNode) collecteurSelect.parentNode.appendChild(hint);
                    }
                    // Gel de VersionNormaleExiste
                    var cbNormale = document.getElementById('field-version-normale');
                    if (cbNormale) {
                        cbNormale.disabled = true;
                        cbNormale.classList.add('admin-field-frozen');
                        cbNormale.dataset.frozenValue = cbNormale.checked ? '1' : '0';
                    }
                    // Gel de HasVariante
                    var hasVarianteEl = document.getElementById('field-has-variante');
                    if (hasVarianteEl) {
                        hasVarianteEl.disabled = true;
                        hasVarianteEl.classList.add('admin-field-frozen');
                        hasVarianteEl.dataset.frozenValue = hasVarianteEl.value || '';
                    }
                    // Message d'avertissement sur la section Type, avec lien de déverrouillage admin
                    var typeLegend = cbNormale && cbNormale.closest('fieldset');
                    if (typeLegend && !typeLegend.querySelector('.type-frozen-hint')) {
                        var typeHint = document.createElement('small');
                        typeHint.className = 'type-frozen-hint';
                        typeHint.textContent = 'Type figé — des inscriptions existent pour ce billet. ';
                        var unlockLink = document.createElement('a');
                        unlockLink.href = '#';
                        unlockLink.className = 'type-frozen-unlock';
                        unlockLink.textContent = 'Modifier quand même';
                        (function(hint, cbN, hvEl) {
                            unlockLink.addEventListener('click', function(e) {
                                e.preventDefault();
                                var varianteActive = hvEl && hvEl.value && hvEl.value !== 'N';
                                var msg = 'Attention : modifier le type du billet peut supprimer des inscriptions existantes.\n\n';
                                if (cbN && cbN.checked) msg += '• Si vous décochez "Version normale", les inscriptions normales seront supprimées.\n';
                                if (varianteActive) msg += '• Si vous passez à "Pas de variante", les inscriptions variante seront supprimées.\n';
                                msg += '\nContinuer ?';
                                if (!confirm(msg)) return;
                                if (cbN) { cbN.disabled = false; cbN.classList.remove('admin-field-frozen'); }
                                if (hvEl) { hvEl.disabled = false; hvEl.classList.remove('admin-field-frozen'); }
                                hint.remove();
                            });
                        })(typeHint, cbNormale, hasVarianteEl);
                        typeHint.appendChild(unlockLink);
                        typeLegend.appendChild(typeHint);
                    }
                }
            });
        }
    } else {
        // --- Mode ajout (Story 2.2) ---
        delete panel.dataset.editId;
        if (title) title.textContent = 'Ajouter un billet';

        // Story 12.3 — Masquer la section collectes supplémentaires en mode création
        var sectionCollectes = document.getElementById('admin-collectes-supplementaires');
        if (sectionCollectes) sectionCollectes.style.display = 'none';
        if (saveBtn) saveBtn.textContent = 'Sauvegarder';
        panel.setAttribute('aria-label', 'Ajouter un billet');

        // Story 4.4 — Millesime en mode creation (N-3 a N+1, defaut N)
        populateMillesimeSelect('create');

        // Statut par defaut
        var categorieField = document.getElementById('field-categorie');
        if (categorieField) categorieField.value = CATEGORIE_DEFAULT;

        // Auto-remplir la date de pré-collecte pour un nouveau billet
        autoFillDateForStatus(CATEGORIE_DEFAULT);

        // Story 9.6 — Bloquer les champs prix selon le statut par défaut
        togglePrixFields();

        // Story 5.2 — Masquer les champs Google en mode ajout
        document.querySelectorAll('[data-google-field="true"]').forEach(function(group) {
            group.style.display = 'none';
        });
    }

    // Ouvrir le panel
    panel.classList.add('open');
    if (overlay) overlay.classList.add('open');
    document.body.style.overflow = 'hidden';

    // Focus trap
    initFocusTrap(panel);

    // Focus sur le premier champ
    var firstInput = document.getElementById('field-nom-billet');
    if (firstInput) {
        setTimeout(function() { firstInput.focus(); }, 350);
    }
}

// Dupliquer un billet — ouvre le panel en mode ajout avec les données copiées
function copyBillet(billetData) {
    // Copier les données sans l'id, les dates et les champs Google
    var copy = {};
    for (var key in billetData) {
        if (billetData.hasOwnProperty(key)) {
            copy[key] = billetData[key];
        }
    }
    delete copy._id;
    delete copy.id;
    delete copy.DatePre;
    delete copy.DateColl;
    delete copy.DateFin;
    delete copy.Sondage;
    delete copy.LinkSondage;
    delete copy.LinkSheet;
    delete copy.LinkFB;
    delete copy.Commentaire;
    delete copy.Collecteur;
    delete copy.ImageUrl;
    delete copy.ImageId;
    copy.NomBillet = (copy.NomBillet || '') + ' (copie)';
    copy.Categorie = CATEGORIE_DEFAULT;

    // Ouvrir le panel en mode ajout (pas de docId)
    openBilletPanel(null, null);

    // Pré-remplir avec les données copiées
    prefillForm(copy);

    // Remettre le statut par défaut après prefill
    var categorieField = document.getElementById('field-categorie');
    if (categorieField) categorieField.value = CATEGORIE_DEFAULT;
    togglePrixFields();
    updateDateFieldsState(CATEGORIE_DEFAULT);
    autoFillDateForStatus(CATEGORIE_DEFAULT);

    showToast('Billet dupliqué — modifiez puis sauvegardez', 'info');
}

// Story 2.3 — Pre-remplir le formulaire avec les donnees du billet
function prefillForm(data) {
    var fields = {
        'field-nom-billet': 'NomBillet',
        'field-ville': 'Ville',
        'field-reference': 'Reference',
        'field-millesime': 'Millesime',
        'field-version': 'Version',
        'field-has-variante': 'HasVariante',
        'field-dep': 'Dep',
        'field-cp': 'Cp',
        'field-pays': 'Pays',
        'field-categorie': 'Categorie',
        'field-theme': 'Theme',
        'field-collecteur': 'Collecteur',
        'field-prix': 'Prix',
        'field-prix-variante': 'PrixVariante',
        'field-fdp-com': 'FDP_Com',
        'field-date-pre': 'DatePre',
        'field-date-coll': 'DateColl',
        'field-date-fin': 'DateFin',
        'field-image-url': 'ImageUrl',
        'field-image-id': 'ImageId',
        'field-sondage': 'Sondage',
        'field-link-sondage': 'LinkSondage',
        'field-link-sheet': 'LinkSheet',
        'field-link-fb': 'LinkFB'
    };

    for (var fieldId in fields) {
        var el = document.getElementById(fieldId);
        if (el) el.value = data[fields[fieldId]] || '';
    }

    // Commentaire (textarea)
    var commentaireEl = document.getElementById('field-commentaire');
    if (commentaireEl) commentaireEl.value = data.Commentaire || '';

    // Story 4.3 — Pays select : ajouter l'option si elle n'existe pas
    var paysSelect = document.getElementById('field-pays');
    var paysValue = data.Pays || '';
    if (paysSelect && paysValue) {
        var paysOptionExists = Array.prototype.some.call(paysSelect.options, function(opt) {
            return opt.value === paysValue;
        });
        if (!paysOptionExists) {
            var newPaysOption = document.createElement('option');
            newPaysOption.value = paysValue;
            newPaysOption.textContent = paysValue + ' (ancien)';
            paysSelect.appendChild(newPaysOption);
        }
        paysSelect.value = paysValue;
    }

    // Story 4.4 — Millesime select : ajouter l'option si elle n'existe pas
    var millesimeSelect = document.getElementById('field-millesime');
    var millesimeValue = String(data.Millesime || '');
    if (millesimeSelect && millesimeValue) {
        var millesimeOptionExists = Array.prototype.some.call(millesimeSelect.options, function(opt) {
            return opt.value === millesimeValue;
        });
        if (!millesimeOptionExists) {
            var newMillesimeOption = document.createElement('option');
            newMillesimeOption.value = millesimeValue;
            newMillesimeOption.textContent = millesimeValue;
            millesimeSelect.appendChild(newMillesimeOption);
        }
        millesimeSelect.value = millesimeValue;
    }

    // Story 4.6 — Collecteur select : ajouter l'option si elle n'existe pas
    var collecteurSelect = document.getElementById('field-collecteur');
    var collecteurValue = data.Collecteur || '';
    if (collecteurSelect && collecteurValue) {
        var collecteurOptionExists = Array.prototype.some.call(collecteurSelect.options, function(opt) {
            return opt.value === collecteurValue;
        });
        if (!collecteurOptionExists) {
            var newCollOption = document.createElement('option');
            newCollOption.value = collecteurValue;
            newCollOption.textContent = collecteurValue + ' (ancien)';
            collecteurSelect.appendChild(newCollOption);
        }
        collecteurSelect.value = collecteurValue;
    }

    // Checkbox PayerFDP
    var payerFdpEl = document.getElementById('field-payer-fdp');
    if (payerFdpEl) payerFdpEl.checked = (data.PayerFDP === 'oui');

    // Statut
    var categorie = data.Categorie || CATEGORIE_DEFAULT;
    var categorieField = document.getElementById('field-categorie');
    if (categorieField) categorieField.value = categorie;

    // Checkbox "Normale" — Story 9.9
    var cbNormale = document.getElementById('field-version-normale');
    if (cbNormale) {
        if (data.HasVariante === 'only') {
            // Billets legacy avec valeur 'only' : décocher Normale, remettre variante à vide
            var hasVarEl = document.getElementById('field-has-variante');
            if (hasVarEl) hasVarEl.value = '';
            cbNormale.checked = false;
        } else {
            cbNormale.checked = data.VersionNormaleExiste !== false;
        }
    }

    // Story 9.2 — Affichage conditionnel du champ PrixVariante
    togglePrixVarianteField();

    // Story 9.3 — Activer/désactiver les champs date selon le statut
    updateDateFieldsState(categorie);

    // Story 9.6 — Bloquer les champs prix en Pré-collecte
    togglePrixFields();

    // Prévisualisation image — priorité ImageUrl > ImageId (Google Drive)
    var imgUrl = data.ImageUrl || '';
    var imgId = data.ImageId || '';

    // Afficher le champ ImageId legacy uniquement si le billet en a un
    var groupImageId = document.getElementById('group-image-id');
    if (groupImageId) {
        if (imgId) {
            groupImageId.classList.remove('hidden');
        } else {
            groupImageId.classList.add('hidden');
        }
    }

    if (imgUrl) {
        var previewEl = document.getElementById('image-preview');
        var placeholderEl = document.getElementById('image-upload-placeholder');
        var removeBtnEl = document.getElementById('btn-image-remove');
        if (previewEl) {
            previewEl.src = imgUrl;
            previewEl.classList.remove('hidden');
        }
        if (placeholderEl) placeholderEl.classList.add('hidden');
        if (removeBtnEl) removeBtnEl.classList.remove('hidden');
    } else if (imgId) {
        var safeId = imgId.replace(/[^a-zA-Z0-9_-]/g, '');
        var driveUrl = 'https://drive.google.com/thumbnail?id=' + safeId + '&sz=w400';
        var previewEl2 = document.getElementById('image-preview');
        var placeholderEl2 = document.getElementById('image-upload-placeholder');
        var removeBtnEl2 = document.getElementById('btn-image-remove');
        if (previewEl2) {
            previewEl2.src = driveUrl;
            previewEl2.classList.remove('hidden');
        }
        if (placeholderEl2) placeholderEl2.classList.add('hidden');
        if (removeBtnEl2) removeBtnEl2.classList.remove('hidden');
    } else {
        clearImageUpload();
    }
}

// --- Story 9.9 — Affichage conditionnel des champs Prix / PrixVariante ---
function togglePrixVarianteField() {
    var hasVarianteEl = document.getElementById('field-has-variante');
    var groupPrixVariante = document.getElementById('group-prix-variante');
    var cbNormale = document.getElementById('field-version-normale');
    var groupPrix = document.getElementById('field-prix');
    var labelPrix = groupPrix ? groupPrix.closest('.admin-form-group') : null;

    // Affichage du prix variante : seulement si variante active
    if (hasVarianteEl && groupPrixVariante) {
        var val = hasVarianteEl.value;
        var showVariante = val && val !== 'N';
        groupPrixVariante.style.display = showVariante ? '' : 'none';
        if (!showVariante) {
            var prixVarEl = document.getElementById('field-prix-variante');
            if (prixVarEl) prixVarEl.value = '';
        }
    }

    // Affichage du prix normal : masqué si pas de version normale
    if (cbNormale && labelPrix) {
        var normaleActive = cbNormale.checked;
        labelPrix.style.display = normaleActive ? '' : 'none';
        if (!normaleActive && groupPrix) {
            groupPrix.value = '';
        }
    }

    // Effacer l'erreur de validation croisee quand on change la variante
    var errorVariante = document.getElementById('error-has-variante');
    if (errorVariante) errorVariante.textContent = '';
}

// --- Story 9.6 — Bloquer les champs prix en Pré-collecte ---
function togglePrixFields() {
    var categorieEl = document.getElementById('field-categorie');
    var prixEl = document.getElementById('field-prix');
    var prixVarEl = document.getElementById('field-prix-variante');
    var msgEl = document.getElementById('prix-precollecte-msg');
    if (!categorieEl || !prixEl) return;

    var isPreCollecte = (categorieEl.value === 'Pré collecte');

    prixEl.disabled = isPreCollecte;
    if (prixVarEl) prixVarEl.disabled = isPreCollecte;

    if (isPreCollecte) {
        prixEl.value = '';
        if (prixVarEl) prixVarEl.value = '';
    }

    if (msgEl) {
        msgEl.style.display = isPreCollecte ? '' : 'none';
    }
}

// --- Fermeture du panel ---
function closeBilletPanel() {
    var panel = document.getElementById('admin-panel');
    if (!panel) return;
    var overlay = document.getElementById('admin-panel-overlay');

    panel.classList.remove('open');
    if (overlay) overlay.classList.remove('open');
    document.body.style.overflow = '';

    // Nettoyer le mode edition
    delete panel.dataset.editId;

    // Retirer le focus trap
    destroyFocusTrap();

    // Remettre le focus sur le bouton d'ajout
    var addBtn = document.getElementById('btn-add-billet');
    if (addBtn) addBtn.focus();
}

// ============================================================
// 7. STORY 2.2 — FOCUS TRAP & ESCAPE
// ============================================================

function initFocusTrap(panelElement) {
    destroyFocusTrap();

    focusTrapHandler = function(e) {
        if (e.key !== 'Tab') return;

        var focusableElements = panelElement.querySelectorAll(
            'input:not([type="hidden"]), select, textarea, button, [tabindex]:not([tabindex="-1"])'
        );
        if (focusableElements.length === 0) return;

        var firstEl = focusableElements[0];
        var lastEl = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
            if (document.activeElement === firstEl) {
                e.preventDefault();
                lastEl.focus();
            }
        } else {
            if (document.activeElement === lastEl) {
                e.preventDefault();
                firstEl.focus();
            }
        }
    };

    escapeHandler = function(e) {
        if (e.key === 'Escape') {
            var panel = document.getElementById('admin-panel');
            if (panel && panel.classList.contains('open')) {
                e.preventDefault();
                closeBilletPanel();
            }
        }
    };

    document.addEventListener('keydown', focusTrapHandler);
    document.addEventListener('keydown', escapeHandler);
}

function destroyFocusTrap() {
    if (focusTrapHandler) {
        document.removeEventListener('keydown', focusTrapHandler);
        focusTrapHandler = null;
    }
    if (escapeHandler) {
        document.removeEventListener('keydown', escapeHandler);
        escapeHandler = null;
    }
}

// ============================================================
// 8. (Section supprimee — les chips statut sont remplaces par un select)
// ============================================================

// ============================================================
// 9. STORY 2.2 — VALIDATION DU FORMULAIRE
// ============================================================

function clearValidationErrors() {
    var errorGroups = document.querySelectorAll('.admin-form-group.has-error');
    errorGroups.forEach(function(group) {
        group.classList.remove('has-error');
    });
    var errorMsgs = document.querySelectorAll('.admin-form-error');
    errorMsgs.forEach(function(msg) {
        msg.textContent = '';
    });
}

function setFieldError(fieldId, errorId, message) {
    var field = document.getElementById(fieldId);
    if (!field) return;
    var group = field.closest('.admin-form-group');
    if (group) group.classList.add('has-error');
    var errorEl = document.getElementById(errorId);
    if (errorEl) errorEl.textContent = message;
}

function validateBilletForm() {
    clearValidationErrors();
    var valid = true;
    var firstErrorField = null;

    var nomBillet = document.getElementById('field-nom-billet');
    if (nomBillet && nomBillet.value.trim() === '') {
        setFieldError('field-nom-billet', 'error-nom-billet', 'Le champ Nom est requis');
        valid = false;
        if (!firstErrorField) firstErrorField = nomBillet;
    }

    var reference = document.getElementById('field-reference');
    if (reference && reference.value.trim() === '') {
        setFieldError('field-reference', 'error-reference', 'Le champ Reference est requis');
        valid = false;
        if (!firstErrorField) firstErrorField = reference;
    }

    var version = document.getElementById('field-version');
    if (version && version.value.trim() === '') {
        setFieldError('field-version', 'error-version', 'Le champ Version est requis');
        valid = false;
        if (!firstErrorField) firstErrorField = version;
    }

    var prix = document.getElementById('field-prix');
    var categorie = document.getElementById('field-categorie');
    var isCollecte = categorie && categorie.value === 'Collecte';

    // Date obligatoire si catégorie ≠ "Masqué"
    if (categorie && categorie.value !== 'Masqué') {
        var datePre = document.getElementById('field-date-pre');
        var dateColl = document.getElementById('field-date-coll');
        var dateFin = document.getElementById('field-date-fin');
        var hasDate = (datePre && datePre.value) || (dateColl && dateColl.value) || (dateFin && dateFin.value);
        if (!hasDate) {
            setFieldError('field-date-pre', 'error-date-pre', 'Au moins une date est requise (sauf pour les billets "Masqué")');
            valid = false;
            if (!firstErrorField) firstErrorField = datePre;
        }
    }

    if (prix && prix.value !== '' && (isNaN(parseFloat(prix.value)) || parseFloat(prix.value) < 0)) {
        setFieldError('field-prix', 'error-prix', 'Le prix doit etre un nombre positif');
        valid = false;
        if (!firstErrorField) firstErrorField = prix;
    }

    // Prix obligatoire en statut Collecte (seulement si version normale existe)
    var cbNormaleForPrix = document.getElementById('field-version-normale');
    var normaleExistePourPrix = cbNormaleForPrix ? cbNormaleForPrix.checked : true;
    if (isCollecte && normaleExistePourPrix && prix && (prix.value.trim() === '' || parseFloat(prix.value) <= 0)) {
        setFieldError('field-prix', 'error-prix', 'Le prix est obligatoire pour passer en Collecte');
        valid = false;
        if (!firstErrorField) firstErrorField = prix;
    }

    // Prix variante obligatoire en statut Collecte si variante active et pas de version normale
    var hasVarianteForPrix = document.getElementById('field-has-variante');
    var varianteActivePourPrix = hasVarianteForPrix && hasVarianteForPrix.value && hasVarianteForPrix.value !== 'N';
    var prixVarianteForValidation = document.getElementById('field-prix-variante');
    if (isCollecte && varianteActivePourPrix && !normaleExistePourPrix && prixVarianteForValidation && (prixVarianteForValidation.value.trim() === '' || parseFloat(prixVarianteForValidation.value) <= 0)) {
        setFieldError('field-prix-variante', 'error-prix-variante', 'Le prix variante est obligatoire pour passer en Collecte');
        valid = false;
        if (!firstErrorField) firstErrorField = prixVarianteForValidation;
    }

    // Collecteur obligatoire en statut Collecte
    var collecteur = document.getElementById('field-collecteur');
    if (isCollecte && collecteur && collecteur.value === '') {
        setFieldError('field-collecteur', 'error-collecteur', 'Le collecteur est obligatoire pour passer en Collecte');
        valid = false;
        if (!firstErrorField) firstErrorField = collecteur;
    }

    // Story 9.9 — Validation croisee : au moins un type (normale ou variante)
    var cbNormale = document.getElementById('field-version-normale');
    var hasVariante = document.getElementById('field-has-variante');
    if (cbNormale && hasVariante) {
        var normaleActive = cbNormale.checked;
        var varianteVal = hasVariante.value;
        var varianteActive = varianteVal && varianteVal !== 'N';
        if (!normaleActive && !varianteActive) {
            setFieldError('field-has-variante', 'error-has-variante', 'Un billet doit avoir au moins un type (normal ou variante)');
            valid = false;
            if (!firstErrorField) firstErrorField = hasVariante;
        }
    }

    // Story 9.2 — Validation prix variante
    var prixVariante = document.getElementById('field-prix-variante');
    if (prixVariante && prixVariante.value !== '' && (isNaN(parseFloat(prixVariante.value)) || parseFloat(prixVariante.value) < 0)) {
        setFieldError('field-prix-variante', 'error-prix-variante', 'Le prix variante doit etre un nombre positif');
        valid = false;
        if (!firstErrorField) firstErrorField = prixVariante;
    }

    if (!valid && firstErrorField) {
        firstErrorField.focus();
    }

    return valid;
}

// ============================================================
// 10. STORY 2.2 — COLLECTE DES DONNEES DU FORMULAIRE
// ============================================================

function collectFormData() {
    var getValue = function(id) {
        var el = document.getElementById(id);
        return el ? el.value.trim() : '';
    };

    var payerFdpEl = document.getElementById('field-payer-fdp');
    var panel = document.getElementById('admin-panel');
    var billetData = {
        NomBillet: getValue('field-nom-billet'),
        Ville: getValue('field-ville'),
        Reference: getValue('field-reference'),
        Millesime: getValue('field-millesime'),
        Version: getValue('field-version'),
        HasVariante: getValue('field-has-variante') || null,
        VersionNormaleExiste: (function() {
            var cb = document.getElementById('field-version-normale');
            return cb ? cb.checked : true;
        })(),
        Dep: getValue('field-dep'),
        Cp: getValue('field-cp'),
        Pays: getValue('field-pays'),
        Theme: getValue('field-theme'),
        Collecteur: getValue('field-collecteur'),
        Prix: getValue('field-prix') ? parseFloat(getValue('field-prix')) : null,
        PrixVariante: getValue('field-prix-variante') ? parseFloat(getValue('field-prix-variante')) : null,
        PayerFDP: payerFdpEl && payerFdpEl.checked ? 'oui' : '',
        FDP_Com: getValue('field-fdp-com'),
        DatePre: getValue('field-date-pre') || null,
        DateColl: getValue('field-date-coll') || null,
        DateFin: getValue('field-date-fin') || null,
        ImageUrl: getValue('field-image-url'),
        ImageId: getValue('field-image-id'),
        // Story 5.2 — Ne collecter les champs Google que si le panel est en mode edition
        Sondage: panel && panel.dataset.editId ? getValue('field-sondage') : '',
        LinkSondage: panel && panel.dataset.editId ? getValue('field-link-sondage') : '',
        LinkSheet: panel && panel.dataset.editId ? getValue('field-link-sheet') : '',
        LinkFB: getValue('field-link-fb'),
        Commentaire: getValue('field-commentaire'),
        Categorie: getValue('field-categorie') || CATEGORIE_DEFAULT
    };

    // Champ Recherche (concatenation des champs cles en minuscules)
    billetData.Recherche = [
        billetData.NomBillet,
        billetData.Ville,
        billetData.Reference,
        billetData.Millesime,
        billetData.Dep,
        billetData.Pays,
        billetData.Categorie,
        billetData.Theme,
        billetData.Collecteur
    ].join(' ').toLowerCase();

    return billetData;
}

// ============================================================
// 11. STORY 2.2 — SOUMISSION (AJOUT)
// ============================================================

function saveBillet(billetData) {
    var saveBtn = document.getElementById('panel-save-btn');
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Enregistrement...';
    }

    supabaseFetch('/rest/v1/billets', {
        method: 'POST',
        headers: { 'Prefer': 'return=representation' },
        body: JSON.stringify(billetData)
    })
        .then(function(data) {
            var newBillet = Array.isArray(data) ? data[0] : data;
            showToast('Billet ajoute avec succes', 'success');
            closeBilletPanel();
            loadAdminBillets();
            if (newBillet && newBillet.id) {
                creerAutoInscriptions(newBillet);
            }
        })
        .catch(function(error) {
            showToast('Erreur lors de l\'ajout : ' + error.message, 'error');
            console.error('Erreur ajout billet:', error);
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.textContent = 'Sauvegarder';
            }
        });
}

// ============================================================
// 11b. AUTO-INSCRIPTIONS À LA CRÉATION D'UN BILLET
// ============================================================

function creerAutoInscriptions(billet) {
    var isFrance = !billet.Pays || billet.Pays === 'France';
    var annee = parseInt(billet.Millesime) || new Date().getFullYear();
    var hasNormale = billet.VersionNormaleExiste !== false && billet.VersionNormaleExiste !== 'false';
    var hasVariante = !!billet.HasVariante;

    // Charger les paramétrages pour cette année
    supabaseFetch('/rest/v1/inscriptions_auto?annee=eq.' + annee + '&select=*')
        .then(function(autoData) {
            if (!autoData || autoData.length === 0) return;

            // Filtrer selon type de billet
            var qualifies;
            if (isFrance) {
                qualifies = autoData.filter(function(a) { return a.france; });
            } else {
                qualifies = autoData.filter(function(a) { return a.etranger; });
            }

            if (qualifies.length === 0) return;

            if (isFrance) {
                // Billet FR : on a toutes les infos, créer les inscriptions
                creerAutoInscriptionsBatch(billet, qualifies, [], isFrance, hasNormale, hasVariante);
            } else {
                // Billet étranger : charger les sélections pays pour vérifier la sélection fine
                supabaseFetch('/rest/v1/inscriptions_auto_pays?annee=eq.' + annee + '&select=*')
                    .then(function(paysData) {
                        creerAutoInscriptionsBatch(billet, qualifies, paysData || [], isFrance, hasNormale, hasVariante);
                    })
                    .catch(function(err) {
                        console.warn('Erreur chargement pays auto-inscriptions:', err);
                    });
            }
        })
        .catch(function(err) {
            console.warn('Erreur auto-inscriptions:', err);
        });
}

function creerAutoInscriptionsBatch(billet, qualifies, paysData, isFrance, hasNormale, hasVariante) {
    var inscriptions = [];

    for (var i = 0; i < qualifies.length; i++) {
        var auto = qualifies[i];
        var nbNormaux = 0;
        var nbVariantes = 0;

        if (isFrance) {
            nbNormaux = hasNormale ? auto.nb_normaux_fr : 0;
            nbVariantes = hasVariante ? auto.nb_variantes_fr : 0;
        } else {
            // Vérifier si le membre a des lignes pays spécifiques
            var membrePays = paysData.filter(function(p) {
                return p.membre_email === auto.membre_email && p.annee === auto.annee;
            });

            if (membrePays.length > 0) {
                // Mode sélection fine : chercher le pays spécifique
                var paysMatch = null;
                for (var mp = 0; mp < membrePays.length; mp++) {
                    if (membrePays[mp].pays_nom === billet.Pays) {
                        paysMatch = membrePays[mp];
                        break;
                    }
                }
                if (!paysMatch) continue; // pas de match pour ce pays → pas d'inscription
                nbNormaux = hasNormale ? paysMatch.nb_normaux : 0;
                nbVariantes = hasVariante ? paysMatch.nb_variantes : 0;
            } else {
                // Mode global : tous les pays étrangers
                nbNormaux = hasNormale ? auto.nb_normaux_etr_defaut : 0;
                nbVariantes = hasVariante ? auto.nb_variantes_etr_defaut : 0;
            }
        }

        if (nbNormaux + nbVariantes === 0) continue;

        // Construire adresse_snapshot depuis adminMembresCache
        var adresseSnapshot = {};
        var membreTrouve = false;
        if (adminMembresCache) {
            for (var m = 0; m < adminMembresCache.length; m++) {
                if (adminMembresCache[m].email === auto.membre_email) {
                    var membre = adminMembresCache[m];
                    adresseSnapshot = {
                        nom: membre.nom || '',
                        prenom: membre.prenom || '',
                        rue: membre.rue || '',
                        code_postal: membre.code_postal || '',
                        ville: membre.ville || '',
                        pays: membre.pays || ''
                    };
                    membreTrouve = true;
                    break;
                }
            }
        }
        if (!membreTrouve) {
            console.warn('Auto-inscription: membre non trouvé dans le cache pour ' + auto.membre_email + ', adresse_snapshot vide');
        }

        inscriptions.push({
            billet_id: billet.id,
            membre_email: auto.membre_email,
            nb_normaux: nbNormaux,
            nb_variantes: nbVariantes,
            mode_paiement: auto.mode_paiement,
            mode_envoi: auto.mode_envoi,
            commentaire: '',
            adresse_snapshot: adresseSnapshot,
            statut_paiement: 'non_paye',
            envoye: false,
            fdp_regles: false,
            pas_interesse: false,
            changed_by: 'pré-inscription'
        });
    }

    if (inscriptions.length === 0) return;

    // POST batch (Supabase accepte un array)
    supabaseFetch('/rest/v1/inscriptions?on_conflict=billet_id,membre_email', {
        method: 'POST',
        body: JSON.stringify(inscriptions),
        headers: { 'Prefer': 'return=minimal, resolution=ignore-duplicates' }
    })
    .then(function() {
        showToast(inscriptions.length + ' membre(s) pré-inscrit(s) automatiquement', 'info');
    })
    .catch(function(err) {
        console.warn('Erreur batch auto-inscriptions:', err);
    });
}

// ============================================================
// 12. STORY 2.3 — MODIFICATION (UPDATE)
// ============================================================

function updateBillet(docId, billetData, forcedTypeChange) {
    var saveBtn = document.getElementById('panel-save-btn');
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Enregistrement...';
    }

    supabaseFetch('/rest/v1/billets?id=eq.' + encodeURIComponent(docId), {
        method: 'PATCH',
        body: JSON.stringify(billetData)
    })
        .then(function() {
            showToast('Billet modifie avec succes', 'success');
            updateCardInList(docId, billetData);
            if (forcedTypeChange) {
                reconcilierTypeChangement(docId, billetData, forcedTypeChange);
            }
            closeBilletPanel();
        })
        .catch(function(error) {
            showToast('Erreur lors de la modification : ' + error.message, 'error');
            console.error('Erreur modification billet:', error);
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.textContent = 'Enregistrer les modifications';
            }
        });
}

// ============================================================
// 12b. RÉCONCILIATION DU TYPE APRÈS CHANGEMENT FORCÉ
// ============================================================

function reconcilierTypeChangement(billetId, billet, typeChange) {
    var promesses = [];

    // Supprimer / zéro-iser les inscriptions normales
    if (typeChange.supprimeNormale) {
        promesses.push(
            supabaseFetch('/rest/v1/inscriptions?billet_id=eq.' + billetId + '&nb_normaux=gt.0&select=id,nb_variantes')
                .then(function(inscs) {
                    if (!inscs || inscs.length === 0) return;
                    var toDelete = inscs.filter(function(i) { return i.nb_variantes === 0; });
                    var toUpdate = inscs.filter(function(i) { return i.nb_variantes > 0; });
                    var p = [];
                    if (toDelete.length > 0) {
                        var ids = toDelete.map(function(i) { return i.id; }).join(',');
                        p.push(supabaseFetch('/rest/v1/inscriptions?id=in.(' + ids + ')', { method: 'DELETE' }));
                    }
                    if (toUpdate.length > 0) {
                        var ids2 = toUpdate.map(function(i) { return i.id; }).join(',');
                        p.push(supabaseFetch('/rest/v1/inscriptions?id=in.(' + ids2 + ')', {
                            method: 'PATCH',
                            body: JSON.stringify({ nb_normaux: 0 })
                        }));
                    }
                    return Promise.all(p);
                })
        );
    }

    // Supprimer / zéro-iser les inscriptions variante
    if (typeChange.supprimeVariante) {
        promesses.push(
            supabaseFetch('/rest/v1/inscriptions?billet_id=eq.' + billetId + '&nb_variantes=gt.0&select=id,nb_normaux')
                .then(function(inscs) {
                    if (!inscs || inscs.length === 0) return;
                    var toDelete = inscs.filter(function(i) { return i.nb_normaux === 0; });
                    var toUpdate = inscs.filter(function(i) { return i.nb_normaux > 0; });
                    var p = [];
                    if (toDelete.length > 0) {
                        var ids = toDelete.map(function(i) { return i.id; }).join(',');
                        p.push(supabaseFetch('/rest/v1/inscriptions?id=in.(' + ids + ')', { method: 'DELETE' }));
                    }
                    if (toUpdate.length > 0) {
                        var ids2 = toUpdate.map(function(i) { return i.id; }).join(',');
                        p.push(supabaseFetch('/rest/v1/inscriptions?id=in.(' + ids2 + ')', {
                            method: 'PATCH',
                            body: JSON.stringify({ nb_variantes: 0 })
                        }));
                    }
                    return Promise.all(p);
                })
        );
    }

    Promise.all(promesses)
        .then(function() {
            if (typeChange.ajouteNormale || typeChange.ajouteVariante) {
                // Recalculer les pré-inscriptions avec le nouveau type (merge sur l'existant)
                billet.id = billet.id || billetId;
                recalculerAutoInscriptions(billet);
            } else if (typeChange.supprimeNormale || typeChange.supprimeVariante) {
                showToast('Inscriptions mises à jour après changement de type', 'info');
                loadAdminInscriptionCounts().then(function() {
                    if (String(adminCurrentBilletId) === String(billetId)) openInscriptionsModal(adminCurrentBilletId);
                });
            }
        })
        .catch(function(err) {
            showToast('Erreur lors de la mise à jour des inscriptions : ' + (err.message || err), 'error');
            console.error('Erreur réconciliation type:', err);
        });
}

// Recalcule les quantités des inscriptions existantes d'après les pré-inscriptions auto
// Utilise merge-duplicates pour mettre à jour nb_normaux/nb_variantes sans toucher les autres champs
function recalculerAutoInscriptions(billet) {
    adminRecalculEnCoursBilletId = String(billet.id);
    var isFrance = !billet.Pays || billet.Pays === 'France';
    var annee = parseInt(billet.Millesime) || new Date().getFullYear();
    var hasNormale = billet.VersionNormaleExiste !== false && billet.VersionNormaleExiste !== 'false';
    var hasVariante = !!(billet.HasVariante && billet.HasVariante !== 'N');

    supabaseFetch('/rest/v1/inscriptions_auto?annee=eq.' + annee + '&select=*')
        .then(function(autoData) {
            if (!autoData || autoData.length === 0) return;
            var qualifies = autoData.filter(function(a) { return isFrance ? a.france : a.etranger; });
            if (qualifies.length === 0) return;

            if (isFrance) {
                recalculerAutoInscriptionsBatch(billet, qualifies, [], isFrance, hasNormale, hasVariante);
            } else {
                supabaseFetch('/rest/v1/inscriptions_auto_pays?annee=eq.' + annee + '&select=*')
                    .then(function(paysData) {
                        recalculerAutoInscriptionsBatch(billet, qualifies, paysData || [], isFrance, hasNormale, hasVariante);
                    })
                    .catch(function(err) { console.warn('Erreur paysData recalcul:', err); });
            }
        })
        .catch(function(err) { console.warn('Erreur recalculerAutoInscriptions:', err); });
}

function recalculerAutoInscriptionsBatch(billet, qualifies, paysData, isFrance, hasNormale, hasVariante) {
    var updates = [];

    for (var i = 0; i < qualifies.length; i++) {
        var auto = qualifies[i];
        var nbNormaux = 0;
        var nbVariantes = 0;

        if (isFrance) {
            nbNormaux = hasNormale ? auto.nb_normaux_fr : 0;
            nbVariantes = hasVariante ? auto.nb_variantes_fr : 0;
        } else {
            var membrePays = paysData.filter(function(p) {
                return p.membre_email === auto.membre_email && p.annee === auto.annee;
            });
            if (membrePays.length > 0) {
                var paysMatch = null;
                for (var mp = 0; mp < membrePays.length; mp++) {
                    if (membrePays[mp].pays_nom === billet.Pays) { paysMatch = membrePays[mp]; break; }
                }
                if (!paysMatch) continue;
                nbNormaux = hasNormale ? paysMatch.nb_normaux : 0;
                nbVariantes = hasVariante ? paysMatch.nb_variantes : 0;
            } else {
                nbNormaux = hasNormale ? auto.nb_normaux_etr_defaut : 0;
                nbVariantes = hasVariante ? auto.nb_variantes_etr_defaut : 0;
            }
        }

        updates.push({
            billet_id: billet.id,
            membre_email: auto.membre_email,
            nb_normaux: nbNormaux,
            nb_variantes: nbVariantes
        });
    }

    if (updates.length === 0) return;

    supabaseFetch('/rest/v1/inscriptions?on_conflict=billet_id,membre_email', {
        method: 'POST',
        body: JSON.stringify(updates),
        headers: { 'Prefer': 'return=minimal, resolution=merge-duplicates' }
    })
    .then(function() {
        adminRecalculEnCoursBilletId = null;
        showToast('Quantités recalculées d\'après les pré-inscriptions', 'info');
        loadAdminInscriptionCounts().then(function() {
            if (String(adminCurrentBilletId) === String(billet.id)) openInscriptionsModal(adminCurrentBilletId);
        });
    })
    .catch(function(err) {
        adminRecalculEnCoursBilletId = null;
        console.warn('Erreur recalculerAutoInscriptionsBatch:', err);
    });
}

// Story 2.3 — Rafraichir la carte dans le DOM apres modification
function updateCardInList(docId, billetData) {
    var card = document.querySelector('[data-doc-id="' + docId + '"]');
    if (!card) return;

    // Mise a jour des elements textuels
    var titleEl = card.querySelector('.admin-card-title');
    if (titleEl) titleEl.textContent = billetData.NomBillet || 'Sans nom';

    var metaEl = card.querySelector('.admin-card-meta');
    if (metaEl) {
        var villeSpan = metaEl.querySelector('span:first-child');
        if (villeSpan) villeSpan.textContent = billetData.Ville || '';
        var refSpan = metaEl.querySelector('.admin-card-ref');
        if (refSpan) {
            refSpan.textContent = (billetData.Reference || '') +
                (billetData.Millesime ? ' - ' + billetData.Millesime + (billetData.Version ? '-' + billetData.Version : '') : '');
        }
    }

    // Mise a jour du badge de statut
    var badge = card.querySelector('.admin-badge-status');
    if (badge) {
        var statut = billetData.Categorie || '';
        var statusLabel = statut || 'Non defini';
        var color = getStatusColor(statut);
        badge.textContent = statusLabel;
        badge.setAttribute('data-current-status', statut);
        badge.style.backgroundColor = color;
        badge.style.color = getTextColorForBg(color);
    }

    // Mise a jour du badge inscriptions (libellé variante peut avoir changé)
    var inscBadge = card.querySelector('.admin-card-inscriptions-badge');
    if (inscBadge) {
        var idata = adminInscriptionCounts[docId] || { count: 0, normaux: 0, variantes: 0 };
        var icount = idata.count;
        var idetail = '';
        if (icount > 0) {
            var iparts = [];
            if (idata.normaux > 0) iparts.push(idata.normaux + ' billet' + (idata.normaux > 1 ? 's' : '') + ' normaux');
            if (idata.variantes > 0) {
                var varLabel = billetData.HasVariante || 'variante';
                if (varLabel === 'anniversary') varLabel = 'anniv';
                else if (varLabel === 'doré') varLabel = 'dorés';
                iparts.push(idata.variantes + ' billet' + (idata.variantes > 1 ? 's' : '') + ' ' + varLabel);
            }
            if (iparts.length > 0) idetail = ' (' + iparts.join(', ') + ')';
        }
        inscBadge.innerHTML = '<i class="fa-solid fa-users"></i> ' + icount + ' inscription' + (icount !== 1 ? 's' : '') + idetail;
    }

    // Mise a jour du bouton supprimer (nom du billet)
    var deleteBtn = card.querySelector('.admin-card-delete-btn');
    if (deleteBtn) {
        deleteBtn.setAttribute('data-billet-name', billetData.NomBillet || '');
    }

    // Mise a jour du popup de statut rapide
    var popup = document.getElementById('quick-status-popup-' + docId);
    if (popup) {
        var chipsContainer = popup.querySelector('.quick-status-chips');
        if (chipsContainer) {
            chipsContainer.innerHTML = buildStatusChipsHtml(docId, billetData.Categorie || '');
        }
    }

    // Mise a jour des donnees en memoire
    for (var i = 0; i < adminBillets.length; i++) {
        if (String(adminBillets[i]._id) === String(docId)) {
            for (var key in billetData) {
                adminBillets[i][key] = billetData[key];
            }
            break;
        }
    }

    // Story 2.1b — Recalculer les compteurs
    renderStatusCounters();
}

// ============================================================
// 13. STORY 2.4 — MODALE DE SUPPRESSION
// ============================================================

function openDeleteModal(docId, nomBillet) {
    var overlay = document.getElementById('delete-modal-overlay');
    var billetNameEl = document.getElementById('delete-modal-billet-name');
    var confirmInput = document.getElementById('delete-confirm-input');
    var confirmBtn = document.getElementById('delete-confirm-btn');
    if (!overlay || !billetNameEl || !confirmInput || !confirmBtn) return;

    deleteTargetDocId = docId;
    deleteTargetName = nomBillet;

    billetNameEl.textContent = nomBillet;
    confirmInput.value = '';
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Confirmer la suppression';

    overlay.style.display = 'flex';

    // Focus sur l'input apres ouverture
    setTimeout(function() { confirmInput.focus(); }, 100);

    // Ecouteurs
    confirmInput.addEventListener('input', onDeleteInputChange);
    document.addEventListener('keydown', onDeleteModalKeydown);
    overlay.addEventListener('click', onDeleteOverlayClick);
}

function closeDeleteModal() {
    var overlay = document.getElementById('delete-modal-overlay');
    var confirmInput = document.getElementById('delete-confirm-input');
    if (!overlay) return;

    overlay.style.display = 'none';
    deleteTargetDocId = null;
    deleteTargetName = '';

    if (confirmInput) {
        confirmInput.value = '';
        confirmInput.removeEventListener('input', onDeleteInputChange);
    }
    document.removeEventListener('keydown', onDeleteModalKeydown);
    overlay.removeEventListener('click', onDeleteOverlayClick);
}

function onDeleteInputChange(e) {
    var confirmBtn = document.getElementById('delete-confirm-btn');
    if (!confirmBtn) return;
    var typed = e.target.value.trim();
    confirmBtn.disabled = (typed !== deleteTargetName);
}

function onDeleteModalKeydown(e) {
    if (e.key === 'Escape') {
        closeDeleteModal();
        return;
    }
    // Focus trap dans la modale
    if (e.key === 'Tab') {
        var modal = document.getElementById('delete-modal');
        if (!modal) return;
        var focusable = modal.querySelectorAll('input, button:not(:disabled)');
        if (focusable.length === 0) return;
        var first = focusable[0];
        var last = focusable[focusable.length - 1];
        if (e.shiftKey) {
            if (document.activeElement === first) {
                e.preventDefault();
                last.focus();
            }
        } else {
            if (document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        }
    }
}

function onDeleteOverlayClick(e) {
    if (e.target.id === 'delete-modal-overlay') {
        closeDeleteModal();
    }
}

function confirmDelete() {
    if (!deleteTargetDocId) return;

    var docId = deleteTargetDocId;
    var confirmBtn = document.getElementById('delete-confirm-btn');
    if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Suppression...';
    }

    supabaseFetch('/rest/v1/billets?id=eq.' + encodeURIComponent(docId), {
        method: 'DELETE'
    })
        .then(function() {
            showToast('Billet supprime avec succes', 'success');
            closeDeleteModal();
            // Retirer du tableau en memoire
            adminBillets = adminBillets.filter(function(b) {
                return String(b._id) !== String(docId);
            });
            // Story 2.1b — Recalculer compteurs et filtres
            renderStatusCounters();
            adminApplyFilters();
        })
        .catch(function(error) {
            console.error('Erreur suppression billet:', error);
            showToast('Erreur lors de la suppression : ' + error.message, 'error');
            if (confirmBtn) {
                confirmBtn.disabled = false;
                confirmBtn.textContent = 'Confirmer la suppression';
            }
        });
}

// ============================================================
// 14. STORY 2.5 — CHANGEMENT DE STATUT RAPIDE
// ============================================================

function handleBadgeClick(badge) {
    var docId = badge.getAttribute('data-doc-id');
    if (!docId) return;

    // Fermer tout popup deja ouvert
    closeAllStatusPopups();

    var popup = document.getElementById('quick-status-popup-' + docId);
    if (!popup) return;

    popup.style.display = 'block';

    // Elever le z-index de la carte pour eviter la superposition
    var card = badge.closest('.admin-card-billet');
    if (card) card.classList.add('popup-open');

    // Mettre a jour les chips actifs
    var currentStatus = badge.getAttribute('data-current-status');
    highlightActiveAndNextChip(popup, currentStatus);
}

function closeAllStatusPopups() {
    var popups = document.querySelectorAll('.quick-status-popup');
    popups.forEach(function(popup) {
        popup.style.display = 'none';
    });
    // Retirer le z-index eleve de toutes les cartes
    var cards = document.querySelectorAll('.admin-card-billet.popup-open');
    cards.forEach(function(card) {
        card.classList.remove('popup-open');
    });
}

function highlightActiveAndNextChip(popup, currentStatus) {
    if (!popup) return;
    var chips = popup.querySelectorAll('.status-chip');
    var currentIndex = CATEGORIES.indexOf(currentStatus);

    chips.forEach(function(chip, index) {
        chip.classList.remove('status-chip--active', 'status-chip--next');
        chip.setAttribute('aria-pressed', 'false');
        if (chip.getAttribute('data-status') === currentStatus) {
            chip.classList.add('status-chip--active');
            chip.setAttribute('aria-pressed', 'true');
        }
        if (currentIndex >= 0 && index === currentIndex + 1) {
            chip.classList.add('status-chip--next');
        }
    });
}

function handleQuickStatusChange(chip) {
    var newStatus = chip.getAttribute('data-status');
    var docId = chip.getAttribute('data-doc-id');
    if (!newStatus || !docId) return;

    // Ne rien faire si on clique sur le statut actif
    var badge = document.querySelector('.admin-badge-status[data-doc-id="' + docId + '"]');
    if (!badge) return;
    var previousStatus = badge.getAttribute('data-current-status');
    if (previousStatus === newStatus) return;

    // --- Validation collecteur et prix pour passage en Collecte ---
    var billetData = null;
    for (var k = 0; k < adminBillets.length; k++) {
        if (String(adminBillets[k]._id) === String(docId)) { billetData = adminBillets[k]; break; }
    }
    if (newStatus === 'Collecte' && billetData) {
        var missing = [];
        if (!billetData.Collecteur) missing.push('Collecteur');
        if (!billetData.Prix || parseFloat(billetData.Prix) <= 0) missing.push('Prix');
        if (missing.length > 0) {
            showCollecteQuickForm(docId, billetData);
            return;
        }
    }
    var existingDates = {
        DatePre: billetData ? billetData.DatePre : null,
        DateColl: billetData ? billetData.DateColl : null,
        DateFin: billetData ? billetData.DateFin : null
    };
    var dateUpdates = getDateUpdatesForStatusChange(previousStatus, newStatus, existingDates);
    var patchBody = Object.assign({ Categorie: newStatus }, dateUpdates);

    // --- Mise a jour optimiste (UI d'abord) ---
    updateBadgeUI(badge, newStatus);
    closeAllStatusPopups();

    // --- Mise a jour Supabase ---
    supabaseFetch('/rest/v1/billets?id=eq.' + encodeURIComponent(docId), {
        method: 'PATCH',
        body: JSON.stringify(patchBody)
    })
        .then(function() {
            // Succes : mettre a jour les donnees en memoire
            updateInMemoryStatus(docId, newStatus);
            // Story 9.3 — Mettre à jour les dates en mémoire
            if (billetData) {
                for (var dateKey in dateUpdates) {
                    billetData[dateKey] = dateUpdates[dateKey];
                }
            }

            // Mettre a jour le popup de statut rapide
            var popup = document.getElementById('quick-status-popup-' + docId);
            if (popup) {
                var chipsContainer = popup.querySelector('.quick-status-chips');
                if (chipsContainer) {
                    chipsContainer.innerHTML = buildStatusChipsHtml(docId, newStatus);
                }
            }

            // Story 2.1b — Recalculer les compteurs
            renderStatusCounters();

            showToast('Statut mis a jour : ' + newStatus, 'success');
        })
        .catch(function(error) {
            // Echec : rollback du badge a l'etat precedent
            console.error('Erreur changement statut:', error);
            updateBadgeUI(badge, previousStatus);
            showToast('Erreur : ' + error.message, 'error');
        });
}

function updateBadgeUI(badge, status) {
    if (!badge) return;
    badge.setAttribute('data-current-status', status);
    badge.textContent = status || 'Non defini';
    var color = getStatusColor(status);
    badge.style.backgroundColor = color;
    badge.style.color = getTextColorForBg(color);
}

function updateInMemoryStatus(docId, newStatus) {
    for (var i = 0; i < adminBillets.length; i++) {
        if (String(adminBillets[i]._id) === String(docId)) {
            adminBillets[i].Categorie = newStatus;
            break;
        }
    }
}

// ============================================================
// 14b. MINI-FORMULAIRE COLLECTE RAPIDE
// ============================================================

function showCollecteQuickForm(docId, billetData) {
    var popup = document.getElementById('quick-status-popup-' + docId);
    if (!popup) return;

    var existingCollecteur = billetData.Collecteur || '';
    var existingPrix = billetData.Prix || '';
    var existingPrixVariante = billetData.PrixVariante || '';
    var versionNormaleExiste = billetData.VersionNormaleExiste !== false;
    var varianteVal = billetData.HasVariante || '';
    var varianteActive = varianteVal && varianteVal !== 'N';

    // Construire les options du select collecteur
    var collecteurOptions = '<option value="">— Collecteur —</option>';
    collecteursList.forEach(function(coll) {
        var selected = coll.alias === existingCollecteur ? ' selected' : '';
        collecteurOptions += '<option value="' + escapeAttr(coll.alias) + '"' + selected + '>' + escapeHtml(coll.alias) + '</option>';
    });

    // Champ prix normal (masqué si pas de version normale)
    var prixNormalHtml = versionNormaleExiste
        ? '<div class="quick-collecte-form__field">' +
              '<label for="quick-prix-' + docId + '">Prix normal * (€)</label>' +
              '<input type="number" id="quick-prix-' + docId + '" class="quick-collecte-form__input" step="0.01" min="0" placeholder="2.00" value="' + escapeAttr(String(existingPrix)) + '">' +
          '</div>'
        : '';

    // Champ prix variante (affiché si variante active)
    var prixVarianteHtml = varianteActive
        ? '<div class="quick-collecte-form__field">' +
              '<label for="quick-prix-variante-' + docId + '">Prix ' + escapeHtml(varianteVal) + ' * (€)</label>' +
              '<input type="number" id="quick-prix-variante-' + docId + '" class="quick-collecte-form__input" step="0.01" min="0" placeholder="2.00" value="' + escapeAttr(String(existingPrixVariante)) + '">' +
          '</div>'
        : '';

    var formHtml =
        '<div class="quick-collecte-form" id="quick-collecte-form-' + docId + '">' +
            '<p class="quick-collecte-form__title">Infos requises pour passer en Collecte</p>' +
            '<div class="quick-collecte-form__field">' +
                '<label for="quick-collecteur-' + docId + '">Collecteur *</label>' +
                '<select id="quick-collecteur-' + docId + '" class="quick-collecte-form__select">' +
                    collecteurOptions +
                '</select>' +
            '</div>' +
            prixNormalHtml +
            prixVarianteHtml +
            '<div class="quick-collecte-form__field quick-collecte-form__field--checkbox">' +
                '<label class="quick-collecte-form__checkbox-label"><input type="checkbox" id="quick-payer-fdp-' + docId + '"> Payer les frais de port</label>' +
            '</div>' +
            '<div class="quick-collecte-form__actions">' +
                '<button type="button" class="quick-collecte-form__btn quick-collecte-form__btn--cancel" onclick="cancelQuickCollecte(\'' + escapeAttr(String(docId)) + '\')">Annuler</button>' +
                '<button type="button" class="quick-collecte-form__btn quick-collecte-form__btn--confirm" onclick="confirmQuickCollecte(\'' + escapeAttr(String(docId)) + '\')">Valider</button>' +
            '</div>' +
        '</div>';

    // Masquer les chips et afficher le formulaire
    var chipsContainer = popup.querySelector('.quick-status-chips');
    if (chipsContainer) chipsContainer.style.display = 'none';

    // Supprimer un formulaire précédent s'il existe
    var oldForm = popup.querySelector('.quick-collecte-form');
    if (oldForm) oldForm.remove();

    popup.insertAdjacentHTML('beforeend', formHtml);
}

function cancelQuickCollecte(docId) {
    var popup = document.getElementById('quick-status-popup-' + docId);
    if (!popup) return;

    var form = popup.querySelector('.quick-collecte-form');
    if (form) form.remove();

    var chipsContainer = popup.querySelector('.quick-status-chips');
    if (chipsContainer) chipsContainer.style.display = '';

    closeAllStatusPopups();
}

function confirmQuickCollecte(docId) {
    var collecteurSelect = document.getElementById('quick-collecteur-' + docId);
    var prixInput = document.getElementById('quick-prix-' + docId);
    var prixVarianteInput = document.getElementById('quick-prix-variante-' + docId);
    var payerFdpCheckbox = document.getElementById('quick-payer-fdp-' + docId);
    if (!collecteurSelect) return;

    var collecteur = collecteurSelect.value;
    var prix = prixInput ? prixInput.value : '';
    var prixVariante = prixVarianteInput ? prixVarianteInput.value : '';
    var payerFDP = payerFdpCheckbox && payerFdpCheckbox.checked ? 'oui' : '';

    // Validation
    var errors = [];
    if (!collecteur) errors.push('Collecteur');
    if (prixInput && (!prix || parseFloat(prix) <= 0)) errors.push('Prix normal');
    if (prixVarianteInput && (!prixVariante || parseFloat(prixVariante) <= 0)) errors.push('Prix variante');
    if (errors.length > 0) {
        showToast('Veuillez renseigner : ' + errors.join(' et '), 'error');
        return;
    }

    // Trouver les données du billet
    var billetData = null;
    for (var k = 0; k < adminBillets.length; k++) {
        if (String(adminBillets[k]._id) === String(docId)) { billetData = adminBillets[k]; break; }
    }

    var badge = document.querySelector('.admin-badge-status[data-doc-id="' + docId + '"]');
    if (!badge) return;
    var previousStatus = badge.getAttribute('data-current-status');
    var newStatus = 'Collecte';

    var existingDates = {
        DatePre: billetData ? billetData.DatePre : null,
        DateColl: billetData ? billetData.DateColl : null,
        DateFin: billetData ? billetData.DateFin : null
    };
    var dateUpdates = getDateUpdatesForStatusChange(previousStatus, newStatus, existingDates);
    var patchBody = Object.assign({ Categorie: newStatus, Collecteur: collecteur, PayerFDP: payerFDP }, dateUpdates);
    if (prixInput) patchBody.Prix = parseFloat(prix);
    if (prixVarianteInput) patchBody.PrixVariante = parseFloat(prixVariante);

    // Mise à jour optimiste
    updateBadgeUI(badge, newStatus);
    closeAllStatusPopups();

    supabaseFetch('/rest/v1/billets?id=eq.' + encodeURIComponent(docId), {
        method: 'PATCH',
        body: JSON.stringify(patchBody)
    })
        .then(function() {
            updateInMemoryStatus(docId, newStatus);
            if (billetData) {
                billetData.Collecteur = collecteur;
                billetData.PayerFDP = payerFDP;
                if (prixInput) billetData.Prix = parseFloat(prix);
                if (prixVarianteInput) billetData.PrixVariante = parseFloat(prixVariante);
                for (var dateKey in dateUpdates) {
                    billetData[dateKey] = dateUpdates[dateKey];
                }
            }

            var popup = document.getElementById('quick-status-popup-' + docId);
            if (popup) {
                var form = popup.querySelector('.quick-collecte-form');
                if (form) form.remove();
                var chipsContainer = popup.querySelector('.quick-status-chips');
                if (chipsContainer) {
                    chipsContainer.style.display = '';
                    chipsContainer.innerHTML = buildStatusChipsHtml(docId, newStatus);
                }
            }

            renderStatusCounters();
            var toastPrix = prix ? prix + '€' : '';
            if (prixVariante) toastPrix += (toastPrix ? ' / Variante: ' : '') + prixVariante + '€';
            showToast('Statut mis a jour : ' + newStatus + ' (Collecteur: ' + collecteur + (toastPrix ? ', Prix: ' + toastPrix : '') + ')', 'success');

            // Supprimer les inscriptions des membres blacklistés par ce collecteur
            nettoyerInscriptionsBlacklist(collecteur, docId);
        })
        .catch(function(error) {
            console.error('Erreur changement statut:', error);
            updateBadgeUI(badge, previousStatus);
            showToast('Erreur : ' + error.message, 'error');
        });
}

// Supprime les inscriptions de membres blacklistés quand un collecteur est assigné
function nettoyerInscriptionsBlacklist(collecteurAlias, billetId) {
    // Charger la blacklist du collecteur
    supabaseFetch('/rest/v1/collecteur_blacklist?collecteur_alias=eq.' + encodeURIComponent(collecteurAlias) + '&select=membre_email')
        .then(function(blacklist) {
            if (!blacklist || blacklist.length === 0) return;
            var emails = blacklist.map(function(e) { return e.membre_email; });
            // Supprimer les inscriptions blacklistées sur ce billet
            var emailsFilter = 'membre_email=in.(' + emails.map(function(e) { return '"' + e + '"'; }).join(',') + ')';
            return supabaseFetch('/rest/v1/inscriptions?billet_id=eq.' + billetId + '&' + emailsFilter, {
                method: 'DELETE'
            });
        })
        .catch(function(error) {
            console.warn('Erreur nettoyage blacklist inscriptions:', error);
        });
}

// ============================================================
// 15. STORY 2.1b — COMPTEURS DE STATUT
// ============================================================

function renderStatusCounters() {
    var container = document.getElementById('admin-status-counters');
    if (!container) return;

    // Compter par statut depuis le tableau complet (pas les filtres)
    var counts = {};
    var total = adminBillets.length;
    adminBillets.forEach(function(billet) {
        var statut = billet.Categorie || 'Non defini';
        counts[statut] = (counts[statut] || 0) + 1;
    });

    // Ordre des statuts
    var statutOrder = CATEGORIES.slice();
    // Ajouter les statuts non prevus
    Object.keys(counts).forEach(function(s) {
        if (statutOrder.indexOf(s) === -1) statutOrder.push(s);
    });

    var html = '<button class="admin-status-counter' +
        (adminActiveStatusFilter === 'tous' ? ' admin-status-counter--active' : '') +
        '" data-status="tous" onclick="adminFilterByStatus(\'tous\')" aria-pressed="' +
        (adminActiveStatusFilter === 'tous' ? 'true' : 'false') + '">' +
        '<span class="admin-status-counter__count">' + total + '</span>' +
        '<span class="admin-status-counter__label">Tous</span></button>';

    statutOrder.forEach(function(statut) {
        if (!counts[statut]) return;
        var isActive = adminActiveStatusFilter === statut;
        var color = getStatusColor(statut);
        html += '<button class="admin-status-counter' +
            (isActive ? ' admin-status-counter--active' : '') +
            '" data-status="' + escapeAttr(statut) + '" onclick="adminFilterByStatus(\'' +
            escapeAttr(statut) + '\')" aria-pressed="' +
            (isActive ? 'true' : 'false') +
            '" style="border-left-color: ' + color + ';">' +
            '<span class="admin-status-counter__count">' + counts[statut] + '</span>' +
            '<span class="admin-status-counter__label">' + escapeHtml(statut) + '</span></button>';
    });

    container.innerHTML = html;
}

// ============================================================
// 16. STORY 2.1b — FILTRAGE PAR STATUT
// ============================================================

function adminFilterByStatus(statut) {
    adminActiveStatusFilter = statut;
    currentPage = 1;
    renderStatusCounters();
    adminApplyFilters();
}

// ============================================================
// 17. STORY 2.1b — FILTRAGE COMBINE (recherche + statut + en cours)
// ============================================================

function adminApplyFilters() {
    var searchInput = document.getElementById('admin-search-input');
    var clearBtn = document.getElementById('admin-search-clear');
    if (!searchInput) return;

    var searchText = searchInput.value.toLowerCase().trim();

    // Afficher/masquer le bouton clear
    if (clearBtn) {
        if (searchText.length > 0) {
            clearBtn.classList.remove('hidden');
        } else {
            clearBtn.classList.add('hidden');
        }
    }

    adminFilteredBillets = adminBillets.filter(function(billet) {
        // Filtre statut
        if (adminActiveStatusFilter !== 'tous') {
            var billetStatut = billet.Categorie || 'Non defini';
            if (billetStatut !== adminActiveStatusFilter) {
                return false;
            }
        }

        // Filtre "En cours" (masquer les termines)
        if (adminFilterEnCours && billet.Categorie === 'Terminé') {
            return false;
        }

        // Recherche textuelle
        if (searchText) {
            var fields = [
                billet.NomBillet, billet.Ville, billet.Reference,
                billet.Millesime, billet.Collecteur, billet.Dep,
                billet.Cp, billet.Pays, billet.Categorie,
                billet.Theme, billet.Commentaire
            ];
            var match = fields.some(function(val) {
                return val && String(val).toLowerCase().indexOf(searchText) !== -1;
            });
            if (!match) return false;
        }

        return true;
    });

    renderAdminCards();
}

// ============================================================
// 18. STORY 2.1b — FONCTIONS UTILITAIRES DE RECHERCHE
// ============================================================

function adminClearSearch() {
    var input = document.getElementById('admin-search-input');
    if (input) input.value = '';
    currentPage = 1;
    adminApplyFilters();
}

function adminToggleEnCours() {
    adminFilterEnCours = !adminFilterEnCours;
    var btn = document.getElementById('admin-filter-en-cours');
    if (btn) {
        btn.setAttribute('aria-pressed', adminFilterEnCours ? 'true' : 'false');
        if (adminFilterEnCours) {
            btn.classList.add('admin-filter-toggle--active');
        } else {
            btn.classList.remove('admin-filter-toggle--active');
        }
    }
    currentPage = 1;
    adminApplyFilters();
}

function adminResetFilters() {
    // Reset recherche
    var input = document.getElementById('admin-search-input');
    if (input) input.value = '';

    // Reset statut
    adminActiveStatusFilter = 'tous';

    // Reset "En cours"
    adminFilterEnCours = false;
    var btn = document.getElementById('admin-filter-en-cours');
    if (btn) {
        btn.setAttribute('aria-pressed', 'false');
        btn.classList.remove('admin-filter-toggle--active');
    }

    currentPage = 1;
    renderStatusCounters();
    adminApplyFilters();
}

// ============================================================
// 19. COMPATIBILITE — Ancien handler
// ============================================================
// Garde pour compatibilite si le onclick="handleAddBillet()" existe encore dans le HTML
function handleAddBillet() {
    openBilletPanel();
}

// ============================================================
// 20. STORY 5.2 — CHAMPS GOOGLE & GEL COLLECTEUR
// ============================================================

/**
 * Vérifie si des inscriptions existent pour un billet donné (Story 5.4).
 * @param {string|number} billetId - L'ID du billet
 * @returns {Promise} Résout avec un booléen
 */
function hasInscriptions(billetId) {
    return supabaseFetch('/rest/v1/inscriptions?billet_id=eq.' + billetId + '&pas_interesse=eq.false&select=id&limit=1')
        .then(function(data) { return data && data.length > 0; })
        .catch(function(error) {
            console.warn('Erreur vérification inscriptions:', error);
            return false;
        });
}

// Reset des champs Google (retirer readonly, badges, afficher)
function resetGoogleFields() {
    document.querySelectorAll('[data-google-field="true"]').forEach(function(group) {
        group.style.display = '';
        var input = group.querySelector('input');
        if (input) {
            input.removeAttribute('readonly');
            input.classList.remove('admin-field-readonly');
        }
        var badge = group.querySelector('.badge-ancien-systeme');
        if (badge) badge.remove();
    });
}

// Reset du gel collecteur
function resetCollecteurFreeze() {
    var collecteurSelect = document.getElementById('field-collecteur');
    if (collecteurSelect) {
        collecteurSelect.disabled = false;
        collecteurSelect.classList.remove('admin-field-frozen');
        var hint = collecteurSelect.parentNode.querySelector('.collecteur-frozen-hint');
        if (hint) hint.remove();
    }
    // Reset gel des champs type de billet
    var cbNormale = document.getElementById('field-version-normale');
    if (cbNormale) {
        cbNormale.disabled = false;
        cbNormale.classList.remove('admin-field-frozen');
    }
    var hasVarianteEl = document.getElementById('field-has-variante');
    if (hasVarianteEl) {
        hasVarianteEl.disabled = false;
        hasVarianteEl.classList.remove('admin-field-frozen');
    }
    // Retirer le message d'avertissement type
    var typeHints = document.querySelectorAll('.type-frozen-hint');
    typeHints.forEach(function(h) { h.remove(); });
}

// ============================================================
// FEAT-1 : MODALE PARTAGE (bouton Facebook/copie)
// ============================================================

function openShareModal(billetId) {
    var billet = adminBillets.find(function(b) { return b._id === billetId; });
    if (!billet) return;

    var textTopEl = document.getElementById('share-modal-text-top');
    var textBottomEl = document.getElementById('share-modal-text-bottom');
    var imgEl = document.getElementById('share-modal-image');
    var shareOverlay = document.getElementById('share-modal-overlay');
    var btn = document.getElementById('share-copy-btn');
    if (!textTopEl || !textBottomEl || !shareOverlay || !btn) return;

    var pays = billet.Pays || '';
    var ref = (billet.Reference || '') + ' ' + (billet.Millesime || 'XXXX') + '-' + (billet.Version || 'X');
    var nom = billet.NomBillet || '';
    var statut = billet.Categorie || '';

    // Partie haute : titre + statut + prix
    var topLines = [];
    topLines.push('🎫 ' + pays + ' - ' + ref + ' - ' + nom);

    var statutLine = '📌 Statut : ' + statut;
    if (statut === 'Collecte' && billet.Collecteur) {
        statutLine += ' | Collecteur : ' + billet.Collecteur;
    }
    topLines.push(statutLine);

    var vne = billet.VersionNormaleExiste !== false;
    var varianteVal = billet.HasVariante || '';
    var varianteActive = varianteVal && varianteVal !== 'N';
    var prixNormal = billet.Prix ? parseFloat(billet.Prix) : 0;
    var prixVar = (billet.PrixVariante !== null && billet.PrixVariante !== undefined && billet.PrixVariante !== '') ? parseFloat(billet.PrixVariante) : prixNormal;

    if (!vne && varianteActive && prixVar) {
        topLines.push('💰 Prix : ' + prixVar.toFixed(2) + '€ ' + varianteVal);
    } else if (vne && varianteActive && prixNormal) {
        topLines.push('💰 Prix : ' + prixNormal.toFixed(2) + '€ normal / ' + prixVar.toFixed(2) + '€ ' + varianteVal);
    } else if (prixNormal) {
        topLines.push('💰 Prix : ' + prixNormal.toFixed(2) + '€');
    }

    textTopEl.textContent = topLines.join('\n');

    // Image du billet — pour l'aperçu Facebook on partage l'URL Cloudinary
    // avec l'overlay QR appliqué (image protégée + scrapable par FB)
    var imgUrl = billet.ImageUrl || '';
    var imgUrlForCopy = '';
    var QR_OVERLAY_SHARE = 'l_fetch:aHR0cHM6Ly9hcGkucXJzZXJ2ZXIuY29tL3YxL2NyZWF0ZS1xci1jb2RlLz9zaXplPTE1MHgxNTAmZGF0YT1odHRwczovL2N5cmlsMjUuZ2l0aHViLmlvL0JpbGxldHNUb3VyaXN0aXF1ZXM=,w_0.1,x_0.088,fl_relative,g_west,o_70';
    if (imgUrl && imgUrl.indexOf('cloudinary.com') !== -1) {
        imgUrlForCopy = imgUrl.replace('/upload/', '/upload/f_auto,q_auto,w_1200/' + QR_OVERLAY_SHARE + '/');
    } else if (billet.ImageId) {
        var driveUrl = 'https://lh3.googleusercontent.com/d/' + billet.ImageId;
        imgUrlForCopy = 'https://res.cloudinary.com/dxoyqxben/image/fetch/f_auto,q_auto,w_1200/' + QR_OVERLAY_SHARE + '/' + encodeURIComponent(driveUrl);
    }
    if (imgUrlForCopy) {
        imgEl.src = imgUrlForCopy;
        imgEl.style.display = '';
    } else {
        imgEl.style.display = 'none';
        imgEl.src = '';
    }

    // Partie basse : lien inscription + image Cloudinary
    var bottomLines = [];
    var baseUrl = 'https://cyril25.github.io/BilletsTouristiques/billets.html';
    bottomLines.push('👉 S\'inscrire : ' + baseUrl + '?billet=' + billetId);
    if (imgUrlForCopy) bottomLines.push(imgUrlForCopy);
    textBottomEl.textContent = bottomLines.join('\n\n');

    shareOverlay.style.display = '';

    // Reset bouton copie
    btn.innerHTML = '<i class="fa-solid fa-copy"></i> Copier';
    btn.classList.remove('admin-modal-btn-success');
    btn.classList.add('admin-modal-btn-primary');
}

function closeShareModal() {
    var overlay = document.getElementById('share-modal-overlay');
    if (overlay) overlay.style.display = 'none';
}

function copyShareText() {
    var top = document.getElementById('share-modal-text-top').textContent;
    var bottom = document.getElementById('share-modal-text-bottom').textContent;
    var text = top + '\n\n' + bottom;
    navigator.clipboard.writeText(text).then(function() {
        var btn = document.getElementById('share-copy-btn');
        btn.innerHTML = '<i class="fa-solid fa-check"></i> Copié !';
        btn.classList.remove('admin-modal-btn-primary');
        btn.classList.add('admin-modal-btn-success');
        setTimeout(function() {
            btn.innerHTML = '<i class="fa-solid fa-copy"></i> Copier';
            btn.classList.remove('admin-modal-btn-success');
            btn.classList.add('admin-modal-btn-primary');
        }, 2000);
    }).catch(function() {
        showToast('Erreur lors de la copie', 'error');
    });
}

// Fermer les modales avec Escape
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        var shareOverlay = document.getElementById('share-modal-overlay');
        if (shareOverlay && shareOverlay.style.display !== 'none') {
            closeShareModal();
        }
        var inscOverlay = document.getElementById('inscriptions-modal-overlay');
        if (inscOverlay && inscOverlay.style.display !== 'none') {
            closeInscriptionsModal();
        }
    }
});

// Fermer en cliquant sur l'overlay
var shareOverlayEl = document.getElementById('share-modal-overlay');
if (shareOverlayEl) {
    shareOverlayEl.addEventListener('click', function(e) {
        if (e.target === this) closeShareModal();
    });
}
var inscOverlayEl = document.getElementById('inscriptions-modal-overlay');
if (inscOverlayEl) {
    inscOverlayEl.addEventListener('click', function(e) {
        if (e.target === this) closeInscriptionsModal();
    });
}

// ============================================================
// FEAT-2 : MODALE GESTION DES INSCRIPTIONS
// ============================================================

var adminCurrentInscriptions = [];
var adminCurrentBilletId = null;
var adminRecalculEnCoursBilletId = null; // billet dont le recalcul des inscriptions est en cours

function openInscriptionsModal(billetId) {
    var billet = adminBillets.find(function(b) { return b._id === billetId; });
    if (!billet) return;

    var titleEl = document.getElementById('inscriptions-modal-title');
    var bodyEl = document.getElementById('inscriptions-modal-body');
    var overlayEl = document.getElementById('inscriptions-modal-overlay');
    if (!titleEl || !bodyEl || !overlayEl) return;

    adminCurrentBilletId = billetId;
    titleEl.innerHTML =
        '<i class="fa-solid fa-users"></i> Inscriptions — ' + escapeHtml(billet.NomBillet || 'Sans nom');
    overlayEl.style.display = '';

    // Si un recalcul est en cours pour ce billet, attendre qu'il finisse
    if (adminRecalculEnCoursBilletId && String(adminRecalculEnCoursBilletId) === String(billetId)) {
        bodyEl.innerHTML =
            '<p style="text-align:center; padding:20px; color:var(--color-text-light, #666);"><i class="fa-solid fa-spinner fa-spin"></i> Recalcul des inscriptions en cours…</p>';
        return;
    }

    bodyEl.innerHTML =
        '<p style="text-align:center; padding:20px; color:var(--color-text-light, #666);"><i class="fa-solid fa-spinner fa-spin"></i> Chargement...</p>';

    // Charger les inscriptions et les membres en parallèle
    Promise.all([
        supabaseFetch('/rest/v1/inscriptions?billet_id=eq.' + billetId + '&pas_interesse=eq.false&select=*&order=date_inscription.desc'),
        chargerAdminMembres()
    ])
        .then(function(results) {
            adminCurrentInscriptions = results[0] || [];
            renderInscriptionsModalContent(billet);
        })
        .catch(function(error) {
            console.error('Erreur chargement inscriptions:', error);
            var errBody = document.getElementById('inscriptions-modal-body');
            if (errBody) errBody.innerHTML =
                '<p style="text-align:center; padding:20px; color:var(--color-danger);">Erreur lors du chargement</p>';
        });
}

function closeInscriptionsModal() {
    var overlay = document.getElementById('inscriptions-modal-overlay');
    if (overlay) overlay.style.display = 'none';
    adminCurrentBilletId = null;
    adminCurrentInscriptions = [];
}

function renderInscriptionsModalContent(billet) {
    var body = document.getElementById('inscriptions-modal-body');
    var vne = billet.VersionNormaleExiste !== false;
    var varianteVal = billet.HasVariante || '';
    var varianteActive = varianteVal && varianteVal !== 'N';

    var html = '';

    // Bouton ajouter
    html += '<div class="admin-insc-toolbar">' +
        '<button class="admin-modal-btn admin-modal-btn-primary" onclick="openAdminAddInscription()">' +
        '<i class="fa-solid fa-user-plus"></i> Ajouter une inscription</button>' +
        '</div>';

    // Résumé des totaux
    if (adminCurrentInscriptions.length > 0) {
        var totalNormaux = 0, totalVariantes = 0;
        adminCurrentInscriptions.forEach(function(i) {
            totalNormaux += (i.nb_normaux || 0);
            totalVariantes += (i.nb_variantes || 0);
        });
        var summaryParts = [];
        summaryParts.push(adminCurrentInscriptions.length + ' inscription' + (adminCurrentInscriptions.length > 1 ? 's' : ''));
        var detailParts = [];
        if (totalNormaux > 0) detailParts.push(totalNormaux + ' billet' + (totalNormaux > 1 ? 's' : '') + ' normaux');
        if (totalVariantes > 0) {
            var vLabel = varianteVal;
            if (vLabel === 'anniversary') vLabel = 'anniv';
            else if (vLabel === 'doré') vLabel = 'dorés';
            detailParts.push(totalVariantes + ' billet' + (totalVariantes > 1 ? 's' : '') + ' ' + vLabel);
        }
        if (detailParts.length > 0) summaryParts.push('(' + detailParts.join(', ') + ')');
        html += '<p class="admin-insc-summary"><i class="fa-solid fa-chart-simple"></i> ' + summaryParts.join(' ') + '</p>';
    }

    // Tri par nom puis prénom
    if (adminMembresCache) {
        adminCurrentInscriptions.sort(function(a, b) {
            var ma = adminMembresCache.find(function(m) { return m.email === a.membre_email; }) || {};
            var mb = adminMembresCache.find(function(m) { return m.email === b.membre_email; }) || {};
            var na = (ma.nom || '').toLowerCase(), nb = (mb.nom || '').toLowerCase();
            if (na < nb) return -1; if (na > nb) return 1;
            var pa = (ma.prenom || '').toLowerCase(), pb = (mb.prenom || '').toLowerCase();
            if (pa < pb) return -1; if (pa > pb) return 1;
            return 0;
        });
    }

    if (adminCurrentInscriptions.length === 0) {
        html += '<p style="text-align:center; padding:20px; color:var(--color-text-light, #666);">Aucune inscription pour ce billet</p>';
    } else {
        html += '<div class="admin-insc-table-wrapper"><table class="admin-insc-table">';
        html += '<thead><tr><th>Membre</th>';
        if (vne) html += '<th>Normaux</th>';
        if (varianteActive) html += '<th>Variantes</th>';
        html += '<th>Actions</th></tr></thead><tbody>';

        adminCurrentInscriptions.forEach(function(insc) {
            var membreObj = adminMembresCache ? adminMembresCache.find(function(m) { return m.email === insc.membre_email; }) : null;
            var nomMembre = membreObj ? ((membreObj.nom || '') + ' ' + (membreObj.prenom || '')).trim() || insc.membre_email : insc.membre_email;

            html += '<tr id="admin-insc-row-' + insc.id + '">';
            html += '<td title="' + escapeAttr(insc.membre_email) + '">' + escapeHtml(nomMembre) + '</td>';

            if (vne) {
                html += '<td class="admin-insc-qty" id="admin-insc-normaux-' + insc.id + '">' + (insc.nb_normaux || 0) + '</td>';
            }
            if (varianteActive) {
                html += '<td class="admin-insc-qty" id="admin-insc-variantes-' + insc.id + '">' + (insc.nb_variantes || 0) + '</td>';
            }

            html += '<td class="admin-insc-actions">' +
                '<button class="btn-modifier-inscription" onclick="openAdminEditInscription(' + insc.id + ')" title="Modifier">' +
                '<i class="fa-solid fa-pen"></i></button>' +
                '<button class="btn-supprimer-inscription" onclick="confirmAdminDeleteInscription(' + insc.id + ')" title="Supprimer">' +
                '<i class="fa-solid fa-trash-can"></i></button>' +
                '</td>';
            html += '</tr>';
        });

        html += '</tbody></table></div>';
    }

    // Zone formulaire ajout/modification (cachée par défaut)
    html += '<div id="admin-insc-form-container" style="display:none;"></div>';

    body.innerHTML = html;
}

// --- Chargement des membres (cache admin) ---
function chargerAdminMembres() {
    if (adminMembresCache) return Promise.resolve(adminMembresCache);
    return supabaseFetch('/rest/v1/membres?select=email,nom,prenom,rue,code_postal,ville,pays&order=nom.asc')
        .then(function(data) {
            adminMembresCache = data || [];
            return adminMembresCache;
        });
}

// --- Ajout inscription ---
function openAdminAddInscription() {
    var billet = adminBillets.find(function(b) { return b._id === adminCurrentBilletId; });
    if (!billet) return;

    chargerAdminMembres().then(function(membres) {
        renderAdminInscriptionForm(billet, membres, null);
    }).catch(function(error) {
        console.error('Erreur chargement membres:', error);
        showToast('Erreur lors du chargement des membres', 'error');
    });
}

// --- Modification inscription ---
function openAdminEditInscription(inscriptionId) {
    var billet = adminBillets.find(function(b) { return b._id === adminCurrentBilletId; });
    if (!billet) return;

    var inscription = adminCurrentInscriptions.find(function(i) { return i.id === inscriptionId; });
    if (!inscription) return;

    chargerAdminMembres().then(function(membres) {
        renderAdminInscriptionForm(billet, membres, inscription);
    }).catch(function(error) {
        console.error('Erreur chargement membres:', error);
        showToast('Erreur lors du chargement des membres', 'error');
    });
}

function renderAdminInscriptionForm(billet, membres, editInscription) {
    var container = document.getElementById('admin-insc-form-container');
    if (!container) return;

    var isEdit = !!editInscription;
    var titre = isEdit ? 'Modifier l\'inscription' : 'Inscrire un membre';
    var varianteActive = billet.HasVariante && billet.HasVariante !== 'N';
    var vne = billet.VersionNormaleExiste !== false;

    var defEmail = isEdit ? editInscription.membre_email : '';
    var defNormaux = isEdit ? (editInscription.nb_normaux || 0) : (varianteActive && vne ? 0 : (vne ? 1 : 0));
    var defVariantes = isEdit ? (editInscription.nb_variantes || 0) : (!vne ? 1 : 0);
    var defPaiement = isEdit ? (editInscription.mode_paiement || 'PayPal') : 'PayPal';
    var defEnvoi = isEdit ? (editInscription.mode_envoi || 'Normal') : 'Normal';
    var defCommentaire = isEdit ? (editInscription.commentaire || '') : '';

    // Filtrer les membres déjà inscrits
    var emailsInscrits = {};
    if (!isEdit) {
        adminCurrentInscriptions.forEach(function(ins) {
            emailsInscrits[ins.membre_email] = true;
        });
    }

    var optionsMembres = '<option value="">— Sélectionner un membre —</option>';
    membres.forEach(function(m) {
        if (!isEdit && emailsInscrits[m.email]) return;
        var label = ((m.nom || '') + ' ' + (m.prenom || '')).trim() || m.email;
        var selected = (m.email === defEmail) ? ' selected' : '';
        optionsMembres += '<option value="' + m.email + '"' + selected + '>' + escapeHtml(label) + ' (' + escapeHtml(m.email) + ')</option>';
    });

    var html = '<div class="admin-insc-form">';
    html += '<h3><i class="fa-solid fa-user-plus"></i> ' + titre + '</h3>';

    // Sélecteur de membre
    if (isEdit) {
        var membreEdit = adminMembresCache ? adminMembresCache.find(function(m) { return m.email === defEmail; }) : null;
        var nomAffiche = membreEdit ? ((membreEdit.nom || '') + ' ' + (membreEdit.prenom || '')).trim() || defEmail : defEmail;
        html += '<div class="admin-insc-form-field"><label>Membre</label><span class="admin-insc-readonly">' + escapeHtml(nomAffiche) + '</span></div>';
    } else {
        html += '<div class="admin-insc-form-field"><label>Membre</label>' +
            '<input type="text" id="admin-insc-membre-search" placeholder="Rechercher un membre..." oninput="filtrerAdminMembresModal()" autocomplete="off">' +
            '<select id="admin-insc-membre-email" size="5" class="admin-insc-membre-select">' + optionsMembres + '</select></div>';
    }

    // Champs quantités
    if (vne) {
        html += '<div class="admin-insc-form-field"><label>Nb normaux</label><input type="number" id="admin-insc-nb-normaux" value="' + defNormaux + '" min="0"></div>';
    }
    if (varianteActive) {
        html += '<div class="admin-insc-form-field"><label>Nb variantes</label><input type="number" id="admin-insc-nb-variantes" value="' + defVariantes + '" min="0"></div>';
    }

    // Mode paiement et envoi
    html += '<div class="admin-insc-form-field"><label>Paiement</label><select id="admin-insc-paiement">' +
        '<option value="PayPal"' + (defPaiement === 'PayPal' ? ' selected' : '') + '>PayPal</option>' +
        '<option value="Chèque"' + (defPaiement === 'Chèque' ? ' selected' : '') + '>Chèque</option></select></div>';

    html += '<div class="admin-insc-form-field"><label>Envoi</label><select id="admin-insc-envoi">' +
        '<option value="Normal"' + (defEnvoi === 'Normal' ? ' selected' : '') + '>Normal</option>' +
        '<option value="Suivi"' + (defEnvoi === 'Suivi' ? ' selected' : '') + '>Suivi</option>' +
        '<option value="R1"' + (defEnvoi === 'R1' ? ' selected' : '') + '>Recommandé R1</option>' +
        '<option value="R2"' + (defEnvoi === 'R2' ? ' selected' : '') + '>Recommandé R2</option>' +
        '<option value="R3"' + (defEnvoi === 'R3' ? ' selected' : '') + '>Recommandé R3</option></select></div>';

    // Commentaire
    html += '<div class="admin-insc-form-field"><label>Commentaire</label><textarea id="admin-insc-commentaire" rows="2">' + escapeHtml(defCommentaire) + '</textarea></div>';

    // Boutons
    html += '<div class="admin-insc-form-actions">';
    if (isEdit) {
        html += '<button onclick="submitAdminEditInscription(' + editInscription.id + ')" class="admin-modal-btn admin-modal-btn-primary"><i class="fa-solid fa-check"></i> Enregistrer</button>';
    } else {
        html += '<button onclick="submitAdminAddInscription()" class="admin-modal-btn admin-modal-btn-primary"><i class="fa-solid fa-check"></i> Inscrire</button>';
    }
    html += '<button onclick="cancelAdminInscriptionForm()" class="admin-modal-btn admin-modal-btn-secondary">Annuler</button>';
    html += '</div>';

    html += '</div>';

    container.innerHTML = html;
    container.style.display = '';
    container.scrollIntoView({ behavior: 'smooth' });
}

function filtrerAdminMembresModal() {
    var searchInput = document.getElementById('admin-insc-membre-search');
    var selectEl = document.getElementById('admin-insc-membre-email');
    if (!searchInput || !selectEl || !adminMembresCache) return;

    var terme = searchInput.value.toLowerCase().trim();
    var emailsInscrits = {};
    adminCurrentInscriptions.forEach(function(ins) {
        emailsInscrits[ins.membre_email] = true;
    });

    var html = '<option value="">— Sélectionner un membre —</option>';
    adminMembresCache.forEach(function(m) {
        if (emailsInscrits[m.email]) return;
        var label = ((m.nom || '') + ' ' + (m.prenom || '')).trim() || m.email;
        var searchable = (label + ' ' + m.email).toLowerCase();
        if (terme && searchable.indexOf(terme) === -1) return;
        html += '<option value="' + m.email + '">' + escapeHtml(label) + ' (' + escapeHtml(m.email) + ')</option>';
    });
    selectEl.innerHTML = html;
}

function cancelAdminInscriptionForm() {
    var container = document.getElementById('admin-insc-form-container');
    if (container) {
        container.style.display = 'none';
        container.innerHTML = '';
    }
}

function submitAdminAddInscription() {
    var selectEl = document.getElementById('admin-insc-membre-email');
    if (!selectEl || !selectEl.value) {
        showToast('Veuillez sélectionner un membre', 'error');
        return;
    }
    var email = selectEl.value;
    var normauxEl = document.getElementById('admin-insc-nb-normaux');
    var nbNormaux = normauxEl ? parseInt(normauxEl.value) || 0 : 0;
    var variantesEl = document.getElementById('admin-insc-nb-variantes');
    var nbVariantes = variantesEl ? parseInt(variantesEl.value) || 0 : 0;

    if (nbNormaux + nbVariantes === 0) {
        showToast('Sélectionnez au moins un billet', 'error');
        return;
    }

    // Snapshot adresse du membre
    var membre = null;
    if (adminMembresCache) {
        for (var i = 0; i < adminMembresCache.length; i++) {
            if (adminMembresCache[i].email === email) {
                membre = adminMembresCache[i];
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
        billet_id: adminCurrentBilletId,
        membre_email: email,
        nb_normaux: nbNormaux,
        nb_variantes: nbVariantes,
        mode_paiement: document.getElementById('admin-insc-paiement').value,
        mode_envoi: document.getElementById('admin-insc-envoi').value,
        commentaire: (document.getElementById('admin-insc-commentaire').value || '').trim(),
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
        showToast('Membre inscrit avec succès !', 'success');
        cancelAdminInscriptionForm();
        // Recharger les compteurs depuis l'API (le cache stocke des objets, pas des nombres)
        loadAdminInscriptionCounts();
        // Recharger la liste des inscriptions dans la modale
        openInscriptionsModal(adminCurrentBilletId);
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

function submitAdminEditInscription(inscriptionId) {
    var normauxEl = document.getElementById('admin-insc-nb-normaux');
    var nbNormaux = normauxEl ? parseInt(normauxEl.value) || 0 : 0;
    var variantesEl = document.getElementById('admin-insc-nb-variantes');
    var nbVariantes = variantesEl ? parseInt(variantesEl.value) || 0 : 0;

    if (nbNormaux + nbVariantes === 0) {
        showToast('Sélectionnez au moins un billet', 'error');
        return;
    }

    var body = {
        nb_normaux: nbNormaux,
        nb_variantes: nbVariantes,
        mode_paiement: document.getElementById('admin-insc-paiement').value,
        mode_envoi: document.getElementById('admin-insc-envoi').value,
        commentaire: (document.getElementById('admin-insc-commentaire').value || '').trim()
    };

    supabaseFetch('/rest/v1/inscriptions?id=eq.' + inscriptionId, {
        method: 'PATCH',
        body: JSON.stringify(body)
    })
    .then(function() {
        showToast('Inscription modifiée !', 'success');
        cancelAdminInscriptionForm();
        openInscriptionsModal(adminCurrentBilletId);
    })
    .catch(function(error) {
        console.error('Erreur modification inscription:', error);
        showToast('Erreur lors de la modification', 'error');
    });
}

function confirmAdminDeleteInscription(inscriptionId) {
    if (!confirm('Êtes-vous sûr de vouloir supprimer cette inscription ?')) return;

    supabaseFetch('/rest/v1/inscriptions?id=eq.' + inscriptionId, {
        method: 'DELETE'
    })
    .then(function() {
        showToast('Inscription supprimée', 'success');
        // Recharger les compteurs depuis l'API (le cache stocke des objets, pas des nombres)
        loadAdminInscriptionCounts();
        openInscriptionsModal(adminCurrentBilletId);
    })
    .catch(function(error) {
        console.error('Erreur suppression inscription:', error);
        showToast('Erreur lors de la suppression', 'error');
    });
}

// ============================================================
// STORY 12.3 — GESTION DES COLLECTES SUPPLÉMENTAIRES
// ============================================================

function loadCollectesForBillet(billetId) {
    if (!billetId) return;
    var container = document.getElementById('collectes-list');
    if (container) container.innerHTML = '<p style="font-style:italic; color: var(--color-text-light, #666);">Chargement...</p>';
    supabaseFetch('/rest/v1/collectes?billet_id=eq.' + billetId + '&order=created_at.asc')
        .then(function(data) {
            renderCollectesList(data || [], billetId);
        })
        .catch(function(error) {
            console.error('Erreur chargement collectes:', error);
            var c = document.getElementById('collectes-list');
            if (c) c.innerHTML = '<p style="color: var(--color-danger);">Erreur de chargement.</p>';
        });
}

function renderCollectesList(collectes, billetId) {
    var container = document.getElementById('collectes-list');
    if (!container) return;
    if (!collectes || collectes.length === 0) {
        container.innerHTML = '<p class="collectes-empty">Aucune collecte supplémentaire.</p>';
        return;
    }
    var today = new Date().toISOString().slice(0, 10);
    var html = collectes.map(function(c) {
        var isOpen = !c.date_fin || c.date_fin > today;
        var statusClass = isOpen ? 'ouverte' : 'cloturee';
        var statusLabel = isOpen ? 'Ouverte' : 'Clôturée';
        return '<div class="collecte-item" data-collecte-id="' + c.id + '">' +
            '<span class="collecte-badge-nom collecte-scope-' + escapeAttr(c.scope || '') + '">' + escapeHtml(c.nom || '') + '</span>' +
            '<span class="collecte-badge-status ' + statusClass + '">' + statusLabel + '</span>' +
            '<span class="collecte-meta">' + escapeHtml(c.collecteur || '—') + '</span>' +
            (isOpen ? '<button type="button" class="btn-cloturer-collecte" data-collecte-id="' + c.id + '" data-billet-id="' + (billetId || '') + '">Clôturer</button>' : '') +
            '</div>';
    }).join('');
    container.innerHTML = html;
}

function validateCollecteForm() {
    var nomEl = document.getElementById('field-collecte-nom');
    var scopeEl = document.getElementById('field-collecte-scope');
    var errorNom = document.getElementById('error-collecte-nom');
    var errorScope = document.getElementById('error-collecte-scope');
    var valid = true;

    if (errorNom) errorNom.textContent = '';
    if (errorScope) errorScope.textContent = '';
    if (nomEl && nomEl.closest('.admin-form-group')) nomEl.closest('.admin-form-group').classList.remove('has-error');
    if (scopeEl && scopeEl.closest('.admin-form-group')) scopeEl.closest('.admin-form-group').classList.remove('has-error');

    if (!nomEl || nomEl.value.trim() === '') {
        if (errorNom) errorNom.textContent = 'Le nom est obligatoire';
        if (nomEl && nomEl.closest('.admin-form-group')) nomEl.closest('.admin-form-group').classList.add('has-error');
        valid = false;
    }
    if (!scopeEl || scopeEl.value === '') {
        if (errorScope) errorScope.textContent = 'Le scope est obligatoire';
        if (scopeEl && scopeEl.closest('.admin-form-group')) scopeEl.closest('.admin-form-group').classList.add('has-error');
        valid = false;
    }
    return valid;
}

function saveCollecte(billetId) {
    var getValue = function(id) {
        var el = document.getElementById(id);
        return el ? el.value.trim() : '';
    };
    var body = {
        billet_id: parseInt(billetId, 10),
        nom: getValue('field-collecte-nom'),
        scope: getValue('field-collecte-scope'),
        collecteur: getValue('field-collecte-collecteur') || null,
        date_pre: getValue('field-collecte-date-pre') || null,
        date_coll: getValue('field-collecte-date-coll') || null,
        date_fin: getValue('field-collecte-date-fin') || null
    };
    supabaseFetch('/rest/v1/collectes', {
        method: 'POST',
        body: JSON.stringify(body)
    })
    .then(function() {
        showToast('Collecte ajoutée', 'success');
        var ids = ['field-collecte-nom', 'field-collecte-scope', 'field-collecte-collecteur',
                   'field-collecte-date-pre', 'field-collecte-date-coll', 'field-collecte-date-fin'];
        ids.forEach(function(id) {
            var el = document.getElementById(id);
            if (el) el.value = '';
        });
        var elDatePre = document.getElementById('field-collecte-date-pre');
        if (elDatePre) elDatePre.value = new Date().toISOString().slice(0, 10);
        var section = document.getElementById('admin-collectes-supplementaires');
        var defaultColl = section ? section.dataset.billetCollecteur : '';
        var selColl = document.getElementById('field-collecte-collecteur');
        if (selColl && defaultColl) selColl.value = defaultColl;
        loadCollectesForBillet(billetId);
        loadAdminCollectes();
    })
    .catch(function(error) {
        console.error('Erreur ajout collecte:', error);
        showToast('Erreur lors de l\'ajout', 'error');
    });
}

function cloturerCollecte(collecteId, billetId) {
    supabaseFetch('/rest/v1/collectes?id=eq.' + collecteId, {
        method: 'PATCH',
        body: JSON.stringify({ date_fin: new Date().toISOString().slice(0, 10) })
    })
    .then(function() {
        showToast('Collecte clôturée', 'success');
        loadCollectesForBillet(billetId);
        loadAdminCollectes();
    })
    .catch(function(error) {
        console.error('Erreur clôture collecte:', error);
        showToast('Erreur lors de la clôture', 'error');
    });
}

function populateCollecteCollecteurSelect() {
    var select = document.getElementById('field-collecte-collecteur');
    if (!select) return;
    select.length = 1;
    (collecteursList || []).forEach(function(coll) {
        var option = document.createElement('option');
        option.value = coll.alias;
        option.textContent = coll.alias;
        select.appendChild(option);
    });
}
