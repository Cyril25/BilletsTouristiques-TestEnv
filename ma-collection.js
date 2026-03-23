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
    var searchQuery = '';
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
            supabaseFetch('/rest/v1/billets?select=id,Millesime,Pays,HasVariante,NomBillet,Reference,Version&order=Millesime.asc.nullslast,Pays.asc'),
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

            renderPerimetreSummary();
            renderCounter();
            renderCountryCounters();
            renderCollection();
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
        var totalPerimetre = Object.keys(perimetre).length;

        // Compter les possédés
        var owned = 0;
        collectionData.forEach(function(c) {
            if (perimetre[c.billet_id] && (c.owned_normal || c.owned_variante)) {
                owned++;
            }
        });

        var pct = totalPerimetre > 0 ? Math.round((owned / totalPerimetre) * 100) : 0;

        counter.innerHTML =
            '<div class="collection-hero">' +
                '<div class="collection-hero-number">' + owned + ' <span class="collection-hero-sep">/</span> ' + totalPerimetre + '</div>' +
                '<div class="collection-hero-label">billets dans mon périmètre</div>' +
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
                '</div>';
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
        el.innerHTML = html;
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
    // 9. COMPTEURS PAR PAYS (Story 7-2)
    // ============================================================

    function renderCountryCounters() {
        var el = document.getElementById('collection-country-counters');
        if (!el) return;

        var perimetre = calculerPerimetre(allBillets, memberRules, memberOverrides);

        // Grouper par pays
        var paysStats = {};
        allBillets.forEach(function(b) {
            if (!perimetre[b.id]) return;
            var pays = b.Pays || 'Inconnu';
            if (!paysStats[pays]) paysStats[pays] = { total: 0, owned: 0 };
            paysStats[pays].total++;
            var c = collectionMap[b.id];
            if (c && (c.owned_normal || c.owned_variante)) {
                paysStats[pays].owned++;
            }
        });

        // Trier par progression décroissante puis par nom
        var paysList = Object.keys(paysStats).sort(function(a, b) {
            var pctA = paysStats[a].total > 0 ? paysStats[a].owned / paysStats[a].total : 0;
            var pctB = paysStats[b].total > 0 ? paysStats[b].owned / paysStats[b].total : 0;
            if (pctB !== pctA) return pctB - pctA;
            return a.localeCompare(b);
        });

        if (paysList.length === 0) {
            el.innerHTML = '';
            return;
        }

        var html = '<details class="collection-counters-details"><summary><i class="fa-solid fa-chart-bar"></i> Détail par pays (' + paysList.length + ')</summary><div class="collection-counters-grid">';

        paysList.forEach(function(pays) {
            var s = paysStats[pays];
            var pct = s.total > 0 ? Math.round((s.owned / s.total) * 100) : 0;
            html +=
                '<div class="country-counter-item">' +
                    '<div class="country-counter-label">' + escapeHtml(pays) + '</div>' +
                    '<div class="country-counter-bar"><div class="country-counter-fill" style="width:' + pct + '%"></div></div>' +
                    '<div class="country-counter-value">' + s.owned + '/' + s.total + '</div>' +
                '</div>';
        });

        html += '</div></details>';
        el.innerHTML = html;
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
        // Toggle bouton actif
        var btns = document.querySelectorAll('.coll-filter-btn');
        btns.forEach(function(btn) {
            btn.classList.toggle('active', btn.getAttribute('data-filter') === filter);
        });
        renderCollection();
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

        allBillets.forEach(function(b) {
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

        // Grouper par pays
        var grouped = {};
        billetsFiltres.forEach(function(item) {
            var pays = item.billet.Pays || 'Inconnu';
            if (!grouped[pays]) grouped[pays] = [];
            grouped[pays].push(item);
        });

        var paysSorted = Object.keys(grouped).sort();

        var html = '';
        paysSorted.forEach(function(pays) {
            var items = grouped[pays];
            // Trier par millésime puis version
            items.sort(function(a, b) {
                var yA = parseInt(a.billet.Millesime) || 0;
                var yB = parseInt(b.billet.Millesime) || 0;
                if (yA !== yB) return yA - yB;
                return (a.billet.Version || '').localeCompare(b.billet.Version || '');
            });

            // Compteur pays
            var ownedCount = items.filter(function(i) { return i.isOwned; }).length;

            html += '<div class="coll-country-group">';
            html += '<div class="coll-country-header">';
            html += '<h3>' + escapeHtml(pays) + '</h3>';
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

        var cssClass = 'coll-billet-card';
        if (!item.inScope) {
            cssClass += ' coll-out-of-scope';
        } else if (item.isOwned) {
            cssClass += ' coll-owned';
        } else {
            cssClass += ' coll-missing';
        }

        var html = '<div class="' + cssClass + '" data-billet-id="' + b.id + '">';

        // En-tête : référence + année-version
        html += '<div class="coll-billet-header">';
        html += '<span class="coll-billet-ref">' + escapeHtml(b.Reference || '') + '</span>';
        html += '<span class="coll-billet-year">' + escapeHtml((b.Millesime || '') + (b.Version ? '-' + b.Version : '')) + '</span>';
        html += '</div>';

        // Nom
        html += '<div class="coll-billet-name">' + escapeHtml(b.NomBillet || '') + '</div>';

        // Variante info
        if (hasVariante) {
            html += '<div class="coll-billet-variante"><i class="fa-solid fa-star"></i> ' + escapeHtml(b.HasVariante) + '</div>';
        }

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

        // Actions forçage (Story 6-4)
        html += '<div class="coll-billet-actions">';
        if (item.override) {
            html += '<button class="btn-link btn-sm" onclick="collRemoveOverride(' + b.id + ')" title="Retirer le forçage"><i class="fa-solid fa-rotate-left"></i> Retirer forçage</button>';
        } else if (item.inScope) {
            html += '<button class="btn-link btn-sm" onclick="collForceExclude(' + b.id + ')" title="Exclure manuellement"><i class="fa-solid fa-ban"></i> Exclure</button>';
        } else {
            html += '<button class="btn-link btn-sm" onclick="collForceInclude(' + b.id + ')" title="Inclure manuellement"><i class="fa-solid fa-thumbtack"></i> Inclure</button>';
        }
        html += '</div>';

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

        if (existing) {
            // PATCH existant
            var patch = {};
            patch[field] = checked;
            supabaseFetch('/rest/v1/collection?membre_email=eq.' + encodeURIComponent(user.email) + '&billet_id=eq.' + billetId, {
                method: 'PATCH',
                body: JSON.stringify(patch),
                headers: { 'Prefer': 'return=minimal' }
            })
            .then(function() {
                existing[field] = checked;
                renderCounter();
                renderCountryCounters();
            })
            .catch(function(err) {
                console.error('Erreur mise à jour possession :', err);
                showToast('Erreur', true);
            });
        } else {
            // INSERT nouvelle ligne
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

            supabaseFetch('/rest/v1/collection', {
                method: 'POST',
                body: JSON.stringify(row),
                headers: { 'Prefer': 'return=minimal' }
            })
            .then(function() {
                collectionMap[billetId] = row;
                collectionData.push(row);
                renderCounter();
                renderCountryCounters();
            })
            .catch(function(err) {
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
    // 14. HELPERS
    // ============================================================

    function escapeHtml(str) {
        var div = document.createElement('div');
        div.appendChild(document.createTextNode(str));
        return div.innerHTML;
    }

    function escapeAttr(str) {
        return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    // ============================================================
    // 15. TOAST
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
