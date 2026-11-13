import { STAT_COLUMNS, formatStat } from '../features/calculos/statLine';
import { milestoneRank } from './abilityRanks';

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
  { id: 'on-attack', label: 'Al auto-atacar (AA)' },
  { id: 'on-hit', label: 'Al aplicar efecto de impacto' },
  { id: 'after-ability', label: 'Tras habilidad: siguiente AA' },
  { id: 'after-use', label: 'Tras usar (activa): siguiente AA' },
  { id: 'on-ability-hit', label: 'Al acertar una habilidad' },
  { id: 'on-use', label: 'Al usar (activa)' },
  { id: 'on-takedown', label: 'Al matar / asistir' },
  { id: 'hp-below', label: 'Vida por debajo de X%' },
  { id: 'on-damage-taken', label: 'Al recibir daño' },
  { id: 'on-attacked', label: 'Al recibir un AA' },
  { id: 'each-turn', label: 'Cada turno' },
  { id: 'energized-max', label: 'Vigor al máximo (100 cargas)' },
  { id: 'on-ultimate-use', label: 'Al usar la R' },
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
  { id: 'extra-on-hit', label: 'Efectos de impacto extra' },
  { id: 'attack-speed', label: 'Velocidad de ataque' },
  { id: 'move-speed', label: 'Velocidad de movimiento' },
  { id: 'vigor', label: 'Vigor extra (cargas)' },
  { id: 'damage-reduction', label: 'Reducción de daño' },
  { id: 'execute', label: 'Ejecutar (vida por debajo de X%)' },
  { id: 'extra-action', label: 'Acción extra' },
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
  { id: 'missingHp', label: 'Vida faltante' },
  { id: 'mana', label: 'Maná máx.' },
  { id: 'bonusMana', label: 'Maná extra' },
  { id: 'armor', label: 'Armadura (CA)' },
  { id: 'bonusArmor', label: 'Armadura extra' },
  { id: 'mr', label: 'MR' },
  { id: 'bonusMr', label: 'MR extra' },
  { id: 'critChance', label: 'Prob. crítico' },
  { id: 'manaRegen', label: 'Regen. maná' },
  { id: 'level', label: 'Nivel' },
  { id: 'spe', label: 'Velocidad' },
  { id: 'targetMaxHp', label: 'Vida máx. del objetivo' },
  { id: 'targetCurrentHp', label: 'Vida actual del objetivo' },
  { id: 'targetMissingHp', label: 'Vida faltante del objetivo' },
  { id: 'targetArmor', label: 'Armadura (CA) del objetivo' },
  { id: 'targetMr', label: 'MR del objetivo' },
  { id: 'targetSpe', label: 'Velocidad del objetivo' },
  { id: 'lethality', label: 'Letalidad' },
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
  /**
   * A quién. Stats / curación / escudo: portador por defecto. Daño / ralentización / estado: objetivo por defecto.
   * area = objetivo + cercanos; nearby = solo los cercanos (no el objetivo principal);
   * allies = aliados elegidos (el portador puede ir incluido); self en un estado = al portador.
   */
  appliesTo?: RuleAppliesTo;
  /** Por nivel: con 'target', el valor sale del nivel de cada objetivo (aliado o enemigo), no del portador. */
  levelFrom?: 'target';
  /** Daño: cura al portador el daño hecho × su robo de vida % (Hidra voraz). */
  lifeSteal?: boolean;
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
  /** Umbral de vida (trigger hp-below, o del portador). */
  hpBelowPct?: number;
  /** Solo si el objetivo está por debajo de este % de vida (execute, estados…). */
  targetHpBelowPct?: number;
  /** Tras hacer daño: cura al portador ese % del daño infligido. */
  healFromDealtPct?: number;
  /** Al recibir daño: recupera (kind mana/heal) este % del daño recibido. */
  fromDamagePct?: number;
  /** Reducción de daño: contra AA o contra todo. */
  vs?: 'aa' | 'all';
  /** Acción extra (kind extra-action): p. ej. «ability». */
  action?: string;
  /** Dados de daño (p. ej. «4d10+13», «2d2»). Se tiran al aplicar. */
  dice?: string;
  /** Solo se aplica cada N disparos (contador; si perTargetCounter, uno por objetivo). */
  everyN?: number;
  /** El contador (everyN / cargas hasta el máximo) va por objetivo. */
  perTargetCounter?: boolean;
  /** El daño aumenta hasta este % según la vida faltante del objetivo (75 = hasta +75 %). */
  missingHpScalePct?: number;
  /** Solo se aplica al llegar a máx. stacks (luego se reinician y puede empezar el CD). */
  triggerAtMax?: boolean;
  /** Solo si otra regla del mismo efecto está al máximo de stacks (p. ej. 3er AA de Guinsoo). */
  requiresMaxStacks?: boolean;
  /** Se aplica dentro de N turnos (cura/escudo/daño pendientes). */
  delayTurns?: number;
  /** Tras N turnos, el escudo baja a la mitad de lo concedido. */
  halfAfterTurns?: number;
  /** Cura este % del maná gastado (al usar habilidad). */
  fromManaSpentPct?: number;
  /** Crítico a esta % de potencia (20 = 20 % del daño crít. extra) si se marca crít. */
  critPotencyPct?: number;
  /** Daño de zona: se repite cada turno del portador mientras duren las marcas. */
  pulseEachTurn?: boolean;
  /** Este estado es un escudo de hechizos rompible. */
  spellShield?: boolean;
  /** El CD del efecto solo empieza cuando esta regla llega a aplicarse (proc). */
  cooldownOnProc?: boolean;
  /** Turnos sin ser visto para armar el siguiente AA. */
  unseenTurns?: number;
  /** Tras ser visto, el AA armado dura estos turnos. */
  armedTurnsAfterSeen?: number;
  /** Alcance de aura en casillas (si no hay posiciones, se aplica al golpear). */
  auraRange?: number;
  /** Los enemigos inmovilizados / con este estado reciben este % más de daño. */
  damageAmpPct?: number;
  /** Turnos que dura (bonus de stat, estado, ralentización…); vacío = lo del efecto. */
  duration?: number;
  /** Acumulaciones máximas (bonus de stat). */
  maxStacks?: number;
  /**
   * «Cargas permanentes» (bonus de stat al portador): cada disparo suma 1 carga en la ficha del personaje
   * (players.stacks effect:<efecto base>, hasta maxStacks); siguen entre combates y sin el ítem. El bonus
   * (valor × cargas) solo suma con el ítem equipado. Ignora «Dura». Campeones / NPCs: bonus sin turnos en ese combate.
   */
  permanent?: boolean;
  /** Solo si el portador es cuerpo a cuerpo (rango total 1) o a distancia (cualquier otro rango); vacío = siempre. */
  onlyIf?: RuleRangeCondition;
  /** Solo contra campeones, una vez por turno… (texto libre). */
  note?: string;
};

export type RuleAppliesTo = 'self' | 'target' | 'area' | 'nearby' | 'allies';
/** Tipos de regla que por defecto van al objetivo (el resto, al portador). */
export const TARGET_DEFAULT_KINDS: readonly string[] = ['damage', 'slow', 'status', 'execute'];
/** A quién puede ir cada tipo de regla (el primero es el de por defecto). */
export function appliesToOptions(kind: string): { id: RuleAppliesTo; label: string }[] {
  const debuff = [{ id: 'target', label: 'Objetivo' }, { id: 'area', label: 'Objetivo + cercanos' }, { id: 'nearby', label: 'Solo cercanos (no el principal)' }] as const;
  switch (kind) {
    case 'stat': case 'attack-speed': case 'move-speed':
      return [{ id: 'self', label: 'Portador' }, { id: 'allies', label: 'Aliados' }, { id: 'target', label: 'Objetivo (debuff)' }, { id: 'area', label: 'Objetivo + cercanos (debuff)' }, { id: 'nearby', label: 'Solo cercanos (debuff)' }];
    case 'heal': case 'shield':
      return [{ id: 'self', label: 'Portador' }, { id: 'allies', label: 'Aliados' }];
    case 'damage': case 'slow':
      return [...debuff];
    case 'status':
      return [...debuff, { id: 'self', label: 'Portador' }, { id: 'allies', label: 'Aliados' }];
    case 'execute':
      return [...debuff];
    default:
      return [{ id: 'self', label: 'Portador' }];
  }
}
/** A quién va la regla (con el valor por defecto de su tipo). */
export const ruleAppliesTo = (rule: Pick<EffectRule, 'appliesTo' | 'kind'>): RuleAppliesTo =>
  rule.appliesTo ?? (TARGET_DEFAULT_KINDS.includes(rule.kind) ? 'target' : 'self');

/** Condición «Solo si» de una regla: cuerpo a cuerpo = rango de ataque total 1; a distancia = cualquier otro (también 0). */
export type RuleRangeCondition = 'melee' | 'ranged';
export const RULE_RANGE_CONDITIONS = [
  { id: 'melee', label: 'Solo cuerpo a cuerpo', short: 'cuerpo a cuerpo' },
  { id: 'ranged', label: 'Solo a distancia', short: 'a distancia' },
] as const;
/** Rango de ataque total 1 = cuerpo a cuerpo; cualquier otro valor (0 incluido) = a distancia. */
export const isMeleeRange = (range: number): boolean => range === 1;
export const rangeTypeLabel = (melee: boolean): string => (melee ? 'Cuerpo a cuerpo' : 'A distancia');
/** ¿La regla vale para un portador cuerpo a cuerpo / a distancia? */
export const ruleMatchesRange = (rule: Pick<EffectRule, 'onlyIf'>, melee: boolean): boolean =>
  !rule.onlyIf || (rule.onlyIf === 'melee') === melee;
export const rangeConditionShort = (condition: RuleRangeCondition | undefined): string =>
  RULE_RANGE_CONDITIONS.find(entry => entry.id === condition)?.short ?? '';

export type EffectBonusConfig = {
  /** Enfriamiento en turnos (por efecto base y participante). */
  cooldown?: number;
  /** CD por tramo de nivel del portador (1–5 / 6–10 / 11–15 / 16–20); si está, manda sobre cooldown. */
  cooldownByLevel?: number[];
  /** Duración del efecto en turnos (p. ej. ventana de Hoja encantada). */
  duration?: number;
  /** Cuándo empieza el CD: al activarse o al terminar el efecto (Hoja encantada: al usar el AA potenciado). */
  cdStart?: CdStartMode;
  /** Vigor: las habilidades que golpean también descargan el Vigor al máximo (Espada ciclovoltaica). */
  abilityDischarge?: boolean;
  /** Vigor al máximo: encadena a N objetivos (1-10; ausente = 1). */
  chainTargets?: number;
  /** Enfriamiento por objetivo: el CD se pone en el objetivo golpeado (cada objetivo tiene su marca), no en el portador. */
  perTargetCooldown?: boolean;
  /** Al usar: máximo de objetivos enemigos (1-20; ausente = sin límite). */
  maxTargets?: number;
  /**
   * Cargas de combate (Flujo de maná): empieza el combate con start, máx. max; cada disparo de sus reglas de cargas
   * permanentes gasta 1 (sin cargas, no da nada) y recarga 1 cada every turnos (al empezar el turno del portador).
   */
  charges?: EffectCharges;
  /** Solo una vez por combate (marcador que no caduca en el combate). */
  oncePerCombat?: boolean;
  rules: EffectRule[];
};

/** perTurn: como mucho 1 carga gastada por turno del portador (Flujo de maná). */
export type EffectCharges = { start: number; max: number; every: number; perTurn?: boolean };

export const MAX_EFFECT_RULES = 12;

const label = <T extends { id: string; label: string }>(list: readonly T[], id: string | undefined): string =>
  list.find(entry => entry.id === id)?.label ?? id ?? '';

export const triggerLabel = (id: string | undefined) => label(EFFECT_TRIGGERS, id);
export const scalingLabel = (id: string | undefined) => label(SCALING_STATS, id);
export const damageTypeLabel = (id: string | undefined) => label(DAMAGE_TYPES, id);
export const statLabel = (key: string | undefined): string => STAT_COLUMNS.find(column => column.key === key)?.title ?? key ?? '';

const num = (value: number): string => formatStat(Math.round(value * 1000) / 1000);

/** «100% AD base + 45% AP» (o «5»). */
export function formulaText(rule: Pick<EffectRule, 'flat' | 'ratios' | 'perLevel' | 'levelFrom' | 'dice' | 'missingHpScalePct'>): string {
  const parts: string[] = [];
  if (rule.dice) parts.push(rule.dice);
  if (rule.perLevel?.length) parts.push(`${rule.perLevel.map(num).join('/')} (por nivel${rule.levelFrom === 'target' ? ' del objetivo' : ''})`);
  else if (rule.flat) parts.push(num(rule.flat));
  for (const ratio of rule.ratios ?? []) parts.push(`${num(ratio.pct)}% ${scalingLabel(ratio.stat)}`);
  if (rule.missingHpScalePct) parts.push(`hasta +${num(rule.missingHpScalePct)}% según vida faltante`);
  return parts.join(' + ').replace(/\+ -/g, '− ') || (rule.dice ? rule.dice : '0');
}

const TRIGGER_SHORT: Record<EffectTrigger, string> = {
  always: 'Siempre',
  'on-attack': 'Al auto-atacar',
  'on-hit': 'Al aplicar efecto de impacto',
  'after-ability': 'Tras habilidad (siguiente AA)',
  'after-use': 'Tras usar (siguiente AA)',
  'on-ability-hit': 'Al acertar habilidad',
  'on-use': 'Al usar',
  'on-takedown': 'Al matar/asistir',
  'hp-below': 'Vida < X%',
  'on-damage-taken': 'Al recibir daño',
  'on-attacked': 'Al recibir AA',
  'each-turn': 'Cada turno',
  'energized-max': 'Vigor al máximo',
  'on-ultimate-use': 'Al usar la R',
};

/** Resumen legible de una regla: «Tras habilidad (siguiente AA): +100% AD base físico». */
export function ruleSummary(rule: EffectRule): string {
  const trigger = rule.trigger === 'hp-below' ? `Vida < ${num(rule.hpBelowPct ?? 30)}%` : TRIGGER_SHORT[rule.trigger] ?? rule.trigger;
  const when = rule.onlyIf ? `${trigger} (${rangeConditionShort(rule.onlyIf)})` : trigger;
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
    case 'vigor': what = `+${amount} Vigor`; break;
    case 'extra-on-hit': what = `aplica los efectos de impacto ${rule.count ?? 1} vez${(rule.count ?? 1) === 1 ? '' : 'es'} más`; break;
    case 'damage-reduction': what = `${amount}% menos de daño${rule.vs === 'aa' ? ' de AA' : rule.vs === 'all' ? ' (todo)' : ''}`; break;
    case 'execute': what = `ejecuta si vida < ${num(rule.targetHpBelowPct ?? rule.hpBelowPct ?? 5)}%`; break;
    case 'extra-action': what = `acción extra${rule.action ? ` (${rule.action})` : ''}`; break;
    default: what = rule.kind;
  }
  const extras = [
    rule.permanent ? 'cargas permanentes (ficha)' : rule.duration ? `${rule.duration} t.` : '',
    rule.maxStacks ? `hasta ×${rule.maxStacks}` : '',
    rule.everyN ? `cada ${rule.everyN}` : '',
    rule.perTargetCounter ? 'por objetivo' : '',
    rule.triggerAtMax ? 'al máximo de cargas' : '',
    rule.delayTurns ? `en ${rule.delayTurns} t.` : '',
    rule.spellShield ? 'escudo de hechizos' : '',
    rule.pulseEachTurn ? 'pulso cada turno' : '',
    rule.note ? rule.note : '',
  ].filter(Boolean);
  if (rule.lifeSteal) extras.push('aplica robo de vida');
  const to = rule.appliesTo;
  if (to === 'area') what = `${what.replace(/^al objetivo /, '')} (objetivo + cercanos)`;
  else if (to === 'nearby') what = `${what.replace(/^al objetivo /, '')} (solo cercanos, no el principal)`;
  else if (to === 'allies') what = `${what.replace(/^al objetivo /, '')} (aliados)`;
  else if (to === 'self' && TARGET_DEFAULT_KINDS.includes(rule.kind)) what = `${what} (al portador)`;
  return `${when}: ${what}${extras.length ? ` (${extras.join(', ')})` : ''}`;
}

/** «CD 1 t. (al terminar) · dura 5 t.» */
/** CD del efecto al nivel del portador: el de su tramo (1–5 / 6–10 / 11–15 / 16–20) si tiene CD por nivel; si no, cooldown. */
export function levelCooldown(config: EffectBonusConfig, level: number): number | undefined {
  const list = config.cooldownByLevel;
  if (!list?.length) return config.cooldown;
  return list[Math.min(list.length, milestoneRank(level)) - 1];
}

/** La config con el CD resuelto para ese nivel (el motor sigue leyendo cooldown). */
export const withLevelCooldown = (config: EffectBonusConfig, level: number): EffectBonusConfig =>
  (config.cooldownByLevel?.length ? { ...config, cooldown: levelCooldown(config, level) } : config);

export function configTimingText(config: EffectBonusConfig): string {
  return [
    config.cooldownByLevel?.length ? `CD por nivel ${config.cooldownByLevel.join(' / ')} t. (niveles 1–5 / 6–10 / 11–15 / 16–20)${config.cdStart === 'on-end' ? ' (al terminar)' : ''}`
      : config.cooldown ? `CD ${config.cooldown} t.${config.cdStart === 'on-end' ? ' (al terminar)' : ''}` : '',
    config.duration ? `dura ${config.duration} t.` : '',
    config.abilityDischarge ? 'las habilidades también descargan el Vigor' : '',
    config.chainTargets && config.chainTargets > 1 ? `Vigor al máximo encadena a ${config.chainTargets} objetivos` : '',
    config.perTargetCooldown ? 'CD por objetivo (marca)' : '',
    config.maxTargets ? `hasta ${config.maxTargets} objetivos` : '',
    config.charges ? `cargas de combate: empieza con ${config.charges.start}, máx. ${config.charges.max}, recarga 1 cada ${config.charges.every} t.${config.charges.perTurn ? ', máx. 1 por turno' : ''}` : '',
    config.oncePerCombat ? '1 vez por combate' : '',
  ].filter(Boolean).join(' · ');
}

export function configSummary(config: EffectBonusConfig | undefined): string[] {
  if (!config) return [];
  const timing = configTimingText(config);
  if (config.rules.length === 0) return timing ? [timing] : [];
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
    if (r.appliesTo === 'target' || r.appliesTo === 'area' || r.appliesTo === 'nearby' || r.appliesTo === 'allies' || (r.appliesTo === 'self' && rule.kind === 'status')) rule.appliesTo = r.appliesTo;
    if (r.levelFrom === 'target') rule.levelFrom = 'target';
    if (r.lifeSteal === true) rule.lifeSteal = true;
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
    if (finite(r.targetHpBelowPct)) rule.targetHpBelowPct = r.targetHpBelowPct;
    if (finite(r.healFromDealtPct)) rule.healFromDealtPct = r.healFromDealtPct;
    if (finite(r.fromDamagePct)) rule.fromDamagePct = r.fromDamagePct;
    if (r.vs === 'aa' || r.vs === 'all') rule.vs = r.vs;
    if (typeof r.action === 'string' && r.action.trim()) rule.action = r.action.trim();
    if (typeof r.dice === 'string' && /^\s*\d*d\d+(?:[+-]\d+(?:\.\d+)?)?\s*$/i.test(r.dice)) rule.dice = r.dice.replace(/\s+/g, '');
    if (finite(r.everyN) && r.everyN >= 2) rule.everyN = Math.min(99, Math.floor(r.everyN));
    if (r.perTargetCounter === true) rule.perTargetCounter = true;
    if (finite(r.missingHpScalePct)) rule.missingHpScalePct = r.missingHpScalePct;
    if (r.triggerAtMax === true) rule.triggerAtMax = true;
    if (r.requiresMaxStacks === true) rule.requiresMaxStacks = true;
    const delayTurns = turns(r.delayTurns);
    if (delayTurns) rule.delayTurns = delayTurns;
    if (finite(r.halfAfterTurns) && r.halfAfterTurns >= 1) rule.halfAfterTurns = Math.min(99, Math.floor(r.halfAfterTurns));
    if (finite(r.fromManaSpentPct)) rule.fromManaSpentPct = r.fromManaSpentPct;
    if (finite(r.critPotencyPct)) rule.critPotencyPct = r.critPotencyPct;
    if (r.pulseEachTurn === true) rule.pulseEachTurn = true;
    if (r.spellShield === true) rule.spellShield = true;
    if (r.cooldownOnProc === true) rule.cooldownOnProc = true;
    if (finite(r.unseenTurns) && r.unseenTurns >= 1) rule.unseenTurns = Math.min(99, Math.floor(r.unseenTurns));
    if (finite(r.armedTurnsAfterSeen) && r.armedTurnsAfterSeen >= 1) rule.armedTurnsAfterSeen = Math.min(99, Math.floor(r.armedTurnsAfterSeen));
    if (finite(r.auraRange) && r.auraRange >= 1) rule.auraRange = Math.min(20, Math.floor(r.auraRange));
    if (finite(r.damageAmpPct)) rule.damageAmpPct = r.damageAmpPct;
    const duration = turns(r.duration);
    if (duration) rule.duration = duration;
    const maxStacks = finite(r.maxStacks) && r.maxStacks >= 1 ? Math.min(999, Math.floor(r.maxStacks)) : undefined;
    if (maxStacks) rule.maxStacks = maxStacks;
    if (r.permanent === true && (rule.kind === 'stat' || rule.kind === 'attack-speed' || rule.kind === 'move-speed')) rule.permanent = true;
    if (r.onlyIf === 'melee' || r.onlyIf === 'ranged') rule.onlyIf = r.onlyIf;
    if (typeof r.note === 'string' && r.note.trim()) rule.note = r.note.trim();
    rules.push(rule);
  }
  const config: EffectBonusConfig = { rules };
  const cooldown = turns(source.cooldown);
  if (cooldown) config.cooldown = cooldown;
  if (Array.isArray(source.cooldownByLevel)) {
    const list = source.cooldownByLevel.map(turns).filter((n): n is number => n !== undefined).slice(0, 4);
    if (list.length) config.cooldownByLevel = list;
  }
  const duration = turns(source.duration);
  if (duration) config.duration = duration;
  if (source.cdStart === 'on-end' || source.cdStart === 'on-activate') config.cdStart = source.cdStart;
  if (source.abilityDischarge === true) config.abilityDischarge = true;
  if (source.perTargetCooldown === true) config.perTargetCooldown = true;
  if (finite(source.maxTargets) && source.maxTargets >= 1) config.maxTargets = Math.min(20, Math.floor(source.maxTargets));
  if (finite(source.chainTargets) && source.chainTargets > 1) config.chainTargets = Math.min(10, Math.floor(source.chainTargets));
  if (source.oncePerCombat === true) config.oncePerCombat = true;
  if (source.charges && typeof source.charges === 'object') {
    const c = source.charges as Record<string, unknown>;
    const max = turns(c.max);
    const every = turns(c.every);
    if (max && every) config.charges = { start: finite(c.start) ? Math.max(0, Math.min(max, Math.floor(c.start))) : max, max, every, ...(c.perTurn === true ? { perTurn: true } : {}) };
  }
  return config;
}

/** Estado de una regla que el combate aplica solo (el resto se apunta a mano). */
export const AUTOMATED_TRIGGERS: readonly EffectTrigger[] = ['always', 'on-attack', 'on-hit', 'after-ability', 'after-use', 'on-ability-hit', 'on-use', 'on-takedown', 'hp-below', 'on-damage-taken', 'on-attacked', 'each-turn', 'energized-max', 'on-ultimate-use'];
