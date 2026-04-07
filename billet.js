// ============================================================
// Fiche Billet — charge un billet par référence (?ref=XX-XXXX)
// et affiche son image avec un QR code GRAVÉ via Canvas.
// Le clic-droit "Enregistrer sous" sauvegarde l'image avec le QR.
// ============================================================

(function() {
    'use strict';

    var SITE_BASE = 'https://cyril25.github.io/BilletsTouristiques';
    // Référence : sur billets.html, Cloudinary renvoie des images de 800px
    // avec QR de 80px et marge gauche de 70px. On garde les mêmes proportions.
    var QR_REF_WIDTH = 800;
    var QR_REF_SIZE = 80;
    var QR_REF_MARGIN = 70;

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
            // Cloudinary fetch : récupère l'image Drive et applique f_auto/q_auto
            // (le QR sera ensuite gravé via Canvas comme pour Cloudinary natif)
            var driveUrl = 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(item.ImageId) + '&sz=w' + (size || 1000);
            return 'https://res.cloudinary.com/dxoyqxben/image/fetch/f_auto,q_auto,w_' + (size || 1000) + '/' + encodeURIComponent(driveUrl);
        }
        return '';
    }

    function getQrUrl(id) {
        var pageUrl = SITE_BASE + '/billet.html?id=' + encodeURIComponent(id);
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

            // Tailles proportionnelles à la référence billets.html (800px)
            var ratio = canvas.width / QR_REF_WIDTH;
            var qrSize = Math.round(QR_REF_SIZE * ratio);
            var margin = Math.round(QR_REF_MARGIN * ratio);
            var padding = 6;
            var x = margin;
            var y = Math.round((canvas.height - qrSize) / 2);

            // Fond blanc avec arrondi derrière le QR
            ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
            ctx.beginPath();
            ctx.roundRect(x - padding, y - padding, qrSize + padding * 2, qrSize + padding * 2, 6);
            ctx.fill();

            // Dessiner le QR code
            ctx.drawImage(qrImg, x, y, qrSize, qrSize);

            // 4 textes autour du QR
            var fontSize = Math.round(qrSize * 0.18);
            ctx.font = 'bold ' + fontSize + 'px Arial, sans-serif';
            ctx.fillStyle = '#fff';
            ctx.strokeStyle = '#000';
            ctx.lineWidth = Math.max(2, Math.round(fontSize * 0.12));
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            var cx = x + qrSize / 2;
            var cy = y + qrSize / 2;
            var gap = Math.round(fontSize * 0.9);

            function drawLabel(text, centerX, centerY, angleRad) {
                ctx.save();
                ctx.translate(centerX, centerY);
                ctx.rotate(angleRad);
                ctx.strokeText(text, 0, 0);
                ctx.fillText(text, 0, 0);
                ctx.restore();
            }

            // Haut (lecture normale)
            drawLabel('Association', cx, y - gap, 0);
            // Bas (lecture normale)
            drawLabel('Billets Touristiques', cx, y + qrSize + gap, 0);
            // Gauche (rotation -90°, suit le QR)
            drawLabel('Flashez-moi', x - gap, cy, -Math.PI / 2);
            // Droite (rotation +90°, suit le QR)
            drawLabel('cyril25.github.io', x + qrSize + gap, cy, Math.PI / 2);

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
        var id = params.get('id');

        if (!id) {
            showError();
            return;
        }

        firebase.auth().onAuthStateChanged(function(user) {
            if (!user) return;
            loadBillet(id);
        });
    }

    function loadBillet(id) {
        supabaseFetch('/rest/v1/billets?id=eq.' + encodeURIComponent(id) + '&select=*')
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
            var qrUrl = getQrUrl(b.id);
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
