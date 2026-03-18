# Analyse de Securite — BilletsTouristiques

**Date** : 2026-03-17 (mise a jour : 2026-03-18)
**Contexte** : Audit pre-cutover (migration Google Sheet → Supabase)
**Methode** : 3 revues independantes (code review, adversarial general, edge case hunter)

---

## Resume executif

- ~~**1 faille CRITIQUE** : escalade de privileges (membre → admin)~~ → **FIXE** (deploye)
- **4 failles ELEVEES** : ~~XSS stocke~~, ~~CORS wildcard~~, ~~service_role key exposee~~, ~~champ arbitraire dans PATCH~~ → **TOUTES FIXEES**
- **6 failles MOYENNES** : garde admin client-side, ~~fuite d'erreur~~, pas de rate limiting, ~~race conditions~~ → 2 restantes
- **5 failles BASSES** : ~~bug JS~~, pas de CSP, ~~credentials locaux~~, ~~dropdown injection~~ → 1 restante
- **3 nouvelles failles identifiees (18 mars)** : XSS dans app-new.js, RLS enveloppes trop permissive, RLS collecteurs trop permissive → **TOUTES FIXEES**

**Bilan final : 19 failles — 15 fixees/deployees, 2 risques acceptes, 2 faux positifs/N.A. Aucune faille ouverte.**

---

## CRITIQUE

### SEC-01 — Escalade de privileges : membre peut se promouvoir admin

| | |
|---|---|
| **Fichiers** | `supabase-setup.sql:185-189`, `profil.js:137` |
| **Source** | Code review + Adversarial + Edge case hunter (triple confirmation) |
| **Description** | La policy RLS `membres_update_own_profile` autorise un membre a modifier **toute sa ligne** sans restriction de colonnes. Un PATCH sur `/rest/v1/membres?email=eq.monmail@gmail.com` avec `{"role":"admin"}` fonctionne. |
| **Impact** | Prise de controle totale de l'application par n'importe quel membre authentifie. |
| **Fix** | Modifier la policy pour exclure la colonne `role` des updates self-service. |

**Fix SQL propose :**
```sql
DROP POLICY "membres_update_own_profile" ON membres;

CREATE POLICY "membres_update_own_profile"
  ON membres FOR UPDATE
  USING (email = auth.jwt() ->> 'email')
  WITH CHECK (
    email = auth.jwt() ->> 'email'
    AND role = (SELECT role FROM membres WHERE email = auth.jwt() ->> 'email')
  );
```

---

## ELEVEE

### SEC-02 — XSS stocke dans app.js (vue membre)

| | |
|---|---|
| **Fichiers** | `app.js:317-329, 362, 427-432, 105` |
| **Source** | Code review + Edge case hunter |
| **Description** | Les champs `NomBillet`, `Commentaire`, `Ville`, `Sondage`, `LinkFB` sont injectes via template literals dans `innerHTML` sans echappement. Un admin malveillant ou une donnee corrompue peut injecter du JS. |
| **Impact** | Execution de script arbitraire dans le navigateur de chaque membre. |
| **Fix** | Appliquer `escapeHtml()` / `escapeAttr()` (deja presents dans `users.js`) a toutes les interpolations dans `app.js`. Valider les URLs (`https://` only) pour les champs href. |

### SEC-03 — XSS stocke dans mes-collectes.js (vue collecteur)

| | |
|---|---|
| **Fichiers** | `mes-collectes.js:322-345, 340, 134-168` |
| **Source** | Edge case hunter |
| **Description** | Les snapshots d'adresse (nom, prenom, rue, commentaire) et les noms de billets sont injectes sans echappement dans le tableau des inscriptions et la liste des collectes. L'inline `onclick` avec interpolation de `nomPrenom` est aussi vulnerable. |
| **Impact** | XSS dans la vue collecteur via des donnees d'inscription forgees. |
| **Fix** | Echapper toutes les valeurs interpolees. Remplacer les `onclick` inline par de la delegation d'evenements avec `data-*` attributes. |

### SEC-04 — CORS wildcard sur le Worker d'export

| | |
|---|---|
| **Fichiers** | `workers/billets-export/worker.js:22, 75` |
| **Source** | Adversarial |
| **Description** | `Access-Control-Allow-Origin: '*'` permet a n'importe quel site d'appeler l'endpoint d'export si la cle API fuite. Le worker utilise en plus la `service_role` key Supabase qui contourne toutes les RLS. |
| **Impact** | Exfiltration de la base complete si la cle API est compromise. |
| **Fix** | Restreindre l'origin a l'URL du Google Apps Script, ou supprimer les headers CORS (le Apps Script n'en a pas besoin cote serveur). |

### SEC-05 — Champ arbitraire dans toggleInscriptionField

| | |
|---|---|
| **Fichiers** | `mes-collectes.js:378-383` |
| **Source** | Edge case hunter |
| **Description** | La fonction `toggleInscriptionField(id, field, value)` accepte n'importe quel nom de champ sans validation. Via manipulation du DOM (attribut `onchange`), un utilisateur peut modifier `statut_paiement`, `membre_email`, ou tout autre champ de la table inscriptions. |
| **Impact** | Modification non autorisee de donnees d'inscription (contournement de la logique metier). |
| **Fix** | Ajouter une whitelist : `if (['envoye','fdp_regles'].indexOf(field) === -1) return;` |

---

## MOYENNE

### SEC-06 — Garde admin purement cote client

| | |
|---|---|
| **Fichiers** | `global.js:116, 203` |
| **Source** | Adversarial |
| **Description** | La verification admin repose sur `data-require-admin` et `window.userRole` (modifiable en console). Les menus admin sont masques par CSS (`admin-only` class). |
| **Impact** | Un membre peut acceder aux interfaces admin (mais les operations echoueront cote RLS — sauf si SEC-01 n'est pas corrige). |
| **Fix** | Pas critique si SEC-01 est corrige (RLS protege le backend). Optionnel : ajouter une verification server-side dans le worker ou un middleware. |

### SEC-07 — Fuite de details d'erreur dans le Worker

| | |
|---|---|
| **Fichiers** | `workers/billets-export/worker.js:52-53` |
| **Source** | Adversarial + Edge case hunter |
| **Description** | L'erreur Supabase complete (`details: err`) est renvoyee au client. Peut exposer des noms de tables, structures SQL, messages PostgreSQL. |
| **Impact** | Disclosure d'information interne. |
| **Fix** | `return jsonResponse({ error: 'Erreur serveur' }, 502);` |

### SEC-08 — Pas de rate limiting

| | |
|---|---|
| **Fichiers** | `workers/billets-export/worker.js`, endpoints Supabase |
| **Source** | Adversarial |
| **Description** | Aucun rate limiting applicatif sur le Worker ni sur les appels Supabase REST. |
| **Impact** | Brute-force de la cle API, spam des endpoints. |
| **Fix** | Ajouter un rate limiter Cloudflare sur le Worker. Supabase a un rate limiting natif mais verifier sa configuration. |

### SEC-09 — Page blanche si la verification membre echoue (erreur reseau)

| | |
|---|---|
| **Fichiers** | `global.js:133-135` |
| **Source** | Edge case hunter |
| **Description** | Si le fetch Supabase echoue (reseau, timeout), le `.catch` log l'erreur mais ne redirige pas ni n'affiche de message. L'utilisateur voit une page blanche. |
| **Impact** | UX degradee, utilisateur bloque. |
| **Fix** | Ajouter un fallback dans le catch : afficher un message d'erreur ou rediriger vers login. |

### SEC-10 — Race condition sur getIdToken / currentUser null

| | |
|---|---|
| **Fichiers** | `global.js:38, 90` |
| **Source** | Edge case hunter |
| **Description** | `supabaseFetch` appelle `firebase.auth().currentUser.getIdToken()` sans verifier que `currentUser` n'est pas null. Si appele entre deux etats d'auth, TypeError. |
| **Impact** | Crash silencieux, operations echouent sans feedback. |
| **Fix** | Ajouter `if (!firebase.auth().currentUser) return Promise.reject(new Error('Non authentifie'));` en debut de `supabaseFetch`. |

### SEC-11 — Alias collecteur non encode dans l'URL Supabase

| | |
|---|---|
| **Fichiers** | `mes-collectes.js:66` |
| **Source** | Edge case hunter |
| **Description** | L'alias collecteur est injecte dans la query Supabase sans `encodeURIComponent`. Si l'alias contient `&`, `=`, ou des caracteres speciaux, la requete est malformee. |
| **Impact** | Requete echouee ou resultats incorrects pour le collecteur. |
| **Fix** | `encodeURIComponent(monCollecteur.alias)` |

---

## BASSE

### SEC-12 — Bug highlightActiveLink : variable non definie

| | |
|---|---|
| **Fichiers** | `global.js:213` |
| **Source** | Adversarial + Edge case hunter |
| **Description** | `page = index.html` au lieu de `page = 'index.html'`. `index` est interprete comme une variable. |
| **Impact** | ReferenceError si la page racine est visitee. |
| **Fix** | `if(page === '') page = 'index.html';` |

### SEC-13 — Pas de Content Security Policy

| | |
|---|---|
| **Fichiers** | Tous les fichiers HTML |
| **Source** | Adversarial |
| **Description** | Aucun header CSP. Amplifie l'impact des failles XSS (SEC-02, SEC-03). |
| **Impact** | Scripts inline et ressources externes non restreints. |
| **Fix** | Ajouter un meta CSP ou configurer le header via le serveur/CDN. |

### SEC-14 — Injection HTML via valeurs de filtre dans les dropdowns

| | |
|---|---|
| **Fichiers** | `app.js:223-227` |
| **Source** | Edge case hunter |
| **Description** | Les valeurs des options de filtre (Categorie, Pays, etc.) ne sont pas echappees dans les attributs `value` des `<option>`. |
| **Impact** | HTML injection dans le dropdown si une valeur contient des guillemets. |
| **Fix** | Utiliser `escapeAttr(val)` dans les attributs value. |

### SEC-15 — Reponse 201 silencieusement ignoree dans supabaseFetch

| | |
|---|---|
| **Fichiers** | `global.js:59` |
| **Source** | Edge case hunter |
| **Description** | Les reponses 201 (created) retournent `null` au lieu du body JSON. Les callers qui attendent les donnees creees ne les recoivent pas. |
| **Impact** | Donnees perdues silencieusement apres un POST reussi. |
| **Fix** | `if (response.status === 201) return response.json().catch(() => null);` |

### SEC-16 — Fichiers credentials Firebase dupliques dans scripts/

| | |
|---|---|
| **Fichiers** | `scripts/service-account.json`, `scripts/asso-billet-site-firebase-adminsdk-fbsvc-4d4020f44f.json` |
| **Source** | Adversarial |
| **Description** | Deux fichiers identiques contenant la cle privee du service account Firebase. Ils sont dans `.gitignore` et non trackes, mais present sur le poste. |
| **Impact** | Risque si le dossier est partage ou synchronise. |
| **Fix** | Supprimer le doublon. Verifier que le fichier n'a jamais ete commit (`git log` confirme que non). |

---

## Nouvelles failles identifiees (18 mars 2026)

### SEC-17 — XSS systematique dans app-new.js (annuaire Supabase)

| | |
|---|---|
| **Fichiers** | `app-new.js` (filtres, mode liste, galerie, collecte, compteurs, badges) |
| **Source** | Revue de code du 18 mars |
| **Description** | Le fichier `app-new.js` n'avait aucune fonction d'echappement. Tous les champs utilisateur (NomBillet, Ville, Commentaire, Reference, Collecteur, etc.) etaient injectes bruts dans `innerHTML` dans les 3 modes d'affichage + filtres + compteurs. Les URLs (Sondage, LinkSheet, LinkFB) n'etaient pas validees. |
| **Impact** | XSS stocke dans la nouvelle version de l'annuaire. |
| **Fix** | Ajout de `escapeHtml()`, `escapeAttr()`, `sanitizeUrl()` + application systematique a toutes les interpolations. `encodeURIComponent()` pour les ImageId dans les URLs. |

### SEC-18 — RLS enveloppes : membres peuvent modifier tous les champs

| | |
|---|---|
| **Fichiers** | `scripts/migration-5-7b-enveloppes.sql:65-69` |
| **Source** | Revue RLS du 18 mars |
| **Description** | La policy `enveloppes_membre_update` permettait a un membre de modifier **tous les champs** de ses enveloppes via PATCH direct : `statut`, `mode_envoi_reel`, `numero_suivi`, `date_expedition`. |
| **Impact** | Contournement du workflow d'expedition. Un membre peut marquer une enveloppe comme expediee, falsifier le numero de suivi ou la date d'expedition. |
| **Fix** | Migration `scripts/migration-sec-enveloppes-restrict-member.sql` : le membre ne peut plus modifier que `demande_envoi`, `date_demande_envoi`, et passer `statut` a `'recue'` uniquement. |

### SEC-19 — RLS collecteurs : modification de champs non autorises (billets + inscriptions)

| | |
|---|---|
| **Fichiers** | `supabase-setup.sql:155-166, 249-264` |
| **Source** | Revue RLS du 18 mars |
| **Description** | Les policies `billets_update_collecteur` et `inscriptions_update_collecteur` ne restreignaient pas les colonnes. Un collecteur pouvait modifier les prix, la reference, le collecteur assigne (billets) ou le membre, les quantites (inscriptions) via PATCH direct. |
| **Impact** | Modification non autorisee de donnees financieres et d'identite. |
| **Fix** | Migration `scripts/migration-sec-collecteur-restrict-fields.sql` : verrouillage des champs sensibles (Prix, PrixVariante, Reference, Collecteur pour billets ; membre_email, nb_normaux, nb_variantes, billet_id pour inscriptions). |

---

## Plan de remediation

| Statut | Findings | Action |
|--------|----------|--------|
| **DEPLOYE** | SEC-01 | Migration SQL executee sur Supabase (restriction colonne `role`) |
| FIXE | SEC-02 | Echappement HTML/URL dans `app.js` (escapeHtml, escapeAttr, sanitizeUrl) |
| FIXE | SEC-03 | Echappement HTML dans `mes-collectes.js` + delegation d'evenements |
| FIXE | SEC-04 | CORS wildcard supprime dans `worker.js` |
| FIXE | SEC-05 | Whitelist des champs dans `toggleInscriptionField` |
| FIXE | SEC-07 | Details d'erreur masques dans `worker.js` |
| FIXE | SEC-09 | Message d'erreur au lieu de page blanche dans `global.js` |
| FIXE | SEC-10 | Null check currentUser dans `supabaseFetch` |
| FIXE | SEC-12 | Bug `highlightActiveLink` corrige dans `global.js` |
| FIXE | SEC-14 | Echappement des valeurs de filtre dans `app.js` |
| FIXE | SEC-15 | Reponse 201 geree correctement dans `supabaseFetch` |
| N/A | SEC-11 | Deja encode via `encodeURIComponent` — faux positif |
| **DEPLOYE** | SEC-17 | Echappement XSS complet dans `app-new.js` (escapeHtml, escapeAttr, sanitizeUrl) |
| **DEPLOYE** | SEC-18 | RLS enveloppes restreinte (`migration-sec-enveloppes-restrict-member.sql`) |
| **DEPLOYE** | SEC-19 | RLS collecteurs restreinte (`migration-sec-collecteur-restrict-fields.sql`) |
| FIXE | admin-fdp | Echappement messages d'erreur dans `admin-fdp.js` (textContent au lieu d'innerHTML) |
| ACCEPTE | SEC-06 | Garde admin client-side : risque accepte — SEC-01 deploye, RLS protege le backend, impact limite a voir l'interface sans pouvoir agir |
| ACCEPTE | SEC-08 | Rate limiting : risque accepte — Supabase a un rate limiting natif, le Worker necessite une cle API |
| **DEPLOYE** | SEC-13 | CSP meta tag ajoutee aux 16 pages HTML (script-src, style-src, connect-src, img-src, font-src, frame-src) |
| **FIXE** | SEC-16 | Doublon credentials supprime (`asso-billet-site-firebase-adminsdk-fbsvc-*.json`), seul `service-account.json` conserve |
