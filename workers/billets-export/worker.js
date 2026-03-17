/**
 * Cloudflare Worker — billets-export
 * ===================================
 * Endpoint sécurisé pour exporter les billets depuis Supabase
 * vers Google Sheets (utilisé par le Google Apps Script de sync).
 *
 * Secrets à configurer dans Cloudflare :
 *   - SUPABASE_URL          : https://<ref>.supabase.co
 *   - SUPABASE_SERVICE_KEY   : service_role key Supabase
 *   - EXPORT_API_KEY         : clé API partagée avec le Apps Script
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // --- CORS preflight ---
    // SEC-04 — Pas de CORS necessaire : le Apps Script appelle en mode serveur (UrlFetchApp)
    // Si un domaine frontend specifique doit appeler, le whitelister ici.
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204 });
    }

    // --- Route : GET /billets-export ---
    if (url.pathname === '/billets-export' && request.method === 'GET') {

      // Vérification de la clé API
      const apiKey = request.headers.get('X-Api-Key');
      if (!apiKey || apiKey !== env.EXPORT_API_KEY) {
        return jsonResponse({ error: 'Clé API invalide' }, 403);
      }

      try {
        // Lecture des billets depuis Supabase (uniquement les 7 champs + id)
        const supabaseRes = await fetch(
          `${env.SUPABASE_URL}/rest/v1/billets?select=id,Dep,Reference,Millesime,Version,Cp,Ville,NomBillet&order=id.asc`,
          {
            headers: {
              'apikey': env.SUPABASE_SERVICE_KEY,
              'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
            },
          }
        );

        if (!supabaseRes.ok) {
          // SEC-07 — Ne pas exposer les details d'erreur Supabase au client
          console.error('Erreur Supabase:', await supabaseRes.text());
          return jsonResponse({ error: 'Erreur serveur' }, 502);
        }

        const billets = await supabaseRes.json();

        return jsonResponse({ billets, count: billets.length }, 200);

      } catch (e) {
        // SEC-07 — Ne pas exposer les details d'erreur internes
        console.error('Erreur interne worker:', e.message);
        return jsonResponse({ error: 'Erreur interne' }, 500);
      }
    }

    // --- Route inconnue ---
    return new Response('Not found', { status: 404 });
  },
};

function jsonResponse(data, status) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
