/**
 * worker.js — Cloudflare Worker · La Cucina AI Proxy → OpenAI
 *
 * Fa da intermediario sicuro tra il frontend (GitHub Pages) e l'API OpenAI.
 * La chiave API non viene mai esposta al browser.
 *
 * ─── ISTRUZIONI DI DEPLOY ────────────────────────────────────────────────
 *
 *  1. Vai su https://workers.cloudflare.com → crea account gratuito
 *
 *  2. Clicca "Create application" → "Create Worker"
 *     Dai un nome, es. "cucina-ai-proxy" → clicca "Deploy"
 *
 *  3. Clicca "Edit code" → cancella tutto → incolla questo file → "Deploy"
 *
 *  4. Vai su Settings → Variables and Secrets → "Add variable"
 *     → Nome:   OPENAI_API_KEY
 *     → Valore: sk-... (la tua chiave da https://platform.openai.com/api-keys)
 *     → Tipo:   Secret → "Save"
 *
 *  5. Copia l'URL del Worker:
 *       https://cucina-ai-proxy.<tuo-username>.workers.dev
 *
 *  6. In main.js sostituisci la riga PROXY_URL con il tuo URL + /api/chat:
 *       const PROXY_URL = 'https://cucina-ai-proxy.mario.workers.dev/api/chat';
 *
 *  7. Commit + push su GitHub → l'app è online e funziona su mobile. ✓
 *
 * ─────────────────────────────────────────────────────────────────────────
 */

export default {
  async fetch(request, env) {

    /* ── CORS preflight ── */
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    /* ── Accetta solo POST /api/chat ── */
    const url = new URL(request.url);
    if (request.method !== 'POST' || url.pathname !== '/api/chat') {
      return json({ error: 'Not found' }, 404);
    }

    /* ── Verifica chiave API ── */
    if (!env.OPENAI_API_KEY) {
      return json({
        error: { message: 'OPENAI_API_KEY non configurata. Vai su Settings → Variables and Secrets nel Worker.' }
      }, 500);
    }

    /* ── Legge il body ── */
    let body;
    try { body = await request.json(); }
    catch { return json({ error: { message: 'Body JSON non valido.' } }, 400); }

    const { messages, model } = body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return json({ error: { message: 'Campo "messages" mancante o vuoto.' } }, 400);
    }

    /* ── Modelli permessi (whitelist di sicurezza) ── */
    const ALLOWED_MODELS = ['gpt-4o-mini', 'gpt-4.1-mini'];
    const selectedModel  = ALLOWED_MODELS.includes(model) ? model : 'gpt-4o-mini';

    /* ── Chiama OpenAI ── */
    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model:       selectedModel,
        max_tokens:  4000,
        temperature: 0.7,
        messages,
      }),
    });

    const data = await openaiResponse.json();

    return new Response(JSON.stringify(data), {
      status:  openaiResponse.status,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
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
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}
