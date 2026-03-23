// ============================================================
// Ma Collection — Script principal
// ============================================================
// Story 6-2 : Structure + accès restreint
// Story 6-3 : Paramétrage collection — frise temporelle
// Story 6-4 : Forçage inclusion/exclusion individuel
// Story 6-5 : Filtre vivant dynamique
// Story 7-1 : Affichage 3 niveaux de visibilité
// Story 7-2 : Compteurs hiérarchiques
// Story 7-3 : Saisie de possession
// Story 7-4 : Recherche dans la collection
// ============================================================

(function() {
    'use strict';

    // --- État global ---
    var allBillets = [];
    var allPays = [];
    var memberRules = [];       // collection_rules du membre (sauvegardé)
    var editRules = [];         // copie de travail pendant l'édition
    var memberOverrides = [];   // collection_overrides du membre
    var collectionData = [];    // lignes table collection du membre
    var trackSerial = false;       // track_serial_numbers du membre
    var paramsOpen = false;
    var currentFilter = 'all';     // all | owned | missing | outofscope
    var currentGroupBy = 'pays';   // pays | annee | combo
    var searchQuery = '';
    var filterPays = '';            // '' = tous
    var filterAnnee = '';           // '' = toutes
    var collectionMap = {};        // billet_id -> { owned_normal, owned_variante, ... }
    var minYear = 2015;
    var maxYear = new Date().getFullYear();

    // --- Exposer les fonctions appelées depuis le HTML ---
    window.collToggleParams = collToggleParams;
    window.collAddBreakpoint = collAddBreakpoint;
    window.collCancelParams = collCancelParams;
    window.collSaveParams = collSaveParams;
    window.collRemoveBreakpoint = collRemoveBreakpoint;
    window.collTogglePaysGrid = collTogglePaysGrid;
    window.collSearch = collSearch;
    window.collFilter = collFilter;
    window.collToggleOwned = collToggleOwned;
    window.collForceInclude = collForceInclude;
    window.collForceExclude = collForceExclude;
    window.collRemoveOverride = collRemoveOverride;
    window.collGroupBy = collGroupBy;
    window.collFilterPays = collFilterPays;
    window.collFilterAnnee = collFilterAnnee;
    window.collToggleSerial = collToggleSerial;
    window.collExport = collExport;
    window.collImport = collImport;
    window.collShowBillet = collShowBillet;
    window.collCloseModal = collCloseModal;
    window.onboardingNext = onboardingNext;
    window.onboardingPrev = onboardingPrev;
    window.onboardingSkip = onboardingSkip;
    window.onboardingFinish = onboardingFinish;

    // ============================================================
    // 1. INITIALISATION
    // ============================================================

    // Attendre que global.js ait fini l'auth
    var checkAuthInterval = setInterval(function() {
        if (typeof window.userRole !== 'undefined' && firebase.auth().currentUser) {
            clearInterval(checkAuthInterval);
            init();
        }
    }, 100);

    function init() {
        var counter = document.getElementById('collection-counter');
        if (counter) counter.innerHTML = '<span class="collection-loading">Chargement...</span>';

        Promise.all([
            supabaseFetch('/rest/v1/billets?select=id,Millesime,Pays,HasVariante,NomBillet,Reference,Version,ImageUrl,ImageId,Dep&order=Millesime.asc.nullslast,Pays.asc'),
            supabaseFetch('/rest/v1/pays?select=nom&order=nom.asc'),
            supabaseFetch('/rest/v1/membres?email=eq.' + encodeURIComponent(firebase.auth().currentUser.email) + '&select=collection_rules,collection_overrides,track_serial_numbers'),
            supabaseFetch('/rest/v1/collection?select=*')
        ])
        .then(function(results) {
            allBillets = results[0] || [];
            allPays = (results[1] || []).map(function(p) { return p.nom; });
            var membre = (results[2] || [])[0] || {};
            memberRules = membre.collection_rules || [];
            memberOverrides = membre.collection_overrides || [];
            trackSerial = !!membre.track_serial_numbers;
            collectionData = results[3] || [];

            // Construire la map billet_id -> données de possession
            collectionMap = {};
            collectionData.forEach(function(c) {
                collectionMap[c.billet_id] = c;
            });

            // Déterminer la plage d'années depuis le catalogue
            var years = allBillets
                .map(function(b) { return parseInt(b.Millesime); })
                .filter(function(y) { return !isNaN(y) && y > 2000; });
            if (years.length > 0) {
                minYear = Math.min.apply(null, years);
                maxYear = Math.max.apply(null, years);
            }

            // Onboarding si aucune règle configurée
            if (!memberRules || memberRules.length === 0) {
                showOnboarding();
            } else {
                renderAll();
            }
        })
        .catch(function(err) {
            console.error('Erreur chargement collection :', err);
            var counter = document.getElementById('collection-counter');
            if (counter) counter.innerHTML = '<span style="color:var(--color-danger);">Erreur de chargement</span>';
        });
    }

    // ============================================================
    // 2. CALCUL DU PÉRIMÈTRE (filtre vivant)
    // ============================================================

    function calculerPerimetre(billets, rules, overrides) {
        var inclus = {};  // billet_id -> true
        if (!rules || rules.length === 0) {
            // Pas de règles = tout le catalogue
            billets.forEach(function(b) { inclus[b.id] = true; });
        } else {
            // Trier les règles par année croissante
            var sorted = rules.slice().sort(function(a, b) { return a.annee - b.annee; });

            billets.forEach(function(b) {
                var annee = parseInt(b.Millesime);
                if (isNaN(annee)) return;

                // Trouver la règle applicable (dernière règle dont l'année <= année du billet)
                var regle = null;
                for (var i = sorted.length - 1; i >= 0; i--) {
                    if (sorted[i].annee <= annee) {
                        regle = sorted[i];
                        break;
                    }
                }

                if (!regle) return; // Billet avant la première règle → hors périmètre

                if (regle.type === 'arret') return; // Collecte arrêtée → hors périmètre

                // Vérifier le pays
                var pays = b.Pays || '';
                if (regle.pays_exclus && regle.pays_exclus.length > 0) {
                    if (regle.pays_exclus.indexOf(pays) !== -1) return; // Pays exclu
                }

                // Vérifier les variantes
                var estVariante = b.HasVariante && b.HasVariante !== 'N';
                if (estVariante && regle.variantes === false) return; // Variantes exclues

                inclus[b.id] = true;
            });
        }

        // Appliquer les overrides (priorité absolue)
        if (overrides && overrides.length > 0) {
            overrides.forEach(function(ov) {
                if (ov.action === 'include') {
                    inclus[ov.billet_id] = true;
                } else if (ov.action === 'exclude') {
                    delete inclus[ov.billet_id];
                }
            });
        }

        return inclus;
    }

    // ============================================================
    // 3. COMPTEUR HÉROS
    // ============================================================

    function renderCounter() {
        var counter = document.getElementById('collection-counter');
        if (!counter) return;

        var perimetre = calculerPerimetre(allBillets, memberRules, memberOverrides);
        var filtered = getFilteredBillets();

        var totalPerimetre = 0;
        var owned = 0;
        filtered.forEach(function(b) {
            if (!perimetre[b.id]) return;
            totalPerimetre++;
            var c = collectionMap[b.id];
            if (c && (c.owned_normal || c.owned_variante)) owned++;
        });

        var pct = totalPerimetre > 0 ? Math.round((owned / totalPerimetre) * 100) : 0;
        var filterLabel = 'billets dans mon périmètre';
        if (filterPays || filterAnnee) {
            var parts = [];
            if (filterPays) parts.push(filterPays);
            if (filterAnnee) parts.push(filterAnnee);
            filterLabel = parts.join(' ') + ' — ' + filterLabel;
        }

        counter.innerHTML =
            '<div class="collection-hero">' +
                '<div class="collection-hero-number">' + owned + ' <span class="collection-hero-sep">/</span> ' + totalPerimetre + '</div>' +
                '<div class="collection-hero-label">' + escapeHtml(filterLabel) + '</div>' +
                '<div class="collection-hero-bar"><div class="collection-hero-fill" style="width:' + pct + '%"></div></div>' +
                '<div class="collection-hero-pct">' + pct + '%</div>' +
            '</div>';
    }

    // ============================================================
    // 4. RÉSUMÉ DU PÉRIMÈTRE
    // ============================================================

    function renderPerimetreSummary() {
        var el = document.getElementById('collection-perimetre-summary');
        if (!el) return;

        if (!memberRules || memberRules.length === 0) {
            el.innerHTML =
                '<div class="collection-no-rules">' +
                    '<i class="fa-solid fa-circle-info"></i> ' +
                    'Aucun périmètre configuré — tous les billets du catalogue sont inclus. ' +
                    '<button class="btn-link" onclick="collToggleParams()">Configurer mon périmètre</button>' +
                '</div>' +
                '<label class="coll-serial-toggle">' +
                '<input type="checkbox"' + (trackSerial ? ' checked' : '') + ' onchange="collToggleSerial(this.checked)">' +
                ' Je souhaite suivre les numéros de série' +
                '</label>';
            return;
        }

        var sorted = memberRules.slice().sort(function(a, b) { return a.annee - b.annee; });
        var html = '<div class="collection-rules-summary">';

        sorted.forEach(function(r) {
            var icon, label, detail;
            if (r.type === 'debut') {
                icon = 'fa-play';
                label = 'Début';
            } else if (r.type === 'changement') {
                icon = 'fa-arrows-rotate';
                label = 'Changement';
            } else {
                icon = 'fa-stop';
                label = 'Arrêt';
            }

            detail = '';
            if (r.type !== 'arret') {
                var nbExclus = (r.pays_exclus || []).length;
                if (nbExclus === 0) {
                    detail += 'Tous les pays';
                } else {
                    detail += (allPays.length - nbExclus) + ' pays';
                }
                detail += r.variantes !== false ? ' · Variantes incluses' : ' · Sans variantes';
            }

            html +=
                '<div class="collection-rule-chip">' +
                    '<i class="fa-solid ' + icon + '"></i> ' +
                    '<strong>' + label + ' ' + r.annee + '</strong>' +
                    (detail ? ' — ' + detail : '') +
                '</div>';
        });

        html += '</div>';

        // Toggle numéros de série
        html += '<label class="coll-serial-toggle">';
        html += '<input type="checkbox"' + (trackSerial ? ' checked' : '') + ' onchange="collToggleSerial(this.checked)">';
        html += ' Je souhaite suivre les numéros de série';
        html += '</label>';

        el.innerHTML = html;
    }

    function collToggleSerial(checked) {
        trackSerial = checked;
        var email = firebase.auth().currentUser.email;
        supabaseFetch('/rest/v1/membres?email=eq.' + encodeURIComponent(email), {
            method: 'PATCH',
            body: JSON.stringify({ track_serial_numbers: checked }),
        }).then(function() {
            renderCollection();
        }).catch(function(err) {
            console.error('Erreur toggle serial:', err);
            trackSerial = !checked;
            renderPerimetreSummary();
        });
    }

    // ============================================================
    // 5. PANEL DE PARAMÉTRAGE — TOGGLE / ANNULER / SAUVEGARDER
    // ============================================================

    function collToggleParams() {
        var panel = document.getElementById('collection-params-panel');
        var btn = document.getElementById('btn-toggle-params');
        if (!panel) return;

        paramsOpen = !paramsOpen;
        panel.style.display = paramsOpen ? '' : 'none';

        if (btn) {
            btn.innerHTML = paramsOpen
                ? '<i class="fa-solid fa-chevron-up"></i> Fermer'
                : '<i class="fa-solid fa-chevron-down"></i> Modifier';
        }

        if (paramsOpen) {
            // Copie de travail
            editRules = JSON.parse(JSON.stringify(memberRules));
            renderFrise();
            renderBreakpoints();
        }
    }

    function collCancelParams() {
        editRules = [];
        paramsOpen = false;
        var panel = document.getElementById('collection-params-panel');
        var btn = document.getElementById('btn-toggle-params');
        if (panel) panel.style.display = 'none';
        if (btn) btn.innerHTML = '<i class="fa-solid fa-chevron-down"></i> Modifier';
    }

    function collSaveParams() {
        var user = firebase.auth().currentUser;
        if (!user) return;

        // Trier par année avant sauvegarde
        editRules.sort(function(a, b) { return a.annee - b.annee; });

        supabaseFetch('/rest/v1/membres?email=eq.' + encodeURIComponent(user.email), {
            method: 'PATCH',
            body: JSON.stringify({ collection_rules: editRules }),
            headers: { 'Prefer': 'return=minimal' }
        })
        .then(function() {
            memberRules = JSON.parse(JSON.stringify(editRules));
            collCancelParams();
            renderPerimetreSummary();
            renderCounter();
            renderCountryCounters();
            renderCollection();
            showToast('Périmètre enregistré');
        })
        .catch(function(err) {
            console.error('Erreur sauvegarde rules :', err);
            showToast('Erreur lors de la sauvegarde', true);
        });
    }

    // ============================================================
    // 6. FRISE TEMPORELLE VISUELLE
    // ============================================================

    function renderFrise() {
        var el = document.getElementById('collection-frise');
        if (!el) return;

        var sorted = editRules.slice().sort(function(a, b) { return a.annee - b.annee; });
        var range = maxYear - minYear;
        if (range <= 0) range = 1;

        var html = '<div class="frise-container">';

        // Barre de fond avec les années
        html += '<div class="frise-bar">';
        for (var y = minYear; y <= maxYear; y++) {
            var left = ((y - minYear) / range) * 100;
            html += '<span class="frise-year-tick" style="left:' + left + '%">' + y + '</span>';
        }

        // Segments colorés entre les breakpoints
        sorted.forEach(function(r, idx) {
            var startPct = ((r.annee - minYear) / range) * 100;
            var endPct = 100;
            if (idx < sorted.length - 1) {
                endPct = ((sorted[idx + 1].annee - minYear) / range) * 100;
            }

            var color;
            if (r.type === 'arret') {
                color = 'var(--color-danger-light, #f8d7da)';
            } else {
                var nbExclus = (r.pays_exclus || []).length;
                color = nbExclus === 0 ? 'var(--color-success-light, #d4edda)' : 'var(--color-warning-light, #fff3cd)';
            }

            html += '<div class="frise-segment" style="left:' + startPct + '%;width:' + (endPct - startPct) + '%;background:' + color + '"></div>';
        });

        // Points de rupture
        sorted.forEach(function(r, idx) {
            var left = ((r.annee - minYear) / range) * 100;
            var icon;
            if (r.type === 'debut') icon = 'fa-play';
            else if (r.type === 'changement') icon = 'fa-arrows-rotate';
            else icon = 'fa-stop';

            html += '<div class="frise-point" style="left:' + left + '%" title="' + r.type + ' ' + r.annee + '">' +
                        '<i class="fa-solid ' + icon + '"></i>' +
                    '</div>';
        });

        html += '</div>'; // .frise-bar
        html += '</div>'; // .frise-container

        el.innerHTML = html;
    }

    // ============================================================
    // 7. LISTE DES BREAKPOINTS (éditable)
    // ============================================================

    function renderBreakpoints() {
        var el = document.getElementById('collection-breakpoints');
        if (!el) return;

        var sorted = editRules.slice().sort(function(a, b) { return a.annee - b.annee; });

        if (sorted.length === 0) {
            el.innerHTML =
                '<div class="collection-no-rules">' +
                    '<i class="fa-solid fa-circle-info"></i> Aucun point de rupture. ' +
                    'Ajoutez-en un pour configurer votre périmètre.' +
                '</div>';
            return;
        }

        var html = '';
        sorted.forEach(function(r, idx) {
            html += renderBreakpointCard(r, idx);
        });

        el.innerHTML = html;
    }

    function renderBreakpointCard(rule, idx) {
        var typeOptions = [
            { value: 'debut', label: 'Début' },
            { value: 'changement', label: 'Changement' },
            { value: 'arret', label: 'Arrêt' }
        ];

        var yearOptions = '';
        for (var y = minYear; y <= maxYear; y++) {
            yearOptions += '<option value="' + y + '"' + (y === rule.annee ? ' selected' : '') + '>' + y + '</option>';
        }

        var typeSelect = '';
        typeOptions.forEach(function(t) {
            typeSelect += '<option value="' + t.value + '"' + (t.value === rule.type ? ' selected' : '') + '>' + t.label + '</option>';
        });

        var isArret = rule.type === 'arret';
        var nbExclus = (rule.pays_exclus || []).length;
        var paysLabel = nbExclus === 0 ? 'Tous les pays' : (allPays.length - nbExclus) + '/' + allPays.length + ' pays';

        var html =
            '<div class="breakpoint-card" data-idx="' + idx + '">' +
                '<div class="breakpoint-card-header">' +
                    '<select class="admin-form-input breakpoint-type" onchange="collUpdateBreakpoint(' + idx + ', \'type\', this.value)">' + typeSelect + '</select>' +
                    '<select class="admin-form-input breakpoint-year" onchange="collUpdateBreakpoint(' + idx + ', \'annee\', parseInt(this.value))">' + yearOptions + '</select>' +
                    '<button class="btn-icon btn-danger-icon" onclick="collRemoveBreakpoint(' + idx + ')" title="Supprimer">' +
                        '<i class="fa-solid fa-trash"></i>' +
                    '</button>' +
                '</div>';

        if (!isArret) {
            html +=
                '<div class="breakpoint-card-body">' +
                    '<div class="breakpoint-option">' +
                        '<label>' +
                            '<input type="checkbox"' + (rule.variantes !== false ? ' checked' : '') +
                            ' onchange="collUpdateBreakpoint(' + idx + ', \'variantes\', this.checked)">' +
                            ' Inclure les variantes' +
                        '</label>' +
                    '</div>' +
                    '<div class="breakpoint-option">' +
                        '<button class="btn-link" onclick="collTogglePaysGrid(' + idx + ')">' +
                            '<i class="fa-solid fa-earth-europe"></i> ' + paysLabel +
                        '</button>' +
                    '</div>' +
                    '<div id="pays-grid-' + idx + '" class="breakpoint-pays-grid" style="display:none">' +
                        renderPaysGrid(rule, idx) +
                    '</div>' +
                '</div>';
        }

        html += '</div>';
        return html;
    }

    function renderPaysGrid(rule, idx) {
        var exclus = rule.pays_exclus || [];
        var html =
            '<div class="breakpoint-pays-actions">' +
                '<button class="btn-link btn-sm" onclick="collPaysSelectAll(' + idx + ')">Tout cocher</button>' +
                '<button class="btn-link btn-sm" onclick="collPaysDeselectAll(' + idx + ')">Tout décocher</button>' +
            '</div>' +
            '<div class="preinsc-country-grid">';

        allPays.forEach(function(pays) {
            var checked = exclus.indexOf(pays) === -1;
            html +=
                '<div class="preinsc-country-item">' +
                    '<label>' +
                        '<input type="checkbox" class="pays-cb-' + idx + '" data-pays="' + pays + '"' +
                        (checked ? ' checked' : '') +
                        ' onchange="collUpdatePays(' + idx + ', \'' + pays.replace(/'/g, "\\'") + '\', this.checked)">' +
                        ' ' + pays +
                    '</label>' +
                '</div>';
        });

        html += '</div>';
        return html;
    }

    // ============================================================
    // 8. ACTIONS SUR LES BREAKPOINTS
    // ============================================================

    window.collUpdateBreakpoint = function(idx, field, value) {
        var sorted = editRules.slice().sort(function(a, b) { return a.annee - b.annee; });
        var rule = sorted[idx];
        if (!rule) return;

        // Retrouver l'index réel dans editRules
        var realIdx = editRules.indexOf(rule);
        if (realIdx === -1) return;

        editRules[realIdx][field] = value;

        // Si on passe en "arret", nettoyer les champs inutiles
        if (field === 'type' && value === 'arret') {
            delete editRules[realIdx].pays_exclus;
            delete editRules[realIdx].variantes;
        } else if (field === 'type' && value !== 'arret') {
            if (editRules[realIdx].variantes === undefined) editRules[realIdx].variantes = true;
            if (!editRules[realIdx].pays_exclus) editRules[realIdx].pays_exclus = [];
        }

        renderFrise();
        renderBreakpoints();
    };

    window.collUpdatePays = function(idx, pays, checked) {
        var sorted = editRules.slice().sort(function(a, b) { return a.annee - b.annee; });
        var rule = sorted[idx];
        if (!rule) return;

        var realIdx = editRules.indexOf(rule);
        if (realIdx === -1) return;

        if (!editRules[realIdx].pays_exclus) editRules[realIdx].pays_exclus = [];

        if (checked) {
            // Retirer de la liste des exclus
            editRules[realIdx].pays_exclus = editRules[realIdx].pays_exclus.filter(function(p) { return p !== pays; });
        } else {
            // Ajouter aux exclus
            if (editRules[realIdx].pays_exclus.indexOf(pays) === -1) {
                editRules[realIdx].pays_exclus.push(pays);
            }
        }

        // Mettre à jour le label du bouton pays sans tout re-rendre
        var btn = document.querySelector('.breakpoint-card[data-idx="' + idx + '"] .breakpoint-option .btn-link');
        if (btn) {
            var nbExclus = editRules[realIdx].pays_exclus.length;
            var paysLabel = nbExclus === 0 ? 'Tous les pays' : (allPays.length - nbExclus) + '/' + allPays.length + ' pays';
            btn.innerHTML = '<i class="fa-solid fa-earth-europe"></i> ' + paysLabel;
        }

        renderFrise();
    };

    window.collPaysSelectAll = function(idx) {
        var sorted = editRules.slice().sort(function(a, b) { return a.annee - b.annee; });
        var rule = sorted[idx];
        if (!rule) return;
        var realIdx = editRules.indexOf(rule);
        if (realIdx === -1) return;

        editRules[realIdx].pays_exclus = [];
        renderFrise();
        renderBreakpoints();
    };

    window.collPaysDeselectAll = function(idx) {
        var sorted = editRules.slice().sort(function(a, b) { return a.annee - b.annee; });
        var rule = sorted[idx];
        if (!rule) return;
        var realIdx = editRules.indexOf(rule);
        if (realIdx === -1) return;

        editRules[realIdx].pays_exclus = allPays.slice();
        renderFrise();
        renderBreakpoints();
    };

    function collAddBreakpoint() {
        // Année par défaut : année suivant le dernier breakpoint, ou minYear
        var defaultYear = minYear;
        if (editRules.length > 0) {
            var maxRuleYear = Math.max.apply(null, editRules.map(function(r) { return r.annee; }));
            defaultYear = Math.min(maxRuleYear + 1, maxYear);
        }

        var type = editRules.length === 0 ? 'debut' : 'changement';

        editRules.push({
            type: type,
            annee: defaultYear,
            pays_exclus: [],
            variantes: true
        });

        renderFrise();
        renderBreakpoints();
    }

    function collRemoveBreakpoint(idx) {
        var sorted = editRules.slice().sort(function(a, b) { return a.annee - b.annee; });
        var rule = sorted[idx];
        if (!rule) return;
        var realIdx = editRules.indexOf(rule);
        if (realIdx === -1) return;

        editRules.splice(realIdx, 1);
        renderFrise();
        renderBreakpoints();
    }

    function collTogglePaysGrid(idx) {
        var grid = document.getElementById('pays-grid-' + idx);
        if (!grid) return;
        grid.style.display = grid.style.display === 'none' ? '' : 'none';
    }

    // ============================================================
    // 9. COMPTEURS HIÉRARCHIQUES (Story 7-2)
    // ============================================================

    function renderCountryCounters() {
        var el = document.getElementById('collection-country-counters');
        if (!el) return;

        var perimetre = calculerPerimetre(allBillets, memberRules, memberOverrides);

        // Calculer stats par pays ET par année (sur le sous-ensemble filtré)
        var paysStats = {};
        var anneeStats = {};
        var filtered = getFilteredBillets();
        filtered.forEach(function(b) {
            if (!perimetre[b.id]) return;
            var pays = b.Pays || 'Inconnu';
            var annee = (b.Millesime || 'Inconnu').toString();
            var isOwned = false;
            var c = collectionMap[b.id];
            if (c && (c.owned_normal || c.owned_variante)) isOwned = true;

            if (!paysStats[pays]) paysStats[pays] = { total: 0, owned: 0 };
            paysStats[pays].total++;
            if (isOwned) paysStats[pays].owned++;

            if (!anneeStats[annee]) anneeStats[annee] = { total: 0, owned: 0 };
            anneeStats[annee].total++;
            if (isOwned) anneeStats[annee].owned++;
        });

        // Trier par progression décroissante puis par nom/année
        var paysList = sortStatKeys(paysStats, 'alpha');
        var anneeList = sortStatKeys(anneeStats, 'num');

        if (paysList.length === 0 && anneeList.length === 0) {
            el.innerHTML = '';
            return;
        }

        var html = '<details class="collection-counters-details">';
        html += '<summary><i class="fa-solid fa-chart-bar"></i> Détail par ' + (currentGroupBy === 'annee' ? 'année' : currentGroupBy === 'combo' ? 'pays × année' : 'pays') + '</summary>';

        // Onglets de vue
        html += '<div class="counters-view-tabs">';
        html += '<button class="counters-tab' + (currentGroupBy === 'pays' ? ' active' : '') + '" onclick="collGroupBy(\'pays\')"><i class="fa-solid fa-earth-europe"></i> Par pays</button>';
        html += '<button class="counters-tab' + (currentGroupBy === 'annee' ? ' active' : '') + '" onclick="collGroupBy(\'annee\')"><i class="fa-solid fa-calendar"></i> Par année</button>';
        html += '<button class="counters-tab' + (currentGroupBy === 'combo' ? ' active' : '') + '" onclick="collGroupBy(\'combo\')"><i class="fa-solid fa-table-cells"></i> Combo</button>';
        html += '</div>';

        if (currentGroupBy === 'pays') {
            html += renderCounterGrid(paysList, paysStats);
        } else if (currentGroupBy === 'annee') {
            html += renderCounterGrid(anneeList, anneeStats);
        } else {
            html += renderComboCounters(perimetre);
        }

        html += '</details>';
        el.innerHTML = html;
    }

    function sortStatKeys(stats, mode) {
        return Object.keys(stats).sort(function(a, b) {
            var pctA = stats[a].total > 0 ? stats[a].owned / stats[a].total : 0;
            var pctB = stats[b].total > 0 ? stats[b].owned / stats[b].total : 0;
            if (pctB !== pctA) return pctB - pctA;
            if (mode === 'num') return parseInt(a) - parseInt(b);
            return a.localeCompare(b);
        });
    }

    function renderCounterGrid(keys, stats) {
        var html = '<div class="collection-counters-grid">';
        keys.forEach(function(key) {
            var s = stats[key];
            var pct = s.total > 0 ? Math.round((s.owned / s.total) * 100) : 0;
            html +=
                '<div class="country-counter-item">' +
                    '<div class="country-counter-label">' + escapeHtml(key) + '</div>' +
                    '<div class="country-counter-bar"><div class="country-counter-fill" style="width:' + pct + '%"></div></div>' +
                    '<div class="country-counter-value">' + s.owned + '/' + s.total + '</div>' +
                '</div>';
        });
        html += '</div>';
        return html;
    }

    function renderComboCounters(perimetre) {
        // Matrice pays × année
        var combo = {};  // "pays|annee" -> { total, owned }
        var anneesSet = {};
        var paysSet = {};

        allBillets.forEach(function(b) {
            if (!perimetre[b.id]) return;
            var pays = b.Pays || 'Inconnu';
            var annee = (b.Millesime || '?').toString();
            var key = pays + '|' + annee;
            paysSet[pays] = true;
            anneesSet[annee] = true;

            if (!combo[key]) combo[key] = { total: 0, owned: 0 };
            combo[key].total++;
            var c = collectionMap[b.id];
            if (c && (c.owned_normal || c.owned_variante)) combo[key].owned++;
        });

        var annees = Object.keys(anneesSet).sort(function(a, b) { return parseInt(a) - parseInt(b); });
        var pays = Object.keys(paysSet).sort();

        var html = '<div class="combo-table-wrapper"><table class="combo-table">';
        html += '<thead><tr><th></th>';
        annees.forEach(function(a) { html += '<th>' + a + '</th>'; });
        html += '</tr></thead><tbody>';

        pays.forEach(function(p) {
            html += '<tr><td class="combo-pays-cell">' + escapeHtml(p) + '</td>';
            annees.forEach(function(a) {
                var s = combo[p + '|' + a];
                if (s) {
                    var pct = s.total > 0 ? Math.round((s.owned / s.total) * 100) : 0;
                    var cls = pct === 100 ? 'combo-full' : pct > 0 ? 'combo-partial' : 'combo-empty';
                    html += '<td class="combo-cell ' + cls + '" title="' + escapeAttr(p) + ' ' + a + ' — ' + s.owned + '/' + s.total + '">' + s.owned + '/' + s.total + '</td>';
                } else {
                    html += '<td class="combo-cell combo-na">—</td>';
                }
            });
            html += '</tr>';
        });

        html += '</tbody></table></div>';
        return html;
    }

    function collGroupBy(mode) {
        currentGroupBy = mode;
        renderCountryCounters();
        renderCollection();
    }

    // ============================================================
    // 10. RECHERCHE ET FILTRES (Story 7-4)
    // ============================================================

    var searchTimer = null;

    function collSearch() {
        if (searchTimer) clearTimeout(searchTimer);
        searchTimer = setTimeout(function() {
            var input = document.getElementById('coll-search');
            searchQuery = input ? input.value.trim().toLowerCase() : '';
            renderCollection();
        }, 300);
    }

    function collFilter(filter) {
        currentFilter = filter;
        var btns = document.querySelectorAll('.coll-filter-btn');
        btns.forEach(function(btn) {
            btn.classList.toggle('active', btn.getAttribute('data-filter') === filter);
        });
        renderCounter();
        renderCountryCounters();
        renderCollection();
    }

    function collFilterPays() {
        var sel = document.getElementById('coll-filter-pays');
        filterPays = sel ? sel.value : '';
        renderCounter();
        renderCountryCounters();
        renderCollection();
    }

    function collFilterAnnee() {
        var sel = document.getElementById('coll-filter-annee');
        filterAnnee = sel ? sel.value : '';
        renderCounter();
        renderCountryCounters();
        renderCollection();
    }

    function populateFilterDropdowns() {
        var perimetre = calculerPerimetre(allBillets, memberRules, memberOverrides);

        var paysSet = {};
        var anneeSet = {};
        allBillets.forEach(function(b) {
            if (!perimetre[b.id]) return;
            if (b.Pays) paysSet[b.Pays] = true;
            if (b.Millesime) anneeSet[b.Millesime.toString()] = true;
        });

        var paysList = Object.keys(paysSet).sort();
        var anneeList = Object.keys(anneeSet).sort(function(a, b) { return parseInt(a) - parseInt(b); });

        var selPays = document.getElementById('coll-filter-pays');
        if (selPays) {
            var hP = '<option value="">Tous les pays</option>';
            paysList.forEach(function(p) {
                hP += '<option value="' + escapeAttr(p) + '"' + (p === filterPays ? ' selected' : '') + '>' + escapeHtml(p) + '</option>';
            });
            selPays.innerHTML = hP;
        }

        var selAnnee = document.getElementById('coll-filter-annee');
        if (selAnnee) {
            var hA = '<option value="">Toutes les années</option>';
            anneeList.forEach(function(a) {
                hA += '<option value="' + a + '"' + (a === filterAnnee ? ' selected' : '') + '>' + a + '</option>';
            });
            selAnnee.innerHTML = hA;
        }
    }

    // Helper : billets filtrés par pays/année (utilisé par compteurs et grille)
    function getFilteredBillets() {
        return allBillets.filter(function(b) {
            if (filterPays && b.Pays !== filterPays) return false;
            if (filterAnnee && (b.Millesime || '').toString() !== filterAnnee) return false;
            return true;
        });
    }

    // ============================================================
    // 11. AFFICHAGE COLLECTION — 3 NIVEAUX (Story 7-1)
    // ============================================================

    function renderCollection() {
        var el = document.getElementById('collection-content');
        if (!el) return;

        var perimetre = calculerPerimetre(allBillets, memberRules, memberOverrides);

        // Construire la map des overrides pour accès rapide
        var overrideMap = {};
        memberOverrides.forEach(function(ov) {
            overrideMap[ov.billet_id] = ov.action;
        });

        // Filtrer et catégoriser les billets
        var billetsFiltres = [];
        var billetsSource = getFilteredBillets();

        billetsSource.forEach(function(b) {
            var inScope = !!perimetre[b.id];
            var c = collectionMap[b.id];
            var isOwned = c && (c.owned_normal || c.owned_variante);

            // Filtre par onglet
            if (currentFilter === 'all' && !inScope) return;
            if (currentFilter === 'owned' && !isOwned) return;
            if (currentFilter === 'missing' && (!inScope || isOwned)) return;
            if (currentFilter === 'outofscope' && inScope) return;

            // Filtre par recherche
            if (searchQuery) {
                var ref = (b.Reference || '').toLowerCase();
                var nom = (b.NomBillet || '').toLowerCase();
                var pays = (b.Pays || '').toLowerCase();
                var millesime = (b.Millesime || '').toString();
                if (ref.indexOf(searchQuery) === -1 &&
                    nom.indexOf(searchQuery) === -1 &&
                    pays.indexOf(searchQuery) === -1 &&
                    millesime.indexOf(searchQuery) === -1) {
                    return;
                }
            }

            billetsFiltres.push({
                billet: b,
                inScope: inScope,
                isOwned: isOwned,
                collData: c || null,
                override: overrideMap[b.id] || null
            });
        });

        if (billetsFiltres.length === 0) {
            el.innerHTML = '<div class="collection-empty"><i class="fa-solid fa-box-open"></i> Aucun billet à afficher.</div>';
            return;
        }

        // Grouper selon le mode choisi
        var grouped = {};
        billetsFiltres.forEach(function(item) {
            var key;
            if (currentGroupBy === 'annee') {
                key = (item.billet.Millesime || 'Inconnu').toString();
            } else if (currentGroupBy === 'combo') {
                key = (item.billet.Pays || 'Inconnu') + ' — ' + (item.billet.Millesime || '?');
            } else {
                key = item.billet.Pays || 'Inconnu';
            }
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push(item);
        });

        var groupKeys = Object.keys(grouped).sort(function(a, b) {
            if (currentGroupBy === 'annee') return parseInt(a) - parseInt(b);
            if (currentGroupBy === 'combo') {
                // Trier par pays puis année
                var pa = a.split(' — '), pb = b.split(' — ');
                if (pa[0] !== pb[0]) return pa[0].localeCompare(pb[0]);
                return parseInt(pa[1]) - parseInt(pb[1]);
            }
            return a.localeCompare(b);
        });

        var html = '';
        groupKeys.forEach(function(key) {
            var items = grouped[key];
            // Trier par millésime, pays, dep (France), référence, version
            items.sort(function(a, b) {
                var yA = parseInt(a.billet.Millesime) || 0;
                var yB = parseInt(b.billet.Millesime) || 0;
                if (yA !== yB) return yA - yB;
                var pA = (a.billet.Pays || ''), pB = (b.billet.Pays || '');
                if (pA !== pB) return pA.localeCompare(pB);
                var dA = (a.billet.Dep || ''), dB = (b.billet.Dep || '');
                if (dA !== dB) return dA.localeCompare(dB);
                var rA = (a.billet.Reference || ''), rB = (b.billet.Reference || '');
                if (rA !== rB) return rA.localeCompare(rB);
                return (a.billet.Version || '').localeCompare(b.billet.Version || '');
            });

            var ownedCount = items.filter(function(i) { return i.isOwned; }).length;

            html += '<div class="coll-country-group">';
            html += '<div class="coll-country-header">';
            html += '<h3>' + escapeHtml(key) + '</h3>';
            html += '<span class="coll-country-badge">' + ownedCount + ' / ' + items.length + '</span>';
            html += '</div>';
            html += '<div class="coll-billets-grid">';

            items.forEach(function(item) {
                html += renderBilletCard(item);
            });

            html += '</div></div>';
        });

        el.innerHTML = html;
    }

    function renderBilletCard(item) {
        var b = item.billet;
        var c = item.collData;
        var hasVariante = b.HasVariante && b.HasVariante !== 'N';

        var cssClass = 'coll-billet-card coll-billet-clickable';
        if (!item.inScope) {
            cssClass += ' coll-out-of-scope';
        } else if (item.isOwned) {
            cssClass += ' coll-owned';
        } else {
            cssClass += ' coll-missing';
        }

        var html = '<div class="' + cssClass + '" data-billet-id="' + b.id + '">';

        // Zone cliquable pour ouvrir la modale (en-tête + nom)
        html += '<div class="coll-billet-clickzone" onclick="collShowBillet(' + b.id + ')">';

        // En-tête : dep + référence + année-version
        html += '<div class="coll-billet-header">';
        if (b.Dep) {
            html += '<span class="coll-billet-dep">' + escapeHtml(b.Dep) + '</span>';
        }
        html += '<span class="coll-billet-ref">' + escapeHtml(b.Reference || '') + '</span>';
        html += '<span class="coll-billet-year">' + escapeHtml((b.Millesime || '') + (b.Version ? '-' + b.Version : '')) + '</span>';
        html += '</div>';

        // Nom
        html += '<div class="coll-billet-name">' + escapeHtml(b.NomBillet || '') + '</div>';

        // Variante info
        if (hasVariante) {
            html += '<div class="coll-billet-variante"><i class="fa-solid fa-star"></i> ' + escapeHtml(b.HasVariante) + '</div>';
        }

        html += '</div>'; // fin .coll-billet-clickzone

        // Override badge
        if (item.override === 'include') {
            html += '<div class="coll-override-badge coll-override-include" title="Ajouté manuellement"><i class="fa-solid fa-thumbtack"></i> Inclus</div>';
        } else if (item.override === 'exclude') {
            html += '<div class="coll-override-badge coll-override-exclude" title="Exclu manuellement"><i class="fa-solid fa-ban"></i> Exclu</div>';
        }

        // Checkboxes de possession (Story 7-3)
        html += '<div class="coll-billet-possession">';

        var ownedNormal = c && c.owned_normal;
        var ownedVariante = c && c.owned_variante;

        html += '<label class="coll-own-cb">';
        html += '<input type="checkbox"' + (ownedNormal ? ' checked' : '') + ' onchange="collToggleOwned(' + b.id + ', \'owned_normal\', this.checked)">';
        html += ' Normal';
        html += '</label>';

        if (hasVariante) {
            html += '<label class="coll-own-cb">';
            html += '<input type="checkbox"' + (ownedVariante ? ' checked' : '') + ' onchange="collToggleOwned(' + b.id + ', \'owned_variante\', this.checked)">';
            html += ' ' + escapeHtml(b.HasVariante);
            html += '</label>';
        }

        html += '</div>';

        // Numéros de série (si activé)
        if (trackSerial) {
            var serialNormal = (c && c.serial_normal) || '';
            var serialVariante = (c && c.serial_variante) || '';

            html += '<div class="coll-billet-serial">';
            html += '<input type="text" class="coll-serial-input" placeholder="N° série" value="' + escapeAttr(serialNormal) + '" onchange="collUpdateSerial(' + b.id + ', \'serial_normal\', this.value)">';
            if (hasVariante) {
                html += '<input type="text" class="coll-serial-input" placeholder="N° série var." value="' + escapeAttr(serialVariante) + '" onchange="collUpdateSerial(' + b.id + ', \'serial_variante\', this.value)">';
            }
            html += '</div>';
        }

        // Actions forçage uniquement dans la modale (clic sur carte)

        html += '</div>';
        return html;
    }

    // ============================================================
    // 12. SAISIE DE POSSESSION (Story 7-3)
    // ============================================================

    function collToggleOwned(billetId, field, checked) {
        var user = firebase.auth().currentUser;
        if (!user) return;

        var existing = collectionMap[billetId];

        // Mise à jour optimiste : on met à jour collectionMap AVANT l'appel async
        if (existing) {
            var oldValue = existing[field];
            existing[field] = checked;

            // Re-render immédiat (UI réactive)
            renderCounter();
            renderCountryCounters();
            renderCollection();

            var patch = {};
            patch[field] = checked;
            supabaseFetch('/rest/v1/collection?membre_email=eq.' + encodeURIComponent(user.email) + '&billet_id=eq.' + billetId, {
                method: 'PATCH',
                body: JSON.stringify(patch),
                headers: { 'Prefer': 'return=minimal' }
            })
            .catch(function(err) {
                // Revert en cas d'erreur
                existing[field] = oldValue;
                renderCounter();
                renderCountryCounters();
                renderCollection();
                console.error('Erreur mise à jour possession :', err);
                showToast('Erreur', true);
            });
        } else {
            var row = {
                membre_email: user.email,
                billet_id: billetId,
                owned_normal: false,
                owned_variante: false,
                serial_normal: '',
                serial_variante: '',
                nb_doubles: 0
            };
            row[field] = checked;

            // Mise à jour optimiste
            collectionMap[billetId] = row;
            collectionData.push(row);
            renderCounter();
            renderCountryCounters();
            renderCollection();

            supabaseFetch('/rest/v1/collection', {
                method: 'POST',
                body: JSON.stringify(row),
                headers: { 'Prefer': 'return=minimal' }
            })
            .catch(function(err) {
                // Revert en cas d'erreur
                delete collectionMap[billetId];
                collectionData.pop();
                renderCounter();
                renderCountryCounters();
                renderCollection();
                console.error('Erreur insertion possession :', err);
                showToast('Erreur', true);
            });
        }
    }

    window.collUpdateSerial = function(billetId, field, value) {
        var user = firebase.auth().currentUser;
        if (!user) return;

        var existing = collectionMap[billetId];

        if (existing) {
            var patch = {};
            patch[field] = value;
            supabaseFetch('/rest/v1/collection?membre_email=eq.' + encodeURIComponent(user.email) + '&billet_id=eq.' + billetId, {
                method: 'PATCH',
                body: JSON.stringify(patch),
                headers: { 'Prefer': 'return=minimal' }
            })
            .then(function() {
                existing[field] = value;
            })
            .catch(function(err) {
                console.error('Erreur mise à jour série :', err);
                showToast('Erreur', true);
            });
        } else {
            // Créer la ligne avec le numéro de série
            var row = {
                membre_email: user.email,
                billet_id: billetId,
                owned_normal: false,
                owned_variante: false,
                serial_normal: '',
                serial_variante: '',
                nb_doubles: 0
            };
            row[field] = value;

            supabaseFetch('/rest/v1/collection', {
                method: 'POST',
                body: JSON.stringify(row),
                headers: { 'Prefer': 'return=minimal' }
            })
            .then(function() {
                collectionMap[billetId] = row;
                collectionData.push(row);
            })
            .catch(function(err) {
                console.error('Erreur insertion série :', err);
                showToast('Erreur', true);
            });
        }
    };

    // ============================================================
    // 13. FORÇAGE INCLUSION / EXCLUSION (Story 6-4)
    // ============================================================

    function saveOverrides() {
        var user = firebase.auth().currentUser;
        if (!user) return Promise.reject(new Error('Non connecté'));

        return supabaseFetch('/rest/v1/membres?email=eq.' + encodeURIComponent(user.email), {
            method: 'PATCH',
            body: JSON.stringify({ collection_overrides: memberOverrides }),
            headers: { 'Prefer': 'return=minimal' }
        });
    }

    function collForceInclude(billetId) {
        // Retirer un éventuel override existant
        memberOverrides = memberOverrides.filter(function(ov) { return ov.billet_id !== billetId; });
        memberOverrides.push({ billet_id: billetId, action: 'include' });

        saveOverrides()
            .then(function() {
                showToast('Billet inclus manuellement');
                renderCounter();
                renderCountryCounters();
                renderCollection();
            })
            .catch(function(err) {
                console.error('Erreur forçage include :', err);
                showToast('Erreur', true);
            });
    }

    function collForceExclude(billetId) {
        memberOverrides = memberOverrides.filter(function(ov) { return ov.billet_id !== billetId; });
        memberOverrides.push({ billet_id: billetId, action: 'exclude' });

        saveOverrides()
            .then(function() {
                showToast('Billet exclu manuellement');
                renderCounter();
                renderCountryCounters();
                renderCollection();
            })
            .catch(function(err) {
                console.error('Erreur forçage exclude :', err);
                showToast('Erreur', true);
            });
    }

    function collRemoveOverride(billetId) {
        memberOverrides = memberOverrides.filter(function(ov) { return ov.billet_id !== billetId; });

        saveOverrides()
            .then(function() {
                showToast('Forçage retiré');
                renderCounter();
                renderCountryCounters();
                renderCollection();
            })
            .catch(function(err) {
                console.error('Erreur retrait override :', err);
                showToast('Erreur', true);
            });
    }

    // ============================================================
    // 14. RENDER ALL (helper)
    // ============================================================

    function renderAll() {
        populateFilterDropdowns();
        renderPerimetreSummary();
        renderCounter();
        renderCountryCounters();
        renderCollection();
    }

    // ============================================================
    // 15. ONBOARDING GUIDÉ 3 ÉTAPES (Story 7-5)
    // ============================================================

    var onboardingStep = 1;
    var onboardingData = { annee: 2015, pays_exclus: [], variantes: true };

    function showOnboarding() {
        // Masquer les sections normales
        var sections = document.querySelectorAll('.collection-section, .collection-toolbar, #collection-country-counters, #collection-content');
        sections.forEach(function(el) { el.style.display = 'none'; });

        // Masquer le compteur héros
        var counter = document.getElementById('collection-counter');
        if (counter) counter.innerHTML = '';

        onboardingStep = 1;
        onboardingData = { annee: minYear, pays_exclus: [], variantes: true };

        renderOnboardingStep();
    }

    function hideOnboarding() {
        var overlay = document.getElementById('onboarding-overlay');
        if (overlay) overlay.remove();

        // Réafficher les sections normales
        var sections = document.querySelectorAll('.collection-section, .collection-toolbar, #collection-country-counters, #collection-content');
        sections.forEach(function(el) { el.style.display = ''; });
    }

    function renderOnboardingStep() {
        var overlay = document.getElementById('onboarding-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'onboarding-overlay';
            overlay.className = 'onboarding-overlay';
            var page = document.querySelector('.collection-page');
            if (page) {
                // Insérer après le header
                var header = page.querySelector('.collection-header');
                if (header && header.nextSibling) {
                    page.insertBefore(overlay, header.nextSibling);
                } else {
                    page.appendChild(overlay);
                }
            }
        }

        var html = '<div class="onboarding-card">';

        // Progress dots
        html += '<div class="onboarding-progress">';
        for (var i = 1; i <= 3; i++) {
            html += '<span class="onboarding-dot' + (i === onboardingStep ? ' active' : '') + (i < onboardingStep ? ' done' : '') + '">' + i + '</span>';
        }
        html += '</div>';

        if (onboardingStep === 1) {
            // Étape 1 : Année de début
            html += '<h2>Depuis quand collectionnez-vous ?</h2>';
            html += '<p class="onboarding-desc">Indiquez l\'année à partir de laquelle vous avez commencé votre collection de billets touristiques.</p>';

            html += '<div class="onboarding-year-picker">';
            html += '<select id="onboarding-year" class="admin-form-input onboarding-select" onchange="onboardingData.annee=parseInt(this.value)">';
            for (var y = minYear; y <= maxYear; y++) {
                html += '<option value="' + y + '"' + (y === onboardingData.annee ? ' selected' : '') + '>' + y + '</option>';
            }
            html += '</select>';
            html += '</div>';

        } else if (onboardingStep === 2) {
            // Étape 2 : Pays
            html += '<h2>Quels pays collectionnez-vous ?</h2>';
            html += '<p class="onboarding-desc">Par défaut tous les pays sont cochés. Décochez ceux que vous ne collectionnez pas.</p>';

            html += '<div class="onboarding-pays-actions">';
            html += '<button class="btn-link btn-sm" onclick="onboardingPaysAll(true)">Tout cocher</button>';
            html += '<button class="btn-link btn-sm" onclick="onboardingPaysAll(false)">Tout décocher</button>';
            html += '</div>';

            html += '<div class="preinsc-country-grid">';
            allPays.forEach(function(pays) {
                var checked = onboardingData.pays_exclus.indexOf(pays) === -1;
                html += '<div class="preinsc-country-item">';
                html += '<label>';
                html += '<input type="checkbox" class="onboarding-pays-cb" data-pays="' + escapeAttr(pays) + '"' + (checked ? ' checked' : '') + ' onchange="onboardingTogglePays(\'' + pays.replace(/'/g, "\\'") + '\', this.checked)">';
                html += ' ' + escapeHtml(pays);
                html += '</label>';
                html += '</div>';
            });
            html += '</div>';

        } else if (onboardingStep === 3) {
            // Étape 3 : Variantes
            html += '<h2>Les variantes aussi ?</h2>';
            html += '<p class="onboarding-desc">Certains billets existent en version spéciale (anniversary, doré...). Voulez-vous les inclure dans votre collection ?</p>';

            html += '<div class="onboarding-variantes">';
            html += '<label class="onboarding-radio"><input type="radio" name="onb-var" value="true"' + (onboardingData.variantes ? ' checked' : '') + ' onchange="onboardingData.variantes=true"> Oui, inclure les variantes</label>';
            html += '<label class="onboarding-radio"><input type="radio" name="onb-var" value="false"' + (!onboardingData.variantes ? ' checked' : '') + ' onchange="onboardingData.variantes=false"> Non, seulement les billets normaux</label>';
            html += '</div>';

            // Résumé
            var nbPays = allPays.length - onboardingData.pays_exclus.length;
            html += '<div class="onboarding-summary">';
            html += '<i class="fa-solid fa-check-circle"></i> ';
            html += 'Depuis <strong>' + onboardingData.annee + '</strong>, ';
            html += '<strong>' + nbPays + '</strong> pays';
            html += onboardingData.variantes ? ', variantes incluses' : ', sans variantes';
            html += '</div>';
        }

        // Navigation
        html += '<div class="onboarding-nav">';
        html += '<button class="btn-link" onclick="onboardingSkip()">Passer</button>';
        html += '<div class="onboarding-nav-right">';
        if (onboardingStep > 1) {
            html += '<button class="btn-secondary" onclick="onboardingPrev()"><i class="fa-solid fa-arrow-left"></i> Retour</button>';
        }
        if (onboardingStep < 3) {
            html += '<button class="btn-primary" onclick="onboardingNext()">Suivant <i class="fa-solid fa-arrow-right"></i></button>';
        } else {
            html += '<button class="btn-primary" onclick="onboardingFinish()"><i class="fa-solid fa-check"></i> Commencer</button>';
        }
        html += '</div>';
        html += '</div>';

        html += '</div>';
        overlay.innerHTML = html;
    }

    function onboardingNext() {
        // Lire la valeur depuis le select (étape 1)
        if (onboardingStep === 1) {
            var sel = document.getElementById('onboarding-year');
            if (sel) onboardingData.annee = parseInt(sel.value);
        }
        if (onboardingStep < 3) {
            onboardingStep++;
            renderOnboardingStep();
        }
    }

    function onboardingPrev() {
        if (onboardingStep > 1) {
            onboardingStep--;
            renderOnboardingStep();
        }
    }

    function onboardingSkip() {
        // Tout par défaut = pas de règles = tout le catalogue
        memberRules = [];
        hideOnboarding();
        renderAll();
    }

    function onboardingFinish() {
        var rule = {
            type: 'debut',
            annee: onboardingData.annee,
            pays_exclus: onboardingData.pays_exclus.slice(),
            variantes: onboardingData.variantes
        };

        memberRules = [rule];

        var user = firebase.auth().currentUser;
        if (!user) return;

        supabaseFetch('/rest/v1/membres?email=eq.' + encodeURIComponent(user.email), {
            method: 'PATCH',
            body: JSON.stringify({ collection_rules: memberRules }),
            headers: { 'Prefer': 'return=minimal' }
        })
        .then(function() {
            hideOnboarding();
            renderAll();
            showToast('Périmètre configuré ! Vous pouvez maintenant saisir vos billets.');
        })
        .catch(function(err) {
            console.error('Erreur sauvegarde onboarding :', err);
            showToast('Erreur lors de la sauvegarde', true);
        });
    }

    window.onboardingTogglePays = function(pays, checked) {
        if (checked) {
            onboardingData.pays_exclus = onboardingData.pays_exclus.filter(function(p) { return p !== pays; });
        } else {
            if (onboardingData.pays_exclus.indexOf(pays) === -1) {
                onboardingData.pays_exclus.push(pays);
            }
        }
    };

    window.onboardingPaysAll = function(selectAll) {
        onboardingData.pays_exclus = selectAll ? [] : allPays.slice();
        renderOnboardingStep();
    };

    // ============================================================
    // 16. MODALE VISUALISATION BILLET
    // ============================================================

    function collShowBillet(billetId) {
        var billet = null;
        for (var i = 0; i < allBillets.length; i++) {
            if (allBillets[i].id === billetId) { billet = allBillets[i]; break; }
        }
        if (!billet) return;

        var c = collectionMap[billetId] || null;
        var hasVariante = billet.HasVariante && billet.HasVariante !== 'N';
        var ownedNormal = c && c.owned_normal;
        var ownedVariante = c && c.owned_variante;
        var imgUrl = resolveImageUrl(billet, 800);

        // Override actuel
        var overrideAction = null;
        memberOverrides.forEach(function(ov) {
            if (ov.billet_id === billetId) overrideAction = ov.action;
        });

        var perimetre = calculerPerimetre(allBillets, memberRules, memberOverrides);
        var inScope = !!perimetre[billetId];

        var html = '<div class="coll-modal-overlay" onclick="collCloseModal()">';
        html += '<div class="coll-modal-card" onclick="event.stopPropagation()">';

        // Bouton fermer
        html += '<button class="coll-modal-close" onclick="collCloseModal()"><i class="fa-solid fa-xmark"></i></button>';

        // Image
        if (imgUrl) {
            html += '<div class="coll-modal-img"><img src="' + escapeAttr(imgUrl) + '" alt="' + escapeAttr(billet.NomBillet || '') + '"></div>';
        }

        // Infos
        html += '<div class="coll-modal-infos">';
        html += '<div class="coll-modal-ref">' + escapeHtml(billet.Reference || '') + '</div>';
        html += '<h2 class="coll-modal-name">' + escapeHtml(billet.NomBillet || '') + '</h2>';
        html += '<div class="coll-modal-meta">';
        html += '<span><i class="fa-solid fa-earth-europe"></i> ' + escapeHtml(billet.Pays || '') + '</span>';
        html += '<span><i class="fa-solid fa-calendar"></i> ' + escapeHtml((billet.Millesime || '') + (billet.Version ? '-' + billet.Version : '')) + '</span>';
        if (hasVariante) {
            html += '<span><i class="fa-solid fa-star"></i> ' + escapeHtml(billet.HasVariante) + '</span>';
        }
        html += '</div>';

        // Possession
        html += '<div class="coll-modal-possession">';
        html += '<h3>Possession</h3>';
        html += '<label class="coll-own-cb"><input type="checkbox"' + (ownedNormal ? ' checked' : '') + ' onchange="collToggleOwned(' + billetId + ', \'owned_normal\', this.checked); collRefreshModal(' + billetId + ')"> Normal</label>';
        if (hasVariante) {
            html += '<label class="coll-own-cb"><input type="checkbox"' + (ownedVariante ? ' checked' : '') + ' onchange="collToggleOwned(' + billetId + ', \'owned_variante\', this.checked); collRefreshModal(' + billetId + ')"> ' + escapeHtml(billet.HasVariante) + '</label>';
        }

        // Numéros de série
        if (trackSerial) {
            var serialNormal = (c && c.serial_normal) || '';
            var serialVariante = (c && c.serial_variante) || '';
            html += '<div class="coll-modal-serial">';
            html += '<input type="text" class="coll-serial-input" placeholder="N° série normal" value="' + escapeAttr(serialNormal) + '" onchange="collUpdateSerial(' + billetId + ', \'serial_normal\', this.value)">';
            if (hasVariante) {
                html += '<input type="text" class="coll-serial-input" placeholder="N° série variante" value="' + escapeAttr(serialVariante) + '" onchange="collUpdateSerial(' + billetId + ', \'serial_variante\', this.value)">';
            }
            html += '</div>';
        }
        html += '</div>';

        // Forçage
        html += '<div class="coll-modal-actions">';
        if (overrideAction) {
            var badge = overrideAction === 'include' ? '<i class="fa-solid fa-thumbtack"></i> Inclus manuellement' : '<i class="fa-solid fa-ban"></i> Exclu manuellement';
            html += '<div class="coll-override-badge ' + (overrideAction === 'include' ? 'coll-override-include' : 'coll-override-exclude') + '">' + badge + '</div>';
            html += '<button class="btn-secondary btn-sm" onclick="collRemoveOverride(' + billetId + '); collRefreshModal(' + billetId + ')"><i class="fa-solid fa-rotate-left"></i> Retirer forçage</button>';
        } else if (inScope) {
            html += '<button class="btn-secondary btn-sm" onclick="collForceExclude(' + billetId + '); collCloseModal()"><i class="fa-solid fa-ban"></i> Exclure</button>';
        } else {
            html += '<button class="btn-secondary btn-sm" onclick="collForceInclude(' + billetId + '); collCloseModal()"><i class="fa-solid fa-thumbtack"></i> Inclure</button>';
        }
        html += '</div>';

        html += '</div>'; // .coll-modal-infos
        html += '</div>'; // .coll-modal-card
        html += '</div>'; // .coll-modal-overlay

        // Injecter dans le DOM
        var existing = document.getElementById('coll-modal');
        if (existing) existing.remove();
        var modal = document.createElement('div');
        modal.id = 'coll-modal';
        modal.innerHTML = html;
        document.body.appendChild(modal);

        // Bloquer le scroll du body
        document.body.style.overflow = 'hidden';
    }

    function collCloseModal() {
        var modal = document.getElementById('coll-modal');
        if (modal) modal.remove();
        document.body.style.overflow = '';

        // Rafraîchir la grille (la possession a pu changer)
        renderCounter();
        renderCountryCounters();
        renderCollection();
    }

    window.collRefreshModal = function(billetId) {
        // Re-render la modale avec les données à jour (mise à jour optimiste)
        collShowBillet(billetId);
    };

    // ============================================================
    // 17. HELPERS
    // ============================================================

    function resolveImageUrl(item, size) {
        if (item.ImageUrl) {
            return item.ImageUrl.replace('/upload/', '/upload/f_auto,q_auto,w_' + (size || 800) + '/');
        }
        if (item.ImageId) {
            return 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(item.ImageId) + '&sz=w' + (size || 800);
        }
        return '';
    }

    function escapeHtml(str) {
        var div = document.createElement('div');
        div.appendChild(document.createTextNode(str));
        return div.innerHTML;
    }

    function escapeAttr(str) {
        return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    // ============================================================
    // 17. EXPORT / IMPORT EXCEL (Epic 8)
    // ============================================================

    function collExport() {
        if (typeof XLSX === 'undefined') {
            showToast('Librairie Excel non chargée', true);
            return;
        }

        var perimetre = calculerPerimetre(allBillets, memberRules, memberOverrides);
        var overrideMap = {};
        (memberOverrides || []).forEach(function(o) { overrideMap[o.billet_id] = o.type; });

        var rows = [];
        allBillets.forEach(function(b) {
            var inScope = !!perimetre[b.id];
            var excluded = overrideMap[b.id] === 'exclude';
            if (!inScope || excluded) return;

            // Appliquer les filtres pays/année actifs
            if (filterPays && (b.Pays || '') !== filterPays) return;
            if (filterAnnee && (b.Millesime || '').toString() !== filterAnnee) return;

            var c = collectionMap[b.id];
            var row = {
                'Référence': b.Reference || '',
                'Millésime': b.Millesime || '',
                'Version': b.Version || '',
                'Nom': b.NomBillet || '',
                'Pays': b.Pays || '',
                'Dep': b.Dep || '',
                'Possédé': (c && c.owned_normal) ? 'oui' : 'non',
            };
            if (trackSerial) {
                row['N° série'] = (c && c.serial_normal) ? c.serial_normal : '';
            }
            if (b.HasVariante && b.HasVariante !== 'N') {
                row['Variante'] = b.HasVariante;
                row['Possédé variante'] = (c && c.owned_variante) ? 'oui' : 'non';
                if (trackSerial) {
                    row['N° série variante'] = (c && c.serial_variante) ? c.serial_variante : '';
                }
            } else {
                row['Variante'] = '';
                row['Possédé variante'] = '';
                if (trackSerial) {
                    row['N° série variante'] = '';
                }
            }
            row['Nb doubles'] = (c && c.nb_doubles) ? c.nb_doubles : 0;
            rows.push(row);
        });

        var ws = XLSX.utils.json_to_sheet(rows);
        var wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Ma collection');
        var filename = 'ma-collection';
        if (filterPays) filename += '-' + filterPays;
        if (filterAnnee) filename += '-' + filterAnnee;
        filename += '.xlsx';
        XLSX.writeFile(wb, filename);
        showToast(rows.length + ' billets exportés');
    }

    function collImport(input) {
        if (!input.files || !input.files[0]) return;
        if (typeof XLSX === 'undefined') {
            showToast('Librairie Excel non chargée', true);
            return;
        }

        var file = input.files[0];
        var reader = new FileReader();
        reader.onload = function(e) {
            var data = new Uint8Array(e.target.result);
            var wb = XLSX.read(data, { type: 'array' });
            var ws = wb.Sheets[wb.SheetNames[0]];
            var rows = XLSX.utils.sheet_to_json(ws);

            // Validation des colonnes requises
            if (rows.length === 0) {
                showToast('Fichier vide', true);
                input.value = '';
                return;
            }
            var requiredCols = ['Référence', 'Millésime', 'Version', 'Possédé'];
            var firstRow = rows[0];
            var missing = requiredCols.filter(function(col) { return !(col in firstRow); });
            if (missing.length > 0) {
                showToast('Colonnes manquantes : ' + missing.join(', '), true);
                input.value = '';
                return;
            }

            // Construire un index par clé (ref + millésime + version)
            var billetIndex = {};
            allBillets.forEach(function(b) {
                var key = (b.Reference || '') + '|' + (b.Millesime || '') + '|' + (b.Version || '');
                billetIndex[key] = b;
            });

            // Analyser les changements
            var changes = [];
            var errors = [];
            var unchanged = 0;

            rows.forEach(function(row, idx) {
                var key = (row['Référence'] || '') + '|' + (row['Millésime'] || '') + '|' + (row['Version'] || '');
                var billet = billetIndex[key];
                if (!billet) {
                    errors.push('Ligne ' + (idx + 2) + ' : référence inconnue (' + key + ')');
                    return;
                }

                var c = collectionMap[billet.id] || {};
                var newOwned = (row['Possédé'] || '').toString().toLowerCase() === 'oui';
                var newOwnedVar = (row['Possédé variante'] || '').toString().toLowerCase() === 'oui';
                var newSerial = (row['N° série'] || '').toString();
                var newSerialVar = (row['N° série variante'] || '').toString();
                var newDoubles = parseInt(row['Nb doubles']) || 0;

                var oldOwned = !!c.owned_normal;
                var oldOwnedVar = !!c.owned_variante;
                var oldSerial = c.serial_normal || '';
                var oldSerialVar = c.serial_variante || '';
                var oldDoubles = c.nb_doubles || 0;

                if (newOwned === oldOwned && newOwnedVar === oldOwnedVar &&
                    newSerial === oldSerial && newSerialVar === oldSerialVar &&
                    newDoubles === oldDoubles) {
                    unchanged++;
                    return;
                }

                changes.push({
                    billet_id: billet.id,
                    owned_normal: newOwned,
                    owned_variante: newOwnedVar,
                    serial_normal: newSerial,
                    serial_variante: newSerialVar,
                    nb_doubles: newDoubles,
                    hasExisting: !!c.owned_normal || !!c.owned_variante || !!c.serial_normal
                });
            });

            // Afficher prévisualisation
            var msg = changes.length + ' modification(s), ' + unchanged + ' inchangé(s)';
            if (errors.length > 0) {
                msg += ', ' + errors.length + ' erreur(s)';
            }

            if (changes.length === 0) {
                showToast('Aucune modification à importer. ' + msg);
                input.value = '';
                return;
            }

            if (errors.length > 0 && changes.length === 0) {
                showToast('Import bloqué : ' + errors.join(' ; '), true);
                input.value = '';
                return;
            }

            var proceed = confirm('Import : ' + msg + '\n\nConfirmer l\'import ?');
            if (!proceed) {
                input.value = '';
                return;
            }

            // Exécuter l'import par batch
            var email = firebase.auth().currentUser.email;
            var batchSize = 50;
            var batches = [];
            for (var i = 0; i < changes.length; i += batchSize) {
                batches.push(changes.slice(i, i + batchSize));
            }

            var done = 0;
            var chain = Promise.resolve();
            batches.forEach(function(batch) {
                chain = chain.then(function() {
                    var rows = batch.map(function(ch) {
                        return {
                            membre_email: email,
                            billet_id: ch.billet_id,
                            owned_normal: ch.owned_normal,
                            owned_variante: ch.owned_variante,
                            serial_normal: ch.serial_normal,
                            serial_variante: ch.serial_variante,
                            nb_doubles: ch.nb_doubles
                        };
                    });
                    return supabaseFetch('/rest/v1/collection', {
                        method: 'POST',
                        headers: { 'Prefer': 'resolution=merge-duplicates' },
                        body: JSON.stringify(rows),
                    }).then(function() {
                        done += batch.length;
                    });
                });
            });

            chain.then(function() {
                showToast(done + ' billet(s) importé(s) avec succès');
                // Recharger les données collection
                supabaseFetch('/rest/v1/collection?select=*').then(function(data) {
                    collectionMap = {};
                    data.forEach(function(c) { collectionMap[c.billet_id] = c; });
                    renderCounter();
                    renderCountryCounters();
                    renderCollection();
                });
            }).catch(function(err) {
                console.error('Erreur import:', err);
                showToast('Erreur lors de l\'import', true);
            });

            input.value = '';
        };
        reader.readAsArrayBuffer(file);
    }

    // ============================================================
    // 18. TOAST
    // ============================================================

    function showToast(message, isError) {
        var existing = document.querySelector('.collection-toast');
        if (existing) existing.remove();

        var toast = document.createElement('div');
        toast.className = 'collection-toast' + (isError ? ' collection-toast-error' : '');
        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(function() { toast.classList.add('collection-toast-visible'); }, 10);
        setTimeout(function() {
            toast.classList.remove('collection-toast-visible');
            setTimeout(function() { toast.remove(); }, 300);
        }, 3000);
    }

})();
