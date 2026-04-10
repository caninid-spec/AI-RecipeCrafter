export default {
  async fetch(request, env) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === '/api/chat') {
      const body = await request.json();
      
      const systemPrompt = {
        role: "system",
        content: `Sei uno Chef AI. Rispondi SOLO in formato JSON (Array di oggetti). Ogni oggetto deve avere: nome, descrizione, cucina, valori_per_porzione (calorie, proteine, carboidrati, grassi), ingredienti (array con nome e qty), passaggi (array di stringhe).`
      };

      const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: body.model || 'gpt-4o-mini',
          messages: [systemPrompt, ...body.messages],
          response_format: { type: "json_object" }
        }),
      });

      return new Response(aiRes.body, { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (url.pathname === '/api/recipes') {
      if (request.method === 'GET') {
        const { results } = await env.DB.prepare("SELECT json_data FROM ricette_salvate").all();
        return new Response(JSON.stringify(results.map(r => JSON.parse(r.json_data))), { headers: corsHeaders });
      }
      if (request.method === 'POST') {
        const recipe = await request.json();
        const id = recipe.nome.replace(/\s+/g, '_').toLowerCase();
        await env.DB.prepare("INSERT OR REPLACE INTO ricette_salvate (id, nome, json_data) VALUES (?, ?, ?)")
          .bind(id, recipe.nome, JSON.stringify(recipe)).run();
        return new Response(JSON.stringify({success: true}), { headers: corsHeaders });
      }
    }

    return new Response('Not Found', { status: 404 });
  }
};