export default {
  async fetch(request, env) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);

    // ── POST /api/chat: forward a OpenAI con system prompt ──
    if (request.method === 'POST' && url.pathname === '/api/chat') {
      try {
        const body = await request.json();
        
        const systemPrompt = {
          role: "system",
          content: `Sei uno Chef AI professionista. Rispondi SOLO in formato JSON (Array di oggetti). Ogni oggetto deve avere: nome (string), descrizione (string), cucina (string), valori_per_porzione (object con calorie, proteine, carboidrati, grassi come numeri), ingredienti (array di oggetti con nome e qty), passaggi (array di stringhe).`
        };

        const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
          },
          body: JSON.stringify({
            model: body.model || 'gpt-4o-mini',
            messages: [systemPrompt, ...(body.messages || [])],
            response_format: { type: "json_object" }
          }),
        });

        if (!aiRes.ok) {
          throw new Error(`OpenAI API error: ${aiRes.status}`);
        }

        const aiData = await aiRes.json();
        return new Response(JSON.stringify(aiData), { 
          headers: { 
            ...corsHeaders, 
            'Content-Type': 'application/json' 
          } 
        });
      } catch (err) {
        console.error('Chat error:', err);
        return new Response(
          JSON.stringify({ error: 'Errore nella generazione ricette' }),
          { status: 500, headers: corsHeaders }
        );
      }
    }

    // ── GET /api/recipes: leggi dal DB ──
    if (url.pathname === '/api/recipes' && request.method === 'GET') {
      try {
        if (!env.DB) {
          return new Response(
            JSON.stringify([]),
            { headers: corsHeaders }
          );
        }

        const result = await env.DB.prepare(
          "SELECT json_data FROM ricette_salvate ORDER BY rowid DESC"
        ).all();

        const recipes = result.success && result.results 
          ? result.results
              .map(r => {
                try {
                  return JSON.parse(r.json_data);
                } catch {
                  return null;
                }
              })
              .filter(Boolean)
          : [];

        return new Response(JSON.stringify(recipes), { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      } catch (err) {
        console.error('DB read error:', err);
        return new Response(
          JSON.stringify([]),
          { headers: corsHeaders }
        );
      }
    }

    // ── POST /api/recipes: salva nel DB ──
    if (url.pathname === '/api/recipes' && request.method === 'POST') {
      try {
        const recipe = await request.json();

        if (!recipe.nome) {
          return new Response(
            JSON.stringify({ error: 'Nome ricetta mancante' }),
            { status: 400, headers: corsHeaders }
          );
        }

        if (!env.DB) {
          return new Response(
            JSON.stringify({ success: false, error: 'DB non disponibile' }),
            { status: 500, headers: corsHeaders }
          );
        }

        const id = recipe.nome.replace(/\s+/g, '_').toLowerCase();
        
        await env.DB.prepare(
          "INSERT OR REPLACE INTO ricette_salvate (id, nome, json_data) VALUES (?, ?, ?)"
        ).bind(id, recipe.nome, JSON.stringify(recipe)).run();

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (err) {
        console.error('DB write error:', err);
        return new Response(
          JSON.stringify({ error: 'Errore salvataggio ricetta' }),
          { status: 500, headers: corsHeaders }
        );
      }
    }

    // ── DELETE /api/recipes: elimina dal DB ──
    if (url.pathname === '/api/recipes' && request.method === 'DELETE') {
      try {
        const { nome } = await request.json();

        if (!nome) {
          return new Response(
            JSON.stringify({ error: 'Nome ricetta mancante' }),
            { status: 400, headers: corsHeaders }
          );
        }

        if (!env.DB) {
          return new Response(
            JSON.stringify({ success: false, error: 'DB non disponibile' }),
            { status: 500, headers: corsHeaders }
          );
        }

        const id = nome.replace(/\s+/g, '_').toLowerCase();
        
        await env.DB.prepare("DELETE FROM ricette_salvate WHERE id = ?").bind(id).run();

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (err) {
        console.error('DB delete error:', err);
        return new Response(
          JSON.stringify({ error: 'Errore eliminazione ricetta' }),
          { status: 500, headers: corsHeaders }
        );
      }
    }

    return new Response('Not Found', { status: 404 });
  }
};
