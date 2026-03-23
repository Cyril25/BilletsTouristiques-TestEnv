// ============================================================
// Ma Collection — Script principal
// ============================================================
// Story 6.2 : Structure initiale
// Fonctionnalités à venir : paramétrage, affichage, saisie, import/export
// ============================================================

(function() {
    'use strict';

    // Attendre que l'auth soit prête (global.js expose window.userRole après auth)
    document.addEventListener('DOMContentLoaded', function() {
        // Le guard data-require-email dans global.js s'assure que seul
        // l'email autorisé peut accéder à cette page.
        // Le contenu sera chargé une fois l'auth validée.
    });
})();
