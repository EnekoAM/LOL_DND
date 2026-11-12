import type { Ability } from './champions';
import type { CombatBonus } from './combat';
import type { EffectBonusConfig } from './effectBonus';
import { abilityStackKey } from './stacks';

/**
 * Mecánicas de combate de una habilidad (genéricas, para ir configurando campeones):
 * - charges: se usa gastando cargas en vez de CD (empieza el combate con start; recarga 1 cada recharge[rango] turnos).
 * - stacks: cargas que se ganan al aplicar efectos de impacto (AA o habilidad con «Aplica efectos de impacto»);
 *   duran turns (se refrescan), máx. max. Con required, la habilidad solo se puede activar con esas cargas (y las gasta).
 * - buff: al activar, turns turnos de bonus propio: % velocidad de ataque y % AD de los AA (por rango);
 *   aaAppliesPassive = esos AA aplican el estado de la pasiva.
 * - appliesPassive: los objetivos alcanzados reciben el estado de la pasiva (el primer efecto de la P).
 * - aaCritBonus (pasiva): los AA hacen daño extra = daño del AA × pctPerFace % × caras de prob. de crítico.
 * - critNoDamage (pasiva): los críticos del portador no hacen daño extra (no se aplica DAÑO CRÍT; Ashe).
 * - critDoublesPassive (pasiva): en un crítico, el estado de la pasiva se aplica con el valor doble (Ashe: ralentización).
 * - effectRules: reglas como las de los efectos con nombre de los ítems (mismo motor: daño al AA, CD por objetivo…),
 *   activas mientras la tenga aprendida (rango ≥ 1; la pasiva siempre). Cadencia marcial de Jarvan IV.
 * - learnedStats: bonus de stat por tenerla aprendida (siempre), valor por rango. Estandarte demaciano: vel. ataque.
 * - castPool: escudo / curación al portador al usarla: Σ (valor del rango % × stat) [+ pct % de stat por campeón enemigo
 *   alcanzado] × poder de curación y escudos; dura turns (marcador: al acabar se quita lo que quede; bloquea la habilidad).
 */
export type AbilityMechanics = {
  /** reducePerChampionHit: cada campeón enemigo alcanzado (AA / habilidad) quita N turnos a la recarga (Plumas feéricas). */
  charges?: { start: number; max: number; recharge: number[]; reducePerChampionHit?: number };
  stacks?: { turns: number; max: number; required?: number };
  buff?: { turns: number; attackSpeed?: number[]; aaAd?: number[]; aaAppliesPassive?: boolean };
  appliesPassive?: boolean;
  aaCritBonus?: { pctPerFace: number };
  critNoDamage?: boolean;
  critDoublesPassive?: boolean;
  effectRules?: EffectBonusConfig;
  learnedStats?: { stat: string; values: number[] }[];
  castPool?: AbilityCastPool;
  /** Su efecto enemigo va a TODOS los enemigos del combate (no solo a los objetivos elegidos). Paranoia de Nocturne. */
  allEnemies?: boolean;
  /** Al usarla, estado propio (escudo de hechizos) que se puede romper: al romperse, los bonus «por tenerla aprendida» × learnedMultiplier durante breakTurns. */
  spellShield?: AbilitySpellShield;
  /** Se puede volver a lanzar times veces gratis (sin coste ni bloqueo) durante turns turnos tras usarla. Danza de guerra. */
  recast?: { times: number; turns: number };
  /** Al usarla, estado en sí mismo (bloquea la habilidad mientras dura). */
  selfStatus?: { name: string; turns: number; value?: number };
  /** No gasta la acción de habilidad del turno (escudo de la pasiva). */
  noAction?: boolean;
  /** Escudo automático: al empezar el combate; al romperse, CD (turnos por rango/tramo, decimales) y vuelve solo. Plumas feéricas. */
  innateShield?: AbilityInnateShield;
};

export type AbilityInnateShield = {
  /** Base plana por rango (tramo en la pasiva). */
  flat?: number[];
  /** % de la stat por rango. */
  ratios: { stat: CastPoolStat; values: number[] }[];
  /** Turnos de CD tras romperse, por rango. */
  cooldown: number[];
  /** Turnos de CD que quita cada enemigo alcanzado por AA o habilidad (0,5…). */
  reducePerHit?: number;
};

export type AbilitySpellShield = { status: string; turns: number; breakTurns: number; learnedMultiplier: number };

/** Stats de escalado de castPool (las de las reglas de ítems). */
export const CAST_POOL_STATS = ['ad', 'bonusAd', 'baseAd', 'ap', 'hp', 'bonusHp', 'missingHp', 'armor', 'bonusArmor', 'mr', 'bonusMr', 'mana', 'bonusMana'] as const;
export type CastPoolStat = (typeof CAST_POOL_STATS)[number];
export type AbilityCastPool = {
  kind: 'shield' | 'heal';
  /** % de la stat por rango (60, 65, 70…). */
  ratios: { stat: CastPoolStat; values: number[] }[];
  /** Turnos que dura el escudo (vacío = hasta que se gaste). */
  turns?: number;
  /** Extra por cada campeón enemigo alcanzado: pct % de la stat del portador. */
  perChampionHit?: { stat: CastPoolStat; pct: number };
  /** ally = a los aliados elegidos como objetivo (no al portador). Ausente = al portador. */
  target?: 'self' | 'ally';
  /** Solo si alcanza a algún enemigo (Pluma resplandeciente). */
  requiresHit?: boolean;
  /** Además del portador, a los aliados que se elijan al usarla (círculo de curación). */
  alliesToo?: boolean;
  /** Base plana por rango (o por tramo de nivel con flatByLevel: 4 valores 1/6/11/16). */
  flat?: number[];
  flatByLevel?: boolean;
  /** Cura retrasada: se aplica al empezar el turno del portador tras N turnos (o con «Curar ahora»). */
  delayTurns?: number;
};

/** Valor del rango (1-based); si la lista es más corta, el último. */
export function rankValue(list: number[] | undefined, rank: number): number | undefined {
  if (!list || list.length === 0) return undefined;
  return list[Math.max(0, Math.min(list.length, Math.max(1, Math.floor(rank))) - 1)];
}

const cut = (text: string) => text.slice(0, 80);
export const abilityChargesSource = (name: string): string => cut(`charges:${abilityStackKey(name)}`);
export const abilityStacksSource = (name: string): string => cut(`stacks:${abilityStackKey(name)}`);
export const abilityBuffSource = (name: string): string => cut(`buff:${abilityStackKey(name)}`);
/** Bonus de stats del buff (velocidad de ataque): una stat normal, para que sume al total. */
export const abilityBuffStatSource = (name: string): string => cut(`buffstat:${abilityStackKey(name)}`);
/** Escudo de castPool: marcador 'buff' con amount = escudo dado; al caducar se quita lo que quede. */
export const abilityShieldSource = (name: string): string => cut(`shield:${abilityStackKey(name)}`);
/** Bonus extra al romperse el escudo de hechizos (una stat normal con turnos). */
export const abilityBreakSource = (name: string): string => cut(`break:${abilityStackKey(name)}`);
/** Recast disponible: marcador 'buff' con amount = recasts que quedan, turns = ventana. */
export const abilityRecastSource = (name: string): string => cut(`recast:${abilityStackKey(name)}`);
export const abilityRecast = (bonuses: CombatBonus[] | undefined, name: string): CombatBonus | undefined =>
  (bonuses ?? []).find(bonus => bonus.source === abilityRecastSource(name) && bonus.amount > 0);

/** Quita turns turnos a la recarga de las cargas; si llega a 0 recupera 1 carga. null si no hay recarga en curso. */
export function reduceChargeRecharge(bonuses: CombatBonus[], ability: Ability, name: string, turns: number): { bonuses: CombatBonus[]; before: number; after: number; recharged: boolean } | null {
  const state = abilityCharges(ability, bonuses, name);
  if (!state?.marker || !state.recharge || state.left >= state.max || turns <= 0) return null;
  const left = state.recharge - turns;
  const marker: CombatBonus = { ...state.marker };
  let recharged = false;
  if (left <= 0) {
    recharged = true;
    marker.amount = Math.min(state.max, state.marker.amount + 1);
    if (marker.amount < state.max && marker.rechargeEvery) marker.recharge = marker.rechargeEvery;
    else delete marker.recharge;
  } else marker.recharge = left;
  return { bonuses: bonuses.map(bonus => (bonus === state.marker ? marker : bonus)), before: state.recharge, after: Math.max(0, left), recharged };
}
/** Id / efecto base de las reglas de una habilidad en el motor de efectos (a-z0-9-, como los de ítems: vale para el CD por objetivo). */
export const abilityRuleBase = (name: string): string =>
  `ability-${name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}`.slice(0, 60).replace(/-+$/, '') || 'ability';

export function abilityCharges(ability: Ability, bonuses: CombatBonus[] | undefined, name = ability.name): { left: number; max: number; recharge?: number; marker?: CombatBonus } | null {
  const charges = ability.mechanics?.charges;
  if (!charges) return null;
  const marker = (bonuses ?? []).find(bonus => bonus.source === abilityChargesSource(name));
  return { left: marker ? marker.amount : charges.start, max: charges.max, recharge: marker?.recharge, marker };
}

export function abilityStacks(bonuses: CombatBonus[] | undefined, name: string): { count: number; turns?: number; marker?: CombatBonus } {
  const marker = (bonuses ?? []).find(bonus => bonus.source === abilityStacksSource(name));
  return { count: marker ? marker.amount : 0, turns: marker?.turns, marker };
}

export function abilityBuff(bonuses: CombatBonus[] | undefined, name: string): CombatBonus | undefined {
  return (bonuses ?? []).find(bonus => bonus.source === abilityBuffSource(name));
}

/** Gasta 1 carga: si estaban llenas, empieza la cuenta de recarga del rango. */
export function spendAbilityCharge(bonuses: CombatBonus[], ability: Ability, name: string, rank: number, newId: () => string): { bonuses: CombatBonus[]; before: number; after: number; max: number; recharge?: number } | null {
  const state = abilityCharges(ability, bonuses, name);
  const config = ability.mechanics?.charges;
  if (!state || !config || state.left <= 0) return null;
  const every = rankValue(config.recharge, rank);
  const recharge = state.recharge ?? every;
  const marker: CombatBonus = {
    id: state.marker?.id ?? newId(),
    stat: 'charges',
    amount: state.left - 1,
    maxStacks: config.max,
    ...(recharge ? { recharge } : {}),
    ...(every ? { rechargeEvery: every } : {}),
    source: abilityChargesSource(name),
    label: cut(name),
  };
  return { bonuses: [...bonuses.filter(bonus => bonus.source !== marker.source), marker], before: state.left, after: state.left - 1, max: config.max, recharge };
}

/** +1 carga (refresca la duración). null si no gana (buff activo o sin configurar). */
export function gainAbilityStack(bonuses: CombatBonus[], ability: Ability, name: string, newId: () => string): { bonuses: CombatBonus[]; before: number; after: number; max: number; turns: number } | null {
  const config = ability.mechanics?.stacks;
  if (!config) return null;
  // Mientras el buff de la propia habilidad está activo no se acumulan cargas.
  if (abilityBuff(bonuses, name)) return null;
  const current = abilityStacks(bonuses, name);
  const after = Math.min(config.max, current.count + 1);
  const marker: CombatBonus = {
    id: current.marker?.id ?? newId(),
    stat: 'stacks',
    amount: after,
    maxStacks: config.max,
    turns: config.turns,
    source: abilityStacksSource(name),
    label: cut(name),
  };
  return { bonuses: [...bonuses.filter(bonus => bonus.source !== marker.source), marker], before: current.count, after, max: config.max, turns: config.turns };
}

/** Estado aplicable de la pasiva: su primer efecto (nombre, valor del rango como % entero, duración). */
export function passiveStatus(passive: Ability | undefined, rank = 1): { name: string; value?: number; duration: number; source: string } | null {
  const effect = passive?.effect?.find(entry => entry.name?.trim());
  if (!passive || !effect) return null;
  const raw = rankValue(effect.values, rank);
  const pct = typeof raw === 'number' ? Math.round(Math.abs(raw) <= 1 ? raw * 100 : raw) : undefined;
  const duration = Math.max(1, Math.trunc(rankValue(effect.duration, rank) ?? 1));
  return {
    name: effect.name.trim(),
    ...(pct && pct >= 1 && pct <= 99 ? { value: pct } : {}),
    duration,
    source: abilityStackKey(passive.name),
  };
}

/** Resumen corto para la ficha / el modal. */
export function mechanicsSummary(mechanics: AbilityMechanics | undefined): string[] {
  if (!mechanics) return [];
  const list = (values: number[] | undefined) => (values ?? []).join(' / ');
  const out: string[] = [];
  if (mechanics.charges) out.push(`Cargas: empieza con ${mechanics.charges.start} (máx. ${mechanics.charges.max}); recarga 1 cada ${list(mechanics.charges.recharge) || '—'} t.`);
  if (mechanics.stacks) out.push(`Cargas por efecto de impacto: duran ${mechanics.stacks.turns} t. (se refrescan), máx. ${mechanics.stacks.max}${mechanics.stacks.required ? `; se activa con ${mechanics.stacks.required} (las gasta)` : ''}`);
  if (mechanics.buff) {
    const parts = [
      mechanics.buff.attackSpeed?.length ? `+${list(mechanics.buff.attackSpeed)}% vel. ataque` : '',
      mechanics.buff.aaAd?.length ? `AA al ${list(mechanics.buff.aaAd)}% AD` : '',
      mechanics.buff.aaAppliesPassive ? 'los AA aplican el estado de la pasiva' : '',
    ].filter(Boolean);
    out.push(`Al activar, ${mechanics.buff.turns} t.: ${parts.join(' · ') || 'sin valores'}`);
  }
  if (mechanics.appliesPassive) out.push('Aplica el estado de la pasiva a los objetivos');
  if (mechanics.aaCritBonus) out.push(`AA: +${mechanics.aaCritBonus.pctPerFace || 0}% del daño por cada cara de prob. de crítico${mechanics.aaCritBonus.pctPerFace ? '' : ' (sin valor)'}`);
  if (mechanics.critNoDamage) out.push('Los críticos no hacen daño extra');
  if (mechanics.critDoublesPassive) out.push('Crítico: duplica el valor del estado de la pasiva');
  for (const entry of mechanics.learnedStats ?? []) out.push(`Por tenerla aprendida: +${list(entry.values)} ${entry.stat}`);
  if (mechanics.castPool) {
    const pool = mechanics.castPool;
    const parts = [...(pool.flat?.length ? [`${list(pool.flat)}${pool.flatByLevel ? ' (por tramo de nivel)' : ''}`] : []), ...pool.ratios.map(ratio => `${list(ratio.values)}% ${ratio.stat}`)];
    if (pool.perChampionHit) parts.push(`${pool.perChampionHit.pct}% ${pool.perChampionHit.stat} por campeón enemigo alcanzado`);
    out.push(`Al usarla: ${pool.kind === 'shield' ? 'escudo' : 'cura'}${pool.target === 'ally' ? ' al aliado' : pool.alliesToo ? ' propio y a aliados' : ''} = ${parts.join(' + ') || '—'}${pool.turns ? ` · ${pool.turns} t.` : ''}${pool.requiresHit ? ' · solo si alcanza a un enemigo' : ''}${pool.delayTurns ? ` · se aplica tras ${pool.delayTurns} t. (o «Curar ahora»)` : ''}`);
  }
  if (mechanics.charges?.reducePerChampionHit) out.push(`Cada campeón enemigo alcanzado (AA o habilidad) quita ${mechanics.charges.reducePerChampionHit} t. a la recarga`);
  if (mechanics.recast) out.push(`Recast gratis ×${mechanics.recast.times} durante ${mechanics.recast.turns} t.`);
  if (mechanics.selfStatus) out.push(`Al usarla: «${mechanics.selfStatus.name}»${mechanics.selfStatus.value ? ` ${mechanics.selfStatus.value}` : ''} en sí mismo ${mechanics.selfStatus.turns} t.`);
  if (mechanics.noAction) out.push('No gasta la acción de habilidad');
  if (mechanics.innateShield) {
    const shield = mechanics.innateShield;
    out.push(`Escudo automático = ${[...(shield.flat?.length ? [list(shield.flat)] : []), ...shield.ratios.map(ratio => `${list(ratio.values)}% ${ratio.stat}`)].join(' + ')} · al romperse CD ${list(shield.cooldown)} t.${shield.reducePerHit ? ` (−${shield.reducePerHit} t. por enemigo alcanzado)` : ''}`);
  }
  if (mechanics.allEnemies) out.push('Su efecto va a todos los enemigos del combate');
  if (mechanics.spellShield) out.push(`Al usarla: «${mechanics.spellShield.status}» en sí mismo ${mechanics.spellShield.turns} t.; si se rompe, los bonus por tenerla aprendida × ${mechanics.spellShield.learnedMultiplier} durante ${mechanics.spellShield.breakTurns} t.`);
  if (mechanics.effectRules?.rules.length) out.push(`Reglas de efecto: ${mechanics.effectRules.rules.length} (como las de los ítems)${mechanics.effectRules.cooldown ? ` · CD ${mechanics.effectRules.cooldown} t.${mechanics.effectRules.perTargetCooldown ? ' por objetivo' : ''}` : ''}`);
  return out;
}
