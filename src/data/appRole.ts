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

/** User ve todas las pantallas; admin también. */
export function screenAllowed(_role: AppRole, _screenId: string): boolean {
  return true;
}

/** Solo admin puede mutar datos fuera de las fichas de personaje. */
export function roleCanEdit(role: AppRole): boolean {
  return role === 'admin';
}
