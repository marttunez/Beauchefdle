// js/ranking.js — lógica del modo "Blind ranking" (sin DOM, fácil de probar)

// Cantidades de ramos que se pueden rankear por partida
export const RANKING_SIZES = [5, 10];

/** Mezcla Fisher–Yates (devuelve una copia). `rng` permite fijar el azar en pruebas. */
export function shuffle(items, rng = Math.random) {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Blind ranking: se muestran los ramos de a uno, al azar. El jugador elige en qué puesto
 * de su ranking va cada uno ANTES de ver el siguiente, y no puede moverlo después.
 * Puesto 1 = el mejor; último puesto = el peor.
 */
export class BlindRanking {
  constructor(courses, size, rng = Math.random) {
    const unique = [...new Map(courses.map(c => [c.codigo, c])).values()];
    this.size = Math.min(size, unique.length);
    if (this.size < 2) throw new Error('Se necesitan al menos 2 ramos para armar un ranking.');
    this.queue = shuffle(unique, rng).slice(0, this.size);   // orden en que aparecen
    this.slots = Array(this.size).fill(null);                // slots[i] = ramo en el puesto i + 1
    this.placed = 0;                                         // cuántos ramos ya se pusieron
  }

  /** Ramo que hay que ubicar ahora (null si ya terminó). */
  get current() {
    return this.queue[this.placed] ?? null;
  }

  get finished() {
    return this.placed >= this.size;
  }

  /** `slot` es el índice 0-based del puesto: 0 = puesto 1. */
  canPlace(slot) {
    return !this.finished && Number.isInteger(slot) && slot >= 0 && slot < this.size && this.slots[slot] === null;
  }

  place(slot) {
    if (!this.canPlace(slot)) return false;
    this.slots[slot] = this.current;
    this.placed++;
    return true;
  }

  /** Texto para compartir. */
  toText() {
    const lines = this.slots.map((c, i) => `${i + 1}. ${c ? `${c.codigo} ${c.nombre}` : '—'}`);
    return `Beauchefdle · Blind ranking (${this.size})\n${lines.join('\n')}`;
  }
}