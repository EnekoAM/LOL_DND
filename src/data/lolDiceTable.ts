/**
 * Conversi\u00f3n AD / AP del LoL \u2192 dados (regla de Eneko, 18-11-2026). Todo en d6:
 * - AD: 1d6 cada 15 de AD. Lo que sobra (0-14): 0-4 nada, 5-9 +1d2, 10-14 +1d4.
 * - AP: 1d6 cada 20 de AP. Lo que sobra (0-19): 0-6 nada, 7-13 +1d2, 14-19 +1d4.
 * Sin ning\u00fan d6 queda solo el dado peque\u00f1o (o 0). Al subir de tramo el m\u00ednimo y la media nunca bajan.
 * Ejemplos: 80 AD = 5d6+1d2, 85 AD = 5d6+1d4, 90 AD = 6d6; 205 AP = 10d6.
 */

export type LolDiceStat = 'ad' | 'ap';

/** per: valor del LoL que vale 1d6; d2 / d4: desde cu\u00e1nto de lo que sobra se suma +1d2 / +1d4. */
const RULES: Record<LolDiceStat, { per: number; d2: number; d4: number }> = {
  ad: { per: 15, d2: 5, d4: 10 },
  ap: { per: 20, d2: 7, d4: 14 },
};

export type LolDiceTerm = { count: number; faces: number };

export type LolDice = {
  /** Dados de mayor a menor, p. ej. [{ count: 5, faces: 6 }, { count: 1, faces: 2 }]. Vac\u00edo = 0. */
  terms: LolDiceTerm[];
  /** N\u00famero total de dados (0 = sin dados: el texto es "0"). */
  dice: number;
  /** "5d6+1d2", "4d6", "1d4" o "0". */
  text: string;
  mean: number;
  /** Valor del LoL que vale 1d6 (15 AD / 20 AP). */
  per: number;
  stat: LolDiceStat;
};

/** AD / AP del LoL \u2192 dados d6 seg\u00fan la regla. null si el valor no es v\u00e1lido. */
export function lolToDice(stat: LolDiceStat, value: number): LolDice | null {
  if (!Number.isFinite(value) || value < 0) return null;
  const rule = RULES[stat];
  const n = Math.floor(value / rule.per);
  const rest = value - n * rule.per;
  const terms: LolDiceTerm[] = [];
  if (n > 0) terms.push({ count: n, faces: 6 });
  if (rest >= rule.d4) terms.push({ count: 1, faces: 4 });
  else if (rest >= rule.d2) terms.push({ count: 1, faces: 2 });
  const text = terms.length ? terms.map(term => `${term.count}d${term.faces}`).join('+') : '0';
  const mean = terms.reduce((sum, term) => sum + term.count * (term.faces + 1) / 2, 0);
  const dice = terms.reduce((sum, term) => sum + term.count, 0);
  return { terms, dice, text, mean, per: rule.per, stat };
}

/** Texto corto para el editor: "5d6+1d2 (15 AD = 1d6)". */
export function lolDiceNote(result: LolDice): string {
  return `${result.text} (${result.per} ${result.stat.toUpperCase()} = 1d6)`;
}

/** Compact a dice text to match lolToDice output ("4d6+1d4"). */
export function compactLolDiceText(text: string): string {
  return text.trim().replace(/\s+/g, '').toLowerCase();
}

/**
 * Invert lolToDice: Nd6 -> per*N, +1d2 -> d2 remainder, +1d4 -> d4 remainder.
 * Accepts only the official form (d6 first, then optional +1d2 / +1d4, or 1d2 / 1d4 / 0).
 * Returns null if the text is old-format or otherwise not invertible.
 */
export function invertLolDice(stat: LolDiceStat, text: string): number | null {
  const t = compactLolDiceText(text);
  if (!t || t === '-') return null;
  if (t === '0') return 0;
  const rule = RULES[stat];
  const small = t.match(/^1d([24])$/);
  if (small) {
    if (small[1] === '2') return rule.d2;
    if (small[1] === '4') return rule.d4;
    return null;
  }
  const match = t.match(/^(\d+)d6(?:\+1d([24]))?$/);
  if (!match) return null;
  const n = Number(match[1]);
  if (!Number.isInteger(n) || n <= 0) return null;
  let value = n * rule.per;
  if (match[2] === '2') value += rule.d2;
  else if (match[2] === '4') value += rule.d4;
  return value;
}

export function isLolDiceText(stat: LolDiceStat, text: string): boolean {
  return invertLolDice(stat, text) !== null;
}
