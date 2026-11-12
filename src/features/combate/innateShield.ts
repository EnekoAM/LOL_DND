import type { CombatBonus, CombatParticipant } from '../../data/combat';
import { rankValue, type AbilityInnateShield } from '../../data/abilityMechanics';
import { abilityStackKey } from '../../data/stacks';
import { participantAbilities, type OwnedAbility } from './abilityRules';
import { participantContext, poolAmount } from './effectRules';
import { participantHpPools } from './combatHp';
import { newBonusId } from './combatBonuses';
import { fmt } from './combatResult';

/**
 * Escudo innato automático (Plumas feéricas de Rakan): empieza el combate con el escudo; cuando se rompe
 * (escudo a 0) empieza su CD (turnos por tramo, admite decimales); al acabar el CD se vuelve a poner solo.
 * Marcadores 'buff' del portador: innate:… (escudo puesto, amount = lo que dio) e innatecd:… (CD que queda).
 */
const cut = (text: string) => text.slice(0, 80);
export const innateShieldSource = (name: string): string => cut(`innate:${abilityStackKey(name)}`);
export const innateCdSource = (name: string): string => cut(`innatecd:${abilityStackKey(name)}`);
/** Cura retrasada (Pluma resplandeciente): marcador 'buff' en el lanzador (con turnos) y en cada aliado (sin turnos). */
export const pendingHealSource = (name: string): string => cut(`pending:${abilityStackKey(name)}`);

export type InnateOwner = { owned: OwnedAbility; config: AbilityInnateShield };

export function innateOwners(participant: CombatParticipant, level: number): InnateOwner[] {
  return participantAbilities(participant, level)
    .filter(owned => owned.ability.mechanics?.innateShield && (owned.seal === 'P' || owned.rank >= 1))
    .map(owned => ({ owned, config: owned.ability.mechanics!.innateShield! }));
}

const STAT_NAME: Record<string, string> = { ad: 'AD total', bonusAd: 'AD bonus', ap: 'AP', hp: 'vida máx.', bonusHp: 'vida bonus', armor: 'CA', mr: 'RM', mana: 'maná máx.' };

/** Escudo del rango (tramo): base + Σ % × stat, × poder de curación y escudos. */
export function innateShieldAmount(participant: CombatParticipant, level: number, owner: InnateOwner): { amount: number; text: string } | null {
  const context = participantContext(participant, level);
  if (!context) return null;
  const stats = context.ctx.stats as Record<string, unknown> & { bonus?: Record<string, unknown> };
  const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : Number(value) || 0);
  const key: Record<string, string> = { armor: 'ac', mr: 'mr', hp: 'hp', mana: 'mana', ad: 'ad', ap: 'ap' };
  const rank = owner.owned.rank;
  const flat = rankValue(owner.config.flat, rank) ?? 0;
  let raw = flat;
  const parts: string[] = flat ? [`${fmt(flat)} base`] : [];
  for (const ratio of owner.config.ratios) {
    const pct = rankValue(ratio.values, rank) ?? 0;
    const base = ratio.stat.startsWith('bonus') ? num(stats.bonus?.[key[ratio.stat.slice(5).toLowerCase()] ?? ratio.stat]) : num(stats[key[ratio.stat] ?? ratio.stat]);
    raw += (pct / 100) * base;
    parts.push(`${fmt(pct)}% ${STAT_NAME[ratio.stat] ?? ratio.stat} (${fmt(base)}) = ${fmt((pct / 100) * base)}`);
  }
  const final = poolAmount(raw, context.ctx);
  return { amount: final.amount, text: `tramo ${rank}: ${parts.join(' + ') || '0'} → ${final.text}` };
}

export type InnatePlan = { bonuses: CombatBonus[]; shield?: number; lines: string[] };

/**
 * Qué toca hacer ahora con los escudos innatos del participante (null = nada):
 * sin escudo ni CD (o CD acabado) → poner escudo; escudo puesto y el escudo del participante a 0 → empieza el CD.
 */
export function innatePlan(participant: CombatParticipant, level: number): InnatePlan | null {
  const owners = innateOwners(participant, level);
  if (!owners.length || participant.defeated) return null;
  let bonuses = participant.bonuses ?? [];
  let shield = 0;
  const lines: string[] = [];
  const pools = participantHpPools(participant);
  for (const owner of owners) {
    const name = owner.owned.name;
    const label = `${owner.owned.seal} «${name}»`;
    const marker = bonuses.find(bonus => bonus.source === innateShieldSource(name));
    const cd = bonuses.find(bonus => bonus.source === innateCdSource(name));
    if (marker) {
      if (pools && pools.shield <= 0) {
        const turns = rankValue(owner.config.cooldown, owner.owned.rank) ?? 1;
        bonuses = [...bonuses.filter(bonus => bonus !== marker), { id: newBonusId(), stat: 'buff', amount: turns, source: innateCdSource(name), label: cut(name) }];
        lines.push(`${label}: escudo roto → CD ${fmt(turns)} t. (tramo ${owner.owned.rank})`);
      }
      continue;
    }
    if (cd && cd.amount > 0) continue;
    const value = innateShieldAmount(participant, level, owner);
    if (!value || value.amount <= 0) continue;
    shield += value.amount;
    bonuses = [...bonuses.filter(bonus => bonus !== cd), { id: newBonusId(), stat: 'buff', amount: value.amount, source: innateShieldSource(name), label: cut(name) }];
    lines.push(`${label}: escudo automático +${value.amount} = ${value.text}`);
  }
  if (bonuses === (participant.bonuses ?? [])) return null;
  return { bonuses, ...(shield ? { shield } : {}), lines };
}

/** Al empezar el turno del portador: −1 a los CD de escudo innato (mín. 0). */
export function tickInnateCooldowns(participant: CombatParticipant): CombatParticipant {
  if (!participant.bonuses?.some(bonus => (bonus.source ?? '').startsWith('innatecd:'))) return participant;
  return {
    ...participant,
    // Al llegar a 0 se quita (el servidor no guarda 0): sin escudo ni CD → vuelve el escudo.
    bonuses: participant.bonuses
      .map(bonus => ((bonus.source ?? '').startsWith('innatecd:') ? { ...bonus, amount: Math.round((bonus.amount - 1) * 100) / 100 } : bonus))
      .filter(bonus => !(bonus.source ?? '').startsWith('innatecd:') || bonus.amount > 0),
  };
}

/** Quita turns turnos (decimales) a los CD de escudo innato con reducePerHit, por cada enemigo alcanzado. */
export function reduceInnateCooldowns(bonuses: CombatBonus[], participant: CombatParticipant, level: number, hits: number): { bonuses: CombatBonus[]; lines: string[] } | null {
  if (hits <= 0) return null;
  const lines: string[] = [];
  let next = bonuses;
  for (const owner of innateOwners(participant, level)) {
    const per = owner.config.reducePerHit;
    const cd = next.find(bonus => bonus.source === innateCdSource(owner.owned.name));
    if (!per || !cd || cd.amount <= 0) continue;
    const after = Math.max(0, Math.round((cd.amount - per * hits) * 100) / 100);
    next = after > 0 ? next.map(bonus => (bonus === cd ? { ...bonus, amount: after } : bonus)) : next.filter(bonus => bonus !== cd);
    lines.push(`${owner.owned.seal} «${owner.owned.name}»: ${hits} enemigo/s alcanzado/s × ${fmt(per)} → CD ${fmt(cd.amount)} → ${fmt(after)} t.${after <= 0 ? ' · el escudo vuelve' : ''}`);
  }
  return lines.length ? { bonuses: next, lines } : null;
}
