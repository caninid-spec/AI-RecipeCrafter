/**
 * main.js — La Cucina
 *
 * Struttura:
 *   1. STATE          — unica fonte di verità
 *   2. STORAGE        — localStorage (ricette salvate + form)
 *   3. HELPERS        — funzioni di utilità pure
 *   4. PROMPT         — costruzione dei messaggi per l'AI
 *   5. API            — chiamate a Anthropic
 *   6. CARD TEMPLATE  — generazione HTML delle card ricetta
 *   7. DOM ACTIONS    — azioni sulle card (toggle, salva, modifica…)
 *   8. FORM           — lettura parametri, ripristino stato
 *   9. VIEWS          — gestione tab Genera / Salvate
 *  10. GENERATE       — orchestrazione della generazione ricette
 *  11. INIT           — setup event listener e avvio app
 */

(function () {
  'use strict';

  /* ══════════════════════════════════════════════════════════════
     CONFIGURAZIONE
     Dopo aver deployato il Cloudflare Worker (vedi worker.js),
     sostituisci l'URL qui sotto con quello del tuo Worker.
     Es: 'https://cucina-ai-proxy.mario.workers.dev/api/chat'
  ══════════════════════════════════════════════════════════════ */
  const PROXY_URL = 'https://cucina-ai-proxy.canini-d.workers.dev/api/chat';


  /* ══════════════════════════════════════════════════════════════
     1. STATE — unica fonte di verità dell'applicazione
  ══════════════════════════════════════════════════════════════ */
  const state = {
    mode:         'gustosa',   // 'gustosa' | 'fit' | 'leggera'
    cottura:      'qualsiasi', // valore del radio cottura attivo
    tempo:        'qualsiasi', // valore del radio tempo attivo
    conversation: [],          // history multi-turn con l'AI (per "Creane altre")
    recipes:      [],          // ricette della sessione corrente
    saved:        [],          // ricette salvate (sincronizzato con localStorage)
  };


  /* ══════════════════════════════════════════════════════════════
     2. STORAGE — persistenza in localStorage
  ══════════════════════════════════════════════════════════════ */
  const STORAGE_KEYS = {
    saved: 'cucina_saved',
    form:  'cucina_form_state',
  };

  /** Carica le ricette salvate da localStorage nello state. */
  function loadSavedFromStorage() {
    try {
      state.saved = JSON.parse(localStorage.getItem(STORAGE_KEYS.saved) || '[]');
    } catch {
      state.saved = [];
    }
  }

  /** Salva le ricette in localStorage e aggiorna i contatori nell'UI. */
  function persistSaved() {
    localStorage.setItem(STORAGE_KEYS.saved, JSON.stringify(state.saved));
    _updateSavedCountUI();
  }

  /** Salva lo stato attuale del form in localStorage. */
  function saveFormState() {
    const formData = {
      mode:         state.mode,
      cottura:      state.cottura,
      tempo:        state.tempo,
      cal:          _val('target-cal'),
      prot:         _val('target-prot'),
      carb:         _val('target-carb'),
      fat:          _val('target-fat'),
      ing:          _val('ingredienti'),
      cucinaAltra:  _val('cucina-altra-text'),
      cotturaAltra: _val('cottura-altra-text'),
      tempoAltro:   _val('tempo-altro-text'),
      cucine:       [...document.querySelectorAll('#cucina-switches .switch-row.active')]
                      .map(r => r.dataset.cucina),
    };
    localStorage.setItem(STORAGE_KEYS.form, JSON.stringify(formData));
  }

  /** Ripristina il form dall'ultima sessione salvata. */
  function restoreFormState() {
    let saved;
    try { saved = JSON.parse(localStorage.getItem(STORAGE_KEYS.form)); } catch { return; }
    if (!saved) return;

    // Tipo di cena
    if (saved.mode) {
      state.mode = saved.mode;
      document.querySelectorAll('.mode-btn').forEach(btn => {
        const active = btn.dataset.mode === saved.mode;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-pressed', active);
      });
    }

    // Campi numerici e textarea
    ['cal', 'prot', 'carb', 'fat'].forEach(k => {
      if (saved[k]) document.getElementById('target-' + k).value = saved[k];
    });
    if (saved.ing)          document.getElementById('ingredienti').value        = saved.ing;
    if (saved.cucinaAltra)  document.getElementById('cucina-altra-text').value  = saved.cucinaAltra;
    if (saved.cotturaAltra) document.getElementById('cottura-altra-text').value = saved.cotturaAltra;
    if (saved.tempoAltro)   document.getElementById('tempo-altro-text').value   = saved.tempoAltro;

    // Cucine attive
    if (Array.isArray(saved.cucine)) {
      saved.cucine.forEach(key => {
        const row = document.querySelector(`#cucina-switches .switch-row[data-cucina="${key}"]`);
        if (row) { row.classList.add('active'); row.setAttribute('aria-checked', 'true'); }
      });
      _toggleExtraInput('cucina-custom-wrap', saved.cucine.includes('__altra__'));
    }

    // Cottura
    if (saved.cottura) {
      _activateRadio('cottura-group', 'cottura', saved.cottura);
      _toggleExtraInput('cottura-custom-wrap', saved.cottura === '__altro__');
    }

    // Tempo
    if (saved.tempo) {
      _activateRadio('tempo-group', 'tempo', saved.tempo);
      _toggleExtraInput('tempo-custom-wrap', saved.tempo === '__altro__');
    }
  }


  /* ══════════════════════════════════════════════════════════════
     3. HELPERS — funzioni di utilità pure (nessun side-effect UI)
  ══════════════════════════════════════════════════════════════ */

  /** Legge e trimma il valore di un input dato il suo id. */
  function _val(id) {
    return document.getElementById(id)?.value?.trim() || '';
  }

  /** Trasforma un nome ricetta in un id DOM sicuro. */
  function _makeId(nome) {
    return nome.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  }

  /** Mostra/nasconde un wrapper di input extra (per opzione "Altro"). */
  function _toggleExtraInput(wrapperId, visible) {
    document.getElementById(wrapperId)?.classList.toggle('visible', visible);
  }

  /** Attiva un radio row nel gruppo dato e aggiorna lo state. */
  function _activateRadio(groupId, stateKey, value) {
    const group = document.getElementById(groupId);
    group.querySelectorAll('.radio-row').forEach(r => {
      const active = r.dataset[stateKey] === value;
      r.classList.toggle('active', active);
      r.setAttribute('aria-checked', active);
      r.tabIndex = active ? 0 : -1;
    });
    state[stateKey] = value;
  }

  /** Aggiorna badge e label con il numero di ricette salvate. */
  function _updateSavedCountUI() {
    const n = state.saved.length;
    document.getElementById('saved-badge').textContent       = n > 0 ? `(${n})` : '';
    document.getElementById('saved-count-label').textContent = n + ' ricett' + (n === 1 ? 'a' : 'e');
  }

  /** Estrae i parametri correnti dal form e dallo state. */
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

    const cottura = state.cottura === '__altro__'
      ? (_val('cottura-altra-text') || 'qualsiasi')
      : state.cottura;

    const tempo = state.tempo === '__altro__'
      ? (_val('tempo-altro-text') || 'qualsiasi')
      : state.tempo;

    return {
      mode:  state.mode,
      cal:   _val('target-cal'),
      prot:  _val('target-prot'),
      carb:  _val('target-carb'),
      fat:   _val('target-fat'),
      ing:   _val('ingredienti'),
      cucine,
      cottura,
      tempo,
    };
  }


  /* ══════════════════════════════════════════════════════════════
     4. PROMPT — costruzione dei messaggi per l'AI
  ══════════════════════════════════════════════════════════════ */

  const MODE_DESCRIPTIONS = {
    gustosa: 'saporita, ricca, soddisfacente (comfort food)',
    fit:     'ad alto contenuto proteico, adatta a chi si allena',
    leggera: 'leggera, facile da digerire, pochi grassi',
  };

  /**
   * Costruisce il prompt per generare 3 nuove ricette.
   * @param {object} params  — output di getParams()
   * @param {boolean} isMore — true se è una richiesta "Creane altre"
   */
  function buildGeneratePrompt(params, isMore) {
    const { mode, cal, prot, carb, fat, ing, cucine, cottura, tempo } = params;

    let macroLine = '';
    if (cal)  macroLine += `  - Calorie: circa ${cal} kcal\n`;
    if (prot) macroLine += `  - Proteine: circa ${prot}g\n`;
    if (carb) macroLine += `  - Carboidrati: circa ${carb}g\n`;
    if (fat)  macroLine += `  - Grassi: circa ${fat}g\n`;
    if (!macroLine) macroLine = '  - Nessun target: bilancia come ritieni opportuno.\n';

    return `${isMore
      ? 'Proponi altre 3 ricette DIVERSE da quelle già generate. Stessi parametri.'
      : 'Proponi esattamente 3 ricette diverse.'
    }

Parametri:
- Tipo: ${MODE_DESCRIPTIONS[mode]}
- Target per porzione:\n${macroLine}\
- Ingredienti: ${ing ? 'da usare: ' + ing : 'liberi'}
- Cucina: ${cucine.length ? cucine.join(', ') : 'libera'}
- Cottura: ${cottura !== 'qualsiasi' ? cottura + ' (OBBLIGATORIO)' : 'qualsiasi'}
- Tempo: ${tempo !== 'qualsiasi' ? tempo + ' (OBBLIGATORIO)' : 'qualsiasi'}

Rispondi SOLO con un JSON array senza markdown:
[{"nome":"...","cucina":"...","descrizione":"...","porzioni":2,"ingredienti":[{"qty":"200g","nome":"pollo"}],"passaggi":["Passo 1"],"valori_per_porzione":{"calorie":520,"proteine":38,"carboidrati":45,"grassi":12}}]`;
  }

  /**
   * Costruisce il prompt per modificare una singola ricetta.
   * @param {object} recipe  — ricetta originale
   * @param {string} request — testo della richiesta utente
   */
  function buildModifyPrompt(recipe, request) {
    return `Modifica questa ricetta secondo la richiesta dell'utente.
Ricetta originale: ${recipe.nome}
Richiesta: "${request}"
Rispondi SOLO con un JSON array con un elemento, stesso formato, senza markdown:
[{"nome":"...","cucina":"...","descrizione":"...","porzioni":2,"ingredienti":[{"qty":"...","nome":"..."}],"passaggi":["..."],"valori_per_porzione":{"calorie":0,"proteine":0,"carboidrati":0,"grassi":0}}]`;
  }


  /* ══════════════════════════════════════════════════════════════
     5. API — comunicazione con Anthropic
  ══════════════════════════════════════════════════════════════ */

  /**
   * Invia messaggi al proxy Cloudflare Worker, che li inoltra ad Anthropic.
   * La chiave API risiede solo nel Worker (mai esposta al browser).
   */
  async function callAPI(messages) {
    const response = await fetch(PROXY_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || `Errore proxy ${response.status}`);
    }

    const data = await response.json();
    const text = (data.content || [])
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('');

    return { text, content: data.content };
  }

  /** Estrae e parsa l'array JSON di ricette dalla risposta testuale. */
  function parseRecipes(text) {
    const clean = text.replace(/```json|```/gi, '').trim();
    const match = clean.match(/\[[\s\S]*\]/);
    if (!match) throw new Error('Risposta non valida dal modello');
    return JSON.parse(match[0]);
  }


  /* ══════════════════════════════════════════════════════════════
     6. CARD TEMPLATE — generazione HTML delle card ricetta
  ══════════════════════════════════════════════════════════════ */

  /** Genera l'HTML completo di una card ricetta. */
  function renderCard(recipe, index, isSavedView) {
    const id    = _makeId(recipe.nome);
    const nome  = recipe.nome.replace(/"/g, '&quot;').replace(/</g, '&lt;');
    const delay = (index % 3) * 70;
    const v     = recipe.valori_per_porzione;

    const ingredientsHTML = recipe.ingredienti
      .map(i => `<li><span class="ing-qty">${i.qty}</span>${i.nome}</li>`)
      .join('');

    const stepsHTML = recipe.passaggi
      .map(p => `<li>${p}</li>`)
      .join('');

    const alreadySaved = state.saved.some(r => r.nome === recipe.nome);
    const modeBadge    = recipe._mode
      ? `<span class="badge mode-${recipe._mode}">${recipe._mode}</span>`
      : '';

    const actionButtons = isSavedView
      ? _renderUnsaveButtons(id, recipe.nome)
      : _renderSaveButton(id, recipe.nome, alreadySaved);

    return `
<article class="recipe-card"
  data-id="${id}"
  data-nome="${nome}"
  style="animation-delay:${delay}ms"
  aria-label="Ricetta: ${recipe.nome}">

  <div class="card-top">
    <div class="card-cuisine" aria-label="Cucina: ${recipe.cucina}">${recipe.cucina}</div>
    <h3 class="card-name">${recipe.nome}</h3>
    <p class="card-desc">${recipe.descrizione}</p>
    <div class="card-badges" aria-label="Caratteristiche">
      ${modeBadge}
      <span class="badge">${recipe.cucina}</span>
      <span class="badge"><span aria-hidden="true">👤</span> ${recipe.porzioni} porz.</span>
    </div>
  </div>

  <dl class="card-macros" aria-label="Valori nutrizionali per porzione">
    <div class="macro-item"><dt class="macro-lbl">kcal</dt>  <dd class="macro-val">${v.calorie}</dd></div>
    <div class="macro-item"><dt class="macro-lbl">prot</dt>  <dd class="macro-val">${v.proteine}g</dd></div>
    <div class="macro-item"><dt class="macro-lbl">carb</dt>  <dd class="macro-val">${v.carboidrati}g</dd></div>
    <div class="macro-item"><dt class="macro-lbl">grassi</dt><dd class="macro-val">${v.grassi}g</dd></div>
  </dl>

  <button class="card-body-toggle"
    data-action="toggle-body"
    data-id="${id}"
    aria-expanded="false"
    aria-controls="body-${id}">
    Ingredienti &amp; Procedura
    <span class="toggle-arrow" aria-hidden="true">▾</span>
  </button>

  <div class="card-body" id="body-${id}" aria-hidden="true">
    <div>
      <h4 class="section-mini-title">Ingredienti</h4>
      <ul class="ingredient-list">${ingredientsHTML}</ul>
    </div>
    <div>
      <h4 class="section-mini-title">Procedura</h4>
      <ol class="steps-list">${stepsHTML}</ol>
    </div>
  </div>

  <div class="card-modify-area" id="modarea-${id}" aria-hidden="true">
    <p class="modify-label" id="modlabel-${id}">Chiedi una modifica all'AI</p>
    <div class="modify-row">
      <label for="modinput-${id}" class="visually-hidden">Richiesta modifica per ${recipe.nome}</label>
      <input type="text"
        class="modify-input"
        id="modinput-${id}"
        placeholder="es. senza glutine, più proteica…"
        aria-labelledby="modlabel-${id}">
      <button class="btn-modify" data-action="apply-modify" data-id="${id}">↻ Applica</button>
    </div>
    <p class="modify-loader" id="modloader-${id}" style="display:none" aria-live="polite">
      ⏳ Aggiornando la ricetta…
    </p>
  </div>

  <div class="card-actions">${actionButtons}</div>
</article>`;
  }

  function _renderSaveButton(id, nome, alreadySaved) {
    const savedClass = alreadySaved ? 'saved' : '';
    const label      = alreadySaved ? `${nome} già salvata` : `Salva ${nome}`;
    const icon       = alreadySaved ? '✓' : '🔖';
    const text       = alreadySaved ? 'Salvata' : 'Salva';

    return `
      <button class="btn-save ${savedClass}"
        data-action="save"
        data-id="${id}"
        id="savebtn-${id}"
        ${alreadySaved ? 'aria-disabled="true"' : ''}
        aria-label="${label}">
        <span aria-hidden="true">${icon}</span> ${text}
      </button>
      <button class="btn-edit-toggle"
        data-action="toggle-modify"
        data-id="${id}"
        aria-expanded="false"
        aria-label="Modifica ricetta ${nome}">
        <span aria-hidden="true">✏️</span> Modifica
      </button>`;
  }

  function _renderUnsaveButtons(id, nome) {
    return `
      <button class="btn-unsave"
        data-action="unsave"
        data-id="${id}"
        aria-label="Rimuovi ${nome} dalle salvate">
        <span aria-hidden="true">🗑</span> Rimuovi
      </button>
      <button class="btn-edit-toggle"
        data-action="toggle-modify"
        data-id="${id}"
        aria-expanded="false"
        aria-label="Modifica ricetta ${nome}">
        <span aria-hidden="true">✏️</span> Modifica
      </button>`;
  }


  /* ══════════════════════════════════════════════════════════════
     7. DOM ACTIONS — azioni sulle card
  ══════════════════════════════════════════════════════════════ */

  function handleToggleBody(btn, id) {
    const card    = btn.closest('.recipe-card');
    const bodyEl  = document.getElementById('body-' + id);
    const expanded = card.classList.toggle('expanded');
    btn.setAttribute('aria-expanded', expanded);
    bodyEl?.setAttribute('aria-hidden', !expanded);
  }

  function handleToggleModify(btn, id) {
    const area    = document.getElementById('modarea-' + id);
    if (!area) return;
    const visible = area.classList.toggle('visible');
    area.setAttribute('aria-hidden', !visible);
    btn.setAttribute('aria-expanded', visible);
    if (visible) document.getElementById('modinput-' + id)?.focus();
  }

  function handleSave(btn, id) {
    if (btn.classList.contains('saved')) return;
    const nome   = btn.closest('.recipe-card')?.dataset.nome;
    const recipe = state.recipes.find(r => r.nome === nome);
    if (!recipe) return;

    recipe._mode = state.mode;
    state.saved.push(recipe);
    state.saved.sort((a, b) => a.nome.localeCompare(b.nome, 'it'));
    persistSaved();

    btn.innerHTML = '<span aria-hidden="true">✓</span> Salvata';
    btn.classList.add('saved');
    btn.setAttribute('aria-label', recipe.nome + ' già salvata');
  }

  function handleUnsave(id) {
    const nome = document.querySelector(`.recipe-card[data-id="${id}"]`)?.dataset.nome;
    state.saved = state.saved.filter(r => r.nome !== nome);
    persistSaved();
    renderSaved();
  }

  async function handleModify(id) {
    const input  = document.getElementById('modinput-' + id);
    const btn    = document.querySelector(`.recipe-card[data-id="${id}"] [data-action="apply-modify"]`);
    const loader = document.getElementById('modloader-' + id);
    if (!input?.value.trim()) return;

    const card   = document.querySelector(`.recipe-card[data-id="${id}"]`);
    const nome   = card?.dataset.nome;
    const recipe = state.recipes.find(r => r.nome === nome)
                || state.saved.find(r => r.nome === nome);
    if (!recipe) return;

    btn.disabled         = true;
    loader.style.display = 'block';

    try {
      const prompt  = buildModifyPrompt(recipe, input.value.trim());
      const { text } = await callAPI([{ role: 'user', content: prompt }]);
      const updated  = parseRecipes(text)[0];
      updated._mode  = recipe._mode || state.mode;

      // Aggiorna nello state
      const recipeIdx = state.recipes.findIndex(r => r.nome === nome);
      if (recipeIdx !== -1) state.recipes[recipeIdx] = updated;

      const savedIdx = state.saved.findIndex(r => r.nome === nome);
      if (savedIdx !== -1) { state.saved[savedIdx] = updated; persistSaved(); }

      // Sostituisce la card nel DOM
      const isSavedView = !!card.closest('#saved-container');
      const idx         = [...card.parentElement.children].indexOf(card);
      const wrapper     = document.createElement('div');
      wrapper.innerHTML = renderCard(updated, idx, isSavedView);
      const newCard     = wrapper.firstElementChild;
      card.replaceWith(newCard);

      // Riapre il corpo sulla nuova card
      newCard.classList.add('expanded');
      document.getElementById('body-' + _makeId(updated.nome))?.setAttribute('aria-hidden', 'false');

    } catch (err) {
      loader.textContent   = '⚠️ ' + err.message;
      loader.style.display = 'block';
      btn.disabled         = false;
      return;
    }

    btn.disabled         = false;
    loader.style.display = 'none';
  }

  /**
   * Attacca un singolo listener delegato su un container di card.
   * Gestisce tutti i click con data-action senza listener per-bottone.
   */
  function attachCardDelegation(container) {
    container.addEventListener('click', e => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const { action, id } = btn.dataset;
      switch (action) {
        case 'toggle-body':   handleToggleBody(btn, id);   break;
        case 'toggle-modify': handleToggleModify(btn, id); break;
        case 'save':          handleSave(btn, id);         break;
        case 'unsave':        handleUnsave(id);            break;
        case 'apply-modify':  handleModify(id);            break;
      }
    });

    // Enter nell'input di modifica = applica
    container.addEventListener('keydown', e => {
      if (e.key === 'Enter' && e.target.classList.contains('modify-input')) {
        const id = e.target.id.replace('modinput-', '');
        handleModify(id);
      }
    });
  }


  /* ══════════════════════════════════════════════════════════════
     8. FORM — gestione parametri e interazioni del pannello
  ══════════════════════════════════════════════════════════════ */

  function initFormControls() {
    // Mode (Gustosa / Fit / Leggera)
    document.getElementById('mode-switcher').addEventListener('click', e => {
      const btn = e.target.closest('.mode-btn');
      if (!btn) return;
      document.querySelectorAll('.mode-btn').forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-pressed', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-pressed', 'true');
      state.mode = btn.dataset.mode;
      saveFormState();
    });

    // Radio cottura
    _initRadioGroup('cottura-group', 'cottura', 'cottura-custom-wrap');

    // Radio tempo
    _initRadioGroup('tempo-group', 'tempo', 'tempo-custom-wrap');

    // Switch cucina
    const cucinaGroup = document.getElementById('cucina-switches');
    cucinaGroup.addEventListener('click', e => {
      const row = e.target.closest('.switch-row');
      if (!row) return;
      const active = !row.classList.contains('active');
      row.classList.toggle('active', active);
      row.setAttribute('aria-checked', active);
      if (row.dataset.cucina === '__altra__') _toggleExtraInput('cucina-custom-wrap', active);
      saveFormState();
    });
    cucinaGroup.addEventListener('keydown', e => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        e.target.closest('.switch-row')?.click();
      }
    });

    // Autosave su ogni modifica testuale
    ['target-cal', 'target-prot', 'target-carb', 'target-fat', 'ingredienti',
     'cucina-altra-text', 'cottura-altra-text', 'tempo-altro-text']
      .forEach(id => document.getElementById(id)?.addEventListener('input', saveFormState));
  }

  /** Inizializza un radio group con click + navigazione da tastiera (frecce). */
  function _initRadioGroup(groupId, stateKey, customWrapId) {
    const group = document.getElementById(groupId);

    group.addEventListener('click', e => {
      const row = e.target.closest('.radio-row');
      if (!row) return;
      _activateRadio(groupId, stateKey, row.dataset[stateKey]);
      _toggleExtraInput(customWrapId, state[stateKey] === '__altro__');
      saveFormState();
    });

    // Navigazione con frecce (pattern ARIA per radiogroup)
    group.addEventListener('keydown', e => {
      if (!['ArrowUp', 'ArrowDown', ' ', 'Enter'].includes(e.key)) return;
      e.preventDefault();
      const rows    = [...group.querySelectorAll('.radio-row')];
      const current = group.querySelector('.radio-row[aria-checked="true"]');
      const idx     = rows.indexOf(current);
      let next      = current;
      if (e.key === 'ArrowDown') next = rows[(idx + 1) % rows.length];
      if (e.key === 'ArrowUp')   next = rows[(idx - 1 + rows.length) % rows.length];
      next.click();
      next.focus();
    });
  }


  /* ══════════════════════════════════════════════════════════════
     9. VIEWS — gestione tab Genera / Salvate
  ══════════════════════════════════════════════════════════════ */

  function switchView(targetName) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-tab').forEach(tab => {
      const isTarget = tab.getAttribute('aria-controls') === 'view-' + targetName;
      tab.classList.toggle('active', isTarget);
      tab.setAttribute('aria-selected', isTarget);
    });
    document.getElementById('view-' + targetName).classList.add('active');
    if (targetName === 'saved') renderSaved();
  }

  /** Renderizza la griglia delle ricette salvate, opzionalmente filtrate. */
  function renderSaved() {
    const query     = _val('search-input').toLowerCase();
    const filtered  = state.saved.filter(r =>
      !query
      || r.nome.toLowerCase().includes(query)
      || r.cucina.toLowerCase().includes(query)
      || r.descrizione.toLowerCase().includes(query)
    );

    const container = document.getElementById('saved-container');

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="no-results" role="status">
          <span class="empty-icon" aria-hidden="true">🔖</span>
          <p class="empty-title">${query ? 'Nessun risultato' : 'Nessuna ricetta salvata'}</p>
          <p class="empty-desc">${query
            ? "Prova con un'altra parola chiave."
            : 'Genera delle ricette e salvale con il tasto 🔖.'
          }</p>
        </div>`;
    } else {
      container.innerHTML = `
        <div class="cards-grid">
          ${filtered.map((r, i) => renderCard(r, i, true)).join('')}
        </div>`;
    }
  }


  /* ══════════════════════════════════════════════════════════════
     10. GENERATE — orchestrazione della generazione ricette
  ══════════════════════════════════════════════════════════════ */

  async function generate(isMore = false) {
    const params    = getParams();
    const prompt    = buildGeneratePrompt(params, isMore);
    const container = document.getElementById('results-container');
    const btnGen    = document.getElementById('btn-generate');
    const btnMore   = document.getElementById('btn-more');

    const loaderHTML = `
      <div class="loader-state" role="status" aria-live="polite">
        <div class="loader-wave" aria-hidden="true">
          <span></span><span></span><span></span><span></span>
        </div>
        <p class="loader-text">
          ${isMore ? 'Cerco altre ricette…' : 'Sto cercando le ricette perfette per te…'}
        </p>
      </div>`;

    // Prepara UI
    if (!isMore) {
      state.conversation = [];
      state.recipes      = [];
      container.innerHTML = loaderHTML;
    } else {
      const loaderEl    = document.createElement('div');
      loaderEl.id       = 'more-loader';
      loaderEl.innerHTML = loaderHTML;
      container.appendChild(loaderEl);
    }

    btnGen.disabled = true;
    if (btnMore) btnMore.disabled = true;

    try {
      const messages = isMore
        ? [...state.conversation, { role: 'user', content: prompt }]
        : [{ role: 'user', content: prompt }];

      const { text, content } = await callAPI(messages);
      state.conversation = [...messages, { role: 'assistant', content }];

      const recipes = parseRecipes(text);
      recipes.forEach(r => { r._mode = state.mode; });

      if (!isMore) {
        state.recipes       = recipes;
        container.innerHTML = `
          <div class="cards-grid" id="cards-grid">
            ${recipes.map((r, i) => renderCard(r, i, false)).join('')}
          </div>
          <div class="btn-more-wrap">
            <button class="btn-more" id="btn-more"
              aria-label="Genera altre 3 ricette con gli stessi parametri">
              <span aria-hidden="true">✦</span> Creane altre
            </button>
          </div>`;
      } else {
        document.getElementById('more-loader')?.remove();
        const grid  = document.getElementById('cards-grid');
        const start = state.recipes.length;
        state.recipes.push(...recipes);
        recipes.forEach((r, i) => grid.insertAdjacentHTML('beforeend', renderCard(r, start + i, false)));
        document.getElementById('btn-more').disabled = false;
      }

    } catch (err) {
      const errHTML = `<div class="error-box" role="alert">⚠️ ${err.message}</div>`;
      if (!isMore) {
        container.innerHTML = errHTML;
      } else {
        document.getElementById('more-loader')?.remove();
        container.insertAdjacentHTML('beforeend', errHTML);
      }
    } finally {
      btnGen.disabled = false;
      document.getElementById('btn-more')?.removeAttribute('disabled');
    }
  }


  /* ══════════════════════════════════════════════════════════════
     11. INIT — setup listener e avvio
  ══════════════════════════════════════════════════════════════ */

  function init() {
    // Carica dati persistiti
    loadSavedFromStorage();

    // Ripristina lo stato del form dalla sessione precedente
    restoreFormState();

    // Aggiorna i contatori UI con i dati caricati
    _updateSavedCountUI();

    // Form controls (mode, radio, switch, input)
    initFormControls();

    // Event delegation sulle card (sia nella vista genera che in salvate)
    attachCardDelegation(document.getElementById('results-container'));
    attachCardDelegation(document.getElementById('saved-container'));

    // "Creane altre" — delegato sul results-container
    document.getElementById('results-container').addEventListener('click', e => {
      if (e.target.closest('#btn-more')) generate(true);
    });

    // Bottone principale Genera
    document.getElementById('btn-generate').addEventListener('click', () => generate(false));

    // Tabs di navigazione
    document.querySelectorAll('.nav-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const view = tab.getAttribute('aria-controls').replace('view-', '');
        switchView(view);
      });
    });

    // Ricerca nelle salvate
    document.getElementById('search-input').addEventListener('input', renderSaved);
  }

  // Avvio
  init();

})(); // fine IIFE
