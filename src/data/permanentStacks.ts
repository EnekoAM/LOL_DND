/**
 * «Cargas permanentes» de los efectos con nombre (Yun Tal, Corazón de acero, Sello oscuro, Mejai…):
 * el CONTADOR va en la ficha del personaje (players.stacks, clave effect:<id del efecto o variante>, p. ej.
 * effect:glory:dark-seal y effect:glory:mejai van aparte), no en el combate:
 * sigue entre combates y aunque se quite el ítem. El bonus de stat (valor de la regla × cargas, hasta su máx.)
 * solo suma mientras lleve equipado un ítem con ese efecto.
 */
import type { EffectRule } from './effectBonus';
import { statLabel } from './effectBonus';
import type { Item } from './items';
import { namedEffectBonus, type NamedEffectData } from './namedEffectDescriptions';
import { baseNamedEffectId, namedEffectName } from './namedEffects';
import { PLAYERS, PLAYERS_HYDRATED_EVENT, type PlayerListPatch } from './players';
import { readStack } from './stacks';

export const EFFECT_STACK_PREFIX = 'effect:';
/** Clave del contador: id del efecto tal cual (variante incluida: cada variante lleva su contador). */
export const effectStackKey = (id: string): string => `${EFFECT_STACK_PREFIX}${id}`;

const STAT_KINDS = new Set(['stat', 'attack-speed', 'move-speed']);
/** ¿Regla de cargas permanentes? (bonus de stat al portador con la casilla marcada). */
export const isPermanentStackRule = (rule: EffectRule): boolean =>
  rule.permanent === true && STAT_KINDS.has(rule.kind) && (rule.appliesTo === undefined || rule.appliesTo === 'self');

export type PermanentStackEntry = {
  base: string;
  key: string;
  name: string;
  value: number;
  max?: number;
  /** Lleva equipado un ítem con el efecto (si no, el contador se guarda pero no suma). */
  equipped: boolean;
  /** Ítem equipado que lo da (el primero). */
  item?: string;
  /** «+0,2 Prob. crítico por carga». */
  perStack: string;
};

/** Máx. de cargas de un efecto: el mayor maxStacks de sus reglas permanentes. */
const maxOf = (rules: EffectRule[]): number | undefined => {
  const values = rules.map(rule => rule.maxStacks).filter((n): n is number => typeof n === 'number' && n > 0);
  return values.length ? Math.max(...values) : undefined;
};

const perStackText = (rules: EffectRule[]): string => rules.map(rule => {
  const stat = rule.kind === 'attack-speed' ? '% vel. ataque' : rule.kind === 'move-speed' ? 'velocidad' : statLabel(rule.stat);
  const amount = typeof rule.flat === 'number' ? String(rule.flat).replace('.', ',') : 'fórmula';
  return `+${amount} ${stat}`;
}).join(' · ') + ' por carga';

/**
 * Contadores a enseñar: los efectos con cargas permanentes de los ítems equipados y, aparte, los que tienen
 * cargas guardadas aunque ya no lleve el ítem.
 */
export function permanentStackEntries(items: Item[], data: NamedEffectData, stacks: Record<string, number> | undefined): PermanentStackEntry[] {
  const out = new Map<string, PermanentStackEntry>();
  const equippedBy = new Map<string, string>();
  for (const item of items) {
    for (const id of item.namedEffects ?? []) {
      if (!equippedBy.has(id)) equippedBy.set(id, item.nombre);
      if (out.has(id)) continue;
      const rules = (namedEffectBonus(data, id)?.rules ?? []).filter(isPermanentStackRule);
      if (!rules.length) continue;
      const key = effectStackKey(id);
      out.set(id, { base: baseNamedEffectId(id), key, name: namedEffectName(id), value: readStack(stacks, key), max: maxOf(rules), equipped: true, item: item.nombre, perStack: perStackText(rules) });
    }
  }
  // Cargas guardadas sin regla todavía (migradas) o sin el ítem: se enseñan igual; sin regla no suman.
  for (const [key, value] of Object.entries(stacks ?? {})) {
    if (!key.startsWith(EFFECT_STACK_PREFIX) || !(value > 0)) continue;
    const id = key.slice(EFFECT_STACK_PREFIX.length);
    if (out.has(id)) continue;
    const rules = (namedEffectBonus(data, id)?.rules ?? []).filter(isPermanentStackRule);
    const item = equippedBy.get(id);
    out.set(id, { base: baseNamedEffectId(id), key, name: namedEffectName(id), value: readStack(stacks, key), max: maxOf(rules), equipped: !!item && rules.length > 0, ...(item ? { item } : {}), perStack: rules.length ? perStackText(rules) : 'sin regla de cargas todavía: no suma' });
  }
  return [...out.values()];
}

/** ¿El ítem tiene algún efecto con cargas permanentes? (su contador de stacks del ítem sobra). */
export function itemHasPermanentStacks(item: Item | undefined, data: NamedEffectData): boolean {
  return !!item && (item.namedEffects ?? []).some(id => (namedEffectBonus(data, id)?.rules ?? []).some(isPermanentStackRule));
}

/** Últimos valores escritos (hasta que vuelva la lista de players), para no leer un contador viejo entre dos AA seguidos. */
const written = new Map<string, number>();
if (typeof window !== 'undefined') window.addEventListener(PLAYERS_HYDRATED_EVENT, () => written.clear());

/**
 * Callback onPermanentStack de un participante: +1 carga en su ficha (players.stacks, merge por clave) con Deshacer.
 * Solo players (campeones / NPCs no tienen ficha propia: null → van al combate).
 */
export function permanentStackSaver(
  participant: { kind: string; sourceId?: string },
  patch: (playerName: string, patch: PlayerListPatch) => Promise<void>,
): ((base: string, max: number | undefined) => Promise<{ before: number; after: number; undo: () => Promise<void> } | null>) | undefined {
  if (participant.kind !== 'player' || !participant.sourceId) return undefined;
  const playerName = participant.sourceId;
  return async (base, max) => {
    const player = PLAYERS.find(p => p.name === playerName);
    if (!player) return null;
    const key = effectStackKey(base);
    const memo = `${playerName}|${key}`;
    const before = written.get(memo) ?? readStack(player.stacks, key);
    const after = typeof max === 'number' && max > 0 ? Math.min(max, before + 1) : before + 1;
    if (after !== before) {
      await patch(playerName, { stacks: { [key]: after } });
      written.set(memo, after);
    }
    return {
      before,
      after,
      undo: async () => {
        if (after === before) return;
        await patch(playerName, { stacks: { [key]: before } });
        written.set(memo, before);
      },
    };
  };
}
