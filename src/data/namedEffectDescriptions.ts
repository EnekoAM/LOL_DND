import { useEffect, useSyncExternalStore } from 'react';
import { readAppRole } from './appRole';
import { baseNamedEffectId } from './namedEffects';
import { normalizeBonusConfig, type EffectBonusConfig } from './effectBonus';
import { useLiveRevision } from './live';
import { normalizeArea, type AreaPattern } from './areaPattern';

/**
 * Datos de los efectos con nombre que escribe el admin (Mongo: namedEffectDescriptions, /api/named-effects):
 * descripción y «Al impactar» (onHit). Clave: id del efecto (`spellblade`) o de la variante (`spellblade:magic`).
 * Una variante sin valor propio hereda el del efecto base (descripción y onHit).
 * Leer: todos. Editar: solo admin. Se vuelve a pedir cuando llega el aviso en vivo «namedEffects».
 */
export const NAMED_EFFECT_DESCRIPTION_MAX = 2000;

const OFFLINE = 'No se pudo contactar con la API. Arranca npm run dev:api';

export type NamedEffectData = {
  descriptions: Record<string, string>;
  /** Solo los ids con valor propio. */
  onHit: Record<string, boolean>;
  /** Configurador de bonus (reglas en combate); solo los ids con config propia. */
  bonus: Record<string, EffectBonusConfig>;
  /** Tablero de área; solo los ids con área propia. */
  area: Record<string, AreaPattern>;
};

let data: NamedEffectData = { descriptions: {}, onHit: {}, bonus: {}, area: {} };
let loadedRevision = -1;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function readError(body: unknown, fallback: string): string {
  if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') return body.error;
  return fallback;
}

async function load(revision: number): Promise<void> {
  if (loading && loadedRevision === revision) return loading;
  loadedRevision = revision;
  loading = (async () => {
    try {
      const response = await fetch('/api/named-effects');
      if (!response.ok) return;
      const body: unknown = await response.json().catch(() => null);
      if (!body || typeof body !== 'object') return;
      const source = body as { descriptions?: unknown; onHit?: unknown; bonus?: unknown; area?: unknown };
      const pick = <T,>(raw: unknown, ok: (value: unknown) => value is T): Record<string, T> =>
        raw && typeof raw === 'object'
          ? Object.fromEntries(Object.entries(raw as Record<string, unknown>).filter((entry): entry is [string, T] => ok(entry[1])))
          : {};
      data = {
        descriptions: pick(source.descriptions, (value): value is string => typeof value === 'string'),
        onHit: pick(source.onHit, (value): value is boolean => typeof value === 'boolean'),
        bonus: Object.fromEntries(
          Object.entries(source.bonus && typeof source.bonus === 'object' ? source.bonus as Record<string, unknown> : {})
            .map(([id, raw]) => [id, normalizeBonusConfig(raw)] as const)
            .filter((entry): entry is readonly [string, EffectBonusConfig] => !!entry[1]),
        ),
        area: Object.fromEntries(
          Object.entries(source.area && typeof source.area === 'object' ? source.area as Record<string, unknown> : {})
            .map(([id, raw]) => [id, normalizeArea(raw)] as const)
            .filter((entry): entry is readonly [string, AreaPattern] => !!entry[1]),
        ),
      };
      emit();
    } catch {
      // Sin API: se quedan las que hubiera.
    }
  })();
  return loading;
}

/** Descripciones y onHit; se cargan la primera vez y al cambiar en otra pestaña. */
export function useNamedEffectDescriptions(): NamedEffectData {
  const revision = useLiveRevision('namedEffects');
  useEffect(() => {
    if (loadedRevision !== revision) void load(revision);
  }, [revision]);
  return useSyncExternalStore(subscribe, () => data);
}

/** Descripción de un id guardado: la de la variante y, si no tiene, la del efecto base. */
export function describeNamedEffect(all: NamedEffectData, id: string): string | undefined {
  return all.descriptions[id] || all.descriptions[baseNamedEffectId(id)] || undefined;
}

/** «Al impactar» de un id guardado: el propio y, si no tiene, el del efecto base (por defecto no). */
export function namedEffectOnHit(all: NamedEffectData, id: string): boolean {
  return all.onHit[id] ?? all.onHit[baseNamedEffectId(id)] ?? false;
}

/** Configurador de bonus de un id: la propia y, si no tiene, la del efecto base. */
export function namedEffectBonus(all: NamedEffectData, id: string): EffectBonusConfig | undefined {
  const own = all.bonus[id];
  const base = id.includes(':') ? all.bonus[baseNamedEffectId(id)] : undefined;
  // Variante con solo opciones (sin reglas propias): reglas / tiempos del base + sus opciones.
  if (own && own.rules.length === 0 && base) {
    return { ...base, ...(own.abilityDischarge ? { abilityDischarge: true } : {}), ...(own.chainTargets ? { chainTargets: own.chainTargets } : {}), ...(own.perTargetCooldown ? { perTargetCooldown: true } : {}) };
  }
  return own ?? base;
}

/** Tablero de área de un id: el propio y, si no tiene, el del efecto base. */
export function namedEffectArea(all: NamedEffectData, id: string): AreaPattern | undefined {
  return all.area[id] ?? (id.includes(':') ? all.area[baseNamedEffectId(id)] : undefined);
}

/**
 * Guarda descripción y/o onHit de un efecto o variante. Solo admin.
 * description '' la borra; onHit null quita el valor propio (la variante vuelve a heredar).
 */
export async function saveNamedEffectData(id: string, patch: { description?: string; onHit?: boolean | null; bonus?: EffectBonusConfig | null; area?: AreaPattern | null }): Promise<void> {
  if (readAppRole() !== 'admin') throw new Error('Solo el admin puede editar los efectos');
  let response: Response;
  try {
    response = await fetch('/api/named-effects', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-App-Role': 'admin' },
      body: JSON.stringify({ id, ...patch }),
    });
  } catch {
    throw new Error(OFFLINE);
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(readError(body, `Error ${response.status} al guardar el efecto`));
  const saved = (body && typeof body === 'object' ? body : {}) as { description?: unknown; onHit?: unknown; bonus?: unknown; area?: unknown };
  const descriptions = { ...data.descriptions };
  const onHit = { ...data.onHit };
  if (typeof saved.description === 'string' && saved.description) descriptions[id] = saved.description;
  else delete descriptions[id];
  if (typeof saved.onHit === 'boolean') onHit[id] = saved.onHit;
  else delete onHit[id];
  const bonus = { ...data.bonus };
  const config = normalizeBonusConfig(saved.bonus);
  if (config) bonus[id] = config;
  else delete bonus[id];
  const area = { ...data.area };
  const pattern = normalizeArea(saved.area);
  if (pattern) area[id] = pattern;
  else delete area[id];
  data = { descriptions, onHit, bonus, area };
  emit();
}

/** Guarda (o borra, con texto vacío) la descripción. Devuelve el texto guardado. */
export async function saveNamedEffectDescription(id: string, description: string): Promise<string> {
  await saveNamedEffectData(id, { description });
  return data.descriptions[id] ?? '';
}
