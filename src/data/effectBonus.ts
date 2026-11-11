import { STAT_COLUMNS, formatStat } from '../features/calculos/statLine';

/**
 * Configurador de bonus de los efectos con nombre de los ítems (pasivas/activas): reglas que da cada
 * efecto o variante en combate. Se guarda en namedEffectDescriptions.bonus (lo escribe el admin).
 * Una variante sin config propia usa la del efecto base. La exclusividad es por efecto base.
 *
 * Tiempos: la wiki va en segundos; aquí en turnos con 1 turno ≈ 2 s, redondeando hacia arriba y
 * mínimo 1 (Hoja encantada: 10 s de ventana → 5 turnos; CD 1,5 s → 1 turno).
 */

export const EFFECT_TRIGGERS = [
  { id: 'always', label: 'Siempre (mientras lo lleve)' },
  { id: 'on-hit', label: 'Al impactar (AA)' },
  { id: 'after-ability', label: 'Tras habilidad: siguiente AA' },
  { id: 'on-ability-hit', label: 'Al acertar una habilidad' },
  { id: 'on-use', label: 'Al usar (activa)' },
  { id: 'on-takedown', label: 'Al matar / asistir' },
  { id: 'hp-below', label: 'Vida por debajo de X%' },
  { id: 'on-damage-taken', label: 'Al recibir daño' },
  { id: 'on-attacked', label: 'Al recibir un AA' },
  { id: 'each-turn', label: 'Cada turno' },
] as const;
export type EffectTrigger = (typeof EFFECT_TRIGGERS)[number]['id'];

export const EFFECT_RULE_KINDS = [
  { id: 'stat', label: 'Bonus de stat' },
  { id: 'damage', label: 'Daño extra' },
  { id: 'heal', label: 'Curación' },
  { id: 'shield', label: 'Escudo' },
  { id: 'mana', label: 'Recupera maná' },
  { id: 'slow', label: 'Ralentización' },
  { id: 'status', label: 'Estado al objetivo' },
  { id: 'extra-on-hit', label: 'Efectos al impactar extra' },
  { id: 'attack-speed', label: 'Velocidad de ataque' },
  { id: 'move-speed', label: 'Velocidad de movimiento' },
] as const;
export type EffectRuleKind = (typeof EFFECT_RULE_KINDS)[number]['id'];

/** Stats de las que puede escalar una fórmula (las «target*» son del objetivo). */
export const SCALING_STATS = [
  { id: 'baseAd', label: 'AD base' },
  { id: 'ad', label: 'AD total' },
  { id: 'bonusAd', label: 'AD extra' },
  { id: 'ap', label: 'AP' },
  { id: 'hp', label: 'Vida máx.' },
  { id: 'bonusHp', label: 'Vida extra' },
  { id: 'mana', label: 'Maná máx.' },
  { id: 'bonusMana', label: 'Maná extra' },
  { id: 'armor', label: 'Armadura (CA)' },
  { id: 'bonusArmor', label: 'Armadura extra' },
  { id: 'mr', label: 'MR' },
  { id: 'bonusMr', label: 'MR extra' },
  { id: 'critChance', label: 'Prob. crítico' },
  { id: 'manaRegen', label: 'Regen. maná' },
  { id: 'level', label: 'Nivel' },
  { id: 'targetMaxHp', label: 'Vida máx. del objetivo' },
  { id: 'targetCurrentHp', label: 'Vida actual del objetivo' },
  { id: 'targetMissingHp', label: 'Vida perdida del objetivo' },
  { id: 'targetArmor', label: 'Armadura (CA) del objetivo' },
  { id: 'targetMr', label: 'MR del objetivo' },
] as const;
export type ScalingStat = (typeof SCALING_STATS)[number]['id'];

export const DAMAGE_TYPES = [
  { id: 'physical', label: 'físico' },
  { id: 'magic', label: 'mágico' },
  { id: 'true', label: 'verdadero' },
] as const;
export type EffectDamageType = (typeof DAMAGE_TYPES)[number]['id'];

export const CD_START_MODES = [
  { id: 'on-activate', label: 'al activarse' },
  { id: 'on-end', label: 'al terminar' },
] as const;
export type CdStartMode = (typeof CD_START_MODES)[number]['id'];

/** Ratio: pct % de una stat (40 = 40%). */
export type EffectRatio = { stat: ScalingStat; pct: number };

export type EffectRule = {
  trigger: EffectTrigger;
  kind: EffectRuleKind;
  /** A quién: al portador (por defecto) o a los objetivos golpeados (debuffs de stat). */
  appliesTo?: 'self' | 'target';
  /** Stat que sube (kind stat). attack-speed / move-speed usan ATK spe % / SPE. */
  stat?: string;
  flat?: number;
  ratios?: EffectRatio[];
  /** Valor plano por nivel (1-20); si está, sustituye a flat según el nivel. */
  perLevel?: number[];
  damageType?: EffectDamageType;
  /** Ralentización %, o nombre del estado (kind status). */
  slowPct?: number;
  statusName?: string;
  /** Veces extra que se aplican los efectos al impactar (kind extra-on-hit). */
  count?: number;
  /** Umbral de vida (trigger hp-below). */
  hpBelowPct?: number;
  /** Turnos que dura (bonus de stat, estado, ralentización…); vacío = lo del efecto. */
  duration?: number;
  /** Acumulaciones máximas (bonus de stat). */
  maxStacks?: number;
  /** Solo contra campeones, solo melee… (texto libre). */
  note?: string;
};

export type EffectBonusConfig = {
  /** Enfriamiento en turnos (por efecto base y participante). */
  cooldown?: number;
  /** Duración del efecto en turnos (p. ej. ventana de Hoja encantada). */
  duration?: number;
  /** Cuándo empieza el CD: al activarse o al terminar el efecto (Hoja encantada: al usar el AA potenciado). */
  cdStart?: CdStartMode;
  rules: EffectRule[];
};

export const MAX_EFFECT_RULES = 12;

const label = <T extends { id: string; label: string }>(list: readonly T[], id: string | undefined): string =>
  list.find(entry => entry.id === id)?.label ?? id ?? '';

export const triggerLabel = (id: string | undefined) => label(EFFECT_TRIGGERS, id);
export const scalingLabel = (id: string | undefined) => label(SCALING_STATS, id);
export const damageTypeLabel = (id: string | undefined) => label(DAMAGE_TYPES, id);
export const statLabel = (key: string | undefined): string => STAT_COLUMNS.find(column => column.key === key)?.title ?? key ?? '';

const num = (value: number): string => formatStat(Math.round(value * 1000) / 1000);

/** «100% AD base + 45% AP» (o «5»). */
export function formulaText(rule: Pick<EffectRule, 'flat' | 'ratios' | 'perLevel'>): string {
  const parts: string[] = [];
  if (rule.perLevel?.length) parts.push(`${rule.perLevel.map(num).join('/')} (por nivel)`);
  else if (rule.flat) parts.push(num(rule.flat));
  for (const ratio of rule.ratios ?? []) parts.push(`${num(ratio.pct)}% ${scalingLabel(ratio.stat)}`);
  return parts.join(' + ').replace(/\+ -/g, '− ') || '0';
}

const TRIGGER_SHORT: Record<EffectTrigger, string> = {
  always: 'Siempre',
  'on-hit': 'Al impactar',
  'after-ability': 'Tras habilidad (siguiente AA)',
  'on-ability-hit': 'Al acertar habilidad',
  'on-use': 'Al usar',
  'on-takedown': 'Al matar/asistir',
  'hp-below': 'Vida < X%',
  'on-damage-taken': 'Al recibir daño',
  'on-attacked': 'Al recibir AA',
  'each-turn': 'Cada turno',
};

/** Resumen legible de una regla: «Tras habilidad (siguiente AA): +100% AD base físico». */
export function ruleSummary(rule: EffectRule): string {
  const when = rule.trigger === 'hp-below' ? `Vida < ${num(rule.hpBelowPct ?? 30)}%` : TRIGGER_SHORT[rule.trigger] ?? rule.trigger;
  const amount = formulaText(rule);
  let what: string;
  switch (rule.kind) {
    case 'stat': what = rule.appliesTo === 'target'
      ? `al objetivo ${amount.startsWith('-') ? amount : `+${amount}`} ${statLabel(rule.stat)}${rule.maxStacks ? ' por stack' : ''}`
      : `+${amount} ${statLabel(rule.stat)}`; break;
    case 'attack-speed': what = `${rule.appliesTo === 'target' ? 'al objetivo ' : ''}${amount.startsWith('-') ? amount : `+${amount}`}% vel. ataque`; break;
    case 'move-speed': what = `${rule.appliesTo === 'target' ? 'al objetivo ' : ''}${amount.startsWith('-') ? amount : `+${amount}`} velocidad`; break;
    case 'damage': what = `+${amount} ${damageTypeLabel(rule.damageType ?? 'physical')}`; break;
    case 'heal': what = `cura ${amount}`; break;
    case 'shield': what = `escudo ${amount}`; break;
    case 'mana': what = `recupera ${amount} maná`; break;
    case 'slow': what = `ralentiza ${num(rule.slowPct ?? 0)}%`; break;
    case 'status': what = `aplica ${rule.statusName || 'estado'}`; break;
    case 'extra-on-hit': what = `aplica los efectos al impactar ${rule.count ?? 1} vez${(rule.count ?? 1) === 1 ? '' : 'es'} más`; break;
    default: what = rule.kind;
  }
  const extras = [
    rule.duration ? `${rule.duration} t.` : '',
    rule.maxStacks ? `hasta ×${rule.maxStacks}` : '',
    rule.note ? rule.note : '',
  ].filter(Boolean);
  return `${when}: ${what}${extras.length ? ` (${extras.join(', ')})` : ''}`;
}

/** «CD 1 t. (al terminar) · dura 5 t.» */
export function configTimingText(config: EffectBonusConfig): string {
  return [
    config.cooldown ? `CD ${config.cooldown} t.${config.cdStart === 'on-end' ? ' (al terminar)' : ''}` : '',
    config.duration ? `dura ${config.duration} t.` : '',
  ].filter(Boolean).join(' · ');
}

export function configSummary(config: EffectBonusConfig | undefined): string[] {
  if (!config || config.rules.length === 0) return [];
  const timing = configTimingText(config);
  return [...config.rules.map(ruleSummary), ...(timing ? [timing] : [])];
}

const TRIGGER_IDS = new Set<string>(EFFECT_TRIGGERS.map(entry => entry.id));
const KIND_IDS = new Set<string>(EFFECT_RULE_KINDS.map(entry => entry.id));
const SCALING_IDS = new Set<string>(SCALING_STATS.map(entry => entry.id));
const DAMAGE_IDS = new Set<string>(DAMAGE_TYPES.map(entry => entry.id));

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const turns = (value: unknown): number | undefined => (finite(value) && value >= 1 ? Math.min(99, Math.floor(value)) : undefined);

/** Normaliza lo que llega de la API (descarta lo que no encaje). */
export function normalizeBonusConfig(raw: unknown): EffectBonusConfig | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const source = raw as Record<string, unknown>;
  const rules: EffectRule[] = [];
  for (const entry of Array.isArray(source.rules) ? source.rules : []) {
    if (!entry || typeof entry !== 'object') continue;
    const r = entry as Record<string, unknown>;
    if (typeof r.trigger !== 'string' || !TRIGGER_IDS.has(r.trigger) || typeof r.kind !== 'string' || !KIND_IDS.has(r.kind)) continue;
    const rule: EffectRule = { trigger: r.trigger as EffectTrigger, kind: r.kind as EffectRuleKind };
    if (r.appliesTo === 'target') rule.appliesTo = 'target';
    if (typeof r.stat === 'string') rule.stat = r.stat;
    if (finite(r.flat)) rule.flat = r.flat;
    if (Array.isArray(r.ratios)) {
      const ratios = r.ratios.filter((ratio): ratio is EffectRatio =>
        !!ratio && typeof ratio === 'object' && SCALING_IDS.has((ratio as EffectRatio).stat) && finite((ratio as EffectRatio).pct));
      if (ratios.length) rule.ratios = ratios;
    }
    if (Array.isArray(r.perLevel) && r.perLevel.every(finite) && r.perLevel.length) rule.perLevel = r.perLevel as number[];
    if (typeof r.damageType === 'string' && DAMAGE_IDS.has(r.damageType)) rule.damageType = r.damageType as EffectDamageType;
    if (finite(r.slowPct)) rule.slowPct = r.slowPct;
    if (typeof r.statusName === 'string' && r.statusName.trim()) rule.statusName = r.statusName.trim();
    if (finite(r.count) && r.count >= 1) rule.count = Math.floor(r.count);
    if (finite(r.hpBelowPct)) rule.hpBelowPct = r.hpBelowPct;
    const duration = turns(r.duration);
    if (duration) rule.duration = duration;
    const maxStacks = turns(r.maxStacks);
    if (maxStacks) rule.maxStacks = maxStacks;
    if (typeof r.note === 'string' && r.note.trim()) rule.note = r.note.trim();
    rules.push(rule);
  }
  const config: EffectBonusConfig = { rules };
  const cooldown = turns(source.cooldown);
  if (cooldown) config.cooldown = cooldown;
  const duration = turns(source.duration);
  if (duration) config.duration = duration;
  if (source.cdStart === 'on-end' || source.cdStart === 'on-activate') config.cdStart = source.cdStart;
  return config;
}

/** Estado de una regla que el combate aplica solo (el resto se apunta a mano). */
export const AUTOMATED_TRIGGERS: readonly EffectTrigger[] = ['always', 'on-hit', 'after-ability', 'on-ability-hit', 'on-use', 'on-takedown'];
