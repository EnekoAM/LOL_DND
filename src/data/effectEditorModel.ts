import { LOL_SCALE_KINDS, type EffectBonusConfig, type EffectRule } from './effectBonus';

/**
 * Modelo del editor de efectos (sin React, para poder probarlo): que campos tienen sentido segun el
 * \u00abCu\u00e1ndo\u00bb / \u00abQu\u00e9\u00bb, los selectores que juntan varios campos guardados y los avisos de incoherencias.
 * Se guarda la misma forma de siempre (EffectBonusConfig): el combate no cambia.
 */

export const FORMULA_KINDS: readonly string[] = ['stat', 'damage', 'heal', 'shield', 'temp-hp', 'mana', 'attack-speed', 'move-speed', 'vigor', 'damage-reduction'];
export const STACK_KINDS: readonly string[] = ['stat', 'attack-speed', 'move-speed'];

type RuleKey = keyof EffectRule;

/** \u00bfTiene valor guardado? (false / '' / [] cuentan como vac\u00edo). */
export const hasValue = (value: unknown): boolean =>
  value !== undefined && value !== null && value !== '' && value !== false && !(Array.isArray(value) && value.length === 0);

/** \u00bfEl campo se usa en combate con este \u00abCu\u00e1ndo\u00bb / \u00abQu\u00e9\u00bb? */
export function ruleFieldApplies(field: RuleKey, rule: Pick<EffectRule, 'trigger' | 'kind'>): boolean {
  const kind = rule.kind;
  switch (field) {
    case 'hpBelowPct': return rule.trigger === 'hp-below' || kind === 'execute';
    case 'targetHpBelowPct': return kind === 'execute' || kind === 'status' || kind === 'damage';
    // critPotencyPct no va aqui: lo lee itemCombatHooks por id (Llamasombria es un estado).
    case 'lifeSteal': case 'healFromDealtPct': case 'missingHpScalePct': case 'pulseEachTurn': case 'damageType':
      return kind === 'damage';
    // Dados: da\u00f1o y Bonus de stat (AD / AP del LoL con la tabla de dados).
    case 'dice': case 'lolDice': return kind === 'damage' || kind === 'stat';
    case 'fromDamagePct': case 'fromManaSpentPct': return kind === 'heal' || kind === 'mana';
    case 'vs': return kind === 'damage-reduction';
    case 'action': return kind === 'extra-action';
    case 'slowPct': return kind === 'slow';
    case 'statusName': case 'spellShield': return kind === 'status';
    case 'count': return kind === 'extra-on-hit';
    case 'stat': return kind === 'stat';
    case 'halfAfterTurns': return kind === 'shield';
    case 'healOverTurns': return kind === 'heal';
    case 'lolScale': return LOL_SCALE_KINDS.includes(kind);
    case 'permanent': return STACK_KINDS.includes(kind);
    case 'flat': case 'ratios': case 'perLevel': case 'levelFrom': return FORMULA_KINDS.includes(kind);
    case 'auraRange': return false;
    default: return true;
  }
}

/** Tabla AD / AP del LoL de la regla: Bonus de stat AD / AP, o da\u00f1o (m\u00e1gico = AP; f\u00edsico / verdadero = AD). */
export function lolDiceStatOfRule(rule: Pick<EffectRule, 'kind' | 'stat' | 'damageType'>): 'ad' | 'ap' | null {
  if (rule.kind === 'stat') return rule.stat === 'ad' || rule.stat === 'ap' ? rule.stat : null;
  if (rule.kind === 'damage') return rule.damageType === 'magic' ? 'ap' : 'ad';
  return null;
}

/** Se ve si sirve para este \u00abQu\u00e9\u00bb o si ya tiene un valor guardado (as\u00ed no se pierde nada de lo antiguo). */
export const ruleFieldVisible = (field: RuleKey, rule: EffectRule): boolean =>
  ruleFieldApplies(field, rule) || hasValue(rule[field]);

const RULE_KEYS: RuleKey[] = ['lolScale', 'lolDice', 'healOverTurns', 'hpBelowPct', 'targetHpBelowPct', 'lifeSteal', 'healFromDealtPct', 'dice', 'missingHpScalePct', 'pulseEachTurn', 'damageType', 'fromDamagePct', 'fromManaSpentPct', 'vs', 'action', 'slowPct', 'statusName', 'spellShield', 'count', 'stat', 'halfAfterTurns', 'permanent', 'flat', 'ratios', 'perLevel', 'levelFrom', 'auraRange'];

/** Al cambiar \u00abCu\u00e1ndo\u00bb o \u00abQu\u00e9\u00bb: se quitan los campos que ya no se usan (lo oculto no se guarda). */
export function dropUnusedFields(rule: EffectRule): EffectRule {
  const next: EffectRule = { ...rule };
  for (const key of RULE_KEYS) if (!ruleFieldApplies(key, next)) delete (next as Record<string, unknown>)[key];
  return next;
}

/* ---------- Cuerpo a cuerpo / distancia (onlyIf + rangedPct) ---------- */

export type RangeMode = 'any' | 'melee' | 'ranged' | 'ranged-pct';

export const RANGE_MODES: { id: RangeMode; label: string }[] = [
  { id: 'any', label: 'Igual para todos' },
  { id: 'melee', label: 'Solo cuerpo a cuerpo' },
  { id: 'ranged', label: 'Solo a distancia' },
  { id: 'ranged-pct', label: 'A distancia, al X % del valor' },
];

export function rangeModeOf(rule: Pick<EffectRule, 'onlyIf' | 'rangedPct'>): RangeMode {
  if (rule.onlyIf === 'melee') return 'melee';
  if (rule.onlyIf === 'ranged') return 'ranged';
  return rule.rangedPct != null ? 'ranged-pct' : 'any';
}

export function withRangeMode(rule: EffectRule, mode: RangeMode): EffectRule {
  const next: EffectRule = { ...rule };
  delete next.onlyIf;
  delete next.rangedPct;
  if (mode === 'melee' || mode === 'ranged') next.onlyIf = mode;
  if (mode === 'ranged-pct') next.rangedPct = rule.rangedPct ?? 75;
  return next;
}

/* ---------- Valor: fijo / por nivel / dados ---------- */

export type ValueMode = 'flat' | 'level' | 'dice';

/** \u00abDe X a Y (lineal)\u00bb: 20 valores del nivel 1 al 20 (con decimals decimales; LoL: enteros). */
export function linearLevels(from: number, to: number, decimals = 2): number[] {
  const f = 10 ** decimals;
  return Array.from({ length: 20 }, (_, i) => Math.round((from + ((to - from) * i) / 19) * f) / f);
}

export function valueModeOf(rule: Pick<EffectRule, 'dice' | 'perLevel'>): ValueMode {
  if (rule.dice) return 'dice';
  return rule.perLevel?.length ? 'level' : 'flat';
}

/** Cambia el modo: fijo quita nivel y dados; por nivel quita el fijo y los dados; dados quita el nivel (el fijo se suma a la tirada). */
export function withValueMode(rule: EffectRule, mode: ValueMode): EffectRule {
  const next: EffectRule = { ...rule };
  if (mode !== 'level') { delete next.perLevel; delete next.levelFrom; }
  if (mode !== 'dice') delete next.dice;
  if (mode === 'level') delete next.flat;
  return next;
}

/* ---------- Cu\u00e1ndo empieza el CD (cdStart + \u00abCD al proc\u00bb de una regla) ---------- */

export type CdStartChoice = 'on-activate' | 'on-end' | 'on-break' | `proc:${number}`;

/** \u00abproc:N\u00bb = el CD empieza cuando se aplica la regla N (se guarda como cooldownOnProc en esa regla). */
export function cdStartChoiceOf(config: Pick<EffectBonusConfig, 'cdStart' | 'rules'>): CdStartChoice {
  const proc = config.rules.findIndex(rule => rule.cooldownOnProc);
  if (proc >= 0) return `proc:${proc + 1}`;
  return config.cdStart ?? 'on-activate';
}

export function withCdStartChoice(config: EffectBonusConfig, choice: CdStartChoice): EffectBonusConfig {
  const procIndex = choice.startsWith('proc:') ? Number(choice.slice(5)) - 1 : -1;
  const rules = config.rules.map((rule, index) => {
    if (index === procIndex) return { ...rule, cooldownOnProc: true };
    if (!rule.cooldownOnProc) return rule;
    const next = { ...rule };
    delete next.cooldownOnProc;
    return next;
  });
  const next: EffectBonusConfig = { ...config, rules };
  if (procIndex >= 0 || choice === 'on-activate') {
    if (choice === 'on-activate' && config.cdStart === 'on-activate') next.cdStart = 'on-activate';
    else delete next.cdStart;
  } else {
    next.cdStart = choice as EffectBonusConfig['cdStart'];
  }
  return next;
}

/* ---------- Guardar ---------- */

const dropEmpty = <T extends object>(value: T): T =>
  Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;

/** Lo que se manda al guardar: misma forma de siempre, sin \u00abAura\u00bb (no la usa el combate) ni escalados a 0. */
export function serializeConfig(config: EffectBonusConfig): EffectBonusConfig {
  const rules = config.rules.map(rule => {
    const next: EffectRule = { ...rule };
    delete next.auraRange;
    if (next.ratios) next.ratios = next.ratios.filter(ratio => ratio.pct);
    return dropEmpty(next);
  });
  return dropEmpty({ ...config, rules });
}

/* ---------- Avisos ---------- */

export const FIELD_LABEL: Partial<Record<RuleKey, string>> = {
  hpBelowPct: 'Vida del portador por debajo de %',
  targetHpBelowPct: 'Solo si el objetivo tiene menos de % de vida',
  lifeSteal: 'Aplica robo de vida',
  healFromDealtPct: 'Cura % del da\u00f1o hecho',
  dice: 'Dados',
  missingHpScalePct: 'Hasta +% seg\u00fan la vida que le falta al objetivo',
  critPotencyPct: 'Cr\u00edtico al % de potencia',
  pulseEachTurn: 'Se repite cada turno',
  damageType: 'Tipo de da\u00f1o',
  fromDamagePct: '% del da\u00f1o',
  fromManaSpentPct: '% del coste de la habilidad',
  vs: 'Contra',
  action: 'Acci\u00f3n',
  slowPct: 'Ralentizaci\u00f3n %',
  statusName: 'Nombre del estado',
  spellShield: 'Es un escudo de hechizos',
  count: 'Veces extra',
  stat: 'Estad\u00edstica',
  halfAfterTurns: 'El escudo baja a la mitad tras N turnos',
  healOverTurns: 'Repartir en N turnos',
  lolScale: 'Valor del LoL (\u00f710)',
  lolDice: 'AD / AP del LoL (tabla de dados)',
  permanent: 'Cargas permanentes',
  flat: 'Valor fijo',
  ratios: 'Escalados',
  perLevel: 'Valor por nivel',
  levelFrom: 'Nivel del objetivo',
  auraRange: 'Aura (casillas)',
};

export function ruleWarnings(rule: EffectRule, config: EffectBonusConfig, kindLabel: string): string[] {
  const out: string[] = [];
  for (const key of RULE_KEYS) {
    if (!ruleFieldApplies(key, rule) && hasValue(rule[key])) out.push(`\u00ab${FIELD_LABEL[key] ?? key}\u00bb no se usa con \u00abQu\u00e9 hace: ${kindLabel}\u00bb. Qu\u00edtalo o cambia el tipo.`);
  }
  if (rule.onlyIf && rule.rangedPct != null) out.push(`Con \u00absolo ${rule.onlyIf === 'melee' ? 'cuerpo a cuerpo' : 'a distancia'}\u00bb el \u00ab% a distancia\u00bb no se usa.`);
  if (rule.kind === 'stat' && !rule.stat) out.push('Elige qu\u00e9 estad\u00edstica sube.');
  if (rule.kind === 'status' && !rule.statusName) out.push('Ponle nombre al estado.');
  if (rule.triggerAtMax && !rule.maxStacks) out.push('\u00abSolo al llegar al m\u00e1ximo\u00bb necesita un m\u00e1ximo de acumulaciones.');
  if (rule.perTargetCounter && !rule.everyN && !rule.maxStacks) out.push('\u00abCuenta por objetivo\u00bb necesita \u00abCada N veces\u00bb o un m\u00e1ximo de acumulaciones.');
  if (rule.requiresMaxStacks && !config.rules.some(other => other !== rule && other.maxStacks)) out.push('\u00abRequiere el m\u00e1ximo de otra regla\u00bb necesita otra regla con m\u00e1ximo de acumulaciones.');
  if (rule.duration != null && (rule.duration === 0 || rule.duration < -1 || !Number.isInteger(rule.duration))) out.push('Duraci\u00f3n no v\u00e1lida: pon 1 o m\u00e1s turnos, o -1 (\u00abHasta el final del combate\u00bb). 0 no es infinito: se ignora y usa la del efecto.');
  if (rule.healOverTurns != null && (!Number.isInteger(rule.healOverTurns) || rule.healOverTurns < 2 || rule.healOverTurns > 20)) out.push('\u00abRepartir en N turnos\u00bb: pon de 2 a 20 turnos.');
  if (rule.healOverTurns != null && rule.delayTurns) out.push('Con \u00abRepartir en N turnos\u00bb no se usa \u00abSe aplica dentro de (turnos)\u00bb.');
  if (rule.healOverTurns != null && (rule.fromDamagePct || rule.fromManaSpentPct)) out.push('\u00abRepartir en N turnos\u00bb no vale con la cura por % del da\u00f1o o del man\u00e1: se cura de golpe.');
  if (rule.permanent && rule.duration != null) out.push('Las cargas permanentes no caducan: la duraci\u00f3n no se usa.');
  if (rule.duration != null && config.duration != null && rule.duration === config.duration) out.push('La duraci\u00f3n propia es igual que la del efecto: sobra.');
  if (FORMULA_KINDS.includes(rule.kind) && !rule.flat && !rule.ratios?.some(ratio => ratio.pct) && !rule.perLevel?.length && !rule.dice && !rule.fromDamagePct && !rule.fromManaSpentPct) {
    out.push('Falta el valor (fijo, por nivel, dados o un escalado).');
  }
  return out;
}

export function configWarnings(config: EffectBonusConfig): string[] {
  const out: string[] = [];
  const hasCd = !!config.cooldown || !!config.cooldownByLevel?.length;
  const choice = cdStartChoiceOf(config);
  if (config.perTargetCooldown && !hasCd) out.push('\u00abEnfriamiento por objetivo\u00bb necesita turnos de enfriamiento.');
  if (choice !== 'on-activate' && !hasCd) out.push('Elegiste cu\u00e1ndo empieza el enfriamiento, pero no hay turnos de enfriamiento.');
  if (config.duration != null && (config.duration === 0 || config.duration < -1 || !Number.isInteger(config.duration))) out.push('Duraci\u00f3n del efecto no v\u00e1lida: pon 1 o m\u00e1s turnos, o -1 (\u00abHasta el final del combate\u00bb). 0 no es infinito: se ignora.');
  if (config.cdStart === 'on-end' && config.duration === -1) out.push('\u00abAl terminar el efecto\u00bb con duraci\u00f3n -1: el efecto no termina en el combate; el CD se pone ya al activarse.');
  if (config.cdStart === 'on-end' && !config.duration) out.push('\u00abAl terminar el efecto\u00bb necesita una duraci\u00f3n del efecto.');
  if (config.cdStart === 'on-break' && !config.rules.some(rule => rule.spellShield)) out.push('\u00abAl romperse el escudo de hechizos\u00bb necesita una regla con escudo de hechizos.');
  if (config.charges && (!config.charges.max || !config.charges.every)) out.push('Usos recargables: faltan el m\u00e1ximo o cada cu\u00e1ntos turnos se recarga.');
  return out;
}
