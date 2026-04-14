# Rollout prod — Epic 13 (Refonte collectes)

Objectif : passer la prod sur le modèle découplé billet/collecte + `pas_interesse` au niveau billet + catégorie/date_effective dérivées des collectes via trigger.

## Prérequis

- [ ] Banner maintenance activé (bloque lectures + écritures)
- [ ] `pg_dump` complet archivé (backup horodaté)
- [ ] Vérifier l'état actuel de la prod :
  ```sql
  -- Collectes déjà créées ?
  SELECT COUNT(*) FROM collectes;
  -- Inscriptions avec collecte_id NULL ?
  SELECT COUNT(*) FROM inscriptions WHERE collecte_id IS NULL;
  -- Trigger Categorie déjà en place ?
  SELECT tgname FROM pg_trigger WHERE tgname = 'trg_collectes_recalc_billet_categorie';
  ```

## Ordre d'exécution

### 1. `migration-epic13-1.sql` — Schéma + backfill collectes
**Objectif** : ajouter colonnes `prix/prix_variante/payer_fdp/fdp_com` à `collectes`, créer 1 collecte par billet, rattacher chaque inscription à sa collecte, UK `(collecte_id, membre_email)`, triggers D4/D12.

**Idempotent** : oui (guards `IF NOT EXISTS` / `WHERE NOT EXISTS`).

**Vérif post-migration** :
```sql
SELECT COUNT(*) FROM collectes;                              -- = nb billets
SELECT COUNT(*) FROM inscriptions WHERE collecte_id IS NULL; -- = 0
```

### 2. `migration-pas-interesse-collection.sql` — Déplace `pas_interesse`
**Objectif** : `pas_interesse` concerne le billet, pas la collecte → migration de `inscriptions.pas_interesse` vers `collection.pas_interesse`, puis suppression des lignes correspondantes dans `inscriptions`.

**Vérif** :
```sql
-- Aucune inscription ne doit plus avoir pas_interesse=true
SELECT COUNT(*) FROM inscriptions WHERE pas_interesse = true; -- = 0
-- Les pas_interesse sont dans collection
SELECT COUNT(*) FROM collection WHERE pas_interesse = true;
```

### 3. `migration-compteurs-inscriptions-v2.sql` — RPC agrégation
**Objectif** : remplace `compteurs_inscriptions()` par sa v2 avec `total_count`, et ajoute `compteurs_inscriptions_par_collecte()` (clé = UUID collecte_id). Contourne la limite 1000 lignes de PostgREST.

**Nécessite** un `DROP FUNCTION` explicite car la signature change.

**Vérif** :
```sql
SELECT COUNT(*) FROM compteurs_inscriptions();              -- > 0
SELECT COUNT(*) FROM compteurs_inscriptions_par_collecte(); -- > 0
```

### 4. `migration-epic13-billet-derived.sql` — Triggers auto catégorie + date_effective
**Objectif** :
- Trigger `trg_collectes_recalc_billet_categorie` : synchronise `billets."Categorie"` selon la collecte la plus ouverte (priorité Pré collecte > Collecte > Terminé).
- Remplace `sync_billet_date_effective()` : ne regarde plus `billets."Date"`, uniquement `MAX(date_pre, date_coll, date_fin)` des collectes.
- Backfill de tous les billets existants.

**Vérif** :
```sql
-- Aucun billet ne doit avoir une Categorie incohérente avec ses collectes
SELECT b.id, b."Categorie", MIN(c.categorie) AS cat_min
FROM billets b JOIN collectes c ON c.billet_id = b.id
GROUP BY b.id, b."Categorie"
HAVING b."Categorie" IS DISTINCT FROM MIN(c.categorie) -- simple sanity check
LIMIT 20;
```

## Post-rollout

- [ ] Désactiver le banner maintenance
- [ ] Vérifier sur prod :
  - [ ] Page `billets.html` charge tous les billets (pagination fonctionne)
  - [ ] Bloc mauve affiche bien la collecte principale en premier + catégorie
  - [ ] Bouton "S'inscrire" masqué sur les collectes Terminées
  - [ ] Admin : création billet OK (formulaire sans champs catégorie/dates/prix)
  - [ ] Admin : modification catégorie d'une collecte → `billets."Categorie"` se met à jour
- [ ] Garder le backup 14 jours min avant purge

## Rollback

Si problème bloquant détecté :
1. Restaurer `pg_dump` (rollback complet — plus fiable que migrations inverses)
2. Revert du code applicatif : `git revert <commit-hash>` côté `main` + redéploiement

**Ne PAS** tenter de migration inverse partielle — le couplage entre `inscriptions.collecte_id` NOT NULL, UK sur `(collecte_id, membre_email)`, et triggers rend la désactivation risquée.
