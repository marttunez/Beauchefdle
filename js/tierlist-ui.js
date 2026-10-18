import { escapeHtml } from './utils.js';
import { isPlanComun } from './game.js';

export const TIERS = [
  { id: 'S', label: 'S', color: '#ff7f7f' },
  { id: 'A', label: 'A', color: '#ffbf7f' },
  { id: 'B', label: 'B', color: '#ffdf7f' },
  { id: 'C', label: 'C', color: '#ffff7f' },
  { id: 'D', label: 'D', color: '#bfff7f' },
  { id: 'F', label: 'F', color: '#7fbfff' }
];

let pcCourses = [];
let placement = new Map(); // codigo -> 'S' | 'A' | 'B' | 'C' | 'D' | 'F'
let selectedCode = null;   // Para mover haciendo clic (ideal en móvil o sin arrastrar)
let root = null;

export function initTierList(allDb) {
  pcCourses = allDb
    .filter(isPlanComun)
    .slice()
    .sort((a, b) => a.codigo.localeCompare(b.codigo));

  root = document.getElementById('tierlist-container');
  if (root && !root.dataset.bound) {
    root.dataset.bound = '1';
    root.addEventListener('click', onClick);
    root.addEventListener('dragstart', onDragStart);
    root.addEventListener('dragend', onDragEnd);
    root.addEventListener('dragover', onDragOver);
    root.addEventListener('dragleave', onDragLeave);
    root.addEventListener('drop', onDrop);
  }
}

export function openTierList() {
  if (!root) return;
  root.hidden = false;
  render();
}

export function closeTierList() {
  if (root) root.hidden = true;
}

function renderCard(c) {
  const isSel = selectedCode === c.codigo;
  return `
    <div class="tl-item ${isSel ? 'is-selected' : ''}" draggable="true" data-code="${escapeHtml(c.codigo)}" title="${escapeHtml(c.codigo + ' — ' + c.nombre)}">
      <span class="tl-code mono">${escapeHtml(c.codigo)}</span>
      <span class="tl-name">${escapeHtml(c.nombre)}</span>
    </div>
  `;
}

function render() {
  if (!root) return;

  const rowsHtml = TIERS.map(t => {
    const items = pcCourses.filter(c => placement.get(c.codigo) === t.id);
    return `
      <div class="tl-row" data-tier="${t.id}">
        <button type="button" class="tl-label" data-tier-btn="${t.id}" style="--tier-bg: ${t.color}" title="Mover seleccionado a Tier ${t.label}">
          ${t.label}
        </button>
        <div class="tl-dropzone" data-drop="${t.id}">
          ${items.map(renderCard).join('')}
        </div>
      </div>
    `;
  }).join('');

  const unplaced = pcCourses.filter(c => !placement.has(c.codigo));

  root.innerHTML = `
    <div class="tl-wrapper">
      <header class="tl-header">
        <div>
          <h2>Tier List · Plan Común</h2>
          <p class="tl-sub">Arrastra cada ramo a su categoría, o haz clic en un ramo y luego en la fila donde quieras ponerlo.</p>
        </div>
        <div class="tl-actions">
          <button type="button" class="rk-btn" data-tl-action="copy">Copiar Tier List</button>
          <button type="button" class="rk-btn ghost" data-tl-action="reset">Reiniciar</button>
        </div>
      </header>

      <div class="tl-board">
        ${rowsHtml}
      </div>

      <div class="tl-pool-section">
        <div class="tl-pool-head">
          <span>Ramos sin clasificar (${unplaced.length}/${pcCourses.length})</span>
          ${selectedCode ? `<small class="tl-active-hint">Seleccionado: <b>${escapeHtml(selectedCode)}</b> — toca una fila o esta caja para moverlo</small>` : ''}
        </div>
        <div class="tl-pool tl-dropzone" data-drop="POOL">
          ${unplaced.length ? unplaced.map(renderCard).join('') : '<p class="tl-empty">¡Todos los ramos de Plan Común están clasificados!</p>'}
        </div>
      </div>
    </div>
  `;
}

function moveCourse(code, targetTier) {
  if (!code) return;
  if (targetTier === 'POOL' || !targetTier) {
    placement.delete(code);
  } else {
    placement.set(code, targetTier);
  }
  selectedCode = null;
  render();
}

function onClick(e) {
  const actionBtn = e.target.closest('[data-tl-action]');
  if (actionBtn) {
    const act = actionBtn.dataset.tlAction;
    if (act === 'reset') {
      placement.clear();
      selectedCode = null;
      render();
    } else if (act === 'copy') {
      copyTierList(actionBtn);
    }
    return;
  }

  const item = e.target.closest('.tl-item[data-code]');
  if (item) {
    const code = item.dataset.code;
    selectedCode = selectedCode === code ? null : code;
    render();
    return;
  }

  if (selectedCode) {
    const tierBtn = e.target.closest('[data-tier-btn]');
    if (tierBtn) {
      moveCourse(selectedCode, tierBtn.dataset.tierBtn);
      return;
    }
    const dropzone = e.target.closest('[data-drop]');
    if (dropzone) {
      moveCourse(selectedCode, dropzone.dataset.drop);
      return;
    }
  }
}

function onDragStart(e) {
  const item = e.target.closest('.tl-item[data-code]');
  if (!item) return;
  e.dataTransfer.setData('text/plain', item.dataset.code);
  e.dataTransfer.effectAllowed = 'move';
  requestAnimationFrame(() => item.classList.add('is-dragging'));
}

function onDragEnd(e) {
  const item = e.target.closest('.tl-item[data-code]');
  if (item) item.classList.remove('is-dragging');
  root.querySelectorAll('.is-dragover').forEach(el => el.classList.remove('is-dragover'));
}

function onDragOver(e) {
  const zone = e.target.closest('[data-drop], [data-tier-btn]');
  if (!zone) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  const rowOrPool = zone.closest('.tl-row') || zone.closest('.tl-pool');
  if (rowOrPool) rowOrPool.classList.add('is-dragover');
}

function onDragLeave(e) {
  const zone = e.target.closest('[data-drop], [data-tier-btn]');
  if (!zone) return;
  const rowOrPool = zone.closest('.tl-row') || zone.closest('.tl-pool');
  if (rowOrPool && !rowOrPool.contains(e.relatedTarget)) {
    rowOrPool.classList.remove('is-dragover');
  }
}

function onDrop(e) {
  const zone = e.target.closest('[data-drop], [data-tier-btn]');
  if (!zone) return;
  e.preventDefault();
  const code = e.dataTransfer.getData('text/plain');
  const target = zone.dataset.drop || zone.dataset.tierBtn;
  if (code && target) {
    moveCourse(code, target);
  }
}

async function copyTierList(btn) {
  const lines = TIERS.map(t => {
    const list = pcCourses
      .filter(c => placement.get(c.codigo) === t.id)
      .map(c => c.codigo);
    return `${t.label}: ${list.length ? list.join(', ') : '—'}`;
  });
  const text = `Beauchefdle · Tier List Plan Común\n${lines.join('\n')}`;
  try {
    await navigator.clipboard.writeText(text);
    btn.textContent = '¡Copiado!';
  } catch {
    btn.textContent = 'No se pudo copiar';
  }
}