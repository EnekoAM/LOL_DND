/**
 * Efectos con nombre de los ítems. La lista vive en la BD (Mongo namedEffectsCustom, /api/named-effects):
 * se crean, editan y borran desde la pantalla Efectos. Aquí solo quedan los tipos y las ayudas.
 * Hasta que llega la primera respuesta de la API la lista está vacía (los ids se muestran tal cual).
 * Las mecánicas del código van por id: si un id no está en la BD, simplemente no aplica.
 */
export type NamedEffectKind = 'active' | 'passive';

export const NAMED_EFFECT_KIND_LABEL: Record<NamedEffectKind, string> = { active: 'Activa', passive: 'Pasiva' };

/** Variante de un efecto compartido que cambia según el ítem (p. ej. Hoja encantada física / mágica). Id guardado: `base:key`. */
export type NamedEffectVariant = {
  key: string;
  /** Nombre completo para mostrar, p. ej. «Hoja encantada (física)». */
  name: string;
  /** Etiqueta corta («física»). */
  short: string;
  description: string;
  wikiItems: string[];
};

export type NamedEffect = {
  id: string;
  /** Nombre para mostrar (español si hay uno razonable). */
  name: string;
  /** Nombre en la wiki (inglés). */
  en: string;
  exclusive: boolean;
  shared: boolean;
  /** Activa (se usa) o pasiva. La wiki no las etiqueta: clasificación según el ítem en el juego. */
  kind: NamedEffectKind;
  /** Solo si los ítems que lo dan difieren de verdad (tipo de daño, stat…). La exclusividad sigue siendo del efecto base. */
  variants?: NamedEffectVariant[];
  /** Con variantes, el efecto base también se puede elegir en los ítems (p. ej. Inmolación normal + MR / AC). */
  baseSelectable?: boolean;
  description?: string;
  /** Ítems que lo tienen según la wiki (nombres en inglés, solo informativo). */
  wikiItems?: string[];
};

/** Lista cargada de la API (BD). Vacía hasta la primera respuesta. */
export const ALL_NAMED_EFFECTS: NamedEffect[] = [];
/** Efectos elegibles en los ítems y filtros (los mismos que ALL_NAMED_EFFECTS). */
export const NAMED_EFFECTS: NamedEffect[] = [];
const byId = new Map<string, NamedEffect>();

/** Sustituye la lista por la que devuelve /api/named-effects. */
export function applyNamedEffects(effects: NamedEffect[]): void {
  ALL_NAMED_EFFECTS.splice(0, ALL_NAMED_EFFECTS.length, ...effects);
  NAMED_EFFECTS.splice(0, NAMED_EFFECTS.length, ...effects);
  byId.clear();
  for (const effect of effects) byId.set(effect.id, effect);
}

const stringList = (raw: unknown): string[] => Array.isArray(raw) ? raw.filter((entry): entry is string => typeof entry === 'string') : [];

/** Valida la lista que llega de la API (lo que no encaja se descarta). */
export function parseNamedEffects(raw: unknown): NamedEffect[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry): NamedEffect[] => {
    if (!entry || typeof entry !== 'object') return [];
    const value = entry as Record<string, unknown>;
    if (typeof value.id !== 'string' || !value.id || typeof value.name !== 'string' || !value.name) return [];
    const variants = (Array.isArray(value.variants) ? value.variants : []).flatMap((rawVariant): NamedEffectVariant[] => {
      if (!rawVariant || typeof rawVariant !== 'object') return [];
      const variant = rawVariant as Record<string, unknown>;
      if (typeof variant.key !== 'string' || !variant.key || typeof variant.name !== 'string' || !variant.name) return [];
      return [{
        key: variant.key,
        name: variant.name,
        short: typeof variant.short === 'string' && variant.short ? variant.short : variant.name,
        description: typeof variant.description === 'string' ? variant.description : '',
        wikiItems: stringList(variant.wikiItems),
      }];
    });
    const wikiItems = stringList(value.wikiItems);
    return [{
      id: value.id,
      name: value.name,
      en: typeof value.en === 'string' && value.en ? value.en : value.name,
      kind: value.kind === 'active' ? 'active' : 'passive',
      exclusive: value.exclusive === true,
      shared: value.shared === true,
      ...(variants.length ? { variants } : {}),
      ...(value.baseSelectable === true ? { baseSelectable: true } : {}),
      ...(typeof value.description === 'string' && value.description ? { description: value.description } : {}),
      ...(wikiItems.length ? { wikiItems } : {}),
    }];
  });
}

/** Id base de un id guardado (`spellblade:magic` → `spellblade`). */
export const baseNamedEffectId = (id: string): string => id.split(':')[0];

/** Efecto base (también para ids de variante): exclusividad, tipo, etc. */
export const findNamedEffect = (id: string): NamedEffect | undefined => byId.get(baseNamedEffectId(id));

export const findNamedEffectVariant = (id: string): NamedEffectVariant | undefined => {
  const [base, key] = id.split(':');
  return key ? byId.get(base)?.variants?.find(variant => variant.key === key) : undefined;
};

export const namedEffectName = (id: string): string => findNamedEffectVariant(id)?.name ?? findNamedEffect(id)?.name ?? id;

export const namedEffectDescription = (id: string): string | undefined =>
  findNamedEffectVariant(id)?.description ?? findNamedEffect(id)?.description;

/** Ids elegibles de un efecto: sus variantes si las tiene (y el base si baseSelectable), si no el propio efecto. */
export const namedEffectOptions = (effect: NamedEffect): { id: string; name: string }[] =>
  effect.variants?.length
    ? [
        ...(effect.baseSelectable ? [{ id: effect.id, name: effect.name }] : []),
        ...effect.variants.map(variant => ({ id: `${effect.id}:${variant.key}`, name: variant.name })),
      ]
    : [{ id: effect.id, name: effect.name }];

/** ¿El id guardado `id` cumple el filtro `wanted`? Un id base incluye todas sus variantes. */
export const namedEffectMatches = (id: string, wanted: string): boolean =>
  wanted.includes(':') ? id === wanted : baseNamedEffectId(id) === wanted;

export type NamedEffectGroup = { key: string; label: string; effects: NamedEffect[] };

/** Agrupa para selectores: Activas y luego Pasivas; dentro, compartidos (★) antes que los propios de un ítem. */
export const groupNamedEffects = (effects: NamedEffect[]): NamedEffectGroup[] => {
  const byName = (a: NamedEffect, b: NamedEffect) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });
  const groups: NamedEffectGroup[] = [];
  for (const kind of ['active', 'passive'] as const) {
    const title = kind === 'active' ? 'Activas' : 'Pasivas';
    const ofKind = effects.filter(effect => effect.kind === kind);
    const shared = ofKind.filter(effect => effect.shared).sort(byName);
    const own = ofKind.filter(effect => !effect.shared).sort(byName);
    if (shared.length) groups.push({ key: `${kind}-shared`, label: `${title} · compartidos (★ = solo uno por build)`, effects: shared });
    if (own.length) groups.push({ key: `${kind}-own`, label: `${title} · propios de un ítem`, effects: own });
  }
  return groups;
};

