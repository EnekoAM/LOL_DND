/** Recursos de campeón y habilidad (maná, energía, sin recurso…). */

export const RESOURCE_IDS = [
  'mana',
  'energia',
  'vida',
  'furia',
  'calor',
  'ferocidad',
  'coraje',
  'sangre',
  'escudo',
  'concentracion',
  'ninguno',
  'otro',
] as const;

export type ResourceId = (typeof RESOURCE_IDS)[number];

export const RESOURCE_LABELS: Record<ResourceId, string> = {
  mana: 'Maná',
  energia: 'Energía',
  vida: 'Vida',
  furia: 'Furia',
  calor: 'Calor',
  ferocidad: 'Ferocidad',
  coraje: 'Coraje',
  sangre: 'Sangre',
  escudo: 'Escudo',
  concentracion: 'Concentración',
  ninguno: 'Sin recurso',
  otro: 'Otro',
};

export function isResourceId(value: unknown): value is ResourceId {
  return typeof value === 'string' && (RESOURCE_IDS as readonly string[]).includes(value);
}

export function resourceLabel(id: ResourceId): string {
  return RESOURCE_LABELS[id];
}

/** Si la habilidad no tiene recurso, usa el del campeón. */
export function resolveAbilityResource(
  ability?: { resource?: ResourceId },
  champion?: { resource?: ResourceId },
): { id: ResourceId; inherited: boolean } | undefined {
  if (ability?.resource) return { id: ability.resource, inherited: false };
  if (champion?.resource) return { id: champion.resource, inherited: true };
  return undefined;
}

/** Barra de recurso de un campeón (ficha y combate). */
export type ResourceBar = {
  id: ResourceId;
  label: string;
  /** Máximo de la barra. */
  max: number;
  /** Valor con el que empieza en combate. */
  start: 'full' | 'empty';
  /** Clase CSS del relleno. */
  fillClass: string;
};

/**
 * Máximos de los recursos que no salen de la tabla de rol.
 * PROVISIONAL: energía 200 (como en LoL), el resto 100 (Ferocidad 4). Ajustar aquí.
 */
export const RESOURCE_DEFAULTS: Partial<Record<ResourceId, { max: number; start: 'full' | 'empty' }>> = {
  energia: { max: 200, start: 'full' },
  furia: { max: 100, start: 'empty' },
  ferocidad: { max: 4, start: 'empty' },
  calor: { max: 100, start: 'empty' },
  coraje: { max: 100, start: 'empty' },
  escudo: { max: 100, start: 'empty' },
  sangre: { max: 100, start: 'empty' },
  concentracion: { max: 100, start: 'empty' },
  otro: { max: 100, start: 'empty' },
};

/**
 * Barra a mostrar según el Recurso del campeón. Maná (o sin definir) usa el maná de la tabla de rol;
 * Vida y Sin recurso no tienen barra propia.
 */
export function championResourceBar(resource: ResourceId | undefined, roleMana: number): ResourceBar | null {
  if (resource === 'vida' || resource === 'ninguno') return null;
  if (!resource || resource === 'mana') {
    return { id: 'mana', label: RESOURCE_LABELS.mana, max: Math.max(0, roleMana), start: 'full', fillClass: 'sheet-resource__fill--mana' };
  }
  const defaults = RESOURCE_DEFAULTS[resource] ?? { max: 100, start: 'empty' as const };
  return {
    id: resource,
    label: RESOURCE_LABELS[resource],
    max: defaults.max,
    start: defaults.start,
    fillClass: `sheet-resource__fill--${resource}`,
  };
}
