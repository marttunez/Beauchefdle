// js/leaderboard.js
import { getTodayKey } from './utils.js';

// Solo la URL base del proyecto, SIN "/rest/v1/" (las funciones de abajo ya lo agregan).
const SUPABASE_URL = 'https://fqwemkqmvdlfsodewvxn.supabase.co';
// Clave PÚBLICA (publishable/anon): está pensada para ir en el navegador y es seguro subirla a GitHub,
// siempre que la tabla tenga Row Level Security activado (ver supabase/01_fase1_ranking_seguro.sql).
// NUNCA pongas aquí una clave "service_role" o "sb_secret_...".
const SUPABASE_ANON_KEY = 'sb_publishable_RqL1tpjiJlj69oDPuemNNQ_5nvJEOVI';

const HEADERS = {
  'apikey': SUPABASE_ANON_KEY,
  'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
  'Content-Type': 'application/json'
};

/**
 * Obtiene el Top 20 del día actual en horario chileno.
 */
export async function fetchDailyLeaderboard() {
  const today = getTodayKey();
  const url = new URL(`${SUPABASE_URL}/rest/v1/leaderboard`);
  url.searchParams.set('fecha', `eq.${today}`);
  url.searchParams.set('select', 'apodo,intentos,gano,creado_en');
  url.searchParams.set('order', 'gano.desc,intentos.asc,creado_en.asc');
  url.searchParams.set('limit', '20');

  const res = await fetch(url.toString(), { headers: HEADERS });
  if (!res.ok) throw new Error('Error al cargar el leaderboard');
  return await res.json();
}

/**
 * Guarda el resultado del jugador para el día actual.
 */
export async function submitDailyScore({ apodo, intentos, gano }) {
  const cleanName = String(apodo || '').replace(/[<>]/g, '').trim().slice(0, 20);
  if (cleanName.length < 2) {
    throw new Error('El apodo debe tener al menos 2 caracteres.');
  }

  const today = getTodayKey();
  const submittedKey = `beauchlde:submitted:${today}`;
  if (localStorage.getItem(submittedKey)) {
    throw new Error('Ya guardaste tu puntaje hoy.');
  }

  const res = await fetch(`${SUPABASE_URL}/rest/v1/leaderboard`, {
    method: 'POST',
    headers: { ...HEADERS, 'Prefer': 'return=minimal' },
    body: JSON.stringify({
      fecha: today,
      apodo: cleanName,
      intentos: Number(intentos),
      gano: Boolean(gano)
    })
  });

  if (!res.ok) throw new Error('No se pudo guardar el puntaje.');
  localStorage.setItem(submittedKey, '1');
}

export function hasSubmittedToday() {
  return Boolean(localStorage.getItem(`beauchlde:submitted:${getTodayKey()}`));
}