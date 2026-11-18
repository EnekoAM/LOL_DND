/**
 * LoL AD/AP carried on a StatLine without putting the raw LoL number in the line
 * (that would be treated as leftover dice/flats). playerTotalLine reads this and
 * adds it to the LoL sum before the single lolToDice conversion.
 * WeakMap: identity of the line object must be kept until playerTotalLine reads it.
 */
import type { StatLine } from '../features/calculos/statLine';

export type LolStatBonus = { ad?: number; ap?: number };

const extras = new WeakMap<StatLine, LolStatBonus>();

export function withLolStatBonus(line: StatLine, bonus: LolStatBonus): StatLine {
  const prev = extras.get(line) ?? {};
  const next: LolStatBonus = { ...prev };
  if (typeof bonus.ad === 'number' && Number.isFinite(bonus.ad)) next.ad = (next.ad ?? 0) + bonus.ad;
  if (typeof bonus.ap === 'number' && Number.isFinite(bonus.ap)) next.ap = (next.ap ?? 0) + bonus.ap;
  extras.set(line, next);
  return line;
}

export function lolStatBonusOf(line: StatLine): LolStatBonus | undefined {
  return extras.get(line);
}
