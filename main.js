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

    container.innerHTML = `<div class="cards-grid">${state.filteredSaved.map((r, i) => renderCard(r, i, true)).join('')}</div>`;
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

        // Mostra/nascondi input personalizzato
        if (value === '__altro__') {
          _showCustomInput(groupId);
        } else {
          _hideCustomInput(groupId);
        }
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

      const prompt = `Agisci come Chef Professionista. Crea 3 ricette ${state.taste} di tipo ${state.mode}.
Ingredienti base: ${_val('ingredienti')}.
Cucine preferite: ${cucineFinal.length > 0 ? cucineFinal.join(', ') : 'Internazionale'}.
Metodo cottura: ${cottureFinal}, Tempo: ${tempoFinal}.
Target nutrizionale: ${_val('target-cal')}kcal, ${_val('target-prot')}g proteine, ${_val('target-carb')}g carboidrati, ${_val('target-fat')}g grassi.
${restrizioni ? `Restrizioni: ${restrizioni}` : ''}
RISPONDI ESCLUSIVAMENTE IN FORMATO JSON (ARRAY DI OGGETTI). Ogni oggetto deve avere: nome, descrizione, cucina, valori_per_porzione (calorie, proteine, carboidrati, grassi), ingredienti (array con nome e qty), passaggi (array di stringhe).`;

      const res = await fetch(PROXY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: prompt }],
          model: state.aiModel
        })
      });

      if (!res.ok) throw new Error(`API error: ${res.status}`);

      const data = await res.json();
      const content = data.choices[0].message.content.replace(/```json|```/gi, '').trim();
      state.recipes = JSON.parse(content);
      
      container.innerHTML = `<div class="cards-grid">${state.recipes.map((r, i) => renderCard(r, i, false)).join('')}</div>`;
    } catch (e) {
      console.error('Errore generazione:', e);
      container.innerHTML = `<p class="error">❌ Errore nella generazione. Verifica la connessione e riprova.</p>`;
    } finally {
      btn.disabled = false;
      btn.innerHTML = "Genera Ricette ✦";
    }
  }

  function renderCard(recipe, index, isSaved) {
    const v = recipe.valori_per_porzione || { calorie: 0, proteine: 0, carboidrati: 0, grassi: 0 };
    const ingredienti = Array.isArray(recipe.ingredienti) 
      ? recipe.ingredienti.map(ing => `${ing.nome || ing} ${ing.qty ? `(${ing.qty})` : ''}`).join(', ')
      : '';
    const passaggi = Array.isArray(recipe.passaggi) ? recipe.passaggi : [];

    return `
      <article class="recipe-card">
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
        ${ingredienti ? `<div class="card-ingredienti"><strong>Ingredienti:</strong> ${ingredienti}</div>` : ''}
        ${passaggi.length > 0 ? `
          <div class="card-passaggi">
            <strong>Procedimento:</strong>
            <ol>${passaggi.map(p => `<li>${p}</li>`).join('')}</ol>
          </div>
        ` : ''}
        <div class="card-actions">
          <button class="btn-save" data-recipe="${encodeURIComponent(JSON.stringify(recipe))}" aria-label="Salva ricetta">🔖 Salva</button>
        </div>
      </article>`;
  }

  async function saveRecipe(e) {
    if (!e.target.classList.contains('btn-save')) return;
    
    const btn = e.target;
    const recipe = JSON.parse(decodeURIComponent(btn.dataset.recipe));
    
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
      
      setTimeout(() => {
        btn.innerHTML = originalText;
        btn.disabled = false;
      }, 2000);
    } catch (err) {
      console.error('Errore salvataggio:', err);
      btn.innerHTML = '❌ Errore';
      btn.disabled = false;
      setTimeout(() => btn.innerHTML = originalText, 3000);
    }
  }

  function filterSaved(query) {
    const q = query.toLowerCase();
    state.filteredSaved = state.saved.filter(r => 
      r.nome.toLowerCase().includes(q) || 
      (r.cucina && r.cucina.toLowerCase().includes(q))
    );
    _renderSaved();
  }

  function resetForm() {
    // Reset input text
    document.getElementById('target-cal').value = '';
    document.getElementById('target-prot').value = '';
    document.getElementById('target-carb').value = '';
    document.getElementById('target-fat').value = '';
    document.getElementById('ingredienti').value = '';
    document.getElementById('restrizioni').value = '';
    document.getElementById('cucina-altra-text').value = '';
    document.getElementById('cottura-altra-text').value = '';
    document.getElementById('tempo-altro-text').value = '';

    // Reset taste
    document.querySelectorAll('.taste-tab').forEach(b => {
      b.classList.remove('active');
      b.setAttribute('aria-pressed', 'false');
    });
    document.querySelector('[data-taste="salato"]').classList.add('active');
    document.querySelector('[data-taste="salato"]').setAttribute('aria-pressed', 'true');
    state.taste = 'salato';

    // Reset mode
    document.querySelectorAll('.mode-btn').forEach(b => {
      b.classList.remove('active');
      b.setAttribute('aria-pressed', 'false');
    });
    document.querySelector('[data-mode="gustosa"]').classList.add('active');
    document.querySelector('[data-mode="gustosa"]').setAttribute('aria-pressed', 'true');
    state.mode = 'gustosa';

    // Reset switches (cucine)
    document.querySelectorAll('.switch-row').forEach(r => r.classList.remove('active'));
    _hideCustomInput('cucina');

    // Reset radio groups
    document.querySelectorAll('#cottura-group .radio-row').forEach((r, i) => {
      r.classList.toggle('active', i === 0);
      r.setAttribute('aria-checked', i === 0);
    });
    state.cottura = 'qualsiasi';
    _hideCustomInput('cottura');

    document.querySelectorAll('#tempo-group .radio-row').forEach((r, i) => {
      r.classList.toggle('active', i === 0);
      r.setAttribute('aria-checked', i === 0);
    });
    state.tempo = 'qualsiasi';
    _hideCustomInput('tempo');

    // Reset model
    document.querySelectorAll('.model-seg-btn').forEach(b => {
      b.classList.remove('active');
      b.setAttribute('aria-pressed', 'false');
    });
    document.querySelector('[data-model="gpt-4o-mini"]').classList.add('active');
    document.querySelector('[data-model="gpt-4o-mini"]').setAttribute('aria-pressed', 'true');
    state.aiModel = 'gpt-4o-mini';
    
    // Reset hint
    const hint = document.getElementById('model-seg-hint');
    if (hint) hint.textContent = 'Standard · economico';
  }

  function init() {
    loadSavedFromDB();

    // ── Taste Tabs ──
    document.querySelectorAll('.taste-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.taste-tab').forEach(b => {
          b.classList.remove('active');
          b.setAttribute('aria-pressed', 'false');
        });
        btn.classList.add('active');
        btn.setAttribute('aria-pressed', 'true');
        state.taste = btn.dataset.taste;
      });
    });

    // ── Mode Buttons ──
    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.mode-btn').forEach(b => {
          b.classList.remove('active');
          b.setAttribute('aria-pressed', 'false');
        });
        btn.classList.add('active');
        btn.setAttribute('aria-pressed', 'true');
        state.mode = btn.dataset.mode;
      });
    });

    // ── Radio Groups (Cottura e Tempo) ──
    _setupRadioGroup('cottura-group', 'cottura');
    _setupRadioGroup('tempo-group', 'tempo');

    // ── Switch Cucine ──
    document.querySelectorAll('.switch-row').forEach(row => {
      row.addEventListener('click', () => {
        row.classList.toggle('active');
        row.setAttribute('aria-checked', row.classList.contains('active'));
        
        // Mostra/nascondi input "Altra cucina"
        const hasOther = Array.from(document.querySelectorAll('.switch-row.active'))
          .some(r => r.dataset.cucina === '__altra__');
        if (hasOther) {
          _showCustomInput('cucina');
        } else {
          _hideCustomInput('cucina');
        }
      });
    });

    // ── Model Switcher ──
    document.querySelectorAll('.model-seg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.model-seg-btn').forEach(b => {
          b.classList.remove('active');
          b.setAttribute('aria-pressed', 'false');
        });
        btn.classList.add('active');
        btn.setAttribute('aria-pressed', 'true');
        state.aiModel = btn.dataset.model;
        
        // Aggiorna hint
        const hint = document.getElementById('model-seg-hint');
        if (hint) {
          if (state.aiModel === 'gpt-4o-mini') {
            hint.textContent = 'Standard · economico';
          } else if (state.aiModel === 'gpt-4.1-mini') {
            hint.textContent = 'Avanzato';
          }
        }
      });
    });

    // ── Navigation Tabs ──
    document.querySelectorAll('.nav-tab').forEach(tab => {
      tab.addEventListener('click', async () => {
        const target = tab.getAttribute('aria-controls').replace('view-', '');
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        document.getElementById('view-' + target).classList.add('active');
        document.querySelectorAll('.nav-tab').forEach(t => {
          t.classList.remove('active');
          t.setAttribute('aria-selected', 'false');
        });
        tab.classList.add('active');
        tab.setAttribute('aria-selected', 'true');
        
        // Ricarica DB quando si entra in tab Salvate
        if (target === 'saved') {
          await loadSavedFromDB();
        }
      });
    });

    // ── Buttons ──
    document.getElementById('btn-generate').addEventListener('click', generate);
    document.getElementById('btn-reset').addEventListener('click', resetForm);

    // ── Save Recipe (event delegation) ──
    document.addEventListener('click', saveRecipe);

    // ── Search Salvate ──
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        filterSaved(e.target.value);
      });
    }
  }

  // Init quando DOM è pronto
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
