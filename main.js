(function () {
  'use strict';
  const PROXY_URL = 'https://cucina-ai-proxy.canini-d.workers.dev/api/chat';
  const DB_URL = 'https://cucina-ai-proxy.canini-d.workers.dev/api/recipes';

  const state = {
    mode: 'gustosa',
    taste: 'salato',
    cottura: 'qualsiasi',
    tempo: 'qualsiasi',
    aiModel: 'gpt-4o-mini',
    recipes: [],
    saved: [],
    filteredSaved: []
  };

  function _val(id) { return document.getElementById(id)?.value?.trim() || ''; }

  async function loadSavedFromDB() {
    try {
      const response = await fetch(DB_URL);
      if (response.ok) {
        state.saved = await response.json();
        state.filteredSaved = [...state.saved];
        _updateSavedCountUI();
        _renderSaved();
      }
    } catch (err) {
      console.error("Errore caricamento DB:", err);
      state.saved = [];
      state.filteredSaved = [];
    }
  }

  function _updateSavedCountUI() {
    const badge = document.getElementById('saved-badge');
    const label = document.getElementById('saved-count-label');
    if (badge) badge.textContent = state.saved.length > 0 ? `(${state.saved.length})` : '';
    if (label) label.textContent = `${state.saved.length} ricetta${state.saved.length !== 1 ? 'e' : ''} salvata${state.saved.length !== 1 ? 'e' : ''}`;
  }

  function _renderSaved() {
    const container = document.getElementById('saved-container');
    if (!container) return;
    if (state.filteredSaved.length === 0) {
      container.innerHTML = `
        <div class="no-results" role="status">
          <span class="empty-icon" aria-hidden="true">🔖</span>
          <p class="empty-title">Nessuna ricetta trovata</p>
          <p class="empty-desc">Genera delle ricette e salvale con il tasto 🔖.</p>
        </div>`;
      return;
    }

    const salate = state.filteredSaved.filter(r => r.taste === 'salato' || !r.taste);
    const dolci = state.filteredSaved.filter(r => r.taste === 'dolce');

    let html = '';
    if (salate.length > 0) {
      html += `
        <section class="saved-section">
          <h3 class="saved-section-title">🧂 Ricette Salate</h3>
          <div class="cards-grid">${salate.map((r, i) => renderCard(r, i, true)).join('')}</div>
        </section>`;
    }
    if (dolci.length > 0) {
      html += `
        <section class="saved-section">
          <h3 class="saved-section-title">🍰 Ricette Dolci</h3>
          <div class="cards-grid">${dolci.map((r, i) => renderCard(r, i, true)).join('')}</div>
        </section>`;
    }
    container.innerHTML = html;
  }

  function _showCustomInput(groupId) {
    const wrapId = `${groupId}-custom-wrap`;
    const wrap = document.getElementById(wrapId);
    if (wrap) wrap.style.display = 'block';
  }

  function _hideCustomInput(groupId) {
    const wrapId = `${groupId}-custom-wrap`;
    const wrap = document.getElementById(wrapId);
    if (wrap) wrap.style.display = 'none';
  }

  function _setupRadioGroup(groupId, key) {
    document.querySelectorAll(`#${groupId} .radio-row`).forEach(row => {
      row.addEventListener('click', () => {
        document.querySelectorAll(`#${groupId} .radio-row`).forEach(r => r.classList.remove('active'));
        row.classList.add('active');
        row.setAttribute('aria-checked', 'true');
        const value = row.dataset[key];
        state[key] = value;
        if (value === '__altro__') _showCustomInput(groupId);
        else _hideCustomInput(groupId);
      });
    });
  }

  async function generate() {
    const btn = document.getElementById('btn-generate');
    const container = document.getElementById('results-container');
    btn.disabled = true;
    btn.innerHTML = "Sto cucinando... ⏳";

    try {
      const cucine = Array.from(document.querySelectorAll('.switch-row.active')).map(r => r.dataset.cucina);
      const cucineFinal = cucine.includes('__altra__') 
        ? [...cucine.filter(c => c !== '__altra__'), _val('cucina-altra-text')].filter(Boolean)
        : cucine;

      const cottureFinal = state.cottura === '__altro__' ? _val('cottura-altra-text') : state.cottura;
      const tempoFinal = state.tempo === '__altro__' ? _val('tempo-altro-text') : state.tempo;
      const restrizioni = _val('restrizioni');

      const calTarget = parseInt(_val('target-cal')) || 600;
      const protTarget = parseInt(_val('target-prot')) || null;
      const carbTarget = parseInt(_val('target-carb')) || null;
      const fatTarget = parseInt(_val('target-fat')) || null;

      let nutritionInstructions = `${calTarget} kcal`;
      if (protTarget) nutritionInstructions += `, ${protTarget}g prot`;
      if (carbTarget) nutritionInstructions += `, ${carbTarget}g carb`;
      if (fatTarget) nutritionInstructions += `, ${fatTarget}g fat`;
      nutritionInstructions += ` (tolleranza ±10%)`;

      const ingredients = _val('ingredienti') || 'libera scelta';
      const cuisines = cucineFinal.length > 0 ? cucineFinal.join(', ') : 'Varia';
      const restrictions = restrizioni ? `[ESCLUSIONI: ${restrizioni}]` : '';

      const prompt = `Crea 3 ricette SOLO JSON. ${state.taste}, tipo ${state.mode}.
Ingredienti: ${ingredients}
Cucine: ${cuisines}
Cottura: ${cottureFinal} | Tempo: ${tempoFinal}
Nutrizionali: ${nutritionInstructions}
${restrictions}
SCHEMA RIGIDO - ogni ricetta:
[{"nome":"string","descrizione":"string","cucina":"string","taste":"${state.taste}","valori_per_porzione":{"calorie":0,"proteine":0,"carboidrati":0,"grassi":0},"ingredienti":[{"nome":"string","qty":"string"}],"passaggi":["string"]}]
VINCOLI:
- Calorie entro ±10% target
- Rispetta ingredienti, tempo, cottura ed esclusioni
- Restituisci SOLO un array JSON valido, niente markdown o testo aggiuntivo.`;

      const res = await fetch(PROXY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: prompt }], model: state.aiModel })
      });

      if (!res.ok) throw new Error(`API error: ${res.status}`);

      const data = await res.json();
      const content = data.choices[0].message.content.replace(/```(?:json)?\s*|```/gi, '').trim();

      let recipes = [];
      try {
        const parsed = JSON.parse(content);
        recipes = Array.isArray(parsed) ? parsed : [parsed];
        recipes = recipes.filter(r => r.nome && r.valori_per_porzione && r.ingredienti && r.passaggi);
        if (recipes.length === 0) throw new Error('Nessuna ricetta valida restituita dall\'AI');
      } catch (parseErr) {
        throw new Error(`Risposta AI non valida: ${parseErr.message}`);
      }

      state.recipes = recipes;
      
      // ✅ Sicurezza: assicuriamo che sia un array prima di chiamare .map()
      if (!Array.isArray(state.recipes)) state.recipes = [];
      
      container.innerHTML = `<div class="cards-grid">${state.recipes.map((r, i) => renderCard(r, i, false)).join('')}</div>`;
    } catch (e) {
      console.error('Errore generazione:', e);
      container.innerHTML = `<p class="error">❌ ${e.message || 'Errore nella generazione. Riprova.'}</p>`;
      state.recipes = []; // Reset sicuro in caso di errore
    } finally {
      btn.disabled = false;
      btn.innerHTML = "Genera Ricette ✦";
    }
  }

  function renderCard(recipe, index, isSaved) {
    const v = recipe.valori_per_porzione || { calorie: 0, proteine: 0, carboidrati: 0, grassi: 0 };
    const ingredienti = Array.isArray(recipe.ingredienti)
      ? recipe.ingredienti.map(ing => `${ing.nome || 'Ingrediente'} ${ing.qty ? `(${ing.qty})` : ''}`).join(', ')
      : '';
    const passaggi = Array.isArray(recipe.passaggi) ? recipe.passaggi : [];

    return `
      <article class="recipe-card">
        ${isSaved ? `<button class="btn-delete-recipe" data-recipe-name="${recipe.nome}" title="Elimina">✕</button>` : ''}
        <div class="card-header">
          <span class="card-cuisine">${recipe.cucina || 'Variata'}</span>
          <h3 class="card-title">${recipe.nome}</h3>
          <p class="card-desc">${recipe.descrizione || ''}</p>
        </div>
        <div class="card-macros">
          <div class="macro-item"><strong>${v.calorie}</strong><span>kcal</span></div>
          <div class="macro-item"><strong>${v.proteine}g</strong><span>Prot</span></div>
          <div class="macro-item"><strong>${v.carboidrati}g</strong><span>Carb</span></div>
          <div class="macro-item"><strong>${v.grassi}g</strong><span>Fat</span></div>
        </div>
        ${ingredienti ? `<div class="card-ingredienti"><strong>Ingredienti</strong>${ingredienti}</div>` : ''}
        ${passaggi.length > 0 ? `<div class="card-passaggi"><strong>Procedimento</strong><ol>${passaggi.map(p => `<li>${p}</li>`).join('')}</ol></div>` : ''}
        <div class="card-actions">
          ${!isSaved ? `<button class="btn-save" data-recipe="${encodeURIComponent(JSON.stringify(recipe))}">🔖 Salva</button>` : ''}
        </div>
      </article>
    `;
  }

  async function saveRecipe(e) {
    if (!e.target.classList.contains('btn-save')) return;
    const btn = e.target;
    const recipe = JSON.parse(decodeURIComponent(btn.dataset.recipe));
    recipe.taste = state.taste;
    btn.disabled = true;
    const originalText = btn.innerHTML;
    btn.innerHTML = '⏳ Salvataggio...';
    try {
      const res = await fetch(DB_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(recipe)
      });
      if (!res.ok) throw new Error(`DB error: ${res.status}`);
      btn.innerHTML = '✓ Salvata';
      await loadSavedFromDB();
      setTimeout(() => { btn.innerHTML = originalText; btn.disabled = false; }, 2000);
    } catch (err) {
      console.error('Errore salvataggio:', err);
      btn.innerHTML = '❌ Errore';
      btn.disabled = false;
      setTimeout(() => btn.innerHTML = originalText, 3000);
    }
  }

  async function deleteRecipe(e) {
    if (!e.target.classList.contains('btn-delete-recipe')) return;
    const btn = e.target;
    const recipeName = btn.dataset.recipeName;
    if (!confirm(`Elimina "${recipeName}"?`)) return;
    btn.disabled = true;
    const originalText = btn.innerHTML;
    btn.innerHTML = '⏳';
    try {
      const res = await fetch(DB_URL, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: recipeName })
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(`DB error: ${res.status} - ${errData.error || 'Unknown'}`);
      }
      btn.innerHTML = '✓';
      await loadSavedFromDB();
      setTimeout(() => { btn.innerHTML = originalText; btn.disabled = false; }, 1500);
    } catch (err) {
      console.error('Errore eliminazione:', err);
      btn.innerHTML = '❌';
      btn.disabled = false;
      setTimeout(() => btn.innerHTML = originalText, 3000);
    }
  }

  function filterSaved(query) {
    const q = query.toLowerCase();
    state.filteredSaved = state.saved.filter(r =>
      r.nome.toLowerCase().includes(q) || (r.cucina && r.cucina.toLowerCase().includes(q))
    );
    _renderSaved();
  }

  function resetForm() {
    ['target-cal','target-prot','target-carb','target-fat','ingredienti','restrizioni','cucina-altra-text','cottura-altra-text','tempo-altro-text'].forEach(id => {
      const el = document.getElementById(id); if(el) el.value = '';
    });
    document.querySelectorAll('.taste-tab').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-pressed','false'); });
    document.querySelector('[data-taste="salato"]').classList.add('active');
    document.querySelector('[data-taste="salato"]').setAttribute('aria-pressed','true');
    state.taste = 'salato';
    document.querySelectorAll('.mode-btn').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-pressed','false'); });
    document.querySelector('[data-mode="gustosa"]').classList.add('active');
    document.querySelector('[data-mode="gustosa"]').setAttribute('aria-pressed','true');
    state.mode = 'gustosa';
    document.querySelectorAll('.switch-row').forEach(r => r.classList.remove('active'));
    _hideCustomInput('cucina');
    document.querySelectorAll('#cottura-group .radio-row').forEach((r,i)=>{ r.classList.toggle('active',i===0); r.setAttribute('aria-checked',i===0); });
    state.cottura = 'qualsiasi'; _hideCustomInput('cottura');
    document.querySelectorAll('#tempo-group .radio-row').forEach((r,i)=>{ r.classList.toggle('active',i===0); r.setAttribute('aria-checked',i===0); });
    state.tempo = 'qualsiasi'; _hideCustomInput('tempo');
    document.querySelectorAll('.model-seg-btn').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-pressed','false'); });
    document.querySelector('[data-model="gpt-4o-mini"]').classList.add('active');
    document.querySelector('[data-model="gpt-4o-mini"]').setAttribute('aria-pressed','true');
    state.aiModel = 'gpt-4o-mini';
    const hint = document.getElementById('model-seg-hint'); if(hint) hint.textContent = 'Standard · economico';
  }

  function init() {
    loadSavedFromDB();
    document.querySelectorAll('.taste-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.taste-tab').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-pressed','false'); });
        btn.classList.add('active'); btn.setAttribute('aria-pressed','true'); state.taste = btn.dataset.taste;
      });
    });
    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.mode-btn').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-pressed','false'); });
        btn.classList.add('active'); btn.setAttribute('aria-pressed','true'); state.mode = btn.dataset.mode;
      });
    });
    _setupRadioGroup('cottura-group', 'cottura');
    _setupRadioGroup('tempo-group', 'tempo');
    document.querySelectorAll('.switch-row').forEach(row => {
      row.addEventListener('click', () => {
        row.classList.toggle('active'); row.setAttribute('aria-checked', row.classList.contains('active'));
        const hasOther = Array.from(document.querySelectorAll('.switch-row.active')).some(r => r.dataset.cucina === '__altra__');
        hasOther ? _showCustomInput('cucina') : _hideCustomInput('cucina');
      });
    });
    document.querySelectorAll('.model-seg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.model-seg-btn').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-pressed','false'); });
        btn.classList.add('active'); btn.setAttribute('aria-pressed','true'); state.aiModel = btn.dataset.model;
        const hint = document.getElementById('model-seg-hint');
        if(hint) hint.textContent = state.aiModel === 'gpt-4o-mini' ? 'Standard · economico' : 'Avanzato';
      });
    });
    document.querySelectorAll('.nav-tab').forEach(tab => {
      tab.addEventListener('click', async () => {
        const target = tab.getAttribute('aria-controls').replace('view-','');
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        document.getElementById('view-'+target).classList.add('active');
        document.querySelectorAll('.nav-tab').forEach(t => { t.classList.remove('active'); t.setAttribute('aria-selected','false'); });
        tab.classList.add('active'); tab.setAttribute('aria-selected','true');
        if(target === 'saved') await loadSavedFromDB();
      });
    });
    const logo = document.querySelector('.logo');
    if(logo) {
      logo.addEventListener('click', (e) => {
        e.preventDefault();
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        document.getElementById('view-generate').classList.add('active');
        document.querySelectorAll('.nav-tab').forEach(t => { t.classList.remove('active'); t.setAttribute('aria-selected','false'); });
        document.getElementById('tab-generate').classList.add('active'); document.getElementById('tab-generate').setAttribute('aria-selected','true');
        resetForm(); window.scrollTo(0,0);
      });
    }
    document.getElementById('btn-generate').addEventListener('click', generate);
    document.getElementById('btn-reset').addEventListener('click', resetForm);
    document.addEventListener('click', saveRecipe);
    document.addEventListener('click', deleteRecipe);
    const searchInput = document.getElementById('search-input');
    if(searchInput) searchInput.addEventListener('input', (e) => filterSaved(e.target.value));
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();