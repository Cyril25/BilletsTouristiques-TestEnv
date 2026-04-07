// ============================================================
// Fiche Billet — charge un billet par référence (?ref=XX-XXXX)
// et affiche son image avec un QR code GRAVÉ via Canvas.
// Le clic-droit "Enregistrer sous" sauvegarde l'image avec le QR.
// ============================================================

(function() {
    'use strict';

    var SITE_BASE = 'https://cyril25.github.io/BilletsTouristiques';
    var QR_SIZE_RATIO = 0.12;  // QR = 12% de la largeur de l'image
    var QR_MARGIN = 20;        // marge en pixels depuis le bord

    // --- Helpers ---
    function escapeHtml(str) {
        if (!str) return '';
        return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    function resolveImageUrl(item, size) {
        if (item.ImageUrl) {
            return item.ImageUrl.replace('/upload/', '/upload/f_auto,q_auto,w_' + (size || 1000) + '/');
        }
        if (item.ImageId) {
            return 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(item.ImageId) + '&sz=w' + (size || 1000);
        }
        return '';
    }

    function getQrUrl(ref) {
        var pageUrl = SITE_BASE + '/billet.html?ref=' + encodeURIComponent(ref);
        return 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' + encodeURIComponent(pageUrl);
    }

    // --- Grave le QR dans l'image via Canvas ---
    function burnQrIntoImage(imgEl, imgUrl, qrUrl) {
        var billetImg = new Image();
        billetImg.crossOrigin = 'anonymous';

        var qrImg = new Image();
        qrImg.crossOrigin = 'anonymous';

        var loaded = 0;
        function onBothLoaded() {
            loaded++;
            if (loaded < 2) return;

            var canvas = document.createElement('canvas');
            canvas.width = billetImg.naturalWidth;
            canvas.height = billetImg.naturalHeight;
            var ctx = canvas.getContext('2d');

            // Dessiner l'image du billet
            ctx.drawImage(billetImg, 0, 0);

            // Calculer la taille du QR proportionnelle à l'image
            var qrSize = Math.max(60, Math.round(canvas.width * QR_SIZE_RATIO));
            var padding = 6;
            var x = QR_MARGIN;
            var y = Math.round((canvas.height - qrSize) / 2);

            // Fond blanc avec arrondi derrière le QR
            ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
            ctx.beginPath();
            ctx.roundRect(x - padding, y - padding, qrSize + padding * 2, qrSize + padding * 2, 6);
            ctx.fill();

            // Dessiner le QR code
            ctx.drawImage(qrImg, x, y, qrSize, qrSize);

            // Remplacer l'image par le résultat du canvas
            imgEl.src = canvas.toDataURL('image/png');
        }

        billetImg.onload = onBothLoaded;
        qrImg.onload = onBothLoaded;

        billetImg.onerror = function() {
            // Fallback : afficher l'image sans QR gravé
            imgEl.src = imgUrl;
        };
        qrImg.onerror = function() {
            imgEl.src = imgUrl;
        };

        billetImg.src = imgUrl;
        qrImg.src = qrUrl;
    }

    // --- Init ---
    function init() {
        var params = new URLSearchParams(window.location.search);
        var ref = params.get('ref');

        if (!ref) {
            showError();
            return;
        }

        firebase.auth().onAuthStateChanged(function(user) {
            if (!user) return;
            loadBillet(ref);
        });
    }

    function loadBillet(ref) {
        supabaseFetch('/rest/v1/billets?Reference=eq.' + encodeURIComponent(ref) + '&select=*')
            .then(function(rows) {
                if (!rows || rows.length === 0) {
                    showError();
                    return;
                }
                renderBillet(rows[0]);
            })
            .catch(function() {
                showError();
            });
    }

    function renderBillet(b) {
        document.getElementById('billet-loading').classList.add('hidden');
        document.getElementById('billet-content').classList.remove('hidden');

        // Image avec QR gravé via Canvas
        var imgUrl = resolveImageUrl(b, 1000);
        var imgEl = document.getElementById('billet-image');
        if (imgUrl) {
            var qrUrl = getQrUrl(b.Reference);
            burnQrIntoImage(imgEl, imgUrl, qrUrl);
            imgEl.alt = b.NomBillet || 'Billet';
        } else {
            imgEl.style.display = 'none';
        }

        // Infos
        document.getElementById('billet-nom').textContent = b.NomBillet || '';
        document.getElementById('billet-ref').textContent = b.Reference || '';

        var lieu = [b.Cp, b.Ville, b.Dep, b.Pays].filter(Boolean).join(' — ');
        document.getElementById('billet-lieu').textContent = lieu;

        document.getElementById('billet-millesime').textContent = b.Millesime || '—';
        document.getElementById('billet-version').textContent = b.Version || '—';

        var catEl = document.getElementById('billet-categorie');
        catEl.textContent = b.Categorie || '—';

        if (b.Theme) {
            document.getElementById('billet-theme').textContent = b.Theme;
        } else {
            document.getElementById('billet-theme-row').style.display = 'none';
        }

        if (b.Commentaire) {
            document.getElementById('billet-commentaire').textContent = b.Commentaire;
        } else {
            document.getElementById('billet-commentaire-row').style.display = 'none';
        }

        document.title = (b.Reference || 'Billet') + ' — ' + (b.NomBillet || 'Fiche Billet');
    }

    function showError() {
        document.getElementById('billet-loading').classList.add('hidden');
        document.getElementById('billet-error').classList.remove('hidden');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
