import { BeauchldeGame } from './game.js';
import { normalize, escapeHtml } from './utils.js';
import {
  calculatePoints,
  ensureActiveSession,
  getCurrentUser,
  registerUser,
  loginUser,
  logoutUser,
  fetchDailyLeaderboard,
  fetchGeneralLeaderboard,
  submitDailyScore,
  hasSubmittedToday
} from './leaderboard.js';
import { initBlindRanking, openBlindRanking, closeBlindRanking } from './ranking-ui.js';
import { initTierList, openTierList, closeTierList } from './tierlist-ui.js';

let game = null;
let currentMode = 'daily';   // 'daily' | 'practice' | 'ranking' | 'tierlist'
let currentMatches = [];
let selectedIndex = -1;
let authMode = 'login';      // 'login' | 'register'
let lbTab = 'daily';         // 'daily' | 'general'

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
  deptTabs: document.getElementById('dept-tabs'),
  board: document.getElementById('board'),
  endDialog: document.getElementById('end-dialog'),
  endCard: document.getElementById('end-card'),
  endClose: document.getElementById('end-close'),
  sidebar: document.getElementById('sidebar'),
  sidebarBackdrop: document.getElementById('sidebar-backdrop'),
  menuToggle: document.getElementById('menu-toggle'),
  sidebarClose: document.getElementById('sidebar-close'),
  mobileModeBadge: document.getElementById('mobile-mode-badge'),
  userBox: document.getElementById('user-box'),
  trophyBtn: document.getElementById('trophy-btn'),
  lbDialog: document.getElementById('lb-dialog'),
  lbClose: document.getElementById('lb-close'),
  lbModalList: document.getElementById('lb-modal-list'),
  lbModalTabs: document.querySelectorAll('[data-modal-lb-tab]'),
  authDialog: document.getElementById('auth-dialog'),
  authClose: document.getElementById('auth-close'),
  authForm: document.getElementById('auth-form'),
  authTitle: document.getElementById('auth-title'),
  authDesc: document.getElementById('auth-desc'),
  authUsername: document.getElementById('auth-username'),
  authPassword: document.getElementById('auth-password'),
  authError: document.getElementById('auth-error'),
  authSubmit: document.getElementById('auth-submit'),
  authTabs: document.querySelectorAll('[data-auth-tab]')
};

const REVEAL_DELAY_MS = 1100;
let endTimer = null;

async function init() {
  attachEvents();
  await ensureActiveSession();
  renderUserBox();
  try {
    const response = await fetch('ramos.json');
    if (!response.ok) throw new Error('No se pudo cargar ramos.json');
    const data = await response.json();
    setupGame(data);
  } catch (err) {
    DOM.loader.hidden = false;
  }
}

function renderUserBox() {
  if (!DOM.userBox) return;
  const user = getCurrentUser();
  if (user) {
    DOM.userBox.innerHTML = `
      <div class="user-logged">
        <strong class="user-name mono" title="Conectado como @${escapeHtml(user.apodo)}">@${escapeHtml(user.apodo)}</strong>
        <button type="button" class="user-logout-btn" data-user-action="logout" title="Cerrar sesión">Salir</button>
      </div>
    `;
  } else {
    DOM.userBox.innerHTML = `
      <div class="user-guest-btns">
        <button type="button" class="user-auth-btn" data-user-action="open-login">Iniciar sesión</button>
        <button type="button" class="user-auth-btn ghost" data-user-action="open-register">Crear usuario</button>
      </div>
    `;
  }
}

function openAuthDialog(mode = 'login') {
  if (!DOM.authDialog) return;
  setAuthMode(mode);
  DOM.authError.hidden = true;
  DOM.authPassword.value = '';
  if (!DOM.authDialog.open) DOM.authDialog.showModal();
  DOM.authUsername.focus();
}

function closeAuthDialog() {
  if (DOM.authDialog && DOM.authDialog.open) DOM.authDialog.close();
}

function openLeaderboardModal() {
  if (!DOM.lbDialog) return;
  syncLbTabButtons();
  loadLeaderboardInto(DOM.lbModalList);
  if (!DOM.lbDialog.open) DOM.lbDialog.showModal();
}

function closeLeaderboardModal() {
  if (DOM.lbDialog && DOM.lbDialog.open) DOM.lbDialog.close();
}

function syncLbTabButtons() {
  document.querySelectorAll('[data-lb-tab], [data-modal-lb-tab]').forEach(btn => {
    const t = btn.dataset.lbTab || btn.dataset.modalLbTab;
    btn.setAttribute('aria-pressed', String(t === lbTab));
  });
}

function setAuthMode(mode) {
  authMode = mode === 'register' ? 'register' : 'login';
  DOM.authTabs.forEach(btn => {
    btn.setAttribute('aria-pressed', String(btn.dataset.authTab === authMode));
  });
  if (authMode === 'register') {
    DOM.authTitle.textContent = 'Crear usuario';
    DOM.authDesc.textContent = 'Elige un nombre de usuario único (2-20 letras/números) y una contraseña.';
    DOM.authSubmit.textContent = 'Crear cuenta';
    DOM.authPassword.setAttribute('autocomplete', 'new-password');
  } else {
    DOM.authTitle.textContent = 'Iniciar sesión';
    DOM.authDesc.textContent = 'Ingresa con tu usuario único para guardar tus puntos.';
    DOM.authSubmit.textContent = 'Entrar';
    DOM.authPassword.setAttribute('autocomplete', 'current-password');
  }
  DOM.authError.hidden = true;
}

function setupGame(data) {
  try {
    game = new BeauchldeGame(data);
    initBlindRanking(game.db);
    initTierList(game.allDb);
    renderDeptTabs();
    DOM.loader.hidden = true;
    DOM.gameContainer.hidden = false;
    DOM.modeNav.hidden = false;
    if (DOM.deptTabs) DOM.deptTabs.hidden = false;
    startSession(true);
  } catch (err) {
    alert(err.message);
  }
}

function renderDeptTabs() {
  if (!DOM.deptTabs || !game) return;
  const depts = game.getAvailableDepartments();
  const pcCount = game.getPlanComunCount();

  const allBtn = `
    <button type="button" class="dept-tab" data-dept="ALL" aria-pressed="true" title="Todos los departamentos">
      Todos
    </button>
  `;

  const planComunBtn = pcCount >= 2 ? `
    <button type="button" class="dept-tab" data-dept="PLAN_COMUN" aria-pressed="false" title="Ramos de Plan Común (${pcCount} ramos)">
      Plan Común
    </button>
  ` : '';

  const deptBtns = depts.map(d => `
    <button type="button" class="dept-tab" data-dept="${escapeHtml(d.key)}" aria-pressed="false" title="${escapeHtml(d.fullName)} (${d.count} ramos)">
      ${escapeHtml(d.label)}
    </button>
  `).join('');

  DOM.deptTabs.innerHTML = allBtn + planComunBtn + deptBtns;
}

function updateDeptButtons() {
  if (!DOM.deptTabs || !game) return;
  DOM.deptTabs.hidden = (currentMode === 'tierlist');
  DOM.deptTabs.querySelectorAll('[data-dept]').forEach(btn => {
    btn.setAttribute('aria-pressed', String(btn.dataset.dept === game.department));
  });
}

function startSession(daily) {
  clearTimeout(endTimer);
  currentMode = daily ? 'daily' : 'practice';
  closeBlindRanking();
  closeTierList();
  DOM.gameContainer.hidden = false;
  game.startNewGame(daily);
  closeEndDialog();
  closeMobileDrawer();
  DOM.searchInput.value = '';
  hideSuggestions();
  updateModeButtons();
  updateDeptButtons();
  renderBoard(false);
  syncControls();

  if (game.finished) {
    showEndScreen(game.won);
  }
}

function startRankingMode() {
  clearTimeout(endTimer);
  closeEndDialog();
  closeMobileDrawer();
  hideSuggestions();
  closeTierList();
  currentMode = 'ranking';
  DOM.gameContainer.hidden = true;
  openBlindRanking();
  updateModeButtons();
  updateDeptButtons();
}

function startTierListMode() {
  clearTimeout(endTimer);
  closeEndDialog();
  closeMobileDrawer();
  hideSuggestions();
  closeBlindRanking();
  currentMode = 'tierlist';
  DOM.gameContainer.hidden = true;
  openTierList();
  updateModeButtons();
  updateDeptButtons();
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

  if (DOM.trophyBtn) {
    DOM.trophyBtn.addEventListener('click', openLeaderboardModal);
  }
  if (DOM.lbClose) {
    DOM.lbClose.addEventListener('click', closeLeaderboardModal);
  }
  if (DOM.lbDialog) {
    DOM.lbDialog.addEventListener('click', (e) => {
      if (e.target === DOM.lbDialog) closeLeaderboardModal();
    });
  }
  DOM.lbModalTabs.forEach(btn => {
    btn.addEventListener('click', () => {
      lbTab = btn.dataset.modalLbTab;
      syncLbTabButtons();
      loadLeaderboardInto(DOM.lbModalList);
    });
  });

  if (DOM.userBox) {
    DOM.userBox.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-user-action]');
      if (!btn) return;
      const action = btn.dataset.userAction;
      if (action === 'open-login') openAuthDialog('login');
      else if (action === 'open-register') openAuthDialog('register');
      else if (action === 'logout') {
        await logoutUser();
        renderUserBox();
      }
    });
  }

  if (DOM.authClose) {
    DOM.authClose.addEventListener('click', closeAuthDialog);
  }
  if (DOM.authDialog) {
    DOM.authDialog.addEventListener('click', (e) => {
      if (e.target === DOM.authDialog) closeAuthDialog();
    });
  }

  DOM.authTabs.forEach(tab => {
    tab.addEventListener('click', () => setAuthMode(tab.dataset.authTab));
  });

  if (DOM.authForm) {
    DOM.authForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      DOM.authError.hidden = true;
      DOM.authSubmit.disabled = true;

      try {
        const username = DOM.authUsername.value;
        const password = DOM.authPassword.value;
        if (authMode === 'register') {
          await registerUser(username, password);
        } else {
          await loginUser(username, password);
        }
        renderUserBox();
        closeAuthDialog();

        if (game && game.finished && game.isDaily && game.department === 'ALL') {
          await tryAutoSubmitScore(game.won);
          if (DOM.endDialog.open) showEndScreen(game.won);
        }
      } catch (err) {
        DOM.authError.textContent = err.message;
        DOM.authError.hidden = false;
      } finally {
        DOM.authSubmit.disabled = false;
      }
    });
  }

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
    const mode = btn.dataset.mode;

    if (mode === 'ranking') {
      if (currentMode === 'ranking') closeMobileDrawer();
      else startRankingMode();
      return;
    }

    if (mode === 'tierlist') {
      if (currentMode === 'tierlist') closeMobileDrawer();
      else startTierListMode();
      return;
    }

    const daily = mode === 'daily';
    if (daily && currentMode === 'daily') {
      closeMobileDrawer();
      return;
    }
    startSession(daily);
  });

  if (DOM.deptTabs) {
    DOM.deptTabs.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-dept]');
      if (!btn || !game) return;
      const dept = btn.dataset.dept;
      if (dept === game.department) return;

      game.setDepartment(dept);
      initBlindRanking(game.db);
      updateDeptButtons();

      if (currentMode === 'ranking') {
        startRankingMode();
      } else {
        startSession(currentMode === 'daily');
      }
    });
  }

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

const MODE_NAMES = {
  daily: 'Ramo del día',
  practice: 'Práctica libre',
  ranking: 'Blind ranking',
  tierlist: 'Tier List - PC'
};

function updateModeButtons() {
  DOM.modeButtons.forEach(btn => {
    btn.setAttribute('aria-pressed', String(btn.dataset.mode === currentMode));
  });
  if (DOM.mobileModeBadge) {
    let deptSuffix = '';
    if (currentMode !== 'tierlist' && game && game.department !== 'ALL') {
      const label = game.department === 'PLAN_COMUN' ? 'Plan Común' : game.department;
      deptSuffix = ` · ${label}`;
    }
    DOM.mobileModeBadge.textContent = `${MODE_NAMES[currentMode]}${deptSuffix}`;
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

async function tryAutoSubmitScore(won) {
  const user = getCurrentUser();
  if (!user || !game.isDaily || game.department !== 'ALL' || hasSubmittedToday()) return false;
  try {
    await submitDailyScore({ intentos: game.guesses.length, gano: won });
    return true;
  } catch (err) {
    console.warn('Error al guardar puntaje automático:', err);
    return false;
  }
}

async function showEndScreen(won) {
  clearTimeout(endTimer);
  const n = game.guesses.length;
  const pts = calculatePoints(n, won);
  DOM.endCard.className = `end-card ${won ? 'win' : 'lose'}`;

  if (game.isDaily && game.department === 'ALL') {
    await tryAutoSubmitScore(won);
  }

  const user = getCurrentUser();
  const submitted = hasSubmittedToday();

  DOM.endCard.innerHTML = `
    <h2 id="end-title">${won ? '¡Correcto!' : 'El ramo era…'}</h2>
    <p class="end-answer">
      <span class="mono">${escapeHtml(game.answer.codigo)}</span>
      <b>${escapeHtml(game.answer.nombre)}</b>
    </p>
    <p>
      ${won
        ? `Lo adivinaste en <b>${n}</b> intento${n === 1 ? '' : 's'} · <b class="pts-badge">+${pts} pts</b>`
        : 'Se acabaron los intentos · <b>0 pts</b>'}
    </p>
    <button id="copy-btn" type="button">Compartir resultado</button>

    ${game.isDaily && game.department === 'ALL' ? `
      <hr class="dialog-divider">
      <div class="leaderboard-section">
        <div class="lb-header-row">
          <h3>Ranking</h3>
          <div class="lb-switch">
            <button type="button" class="lb-tab-btn" data-lb-tab="daily" aria-pressed="${lbTab === 'daily'}">Hoy</button>
            <button type="button" class="lb-tab-btn" data-lb-tab="general" aria-pressed="${lbTab === 'general'}">Acumulado</button>
          </div>
        </div>

        ${user
          ? `<p class="lb-status-msg"><small>${submitted ? `Puntaje guardado como <b>@${escapeHtml(user.apodo)}</b> (+${pts} pts).` : `Conectado como <b>@${escapeHtml(user.apodo)}</b>.`}</small></p>`
          : `<div class="lb-login-prompt">
               <small>Inicia sesión o crea tu usuario para guardar tus <b>${pts} pts</b> en el ranking:</small>
               <div class="user-guest-btns">
                 <button type="button" class="user-auth-btn" id="end-login-btn">Iniciar sesión</button>
                 <button type="button" class="user-auth-btn ghost" id="end-register-btn">Crear usuario</button>
               </div>
             </div>`
        }

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

  const endLoginBtn = document.getElementById('end-login-btn');
  if (endLoginBtn) endLoginBtn.addEventListener('click', () => openAuthDialog('login'));
  const endRegisterBtn = document.getElementById('end-register-btn');
  if (endRegisterBtn) endRegisterBtn.addEventListener('click', () => openAuthDialog('register'));

  DOM.endCard.querySelectorAll('[data-lb-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      lbTab = btn.dataset.lbTab;
      syncLbTabButtons();
      loadLeaderboardInto(document.getElementById('lb-list'));
    });
  });

  if (game.isDaily && game.department === 'ALL') {
    loadLeaderboardInto(document.getElementById('lb-list'));
  }

  if (!DOM.endDialog.open) DOM.endDialog.showModal();
}

async function loadLeaderboardInto(container) {
  if (!container) return;
  container.innerHTML = '<small>Cargando ranking…</small>';
  const maxAtt = game ? game.maxAttempts : 6;

  try {
    if (lbTab === 'general') {
      const rows = await fetchGeneralLeaderboard();
      if (!Array.isArray(rows) || rows.length === 0) {
        container.innerHTML = '<small>Aún no hay puntajes registrados.</small>';
        return;
      }
      const top5 = rows.slice(0, 5);
      const rest = rows.slice(5);

      container.innerHTML = `
        <div class="top5-section">
          <h4 class="top5-title">🔥 Top 5 Global</h4>
          <ol class="lb-ranking top5-list">
            ${top5.map((r, i) => `
              <li class="top5-item rank-${i + 1}">
                <span class="lb-user"><b>#${i + 1}</b> @${escapeHtml(r.apodo)}</span>
                <span class="mono lb-score"><b>${Number(r.puntos_totales)} pts</b> <small>(${Number(r.ganados)}/${Number(r.jugados)})</small></span>
              </li>
            `).join('')}
          </ol>
        </div>
        ${rest.length > 0 ? `
          <hr class="dialog-divider">
          <ol class="lb-ranking rest-list" start="6">
            ${rest.map((r, i) => `
              <li>
                <span class="lb-user"><small>#${i + 6}</small> @${escapeHtml(r.apodo)}</span>
                <span class="mono lb-score"><b>${Number(r.puntos_totales)} pts</b> <small>(${Number(r.ganados)}/${Number(r.jugados)})</small></span>
              </li>
            `).join('')}
          </ol>
        ` : ''}
      `;
    } else {
      const rows = await fetchDailyLeaderboard();
      if (!Array.isArray(rows) || rows.length === 0) {
        container.innerHTML = '<small>Aún no hay resultados hoy. ¡Sé el primero!</small>';
        return;
      }
      container.innerHTML = `
        <ol class="lb-ranking">
          ${rows.map((r, i) => `
            <li>
              <span class="lb-user"><b>#${i + 1}</b> @${escapeHtml(r.apodo)}</span>
              <span class="mono lb-score"><b>+${Number(r.puntos)} pts</b> (${r.gano ? `${Number(r.intentos)}/${maxAtt}` : `X/${maxAtt}`})</span>
            </li>
          `).join('')}
        </ol>
      `;
    }
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