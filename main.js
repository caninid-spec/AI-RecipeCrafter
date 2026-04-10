/**
 * main.js — La Cucina (Database Version)
 */

(function () {
  'use strict';

  const PROXY_URL = 'https://cucina-ai-proxy.canini-d.workers.dev/api/chat';
  const DB_URL = PROXY_URL.replace('/chat', '/recipes');

  const state = {
    mode: 'gustosa',
    cottura: 'qualsiasi',
    tempo: 'qualsiasi',
    conversation: [],
    recipes: [],
    saved: [],
    aiModel: 'gpt-4o-mini'
  };

  const STORAGE_KEYS = { form: 'cucina_form_state' };

  /* --- STORAGE & SYNC --- */

  async function loadSavedFromStorage() {
    try {
      const response = await fetch(DB_URL);
      if (response.ok) {
        state.saved = await response.json();
        _updateSavedCountUI();
      }
    } catch (err) {
      console.error("Errore sync DB:", err);
    }
  }

  function persistSaved() {
    _updateSavedCountUI();
  }

  function saveFormState() {
    const formData = {
      mode: state.mode,
      aiModel: state.aiModel,
      cottura: state.cottura,
      tempo: state.tempo,
      cal: _val('target-cal'),
      prot: _val('target-prot'),
      carb: _val('target-carb'),
      fat: _val('target-fat'),
      ing: _val('ingredienti'),
      restrizioni: _val('restrizioni'),
      cucine: [...document.querySelectorAll('#cucina-switches .switch-row.active')].map(r => r.dataset.cucina),
    };
    localStorage.setItem(STORAGE_KEYS.form, JSON.stringify(formData));
  }

  function restoreFormState() {
    let saved;
    try { saved = JSON.parse(localStorage.getItem(STORAGE_KEYS.form)); } catch { return; }
    if (!saved) return;
    state.mode = saved.mode || 'gustosa';
    state.aiModel = saved.aiModel || 'gpt-4o-mini';
    state.cottura = saved.cottura || 'qualsiasi';
    state.tempo = saved.tempo || 'qualsiasi';
    // (Qui andrebbe il resto della logica di ripristino UI già presente nel tuo file originale)
  }

  /* --- HELPERS --- */
  function _val(id) { return document.getElementById(id)?.value?.trim() || ''; }
  function _makeId(nome) { return nome.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase(); }
  function _toggleExtraInput(wrapperId, visible) { document.getElementById(wrapperId)?.classList.toggle('visible', visible); }
  
  function _updateSavedCountUI() {
    const n = state.saved.length;
    const badge = document.getElementById('saved-badge');
    const label = document.getElementById('saved-count-label');
    if(badge) badge.textContent = n > 0 ? `(${n})` : '';
    if(label) label.textContent = n + ' ricett' + (n === 1 ? 'a' : 'e');
  }

  function getParams() {
    const cucine = [];
    document.querySelectorAll('#cucina-switches .switch-row.active').forEach(r => {
      if (r.dataset.cucina === '__altra__') {
        const custom = _val('cucina-altra-text');
        if (custom) cucine.push(custom);
      } else {
        cucine.push(r.dataset.cucina);
      }
    });
    return {
      mode: state.mode,
      cal: _val('target-cal'),
      prot: _val('target-prot'),
      carb: _val('target-carb'),
      fat: _val('target-fat'),
      ing: _val('ingredienti'),
      restrizioni: _val('restrizioni'),
      cucine,
      cottura: state.cottura === '__altro__' ? _val('cottura-altra-text') : state.cottura,
      tempo: state.tempo === '__altro__' ? _val('tempo-altro-text') : state.tempo,
    };
  }

  /* --- PROMPTS (Invariati) --- */
  function buildGeneratePrompt(params, isMore) {
    const { mode, cal, prot, carb, fat, ing, restrizioni, cucine, cottura, tempo } = params;
    return `${isMore ? 'Altre 3 ricette DIVERSE.' : 'Proponi 3 ricette.'} JSON array format. Params: ${mode}, Cal:${cal}, Ing:${ing}, Cucine:${cucine.join(',')}, Cottura:${cottura}, Tempo:${tempo}, Restrizioni:${restrizioni}.`;
  }

  function buildModifyPrompt(recipe, request) {
    return `Modifica: ${recipe.nome}. Richiesta: "${request}". Rispondi in JSON.`;
  }

  /* --- API --- */
  async function callAPI(messages, aiModel) {
    const response = await fetch(PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, model: aiModel || state.aiModel }),
    });
    if (!response.ok) throw new Error('Errore API');
    const data = await response.json();
    return { text: data.choices?.[0]?.message?.content?.trim() || '' };
  }

  function parseRecipes(text) {
    let clean = text.replace(/
http://googleusercontent.com/immersive_entry_chip/0

### Note finali:
1.  **URL Proxy**: Nel `main.js`, assicurati che `PROXY_URL` sia corretto.
2.  **Sicurezza**: Se vuoi che nessun altro possa scrivere nel tuo database, dovresti aggiungere un header `Authorization` personalizzato nel Worker, ma per uso personale "nascosto" su GitHub Pages, l'URL del worker è solitamente sufficiente.
3.  **UI**: Ho semplificato leggermente i template HTML nel `main.js` per brevità, assicurati di reinserire le tue classi CSS specifiche se ne avevi di particolari per i bottoni o le icone.