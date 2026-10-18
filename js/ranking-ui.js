// js/ranking-ui.js — interfaz del modo "Blind ranking"
import { BlindRanking, RANKING_SIZES } from './ranking.js';
import { escapeHtml } from './utils.js';
import { departmentLabel } from './departamentos.js';

let courses = [];
let root = null;
let rk = null;                          // partida en curso (null = pantalla de elegir tamaño)
let lastSize = RANKING_SIZES[0];

/** Se llama cada vez que se carga la base de ramos. */
export function initBlindRanking(db) {
  courses = db;
  rk = null;
  root = document.getElementById('ranking-container');
  if (root && !root.dataset.bound) {
    root.dataset.bound = '1';
    root.addEventListener('click', onClick);
  }
}

export function openBlindRanking() {
  if (!root) return;
  root.hidden = false;
  rk ? renderPlay() : renderSetup();    // si dejaste un ranking a medias, se retoma
}

export function closeBlindRanking() {
  if (root) root.hidden = true;
}

// ---------------------------------------------------------------- pantallas
function renderSetup() {
  const sizes = RANKING_SIZES.map(n =>
    `<button type="button" class="rk-btn" data-action="start" data-size="${n}"${courses.length < 2 ? ' disabled' : ''}>${n} ramos</button>`
  ).join('');

  root.innerHTML = `
    <div class="rk-card">
      <h2>Blind ranking</h2>
      <p>Te mostramos <b>un ramo a la vez, al azar</b>. Decide en qué puesto de tu ranking va <b>antes</b> de ver el siguiente: una vez puesto, no se puede mover.</p>
      <p>El puesto 1 es el <b>mejor</b> y el último, el <b>peor</b>. ¿Cuántos ramos quieres rankear?</p>
      <div class="rk-sizes">${sizes}</div>
    </div>
  `;
}

function meta(c) {
  const short = t => (t.length > 24 ? `${t.slice(0, 23)}…` : t);
  const chips = [];
  if (c.departamento) chips.push(departmentLabel(c.departamento));
  if (c.creditos != null) chips.push(`${c.creditos} créd.`);
  if (c.caracter) chips.push(c.caracter);
  return chips.map(t => `<span class="rk-chip" title="${escapeHtml(t)}">${escapeHtml(short(String(t)))}</span>`).join('');
}

function renderPlay() {
  const done = rk.finished;

  const progress = `
    <div class="rk-progress">
      <span>${done ? 'Ranking completo' : `Ramo ${rk.placed + 1} de ${rk.size}`}</span>
      <div class="rk-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${rk.size}" aria-valuenow="${rk.placed}">
        <span style="--p:${rk.placed / rk.size}"></span>
      </div>
    </div>
  `;

  const top = done
    ? `
      <div class="rk-card rk-result">
        <h2>¡Listo!</h2>
        <p>Este es tu ranking, de mejor a peor.</p>
        <div class="rk-actions">
          <button type="button" class="rk-btn" data-action="copy">Copiar ranking</button>
          <button type="button" class="rk-btn ghost" data-action="again">Otro ranking de ${rk.size}</button>
          <button type="button" class="rk-btn ghost" data-action="setup">Cambiar tamaño</button>
        </div>
      </div>
    `
    : `
      <div class="rk-current" aria-live="polite">
        <div class="rk-code mono">${escapeHtml(rk.current.codigo)}</div>
        <h3>${escapeHtml(rk.current.nombre)}</h3>
        <div class="rk-meta">${meta(rk.current)}</div>
        <p class="rk-hint">Elige un puesto libre (1 = el mejor). No podrás moverlo después.</p>
      </div>
    `;

  const slots = rk.slots.map((c, i) => {
    const t = rk.size > 1 ? i / (rk.size - 1) : 0;           // 0 = verde (mejor) … 1 = rojo (peor)
    const tag = i === 0 ? 'Mejor' : i === rk.size - 1 ? 'Peor' : '';
    const tagHtml = tag ? `<span class="rk-end-tag">${tag}</span>` : '';
    const body = c
      ? `<div class="rk-filled"><span class="rk-fname">${escapeHtml(c.nombre)}</span><span class="mono">${escapeHtml(c.codigo)}</span>${tagHtml}</div>`
      : `<button type="button" class="rk-slot" data-slot="${i}" aria-label="Poner ${escapeHtml(rk.current ? rk.current.nombre : '')} en el puesto ${i + 1}"><span>Poner aquí</span>${tagHtml}</button>`;
    return `<li style="--t:${t}"><span class="rk-pos">${i + 1}</span>${body}</li>`;
  }).join('');

  root.innerHTML = `${progress}${top}<ol class="rk-slots">${slots}</ol>`;

  const focusTarget = done ? root.querySelector('[data-action="copy"]') : root.querySelector('.rk-slot');
  if (focusTarget) focusTarget.focus({ preventScroll: true });
}

// ---------------------------------------------------------------- acciones
function start(size) {
  try {
    rk = new BlindRanking(courses, size);
    lastSize = size;
  } catch (err) {
    alert(err.message);
    return;
  }
  root.scrollTop = 0;
  renderPlay();
}

async function copy(btn) {
  try {
    await navigator.clipboard.writeText(rk.toText());
    btn.textContent = '¡Copiado!';
  } catch {
    btn.textContent = 'No se pudo copiar';
  }
}

function onClick(e) {
  const slotBtn = e.target.closest('[data-slot]');
  if (slotBtn && rk) {
    if (rk.place(Number(slotBtn.dataset.slot))) renderPlay();
    return;
  }

  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  switch (btn.dataset.action) {
    case 'start': start(Number(btn.dataset.size)); break;
    case 'again': start(rk ? rk.size : lastSize); break;
    case 'setup': rk = null; renderSetup(); break;
    case 'copy':  if (rk) copy(btn); break;
  }
}