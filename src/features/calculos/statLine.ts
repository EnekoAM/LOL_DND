/** Columnas de la ficha, en el orden de la hoja de Zeraf. */
export const STAT_COLUMNS = [
  { key: 'hp', label: 'HP', title: 'HP' },
  { key: 'ac', label: 'AC', title: 'AC' },
  { key: 'mr', label: 'MR', title: 'MR' },
  { key: 'mana', label: 'MANA', title: 'Maná' },
  { key: 'ad', label: 'AD', title: 'Daño de ataque' },
  { key: 'ap', label: 'AP', title: 'Poder de habilidad' },
  { key: 'critChance', label: 'PROB. CRÍT.', title: 'Probabilidad de crítico' },
  { key: 'critDamage', label: 'DAÑO CRÍT.', title: 'Daño crítico' },
  { key: 'spe', label: 'SPE', title: 'Velocidad' },
  { key: 'atkSpe', label: 'ATK_SPE', title: 'Velocidad de ataque' },
  { key: 'atkSpePct', label: 'ATK_SPE_%', title: 'Velocidad de ataque %' },
  { key: 'abSpe', label: 'AB_SPE', title: 'Velocidad de habilidad' },
  { key: 'abSpePct', label: 'AB_SPE_%', title: 'Velocidad de habilidad %' },
  { key: 'lethality', label: 'LETALIDAD', title: 'Letalidad' },
  { key: 'magicPen', label: 'PEN. MÁG.', title: 'Penetración mágica' },
] as const;

export type StatKey = (typeof STAT_COLUMNS)[number]['key'];

/** Número plano, o dados como "2d4+2d2". */
export type StatValue = number | string;

export type StatLine = Record<StatKey, StatValue>;

/** Claves de ítem (items.json) que entran en la ficha. Los ítems no traen ATK_SPE ni AB_SPE planos. */
const ITEM_STAT_KEYS: Record<string, StatKey> = {
  HP: 'hp',
  AC: 'ac',
  MR: 'mr',
  MANA: 'mana',
  AD: 'ad',
  AP: 'ap',
  CRIT_CHANCE: 'critChance',
  CRIT_DAMAGE: 'critDamage',
  SPE: 'spe',
  ATK_SPE_PCT: 'atkSpePct',
  AB_SPE_PCT: 'abSpePct',
  LETHALITY: 'lethality',
  MAGIC_PEN: 'magicPen',
};

export function emptyStatLine(): StatLine {
  return {
    hp: 0,
    ac: 0,
    mr: 0,
    mana: 0,
    ad: 0,
    ap: 0,
    critChance: 0,
    critDamage: 0,
    spe: 0,
    atkSpe: 0,
    atkSpePct: 0,
    abSpe: 0,
    abSpePct: 0,
    lethality: 0,
    magicPen: 0,
  };
}

export function itemStatLine(stats: Record<string, StatValue>): StatLine {
  const line = emptyStatLine();
  for (const [key, value] of Object.entries(stats)) {
    const stat = ITEM_STAT_KEYS[key];
    if (stat) line[stat] = value;
  }
  return line;
}

type ParsedAmount = { dice: Map<number, number>; flat: number };

function parseAmount(value: StatValue): ParsedAmount {
  if (typeof value === 'number') return { dice: new Map(), flat: Number.isFinite(value) ? value : 0 };

  const text = value.trim().replace(',', '.');
  if (!text || text === '-') return { dice: new Map(), flat: 0 };

  const dice = new Map<number, number>();
  const withoutDice = text.replace(/(\d+)d(\d+)/gi, (_, count: string, faces: string) => {
    const face = Number(faces);
    dice.set(face, (dice.get(face) ?? 0) + Number(count));
    return '';
  });

  if (dice.size === 0) {
    const amount = Number(withoutDice);
    return { dice, flat: Number.isFinite(amount) ? amount : 0 };
  }

  const flat = (withoutDice.match(/[+-]?\d+(?:\.\d+)?/g) ?? [])
    .reduce((sum, part) => sum + Number(part), 0);
  return { dice, flat };
}

function addAmounts(left: ParsedAmount, right: ParsedAmount): ParsedAmount {
  const dice = new Map(left.dice);
  for (const [faces, count] of right.dice) dice.set(faces, (dice.get(faces) ?? 0) + count);
  return { dice, flat: left.flat + right.flat };
}

function formatAmount({ dice, flat }: ParsedAmount): StatValue {
  const terms = [...dice.entries()]
    .filter(([, count]) => count !== 0)
    .sort((a, b) => a[0] - b[0])
    .map(([faces, count]) => `${count}d${faces}`);

  if (terms.length === 0) return Object.is(flat, -0) ? 0 : flat;
  if (flat === 0) return terms.join('+');
  return [...terms, String(flat)].join('+').replace(/\+\-/g, '-');
}

export function sumStatLines(lines: StatLine[]): StatLine {
  const total = emptyStatLine();
  for (const key of STAT_COLUMNS.map(column => column.key)) {
    total[key] = formatAmount(lines.reduce((sum, line) => addAmounts(sum, parseAmount(line[key])), parseAmount(0)));
  }
  return total;
}

export function formatStat(value: StatValue): string {
  if (typeof value === 'number') return Number.isFinite(value) ? String(value).replace('.', ',') : '—';
  return value.trim() || '—';
}

export function isZeroStat(value: StatValue): boolean {
  if (typeof value === 'number') return value === 0;
  const text = value.trim();
  return text === '' || text === '0' || text === '-';
}
