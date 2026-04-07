// ============================================================
// CONFIGURATION
// ============================================================
const scriptUrl = "https://billet-proxy-worker.cyril-samson41.workers.dev/billets-touristiques";

// SEC-02 — Fonctions d'echappement pour empecher les XSS
function escapeHtml(text) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(text));
    return div.innerHTML;
}

function escapeAttr(text) {
    return String(text).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function sanitizeUrl(url) {
    if (!url) return '';
    var trimmed = url.trim();
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    return '';
}

// Resolution image — priorite ImageUrl (Cloudinary) > ImageId (Google Drive)
// QR code overlay via Cloudinary fetch layer (bottom-right, semi-transparent)
var QR_TXT = 'Arial_18_bold:Flashez-moi,co_white,b_rgb:00000099';
var QR_OVERLAY = 'l_fetch:aHR0cHM6Ly9hcGkucXJzZXJ2ZXIuY29tL3YxL2NyZWF0ZS1xci1jb2RlLz9zaXplPTE1MHgxNTAmZGF0YT1odHRwczovL2N5cmlsMjUuZ2l0aHViLmlvL0JpbGxldHNUb3VyaXN0aXF1ZXM=,w_0.1,x_0.088,fl_relative,g_west,o_70'
    + '/l_text:' + QR_TXT + ',g_west,x_0.138,y_-0.075,fl_relative'
    + '/l_text:' + QR_TXT + ',g_west,x_0.138,y_0.075,fl_relative'
    + '/l_text:' + QR_TXT + ',a_90,g_west,x_0.04,y_0,fl_relative'
    + '/l_text:' + QR_TXT + ',a_270,g_west,x_0.236,y_0,fl_relative';
function resolveImageUrl(item, size) {
    if (item.ImageUrl) {
        return item.ImageUrl.replace('/upload/', '/upload/f_auto,q_auto,w_' + (size || 800) + '/' + QR_OVERLAY + '/');
    }
    if (item.ImageId) {
        var safeId = escapeAttr(item.ImageId);
        var driveUrl = 'https://drive.google.com/thumbnail?id=' + safeId + '&sz=w' + (size || 800);
        return 'https://res.cloudinary.com/dxoyqxben/image/fetch/f_auto,q_auto,w_' + (size || 800) + '/' + QR_OVERLAY + '/' + encodeURIComponent(driveUrl);
    }
    return '';
}

function resolveDownloadUrl(item) {
    if (item.ImageUrl) {
        return item.ImageUrl;
    }
    if (item.ImageId) {
        return 'https://drive.usercontent.google.com/download?id=' + escapeAttr(item.ImageId);
    }
    return '#';
}

let allData = [];
let currentData = [];
let displayedCount = 0;
const BATCH_SIZE = 50;

// Couleurs des categories (meme mapping que admin.js)
const CATEGORIE_COLORS = {
    'Collecte': '#A4C2F4',
    'Pré collecte': '#FFFF00',
    'Terminé': '#C27BA0',
    'Pas de collecte': '#FF0000',
    'Jamais édité, projet': '#CECECE',
    'Non defini': '#F57C00'
};

function getCategorieColor(categorie) {
    return CATEGORIE_COLORS[categorie || 'Non defini'] || CATEGORIE_COLORS['Non defini'];
}

// Référence au slider (div vide dans le HTML)
let dateSlider = document.getElementById('date-slider');

document.addEventListener('DOMContentLoaded', () => {
    // S'assure que le mode par défaut (Collecte) est activé au chargement
    document.body.classList.add('view-collecte');
});

// Le chargement des données est déclenché après confirmation de l'auth Firebase.
// global.js gère les redirections et les membres ; app.js se contente d'écouter.
if (typeof firebase !== 'undefined') {
    firebase.auth().onAuthStateChanged(user => {
        if (user) {
            fetchData();
        }
    });
}

// ============================================================
// 1. CHARGEMENT DES DONNÉES (COMPLET UNIQUE)
// ============================================================
function fetchData() {
    const counter = document.getElementById('counter');

    // Feedback visuel de chargement
    if (counter) {
        counter.innerText = "Chargement...";
        counter.style.backgroundColor = "#EFE9F7";
        counter.style.color = "#5D3A7E";
    }

    const user = firebase.auth().currentUser;
    if (!user) {
        console.warn("fetchData() appelé sans utilisateur connecté. Annulation.");
        if (counter) counter.innerText = "Non connecté";
        return;
    }

    user.getIdToken()
        .then(token => {
            return fetch(scriptUrl, {
                headers: { 'Authorization': 'Bearer ' + token }
            });
        })
        .then(res => {
            if (!res.ok) throw new Error("Accès refusé (" + res.status + ")");
            return res.json();
        })
        .then(data => {
            console.log("Données reçues :", data.length);
            allData = data;

            // On met à jour les listes déroulantes
            populateFilters();

            // Initialisation du slider
            initSlider();

            // Application des filtres et affichage
            applyFilters(false);

            if (counter) {
                counter.style.backgroundColor = "#B19CD9";
                counter.style.color = "white";
                counter.innerText = allData.length + " billets";
            }
        })
        .catch(err => {
            console.error("Erreur chargement :", err);
            if (counter) {
                counter.innerText = "Erreur !";
                counter.style.backgroundColor = "#CC4444";
                counter.style.color = "white";
            }
            const grid = document.getElementById('cards-grid');
            if (grid) {
                grid.innerHTML = `
                    <div style="grid-column:1/-1; text-align:center; padding:40px; color:#CC4444;">
                        <i class="fa-solid fa-circle-exclamation" style="font-size:2em; margin-bottom:12px; display:block;"></i>
                        <strong>Impossible de charger les billets.</strong><br>
                        <span style="color:#666; font-size:0.9em;">${escapeHtml(err.message || 'Erreur réseau')} — Réessaye dans quelques instants.</span>
                    </div>`;
            }
        });
}

// ============================================================
// 2. GESTION DU SLIDER DATE (NOUISLIDER)
// ============================================================
function initSlider() {
    // Si le div n'existe pas (ex: sur une autre page que billets.html), on arrête
    if (!dateSlider) return;

    // 1. On récupère toutes les dates valides et on les convertit en Timestamp (nombre)
    const dates = allData
        .map(d => normalizeDate(d.Date)) // On nettoie le format
        .filter(d => d.length > 0)       // On enlève les vides
        .map(d => new Date(d).getTime()) // On convertit en millisecondes
        .filter(t => !isNaN(t));         // On enlève les dates invalides

    if (dates.length === 0) return;

    // 2. On trouve le Min et le Max
    const minTimestamp = Math.min(...dates);
    const maxTimestamp = Math.max(...dates);

    // 3. Si le slider existe déjà (re-chargement), on le détruit proprement
    if (dateSlider.noUiSlider) {
        dateSlider.noUiSlider.destroy();
    }

    // 4. Création du slider
    noUiSlider.create(dateSlider, {
        start: [minTimestamp, maxTimestamp], // Poignées au début et à la fin
        connect: true, // Barre colorée entre les deux
        range: {
            'min': minTimestamp,
            'max': maxTimestamp
        },
        step: 24 * 60 * 60 * 1000, // Pas de 1 jour
        tooltips: false // Pas de bulle (on a les inputs en dessous)
    });

    // 5. Quand le slider bouge -> On met à jour les inputs dates
    dateSlider.noUiSlider.on('update', function (values, handle) {
        // values[handle] est un timestamp en string
        const dateObj = new Date(parseInt(values[handle]));
        // On formatte en YYYY-MM-DD pour l'input HTML
        const dateStr = dateObj.toISOString().split('T')[0];

        if (handle === 0) {
            document.getElementById('date-start').value = dateStr;
        } else {
            document.getElementById('date-end').value = dateStr;
        }
    });

    // 6. Quand on lâche la souris -> On lance le filtre
    dateSlider.noUiSlider.on('change', function () {
        applyFilters();
    });
}

// Fonction appelée quand on change l'input date à la main
function manualDateChange() {
    const startVal = document.getElementById('date-start').value;
    const endVal = document.getElementById('date-end').value;

    // Si le slider est actif, on met à jour ses poignées
    if (dateSlider && dateSlider.noUiSlider && startVal && endVal) {
        const startTs = new Date(startVal).getTime();
        const endTs = new Date(endVal).getTime();
        dateSlider.noUiSlider.set([startTs, endTs]);
    }
    applyFilters();
}

// ============================================================
// 3. FONCTIONS UTILITAIRES & FILTRES
// ============================================================

// Change l'affichage (Collecte / Liste / Galerie)
function changeView(mode) {
    const body = document.body;
    body.classList.remove('view-collecte', 'view-liste', 'view-galerie');
    body.classList.add('view-' + mode);

    // Le filtre est relancé pour re-générer la vue correcte
    applyFilters(false);
}

// Convertit 25/12/2025 ou 2025-12-25T10:00 en 2025-12-25
function normalizeDate(str) {
    if (!str) return "";
    let clean = str.substring(0, 10); // Enlève l'heure
    // Si format français JJ/MM/AAAA
    if (clean.includes('/')) {
        const parts = clean.split('/');
        if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
    return clean;
}

function populateFilters() {
    const maps = [
        { id: 'sel-cat', key: 'Categorie' },
        { id: 'sel-pays', key: 'Pays' },
        { id: 'sel-year', key: 'Millesime' },
        { id: 'sel-theme', key: 'Theme' },
        { id: 'sel-coll', key: 'Collecteur' }
    ];
    maps.forEach(m => {
        const select = document.getElementById(m.id);
        if (!select) return; // Sécurité si on est sur une autre page

        const currentVal = select.value;
        let h = '<option value="">Tout</option>';
        // Récupère valeurs uniques triées
        [...new Set(allData.map(item => item[m.key]).filter(v => v))].sort().forEach(val => {
            h += `<option value="${escapeAttr(val)}" ${val === currentVal ? 'selected' : ''}>${escapeHtml(val)}</option>`;
        });
        select.innerHTML = h;
    });
}

function applyFilters(silent = false) {
    // Si on est sur une page sans grille (ex: Accueil), on arrête
    const grid = document.getElementById('cards-grid');
    if (!grid) return;

    const s = document.getElementById('search-input').value.toLowerCase();
    const fCat = document.getElementById('sel-cat').value;
    const fPays = document.getElementById('sel-pays').value;
    const fYear = document.getElementById('sel-year').value;
    const fTheme = document.getElementById('sel-theme').value;
    const fColl = document.getElementById('sel-coll').value;

    // Dates (Input text YYYY-MM-DD)
    const fStart = document.getElementById('date-start').value;
    const fEnd = document.getElementById('date-end').value;

    currentData = allData.filter(item => {
        const txt = !s || (item.NomBillet && item.NomBillet.toLowerCase().includes(s)) ||
            (item.Ville && item.Ville.toLowerCase().includes(s)) ||
            (item.Reference && item.Reference.toLowerCase().includes(s)) ||
            (item.Recherche && item.Recherche.toLowerCase().includes(s));

        // Comparaison de dates normalisées
        const itemDate = normalizeDate(item.Date);
        const matchDate = (!fStart || (itemDate && itemDate >= fStart)) &&
            (!fEnd || (itemDate && itemDate <= fEnd));

        return txt && matchDate &&
            (!fCat || item.Categorie === fCat) &&
            (!fPays || item.Pays === fPays) && (!fYear || item.Millesime == fYear) &&
            (!fTheme || item.Theme === fTheme) && (!fColl || item.Collecteur === fColl);
    });

    if (!silent) {
        // Vider l'affichage
        grid.innerHTML = "";
        displayedCount = 0;

        // Si le mode Liste est actif, on affiche le tableau, sinon la grille/galerie.
        if (document.body.classList.contains('view-liste')) {
            renderListTable();
        } else {
            // S'assure que le conteneur du tableau est vide si on passe en grille/galerie
            const listTableContainer = document.getElementById('list-table-container');
            if (listTableContainer) listTableContainer.innerHTML = "";
            showMore();
        }
    } else {
        updateLoadMoreButton();
    }

    // Mise à jour compteur global
    const counterBtn = document.getElementById('counter');
    if (counterBtn) counterBtn.innerText = currentData.length + " billets";
}

// ============================================================
// 4. RENDU HTML (TEMPLATES POUR 3 MODES)
// ============================================================

// --- Rendu Mode Liste (Tableau) ---
function renderListTable() {
    const tableContainer = document.getElementById('list-table-container');
    if (!tableContainer) return;

    if (currentData.length === 0) {
        tableContainer.innerHTML = "<p style='text-align:center;'>Aucun résultat.</p>";
        updateLoadMoreButton();
        return;
    }

    let html = `
    <table id="billets-table">
        <thead>
            <tr>
                <th>N°</th>
                <th>Année-Version</th>
                <th>Dép.</th>
                <th>Réf.</th>
                <th>Ville</th>
                <th>Nom Billet</th>
                <th>Collecteur</th>
                <th>Commentaire</th>
            </tr>
        </thead>
        <tbody>`;

    currentData.forEach(item => {
        html += `
        <tr>
            <td>${escapeHtml(item.Timestamp || '')}</td>
            <td>${escapeHtml(item.Millesime || 'XXXX')}-${escapeHtml(item.Version || 'X')}</td>
            <td>${escapeHtml(item.Dep || '')}</td>
            <td class="col-ref">${escapeHtml(item.Reference || '')}</td>
            <td>${escapeHtml(item.Ville || '')}</td>
            <td>${escapeHtml(item.NomBillet || '')}</td>
            <td>${escapeHtml(item.Collecteur || '')}</td>
            <td class="col-comment">${escapeHtml(item.Commentaire || '')}</td>
        </tr>`;
    });

    html += `</tbody></table>`;
    tableContainer.innerHTML = html;

    // On masque le bouton Load More car le tableau affiche tout
    document.getElementById('btn-load-more').style.display = 'none';
}


// --- Rendu Mode Collecte & Galerie ---
function showMore() {
    const body = document.body;
    const grid = document.getElementById('cards-grid');
    const batch = currentData.slice(displayedCount, displayedCount + BATCH_SIZE);

    const isGalleryMode = body.classList.contains('view-galerie');

    if (batch.length === 0 && displayedCount === 0) {
        grid.innerHTML = "<p style='grid-column: 1/-1; text-align:center;'>Aucun résultat.</p>";
        updateLoadMoreButton(); return;
    }

    let html = "";
    batch.forEach(item => {
        // Image — priorité ImageUrl (Cloudinary) > ImageId (Google Drive)
        const imgUrl = resolveImageUrl(item, 800);
        const downloadLink = resolveDownloadUrl(item);
        const couleur = getCategorieColor(item.Categorie);

        const billetPageUrl = 'billet.html?id=' + encodeURIComponent(item.id || '');

        if (isGalleryMode) {
            // RENDU MODE GALERIE — clic ouvre la fiche billet
            html += `
            <a class="galerie-item" href="${escapeAttr(billetPageUrl)}">
                ${imgUrl ? `<img src="${escapeAttr(imgUrl)}" class="galerie-image" alt="${escapeAttr(item.NomBillet || 'Billet')}">` : `
                    <div style="text-align:center; color:#999; font-size:0.8em; padding:10px;">Image manquante<br>${escapeHtml(item.Reference || '')}</div>
                `}
            </a>`;

        } else {
            // RENDU MODE COLLECTE (par défaut)
            html += `
            <div class="global-container" style="border-top: 8px solid ${couleur};">

                <div class="header-container">
                    <div class="image-bg" style="background: linear-gradient(to bottom, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 0.6) 100%), url(${escapeAttr(imgUrl)}) no-repeat; "></div>

                    <div class="category" style="background-color: ${couleur}; color: ${item.Categorie === 'Pré collecte' ? '#9e9e9eff' : 'white'};">
                        ${escapeHtml(item.Categorie || '')}
                    </div>
                </div>

                <div class="city-strip" style="color: ${couleur}; background-color: color-mix(in srgb, ${couleur}, #e0e0e0 70%);">
                    ${escapeHtml(item.Ville || '')}
                </div>

                <div class="content">
                    <div class="description">
                        ${escapeHtml(item.Dep || '')} ${escapeHtml(item.Reference || '')} ${escapeHtml(item.Millesime || '')}-${escapeHtml(item.Version || '')}<br />
                        ${escapeHtml(item.Cp || '')} ${escapeHtml((item.Ville || '').toUpperCase())}<br />
                        ${escapeHtml(item.NomBillet || '')}
                    </div>

                    ${(function() {
                        var parts = [];
                        if (item.Collecteur) parts.push('Par ' + escapeHtml(item.Collecteur));
                        if (item.Prix) {
                            var prixTxt = 'au prix de ' + escapeHtml(String(item.Prix)) + ' euros';
                            if (item.PrixVariante && item.PrixVariante !== item.Prix) {
                                prixTxt += ' / Variante : ' + escapeHtml(String(item.PrixVariante)) + ' euros';
                            }
                            parts.push(prixTxt);
                        }
                        if (parts.length === 0) return '';
                        return '<div>' + parts.join(' ') + ' ' + escapeHtml(item.FDP_Com || '') + '</div>';
                    })()}

                    <div style="margin-top:15px;">
                        Commentaire : ${escapeHtml(item.Commentaire || '')}
                    </div>
                </div>

                <div class="more">
                    <center>
                        <table class="dates">
                            <tr><td>Pré Collecte :</td><td><b>${escapeHtml(item.DatePre || '')}</b></td></tr>
                            <tr><td>Collecte :</td><td><b>${escapeHtml(item.DateColl || '')}</b></td></tr>
                            <tr><td>Terminé :</td><td><b>${escapeHtml(item.DateFin || '')}</b></td></tr>
                        </table>
                    </center>
                </div>

                <div class="more">
                    <center>${escapeHtml(item.CompteurBT || '')}</center>
                </div>

                <div class="more action-icons">
                    ${(() => {
                        var cat = item.Categorie || '';
                        var hideGoogle = (cat === 'Terminé' || cat === 'Non defini' || cat === 'Jamais édité, projet' || cat === 'Pas de collecte');
                        return (!hideGoogle && sanitizeUrl(item.Sondage)) ? `
                        <a href="${escapeAttr(sanitizeUrl(item.Sondage))}" target="_blank" rel="noopener" class="icon-btn ico-form" title="Répondre au sondage">
                            <i class="fa-solid fa-clipboard-question"></i>
                        </a>` : '';
                    })()}

                    ${(() => {
                        var cat = item.Categorie || '';
                        var hideGoogle = (cat === 'Terminé' || cat === 'Non defini' || cat === 'Jamais édité, projet' || cat === 'Pas de collecte');
                        return (!hideGoogle && sanitizeUrl(item.LinkSheet)) ? `
                        <a href="${escapeAttr(sanitizeUrl(item.LinkSheet))}" target="_blank" rel="noopener" class="icon-btn ico-sheet" title="Voir le fichier Excel">
                            <i class="fa-solid fa-file-csv"></i>
                        </a>` : '';
                    })()}

                    ${sanitizeUrl(item.LinkFB) ? `
                        <a href="${escapeAttr(sanitizeUrl(item.LinkFB))}" target="_blank" rel="noopener" class="icon-btn ico-fb" title="Voir sur Facebook">
                            <i class="fa-brands fa-facebook"></i>
                        </a>` : ''}

                    ${imgUrl ? `
                        <a href="${escapeAttr(billetPageUrl)}" class="icon-btn ico-dl" title="Voir la fiche du billet">
                            <i class="fa-solid fa-image"></i>
                        </a>` : ''}

                    <span style='font-size:10px; color:#ccc; align-self:center;'>(n°${escapeHtml(item.Timestamp || '')})</span>
                </div>
            </div>`;
        }
    });

    grid.insertAdjacentHTML('beforeend', html);
    displayedCount += batch.length;
    updateLoadMoreButton();

    // Galerie : les clics sont maintenant des liens <a> vers billet.html
}


function updateLoadMoreButton() {
    const btn = document.getElementById('btn-load-more');
    if (!btn) return;

    // Le bouton doit être masqué UNIQUEMENT en mode Liste (qui affiche tout d'un coup)
    const isListMode = document.body.classList.contains('view-liste');

    if (isListMode) {
        btn.style.display = 'none';
        return;
    }

    // Le bouton doit être visible si le nombre de billets affichés est inférieur au total filtré
    if (displayedCount < currentData.length) {
        btn.style.display = 'inline-block';

        // Mettre à jour le texte du bouton (plus esthétique que juste 'Voir la suite')
        btn.innerText = `Voir la suite (${currentData.length - displayedCount})`;
    } else {
        btn.style.display = 'none';
    }
}

// ============================================================
// 5. GESTION DU MODAL (ZOOM GALERIE)
// ============================================================
function openModal(imgUrl) {
    const modal = document.getElementById('image-modal');
    const modalImg = document.getElementById('modal-image');

    modal.classList.remove('hidden');

    // Zoom : résolution plus grande selon la source
    if (imgUrl.indexOf('cloudinary.com') !== -1) {
        // Cloudinary — remplacer w_800 par w_1600
        modalImg.src = imgUrl.replace('/w_800/', '/w_1600/');
    } else {
        // Google Drive — remplacer sz=w800 par sz=w1600
        modalImg.src = imgUrl.replace('sz=w800', 'sz=w1600');
    }

    // Empêche le scroll de la page derrière
    document.body.style.overflow = 'hidden';
}

function closeModal() {
    const modal = document.getElementById('image-modal');

    modal.classList.add('hidden');

    // Rétablit le scroll de la page
    document.body.style.overflow = 'auto';
}

// ============================================================
// 6. INSCRIPTIONS AUX COLLECTES (Story 5.4)
// ============================================================

