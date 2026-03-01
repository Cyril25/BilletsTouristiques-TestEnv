// ============================================================
// CONFIGURATION
// ============================================================
const scriptUrl = "https://airbnb-ical-proxy.cyril-samson41.workers.dev/billets-touristiques";

let allData = [];
let currentData = [];
let displayedCount = 0;
const BATCH_SIZE = 50;
// isFullLoaded supprimé car on charge tout d'un coup

// Référence au slider (div vide dans le HTML)
let dateSlider = document.getElementById('date-slider');

document.addEventListener('DOMContentLoaded', () => {
    // S'assure que le mode par défaut (Collecte) est activé au chargement
    document.body.classList.add('view-collecte');
});

// Le chargement des données est déclenché après confirmation de l'auth Firebase.
// global.js gère les redirections et la whitelist ; app.js se contente d'écouter.
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
            if (counter) counter.innerText = "Erreur !";
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
            h += `<option value="${val}" ${val === currentVal ? 'selected' : ''}>${val}</option>`;
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
            <td>${item.Timestamp || ''}</td>
            <td>${item.Millesime || 'XXXX'}-${item.Version || 'X'}</td>
            <td>${item.Dep || ''}</td>
            <td class="col-ref">${item.Reference || ''}</td>
            <td>${item.Ville || ''}</td>
            <td>${item.NomBillet || ''}</td>
            <td>${item.Collecteur || ''}</td>
            <td class="col-comment">${item.Commentaire || ''}</td>
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
        // Image HD
        const imgUrl = item.ImageId ? `https://drive.google.com/thumbnail?id=${item.ImageId}&sz=w800` : '';
        const downloadLink = item.ImageId ? `https://drive.usercontent.google.com/download?id=${item.ImageId}` : '#';
        const couleur = item.Couleur || '#666';

        if (isGalleryMode) {
            // RENDU MODE GALERIE
            html += `
            <div class="galerie-item" onclick="openModal('${imgUrl}')">
                ${item.ImageId ? `<img src="${imgUrl}" class="galerie-image" alt="${item.NomBillet || 'Billet'}">` : `
                    <div style="text-align:center; color:#999; font-size:0.8em; padding:10px;">Image manquante<br>${item.Reference}</div>
                `}
            </div>`;

        } else {
            // RENDU MODE COLLECTE (par défaut)
            html += `
            <div class="global-container" style="border-top: 8px solid ${couleur};">
                
                <div class="header-container">
                    <div class="image-bg" style="background: linear-gradient(to bottom, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 0.6) 100%), url(${imgUrl}) no-repeat; "></div>
                    
                    <div class="category" style="background-color: ${couleur}; color: ${item.Categorie === 'Pré collecte' ? '#9e9e9eff' : 'white'};">
                        ${item.Categorie}
                    </div>
                </div>

                <div class="city-strip" style="color: ${couleur}; background-color: color-mix(in srgb, ${couleur}, #e0e0e0 70%);">
                    ${item.Ville || ''}
                </div>
                
                <div class="content">
                    <div class="description">
                        ${item.Dep || ''} ${item.Reference || ''} ${item.Millesime || ''}-${item.Version || ''}<br />
                        ${item.Cp || ''} ${item.Ville || ''}<br />
                        ${item.NomBillet || ''}
                    </div>
                    
                    <div class="${item.CollecteCache || ''}">
                        Par ${item.Collecteur || '?'} au prix de ${item.Prix || '?'} euros ${item.FDP || ''} ${item.FDP_Com || ''}
                        <br><br>
                        <div style="text-align:left; font-size:1.1em;">
                            ${item.InfoPaiement.replace(/style='color:#00457C; font-size:24px;'/, `style='color:#5D3A7E; font-size:24px;'`) || ''}
                        </div>
                    </div>
                    
                    <div class="${item.ComCache || ''}" style="margin-top:15px;">
                        Commentaire : ${item.Commentaire || ''}
                    </div>
                </div>

                <div class="more">
                    <center>
                        <table class="dates">
                            <tr><td>Pré Collecte :</td><td><b>${item.DatePre || ''}</b></td></tr>
                            <tr><td>Collecte :</td><td><b>${item.DateColl || ''}</b></td></tr>
                            <tr><td>Terminé :</td><td><b>${item.DateFin || ''}</b></td></tr>
                        </table>
                    </center>
                </div>

                <div class="more">
                    <center>${item.CompteurBT || ''}</center>
                </div>

                <div class="more action-icons">
                    ${item.Sondage ? `
                        <a href="${item.Sondage}" target="_blank" class="icon-btn ico-form" title="Répondre au sondage">
                            <i class="fa-solid fa-clipboard-question"></i>
                        </a>` : ''}

                    ${item.LinkSheet ? `
                        <a href="${item.LinkSheet}" target="_blank" class="icon-btn ico-sheet" title="Voir le fichier Excel">
                            <i class="fa-solid fa-file-csv"></i>
                        </a>` : ''}

                    ${item.LinkFB ? `
                        <a href="${item.LinkFB}" target="_blank" class="icon-btn ico-fb" title="Voir sur Facebook">
                            <i class="fa-brands fa-facebook"></i>
                        </a>` : ''}

                    ${item.ImageId ? `
                        <a href="${downloadLink}" target="_blank" class="icon-btn ico-dl" title="Télécharger l'image HD">
                            <i class="fa-solid fa-download"></i>
                        </a>` : ''}
                        
                    <span style='font-size:10px; color:#ccc; align-self:center;'>(n°${item.Timestamp || ''})</span>
                </div>
            </div>`;
        }
    });

    grid.insertAdjacentHTML('beforeend', html);
    displayedCount += batch.length;
    updateLoadMoreButton();
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

    // Utiliser une taille d'image plus grande pour le zoom
    modalImg.src = imgUrl.replace('sz=w800', 'sz=w1600');

    // Empêche le scroll de la page derrière
    document.body.style.overflow = 'hidden';
}

function closeModal() {
    const modal = document.getElementById('image-modal');

    modal.classList.add('hidden');

    // Rétablit le scroll de la page
    document.body.style.overflow = 'auto';
}
