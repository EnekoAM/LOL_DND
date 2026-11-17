import type { Item } from './items';
import type { ResultChip } from '../features/combate/combatResult';
import { baseNamedEffectId, namedEffectName } from './namedEffects';

/**
 * "% a la tirada": efectos de items que suman un % al RESULTADO de la tirada de AD o AP del portador
 * (dados del AA o de la habilidad), no a la stat total.
 * Ej.: Rabadon +30 %: tirada de AP 10 -> +3. Sangria del soberano: +1,5 % por cada 10 % completo de vida faltante (max. +15 %).
 * Redondeo hacia arriba, como el resto de % de combate. Varios efectos se suman sobre la tirada original (no se encadenan).
 * Por ronda (perRoundAmp): +X % a TODAS las tiradas por carga; cargas = ronda - 1 hasta su maximo (ronda 1 = 0).
 *   Liandry (Sufrimiento) 2 % x3, Disfraz encantado (Locura) 2 % x3, Creagrietas (Corrupcion del Vacio) 2 % x4 + omnisuccion al maximo.
 *   Efectos distintos se suman entre si; el mismo efecto en dos items cuenta una vez.
 * Para otro item: una entrada mas en ROLL_AMP_EFFECTS con el id base de su efecto con nombre.
 */
export type RollAmpStat = 'ad' | 'ap';
/** A que tirada va: AD, AP o todas (all). */
export type RollAmpTarget = RollAmpStat | 'all';
export type RollAmpHp = { current: number; max?: number | null };
/** Contexto: vida del portador y ronda de combate (0 / sin ronda = fuera de combate). */
export type RollAmpContext = { hp: RollAmpHp | null; round?: number; melee?: boolean };
/** Bonus extra con las cargas al maximo (Creagrietas: omnisuccion cuerpo a cuerpo / a distancia). */
export type FullStackBonus = { omnivampPct: { melee: number; ranged: number } };
type RollAmpDef = {
  stat: RollAmpTarget;
  /** Nombre que se ensena (si no, el del efecto con nombre). */
  label?: string;
  /** Cargas por ronda de combate (si las tiene). */
  perRound?: { pctPerStack: number; maxStacks: number; fullStack?: FullStackBonus };
  amount: (ctx: RollAmpContext) => { pct: number; reason?: string };
};

const num = (value: number): string => String(Math.round(value * 100) / 100).replace('.', ',');

/** % de vida faltante (0-100); sin vida max. conocida, 0. */
export function missingHpPct(hp: RollAmpHp | null): number {
  if (!hp || typeof hp.max !== 'number' || !(hp.max > 0)) return 0;
  return Math.max(0, Math.min(100, ((hp.max - hp.current) / hp.max) * 100));
}

/** Ronda del combate en curso (0 = sin combate activo). La fija Combate.tsx al pintar. */
let currentRound = 0;
export function setRollAmpRound(round: number): void {
  currentRound = Number.isFinite(round) && round > 0 ? Math.floor(round) : 0;
}
export const rollAmpRound = (): number => currentRound;

/** Cargas por ronda: ronda 1 = 0, +1 por ronda hasta maxStacks; fuera de combate 0. */
export function roundStacks(round: number | undefined, maxStacks: number): number {
  if (!round || round < 1) return 0;
  return Math.max(0, Math.min(maxStacks, Math.floor(round) - 1));
}

const fullStackOmnivamp = (bonus: FullStackBonus, melee: boolean | undefined): string =>
  melee === undefined ? `${num(bonus.omnivampPct.melee)}% cuerpo a cuerpo / ${num(bonus.omnivampPct.ranged)}% a distancia` : `${num(melee ? bonus.omnivampPct.melee : bonus.omnivampPct.ranged)}%`;

/** Efecto por rondas: +pctPerStack % a todas las tiradas por carga (hasta maxStacks). */
function perRoundAmp(label: string, pctPerStack: number, maxStacks: number, fullStack?: FullStackBonus): RollAmpDef {
  return {
    stat: 'all',
    label,
    perRound: { pctPerStack, maxStacks, ...(fullStack ? { fullStack } : {}) },
    amount: ({ round, melee }) => {
      if (!round || round < 1) return { pct: 0, reason: 'fuera de combate' };
      const stacks = roundStacks(round, maxStacks);
      const full = fullStack && stacks >= maxStacks ? `, omnisucci\u00f3n activa (${fullStackOmnivamp(fullStack, melee)})` : '';
      return { pct: stacks * pctPerStack, reason: `ronda ${Math.floor(round)}, ${stacks}/${maxStacks} cargas${full}` };
    },
  };
}

export const ROLL_AMP_EFFECTS: Record<string, RollAmpDef> = {
  // Sombrero mortal de Rabadon: +30 % a la tirada de AP.
  'magical-opus': { stat: 'ap', label: 'Opus m\u00e1gico', amount: () => ({ pct: 30 }) },
  // Sangria del soberano: +1,5 % a la tirada de AD por cada 10 % COMPLETO de vida faltante (hasta +15 % a 0 de vida).
  retribution: {
    stat: 'ad',
    label: 'Retribuci\u00f3n',
    amount: ({ hp }) => {
      const missing = missingHpPct(hp);
      const steps = Math.floor(missing / 10 + 1e-9);
      return { pct: Math.min(15, steps * 1.5), reason: `${num(Math.floor(missing + 1e-9))}% vida faltante` };
    },
  },
  // Tormento de Liandry: +2 % a todas las tiradas por carga; cargas = ronda - 1 (max. 3). Ronda 1: 0 %, 2: 2 %, 3: 4 %, 4+: 6 %.
  suffering: perRoundAmp('Sufrimiento', 2, 3),
  // Disfraz encantado: +2 % por ronda, max. 6 % (3 cargas).
  madness: perRoundAmp('Locura', 2, 3),
  // Creagrietas: +2 % por ronda, max. 8 % (4 cargas); al maximo, omnisuccion 10 % cuerpo a cuerpo / 6 % a distancia.
  'void-corruption': perRoundAmp('Corrupci\u00f3n del Vac\u00edo', 2, 4, { omnivampPct: { melee: 10, ranged: 6 } }),
};

export type RollAmp = { stat: RollAmpTarget; pct: number; item: string; effect: string; reason?: string };
export type RollAmpPart = { amp: RollAmp; bonus: number };
export type RollAmpResult = { stat: RollAmpStat; rolled: number; total: number; bonus: number; parts: RollAmpPart[] };

/** Efectos "% a la tirada" de los items equipados (uno por efecto base: manda el primer item que lo tenga). */
export function rollAmpsFor(items: readonly Item[] | undefined, hp: RollAmpHp | null, round?: number, melee?: boolean): RollAmp[] {
  const seen = new Set<string>();
  const out: RollAmp[] = [];
  for (const item of items ?? []) {
    for (const id of item.namedEffects ?? []) {
      const base = baseNamedEffectId(id);
      const def = ROLL_AMP_EFFECTS[base];
      if (!def || seen.has(base)) continue;
      seen.add(base);
      const { pct, reason } = def.amount({ hp, round, melee });
      out.push({ stat: def.stat, pct, item: item.nombre, effect: def.label ?? namedEffectName(id), ...(reason ? { reason } : {}) });
    }
  }
  return out;
}

/** Suma los % a una tirada de AD/AP ya hecha (redondeo hacia arriba por efecto). */
export function ampRoll(stat: RollAmpStat, rolled: number, amps: readonly RollAmp[] | undefined): RollAmpResult {
  const parts: RollAmpPart[] = [];
  if (rolled > 0) {
    for (const amp of amps ?? []) {
      if ((amp.stat !== 'all' && amp.stat !== stat) || !(amp.pct > 0)) continue;
      const bonus = Math.ceil((rolled * amp.pct) / 100 - 1e-9);
      if (bonus > 0) parts.push({ amp, bonus });
    }
  }
  const bonus = parts.reduce((sum, part) => sum + part.bonus, 0);
  return { stat, rolled, total: rolled + bonus, bonus, parts };
}

/** Ej.: Sangria del soberano (Retribucion, 30% vida faltante): +4,5% de la tirada de AD 50 -> +3 */
export function rollAmpLabel(result: RollAmpResult, part: RollAmpPart): string {
  const why = part.amp.reason ? `, ${part.amp.reason}` : '';
  return `${part.amp.item} (${part.amp.effect}${why}): +${num(part.amp.pct)}% de la tirada de ${result.stat.toUpperCase()} ${num(result.rolled)} \u2192 +${num(part.bonus)}`;
}

export const rollAmpLines = (result: RollAmpResult): string[] => result.parts.map(part => rollAmpLabel(result, part));

export const rollAmpChips = (result: RollAmpResult): ResultChip[] =>
  result.parts.map((part): ResultChip => ({ kind: 'buff', text: `${part.amp.item} +${num(part.bonus)}`, title: rollAmpLabel(result, part) }));

/** Lineas / chips de todas las aportaciones (AD y AP) de una tirada de habilidad. */
type WithAmp = { contributions: readonly { amp?: RollAmpResult }[] };
export const abilityRollAmpLines = (roll: WithAmp): string[] => roll.contributions.flatMap(entry => (entry.amp ? rollAmpLines(entry.amp) : []));
export const abilityRollAmpChips = (roll: WithAmp): ResultChip[] => roll.contributions.flatMap(entry => (entry.amp ? rollAmpChips(entry.amp) : []));

/** Bonus de stats con las cargas al maximo (omnisuccion de Creagrietas): van como bonus del combate. */
export function fullStackBonuses(items: readonly Item[] | undefined, round: number, melee: boolean): { item: string; effect: string; omnivampPct: number }[] {
  const seen = new Set<string>();
  const out: { item: string; effect: string; omnivampPct: number }[] = [];
  for (const item of items ?? []) {
    for (const id of item.namedEffects ?? []) {
      const base = baseNamedEffectId(id);
      const per = ROLL_AMP_EFFECTS[base]?.perRound;
      if (!per?.fullStack || seen.has(base)) continue;
      seen.add(base);
      if (roundStacks(round, per.maxStacks) < per.maxStacks) continue;
      out.push({ item: item.nombre, effect: ROLL_AMP_EFFECTS[base].label ?? namedEffectName(id), omnivampPct: melee ? per.fullStack.omnivampPct.melee : per.fullStack.omnivampPct.ranged });
    }
  }
  return out;
}
