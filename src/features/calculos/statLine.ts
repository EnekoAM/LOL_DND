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
  { key: 'atkSpe', label: 'Attacks', title: 'Velocidad de ataque' },
  { key: 'atkSpePct', label: 'ATK spe', title: 'Velocidad de ataque %' },
  { key: 'abSpe', label: 'Abilities', title: 'Velocidad de habilidad' },
  { key: 'abSpePct', label: 'Ab haste', title: 'Velocidad de habilidad %' },
  { key: 'lethality', label: 'LETALIDAD', title: 'Letalidad' },
  { key: 'magicPen', label: 'PEN. MÁG.', title: 'Penetración mágica' },
  { key: 'armorPenPct', label: 'PEN. ARM. %', title: 'Penetración de armadura % (no acumulable: solo cuenta la más alta)' },
  { key: 'magicPenPct', label: 'PEN. MÁG. %', title: 'Penetración mágica % (no acumulable: solo cuenta la más alta)' },
  // Solo las dan los ítems (base 0 en todas las tablas de rol, sin escalar). Los % se suman.
  { key: 'healShieldPct', label: 'CUR/ESC %', title: 'Poder de curación y escudos %' },
  { key: 'healShieldReceivedPct', label: 'CUR/ESC REC. %', title: 'Curación y escudos recibidos % (lo que recibe quien lo tiene; también potencia regeneración de vida, robo de vida y omnisucción)' },
  { key: 'tenacityPct', label: 'TENACIDAD %', title: 'Tenacidad % (se suma)' },
  { key: 'slowResistPct', label: 'RES. RALENT. %', title: 'Resistencia a ralentizaciones % (se suma)' },
  { key: 'lifeStealPct', label: 'ROBO VIDA %', title: 'Robo de vida %' },
  { key: 'omnivampPct', label: 'OMNISUCCIÓN %', title: 'Omnisucción %' },
  { key: 'range', label: 'RANGO', title: 'Rango de ataque' },
  { key: 'healthRegen', label: 'REGEN. VIDA', title: 'Regeneración de vida' },
  { key: 'manaRegen', label: 'REGEN. MANÁ', title: 'Regeneración de maná' },
] as const;

export type StatKey = (typeof STAT_COLUMNS)[number]['key'];

/** Número plano, o dados como "2d4+2d2". */
export type StatValue = number | string;

/** "5d6+1d2", "4d6+1d4+3", "1d2+5d4+1d6+3d8+4" or a plain number. */
export const STAT_AMOUNT_RE = /^(?:[+-]?(?:\d+d\d+|\d+(?:\.\d+)?))(?:[+-](?:\d+d\d+|\d+(?:\.\d+)?))*$/i;

const STAT_AMOUNT_LIMIT = 80;

/** Compact a stat text: trim, drop spaces, commas to dots, "d8" -> "1d8". */
export function compactStatText(text: string): string {
  return text
    .trim()
    .replace(/\s+/g, '')
    .replace(/,/g, '.')
    .replace(/(^|[+-])d(\d+)/gi, '$11d$2');
}

export function isStatAmountText(text: string): boolean {
  const compact = compactStatText(text);
  return compact.length > 0 && compact.length <= STAT_AMOUNT_LIMIT && STAT_AMOUNT_RE.test(compact);
}


export type StatLine = Record<StatKey, StatValue>;

/** Claves de ítem (items.json) que entran en la ficha. Los ítems no traen Attacks ni Abilities planos. */
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
  'ATK spe': 'atkSpePct',
  'Ab haste': 'abSpePct',
  LETHALITY: 'lethality',
  MAGIC_PEN: 'magicPen',
  'Armor pen %': 'armorPenPct',
  'Magic pen %': 'magicPenPct',
  'Heal & shield %': 'healShieldPct',
  'Heal & shield received %': 'healShieldReceivedPct',
  'Tenacity %': 'tenacityPct',
  'Slow resist %': 'slowResistPct',
  'Life steal %': 'lifeStealPct',
  'Omnivamp %': 'omnivampPct',
  'Range': 'range',
  'HP regen': 'healthRegen',
  'Mana regen': 'manaRegen',
};

/** Claves de ítem de las stats que solo dan los ítems; se ofrecen aunque ningún ítem las tenga aún. */
export const ITEM_ONLY_STAT_KEYS = ['Heal & shield %', 'Heal & shield received %', 'Tenacity %', 'Slow resist %', 'Life steal %', 'Omnivamp %', 'Range', 'HP regen', 'Mana regen'] as const;

/**
 * Stats en % que no se acumulan (como las pasivas únicas del LoL): el total es el valor más alto, no la suma.
 */
export const NON_STACKING_STAT_KEYS = ['armorPenPct', 'magicPenPct'] as const;

export function isNonStackingKey(key: StatKey): boolean {
  return (NON_STACKING_STAT_KEYS as readonly string[]).includes(key);
}

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
    armorPenPct: 0,
    magicPenPct: 0,
    healShieldPct: 0,
    healShieldReceivedPct: 0,
    tenacityPct: 0,
    slowResistPct: 0,
    lifeStealPct: 0,
    omnivampPct: 0,
    range: 0,
    healthRegen: 0,
    manaRegen: 0,
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

function parseAmount(value: StatValue | undefined): ParsedAmount {
  if (typeof value === 'number') return { dice: new Map(), flat: Number.isFinite(value) ? value : 0 };
  // Filas antiguas (p. ej. tablas de rol guardadas antes de una stat nueva) pueden no traer la clave.
  if (typeof value !== 'string') return { dice: new Map(), flat: 0 };

  const text = compactStatText(value);
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
    if (isNonStackingKey(key)) {
      total[key] = lines.reduce((best, line) => Math.max(best, parseAmount(line[key]).flat), 0);
      continue;
    }
    total[key] = formatAmount(lines.reduce((sum, line) => addAmounts(sum, parseAmount(line[key])), parseAmount(0)));
  }
  return total;
}

export function formatStat(value: StatValue): string {
  if (typeof value === 'number') return Number.isFinite(value) ? String(value).replace('.', ',') : '—';
  return value.trim() || '—';
}

/** Stats de defensa que contra un d20 solo cuentan enteros (AC/CA y MR). */
export const DEFENSE_STAT_KEYS = ['ac', 'mr'] as const;
export type DefenseStatKey = (typeof DEFENSE_STAT_KEYS)[number];

export function isDefenseKey(key: StatKey): key is DefenseStatKey {
  return key === 'ac' || key === 'mr';
}

/** Número exacto de una defensa (o null si no es numérico). */
export function defenseExact(value: StatValue): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const amount = Number(value.trim().replace(',', '.'));
  return Number.isFinite(amount) ? amount : null;
}

/**
 * Total usable contra d20: suma exacta → redondeo a 2 decimales (ruido float) → entero más cercano (.5 arriba).
 * No redondea ítem a ítem; aplica al total ya sumado. Negativos usan redondeo simétrico (|x|+0.5).
 */
export function roundDefense(value: StatValue): number {
  const exact = defenseExact(value);
  if (exact === null) return 0;
  const cleaned = Math.round(exact * 100) / 100;
  // Math.round(-1.5) === -1 en JS; queremos .5 alejándose de 0 de forma simétrica si hubiera negativos.
  return cleaned >= 0 ? Math.round(cleaned) : -Math.round(-cleaned);
}

/** Texto mostrado + title Exacto si el truncado pierde decimales. */
export function formatDefenseStat(value: StatValue): { text: string; exactTitle?: string } {
  const exact = defenseExact(value);
  if (exact === null) return { text: formatStat(value) };
  const cleaned = Math.round(exact * 100) / 100;
  const rounded = cleaned >= 0 ? Math.round(cleaned) : -Math.round(-cleaned);
  const text = formatStat(rounded);
  if (cleaned === rounded) return { text };
  return { text, exactTitle: `Exacto: ${formatStat(cleaned)}` };
}

/**
 * Defensa efectiva del objetivo contra un atacante:
 * 1) % de penetración sobre la defensa exacta: defensa × (1 − pct/100)
 * 2) resta la penetración plana (letalidad o pen. mágica)
 * 3) redondeo al entero más cercano (.5 arriba), nunca por debajo de 0.
 * `pct` es el más alto de los ítems del atacante (no se suman, ver NON_STACKING_STAT_KEYS).
 */
export function effectiveDefense(targetExact: StatValue, pct: StatValue = 0, flat: StatValue = 0): number {
  const defense = defenseExact(targetExact) ?? 0;
  const percent = Math.min(100, Math.max(0, defenseExact(pct) ?? 0));
  const flatPen = Math.max(0, defenseExact(flat) ?? 0);
  const afterPct = defense * (1 - percent / 100);
  const exact = Math.round((afterPct - flatPen) * 100) / 100;
  return Math.max(0, Math.round(exact));
}

/** Nombre corto de cada stat en los bonus («+20 % vel. de ataque»). */
export const STAT_BONUS_LABEL: Record<StatKey, string> = {
  hp: 'Vida',
  ac: 'Armadura (CA)',
  mr: 'Resistencia mágica (RM)',
  mana: 'Maná',
  ad: 'AD',
  ap: 'AP',
  critChance: '% prob. crítico',
  critDamage: 'Daño crítico',
  spe: 'Velocidad (SPE)',
  atkSpe: 'Ataques',
  atkSpePct: '% vel. de ataque',
  abSpe: 'Habilidades',
  abSpePct: '% vel. de habilidad',
  lethality: 'Letalidad',
  magicPen: 'Pen. mágica',
  armorPenPct: '% pen. armadura',
  magicPenPct: '% pen. mágica',
  healShieldPct: '% curación y escudos',
  healShieldReceivedPct: '% curación y escudos recibidos',
  tenacityPct: '% tenacidad',
  slowResistPct: '% res. ralentización',
  lifeStealPct: '% robo de vida',
  omnivampPct: '% omnisucción',
  range: 'Alcance',
  healthRegen: 'Regen. vida',
  manaRegen: 'Regen. maná',
};

export function isStatLineKey(key: string): key is StatKey {
  return STAT_COLUMNS.some(column => column.key === key);
}

/** «+20 % vel. de ataque», «+2 Alcance»… */
export function formatStatBonus(stat: StatKey, amount: number): string {
  const value = formatStat(Math.round(Math.abs(amount) * 1000) / 1000);
  return `${amount < 0 ? '−' : '+'}${value} ${STAT_BONUS_LABEL[stat]}`;
}

export function isZeroStat(value: StatValue): boolean {
  if (typeof value === 'number') return value === 0;
  const text = value.trim();
  return text === '' || text === '0' || text === '-';
}
