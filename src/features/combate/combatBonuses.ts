import type { CombatBonus, CombatParticipant } from '../../data/combat';
import { findItem, type Item, type PassiveTrigger } from '../../data/items';
import { damageTargets, type TargetDamageFn } from './combatHp';
import type { ResultChip } from './combatResult';
import { emptyStatLine, STAT_COLUMNS, formatStat, type StatKey, type StatLine } from '../calculos/statLine';

const STAT_KEYS = new Set<string>(STAT_COLUMNS.map(column => column.key));

export const isStatKey = (key: string): key is StatKey => STAT_KEYS.has(key);

/** Título legible de una stat ("Letalidad", "Daño de ataque"…). */
export function statTitle(key: string): string {
  return STAT_COLUMNS.find(column => column.key === key)?.title ?? key;
}

export const bonusValue = (bonus: CombatBonus): number => Math.round(bonus.amount * (bonus.stacks ?? 1) * 1000) / 1000;

/** Bonus activos del participante como líneas de stats para sumar al total (vacío si no tiene). */
export function bonusLines(participant: CombatParticipant): StatLine[] {
  const bonuses = participant.bonuses ?? [];
  if (bonuses.length === 0) return [];
  return bonuses.filter(bonus => isStatKey(bonus.stat)).map(bonus => {
    const line = emptyStatLine();
    line[bonus.stat as StatKey] = bonusValue(bonus);
    return line;
  });
}

/** «Flujo de maná 3/4 · recarga en 2t» */
export const chargesText = (name: string, left: number, max: number, recharge?: number): string =>
  `${name} ${left}/${max}${left < max && recharge ? ` · recarga en ${recharge}t` : ''}`;

/** "+0,3 Letalidad ×2 · 2 t." */
export function formatBonus(bonus: CombatBonus): string {
  // Marcadores de efectos con nombre: «Hoja encantada armada · 5 t.», «CD Hoja encantada · 1 t.».
  if (bonus.stat === 'armed') return `${bonus.label ?? 'Efecto'} armada (siguiente AA)${typeof bonus.turns === 'number' ? ` · ${bonus.turns} t.` : ''}`;
  if (bonus.stat === 'charges') return chargesText(bonus.label ?? 'Cargas', bonus.amount, bonus.maxStacks ?? bonus.amount, bonus.recharge);
  if (bonus.stat === 'cooldown') {
    const turns = typeof bonus.turns === 'number' ? ` · ${bonus.turns} t.` : '';
    // CD por objetivo: label «Efecto (de Portador)» → «CD Efecto · 2 t. (de Portador)».
    const split = bonus.source?.includes('@') ? /^(.*) \((de .*)\)$/.exec(bonus.label ?? '') : null;
    if (split) return `CD ${split[1]}${turns} (${split[2]})`;
    return `CD ${bonus.label ?? 'efecto'}${turns}`;
  }
  const value = bonusValue(bonus);
  const amount = `${value > 0 ? '+' : ''}${formatStat(Math.round(value * 100) / 100)}`;
  const stacks = (bonus.stacks ?? 1) > 1 || bonus.maxStacks ? ` ×${bonus.stacks ?? 1}${bonus.maxStacks ? `/${bonus.maxStacks}` : ''}` : '';
  const turns = typeof bonus.turns === 'number' ? ` · ${bonus.turns} t.` : '';
  return `${amount} ${statTitle(bonus.stat)}${stacks}${turns}`;
}

export const newBonusId = (): string => `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Ítems equipados del participante (players: su ficha; campeones: su equipo). */
export function equippedItems(equipment: string[] | undefined): Item[] {
  return (equipment ?? []).map(name => findItem(name)).filter((item): item is Item => !!item);
}

/**
 * Pasivas que saltan con este disparador: añade / acumula el bonus de cada ítem (una entrada por ítem,
 * source "item:<nombre>"; stacks hasta maxStacks; la duración se refresca). Devuelve null si no cambia nada.
 */
export function triggerItemBonuses(bonuses: CombatBonus[] | undefined, items: Item[], trigger: PassiveTrigger): CombatBonus[] | null {
  let next = [...(bonuses ?? [])];
  let changed = false;
  for (const item of items) {
    const passive = item.passiveBonus;
    if (!passive || passive.trigger !== trigger || !isStatKey(passive.stat) || !passive.amount) continue;
    const source = `item:${item.nombre}`;
    const index = next.findIndex(bonus => bonus.source === source);
    const turns = passive.durationTurns;
    if (index >= 0) {
      const current = next[index];
      const stacks = passive.maxStacks ? Math.min(passive.maxStacks, (current.stacks ?? 1) + 1) : current.stacks;
      next[index] = { ...current, amount: passive.amount, stat: passive.stat, ...(stacks ? { stacks } : {}), ...(turns ? { turns } : {}), ...(passive.maxStacks ? { maxStacks: passive.maxStacks } : {}) };
    } else {
      next = [...next, {
        id: newBonusId(),
        stat: passive.stat,
        amount: passive.amount,
        ...(passive.maxStacks ? { stacks: 1, maxStacks: passive.maxStacks } : {}),
        ...(turns ? { turns } : {}),
        source,
        label: item.nombre,
      }];
    }
    changed = true;
  }
  return changed ? next.slice(-30) : null;
}

/** % de vida actual de las pasivas de daño con este disparador (suma de los ítems). */
export function passiveDamagePct(items: Item[], trigger: PassiveTrigger): { pct: number; names: string[] } {
  let pct = 0;
  const names: string[] = [];
  for (const item of items) {
    const damage = item.passiveDamage;
    if (!damage || damage.trigger !== trigger || !(damage.currentHpPct > 0)) continue;
    pct += damage.currentHpPct;
    names.push(item.nombre);
  }
  return { pct, names };
}

/** note: texto antiguo; chips: en pantalla; log: desarrollo para la consola. */
export type PassiveResult = { note: string; undo?: () => Promise<void>; chips?: ResultChip[]; log?: string[] };

/**
 * Salta las pasivas de los ítems con este disparador: bonus (acumulable) al usuario y daño % vida actual
 * a los objetivos. Devuelve la nota para el resultado y un Deshacer que lo revierte todo.
 */
export async function firePassives(options: {
  bonuses: CombatBonus[] | undefined;
  items: Item[];
  trigger: PassiveTrigger;
  targetIds: string[];
  onBonusesSave?: (bonuses: CombatBonus[]) => Promise<void>;
  onTargetDamage?: TargetDamageFn;
}): Promise<PassiveResult> {
  const { items, trigger, targetIds, onBonusesSave, onTargetDamage } = options;
  const notes: string[] = [];
  const chips: ResultChip[] = [];
  const log: string[] = [];
  const undos: (() => Promise<void>)[] = [];
  const prev = options.bonuses ?? [];
  const next = onBonusesSave ? triggerItemBonuses(prev, items, trigger) : null;
  if (next && onBonusesSave) {
    await onBonusesSave(next);
    undos.push(() => onBonusesSave(prev));
    const fired = items.filter(item => item.passiveBonus?.trigger === trigger);
    notes.push(`pasiva ${fired.map(item => item.nombre).join(', ')}`);
    for (const item of fired) {
      const passive = item.passiveBonus!;
      const entry = next.find(bonus => bonus.source === `item:${item.nombre}`);
      const stacks = entry?.maxStacks ? ` · stack ${entry.stacks ?? 1}/${entry.maxStacks}` : '';
      chips.push({ kind: passive.amount < 0 ? 'debuff' : 'buff', text: `${passive.amount > 0 ? '+' : ''}${formatStat(passive.amount)} ${statTitle(passive.stat)}`, title: `Pasiva de ${item.nombre}` });
      log.push(`Pasiva de ${item.nombre}: ${passive.amount > 0 ? '+' : ''}${formatStat(passive.amount)} ${statTitle(passive.stat)} al portador${stacks}${passive.durationTurns ? ` · ${passive.durationTurns} t.` : ''}`);
    }
  }
  const passive = passiveDamagePct(items, trigger);
  if (passive.pct > 0 && onTargetDamage && targetIds.length > 0) {
    const perTarget: string[] = [];
    let total = 0;
    const { damage, error } = await damageTargets(onTargetDamage, targetIds, hp => {
      const dealt = Math.ceil((hp * passive.pct) / 100);
      total += dealt;
      perTarget.push(`${formatStat(passive.pct)}% de vida actual (${formatStat(hp)}) = ${formatStat(Math.round(hp * passive.pct) / 100)} → ${dealt} (redondeo ↑)`);
      return dealt;
    });
    if (damage) {
      undos.push(damage.undo);
      notes.push(`${passive.names.join(', ')}: ${formatStat(passive.pct)}% vida actual`);
      chips.push({ kind: 'damage-physical', text: `−${formatStat(total)} ${damage.name}`, title: `${passive.names.join(', ')}: ${formatStat(passive.pct)}% vida actual` });
      log.push(`Pasiva de ${passive.names.join(', ')}: ${perTarget.join(' · ')} → ${damage.name} · sin mitigación automática`);
    }
    if (error) {
      notes.push(`error: ${error}`);
      chips.push({ kind: 'error', text: error });
      log.push(`Pasiva de ${passive.names.join(', ')}: error ${error}`);
    }
  }
  return {
    chips,
    log,
    note: notes.length ? ` · ${notes.join(' · ')}` : '',
    undo: undos.length ? async () => { for (const undo of [...undos].reverse()) await undo(); } : undefined,
  };
}
