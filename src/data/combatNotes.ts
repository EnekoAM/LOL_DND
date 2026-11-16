import { readAppIdentity, readAppRole } from './appRole';

/** Notas públicas del combate: las lee y escribe toda la party (se guardan aparte del combate). */
export type CombatNote = { id: string; text: string; author: string; createdAt: string };

export const COMBAT_NOTE_MAX = 1000;

const OFFLINE = 'No se pudo contactar con la API. Arranca npm run dev:api';

function headers(json = false): Record<string, string> {
  const out: Record<string, string> = { 'X-App-Role': readAppRole() ?? 'user' };
  if (json) out['Content-Type'] = 'application/json';
  const identity = readAppIdentity();
  if (identity?.kind === 'player') out['X-App-Player'] = encodeURIComponent(identity.name);
  return out;
}

function readError(body: unknown, fallback: string): string {
  if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') return body.error;
  return fallback;
}

function normalize(body: unknown): CombatNote[] {
  const raw = body && typeof body === 'object' ? (body as { notes?: unknown }).notes : undefined;
  if (!Array.isArray(raw)) return [];
  return raw.filter((note): note is CombatNote => !!note && typeof note === 'object'
    && typeof (note as CombatNote).id === 'string'
    && typeof (note as CombatNote).text === 'string'
    && typeof (note as CombatNote).author === 'string'
    && typeof (note as CombatNote).createdAt === 'string');
}

async function call(path: string, init: RequestInit, fallback: string): Promise<CombatNote[]> {
  let response: Response;
  try {
    response = await fetch(path, init);
  } catch {
    throw new Error(OFFLINE);
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(readError(body, `Error ${response.status} ${fallback}`));
  return normalize(body);
}

export function loadCombatNotes(): Promise<CombatNote[]> {
  return call('/api/combat-notes', { headers: headers() }, 'al cargar las notas');
}

export function addCombatNote(text: string): Promise<CombatNote[]> {
  return call('/api/combat-notes', { method: 'POST', headers: headers(true), body: JSON.stringify({ text }) }, 'al guardar la nota');
}

export function deleteCombatNote(id: string): Promise<CombatNote[]> {
  return call(`/api/combat-notes?id=${encodeURIComponent(id)}`, { method: 'DELETE', headers: headers() }, 'al borrar la nota');
}

export function clearCombatNotes(): Promise<CombatNote[]> {
  return call('/api/combat-notes?all=1', { method: 'DELETE', headers: headers() }, 'al vaciar las notas');
}
