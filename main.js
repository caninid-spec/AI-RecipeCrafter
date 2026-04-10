(function () {
  'use strict';

  const PROXY_URL = 'https://cucina-ai-proxy.canini-d.workers.dev/api/chat';
  const DB_URL = PROXY_URL.replace('/chat', '/recipes');

  const state = {
    mode: 'gustosa',
    taste: 'salato',
    aiModel: 'gpt-4o-mini',
    cottura: 'qualsiasi',
    tempo: 'qualsiasi',
    recipes: [],
    saved: []
  };

  /* --- HELPERS --- */
  function _val(id) { return document.getElementById(id)?.value?.trim() || ''; }
  function _makeId(nome) { return nome.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase(); }

  function _updateSavedCountUI() {
    const n = state.saved.length;
    const badge = document.getElementById('saved-badge');
    const label = document.getElementById('saved-count-label');
    if (badge) badge.textContent = n > 0 ? `(${n})` : '';
    if (label) label.textContent = n + ' ricett' + (n === 1 ? 'a' : 'e');
  }

  async function loadSavedFromStorage() {
    try {
      const response = await fetch(DB_URL);
      if (response.ok) {
        state.saved = await response.json();
        _updateSavedCountUI();
      }
    } catch (err) { console.error("Errore DB:", err); }
  }

  /* --- API CALL --- */
  async function callAPI(messages) {
    const response = await fetch(PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, model: state.aiModel }),
    });
    if (!response.ok) throw new Error('Errore API');
    const data = await response.json();
    let content = data.choices?.[0]?.message?.content || '';
    return { text: content.replace(/```json|```/gi, '').trim() };
  }

  /* --- RENDERING --- */
  function renderCard(recipe, index, isSavedView) {
    const id = _makeId(recipe.nome) + '_' + index;
    const v = recipe.valori_per_porzione || { calorie:0, proteine:0, carboidrati:0, grassi:0 };
    const alreadySaved = state.saved.some(r => r.nome === recipe.nome);

    return `
      <article class="recipe-card" data-nome="${recipe.nome}">
        <div class="card-header">
          <div class="card-meta"><span class="card-cuisine">${recipe.cucina || 'Variata'}</span></div>
          <h3 class="card-title">${recipe.nome}</h3>
          <p class="card-desc">${recipe.descrizione}</p>
        </div>
        <div class="card-macros">
          <div class="macro-item"><span class="macro-val">${v.calorie}</span><span class="macro-lbl">kcal</span></div>
          <div class="macro-item"><span class="macro-val">${v.proteine}g</span><span class="macro-lbl">Prot</span></div>
          <div class="macro-item"><span class="macro-val">${v.carboidrati}g</span><span class="macro-lbl">Carb</span></div>
          <div class="macro-item"><span class="macro-val">${v.grassi}g</span><span class="macro-lbl">Fat</span></div>
        </div>
        <button class="btn-body-toggle" data-action="toggle-body">Dettagli ricetta ▾</button>
        <div class="card-body" hidden>
          <h4>Ingredienti</h4>
          <ul class="ingredient-list">${recipe.ingredienti.map(i => `<li>${i.qty || ''} ${i.nome}</li>`).join('')}</ul>
          <h4>Preparazione</h4>
          <ol class="steps-list">${recipe.passaggi.map(p => `<li>${p}</li>`).join('')}</ol>
        </div>
        <div class="card-actions">
          <button class="btn-save ${alreadySaved ? 'saved' : ''}" data-action="${isSavedView ? 'unsave' : 'save'}">
            ${isSavedView ? '🗑 Rimuovi' : (alreadySaved ? '✓ Salvata' : '🔖 Salva')}
          </button>
        </div>
      </article>`;
  }

  async function generate() {
    const container = document.getElementById('results-container');
    const btn = document.getElementById('btn-generate');
    btn.disabled = true;
    btn.textContent = "Cucinando...";
    
    container.innerHTML = `<div class="loader-wrap"><p>L'AI sta creando le tue ricette...</p></div>`;

    const cucine = [...document.querySelectorAll('#cucina-switches .switch-row.active')].map(r => r.dataset.cucina);
    const prompt = `Agisci come Chef. Crea 3 ricette ${state.taste} (stile ${state.mode}). 
      Ingredienti: ${_val('ingredienti')}. 
      Cottura: ${state.cottura}. Tempo: ${state.tempo}.
      Cucine preferite: ${cucine.join(', ')}.
      Target: ${_val('target-cal')}kcal, ${_val('target-prot')}g prot, ${_val('target-carb')}g carb, ${_val('target-fat')}g grassi.
      RISPONDI SOLO CON UN ARRAY JSON DI OGGETTI.`;

    try {
      const { text } = await callAPI([{ role: 'user', content: prompt }]);
      state.recipes = JSON.parse(text);
      container.innerHTML = `<div class="cards-grid">${state.recipes.map((r, i) => renderCard(r, i, false)).join('')}</div>`;
    } catch (e) {
      container.innerHTML = `<p class="error">Errore: Assicurati che il Worker sia configurato correttamente.</p>`;
    } finally {
      btn.disabled = false;
      btn.textContent = "Genera Ricette ✦";
    }
  }

  /* --- INITIALIZATION & EVENTS --- */
  function init() {
    loadSavedFromStorage();

    // Pulsanti Taste (Salato/Dolce)
    document.querySelectorAll('.taste-tab').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('.taste-tab').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-pressed', 'false'); });
        btn.classList.add('active');
        btn.setAttribute('aria-pressed', 'true');
        state.taste = btn.dataset.taste;
      };
    });

    // Pulsanti Mode (Gustosa/Fit/Leggera)
    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('.mode-btn').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-pressed', 'false'); });
        btn.classList.add('active');
        btn.setAttribute('aria-pressed', 'true');
        state.mode = btn.dataset.mode;
      };
    });

    // Selettori Radio (Cottura e Tempo)
    const setupRadio = (groupId, stateKey) => {
      document.querySelectorAll(`#${groupId} .radio-row`).forEach(row => {
        row.onclick = () => {
          document.querySelectorAll(`#${groupId} .radio-row`).forEach(r => r.classList.remove('active'));
          row.classList.add('active');
          state[stateKey] = row.dataset[stateKey];
        };
      });
    };
    setupRadio('cottura-group', 'cottura');
    setupRadio('tempo-group', 'tempo');

    // Navigazione Tab
    document.querySelectorAll('.nav-tab').forEach(tab => {
      tab.onclick = () => {
        const target = tab.getAttribute('aria-controls').replace('view-', '');
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        document.getElementById('view-' + target).classList.add('active');
        document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        if(target === 'saved') renderSaved();
      };
    });

    // Click Genera
    document.getElementById('btn-generate').onclick = () => generate();

    // Delegazione per pulsanti dentro le card
    document.addEventListener('click', async (e) => {
      const target = e.target;
      if (target.dataset.action === 'toggle-body') {
        const body = target.closest('.recipe-card').querySelector('.card-body');
        body.hidden = !body.hidden;
      }
      if (target.dataset.action === 'save') {
        const card = target.closest('.recipe-card');
        const recipe = state.recipes.find(r => r.nome === card.dataset.nome);
        const res = await fetch(DB_URL, { method: 'POST', body: JSON.stringify(recipe) });
        if(res.ok) { target.classList.add('saved'); target.textContent = '✓ Salvata'; loadSavedFromStorage(); }
      }
    });
  }

  function renderSaved() {
    const container = document.getElementById('saved-container');
    if (state.saved.length === 0) {
      container.innerHTML = '<p class="empty-state">Nessuna ricetta salvata.</p>';
      return;
    }
    container.innerHTML = `<div class="cards-grid">${state.saved.map((r, i) => renderCard(r, i, true)).join('')}</div>`;
  }

  init();
})();