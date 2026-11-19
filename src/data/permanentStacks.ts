/**
 * «Cargas permanentes» de los efectos con nombre (Yun Tal, Corazón de acero, Sello oscuro, Mejai…):
 * el CONTADOR va en la ficha del personaje (players.stacks, clave effect:<id del efecto o variante>, p. ej.
 * effect:glory:dark-seal y effect:glory:mejai van aparte), no en el combate:
 * sigue entre combates y aunque se quite el ítem. El bonus de stat (valor de la regla × cargas, hasta su máx.)
 * solo suma mientras lleve equipado un ítem con ese efecto.
 */
import type { EffectRule } from './effectBonus';
import { ruleLolAdAp, statLabel } from './effectBonus';
import { lolToDice } from './lolDiceTable';
import { withLolStatBonus } from './lolStatBonus';
import { findItem, type Item } from './items';
import { emptyStatLine, isStatLineKey, type StatKey, type StatLine } from '../features/calculos/statLine';
import { namedEffectBonus, type NamedEffectData } from './namedEffectDescriptions';
import { baseNamedEffectId, namedEffectName } from './namedEffects';
import { PLAYERS, PLAYERS_HYDRATED_EVENT, type PlayerListPatch } from './players';
import { readStack, readStackValue } from './stacks';

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

/** Lo que se enseña: con «guarda el valor», el valor acumulado (hacia abajo); si no, el contador. */
const stackValueOf = (rules: EffectRule[], stacks: Record<string, number> | undefined, key: string): number =>
  rules.some(rule => rule.stackValue) ? Math.floor(readStackValue(stacks, key)) : readStack(stacks, key);

const perStackText = (rules: EffectRule[]): string => rules.map(rule => {
  if (rule.stackValue) return `${statLabel(rule.stat) || 'valor'} acumulado (suma lo calculado en cada activaci\u00f3n)`;
  const lol = ruleLolAdAp(rule);
  const stat = rule.kind === 'attack-speed' ? '% vel. ataque' : rule.kind === 'move-speed' ? 'velocidad' : statLabel(rule.stat);
  const amount = lol ? `${String(lol.value).replace('.', ',')} ${lol.stat.toUpperCase()} del LoL` : typeof rule.flat === 'number' ? String(rule.flat).replace('.', ',') : 'fórmula';
  return lol ? `+${amount}` : `+${amount} ${stat}`;
}).join(' · ') + (rules.every(rule => rule.stackValue) ? '' : ' por carga');

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
      out.set(id, { base: baseNamedEffectId(id), key, name: namedEffectName(id), value: stackValueOf(rules, stacks, key), max: maxOf(rules), equipped: true, item: item.nombre, perStack: perStackText(rules) });
    }
  }
  // Cargas guardadas sin regla todavía (migradas) o sin el ítem: se enseñan igual; sin regla no suman.
  for (const [key, value] of Object.entries(stacks ?? {})) {
    if (!key.startsWith(EFFECT_STACK_PREFIX) || !(value > 0)) continue;
    const id = key.slice(EFFECT_STACK_PREFIX.length);
    if (out.has(id)) continue;
    const rules = (namedEffectBonus(data, id)?.rules ?? []).filter(isPermanentStackRule);
    const item = equippedBy.get(id);
    out.set(id, { base: baseNamedEffectId(id), key, name: namedEffectName(id), value: stackValueOf(rules, stacks, key), max: maxOf(rules), equipped: !!item && rules.length > 0, ...(item ? { item } : {}), perStack: rules.length ? perStackText(rules) : 'sin regla de cargas todavía: no suma' });
  }
  return [...out.values()];
}

/** ¿El ítem tiene algún efecto con cargas permanentes? (su contador de stacks del ítem sobra). */
/** Sheet/combat-safe amount of a permanent stat rule: flat value (ratios/dice stay in combat via ruleAmount). */
export function permanentRuleFlat(rule: EffectRule): number {
  return typeof rule.flat === 'number' && Number.isFinite(rule.flat) ? rule.flat : 0;
}

const ruleStatKey = (rule: EffectRule): StatKey | null => {
  const key = rule.kind === 'attack-speed' ? 'atkSpePct' : rule.kind === 'move-speed' ? 'spe' : rule.kind === 'stat' ? rule.stat : undefined;
  return key && isStatLineKey(key) ? key : null;
};

export type PermanentStackStatSource = {
  id: string;
  key: string;
  name: string;
  stacks: number;
  line: StatLine;
  lolAd?: number;
  lolAp?: number;
};

/**
 * Permanent item-effect stack bonuses for the sheet (not combat).
 * Only while an item with that effect is equipped. One row per effect.
 * Combat already adds these via combatExtraLines / permanentStackLines: do not also pass this into playerTotalLine there.
 */
export function itemPermanentStackSources(
  items: Item[],
  data: NamedEffectData,
  stacks: Record<string, number> | undefined,
): PermanentStackStatSource[] {
  const out: PermanentStackStatSource[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    for (const id of item.namedEffects ?? []) {
      if (seen.has(id)) continue;
      const rules = (namedEffectBonus(data, id)?.rules ?? []).filter(isPermanentStackRule);
      if (!rules.length) continue;
      seen.add(id);
      const key = effectStackKey(id);
      const count = readStack(stacks, key);
      const line = emptyStatLine();
      const lol: { ad?: number; ap?: number } = {};
      for (const rule of rules) {
        const stat = ruleStatKey(rule);
        if (!stat) continue;
        const stored = readStackValue(stacks, key);
        const used = rule.stackValue ? Math.min(stored, rule.maxStacks ?? stored) : Math.min(count, rule.maxStacks ?? count);
        const lolRule = ruleLolAdAp(rule);
        if (lolRule) {
          const total = rule.stackValue ? Math.round(used * 1000) / 1000 : Math.round(lolRule.value * used * 1000) / 1000;
          lol[lolRule.stat] = (lol[lolRule.stat] ?? 0) + total;
          const converted = lolToDice(lolRule.stat, Math.max(0, total));
          line[stat] = converted?.text ?? '0';
          continue;
        }
        const per = permanentRuleFlat(rule);
        const amount = rule.stackValue ? (/Pct$/.test(stat) ? Math.round(used * 100) / 100 : Math.floor(used)) : Math.round(per * used * 1000) / 1000;
        if (typeof line[stat] !== "string") {
          const current = typeof line[stat] === "number" ? line[stat] : 0;
          line[stat] = Math.round((current + amount) * 1000) / 1000;
        }
      }
      if (lol.ad != null) withLolStatBonus(line, { ad: lol.ad });
      if (lol.ap != null) withLolStatBonus(line, { ap: lol.ap });
      // Con el item equipado se enseña la fila aunque haya 0 cargas (el total LoL muestra 0).
      out.push({ id, key, name: namedEffectName(id), stacks: count, line, ...(lol.ad != null ? { lolAd: lol.ad } : {}), ...(lol.ap != null ? { lolAp: lol.ap } : {}) });
    }
  }
  return out;
}

export function itemPermanentStackSourcesFromEquipment(
  equipment: string[],
  data: NamedEffectData,
  stacks: Record<string, number> | undefined,
): PermanentStackStatSource[] {
  const items: Item[] = [];
  for (const name of equipment) {
    const item = findItem(name);
    if (item) items.push(item);
  }
  return itemPermanentStackSources(items, data, stacks);
}

export function itemPermanentStackLines(
  equipment: string[],
  data: NamedEffectData,
  stacks: Record<string, number> | undefined,
): StatLine[] {
  return itemPermanentStackSourcesFromEquipment(equipment, data, stacks).map(source => source.line);
}

export function itemHasPermanentStacks(item: Item | undefined, data: NamedEffectData): boolean {
  return !!item && (item.namedEffects ?? []).some(id => (namedEffectBonus(data, id)?.rules ?? []).some(isPermanentStackRule));
}

/** Últimos valores escritos (hasta que vuelva la lista de players), para no leer un contador viejo entre dos AA seguidos. */
const written = new Map<string, number>();
if (typeof window !== 'undefined') window.addEventListener(PLAYERS_HYDRATED_EVENT, () => written.clear());

/**
 * Callback onPermanentStack de un participante: +N cargas en su ficha (players.stacks, merge por clave) con Deshacer.
 * Solo players (campeones / NPCs no tienen ficha propia: null → van al combate).
 */
export function permanentStackSaver(
  participant: { kind: string; sourceId?: string },
  patch: (playerName: string, patch: PlayerListPatch) => Promise<void>,
): ((base: string, max: number | undefined, gain?: number, opts?: { value?: boolean }) => Promise<{ before: number; after: number; undo: () => Promise<void> } | null>) | undefined {
  if (participant.kind !== 'player' || !participant.sourceId) return undefined;
  const playerName = participant.sourceId;
  return async (base, max, gain = 1, opts) => {
    const player = PLAYERS.find(p => p.name === playerName);
    if (!player) return null;
    const key = effectStackKey(base);
    const memo = `${playerName}|${key}`;
    const before = written.get(memo) ?? (opts?.value ? readStackValue(player.stacks, key) : readStack(player.stacks, key));
    const add = opts?.value ? (typeof gain === 'number' && Number.isFinite(gain) && gain > 0 ? gain : 0) : typeof gain === 'number' && Number.isFinite(gain) && gain >= 1 ? Math.min(999, Math.floor(gain)) : 1;
    // Valor acumulado: con decimales (3), sin pasar de 999 ni del máx. de la regla.
    const raw = Math.round((before + add) * 1000) / 1000;
    const after = Math.min(999, typeof max === 'number' && max > 0 ? Math.min(max, raw) : raw);
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
