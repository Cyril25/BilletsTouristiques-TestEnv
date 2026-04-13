-- =============================================================
-- Extension RPC compteurs_inscriptions : ajoute total_count
-- Évite la limite 1000 lignes de Supabase REST sur staging/prod
-- =============================================================

DROP FUNCTION IF EXISTS compteurs_inscriptions();

CREATE OR REPLACE FUNCTION compteurs_inscriptions()
RETURNS TABLE(
    billet_id INTEGER,
    total_count BIGINT,
    total_normaux BIGINT,
    total_variantes BIGINT
)
LANGUAGE SQL STABLE
SECURITY DEFINER
AS $$
    SELECT billet_id,
           COUNT(*)::BIGINT AS total_count,
           COALESCE(SUM(nb_normaux), 0) AS total_normaux,
           COALESCE(SUM(nb_variantes), 0) AS total_variantes
    FROM inscriptions
    WHERE pas_interesse = false
    GROUP BY billet_id;
$$;

GRANT EXECUTE ON FUNCTION compteurs_inscriptions() TO authenticated;
GRANT EXECUTE ON FUNCTION compteurs_inscriptions() TO anon;

-- =============================================================
-- RPC compteurs_inscriptions_par_collecte : agrégation par collecte
-- =============================================================

CREATE OR REPLACE FUNCTION compteurs_inscriptions_par_collecte()
RETURNS TABLE(
    collecte_id UUID,
    total_count BIGINT,
    total_normaux BIGINT,
    total_variantes BIGINT
)
LANGUAGE SQL STABLE
SECURITY DEFINER
AS $$
    SELECT collecte_id,
           COUNT(*)::BIGINT AS total_count,
           COALESCE(SUM(nb_normaux), 0) AS total_normaux,
           COALESCE(SUM(nb_variantes), 0) AS total_variantes
    FROM inscriptions
    WHERE pas_interesse = false AND collecte_id IS NOT NULL
    GROUP BY collecte_id;
$$;

GRANT EXECUTE ON FUNCTION compteurs_inscriptions_par_collecte() TO authenticated;
GRANT EXECUTE ON FUNCTION compteurs_inscriptions_par_collecte() TO anon;
