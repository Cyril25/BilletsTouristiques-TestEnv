-- Policy DELETE manquante pour les enveloppes
-- Permet au collecteur de supprimer ses enveloppes (annulation d'envoi)
CREATE POLICY enveloppes_collecteur_delete ON enveloppes
    FOR DELETE
    USING (collecteur_alias IN (
        SELECT alias FROM collecteurs WHERE email_membre = auth.jwt() ->> 'email'
    ));
