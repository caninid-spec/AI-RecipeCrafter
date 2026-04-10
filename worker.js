/**
 * worker.js — Cloudflare Worker con supporto D1 Database
 */

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    const url = new URL(request.url);

    // --- ROTTA AI: Generazione e Modifica ---
    if (request.method === 'POST' && url.pathname === '/api/chat') {
      if (!env.OPENAI_API_KEY) return json({ error: 'Chiave API mancante.' }, 500);

      const body = await request.json();
      const ALLOWED_MODELS = ['gpt-4o-mini', 'gpt-4.1-mini'];
      const selectedModel = ALLOWED_MODELS.includes(body.model) ? body.model : 'gpt-4o-mini';

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: selectedModel,
          max_tokens: 4000,
          temperature: 0.7,
          messages: body.messages,
        }),
      });

      const data = await response.json();
      return new Response(JSON.stringify(data), {
        status: response.status,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }

    // --- ROTTA DB: Recupera Ricette ---
    if (request.method === 'GET' && url.pathname === '/api/recipes') {
      try {
        const { results } = await env.DB.prepare(
          "SELECT json_data FROM ricette_salvate ORDER BY data_salvataggio DESC"
        ).all();
        const recipes = results.map(row => JSON.parse(row.json_data));
        return json(recipes);
      } catch (e) {
        return json({ error: e.message }, 500);
      }
    }

    // --- ROTTA DB: Salva Ricetta ---
    if (request.method === 'POST' && url.pathname === '/api/recipes') {
      try {
        const recipe = await request.json();
        const id = recipe.nome.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        
        await env.DB.prepare(
          "INSERT OR REPLACE INTO ricette_salvate (id, nome, cucina, json_data) VALUES (?, ?, ?, ?)"
        ).bind(id, recipe.nome, recipe.cucina, JSON.stringify(recipe)).run();
        
        return json({ success: true });
      } catch (e) {
        return json({ error: e.message }, 500);
      }
    }

    // --- ROTTA DB: Rimuovi Ricetta ---
    if (request.method === 'DELETE' && url.pathname === '/api/recipes') {
      try {
        const { nome } = await request.json();
        const id = nome.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        await env.DB.prepare("DELETE FROM ricette_salvate WHERE id = ?").bind(id).run();
        return json({ success: true });
      } catch (e) {
        return json({ error: e.message }, 500);
      }
    }

    return json({ error: 'Not found' }, 404);
  },
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}