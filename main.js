(function () {
  'use strict';

  const PROXY_URL = 'https://cucina-ai-proxy.canini-d.workers.dev/api/chat';
  const DB_URL = PROXY_URL.replace('/chat', '/recipes');

  const state = {
    mode: 'gustosa',
    taste: 'salato',
    cottura: 'qualsiasi',
    tempo: 'qualsiasi',
    aiModel: 'gpt-4o-mini',
    recipes: [],
    saved: []
  };

  function _val(id) { return document.getElementById(id)?.value?.trim() || ''; }

  async function loadSavedFromStorage() {
    try {
      const response = await fetch(DB_URL);
      if (response.ok) {
        state.saved = await response.json();
        _updateSavedCountUI();
      }
    } catch (err) { console.error("Errore sincronizzazione DB:", err); }
  }

  function _updateSavedCountUI() {
    const badge = document.getElementById('saved-badge');
    const label = document.getElementById('saved-count-label');
    if (badge) badge.textContent = state.saved.length > 0 ? `(${state.saved.length})` : '';
    if (label) label.textContent = `${state.saved.length} ricette salvate`;
  }

  async function generate() {
    const btn = document.getElementById('btn-generate');
    const container = document.getElementById('results-container');
    btn.disabled = true;
    btn.innerHTML = "Sto cucinando... ⏳";

    const cucine = Array.from(document.querySelectorAll('.switch-row.active')).map(r => r.dataset.cucina);
    
    const prompt = `Agisci come Chef Professionista. Crea 3 ricette ${state.taste} di tipo ${state.mode}.
      Ingredienti base: ${_val('ingredienti')}.
      Cucine preferite: ${cucine.join(', ') || 'Internazionale'}.
      Metodo cottura: ${state.cottura}, Tempo: ${state.tempo}.
      Target nutrizionale: ${_val('target-cal')}kcal, ${_val('target-prot')}g proteine, ${_val('target-carb')}g carboidrati, ${_val('target-fat')}g grassi.
      RISPONDI ESCLUSIVAMENTE IN FORMATO JSON (ARRAY DI OGGETTI).`;

    try {
      const res = await fetch(PROXY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: prompt }],
          model: state.aiModel
        })
      });

      const data = await res.json();
      const content = data.choices[0].message.content.replace(/```json|```/gi, '').trim();
      state.recipes = JSON.parse(content);
      
      container.innerHTML = `<div class="cards-grid">${state.recipes.map((r, i) => renderCard(r, i, false)).join('')}</div>`;
    } catch (e) {
      container.innerHTML = `<p class="error">Errore nella generazione. Verifica la connessione al database.</p>`;
    } finally {
      btn.disabled = false;
      btn.innerHTML = "Genera Ricette ✦";
    }
  }

  function renderCard(recipe, index, isSaved) {
    const v = recipe.valori_per_porzione || { calorie: 0, proteine: 0, carboidrati: 0, grassi: 0 };
    return `
      <article class="recipe-card">
        <div class="card-header">
          <span class="card-cuisine">${recipe.cucina || 'Variata'}</span>
          <h3 class="card-title">${recipe.nome}</h3>
        </div>
        <div class="card-macros">
          <div class="macro-item"><strong>${v.calorie}</strong><span>kcal</span></div>
          <div class="macro-item"><strong>${v.proteine}g</strong><span>Prot</span></div>
          <div class="macro-item"><strong>${v.carboidrati}g</strong><span>Carb</span></div>
          <div class="macro-item"><strong>${v.grassi}g</strong><span>Fat</span></div>
        </div>
        <div class="card-actions">
          <button class="btn-save" onclick="saveRecipe('${encodeURIComponent(JSON.stringify(recipe))}')">🔖 Salva</button>
        </div>
      </article>`;
  }

  window.saveRecipe = async (encodedData) => {
    const recipe = JSON.parse(decodeURIComponent(encodedData));
    await fetch(DB_URL, { method: 'POST', body: JSON.stringify(recipe) });
    loadSavedFromStorage();
  };

  function init() {
    loadSavedFromStorage();

    // Switch Cucine
    document.querySelectorAll('.switch-row').forEach(row => {
      row.onclick = () => row.classList.toggle('active');
    });

    // Taste Tabs
    document.querySelectorAll('.taste-tab').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('.taste-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.taste = btn.dataset.taste;
      };
    });

    // Mode Buttons
    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.mode = btn.dataset.mode;
      };
    });

    // Radio Rows (Cottura e Tempo)
    const setupRadio = (groupId, key) => {
      document.querySelectorAll(`#${groupId} .radio-row`).forEach(row => {
        row.onclick = () => {
          document.querySelectorAll(`#${groupId} .radio-row`).forEach(r => r.classList.remove('active'));
          row.classList.add('active');
          state[key] = row.dataset[key];
        };
      });
    };
    setupRadio('cottura-group', 'cottura');
    setupRadio('tempo-group', 'tempo');

    // Navigazione
    document.querySelectorAll('.nav-tab').forEach(tab => {
      tab.onclick = () => {
        const target = tab.getAttribute('aria-controls').replace('view-', '');
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        document.getElementById('view-' + target).classList.add('active');
        document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
      };
    });

    document.getElementById('btn-generate').onclick = generate;
  }

  init();
})();