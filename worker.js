export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders() });

    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === '/api/chat') {
      const body = await request.json();
      
      // ISTRUZIONI CRUCIALI PER L'IA
      const systemPrompt = {
        role: "system",
        content: `Sei un assistente culinario che risponde ESCLUSIVAMENTE in formato JSON. 
        Struttura richiesta (ARRAY di oggetti):
        [{
          "nome": "Titolo",
          "descrizione": "Breve frase",
          "cucina": "Etnia",
          "valori_per_porzione": { "calorie": 0, "proteine": 0, "carboidrati": 0, "grassi": 0 },
          "ingredienti": [{ "nome": "mela", "qty": "1" }],
          "passaggi": ["fase 1", "fase 2"]
        }]`
      };

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: body.model || 'gpt-4o-mini',
          messages: [systemPrompt, ...body.messages],
          temperature: 0.5,
        }),
      });

      const data = await response.json();
      return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json', ...corsHeaders() } });
    }

    // Gestione Database (Recupero)
    if (request.method === 'GET' && url.pathname === '/api/recipes') {
      const { results } = await env.DB.prepare("SELECT json_data FROM ricette_salvate").all();
      return new Response(JSON.stringify(results.map(r => JSON.parse(r.json_data))), { headers: corsHeaders() });
    }

    // Gestione Database (Salvataggio)
    if (request.method === 'POST' && url.pathname === '/api/recipes') {
      const recipe = await request.json();
      const id = recipe.nome.replace(/\s+/g, '_').toLowerCase();
      await env.DB.prepare("INSERT OR REPLACE INTO ricette_salvate (id, nome, json_data) VALUES (?, ?, ?)")
        .bind(id, recipe.nome, JSON.stringify(recipe)).run();
      return new Response(JSON.stringify({success: true}), { headers: corsHeaders() });
    }

    return new Response('Not Found', { status: 404 });
  }
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}