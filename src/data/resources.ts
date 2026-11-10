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
