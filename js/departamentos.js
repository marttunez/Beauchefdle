import { canonicalLabel } from './utils.js';

/**
 * Siglas de los departamentos. La clave es el nombre tal como lo deja canonicalLabel
 * (sin tildes, mayúsculas, puntuación ni "Departamento de"). Para agregar uno nuevo,
 * añade una línea: 'nombre en minúsculas y sin tildes': 'SIGLA'.
 * Un departamento que no esté acá se muestra con su nombre completo.
 */
const SIGLAS = {
  'ciencias de la computacion': 'DCC',
  'ingenieria en computacion': 'DCC',   // variante que aparece en algunos programas (ej. CC5303)
  'ingenieria matematica': 'DIM',
  'ingenieria industrial': 'DII',
  'ingenieria electrica': 'DIE',
  'ingenieria mecanica': 'DIMEC',
  'ingenieria civil': 'DIC',
  'ingenieria de minas': 'DIMIN',
  'ingenieria quimica biotecnologia y materiales': 'DIQBM',
  'fisica': 'DFI',
  'geofisica': 'DGF',
  'astronomia': 'DAS'
};

/** Clave para comparar departamentos: la sigla si existe, si no el nombre canónico. */
export function departmentKey(name) {
  const key = canonicalLabel(name);
  return SIGLAS[key] ?? key;
}

/** Texto a mostrar: la sigla si existe, si no el nombre original. */
export function departmentLabel(name) {
  return SIGLAS[canonicalLabel(name)] ?? name;
}