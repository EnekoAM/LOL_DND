/**
 * Tabla de conversi\u00f3n LoL \u2192 dados de Eneko (hoja \u00abItems AD\u00bb / \u00abItems AP\u00bb, 17-11-2026).
 * Cada fila: [valor del LoL, n\u00ba de dados, caras, bono]. 0 dados / 0 caras = valor fijo (el bono).
 * Conversi\u00f3n: valor exacto \u2192 sus dados; dentro del rango \u2192 el valor m\u00e1s cercano (empate: el menor);
 * fuera del rango \u2192 su pendiente (AD: media = (AD \u2212 5) / 5; AP: media = (AP \u2212 10) / 6,5) y los dados cuya media se acerca m\u00e1s.
 */

export type LolDiceStat = 'ad' | 'ap';
type Row = [number, number, number, number];

const AD_TABLE: Row[] = [
  [7, 0, 0, 1],
  [8, 0, 0, 1],
  [10, 1, 2, 0],
  [15, 1, 2, 0],
  [20, 2, 2, 0],
  [25, 2, 2, 1],
  [30, 2, 4, 0],
  [35, 2, 4, 1],
  [36, 2, 4, 1],
  [40, 2, 6, 0],
  [45, 2, 6, 1],
  [50, 2, 8, 0],
  [55, 2, 6, 3],
  [60, 2, 8, 2],
  [65, 4, 4, 2],
  [75, 2, 10, 3],
  [80, 4, 6, 1],
];

const AP_TABLE: Row[] = [
  [15, 0, 0, 1],
  [18, 0, 0, 1],
  [20, 1, 2, 0],
  [25, 1, 2, 1],
  [30, 2, 2, 0],
  [35, 1, 4, 1],
  [40, 1, 6, 1],
  [45, 2, 4, 0],
  [50, 1, 8, 2],
  [60, 2, 4, 3],
  [65, 3, 4, 1],
  [70, 2, 6, 2],
  [75, 4, 4, 0],
  [80, 3, 6, 0],
  [85, 2, 8, 2],
  [90, 4, 4, 2],
  [95, 2, 6, 6],
  [100, 4, 6, 0],
  [105, 3, 8, 1],
  [110, 2, 10, 4],
  [115, 4, 4, 6],
  [130, 3, 10, 2],
  [300, 8, 10, 1],
];

const TABLES: Record<LolDiceStat, Row[]> = { ad: AD_TABLE, ap: AP_TABLE };
const SLOPE: Record<LolDiceStat, (value: number) => number> = {
  ad: value => (value - 5) / 5,
  ap: value => (value - 10) / 6.5,
};

export type LolDice = {
  dice: number;
  faces: number;
  bonus: number;
  /** "2d6+1", o "1" si es un valor fijo. */
  text: string;
  mean: number;
  /** exact = est\u00e1 en la tabla; nearest = valor m\u00e1s cercano de la tabla (from); slope = fuera de la tabla, por la pendiente. */
  how: 'exact' | 'nearest' | 'slope';
  from?: number;
};

const diceText = (dice: number, faces: number, bonus: number): string =>
  dice > 0 && faces > 0 ? `${dice}d${faces}${bonus > 0 ? `+${bonus}` : bonus < 0 ? String(bonus) : ''}` : String(bonus);

const make = (dice: number, faces: number, bonus: number, how: LolDice['how'], from?: number): LolDice => ({
  dice, faces, bonus, text: diceText(dice, faces, bonus), mean: dice * (faces + 1) / 2 + bonus, how, ...(from !== undefined ? { from } : {}),
});

/** Dados cuya media se acerca m\u00e1s a target (d2-d10, hasta 12 dados, bono 0-6; empate: menos dados y menos bono). */
function diceForMean(target: number): Omit<LolDice, 'how'> {
  if (target < 1.5) { const flat = Math.max(0, Math.round(target)); return { dice: 0, faces: 0, bonus: flat, text: String(flat), mean: flat }; }
  let best = { dice: 0, faces: 0, bonus: Math.round(target), err: Math.abs(Math.round(target) - target) + 1 };
  for (const faces of [2, 4, 6, 8, 10]) {
    for (let dice = 1; dice <= 12; dice += 1) {
      for (let bonus = 0; bonus <= 6; bonus += 1) {
        const err = Math.abs(dice * (faces + 1) / 2 + bonus - target);
        const better = err < best.err - 1e-9 || (Math.abs(err - best.err) < 1e-9 && (dice < best.dice || (dice === best.dice && bonus < best.bonus)));
        if (better) best = { dice, faces, bonus, err };
      }
    }
  }
  return { dice: best.dice, faces: best.faces, bonus: best.bonus, text: diceText(best.dice, best.faces, best.bonus), mean: best.dice * (best.faces + 1) / 2 + best.bonus };
}

/** AD / AP del LoL \u2192 dados seg\u00fan la tabla. null si el valor no es v\u00e1lido. */
export function lolToDice(stat: LolDiceStat, value: number): LolDice | null {
  if (!Number.isFinite(value) || value < 0) return null;
  const table = TABLES[stat];
  const exact = table.find(row => row[0] === value);
  if (exact) return make(exact[1], exact[2], exact[3], 'exact');
  const min = table[0][0];
  const max = table[table.length - 1][0];
  if (value > min && value < max) {
    let best = table[0];
    for (const row of table) if (Math.abs(row[0] - value) < Math.abs(best[0] - value)) best = row;
    return make(best[1], best[2], best[3], 'nearest', best[0]);
  }
  return { ...diceForMean(SLOPE[stat](value)), how: 'slope' };
}

/** Texto corto para el editor: "2d6+1 (tabla)", "2d6 (como 40)", "3d10+4 (pendiente)". */
export function lolDiceNote(result: LolDice): string {
  return result.how === 'exact' ? `${result.text} (tabla)` : result.how === 'nearest' ? `${result.text} (como ${result.from})` : `${result.text} (pendiente)`;
}
