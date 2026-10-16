import { BeauchldeGame } from './game.js';
import { normalize, escapeHtml } from './utils.js';
import { fetchDailyLeaderboard, submitDailyScore, hasSubmittedToday } from './leaderboard.js';

let game = null;
let currentMatches = [];
let selectedIndex = -1;

// Etiquetas cortas para que los encabezados entren sin cortarse en celular
const SHORT_LABELS = {
  departamento: 'Depto.',
  creditos:     'Créd.',
  caracter:     'Carác.',
  requisitos:   'Req.',
  nivel:        'Nivel',
  semestre:     'Sem.',
  carreras:     'Carr.'
};

const DOM = {
  loader: document.getElementById('loader'),
  fileInput: document.getElementById('file-input'),
  gameContainer: document.getElementById('game-container'),
  searchInput: document.getElementById('search-input'),
  suggestions: document.getElementById('suggestions'),
  searchWrap: document.getElementById('search-wrap'),
  resultBtn: document.getElementById('result-btn'),
  modeNav: document.getElementById('mode-nav'),
  modeButtons: document.querySelectorAll('[data-mode]'),
  board: document.getElementById('board'),
  endDialog: document.getElementById('end-dialog'),
  endCard: document.getElementById('end-card'),
  endClose: document.getElementById('end-close'),
  sidebar: document.getElementById('sidebar'),
  sidebarBackdrop: document.getElementById('sidebar-backdrop'),
  menuToggle: document.getElementById('menu-toggle'),
  sidebarClose: document.getElementById('sidebar-close'),
  mobileModeBadge: document.getElementById('mobile-mode-badge')
};

const REVEAL_DELAY_MS = 1100;
let endTimer = null;

async function init() {
  attachEvents();
  try {
    const response = await fetch('ramos.json');
    if (!response.ok) throw new Error('No se pudo cargar ramos.json');
    const data = await response.json();
    setupGame(data);
  } catch (err) {
    DOM.loader.hidden = false;
  }
}

function setupGame(data) {
  try {
    game = new BeauchldeGame(data);
    DOM.loader.hidden = true;
    DOM.gameContainer.hidden = false;
    DOM.modeNav.hidden = false;
    startSession(true);
  } catch (err) {
    alert(err.message);
  }
}

function startSession(daily) {
  clearTimeout(endTimer);
  game.startNewGame(daily);
  closeEndDialog();
  closeMobileDrawer();
  DOM.searchInput.value = '';
  hideSuggestions();
  updateModeButtons();
  renderBoard(false);
  syncControls();

  if (game.finished) {
    showEndScreen(game.won);
  }
}

function syncControls() {
  DOM.searchWrap.hidden = game.finished;
  DOM.resultBtn.hidden = !game.finished;
}

function openMobileDrawer() {
  if (!DOM.sidebar) return;
  DOM.sidebar.classList.add('is-open');
  if (DOM.sidebarBackdrop) DOM.sidebarBackdrop.hidden = false;
  if (DOM.menuToggle) DOM.menuToggle.setAttribute('aria-expanded', 'true');
}

function closeMobileDrawer() {
  if (!DOM.sidebar) return;
  DOM.sidebar.classList.remove('is-open');
  if (DOM.sidebarBackdrop) DOM.sidebarBackdrop.hidden = true;
  if (DOM.menuToggle) DOM.menuToggle.setAttribute('aria-expanded', 'false');
}

function attachEvents() {
  DOM.fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      setupGame(JSON.parse(text));
    } catch {
      alert('El archivo seleccionado no es un JSON válido.');
    }
  });

  if (DOM.menuToggle) {
    DOM.menuToggle.addEventListener('click', () => {
      const isOpen = DOM.sidebar.classList.contains('is-open');
      if (isOpen) closeMobileDrawer();
      else openMobileDrawer();
    });
  }
  if (DOM.sidebarClose) {
    DOM.sidebarClose.addEventListener('click', closeMobileDrawer);
  }
  if (DOM.sidebarBackdrop) {
    DOM.sidebarBackdrop.addEventListener('click', closeMobileDrawer);
  }

  DOM.modeNav.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-mode]');
    if (!btn || !game) return;
    const daily = btn.dataset.mode === 'daily';
    if (daily && game.isDaily) {
      closeMobileDrawer();
      return;
    }
    startSession(daily);
  });

  DOM.resultBtn.addEventListener('click', () => {
    if (game) showEndScreen(game.won);
  });
  DOM.endClose.addEventListener('click', closeEndDialog);
  DOM.endDialog.addEventListener('click', (e) => {
    if (e.target === DOM.endDialog) closeEndDialog();
  });

  DOM.searchInput.addEventListener('input', handleSearchInput);
  DOM.searchInput.addEventListener('keydown', handleSearchKeydown);

  DOM.suggestions.addEventListener('mousedown', (e) => {
    const li = e.target.closest('li[data-index]');
    if (li) {
      e.preventDefault();
      chooseGuess(currentMatches[Number(li.dataset.index)]);
    }
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-container')) {
      hideSuggestions();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && DOM.sidebar && DOM.sidebar.classList.contains('is-open')) {
      closeMobileDrawer();
    }
  });
}

const MARKS = {
  ok:   '',
  part: '<svg class="mark" viewBox="0 0 100 100" aria-hidden="true"><path d="M14 54 C 28 30, 40 30, 50 50 S 72 70, 86 46"/></svg>',
  bad:  '<svg class="mark" viewBox="0 0 100 100" aria-hidden="true"><path d="M24 24 L76 76 M76 24 L24 76"/></svg>',
  unk:  ''
};
const ARROW_MARKS = {
  '↑': '<svg class="mark" viewBox="0 0 100 100" aria-hidden="true"><path d="M50 86 L50 16 M22 44 L50 16 L78 44"/></svg>',
  '↓': '<svg class="mark" viewBox="0 0 100 100" aria-hidden="true"><path d="M50 14 L50 84 M22 56 L50 84 L78 56"/></svg>'
};
const ARROW_LABEL = { '↑': 'el ramo buscado tiene un valor mayor', '↓': 'el ramo buscado tiene un valor menor' };
const STATUS_LABEL = { ok: 'Coincide', part: 'Coincide en parte', bad: 'Distinto', unk: 'Sin información' };

function textSize(text) {
  const n = String(text).length;
  if (n <= 4) return 'xl';
  if (n <= 14) return 'm';
  if (n <= 32) return 's';
  return 'xs';
}

function codeHtml(guessCode, answerCode) {
  const split = c => {
    const str = String(c || '').trim();
    const m = /^([A-Za-z]+)(.*)$/.exec(str);
    return m ? [m[1], m[2]] : [str, ''];
  };
  const [gl, gn] = split(guessCode);
  const [al, an] = split(answerCode);
  let i = 0, ok = 0, total = 0;
  const chars = (g, a) => [...g].map((ch, k) => {
    const match = ch.toUpperCase() === (a[k] || '').toUpperCase();
    total++;
    if (match) ok++;
    return `<span class="code-ch ${match ? 'is-ok' : 'is-bad'}" style="--i:${i++}">${escapeHtml(ch)}</span>`;
  }).join('');
  const html = chars(gl, al) + chars(gn, an);
  return { html, ok, total };
}

function applyGrid() {
  const n = game.activeColumns.length;
  DOM.board.style.setProperty('--cols', n);
  DOM.board.style.setProperty('--rows', game.maxAttempts);
}

function renderBoard(animateLast = false) {
  applyGrid();

  let html = `
    <div class="row head">
      <div class="cell name-head">Ramo</div>
      ${game.activeColumns.map(col => {
        const short = SHORT_LABELS[col.key] || col.label;
        return `
          <div class="cell" title="${escapeHtml(col.label)}">
            <span class="label-full">${escapeHtml(col.label)}</span>
            <span class="label-short">${escapeHtml(short)}</span>
          </div>
        `;
      }).join('')}
    </div>
  `;

  game.guesses.forEach((guess, idx) => {
    const isNew = animateLast && idx === game.guesses.length - 1;
    const rowClass = `row ${isNew ? 'new-row' : ''}`;

    const cellsHtml = game.activeColumns.map((col, cIdx) => {
      const res = game.compareAttribute(guess, game.answer, col);
      return `
        <div class="cell sq ${res.status}" style="--delay-index: ${cIdx}" title="${escapeHtml(res.title ?? res.text)}">
          ${res.arrow ? ARROW_MARKS[res.arrow] : MARKS[res.status]}
          <span class="cell-text ${textSize(res.text)}">${escapeHtml(res.text)}</span>
          <span class="sr-only">${STATUS_LABEL[res.status]}${res.arrow ? `: ${ARROW_LABEL[res.arrow]}` : ''}</span>
        </div>
      `;
    }).join('');

    const code = codeHtml(guess.codigo, game.answer.codigo);

    html += `
      <div class="${rowClass}">
        <div class="cell name-cell" title="${escapeHtml(guess.codigo + ' — ' + guess.nombre)}">
          <div class="name-code mono">${code.html}<span class="sr-only">Código ${escapeHtml(guess.codigo)}: ${code.ok} de ${code.total} caracteres correctos</span></div>
          <div class="name-title">${escapeHtml(guess.nombre)}</div>
        </div>
        ${cellsHtml}
      </div>
    `;
  });

  for (let i = game.guesses.length; i < game.maxAttempts; i++) {
    html += `
      <div class="row">
        <div class="cell name-cell placeholder"></div>
        ${game.activeColumns.map(() => '<div class="cell sq placeholder"></div>').join('')}
      </div>
    `;
  }

  DOM.board.innerHTML = html;
}

function updateModeButtons() {
  DOM.modeButtons.forEach(btn => {
    const active = (btn.dataset.mode === 'daily') === game.isDaily;
    btn.setAttribute('aria-pressed', String(active));
  });
  if (DOM.mobileModeBadge) {
    DOM.mobileModeBadge.textContent = game.isDaily ? 'Ramo del día' : 'Práctica libre';
  }
}

function chooseGuess(course) {
  if (!course) return;
  const res = game.makeGuess(course);
  if (!res) return;

  renderBoard(true);
  hideSuggestions();
  DOM.searchInput.value = '';
  DOM.searchInput.blur();

  if (game.finished) {
    syncControls();
    endTimer = setTimeout(() => showEndScreen(res.won), REVEAL_DELAY_MS);
  }
}

function closeEndDialog() {
  if (DOM.endDialog.open) DOM.endDialog.close();
}

function showEndScreen(won) {
  clearTimeout(endTimer);
  const n = game.guesses.length;
  DOM.endCard.className = `end-card ${won ? 'win' : 'lose'}`;

  const canSubmit = game.isDaily && !hasSubmittedToday();

  DOM.endCard.innerHTML = `
    <h2 id="end-title">${won ? '¡Correcto!' : 'El ramo era…'}</h2>
    <p class="end-answer">
      <span class="mono">${escapeHtml(game.answer.codigo)}</span>
      <b>${escapeHtml(game.answer.nombre)}</b>
    </p>
    <p>${won ? `Lo adivinaste en ${n} intento${n === 1 ? '' : 's'}.` : 'Se acabaron los intentos.'}</p>
    <button id="copy-btn" type="button">Compartir resultado</button>

    ${game.isDaily ? `
      <hr class="dialog-divider">
      <div class="leaderboard-section">
        <h3>Ranking del día</h3>
        ${canSubmit ? `
          <form id="lb-form" class="lb-form">
            <input type="text" id="lb-name" placeholder="Tu apodo (2-20 letras)" minlength="2" maxlength="20" required autocomplete="off">
            <button type="submit" id="lb-submit">Guardar</button>
          </form>
        ` : '<p><small>Puntaje del día registrado.</small></p>'}
        <div id="lb-list" class="lb-list"><small>Cargando ranking…</small></div>
      </div>
    ` : ''}
  `;

  const copyBtn = document.getElementById('copy-btn');
  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(game.generateShareText());
      copyBtn.textContent = '¡Copiado al portapapeles!';
    } catch {
      copyBtn.textContent = 'No se pudo copiar';
    }
  });

  if (game.isDaily) {
    loadLeaderboardUI();
    const form = document.getElementById('lb-form');
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = document.getElementById('lb-name');
        const btn = document.getElementById('lb-submit');
        btn.disabled = true;
        try {
          await submitDailyScore({ apodo: input.value, intentos: n, gano: won });
          form.replaceWith(Object.assign(document.createElement('p'), {
            innerHTML: '<small>¡Puntaje guardado!</small>'
          }));
          await loadLeaderboardUI();
        } catch (err) {
          alert(err.message);
          btn.disabled = false;
        }
      });
    }
  }

  if (!DOM.endDialog.open) DOM.endDialog.showModal();
}

async function loadLeaderboardUI() {
  const container = document.getElementById('lb-list');
  if (!container) return;
  try {
    const rows = await fetchDailyLeaderboard();
    if (!Array.isArray(rows) || rows.length === 0) {
      container.innerHTML = '<small>Aún no hay resultados hoy. ¡Sé el primero!</small>';
      return;
    }
    container.innerHTML = `
      <ol class="lb-ranking">
        ${rows.map(r => `
          <li>
            <span class="lb-user">${escapeHtml(r.apodo)}</span>
            <span class="mono lb-score">${r.gano ? `${Number(r.intentos)}/${game.maxAttempts}` : `X/${game.maxAttempts}`}</span>
          </li>
        `).join('')}
      </ol>
    `;
  } catch {
    container.innerHTML = '<small>No se pudo conectar al leaderboard.</small>';
  }
}

function hideSuggestions() {
  DOM.suggestions.hidden = true;
  selectedIndex = -1;
}

function handleSearchInput() {
  if (!game || game.finished) return;

  const query = normalize(DOM.searchInput.value.trim());
  if (!query) {
    hideSuggestions();
    return;
  }

  currentMatches = game.db
    .filter(c => !game.guesses.some(g => g.codigo === c.codigo) &&
      (normalize(c.codigo).includes(query) || normalize(c.nombre).includes(query))
    )
    .sort((a, b) => {
      const aStarts = normalize(a.codigo).startsWith(query) || normalize(a.nombre).startsWith(query);
      const bStarts = normalize(b.codigo).startsWith(query) || normalize(b.nombre).startsWith(query);
      return (bStarts - aStarts) || a.codigo.localeCompare(b.codigo);
    })
    .slice(0, 8);

  if (currentMatches.length === 0) {
    DOM.suggestions.innerHTML = '<li><small>Sin coincidencias</small></li>';
    DOM.suggestions.hidden = false;
    selectedIndex = -1;
    return;
  }

  DOM.suggestions.innerHTML = currentMatches.map((c, i) => `
    <li data-index="${i}">
      <span class="mono"><b>${escapeHtml(c.codigo)}</b></span>
      <span>${escapeHtml(c.nombre)}</span>
    </li>
  `).join('');

  DOM.suggestions.hidden = false;
  selectedIndex = 0;
  highlightSuggestion();
}

function highlightSuggestion() {
  Array.from(DOM.suggestions.children).forEach((li, idx) => {
    li.classList.toggle('active', idx === selectedIndex);
  });
}

function handleSearchKeydown(e) {
  if (DOM.suggestions.hidden || currentMatches.length === 0) {
    if (e.key === 'Enter') e.preventDefault();
    return;
  }

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    selectedIndex = (selectedIndex + 1) % currentMatches.length;
    highlightSuggestion();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    selectedIndex = (selectedIndex - 1 + currentMatches.length) % currentMatches.length;
    highlightSuggestion();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (selectedIndex >= 0 && selectedIndex < currentMatches.length) {
      chooseGuess(currentMatches[selectedIndex]);
    }
  } else if (e.key === 'Escape') {
    hideSuggestions();
  }
}

init();