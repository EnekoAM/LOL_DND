/** Rol de la app en este navegador (sin login). Persiste en localStorage. */

export type AppRole = 'admin' | 'user';

const KEY = 'lol-dnd:app-role';

export function readAppRole(): AppRole | null {
  const raw = localStorage.getItem(KEY);
  if (raw === 'admin' || raw === 'user') return raw;
  return null;
}

export function saveAppRole(role: AppRole): void {
  localStorage.setItem(KEY, role);
}

export function clearAppRole(): void {
  localStorage.removeItem(KEY);
}

/**
 * Con quién entra un User: uno de los players (por nombre) o «Invitado».
 * Igual que el rol: solo en este navegador, sin login real.
 */
export type AppIdentity = { kind: 'player'; name: string } | { kind: 'guest' };

const IDENTITY_KEY = 'lol-dnd:app-player';
const GUEST_VALUE = '__invitado__';

export function readAppIdentity(): AppIdentity | null {
  let raw: string | null = null;
  try { raw = localStorage.getItem(IDENTITY_KEY); } catch { return null; }
  const value = raw?.trim();
  if (!value) return null;
  return value === GUEST_VALUE ? { kind: 'guest' } : { kind: 'player', name: value };
}

export function saveAppIdentity(identity: AppIdentity): void {
  try { localStorage.setItem(IDENTITY_KEY, identity.kind === 'guest' ? GUEST_VALUE : identity.name); } catch { /* ignore */ }
}

export function clearAppIdentity(): void {
  try { localStorage.removeItem(IDENTITY_KEY); } catch { /* ignore */ }
}

/** Texto corto para la cabecera / menú. */
export const identityLabel = (identity: AppIdentity | null): string | null =>
  !identity ? null : identity.kind === 'guest' ? 'Invitado' : identity.name;

/** User ve todas las pantallas; admin también. */
export function screenAllowed(_role: AppRole, _screenId: string): boolean {
  return true;
}

/** Solo admin puede mutar datos fuera de fichas y de la tienda (compra/venta/crafteo). */
export function roleCanEdit(role: AppRole): boolean {
  return role === 'admin';
}

/**
 * PIN para elegir el rol admin. OJO: NO es seguridad real; vive en el bundle del
 * frontend y cualquiera con DevTools lo puede ver. Solo frena a visitantes casuales.
 * Se configura con VITE_ADMIN_PIN (4 dígitos) en .env / Vercel; por defecto 1234.
 */
const DEFAULT_ADMIN_PIN = '1234';

function resolveAdminPin(): string {
  const raw = String(import.meta.env.VITE_ADMIN_PIN ?? '').trim();
  return /^\d{4}$/.test(raw) ? raw : DEFAULT_ADMIN_PIN;
}

export const ADMIN_PIN_LENGTH = 4;

export function checkAdminPin(pin: string): boolean {
  return pin.trim() === resolveAdminPin();
}