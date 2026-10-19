// js/leaderboard.js
import { getTodayKey, normalize } from './utils.js';

const SUPABASE_URL = 'https://fqwemkqmvdlfsodewvxn.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_RqL1tpjiJlj69oDPuemNNQ_5nvJEOVI';

const SESSION_KEY = 'beauchefdle:auth_session';

/**
 * Calcula los puntos obtenidos en una partida:
 * - Si adivina se dan 5 puntos base + bono según el intento:
 *   1 -> 30 pts | 2 -> 20 pts | 3 -> 15 pts | 4 -> 10 pts | 5 -> 8 pts | 6 -> 6 pts
 * - Si no adivina: 0 puntos.
 */
export function calculatePoints(intentos, gano) {
  if (!gano) return 0;
  const bonusByAttempt = { 1: 25, 2: 15, 3: 10, 4: 5, 5: 3, 6: 1 };
  return (bonusByAttempt[Number(intentos)] || 0);
}

// Convierte un nombre de usuario único en un email sintético interno para Supabase Auth
function usernameToInternalEmail(username) {
  const clean = normalize(username).replace(/[^a-z0-9._-]/g, '');
  return `${clean}@user.beauchefdle.cl`;
}

export function validateUsername(username) {
  const trimmed = String(username || '').trim();
  if (trimmed.length < 2 || trimmed.length > 20) {
    throw new Error('El usuario debe tener entre 2 y 20 caracteres.');
  }
  if (!/^[A-Za-z0-9_.-]+$/.test(trimmed)) {
    throw new Error('Usa solo letras (sin tildes ni espacios), números, guion o punto.');
  }
  return trimmed;
}

function saveSession(sessionData, apodo) {
  const payload = {
    access_token: sessionData.access_token,
    refresh_token: sessionData.refresh_token,
    expires_at: sessionData.expires_at || (Math.floor(Date.now() / 1000) + (sessionData.expires_in || 3600)),
    user: sessionData.user,
    apodo: apodo || sessionData.user?.user_metadata?.apodo || ''
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(payload));
  return payload;
}

export function getStoredSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
  } catch {
    return null;
  }
}

export function getCurrentUser() {
  const s = getStoredSession();
  if (!s || !s.user) return null;
  return {
    id: s.user.id,
    apodo: s.apodo || s.user?.user_metadata?.apodo || 'Usuario'
  };
}

/**
 * Mantiene la sesión activa incluso si el usuario cierra el navegador y vuelve días después.
 */
export async function ensureActiveSession() {
  const s = getStoredSession();
  if (!s || !s.refresh_token) return null;

  const nowSec = Math.floor(Date.now() / 1000);
  if (s.expires_at && s.expires_at - nowSec > 120) {
    return s;
  }

  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ refresh_token: s.refresh_token })
    });
    if (!res.ok) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    const data = await res.json();
    return saveSession(data, s.apodo);
  } catch {
    return s;
  }
}

/**
 * Registra un nuevo usuario único con contraseña.
 */
export async function registerUser(username, password) {
  const apodo = validateUsername(username);
  if (!password || String(password).length < 6) {
    throw new Error('La contraseña debe tener al menos 6 caracteres.');
  }

  // 1) Verificar primero si el apodo ya existe en profiles
  const checkUrl = new URL(`${SUPABASE_URL}/rest/v1/profiles`);
  checkUrl.searchParams.set('select', 'apodo');
  checkUrl.searchParams.set('apodo', `ilike.${apodo}`);
  const checkRes = await fetch(checkUrl.toString(), {
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
    }
  });
  if (checkRes.ok) {
    const existing = await checkRes.json();
    if (Array.isArray(existing) && existing.length > 0) {
      throw new Error('Ese nombre de usuario ya está ocupado.');
    }
  }

  // 2) Crear cuenta en Supabase Auth
  const email = usernameToInternalEmail(apodo);
  const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      email,
      password: String(password),
      data: { apodo }
    })
  });

  const data = await res.json();
  if (!res.ok) {
    const msg = data?.msg || data?.error_description || data?.message || '';
    if (msg.toLowerCase().includes('already registered') || msg.toLowerCase().includes('ocupado')) {
      throw new Error('Ese nombre de usuario ya está ocupado.');
    }
    throw new Error(msg || 'No se pudo crear el usuario.');
  }

  // Si Supabase devuelve sesión inmediata (Confirm Email desactivado)
  if (data.access_token) {
    saveSession(data, apodo);
    return getCurrentUser();
  }

  // Si por configuración requiere login tras signup
  return await loginUser(apodo, password);
}

/**
 * Inicia sesión con nombre de usuario y contraseña.
 */
export async function loginUser(username, password) {
  const apodoInput = validateUsername(username);
  if (!password) throw new Error('Ingresa tu contraseña.');

  const email = usernameToInternalEmail(apodoInput);
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ email, password: String(password) })
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error('Usuario o contraseña incorrectos.');
  }

  // Obtener el apodo exacto desde profiles
  let realApodo = data.user?.user_metadata?.apodo || apodoInput;
  try {
    const profUrl = new URL(`${SUPABASE_URL}/rest/v1/profiles`);
    profUrl.searchParams.set('id', `eq.${data.user.id}`);
    profUrl.searchParams.set('select', 'apodo');
    const profRes = await fetch(profUrl.toString(), {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${data.access_token}`
      }
    });
    if (profRes.ok) {
      const rows = await profRes.json();
      if (rows[0]?.apodo) realApodo = rows[0].apodo;
    }
  } catch {
    // Usa el de metadata
  }

  saveSession(data, realApodo);
  return getCurrentUser();
}

export async function logoutUser() {
  const s = getStoredSession();
  localStorage.removeItem(SESSION_KEY);
  if (s?.access_token) {
    try {
      await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${s.access_token}`
        }
      });
    } catch {
      // Ignorar error de red al cerrar sesión
    }
  }
}

/**
 * Guarda el puntaje del día del usuario autenticado llamando a submit_score.
 */
export async function submitDailyScore({ intentos, gano }) {
  const session = await ensureActiveSession();
  if (!session || !session.access_token) {
    throw new Error('Debes iniciar sesión para guardar tu puntaje.');
  }

  const today = getTodayKey();
  const submittedKey = `beauchefdle:submitted:${today}:${session.user.id}`;
  if (localStorage.getItem(submittedKey)) {
    return calculatePoints(intentos, gano);
  }

  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/submit_score`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      p_intentos: Number(intentos),
      p_gano: Boolean(gano)
    })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'No se pudo guardar el puntaje.');
  }

  localStorage.setItem(submittedKey, '1');
  return calculatePoints(intentos, gano);
}

export function hasSubmittedToday() {
  const user = getCurrentUser();
  if (!user) return false;
  return Boolean(localStorage.getItem(`beauchefdle:submitted:${getTodayKey()}:${user.id}`));
}

/**
 * Obtiene el Top 20 del día actual ordenado por puntos.
 */
export async function fetchDailyLeaderboard() {
  const today = getTodayKey();
  const url = new URL(`${SUPABASE_URL}/rest/v1/ranking_diario`);
  url.searchParams.set('fecha', `eq.${today}`);
  url.searchParams.set('select', 'apodo,intentos,gano,puntos,creado_en');
  url.searchParams.set('order', 'puntos.desc,gano.desc,intentos.asc,creado_en.asc');
  url.searchParams.set('limit', '20');

  const res = await fetch(url.toString(), {
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
    }
  });
  if (!res.ok) throw new Error('Error al cargar el ranking del día');
  return await res.json();
}

/**
 * Obtiene el Top 20 acumulado histórico de usuarios registrados.
 */
export async function fetchGeneralLeaderboard() {
  const url = new URL(`${SUPABASE_URL}/rest/v1/ranking_general`);
  url.searchParams.set('select', 'apodo,puntos_totales,jugados,ganados');
  url.searchParams.set('order', 'puntos_totales.desc,ganados.desc');
  url.searchParams.set('limit', '20');

  const res = await fetch(url.toString(), {
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
    }
  });
  if (!res.ok) throw new Error('Error al cargar el ranking general');
  return await res.json();
}