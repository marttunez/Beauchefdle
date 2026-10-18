import { getTodayKey, fnv1aHash, canonicalLabel } from './utils.js';
import { departmentKey, departmentLabel } from './departamentos.js';

// Cantidad de intentos por partida (como las 6 filas de Wordle)
export const MAX_ATTEMPTS = 6;

// Mínimo de ramos para que un departamento aparezca como opción
export const MIN_DEPT_COURSES = 5;

export const COLUMN_DEFINITIONS = [
  { key: 'departamento', label: 'Departamento',      type: 'exact', canon: departmentKey, format: departmentLabel },
  { key: 'creditos',     label: 'Créditos',          type: 'num' },
  { key: 'caracter',     label: 'Carácter',          type: 'exact' },
  { key: 'requisitos',   label: 'Requisitos',        type: 'set', allowEmpty: true },
  { key: 'nivel',        label: 'Nivel',             type: 'num' },
  { key: 'semestre',     label: 'Semestre',          type: 'num' },
  { key: 'carreras',     label: 'Carreras',          type: 'set' }
];

// Identifica ramos de Plan Común:
// - Si el JSON trae `plan_comun: true`, lo usa.
// - Si no, considera los ramos obligatorios de nivel 1 y 2 (1° y 2° año).
export function isPlanComun(course) {
  if (!course) return false;
  if (typeof course.plan_comun === 'boolean') return course.plan_comun;
  if (canonicalLabel(course.departamento).includes('plan comun')) return true;
  const nivel = Number(course.nivel);
  return (nivel === 1 || nivel === 2) && canonicalLabel(course.caracter) === 'obligatorio';
}

export class BeauchldeGame {
  constructor(database, { maxAttempts = MAX_ATTEMPTS } = {}) {
    this.allDb = (Array.isArray(database) ? database : database.ramos || [])
      .filter(item => item && item.codigo && item.nombre);

    if (this.allDb.length < 2) {
      throw new Error('La base requiere al menos 2 ramos válidos con código y nombre.');
    }

    this.department = 'ALL'; // 'ALL' | 'PLAN_COMUN' | sigla de departamento
    this.db = this.allDb;

    // Activar columnas presentes en al menos el 50% de los datos
    this.activeColumns = COLUMN_DEFINITIONS.filter(def => {
      const count = this.allDb.filter(c => this.getValue(c, def) != null).length;
      return count >= this.allDb.length * 0.5;
    });

    // Para columnas de texto, muestra siempre la escritura más frecuente de cada valor
    this.displayNames = {};
    for (const def of this.activeColumns.filter(d => d.type === 'exact')) {
      const groups = new Map();
      for (const c of this.allDb) {
        const v = this.getValue(c, def);
        if (v == null) continue;
        const k = (def.canon || canonicalLabel)(v);
        if (!groups.has(k)) groups.set(k, new Map());
        groups.get(k).set(v, (groups.get(k).get(v) || 0) + 1);
      }
      const names = new Map();
      for (const [k, variants] of groups) {
        const best = [...variants.entries()].sort((a, b) => b[1] - a[1])[0][0];
        names.set(k, def.format ? def.format(best) : best);
      }
      this.displayNames[def.key] = names;
    }

    this.isDaily = true;
    this.answer = null;
    this.guesses = [];
    this.finished = false;
    this.maxAttempts = maxAttempts;
  }

  /** Cantidad de ramos de Plan Común disponibles */
  /** Cantidad de ramos de Plan Común disponibles */
  getPlanComunCount() {
    return this.allDb.filter(isPlanComun).length;
  }

  /** Devuelve los departamentos disponibles con al menos MIN_DEPT_COURSES ramos */
  getAvailableDepartments(minCourses = MIN_DEPT_COURSES) {
    const counts = new Map();
    const rawNames = new Map();

    for (const c of this.allDb) {
      if (!c.departamento) continue;
      const key = departmentKey(c.departamento);
      counts.set(key, (counts.get(key) || 0) + 1);
      if (!rawNames.has(key)) rawNames.set(key, c.departamento);
    }

    const list = [];
    for (const [key, count] of counts.entries()) {
      // Oculta departamentos con menos de X ramos (y evita duplicar Plan Común si viene como depto)
      if (count >= minCourses && key !== 'PLAN_COMUN') {
        list.push({
          key,
          label: departmentLabel(rawNames.get(key)),
          fullName: rawNames.get(key),
          count
        });
      }
    }
    return list.sort((a, b) => a.label.localeCompare(b.label));
  }

  /** Cambia el filtro activo ('ALL', 'PLAN_COMUN', o sigla de departamento) */
  setDepartment(deptKey = 'ALL') {
    if (!deptKey || deptKey === 'ALL') {
      this.department = 'ALL';
      this.db = this.allDb;
      return;
    }

    if (deptKey === 'PLAN_COMUN') {
      const filtered = this.allDb.filter(isPlanComun);
      if (filtered.length >= MIN_DEPT_COURSES) {
        this.department = 'PLAN_COMUN';
        this.db = filtered;
        return;
      }
    }

    const filtered = this.allDb.filter(
      c => c.departamento && departmentKey(c.departamento) === deptKey
    );
    if (filtered.length >= MIN_DEPT_COURSES) {
      this.department = deptKey;
      this.db = filtered;
    } else {
      this.department = 'ALL';
      this.db = this.allDb;
    }
  }

  getValue(course, def) {
    if (def.allowEmpty) {
      const v = course[def.key];
      return Array.isArray(v) ? v : null;
    }
    return this.extractValue(course, def.key);
  }

  extractValue(course, key) {
    const val = course[key];
    if (val == null || val === '' || (Array.isArray(val) && val.length === 0)) {
      return null;
    }
    return val;
  }

  // Ganó si el ramo buscado está entre sus intentos
  get won() {
    return Boolean(this.answer && this.guesses.some(g => g.codigo === this.answer.codigo));
  }

  getStoreKey() {
    const deptSuffix = this.department === 'ALL' ? '' : `:${this.department}`;
    return `beauchefdle:${getTodayKey()}${deptSuffix}`;
  }

  pickAnswer() {
    const fullCourses = this.db.filter(c => 
      this.activeColumns.every(col => this.getValue(c, col) != null)
    );
    const pool = (fullCourses.length >= 20 ? fullCourses : this.db)
      .slice()
      .sort((a, b) => a.codigo.localeCompare(b.codigo));

    if (this.isDaily) {
      const seed = `beauchefdle-cl-${getTodayKey()}-${this.department}`;
      const index = fnv1aHash(seed) % pool.length;
      return pool[index];
    }
    return pool[Math.floor(Math.random() * pool.length)];
  }

  startNewGame(daily = true) {
    this.isDaily = daily;
    this.answer = this.pickAnswer();
    this.guesses = [];
    this.finished = false;

    if (this.isDaily) {
      this.loadDailyProgress();
    }
  }

  loadDailyProgress() {
    try {
      const saved = JSON.parse(localStorage.getItem(this.getStoreKey()) || 'null');
      // (!saved.gaveUp: descarta partidas guardadas con la antigua opción de rendirse)
      if (saved && !saved.gaveUp && saved.answer === this.answer.codigo && Array.isArray(saved.guesses)) {
        this.guesses = saved.guesses
          .map(code => this.db.find(c => c.codigo === code))
          .filter(Boolean)
          .slice(0, this.maxAttempts);

        if (this.guesses.length >= this.maxAttempts ||
            this.guesses.some(c => c.codigo === this.answer.codigo)) {
          this.finished = true;
        }
      }
    } catch (e) {
      console.warn('Error al leer localStorage:', e);
    }
  }

  saveDailyProgress() {
    if (!this.isDaily) return;
    try {
      localStorage.setItem(this.getStoreKey(), JSON.stringify({
        answer: this.answer.codigo,
        guesses: this.guesses.map(g => g.codigo)
      }));
    } catch (e) {
      console.warn('Error al guardar localStorage:', e);
    }
  }

  compareAttribute(guess, answer, colDef) {
    const gv = this.getValue(guess, colDef);
    const av = this.getValue(answer, colDef);

    if (gv == null || av == null) {
      return { status: 'unk', text: '—', arrow: null };
    }

    if (colDef.type === 'exact') {
      const canon = colDef.canon || canonicalLabel;
      const gk = canon(gv);
      return {
        status: gk === canon(av) ? 'ok' : 'bad',
        text: this.displayNames[colDef.key]?.get(gk) ?? (colDef.format ? colDef.format(gv) : gv),
        title: String(gv),   // nombre completo al pasar el mouse (ej. la sigla DCC)
        arrow: null
      };
    }

    if (colDef.type === 'num') {
      const gNum = Number(gv);
      const aNum = Number(av);
      if (Number.isNaN(gNum) || Number.isNaN(aNum)) {
        const isMatch = String(gv) === String(av);
        return { status: isMatch ? 'ok' : 'bad', text: String(gv), arrow: null };
      }
      const isMatch = gNum === aNum;
      return {
        status: isMatch ? 'ok' : 'bad',
        text: String(gv),
        arrow: isMatch ? null : (aNum > gNum ? '↑' : '↓')
      };
    }

    if (colDef.type === 'set') {
      const gs = new Set((Array.isArray(gv) ? gv : [gv]).map(canonicalLabel));
      const as = new Set((Array.isArray(av) ? av : [av]).map(canonicalLabel));
      const intersection = [...gs].filter(x => as.has(x)).length;

      let status = 'bad';
      if (intersection === gs.size && intersection === as.size) {
        status = 'ok';
      } else if (intersection > 0) {
        status = 'part';
      }

      return {
        status,
        text: Array.isArray(gv) ? (gv.length ? gv.join(', ') : 'Ninguno') : String(gv),
        arrow: null
      };
    }

    return { status: 'unk', text: String(gv), arrow: null };
  }

  makeGuess(course) {
    if (this.finished || !course || this.guesses.some(g => g.codigo === course.codigo)) {
      return null;
    }

    this.guesses.push(course);

    const won = course.codigo === this.answer.codigo;
    if (won || this.guesses.length >= this.maxAttempts) {
      this.finished = true;
    }

    this.saveDailyProgress();
    return { won, course };
  }

  generateShareText() {
    const emojis = { ok: '🟩', part: '🟨', bad: '🟥', unk: '⬜' };
    const grid = this.guesses.map(g => 
      this.activeColumns.map(col => emojis[this.compareAttribute(g, this.answer, col).status]).join('')
    ).join('\n');

    const labelMap = { ALL: '', PLAN_COMUN: ' [Plan Común]' };
    const deptTag = labelMap[this.department] ?? ` [${this.department}]`;
    const title = this.isDaily ? `Beauchefdle${deptTag} ${getTodayKey()}` : `Beauchefdle${deptTag} (práctica)`;
    const score = `${this.won ? this.guesses.length : 'X'}/${this.maxAttempts}`;
    return `${title} — ${score}\n${grid}`;
  }
}