/**
 * Normaliza strings para comparaciones insensibles a mayúsculas y acentos.
 */
export function normalize(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/**
 * Escapa HTML para prevenir inyecciones.
 */
export function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));
}

/**
 * Devuelve la fecha actual en formato YYYY-MM-DD (hora local).
 */
export function getTodayKey() {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(new Date()); // 'en-CA' formatea nativamente como YYYY-MM-DD
}

/**
 * Hash simple (FNV-1a) para fijar el ramo del día consistentemente.
 */
export function fnv1aHash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Forma canónica para comparar textos: ignora mayúsculas, tildes, puntuación,
 * espacios repetidos y el prefijo "Departamento de".
 */
export function canonicalLabel(text) {
  return normalize(text)
    .replace(/^departamento (de |del )/, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}