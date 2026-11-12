import { fmt } from './combatResult';

/**
 * Resistencia efectiva (CA o RM) tras penetraciones, sin redondear: primero la penetración % y luego la plana
 * (letalidad / pen. mágica). La resistencia ya trae las reducciones del objetivo (p. ej. Carve), que van antes.
 * Aún no hay fórmula de reducción de daño: esto solo se enseña en la consola.
 */
export function effectiveResist(targetResist: number, penPct: number, flatPen: number): number {
  return Math.max(0, targetResist * (1 - penPct / 100) - flatPen);
}

const num = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
};
const round = (value: number) => Math.round(value * 1000) / 1000;

/**
 * Línea de consola: «CA efectiva de Zerav: 10 → ×(1−18%) = 8,2 → −3 letalidad = 5,2 (sin reducción de daño todavía)».
 * attacker: stats totales del atacante (armorPenPct / lethality o magicPenPct / magicPen).
 */
export function effectiveResistLine(kind: 'physical' | 'magic', targetName: string, targetResist: number, attacker: Record<string, unknown>): string {
  const physical = kind === 'physical';
  const pct = num(physical ? attacker.armorPenPct : attacker.magicPenPct);
  const flat = num(physical ? attacker.lethality : attacker.magicPen);
  const afterPct = targetResist * (1 - pct / 100);
  const result = effectiveResist(targetResist, pct, flat);
  const parts = [`${physical ? 'CA' : 'RM'} efectiva de ${targetName}: ${fmt(round(targetResist))}`];
  if (pct) parts.push(`×(1−${fmt(pct)}%) = ${fmt(round(afterPct))}`);
  if (flat) parts.push(`−${fmt(flat)} ${physical ? 'letalidad' : 'pen. mágica'} = ${fmt(round(result))}${afterPct - flat < 0 ? ' (mín. 0)' : ''}`);
  if (!pct && !flat) parts.push(`sin penetración = ${fmt(round(result))}`);
  return `${parts.join(' → ')} (con sus reducciones; sin reducción de daño todavía)`;
}

/** Tirada para impactar: d20 ≥ resistencia efectiva (hacia arriba, mínimo 1). */
export const hitNeeded = (effective: number): number => Math.max(1, Math.ceil(effective - 1e-9));

/** Prob. de crítico en caras de d20 (3 = 15%) → segunda tirada d20 ≥ 21 − caras. ≤ 0: sin tirada; ≥ 20: automático. */
export function critNeeded(faces: number): number | 'auto' | null {
  if (!(faces > 0)) return null;
  if (faces >= 20) return 'auto';
  return Math.max(2, Math.min(20, Math.ceil(21 - faces - 1e-9)));
}

/**
 * Líneas de consola de la tirada (los dados los tiran los players; la app solo guía):
 * «Impacto: d20 ≥ N contra CA efectiva X», «20 natural = crítico automático», «Crítico: segundo d20 ≥ M (prob. crít. V caras)».
 */
export function hitRollLines(kind: 'physical' | 'magic', targetName: string, targetResist: number, attacker: Record<string, unknown>): string[] {
  const physical = kind === 'physical';
  const pct = num(physical ? attacker.armorPenPct : attacker.magicPenPct);
  const flat = num(physical ? attacker.lethality : attacker.magicPen);
  const effective = effectiveResist(targetResist, pct, flat);
  const needed = hitNeeded(effective);
  const lines = [`Impacto (${targetName}): d20 ≥ ${needed} contra ${physical ? 'CA' : 'RM'} efectiva ${fmt(round(effective))}${needed > 20 ? (physical ? ' (solo con un 20 natural)' : ' (no llega con un d20)') : ''}`];
  if (physical) {
    lines.push('20 natural = crítico automático');
    const critFaces = num(attacker.critChance);
    const crit = critNeeded(critFaces);
    if (crit === 'auto') lines.push(`Crítico: automático si impacta (prob. crít. ${fmt(critFaces)} caras)`);
    else if (crit !== null) lines.push(`Crítico: si impacta sin 20 natural, segundo d20 ≥ ${crit} (prob. crít. ${fmt(critFaces)} caras)`);
  }
  return lines;
}

/**
 * Multiplicador de crítico = stat DAÑO CRÍT del atacante (multiplicador total: 1,5 de base en los roles + 0,4 de ítems = 1,9).
 * Sin dato o ≤ 1: 1,5.
 */
export function critMultiplier(attacker: Record<string, unknown>): number {
  const value = num(attacker.critDamage);
  return value > 1 ? value : 1.5;
}
